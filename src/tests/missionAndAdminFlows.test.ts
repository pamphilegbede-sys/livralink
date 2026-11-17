import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  escapeCsvCell,
  buildCsvContent,
  parseDeliveryTimestamp,
  filterItemsByTimeframe,
} from '../utils/csvExport';
import {
  mapFirestoreUserToCourier,
  mapFirestoreKycToRequest,
} from '../utils/adminReconciliation';
import {
  filterVendorDeliveries,
  sanitizeDuplicateOrderDraft,
  buildVendorDeliveryCsv,
} from '../utils/deliveryIsolation';
import type { DeliveryOrder } from '../types';

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

function makeOrder(overrides: Partial<DeliveryOrder> = {}): DeliveryOrder {
  return {
    id: '#LL-1001',
    clientName: 'Client Test',
    clientPhone: '+229 97 00 00 00',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Alpha',
      address: 'Haie Vive',
      commune: 'Cotonou - Haie Vive',
    },
    dropoffLocation: {
      name: 'Client Test',
      address: 'Cadjehoun',
      commune: 'Cotonou - Cadjehoun',
    },
    itemDescription: 'Colis Test',
    itemWeightKg: 1.5,
    itemFormat: 'M',
    isFragile: false,
    itemValueCOD: 15000,
    deliveryFee: 1500,
    totalCustomerPayable: 16500,
    status: 'en_attente',
    createdAt: new Date().toISOString(),
    estimatedArrival: 'Dans ~20 min',
    merchantId: 'vendor_1',
    merchantStoreName: 'Boutique Alpha',
    timeline: [],
    ...overrides,
  };
}

test('csvExport security & timeframe filtering', async (t) => {
  await t.test('escapeCsvCell neutralizes formula injection payloads and quotes', () => {
    assert.equal(escapeCsvCell('=CMD("calc")'), '"\'=CMD(""calc"")"');
    assert.equal(escapeCsvCell('+SUM(A1:A2)'), '"\'+SUM(A1:A2)"');
    assert.equal(escapeCsvCell('-1+1'), '"\'-1+1"');
    assert.equal(escapeCsvCell('@evil'), '"\'@evil"');
    assert.equal(escapeCsvCell('  =HYPERLINK("http://x")'), '"\'  =HYPERLINK(""http://x"")"');
    assert.equal(escapeCsvCell('\tcmd'), '"\'\tcmd"');
    assert.equal(escapeCsvCell('Normal text'), '"Normal text"');
  });

  await t.test('buildCsvContent outputs UTF-8 BOM, semicolon delimiter, and CRLF', () => {
    const csv = buildCsvContent(['Col A', 'Col B'], [['Bonjour', '=1+1']]);
    assert.ok(csv.startsWith('\uFEFF'));
    const lines = csv.slice(1).split('\r\n');
    assert.equal(lines.length, 2);
    assert.equal(lines[0], '"Col A";"Col B"');
    assert.equal(lines[1], '"Bonjour";"\'=1+1"');
  });

  await t.test('parseDeliveryTimestamp handles French DD/MM/YYYY, ISO, Aujourd hui and Hier', () => {
    const isoTs = parseDeliveryTimestamp('2026-05-10T14:00:00.000Z');
    assert.ok(typeof isoTs === 'number' && isoTs > 0);
    const frTs = parseDeliveryTimestamp('10/05/2026 09:30');
    assert.ok(typeof frTs === 'number' && frTs > 0);
    const todayTs = parseDeliveryTimestamp("Aujourd'hui");
    const yestTs = parseDeliveryTimestamp('Hier');
    assert.ok(todayTs !== null && yestTs !== null && todayTs > yestTs);
  });

  await t.test('filterItemsByTimeframe isolates today, 7days, month, year, and all in Africa/Porto-Novo', () => {
    const nowMs = Date.parse('2026-06-15T12:00:00.000Z');
    const items = [
      { id: 'today', createdAt: '2026-06-15T08:00:00.000Z' },
      { id: '3days', createdAt: '2026-06-12T10:00:00.000Z' },
      { id: 'sameMonth', createdAt: '2026-06-02T10:00:00.000Z' },
      { id: 'sameYear', createdAt: '2026-02-10T10:00:00.000Z' },
      { id: 'prevYear', createdAt: '2025-11-20T10:00:00.000Z' },
    ];
    assert.deepEqual(filterItemsByTimeframe(items, 'today', nowMs).map((i) => i.id), ['today']);
    assert.deepEqual(filterItemsByTimeframe(items, '7days', nowMs).map((i) => i.id), ['today', '3days']);
    assert.deepEqual(filterItemsByTimeframe(items, 'month', nowMs).map((i) => i.id), ['today', '3days', 'sameMonth']);
    assert.deepEqual(filterItemsByTimeframe(items, 'year', nowMs).map((i) => i.id), ['today', '3days', 'sameMonth', 'sameYear']);
    assert.equal(filterItemsByTimeframe(items, 'all', nowMs).length, 5);
  });
});

test('adminReconciliation preserves walletBalanceFCFA and extended KYC fields', () => {
  const courier = mapFirestoreUserToCourier(
    {
      uid: 'courier_1',
      fullName: 'Koffi Mensah',
      role: 'livreur',
      walletBalanceFCFA: 42500,
    },
    'courier_1'
  );
  assert.equal(courier.walletBalanceFCFA, 42500);

  const courierDefault = mapFirestoreUserToCourier({ uid: 'courier_2', role: 'livreur' }, 'courier_2');
  assert.equal(courierDefault.walletBalanceFCFA, 0);

  const kyc = mapFirestoreKycToRequest(
    {
      courierId: 'courier_1',
      lastName: 'Mensah',
      firstName: 'Koffi',
      fullName: 'Mensah Koffi',
      idType: 'CIP',
      npi: '1234567890',
      ifuNumber: '320240000111',
      vehiclePlate: 'BJ-9900-RB',
      status: 'en_attente',
    },
    'kyc_1'
  );
  assert.equal(kyc.lastName, 'Mensah');
  assert.equal(kyc.firstName, 'Koffi');
  assert.equal(kyc.idType, 'CIP');
  assert.equal(kyc.npi, '1234567890');
  assert.equal(kyc.ifuNumber, '320240000111');
  assert.equal(kyc.vehiclePlate, 'BJ-9900-RB');
});

test('deliveryIsolation vendor strict UID isolation, duplication sanitization, and CSV escaping', () => {
  const o1 = makeOrder({ id: '#LL-1', merchantId: 'v1', clientName: '=EVIL()' });
  const o2 = makeOrder({ id: '#LL-2', merchantId: 'v2', otpCode: '9999' });

  assert.deepEqual(
    filterVendorDeliveries([o1, o2], { userProfile: { uid: 'v1', role: 'vendeur' } }).map((o) => o.id),
    ['#LL-1']
  );
  assert.deepEqual(
    filterVendorDeliveries([o1, o2], { userProfile: null, firebaseUserUid: null }),
    []
  );

  // Cross-vendor duplication must return null
  assert.equal(sanitizeDuplicateOrderDraft(o2, 'v1', false), null);
  // Owner duplication succeeds without leaking sensitive assignment/POD fields
  const draft = sanitizeDuplicateOrderDraft(o1, 'v1', false);
  assert.ok(draft && draft.sourceOrderId === '#LL-1' && draft.clientName === '=EVIL()');

  const csvRes = buildVendorDeliveryCsv([o1, o2], 'v1', 'Boutique Alpha');
  assert.equal(csvRes.exportedCount, 1);
  assert.ok(csvRes.csvContent.includes('"\'=EVIL()"'));
  assert.ok(!csvRes.csvContent.includes('#LL-2'));
});

test('Server new Admin SDK & Delivery routes enforce authentication and expose public config', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(async () => {
    await close();
  });

  await t.test('Newly added admin, wallet reconciliation, platform config GET/POST, and OTP notify routes return 401 without Bearer token', async () => {
    const endpoints: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'GET', path: '/api/platform/config' },
      { method: 'POST', path: '/api/platform/config', body: { pricingRules: {} } },
      { method: 'POST', path: '/api/deliveries/LL-1001/notify-client-otp', body: { clientEmail: 'a@b.com' } },
      { method: 'GET', path: '/api/admin/wallet/pending-payouts' },
      { method: 'POST', path: '/api/admin/wallet/reconcile-payout', body: { targetUid: 'u1', idempotencyKey: 'k1', resolution: 'confirm_succeeded' } },
      { method: 'POST', path: '/api/admin/kyc/decision', body: { kycId: 'k1', decision: 'valide' } },
      { method: 'POST', path: '/api/admin/wallet/adjust', body: { targetUid: 'c1', amount: 1000, type: 'credit' } },
      { method: 'POST', path: '/api/admin/deliveries/LL-1/assign', body: { courierId: 'c1' } },
      { method: 'DELETE', path: '/api/admin/deliveries/LL-1' },
      { method: 'POST', path: '/api/admin/directory/user', body: { fullName: 'Test', role: 'livreur' } },
      { method: 'PATCH', path: '/api/admin/directory/user/u1', body: { status: 'actif' } },
      { method: 'DELETE', path: '/api/admin/directory/user/u1' },
    ];

    for (const ep of endpoints) {
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
});
