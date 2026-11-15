import crypto from 'crypto';

export interface P0DocumentSnapshot {
  exists: boolean;
  id: string;
  data(): Record<string, any> | undefined;
}

export interface P0DocumentRef {
  id: string;
  path: string;
  collection(name: string): P0CollectionRef;
  get(): Promise<P0DocumentSnapshot>;
  set(data: Record<string, any>, options?: { merge?: boolean }): Promise<any>;
  update(data: Record<string, any>): Promise<any>;
  delete(): Promise<any>;
}

export interface P0QuerySnapshot {
  empty: boolean;
  docs: P0DocumentSnapshot[];
}

export interface P0Query {
  where(field: string, op: string, value: any): P0Query;
  limit(n: number): P0Query;
  get(): Promise<P0QuerySnapshot>;
}

export interface P0CollectionRef {
  doc(id: string): P0DocumentRef;
  where(field: string, op: string, value: any): P0Query;
  limit(n: number): P0Query;
}

export interface P0Transaction {
  get(ref: P0DocumentRef): Promise<P0DocumentSnapshot>;
  set(ref: P0DocumentRef, data: Record<string, any>, options?: { merge?: boolean }): any;
  update(ref: P0DocumentRef, data: Record<string, any>): any;
  delete(ref: P0DocumentRef): any;
}

export interface P0WriteBatch {
  set(ref: P0DocumentRef, data: Record<string, any>, options?: { merge?: boolean }): any;
  update(ref: P0DocumentRef, data: Record<string, any>): any;
  delete(ref: P0DocumentRef): any;
  commit(): Promise<any>;
}

export interface P0FirestoreLike {
  collection(name: string): P0CollectionRef;
  runTransaction<T>(updateFunction: (tx: P0Transaction) => Promise<T>): Promise<T>;
  batch(): P0WriteBatch;
}

export interface PayoutProviderRequest {
  uid: string;
  amount: number;
  idempotencyKey: string;
  operator?: string;
  payoutPhone?: string;
}

export type PayoutProviderResult =
  | { outcome: 'succeeded'; providerReference: string }
  | { outcome: 'failed'; error: string; providerReference?: string }
  | { outcome: 'uncertain'; error: string; providerReference?: string };

export type PayoutProviderAdapter = (req: PayoutProviderRequest) => Promise<PayoutProviderResult>;

export interface P0SecurityOptions {
  getSecretSalt: () => string;
  now?: () => number;
  payoutProvider?: PayoutProviderAdapter;
  onAnomaly?: (type: string, details: string) => void;
}

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
export const OTP_MAX_ATTEMPTS = 3;
export const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const POD_ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const POD_MAX_FAILURES = 5;
export const POD_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export const PAYOUT_LOCK_TTL_MS = 30 * 1000; // 30 seconds
export const PAYOUT_PROCESSING_LOCK_TTL_MS = 60 * 1000; // 60 seconds
export const PAYOUT_UNCERTAIN_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const COLLECTIONS = {
  AUTH_RESET_OTPS: 'auth_reset_otps',
  AUTH_RESET_TOKENS: 'auth_reset_tokens',
  POD_OTP_ATTEMPTS: 'pod_otp_attempts',
  POD_OTP_TOKENS: 'pod_otp_tokens',
  PAYOUT_IDEMPOTENCY: 'payout_idempotency',
  PAYOUT_USER_LOCKS: 'payout_user_locks',
  WALLET_TRANSACTIONS: 'wallet_transactions',
  USERS: 'users',
  DELIVERIES: 'deliveries',
  PRIORITY_MISSIONS: 'priority_missions',
  NOTIFICATIONS: 'notifications',
} as const;

export function hashEmailKey(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export function hashOtpCode(email: string, code: string, secretSalt: string): string {
  return crypto
    .createHmac('sha256', secretSalt)
    .update(`${email.trim().toLowerCase()}:${code.trim()}`)
    .digest('hex');
}

export function hashResetToken(token: string, secretSalt: string): string {
  return crypto
    .createHmac('sha256', secretSalt)
    .update(token.trim())
    .digest('hex');
}

export function hashPodTokenDocId(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex').slice(0, 48);
}

export function getPodAttemptDocId(orderDocId: string, uid: string): string {
  return crypto.createHash('sha256').update(`${orderDocId}:${uid}`).digest('hex').slice(0, 40);
}

export function getPayoutIdempotencyDocId(uid: string, idempotencyKey: string): string {
  return crypto.createHash('sha256').update(`${uid}:${idempotencyKey}`).digest('hex').slice(0, 40);
}

export function getAssignedCourierIdFromOrder(data: Record<string, any> | undefined): string {
  if (!data) return '';
  if (typeof data.courierId === 'string' && data.courierId.trim().length > 0) {
    return data.courierId.trim();
  }
  if (data.courier && typeof data.courier.id === 'string' && data.courier.id.trim().length > 0) {
    return data.courier.id.trim();
  }
  return '';
}

export function isTrustedFirebaseStorageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2000) return false;
  return (
    trimmed.startsWith('https://firebasestorage.googleapis.com/') ||
    trimmed.startsWith('https://storage.googleapis.com/')
  );
}

export function signPodOtpToken(
  orderDocId: string,
  courierUid: string,
  expiresAt: number,
  jti: string,
  secretSalt: string
): string {
  const payload = `${orderDocId}:${courierUid}:${expiresAt}:${jti}`;
  const sig = crypto.createHmac('sha256', secretSalt).update(payload).digest('hex');
  return `${expiresAt}.${jti}.${sig}`;
}

export function verifyPodOtpTokenSignature(
  token: string,
  orderDocId: string,
  courierUid: string,
  secretSalt: string,
  nowMs: number
): { valid: boolean; expiresAt?: number; jti?: string; tokenHash?: string } {
  if (typeof token !== 'string') return { valid: false };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };

  const [expiresStr, jti, providedSig] = parts;
  const expiresAt = parseInt(expiresStr, 10);
  if (!Number.isFinite(expiresAt) || nowMs > expiresAt) return { valid: false };
  if (!/^[a-f0-9]{16,64}$/i.test(jti || '')) return { valid: false };
  if (!/^[a-f0-9]{64}$/i.test(providedSig || '')) return { valid: false };

  const expectedSig = crypto
    .createHmac('sha256', secretSalt)
    .update(`${orderDocId}:${courierUid}:${expiresAt}:${jti}`)
    .digest('hex');

  const a = Buffer.from(providedSig, 'hex');
  const b = Buffer.from(expectedSig, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false };
  }

  return {
    valid: true,
    expiresAt,
    jti,
    tokenHash: hashPodTokenDocId(token),
  };
}

const defaultPayoutProvider: PayoutProviderAdapter = async ({ idempotencyKey }) => {
  const ref = `LLP_${crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16).toUpperCase()}`;
  return { outcome: 'succeeded', providerReference: ref };
};

export function createP0SecurityService(db: P0FirestoreLike, options: P0SecurityOptions) {
  const nowFn = options.now || (() => Date.now());
  const provider = options.payoutProvider || defaultPayoutProvider;

  // =========================================================================
  // A. PASSWORD RESET OTP & SINGLE-USE RESET TOKENS
  // =========================================================================
  async function issuePasswordResetOtp(cleanEmail: string): Promise<
    | { ok: true; rawCode: string; expiresAt: number }
    | { ok: false; status: number; error: string; cooldownSeconds?: number }
  > {
    const now = nowFn();
    const emailHash = hashEmailKey(cleanEmail);
    const otpRef = db.collection(COLLECTIONS.AUTH_RESET_OTPS).doc(emailHash);
    const secretSalt = options.getSecretSalt();

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(otpRef);
      if (snap.exists) {
        const existing = snap.data() || {};
        const lastReq = Number(existing.lastRequestedAt || 0);
        if (now - lastReq < OTP_RESEND_COOLDOWN_MS) {
          const waitSeconds = Math.max(1, Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - lastReq)) / 1000));
          return {
            ok: false as const,
            status: 429,
            cooldownSeconds: waitSeconds,
            error: `Veuillez patienter encore ${waitSeconds} seconde(s) avant de demander un nouveau code.`,
          };
        }
      }

      const rawCode = crypto.randomInt(100000, 1000000).toString();
      const hashedCode = hashOtpCode(cleanEmail, rawCode, secretSalt);
      const expiresAt = now + OTP_TTL_MS;

      tx.set(otpRef, {
        emailHash,
        hashedCode,
        expiresAt,
        attemptsLeft: OTP_MAX_ATTEMPTS,
        lastRequestedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return { ok: true as const, rawCode, expiresAt };
    });
  }

  async function clearPasswordResetOtp(cleanEmail: string): Promise<void> {
    const emailHash = hashEmailKey(cleanEmail);
    await db.collection(COLLECTIONS.AUTH_RESET_OTPS).doc(emailHash).delete().catch(() => {});
  }

  async function verifyPasswordResetOtp(
    cleanEmail: string,
    cleanCode: string
  ): Promise<
    | { ok: true; resetToken: string; expiresAt: number }
    | { ok: false; status: number; error: string; attemptsLeft?: number }
  > {
    const now = nowFn();
    const emailHash = hashEmailKey(cleanEmail);
    const otpRef = db.collection(COLLECTIONS.AUTH_RESET_OTPS).doc(emailHash);
    const secretSalt = options.getSecretSalt();

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(otpRef);
      if (!snap.exists) {
        return {
          ok: false as const,
          status: 400,
          error: 'Aucun code actif trouvé pour cet e-mail ou le code a expiré. Veuillez demander un nouveau code.',
        };
      }

      const stored = snap.data() || {};
      const expiresAt = Number(stored.expiresAt || 0);
      const attemptsLeft = Number(stored.attemptsLeft ?? 0);

      if (now > expiresAt) {
        tx.delete(otpRef);
        return {
          ok: false as const,
          status: 400,
          error: 'Ce code de sécurité a expiré. Veuillez demander un nouveau code.',
        };
      }

      if (attemptsLeft <= 0) {
        tx.delete(otpRef);
        return {
          ok: false as const,
          status: 429,
          error: 'Nombre maximal de tentatives dépassé. Par sécurité, ce code a été invalidé. Veuillez en demander un nouveau.',
        };
      }

      const inputHash = hashOtpCode(cleanEmail, cleanCode, secretSalt);
      const inputBuf = Buffer.from(inputHash, 'utf8');
      const storedBuf = Buffer.from(String(stored.hashedCode || ''), 'utf8');
      const isMatch = inputBuf.length === storedBuf.length && crypto.timingSafeEqual(inputBuf, storedBuf);

      if (!isMatch) {
        const nextAttempts = attemptsLeft - 1;
        if (nextAttempts <= 0) {
          tx.delete(otpRef);
          return {
            ok: false as const,
            status: 400,
            attemptsLeft: 0,
            error: 'Code incorrect. Nombre maximal de tentatives atteint. Ce code est désormais invalidé.',
          };
        }
        tx.update(otpRef, {
          attemptsLeft: nextAttempts,
          updatedAt: now,
        });
        return {
          ok: false as const,
          status: 400,
          attemptsLeft: nextAttempts,
          error: `Code de sécurité incorrect. Il vous reste ${nextAttempts} tentative(s).`,
        };
      }

      const rawResetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(rawResetToken, secretSalt);
      const tokenExpiresAt = now + RESET_TOKEN_TTL_MS;
      const tokenRef = db.collection(COLLECTIONS.AUTH_RESET_TOKENS).doc(tokenHash);

      tx.delete(otpRef);
      tx.set(tokenRef, {
        tokenHash,
        emailHash,
        expiresAt: tokenExpiresAt,
        used: false,
        usedAt: null,
        createdAt: now,
      });

      return { ok: true as const, resetToken: rawResetToken, expiresAt: tokenExpiresAt };
    });
  }

  async function consumePasswordResetToken(
    cleanEmail: string,
    rawResetToken: string
  ): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    const now = nowFn();
    const emailHash = hashEmailKey(cleanEmail);
    const secretSalt = options.getSecretSalt();
    const tokenHash = hashResetToken(rawResetToken, secretSalt);
    const tokenRef = db.collection(COLLECTIONS.AUTH_RESET_TOKENS).doc(tokenHash);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(tokenRef);
      if (!snap.exists) {
        return {
          ok: false as const,
          status: 403,
          error: 'Jeton de réinitialisation invalide ou déjà utilisé. Veuillez recommencer la procédure.',
        };
      }

      const tokenData = snap.data() || {};
      if (tokenData.emailHash !== emailHash || tokenData.used === true) {
        return {
          ok: false as const,
          status: 403,
          error: 'Jeton de réinitialisation invalide ou déjà utilisé. Veuillez recommencer la procédure.',
        };
      }

      if (now > Number(tokenData.expiresAt || 0)) {
        tx.delete(tokenRef);
        return {
          ok: false as const,
          status: 403,
          error: 'La session de réinitialisation a expiré. Veuillez demander un nouveau code.',
        };
      }

      tx.update(tokenRef, {
        used: true,
        usedAt: now,
      });

      return { ok: true as const };
    });
  }

  // =========================================================================
  // B. DELIVERY POD OTP VERIFICATION & SINGLE-USE COMPLETION
  // =========================================================================
  async function verifyDeliveryPodOtp(params: {
    cleanDocId: string;
    callerUid: string;
    isAdmin: boolean;
    rawCode: string;
  }): Promise<
    | { ok: true; podOtpToken: string; expiresAt: number }
    | { ok: false; status: number; error: string; verified?: false; attemptsLeft?: number }
  > {
    const { cleanDocId, callerUid, isAdmin, rawCode } = params;
    const now = nowFn();
    const secretSalt = options.getSecretSalt();
    const attemptDocId = getPodAttemptDocId(cleanDocId, callerUid);

    const deliveryRef = db.collection(COLLECTIONS.DELIVERIES).doc(cleanDocId);
    const otpRef = deliveryRef.collection('private').doc('otp');
    const attemptRef = db.collection(COLLECTIONS.POD_OTP_ATTEMPTS).doc(attemptDocId);

    return db.runTransaction(async (tx) => {
      const [deliverySnap, otpSnap, attemptSnap] = await Promise.all([
        tx.get(deliveryRef),
        tx.get(otpRef),
        tx.get(attemptRef),
      ]);

      const attemptData = attemptSnap.exists ? attemptSnap.data() || {} : null;
      if (
        attemptData &&
        now < Number(attemptData.resetAt || 0) &&
        Number(attemptData.failures || 0) >= POD_MAX_FAILURES
      ) {
        return {
          ok: false as const,
          status: 429,
          error: 'Trop de tentatives de vérification OTP pour cette course. Veuillez patienter 10 minutes.',
        };
      }

      if (!deliverySnap.exists) {
        return { ok: false as const, status: 404, error: 'Livraison introuvable.' };
      }

      const deliveryData = deliverySnap.data() || {};
      if (deliveryData.status === 'livree' || deliveryData.status === 'echec') {
        return { ok: false as const, status: 409, error: 'Cette livraison est déjà clôturée.' };
      }

      const assignedCourierId = getAssignedCourierIdFromOrder(deliveryData);
      if (!isAdmin) {
        if (!assignedCourierId || assignedCourierId !== callerUid) {
          options.onAnomaly?.('UNAUTHORIZED_OTP_VERIFY', `Tentative OTP sur ${cleanDocId} par non-assigné ${callerUid}`);
          return {
            ok: false as const,
            status: 403,
            error: 'Seul le livreur assigné à cette course peut vérifier le code OTP.',
          };
        }
        if (!['colis_recupere', 'en_cours'].includes(deliveryData.status)) {
          return {
            ok: false as const,
            status: 400,
            error: 'Le colis doit être récupéré ou en cours de livraison avant de vérifier le code OTP.',
          };
        }
      }

      const storedOtp = String(otpSnap.exists ? otpSnap.data()?.otpCode || '' : '').trim();
      if (!/^\d{4}$/.test(storedOtp)) {
        return {
          ok: false as const,
          status: 400,
          error: 'Aucun code OTP actif enregistré pour cette livraison.',
        };
      }

      const a = Buffer.from(rawCode, 'utf8');
      const b = Buffer.from(storedOtp, 'utf8');
      const isMatch = a.length === b.length && crypto.timingSafeEqual(a, b);

      if (!isMatch) {
        const windowActive = Boolean(attemptData && now < Number(attemptData.resetAt || 0));
        const nextFailures = windowActive ? Number(attemptData?.failures || 0) + 1 : 1;
        const resetAt = windowActive ? Number(attemptData?.resetAt) : now + POD_ATTEMPT_WINDOW_MS;

        tx.set(attemptRef, {
          id: attemptDocId,
          orderDocId: cleanDocId,
          uid: callerUid,
          failures: nextFailures,
          resetAt,
          expiresAt: resetAt,
          updatedAt: now,
        });

        return {
          ok: false as const,
          status: 400,
          verified: false as const,
          attemptsLeft: Math.max(0, POD_MAX_FAILURES - nextFailures),
          error: `Code OTP incorrect (#${rawCode}). Demandez au client le code à 4 chiffres transmis par le vendeur.`,
        };
      }

      if (attemptSnap.exists) {
        tx.delete(attemptRef);
      }

      const jti = crypto.randomBytes(16).toString('hex');
      const expiresAt = now + POD_TOKEN_TTL_MS;
      const podOtpToken = signPodOtpToken(cleanDocId, callerUid, expiresAt, jti, secretSalt);
      const tokenHash = hashPodTokenDocId(podOtpToken);
      const tokenRef = db.collection(COLLECTIONS.POD_OTP_TOKENS).doc(tokenHash);

      tx.set(tokenRef, {
        id: tokenHash,
        jti,
        orderDocId: cleanDocId,
        courierUid: callerUid,
        expiresAt,
        used: false,
        usedAt: null,
        createdAt: now,
      });

      return {
        ok: true as const,
        podOtpToken,
        expiresAt,
      };
    });
  }

  async function completeDeliveryPod(params: {
    cleanDocId: string;
    callerUid: string;
    callerEmail?: string;
    isAdmin: boolean;
    otpCode?: unknown;
    podOtpToken?: unknown;
    photoUrl?: unknown;
    signatureDataUrl?: unknown;
    signedByName?: unknown;
  }): Promise<
    | {
        ok: true;
        orderId: string;
        podData: Record<string, any>;
        deliveredAt: number;
        statusNote: string;
      }
    | { ok: false; status: number; error: string }
  > {
    const {
      cleanDocId,
      callerUid,
      callerEmail,
      isAdmin,
      otpCode,
      podOtpToken,
      photoUrl,
      signatureDataUrl,
      signedByName,
    } = params;
    const now = nowFn();
    const secretSalt = options.getSecretSalt();
    const attemptDocId = getPodAttemptDocId(cleanDocId, callerUid);

    const hasTokenInput = typeof podOtpToken === 'string' && podOtpToken.trim().length > 0;
    const rawToken = hasTokenInput ? String(podOtpToken).trim() : '';
    const sigCheck = hasTokenInput
      ? verifyPodOtpTokenSignature(rawToken, cleanDocId, callerUid, secretSalt, now)
      : null;

    if (hasTokenInput && !sigCheck?.valid) {
      return {
        ok: false as const,
        status: 403,
        error: 'Jeton de vérification POD invalide ou expiré. Veuillez vérifier à nouveau le code OTP.',
      };
    }

    const deliveryRef = db.collection(COLLECTIONS.DELIVERIES).doc(cleanDocId);
    const missionRef = db.collection(COLLECTIONS.PRIORITY_MISSIONS).doc(cleanDocId);
    const otpRef = deliveryRef.collection('private').doc('otp');
    const attemptRef = db.collection(COLLECTIONS.POD_OTP_ATTEMPTS).doc(attemptDocId);
    const tokenRef = sigCheck?.tokenHash
      ? db.collection(COLLECTIONS.POD_OTP_TOKENS).doc(sigCheck.tokenHash)
      : null;

    return db.runTransaction(async (tx) => {
      const reads: Promise<P0DocumentSnapshot>[] = [
        tx.get(deliveryRef),
        tx.get(missionRef),
        tx.get(otpRef),
        tx.get(attemptRef),
      ];
      if (tokenRef) {
        reads.push(tx.get(tokenRef));
      }
      const [deliverySnap, missionSnap, otpSnap, attemptSnap, tokenSnap] = await Promise.all(reads);

      if (!deliverySnap.exists) {
        return { ok: false as const, status: 404, error: 'Livraison introuvable dans Firestore.' };
      }

      const deliveryData = deliverySnap.data() || {};
      if (deliveryData.status === 'livree' || deliveryData.status === 'echec') {
        return { ok: false as const, status: 409, error: 'Cette livraison est déjà clôturée.' };
      }

      const assignedCourierId = getAssignedCourierIdFromOrder(deliveryData);
      if (!isAdmin) {
        if (!assignedCourierId || assignedCourierId !== callerUid) {
          options.onAnomaly?.('UNAUTHORIZED_POD_COMPLETION', `Tentative POD sur ${cleanDocId} par non-assigné ${callerUid}`);
          return {
            ok: false as const,
            status: 403,
            error: 'Seul le livreur assigné peut certifier la livraison.',
          };
        }
        if (!['colis_recupere', 'en_cours'].includes(deliveryData.status)) {
          return {
            ok: false as const,
            status: 400,
            error: 'Statut invalide : le colis doit être récupéré ou en transit avant certification POD.',
          };
        }
        if (!isTrustedFirebaseStorageUrl(photoUrl) || !isTrustedFirebaseStorageUrl(signatureDataUrl)) {
          return {
            ok: false as const,
            status: 400,
            error: 'Les preuves photo et signature doivent être téléchargées dans Firebase Storage avant validation finale.',
          };
        }
      }

      let otpVerified = false;
      if (tokenRef) {
        const tokenData = tokenSnap?.exists ? tokenSnap.data() || {} : null;
        if (
          !tokenData ||
          tokenData.used === true ||
          tokenData.orderDocId !== cleanDocId ||
          tokenData.courierUid !== callerUid ||
          now > Number(tokenData.expiresAt || 0)
        ) {
          return {
            ok: false as const,
            status: 403,
            error: 'Ce jeton de vérification POD est déjà utilisé ou expiré. Veuillez saisir le code OTP à nouveau.',
          };
        }
        tx.update(tokenRef, {
          used: true,
          usedAt: now,
        });
        otpVerified = true;
      } else {
        const cleanOtp = String(otpCode || '').trim();
        const attemptData = attemptSnap.exists ? attemptSnap.data() || {} : null;
        if (
          !isAdmin &&
          attemptData &&
          now < Number(attemptData.resetAt || 0) &&
          Number(attemptData.failures || 0) >= POD_MAX_FAILURES
        ) {
          return {
            ok: false as const,
            status: 429,
            error: 'Trop de tentatives de vérification OTP pour cette course. Veuillez patienter 10 minutes.',
          };
        }

        if (/^\d{4}$/.test(cleanOtp) && otpSnap.exists) {
          const storedOtp = String(otpSnap.data()?.otpCode || '').trim();
          if (/^\d{4}$/.test(storedOtp)) {
            const a = Buffer.from(cleanOtp, 'utf8');
            const b = Buffer.from(storedOtp, 'utf8');
            otpVerified = a.length === b.length && crypto.timingSafeEqual(a, b);
          }
        }

        if (!otpVerified && !isAdmin) {
          if (/^\d{4}$/.test(cleanOtp)) {
            const windowActive = Boolean(attemptData && now < Number(attemptData.resetAt || 0));
            const nextFailures = windowActive ? Number(attemptData?.failures || 0) + 1 : 1;
            const resetAt = windowActive ? Number(attemptData?.resetAt) : now + POD_ATTEMPT_WINDOW_MS;
            tx.set(attemptRef, {
              id: attemptDocId,
              orderDocId: cleanDocId,
              uid: callerUid,
              failures: nextFailures,
              resetAt,
              expiresAt: resetAt,
              updatedAt: now,
            });
          }
          return {
            ok: false as const,
            status: 403,
            error: 'Validation du code secret OTP requise avant de clôturer la livraison.',
          };
        }
      }

      if (attemptSnap.exists) {
        tx.delete(attemptRef);
      }

      const cleanSigner = String(signedByName || deliveryData.clientName || 'Destinataire').trim().slice(0, 128);
      const nowTime = new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const statusNote =
        isAdmin && !otpVerified
          ? `Livrée avec succès (Validation Administrative par ${callerEmail || callerUid})`
          : `Livrée avec succès (Preuve Tri-Facteur certifiée • Signature de ${cleanSigner})`;

      const podData = {
        type: isAdmin && !otpVerified ? 'admin_override' : 'complete_tri_factor',
        otpVerified,
        otpCode: otpVerified ? '••••' : 'ADMIN',
        photoUrl: isTrustedFirebaseStorageUrl(photoUrl) ? photoUrl.trim() : '',
        signatureDataUrl: isTrustedFirebaseStorageUrl(signatureDataUrl) ? signatureDataUrl.trim() : '',
        signedByName: cleanSigner,
        validatedAt: nowTime,
        validatedTimestamp: now,
        verifiedByServer: true,
      };

      tx.update(deliveryRef, {
        status: 'livree',
        statusNote,
        podData,
        deliveredAt: now,
        updatedAt: now,
      });

      if (missionSnap.exists) {
        tx.update(missionRef, {
          status: 'livree',
          completedAt: now,
          updatedAt: new Date(now).toISOString(),
        });
      }

      const orderDisplayId = String(deliveryData.id || `#${cleanDocId}`);
      if (deliveryData.merchantId) {
        const mNotifId = `notif_pod_m_${cleanDocId}_${now}`.replace(/[^a-zA-Z0-9_-]/g, '');
        tx.set(db.collection(COLLECTIONS.NOTIFICATIONS).doc(mNotifId), {
          id: mNotifId,
          senderId: 'system_backend',
          recipientId: deliveryData.merchantId,
          title: '✅ Certificat de livraison POD validé',
          message: `La livraison ${orderDisplayId} a été remise à ${cleanSigner} et certifiée par le serveur.`,
          type: 'pod_validated',
          orderId: orderDisplayId,
          orderDocId: cleanDocId,
          actionView: 'vendeur_tracking',
          isRead: false,
          read: false,
          createdAt: now,
          timestamp: nowTime,
        });
      }

      if (assignedCourierId && assignedCourierId !== deliveryData.merchantId) {
        const cNotifId = `notif_pod_c_${cleanDocId}_${now}`.replace(/[^a-zA-Z0-9_-]/g, '');
        tx.set(db.collection(COLLECTIONS.NOTIFICATIONS).doc(cNotifId), {
          id: cNotifId,
          senderId: 'system_backend',
          recipientId: assignedCourierId,
          title: '🎉 Livraison certifiée',
          message: `La preuve POD de la course ${orderDisplayId} a été enregistrée avec succès.`,
          type: 'pod_validated',
          orderId: orderDisplayId,
          orderDocId: cleanDocId,
          actionView: 'livreur_missions',
          isRead: false,
          read: false,
          createdAt: now,
          timestamp: nowTime,
        });
      }

      return {
        ok: true as const,
        orderId: orderDisplayId,
        podData,
        deliveredAt: now,
        statusNote,
      };
    });
  }

  // =========================================================================
  // C. WALLET PAYOUT ATOMIC LOCKS, BALANCE CHECK & IDEMPOTENCY
  // =========================================================================
  async function verifyWalletPayoutIdempotency(params: {
    callerUid: string;
    idempotencyKey: string;
    amount: number;
  }): Promise<
    | { ok: true; idempotencyKey: string; lockedUntil: number; availableBalance: number }
    | {
        ok: false;
        status: number;
        error: string;
        alreadyProcessed?: boolean;
        inFlight?: boolean;
        insufficientBalance?: boolean;
        availableBalance?: number;
      }
  > {
    const { callerUid, idempotencyKey, amount } = params;
    const now = nowFn();
    const docKeyId = getPayoutIdempotencyDocId(callerUid, idempotencyKey);

    const idemRef = db.collection(COLLECTIONS.PAYOUT_IDEMPOTENCY).doc(docKeyId);
    const userLockRef = db.collection(COLLECTIONS.PAYOUT_USER_LOCKS).doc(callerUid);
    const userRef = db.collection(COLLECTIONS.USERS).doc(callerUid);

    return db.runTransaction(async (tx) => {
      const [idemSnap, userLockSnap, userSnap] = await Promise.all([
        tx.get(idemRef),
        tx.get(userLockRef),
        tx.get(userRef),
      ]);

      if (!userSnap.exists) {
        return {
          ok: false as const,
          status: 404,
          error: 'Compte portefeuille utilisateur introuvable.',
        };
      }

      const availableBalance = Number(userSnap.data()?.walletBalanceFCFA ?? 0);

      if (idemSnap.exists) {
        const existing = idemSnap.data() || {};
        if (existing.status === 'committed') {
          return {
            ok: false as const,
            status: 409,
            alreadyProcessed: true,
            error: 'Cette opération de retrait a déjà été exécutée (registre Firestore). Double débit prévenu.',
          };
        }
        if (existing.status === 'failed') {
          return {
            ok: false as const,
            status: 409,
            alreadyProcessed: true,
            error: 'Cette clé d\'idempotence correspond à un retrait déjà clôturé en échec. Veuillez initier une nouvelle opération.',
          };
        }
        if (existing.status === 'uncertain' || existing.status === 'processing') {
          return {
            ok: false as const,
            status: 409,
            inFlight: true,
            error: 'Ce retrait est en cours de finalisation ou en attente de confirmation prestataire.',
          };
        }
        if (existing.status === 'locked' && now < Number(existing.lockedUntil || 0)) {
          return {
            ok: false as const,
            status: 429,
            inFlight: true,
            error: 'Un retrait avec cette clé est déjà verrouillé et en cours de traitement.',
          };
        }
        if (existing.status === 'locked' && Number(existing.amount) !== amount) {
          return {
            ok: false as const,
            status: 409,
            error: 'Clé d\'idempotence déjà associée à un montant différent.',
          };
        }
      }

      if (userLockSnap.exists) {
        const lockData = userLockSnap.data() || {};
        if (lockData.activeDocKeyId !== docKeyId) {
          const lockStatus = String(lockData.status || '');
          const lockActive =
            lockStatus === 'processing' ||
            lockStatus === 'uncertain' ||
            (lockStatus === 'locked' && now < Number(lockData.lockedUntil || 0));
          if (lockActive) {
            return {
              ok: false as const,
              status: 429,
              inFlight: true,
              error: 'Un autre retrait pour ce compte est déjà en cours de traitement. Veuillez patienter.',
            };
          }
        }
      }

      if (!Number.isFinite(availableBalance) || availableBalance < amount) {
        return {
          ok: false as const,
          status: 400,
          insufficientBalance: true,
          availableBalance: Number.isFinite(availableBalance) ? availableBalance : 0,
          error: `Solde disponible insuffisant (${Math.max(0, Number.isFinite(availableBalance) ? availableBalance : 0).toLocaleString('fr-FR')} FCFA disponibles).`,
        };
      }

      const lockedUntil = now + PAYOUT_LOCK_TTL_MS;
      const cleanKey = String(idempotencyKey).slice(0, 128);

      tx.set(idemRef, {
        id: docKeyId,
        uid: callerUid,
        idempotencyKey: cleanKey,
        amount,
        balanceBefore: availableBalance,
        status: 'locked',
        lockedUntil,
        createdAt: idemSnap.exists ? idemSnap.data()?.createdAt || now : now,
        updatedAt: now,
      });

      tx.set(userLockRef, {
        uid: callerUid,
        activeDocKeyId: docKeyId,
        idempotencyKey: cleanKey,
        amount,
        status: 'locked',
        lockedUntil,
        updatedAt: now,
      });

      return {
        ok: true as const,
        idempotencyKey: cleanKey,
        lockedUntil,
        availableBalance,
      };
    });
  }

  async function commitWalletPayout(params: {
    callerUid: string;
    idempotencyKey: string;
    amount?: number;
    operator?: string;
    payoutPhone?: string;
  }): Promise<
    | {
        ok: true;
        idempotencyKey: string;
        balanceBefore: number;
        balanceAfter: number;
        providerReference: string;
        recoveredFromInterruption?: boolean;
      }
    | {
        ok: false;
        status: number;
        error: string;
        alreadyProcessed?: boolean;
        insufficientBalance?: boolean;
        compensated?: boolean;
        requiresReconciliation?: boolean;
        payoutStatus?: string;
      }
  > {
    const { callerUid, idempotencyKey, amount, operator, payoutPhone } = params;
    const now = nowFn();
    const docKeyId = getPayoutIdempotencyDocId(callerUid, idempotencyKey);
    const wtxId = `wtx_${docKeyId}`;

    const idemRef = db.collection(COLLECTIONS.PAYOUT_IDEMPOTENCY).doc(docKeyId);
    const userLockRef = db.collection(COLLECTIONS.PAYOUT_USER_LOCKS).doc(callerUid);
    const userRef = db.collection(COLLECTIONS.USERS).doc(callerUid);
    const wtxRef = db.collection(COLLECTIONS.WALLET_TRANSACTIONS).doc(wtxId);

    const cleanOperator = typeof operator === 'string' ? operator.trim().slice(0, 32) : '';
    const cleanPhone = typeof payoutPhone === 'string' ? payoutPhone.trim().slice(0, 32) : '';

    // Phase 1: Atomic balance verification & reservation (or idempotent resume if interrupted in processing/uncertain)
    const phase1 = await db.runTransaction(async (tx) => {
      const [idemSnap, userLockSnap, userSnap, wtxSnap] = await Promise.all([
        tx.get(idemRef),
        tx.get(userLockRef),
        tx.get(userRef),
        tx.get(wtxRef),
      ]);

      if (!idemSnap.exists) {
        return {
          proceed: false as const,
          status: 400,
          error: 'Verrou d\'idempotence préalable requis avant confirmation du retrait.',
        };
      }

      const idemData = idemSnap.data() || {};
      if (idemData.uid !== callerUid) {
        return {
          proceed: false as const,
          status: 403,
          error: 'Accès refusé : clé d\'idempotence associée à un autre compte.',
        };
      }

      if (idemData.status === 'committed') {
        return {
          proceed: false as const,
          status: 409,
          alreadyProcessed: true,
          error: 'Ce retrait a déjà été confirmé dans Firestore.',
        };
      }

      if (idemData.status === 'failed') {
        return {
          proceed: false as const,
          status: 409,
          alreadyProcessed: true,
          error: 'Ce retrait a déjà été clôturé en échec et son solde a été conservé.',
        };
      }

      const expectedAmount = Number(idemData.amount);
      if (typeof amount === 'number' && Number.isFinite(amount) && amount !== expectedAmount) {
        return {
          proceed: false as const,
          status: 400,
          error: 'Montant incohérent avec le verrou d\'idempotence initial.',
        };
      }

      if (!userSnap.exists) {
        return {
          proceed: false as const,
          status: 404,
          error: 'Compte portefeuille utilisateur introuvable.',
        };
      }

      // If previous execution was interrupted after reserving balance, resume without double-debiting!
      if (idemData.status === 'processing' || idemData.status === 'uncertain') {
        return {
          proceed: true as const,
          recovered: true,
          commitAmount: expectedAmount,
          balanceBefore: Number(idemData.balanceBefore ?? 0),
          balanceAfter: Number(idemData.balanceAfter ?? 0),
        };
      }

      if (idemData.status !== 'locked') {
        return {
          proceed: false as const,
          status: 409,
          error: 'Statut de retrait invalide pour confirmation.',
        };
      }

      if (userLockSnap.exists) {
        const lockData = userLockSnap.data() || {};
        if (
          lockData.activeDocKeyId !== docKeyId &&
          (lockData.status === 'processing' ||
            lockData.status === 'uncertain' ||
            (lockData.status === 'locked' && now < Number(lockData.lockedUntil || 0)))
        ) {
          return {
            proceed: false as const,
            status: 409,
            error: 'Un autre retrait est actuellement actif pour ce compte.',
          };
        }
      }

      const currentBalance = Number(userSnap.data()?.walletBalanceFCFA ?? 0);
      if (!Number.isFinite(currentBalance) || currentBalance < expectedAmount) {
        tx.update(idemRef, {
          status: 'failed',
          failedAt: now,
          providerError: 'INSUFFICIENT_BALANCE_AT_COMMIT',
          updatedAt: now,
        });
        if (userLockSnap.exists && userLockSnap.data()?.activeDocKeyId === docKeyId) {
          tx.delete(userLockRef);
        }
        return {
          proceed: false as const,
          status: 400,
          insufficientBalance: true,
          error: `Solde disponible insuffisant lors de la validation (${Math.max(0, Number.isFinite(currentBalance) ? currentBalance : 0).toLocaleString('fr-FR')} FCFA).`,
        };
      }

      const balanceAfter = currentBalance - expectedAmount;

      tx.update(userRef, {
        walletBalanceFCFA: balanceAfter,
        updatedAt: now,
      });

      tx.update(idemRef, {
        status: 'processing',
        reservedAmount: expectedAmount,
        balanceBefore: currentBalance,
        balanceAfter,
        updatedAt: now,
      });

      tx.set(userLockRef, {
        uid: callerUid,
        activeDocKeyId: docKeyId,
        idempotencyKey: String(idempotencyKey).slice(0, 128),
        amount: expectedAmount,
        status: 'processing',
        lockedUntil: now + PAYOUT_PROCESSING_LOCK_TTL_MS,
        updatedAt: now,
      });

      if (!wtxSnap.exists) {
        tx.set(wtxRef, {
          id: wtxId,
          uid: callerUid,
          idempotencyDocId: docKeyId,
          idempotencyKey: String(idempotencyKey).slice(0, 128),
          type: 'payout_debit',
          amountFCFA: expectedAmount,
          balanceBefore: currentBalance,
          balanceAfter,
          status: 'processing',
          operator: cleanOperator,
          payoutPhone: cleanPhone,
          createdAt: now,
          updatedAt: now,
        });
      }

      return {
        proceed: true as const,
        recovered: false,
        commitAmount: expectedAmount,
        balanceBefore: currentBalance,
        balanceAfter,
      };
    });

    if (!phase1.proceed) {
      return {
        ok: false as const,
        status: phase1.status,
        error: phase1.error,
        alreadyProcessed: phase1.alreadyProcessed,
        insufficientBalance: phase1.insufficientBalance,
      };
    }

    // Phase 2: Call external payment provider using idempotencyKey
    let providerRes: PayoutProviderResult;
    try {
      providerRes = await provider({
        uid: callerUid,
        amount: phase1.commitAmount,
        idempotencyKey,
        operator: cleanOperator,
        payoutPhone: cleanPhone,
      });
    } catch (providerErr: any) {
      providerRes = {
        outcome: 'uncertain',
        error: providerErr?.message || 'Réponse incertaine ou expiration du prestataire de paiement.',
      };
    }

    const doneNow = nowFn();

    // Phase 3: Finalize or compensate atomically based on provider outcome
    if (providerRes.outcome === 'succeeded') {
      await db.runTransaction(async (tx) => {
        const [idemSnap, userLockSnap, wtxSnap] = await Promise.all([
          tx.get(idemRef),
          tx.get(userLockRef),
          tx.get(wtxRef),
        ]);

        if (idemSnap.exists && idemSnap.data()?.status === 'committed') {
          return;
        }

        tx.update(idemRef, {
          status: 'committed',
          providerReference: providerRes.providerReference,
          committedAt: doneNow,
          updatedAt: doneNow,
        });

        if (wtxSnap.exists) {
          tx.update(wtxRef, {
            status: 'committed',
            providerReference: providerRes.providerReference,
            updatedAt: doneNow,
          });
        }

        if (userLockSnap.exists && userLockSnap.data()?.activeDocKeyId === docKeyId) {
          tx.delete(userLockRef);
        }
      });

      return {
        ok: true as const,
        idempotencyKey,
        balanceBefore: phase1.balanceBefore,
        balanceAfter: phase1.balanceAfter,
        providerReference: providerRes.providerReference,
        recoveredFromInterruption: phase1.recovered || undefined,
      };
    }

    if (providerRes.outcome === 'failed') {
      await db.runTransaction(async (tx) => {
        const [idemSnap, userLockSnap, userSnap, wtxSnap] = await Promise.all([
          tx.get(idemRef),
          tx.get(userLockRef),
          tx.get(userRef),
          tx.get(wtxRef),
        ]);

        const idemData = idemSnap.data() || {};
        if (idemData.status === 'failed' || idemData.status === 'committed') {
          return;
        }

        const currentBal = Number(userSnap.data()?.walletBalanceFCFA ?? 0);
        const restoredBalance = currentBal + phase1.commitAmount;

        tx.update(userRef, {
          walletBalanceFCFA: restoredBalance,
          updatedAt: doneNow,
        });

        tx.update(idemRef, {
          status: 'failed',
          failedAt: doneNow,
          providerError: providerRes.error,
          updatedAt: doneNow,
        });

        if (wtxSnap.exists) {
          tx.update(wtxRef, {
            status: 'reversed',
            balanceAfter: restoredBalance,
            note: `Échec prestataire (${providerRes.error}) — solde restitué`,
            updatedAt: doneNow,
          });
        }

        if (userLockSnap.exists && userLockSnap.data()?.activeDocKeyId === docKeyId) {
          tx.delete(userLockRef);
        }
      });

      return {
        ok: false as const,
        status: 502,
        compensated: true,
        payoutStatus: 'failed',
        error: `Échec du prestataire de paiement : ${providerRes.error}. Votre solde n'a pas été débité.`,
      };
    }

    // Outcome === 'uncertain': Hold reserved balance and lock to prevent double spend until reconciled/resumed
    await db.runTransaction(async (tx) => {
      const [idemSnap, userLockSnap, wtxSnap] = await Promise.all([
        tx.get(idemRef),
        tx.get(userLockRef),
        tx.get(wtxRef),
      ]);

      const idemData = idemSnap.data() || {};
      if (idemData.status === 'committed' || idemData.status === 'failed') {
        return;
      }

      tx.update(idemRef, {
        status: 'uncertain',
        uncertainAt: doneNow,
        providerError: providerRes.error,
        updatedAt: doneNow,
      });

      if (wtxSnap.exists) {
        tx.update(wtxRef, {
          status: 'uncertain_pending_reconciliation',
          note: `Réponse prestataire incertaine : ${providerRes.error}`,
          updatedAt: doneNow,
        });
      }

      if (!userLockSnap.exists || userLockSnap.data()?.activeDocKeyId === docKeyId) {
        tx.set(userLockRef, {
          uid: callerUid,
          activeDocKeyId: docKeyId,
          idempotencyKey: String(idempotencyKey).slice(0, 128),
          amount: phase1.commitAmount,
          status: 'uncertain',
          lockedUntil: doneNow + PAYOUT_UNCERTAIN_LOCK_TTL_MS,
          updatedAt: doneNow,
        });
      }
    });

    return {
      ok: false as const,
      status: 202,
      requiresReconciliation: true,
      payoutStatus: 'uncertain',
      error: 'Réponse incertaine du prestataire de paiement. Les fonds restent protégés en attente de vérification finale (réessayez avec la même clé d\'idempotence ou contactez l\'administration).',
    };
  }

  // =========================================================================
  // D. SAFE CLEANUP OF EXPIRED SECURITY DOCUMENTS
  // =========================================================================
  async function cleanupExpiredSecurityDocs(limitPerCollection = 25): Promise<{ deletedCount: number }> {
    const now = nowFn();
    let deletedCount = 0;

    const ttlCollections = [
      COLLECTIONS.AUTH_RESET_OTPS,
      COLLECTIONS.AUTH_RESET_TOKENS,
      COLLECTIONS.POD_OTP_ATTEMPTS,
      COLLECTIONS.POD_OTP_TOKENS,
    ];

    for (const colName of ttlCollections) {
      try {
        const expiredSnap = await db
          .collection(colName)
          .where('expiresAt', '<', now)
          .limit(limitPerCollection)
          .get();

        if (!expiredSnap.empty) {
          const batch = db.batch();
          for (const docSnap of expiredSnap.docs) {
            batch.delete(db.collection(colName).doc(docSnap.id));
            deletedCount++;
          }
          await batch.commit();
        }
      } catch {
        // Non-fatal cleanup
      }
    }

    // Only clean stale 'locked' user locks (NEVER 'processing' or 'uncertain' locks!)
    try {
      const staleLocksSnap = await db
        .collection(COLLECTIONS.PAYOUT_USER_LOCKS)
        .where('lockedUntil', '<', now)
        .limit(limitPerCollection)
        .get();

      if (!staleLocksSnap.empty) {
        const batch = db.batch();
        let batchHasOps = false;
        for (const docSnap of staleLocksSnap.docs) {
          const data = docSnap.data() || {};
          if (data.status === 'locked') {
            batch.delete(db.collection(COLLECTIONS.PAYOUT_USER_LOCKS).doc(docSnap.id));
            deletedCount++;
            batchHasOps = true;
          }
        }
        if (batchHasOps) {
          await batch.commit();
        }
      }
    } catch {
      // Non-fatal cleanup
    }

    return { deletedCount };
  }

  return {
    issuePasswordResetOtp,
    clearPasswordResetOtp,
    verifyPasswordResetOtp,
    consumePasswordResetToken,
    verifyDeliveryPodOtp,
    completeDeliveryPod,
    verifyWalletPayoutIdempotency,
    commitWalletPayout,
    cleanupExpiredSecurityDocs,
  };
}
