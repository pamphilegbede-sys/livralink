import {
  DEFAULT_PLATFORM_CONFIG_BUNDLE,
  normalizePricingConfig,
} from '../utils/pricingCalculator';
import {
  DEFAULT_PLATFORM_FEATURE_FLAGS,
  EmailTemplateId,
  EmailTemplateRecord,
  PlatformConfigBundle,
} from '../types';
import { escapeHtml } from './p1EmailAndConfig';

export const PLATFORM_SETTINGS_DOC_ID = 'platform_settings';
export const EMAIL_TEMPLATES_DOC_ID = 'email_templates';

export interface DbLike {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, any> | undefined }>;
      set(data: Record<string, any>, options?: { merge?: boolean }): Promise<any>;
    };
  };
}

export const ALL_EMAIL_TEMPLATE_IDS: EmailTemplateId[] = [
  'signup_welcome',
  'email_verification',
  'password_reset',
  'account_suspended',
  'account_reactivated',
  'kyc_submitted',
  'kyc_approved',
  'kyc_rejected',
  'order_created',
  'order_assigned',
  'order_delivered',
  'order_cancelled',
  'payment_confirmed',
  'admin_alert',
];

export function getDefaultEmailTemplates(): Record<EmailTemplateId, EmailTemplateRecord> {
  return {
    signup_welcome: {
      id: 'signup_welcome',
      name: 'Bienvenue / Inscription',
      category: 'auth',
      enabled: true,
      subject: 'Bienvenue sur {{appName}}, {{fullName}} !',
      title: 'Votre compte {{roleLabel}} est prêt',
      bodyHtml:
        '<p>Bonjour <strong>{{fullName}}</strong>,</p><p>Votre compte <strong>{{roleLabel}}</strong> sur <strong>{{appName}}</strong> est activé. Connectez-vous pour gérer vos livraisons en toute sécurité.</p><p>Assistance : {{supportEmail}} · {{supportPhone}}</p>',
      bodyText:
        'Bonjour {{fullName}}, votre compte {{roleLabel}} sur {{appName}} est activé. Assistance : {{supportEmail}} ({{supportPhone}}).',
      variables: ['appName', 'fullName', 'roleLabel', 'email', 'supportEmail', 'supportPhone'],
    },
    email_verification: {
      id: 'email_verification',
      name: 'Vérification d’e-mail',
      category: 'auth',
      enabled: true,
      subject: '{{appName}} — Confirmez votre adresse e-mail',
      title: 'Validation de votre adresse e-mail',
      bodyHtml:
        '<p>Bonjour <strong>{{fullName}}</strong>,</p><p>Veuillez confirmer votre adresse e-mail (<strong>{{email}}</strong>) pour débloquer l’ensemble des fonctionnalités de {{appName}}.</p>',
      bodyText: 'Bonjour {{fullName}}, veuillez confirmer votre adresse e-mail {{email}} sur {{appName}}.',
      variables: ['appName', 'fullName', 'email', 'verificationUrl', 'supportEmail'],
    },
    password_reset: {
      id: 'password_reset',
      name: 'Réinitialisation de mot de passe',
      category: 'auth',
      enabled: true,
      subject: '{{appName}} — Code OTP de réinitialisation sécurisée',
      title: 'Code de vérification sécurité',
      bodyHtml:
        '<p>Bonjour <strong>{{fullName}}</strong>,</p><p>Votre code OTP confidentiel pour réinitialiser votre mot de passe est : <strong style="font-size:20px;">{{otpCode}}</strong> (valide {{expiryMinutes}} min).</p>',
      bodyText: 'Bonjour {{fullName}}, votre code OTP de réinitialisation {{appName}} est : {{otpCode}} (valide {{expiryMinutes}} min).',
      variables: ['appName', 'fullName', 'otpCode', 'expiryMinutes', 'supportEmail'],
    },
    account_suspended: {
      id: 'account_suspended',
      name: 'Compte suspendu / bloqué',
      category: 'auth',
      enabled: true,
      subject: '⚠️ {{appName}} — Statut de votre compte mis à jour ({{accountStatus}})',
      title: 'Restriction d’accès à votre compte',
      bodyHtml:
        '<p>Bonjour <strong>{{fullName}}</strong>,</p><p>Votre compte est actuellement placé sous statut <strong>{{accountStatus}}</strong>.</p><p>Motif : {{reason}}</p><p>Contactez notre support à {{supportEmail}} ou au {{supportPhone}} pour régularisation.</p>',
      bodyText: 'Bonjour {{fullName}}, statut compte : {{accountStatus}}. Motif : {{reason}}. Support : {{supportEmail}} / {{supportPhone}}.',
      variables: ['appName', 'fullName', 'accountStatus', 'reason', 'supportEmail', 'supportPhone'],
    },
    account_reactivated: {
      id: 'account_reactivated',
      name: 'Compte réactivé',
      category: 'auth',
      enabled: true,
      subject: '✅ {{appName}} — Votre compte est de nouveau actif',
      title: 'Réactivation confirmée',
      bodyHtml:
        '<p>Bonjour <strong>{{fullName}}</strong>,</p><p>Bonne nouvelle ! Votre compte <strong>{{appName}}</strong> a été réactivé par l’administration.</p><p>Note : {{reason}}</p>',
      bodyText: 'Bonjour {{fullName}}, votre compte {{appName}} est réactivé. Note : {{reason}}.',
      variables: ['appName', 'fullName', 'reason', 'supportEmail'],
    },
    kyc_submitted: {
      id: 'kyc_submitted',
      name: 'KYC soumis',
      category: 'kyc',
      enabled: true,
      subject: '📥 {{appName}} — Dossier KYC bien reçu',
      title: 'Accusé de réception de votre dossier KYC',
      bodyHtml:
        '<p>Bonjour <strong>{{fullName}}</strong>,</p><p>Nous avons bien reçu vos 4 pièces justificatives KYC ({{submittedAt}}). Notre équipe examine votre dossier sous peu.</p>',
      bodyText: 'Bonjour {{fullName}}, vos documents KYC ont bien été transmis le {{submittedAt}}.',
      variables: ['appName', 'fullName', 'submittedAt', 'supportEmail'],
    },
    kyc_approved: {
      id: 'kyc_approved',
      name: 'KYC validé',
      category: 'kyc',
      enabled: true,
      subject: '🎉 {{appName}} — Dossier KYC validé !',
      title: 'Accréditation officielle activée',
      bodyHtml:
        '<p>Félicitations <strong>{{fullName}}</strong>,</p><p>Votre dossier KYC est <strong>validé</strong>. Vous pouvez désormais recevoir et exécuter des missions prioritaires sur {{appName}}.</p>',
      bodyText: 'Félicitations {{fullName}}, votre dossier KYC sur {{appName}} est validé.',
      variables: ['appName', 'fullName', 'supportEmail'],
    },
    kyc_rejected: {
      id: 'kyc_rejected',
      name: 'KYC refusé',
      category: 'kyc',
      enabled: true,
      subject: '⚠️ {{appName}} — Action requise sur votre dossier KYC',
      title: 'Dossier KYC à corriger',
      bodyHtml:
        '<p>Bonjour <strong>{{fullName}}</strong>,</p><p>Votre dossier KYC n’a pas pu être validé pour le motif suivant :</p><blockquote style="border-left:4px solid #dc2626;padding-left:12px;">{{reason}}</blockquote><p>Merci de soumettre des documents lisibles et valides depuis votre espace.</p>',
      bodyText: 'Bonjour {{fullName}}, votre dossier KYC a été refusé. Motif : {{reason}}.',
      variables: ['appName', 'fullName', 'reason', 'supportEmail'],
    },
    order_created: {
      id: 'order_created',
      name: 'Nouvelle commande créée',
      category: 'orders',
      enabled: true,
      subject: '📦 {{appName}} — Nouvelle commande {{orderId}} enregistrée',
      title: 'Commande {{orderId}} créée',
      bodyHtml:
        '<p>Bonjour <strong>{{recipientName}}</strong>,</p><p>La course <strong>{{orderId}}</strong> ({{pickupCommune}} → {{dropoffCommune}}) d’un montant livraison de <strong>{{deliveryFee}} FCFA</strong> est créée.</p>',
      bodyText: 'Commande {{orderId}} créée ({{pickupCommune}} -> {{dropoffCommune}}) — Frais : {{deliveryFee}} FCFA.',
      variables: ['appName', 'recipientName', 'orderId', 'pickupCommune', 'dropoffCommune', 'deliveryFee'],
    },
    order_assigned: {
      id: 'order_assigned',
      name: 'Commande attribuée',
      category: 'orders',
      enabled: true,
      subject: '🛵 {{appName}} — Course {{orderId}} attribuée à {{courierName}}',
      title: 'Coursier assigné',
      bodyHtml:
        '<p>Bonjour <strong>{{recipientName}}</strong>,</p><p>Le livreur <strong>{{courierName}}</strong> ({{courierPhone}}) a été attribué à la course <strong>{{orderId}}</strong>.</p>',
      bodyText: 'La course {{orderId}} a été attribuée au coursier {{courierName}} ({{courierPhone}}).',
      variables: ['appName', 'recipientName', 'orderId', 'courierName', 'courierPhone'],
    },
    order_delivered: {
      id: 'order_delivered',
      name: 'Commande livrée (POD)',
      category: 'orders',
      enabled: true,
      subject: '✅ {{appName}} — Livraison {{orderId}} certifiée (POD)',
      title: 'Colis remis avec preuve POD',
      bodyHtml:
        '<p>Bonjour <strong>{{recipientName}}</strong>,</p><p>La course <strong>{{orderId}}</strong> a été livrée et validée par Preuve de Livraison tri-facteur le {{deliveredAt}}.</p>',
      bodyText: 'La course {{orderId}} a été livrée et certifiée POD le {{deliveredAt}}.',
      variables: ['appName', 'recipientName', 'orderId', 'deliveredAt', 'deliveryFee'],
    },
    order_cancelled: {
      id: 'order_cancelled',
      name: 'Commande annulée',
      category: 'orders',
      enabled: true,
      subject: '❌ {{appName}} — Course {{orderId}} annulée',
      title: 'Annulation de livraison',
      bodyHtml:
        '<p>Bonjour <strong>{{recipientName}}</strong>,</p><p>La course <strong>{{orderId}}</strong> a été annulée.</p><p>Motif : {{reason}}</p>',
      bodyText: 'La course {{orderId}} a été annulée. Motif : {{reason}}.',
      variables: ['appName', 'recipientName', 'orderId', 'reason', 'supportEmail'],
    },
    payment_confirmed: {
      id: 'payment_confirmed',
      name: 'Paiement / remboursement confirmé',
      category: 'finance',
      enabled: true,
      subject: '💰 {{appName}} — Opération financière confirmée ({{amountFCFA}} FCFA)',
      title: 'Confirmation financière',
      bodyHtml:
        '<p>Bonjour <strong>{{recipientName}}</strong>,</p><p>Une opération de <strong>{{amountFCFA}} FCFA</strong> ({{operationLabel}}) a été confirmée. Référence : <strong>{{reference}}</strong>.</p>',
      bodyText: 'Opération {{operationLabel}} de {{amountFCFA}} FCFA confirmée. Référence : {{reference}}.',
      variables: ['appName', 'recipientName', 'amountFCFA', 'operationLabel', 'reference', 'billingEmail'],
    },
    admin_alert: {
      id: 'admin_alert',
      name: 'Alerte / notification administrative',
      category: 'admin',
      enabled: true,
      subject: '🚨 [ADMIN {{appName}}] {{alertTitle}}',
      title: '{{alertTitle}}',
      bodyHtml:
        '<p>Notification système <strong>{{appName}}</strong> :</p><p>{{alertMessage}}</p><p>Acteur : {{actorEmail}} · Date : {{timestamp}}</p>',
      bodyText: '[ADMIN {{appName}}] {{alertTitle}} : {{alertMessage}} (Par {{actorEmail}} le {{timestamp}})',
      variables: ['appName', 'alertTitle', 'alertMessage', 'actorEmail', 'timestamp'],
    },
  };
}

export function sanitizeTemplateHtml(rawHtml: string): string {
  return String(rawHtml || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

export function renderEmailTemplate(
  template: EmailTemplateRecord,
  variables: Record<string, string | number | undefined | null>,
  configBundle?: Partial<PlatformConfigBundle>
): { subject: string; title: string; htmlContent: string; textContent: string } {
  const appName = configBundle?.general?.appName || DEFAULT_PLATFORM_CONFIG_BUNDLE.general.appName;
  const supportEmail = configBundle?.emails?.supportEmail || DEFAULT_PLATFORM_CONFIG_BUNDLE.emails.supportEmail;
  const billingEmail = configBundle?.emails?.billingEmail || DEFAULT_PLATFORM_CONFIG_BUNDLE.emails.billingEmail;
  const supportPhone = configBundle?.contacts?.customerServicePhone || DEFAULT_PLATFORM_CONFIG_BUNDLE.contacts.mainPhone;

  const mergedVars: Record<string, string> = {
    appName,
    supportEmail,
    billingEmail,
    supportPhone,
  };
  for (const [k, v] of Object.entries(variables || {})) {
    mergedVars[k] = v === undefined || v === null ? '' : String(v);
  }

  const replacePlain = (tpl: string) =>
    String(tpl || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => mergedVars[key] ?? '');

  const replaceEscaped = (tpl: string) =>
    sanitizeTemplateHtml(tpl).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) =>
      escapeHtml(mergedVars[key] ?? '')
    );

  const subject = replacePlain(template.subject);
  const title = replacePlain(template.title);
  const bodyHtml = replaceEscaped(template.bodyHtml);
  const textContent = replacePlain(template.bodyText);

  const htmlContent = `
    <div style="font-family:'Plus Jakarta Sans',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px;border:1px solid #e2e8f0;color:#0f172a;">
      <div style="background:#0f172a;color:#ffffff;padding:18px 22px;border-radius:12px;margin-bottom:18px;">
        <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#fbbf24;font-weight:700;">${escapeHtml(appName)}</div>
        <h2 style="margin:6px 0 0;font-size:18px;font-weight:800;">${escapeHtml(title)}</h2>
      </div>
      <div style="background:#ffffff;padding:20px;border-radius:12px;border:1px solid #e2e8f0;font-size:14px;line-height:1.6;">
        ${bodyHtml}
      </div>
      <p style="margin-top:16px;font-size:11px;color:#64748b;text-align:center;">
        ${escapeHtml(appName)} · ${escapeHtml(supportEmail)} · ${escapeHtml(supportPhone)}
      </p>
    </div>
  `.trim();

  return { subject, title, htmlContent, textContent };
}

export function mergePlatformConfigBundle(raw?: Record<string, any> | null): PlatformConfigBundle {
  const data = raw || {};
  const pricing = normalizePricingConfig({
    ...(DEFAULT_PLATFORM_CONFIG_BUNDLE.pricing),
    ...(data.pricingRules || {}),
    ...(data.pricing || {}),
  });

  return {
    general: {
      ...DEFAULT_PLATFORM_CONFIG_BUNDLE.general,
      ...(data.general || {}),
    },
    contacts: {
      ...DEFAULT_PLATFORM_CONFIG_BUNDLE.contacts,
      ...(data.contacts || {}),
    },
    emails: {
      ...DEFAULT_PLATFORM_CONFIG_BUNDLE.emails,
      ...(data.emails || {}),
    },
    pricing,
    courierRemuneration: {
      ...DEFAULT_PLATFORM_CONFIG_BUNDLE.courierRemuneration,
      ...(data.courierRemuneration || {}),
    },
    commissions: {
      ...DEFAULT_PLATFORM_CONFIG_BUNDLE.commissions,
      ...(data.commissions || {}),
      platformCommissionPercent:
        typeof data.commissions?.platformCommissionPercent === 'number'
          ? data.commissions.platformCommissionPercent
          : pricing.commissionRatePercent,
    },
    featureFlags: {
      ...DEFAULT_PLATFORM_FEATURE_FLAGS,
      ...(data.featureFlags || {}),
    },
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
  };
}

interface ConfigCacheEntry {
  bundle: PlatformConfigBundle;
  source: 'firestore' | 'defaults';
  expiresAt: number;
}

const CONFIG_CACHE_TTL_MS = 30_000;
const platformConfigCacheByDb = new WeakMap<object, ConfigCacheEntry>();
const platformConfigInFlightByDb = new WeakMap<object, Promise<{ bundle: PlatformConfigBundle; source: 'firestore' | 'defaults' }>>();
let configCacheHits = 0;
let configCacheMisses = 0;

export function invalidatePlatformConfigCache(db?: DbLike | null): void {
  if (db && typeof db === 'object') {
    platformConfigCacheByDb.delete(db);
    platformConfigInFlightByDb.delete(db);
  }
}

export function getPlatformConfigCacheStats() {
  const total = configCacheHits + configCacheMisses;
  return {
    name: 'platform-config-l1',
    hits: configCacheHits,
    misses: configCacheMisses,
    hitRatePercent: total > 0 ? Math.round((configCacheHits / total) * 1000) / 10 : 0,
  };
}

export async function loadPlatformConfigBundle(
  db?: DbLike | null,
  options?: { bypassCache?: boolean }
): Promise<{
  bundle: PlatformConfigBundle;
  source: 'firestore' | 'defaults';
}> {
  if (!db) {
    return { bundle: DEFAULT_PLATFORM_CONFIG_BUNDLE, source: 'defaults' };
  }

  const now = Date.now();
  if (!options?.bypassCache) {
    const cached = platformConfigCacheByDb.get(db);
    if (cached && now < cached.expiresAt) {
      configCacheHits += 1;
      return { bundle: cached.bundle, source: cached.source };
    }
    const pending = platformConfigInFlightByDb.get(db);
    if (pending) {
      configCacheHits += 1;
      return pending;
    }
  }

  configCacheMisses += 1;
  const loadPromise = (async (): Promise<{ bundle: PlatformConfigBundle; source: 'firestore' | 'defaults' }> => {
    const snap = await db.collection('system_config').doc(PLATFORM_SETTINGS_DOC_ID).get();
    const result: { bundle: PlatformConfigBundle; source: 'firestore' | 'defaults' } = !snap.exists
      ? { bundle: DEFAULT_PLATFORM_CONFIG_BUNDLE, source: 'defaults' }
      : { bundle: mergePlatformConfigBundle(snap.data()), source: 'firestore' };

    platformConfigCacheByDb.set(db, {
      ...result,
      expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
    });
    return result;
  })().finally(() => {
    platformConfigInFlightByDb.delete(db);
  });

  platformConfigInFlightByDb.set(db, loadPromise);
  return loadPromise;
}

export async function savePlatformConfigSection(
  db: DbLike,
  patch: Partial<PlatformConfigBundle> & { pricingRules?: Record<string, any> },
  actorEmail: string
): Promise<PlatformConfigBundle> {
  const current = await loadPlatformConfigBundle(db, { bypassCache: true });
  const merged = mergePlatformConfigBundle({
    ...current.bundle,
    ...patch,
    general: { ...current.bundle.general, ...(patch.general || {}) },
    contacts: { ...current.bundle.contacts, ...(patch.contacts || {}) },
    emails: { ...current.bundle.emails, ...(patch.emails || {}) },
    pricing: { ...current.bundle.pricing, ...(patch.pricingRules || {}), ...(patch.pricing || {}) },
    courierRemuneration: { ...current.bundle.courierRemuneration, ...(patch.courierRemuneration || {}) },
    commissions: { ...current.bundle.commissions, ...(patch.commissions || {}) },
    featureFlags: { ...current.bundle.featureFlags, ...(patch.featureFlags || {}) },
  });

  // Keep legacy pricingRules synchronized so older clients remain 100% compatible
  const legacyPricingRules = {
    baseDistanceKm: merged.pricing.baseDistanceKm,
    baseFeeFCFA: merged.pricing.baseFeeFCFA,
    extraPerKmFCFA: merged.pricing.pricePerKmFCFA,
    fragileSurchargeFCFA: merged.pricing.fragileSurchargeFCFA,
    commissionRatePercent: merged.commissions.platformCommissionPercent ?? merged.pricing.commissionRatePercent,
  };

  const nowIso = new Date().toISOString();
  const payload = {
    ...merged,
    pricingRules: legacyPricingRules,
    updatedAt: nowIso,
    updatedBy: actorEmail,
  };

  await db.collection('system_config').doc(PLATFORM_SETTINGS_DOC_ID).set(payload, { merge: true });
  const updatedBundle = { ...merged, updatedAt: nowIso, updatedBy: actorEmail };
  platformConfigCacheByDb.set(db, {
    bundle: updatedBundle,
    source: 'firestore',
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  });
  return updatedBundle;
}

export function extractPublicPlatformConfig(bundle: PlatformConfigBundle) {
  return {
    general: {
      appName: bundle.general.appName,
      tagline: bundle.general.tagline,
      logoUrl: bundle.general.logoUrl,
      faviconUrl: bundle.general.faviconUrl,
      description: bundle.general.description,
      officialAddress: bundle.general.officialAddress,
      country: bundle.general.country,
      currency: bundle.general.currency,
      timezone: bundle.general.timezone,
      defaultLanguage: bundle.general.defaultLanguage,
      operatingHours: bundle.general.operatingHours,
      legalNotice: bundle.general.legalNotice,
      cguText: bundle.general.cguText,
      privacyPolicyText: bundle.general.privacyPolicyText,
      vendorTermsText: bundle.general.vendorTermsText,
      courierTermsText: bundle.general.courierTermsText,
    },
    contacts: {
      mainPhone: bundle.contacts.mainPhone,
      whatsappPhone: bundle.contacts.whatsappPhone,
      customerServicePhone: bundle.contacts.customerServicePhone,
      techSupportPhone: bundle.contacts.techSupportPhone,
      complaintsPhone: bundle.contacts.complaintsPhone,
      emergencyPhone: bundle.contacts.emergencyPhone,
    },
    emails: {
      senderName: bundle.emails.senderName,
      contactEmail: bundle.emails.contactEmail,
      supportEmail: bundle.emails.supportEmail,
    },
    pricing: {
      pricePerKmFCFA: bundle.pricing.pricePerKmFCFA,
      minDeliveryFeeFCFA: bundle.pricing.minDeliveryFeeFCFA,
      maxDeliveryFeeFCFA: bundle.pricing.maxDeliveryFeeFCFA,
      fixedPickupFeeFCFA: bundle.pricing.fixedPickupFeeFCFA,
      fragileSurchargeFCFA: bundle.pricing.fragileSurchargeFCFA,
      roundingStepFCFA: bundle.pricing.roundingStepFCFA,
      weightSurchargePerKgFCFA: bundle.pricing.weightSurchargePerKgFCFA,
      nightOrPeakSurchargePercent: bundle.pricing.nightOrPeakSurchargePercent,
      distanceTiers: bundle.pricing.distanceTiers,
      deliveryTypes: bundle.pricing.deliveryTypes,
      vehicleMultipliers: bundle.pricing.vehicleMultipliers,
      promoDiscountPercent: bundle.pricing.promoDiscountPercent,
      promoMaxDiscountFCFA: bundle.pricing.promoMaxDiscountFCFA,
    },
    featureFlags: {
      vendeurSpaceEnabled: bundle.featureFlags.vendeurSpaceEnabled,
      vendeurMaintenanceNotice: bundle.featureFlags.vendeurMaintenanceNotice,
      livreurSpaceEnabled: bundle.featureFlags.livreurSpaceEnabled,
      livreurMaintenanceNotice: bundle.featureFlags.livreurMaintenanceNotice,
      emergencyBroadcastActive: bundle.featureFlags.emergencyBroadcastActive,
      emergencyBroadcastMessage: bundle.featureFlags.emergencyBroadcastMessage,
      allowVendorRegistration: bundle.featureFlags.allowVendorRegistration,
      allowCourierRegistration: bundle.featureFlags.allowCourierRegistration,
      allowNewOrders: bundle.featureFlags.allowNewOrders,
      allowPriorityDeliveries: bundle.featureFlags.allowPriorityDeliveries,
      allowPayments: bundle.featureFlags.allowPayments,
      allowNotifications: bundle.featureFlags.allowNotifications,
      allowPromotions: bundle.featureFlags.allowPromotions,
    },
  };
}

const EMAIL_TEMPLATES_CACHE_TTL_MS = 60_000;
const emailTemplatesCacheByDb = new WeakMap<object, { templates: Record<EmailTemplateId, EmailTemplateRecord>; expiresAt: number }>();

export function invalidateEmailTemplatesCache(db?: DbLike | null): void {
  if (db && typeof db === 'object') {
    emailTemplatesCacheByDb.delete(db);
  }
}

export async function loadEmailTemplates(
  db?: DbLike | null,
  options?: { bypassCache?: boolean }
): Promise<Record<EmailTemplateId, EmailTemplateRecord>> {
  const defaults = getDefaultEmailTemplates();
  if (!db) return defaults;

  if (!options?.bypassCache) {
    const cached = emailTemplatesCacheByDb.get(db);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.templates;
    }
  }

  const snap = await db.collection('system_config').doc(EMAIL_TEMPLATES_DOC_ID).get();
  if (!snap.exists) {
    emailTemplatesCacheByDb.set(db, { templates: defaults, expiresAt: Date.now() + EMAIL_TEMPLATES_CACHE_TTL_MS });
    return defaults;
  }
  const stored = (snap.data()?.templates || {}) as Partial<Record<EmailTemplateId, Partial<EmailTemplateRecord>>>;
  const merged = { ...defaults };
  for (const id of ALL_EMAIL_TEMPLATE_IDS) {
    if (stored[id]) {
      merged[id] = {
        ...defaults[id],
        ...stored[id],
        id,
      };
    }
  }
  emailTemplatesCacheByDb.set(db, { templates: merged, expiresAt: Date.now() + EMAIL_TEMPLATES_CACHE_TTL_MS });
  return merged;
}

export async function saveEmailTemplate(
  db: DbLike,
  templateId: EmailTemplateId,
  patch: Partial<EmailTemplateRecord>,
  actorEmail: string
): Promise<EmailTemplateRecord> {
  const current = await loadEmailTemplates(db, { bypassCache: true });
  const existing = current[templateId];
  const nowIso = new Date().toISOString();
  const rawHtml = typeof patch.bodyHtml === 'string'
    ? patch.bodyHtml
    : typeof (patch as any).htmlBody === 'string'
      ? (patch as any).htmlBody
      : undefined;
  const rawText = typeof patch.bodyText === 'string'
    ? patch.bodyText
    : typeof (patch as any).textBody === 'string'
      ? (patch as any).textBody
      : undefined;
  const updated: EmailTemplateRecord = {
    ...existing,
    name: typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim().slice(0, 120) : existing.name,
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : existing.enabled,
    subject: typeof patch.subject === 'string' && patch.subject.trim() ? patch.subject.trim().slice(0, 240) : existing.subject,
    title: typeof patch.title === 'string' && patch.title.trim() ? patch.title.trim().slice(0, 200) : existing.title,
    bodyHtml: typeof rawHtml === 'string' ? sanitizeTemplateHtml(rawHtml).slice(0, 8000) : existing.bodyHtml,
    bodyText: typeof rawText === 'string' ? rawText.slice(0, 4000) : existing.bodyText,
    updatedAt: nowIso,
    updatedBy: actorEmail,
  };
  await db.collection('system_config').doc(EMAIL_TEMPLATES_DOC_ID).set(
    {
      templates: {
        [templateId]: updated,
      },
      updatedAt: nowIso,
      updatedBy: actorEmail,
    },
    { merge: true }
  );
  invalidateEmailTemplatesCache(db);
  return updated;
}
