import { DeliveryOrder, Merchant, UserRole } from '../types';

export interface DeliveryDraftData {
  sourceOrderId?: string;
  clientName: string;
  clientPhone: string;
  clientNote: string;
  channel: DeliveryOrder['channel'];
  dropoffCommune: string;
  dropoffAddress: string;
  dropoffCoordinates?: [number, number];
  itemDescription: string;
  itemWeightKg?: number;
  itemFormat: DeliveryOrder['itemFormat'];
  isFragile: boolean;
  itemValueCOD: number;
}

export interface VendorIsolationContext {
  userProfile?: { uid?: string; role?: UserRole | string } | null;
  firebaseUserUid?: string | null;
  isAdminAuthenticated?: boolean;
  isDirectorModeActive?: boolean;
  directorTargetId?: string | null;
  directorTargetName?: string | null;
}

/**
 * Checks strictly whether a delivery order belongs to a specific vendor account UID.
 * Never falls back on storeName, pickupLocation.name, email, or empty merchantId.
 */
export const isOrderOwnedByVendor = (
  order: Pick<DeliveryOrder, 'merchantId'> | null | undefined,
  vendorUid?: string | null
): boolean => {
  if (!order || !vendorUid) return false;
  const cleanVendorUid = String(vendorUid).trim();
  const cleanOrderMerchantId = order.merchantId ? String(order.merchantId).trim() : '';
  if (!cleanVendorUid || !cleanOrderMerchantId) return false;
  return cleanOrderMerchantId === cleanVendorUid;
};

/**
 * Strictly isolates deliveries for Vendor views & components.
 * Returns [] if unauthenticated or if no valid vendor/supervisory context exists.
 */
export const filterVendorDeliveries = (
  deliveries: DeliveryOrder[],
  ctx: VendorIsolationContext
): DeliveryOrder[] => {
  if (!Array.isArray(deliveries) || deliveries.length === 0) return [];

  if (ctx.isDirectorModeActive && ctx.isAdminAuthenticated) {
    if (ctx.directorTargetId) {
      return deliveries.filter((d) => isOrderOwnedByVendor(d, ctx.directorTargetId));
    }
    if (ctx.directorTargetName) {
      const target = ctx.directorTargetName.trim().toLowerCase();
      return deliveries.filter(
        (d) =>
          (d.merchantStoreName && d.merchantStoreName.trim().toLowerCase() === target) ||
          (d.pickupLocation?.name && d.pickupLocation.name.trim().toLowerCase() === target)
      );
    }
    return [];
  }

  const effectiveRole = ctx.userProfile?.role;
  const effectiveUid = ctx.userProfile?.uid || ctx.firebaseUserUid;

  if (effectiveRole === 'vendeur') {
    return deliveries.filter((d) => isOrderOwnedByVendor(d, effectiveUid));
  }

  if (ctx.isAdminAuthenticated && effectiveRole === 'admin') {
    return deliveries;
  }

  return [];
};

/**
 * Checks whether a delivery order belongs to a merchant entity for admin reconciliation.
 * When order.merchantId is present, matching is strictly restricted to merchant.id === order.merchantId.
 */
export const isOrderOwnedByMerchantEntity = (
  order: Pick<DeliveryOrder, 'merchantId' | 'merchantEmail' | 'merchantStoreName' | 'pickupLocation'>,
  merchant: Pick<Merchant, 'id' | 'email' | 'storeName'>
): boolean => {
  if (order.merchantId) {
    return Boolean(merchant.id && order.merchantId === merchant.id);
  }
  if (
    order.merchantEmail &&
    merchant.email &&
    order.merchantEmail.toLowerCase().trim() === merchant.email.toLowerCase().trim()
  ) {
    return true;
  }
  return false;
};

/**
 * Creates a sanitized draft for 1-click "Dupliquer / Relancer" order creation.
 * Refuses to clone if the order is not owned by the active vendor (unless admin supervisory).
 * Never copies order ID, OTP code, courier assignment, POD proof, or foreign pickup info.
 */
export const sanitizeDuplicateOrderDraft = (
  order: DeliveryOrder | null | undefined,
  vendorUid?: string | null,
  allowSupervisory = false
): DeliveryDraftData | null => {
  if (!order) return null;
  if (!allowSupervisory && !isOrderOwnedByVendor(order, vendorUid)) {
    return null;
  }

  return {
    sourceOrderId: order.id,
    clientName: order.clientName || '',
    clientPhone: order.clientPhone || '',
    clientNote: order.clientNote || '',
    channel: order.channel || 'WhatsApp',
    dropoffCommune: order.dropoffLocation?.commune || '',
    dropoffAddress: order.dropoffLocation?.address || '',
    dropoffCoordinates: order.dropoffLocation?.coordinates
      ? [order.dropoffLocation.coordinates[0], order.dropoffLocation.coordinates[1]]
      : undefined,
    itemDescription: order.itemDescription || '',
    itemWeightKg: typeof order.itemWeightKg === 'number' ? order.itemWeightKg : undefined,
    itemFormat: order.itemFormat || 'M',
    isFragile: Boolean(order.isFragile),
    itemValueCOD: typeof order.itemValueCOD === 'number' ? order.itemValueCOD : 0,
  };
};

/**
 * Escapes a single CSV cell and protects against spreadsheet formula injection (=, +, -, @, \t, \r).
 */
export const escapeCsvCell = (value: unknown): string => {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
};

const STATUS_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  assignee: 'Assignée',
  acceptee: 'Acceptée',
  colis_recupere: 'Colis récupéré',
  en_cours: 'En transit',
  livree: 'Livrée (POD)',
  echec: 'Échec',
};

/**
 * Generates an isolated, Excel-compatible CSV (UTF-8 BOM + semicolon separator)
 * strictly restricted to deliveries owned by vendorUid (or supervisory view).
 */
export const buildVendorDeliveryCsv = (
  orders: DeliveryOrder[],
  vendorUid?: string | null,
  storeName?: string,
  allowSupervisory = false
): { csvContent: string; exportedCount: number; filename: string } => {
  const safeOrders = allowSupervisory
    ? orders
    : orders.filter((o) => isOrderOwnedByVendor(o, vendorUid));

  const headers = [
    'ID Course',
    'Date création',
    'Client',
    'Téléphone Client',
    'Commune Destination',
    'Adresse Destination',
    'Description Colis',
    'Montant COD (FCFA)',
    'Frais Livraison (FCFA)',
    'Total Payable (FCFA)',
    'Statut',
    'Livreur',
    'Boutique',
  ];

  const rows = safeOrders.map((order) => [
    order.id,
    order.createdAt ? new Date(order.createdAt).toLocaleString('fr-FR') : '',
    order.clientName || '',
    order.clientPhone || '',
    order.dropoffLocation?.commune || '',
    order.dropoffLocation?.address || '',
    order.itemDescription || '',
    order.itemValueCOD ?? 0,
    order.deliveryFee ?? 0,
    order.totalCustomerPayable ?? (order.itemValueCOD ?? 0) + (order.deliveryFee ?? 0),
    STATUS_LABELS[order.status] || order.status,
    order.courier?.name || 'Non assigné',
    order.merchantStoreName || order.pickupLocation?.name || storeName || '',
  ]);

  const csvLines = [
    headers.map(escapeCsvCell).join(';'),
    ...rows.map((row) => row.map(escapeCsvCell).join(';')),
  ];

  const safeSlug = (storeName || 'boutique')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '') || 'boutique';
  const datePart = new Date().toISOString().split('T')[0];

  return {
    csvContent: `\uFEFF${csvLines.join('\r\n')}`,
    exportedCount: safeOrders.length,
    filename: `livralink-livraisons-${safeSlug}-${datePart}.csv`,
  };
};
