import crypto from 'crypto';
import { getAssignedCourierIdFromOrder } from './p0Security';
import {
  clampOfferTimeoutSeconds,
  computeHaversineDistanceKm,
  DEFAULT_GPS_MAX_AGE_MS,
  DispatchCourierInput,
  evaluateCourierGpsFreshness,
  isCourierEligibleForDispatch,
  isValidGpsCoordinate,
  rankDispatchCandidates,
  RankedCourierCandidate,
  resolveOrderPickupCoords,
} from '../utils/dispatchEngine';

export interface DispatchActionError extends Error {
  statusCode: number;
  code: string;
}

function makeDispatchError(statusCode: number, code: string, message: string): DispatchActionError {
  const err = new Error(message) as DispatchActionError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function buildCourierSnapshotFromUser(courierUid: string, userData: Record<string, any>, deliveryFee: number, distanceKm?: number | null) {
  const name = String(userData.fullName || userData.name || 'Coursier LivraLink').trim();
  const initials =
    name
      .split(/\s+/)
      .map((n: string) => n[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'CR';
  const dist = typeof distanceKm === 'number' && Number.isFinite(distanceKm) ? distanceKm : 1.0;
  const etaMinutes = Math.max(3, Math.round(((dist * 1.25) / 26) * 60 + 3));

  return {
    id: courierUid,
    name,
    phone: String(userData.phone || '').trim(),
    email: String(userData.email || '').trim().toLowerCase(),
    avatarInitials: initials,
    rating: typeof userData.rating === 'number' && Number.isFinite(userData.rating) ? userData.rating : 5.0,
    totalDeliveries: typeof userData.totalDeliveries === 'number' && Number.isFinite(userData.totalDeliveries) ? userData.totalDeliveries : 0,
    vehicle: String(userData.vehicleType || 'Moto 125cc').trim(),
    zone: String(userData.locationCommune || 'Cotonou').trim(),
    distanceKm: dist,
    etaMinutes,
    status: 'en_course' as const,
    isAvailable: false,
    priceFCFA: deliveryFee,
    commissionFCFA: 0,
    netEarningFCFA: deliveryFee,
    isKycVerified: true,
    kycStatus: 'valide' as const,
    ...(typeof userData.locationLat === 'number' ? { locationLat: userData.locationLat } : {}),
    ...(typeof userData.locationLng === 'number' ? { locationLng: userData.locationLng } : {}),
    ...(userData.locationUpdatedAt ? { locationUpdatedAt: String(userData.locationUpdatedAt) } : {}),
  };
}

function normalizeLocationUpdatedAtForApi(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  if (typeof value?._seconds === 'number') return new Date(value._seconds * 1000).toISOString();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  return undefined;
}

export async function fetchAllCouriersFromFirestore(activeDb: any): Promise<DispatchCourierInput[]> {
  const usersCol = activeDb.collection('users');
  const snap =
    typeof usersCol.where === 'function'
      ? await usersCol.where('role', '==', 'livreur').get()
      : await usersCol.get();

  const docs = Array.isArray(snap?.docs) ? snap.docs : [];
  const results: DispatchCourierInput[] = [];
  for (const docSnap of docs) {
    const data = (typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data) || {};
    if (data.role && data.role !== 'livreur') continue;
    const uid = String(data.uid || docSnap.id || '').trim();
    if (!uid) continue;
    results.push({
      id: uid,
      name: data.fullName || data.name || 'Livreur LivraLink',
      fullName: data.fullName || data.name || 'Livreur LivraLink',
      phone: data.phone || '',
      email: data.email || '',
      vehicle: data.vehicleType || 'Moto 125cc',
      vehicleType: data.vehicleType || 'Moto 125cc',
      zone: data.locationCommune || 'Cotonou',
      locationCommune: data.locationCommune || 'Cotonou',
      role: 'livreur',
      status: data.status,
      isAvailable: data.isAvailable,
      isKycVerified: Boolean(data.isKycVerified || data.kycStatus === 'valide'),
      kycStatus: data.kycStatus,
      locationLat: typeof data.locationLat === 'number' ? data.locationLat : undefined,
      locationLng: typeof data.locationLng === 'number' ? data.locationLng : undefined,
      gpsCoordinates: data.gpsCoordinates,
      locationUpdatedAt: normalizeLocationUpdatedAtForApi(data.locationUpdatedAt),
      locationSource: data.locationSource,
      locationAccuracyMeters: typeof data.locationAccuracyMeters === 'number' ? data.locationAccuracyMeters : undefined,
      rating: typeof data.rating === 'number' ? data.rating : 5.0,
      totalDeliveries: typeof data.totalDeliveries === 'number' ? data.totalDeliveries : 0,
    });
  }
  return results;
}

export async function listSanitizedCouriersForVendors(activeDb: any, nowMs: number = Date.now()) {
  const rawCouriers = await fetchAllCouriersFromFirestore(activeDb);
  return rawCouriers
    .filter((c) => Boolean(c.isKycVerified || c.kycStatus === 'valide') && c.status !== 'suspendu')
    .map((c) => {
      const gpsEval = evaluateCourierGpsFreshness(c, nowMs, DEFAULT_GPS_MAX_AGE_MS);
      const name = String(c.fullName || c.name || 'Livreur LivraLink').trim();
      const initials =
        name
          .split(/\s+/)
          .map((p) => p[0])
          .filter(Boolean)
          .join('')
          .toUpperCase()
          .slice(0, 2) || 'CR';
      return {
        id: c.id,
        name,
        phone: c.phone || '',
        avatarInitials: initials,
        rating: c.rating ?? 5.0,
        totalDeliveries: c.totalDeliveries ?? 0,
        vehicle: c.vehicleType || c.vehicle || 'Moto 125cc',
        zone: c.locationCommune || c.zone || 'Cotonou',
        distanceKm: 1.0,
        etaMinutes: 8,
        status: (c.status as 'en_ligne' | 'en_course' | 'hors_ligne' | 'suspendu') || 'hors_ligne',
        isAvailable: isCourierEligibleForDispatch(c),
        priceFCFA: 2000,
        commissionFCFA: 0,
        netEarningFCFA: 2000,
        badge: 'Livreur Vérifié KYC ★',
        isKycVerified: true,
        kycStatus: 'valide' as const,
        locationLat: gpsEval.coords?.lat ?? c.locationLat,
        locationLng: gpsEval.coords?.lng ?? c.locationLng,
        locationUpdatedAt: typeof c.locationUpdatedAt === 'string' ? c.locationUpdatedAt : undefined,
        locationSource: c.locationSource,
        locationAccuracyMeters: c.locationAccuracyMeters,
        gpsFresh: gpsEval.valid,
      };
    });
}

function buildTargetedOfferNotification(params: {
  senderId: string;
  target: RankedCourierCandidate;
  orderDisplayId: string;
  orderDocId: string;
  delivery: Record<string, any>;
  offerTimeoutSeconds: number;
  nowMs: number;
}) {
  const { senderId, target, orderDisplayId, orderDocId, delivery, offerTimeoutSeconds, nowMs } = params;
  const fee = Number(delivery.deliveryFee || 0);
  const pickupCommune = delivery.pickupLocation?.commune || 'Collecte';
  const dropoffCommune = delivery.dropoffLocation?.commune || 'Destination';
  const distText =
    typeof target.distanceKm === 'number' && Number.isFinite(target.distanceKm)
      ? `à ${target.distanceKm.toFixed(1)} km`
      : 'zone proche';
  const prefTag = target.isPreferred ? 'Livreur préféré • ' : '';
  const notifId = `notif_offer_${nowMs}_${crypto.randomBytes(4).toString('hex')}`;

  return {
    id: notifId,
    data: {
      id: notifId,
      senderId,
      recipientId: target.courierId,
      type: 'priority_mission',
      title: `${target.isPreferred ? '⭐ Mission prioritaire' : '📍 Nouvelle proposition de course'} (${orderDisplayId})`,
      message: `${prefTag}Course ${orderDisplayId} (${distText}) : ${pickupCommune} → ${dropoffCommune} • Gain : ${fee.toLocaleString('fr-FR')} FCFA. Répondez sous ${offerTimeoutSeconds}s.`,
      orderId: orderDisplayId,
      orderDocId,
      actionView: 'livreur-missions',
      isRead: false,
      read: false,
      createdAt: nowMs,
      timestamp: new Date(nowMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    },
  };
}

function buildExhaustedVendorNotification(params: {
  senderId: string;
  merchantId: string;
  orderDisplayId: string;
  orderDocId: string;
  reason: string;
  nowMs: number;
}) {
  const { senderId, merchantId, orderDisplayId, orderDocId, reason, nowMs } = params;
  const notifId = `notif_exhausted_${nowMs}_${crypto.randomBytes(4).toString('hex')}`;
  return {
    id: notifId,
    data: {
      id: notifId,
      senderId,
      recipientId: merchantId,
      type: 'order_status',
      title: `⚠️ Aucun livreur disponible (${orderDisplayId})`,
      message: `${reason} Votre commande ${orderDisplayId} reste enregistrée en attente. Vous pouvez relancer la recherche à tout moment.`,
      orderId: orderDisplayId,
      orderDocId,
      actionView: 'vendeur-tracking',
      isRead: false,
      read: false,
      createdAt: nowMs,
      timestamp: new Date(nowMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    },
  };
}

function buildAcceptedVendorNotification(params: {
  courierUid: string;
  courierName: string;
  merchantId: string;
  orderDisplayId: string;
  orderDocId: string;
  nowMs: number;
}) {
  const { courierUid, courierName, merchantId, orderDisplayId, orderDocId, nowMs } = params;
  const notifId = `notif_accept_${nowMs}_${crypto.randomBytes(4).toString('hex')}`;
  return {
    id: notifId,
    data: {
      id: notifId,
      senderId: courierUid,
      recipientId: merchantId,
      type: 'order_accepted',
      title: `✅ Livreur trouvé pour ${orderDisplayId}`,
      message: `${courierName} a accepté votre course ${orderDisplayId} et prend en charge la collecte.`,
      orderId: orderDisplayId,
      orderDocId,
      actionView: 'vendeur-tracking',
      isRead: false,
      read: false,
      createdAt: nowMs,
      timestamp: new Date(nowMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    },
  };
}

export async function startOrRelaunchDeliveryDispatch(
  activeDb: any,
  params: {
    orderDocId: string;
    callerUid: string;
    isAdmin?: boolean;
    preferredCourierId?: string | null;
    offerTimeoutSeconds?: number;
    relaunch?: boolean;
    nowMs?: number;
  }
) {
  const {
    orderDocId,
    callerUid,
    isAdmin = false,
    preferredCourierId,
    offerTimeoutSeconds,
    relaunch = false,
    nowMs = Date.now(),
  } = params;

  const allCouriers = await fetchAllCouriersFromFirestore(activeDb);
  const deliveryRef = activeDb.collection('deliveries').doc(orderDocId);
  const missionRef = activeDb.collection('priority_missions').doc(orderDocId);

  return activeDb.runTransaction(async (tx: any) => {
    const [deliverySnap, missionSnap] = await Promise.all([
      tx.get(deliveryRef),
      tx.get(missionRef),
    ]);

    if (!deliverySnap?.exists) {
      throw makeDispatchError(404, 'ORDER_NOT_FOUND', 'Livraison introuvable.');
    }

    const delivery = deliverySnap.data() || {};
    if (!isAdmin && delivery.merchantId !== callerUid) {
      throw makeDispatchError(403, 'FORBIDDEN', 'Seul le vendeur propriétaire peut lancer le dispatching de cette commande.');
    }
    if (delivery.status !== 'en_attente' || getAssignedCourierIdFromOrder(delivery)) {
      throw makeDispatchError(409, 'ALREADY_ASSIGNED', 'Cette course est déjà attribuée ou clôturée.');
    }

    const merchantSnap = delivery.merchantId
      ? await tx.get(activeDb.collection('users').doc(delivery.merchantId))
      : null;
    const merchantData = merchantSnap?.exists ? merchantSnap.data() || {} : {};

    const effectivePreferredId =
      preferredCourierId !== undefined
        ? (preferredCourierId || null)
        : (delivery.preferredCourierId ?? merchantData.preferredCourierId ?? null);

    const timeoutSeconds = clampOfferTimeoutSeconds(
      offerTimeoutSeconds ?? delivery.offerTimeoutSeconds ?? merchantData.dispatchOfferTimeoutSeconds
    );

    const rejectedIds: string[] = relaunch
      ? []
      : Array.isArray(delivery.rejectedCourierIds)
      ? delivery.rejectedCourierIds
      : [];
    const expiredIds: string[] = relaunch
      ? []
      : Array.isArray(delivery.expiredCourierIds)
      ? delivery.expiredCourierIds
      : [];
    const excludedIds = Array.from(new Set([...rejectedIds, ...expiredIds]));

    const pickupCoords = resolveOrderPickupCoords(delivery);
    const ranked = rankDispatchCandidates({
      pickupCoords,
      couriers: allCouriers,
      preferredCourierId: effectivePreferredId,
      excludedCourierIds: excludedIds,
      nowMs,
      gpsMaxAgeMs: DEFAULT_GPS_MAX_AGE_MS,
    });

    const preferredRecord = effectivePreferredId
      ? allCouriers.find((c) => c.id === effectivePreferredId)
      : undefined;
    const preferredName =
      preferredRecord?.fullName ||
      preferredRecord?.name ||
      delivery.preferredCourierName ||
      merchantData.preferredCourierName ||
      null;

    const orderDisplayId = String(delivery.id || orderDocId);
    const nowIso = new Date(nowMs).toISOString();

    if (ranked.candidates.length > 0) {
      const target = ranked.candidates[0];
      // Double-check live courier doc inside transaction so stale reads cannot target a courier who just went busy/offline
      const targetUserSnap = await tx.get(activeDb.collection('users').doc(target.courierId));
      const targetUserData = targetUserSnap?.exists ? targetUserSnap.data() || {} : {};
      if (targetUserSnap?.exists && !isCourierEligibleForDispatch({ ...targetUserData, id: target.courierId })) {
        throw makeDispatchError(409, 'TARGET_STATE_CHANGED', 'Disponibilité du livreur modifiée en cours de sélection. Veuillez relancer.');
      }

      const offerExpiresAt = nowMs + timeoutSeconds * 1000;
      const attempt = relaunch ? 1 : Number(delivery.offerAttempt || 0) + 1;
      const statusNote = target.isPreferred
        ? `Proposition envoyée en priorité au livreur préféré ${target.name} (délai ${timeoutSeconds}s).`
        : ranked.preferredFallbackReason
        ? `${ranked.preferredFallbackReason} Proposition envoyée au livreur le plus proche : ${target.name} (${target.distanceKm !== null ? `${target.distanceKm.toFixed(1)} km` : 'GPS actif'}).`
        : `Proposition envoyée au livreur le plus proche : ${target.name} (${target.distanceKm !== null ? `${target.distanceKm.toFixed(1)} km` : 'GPS actif'}).`;

      const patch = {
        dispatchMode: 'auto',
        dispatchState: 'offered',
        preferredCourierId: effectivePreferredId,
        preferredCourierName: preferredName,
        targetCourierId: target.courierId,
        targetCourierName: target.name,
        targetCourierDistanceKm: target.distanceKm,
        targetIsPreferred: target.isPreferred,
        candidateQueue: ranked.queue,
        rejectedCourierIds: rejectedIds,
        expiredCourierIds: expiredIds,
        offerAttempt: attempt,
        offerTimeoutSeconds: timeoutSeconds,
        offerStartedAt: nowMs,
        offerExpiresAt,
        dispatchFailureReason: ranked.preferredFallbackReason || '',
        statusNote,
        updatedAt: nowIso,
      };

      tx.update(deliveryRef, patch);
      if (missionSnap?.exists) {
        tx.update(missionRef, {
          dispatchMode: 'auto',
          dispatchState: 'offered',
          preferredCourierId: effectivePreferredId,
          preferredCourierName: preferredName,
          targetCourierId: target.courierId,
          targetCourierName: target.name,
          targetCourierDistanceKm: target.distanceKm,
          targetIsPreferred: target.isPreferred,
          offerAttempt: attempt,
          offerTimeoutSeconds: timeoutSeconds,
          offerStartedAt: nowMs,
          offerExpiresAt,
          updatedAt: nowIso,
        });
      }

      const notif = buildTargetedOfferNotification({
        senderId: callerUid,
        target,
        orderDisplayId,
        orderDocId,
        delivery,
        offerTimeoutSeconds: timeoutSeconds,
        nowMs,
      });
      tx.set(activeDb.collection('notifications').doc(notif.id), notif.data);

      return {
        success: true,
        orderDocId,
        orderId: orderDisplayId,
        dispatchState: 'offered' as const,
        targetCourierId: target.courierId,
        targetCourierName: target.name,
        targetCourierDistanceKm: target.distanceKm,
        targetIsPreferred: target.isPreferred,
        preferredFallbackReason: ranked.preferredFallbackReason || null,
        candidateQueue: ranked.queue,
        offerAttempt: attempt,
        offerTimeoutSeconds: timeoutSeconds,
        offerStartedAt: nowMs,
        offerExpiresAt,
        excludedStats: ranked.excludedStats,
      };
    }

    // Zero eligible couriers — NEVER delete the delivery, keep status 'en_attente' with dispatchState 'exhausted'
    const exhaustionReason =
      ranked.preferredFallbackReason ||
      'Aucun livreur actif et disponible avec position GPS récente n\'a été trouvé à proximité.';
    const patch = {
      dispatchMode: 'auto',
      dispatchState: 'exhausted',
      preferredCourierId: effectivePreferredId,
      preferredCourierName: preferredName,
      targetCourierId: null,
      targetCourierName: null,
      targetCourierDistanceKm: null,
      targetIsPreferred: false,
      candidateQueue: [],
      rejectedCourierIds: rejectedIds,
      expiredCourierIds: expiredIds,
      offerTimeoutSeconds: timeoutSeconds,
      offerStartedAt: null,
      offerExpiresAt: null,
      dispatchFailureReason: exhaustionReason,
      status: 'en_attente',
      statusNote: 'Aucun livreur disponible actuellement — commande conservée en attente.',
      updatedAt: nowIso,
    };

    tx.update(deliveryRef, patch);
    if (missionSnap?.exists) {
      tx.update(missionRef, {
        dispatchMode: 'auto',
        dispatchState: 'exhausted',
        targetCourierId: null,
        targetCourierName: null,
        targetCourierDistanceKm: null,
        targetIsPreferred: false,
        offerExpiresAt: null,
        updatedAt: nowIso,
      });
    }

    if (delivery.merchantId) {
      const notif = buildExhaustedVendorNotification({
        senderId: 'system_dispatch',
        merchantId: delivery.merchantId,
        orderDisplayId,
        orderDocId,
        reason: exhaustionReason,
        nowMs,
      });
      tx.set(activeDb.collection('notifications').doc(notif.id), notif.data);
    }

    return {
      success: true,
      orderDocId,
      orderId: orderDisplayId,
      dispatchState: 'exhausted' as const,
      targetCourierId: null,
      targetCourierName: null,
      targetCourierDistanceKm: null,
      targetIsPreferred: false,
      preferredFallbackReason: ranked.preferredFallbackReason || null,
      dispatchFailureReason: exhaustionReason,
      candidateQueue: [],
      offerAttempt: Number(delivery.offerAttempt || 0),
      offerTimeoutSeconds: timeoutSeconds,
      excludedStats: ranked.excludedStats,
    };
  });
}

export async function respondToDeliveryOffer(
  activeDb: any,
  params: {
    orderDocId: string;
    courierUid: string;
    action: 'accept' | 'refuse';
    reason?: string;
    nowMs?: number;
  }
) {
  const { orderDocId, courierUid, action, reason, nowMs = Date.now() } = params;
  const allCouriers = action === 'refuse' ? await fetchAllCouriersFromFirestore(activeDb) : [];

  const deliveryRef = activeDb.collection('deliveries').doc(orderDocId);
  const missionRef = activeDb.collection('priority_missions').doc(orderDocId);
  const courierRef = activeDb.collection('users').doc(courierUid);

  return activeDb.runTransaction(async (tx: any) => {
    const [deliverySnap, missionSnap, courierSnap] = await Promise.all([
      tx.get(deliveryRef),
      tx.get(missionRef),
      tx.get(courierRef),
    ]);

    if (!deliverySnap?.exists) {
      throw makeDispatchError(404, 'ORDER_NOT_FOUND', 'Livraison introuvable.');
    }
    if (!courierSnap?.exists) {
      throw makeDispatchError(403, 'COURIER_PROFILE_MISSING', 'Profil livreur introuvable.');
    }

    const courierData = courierSnap.data() || {};
    if (courierData.role !== 'livreur') {
      throw makeDispatchError(403, 'ROLE_NOT_COURIER', 'Seul un compte livreur peut répondre à une proposition.');
    }
    if (!courierData.isKycVerified && courierData.kycStatus !== 'valide') {
      throw makeDispatchError(403, 'KYC_REQUIRED', 'Votre dossier KYC doit être validé avant d\'accepter une livraison.');
    }
    if (courierData.status === 'suspendu') {
      throw makeDispatchError(403, 'COURIER_SUSPENDED', 'Votre compte livreur est actuellement suspendu.');
    }

    const delivery = deliverySnap.data() || {};
    const existingAssignedCourierId = getAssignedCourierIdFromOrder(delivery);
    if (delivery.status !== 'en_attente' || existingAssignedCourierId) {
      throw makeDispatchError(409, 'ALREADY_ASSIGNED', 'Cette livraison a déjà été attribuée à un autre livreur.');
    }

    if (delivery.targetCourierId !== courierUid) {
      throw makeDispatchError(
        403,
        'NOT_TARGETED_COURIER',
        'Cette proposition de livraison n\'est pas actuellement attribuée à votre compte.'
      );
    }

    const orderDisplayId = String(delivery.id || orderDocId);
    const nowIso = new Date(nowMs).toISOString();

    if (action === 'accept') {
      if (courierData.status === 'en_course') {
        throw makeDispatchError(409, 'COURIER_BUSY', 'Vous avez déjà une livraison active en cours.');
      }
      if (courierData.status === 'hors_ligne' || courierData.isAvailable === false) {
        throw makeDispatchError(409, 'COURIER_OFFLINE', 'Passez en ligne et disponible pour accepter cette livraison.');
      }
      if (typeof delivery.offerExpiresAt === 'number' && nowMs > delivery.offerExpiresAt) {
        throw makeDispatchError(410, 'OFFER_EXPIRED', 'Le délai de réponse pour cette proposition de course est expiré.');
      }

      const fee = Number(delivery.deliveryFee || 0);
      const pickupCoords = resolveOrderPickupCoords(delivery);
      const courierLat = typeof courierData.locationLat === 'number' ? courierData.locationLat : undefined;
      const courierLng = typeof courierData.locationLng === 'number' ? courierData.locationLng : undefined;
      const distKm =
        isValidGpsCoordinate(courierLat, courierLng)
          ? computeHaversineDistanceKm(pickupCoords, { lat: courierLat!, lng: courierLng! })
          : delivery.targetCourierDistanceKm ?? 1.0;

      const courierSnapshot = buildCourierSnapshotFromUser(courierUid, courierData, fee, distKm);

      tx.update(deliveryRef, {
        courierId: courierUid,
        courierName: courierSnapshot.name,
        courier: courierSnapshot,
        status: 'assignee',
        dispatchState: 'assigned',
        targetCourierId: null,
        targetCourierName: null,
        assignedAt: nowIso,
        updatedAt: nowIso,
        statusNote: `Acceptée par ${courierSnapshot.name}${delivery.targetIsPreferred ? ' (Livreur préféré)' : ''}`,
      });

      if (missionSnap?.exists) {
        tx.update(missionRef, {
          courierId: courierUid,
          courierName: courierSnapshot.name,
          status: 'assignee',
          dispatchState: 'assigned',
          targetCourierId: null,
          targetCourierName: null,
          assignedAt: nowIso,
          updatedAt: nowIso,
        });
      }

      tx.update(courierRef, {
        status: 'en_course',
        isAvailable: false,
        updatedAt: nowIso,
      });

      if (delivery.merchantId) {
        const notif = buildAcceptedVendorNotification({
          courierUid,
          courierName: courierSnapshot.name,
          merchantId: delivery.merchantId,
          orderDisplayId,
          orderDocId,
          nowMs,
        });
        tx.set(activeDb.collection('notifications').doc(notif.id), notif.data);
      }

      return {
        success: true,
        action: 'accept' as const,
        orderDocId,
        orderId: orderDisplayId,
        dispatchState: 'assigned' as const,
        courier: courierSnapshot,
      };
    }

    // action === 'refuse' -> append to rejectedCourierIds and advance to next ranked candidate
    const prevRejected: string[] = Array.isArray(delivery.rejectedCourierIds) ? delivery.rejectedCourierIds : [];
    const rejectedIds = Array.from(new Set([...prevRejected, courierUid]));
    const expiredIds: string[] = Array.isArray(delivery.expiredCourierIds) ? delivery.expiredCourierIds : [];
    const excludedIds = Array.from(new Set([...rejectedIds, ...expiredIds]));

    const pickupCoords = resolveOrderPickupCoords(delivery);
    const ranked = rankDispatchCandidates({
      pickupCoords,
      couriers: allCouriers,
      preferredCourierId: delivery.preferredCourierId || null,
      excludedCourierIds: excludedIds,
      nowMs,
      gpsMaxAgeMs: DEFAULT_GPS_MAX_AGE_MS,
    });

    const timeoutSeconds = clampOfferTimeoutSeconds(delivery.offerTimeoutSeconds);

    if (ranked.candidates.length > 0) {
      const nextTarget = ranked.candidates[0];
      const nextExpiresAt = nowMs + timeoutSeconds * 1000;
      const nextAttempt = Number(delivery.offerAttempt || 1) + 1;
      const statusNote = `Refusée par ${courierData.fullName || 'un livreur'}${reason ? ` (${reason})` : ''} • Proposition envoyée au livreur suivant : ${nextTarget.name}${nextTarget.distanceKm !== null ? ` (${nextTarget.distanceKm.toFixed(1)} km)` : ''}.`;

      tx.update(deliveryRef, {
        dispatchState: 'offered',
        targetCourierId: nextTarget.courierId,
        targetCourierName: nextTarget.name,
        targetCourierDistanceKm: nextTarget.distanceKm,
        targetIsPreferred: nextTarget.isPreferred,
        candidateQueue: ranked.queue,
        rejectedCourierIds: rejectedIds,
        expiredCourierIds: expiredIds,
        offerAttempt: nextAttempt,
        offerTimeoutSeconds: timeoutSeconds,
        offerStartedAt: nowMs,
        offerExpiresAt: nextExpiresAt,
        statusNote,
        updatedAt: nowIso,
      });

      if (missionSnap?.exists) {
        tx.update(missionRef, {
          dispatchState: 'offered',
          targetCourierId: nextTarget.courierId,
          targetCourierName: nextTarget.name,
          targetCourierDistanceKm: nextTarget.distanceKm,
          targetIsPreferred: nextTarget.isPreferred,
          offerAttempt: nextAttempt,
          offerTimeoutSeconds: timeoutSeconds,
          offerStartedAt: nowMs,
          offerExpiresAt: nextExpiresAt,
          updatedAt: nowIso,
        });
      }

      const notif = buildTargetedOfferNotification({
        senderId: delivery.merchantId || 'system_dispatch',
        target: nextTarget,
        orderDisplayId,
        orderDocId,
        delivery,
        offerTimeoutSeconds: timeoutSeconds,
        nowMs,
      });
      tx.set(activeDb.collection('notifications').doc(notif.id), notif.data);

      return {
        success: true,
        action: 'refuse' as const,
        orderDocId,
        orderId: orderDisplayId,
        dispatchState: 'offered' as const,
        targetCourierId: nextTarget.courierId,
        targetCourierName: nextTarget.name,
        targetCourierDistanceKm: nextTarget.distanceKm,
        offerAttempt: nextAttempt,
        offerStartedAt: nowMs,
        offerExpiresAt: nextExpiresAt,
        candidateQueue: ranked.queue,
      };
    }

    const exhaustionReason =
      'Tous les livreurs éligibles à proximité ont refusé ou sont actuellement indisponibles.';
    tx.update(deliveryRef, {
      dispatchState: 'exhausted',
      targetCourierId: null,
      targetCourierName: null,
      targetCourierDistanceKm: null,
      targetIsPreferred: false,
      candidateQueue: [],
      rejectedCourierIds: rejectedIds,
      expiredCourierIds: expiredIds,
      offerExpiresAt: null,
      dispatchFailureReason: exhaustionReason,
      status: 'en_attente',
      statusNote: 'Aucun autre livreur disponible actuellement — commande en attente.',
      updatedAt: nowIso,
    });

    if (missionSnap?.exists) {
      tx.update(missionRef, {
        dispatchState: 'exhausted',
        targetCourierId: null,
        targetCourierName: null,
        targetCourierDistanceKm: null,
        targetIsPreferred: false,
        offerExpiresAt: null,
        updatedAt: nowIso,
      });
    }

    if (delivery.merchantId) {
      const notif = buildExhaustedVendorNotification({
        senderId: 'system_dispatch',
        merchantId: delivery.merchantId,
        orderDisplayId,
        orderDocId,
        reason: exhaustionReason,
        nowMs,
      });
      tx.set(activeDb.collection('notifications').doc(notif.id), notif.data);
    }

    return {
      success: true,
      action: 'refuse' as const,
      orderDocId,
      orderId: orderDisplayId,
      dispatchState: 'exhausted' as const,
      targetCourierId: null,
      targetCourierName: null,
      dispatchFailureReason: exhaustionReason,
      candidateQueue: [],
    };
  });
}

export async function advanceExpiredOrUnavailableOffer(
  activeDb: any,
  params: {
    orderDocId: string;
    callerUid?: string;
    isAdmin?: boolean;
    forceReason?: 'timeout' | 'target_unavailable';
    nowMs?: number;
  }
) {
  const { orderDocId, callerUid, isAdmin = false, forceReason, nowMs = Date.now() } = params;
  const allCouriers = await fetchAllCouriersFromFirestore(activeDb);

  const deliveryRef = activeDb.collection('deliveries').doc(orderDocId);
  const missionRef = activeDb.collection('priority_missions').doc(orderDocId);

  return activeDb.runTransaction(async (tx: any) => {
    const [deliverySnap, missionSnap] = await Promise.all([
      tx.get(deliveryRef),
      tx.get(missionRef),
    ]);

    if (!deliverySnap?.exists) {
      throw makeDispatchError(404, 'ORDER_NOT_FOUND', 'Livraison introuvable.');
    }

    const delivery = deliverySnap.data() || {};
    if (callerUid && !isAdmin && delivery.merchantId !== callerUid && delivery.targetCourierId !== callerUid) {
      throw makeDispatchError(403, 'FORBIDDEN', 'Autorisation refusée pour faire progresser cette offre.');
    }

    if (delivery.status !== 'en_attente' || getAssignedCourierIdFromOrder(delivery)) {
      return {
        success: true,
        advanced: false,
        reason: 'already_assigned_or_closed',
        dispatchState: delivery.dispatchState || 'assigned',
        targetCourierId: null,
      };
    }

    const currentTargetId = delivery.targetCourierId ? String(delivery.targetCourierId) : '';
    if (!currentTargetId) {
      return {
        success: true,
        advanced: false,
        reason: 'no_active_target',
        dispatchState: delivery.dispatchState || 'exhausted',
        targetCourierId: null,
      };
    }

    const targetSnap = await tx.get(activeDb.collection('users').doc(currentTargetId));
    const targetData = targetSnap?.exists ? targetSnap.data() || {} : null;
    const targetStillEligible = Boolean(
      targetData && isCourierEligibleForDispatch({ ...targetData, id: currentTargetId })
    );
    const isExpired = typeof delivery.offerExpiresAt === 'number' && nowMs >= delivery.offerExpiresAt;

    if (!isExpired && targetStillEligible && forceReason !== 'target_unavailable') {
      return {
        success: true,
        advanced: false,
        reason: 'offer_still_active',
        dispatchState: delivery.dispatchState || 'offered',
        targetCourierId: currentTargetId,
        offerExpiresAt: delivery.offerExpiresAt,
      };
    }

    const prevExpired: string[] = Array.isArray(delivery.expiredCourierIds) ? delivery.expiredCourierIds : [];
    const expiredIds = Array.from(new Set([...prevExpired, currentTargetId]));
    const rejectedIds: string[] = Array.isArray(delivery.rejectedCourierIds) ? delivery.rejectedCourierIds : [];
    const excludedIds = Array.from(new Set([...rejectedIds, ...expiredIds]));

    const pickupCoords = resolveOrderPickupCoords(delivery);
    const ranked = rankDispatchCandidates({
      pickupCoords,
      couriers: allCouriers,
      preferredCourierId: delivery.preferredCourierId || null,
      excludedCourierIds: excludedIds,
      nowMs,
      gpsMaxAgeMs: DEFAULT_GPS_MAX_AGE_MS,
    });

    const orderDisplayId = String(delivery.id || orderDocId);
    const nowIso = new Date(nowMs).toISOString();
    const timeoutSeconds = clampOfferTimeoutSeconds(delivery.offerTimeoutSeconds);
    const skipLabel = !targetStillEligible || forceReason === 'target_unavailable'
      ? 'Livreur devenu indisponible'
      : 'Délai expiré';

    if (ranked.candidates.length > 0) {
      const nextTarget = ranked.candidates[0];
      const nextExpiresAt = nowMs + timeoutSeconds * 1000;
      const nextAttempt = Number(delivery.offerAttempt || 1) + 1;
      const statusNote = `${skipLabel} pour ${delivery.targetCourierName || currentTargetId} • Proposition transférée à ${nextTarget.name}${nextTarget.distanceKm !== null ? ` (${nextTarget.distanceKm.toFixed(1)} km)` : ''}.`;

      tx.update(deliveryRef, {
        dispatchState: 'offered',
        targetCourierId: nextTarget.courierId,
        targetCourierName: nextTarget.name,
        targetCourierDistanceKm: nextTarget.distanceKm,
        targetIsPreferred: nextTarget.isPreferred,
        candidateQueue: ranked.queue,
        rejectedCourierIds: rejectedIds,
        expiredCourierIds: expiredIds,
        offerAttempt: nextAttempt,
        offerTimeoutSeconds: timeoutSeconds,
        offerStartedAt: nowMs,
        offerExpiresAt: nextExpiresAt,
        statusNote,
        updatedAt: nowIso,
      });

      if (missionSnap?.exists) {
        tx.update(missionRef, {
          dispatchState: 'offered',
          targetCourierId: nextTarget.courierId,
          targetCourierName: nextTarget.name,
          targetCourierDistanceKm: nextTarget.distanceKm,
          targetIsPreferred: nextTarget.isPreferred,
          offerAttempt: nextAttempt,
          offerTimeoutSeconds: timeoutSeconds,
          offerStartedAt: nowMs,
          offerExpiresAt: nextExpiresAt,
          updatedAt: nowIso,
        });
      }

      const notif = buildTargetedOfferNotification({
        senderId: delivery.merchantId || 'system_dispatch',
        target: nextTarget,
        orderDisplayId,
        orderDocId,
        delivery,
        offerTimeoutSeconds: timeoutSeconds,
        nowMs,
      });
      tx.set(activeDb.collection('notifications').doc(notif.id), notif.data);

      return {
        success: true,
        advanced: true,
        reason: isExpired ? 'timeout' : 'target_unavailable',
        orderDocId,
        orderId: orderDisplayId,
        dispatchState: 'offered' as const,
        targetCourierId: nextTarget.courierId,
        targetCourierName: nextTarget.name,
        targetCourierDistanceKm: nextTarget.distanceKm,
        offerAttempt: nextAttempt,
        offerStartedAt: nowMs,
        offerExpiresAt: nextExpiresAt,
        candidateQueue: ranked.queue,
      };
    }

    const exhaustionReason =
      'Aucun autre livreur actif et disponible à proximité après expiration ou indisponibilité.';
    tx.update(deliveryRef, {
      dispatchState: 'exhausted',
      targetCourierId: null,
      targetCourierName: null,
      targetCourierDistanceKm: null,
      targetIsPreferred: false,
      candidateQueue: [],
      rejectedCourierIds: rejectedIds,
      expiredCourierIds: expiredIds,
      offerExpiresAt: null,
      dispatchFailureReason: exhaustionReason,
      status: 'en_attente',
      statusNote: 'Aucun livreur disponible actuellement — commande conservée en attente.',
      updatedAt: nowIso,
    });

    if (missionSnap?.exists) {
      tx.update(missionRef, {
        dispatchState: 'exhausted',
        targetCourierId: null,
        targetCourierName: null,
        targetCourierDistanceKm: null,
        targetIsPreferred: false,
        offerExpiresAt: null,
        updatedAt: nowIso,
      });
    }

    if (delivery.merchantId) {
      const notif = buildExhaustedVendorNotification({
        senderId: 'system_dispatch',
        merchantId: delivery.merchantId,
        orderDisplayId,
        orderDocId,
        reason: exhaustionReason,
        nowMs,
      });
      tx.set(activeDb.collection('notifications').doc(notif.id), notif.data);
    }

    return {
      success: true,
      advanced: true,
      reason: isExpired ? 'timeout' : 'target_unavailable',
      orderDocId,
      orderId: orderDisplayId,
      dispatchState: 'exhausted' as const,
      targetCourierId: null,
      targetCourierName: null,
      dispatchFailureReason: exhaustionReason,
      candidateQueue: [],
    };
  });
}

export async function updateCourierAvailabilityAndGps(
  activeDb: any,
  params: {
    courierUid: string;
    isAvailable?: boolean;
    status?: 'en_ligne' | 'hors_ligne';
    lat?: number;
    lng?: number;
    accuracyMeters?: number;
    locationSource?: 'browser_gps' | 'live_watch' | 'manual' | 'benin_default';
    zone?: string;
    nowMs?: number;
  }
) {
  const {
    courierUid,
    isAvailable,
    status,
    lat,
    lng,
    accuracyMeters,
    locationSource,
    zone,
    nowMs = Date.now(),
  } = params;

  const userRef = activeDb.collection('users').doc(courierUid);
  const userSnap = await userRef.get();
  if (!userSnap?.exists) {
    throw makeDispatchError(404, 'USER_NOT_FOUND', 'Profil livreur introuvable.');
  }
  const userData = userSnap.data() || {};
  if (userData.role !== 'livreur') {
    throw makeDispatchError(403, 'ROLE_NOT_COURIER', 'Seul un livreur peut mettre à jour sa disponibilité.');
  }
  if (userData.status === 'suspendu') {
    throw makeDispatchError(403, 'COURIER_SUSPENDED', 'Compte livreur suspendu.');
  }

  const nowIso = new Date(nowMs).toISOString();
  const updatePayload: Record<string, any> = {
    updatedAt: nowIso,
  };

  if (userData.status !== 'en_course') {
    if (status === 'en_ligne' || status === 'hors_ligne') {
      updatePayload.status = status;
      updatePayload.isAvailable = isAvailable !== undefined ? Boolean(isAvailable) : status === 'en_ligne';
    } else if (typeof isAvailable === 'boolean') {
      updatePayload.isAvailable = isAvailable;
      updatePayload.status = isAvailable ? 'en_ligne' : 'hors_ligne';
    }
  } else if (typeof isAvailable === 'boolean') {
    updatePayload.isAvailable = false;
  }

  if (isValidGpsCoordinate(lat, lng)) {
    updatePayload.locationLat = lat;
    updatePayload.locationLng = lng;
    updatePayload.gpsCoordinates = `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
    updatePayload.locationUpdatedAt = nowIso;
    updatePayload.locationSource = locationSource || 'browser_gps';
    if (typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters >= 0) {
      updatePayload.locationAccuracyMeters = Math.round(accuracyMeters);
    }
  }

  if (zone && typeof zone === 'string' && zone.trim()) {
    updatePayload.locationCommune = zone.trim().slice(0, 128);
  }

  await userRef.set(updatePayload, { merge: true });

  // If courier just went offline/unavailable, advance any pending offer currently waiting on them
  const becameUnavailable =
    updatePayload.status === 'hors_ligne' || updatePayload.isAvailable === false;
  const advancedOrders: string[] = [];

  if (becameUnavailable) {
    try {
      const deliveriesCol = activeDb.collection('deliveries');
      const targetedSnap =
        typeof deliveriesCol.where === 'function'
          ? await deliveriesCol.where('targetCourierId', '==', courierUid).get()
          : await deliveriesCol.get();
      const docs = Array.isArray(targetedSnap?.docs) ? targetedSnap.docs : [];
      for (const docSnap of docs) {
        const d = (typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data) || {};
        if (d.status === 'en_attente' && d.targetCourierId === courierUid) {
          await advanceExpiredOrUnavailableOffer(activeDb, {
            orderDocId: docSnap.id,
            callerUid: courierUid,
            forceReason: 'target_unavailable',
            nowMs,
          }).catch(() => {});
          advancedOrders.push(docSnap.id);
        }
      }
    } catch {}
  }

  return {
    success: true,
    uid: courierUid,
    status: updatePayload.status || userData.status,
    isAvailable: updatePayload.isAvailable ?? (userData.isAvailable !== false),
    locationLat: updatePayload.locationLat ?? userData.locationLat,
    locationLng: updatePayload.locationLng ?? userData.locationLng,
    locationUpdatedAt: updatePayload.locationUpdatedAt ?? userData.locationUpdatedAt,
    locationSource: updatePayload.locationSource ?? userData.locationSource,
    advancedOrders,
  };
}
