import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { resolveAuthoritativeRouteDistance, ServerRouteValidationError } from '../server/pricingEngine';

process.env.NODE_ENV = 'test';

class PricingTestMockFirestore {
  public docs = new Map<string, Record<string, any>>();

  private makeSnap(docPath: string, data: Record<string, any> | undefined) {
    const id = docPath.split('/').pop() || '';
    const cloned = data ? structuredClone(data) : undefined;
    return {
      exists: Boolean(cloned),
      id,
      data: () => (cloned ? structuredClone(cloned) : undefined),
    };
  }

  private makeDocRef(docPath: string): any {
    const self = this;
    const id = docPath.split('/').pop() || '';
    return {
      id,
      path: docPath,
      collection(subName: string) {
        return self.makeCollectionRef(`${docPath}/${subName}`);
      },
      async get() {
        return self.makeSnap(docPath, self.docs.get(docPath));
      },
      async set(data: Record<string, any>, options?: { merge?: boolean }) {
        const prev = self.docs.get(docPath);
        if (options?.merge && prev) {
          self.docs.set(docPath, { ...structuredClone(prev), ...structuredClone(data) });
        } else {
          self.docs.set(docPath, structuredClone(data));
        }
      },
      async update(data: Record<string, any>) {
        const prev = self.docs.get(docPath);
        if (!prev) throw new Error(`Missing doc: ${docPath}`);
        self.docs.set(docPath, { ...structuredClone(prev), ...structuredClone(data) });
      },
      async delete() {
        self.docs.delete(docPath);
      },
    };
  }

  private makeCollectionRef(basePath: string): any {
    const self = this;
    const buildQuery = (filters: Array<{ field: string; op: string; value: any }> = []): any => ({
      where(field: string, op: string, value: any) {
        return buildQuery([...filters, { field, op, value }]);
      },
      orderBy() {
        return buildQuery(filters);
      },
      limit() {
        return buildQuery(filters);
      },
      async get() {
        const prefix = `${basePath}/`;
        const matched: any[] = [];
        for (const [docPath, data] of self.docs.entries()) {
          if (!docPath.startsWith(prefix)) continue;
          const rest = docPath.slice(prefix.length);
          if (rest.includes('/')) continue;
          const ok = filters.every(({ field, op, value }) => (op === '==' ? data[field] === value : false));
          if (ok) matched.push(self.makeSnap(docPath, data));
        }
        return {
          empty: matched.length === 0,
          size: matched.length,
          docs: matched,
          forEach(cb: (d: any) => void) {
            matched.forEach(cb);
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
      limit() {
        return buildQuery([]);
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

  private txChain: Promise<any> = Promise.resolve();

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

test('Server Pricing Authority & Client Price Manipulation Lock (Problem #4)', async (t) => {
  await t.test('resolveAuthoritativeRouteDistance computes real distance and rejects spoofed/out-of-bounds coords', () => {
    const valid = resolveAuthoritativeRouteDistance({
      pickupLocation: { name: 'Boutique Haie Vive', commune: 'Cotonou - Haie Vive', address: 'Rue 12' },
      dropoffLocation: { name: 'Client Calavi', commune: 'Abomey-Calavi', address: 'Carrefour Tankpè' },
    });
    assert.ok(valid.distanceKm > 5, `Expected realistic distance > 5 km, got ${valid.distanceKm}`);
    assert.equal(valid.pickupLocation.coordinates.length, 2);
    assert.equal(valid.dropoffLocation.coordinates.length, 2);

    assert.throws(
      () =>
        resolveAuthoritativeRouteDistance({
          pickupLocation: { commune: 'Cotonou - Haie Vive', coordinates: [48.8566, 2.3522] },
          dropoffLocation: { commune: 'Abomey-Calavi' },
        }),
      (err: any) => err instanceof ServerRouteValidationError && err.code === 'COORDINATES_OUT_OF_BOUNDS'
    );

    assert.throws(
      () =>
        resolveAuthoritativeRouteDistance({
          pickupLocation: { commune: 'Parakou', coordinates: [6.3571, 2.4175] },
          dropoffLocation: { commune: 'Cotonou - Haie Vive' },
        }),
      (err: any) => err instanceof ServerRouteValidationError && err.code === 'COORDINATES_COMMUNE_MISMATCH'
    );
  });

  const serverMod = await import('../../server');
  const { baseUrl, close } = await startTestServer();
  const db = new PricingTestMockFirestore();

  db.docs.set('users/vendor_1', {
    uid: 'vendor_1',
    role: 'vendeur',
    fullName: 'Boutique A',
    storeName: 'Boutique A',
    email: 'vendora@livralink.bj',
    phone: '+22997001111',
    accountStatus: 'actif',
  });
  db.docs.set('users/vendor_2', {
    uid: 'vendor_2',
    role: 'vendeur',
    fullName: 'Boutique B',
    storeName: 'Boutique B',
    email: 'vendorb@livralink.bj',
    phone: '+22997002222',
    accountStatus: 'actif',
  });
  db.docs.set('users/courier_1', {
    uid: 'courier_1',
    role: 'livreur',
    fullName: 'Livreur Vérifié',
    email: 'courier@livralink.bj',
    phone: '+22997003333',
    isKycVerified: true,
    kycStatus: 'valide',
    accountStatus: 'actif',
  });

  serverMod.setFirestoreAdminForTests(db as any);
  serverMod.setTokenVerifierForTests(async (token: string) => {
    if (token === 'vendor-1') return { uid: 'vendor_1', email: 'vendora@livralink.bj', email_verified: true };
    if (token === 'vendor-2') return { uid: 'vendor_2', email: 'vendorb@livralink.bj', email_verified: true };
    if (token === 'courier-1') return { uid: 'courier_1', email: 'courier@livralink.bj', email_verified: true };
    if (token === 'admin-1') return { uid: 'admin_1', email: 'Pamphile.gbede@gmail.com', email_verified: true, admin: true };
    throw new Error('Unauthorized');
  });

  t.after(async () => {
    serverMod.setFirestoreAdminForTests(null);
    serverMod.setTokenVerifierForTests(null);
    await close();
  });

  let createdOrderId = '';
  let initialFee = 0;

  await t.test('POST /api/deliveries ignores client-tampered fee, promoDiscountFCFA, distanceKm, and totalCustomerPayable', async () => {
    const res = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-1' },
      body: JSON.stringify({
        clientName: 'Client Honnête',
        clientPhone: '+22997112233',
        itemDescription: 'Chaussures',
        itemValueCOD: 15000,
        itemWeightKg: 2,
        deliveryType: 'express',
        vehicleCategory: 'moto',
        pickupLocation: {
          name: 'Boutique A',
          commune: 'Cotonou - Haie Vive',
          address: 'Haie Vive',
        },
        dropoffLocation: {
          name: 'Domicile',
          commune: 'Abomey-Calavi',
          address: 'Tankpè',
        },
        // Attempted client tampering
        deliveryFee: 1,
        promoDiscountFCFA: 99999,
        totalCustomerPayable: 1,
        distanceKm: 0.1,
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.delivery.id);
    assert.match(body.otpCode, /^[0-9]{4}$/);
    assert.ok(body.delivery.distanceKm > 5, 'Server must override spoofed 0.1 km distance');
    assert.ok(body.delivery.deliveryFee >= 1000, `Server fee must not be client 1 FCFA (got ${body.delivery.deliveryFee})`);
    assert.equal(body.delivery.totalCustomerPayable, 15000 + body.delivery.deliveryFee);
    assert.equal(body.delivery.promoDiscountFCFA, 0);
    assert.equal(body.delivery.pricingSnapshot.source, 'server');

    createdOrderId = body.delivery.id;
    initialFee = body.delivery.deliveryFee;
    const cleanDocId = createdOrderId.replace(/[^a-zA-Z0-9_-]/g, '');
    const storedMission = db.docs.get(`priority_missions/${cleanDocId}`);
    assert.ok(storedMission, 'priority_missions must be atomically created by server');
    assert.equal(storedMission!.fee, initialFee);
    assert.equal(storedMission!.cod, 15000);

    const storedOtp = db.docs.get(`deliveries/${cleanDocId}/private/otp`);
    assert.equal(storedOtp?.otpCode, body.otpCode);
  });

  await t.test('POST /api/deliveries rejects invalid COD/weight, out-of-bounds coords, spoofed commune coords, and non-vendor callers', async () => {
    const spoofRes = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-1' },
      body: JSON.stringify({
        clientName: 'Client Test',
        clientPhone: '+22997112233',
        pickupLocation: { commune: 'Parakou', coordinates: [6.3571, 2.4175] },
        dropoffLocation: { commune: 'Cotonou - Haie Vive' },
      }),
    });
    assert.equal(spoofRes.status, 400);
    assert.equal((await spoofRes.json()).code, 'COORDINATES_COMMUNE_MISMATCH');

    const badCodRes = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-1' },
      body: JSON.stringify({
        clientName: 'Client Test',
        clientPhone: '+22997112233',
        itemValueCOD: -500,
        pickupLocation: { commune: 'Cotonou - Haie Vive' },
        dropoffLocation: { commune: 'Cotonou - Ganhi' },
      }),
    });
    assert.equal(badCodRes.status, 400);

    const badWeightRes = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-1' },
      body: JSON.stringify({
        clientName: 'Client Test',
        clientPhone: '+22997112233',
        itemWeightKg: 999,
        pickupLocation: { commune: 'Cotonou - Haie Vive' },
        dropoffLocation: { commune: 'Cotonou - Ganhi' },
      }),
    });
    assert.equal(badWeightRes.status, 400);

    const courierRes = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer courier-1' },
      body: JSON.stringify({
        clientName: 'Client Test',
        clientPhone: '+22997112233',
        pickupLocation: { commune: 'Cotonou - Haie Vive' },
        dropoffLocation: { commune: 'Cotonou - Ganhi' },
      }),
    });
    assert.equal(courierRes.status, 403);
    assert.equal((await courierRes.json()).code, 'VENDOR_ROLE_REQUIRED');
  });

  await t.test('PATCH /api/deliveries/:orderId blocks price tampering/IDOR and recalculates route/weight server-side', async () => {
    const cleanDocId = createdOrderId.replace(/[^a-zA-Z0-9_-]/g, '');

    const tamperPatch = await fetch(`${baseUrl}/api/deliveries/${cleanDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-1' },
      body: JSON.stringify({ deliveryFee: 50 }),
    });
    assert.equal(tamperPatch.status, 403);
    assert.equal((await tamperPatch.json()).code, 'PRICE_OVERRIDE_FORBIDDEN');

    const idorPatch = await fetch(`${baseUrl}/api/deliveries/${cleanDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-2' },
      body: JSON.stringify({ clientName: 'Piraté' }),
    });
    assert.equal(idorPatch.status, 403);

    const validPatch = await fetch(`${baseUrl}/api/deliveries/${cleanDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-1' },
      body: JSON.stringify({
        clientName: 'Client Modifié',
        itemValueCOD: 20000,
        itemWeightKg: 10,
        dropoffLocation: { name: 'Client', commune: 'Porto-Novo', address: 'Ouando' },
      }),
    });
    assert.equal(validPatch.status, 200);
    const updatedBody = await validPatch.json();
    assert.ok(updatedBody.delivery.distanceKm > 20, 'Distance must reflect Porto-Novo route');
    assert.ok(updatedBody.delivery.deliveryFee > initialFee, 'Fee must increase on heavier + longer route');
    assert.equal(updatedBody.delivery.totalCustomerPayable, 20000 + updatedBody.delivery.deliveryFee);

    const syncedMission = db.docs.get(`priority_missions/${cleanDocId}`);
    assert.equal(syncedMission?.fee, updatedBody.delivery.deliveryFee);
    assert.equal(syncedMission?.cod, 20000);

    // Non-admin cannot forge remunerationSnapshot or courierId via PATCH
    const extraTamperPatch = await fetch(`${baseUrl}/api/deliveries/${cleanDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-1' },
      body: JSON.stringify({ remunerationSnapshot: { netCourierEarningFCFA: 999999 } }),
    });
    assert.equal(extraTamperPatch.status, 403);
    assert.equal((await extraTamperPatch.json()).code, 'PRICE_OVERRIDE_FORBIDDEN');

    // Once assigned to a courier, vendor PATCH MUST fail with 409
    db.docs.set(`deliveries/${cleanDocId}`, {
      ...db.docs.get(`deliveries/${cleanDocId}`),
      status: 'assignee',
      courierId: 'courier_1',
    });
    const assignedPatch = await fetch(`${baseUrl}/api/deliveries/${cleanDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-1' },
      body: JSON.stringify({ itemValueCOD: 1000 }),
    });
    assert.equal(assignedPatch.status, 409);
  });

  await t.test('Inter-city coordinate spoofing (Cotonou coords declared as Porto-Novo) is rejected at <= 25 km threshold', async () => {
    const interCitySpoof = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-1' },
      body: JSON.stringify({
        clientName: 'Client Porto-Novo',
        clientPhone: '+22997112233',
        pickupLocation: { commune: 'Cotonou - Haie Vive', coordinates: [6.3571, 2.4175] },
        dropoffLocation: { commune: 'Porto-Novo', coordinates: [6.3571, 2.4175] },
      }),
    });
    assert.equal(interCitySpoof.status, 400);
    assert.equal((await interCitySpoof.json()).code, 'COORDINATES_COMMUNE_MISMATCH');
  });

  await t.test('POST /api/deliveries/finalize-pricing rejects client-supplied distanceKm on legacy doc without route', async () => {
    db.docs.set('deliveries/legacy_no_route', {
      id: '#LL-LEGACY',
      merchantId: 'vendor_1',
      status: 'en_attente',
      itemValueCOD: 5000,
    });
    const res = await fetch(`${baseUrl}/api/deliveries/legacy_no_route/finalize-pricing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-1' },
      body: JSON.stringify({ distanceKm: 1, deliveryType: 'standard' }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'MISSING_ROUTE_DATA');
  });

  await t.test('Admin delivery creation, manual override audit, notifications, and dispatch compatibility remain intact', async () => {
    const adminCreateRes = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-1' },
      body: JSON.stringify({
        merchantId: 'vendor_1',
        clientName: 'Client VIP Admin',
        clientPhone: '+22997009988',
        itemValueCOD: 10000,
        pickupLocation: { name: 'Boutique A', commune: 'Cotonou - Haie Vive' },
        dropoffLocation: { name: 'Domicile', commune: 'Cotonou - Akpakpa' },
        manualDeliveryFeeOverride: 2200,
      }),
    });
    assert.equal(adminCreateRes.status, 201);
    const adminBody = await adminCreateRes.json();
    assert.equal(adminBody.delivery.deliveryFee, 2200);
    assert.equal(adminBody.delivery.totalCustomerPayable, 12200);
    assert.equal(adminBody.delivery.pricingSnapshot.adminManualOverride, true);

    const adminCleanId = adminBody.delivery.id.replace(/[^a-zA-Z0-9_-]/g, '');
    const auditLogs = Array.from(db.docs.entries())
      .filter(([k]) => k.startsWith('admin_audit_logs/'))
      .map(([, v]) => v);
    assert.ok(auditLogs.some((l) => l.action === 'ADMIN_ORDER_MANUAL_FEE' && l.targetId === adminCleanId));

    const notifs = Array.from(db.docs.entries())
      .filter(([k]) => k.startsWith('notifications/'))
      .map(([, v]) => v);
    assert.ok(notifs.some((n) => n.recipientId === 'vendor_1' && n.orderDocId === adminCleanId));

    const dispatchStartRes = await fetch(`${baseUrl}/api/deliveries/${adminCleanId}/dispatch/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-1' },
      body: JSON.stringify({}),
    });
    assert.equal(dispatchStartRes.status, 200);
    assert.equal((await dispatchStartRes.json()).success, true);
  });

  await t.test('POST /api/deliveries/calculate-quote overrides spoofed distanceKm when locations are given', async () => {
    const quoteRes = await fetch(`${baseUrl}/api/deliveries/calculate-quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-1' },
      body: JSON.stringify({
        distanceKm: 0.05,
        pickupLocation: { commune: 'Cotonou - Haie Vive' },
        dropoffLocation: { commune: 'Porto-Novo' },
        itemWeightKg: 2,
      }),
    });
    assert.equal(quoteRes.status, 200);
    const quoteBody = await quoteRes.json();
    assert.ok(quoteBody.distanceKm > 20);
    assert.ok(quoteBody.pricingSnapshot.distanceKm > 20);
    assert.equal(quoteBody.pricingSnapshot.source, 'server');
    assert.ok(quoteBody.deliveryFee >= 1000);
  });

  await t.test('firestore.rules forbids client-side delivery/mission creation and financial field edits', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const delivBlock = rules.slice(rules.indexOf('match /deliveries/{deliveryId}'), rules.indexOf('match /notifications/{notificationId}'));
    assert.match(delivBlock, /allow create:\s*if isAdmin\(\);/);

    const missionBlock = rules.slice(rules.indexOf('match /priority_missions/{missionId}'), rules.indexOf('match /test/{testId}'));
    assert.match(missionBlock, /allow create:\s*if isAdmin\(\);/);

    const vendorDelivUpdate = rules.slice(rules.indexOf('function canNonAdminUpdateDelivery'), rules.indexOf('function canVendorReadPrivateOtp'));
    for (const forbidden of ["'deliveryFee'", "'totalCustomerPayable'", "'itemValueCOD'", "'itemWeightKg'", "'pickupLocation'", "'dropoffLocation'"]) {
      assert.equal(vendorDelivUpdate.includes(forbidden), false, `Vendor direct Firestore update must exclude ${forbidden}`);
    }
  });
});
