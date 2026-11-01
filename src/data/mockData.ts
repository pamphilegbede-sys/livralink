import { Courier, Merchant, DeliveryOrder, KYCUserRequest, MerchantSettings, CourierSettings, SystemAuditLog, PricingRule, AppNotification } from '../types';

// Clean production initial arrays for real users & real live operations
export const INITIAL_MERCHANTS: Merchant[] = [];

export const INITIAL_COURIERS: Courier[] = [];

export const INITIAL_DELIVERIES: DeliveryOrder[] = [];

export const INITIAL_KYC_REQUESTS: KYCUserRequest[] = [];

export const INITIAL_MERCHANT_SETTINGS: MerchantSettings = {
  storeName: '',
  managerName: '',
  phone: '',
  email: '',
  storeCommune: 'Cotonou - Haie Vive',
  defaultPickupAddress: '',
  gpsCoordinates: '',
  storeCoordinates: [6.3571, 2.4175],
  defaultExpress: true,
  frequentZones: ['Cotonou - Haie Vive', 'Cotonou - Cadjehoun', 'Cotonou - Akpakpa', 'Abomey-Calavi', 'Porto-Novo'],
  permanentInstructions: '',
  notifyOnCreated: true,
  notifyOnStatusChange: true,
  notifyOnCourierAssigned: true,
  notifyOnDelivered: true,
  notifyOnIncident: true,
  channelWhatsApp: true,
  channelSMS: true,
  channelEmail: true,
  defaultPaymentMethod: 'MTN Mobile Money Bénin',
  twoFactorAuth: false
};

export const INITIAL_COURIER_SETTINGS: CourierSettings = {
  fullName: '',
  phone: '',
  email: '',
  parkingBaseAddress: '',
  isAvailable: false,
  workingHours: 'Lundi à Samedi de 08:00 à 19:30',
  soundAlerts: true,
  activeZones: ['Cotonou Centre', 'Cadjehoun', 'Akpakpa', 'Abomey-Calavi'],
  vehicleType: 'Moto',
  vehiclePlate: '',
  vehicleInsuranceUpToDate: true,
  defaultPayoutMethod: 'MTN Mobile Money Bénin',
  payoutPhone: '',
  twoFactorAuth: false
};

export const INITIAL_AUDIT_LOGS: SystemAuditLog[] = [];

export const PRICING_RULES: PricingRule = {
  baseDistanceKm: 1,
  baseFeeFCFA: 100,
  extraPerKmFCFA: 100,
  fragileSurchargeFCFA: 0,
  commissionRatePercent: 0 // 0% MVP Launch Rate
};

export const INITIAL_NOTIFICATIONS: AppNotification[] = [];
