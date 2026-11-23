import {
  calculateCommissionBreakdown,
  calculateCourierRemuneration,
  calculateDynamicDeliveryQuote,
  CalculateOrderQuoteInput,
} from '../utils/pricingCalculator';
import {
  CourierIndividualRemunerationConfig,
  DeliveryCommissionSnapshot,
  DeliveryPricingSnapshot,
  DeliveryRemunerationSnapshot,
  VendorCommercialConfig,
} from '../types';
import { loadPlatformConfigBundle, DbLike } from './platformConfigService';

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
