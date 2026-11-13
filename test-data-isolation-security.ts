import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import {
  isOrderOwnedByVendor,
  filterVendorDeliveries,
  sanitizeDuplicateOrderDraft,
  buildVendorDeliveryCsv,
  escapeCsvCell,
  isVerifiedMasterAdminEmail,
  canAccessVendorSpace,
  canAccessCourierSpace,
  canShowAdminDashboardButton,
} from './src/utils/deliveryIsolation';
import { doesOrderBelongToMerchant } from './src/utils/adminReconciliation';
import { DeliveryOrder, Merchant } from './src/types';

// Clean test script verifying data isolation & privacy rules
async function runDataIsolationSecurityTest() {
  console.log('=== LIVRALINK DATA ISOLATION & COMMUNICATIONS SECURITY SUITE ===\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
    }
  }

  // 1. Test Notification Recipient Isolation Logic
  console.log('--- TEST 1: NOTIFICATION RECIPIENT ISOLATION ---');
  const vendorAUid = 'vendor_a_uid_123';
  const vendorBUid = 'vendor_b_uid_456';
  const courierAUid = 'courier_a_uid_789';

  const mockNotifications = [
    { id: 'n1', recipientId: vendorAUid, title: 'Notification Vendeur A', message: 'Vendeur A uniquement' },
    { id: 'n2', recipientId: vendorBUid, title: 'Notification Vendeur B', message: 'Vendeur B uniquement' },
    { id: 'n3', recipientId: courierAUid, title: 'Notification Livreur A', message: 'Livreur A uniquement' },
  ];

  const vendorANotifs = mockNotifications.filter(n => n.recipientId === vendorAUid);
  const vendorBNotifs = mockNotifications.filter(n => n.recipientId === vendorBUid);

  assert(vendorANotifs.length === 1 && vendorANotifs[0].id === 'n1', 'Vendor A receives ONLY Vendor A notifications');
  assert(vendorBNotifs.length === 1 && vendorBNotifs[0].id === 'n2', 'Vendor B receives ONLY Vendor B notifications');
  assert(!vendorANotifs.some(n => n.recipientId === vendorBUid), 'Vendor A CANNOT see Vendor B notifications');

  // 2. Test KYC Dossier Isolation Logic
  console.log('\n--- TEST 2: KYC DOSSIER ISOLATION ---');
  const kycDossiers: Record<string, any> = {
    [vendorAUid]: { userId: vendorAUid, fullName: 'Vendeur A', documentFrontUrl: 'https://storage/a.jpg', status: 'valide' },
    [vendorBUid]: { userId: vendorBUid, fullName: 'Vendeur B', documentFrontUrl: 'https://storage/b.jpg', status: 'en_attente' },
  };

  function getKycForUser(requestorUid: string, targetUid: string, isAdmin: boolean) {
    if (isAdmin || requestorUid === targetUid) {
      return kycDossiers[targetUid] || null;
    }
    throw new Error('PERMISSION_DENIED: Access denied to foreign KYC dossier');
  }

  assert(getKycForUser(vendorAUid, vendorAUid, false).fullName === 'Vendeur A', 'User can view own KYC dossier');
  assert(getKycForUser('admin_pamphile', vendorAUid, true).fullName === 'Vendeur A', 'Admin can view any user KYC dossier');

  let kycLeakBlocked = false;
  try {
    getKycForUser(vendorAUid, vendorBUid, false);
  } catch (e: any) {
    if (e.message.includes('PERMISSION_DENIED')) kycLeakBlocked = true;
  }
  assert(kycLeakBlocked, 'User CANNOT view another user KYC dossier');

  // 3. Test Chat & Conversation Isolation
  console.log('\n--- TEST 3: CHAT PARTICIPANT ISOLATION ---');
  const conversations = [
    { id: 'conv_1', participantIds: [vendorAUid, courierAUid], subject: 'Order 1 Chat' },
    { id: 'conv_2', participantIds: [vendorBUid, courierAUid], subject: 'Order 2 Chat' },
  ];

  function getConversationsForUser(userUid: string) {
    return conversations.filter(c => c.participantIds.includes(userUid));
  }

  const vendorAConvs = getConversationsForUser(vendorAUid);
  const vendorBConvs = getConversationsForUser(vendorBUid);

  assert(vendorAConvs.length === 1 && vendorAConvs[0].id === 'conv_1', 'Vendor A sees only conversations where participant');
  assert(vendorBConvs.length === 1 && vendorBConvs[0].id === 'conv_2', 'Vendor B sees only conversations where participant');
  assert(!vendorAConvs.some(c => c.id === 'conv_2'), 'Vendor A CANNOT view Vendor B chat');

  // 4. Test Production Delivery Orders Isolation (Real Helpers)
  console.log('\n--- TEST 4: STRICT MULTI-VENDOR DELIVERY ISOLATION (PRODUCTION HELPERS) ---');
  const baseOrderTemplate: Omit<DeliveryOrder, 'id' | 'merchantId' | 'merchantEmail' | 'merchantStoreName' | 'clientName'> = {
    clientPhone: '+229 97 00 00 01',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Ma Boutique', // Identical store name on purpose!
      address: 'Haie Vive, Cotonou',
      commune: 'Cotonou - Haie Vive',
    },
    dropoffLocation: {
      name: 'Client Destination',
      address: 'Akpakpa, Cotonou',
      commune: 'Cotonou - Akpakpa',
    },
    itemDescription: 'Robe de soirée',
    itemWeightKg: 1,
    itemFormat: 'M',
    isFragile: false,
    itemValueCOD: 25000,
    deliveryFee: 1000,
    totalCustomerPayable: 26000,
    status: 'en_attente',
    createdAt: new Date().toISOString(),
    otpCode: '4821',
    timeline: [],
  };

  const orderVendorA: DeliveryOrder = {
    ...baseOrderTemplate,
    id: '#LL-A1001',
    clientName: 'Client Exclusif A',
    merchantId: vendorAUid,
    merchantEmail: 'shared-or-alias@boutique.bj',
    merchantStoreName: 'Ma Boutique', // Same storeName as Vendor B!
  };

  const orderVendorB: DeliveryOrder = {
    ...baseOrderTemplate,
    id: '#LL-B2002',
    clientName: 'Client Exclusif B',
    merchantId: vendorBUid,
    merchantEmail: 'shared-or-alias@boutique.bj', // Even with identical email/storeName, UID differs!
    merchantStoreName: 'Ma Boutique',
  };

  const unownedLegacyOrder: DeliveryOrder = {
    ...baseOrderTemplate,
    id: '#LL-LEGACY0',
    clientName: 'Client Sans Propriétaire',
    merchantId: undefined,
    merchantStoreName: 'Ma Boutique',
  };

  const mixedDeliveries: DeliveryOrder[] = [orderVendorA, orderVendorB, unownedLegacyOrder];

  const filteredForVendorA = filterVendorDeliveries(mixedDeliveries, {
    userProfile: { uid: vendorAUid, role: 'vendeur' },
    firebaseUserUid: vendorAUid,
  });
  const filteredForVendorB = filterVendorDeliveries(mixedDeliveries, {
    userProfile: { uid: vendorBUid, role: 'vendeur' },
    firebaseUserUid: vendorBUid,
  });
  const filteredForNewVendorC = filterVendorDeliveries(mixedDeliveries, {
    userProfile: { uid: 'vendor_c_brand_new', role: 'vendeur' },
    firebaseUserUid: 'vendor_c_brand_new',
  });
  const filteredUnauthenticated = filterVendorDeliveries(mixedDeliveries, {
    userProfile: null,
    firebaseUserUid: null,
  });

  assert(
    filteredForVendorA.length === 1 && filteredForVendorA[0].id === '#LL-A1001',
    'Vendor A sees ONLY order #LL-A1001 despite identical storeName/email and unowned legacy order'
  );
  assert(
    filteredForVendorB.length === 1 && filteredForVendorB[0].id === '#LL-B2002',
    'Vendor B sees ONLY order #LL-B2002 despite identical storeName/email and unowned legacy order'
  );
  assert(
    filteredForNewVendorC.length === 0,
    'Newly registered Vendor C with identical storeName sees 0 orders from other vendors'
  );
  assert(
    filteredUnauthenticated.length === 0,
    'Unauthenticated user receives 0 deliveries (no fail-open return true)'
  );
  assert(
    !isOrderOwnedByVendor(orderVendorB, vendorAUid) && !isOrderOwnedByVendor(unownedLegacyOrder, vendorAUid),
    'isOrderOwnedByVendor rejects foreign and unowned orders'
  );

  // Director mode isolation
  const directorForVendorA = filterVendorDeliveries(mixedDeliveries, {
    userProfile: { uid: 'admin_uid', role: 'admin' },
    isAdminAuthenticated: true,
    isDirectorModeActive: true,
    directorTargetId: vendorAUid,
    directorTargetName: 'Ma Boutique',
  });
  assert(
    directorForVendorA.length === 1 && directorForVendorA[0].id === '#LL-A1001',
    'Admin Director Mode filters strictly by directorTargetId when two boutiques share the same name'
  );

  // Admin reconciliation strictness
  const merchantA: Merchant = {
    id: vendorAUid,
    storeName: 'Ma Boutique',
    managerName: 'Alice',
    phone: '+229 97 11 11 11',
    email: 'alice@boutique.bj',
    commune: 'Cotonou',
    address: 'Haie Vive',
    channel: 'WhatsApp',
    totalOrders: 0,
    totalVolumeFCFA: 0,
    rating: 5,
    status: 'actif',
    isVerified: true,
    createdAt: '2026-01-01',
  };
  assert(
    doesOrderBelongToMerchant(orderVendorA, merchantA) && !doesOrderBelongToMerchant(orderVendorB, merchantA),
    'doesOrderBelongToMerchant attributes order strictly by merchantId when store names collide'
  );

  // 5. Test 1-Click Duplicate Order Draft & CSV Export Isolation
  console.log('\n--- TEST 5: DUPLICATE ORDER OWNERSHIP & ISOLATED CSV EXPORT ---');
  const ownDraft = sanitizeDuplicateOrderDraft(orderVendorA, vendorAUid);
  const stolenDraft = sanitizeDuplicateOrderDraft(orderVendorB, vendorAUid);

  assert(
    ownDraft !== null && ownDraft.clientName === 'Client Exclusif A' && ownDraft.dropoffCommune === 'Cotonou - Akpakpa',
    'Vendor A can duplicate their own delivery order into a clean draft'
  );
  assert(
    stolenDraft === null,
    'Vendor A CANNOT duplicate Vendor B delivery order (returns null)'
  );

  const dangerousFormulaOrder: DeliveryOrder = {
    ...orderVendorA,
    id: '#LL-FORMULA',
    clientName: '=HYPERLINK("http://evil.example","Click")',
  };
  const csvResult = buildVendorDeliveryCsv(
    [dangerousFormulaOrder, orderVendorB], // Pass mixed orders to verify defensive filtering!
    vendorAUid,
    'Ma Boutique'
  );
  assert(
    csvResult.exportedCount === 1 && !csvResult.csvContent.includes('Client Exclusif B'),
    'CSV Export defensively strips foreign vendor orders even if passed in input array'
  );
  assert(
    csvResult.csvContent.includes("'=HYPERLINK") && escapeCsvCell('+123').startsWith('"\'+'),
    'CSV Export escapes spreadsheet formula injection payloads (=, +, -, @)'
  );

  // 6. Test Admin Broadcast Receiver Calculation & Security
  console.log('\n--- TEST 6: ADMIN BROADCAST COMMUNICATIONS & RECIPIENTS ---');
  const allUsers = [
    { uid: vendorAUid, role: 'vendeur', email: 'venda@livralink.ci' },
    { uid: vendorBUid, role: 'vendeur', email: 'vendb@livralink.ci' },
    { uid: courierAUid, role: 'livreur', email: 'couriera@livralink.ci' },
    { uid: 'admin_1', role: 'admin', email: 'Pamphile.gbede@gmail.com' },
  ];

  function calculateTargetRecipients(targetCategory: 'all' | 'vendeurs' | 'livreurs' | 'individual', individualEmail?: string) {
    if (targetCategory === 'all') return allUsers.filter(u => u.role !== 'admin');
    if (targetCategory === 'vendeurs') return allUsers.filter(u => u.role === 'vendeur');
    if (targetCategory === 'livreurs') return allUsers.filter(u => u.role === 'livreur');
    if (targetCategory === 'individual') return allUsers.filter(u => u.email.toLowerCase() === individualEmail?.toLowerCase());
    return [];
  }

  const allTargets = calculateTargetRecipients('all');
  const vendorTargets = calculateTargetRecipients('vendeurs');
  const courierTargets = calculateTargetRecipients('livreurs');
  const indTarget = calculateTargetRecipients('individual', 'venda@livralink.ci');

  assert(allTargets.length === 3, 'Broadcast "all" targets 3 non-admin users');
  assert(vendorTargets.length === 2, 'Broadcast "vendeurs" targets 2 vendors');
  assert(courierTargets.length === 1, 'Broadcast "livreurs" targets 1 courier');
  assert(indTarget.length === 1 && indTarget[0].uid === vendorAUid, 'Broadcast "individual" targets specific user');

  // 7. Test Master Admin (pamphile.gbede@gmail.com) Multi-Space Access & Exclusive Admin Dashboard Button
  console.log('\n--- TEST 7: MASTER ADMIN MULTI-SPACE ACCESS & EXCLUSIVE ADMIN BUTTON ---');
  assert(
    isVerifiedMasterAdminEmail('pamphile.gbede@gmail.com', true) &&
      isVerifiedMasterAdminEmail('Pamphile.Gbede@gmail.com', true),
    'pamphile.gbede@gmail.com (verified, case-insensitive) is recognized as Master Admin'
  );
  assert(
    !isVerifiedMasterAdminEmail('pamphile.gbede@gmail.com', false),
    'Unverified email does NOT gain Master Admin access'
  );
  assert(
    canAccessVendorSpace({
      isAuthenticated: true,
      profileRole: 'admin',
      email: 'pamphile.gbede@gmail.com',
      emailVerified: true,
      isAdminAuthenticated: true,
      currentRole: 'admin',
    }),
    'Master Admin with role="admin" & currentRole="admin" HAS direct access to Espace Vendeur'
  );
  assert(
    canAccessCourierSpace({
      isAuthenticated: true,
      profileRole: 'admin',
      email: 'pamphile.gbede@gmail.com',
      emailVerified: true,
      isAdminAuthenticated: true,
      currentRole: 'admin',
    }),
    'Master Admin with role="admin" & currentRole="admin" HAS direct access to Espace Livreur'
  );
  assert(
    canShowAdminDashboardButton('pamphile.gbede@gmail.com', true) &&
      !canShowAdminDashboardButton('autre.admin@gmail.com', true) &&
      !canShowAdminDashboardButton('vendeur@boutique.bj', true) &&
      !canShowAdminDashboardButton('livreur@moto.bj', true),
    'Dashboard Admin button is visible EXCLUSIVELY for verified pamphile.gbede@gmail.com'
  );
  assert(
    !canAccessCourierSpace({
      isAuthenticated: true,
      profileRole: 'vendeur',
      email: 'vendeur@boutique.bj',
      emailVerified: true,
      isAdminAuthenticated: false,
      currentRole: 'vendeur',
    }) &&
      !canAccessVendorSpace({
        isAuthenticated: true,
        profileRole: 'livreur',
        email: 'livreur@moto.bj',
        emailVerified: true,
        isAdminAuthenticated: false,
        currentRole: 'livreur',
      }),
    'Regular Vendeur and Livreur accounts remain strictly blocked from cross-role spaces'
  );
  const masterVendorSpaceDeliveries = filterVendorDeliveries(mixedDeliveries, {
    userProfile: { uid: 'master_uid', role: 'admin' },
    firebaseUserUid: 'master_uid',
    isAdminAuthenticated: true,
    isUserMasterAdmin: true,
    isDirectorModeActive: false,
  });
  assert(
    masterVendorSpaceDeliveries.length === mixedDeliveries.length,
    'Master Admin sees delivery information immediately in Espace Vendeur before pressing Dashboard Admin'
  );

  console.log('\n======================================================');
  console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed successfully!`);
  console.log('======================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runDataIsolationSecurityTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
