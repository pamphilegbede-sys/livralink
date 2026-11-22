import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  BackupFirestoreLike,
  createSystemBackup,
  listSystemBackups,
  restoreSystemBackup,
  SAFE_BACKUP_COLLECTIONS,
  SystemBackupError,
  SYSTEM_BACKUP_LATEST_DOC_ID,
  SYSTEM_BACKUPS_COLLECTION,
} from '../server/systemBackupService';

process.env.NODE_ENV = 'test';

function createInMemoryBackupFirestore(options?: { throwIamDenied?: boolean }) {
  const store = new Map<string, Map<string, Record<string, any>>>();
  const ensureCol = (name: string) => {
    let col = store.get(name);
    if (!col) {
      col = new Map<string, Record<string, any>>();
      store.set(name, col);
    }
    return col;
  };

  const makeIamError = () => {
    const err: any = new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.');
    err.code = 7;
    return err;
  };

  const db: BackupFirestoreLike & { _store: typeof store } = {
    _store: store,
    collection(name: string) {
      const col = ensureCol(name);
      return {
        doc(id: string) {
          return {
            id,
            async get() {
              if (options?.throwIamDenied) throw makeIamError();
              const data = col.get(id);
              return {
                exists: Boolean(data),
                id,
                data: () => (data ? structuredClone(data) : undefined),
              };
            },
            async set(data: Record<string, any>, setOpts?: { merge?: boolean }) {
              if (options?.throwIamDenied) throw makeIamError();
              if (setOpts?.merge && col.has(id)) {
                col.set(id, { ...(col.get(id) || {}), ...structuredClone(data) });
              } else {
                col.set(id, structuredClone(data));
              }
            },
          };
        },
        limit(n: number) {
          return {
            async get() {
              if (options?.throwIamDenied) throw makeIamError();
              const docs = Array.from(col.entries())
                .slice(0, n)
                .map(([id, data]) => ({
                  exists: true,
                  id,
                  data: () => structuredClone(data),
                }));
              return { empty: docs.length === 0, docs };
            },
          };
        },
        orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
          const sorted = () =>
            Array.from(col.entries()).sort((a, b) => {
              const av = Number(a[1]?.[field] ?? 0);
              const bv = Number(b[1]?.[field] ?? 0);
              return direction === 'desc' ? bv - av : av - bv;
            });
          return {
            limit(n: number) {
              return {
                async get() {
                  if (options?.throwIamDenied) throw makeIamError();
                  const docs = sorted()
                    .slice(0, n)
                    .map(([id, data]) => ({
                      exists: true,
                      id,
                      data: () => structuredClone(data),
                    }));
                  return { empty: docs.length === 0, docs };
                },
              };
            },
            async get() {
              if (options?.throwIamDenied) throw makeIamError();
              const docs = sorted().map(([id, data]) => ({
                exists: true,
                id,
                data: () => structuredClone(data),
              }));
              return { empty: docs.length === 0, docs };
            },
          };
        },
        async get() {
          if (options?.throwIamDenied) throw makeIamError();
          const docs = Array.from(col.entries()).map(([id, data]) => ({
            exists: true,
            id,
            data: () => structuredClone(data),
          }));
          return { empty: docs.length === 0, docs };
        },
      };
    },
    batch() {
      const ops: Array<() => void> = [];
      return {
        set(ref: any, data: Record<string, any>, setOpts?: { merge?: boolean }) {
          ops.push(() => {
            if (options?.throwIamDenied) throw makeIamError();
            // Rely on synchronous set inside commit simulation
            void ref;
            void data;
            void setOpts;
          });
          // Store reference + payload directly
          (ops[ops.length - 1] as any)._exec = () => ref.set(data, setOpts);
        },
        async commit() {
          if (options?.throwIamDenied) throw makeIamError();
          for (const op of ops) {
            await (op as any)._exec();
          }
        },
      };
    },
  };
  return db;
}

test('Persistent multi-instance backup service & deployment routing audit', async (t) => {
  await t.test('Creates persistent backup in Firestore and restores from a different Cloud Run instance', async () => {
    const sharedDb = createInMemoryBackupFirestore();
    const state = {
      deliveries: [{ id: 'LL-1001', status: 'livree' }],
      walletLedger: { totalCollectedCOD: 48000 },
    };

    const created = await createSystemBackup(sharedDb, {
      data: state,
      requestedByUid: 'admin_1',
      requestedByEmail: 'Pamphile.gbede@gmail.com',
      instanceRevision: 'rev-instance-a',
      nowMs: 1_700_000_000_000,
    });

    assert.equal(created.storage, 'firestore_persistent');
    assert.equal(created.mode, 'payload_snapshot');
    assert.match(created.checksum, /^[a-f0-9]{64}$/);
    assert.ok(sharedDb._store.get(SYSTEM_BACKUPS_COLLECTION)?.has(SYSTEM_BACKUP_LATEST_DOC_ID));
    assert.ok(sharedDb._store.get(SYSTEM_BACKUPS_COLLECTION)?.has(created.backupId));

    // Simulate a second Cloud Run instance with zero local RAM reading from shared Firestore
    const restored = await restoreSystemBackup(sharedDb);
    assert.equal(restored.integrityVerified, true);
    assert.equal(restored.checksum, created.checksum);
    assert.deepEqual(restored.restoredData, state);

    const list = await listSystemBackups(sharedDb);
    assert.equal(list.length, 1);
    assert.equal(list[0].backupId, created.backupId);
    assert.equal((list[0] as any).payloadJson, undefined);
  });

  await t.test('Detects SHA-256 payload tampering and fails with 409 BACKUP_CHECKSUM_MISMATCH', async () => {
    const sharedDb = createInMemoryBackupFirestore();
    await createSystemBackup(sharedDb, {
      data: { intact: true },
      nowMs: 1_700_000_001_000,
    });

    // Tamper stored payloadJson directly in Firestore
    const latest = sharedDb._store.get(SYSTEM_BACKUPS_COLLECTION)!.get(SYSTEM_BACKUP_LATEST_DOC_ID)!;
    latest.payloadJson = JSON.stringify({ intact: false, tampered: true });

    await assert.rejects(
      () => restoreSystemBackup(sharedDb),
      (err: any) =>
        err instanceof SystemBackupError &&
        err.status === 409 &&
        err.code === 'BACKUP_CHECKSUM_MISMATCH'
    );
  });

  await t.test('Exports operational collections cleanly while excluding admin/secret collections and supports safe restore', async () => {
    const sharedDb = createInMemoryBackupFirestore();
    await sharedDb.collection('users').doc('u1').set({ uid: 'u1', role: 'vendeur' });
    await sharedDb.collection('deliveries').doc('d1').set({ id: 'd1', status: 'en_attente' });
    await sharedDb.collection('admins').doc('a1').set({ uid: 'a1', level: 'super_admin' });
    await sharedDb.collection('system_config').doc('smtp').set({ encryptedPass: 'SECRET' });
    await sharedDb.collection('auth_reset_otps').doc('h1').set({ otpHash: 'HASH' });

    const created = await createSystemBackup(sharedDb, { nowMs: 1_700_000_002_000 });
    assert.equal(created.mode, 'operational_collections');
    assert.equal(created.collectionsSummary?.users, 1);
    assert.equal(created.collectionsSummary?.deliveries, 1);

    const latestDoc = sharedDb._store.get(SYSTEM_BACKUPS_COLLECTION)!.get(SYSTEM_BACKUP_LATEST_DOC_ID)!;
    const parsed = JSON.parse(latestDoc.payloadJson);
    for (const safeCol of SAFE_BACKUP_COLLECTIONS) {
      assert.ok(safeCol in parsed.collections, `${safeCol} should be exported`);
    }
    assert.equal('admins' in parsed.collections, false);
    assert.equal('system_config' in parsed.collections, false);
    assert.equal('auth_reset_otps' in parsed.collections, false);

    // Wipe deliveries in DB and apply operational restore
    sharedDb._store.get('deliveries')!.clear();
    const restored = await restoreSystemBackup(sharedDb, { applyToFirestore: true });
    assert.equal(restored.appliedToFirestore, true);
    assert.equal(restored.restoredDocCount, 2);
    assert.equal(sharedDb._store.get('deliveries')!.get('d1')?.status, 'en_attente');
  });

  await t.test('Fails closed with 503 when Firestore is unavailable or returns IAM PERMISSION_DENIED', async () => {
    await assert.rejects(
      () => createSystemBackup(null, { data: { test: 1 } }),
      (err: any) => err instanceof SystemBackupError && err.status === 503 && err.code === 'FIRESTORE_UNAVAILABLE'
    );

    const iamDb = createInMemoryBackupFirestore({ throwIamDenied: true });
    await assert.rejects(
      () => createSystemBackup(iamDb, { data: { test: 1 } }),
      (err: any) => err instanceof SystemBackupError && err.status === 503 && err.code === 'IAM_PERMISSION_DENIED'
    );
  });

  await t.test('HTTP /api/system/backup, /api/system/restore, /api/security/audit & unknown /api/* 404 JSON check', async () => {
    const sharedDb = createInMemoryBackupFirestore();
    const serverMod = await import('../../server');
    serverMod.setFirestoreAdminForTests(sharedDb);
    serverMod.setTokenVerifierForTests(async (tok: string) => {
      if (tok === 'admin-tok') {
        return { uid: 'super_admin_1', email: 'Pamphile.gbede@gmail.com', email_verified: true };
      }
      return { uid: 'normal_user', email: 'user@test.com', email_verified: true };
    });

    const server = http.createServer(serverMod.app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      // Non-admin must receive 403
      const forbiddenBackup = await fetch(`${baseUrl}/api/system/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-tok' },
        body: JSON.stringify({ data: { a: 1 } }),
      });
      assert.equal(forbiddenBackup.status, 403);

      // Admin backup succeeds persistently
      const bkpRes = await fetch(`${baseUrl}/api/system/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
        body: JSON.stringify({ data: { deliveries: [{ id: 'LL-9' }] } }),
      });
      assert.equal(bkpRes.status, 200);
      const bkpBody = await bkpRes.json();
      assert.equal(bkpBody.success, true);
      assert.equal(bkpBody.storage, 'firestore_persistent');
      assert.match(bkpBody.snapshotChecksum, /^[a-f0-9]{64}$/);

      // Admin restore succeeds with SHA-256 verification
      const rstRes = await fetch(`${baseUrl}/api/system/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
        body: JSON.stringify({}),
      });
      assert.equal(rstRes.status, 200);
      const rstBody = await rstRes.json();
      assert.equal(rstBody.integrityVerified, true);
      assert.equal(rstBody.checksum, bkpBody.snapshotChecksum);
      assert.deepEqual(rstBody.restoredData, { deliveries: [{ id: 'LL-9' }] });

      // Security audit exposes non-secret readiness block
      const auditRes = await fetch(`${baseUrl}/api/security/audit`, {
        headers: { Authorization: 'Bearer admin-tok' },
      });
      assert.equal(auditRes.status, 200);
      const auditBody = await auditRes.json();
      assert.equal(typeof auditBody.readiness?.hmacSecretConfigured, 'boolean');
      assert.equal(auditBody.readiness?.backupPersistence, 'FIRESTORE_SYSTEM_BACKUPS_SHA256');
      assert.equal(auditBody.readiness?.payoutProviderMode, 'simulator');

      // Unknown /api/* route returns explicit JSON 404 (never HTML)
      const unknownApiRes = await fetch(`${baseUrl}/api/does-not-exist-route`, {
        headers: { Authorization: 'Bearer admin-tok' },
      });
      assert.equal(unknownApiRes.status, 404);
      const unknownBody = await unknownApiRes.json();
      assert.equal(unknownBody.success, false);
    } finally {
      serverMod.setFirestoreAdminForTests(null);
      serverMod.setTokenVerifierForTests(null);
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  await t.test('Deployment routing files (firebase.json, apphosting.yaml, render.yaml) have zero broken /api function rewrites', () => {
    const firebaseJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase.json'), 'utf8'));
    assert.ok(firebaseJson.hosting, 'hosting block preserved');
    assert.ok(Array.isArray(firebaseJson.hosting.headers) && firebaseJson.hosting.headers.length >= 3);
    const rewrites: Array<{ source?: string; function?: string; destination?: string }> = firebaseJson.hosting.rewrites || [];
    const hasBrokenFunctionRewrite = rewrites.some((r) => Boolean(r.function));
    assert.equal(hasBrokenFunctionRewrite, false, 'firebase.json must not reference nonexistent Cloud Function "app"');
    assert.ok(rewrites.some((r) => r.source === '**' && r.destination === '/index.html'));

    const apphostingYaml = fs.readFileSync(path.resolve(process.cwd(), 'apphosting.yaml'), 'utf8');
    assert.ok(apphostingYaml.includes('ai-studio-livralink-f9d2844b-bf6d-492f-9504-2721bd1820b6'));
    assert.ok(apphostingYaml.includes('PAYOUT_PROVIDER_MODE'));

    const renderYaml = fs.readFileSync(path.resolve(process.cwd(), 'render.yaml'), 'utf8');
    assert.ok(renderYaml.includes('ai-studio-livralink-f9d2844b-bf6d-492f-9504-2721bd1820b6'));
    assert.ok(renderYaml.includes('GEMINI_API_KEY'));
  });
});
