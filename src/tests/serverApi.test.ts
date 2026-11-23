import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';

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

test('Express API security & health integration tests', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(async () => {
    await close();
  });

  await t.test('GET /healthz and /api/healthz return 200 ok', async () => {
    for (const path of ['/healthz', '/api/healthz']) {
      const res = await fetch(`${baseUrl}${path}`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'ok');
      assert.equal(typeof body.uptime, 'number');
      assert.equal(typeof body.timestamp, 'string');
    }
  });

  await t.test('GET /api/monitoring/heartbeat responds cleanly without leaking secrets', async () => {
    const res = await fetch(`${baseUrl}/api/monitoring/heartbeat`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal((body as any).pass, undefined);
    assert.equal((body as any).smtpPass, undefined);
  });

  await t.test('Protected endpoints strictly reject unauthenticated requests with 401', async () => {
    const protectedEndpoints: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'POST', path: '/api/admin/broadcast', body: { title: 'Test', message: 'Test' } },
      { method: 'POST', path: '/api/notifications/dispatch', body: { title: 'Test', message: 'Test' } },
      { method: 'POST', path: '/api/deliveries/LL-1000/otp/verify', body: { otpCode: '1234' } },
      { method: 'POST', path: '/api/deliveries/LL-1000/complete-pod', body: { otpCode: '1234', signedByName: 'Client' } },
      { method: 'POST', path: '/api/wallet/verify-idempotency', body: { requestId: 'req_1' } },
      { method: 'POST', path: '/api/wallet/commit-payout', body: { requestId: 'req_1', amountFCFA: 5000 } },
      { method: 'POST', path: '/api/email/notification', body: { eventType: 'delivery_created', recipientEmail: 'a@b.com' } },
      { method: 'GET', path: '/api/email/outbox' },
      { method: 'GET', path: '/api/admin/email/config' },
      { method: 'GET', path: '/api/admin/sync-overview' },
    ];

    for (const ep of protectedEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : undefined,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert.equal(
        res.status,
        401,
        `Expected 401 for unauthenticated ${ep.method} ${ep.path}, got ${res.status}`
      );
    }
  });

  await t.test('POST /api/auth/send-reset-code validates email format (400)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/send-reset-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  await t.test('POST /api/auth/reset-password rejects incomplete payloads and weak passwords (400)', async () => {
    const resMissing = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    assert.equal(resMissing.status, 400);

    const resWeak = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', resetToken: 'tok_123', newPassword: '123' }),
    });
    assert.equal(resWeak.status, 400);
    const body = await resWeak.json();
    assert.equal(body.success, false);
  });

  await t.test('GET/POST /api/platform/config handle Firestore 7 PERMISSION_DENIED cleanly without 500 error', async () => {
    const serverMod = await import('../../server');
    const permDeniedErr: any = new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.');
    permDeniedErr.code = 7;

    serverMod.setTokenVerifierForTests(async (tok) => {
      if (tok === 'admin-tok') {
        return { uid: 'admin_1', email: 'Pamphile.gbede@gmail.com', email_verified: true, admin: true };
      }
      return { uid: 'user_1', email: 'vendeur@livralink.bj', email_verified: true };
    });

    serverMod.setFirestoreAdminForTests({
      collection: () => ({
        doc: () => ({
          get: async () => {
            throw permDeniedErr;
          },
          set: async () => {
            throw permDeniedErr;
          },
        }),
      }),
    });

    try {
      const getRes = await fetch(`${baseUrl}/api/platform/config`, {
        headers: { Authorization: 'Bearer user-tok' },
      });
      assert.equal(getRes.status, 200);
      const getBody = await getRes.json();
      assert.equal(getBody.success, true);
      assert.equal(getBody.source, 'defaults_iam_fallback');
      assert.equal(getBody.iamPermissionDenied, true);

      const postRes = await fetch(`${baseUrl}/api/platform/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer admin-tok',
        },
        body: JSON.stringify({ pricingRules: { baseFeeFCFA: 1000 } }),
      });
      assert.equal(postRes.status, 503);
      const postBody = await postRes.json();
      assert.equal(postBody.success, false);
      assert.equal(postBody.code, 'IAM_PERMISSION_DENIED');
    } finally {
      serverMod.setFirestoreAdminForTests(null);
      serverMod.setTokenVerifierForTests(null);
    }
  });

  await t.test('GET /api/kyc/document & POST /api/courier/kyc/cleanup-orphan enforce owner/admin auth, IDOR block, PDF MIME & active-dossier lock', async () => {
    const serverMod = await import('../../server');
    const storageFiles = new Map<string, { contentType: string; data: Buffer }>([
      ['kyc/courier_a/identity_photo_1.pdf', { contentType: 'application/pdf', data: Buffer.from('%PDF-1.4\nKYC') }],
      ['kyc/courier_a/orphan_2.jpg', { contentType: 'image/jpeg', data: Buffer.from('jpg-orphan') }],
    ]);

    let courierAKycStatus = 'en_attente';

    serverMod.setTokenVerifierForTests(async (tok) => {
      if (tok === 'admin-tok') {
        return { uid: 'admin_uid', email: 'Pamphile.gbede@gmail.com', email_verified: true, admin: true };
      }
      if (tok === 'courier-a-tok') {
        return { uid: 'courier_a', email: 'ca@livralink.bj', email_verified: true };
      }
      if (tok === 'courier-b-tok') {
        return { uid: 'courier_b', email: 'cb@livralink.bj', email_verified: true };
      }
      throw new Error('Invalid token');
    });

    serverMod.setFirestoreAdminForTests({
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            if (name === 'kyc' && id === 'courier_a') {
              return {
                exists: true,
                data: () => ({
                  id: 'courier_a',
                  userId: 'courier_a',
                  status: courierAKycStatus,
                  documentStoragePath: 'kyc/courier_a/identity_photo_1.pdf',
                }),
              };
            }
            return { exists: false, data: () => undefined };
          },
        }),
      }),
    });

    serverMod.setStorageBucketForTests({
      file: (filePath: string) => ({
        exists: async () => [storageFiles.has(filePath)],
        getMetadata: async () => [{ contentType: storageFiles.get(filePath)?.contentType }],
        download: async () => [storageFiles.get(filePath)?.data || Buffer.alloc(0)],
        delete: async () => {
          storageFiles.delete(filePath);
        },
      }),
    });

    try {
      // 1. Owner courier_a can fetch own PDF document with private cache headers
      const ownerRes = await fetch(
        `${baseUrl}/api/kyc/document?path=${encodeURIComponent('kyc/courier_a/identity_photo_1.pdf')}`,
        { headers: { Authorization: 'Bearer courier-a-tok' } }
      );
      assert.equal(ownerRes.status, 200);
      assert.equal(ownerRes.headers.get('content-type')?.includes('application/pdf'), true);
      assert.equal(ownerRes.headers.get('cache-control'), 'private, no-store, max-age=0');
      assert.equal(Buffer.from(await ownerRes.arrayBuffer()).toString('utf8'), '%PDF-1.4\nKYC');

      // 2. Super-Admin can fetch courier_a document
      const adminRes = await fetch(
        `${baseUrl}/api/kyc/document?path=${encodeURIComponent('kyc/courier_a/identity_photo_1.pdf')}`,
        { headers: { Authorization: 'Bearer admin-tok' } }
      );
      assert.equal(adminRes.status, 200);

      // 3. Courier B (IDOR) strictly rejected (403)
      const idorRes = await fetch(
        `${baseUrl}/api/kyc/document?path=${encodeURIComponent('kyc/courier_a/identity_photo_1.pdf')}`,
        { headers: { Authorization: 'Bearer courier-b-tok' } }
      );
      assert.equal(idorRes.status, 403);

      // 4. Invalid/traversal path rejected (400)
      const badPathRes = await fetch(
        `${baseUrl}/api/kyc/document?path=${encodeURIComponent('kyc/courier_a/../secret.txt')}`,
        { headers: { Authorization: 'Bearer admin-tok' } }
      );
      assert.equal(badPathRes.status, 400);

      // 5. Cleanup orphan blocked (409) when referenced by en_attente dossier
      const lockedCleanup = await fetch(`${baseUrl}/api/courier/kyc/cleanup-orphan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-a-tok' },
        body: JSON.stringify({ storagePath: 'kyc/courier_a/identity_photo_1.pdf' }),
      });
      assert.equal(lockedCleanup.status, 409);
      assert.equal(storageFiles.has('kyc/courier_a/identity_photo_1.pdf'), true);

      // 6. Cleanup orphan allowed (200) for unreferenced temporary file of courier_a
      const orphanCleanup = await fetch(`${baseUrl}/api/courier/kyc/cleanup-orphan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-a-tok' },
        body: JSON.stringify({ storagePath: 'kyc/courier_a/orphan_2.jpg' }),
      });
      assert.equal(orphanCleanup.status, 200);
      assert.equal(storageFiles.has('kyc/courier_a/orphan_2.jpg'), false);

      // 7. Cross-user orphan cleanup rejected (403)
      const crossCleanup = await fetch(`${baseUrl}/api/courier/kyc/cleanup-orphan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-b-tok' },
        body: JSON.stringify({ storagePath: 'kyc/courier_a/identity_photo_1.pdf' }),
      });
      assert.equal(crossCleanup.status, 403);
    } finally {
      serverMod.setStorageBucketForTests(null);
      serverMod.setFirestoreAdminForTests(null);
      serverMod.setTokenVerifierForTests(null);
    }
  });

  await t.test('POST /api/courier/kyc/authorize-upload & POST /api/admin/kyc/decision enforce KYC-STEP-C/F gating & IAM fallback', async () => {
    const serverMod = await import('../../server');
    let kycStatus: string | null = null;
    let userLockedStatus: string | null = null;
    let simulateIamDenied = false;

    serverMod.setTokenVerifierForTests(async (tok) => {
      if (tok === 'admin-tok') {
        return { uid: 'admin_uid', email: 'Pamphile.gbede@gmail.com', email_verified: true, admin: true };
      }
      if (tok === 'courier-a-tok') {
        return { uid: 'courier_a', email: 'ca@livralink.bj', email_verified: true };
      }
      throw new Error('Invalid token');
    });

    serverMod.setFirestoreAdminForTests({
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            if (simulateIamDenied) {
              const err: any = new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.');
              err.code = 7;
              throw err;
            }
            if (name === 'kyc' && id === 'courier_a' && kycStatus !== null) {
              return { exists: true, data: () => ({ id: 'courier_a', status: kycStatus }) };
            }
            if (name === 'users' && id === 'courier_a' && userLockedStatus !== null) {
              return {
                exists: true,
                data: () => ({
                  uid: 'courier_a',
                  isKycVerified: userLockedStatus === 'valide',
                  kycStatus: userLockedStatus,
                }),
              };
            }
            return { exists: false, data: () => undefined };
          },
        }),
      }),
    });

    try {
      // 0. Aucun dossier KYC -> 200 allowed=true, status=non_soumis
      const resAbsent = await fetch(`${baseUrl}/api/courier/kyc/authorize-upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer courier-a-tok' },
      });
      assert.equal(resAbsent.status, 200);
      const absentBody = await resAbsent.json();
      assert.equal(absentBody.allowed, true);
      assert.equal(absentBody.status, 'non_soumis');

      // 0b. /users verrouillé (valide) même sans /kyc -> 409 KYC-STEP-C
      userLockedStatus = 'valide';
      const resUserLocked = await fetch(`${baseUrl}/api/courier/kyc/authorize-upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer courier-a-tok' },
      });
      assert.equal(resUserLocked.status, 409);
      assert.equal((await resUserLocked.json()).stepCode, 'KYC-STEP-C');
      userLockedStatus = null;

      // 1. en_attente -> 409 KYC-STEP-C
      kycStatus = 'en_attente';
      const resPending = await fetch(`${baseUrl}/api/courier/kyc/authorize-upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer courier-a-tok' },
      });
      assert.equal(resPending.status, 409);
      assert.equal((await resPending.json()).stepCode, 'KYC-STEP-C');

      // 2. valide -> 409 KYC-STEP-C
      kycStatus = 'valide';
      const resValid = await fetch(`${baseUrl}/api/courier/kyc/authorize-upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer courier-a-tok' },
      });
      assert.equal(resValid.status, 409);

      // 3. refuse -> 200 allowed=true
      kycStatus = 'refuse';
      const resRefused = await fetch(`${baseUrl}/api/courier/kyc/authorize-upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer courier-a-tok' },
      });
      assert.equal(resRefused.status, 200);
      assert.equal((await resRefused.json()).allowed, true);

      // 4. IAM 7 PERMISSION_DENIED fallback on authorize-upload returns 200 iamFallback=true, and 503 KYC-STEP-F on admin decision
      simulateIamDenied = true;
      const resIamFallback = await fetch(`${baseUrl}/api/courier/kyc/authorize-upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer courier-a-tok' },
      });
      assert.equal(resIamFallback.status, 200);
      assert.equal((await resIamFallback.json()).iamFallback, true);

      const resDecision503 = await fetch(`${baseUrl}/api/admin/kyc/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
        body: JSON.stringify({ targetUid: 'courier_a', requestId: 'courier_a', decision: 'valide' }),
      });
      assert.equal(resDecision503.status, 503);
      const decisionBody = await resDecision503.json();
      assert.equal(decisionBody.stepCode, 'KYC-STEP-F');
      assert.equal(decisionBody.code, 'IAM_PERMISSION_DENIED');
    } finally {
      serverMod.setFirestoreAdminForTests(null);
      serverMod.setTokenVerifierForTests(null);
    }
  });

  await t.test('GET /api/admin/sync-overview & POST /api/users/sync-profile handle normal sync and IAM 7 PERMISSION_DENIED cleanly', async () => {
    const serverMod = await import('../../server');
    let simulateIamDenied = false;

    serverMod.setTokenVerifierForTests(async (tok) => {
      if (tok === 'admin-tok') {
        return { uid: 'admin_uid', email: 'Pamphile.gbede@gmail.com', email_verified: true, admin: true };
      }
      if (tok === 'courier-tok') {
        return { uid: 'courier_sync_1', email: 'courier_sync@livralink.bj', email_verified: true };
      }
      throw new Error('Invalid token');
    });

    const userDocs = new Map<string, Record<string, any>>();
    const kycDocs = new Map<string, Record<string, any>>([
      [
        'courier_sync_1',
        {
          id: 'courier_sync_1',
          userId: 'courier_sync_1',
          courierId: 'courier_sync_1',
          fullName: 'Koffi Synchro',
          status: 'en_attente',
          documentStoragePath: 'kyc/courier_sync_1/cni_1.pdf',
          documentMimeType: 'application/pdf',
        },
      ],
    ]);

    serverMod.setFirestoreAdminForTests({
      collection: (name: string) => ({
        get: async () => {
          if (simulateIamDenied) {
            const err: any = new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.');
            err.code = 7;
            throw err;
          }
          const source = name === 'kyc' ? kycDocs : name === 'users' ? userDocs : new Map();
          return {
            forEach: (cb: (docSnap: any) => void) => {
              for (const [id, data] of source.entries()) {
                cb({ id, data: () => data });
              }
            },
          };
        },
        doc: (id: string) => ({
          get: async () => {
            if (simulateIamDenied) {
              const err: any = new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.');
              err.code = 7;
              throw err;
            }
            const source = name === 'kyc' ? kycDocs : userDocs;
            const d = source.get(id);
            return { exists: Boolean(d), data: () => d };
          },
          set: async (payload: Record<string, any>) => {
            if (simulateIamDenied) {
              const err: any = new Error('7 PERMISSION_DENIED: Missing or insufficient permissions.');
              err.code = 7;
              throw err;
            }
            const source = name === 'kyc' ? kycDocs : userDocs;
            source.set(id, { ...(source.get(id) || {}), ...payload });
          },
        }),
      }),
    });

    try {
      // 1. Normal user sync-profile persists profile cleanly
      const syncProfileRes = await fetch(`${baseUrl}/api/users/sync-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-tok' },
        body: JSON.stringify({ fullName: 'Koffi Synchro', role: 'livreur', phone: '+22997001122' }),
      });
      assert.equal(syncProfileRes.status, 200);
      assert.equal((await syncProfileRes.json()).role, 'livreur');

      // 2. Normal admin sync-overview returns courier + KYC dossier
      const overviewOkRes = await fetch(`${baseUrl}/api/admin/sync-overview`, {
        headers: { Authorization: 'Bearer admin-tok' },
      });
      assert.equal(overviewOkRes.status, 200);
      const overviewOk = await overviewOkRes.json();
      assert.equal(overviewOk.success, true);
      assert.equal(overviewOk.kycRequests.some((k: any) => k.id === 'courier_sync_1' && k.status === 'en_attente'), true);
      assert.equal(overviewOk.users.some((u: any) => u.uid === 'courier_sync_1' && u.role === 'livreur'), true);

      // 3. IAM 7 PERMISSION_DENIED surfaces explicit diagnostics on sync-overview and 503 on sync-profile
      simulateIamDenied = true;
      const overviewIamRes = await fetch(`${baseUrl}/api/admin/sync-overview`, {
        headers: { Authorization: 'Bearer admin-tok' },
      });
      assert.equal(overviewIamRes.status, 200);
      const overviewIam = await overviewIamRes.json();
      assert.equal(overviewIam.iamDiagnostics.hasPermissionError, true);
      assert.equal(overviewIam.iamDiagnostics.missingRoles.includes('roles/datastore.user'), true);

      const syncProfileIamRes = await fetch(`${baseUrl}/api/users/sync-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-tok' },
        body: JSON.stringify({ fullName: 'Koffi Synchro', role: 'livreur' }),
      });
      assert.equal(syncProfileIamRes.status, 503);
      assert.equal((await syncProfileIamRes.json()).code, 'IAM_PERMISSION_DENIED');
    } finally {
      serverMod.setFirestoreAdminForTests(null);
      serverMod.setTokenVerifierForTests(null);
    }
  });

  await t.test('POD & Chat media routes (/api/pod/upload, /api/pod/media, /api/chat/upload, /api/chat/media) enforce strict participant isolation', async () => {
    const serverMod = await import('../../server');
    const storageFiles = new Map<string, { contentType: string; data: Buffer; metadata?: Record<string, any> }>();

    const deliveriesMap = new Map<string, Record<string, any>>([
      [
        'LL-POD-900',
        {
          id: 'LL-POD-900',
          merchantId: 'vendor_owner',
          courierId: 'courier_assigned',
          clientId: 'client_owner',
          status: 'en_cours',
        },
      ],
    ]);

    const conversationsMap = new Map<string, Record<string, any>>([
      [
        'conv_900',
        {
          id: 'conv_900',
          participantIds: ['vendor_owner', 'courier_assigned'],
        },
      ],
    ]);

    serverMod.setTokenVerifierForTests(async (tok) => {
      if (tok === 'admin-tok') return { uid: 'admin_uid', email: 'Pamphile.gbede@gmail.com', email_verified: true, admin: true };
      if (tok === 'courier-tok') return { uid: 'courier_assigned', email: 'courier@livralink.bj', email_verified: true };
      if (tok === 'vendor-tok') return { uid: 'vendor_owner', email: 'vendor@livralink.bj', email_verified: true };
      if (tok === 'client-tok') return { uid: 'client_owner', email: 'client@livralink.bj', email_verified: true };
      if (tok === 'outsider-tok') return { uid: 'outsider_uid', email: 'outsider@livralink.bj', email_verified: true };
      if (tok === 'unverified-tok') return { uid: 'unv_uid', email: 'unv@livralink.bj', email_verified: false };
      throw new Error('Invalid token');
    });

    serverMod.setFirestoreAdminForTests({
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            const source =
              name === 'deliveries'
                ? deliveriesMap
                : name === 'conversations'
                ? conversationsMap
                : new Map();
            const d = source.get(id);
            return { exists: Boolean(d), data: () => d };
          },
        }),
      }),
    });

    serverMod.setStorageBucketForTests({
      file: (filePath: string) => ({
        save: async (buffer: Buffer, opts?: any) => {
          storageFiles.set(filePath, {
            contentType: opts?.metadata?.contentType || 'application/octet-stream',
            data: Buffer.from(buffer),
            metadata: opts?.metadata?.metadata || {},
          });
        },
        exists: async () => [storageFiles.has(filePath)],
        getMetadata: async () => [{ contentType: storageFiles.get(filePath)?.contentType }],
        download: async () => [storageFiles.get(filePath)?.data || Buffer.alloc(0)],
      }),
    });

    const samplePngBase64 = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
      Buffer.from('fake-jpeg-image-bytes'),
    ]).toString('base64');
    const samplePdfBase64 = Buffer.from('%PDF-1.4\nchat-attachment').toString('base64');
    const spoofedHtmlBase64 = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');

    try {
      // 1. Unauthenticated / unverified / non-assigned courier cannot upload POD
      const unauthPodUp = await fetch(`${baseUrl}/api/pod/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: 'LL-POD-900', kind: 'photo', dataBase64: samplePngBase64, contentType: 'image/jpeg' }),
      });
      assert.equal(unauthPodUp.status, 401);

      const unverifiedPodUp = await fetch(`${baseUrl}/api/pod/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer unverified-tok' },
        body: JSON.stringify({ orderId: 'LL-POD-900', kind: 'photo', dataBase64: samplePngBase64, contentType: 'image/jpeg' }),
      });
      assert.equal(unverifiedPodUp.status, 403);

      const outsiderPodUp = await fetch(`${baseUrl}/api/pod/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer outsider-tok' },
        body: JSON.stringify({ orderId: 'LL-POD-900', kind: 'photo', dataBase64: samplePngBase64, contentType: 'image/jpeg' }),
      });
      assert.equal(outsiderPodUp.status, 403);

      // Bad MIME rejected on POD upload
      const badMimePodUp = await fetch(`${baseUrl}/api/pod/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-tok' },
        body: JSON.stringify({ orderId: 'LL-POD-900', kind: 'photo', dataBase64: samplePdfBase64, contentType: 'application/pdf' }),
      });
      assert.equal(badMimePodUp.status, 400);

      // 2. Assigned courier uploads POD photo & signature via Admin SDK proxy
      const courierPodUp = await fetch(`${baseUrl}/api/pod/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-tok' },
        body: JSON.stringify({ orderId: 'LL-POD-900', kind: 'photo', dataBase64: samplePngBase64, contentType: 'image/jpeg' }),
      });
      assert.equal(courierPodUp.status, 200);
      const podUpBody = await courierPodUp.json();
      assert.equal(podUpBody.success, true);
      assert.equal(podUpBody.storagePath.startsWith('pod/LL-POD-900/photo_'), true);
      assert.equal(podUpBody.mediaUrl.startsWith('/api/pod/media?path='), true);
      assert.equal(podUpBody.mediaUrl.includes('token='), false);
      assert.equal(storageFiles.get(podUpBody.storagePath)?.metadata?.uploadedBy, 'courier_assigned');

      // 3. Assigned courier, owning vendor, recipient client & Super-Admin can read POD; outsider strictly denied (403)
      for (const tok of ['courier-tok', 'vendor-tok', 'client-tok', 'admin-tok']) {
        const readRes = await fetch(`${baseUrl}${podUpBody.mediaUrl}`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        assert.equal(readRes.status, 200);
        assert.equal(readRes.headers.get('cache-control'), 'private, no-store, max-age=0');
        assert.equal(readRes.headers.get('x-content-type-options'), 'nosniff');
      }

      const outsiderPodRead = await fetch(`${baseUrl}${podUpBody.mediaUrl}`, {
        headers: { Authorization: 'Bearer outsider-tok' },
      });
      assert.equal(outsiderPodRead.status, 403);

      const traversalPodRead = await fetch(
        `${baseUrl}/api/pod/media?path=${encodeURIComponent('pod/LL-POD-900/../secret.jpg')}`,
        { headers: { Authorization: 'Bearer admin-tok' } }
      );
      assert.equal(traversalPodRead.status, 400);

      // 4. Non-participant cannot upload chat attachment; bad MIME rejected
      const outsiderChatUp = await fetch(`${baseUrl}/api/chat/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer outsider-tok' },
        body: JSON.stringify({ conversationId: 'conv_900', fileName: 'spy.pdf', dataBase64: samplePdfBase64, contentType: 'application/pdf' }),
      });
      assert.equal(outsiderChatUp.status, 403);

      const badMimeChatUp = await fetch(`${baseUrl}/api/chat/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
        body: JSON.stringify({ conversationId: 'conv_900', fileName: 'virus.exe', dataBase64: samplePngBase64, contentType: 'application/x-msdownload' }),
      });
      assert.equal(badMimeChatUp.status, 400);

      // 5. Participant uploads PDF attachment -> participants & Admin can read, outsider strictly blocked (403)
      const vendorChatUp = await fetch(`${baseUrl}/api/chat/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
        body: JSON.stringify({ conversationId: 'conv_900', fileName: 'facture.pdf', dataBase64: samplePdfBase64, contentType: 'application/pdf' }),
      });
      assert.equal(vendorChatUp.status, 200);
      const chatUpBody = await vendorChatUp.json();
      assert.equal(chatUpBody.success, true);
      assert.equal(chatUpBody.storagePath.startsWith('chat/conv_900/'), true);
      assert.equal(chatUpBody.mediaUrl.startsWith('/api/chat/media?path='), true);
      assert.equal(storageFiles.get(chatUpBody.storagePath)?.metadata?.uploadedBy, 'vendor_owner');

      for (const tok of ['vendor-tok', 'courier-tok', 'admin-tok']) {
        const readChatRes = await fetch(`${baseUrl}${chatUpBody.mediaUrl}`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        assert.equal(readChatRes.status, 200);
        assert.equal(readChatRes.headers.get('cache-control'), 'private, no-store, max-age=0');
      }

      const outsiderChatRead = await fetch(`${baseUrl}${chatUpBody.mediaUrl}`, {
        headers: { Authorization: 'Bearer outsider-tok' },
      });
      assert.equal(outsiderChatRead.status, 403);

      const traversalChatRead = await fetch(
        `${baseUrl}/api/chat/media?path=${encodeURIComponent('chat/conv_900/../secret.pdf')}`,
        { headers: { Authorization: 'Bearer admin-tok' } }
      );
      assert.equal(traversalChatRead.status, 400);

      // 6. Spoofed MIME (HTML payload claiming image/jpeg or application/pdf) must be rejected (400)
      const spoofedPodMime = await fetch(`${baseUrl}/api/pod/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-tok' },
        body: JSON.stringify({ orderId: 'LL-POD-900', kind: 'photo', dataBase64: spoofedHtmlBase64, contentType: 'image/jpeg' }),
      });
      assert.equal(spoofedPodMime.status, 400);

      const spoofedChatMime = await fetch(`${baseUrl}/api/chat/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
        body: JSON.stringify({ conversationId: 'conv_900', fileName: 'fake.pdf', dataBase64: spoofedHtmlBase64, contentType: 'application/pdf' }),
      });
      assert.equal(spoofedChatMime.status, 400);
    } finally {
      serverMod.setStorageBucketForTests(null);
      serverMod.setFirestoreAdminForTests(null);
      serverMod.setTokenVerifierForTests(null);
    }
  });

  await t.test('POST /api/users/sync-profile blocks body.email admin spoofing, role escalation, and unsafe avatarUrl XSS', async () => {
    const serverMod = await import('../../server');
    const userDocs = new Map<string, Record<string, any>>();

    serverMod.setTokenVerifierForTests(async (token: string) => {
      if (token === 'ordinary-tok') {
        return { uid: 'ordinary_u1', email: 'ordinary@livralink.bj', email_verified: true };
      }
      throw new Error('Invalid token');
    });

    serverMod.setFirestoreAdminForTests({
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: userDocs.has(id), data: () => userDocs.get(id) }),
          set: async (payload: Record<string, any>) => {
            userDocs.set(id, { ...(userDocs.get(id) || {}), ...payload });
          },
        }),
      }),
    });

    try {
      // 1. Spoofing body.email to super-admin + role: 'admin' must NEVER escalate privileges
      const spoofRes = await fetch(`${baseUrl}/api/users/sync-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ordinary-tok' },
        body: JSON.stringify({
          email: 'pamphile.gbede@gmail.com',
          role: 'admin',
          fullName: 'Attacker',
        }),
      });
      assert.equal(spoofRes.status, 200);
      const spoofBody = await spoofRes.json();
      assert.equal(spoofBody.role, 'vendeur');
      assert.equal(userDocs.get('ordinary_u1')?.email, 'ordinary@livralink.bj');
      assert.equal(userDocs.get('ordinary_u1')?.role, 'vendeur');

      // 2. Unsafe avatarUrl schemes (javascript:, data:text/html) must be rejected with 400
      for (const badAvatar of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://insecure.local/a.png']) {
        const xssRes = await fetch(`${baseUrl}/api/users/sync-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ordinary-tok' },
          body: JSON.stringify({
            fullName: 'Normal Name',
            avatarUrl: badAvatar,
          }),
        });
        assert.equal(xssRes.status, 400);
      }

      // 3. Valid https avatarUrl succeeds
      const okAvatarRes = await fetch(`${baseUrl}/api/users/sync-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ordinary-tok' },
        body: JSON.stringify({
          fullName: 'Normal Name',
          avatarUrl: 'https://cdn.example.com/avatar.png',
        }),
      });
      assert.equal(okAvatarRes.status, 200);
      assert.equal(userDocs.get('ordinary_u1')?.avatarUrl, 'https://cdn.example.com/avatar.png');
    } finally {
      serverMod.setFirestoreAdminForTests(null);
      serverMod.setTokenVerifierForTests(null);
    }
  });

  await t.test('Legacy Storage Media Migration helpers rewrite tokenized URLs to authenticated proxies idempotently', async () => {
    const {
      extractStoragePathFromLegacyUrl,
      planDeliveryPodMediaMigration,
      planChatMessageMediaMigration,
      planKycMediaMigration,
    } = await import('../server/legacyMediaMigration');

    const legacyPodPhoto =
      'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0654978401.firebasestorage.app/o/pod%2FLL-777%2Fphoto_123.jpg?alt=media&token=secret-tok';
    const parsedPod = extractStoragePathFromLegacyUrl(legacyPodPhoto);
    assert.equal(parsedPod?.storagePath, 'pod/LL-777/photo_123.jpg');
    assert.equal(parsedPod?.prefix, 'pod');
    assert.equal(parsedPod?.hadDownloadToken, true);

    const podPlan = planDeliveryPodMediaMigration('LL-777', {
      podData: {
        photoUrl: legacyPodPhoto,
        signatureDataUrl: '/api/pod/media?path=pod%2FLL-777%2Fsig_1.png',
      },
    });
    assert.ok(podPlan);
    assert.equal(podPlan.patch['podData.photoUrl'], '/api/pod/media?path=pod%2FLL-777%2Fphoto_123.jpg');
    assert.equal(podPlan.patch['podData.signatureDataUrl'], undefined);

    // Already migrated delivery returns null (idempotent)
    assert.equal(
      planDeliveryPodMediaMigration('LL-777', {
        podData: {
          photoUrl: '/api/pod/media?path=pod%2FLL-777%2Fphoto_123.jpg',
          signatureDataUrl: '/api/pod/media?path=pod%2FLL-777%2Fsig_1.png',
        },
      }),
      null
    );

    const legacyChatUrl =
      'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0654978401.firebasestorage.app/o/chat%2Forder_LL-777%2Finvoice.pdf?alt=media&token=chat-tok';
    const chatPlan = planChatMessageMediaMigration('order_LL-777', 'msg_1', {
      attachmentUrl: legacyChatUrl,
    });
    assert.ok(chatPlan);
    assert.equal(chatPlan.patch.attachmentUrl, '/api/chat/media?path=chat%2Forder_LL-777%2Finvoice.pdf');

    const legacyKycUrl =
      'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0654978401.firebasestorage.app/o/kyc%2Fcourier_99%2Fcni.jpg?alt=media&token=kyc-tok';
    const kycPlan = planKycMediaMigration('courier_99', {
      documentPhotoUrl: legacyKycUrl,
    });
    assert.ok(kycPlan);
    assert.equal(kycPlan.patch.documentStoragePath, 'kyc/courier_99/cni.jpg');
    assert.equal(kycPlan.patch.documentPhotoUrl, '');
  });

  await t.test('POST /api/courier/kyc/upload enforces email_verified, livreur role, 4 docTypes, KYC-STEP-C lock, magic bytes, and surfaces GCS IAM/Rules diagnostics cleanly', async () => {
    const serverMod = await import('../../server');
    const storageFiles = new Map<string, { contentType: string; data: Buffer; metadata?: Record<string, any> }>();
    let kycStatus: 'non_soumis' | 'en_attente' | 'valide' | 'refuse' = 'non_soumis';
    let simulateGcsForbidden = false;

    serverMod.setTokenVerifierForTests(async (tok) => {
      if (tok === 'courier-verified-tok') {
        return { uid: 'courier_kyc_up', email: 'courier@livralink.bj', email_verified: true };
      }
      if (tok === 'vendor-verified-tok') {
        return { uid: 'vendor_not_courier', email: 'vendor@livralink.bj', email_verified: true };
      }
      if (tok === 'unverified-tok') {
        return { uid: 'courier_unv', email: 'unv@livralink.bj', email_verified: false };
      }
      throw new Error('Invalid token');
    });

    serverMod.setFirestoreAdminForTests({
      collection: (name: string) => ({
        doc: (docId: string) => ({
          get: async () => {
            if (name === 'users') {
              if (docId === 'vendor_not_courier') {
                return { exists: true, data: () => ({ uid: 'vendor_not_courier', role: 'vendeur' }) };
              }
              if (docId === 'courier_kyc_up') {
                return { exists: true, data: () => ({ uid: 'courier_kyc_up', role: 'livreur', isKycVerified: false }) };
              }
              return { exists: false, data: () => undefined };
            }
            if (name === 'kyc') {
              if (kycStatus === 'non_soumis') return { exists: false, data: () => undefined };
              return { exists: true, data: () => ({ status: kycStatus }) };
            }
            return { exists: false, data: () => undefined };
          },
        }),
      }),
    });

    serverMod.setStorageBucketForTests({
      file: (path: string) => ({
        save: async (buf: Buffer, opts: any) => {
          if (simulateGcsForbidden) {
            const err: any = new Error('Forbidden: storage.objects.create PERMISSION_DENIED');
            err.code = 403;
            throw err;
          }
          storageFiles.set(path, {
            contentType: opts?.metadata?.contentType || 'application/octet-stream',
            data: buf,
            metadata: opts?.metadata?.metadata || {},
          });
        },
      }),
    });

    const validJpgBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).toString('base64');
    const spoofedHtmlBase64 = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');

    try {
      // 1. Unauthenticated -> 401
      const unauthRes = await fetch(`${baseUrl}/api/courier/kyc/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType: 'id_front', contentType: 'image/jpeg', dataBase64: validJpgBase64 }),
      });
      assert.equal(unauthRes.status, 401);

      // 2. Unverified email -> 403
      const unvRes = await fetch(`${baseUrl}/api/courier/kyc/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer unverified-tok' },
        body: JSON.stringify({ docType: 'id_front', contentType: 'image/jpeg', dataBase64: validJpgBase64 }),
      });
      assert.equal(unvRes.status, 403);

      // 2b. Non-livreur account (vendeur) -> 403 KYC-STEP-A
      const vendorRes = await fetch(`${baseUrl}/api/courier/kyc/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-verified-tok' },
        body: JSON.stringify({ docType: 'id_front', contentType: 'image/jpeg', dataBase64: validJpgBase64 }),
      });
      assert.equal(vendorRes.status, 403);
      assert.equal((await vendorRes.json()).stepCode, 'KYC-STEP-A');

      // 2c. Unsupported docType (ex: removed 'vehicle_insurance', legacy 'cni', or arbitrary string) -> 400 KYC-STEP-B
      for (const forbiddenDocType of ['cni', 'vehicle_insurance', 'driving_license']) {
        const badDocTypeRes = await fetch(`${baseUrl}/api/courier/kyc/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-verified-tok' },
          body: JSON.stringify({ docType: forbiddenDocType, contentType: 'image/jpeg', dataBase64: validJpgBase64 }),
        });
        assert.equal(badDocTypeRes.status, 400);
        assert.equal((await badDocTypeRes.json()).stepCode, 'KYC-STEP-B');
      }

      // 3. Pending or validated KYC dossier -> 409 KYC-STEP-C
      for (const blockedStatus of ['en_attente', 'valide'] as const) {
        kycStatus = blockedStatus;
        const lockedRes = await fetch(`${baseUrl}/api/courier/kyc/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-verified-tok' },
          body: JSON.stringify({ docType: 'id_front', contentType: 'image/jpeg', dataBase64: validJpgBase64 }),
        });
        assert.equal(lockedRes.status, 409);
        assert.equal((await lockedRes.json()).stepCode, 'KYC-STEP-C');
      }

      // 4. Spoofed MIME / magic bytes -> 400 KYC-STEP-B
      kycStatus = 'refuse';
      const spoofRes = await fetch(`${baseUrl}/api/courier/kyc/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-verified-tok' },
        body: JSON.stringify({ docType: 'id_front', contentType: 'image/jpeg', dataBase64: spoofedHtmlBase64 }),
      });
      assert.equal(spoofRes.status, 400);
      assert.equal((await spoofRes.json()).stepCode, 'KYC-STEP-B');

      // 5. Valid JPG upload succeeds and stores strict private object under kyc/{uid}/{docType}/ with uploadedBy metadata
      const okRes = await fetch(`${baseUrl}/api/courier/kyc/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-verified-tok' },
        body: JSON.stringify({
          docType: 'id_front',
          originalFileName: 'carte_recto.jpg',
          contentType: 'image/jpeg',
          dataBase64: validJpgBase64,
        }),
      });
      assert.equal(okRes.status, 200);
      const okBody = await okRes.json();
      assert.equal(okBody.success, true);
      assert.equal(okBody.docType, 'id_front');
      assert.match(okBody.storagePath, /^kyc\/courier_kyc_up\/id_front\/id_front_\d+_[a-f0-9]+\.jpg$/);
      assert.equal(storageFiles.get(okBody.storagePath)?.metadata?.uploadedBy, 'courier_kyc_up');
      assert.equal(storageFiles.get(okBody.storagePath)?.metadata?.docType, 'id_front');
      assert.equal(storageFiles.get(okBody.storagePath)?.metadata?.firebaseStorageDownloadTokens, undefined);

      // 6. GCS 403 / PERMISSION_DENIED returns actionable 503 STORAGE_IAM_OR_RULES_REQUIRED
      simulateGcsForbidden = true;
      const gcsErrRes = await fetch(`${baseUrl}/api/courier/kyc/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-verified-tok' },
        body: JSON.stringify({ docType: 'id_front', contentType: 'image/jpeg', dataBase64: validJpgBase64 }),
      });
      assert.equal(gcsErrRes.status, 503);
      const gcsErrBody = await gcsErrRes.json();
      assert.equal(gcsErrBody.stepCode, 'KYC-STEP-B');
      assert.equal(gcsErrBody.code, 'STORAGE_IAM_OR_RULES_REQUIRED');
    } finally {
      serverMod.setStorageBucketForTests(null);
      serverMod.setFirestoreAdminForTests(null);
      serverMod.setTokenVerifierForTests(null);
    }
  });

  await t.test('KYC end-to-end server lifecycle: 4-slot uploads, notify-submitted, cleanup guard, admin inspection, reject, resubmit, and approve', async () => {
    const serverMod = await import('../../server');
    const storageFiles = new Map<string, { contentType: string; data: Buffer; metadata?: Record<string, any> }>();
    const collections = new Map<string, Map<string, Record<string, any>>>([
      [
        'users',
        new Map([
          ['courier_e2e', { uid: 'courier_e2e', email: 'e2e@livralink.bj', fullName: 'Koffi E2E', role: 'livreur', isKycVerified: false, kycStatus: 'non_soumis' }],
          ['super_admin_e2e', { uid: 'super_admin_e2e', email: 'pamphile.gbede@gmail.com', fullName: 'Super Admin', role: 'admin' }],
        ]),
      ],
      ['admins', new Map([['super_admin_e2e', { uid: 'super_admin_e2e', email: 'pamphile.gbede@gmail.com' }]])],
      ['kyc', new Map()],
      ['notifications', new Map()],
      ['deliveries', new Map()],
      ['priority_missions', new Map()],
    ]);
    let simulateFirestorePrecheckError = false;

    serverMod.setTokenVerifierForTests(async (tok) => {
      if (tok === 'courier-e2e-tok') {
        return { uid: 'courier_e2e', email: 'e2e@livralink.bj', email_verified: true, kycLocked: false };
      }
      if (tok === 'courier-locked-tok') {
        return { uid: 'courier_e2e', email: 'e2e@livralink.bj', email_verified: true, kycLocked: true };
      }
      if (tok === 'outsider-e2e-tok') {
        return { uid: 'outsider_e2e', email: 'out@livralink.bj', email_verified: true };
      }
      if (tok === 'admin-e2e-tok') {
        return { uid: 'super_admin_e2e', email: 'pamphile.gbede@gmail.com', email_verified: true };
      }
      throw new Error('Invalid token');
    });

    const getCol = (name: string) => {
      if (!collections.has(name)) collections.set(name, new Map());
      return collections.get(name)!;
    };

    serverMod.setFirestoreAdminForTests({
      collection: (name: string) => ({
        get: async () => ({
          docs: Array.from(getCol(name).entries()).map(([id, data]) => ({ id, data: () => data })),
          forEach: (cb: (snap: { id: string; data: () => Record<string, any> }) => void) => {
            for (const [id, data] of getCol(name).entries()) {
              cb({ id, data: () => data });
            }
          },
        }),
        doc: (id: string) => ({
          _col: name,
          _id: id,
          get: async () => {
            if (simulateFirestorePrecheckError) {
              const err: any = new Error('7 PERMISSION_DENIED');
              err.code = 7;
              throw err;
            }
            const col = getCol(name);
            return { id, exists: col.has(id), data: () => col.get(id) };
          },
          set: async (payload: Record<string, any>, opts?: { merge?: boolean }) => {
            const col = getCol(name);
            const prev = opts?.merge ? col.get(id) || {} : {};
            col.set(id, { ...prev, ...payload });
          },
        }),
      }),
      batch: () => {
        const ops: Array<() => void> = [];
        return {
          set: (ref: { _col: string; _id: string }, payload: Record<string, any>, opts?: { merge?: boolean }) => {
            ops.push(() => {
              const col = getCol(ref._col);
              const prev = opts?.merge ? col.get(ref._id) || {} : {};
              col.set(ref._id, { ...prev, ...payload });
            });
          },
          commit: async () => {
            ops.forEach((fn) => fn());
          },
        };
      },
    });

    serverMod.setStorageBucketForTests({
      file: (path: string) => ({
        save: async (buf: Buffer, opts: any) => {
          storageFiles.set(path, {
            contentType: opts?.metadata?.contentType || 'application/octet-stream',
            data: buf,
            metadata: opts?.metadata?.metadata || {},
          });
        },
        exists: async () => [storageFiles.has(path)],
        getMetadata: async () => [{ contentType: storageFiles.get(path)?.contentType || 'application/pdf' }],
        download: async () => [storageFiles.get(path)?.data || Buffer.alloc(0)],
        delete: async () => {
          storageFiles.delete(path);
        },
      }),
    });

    const samplePdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64');

    try {
      // 1. When Firestore precheck fails, kycLocked: true claim MUST block upload with 409 KYC-STEP-C
      simulateFirestorePrecheckError = true;
      const lockedClaimRes = await fetch(`${baseUrl}/api/courier/kyc/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-locked-tok' },
        body: JSON.stringify({ docType: 'id_front', contentType: 'application/pdf', dataBase64: samplePdfBase64 }),
      });
      assert.equal(lockedClaimRes.status, 409);
      assert.equal((await lockedClaimRes.json()).stepCode, 'KYC-STEP-C');
      simulateFirestorePrecheckError = false;

      // 2. Courier uploads required ID docs + optional 2-sided driving license (recto & verso)
      const docTypes = ['id_front', 'id_back', 'driving_license_front', 'driving_license_back'] as const;
      const uploadedByType: Record<string, any> = {};
      for (const dt of docTypes) {
        const upRes = await fetch(`${baseUrl}/api/courier/kyc/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-e2e-tok' },
          body: JSON.stringify({ docType: dt, contentType: 'application/pdf', dataBase64: samplePdfBase64 }),
        });
        assert.equal(upRes.status, 200);
        const upBody = await upRes.json();
        assert.equal(upBody.contentType, 'application/pdf');
        assert.match(upBody.storagePath, new RegExp(`^kyc/courier_e2e/${dt}/${dt}_\\d+_[a-f0-9]+\\.pdf$`));
        uploadedByType[dt] = upBody;
      }

      // Persist KYC dossier (with required idFront/idBack + optional drivingLicenseFront/Back)
      const submittedAtIso = new Date().toISOString();
      getCol('kyc').set('courier_e2e', {
        id: 'courier_e2e',
        userId: 'courier_e2e',
        courierId: 'courier_e2e',
        fullName: 'Koffi E2E',
        phone: '+22997001122',
        email: 'e2e@livralink.bj',
        idType: 'CIP',
        vehicleType: 'Moto 125cc',
        status: 'en_attente',
        submittedAt: submittedAtIso,
        documentStoragePath: uploadedByType.id_front.storagePath,
        documentMimeType: uploadedByType.id_front.contentType,
        documents: {
          idFront: {
            uploaded: true,
            storagePath: uploadedByType.id_front.storagePath,
            docType: 'id_front',
            fileName: uploadedByType.id_front.fileName,
            mimeType: 'application/pdf',
            size: uploadedByType.id_front.size,
            uploadedAt: submittedAtIso,
            uploadedBy: 'courier_e2e',
          },
          idBack: {
            uploaded: true,
            storagePath: uploadedByType.id_back.storagePath,
            docType: 'id_back',
            fileName: uploadedByType.id_back.fileName,
            mimeType: 'application/pdf',
            size: uploadedByType.id_back.size,
            uploadedAt: submittedAtIso,
            uploadedBy: 'courier_e2e',
          },
          drivingLicenseFront: {
            uploaded: true,
            storagePath: uploadedByType.driving_license_front.storagePath,
            docType: 'driving_license_front',
            fileName: uploadedByType.driving_license_front.fileName,
            mimeType: 'application/pdf',
            size: uploadedByType.driving_license_front.size,
            uploadedAt: submittedAtIso,
            uploadedBy: 'courier_e2e',
          },
          drivingLicenseBack: {
            uploaded: true,
            storagePath: uploadedByType.driving_license_back.storagePath,
            docType: 'driving_license_back',
            fileName: uploadedByType.driving_license_back.fileName,
            mimeType: 'application/pdf',
            size: uploadedByType.driving_license_back.size,
            uploadedAt: submittedAtIso,
            uploadedBy: 'courier_e2e',
          },
          cni: true,
          permis: true,
        },
      });

      // 2b. Notify admins on submission (idempotent deduplicated notifications with actionView: admin_kyc)
      const notifyRes1 = await fetch(`${baseUrl}/api/courier/kyc/notify-submitted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-e2e-tok' },
      });
      assert.equal(notifyRes1.status, 200);
      const notifyBody1 = await notifyRes1.json();
      assert.equal(notifyBody1.success, true);
      assert.equal(notifyBody1.notifiedAdminCount, 1);

      const notifyRes2 = await fetch(`${baseUrl}/api/courier/kyc/notify-submitted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-e2e-tok' },
      });
      assert.equal(notifyRes2.status, 200);
      assert.equal(getCol('notifications').size, 1, 'Duplicate notify-submitted must remain deduplicated');
      const adminNotif = Array.from(getCol('notifications').values())[0];
      assert.equal(adminNotif.recipientId, 'super_admin_e2e');
      assert.equal(adminNotif.actionView, 'admin_kyc');

      // 2c. Active documents cannot be deleted via cleanup-orphan (409), while unreferenced orphan succeeds
      const protectedCleanupRes = await fetch(`${baseUrl}/api/courier/kyc/cleanup-orphan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-e2e-tok' },
        body: JSON.stringify({ storagePath: uploadedByType.driving_license_back.storagePath }),
      });
      assert.equal(protectedCleanupRes.status, 409);

      const orphanPath = 'kyc/courier_e2e/id_back/id_back_orphan_999.pdf';
      storageFiles.set(orphanPath, { contentType: 'application/pdf', data: Buffer.from('%PDF-1.4') });
      const okCleanupRes = await fetch(`${baseUrl}/api/courier/kyc/cleanup-orphan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-e2e-tok' },
        body: JSON.stringify({ storagePath: orphanPath }),
      });
      assert.equal(okCleanupRes.status, 200);
      assert.equal(storageFiles.has(orphanPath), false);

      // 3. Super-Admin retrieves KYC dossier in sync-overview and reads private PDFs; outsider gets 403
      const syncRes = await fetch(`${baseUrl}/api/admin/sync-overview`, {
        headers: { Authorization: 'Bearer admin-e2e-tok' },
      });
      assert.equal(syncRes.status, 200);
      const syncBody = await syncRes.json();
      assert.equal(syncBody.kycRequests.length, 1);
      assert.equal(syncBody.kycRequests[0].documentStoragePath, uploadedByType.id_front.storagePath);

      const adminDocRes = await fetch(`${baseUrl}/api/kyc/document?path=${encodeURIComponent(uploadedByType.driving_license_back.storagePath)}`, {
        headers: { Authorization: 'Bearer admin-e2e-tok' },
      });
      assert.equal(adminDocRes.status, 200);
      assert.equal(adminDocRes.headers.get('content-type'), 'application/pdf');

      const ownerDocRes = await fetch(`${baseUrl}/api/kyc/document?path=${encodeURIComponent(uploadedByType.driving_license_front.storagePath)}`, {
        headers: { Authorization: 'Bearer courier-e2e-tok' },
      });
      assert.equal(ownerDocRes.status, 200);

      const outsiderDocRes = await fetch(`${baseUrl}/api/kyc/document?path=${encodeURIComponent(uploadedByType.id_front.storagePath)}`, {
        headers: { Authorization: 'Bearer outsider-e2e-tok' },
      });
      assert.equal(outsiderDocRes.status, 403);

      // 4. Super-Admin rejects dossier -> status becomes 'refuse', courier can upload again
      const rejectRes = await fetch(`${baseUrl}/api/admin/kyc/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-e2e-tok' },
        body: JSON.stringify({ targetUid: 'courier_e2e', requestId: 'courier_e2e', decision: 'refuse', reason: 'Recto illisible' }),
      });
      assert.equal(rejectRes.status, 200);
      assert.equal(getCol('kyc').get('courier_e2e')?.status, 'refuse');
      assert.equal(getCol('users').get('courier_e2e')?.kycStatus, 'refuse');
      assert.equal(getCol('users').get('courier_e2e')?.isKycVerified, false);

      // Even if a stale kycLocked: true token hits /api/courier/kyc/upload, Firestore status 'refuse' allows resubmission
      const resubmitUploadRes = await fetch(`${baseUrl}/api/courier/kyc/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-locked-tok' },
        body: JSON.stringify({ docType: 'id_front', contentType: 'application/pdf', dataBase64: samplePdfBase64 }),
      });
      assert.equal(resubmitUploadRes.status, 200);

      // 5. Super-Admin approves -> kyc/users/notifications updated atomically
      const approveRes = await fetch(`${baseUrl}/api/admin/kyc/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-e2e-tok' },
        body: JSON.stringify({ targetUid: 'courier_e2e', requestId: 'courier_e2e', decision: 'valide' }),
      });
      assert.equal(approveRes.status, 200);
      assert.equal(getCol('kyc').get('courier_e2e')?.status, 'valide');
      assert.equal(getCol('kyc').get('courier_e2e')?.isApproved, true);
      assert.equal(getCol('users').get('courier_e2e')?.kycStatus, 'valide');
      assert.equal(getCol('users').get('courier_e2e')?.isKycVerified, true);
      assert.equal(getCol('notifications').size, 3);
    } finally {
      serverMod.setStorageBucketForTests(null);
      serverMod.setFirestoreAdminForTests(null);
      serverMod.setTokenVerifierForTests(null);
    }
  });

  await t.test('KYC optional driving license combinations (none, front-only, back-only, both) pass notify-submitted and admin decision', async () => {
    const serverMod = await import('../../server');
    const combinations: Array<{
      label: string;
      includeFront: boolean;
      includeBack: boolean;
      expectedCount: number;
    }> = [
      { label: '0 license photo (idFront+idBack only)', includeFront: false, includeBack: false, expectedCount: 2 },
      { label: 'front only', includeFront: true, includeBack: false, expectedCount: 3 },
      { label: 'back only', includeFront: false, includeBack: true, expectedCount: 3 },
      { label: 'both front and back', includeFront: true, includeBack: true, expectedCount: 4 },
    ];

    for (let idx = 0; idx < combinations.length; idx += 1) {
      const combo = combinations[idx];
      const uid = `courier_opt_${idx}`;
      const collections = new Map<string, Map<string, Record<string, any>>>([
        [
          'users',
          new Map([
            [uid, { uid, email: `${uid}@livralink.bj`, fullName: `Courier ${idx}`, role: 'livreur', isKycVerified: false, kycStatus: 'non_soumis' }],
            ['super_admin_opt', { uid: 'super_admin_opt', email: 'pamphile.gbede@gmail.com', fullName: 'Super Admin', role: 'admin' }],
          ]),
        ],
        ['admins', new Map([['super_admin_opt', { uid: 'super_admin_opt', email: 'pamphile.gbede@gmail.com' }]])],
        ['kyc', new Map()],
        ['notifications', new Map()],
      ]);

      serverMod.setTokenVerifierForTests(async (tok) => {
        if (tok === 'courier-opt-tok') return { uid, email: `${uid}@livralink.bj`, email_verified: true };
        if (tok === 'admin-opt-tok') return { uid: 'super_admin_opt', email: 'pamphile.gbede@gmail.com', email_verified: true };
        throw new Error('Invalid token');
      });

      const getCol = (name: string) => {
        if (!collections.has(name)) collections.set(name, new Map());
        return collections.get(name)!;
      };

      serverMod.setFirestoreAdminForTests({
        collection: (name: string) => ({
          get: async () => ({
            docs: Array.from(getCol(name).entries()).map(([id, data]) => ({ id, data: () => data })),
            forEach: (cb: (snap: { id: string; data: () => Record<string, any> }) => void) => {
              for (const [id, data] of getCol(name).entries()) cb({ id, data: () => data });
            },
          }),
          doc: (id: string) => ({
            _col: name,
            _id: id,
            get: async () => {
              const col = getCol(name);
              return { id, exists: col.has(id), data: () => col.get(id) };
            },
            set: async (payload: Record<string, any>, opts?: { merge?: boolean }) => {
              const col = getCol(name);
              const prev = opts?.merge ? col.get(id) || {} : {};
              col.set(id, { ...prev, ...payload });
            },
          }),
        }),
        batch: () => {
          const ops: Array<() => void> = [];
          return {
            set: (ref: { _col: string; _id: string }, payload: Record<string, any>, opts?: { merge?: boolean }) => {
              ops.push(() => {
                const col = getCol(ref._col);
                const prev = opts?.merge ? col.get(ref._id) || {} : {};
                col.set(ref._id, { ...prev, ...payload });
              });
            },
            commit: async () => ops.forEach((fn) => fn()),
          };
        },
      });

      try {
        const docs: Record<string, any> = {
          idFront: {
            uploaded: true,
            storagePath: `kyc/${uid}/id_front/id_front_1.pdf`,
            docType: 'id_front',
            fileName: 'id_front_1.pdf',
            mimeType: 'application/pdf',
            uploadedBy: uid,
          },
          idBack: {
            uploaded: true,
            storagePath: `kyc/${uid}/id_back/id_back_1.pdf`,
            docType: 'id_back',
            fileName: 'id_back_1.pdf',
            mimeType: 'application/pdf',
            uploadedBy: uid,
          },
          cni: true,
          permis: combo.includeFront || combo.includeBack,
        };
        if (combo.includeFront) {
          docs.drivingLicenseFront = {
            uploaded: true,
            storagePath: `kyc/${uid}/driving_license_front/dl_front_1.pdf`,
            docType: 'driving_license_front',
            fileName: 'dl_front_1.pdf',
            mimeType: 'application/pdf',
            uploadedBy: uid,
          };
        }
        if (combo.includeBack) {
          docs.drivingLicenseBack = {
            uploaded: true,
            storagePath: `kyc/${uid}/driving_license_back/dl_back_1.pdf`,
            docType: 'driving_license_back',
            fileName: 'dl_back_1.pdf',
            mimeType: 'application/pdf',
            uploadedBy: uid,
          };
        }

        getCol('kyc').set(uid, {
          id: uid,
          userId: uid,
          courierId: uid,
          fullName: `Courier ${idx}`,
          status: 'en_attente',
          submittedAt: new Date().toISOString(),
          documentStoragePath: `kyc/${uid}/id_front/id_front_1.pdf`,
          documents: docs,
        });

        const notifyRes = await fetch(`${baseUrl}/api/courier/kyc/notify-submitted`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-opt-tok' },
        });
        assert.equal(notifyRes.status, 200, `${combo.label}: notify-submitted failed`);
        const adminNotif = Array.from(getCol('notifications').values())[0];
        assert.equal(adminNotif.message.includes(`${combo.expectedCount} justificatif(s)`), true, `${combo.label}: expected ${combo.expectedCount} justificatif(s) in "${adminNotif.message}"`);

        const approveRes = await fetch(`${baseUrl}/api/admin/kyc/decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-opt-tok' },
          body: JSON.stringify({ targetUid: uid, requestId: uid, decision: 'valide' }),
        });
        assert.equal(approveRes.status, 200, `${combo.label}: admin approval failed`);
        assert.equal(getCol('kyc').get(uid)?.status, 'valide');
      } finally {
        serverMod.setFirestoreAdminForTests(null);
        serverMod.setTokenVerifierForTests(null);
      }
    }
  });
});


