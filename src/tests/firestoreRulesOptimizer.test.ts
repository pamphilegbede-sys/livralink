import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluatePayoutProviderConfig,
  resolvePayoutProviderAdapter,
  verifyMobileMoneyWebhookSignature,
} from '../server/mobileMoneyProvider';

test('Firestore rules optimization & Mobile Money PSP readiness tests', async (t) => {
  await t.test('firestore.rules locks system_backups and all internal backend collections', () => {
    const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const lockedCollections = [
      'auth_reset_otps',
      'auth_reset_tokens',
      'pod_otp_attempts',
      'pod_otp_tokens',
      'payout_idempotency',
      'payout_user_locks',
      'system_config',
      'email_logs',
      'email_queue',
      'email_dedup',
      'ai_usage_guards',
      'system_backups',
    ];
    for (const col of lockedCollections) {
      const pattern = new RegExp(`match /${col}/\\{[^}]+\\}\\s*\\{\\s*allow read, write: if false;\\s*\\}`);
      assert.match(rulesText, pattern, `${col} must deny all direct client read/write`);
    }
  });

  await t.test('firestore.rules factors delivery/mission update helpers to single callerUserData lookup (well below 1,000-expression limit)', () => {
    const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

    const extractFunction = (fnName: string) => {
      const start = rulesText.indexOf(`function ${fnName}(`);
      assert.notEqual(start, -1, `Expected helper ${fnName} in firestore.rules`);
      const nextMatch = rulesText.slice(start + 1).search(/\n\s{4}(?:function|match)\s/);
      return nextMatch === -1 ? rulesText.slice(start) : rulesText.slice(start, start + 1 + nextMatch);
    };

    const delivHelper = extractFunction('canNonAdminUpdateDelivery');
    const missionHelper = extractFunction('canNonAdminUpdateMission');
    const userHelper = extractFunction('canOwnerUpdateUserDoc');

    // Each helper reads callerUserData() at most ONCE via `let u = ...`
    assert.equal((delivHelper.match(/callerUserData\(\)/g) || []).length, 1);
    assert.equal((missionHelper.match(/callerUserData\(\)/g) || []).length, 1);
    // User update checks existing().role directly without extra DB read
    assert.equal((userHelper.match(/isLivreur\(/g) || []).length, 0);
    assert.equal((userHelper.match(/callerUserData\(/g) || []).length, 0);

    // isValidKYCDossier must not embed redundant isAdmin() calls
    const kycHelper = extractFunction('isValidKYCDossier');
    assert.equal((kycHelper.match(/isAdmin/g) || []).length, 0);
  });

  await t.test('Mobile Money adapter: simulator mode works for MVP while live PSP modes fail closed if keys are missing', async () => {
    const simEval = evaluatePayoutProviderConfig({ PAYOUT_PROVIDER_MODE: 'simulator' } as NodeJS.ProcessEnv);
    assert.equal(simEval.mode, 'simulator');
    assert.equal(simEval.isSimulated, true);
    assert.equal(simEval.ready, true);

    const simAdapter = resolvePayoutProviderAdapter({ PAYOUT_PROVIDER_MODE: 'simulator' } as NodeJS.ProcessEnv);
    const simRes = await simAdapter({ uid: 'u1', amount: 5000, idempotencyKey: 'idem_1' });
    assert.equal(simRes.outcome, 'succeeded');
    assert.equal(simRes.isSimulatedProvider, true);
    assert.ok(simRes.providerReference.startsWith('SIM_LLP_'));

    // Unconfigured live mode MUST fail closed (never silently simulate!)
    for (const liveMode of ['fedapay', 'kkiapay', 'mtn_momo', 'wave']) {
      const liveEval = evaluatePayoutProviderConfig({ PAYOUT_PROVIDER_MODE: liveMode } as NodeJS.ProcessEnv);
      assert.equal(liveEval.liveConfigured, false);
      assert.equal(liveEval.ready, false);
      assert.ok(liveEval.missingEnvVars.length >= 3);

      const liveAdapter = resolvePayoutProviderAdapter({ PAYOUT_PROVIDER_MODE: liveMode } as NodeJS.ProcessEnv);
      const liveRes = await liveAdapter({ uid: 'u1', amount: 5000, idempotencyKey: 'idem_2' });
      assert.equal(liveRes.outcome, 'failed');
      assert.equal(liveRes.isSimulatedProvider, false);
    }
  });

  await t.test('Mobile Money live HTTP adapter maps 200 -> succeeded, 400 -> failed, 503/network -> uncertain & verifies webhook HMAC', async () => {
    const liveEnv = {
      PAYOUT_PROVIDER_MODE: 'fedapay',
      MOBILE_MONEY_API_BASE_URL: 'https://api.fedapay.example/v1',
      MOBILE_MONEY_API_KEY: 'live_secret_key_test',
      MOBILE_MONEY_WEBHOOK_SECRET: 'webhook_hmac_secret_123456',
    } as unknown as NodeJS.ProcessEnv;

    const okAdapter = resolvePayoutProviderAdapter(liveEnv, async () => ({
      ok: true,
      status: 200,
      json: async () => ({ providerReference: 'FEDA_TX_999' }),
    }));
    const okRes = await okAdapter({ uid: 'u1', amount: 12000, idempotencyKey: 'idem_ok' });
    assert.equal(okRes.outcome, 'succeeded');
    assert.equal(okRes.isSimulatedProvider, false);
    if (okRes.outcome === 'succeeded') {
      assert.equal(okRes.providerReference, 'FEDA_TX_999');
    }

    const rejectAdapter = resolvePayoutProviderAdapter(liveEnv, async () => ({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Numéro bénéficiaire invalide' }),
    }));
    const rejectRes = await rejectAdapter({ uid: 'u1', amount: 12000, idempotencyKey: 'idem_rej' });
    assert.equal(rejectRes.outcome, 'failed');
    assert.equal(rejectRes.isSimulatedProvider, false);

    const transientAdapter = resolvePayoutProviderAdapter(liveEnv, async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    const transientRes = await transientAdapter({ uid: 'u1', amount: 12000, idempotencyKey: 'idem_503' });
    assert.equal(transientRes.outcome, 'uncertain');
    assert.equal(transientRes.isSimulatedProvider, false);

    const payload = JSON.stringify({ event: 'payout.succeeded', reference: 'FEDA_TX_999' });
    const secret = 'webhook_hmac_secret_123456';
    const validSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    assert.equal(verifyMobileMoneyWebhookSignature({ rawBody: payload, signatureHeader: `sha256=${validSig}`, secret }), true);
    assert.equal(verifyMobileMoneyWebhookSignature({ rawBody: payload, signatureHeader: `sha256=${'0'.repeat(64)}`, secret }), false);
  });
});
