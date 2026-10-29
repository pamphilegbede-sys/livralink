export type UserRole = 'vendeur' | 'livreur' | 'admin';

export type DeliveryStatus =
  | 'en_attente'        // 1. En attente (Créée, recherche de coursier)
  | 'assignee'          // 2. Assignée (Livreur sélectionné)
  | 'acceptee'          // 3. Acceptée (Validée par le coursier)
  | 'colis_recupere'    // 4. Colis récupéré (Prise en charge validée)
  | 'en_cours'          // 5. En cours de livraison (En transit vers destination)
  | 'livree'            // 6. Livrée (POD photo/signature/OTP certifiée)
  | 'echec';            // 7. Échec documenté (Injoignable, refus, adresse)

export interface Courier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatarInitials: string;
  rating: number;
  totalDeliveries: number;
  vehicle: string;
  vehiclePlate?: string;
  zone: string;
  distanceKm: number;
  etaMinutes: number;
  status: 'en_ligne' | 'en_course' | 'hors_ligne' | 'suspendu';
  walletBalanceFCFA?: number;
  priceFCFA: number;
  commissionFCFA: number;
  netEarningFCFA: number;
  badge?: string;
  isKycVerified?: boolean;
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
  isVerified: boolean;
  preferredRateDiscountPercent?: number;
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

export interface DeliveryOrder {
  id: string; // e.g. '#LL-4192'
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
  courier?: Courier;
  status: DeliveryStatus;
  statusNote?: string;
  createdAt: string;
  estimatedArrival?: string;
  otpCode?: string; // Code secret à 4 chiffres généré par le vendeur et transmis au client
  otpGeneratedAt?: string;
  podData?: {
    type?: 'otp' | 'photo' | 'signature' | 'complete_tri_factor';
    otpCode?: string;
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
}

export interface KYCUserRequest {
  id: string;
  fullName: string;
  phone: string;
  role: 'coursier' | 'marchand';
  vehicleType: string;
  idNumber: string;
  operatingZone: string;
  submittedAt: string;
  status: 'en_attente' | 'valide' | 'refuse';
  documents: {
    cni: boolean;
    permis: boolean;
    assurance: boolean;
  };
}

export interface PricingRule {
  baseDistanceKm: number;
  baseFeeFCFA: number;
  extraPerKmFCFA: number;
  fragileSurchargeFCFA: number;
  commissionRatePercent: number; // 0 for MVP
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
