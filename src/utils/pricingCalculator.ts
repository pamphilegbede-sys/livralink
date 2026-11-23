import {
  CommissionsConfig,
  CourierIndividualRemunerationConfig,
  CourierRemunerationGeneralConfig,
  DeliveryCommissionSnapshot,
  DeliveryPricingSnapshot,
  DeliveryRemunerationSnapshot,
  ExtendedPricingConfig,
  PlatformContactsConfig,
  PlatformEmailsConfig,
  PlatformFeatureFlags,
  PlatformGeneralConfig,
  PlatformConfigBundle,
  PricingRule,
  VendorCommercialConfig,
  DEFAULT_PLATFORM_FEATURE_FLAGS,
} from '../types';

export const DEFAULT_EXTENDED_PRICING_CONFIG: ExtendedPricingConfig = {
  baseDistanceKm: 1,
  baseFeeFCFA: 100,
  extraPerKmFCFA: 100,
  fragileSurchargeFCFA: 0,
  commissionRatePercent: 0,
  pricePerKmFCFA: 100,
  minDeliveryFeeFCFA: 100,
  maxDeliveryFeeFCFA: 50000,
  fixedPickupFeeFCFA: 0,
  roundingStepFCFA: 50,
  weightSurchargePerKgFCFA: 0,
  nightOrPeakSurchargePercent: 0,
  distanceTiers: [
    { id: 'tier_urban', label: 'Urbain Proche (0 - 5 km)', minKm: 0, maxKm: 5, ratePerKmFCFA: 100, fixedFeeFCFA: 0 },
    { id: 'tier_metro', label: 'Grand Cotonou / Calavi (5 - 15 km)', minKm: 5, maxKm: 15, ratePerKmFCFA: 100, fixedFeeFCFA: 0 },
    { id: 'tier_inter', label: 'Périurbain (> 15 km)', minKm: 15, maxKm: null, ratePerKmFCFA: 100, fixedFeeFCFA: 0 },
  ],
  deliveryTypes: {
    standardMultiplier: 1,
    expressMultiplier: 1.15,
    urgentMultiplier: 1.3,
    expressFixedExtraFCFA: 0,
    urgentFixedExtraFCFA: 0,
  },
  vehicleMultipliers: {
    moto: 1,
    tricycle: 1.25,
    voiture: 1.5,
    camionnette: 2,
  },
  activePromoCode: '',
  promoDiscountPercent: 0,
  promoMaxDiscountFCFA: 2000,
};

export const DEFAULT_COURIER_REMUNERATION_CONFIG: CourierRemunerationGeneralConfig = {
  mode: 'percentage_of_fee',
  courierSharePercent: 100,
  perKmFCFA: 85,
  baseFixedFCFA: 0,
  minEarningFCFA: 100,
  peakBonusFCFA: 0,
};

export const DEFAULT_COMMISSIONS_CONFIG: CommissionsConfig = {
  platformCommissionPercent: 0,
  vendorCommissionPercent: 0,
  courierCommissionPercent: 0,
  serviceFeePercent: 0,
  withdrawalFeePercent: 0,
  withdrawalFixedFeeFCFA: 0,
  transactionFeePercent: 0,
  feeMode: 'percentage',
};

export const DEFAULT_PLATFORM_GENERAL_CONFIG: PlatformGeneralConfig = {
  appName: 'LivraLink',
  tagline: 'Connect & Deliver · Bénin',
  logoUrl: '',
  faviconUrl: '',
  description:
    'Plateforme logistique urbaine connectée reliant vendeurs e-commerce, livreurs vérifiés KYC et clients finaux avec suivi GPS temps réel et Preuve de Livraison (POD) tri-facteur.',
  officialAddress: 'Haie Vive, Cotonou, République du Bénin',
  country: 'Bénin',
  currency: 'FCFA',
  timezone: 'Africa/Porto-Novo',
  defaultLanguage: 'fr',
  operatingHours: '07:00 - 22:00 (7j/7)',
  legalNotice: 'LivraLink Technologies — Plateforme logistique conforme à la Loi n° 2017-20 portant Code du Numérique en République du Bénin.',
  cguText:
    'Les expéditions effectuées via LivraLink font l’objet d’un suivi géolocalisé et d’une validation POD tri-facteur (OTP + photo + signature). Toute fraude ou fausse déclaration entraîne la suspension immédiate du compte.',
  privacyPolicyText:
    'Conformément au Code du Numérique en République du Bénin (Loi n° 2017-20), LivraLink protège les données personnelles des vendeurs, livreurs et destinataires et ne les cède jamais à des tiers commerciaux.',
  vendorTermsText:
    'Le vendeur garantit la licéité des colis confiés, renseigne exactement le montant COD à encaisser et met le colis à disposition au point de collecte convenu.',
  courierTermsText:
    'Le livreur doit disposer d’un dossier KYC validé, respecter les consignes de sécurité routière, exiger le code OTP client avant toute remise et maintenir sa position GPS active en mission.',
};

export const DEFAULT_PLATFORM_CONTACTS_CONFIG: PlatformContactsConfig = {
  mainPhone: '+229 01 97 00 00 00',
  whatsappPhone: '+229 01 97 00 00 00',
  customerServicePhone: '+229 01 97 00 00 01',
  techSupportPhone: '+229 01 97 00 00 02',
  complaintsPhone: '+229 01 97 00 00 03',
  emergencyPhone: '+229 01 97 00 00 04',
  billingPhone: '+229 01 97 00 00 05',
  notificationContactPhone: '+229 01 97 00 00 00',
};

export const DEFAULT_PLATFORM_EMAILS_CONFIG: PlatformEmailsConfig = {
  senderName: 'LivraLink Bénin',
  contactEmail: 'contact@livralink.oxy-dev.cc',
  supportEmail: 'support@livralink.oxy-dev.cc',
  adminEmail: 'Pamphile.gbede@gmail.com',
  notificationsEmail: 'notifications@livralink.oxy-dev.cc',
  billingEmail: 'facturation@livralink.oxy-dev.cc',
  replyToEmail: 'support@livralink.oxy-dev.cc',
};

export const DEFAULT_PLATFORM_CONFIG_BUNDLE: PlatformConfigBundle = {
  general: DEFAULT_PLATFORM_GENERAL_CONFIG,
  contacts: DEFAULT_PLATFORM_CONTACTS_CONFIG,
  emails: DEFAULT_PLATFORM_EMAILS_CONFIG,
  pricing: DEFAULT_EXTENDED_PRICING_CONFIG,
  courierRemuneration: DEFAULT_COURIER_REMUNERATION_CONFIG,
  commissions: DEFAULT_COMMISSIONS_CONFIG,
  featureFlags: DEFAULT_PLATFORM_FEATURE_FLAGS,
};

export function normalizePricingConfig(raw?: Partial<ExtendedPricingConfig & PricingRule> | null): ExtendedPricingConfig {
  const merged: ExtendedPricingConfig = {
    ...DEFAULT_EXTENDED_PRICING_CONFIG,
    ...(raw || {}),
    deliveryTypes: {
      ...DEFAULT_EXTENDED_PRICING_CONFIG.deliveryTypes,
      ...(raw?.deliveryTypes || {}),
    },
    vehicleMultipliers: {
      ...DEFAULT_EXTENDED_PRICING_CONFIG.vehicleMultipliers,
      ...(raw?.vehicleMultipliers || {}),
    },
    distanceTiers:
      Array.isArray(raw?.distanceTiers) && raw.distanceTiers.length > 0
        ? raw.distanceTiers
        : DEFAULT_EXTENDED_PRICING_CONFIG.distanceTiers,
  };

  if (typeof raw?.extraPerKmFCFA === 'number' && raw.pricePerKmFCFA === undefined) {
    merged.pricePerKmFCFA = Math.max(0, raw.extraPerKmFCFA);
  }
  if (typeof raw?.pricePerKmFCFA === 'number') {
    merged.extraPerKmFCFA = Math.max(0, raw.pricePerKmFCFA);
  }
  if (typeof raw?.baseFeeFCFA === 'number' && raw.minDeliveryFeeFCFA === undefined) {
    merged.minDeliveryFeeFCFA = Math.max(50, raw.baseFeeFCFA);
  }

  return merged;
}

export interface CalculateOrderQuoteInput {
  distanceKm: number;
  isFragile?: boolean;
  itemWeightKg?: number;
  deliveryType?: 'standard' | 'express' | 'urgent';
  vehicleCategory?: 'moto' | 'tricycle' | 'voiture' | 'camionnette';
  promoCode?: string;
  vendorDiscountPercent?: number;
  allowPromotions?: boolean;
  isPeakPeriod?: boolean;
  source?: 'server' | 'client_preview';
  configVersionUpdatedAt?: string;
}

export function calculateDynamicDeliveryQuote(
  input: CalculateOrderQuoteInput,
  rawPricing?: Partial<ExtendedPricingConfig> | null
): DeliveryPricingSnapshot {
  const cfg = normalizePricingConfig(rawPricing);
  const safeDistanceKm = Math.max(0.5, Math.round((Number(input.distanceKm) || 1) * 10) / 10);
  const deliveryType = input.deliveryType || 'standard';
  const vehicleCategory = input.vehicleCategory || 'moto';
  const weightKg = Math.max(0, Number(input.itemWeightKg) || 0);

  // Determine effective per-km rate (tiered if matched, otherwise global pricePerKmFCFA)
  const matchedTier = cfg.distanceTiers.find((t) => {
    const minOk = safeDistanceKm >= t.minKm;
    const maxOk = t.maxKm === null || t.maxKm === undefined || safeDistanceKm <= t.maxKm;
    return minOk && maxOk;
  });

  const effectiveRatePerKm =
    matchedTier && typeof matchedTier.ratePerKmFCFA === 'number' && matchedTier.ratePerKmFCFA > 0
      ? matchedTier.ratePerKmFCFA
      : Math.max(0, cfg.pricePerKmFCFA || 100);

  const tierFixedFee = matchedTier && typeof matchedTier.fixedFeeFCFA === 'number' ? Math.max(0, matchedTier.fixedFeeFCFA) : 0;
  const pickupFixedFeeFCFA = Math.max(0, Number(cfg.fixedPickupFeeFCFA) || 0) + tierFixedFee;
  const distanceChargeFCFA = Math.round(safeDistanceKm * effectiveRatePerKm);

  const vehicleMultiplier = Math.max(0.5, Number(cfg.vehicleMultipliers?.[vehicleCategory] ?? 1));
  const typeMultiplier =
    deliveryType === 'express'
      ? Math.max(1, Number(cfg.deliveryTypes?.expressMultiplier ?? 1.15))
      : deliveryType === 'urgent'
        ? Math.max(1, Number(cfg.deliveryTypes?.urgentMultiplier ?? 1.3))
        : Math.max(1, Number(cfg.deliveryTypes?.standardMultiplier ?? 1));

  const typeFixedExtra =
    deliveryType === 'express'
      ? Math.max(0, Number(cfg.deliveryTypes?.expressFixedExtraFCFA ?? 0))
      : deliveryType === 'urgent'
        ? Math.max(0, Number(cfg.deliveryTypes?.urgentFixedExtraFCFA ?? 0))
        : 0;

  const baseCourseBeforeModifiers = pickupFixedFeeFCFA + distanceChargeFCFA;
  const vehicleAdjusted = Math.round(baseCourseBeforeModifiers * vehicleMultiplier);
  const deliveryTypeSurchargeFCFA =
    Math.round(vehicleAdjusted * (typeMultiplier - 1)) + typeFixedExtra;

  const fragileSurchargeFCFA = input.isFragile ? Math.max(0, Number(cfg.fragileSurchargeFCFA) || 0) : 0;
  const billableExtraWeight = Math.max(0, weightKg - 5);
  const weightSurchargePerKg = Math.max(0, Number(cfg.weightSurchargePerKgFCFA) || 0);
  const weightSurchargeFCFA = Math.round(billableExtraWeight * weightSurchargePerKg);

  const subtotalBeforePeak =
    vehicleAdjusted + deliveryTypeSurchargeFCFA + fragileSurchargeFCFA + weightSurchargeFCFA;
  const peakSurchargeFCFA =
    input.isPeakPeriod && cfg.nightOrPeakSurchargePercent > 0
      ? Math.round((subtotalBeforePeak * cfg.nightOrPeakSurchargePercent) / 100)
      : 0;

  let grossFee = subtotalBeforePeak + peakSurchargeFCFA;

  let promoDiscountFCFA = 0;
  const promoEnabled = input.allowPromotions !== false;
  const cleanCode = (input.promoCode || '').trim().toUpperCase();
  const configuredCode = (cfg.activePromoCode || '').trim().toUpperCase();
  if (promoEnabled && cleanCode && configuredCode && cleanCode === configuredCode && cfg.promoDiscountPercent > 0) {
    const rawPromo = Math.round((grossFee * cfg.promoDiscountPercent) / 100);
    promoDiscountFCFA =
      cfg.promoMaxDiscountFCFA > 0 ? Math.min(rawPromo, cfg.promoMaxDiscountFCFA) : rawPromo;
  }

  if (typeof input.vendorDiscountPercent === 'number' && input.vendorDiscountPercent > 0) {
    const boundedPct = Math.min(50, Math.max(0, input.vendorDiscountPercent));
    promoDiscountFCFA += Math.round((grossFee * boundedPct) / 100);
  }

  grossFee = Math.max(0, grossFee - promoDiscountFCFA);

  const step = Math.max(1, Number(cfg.roundingStepFCFA) || 50);
  let roundedFee = Math.ceil(grossFee / step) * step;

  const minFee = Math.max(50, Number(cfg.minDeliveryFeeFCFA ?? cfg.baseFeeFCFA) || 100);
  const maxFee = Math.max(minFee, Number(cfg.maxDeliveryFeeFCFA) || 50000);

  let minApplied = false;
  let maxApplied = false;
  if (roundedFee < minFee) {
    roundedFee = minFee;
    minApplied = true;
  }
  if (roundedFee > maxFee) {
    roundedFee = maxFee;
    maxApplied = true;
  }

  return {
    calculatedAt: new Date().toISOString(),
    distanceKm: safeDistanceKm,
    deliveryType,
    vehicleCategory,
    pricePerKmFCFA: effectiveRatePerKm,
    pickupFixedFeeFCFA,
    distanceChargeFCFA,
    fragileSurchargeFCFA,
    weightSurchargeFCFA,
    peakSurchargeFCFA,
    deliveryTypeSurchargeFCFA,
    vehicleMultiplier,
    promoCode: cleanCode || undefined,
    promoDiscountFCFA,
    minApplied,
    maxApplied,
    finalDeliveryFeeFCFA: roundedFee,
    source: input.source || 'client_preview',
    configVersionUpdatedAt: input.configVersionUpdatedAt,
  };
}

export function calculateCourierRemuneration(params: {
  deliveryFeeFCFA: number;
  distanceKm: number;
  courierId?: string;
  individualConfig?: CourierIndividualRemunerationConfig | null;
  generalConfig?: Partial<CourierRemunerationGeneralConfig> | null;
  commissionsConfig?: Partial<CommissionsConfig> | null;
  pricingConfig?: Partial<ExtendedPricingConfig> | null;
}): DeliveryRemunerationSnapshot {
  const deliveryFeeFCFA = Math.max(0, Math.round(Number(params.deliveryFeeFCFA) || 0));
  const distanceKm = Math.max(0.5, Number(params.distanceKm) || 1);
  const gen: CourierRemunerationGeneralConfig = {
    ...DEFAULT_COURIER_REMUNERATION_CONFIG,
    ...(params.generalConfig || {}),
  };
  const comm: CommissionsConfig = {
    ...DEFAULT_COMMISSIONS_CONFIG,
    ...(params.commissionsConfig || {}),
  };
  const indiv = params.individualConfig || null;
  const useGeneral = !indiv || indiv.useGeneralTariff !== false;

  if (useGeneral) {
    const commissionRate = Math.min(
      50,
      Math.max(
        0,
        Number(
          comm.courierCommissionPercent ||
            comm.platformCommissionPercent ||
            params.pricingConfig?.commissionRatePercent ||
            0
        )
      )
    );
    let courierGross = 0;
    if (gen.mode === 'per_km_plus_base') {
      courierGross = Math.round(gen.baseFixedFCFA + distanceKm * gen.perKmFCFA + (gen.peakBonusFCFA || 0));
    } else {
      const effectiveSharePct = commissionRate > 0 ? Math.max(0, 100 - commissionRate) : gen.courierSharePercent;
      courierGross = Math.round((deliveryFeeFCFA * Math.min(100, Math.max(10, effectiveSharePct))) / 100) + (gen.peakBonusFCFA || 0);
    }
    courierGross = Math.max(gen.minEarningFCFA || 100, courierGross);
    const platformCommissionFCFA = Math.max(0, deliveryFeeFCFA - Math.min(deliveryFeeFCFA, courierGross));
    return {
      calculatedAt: new Date().toISOString(),
      usedGeneralTariff: true,
      courierId: params.courierId,
      grossDeliveryFeeFCFA: deliveryFeeFCFA,
      courierGrossEarningFCFA: courierGross,
      platformCommissionFCFA,
      platformCommissionRatePercent: commissionRate,
      fixedBonusFCFA: 0,
      bonusFCFA: gen.peakBonusFCFA || 0,
      malusFCFA: 0,
      netCourierEarningFCFA: courierGross,
    };
  }

  // Individual courier tariff override
  const customRatePerKm =
    typeof indiv.customPricePerKmFCFA === 'number' && indiv.customPricePerKmFCFA >= 0
      ? indiv.customPricePerKmFCFA
      : gen.perKmFCFA;
  const customMin =
    typeof indiv.customMinEarningFCFA === 'number' && indiv.customMinEarningFCFA >= 0
      ? indiv.customMinEarningFCFA
      : gen.minEarningFCFA;
  const fixedBonusFCFA = Math.max(0, Number(indiv.customFixedBonusFCFA) || 0);
  const bonusFCFA = Math.max(0, Number(indiv.bonusFCFA) || 0);
  const malusFCFA = Math.max(0, Number(indiv.malusFCFA) || 0);
  const commissionRate =
    typeof indiv.customCommissionRatePercent === 'number' && indiv.customCommissionRatePercent >= 0
      ? Math.min(50, indiv.customCommissionRatePercent)
      : Math.min(50, Math.max(0, comm.courierCommissionPercent || comm.platformCommissionPercent || 0));

  const distanceEarning = Math.round(distanceKm * customRatePerKm);
  const commissionCut = Math.round((deliveryFeeFCFA * commissionRate) / 100);
  const feeBasedEarning = Math.max(0, deliveryFeeFCFA - commissionCut);
  const baseCoursePay = Math.max(customMin, distanceEarning > 0 ? distanceEarning : feeBasedEarning);
  const net = Math.max(0, baseCoursePay + fixedBonusFCFA + bonusFCFA - malusFCFA);

  return {
    calculatedAt: new Date().toISOString(),
    usedGeneralTariff: false,
    courierId: params.courierId,
    grossDeliveryFeeFCFA: deliveryFeeFCFA,
    courierGrossEarningFCFA: baseCoursePay,
    platformCommissionFCFA: commissionCut,
    platformCommissionRatePercent: commissionRate,
    fixedBonusFCFA,
    bonusFCFA,
    malusFCFA,
    malusReason: indiv.malusReason,
    netCourierEarningFCFA: net,
  };
}

export function calculateCommissionBreakdown(params: {
  deliveryFeeFCFA: number;
  vendorConfig?: VendorCommercialConfig | null;
  courierConfig?: CourierIndividualRemunerationConfig | null;
  commissionsConfig?: Partial<CommissionsConfig> | null;
  pricingConfig?: Partial<ExtendedPricingConfig> | null;
  vendorDiscountFCFA?: number;
}): DeliveryCommissionSnapshot {
  const deliveryFeeFCFA = Math.max(0, Math.round(Number(params.deliveryFeeFCFA) || 0));
  const comm: CommissionsConfig = {
    ...DEFAULT_COMMISSIONS_CONFIG,
    ...(params.commissionsConfig || {}),
  };

  const vendorRatePct =
    typeof params.vendorConfig?.customCommissionRatePercent === 'number'
      ? Math.max(0, Math.min(50, params.vendorConfig.customCommissionRatePercent))
      : Math.max(0, Math.min(50, comm.vendorCommissionPercent || 0));

  const courierRatePct =
    params.courierConfig && params.courierConfig.useGeneralTariff === false && typeof params.courierConfig.customCommissionRatePercent === 'number'
      ? Math.max(0, Math.min(50, params.courierConfig.customCommissionRatePercent))
      : Math.max(0, Math.min(50, comm.courierCommissionPercent || comm.platformCommissionPercent || params.pricingConfig?.commissionRatePercent || 0));

  const servicePct =
    typeof params.vendorConfig?.serviceFeePercent === 'number'
      ? Math.max(0, Math.min(30, params.vendorConfig.serviceFeePercent))
      : Math.max(0, Math.min(30, comm.serviceFeePercent || 0));

  const vendorFixed = Math.max(0, Number(params.vendorConfig?.fixedOrderFeeFCFA) || 0);
  const vendorCommissionFCFA = Math.round((deliveryFeeFCFA * vendorRatePct) / 100) + vendorFixed;
  const courierCommissionFCFA = Math.round((deliveryFeeFCFA * courierRatePct) / 100);
  const serviceFeeFCFA = Math.round((deliveryFeeFCFA * servicePct) / 100);
  const platformCommissionFCFA = Math.max(
    courierCommissionFCFA,
    Math.round((deliveryFeeFCFA * Math.max(0, comm.platformCommissionPercent || 0)) / 100)
  );
  const totalPlatformRevenueFCFA = vendorCommissionFCFA + Math.max(courierCommissionFCFA, platformCommissionFCFA) + serviceFeeFCFA;

  return {
    calculatedAt: new Date().toISOString(),
    deliveryFeeFCFA,
    platformCommissionFCFA,
    vendorCommissionFCFA,
    courierCommissionFCFA,
    serviceFeeFCFA,
    totalPlatformRevenueFCFA,
    vendorDiscountFCFA: Math.max(0, Number(params.vendorDiscountFCFA) || 0),
  };
}
