import { UserProfile } from '../firebase/authService';
import { Courier, CourierSettings, Merchant, MerchantSettings } from '../types';

/**
 * Creates completely isolated, clean merchant settings for a given profile or registration form.
 * Ensures that NONE of the old/mock merchant info (Sarah Kouamé, Glam Chic, Haie Vive, MoMo +229 97 •• •• 42)
 * is leaked into a newly registered merchant account.
 */
export const createFreshMerchantSettings = (profile?: Partial<UserProfile> | null): MerchantSettings => {
  const cleanName = profile?.fullName?.trim() || '';
  const cleanStore = profile?.storeName?.trim() || (cleanName ? `Boutique ${cleanName}` : 'Ma Boutique');
  const cleanPhone = profile?.phone?.trim() || '';
  const cleanEmail = profile?.email?.trim() || '';
  const cleanCommune = profile?.locationCommune?.trim() || '';
  const cleanAddress = profile?.locationAddress?.trim() || (cleanCommune ? `Boutique, ${cleanCommune}` : '');
  const cleanGps = profile?.gpsCoordinates?.trim() || '';

  return {
    storeName: cleanStore,
    managerName: cleanName,
    phone: cleanPhone,
    email: cleanEmail,
    storeCommune: cleanCommune,
    defaultPickupAddress: cleanAddress,
    gpsCoordinates: cleanGps,
    storeCoordinates:
      profile?.locationLat && profile?.locationLng
        ? [profile.locationLat, profile.locationLng]
        : undefined,
    defaultExpress: false,
    frequentZones: cleanCommune ? [cleanCommune] : [],
    permanentInstructions: '',
    notifyOnCreated: true,
    notifyOnStatusChange: true,
    notifyOnCourierAssigned: true,
    notifyOnDelivered: true,
    notifyOnIncident: true,
    channelWhatsApp: true,
    channelSMS: true,
    channelEmail: true,
    defaultPaymentMethod: cleanPhone ? `Mobile Money (${cleanPhone})` : '',
    twoFactorAuth: false,
  };
};

/**
 * Creates completely isolated, clean courier settings for a given profile or registration form.
 * Ensures that NONE of the old/mock courier info (Awa Véloce, BJ-6621-RB, Étoile Rouge, MoMo +229 95 •• •• 43)
 * is leaked into a newly registered courier account.
 */
export const createFreshCourierSettings = (profile?: Partial<UserProfile> | null): CourierSettings => {
  const cleanName = profile?.fullName?.trim() || '';
  const cleanPhone = profile?.phone?.trim() || '';
  const cleanEmail = profile?.email?.trim() || '';
  const cleanBase = profile?.locationAddress?.trim() || profile?.locationCommune?.trim() || '';

  return {
    fullName: cleanName,
    phone: cleanPhone,
    email: cleanEmail,
    parkingBaseAddress: cleanBase,
    gpsCoordinates: profile?.gpsCoordinates,
    isAvailable: true,
    workingHours: 'Lundi à Samedi de 08:00 à 19:00',
    soundAlerts: true,
    activeZones: profile?.locationCommune ? [profile.locationCommune] : [],
    vehicleType: profile?.vehicleType || 'Moto 125cc',
    vehiclePlate: '',
    vehicleInsuranceUpToDate: false,
    defaultPayoutMethod: cleanPhone ? `Mobile Money (${cleanPhone})` : '',
    payoutPhone: cleanPhone,
    twoFactorAuth: false,
  };
};

/**
 * Builds a fresh Courier entity for newly registered delivery drivers
 * Initialized with 0 deliveries, 0 FCFA in wallet balance, and pristine status.
 */
export const createFreshCourierEntity = (profile: Partial<UserProfile> & { uid: string; fullName: string }): Courier => {
  const initials = profile.fullName
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .substring(0, 2) || 'CR';

  return {
    id: profile.uid,
    name: profile.fullName.trim(),
    phone: (profile.phone || '').trim(),
    email: (profile.email || '').trim(),
    avatarInitials: initials,
    rating: 5.0,
    totalDeliveries: 0,
    vehicle: profile.vehicleType || 'Moto 125cc',
    vehiclePlate: '',
    zone: profile.locationCommune || 'Cotonou & Alentours',
    distanceKm: 0.8,
    etaMinutes: 5,
    status: 'en_ligne',
    walletBalanceFCFA: 0,
    priceFCFA: 2000,
    commissionFCFA: 0,
    netEarningFCFA: 2000,
    badge: 'Nouveau Livreur',
    isKycVerified: false,
    createdAt: new Date().toISOString().split('T')[0],
  };
};

/**
 * Builds a fresh Merchant entity for newly registered merchants
 * Initialized with 0 orders and 0 FCFA volume.
 */
export const createFreshMerchantEntity = (profile: Partial<UserProfile> & { uid: string; fullName: string }): Merchant => {
  return {
    id: profile.uid,
    storeName: profile.storeName?.trim() || `Boutique ${profile.fullName.trim()}`,
    managerName: profile.fullName.trim(),
    phone: (profile.phone || '').trim(),
    email: (profile.email || '').trim(),
    commune: profile.locationCommune || 'Cotonou',
    address: profile.locationAddress || '',
    channel: 'WhatsApp',
    totalOrders: 0,
    totalVolumeFCFA: 0,
    rating: 5.0,
    status: 'actif',
    isVerified: false,
    createdAt: new Date().toISOString().split('T')[0],
  };
};
