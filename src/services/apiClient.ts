/**
 * Resilient API Client with Rate Limiting, Circuit Breaker, Retries, Timeouts,
 * In-Flight GET Request Deduplication, and Optional Response Caching.
 * Points 01, 02, 03, 07, 08, 18
 */
import { auth } from '../firebase/config';
import { appCache } from '../utils/cacheManager';

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  serviceName?: string;
  skipCircuitBreaker?: boolean;
  deduplicateGet?: boolean;
  cacheTtlMs?: number;
}

// Circuit Breaker State per service
interface CircuitBreakerState {
  failures: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  nextAttemptTime: number;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();
const inFlightGetRequests = new Map<string, Promise<{ data: any; error: Error | null; status: number }>>();
const FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_TIMEOUT_MS = 30000; // 30s pause before half-open

function getCircuitBreaker(service: string): CircuitBreakerState {
  let cb = circuitBreakers.get(service);
  if (!cb) {
    cb = { failures: 0, state: 'CLOSED', nextAttemptTime: 0 };
    circuitBreakers.set(service, cb);
  }
  return cb;
}

function checkCircuit(service: string): boolean {
  const cb = getCircuitBreaker(service);
  const now = Date.now();

  if (cb.state === 'OPEN') {
    if (now > cb.nextAttemptTime) {
      cb.state = 'HALF_OPEN';
      return true;
    }
    return false; // Circuit is OPEN: reject request immediately to prevent wasted calls/costs
  }

  return true;
}

function recordSuccess(service: string) {
  const cb = getCircuitBreaker(service);
  cb.failures = 0;
  cb.state = 'CLOSED';
}

function recordFailure(service: string) {
  const cb = getCircuitBreaker(service);
  cb.failures += 1;
  if (cb.failures >= FAILURE_THRESHOLD) {
    cb.state = 'OPEN';
    cb.nextAttemptTime = Date.now() + CIRCUIT_RESET_TIMEOUT_MS;
    console.warn(`[CIRCUIT BREAKER] Service "${service}" a dépassé le seuil d'échecs (${FAILURE_THRESHOLD}). Circuit OUVERT pour 30s.`);
  }
}

/**
 * Report error to central audit logging
 * Point 18: Centralized error trace
 */
export async function logErrorToRemote(payload: {
  message: string;
  source?: string;
  stack?: string;
  details?: any;
}): Promise<void> {
  try {
    if (!auth.currentUser) return;
    const token = await auth.currentUser.getIdToken();
    await fetch('/api/logs/error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }),
    });
  } catch {
    // Fail silently so logging never crashes the app
  }
}

async function executeResilientFetch<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<{ data: T | null; error: Error | null; status: number }> {
  const {
    timeoutMs = 8000,
    maxRetries = 2,
    retryDelayMs = 400,
    serviceName = 'api',
    skipCircuitBreaker = false,
    deduplicateGet: _dedup,
    cacheTtlMs: _ttl,
    signal: callerSignal,
    ...fetchOptions
  } = options;

  // 1. Check Circuit Breaker (Point 02 & Point 08)
  if (!skipCircuitBreaker && !checkCircuit(serviceName)) {
    const err = new Error(`Le service ${serviceName} est temporairement indisponible (Circuit Breaker actif pour préserver le quota).`);
    return { data: null, error: err, status: 503 };
  }

  let attempt = 0;
  let lastError: Error | null = null;
  let lastStatus = 0;

  while (attempt <= maxRetries) {
    if (callerSignal?.aborted) {
      return { data: null, error: new Error('Requête annulée par le client.'), status: 499 };
    }

    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = () => controller.abort();
    if (callerSignal) {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
      lastStatus = response.status;

      // Handle server error retry condition (429 Too Many Requests, or 502/503/504)
      if (!response.ok) {
        if ((response.status >= 500 || response.status === 429) && attempt <= maxRetries) {
          const delay = retryDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        let errorDetails = '';
        try {
          const errJson = await response.json();
          errorDetails = errJson.message || errJson.error || JSON.stringify(errJson);
        } catch {
          errorDetails = await response.text();
        }

        const err = new Error(errorDetails || `Erreur HTTP ${response.status}`);
        recordFailure(serviceName);
        return { data: null, error: err, status: response.status };
      }

      recordSuccess(serviceName);
      const data = await response.json();
      return { data, error: null, status: response.status };

    } catch (err: any) {
      clearTimeout(timeoutId);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);

      if (callerSignal?.aborted) {
        return { data: null, error: new Error('Requête annulée par le client.'), status: 499 };
      }

      if (err.name === 'AbortError') {
        lastError = new Error(`Délai d'attente dépassé (${timeoutMs}ms) pour ${url}`);
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      // Retry network or timeout errors
      if (attempt <= maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  recordFailure(serviceName);
  logErrorToRemote({
    message: lastError?.message || 'Échec de requête réseau',
    source: serviceName,
    details: { url, attempts: attempt },
  });

  return {
    data: null,
    error: lastError || new Error('Échec après plusieurs tentatives'),
    status: lastStatus || 500,
  };
}

/**
 * Robust fetch with Timeout (AbortController), Exponential Backoff Retries,
 * In-flight GET deduplication, and optional TTL response cache.
 */
export async function resilientFetch<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<{ data: T | null; error: Error | null; status: number }> {
  const method = String(options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const shouldDedup = options.deduplicateGet ?? isGet;
  const cacheTtlMs = options.cacheTtlMs ?? 0;
  const cacheKey = `http_get_${url}`;

  if (isGet && cacheTtlMs > 0) {
    const cached = appCache.get<T>(cacheKey);
    if (cached !== null) {
      return { data: cached, error: null, status: 200 };
    }
  }

  if (isGet && shouldDedup && !options.signal) {
    const existing = inFlightGetRequests.get(url);
    if (existing) {
      return existing as Promise<{ data: T | null; error: Error | null; status: number }>;
    }
    const promise = executeResilientFetch<T>(url, options)
      .then((res) => {
        if (!res.error && res.data !== null && cacheTtlMs > 0) {
          appCache.set<T>(cacheKey, res.data, cacheTtlMs);
        }
        return res;
      })
      .finally(() => {
        inFlightGetRequests.delete(url);
      });
    inFlightGetRequests.set(url, promise);
    return promise;
  }

  const result = await executeResilientFetch<T>(url, options);
  if (isGet && !result.error && result.data !== null && cacheTtlMs > 0) {
    appCache.set<T>(cacheKey, result.data, cacheTtlMs);
  }
  return result;
}
