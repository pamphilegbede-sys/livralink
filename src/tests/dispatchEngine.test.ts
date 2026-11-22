import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';

import {
  BENIN_DEFAULT_FALLBACK_COORDS,
  DEFAULT_GPS_MAX_AGE_MS,
  computeHaversineDistanceKm,
  evaluateCourierGpsFreshness,
  isCourierEligibleForDispatch,
  rankDispatchCandidates,
} from '../utils/dispatchEngine';

interface MockCollections {
  users: Map<string, Record<string, any>>;
  deliveries: Map<string, Record<string, any>>;
  priority_missions: Map<string, Record<string, any>>;
  notifications: Map<string, Record<string, any>>;
}

function createTransactionalMockDb(initial?: Partial<MockCollections>) {
  const collections: MockCollections = {
    users: new Map(initial?.users || []),
    deliveries: new Map(initial?.deliveries || []),
    priority_missions: new Map(initial?.priority_missions || []),
    notifications: new Map(initial?.notifications || []),
  };

  const getMap = (name: string): Map<string, Record<string, any>> => {
    if (name === 'users') return collections.users;
    if (name === 'deliveries') return collections.deliveries;
    if (name === 'priority_missions') return collections.priority_missions;
    if (name === 'notifications') return collections.notifications;
    return new Map();
  };

  let txChain = Promise.resolve();

  const makeDocRef = (colName: string, docId: string) => ({
    _colName: colName,
    _docId: docId,
    get: async () => {
      const m = getMap(colName);
      const data = m.get(docId);
      return {
        id: docId,
        exists: data !== undefined,
        data: () => (data ? structuredClone(data) : undefined),
      };
    },
    set: async (payload: Record<string, any>, opts?: { merge?: boolean }) => {
      const m = getMap(colName);
      if (opts?.merge && m.has(docId)) {
        m.set(docId, { ...m.get(docId), ...structuredClone(payload) });
      } else {
        m.set(docId, structuredClone(payload));
      }
    },
    update: async (patch: Record<string, any>) => {
      const m = getMap(colName);
      const prev = m.get(docId) || {};
      m.set(docId, { ...prev, ...structuredClone(patch) });
    },
  });

  const db = {
    collection: (name: string) => ({
      doc: (id: string) => makeDocRef(name, id),
      where: (field: string, _op: string, value: any) => ({
        get: async () => {
          const m = getMap(name);
          const docs = Array.from(m.entries())
            .filter(([, d]) => d[field] === value)
            .map(([id, d]) => ({
              id,
              data: () => structuredClone(d),
            }));
          return {
            docs,
            forEach: (cb: (snap: any) => void) => docs.forEach(cb),
          };
        },
      }),
      get: async () => {
        const m = getMap(name);
        const docs = Array.from(m.entries()).map(([id, d]) => ({
          id,
          data: () => structuredClone(d),
        }));
        return {
          docs,
          forEach: (cb: (snap: any) => void) => docs.forEach(cb),
        };
      },
    }),
    runTransaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      const run = txChain.then(async () => {
        const stagedWrites: Array<() => void> = [];
        const tx = {
          get: async (ref: ReturnType<typeof makeDocRef>) => ref.get(),
          set: (ref: ReturnType<typeof makeDocRef>, payload: Record<string, any>, opts?: { merge?: boolean }) => {
            stagedWrites.push(() => {
              const m = getMap(ref._colName);
              if (opts?.merge && m.has(ref._docId)) {
                m.set(ref._docId, { ...m.get(ref._docId), ...structuredClone(payload) });
              } else {
                m.set(ref._docId, structuredClone(payload));
              }
            });
          },
          update: (ref: ReturnType<typeof makeDocRef>, patch: Record<string, any>) => {
            stagedWrites.push(() => {
              const m = getMap(ref._colName);
              const prev = m.get(ref._docId) || {};
              m.set(ref._docId, { ...prev, ...structuredClone(patch) });
            });
          },
        };
        const result = await fn(tx);
        for (const apply of stagedWrites) {
          apply();
        }
        return result;
      });
      txChain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
  };

  return { db, collections };
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

// =========================================================================
// 1. UNIT TESTS ON DISPATCH ENGINE
// =========================================================================

test('dispatchEngine unit tests: Haversine distance, GPS freshness, synthetic default rejection & ranking', async () => {
  const nowMs = Date.now();
  const pickup = { lat: 6.3571, lng: 2.3885 }; // Haie Vive, Cotonou

  // Same point = 0 km
  assert.equal(computeHaversineDistanceKm(pickup, pickup), 0);

  // Near (~1.2 km) vs Far (~12 km)
  const nearDist = computeHaversineDistanceKm(pickup, { lat: 6.365, lng: 2.395 });
  const farDist = computeHaversineDistanceKm(pickup, { lat: 6.4472, lng: 2.3552 });
  assert.ok(nearDist > 0.5 && nearDist < 2.0);
  assert.ok(farDist > 8.0 && farDist < 15.0);

  // Reject synthetic benin_default
  const defaultGpsEval = evaluateCourierGpsFreshness(
    {
      id: 'c_def',
      locationLat: BENIN_DEFAULT_FALLBACK_COORDS.lat,
      locationLng: BENIN_DEFAULT_FALLBACK_COORDS.lng,
      locationSource: 'benin_default',
      locationUpdatedAt: new Date(nowMs).toISOString(),
    },
    nowMs
  );
  assert.equal(defaultGpsEval.valid, false);
  assert.equal(defaultGpsEval.reason, 'synthetic_default_gps');

  // Reject stale GPS (> 10 minutes)
  const staleGpsEval = evaluateCourierGpsFreshness(
    {
      id: 'c_stale',
      locationLat: 6.36,
      locationLng: 2.39,
      locationSource: 'browser_gps',
      locationUpdatedAt: new Date(nowMs - DEFAULT_GPS_MAX_AGE_MS - 60_000).toISOString(),
    },
    nowMs
  );
  assert.equal(staleGpsEval.valid, false);
  assert.equal(staleGpsEval.reason, 'stale_gps');

  // Reject (0,0) and missing timestamp
  const zeroGpsEval = evaluateCourierGpsFreshness(
    {
      id: 'c_zero',
      locationLat: 0,
      locationLng: 0,
      locationUpdatedAt: new Date(nowMs).toISOString(),
    },
    nowMs
  );
  assert.equal(zeroGpsEval.valid, false);
  assert.equal(zeroGpsEval.reason, 'missing_or_invalid_gps');

  // Eligibility checks
  assert.equal(
    isCourierEligibleForDispatch({ id: 'c1', role: 'livreur', isKycVerified: true, status: 'en_ligne', isAvailable: true }),
    true
  );
  assert.equal(
    isCourierEligibleForDispatch({ id: 'c2', role: 'livreur', isKycVerified: true, status: 'en_course', isAvailable: false }),
    false
  );
  assert.equal(
    isCourierEligibleForDispatch({ id: 'c3', role: 'livreur', isKycVerified: false, status: 'en_ligne', isAvailable: true }),
    false
  );

  // Ranking order: preferred first, then nearest GPS, excluding stale/default/offline
  const couriers = [
    {
      id: 'c_far_pref',
      fullName: 'Préféré Loin',
      role: 'livreur' as const,
      isKycVerified: true,
      kycStatus: 'valide' as const,
      status: 'en_ligne' as const,
      isAvailable: true,
      locationLat: 6.4472,
      locationLng: 2.3552,
      locationSource: 'browser_gps' as const,
      locationUpdatedAt: new Date(nowMs - 30_000).toISOString(),
    },
    {
      id: 'c_closest',
      fullName: 'Plus Proche',
      role: 'livreur' as const,
      isKycVerified: true,
      kycStatus: 'valide' as const,
      status: 'en_ligne' as const,
      isAvailable: true,
      locationLat: 6.359,
      locationLng: 2.39,
      locationSource: 'live_watch' as const,
      locationUpdatedAt: new Date(nowMs - 10_000).toISOString(),
    },
    {
      id: 'c_mid',
      fullName: 'Intermédiaire',
      role: 'livreur' as const,
      isKycVerified: true,
      kycStatus: 'valide' as const,
      status: 'en_ligne' as const,
      isAvailable: true,
      locationLat: 6.38,
      locationLng: 2.41,
      locationSource: 'browser_gps' as const,
      locationUpdatedAt: new Date(nowMs - 20_000).toISOString(),
    },
    {
      id: 'c_stale',
      fullName: 'GPS Expiré',
      role: 'livreur' as const,
      isKycVerified: true,
      kycStatus: 'valide' as const,
      status: 'en_ligne' as const,
      isAvailable: true,
      locationLat: 6.3572,
      locationLng: 2.3886,
      locationSource: 'browser_gps' as const,
      locationUpdatedAt: new Date(nowMs - 15 * 60_000).toISOString(),
    },
  ];

  const rankedWithPref = rankDispatchCandidates({
    pickupCoords: pickup,
    couriers,
    preferredCourierId: 'c_far_pref',
    nowMs,
  });

  assert.equal(rankedWithPref.preferredEligible, true);
  assert.deepEqual(
    rankedWithPref.candidates.map((c) => c.courierId),
    ['c_far_pref', 'c_closest', 'c_mid']
  );
  assert.equal(rankedWithPref.candidates[0].isPreferred, true);
  assert.equal(rankedWithPref.excludedStats.staleOrDefaultGps, 1);

  // Without preferred -> strictly nearest first
  const rankedNoPref = rankDispatchCandidates({
    pickupCoords: pickup,
    couriers,
    preferredCourierId: null,
    nowMs,
  });
  assert.deepEqual(
    rankedNoPref.candidates.map((c) => c.courierId),
    ['c_closest', 'c_mid', 'c_far_pref']
  );
});

// =========================================================================
// 2. END-TO-END HTTP + TRANSACTIONAL DISPATCH API TESTS (8 SCENARIOS)
// =========================================================================

test('Intelligent GPS proximity & sequential dispatch API integration tests', async (t) => {
  const { baseUrl, close } = await startTestServer();
  const serverMod = await import('../../server');

  t.after(async () => {
    serverMod.setFirestoreAdminForTests(null);
    serverMod.setTokenVerifierForTests(null);
    await close();
  });

  const setupTokens = () => {
    serverMod.setTokenVerifierForTests(async (tok) => {
      if (tok === 'vendor-tok') return { uid: 'vendor_1', email: 'vendeur@livralink.bj', email_verified: true };
      if (tok === 'c-closest-tok') return { uid: 'c_closest', email: 'c1@livralink.bj', email_verified: true };
      if (tok === 'c-second-tok') return { uid: 'c_second', email: 'c2@livralink.bj', email_verified: true };
      if (tok === 'c-pref-tok') return { uid: 'c_pref', email: 'cp@livralink.bj', email_verified: true };
      if (tok === 'c-stale-tok') return { uid: 'c_stale', email: 'cs@livralink.bj', email_verified: true };
      if (tok === 'admin-tok') return { uid: 'admin_1', email: 'Pamphile.gbede@gmail.com', email_verified: true, admin: true };
      throw new Error('Invalid token');
    });
  };

  // Scenario 1 + 2: Closest courier targeted & notified ONLY; refusal advances to 2nd closest
  await t.test('Scenario 1 & 2: Only closest courier receives offer; refusal immediately falls back to 2nd closest', async () => {
    const nowMs = Date.now();
    const { db, collections } = createTransactionalMockDb({
      users: new Map([
        ['vendor_1', { uid: 'vendor_1', role: 'vendeur', fullName: 'Boutique A' }],
        [
          'c_closest',
          {
            uid: 'c_closest',
            role: 'livreur',
            fullName: 'Koffi Proche',
            isKycVerified: true,
            kycStatus: 'valide',
            status: 'en_ligne',
            isAvailable: true,
            locationLat: 6.358, // ~0.1km from Haie Vive
            locationLng: 2.389,
            locationSource: 'browser_gps',
            locationUpdatedAt: new Date(nowMs - 15_000).toISOString(),
          },
        ],
        [
          'c_second',
          {
            uid: 'c_second',
            role: 'livreur',
            fullName: 'Sègbé Deuxième',
            isKycVerified: true,
            kycStatus: 'valide',
            status: 'en_ligne',
            isAvailable: true,
            locationLat: 6.38, // ~3.5km away
            locationLng: 2.41,
            locationSource: 'browser_gps',
            locationUpdatedAt: new Date(nowMs - 20_000).toISOString(),
          },
        ],
      ]),
      deliveries: new Map([
        [
          'LL-DISP-1',
          {
            id: 'LL-DISP-1',
            merchantId: 'vendor_1',
            status: 'en_attente',
            deliveryFee: 2000,
            pickupLocation: { commune: 'Cotonou - Haie Vive', coordinates: [6.3571, 2.3885] },
            dropoffLocation: { commune: 'Cotonou - Fidjrossè', coordinates: [6.3568, 2.3694] },
          },
        ],
      ]),
      priority_missions: new Map([['LL-DISP-1', { id: 'LL-DISP-1', merchantId: 'vendor_1', status: 'en_attente' }]]),
    });

    setupTokens();
    serverMod.setFirestoreAdminForTests(db);

    const startRes = await fetch(`${baseUrl}/api/deliveries/LL-DISP-1/dispatch/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({ offerTimeoutSeconds: 30 }),
    });
    assert.equal(startRes.status, 200);
    const startBody = await startRes.json();
    assert.equal(startBody.dispatchState, 'offered');
    assert.equal(startBody.targetCourierId, 'c_closest');
    assert.equal(startBody.offerAttempt, 1);

    // Check notifications: ONLY c_closest received priority_mission, NOT c_second
    const notifsAfterStart = Array.from(collections.notifications.values());
    assert.equal(notifsAfterStart.filter((n) => n.recipientId === 'c_closest' && n.type === 'priority_mission').length, 1);
    assert.equal(notifsAfterStart.filter((n) => n.recipientId === 'c_second').length, 0);

    // Non-targeted courier cannot accept (403 NOT_TARGETED_COURIER)
    const wrongAccept = await fetch(`${baseUrl}/api/deliveries/LL-DISP-1/dispatch/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer c-second-tok' },
      body: JSON.stringify({ action: 'accept' }),
    });
    assert.equal(wrongAccept.status, 403);
    assert.equal((await wrongAccept.json()).code, 'NOT_TARGETED_COURIER');

    // Closest courier refuses -> advances immediately to c_second
    const refuseRes = await fetch(`${baseUrl}/api/deliveries/LL-DISP-1/dispatch/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer c-closest-tok' },
      body: JSON.stringify({ action: 'refuse', reason: 'Trop loin du prochain client' }),
    });
    assert.equal(refuseRes.status, 200);
    const refuseBody = await refuseRes.json();
    assert.equal(refuseBody.dispatchState, 'offered');
    assert.equal(refuseBody.targetCourierId, 'c_second');
    assert.equal(refuseBody.offerAttempt, 2);

    const updatedDelivery = collections.deliveries.get('LL-DISP-1')!;
    assert.deepEqual(updatedDelivery.rejectedCourierIds, ['c_closest']);
    assert.equal(updatedDelivery.targetCourierId, 'c_second');

    // Notification now dispatched ONLY to c_second
    const notifsAfterRefuse = Array.from(collections.notifications.values());
    assert.equal(notifsAfterRefuse.filter((n) => n.recipientId === 'c_second' && n.type === 'priority_mission').length, 1);
  });

  // Scenario 3: Timeout advances offer sequentially
  await t.test('Scenario 3: Offer timeout advances targetCourierId and records expiredCourierIds', async () => {
    const nowMs = Date.now();
    const { db, collections } = createTransactionalMockDb({
      users: new Map([
        [
          'c_closest',
          {
            uid: 'c_closest',
            role: 'livreur',
            fullName: 'Koffi Expiré',
            isKycVerified: true,
            status: 'en_ligne',
            isAvailable: true,
            locationLat: 6.358,
            locationLng: 2.389,
            locationSource: 'browser_gps',
            locationUpdatedAt: new Date(nowMs).toISOString(),
          },
        ],
        [
          'c_second',
          {
            uid: 'c_second',
            role: 'livreur',
            fullName: 'Sègbé Suivant',
            isKycVerified: true,
            status: 'en_ligne',
            isAvailable: true,
            locationLat: 6.39,
            locationLng: 2.41,
            locationSource: 'browser_gps',
            locationUpdatedAt: new Date(nowMs).toISOString(),
          },
        ],
      ]),
      deliveries: new Map([
        [
          'LL-DISP-TIMEOUT',
          {
            id: 'LL-DISP-TIMEOUT',
            merchantId: 'vendor_1',
            status: 'en_attente',
            dispatchState: 'offered',
            targetCourierId: 'c_closest',
            targetCourierName: 'Koffi Expiré',
            offerAttempt: 1,
            offerTimeoutSeconds: 30,
            offerStartedAt: nowMs - 40_000,
            offerExpiresAt: nowMs - 5_000, // Already expired
            pickupLocation: { commune: 'Cotonou - Haie Vive', coordinates: [6.3571, 2.3885] },
          },
        ],
      ]),
    });

    setupTokens();
    serverMod.setFirestoreAdminForTests(db);

    // Accepting expired offer fails with 410 OFFER_EXPIRED
    const expiredAccept = await fetch(`${baseUrl}/api/deliveries/LL-DISP-TIMEOUT/dispatch/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer c-closest-tok' },
      body: JSON.stringify({ action: 'accept' }),
    });
    assert.equal(expiredAccept.status, 410);
    assert.equal((await expiredAccept.json()).code, 'OFFER_EXPIRED');

    // Advancing moves target to c_second
    const advRes = await fetch(`${baseUrl}/api/deliveries/LL-DISP-TIMEOUT/dispatch/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({}),
    });
    assert.equal(advRes.status, 200);
    const advBody = await advRes.json();
    assert.equal(advBody.advanced, true);
    assert.equal(advBody.reason, 'timeout');
    assert.equal(advBody.targetCourierId, 'c_second');

    const d = collections.deliveries.get('LL-DISP-TIMEOUT')!;
    assert.deepEqual(d.expiredCourierIds, ['c_closest']);
    assert.equal(d.targetCourierId, 'c_second');
  });

  // Scenario 4 & 5: Preferred courier prioritized over closer courier + fallback when offline/unavailable
  await t.test('Scenario 4 & 5: Preferred courier prioritized first, falls back to closest GPS when offline or going unavailable', async () => {
    const nowMs = Date.now();
    const { db, collections } = createTransactionalMockDb({
      users: new Map([
        ['vendor_1', { uid: 'vendor_1', role: 'vendeur', preferredCourierId: 'c_pref', preferredCourierName: 'Bio Favori' }],
        [
          'c_pref',
          {
            uid: 'c_pref',
            role: 'livreur',
            fullName: 'Bio Favori',
            isKycVerified: true,
            status: 'en_ligne',
            isAvailable: true,
            locationLat: 6.45, // Farther (~10 km)
            locationLng: 2.35,
            locationSource: 'browser_gps',
            locationUpdatedAt: new Date(nowMs - 10_000).toISOString(),
          },
        ],
        [
          'c_closest',
          {
            uid: 'c_closest',
            role: 'livreur',
            fullName: 'Koffi Très Proche',
            isKycVerified: true,
            status: 'en_ligne',
            isAvailable: true,
            locationLat: 6.3575, // Very close (~0.06 km)
            locationLng: 2.3888,
            locationSource: 'browser_gps',
            locationUpdatedAt: new Date(nowMs - 10_000).toISOString(),
          },
        ],
      ]),
      deliveries: new Map([
        [
          'LL-DISP-PREF',
          {
            id: 'LL-DISP-PREF',
            merchantId: 'vendor_1',
            status: 'en_attente',
            deliveryFee: 1500,
            pickupLocation: { commune: 'Cotonou - Haie Vive', coordinates: [6.3571, 2.3885] },
          },
        ],
      ]),
    });

    setupTokens();
    serverMod.setFirestoreAdminForTests(db);

    const startRes = await fetch(`${baseUrl}/api/deliveries/LL-DISP-PREF/dispatch/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({ preferredCourierId: 'c_pref' }),
    });
    assert.equal(startRes.status, 200);
    const startBody = await startRes.json();
    assert.equal(startBody.targetCourierId, 'c_pref');
    assert.equal(startBody.targetIsPreferred, true);

    // Preferred courier goes offline -> availability route automatically advances pending offer to c_closest
    const offRes = await fetch(`${baseUrl}/api/couriers/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer c-pref-tok' },
      body: JSON.stringify({ status: 'hors_ligne', isAvailable: false }),
    });
    assert.equal(offRes.status, 200);
    const offBody = await offRes.json();
    assert.equal(offBody.status, 'hors_ligne');
    assert.equal(offBody.advancedOrders.includes('LL-DISP-PREF'), true);

    const updated = collections.deliveries.get('LL-DISP-PREF')!;
    assert.equal(updated.targetCourierId, 'c_closest');
    assert.equal(updated.targetIsPreferred, false);
  });

  // Scenario 6: Zero eligible couriers preserves delivery ('exhausted') + relaunch after courier comes online
  await t.test('Scenario 6: Zero eligible couriers keeps delivery saved as exhausted, relaunches cleanly when courier comes online with GPS', async () => {
    const { db, collections } = createTransactionalMockDb({
      users: new Map([
        ['vendor_1', { uid: 'vendor_1', role: 'vendeur' }],
        [
          'c_closest',
          {
            uid: 'c_closest',
            role: 'livreur',
            fullName: 'Koffi Hors Ligne',
            isKycVerified: true,
            status: 'hors_ligne',
            isAvailable: false,
          },
        ],
      ]),
      deliveries: new Map([
        [
          'LL-DISP-EMPTY',
          {
            id: 'LL-DISP-EMPTY',
            merchantId: 'vendor_1',
            status: 'en_attente',
            deliveryFee: 2500,
            pickupLocation: { commune: 'Cotonou - Haie Vive', coordinates: [6.3571, 2.3885] },
          },
        ],
      ]),
    });

    setupTokens();
    serverMod.setFirestoreAdminForTests(db);

    const emptyRes = await fetch(`${baseUrl}/api/deliveries/LL-DISP-EMPTY/dispatch/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({}),
    });
    assert.equal(emptyRes.status, 200);
    const emptyBody = await emptyRes.json();
    assert.equal(emptyBody.dispatchState, 'exhausted');
    assert.equal(emptyBody.targetCourierId, null);

    // Delivery MUST NEVER be deleted, stays 'en_attente' & 'exhausted'
    const persisted = collections.deliveries.get('LL-DISP-EMPTY');
    assert.ok(persisted);
    assert.equal(persisted.status, 'en_attente');
    assert.equal(persisted.dispatchState, 'exhausted');

    // Vendor notification created
    const vendorNotifs = Array.from(collections.notifications.values()).filter((n) => n.recipientId === 'vendor_1');
    assert.equal(vendorNotifs.length, 1);

    // Now courier goes online with live GPS and vendor triggers relaunch
    const onlineRes = await fetch(`${baseUrl}/api/couriers/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer c-closest-tok' },
      body: JSON.stringify({
        status: 'en_ligne',
        isAvailable: true,
        lat: 6.3585,
        lng: 2.3895,
        locationSource: 'browser_gps',
      }),
    });
    assert.equal(onlineRes.status, 200);

    const relaunchRes = await fetch(`${baseUrl}/api/deliveries/LL-DISP-EMPTY/dispatch/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({ relaunch: true }),
    });
    assert.equal(relaunchRes.status, 200);
    const relaunchBody = await relaunchRes.json();
    assert.equal(relaunchBody.dispatchState, 'offered');
    assert.equal(relaunchBody.targetCourierId, 'c_closest');
  });

  // Scenario 7: Concurrency race test on acceptance
  await t.test('Scenario 7: Concurrent accept requests execute atomically without double assignment', async () => {
    const nowMs = Date.now();
    const { db, collections } = createTransactionalMockDb({
      users: new Map([
        ['vendor_1', { uid: 'vendor_1', role: 'vendeur' }],
        [
          'c_closest',
          {
            uid: 'c_closest',
            role: 'livreur',
            fullName: 'Koffi Course',
            isKycVerified: true,
            status: 'en_ligne',
            isAvailable: true,
            locationLat: 6.358,
            locationLng: 2.389,
            locationSource: 'browser_gps',
            locationUpdatedAt: new Date(nowMs).toISOString(),
          },
        ],
        [
          'c_second',
          {
            uid: 'c_second',
            role: 'livreur',
            fullName: 'Sègbé Concurrent',
            isKycVerified: true,
            status: 'en_ligne',
            isAvailable: true,
            locationLat: 6.37,
            locationLng: 2.4,
            locationSource: 'browser_gps',
            locationUpdatedAt: new Date(nowMs).toISOString(),
          },
        ],
      ]),
      deliveries: new Map([
        [
          'LL-DISP-RACE',
          {
            id: 'LL-DISP-RACE',
            merchantId: 'vendor_1',
            status: 'en_attente',
            dispatchState: 'offered',
            targetCourierId: 'c_closest',
            offerExpiresAt: nowMs + 30_000,
            deliveryFee: 2000,
            pickupLocation: { commune: 'Cotonou - Haie Vive', coordinates: [6.3571, 2.3885] },
          },
        ],
      ]),
    });

    setupTokens();
    serverMod.setFirestoreAdminForTests(db);

    const [r1, r2, r3] = await Promise.all([
      fetch(`${baseUrl}/api/deliveries/LL-DISP-RACE/dispatch/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer c-closest-tok' },
        body: JSON.stringify({ action: 'accept' }),
      }),
      fetch(`${baseUrl}/api/deliveries/LL-DISP-RACE/dispatch/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer c-closest-tok' },
        body: JSON.stringify({ action: 'accept' }),
      }),
      fetch(`${baseUrl}/api/deliveries/LL-DISP-RACE/dispatch/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer c-second-tok' },
        body: JSON.stringify({ action: 'accept' }),
      }),
    ]);

    const statuses = [r1.status, r2.status, r3.status];
    assert.equal(statuses.filter((s) => s === 200).length, 1);
    assert.equal(r3.status === 403 || r3.status === 409, true);

    const finalOrder = collections.deliveries.get('LL-DISP-RACE')!;
    assert.equal(finalOrder.status, 'assignee');
    assert.equal(finalOrder.dispatchState, 'assigned');
    assert.equal(finalOrder.courierId, 'c_closest');
    assert.equal(finalOrder.targetCourierId, null);

    const winnerCourier = collections.users.get('c_closest')!;
    assert.equal(winnerCourier.status, 'en_course');
    assert.equal(winnerCourier.isAvailable, false);
  });

  // Scenario 8: Stale GPS and benin_default excluded from /api/couriers/eligible & ranking
  await t.test('Scenario 8: Stale GPS (>10m) and synthetic benin_default excluded from proximity ranking', async () => {
    const nowMs = Date.now();
    const { db } = createTransactionalMockDb({
      users: new Map([
        [
          'c_stale',
          {
            uid: 'c_stale',
            role: 'livreur',
            fullName: 'Stale GPS',
            isKycVerified: true,
            status: 'en_ligne',
            isAvailable: true,
            locationLat: 6.3571,
            locationLng: 2.3885, // Exact pickup location, but stale!
            locationSource: 'browser_gps',
            locationUpdatedAt: new Date(nowMs - 20 * 60_000).toISOString(),
          },
        ],
        [
          'c_pref',
          {
            uid: 'c_pref',
            role: 'livreur',
            fullName: 'Synthetic Default',
            isKycVerified: true,
            status: 'en_ligne',
            isAvailable: true,
            locationLat: BENIN_DEFAULT_FALLBACK_COORDS.lat,
            locationLng: BENIN_DEFAULT_FALLBACK_COORDS.lng,
            locationSource: 'benin_default',
            locationUpdatedAt: new Date(nowMs).toISOString(),
          },
        ],
        [
          'c_second',
          {
            uid: 'c_second',
            role: 'livreur',
            fullName: 'Fresh Valid',
            isKycVerified: true,
            status: 'en_ligne',
            isAvailable: true,
            locationLat: 6.41,
            locationLng: 2.42,
            locationSource: 'live_watch',
            locationUpdatedAt: new Date(nowMs - 25_000).toISOString(),
          },
        ],
      ]),
      deliveries: new Map([
        [
          'LL-DISP-FRESH',
          {
            id: 'LL-DISP-FRESH',
            merchantId: 'vendor_1',
            status: 'en_attente',
            pickupLocation: { commune: 'Cotonou - Haie Vive', coordinates: [6.3571, 2.3885] },
          },
        ],
      ]),
    });

    setupTokens();
    serverMod.setFirestoreAdminForTests(db);

    const eligibleRes = await fetch(`${baseUrl}/api/couriers/eligible`, {
      headers: { Authorization: 'Bearer vendor-tok' },
    });
    assert.equal(eligibleRes.status, 200);
    const eligibleBody = await eligibleRes.json();
    const staleEntry = eligibleBody.couriers.find((c: any) => c.id === 'c_stale');
    const defaultEntry = eligibleBody.couriers.find((c: any) => c.id === 'c_pref');
    const freshEntry = eligibleBody.couriers.find((c: any) => c.id === 'c_second');
    assert.equal(staleEntry.gpsFresh, false);
    assert.equal(defaultEntry.gpsFresh, false);
    assert.equal(freshEntry.gpsFresh, true);

    const startRes = await fetch(`${baseUrl}/api/deliveries/LL-DISP-FRESH/dispatch/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vendor-tok' },
      body: JSON.stringify({}),
    });
    assert.equal(startRes.status, 200);
    const startBody = await startRes.json();
    assert.equal(startBody.targetCourierId, 'c_second');
    assert.equal(startBody.excludedStats.staleOrDefaultGps, 2);
  });
});
