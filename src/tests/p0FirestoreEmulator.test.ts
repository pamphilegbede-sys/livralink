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
import net from 'node:net';
import { spawn, ChildProcess } from 'node:child_process';
import { initializeApp, getApps, deleteApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  createP0SecurityService,
  getPayoutIdempotencyDocId,
  hashEmailKey,
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

async function signInWithEmulatorPassword(email: string, password: string): Promise<{ ok: boolean; status: number; idToken?: string }> {
  const res = await fetch(
    `http://${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-emulator-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const body = await res.json();
  return { ok: res.ok, status: res.status, idToken: body.idToken };
}

interface CapturedSmtpEmail {
  mailFrom: string;
  rcptTo: string;
  rawData: string;
}

async function startMockSmtpSink(): Promise<{
  port: number;
  emails: CapturedSmtpEmail[];
  close: () => Promise<void>;
}> {
  const emails: CapturedSmtpEmail[] = [];
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));

    let state: 'COMMAND' | 'AUTH_USER' | 'AUTH_PASS' | 'DATA' = 'COMMAND';
    let buffer = '';
    let dataBuffer = '';
    let mailFrom = '';
    let rcptTo = '';

    socket.write('220 127.0.0.1 ESMTP LivraLink Test Sink\r\n');

    socket.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (state === 'DATA') {
        dataBuffer += text;
        const endIdx = dataBuffer.indexOf('\r\n.\r\n');
        if (endIdx !== -1) {
          const rawData = dataBuffer.slice(0, endIdx);
          emails.push({ mailFrom, rcptTo, rawData });
          const remaining = dataBuffer.slice(endIdx + 5);
          dataBuffer = '';
          state = 'COMMAND';
          socket.write('250 2.0.0 OK queued\r\n');
          if (remaining) {
            buffer += remaining;
          } else {
            return;
          }
        } else {
          return;
        }
      } else {
        buffer += text;
      }

      while (state !== 'DATA' && buffer.includes('\r\n')) {
        const lineEnd = buffer.indexOf('\r\n');
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const upper = line.toUpperCase();

        if (state === 'AUTH_USER') {
          state = 'AUTH_PASS';
          socket.write('334 UGFzc3dvcmQ6\r\n');
          continue;
        }
        if (state === 'AUTH_PASS') {
          state = 'COMMAND';
          socket.write('235 2.7.0 Authentication successful\r\n');
          continue;
        }

        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          socket.write('250-127.0.0.1 Hello\r\n250 AUTH PLAIN LOGIN\r\n');
        } else if (upper.startsWith('AUTH PLAIN')) {
          socket.write('235 2.7.0 Authentication successful\r\n');
        } else if (upper.startsWith('AUTH LOGIN')) {
          state = 'AUTH_USER';
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (upper.startsWith('MAIL FROM:')) {
          mailFrom = line.slice(10).trim();
          socket.write('250 2.1.0 OK\r\n');
        } else if (upper.startsWith('RCPT TO:')) {
          rcptTo = line.slice(8).trim();
          socket.write('250 2.1.5 OK\r\n');
        } else if (upper === 'DATA') {
          state = 'DATA';
          dataBuffer = buffer;
          buffer = '';
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (upper === 'NOOP' || upper === 'RSET') {
          socket.write('250 2.0.0 OK\r\n');
        } else if (upper === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('250 2.0.0 OK\r\n');
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as net.AddressInfo;

  return {
    port: addr.port,
    emails,
    close: async () => {
      for (const s of sockets) {
        s.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
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
      envOverrides: { NODE_ENV: 'development', OTP_SECRET_SALT: SHARED_SECRET_32 },
    });
    const instanceB = await spawnServerInstance({
      port: 34112,
      envOverrides: { NODE_ENV: 'development', OTP_SECRET_SALT: SHARED_SECRET_32 },
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
        assert.equal(auditBody.readiness?.simulatorForbiddenInProduction, true);
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

  test('6. Real HTTP Cross-Instance Auth OTP Reset Flow Across Instance A & B + Real Auth Emulator Password Change + 3-Attempt Lockout', async () => {
    const smtpSink = await startMockSmtpSink();
    await authAdmin.createUser({
      uid: 'reset_http_user',
      email: 'reset_http@livralink.bj',
      password: 'OldStrongPassword#2026',
      emailVerified: true,
    });
    await authAdmin.createUser({
      uid: 'reset_lock_user',
      email: 'reset_lock@livralink.bj',
      password: 'LockPassword#2026',
      emailVerified: true,
    });

    const smtpEnv = {
      OTP_SECRET_SALT: SHARED_SECRET_32,
      GMAIL_SMTP_HOST: '127.0.0.1',
      GMAIL_SMTP_PORT: String(smtpSink.port),
      GMAIL_SMTP_USER: 'smtp-test@livralink.bj',
      GMAIL_SMTP_PASS: 'smtp-test-pass',
      GMAIL_SMTP_FROM: 'LivraLink Test <smtp-test@livralink.bj>',
    };

    const instanceA = await spawnServerInstance({ port: 34118, envOverrides: smtpEnv });
    const instanceB = await spawnServerInstance({ port: 34119, envOverrides: smtpEnv });

    try {
      // 1. Issue OTP on Instance A -> capture real 6-digit code via mock SMTP sink
      const sendRes = await fetch(`${instanceA.baseUrl}/api/auth/send-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reset_http@livralink.bj' }),
      });
      assert.equal(sendRes.status, 200);
      assert.equal(smtpSink.emails.length, 1);
      const extractSixDigitOtp = (raw: string): string => {
        const normalized = raw.replace(/=\r?\n/g, '');
        const match = normalized.match(/(?:^|\r?\n)(\d{6})(?:\r?\n|$)/m);
        assert.ok(match, `Expected standalone 6-digit OTP in SMTP payload`);
        return match[1];
      };
      const capturedOtp = extractSixDigitOtp(smtpSink.emails[0].rawData);

      // Check Firestore doc stores hashed OTP, NOT raw code
      const otpDocSnap = await dbB
        .collection(COLLECTIONS.AUTH_RESET_OTPS)
        .doc(hashEmailKey('reset_http@livralink.bj'))
        .get();
      assert.equal(otpDocSnap.exists, true);
      assert.equal(JSON.stringify(otpDocSnap.data()).includes(capturedOtp), false);

      // 2. Immediate resend on Instance B within 60s cooldown blocked with 429
      const resendB = await fetch(`${instanceB.baseUrl}/api/auth/send-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reset_http@livralink.bj' }),
      });
      assert.equal(resendB.status, 429);

      // 3. Wrong OTP on Instance A, wrong OTP on Instance B, then valid OTP on Instance B
      const wrongOtp = capturedOtp === '111111' ? '222222' : '111111';
      const w1 = await fetch(`${instanceA.baseUrl}/api/auth/verify-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reset_http@livralink.bj', code: wrongOtp }),
      });
      assert.equal(w1.status, 400);
      assert.equal((await w1.json()).attemptsLeft, 2);

      const w2 = await fetch(`${instanceB.baseUrl}/api/auth/verify-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reset_http@livralink.bj', code: wrongOtp }),
      });
      assert.equal(w2.status, 400);
      assert.equal((await w2.json()).attemptsLeft, 1);

      const okVerifyRes = await fetch(`${instanceB.baseUrl}/api/auth/verify-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reset_http@livralink.bj', code: capturedOtp }),
      });
      assert.equal(okVerifyRes.status, 200);
      const okVerifyBody = await okVerifyRes.json();
      assert.ok(okVerifyBody.resetToken);

      // 4. Reset password on Instance A -> succeeds and updates Auth Emulator
      const resetRes = await fetch(`${instanceA.baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'reset_http@livralink.bj',
          resetToken: okVerifyBody.resetToken,
          newPassword: 'NewStrongPassword#2026',
        }),
      });
      assert.equal(resetRes.status, 200);
      const resetBody = await resetRes.json();
      assert.equal(resetBody.success, true);

      // 5. Replay same single-use resetToken on Instance B -> strictly rejected (403)
      const replayReset = await fetch(`${instanceB.baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'reset_http@livralink.bj',
          resetToken: okVerifyBody.resetToken,
          newPassword: 'AnotherPassword#2026',
        }),
      });
      assert.equal(replayReset.status, 403);

      // 6. Real Auth Emulator sign-in verification with old vs new password
      const oldLogin = await signInWithEmulatorPassword('reset_http@livralink.bj', 'OldStrongPassword#2026');
      assert.equal(oldLogin.ok, false);
      const newLogin = await signInWithEmulatorPassword('reset_http@livralink.bj', 'NewStrongPassword#2026');
      assert.equal(newLogin.ok, true);

      // 7. 3 wrong attempts across A & B delete OTP so valid code afterwards is rejected
      const sendLockRes = await fetch(`${instanceA.baseUrl}/api/auth/send-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reset_lock@livralink.bj' }),
      });
      assert.equal(sendLockRes.status, 200);
      const lockOtp = extractSixDigitOtp(smtpSink.emails[smtpSink.emails.length - 1].rawData);
      const badLockOtp = lockOtp === '000000' ? '999999' : '000000';

      for (let i = 0; i < 3; i++) {
        const srv = i % 2 === 0 ? instanceA : instanceB;
        const r = await fetch(`${srv.baseUrl}/api/auth/verify-reset-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'reset_lock@livralink.bj', code: badLockOtp }),
        });
        assert.ok(r.status === 400 || r.status === 429);
      }

      const afterMaxAttempts = await fetch(`${instanceB.baseUrl}/api/auth/verify-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reset_lock@livralink.bj', code: lockOtp }),
      });
      assert.equal(afterMaxAttempts.ok, false);
      assert.equal(afterMaxAttempts.status, 400);
      const otpLockDocAfter = await dbB
        .collection(COLLECTIONS.AUTH_RESET_OTPS)
        .doc(hashEmailKey('reset_lock@livralink.bj'))
        .get();
      assert.equal(otpLockDocAfter.exists, false);
    } finally {
      await Promise.all([instanceA.stop(), instanceB.stop(), smtpSink.close()]);
    }
  });

  test('7. Real HTTP Cross-Instance POD 5-Failure Persistent Lockout (429) Across Instance A & B', async () => {
    const courierToken = await createVerifiedEmulatorUserAndToken({
      uid: 'courier_pod_lock_emu',
      email: 'courier_pod_lock@livralink.bj',
      password: 'StrongPassword#2026',
    });

    await dbA.collection('deliveries').doc('LL-POD-LOCK-1').set({
      id: '#LL-POD-LOCK-1',
      merchantId: 'vendor_pod_lock',
      courierId: 'courier_pod_lock_emu',
      clientName: 'Client POD Lock',
      deliveryFee: 1200,
      status: 'en_cours',
    });
    await dbA.collection('deliveries').doc('LL-POD-LOCK-1').collection('private').doc('otp').set({
      otpCode: '8426',
      merchantId: 'vendor_pod_lock',
    });

    const instanceA = await spawnServerInstance({
      port: 34120,
      envOverrides: { OTP_SECRET_SALT: SHARED_SECRET_32 },
    });
    const instanceB = await spawnServerInstance({
      port: 34121,
      envOverrides: { OTP_SECRET_SALT: SHARED_SECRET_32 },
    });

    try {
      for (let attempt = 1; attempt <= 5; attempt++) {
        const srv = attempt % 2 === 1 ? instanceA : instanceB;
        const res = await fetch(`${srv.baseUrl}/api/deliveries/LL-POD-LOCK-1/otp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
          body: JSON.stringify({ otpCode: '0000' }),
        });
        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.attemptsLeft, 5 - attempt);
      }

      // 6th attempt with the REAL code on Instance B must be rejected with HTTP 429
      const blockedRes = await fetch(`${instanceB.baseUrl}/api/deliveries/LL-POD-LOCK-1/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
        body: JSON.stringify({ otpCode: '8426' }),
      });
      assert.equal(blockedRes.status, 429);
    } finally {
      await Promise.all([instanceA.stop(), instanceB.stop()]);
    }
  });

  test('8. Real HTTP Cross-Instance Wallet Processing Lease Conflict (409), Abandoned Recovery & Admin Pending/Reconcile API', async () => {
    const courierToken = await createVerifiedEmulatorUserAndToken({
      uid: 'courier_recon_http',
      email: 'courier_recon_http@livralink.bj',
      password: 'StrongPassword#2026',
    });
    const adminToken = await createVerifiedEmulatorUserAndToken({
      uid: 'admin_recon_http',
      email: 'Pamphile.gbede@gmail.com',
      password: 'AdminStrongPassword#2026',
    });

    await dbA.collection('users').doc('courier_recon_http').set({
      uid: 'courier_recon_http',
      role: 'livreur',
      walletBalanceFCFA: 6000,
    });

    const activeKey = 'http_active_lease_key';
    const activeDocId = getPayoutIdempotencyDocId('courier_recon_http', activeKey);
    const now = Date.now();
    await dbA.collection('payout_idempotency').doc(activeDocId).set({
      id: activeDocId,
      uid: 'courier_recon_http',
      idempotencyKey: activeKey,
      amount: 4000,
      reservedAmount: 4000,
      balanceBefore: 10000,
      balanceAfter: 6000,
      status: 'processing',
      processingLeaseId: 'lease_active_1',
      processingStartedAt: now,
      processingExpiresAt: now + 60_000,
      processingAttemptCount: 1,
    });
    await dbA.collection('payout_user_locks').doc('courier_recon_http').set({
      uid: 'courier_recon_http',
      activeDocKeyId: activeDocId,
      status: 'processing',
    });

    const instanceA = await spawnServerInstance({
      port: 34122,
      envOverrides: { NODE_ENV: 'development', OTP_SECRET_SALT: SHARED_SECRET_32 },
    });
    const instanceB = await spawnServerInstance({
      port: 34123,
      envOverrides: { NODE_ENV: 'development', OTP_SECRET_SALT: SHARED_SECRET_32 },
    });

    try {
      // 1. Active processing lease blocks both duplicate courier commit (409) AND premature admin reconciliation (409)
      const inFlightCommit = await fetch(`${instanceA.baseUrl}/api/wallet/commit-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
        body: JSON.stringify({ idempotencyKey: activeKey, amount: 4000 }),
      });
      assert.equal(inFlightCommit.status, 409);
      assert.equal((await inFlightCommit.json()).inFlight, true);

      const activeRecon = await fetch(`${instanceB.baseUrl}/api/admin/wallet/reconcile-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          targetUid: 'courier_recon_http',
          idempotencyKey: activeKey,
          resolution: 'compensate_failed',
        }),
      });
      assert.equal(activeRecon.status, 409);

      // 2. Simulate lease expiration -> Admin pending-payouts shows leaseExpired=true & courier recovers cleanly without double debit
      await dbA.collection('payout_idempotency').doc(activeDocId).update({
        processingExpiresAt: Date.now() - 5000,
      });

      const pendingRes = await fetch(`${instanceB.baseUrl}/api/admin/wallet/pending-payouts`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(pendingRes.status, 200);
      const pendingBody = await pendingRes.json();
      assert.equal(pendingBody.items.some((x: any) => x.id === activeDocId && x.leaseExpired === true), true);

      const recoverCommit = await fetch(`${instanceA.baseUrl}/api/wallet/commit-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
        body: JSON.stringify({ idempotencyKey: activeKey, amount: 4000 }),
      });
      assert.equal(recoverCommit.status, 200);
      const recoverBody = await recoverCommit.json();
      assert.equal(recoverBody.recoveredFromInterruption, true);
      assert.equal(recoverBody.balanceBefore, 10000);
      assert.equal(recoverBody.balanceAfter, 6000);
      const userSnapAfterRecover = await dbB.collection('users').doc('courier_recon_http').get();
      assert.equal(userSnapAfterRecover.data()?.walletBalanceFCFA, 6000);

      // 3. Admin reconcile 'uncertain' payout with 'compensate_failed' restores balance cleanly and unlocks user
      const uncertainKey = 'http_uncertain_recon_key';
      const uncertainDocId = getPayoutIdempotencyDocId('courier_recon_http', uncertainKey);
      await dbA.collection('users').doc('courier_recon_http').update({ walletBalanceFCFA: 4000 });
      await dbA.collection('payout_idempotency').doc(uncertainDocId).set({
        id: uncertainDocId,
        uid: 'courier_recon_http',
        idempotencyKey: uncertainKey,
        amount: 2000,
        reservedAmount: 2000,
        balanceBefore: 6000,
        balanceAfter: 4000,
        status: 'uncertain',
      });
      await dbA.collection('payout_user_locks').doc('courier_recon_http').set({
        uid: 'courier_recon_http',
        activeDocKeyId: uncertainDocId,
        status: 'uncertain',
      });

      const reconRes = await fetch(`${instanceB.baseUrl}/api/admin/wallet/reconcile-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          targetUid: 'courier_recon_http',
          idempotencyKey: uncertainKey,
          resolution: 'compensate_failed',
          reason: 'Provider confirmed timeout',
        }),
      });
      assert.equal(reconRes.status, 200);
      const reconBody = await reconRes.json();
      assert.equal(reconBody.restoredBalance, 6000);

      const finalUserSnap = await dbA.collection('users').doc('courier_recon_http').get();
      assert.equal(finalUserSnap.data()?.walletBalanceFCFA, 6000);
    } finally {
      await Promise.all([instanceA.stop(), instanceB.stop()]);
    }
  });

  test('9. Real HTTP Emulator End-to-End Business Flows: Courier KYC Approval, Vendor OTP Isolation & Notify, Admin Console Actions', async () => {
    const smtpSink = await startMockSmtpSink();
    const vendorToken = await createVerifiedEmulatorUserAndToken({
      uid: 'vendor_biz_emu',
      email: 'vendor_biz@livralink.bj',
      password: 'VendorPassword#2026',
    });
    const courierToken = await createVerifiedEmulatorUserAndToken({
      uid: 'courier_biz_emu',
      email: 'courier_biz@livralink.bj',
      password: 'CourierPassword#2026',
    });
    const adminToken = await createVerifiedEmulatorUserAndToken({
      uid: 'admin_biz_emu',
      email: 'Pamphile.gbede@gmail.com',
      password: 'AdminPassword#2026',
    });

    await dbA.collection('users').doc('courier_biz_emu').set({
      uid: 'courier_biz_emu',
      email: 'courier_biz@livralink.bj',
      fullName: 'Koffi Livreur',
      role: 'livreur',
      isKycVerified: false,
      kycStatus: 'en_attente',
      walletBalanceFCFA: 0,
    });
    await dbA.collection('kyc').doc('courier_biz_emu').set({
      id: 'courier_biz_emu',
      userId: 'courier_biz_emu',
      courierId: 'courier_biz_emu',
      fullName: 'Koffi Livreur',
      documentPhotoUrl: 'https://firebasestorage.googleapis.com/v0/b/test/o/kyc%2Fcourier_biz_emu%2Fcni.jpg',
      status: 'en_attente',
    });
    await dbA.collection('deliveries').doc('LL-BIZ-EMU-1').set({
      id: '#LL-BIZ-EMU-1',
      merchantId: 'vendor_biz_emu',
      merchantStoreName: 'Boutique Cotonou',
      clientName: 'Awa Destinataire',
      clientPhone: '+22997001122',
      itemValueCOD: 12000,
      deliveryFee: 1500,
      totalCustomerPayable: 13500,
      status: 'en_attente',
    });

    const envCfg = {
      OTP_SECRET_SALT: SHARED_SECRET_32,
      GMAIL_SMTP_HOST: '127.0.0.1',
      GMAIL_SMTP_PORT: String(smtpSink.port),
      GMAIL_SMTP_USER: 'smtp-biz@livralink.bj',
      GMAIL_SMTP_PASS: 'smtp-biz-pass',
    };
    const instanceA = await spawnServerInstance({ port: 34124, envOverrides: envCfg });
    const instanceB = await spawnServerInstance({ port: 34125, envOverrides: envCfg });

    try {
      // A. KYC Decision by non-admin rejected (403); Admin approves on Instance A
      const unauthKyc = await fetch(`${instanceA.baseUrl}/api/admin/kyc/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
        body: JSON.stringify({ requestId: 'courier_biz_emu', decision: 'valide' }),
      });
      assert.equal(unauthKyc.status, 403);

      const kycApproveRes = await fetch(`${instanceA.baseUrl}/api/admin/kyc/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ requestId: 'courier_biz_emu', decision: 'valide' }),
      });
      assert.equal(kycApproveRes.status, 200);
      const approvedCourierSnap = await dbB.collection('users').doc('courier_biz_emu').get();
      assert.equal(approvedCourierSnap.data()?.isKycVerified, true);
      assert.equal(approvedCourierSnap.data()?.kycStatus, 'valide');

      // B. Admin assigns delivery, adjusts wallet, creates/updates directory user & persists platform config
      const assignRes = await fetch(`${instanceB.baseUrl}/api/admin/deliveries/LL-BIZ-EMU-1/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ courierId: 'courier_biz_emu', status: 'en_cours' }),
      });
      assert.equal(assignRes.status, 200);
      assert.equal((await dbA.collection('deliveries').doc('LL-BIZ-EMU-1').get()).data()?.courierId, 'courier_biz_emu');

      const walletAdjRes = await fetch(`${instanceA.baseUrl}/api/admin/wallet/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ targetUid: 'courier_biz_emu', amount: 5000, type: 'credit', reason: 'Bonus test' }),
      });
      assert.equal(walletAdjRes.status, 200);
      assert.equal((await dbB.collection('users').doc('courier_biz_emu').get()).data()?.walletBalanceFCFA, 5000);

      const dirCreateRes = await fetch(`${instanceA.baseUrl}/api/admin/directory/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          uid: 'dir_merchant_1',
          fullName: 'Boutique Directory',
          email: 'dir_merchant@livralink.bj',
          role: 'vendeur',
        }),
      });
      assert.equal(dirCreateRes.status, 201);

      const dirPatchRes = await fetch(`${instanceB.baseUrl}/api/admin/directory/user/dir_merchant_1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'actif' }),
      });
      assert.equal(dirPatchRes.status, 200);

      const cfgPostRes = await fetch(`${instanceA.baseUrl}/api/platform/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ pricingRules: { baseFeeFCFA: 1000, extraPerKmFCFA: 100, commissionRatePercent: 10 } }),
      });
      assert.equal(cfgPostRes.status, 200);

      const cfgGetRes = await fetch(`${instanceB.baseUrl}/api/platform/config`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      assert.equal(cfgGetRes.status, 200);
      const cfgGetBody = await cfgGetRes.json();
      assert.equal(cfgGetBody.source, 'firestore');
      assert.equal(cfgGetBody.pricingRules.baseFeeFCFA, 1000);

      // C. Vendor generates private OTP & dispatches to client email; courier cannot read/generate OTP, can verify it
      const courierGenBlocked = await fetch(`${instanceA.baseUrl}/api/deliveries/LL-BIZ-EMU-1/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
        body: JSON.stringify({}),
      });
      assert.equal(courierGenBlocked.status, 403);

      const genOtpRes = await fetch(`${instanceA.baseUrl}/api/deliveries/LL-BIZ-EMU-1/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
        body: JSON.stringify({ clientEmail: 'awa.client@livralink.bj', clientName: 'Awa Destinataire' }),
      });
      assert.equal(genOtpRes.status, 200);
      const genOtpBody = await genOtpRes.json();
      assert.match(genOtpBody.otpCode, /^\d{4}$/);

      // Ensure OTP is stored in private subcollection and NOT leaked on public delivery doc
      const pubDelivery = (await dbB.collection('deliveries').doc('LL-BIZ-EMU-1').get()).data() || {};
      assert.equal((pubDelivery as any).otpCode, undefined);
      const privOtpSnap = await dbB.collection('deliveries').doc('LL-BIZ-EMU-1').collection('private').doc('otp').get();
      assert.equal(privOtpSnap.data()?.otpCode, genOtpBody.otpCode);

      const notifyOtpRes = await fetch(`${instanceB.baseUrl}/api/deliveries/LL-BIZ-EMU-1/notify-client-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
        body: JSON.stringify({ clientEmail: 'awa.client@livralink.bj' }),
      });
      assert.equal(notifyOtpRes.status, 200);
      assert.equal((await notifyOtpRes.json()).emailDelivered, true);
      assert.equal(smtpSink.emails.some((e) => e.rawData.includes(genOtpBody.otpCode)), true);

      // Assigned courier advances delivery to transit (en_cours) then completes POD on Instance A/B using the real generated OTP
      await dbA.collection('deliveries').doc('LL-BIZ-EMU-1').update({ status: 'en_cours' });
      const verifyOtpRes = await fetch(`${instanceA.baseUrl}/api/deliveries/LL-BIZ-EMU-1/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
        body: JSON.stringify({ otpCode: genOtpBody.otpCode }),
      });
      assert.equal(verifyOtpRes.status, 200);
      const verifyBody = await verifyOtpRes.json();

      const podCompleteRes = await fetch(`${instanceB.baseUrl}/api/deliveries/LL-BIZ-EMU-1/complete-pod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${courierToken}` },
        body: JSON.stringify({
          podOtpToken: verifyBody.podOtpToken,
          photoUrl: 'https://firebasestorage.googleapis.com/v0/b/test/o/pod%2Fbiz.jpg',
          signatureDataUrl: 'https://firebasestorage.googleapis.com/v0/b/test/o/pod%2Fbiz_sig.png',
          signedByName: 'Awa Destinataire',
        }),
      });
      assert.equal(podCompleteRes.status, 200);
      assert.equal((await dbA.collection('deliveries').doc('LL-BIZ-EMU-1').get()).data()?.status, 'livree');
    } finally {
      await Promise.all([instanceA.stop(), instanceB.stop(), smtpSink.close()]);
    }
  });

  test('10. Real HTTP Emulator Full KYC Lifecycle: Submission visibility in Admin sync-overview, Rejection -> Notification -> Resubmission -> Approval', async () => {
    const courierToken = await createVerifiedEmulatorUserAndToken({
      uid: 'courier_kyc_e2e',
      email: 'courier_kyc_e2e@livralink.bj',
      password: 'CourierKycPassword#2026',
    });
    const adminToken = await createVerifiedEmulatorUserAndToken({
      uid: 'admin_kyc_e2e',
      email: 'Pamphile.gbede@gmail.com',
      password: 'AdminKycPassword#2026',
    });

    // Simulate courier atomic submission state on Firestore (/users + /kyc)
    await dbA.collection('users').doc('courier_kyc_e2e').set({
      uid: 'courier_kyc_e2e',
      email: 'courier_kyc_e2e@livralink.bj',
      fullName: 'Sèna Mensah',
      phone: '+22997112244',
      role: 'livreur',
      isKycVerified: false,
      kycStatus: 'en_attente',
    });
    await dbA.collection('kyc').doc('courier_kyc_e2e').set({
      id: 'courier_kyc_e2e',
      userId: 'courier_kyc_e2e',
      courierId: 'courier_kyc_e2e',
      role: 'coursier',
      lastName: 'MENSAH',
      firstName: 'Sèna',
      fullName: 'Sèna Mensah',
      phone: '+22997112244',
      email: 'courier_kyc_e2e@livralink.bj',
      idType: 'CIP',
      idNumber: 'CIP-889900',
      documentStoragePath: 'kyc/courier_kyc_e2e/identity_photo_17000001.pdf',
      documentMimeType: 'application/pdf',
      documentFileName: 'identity_photo_17000001.pdf',
      status: 'en_attente',
      isApproved: false,
      submittedAt: new Date().toISOString(),
    });

    const instanceA = await spawnServerInstance({
      port: 34126,
      envOverrides: { OTP_SECRET_SALT: SHARED_SECRET_32 },
    });
    const instanceB = await spawnServerInstance({
      port: 34127,
      envOverrides: { OTP_SECRET_SALT: SHARED_SECRET_32 },
    });

    try {
      // 1. Non-admin cannot access sync-overview or kyc document proxy
      const courierSyncBlocked = await fetch(`${instanceA.baseUrl}/api/admin/sync-overview`, {
        headers: { Authorization: `Bearer ${courierToken}` },
      });
      assert.equal(courierSyncBlocked.status, 403);

      // 2. Admin receives submitted KYC dossier via sync-overview on Instance B
      const syncRes = await fetch(`${instanceB.baseUrl}/api/admin/sync-overview`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(syncRes.status, 200);
      const syncBody = await syncRes.json();
      assert.equal(syncBody.success, true);
      const foundKyc = (syncBody.kycRequests || []).find((item: any) => item.id === 'courier_kyc_e2e');
      assert.ok(foundKyc, 'Le dossier KYC soumis doit apparaître dans /api/admin/sync-overview');
      assert.equal(foundKyc.status, 'en_attente');
      assert.equal(foundKyc.documentStoragePath, 'kyc/courier_kyc_e2e/identity_photo_17000001.pdf');
      assert.equal(foundKyc.documentMimeType, 'application/pdf');

      // 3. Admin rejects KYC with motif -> Firestore + notification created
      const rejectRes = await fetch(`${instanceA.baseUrl}/api/admin/kyc/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          targetUid: 'courier_kyc_e2e',
          requestId: 'courier_kyc_e2e',
          decision: 'refuse',
          reason: 'Document PDF tronqué sur le bord inférieur',
        }),
      });
      assert.equal(rejectRes.status, 200);

      const userAfterReject = (await dbB.collection('users').doc('courier_kyc_e2e').get()).data();
      const kycAfterReject = (await dbB.collection('kyc').doc('courier_kyc_e2e').get()).data();
      assert.equal(userAfterReject?.isKycVerified, false);
      assert.equal(userAfterReject?.kycStatus, 'refuse');
      assert.equal(kycAfterReject?.status, 'refuse');
      assert.equal(kycAfterReject?.rejectionReason, 'Document PDF tronqué sur le bord inférieur');

      const notifAfterReject = await dbB
        .collection('notifications')
        .where('recipientId', '==', 'courier_kyc_e2e')
        .get();
      assert.equal(notifAfterReject.empty, false);
      assert.equal(
        notifAfterReject.docs.some((d) => String(d.data()?.message || '').includes('tronqué')),
        true
      );

      // 4. Courier resubmits corrected document -> status back to en_attente
      await dbA.collection('kyc').doc('courier_kyc_e2e').update({
        status: 'en_attente',
        documentStoragePath: 'kyc/courier_kyc_e2e/identity_photo_17000002.jpg',
        documentMimeType: 'image/jpeg',
        documentFileName: 'identity_photo_17000002.jpg',
      });
      await dbA.collection('users').doc('courier_kyc_e2e').update({ kycStatus: 'en_attente' });

      // 5. Admin approves on Instance B -> courier verified + notification sent
      const approveRes = await fetch(`${instanceB.baseUrl}/api/admin/kyc/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          targetUid: 'courier_kyc_e2e',
          requestId: 'courier_kyc_e2e',
          decision: 'valide',
        }),
      });
      assert.equal(approveRes.status, 200);

      const userAfterApprove = (await dbA.collection('users').doc('courier_kyc_e2e').get()).data();
      const kycAfterApprove = (await dbA.collection('kyc').doc('courier_kyc_e2e').get()).data();
      assert.equal(userAfterApprove?.isKycVerified, true);
      assert.equal(userAfterApprove?.kycStatus, 'valide');
      assert.equal(kycAfterApprove?.status, 'valide');
      assert.equal(kycAfterApprove?.isApproved, true);

      const notifAfterApprove = await dbA
        .collection('notifications')
        .where('recipientId', '==', 'courier_kyc_e2e')
        .get();
      assert.equal(notifAfterApprove.docs.length >= 2, true);
      assert.equal(
        notifAfterApprove.docs.some(
          (d) =>
            String(d.data()?.title || '').includes('accrédité') &&
            String(d.data()?.message || '').includes('validé')
        ),
        true
      );
    } finally {
      await Promise.all([instanceA.stop(), instanceB.stop()]);
    }
  });
});
