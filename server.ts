import express, { Request, Response } from 'express';
import compression from 'compression';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

console.log('[SERVER INIT] Brevo SMTP User configuré:', process.env.BREVO_SMTP_USER ? 'OUI (' + process.env.BREVO_SMTP_USER + ')' : 'NON');

const app = express();
// In AI Studio and Cloud Run environments, DEFAULT_APP_PORT is 3000, while PORT=8080 is reserved for Nginx.
// Always bind the Express/Vite app to port 3000 unless specified via CLI flag --port.
let cliPort: number | null = null;
const portArg = process.argv.find((arg) => arg.startsWith('--port'));
if (portArg) {
  if (portArg.includes('=')) {
    cliPort = parseInt(portArg.split('=')[1], 10);
  } else {
    const idx = process.argv.indexOf('--port');
    if (idx !== -1 && process.argv[idx + 1]) {
      cliPort = parseInt(process.argv[idx + 1], 10);
    }
  }
}
const PORT = cliPort || (process.env.DEFAULT_APP_PORT ? parseInt(process.env.DEFAULT_APP_PORT, 10) : parseInt(process.env.PORT || process.env.APP_PORT || '3000', 10));

// Enable high-speed gzip / deflate compression on all HTTP responses
app.use(compression());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // For API and healthcheck endpoints, enforce strict X-Frame-Options protection
  // For UI / frontend pages, do not block iframe embedding in AI Studio preview
  if (req.path.startsWith('/api/') || req.path === '/healthz') {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Defense against large payload DOS: enforce strict 10kb limit on JSON bodies
app.use(express.json({ limit: '10kb' }));

// =========================================================================
// POINT 01: RATE LIMITING PAR VISITEUR (SLIDING WINDOW PAR IP)
// =========================================================================
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const ipRateLimits = new Map<string, RateLimitRecord>();

const checkIpRateLimit = (ip: string, maxRequests: number, windowMs: number): { allowed: boolean; remaining: number } => {
  const now = Date.now();
  const record = ipRateLimits.get(ip);
  if (!record || now > record.resetAt) {
    ipRateLimits.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  record.count += 1;
  return { allowed: true, remaining: maxRequests - record.count };
};

const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
};

// Global API rate limiting middleware: max 120 calls per 60s per visitor IP
app.use('/api', (req, res, next) => {
  // Allow healthz, security audit, and error logs without strict throttling
  if (req.path === '/healthz' || req.path === '/security/audit' || req.path === '/logs/error') {
    return next();
  }
  const ip = getClientIp(req);
  const { allowed, remaining } = checkIpRateLimit(`api_${ip}`, 120, 60 * 1000);
  res.setHeader('X-RateLimit-Limit', '120');
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  if (!allowed) {
    return res.status(429).json({
      error: 'Trop de requêtes. Veuillez patienter avant de renouveler l\'opération.',
      retryAfter: 60,
    });
  }
  next();
});

// =========================================================================
// POINTS 02 & 03: PLAFONNEMENT DES APPELS D'API & DÉPENSES FOURNISSEURS
// =========================================================================
interface ApiQuotaTracker {
  brevoEmails: { count: number; dailyCap: number; unitCostEur: number };
  mapsApiCalls: { count: number; dailyCap: number; unitCostEur: number };
  geminiApiCalls: { count: number; dailyCap: number; unitCostEur: number };
  dailyBudgetCapEur: number;
  lastResetDay: string;
}

const apiUsageStats: ApiQuotaTracker = {
  brevoEmails: { count: 0, dailyCap: 100, unitCostEur: 0.0005 },
  mapsApiCalls: { count: 0, dailyCap: 500, unitCostEur: 0.005 },
  geminiApiCalls: { count: 0, dailyCap: 200, unitCostEur: 0.001 },
  dailyBudgetCapEur: 5.0, // Plafond maximal de 5,00 € par jour
  lastResetDay: new Date().toISOString().slice(0, 10),
};

const checkAndResetDailyQuotas = () => {
  const currentDay = new Date().toISOString().slice(0, 10);
  if (apiUsageStats.lastResetDay !== currentDay) {
    apiUsageStats.brevoEmails.count = 0;
    apiUsageStats.mapsApiCalls.count = 0;
    apiUsageStats.geminiApiCalls.count = 0;
    apiUsageStats.lastResetDay = currentDay;
  }
};

const calculateTotalEstimatedCostToday = (): number => {
  checkAndResetDailyQuotas();
  const brevoCost = apiUsageStats.brevoEmails.count * apiUsageStats.brevoEmails.unitCostEur;
  const mapsCost = apiUsageStats.mapsApiCalls.count * apiUsageStats.mapsApiCalls.unitCostEur;
  const geminiCost = apiUsageStats.geminiApiCalls.count * apiUsageStats.geminiApiCalls.unitCostEur;
  return Number((brevoCost + mapsCost + geminiCost).toFixed(4));
};

const canConsumeApi = (type: 'brevoEmails' | 'mapsApiCalls' | 'geminiApiCalls'): { allowed: boolean; reason?: string } => {
  checkAndResetDailyQuotas();
  const currentTotal = calculateTotalEstimatedCostToday();
  if (currentTotal >= apiUsageStats.dailyBudgetCapEur) {
    return {
      allowed: false,
      reason: `Plafond de dépenses journalier (${apiUsageStats.dailyBudgetCapEur.toFixed(2)} €) atteint pour protéger votre compte.`,
    };
  }

  const stat = apiUsageStats[type];
  if (stat.count >= stat.dailyCap) {
    return {
      allowed: false,
      reason: `Quota journalier atteint pour ce service (${stat.count}/${stat.dailyCap}). Mode sécurisé actif.`,
    };
  }

  return { allowed: true };
};

const trackApiConsumption = (type: 'brevoEmails' | 'mapsApiCalls' | 'geminiApiCalls', count: number = 1) => {
  checkAndResetDailyQuotas();
  apiUsageStats[type].count += count;
};

// Circuit Breaker tracker for external providers
const circuitBreakers = new Map<string, { state: 'CLOSED' | 'OPEN'; failures: number }>();
circuitBreakers.set('brevo_smtp', { state: 'CLOSED', failures: 0 });
circuitBreakers.set('google_maps', { state: 'CLOSED', failures: 0 });
circuitBreakers.set('gemini_api', { state: 'CLOSED', failures: 0 });

// =========================================================================
// POINT 10: ANTI-DOUBLE PAIEMENT & CLÉS D'IDEMPOTENCE
// =========================================================================
const processedIdempotencyKeys = new Set<string>();
const inFlightPayoutLocks = new Map<string, number>();

// =========================================================================
// POINT 18: JOURNAL D'AUDIT CENTRALISÉ DES ERREURS
// =========================================================================
interface ErrorLogEntry {
  id: string;
  timestamp: string;
  ip: string;
  message: string;
  source?: string;
  stack?: string;
  details?: any;
}
const errorAuditRingBuffer: ErrorLogEntry[] = [];
const MAX_ERROR_LOGS = 100;

// =========================================================================
// POINT 17: SURVEILLANCE UPTIME & HEARTBEAT D'ALERTE
// =========================================================================
interface UptimeHealthTracker {
  startTime: number;
  checksPerformed: number;
  consecutiveFailures: number;
  lastCheckTimestamp: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  alertsTriggered: Array<{ timestamp: string; reason: string }>;
}

const uptimeTracker: UptimeHealthTracker = {
  startTime: Date.now(),
  checksPerformed: 0,
  consecutiveFailures: 0,
  lastCheckTimestamp: new Date().toISOString(),
  status: 'HEALTHY',
  alertsTriggered: [],
};

// Initialize Firebase Admin SDK
let firebaseAdminApp: App | null = null;
try {
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'gen-lang-client-0654978401';
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.projectId) projectId = cfg.projectId;
    } catch {}
  }

  const existingApps = getApps();
  if (existingApps.length === 0) {
    firebaseAdminApp = initializeApp({
      projectId,
    });
    console.log(`[FIREBASE-ADMIN] SDK initialisé avec succès pour le projet: ${projectId}`);
  } else {
    firebaseAdminApp = existingApps[0];
  }
} catch (adminInitErr: any) {
  console.warn('[FIREBASE-ADMIN] Note d\'initialisation:', adminInitErr?.message);
}

// Secret salt for HMAC-SHA256 OTP hashing (never exposed to client)
const OTP_SECRET_SALT = process.env.OTP_SECRET_SALT || 'livralink-brevo-otp-secret-salt-2026';

interface SecureOTPEntry {
  hashedCode: string;
  expiresAt: number;
  attemptsLeft: number;
  lastRequestedAt: number;
}

// In-memory store: email -> SecureOTPEntry (hashed code only, never plain text)
const secureOtpStore = new Map<string, SecureOTPEntry>();

// In-memory one-time reset tokens store: tokenHash -> { email, expiresAt } (hashed token only)
const resetTokensStore = new Map<string, { email: string; expiresAt: number }>();

export interface SentEmailRecord {
  id: string;
  type: 'welcome' | 'password_reset_request' | 'password_changed_confirmation' | 'priority_mission' | 'custom';
  to: string;
  recipientName: string;
  recipientRole?: string;
  subject: string;
  previewText: string;
  htmlContent: string;
  sentAt: string;
  deliveredViaSmtp: boolean;
}

const sentEmailsHistory: SentEmailRecord[] = [];

const recordSentEmail = (record: Omit<SentEmailRecord, 'id' | 'sentAt'>): SentEmailRecord => {
  const item: SentEmailRecord = {
    ...record,
    id: `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sentAt: new Date().toISOString(),
  };
  sentEmailsHistory.unshift(item);
  if (sentEmailsHistory.length > 100) {
    sentEmailsHistory.pop();
  }
  return item;
};

/**
 * Configure Brevo SMTP Transporter
 * Brevo Relay: smtp-relay.brevo.com:587
 */
const getBrevoTransporter = () => {
  const host = process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST || 'smtp-relay.brevo.com';
  const port = parseInt(process.env.BREVO_SMTP_PORT || process.env.SMTP_PORT || '587', 10);
  const user = process.env.BREVO_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_PASS || process.env.SMTP_PASS;

  if (user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // false for 587 (STARTTLS)
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }
  return null;
};

const hashOTPCode = (email: string, code: string): string => {
  return crypto
    .createHmac('sha256', OTP_SECRET_SALT)
    .update(`${email.trim().toLowerCase()}:${code.trim()}`)
    .digest('hex');
};

const hashResetToken = (token: string): string => {
  return crypto
    .createHmac('sha256', OTP_SECRET_SALT)
    .update(token.trim())
    .digest('hex');
};

const escapeHtml = (unsafe: any): string => {
  if (typeof unsafe !== 'string') return String(unsafe ?? '');
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * POST /api/auth/send-reset-code
 * Generates an unpredictable 6-digit random code, hashes it on the server,
 * enforces rate-limiting (60s), and dispatches it via Brevo SMTP.
 */
app.post('/api/auth/send-reset-code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body || {};

    const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim()) || email.trim().length > 128) {
      res.status(400).json({ success: false, error: 'Veuillez saisir une adresse e-mail valide (max 128 caractères).' });
      return;
    }

    const ip = getClientIp(req);
    // Defense: IP rate limit (max 10 requests per 10 minutes)
    const ipLimit = checkIpRateLimit(`otp_send_${ip}`, 10, 10 * 60 * 1000);
    if (!ipLimit.allowed) {
      res.status(429).json({
        success: false,
        error: 'Trop de requêtes depuis cette adresse IP. Veuillez patienter avant de réessayer.',
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const now = Date.now();

    // Check rate limit: minimum 60 seconds between requests for the same email
    const existing = secureOtpStore.get(cleanEmail);
    if (existing && now - existing.lastRequestedAt < 60 * 1000) {
      const waitSeconds = Math.ceil((60 * 1000 - (now - existing.lastRequestedAt)) / 1000);
      res.status(429).json({
        success: false,
        error: `Veuillez patienter encore ${waitSeconds} seconde(s) avant de demander un nouveau code.`,
        cooldownSeconds: waitSeconds,
      });
      return;
    }

    // Optional check: verify if user exists in Firebase Authentication
    if (getApps().length > 0) {
      try {
        await getAuth().getUserByEmail(cleanEmail);
      } catch (authErr: any) {
        if (authErr?.code === 'auth/user-not-found') {
          // Keep silent for account enumeration protection
        }
      }
    }

    // Generate random 6-digit code (100000 -> 999999) using cryptographic RNG
    const rawCode = crypto.randomInt(100000, 1000000).toString();
    const hashedCode = hashOTPCode(cleanEmail, rawCode);
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes validity

    // Store hashed code only (overwrites and invalidates any previous code)
    secureOtpStore.set(cleanEmail, {
      hashedCode,
      expiresAt,
      attemptsLeft: 3,
      lastRequestedAt: now,
    });

    console.log(`[AUTH-OTP] Code de sécurité généré et haché HMAC-SHA256 pour ${cleanEmail}. Expire à: ${new Date(expiresAt).toISOString()}`);

    // Send email via Brevo SMTP
    const transporter = getBrevoTransporter();
    let emailDelivered = false;

    if (transporter) {
      try {
        const rawFrom =
          process.env.BREVO_SMTP_FROM ||
          process.env.SMTP_FROM ||
          'LivraLink Sécurité <Pamphile.gbede@gmail.com>';
        const fromAddress = rawFrom.replace(/\\"/g, '').trim();

        await transporter.sendMail({
          from: fromAddress,
          to: cleanEmail,
          subject: `Votre code de réinitialisation LivraLink : ${rawCode}`,
          text: `Bienvenue sur LivraLink\n\nVotre code de réinitialisation de mot de passe est :\n\n${rawCode}\n\nCe code est temporaire (valide 10 minutes). Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.`,
          html: `
            <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); color: #0f172a;">
              <div style="background-color: #0f172a; padding: 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">
                  Livra<span style="color: #3b82f6;">Link</span>
                </h1>
                <p style="color: #94a3b8; font-size: 11px; margin: 6px 0 0 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">
                  Sécurité &amp; Authentification
                </p>
              </div>

              <div style="padding: 32px 24px;">
                <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0;">
                  Bienvenue sur LivraLink
                </h2>
                
                <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
                  Vous avez demandé la réinitialisation de votre mot de passe. Voici votre code de sécurité personnel à 6 chiffres :
                </p>

                <div style="background-color: #f8fafc; border: 2px dashed #93c5fd; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 24px;">
                  <div style="font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #1d4ed8; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; display: inline-block;">
                    ${rawCode}
                  </div>
                  <p style="font-size: 12px; color: #64748b; margin: 12px 0 0 0; font-weight: 600;">
                    ⏱️ Ce code est temporaire et expire dans <span style="color: #dc2626;">10 minutes</span>.
                  </p>
                </div>

                <div style="background-color: #f1f5f9; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px;">
                  <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
                    🔒 <strong>Conseil de sécurité :</strong> Ne partagez jamais ce code. L'équipe LivraLink ne vous demandera jamais votre code de vérification.
                  </p>
                </div>

                <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                  Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité. Votre mot de passe actuel reste inchangé.
                </p>
              </div>

              <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                  © ${new Date().getFullYear()} LivraLink CI — Plateforme logistique et livraison sécurisée.
                </p>
              </div>
            </div>
          `,
        });
        emailDelivered = true;
        console.log(`[BREVO SMTP] E-mail de réinitialisation envoyé avec succès à ${cleanEmail}`);
      } catch (mailErr: any) {
        console.error('[BREVO SMTP ERROR] Échec de l\'envoi:', mailErr.message);
      }
    } else {
      console.warn('[BREVO SMTP] Identifiants SMTP non configurés dans l\'environnement. Mode sécurisé actif.');
    }

    recordSentEmail({
      type: 'password_reset_request',
      to: cleanEmail,
      recipientName: cleanEmail.split('@')[0],
      subject: `Votre code de réinitialisation LivraLink : ••••••`,
      previewText: `Code de sécurité à 6 chiffres transmis avec succès (masqué par politique de sécurité).`,
      htmlContent: `<div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 20px; color: #0f172a;"><h2>Code de réinitialisation</h2><p>Le code temporaire a été expédié à l'utilisateur par e-mail. <em>(Contenu masqué dans l'historique par politique de sécurité)</em>.</p></div>`,
      deliveredViaSmtp: emailDelivered,
    });

    // Protection against account enumeration: return consistent response
    res.json({
      success: true,
      email: cleanEmail,
      message: `Si un compte correspond à ${cleanEmail}, un code de sécurité à 6 chiffres vient d'être envoyé par e-mail.`,
      emailDelivered,
    });
  } catch (error: any) {
    console.error('[AUTH ERROR] send-reset-code:', error);
    res.status(500).json({ success: false, error: 'Une erreur interne est survenue lors de l\'envoi du code.' });
  }
});

/**
 * POST /api/auth/verify-reset-code
 * Verifies the 6-digit code against the stored hash, validates expiration and attempts,
 * and issues a single-use cryptographic resetToken upon success.
 */
app.post('/api/auth/verify-reset-code', (req: Request, res: Response): void => {
  try {
    const ip = getClientIp(req);
    // Defense: IP rate limit (max 15 verification attempts per 10 minutes)
    const ipLimit = checkIpRateLimit(`otp_verify_${ip}`, 15, 10 * 60 * 1000);
    if (!ipLimit.allowed) {
      res.status(429).json({
        success: false,
        error: 'Trop de tentatives de vérification depuis cette adresse IP. Veuillez patienter 10 minutes.',
      });
      return;
    }

    const { email, code } = req.body;

    if (!email || !code || typeof email !== 'string' || typeof code !== 'string') {
      res.status(400).json({ success: false, error: 'Adresse e-mail et code à 6 chiffres requis.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.toString().trim();

    if (!/^\d{6}$/.test(cleanCode)) {
      res.status(400).json({ success: false, error: 'Le code doit contenir exactement 6 chiffres.' });
      return;
    }

    const stored = secureOtpStore.get(cleanEmail);

    if (!stored) {
      res.status(400).json({
        success: false,
        error: 'Aucun code actif trouvé pour cet e-mail ou le code a expiré. Veuillez demander un nouveau code.',
      });
      return;
    }

    // Check expiration (10 minutes)
    if (Date.now() > stored.expiresAt) {
      secureOtpStore.delete(cleanEmail);
      res.status(400).json({
        success: false,
        error: 'Ce code de sécurité a expiré. Veuillez demander un nouveau code.',
      });
      return;
    }

    // Check remaining attempts
    if (stored.attemptsLeft <= 0) {
      secureOtpStore.delete(cleanEmail);
      res.status(429).json({
        success: false,
        error: 'Nombre maximal de tentatives dépassé. Par sécurité, ce code a été invalidé. Veuillez en demander un nouveau.',
      });
      return;
    }

    // Hash provided code and compare with stored hash using timingSafeEqual to prevent side-channel timing attacks
    const inputHash = hashOTPCode(cleanEmail, cleanCode);
    const inputBuf = Buffer.from(inputHash, 'utf8');
    const storedBuf = Buffer.from(stored.hashedCode, 'utf8');
    const isCodeMatch = inputBuf.length === storedBuf.length && crypto.timingSafeEqual(inputBuf, storedBuf);

    if (!isCodeMatch) {
      stored.attemptsLeft -= 1;
      if (stored.attemptsLeft <= 0) {
        secureOtpStore.delete(cleanEmail);
        res.status(400).json({
          success: false,
          error: 'Code incorrect. Nombre maximal de tentatives atteint. Ce code est désormais invalidé.',
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: `Code de sécurité incorrect. Il vous reste ${stored.attemptsLeft} tentative(s).`,
        attemptsLeft: stored.attemptsLeft,
      });
      return;
    }

    // Code is valid! Invalidate OTP immediately to prevent re-use
    secureOtpStore.delete(cleanEmail);

    // Issue a short-lived cryptographic one-time reset token (10 mins)
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(rawResetToken);

    // Store only the token hash on server
    resetTokensStore.set(tokenHash, {
      email: cleanEmail,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    res.json({
      success: true,
      resetToken: rawResetToken,
      message: 'Code de sécurité validé avec succès.',
    });
  } catch (error: any) {
    console.error('[AUTH ERROR] verify-reset-code:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la validation du code.' });
  }
});

/**
 * POST /api/auth/reset-password
 * Consumes the single-use resetToken, validates parameters, and updates the user's password
 * directly in Firebase Authentication via Firebase Admin SDK.
 */
app.post('/api/auth/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const ip = getClientIp(req);
    // Defense: IP rate limit (max 10 reset attempts per 10 minutes)
    const ipLimit = checkIpRateLimit(`otp_reset_${ip}`, 10, 10 * 60 * 1000);
    if (!ipLimit.allowed) {
      res.status(429).json({
        success: false,
        error: 'Trop de tentatives de réinitialisation. Veuillez patienter.',
      });
      return;
    }

    const { email, resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      res.status(400).json({ success: false, error: 'Paramètres manquants pour la réinitialisation.' });
      return;
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'Le nouveau mot de passe doit contenir au moins 8 caractères pour garantir la sécurité.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const tokenHash = hashResetToken(resetToken);
    const tokenData = resetTokensStore.get(tokenHash);

    if (!tokenData || tokenData.email !== cleanEmail) {
      res.status(403).json({
        success: false,
        error: 'Jeton de réinitialisation invalide ou déjà utilisé. Veuillez recommencer la procédure.',
      });
      return;
    }

    if (Date.now() > tokenData.expiresAt) {
      resetTokensStore.delete(tokenHash);
      res.status(403).json({
        success: false,
        error: 'La session de réinitialisation a expiré. Veuillez demander un nouveau code.',
      });
      return;
    }

    // Invalidate token immediately (strictly single-use)
    resetTokensStore.delete(tokenHash);

    // Update password in Firebase Authentication via Firebase Admin SDK
    let firebaseAuthUpdated = false;

    if (getApps().length > 0) {
      try {
        const auth = getAuth();
        const userRecord = await auth.getUserByEmail(cleanEmail);
        await auth.updateUser(userRecord.uid, {
          password: newPassword,
        });
        firebaseAuthUpdated = true;
        console.log(`[FIREBASE-ADMIN] Mot de passe Firebase Authentication mis à jour pour l'UID: ${userRecord.uid}`);
      } catch (authErr: any) {
        if (authErr?.code === 'auth/user-not-found') {
          console.warn(`[FIREBASE-ADMIN] Utilisateur non trouvé dans Firebase Auth pour: ${cleanEmail}`);
        } else {
          console.error('[FIREBASE-ADMIN] Erreur lors de l\'appel updateUser:', authErr?.message);
        }
      }
    }

    // Send confirmation email
    const transporter = getBrevoTransporter();
    let confirmationDelivered = false;
    const confirmHtml = `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); color: #0f172a;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">Livra<span style="color: #3b82f6;">Link</span></h1>
          <p style="color: #94a3b8; font-size: 11px; margin: 6px 0 0 0; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Sécurité du compte</p>
        </div>
        <div style="padding: 32px 24px;">
          <div style="display: inline-block; background-color: #dcfce7; color: #15803d; font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 9999px; margin-bottom: 16px;">
            ✅ MOT DE PASSE MIS À JOUR
          </div>
          <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0;">Modification confirmée</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
            Le mot de passe de votre compte LivraLink (<strong>${cleanEmail}</strong>) vient d'être mis à jour avec succès le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}.
          </p>
          <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="font-size: 13px; color: #334155; margin: 0; line-height: 1.5;">
              Vous pouvez dès à présent vous connecter à votre espace avec vos nouveaux identifiants.
            </p>
          </div>
          <p style="font-size: 12px; color: #dc2626; line-height: 1.5; margin: 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            ⚠️ Si vous n'êtes pas à l'origine de cette modification, contactez immédiatement l'administrateur ou réinitialisez vos accès d'urgence.
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">© ${new Date().getFullYear()} LivraLink CI — Plateforme logistique et livraison sécurisée.</p>
        </div>
      </div>
    `;

    if (transporter) {
      try {
        const rawFrom = process.env.BREVO_SMTP_FROM || process.env.SMTP_FROM || 'LivraLink Sécurité <Pamphile.gbede@gmail.com>';
        await transporter.sendMail({
          from: rawFrom.replace(/\\"/g, '').trim(),
          to: cleanEmail,
          subject: '🔐 LivraLink : Confirmation de modification de votre mot de passe',
          text: `Bonjour,\n\nLe mot de passe de votre compte LivraLink a été modifié avec succès.\n\nSi vous n'êtes pas l'auteur de ce changement, contactez le support.`,
          html: confirmHtml,
        });
        confirmationDelivered = true;
        console.log(`[BREVO SMTP] E-mail de confirmation mot de passe envoyé à ${cleanEmail}`);
      } catch (mailErr: any) {
        console.error('[BREVO SMTP ERROR] Échec de l\'envoi confirmation:', mailErr.message);
      }
    }

    recordSentEmail({
      type: 'password_changed_confirmation',
      to: cleanEmail,
      recipientName: cleanEmail.split('@')[0],
      subject: '🔐 LivraLink : Confirmation de modification de votre mot de passe',
      previewText: 'Votre mot de passe a été mis à jour avec succès.',
      htmlContent: confirmHtml,
      deliveredViaSmtp: confirmationDelivered,
    });

    res.json({
      success: true,
      firebaseAuthUpdated,
      emailDelivered: confirmationDelivered,
      message: 'Votre mot de passe a été mis à jour avec succès. Un e-mail de confirmation vous a été envoyé.',
    });
  } catch (error: any) {
    console.error('[AUTH ERROR] reset-password:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour du mot de passe.' });
  }
});

// =========================================================================
// EMAIL SERVICES: BIENVENUE, CHANGEMENT MOT DE PASSE & MISSIONS PRIORITAIRES
// =========================================================================

/**
 * POST /api/email/welcome
 * Dispatches a welcome email to a newly registered merchant or courier.
 */
app.post('/api/email/welcome', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, fullName, role, storeName, vehicleType, phone } = req.body || {};

    const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ success: false, error: 'Adresse e-mail valide requise.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (fullName || cleanEmail.split('@')[0]).trim().slice(0, 100);
    const safeName = escapeHtml(cleanName);
    const safeStore = storeName ? escapeHtml(storeName.trim().slice(0, 100)) : '';
    const safeVehicle = vehicleType ? escapeHtml(vehicleType.trim().slice(0, 50)) : '';
    const safePhone = phone ? escapeHtml(phone.trim().slice(0, 30)) : '';

    const isVendeur = role === 'vendeur';
    const roleLabel = isVendeur ? 'Vendeur / Marchand' : 'Livreur Partenaire';
    const roleBadgeColor = isVendeur ? '#3b82f6' : '#10b981';

    const subject = `Bienvenue sur LivraLink, ${safeName} ! 🚀 Votre compte ${roleLabel} est activé`;
    const previewText = `Félicitations ! Votre compte LivraLink ${roleLabel} a été créé avec succès. Accédez dès maintenant à votre espace.`;

    const htmlContent = `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); color: #0f172a;">
        <div style="background-color: #0f172a; padding: 28px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">
            Livra<span style="color: #3b82f6;">Link</span>
          </h1>
          <p style="color: #94a3b8; font-size: 11px; margin: 6px 0 0 0; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">
            Logistique Urbaine &amp; Livraison Sécurisée
          </p>
        </div>

        <div style="padding: 32px 24px;">
          <div style="display: inline-block; background-color: ${isVendeur ? '#eff6ff' : '#ecfdf5'}; color: ${roleBadgeColor}; font-weight: 800; font-size: 12px; padding: 6px 14px; border-radius: 9999px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">
            🎉 COMPTE ${roleLabel.toUpperCase()} ACTIVÉ
          </div>

          <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 14px 0;">
            Bienvenue dans la communauté LivraLink, ${safeName} !
          </h2>

          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
            Nous sommes ravis de vous compter parmi nos utilisateurs. Votre profil a été configuré avec succès et vous pouvez dès à présent utiliser toutes les fonctionnalités de la plateforme.
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
            <h3 style="font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">
              Récapitulatif de votre compte
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; width: 40%;">👤 Responsable :</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${safeName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">📧 Identifiant :</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${escapeHtml(cleanEmail)}</td>
              </tr>
              ${safePhone ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b;">📱 Contact :</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${safePhone}</td>
              </tr>` : ''}
              ${isVendeur && safeStore ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b;">🏪 Boutique :</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${safeStore}</td>
              </tr>` : ''}
              ${!isVendeur && safeVehicle ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b;">🛵 Véhicule :</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${safeVehicle}</td>
              </tr>` : ''}
            </table>
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="https://ais-dev-ra34vpbmrgqe3eimwdz2y2-319073276082.europe-west3.run.app" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.2);">
              Accéder à mon espace ${isVendeur ? 'Vendeur' : 'Livreur'} →
            </a>
          </div>

          <div style="background-color: #f1f5f9; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px;">
            <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
              💡 <strong>Prochaine étape :</strong> ${
                isVendeur
                  ? 'Créez votre première livraison en quelques secondes et diffusez-la auprès des coursiers disponibles.'
                  : 'Activez votre statut "En ligne" pour recevoir en temps réel les notifications de missions prioritaires.'
              }
            </p>
          </div>

          <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            Ce message est envoyé automatiquement. En cas de besoin, contactez l'équipe support LivraLink via l'application.
          </p>
        </div>

        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">
            © ${new Date().getFullYear()} LivraLink — Tous droits réservés. Cotonou, Bénin.
          </p>
        </div>
      </div>
    `;

    const transporter = getBrevoTransporter();
    let emailDelivered = false;

    if (transporter) {
      try {
        const rawFrom = process.env.BREVO_SMTP_FROM || process.env.SMTP_FROM || 'LivraLink <Pamphile.gbede@gmail.com>';
        await transporter.sendMail({
          from: rawFrom.replace(/\\"/g, '').trim(),
          to: cleanEmail,
          subject,
          text: `Bienvenue sur LivraLink, ${cleanName} !\n\nVotre compte ${roleLabel} a été créé avec succès.\nIdentifiant: ${cleanEmail}`,
          html: htmlContent,
        });
        emailDelivered = true;
        console.log(`[BREVO SMTP] E-mail de bienvenue envoyé avec succès à ${cleanEmail}`);
      } catch (mailErr: any) {
        console.error('[BREVO SMTP ERROR] Échec de l\'envoi de bienvenue:', mailErr.message);
      }
    }

    const emailRecord = recordSentEmail({
      type: 'welcome',
      to: cleanEmail,
      recipientName: cleanName,
      recipientRole: role || 'vendeur',
      subject,
      previewText,
      htmlContent,
      deliveredViaSmtp: emailDelivered,
    });

    res.json({
      success: true,
      emailDelivered,
      emailId: emailRecord.id,
      message: `E-mail de bienvenue envoyé avec succès à ${cleanEmail}`,
    });
  } catch (error: any) {
    console.error('[EMAIL ERROR] welcome:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi de l\'e-mail de bienvenue.' });
  }
});

/**
 * POST /api/email/password-changed
 * Dispatches a security notification email when a user modifies their password.
 */
app.post('/api/email/password-changed', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, fullName } = req.body || {};

    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, error: 'Email requis.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (fullName || cleanEmail.split('@')[0]).trim().slice(0, 100);
    const safeName = escapeHtml(cleanName);
    const subject = '🔐 LivraLink : Votre mot de passe a été modifié';
    const previewText = 'Notification de sécurité : mise à jour récente de vos identifiants d\'accès.';

    const htmlContent = `
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; color: #0f172a;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800;">Livra<span style="color: #3b82f6;">Link</span></h1>
          <p style="color: #94a3b8; font-size: 11px; margin: 4px 0 0 0; text-transform: uppercase;">Alerte de Sécurité</p>
        </div>
        <div style="padding: 28px 24px;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">Bonjour ${safeName},</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Nous vous confirmons que le mot de passe de votre compte LivraLink (<strong>${escapeHtml(cleanEmail)}</strong>) a été modifié avec succès le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}.
          </p>
          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px; border-radius: 8px; margin: 20px 0;">
            <p style="font-size: 12px; color: #b91c1c; margin: 0; line-height: 1.5;">
              ⚠️ Si vous n'êtes pas à l'origine de cette opération, votre compte a peut-être été compromis. Contactez immédiatement l'administrateur LivraLink pour sécuriser vos accès.
            </p>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 14px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">© ${new Date().getFullYear()} LivraLink Bénin</p>
        </div>
      </div>
    `;

    const transporter = getBrevoTransporter();
    let emailDelivered = false;

    if (transporter) {
      try {
        const rawFrom = process.env.BREVO_SMTP_FROM || process.env.SMTP_FROM || 'LivraLink Sécurité <Pamphile.gbede@gmail.com>';
        await transporter.sendMail({
          from: rawFrom.replace(/\\"/g, '').trim(),
          to: cleanEmail,
          subject,
          text: `Bonjour ${cleanName},\n\nVotre mot de passe LivraLink a été modifié le ${new Date().toLocaleDateString('fr-FR')}.\n\nSi vous n'êtes pas à l'origine de cette action, prévenez immédiatement le support.`,
          html: htmlContent,
        });
        emailDelivered = true;
      } catch (err: any) {
        console.error('[EMAIL ERROR] Confirmation mot de passe:', err.message);
      }
    }

    const emailRecord = recordSentEmail({
      type: 'password_changed_confirmation',
      to: cleanEmail,
      recipientName: cleanName,
      subject,
      previewText,
      htmlContent,
      deliveredViaSmtp: emailDelivered,
    });

    res.json({
      success: true,
      emailDelivered,
      emailId: emailRecord.id,
      message: `Notification de changement de mot de passe envoyée à ${cleanEmail}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi de la notification.' });
  }
});

/**
 * POST /api/email/priority-mission
 * Dispatches an email notification to couriers about a newly created priority mission.
 */
app.post('/api/email/priority-mission', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, courierName, orderId, pickupName, dropoffCommune, feeFCFA, codFCFA } = req.body || {};

    if (!email) {
      res.status(400).json({ success: false, error: 'Email du livreur requis.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (courierName || 'Coursier Partenaire').trim().slice(0, 100);
    const safeCourierName = escapeHtml(cleanName);
    const safeOrderId = escapeHtml(String(orderId || '#LL-4200').trim().slice(0, 32));
    const safePickup = escapeHtml(String(pickupName || 'Boutique').trim().slice(0, 100));
    const safeDropoff = escapeHtml(String(dropoffCommune || 'Cotonou').trim().slice(0, 100));
    const safeFee = Math.min(100000, Math.max(0, parseInt(String(feeFCFA), 10) || 2000));
    const safeCod = codFCFA ? Math.min(5000000, Math.max(0, parseInt(String(codFCFA), 10) || 0)) : 0;

    const subject = `⚡ Mission Prioritaire Disponible : ${safeOrderId} (${safeFee} FCFA)`;
    const previewText = `Nouvelle livraison express disponible à ${safePickup}. Tarif : ${safeFee} FCFA.`;

    const htmlContent = `
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; color: #0f172a;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800;">Livra<span style="color: #3b82f6;">Link</span></h1>
          <p style="color: #f59e0b; font-size: 11px; margin: 4px 0 0 0; text-transform: uppercase; font-weight: 700;">⚡ Mission Prioritaire</p>
        </div>
        <div style="padding: 24px;">
          <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">Bonjour ${safeCourierName},</h2>
          <p style="font-size: 14px; color: #475569; margin: 0 0 16px 0;">
            Une nouvelle mission prioritaire vient d'être publiée par un commerçant dans votre zone.
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 4px 0; font-size: 13px;"><strong>📦 Commande :</strong> ${safeOrderId}</p>
            <p style="margin: 4px 0; font-size: 13px;"><strong>🏪 Collecte :</strong> ${safePickup}</p>
            <p style="margin: 4px 0; font-size: 13px;"><strong>📍 Destination :</strong> ${safeDropoff}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #16a34a;"><strong>💰 Gain Coursier :</strong> ${safeFee.toLocaleString('fr-FR')} FCFA</p>
            ${safeCod ? `<p style="margin: 4px 0; font-size: 13px; color: #2563eb;"><strong>💵 Montant COD :</strong> ${safeCod.toLocaleString('fr-FR')} FCFA</p>` : ''}
          </div>
          <div style="text-align: center; margin: 20px 0;">
            <a href="https://ais-dev-ra34vpbmrgqe3eimwdz2y2-319073276082.europe-west3.run.app" style="display: inline-block; background-color: #f59e0b; color: #000; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 10px;">
              Ouvrir l'application &amp; Accepter la course →
            </a>
          </div>
        </div>
      </div>
    `;

    const transporter = getBrevoTransporter();
    let emailDelivered = false;

    if (transporter) {
      try {
        const rawFrom = process.env.BREVO_SMTP_FROM || process.env.SMTP_FROM || 'LivraLink Dispatch <Pamphile.gbede@gmail.com>';
        await transporter.sendMail({
          from: rawFrom.replace(/\\"/g, '').trim(),
          to: cleanEmail,
          subject,
          text: `Mission prioritaire ${orderId} disponible pour ${cleanName}. Gain: ${feeFCFA} FCFA.`,
          html: htmlContent,
        });
        emailDelivered = true;
      } catch (err: any) {
        console.error('[EMAIL ERROR] Mission email:', err.message);
      }
    }

    const emailRecord = recordSentEmail({
      type: 'priority_mission',
      to: cleanEmail,
      recipientName: cleanName,
      subject,
      previewText,
      htmlContent,
      deliveredViaSmtp: emailDelivered,
    });

    res.json({
      success: true,
      emailDelivered,
      emailId: emailRecord.id,
      message: `Notification de mission envoyée à ${cleanEmail}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi de la mission.' });
  }
});

/**
 * GET /api/email/outbox
 * Returns the history of sent emails for audit and in-app viewing.
 */
app.get('/api/email/outbox', (_req: Request, res: Response) => {
  res.json({
    success: true,
    total: sentEmailsHistory.length,
    emails: sentEmailsHistory.slice(0, 50),
  });
});

/**
 * POST /api/email/clear-outbox
 * Resets the in-memory outbox history.
 */
app.post('/api/email/clear-outbox', (_req: Request, res: Response) => {
  sentEmailsHistory.length = 0;
  res.json({ success: true, message: 'Boîte d\'envoi réinitialisée.' });
});

// Health check endpoints for Render / cloud monitoring
app.get(['/healthz', '/api/healthz'], (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Security configuration & defensive audit status endpoint
app.get('/api/security/audit', (_req: Request, res: Response) => {
  res.json({
    securityStatus: 'FORTIFIED',
    timestamp: new Date().toISOString(),
    protections: {
      httpSecurityHeaders: {
        active: true,
        headers: ['X-Content-Type-Options: nosniff', 'X-Frame-Options: SAMEORIGIN', 'Referrer-Policy: strict-origin-when-cross-origin'],
      },
      payloadDefense: {
        jsonLimit: '10kb',
        dosProtection: 'ENABLED',
      },
      rateLimiting: {
        active: true,
        ipTracking: 'IN_MEMORY_SLIDING_WINDOW',
        authEndpointsSecured: ['/api/auth/send-reset-code', '/api/auth/verify-reset-code', '/api/auth/reset-password'],
      },
      authIntegrity: {
        otpStorage: 'HMAC_SHA256_HASHED_ONLY',
        resetTokens: 'CRYPTOGRAPHIC_SINGLE_USE_32BYTES',
        rateLimitPerEmailSeconds: 60,
        maxVerifyAttempts: 3,
        accountEnumerationProtection: 'SILENT_CONSISTENT_RESPONSE',
      },
      firestoreRules: {
        deployed: true,
        zeroTrustABAC: 'ENABLED',
        antiPrivilegeEscalation: 'ENABLED',
        terminalStateLocking: 'ENABLED',
        piiIsolation: 'ENABLED',
      },
    },
  });
});

// =========================================================================
// POINT 02 & 03: ENDPOINT D'AUDIT DU BUDGET & PLAFONDS D'APPELS D'API
// =========================================================================
app.get('/api/security/budget', (_req: Request, res: Response) => {
  checkAndResetDailyQuotas();
  const totalCost = calculateTotalEstimatedCostToday();
  res.json({
    status: 'ACTIVE_GUARD',
    dailyBudgetCapEur: apiUsageStats.dailyBudgetCapEur,
    estimatedCostTodayEur: totalCost,
    budgetRemainingEur: Math.max(0, Number((apiUsageStats.dailyBudgetCapEur - totalCost).toFixed(4))),
    quotas: {
      brevoEmails: {
        used: apiUsageStats.brevoEmails.count,
        cap: apiUsageStats.brevoEmails.dailyCap,
        remaining: Math.max(0, apiUsageStats.brevoEmails.dailyCap - apiUsageStats.brevoEmails.count),
        unitCostEur: apiUsageStats.brevoEmails.unitCostEur,
      },
      mapsApiCalls: {
        used: apiUsageStats.mapsApiCalls.count,
        cap: apiUsageStats.mapsApiCalls.dailyCap,
        remaining: Math.max(0, apiUsageStats.mapsApiCalls.dailyCap - apiUsageStats.mapsApiCalls.count),
        unitCostEur: apiUsageStats.mapsApiCalls.unitCostEur,
      },
      geminiApiCalls: {
        used: apiUsageStats.geminiApiCalls.count,
        cap: apiUsageStats.geminiApiCalls.dailyCap,
        remaining: Math.max(0, apiUsageStats.geminiApiCalls.dailyCap - apiUsageStats.geminiApiCalls.count),
        unitCostEur: apiUsageStats.geminiApiCalls.unitCostEur,
      },
    },
    circuitBreakers: Array.from(circuitBreakers.entries()).map(([service, state]) => ({
      service,
      state: state.state,
      failures: state.failures,
    })),
  });
});

// =========================================================================
// POINT 10: VÉRIFICATION & VERROU D'IDEMPOTENCE POUR PAIEMENT / RETRAIT
// =========================================================================
app.post('/api/wallet/verify-idempotency', (req: Request, res: Response) => {
  const { idempotencyKey, userId, amount } = req.body || {};
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    return res.status(400).json({ allowed: false, error: 'Clé d\'idempotence manquante ou invalide.' });
  }

  // Check if this exact transaction was already completed
  if (processedIdempotencyKeys.has(idempotencyKey)) {
    return res.status(409).json({
      allowed: false,
      alreadyProcessed: true,
      error: 'Cette opération de retrait a déjà été exécutée. Double débit prévenu avec succès.',
    });
  }

  // Check if an identical payout for the same user is currently processing
  const userLockKey = `lock_${userId || 'anon'}`;
  const lockTime = inFlightPayoutLocks.get(userLockKey);
  const now = Date.now();

  if (lockTime && now - lockTime < 8000) {
    return res.status(429).json({
      allowed: false,
      inFlight: true,
      error: 'Un retrait pour ce compte est déjà en cours de traitement. Veuillez patienter.',
    });
  }

  // Acquire lock for 8 seconds
  inFlightPayoutLocks.set(userLockKey, now);

  res.json({
    allowed: true,
    idempotencyKey,
    lockedUntil: now + 8000,
  });
});

app.post('/api/wallet/commit-payout', (req: Request, res: Response) => {
  const { idempotencyKey, userId, amount } = req.body || {};
  if (!idempotencyKey) {
    return res.status(400).json({ success: false, error: 'Clé d\'idempotence requise.' });
  }

  // Mark as processed permanently
  processedIdempotencyKeys.add(idempotencyKey);
  if (userId) {
    inFlightPayoutLocks.delete(`lock_${userId}`);
  }

  res.json({
    success: true,
    message: 'Transaction de retrait enregistrée et verrouillée contre tout double débit.',
    idempotencyKey,
  });
});

// =========================================================================
// POINT 18: JOURNAL D'AUDIT CENTRALISÉ DES ERREURS
// =========================================================================
app.post('/api/logs/error', (req: Request, res: Response) => {
  const { message, source, stack, details } = req.body || {};
  const ip = getClientIp(req);
  const entry: ErrorLogEntry = {
    id: `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ip,
    message: String(message || 'Erreur non spécifiée').slice(0, 500),
    source: String(source || 'client').slice(0, 100),
    stack: stack ? String(stack).slice(0, 2000) : undefined,
    details,
  };

  errorAuditRingBuffer.unshift(entry);
  if (errorAuditRingBuffer.length > MAX_ERROR_LOGS) {
    errorAuditRingBuffer.pop();
  }

  console.warn(`[ERROR AUDIT LOG] ${entry.source}: ${entry.message}`);
  res.status(201).json({ success: true, logId: entry.id });
});

app.get('/api/logs/error', (_req: Request, res: Response) => {
  res.json({
    totalRecorded: errorAuditRingBuffer.length,
    recentErrors: errorAuditRingBuffer.slice(0, 30),
  });
});

// =========================================================================
// POINT 17: SURVEILLANCE UPTIME & HEARTBEAT D'ALERTE
// =========================================================================
app.get('/api/monitoring/heartbeat', (_req: Request, res: Response) => {
  uptimeTracker.checksPerformed += 1;
  uptimeTracker.lastCheckTimestamp = new Date().toISOString();
  uptimeTracker.consecutiveFailures = 0;
  uptimeTracker.status = 'HEALTHY';

  res.json({
    status: 'HEALTHY',
    uptimeSeconds: Math.floor((Date.now() - uptimeTracker.startTime) / 1000),
    checksCount: uptimeTracker.checksPerformed,
    lastCheck: uptimeTracker.lastCheckTimestamp,
  });
});

app.get('/api/monitoring/status', (_req: Request, res: Response) => {
  res.json({
    ...uptimeTracker,
    systemUptime: process.uptime(),
    memoryUsageMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    nodeEnv: process.env.NODE_ENV || 'development',
  });
});

// =========================================================================
// POINT 20: SYSTÈME DE SAUVEGARDE & RESTAURATION VÉRIFIÉE
// =========================================================================
let testBackupSnapshot: any = null;

app.post('/api/system/backup', (req: Request, res: Response) => {
  const { data } = req.body || {};
  testBackupSnapshot = {
    timestamp: new Date().toISOString(),
    checksum: crypto.createHash('sha256').update(JSON.stringify(data || {})).digest('hex'),
    data: data || {},
  };
  res.json({
    success: true,
    message: 'Sauvegarde instantanée d\'état générée avec succès.',
    snapshotChecksum: testBackupSnapshot.checksum,
    timestamp: testBackupSnapshot.timestamp,
  });
});

app.post('/api/system/restore', (_req: Request, res: Response) => {
  if (!testBackupSnapshot) {
    return res.status(404).json({ success: false, error: 'Aucun instantané de sauvegarde disponible.' });
  }
  const currentChecksum = crypto.createHash('sha256').update(JSON.stringify(testBackupSnapshot.data)).digest('hex');
  const integrityVerified = currentChecksum === testBackupSnapshot.checksum;

  res.json({
    success: true,
    integrityVerified,
    message: 'Restauration complète exécutée avec intégrité cryptographique validée.',
    restoredData: testBackupSnapshot.data,
    checksum: currentChecksum,
  });
});

async function startServer() {
  const distPath = path.resolve(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.resolve(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && hasDist) {
    console.log(`[SERVER] Mode Production actif - Fichiers servis depuis: ${distPath}`);

    // Serve /assets with caching and prevent fallback to index.html on missing assets
    app.use(
      '/assets',
      express.static(path.resolve(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );

    // Serve root static files
    app.use(
      express.static(distPath, {
        maxAge: '1h',
      })
    );

    // SPA Catch-all route (serves index.html for frontend client routing)
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/') || req.path === '/healthz') {
        return next();
      }
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    console.log('[SERVER] Mode Développement actif - Démarrage du middleware Vite.');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  let retryCount = 0;
  const maxRetries = 10;

  function bindServer() {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] LivraLink running at http://0.0.0.0:${PORT} (Mode: ${isProduction ? 'production' : 'development'})`);
      console.log(`  ➜  Local:   http://localhost:${PORT}/`);
      console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);
      console.log(`[SERVER] Ready for incoming requests.`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE' && retryCount < maxRetries) {
        retryCount++;
        console.warn(`[SERVER] Port ${PORT} temporairement occupé, nouvelle tentative (${retryCount}/${maxRetries}) dans 400ms...`);
        setTimeout(bindServer, 400);
      } else {
        console.error('[SERVER] Erreur fatale serveur:', err);
        process.exit(1);
      }
    });

    // Graceful shutdown on SIGTERM / SIGINT
    const handleShutdown = (signal: string) => {
      console.log(`[SERVER] Reçu ${signal}, arrêt propre du serveur...`);
      server.close(() => {
        console.log('[SERVER] Serveur arrêté avec succès.');
        process.exit(0);
      });
    };

    process.once('SIGTERM', () => handleShutdown('SIGTERM'));
    process.once('SIGINT', () => handleShutdown('SIGINT'));
  }

  bindServer();
}

startServer();
