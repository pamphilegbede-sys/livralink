import crypto from 'crypto';
import type {
  PayoutProviderAdapter,
  PayoutProviderRequest,
  PayoutProviderResult,
} from './p0Security';

export type PayoutProviderMode = 'simulator' | 'fedapay' | 'kkiapay' | 'mtn_momo' | 'wave';

export const LIVE_MOBILE_MONEY_MODES: readonly PayoutProviderMode[] = [
  'fedapay',
  'kkiapay',
  'mtn_momo',
  'wave',
];

const SUPPORTED_MODES = new Set<PayoutProviderMode>([
  'simulator',
  'fedapay',
  'kkiapay',
  'mtn_momo',
  'wave',
]);

export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export function isSimulatedProviderReference(ref: unknown): boolean {
  return typeof ref === 'string' && /^SIM_LLP_/i.test(ref.trim());
}

export interface PayoutProviderReadiness {
  mode: PayoutProviderMode;
  rawMode: string;
  isSimulated: boolean;
  liveConfigured: boolean;
  ready: boolean;
  simulatorForbiddenInProduction: boolean;
  missingEnvVars: string[];
  invalidReason?: string;
}

export function evaluatePayoutProviderConfig(
  env: NodeJS.ProcessEnv = process.env
): PayoutProviderReadiness {
  const isProduction = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const rawMode = (env.PAYOUT_PROVIDER_MODE || 'simulator').trim().toLowerCase();
  if (!SUPPORTED_MODES.has(rawMode as PayoutProviderMode)) {
    return {
      mode: 'simulator',
      rawMode,
      isSimulated: false,
      liveConfigured: false,
      ready: false,
      simulatorForbiddenInProduction: isProduction,
      missingEnvVars: [],
      invalidReason: `PAYOUT_PROVIDER_MODE non reconnu ("${rawMode}"). Valeurs autorisées : fedapay, kkiapay, mtn_momo, wave (ou simulator hors production).`,
    };
  }

  const mode = rawMode as PayoutProviderMode;
  if (mode === 'simulator') {
    if (isProduction) {
      return {
        mode: 'simulator',
        rawMode,
        isSimulated: true,
        liveConfigured: false,
        ready: false,
        simulatorForbiddenInProduction: true,
        missingEnvVars: [
          'PAYOUT_PROVIDER_MODE (fedapay | kkiapay | mtn_momo | wave)',
          'MOBILE_MONEY_API_BASE_URL',
          'MOBILE_MONEY_API_KEY',
          'MOBILE_MONEY_WEBHOOK_SECRET',
        ],
        invalidReason:
          'Mode simulateur strictement interdit en production (NODE_ENV=production). Configurez un agrégateur Mobile Money réel.',
      };
    }

    return {
      mode: 'simulator',
      rawMode,
      isSimulated: true,
      liveConfigured: false,
      ready: true,
      simulatorForbiddenInProduction: false,
      missingEnvVars: [],
    };
  }

  const missingEnvVars: string[] = [];
  const baseUrl = (env.MOBILE_MONEY_API_BASE_URL || '').trim();
  const apiKey = (env.MOBILE_MONEY_API_KEY || '').trim();
  const webhookSecret = (env.MOBILE_MONEY_WEBHOOK_SECRET || '').trim();

  if (!baseUrl) {
    missingEnvVars.push('MOBILE_MONEY_API_BASE_URL');
  } else {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== 'https:') {
        missingEnvVars.push('MOBILE_MONEY_API_BASE_URL (HTTPS requis)');
      }
    } catch {
      missingEnvVars.push('MOBILE_MONEY_API_BASE_URL (URL invalide)');
    }
  }
  if (!apiKey) {
    missingEnvVars.push('MOBILE_MONEY_API_KEY');
  }
  if (!webhookSecret || webhookSecret.length < 16) {
    missingEnvVars.push('MOBILE_MONEY_WEBHOOK_SECRET (>= 16 caractères)');
  }

  const liveConfigured = missingEnvVars.length === 0;
  return {
    mode,
    rawMode,
    isSimulated: false,
    liveConfigured,
    ready: liveConfigured,
    simulatorForbiddenInProduction: isProduction,
    missingEnvVars,
    ...(liveConfigured
      ? {}
      : {
          invalidReason: `Configuration PSP ${mode} incomplète (${missingEnvVars.join(', ')}). Aucun repli silencieux vers la simulation.`,
        }),
  };
}

export type MobileMoneyHttpPoster = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  }
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export type MobileMoneyHttpGetter = (
  url: string,
  init: {
    method: 'GET';
    headers: Record<string, string>;
    signal?: AbortSignal;
  }
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/**
 * Résout l'adaptateur Mobile Money à utiliser pour les retraits portefeuille.
 * - `simulator` : uniquement autorisé hors production (`test` / `development`). En production, échoue toujours (`outcome: 'failed'`).
 * - Mode PSP réel (`fedapay`, `kkiapay`, `mtn_momo`, `wave`) : échoue de manière fermée (`outcome: 'failed'`)
 *   si les variables serveur HTTPS + clé API + secret webhook manquent ; ne simule JAMAIS un paiement réel.
 */
export function resolvePayoutProviderAdapter(
  env: NodeJS.ProcessEnv = process.env,
  httpPost?: MobileMoneyHttpPoster
): PayoutProviderAdapter {
  const readiness = evaluatePayoutProviderConfig(env);

  if (readiness.isSimulated && readiness.ready) {
    return async (req: PayoutProviderRequest): Promise<PayoutProviderResult> => {
      const shortKey = crypto
        .createHash('sha256')
        .update(`${req.uid}:${req.idempotencyKey}`)
        .digest('hex')
        .slice(0, 12)
        .toUpperCase();
      return {
        outcome: 'succeeded',
        providerReference: `SIM_LLP_${shortKey}`,
        isSimulatedProvider: true,
      };
    };
  }

  if (!readiness.liveConfigured) {
    const errMsg =
      readiness.invalidReason ||
      `Prestataire Mobile Money (${readiness.mode}) non configuré côté serveur.`;
    return async (): Promise<PayoutProviderResult> => ({
      outcome: 'failed',
      isSimulatedProvider: false,
      error: errMsg,
    });
  }

  const baseUrl = (env.MOBILE_MONEY_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = (env.MOBILE_MONEY_API_KEY || '').trim();
  const poster: MobileMoneyHttpPoster =
    httpPost ||
    ((url, init) => fetch(url, init));

  return async (req: PayoutProviderRequest): Promise<PayoutProviderResult> => {
    const endpoint = `${baseUrl}/payouts`;
    try {
      const response = await poster(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-Idempotency-Key': req.idempotencyKey,
          'X-LivraLink-Provider': readiness.mode,
        },
        body: JSON.stringify({
          uid: req.uid,
          amountFCFA: req.amount,
          currency: 'XOF',
          operator: req.operator || 'MTN_MOMO',
          phone: req.payoutPhone || '',
          idempotencyKey: req.idempotencyKey,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        const providerRef =
          typeof body?.providerReference === 'string' && body.providerReference.trim()
            ? body.providerReference.trim().slice(0, 128)
            : typeof body?.reference === 'string' && body.reference.trim()
              ? body.reference.trim().slice(0, 128)
              : typeof body?.id === 'string' && body.id.trim()
                ? body.id.trim().slice(0, 128)
                : '';
        if (!providerRef || isSimulatedProviderReference(providerRef)) {
          return {
            outcome: 'uncertain',
            isSimulatedProvider: false,
            error: `Réponse HTTP ${response.status} du PSP ${readiness.mode} sans référence transactionnelle réelle valide.`,
          };
        }
        return {
          outcome: 'succeeded',
          providerReference: providerRef,
          isSimulatedProvider: false,
        };
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        return {
          outcome: 'failed',
          isSimulatedProvider: false,
          error:
            typeof body?.error === 'string' && body.error.trim()
              ? body.error.trim().slice(0, 200)
              : `Refus PSP ${readiness.mode} (HTTP ${response.status}).`,
        };
      }

      return {
        outcome: 'uncertain',
        isSimulatedProvider: false,
        error: `Réponse transitoire PSP ${readiness.mode} (HTTP ${response.status}).`,
      };
    } catch (err: any) {
      return {
        outcome: 'uncertain',
        isSimulatedProvider: false,
        error: err?.message || `Délai dépassé ou erreur réseau vers le PSP ${readiness.mode}.`,
      };
    }
  };
}

function timingSafeHexEqual(receivedHex: string, expectedHex: string): boolean {
  const cleanReceived = receivedHex.trim().toLowerCase();
  const cleanExpected = expectedHex.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(cleanReceived) || !/^[a-f0-9]{64}$/.test(cleanExpected)) {
    return false;
  }
  const a = Buffer.from(cleanReceived, 'hex');
  const b = Buffer.from(cleanExpected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function timingSafeStringEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseKvSignatureHeader(headerValue: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of headerValue.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim().toLowerCase();
    const val = part.slice(eqIdx + 1).trim();
    if (key && val) {
      out[key] = val;
    }
  }
  return out;
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === target) {
      if (Array.isArray(v)) return String(v[0] || '').trim();
      return typeof v === 'string' ? v.trim() : '';
    }
  }
  return '';
}

function isTimestampWithinTolerance(
  timestampRaw: string,
  nowSeconds: number,
  toleranceSeconds: number
): boolean {
  if (!/^\d{9,13}$/.test(timestampRaw.trim())) return false;
  let ts = Number(timestampRaw.trim());
  if (!Number.isFinite(ts)) return false;
  if (ts > 1e12) {
    ts = Math.floor(ts / 1000);
  }
  return Math.abs(nowSeconds - ts) <= toleranceSeconds;
}

/**
 * Vérification HMAC-SHA256 temps constant pour les webhooks entrants d'agrégateurs Mobile Money.
 */
export function verifyMobileMoneyWebhookSignature(params: {
  rawBody: string | Buffer;
  signatureHeader: string;
  secret: string;
}): boolean {
  const { rawBody, signatureHeader, secret } = params;
  if (!secret || secret.length < 16 || !signatureHeader) {
    return false;
  }
  const cleanHeader = signatureHeader.trim().replace(/^sha256=/i, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(cleanHeader)) {
    return false;
  }
  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return timingSafeHexEqual(cleanHeader, expectedHex);
}

export interface OfficialWebhookVerificationResult {
  valid: boolean;
  provider: string;
  reason?: string;
  timestampSeconds?: number;
  requiresServerLookup?: boolean;
}

/**
 * Vérifie de manière cryptographique (temps constant) et anti-rejeu temporel les webhooks
 * officiels des agrégateurs Mobile Money supportés :
 * - FedaPay (`X-FEDAPAY-SIGNATURE: t=...,s=...`, payload signé `${t}.${rawBody}`)
 * - Wave (`Wave-Signature: t=...,v1=...`, payload signé `${t}.${rawBody}`)
 * - Kkiapay (`x-kkiapay-secret` + cross-check S2S API recommandé)
 * - MTN MoMo (`x-callback-token` / `x-momo-callback-token` + cross-check S2S API obligatoire)
 * - Signature générique HMAC (`x-webhook-signature` / `x-signature` avec `t=...,v1=...` ou `sha256=...`)
 */
export function verifyOfficialMobileMoneyWebhook(params: {
  configuredMode: PayoutProviderMode | string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string | Buffer;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): OfficialWebhookVerificationResult {
  const {
    configuredMode,
    headers,
    rawBody,
    secret,
    nowSeconds = Math.floor(Date.now() / 1000),
    toleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  } = params;

  if (!secret || secret.trim().length < 16) {
    return { valid: false, provider: String(configuredMode || 'unknown'), reason: 'Secret webhook serveur absent ou trop court.' };
  }

  const rawStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const fedaHeader = readHeader(headers, 'x-fedapay-signature');
  const waveHeader = readHeader(headers, 'wave-signature') || readHeader(headers, 'x-wave-signature');
  const kkiaHeader = readHeader(headers, 'x-kkiapay-secret');
  const momoHeader = readHeader(headers, 'x-momo-callback-token') || readHeader(headers, 'x-callback-token');
  const genericHeader =
    readHeader(headers, 'x-webhook-signature') ||
    readHeader(headers, 'x-signature') ||
    readHeader(headers, 'x-hub-signature-256');
  const genericTimestampHeader = readHeader(headers, 'x-webhook-timestamp') || readHeader(headers, 'x-timestamp');

  const verifyTimestampedHmac = (
    providerName: string,
    headerVal: string,
    sigKey: string
  ): OfficialWebhookVerificationResult => {
    if (!headerVal) {
      return { valid: false, provider: providerName, reason: `En-tête de signature ${providerName} manquant.` };
    }
    const kv = parseKvSignatureHeader(headerVal);
    const t = kv.t;
    const sig = kv[sigKey];
    if (!t || !sig) {
      return { valid: false, provider: providerName, reason: `Format d'en-tête ${providerName} invalide.` };
    }
    if (!isTimestampWithinTolerance(t, nowSeconds, toleranceSeconds)) {
      return { valid: false, provider: providerName, reason: `Horodatage webhook ${providerName} expiré ou hors fenêtre anti-rejeu.` };
    }
    const expectedHex = crypto
      .createHmac('sha256', secret)
      .update(`${t}.${rawStr}`, 'utf8')
      .digest('hex');
    if (!timingSafeHexEqual(sig, expectedHex)) {
      return { valid: false, provider: providerName, reason: `Signature cryptographique ${providerName} invalide.` };
    }
    return {
      valid: true,
      provider: providerName,
      timestampSeconds: Number(t),
    };
  };

  const normalizedMode = String(configuredMode || '').trim().toLowerCase();

  if (normalizedMode === 'fedapay') {
    return verifyTimestampedHmac('fedapay', fedaHeader, 's');
  }
  if (normalizedMode === 'wave') {
    return verifyTimestampedHmac('wave', waveHeader, 'v1');
  }
  if (normalizedMode === 'kkiapay') {
    if (!kkiaHeader) {
      return { valid: false, provider: 'kkiapay', reason: 'En-tête x-kkiapay-secret manquant.' };
    }
    if (genericTimestampHeader && !isTimestampWithinTolerance(genericTimestampHeader, nowSeconds, toleranceSeconds)) {
      return { valid: false, provider: 'kkiapay', reason: 'Horodatage webhook Kkiapay hors fenêtre anti-rejeu.' };
    }
    if (!timingSafeStringEqual(kkiaHeader, secret)) {
      return { valid: false, provider: 'kkiapay', reason: 'Secret webhook Kkiapay invalide.' };
    }
    return { valid: true, provider: 'kkiapay', requiresServerLookup: true };
  }
  if (normalizedMode === 'mtn_momo') {
    if (!momoHeader) {
      return { valid: false, provider: 'mtn_momo', reason: 'Jeton callback MTN MoMo manquant.' };
    }
    if (genericTimestampHeader && !isTimestampWithinTolerance(genericTimestampHeader, nowSeconds, toleranceSeconds)) {
      return { valid: false, provider: 'mtn_momo', reason: 'Horodatage webhook MTN MoMo hors fenêtre anti-rejeu.' };
    }
    if (!timingSafeStringEqual(momoHeader, secret)) {
      return { valid: false, provider: 'mtn_momo', reason: 'Jeton callback MTN MoMo invalide.' };
    }
    return { valid: true, provider: 'mtn_momo', requiresServerLookup: true };
  }

  // Hors mode spécifique (test/dev uniquement), détecte l'en-tête officiel présent tout en exigeant une signature stricte
  if (fedaHeader) return verifyTimestampedHmac('fedapay', fedaHeader, 's');
  if (waveHeader) return verifyTimestampedHmac('wave', waveHeader, 'v1');
  if (kkiaHeader) {
    if (genericTimestampHeader && !isTimestampWithinTolerance(genericTimestampHeader, nowSeconds, toleranceSeconds)) {
      return { valid: false, provider: 'kkiapay', reason: 'Horodatage webhook Kkiapay hors fenêtre anti-rejeu.' };
    }
    return timingSafeStringEqual(kkiaHeader, secret)
      ? { valid: true, provider: 'kkiapay', requiresServerLookup: true }
      : { valid: false, provider: 'kkiapay', reason: 'Secret webhook Kkiapay invalide.' };
  }
  if (momoHeader) {
    if (genericTimestampHeader && !isTimestampWithinTolerance(genericTimestampHeader, nowSeconds, toleranceSeconds)) {
      return { valid: false, provider: 'mtn_momo', reason: 'Horodatage webhook MTN MoMo hors fenêtre anti-rejeu.' };
    }
    return timingSafeStringEqual(momoHeader, secret)
      ? { valid: true, provider: 'mtn_momo', requiresServerLookup: true }
      : { valid: false, provider: 'mtn_momo', reason: 'Jeton callback MTN MoMo invalide.' };
  }
  if (genericHeader) {
    if (genericHeader.includes('t=') && genericHeader.includes('v1=')) {
      return verifyTimestampedHmac('mobile_money', genericHeader, 'v1');
    }
    if (genericTimestampHeader && !isTimestampWithinTolerance(genericTimestampHeader, nowSeconds, toleranceSeconds)) {
      return { valid: false, provider: 'mobile_money', reason: 'Horodatage webhook hors fenêtre anti-rejeu.' };
    }
    const ok = verifyMobileMoneyWebhookSignature({
      rawBody: rawStr,
      signatureHeader: genericHeader,
      secret,
    });
    return ok
      ? { valid: true, provider: 'mobile_money' }
      : { valid: false, provider: 'mobile_money', reason: 'Signature HMAC-SHA256 webhook invalide.' };
  }

  return {
    valid: false,
    provider: normalizedMode || 'unknown',
    reason: 'Aucun en-tête de signature Mobile Money valide fourni.',
  };
}

export interface ServerTransactionVerificationResult {
  verified: boolean;
  status?: 'paid' | 'pending' | 'failed';
  amountFCFA?: number;
  currency?: string;
  orderDocId?: string;
  providerReference?: string;
  error?: string;
}

/**
 * Interroge directement l'API serveur du prestataire Mobile Money (S2S) pour vérifier
 * l'état réel, la devise et le montant exact d'une transaction avant confirmation.
 */
export async function verifyTransactionWithMobileMoneyApi(params: {
  mode: PayoutProviderMode | string;
  baseUrl: string;
  apiKey: string;
  providerReference: string;
  httpGet?: MobileMoneyHttpGetter;
}): Promise<ServerTransactionVerificationResult> {
  const { mode, baseUrl, apiKey, providerReference, httpGet } = params;
  const cleanRef = providerReference.trim();
  if (!cleanRef || isSimulatedProviderReference(cleanRef)) {
    return {
      verified: false,
      error: 'Référence transactionnelle simulée ou invalide interdite.',
    };
  }
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  if (!cleanBase || !apiKey.trim()) {
    return {
      verified: false,
      error: 'Configuration API PSP serveur manquante pour la vérification directe.',
    };
  }

  try {
    const parsedUrl = new URL(cleanBase);
    if (parsedUrl.protocol !== 'https:') {
      return { verified: false, error: 'URL PSP HTTPS requise.' };
    }
  } catch {
    return { verified: false, error: 'URL PSP invalide.' };
  }

  const getter: MobileMoneyHttpGetter =
    httpGet || ((url, init) => fetch(url, init));

  try {
    const response = await getter(`${cleanBase}/transactions/${encodeURIComponent(cleanRef)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: 'application/json',
        'X-LivraLink-Provider': String(mode || ''),
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      return {
        verified: false,
        error: `Vérification PSP directe refusée (HTTP ${response.status}).`,
      };
    }

    const body = await response.json().catch(() => ({}));
    const rawStatus = String(body?.status || body?.state || '').trim().toLowerCase();
    const mappedStatus: 'paid' | 'pending' | 'failed' =
      ['paid', 'succeeded', 'success', 'approved', 'complete', 'completed'].includes(rawStatus)
        ? 'paid'
        : ['failed', 'declined', 'canceled', 'cancelled', 'expired', 'error'].includes(rawStatus)
          ? 'failed'
          : 'pending';

    const amountRaw = Number(body?.amountFCFA ?? body?.amount ?? 0);
    const currency = String(body?.currency || '').trim().toUpperCase();
    const orderDocId =
      typeof body?.orderDocId === 'string'
        ? body.orderDocId.replace(/[^a-zA-Z0-9_-]/g, '')
        : typeof body?.orderId === 'string'
          ? body.orderId.replace(/[^a-zA-Z0-9_-]/g, '')
          : undefined;

    return {
      verified: true,
      status: mappedStatus,
      amountFCFA: Number.isFinite(amountRaw) ? Math.round(amountRaw) : undefined,
      currency: currency || undefined,
      orderDocId: orderDocId || undefined,
      providerReference: cleanRef,
    };
  } catch (err: any) {
    return {
      verified: false,
      error: err?.message || 'Erreur réseau lors de la vérification serveur auprès du PSP.',
    };
  }
}
