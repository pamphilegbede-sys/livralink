/**
 * Server-side L1 Cache (LRU + TTL + In-flight Deduplication) &
 * OpenTelemetry-style Performance / Web Vitals RUM Observability Tracker.
 */

export interface CacheStatsSnapshot {
  name: string;
  size: number;
  maxEntries: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRatePercent: number;
}

interface LruEntry<V> {
  value: V;
  expiresAt: number;
}

export class LruTtlCache<V = unknown> {
  private readonly name: string;
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private readonly store = new Map<string, LruEntry<V>>();
  private readonly inFlight = new Map<string, Promise<V>>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: { name: string; maxEntries?: number; defaultTtlMs?: number }) {
    this.name = options.name;
    this.maxEntries = Math.max(10, options.maxEntries ?? 250);
    this.defaultTtlMs = Math.max(500, options.defaultTtlMs ?? 30_000);
  }

  get(key: string, nowMs = Date.now()): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (nowMs >= entry.expiresAt) {
      this.store.delete(key);
      this.misses += 1;
      return undefined;
    }
    // Promote to MRU (Map preserves insertion order)
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  set(key: string, value: V, ttlMs = this.defaultTtlMs, nowMs = Date.now()): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
        this.evictions += 1;
      }
    }
    this.store.set(key, {
      value,
      expiresAt: nowMs + Math.max(100, ttlMs),
    });
  }

  async getOrLoad(key: string, loader: () => Promise<V>, ttlMs = this.defaultTtlMs): Promise<{ value: V; cacheStatus: 'hit' | 'miss' | 'coalesced' }> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return { value: cached, cacheStatus: 'hit' };
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      const value = await pending;
      return { value, cacheStatus: 'coalesced' };
    }

    const loadPromise = loader()
      .then((val) => {
        this.set(key, val, ttlMs);
        return val;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, loadPromise);
    const value = await loadPromise;
    return { value, cacheStatus: 'miss' };
  }

  delete(key: string): boolean {
    this.inFlight.delete(key);
    return this.store.delete(key);
  }

  invalidatePrefix(prefix: string): number {
    let removed = 0;
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
        removed += 1;
      }
    }
    for (const k of this.inFlight.keys()) {
      if (k.startsWith(prefix)) {
        this.inFlight.delete(k);
      }
    }
    return removed;
  }

  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }

  getStats(): CacheStatsSnapshot {
    const total = this.hits + this.misses;
    return {
      name: this.name,
      size: this.store.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRatePercent: total > 0 ? Math.round((this.hits / total) * 1000) / 10 : 0,
    };
  }
}

export interface RouteTimingSample {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
}

export interface WebVitalRumSample {
  name: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  view?: string;
  connectionType?: string;
  recordedAt: string;
}

const MAX_LATENCY_SAMPLES = 500;
const MAX_SLOW_SAMPLES = 40;
const MAX_RUM_SAMPLES = 200;
const SLOW_REQUEST_THRESHOLD_MS = 200;

export function normalizeObservabilityRoute(rawPath: string): string {
  const pathOnly = String(rawPath || '/').split('?')[0];
  return pathOnly
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
    .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:id')
    .replace(/\/LL-[A-Za-z0-9_-]+(?=\/|$)/gi, '/:orderId')
    .slice(0, 120);
}

export function computePercentile(sortedAsc: number[], percentile: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sortedAsc.length) - 1)
  );
  return Math.round(sortedAsc[idx] * 100) / 100;
}

class ServerObservabilityTracker {
  private readonly samples: RouteTimingSample[] = [];
  private readonly slowRequests: RouteTimingSample[] = [];
  private readonly rumSamples: WebVitalRumSample[] = [];
  private totalRequests = 0;
  private totalErrors5xx = 0;
  private lastCpuUsage = process.cpuUsage();
  private lastCpuSampleTime = Date.now();

  recordRequest(sample: Omit<RouteTimingSample, 'timestamp'>): void {
    this.totalRequests += 1;
    if (sample.statusCode >= 500) {
      this.totalErrors5xx += 1;
    }
    const entry: RouteTimingSample = {
      ...sample,
      route: normalizeObservabilityRoute(sample.route),
      durationMs: Math.round(sample.durationMs * 100) / 100,
      timestamp: new Date().toISOString(),
    };
    this.samples.push(entry);
    if (this.samples.length > MAX_LATENCY_SAMPLES) {
      this.samples.shift();
    }
    if (entry.durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
      this.slowRequests.unshift(entry);
      if (this.slowRequests.length > MAX_SLOW_SAMPLES) {
        this.slowRequests.pop();
      }
    }
  }

  recordRumSample(sample: Omit<WebVitalRumSample, 'recordedAt'>): void {
    this.rumSamples.push({
      ...sample,
      recordedAt: new Date().toISOString(),
    });
    if (this.rumSamples.length > MAX_RUM_SAMPLES) {
      this.rumSamples.shift();
    }
  }

  getSummary(extraCaches: CacheStatsSnapshot[] = []) {
    const durations = this.samples.map((s) => s.durationMs).sort((a, b) => a - b);
    const avgMs =
      durations.length > 0
        ? Math.round((durations.reduce((acc, v) => acc + v, 0) / durations.length) * 100) / 100
        : 0;

    // Group per route for top slow routes
    const routeGroups = new Map<string, number[]>();
    for (const s of this.samples) {
      const key = `${s.method} ${s.route}`;
      const arr = routeGroups.get(key);
      if (arr) arr.push(s.durationMs);
      else routeGroups.set(key, [s.durationMs]);
    }
    const topRoutes = Array.from(routeGroups.entries())
      .map(([route, vals]) => {
        const sorted = [...vals].sort((a, b) => a - b);
        return {
          route,
          count: sorted.length,
          p50Ms: computePercentile(sorted, 50),
          p95Ms: computePercentile(sorted, 95),
          maxMs: sorted[sorted.length - 1] || 0,
        };
      })
      .sort((a, b) => b.p95Ms - a.p95Ms)
      .slice(0, 12);

    // Aggregate Web Vitals RUM
    const vitalsByMetric: Record<string, { count: number; p75: number; goodPercent: number }> = {};
    for (const metric of ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const) {
      const matching = this.rumSamples.filter((r) => r.name === metric);
      if (matching.length > 0) {
        const sorted = matching.map((m) => m.value).sort((a, b) => a - b);
        const goodCount = matching.filter((m) => m.rating === 'good').length;
        vitalsByMetric[metric] = {
          count: matching.length,
          p75: computePercentile(sorted, 75),
          goodPercent: Math.round((goodCount / matching.length) * 100),
        };
      }
    }

    const mem = process.memoryUsage();
    const now = Date.now();
    const elapsedMs = Math.max(1, now - this.lastCpuSampleTime);
    const cpuDelta = process.cpuUsage(this.lastCpuUsage);
    const cpuPercent =
      Math.round(((cpuDelta.user + cpuDelta.system) / 1000 / elapsedMs) * 1000) / 10;
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuSampleTime = now;

    return {
      generatedAt: new Date().toISOString(),
      requests: {
        totalRecorded: this.totalRequests,
        windowSize: this.samples.length,
        errors5xx: this.totalErrors5xx,
        errorRatePercent:
          this.totalRequests > 0
            ? Math.round((this.totalErrors5xx / this.totalRequests) * 10000) / 100
            : 0,
        latencyMs: {
          avg: avgMs,
          p50: computePercentile(durations, 50),
          p95: computePercentile(durations, 95),
          p99: computePercentile(durations, 99),
        },
        slowThresholdMs: SLOW_REQUEST_THRESHOLD_MS,
        slowRequests: this.slowRequests.slice(0, 15),
        topRoutes,
      },
      rumWebVitals: {
        samplesCount: this.rumSamples.length,
        metrics: vitalsByMetric,
      },
      caches: extraCaches,
      runtime: {
        uptimeSeconds: Math.round(process.uptime()),
        rssMB: Math.round(mem.rss / (1024 * 1024)),
        heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotalMB: Math.round(mem.heapTotal / (1024 * 1024)),
        cpuApproxPercent: cpuPercent,
        nodeVersion: process.version,
      },
    };
  }

  resetForTests(): void {
    this.samples.length = 0;
    this.slowRequests.length = 0;
    this.rumSamples.length = 0;
    this.totalRequests = 0;
    this.totalErrors5xx = 0;
  }
}

export const serverObservability = new ServerObservabilityTracker();

export const serverApiResponseCache = new LruTtlCache<any>({
  name: 'server-api-l1',
  maxEntries: 200,
  defaultTtlMs: 20_000,
});
