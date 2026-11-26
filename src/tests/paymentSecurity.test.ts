import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';

class PaymentMockFirestore {
  public docs = new Map<string, Record<string, any>>();
  private txChain: Promise<any> = Promise.resolve();

  private makeSnap(pathStr: string, data: Record<string, any> | undefined) {
    const id = pathStr.split('/').pop() || '';
    const cloned = data ? structuredClone(data) : undefined;
    return {
      exists: Boolean(cloned),
      id,
      data: () => (cloned ? structuredClone(cloned) : undefined),
    };
  }

  private makeDocRef(pathStr: string): any {
    const self = this;
    const id = pathStr.split('/').pop() || '';
    return {
      id,
      path: pathStr,
      collection(subName: string) {
        return self.makeCollectionRef(`${pathStr}/${subName}`);
      },
      async get() {
        return self.makeSnap(pathStr, self.docs.get(pathStr));
      },
      async set(data: Record<string, any>, options?: { merge?: boolean }) {
        const prev = self.docs.get(pathStr);
        if (options?.merge && prev) {
          const merged = { ...structuredClone(prev) };
          for (const [k, v] of Object.entries(structuredClone(data))) {
            if (
              v &&
              typeof v === 'object' &&
              !Array.isArray(v) &&
              merged[k] &&
              typeof merged[k] === 'object' &&
              !Array.isArray(merged[k])
            ) {
              merged[k] = { ...merged[k], ...v };
            } else {
              merged[k] = v;
            }
          }
          self.docs.set(pathStr, merged);
        } else {
          self.docs.set(pathStr, structuredClone(data));
        }
      },
      async update(data: Record<string, any>) {
        const prev = self.docs.get(pathStr);
        if (!prev) throw new Error(`Document does not exist: ${pathStr}`);
        self.docs.set(pathStr, { ...structuredClone(prev), ...structuredClone(data) });
      },
      async delete() {
        self.docs.delete(pathStr);
      },
    };
  }

  private makeCollectionRef(basePath: string): any {
    const self = this;
    const buildQuery = (
      filters: Array<{ field: string; op: string; value: any }> = [],
      sortField?: string,
      sortDir: 'asc' | 'desc' = 'asc',
      maxLimit?: number
    ): any => ({
      where(field: string, op: string, value: any) {
        return buildQuery([...filters, { field, op, value }], sortField, sortDir, maxLimit);
      },
      orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
        return buildQuery(filters, field, dir, maxLimit);
      },
      limit(n: number) {
        return buildQuery(filters, sortField, sortDir, n);
      },
      async get() {
        const prefix = `${basePath}/`;
        let matched: Array<{ id: string; path: string; data: Record<string, any> }> = [];
        for (const [docPath, data] of self.docs.entries()) {
          if (!docPath.startsWith(prefix)) continue;
          const rest = docPath.slice(prefix.length);
          if (rest.includes('/')) continue;
          const passes = filters.every(({ field, op, value }) => {
            const v = data[field];
            if (op === '==') return v === value;
            if (op === '<') return typeof v === 'number' && v < value;
            if (op === '>') return typeof v === 'number' && v > value;
            return false;
          });
          if (passes) {
            matched.push({ id: rest, path: docPath, data });
          }
        }
        if (sortField) {
          matched.sort((a, b) => {
            const av = a.data[sortField] ?? '';
            const bv = b.data[sortField] ?? '';
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return sortDir === 'desc' ? -cmp : cmp;
          });
        }
        if (maxLimit && maxLimit > 0) {
          matched = matched.slice(0, maxLimit);
        }
        const docs = matched.map((m) => self.makeSnap(m.path, m.data));
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach(cb: (d: any) => void) {
            docs.forEach(cb);
          },
        };
      },
    });

    return {
      doc(id: string) {
        return self.makeDocRef(`${basePath}/${id}`);
      },
      where(field: string, op: string, value: any) {
        return buildQuery([{ field, op, value }]);
      },
      orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
        return buildQuery([], field, dir);
      },
      limit(n: number) {
        return buildQuery([], undefined, 'asc', n);
      },
      async get() {
        return buildQuery([]).get();
      },
    };
  }

  collection(name: string) {
    return this.makeCollectionRef(name);
  }

  batch() {
    const ops: Array<() => void> = [];
    return {
      set: (ref: any, data: Record<string, any>, options?: { merge?: boolean }) => {
        ops.push(() => {
          const prev = this.docs.get(ref.path);
          if (options?.merge && prev) {
            this.docs.set(ref.path, { ...structuredClone(prev), ...structuredClone(data) });
          } else {
            this.docs.set(ref.path, structuredClone(data));
          }
        });
      },
      update: (ref: any, data: Record<string, any>) => {
        ops.push(() => {
          const prev = this.docs.get(ref.path) || {};
          this.docs.set(ref.path, { ...structuredClone(prev), ...structuredClone(data) });
        });
      },
      delete: (ref: any) => {
        ops.push(() => this.docs.delete(ref.path));
      },
      commit: async () => {
        ops.forEach((op) => op());
      },
    };
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const run = async () => {
      const staged = new Map<string, Record<string, any> | null>();
      const tx = {
        get: async (ref: any) => {
          const val = staged.has(ref.path) ? staged.get(ref.path) || undefined : this.docs.get(ref.path);
          return this.makeSnap(ref.path, val);
        },
        set: (ref: any, data: Record<string, any>, options?: { merge?: boolean }) => {
          const prev = staged.has(ref.path) ? staged.get(ref.path) || undefined : this.docs.get(ref.path);
          if (options?.merge && prev) {
            staged.set(ref.path, { ...structuredClone(prev), ...structuredClone(data) });
          } else {
            staged.set(ref.path, structuredClone(data));
          }
        },
        update: (ref: any, data: Record<string, any>) => {
          const prev = staged.has(ref.path) ? staged.get(ref.path) || undefined : this.docs.get(ref.path);
          if (!prev) throw new Error(`Missing doc in tx: ${ref.path}`);
          staged.set(ref.path, { ...structuredClone(prev), ...structuredClone(data) });
        },
        delete: (ref: any) => {
          staged.set(ref.path, null);
        },
      };
      const result = await fn(tx);
      for (const [p, v] of staged.entries()) {
        if (v === null) this.docs.delete(p);
        else this.docs.set(p, v);
      }
      return result;
    };

    const next = this.txChain.then(run, run);
    this.txChain = next.catch(() => {});
    return next;
  }
}

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

function signFedaPay(rawBody: string, secret: string, tsSeconds = Math.floor(Date.now() / 1000)): string {
  const sig = crypto.createHmac('sha256', secret).update(`${tsSeconds}.${rawBody}`, 'utf8').digest('hex');
  return `t=${tsSeconds},s=${sig}`;
}

function signWave(rawBody: string, secret: string, tsSeconds = Math.floor(Date.now() / 1000)): string {
  const sig = crypto.createHmac('sha256', secret).update(`${tsSeconds}.${rawBody}`, 'utf8').digest('hex');
  return `t=${tsSeconds},v1=${sig}`;
}

test('Faille #6 — Suite complète de sécurité paiements Mobile Money (14 vecteurs d’attaque)', async (t) => {
  const serverMod = await import('../../server');
  const { evaluatePayoutProviderConfig, resolvePayoutProviderAdapter } = await import(
    '../server/mobileMoneyProvider'
  );
  const { createP0SecurityService } = await import('../server/p0Security');
  const { handleMobileMoneyWebhook } = await import('../server/paymentService');

  const { baseUrl, close } = await startTestServer();
  const db = new PaymentMockFirestore();

  const savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    PAYOUT_PROVIDER_MODE: process.env.PAYOUT_PROVIDER_MODE,
    MOBILE_MONEY_API_BASE_URL: process.env.MOBILE_MONEY_API_BASE_URL,
    MOBILE_MONEY_API_KEY: process.env.MOBILE_MONEY_API_KEY,
    MOBILE_MONEY_WEBHOOK_SECRET: process.env.MOBILE_MONEY_WEBHOOK_SECRET,
  };

  const WEBHOOK_SECRET = 'livralink_webhook_secret_2026_test_key_64chars_secure';
  process.env.PAYOUT_PROVIDER_MODE = 'fedapay';
  process.env.MOBILE_MONEY_API_BASE_URL = 'https://api.fedapay.example/v1';
  process.env.MOBILE_MONEY_API_KEY = 'feda_live_test_key';
  process.env.MOBILE_MONEY_WEBHOOK_SECRET = WEBHOOK_SECRET;

  // Baseline fixtures
  db.docs.set('users/vendor_sec_1', {
    uid: 'vendor_sec_1',
    role: 'vendeur',
    fullName: 'Boutique Sécurisée',
    storeName: 'Boutique Sécurisée',
    email: 'vendor-sec@livralink.bj',
    phone: '+2290197111111',
    storeCommune: 'Cotonou',
    storeAddress: 'Haie Vive',
    status: 'actif',
    accountStatus: 'actif',
    walletBalanceFCFA: 5000,
    isKycVerified: true,
    kycStatus: 'valide',
  });

  db.docs.set('users/courier_sec_1', {
    uid: 'courier_sec_1',
    role: 'livreur',
    fullName: 'Livreur Sécurisé',
    email: 'courier-sec@livralink.bj',
    phone: '+2290197222222',
    status: 'en_ligne',
    accountStatus: 'actif',
    walletBalanceFCFA: 25000,
    isKycVerified: true,
    kycStatus: 'valide',
  });

  db.docs.set('users/courier_suspended', {
    uid: 'courier_suspended',
    role: 'livreur',
    fullName: 'Livreur Suspendu',
    email: 'courier-susp@livralink.bj',
    phone: '+2290197333333',
    status: 'suspendu',
    accountStatus: 'suspendu',
    walletBalanceFCFA: 15000,
    isKycVerified: true,
  });

  db.docs.set('users/outsider_sec', {
    uid: 'outsider_sec',
    role: 'client',
    fullName: 'Tiers Externe',
    email: 'outsider-sec@livralink.bj',
    phone: '+2290197444444',
    walletBalanceFCFA: 0,
  });

  db.docs.set('deliveries/ORDER_PAY_A', {
    id: '#ORDER_PAY_A',
    merchantId: 'vendor_sec_1',
    clientId: 'client_sec_1',
    clientName: 'Client Alpha',
    clientPhone: '+2290197555555',
    status: 'en_attente',
    itemValueCOD: 5000,
    deliveryFee: 1500,
    totalCustomerPayable: 6500,
    paymentStatus: 'unpaid',
    paymentCurrency: 'XOF',
    refundedAmountFCFA: 0,
    refundStatus: 'none',
  });

  db.docs.set('deliveries/ORDER_PAY_B', {
    id: '#ORDER_PAY_B',
    merchantId: 'vendor_sec_1',
    clientId: 'client_sec_2',
    clientName: 'Client Beta',
    clientPhone: '+2290197666666',
    status: 'en_attente',
    itemValueCOD: 5000,
    deliveryFee: 1500,
    totalCustomerPayable: 6500,
    paymentStatus: 'unpaid',
    paymentCurrency: 'XOF',
    refundedAmountFCFA: 0,
    refundStatus: 'none',
  });

  db.docs.set('deliveries/ORDER_UNPAID', {
    id: '#ORDER_UNPAID',
    merchantId: 'vendor_sec_1',
    courierId: 'courier_sec_1',
    clientName: 'Client Unpaid',
    clientPhone: '+2290197777777',
    status: 'en_attente',
    itemValueCOD: 4000,
    deliveryFee: 1000,
    totalCustomerPayable: 5000,
    paymentStatus: 'unpaid',
    paymentCurrency: 'XOF',
    refundedAmountFCFA: 0,
    refundStatus: 'none',
  });

  serverMod.setFirestoreAdminForTests(db as any);
  serverMod.setTokenVerifierForTests(async (token: string) => {
    if (token === 'admin-tok') {
      return { uid: 'super_sec_1', email: 'Pamphile.gbede@gmail.com', email_verified: true, admin: true };
    }
    if (token === 'vendor-tok') {
      return { uid: 'vendor_sec_1', email: 'vendor-sec@livralink.bj', email_verified: true };
    }
    if (token === 'courier-tok') {
      return { uid: 'courier_sec_1', email: 'courier-sec@livralink.bj', email_verified: true };
    }
    if (token === 'susp-tok') {
      return { uid: 'courier_suspended', email: 'courier-susp@livralink.bj', email_verified: true };
    }
    throw new Error('Unauthorized test token');
  });

  // Default S2S PSP HTTP mock matching order amounts & XOF currency
  serverMod.setPaymentHttpGetterForTests(async (url: string) => {
    const ref = decodeURIComponent(url.split('/').pop() || '');
    if (ref === 'FEDA_TX_TAMPER_S2S') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'paid',
          amountFCFA: 100,
          currency: 'XOF',
          orderDocId: 'ORDER_PAY_A',
        }),
      };
    }
    if (ref === 'FEDA_TX_ORDER_A_ONLY') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'paid',
          amountFCFA: 6500,
          currency: 'XOF',
          orderDocId: 'ORDER_PAY_A',
        }),
      };
    }
    if (ref === 'FEDA_TX_S2S_DIRECT') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'paid',
          amountFCFA: 6500,
          currency: 'XOF',
          orderDocId: 'ORDER_PAY_B',
        }),
      };
    }
    if (ref === 'FEDA_TX_WRONG_CURR') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'paid',
          amountFCFA: 6500,
          currency: 'USD',
          orderDocId: 'ORDER_PAY_A',
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'paid',
        amountFCFA: 6500,
        currency: 'XOF',
      }),
    };
  });

  t.after(async () => {
    serverMod.setFirestoreAdminForTests(null);
    serverMod.setTokenVerifierForTests(null);
    serverMod.setPaymentHttpGetterForTests(null);
    Object.assign(process.env, savedEnv);
    if (savedEnv.PAYOUT_PROVIDER_MODE === undefined) delete process.env.PAYOUT_PROVIDER_MODE;
    if (savedEnv.MOBILE_MONEY_API_BASE_URL === undefined) delete process.env.MOBILE_MONEY_API_BASE_URL;
    if (savedEnv.MOBILE_MONEY_API_KEY === undefined) delete process.env.MOBILE_MONEY_API_KEY;
    if (savedEnv.MOBILE_MONEY_WEBHOOK_SECRET === undefined) delete process.env.MOBILE_MONEY_WEBHOOK_SECRET;
    await close();
  });

  // 1. Webhook avec signature invalide
  await t.test('1. Rejette (HTTP 401) tout webhook avec une signature cryptographique invalide', async () => {
    const payload = JSON.stringify({
      eventId: 'evt_bad_sig_1',
      event: 'transaction.approved',
      data: {
        orderDocId: 'ORDER_PAY_A',
        providerReference: 'FEDA_TX_BAD_SIG',
        amountFCFA: 6500,
        currency: 'XOF',
        status: 'approved',
      },
    });
    const res = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FEDAPAY-SIGNATURE': `t=${Math.floor(Date.now() / 1000)},s=${'a'.repeat(64)}`,
      },
      body: payload,
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, 'INVALID_WEBHOOK_SIGNATURE');
    assert.equal(db.docs.get('deliveries/ORDER_PAY_A')?.paymentStatus, 'unpaid');
  });

  // 2. Webhook sans signature
  await t.test('2. Rejette (HTTP 401) tout webhook sans en-tête de signature', async () => {
    const payload = JSON.stringify({
      eventId: 'evt_no_sig_1',
      event: 'transaction.approved',
      data: {
        orderDocId: 'ORDER_PAY_A',
        providerReference: 'FEDA_TX_NO_SIG',
        amountFCFA: 6500,
        currency: 'XOF',
        status: 'approved',
      },
    });
    const res = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, 'INVALID_WEBHOOK_SIGNATURE');
    assert.equal(db.docs.get('deliveries/ORDER_PAY_A')?.paymentStatus, 'unpaid');
  });

  // 3. Webhook avec montant falsifié
  await t.test('3. Rejette (HTTP 422) tout webhook dont le montant diverge du total certifié serveur ou S2S', async () => {
    const payloadTampered = JSON.stringify({
      eventId: 'evt_tamper_amt_1',
      event: 'transaction.approved',
      data: {
        orderDocId: 'ORDER_PAY_A',
        providerReference: 'FEDA_TX_TAMPER_AMT',
        amountFCFA: 100,
        currency: 'XOF',
        status: 'approved',
      },
    });
    const res = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FEDAPAY-SIGNATURE': signFedaPay(payloadTampered, WEBHOOK_SECRET),
      },
      body: payloadTampered,
    });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).code, 'S2S_AMOUNT_MISMATCH');

    // Même si le webhook prétend 6500, si l'API S2S du PSP répond 100 -> rejet S2S_AMOUNT_MISMATCH
    const payloadS2SMismatch = JSON.stringify({
      eventId: 'evt_tamper_s2s_1',
      event: 'transaction.approved',
      data: {
        orderDocId: 'ORDER_PAY_A',
        providerReference: 'FEDA_TX_TAMPER_S2S',
        amountFCFA: 6500,
        currency: 'XOF',
        status: 'approved',
      },
    });
    const res2 = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FEDAPAY-SIGNATURE': signFedaPay(payloadS2SMismatch, WEBHOOK_SECRET),
      },
      body: payloadS2SMismatch,
    });
    assert.equal(res2.status, 422);
    assert.equal((await res2.json()).code, 'S2S_AMOUNT_MISMATCH');
    assert.equal(db.docs.get('deliveries/ORDER_PAY_A')?.paymentStatus, 'unpaid');
  });

  // 4. Webhook avec référence de commande inconnue
  await t.test('4. Rejette (HTTP 404) un webhook visant une commande inexistante', async () => {
    const payload = JSON.stringify({
      eventId: 'evt_unknown_order_1',
      event: 'transaction.approved',
      data: {
        orderDocId: 'ORDER_DOES_NOT_EXIST_999',
        providerReference: 'FEDA_TX_UNKNOWN_999',
        amountFCFA: 6500,
        currency: 'XOF',
        status: 'approved',
      },
    });
    const res = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FEDAPAY-SIGNATURE': signFedaPay(payload, WEBHOOK_SECRET),
      },
      body: payload,
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, 'ORDER_NOT_FOUND');
  });

  // 5. Rejeu d'un webhook déjà traité + anti-rejeu temporel
  await t.test('5. Bloque le rejeu d’un webhook (déduplication /webhook_events et expiration > 300s)', async () => {
    const rawBody = JSON.stringify({
      eventId: 'evt_valid_order_a_1',
      event: 'transaction.approved',
      data: {
        orderDocId: 'ORDER_PAY_A',
        providerReference: 'FEDA_TX_ORDER_A_ONLY',
        amountFCFA: 6500,
        currency: 'XOF',
        status: 'approved',
      },
    });

    const first = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FEDAPAY-SIGNATURE': signFedaPay(rawBody, WEBHOOK_SECRET),
      },
      body: rawBody,
    });
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.equal(firstBody.success, true);
    assert.equal(firstBody.duplicate, false);
    assert.equal(firstBody.paymentStatus, 'paid');
    assert.equal(db.docs.get('deliveries/ORDER_PAY_A')?.paymentStatus, 'paid');

    const notifsAfterFirst = Array.from(db.docs.keys()).filter((k) => k.startsWith('notifications/notif_pay_ORDER_PAY_A'));
    assert.equal(notifsAfterFirst.length, 1);

    // Rejeu exact du même webhook -> duplicate: true, aucune seconde écriture
    const replay = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FEDAPAY-SIGNATURE': signFedaPay(rawBody, WEBHOOK_SECRET),
      },
      body: rawBody,
    });
    assert.equal(replay.status, 200);
    const replayBody = await replay.json();
    assert.equal(replayBody.duplicate, true);
    const notifsAfterReplay = Array.from(db.docs.keys()).filter((k) => k.startsWith('notifications/notif_pay_ORDER_PAY_A'));
    assert.equal(notifsAfterReplay.length, 1);

    // Horodatage expiré (> 300s) -> HTTP 401
    const expiredTs = Math.floor(Date.now() / 1000) - 600;
    const staleRes = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FEDAPAY-SIGNATURE': signFedaPay(rawBody, WEBHOOK_SECRET, expiredTs),
      },
      body: rawBody,
    });
    assert.equal(staleRes.status, 401);
    assert.equal((await staleRes.json()).code, 'INVALID_WEBHOOK_SIGNATURE');
  });

  // 6. Simulation d'un paiement réussi en production
  await t.test('6. Interdit strictement le mode simulateur et toute référence SIM_LLP_* en production', async () => {
    const prodEval = evaluatePayoutProviderConfig({
      NODE_ENV: 'production',
      PAYOUT_PROVIDER_MODE: 'simulator',
    } as NodeJS.ProcessEnv);
    assert.equal(prodEval.ready, false);
    assert.equal(prodEval.simulatorForbiddenInProduction, true);

    const prodAdapter = resolvePayoutProviderAdapter({
      NODE_ENV: 'production',
      PAYOUT_PROVIDER_MODE: 'simulator',
    } as NodeJS.ProcessEnv);
    const adapterRes = await prodAdapter({ uid: 'courier_sec_1', amount: 2000, idempotencyKey: 'sim_prod_ref_1' });
    assert.equal(adapterRes.outcome, 'failed');
    assert.equal(adapterRes.isSimulatedProvider, false);

    // Vérifie qu'en NODE_ENV=production un retrait avec le provider par défaut (non mocké) échoue et restitue le solde
    const prevNodeEnv = process.env.NODE_ENV;
    const prevMode = process.env.PAYOUT_PROVIDER_MODE;
    try {
      process.env.NODE_ENV = 'production';
      process.env.PAYOUT_PROVIDER_MODE = 'simulator';

      const prodSecurity = createP0SecurityService(db as any, {
        getSecretSalt: () => 'test-hmac-secret-32-chars-minimum-2026',
      });
      const vRes = await prodSecurity.verifyWalletPayoutIdempotency({
        callerUid: 'courier_sec_1',
        idempotencyKey: 'prod_sim_blocked_key_1',
        amount: 2000,
      });
      assert.equal(vRes.ok, true);

      const cRes = await prodSecurity.commitWalletPayout({
        callerUid: 'courier_sec_1',
        idempotencyKey: 'prod_sim_blocked_key_1',
        amount: 2000,
      });
      assert.equal(cRes.ok, false);
      if (!cRes.ok) {
        assert.equal(cRes.status, 502);
        assert.equal(cRes.compensated, true);
      }
      assert.equal(db.docs.get('users/courier_sec_1')?.walletBalanceFCFA, 25000);

      // Rejet webhook en mode simulator sous NODE_ENV=production
      const whProd = await handleMobileMoneyWebhook(db as any, {
        rawBody: JSON.stringify({ event: 'transaction.approved' }),
        headers: {},
        env: { NODE_ENV: 'production', PAYOUT_PROVIDER_MODE: 'simulator', MOBILE_MONEY_WEBHOOK_SECRET: WEBHOOK_SECRET } as any,
      });
      assert.equal(whProd.ok, false);
      assert.equal(whProd.code, 'SIMULATOR_FORBIDDEN_IN_PRODUCTION');
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      process.env.PAYOUT_PROVIDER_MODE = prevMode;
    }

    // Référence SIM_LLP_* explicitement rejetée même sur un webhook signé
    const simWebhookBody = JSON.stringify({
      eventId: 'evt_sim_ref_1',
      event: 'transaction.approved',
      data: {
        orderDocId: 'ORDER_PAY_B',
        providerReference: 'SIM_LLP_FORGED_999',
        amountFCFA: 6500,
        currency: 'XOF',
        status: 'approved',
      },
    });
    const simRes = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FEDAPAY-SIGNATURE': signFedaPay(simWebhookBody, WEBHOOK_SECRET),
      },
      body: simWebhookBody,
    });
    assert.equal(simRes.status, 403);
    assert.equal((await simRes.json()).code, 'SIMULATED_REFERENCE_FORBIDDEN');

    // Déploiement sans mode simulateur par défaut
    const apphostingText = fs.readFileSync(path.resolve(process.cwd(), 'apphosting.yaml'), 'utf8');
    const renderText = fs.readFileSync(path.resolve(process.cwd(), 'render.yaml'), 'utf8');
    assert.equal(/value:\s*simulator/i.test(apphostingText), false);
    assert.equal(/value:\s*simulator/i.test(renderText), false);
  });

  // 7. Tentative de validation du paiement depuis le frontend
  await t.test('7. Bloque (HTTP 403) toute confirmation de paiement ou référence SIM_LLP_* envoyée par le client', async () => {
    const spoofCreate = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({
        clientName: 'Client Spoof',
        clientPhone: '+2290197888888',
        pickupCommune: 'Cotonou',
        dropoffCommune: 'Abomey-Calavi',
        itemValueCOD: 5000,
        paymentStatus: 'paid',
        paidAmountFCFA: 6500,
      }),
    });
    assert.equal(spoofCreate.status, 403);
    assert.equal((await spoofCreate.json()).code, 'CLIENT_PAYMENT_SPOOF_FORBIDDEN');

    const spoofPatch = await fetch(`${baseUrl}/api/deliveries/ORDER_PAY_B`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({
        paymentStatus: 'paid',
        paymentProviderRef: 'SIM_LLP_BROWSER',
      }),
    });
    assert.equal(spoofPatch.status, 403);
    assert.equal((await spoofPatch.json()).code, 'PRICE_OVERRIDE_FORBIDDEN');

    const spoofConfirmSim = await fetch(`${baseUrl}/api/payments/ORDER_PAY_B/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({
        paymentStatus: 'paid',
        providerReference: 'SIM_LLP_FAKE_CONFIRM',
      }),
    });
    assert.equal(spoofConfirmSim.status, 403);
    assert.equal((await spoofConfirmSim.json()).code, 'SIMULATED_PAYMENT_FORBIDDEN');

    // Sans PSP configuré côté serveur, toute confirmation client échoue en 403 CLIENT_PAYMENT_CONFIRMATION_FORBIDDEN
    const savedBase = process.env.MOBILE_MONEY_API_BASE_URL;
    delete process.env.MOBILE_MONEY_API_BASE_URL;
    try {
      const noPspConfirm = await fetch(`${baseUrl}/api/payments/ORDER_PAY_B/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
        body: JSON.stringify({
          paymentStatus: 'paid',
          providerReference: 'FEDA_TX_S2S_DIRECT',
        }),
      });
      assert.equal(noPspConfirm.status, 403);
      assert.equal((await noPspConfirm.json()).code, 'CLIENT_PAYMENT_CONFIRMATION_FORBIDDEN');
    } finally {
      process.env.MOBILE_MONEY_API_BASE_URL = savedBase;
    }

    assert.equal(db.docs.get('deliveries/ORDER_PAY_B')?.paymentStatus, 'unpaid');
  });

  // 8. Tentative de modification directe du statut Firestore (règles + frontend)
  await t.test('8. Vérifie la protection Firestore contre les écritures financières directes et l’absence de repli client', () => {
    const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    assert.match(rulesText, /match \/payments\/\{paymentId\}[\s\S]*?allow create, update, delete: if false;/);
    assert.match(rulesText, /match \/webhook_events\/\{eventId\}\s*\{\s*allow read, write: if false;\s*\}/);
    assert.match(rulesText, /match \/refunds\/\{refundId\}\s*\{\s*allow read, write: if false;\s*\}/);
    assert.match(rulesText, /match \/wallet_transactions\/\{txId\}[\s\S]*?allow create, update, delete: if false;/);
    assert.ok(rulesText.includes("!('walletBalanceFCFA' in affected)"));
    assert.ok(rulesText.includes("'paymentStatus'") && rulesText.includes("'refundedAmountFCFA'"));

    const appCtxText = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AppContext.tsx'), 'utf8');
    const adjustIdx = appCtxText.indexOf('const adjustCourierWallet');
    assert.notEqual(adjustIdx, -1);
    const adjustSlice = appCtxText.slice(adjustIdx, adjustIdx + 1400);
    assert.equal(adjustSlice.includes('/api/admin/wallet/adjust'), true);
    assert.equal(adjustSlice.includes('walletBalanceFCFA: data.balanceAfter'), true);
    assert.equal(adjustSlice.includes('currentBalance +'), false);
  });

  // 9. Tentative de remboursement sans paiement confirmé
  await t.test('9. Refuse tout remboursement sans commande payée confirmée ou sur bénéficiaire étranger', async () => {
    const missingOrder = await fetch(`${baseUrl}/api/admin/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
      body: JSON.stringify({
        targetUid: 'vendor_sec_1',
        amountFCFA: 1000,
        reason: 'Test sans commande',
        idempotencyKey: 'ref_no_order_1',
      }),
    });
    assert.equal(missingOrder.status, 400);
    assert.equal((await missingOrder.json()).code, 'ORDER_REQUIRED_FOR_REFUND');

    const unpaidOrder = await fetch(`${baseUrl}/api/admin/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
      body: JSON.stringify({
        orderId: 'ORDER_UNPAID',
        targetUid: 'vendor_sec_1',
        amountFCFA: 1000,
        reason: 'Test commande non payée',
        idempotencyKey: 'ref_unpaid_1',
      }),
    });
    assert.equal(unpaidOrder.status, 409);
    assert.equal((await unpaidOrder.json()).code, 'PAYMENT_NOT_CONFIRMED');

    const outsiderRefund = await fetch(`${baseUrl}/api/admin/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
      body: JSON.stringify({
        orderId: 'ORDER_PAY_A',
        targetUid: 'outsider_sec',
        amountFCFA: 1000,
        reason: 'Test bénéficiaire externe',
        idempotencyKey: 'ref_outsider_1',
      }),
    });
    assert.equal(outsiderRefund.status, 403);
    assert.equal((await outsiderRefund.json()).code, 'REFUND_TARGET_MISMATCH');
  });

  // 10. Double remboursement & sur-remboursement
  await t.test('10. Empêche tout double remboursement (séquentiel, concurrent et clés distinctes) et sur-remboursement', async () => {
    const balBefore = Number(db.docs.get('users/vendor_sec_1')?.walletBalanceFCFA ?? 0);

    // Sur-remboursement (> 6500 FCFA payés sur ORDER_PAY_A)
    const overRes = await fetch(`${baseUrl}/api/admin/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
      body: JSON.stringify({
        orderId: 'ORDER_PAY_A',
        targetUid: 'vendor_sec_1',
        amountFCFA: 7000,
        reason: 'Sur-remboursement frauduleux',
        idempotencyKey: 'ref_over_1',
      }),
    });
    assert.equal(overRes.status, 400);
    assert.equal((await overRes.json()).code, 'REFUND_EXCEEDS_PAID_AMOUNT');

    // Deux remboursements concurrents avec deux idempotencyKeys distinctes sur ORDER_PAY_A (6500 FCFA)
    const [r1, r2] = await Promise.all([
      fetch(`${baseUrl}/api/admin/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
        body: JSON.stringify({
          orderId: 'ORDER_PAY_A',
          targetUid: 'vendor_sec_1',
          amountFCFA: 6500,
          reason: 'Remboursement légitime client',
          idempotencyKey: 'ref_race_key_1',
        }),
      }),
      fetch(`${baseUrl}/api/admin/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
        body: JSON.stringify({
          orderId: 'ORDER_PAY_A',
          targetUid: 'vendor_sec_1',
          amountFCFA: 6500,
          reason: 'Tentative double remboursement concurrent',
          idempotencyKey: 'ref_race_key_2',
        }),
      }),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [201, 409]);

    // Même clé répétée -> 200 duplicate: true sans crédit supplémentaire
    const dupSameKey = await fetch(`${baseUrl}/api/admin/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
      body: JSON.stringify({
        orderId: 'ORDER_PAY_A',
        targetUid: 'vendor_sec_1',
        amountFCFA: 6500,
        reason: 'Répétition idempotente',
        idempotencyKey: r1.status === 201 ? 'ref_race_key_1' : 'ref_race_key_2',
      }),
    });
    assert.equal(dupSameKey.status, 200);
    assert.equal((await dupSameKey.json()).duplicate, true);

    assert.equal(db.docs.get('users/vendor_sec_1')?.walletBalanceFCFA, balBefore + 6500);
    assert.equal(db.docs.get('deliveries/ORDER_PAY_A')?.refundStatus, 'refunded');
  });

  // 11. Double versement au livreur + compte suspendu + dédup adjust admin
  await t.test('11. Bloque les retraits livreurs concurrents, comptes suspendus et doubles ajustements admin', async () => {
    // Compte suspendu -> HTTP 403
    const suspRes = await fetch(`${baseUrl}/api/wallet/verify-idempotency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer susp-tok' },
      body: JSON.stringify({ idempotencyKey: 'susp_payout_1', amount: 2000 }),
    });
    assert.equal(suspRes.status, 403);

    // Concurrence verify-idempotency pour le même livreur
    const [vA, vB] = await Promise.all([
      fetch(`${baseUrl}/api/wallet/verify-idempotency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-tok' },
        body: JSON.stringify({ idempotencyKey: 'courier_race_key_A', amount: 5000 }),
      }),
      fetch(`${baseUrl}/api/wallet/verify-idempotency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-tok' },
        body: JSON.stringify({ idempotencyKey: 'courier_race_key_B', amount: 5000 }),
      }),
    ]);
    const vStatuses = [vA.status, vB.status].sort((a, b) => a - b);
    assert.deepEqual(vStatuses, [200, 429]);
    const winningKey = vA.status === 200 ? 'courier_race_key_A' : 'courier_race_key_B';

    // Commit via mock PSP HTTP poster sur createP0SecurityService
    const liveSecurity = createP0SecurityService(db as any, {
      getSecretSalt: () => 'test-hmac-secret-32-chars-minimum-2026',
      payoutProvider: async () => ({
        outcome: 'succeeded',
        providerReference: 'FEDA_OUT_PAYOUT_1',
        isSimulatedProvider: false,
      }),
    });
    const commit1 = await liveSecurity.commitWalletPayout({
      callerUid: 'courier_sec_1',
      idempotencyKey: winningKey,
      amount: 5000,
    });
    assert.equal(commit1.ok, true);
    assert.equal(db.docs.get('users/courier_sec_1')?.walletBalanceFCFA, 20000);

    // Rejeu commit -> 409
    const commitReplay = await liveSecurity.commitWalletPayout({
      callerUid: 'courier_sec_1',
      idempotencyKey: winningKey,
      amount: 5000,
    });
    assert.equal(commitReplay.ok, false);
    if (!commitReplay.ok) {
      assert.equal(commitReplay.status, 409);
      assert.equal(commitReplay.alreadyProcessed, true);
    }
    assert.equal(db.docs.get('users/courier_sec_1')?.walletBalanceFCFA, 20000);

    // Ajustement admin idempotent + trace admin_audit_logs
    const adj1 = await fetch(`${baseUrl}/api/admin/wallet/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
      body: JSON.stringify({
        targetUid: 'courier_sec_1',
        amount: 1000,
        type: 'credit',
        note: 'Bonus qualité',
        idempotencyKey: 'admin_adj_bonus_1',
      }),
    });
    assert.equal(adj1.status, 200);
    const adj2 = await fetch(`${baseUrl}/api/admin/wallet/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-tok' },
      body: JSON.stringify({
        targetUid: 'courier_sec_1',
        amount: 1000,
        type: 'credit',
        note: 'Bonus qualité',
        idempotencyKey: 'admin_adj_bonus_1',
      }),
    });
    assert.equal(adj2.status, 200);
    assert.equal((await adj2.json()).duplicate, true);
    assert.equal(db.docs.get('users/courier_sec_1')?.walletBalanceFCFA, 21000);

    const auditEntries = Array.from(db.docs.entries()).filter(
      ([k, v]) => k.startsWith('admin_audit_logs/') && v.action === 'WALLET_ADMIN_CREDIT'
    );
    assert.ok(auditEntries.length >= 1);
  });

  // 12. Transaction interrompue pendant son traitement (reprise & réconciliation webhook payout)
  await t.test('12. Récupère proprement une transaction interrompue et réconcilie un payout uncertain via webhook signé sans double débit', async () => {
    const { getPayoutIdempotencyDocId } = await import('../server/p0Security');
    const balStart = Number(db.docs.get('users/courier_sec_1')?.walletBalanceFCFA ?? 0); // 21000

    // Cas A : bail 'processing' expiré (solde déjà réservé à -3000 => 18000)
    const expKey = 'payout_interrupted_lease_1';
    const expDocId = getPayoutIdempotencyDocId('courier_sec_1', expKey);
    db.docs.set(`users/courier_sec_1`, {
      ...db.docs.get('users/courier_sec_1')!,
      walletBalanceFCFA: balStart - 3000,
    });
    db.docs.set(`payout_idempotency/${expDocId}`, {
      id: expDocId,
      uid: 'courier_sec_1',
      idempotencyKey: expKey,
      amount: 3000,
      reservedAmount: 3000,
      balanceBefore: balStart,
      balanceAfter: balStart - 3000,
      status: 'processing',
      processingExpiresAt: Date.now() - 10_000,
      processingAttemptCount: 1,
    });
    db.docs.set('payout_user_locks/courier_sec_1', {
      uid: 'courier_sec_1',
      activeDocKeyId: expDocId,
      status: 'processing',
    });

    const recoverySecurity = createP0SecurityService(db as any, {
      getSecretSalt: () => 'test-hmac-secret-32-chars-minimum-2026',
      payoutProvider: async () => ({
        outcome: 'succeeded',
        providerReference: 'FEDA_REC_LEASE_1',
        isSimulatedProvider: false,
      }),
    });
    const recRes = await recoverySecurity.commitWalletPayout({
      callerUid: 'courier_sec_1',
      idempotencyKey: expKey,
      amount: 3000,
    });
    assert.equal(recRes.ok, true);
    if (recRes.ok) {
      assert.equal(recRes.recoveredFromInterruption, true);
    }
    // Aucun second débit : reste à balStart - 3000
    assert.equal(db.docs.get('users/courier_sec_1')?.walletBalanceFCFA, balStart - 3000);

    // Cas B : payout en statut 'uncertain' réconcilié en échec par webhook signé PSP -> restitution unique
    const uncKey = 'payout_uncertain_wh_1';
    const uncDocId = getPayoutIdempotencyDocId('courier_sec_1', uncKey);
    const balBeforeUnc = Number(db.docs.get('users/courier_sec_1')?.walletBalanceFCFA ?? 0);
    db.docs.set('users/courier_sec_1', {
      ...db.docs.get('users/courier_sec_1')!,
      walletBalanceFCFA: balBeforeUnc - 2000,
    });
    db.docs.set(`payout_idempotency/${uncDocId}`, {
      id: uncDocId,
      uid: 'courier_sec_1',
      idempotencyKey: uncKey,
      amount: 2000,
      reservedAmount: 2000,
      balanceBefore: balBeforeUnc,
      balanceAfter: balBeforeUnc - 2000,
      status: 'uncertain',
    });
    db.docs.set(`wallet_transactions/wtx_${uncDocId}`, {
      id: `wtx_${uncDocId}`,
      uid: 'courier_sec_1',
      amountFCFA: 2000,
      status: 'uncertain',
    });
    db.docs.set('payout_user_locks/courier_sec_1', {
      uid: 'courier_sec_1',
      activeDocKeyId: uncDocId,
      status: 'uncertain',
    });

    const failWhPayload = JSON.stringify({
      eventId: 'evt_payout_fail_wh_1',
      event: 'payout.failed',
      data: {
        uid: 'courier_sec_1',
        payoutIdempotencyKey: uncKey,
        amountFCFA: 2000,
        currency: 'XOF',
        status: 'failed',
        reason: 'PSP timeout confirmé en échec',
      },
    });
    const whFail1 = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FEDAPAY-SIGNATURE': signFedaPay(failWhPayload, WEBHOOK_SECRET),
      },
      body: failWhPayload,
    });
    assert.equal(whFail1.status, 200);
    assert.equal((await whFail1.json()).payoutStatus, 'failed');
    assert.equal(db.docs.get('users/courier_sec_1')?.walletBalanceFCFA, balBeforeUnc);
    assert.equal(db.docs.get(`wallet_transactions/wtx_${uncDocId}`)?.status, 'reversed');

    // Rejeu webhook échec -> ne restitue pas une deuxième fois
    const whFail2 = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FEDAPAY-SIGNATURE': signFedaPay(failWhPayload, WEBHOOK_SECRET),
      },
      body: failWhPayload,
    });
    assert.equal(whFail2.status, 200);
    assert.equal((await whFail2.json()).duplicate, true);
    assert.equal(db.docs.get('users/courier_sec_1')?.walletBalanceFCFA, balBeforeUnc);
  });

  // 13. Paiement confirmé avec une devise incorrecte (USD / EUR)
  await t.test('13. Rejette (HTTP 422) tout paiement dans une devise autre que XOF (Wave / FedaPay)', async () => {
    const prevMode = process.env.PAYOUT_PROVIDER_MODE;
    process.env.PAYOUT_PROVIDER_MODE = 'wave';
    try {
      const waveUsdPayload = JSON.stringify({
        eventId: 'evt_wrong_currency_usd',
        type: 'checkout.session.completed',
        data: {
          orderDocId: 'ORDER_PAY_B',
          providerReference: 'WAVE_TX_USD_1',
          amount: 6500,
          currency: 'USD',
          status: 'succeeded',
        },
      });
      const resUsd = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Wave-Signature': signWave(waveUsdPayload, WEBHOOK_SECRET),
        },
        body: waveUsdPayload,
      });
      assert.equal(resUsd.status, 422);
      assert.equal((await resUsd.json()).code, 'INVALID_CURRENCY');
      assert.equal(db.docs.get('deliveries/ORDER_PAY_B')?.paymentStatus, 'unpaid');
    } finally {
      process.env.PAYOUT_PROVIDER_MODE = prevMode;
    }
  });

  // 14. Paiement confirmé pour une autre commande (cross-order replay)
  await t.test('14. Empêche (HTTP 409) de réutiliser une transaction déjà confirmée pour la commande A sur la commande B', async () => {
    // Tentative via webhook signé de réutiliser FEDA_TX_ORDER_A_ONLY sur ORDER_PAY_B (même montant 6500 FCFA)
    const crossOrderPayload = JSON.stringify({
      eventId: 'evt_cross_order_replay_1',
      event: 'transaction.approved',
      data: {
        orderDocId: 'ORDER_PAY_B',
        providerReference: 'FEDA_TX_ORDER_A_ONLY',
        amountFCFA: 6500,
        currency: 'XOF',
        status: 'approved',
      },
    });
    const res = await fetch(`${baseUrl}/api/webhooks/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FEDAPAY-SIGNATURE': signFedaPay(crossOrderPayload, WEBHOOK_SECRET),
      },
      body: crossOrderPayload,
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.code, 'S2S_ORDER_MISMATCH');
    assert.equal(db.docs.get('deliveries/ORDER_PAY_B')?.paymentStatus, 'unpaid');

    // Même sans appel S2S configuré, /payments bloque la réutilisation inter-commande (PAYMENT_CROSS_ORDER_REPLAY)
    const crossDirect = await handleMobileMoneyWebhook(db as any, {
      rawBody: crossOrderPayload,
      headers: { 'x-fedapay-signature': signFedaPay(crossOrderPayload, WEBHOOK_SECRET) },
      env: {
        NODE_ENV: 'test',
        PAYOUT_PROVIDER_MODE: 'fedapay',
        MOBILE_MONEY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      } as any,
    });
    assert.equal(crossDirect.ok, false);
    assert.equal(crossDirect.status, 409);
    assert.equal(crossDirect.code, 'PAYMENT_CROSS_ORDER_REPLAY');
    assert.equal(db.docs.get('deliveries/ORDER_PAY_B')?.paymentStatus, 'unpaid');

    // Vérification qu'une confirmation légitime S2S sur ORDER_PAY_B avec sa propre référence fonctionne
    const legitConfirm = await fetch(`${baseUrl}/api/payments/ORDER_PAY_B/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({ providerReference: 'FEDA_TX_S2S_DIRECT' }),
    });
    assert.equal(legitConfirm.status, 200);
    const legitBody = await legitConfirm.json();
    assert.equal(legitBody.paymentStatus, 'paid');
    assert.equal(db.docs.get('deliveries/ORDER_PAY_B')?.paymentStatus, 'paid');
  });
});
