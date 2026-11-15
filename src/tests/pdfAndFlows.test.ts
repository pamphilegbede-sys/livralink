import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVendorPdfReportBytes } from '../utils/pdfReportGenerator';
import {
  filterVendorDeliveries,
  sanitizeDuplicateOrderDraft,
  buildVendorDeliveryCsv,
  canAccessVendorSpace,
  canAccessCourierSpace,
} from '../utils/deliveryIsolation';
import { DeliveryOrder, DEFAULT_PLATFORM_FEATURE_FLAGS } from '../types';

function makeOrder(overrides: Partial<DeliveryOrder>): DeliveryOrder {
  return {
    id: '#LL-9001',
    clientName: 'Amina Koffi',
    clientPhone: '+22997000001',
    isClientVerified: false,
    channel: 'WhatsApp',
    merchantId: 'vendor_a',
    merchantStoreName: 'Boutique Cotonou',
    pickupLocation: {
      name: 'Boutique Cotonou',
      address: 'Haie Vive',
      commune: 'Cotonou - Haie Vive',
    },
    dropoffLocation: {
      name: 'Client',
      address: 'Fidjrossè',
      commune: 'Cotonou - Fidjrossè',
    },
    itemDescription: 'Colis Textile',
    itemWeightKg: 1.5,
    itemFormat: 'S',
    isFragile: false,
    itemValueCOD: 15000,
    deliveryFee: 1500,
    totalCustomerPayable: 16500,
    status: 'en_attente',
    statusNote: 'En attente',
    createdAt: '10:15',
    timeline: [],
    ...overrides,
  };
}

test('Real PDF report generator outputs valid binary PDF 1.4 structure with data rows', () => {
  const sampleOrders: DeliveryOrder[] = [
    makeOrder({ id: '#LL-5001', clientName: 'Codjo Mensah', status: 'livree', itemValueCOD: 25000, deliveryFee: 1200 }),
    makeOrder({ id: '#LL-5002', clientName: 'Estelle Dossou', status: 'en_cours', itemValueCOD: 10000, deliveryFee: 800 }),
  ];

  const { pdfBytes, filename } = buildVendorPdfReportBytes({
    storeName: 'Boutique Etoile',
    timeRangeLabel: '7 derniers jours',
    totalOrders: 2,
    deliveredOrders: 1,
    deliverySuccessRate: 50,
    totalCODCollected: 25000,
    totalDeliveryFees: 2000,
    deliveries: sampleOrders,
    generatedAt: new Date('2026-11-15T10:00:00.000Z'),
  });

  assert.ok(filename.startsWith('Rapport_LivraLink_Boutique_Etoile_'));
  assert.ok(filename.endsWith('.pdf'));
  assert.ok(pdfBytes instanceof Uint8Array);
  assert.ok(pdfBytes.byteLength > 500);

  const text = new TextDecoder('latin1').decode(pdfBytes);
  assert.ok(text.startsWith('%PDF-1.4\n'), 'PDF must start with %PDF-1.4 header');
  assert.ok(text.includes('xref\n'), 'PDF must include xref table');
  assert.ok(text.includes('%%EOF\n'), 'PDF must end with %%EOF trailer');
  assert.ok(text.includes('Boutique Etoile'), 'PDF must include store name');
  assert.ok(text.includes('#LL-5001'), 'PDF must include delivery ID');
  assert.ok(text.includes('Codjo Mensah'), 'PDF must include client name');
});

test('Vendor strict UID isolation hides other vendors orders and protects duplicate/CSV export', () => {
  const ownOrder = makeOrder({ id: '#LL-8001', merchantId: 'uid_vendor_1', merchantStoreName: 'Même Nom' });
  const otherOrder = makeOrder({ id: '#LL-8002', merchantId: 'uid_vendor_2', merchantStoreName: 'Même Nom' });

  const scoped = filterVendorDeliveries([ownOrder, otherOrder], {
    firebaseUserUid: 'uid_vendor_1',
    userProfile: {
      uid: 'uid_vendor_1',
      role: 'vendeur',
    },
    isAdminAuthenticated: false,
    isUserMasterAdmin: false,
    isDirectorModeActive: false,
  });

  assert.deepEqual(scoped.map((d) => d.id), ['#LL-8001']);

  assert.equal(sanitizeDuplicateOrderDraft(otherOrder, 'uid_vendor_1'), null);
  assert.ok(sanitizeDuplicateOrderDraft(ownOrder, 'uid_vendor_1'));

  const csv = buildVendorDeliveryCsv([ownOrder, otherOrder], 'uid_vendor_1', 'Boutique V1');
  assert.equal(csv.exportedCount, 1);
  assert.ok(csv.csvContent.includes('#LL-8001'));
  assert.ok(!csv.csvContent.includes('#LL-8002'));
});

test('Space access guards enforce role separation unless verified Master Admin', () => {
  assert.equal(canAccessVendorSpace({ isAuthenticated: false, profileRole: 'vendeur' }), false);
  assert.equal(canAccessVendorSpace({ isAuthenticated: true, profileRole: 'vendeur' }), true);
  assert.equal(canAccessVendorSpace({ isAuthenticated: true, profileRole: 'livreur' }), false);
  assert.equal(canAccessCourierSpace({ isAuthenticated: true, profileRole: 'vendeur' }), false);
  assert.equal(canAccessCourierSpace({ isAuthenticated: true, profileRole: 'livreur' }), true);
  assert.equal(
    canAccessVendorSpace({
      isAuthenticated: true,
      profileRole: 'admin',
      email: 'pamphile.gbede@gmail.com',
      emailVerified: true,
    }),
    true
  );
});

test('MVP defaults: POD tri-factor flags are enabled by default', () => {
  assert.equal(DEFAULT_PLATFORM_FEATURE_FLAGS.requireOtpPOD, true);
  assert.equal(DEFAULT_PLATFORM_FEATURE_FLAGS.requireLivePhotoPOD, true);
  assert.equal(DEFAULT_PLATFORM_FEATURE_FLAGS.requireTactileSignaturePOD, true);
});
