export type UserRole = 'vendeur' | 'livreur' | 'admin';

export type DeliveryStatus =
  | 'en_attente'        // 1. En attente (Créée, recherche de coursier)
  | 'assignee'          // 2. Assignée (Livreur sélectionné)
  | 'acceptee'          // 3. Acceptée (Validée par le coursier)
  | 'colis_recupere'    // 4. Colis récupéré (Prise en charge validée)
  | 'en_cours'          // 5. En cours de livraison (En transit vers destination)
  | 'livree'            // 6. Livrée (POD photo/signature/OTP certifiée)
  | 'echec';            // 7. Échec documenté (Injoignable, refus, adresse)

export type AccountLifecycleStatus = 'actif' | 'inactif' | 'suspendu' | 'bloque';

export interface CourierIndividualRemunerationConfig {
  useGeneralTariff: boolean;
  customPricePerKmFCFA?: number;
  customMinEarningFCFA?: number;
  customFixedBonusFCFA?: number;
  bonusFCFA?: number;
  malusFCFA?: number;
  malusReason?: string;
  customCommissionRatePercent?: number;
  specialConditions?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface VendorCommercialConfig {
  customCommissionRatePercent?: number | null;
  fixedOrderFeeFCFA?: number | null;
  serviceFeePercent?: number | null;
  preferredRateDiscountPercent?: number;
  paymentDelayDays?: number;
  specialConditions?: string;
  commercialNotes?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface Courier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatarInitials: string;
  rating: number;
  totalDeliveries: number;
  completedDeliveries?: number;
  cancelledDeliveries?: number;
  totalEarningsFCFA?: number;
  vehicle: string;
  vehiclePlate?: string;
  zone: string;
  distanceKm: number;
  etaMinutes: number;
  status: 'en_ligne' | 'en_course' | 'hors_ligne' | 'suspendu';
  accountStatus?: AccountLifecycleStatus;
  blockedReason?: string;
  isAvailable?: boolean;
  walletBalanceFCFA?: number;
  priceFCFA: number;
  commissionFCFA: number;
  netEarningFCFA: number;
  badge?: string;
  isKycVerified?: boolean;
  kycStatus?: 'non_soumis' | 'en_attente' | 'valide' | 'refuse';
  kycRejectionReason?: string;
  totalReviews?: number;
  locationLat?: number;
  locationLng?: number;
  locationUpdatedAt?: string;
  locationSource?: 'browser_gps' | 'benin_default' | 'live_watch' | 'manual' | string;
  locationAccuracyMeters?: number;
  remunerationConfig?: CourierIndividualRemunerationConfig;
  createdAt?: string;
}

export interface Merchant {
  id: string;
  storeName: string;
  managerName: string;
  phone: string;
  email: string;
  commune: string;
  address: string;
  channel: 'WhatsApp' | 'Instagram' | 'TikTok' | 'E-commerce';
  totalOrders: number;
  totalVolumeFCFA: number;
  rating: number;
  status: 'actif' | 'suspendu' | 'en_attente_kyc';
  accountStatus?: AccountLifecycleStatus;
  blockedReason?: string;
  isVerified: boolean;
  preferredRateDiscountPercent?: number;
  commercialConfig?: VendorCommercialConfig;
  createdAt: string;
}

export interface DeliveryTimelineStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  timestamp?: string;
  status: 'completed' | 'active' | 'pending';
}

export interface CourierRating {
  rating: number; // 1 to 5 stars
  comment?: string;
  tags?: string[];
  ratedAt: string;
  ratedBy?: string; // Merchant storeName or managerName
}

export interface DeliveryPricingSnapshot {
  calculatedAt: string;
  distanceKm: number;
  deliveryType: 'standard' | 'express' | 'urgent';
  vehicleCategory: 'moto' | 'tricycle' | 'voiture' | 'camionnette';
  pricePerKmFCFA: number;
  pickupFixedFeeFCFA: number;
  distanceChargeFCFA: number;
  fragileSurchargeFCFA: number;
  weightSurchargeFCFA: number;
  peakSurchargeFCFA: number;
  deliveryTypeSurchargeFCFA: number;
  vehicleMultiplier: number;
  promoCode?: string;
  promoDiscountFCFA: number;
  minApplied: boolean;
  maxApplied: boolean;
  finalDeliveryFeeFCFA: number;
  source: 'server' | 'client_preview';
  configVersionUpdatedAt?: string;
}

export interface DeliveryRemunerationSnapshot {
  calculatedAt: string;
  usedGeneralTariff: boolean;
  courierId?: string;
  grossDeliveryFeeFCFA: number;
  courierGrossEarningFCFA: number;
  platformCommissionFCFA: number;
  platformCommissionRatePercent: number;
  fixedBonusFCFA: number;
  bonusFCFA: number;
  malusFCFA: number;
  malusReason?: string;
  netCourierEarningFCFA: number;
}

export interface DeliveryCommissionSnapshot {
  calculatedAt: string;
  deliveryFeeFCFA: number;
  platformCommissionFCFA: number;
  vendorCommissionFCFA: number;
  courierCommissionFCFA: number;
  serviceFeeFCFA: number;
  totalPlatformRevenueFCFA: number;
  vendorDiscountFCFA: number;
}

export interface DeliveryOrder {
  id: string; // e.g. '#LL-4192'
  clientId?: string;
  clientName: string;
  clientPhone: string;
  clientNote?: string;
  isClientVerified: boolean;
  channel: 'WhatsApp' | 'Instagram' | 'TikTok' | 'E-commerce';
  pickupLocation: {
    name: string;
    address: string;
    commune: string;
    coordinates?: [number, number];
  };
  dropoffLocation: {
    name: string;
    address: string;
    commune: string;
    details?: string;
    coordinates?: [number, number];
  };
  itemDescription: string;
  itemWeightKg: number;
  itemFormat: 'S' | 'M' | 'L' | 'XL';
  isFragile: boolean;
  itemValueCOD: number; // Montant marchandise à encaisser (COD) in FCFA
  deliveryFee: number;  // Frais de livraison LivraLink in FCFA
  totalCustomerPayable: number; // COD + Fee in FCFA
  distanceKm?: number;
  deliveryType?: 'standard' | 'express' | 'urgent';
  vehicleCategory?: 'moto' | 'tricycle' | 'voiture' | 'camionnette';
  promoCode?: string;
  promoDiscountFCFA?: number;
  pricingSnapshot?: DeliveryPricingSnapshot;
  remunerationSnapshot?: DeliveryRemunerationSnapshot;
  commissionSnapshot?: DeliveryCommissionSnapshot;
  courier?: Courier;
  courierId?: string;
  courierName?: string;
  assignedAt?: string | number;
  courierRating?: CourierRating;
  status: DeliveryStatus;
  statusNote?: string;
  createdAt: string;
  estimatedArrival?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  reassignedAt?: string;
  reassignedReason?: string;
  otpCode?: string; // Code secret à 4 chiffres généré par le vendeur et transmis au client
  otpGeneratedAt?: string;
  podData?: {
    type?: 'otp' | 'photo' | 'signature' | 'complete_tri_factor' | 'admin_override';
    otpCode?: string;
    otpVerified?: boolean;
    verifiedByServer?: boolean;
    photoUrl?: string;
    signatureDataUrl?: string;
    signedByName?: string;
    validatedAt: string;
    code?: string;
  };
  timeline: DeliveryTimelineStep[];
  merchantId?: string;
  merchantEmail?: string;
  merchantStoreName?: string;
  courierLat?: number;
  courierLng?: number;
  courierLocationUpdatedAt?: string;
  dispatchMode?: 'auto' | 'direct';
  dispatchState?: 'idle' | 'searching' | 'offered' | 'assigned' | 'exhausted';
  preferredCourierId?: string | null;
  preferredCourierName?: string | null;
  targetCourierId?: string | null;
  targetCourierName?: string | null;
  targetCourierDistanceKm?: number | null;
  targetIsPreferred?: boolean;
  candidateQueue?: Array<{
    courierId: string;
    name: string;
    distanceKm: number | null;
    isPreferred: boolean;
  }>;
  rejectedCourierIds?: string[];
  expiredCourierIds?: string[];
  offerAttempt?: number;
  offerTimeoutSeconds?: number;
  offerStartedAt?: number;
  offerExpiresAt?: number;
  dispatchFailureReason?: string;
}

export type KycStorageDocType =
  | 'id_front'
  | 'id_back'
  | 'driving_license_front'
  | 'driving_license_back'
  | 'driving_license';

export type KycDocumentSlotKey =
  | 'idFront'
  | 'idBack'
  | 'drivingLicenseFront'
  | 'drivingLicenseBack';

export interface KycUploadedDocumentMeta {
  uploaded: boolean;
  storagePath: string;
  docType: KycStorageDocType;
  fileName: string;
  originalFileName?: string;
  mimeType: string;
  size?: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface KycDocumentsMap {
  idFront?: KycUploadedDocumentMeta;
  idBack?: KycUploadedDocumentMeta;
  drivingLicenseFront?: KycUploadedDocumentMeta;
  drivingLicenseBack?: KycUploadedDocumentMeta;
  drivingLicense?: KycUploadedDocumentMeta;
  cni?: boolean;
  permis?: boolean;
}

export type KycAiAnalysisStatus = 'not_started' | 'processing' | 'completed' | 'failed';
export type KycAiReadabilityStatus = 'readable' | 'partially_readable' | 'unreadable' | 'missing';
export type KycAiExtractionConfidence = 'high' | 'medium' | 'low' | 'unavailable';
export type KycAiCrossCheckStatus =
  | 'match'
  | 'mismatch'
  | 'unverifiable'
  | 'expired'
  | 'expiring_soon'
  | 'missing_document';

export interface KycAiCrossCheckItem {
  field: string;
  declaredValue?: string;
  extractedValue?: string;
  status: KycAiCrossCheckStatus;
  details: string;
}

export interface KycAiAnalysisSlotResult {
  slotKey: KycDocumentSlotKey;
  docType: KycStorageDocType;
  documentPresent: boolean;
  identifiedDocumentType?: string;
  readabilityStatus: KycAiReadabilityStatus;
  extractionConfidence: KycAiExtractionConfidence;
  confidencePercent?: number;
  extractedFields?: {
    lastName?: string;
    firstName?: string;
    fullName?: string;
    documentNumber?: string;
    npi?: string;
    birthDate?: string;
    issuedAt?: string;
    expiresAt?: string;
    licenseCategories?: string;
    vehiclePlate?: string;
    insurerName?: string;
    policyNumber?: string;
    coverageStart?: string;
    coverageEnd?: string;
  };
  detectedDates?: {
    birthDate?: string;
    issuedAt?: string;
    expiresAt?: string;
    coverageStart?: string;
    coverageEnd?: string;
  };
  anomalies: string[];
  summary?: string;
}

export interface KycAiAnalysisData {
  status: KycAiAnalysisStatus;
  provider?: 'gemini';
  model?: string;
  analyzedAt?: string;
  startedAt?: string;
  requestedBy?: string;
  summary?: string;
  extractedData?: {
    lastName?: string;
    firstName?: string;
    fullName?: string;
    idTypeDetected?: string;
    idNumber?: string;
    npi?: string;
    birthDate?: string;
    idExpiresAt?: string;
    licenseNumber?: string;
    licenseCategories?: string;
    licenseExpiresAt?: string;
    vehiclePlate?: string;
    insurancePolicyNumber?: string;
    insuranceInsurer?: string;
    insuranceExpiresAt?: string;
  };
  documents?: Partial<Record<KycDocumentSlotKey, KycAiAnalysisSlotResult>>;
  crossChecks?: KycAiCrossCheckItem[];
  warnings?: string[];
  issues?: string[];
  recommendations?: string[];
  error?: string;
  errorCode?: string;
  usage?: {
    promptTokens?: number;
    candidatesTokens?: number;
    totalTokens?: number;
    estimatedCostEur?: number;
    dailyCountSnapshot?: number;
    dailyCapSnapshot?: number;
    scope?: 'distributed_firestore' | 'instance_memory';
  };
}

export interface KYCUserRequest {
  id: string;
  courierId?: string;
  lastName?: string;
  firstName?: string;
  fullName: string;
  phone: string;
  email?: string;
  role: 'coursier' | 'marchand';
  vehicleType: string;
  vehiclePlate?: string;
  idType?: 'CIP' | 'CNI' | 'PASSPORT';
  npi?: string; // Numéro Personnel d'Identification (NPI) distinct
  idNumber: string; // Numéro de pièce d'identité distinct
  ifuNumber?: string;
  operatingZone: string;
  submittedAt: string;
  status: 'en_attente' | 'valide' | 'refuse';
  rejectionReason?: string;
  documentPhotoUrl?: string;
  documentStoragePath?: string;
  documentMimeType?: string;
  documentFileName?: string;
  documentFile?: File | Blob;
  pendingFiles?: Partial<Record<KycDocumentSlotKey, File | Blob>>;
  documents: KycDocumentsMap;
  aiAnalysis?: KycAiAnalysisData;
}

export interface PricingRule {
  baseDistanceKm: number;
  baseFeeFCFA: number;
  extraPerKmFCFA: number;
  fragileSurchargeFCFA: number;
  commissionRatePercent: number; // 0 for MVP
}

export interface DistanceTierRule {
  id: string;
  label: string;
  minKm: number;
  maxKm: number | null;
  ratePerKmFCFA: number;
  fixedFeeFCFA: number;
}

export interface DeliveryTypePricingRule {
  standardMultiplier: number;
  expressMultiplier: number;
  urgentMultiplier: number;
  expressFixedExtraFCFA: number;
  urgentFixedExtraFCFA: number;
}

export interface VehicleCategoryMultiplier {
  moto: number;
  tricycle: number;
  voiture: number;
  camionnette: number;
}

export interface ExtendedPricingConfig extends PricingRule {
  pricePerKmFCFA: number;
  minDeliveryFeeFCFA: number;
  maxDeliveryFeeFCFA: number;
  fixedPickupFeeFCFA: number;
  roundingStepFCFA: number;
  weightSurchargePerKgFCFA: number;
  nightOrPeakSurchargePercent: number;
  distanceTiers: DistanceTierRule[];
  deliveryTypes: DeliveryTypePricingRule;
  vehicleMultipliers: VehicleCategoryMultiplier;
  activePromoCode: string;
  promoDiscountPercent: number;
  promoMaxDiscountFCFA: number;
}

export interface CourierRemunerationGeneralConfig {
  mode: 'percentage_of_fee' | 'per_km_plus_base';
  courierSharePercent: number;
  perKmFCFA: number;
  baseFixedFCFA: number;
  minEarningFCFA: number;
  peakBonusFCFA: number;
}

export interface CommissionsConfig {
  platformCommissionPercent: number;
  vendorCommissionPercent: number;
  courierCommissionPercent: number;
  serviceFeePercent: number;
  withdrawalFeePercent: number;
  withdrawalFixedFeeFCFA: number;
  transactionFeePercent: number;
  feeMode: 'percentage' | 'fixed' | 'hybrid';
}

export interface PlatformGeneralConfig {
  appName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  description: string;
  officialAddress: string;
  country: string;
  currency: string;
  timezone: string;
  defaultLanguage: string;
  operatingHours: string;
  legalNotice: string;
  cguText: string;
  privacyPolicyText: string;
  vendorTermsText: string;
  courierTermsText: string;
}

export interface PlatformContactsConfig {
  mainPhone: string;
  whatsappPhone: string;
  customerServicePhone: string;
  techSupportPhone: string;
  complaintsPhone: string;
  emergencyPhone: string;
  billingPhone: string;
  notificationContactPhone: string;
}

export interface PlatformEmailsConfig {
  senderName: string;
  contactEmail: string;
  supportEmail: string;
  adminEmail: string;
  notificationsEmail: string;
  billingEmail: string;
  replyToEmail: string;
}

export type EmailTemplateId =
  | 'signup_welcome'
  | 'email_verification'
  | 'password_reset'
  | 'account_suspended'
  | 'account_reactivated'
  | 'kyc_submitted'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'order_created'
  | 'order_assigned'
  | 'order_delivered'
  | 'order_cancelled'
  | 'payment_confirmed'
  | 'admin_alert';

export interface EmailTemplateRecord {
  id: EmailTemplateId;
  name: string;
  category: 'auth' | 'kyc' | 'orders' | 'finance' | 'admin';
  enabled: boolean;
  subject: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  variables: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export type AdminRoleId =
  | 'super_admin'
  | 'admin_general'
  | 'admin_financier'
  | 'responsable_vendeurs'
  | 'responsable_livreurs'
  | 'responsable_support'
  | 'responsable_kyc';

export type AdminPermission =
  | 'overview.view'
  | 'users.read'
  | 'users.manage'
  | 'vendors.read'
  | 'vendors.manage'
  | 'couriers.read'
  | 'couriers.manage'
  | 'couriers.remuneration'
  | 'clients.read'
  | 'deliveries.read'
  | 'deliveries.manage'
  | 'deliveries.reassign'
  | 'deliveries.cancel'
  | 'kyc.read'
  | 'kyc.review'
  | 'pricing.read'
  | 'pricing.manage'
  | 'finance.read'
  | 'finance.manage'
  | 'finance.refund'
  | 'emails.read'
  | 'emails.manage'
  | 'contacts.manage'
  | 'settings.manage'
  | 'disputes.read'
  | 'disputes.resolve'
  | 'audit.read'
  | 'admins.manage'
  | 'backups.manage'
  | 'notifications.manage';

export interface AdminAccountRecord {
  uid: string;
  email: string;
  fullName: string;
  phone?: string;
  roleId: AdminRoleId;
  permissions: AdminPermission[];
  isActive: boolean;
  isSuperAdmin?: boolean;
  isProtectedMaster?: boolean;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

export interface PlatformAuditLog {
  id: string;
  adminUid: string;
  adminEmail: string;
  adminRole: AdminRoleId | string;
  category: 'rbac' | 'vendor' | 'courier' | 'remuneration' | 'pricing' | 'finance' | 'refund' | 'delivery' | 'kyc' | 'email' | 'contacts' | 'settings' | 'security';
  action: string;
  targetType: string;
  targetId: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  result: 'success' | 'denied' | 'failed';
  timestamp: string;
  createdAtMs: number;
}

export interface DeliveryDisputeRecord {
  id: string;
  orderId: string;
  orderDocId?: string;
  merchantId?: string;
  merchantName?: string;
  courierId?: string;
  courierName?: string;
  clientName?: string;
  clientPhone?: string;
  category: 'retard' | 'colis_endommage' | 'client_injoignable' | 'ecart_cod' | 'paiement' | 'comportement' | 'autre';
  subject?: string;
  description: string;
  status: 'ouvert' | 'en_analyse' | 'resolu' | 'clos';
  priority: 'basse' | 'moyenne' | 'normale' | 'haute' | 'critique';
  resolutionNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface RefundRecord {
  id: string;
  orderId?: string;
  targetUid: string;
  targetName: string;
  targetRole: 'vendeur' | 'livreur' | 'client';
  amountFCFA: number;
  reason: string;
  status: 'valide' | 'rejete' | 'en_attente';
  idempotencyKey?: string;
  walletTxId?: string;
  createdByUid: string;
  createdByEmail: string;
  createdAt: string;
}

export interface ClientDirectoryEntry {
  key: string;
  clientId?: string;
  name: string;
  phone: string;
  email?: string;
  communes: string[];
  totalOrders: number;
  deliveredOrders: number;
  disputedOrders: number;
  totalSpentFCFA: number;
  lastOrderAt?: string;
  status: 'actif' | 'a_surveiller';
}

export interface MerchantSettings {
  storeName: string;
  managerName: string;
  phone: string;
  email: string;
  storeCommune?: string;
  defaultPickupAddress: string;
  gpsCoordinates: string;
  storeCoordinates?: [number, number];
  defaultExpress: boolean;
  frequentZones: string[];
  permanentInstructions: string;
  notifyOnCreated: boolean;
  notifyOnStatusChange: boolean;
  notifyOnCourierAssigned: boolean;
  notifyOnDelivered: boolean;
  notifyOnIncident: boolean;
  channelWhatsApp: boolean;
  channelSMS: boolean;
  channelEmail: boolean;
  defaultPaymentMethod: string;
  twoFactorAuth: boolean;
  preferredCourierId?: string;
  preferredCourierName?: string;
  dispatchOfferTimeoutSeconds?: number;
}

export interface CourierSettings {
  fullName: string;
  phone: string;
  email: string;
  parkingBaseAddress: string;
  gpsCoordinates?: string;
  isAvailable: boolean;
  workingHours: string;
  soundAlerts: boolean;
  activeZones: string[];
  vehicleType: string;
  vehiclePlate: string;
  vehicleInsuranceUpToDate: boolean;
  defaultPayoutMethod: string;
  payoutPhone: string;
  isKycVerified?: boolean;
  kycStatus?: 'non_soumis' | 'en_attente' | 'valide' | 'refuse';
  kycRejectionReason?: string;
  twoFactorAuth: boolean;
}

export interface SystemAuditLog {
  id: string;
  timestamp: string;
  type: 'kyc' | 'weather' | 'dispute' | 'pricing' | 'system' | 'security';
  title: string;
  details: string;
}

export interface AppNotification {
  id: string;
  type: 'order_created' | 'order_assigned' | 'order_accepted' | 'order_status' | 'pod_validated' | 'priority_mission' | 'system' | 'dispute' | 'kyc';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  orderId?: string;
  orderDocId?: string;
  senderId?: string;
  recipientId?: string;
  roleTarget?: 'all' | 'vendeur' | 'livreur' | 'admin';
  actionView?: string;
}

export interface PlatformFeatureFlags {
  // Contrôle global d'accès aux espaces
  vendeurSpaceEnabled: boolean;
  vendeurMaintenanceNotice: string;
  livreurSpaceEnabled: boolean;
  livreurMaintenanceNotice: string;
  emergencyBroadcastActive: boolean;
  emergencyBroadcastMessage: string;

  // Contrôle global inscriptions, commandes, paiements & notifications
  allowVendorRegistration: boolean;
  allowCourierRegistration: boolean;
  allowNewOrders: boolean;
  allowPriorityDeliveries: boolean;
  allowPayments: boolean;
  allowNotifications: boolean;
  allowPromotions: boolean;

  // Contrôle des fonctionnalités Vendeurs
  allowExpressCreation: boolean;
  allowWhatsAppOrdering: boolean;
  allowCODCollection: boolean;
  requireClientVerification: boolean;
  allowManualCourierAssignment: boolean;
  showCourierLiveGPS: boolean;
  allowVendorReports: boolean;

  // Contrôle des fonctionnalités Livreurs
  allowInstantWithdrawal: boolean;
  allowMissionRefusal: boolean;
  requireLivePhotoPOD: boolean;
  requireTactileSignaturePOD: boolean;
  requireOtpPOD: boolean;
  allowDirectCallClient: boolean;
  showVendorStoreDetails: boolean;
}

export const DEFAULT_PLATFORM_FEATURE_FLAGS: PlatformFeatureFlags = {
  vendeurSpaceEnabled: true,
  vendeurMaintenanceNotice: "L'espace Vendeur est temporairement en maintenance planifiée pour amélioration de service.",
  livreurSpaceEnabled: true,
  livreurMaintenanceNotice: "L'espace Livreur est temporairement en maintenance planifiée pour amélioration de service.",
  emergencyBroadcastActive: false,
  emergencyBroadcastMessage: "Alerte Météo Cotonou : Fortes pluies prévues, retards de livraison possibles. Conduite prudente conseillée !",

  allowVendorRegistration: true,
  allowCourierRegistration: true,
  allowNewOrders: true,
  allowPriorityDeliveries: true,
  allowPayments: true,
  allowNotifications: true,
  allowPromotions: true,

  allowExpressCreation: true,
  allowWhatsAppOrdering: true,
  allowCODCollection: true,
  requireClientVerification: true,
  allowManualCourierAssignment: true,
  showCourierLiveGPS: true,
  allowVendorReports: true,

  allowInstantWithdrawal: true,
  allowMissionRefusal: true,
  requireLivePhotoPOD: true,
  requireTactileSignaturePOD: true,
  requireOtpPOD: true,
  allowDirectCallClient: true,
  showVendorStoreDetails: true,
};

export interface PlatformConfigBundle {
  general: PlatformGeneralConfig;
  contacts: PlatformContactsConfig;
  emails: PlatformEmailsConfig;
  pricing: ExtendedPricingConfig;
  courierRemuneration: CourierRemunerationGeneralConfig;
  commissions: CommissionsConfig;
  featureFlags: PlatformFeatureFlags;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ChatMessage {
  id: string;
  orderId?: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  recipientId: string;
  recipientName: string;
  recipientRole: UserRole;
  text: string;
  timestamp: string;
  isRead: boolean;
  quickTag?: 'location' | 'otp' | 'delay' | 'pickup_ready' | 'client_unreachable';
}

export interface ChatConversation {
  id: string;
  orderId?: string;
  contactId: string;
  contactName: string;
  contactRole: UserRole;
  contactPhone?: string;
  contactSubtitle?: string;
  lastMessage: string;
  lastTimestamp: string;
  unreadCount: number;
}

