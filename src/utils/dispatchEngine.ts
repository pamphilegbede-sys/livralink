import { BENIN_COMMUNES_COORDS, getLocationForCommune } from '../config/maps';
import { Courier, DeliveryOrder } from '../types';

export const DEFAULT_OFFER_TIMEOUT_SECONDS = 30;
export const MIN_OFFER_TIMEOUT_SECONDS = 15;
export const MAX_OFFER_TIMEOUT_SECONDS = 180;
export const DEFAULT_GPS_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes max age for real-time GPS freshness

// Synthetic default coordinates returned by detectUserGeolocation() when GPS permission is denied or unavailable
export const BENIN_DEFAULT_FALLBACK_COORDS = {
  lat: 6.3571,
  lng: 2.4175,
};

export interface GpsCoordinatePoint {
  lat: number;
  lng: number;
}

export interface DispatchCourierInput {
  id: string;
  name?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  avatarInitials?: string;
  vehicle?: string;
  vehicleType?: string;
  zone?: string;
  locationCommune?: string;
  role?: string;
  status?: string;
  isAvailable?: boolean;
  isKycVerified?: boolean;
  kycStatus?: string;
  locationLat?: number;
  locationLng?: number;
  gpsCoordinates?: string;
  locationUpdatedAt?: any;
  locationSource?: string;
  locationAccuracyMeters?: number;
  rating?: number;
  totalDeliveries?: number;
}

export interface RankedCourierCandidate {
  courierId: string;
  name: string;
  phone: string;
  email: string;
  vehicle: string;
  zone: string;
  avatarInitials: string;
  rating: number;
  totalDeliveries: number;
  distanceKm: number | null;
  etaMinutes: number;
  isPreferred: boolean;
  locationLat?: number;
  locationLng?: number;
  locationUpdatedAtIso?: string;
  gpsAgeMs?: number;
}

export interface CandidateQueueItem {
  courierId: string;
  name: string;
  distanceKm: number | null;
  isPreferred: boolean;
}

export interface RankCandidatesResult {
  candidates: RankedCourierCandidate[];
  queue: CandidateQueueItem[];
  preferredEligible: boolean;
  preferredFallbackReason?: string;
  excludedStats: {
    ineligibleOrOffline: number;
    alreadyRejectedOrExpired: number;
    missingOrInvalidGps: number;
    staleOrDefaultGps: number;
  };
}

export function clampOfferTimeoutSeconds(rawSeconds?: number | null): number {
  if (typeof rawSeconds !== 'number' || !Number.isFinite(rawSeconds)) {
    return DEFAULT_OFFER_TIMEOUT_SECONDS;
  }
  return Math.max(MIN_OFFER_TIMEOUT_SECONDS, Math.min(MAX_OFFER_TIMEOUT_SECONDS, Math.round(rawSeconds)));
}

/**
 * Pure un-clamped Haversine distance in kilometers (rounded to 2 decimals for display & sorting precision).
 */
export function computeHaversineDistanceKm(p1: GpsCoordinatePoint, p2: GpsCoordinatePoint): number {
  if (!p1 || !p2) return Infinity;
  if (!isValidGpsCoordinate(p1.lat, p1.lng) || !isValidGpsCoordinate(p2.lat, p2.lng)) {
    return Infinity;
  }
  if (p1.lat === p2.lat && p1.lng === p2.lng) return 0;

  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function isValidGpsCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  // Exclude null island (0, 0)
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  return true;
}

export function parseGpsString(gpsCoordinates?: unknown): GpsCoordinatePoint | null {
  if (typeof gpsCoordinates !== 'string') return null;
  const matches = gpsCoordinates.match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return null;
  const lat = Number(matches[0]);
  const lng = Number(matches[1]);
  if (!isValidGpsCoordinate(lat, lng)) return null;
  return { lat, lng };
}

export function parseLocationUpdatedAtMs(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      return Number.isFinite(n) ? (n > 1e12 ? n : n * 1000) : null;
    }
    const ms = Date.parse(trimmed);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value?.toMillis === 'function') {
    try {
      const ms = value.toMillis();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  if (typeof value?.toDate === 'function') {
    try {
      const ms = value.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  if (typeof value?._seconds === 'number') {
    return value._seconds * 1000;
  }
  if (typeof value?.seconds === 'number') {
    return value.seconds * 1000;
  }
  return null;
}

export function extractCourierCoords(courier: DispatchCourierInput): GpsCoordinatePoint | null {
  if (isValidGpsCoordinate(courier.locationLat, courier.locationLng)) {
    return {
      lat: Number(courier.locationLat),
      lng: Number(courier.locationLng),
    };
  }
  return parseGpsString(courier.gpsCoordinates);
}

/**
 * Checks if courier has a genuine, non-synthetic, valid and sufficiently fresh GPS reading.
 */
export function evaluateCourierGpsFreshness(
  courier: DispatchCourierInput,
  nowMs: number = Date.now(),
  maxAgeMs: number = DEFAULT_GPS_MAX_AGE_MS
): {
  valid: boolean;
  coords: GpsCoordinatePoint | null;
  updatedAtMs: number | null;
  ageMs: number | null;
  reason?: 'missing_or_invalid_gps' | 'synthetic_default_gps' | 'missing_timestamp' | 'stale_gps';
} {
  if (courier.locationSource === 'benin_default') {
    return {
      valid: false,
      coords: null,
      updatedAtMs: null,
      ageMs: null,
      reason: 'synthetic_default_gps',
    };
  }

  const coords = extractCourierCoords(courier);
  if (!coords) {
    return {
      valid: false,
      coords: null,
      updatedAtMs: null,
      ageMs: null,
      reason: 'missing_or_invalid_gps',
    };
  }

  // Exact match to hardcoded Cotonou fallback without explicit live browser_gps source is treated as non-GPS fallback
  if (
    courier.locationSource !== 'browser_gps' &&
    courier.locationSource !== 'live_watch' &&
    Math.abs(coords.lat - BENIN_DEFAULT_FALLBACK_COORDS.lat) < 0.00001 &&
    Math.abs(coords.lng - BENIN_DEFAULT_FALLBACK_COORDS.lng) < 0.00001
  ) {
    return {
      valid: false,
      coords: null,
      updatedAtMs: null,
      ageMs: null,
      reason: 'synthetic_default_gps',
    };
  }

  const updatedAtMs = parseLocationUpdatedAtMs(courier.locationUpdatedAt);
  if (updatedAtMs === null) {
    return {
      valid: false,
      coords,
      updatedAtMs: null,
      ageMs: null,
      reason: 'missing_timestamp',
    };
  }

  const ageMs = Math.max(0, nowMs - updatedAtMs);
  if (ageMs > maxAgeMs) {
    return {
      valid: false,
      coords,
      updatedAtMs,
      ageMs,
      reason: 'stale_gps',
    };
  }

  return {
    valid: true,
    coords,
    updatedAtMs,
    ageMs,
  };
}

/**
 * Checks whether a courier account is eligible to receive a dispatch offer:
 * - role is 'livreur' (if provided)
 * - KYC approved
 * - status is 'en_ligne' (strictly NOT 'hors_ligne', 'en_course', 'suspendu')
 * - isAvailable !== false
 */
export function isCourierEligibleForDispatch(courier: DispatchCourierInput): boolean {
  if (!courier || !courier.id) return false;
  if (courier.role && courier.role !== 'livreur') return false;
  const kycOk = Boolean(courier.isKycVerified || courier.kycStatus === 'valide');
  if (!kycOk) return false;
  if (courier.status === 'suspendu' || courier.status === 'hors_ligne' || courier.status === 'en_course') {
    return false;
  }
  if (courier.status !== 'en_ligne') {
    return false;
  }
  if (courier.isAvailable === false) {
    return false;
  }
  return true;
}

export function resolveOrderPickupCoords(order: Partial<DeliveryOrder> & { pickupLocation?: any }): GpsCoordinatePoint {
  const coords = order?.pickupLocation?.coordinates;
  if (Array.isArray(coords) && coords.length === 2 && isValidGpsCoordinate(coords[0], coords[1])) {
    return { lat: Number(coords[0]), lng: Number(coords[1]) };
  }
  const commune = String(order?.pickupLocation?.commune || order?.pickupLocation?.address || '').trim();
  if (commune) {
    const loc = getLocationForCommune(commune);
    if (loc && isValidGpsCoordinate(loc.lat, loc.lng)) {
      return { lat: loc.lat, lng: loc.lng };
    }
  }
  const fallback = BENIN_COMMUNES_COORDS['Cotonou - Haie Vive'];
  return { lat: fallback.lat, lng: fallback.lng };
}

function toRankedCandidate(
  courier: DispatchCourierInput,
  distanceKm: number | null,
  isPreferred: boolean,
  gpsEval?: ReturnType<typeof evaluateCourierGpsFreshness>
): RankedCourierCandidate {
  const name = String(courier.fullName || courier.name || 'Livreur LivraLink').trim();
  const initials =
    courier.avatarInitials ||
    name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .slice(0, 2) ||
    'CR';
  const etaMinutes =
    distanceKm !== null && Number.isFinite(distanceKm)
      ? Math.max(3, Math.round((distanceKm * 1.25) / 26 * 60 + 3))
      : 10;

  return {
    courierId: courier.id,
    name,
    phone: String(courier.phone || '').trim(),
    email: String(courier.email || '').trim().toLowerCase(),
    vehicle: String(courier.vehicleType || courier.vehicle || 'Moto 125cc').trim(),
    zone: String(courier.locationCommune || courier.zone || 'Cotonou').trim(),
    avatarInitials: initials,
    rating: typeof courier.rating === 'number' && Number.isFinite(courier.rating) ? courier.rating : 5.0,
    totalDeliveries: typeof courier.totalDeliveries === 'number' && Number.isFinite(courier.totalDeliveries) ? courier.totalDeliveries : 0,
    distanceKm,
    etaMinutes,
    isPreferred,
    locationLat: gpsEval?.coords?.lat,
    locationLng: gpsEval?.coords?.lng,
    locationUpdatedAtIso: gpsEval?.updatedAtMs ? new Date(gpsEval.updatedAtMs).toISOString() : undefined,
    gpsAgeMs: gpsEval?.ageMs ?? undefined,
  };
}

/**
 * Ranks all eligible couriers for an order:
 * 1. Excludes already rejected/expired couriers.
 * 2. If `preferredCourierId` is specified and that courier is active/available/KYC-verified,
 *    places them FIRST (even without fresh GPS, though distance is calculated when GPS is valid).
 *    If preferred courier is absent, offline, busy, unverified, or already refused/timed out,
 *    records `preferredFallbackReason` and proceeds seamlessly to GPS proximity ranking.
 * 3. Remaining eligible couriers MUST have valid, non-synthetic, fresh GPS coordinates and are
 *    sorted strictly ascending by exact Haversine distance from pickupCoords (tie-broken by fresher GPS & rating).
 */
export function rankDispatchCandidates(params: {
  pickupCoords: GpsCoordinatePoint;
  couriers: DispatchCourierInput[];
  preferredCourierId?: string | null;
  excludedCourierIds?: string[];
  nowMs?: number;
  gpsMaxAgeMs?: number;
}): RankCandidatesResult {
  const {
    pickupCoords,
    couriers,
    preferredCourierId,
    excludedCourierIds = [],
    nowMs = Date.now(),
    gpsMaxAgeMs = DEFAULT_GPS_MAX_AGE_MS,
  } = params;

  const excludedSet = new Set(excludedCourierIds.map((id) => String(id || '').trim()).filter(Boolean));
  const cleanPreferredId = preferredCourierId ? String(preferredCourierId).trim() : '';

  const excludedStats = {
    ineligibleOrOffline: 0,
    alreadyRejectedOrExpired: 0,
    missingOrInvalidGps: 0,
    staleOrDefaultGps: 0,
  };

  let preferredEligible = false;
  let preferredFallbackReason: string | undefined;
  let preferredCandidate: RankedCourierCandidate | null = null;
  const proximityCandidates: RankedCourierCandidate[] = [];

  if (cleanPreferredId) {
    if (excludedSet.has(cleanPreferredId)) {
      preferredFallbackReason = 'Le livreur préféré a déjà refusé ou dépassé le délai sur cette course.';
    } else {
      const prefRecord = couriers.find((c) => c.id === cleanPreferredId);
      if (!prefRecord) {
        preferredFallbackReason = 'Livreur préféré introuvable dans les livreurs enregistrés.';
      } else if (!isCourierEligibleForDispatch(prefRecord)) {
        preferredFallbackReason = `Le livreur préféré (${prefRecord.fullName || prefRecord.name || cleanPreferredId}) est actuellement indisponible ou hors ligne.`;
      } else {
        preferredEligible = true;
        const gpsEval = evaluateCourierGpsFreshness(prefRecord, nowMs, gpsMaxAgeMs);
        const distanceKm = gpsEval.coords
          ? computeHaversineDistanceKm(pickupCoords, gpsEval.coords)
          : null;
        preferredCandidate = toRankedCandidate(prefRecord, distanceKm, true, gpsEval);
      }
    }
  }

  for (const courier of couriers) {
    if (!courier?.id) continue;
    if (cleanPreferredId && courier.id === cleanPreferredId) {
      continue; // Already evaluated as preferred
    }
    if (excludedSet.has(courier.id)) {
      excludedStats.alreadyRejectedOrExpired += 1;
      continue;
    }
    if (!isCourierEligibleForDispatch(courier)) {
      excludedStats.ineligibleOrOffline += 1;
      continue;
    }

    const gpsEval = evaluateCourierGpsFreshness(courier, nowMs, gpsMaxAgeMs);
    if (!gpsEval.valid || !gpsEval.coords) {
      if (gpsEval.reason === 'missing_or_invalid_gps') {
        excludedStats.missingOrInvalidGps += 1;
      } else {
        excludedStats.staleOrDefaultGps += 1;
      }
      continue;
    }

    const distanceKm = computeHaversineDistanceKm(pickupCoords, gpsEval.coords);
    if (!Number.isFinite(distanceKm)) {
      excludedStats.missingOrInvalidGps += 1;
      continue;
    }

    proximityCandidates.push(toRankedCandidate(courier, distanceKm, false, gpsEval));
  }

  proximityCandidates.sort((a, b) => {
    const distA = a.distanceKm ?? Infinity;
    const distB = b.distanceKm ?? Infinity;
    if (distA !== distB) return distA - distB;
    const ageA = a.gpsAgeMs ?? Infinity;
    const ageB = b.gpsAgeMs ?? Infinity;
    if (ageA !== ageB) return ageA - ageB;
    return (b.rating || 5) - (a.rating || 5);
  });

  const candidates = preferredCandidate
    ? [preferredCandidate, ...proximityCandidates]
    : proximityCandidates;

  const queue: CandidateQueueItem[] = candidates.map((c) => ({
    courierId: c.courierId,
    name: c.name,
    distanceKm: c.distanceKm,
    isPreferred: c.isPreferred,
  }));

  return {
    candidates,
    queue,
    preferredEligible,
    preferredFallbackReason,
    excludedStats,
  };
}

export function courierRecordToDispatchInput(c: Courier): DispatchCourierInput {
  return {
    id: c.id,
    name: c.name,
    fullName: c.name,
    phone: c.phone,
    email: c.email,
    avatarInitials: c.avatarInitials,
    vehicle: c.vehicle,
    zone: c.zone,
    role: 'livreur',
    status: c.status,
    isAvailable: c.isAvailable,
    isKycVerified: c.isKycVerified,
    kycStatus: c.kycStatus,
    locationLat: c.locationLat,
    locationLng: c.locationLng,
    locationUpdatedAt: c.locationUpdatedAt,
    locationSource: c.locationSource,
    locationAccuracyMeters: c.locationAccuracyMeters,
    rating: c.rating,
    totalDeliveries: c.totalDeliveries,
  };
}
