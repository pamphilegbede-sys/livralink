/**
 * Comprehensive Security Test Suite for Firestore Rules — LivraLink
 * 
 * Section 9 Required Test Scenarios (13 Total):
 * 1. Unauthenticated user cannot access protected data
 * 2. Client cannot accept a delivery
 * 3. Vendor cannot accept a delivery as a courier
 * 4. Authorized courier can accept an available mission
 * 5. Courier cannot retrieve/take over an already assigned mission
 * 6. Two couriers cannot obtain the same mission (double acceptance guard)
 * 7. User cannot modify their own role after creation
 * 8. User cannot become an administrator
 * 9. User cannot read personal client PII without authorization
 * 10. User cannot send fraudulent notifications (spoofing senderId or system types)
 * 11. User cannot read conversations they are not part of
 * 12. User cannot modify sender identity of a message
 * 13. Legitimate operations by Vendors, Couriers, and Admins continue working
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';

let testEnv: RulesTestEnvironment;

const PROJECT_ID = 'ai-studio-livralink-security-test';

describe('LivraLink 13-Point Complete Security Rules Test Suite', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
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
        role: 'vendeur',
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

  // 4. Authorized courier can accept an available mission
  test('4. Authorized courier can accept an available mission', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('users/courier_1').set({
        uid: 'courier_1',
        email: 'courier@test.com',
        fullName: 'Livreur Test',
        phone: '+22997000003',
        role: 'livreur',
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

    // Registering as admin
    await assertFails(
      db.doc('users/hacker_admin').set({
        uid: 'hacker_admin',
        email: 'hacker@test.com',
        fullName: 'Hacker',
        phone: '+22997000007',
        role: 'admin',
      })
    );

    // Creating document in /admins
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

  // 10. User cannot send fraudulent notifications
  test('10. User cannot omit senderId or spoof senderId or create system type notification', async () => {
    const userCtx = testEnv.authenticatedContext('user_notif_tester', {
      email: 'user_n@test.com',
      email_verified: true,
    });
    const db = userCtx.firestore();

    // Omitting senderId
    await assertFails(
      db.doc('notifications/n_1').set({
        id: 'n_1',
        recipientId: 'victim_1',
        title: 'Alert',
        message: 'Hello',
      })
    );

    // Spoofing senderId
    await assertFails(
      db.doc('notifications/n_2').set({
        id: 'n_2',
        recipientId: 'victim_1',
        senderId: 'admin_god',
        title: 'Alert',
        message: 'Hello',
      })
    );

    // Using system type
    await assertFails(
      db.doc('notifications/n_3').set({
        id: 'n_3',
        recipientId: 'victim_1',
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
        senderId: 'courier_1', // Trying to forge courier_1 identity
        text: 'I am giving up this order',
      })
    );
  });

  // 13. Legitimate operations continue working
  test('13. Legitimate vendor, courier, and admin operations succeed', async () => {
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
      });
    });

    const vendorCtx = testEnv.authenticatedContext('vendor_ok', {
      email: 'vendor@ok.com',
      email_verified: true,
    });
    const vendorDb = vendorCtx.firestore();

    // Create legitimate mission
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

    // Accept mission
    await assertSucceeds(
      courierDb.doc('priority_missions/m_ok').update({
        status: 'acceptee',
        courierId: 'courier_ok',
        courierName: 'Courier OK',
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

    // Courier attempts to delete mission
    await assertFails(courierDb.doc('priority_missions/m_del').delete());
  });

  // 15. Notification recipient can only update read status, cannot tamper with sender or title
  test('15. Notification recipient can only update isRead and cannot modify title or senderId', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context.firestore().doc('notifications/notif_test').set({
        id: 'notif_test',
        recipientId: 'user_target',
        senderId: 'vendor_ok',
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

    // Malicious update: trying to change title or senderId
    await assertFails(
      db.doc('notifications/notif_test').update({
        isRead: true,
        title: 'Tampered Title',
      })
    );

    // Legitimate update: marking as read
    await assertSucceeds(
      db.doc('notifications/notif_test').update({
        isRead: true,
      })
    );
  });
});
