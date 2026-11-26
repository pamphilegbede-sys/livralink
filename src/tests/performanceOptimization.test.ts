import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';

import {
  LruTtlCache,
  computePercentile,
  normalizeObservabilityRoute,
  serverObservability,
} from '../server/performanceCache';
import {
  loadPlatformConfigBundle,
  savePlatformConfigSection,
  invalidatePlatformConfigCache,
  getPlatformConfigCacheStats,
  DbLike,
} from '../server/platformConfigService';
import { CacheManager } from '../utils/cacheManager';
import { computeVirtualWindow } from '../components/common/VirtualList';
import { rateWebVital } from '../utils/webVitalsRum';
import { resolvePreferredImageMimeType } from '../utils/fileCompressor';
import { resilientFetch } from '../services/apiClient';

async function startTestServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const { app } = await import('../../server');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

test('LruTtlCache enforces bounded capacity, LRU eviction, TTL expiration, and concurrent coalescing', async () => {
  const cache = new LruTtlCache<string>({ name: 'unit-lru', maxEntries: 10, defaultTtlMs: 5000 });

  for (let i = 0; i < 12; i++) {
    cache.set(`k:${i}`, `v:${i}`, 5000, 1000 + i);
  }
  assert.equal(cache.getStats().size, 10);
  assert.equal(cache.getStats().evictions, 2);
  // k:0 and k:1 evicted as LRU
  assert.equal(cache.get('k:0', 2000), undefined);
  assert.equal(cache.get('k:1', 2000), undefined);
  assert.equal(cache.get('k:2', 2000), 'v:2');

  // TTL expiration
  cache.set('short', 'expiring', 500, 10_000);
  assert.equal(cache.get('short', 10_400), 'expiring');
  assert.equal(cache.get('short', 10_600), undefined);

  // Prefix invalidation
  cache.set('orders:a', '1');
  cache.set('orders:b', '2');
  cache.set('users:a', '3');
  const removed = cache.invalidatePrefix('orders:');
  assert.equal(removed, 2);
  assert.equal(cache.get('orders:a'), undefined);
  assert.equal(cache.get('users:a'), '3');

  // Concurrent getOrLoad coalescing invokes loader strictly once
  let loaderCalls = 0;
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      cache.getOrLoad('coalesce-key', async () => {
        loaderCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return 'shared-result';
      })
    )
  );
  assert.equal(loaderCalls, 1);
  assert.equal(results.filter((r) => r.cacheStatus === 'miss').length, 1);
  assert.equal(results.filter((r) => r.cacheStatus === 'coalesced').length, 7);
  assert.ok(results.every((r) => r.value === 'shared-result'));
});

test('PlatformConfig WeakMap L1 cache accelerates reads, coalesces concurrency, invalidates on write, and isolates DBs', async () => {
  let db1Reads = 0;
  let storedBaseFee = 750;
  const mockDb1: DbLike = {
    collection: () => ({
      doc: () => ({
        get: async () => {
          db1Reads += 1;
          await new Promise((r) => setTimeout(r, 10));
          return {
            exists: true,
            data: () => ({ pricing: { baseFeeFCFA: storedBaseFee } }),
          };
        },
        set: async (payload: Record<string, any>) => {
          if (payload?.pricing?.baseFeeFCFA) {
            storedBaseFee = payload.pricing.baseFeeFCFA;
          }
        },
      }),
    }),
  };

  let db2Reads = 0;
  const mockDb2: DbLike = {
    collection: () => ({
      doc: () => ({
        get: async () => {
          db2Reads += 1;
          return { exists: true, data: () => ({ pricing: { baseFeeFCFA: 1200 } }) };
        },
        set: async () => {},
      }),
    }),
  };

  invalidatePlatformConfigCache(mockDb1);
  invalidatePlatformConfigCache(mockDb2);

  // Concurrent reads on mockDb1 coalesce to 1 Firestore read
  const batch = await Promise.all([
    loadPlatformConfigBundle(mockDb1),
    loadPlatformConfigBundle(mockDb1),
    loadPlatformConfigBundle(mockDb1),
  ]);
  assert.equal(db1Reads, 1);
  assert.equal(batch[0].bundle.pricing.baseFeeFCFA, 750);

  // Subsequent warm read hits L1 cache
  const warm = await loadPlatformConfigBundle(mockDb1);
  assert.equal(db1Reads, 1);
  assert.equal(warm.bundle.pricing.baseFeeFCFA, 750);

  // Separate DB instance is completely isolated
  const db2Res = await loadPlatformConfigBundle(mockDb2);
  assert.equal(db2Reads, 1);
  assert.equal(db2Res.bundle.pricing.baseFeeFCFA, 1200);

  // Save updates write-through cache cleanly
  const saved = await savePlatformConfigSection(mockDb1, { pricing: { baseFeeFCFA: 950 } as any }, 'admin@livralink.bj');
  assert.equal(saved.pricing.baseFeeFCFA, 950);
  const afterSave = await loadPlatformConfigBundle(mockDb1);
  assert.equal(afterSave.bundle.pricing.baseFeeFCFA, 950);
  // 1 initial load + 1 bypassCache read inside savePlatformConfigSection = 2 reads total (no extra read after save)
  assert.equal(db1Reads, 2);

  // Thrown errors are never cached
  const failingDb: DbLike = {
    collection: () => ({
      doc: () => ({
        get: async () => {
          throw new Error('7 PERMISSION_DENIED');
        },
        set: async () => {},
      }),
    }),
  };
  await assert.rejects(() => loadPlatformConfigBundle(failingDb), /PERMISSION_DENIED/);
  await assert.rejects(() => loadPlatformConfigBundle(failingDb), /PERMISSION_DENIED/);

  const stats = getPlatformConfigCacheStats();
  assert.ok(stats.hits >= 3);
});

test('Observability normalization, percentile computation, CacheManager LRU, VirtualList windowing & Web Vitals rating', () => {
  assert.equal(normalizeObservabilityRoute('/api/deliveries/LL-90421/otp/verify?foo=bar'), '/api/deliveries/:orderId/otp/verify');
  assert.equal(normalizeObservabilityRoute('/api/users/1234567890123456789012/profile'), '/api/users/:id/profile');
  assert.equal(computePercentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95), 100);
  assert.equal(computePercentile([], 50), 0);

  // CacheManager bounded LRU
  const clientCache = new CacheManager(3);
  clientCache.set('a', 1, 60_000);
  clientCache.set('b', 2, 60_000);
  clientCache.set('c', 3, 60_000);
  // Touch 'a' so 'b' becomes LRU
  assert.equal(clientCache.get('a'), 1);
  clientCache.set('d', 4, 60_000);
  assert.equal(clientCache.size(), 3);
  assert.equal(clientCache.get('b'), null);
  assert.equal(clientCache.get('a'), 1);
  assert.equal(clientCache.get('d'), 4);

  // VirtualList pure math
  const win = computeVirtualWindow({
    itemCount: 200,
    itemHeightPx: 100,
    scrollTopPx: 2500,
    viewportHeightPx: 500,
    overscanCount: 2,
  });
  assert.equal(win.startIndex, 23);
  assert.equal(win.endIndex, 32);
  assert.equal(win.topSpacerPx, 2300);
  assert.equal(win.bottomSpacerPx, (200 - 32) * 100);
  assert.equal(win.totalHeightPx, 20_000);

  // Web Vitals rating thresholds
  assert.equal(rateWebVital('LCP', 1900), 'good');
  assert.equal(rateWebVital('LCP', 3200), 'needs-improvement');
  assert.equal(rateWebVital('LCP', 4500), 'poor');
  assert.equal(rateWebVital('CLS', 0.05), 'good');
  assert.equal(rateWebVital('INP', 150), 'good');
  assert.equal(rateWebVital('INP', 600), 'poor');

  // Non-DOM fallback for image MIME resolution
  const mimeFallback = resolvePreferredImageMimeType(false);
  assert.equal(mimeFallback.mimeType, 'image/jpeg');
  assert.equal(mimeFallback.extension, 'jpg');
});

test('resilientFetch deduplicates concurrent GET requests and honors caller AbortSignal', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    await new Promise((r) => setTimeout(r, 25));
    return new Response(JSON.stringify({ ok: true, count: fetchCalls }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const [r1, r2, r3] = await Promise.all([
      resilientFetch<{ ok: boolean }>('/api/test-dedup-endpoint'),
      resilientFetch<{ ok: boolean }>('/api/test-dedup-endpoint'),
      resilientFetch<{ ok: boolean }>('/api/test-dedup-endpoint'),
    ]);
    assert.equal(fetchCalls, 1);
    assert.equal(r1.status, 200);
    assert.equal(r2.data?.ok, true);
    assert.equal(r3.data?.ok, true);

    const ac = new AbortController();
    ac.abort();
    const aborted = await resilientFetch('/api/test-aborted-endpoint', { signal: ac.signal });
    assert.equal(aborted.status, 499);
    assert.ok(aborted.error);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Server performance endpoints: Server-Timing, Brotli compression, Cache-Control, RUM ingestion, Admin metrics RBAC, and parallel sync-overview', async (t) => {
  const { baseUrl, close } = await startTestServer();
  const serverMod = await import('../../server');
  serverObservability.resetForTests();

  t.after(async () => {
    serverMod.setTokenVerifierForTests(null);
    serverMod.setFirestoreAdminForTests(null);
    await close();
  });

  await t.test('GET /api/public/config exposes Server-Timing, Cache-Control, and valid Brotli compression when payload >= 1KB', async () => {
    const res = await fetch(`${baseUrl}/api/public/config`, {
      headers: { 'Accept-Encoding': 'br, gzip' },
    });
    assert.equal(res.status, 200);
    const serverTiming = res.headers.get('server-timing') || '';
    assert.match(serverTiming, /app;dur=\d+\.\d+/);
    assert.match(serverTiming, /cfgcache;desc="hits:\d+\/misses:\d+"/);

    const cacheControl = res.headers.get('cache-control') || '';
    assert.match(cacheControl, /public, max-age=30, stale-while-revalidate=60/);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.config?.general?.appName);

    // Also verify raw HTTP Brotli decompression directly
    const rawBr = await new Promise<{ encoding: string | undefined; decoded: any }>((resolve, reject) => {
      const url = new URL(`${baseUrl}/api/public/config`);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'GET',
          headers: { 'Accept-Encoding': 'br' },
        },
        (httpRes) => {
          const chunks: Buffer[] = [];
          httpRes.on('data', (c) => chunks.push(Buffer.from(c)));
          httpRes.on('end', () => {
            try {
              const buf = Buffer.concat(chunks);
              const enc = httpRes.headers['content-encoding'];
              const text = enc === 'br' ? zlib.brotliDecompressSync(buf).toString('utf8') : buf.toString('utf8');
              resolve({ encoding: enc, decoded: JSON.parse(text) });
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(rawBr.encoding, 'br');
    assert.equal(rawBr.decoded.success, true);
  });

  await t.test('POST /api/telemetry/rum validates payloads and GET /api/admin/performance/metrics enforces admin RBAC', async () => {
    // Reject invalid metric
    const badRum = await fetch(`${baseUrl}/api/telemetry/rum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'BOGUS', value: 120 }),
    });
    assert.equal(badRum.status, 400);

    // Accept valid LCP metric
    const goodRum = await fetch(`${baseUrl}/api/telemetry/rum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'LCP', value: 1420, rating: 'good', view: 'vendeur_dashboard', connectionType: '4g' }),
    });
    assert.equal(goodRum.status, 202);

    // Unauthenticated rejected 401
    const unauthMetrics = await fetch(`${baseUrl}/api/admin/performance/metrics`);
    assert.equal(unauthMetrics.status, 401);

    serverMod.setTokenVerifierForTests(async (tok) => {
      if (tok === 'admin-tok') {
        return { uid: 'admin_perf_1', email: 'Pamphile.gbede@gmail.com', email_verified: true, admin: true };
      }
      return { uid: 'courier_perf_1', email: 'livreur@livralink.bj', email_verified: true };
    });

    // Non-admin rejected 403
    const nonAdminMetrics = await fetch(`${baseUrl}/api/admin/performance/metrics`, {
      headers: { Authorization: 'Bearer courier-tok' },
    });
    assert.equal(nonAdminMetrics.status, 403);

    // Admin allowed 200 with latency percentiles, caches, and RUM metrics
    const adminMetrics = await fetch(`${baseUrl}/api/admin/performance/metrics`, {
      headers: { Authorization: 'Bearer admin-tok' },
    });
    assert.equal(adminMetrics.status, 200);
    const data = await adminMetrics.json();
    assert.equal(data.success, true);
    assert.ok(typeof data.requests?.latencyMs?.p50 === 'number');
    assert.ok(typeof data.requests?.latencyMs?.p95 === 'number');
    assert.ok(typeof data.requests?.latencyMs?.p99 === 'number');
    assert.equal(data.rumWebVitals?.metrics?.LCP?.p75, 1420);
    assert.ok(Array.isArray(data.caches));
    assert.ok(typeof data.runtime?.heapUsedMB === 'number');
  });

  await t.test('GET /api/admin/sync-overview executes Firestore collections in parallel', async () => {
    serverMod.setTokenVerifierForTests(async (tok) => {
      if (tok === 'admin-tok') {
        return { uid: 'admin_sync_1', email: 'Pamphile.gbede@gmail.com', email_verified: true, admin: true };
      }
      throw new Error('Unauthorized');
    });

    const activeReads = { current: 0, maxConcurrent: 0 };
    const makeEmptySnap = () => ({ forEach: () => {} });
    serverMod.setFirestoreAdminForTests({
      collection: () => ({
        get: async () => {
          activeReads.current += 1;
          if (activeReads.current > activeReads.maxConcurrent) {
            activeReads.maxConcurrent = activeReads.current;
          }
          await new Promise((r) => setTimeout(r, 25));
          activeReads.current -= 1;
          return makeEmptySnap();
        },
        doc: () => ({
          get: async () => ({ exists: false, data: () => undefined }),
          set: async () => {},
        }),
      }),
    });

    const res = await fetch(`${baseUrl}/api/admin/sync-overview`, {
      headers: { Authorization: 'Bearer admin-tok' },
    });
    assert.equal(res.status, 200);
    assert.ok(activeReads.maxConcurrent >= 3, `Expected parallel collection reads, maxConcurrent=${activeReads.maxConcurrent}`);
  });
});

test('Static critical-render-path, persistent Firestore cache, composite indexes, and Admin lazy-splitting invariants', () => {
  const rootDir = process.cwd();
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.match(indexHtml, /rel="preload"[\s\S]*as="style"[\s\S]*fonts\.googleapis\.com/);
  assert.match(indexHtml, /Plus\+Jakarta\+Sans:wght@400;500;600;700;800/);

  const fbConfig = fs.readFileSync(path.join(rootDir, 'src/firebase/config.ts'), 'utf8');
  assert.match(fbConfig, /persistentLocalCache/);
  assert.match(fbConfig, /persistentMultipleTabManager/);

  const adminConsole = fs.readFileSync(path.join(rootDir, 'src/components/views/AdminConsole.tsx'), 'utf8');
  assert.match(adminConsole, /React\.lazy\(\(\) => import\('\.\/AdminOverviewDashboard'\)/);
  assert.match(adminConsole, /React\.lazy\(\(\) => import\('\.\.\/admin\/AdminAuditLogsPanel'\)/);
  assert.match(adminConsole, /<React\.Suspense/);

  const indexesJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'firestore.indexes.json'), 'utf8'));
  const collectionsIndexed = new Set((indexesJson.indexes || []).map((i: any) => i.collectionGroup));
  assert.ok(collectionsIndexed.has('deliveries'));
  assert.ok(collectionsIndexed.has('wallet_transactions'));
});
