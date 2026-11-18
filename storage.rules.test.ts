/**
 * Security Test Suite for Firebase Storage Rules — LivraLink
 *
 * Uses Firebase Storage Emulator to test production-compatible Storage Rules
 * (zero cross-service named-DB Firestore calls, enforced via Firebase Auth,
 * email_verified, UID path isolation, custom claims admin / kycLocked,
 * uploadedBy metadata, strict MIME types and size limits) for:
 * - /avatars/{userId}/{fileName}
 * - /kyc/{userId}/{fileName}
 * - /pod/{orderId}/{fileName}
 * - /chat/{conversationId}/{fileName}
 */

import { describe, test, before, after, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import * as fs from 'node:fs';

let testEnv: RulesTestEnvironment;

const PROJECT_ID = 'ai-studio-livralink-storage-test';

describe('LivraLink Firebase Storage Security Rules Test Suite', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
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
    await assertFails(
      unauthStorage.ref('kyc/user_1/cni.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
      })
    );
    await assertFails(unauthStorage.ref('pod/order_1/photo.jpg').getDownloadURL());
    await assertFails(unauthStorage.ref('chat/conv_1/msg.jpg').getDownloadURL());
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

  test('3. KYC docs: supports JPG/PNG/WebP/PDF, enforces email_verified, uploadedBy, <10MB, kycLocked, immutability & private isolation', async () => {
    const courierStorage = testEnv
      .authenticatedContext('courier_kyc_1', {
        email: 'ck@test.com',
        email_verified: true,
      })
      .storage();
    const lockedCourierStorage = testEnv
      .authenticatedContext('courier_kyc_1', {
        email: 'ck@test.com',
        email_verified: true,
        kycLocked: true,
      })
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
    const claimAdminStorage = testEnv
      .authenticatedContext('sub_admin', {
        email: 'admin@livralink.bj',
        email_verified: true,
        admin: true,
      })
      .storage();

    // Owner uploads JPG, PNG, WebP, and PDF with valid uploadedBy metadata
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

    // Unverified email cannot upload KYC documents
    await assertFails(
      unverifiedCourierStorage.ref('kyc/courier_unverified/cni.jpg').put(Buffer.from('jpg-bytes'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_unverified' },
      })
    );

    // Invalid MIME type (text/plain), empty file, and oversized (>=10MB) rejected
    await assertFails(
      courierStorage.ref('kyc/courier_kyc_1/script.txt').put(Buffer.from('hello'), {
        contentType: 'text/plain',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );
    await assertFails(
      courierStorage.ref('kyc/courier_kyc_1/empty.jpg').put(Buffer.alloc(0), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );
    await assertFails(
      courierStorage.ref('kyc/courier_kyc_1/too_big.jpg').put(Buffer.alloc(10 * 1024 * 1024 + 1), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );

    // Forged or missing uploadedBy metadata rejected
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

    // Outsider cannot upload into another user's KYC folder
    await assertFails(
      outsiderStorage.ref('kyc/courier_kyc_1/hack.jpg').put(Buffer.from('jpg-bytes'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'outsider_1' },
      })
    );

    // Courier cannot delete or overwrite/update existing KYC objects
    await assertFails(courierStorage.ref('kyc/courier_kyc_1/cni.jpg').delete());
    await assertFails(
      courierStorage.ref('kyc/courier_kyc_1/cni.jpg').updateMetadata({
        customMetadata: { uploadedBy: 'courier_kyc_1', tampered: 'true' },
      })
    );

    // When custom claim kycLocked is true (after admin approval), courier upload is blocked
    await assertFails(
      lockedCourierStorage.ref('kyc/courier_kyc_1/cni_after_valide.jpg').put(Buffer.from('jpg-bytes'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_kyc_1' },
      })
    );

    // Owner, Super-Admin, and claim-Admin can read/inspect; outsider strictly denied
    await assertSucceeds(courierStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertSucceeds(superAdminStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertSucceeds(claimAdminStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertFails(outsiderStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertFails(outsiderStorage.ref('kyc/courier_kyc_1/cni.jpg').getDownloadURL());
  });

  test('4. POD proofs: verified user can create image with uploadedBy; unverified/bad MIME/forged/delete blocked', async () => {
    const verifiedCourierStorage = testEnv
      .authenticatedContext('courier_verified', { email: 'cv@test.com', email_verified: true })
      .storage();
    const unverifiedStorage = testEnv
      .authenticatedContext('courier_unverified', { email: 'cu@test.com', email_verified: false })
      .storage();
    const vendorStorage = testEnv
      .authenticatedContext('vendor_pod_1', { email: 'vp@test.com', email_verified: true })
      .storage();
    const superAdminStorage = testEnv
      .authenticatedContext('super_admin', {
        email: 'Pamphile.gbede@gmail.com',
        email_verified: true,
      })
      .storage();

    // Unverified email cannot upload or read POD
    await assertFails(
      unverifiedStorage.ref('pod/order_pod_1/photo.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_unverified' },
      })
    );

    // Verified user with forged uploadedBy or invalid MIME rejected
    await assertFails(
      verifiedCourierStorage.ref('pod/order_pod_1/forged.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'someone_else' },
      })
    );
    await assertFails(
      verifiedCourierStorage.ref('pod/order_pod_1/doc.pdf').put(Buffer.from('%PDF-1.4'), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'courier_verified' },
      })
    );

    // Verified user can upload valid POD image with uploadedBy == uid
    await assertSucceeds(
      verifiedCourierStorage.ref('pod/order_pod_1/photo.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_verified' },
      })
    );

    // Verified participant can read POD photo; unverified cannot
    await assertSucceeds(vendorStorage.ref('pod/order_pod_1/photo.jpg').getMetadata());
    await assertFails(unverifiedStorage.ref('pod/order_pod_1/photo.jpg').getMetadata());

    // Non-admin cannot delete uploaded POD proof, Admin can
    await assertFails(verifiedCourierStorage.ref('pod/order_pod_1/photo.jpg').delete());
    await assertSucceeds(superAdminStorage.ref('pod/order_pod_1/photo.jpg').delete());
  });

  test('5. Chat media: verified users can upload/read valid media; unverified/bad MIME/forged/delete blocked', async () => {
    const vendorStorage = testEnv
      .authenticatedContext('vendor_chat_1', { email: 'vc@test.com', email_verified: true })
      .storage();
    const unverifiedStorage = testEnv
      .authenticatedContext('unverified_chat', { email: 'uc@test.com', email_verified: false })
      .storage();

    await assertSucceeds(
      vendorStorage.ref('chat/conv_media_1/receipt.pdf').put(Buffer.from('%PDF-1.4'), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'vendor_chat_1' },
      })
    );
    await assertSucceeds(vendorStorage.ref('chat/conv_media_1/receipt.pdf').getMetadata());

    await assertFails(
      unverifiedStorage.ref('chat/conv_media_1/spam.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'unverified_chat' },
      })
    );
    await assertFails(unverifiedStorage.ref('chat/conv_media_1/receipt.pdf').getMetadata());
    await assertFails(
      vendorStorage.ref('chat/conv_media_1/bad.exe').put(Buffer.from('exe'), {
        contentType: 'application/x-msdownload',
        customMetadata: { uploadedBy: 'vendor_chat_1' },
      })
    );
    await assertFails(vendorStorage.ref('chat/conv_media_1/receipt.pdf').delete());
  });
});
