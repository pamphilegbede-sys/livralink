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
});
