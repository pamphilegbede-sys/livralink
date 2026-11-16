/**
 * Real Firebase Firestore & Auth Emulator Integration Test Suite — LivraLink P0
 *
 * Tests real optimistic Firestore transactions, real multi-process Express HTTP
 * servers (`server.ts` spawned twice on distinct ports), real Firebase Auth Emulator
 * ID tokens, real concurrency (`Promise.all`), exclusive payout `processingExpiresAt`
 * leases, administrative reconciliation, and HTTP 503 blocking in production when
 * `OTP_SECRET_SALT` is missing or < 32 characters.
 */

import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import { initializeApp, getApps, deleteApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import {
  createP0SecurityService,
  getPayoutIdempotencyDocId,
  P0FirestoreLike,
  PayoutProviderAdapter,
} from '../server/p0Security';

const PROJECT_ID = 'gen-lang-client-0654978401';
const NAMED_DB_ID = 'ai-studio-livralink-f9d2844b-bf6d-492f-9504-2721bd1820b6';
const SHARED_SECRET_32 = 'livralink-real-emulator-shared-hmac-secret-2026-v1';

const FIRESTORE_EMU = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_EMU = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMU;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMU;

let appA: App;
let appB: App;
let dbA: Firestore;
let dbB: Firestore;
let authAdmin: Auth;

async function clearNamedFirestoreEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_EMU}/emulator/v1/projects/${PROJECT_ID}/databases/${NAMED_DB_ID}/documents`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    throw new Error(`Failed to clear named Firestore emulator: ${res.status}`);
  }
}

async function clearAuthEmulator(): Promise<void> {
  const res = await fetch(
    `http://${AUTH_EMU}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    throw new Error(`Failed to clear Auth emulator: ${res.status}`);
  }
}

async function createVerifiedEmulatorUserAndToken(params: {
  uid: string;
  email: string;
  password: string;
}): Promise<string> {
  await authAdmin.createUser({
    uid: params.uid,
    email: params.email,
    password: params.password,
    emailVerified: true,
  });

  const signInRes = await fetch(
    `http://${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-emulator-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.email,
        password: params.password,
        returnSecureToken: true,
      }),
    }
  );
  const body = await signInRes.json();
  if (!signInRes.ok || !body.idToken) {
    throw new Error(`Auth emulator signInWithPassword failed: ${JSON.stringify(body)}`);
  }
  return body.idToken as string;
}

async function spawnServerInstance(params: {
  port: number;
  envOverrides: Record<string, string | undefined>;
}): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') {
      childEnv[k] = v;
    }
  }
  childEnv.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMU;
  childEnv.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMU;
  childEnv.NODE_ENV = 'production';
  childEnv.PORT = String(params.port);
  delete childEnv.DEFAULT_APP_PORT;
  delete childEnv.OTP_SECRET_SALT;
  delete childEnv.POD_OTP_HMAC_SECRET;

  for (const [k, v] of Object.entries(params.envOverrides)) {
    if (v === undefined) {
      delete childEnv[k];
    } else {
      childEnv[k] = v;
    }
  }

  const proc: ChildProcess = spawn(
    process.execPath,
    ['--import', 'tsx', 'server.ts', '--port', String(params.port)],
    {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let logs = '';
  proc.stdout?.on('data', (chunk) => {
    logs += chunk.toString();
  });
  proc.stderr?.on('data', (chunk) => {
    logs += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${params.port}`;
  const deadline = Date.now() + 25_000;
  let ready = false;

  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`Server on port ${params.port} exited prematurely (${proc.exitCode}):\n${logs}`);
    }
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // Wait for socket bind
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!ready) {
    proc.kill('SIGKILL');
    throw new Error(`Timed out waiting for server on port ${params.port}:\n${logs}`);
  }

  return {
    baseUrl,
    stop: async () => {
      if (proc.exitCode !== null) return;
      proc.kill('SIGTERM');
      await Promise.race([
        new Promise<void>((resolve) => proc.once('exit', () => resolve())),
        new Promise<void>((resolve) => setTimeout(() => {
          proc.kill('SIGKILL');
          resolve();
        }, 3000)),
      ]);
    },
  };
}

describe('Real Firestore & Auth Emulator P0 Security + Multi-Instance Integration Suite', () => {
  before(async () => {
    appA =
      getApps().find((a) => a.name === 'emu-p0-inst-a') ||
      initializeApp({ projectId: PROJECT_ID }, 'emu-p0-inst-a');
    appB =
      getApps().find((a) => a.name === 'emu-p0-inst-b') ||
      initializeApp({ projectId: PROJECT_ID }, 'emu-p0-inst-b');

    dbA = getFirestore(appA, NAMED_DB_ID);
    dbB = getFirestore(appB, NAMED_DB_ID);
    authAdmin = getAuth(appA);
  });

  after(async () => {
    await Promise.all([deleteApp(appA).catch(() => {}), deleteApp(appB).catch(() => {})]);
  });

  beforeEach(async () => {
    await clearNamedFirestoreEmulator();
    await clearAuthEmulator();
  });

  test('1. Real Firestore Emulator Transactions: P0-A OTP, 3 attempts, 60s cooldown, 10m expiry, single-use token & Promise.all conflict', async () => {
    let now = 1_750_000_000_000;
    const svcA = createP0SecurityService(dbA as unknown as P0FirestoreLike, {
      getSecretSalt: () => SHARED_SECRET_32,
      now: () => now,
    });
    const svcB = createP0SecurityService(dbB as unknown as P0FirestoreLike, {
      getSecretSalt: () => SHARED_SECRET_32,
      now: () => now,
    });

    const issued = await svcA.issuePasswordResetOtp('emu1@livralink.bj');
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    // Resend within 60s on second Firestore Admin client rejected (429)
    now += 25_000;
    const tooSoon = await svcB.issuePasswordResetOtp('emu1@livralink.bj');
    assert.equal(tooSoon.ok, false);
    if (!tooSoon.ok) assert.equal(tooSoon.status, 429);

    // 2 wrong attempts across A and B, then 1 valid attempt on B
    const wrong = issued.rawCode === '111111' ? '222222' : '111111';
    const f1 = await svcA.verifyPasswordResetOtp('emu1@livralink.bj', wrong);
    assert.equal(f1.ok, false);
    if (!f1.ok) assert.equal(f1.attemptsLeft, 2);

    const f2 = await svcB.verifyPasswordResetOtp('emu1@livralink.bj', wrong);
    assert.equal(f2.ok, false);
    if (!f2.ok) assert.equal(f2.attemptsLeft, 1);

    const okVerify = await svcB.verifyPasswordResetOtp('emu1@livralink.bj', issued.rawCode);
    assert.equal(okVerify.ok, true);
    if (!okVerify.ok) return;

    // Real Firestore optimistic transaction contention via Promise.all
    const [c1, c2] = await Promise.all([
      svcA.consumePasswordResetToken('emu1@livralink.bj', okVerify.resetToken),
      svcB.consumePasswordResetToken('emu1@livralink.bj', okVerify.resetToken),
    ]);
    assert.equal([c1, c2].filter((r) => r.ok).length, 1);
    assert.equal([c1, c2].filter((r) => !r.ok).length, 1);

    // 3 wrong attempts delete OTP
    const issued2 = await svcA.issuePasswordResetOtp('emu2@livralink.bj');
    assert.equal(issued2.ok, true);
    if (!issued2.ok) return;
    const wrong2 = issued2.rawCode === '000000' ? '999999' : '000000';
    for (let i = 0; i < 3; i++) {
      await (i % 2 === 0 ? svcA : svcB).verifyPasswordResetOtp('emu2@livralink.bj', wrong2);
    }
    const locked = await svcA.verifyPasswordResetOtp('emu2@livralink.bj', issued2.rawCode);
    assert.equal(locked.ok, false);

    // Expiration after 10 minutes
    const issued3 = await svcA.issuePasswordResetOtp('emu3@livralink.bj');
    assert.equal(issued3.ok, true);
    if (!issued3.ok) return;
    now += 10 * 60 * 1000 + 1;
    const expired = await svcB.verifyPasswordResetOtp('emu3@livralink.bj', issued3.rawCode);
    assert.equal(expired.ok, false);
  });

  test('2. Real Firestore Emulator Transactions: P0-C Concurrent Payouts, Exclusive Lease (processingExpiresAt), Abandoned Recovery & Admin Reconciliation', async () => {
    let now = 1_750_100_000_000;
    await dbA.collection('users').doc('emu_courier_1').set({
      uid: 'emu_courier_1',
      role: 'livreur',
      walletBalanceFCFA: 10000,
    });

    let slowCalls = 0;
    let releaseSlow!: () => void;
    const slowGate = new Promise<void>((r) => {
      releaseSlow = r;
    });

    const controlledProvider: PayoutProviderAdapter = async ({ idempotencyKey }) => {
      slowCalls++;
      if (idempotencyKey === 'emu_key_lease_1') {
        await slowGate;
      }
      return { outcome: 'succeeded', providerReference: `EMU_${idempotencyKey}` };
    };

    const svcA = createP0SecurityService(dbA as unknown as P0FirestoreLike, {
      getSecretSalt: () => SHARED_SECRET_32,
      now: () => now,
      payoutProvider: controlledProvider,
    });
    const svcB = createP0SecurityService(dbB as unknown as P0FirestoreLike, {
      getSecretSalt: () => SHARED_SECRET_32,
      now: () => now,
      payoutProvider: controlledProvider,
    });

    // Real concurrent Promise.all incompatible payouts across dbA and dbB -> only 1 succeeds
    const [v1, v2] = await Promise.all([
      svcA.verifyWalletPayoutIdempotency({
        callerUid: 'emu_courier_1',
        idempotencyKey: 'emu_key_lease_1',
        amount: 6000,
      }),
      svcB.verifyWalletPayoutIdempotency({
        callerUid: 'emu_courier_1',
        idempotencyKey: 'emu_key_conflict_2',
        amount: 6000,
      }),
    ]);
    assert.equal([v1, v2].filter((r) => r.ok).length, 1);
    assert.equal([v1, v2].filter((r) => !r.ok).length, 1);

    const winningKey = v1.ok ? 'emu_key_lease_1' : 'emu_key_conflict_2';
    // Re-test parallel commit on winning key if it is emu_key_lease_1
    if (winningKey === 'emu_key_lease_1') {
      const firstCommit = svcA.commitWalletPayout({
        callerUid: 'emu_courier_1',
        idempotencyKey: 'emu_key_lease_1',
        amount: 6000,
      });
      await new Promise((r) => setTimeout(r, 80));

      const parallelCommit = await svcB.commitWalletPayout({
        callerUid: 'emu_courier_1',
        idempotencyKey: 'emu_key_lease_1',
        amount: 6000,
      });
      assert.equal(parallelCommit.ok, false);
      if (!parallelCommit.ok) assert.equal(parallelCommit.status, 409);

      releaseSlow();
      const done = await firstCommit;
      assert.equal(done.ok, true);
      assert.equal(slowCalls, 1);
      const userDoc = await dbB.collection('users').doc('emu_courier_1').get();
      assert.equal(userDoc.data()?.walletBalanceFCFA, 4000);
    } else {
      const done = await svcB.commitWalletPayout({
        callerUid: 'emu_courier_1',
        idempotencyKey: winningKey,
        amount: 6000,
      });
      assert.equal(done.ok, true);
      const userDoc = await dbA.collection('users').doc('emu_courier_1').get();
      assert.equal(userDoc.data()?.walletBalanceFCFA, 4000);
    }

    // Abandoned operation lease expiry + Admin reconciliation
    const abKey = 'emu_abandoned_recon_1';
    const abId = getPayoutIdempotencyDocId('emu_courier_1', abKey);
    await dbA.collection('users').doc('emu_courier_1').update({ walletBalanceFCFA: 2000 });
    await dbA.collection('payout_idempotency').doc(abId).set({
      id: abId,
      uid: 'emu_courier_1',
      idempotencyKey: abKey,
      amount: 2000,
      reservedAmount: 2000,
      balanceBefore: 4000,
      balanceAfter: 2000,
      status: 'processing',
      processingLeaseId: 'stale_lease_xyz',
      processingStartedAt: now,
      processingExpiresAt: now + 60_000,
      processingAttemptCount: 1,
    });
    await dbA.collection('payout_user_locks').doc('emu_courier_1').set({
      uid: 'emu_courier_1',
      activeDocKeyId: abId,
      status: 'processing',
    });

    now += 65_000;
    const recon = await svcB.reconcileWalletPayout({
      adminUid: 'admin_emu_1',
      targetUid: 'emu_courier_1',
      idempotencyKey: abKey,
      resolution: 'compensate_failed',
      reason: 'Lease expired reconciliation',
    });
    assert.equal(recon.ok, true);
    if (recon.ok) assert.equal(recon.restoredBalance, 4000);
    const afterReconUser = await dbA.collection('users').doc('emu_courier_1').get();
    assert.equal(afterReconUser.data()?.walletBalanceFCFA, 4000);
  });

  test('3. Two Distinct HTTP Server Processes (Instance A & Instance B) Sharing Real Firestore & Auth Emulators', async () => {
    const courierToken = await createVerifiedEmulatorUserAndToken({
      uid: 'courier_http_emu',
      email: 'courier_http_emu@livralink.bj',
      password: 'StrongPassword#2026',
    });
    const adminToken = await createVerifiedEmulatorUserAndToken({
      uid: 'super_admin_http_emu',
      email: 'Pamphile.gbede@gmail.com',
      password: 'AdminStrongPassword#2026',
    });

    await dbA.collection('users').doc('courier_http_emu').set({
      uid: 'courier_http_emu',
      email: 'courier_http_emu@livralink.bj',
      fullName: 'Courier HTTP',
      phone: '+22997000100',
      role: 'livreur',
      isKycVerified: true,
      walletBalanceFCFA: 10000,
    });

    await dbA.collection('deliveries').doc('LL-HTTP-EMU-1').set({
      id: '#LL-HTTP-EMU-1',
      merchantId: 'vendor_http_emu',
      courierId: 'courier_http_emu',
      clientName: 'Client HTTP Emu',
      clientPhone: '+22997000101',
      deliveryFee: 1500,
      status: 'en_cours',
    });
    await dbA.collection('deliveries').doc('LL-HTTP-EMU-1').collection('private').doc('otp').set({
      otpCode: '7391',
      merchantId: 'vendor_http_emu',
    });

    const instanceA = await spawnServerInstance({
      port: 34111,
      envOverrides: { OTP_SECRET_SALT: SHARED_SECRET_32 },
    });
    const instanceB = await spawnServerInstance({
      port: 34112,
      envOverrides: { OTP_SECRET_SALT: SHARED_SECRET_32 },
    });

    try {
      // Cross-instance POD: verify OTP on Instance A -> Promise.all complete-pod on A and B -> strictly 1 succeeds
      const verifyPodRes = await fetch(`${instanceA.baseUrl}/api/deliveries/LL-HTTP-EMU-1/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${courierToken}`,
        },
        body: JSON.stringify({ otpCode: '7391' }),
      });
      assert.equal(verifyPodRes.status, 200);
      const verifyPodBody = await verifyPodRes.json();
      assert.equal(verifyPodBody.verified, true);
      assert.ok(verifyPodBody.podOtpToken);

      const podPayload = {
        podOtpToken: verifyPodBody.podOtpToken,
        photoUrl: 'https://firebasestorage.googleapis.com/v0/b/test/o/pod%2Fp1.jpg',
        signatureDataUrl: 'https://firebasestorage.googleapis.com/v0/b/test/o/pod%2Fs1.png',
        signedByName: 'Client HTTP Emu',
      };

      const [podA, podB] = await Promise.all([
        fetch(`${instanceA.baseUrl}/api/deliveries/LL-HTTP-EMU-1/complete-pod`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
          body: JSON.stringify(podPayload),
        }),
        fetch(`${instanceB.baseUrl}/api/deliveries/LL-HTTP-EMU-1/complete-pod`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
          body: JSON.stringify(podPayload),
        }),
      ]);

      const podStatuses = [podA.status, podB.status].sort((a, b) => a - b);
      assert.equal(podStatuses[0], 200);
      assert.ok(podStatuses[1] === 403 || podStatuses[1] === 409);

      // Cross-instance Wallet concurrent Promise.all: verify on A and B for 7000 each -> strictly 1 succeeds
      const [wVerA, wVerB] = await Promise.all([
        fetch(`${instanceA.baseUrl}/api/wallet/verify-idempotency`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
          body: JSON.stringify({ idempotencyKey: 'http_emu_key_A', amount: 7000 }),
        }),
        fetch(`${instanceB.baseUrl}/api/wallet/verify-idempotency`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
          body: JSON.stringify({ idempotencyKey: 'http_emu_key_B', amount: 7000 }),
        }),
      ]);

      const okVerifyKey = wVerA.status === 200 ? 'http_emu_key_A' : 'http_emu_key_B';
      assert.equal([wVerA.status, wVerB.status].filter((s) => s === 200).length, 1);
      assert.equal([wVerA.status, wVerB.status].filter((s) => s !== 200).length, 1);

      // Commit on opposite instance (B if locked on A, or A if locked on B)
      const commitTarget = okVerifyKey === 'http_emu_key_A' ? instanceB : instanceA;
      const commitRes = await fetch(`${commitTarget.baseUrl}/api/wallet/commit-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
        body: JSON.stringify({ idempotencyKey: okVerifyKey, amount: 7000, operator: 'wave' }),
      });
      assert.equal(commitRes.status, 200);
      const commitBody = await commitRes.json();
      assert.equal(commitBody.balanceBefore, 10000);
      assert.equal(commitBody.balanceAfter, 3000);
      assert.equal(commitBody.isSimulatedProvider, true);

      // Replay commit on the other instance must fail (409)
      const replayTarget = commitTarget === instanceB ? instanceA : instanceB;
      const replayRes = await fetch(`${replayTarget.baseUrl}/api/wallet/commit-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
        body: JSON.stringify({ idempotencyKey: okVerifyKey, amount: 7000 }),
      });
      assert.equal(replayRes.status, 409);

      // Admin audit check confirms no secret leaked and hmacSecretConfigured=true
      const auditRes = await fetch(`${instanceB.baseUrl}/api/security/audit`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(auditRes.status, 200);
      const auditBody = await auditRes.json();
      assert.equal(auditBody.protections.authIntegrity.hmacSecretConfigured, true);
      assert.equal(JSON.stringify(auditBody).includes(SHARED_SECRET_32), false);
    } finally {
      await Promise.all([instanceA.stop(), instanceB.stop()]);
    }
  });

  test('4. Production HTTP 503 Blocking when OTP_SECRET_SALT is Missing or < 32 Chars (Zero randomBytes Fallback)', async () => {
    const courierToken = await createVerifiedEmulatorUserAndToken({
      uid: 'courier_503_emu',
      email: 'courier_503_emu@livralink.bj',
      password: 'StrongPassword#2026',
    });
    const adminToken = await createVerifiedEmulatorUserAndToken({
      uid: 'admin_503_emu',
      email: 'Pamphile.gbede@gmail.com',
      password: 'AdminStrongPassword#2026',
    });

    // Instance with NO secret in NODE_ENV=production
    const missingSecretServer = await spawnServerInstance({
      port: 34113,
      envOverrides: {
        OTP_SECRET_SALT: undefined,
        POD_OTP_HMAC_SECRET: undefined,
      },
    });

    // Instance with SHORT (< 32 chars) secret in NODE_ENV=production
    const shortSecretServer = await spawnServerInstance({
      port: 34114,
      envOverrides: {
        OTP_SECRET_SALT: 'short-secret-20-chars',
      },
    });

    try {
      for (const server of [missingSecretServer, shortSecretServer]) {
        const sendRes = await fetch(`${server.baseUrl}/api/auth/send-reset-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'user@livralink.bj' }),
        });
        assert.equal(sendRes.status, 503);

        const verifyRes = await fetch(`${server.baseUrl}/api/auth/verify-reset-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'user@livralink.bj', code: '123456' }),
        });
        assert.equal(verifyRes.status, 503);

        const resetRes = await fetch(`${server.baseUrl}/api/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'user@livralink.bj', resetToken: 'tok', newPassword: 'Password#2026' }),
        });
        assert.equal(resetRes.status, 503);

        const podVerifyRes = await fetch(`${server.baseUrl}/api/deliveries/LL-1/otp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
          body: JSON.stringify({ otpCode: '1234' }),
        });
        assert.equal(podVerifyRes.status, 503);

        const podCompleteRes = await fetch(`${server.baseUrl}/api/deliveries/LL-1/complete-pod`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
          body: JSON.stringify({ otpCode: '1234', signedByName: 'Test' }),
        });
        assert.equal(podCompleteRes.status, 503);

        const auditRes = await fetch(`${server.baseUrl}/api/security/audit`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert.equal(auditRes.status, 200);
        const auditBody = await auditRes.json();
        assert.equal(auditBody.protections.authIntegrity.hmacSecretConfigured, false);
      }
    } finally {
      await Promise.all([missingSecretServer.stop(), shortSecretServer.stop()]);
    }
  });

  test('5. P1 Multi-Instance Shared Encrypted SMTP Config, Cross-Instance Outbox/Dedup & Fail-Closed 503 Without Secret (Real Emulators)', async () => {
    const adminToken = await createVerifiedEmulatorUserAndToken({
      uid: 'p1_super_admin_emu',
      email: 'Pamphile.gbede@gmail.com',
      password: 'AdminStrongPassword#2026',
    });

    const instanceA = await spawnServerInstance({
      port: 34115,
      envOverrides: {
        OTP_SECRET_SALT: SHARED_SECRET_32,
        EMAIL_ENCRYPTION_SECRET: 'p1-emulator-aes256-smtp-master-secret-2026',
        GMAIL_SMTP_PASS: undefined,
      },
    });
    const instanceB = await spawnServerInstance({
      port: 34116,
      envOverrides: {
        OTP_SECRET_SALT: SHARED_SECRET_32,
        EMAIL_ENCRYPTION_SECRET: 'p1-emulator-aes256-smtp-master-secret-2026',
        GMAIL_SMTP_PASS: undefined,
      },
    });
    const noSecretServer = await spawnServerInstance({
      port: 34117,
      envOverrides: {
        OTP_SECRET_SALT: undefined,
        POD_OTP_HMAC_SECRET: undefined,
        EMAIL_ENCRYPTION_SECRET: undefined,
      },
    });

    try {
      // 1. Fail-closed HTTP 503 when saving SMTP password without encryption secret
      const saveFailRes = await fetch(`${noSecretServer.baseUrl}/api/admin/email/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          host: '127.0.0.1',
          port: 1,
          user: 'admin@livralink.bj',
          pass: 'secret-pass-should-not-be-saved',
          from: 'LivraLink <admin@livralink.bj>',
        }),
      });
      assert.equal(saveFailRes.status, 503);

      // 2. Save SMTP config on Instance A -> stored encrypted in Firestore -> Instance B immediately sees it without leaking password
      const saveRes = await fetch(`${instanceA.baseUrl}/api/admin/email/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          host: '127.0.0.1',
          port: 1,
          user: 'smtp-emu@livralink.bj',
          pass: 'emu-app-pass-plaintext-secret',
          from: 'LivraLink Emu <smtp-emu@livralink.bj>',
        }),
      });
      assert.equal(saveRes.status, 200);
      const saveBody = await saveRes.json();
      assert.equal(saveBody.config.hasPassword, true);
      assert.equal(saveBody.config.persistence, 'firestore');
      assert.equal(saveBody.config.encryptionReady, true);
      assert.equal(JSON.stringify(saveBody).includes('emu-app-pass-plaintext-secret'), false);

      const rawSmtpDoc = await dbB.collection('system_config').doc('smtp').get();
      assert.equal(rawSmtpDoc.exists, true);
      assert.ok(rawSmtpDoc.data()?.encryptedPass?.ciphertext);
      assert.equal(JSON.stringify(rawSmtpDoc.data()).includes('emu-app-pass-plaintext-secret'), false);

      const getBRes = await fetch(`${instanceB.baseUrl}/api/admin/email/config`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(getBRes.status, 200);
      const getBBody = await getBRes.json();
      assert.equal(getBBody.config.user, 'smtp-emu@livralink.bj');
      assert.equal(getBBody.config.hasPassword, true);
      assert.equal(getBBody.config.isConfigured, true);
      assert.equal(JSON.stringify(getBBody).includes('emu-app-pass-plaintext-secret'), false);

      // 3. Queue persistence & cross-instance dedup (SMTP port 1 fails quickly -> persisted in email_queue & email_logs)
      const notifyA = await fetch(`${instanceA.baseUrl}/api/email/notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          eventType: 'security_alert',
          recipientEmail: 'target-emu@livralink.bj',
          recipientName: 'Target User',
          dedupKey: 'emu-p1-dedup-key-001',
          details: { alertTitle: 'Test P1 Queue', alertDesc: 'Persistance inter-instances' },
        }),
      });
      assert.equal(notifyA.status, 200);
      const notifyABody = await notifyA.json();
      assert.equal(notifyABody.queued, true);
      assert.equal(notifyABody.emailDelivered, false);

      // Duplicate notification sent to Instance B must be blocked via Firestore email_dedup
      const notifyB = await fetch(`${instanceB.baseUrl}/api/email/notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          eventType: 'security_alert',
          recipientEmail: 'target-emu@livralink.bj',
          recipientName: 'Target User',
          dedupKey: 'emu-p1-dedup-key-001',
          details: { alertTitle: 'Test P1 Queue', alertDesc: 'Persistance inter-instances' },
        }),
      });
      assert.equal(notifyB.status, 200);
      const notifyBBody = await notifyB.json();
      assert.equal(notifyBBody.duplicateBlocked, true);

      // Instance B outbox sees the persisted email_logs entry from Firestore
      const outboxBRes = await fetch(`${instanceB.baseUrl}/api/email/outbox`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(outboxBRes.status, 200);
      const outboxBBody = await outboxBRes.json();
      assert.equal(outboxBBody.source, 'firestore');
      assert.equal(outboxBBody.emails.some((e: any) => e.id === notifyABody.emailId && e.status === 'queued'), true);

      // Persisted queue job exists in Firestore email_queue
      const queueSnap = await dbB.collection('email_queue').doc(notifyABody.emailId).get();
      assert.equal(queueSnap.exists, true);
      assert.equal(queueSnap.data()?.status, 'queued');
      assert.equal(queueSnap.data()?.retryCount, 1);
    } finally {
      await Promise.all([instanceA.stop(), instanceB.stop(), noSecretServer.stop()]);
    }
  });
});
