import crypto from 'crypto';
import nodemailer from 'nodemailer';
import type { P0CollectionRef, P0DocumentRef, P0DocumentSnapshot, P0FirestoreLike, P0Query, P0QuerySnapshot, P0Transaction, P0WriteBatch } from './p0Security';

export interface P1Query extends P0Query {
  orderBy?(field: string, direction?: 'asc' | 'desc'): P1Query;
}

export interface P1CollectionRef extends P0CollectionRef {
  limit(n: number): P1Query;
  orderBy?(field: string, direction?: 'asc' | 'desc'): P1Query;
  get?(): Promise<P0QuerySnapshot>;
}

export interface P1FirestoreLike extends P0FirestoreLike {
  collection(name: string): P1CollectionRef;
}

export const P1_COLLECTIONS = {
  SYSTEM_CONFIG: 'system_config',
  EMAIL_LOGS: 'email_logs',
  EMAIL_QUEUE: 'email_queue',
  EMAIL_DEDUP: 'email_dedup',
} as const;

export const SYSTEM_CONFIG_SMTP_DOC_ID = 'smtp';
export const EMAIL_QUEUE_LEASE_TTL_MS = 60 * 1000;
export const EMAIL_QUEUE_DEFAULT_MAX_RETRIES = 3;
export const EMAIL_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
export const MIN_EMAIL_ENCRYPTION_SECRET_LENGTH = 32;

const SMTP_HKDF_SALT = Buffer.from('livralink-smtp-config-salt-v1', 'utf8');
const SMTP_HKDF_INFO = Buffer.from('aes-256-gcm-smtp-credentials-v1', 'utf8');

export type EmailRecordType =
  | 'welcome'
  | 'password_reset_request'
  | 'password_changed_confirmation'
  | 'priority_mission'
  | 'custom'
  | 'kyc_submitted'
  | 'kyc_approved'
  | 'kyc_rejected';

export interface SentEmailRecord {
  id: string;
  dedupKey?: string;
  type: EmailRecordType;
  eventType?: string;
  to: string;
  recipientName: string;
  recipientRole?: string;
  subject: string;
  previewText: string;
  htmlContent: string;
  status?: 'sent' | 'queued' | 'failed';
  retryCount?: number;
  lastError?: string;
  sentAt: string;
  deliveredViaSmtp: boolean;
}

export interface SmtpRuntimeConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  source: 'firestore' | 'env';
  updatedAt?: string;
  updatedBy?: string;
  hasEncryptedPassInStore?: boolean;
  decryptionError?: string;
}

export interface SanitizedSmtpConfig {
  host: string;
  port: number;
  user: string;
  from: string;
  hasPassword: boolean;
  secure: boolean;
  isConfigured: boolean;
  persistence: 'firestore' | 'env_only';
  encryptionReady: boolean;
  updatedAt?: string;
}

export interface EncryptedSecretBlob {
  alg: 'aes-256-gcm-hkdf-v1';
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
}

export interface EmailQueueJob {
  id: string;
  emailLogId: string;
  dedupKey?: string;
  type: EmailRecordType;
  eventType?: string;
  to: string;
  recipientName: string;
  recipientRole?: string;
  subject: string;
  previewText: string;
  textContent: string;
  htmlContent: string;
  status: 'queued' | 'processing' | 'sent' | 'failed';
  retryCount: number;
  maxRetries: number;
  nextRetryAt: number | null;
  processingLeaseId: string | null;
  processingStartedAt: number | null;
  processingExpiresAt: number | null;
  claimedByInstance?: string | null;
  lastError?: string | null;
  createdAt: number;
  updatedAt: number;
  sentAt?: string | null;
}

export type SmtpMailDispatchFn = (params: {
  config: SmtpRuntimeConfig;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) => Promise<void>;

export interface P1EmailServiceOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  instanceId?: string;
  sendMailFn?: SmtpMailDispatchFn;
  onWarn?: (message: string) => void;
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

/**
 * Resolves the symmetric master secret used to encrypt/decrypt SMTP credentials in Firestore.
 * Uses EMAIL_ENCRYPTION_SECRET when provided, falling back to shared OTP_SECRET_SALT / POD_OTP_HMAC_SECRET.
 * Fail-closed: if EMAIL_ENCRYPTION_SECRET is explicitly set but shorter than 32 chars, returns invalid.
 */
export function evaluateEmailEncryptionSecret(env: NodeJS.ProcessEnv = process.env): {
  valid: boolean;
  tooShort: boolean;
  source: 'EMAIL_ENCRYPTION_SECRET' | 'OTP_SECRET_SALT' | 'POD_OTP_HMAC_SECRET' | 'none';
  secret: string | null;
} {
  const dedicated = (env.EMAIL_ENCRYPTION_SECRET || '').trim();
  if (dedicated.length > 0) {
    if (dedicated.length >= MIN_EMAIL_ENCRYPTION_SECRET_LENGTH) {
      return {
        valid: true,
        tooShort: false,
        source: 'EMAIL_ENCRYPTION_SECRET',
        secret: dedicated,
      };
    }
    return {
      valid: false,
      tooShort: true,
      source: 'EMAIL_ENCRYPTION_SECRET',
      secret: null,
    };
  }

  const otpSalt = (env.OTP_SECRET_SALT || '').trim();
  const podSalt = (env.POD_OTP_HMAC_SECRET || '').trim();
  const fallback = otpSalt || podSalt;
  const source: 'OTP_SECRET_SALT' | 'POD_OTP_HMAC_SECRET' | 'none' = otpSalt
    ? 'OTP_SECRET_SALT'
    : podSalt
      ? 'POD_OTP_HMAC_SECRET'
      : 'none';

  if (fallback.length >= MIN_EMAIL_ENCRYPTION_SECRET_LENGTH) {
    return {
      valid: true,
      tooShort: false,
      source,
      secret: fallback,
    };
  }

  return {
    valid: false,
    tooShort: fallback.length > 0,
    source,
    secret: null,
  };
}

function deriveSmtpAesKey(masterSecret: string): Buffer {
  const derived = crypto.hkdfSync(
    'sha256',
    Buffer.from(masterSecret, 'utf8'),
    SMTP_HKDF_SALT,
    SMTP_HKDF_INFO,
    32
  );
  return Buffer.from(derived);
}

export function encryptSmtpPassword(plaintextPass: string, masterSecret: string, nowMs = Date.now()): EncryptedSecretBlob {
  if (!masterSecret || masterSecret.length < MIN_EMAIL_ENCRYPTION_SECRET_LENGTH) {
    throw new Error('Secret de chiffrement serveur manquant ou trop court (< 32 caractères).');
  }
  const key = deriveSmtpAesKey(masterSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintextPass, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: 'aes-256-gcm-hkdf-v1',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    updatedAt: new Date(nowMs).toISOString(),
  };
}

export function decryptSmtpPassword(blob: EncryptedSecretBlob, masterSecret: string): string {
  if (!masterSecret || masterSecret.length < MIN_EMAIL_ENCRYPTION_SECRET_LENGTH) {
    throw new Error('Secret de déchiffrement serveur manquant ou invalide.');
  }
  if (!blob || blob.alg !== 'aes-256-gcm-hkdf-v1' || !blob.iv || !blob.tag || !blob.ciphertext) {
    throw new Error('Format de secret SMTP chiffré invalide.');
  }
  const key = deriveSmtpAesKey(masterSecret);
  const iv = Buffer.from(blob.iv, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const ciphertext = Buffer.from(blob.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function getEnvDefaultSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpRuntimeConfig {
  const parsedPort = parseInt(String(env.GMAIL_SMTP_PORT || env.SMTP_PORT || '587'), 10);
  return {
    host: (env.GMAIL_SMTP_HOST || env.SMTP_HOST || 'smtp.gmail.com').trim(),
    port: Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 587,
    user: (env.GMAIL_SMTP_USER || env.SMTP_USER || 'Pamphile.gbede@gmail.com').trim(),
    pass: (env.GMAIL_SMTP_PASS || env.SMTP_PASS || '').trim(),
    from: (env.GMAIL_SMTP_FROM || env.SMTP_FROM || 'LivraLink Sécurité <Pamphile.gbede@gmail.com>').trim(),
    source: 'env',
  };
}

export function sanitizeSmtpConfigForApi(
  cfg: SmtpRuntimeConfig,
  options: { persistence: 'firestore' | 'env_only'; encryptionReady: boolean }
): SanitizedSmtpConfig {
  return {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    from: cfg.from,
    hasPassword: Boolean(cfg.pass),
    secure: cfg.port === 465,
    isConfigured: Boolean(cfg.user && cfg.pass),
    persistence: options.persistence,
    encryptionReady: options.encryptionReady,
    updatedAt: cfg.updatedAt,
  };
}

export function normalizeSmtpFromAddress(fromValue: string | undefined, fallback = 'LivraLink <Pamphile.gbede@gmail.com>'): string {
  const raw = (fromValue && fromValue.trim()) ? fromValue : fallback;
  return raw.replace(/\\"/g, '').trim();
}

export function createNodemailerTransportFromConfig(cfg: SmtpRuntimeConfig) {
  if (!cfg.user || !cfg.pass) {
    return null;
  }
  const host = (cfg.host || 'smtp.gmail.com').trim();
  const port = Number(cfg.port) || 587;
  const lowerHost = host.toLowerCase();
  const isLoopback = lowerHost === '127.0.0.1' || lowerHost === 'localhost' || lowerHost === '::1';

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587 && !isLoopback,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  });
}

async function defaultSendMailViaSmtp(params: {
  config: SmtpRuntimeConfig;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const transporter = createNodemailerTransportFromConfig(params.config);
  if (!transporter) {
    throw new Error('Identifiants SMTP Gmail non configurés.');
  }
  await transporter.sendMail({
    from: normalizeSmtpFromAddress(params.from || params.config.from),
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

/**
 * Trust proxy IP classification utilities for Firebase App Hosting / Cloud Run / GFE / local proxy hops.
 */
function normalizeIp(rawIp: string): string {
  const trimmed = (rawIp || '').trim();
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    value = ((value << 8) | n) >>> 0;
  }
  return value;
}

function isIpv4InCidr(ipInt: number, baseIp: string, prefixLen: number): boolean {
  const baseInt = ipv4ToInt(baseIp);
  if (baseInt === null) return false;
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function isInternalProxyIp(rawAddr: string): boolean {
  const ip = normalizeIp(rawAddr);
  if (!ip) return false;

  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === 'localhost') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }

  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;

  // Loopback, RFC1918 private, link-local, CGNAT/Carrier, and GCP/GFE health-check/ingress ranges
  return (
    isIpv4InCidr(ipInt, '127.0.0.0', 8) ||
    isIpv4InCidr(ipInt, '10.0.0.0', 8) ||
    isIpv4InCidr(ipInt, '172.16.0.0', 12) ||
    isIpv4InCidr(ipInt, '192.168.0.0', 16) ||
    isIpv4InCidr(ipInt, '169.254.0.0', 16) ||
    isIpv4InCidr(ipInt, '130.211.0.0', 22) ||
    isIpv4InCidr(ipInt, '35.191.0.0', 16)
  );
}

export function resolveTrustProxySetting(env: NodeJS.ProcessEnv = process.env): boolean | number | string | ((addr: string) => boolean) {
  const raw = (env.TRUST_PROXY || '').trim();
  if (raw) {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    return raw;
  }
  return (addr: string) => isInternalProxyIp(addr);
}

export function extractClientIp(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  const raw = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  const normalized = normalizeIp(raw);
  return normalized || '127.0.0.1';
}

export function hashDedupDocId(dedupKey: string): string {
  return crypto.createHash('sha256').update(dedupKey.trim()).digest('hex').slice(0, 48);
}

export function createP1EmailAndConfigService(
  db: P1FirestoreLike | null,
  options: P1EmailServiceOptions = {}
) {
  const env = options.env || process.env;
  const nowFn = options.now || (() => Date.now());
  const instanceId =
    options.instanceId ||
    process.env.K_REVISION ||
    `inst_${process.pid}_${crypto.randomBytes(3).toString('hex')}`;
  const sendMailFn = options.sendMailFn || defaultSendMailViaSmtp;
  const warn = options.onWarn || ((msg: string) => console.warn(msg));

  // Fallback bounded storage ONLY when Firestore Admin SDK is unavailable (e.g. standalone local unit tests)
  const fallbackEmailsHistory: SentEmailRecord[] = [];
  const fallbackDedupMap = new Map<string, number>();
  let fallbackSmtpConfig: SmtpRuntimeConfig = getEnvDefaultSmtpConfig(env);

  const pruneFallbackDedup = (nowMs: number) => {
    for (const [k, expiresAt] of fallbackDedupMap.entries()) {
      if (expiresAt <= nowMs) {
        fallbackDedupMap.delete(k);
      }
    }
    if (fallbackDedupMap.size > 2000) {
      const oldestKeys = Array.from(fallbackDedupMap.keys()).slice(0, fallbackDedupMap.size - 2000);
      for (const k of oldestKeys) fallbackDedupMap.delete(k);
    }
  };

  async function getEffectiveSmtpConfig(): Promise<SmtpRuntimeConfig> {
    const envDefault = getEnvDefaultSmtpConfig(env);
    if (!db) {
      return { ...fallbackSmtpConfig };
    }

    try {
      const snap = await db.collection(P1_COLLECTIONS.SYSTEM_CONFIG).doc(SYSTEM_CONFIG_SMTP_DOC_ID).get();
      if (!snap.exists) {
        return envDefault;
      }
      const data = snap.data() || {};
      const host = typeof data.host === 'string' && data.host.trim() ? data.host.trim() : envDefault.host;
      const portNum = Number(data.port);
      const port = Number.isFinite(portNum) && portNum > 0 && portNum <= 65535 ? portNum : envDefault.port;
      const user = typeof data.user === 'string' && data.user.trim() ? data.user.trim() : envDefault.user;
      const from = typeof data.from === 'string' && data.from.trim() ? data.from.trim() : envDefault.from;

      let pass = envDefault.pass;
      let decryptionError: string | undefined;
      const hasEncryptedPassInStore = Boolean(data.encryptedPass && typeof data.encryptedPass === 'object');

      if (hasEncryptedPassInStore) {
        const secretState = evaluateEmailEncryptionSecret(env);
        if (secretState.valid && secretState.secret) {
          try {
            pass = decryptSmtpPassword(data.encryptedPass as EncryptedSecretBlob, secretState.secret);
          } catch (decErr: any) {
            decryptionError = 'Impossible de déchiffrer le mot de passe SMTP enregistré (vérifiez la clé serveur).';
            warn(`[P1 SMTP CONFIG WARN] ${decryptionError}: ${decErr?.message || decErr}`);
          }
        } else {
          decryptionError = 'Secret de chiffrement serveur absent ou invalide (< 32 caractères) pour lire le mot de passe SMTP.';
        }
      }

      return {
        host,
        port,
        user,
        pass,
        from,
        source: 'firestore',
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
        updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
        hasEncryptedPassInStore,
        decryptionError,
      };
    } catch (err: any) {
      warn(`[P1 SMTP CONFIG WARN] Lecture Firestore échouée, bascule env: ${err?.message || err}`);
      return envDefault;
    }
  }

  async function saveSmtpConfig(params: {
    host?: string;
    port?: number | string;
    user?: string;
    pass?: string;
    from?: string;
    updatedBy?: string;
  }): Promise<
    | { ok: true; config: SanitizedSmtpConfig }
    | { ok: false; status: number; error: string }
  > {
    const cleanHost = typeof params.host === 'string' ? params.host.trim().slice(0, 255) : undefined;
    const parsedPort = params.port !== undefined ? parseInt(String(params.port), 10) : undefined;
    if (parsedPort !== undefined && (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
      return { ok: false, status: 400, error: 'Port SMTP invalide (1 à 65535 attendu).' };
    }
    const cleanUser = typeof params.user === 'string' ? params.user.trim().slice(0, 255) : undefined;
    const cleanFrom = typeof params.from === 'string' ? params.from.trim().slice(0, 255) : undefined;
    const cleanPass = typeof params.pass === 'string' ? params.pass.trim() : '';

    const secretState = evaluateEmailEncryptionSecret(env);
    const nowIso = new Date(nowFn()).toISOString();

    if (!db) {
      if (cleanHost) fallbackSmtpConfig.host = cleanHost;
      if (parsedPort !== undefined) fallbackSmtpConfig.port = parsedPort;
      if (cleanUser) fallbackSmtpConfig.user = cleanUser;
      if (cleanFrom) fallbackSmtpConfig.from = cleanFrom;
      if (cleanPass) fallbackSmtpConfig.pass = cleanPass;
      fallbackSmtpConfig.updatedAt = nowIso;
      return {
        ok: true,
        config: sanitizeSmtpConfigForApi(fallbackSmtpConfig, {
          persistence: 'env_only',
          encryptionReady: secretState.valid,
        }),
      };
    }

    if (cleanPass && (!secretState.valid || !secretState.secret)) {
      return {
        ok: false,
        status: 503,
        error:
          'Impossible d\'enregistrer le mot de passe SMTP de manière sécurisée : secret de chiffrement serveur (EMAIL_ENCRYPTION_SECRET ou OTP_SECRET_SALT >= 32 caractères) manquant ou invalide.',
      };
    }

    const current = await getEffectiveSmtpConfig();
    const docRef = db.collection(P1_COLLECTIONS.SYSTEM_CONFIG).doc(SYSTEM_CONFIG_SMTP_DOC_ID);
    const updatePayload: Record<string, any> = {
      host: cleanHost || current.host,
      port: parsedPort ?? current.port,
      user: cleanUser || current.user,
      from: cleanFrom || current.from,
      updatedAt: nowIso,
      updatedBy: params.updatedBy || 'admin',
      plaintextPassStripped: true,
    };

    if (cleanPass && secretState.secret) {
      updatePayload.encryptedPass = encryptSmtpPassword(cleanPass, secretState.secret, nowFn());
    }

    await docRef.set(updatePayload, { merge: true });

    const effectiveAfter = await getEffectiveSmtpConfig();
    return {
      ok: true,
      config: sanitizeSmtpConfigForApi(effectiveAfter, {
        persistence: 'firestore',
        encryptionReady: secretState.valid,
      }),
    };
  }

  async function recordEmailLog(
    record: Omit<SentEmailRecord, 'id' | 'sentAt'> & { id?: string; sentAt?: string }
  ): Promise<SentEmailRecord> {
    const nowMs = nowFn();
    const item: SentEmailRecord = stripUndefined({
      ...record,
      id: record.id || `mail_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
      sentAt: record.sentAt || new Date(nowMs).toISOString(),
      status: record.status || (record.deliveredViaSmtp ? 'sent' : 'queued'),
      retryCount: record.retryCount ?? (record.deliveredViaSmtp ? 0 : 1),
    });

    if (item.dedupKey) {
      fallbackDedupMap.set(item.dedupKey, nowMs + EMAIL_DEDUP_TTL_MS);
    }

    const idx = fallbackEmailsHistory.findIndex((e) => e.id === item.id);
    if (idx !== -1) {
      fallbackEmailsHistory[idx] = item;
    } else {
      fallbackEmailsHistory.unshift(item);
      if (fallbackEmailsHistory.length > 100) fallbackEmailsHistory.pop();
    }

    if (db) {
      try {
        await db.collection(P1_COLLECTIONS.EMAIL_LOGS).doc(item.id).set(item, { merge: true });
      } catch (fsErr: any) {
        warn(`[FIRESTORE EMAIL LOG WARN]: ${fsErr?.message || fsErr}`);
      }
    }

    return item;
  }

  async function claimEmailDedupKey(params: {
    dedupKey: string;
    eventType?: string;
    recipientEmail?: string;
  }): Promise<{ allowed: boolean; dedupDocId: string }> {
    const nowMs = nowFn();
    const cleanKey = params.dedupKey.trim();
    const dedupDocId = hashDedupDocId(cleanKey);

    if (!db) {
      pruneFallbackDedup(nowMs);
      const existingExp = fallbackDedupMap.get(cleanKey);
      if (existingExp && existingExp > nowMs) {
        return { allowed: false, dedupDocId };
      }
      fallbackDedupMap.set(cleanKey, nowMs + EMAIL_DEDUP_TTL_MS);
      return { allowed: true, dedupDocId };
    }

    const ref = db.collection(P1_COLLECTIONS.EMAIL_DEDUP).doc(dedupDocId);
    const allowed = await db.runTransaction(async (tx: P0Transaction) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() || {} : null;
      if (data && typeof data.expiresAt === 'number' && data.expiresAt > nowMs) {
        return false;
      }
      tx.set(ref, {
        id: dedupDocId,
        dedupKey: cleanKey.slice(0, 256),
        eventType: params.eventType || 'custom',
        recipientEmail: params.recipientEmail || '',
        createdAt: nowMs,
        expiresAt: nowMs + EMAIL_DEDUP_TTL_MS,
      });
      return true;
    });

    return { allowed, dedupDocId };
  }

  async function releaseEmailDedupKey(dedupKey: string): Promise<void> {
    const cleanKey = dedupKey.trim();
    fallbackDedupMap.delete(cleanKey);
    if (db) {
      try {
        await db.collection(P1_COLLECTIONS.EMAIL_DEDUP).doc(hashDedupDocId(cleanKey)).delete();
      } catch {
        // Ignore cleanup failures
      }
    }
  }

  /**
   * Dispatches an email using the active shared SMTP configuration, logs it in Firestore `email_logs`,
   * and persists a durable retry job in Firestore `email_queue` when immediate SMTP delivery fails or
   * SMTP credentials are unavailable (`allowQueue: true`).
   * Never queues sensitive OTP reset emails (`allowQueue: false`).
   */
  async function dispatchOrQueueEmail(params: {
    id?: string;
    type: EmailRecordType;
    eventType?: string;
    dedupKey?: string;
    to: string;
    recipientName: string;
    recipientRole?: string;
    subject: string;
    previewText: string;
    textContent: string;
    htmlContent: string;
    fromOverride?: string;
    allowQueue?: boolean;
  }): Promise<{
    emailDelivered: boolean;
    queued: boolean;
    emailRecord: SentEmailRecord;
    lastError?: string;
  }> {
    const nowMs = nowFn();
    const allowQueue = params.allowQueue !== false;
    const emailId = params.id || `mail_${nowMs}_${crypto.randomBytes(3).toString('hex')}`;
    const config = await getEffectiveSmtpConfig();

    let emailDelivered = false;
    let lastError: string | undefined;

    if (config.user && config.pass) {
      try {
        await sendMailFn({
          config,
          from: normalizeSmtpFromAddress(params.fromOverride || config.from),
          to: params.to,
          subject: params.subject,
          text: params.textContent,
          html: params.htmlContent,
        });
        emailDelivered = true;
      } catch (err: any) {
        lastError = err?.message || 'Échec de transmission SMTP.';
      }
    } else {
      lastError = config.decryptionError || 'Serveur SMTP non configuré.';
    }

    const shouldQueue = !emailDelivered && allowQueue;
    const status: SentEmailRecord['status'] = emailDelivered
      ? 'sent'
      : shouldQueue
        ? 'queued'
        : 'failed';

    const emailRecord = await recordEmailLog({
      id: emailId,
      dedupKey: params.dedupKey,
      type: params.type,
      eventType: params.eventType,
      to: params.to,
      recipientName: params.recipientName,
      recipientRole: params.recipientRole,
      subject: params.subject,
      previewText: params.previewText,
      htmlContent: params.htmlContent,
      status,
      retryCount: emailDelivered ? 0 : 1,
      lastError,
      deliveredViaSmtp: emailDelivered,
    });

    if (shouldQueue && db) {
      const queueJob: EmailQueueJob = stripUndefined({
        id: emailId,
        emailLogId: emailId,
        dedupKey: params.dedupKey,
        type: params.type,
        eventType: params.eventType,
        to: params.to,
        recipientName: params.recipientName,
        recipientRole: params.recipientRole,
        subject: params.subject,
        previewText: params.previewText,
        textContent: params.textContent,
        htmlContent: params.htmlContent,
        status: 'queued',
        retryCount: 1,
        maxRetries: EMAIL_QUEUE_DEFAULT_MAX_RETRIES,
        nextRetryAt: nowMs + 60 * 1000,
        processingLeaseId: null,
        processingStartedAt: null,
        processingExpiresAt: null,
        claimedByInstance: null,
        lastError: lastError || null,
        createdAt: nowMs,
        updatedAt: nowMs,
        sentAt: null,
      });
      try {
        await db.collection(P1_COLLECTIONS.EMAIL_QUEUE).doc(emailId).set(queueJob, { merge: false });
      } catch (qErr: any) {
        warn(`[P1 EMAIL QUEUE ENQUEUE WARN]: ${qErr?.message || qErr}`);
      }
    }

    return {
      emailDelivered,
      queued: shouldQueue,
      emailRecord,
      lastError,
    };
  }

  /**
   * Processes queued & lease-expired email jobs in Firestore using optimistic two-phase locking.
   * Uses strictly single-field queries (no composite Firestore indexes required).
   */
  async function processEmailQueue(opts: {
    limit?: number;
    forceImmediate?: boolean;
  } = {}): Promise<{
    processedCount: number;
    successCount: number;
    failedCount: number;
    skippedLockedCount: number;
    deferredBackoffCount: number;
  }> {
    const config = await getEffectiveSmtpConfig();
    if (!config.user || !config.pass) {
      return {
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        skippedLockedCount: 0,
        deferredBackoffCount: 0,
      };
    }

    const batchLimit = Math.min(50, Math.max(1, opts.limit || 25));
    const forceImmediate = Boolean(opts.forceImmediate);

    if (!db) {
      const queuedItems = fallbackEmailsHistory.filter(
        (e) => e.status === 'queued' && (e.retryCount || 0) < EMAIL_QUEUE_DEFAULT_MAX_RETRIES
      );
      let successCount = 0;
      let failedCount = 0;
      for (const item of queuedItems.slice(0, batchLimit)) {
        try {
          await sendMailFn({
            config,
            from: normalizeSmtpFromAddress(config.from),
            to: item.to,
            subject: item.subject,
            text: `${item.previewText}\n\nOuvrez l'application LivraLink pour plus de détails.`,
            html: item.htmlContent,
          });
          item.deliveredViaSmtp = true;
          item.status = 'sent';
          item.lastError = undefined;
          await recordEmailLog(item);
          successCount++;
        } catch (err: any) {
          item.retryCount = (item.retryCount || 0) + 1;
          item.lastError = err?.message || 'Échec de tentative SMTP.';
          if (item.retryCount >= EMAIL_QUEUE_DEFAULT_MAX_RETRIES) {
            item.status = 'failed';
            failedCount++;
          }
          await recordEmailLog(item);
        }
      }
      return {
        processedCount: Math.min(queuedItems.length, batchLimit),
        successCount,
        failedCount,
        skippedLockedCount: 0,
        deferredBackoffCount: 0,
      };
    }

    const nowMs = nowFn();
    const queueCol = db.collection(P1_COLLECTIONS.EMAIL_QUEUE);

    const [queuedSnap, processingSnap] = await Promise.all([
      queueCol.where('status', '==', 'queued').limit(batchLimit).get(),
      queueCol.where('status', '==', 'processing').limit(batchLimit).get(),
    ]);

    const candidates = new Map<string, { docSnap: P0DocumentSnapshot; data: EmailQueueJob }>();
    let skippedLockedCount = 0;
    let deferredBackoffCount = 0;

    for (const snap of queuedSnap.docs) {
      const data = snap.data() as EmailQueueJob | undefined;
      if (!data) continue;
      if ((data.retryCount || 0) >= (data.maxRetries || EMAIL_QUEUE_DEFAULT_MAX_RETRIES)) {
        continue;
      }
      if (!forceImmediate && typeof data.nextRetryAt === 'number' && data.nextRetryAt > nowMs) {
        deferredBackoffCount++;
        continue;
      }
      candidates.set(snap.id, { docSnap: snap, data });
    }

    for (const snap of processingSnap.docs) {
      const data = snap.data() as EmailQueueJob | undefined;
      if (!data) continue;
      if (typeof data.processingExpiresAt === 'number' && data.processingExpiresAt > nowMs) {
        skippedLockedCount++;
        continue;
      }
      candidates.set(snap.id, { docSnap: snap, data });
    }

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const [docId] of candidates.entries()) {
      if (processedCount >= batchLimit) break;

      const leaseId = crypto.randomBytes(16).toString('hex');
      const jobRef = queueCol.doc(docId);

      // Phase 1: Atomically claim exclusive execution lease
      const claimResult = await db.runTransaction(async (tx: P0Transaction) => {
        const currentSnap = await tx.get(jobRef);
        if (!currentSnap.exists) {
          return { claimed: false as const, reason: 'missing' as const };
        }
        const job = currentSnap.data() as EmailQueueJob;
        const maxRetries = job.maxRetries || EMAIL_QUEUE_DEFAULT_MAX_RETRIES;
        if (job.status === 'sent' || job.status === 'failed' || (job.retryCount || 0) >= maxRetries) {
          return { claimed: false as const, reason: 'terminal' as const };
        }
        if (job.status === 'processing') {
          if (typeof job.processingExpiresAt === 'number' && job.processingExpiresAt > nowMs) {
            return { claimed: false as const, reason: 'locked' as const };
          }
        } else if (job.status === 'queued') {
          if (!forceImmediate && typeof job.nextRetryAt === 'number' && job.nextRetryAt > nowMs) {
            return { claimed: false as const, reason: 'backoff' as const };
          }
        } else {
          return { claimed: false as const, reason: 'terminal' as const };
        }

        tx.update(jobRef, {
          status: 'processing',
          processingLeaseId: leaseId,
          processingStartedAt: nowMs,
          processingExpiresAt: nowMs + EMAIL_QUEUE_LEASE_TTL_MS,
          claimedByInstance: instanceId,
          updatedAt: nowMs,
        });

        return { claimed: true as const, job };
      });

      if (!claimResult.claimed) {
        if (claimResult.reason === 'locked') skippedLockedCount++;
        if (claimResult.reason === 'backoff') deferredBackoffCount++;
        continue;
      }

      processedCount++;
      const claimedJob = claimResult.job;
      let sendSuccess = false;
      let sendError: string | null = null;

      // Phase 2: External SMTP dispatch outside transaction
      try {
        await sendMailFn({
          config,
          from: normalizeSmtpFromAddress(config.from),
          to: claimedJob.to,
          subject: claimedJob.subject,
          text:
            claimedJob.textContent ||
            `${claimedJob.previewText}\n\nOuvrez l'application LivraLink pour plus de détails.`,
          html: claimedJob.htmlContent,
        });
        sendSuccess = true;
      } catch (err: any) {
        sendError = err?.message || 'Échec de tentative SMTP.';
      }

      const finishNow = nowFn();
      const finishIso = new Date(finishNow).toISOString();
      const logRef = db.collection(P1_COLLECTIONS.EMAIL_LOGS).doc(claimedJob.emailLogId || docId);

      // Phase 3: Lease-verified transactional completion or backoff retry update
      await db.runTransaction(async (tx: P0Transaction) => {
        const latestJobSnap = await tx.get(jobRef);
        if (!latestJobSnap.exists) return;
        const latestJob = latestJobSnap.data() as EmailQueueJob;
        if (latestJob.status !== 'processing' || latestJob.processingLeaseId !== leaseId) {
          // Another instance took over after lease expiration; do not overwrite newer state
          return;
        }

        const latestLogSnap = await tx.get(logRef);

        if (sendSuccess) {
          tx.update(jobRef, {
            status: 'sent',
            sentAt: finishIso,
            processingLeaseId: null,
            processingExpiresAt: null,
            lastError: null,
            updatedAt: finishNow,
          });
          if (latestLogSnap.exists) {
            tx.update(logRef, {
              status: 'sent',
              deliveredViaSmtp: true,
              sentAt: finishIso,
              lastError: null,
            });
          } else {
            tx.set(logRef, stripUndefined({
              id: claimedJob.emailLogId || docId,
              dedupKey: claimedJob.dedupKey,
              type: claimedJob.type,
              eventType: claimedJob.eventType,
              to: claimedJob.to,
              recipientName: claimedJob.recipientName,
              recipientRole: claimedJob.recipientRole,
              subject: claimedJob.subject,
              previewText: claimedJob.previewText,
              htmlContent: claimedJob.htmlContent,
              status: 'sent',
              retryCount: latestJob.retryCount || 1,
              deliveredViaSmtp: true,
              sentAt: finishIso,
            }), { merge: true });
          }
          successCount++;
        } else {
          const maxRetries = latestJob.maxRetries || EMAIL_QUEUE_DEFAULT_MAX_RETRIES;
          const nextAttempt = (latestJob.retryCount || 1) + 1;
          const isExhausted = nextAttempt >= maxRetries;
          const nextStatus: 'queued' | 'failed' = isExhausted ? 'failed' : 'queued';
          const nextRetryAt = isExhausted ? null : finishNow + nextAttempt * 60 * 1000;

          tx.update(jobRef, {
            status: nextStatus,
            retryCount: nextAttempt,
            nextRetryAt,
            processingLeaseId: null,
            processingExpiresAt: null,
            lastError: sendError,
            updatedAt: finishNow,
          });
          if (latestLogSnap.exists) {
            tx.update(logRef, {
              status: nextStatus,
              retryCount: nextAttempt,
              deliveredViaSmtp: false,
              lastError: sendError,
            });
          }
          if (isExhausted) {
            failedCount++;
          }
        }
      });
    }

    return {
      processedCount,
      successCount,
      failedCount,
      skippedLockedCount,
      deferredBackoffCount,
    };
  }

  async function listEmailOutbox(limit = 100): Promise<{
    emails: SentEmailRecord[];
    source: 'firestore' | 'memory';
  }> {
    if (db) {
      try {
        const col = db.collection(P1_COLLECTIONS.EMAIL_LOGS);
        let snap: P0QuerySnapshot;
        if (typeof col.orderBy === 'function') {
          snap = await col.orderBy('sentAt', 'desc').limit(limit).get();
        } else {
          snap = await col.limit(limit).get();
        }
        const rows = snap.docs
          .map((d) => d.data() as SentEmailRecord)
          .filter(Boolean)
          .sort((a, b) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime());
        return { emails: rows.slice(0, limit), source: 'firestore' };
      } catch (fsErr: any) {
        warn(`[FIRESTORE OUTBOX WARN]: ${fsErr?.message || fsErr}`);
      }
    }
    return {
      emails: fallbackEmailsHistory.slice(0, Math.min(limit, 50)),
      source: 'memory',
    };
  }

  async function clearEmailOutbox(maxDelete = 200): Promise<{ clearedCount: number }> {
    let clearedCount = fallbackEmailsHistory.length;
    fallbackEmailsHistory.length = 0;

    if (db) {
      try {
        const snap = await db.collection(P1_COLLECTIONS.EMAIL_LOGS).limit(maxDelete).get();
        if (!snap.empty) {
          const batch: P0WriteBatch = db.batch();
          for (const d of snap.docs) {
            const ref = (d as any).ref as P0DocumentRef | undefined;
            if (ref) {
              batch.delete(ref);
            } else {
              batch.delete(db.collection(P1_COLLECTIONS.EMAIL_LOGS).doc(d.id));
            }
          }
          await batch.commit();
          clearedCount = Math.max(clearedCount, snap.docs.length);
        }
      } catch (err: any) {
        warn(`[FIRESTORE CLEAR OUTBOX WARN]: ${err?.message || err}`);
      }
    }

    return { clearedCount };
  }

  async function cleanupExpiredP1Docs(batchLimit = 25): Promise<number> {
    if (!db) return 0;
    const nowMs = nowFn();
    let deleted = 0;
    try {
      const expiredDedupSnap = await db
        .collection(P1_COLLECTIONS.EMAIL_DEDUP)
        .where('expiresAt', '<=', nowMs)
        .limit(batchLimit)
        .get();
      if (!expiredDedupSnap.empty) {
        const batch = db.batch();
        for (const d of expiredDedupSnap.docs) {
          batch.delete(db.collection(P1_COLLECTIONS.EMAIL_DEDUP).doc(d.id));
        }
        await batch.commit();
        deleted += expiredDedupSnap.docs.length;
      }
    } catch (err: any) {
      warn(`[P1 CLEANUP WARN]: ${err?.message || err}`);
    }
    return deleted;
  }

  return {
    instanceId,
    getEffectiveSmtpConfig,
    saveSmtpConfig,
    recordEmailLog,
    claimEmailDedupKey,
    releaseEmailDedupKey,
    dispatchOrQueueEmail,
    processEmailQueue,
    listEmailOutbox,
    clearEmailOutbox,
    cleanupExpiredP1Docs,
    getFallbackEmailsHistory: () => fallbackEmailsHistory,
  };
}

export type P1EmailAndConfigService = ReturnType<typeof createP1EmailAndConfigService>;
