import crypto from 'crypto';
import {
  evaluatePayoutProviderConfig,
  isSimulatedProviderReference,
  MobileMoneyHttpGetter,
  verifyOfficialMobileMoneyWebhook,
  verifyTransactionWithMobileMoneyApi,
} from './mobileMoneyProvider';
import {
  COLLECTIONS,
  getPayoutIdempotencyDocId,
  P0FirestoreLike,
} from './p0Security';

export interface MobileMoneyWebhookHandleResult {
  ok: boolean;
  status: number;
  code?: string;
  duplicate?: boolean;
  alreadyTerminal?: boolean;
  type?: 'order_payment' | 'payout';
  orderDocId?: string;
  paymentId?: string;
  paymentStatus?: 'paid' | 'failed';
  payoutStatus?: 'committed' | 'failed';
  provider?: string;
  providerReference?: string;
  error?: string;
}

export interface ServerPaymentConfirmResult {
  ok: boolean;
  status: number;
  code?: string;
  duplicate?: boolean;
  orderDocId?: string;
  paymentId?: string;
  paymentStatus?: 'paid' | 'failed' | 'pending';
  providerReference?: string;
  error?: string;
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function getPaymentDocId(provider: string, providerReference: string): string {
  return `pay_${sha256Hex(`${provider.toLowerCase()}:${providerReference.trim()}`).slice(0, 40)}`;
}

function getWebhookEventDocId(provider: string, dedupKey: string): string {
  return `whevt_${sha256Hex(`${provider.toLowerCase()}:${dedupKey}`).slice(0, 44)}`;
}

function cleanOrderIdToDocId(rawOrderId: unknown): string {
  if (typeof rawOrderId !== 'string') return '';
  return rawOrderId.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

/**
 * Traite de manière atomique et idempotente les webhooks Mobile Money entrants :
 * - Rejet du simulateur et des références SIM_LLP_* en production (et sur webhooks)
 * - Vérification cryptographique des signatures + fenêtre anti-rejeu temporelle
 * - Vérification S2S auprès du PSP si configuré ou requis (MTN MoMo / Kkiapay)
 * - Vérification stricte de la devise (XOF uniquement) et du montant exact certifié serveur
 * - Protection contre le rejeu d'événement (/webhook_events) et la réutilisation d'une transaction sur une autre commande (/payments)
 */
export async function handleMobileMoneyWebhook(
  db: P0FirestoreLike,
  params: {
    rawBody: Buffer | string;
    headers: Record<string, string | string[] | undefined>;
    env?: NodeJS.ProcessEnv;
    nowMs?: number;
    httpGet?: MobileMoneyHttpGetter;
    onAnomaly?: (type: string, details: string) => void;
  }
): Promise<MobileMoneyWebhookHandleResult> {
  const {
    rawBody,
    headers,
    env = process.env,
    nowMs = Date.now(),
    httpGet,
    onAnomaly,
  } = params;

  const isProduction = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const readiness = evaluatePayoutProviderConfig(env);
  const webhookSecret = (env.MOBILE_MONEY_WEBHOOK_SECRET || '').trim();

  if (isProduction && readiness.isSimulated) {
    return {
      ok: false,
      status: 503,
      code: 'SIMULATOR_FORBIDDEN_IN_PRODUCTION',
      error: 'Simulateur Mobile Money interdit en production.',
    };
  }

  if (!webhookSecret || webhookSecret.length < 16) {
    return {
      ok: false,
      status: isProduction ? 503 : 401,
      code: 'WEBHOOK_SECRET_MISSING',
      error: 'Secret de vérification webhook Mobile Money absent côté serveur.',
    };
  }

  const sigCheck = verifyOfficialMobileMoneyWebhook({
    configuredMode: readiness.mode,
    headers,
    rawBody,
    secret: webhookSecret,
    nowSeconds: Math.floor(nowMs / 1000),
  });

  if (!sigCheck.valid) {
    onAnomaly?.(
      'WEBHOOK_SIGNATURE_INVALID',
      `Webhook rejeté (${sigCheck.provider}): ${sigCheck.reason || 'signature invalide'}`
    );
    return {
      ok: false,
      status: 401,
      code: 'INVALID_WEBHOOK_SIGNATURE',
      provider: sigCheck.provider,
      error: sigCheck.reason || 'Signature webhook Mobile Money absente ou invalide.',
    };
  }

  const rawText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_JSON',
      error: 'Corps JSON webhook invalide.',
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PAYLOAD',
      error: 'Structure JSON webhook invalide.',
    };
  }

  const dataObj = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  const eventType = String(parsed.event || parsed.type || parsed.eventType || dataObj.event || '')
    .trim()
    .toLowerCase();
  const eventId = String(parsed.eventId || parsed.id || parsed.event_id || '').trim().slice(0, 128);
  const providerReference = String(
    dataObj.providerReference ||
      dataObj.reference ||
      dataObj.transactionId ||
      dataObj.transaction_id ||
      dataObj.externalId ||
      parsed.providerReference ||
      parsed.reference ||
      ''
  )
    .trim()
    .slice(0, 128);

  if (
    isSimulatedProviderReference(providerReference) ||
    isSimulatedProviderReference(eventId) ||
    isSimulatedProviderReference(parsed.reference) ||
    isSimulatedProviderReference(dataObj.reference)
  ) {
    onAnomaly?.(
      'SIMULATED_REF_WEBHOOK_REJECTED',
      `Tentative d'utilisation d'une référence simulée SIM_LLP_* sur webhook (${providerReference || eventId})`
    );
    return {
      ok: false,
      status: 403,
      code: 'SIMULATED_REFERENCE_FORBIDDEN',
      error: 'Les références simulées SIM_LLP_* sont strictement refusées par le serveur de paiement.',
    };
  }

  const provider = sigCheck.provider || readiness.mode;

  // =========================================================================
  // BRANCH A: Outbound Payout Webhook (payout.succeeded / payout.failed)
  // =========================================================================
  const isPayoutEvent =
    eventType.startsWith('payout.') ||
    eventType.startsWith('transfer.') ||
    dataObj.operationType === 'payout' ||
    Boolean(dataObj.payoutIdempotencyKey);

  if (isPayoutEvent) {
    const rawStatus = String(dataObj.status || eventType || '').trim().toLowerCase();
    const outcome: 'succeeded' | 'failed' | null =
      ['payout.succeeded', 'transfer.completed', 'succeeded', 'paid', 'completed', 'success'].includes(rawStatus)
        ? 'succeeded'
        : ['payout.failed', 'transfer.failed', 'failed', 'declined', 'reversed', 'error'].includes(rawStatus)
          ? 'failed'
          : null;

    if (!outcome) {
      return {
        ok: false,
        status: 400,
        code: 'UNKNOWN_PAYOUT_EVENT_STATUS',
        error: 'Statut de virement webhook non reconnu.',
      };
    }

    const payoutKey = String(dataObj.payoutIdempotencyKey || dataObj.idempotencyKey || '').trim();
    const payoutUid = String(dataObj.uid || dataObj.userId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');

    let targetIdemDocId = '';
    if (payoutUid && payoutKey) {
      targetIdemDocId = getPayoutIdempotencyDocId(payoutUid, payoutKey);
    } else if (providerReference) {
      const q = await db
        .collection(COLLECTIONS.PAYOUT_IDEMPOTENCY)
        .where('providerReference', '==', providerReference)
        .limit(1)
        .get();
      if (!q.empty) {
        targetIdemDocId = q.docs[0].id;
      }
    }

    if (!targetIdemDocId) {
      return {
        ok: false,
        status: 404,
        code: 'PAYOUT_NOT_FOUND',
        error: 'Opération de retrait associée introuvable.',
      };
    }

    const dedupSeed = eventId || `${providerReference || targetIdemDocId}:${outcome}`;
    const eventDedupId = getWebhookEventDocId(provider, `payout:${dedupSeed}`);
    const eventRef = db.collection(COLLECTIONS.WEBHOOK_EVENTS).doc(eventDedupId);
    const idemRef = db.collection(COLLECTIONS.PAYOUT_IDEMPOTENCY).doc(targetIdemDocId);

    const txResult = await db.runTransaction(async (tx) => {
      const [eventSnap, idemSnap] = await Promise.all([tx.get(eventRef), tx.get(idemRef)]);

      if (eventSnap.exists) {
        return {
          ok: true as const,
          status: 200,
          duplicate: true,
          payoutStatus: idemSnap.data()?.status,
        };
      }

      if (!idemSnap.exists) {
        return {
          ok: false as const,
          status: 404,
          code: 'PAYOUT_NOT_FOUND',
          error: 'Opération de retrait introuvable dans Firestore.',
        };
      }

      const idemData = idemSnap.data() || {};
      const targetUid = String(idemData.uid || '');
      const reservedAmount = Number(idemData.reservedAmount ?? idemData.amount ?? 0);

      if (dataObj.currency !== undefined && String(dataObj.currency).trim().toUpperCase() !== 'XOF') {
        return {
          ok: false as const,
          status: 422,
          code: 'INVALID_CURRENCY',
          error: 'Devise webhook retrait invalide : XOF requis.',
        };
      }

      const rawWhAmount = dataObj.amountFCFA ?? dataObj.amount;
      if (rawWhAmount !== undefined && Math.round(Number(rawWhAmount)) !== reservedAmount) {
        return {
          ok: false as const,
          status: 422,
          code: 'AMOUNT_MISMATCH',
          error: 'Montant webhook retrait incohérent avec le montant réservé.',
        };
      }

      if (idemData.status === 'committed' || idemData.status === 'failed') {
        tx.set(eventRef, {
          id: eventDedupId,
          provider,
          type: 'payout',
          eventType,
          eventId: dedupSeed,
          providerReference: providerReference || idemData.providerReference || '',
          payoutDocId: targetIdemDocId,
          status: 'duplicate_terminal',
          processedAt: nowMs,
        });
        return {
          ok: true as const,
          status: 200,
          duplicate: true,
          alreadyTerminal: true,
          payoutStatus: idemData.status,
        };
      }

      const userRef = db.collection(COLLECTIONS.USERS).doc(targetUid);
      const userLockRef = db.collection(COLLECTIONS.PAYOUT_USER_LOCKS).doc(targetUid);
      const wtxRef = db.collection(COLLECTIONS.WALLET_TRANSACTIONS).doc(`wtx_${targetIdemDocId}`);
      const [userSnap, userLockSnap, wtxSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(userLockRef),
        tx.get(wtxRef),
      ]);

      if (outcome === 'succeeded') {
        const finalRef = providerReference || idemData.providerReference || `WH_${targetIdemDocId.slice(0, 12)}`;
        tx.update(idemRef, {
          status: 'committed',
          providerReference: finalRef,
          processingExpiresAt: 0,
          webhookReconciledAt: nowMs,
          committedAt: nowMs,
          updatedAt: nowMs,
        });
        if (wtxSnap.exists) {
          tx.update(wtxRef, {
            status: 'committed',
            providerReference: finalRef,
            updatedAt: nowMs,
          });
        }
        if (userLockSnap.exists && userLockSnap.data()?.activeDocKeyId === targetIdemDocId) {
          tx.delete(userLockRef);
        }
        tx.set(eventRef, {
          id: eventDedupId,
          provider,
          type: 'payout',
          eventType,
          eventId: dedupSeed,
          providerReference: finalRef,
          payoutDocId: targetIdemDocId,
          status: 'processed',
          processedAt: nowMs,
        });
        return { ok: true as const, status: 200, duplicate: false, payoutStatus: 'committed' as const };
      }

      // outcome === 'failed': restore balance only if it was debited ('processing' or 'uncertain')
      const wasDebited = idemData.status === 'processing' || idemData.status === 'uncertain';
      let restoredBalance: number | undefined;
      if (wasDebited && userSnap.exists) {
        const currentBal = Number(userSnap.data()?.walletBalanceFCFA ?? 0);
        restoredBalance = currentBal + reservedAmount;
        tx.update(userRef, {
          walletBalanceFCFA: restoredBalance,
          updatedAt: nowMs,
        });
      }

      tx.update(idemRef, {
        status: 'failed',
        processingExpiresAt: 0,
        failedAt: nowMs,
        webhookReconciledAt: nowMs,
        providerError: String(dataObj.reason || dataObj.error || 'WEBHOOK_PAYOUT_FAILED').slice(0, 200),
        updatedAt: nowMs,
      });
      if (wtxSnap.exists) {
        tx.update(wtxRef, {
          status: 'reversed',
          ...(typeof restoredBalance === 'number' ? { balanceAfter: restoredBalance } : {}),
          note: 'Webhook PSP : échec du virement — solde restitué',
          updatedAt: nowMs,
        });
      }
      if (userLockSnap.exists && userLockSnap.data()?.activeDocKeyId === targetIdemDocId) {
        tx.delete(userLockRef);
      }
      tx.set(eventRef, {
        id: eventDedupId,
        provider,
        type: 'payout',
        eventType,
        eventId: dedupSeed,
        providerReference: providerReference || '',
        payoutDocId: targetIdemDocId,
        status: 'processed',
        processedAt: nowMs,
      });
      return { ok: true as const, status: 200, duplicate: false, payoutStatus: 'failed' as const };
    });

    return {
      ...txResult,
      type: 'payout',
      provider,
      providerReference,
    };
  }

  // =========================================================================
  // BRANCH B: Inbound Order Payment Webhook
  // =========================================================================
  const cleanOrderDocId = cleanOrderIdToDocId(
    dataObj.orderDocId ??
      dataObj.orderId ??
      dataObj.metadata?.orderDocId ??
      dataObj.metadata?.orderId ??
      parsed.orderDocId ??
      parsed.orderId
  );

  if (!providerReference) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_PROVIDER_REFERENCE',
      error: 'Référence transactionnelle Mobile Money manquante.',
    };
  }

  if (!cleanOrderDocId) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_ORDER_REFERENCE',
      error: 'Référence de commande cible manquante dans le webhook.',
    };
  }

  const currency = String(dataObj.currency || parsed.currency || '').trim().toUpperCase();
  if (currency !== 'XOF') {
    onAnomaly?.(
      'PAYMENT_INVALID_CURRENCY',
      `Devise non conforme rejetée sur webhook (${currency || 'ABSENTE'}) pour ${cleanOrderDocId}`
    );
    return {
      ok: false,
      status: 422,
      code: 'INVALID_CURRENCY',
      error: `Devise invalide (${currency || 'absente'}). Seule la devise XOF (FCFA) est acceptée.`,
    };
  }

  const rawAmount = Number(dataObj.amountFCFA ?? dataObj.amount ?? parsed.amountFCFA ?? parsed.amount);
  if (!Number.isFinite(rawAmount) || !Number.isInteger(rawAmount) || rawAmount <= 0 || rawAmount > 50_000_000) {
    return {
      ok: false,
      status: 422,
      code: 'INVALID_AMOUNT',
      error: 'Montant de transaction webhook invalide.',
    };
  }

  const rawStatus = String(dataObj.status || eventType || '').trim().toLowerCase();
  const outcome: 'paid' | 'failed' | null = [
    'payment.succeeded',
    'transaction.approved',
    'checkout.session.completed',
    'succeeded',
    'paid',
    'approved',
    'success',
    'completed',
  ].includes(rawStatus)
    ? 'paid'
    : [
          'payment.failed',
          'transaction.declined',
          'transaction.canceled',
          'failed',
          'declined',
          'canceled',
          'cancelled',
          'expired',
        ].includes(rawStatus)
      ? 'failed'
      : null;

  if (!outcome) {
    return {
      ok: false,
      status: 400,
      code: 'UNKNOWN_PAYMENT_STATUS',
      error: 'Statut de paiement webhook non reconnu.',
    };
  }

  const baseUrl = (env.MOBILE_MONEY_API_BASE_URL || '').trim();
  const apiKey = (env.MOBILE_MONEY_API_KEY || '').trim();

  if (sigCheck.requiresServerLookup && (!baseUrl || !apiKey)) {
    if (isProduction) {
      return {
        ok: false,
        status: 503,
        code: 'S2S_VERIFICATION_UNAVAILABLE',
        error: `Vérification serveur-à-serveur PSP obligatoire pour ${provider} non configurée en production.`,
      };
    }
  }

  if (baseUrl && apiKey) {
    const s2s = await verifyTransactionWithMobileMoneyApi({
      mode: provider,
      baseUrl,
      apiKey,
      providerReference,
      httpGet,
    });

    if (!s2s.verified) {
      return {
        ok: false,
        status: 422,
        code: 'S2S_VERIFICATION_FAILED',
        error: s2s.error || 'Échec de vérification S2S auprès du PSP.',
      };
    }
    if (s2s.currency && s2s.currency !== 'XOF') {
      return {
        ok: false,
        status: 422,
        code: 'S2S_CURRENCY_MISMATCH',
        error: `Devise PSP divergente (${s2s.currency}) : XOF requis.`,
      };
    }
    if (typeof s2s.amountFCFA === 'number' && s2s.amountFCFA !== rawAmount) {
      onAnomaly?.(
        'PAYMENT_S2S_AMOUNT_MISMATCH',
        `Montant S2S PSP (${s2s.amountFCFA}) != webhook (${rawAmount}) sur ${cleanOrderDocId}`
      );
      return {
        ok: false,
        status: 422,
        code: 'S2S_AMOUNT_MISMATCH',
        error: 'Montant confirmé par l’API PSP incohérent avec le webhook.',
      };
    }
    if (s2s.orderDocId && s2s.orderDocId !== cleanOrderDocId) {
      onAnomaly?.(
        'PAYMENT_S2S_ORDER_MISMATCH',
        `Commande S2S PSP (${s2s.orderDocId}) != webhook (${cleanOrderDocId})`
      );
      return {
        ok: false,
        status: 409,
        code: 'S2S_ORDER_MISMATCH',
        error: 'Référence commande PSP incohérente.',
      };
    }
    if (outcome === 'paid' && s2s.status !== 'paid') {
      return {
        ok: false,
        status: 422,
        code: 'S2S_STATUS_NOT_PAID',
        error: `Le PSP indique un statut non confirmé (${s2s.status || 'inconnu'}).`,
      };
    }
  }

  const dedupSeed = eventId || `${providerReference}:${outcome}:${cleanOrderDocId}`;
  const eventDedupId = getWebhookEventDocId(provider, dedupSeed);
  const paymentDocId = getPaymentDocId(provider, providerReference);

  const eventRef = db.collection(COLLECTIONS.WEBHOOK_EVENTS).doc(eventDedupId);
  const paymentRef = db.collection(COLLECTIONS.PAYMENTS).doc(paymentDocId);
  const deliveryRef = db.collection(COLLECTIONS.DELIVERIES).doc(cleanOrderDocId);

  const txResult = await db.runTransaction(async (tx) => {
    const [eventSnap, paymentSnap, deliverySnap] = await Promise.all([
      tx.get(eventRef),
      tx.get(paymentRef),
      tx.get(deliveryRef),
    ]);

    if (eventSnap.exists) {
      return {
        ok: true as const,
        status: 200,
        duplicate: true,
        orderDocId: cleanOrderDocId,
        paymentId: paymentDocId,
        paymentStatus: outcome,
      };
    }

    if (paymentSnap.exists) {
      const existingPay = paymentSnap.data() || {};
      if (existingPay.orderDocId && existingPay.orderDocId !== cleanOrderDocId) {
        onAnomaly?.(
          'PAYMENT_CROSS_ORDER_REPLAY',
          `Référence ${providerReference} déjà attribuée à ${existingPay.orderDocId}, tentative sur ${cleanOrderDocId}`
        );
        return {
          ok: false as const,
          status: 409,
          code: 'PAYMENT_CROSS_ORDER_REPLAY',
          error: 'Cette transaction Mobile Money a déjà été confirmée pour une autre commande.',
        };
      }
      if (existingPay.status === 'paid' && outcome === 'paid') {
        tx.set(eventRef, {
          id: eventDedupId,
          provider,
          type: 'order_payment',
          eventType,
          eventId: dedupSeed,
          providerReference,
          orderDocId: cleanOrderDocId,
          paymentId: paymentDocId,
          status: 'duplicate_paid',
          processedAt: nowMs,
        });
        return {
          ok: true as const,
          status: 200,
          duplicate: true,
          orderDocId: cleanOrderDocId,
          paymentId: paymentDocId,
          paymentStatus: 'paid' as const,
        };
      }
    }

    if (!deliverySnap.exists) {
      return {
        ok: false as const,
        status: 404,
        code: 'ORDER_NOT_FOUND',
        error: 'Commande associée introuvable.',
      };
    }

    const deliveryData = deliverySnap.data() || {};
    const expectedAmount = Math.round(
      Number(
        deliveryData.totalCustomerPayable ??
          Number(deliveryData.itemValueCOD || 0) + Number(deliveryData.deliveryFee || 0)
      )
    );

    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0 || rawAmount !== expectedAmount) {
      onAnomaly?.(
        'PAYMENT_AMOUNT_MISMATCH',
        `Montant webhook (${rawAmount} FCFA) != attendu (${expectedAmount} FCFA) sur ${cleanOrderDocId}`
      );
      return {
        ok: false as const,
        status: 422,
        code: 'AMOUNT_MISMATCH',
        error: `Montant encaissé (${rawAmount} FCFA) différent du montant certifié de la commande (${expectedAmount} FCFA).`,
      };
    }

    if (
      outcome === 'paid' &&
      deliveryData.paymentStatus === 'paid' &&
      deliveryData.paymentProviderRef &&
      deliveryData.paymentProviderRef !== providerReference
    ) {
      return {
        ok: false as const,
        status: 409,
        code: 'ORDER_ALREADY_PAID',
        error: 'Cette commande est déjà réglée par une autre transaction confirmée.',
      };
    }

    const nowIso = new Date(nowMs).toISOString();
    tx.set(paymentRef, {
      id: paymentDocId,
      orderDocId: cleanOrderDocId,
      orderId: String(deliveryData.id || `#${cleanOrderDocId}`),
      merchantId: String(deliveryData.merchantId || ''),
      ...(deliveryData.clientId ? { clientId: String(deliveryData.clientId) } : {}),
      provider,
      providerReference,
      amountFCFA: rawAmount,
      currency: 'XOF',
      status: outcome,
      verifiedByWebhook: true,
      verifiedAt: nowMs,
      verifiedAtIso: nowIso,
      createdAt: paymentSnap.exists ? paymentSnap.data()?.createdAt || nowMs : nowMs,
      updatedAt: nowMs,
    });

    if (outcome === 'paid') {
      tx.update(deliveryRef, {
        paymentStatus: 'paid',
        paidAt: nowMs,
        paidAtIso: nowIso,
        paidAmountFCFA: rawAmount,
        paymentCurrency: 'XOF',
        paymentProvider: provider,
        paymentProviderRef: providerReference,
        paymentId: paymentDocId,
        refundedAmountFCFA: Number(deliveryData.refundedAmountFCFA || 0),
        refundStatus: deliveryData.refundStatus || 'none',
        updatedAt: nowMs,
      });

      if (deliveryData.merchantId) {
        const notifId = `notif_pay_${cleanOrderDocId}_${nowMs}`.replace(/[^a-zA-Z0-9_-]/g, '');
        tx.set(db.collection(COLLECTIONS.NOTIFICATIONS).doc(notifId), {
          id: notifId,
          senderId: 'system_backend',
          recipientId: deliveryData.merchantId,
          type: 'payment_confirmed',
          title: `💳 Paiement confirmé (${deliveryData.id || cleanOrderDocId})`,
          message: `Encaissement certifié de ${rawAmount.toLocaleString('fr-FR')} FCFA via ${provider.toUpperCase()} (Réf : ${providerReference}).`,
          orderId: String(deliveryData.id || `#${cleanOrderDocId}`),
          orderDocId: cleanOrderDocId,
          isRead: false,
          read: false,
          createdAt: nowMs,
          timestamp: new Date(nowMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        });
      }
    } else if (deliveryData.paymentStatus !== 'paid') {
      tx.update(deliveryRef, {
        paymentStatus: 'failed',
        paymentCurrency: 'XOF',
        paymentProvider: provider,
        paymentProviderRef: providerReference,
        paymentId: paymentDocId,
        paymentFailureReason: String(dataObj.reason || dataObj.error || 'Paiement refusé par le PSP').slice(0, 200),
        updatedAt: nowMs,
      });
    }

    tx.set(eventRef, {
      id: eventDedupId,
      provider,
      type: 'order_payment',
      eventType,
      eventId: dedupSeed,
      providerReference,
      orderDocId: cleanOrderDocId,
      paymentId: paymentDocId,
      amountFCFA: rawAmount,
      currency: 'XOF',
      status: 'processed',
      processedAt: nowMs,
    });

    return {
      ok: true as const,
      status: 200,
      duplicate: false,
      orderDocId: cleanOrderDocId,
      paymentId: paymentDocId,
      paymentStatus: outcome,
    };
  });

  return {
    ...txResult,
    type: 'order_payment',
    provider,
    providerReference,
  };
}

/**
 * Empêche toute confirmation client directe de paiement :
 * - Rejette immédiatement toute tentative client de déclarer `status: 'paid'` ou d'injecter `SIM_LLP_*`.
 * - N'autorise la confirmation qu'après vérification directe serveur-à-serveur auprès du PSP réel configuré.
 */
export async function confirmOrderPaymentFromServerCheck(
  db: P0FirestoreLike,
  params: {
    callerUid: string;
    isAdmin: boolean;
    orderIdInput: string;
    providerReference?: string;
    clientClaimedStatus?: unknown;
    env?: NodeJS.ProcessEnv;
    nowMs?: number;
    httpGet?: MobileMoneyHttpGetter;
    onAnomaly?: (type: string, details: string) => void;
  }
): Promise<ServerPaymentConfirmResult> {
  const {
    callerUid,
    isAdmin,
    orderIdInput,
    providerReference,
    clientClaimedStatus,
    env = process.env,
    nowMs = Date.now(),
    httpGet,
    onAnomaly,
  } = params;

  const cleanOrderDocId = cleanOrderIdToDocId(orderIdInput);
  if (!cleanOrderDocId) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_ORDER_ID',
      error: 'Identifiant de commande invalide.',
    };
  }

  const cleanRef = typeof providerReference === 'string' ? providerReference.trim().slice(0, 128) : '';
  if (isSimulatedProviderReference(cleanRef)) {
    onAnomaly?.(
      'CLIENT_PAYMENT_SPOOF_ATTEMPT',
      `Tentative de confirmation client avec référence simulée ${cleanRef} par ${callerUid} sur ${cleanOrderDocId}`
    );
    return {
      ok: false,
      status: 403,
      code: 'SIMULATED_PAYMENT_FORBIDDEN',
      error: 'Les références simulées SIM_LLP_* ne peuvent jamais confirmer un paiement.',
    };
  }

  const readiness = evaluatePayoutProviderConfig(env);
  if (!readiness.liveConfigured) {
    onAnomaly?.(
      'CLIENT_PAYMENT_SPOOF_ATTEMPT',
      `Tentative de confirmation paiement côté client sans PSP configuré par ${callerUid} sur ${cleanOrderDocId} (claimed=${String(clientClaimedStatus || '')})`
    );
    return {
      ok: false,
      status: 403,
      code: 'CLIENT_PAYMENT_CONFIRMATION_FORBIDDEN',
      error:
        'Confirmation de paiement depuis le navigateur interdite : un webhook signé ou une vérification serveur PSP en direct est requis.',
    };
  }

  if (!cleanRef) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_PROVIDER_REFERENCE',
      error: 'Référence transactionnelle PSP requise pour interrogation serveur.',
    };
  }

  const preSnap = await db.collection(COLLECTIONS.DELIVERIES).doc(cleanOrderDocId).get();
  if (!preSnap.exists) {
    return { ok: false, status: 404, code: 'ORDER_NOT_FOUND', error: 'Commande introuvable.' };
  }
  const preData = preSnap.data() || {};
  if (!isAdmin && preData.merchantId !== callerUid && preData.clientId !== callerUid) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      error: 'Accès refusé pour vérifier le paiement de cette commande.',
    };
  }

  const s2s = await verifyTransactionWithMobileMoneyApi({
    mode: readiness.mode,
    baseUrl: (env.MOBILE_MONEY_API_BASE_URL || '').trim(),
    apiKey: (env.MOBILE_MONEY_API_KEY || '').trim(),
    providerReference: cleanRef,
    httpGet,
  });

  if (!s2s.verified) {
    return {
      ok: false,
      status: 422,
      code: 'PSP_VERIFICATION_FAILED',
      error: s2s.error || 'La vérification auprès du prestataire Mobile Money a échoué.',
    };
  }

  if (s2s.currency !== 'XOF') {
    return {
      ok: false,
      status: 422,
      code: 'INVALID_CURRENCY',
      error: `Devise non conforme renvoyée par le PSP (${s2s.currency || 'absente'}). XOF requis.`,
    };
  }

  if (s2s.orderDocId && s2s.orderDocId !== cleanOrderDocId) {
    onAnomaly?.(
      'PAYMENT_CROSS_ORDER_REPLAY',
      `Vérification S2S : la référence ${cleanRef} appartient à ${s2s.orderDocId}, pas à ${cleanOrderDocId}`
    );
    return {
      ok: false,
      status: 409,
      code: 'PAYMENT_CROSS_ORDER_REPLAY',
      error: 'Cette transaction PSP est associée à une autre commande.',
    };
  }

  if (s2s.status !== 'paid') {
    return {
      ok: false,
      status: 402,
      code: 'PAYMENT_NOT_CONFIRMED_BY_PSP',
      paymentStatus: s2s.status,
      error: `Le paiement n'est pas encore confirmé par le prestataire (statut PSP : ${s2s.status}).`,
    };
  }

  const paymentDocId = getPaymentDocId(readiness.mode, cleanRef);
  const paymentRef = db.collection(COLLECTIONS.PAYMENTS).doc(paymentDocId);
  const deliveryRef = db.collection(COLLECTIONS.DELIVERIES).doc(cleanOrderDocId);

  return db.runTransaction(async (tx) => {
    const [paySnap, delivSnap] = await Promise.all([tx.get(paymentRef), tx.get(deliveryRef)]);

    if (paySnap.exists) {
      const existingPay = paySnap.data() || {};
      if (existingPay.orderDocId && existingPay.orderDocId !== cleanOrderDocId) {
        return {
          ok: false as const,
          status: 409,
          code: 'PAYMENT_CROSS_ORDER_REPLAY',
          error: 'Cette transaction Mobile Money a déjà été confirmée pour une autre commande.',
        };
      }
      if (existingPay.status === 'paid') {
        return {
          ok: true as const,
          status: 200,
          duplicate: true,
          orderDocId: cleanOrderDocId,
          paymentId: paymentDocId,
          paymentStatus: 'paid' as const,
          providerReference: cleanRef,
        };
      }
    }

    if (!delivSnap.exists) {
      return { ok: false as const, status: 404, code: 'ORDER_NOT_FOUND', error: 'Commande introuvable.' };
    }

    const delivData = delivSnap.data() || {};
    const expectedAmount = Math.round(
      Number(
        delivData.totalCustomerPayable ??
          Number(delivData.itemValueCOD || 0) + Number(delivData.deliveryFee || 0)
      )
    );

    if (typeof s2s.amountFCFA !== 'number' || s2s.amountFCFA !== expectedAmount) {
      return {
        ok: false as const,
        status: 422,
        code: 'AMOUNT_MISMATCH',
        error: `Montant PSP (${s2s.amountFCFA ?? 0} FCFA) incohérent avec le total certifié (${expectedAmount} FCFA).`,
      };
    }

    const nowIso = new Date(nowMs).toISOString();
    tx.set(paymentRef, {
      id: paymentDocId,
      orderDocId: cleanOrderDocId,
      orderId: String(delivData.id || `#${cleanOrderDocId}`),
      merchantId: String(delivData.merchantId || ''),
      ...(delivData.clientId ? { clientId: String(delivData.clientId) } : {}),
      provider: readiness.mode,
      providerReference: cleanRef,
      amountFCFA: s2s.amountFCFA,
      currency: 'XOF',
      status: 'paid',
      verifiedByServerS2S: true,
      verifiedAt: nowMs,
      verifiedAtIso: nowIso,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    tx.update(deliveryRef, {
      paymentStatus: 'paid',
      paidAt: nowMs,
      paidAtIso: nowIso,
      paidAmountFCFA: s2s.amountFCFA,
      paymentCurrency: 'XOF',
      paymentProvider: readiness.mode,
      paymentProviderRef: cleanRef,
      paymentId: paymentDocId,
      refundedAmountFCFA: Number(delivData.refundedAmountFCFA || 0),
      refundStatus: delivData.refundStatus || 'none',
      updatedAt: nowMs,
    });

    return {
      ok: true as const,
      status: 200,
      duplicate: false,
      orderDocId: cleanOrderDocId,
      paymentId: paymentDocId,
      paymentStatus: 'paid' as const,
      providerReference: cleanRef,
    };
  });
}
