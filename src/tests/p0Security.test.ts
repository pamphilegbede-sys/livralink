import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createP0SecurityService,
  P0CollectionRef,
  P0DocumentRef,
  P0DocumentSnapshot,
  P0FirestoreLike,
  P0Query,
  P0Transaction,
  P0WriteBatch,
  PayoutProviderAdapter,
} from '../server/p0Security';

/**
 * Shared transactional Firestore-compatible store simulating multi-instance concurrency
 * against a single Firestore database (strictly serialized atomic transactions + yield).
 */
class SharedTransactionalFirestore implements P0FirestoreLike {
  public docs = new Map<string, Record<string, any>>();
  private txChain: Promise<any> = Promise.resolve();

  private makeSnap(path: string, data: Record<string, any> | undefined): P0DocumentSnapshot {
    const id = path.split('/').pop() || '';
    const cloned = data ? structuredClone(data) : undefined;
    return {
      exists: Boolean(cloned),
      id,
      data: () => (cloned ? structuredClone(cloned) : undefined),
    };
  }

  private makeDocRef(path: string): P0DocumentRef {
    const self = this;
    const id = path.split('/').pop() || '';
    return {
      id,
      path,
      collection(subName: string) {
        return self.makeCollectionRef(`${path}/${subName}`);
      },
      async get() {
        return self.makeSnap(path, self.docs.get(path));
      },
      async set(data: Record<string, any>, options?: { merge?: boolean }) {
        const prev = self.docs.get(path);
        if (options?.merge && prev) {
          self.docs.set(path, { ...structuredClone(prev), ...structuredClone(data) });
        } else {
          self.docs.set(path, structuredClone(data));
        }
      },
      async update(data: Record<string, any>) {
        const prev = self.docs.get(path);
        if (!prev) throw new Error(`Document does not exist: ${path}`);
        self.docs.set(path, { ...structuredClone(prev), ...structuredClone(data) });
      },
      async delete() {
        self.docs.delete(path);
      },
    };
  }

  private makeCollectionRef(basePath: string): P0CollectionRef {
    const self = this;
    const buildQuery = (filters: Array<{ field: string; op: string; value: any }>, maxLimit?: number): P0Query => ({
      where(field: string, op: string, value: any) {
        return buildQuery([...filters, { field, op, value }], maxLimit);
      },
      limit(n: number) {
        return buildQuery(filters, n);
      },
      async get() {
        const prefix = `${basePath}/`;
        const matched: P0DocumentSnapshot[] = [];
        for (const [docPath, data] of self.docs.entries()) {
          if (!docPath.startsWith(prefix)) continue;
          const rest = docPath.slice(prefix.length);
          if (rest.includes('/')) continue; // direct children only
          const passes = filters.every(({ field, op, value }) => {
            const v = data[field];
            if (op === '<') return typeof v === 'number' && v < value;
            if (op === '==') return v === value;
            return false;
          });
          if (passes) {
            matched.push(self.makeSnap(docPath, data));
            if (maxLimit && matched.length >= maxLimit) break;
          }
        }
        return { empty: matched.length === 0, docs: matched };
      },
    });

    return {
      doc(id: string) {
        return self.makeDocRef(`${basePath}/${id}`);
      },
      where(field: string, op: string, value: any) {
        return buildQuery([{ field, op, value }]);
      },
      limit(n: number) {
        return buildQuery([], n);
      },
    };
  }

  collection(name: string): P0CollectionRef {
    return this.makeCollectionRef(name);
  }

  async runTransaction<T>(updateFunction: (tx: P0Transaction) => Promise<T>): Promise<T> {
    const exec = async () => {
      // Simulate real async network boundary between App Hosting instance and Firestore
      await Promise.resolve();
      const staging = new Map<string, Record<string, any> | null>();
      const tx: P0Transaction = {
        get: async (ref: P0DocumentRef) => {
          const val = staging.has(ref.path) ? staging.get(ref.path) || undefined : this.docs.get(ref.path);
          return this.makeSnap(ref.path, val);
        },
        set: (ref: P0DocumentRef, data: Record<string, any>, options?: { merge?: boolean }) => {
          const prev = staging.has(ref.path) ? staging.get(ref.path) : this.docs.get(ref.path);
          if (options?.merge && prev) {
            staging.set(ref.path, { ...structuredClone(prev), ...structuredClone(data) });
          } else {
            staging.set(ref.path, structuredClone(data));
          }
        },
        update: (ref: P0DocumentRef, data: Record<string, any>) => {
          const prev = staging.has(ref.path) ? staging.get(ref.path) : this.docs.get(ref.path);
          if (!prev) throw new Error(`NOT_FOUND: ${ref.path}`);
          staging.set(ref.path, { ...structuredClone(prev), ...structuredClone(data) });
        },
        delete: (ref: P0DocumentRef) => {
          staging.set(ref.path, null);
        },
      };

      const result = await updateFunction(tx);
      for (const [k, v] of staging.entries()) {
        if (v === null) {
          this.docs.delete(k);
        } else {
          this.docs.set(k, v);
        }
      }
      return result;
    };

    const next = this.txChain.then(exec, exec);
    this.txChain = next.catch(() => {});
    return next;
  }

  batch(): P0WriteBatch {
    const ops: Array<() => void> = [];
    return {
      set: (ref, data, options) => {
        ops.push(() => {
          const prev = this.docs.get(ref.path);
          if (options?.merge && prev) {
            this.docs.set(ref.path, { ...structuredClone(prev), ...structuredClone(data) });
          } else {
            this.docs.set(ref.path, structuredClone(data));
          }
        });
      },
      update: (ref, data) => {
        ops.push(() => {
          const prev = this.docs.get(ref.path);
          if (!prev) throw new Error(`NOT_FOUND: ${ref.path}`);
          this.docs.set(ref.path, { ...structuredClone(prev), ...structuredClone(data) });
        });
      },
      delete: (ref) => {
        ops.push(() => {
          this.docs.delete(ref.path);
        });
      },
      commit: async () => {
        for (const op of ops) op();
      },
    };
  }
}

const SHARED_HMAC_SECRET = 'livralink-test-shared-secret-salt-0123456789abcdef';

test('P0-A Multi-Instance Password Reset OTP & Single-Use Reset Tokens', async (t) => {
  let currentNow = 1_700_000_000_000;
  const sharedDb = new SharedTransactionalFirestore();

  const instanceA = createP0SecurityService(sharedDb, {
    getSecretSalt: () => SHARED_HMAC_SECRET,
    now: () => currentNow,
  });
  const instanceB = createP0SecurityService(sharedDb, {
    getSecretSalt: () => SHARED_HMAC_SECRET,
    now: () => currentNow,
  });

  await t.test('1. OTP issued on Instance A is stored hashed-only and verified on Instance B', async () => {
    const issued = await instanceA.issuePasswordResetOtp('user1@livralink.bj');
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    assert.match(issued.rawCode, /^\d{6}$/);

    // Verify plaintext OTP is NEVER stored in Firestore
    const otpDocs = Array.from(sharedDb.docs.entries()).filter(([k]) => k.startsWith('auth_reset_otps/'));
    assert.equal(otpDocs.length, 1);
    assert.equal(JSON.stringify(otpDocs[0][1]).includes(issued.rawCode), false);

    // Resend before 60s on Instance B must be rejected (429)
    currentNow += 30_000;
    const resendTooSoon = await instanceB.issuePasswordResetOtp('user1@livralink.bj');
    assert.equal(resendTooSoon.ok, false);
    if (!resendTooSoon.ok) {
      assert.equal(resendTooSoon.status, 429);
    }

    // Verify correct code on Instance B (cross-instance!)
    const verified = await instanceB.verifyPasswordResetOtp('user1@livralink.bj', issued.rawCode);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;

    // Concurrent replay of the same single-use resetToken across Instance A and Instance B: exactly 1 succeeds
    const [use1, use2] = await Promise.all([
      instanceA.consumePasswordResetToken('user1@livralink.bj', verified.resetToken),
      instanceB.consumePasswordResetToken('user1@livralink.bj', verified.resetToken),
    ]);
    const successes = [use1, use2].filter((r) => r.ok);
    const failures = [use1, use2].filter((r) => !r.ok);
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    if (!failures[0].ok) {
      assert.equal(failures[0].status, 403);
    }
  });

  await t.test('2. Three failed OTP attempts across instances invalidate code; expired OTP is rejected', async () => {
    currentNow += 120_000;
    const issued = await instanceA.issuePasswordResetOtp('user2@livralink.bj');
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const wrongCode = issued.rawCode === '000000' ? '111111' : '000000';
    const fail1 = await instanceA.verifyPasswordResetOtp('user2@livralink.bj', wrongCode);
    assert.equal(fail1.ok, false);
    if (!fail1.ok) assert.equal(fail1.attemptsLeft, 2);

    const fail2 = await instanceB.verifyPasswordResetOtp('user2@livralink.bj', wrongCode);
    assert.equal(fail2.ok, false);
    if (!fail2.ok) assert.equal(fail2.attemptsLeft, 1);

    const fail3 = await instanceA.verifyPasswordResetOtp('user2@livralink.bj', wrongCode);
    assert.equal(fail3.ok, false);
    if (!fail3.ok) assert.equal(fail3.attemptsLeft, 0);

    // Even valid code is now rejected because 3 failures invalidated the OTP
    const afterLock = await instanceB.verifyPasswordResetOtp('user2@livralink.bj', issued.rawCode);
    assert.equal(afterLock.ok, false);

    // Expired OTP (> 10 min)
    currentNow += 120_000;
    const issuedExp = await instanceA.issuePasswordResetOtp('user3@livralink.bj');
    assert.equal(issuedExp.ok, true);
    if (!issuedExp.ok) return;
    currentNow += 10 * 60 * 1000 + 1;
    const expiredCheck = await instanceB.verifyPasswordResetOtp('user3@livralink.bj', issuedExp.rawCode);
    assert.equal(expiredCheck.ok, false);

    // Safe cleanup removes expired docs only
    const cleaned = await instanceA.cleanupExpiredSecurityDocs(25);
    assert.ok(cleaned.deletedCount >= 1);
  });
});

test('P0-B Multi-Instance Delivery POD OTP & Single-Use POD Token', async (t) => {
  let currentNow = 1_700_100_000_000;
  const sharedDb = new SharedTransactionalFirestore();

  const instanceA = createP0SecurityService(sharedDb, {
    getSecretSalt: () => SHARED_HMAC_SECRET,
    now: () => currentNow,
  });
  const instanceB = createP0SecurityService(sharedDb, {
    getSecretSalt: () => SHARED_HMAC_SECRET,
    now: () => currentNow,
  });

  const validPhoto = 'https://firebasestorage.googleapis.com/v0/b/test/o/pod%2Fphoto.jpg';
  const validSig = 'https://firebasestorage.googleapis.com/v0/b/test/o/pod%2Fsig.png';

  const seedDelivery = async (id: string, status: string, courierId = 'courier_1') => {
    await sharedDb.collection('deliveries').doc(id).set({
      id: `#${id}`,
      merchantId: 'vendor_1',
      courierId,
      clientName: 'Client Test',
      status,
    });
    await sharedDb.collection('deliveries').doc(id).collection('private').doc('otp').set({
      otpCode: '4829',
      merchantId: 'vendor_1',
    });
  };

  await t.test('1. OTP verified on Instance A completes POD on Instance B; token replay is blocked', async () => {
    await seedDelivery('LL-101', 'en_cours', 'courier_1');

    const vRes = await instanceA.verifyDeliveryPodOtp({
      cleanDocId: 'LL-101',
      callerUid: 'courier_1',
      isAdmin: false,
      rawCode: '4829',
    });
    assert.equal(vRes.ok, true);
    if (!vRes.ok) return;

    // Concurrent completion attempts with same podOtpToken across Instance B and Instance A
    const [c1, c2] = await Promise.all([
      instanceB.completeDeliveryPod({
        cleanDocId: 'LL-101',
        callerUid: 'courier_1',
        isAdmin: false,
        podOtpToken: vRes.podOtpToken,
        photoUrl: validPhoto,
        signatureDataUrl: validSig,
        signedByName: 'Client Test',
      }),
      instanceA.completeDeliveryPod({
        cleanDocId: 'LL-101',
        callerUid: 'courier_1',
        isAdmin: false,
        podOtpToken: vRes.podOtpToken,
        photoUrl: validPhoto,
        signatureDataUrl: validSig,
        signedByName: 'Client Test',
      }),
    ]);

    const okCount = [c1, c2].filter((r) => r.ok).length;
    const failCount = [c1, c2].filter((r) => !r.ok).length;
    assert.equal(okCount, 1);
    assert.equal(failCount, 1);

    const updatedDelivery = await sharedDb.collection('deliveries').doc('LL-101').get();
    assert.equal(updatedDelivery.data()?.status, 'livree');

    // Cross-order /api/pod/media proof URL must be rejected
    await seedDelivery('LL-101B', 'en_cours', 'courier_1');
    const vResB = await instanceA.verifyDeliveryPodOtp({
      cleanDocId: 'LL-101B',
      callerUid: 'courier_1',
      isAdmin: false,
      rawCode: '4829',
    });
    assert.equal(vResB.ok, true);
    if (!vResB.ok) return;

    const crossOrderRes = await instanceA.completeDeliveryPod({
      cleanDocId: 'LL-101B',
      callerUid: 'courier_1',
      isAdmin: false,
      podOtpToken: vResB.podOtpToken,
      photoUrl: `/api/pod/media?path=${encodeURIComponent('pod/LL-101/photo_1.jpg')}`,
      signatureDataUrl: `/api/pod/media?path=${encodeURIComponent('pod/LL-101B/sig_1.png')}`,
      signedByName: 'Client Test',
    });
    assert.equal(crossOrderRes.ok, false);
    if (!crossOrderRes.ok) assert.equal(crossOrderRes.status, 400);

    const ownOrderRes = await instanceA.completeDeliveryPod({
      cleanDocId: 'LL-101B',
      callerUid: 'courier_1',
      isAdmin: false,
      podOtpToken: vResB.podOtpToken,
      photoUrl: `/api/pod/media?path=${encodeURIComponent('pod/LL-101B/photo_1.jpg')}`,
      signatureDataUrl: `/api/pod/media?path=${encodeURIComponent('pod/LL-101B/sig_1.png')}`,
      signedByName: 'Client Test',
    });
    assert.equal(ownOrderRes.ok, true);
  });

  await t.test('2. Unassigned courier, ineligible status, and 5 failed attempts across instances are blocked', async () => {
    await seedDelivery('LL-102', 'en_cours', 'courier_1');
    await seedDelivery('LL-103', 'en_attente', 'courier_1');

    // Wrong courier
    const wrongCourier = await instanceA.verifyDeliveryPodOtp({
      cleanDocId: 'LL-102',
      callerUid: 'courier_other',
      isAdmin: false,
      rawCode: '4829',
    });
    assert.equal(wrongCourier.ok, false);
    if (!wrongCourier.ok) assert.equal(wrongCourier.status, 403);

    // Ineligible status ('en_attente')
    const badStatus = await instanceA.verifyDeliveryPodOtp({
      cleanDocId: 'LL-103',
      callerUid: 'courier_1',
      isAdmin: false,
      rawCode: '4829',
    });
    assert.equal(badStatus.ok, false);
    if (!badStatus.ok) assert.equal(badStatus.status, 400);

    // 5 failed OTP attempts split across Instance A & Instance B -> 6th attempt returns 429 even with valid code
    for (let i = 0; i < 5; i++) {
      const target = i % 2 === 0 ? instanceA : instanceB;
      const fail = await target.verifyDeliveryPodOtp({
        cleanDocId: 'LL-102',
        callerUid: 'courier_1',
        isAdmin: false,
        rawCode: '0000',
      });
      assert.equal(fail.ok, false);
      if (!fail.ok) assert.equal(fail.status, 400);
    }

    const lockedOut = await instanceB.verifyDeliveryPodOtp({
      cleanDocId: 'LL-102',
      callerUid: 'courier_1',
      isAdmin: false,
      rawCode: '4829',
    });
    assert.equal(lockedOut.ok, false);
    if (!lockedOut.ok) assert.equal(lockedOut.status, 429);
  });
});

test('P0-C Multi-Instance Wallet Payout Transactions, Concurrency, Provider Failure & Recovery', async (t) => {
  let currentNow = 1_700_200_000_000;
  const sharedDb = new SharedTransactionalFirestore();

  let mockProviderBehavior: PayoutProviderAdapter = async ({ idempotencyKey }) => ({
    outcome: 'succeeded',
    providerReference: `MOMO_${idempotencyKey.slice(-6)}`,
  });

  const instanceA = createP0SecurityService(sharedDb, {
    getSecretSalt: () => SHARED_HMAC_SECRET,
    now: () => currentNow,
    payoutProvider: (req) => mockProviderBehavior(req),
  });
  const instanceB = createP0SecurityService(sharedDb, {
    getSecretSalt: () => SHARED_HMAC_SECRET,
    now: () => currentNow,
    payoutProvider: (req) => mockProviderBehavior(req),
  });

  await t.test('1. Valid payout updates balance atomically and creates ledger; insufficient balance rejected', async () => {
    await sharedDb.collection('users').doc('courier_w1').set({
      uid: 'courier_w1',
      role: 'livreur',
      walletBalanceFCFA: 10000,
    });

    const tooMuch = await instanceA.verifyWalletPayoutIdempotency({
      callerUid: 'courier_w1',
      idempotencyKey: 'key_too_much_1',
      amount: 15000,
    });
    assert.equal(tooMuch.ok, false);
    if (!tooMuch.ok) assert.equal(tooMuch.status, 400);

    const vOk = await instanceA.verifyWalletPayoutIdempotency({
      callerUid: 'courier_w1',
      idempotencyKey: 'key_valid_1',
      amount: 4000,
    });
    assert.equal(vOk.ok, true);

    const cOk = await instanceB.commitWalletPayout({
      callerUid: 'courier_w1',
      idempotencyKey: 'key_valid_1',
      amount: 4000,
      operator: 'wave',
    });
    assert.equal(cOk.ok, true);
    if (cOk.ok) {
      assert.equal(cOk.balanceBefore, 10000);
      assert.equal(cOk.balanceAfter, 6000);
    }

    const userAfter = await sharedDb.collection('users').doc('courier_w1').get();
    assert.equal(userAfter.data()?.walletBalanceFCFA, 6000);

    // Reusing committed idempotency key is rejected (409)
    const reuseVerify = await instanceA.verifyWalletPayoutIdempotency({
      callerUid: 'courier_w1',
      idempotencyKey: 'key_valid_1',
      amount: 4000,
    });
    assert.equal(reuseVerify.ok, false);
    if (!reuseVerify.ok) assert.equal(reuseVerify.status, 409);

    const reuseCommit = await instanceB.commitWalletPayout({
      callerUid: 'courier_w1',
      idempotencyKey: 'key_valid_1',
      amount: 4000,
    });
    assert.equal(reuseCommit.ok, false);
    if (!reuseCommit.ok) assert.equal(reuseCommit.status, 409);
  });

  await t.test('2. Two simultaneous incompatible payouts across instances cannot overdraft', async () => {
    await sharedDb.collection('users').doc('courier_w2').set({
      uid: 'courier_w2',
      role: 'livreur',
      walletBalanceFCFA: 10000,
    });

    // Two concurrent verify calls with DIFFERENT idempotencyKeys for 7000 each (sum 14000 > 10000)
    const [r1, r2] = await Promise.all([
      instanceA.verifyWalletPayoutIdempotency({
        callerUid: 'courier_w2',
        idempotencyKey: 'concurrent_key_1',
        amount: 7000,
      }),
      instanceB.verifyWalletPayoutIdempotency({
        callerUid: 'courier_w2',
        idempotencyKey: 'concurrent_key_2',
        amount: 7000,
      }),
    ]);

    assert.equal([r1, r2].filter((r) => r.ok).length, 1);
    assert.equal([r1, r2].filter((r) => !r.ok).length, 1);
  });

  await t.test('3. Provider failure compensates exact balance and marks ledger reversed; uncertain response recovers safely', async () => {
    await sharedDb.collection('users').doc('courier_w3').set({
      uid: 'courier_w3',
      role: 'livreur',
      walletBalanceFCFA: 12000,
    });

    // Case A: Provider fails -> balance must be restored to 12000
    mockProviderBehavior = async () => ({ outcome: 'failed', error: 'MOMO_INSUFFICIENT_LIQUIDITY' });
    const vFail = await instanceA.verifyWalletPayoutIdempotency({
      callerUid: 'courier_w3',
      idempotencyKey: 'key_provider_fail',
      amount: 5000,
    });
    assert.equal(vFail.ok, true);

    const cFail = await instanceB.commitWalletPayout({
      callerUid: 'courier_w3',
      idempotencyKey: 'key_provider_fail',
      amount: 5000,
    });
    assert.equal(cFail.ok, false);
    if (!cFail.ok) {
      assert.equal(cFail.status, 502);
      assert.equal(cFail.compensated, true);
    }
    const balAfterFail = (await sharedDb.collection('users').doc('courier_w3').get()).data()?.walletBalanceFCFA;
    assert.equal(balAfterFail, 12000);

    // Case B: Provider times out (uncertain) -> funds held (7000 left), concurrent payout blocked, then recovery succeeds ONCE
    mockProviderBehavior = async () => ({ outcome: 'uncertain', error: 'GATEWAY_TIMEOUT' });
    const vUncertain = await instanceA.verifyWalletPayoutIdempotency({
      callerUid: 'courier_w3',
      idempotencyKey: 'key_provider_uncertain',
      amount: 5000,
    });
    assert.equal(vUncertain.ok, true);

    const cUncertain = await instanceA.commitWalletPayout({
      callerUid: 'courier_w3',
      idempotencyKey: 'key_provider_uncertain',
      amount: 5000,
    });
    assert.equal(cUncertain.ok, false);
    if (!cUncertain.ok) {
      assert.equal(cUncertain.status, 202);
      assert.equal(cUncertain.requiresReconciliation, true);
    }

    // While uncertain, user CANNOT initiate another withdrawal
    const blockedWhileUncertain = await instanceB.verifyWalletPayoutIdempotency({
      callerUid: 'courier_w3',
      idempotencyKey: 'key_another_attempt',
      amount: 2000,
    });
    assert.equal(blockedWhileUncertain.ok, false);
    if (!blockedWhileUncertain.ok) assert.equal(blockedWhileUncertain.status, 429);

    // Now provider resolves as succeeded on retry with SAME idempotencyKey -> NO double debit (balance stays 7000!)
    mockProviderBehavior = async () => ({ outcome: 'succeeded', providerReference: 'MOMO_RECOVERED_999' });
    const cRecovered = await instanceB.commitWalletPayout({
      callerUid: 'courier_w3',
      idempotencyKey: 'key_provider_uncertain',
      amount: 5000,
    });
    assert.equal(cRecovered.ok, true);
    if (cRecovered.ok) {
      assert.equal(cRecovered.recoveredFromInterruption, true);
      assert.equal(cRecovered.balanceAfter, 7000);
    }
    const finalBal = (await sharedDb.collection('users').doc('courier_w3').get()).data()?.walletBalanceFCFA;
    assert.equal(finalBal, 7000);
  });

  await t.test('4. Parallel commitWalletPayout on same processing key is blocked by exclusive lease (provider runs once)', async () => {
    await sharedDb.collection('users').doc('courier_w4').set({
      uid: 'courier_w4',
      role: 'livreur',
      walletBalanceFCFA: 15000,
    });

    let providerExecutions = 0;
    let releaseProvider!: () => void;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });

    const slowProvider: PayoutProviderAdapter = async ({ idempotencyKey }) => {
      providerExecutions++;
      await providerGate;
      return { outcome: 'succeeded', providerReference: `MOMO_ONCE_${idempotencyKey}` };
    };

    const svcA = createP0SecurityService(sharedDb, {
      getSecretSalt: () => SHARED_HMAC_SECRET,
      now: () => currentNow,
      payoutProvider: slowProvider,
    });
    const svcB = createP0SecurityService(sharedDb, {
      getSecretSalt: () => SHARED_HMAC_SECRET,
      now: () => currentNow,
      payoutProvider: slowProvider,
    });

    const lockRes = await svcA.verifyWalletPayoutIdempotency({
      callerUid: 'courier_w4',
      idempotencyKey: 'key_lease_parallel',
      amount: 5000,
    });
    assert.equal(lockRes.ok, true);

    const firstCommitPromise = svcA.commitWalletPayout({
      callerUid: 'courier_w4',
      idempotencyKey: 'key_lease_parallel',
      amount: 5000,
    });

    // Wait a tick so Phase 1 commits 'processing' with active processingExpiresAt lease
    await new Promise((r) => setTimeout(r, 20));

    // Concurrent duplicate commit on Instance B while lease is active must be rejected (409)
    const parallelCommit = await svcB.commitWalletPayout({
      callerUid: 'courier_w4',
      idempotencyKey: 'key_lease_parallel',
      amount: 5000,
    });
    assert.equal(parallelCommit.ok, false);
    if (!parallelCommit.ok) {
      assert.equal(parallelCommit.status, 409);
      assert.equal(parallelCommit.inFlight, true);
    }

    releaseProvider();
    const firstCommit = await firstCommitPromise;
    assert.equal(firstCommit.ok, true);
    assert.equal(providerExecutions, 1);
    const bal = (await sharedDb.collection('users').doc('courier_w4').get()).data()?.walletBalanceFCFA;
    assert.equal(bal, 10000);
  });

  await t.test('5. Abandoned processing lease recovery after expiry & admin reconciliation', async () => {
    await sharedDb.collection('users').doc('courier_w5').set({
      uid: 'courier_w5',
      role: 'livreur',
      walletBalanceFCFA: 20000,
    });

    // Simulate worker crash right after Phase 1 reserved 6000 FCFA
    const idemDocId = (await import('../server/p0Security')).getPayoutIdempotencyDocId('courier_w5', 'key_abandoned_1');
    await sharedDb.collection('payout_idempotency').doc(idemDocId).set({
      id: idemDocId,
      uid: 'courier_w5',
      idempotencyKey: 'key_abandoned_1',
      amount: 6000,
      reservedAmount: 6000,
      balanceBefore: 20000,
      balanceAfter: 14000,
      status: 'processing',
      processingLeaseId: 'crashed_worker_lease',
      processingStartedAt: currentNow,
      processingExpiresAt: currentNow + 60_000,
      processingAttemptCount: 1,
    });
    await sharedDb.collection('users').doc('courier_w5').update({ walletBalanceFCFA: 14000 });
    await sharedDb.collection('wallet_transactions').doc(`wtx_${idemDocId}`).set({
      id: `wtx_${idemDocId}`,
      uid: 'courier_w5',
      amountFCFA: 6000,
      status: 'processing',
    });
    await sharedDb.collection('payout_user_locks').doc('courier_w5').set({
      uid: 'courier_w5',
      activeDocKeyId: idemDocId,
      status: 'processing',
    });

    // While lease is active, admin reconciliation must refuse (409)
    const earlyAdmin = await instanceA.reconcileWalletPayout({
      adminUid: 'admin_1',
      targetUid: 'courier_w5',
      idempotencyKey: 'key_abandoned_1',
      resolution: 'compensate_failed',
      reason: 'Early check',
    });
    assert.equal(earlyAdmin.ok, false);
    if (!earlyAdmin.ok) assert.equal(earlyAdmin.status, 409);

    // Advance clock past processingExpiresAt -> abandoned operation can be reconciled cleanly
    currentNow += 61_000;
    const pendingList = await instanceB.listPendingWalletPayouts(50);
    assert.ok(pendingList.some((p) => p.idempotencyKey === 'key_abandoned_1' && p.leaseExpired === true));

    const reconFail = await instanceB.reconcileWalletPayout({
      adminUid: 'admin_1',
      adminEmail: 'Pamphile.gbede@gmail.com',
      targetUid: 'courier_w5',
      idempotencyKey: 'key_abandoned_1',
      resolution: 'compensate_failed',
      reason: 'Timeout confirmé non exécuté chez MoMo',
    });
    assert.equal(reconFail.ok, true);
    if (reconFail.ok) {
      assert.equal(reconFail.statusAfter, 'failed');
      assert.equal(reconFail.restoredBalance, 20000);
    }

    const balRestored = (await sharedDb.collection('users').doc('courier_w5').get()).data()?.walletBalanceFCFA;
    assert.equal(balRestored, 20000);
    const lockAfter = await sharedDb.collection('payout_user_locks').doc('courier_w5').get();
    assert.equal(lockAfter.exists, false);
  });

  await t.test('6. Missing or short (< 32 chars) HMAC secret blocks OTP/reset/POD with 503', async () => {
    const noSecretSvc = createP0SecurityService(sharedDb, {
      getSecretSalt: () => 'too-short-secret',
      now: () => currentNow,
    });

    const otpRes = await noSecretSvc.issuePasswordResetOtp('blocked@livralink.bj');
    assert.equal(otpRes.ok, false);
    if (!otpRes.ok) assert.equal(otpRes.status, 503);

    const verifyRes = await noSecretSvc.verifyPasswordResetOtp('blocked@livralink.bj', '123456');
    assert.equal(verifyRes.ok, false);
    if (!verifyRes.ok) assert.equal(verifyRes.status, 503);

    const podRes = await noSecretSvc.verifyDeliveryPodOtp({
      cleanDocId: 'LL-101',
      callerUid: 'courier_1',
      isAdmin: false,
      rawCode: '4829',
    });
    assert.equal(podRes.ok, false);
    if (!podRes.ok) assert.equal(podRes.status, 503);
  });
});

test('P0 HTTP Route Integration against Express server.ts with injected Firestore store', async () => {
  process.env.NODE_ENV = 'test';
  const sharedDb = new SharedTransactionalFirestore();
  const svc = createP0SecurityService(sharedDb, {
    getSecretSalt: () => SHARED_HMAC_SECRET,
  });

  const { app, setP0SecurityForTests } = await import('../../server');
  setP0SecurityForTests(svc);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const issued = await svc.issuePasswordResetOtp('httpuser@livralink.bj');
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const verifyRes = await fetch(`${baseUrl}/api/auth/verify-reset-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'httpuser@livralink.bj', code: issued.rawCode }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody = await verifyRes.json();
    assert.equal(verifyBody.success, true);
    assert.ok(verifyBody.resetToken);

    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'httpuser@livralink.bj',
        resetToken: verifyBody.resetToken,
        newPassword: 'StrongPassword#2026',
      }),
    });
    assert.equal(resetRes.status, 200);

    // Replay same token via HTTP -> strictly rejected with 403
    const replayRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'httpuser@livralink.bj',
        resetToken: verifyBody.resetToken,
        newPassword: 'AnotherPassword#2026',
      }),
    });
    assert.equal(replayRes.status, 403);
  } finally {
    setP0SecurityForTests(null);
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});

test('isTrustedFirebaseStorageUrl rejects non-POD paths and traversal', async () => {
  const { isTrustedFirebaseStorageUrl } = await import('../server/p0Security');

  assert.equal(
    isTrustedFirebaseStorageUrl('/api/pod/media?path=pod%2FLL-101%2Fphoto_1.jpg', 'LL-101'),
    true
  );
  assert.equal(
    isTrustedFirebaseStorageUrl('/api/pod/media?path=pod%2FLL-OTHER%2Fphoto_1.jpg', 'LL-101'),
    false
  );
  assert.equal(
    isTrustedFirebaseStorageUrl('/api/pod/media?path=avatars%2Fu1%2Fpic.jpg', 'LL-101'),
    false
  );
  assert.equal(
    isTrustedFirebaseStorageUrl('https://firebasestorage.googleapis.com/v0/b/test/o/pod%2FLL-101%2Fp.jpg', 'LL-101'),
    true
  );
  assert.equal(
    isTrustedFirebaseStorageUrl('https://firebasestorage.googleapis.com/v0/b/test/o/avatars%2Fu1%2Fp.jpg', 'LL-101'),
    false
  );
  assert.equal(
    isTrustedFirebaseStorageUrl('https://firebasestorage.googleapis.com/v0/b/test/o/pod%2F..%2Fkyc%2Fsecret.jpg', 'LL-101'),
    false
  );
  assert.equal(isTrustedFirebaseStorageUrl('https://evil.example.com/pod/LL-101/photo.jpg', 'LL-101'), false);
});

