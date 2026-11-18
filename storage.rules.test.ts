/**
 * Security Test Suite for Firebase Storage Rules — LivraLink
 *
 * Uses Firebase Storage Emulator + Firestore Emulator (named DB:
 * ai-studio-livralink-f9d2844b-bf6d-492f-9504-2721bd1820b6) to test real
 * cross-service rules evaluation for:
 * - /avatars/{userId}/{fileName}
 * - /kyc/{userId}/{fileName}
 * - /pod/{orderId}/{fileName}
 * - /chat/{conversationId}/{fileName}
 */

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

import { describe, test, before, after, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import * as fs from 'node:fs';

let testEnv: RulesTestEnvironment;
let adminNamedDb: Firestore;

const PROJECT_ID = 'ai-studio-livralink-storage-test';
const NAMED_DB_ID = 'ai-studio-livralink-f9d2844b-bf6d-492f-9504-2721bd1820b6';

async function clearNamedFirestoreEmulator() {
  const res = await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/${NAMED_DB_ID}/documents`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    throw new Error(`Failed to clear named Firestore emulator: ${res.status}`);
  }
}

describe('LivraLink Firebase Storage Security Rules Test Suite', () => {
  before(async () => {
    const adminApp =
      getApps().find((a) => a.name === 'storage-rules-test-admin') ||
      initializeApp({ projectId: PROJECT_ID }, 'storage-rules-test-admin');
    adminNamedDb = getFirestore(adminApp, NAMED_DB_ID);

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
      storage: {
        rules: fs.readFileSync('storage.rules', 'utf8'),
        host: '127.0.0.1',
        port: 9199,
      },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearStorage();
    await clearNamedFirestoreEmulator();
  });

  test('1. Unauthenticated access to any Storage path is strictly denied', async () => {
    const unauthStorage = testEnv.unauthenticatedContext().storage();
    await assertFails(unauthStorage.ref('avatars/user_1/avatar.png').getDownloadURL());
    await assertFails(
      unauthStorage.ref('avatars/user_1/avatar.png').putString('abc', 'raw', {
        contentType: 'image/png',
      })
    );
    await assertFails(unauthStorage.ref('kyc/user_1/cni.png').getDownloadURL());
    await assertFails(unauthStorage.ref('pod/order_1/photo.jpg').getDownloadURL());
  });

  test('2. Avatars: owner can upload valid image with uploadedBy metadata; non-owner blocked', async () => {
    const ownerStorage = testEnv
      .authenticatedContext('user_1', { email: 'u1@test.com', email_verified: true })
      .storage();
    const otherStorage = testEnv
      .authenticatedContext('user_2', { email: 'u2@test.com', email_verified: true })
      .storage();

    await assertSucceeds(
      ownerStorage.ref('avatars/user_1/avatar.png').put(Buffer.from('fake-png-bytes'), {
        contentType: 'image/png',
        customMetadata: { uploadedBy: 'user_1' },
      })
    );

    // Non-owner cannot overwrite
    await assertFails(
      otherStorage.ref('avatars/user_1/avatar2.png').put(Buffer.from('fake-png-bytes'), {
        contentType: 'image/png',
        customMetadata: { uploadedBy: 'user_2' },
      })
    );

    // Owner without uploadedBy metadata is blocked
    await assertFails(
      ownerStorage.ref('avatars/user_1/no_meta.png').put(Buffer.from('fake-png-bytes'), {
        contentType: 'image/png',
      })
    );
  });

  test('3. KYC docs: supports JPG/PNG/WebP/PDF, enforces email_verified, uploadedBy, <10MB, status gating & cross-courier isolation', async () => {
    const courierStorage = testEnv
      .authenticatedContext('courier_kyc_1', { email: 'ck@test.com', email_verified: true })
      .storage();
    const unverifiedCourierStorage = testEnv
      .authenticatedContext('courier_unverified', { email: 'unv@test.com', email_verified: false })
      .storage();
    const outsiderStorage = testEnv
      .authenticatedContext('outsider_1', { email: 'out@test.com', email_verified: true })
      .storage();
    const superAdminStorage = testEnv
      .authenticatedContext('super_admin', {
        email: 'Pamphile.gbede@gmail.com',
        email_verified: true,
      })
      .storage();

    // Test 1, 2, 3: Owner uploads JPG, PNG, WebP, and PDF with valid uploadedBy metadata
    await assertSucceeds(
      courierStorage.ref('kyc/courier_kyc_1/cni.jpg').put(Buffer.from('jpg-bytes'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );
    await assertSucceeds(
      courierStorage.ref('kyc/courier_kyc_1/cni.png').put(Buffer.from('png-bytes'), {
        contentType: 'image/png',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );
    await assertSucceeds(
      courierStorage.ref('kyc/courier_kyc_1/cni.webp').put(Buffer.from('webp-bytes'), {
        contentType: 'image/webp',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );
    await assertSucceeds(
      courierStorage.ref('kyc/courier_kyc_1/cni.pdf').put(Buffer.from('%PDF-1.4\n1 0 obj'), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );

    // Test 5: Unverified email cannot upload KYC documents
    await assertFails(
      unverifiedCourierStorage.ref('kyc/courier_unverified/cni.jpg').put(Buffer.from('jpg-bytes'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_unverified' },
      })
    );

    // Test 6: Invalid MIME type (text/plain) and oversized (>=10MB) rejected
    await assertFails(
      courierStorage.ref('kyc/courier_kyc_1/script.txt').put(Buffer.from('hello'), {
        contentType: 'text/plain',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );
    await assertFails(
      courierStorage.ref('kyc/courier_kyc_1/too_big.jpg').put(Buffer.alloc(10 * 1024 * 1024 + 1), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );

    // Test 7: Forged or missing uploadedBy metadata rejected
    await assertFails(
      courierStorage.ref('kyc/courier_kyc_1/forged.jpg').put(Buffer.from('jpg-bytes'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'another_uid' },
      })
    );
    await assertFails(
      courierStorage.ref('kyc/courier_kyc_1/missing_meta.jpg').put(Buffer.from('jpg-bytes'), {
        contentType: 'image/jpeg',
      })
    );

    // Test 16: Outsider cannot upload into another user's KYC folder
    await assertFails(
      outsiderStorage.ref('kyc/courier_kyc_1/hack.jpg').put(Buffer.from('jpg-bytes'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'outsider_1' },
      })
    );

    // When dossier is 'non_soumis', owner can still upload
    await adminNamedDb.doc('kyc/courier_kyc_1').set({
      id: 'courier_kyc_1',
      userId: 'courier_kyc_1',
      fullName: 'Courier KYC',
      phone: '+22997000010',
      status: 'non_soumis',
    });
    await assertSucceeds(
      courierStorage.ref('kyc/courier_kyc_1/cni_draft.pdf').put(Buffer.from('%PDF-1.4'), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );

    // Set KYC dossier to en_attente in named Firestore DB
    await adminNamedDb.doc('kyc/courier_kyc_1').update({ status: 'en_attente' });

    // Once en_attente, owner cannot upload another doc or delete existing ones
    await assertFails(
      courierStorage.ref('kyc/courier_kyc_1/cni_new.jpg').put(Buffer.from('jpg-bytes'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );
    await assertFails(courierStorage.ref('kyc/courier_kyc_1/cni.jpg').delete());

    // Once 'valide', owner is also blocked from uploading new files
    await adminNamedDb.doc('kyc/courier_kyc_1').update({ status: 'valide' });
    await assertFails(
      courierStorage.ref('kyc/courier_kyc_1/cni_after_valide.jpg').put(Buffer.from('jpg-bytes'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );

    // Test 15: After rejection ('refuse'), owner CAN upload new justification document
    await adminNamedDb.doc('kyc/courier_kyc_1').update({ status: 'refuse' });
    await assertSucceeds(
      courierStorage.ref('kyc/courier_kyc_1/cni_resubmit.pdf').put(Buffer.from('%PDF-1.4\nresub'), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );

    // Owner and Super-Admin can read/inspect; other courier/outsider strictly denied
    await assertSucceeds(courierStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertSucceeds(superAdminStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertFails(outsiderStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertFails(outsiderStorage.ref('kyc/courier_kyc_1/cni.jpg').getDownloadURL());
  });

  test('4. POD proofs: only KYC-verified assigned courier during active transit can create; participants can read; non-participants blocked', async () => {
    await adminNamedDb.doc('users/courier_verified').set({
      uid: 'courier_verified',
      email: 'cv@test.com',
      fullName: 'Verified Courier',
      phone: '+22997000040',
      role: 'livreur',
      isKycVerified: true,
    });
    await adminNamedDb.doc('users/courier_unverified').set({
      uid: 'courier_unverified',
      email: 'cu@test.com',
      fullName: 'Unverified Courier',
      phone: '+22997000041',
      role: 'livreur',
      isKycVerified: false,
    });
    await adminNamedDb.doc('deliveries/order_pod_1').set({
      id: 'order_pod_1',
      merchantId: 'vendor_pod_1',
      courierId: 'courier_verified',
      clientName: 'Client POD',
      clientPhone: '+22997000042',
      deliveryFee: 1500,
      status: 'en_cours',
    });

    const assignedCourierStorage = testEnv
      .authenticatedContext('courier_verified', { email: 'cv@test.com', email_verified: true })
      .storage();
    const unverifiedCourierStorage = testEnv
      .authenticatedContext('courier_unverified', { email: 'cu@test.com', email_verified: true })
      .storage();
    const vendorStorage = testEnv
      .authenticatedContext('vendor_pod_1', { email: 'vp@test.com', email_verified: true })
      .storage();
    const outsiderStorage = testEnv
      .authenticatedContext('outsider_pod', { email: 'op@test.com', email_verified: true })
      .storage();

    // Unverified or unassigned courier cannot upload POD
    await assertFails(
      unverifiedCourierStorage.ref('pod/order_pod_1/photo.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_unverified' },
      })
    );

    // Assigned KYC-verified courier CAN upload POD photo during en_cours
    await assertSucceeds(
      assignedCourierStorage.ref('pod/order_pod_1/photo.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_verified' },
      })
    );

    // Vendor participant can read POD photo; outsider cannot
    await assertSucceeds(vendorStorage.ref('pod/order_pod_1/photo.jpg').getMetadata());
    await assertFails(outsiderStorage.ref('pod/order_pod_1/photo.jpg').getMetadata());

    // Courier cannot delete uploaded POD proof
    await assertFails(assignedCourierStorage.ref('pod/order_pod_1/photo.jpg').delete());

    // Once delivered ('livree'), even assigned courier cannot upload new POD proof
    await adminNamedDb.doc('deliveries/order_pod_1').update({ status: 'livree' });
    await assertFails(
      assignedCourierStorage.ref('pod/order_pod_1/photo_late.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_verified' },
      })
    );
  });

  test('5. Chat media: only conversation participants can read and upload', async () => {
    await adminNamedDb.doc('conversations/conv_media_1').set({
      participantIds: ['vendor_chat_1', 'courier_chat_1'],
    });

    const vendorStorage = testEnv
      .authenticatedContext('vendor_chat_1', { email: 'vc@test.com', email_verified: true })
      .storage();
    const outsiderStorage = testEnv
      .authenticatedContext('outsider_chat', { email: 'oc@test.com', email_verified: true })
      .storage();

    await assertSucceeds(
      vendorStorage.ref('chat/conv_media_1/receipt.pdf').put(Buffer.from('%PDF-1.4'), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'vendor_chat_1' },
      })
    );
    await assertSucceeds(vendorStorage.ref('chat/conv_media_1/receipt.pdf').getMetadata());

    await assertFails(
      outsiderStorage.ref('chat/conv_media_1/spam.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'outsider_chat' },
      })
    );
    await assertFails(outsiderStorage.ref('chat/conv_media_1/receipt.pdf').getMetadata());
  });
});
