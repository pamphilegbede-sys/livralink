import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import http from 'node:http';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  createP1EmailAndConfigService,
  decryptSmtpPassword,
  encryptSmtpPassword,
  evaluateEmailEncryptionSecret,
  extractClientIp,
  isInternalProxyIp,
  P1FirestoreLike,
  resolveTrustProxySetting,
  sanitizeSmtpConfigForApi,
} from '../server/p1EmailAndConfig';
import type {
  P0DocumentRef,
  P0DocumentSnapshot,
  P0Query,
  P0QuerySnapshot,
  P0Transaction,
  P0WriteBatch,
} from '../server/p0Security';

/**
 * Lightweight transactional Firestore mock for unit tests of P1 distributed queue,
 * encrypted SMTP configuration sharing, and cross-instance dedup.
 */
function createMockP1Firestore(): P1FirestoreLike & {
  dumpCollection: (col: string) => Record<string, Record<string, any>>;
} {
  const store = new Map<string, Map<string, Record<string, any>>>();

  const getColMap = (name: string) => {
    let m = store.get(name);
    if (!m) {
      m = new Map<string, Record<string, any>>();
      store.set(name, m);
    }
    return m;
  };

  const makeSnap = (id: string, data: Record<string, any> | undefined): P0DocumentSnapshot => ({
    id,
    exists: data !== undefined,
    data: () => (data ? structuredClone(data) : undefined),
  });

  const makeDocRef = (colName: string, id: string): P0DocumentRef => {
    const col = getColMap(colName);
    return {
      id,
      path: `${colName}/${id}`,
      collection: () => {
        throw new Error('Nested subcollections not implemented in P1 unit mock');
      },
      async get() {
        return makeSnap(id, col.get(id));
      },
      async set(data, options) {
        if (options?.merge) {
          const prev = col.get(id) || {};
          col.set(id, structuredClone({ ...prev, ...data }));
        } else {
          col.set(id, structuredClone(data));
        }
      },
      async update(data) {
        if (!col.has(id)) {
          throw new Error(`NOT_FOUND: ${colName}/${id}`);
        }
        const prev = col.get(id) || {};
        col.set(id, structuredClone({ ...prev, ...data }));
      },
      async delete() {
        col.delete(id);
      },
    };
  };

  let txChain: Promise<any> = Promise.resolve();

  const makeQuery = (
    colName: string,
    filters: Array<{ field: string; op: string; value: any }>,
    order?: { field: string; dir: 'asc' | 'desc' },
    lim?: number
  ) => {
    const q: P0Query & { orderBy: (f: string, d?: 'asc' | 'desc') => any } = {
      where(field, op, value) {
        return makeQuery(colName, [...filters, { field, op, value }], order, lim);
      },
      orderBy(field, dir = 'asc') {
        return makeQuery(colName, filters, { field, dir }, lim);
      },
      limit(n) {
        return makeQuery(colName, filters, order, n);
      },
      async get(): Promise<P0QuerySnapshot> {
        const col = getColMap(colName);
        let entries = Array.from(col.entries()).filter(([, doc]) =>
          filters.every((f) => {
            if (f.op === '==') return doc[f.field] === f.value;
            if (f.op === '<=') return typeof doc[f.field] === 'number' && doc[f.field] <= f.value;
            return false;
          })
        );
        if (order) {
          entries.sort((a, b) => {
            const va = a[1][order.field] ?? '';
            const vb = b[1][order.field] ?? '';
            return order.dir === 'desc' ? (va < vb ? 1 : va > vb ? -1 : 0) : (va < vb ? -1 : va > vb ? 1 : 0);
          });
        }
        if (typeof lim === 'number') {
          entries = entries.slice(0, lim);
        }
        const docs = entries.map(([id, data]) => makeSnap(id, data));
        return { empty: docs.length === 0, docs };
      },
    };
    return q;
  };

  return {
    collection(name: string) {
      return {
        doc: (id: string) => makeDocRef(name, id),
        where: (field: string, op: string, value: any) => makeQuery(name, [{ field, op, value }]),
        orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => makeQuery(name, [], { field, dir }),
        limit: (n: number) => makeQuery(name, [], undefined, n),
        get: () => makeQuery(name, []).get(),
      };
    },
    runTransaction<T>(fn: (tx: P0Transaction) => Promise<T>): Promise<T> {
      const next = txChain.then(async () => {
        const ops: Array<() => Promise<void>> = [];
        const tx: P0Transaction = {
          get: (ref) => ref.get(),
          set: (ref, data, options) => {
            ops.push(() => ref.set(data, options));
          },
          update: (ref, data) => {
            ops.push(() => ref.update(data));
          },
          delete: (ref) => {
            ops.push(() => ref.delete());
          },
        };
        const result = await fn(tx);
        for (const op of ops) {
          await op();
        }
        return result;
      });
      txChain = next.catch(() => {});
      return next;
    },
    batch(): P0WriteBatch {
      const ops: Array<() => Promise<void>> = [];
      return {
        set: (ref, data, options) => ops.push(() => ref.set(data, options)),
        update: (ref, data) => ops.push(() => ref.update(data)),
        delete: (ref) => ops.push(() => ref.delete()),
        commit: async () => {
          for (const op of ops) await op();
        },
      };
    },
    dumpCollection(col: string) {
      return Object.fromEntries(getColMap(col).entries());
    },
  };
}

describe('P1 Suite: Production Startup, Trust Proxy, Encrypted SMTP & Persistent Queue', () => {
  test('1. Production footprint: server.ts avoids top-level static Vite import & residual public/assets/aistudio is absent', () => {
    const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    assert.equal(
      /^\s*import\s+.*from\s+['"]vite['"]/m.test(serverSrc),
      false,
      'server.ts must NOT statically import vite at top level'
    );
    assert.equal(
      /await\s+import\(['"]vite['"]\)/.test(serverSrc),
      true,
      'server.ts must dynamically import vite inside the dev-only branch'
    );

    assert.equal(
      fs.existsSync(path.resolve(process.cwd(), 'public/assets/aistudio')),
      false,
      'Residual public/assets/aistudio directory must remain deleted'
    );
  });

  test('2. Trust proxy: correctly identifies internal App Hosting / GFE / loopback hops and blocks XFF client spoofing', async () => {
    assert.equal(isInternalProxyIp('127.0.0.1'), true);
    assert.equal(isInternalProxyIp('::ffff:127.0.0.1'), true);
    assert.equal(isInternalProxyIp('10.42.0.5'), true);
    assert.equal(isInternalProxyIp('172.16.0.10'), true);
    assert.equal(isInternalProxyIp('192.168.1.15'), true);
    assert.equal(isInternalProxyIp('169.254.169.254'), true);
    assert.equal(isInternalProxyIp('130.211.1.10'), true);
    assert.equal(isInternalProxyIp('35.191.4.20'), true);

    assert.equal(isInternalProxyIp('203.0.113.55'), false);
    assert.equal(isInternalProxyIp('8.8.8.8'), false);
    assert.equal(isInternalProxyIp('198.51.100.12'), false);

    // Express HTTP test with real loopback proxy behavior
    const miniApp = express();
    miniApp.set('trust proxy', resolveTrustProxySetting({} as NodeJS.ProcessEnv));
    miniApp.get('/probe-ip', (req, res) => {
      res.json({
        ip: extractClientIp(req),
        protocol: req.protocol,
        hostname: req.hostname,
      });
    });

    const server = http.createServer(miniApp);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;

    try {
      // Spoofed leftmost IP '1.1.1.1' before real untrusted client '198.51.100.77', forwarded via 10.0.0.2 & 127.0.0.1
      const res = await fetch(`http://127.0.0.1:${port}/probe-ip`, {
        headers: {
          'X-Forwarded-For': '1.1.1.1, 198.51.100.77, 10.0.0.2',
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-Host': 'livralink.oxy-dev.cc',
        },
      });
      const data = await res.json();
      assert.equal(data.ip, '198.51.100.77', 'Must take rightmost untrusted hop and ignore spoofed leftmost 1.1.1.1');
      assert.equal(data.protocol, 'https');
      assert.equal(data.hostname, 'livralink.oxy-dev.cc');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  test('3. Encryption secret evaluation & AES-256-GCM SMTP password roundtrip with fail-closed validation', () => {
    const validDedicated = evaluateEmailEncryptionSecret({
      EMAIL_ENCRYPTION_SECRET: 'dedicated-email-encryption-secret-32-chars-min',
      OTP_SECRET_SALT: 'other-otp-secret-32-characters-long-here',
    } as NodeJS.ProcessEnv);
    assert.equal(validDedicated.valid, true);
    assert.equal(validDedicated.source, 'EMAIL_ENCRYPTION_SECRET');

    const fallbackToOtp = evaluateEmailEncryptionSecret({
      OTP_SECRET_SALT: 'shared-otp-secret-salt-32-chars-minimum-ok',
    } as NodeJS.ProcessEnv);
    assert.equal(fallbackToOtp.valid, true);
    assert.equal(fallbackToOtp.source, 'OTP_SECRET_SALT');

    const explicitWeak = evaluateEmailEncryptionSecret({
      EMAIL_ENCRYPTION_SECRET: 'too-short',
      OTP_SECRET_SALT: 'shared-otp-secret-salt-32-chars-minimum-ok',
    } as NodeJS.ProcessEnv);
    assert.equal(explicitWeak.valid, false);
    assert.equal(explicitWeak.tooShort, true);

    const blob = encryptSmtpPassword('app-pass-abcd-efgh', validDedicated.secret!);
    assert.equal(blob.alg, 'aes-256-gcm-hkdf-v1');
    assert.notEqual(blob.ciphertext, 'app-pass-abcd-efgh');
    assert.equal(decryptSmtpPassword(blob, validDedicated.secret!), 'app-pass-abcd-efgh');
    assert.throws(() => decryptSmtpPassword(blob, 'wrong-master-secret-32-characters-long!!'));
  });

  test('4. Shared encrypted SMTP config across instances A & B: fail-closed without secret & zero plaintext exposure', async () => {
    const db = createMockP1Firestore();

    // Fail-closed 503 if saving pass to Firestore without >= 32 char secret
    const svcNoSecret = createP1EmailAndConfigService(db, {
      env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv,
    });
    const blockedSave = await svcNoSecret.saveSmtpConfig({
      host: 'smtp.gmail.com',
      port: 587,
      user: 'noreply@livralink.bj',
      pass: 'super-secret-app-password',
      from: 'LivraLink <noreply@livralink.bj>',
    });
    assert.equal(blockedSave.ok, false);
    if (!blockedSave.ok) assert.equal(blockedSave.status, 503);

    const sharedSecretEnv = {
      NODE_ENV: 'production',
      OTP_SECRET_SALT: 'shared-multi-instance-hmac-and-smtp-key-2026',
    } as NodeJS.ProcessEnv;

    const svcA = createP1EmailAndConfigService(db, { env: sharedSecretEnv, instanceId: 'inst-A' });
    const svcB = createP1EmailAndConfigService(db, { env: sharedSecretEnv, instanceId: 'inst-B' });

    const saved = await svcA.saveSmtpConfig({
      host: 'smtp.gmail.com',
      port: 465,
      user: 'dispatch@livralink.bj',
      pass: 'my-gmail-app-password-16ch',
      from: 'LivraLink Dispatch <dispatch@livralink.bj>',
      updatedBy: 'admin@livralink.bj',
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal((saved.config as any).pass, undefined);
    assert.equal((saved.config as any).encryptedPass, undefined);
    assert.equal(saved.config.hasPassword, true);
    assert.equal(saved.config.isConfigured, true);

    // Inspect raw Firestore document -> must never contain plaintext pass
    const rawSystemCfg = db.dumpCollection('system_config').smtp;
    assert.ok(rawSystemCfg.encryptedPass?.ciphertext);
    assert.equal(JSON.stringify(rawSystemCfg).includes('my-gmail-app-password-16ch'), false);

    // Instance B immediately reads decrypted runtime config and sanitized API view
    const effB = await svcB.getEffectiveSmtpConfig();
    assert.equal(effB.host, 'smtp.gmail.com');
    assert.equal(effB.port, 465);
    assert.equal(effB.user, 'dispatch@livralink.bj');
    assert.equal(effB.pass, 'my-gmail-app-password-16ch');
    assert.equal(effB.from, 'LivraLink Dispatch <dispatch@livralink.bj>');

    const apiSanitized = sanitizeSmtpConfigForApi(effB, { persistence: 'firestore', encryptionReady: true });
    assert.equal((apiSanitized as any).pass, undefined);
    assert.equal(apiSanitized.hasPassword, true);
  });

  test('5. Persistent Firestore email_queue: concurrent Promise.all lease lock, stale lease recovery, retries & cross-instance dedup', async () => {
    const db = createMockP1Firestore();
    let now = 1_760_000_000_000;
    let shouldFailSmtp = true;
    let smtpDeliveries = 0;

    const sharedEnv = {
      NODE_ENV: 'production',
      OTP_SECRET_SALT: 'shared-multi-instance-hmac-and-smtp-key-2026',
    } as NodeJS.ProcessEnv;

    let slowDeliveryGate: Promise<void> | null = null;
    const sendMailFn = async () => {
      if (slowDeliveryGate) await slowDeliveryGate;
      if (shouldFailSmtp) {
        throw new Error('SMTP 421 temporary relay unavailable');
      }
      smtpDeliveries++;
    };

    const svcA = createP1EmailAndConfigService(db, { env: sharedEnv, now: () => now, instanceId: 'inst-A', sendMailFn });
    const svcB = createP1EmailAndConfigService(db, { env: sharedEnv, now: () => now, instanceId: 'inst-B', sendMailFn });

    await svcA.saveSmtpConfig({
      host: 'smtp.gmail.com',
      port: 587,
      user: 'noreply@livralink.bj',
      pass: 'valid-smtp-password',
      from: 'LivraLink <noreply@livralink.bj>',
    });

    // Cross-instance dedup under Promise.all
    const [d1, d2] = await Promise.all([
      svcA.claimEmailDedupKey({ dedupKey: 'order-101:delivery_created', eventType: 'delivery_created', recipientEmail: 'v@livralink.bj' }),
      svcB.claimEmailDedupKey({ dedupKey: 'order-101:delivery_created', eventType: 'delivery_created', recipientEmail: 'v@livralink.bj' }),
    ]);
    assert.equal([d1.allowed, d2.allowed].filter(Boolean).length, 1);

    // Initial send fails -> persisted in email_queue & email_logs
    const dispatchRes = await svcA.dispatchOrQueueEmail({
      type: 'custom',
      eventType: 'delivery_created',
      dedupKey: 'order-101:delivery_created',
      to: 'vendor@livralink.bj',
      recipientName: 'Boutique Cotonou',
      subject: 'Course créée',
      previewText: 'Nouvelle course',
      textContent: 'Nouvelle course',
      htmlContent: '<p>Nouvelle course</p>',
      allowQueue: true,
    });
    assert.equal(dispatchRes.emailDelivered, false);
    assert.equal(dispatchRes.queued, true);

    const queueDocsBefore = db.dumpCollection('email_queue');
    assert.equal(queueDocsBefore[dispatchRes.emailRecord.id].status, 'queued');
    assert.equal(queueDocsBefore[dispatchRes.emailRecord.id].retryCount, 1);

    // Backoff respected unless forceImmediate or time elapsed
    shouldFailSmtp = false;
    const deferred = await svcB.processEmailQueue({ forceImmediate: false });
    assert.equal(deferred.processedCount, 0);
    assert.equal(deferred.deferredBackoffCount, 1);

    // Advance past retry backoff (2 min) & test concurrent processing across A and B -> strictly 1 delivers!
    now += 120_000;
    let releaseSlow!: () => void;
    slowDeliveryGate = new Promise<void>((r) => {
      releaseSlow = r;
    });

    const pA = svcA.processEmailQueue({ forceImmediate: false });
    await new Promise((r) => setTimeout(r, 20));
    const pB = svcB.processEmailQueue({ forceImmediate: false });
    await new Promise((r) => setTimeout(r, 20));
    releaseSlow();
    slowDeliveryGate = null;

    const [resA, resB] = await Promise.all([pA, pB]);
    assert.equal(resA.successCount + resB.successCount, 1);
    assert.equal(resB.skippedLockedCount, 1);
    assert.equal(smtpDeliveries, 1);

    const outboxB = await svcB.listEmailOutbox(20);
    assert.equal(outboxB.source, 'firestore');
    assert.equal(outboxB.emails[0].status, 'sent');
    assert.equal(outboxB.emails[0].deliveredViaSmtp, true);

    // Stale lease recovery + terminal failure after maxRetries (3)
    shouldFailSmtp = true;
    const staleJobRes = await svcA.dispatchOrQueueEmail({
      type: 'welcome',
      to: 'stale@livralink.bj',
      recipientName: 'Stale',
      subject: 'Welcome',
      previewText: 'Hello',
      textContent: 'Hello',
      htmlContent: '<p>Hello</p>',
      allowQueue: true,
    });
    const jobId = staleJobRes.emailRecord.id;
    // Simulate crashed worker holding expired processing lease
    await db.collection('email_queue').doc(jobId).update({
      status: 'processing',
      processingLeaseId: 'crashed-worker-lease',
      processingStartedAt: now - 70_000,
      processingExpiresAt: now - 5_000,
    });

    // Retry 2 (fails) -> status queued, retryCount 2
    const r2 = await svcB.processEmailQueue({ forceImmediate: true });
    assert.equal(r2.processedCount, 1);
    assert.equal(db.dumpCollection('email_queue')[jobId].retryCount, 2);
    assert.equal(db.dumpCollection('email_queue')[jobId].status, 'queued');

    // Retry 3 (fails, hits maxRetries=3) -> status failed
    const r3 = await svcB.processEmailQueue({ forceImmediate: true });
    assert.equal(r3.failedCount, 1);
    assert.equal(db.dumpCollection('email_queue')[jobId].status, 'failed');
    assert.equal(db.dumpCollection('email_logs')[jobId].status, 'failed');
  });
});
