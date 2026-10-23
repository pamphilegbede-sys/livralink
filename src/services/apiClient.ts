/**
 * Resilient API Client with Rate Limiting, Circuit Breaker, Retries, and Timeouts
 * Points 01, 02, 03, 07, 08, 18
 */

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  serviceName?: string;
  skipCircuitBreaker?: boolean;
}

// Circuit Breaker State per service
interface CircuitBreakerState {
  failures: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  nextAttemptTime: number;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();
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
    await fetch('/api/logs/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

/**
 * Robust fetch with Timeout (AbortController) and Exponential Backoff Retries
 * Handles network failures, timeouts, and 5xx/429 status codes.
 */
export async function resilientFetch<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<{ data: T | null; error: Error | null; status: number }> {
  const {
    timeoutMs = 8000,
    maxRetries = 2,
    retryDelayMs = 400,
    serviceName = 'api',
    skipCircuitBreaker = false,
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
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
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
