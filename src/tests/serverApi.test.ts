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
    let kycStatus = 'en_attente';
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
            if (name === 'kyc' && id === 'courier_a') {
              return { exists: true, data: () => ({ id: 'courier_a', status: kycStatus }) };
            }
            return { exists: false, data: () => undefined };
          },
        }),
      }),
    });

    try {
      // 1. en_attente -> 409 KYC-STEP-C
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
});

