import {
  calculateCommissionBreakdown,
  calculateCourierRemuneration,
  calculateDynamicDeliveryQuote,
  CalculateOrderQuoteInput,
} from '../utils/pricingCalculator';
import {
  calculateDistanceKm,
  findBeninCommuneLocation,
  getLocationForCommune,
  isValidBeninCoordinate,
} from '../config/maps';
import {
  CourierIndividualRemunerationConfig,
  DeliveryCommissionSnapshot,
  DeliveryPricingSnapshot,
  DeliveryRemunerationSnapshot,
  VendorCommercialConfig,
} from '../types';
import { loadPlatformConfigBundle, DbLike } from './platformConfigService';

export interface RouteLocationInput {
  name?: unknown;
  address?: unknown;
  commune?: unknown;
  coordinates?: unknown;
}

export interface ValidatedRouteLocation {
  name: string;
  address: string;
  commune: string;
  coordinates: [number, number];
}

export class ServerRouteValidationError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const MAX_COMMUNE_COORDINATE_DRIFT_KM = 25;

function resolveAndValidateEndpoint(
  input: unknown,
  roleLabel: 'collecte' | 'livraison',
  defaultName: string,
  defaultCommune: string
): ValidatedRouteLocation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ServerRouteValidationError(
      400,
      'INVALID_ROUTE_LOCATION',
      `Les informations de ${roleLabel} (commune ou coordonnées GPS) sont requises.`
    );
  }
  const raw = input as RouteLocationInput;
  const communeRaw = typeof raw.commune === 'string' ? raw.commune.trim().slice(0, 128) : '';
  const addressRaw = typeof raw.address === 'string' ? raw.address.trim().slice(0, 256) : '';
  const nameRaw = typeof raw.name === 'string' ? raw.name.trim().slice(0, 128) : '';

  const matchedCommune = findBeninCommuneLocation(communeRaw || addressRaw);
  const resolvedCommune = communeRaw || matchedCommune?.commune || defaultCommune;
  const fallbackPoint = matchedCommune || getLocationForCommune(resolvedCommune);

  let finalLat = fallbackPoint.lat;
  let finalLng = fallbackPoint.lng;

  if (raw.coordinates !== undefined && raw.coordinates !== null) {
    if (!Array.isArray(raw.coordinates) || raw.coordinates.length !== 2) {
      throw new ServerRouteValidationError(
        400,
        'INVALID_COORDINATES',
        `Coordonnées GPS de ${roleLabel} invalides.`
      );
    }
    const lat = Number(raw.coordinates[0]);
    const lng = Number(raw.coordinates[1]);
    if (!isValidBeninCoordinate(lat, lng)) {
      throw new ServerRouteValidationError(
        400,
        'COORDINATES_OUT_OF_BOUNDS',
        `Les coordonnées GPS de ${roleLabel} sont hors de la zone de couverture autorisée.`
      );
    }
    if (matchedCommune) {
      const driftKm = calculateDistanceKm(
        { lat, lng },
        { lat: matchedCommune.lat, lng: matchedCommune.lng }
      );
      if (driftKm > MAX_COMMUNE_COORDINATE_DRIFT_KM) {
        throw new ServerRouteValidationError(
          400,
          'COORDINATES_COMMUNE_MISMATCH',
          `Les coordonnées GPS de ${roleLabel} ne correspondent pas à la commune déclarée (${matchedCommune.commune}).`
        );
      }
    }
    finalLat = Math.round(lat * 100000) / 100000;
    finalLng = Math.round(lng * 100000) / 100000;
  } else if (!communeRaw && !addressRaw) {
    throw new ServerRouteValidationError(
      400,
      'MISSING_ROUTE_LOCATION',
      `La commune ou les coordonnées GPS de ${roleLabel} sont requises.`
    );
  }

  return {
    name: nameRaw || defaultName,
    address: addressRaw || fallbackPoint.address || resolvedCommune,
    commune: resolvedCommune,
    coordinates: [finalLat, finalLng],
  };
}

export function resolveAuthoritativeRouteDistance(params: {
  pickupLocation: unknown;
  dropoffLocation: unknown;
  defaultPickupName?: string;
  defaultDropoffName?: string;
}): {
  pickupLocation: ValidatedRouteLocation;
  dropoffLocation: ValidatedRouteLocation;
  distanceKm: number;
} {
  const pickupLocation = resolveAndValidateEndpoint(
    params.pickupLocation,
    'collecte',
    params.defaultPickupName || 'Boutique Vendeur',
    'Cotonou - Haie Vive'
  );
  const dropoffLocation = resolveAndValidateEndpoint(
    params.dropoffLocation,
    'livraison',
    params.defaultDropoffName || 'Destinataire',
    'Cotonou - Cadjehoun'
  );

  const distanceKm = calculateDistanceKm(
    { lat: pickupLocation.coordinates[0], lng: pickupLocation.coordinates[1] },
    { lat: dropoffLocation.coordinates[0], lng: dropoffLocation.coordinates[1] }
  );

  return {
    pickupLocation,
    dropoffLocation,
    distanceKm: Math.min(1000, Math.max(1, distanceKm)),
  };
}

export async function computeAuthoritativeOrderFinancials(
  db: DbLike | null | undefined,
  params: CalculateOrderQuoteInput & {
    merchantId?: string;
    courierId?: string;
  }
): Promise<{
  pricingSnapshot: DeliveryPricingSnapshot;
  remunerationSnapshot: DeliveryRemunerationSnapshot;
  commissionSnapshot: DeliveryCommissionSnapshot;
  featureBlocked?: string;
}> {
  const { bundle } = await loadPlatformConfigBundle(db);

  if (!bundle.featureFlags.allowNewOrders) {
    return {
      pricingSnapshot: calculateDynamicDeliveryQuote(params, bundle.pricing),
      remunerationSnapshot: calculateCourierRemuneration({
        deliveryFeeFCFA: 0,
        distanceKm: params.distanceKm,
      }),
      commissionSnapshot: calculateCommissionBreakdown({ deliveryFeeFCFA: 0 }),
      featureBlocked: 'La création de nouvelles commandes est temporairement suspendue par l’administrateur.',
    };
  }

  let vendorConfig: VendorCommercialConfig | null = null;
  let vendorDiscountPercent = params.vendorDiscountPercent || 0;
  let courierConfig: CourierIndividualRemunerationConfig | null = null;

  if (db && params.merchantId) {
    try {
      const mSnap = await db.collection('users').doc(params.merchantId).get();
      if (mSnap.exists) {
        const mData = mSnap.data() || {};
        if (mData.commercialConfig && typeof mData.commercialConfig === 'object') {
          vendorConfig = mData.commercialConfig as VendorCommercialConfig;
        }
        if (typeof mData.preferredRateDiscountPercent === 'number') {
          vendorDiscountPercent = Math.max(vendorDiscountPercent, mData.preferredRateDiscountPercent);
        }
        if (typeof vendorConfig?.preferredRateDiscountPercent === 'number') {
          vendorDiscountPercent = Math.max(vendorDiscountPercent, vendorConfig.preferredRateDiscountPercent);
        }
      }
    } catch {
      // ignore read failure, continue with defaults
    }
  }

  if (db && params.courierId) {
    try {
      const cSnap = await db.collection('users').doc(params.courierId).get();
      if (cSnap.exists) {
        const cData = cSnap.data() || {};
        if (cData.remunerationConfig && typeof cData.remunerationConfig === 'object') {
          courierConfig = cData.remunerationConfig as CourierIndividualRemunerationConfig;
        }
      }
    } catch {
      // ignore read failure
    }
  }

  const pricingSnapshot = calculateDynamicDeliveryQuote(
    {
      ...params,
      vendorDiscountPercent,
      allowPromotions: bundle.featureFlags.allowPromotions,
      source: 'server',
      configVersionUpdatedAt: bundle.updatedAt,
    },
    bundle.pricing
  );

  const remunerationSnapshot = calculateCourierRemuneration({
    deliveryFeeFCFA: pricingSnapshot.finalDeliveryFeeFCFA,
    distanceKm: pricingSnapshot.distanceKm,
    courierId: params.courierId,
    individualConfig: courierConfig,
    generalConfig: bundle.courierRemuneration,
    commissionsConfig: bundle.commissions,
    pricingConfig: bundle.pricing,
  });

  const commissionSnapshot = calculateCommissionBreakdown({
    deliveryFeeFCFA: pricingSnapshot.finalDeliveryFeeFCFA,
    vendorConfig,
    courierConfig,
    commissionsConfig: bundle.commissions,
    pricingConfig: bundle.pricing,
    vendorDiscountFCFA: pricingSnapshot.promoDiscountFCFA,
  });

  return {
    pricingSnapshot,
    remunerationSnapshot,
    commissionSnapshot,
  };
}
