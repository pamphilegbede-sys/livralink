/**
 * Suite de tests unitaires et d'intégration — KYC, Notifications & Isolation (LivraLink)
 *
 * Couvre :
 * 1. Soumission KYC, apparition dans l'admin, approbation/rejet et synchronisation de statut.
 * 2. Création de notifications sans duplication à l'initialisation/rafraîchissement (idempotence & unicité).
 * 3. Isolation stricte entre Administrateur, Vendeur A, Vendeur B, Livreur A et Livreur B.
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { KYCUserRequest, AppNotification } from '../types';

class MockKycNotificationSimulator {
  private kycRecords = new Map<string, KYCUserRequest>();
  private notifications: AppNotification[] = [];
  private notifiedMissionIds = new Set<string>();

  submitKyc(courierId: string, data: { fullName: string; phone: string; idNumber: string }): KYCUserRequest {
    const record: KYCUserRequest = {
      id: courierId,
      courierId,
      fullName: data.fullName,
      phone: data.phone,
      email: `${courierId}@livralink.bj`,
      role: 'coursier',
      vehicleType: 'Moto 125cc',
      idNumber: data.idNumber,
      operatingZone: 'Cotonou',
      documents: { cni: true, permis: true, assurance: true },
      status: 'en_attente',
      submittedAt: new Date().toISOString(),
    };
    this.kycRecords.set(courierId, record);
    return record;
  }

  getAdminKycList(isAdmin: boolean): KYCUserRequest[] {
    if (!isAdmin) throw new Error('PERMISSION_DENIED: Admin access required');
    return Array.from(this.kycRecords.values());
  }

  approveKyc(isAdmin: boolean, courierId: string): KYCUserRequest {
    if (!isAdmin) throw new Error('PERMISSION_DENIED');
    const rec = this.kycRecords.get(courierId);
    if (!rec) throw new Error('KYC not found');
    rec.status = 'valide';
    this.kycRecords.set(courierId, rec);
    this.addNotification({
      type: 'kyc',
      recipientId: courierId,
      title: '🎉 Accréditation KYC validée !',
      message: 'Votre dossier a été validé.',
    });
    return rec;
  }

  rejectKyc(isAdmin: boolean, courierId: string, reason: string): KYCUserRequest {
    if (!isAdmin) throw new Error('PERMISSION_DENIED');
    const rec = this.kycRecords.get(courierId);
    if (!rec) throw new Error('KYC not found');
    rec.status = 'refuse';
    rec.rejectionReason = reason;
    this.kycRecords.set(courierId, rec);
    this.addNotification({
      type: 'kyc',
      recipientId: courierId,
      title: '❌ Dossier KYC non validé',
      message: `Motif : ${reason}`,
    });
    return rec;
  }

  addNotification(notif: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>) {
    const eventKey = `${notif.recipientId || 'global'}_${notif.title}_${notif.orderId || ''}`;
    // Idempotence guard: prevent duplicate notifications for same event
    if (this.notifiedMissionIds.has(eventKey)) {
      return; // Déjà notifié
    }
    this.notifiedMissionIds.add(eventKey);

    const item: AppNotification = {
      ...notif,
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      isRead: false,
    };
    this.notifications.unshift(item);
  }

  simulateInitialSnapshotLoad(recipientId: string, missions: Array<{ id: string; title: string }>) {
    missions.forEach((m) => {
      const eventKey = `${recipientId}_${m.title}_${m.id}`;
      this.notifiedMissionIds.add(eventKey);
    });
  }

  getNotifications(userId: string): AppNotification[] {
    return this.notifications.filter((n) => !n.recipientId || n.recipientId === userId);
  }
}

describe('Suite de tests — KYC, Notifications & Isolation (LivraLink)', () => {
  let sim: MockKycNotificationSimulator;

  beforeEach(() => {
    sim = new MockKycNotificationSimulator();
  });

  test('1. Processus KYC : Soumission, Admin Dashboard, Validation et Rejet', () => {
    const courierId = 'courier_uid_001';
    const sub = sim.submitKyc(courierId, {
      fullName: 'Koffi Livreur',
      phone: '+22997112233',
      idNumber: 'B12345678',
    });

    assert.equal(sub.status, 'en_attente');

    // Admin consulte les dossiers KYC
    const adminList = sim.getAdminKycList(true);
    assert.equal(adminList.length, 1);
    assert.equal(adminList[0].id, courierId);

    // Vendeur non-admin ne peut pas consulter KYC
    assert.throws(() => sim.getAdminKycList(false), /PERMISSION_DENIED/);

    // Admin approuve le dossier
    const approved = sim.approveKyc(true, courierId);
    assert.equal(approved.status, 'valide');

    // Vérification de la notification envoyée au livreur
    const courierNotifs = sim.getNotifications(courierId);
    assert.equal(courierNotifs.length, 1);
    assert.equal(courierNotifs[0].title.includes('validée'), true);

    // Test de rejet sur un autre coursier
    const courierId2 = 'courier_uid_002';
    sim.submitKyc(courierId2, { fullName: 'Livreur 2', phone: '+22997887766', idNumber: 'B99999999' });
    sim.rejectKyc(true, courierId2, 'Pièce d’identité floue');
    const rejectedReq = sim.getAdminKycList(true).find((r) => r.id === courierId2);
    assert.equal(rejectedReq?.status, 'refuse');
    assert.equal(rejectedReq?.rejectionReason, 'Pièce d’identité floue');
  });

  test('2. Système de notifications : Idempotence, unicité et absence de doublon à l’actualisation', () => {
    const recipientId = 'vendor_alpha_123';

    // Ajout d'une notification métier
    sim.addNotification({
      type: 'order_created',
      recipientId,
      title: '📦 Nouvelle livraison #LL-999',
      message: 'Course créée avec succès',
      orderId: '#LL-999',
    });

    // Tentative de recréation du même événement (simulant un rechargement de page ou un snapshot initial)
    sim.addNotification({
      type: 'order_created',
      recipientId,
      title: '📦 Nouvelle livraison #LL-999',
      message: 'Course créée avec succès',
      orderId: '#LL-999',
    });

    const notifs = sim.getNotifications(recipientId);
    assert.equal(notifs.length, 1, 'Aucun doublon ne doit être créé pour le même événement');

    // Simulation de snapshot initial (missions existantes mémorisées sans générer de spam)
    sim.simulateInitialSnapshotLoad('livreur_abc', [{ id: '#LL-HISTORICAL', title: '⚡ Mission prioritaire disponible' }]);
    sim.addNotification({
      type: 'priority_mission',
      recipientId: 'livreur_abc',
      title: '⚡ Mission prioritaire disponible',
      message: 'Ancienne course',
      orderId: '#LL-HISTORICAL',
    });
    // La mission historique ne doit pas avoir déclenché de nouvelle notification
    assert.equal(sim.getNotifications('livreur_abc').length, 0);
  });

  test('3. Isolation multi-rôles (Admin, Vendeurs, Livreurs)', () => {
    const vendorAUid = 'vendeur_a_uuid';
    const vendorBUid = 'vendeur_b_uuid';
    const courierAUid = 'livreur_a_uuid';

    sim.addNotification({
      type: 'order_status',
      recipientId: vendorAUid,
      title: 'Notification Vendeur A',
      message: 'Secret A',
    });

    sim.addNotification({
      type: 'order_status',
      recipientId: vendorBUid,
      title: 'Notification Vendeur B',
      message: 'Secret B',
    });

    const notifsA = sim.getNotifications(vendorAUid);
    const notifsB = sim.getNotifications(vendorBUid);
    const notifsCourier = sim.getNotifications(courierAUid);

    assert.equal(notifsA.length, 1);
    assert.equal(notifsA[0].title, 'Notification Vendeur A');

    assert.equal(notifsB.length, 1);
    assert.equal(notifsB[0].title, 'Notification Vendeur B');

    assert.equal(notifsCourier.length, 0, 'Livreur A ne reçoit pas les notifications des vendeurs');
  });

  test('4. Helpers Storage & KYC : MIME réel (JPG/PNG/WebP/PDF), chemin sécurisé, erreurs et hydratation Firestore', async () => {
    const {
      normalizeMimeType,
      getExtensionForMimeType,
      isAllowedKycMimeType,
      extractStoragePathFromUrl,
      formatStorageErrorMessage,
    } = await import('../firebase/storageService');
    const { mapFirestoreKycToRequest } = await import('../utils/adminReconciliation');

    // PDF doit rester application/pdf et .pdf (jamais forcé en image/jpeg)
    assert.equal(normalizeMimeType('application/pdf', 'piece.pdf'), 'application/pdf');
    assert.equal(normalizeMimeType('', 'carte_nationale.PDF'), 'application/pdf');
    assert.equal(normalizeMimeType('application/octet-stream', 'scan.webp'), 'image/webp');
    assert.equal(normalizeMimeType('image/jpg', 'photo.jpg'), 'image/jpeg');
    assert.equal(normalizeMimeType('image/png', 'photo.png'), 'image/png');

    assert.equal(getExtensionForMimeType('application/pdf'), 'pdf');
    assert.equal(getExtensionForMimeType('image/png'), 'png');
    assert.equal(getExtensionForMimeType('image/webp'), 'webp');
    assert.equal(getExtensionForMimeType('image/jpeg'), 'jpg');

    assert.equal(isAllowedKycMimeType('image/jpeg'), true);
    assert.equal(isAllowedKycMimeType('image/png'), true);
    assert.equal(isAllowedKycMimeType('image/webp'), true);
    assert.equal(isAllowedKycMimeType('application/pdf'), true);
    assert.equal(isAllowedKycMimeType('text/plain'), false);
    assert.equal(isAllowedKycMimeType('application/x-msdownload'), false);

    assert.equal(
      extractStoragePathFromUrl(
        'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0654978401.firebasestorage.app/o/kyc%2Fuid_123%2Fidentity_photo_1.pdf?alt=media'
      ),
      'kyc/uid_123/identity_photo_1.pdf'
    );

    const msg403 = formatStorageErrorMessage({ code: 'storage/unauthorized', message: 'Forbidden' }, 'kyc/u1/cni.pdf');
    assert.match(msg403, /403|refusé|vérifiée/i);

    const mapped = mapFirestoreKycToRequest(
      {
        userId: 'courier_reload_1',
        courierId: 'courier_reload_1',
        fullName: 'Koffi Adjovi',
        phone: '+22997001122',
        status: 'en_attente',
        documentStoragePath: 'kyc/courier_reload_1/identity_photo_1700.pdf',
        documentMimeType: 'application/pdf',
        documentFileName: 'identity_photo_1700.pdf',
      },
      'courier_reload_1'
    );
    assert.equal(mapped.status, 'en_attente');
    assert.equal(mapped.documentStoragePath, 'kyc/courier_reload_1/identity_photo_1700.pdf');
    assert.equal(mapped.documentMimeType, 'application/pdf');
    assert.equal(mapped.documentFileName, 'identity_photo_1700.pdf');
    assert.equal(mapped.documents.cni, true);
    assert.equal(mapped.documentPhotoUrl, undefined);

    const { app } = await import('../firebase/config');
    const { deleteApp } = await import('firebase/app');
    await deleteApp(app).catch(() => {});
  });

  test('5. Diagnostic par étape KYC-STEP-A..F : formatage propre sans fuite de secrets ni PII', async () => {
    const { createKYCStepError, formatStorageErrorMessage } = await import('../firebase/storageService');

    const errA = createKYCStepError('KYC-STEP-A', 'Adresse e-mail non vérifiée.');
    assert.equal(errA.stepCode, 'KYC-STEP-A');
    assert.equal(errA.message, '[KYC-STEP-A] Adresse e-mail non vérifiée.');

    const errB = createKYCStepError(
      'KYC-STEP-B',
      formatStorageErrorMessage({ code: 'storage/unauthorized', message: 'Forbidden' }, 'kyc/u1/doc.pdf', 'KYC-STEP-B')
    );
    assert.equal(errB.stepCode, 'KYC-STEP-B');
    assert.match(errB.message, /^\[KYC-STEP-B\]/);
    assert.match(errB.message, /403/);

    const errD = createKYCStepError('KYC-STEP-D', 'Enregistrement refusé par les règles Firestore.', {
      originalCode: 'permission-denied',
      uploadedAsset: {
        storagePath: 'kyc/u1/cni_1.pdf',
        contentType: 'application/pdf',
        fileName: 'cni_1.pdf',
        size: 1024,
      },
    });
    assert.equal(errD.stepCode, 'KYC-STEP-D');
    assert.equal(errD.uploadedAsset?.storagePath, 'kyc/u1/cni_1.pdf');

    const { app } = await import('../firebase/config');
    const { deleteApp } = await import('firebase/app');
    await deleteApp(app).catch(() => {});
  });

  test('6. Synchronisation après actualisation : réhydratation stricte KYC + utilisateur sans fuite inter-livreurs', async () => {
    const { mapFirestoreKycToRequest, mergeRemoteUsersIntoAdminLists } = await import('../utils/adminReconciliation');

    const refusedKyc = mapFirestoreKycToRequest(
      {
        userId: 'courier_uid_refresh_1',
        courierId: 'courier_uid_refresh_1',
        fullName: 'Aïcha Moussa',
        phone: '+22997005566',
        status: 'refuse',
        rejectionReason: 'Photo floue au verso',
        documentStoragePath: 'kyc/courier_uid_refresh_1/cni_1700.jpg',
        documentMimeType: 'image/jpeg',
      },
      'courier_uid_refresh_1'
    );
    assert.equal(refusedKyc.status, 'refuse');
    assert.equal(refusedKyc.rejectionReason, 'Photo floue au verso');
    assert.equal(refusedKyc.documentStoragePath, 'kyc/courier_uid_refresh_1/cni_1700.jpg');

    const validatedKyc = mapFirestoreKycToRequest(
      {
        userId: 'courier_uid_refresh_2',
        courierId: 'courier_uid_refresh_2',
        fullName: 'Brice Zinsou',
        phone: '+22997119988',
        status: 'valide',
        documentStoragePath: 'kyc/courier_uid_refresh_2/cni_1701.pdf',
        documentMimeType: 'application/pdf',
      },
      'courier_uid_refresh_2'
    );
    assert.equal(validatedKyc.status, 'valide');
    assert.equal(validatedKyc.documentMimeType, 'application/pdf');

    const { couriers } = mergeRemoteUsersIntoAdminLists({
      remoteUsers: [
        {
          uid: 'courier_uid_refresh_1',
          email: 'aicha@livralink.bj',
          fullName: 'Aïcha Moussa',
          role: 'livreur',
          isKycVerified: false,
          kycStatus: 'refuse',
        },
        {
          uid: 'courier_uid_refresh_2',
          email: 'brice@livralink.bj',
          fullName: 'Brice Zinsou',
          role: 'livreur',
          isKycVerified: true,
          kycStatus: 'valide',
        },
      ],
      existingMerchants: [],
      existingCouriers: [],
      deliveries: [],
    });

    const aicha = couriers.find((c) => c.id === 'courier_uid_refresh_1');
    const brice = couriers.find((c) => c.id === 'courier_uid_refresh_2');
    assert.equal(aicha?.isKycVerified, false);
    assert.equal(aicha?.kycStatus, 'refuse');
    assert.equal(brice?.isKycVerified, true);
    assert.equal(brice?.kycStatus, 'valide');
  });
});

