import crypto from 'crypto';
import type {
  PayoutProviderAdapter,
  PayoutProviderRequest,
  PayoutProviderResult,
} from './p0Security';

export type PayoutProviderMode = 'simulator' | 'fedapay' | 'kkiapay' | 'mtn_momo' | 'wave';

const SUPPORTED_MODES = new Set<PayoutProviderMode>([
  'simulator',
  'fedapay',
  'kkiapay',
  'mtn_momo',
  'wave',
]);

export interface PayoutProviderReadiness {
  mode: PayoutProviderMode;
  rawMode: string;
  isSimulated: boolean;
  liveConfigured: boolean;
  ready: boolean;
  missingEnvVars: string[];
  invalidReason?: string;
}

export function evaluatePayoutProviderConfig(
  env: NodeJS.ProcessEnv = process.env
): PayoutProviderReadiness {
  const rawMode = (env.PAYOUT_PROVIDER_MODE || 'simulator').trim().toLowerCase();
  if (!SUPPORTED_MODES.has(rawMode as PayoutProviderMode)) {
    return {
      mode: 'simulator',
      rawMode,
      isSimulated: false,
      liveConfigured: false,
      ready: false,
      missingEnvVars: [],
      invalidReason: `PAYOUT_PROVIDER_MODE non reconnu ("${rawMode}"). Valeurs autorisées : simulator, fedapay, kkiapay, mtn_momo, wave.`,
    };
  }

  const mode = rawMode as PayoutProviderMode;
  if (mode === 'simulator') {
    return {
      mode: 'simulator',
      rawMode,
      isSimulated: true,
      liveConfigured: false,
      ready: true,
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

/**
 * Résout l'adaptateur Mobile Money à utiliser pour les retraits portefeuille.
 * - `simulator` (défaut MVP) : retourne une référence `SIM_LLP_*` explicitement marquée `isSimulatedProvider: true`.
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
        if (!providerRef) {
          return {
            outcome: 'uncertain',
            isSimulatedProvider: false,
            error: `Réponse HTTP ${response.status} du PSP ${readiness.mode} sans référence transactionnelle.`,
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
  const a = Buffer.from(cleanHeader, 'hex');
  const b = Buffer.from(expectedHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
