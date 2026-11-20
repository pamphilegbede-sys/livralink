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

    // Owner can also upload JPEG/WebP, read, update, and delete own avatar; non-owner cannot delete
    await assertSucceeds(
      ownerStorage.ref('avatars/user_1/avatar_new.jpg').put(Buffer.from('fake-jpg-bytes'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'user_1' },
      })
    );
    await assertSucceeds(otherStorage.ref('avatars/user_1/avatar_new.jpg').getMetadata());
    await assertSucceeds(ownerStorage.ref('avatars/user_1/avatar_new.jpg').getDownloadURL());
    await assertFails(otherStorage.ref('avatars/user_1/avatar_new.jpg').delete());
    await assertSucceeds(ownerStorage.ref('avatars/user_1/avatar_new.jpg').delete());

    // SVG avatars are blocked to prevent stored XSS
    await assertFails(
      ownerStorage.ref('avatars/user_1/xss.svg').put(Buffer.from('<svg></svg>'), {
        contentType: 'image/svg+xml',
        customMetadata: { uploadedBy: 'user_1' },
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
    const unlockedCourierStorage = testEnv
      .authenticatedContext('courier_kyc_1', {
        email: 'ck@test.com',
        email_verified: true,
        kycLocked: false,
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
    const unverifiedSuperAdminStorage = testEnv
      .authenticatedContext('super_admin_unv', {
        email: 'pamphile.gbede@gmail.com',
        email_verified: false,
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
    await assertSucceeds(
      unlockedCourierStorage.ref('kyc/courier_kyc_1/cni_retry.pdf').put(Buffer.from('%PDF-1.4\n1 0 obj'), {
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

    // Owner, Super-Admin (verified), and claim-Admin can read/inspect; unverified Super-Admin & outsider strictly denied
    await assertSucceeds(courierStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertSucceeds(courierStorage.ref('kyc/courier_kyc_1/cni.pdf').getDownloadURL());
    await assertSucceeds(superAdminStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertSucceeds(claimAdminStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertFails(unverifiedSuperAdminStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertFails(outsiderStorage.ref('kyc/courier_kyc_1/cni.pdf').getMetadata());
    await assertFails(outsiderStorage.ref('kyc/courier_kyc_1/cni.jpg').getDownloadURL());
  });

  test('4. POD proofs: direct client read/write strictly restricted to Admin (blocking non-admin verified users); MIME/uploadedBy enforced', async () => {
    const verifiedCourierStorage = testEnv
      .authenticatedContext('courier_verified', { email: 'cv@test.com', email_verified: true })
      .storage();
    const unverifiedStorage = testEnv
      .authenticatedContext('courier_unverified', { email: 'cu@test.com', email_verified: false })
      .storage();
    const outsiderStorage = testEnv
      .authenticatedContext('outsider_pod_1', { email: 'op@test.com', email_verified: true })
      .storage();
    const superAdminStorage = testEnv
      .authenticatedContext('super_admin', {
        email: 'Pamphile.gbede@gmail.com',
        email_verified: true,
      })
      .storage();

    // Non-admin verified or unverified users cannot directly upload POD files
    await assertFails(
      unverifiedStorage.ref('pod/order_pod_1/photo.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_unverified' },
      })
    );
    await assertFails(
      verifiedCourierStorage.ref('pod/order_pod_1/photo.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_verified' },
      })
    );
    await assertFails(
      outsiderStorage.ref('pod/order_pod_1/photo.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'outsider_pod_1' },
      })
    );

    // Admin with invalid MIME or forged uploadedBy is also blocked by rules
    await assertFails(
      superAdminStorage.ref('pod/order_pod_1/doc.pdf').put(Buffer.from('%PDF-1.4'), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'super_admin' },
      })
    );
    await assertFails(
      superAdminStorage.ref('pod/order_pod_1/forged.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'someone_else' },
      })
    );

    // Super-Admin (backend Admin SDK proxy) can store POD proof with valid MIME + uploadedBy
    await assertSucceeds(
      superAdminStorage.ref('pod/order_pod_1/photo.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'super_admin' },
      })
    );

    // Direct Storage SDK read by ANY non-admin (even verified users knowing the exact path) is strictly denied
    await assertFails(outsiderStorage.ref('pod/order_pod_1/photo.jpg').getMetadata());
    await assertFails(outsiderStorage.ref('pod/order_pod_1/photo.jpg').getDownloadURL());
    await assertFails(verifiedCourierStorage.ref('pod/order_pod_1/photo.jpg').getMetadata());
    await assertFails(verifiedCourierStorage.ref('pod/order_pod_1/photo.jpg').getDownloadURL());
    await assertFails(unverifiedStorage.ref('pod/order_pod_1/photo.jpg').getMetadata());
    await assertSucceeds(superAdminStorage.ref('pod/order_pod_1/photo.jpg').getMetadata());
    await assertSucceeds(superAdminStorage.ref('pod/order_pod_1/photo.jpg').getDownloadURL());

    // Verified non-admin cannot overwrite or update metadata of existing POD file
    await assertFails(
      verifiedCourierStorage.ref('pod/order_pod_1/photo.jpg').put(Buffer.from('overwrite'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'courier_verified' },
      })
    );
    await assertFails(
      verifiedCourierStorage.ref('pod/order_pod_1/photo.jpg').updateMetadata({
        customMetadata: { uploadedBy: 'courier_verified' },
      })
    );

    // Non-admin cannot delete POD proof; Admin can
    await assertFails(verifiedCourierStorage.ref('pod/order_pod_1/photo.jpg').delete());
    await assertSucceeds(superAdminStorage.ref('pod/order_pod_1/photo.jpg').delete());
  });

  test('5. Chat media: direct client read/write strictly restricted to Admin (blocking non-admin verified users); MIME/uploadedBy enforced', async () => {
    const verifiedUserStorage = testEnv
      .authenticatedContext('vendor_chat_1', { email: 'vc@test.com', email_verified: true })
      .storage();
    const outsiderChatStorage = testEnv
      .authenticatedContext('outsider_chat_2', { email: 'oc@test.com', email_verified: true })
      .storage();
    const unverifiedStorage = testEnv
      .authenticatedContext('unverified_chat', { email: 'uc@test.com', email_verified: false })
      .storage();
    const superAdminStorage = testEnv
      .authenticatedContext('super_admin', {
        email: 'Pamphile.gbede@gmail.com',
        email_verified: true,
      })
      .storage();

    // Verified non-admins and unverified users cannot directly upload chat media
    await assertFails(
      verifiedUserStorage.ref('chat/conv_media_1/receipt.pdf').put(Buffer.from('%PDF-1.4'), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'vendor_chat_1' },
      })
    );
    await assertFails(
      unverifiedStorage.ref('chat/conv_media_1/spam.jpg').put(Buffer.from('jpg'), {
        contentType: 'image/jpeg',
        customMetadata: { uploadedBy: 'unverified_chat' },
      })
    );

    // Bad MIME blocked even for admin
    await assertFails(
      superAdminStorage.ref('chat/conv_media_1/bad.exe').put(Buffer.from('exe'), {
        contentType: 'application/x-msdownload',
        customMetadata: { uploadedBy: 'super_admin' },
      })
    );

    // Super-Admin can store valid chat media
    await assertSucceeds(
      superAdminStorage.ref('chat/conv_media_1/receipt.pdf').put(Buffer.from('%PDF-1.4'), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'super_admin' },
      })
    );

    // Direct Storage SDK read by ANY non-admin verified user or outsider (even knowing exact path) is strictly denied
    await assertFails(outsiderChatStorage.ref('chat/conv_media_1/receipt.pdf').getMetadata());
    await assertFails(outsiderChatStorage.ref('chat/conv_media_1/receipt.pdf').getDownloadURL());
    await assertFails(verifiedUserStorage.ref('chat/conv_media_1/receipt.pdf').getMetadata());
    await assertFails(verifiedUserStorage.ref('chat/conv_media_1/receipt.pdf').getDownloadURL());
    await assertFails(unverifiedStorage.ref('chat/conv_media_1/receipt.pdf').getMetadata());
    await assertSucceeds(superAdminStorage.ref('chat/conv_media_1/receipt.pdf').getMetadata());
    await assertSucceeds(superAdminStorage.ref('chat/conv_media_1/receipt.pdf').getDownloadURL());

    // Verified non-admin cannot overwrite or update metadata on existing chat file
    await assertFails(
      verifiedUserStorage.ref('chat/conv_media_1/receipt.pdf').put(Buffer.from('%PDF-1.4'), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'vendor_chat_1' },
      })
    );

    // Non-admin cannot delete chat media; Admin can
    await assertFails(verifiedUserStorage.ref('chat/conv_media_1/receipt.pdf').delete());
    await assertSucceeds(superAdminStorage.ref('chat/conv_media_1/receipt.pdf').delete());
  });
});
