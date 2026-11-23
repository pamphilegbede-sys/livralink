import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';

class ControlCenterMockFirestore {
  public docs = new Map<string, Record<string, any>>();
  private txChain: Promise<any> = Promise.resolve();

  private makeSnap(path: string, data: Record<string, any> | undefined) {
    const id = path.split('/').pop() || '';
    const cloned = data ? structuredClone(data) : undefined;
    return {
      exists: Boolean(cloned),
      id,
      data: () => (cloned ? structuredClone(cloned) : undefined),
    };
  }

  private makeDocRef(path: string): any {
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
          const merged = { ...structuredClone(prev) };
          for (const [k, v] of Object.entries(structuredClone(data))) {
            if (v && typeof v === 'object' && !Array.isArray(v) && merged[k] && typeof merged[k] === 'object' && !Array.isArray(merged[k])) {
              merged[k] = { ...merged[k], ...v };
            } else {
              merged[k] = v;
            }
          }
          self.docs.set(path, merged);
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

test('Admin Control Center E2E integration suite (Vendors, Couriers, Pricing, Comms, RBAC, Finance)', async (t) => {
  const serverMod = await import('../../server');
  const { baseUrl, close } = await startTestServer();
  const db = new ControlCenterMockFirestore();

  // Seed baseline users, orders, and RBAC sub-admin
  db.docs.set('users/vendor_1', {
    uid: 'vendor_1',
    role: 'vendeur',
    fullName: 'Awa Boutique',
    storeName: 'Awa Fashion',
    email: 'awa@vendor.bj',
    phone: '+2290197001111',
    storeCommune: 'Cotonou',
    storeAddress: 'Haie Vive',
    status: 'actif',
    accountStatus: 'actif',
    walletBalanceFCFA: 5000,
    isKycVerified: true,
    kycStatus: 'valide',
    createdAt: '2026-10-01T10:00:00.000Z',
  });

  db.docs.set('users/courier_1', {
    uid: 'courier_1',
    role: 'livreur',
    fullName: 'Koffi Mensah',
    email: 'koffi@courier.bj',
    phone: '+2290197002222',
    vehicleType: 'Moto 125cc',
    vehiclePlate: 'BJ-1234-AA',
    locationCommune: 'Cotonou',
    status: 'en_ligne',
    accountStatus: 'actif',
    isAvailable: true,
    isKycVerified: true,
    kycStatus: 'valide',
    walletBalanceFCFA: 2500,
    createdAt: '2026-10-02T10:00:00.000Z',
  });

  db.docs.set('users/client_1', {
    uid: 'client_1',
    role: 'client',
    fullName: 'Jean Client',
    email: 'client@livralink.bj',
    phone: '+2290197003333',
    locationCommune: 'Abomey-Calavi',
    createdAt: '2026-10-03T10:00:00.000Z',
  });

  db.docs.set('admins/support_admin_1', {
    uid: 'support_admin_1',
    email: 'support-agent@livralink.bj',
    fullName: 'Agent Support',
    roleId: 'responsable_support',
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
  });

  db.docs.set('deliveries/order_old_1', {
    id: '#LL-1001',
    merchantId: 'vendor_1',
    merchantStoreName: 'Awa Fashion',
    courierId: 'courier_1',
    courierName: 'Koffi Mensah',
    clientName: 'Jean Client',
    clientPhone: '+2290197003333',
    status: 'en_attente',
    distanceKm: 5,
    itemValueCOD: 10000,
    deliveryFee: 500,
    totalCustomerPayable: 10500,
    createdAt: '2026-10-05T10:00:00.000Z',
  });

  db.docs.set('deliveries/order_lock_2', {
    id: '#LL-1002',
    merchantId: 'vendor_1',
    merchantStoreName: 'Awa Fashion',
    courierId: 'courier_1',
    courierName: 'Koffi Mensah',
    clientName: 'Jean Client',
    clientPhone: '+2290197003333',
    status: 'en_attente',
    distanceKm: 5,
    itemValueCOD: 4000,
    deliveryFee: 500,
    totalCustomerPayable: 4500,
    createdAt: '2026-10-06T10:00:00.000Z',
  });

  serverMod.setFirestoreAdminForTests(db as any);
  serverMod.setTokenVerifierForTests(async (token: string) => {
    if (token === 'super-tok') {
      return { uid: 'super_1', email: 'Pamphile.gbede@gmail.com', email_verified: true, admin: true };
    }
    if (token === 'support-tok') {
      return { uid: 'support_admin_1', email: 'support-agent@livralink.bj', email_verified: true };
    }
    if (token === 'vendor-tok') {
      return { uid: 'vendor_1', email: 'awa@vendor.bj', email_verified: true };
    }
    if (token === 'courier-tok') {
      return { uid: 'courier_1', email: 'koffi@courier.bj', email_verified: true };
    }
    if (token === 'client-tok') {
      return { uid: 'client_1', email: 'client@livralink.bj', email_verified: true };
    }
    throw new Error('Invalid token');
  });

  t.after(async () => {
    serverMod.setFirestoreAdminForTests(null);
    serverMod.setTokenVerifierForTests(null);
    await close();
  });

  await t.test('A. Gestion des vendeurs : détails, modification, suspension/réactivation, audit log', async () => {
    const detailsRes = await fetch(`${baseUrl}/api/admin/merchants/vendor_1/details`, {
      headers: { Authorization: 'Bearer super-tok' },
    });
    assert.equal(detailsRes.status, 200);
    const detailsBody = await detailsRes.json();
    assert.equal(detailsBody.success, true);
    assert.equal(detailsBody.vendor.storeName, 'Awa Fashion');

    const patchRes = await fetch(`${baseUrl}/api/admin/merchants/vendor_1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify({
        storeName: 'Awa Fashion Premium',
        phone: '+2290197009999',
        accountStatus: 'suspendu',
        reason: 'Vérification facture en attente',
        commercialConfig: { customCommissionRatePercent: 5, fixedOrderFeeFCFA: 50 },
      }),
    });
    assert.equal(patchRes.status, 200);
    const updatedVendor = db.docs.get('users/vendor_1')!;
    assert.equal(updatedVendor.storeName, 'Awa Fashion Premium');
    assert.equal(updatedVendor.accountStatus, 'suspendu');
    assert.equal(updatedVendor.commercialConfig.customCommissionRatePercent, 5);

    const reactivateRes = await fetch(`${baseUrl}/api/admin/merchants/vendor_1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify({ accountStatus: 'actif', reason: 'Dossier régularisé' }),
    });
    assert.equal(reactivateRes.status, 200);
    assert.equal(db.docs.get('users/vendor_1')!.accountStatus, 'actif');
  });

  await t.test('B. Gestion des livreurs : profil, suspension, rémunération individuelle & validation malus', async () => {
    const detailsRes = await fetch(`${baseUrl}/api/admin/couriers/courier_1/details`, {
      headers: { Authorization: 'Bearer super-tok' },
    });
    assert.equal(detailsRes.status, 200);

    // Malus > 0 without reason must fail with 400
    const badMalusRes = await fetch(`${baseUrl}/api/admin/couriers/courier_1/remuneration`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify({
        useGeneralTariff: false,
        customPricePerKmFCFA: 120,
        malusFCFA: 150,
        malusReason: '',
      }),
    });
    assert.equal(badMalusRes.status, 400);

    // Valid individual tariff configuration
    const okRemunRes = await fetch(`${baseUrl}/api/admin/couriers/courier_1/remuneration`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify({
        useGeneralTariff: false,
        customPricePerKmFCFA: 100,
        customFixedBonusFCFA: 100,
        bonusFCFA: 0,
        malusFCFA: 0,
        specialConditions: 'Zone Cotonou centre',
      }),
    });
    assert.equal(okRemunRes.status, 200);
    const savedCourier = db.docs.get('users/courier_1')!;
    assert.equal(savedCourier.remunerationConfig.useGeneralTariff, false);
    assert.equal(savedCourier.remunerationConfig.customPricePerKmFCFA, 100);
    assert.equal(savedCourier.remunerationConfig.customFixedBonusFCFA, 100);

    // Suspend and reactivate courier
    const suspendRes = await fetch(`${baseUrl}/api/admin/couriers/courier_1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify({ accountStatus: 'suspendu', reason: 'Contrôle véhicule' }),
    });
    assert.equal(suspendRes.status, 200);
    assert.equal(db.docs.get('users/courier_1')!.accountStatus, 'suspendu');

    const reactivateRes = await fetch(`${baseUrl}/api/admin/couriers/courier_1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify({ accountStatus: 'actif', reason: 'Contrôle OK' }),
    });
    assert.equal(reactivateRes.status, 200);
    assert.equal(db.docs.get('users/courier_1')!.accountStatus, 'actif');
  });

  await t.test('C. Tarification dynamique : exemple 5km*150 + 200 = 950 FCFA, rémunération 600 FCFA, et immuabilité historique', async () => {
    const configRes = await fetch(`${baseUrl}/api/platform/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify({
        pricing: {
          pricePerKmFCFA: 150,
          fixedPickupFeeFCFA: 200,
          minDeliveryFeeFCFA: 500,
          maxDeliveryFeeFCFA: 50000,
          roundingStepFCFA: 50,
          distanceTiers: [{ id: 't1', label: 'All', minKm: 0, maxKm: null, ratePerKmFCFA: 150, fixedFeeFCFA: 0 }],
        },
        courierRemuneration: {
          mode: 'per_km_plus_base',
          perKmFCFA: 100,
          baseFixedFCFA: 100,
          minEarningFCFA: 100,
        },
      }),
    });
    assert.equal(configRes.status, 200);

    // Calculate quote for 5 km
    const quoteRes = await fetch(`${baseUrl}/api/deliveries/calculate-quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({ distanceKm: 5, deliveryType: 'standard', vehicleCategory: 'moto', courierId: 'courier_1' }),
    });
    assert.equal(quoteRes.status, 200);
    const quoteBody = await quoteRes.json();
    assert.equal(quoteBody.deliveryFee, 950);
    assert.equal(quoteBody.remunerationSnapshot.netCourierEarningFCFA, 600);

    // Lock snapshot on order_lock_2
    const lockRes = await fetch(`${baseUrl}/api/deliveries/order_lock_2/finalize-pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({ distanceKm: 5, deliveryType: 'standard', vehicleCategory: 'moto' }),
    });
    assert.equal(lockRes.status, 200);
    const lockBody = await lockRes.json();
    assert.equal(lockBody.deliveryFee, 950);

    // Admin subsequently doubles pricePerKmFCFA to 300 FCFA
    const configUpdateRes = await fetch(`${baseUrl}/api/platform/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify({
        pricing: {
          pricePerKmFCFA: 300,
          distanceTiers: [{ id: 't1', label: 'All', minKm: 0, maxKm: null, ratePerKmFCFA: 300, fixedFeeFCFA: 0 }],
        },
      }),
    });
    assert.equal(configUpdateRes.status, 200);

    // Existing locked order must preserve 950 FCFA retroactively
    const relockRes = await fetch(`${baseUrl}/api/deliveries/order_lock_2/finalize-pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({ distanceKm: 5, deliveryType: 'standard', vehicleCategory: 'moto' }),
    });
    assert.equal(relockRes.status, 200);
    const relockBody = await relockRes.json();
    assert.equal(relockBody.alreadyLocked, true);
    assert.equal(relockBody.deliveryFee, 950);
    assert.equal(db.docs.get('deliveries/order_lock_2')!.deliveryFee, 950);
  });

  await t.test('D. Communications : adresses e-mail, 14 templates sanitizés, aucun secret SMTP exposé', async () => {
    const publicRes = await fetch(`${baseUrl}/api/public/config`);
    assert.equal(publicRes.status, 200);
    const publicBody = await publicRes.json();
    assert.equal((publicBody as any).pass, undefined);
    assert.equal((publicBody as any).smtp, undefined);

    const templatesRes = await fetch(`${baseUrl}/api/admin/email-templates`, {
      headers: { Authorization: 'Bearer super-tok' },
    });
    assert.equal(templatesRes.status, 200);
    const templatesBody = await templatesRes.json();
    assert.equal(templatesBody.templates.length, 14);

    const updateTplRes = await fetch(`${baseUrl}/api/admin/email-templates/signup_welcome`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify({
        enabled: true,
        subject: 'Bienvenue {{fullName}} sur {{appName}}',
        title: 'Compte activé',
        bodyHtml: '<p>Bonjour {{fullName}}</p><script>alert(1)</script>',
        bodyText: 'Bonjour {{fullName}}',
      }),
    });
    assert.equal(updateTplRes.status, 200);
    const updateTplBody = await updateTplRes.json();
    assert.ok(!updateTplBody.template.bodyHtml.includes('<script>'));
  });

  await t.test('E. Sécurité & RBAC : isolation stricte, rejet 401/403 et blocage auto-attribution admin', async () => {
    // 1. Unauthenticated requests rejected with 401
    for (const [method, path] of [
      ['GET', '/api/admin/rbac/admins'],
      ['POST', '/api/admin/refunds'],
      ['GET', '/api/admin/clients'],
      ['GET', '/api/admin/audit-logs'],
    ]) {
      const r = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(r.status, 401, `Expected 401 on ${method} ${path}`);
    }

    // 2. Client cannot access admin endpoints (403)
    const clientAdminRes = await fetch(`${baseUrl}/api/admin/clients`, {
      headers: { Authorization: 'Bearer client-tok' },
    });
    assert.equal(clientAdminRes.status, 403);

    // 3. Vendor cannot edit courier (403)
    const vendorEditCourier = await fetch(`${baseUrl}/api/admin/couriers/courier_1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({ fullName: 'Piraté' }),
    });
    assert.equal(vendorEditCourier.status, 403);

    // 4. Courier cannot edit own remuneration (403)
    const courierSelfRemun = await fetch(`${baseUrl}/api/admin/couriers/courier_1/remuneration`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-tok' },
      body: JSON.stringify({ useGeneralTariff: false, customPricePerKmFCFA: 9999 }),
    });
    assert.equal(courierSelfRemun.status, 403);

    // 5. Sub-admin without financial/pricing/admins permissions gets 403 on those, 200 on disputes
    const supportPricing = await fetch(`${baseUrl}/api/platform/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer support-tok' },
      body: JSON.stringify({ pricing: { pricePerKmFCFA: 50 } }),
    });
    assert.equal(supportPricing.status, 403);

    const supportRefund = await fetch(`${baseUrl}/api/admin/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer support-tok' },
      body: JSON.stringify({ targetUid: 'vendor_1', amountFCFA: 1000, reason: 'Test' }),
    });
    assert.equal(supportRefund.status, 403);

    const supportDisputes = await fetch(`${baseUrl}/api/admin/disputes`, {
      headers: { Authorization: 'Bearer support-tok' },
    });
    assert.equal(supportDisputes.status, 200);

    // 6. Regular user cannot self-assign admin role via sync-profile
    const selfAdminSync = await fetch(`${baseUrl}/api/users/sync-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer client-tok' },
      body: JSON.stringify({ role: 'admin', fullName: 'Escalation Attempt' }),
    });
    assert.equal(selfAdminSync.status, 200);
    const syncedClient = db.docs.get('users/client_1')!;
    assert.notEqual(syncedClient.role, 'admin');
  });

  await t.test('F. Finance, remboursements idempotents, commandes/litiges & journal d’audit', async () => {
    const beforeBal = db.docs.get('users/vendor_1')!.walletBalanceFCFA;
    const refundPayload = {
      targetUid: 'vendor_1',
      orderId: '#LL-1001',
      amountFCFA: 1500,
      reason: 'Compensation retard avéré',
      idempotencyKey: 'ref_idem_test_001',
    };

    const ref1 = await fetch(`${baseUrl}/api/admin/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify(refundPayload),
    });
    assert.equal(ref1.status, 201);
    const ref1Body = await ref1.json();
    assert.equal(ref1Body.duplicate, false);
    assert.equal(db.docs.get('users/vendor_1')!.walletBalanceFCFA, beforeBal + 1500);

    // Duplicate retry with identical idempotencyKey must NOT double credit
    const ref2 = await fetch(`${baseUrl}/api/admin/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify(refundPayload),
    });
    assert.equal(ref2.status, 200);
    const ref2Body = await ref2.json();
    assert.equal(ref2Body.duplicate, true);
    assert.equal(db.docs.get('users/vendor_1')!.walletBalanceFCFA, beforeBal + 1500);

    // Cancel order with mandatory reason
    const cancelRes = await fetch(`${baseUrl}/api/admin/deliveries/order_old_1/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer super-tok' },
      body: JSON.stringify({ reason: 'Demande explicite du vendeur' }),
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(db.docs.get('deliveries/order_old_1')!.status, 'echec');

    // Audit logs recorded and queryable
    const auditRes = await fetch(`${baseUrl}/api/admin/audit-logs`, {
      headers: { Authorization: 'Bearer super-tok' },
    });
    assert.equal(auditRes.status, 200);
    const auditBody = await auditRes.json();
    assert.ok(Array.isArray(auditBody.logs) && auditBody.logs.length >= 4);
  });
});
