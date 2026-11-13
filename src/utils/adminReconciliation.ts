import { DeliveryOrder, Merchant, Courier, KYCUserRequest } from '../types';

export interface FirestoreUserRecord {
  uid?: string;
  id?: string;
  email?: string;
  fullName?: string;
  phone?: string;
  role?: 'vendeur' | 'livreur' | 'admin' | 'client' | string;
  storeName?: string;
  storeCommune?: string;
  storeAddress?: string;
  vehicleType?: string;
  gpsCoordinates?: string;
  locationCommune?: string;
  locationAddress?: string;
  isKycVerified?: boolean;
  kycStatus?: string;
  status?: string;
  channel?: 'WhatsApp' | 'Instagram' | 'TikTok' | 'E-commerce';
  createdAt?: any;
  updatedAt?: any;
}

const BENIN_TIME_ZONE = 'Africa/Porto-Novo';

const toBeninDayKey = (date: Date): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BENIN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

export const normalizeDateString = (value: any): string => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return '';
  }
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch {}
  }
  if (typeof value?._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString();
  }
  if (typeof value?.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString();
  }
  return '';
};

export const formatShortDateFr = (isoOrDate?: string): string => {
  if (!isoOrDate) return 'Date non renseignée';
  const trimmed = String(isoOrDate).trim();
  if (!trimmed) return 'Date non renseignée';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleDateString('fr-FR', {
    timeZone: BENIN_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const isSameDayIso = (isoOrDate?: string, referenceDate: Date | string = new Date()): boolean => {
  if (!isoOrDate) return false;
  const trimmed = String(isoOrDate).trim();
  if (!trimmed || /^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return false;
  const parsed = new Date(trimmed);
  const refParsed = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (Number.isNaN(parsed.getTime()) || Number.isNaN(refParsed.getTime())) return false;
  return toBeninDayKey(parsed) === toBeninDayKey(refParsed);
};

export const mapFirestoreUserToMerchant = (data: FirestoreUserRecord, docId: string): Merchant => {
  const uid = (data.uid || docId || '').trim();
  const fullName = (data.fullName || data.email?.split('@')[0] || 'Vendeur LivraLink').trim();
  const storeName = (data.storeName || `Boutique ${fullName}`).trim();
  const normalizedStatus: Merchant['status'] =
    data.status === 'suspendu'
      ? 'suspendu'
      : data.status === 'en_attente_kyc'
      ? 'en_attente_kyc'
      : 'actif';

  return {
    id: uid,
    storeName,
    managerName: fullName,
    phone: (data.phone || '').trim() || 'Non renseigné',
    email: (data.email || '').trim().toLowerCase(),
    commune: (data.storeCommune || data.locationCommune || 'Cotonou').trim(),
    address: (data.storeAddress || data.locationAddress || '').trim(),
    channel: data.channel || 'WhatsApp',
    totalOrders: 0,
    totalVolumeFCFA: 0,
    rating: 5.0,
    status: normalizedStatus,
    isVerified: Boolean(data.isKycVerified || data.kycStatus === 'valide'),
    createdAt: normalizeDateString(data.createdAt),
  };
};

export const mapFirestoreUserToCourier = (data: FirestoreUserRecord, docId: string): Courier => {
  const uid = (data.uid || docId || '').trim();
  const fullName = (data.fullName || data.email?.split('@')[0] || 'Livreur LivraLink').trim();
  const initials =
    fullName
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .substring(0, 2) || 'CR';
  const isAccredited = Boolean(data.isKycVerified || data.kycStatus === 'valide');
  const status: Courier['status'] =
    data.status === 'suspendu'
      ? 'suspendu'
      : data.status === 'en_course'
      ? 'en_course'
      : data.status === 'en_ligne'
      ? 'en_ligne'
      : isAccredited
      ? 'en_ligne'
      : 'hors_ligne';

  return {
    id: uid,
    name: fullName,
    phone: (data.phone || '').trim(),
    email: (data.email || '').trim().toLowerCase(),
    avatarInitials: initials,
    rating: 5.0,
    totalDeliveries: 0,
    vehicle: (data.vehicleType || 'Moto 125cc').trim(),
    vehiclePlate: '',
    zone: (data.locationCommune || 'Cotonou & Alentours').trim(),
    distanceKm: 1.0,
    etaMinutes: 8,
    status,
    walletBalanceFCFA: 0,
    priceFCFA: 2000,
    commissionFCFA: 0,
    netEarningFCFA: 2000,
    badge: isAccredited ? 'Livreur Vérifié KYC ★' : 'Nouveau Livreur',
    isKycVerified: isAccredited,
    kycStatus: (data.kycStatus as Courier['kycStatus']) || (isAccredited ? 'valide' : 'non_soumis'),
    createdAt: normalizeDateString(data.createdAt),
  };
};

export const mapFirestoreDeliveryToOrder = (data: any, docId: string): DeliveryOrder => {
  const id = data.id || data.orderId || docId;
  const createdIso = normalizeDateString(data.createdAt);
  const clientName = data.clientName || 'Client';
  const cod = typeof data.itemValueCOD === 'number' ? data.itemValueCOD : 0;
  const fee = typeof data.deliveryFee === 'number' ? data.deliveryFee : 0;

  return {
    id,
    clientName,
    clientPhone: data.clientPhone || '',
    clientNote: data.clientNote || '',
    isClientVerified: Boolean(data.clientPhone),
    channel: data.channel || 'WhatsApp',
    pickupLocation: data.pickupLocation || {
      name: data.merchantStoreName || 'Boutique Vendeur',
      address: 'Cotonou, Bénin',
      commune: 'Cotonou - Haie Vive',
    },
    dropoffLocation: data.dropoffLocation || {
      name: clientName,
      address: 'Cotonou, Bénin',
      commune: 'Cotonou - Centre',
    },
    itemDescription: data.itemDescription || 'Colis',
    itemWeightKg: typeof data.itemWeightKg === 'number' ? data.itemWeightKg : 1,
    itemFormat: data.itemFormat || 'M',
    isFragile: Boolean(data.isFragile),
    itemValueCOD: cod,
    deliveryFee: fee,
    totalCustomerPayable: typeof data.totalCustomerPayable === 'number' ? data.totalCustomerPayable : cod + fee,
    courier: data.courier || (data.courierId ? {
      id: data.courierId,
      name: data.courierName || 'Coursier LivraLink',
      phone: '',
      avatarInitials: (data.courierName || 'CL').slice(0, 2).toUpperCase(),
      rating: 5.0,
      totalDeliveries: 0,
      vehicle: 'Moto',
      zone: 'Cotonou',
      distanceKm: 1,
      etaMinutes: 10,
      status: 'en_course',
      priceFCFA: fee,
      commissionFCFA: 0,
      netEarningFCFA: fee,
    } : undefined),
    status: data.status || 'en_attente',
    statusNote: data.statusNote || '',
    createdAt: createdIso,
    estimatedArrival: data.estimatedArrival || 'Dans ~20 min',
    otpCode: data.otpCode || '0000',
    merchantId: data.merchantId,
    merchantEmail: data.merchantEmail,
    merchantStoreName: data.merchantStoreName || data.pickupLocation?.name,
    timeline: Array.isArray(data.timeline) ? data.timeline : [],
    podData: data.podData || data.pod,
  };
};

export const doesOrderBelongToMerchant = (order: DeliveryOrder, merchant: Merchant): boolean => {
  if (order.merchantId && merchant.id && order.merchantId === merchant.id) return true;
  if (
    order.merchantEmail &&
    merchant.email &&
    order.merchantEmail.toLowerCase().trim() === merchant.email.toLowerCase().trim()
  ) {
    return true;
  }
  const orderStore = (order.merchantStoreName || order.pickupLocation?.name || '').toLowerCase().trim();
  const merchantStore = (merchant.storeName || '').toLowerCase().trim();
  if (orderStore && merchantStore && orderStore === merchantStore) {
    return true;
  }
  return false;
};

export const enrichMerchantsWithDeliveries = (
  merchants: Merchant[],
  deliveries: DeliveryOrder[]
): Merchant[] => {
  return merchants.map((m) => {
    const owned = deliveries.filter((d) => doesOrderBelongToMerchant(d, m));
    const totalOrders = owned.length;
    const totalVolumeFCFA = owned.reduce((sum, d) => sum + (d.itemValueCOD || 0), 0);
    return {
      ...m,
      totalOrders,
      totalVolumeFCFA,
    };
  });
};

export interface MerchantReportSummary {
  merchant: Merchant;
  totalOrders: number;
  deliveredOrders: number;
  pendingOrders: number;
  failedOrders: number;
  totalVolumeCOD: number;
  totalDeliveryFees: number;
  registeredToday: boolean;
}

export const buildMerchantReportSummaries = (
  merchants: Merchant[],
  deliveries: DeliveryOrder[],
  referenceDate: Date | string = new Date()
): MerchantReportSummary[] => {
  return merchants
    .map((merchant) => {
      const owned = deliveries.filter((d) => doesOrderBelongToMerchant(d, merchant));
      const deliveredOrders = owned.filter((d) => d.status === 'livree').length;
      const failedOrders = owned.filter((d) => d.status === 'echec').length;
      const pendingOrders = owned.length - deliveredOrders - failedOrders;
      const totalVolumeCOD = owned.reduce((sum, d) => sum + (d.itemValueCOD || 0), 0);
      const totalDeliveryFees = owned.reduce((sum, d) => sum + (d.deliveryFee || 0), 0);
      return {
        merchant,
        totalOrders: owned.length,
        deliveredOrders,
        pendingOrders,
        failedOrders,
        totalVolumeCOD,
        totalDeliveryFees,
        registeredToday: isSameDayIso(merchant.createdAt, referenceDate),
      };
    })
    .sort((a, b) => {
      const timeA = a.merchant.createdAt ? new Date(a.merchant.createdAt).getTime() : 0;
      const timeB = b.merchant.createdAt ? new Date(b.merchant.createdAt).getTime() : 0;
      return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
    });
};

export const mergeRemoteUsersIntoAdminLists = (params: {
  remoteUsers: FirestoreUserRecord[];
  existingMerchants: Merchant[];
  existingCouriers: Courier[];
  deliveries: DeliveryOrder[];
}): { merchants: Merchant[]; couriers: Courier[] } => {
  const { remoteUsers, existingMerchants, existingCouriers, deliveries } = params;

  const merchantMap = new Map<string, Merchant>();
  const courierMap = new Map<string, Courier>();

  const findExistingMerchantKey = (uid: string, email: string): string | undefined => {
    for (const [k, m] of merchantMap.entries()) {
      if (m.id === uid || (email && m.email?.toLowerCase().trim() === email)) {
        return k;
      }
    }
    return undefined;
  };

  const findExistingCourierKey = (uid: string, email: string): string | undefined => {
    for (const [k, c] of courierMap.entries()) {
      if (c.id === uid || (email && c.email?.toLowerCase().trim() === email)) {
        return k;
      }
    }
    return undefined;
  };

  existingMerchants.forEach((m) => {
    const key = m.id ? `id:${m.id}` : `email:${(m.email || '').toLowerCase().trim()}`;
    merchantMap.set(key, m);
  });
  existingCouriers.forEach((c) => {
    const key = c.id ? `id:${c.id}` : `email:${(c.email || '').toLowerCase().trim()}`;
    courierMap.set(key, c);
  });

  remoteUsers.forEach((u) => {
    const uid = (u.uid || u.id || '').trim();
    if (!uid) return;
    const role = (u.role || 'vendeur').toLowerCase().trim();
    const normEmail = (u.email || '').toLowerCase().trim();

    if (role === 'vendeur') {
      const mapped = mapFirestoreUserToMerchant(u, uid);
      const existingKey = findExistingMerchantKey(uid, normEmail);
      const prev = existingKey ? merchantMap.get(existingKey) : undefined;
      if (existingKey) merchantMap.delete(existingKey);
      merchantMap.set(`id:${uid}`, {
        ...(prev || {}),
        ...mapped,
        createdAt: mapped.createdAt || prev?.createdAt || '',
        isVerified: prev?.isVerified || mapped.isVerified,
        preferredRateDiscountPercent: prev?.preferredRateDiscountPercent ?? 0,
        status: u.status === 'suspendu' ? 'suspendu' : prev?.status === 'suspendu' && !u.status ? 'suspendu' : mapped.status,
      });
    } else if (role === 'livreur') {
      const mapped = mapFirestoreUserToCourier(u, uid);
      const existingKey = findExistingCourierKey(uid, normEmail);
      const prev = existingKey ? courierMap.get(existingKey) : undefined;
      if (existingKey) courierMap.delete(existingKey);
      courierMap.set(`id:${uid}`, {
        ...(prev || {}),
        ...mapped,
        createdAt: mapped.createdAt || prev?.createdAt || '',
        walletBalanceFCFA: prev?.walletBalanceFCFA ?? mapped.walletBalanceFCFA,
        totalDeliveries: prev?.totalDeliveries ?? mapped.totalDeliveries,
        isKycVerified: Boolean(prev?.isKycVerified || mapped.isKycVerified),
      });
    }
  });

  const mergedMerchants = enrichMerchantsWithDeliveries(Array.from(merchantMap.values()), deliveries).sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
  });

  const mergedCouriers = Array.from(courierMap.values()).sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
  });

  return { merchants: mergedMerchants, couriers: mergedCouriers };
};

export const mapFirestoreKycToRequest = (data: any, docId: string): KYCUserRequest => {
  return {
    id: data.id || docId,
    courierId: data.courierId || data.userId || docId,
    fullName: data.fullName || 'Livreur LivraLink',
    phone: data.phone || '',
    email: data.email || '',
    role: data.role === 'marchand' ? 'marchand' : 'coursier',
    vehicleType: data.vehicleType || 'Moto 125cc',
    idNumber: data.idNumber || '',
    operatingZone: data.operatingZone || data.zone || 'Cotonou',
    documents: data.documents || {
      cni: Boolean(data.cniUrl),
      permis: Boolean(data.permisUrl),
      assurance: Boolean(data.assuranceUrl),
    },
    status: data.status || 'en_attente',
    submittedAt: normalizeDateString(data.submittedAt || data.createdAt),
    rejectionReason: data.rejectionReason,
    documentPhotoUrl: data.documentPhotoUrl || data.cniUrl,
  };
};
