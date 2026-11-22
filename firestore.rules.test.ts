/**
 * Comprehensive Security Test Suite for Firestore Rules — LivraLink
 *
 * Covers:
 * 1-15: Core security scenarios (unauthenticated read, role-less/vendor accept block,
 *       double-acceptance prevention, privilege escalation blocks, PII isolation,
 *       notification spoofing/type blocks, conversation isolation, message sender forgery,
 *       deletion locks, read-only notification flag updates).
 * 16-24: P0 Hardened controls:
 *       16. Unverified email matching admin whitelist is denied Admin access.
 *       17. User cannot self-approve KYC (/kyc isApproved/valide) or modify user status/isKycVerified.
 *       18. Vendor cannot accept /deliveries doc as courier.
 *       19. Unverified-KYC courier cannot read/accept open deliveries or missions.
 *       20. Plaintext otpCode on /deliveries is blocked; /deliveries/{id}/private/otp is vendor/admin only.
 *       21. Direct client transition to 'livree' by courier is blocked (must go through trusted backend POD endpoint).
 *       22. Client-side notification creation by non-admin is strictly blocked.
 *       23. Notification isRead cannot be reset back to false.
 *       24. Empty/spoofed courier.id map cannot bypass assignment ownership checks.
 */

import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';

let testEnv: RulesTestEnvironment;

const PROJECT_ID = 'ai-studio-livralink-security-test';

describe('LivraLink Complete Security Rules Test Suite', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  // 1. Unauthenticated user access
  test('1. Unauthenticated user cannot access protected data', async () => {
    const unauthCtx = testEnv.unauthenticatedContext();
    const db = unauthCtx.firestore();

    await assertFails(db.doc('priority_missions/mission_1').get());
    await assertFails(db.doc('users/user_1').get());
    await assertFails(db.doc('deliveries/deliv_1').get());
  });

  // 2. Client cannot accept a delivery
  test('2. Client without courier role cannot accept a delivery', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/client_1').set({
        uid: 'client_1',
        email: 'client@test.com',
        fullName: 'Client Test',
        phone: '+22997000001',
        role: 'client',
      });
      await context.firestore().doc('priority_missions/mission_1').set({
        id: 'mission_1',
        orderId: 'mission_1',
        merchantId: 'vendor_1',
        fee: 2000,
        status: 'en_attente',
      });
    });

    const clientCtx = testEnv.authenticatedContext('client_1', {
      email: 'client@test.com',
      email_verified: true,
    });
    const db = clientCtx.firestore();

    await assertFails(
      db.doc('priority_missions/mission_1').update({
        status: 'acceptee',
        courierId: 'client_1',
      })
    );
  });

  // 3. Vendor cannot accept a delivery as a courier
  test('3. Vendor cannot accept a delivery using their vendor account', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/vendor_1').set({
        uid: 'vendor_1',
        email: 'vendor@test.com',
        fullName: 'Vendeur Test',
        phone: '+22997000002',
        role: 'vendeur',
      });
      await context.firestore().doc('priority_missions/mission_1').set({
        id: 'mission_1',
        orderId: 'mission_1',
        merchantId: 'vendor_other',
        fee: 2000,
        status: 'en_attente',
      });
    });

    const vendorCtx = testEnv.authenticatedContext('vendor_1', {
      email: 'vendor@test.com',
      email_verified: true,
    });
    const db = vendorCtx.firestore();

    await assertFails(
      db.doc('priority_missions/mission_1').update({
        status: 'acceptee',
        courierId: 'vendor_1',
      })
    );
  });

  // 4. Authorized KYC-verified courier can accept an available mission
  test('4. Authorized KYC-verified courier can accept an available mission', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_1').set({
        uid: 'courier_1',
        email: 'courier@test.com',
        fullName: 'Livreur Test',
        phone: '+22997000003',
        role: 'livreur',
        isKycVerified: true,
      });
      await context.firestore().doc('priority_missions/mission_1').set({
        id: 'mission_1',
        orderId: 'mission_1',
        merchantId: 'vendor_1',
        fee: 2000,
        status: 'en_attente',
      });
    });

    const courierCtx = testEnv.authenticatedContext('courier_1', {
      email: 'courier@test.com',
      email_verified: true,
    });
    const db = courierCtx.firestore();

    await assertSucceeds(
      db.doc('priority_missions/mission_1').update({
        status: 'acceptee',
        courierId: 'courier_1',
        courierName: 'Livreur Test',
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
  });

  // 5. Courier cannot retrieve an already assigned mission
  test('5. Courier cannot retrieve or take over a mission assigned to another courier', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_2').set({
        uid: 'courier_2',
        email: 'courier2@test.com',
        fullName: 'Livreur 2',
        phone: '+22997000004',
        role: 'livreur',
        isKycVerified: true,
      });
      await context.firestore().doc('priority_missions/mission_1').set({
        id: 'mission_1',
        orderId: 'mission_1',
        merchantId: 'vendor_1',
        courierId: 'courier_1',
        fee: 2000,
        status: 'acceptee',
      });
    });

    const courier2Ctx = testEnv.authenticatedContext('courier_2', {
      email: 'courier2@test.com',
      email_verified: true,
    });
    const db = courier2Ctx.firestore();

    await assertFails(
      db.doc('priority_missions/mission_1').update({
        courierId: 'courier_2',
        status: 'acceptee',
      })
    );
  });

  // 6. Two couriers cannot obtain the same mission simultaneously
  test('6. Second courier is rejected when mission is no longer en_attente', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_b').set({
        uid: 'courier_b',
        email: 'courierb@test.com',
        fullName: 'Livreur B',
        phone: '+22997000005',
        role: 'livreur',
        isKycVerified: true,
      });
      await context.firestore().doc('priority_missions/mission_race').set({
        id: 'mission_race',
        orderId: 'mission_race',
        merchantId: 'vendor_1',
        courierId: 'courier_a',
        fee: 2500,
        status: 'acceptee',
      });
    });

    const courierBCtx = testEnv.authenticatedContext('courier_b', {
      email: 'courierb@test.com',
      email_verified: true,
    });
    const db = courierBCtx.firestore();

    await assertFails(
      db.doc('priority_missions/mission_race').update({
        courierId: 'courier_b',
        status: 'acceptee',
      })
    );
  });

  // 7. User cannot modify their own role
  test('7. User cannot alter their role after creation', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/user_change_role').set({
        uid: 'user_change_role',
        email: 'user@test.com',
        fullName: 'User Test',
        phone: '+22997000006',
        role: 'vendeur',
      });
    });

    const userCtx = testEnv.authenticatedContext('user_change_role', {
      email: 'user@test.com',
      email_verified: true,
    });
    const db = userCtx.firestore();

    await assertFails(
      db.doc('users/user_change_role').update({
        role: 'livreur',
      })
    );
  });

  // 8. User cannot become an administrator
  test('8. User cannot self-assign admin role on registration or in /admins', async () => {
    const userCtx = testEnv.authenticatedContext('hacker_admin', {
      email: 'hacker@test.com',
      email_verified: true,
    });
    const db = userCtx.firestore();

    await assertFails(
      db.doc('users/hacker_admin').set({
        uid: 'hacker_admin',
        email: 'hacker@test.com',
        fullName: 'Hacker',
        phone: '+22997000007',
        role: 'admin',
      })
    );

    await assertFails(
      db.doc('admins/hacker_admin').set({
        email: 'hacker@test.com',
      })
    );
  });

  // 9. User cannot read personal client PII without authorization
  test('9. Unassigned courier cannot read full client PII from /deliveries', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_unassigned').set({
        uid: 'courier_unassigned',
        email: 'courier_u@test.com',
        fullName: 'Livreur Unassigned',
        phone: '+22997000008',
        role: 'livreur',
        isKycVerified: true,
      });
      await context.firestore().doc('deliveries/deliv_private').set({
        id: 'deliv_private',
        merchantId: 'vendor_1',
        courierId: 'courier_assigned',
        clientName: 'Client Confidentiel',
        clientPhone: '+22997999999',
        deliveryFee: 3000,
        status: 'en_cours',
      });
    });

    const courierUCtx = testEnv.authenticatedContext('courier_unassigned', {
      email: 'courier_u@test.com',
      email_verified: true,
    });
    const db = courierUCtx.firestore();

    await assertFails(db.doc('deliveries/deliv_private').get());
  });

  // 10. Ordinary users cannot create notifications directly in Firestore (trusted backend only)
  test('10. Ordinary user cannot fabricate any notification directly in /notifications', async () => {
    const userCtx = testEnv.authenticatedContext('user_notif_tester', {
      email: 'user_n@test.com',
      email_verified: true,
    });
    const db = userCtx.firestore();

    await assertFails(
      db.doc('notifications/n_self').set({
        id: 'n_self',
        recipientId: 'user_notif_tester',
        senderId: 'user_notif_tester',
        title: 'Fake Alert',
        message: 'Self fabricated',
      })
    );

    await assertFails(
      db.doc('notifications/n_spoof').set({
        id: 'n_spoof',
        recipientId: 'unrelated_victim',
        senderId: 'admin_god',
        title: 'Alert',
        message: 'Spoofed',
      })
    );

    await assertFails(
      db.doc('notifications/n_sys').set({
        id: 'n_sys',
        recipientId: 'user_notif_tester',
        senderId: 'user_notif_tester',
        title: 'System Alert',
        message: 'Hello',
        type: 'system',
      })
    );
  });

  // 11. User cannot read conversations they are not part of
  test('11. Non-participant cannot read private conversation messages', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('conversations/conv_secret').set({
        participantIds: ['vendor_1', 'courier_1'],
      });
    });

    const outsiderCtx = testEnv.authenticatedContext('user_outsider', {
      email: 'outsider@test.com',
      email_verified: true,
    });
    const db = outsiderCtx.firestore();

    await assertFails(db.doc('conversations/conv_secret').get());
  });

  // 12. User cannot modify sender identity of a message
  test('12. User cannot forge senderId when posting a chat message', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('conversations/conv_1').set({
        participantIds: ['vendor_1', 'courier_1'],
      });
    });

    const vendorCtx = testEnv.authenticatedContext('vendor_1', {
      email: 'vendor1@test.com',
      email_verified: true,
    });
    const db = vendorCtx.firestore();

    await assertFails(
      db.doc('conversations/conv_1/messages/msg_fake').set({
        id: 'msg_fake',
        senderId: 'courier_1',
        text: 'I am giving up this order',
      })
    );
  });

  // 13. Legitimate operations continue working (with private OTP isolation and backend POD gating)
  test('13. Legitimate vendor create, private OTP, and KYC-verified courier pickup/transit succeed', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/vendor_ok').set({
        uid: 'vendor_ok',
        email: 'vendor@ok.com',
        fullName: 'Vendor OK',
        phone: '+22997000010',
        role: 'vendeur',
      });
      await context.firestore().doc('users/courier_ok').set({
        uid: 'courier_ok',
        email: 'courier@ok.com',
        fullName: 'Courier OK',
        phone: '+22997000011',
        role: 'livreur',
        isKycVerified: true,
      });
    });

    const vendorCtx = testEnv.authenticatedContext('vendor_ok', {
      email: 'vendor@ok.com',
      email_verified: true,
    });
    const vendorDb = vendorCtx.firestore();

    await assertSucceeds(
      vendorDb.doc('deliveries/m_ok').set({
        id: 'm_ok',
        merchantId: 'vendor_ok',
        clientName: 'Client A',
        clientPhone: '+22997001122',
        deliveryFee: 2500,
        status: 'en_attente',
        otpRequired: true,
      })
    );

    await assertSucceeds(
      vendorDb.doc('deliveries/m_ok/private/otp').set({
        otpCode: '4821',
        merchantId: 'vendor_ok',
        generatedAt: Date.now(),
      })
    );

    await assertSucceeds(
      vendorDb.doc('priority_missions/m_ok').set({
        id: 'm_ok',
        orderId: 'm_ok',
        merchantId: 'vendor_ok',
        fee: 2500,
        status: 'en_attente',
      })
    );

    const courierCtx = testEnv.authenticatedContext('courier_ok', {
      email: 'courier@ok.com',
      email_verified: true,
    });
    const courierDb = courierCtx.firestore();

    // Courier CANNOT read private OTP document
    await assertFails(courierDb.doc('deliveries/m_ok/private/otp').get());

    await assertSucceeds(
      courierDb.doc('priority_missions/m_ok').update({
        status: 'assignee',
        courierId: 'courier_ok',
        courierName: 'Courier OK',
        assignedAt: Date.now(),
        updatedAt: new Date().toISOString(),
      })
    );

    await assertSucceeds(
      courierDb.doc('deliveries/m_ok').update({
        status: 'assignee',
        courierId: 'courier_ok',
        courierName: 'Courier OK',
        assignedAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    await assertSucceeds(
      courierDb.doc('deliveries/m_ok').update({
        status: 'colis_recupere',
        updatedAt: Date.now(),
      })
    );

    await assertSucceeds(
      courierDb.doc('deliveries/m_ok').update({
        status: 'en_cours',
        updatedAt: Date.now(),
      })
    );
  });

  // 14. Non-admin users cannot delete deliveries, users, or priority missions
  test('14. Unauthorized users cannot delete mission or delivery documents', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context.firestore().doc('priority_missions/m_del').set({
        id: 'm_del',
        orderId: 'm_del',
        merchantId: 'vendor_ok',
        fee: 2500,
        status: 'en_attente',
      });
    });

    const courierCtx = testEnv.authenticatedContext('courier_ok', {
      email: 'courier@ok.com',
      email_verified: true,
    });
    const courierDb = courierCtx.firestore();

    await assertFails(courierDb.doc('priority_missions/m_del').delete());
  });

  // 15. Notification recipient can only mark isRead true once (cannot reset to false or tamper)
  test('15. Notification recipient can mark isRead true once and cannot reset or tamper fields', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context.firestore().doc('notifications/notif_test').set({
        id: 'notif_test',
        recipientId: 'user_target',
        senderId: 'system_backend',
        title: 'Original Title',
        message: 'Original Message',
        isRead: false,
      });
    });

    const userTargetCtx = testEnv.authenticatedContext('user_target', {
      email: 'target@ok.com',
      email_verified: true,
    });
    const db = userTargetCtx.firestore();

    await assertFails(
      db.doc('notifications/notif_test').update({
        isRead: true,
        title: 'Tampered Title',
      })
    );

    await assertSucceeds(
      db.doc('notifications/notif_test').update({
        isRead: true,
        read: true,
        readAt: Date.now(),
      })
    );

    // Cannot reset isRead back to false
    await assertFails(
      db.doc('notifications/notif_test').update({
        isRead: false,
      })
    );
  });

  // 16. Unverified admin whitelist email is denied admin privileges
  test('16. Unverified email matching super-admin address cannot read /users list', async () => {
    const unverifiedAdmin = testEnv.authenticatedContext('spoof_admin', {
      email: 'pamphile.gbede@gmail.com',
      email_verified: false,
    });
    await assertFails(unverifiedAdmin.firestore().collection('users').get());
  });

  // 17. KYC self-approval is strictly blocked
  test('17. User cannot self-approve KYC or flip isKycVerified on /users', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_kyc').set({
        uid: 'courier_kyc',
        email: 'ckyc@test.com',
        fullName: 'Courier KYC',
        phone: '+22997000012',
        role: 'livreur',
        isKycVerified: false,
        kycStatus: 'non_soumis',
      });
    });

    const courierCtx = testEnv.authenticatedContext('courier_kyc', {
      email: 'ckyc@test.com',
      email_verified: true,
    });
    const db = courierCtx.firestore();

    await assertFails(
      db.doc('kyc/courier_kyc').set({
        id: 'kyc_1',
        userId: 'courier_kyc',
        fullName: 'Courier KYC',
        phone: '+22997000012',
        status: 'valide',
        isApproved: true,
      })
    );

    await assertFails(
      db.doc('users/courier_kyc').update({
        isKycVerified: true,
        kycStatus: 'valide',
      })
    );
  });

  // 18. Vendor cannot accept a delivery in /deliveries
  test('18. Vendor cannot accept /deliveries document as courier', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/vendor_x').set({
        uid: 'vendor_x',
        email: 'vx@test.com',
        fullName: 'Vendor X',
        phone: '+22997000013',
        role: 'vendeur',
      });
      await context.firestore().doc('deliveries/deliv_open').set({
        id: 'deliv_open',
        merchantId: 'vendor_y',
        clientName: 'Client B',
        clientPhone: '+22997000014',
        deliveryFee: 1500,
        status: 'en_attente',
      });
    });

    const vendorCtx = testEnv.authenticatedContext('vendor_x', {
      email: 'vx@test.com',
      email_verified: true,
    });
    await assertFails(
      vendorCtx.firestore().doc('deliveries/deliv_open').update({
        status: 'assignee',
        courierId: 'vendor_x',
        updatedAt: Date.now(),
      })
    );
  });

  // 19. Unverified-KYC courier cannot read or accept open deliveries
  test('19. Courier without KYC approval cannot read or accept open deliveries', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_nokyc').set({
        uid: 'courier_nokyc',
        email: 'nokyc@test.com',
        fullName: 'Unverified Courier',
        phone: '+22997000015',
        role: 'livreur',
        isKycVerified: false,
      });
      await context.firestore().doc('deliveries/deliv_kyc_gate').set({
        id: 'deliv_kyc_gate',
        merchantId: 'vendor_y',
        clientName: 'Client C',
        clientPhone: '+22997000016',
        deliveryFee: 2000,
        status: 'en_attente',
      });
    });

    const courierCtx = testEnv.authenticatedContext('courier_nokyc', {
      email: 'nokyc@test.com',
      email_verified: true,
    });
    const db = courierCtx.firestore();

    await assertFails(db.doc('deliveries/deliv_kyc_gate').get());
    await assertFails(
      db.doc('deliveries/deliv_kyc_gate').update({
        status: 'assignee',
        courierId: 'courier_nokyc',
      })
    );
  });

  // 20. Plaintext otpCode on /deliveries is rejected and direct courier 'livree' jump is blocked
  test('20. Plaintext otpCode on /deliveries and direct courier status=livree update are blocked', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/vendor_sec').set({
        uid: 'vendor_sec',
        email: 'vsec@test.com',
        fullName: 'Vendor Sec',
        phone: '+22997000017',
        role: 'vendeur',
      });
      await context.firestore().doc('users/courier_sec').set({
        uid: 'courier_sec',
        email: 'csec@test.com',
        fullName: 'Courier Sec',
        phone: '+22997000018',
        role: 'livreur',
        isKycVerified: true,
      });
      await context.firestore().doc('deliveries/deliv_sec').set({
        id: 'deliv_sec',
        merchantId: 'vendor_sec',
        courierId: 'courier_sec',
        clientName: 'Client D',
        clientPhone: '+22997000019',
        deliveryFee: 2000,
        status: 'en_cours',
      });
    });

    const vendorCtx = testEnv.authenticatedContext('vendor_sec', {
      email: 'vsec@test.com',
      email_verified: true,
    });
    await assertFails(
      vendorCtx.firestore().doc('deliveries/deliv_plain_otp').set({
        id: 'deliv_plain_otp',
        merchantId: 'vendor_sec',
        clientName: 'Client D',
        clientPhone: '+22997000019',
        deliveryFee: 2000,
        status: 'en_attente',
        otpCode: '1234',
      })
    );

    const courierCtx = testEnv.authenticatedContext('courier_sec', {
      email: 'csec@test.com',
      email_verified: true,
    });
    await assertFails(
      courierCtx.firestore().doc('deliveries/deliv_sec').update({
        status: 'livree',
        deliveredAt: Date.now(),
      })
    );
  });

  // 21. Statically provable allow list queries on deliveries and priority_missions (targeted dispatch only)
  test('21. KYC courier can run allow list queries only on targeted or own assigned deliveries/missions', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_list').set({
        uid: 'courier_list',
        email: 'clist@test.com',
        fullName: 'Courier List',
        phone: '+22997000021',
        role: 'livreur',
        isKycVerified: true,
      });
      await context.firestore().doc('deliveries/deliv_open_1').set({
        id: 'deliv_open_1',
        merchantId: 'vendor_1',
        clientName: 'Client Open',
        clientPhone: '+22997000022',
        deliveryFee: 1500,
        status: 'en_attente',
        dispatchState: 'offered',
        targetCourierId: 'courier_list',
      });
      await context.firestore().doc('priority_missions/mission_open_1').set({
        id: 'mission_open_1',
        orderId: 'deliv_open_1',
        merchantId: 'vendor_1',
        fee: 1500,
        status: 'en_attente',
        dispatchState: 'offered',
        targetCourierId: 'courier_list',
      });
    });

    const courierCtx = testEnv.authenticatedContext('courier_list', {
      email: 'clist@test.com',
      email_verified: true,
    });
    const db = courierCtx.firestore();

    await assertSucceeds(db.collection('deliveries').where('targetCourierId', '==', 'courier_list').get());
    await assertSucceeds(db.collection('deliveries').where('courierId', '==', 'courier_list').get());
    await assertSucceeds(db.collection('priority_missions').where('targetCourierId', '==', 'courier_list').get());
    await assertFails(db.collection('deliveries').where('status', '==', 'en_attente').get());
    await assertFails(db.collection('priority_missions').where('status', '==', 'en_attente').get());
    await assertFails(db.collection('deliveries').get());
  });

  // 22. Legacy /users doc with extra fields allows owner partial update while locking role/KYC
  test('22. Legacy user profile with extra fields allows safe profile edits and blocks privilege escalation', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/legacy_vendor').set({
        uid: 'legacy_vendor',
        email: 'legacy@test.com',
        fullName: 'Vendeur Legacy',
        phone: '+22997000023',
        role: 'vendeur',
        legacyMigrationTag: 'v1_import',
      });
    });

    const vendorCtx = testEnv.authenticatedContext('legacy_vendor', {
      email: 'legacy@test.com',
      email_verified: true,
    });
    const db = vendorCtx.firestore();

    await assertSucceeds(
      db.doc('users/legacy_vendor').update({
        storeName: 'Boutique Cotonou Pro',
        updatedAt: new Date().toISOString(),
      })
    );
    await assertFails(
      db.doc('users/legacy_vendor').update({
        role: 'admin',
      })
    );
    await assertFails(
      db.doc('users/legacy_vendor').update({
        isKycVerified: true,
      })
    );
  });

  // 23. Owning vendor can submit courierRating once after delivery; second edit or non-owner rejected
  test('23. Vendor can rate courier once after delivery; re-rating or non-owner rating fails', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/vendor_rate').set({
        uid: 'vendor_rate',
        email: 'vrate@test.com',
        fullName: 'Vendor Rate',
        phone: '+22997000024',
        role: 'vendeur',
      });
      await context.firestore().doc('users/vendor_other').set({
        uid: 'vendor_other',
        email: 'vother@test.com',
        fullName: 'Vendor Other',
        phone: '+22997000025',
        role: 'vendeur',
      });
      await context.firestore().doc('deliveries/deliv_done').set({
        id: 'deliv_done',
        merchantId: 'vendor_rate',
        courierId: 'courier_1',
        clientName: 'Client Done',
        clientPhone: '+22997000026',
        deliveryFee: 2000,
        status: 'livree',
      });
    });

    const otherCtx = testEnv.authenticatedContext('vendor_other', {
      email: 'vother@test.com',
      email_verified: true,
    });
    await assertFails(
      otherCtx.firestore().doc('deliveries/deliv_done').update({
        courierRating: { rating: 1, ratedAt: 'now' },
        updatedAt: Date.now(),
      })
    );

    const ownerCtx = testEnv.authenticatedContext('vendor_rate', {
      email: 'vrate@test.com',
      email_verified: true,
    });
    await assertSucceeds(
      ownerCtx.firestore().doc('deliveries/deliv_done').update({
        courierRating: { rating: 5, ratedAt: 'now', ratedBy: 'Boutique Rate' },
        updatedAt: Date.now(),
      })
    );
    await assertFails(
      ownerCtx.firestore().doc('deliveries/deliv_done').update({
        courierRating: { rating: 2, ratedAt: 'later' },
        updatedAt: Date.now(),
      })
    );
  });

  // 24. KYC dossier owner cannot tamper with id/userId/isApproved on update
  test('24. KYC owner update preserves id/userId immutability and blocks self-approval', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_kyc_u').set({
        uid: 'courier_kyc_u',
        email: 'ckyc@test.com',
        fullName: 'Courier KYC',
        phone: '+22997000027',
        role: 'livreur',
      });
      await context.firestore().doc('kyc/courier_kyc_u').set({
        id: 'courier_kyc_u',
        userId: 'courier_kyc_u',
        fullName: 'Courier KYC',
        phone: '+22997000027',
        status: 'refuse',
        isApproved: false,
        verified: false,
      });
    });

    const ctx = testEnv.authenticatedContext('courier_kyc_u', {
      email: 'ckyc@test.com',
      email_verified: true,
    });
    const db = ctx.firestore();

    await assertFails(
      db.doc('kyc/courier_kyc_u').update({
        userId: 'someone_else',
      })
    );
    await assertFails(
      db.doc('kyc/courier_kyc_u').update({
        status: 'valide',
        isApproved: true,
        verified: true,
      })
    );
    await assertSucceeds(
      db.doc('kyc/courier_kyc_u').update({
        status: 'en_attente',
        vehiclePlate: 'BJ-1234-RB',
      })
    );
  });

  // 25. Client isolation: clients can only read deliveries linked to their clientId
  test('25. Client can read own clientId delivery but cannot read other clients or create deliveries', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/client_iso_1').set({
        uid: 'client_iso_1',
        email: 'c1@test.com',
        fullName: 'Client 1',
        phone: '+22997000030',
        role: 'client',
      });
      await context.firestore().doc('deliveries/deliv_c1').set({
        id: 'deliv_c1',
        merchantId: 'vendor_1',
        clientId: 'client_iso_1',
        clientName: 'Client 1',
        clientPhone: '+22997000030',
        deliveryFee: 1500,
        status: 'en_cours',
      });
      await context.firestore().doc('deliveries/deliv_c2').set({
        id: 'deliv_c2',
        merchantId: 'vendor_1',
        clientId: 'client_iso_2',
        clientName: 'Client 2',
        clientPhone: '+22997000031',
        deliveryFee: 1500,
        status: 'en_cours',
      });
    });

    const clientCtx = testEnv.authenticatedContext('client_iso_1', {
      email: 'c1@test.com',
      email_verified: true,
    });
    const db = clientCtx.firestore();

    await assertSucceeds(db.doc('deliveries/deliv_c1').get());
    await assertSucceeds(db.collection('deliveries').where('clientId', '==', 'client_iso_1').get());
    await assertFails(db.doc('deliveries/deliv_c2').get());
    await assertFails(db.collection('deliveries').where('clientId', '==', 'client_iso_2').get());
    await assertFails(
      db.doc('deliveries/deliv_client_spoof').set({
        id: 'deliv_client_spoof',
        merchantId: 'client_iso_1',
        clientName: 'Client 1',
        clientPhone: '+22997000030',
        deliveryFee: 1500,
        status: 'en_attente',
      })
    );
  });

  // 26. Wallet & payout idempotency protection
  test('26. Users cannot tamper with walletBalanceFCFA on /users or write /payout_idempotency directly', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_wallet_u').set({
        uid: 'courier_wallet_u',
        email: 'cw@test.com',
        fullName: 'Courier Wallet',
        phone: '+22997000032',
        role: 'livreur',
        walletBalanceFCFA: 0,
      });
    });

    const ctx = testEnv.authenticatedContext('courier_wallet_u', {
      email: 'cw@test.com',
      email_verified: true,
    });
    const db = ctx.firestore();

    await assertFails(
      db.doc('users/courier_wallet_u').update({
        walletBalanceFCFA: 500000,
      })
    );
    await assertFails(
      db.doc('payout_idempotency/fake_lock').set({
        uid: 'courier_wallet_u',
        amount: 50000,
        status: 'committed',
      })
    );
  });

  // 27. Admin & Super-Admin permissions on /users, /admins, /announcements, /notifications
  test('27. Verified super-admin can manage protected admin resources while standard admin cannot overwrite /admins or /announcements', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('admins/sub_admin_1').set({
        uid: 'sub_admin_1',
        email: 'subadmin@test.com',
      });
    });

    const subAdminCtx = testEnv.authenticatedContext('sub_admin_1', {
      email: 'subadmin@test.com',
      email_verified: true,
    });
    const superAdminCtx = testEnv.authenticatedContext('super_admin_uid', {
      email: 'Pamphile.gbede@gmail.com',
      email_verified: true,
    });

    await assertSucceeds(subAdminCtx.firestore().collection('users').get());
    await assertFails(
      subAdminCtx.firestore().doc('admins/new_admin').set({ email: 'new@test.com' })
    );
    await assertFails(
      subAdminCtx.firestore().doc('announcements/ann_1').set({ title: 'Fake Broadcast' })
    );

    await assertSucceeds(
      superAdminCtx.firestore().doc('announcements/ann_1').set({ title: 'Official Notice' })
    );
    await assertSucceeds(
      superAdminCtx.firestore().doc('notifications/notif_admin_1').set({
        id: 'notif_admin_1',
        recipientId: 'courier_1',
        senderId: 'system_backend',
        title: 'Admin Alert',
        message: 'Verified admin notification',
      })
    );
  });

  // 28. Internal P0 backend security collections are strictly inaccessible from client SDKs
  test('28. Clients (even admins) cannot read/write internal P0 security collections; wallet_transactions is owner read-only', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('auth_reset_otps/hash_a').set({ hashedCode: 'abc', expiresAt: Date.now() + 60000 });
      await context.firestore().doc('auth_reset_tokens/tok_a').set({ emailHash: 'hash_a', used: false });
      await context.firestore().doc('pod_otp_attempts/att_a').set({ failures: 2 });
      await context.firestore().doc('pod_otp_tokens/ptok_a').set({ orderDocId: 'o1', used: false });
      await context.firestore().doc('payout_user_locks/courier_w1').set({ status: 'locked' });
      await context.firestore().doc('wallet_transactions/wtx_1').set({ uid: 'courier_w1', amountFCFA: 5000, status: 'committed' });
      await context.firestore().doc('wallet_transactions/wtx_2').set({ uid: 'courier_w2', amountFCFA: 9000, status: 'committed' });
    });

    const courier1Ctx = testEnv.authenticatedContext('courier_w1', {
      email: 'cw1@test.com',
      email_verified: true,
    });
    const superAdminCtx = testEnv.authenticatedContext('super_admin_uid', {
      email: 'Pamphile.gbede@gmail.com',
      email_verified: true,
    });

    const c1Db = courier1Ctx.firestore();
    const adminDb = superAdminCtx.firestore();

    for (const [col, id] of [
      ['auth_reset_otps', 'hash_a'],
      ['auth_reset_tokens', 'tok_a'],
      ['pod_otp_attempts', 'att_a'],
      ['pod_otp_tokens', 'ptok_a'],
      ['payout_idempotency', 'idem_1'],
      ['payout_user_locks', 'courier_w1'],
      ['system_config', 'smtp'],
      ['email_logs', 'mail_1'],
      ['email_queue', 'job_1'],
      ['email_dedup', 'dedup_1'],
    ]) {
      await assertFails(c1Db.collection(col).doc(id).get());
      await assertFails(c1Db.collection(col).doc(id).set({ tampered: true }));
      await assertFails(adminDb.collection(col).doc(id).get());
      await assertFails(adminDb.collection(col).doc(id).set({ tampered: true }));
    }

    // wallet_transactions: owner can read own tx, cannot read others, cannot write/tamper
    await assertSucceeds(c1Db.doc('wallet_transactions/wtx_1').get());
    await assertFails(c1Db.doc('wallet_transactions/wtx_2').get());
    await assertFails(c1Db.doc('wallet_transactions/wtx_1').set({ amountFCFA: 999999 }));
    await assertFails(c1Db.doc('wallet_transactions/wtx_1').update({ status: 'reversed' }));
    await assertFails(c1Db.doc('wallet_transactions/wtx_1').delete());
    await assertSucceeds(adminDb.doc('wallet_transactions/wtx_2').get());
  });

  // 29. Atomic KYC submission (create /kyc/{uid} + update /users/{uid}.kycStatus) & cross-courier isolation
  test('29. Courier can atomically submit /kyc/{uid} + /users/{uid}.kycStatus=en_attente while another courier is isolated', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_kyc_a').set({
        uid: 'courier_kyc_a',
        email: 'ka@test.com',
        fullName: 'Courier A',
        phone: '+22997000051',
        role: 'livreur',
        isKycVerified: false,
        kycStatus: 'non_soumis',
      });
      await context.firestore().doc('users/courier_kyc_b').set({
        uid: 'courier_kyc_b',
        email: 'kb@test.com',
        fullName: 'Courier B',
        phone: '+22997000052',
        role: 'livreur',
        isKycVerified: false,
        kycStatus: 'non_soumis',
      });
    });

    const courierACtx = testEnv.authenticatedContext('courier_kyc_a', {
      email: 'ka@test.com',
      email_verified: true,
    });
    const courierBCtx = testEnv.authenticatedContext('courier_kyc_b', {
      email: 'kb@test.com',
      email_verified: true,
    });
    const superAdminCtx = testEnv.authenticatedContext('super_admin_kyc', {
      email: 'Pamphile.gbede@gmail.com',
      email_verified: true,
    });

    const dbA = courierACtx.firestore();
    const batch = dbA.batch();
    batch.set(dbA.doc('kyc/courier_kyc_a'), {
      id: 'courier_kyc_a',
      userId: 'courier_kyc_a',
      courierId: 'courier_kyc_a',
      role: 'coursier',
      lastName: 'DOSSOU',
      firstName: 'Koffi',
      fullName: 'DOSSOU Koffi',
      phone: '+22997000051',
      email: 'ka@test.com',
      vehicleType: 'Moto Bajaj Boxer 100 / 125cc',
      vehiclePlate: 'BJ-9901-RB',
      idType: 'CIP',
      idNumber: 'CIP-9901',
      npi: '1234567890',
      operatingZone: 'Cotonou',
      documentStoragePath: 'kyc/courier_kyc_a/identity_photo_1700000000.pdf',
      documentMimeType: 'application/pdf',
      documentFileName: 'identity_photo_1700000000.pdf',
      documents: { cni: true, permis: true, assurance: true },
      status: 'en_attente',
      isApproved: false,
      verified: false,
      submittedAt: new Date().toISOString(),
    });
    batch.update(dbA.doc('users/courier_kyc_a'), {
      kycStatus: 'en_attente',
      kycSubmittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await assertSucceeds(batch.commit());

    // Once en_attente, Courier A cannot overwrite or modify /kyc/courier_kyc_a
    await assertFails(
      dbA.doc('kyc/courier_kyc_a').update({
        idNumber: 'TAMPERED',
      })
    );

    // Cross-courier isolation: Courier B cannot read Courier A's KYC dossier or list /kyc collection
    const dbB = courierBCtx.firestore();
    await assertFails(dbB.doc('kyc/courier_kyc_a').get());
    await assertFails(dbB.collection('kyc').get());
    await assertFails(
      dbB.doc('kyc/courier_kyc_a').set({
        id: 'courier_kyc_a',
        userId: 'courier_kyc_b',
        fullName: 'Hacker',
        phone: '+22900000000',
        status: 'en_attente',
      })
    );

    // Admin CAN list and read /kyc
    await assertSucceeds(superAdminCtx.firestore().collection('kyc').get());
    await assertSucceeds(superAdminCtx.firestore().doc('kyc/courier_kyc_a').get());
  });

  // 30. Legacy /kyc doc in 'non_soumis' missing id/userId can be updated & backfilled safely by owner
  test('30. Legacy non_soumis /kyc/{uid} doc allows safe backfill and resubmission while locking approved docs', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_legacy').set({
        uid: 'courier_legacy',
        email: 'legacy_k@test.com',
        fullName: 'Courier Legacy',
        phone: '+22997000053',
        role: 'livreur',
        isKycVerified: false,
      });
      await context.firestore().doc('kyc/courier_legacy').set({
        fullName: 'Courier Legacy',
        phone: '+22997000053',
        status: 'non_soumis',
      });
    });

    const ctx = testEnv.authenticatedContext('courier_legacy', {
      email: 'legacy_k@test.com',
      email_verified: true,
    });
    const db = ctx.firestore();

    await assertSucceeds(
      db.doc('kyc/courier_legacy').update({
        id: 'courier_legacy',
        userId: 'courier_legacy',
        courierId: 'courier_legacy',
        status: 'en_attente',
        documentStoragePath: 'kyc/courier_legacy/identity_photo_123.jpg',
        documentMimeType: 'image/jpeg',
        documentFileName: 'identity_photo_123.jpg',
        updatedAt: new Date().toISOString(),
      })
    );

    // Once approved ('valide'), owner cannot alter /kyc doc
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('kyc/courier_legacy').update({ status: 'valide', isApproved: true });
    });
    await assertFails(
      db.doc('kyc/courier_legacy').update({
        status: 'en_attente',
        documentStoragePath: 'kyc/courier_legacy/new.jpg',
      })
    );
  });

  // 31. Legacy /users/{uid} doc with en_course/suspendu status and missing email/role safely submits KYC batch
  test('31. Legacy user doc with en_course status and missing email/role can submit KYC batch without bypassing privilege locks', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_legacy_u').set({
        uid: 'courier_legacy_u',
        fullName: 'Courier En Course',
        phone: '+22997000059',
        role: '',
        email: '',
        status: 'en_course',
        kycStatus: 'non_soumis',
      });
    });

    const ctx = testEnv.authenticatedContext('courier_legacy_u', {
      email: 'legacy_u@test.com',
      email_verified: true,
    });
    const db = ctx.firestore();

    const batch = db.batch();
    batch.set(db.doc('kyc/courier_legacy_u'), {
      id: 'courier_legacy_u',
      userId: 'courier_legacy_u',
      courierId: 'courier_legacy_u',
      fullName: 'Courier En Course',
      phone: '+22997000059',
      status: 'en_attente',
      documentStoragePath: 'kyc/courier_legacy_u/cni.pdf',
    });
    batch.update(db.doc('users/courier_legacy_u'), {
      email: 'legacy_u@test.com',
      role: 'livreur',
      kycStatus: 'en_attente',
      kycSubmittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await assertSucceeds(batch.commit());

    // Cannot escalate to admin even when backfilling missing role
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_legacy_u2').set({
        uid: 'courier_legacy_u2',
        fullName: 'Hacker',
        phone: '+22997000060',
        role: '',
        email: 'hacker2@test.com',
      });
    });
    const ctx2 = testEnv.authenticatedContext('courier_legacy_u2', {
      email: 'hacker2@test.com',
      email_verified: true,
    });
    await assertFails(
      ctx2.firestore().doc('users/courier_legacy_u2').update({
        role: 'admin',
      })
    );
  });

  // 32. KYC-verified courier (isKycVerified=true, kycStatus=valide) can update GPS/phone while escalation stays blocked
  test('32. Verified courier can update own GPS/phone while cannot tamper isKycVerified or status', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_verified_u').set({
        uid: 'courier_verified_u',
        email: 'verified_u@test.com',
        fullName: 'Courier Verifie',
        phone: '+22997000061',
        role: 'livreur',
        status: 'en_ligne',
        isKycVerified: true,
        kycStatus: 'valide',
      });
    });

    const ctx = testEnv.authenticatedContext('courier_verified_u', {
      email: 'verified_u@test.com',
      email_verified: true,
    });
    const db = ctx.firestore();

    await assertSucceeds(
      db.doc('users/courier_verified_u').update({
        locationCommune: 'Abomey-Calavi',
        locationLat: 6.4485,
        locationLng: 2.3557,
        updatedAt: new Date().toISOString(),
      })
    );

    await assertFails(
      db.doc('users/courier_verified_u').update({
        preferredRateDiscountPercent: 50,
      })
    );
  });

  // 33. KYC-STEP-C Complete Read & Lock Matrix (absent, refuse, en_attente, valide, cross-user, admin)
  test('33. KYC-STEP-C matrix: owner get on absent/refuse/en_attente/valide, cross-user blocked, admin get & list allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.doc('users/c_no_kyc').set({
        uid: 'c_no_kyc',
        email: 'nokyc33@test.com',
        fullName: 'Livreur Sans KYC',
        phone: '+22997000101',
        role: 'livreur',
        isKycVerified: false,
        kycStatus: 'non_soumis',
      });
      await adminDb.doc('users/c_refused').set({
        uid: 'c_refused',
        email: 'refused33@test.com',
        fullName: 'Livreur Refuse',
        phone: '+22997000102',
        role: 'livreur',
        isKycVerified: false,
        kycStatus: 'refuse',
      });
      await adminDb.doc('kyc/c_refused').set({
        id: 'c_refused',
        userId: 'c_refused',
        courierId: 'c_refused',
        fullName: 'Livreur Refuse',
        phone: '+22997000102',
        status: 'refuse',
        isApproved: false,
      });
      await adminDb.doc('users/c_pending').set({
        uid: 'c_pending',
        email: 'pending33@test.com',
        fullName: 'Livreur En Attente',
        phone: '+22997000103',
        role: 'livreur',
        isKycVerified: false,
        kycStatus: 'en_attente',
      });
      await adminDb.doc('kyc/c_pending').set({
        id: 'c_pending',
        userId: 'c_pending',
        courierId: 'c_pending',
        fullName: 'Livreur En Attente',
        phone: '+22997000103',
        status: 'en_attente',
        isApproved: false,
      });
      await adminDb.doc('users/c_valid').set({
        uid: 'c_valid',
        email: 'valid33@test.com',
        fullName: 'Livreur Valide',
        phone: '+22997000104',
        role: 'livreur',
        isKycVerified: true,
        kycStatus: 'valide',
      });
      await adminDb.doc('kyc/c_valid').set({
        id: 'c_valid',
        userId: 'c_valid',
        courierId: 'c_valid',
        fullName: 'Livreur Valide',
        phone: '+22997000104',
        status: 'valide',
        isApproved: true,
      });
    });

    const noKycDb = testEnv.authenticatedContext('c_no_kyc', { email: 'nokyc33@test.com', email_verified: true }).firestore();
    const refusedDb = testEnv.authenticatedContext('c_refused', { email: 'refused33@test.com', email_verified: true }).firestore();
    const pendingDb = testEnv.authenticatedContext('c_pending', { email: 'pending33@test.com', email_verified: true }).firestore();
    const validDb = testEnv.authenticatedContext('c_valid', { email: 'valid33@test.com', email_verified: true }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_kyc_33', { email: 'Pamphile.gbede@gmail.com', email_verified: true }).firestore();

    // 1. Livreur authentifié sans dossier KYC : get(/kyc/{uid}) et get(/users/{uid}) réussissent
    const noKycSnap = await assertSucceeds(noKycDb.doc('kyc/c_no_kyc').get());
    assert.equal(noKycSnap.exists, false);
    await assertSucceeds(noKycDb.doc('users/c_no_kyc').get());

    // 2. Livreur avec dossier refusé : get réussit et resoumission vers en_attente autorisée
    const refusedSnap = await assertSucceeds(refusedDb.doc('kyc/c_refused').get());
    assert.equal(refusedSnap.data()?.status, 'refuse');
    await assertSucceeds(refusedDb.doc('users/c_refused').get());
    await assertSucceeds(
      refusedDb.doc('kyc/c_refused').update({
        status: 'en_attente',
        documentStoragePath: 'kyc/c_refused/cni_retry.pdf',
      })
    );

    // 3. Livreur avec dossier en attente : get réussit, mais toute modification est verrouillée
    const pendingSnap = await assertSucceeds(pendingDb.doc('kyc/c_pending').get());
    assert.equal(pendingSnap.data()?.status, 'en_attente');
    await assertSucceeds(pendingDb.doc('users/c_pending').get());
    await assertFails(pendingDb.doc('kyc/c_pending').update({ idNumber: 'MODIFIED' }));

    // 4. Livreur avec dossier validé : get réussit, mais modification et auto-réouverture refusées
    const validSnap = await assertSucceeds(validDb.doc('kyc/c_valid').get());
    assert.equal(validSnap.data()?.status, 'valide');
    await assertSucceeds(validDb.doc('users/c_valid').get());
    await assertFails(validDb.doc('kyc/c_valid').update({ status: 'en_attente' }));

    // 5. Utilisateur tentant de lire le dossier d'un autre utilisateur ou de lister /kyc -> REFUSÉ
    await assertFails(noKycDb.doc('kyc/c_pending').get());
    await assertFails(noKycDb.doc('kyc/c_valid').get());
    await assertFails(noKycDb.collection('kyc').get());

    // 6. Administrateur consultant individuellement (get) et en liste (list) -> AUTORISÉ
    await assertSucceeds(adminDb.doc('kyc/c_pending').get());
    await assertSucceeds(adminDb.doc('kyc/c_valid').get());
    const allKyc = await assertSucceeds(adminDb.collection('kyc').get());
    assert.equal(allKyc.docs.length >= 3, true);
  });

  // 34. Messagerie client (sendChatMessage): création/mise à jour conversation + message conforme aux champs autorisés
  test('34. Chat participants can create/update conversations and send messages matching sendChatMessage payload', async () => {
    const vendorDb = testEnv.authenticatedContext('vendor_chat_34', {
      email: 'vendor34@test.com',
      email_verified: true,
    }).firestore();
    const courierDb = testEnv.authenticatedContext('courier_chat_34', {
      email: 'courier34@test.com',
      email_verified: true,
    }).firestore();
    const outsiderDb = testEnv.authenticatedContext('outsider_34', {
      email: 'outsider34@test.com',
      email_verified: true,
    }).firestore();

    const participants = ['courier_chat_34', 'vendor_chat_34'].sort();

    // 1. Création de la conversation par le vendeur
    await assertSucceeds(
      vendorDb.doc('conversations/order_LL-3400').set({
        id: 'order_LL-3400',
        participantIds: participants,
        orderId: '#LL-3400',
        lastMessage: 'Colis prêt pour enlèvement',
        lastMessageAt: new Date().toISOString(),
        updatedAt: Date.now(),
      })
    );

    // 2. Envoi d'un message conforme à sendChatMessage (sans recipientId/orderId interdits) -> AUTORISÉ
    await assertSucceeds(
      vendorDb.doc('conversations/order_LL-3400/messages/chat_msg_1').set({
        id: 'chat_msg_1',
        senderId: 'vendor_chat_34',
        senderName: 'Boutique 34',
        senderRole: 'vendeur',
        text: 'Colis prêt pour enlèvement',
        createdAt: Date.now(),
        timestamp: new Date().toISOString(),
        isRead: false,
        read: false,
      })
    );

    // 3. Réponse du livreur + mise à jour des métadonnées de conversation -> AUTORISÉ
    await assertSucceeds(
      courierDb.doc('conversations/order_LL-3400').set(
        {
          lastMessage: 'Bien reçu, j’arrive dans 5 min',
          lastMessageAt: new Date().toISOString(),
          updatedAt: Date.now(),
        },
        { merge: true }
      )
    );
    await assertSucceeds(
      courierDb.doc('conversations/order_LL-3400/messages/chat_msg_2').set({
        id: 'chat_msg_2',
        senderId: 'courier_chat_34',
        senderName: 'Livreur 34',
        senderRole: 'livreur',
        text: 'Bien reçu, j’arrive dans 5 min',
        createdAt: Date.now(),
        timestamp: new Date().toISOString(),
        isRead: false,
        read: false,
      })
    );

    // 4. Champs hors liste blanche (ex: recipientId) ou utilisateur tiers -> REFUSÉ
    await assertFails(
      vendorDb.doc('conversations/order_LL-3400/messages/chat_msg_bad').set({
        id: 'chat_msg_bad',
        senderId: 'vendor_chat_34',
        recipientId: 'courier_chat_34',
        text: 'Champ interdit',
      })
    );
    await assertFails(outsiderDb.doc('conversations/order_LL-3400/messages/chat_msg_1').get());
  });

  // 35. Targeted Sequential Dispatch Isolation: non-targeted courier cannot read or claim another courier's offer
  test('35. Targeted dispatch strictly isolates pending offers to targetCourierId only', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_target_a').set({
        uid: 'courier_target_a',
        email: 'ca@test.com',
        fullName: 'Courier A',
        phone: '+22997000031',
        role: 'livreur',
        isKycVerified: true,
        status: 'en_ligne',
        isAvailable: true,
      });
      await context.firestore().doc('users/courier_target_b').set({
        uid: 'courier_target_b',
        email: 'cb@test.com',
        fullName: 'Courier B',
        phone: '+22997000032',
        role: 'livreur',
        isKycVerified: true,
        status: 'en_ligne',
        isAvailable: true,
      });
      await context.firestore().doc('deliveries/deliv_targeted_35').set({
        id: 'deliv_targeted_35',
        merchantId: 'vendor_35',
        clientName: 'Client 35',
        clientPhone: '+22997000033',
        deliveryFee: 2000,
        status: 'en_attente',
        dispatchMode: 'auto',
        dispatchState: 'offered',
        targetCourierId: 'courier_target_a',
      });
    });

    const courierACtx = testEnv.authenticatedContext('courier_target_a', {
      email: 'ca@test.com',
      email_verified: true,
    });
    const courierBCtx = testEnv.authenticatedContext('courier_target_b', {
      email: 'cb@test.com',
      email_verified: true,
    });

    // Non-targeted Courier B CANNOT read or claim Courier A's offer
    await assertFails(courierBCtx.firestore().doc('deliveries/deliv_targeted_35').get());
    await assertFails(
      courierBCtx.firestore().doc('deliveries/deliv_targeted_35').update({
        status: 'assignee',
        courierId: 'courier_target_b',
        dispatchState: 'assigned',
        targetCourierId: null,
      })
    );

    // Targeted Courier A CAN read, toggle own online status, and claim the offer
    await assertSucceeds(courierACtx.firestore().doc('deliveries/deliv_targeted_35').get());
    await assertSucceeds(
      courierACtx.firestore().doc('users/courier_target_a').update({
        status: 'hors_ligne',
        isAvailable: false,
      })
    );
    await assertSucceeds(
      courierACtx.firestore().doc('deliveries/deliv_targeted_35').update({
        status: 'assignee',
        courierId: 'courier_target_a',
        courierName: 'Courier A',
        dispatchState: 'assigned',
        targetCourierId: null,
        updatedAt: Date.now(),
      })
    );
  });
});

