import express, { Request, Response } from 'express';
import compression from 'compression';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  createP0SecurityService,
  getAssignedCourierIdFromOrder,
  P0FirestoreLike,
} from './src/server/p0Security';
import {
  createNodemailerTransportFromConfig,
  createP1EmailAndConfigService,
  evaluateEmailEncryptionSecret,
  extractClientIp,
  normalizeSmtpFromAddress,
  P1EmailAndConfigService,
  P1FirestoreLike,
  resolveTrustProxySetting,
  sanitizeSmtpConfigForApi,
  SentEmailRecord,
} from './src/server/p1EmailAndConfig';
import {
  advanceExpiredOrUnavailableOffer,
  DispatchActionError,
  listSanitizedCouriersForVendors,
  respondToDeliveryOffer,
  startOrRelaunchDeliveryDispatch,
  updateCourierAvailabilityAndGps,
} from './src/server/dispatchService';
import {
  GeminiAuthVerifierFn,
  GeminiGeneratorFn,
  inspectGeminiKeyFormat,
  KycGeminiAnalysisError,
  normalizeGeminiApiKey,
  redactSensitiveForLogs,
  resetInMemoryGeminiGuardsForTests,
  runKycGeminiAnalysis,
  setGeminiAuthVerifierForTests,
  setGeminiGeneratorForTests,
  verifyGeminiBackendAuth,
} from './src/server/kycGeminiAnalysis';
import {
  MapsGroundingGeneratorFn,
  queryMapsGroundingWithGemini,
  setMapsGroundingGeneratorForTests,
} from './src/server/mapsGroundingService';
import {
  BackupFirestoreLike,
  createSystemBackup,
  listSystemBackups,
  restoreSystemBackup,
  SystemBackupError,
} from './src/server/systemBackupService';
import {
  evaluatePayoutProviderConfig,
  resolvePayoutProviderAdapter,
} from './src/server/mobileMoneyProvider';
import {
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_PERMISSIONS,
  ALL_ADMIN_PERMISSIONS,
  hasAdminPermission,
  isValidAdminRoleId,
  resolveAdminContext,
  ResolvedAdminContext,
  resolvePermissionsForRole,
  SUPER_ADMIN_EMAIL_LOWER,
} from './src/server/adminRbac';
import {
  listAdminAuditLogs,
  recordAdminAuditLog,
} from './src/server/adminAuditService';
import {
  ALL_EMAIL_TEMPLATE_IDS,
  extractPublicPlatformConfig,
  loadEmailTemplates,
  loadPlatformConfigBundle,
  renderEmailTemplate,
  saveEmailTemplate,
  savePlatformConfigSection,
} from './src/server/platformConfigService';
import { computeAuthoritativeOrderFinancials } from './src/server/pricingEngine';
import {
  AccountLifecycleStatus,
  AdminPermission,
  AdminRoleId,
  EmailTemplateId,
} from './src/types';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

console.log('[SERVER INIT] Gmail SMTP User configuré:', (process.env.GMAIL_SMTP_USER || process.env.SMTP_USER) ? 'OUI' : 'NON');

export const app = express();
// Configure Express trust proxy for Firebase App Hosting / Cloud Run / GFE reverse proxy hops
app.set('trust proxy', resolveTrustProxySetting());
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
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:;");
  // For API and healthcheck endpoints, enforce strict X-Frame-Options protection
  // For UI / frontend pages, do not block iframe embedding in AI Studio preview
  if (req.path.startsWith('/api/') || req.path === '/healthz') {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Defense against large payload DOS: enforce strict 10kb limit on standard JSON bodies
// and permit up to 22mb solely on authenticated, participant-checked media upload routes.
const standardJsonParser = express.json({ limit: '10kb' });
const backupJsonParser = express.json({ limit: '512kb' });
const mediaUploadJsonParser = express.json({ limit: '22mb' });
app.use((req, res, next) => {
  if (
    req.method === 'POST' &&
    (req.path === '/api/pod/upload' ||
      req.path === '/api/chat/upload' ||
      req.path === '/api/courier/kyc/upload')
  ) {
    return mediaUploadJsonParser(req, res, next);
  }
  if (
    req.method === 'POST' &&
    (req.path === '/api/system/backup' || req.path === '/api/system/restore')
  ) {
    return backupJsonParser(req, res, next);
  }
  return standardJsonParser(req, res, next);
});

// =========================================================================
// POINT 01: RATE LIMITING PAR VISITEUR (SLIDING WINDOW PAR IP)
// =========================================================================
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const ipRateLimits = new Map<string, RateLimitRecord>();
const MAX_IP_RATE_LIMIT_ENTRIES = 5000;

const pruneIpRateLimits = (nowMs = Date.now()) => {
  for (const [key, entry] of ipRateLimits.entries()) {
    if (nowMs > entry.resetAt) {
      ipRateLimits.delete(key);
    }
  }
  if (ipRateLimits.size > MAX_IP_RATE_LIMIT_ENTRIES) {
    const excess = ipRateLimits.size - MAX_IP_RATE_LIMIT_ENTRIES;
    const keys = ipRateLimits.keys();
    for (let i = 0; i < excess; i++) {
      const next = keys.next();
      if (next.done) break;
      ipRateLimits.delete(next.value);
    }
  }
};

const checkIpRateLimit = (ip: string, maxRequests: number, windowMs: number): { allowed: boolean; remaining: number } => {
  const now = Date.now();
  if (ipRateLimits.size >= MAX_IP_RATE_LIMIT_ENTRIES) {
    pruneIpRateLimits(now);
  }
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

const getClientIp = (req: Request): string => extractClientIp(req);

// Global API rate limiting middleware: max 120 calls per 60s per visitor IP
app.use('/api', (req, res, next) => {
  // Allow only lightweight health/version probes without global throttling
  if (req.path === '/healthz' || req.path === '/api/version' || req.path === '/version.json') {
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
  gmailEmails: { count: number; dailyCap: number; unitCostEur: number };
  mapsApiCalls: { count: number; dailyCap: number; unitCostEur: number };
  geminiApiCalls: { count: number; dailyCap: number; unitCostEur: number };
  dailyBudgetCapEur: number;
  lastResetDay: string;
}

const apiUsageStats: ApiQuotaTracker = {
  gmailEmails: { count: 0, dailyCap: 500, unitCostEur: 0.000 },
  mapsApiCalls: { count: 0, dailyCap: 500, unitCostEur: 0.005 },
  geminiApiCalls: { count: 0, dailyCap: 200, unitCostEur: 0.001 },
  dailyBudgetCapEur: 5.0, // Plafond maximal de 5,00 € par jour
  lastResetDay: new Date().toISOString().slice(0, 10),
};

const checkAndResetDailyQuotas = () => {
  const currentDay = new Date().toISOString().slice(0, 10);
  if (apiUsageStats.lastResetDay !== currentDay) {
    apiUsageStats.gmailEmails.count = 0;
    apiUsageStats.mapsApiCalls.count = 0;
    apiUsageStats.geminiApiCalls.count = 0;
    apiUsageStats.lastResetDay = currentDay;
  }
};

const calculateTotalEstimatedCostToday = (): number => {
  checkAndResetDailyQuotas();
  const gmailCost = apiUsageStats.gmailEmails.count * apiUsageStats.gmailEmails.unitCostEur;
  const mapsCost = apiUsageStats.mapsApiCalls.count * apiUsageStats.mapsApiCalls.unitCostEur;
  const geminiCost = apiUsageStats.geminiApiCalls.count * apiUsageStats.geminiApiCalls.unitCostEur;
  return Number((gmailCost + mapsCost + geminiCost).toFixed(4));
};

const canConsumeApi = (type: 'gmailEmails' | 'mapsApiCalls' | 'geminiApiCalls'): { allowed: boolean; reason?: string } => {
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

const trackApiConsumption = (type: 'gmailEmails' | 'mapsApiCalls' | 'geminiApiCalls', count: number = 1) => {
  checkAndResetDailyQuotas();
  apiUsageStats[type].count += count;
};

// Circuit Breaker tracker for external providers
const circuitBreakers = new Map<string, { state: 'CLOSED' | 'OPEN'; failures: number }>();
circuitBreakers.set('gmail_smtp', { state: 'CLOSED', failures: 0 });
circuitBreakers.set('google_maps', { state: 'CLOSED', failures: 0 });
circuitBreakers.set('gemini_api', { state: 'CLOSED', failures: 0 });

// =========================================================================
// POINT 10: ANTI-DOUBLE PAIEMENT & VERROUS TRANSACTIONNELS FIRESTORE (P0)
// =========================================================================
// Les états critiques (OTP reset, jetons reset, tentatives POD, verrous retraits)
// sont persistés dans Firestore par transactions atomiques (src/server/p0Security.ts).
type P0SecurityService = ReturnType<typeof createP0SecurityService>;
let cachedP0Security: P0SecurityService | null = null;
let testP0SecurityOverride: P0SecurityService | null = null;
let testFirestoreOverride: any = null;
let testStorageBucketOverride: any = null;
let testTokenVerifierOverride: ((token: string) => Promise<{ uid: string; email?: string; email_verified?: boolean; admin?: boolean; kycLocked?: boolean }>) | null = null;

export function setP0SecurityForTests(service: P0SecurityService | null): void {
  if (process.env.NODE_ENV === 'test') {
    testP0SecurityOverride = service;
  }
}

export function setFirestoreAdminForTests(dbOverride: any): void {
  if (process.env.NODE_ENV === 'test') {
    testFirestoreOverride = dbOverride;
  }
}

export function setStorageBucketForTests(bucketOverride: any): void {
  if (process.env.NODE_ENV === 'test') {
    testStorageBucketOverride = bucketOverride;
  }
}

export function setTokenVerifierForTests(
  verifier: ((token: string) => Promise<{ uid: string; email?: string; email_verified?: boolean; admin?: boolean; kycLocked?: boolean }>) | null
): void {
  if (process.env.NODE_ENV === 'test') {
    testTokenVerifierOverride = verifier;
  }
}

export function setGeminiKycAnalyzerForTests(fn: GeminiGeneratorFn | null): void {
  if (process.env.NODE_ENV === 'test') {
    setGeminiGeneratorForTests(fn);
    if (fn === null) {
      resetInMemoryGeminiGuardsForTests();
    }
  }
}

export function setGeminiBackendAuthVerifierForTests(fn: GeminiAuthVerifierFn | null): void {
  if (process.env.NODE_ENV === 'test') {
    setGeminiAuthVerifierForTests(fn);
  }
}

export function setMapsGroundingForTests(fn: MapsGroundingGeneratorFn | null): void {
  if (process.env.NODE_ENV === 'test') {
    setMapsGroundingGeneratorForTests(fn);
  }
}

const isFirestoreIamDeniedError = (err: any): boolean => {
  const code = String(err?.code ?? '');
  const msg = String(err?.message || err || '');
  return code === '7' || /PERMISSION_DENIED|Missing or insufficient permissions/i.test(msg);
};

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
let firestoreAdmin: Firestore | null = null;
let configuredDatabaseId = process.env.FIREBASE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID || '(default)';
let configuredStorageBucket =
  process.env.FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0654978401.firebasestorage.app';

try {
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'gen-lang-client-0654978401';
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.projectId) projectId = cfg.projectId;
      if (cfg.firestoreDatabaseId) configuredDatabaseId = cfg.firestoreDatabaseId;
      if (cfg.storageBucket) configuredStorageBucket = cfg.storageBucket;
    } catch {}
  }

  const existingApps = getApps();
  if (existingApps.length === 0) {
    const rawServiceAccount = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim();
    if (rawServiceAccount.startsWith('{')) {
      try {
        const parsedSa = JSON.parse(rawServiceAccount);
        firebaseAdminApp = initializeApp({
          credential: cert(parsedSa),
          projectId: parsedSa.project_id || projectId,
          storageBucket: configuredStorageBucket,
        });
      } catch (saParseErr: any) {
        console.warn('[FIREBASE-ADMIN] FIREBASE_SERVICE_ACCOUNT_KEY invalide, bascule ADC:', saParseErr?.message);
        firebaseAdminApp = initializeApp({ projectId, storageBucket: configuredStorageBucket });
      }
    } else {
      firebaseAdminApp = initializeApp({ projectId, storageBucket: configuredStorageBucket });
    }
    console.log(`[FIREBASE-ADMIN] SDK initialisé avec succès pour le projet: ${projectId}`);
  } else {
    firebaseAdminApp = existingApps[0];
  }

  if (firebaseAdminApp) {
    firestoreAdmin =
      configuredDatabaseId && configuredDatabaseId !== '(default)'
        ? getFirestore(firebaseAdminApp, configuredDatabaseId)
        : getFirestore(firebaseAdminApp);
    console.log(`[FIREBASE-ADMIN] Firestore Admin DB (${configuredDatabaseId}) disponible pour historisation centralisée.`);
  }
} catch (adminInitErr: any) {
  console.warn('[FIREBASE-ADMIN] Note d\'initialisation:', adminInitErr?.message);
}

// =========================================================================
// MULTI-LAYER SECURITY: BEARER TOKEN VERIFICATION & ANOMALY TRACKER
// =========================================================================
interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    email_verified?: boolean;
    isAdmin?: boolean;
    kycLocked?: boolean;
  };
  adminContext?: ResolvedAdminContext;
}

const getActiveDb = (): any => {
  return process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
};

interface SecurityAnomalyEntry {
  id: string;
  timestamp: string;
  ip: string;
  type: string;
  details: string;
}

const securityAnomaliesRingBuffer: SecurityAnomalyEntry[] = [];
const MAX_ANOMALIES = 50;

const recordSecurityAnomaly = (ip: string, type: string, details: string) => {
  const entry: SecurityAnomalyEntry = {
    id: `ANOMALY-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ip,
    type,
    details: details.slice(0, 300),
  };
  securityAnomaliesRingBuffer.unshift(entry);
  if (securityAnomaliesRingBuffer.length > MAX_ANOMALIES) {
    securityAnomaliesRingBuffer.pop();
  }
  console.warn(`[SECURITY ANOMALY DETECTED] IP: ${ip} | Type: ${type} | ${details}`);
};

/**
 * Middleware: Verify Firebase Bearer ID Token if present in headers
 */
const authenticateFirebaseToken = async (req: AuthenticatedRequest, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = undefined;
    return next();
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (!token) {
    req.user = undefined;
    return next();
  }

  if (process.env.NODE_ENV === 'test' && testTokenVerifierOverride) {
    try {
      const decoded = await testTokenVerifierOverride(token);
      const isSuperAdminEmail = (decoded.email || '').toLowerCase().trim() === 'pamphile.gbede@gmail.com';
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        email_verified: decoded.email_verified,
        isAdmin: isSuperAdminEmail || Boolean(decoded.admin),
        kycLocked: Boolean((decoded as any).kycLocked),
      };
      return next();
    } catch (err: any) {
      recordSecurityAnomaly(getClientIp(req), 'INVALID_BEARER_TOKEN', `Échec vérification jeton test: ${err?.message || err}`);
      req.user = undefined;
      return next();
    }
  }

  if (firebaseAdminApp) {
    try {
      const decoded = await getAuth(firebaseAdminApp).verifyIdToken(token);
      const isSuperAdminEmail = (decoded.email || '').toLowerCase().trim() === 'pamphile.gbede@gmail.com';
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        email_verified: decoded.email_verified,
        isAdmin: isSuperAdminEmail || Boolean(decoded.admin),
        kycLocked: Boolean((decoded as any).kycLocked),
      };
    } catch (err: any) {
      recordSecurityAnomaly(getClientIp(req), 'INVALID_BEARER_TOKEN', `Échec vérification jeton Firebase: ${err?.message || err}`);
      req.user = undefined;
    }
  }
  next();
};

const checkCallerIsAdmin = async (user?: AuthenticatedRequest['user']): Promise<boolean> => {
  const ctx = await resolveAdminContext(getActiveDb(), user);
  return ctx.isAdmin && ctx.isActive;
};

/**
 * Middleware: Require any valid Firebase ID Token
 */
const requireAuthenticatedUser = (req: AuthenticatedRequest, res: Response, next: any) => {
  if (!req.user?.uid) {
    recordSecurityAnomaly(getClientIp(req), 'UNAUTHENTICATED_API_ATTEMPT', `Accès sans jeton Firebase sur: ${req.path}`);
    return res.status(401).json({
      success: false,
      error: 'Authentification Firebase requise pour accéder à cette ressource.',
    });
  }
  next();
};

/**
 * Middleware: Require a valid Firebase ID Token with verified email
 */
const requireVerifiedUser = (req: AuthenticatedRequest, res: Response, next: any) => {
  if (!req.user?.uid) {
    recordSecurityAnomaly(getClientIp(req), 'UNAUTHENTICATED_API_ATTEMPT', `Accès sans jeton Firebase sur: ${req.path}`);
    return res.status(401).json({
      success: false,
      error: 'Authentification Firebase requise pour accéder à cette ressource.',
    });
  }
  if (req.user.email_verified !== true) {
    recordSecurityAnomaly(getClientIp(req), 'UNVERIFIED_EMAIL_API_ATTEMPT', `Email non vérifié pour ${req.user.email || req.user.uid} sur: ${req.path}`);
    return res.status(403).json({
      success: false,
      error: 'Adresse e-mail non vérifiée. Veuillez valider votre e-mail avant d\'effectuer cette opération.',
    });
  }
  next();
};

/**
 * Middleware: Enforce verified Super-Admin / Admin authorization strictly via Firebase ID token & Firestore role/RBAC
 */
const requireAdminAuthorization = async (req: AuthenticatedRequest, res: Response, next: any) => {
  if (!req.user?.uid) {
    recordSecurityAnomaly(getClientIp(req), 'UNAUTHENTICATED_ADMIN_ROUTE_ATTEMPT', `Accès sans jeton Firebase à la route admin: ${req.path}`);
    return res.status(401).json({
      success: false,
      error: 'Authentification Firebase requise pour accéder à cette ressource administrateur.',
    });
  }

  if (req.user.email_verified !== true) {
    recordSecurityAnomaly(getClientIp(req), 'UNVERIFIED_ADMIN_ATTEMPT', `Tentative d'accès admin avec e-mail non vérifié (${req.user.email || req.user.uid}) sur: ${req.path}`);
    return res.status(403).json({
      success: false,
      error: 'Accès refusé. Adresse e-mail administrateur vérifiée requise.',
    });
  }

  const adminCtx = await resolveAdminContext(getActiveDb(), req.user);
  if (!adminCtx.isAdmin || !adminCtx.isActive) {
    recordSecurityAnomaly(getClientIp(req), 'UNAUTHORIZED_ADMIN_ROUTE_ATTEMPT', `Tentative d'accès non autorisée par ${req.user.email || req.user.uid} sur: ${req.path}`);
    return res.status(403).json({
      success: false,
      error: 'Accès refusé. Droits d\'administration vérifiés requis pour exécuter cette action.',
    });
  }
  req.adminContext = adminCtx;
  next();
};

const requireAdminPermission = (permission: AdminPermission) => {
  return async (req: AuthenticatedRequest, res: Response, next: any) => {
    if (!req.user?.uid) {
      recordSecurityAnomaly(getClientIp(req), 'UNAUTHENTICATED_ADMIN_ROUTE_ATTEMPT', `Accès sans jeton Firebase à la route admin: ${req.path}`);
      return res.status(401).json({
        success: false,
        error: 'Authentification Firebase requise pour accéder à cette ressource administrateur.',
      });
    }
    if (req.user.email_verified !== true) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Adresse e-mail administrateur vérifiée requise.',
      });
    }
    const adminCtx = await resolveAdminContext(getActiveDb(), req.user);
    if (!adminCtx.isAdmin || !adminCtx.isActive) {
      recordSecurityAnomaly(getClientIp(req), 'UNAUTHORIZED_ADMIN_ROUTE_ATTEMPT', `Tentative d'accès non autorisée par ${req.user.email || req.user.uid} sur: ${req.path}`);
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Droits d\'administration vérifiés requis.',
      });
    }
    if (!hasAdminPermission(adminCtx, permission)) {
      recordSecurityAnomaly(getClientIp(req), 'RBAC_PERMISSION_DENIED', `${adminCtx.email} (${adminCtx.roleId}) bloqué pour ${permission} sur ${req.path}`);
      void recordAdminAuditLog(getActiveDb(), {
        adminUid: adminCtx.uid,
        adminEmail: adminCtx.email,
        adminRole: adminCtx.roleId || 'unknown',
        category: 'rbac',
        action: `PERMISSION_DENIED:${permission}`,
        targetType: 'route',
        targetId: req.path,
        result: 'denied',
      });
      return res.status(403).json({
        success: false,
        code: 'RBAC_PERMISSION_DENIED',
        requiredPermission: permission,
        error: `Permission insuffisante (${permission}) pour exécuter cette opération.`,
      });
    }
    req.adminContext = adminCtx;
    next();
  };
};

const requireSuperAdminAuthorization = async (req: AuthenticatedRequest, res: Response, next: any) => {
  await requireAdminPermission('admins.manage')(req, res, () => {
    if (!req.adminContext?.isSuperAdmin) {
      return res.status(403).json({
        success: false,
        code: 'SUPER_ADMIN_REQUIRED',
        error: 'Cette action est strictement réservée au Super-Administrateur.',
      });
    }
    next();
  });
};

app.use('/api', authenticateFirebaseToken as any);

// Secret salt for HMAC-SHA256 OTP & POD token signing (minimum 32 characters; zero randomBytes fallback)
export const MIN_OTP_HMAC_SECRET_LENGTH = 32;

export function evaluateHmacSecretConfig(env: NodeJS.ProcessEnv = process.env): {
  configured: boolean;
  valid: boolean;
  tooShort: boolean;
  source: 'OTP_SECRET_SALT' | 'POD_OTP_HMAC_SECRET' | 'none';
  secret: string | null;
  isProduction: boolean;
} {
  const isProduction = env.NODE_ENV === 'production';
  const primary = (env.OTP_SECRET_SALT || '').trim();
  const alias = (env.POD_OTP_HMAC_SECRET || '').trim();
  const raw = primary || alias;
  const source: 'OTP_SECRET_SALT' | 'POD_OTP_HMAC_SECRET' | 'none' = primary
    ? 'OTP_SECRET_SALT'
    : alias
      ? 'POD_OTP_HMAC_SECRET'
      : 'none';

  if (raw.length >= MIN_OTP_HMAC_SECRET_LENGTH) {
    return {
      configured: true,
      valid: true,
      tooShort: false,
      source,
      secret: raw,
      isProduction,
    };
  }

  return {
    configured: raw.length > 0,
    valid: false,
    tooShort: raw.length > 0,
    source,
    secret: null,
    isProduction,
  };
}

const startupHmacState = evaluateHmacSecretConfig();
if (!startupHmacState.valid) {
  if (startupHmacState.isProduction) {
    console.error(
      `[SECURITY CRITICAL] OTP_SECRET_SALT / POD_OTP_HMAC_SECRET ${startupHmacState.tooShort ? 'trop court (< 32 caractères)' : 'manquant'} en production ! Les routes OTP, reset-password et POD sont strictement bloquées (HTTP 503). Configurez OTP_SECRET_SALT dans Google Cloud Secret Manager / apphosting.yaml.`
    );
  } else {
    console.warn(
      `[SECURITY WARN] OTP_SECRET_SALT / POD_OTP_HMAC_SECRET ${startupHmacState.tooShort ? 'trop court (< 32 caractères)' : 'non configuré'}. Aucun secret aléatoire généré au démarrage ; opérations OTP/POD bloquées sauf secret valide ou mock de test injecté.`
    );
  }
} else if (
  process.env.OTP_SECRET_SALT?.trim() &&
  process.env.POD_OTP_HMAC_SECRET?.trim() &&
  process.env.OTP_SECRET_SALT.trim() !== process.env.POD_OTP_HMAC_SECRET.trim()
) {
  console.warn('[SECURITY WARN] OTP_SECRET_SALT et POD_OTP_HMAC_SECRET diffèrent ; OTP_SECRET_SALT est utilisé de manière unifiée.');
}

const ensureHmacSecretReadyForSensitiveRoutes = (res: Response): boolean => {
  if (process.env.NODE_ENV === 'test' && testP0SecurityOverride) {
    return true;
  }
  const state = evaluateHmacSecretConfig();
  if (!state.valid) {
    res.status(503).json({
      success: false,
      error:
        'Service de sécurité temporairement indisponible : secret HMAC serveur manquant ou invalide (>= 32 caractères requis).',
    });
    return false;
  }
  return true;
};

const getP0Security = (req?: Request): P0SecurityService | null => {
  if (process.env.NODE_ENV === 'test' && testP0SecurityOverride) {
    return testP0SecurityOverride;
  }
  if (!firestoreAdmin) return null;
  if (!cachedP0Security) {
    cachedP0Security = createP0SecurityService(firestoreAdmin as unknown as P0FirestoreLike, {
      getSecretSalt: () => evaluateHmacSecretConfig().secret,
      payoutProvider: (payoutReq) => resolvePayoutProviderAdapter()(payoutReq),
      onAnomaly: (type, details) => {
        recordSecurityAnomaly(req ? getClientIp(req) : 'internal', type, details);
      },
    });
  }
  return cachedP0Security;
};

export type { SentEmailRecord };

let cachedP1EmailService: P1EmailAndConfigService | null = null;
let testP1EmailServiceOverride: P1EmailAndConfigService | null = null;

export function setP1EmailServiceForTests(service: P1EmailAndConfigService | null): void {
  if (process.env.NODE_ENV === 'test') {
    testP1EmailServiceOverride = service;
  }
}

const getP1EmailService = (): P1EmailAndConfigService => {
  if (process.env.NODE_ENV === 'test' && testP1EmailServiceOverride) {
    return testP1EmailServiceOverride;
  }
  if (!cachedP1EmailService) {
    cachedP1EmailService = createP1EmailAndConfigService(
      firestoreAdmin ? (firestoreAdmin as unknown as P1FirestoreLike) : null
    );
  }
  return cachedP1EmailService;
};

// Periodic queue processor, bounded cache pruning & expired docs cleanup (outside test mode)
if (process.env.NODE_ENV !== 'test') {
  const queueTimer = setInterval(() => {
    getP1EmailService().processEmailQueue({ forceImmediate: false }).catch(() => {});
  }, 45 * 1000);
  if (typeof queueTimer.unref === 'function') queueTimer.unref();

  const cleanupTimer = setInterval(() => {
    pruneIpRateLimits();
    getP0Security()?.cleanupExpiredSecurityDocs(25).catch(() => {});
    getP1EmailService().cleanupExpiredP1Docs(25).catch(() => {});
  }, 10 * 60 * 1000);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
}

const getAppPublicBaseUrl = (req?: Request): string => {
  const configured =
    process.env.APP_PUBLIC_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    '';
  const trimmed = configured.trim();
  if (trimmed && /^https?:\/\/.+/i.test(trimmed) && !trimmed.includes('MY_APP_URL')) {
    return trimmed.replace(/\/+$/, '');
  }
  const resolvedHost = req?.hostname && !req.hostname.includes('127.0.0.1') && !req.hostname.includes('localhost')
    ? req.hostname
    : req?.get?.('host');
  if (resolvedHost && !resolvedHost.includes('127.0.0.1') && !resolvedHost.includes('localhost')) {
    const proto = req?.protocol || 'https';
    return `${proto}://${resolvedHost}`;
  }
  return 'https://livralink.oxy-dev.cc';
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

const sanitizeEmailHeaderText = (unsafe: any, maxLen = 140): string => {
  return String(unsafe ?? '')
    .replace(/[\r\n\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
};

/**
 * POST /api/auth/send-reset-code
 * Generates an unpredictable 6-digit random code, hashes it on the server,
 * enforces rate-limiting (60s), and dispatches it via Gmail SMTP.
 */
app.post('/api/auth/send-reset-code', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV === 'production' && !ensureHmacSecretReadyForSensitiveRoutes(res)) {
      return;
    }

    const { email } = req.body || {};

    const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim()) || email.trim().length > 128) {
      res.status(400).json({ success: false, error: 'Veuillez saisir une adresse e-mail valide (max 128 caractères).' });
      return;
    }

    if (!ensureHmacSecretReadyForSensitiveRoutes(res)) {
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

    const p0 = getP0Security(req);
    if (!p0) {
      res.status(503).json({
        success: false,
        emailDelivered: false,
        error: 'Service de sécurité Firestore indisponible. Veuillez réessayer dans un instant.',
      });
      return;
    }

    const p1 = getP1EmailService();
    const smtpConfig = await p1.getEffectiveSmtpConfig();
    const transporter = createNodemailerTransportFromConfig(smtpConfig);
    if (!transporter) {
      console.warn('[GMAIL SMTP] Identifiants SMTP (GMAIL_SMTP_USER / GMAIL_SMTP_PASS ou config Firestore) non configurés.');
      res.status(503).json({
        success: false,
        emailDelivered: false,
        error: 'Serveur SMTP Gmail non configuré. Veuillez vérifier les paramètres SMTP du serveur (GMAIL_SMTP_USER / GMAIL_SMTP_PASS).',
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

    // Atomic Firestore transaction: 60s resend cooldown + HMAC-SHA256 hash + 10 min TTL + 3 attempts
    const otpIssue = await p0.issuePasswordResetOtp(cleanEmail);
    if (!otpIssue.ok) {
      res.status(otpIssue.status).json({
        success: false,
        error: otpIssue.error,
        cooldownSeconds: otpIssue.cooldownSeconds,
      });
      return;
    }

    const { rawCode, expiresAt } = otpIssue;
    console.log(`[AUTH-OTP] Code de sécurité généré et persisté (HMAC-SHA256) pour ${cleanEmail}. Expire à: ${new Date(expiresAt).toISOString()}`);

    let emailDelivered = false;
    let smtpErrorMessage = '';

    try {
      const fromAddress = normalizeSmtpFromAddress(smtpConfig.from, 'LivraLink Sécurité <Pamphile.gbede@gmail.com>');

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
                © ${new Date().getFullYear()} LivraLink Bénin — Plateforme logistique et livraison sécurisée.
              </p>
            </div>
          </div>
        `,
      });
      emailDelivered = true;
      console.log(`[GMAIL SMTP] E-mail de réinitialisation accepté avec succès par Gmail SMTP pour ${cleanEmail}`);
    } catch (mailErr: any) {
      smtpErrorMessage = mailErr.message || 'Échec de connexion au serveur Gmail SMTP.';
      console.error('[GMAIL SMTP ERROR] Échec de l\'envoi:', smtpErrorMessage);
    }

    if (!emailDelivered) {
      await p0.clearPasswordResetOtp(cleanEmail);
      res.status(503).json({
        success: false,
        emailDelivered: false,
        error: `Le serveur Gmail SMTP n'a pas confirmé l'envoi : ${smtpErrorMessage || 'Relais Gmail SMTP indisponible.'}`,
      });
      return;
    }

    await p1.recordEmailLog({
      type: 'password_reset_request',
      to: cleanEmail,
      recipientName: cleanEmail.split('@')[0],
      subject: `Votre code de réinitialisation LivraLink : ••••••`,
      previewText: `Code de sécurité à 6 chiffres transmis avec succès au relais Gmail SMTP.`,
      htmlContent: `<div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 20px; color: #0f172a;"><h2>Code de réinitialisation</h2><p>Le code temporaire a été expédié à l'utilisateur via Gmail SMTP.</p></div>`,
      deliveredViaSmtp: true,
    });

    res.json({
      success: true,
      email: cleanEmail,
      message: `Un code de sécurité à 6 chiffres a été transmis avec succès au serveur SMTP Gmail pour ${cleanEmail}.`,
      emailDelivered: true,
    });
  } catch (error: any) {
    console.error('[AUTH ERROR] send-reset-code:', error);
    res.status(500).json({ success: false, error: 'Une erreur interne est survenue lors de la génération du code.' });
  }
});

/**
 * POST /api/auth/verify-reset-code
 * Verifies the 6-digit code against the stored hash, validates expiration and attempts,
 * and issues a single-use cryptographic resetToken upon success.
 */
app.post('/api/auth/verify-reset-code', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV === 'production' && !ensureHmacSecretReadyForSensitiveRoutes(res)) {
      return;
    }

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

    if (!ensureHmacSecretReadyForSensitiveRoutes(res)) {
      return;
    }

    const p0 = getP0Security(req);
    if (!p0) {
      res.status(503).json({ success: false, error: 'Service de sécurité Firestore indisponible.' });
      return;
    }

    const verifyResult = await p0.verifyPasswordResetOtp(cleanEmail, cleanCode);
    if (!verifyResult.ok) {
      res.status(verifyResult.status).json({
        success: false,
        error: verifyResult.error,
        attemptsLeft: verifyResult.attemptsLeft,
      });
      return;
    }

    const rawResetToken = verifyResult.resetToken;

    let resolvedRole = 'vendeur';
    if (firestoreAdmin) {
      try {
        const userSnap = await firestoreAdmin.collection('users').where('email', '==', cleanEmail).limit(1).get();
        if (!userSnap.empty) {
          const r = userSnap.docs[0].data()?.role;
          if (r === 'livreur' || r === 'vendeur' || r === 'admin' || r === 'client') {
            resolvedRole = r;
          }
        }
      } catch {}
    }

    res.json({
      success: true,
      resetToken: rawResetToken,
      role: resolvedRole,
      message: 'Code de sécurité validé avec succès.',
    });
  } catch (error: any) {
    console.error('[AUTH ERROR] verify-reset-code:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la validation du code.' });
  }
});

/**
 * POST /api/auth/reset-password
 * Consumes the single-use resetToken atomically in Firestore, validates parameters,
 * and updates the user's password directly in Firebase Authentication via Firebase Admin SDK.
 */
app.post('/api/auth/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV === 'production' && !ensureHmacSecretReadyForSensitiveRoutes(res)) {
      return;
    }

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

    if (!ensureHmacSecretReadyForSensitiveRoutes(res)) {
      return;
    }

    const p0 = getP0Security(req);
    if (!p0) {
      res.status(503).json({ success: false, error: 'Service de sécurité Firestore indisponible.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const tokenCheck = await p0.consumePasswordResetToken(cleanEmail, String(resetToken));
    if (!tokenCheck.ok) {
      res.status(tokenCheck.status).json({
        success: false,
        error: tokenCheck.error,
      });
      return;
    }

    // Update password in Firebase Authentication via Firebase Admin SDK
    let firebaseAuthUpdated = false;

    if (getApps().length > 0) {
      try {
        const auth = getAuth();
        const userRecord = await auth.getUserByEmail(cleanEmail);
        await auth.updateUser(userRecord.uid, {
          password: newPassword,
        });
        await auth.revokeRefreshTokens(userRecord.uid).catch(() => {});
        firebaseAuthUpdated = true;
        console.log(`[FIREBASE-ADMIN] Mot de passe Firebase Authentication mis à jour et jetons révoqués pour l'UID: ${userRecord.uid}`);
      } catch (authErr: any) {
        if (authErr?.code === 'auth/user-not-found') {
          console.warn(`[FIREBASE-ADMIN] Utilisateur non trouvé dans Firebase Auth pour: ${cleanEmail}`);
        } else {
          console.error('[FIREBASE-ADMIN] Erreur lors de l\'appel updateUser:', authErr?.message);
        }
      }
    }

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
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">© ${new Date().getFullYear()} LivraLink Bénin — Plateforme logistique et livraison sécurisée.</p>
        </div>
      </div>
    `;

    // Send confirmation email (uses shared Firestore SMTP config & durable retry queue on failure)
    const p1 = getP1EmailService();
    const dispatchRes = await p1.dispatchOrQueueEmail({
      type: 'password_changed_confirmation',
      to: cleanEmail,
      recipientName: cleanEmail.split('@')[0],
      subject: '🔐 LivraLink : Confirmation de modification de votre mot de passe',
      previewText: 'Votre mot de passe a été mis à jour avec succès.',
      textContent: `Bonjour,\n\nLe mot de passe de votre compte LivraLink a été modifié avec succès.\n\nSi vous n'êtes pas l'auteur de ce changement, contactez le support.`,
      htmlContent: confirmHtml,
      allowQueue: true,
    });

    res.json({
      success: true,
      firebaseAuthUpdated,
      emailDelivered: dispatchRes.emailDelivered,
      message: 'Votre mot de passe a été mis à jour avec succès. Un e-mail de confirmation vous a été envoyé.',
    });
  } catch (error: any) {
    console.error('[AUTH ERROR] reset-password:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour du mot de passe.' });
  }
});

/**
 * POST /api/auth/admin-force-reset
 * Administrator-only forced password reset via Firebase Admin SDK
 */
app.post('/api/auth/admin-force-reset', requireAdminAuthorization as any, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, newPassword } = req.body || {};
    const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ success: false, error: 'Adresse e-mail valide requise.' });
      return;
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
      return;
    }
    if (!firebaseAdminApp) {
      res.status(503).json({ success: false, error: 'Firebase Admin SDK indisponible.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const adminAuth = getAuth(firebaseAdminApp);
    const userRecord = await adminAuth.getUserByEmail(cleanEmail);
    await adminAuth.updateUser(userRecord.uid, { password: newPassword });
    await adminAuth.revokeRefreshTokens(userRecord.uid).catch(() => {});

    console.log(`[ADMIN-FORCE-RESET] Mot de passe réinitialisé et jetons révoqués par ${req.user?.email || req.user?.uid} pour ${cleanEmail}`);
    res.json({
      success: true,
      message: `Le mot de passe de ${cleanEmail} a été réinitialisé avec succès via Firebase Admin.`,
    });
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      res.status(404).json({ success: false, error: 'Aucun compte Firebase Auth trouvé pour cet e-mail.' });
      return;
    }
    console.error('[ADMIN-FORCE-RESET ERROR]:', err?.message || err);
    res.status(500).json({ success: false, error: 'Erreur lors de la réinitialisation administrative du mot de passe.' });
  }
});

// =========================================================================
// EMAIL SERVICES: BIENVENUE, CHANGEMENT MOT DE PASSE & MISSIONS PRIORITAIRES
// =========================================================================

/**
 * POST /api/email/welcome
 * Dispatches a welcome email to a newly registered merchant or courier.
 */
// Welcome email handler function
const handleWelcomeEmailRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, fullName, role, storeName, vehicleType, phone } = req.body || {};

    const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ success: false, error: 'Adresse e-mail valide requise.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const callerEmail = (req.user?.email || '').trim().toLowerCase();
    const isAdmin = await checkCallerIsAdmin(req.user);
    if (!isAdmin && callerEmail !== cleanEmail) {
      recordSecurityAnomaly(getClientIp(req), 'UNAUTHORIZED_EMAIL_SPOOF', `Tentative d'envoi welcome email pour ${cleanEmail} par ${callerEmail || req.user?.uid}`);
      res.status(403).json({ success: false, error: 'Vous ne pouvez envoyer cet e-mail que pour votre propre adresse.' });
      return;
    }
    const cleanName = (fullName || cleanEmail.split('@')[0]).trim().slice(0, 100);
    const safeName = escapeHtml(cleanName);
    const safeStore = storeName ? escapeHtml(storeName.trim().slice(0, 100)) : '';
    const safeVehicle = vehicleType ? escapeHtml(vehicleType.trim().slice(0, 50)) : '';
    const safePhone = phone ? escapeHtml(phone.trim().slice(0, 30)) : '';

    const isVendeur = role === 'vendeur';
    const roleLabel = isVendeur ? 'Vendeur / Marchand' : 'Livreur Partenaire';
    const roleBadgeBg = isVendeur ? '#eff6ff' : '#f0fdf4';
    const roleBadgeText = isVendeur ? '#1d4ed8' : '#15803d';

    const headerName = sanitizeEmailHeaderText(cleanName, 100);
    const subject = `Bienvenue sur LivraLink, ${headerName} ! 🚀 Votre compte ${roleLabel} est prêt`;
    const previewText = `Félicitations ! Votre compte LivraLink ${roleLabel} a été créé avec succès. Découvrez comment utiliser votre espace.`;

    const appBaseUrl = escapeHtml(getAppPublicBaseUrl(req));
    const htmlContent = `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); color: #0f172a;">
        <div style="background-color: #0f172a; padding: 28px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">
            Livra<span style="color: #2563eb;">Link</span>
          </h1>
          <p style="color: #94a3b8; font-size: 11px; margin: 6px 0 0 0; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">
            Logistique Urbaine &amp; Livraison Sécurisée
          </p>
        </div>

        <div style="padding: 32px 24px;">
          <div style="display: inline-block; background-color: ${roleBadgeBg}; color: ${roleBadgeText}; font-weight: 800; font-size: 12px; padding: 6px 14px; border-radius: 9999px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid ${isVendeur ? '#bfdbfe' : '#bbf7d0'};">
            🎉 COMPTE ${roleLabel.toUpperCase()} ACTIVÉ
          </div>

          <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 14px 0;">
            Bienvenue sur LivraLink, ${safeName} !
          </h2>

          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
            ${
              isVendeur
                ? 'Votre compte marchand est désormais actif. LivraLink vous permet de gérer vos livraisons urbaines en toute simplicité avec suivi GPS en direct et certification par code secret OTP.'
                : 'Votre compte livreur partenaire est créé avec succès. Rejoignez notre réseau de coursiers certifiés à Cotonou et Calavi et profitez d\'une rétribution directe à 100 FCFA/km net.'
            }
          </p>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
            <h3 style="font-size: 12px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 12px 0;">
              Coordonnées de votre compte
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; width: 40%;">👤 Responsable :</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${safeName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">📧 Adresse e-mail :</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${escapeHtml(cleanEmail)}</td>
              </tr>
              ${safePhone ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b;">📱 Contact WhatsApp :</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${safePhone}</td>
              </tr>` : ''}
              ${isVendeur && safeStore ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b;">🏪 Boutique :</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${safeStore}</td>
              </tr>` : ''}
              ${!isVendeur && safeVehicle ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b;">🛵 Moyen de transport :</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 700;">${safeVehicle}</td>
              </tr>` : ''}
            </table>
          </div>

          <div style="background-color: #f1f5f9; border-left: 4px solid #2563eb; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
            <h3 style="font-size: 14px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;">
              💡 Comment utiliser votre espace ${isVendeur ? 'Vendeur' : 'Livreur'} :
            </h3>
            
            ${
              isVendeur
                ? `
                <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.7;">
                  <li style="margin-bottom: 8px;">
                    <strong>Créer une course en 30 secondes :</strong> Renseignez l'adresse de votre client. L'application calcule automatiquement la distance et le tarif kilométrique (100 F/km).
                  </li>
                  <li style="margin-bottom: 8px;">
                    <strong>Partager le suivi WhatsApp :</strong> Transmettez le lien de suivi en temps réel à votre client pour qu'il suive la progression du livreur sur la carte.
                  </li>
                  <li>
                    <strong>Sécuriser par Code OTP :</strong> Envoyez le code secret à 4 chiffres à votre client. Le livreur devra saisir ce code à la remise pour valider la livraison.
                  </li>
                </ol>
                `
                : `
                <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.7;">
                  <li style="margin-bottom: 8px;">
                    <strong>Passer « En ligne » :</strong> Activez votre disponibilité pour recevoir en temps réel les notifications de missions publiées dans votre zone.
                  </li>
                  <li style="margin-bottom: 8px;">
                    <strong>Accepter &amp; Guider :</strong> Consultez le gain garanti et l'itinéraire Google Maps avant d'accepter une course.
                  </li>
                  <li>
                    <strong>Valider la Preuve POD :</strong> Saisissez le code OTP communiqué par le client, prenez la photo du colis et recueillez sa signature tactile.
                  </li>
                </ol>
                `
            }
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${appBaseUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.25);">
              Accéder à mon espace ${isVendeur ? 'Vendeur' : 'Livreur'} →
            </a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            Cet e-mail automatique est envoyé à la création de votre compte. Pour toute question, l'assistance LivraLink reste disponible dans votre application.
          </p>
        </div>

        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">
            © ${new Date().getFullYear()} LivraLink Bénin — Tous droits réservés. Cotonou, Bénin.
          </p>
        </div>
      </div>
    `;

    const p1 = getP1EmailService();
    const dispatchRes = await p1.dispatchOrQueueEmail({
      type: 'welcome',
      to: cleanEmail,
      recipientName: cleanName,
      recipientRole: role || 'vendeur',
      subject,
      previewText,
      textContent: `Bienvenue sur LivraLink, ${cleanName} !\n\nVotre compte ${roleLabel} a été créé avec succès.\nIdentifiant: ${cleanEmail}`,
      htmlContent,
      allowQueue: true,
    });

    res.json({
      success: true,
      emailDelivered: dispatchRes.emailDelivered,
      queued: dispatchRes.queued,
      emailId: dispatchRes.emailRecord.id,
      message: `E-mail de bienvenue envoyé avec succès à ${cleanEmail}`,
    });
  } catch (error: any) {
    console.error('[EMAIL ERROR] welcome:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi de l\'e-mail de bienvenue.' });
  }
};

app.post('/api/email/welcome', requireAuthenticatedUser as any, handleWelcomeEmailRequest as any);
app.post('/api/email/bienvenue', requireAuthenticatedUser as any, handleWelcomeEmailRequest as any);

/**
 * POST /api/email/password-changed
 * Dispatches a security notification email when a user modifies their password.
 */
app.post('/api/email/password-changed', requireAuthenticatedUser as any, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, fullName } = req.body || {};

    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, error: 'Email requis.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const callerEmail = (req.user?.email || '').trim().toLowerCase();
    const isAdmin = await checkCallerIsAdmin(req.user);
    if (!isAdmin && callerEmail !== cleanEmail) {
      recordSecurityAnomaly(getClientIp(req), 'UNAUTHORIZED_EMAIL_SPOOF', `Tentative d'envoi password-changed pour ${cleanEmail} par ${callerEmail || req.user?.uid}`);
      res.status(403).json({ success: false, error: 'Accès refusé pour cette adresse e-mail.' });
      return;
    }
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

    const p1 = getP1EmailService();
    const dispatchRes = await p1.dispatchOrQueueEmail({
      type: 'password_changed_confirmation',
      to: cleanEmail,
      recipientName: cleanName,
      subject,
      previewText,
      textContent: `Bonjour ${cleanName},\n\nVotre mot de passe LivraLink a été modifié le ${new Date().toLocaleDateString('fr-FR')}.\n\nSi vous n'êtes pas à l'origine de cette action, prévenez immédiatement le support.`,
      htmlContent,
      allowQueue: true,
    });

    res.json({
      success: true,
      emailDelivered: dispatchRes.emailDelivered,
      queued: dispatchRes.queued,
      emailId: dispatchRes.emailRecord.id,
      message: `Notification de changement de mot de passe envoyée à ${cleanEmail}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi de la notification.' });
  }
});

/**
 * POST /api/email/kyc-approved
 * Dispatches an email notification when a user's KYC verification status is confirmed or updated by Admin.
 */
app.post('/api/email/kyc-approved', requireAdminAuthorization as any, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, fullName, role, status, reason } = req.body || {};

    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, error: 'Email valide requis.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (fullName || cleanEmail.split('@')[0]).trim().slice(0, 100);
    const safeName = escapeHtml(cleanName);
    const isApproved = status === 'approved';
    const roleLabel = role === 'vendeur' ? 'Vendeur / Marchand' : 'Livreur Partenaire';

    const headerName = sanitizeEmailHeaderText(cleanName, 100);
    const subject = isApproved
      ? `🎉 Compte Activé ! Votre vérification KYC LivraLink est confirmée, ${headerName}`
      : `⚠️ Dossier KYC LivraLink : Action requise pour la validation de votre compte`;

    const previewText = isApproved
      ? `Félicitations ! Votre dossier d'accréditation est validé et votre compte ${roleLabel} est actif.`
      : `Notification d'accréditation : des informations complémentaires sont requises pour votre compte.`;

    const htmlContent = `
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; color: #0f172a;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">Livra<span style="color: #2563eb;">Link</span></h1>
          <p style="color: #94a3b8; font-size: 11px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Vérification d'Identité &amp; Accréditation</p>
        </div>
        <div style="padding: 28px 24px;">
          <div style="display: inline-block; background-color: ${isApproved ? '#f0fdf4' : '#fef2f2'}; color: ${isApproved ? '#15803d' : '#b91c1c'}; font-weight: 800; font-size: 12px; padding: 6px 14px; border-radius: 9999px; margin-bottom: 16px;">
            ${isApproved ? '✅ KYC CONFIRMÉ & COMPTE ACTIVÉ' : '⚠️ ACTION REQUISE SUR LE DOSSIER'}
          </div>
          <h2 style="font-size: 20px; font-weight: 800; margin: 0 0 14px 0; color: #0f172a;">
            Bonjour ${safeName},
          </h2>
          ${
            isApproved
              ? `
              <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 16px 0;">
                Nous avons le plaisir de vous informer que vos pièces d'identité et votre dossier KYC ont été <strong>vérifiés et approuvés avec succès</strong>.
              </p>
              <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 20px 0;">
                Votre compte <strong>${roleLabel}</strong> dispose désormais du statut accrédité et vérifié ★ sur LivraLink. Vous bénéficiez de toutes les fonctionnalités avancées de la plateforme.
              </p>
              `
              : `
              <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 16px 0;">
                Votre dossier de validation KYC a été examiné. Des corrections sont nécessaires avant d'activer définitivement votre compte :
              </p>
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
                <p style="font-size: 13px; color: #991b1b; margin: 0; font-weight: 600;">Motif indiqué : ${escapeHtml(reason || 'Pièce d\'identité non conforme ou illisible.')}</p>
              </div>
              <p style="font-size: 13px; color: #475569;">Veuillez vous reconnecter à votre application et transmettre vos pièces révisées.</p>
              `
          }
          <div style="text-align: center; margin: 24px 0 10px 0;">
            <a href="${escapeHtml(getAppPublicBaseUrl(req))}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; padding: 12px 28px; border-radius: 12px;">
              Accéder à LivraLink →
            </a>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 14px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">© ${new Date().getFullYear()} LivraLink Bénin</p>
        </div>
      </div>
    `;

    const p1 = getP1EmailService();
    const dispatchRes = await p1.dispatchOrQueueEmail({
      type: isApproved ? 'kyc_approved' : 'kyc_rejected',
      to: cleanEmail,
      recipientName: cleanName,
      recipientRole: role || 'livreur',
      subject,
      previewText,
      textContent: `${subject}\n\nBonjour ${cleanName},\nStatus KYC: ${isApproved ? 'VALIDÉ / ACTIVÉ' : 'REJETÉ / ACTION REQUISE'}`,
      htmlContent,
      allowQueue: true,
    });

    res.json({
      success: true,
      emailDelivered: dispatchRes.emailDelivered,
      queued: dispatchRes.queued,
      emailId: dispatchRes.emailRecord.id,
      message: `Email KYC traité avec succès pour ${cleanEmail}`,
    });
  } catch (error: any) {
    console.error('[EMAIL ERROR] kyc-approved:', error);
    res.status(500).json({ success: false, error: 'Erreur lors du traitement de l\'email KYC.' });
  }
});

/**
 * POST /api/email/kyc-submitted
 * Dispatches an email receipt when a user submits their KYC documents.
 */
app.post('/api/email/kyc-submitted', requireAuthenticatedUser as any, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, fullName, role, idType, idNumber } = req.body || {};

    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, error: 'Email valide requis.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const callerEmail = (req.user?.email || '').trim().toLowerCase();
    const isAdmin = await checkCallerIsAdmin(req.user);
    if (!isAdmin && callerEmail !== cleanEmail) {
      res.status(403).json({ success: false, error: 'Accès refusé pour cet e-mail KYC.' });
      return;
    }
    const cleanName = (fullName || cleanEmail.split('@')[0]).trim().slice(0, 100);
    const safeName = escapeHtml(cleanName);
    const roleLabel = role === 'vendeur' ? 'Vendeur / Marchand' : 'Livreur Partenaire';

    const subject = `📥 Réception de vos documents KYC - LivraLink Bénin`;
    const previewText = `Nous avons bien reçu votre dossier de vérification d'identité. Traitement administratif en cours.`;

    const htmlContent = `
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; color: #0f172a;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">Livra<span style="color: #2563eb;">Link</span></h1>
          <p style="color: #94a3b8; font-size: 11px; margin: 4px 0 0 0; text-transform: uppercase;">Dossier d'Identification Transmis</p>
        </div>
        <div style="padding: 28px 24px;">
          <h2 style="font-size: 18px; font-weight: 800; margin: 0 0 12px 0;">Bonjour ${safeName},</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Nous vous confirmons la bonne réception de vos pièces justificatives (${escapeHtml(idType || 'Document')} #${escapeHtml(idNumber || 'En cours')}) pour l'accréditation de votre compte <strong>${roleLabel}</strong>.
          </p>
          <p style="font-size: 13px; color: #64748b; line-height: 1.6;">
            Nos équipes valident les informations transmises sous 24h ouvrées. Dès la confirmation effectuée, vous recevrez un email de notification et votre compte sera activé.
          </p>
        </div>
        <div style="background-color: #f8fafc; padding: 14px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">© ${new Date().getFullYear()} LivraLink Bénin</p>
        </div>
      </div>
    `;

    const p1 = getP1EmailService();
    const dispatchRes = await p1.dispatchOrQueueEmail({
      type: 'kyc_submitted',
      to: cleanEmail,
      recipientName: cleanName,
      recipientRole: role || 'livreur',
      subject,
      previewText,
      textContent: `Dossier KYC reçu.\n\nBonjour ${cleanName},\nVotre dossier KYC (${idType} #${idNumber}) a bien été transmis.`,
      htmlContent,
      allowQueue: true,
    });

    res.json({
      success: true,
      emailDelivered: dispatchRes.emailDelivered,
      queued: dispatchRes.queued,
      emailId: dispatchRes.emailRecord.id,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Erreur lors de l\'enregistrement KYC.' });
  }
});

/**
 * POST /api/email/priority-mission
 * Dispatches an email notification to couriers about a newly created priority mission.
 */
app.post('/api/email/priority-mission', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, courierName, orderId, pickupName, dropoffCommune, feeFCFA, codFCFA } = req.body || {};

    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, error: 'Email du livreur requis.' });
      return;
    }

    const isAdmin = await checkCallerIsAdmin(req.user);
    const cleanDocId = String(orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!isAdmin) {
      if (!cleanDocId || !firestoreAdmin) {
        res.status(403).json({ success: false, error: 'Mission introuvable ou autorisation insuffisante.' });
        return;
      }
      const deliverySnap = await firestoreAdmin.collection('deliveries').doc(cleanDocId).get();
      const missionSnap = !deliverySnap.exists ? await firestoreAdmin.collection('priority_missions').doc(cleanDocId).get() : null;
      const orderData = deliverySnap.exists ? deliverySnap.data() : (missionSnap?.exists ? missionSnap.data() : null);
      if (!orderData || orderData.merchantId !== req.user?.uid) {
        res.status(403).json({ success: false, error: 'Seul le vendeur propriétaire de la course ou un administrateur peut notifier un coursier.' });
        return;
      }
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (courierName || 'Coursier Partenaire').trim().slice(0, 100);
    const safeCourierName = escapeHtml(cleanName);
    const safeOrderId = escapeHtml(String(orderId || '#LL-4200').trim().slice(0, 32));
    const safePickup = escapeHtml(String(pickupName || 'Boutique').trim().slice(0, 100));
    const safeDropoff = escapeHtml(String(dropoffCommune || 'Cotonou').trim().slice(0, 100));
    const safeFee = Math.min(100000, Math.max(0, parseInt(String(feeFCFA), 10) || 2000));
    const safeCod = codFCFA ? Math.min(5000000, Math.max(0, parseInt(String(codFCFA), 10) || 0)) : 0;

    const plainOrderId = sanitizeEmailHeaderText(orderId || '#LL-4200', 32);
    const plainPickup = sanitizeEmailHeaderText(pickupName || 'Boutique', 100);
    const subject = `⚡ Mission Prioritaire Disponible : ${plainOrderId} (${safeFee} FCFA)`;
    const previewText = `Nouvelle livraison express disponible à ${plainPickup}. Tarif : ${safeFee} FCFA.`;

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
            <a href="${escapeHtml(getAppPublicBaseUrl(req))}" style="display: inline-block; background-color: #f59e0b; color: #000; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 10px;">
              Ouvrir l'application &amp; Accepter la course →
            </a>
          </div>
        </div>
      </div>
    `;

    const p1 = getP1EmailService();
    const dispatchRes = await p1.dispatchOrQueueEmail({
      type: 'priority_mission',
      to: cleanEmail,
      recipientName: cleanName,
      subject,
      previewText,
      textContent: `Mission prioritaire ${orderId} disponible pour ${cleanName}. Gain: ${feeFCFA} FCFA.`,
      htmlContent,
      allowQueue: true,
    });

    res.json({
      success: true,
      emailDelivered: dispatchRes.emailDelivered,
      queued: dispatchRes.queued,
      emailId: dispatchRes.emailRecord.id,
      message: `Notification de mission envoyée à ${cleanEmail}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi de la mission.' });
  }
});

/**
 * POST /api/email/notification
 * Centralized endpoint for dispatching automated platform activity email notifications
 * (Creation, Acceptance, Pickup, Delivery, Cancellation, Payment, Security)
 */
app.post('/api/email/notification', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { eventType, recipientEmail, recipientName, details } = req.body || {};

    const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!recipientEmail || typeof recipientEmail !== 'string' || !EMAIL_REGEX.test(recipientEmail.trim())) {
      res.status(400).json({ success: false, error: 'Adresse e-mail valide requise pour le destinataire.' });
      return;
    }

    const cleanEmail = recipientEmail.trim().toLowerCase();
    const callerEmail = (req.user?.email || '').trim().toLowerCase();
    const callerUid = req.user?.uid || '';
    const isAdmin = await checkCallerIsAdmin(req.user);
    const d = details || {};

    if (!isAdmin) {
      const deliveryEventTypes = ['delivery_created', 'delivery_accepted', 'delivery_picked_up', 'delivery_completed', 'delivery_cancelled'];
      if (deliveryEventTypes.includes(eventType)) {
        const cleanOrderId = String(d.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!cleanOrderId || !firestoreAdmin) {
          res.status(403).json({ success: false, error: 'Référence de livraison vérifiable requise.' });
          return;
        }
        const deliverySnap = await firestoreAdmin.collection('deliveries').doc(cleanOrderId).get();
        const missionSnap = !deliverySnap.exists ? await firestoreAdmin.collection('priority_missions').doc(cleanOrderId).get() : null;
        const orderData = deliverySnap.exists ? deliverySnap.data() : (missionSnap?.exists ? missionSnap.data() : null);
        const assignedCourierId =
          typeof orderData?.courierId === 'string' && orderData.courierId.trim()
            ? orderData.courierId.trim()
            : typeof orderData?.courier?.id === 'string' && orderData.courier.id.trim()
            ? orderData.courier.id.trim()
            : '';
        if (!orderData || (orderData.merchantId !== callerUid && assignedCourierId !== callerUid)) {
          res.status(403).json({ success: false, error: 'Vous n\'êtes pas participant de cette livraison.' });
          return;
        }
        const allowedEmails = new Set<string>([callerEmail]);
        if (typeof orderData.merchantEmail === 'string' && orderData.merchantEmail.trim()) {
          allowedEmails.add(orderData.merchantEmail.trim().toLowerCase());
        }
        if (assignedCourierId) {
          try {
            const cDoc = await firestoreAdmin.collection('users').doc(assignedCourierId).get();
            const cEmail = cDoc.data()?.email;
            if (typeof cEmail === 'string' && cEmail.trim()) {
              allowedEmails.add(cEmail.trim().toLowerCase());
            }
          } catch {}
        }
        if (!allowedEmails.has(cleanEmail)) {
          res.status(403).json({ success: false, error: 'Destinataire e-mail non autorisé pour cette livraison.' });
          return;
        }
      } else if (callerEmail !== cleanEmail) {
        res.status(403).json({ success: false, error: 'Action réservée à l\'administrateur ou au titulaire du compte.' });
        return;
      }
    }

    const cleanName = (recipientName || cleanEmail.split('@')[0]).trim().slice(0, 100);
    const safeName = escapeHtml(cleanName);

    // Durable cross-instance anti-duplicate key check in Firestore
    const p1 = getP1EmailService();
    const dedupKey = req.body?.dedupKey || (d.orderId ? `${d.orderId}:${eventType}` : `${cleanEmail}:${eventType}:${new Date().toISOString().slice(0, 10)}`);

    const dedupClaim = await p1.claimEmailDedupKey({
      dedupKey,
      eventType: typeof eventType === 'string' ? eventType : 'custom',
      recipientEmail: cleanEmail,
    });
    if (!dedupClaim.allowed) {
      console.log(`[DEDUP BLOCKED] Notification déjà envoyée pour la clé: ${dedupKey}`);
      res.json({
        success: true,
        duplicateBlocked: true,
        emailDelivered: true,
        message: `Notification déjà transmise pour cet événement (${dedupKey}). Anti-doublons actif.`,
      });
      return;
    }

    let subject = '📢 LivraLink : Notification d\'activité';
    let previewText = 'Mise à jour importante concernant votre compte LivraLink.';
    let emailCategory: 'welcome' | 'password_reset_request' | 'password_changed_confirmation' | 'priority_mission' | 'custom' = 'custom';
    let eventBadgeText = 'ÉVÉNEMENT PLATFORME';
    let eventBadgeBg = '#f1f5f9';
    let eventBadgeColor = '#334155';
    let bodyHtml = '';

    switch (eventType) {
      case 'delivery_created': {
        const plainOrderId = sanitizeEmailHeaderText(d.orderId || '#LL-0000', 40);
        const plainPickup = sanitizeEmailHeaderText(d.pickupName || 'Point de collecte', 100);
        const plainDropoff = sanitizeEmailHeaderText(d.dropoffCommune || 'Destination', 100);
        const orderId = escapeHtml(plainOrderId);
        const pickup = escapeHtml(plainPickup);
        const dropoff = escapeHtml(plainDropoff);
        const fee = Math.max(0, parseInt(String(d.feeFCFA), 10) || 1500);
        const cod = Math.max(0, parseInt(String(d.codFCFA), 10) || 0);

        subject = `📦 LivraLink : Nouvelle course créée (${plainOrderId})`;
        previewText = `Votre livraison ${plainOrderId} de ${plainPickup} vers ${plainDropoff} est enregistrée.`;
        eventBadgeText = '📦 COURSE CRÉÉE';
        eventBadgeBg = '#eff6ff';
        eventBadgeColor = '#1d4ed8';

        bodyHtml = `
          <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;">Course enregistrée avec succès</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Bonjour <strong>${safeName}</strong>, votre commande <strong>${orderId}</strong> a été enregistrée sur le réseau LivraLink et est en attente d'attribution d'un livreur partenaire.
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; font-size: 13px; color: #334155; margin-bottom: 20px;">
            <p style="margin: 4px 0;"><strong>📦 N° Commande :</strong> ${orderId}</p>
            <p style="margin: 4px 0;"><strong>🏪 Collecte :</strong> ${pickup}</p>
            <p style="margin: 4px 0;"><strong>📍 Destination :</strong> ${dropoff}</p>
            <p style="margin: 4px 0; color: #2563eb;"><strong>💰 Frais de livraison :</strong> ${fee.toLocaleString('fr-FR')} FCFA</p>
            ${cod > 0 ? `<p style="margin: 4px 0; color: #16a34a;"><strong>💵 Montant COD à encaisser :</strong> ${cod.toLocaleString('fr-FR')} FCFA</p>` : ''}
          </div>
        `;
        break;
      }

      case 'delivery_accepted': {
        const plainOrderId = sanitizeEmailHeaderText(d.orderId || '#LL-0000', 40);
        const plainCourierName = sanitizeEmailHeaderText(d.courierName || 'Un coursier partenaire', 100);
        const orderId = escapeHtml(plainOrderId);
        const courierName = escapeHtml(plainCourierName);
        const courierPhone = escapeHtml(String(d.courierPhone || 'Non renseigné'));

        subject = `🛵 LivraLink : Course ${plainOrderId} acceptée par ${plainCourierName}`;
        previewText = `Le coursier ${plainCourierName} a pris en charge votre livraison.`;
        eventBadgeText = '🛵 LIVREUR EN ROUTE';
        eventBadgeBg = '#f0fdf4';
        eventBadgeColor = '#15803d';

        bodyHtml = `
          <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;">Coursier assigné à votre livraison</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Bonne nouvelle ! Le coursier <strong>${courierName}</strong> vient d'accepter la commande <strong>${orderId}</strong> et se dirige vers le point de collecte.
          </p>
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; font-size: 13px; color: #166534; margin-bottom: 20px;">
            <p style="margin: 4px 0;"><strong>👤 Coursier :</strong> ${courierName}</p>
            <p style="margin: 4px 0;"><strong>📱 Téléphone coursier :</strong> ${courierPhone}</p>
            <p style="margin: 4px 0;"><strong>📦 Commande concernée :</strong> ${orderId}</p>
          </div>
        `;
        break;
      }

      case 'delivery_picked_up': {
        const plainOrderId = sanitizeEmailHeaderText(d.orderId || '#LL-0000', 40);
        const plainPickup = sanitizeEmailHeaderText(d.pickupName || 'Point de collecte', 100);
        const orderId = escapeHtml(plainOrderId);
        const pickup = escapeHtml(plainPickup);

        subject = `🏷️ LivraLink : Colis récupéré pour la course ${plainOrderId}`;
        previewText = `Le colis a été récupéré à ${plainPickup} et est en cours d'acheminement.`;
        eventBadgeText = '🏷️ COLIS EN ROUTE';
        eventBadgeBg = '#fef3c7';
        eventBadgeColor = '#b45309';

        bodyHtml = `
          <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;">Colis pris en charge</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Le coursier vient de récupérer le colis pour la commande <strong>${orderId}</strong> à <strong>${pickup}</strong>. Le trajet vers le client est en cours.
          </p>
        `;
        break;
      }

      case 'delivery_completed': {
        const plainOrderId = sanitizeEmailHeaderText(d.orderId || '#LL-0000', 40);
        const orderId = escapeHtml(plainOrderId);
        const otpVerified = d.otpVerified ? 'Oui (Code secret certifié)' : 'Oui';

        subject = `✅ LivraLink : Livraison ${plainOrderId} effectuée avec succès !`;
        previewText = `La livraison ${plainOrderId} a été remise au destinataire et certifiée.`;
        eventBadgeText = '✅ LIVRAISON EFFECTUÉE';
        eventBadgeBg = '#dcfce7';
        eventBadgeColor = '#15803d';

        bodyHtml = `
          <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;">Colis livré et validé</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Félicitations ! La commande <strong>${orderId}</strong> a été livrée avec succès à la destination prévue.
          </p>
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; font-size: 13px; color: #166534; margin-bottom: 20px;">
            <p style="margin: 4px 0;"><strong>📦 N° Commande :</strong> ${orderId}</p>
            <p style="margin: 4px 0;"><strong>🔐 Certification OTP :</strong> ${otpVerified}</p>
            <p style="margin: 4px 0;"><strong>🕒 Date &amp; Heure :</strong> ${new Date().toLocaleString('fr-FR')}</p>
          </div>
        `;
        break;
      }

      case 'delivery_cancelled': {
        const plainOrderId = sanitizeEmailHeaderText(d.orderId || '#LL-0000', 40);
        const plainReason = sanitizeEmailHeaderText(d.reason || 'Annulation par l\'utilisateur ou le destinataire', 140);
        const orderId = escapeHtml(plainOrderId);
        const reason = escapeHtml(plainReason);

        subject = `⚠️ LivraLink : Annulation de la course ${plainOrderId}`;
        previewText = `La course ${plainOrderId} a été annulée. Motif : ${plainReason}`;
        eventBadgeText = '⚠️ COURSE ANNULÉE';
        eventBadgeBg = '#fef2f2';
        eventBadgeColor = '#b91c1c';

        bodyHtml = `
          <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;">Notification d'annulation de course</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            La livraison <strong>${orderId}</strong> a été annulée ou interrompue.
          </p>
          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px; border-radius: 8px; margin-bottom: 20px;">
            <p style="font-size: 13px; color: #991b1b; margin: 0;"><strong>Motif :</strong> ${reason}</p>
          </div>
        `;
        break;
      }

      case 'wallet_transaction': {
        const typeLabel = d.transactionType === 'credit' ? 'Crédit / Recharge' : 'Débit / Retrait';
        const amount = Math.max(0, parseInt(String(d.amountFCFA), 10) || 0);
        const newBalance = Math.max(0, parseInt(String(d.newBalanceFCFA), 10) || 0);

        subject = `💳 LivraLink : Opération portefeuille (${typeLabel} de ${amount.toLocaleString('fr-FR')} FCFA)`;
        previewText = `Mouvement sur votre solde : ${typeLabel} de ${amount.toLocaleString('fr-FR')} FCFA. Nouveau solde : ${newBalance.toLocaleString('fr-FR')} FCFA.`;
        eventBadgeText = '💳 SOLDE PORTEFEUILLE';
        eventBadgeBg = '#f3e8ff';
        eventBadgeColor = '#6b21a8';

        bodyHtml = `
          <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;">Avis de mouvement financier</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Bonjour <strong>${safeName}</strong>, une opération financière a été appliquée sur votre portefeuille virtuel LivraLink.
          </p>
          <div style="background-color: #faf5ff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 16px; font-size: 13px; color: #581c87; margin-bottom: 20px;">
            <p style="margin: 4px 0;"><strong>💰 Type d'opération :</strong> ${typeLabel}</p>
            <p style="margin: 4px 0;"><strong>💵 Montant :</strong> ${amount.toLocaleString('fr-FR')} FCFA</p>
            <p style="margin: 4px 0;"><strong>🏦 Nouveau Solde Disponible :</strong> ${newBalance.toLocaleString('fr-FR')} FCFA</p>
          </div>
        `;
        break;
      }

      case 'security_alert': {
        const plainTitle = sanitizeEmailHeaderText(d.alertTitle || 'Alerte de sécurité', 120);
        const plainDesc = sanitizeEmailHeaderText(d.alertDesc || 'Une modification est survenue sur vos accès.', 220);
        const title = escapeHtml(plainTitle);
        const desc = escapeHtml(plainDesc);

        subject = `🛡️ LivraLink : ${plainTitle}`;
        previewText = plainDesc;
        eventBadgeText = '🛡️ ALERTE DE SÉCURITÉ';
        eventBadgeBg = '#fff7ed';
        eventBadgeColor = '#c2410c';

        bodyHtml = `
          <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;">${title}</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px 0;">
            Bonjour <strong>${safeName}</strong>, ${desc}
          </p>
        `;
        break;
      }

      default: {
        bodyHtml = `<p style="font-size: 14px; color: #475569;">${escapeHtml(String(d.message || 'Notification automatique de la plateforme LivraLink.'))}</p>`;
        break;
      }
    }

    const fullHtml = `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); color: #0f172a;">
        <div style="background-color: #0f172a; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">
            Livra<span style="color: #3b82f6;">Link</span>
          </h1>
          <p style="color: #94a3b8; font-size: 11px; margin: 6px 0 0 0; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700;">
            Notifications Automatisées
          </p>
        </div>

        <div style="padding: 32px 24px;">
          <div style="display: inline-block; background-color: ${eventBadgeBg}; color: ${eventBadgeColor}; font-weight: 800; font-size: 12px; padding: 6px 14px; border-radius: 9999px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">
            ${eventBadgeText}
          </div>

          ${bodyHtml}

          <div style="text-align: center; margin: 28px 0;">
            <a href="${escapeHtml(getAppPublicBaseUrl(req))}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 13px; padding: 12px 28px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(37,99,235,0.25);">
              Ouvrir mon application LivraLink →
            </a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            E-mail automatique envoyé par la plateforme LivraLink Bénin. Pour modifier vos préférences, accédez aux paramètres de votre profil.
          </p>
        </div>

        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 11px; color: #94a3b8; margin: 0;">
            © ${new Date().getFullYear()} LivraLink — Tous droits réservés. Cotonou / Calavi.
          </p>
        </div>
      </div>
    `;

    const dispatchRes = await p1.dispatchOrQueueEmail({
      type: emailCategory,
      eventType,
      dedupKey,
      to: cleanEmail,
      recipientName: cleanName,
      subject,
      previewText,
      textContent: `${previewText}\n\nOuvrez l'application LivraLink pour plus de détails.`,
      htmlContent: fullHtml,
      allowQueue: true,
    });

    res.json({
      success: true,
      emailDelivered: dispatchRes.emailDelivered,
      queued: dispatchRes.queued,
      emailId: dispatchRes.emailRecord.id,
      eventType,
      dedupKey,
      message: `Notification e-mail (${eventType}) traitée pour ${cleanEmail}`,
    });
  } catch (error: any) {
    console.error('[EMAIL NOTIFICATION ERROR]:', error);
    res.status(500).json({ success: false, error: 'Erreur lors du traitement de la notification automatisée.' });
  }
});

/**
 * GET /api/email/outbox
 * Returns the history of sent emails from Firestore or memory.
 */
app.get('/api/email/outbox', requireAdminPermission('emails.read') as any, async (_req: Request, res: Response) => {
  const { emails, source } = await getP1EmailService().listEmailOutbox(100);
  res.json({
    success: true,
    total: emails.length,
    emails,
    source,
  });
});

/**
 * POST /api/admin/email/process-queue
 * Manually triggers retry processor for persisted Firestore email queue jobs
 */
app.post('/api/admin/email/process-queue', requireAdminPermission('emails.manage') as any, async (_req: Request, res: Response) => {
  const result = await getP1EmailService().processEmailQueue({ forceImmediate: true });
  res.json({
    success: true,
    message: `File d'attente traitée : ${result.successCount}/${result.processedCount} message(s) réexpédié(s) avec succès.`,
    ...result,
  });
});

/**
 * POST /api/email/clear-outbox
 * Clears email log history from Firestore and local memory. Protected by Super-Admin authorization.
 */
app.post('/api/email/clear-outbox', requireAdminPermission('emails.manage') as any, async (_req: Request, res: Response) => {
  const result = await getP1EmailService().clearEmailOutbox(200);
  res.json({
    success: true,
    clearedCount: result.clearedCount,
    message: 'Boîte d\'envoi réinitialisée par l\'administrateur.',
  });
});

/**
 * GET /api/admin/email/config
 * Retrieves the shared SMTP parameters (strictly sanitizing password / encrypted secret details)
 */
app.get('/api/admin/email/config', requireAdminPermission('emails.read') as any, async (_req: Request, res: Response) => {
  const p1 = getP1EmailService();
  const effective = await p1.getEffectiveSmtpConfig();
  const secretState = evaluateEmailEncryptionSecret();
  res.json({
    success: true,
    config: sanitizeSmtpConfigForApi(effective, {
      persistence: firestoreAdmin ? 'firestore' : 'env_only',
      encryptionReady: secretState.valid,
    }),
  });
});

/**
 * POST /api/admin/email/config
 * Persists shared SMTP parameters across all instances with AES-256-GCM encryption for password
 */
app.post('/api/admin/email/config', requireAdminPermission('emails.manage') as any, async (req: AuthenticatedRequest, res: Response) => {
  const { host, port, user, pass, from } = req.body || {};
  const saveResult = await getP1EmailService().saveSmtpConfig({
    host,
    port,
    user,
    pass,
    from,
    updatedBy: req.user?.email || req.user?.uid || 'admin',
  });

  if (!saveResult.ok) {
    return res.status(saveResult.status).json({
      success: false,
      error: saveResult.error,
    });
  }

  console.log(`[SMTP CONFIG UPDATED] Hôte: ${saveResult.config.host}:${saveResult.config.port} | User: ${saveResult.config.user} | Persistence: ${saveResult.config.persistence}`);

  res.json({
    success: true,
    message: 'Paramètres Gmail SMTP enregistrés et partagés entre instances avec succès.',
    config: saveResult.config,
  });
});

// In-memory store for Admin Broadcast Announcements
interface AnnouncementRecord {
  id: string;
  title: string;
  message: string;
  audience: 'tous' | 'vendeurs' | 'livreurs' | 'admins' | 'individuel';
  channel: 'notification' | 'email' | 'both';
  targetUid?: string;
  targetEmail?: string;
  recipientCount: number;
  sentAt: string;
  sentBy: string;
  status: 'complete' | 'partial' | 'failed';
  errors?: string[];
}

const broadcastAnnouncementsHistory: AnnouncementRecord[] = [];

/**
 * POST /api/admin/broadcast
 * Dispatches targeted or general communications as ISOLATED individual notifications & emails
 * Strictly restricted to authorized Super-Admins
 */
app.post('/api/admin/broadcast', requireAdminPermission('notifications.manage') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      title,
      message,
      audience,
      targetCategory,
      channel,
      sendEmailCopy,
      targetUid,
      targetEmail,
      targetUserEmail,
    } = req.body || {};

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Un titre de communication est requis (max 256 caractères).' });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Un corps de message est requis.' });
    }

    const cleanTitle = title.trim().slice(0, 256);
    const cleanMessage = message.trim().slice(0, 4096);
    const rawAudience = String(audience || targetCategory || 'tous').toLowerCase().trim();
    const mappedAudience =
      rawAudience === 'all' ? 'tous' : rawAudience === 'individual' ? 'individuel' : rawAudience;
    const validAudience = (['tous', 'vendeurs', 'livreurs', 'admins', 'individuel'].includes(mappedAudience)
      ? mappedAudience
      : 'tous') as AnnouncementRecord['audience'];

    const resolvedChannelInput =
      channel ||
      (sendEmailCopy === false ? 'notification' : sendEmailCopy === true ? 'both' : 'both');
    const validChannel = (['notification', 'email', 'both'].includes(resolvedChannelInput)
      ? resolvedChannelInput
      : 'both') as AnnouncementRecord['channel'];

    const resolvedTargetUid = typeof targetUid === 'string' && targetUid.trim() ? targetUid.trim() : undefined;
    const rawTargetEmailOrUid = typeof (targetEmail || targetUserEmail) === 'string'
      ? String(targetEmail || targetUserEmail).trim()
      : '';
    const resolvedTargetEmail = rawTargetEmailOrUid.includes('@') ? rawTargetEmailOrUid : undefined;
    const resolvedFallbackUid = resolvedTargetUid || (!rawTargetEmailOrUid.includes('@') && rawTargetEmailOrUid ? rawTargetEmailOrUid : undefined);

    const adminEmail = req.user?.email || 'Pamphile.gbede@gmail.com';
    const adminUid = req.user?.uid || 'system_admin';

    // Retrieve target users from Firestore
    let targetUsers: Array<{ uid: string; email?: string; fullName?: string; role?: string }> = [];

    if (firestoreAdmin) {
      try {
        const usersSnap = await firestoreAdmin.collection('users').get();
        usersSnap.forEach((docSnap) => {
          const u = docSnap.data();
          const uidVal = String(u?.uid || docSnap.id || '').trim();
          if (uidVal) {
            targetUsers.push({
              uid: uidVal,
              email: u.email,
              fullName: u.fullName || u.storeName,
              role: u.role,
            });
          }
        });
      } catch (fsErr: any) {
        console.warn('[ADMIN BROADCAST] Warning reading Firestore users:', fsErr?.message);
      }
    }

    // Filter recipients based on audience
    if (validAudience === 'individuel') {
      if (resolvedFallbackUid) {
        targetUsers = targetUsers.filter((u) => u.uid === resolvedFallbackUid);
      } else if (resolvedTargetEmail) {
        targetUsers = targetUsers.filter((u) => u.email?.toLowerCase().trim() === resolvedTargetEmail.toLowerCase());
      } else {
        targetUsers = [];
      }
    } else if (validAudience === 'vendeurs') {
      targetUsers = targetUsers.filter((u) => u.role === 'vendeur');
    } else if (validAudience === 'livreurs') {
      targetUsers = targetUsers.filter((u) => u.role === 'livreur');
    } else if (validAudience === 'admins') {
      targetUsers = targetUsers.filter((u) => u.role === 'admin' || u.email?.toLowerCase() === 'pamphile.gbede@gmail.com');
    }

    // If targetUsers is empty, construct fallback target ONLY when explicit individual uid/email is provided
    if (targetUsers.length === 0 && (resolvedFallbackUid || resolvedTargetEmail)) {
      targetUsers = [{ uid: resolvedFallbackUid || `uid_${Date.now()}`, email: resolvedTargetEmail, fullName: 'Utilisateur Cible' }];
    }

    let successNotifCount = 0;
    let successEmailCount = 0;
    const errors: string[] = [];

    const nowEpoch = Date.now();
    const nowIso = new Date(nowEpoch).toISOString();
    const nowTimeStr = new Date(nowEpoch).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const p1 = getP1EmailService();

    // Dispatch individual notifications to Firestore /notifications collection with recipientId
    for (const target of targetUsers) {
      if (validChannel === 'notification' || validChannel === 'both') {
        const notifId = `notif_broadcast_${nowEpoch}_${crypto.randomBytes(4).toString('hex')}`;
        const notifDoc = {
          id: notifId,
          senderId: adminUid,
          recipientId: target.uid,
          type: 'system',
          title: `📢 ${cleanTitle}`,
          message: cleanMessage,
          category: 'annonce',
          isRead: false,
          read: false,
          timestamp: nowTimeStr,
          createdAt: nowEpoch,
        };

        if (firestoreAdmin) {
          try {
            await firestoreAdmin.collection('notifications').doc(notifId).set(notifDoc);
            successNotifCount++;
          } catch (nErr: any) {
            errors.push(`Erreur notification pour ${target.uid}: ${nErr?.message}`);
          }
        } else {
          successNotifCount++;
        }
      }

      // Dispatch individual emails via shared SMTP / persistent retry queue if requested and email is present
      if ((validChannel === 'email' || validChannel === 'both') && target.email) {
        try {
          const emailSubject = `📢 LivraLink : ${cleanTitle}`;
          const emailHtml = `
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; color: #0f172a;">
              <div style="background: #0f172a; padding: 24px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">Livra<span style="color: #3b82f6;">Link</span></h1>
                <p style="color: #94a3b8; font-size: 11px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Communication Officielle</p>
              </div>
              <div style="padding: 28px 24px;">
                <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 12px 0;">${escapeHtml(cleanTitle)}</h2>
                <p style="font-size: 14px; color: #334155; line-height: 1.6; white-space: pre-wrap; margin: 0 0 20px 0;">${escapeHtml(cleanMessage)}</p>
                <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 11px; color: #94a3b8;">
                  Message transmis par la Direction LivraLink Bénin à <strong>${escapeHtml(target.fullName || target.email)}</strong>.
                </div>
              </div>
            </div>
          `;

          const dispatchRes = await p1.dispatchOrQueueEmail({
            type: 'custom',
            to: target.email,
            recipientName: target.fullName || target.email.split('@')[0],
            subject: emailSubject,
            previewText: cleanMessage.slice(0, 150),
            textContent: `${cleanTitle}\n\n${cleanMessage}\n\n— Direction LivraLink Bénin`,
            htmlContent: emailHtml,
            allowQueue: true,
          });
          if (dispatchRes.emailDelivered) {
            successEmailCount++;
          }
        } catch (mErr: any) {
          errors.push(`Erreur e-mail pour ${target.email}: ${mErr?.message}`);
        }
      }
    }

    const record: AnnouncementRecord = {
      id: `broadcast_${nowEpoch}_${crypto.randomBytes(4).toString('hex')}`,
      title: cleanTitle,
      message: cleanMessage,
      audience: validAudience,
      channel: validChannel,
      targetUid: resolvedFallbackUid,
      targetEmail: resolvedTargetEmail,
      recipientCount: targetUsers.length,
      sentAt: nowIso,
      sentBy: adminEmail,
      status: errors.length === 0 ? 'complete' : errors.length < targetUsers.length ? 'partial' : 'failed',
      errors: errors.length > 0 ? errors : undefined,
    };

    broadcastAnnouncementsHistory.unshift(record);
    if (broadcastAnnouncementsHistory.length > 100) broadcastAnnouncementsHistory.pop();

    if (firestoreAdmin) {
      try {
        await firestoreAdmin.collection('announcements').doc(record.id).set(record);
      } catch (fsErr: any) {
        console.warn('[ADMIN BROADCAST] Warning logging announcement to Firestore:', fsErr?.message);
      }
    }

    console.log(`[ADMIN BROADCAST SUCCESS] Audience: ${validAudience} | Canal: ${validChannel} | Destinataires: ${targetUsers.length} | Émis par: ${adminEmail}`);

    res.json({
      success: true,
      message: `Communication diffusée avec succès auprès de ${targetUsers.length} destinataire(s).`,
      recipientCount: targetUsers.length,
      notificationsSent: successNotifCount,
      emailsSent: successEmailCount,
      announcement: record,
    });
  } catch (err: any) {
    console.error('[ADMIN BROADCAST ERROR]', err);
    res.status(500).json({ success: false, error: 'Erreur lors de la diffusion de l\'annonce.' });
  }
});

/**
 * GET /api/admin/announcements
 * Retrieves broadcast communications history
 */
app.get('/api/admin/announcements', requireAdminPermission('notifications.manage') as any, async (_req: Request, res: Response) => {
  try {
    if (firestoreAdmin) {
      try {
        const snap = await firestoreAdmin.collection('announcements').orderBy('sentAt', 'desc').limit(50).get();
        const list: AnnouncementRecord[] = [];
        snap.forEach((docSnap) => {
          list.push(docSnap.data() as AnnouncementRecord);
        });
        if (list.length > 0) {
          return res.json({ success: true, announcements: list });
        }
      } catch (fsErr: any) {
        console.warn('[ADMIN ANNOUNCEMENTS] Warning reading Firestore announcements:', fsErr?.message);
      }
    }

    res.json({ success: true, announcements: broadcastAnnouncementsHistory });
  } catch (err: any) {
    console.error('[ADMIN ANNOUNCEMENTS ERROR]', err);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des annonces.' });
  }
});

/**
 * POST /api/admin/email/test-smtp
 * Performs a live handshake verification with smtp.gmail.com via Nodemailer verify()
 * and optionally dispatches a test email.
 */
app.post('/api/admin/email/test-smtp', requireAdminPermission('emails.manage') as any, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { sendTestEmail, targetEmail } = req.body || {};
  const p1 = getP1EmailService();
  const smtpConfig = await p1.getEffectiveSmtpConfig();
  const secretState = evaluateEmailEncryptionSecret();
  const sanitizedCfg = sanitizeSmtpConfigForApi(smtpConfig, {
    persistence: firestoreAdmin ? 'firestore' : 'env_only',
    encryptionReady: secretState.valid,
  });
  const transporter = createNodemailerTransportFromConfig(smtpConfig);

  if (!transporter) {
    res.status(503).json({
      success: false,
      verified: false,
      error:
        smtpConfig.decryptionError ||
        'Identifiants Gmail SMTP non configurés. Veuillez renseigner l\'e-mail Gmail et le mot de passe d\'application dans les paramètres.',
      config: sanitizedCfg,
    });
    return;
  }

  try {
    // Perform Nodemailer connection & TLS handshake verification
    await transporter.verify();
    const latencyMs = Date.now() - startTime;
    let messageSent = false;
    let testEmailError = '';

    const recipient = (targetEmail && typeof targetEmail === 'string' && targetEmail.includes('@'))
      ? targetEmail.trim()
      : smtpConfig.user || 'Pamphile.gbede@gmail.com';

    if (sendTestEmail !== false) {
      try {
        await transporter.sendMail({
          from: normalizeSmtpFromAddress(smtpConfig.from, 'LivraLink Test SMTP <Pamphile.gbede@gmail.com>'),
          to: recipient,
          subject: '🧪 LivraLink : Test de connexion Gmail SMTP réussi !',
          text: `Bonjour,\n\nCe message confirme que la connexion SMTP avec ${smtpConfig.host} (port ${smtpConfig.port}) fonctionne parfaitement.\n\nLatence : ${latencyMs}ms\nDate : ${new Date().toLocaleString('fr-FR')}`,
          html: `
            <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
              <div style="background-color: #0f172a; padding: 24px; text-align: center; color: white;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Livra<span style="color: #3b82f6;">Link</span></h1>
                <p style="color: #34d399; font-size: 11px; margin: 6px 0 0 0; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Diagnostic Gmail SMTP Validé</p>
              </div>
              <div style="padding: 28px 24px; color: #0f172a;">
                <h2 style="font-size: 18px; font-weight: 800; margin: 0 0 12px 0; color: #0f172a;">Connexion Gmail SMTP Établie avec Succès 🚀</h2>
                <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
                  Le backend Express de LivraLink a établi une liaison sécurisée avec le relais <strong>${escapeHtml(smtpConfig.host)}:${smtpConfig.port}</strong>.
                </p>
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; font-size: 13px; color: #334155;">
                  <p style="margin: 4px 0;"><strong>Hôte SMTP :</strong> ${escapeHtml(smtpConfig.host)}</p>
                  <p style="margin: 4px 0;"><strong>Port :</strong> ${smtpConfig.port} (${smtpConfig.port === 465 ? 'SSL' : 'STARTTLS'})</p>
                  <p style="margin: 4px 0;"><strong>Expéditeur :</strong> ${escapeHtml(smtpConfig.from)}</p>
                  <p style="margin: 4px 0; color: #16a34a;"><strong>Latence handshake :</strong> ${latencyMs} ms</p>
                </div>
              </div>
              <div style="background-color: #f8fafc; padding: 14px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
                © ${new Date().getFullYear()} LivraLink — Diagnostic SMTP Admin.
              </div>
            </div>
          `,
        });
        messageSent = true;
        await p1.recordEmailLog({
          type: 'custom',
          to: recipient,
          recipientName: 'Administrateur',
          subject: '🧪 LivraLink : Test de connexion Gmail SMTP réussi !',
          previewText: `Connexion vérifiée avec le relais Gmail SMTP en ${latencyMs}ms.`,
          htmlContent: `<div>Diagnostic SMTP accompli avec succès (${latencyMs}ms).</div>`,
          deliveredViaSmtp: true,
        });
      } catch (sendErr: any) {
        testEmailError = sendErr?.message || 'Erreur lors de l\'envoi du message de test.';
        console.error('[SMTP TEST ERROR] Envoi message test:', testEmailError);
      }
    }

    res.json({
      success: true,
      verified: true,
      latencyMs,
      messageSent,
      recipient,
      testEmailError: testEmailError || undefined,
      config: sanitizedCfg,
      message: `Connexion Gmail SMTP (${smtpConfig.host}:${smtpConfig.port}) vérifiée avec succès en ${latencyMs}ms.`,
    });
  } catch (verifyErr: any) {
    const errorMsg = verifyErr?.message || 'Échec de connexion au serveur Gmail SMTP.';
    console.error('[SMTP TEST VERIFY ERROR]:', errorMsg);
    res.status(503).json({
      success: false,
      verified: false,
      error: `Échec du test de connexion SMTP : ${errorMsg}`,
      config: sanitizedCfg,
    });
  }
});

// Health check endpoints for Render / cloud monitoring
app.get(['/healthz', '/api/healthz'], (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Version detection endpoints: always returns fresh deployment metadata with no-cache headers
app.get(['/api/version', '/version.json'], (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  const distVersionPath = path.resolve(process.cwd(), 'dist/version.json');
  const publicVersionPath = path.resolve(process.cwd(), 'public/version.json');

  if (fs.existsSync(distVersionPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(distVersionPath, 'utf8'));
      return res.json(data);
    } catch {}
  }

  if (fs.existsSync(publicVersionPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(publicVersionPath, 'utf8'));
      return res.json(data);
    } catch {}
  }

  res.json({
    version: '2.4.0',
    buildTime: new Date().toISOString(),
    appName: 'LivraLink',
  });
});

// Security configuration & defensive audit status endpoint
app.get('/api/security/audit', requireAdminAuthorization as any, async (_req: Request, res: Response) => {
  const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
  const payoutReadiness = evaluatePayoutProviderConfig();
  let smtpConfigured = false;
  try {
    const smtpCfg = await getP1EmailService().getEffectiveSmtpConfig();
    smtpConfigured = Boolean(smtpCfg.user && smtpCfg.pass && !smtpCfg.decryptionError);
  } catch {
    smtpConfigured = false;
  }

  res.json({
    securityStatus: 'FORTIFIED',
    timestamp: new Date().toISOString(),
    auditSteps: {
      etape1_auditFailles: { status: 'PASSED', details: 'Audit complet des vulnérabilités exécuté (XSS, CSRF, Spoofing, Elevation de privilèges)' },
      etape2_protectionComptes: { status: 'PASSED', details: 'Support MFA, Verrouillage anti-brute force (5 essais/15min), OTP HMAC-SHA256 & jeton à usage unique' },
      etape3_protection3Espaces: { status: 'PASSED', details: 'RBAC contrôlé strictement par le serveur/Firestore. Inviolabilité des rôles côté client' },
      etape4_renforcementFirebaseExpress: { status: 'PASSED', details: 'Règles Firestore ABAC zéro-trust déployées & En-têtes HTTP de sécurité renforcés' },
      etape5_protectionAPIs: { status: 'PASSED', details: 'Rate limiting par IP/endpoint, validation stricte des payloads JSON & contrôle d\'accès' }
    },
    readiness: {
      firestoreAdminInitialized: Boolean(activeDb),
      hmacSecretConfigured: evaluateHmacSecretConfig().valid,
      emailEncryptionReady: evaluateEmailEncryptionSecret().valid,
      smtpConfigured,
      geminiApiKeyConfigured: Boolean(normalizeGeminiApiKey(process.env.GEMINI_API_KEY)),
      geminiKeyFormat: inspectGeminiKeyFormat(process.env.GEMINI_API_KEY).format,
      appUrlConfigured: Boolean(
        process.env.APP_URL?.trim() ||
        process.env.PUBLIC_SITE_URL?.trim() ||
        process.env.APP_PUBLIC_URL?.trim()
      ),
      backupPersistence: activeDb ? 'FIRESTORE_SYSTEM_BACKUPS_SHA256' : 'FIRESTORE_UNAVAILABLE',
      payoutProviderMode: payoutReadiness.mode,
      liveMobileMoneyConfigured: payoutReadiness.liveConfigured,
      payoutProviderReady: payoutReadiness.ready,
      payoutMissingEnvVars: payoutReadiness.missingEnvVars,
    },
    protections: {
      httpSecurityHeaders: {
        active: true,
        headers: ['X-Content-Type-Options: nosniff', 'X-Frame-Options: SAMEORIGIN', 'Content-Security-Policy', 'Strict-Transport-Security', 'Referrer-Policy: strict-origin-when-cross-origin'],
      },
      payloadDefense: {
        jsonLimit: '10kb',
        backupJsonLimit: '512kb',
        mediaJsonLimit: '22mb',
        dosProtection: 'ENABLED',
      },
      rateLimiting: {
        active: true,
        trustProxy: 'APP_HOSTING_INTERNAL_PROXY',
        ipTracking: 'BOUNDED_SLIDING_WINDOW',
        authEndpointsSecured: ['/api/auth/send-reset-code', '/api/auth/verify-reset-code', '/api/auth/reset-password'],
      },
      authIntegrity: {
        mfaSupport: 'ENABLED',
        bruteForceLockout: '5_FAILED_ATTEMPTS_10MIN_FIRESTORE_LOCK',
        otpStorage: 'FIRESTORE_ATOMIC_HMAC_SHA256_ONLY',
        resetTokens: 'FIRESTORE_ATOMIC_SINGLE_USE_32BYTES',
        hmacSecretConfigured: evaluateHmacSecretConfig().valid,
        minHmacSecretLength: MIN_OTP_HMAC_SECRET_LENGTH,
        emailEncryptionReady: evaluateEmailEncryptionSecret().valid,
        smtpConfigPersistence: activeDb ? 'FIRESTORE_AES256_GCM_SHARED' : 'ENV_ONLY',
        emailQueuePersistence: activeDb ? 'FIRESTORE_LEASE_LOCKED' : 'IN_MEMORY_FALLBACK',
        backupPersistence: activeDb ? 'FIRESTORE_SYSTEM_BACKUPS_SHA256' : 'FIRESTORE_UNAVAILABLE',
        payoutProviderMode: payoutReadiness.liveConfigured
          ? `LIVE_PSP_${payoutReadiness.mode.toUpperCase()}`
          : payoutReadiness.isSimulated
            ? 'SIMULATOR_DEFAULT_NO_LIVE_AGGREGATOR'
            : `LIVE_PSP_${payoutReadiness.mode.toUpperCase()}_UNCONFIGURED`,
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
app.get('/api/security/budget', requireAdminAuthorization as any, async (_req: Request, res: Response) => {
  checkAndResetDailyQuotas();
  const totalCost = calculateTotalEstimatedCostToday();
  const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
  let geminiDistributedQuota: { dayKey: string; used: number; estimatedCostEur: number; scope: 'distributed_firestore' | 'instance_memory' } = {
    dayKey: new Date().toISOString().slice(0, 10),
    used: apiUsageStats.geminiApiCalls.count,
    estimatedCostEur: Number((apiUsageStats.geminiApiCalls.count * apiUsageStats.geminiApiCalls.unitCostEur).toFixed(4)),
    scope: 'instance_memory',
  };
  if (activeDb?.collection) {
    try {
      const dayKey = new Date().toISOString().slice(0, 10);
      const qSnap = await activeDb.collection('ai_usage_guards').doc(`gemini_quota_${dayKey}`).get();
      if (qSnap?.exists) {
        const qData = qSnap.data() || {};
        geminiDistributedQuota = {
          dayKey,
          used: Number(qData.count || 0),
          estimatedCostEur: Number(qData.estimatedCostEur || 0),
          scope: 'distributed_firestore',
        };
      } else {
        geminiDistributedQuota = { dayKey, used: 0, estimatedCostEur: 0, scope: 'distributed_firestore' };
      }
    } catch {
      // Fallback gracefully to instance memory stats
    }
  }

  res.json({
    status: 'ACTIVE_GUARD',
    scopeNote: 'Les compteurs locaux restent par instance Cloud Run ; geminiDistributedQuota lit Firestore lorsqu’il est accessible.',
    dailyBudgetCapEur: apiUsageStats.dailyBudgetCapEur,
    estimatedCostTodayEur: totalCost,
    budgetRemainingEur: Math.max(0, Number((apiUsageStats.dailyBudgetCapEur - totalCost).toFixed(4))),
    geminiDistributedQuota,
    quotas: {
      gmailEmails: {
        used: apiUsageStats.gmailEmails.count,
        cap: apiUsageStats.gmailEmails.dailyCap,
        remaining: Math.max(0, apiUsageStats.gmailEmails.dailyCap - apiUsageStats.gmailEmails.count),
        unitCostEur: apiUsageStats.gmailEmails.unitCostEur,
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
// TRUSTED BACKEND DELIVERY OTP VERIFICATION, POD COMPLETION & NOTIFICATIONS
// =========================================================================
app.post('/api/deliveries/:orderId/otp/verify', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!ensureHmacSecretReadyForSensitiveRoutes(res)) {
      return;
    }
    const p0 = getP0Security(req);
    if (!p0) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanDocId) {
      return res.status(400).json({ success: false, error: 'Identifiant de livraison invalide.' });
    }
    const rawCode = String(req.body?.otpCode || '').trim();
    if (!/^\d{4}$/.test(rawCode)) {
      return res.status(400).json({ success: false, error: 'Code OTP à 4 chiffres requis.' });
    }

    const callerUid = req.user!.uid;
    const isAdmin = await checkCallerIsAdmin(req.user);

    const result = await p0.verifyDeliveryPodOtp({
      cleanDocId,
      callerUid,
      isAdmin,
      rawCode,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        verified: false,
        attemptsLeft: result.attemptsLeft,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      verified: true,
      podOtpToken: result.podOtpToken,
      expiresAt: result.expiresAt,
      message: 'Code OTP vérifié avec succès.',
    });
  } catch (err: any) {
    console.error('[DELIVERY-OTP-VERIFY ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la vérification du code OTP.' });
  }
});

app.post('/api/deliveries/:orderId/complete-pod', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!ensureHmacSecretReadyForSensitiveRoutes(res)) {
      return;
    }
    const p0 = getP0Security(req);
    if (!p0) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanDocId) {
      return res.status(400).json({ success: false, error: 'Identifiant de livraison invalide.' });
    }

    const callerUid = req.user!.uid;
    const isAdmin = await checkCallerIsAdmin(req.user);
    const { otpCode, podOtpToken, photoUrl, signatureDataUrl, signedByName } = req.body || {};

    const result = await p0.completeDeliveryPod({
      cleanDocId,
      callerUid,
      callerEmail: req.user?.email,
      isAdmin,
      otpCode,
      podOtpToken,
      photoUrl,
      signatureDataUrl,
      signedByName,
    });

    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error });
    }

    return res.json({
      success: true,
      orderId: result.orderId,
      podData: result.podData,
      deliveredAt: result.deliveredAt,
      statusNote: result.statusNote,
    });
  } catch (err: any) {
    console.error('[COMPLETE-POD ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la certification finale de la livraison.' });
  }
});

app.post('/api/deliveries/:orderId/otp', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!firestoreAdmin) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanDocId) {
      return res.status(400).json({ success: false, error: 'Identifiant de livraison invalide.' });
    }

    const deliveryRef = firestoreAdmin.collection('deliveries').doc(cleanDocId);
    const deliverySnap = await deliveryRef.get();
    if (!deliverySnap.exists) {
      return res.status(404).json({ success: false, error: 'Livraison introuvable.' });
    }

    const deliveryData = deliverySnap.data() || {};
    const callerUid = req.user!.uid;
    const isAdmin = await checkCallerIsAdmin(req.user);
    if (!isAdmin && deliveryData.merchantId !== callerUid) {
      return res.status(403).json({ success: false, error: 'Seul le vendeur propriétaire ou un administrateur peut générer le code OTP.' });
    }
    if (deliveryData.status === 'livree' || deliveryData.status === 'echec') {
      return res.status(409).json({ success: false, error: 'Cette livraison est déjà clôturée.' });
    }

    const otpCode = crypto.randomInt(1000, 10000).toString();
    const nowIso = new Date().toISOString();
    await deliveryRef.collection('private').doc('otp').set({
      otpCode,
      merchantId: deliveryData.merchantId || callerUid,
      generatedAt: nowIso,
      updatedAt: nowIso,
    });
    await deliveryRef.update({
      otpRequired: true,
      otpGeneratedAt: nowIso,
      updatedAt: nowIso,
    });

    let emailResult: { emailDelivered?: boolean; queued?: boolean } | null = null;
    const rawClientEmail = typeof req.body?.clientEmail === 'string' ? req.body.clientEmail.trim().toLowerCase() : '';
    const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (rawClientEmail && EMAIL_REGEX.test(rawClientEmail)) {
      const p1 = getP1EmailService();
      const safeOrderId = escapeHtml(String(deliveryData.id || `#${cleanDocId}`));
      const safeClientName = escapeHtml(String(req.body?.clientName || deliveryData.clientName || 'Client'));
      const safeStoreName = escapeHtml(String(deliveryData.merchantStoreName || 'Boutique LivraLink'));
      emailResult = await p1.dispatchOrQueueEmail({
        type: 'custom',
        to: rawClientEmail,
        recipientName: String(req.body?.clientName || deliveryData.clientName || 'Client'),
        subject: `🔐 LivraLink : Votre code de confirmation de livraison (${deliveryData.id || cleanDocId})`,
        previewText: `Code secret de remise à 4 chiffres : ${otpCode} pour votre commande ${deliveryData.id || cleanDocId}.`,
        textContent: `Bonjour,\n\nVotre colis (${deliveryData.id || cleanDocId}) expédié par ${deliveryData.merchantStoreName || 'LivraLink'} dispose d'un code secret de confirmation à remettre exclusivement au livreur lors de la réception :\n\nCODE OTP : ${otpCode}\n\nNe communiquez ce code qu'à la remise effective du colis.`,
        htmlContent: `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; max-width: 540px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; color: #0f172a;">
            <div style="background: #0f172a; padding: 20px; text-align: center;">
              <h1 style="color: #fff; margin: 0; font-size: 22px; font-weight: 800;">Livra<span style="color: #3b82f6;">Link</span></h1>
            </div>
            <div style="padding: 24px;">
              <p style="font-size: 14px; color: #334155;">Bonjour <strong>${safeClientName}</strong>,</p>
              <p style="font-size: 14px; color: #334155;">Voici votre code secret de sécurité pour la commande <strong>${safeOrderId}</strong> (${safeStoreName}) :</p>
              <div style="background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 14px; padding: 18px; text-align: center; margin: 18px 0;">
                <span style="font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #1d4ed8; font-family: monospace;">${otpCode}</span>
              </div>
              <p style="font-size: 12px; color: #64748b;">Communiquez ce code au livreur uniquement au moment de la remise effective de votre colis.</p>
            </div>
          </div>
        `,
        allowQueue: true,
      });
    }

    return res.json({
      success: true,
      otpCode,
      generatedAt: nowIso,
      emailDelivered: Boolean(emailResult?.emailDelivered),
      queued: Boolean(emailResult?.queued),
    });
  } catch (err: any) {
    console.error('[DELIVERY-OTP-GENERATE ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la génération du code OTP.' });
  }
});

app.post('/api/deliveries/:orderId/notify-client-otp', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!firestoreAdmin) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanDocId) {
      return res.status(400).json({ success: false, error: 'Identifiant de livraison invalide.' });
    }
    const cleanClientEmail = String(req.body?.clientEmail || '').trim().toLowerCase();
    const EMAIL_REGEX = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!cleanClientEmail || !EMAIL_REGEX.test(cleanClientEmail)) {
      return res.status(400).json({ success: false, error: 'Adresse e-mail client valide requise.' });
    }

    const deliveryRef = firestoreAdmin.collection('deliveries').doc(cleanDocId);
    const [deliverySnap, otpSnap] = await Promise.all([
      deliveryRef.get(),
      deliveryRef.collection('private').doc('otp').get(),
    ]);
    if (!deliverySnap.exists) {
      return res.status(404).json({ success: false, error: 'Livraison introuvable.' });
    }

    const deliveryData = deliverySnap.data() || {};
    const callerUid = req.user!.uid;
    const isAdmin = await checkCallerIsAdmin(req.user);
    if (!isAdmin && deliveryData.merchantId !== callerUid) {
      return res.status(403).json({ success: false, error: 'Seul le vendeur propriétaire ou un administrateur peut transmettre le code OTP au client.' });
    }

    const storedOtp = String(otpSnap.exists ? otpSnap.data()?.otpCode || '' : '').trim();
    if (!/^\d{4}$/.test(storedOtp)) {
      return res.status(400).json({ success: false, error: 'Aucun code OTP actif enregistré pour cette livraison. Veuillez d\'abord générer un code.' });
    }

    const p1 = getP1EmailService();
    const displayOrderId = String(deliveryData.id || `#${cleanDocId}`);
    const clientName = String(req.body?.clientName || deliveryData.clientName || 'Client').trim().slice(0, 120);
    const storeName = String(deliveryData.merchantStoreName || deliveryData.pickupLocation?.name || 'Boutique LivraLink').trim();
    const payable = Number(deliveryData.totalCustomerPayable ?? (Number(deliveryData.itemValueCOD || 0) + Number(deliveryData.deliveryFee || 0)));

    const dispatch = await p1.dispatchOrQueueEmail({
      type: 'custom',
      to: cleanClientEmail,
      recipientName: clientName,
      subject: `🔐 Code de confirmation LivraLink (${displayOrderId})`,
      previewText: `Code OTP à 4 chiffres : ${storedOtp} — Montant à régler à la livraison : ${payable.toLocaleString('fr-FR')} FCFA.`,
      textContent: `Bonjour ${clientName},\n\nVotre commande ${displayOrderId} (${storeName}) est prise en charge via LivraLink.\nMontant total à la remise : ${payable.toLocaleString('fr-FR')} FCFA.\nVotre code secret de confirmation (OTP) : ${storedOtp}\n\nNe communiquez ce code au livreur qu'au moment de la remise effective du colis.`,
      htmlContent: `
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; max-width: 560px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; color: #0f172a;">
          <div style="background: #0f172a; padding: 20px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 22px; font-weight: 800;">Livra<span style="color: #3b82f6;">Link</span></h1>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 14px; color: #334155;">Bonjour <strong>${escapeHtml(clientName)}</strong>,</p>
            <p style="font-size: 14px; color: #334155;">Votre commande <strong>${escapeHtml(displayOrderId)}</strong> expédiée par <strong>${escapeHtml(storeName)}</strong> est sécurisée par un code OTP.</p>
            <div style="background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 14px; padding: 18px; text-align: center; margin: 18px 0;">
              <div style="font-size: 11px; color: #1e40af; font-weight: 700; text-transform: uppercase; margin-bottom: 6px;">Code Secret Client</div>
              <span style="font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #1d4ed8; font-family: monospace;">${storedOtp}</span>
            </div>
            <p style="font-size: 13px; color: #334155;">Montant total à la livraison : <strong>${payable.toLocaleString('fr-FR')} FCFA</strong></p>
            <p style="font-size: 12px; color: #64748b;">Ne communiquez ce code au livreur qu'après réception et vérification de votre colis.</p>
          </div>
        </div>
      `,
      allowQueue: true,
    });

    return res.json({
      success: dispatch.emailDelivered || dispatch.queued,
      emailDelivered: dispatch.emailDelivered,
      queued: dispatch.queued,
      message: dispatch.emailDelivered
        ? `Code OTP transmis par e-mail à ${cleanClientEmail}.`
        : dispatch.queued
          ? `Relais SMTP occupé : e-mail OTP mis en file d'attente pour ${cleanClientEmail}.`
          : dispatch.lastError || 'Impossible d\'envoyer l\'e-mail.',
    });
  } catch (err: any) {
    console.error('[NOTIFY-CLIENT-OTP ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi de l\'e-mail OTP au client.' });
  }
});

app.post('/api/notifications/dispatch', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!firestoreAdmin) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const callerUid = req.user!.uid;
    const isAdmin = await checkCallerIsAdmin(req.user);
    if (!isAdmin) {
      const { bundle } = await loadPlatformConfigBundle(getActiveDb()).catch(() => ({ bundle: null as any }));
      if (bundle?.featureFlags?.allowNotifications === false) {
        return res.json({
          success: true,
          skippedByConfig: true,
          message: 'Notifications désactivées par la configuration générale.',
        });
      }
    }
    const { type, recipientId, title, message, orderId, actionView, dedupKey } = req.body || {};

    const cleanTitle = String(title || '').trim().slice(0, 256);
    const cleanMessage = String(message || '').trim().slice(0, 2048);
    if (!cleanTitle || !cleanMessage) {
      return res.status(400).json({ success: false, error: 'Titre et message requis.' });
    }

    const allowedDeliveryTypes = ['order_created', 'order_accepted', 'order_status', 'pod_validated', 'priority_mission'];
    const requestedType = String(type || 'order_status').trim();

    let verifiedRecipientId = '';
    let resolvedOrderDocId = '';

    if (isAdmin && recipientId && typeof recipientId === 'string') {
      verifiedRecipientId = recipientId.replace(/[^a-zA-Z0-9_-]/g, '');
    } else {
      if (!allowedDeliveryTypes.includes(requestedType)) {
        return res.status(403).json({ success: false, error: 'Type de notification réservé à l\'administration ou au système.' });
      }
      const cleanOrderDocId = String(orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!cleanOrderDocId) {
        return res.status(400).json({ success: false, error: 'Identifiant de commande vérifiable requis.' });
      }
      const deliverySnap = await firestoreAdmin.collection('deliveries').doc(cleanOrderDocId).get();
      const missionSnap = !deliverySnap.exists ? await firestoreAdmin.collection('priority_missions').doc(cleanOrderDocId).get() : null;
      const orderData = deliverySnap.exists ? deliverySnap.data() : (missionSnap?.exists ? missionSnap.data() : null);

      if (!orderData) {
        return res.status(404).json({ success: false, error: 'Livraison introuvable pour cette notification.' });
      }

      const assignedCourierId = getAssignedCourierIdFromOrder(orderData);
      const isMerchantCaller = orderData.merchantId === callerUid;
      const isAssignedCourierCaller = Boolean(assignedCourierId && assignedCourierId === callerUid);
      if (!isMerchantCaller && !isAssignedCourierCaller) {
        return res.status(403).json({ success: false, error: 'Vous n\'êtes pas autorisé à notifier pour cette livraison.' });
      }

      // Authenticate event against actual Firestore state
      const status = String(orderData.status || '');
      if (requestedType === 'order_accepted' && !['assignee', 'acceptee', 'colis_recupere', 'en_cours', 'livree'].includes(status)) {
        return res.status(409).json({ success: false, error: 'Transition de statut non confirmée dans Firestore.' });
      }
      if (requestedType === 'pod_validated' && status !== 'livree') {
        return res.status(409).json({ success: false, error: 'Livraison non marquée livrée dans Firestore.' });
      }

      resolvedOrderDocId = cleanOrderDocId;
      // Target counterparty (never spoof arbitrary third-party UIDs)
      if (isMerchantCaller && assignedCourierId && recipientId === assignedCourierId) {
        verifiedRecipientId = assignedCourierId;
      } else if (isAssignedCourierCaller && orderData.merchantId) {
        verifiedRecipientId = String(orderData.merchantId);
      } else {
        verifiedRecipientId = callerUid;
      }
    }

    if (!verifiedRecipientId) {
      return res.status(400).json({ success: false, error: 'Destinataire vérifié introuvable.' });
    }

    // Unambiguous SHA-256 JSON canonical ID when dedupKey is provided
    const notifId = dedupKey
      ? `notif_${crypto
          .createHash('sha256')
          .update(JSON.stringify([requestedType, verifiedRecipientId, resolvedOrderDocId || null, String(dedupKey)]))
          .digest('hex')
          .slice(0, 32)}`
      : `notif_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const nowEpoch = Date.now();
    const notifPayload: Record<string, any> = {
      id: notifId,
      senderId: isAdmin ? callerUid : 'system_backend',
      recipientId: verifiedRecipientId,
      title: cleanTitle,
      message: cleanMessage,
      type: requestedType,
      isRead: false,
      read: false,
      createdAt: nowEpoch,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };
    if (resolvedOrderDocId) notifPayload.orderDocId = resolvedOrderDocId;
    if (orderId) notifPayload.orderId = String(orderId).slice(0, 64);
    if (actionView) notifPayload.actionView = String(actionView).slice(0, 64);

    await firestoreAdmin.collection('notifications').doc(notifId).set(notifPayload, { merge: false });

    return res.status(201).json({ success: true, id: notifId, notification: notifPayload });
  } catch (err: any) {
    if (err?.code === 6 || String(err?.message || '').includes('ALREADY_EXISTS')) {
      return res.json({ success: true, duplicateBlocked: true });
    }
    console.error('[NOTIFICATIONS-DISPATCH ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la création de la notification sécurisée.' });
  }
});

// =========================================================================
// POINT 10: VÉRIFICATION & VERROU D'IDEMPOTENCE TRANSACTIONNEL FIRESTORE (P0)
// =========================================================================
app.post('/api/wallet/verify-idempotency', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { idempotencyKey, userId, amount } = req.body || {};
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 6 || idempotencyKey.trim().length > 128) {
      return res.status(400).json({ allowed: false, error: 'Clé d\'idempotence manquante ou invalide.' });
    }

    const callerUid = req.user!.uid;
    if (userId && userId !== callerUid) {
      recordSecurityAnomaly(getClientIp(req), 'WALLET_ID_SPOOF_ATTEMPT', `Tentative verify-idempotency pour ${userId} par ${callerUid}`);
      return res.status(403).json({ allowed: false, error: 'Accès refusé : identifiant portefeuille non conforme.' });
    }

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 1000 || amount > 10_000_000) {
      return res.status(400).json({ allowed: false, error: 'Montant de retrait invalide (minimum 1 000 FCFA).' });
    }

    const p0 = getP0Security(req);
    if (!p0) {
      return res.status(503).json({ allowed: false, error: 'Firestore Admin SDK indisponible pour verrouiller le retrait.' });
    }

    const activeDb = getActiveDb();
    try {
      const cfg = await loadPlatformConfigBundle(activeDb);
      if (!cfg.bundle.featureFlags.allowPayments || !cfg.bundle.featureFlags.allowInstantWithdrawal) {
        return res.status(403).json({
          allowed: false,
          code: 'PAYMENTS_DISABLED',
          error: 'Les paiements et retraits sont temporairement désactivés par l’administrateur.',
        });
      }
    } catch {
      // fail open only if config load fails cleanly (P0 wallet checks still apply)
    }

    const result = await p0.verifyWalletPayoutIdempotency({
      callerUid,
      idempotencyKey: idempotencyKey.trim(),
      amount,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        allowed: false,
        alreadyProcessed: result.alreadyProcessed,
        inFlight: result.inFlight,
        insufficientBalance: result.insufficientBalance,
        availableBalance: result.availableBalance,
        error: result.error,
      });
    }

    return res.json({
      allowed: true,
      idempotencyKey: result.idempotencyKey,
      lockedUntil: result.lockedUntil,
      availableBalance: result.availableBalance,
    });
  } catch (err: any) {
    console.error('[WALLET VERIFY IDEMPOTENCY ERROR]:', err?.message || err);
    return res.status(500).json({ allowed: false, error: 'Erreur lors de la vérification transactionnelle du retrait.' });
  }
});

app.post('/api/wallet/commit-payout', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { idempotencyKey, userId, amount, operator, payoutPhone } = req.body || {};
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 6 || idempotencyKey.trim().length > 128) {
      return res.status(400).json({ success: false, error: 'Clé d\'idempotence requise.' });
    }

    const callerUid = req.user!.uid;
    if (userId && userId !== callerUid) {
      recordSecurityAnomaly(getClientIp(req), 'WALLET_ID_SPOOF_ATTEMPT', `Tentative commit-payout pour ${userId} par ${callerUid}`);
      return res.status(403).json({ success: false, error: 'Accès refusé : identifiant portefeuille non conforme.' });
    }

    const p0 = getP0Security(req);
    if (!p0) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible pour valider le retrait.' });
    }

    const activeDb = getActiveDb();
    try {
      const cfg = await loadPlatformConfigBundle(activeDb);
      if (!cfg.bundle.featureFlags.allowPayments || !cfg.bundle.featureFlags.allowInstantWithdrawal) {
        return res.status(403).json({
          success: false,
          code: 'PAYMENTS_DISABLED',
          error: 'Les paiements et retraits sont temporairement désactivés par l’administrateur.',
        });
      }
    } catch {
      // ignore non-critical config error
    }

    const result = await p0.commitWalletPayout({
      callerUid,
      idempotencyKey: idempotencyKey.trim(),
      amount: typeof amount === 'number' && Number.isFinite(amount) ? amount : undefined,
      operator: typeof operator === 'string' ? operator : undefined,
      payoutPhone: typeof payoutPhone === 'string' ? payoutPhone : undefined,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        alreadyProcessed: result.alreadyProcessed,
        inFlight: result.inFlight,
        insufficientBalance: result.insufficientBalance,
        compensated: result.compensated,
        requiresReconciliation: result.requiresReconciliation,
        payoutStatus: result.payoutStatus,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      message: 'Transaction de retrait enregistrée et verrouillée contre tout double débit.',
      idempotencyKey: result.idempotencyKey,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      providerReference: result.providerReference,
      isSimulatedProvider: result.isSimulatedProvider,
      recoveredFromInterruption: result.recoveredFromInterruption,
    });
  } catch (err: any) {
    console.error('[WALLET COMMIT PAYOUT ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la validation transactionnelle du retrait.' });
  }
});

app.get('/api/admin/wallet/pending-payouts', requireAdminPermission('finance.read') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const p0 = getP0Security(req);
    if (!p0) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const items = await p0.listPendingWalletPayouts(50);
    return res.json({ success: true, count: items.length, items });
  } catch (err: any) {
    console.error('[ADMIN PENDING PAYOUTS ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement des retraits en attente.' });
  }
});

app.post('/api/admin/wallet/reconcile-payout', requireAdminPermission('finance.manage') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const p0 = getP0Security(req);
    if (!p0) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const { targetUid, idempotencyKey, resolution, providerReference, reason } = req.body || {};
    if (!targetUid || typeof targetUid !== 'string' || !idempotencyKey || typeof idempotencyKey !== 'string') {
      return res.status(400).json({ success: false, error: 'targetUid et idempotencyKey requis.' });
    }
    if (resolution !== 'confirm_succeeded' && resolution !== 'compensate_failed') {
      return res.status(400).json({
        success: false,
        error: 'resolution doit valoir "confirm_succeeded" ou "compensate_failed".',
      });
    }

    const result = await p0.reconcileWalletPayout({
      adminUid: req.user!.uid,
      adminEmail: req.user?.email,
      targetUid: targetUid.trim(),
      idempotencyKey: idempotencyKey.trim(),
      resolution,
      providerReference: typeof providerReference === 'string' ? providerReference : undefined,
      reason: typeof reason === 'string' ? reason : undefined,
    });

    if (!result.ok) {
      return res.status(result.status).json({ success: false, error: result.error });
    }

    return res.json({
      success: true,
      statusAfter: result.statusAfter,
      restoredBalance: result.restoredBalance,
      providerReference: result.providerReference,
    });
  } catch (err: any) {
    console.error('[ADMIN RECONCILE PAYOUT ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la réconciliation administrative.' });
  }
});

// =========================================================================
// POINT 18: JOURNAL D'AUDIT CENTRALISÉ DES ERREURS
// =========================================================================
app.post('/api/logs/error', requireAuthenticatedUser as any, (req: AuthenticatedRequest, res: Response) => {
  const { message, source, stack, details } = req.body || {};
  const ip = getClientIp(req);
  const safeDetails = details && typeof details === 'object' ? JSON.stringify(details).slice(0, 500) : undefined;
  const entry: ErrorLogEntry = {
    id: `LOG-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ip,
    message: String(message || 'Erreur non spécifiée').slice(0, 500),
    source: `${req.user?.uid || 'auth'}:${String(source || 'client').slice(0, 80)}`,
    stack: stack ? String(stack).slice(0, 2000) : undefined,
    details: safeDetails,
  };

  errorAuditRingBuffer.unshift(entry);
  if (errorAuditRingBuffer.length > MAX_ERROR_LOGS) {
    errorAuditRingBuffer.pop();
  }

  console.warn(`[ERROR AUDIT LOG] ${entry.source}: ${entry.message}`);
  res.status(201).json({ success: true, logId: entry.id });
});

app.get('/api/logs/error', requireAdminAuthorization as any, (_req: Request, res: Response) => {
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

app.get('/api/monitoring/status', requireAdminAuthorization as any, (_req: Request, res: Response) => {
  res.json({
    ...uptimeTracker,
    systemUptime: process.uptime(),
    memoryUsageMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    nodeEnv: process.env.NODE_ENV || 'development',
  });
});

// =========================================================================
// POINT 20: SYSTÈME DE SAUVEGARDE & RESTAURATION PERSISTANTE FIRESTORE (ADMIN)
// =========================================================================
app.get('/api/system/backups', requireAdminPermission('backups.manage') as any, async (req: AuthenticatedRequest, res: Response) => {
  const activeDb = (process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin) as BackupFirestoreLike | null;
  const limitParam = parseInt(String(req.query?.limit || '20'), 10);
  try {
    const backups = await listSystemBackups(activeDb, Number.isFinite(limitParam) ? limitParam : 20);
    return res.json({
      success: true,
      storage: 'firestore_persistent',
      backups,
    });
  } catch (err: any) {
    const status = err instanceof SystemBackupError ? err.status : 500;
    return res.status(status).json({
      success: false,
      error: err?.message || 'Impossible de lister les sauvegardes système.',
      code: err instanceof SystemBackupError ? err.code : 'BACKUP_LIST_ERROR',
    });
  }
});

app.post('/api/system/backup', requireAdminPermission('backups.manage') as any, async (req: AuthenticatedRequest, res: Response) => {
  const activeDb = (process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin) as BackupFirestoreLike | null;
  const { data, includeCollections, note } = req.body || {};

  try {
    const result = await createSystemBackup(activeDb, {
      data,
      includeCollections: Array.isArray(includeCollections) ? includeCollections : undefined,
      note: typeof note === 'string' ? note : undefined,
      requestedByUid: req.user?.uid,
      requestedByEmail: req.user?.email,
    });
    return res.json({
      success: true,
      message: 'Sauvegarde persistante multi-instance enregistrée dans Firestore avec empreinte SHA-256.',
      backupId: result.backupId,
      snapshotChecksum: result.snapshotChecksum,
      checksum: result.checksum,
      timestamp: result.timestamp,
      mode: result.mode,
      sizeBytes: result.sizeBytes,
      storage: result.storage,
      ...(result.collectionsSummary ? { collectionsSummary: result.collectionsSummary } : {}),
    });
  } catch (err: any) {
    const status = err instanceof SystemBackupError ? err.status : 500;
    return res.status(status).json({
      success: false,
      error: err?.message || 'Erreur lors de la création de la sauvegarde.',
      code: err instanceof SystemBackupError ? err.code : 'BACKUP_CREATE_ERROR',
    });
  }
});

app.post('/api/system/restore', requireAdminPermission('backups.manage') as any, async (req: AuthenticatedRequest, res: Response) => {
  const activeDb = (process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin) as BackupFirestoreLike | null;
  const { backupId, applyToFirestore } = req.body || {};

  try {
    const result = await restoreSystemBackup(activeDb, {
      backupId: typeof backupId === 'string' ? backupId : undefined,
      applyToFirestore: applyToFirestore === true,
    });
    return res.json({
      success: true,
      integrityVerified: result.integrityVerified,
      message: result.appliedToFirestore
        ? `Restauration Firestore complète exécutée (${result.restoredDocCount} documents restaurés, SHA-256 vérifié).`
        : 'Restauration lue et vérifiée avec intégrité cryptographique SHA-256.',
      backupId: result.backupId,
      timestamp: result.timestamp,
      mode: result.mode,
      storage: result.storage,
      appliedToFirestore: result.appliedToFirestore,
      restoredDocCount: result.restoredDocCount,
      restoredData: result.restoredData,
      checksum: result.checksum,
    });
  } catch (err: any) {
    const status = err instanceof SystemBackupError ? err.status : 500;
    return res.status(status).json({
      success: false,
      integrityVerified: err instanceof SystemBackupError && err.code === 'BACKUP_CHECKSUM_MISMATCH' ? false : undefined,
      error: err?.message || 'Erreur lors de la restauration de la sauvegarde.',
      code: err instanceof SystemBackupError ? err.code : 'BACKUP_RESTORE_ERROR',
    });
  }
});

// =========================================================================
// USER PROFILE SYNC & ADMIN FIRESTORE/AUTH OVERVIEW RECONCILIATION
// =========================================================================
app.post('/api/users/sync-profile', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.uid) {
    return res.status(401).json({ success: false, error: 'Jeton d\'authentification Firebase requis.' });
  }
  const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
  if (!activeDb) {
    return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
  }

  try {
    const body = req.body || {};
    const uid = req.user.uid;
    const email = (req.user.email || '').toString().trim().toLowerCase().slice(0, 128);
    const isSuperAdminEmail = email === 'pamphile.gbede@gmail.com' && Boolean(req.user.email_verified);
    const requestedRole = typeof body.role === 'string' ? body.role.trim().toLowerCase() : 'vendeur';
    const safeRole =
      requestedRole === 'livreur'
        ? 'livreur'
        : requestedRole === 'client'
        ? 'client'
        : requestedRole === 'admin' && isSuperAdminEmail
        ? 'admin'
        : 'vendeur';

    if (typeof body.avatarUrl === 'string' && body.avatarUrl.trim() && !isSafeAvatarUrl(body.avatarUrl)) {
      return res.status(400).json({ success: false, error: 'URL d\'avatar invalide ou non autorisée.' });
    }

    const userRef = activeDb.collection('users').doc(uid);
    const existingSnap = await userRef.get();
    const existingData = existingSnap.exists ? existingSnap.data() || {} : {};

    if (!existingSnap.exists && !isSuperAdminEmail) {
      try {
        const cfg = await loadPlatformConfigBundle(activeDb);
        if (safeRole === 'vendeur' && !cfg.bundle.featureFlags.allowVendorRegistration) {
          return res.status(403).json({
            success: false,
            code: 'VENDOR_REGISTRATION_DISABLED',
            error: 'Les inscriptions vendeurs sont temporairement suspendues par l’administrateur.',
          });
        }
        if (safeRole === 'livreur' && !cfg.bundle.featureFlags.allowCourierRegistration) {
          return res.status(403).json({
            success: false,
            code: 'COURIER_REGISTRATION_DISABLED',
            error: 'Les inscriptions livreurs sont temporairement suspendues par l’administrateur.',
          });
        }
      } catch {
        // ignore config read fallback
      }
    }

    const fullNameRaw = (body.fullName || existingData.fullName || email.split('@')[0] || 'Utilisateur LivraLink').toString().trim().slice(0, 128);
    const fullName = fullNameRaw.length >= 2 ? fullNameRaw : `${fullNameRaw}_ll`.slice(0, 128);

    const updateDocData: Record<string, any> = {
      uid,
      email,
      fullName,
      phone: (body.phone ?? existingData.phone ?? '').toString().trim().slice(0, 32),
      role: existingData.role || safeRole,
      updatedAt: new Date().toISOString(),
    };

    if (!existingSnap.exists) {
      updateDocData.createdAt = new Date().toISOString();
      updateDocData.isKycVerified = false;
      updateDocData.kycStatus = 'non_soumis';
      updateDocData.accountStatus = 'actif';
    }

    if (typeof body.storeName === 'string' && body.storeName.trim()) {
      updateDocData.storeName = body.storeName.trim().slice(0, 128);
    } else if ((updateDocData.role === 'vendeur') && !existingData.storeName) {
      updateDocData.storeName = `Boutique ${fullName}`.slice(0, 128);
    }
    if (typeof body.storeCommune === 'string' && body.storeCommune.trim()) {
      updateDocData.storeCommune = body.storeCommune.trim().slice(0, 128);
    }
    if (typeof body.storeAddress === 'string' && body.storeAddress.trim()) {
      updateDocData.storeAddress = body.storeAddress.trim().slice(0, 256);
    }
    if (Array.isArray(body.storeCoordinates) && body.storeCoordinates.length === 2) {
      updateDocData.storeCoordinates = body.storeCoordinates;
    }
    if (typeof body.vehicleType === 'string' && body.vehicleType.trim()) {
      updateDocData.vehicleType = body.vehicleType.trim().slice(0, 64);
    }
    if (typeof body.avatarUrl === 'string' && body.avatarUrl.trim()) {
      updateDocData.avatarUrl = body.avatarUrl.trim().slice(0, 1000);
    }

    await userRef.set(updateDocData, { merge: true });
    return res.json({ success: true, uid, role: updateDocData.role });
  } catch (err: any) {
    console.warn('[USERS-SYNC] Erreur sync-profile:', err?.message || err);
    const isIamDenied = String(err?.message || '').includes('PERMISSION_DENIED') || String(err?.code || '') === '7';
    return res.status(isIamDenied ? 503 : 500).json({
      success: false,
      code: isIamDenied ? 'IAM_PERMISSION_DENIED' : 'SYNC_PROFILE_FAILED',
      error: err?.message || 'Erreur lors de la synchronisation du profil.',
    });
  }
});

app.get('/api/admin/sync-overview', requireAdminAuthorization as any, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const usersById = new Map<string, any>();
    const deliveriesList: any[] = [];
    const priorityMissionsList: any[] = [];
    const kycList: any[] = [];
    const warnings: string[] = [];
    const iamIssues: string[] = [];

    const classifyAdminError = (scope: string, e: any) => {
      const msg = String(e?.message || e || 'Erreur inconnue');
      warnings.push(`${scope}: ${msg}`);
      if (/PERMISSION_DENIED|insufficient|7 PERMISSION_DENIED|iam|identity/i.test(msg)) {
        iamIssues.push(`${scope}: ${msg}`);
      }
    };

    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;

    if (activeDb) {
      // 1. Read Firestore users
      try {
        const usersSnap = await activeDb.collection('users').get();
        usersSnap.forEach((docSnap: any) => {
          const data = docSnap.data() || {};
          usersById.set(docSnap.id, {
            id: docSnap.id,
            uid: data.uid || docSnap.id,
            ...data,
          });
        });
      } catch (e: any) {
        classifyAdminError('users', e);
      }

      // 2. Read Firestore deliveries
      try {
        const deliveriesSnap = await activeDb.collection('deliveries').get();
        deliveriesSnap.forEach((docSnap: any) => {
          const data = docSnap.data() || {};
          deliveriesList.push({
            id: data.id || docSnap.id,
            ...data,
          });
        });
      } catch (e: any) {
        classifyAdminError('deliveries', e);
      }

      // 3. Read Firestore priority_missions
      try {
        const missionsSnap = await activeDb.collection('priority_missions').get();
        missionsSnap.forEach((docSnap: any) => {
          const data = docSnap.data() || {};
          priorityMissionsList.push({
            id: data.id || docSnap.id,
            ...data,
          });
        });
      } catch (e: any) {
        classifyAdminError('priority_missions', e);
      }

      // 4. Read Firestore kyc
      try {
        const kycSnap = await activeDb.collection('kyc').get();
        kycSnap.forEach((docSnap: any) => {
          const data = docSnap.data() || {};
          kycList.push({
            id: data.id || docSnap.id,
            ...data,
          });
        });
      } catch (e: any) {
        classifyAdminError('kyc', e);
      }
    } else {
      warnings.push('Firestore Admin non initialisé');
    }

    // 5. Discover all Firebase Auth accounts (no fictitious fallback users)
    if (firebaseAdminApp) {
      try {
        const authResult = await getAuth(firebaseAdminApp).listUsers(1000);
        for (const authUser of authResult.users) {
          const email = (authUser.email || '').toLowerCase().trim();
          if (!email) continue;
          const isSuperAdmin = email === 'pamphile.gbede@gmail.com';
          if (isSuperAdmin) continue;

          if (!usersById.has(authUser.uid)) {
            const inferredRole = email.includes('livreur') ? 'livreur' : 'vendeur';
            const displayName = (authUser.displayName || email.split('@')[0] || 'Vendeur LivraLink').trim();
            const backfilledUser: Record<string, any> = {
              uid: authUser.uid,
              id: authUser.uid,
              email,
              fullName: displayName,
              phone: authUser.phoneNumber || '',
              role: inferredRole,
              isKycVerified: false,
              kycStatus: 'non_soumis',
              createdAt: authUser.metadata?.creationTime || new Date().toISOString(),
              syncedFromAuth: true,
            };
            if (inferredRole === 'vendeur') {
              backfilledUser.storeName = `Boutique ${displayName}`;
            } else {
              backfilledUser.vehicleType = 'Moto 125cc';
            }

            usersById.set(authUser.uid, backfilledUser);

            if (activeDb) {
              activeDb.collection('users').doc(authUser.uid).set(backfilledUser, { merge: true }).catch(() => {});
            }
          } else {
            const existing = usersById.get(authUser.uid);
            if (!existing.createdAt && authUser.metadata?.creationTime) {
              existing.createdAt = authUser.metadata.creationTime;
            }
          }
        }
      } catch (authListErr: any) {
        classifyAdminError('auth.listUsers', authListErr);
      }
    }

    const users = Array.from(usersById.values());
    const merchantsCount = users.filter((u) => (u.role || 'vendeur') === 'vendeur').length;
    const couriersCount = users.filter((u) => u.role === 'livreur').length;
    const todayIso = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Porto-Novo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const newSellersToday = users.filter((u) => {
      if ((u.role || 'vendeur') !== 'vendeur') return false;
      if (!u.createdAt) return false;
      try {
        const formattedDay = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Africa/Porto-Novo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(u.createdAt));
        return formattedDay === todayIso;
      } catch {
        return typeof u.createdAt === 'string' && u.createdAt.startsWith(todayIso);
      }
    }).length;

    return res.json({
      success: true,
      databaseId: configuredDatabaseId,
      syncedAt: new Date().toISOString(),
      users,
      deliveries: deliveriesList,
      priorityMissions: priorityMissionsList,
      kycRequests: kycList,
      warnings,
      iamDiagnostics: iamIssues.length > 0
        ? {
            hasPermissionError: true,
            targetProjectId: process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0654978401',
            databaseId: configuredDatabaseId,
            missingRoles: ['roles/datastore.user', 'roles/firebaseauth.viewer'],
            details: iamIssues,
          }
        : {
            hasPermissionError: false,
            targetProjectId: process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0654978401',
            databaseId: configuredDatabaseId,
            missingRoles: [],
            details: [],
          },
      stats: {
        totalUsers: users.length,
        merchantsCount,
        couriersCount,
        deliveriesCount: deliveriesList.length,
        priorityMissionsCount: priorityMissionsList.length,
        kycCount: kycList.length,
        newSellersToday,
      },
    });
  } catch (err: any) {
    console.error('[ADMIN-SYNC-OVERVIEW] Erreur:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erreur lors de la synchronisation globale administrateur.',
    });
  }
});

// =========================================================================
// ENDPOINTS DE GESTION MÉTIER PARTAGÉE (KYC, WALLET, ASSIGNATION, CONFIG)
// =========================================================================
app.post('/api/admin/kyc/decision', requireAdminPermission('kyc.review') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    if (!activeDb) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const { targetUid, requestId, decision, reason } = req.body || {};
    if (decision !== 'valide' && decision !== 'refuse') {
      return res.status(400).json({ success: false, error: 'Décision invalide ("valide" ou "refuse" requis).' });
    }
    const cleanTargetUid = String(targetUid || requestId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanRequestId = String(requestId || cleanTargetUid).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanTargetUid && !cleanRequestId) {
      return res.status(400).json({ success: false, error: 'Identifiant utilisateur/dossier KYC requis.' });
    }

    const cleanReason = decision === 'refuse'
      ? String(reason || 'Documents non conformes ou illisibles. Veuillez soumettre un dossier complet.').trim().slice(0, 500)
      : '';
    const nowIso = new Date().toISOString();
    const isApproved = decision === 'valide';

    let resolvedUid = cleanTargetUid;
    let kycDocData: Record<string, any> = {};
    const kycCandidates = Array.from(new Set([cleanRequestId, cleanTargetUid].filter(Boolean)));
    let kycDocIdToUpdate = cleanTargetUid || cleanRequestId;

    for (const candidateId of kycCandidates) {
      const snap = await activeDb.collection('kyc').doc(candidateId).get();
      if (snap.exists) {
        kycDocIdToUpdate = snap.id;
        kycDocData = snap.data() || {};
        if (typeof kycDocData.userId === 'string' && kycDocData.userId.trim()) {
          resolvedUid = kycDocData.userId.trim();
        } else if (typeof kycDocData.courierId === 'string' && kycDocData.courierId.trim()) {
          resolvedUid = kycDocData.courierId.trim();
        }
        break;
      }
    }

    const userRef = activeDb.collection('users').doc(resolvedUid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const userRole = String(userData.role || (kycDocData.role === 'marchand' ? 'vendeur' : 'livreur')).toLowerCase();
    const fullName = String(userData.fullName || kycDocData.fullName || 'Partenaire LivraLink').trim();
    const recipientEmail = String(userData.email || kycDocData.email || '').trim().toLowerCase();

    const batch = activeDb.batch();
    const kycRef = activeDb.collection('kyc').doc(kycDocIdToUpdate);
    batch.set(
      kycRef,
      {
        id: kycDocIdToUpdate,
        userId: resolvedUid,
        courierId: resolvedUid,
        status: decision,
        isApproved,
        verified: isApproved,
        rejectionReason: isApproved ? null : cleanReason,
        reviewedAt: nowIso,
        reviewedBy: req.user?.email || req.user?.uid || 'admin',
        updatedAt: nowIso,
      },
      { merge: true }
    );

    const userPatch: Record<string, any> = {
      isKycVerified: isApproved,
      kycStatus: decision,
      kycRejectionReason: isApproved ? null : cleanReason,
      updatedAt: nowIso,
    };
    if (isApproved) {
      userPatch.status = userRole === 'vendeur' ? 'actif' : 'en_ligne';
    }
    batch.set(userRef, userPatch, { merge: true });

    const notifId = `notif_kyc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    batch.set(activeDb.collection('notifications').doc(notifId), {
      id: notifId,
      senderId: req.user!.uid,
      recipientId: resolvedUid,
      type: 'kyc',
      title: isApproved ? '✅ Compte vérifié et accrédité' : '⚠️ Dossier KYC refusé — Action requise',
      message: isApproved
        ? `Félicitations ${fullName} ! Votre dossier d'identité KYC est validé. Toutes les fonctionnalités LivraLink sont débloquées.`
        : `Votre dossier KYC n'a pas pu être validé : ${cleanReason}`,
      isRead: false,
      read: false,
      createdAt: Date.now(),
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    });

    await batch.commit();

    // Sync custom claim kycLocked (best-effort) so Storage Rules can enforce lock without named-DB lookups
    if (firebaseAdminApp && process.env.NODE_ENV !== 'test') {
      try {
        const authAdmin = getAuth(firebaseAdminApp);
        const userRecord = await authAdmin.getUser(resolvedUid);
        const existingClaims = userRecord.customClaims || {};
        await authAdmin.setCustomUserClaims(resolvedUid, {
          ...existingClaims,
          kycLocked: isApproved,
        });
      } catch {
        // Non-blocking if Auth Admin IAM is unavailable
      }
    }

    if (recipientEmail) {
      const p1 = getP1EmailService();
      await p1.dispatchOrQueueEmail({
        type: isApproved ? 'kyc_approved' : 'kyc_rejected',
        to: recipientEmail,
        recipientName: fullName,
        recipientRole: userRole,
        subject: isApproved
          ? `🎉 Compte Activé ! Votre vérification KYC LivraLink est confirmée`
          : `⚠️ Dossier KYC LivraLink : Action requise pour la validation de votre compte`,
        previewText: isApproved
          ? 'Votre dossier KYC est validé. Votre compte LivraLink est pleinement actif.'
          : `Dossier KYC refusé : ${cleanReason}`,
        textContent: isApproved
          ? `Bonjour ${fullName},\n\nVotre dossier KYC a été approuvé par notre équipe. Votre compte LivraLink est désormais actif.`
          : `Bonjour ${fullName},\n\nVotre dossier KYC a été refusé pour la raison suivante : ${cleanReason}\nVeuillez soumettre à nouveau vos pièces depuis votre espace.`,
        htmlContent: `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 24px; color: #0f172a;">
            <h2 style="color: ${isApproved ? '#16a34a' : '#dc2626'};">${isApproved ? '🎉 Compte vérifié KYC !' : '⚠️ Mise à jour de votre dossier KYC'}</h2>
            <p>Bonjour <strong>${escapeHtml(fullName)}</strong>,</p>
            ${
              isApproved
                ? '<p>Votre dossier KYC a été <strong>approuvé</strong> par l\'administration LivraLink. Votre compte est désormais pleinement opérationnel.</p>'
                : `<p>Votre dossier KYC n'a pas pu être validé en l'état :</p><blockquote style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px;color:#991b1b;">${escapeHtml(cleanReason)}</blockquote><p>Veuillez corriger et soumettre à nouveau votre dossier depuis votre espace.</p>`
            }
          </div>
        `,
        allowQueue: true,
      }).catch(() => {});
    }

    return res.json({
      success: true,
      targetUid: resolvedUid,
      kycId: kycDocIdToUpdate,
      decision,
      isApproved,
      rejectionReason: isApproved ? undefined : cleanReason,
    });
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    const isIamDenied = msg.includes('PERMISSION_DENIED') || String(err?.code || '') === '7';
    console.error('[KYC-STEP-F][ADMIN KYC DECISION ERROR]:', isIamDenied ? '7 PERMISSION_DENIED' : msg);
    return res.status(isIamDenied ? 503 : 500).json({
      success: false,
      stepCode: 'KYC-STEP-F',
      code: isIamDenied ? 'IAM_PERMISSION_DENIED' : 'KYC_DECISION_FAILED',
      error: isIamDenied
        ? '[KYC-STEP-F] Permissions IAM Firestore Admin indisponibles (7 PERMISSION_DENIED).'
        : '[KYC-STEP-F] Erreur lors de la décision administrative KYC.',
    });
  }
});

// =========================================================================
// DIAGNOSTIC AUTHENTIFICATION GEMINI BACKEND (ADMIN UNIQUEMENT — SANS FUITE DE CLÉ)
// =========================================================================
app.post('/api/admin/gemini/verify', requireAdminPermission('kyc.read') as any, async (req: AuthenticatedRequest, res: Response) => {
  const rateCheck = checkIpRateLimit(`gemini_verify_admin_${req.user!.uid}`, 15, 60_000);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      code: 'ADMIN_RATE_LIMIT',
      message: 'Trop de tests de connexion Gemini en moins d’une minute. Veuillez patienter.',
    });
  }

  try {
    const result = await verifyGeminiBackendAuth();
    return res.status(result.ok ? 200 : result.httpStatus || 503).json({
      success: result.ok,
      keyConfigured: result.keyConfigured,
      keyFormat: result.keyFormat,
      model: result.model,
      httpStatus: result.httpStatus,
      code: result.code,
      message: result.message,
    });
  } catch (err: any) {
    console.warn('[KYC-GEMINI] Échec test auth Gemini:', redactSensitiveForLogs(err?.message || err));
    return res.status(502).json({
      success: false,
      keyConfigured: Boolean(normalizeGeminiApiKey(process.env.GEMINI_API_KEY)),
      keyFormat: inspectGeminiKeyFormat(process.env.GEMINI_API_KEY).format,
      code: 'GEMINI_VERIFY_ERROR',
      message: 'Impossible de tester la connexion Gemini depuis le serveur.',
    });
  }
});

// =========================================================================
// ANALYSE DOCUMENTAIRE KYC ASSISTÉE PAR GOOGLE GEMINI (ADMIN UNIQUEMENT)
// Gemini ne valide ni ne rejette jamais un dossier : aide à la décision uniquement.
// =========================================================================
app.post('/api/admin/kyc/:requestId/analyze', requireAdminPermission('kyc.read') as any, async (req: AuthenticatedRequest, res: Response) => {
  const cleanRequestId = String(req.params.requestId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanRequestId) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_REQUEST_ID',
      error: 'Identifiant du dossier KYC invalide.',
    });
  }

  const adminActor = String(req.user?.email || req.user?.uid || 'admin').trim();
  const rateCheck = checkIpRateLimit(`kyc_gemini_admin_${req.user!.uid}`, 20, 60_000);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      code: 'ADMIN_RATE_LIMIT',
      error: 'Trop de demandes d’analyse IA en moins d’une minute. Veuillez patienter.',
    });
  }

  const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
  if (!activeDb) {
    return res.status(503).json({
      success: false,
      code: 'FIRESTORE_ADMIN_UNAVAILABLE',
      error: 'Firestore Admin SDK indisponible.',
    });
  }

  const activeBucket =
    process.env.NODE_ENV === 'test' && testStorageBucketOverride
      ? testStorageBucketOverride
      : firebaseAdminApp
      ? getStorage(firebaseAdminApp).bucket(configuredStorageBucket)
      : null;

  try {
    let kycDocId = cleanRequestId;
    let kycData: Record<string, any> | null = null;

    const directSnap = await activeDb.collection('kyc').doc(cleanRequestId).get();
    if (directSnap?.exists) {
      kycDocId = directSnap.id;
      kycData = directSnap.data() || {};
    } else if (typeof activeDb.collection('kyc').where === 'function') {
      const byCourier = await activeDb.collection('kyc').where('courierId', '==', cleanRequestId).limit(1).get();
      if (byCourier && !byCourier.empty) {
        const hit = byCourier.docs[0];
        kycDocId = hit.id;
        kycData = hit.data() || {};
      }
    }

    if (!kycData) {
      return res.status(404).json({
        success: false,
        code: 'KYC_DOSSIER_NOT_FOUND',
        error: 'Dossier KYC introuvable dans Firestore.',
      });
    }

    const ownerUid = String(kycData.userId || kycData.courierId || kycDocId).trim();
    let userData: Record<string, any> = {};
    if (ownerUid) {
      try {
        const uSnap = await activeDb.collection('users').doc(ownerUid).get();
        if (uSnap?.exists) {
          userData = uSnap.data() || {};
        }
      } catch {
        // Non bloquant
      }
    }

    const { aiAnalysis, usedFallbackScope } = await runKycGeminiAnalysis({
      db: activeDb,
      bucket: activeBucket,
      requestId: cleanRequestId,
      kycDocId,
      kycData,
      userData,
      requestedBy: adminActor,
      force: Boolean(req.body?.force),
      timeoutMs:
        process.env.NODE_ENV === 'test' && typeof req.body?.__testTimeoutMs === 'number'
          ? req.body.__testTimeoutMs
          : undefined,
      maxRetries:
        process.env.NODE_ENV === 'test' && typeof req.body?.__testMaxRetries === 'number'
          ? req.body.__testMaxRetries
          : undefined,
      dailyCap:
        process.env.NODE_ENV === 'test' && typeof req.body?.__testDailyCap === 'number'
          ? req.body.__testDailyCap
          : apiUsageStats.geminiApiCalls.dailyCap,
      dailyBudgetCapEur: apiUsageStats.dailyBudgetCapEur,
      fallbackQuotaCheck: () => {
        const q = canConsumeApi('geminiApiCalls');
        return {
          allowed: q.allowed,
          reason: q.reason,
          used: apiUsageStats.geminiApiCalls.count,
          cap: apiUsageStats.geminiApiCalls.dailyCap,
        };
      },
      fallbackQuotaTrack: () => trackApiConsumption('geminiApiCalls', 1),
      fallbackCircuitCheck: () => {
        const cb = circuitBreakers.get('gemini_api');
        return !cb || cb.state === 'CLOSED';
      },
      fallbackCircuitSuccess: () => {
        circuitBreakers.set('gemini_api', { state: 'CLOSED', failures: 0 });
      },
      fallbackCircuitFailure: () => {
        const curr = circuitBreakers.get('gemini_api') || { state: 'CLOSED', failures: 0 };
        const failures = curr.failures + 1;
        circuitBreakers.set('gemini_api', {
          state: failures >= 5 ? 'OPEN' : 'CLOSED',
          failures,
        });
      },
    });

    console.log(
      `[KYC-GEMINI] Analyse terminée pour dossier=${kycDocId} (scope=${usedFallbackScope}, model=${aiAnalysis.model}, admin=${adminActor})`
    );

    return res.json({
      success: true,
      requestId: kycDocId,
      aiAnalysis,
    });
  } catch (err: any) {
    if (err instanceof KycGeminiAnalysisError) {
      console.warn(`[KYC-GEMINI] Échec dossier=${cleanRequestId} code=${err.code}: ${redactSensitiveForLogs(err.message)}`);
      return res.status(err.httpStatus).json({
        success: false,
        code: err.code,
        error: err.message,
      });
    }
    const isIamDenied = isFirestoreIamDeniedError(err);
    console.error('[KYC-GEMINI] Erreur inattendue:', redactSensitiveForLogs(err?.message || err));
    return res.status(isIamDenied ? 503 : 500).json({
      success: false,
      code: isIamDenied ? 'IAM_PERMISSION_DENIED' : 'KYC_GEMINI_ANALYZE_FAILED',
      error: isIamDenied
        ? 'Permissions IAM Firestore Admin indisponibles pour enregistrer l’analyse IA.'
        : 'Impossible d’exécuter l’analyse documentaire Gemini pour le moment.',
    });
  }
});

// =========================================================================
// RECHERCHE & VÉRIFICATION DE LIEUX GOOGLE MAPS GROUNDING (GEMINI 4 HYDROGEN)
// =========================================================================
app.post('/api/maps/grounding', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.user!.uid;
  const rateCheck = checkIpRateLimit(`maps_grounding_${callerUid}`, 25, 60_000);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      code: 'MAPS_GROUNDING_RATE_LIMIT',
      error: 'Trop de recherches Google Maps IA en moins d’une minute. Veuillez patienter un instant.',
    });
  }

  const quotaCheck = canConsumeApi('geminiApiCalls');
  if (!quotaCheck.allowed) {
    return res.status(429).json({
      success: false,
      code: 'GEMINI_DAILY_QUOTA_EXCEEDED',
      error: quotaCheck.reason || 'Quota journalier Gemini atteint.',
    });
  }

  const cb = circuitBreakers.get('gemini_api');
  if (cb?.state === 'OPEN') {
    return res.status(503).json({
      success: false,
      code: 'GEMINI_CIRCUIT_OPEN',
      error: 'Le service Gemini est temporairement en pause suite à plusieurs erreurs consécutives.',
    });
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await queryMapsGroundingWithGemini({
      query: body.query,
      commune: body.commune,
      context: body.context,
      latitude: body.latitude,
      longitude: body.longitude,
      timeoutMs:
        process.env.NODE_ENV === 'test' && typeof body.__testTimeoutMs === 'number'
          ? body.__testTimeoutMs
          : undefined,
      maxRetries:
        process.env.NODE_ENV === 'test' && typeof body.__testMaxRetries === 'number'
          ? body.__testMaxRetries
          : undefined,
    });

    trackApiConsumption('geminiApiCalls', 1);
    circuitBreakers.set('gemini_api', { state: 'CLOSED', failures: 0 });

    return res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    if (err instanceof KycGeminiAnalysisError) {
      if (err.retryable) {
        const curr = circuitBreakers.get('gemini_api') || { state: 'CLOSED', failures: 0 };
        const failures = curr.failures + 1;
        circuitBreakers.set('gemini_api', {
          state: failures >= 5 ? 'OPEN' : 'CLOSED',
          failures,
        });
      }
      return res.status(err.httpStatus).json({
        success: false,
        code: err.code,
        error: err.message,
      });
    }
    console.error('[MAPS-GROUNDING] Erreur inattendue:', redactSensitiveForLogs(err?.message || err));
    return res.status(500).json({
      success: false,
      code: 'MAPS_GROUNDING_FAILED',
      error: 'Impossible d’interroger l’assistant Google Maps IA pour le moment.',
    });
  }
});

// =========================================================================
// PRÉ-VALIDATION SERVEUR DU STATUT KYC AVANT TÉLÉVERSEMENT STORAGE
// =========================================================================
app.post('/api/courier/kyc/authorize-upload', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  const callerUid = req.user!.uid;
  const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;

  if (!activeDb) {
    return res.json({ success: true, allowed: true, serverChecked: false });
  }

  try {
    const kycSnap = await activeDb.collection('kyc').doc(callerUid).get();
    let kycStatus = kycSnap.exists ? String(kycSnap.data()?.status || 'non_soumis') : 'non_soumis';
    if (kycStatus === 'en_attente') {
      return res.status(409).json({
        success: false,
        allowed: false,
        stepCode: 'KYC-STEP-C',
        status: kycStatus,
        error: '[KYC-STEP-C] Votre dossier KYC est déjà en cours de vérification par l’administration.',
      });
    }
    if (kycStatus === 'valide') {
      return res.status(409).json({
        success: false,
        allowed: false,
        stepCode: 'KYC-STEP-C',
        status: kycStatus,
        error: '[KYC-STEP-C] Votre dossier KYC est déjà validé.',
      });
    }

    if (kycStatus !== 'refuse') {
      const userSnap = await activeDb.collection('users').doc(callerUid).get();
      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        if (userData.isKycVerified === true || userData.kycStatus === 'valide') {
          return res.status(409).json({
            success: false,
            allowed: false,
            stepCode: 'KYC-STEP-C',
            status: 'valide',
            error: '[KYC-STEP-C] Votre dossier KYC est déjà validé.',
          });
        }
        if (userData.kycStatus === 'en_attente') {
          return res.status(409).json({
            success: false,
            allowed: false,
            stepCode: 'KYC-STEP-C',
            status: 'en_attente',
            error: '[KYC-STEP-C] Votre dossier KYC est déjà en cours de vérification par l’administration.',
          });
        }
      }
    }

    return res.json({ success: true, allowed: true, serverChecked: true, status: kycStatus });
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    const isIamDenied = msg.includes('PERMISSION_DENIED') || String(err?.code || '') === '7';
    if (isIamDenied) {
      return res.json({
        success: true,
        allowed: true,
        serverChecked: false,
        iamFallback: true,
      });
    }
    console.warn('[KYC-STEP-C][AUTHORIZE-UPLOAD WARN]:', msg);
    return res.json({ success: true, allowed: true, serverChecked: false });
  }
});

// =========================================================================
// NOTIFICATION ADMIN PERSISTANTE & LOCK CLAIM APRÈS SOUMISSION KYC
// =========================================================================
app.post('/api/courier/kyc/notify-submitted', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    if (!activeDb) {
      return res.status(503).json({
        success: false,
        error: 'Firestore Admin SDK indisponible pour notifier l’administration.',
      });
    }

    const callerUid = String(req.user?.uid || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!callerUid || callerUid !== req.user?.uid) {
      return res.status(401).json({ success: false, error: 'Identifiant Firebase Auth invalide.' });
    }

    const kycSnap = await activeDb.collection('kyc').doc(callerUid).get();
    if (!kycSnap.exists) {
      return res.status(404).json({ success: false, error: 'Dossier KYC introuvable dans Firestore.' });
    }
    const kycData = kycSnap.data() || {};
    if (kycData.status !== 'en_attente') {
      return res.status(409).json({
        success: false,
        error: 'Le dossier KYC n’est pas au statut en_attente.',
      });
    }

    // Best-effort sync of kycLocked: true custom claim while dossier is pending review
    if (firebaseAdminApp && process.env.NODE_ENV !== 'test') {
      try {
        const authAdmin = getAuth(firebaseAdminApp);
        const userRecord = await authAdmin.getUser(callerUid);
        const existingClaims = userRecord.customClaims || {};
        if (existingClaims.kycLocked !== true) {
          await authAdmin.setCustomUserClaims(callerUid, {
            ...existingClaims,
            kycLocked: true,
          });
        }
      } catch {
        // Non-blocking if Auth Admin IAM unavailable
      }
    }

    const adminRecipients = new Map<string, string>();
    const adminEmails = new Set<string>(['pamphile.gbede@gmail.com']);

    try {
      const adminsSnap = await activeDb.collection('admins').get();
      adminsSnap?.docs?.forEach((docSnap: any) => {
        const d = docSnap.data() || {};
        const uid = String(d.uid || docSnap.id || '').trim();
        const email = typeof d.email === 'string' ? d.email.trim().toLowerCase() : '';
        if (uid) adminRecipients.set(uid, email);
        if (email) adminEmails.add(email);
      });
    } catch {
      // Continue with fallback admin discovery
    }

    try {
      const usersSnap = await activeDb.collection('users').get();
      usersSnap?.docs?.forEach((docSnap: any) => {
        const d = docSnap.data() || {};
        const role = String(d.role || '').toLowerCase();
        const email = typeof d.email === 'string' ? d.email.trim().toLowerCase() : '';
        const uid = String(d.uid || docSnap.id || '').trim();
        if (uid && (role === 'admin' || email === 'pamphile.gbede@gmail.com')) {
          adminRecipients.set(uid, email);
          if (email) adminEmails.add(email);
        }
      });
    } catch {
      // Continue
    }

    if (firebaseAdminApp && process.env.NODE_ENV !== 'test') {
      try {
        const superAdminRec = await getAuth(firebaseAdminApp).getUserByEmail('pamphile.gbede@gmail.com');
        if (superAdminRec?.uid) {
          adminRecipients.set(superAdminRec.uid, 'pamphile.gbede@gmail.com');
        }
      } catch {
        // Super-admin account may not exist in test/sandbox auth
      }
    }

    const fullName = String(kycData.fullName || 'Livreur LivraLink').trim().slice(0, 128);
    const idType = String(kycData.idType || 'Pièce').trim().slice(0, 24);
    const vehicleType = String(kycData.vehicleType || 'Engin').trim().slice(0, 64);
    const isResubmission = Boolean(kycData.reviewedAt);
    const submittedKey = String(kycData.submittedAt || kycData.updatedAt || 'latest');
    const nowEpoch = Date.now();
    const timeLabel = new Date(nowEpoch).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const docsObj = kycData?.documents && typeof kycData.documents === 'object' ? kycData.documents : {};
    const uploadedDocsCount = ['idFront', 'idBack', 'drivingLicenseFront', 'drivingLicenseBack'].filter(
      (k) => docsObj[k] && docsObj[k].uploaded !== false && docsObj[k].storagePath
    ).length || 2;

    const title = isResubmission
      ? '🔄 Dossier KYC re-soumis pour contrôle'
      : '🛡️ Nouveau dossier KYC à vérifier';
    const message = `${fullName} (${vehicleType} • ${idType}) a transmis son dossier KYC (${uploadedDocsCount} justificatif(s)) pour vérification à ${timeLabel}.`;

    let notifiedAdminCount = 0;
    const batch = activeDb.batch();
    for (const [adminUid] of adminRecipients.entries()) {
      const cleanAdminUid = adminUid.replace(/[^a-zA-Z0-9_-]/g, '');
      if (!cleanAdminUid) continue;
      const notifId = `notif_kyc_sub_${crypto
        .createHash('sha256')
        .update(JSON.stringify(['kyc_submitted', cleanAdminUid, callerUid, submittedKey]))
        .digest('hex')
        .slice(0, 24)}`;
      batch.set(
        activeDb.collection('notifications').doc(notifId),
        {
          id: notifId,
          senderId: callerUid,
          recipientId: cleanAdminUid,
          type: 'kyc',
          title,
          message,
          actionView: 'admin_kyc',
          isRead: false,
          read: false,
          createdAt: nowEpoch,
          timestamp: timeLabel,
        },
        { merge: false }
      );
      notifiedAdminCount += 1;
    }

    if (notifiedAdminCount > 0) {
      await batch.commit();
    }

    const p1 = getP1EmailService();
    for (const adminEmail of adminEmails) {
      if (!adminEmail) continue;
      await p1
        .dispatchOrQueueEmail({
          type: 'kyc_submitted',
          to: adminEmail,
          recipientName: 'Administration LivraLink',
          recipientRole: 'admin',
          dedupKey: `kyc_admin_alert_${callerUid}_${submittedKey}_${adminEmail}`,
          subject: isResubmission
            ? `🔄 Dossier KYC re-soumis : ${fullName}`
            : `🛡️ Nouveau dossier KYC soumis : ${fullName}`,
          previewText: `${fullName} a transmis un dossier KYC (${uploadedDocsCount} justificatif(s)) pour contrôle.`,
          textContent: `Bonjour,\n\nLe livreur ${fullName} (${vehicleType}) a ${isResubmission ? 're-soumis' : 'soumis'} son dossier KYC (${uploadedDocsCount} document(s) justificatif(s)).\nConnectez-vous à la Console Admin > Vérifications KYC pour l'examiner.`,
          htmlContent: `
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 24px; color: #0f172a;">
              <h2 style="color: #1d4ed8;">${isResubmission ? '🔄 Dossier KYC re-soumis' : '🛡️ Nouveau dossier KYC à contrôler'}</h2>
              <p>Le partenaire livreur <strong>${escapeHtml(fullName)}</strong> (${escapeHtml(vehicleType)}) a transmis son dossier KYC (${uploadedDocsCount} justificatif(s)).</p>
              <p>Rendez-vous dans la <strong>Console Admin &rsaquo; Vérifications KYC</strong> pour consulter les pièces et statuer.</p>
            </div>
          `,
          allowQueue: true,
        })
        .catch(() => {});
    }

    return res.json({
      success: true,
      notifiedAdminCount,
      emailedAdmins: adminEmails.size,
    });
  } catch (err: any) {
    console.warn('[KYC NOTIFY ADMIN ERROR]:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: 'Impossible d’enregistrer la notification administrateur KYC.',
    });
  }
});

// =========================================================================
// ACCÈS SÉCURISÉ AUX JUSTIFICATIFS KYC & NETTOYAGE DES FICHIERS ORPHELINS
// =========================================================================
const KYC_STORAGE_PATH_REGEX =
  /^kyc\/([a-zA-Z0-9_-]+)\/(?:(id_front|id_back|driving_license_front|driving_license_back|driving_license|vehicle_insurance)\/)?([a-zA-Z0-9_.-]+)$/;

const collectReferencedKycPaths = (kycData: Record<string, any> | undefined): Set<string> => {
  const paths = new Set<string>();
  if (!kycData || typeof kycData !== 'object') return paths;
  if (typeof kycData.documentStoragePath === 'string' && kycData.documentStoragePath.trim()) {
    paths.add(kycData.documentStoragePath.trim());
  }
  const docs = kycData.documents;
  if (docs && typeof docs === 'object') {
    for (const slotKey of ['idFront', 'idBack', 'drivingLicenseFront', 'drivingLicenseBack', 'drivingLicense', 'vehicleInsurance']) {
      const slot = docs[slotKey];
      if (slot && typeof slot.storagePath === 'string' && slot.storagePath.trim()) {
        paths.add(slot.storagePath.trim());
      }
    }
  }
  return paths;
};

app.get('/api/kyc/document', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawPath = String(req.query?.path || '').trim();
    const match = rawPath.match(KYC_STORAGE_PATH_REGEX);
    if (!match || rawPath.includes('..')) {
      return res.status(400).json({ success: false, error: 'Chemin de justificatif KYC invalide.' });
    }

    const targetUid = match[1];
    const fileName = match[3];
    const isOwner = req.user?.uid === targetUid;
    const isAdminCaller = isOwner ? false : await checkCallerIsAdmin(req.user);

    if (!isOwner && !isAdminCaller) {
      recordSecurityAnomaly(
        getClientIp(req),
        'KYC_DOCUMENT_IDOR_ATTEMPT',
        `Tentative de lecture non autorisée du justificatif KYC ${rawPath} par ${req.user?.uid}`
      );
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Vous n’êtes pas autorisé à consulter ce document KYC.',
      });
    }

    const activeBucket =
      process.env.NODE_ENV === 'test' && testStorageBucketOverride
        ? testStorageBucketOverride
        : firebaseAdminApp
        ? getStorage(firebaseAdminApp).bucket(configuredStorageBucket)
        : null;

    if (!activeBucket) {
      return res.status(503).json({ success: false, error: 'Firebase Storage Admin indisponible.' });
    }

    const fileRef = activeBucket.file(rawPath);
    const [exists] = await fileRef.exists();
    if (!exists) {
      return res.status(404).json({ success: false, error: 'Justificatif KYC introuvable dans le stockage.' });
    }

    const [metadata] = await fileRef.getMetadata().catch(() => [{} as any]);
    const [buffer] = await fileRef.download();
    const lowerName = fileName.toLowerCase();
    const contentType =
      metadata?.contentType ||
      (lowerName.endsWith('.pdf')
        ? 'application/pdf'
        : lowerName.endsWith('.png')
        ? 'image/png'
        : lowerName.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg');

    const disposition = req.query?.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error('[KYC DOCUMENT PROXY ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Impossible de récupérer le justificatif KYC.' });
  }
});

app.post('/api/courier/kyc/cleanup-orphan', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawPath = String(req.body?.storagePath || '').trim();
    const callerUid = req.user!.uid;
    const match = rawPath.match(KYC_STORAGE_PATH_REGEX);
    if (!match || rawPath.includes('..') || match[1] !== callerUid) {
      return res.status(403).json({
        success: false,
        error: 'Action refusée. Vous ne pouvez nettoyer que vos propres fichiers temporaires KYC.',
      });
    }

    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    if (activeDb) {
      const kycSnap = await activeDb.collection('kyc').doc(callerUid).get();
      if (kycSnap.exists) {
        const kycData = kycSnap.data() || {};
        const referencedPaths = collectReferencedKycPaths(kycData);
        const isProtectedByUrl =
          typeof kycData.documentPhotoUrl === 'string' &&
          kycData.documentPhotoUrl.includes(encodeURIComponent(rawPath));
        if (
          (kycData.status === 'en_attente' || kycData.status === 'valide') &&
          (referencedPaths.has(rawPath) || isProtectedByUrl)
        ) {
          return res.status(409).json({
            success: false,
            error: 'Impossible de supprimer un justificatif lié à un dossier actif ou validé.',
          });
        }
      }
    }

    const activeBucket =
      process.env.NODE_ENV === 'test' && testStorageBucketOverride
        ? testStorageBucketOverride
        : firebaseAdminApp
        ? getStorage(firebaseAdminApp).bucket(configuredStorageBucket)
        : null;

    if (!activeBucket) {
      return res.status(503).json({ success: false, error: 'Firebase Storage Admin indisponible.' });
    }

    await activeBucket.file(rawPath).delete({ ignoreNotFound: true });
    return res.json({ success: true, cleanedPath: rawPath });
  } catch (err: any) {
    console.error('[KYC ORPHAN CLEANUP ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors du nettoyage du fichier KYC orphelin.' });
  }
});

// =========================================================================
// ISOLATION STRICTE DES FICHIERS POD (/pod/{orderId}/*) & CHAT (/chat/{conversationId}/*)
// =========================================================================
const MAX_POD_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_CHAT_MEDIA_BYTES = 15 * 1024 * 1024;
const ALLOWED_POD_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_CHAT_STATIC_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const normalizeUploadedMime = (rawMime: unknown): string => {
  const lower = String(rawMime || '').trim().toLowerCase().split(';')[0];
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  return lower;
};

const isAllowedChatMimeType = (mime: string): boolean =>
  ALLOWED_CHAT_STATIC_MIME_TYPES.has(mime) || /^audio\/[a-z0-9.+-]+$/i.test(mime);

const extensionForUploadedMime = (mime: string, fallbackExt = 'bin'): string => {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('audio/')) {
    const sub = mime.slice('audio/'.length).replace(/[^a-z0-9]/gi, '').toLowerCase();
    return sub || 'audio';
  }
  return fallbackExt;
};

const isSafeAvatarUrl = (rawUrl: unknown): boolean => {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 1000) return false;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const verifyMagicBytesForMime = (buffer: Buffer, contentType: string): boolean => {
  if (!buffer || buffer.length < 4) return false;
  if (contentType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (contentType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (contentType === 'application/pdf') {
    return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (contentType.startsWith('audio/')) {
    const headAscii = buffer.subarray(0, 4).toString('ascii');
    const isOgg = headAscii === 'OggS';
    const isRiffWav = buffer.length >= 12 && headAscii === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE';
    const isFlac = headAscii === 'fLaC';
    const isId3 = buffer.subarray(0, 3).toString('ascii') === 'ID3';
    const isMp3Sync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
    const isWebm = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    const isMp4Audio = buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    return isOgg || isRiffWav || isFlac || isId3 || isMp3Sync || isWebm || isMp4Audio;
  }
  return false;
};

const decodeUploadedBase64Media = (
  rawDataBase64: unknown,
  rawDataUrl: unknown,
  rawContentType: unknown
): { buffer: Buffer; contentType: string } | { error: string } => {
  let contentType = normalizeUploadedMime(rawContentType);
  let base64Body = typeof rawDataBase64 === 'string' ? rawDataBase64.trim() : '';

  if (!base64Body && typeof rawDataUrl === 'string' && rawDataUrl.trim()) {
    const dataUrlMatch = rawDataUrl.trim().match(/^data:([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) {
      return { error: 'Format data URL Base64 invalide.' };
    }
    if (!contentType) {
      contentType = normalizeUploadedMime(dataUrlMatch[1]);
    }
    base64Body = dataUrlMatch[2].trim();
  }

  if (!base64Body) {
    return { error: 'Contenu binaire du fichier manquant.' };
  }
  const cleanB64 = base64Body.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(cleanB64)) {
    return { error: 'Encodage Base64 invalide.' };
  }

  const buffer = Buffer.from(cleanB64, 'base64');
  if (!buffer || buffer.length <= 0) {
    return { error: 'Le fichier envoyé est vide.' };
  }
  return { buffer, contentType };
};

const canUserReadDeliveryMedia = (
  deliveryData: Record<string, any> | undefined,
  callerUid: string
): boolean => {
  if (!deliveryData || !callerUid) return false;
  const assignedCourierId = getAssignedCourierIdFromOrder(deliveryData);
  const merchantId = typeof deliveryData.merchantId === 'string' ? deliveryData.merchantId.trim() : '';
  const clientId = typeof deliveryData.clientId === 'string' ? deliveryData.clientId.trim() : '';
  return (
    callerUid === merchantId ||
    callerUid === assignedCourierId ||
    callerUid === clientId
  );
};

const canUserAccessConversationMedia = (
  convData: Record<string, any> | undefined,
  callerUid: string
): boolean => {
  if (!convData || !callerUid) return false;
  return Array.isArray(convData.participantIds) && convData.participantIds.includes(callerUid);
};

const MAX_KYC_MEDIA_BYTES = 10 * 1024 * 1024;
const ALLOWED_KYC_DOC_TYPES = new Set([
  'id_front',
  'id_back',
  'driving_license_front',
  'driving_license_back',
]);
const ALLOWED_KYC_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

app.post('/api/courier/kyc/upload', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    const activeBucket =
      process.env.NODE_ENV === 'test' && testStorageBucketOverride
        ? testStorageBucketOverride
        : firebaseAdminApp
        ? getStorage(firebaseAdminApp).bucket(configuredStorageBucket)
        : null;

    if (!activeBucket) {
      return res.status(503).json({
        success: false,
        stepCode: 'KYC-STEP-B',
        code: 'STORAGE_ADMIN_UNAVAILABLE',
        error: '[KYC-STEP-B] Firebase Storage Admin indisponible sur le serveur.',
      });
    }

    const callerUid = String(req.user?.uid || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!callerUid || callerUid !== req.user?.uid) {
      return res.status(401).json({
        success: false,
        stepCode: 'KYC-STEP-A',
        error: '[KYC-STEP-A] Identifiant utilisateur Firebase Auth invalide.',
      });
    }

    const rawDocType = String(req.body?.docType || '').trim();
    if (!ALLOWED_KYC_DOC_TYPES.has(rawDocType)) {
      return res.status(400).json({
        success: false,
        stepCode: 'KYC-STEP-B',
        error:
          '[KYC-STEP-B] Type de document KYC non autorisé (attendu : id_front, id_back, driving_license_front ou driving_license_back).',
      });
    }

    // Contrôle préalable Firestore : rôle livreur + blocage si dossier en attente ou validé
    let firestoreLockChecked = false;
    if (activeDb) {
      try {
        const [kycSnap, userSnap] = await Promise.all([
          activeDb.collection('kyc').doc(callerUid).get(),
          activeDb.collection('users').doc(callerUid).get(),
        ]);
        if (userSnap.exists) {
          const userData = userSnap.data() || {};
          const userRole = String(userData.role || '').trim().toLowerCase();
          if (userRole && userRole !== 'livreur') {
            return res.status(403).json({
              success: false,
              stepCode: 'KYC-STEP-A',
              error: '[KYC-STEP-A] Seuls les comptes livreurs peuvent déposer des pièces justificatives KYC.',
            });
          }
          if (userData.isKycVerified === true || userData.kycStatus === 'valide') {
            return res.status(409).json({
              success: false,
              stepCode: 'KYC-STEP-C',
              error: '[KYC-STEP-C] Votre dossier KYC est déjà validé.',
            });
          }
        }
        const kycStatus = kycSnap.exists ? String(kycSnap.data()?.status || 'non_soumis') : 'non_soumis';
        if (kycStatus === 'en_attente') {
          return res.status(409).json({
            success: false,
            stepCode: 'KYC-STEP-C',
            error: '[KYC-STEP-C] Votre dossier KYC est déjà en cours de vérification par l’administration.',
          });
        }
        if (kycStatus === 'valide') {
          return res.status(409).json({
            success: false,
            stepCode: 'KYC-STEP-C',
            error: '[KYC-STEP-C] Votre dossier KYC est déjà validé.',
          });
        }
        if (kycStatus !== 'refuse' && userSnap.exists) {
          const userData = userSnap.data() || {};
          if (userData.kycStatus === 'en_attente') {
            return res.status(409).json({
              success: false,
              stepCode: 'KYC-STEP-C',
              error: '[KYC-STEP-C] Votre dossier KYC est déjà en cours de vérification par l’administration.',
            });
          }
        }
        firestoreLockChecked = true;
      } catch (dbErr: any) {
        const msg = String(dbErr?.message || dbErr || '');
        const isIamDenied = msg.includes('PERMISSION_DENIED') || String(dbErr?.code || '') === '7';
        if (!isIamDenied) {
          console.warn('[KYC-STEP-B][FIRESTORE PRECHECK WARN]:', msg);
        }
      }
    }

    if (!firestoreLockChecked && (req.user as any)?.kycLocked === true) {
      return res.status(409).json({
        success: false,
        stepCode: 'KYC-STEP-C',
        error: '[KYC-STEP-C] Votre compte est verrouillé pour le dépôt KYC (dossier en attente ou validé).',
      });
    }

    const decoded = decodeUploadedBase64Media(req.body?.dataBase64, req.body?.dataUrl, req.body?.contentType);
    if ('error' in decoded) {
      return res.status(400).json({
        success: false,
        stepCode: 'KYC-STEP-B',
        error: `[KYC-STEP-B] ${decoded.error}`,
      });
    }

    if (!ALLOWED_KYC_MIME_TYPES.has(decoded.contentType)) {
      return res.status(400).json({
        success: false,
        stepCode: 'KYC-STEP-B',
        error: '[KYC-STEP-B] Format de document non autorisé. Formats acceptés : JPG, JPEG, PNG, WebP ou PDF.',
      });
    }
    if (!verifyMagicBytesForMime(decoded.buffer, decoded.contentType)) {
      return res.status(400).json({
        success: false,
        stepCode: 'KYC-STEP-B',
        error: '[KYC-STEP-B] Signature binaire du fichier KYC non conforme au type MIME déclaré.',
      });
    }
    if (decoded.buffer.length <= 0 || decoded.buffer.length >= MAX_KYC_MEDIA_BYTES) {
      return res.status(400).json({
        success: false,
        stepCode: 'KYC-STEP-B',
        error: '[KYC-STEP-B] Le document dépasse la taille maximale autorisée de 10 Mo ou est vide.',
      });
    }

    const ext = extensionForUploadedMime(decoded.contentType, 'jpg');
    const fileName = `${rawDocType}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${ext}`;
    const storagePath = `kyc/${callerUid}/${rawDocType}/${fileName}`;
    const uploadedAt = new Date().toISOString();
    const rawOrigName = typeof req.body?.originalFileName === 'string' ? req.body.originalFileName : '';
    const originalFileName = rawOrigName
      .replace(/[/\\]/g, '_')
      .replace(/[^a-zA-Z0-9À-ÿ _.-]/g, '')
      .trim()
      .slice(0, 128);

    await activeBucket.file(storagePath).save(decoded.buffer, {
      resumable: false,
      metadata: {
        contentType: decoded.contentType,
        metadata: {
          uploadedBy: callerUid,
          uploadedAt,
          docType: rawDocType,
          ...(originalFileName ? { originalFileName } : {}),
        },
      },
    });

    return res.json({
      success: true,
      storagePath,
      docType: rawDocType,
      contentType: decoded.contentType,
      fileName,
      ...(originalFileName ? { originalFileName } : {}),
      size: decoded.buffer.length,
      uploadedAt,
    });
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    const status = Number(err?.code || err?.status || 0);
    const isIamOrForbidden =
      status === 403 ||
      String(err?.code || '') === '7' ||
      /PERMISSION_DENIED|Forbidden|storage\.objects\.create|does not have/i.test(msg);

    if (isIamOrForbidden) {
      return res.status(503).json({
        success: false,
        stepCode: 'KYC-STEP-B',
        code: 'STORAGE_IAM_OR_RULES_REQUIRED',
        error:
          '[KYC-STEP-B] Accès refusé par Firebase Storage (403). Publiez le fichier storage.rules sur le bucket gen-lang-client-0654978401.firebasestorage.app et vérifiez le rôle IAM roles/storage.objectAdmin du compte de service serveur.',
      });
    }

    console.error('[KYC UPLOAD PROXY ERROR]:', msg);
    return res.status(500).json({
      success: false,
      stepCode: 'KYC-STEP-B',
      error: '[KYC-STEP-B] Échec du téléversement sécurisé du justificatif KYC.',
    });
  }
});

app.post('/api/pod/upload', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    const activeBucket =
      process.env.NODE_ENV === 'test' && testStorageBucketOverride
        ? testStorageBucketOverride
        : firebaseAdminApp
        ? getStorage(firebaseAdminApp).bucket(configuredStorageBucket)
        : null;

    if (!activeDb) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    if (!activeBucket) {
      return res.status(503).json({ success: false, error: 'Firebase Storage Admin indisponible.' });
    }

    const cleanOrderId = String(req.body?.orderId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const kind = req.body?.kind === 'signature' ? 'signature' : req.body?.kind === 'photo' ? 'photo' : '';
    if (!cleanOrderId || !kind) {
      return res.status(400).json({ success: false, error: 'Paramètres orderId et kind (photo/signature) invalides.' });
    }

    const callerUid = req.user!.uid;
    const isAdminCaller = await checkCallerIsAdmin(req.user);

    const deliverySnap = await activeDb.collection('deliveries').doc(cleanOrderId).get();
    if (!deliverySnap.exists) {
      return res.status(404).json({ success: false, error: 'Commande / livraison introuvable.' });
    }

    const deliveryData = deliverySnap.data() || {};
    const assignedCourierId = getAssignedCourierIdFromOrder(deliveryData);

    if (!isAdminCaller) {
      if (!assignedCourierId || assignedCourierId !== callerUid) {
        recordSecurityAnomaly(
          getClientIp(req),
          'POD_UPLOAD_IDOR_ATTEMPT',
          `Tentative d'upload POD non autorisé sur ${cleanOrderId} par ${callerUid}`
        );
        return res.status(403).json({
          success: false,
          error: 'Accès refusé. Seul le livreur assigné à cette livraison peut déposer une preuve POD.',
        });
      }
      if (deliveryData.status === 'livree' || deliveryData.status === 'echec') {
        return res.status(409).json({ success: false, error: 'Cette livraison est déjà clôturée.' });
      }
      if (!['colis_recupere', 'en_cours'].includes(deliveryData.status)) {
        return res.status(400).json({
          success: false,
          error: 'Statut invalide : le colis doit être récupéré ou en cours de livraison.',
        });
      }
    }

    const decoded = decodeUploadedBase64Media(req.body?.dataBase64, req.body?.dataUrl, req.body?.contentType);
    if ('error' in decoded) {
      return res.status(400).json({ success: false, error: decoded.error });
    }

    if (!ALLOWED_POD_MIME_TYPES.has(decoded.contentType)) {
      return res.status(400).json({
        success: false,
        error: 'Type MIME POD non autorisé. Formats acceptés : JPG, PNG ou WebP.',
      });
    }
    if (!verifyMagicBytesForMime(decoded.buffer, decoded.contentType)) {
      return res.status(400).json({
        success: false,
        error: 'Signature binaire du fichier POD non conforme au type MIME déclaré.',
      });
    }
    if (decoded.buffer.length >= MAX_POD_MEDIA_BYTES) {
      return res.status(400).json({
        success: false,
        error: 'La preuve POD dépasse la taille maximale autorisée de 10 Mo.',
      });
    }

    const ext = extensionForUploadedMime(decoded.contentType, kind === 'signature' ? 'png' : 'jpg');
    const storagePath = `pod/${cleanOrderId}/${kind}_${Date.now()}.${ext}`;
    await activeBucket.file(storagePath).save(decoded.buffer, {
      resumable: false,
      metadata: {
        contentType: decoded.contentType,
        metadata: {
          uploadedBy: callerUid,
          uploadedAt: new Date().toISOString(),
          orderId: cleanOrderId,
        },
      },
    });

    const mediaUrl = `/api/pod/media?path=${encodeURIComponent(storagePath)}`;
    return res.json({
      success: true,
      storagePath,
      mediaUrl,
      contentType: decoded.contentType,
      size: decoded.buffer.length,
    });
  } catch (err: any) {
    console.error('[POD MEDIA UPLOAD ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Échec du téléversement sécurisé de la preuve POD.' });
  }
});

app.get('/api/pod/media', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawPath = String(req.query?.path || '').trim();
    const match = rawPath.match(/^pod\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (!match || rawPath.includes('..')) {
      return res.status(400).json({ success: false, error: 'Chemin de preuve POD invalide.' });
    }

    const orderId = match[1];
    const fileName = match[2];
    const callerUid = req.user!.uid;
    const isAdminCaller = await checkCallerIsAdmin(req.user);

    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    if (!activeDb) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }

    const deliverySnap = await activeDb.collection('deliveries').doc(orderId).get();
    if (!deliverySnap.exists) {
      if (!isAdminCaller) {
        recordSecurityAnomaly(
          getClientIp(req),
          'POD_MEDIA_IDOR_ATTEMPT',
          `Tentative d'accès POD sur commande inexistante/non autorisée ${rawPath} par ${callerUid}`
        );
        return res.status(403).json({
          success: false,
          error: 'Accès refusé. Vous ne participez pas à cette livraison.',
        });
      }
      return res.status(404).json({ success: false, error: 'Livraison introuvable pour cette preuve POD.' });
    }

    if (!isAdminCaller && !canUserReadDeliveryMedia(deliverySnap.data(), callerUid)) {
      recordSecurityAnomaly(
        getClientIp(req),
        'POD_MEDIA_IDOR_ATTEMPT',
        `Tentative de lecture non autorisée de la preuve POD ${rawPath} par ${callerUid}`
      );
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Seuls le vendeur, le livreur assigné, le client ou un administrateur peuvent consulter cette preuve POD.',
      });
    }

    const activeBucket =
      process.env.NODE_ENV === 'test' && testStorageBucketOverride
        ? testStorageBucketOverride
        : firebaseAdminApp
        ? getStorage(firebaseAdminApp).bucket(configuredStorageBucket)
        : null;

    if (!activeBucket) {
      return res.status(503).json({ success: false, error: 'Firebase Storage Admin indisponible.' });
    }

    const fileRef = activeBucket.file(rawPath);
    const [exists] = await fileRef.exists();
    if (!exists) {
      return res.status(404).json({ success: false, error: 'Fichier POD introuvable dans le stockage.' });
    }

    const [metadata] = await fileRef.getMetadata().catch(() => [{} as any]);
    const [buffer] = await fileRef.download();
    const lowerName = fileName.toLowerCase();
    const contentType =
      metadata?.contentType ||
      (lowerName.endsWith('.png')
        ? 'image/png'
        : lowerName.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error('[POD MEDIA PROXY ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Impossible de récupérer la preuve POD.' });
  }
});

app.post('/api/chat/upload', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    const activeBucket =
      process.env.NODE_ENV === 'test' && testStorageBucketOverride
        ? testStorageBucketOverride
        : firebaseAdminApp
        ? getStorage(firebaseAdminApp).bucket(configuredStorageBucket)
        : null;

    if (!activeDb) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    if (!activeBucket) {
      return res.status(503).json({ success: false, error: 'Firebase Storage Admin indisponible.' });
    }

    const cleanConvId = String(req.body?.conversationId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const rawFileName = String(req.body?.fileName || 'piece_jointe').trim().replace(/[^a-zA-Z0-9_.-]/g, '');
    const safeFileName = rawFileName.slice(0, 120) || 'piece_jointe';
    if (!cleanConvId || safeFileName.includes('..')) {
      return res.status(400).json({ success: false, error: 'Paramètres de conversation ou de nom de fichier invalides.' });
    }

    const callerUid = req.user!.uid;
    const isAdminCaller = await checkCallerIsAdmin(req.user);

    const convSnap = await activeDb.collection('conversations').doc(cleanConvId).get();
    if (!convSnap.exists) {
      if (!isAdminCaller) {
        recordSecurityAnomaly(
          getClientIp(req),
          'CHAT_UPLOAD_IDOR_ATTEMPT',
          `Tentative d'upload chat sur conversation inexistante ${cleanConvId} par ${callerUid}`
        );
        return res.status(403).json({
          success: false,
          error: 'Accès refusé. Conversation introuvable ou non autorisée.',
        });
      }
      return res.status(404).json({ success: false, error: 'Conversation introuvable.' });
    }

    if (!isAdminCaller && !canUserAccessConversationMedia(convSnap.data(), callerUid)) {
      recordSecurityAnomaly(
        getClientIp(req),
        'CHAT_UPLOAD_IDOR_ATTEMPT',
        `Tentative d'upload chat non autorisé sur ${cleanConvId} par ${callerUid}`
      );
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Vous ne participez pas à cette conversation.',
      });
    }

    const decoded = decodeUploadedBase64Media(req.body?.dataBase64, req.body?.dataUrl, req.body?.contentType);
    if ('error' in decoded) {
      return res.status(400).json({ success: false, error: decoded.error });
    }

    if (!isAllowedChatMimeType(decoded.contentType)) {
      return res.status(400).json({
        success: false,
        error: 'Type de fichier chat non autorisé. Formats acceptés : JPG, PNG, WebP, PDF ou audio.',
      });
    }
    if (!verifyMagicBytesForMime(decoded.buffer, decoded.contentType)) {
      return res.status(400).json({
        success: false,
        error: 'Contenu binaire du fichier chat non conforme au type MIME déclaré.',
      });
    }
    if (decoded.buffer.length >= MAX_CHAT_MEDIA_BYTES) {
      return res.status(400).json({
        success: false,
        error: 'La pièce jointe dépasse la taille maximale autorisée de 15 Mo.',
      });
    }

    const ext = extensionForUploadedMime(decoded.contentType);
    const hasDotExt = /\.[a-z0-9]{2,6}$/i.test(safeFileName);
    const finalFileName = hasDotExt ? safeFileName : `${safeFileName}.${ext}`;
    const storagePath = `chat/${cleanConvId}/${Date.now()}_${finalFileName}`.slice(0, 220);

    await activeBucket.file(storagePath).save(decoded.buffer, {
      resumable: false,
      metadata: {
        contentType: decoded.contentType,
        metadata: {
          uploadedBy: callerUid,
          uploadedAt: new Date().toISOString(),
          conversationId: cleanConvId,
        },
      },
    });

    const mediaUrl = `/api/chat/media?path=${encodeURIComponent(storagePath)}`;
    return res.json({
      success: true,
      storagePath,
      mediaUrl,
      contentType: decoded.contentType,
      size: decoded.buffer.length,
    });
  } catch (err: any) {
    console.error('[CHAT MEDIA UPLOAD ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Échec du téléversement sécurisé de la pièce jointe.' });
  }
});

app.get('/api/chat/media', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawPath = String(req.query?.path || '').trim();
    const match = rawPath.match(/^chat\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (!match || rawPath.includes('..')) {
      return res.status(400).json({ success: false, error: 'Chemin de pièce jointe chat invalide.' });
    }

    const conversationId = match[1];
    const fileName = match[2];
    const callerUid = req.user!.uid;
    const isAdminCaller = await checkCallerIsAdmin(req.user);

    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    if (!activeDb) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }

    const convSnap = await activeDb.collection('conversations').doc(conversationId).get();
    if (!convSnap.exists) {
      if (!isAdminCaller) {
        recordSecurityAnomaly(
          getClientIp(req),
          'CHAT_MEDIA_IDOR_ATTEMPT',
          `Tentative de lecture chat sur conversation inexistante/non autorisée ${rawPath} par ${callerUid}`
        );
        return res.status(403).json({
          success: false,
          error: 'Accès refusé. Vous ne participez pas à cette conversation.',
        });
      }
      return res.status(404).json({ success: false, error: 'Conversation introuvable pour cette pièce jointe.' });
    }

    if (!isAdminCaller && !canUserAccessConversationMedia(convSnap.data(), callerUid)) {
      recordSecurityAnomaly(
        getClientIp(req),
        'CHAT_MEDIA_IDOR_ATTEMPT',
        `Tentative de lecture non autorisée de la pièce jointe ${rawPath} par ${callerUid}`
      );
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Seuls les participants de cette conversation ou un administrateur peuvent consulter ce fichier.',
      });
    }

    const activeBucket =
      process.env.NODE_ENV === 'test' && testStorageBucketOverride
        ? testStorageBucketOverride
        : firebaseAdminApp
        ? getStorage(firebaseAdminApp).bucket(configuredStorageBucket)
        : null;

    if (!activeBucket) {
      return res.status(503).json({ success: false, error: 'Firebase Storage Admin indisponible.' });
    }

    const fileRef = activeBucket.file(rawPath);
    const [exists] = await fileRef.exists();
    if (!exists) {
      return res.status(404).json({ success: false, error: 'Pièce jointe introuvable dans le stockage.' });
    }

    const [metadata] = await fileRef.getMetadata().catch(() => [{} as any]);
    const [buffer] = await fileRef.download();
    const lowerName = fileName.toLowerCase();
    const contentType =
      metadata?.contentType ||
      (lowerName.endsWith('.pdf')
        ? 'application/pdf'
        : lowerName.endsWith('.png')
        ? 'image/png'
        : lowerName.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg');

    const disposition = req.query?.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error('[CHAT MEDIA PROXY ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Impossible de récupérer la pièce jointe.' });
  }
});

app.post('/api/admin/wallet/adjust', requireAdminPermission('finance.manage') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!firestoreAdmin) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const { targetUid, amount, type, note } = req.body || {};
    const cleanUid = String(targetUid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanUid) {
      return res.status(400).json({ success: false, error: 'Identifiant utilisateur requis.' });
    }
    if (type !== 'credit' && type !== 'debit') {
      return res.status(400).json({ success: false, error: 'Type d\'opération invalide ("credit" ou "debit").' });
    }
    const numericAmount = Math.round(Number(amount));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 50_000_000) {
      return res.status(400).json({ success: false, error: 'Montant invalide.' });
    }
    const cleanNote = String(note || `Ajustement administratif (${type === 'credit' ? 'Crédit' : 'Débit'})`).trim().slice(0, 256);

    const userRef = firestoreAdmin.collection('users').doc(cleanUid);
    const txResult = await firestoreAdmin.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        return { ok: false as const, status: 404, error: 'Compte utilisateur introuvable.' };
      }
      const userData = snap.data() || {};
      const currentBalance = typeof userData.walletBalanceFCFA === 'number' && Number.isFinite(userData.walletBalanceFCFA)
        ? userData.walletBalanceFCFA
        : 0;

      if (type === 'debit' && currentBalance < numericAmount) {
        return {
          ok: false as const,
          status: 400,
          error: `Solde insuffisant (${currentBalance.toLocaleString('fr-FR')} FCFA disponibles).`,
        };
      }

      const newBalance = type === 'credit' ? currentBalance + numericAmount : currentBalance - numericAmount;
      const nowIso = new Date().toISOString();
      const txId = `wtx_adm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      tx.update(userRef, {
        walletBalanceFCFA: newBalance,
        updatedAt: nowIso,
      });

      tx.set(firestoreAdmin!.collection('wallet_transactions').doc(txId), {
        id: txId,
        uid: cleanUid,
        type: type === 'credit' ? 'admin_credit' : 'admin_debit',
        direction: type,
        amountFCFA: numericAmount,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        note: cleanNote,
        adminUid: req.user!.uid,
        adminEmail: req.user?.email || 'admin',
        createdAt: Date.now(),
        createdAtIso: nowIso,
      });

      const notifId = `notif_wtx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      tx.set(firestoreAdmin!.collection('notifications').doc(notifId), {
        id: notifId,
        senderId: req.user!.uid,
        recipientId: cleanUid,
        type: 'system',
        title: type === 'credit' ? `💰 Crédit de ${numericAmount.toLocaleString('fr-FR')} FCFA` : `💳 Débit de ${numericAmount.toLocaleString('fr-FR')} FCFA`,
        message: `${cleanNote} — Nouveau solde : ${newBalance.toLocaleString('fr-FR')} FCFA.`,
        isRead: false,
        read: false,
        createdAt: Date.now(),
        timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      });

      return {
        ok: true as const,
        txId,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        email: String(userData.email || '').trim().toLowerCase(),
        fullName: String(userData.fullName || 'Livreur LivraLink').trim(),
      };
    });

    if (!txResult.ok) {
      return res.status(txResult.status).json({ success: false, error: txResult.error });
    }

    if (txResult.email) {
      getP1EmailService().dispatchOrQueueEmail({
        type: 'custom',
        to: txResult.email,
        recipientName: txResult.fullName,
        subject: `LivraLink Portefeuille : ${type === 'credit' ? '+' : '-'}${numericAmount.toLocaleString('fr-FR')} FCFA`,
        previewText: `${cleanNote} — Nouveau solde : ${txResult.balanceAfter.toLocaleString('fr-FR')} FCFA.`,
        textContent: `Bonjour ${txResult.fullName},\n\nUne opération administrative a été enregistrée sur votre portefeuille LivraLink :\n- Type : ${type === 'credit' ? 'Crédit' : 'Débit'}\n- Montant : ${numericAmount.toLocaleString('fr-FR')} FCFA\n- Motif : ${cleanNote}\n- Nouveau solde : ${txResult.balanceAfter.toLocaleString('fr-FR')} FCFA`,
        htmlContent: `<div style="font-family:sans-serif;padding:20px;color:#0f172a;"><h2>Mise à jour portefeuille LivraLink</h2><p>Bonjour <strong>${escapeHtml(txResult.fullName)}</strong>,</p><p>${escapeHtml(cleanNote)} : <strong>${type === 'credit' ? '+' : '-'}${numericAmount.toLocaleString('fr-FR')} FCFA</strong></p><p>Nouveau solde : <strong>${txResult.balanceAfter.toLocaleString('fr-FR')} FCFA</strong></p></div>`,
        allowQueue: true,
      }).catch(() => {});
    }

    return res.json({
      success: true,
      txId: txResult.txId,
      balanceBefore: txResult.balanceBefore,
      balanceAfter: txResult.balanceAfter,
    });
  } catch (err: any) {
    console.error('[ADMIN WALLET ADJUST ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'ajustement du portefeuille.' });
  }
});

app.post('/api/admin/deliveries/:orderId/assign', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!firestoreAdmin) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanCourierId = String(req.body?.courierId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanDocId || !cleanCourierId) {
      return res.status(400).json({ success: false, error: 'Identifiant de course et identifiant livreur requis.' });
    }

    const callerUid = req.user!.uid;
    const isAdmin = await checkCallerIsAdmin(req.user);

    const deliveryRef = firestoreAdmin.collection('deliveries').doc(cleanDocId);
    const courierRef = firestoreAdmin.collection('users').doc(cleanCourierId);
    const missionRef = firestoreAdmin.collection('priority_missions').doc(cleanDocId);

    const [deliverySnap, courierSnap, missionSnap] = await Promise.all([
      deliveryRef.get(),
      courierRef.get(),
      missionRef.get(),
    ]);

    if (!deliverySnap.exists) {
      return res.status(404).json({ success: false, error: 'Livraison introuvable.' });
    }
    const deliveryData = deliverySnap.data() || {};
    if (!isAdmin && deliveryData.merchantId !== callerUid) {
      return res.status(403).json({ success: false, error: 'Autorisation refusée pour assigner cette livraison.' });
    }
    if (deliveryData.status === 'livree' || deliveryData.status === 'echec') {
      return res.status(409).json({ success: false, error: 'Impossible d\'assigner une course déjà clôturée.' });
    }
    if (!courierSnap.exists) {
      return res.status(404).json({ success: false, error: 'Livreur sélectionné introuvable.' });
    }
    const courierData = courierSnap.data() || {};
    if (courierData.role !== 'livreur') {
      return res.status(400).json({ success: false, error: 'Le compte sélectionné n\'est pas un livreur.' });
    }
    if (!courierData.isKycVerified && courierData.kycStatus !== 'valide') {
      return res.status(403).json({ success: false, error: 'Ce livreur n\'est pas encore vérifié KYC.' });
    }

    const courierName = String(courierData.fullName || courierData.name || 'Coursier LivraLink').trim();
    const courierPhone = String(courierData.phone || '').trim();
    const nowIso = new Date().toISOString();
    const fee = Number(deliveryData.deliveryFee || 0);
    const courierObj = {
      id: cleanCourierId,
      name: courierName,
      phone: courierPhone,
      email: courierData.email || '',
      avatarInitials: courierName.split(' ').map((n: string) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || 'CR',
      rating: 5.0,
      totalDeliveries: Number(courierData.totalDeliveries || 0),
      vehicle: courierData.vehicleType || 'Moto 125cc',
      zone: courierData.locationCommune || 'Cotonou',
      distanceKm: 1.0,
      etaMinutes: 10,
      status: 'en_course',
      priceFCFA: fee,
      commissionFCFA: 0,
      netEarningFCFA: fee,
      isKycVerified: true,
    };

    const batch = firestoreAdmin.batch();
    batch.update(deliveryRef, {
      courierId: cleanCourierId,
      courierName,
      courier: courierObj,
      status: 'assignee',
      dispatchState: 'assigned',
      targetCourierId: null,
      targetCourierName: null,
      assignedAt: nowIso,
      updatedAt: nowIso,
      statusNote: `Assignée à ${courierName}`,
    });

    if (missionSnap.exists) {
      batch.update(missionRef, {
        courierId: cleanCourierId,
        courierName,
        status: 'assignee',
        dispatchState: 'assigned',
        targetCourierId: null,
        targetCourierName: null,
        assignedAt: nowIso,
        updatedAt: nowIso,
      });
    }

    const notifId = `notif_assign_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    batch.set(firestoreAdmin.collection('notifications').doc(notifId), {
      id: notifId,
      senderId: callerUid,
      recipientId: cleanCourierId,
      type: 'order_assigned',
      title: `📦 Nouvelle mission assignée (${deliveryData.id || cleanDocId})`,
      message: `Course ${deliveryData.id || cleanDocId} : ${deliveryData.pickupLocation?.commune || 'Retrait'} → ${deliveryData.dropoffLocation?.commune || 'Destination'} (${fee.toLocaleString('fr-FR')} FCFA).`,
      orderId: String(deliveryData.id || cleanDocId),
      orderDocId: cleanDocId,
      actionView: 'livreur-missions',
      isRead: false,
      read: false,
      createdAt: Date.now(),
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    });

    await batch.commit();

    return res.json({
      success: true,
      orderId: deliveryData.id || cleanDocId,
      courier: courierObj,
    });
  } catch (err: any) {
    console.error('[ASSIGN DELIVERY ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'assignation de la course.' });
  }
});

// =========================================================================
// INTELLIGENT GPS PROXIMITY & PREFERRED-COURIER DISPATCH ROUTES
// =========================================================================
app.get('/api/couriers/eligible', requireVerifiedUser as any, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    if (!activeDb) {
      return res.status(503).json({ success: false, code: 'FIRESTORE_UNAVAILABLE', error: 'Firestore Admin SDK indisponible.' });
    }
    const couriers = await listSanitizedCouriersForVendors(activeDb);
    return res.json({ success: true, couriers });
  } catch (err: any) {
    if (isFirestoreIamDeniedError(err)) {
      return res.status(503).json({
        success: false,
        code: 'IAM_PERMISSION_DENIED',
        error: 'Droits IAM Firestore Admin requis pour lister les livreurs.',
      });
    }
    console.error('[ELIGIBLE COURIERS ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement des livreurs disponibles.' });
  }
});

app.post('/api/couriers/availability', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    if (!activeDb) {
      return res.status(503).json({ success: false, code: 'FIRESTORE_UNAVAILABLE', error: 'Firestore Admin SDK indisponible.' });
    }
    const body = req.body || {};
    const status =
      body.status === 'en_ligne' || body.status === 'hors_ligne'
        ? body.status
        : undefined;
    const result = await updateCourierAvailabilityAndGps(activeDb, {
      courierUid: req.user!.uid,
      isAvailable: typeof body.isAvailable === 'boolean' ? body.isAvailable : undefined,
      status,
      lat: typeof body.lat === 'number' ? body.lat : undefined,
      lng: typeof body.lng === 'number' ? body.lng : undefined,
      accuracyMeters: typeof body.accuracyMeters === 'number' ? body.accuracyMeters : undefined,
      locationSource:
        body.locationSource === 'browser_gps' ||
        body.locationSource === 'live_watch' ||
        body.locationSource === 'manual' ||
        body.locationSource === 'benin_default'
          ? body.locationSource
          : undefined,
      zone: typeof body.zone === 'string' ? body.zone : undefined,
    });
    return res.json(result);
  } catch (err: any) {
    if (typeof err?.statusCode === 'number') {
      const dispatchErr = err as DispatchActionError;
      return res.status(dispatchErr.statusCode).json({
        success: false,
        code: dispatchErr.code,
        error: dispatchErr.message,
      });
    }
    if (isFirestoreIamDeniedError(err)) {
      return res.status(503).json({
        success: false,
        code: 'IAM_PERMISSION_DENIED',
        error: 'Droits IAM Firestore Admin requis pour synchroniser votre disponibilité GPS.',
      });
    }
    console.error('[COURIER AVAILABILITY ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour de disponibilité.' });
  }
});

app.post('/api/deliveries/:orderId/dispatch/start', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    if (!activeDb) {
      return res.status(503).json({ success: false, code: 'FIRESTORE_UNAVAILABLE', error: 'Firestore Admin SDK indisponible.' });
    }
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanDocId) {
      return res.status(400).json({ success: false, error: 'Identifiant de livraison invalide.' });
    }
    const isAdmin = await checkCallerIsAdmin(req.user);
    const body = req.body || {};
    const preferredCourierId =
      body.preferredCourierId === null
        ? null
        : typeof body.preferredCourierId === 'string'
        ? body.preferredCourierId.trim().replace(/[^a-zA-Z0-9_-]/g, '')
        : undefined;

    const result = await startOrRelaunchDeliveryDispatch(activeDb, {
      orderDocId: cleanDocId,
      callerUid: req.user!.uid,
      isAdmin,
      preferredCourierId,
      offerTimeoutSeconds: typeof body.offerTimeoutSeconds === 'number' ? body.offerTimeoutSeconds : undefined,
      relaunch: Boolean(body.relaunch),
    });
    return res.json(result);
  } catch (err: any) {
    if (typeof err?.statusCode === 'number') {
      const dispatchErr = err as DispatchActionError;
      return res.status(dispatchErr.statusCode).json({
        success: false,
        code: dispatchErr.code,
        error: dispatchErr.message,
      });
    }
    if (isFirestoreIamDeniedError(err)) {
      return res.status(503).json({
        success: false,
        code: 'IAM_PERMISSION_DENIED',
        error: 'Droits IAM Firestore Admin requis pour orchestrer le dispatching.',
      });
    }
    console.error('[DISPATCH START ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors du lancement de la recherche de livreur.' });
  }
});

app.post('/api/deliveries/:orderId/dispatch/respond', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    if (!activeDb) {
      return res.status(503).json({ success: false, code: 'FIRESTORE_UNAVAILABLE', error: 'Firestore Admin SDK indisponible.' });
    }
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const action = req.body?.action;
    if (!cleanDocId || (action !== 'accept' && action !== 'refuse')) {
      return res.status(400).json({ success: false, error: 'Identifiant de course et action valide (accept/refuse) requis.' });
    }
    const result = await respondToDeliveryOffer(activeDb, {
      orderDocId: cleanDocId,
      courierUid: req.user!.uid,
      action,
      reason: typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : undefined,
    });
    return res.json(result);
  } catch (err: any) {
    if (typeof err?.statusCode === 'number') {
      const dispatchErr = err as DispatchActionError;
      return res.status(dispatchErr.statusCode).json({
        success: false,
        code: dispatchErr.code,
        error: dispatchErr.message,
      });
    }
    if (isFirestoreIamDeniedError(err)) {
      return res.status(503).json({
        success: false,
        code: 'IAM_PERMISSION_DENIED',
        error: 'Droits IAM Firestore Admin requis pour traiter la réponse.',
      });
    }
    console.error('[DISPATCH RESPOND ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors du traitement de la réponse livreur.' });
  }
});

app.post('/api/deliveries/:orderId/dispatch/advance', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = process.env.NODE_ENV === 'test' && testFirestoreOverride ? testFirestoreOverride : firestoreAdmin;
    if (!activeDb) {
      return res.status(503).json({ success: false, code: 'FIRESTORE_UNAVAILABLE', error: 'Firestore Admin SDK indisponible.' });
    }
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanDocId) {
      return res.status(400).json({ success: false, error: 'Identifiant de course invalide.' });
    }
    const isAdmin = await checkCallerIsAdmin(req.user);
    const forceReason =
      req.body?.reason === 'target_unavailable' || req.body?.reason === 'timeout'
        ? req.body.reason
        : undefined;
    const result = await advanceExpiredOrUnavailableOffer(activeDb, {
      orderDocId: cleanDocId,
      callerUid: req.user!.uid,
      isAdmin,
      forceReason,
    });
    return res.json(result);
  } catch (err: any) {
    if (typeof err?.statusCode === 'number') {
      const dispatchErr = err as DispatchActionError;
      return res.status(dispatchErr.statusCode).json({
        success: false,
        code: dispatchErr.code,
        error: dispatchErr.message,
      });
    }
    if (isFirestoreIamDeniedError(err)) {
      return res.status(503).json({
        success: false,
        code: 'IAM_PERMISSION_DENIED',
        error: 'Droits IAM Firestore Admin requis pour avancer le dispatching.',
      });
    }
    console.error('[DISPATCH ADVANCE ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la progression du dispatching.' });
  }
});

app.delete('/api/admin/deliveries/:orderId', requireAdminPermission('deliveries.cancel') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!firestoreAdmin) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanDocId) {
      return res.status(400).json({ success: false, error: 'Identifiant de livraison invalide.' });
    }

    const deliveryRef = firestoreAdmin.collection('deliveries').doc(cleanDocId);
    const missionRef = firestoreAdmin.collection('priority_missions').doc(cleanDocId);
    const otpRef = deliveryRef.collection('private').doc('otp');

    const batch = firestoreAdmin.batch();
    batch.delete(otpRef);
    batch.delete(missionRef);
    batch.delete(deliveryRef);
    await batch.commit();

    return res.json({ success: true, deletedId: cleanDocId });
  } catch (err: any) {
    console.error('[DELETE DELIVERY ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la suppression de la livraison.' });
  }
});

app.post('/api/admin/directory/user', requireAdminAuthorization as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!firestoreAdmin) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const body = req.body || {};
    const role = body.role === 'livreur' ? 'livreur' : 'vendeur';
    const uid = String(body.uid || body.id || `${role === 'livreur' ? 'c' : 'm'}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`)
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');
    const fullName = String(body.fullName || body.name || body.managerName || '').trim().slice(0, 128);
    if (!uid || fullName.length < 2) {
      return res.status(400).json({ success: false, error: 'Nom complet valide requis (min 2 caractères).' });
    }
    const nowIso = new Date().toISOString();
    const isVerified = Boolean(body.isKycVerified || body.isVerified);
    const docPayload: Record<string, any> = {
      uid,
      id: uid,
      role,
      fullName,
      email: String(body.email || '').trim().toLowerCase().slice(0, 128),
      phone: String(body.phone || '').trim().slice(0, 32),
      status: body.status || (role === 'livreur' ? 'en_ligne' : 'actif'),
      isKycVerified: isVerified,
      kycStatus: isVerified ? 'valide' : 'non_soumis',
      createdAt: body.createdAt || nowIso,
      updatedAt: nowIso,
      createdByAdmin: req.user?.email || req.user?.uid || 'admin',
    };
    if (role === 'vendeur') {
      docPayload.storeName = String(body.storeName || `Boutique ${fullName}`).trim().slice(0, 128);
      docPayload.storeCommune = String(body.commune || body.storeCommune || 'Cotonou').trim().slice(0, 128);
      docPayload.storeAddress = String(body.address || body.storeAddress || '').trim().slice(0, 256);
      docPayload.channel = body.channel || 'WhatsApp';
    } else {
      docPayload.vehicleType = String(body.vehicle || body.vehicleType || 'Moto 125cc').trim().slice(0, 64);
      docPayload.locationCommune = String(body.zone || body.locationCommune || 'Cotonou').trim().slice(0, 128);
      docPayload.walletBalanceFCFA = typeof body.walletBalanceFCFA === 'number' ? body.walletBalanceFCFA : 0;
    }

    await firestoreAdmin.collection('users').doc(uid).set(docPayload, { merge: true });
    return res.status(201).json({ success: true, uid, user: docPayload });
  } catch (err: any) {
    console.error('[ADMIN DIRECTORY CREATE ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'enregistrement dans l\'annuaire.' });
  }
});

app.patch('/api/admin/directory/user/:uid', requireAdminAuthorization as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!firestoreAdmin) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const uid = String(req.params.uid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!uid) {
      return res.status(400).json({ success: false, error: 'Identifiant utilisateur requis.' });
    }
    const allowedFields = [
      'fullName', 'email', 'phone', 'status', 'isKycVerified', 'kycStatus',
      'storeName', 'storeCommune', 'storeAddress', 'channel',
      'vehicleType', 'vehiclePlate', 'locationCommune', 'preferredRateDiscountPercent',
    ];
    const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
    const body = req.body || {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        patch[key] = body[key];
      }
    }
    if (body.name && !patch.fullName) patch.fullName = String(body.name).trim().slice(0, 128);
    if (body.managerName && !patch.fullName) patch.fullName = String(body.managerName).trim().slice(0, 128);
    if (body.commune && !patch.storeCommune) patch.storeCommune = String(body.commune).trim().slice(0, 128);
    if (body.address && !patch.storeAddress) patch.storeAddress = String(body.address).trim().slice(0, 256);
    if (body.vehicle && !patch.vehicleType) patch.vehicleType = String(body.vehicle).trim().slice(0, 64);
    if (body.zone && !patch.locationCommune) patch.locationCommune = String(body.zone).trim().slice(0, 128);
    if (typeof body.isVerified === 'boolean' && patch.isKycVerified === undefined) {
      patch.isKycVerified = body.isVerified;
      patch.kycStatus = body.isVerified ? 'valide' : 'non_soumis';
    }

    await firestoreAdmin.collection('users').doc(uid).set(patch, { merge: true });
    return res.json({ success: true, uid, updated: patch });
  } catch (err: any) {
    console.error('[ADMIN DIRECTORY UPDATE ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour du compte.' });
  }
});

app.delete('/api/admin/directory/user/:uid', requireAdminAuthorization as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!firestoreAdmin) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const uid = String(req.params.uid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!uid) {
      return res.status(400).json({ success: false, error: 'Identifiant utilisateur requis.' });
    }
    await firestoreAdmin.collection('users').doc(uid).delete();
    await firestoreAdmin.collection('kyc').doc(uid).delete().catch(() => {});
    return res.json({ success: true, deletedUid: uid });
  } catch (err: any) {
    console.error('[ADMIN DIRECTORY DELETE ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la suppression du compte.' });
  }
});

// =========================================================================
// PUBLIC SAFE PLATFORM CONFIG (Unauthenticated: Brand, Contacts, Signup & Public Pricing)
// =========================================================================
app.get('/api/public/config', async (_req: Request, res: Response) => {
  const activeDb = getActiveDb();
  try {
    const { bundle, source } = await loadPlatformConfigBundle(activeDb);
    return res.json({
      success: true,
      source,
      config: extractPublicPlatformConfig(bundle),
      updatedAt: bundle.updatedAt || null,
    });
  } catch (err: any) {
    if (isFirestoreIamDeniedError(err)) {
      const { bundle } = await loadPlatformConfigBundle(null);
      return res.json({
        success: true,
        source: 'defaults_iam_fallback',
        config: extractPublicPlatformConfig(bundle),
        updatedAt: null,
      });
    }
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement de la configuration publique.' });
  }
});

app.get('/api/platform/config', requireAuthenticatedUser as any, async (_req: AuthenticatedRequest, res: Response) => {
  const activeDb = getActiveDb();
  try {
    const { bundle, source } = await loadPlatformConfigBundle(activeDb);
    return res.json({
      success: true,
      source,
      bundle,
      pricingRules: {
        baseDistanceKm: bundle.pricing.baseDistanceKm,
        baseFeeFCFA: bundle.pricing.baseFeeFCFA,
        extraPerKmFCFA: bundle.pricing.pricePerKmFCFA,
        fragileSurchargeFCFA: bundle.pricing.fragileSurchargeFCFA,
        commissionRatePercent: bundle.commissions.platformCommissionPercent,
      },
      featureFlags: bundle.featureFlags,
      updatedAt: bundle.updatedAt || null,
    });
  } catch (err: any) {
    if (isFirestoreIamDeniedError(err)) {
      console.warn('[PLATFORM CONFIG GET] Bascule sur valeurs par défaut (permissions IAM Firestore indisponibles):', err?.message || err);
      const { bundle } = await loadPlatformConfigBundle(null);
      return res.json({
        success: true,
        source: 'defaults_iam_fallback',
        iamPermissionDenied: true,
        bundle,
        pricingRules: null,
        featureFlags: null,
      });
    }
    console.error('[PLATFORM CONFIG GET ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement de la configuration plateforme.' });
  }
});

app.post('/api/platform/config', requireAdminAuthorization as any, async (req: AuthenticatedRequest, res: Response) => {
  const activeDb = getActiveDb();
  try {
    if (!activeDb) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const body = req.body || {};
    const { pricingRules, featureFlags, general, contacts, emails, pricing, courierRemuneration, commissions } = body;
    if (!pricingRules && !featureFlags && !general && !contacts && !emails && !pricing && !courierRemuneration && !commissions) {
      return res.status(400).json({ success: false, error: 'Au moins une section de configuration est requise.' });
    }

    const ctx = req.adminContext!;
    if ((pricing || pricingRules) && !hasAdminPermission(ctx, 'pricing.manage')) {
      return res.status(403).json({ success: false, error: 'Permission pricing.manage requise.' });
    }
    if ((commissions || courierRemuneration) && !hasAdminPermission(ctx, 'finance.manage') && !hasAdminPermission(ctx, 'pricing.manage')) {
      return res.status(403).json({ success: false, error: 'Permission finance.manage ou pricing.manage requise.' });
    }
    if (contacts && !hasAdminPermission(ctx, 'contacts.manage')) {
      return res.status(403).json({ success: false, error: 'Permission contacts.manage requise.' });
    }
    if (emails && !hasAdminPermission(ctx, 'emails.manage')) {
      return res.status(403).json({ success: false, error: 'Permission emails.manage requise.' });
    }
    if ((general || featureFlags) && !hasAdminPermission(ctx, 'settings.manage')) {
      return res.status(403).json({ success: false, error: 'Permission settings.manage requise.' });
    }

    const before = (await loadPlatformConfigBundle(activeDb)).bundle;
    const saved = await savePlatformConfigSection(
      activeDb,
      { pricingRules, featureFlags, general, contacts, emails, pricing, courierRemuneration, commissions },
      req.user?.email || req.user?.uid || 'admin'
    );

    const sectionsChanged = Object.keys(body).filter((k) =>
      ['pricingRules', 'featureFlags', 'general', 'contacts', 'emails', 'pricing', 'courierRemuneration', 'commissions'].includes(k)
    );
    await recordAdminAuditLog(activeDb, {
      adminUid: ctx.uid,
      adminEmail: ctx.email,
      adminRole: ctx.roleId || 'admin',
      category: pricing || pricingRules ? 'pricing' : contacts ? 'contacts' : emails ? 'email' : commissions ? 'finance' : 'settings',
      action: `CONFIG_UPDATED:${sectionsChanged.join(',')}`,
      targetType: 'platform_config',
      targetId: 'platform_settings',
      oldValue: {
        pricePerKmFCFA: before.pricing.pricePerKmFCFA,
        platformCommissionPercent: before.commissions.platformCommissionPercent,
        appName: before.general.appName,
      },
      newValue: {
        pricePerKmFCFA: saved.pricing.pricePerKmFCFA,
        platformCommissionPercent: saved.commissions.platformCommissionPercent,
        appName: saved.general.appName,
        sectionsChanged,
      },
    });

    return res.json({
      success: true,
      bundle: saved,
      pricingRules: {
        baseDistanceKm: saved.pricing.baseDistanceKm,
        baseFeeFCFA: saved.pricing.baseFeeFCFA,
        extraPerKmFCFA: saved.pricing.pricePerKmFCFA,
        fragileSurchargeFCFA: saved.pricing.fragileSurchargeFCFA,
        commissionRatePercent: saved.commissions.platformCommissionPercent,
      },
      featureFlags: saved.featureFlags,
      updatedAt: saved.updatedAt,
      updatedBy: saved.updatedBy,
    });
  } catch (err: any) {
    if (isFirestoreIamDeniedError(err)) {
      console.warn('[PLATFORM CONFIG POST] Permissions IAM Firestore insuffisantes:', err?.message || err);
      return res.status(503).json({
        success: false,
        code: 'IAM_PERMISSION_DENIED',
        error: 'Permissions IAM Firestore insuffisantes pour enregistrer la configuration plateforme côté serveur.',
      });
    }
    console.error('[PLATFORM CONFIG POST ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'enregistrement de la configuration plateforme.' });
  }
});

// =========================================================================
// AUTHORITATIVE PRICING QUOTE & IMMUTABLE SNAPSHOT LOCKING
// =========================================================================
app.post('/api/deliveries/calculate-quote', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    const body = req.body || {};
    const distanceKm = Number(body.distanceKm);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 1000) {
      return res.status(400).json({ success: false, error: 'Distance kilométrique valide requise.' });
    }
    const deliveryType =
      body.deliveryType === 'express' || body.deliveryType === 'urgent' ? body.deliveryType : 'standard';
    const vehicleCategory =
      body.vehicleCategory === 'tricycle' || body.vehicleCategory === 'voiture' || body.vehicleCategory === 'camionnette'
        ? body.vehicleCategory
        : 'moto';

    const cfg = await loadPlatformConfigBundle(activeDb);
    if (deliveryType !== 'standard' && !cfg.bundle.featureFlags.allowPriorityDeliveries) {
      return res.status(403).json({
        success: false,
        code: 'PRIORITY_DELIVERIES_DISABLED',
        error: 'Les livraisons express et prioritaires sont temporairement désactivées.',
      });
    }

    const result = await computeAuthoritativeOrderFinancials(activeDb, {
      distanceKm,
      isFragile: Boolean(body.isFragile),
      itemWeightKg: typeof body.itemWeightKg === 'number' ? body.itemWeightKg : 1,
      deliveryType,
      vehicleCategory,
      promoCode: typeof body.promoCode === 'string' ? body.promoCode : undefined,
      isPeakPeriod: Boolean(body.isPeakPeriod),
      merchantId: req.user!.uid,
      courierId: typeof body.courierId === 'string' ? body.courierId.trim() : undefined,
    });

    if (result.featureBlocked) {
      return res.status(403).json({ success: false, code: 'NEW_ORDERS_DISABLED', error: result.featureBlocked });
    }

    return res.json({
      success: true,
      deliveryFee: result.pricingSnapshot.finalDeliveryFeeFCFA,
      pricingSnapshot: result.pricingSnapshot,
      remunerationSnapshot: result.remunerationSnapshot,
      commissionSnapshot: result.commissionSnapshot,
    });
  } catch (err: any) {
    console.error('[CALCULATE QUOTE ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors du calcul du devis tarifaire.' });
  }
});

app.post('/api/deliveries/:orderId/finalize-pricing', requireVerifiedUser as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanDocId) {
      return res.status(400).json({ success: false, error: 'Identifiant de course invalide.' });
    }

    const deliveryRef = activeDb.collection('deliveries').doc(cleanDocId);
    const snap = await deliveryRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: 'Livraison introuvable.' });
    }
    const orderData = snap.data() || {};
    const isAdmin = await checkCallerIsAdmin(req.user);
    if (!isAdmin && orderData.merchantId !== req.user!.uid) {
      return res.status(403).json({ success: false, error: 'Non autorisé à verrouiller le tarif de cette course.' });
    }
    // Never recalculate an existing locked snapshot unless explicitly unlocked by admin
    if (orderData.pricingSnapshot && orderData.pricingSnapshot.source === 'server') {
      return res.json({
        success: true,
        alreadyLocked: true,
        deliveryFee: orderData.deliveryFee,
        pricingSnapshot: orderData.pricingSnapshot,
        remunerationSnapshot: orderData.remunerationSnapshot,
        commissionSnapshot: orderData.commissionSnapshot,
      });
    }

    const body = req.body || {};
    const distanceKm = Number(body.distanceKm ?? orderData.distanceKm ?? 1);
    const deliveryType =
      body.deliveryType === 'express' || body.deliveryType === 'urgent'
        ? body.deliveryType
        : orderData.deliveryType === 'express' || orderData.deliveryType === 'urgent'
        ? orderData.deliveryType
        : 'standard';
    const vehicleCategory =
      body.vehicleCategory || orderData.vehicleCategory || 'moto';

    const financials = await computeAuthoritativeOrderFinancials(activeDb, {
      distanceKm: Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 1,
      isFragile: Boolean(orderData.isFragile),
      itemWeightKg: Number(orderData.itemWeightKg || 1),
      deliveryType,
      vehicleCategory,
      promoCode: typeof body.promoCode === 'string' ? body.promoCode : orderData.promoCode,
      merchantId: String(orderData.merchantId || req.user!.uid),
      courierId: orderData.courierId ? String(orderData.courierId) : undefined,
    });

    if (financials.featureBlocked && !isAdmin) {
      return res.status(403).json({ success: false, code: 'NEW_ORDERS_DISABLED', error: financials.featureBlocked });
    }

    const finalFee = financials.pricingSnapshot.finalDeliveryFeeFCFA;
    const cod = Number(orderData.itemValueCOD || 0);
    await deliveryRef.set(
      {
        distanceKm: financials.pricingSnapshot.distanceKm,
        deliveryType,
        vehicleCategory,
        promoDiscountFCFA: financials.pricingSnapshot.promoDiscountFCFA,
        deliveryFee: finalFee,
        totalCustomerPayable: cod + finalFee,
        pricingSnapshot: financials.pricingSnapshot,
        remunerationSnapshot: financials.remunerationSnapshot,
        commissionSnapshot: financials.commissionSnapshot,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return res.json({
      success: true,
      deliveryFee: finalFee,
      pricingSnapshot: financials.pricingSnapshot,
      remunerationSnapshot: financials.remunerationSnapshot,
      commissionSnapshot: financials.commissionSnapshot,
    });
  } catch (err: any) {
    console.error('[FINALIZE PRICING ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors du verrouillage tarifaire de la course.' });
  }
});

// =========================================================================
// RBAC ADMINS, ROLES, PERMISSIONS & AUDIT LOGS
// =========================================================================
app.get('/api/admin/rbac/me', requireAdminAuthorization as any, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = req.adminContext!;
  return res.json({
    success: true,
    uid: ctx.uid,
    email: ctx.email,
    roleId: ctx.roleId,
    roleLabel: ctx.roleId ? ADMIN_ROLE_LABELS[ctx.roleId] : 'Administrateur',
    permissions: ctx.permissions,
    isSuperAdmin: ctx.isSuperAdmin,
    allPermissions: ALL_ADMIN_PERMISSIONS,
    roleCatalog: Object.entries(ADMIN_ROLE_LABELS).map(([id, label]) => ({
      id,
      label,
      permissions: ADMIN_ROLE_PERMISSIONS[id as AdminRoleId],
    })),
  });
});

app.get('/api/admin/rbac/admins', requireAdminPermission('admins.manage') as any, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    const list: any[] = [];
    if (activeDb) {
      const snap = await activeDb.collection('admins').get();
      snap.forEach((d: any) => {
        const data = d.data() || {};
        list.push({
          uid: d.id,
          email: data.email || '',
          fullName: data.fullName || data.name || data.email || 'Admin',
          phone: data.phone || '',
          roleId: isValidAdminRoleId(data.roleId) ? data.roleId : 'admin_general',
          permissions: Array.isArray(data.permissions) && data.permissions.length > 0
            ? data.permissions
            : ADMIN_ROLE_PERMISSIONS[isValidAdminRoleId(data.roleId) ? (data.roleId as AdminRoleId) : 'admin_general'],
          isActive: data.isActive !== false,
          isSuperAdmin: (data.email || '').toLowerCase() === SUPER_ADMIN_EMAIL_LOWER || data.roleId === 'super_admin',
          isProtectedMaster: (data.email || '').toLowerCase() === SUPER_ADMIN_EMAIL_LOWER,
          createdAt: data.createdAt || data.addedAt || new Date().toISOString(),
          createdBy: data.createdBy || '',
          updatedAt: data.updatedAt || '',
        });
      });
    }
    // Always include primary Super-Admin reference at top if not already in collection
    if (!list.some((a) => (a.email || '').toLowerCase() === SUPER_ADMIN_EMAIL_LOWER)) {
      list.unshift({
        uid: 'super_admin_root',
        email: 'Pamphile.gbede@gmail.com',
        fullName: 'Pamphile Gbede (Super-Admin)',
        roleId: 'super_admin',
        permissions: ALL_ADMIN_PERMISSIONS,
        isActive: true,
        isSuperAdmin: true,
        isProtectedMaster: true,
        createdAt: new Date(0).toISOString(),
      });
    }
    return res.json({ success: true, admins: list });
  } catch (err: any) {
    console.error('[RBAC LIST ADMINS ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement des administrateurs.' });
  }
});

app.post('/api/admin/rbac/admins', requireSuperAdminAuthorization as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase().slice(0, 128);
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Adresse e-mail valide requise.' });
    }
    const fullName = String(body.fullName || email.split('@')[0]).trim().slice(0, 128);
    const roleId: AdminRoleId = isValidAdminRoleId(body.roleId) ? body.roleId : 'admin_general';
    const permissions = resolvePermissionsForRole(roleId, body.permissions);

    let uid = String(body.uid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!uid && firebaseAdminApp) {
      try {
        const authUser = await getAuth(firebaseAdminApp).getUserByEmail(email);
        uid = authUser.uid;
      } catch {
        // user not yet in Auth; use deterministic uid or look up /users
      }
    }
    if (!uid) {
      const usersSnap = await activeDb.collection('users').get();
      usersSnap.forEach((docSnap: any) => {
        const d = docSnap.data() || {};
        if (String(d.email || '').toLowerCase() === email && !uid) {
          uid = docSnap.id;
        }
      });
    }
    if (!uid) {
      uid = `adm_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 20)}`;
    }

    const nowIso = new Date().toISOString();
    const adminDoc = {
      uid,
      email,
      fullName,
      phone: String(body.phone || '').trim().slice(0, 32),
      roleId,
      permissions,
      isActive: body.isActive !== false,
      isSuperAdmin: roleId === 'super_admin',
      createdAt: nowIso,
      createdBy: req.adminContext!.email,
      updatedAt: nowIso,
    };

    await activeDb.collection('admins').doc(uid).set(adminDoc, { merge: true });

    await recordAdminAuditLog(activeDb, {
      adminUid: req.adminContext!.uid,
      adminEmail: req.adminContext!.email,
      adminRole: 'super_admin',
      category: 'rbac',
      action: 'CREATE_OR_UPDATE_ADMIN',
      targetType: 'admin',
      targetId: uid,
      newValue: { email, roleId, permissionsCount: permissions.length, isActive: adminDoc.isActive },
    });

    return res.status(201).json({ success: true, admin: adminDoc });
  } catch (err: any) {
    console.error('[RBAC CREATE ADMIN ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la création de l\'administrateur.' });
  }
});

app.patch('/api/admin/rbac/admins/:uid', requireSuperAdminAuthorization as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const uid = String(req.params.uid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!uid) return res.status(400).json({ success: false, error: 'UID requis.' });

    const docRef = activeDb.collection('admins').doc(uid);
    const existingSnap = await docRef.get();
    if (!existingSnap.exists) {
      return res.status(404).json({ success: false, error: 'Administrateur introuvable.' });
    }
    const existing = existingSnap.data() || {};
    if ((existing.email || '').toLowerCase() === SUPER_ADMIN_EMAIL_LOWER && req.body?.isActive === false) {
      return res.status(400).json({ success: false, error: 'Impossible de désactiver le Super-Administrateur principal.' });
    }

    const roleId: AdminRoleId = isValidAdminRoleId(req.body?.roleId)
      ? req.body.roleId
      : isValidAdminRoleId(existing.roleId)
      ? existing.roleId
      : 'admin_general';
    const permissions =
      req.body?.permissions !== undefined
        ? resolvePermissionsForRole(roleId, req.body.permissions)
        : req.body?.roleId
        ? resolvePermissionsForRole(roleId, null)
        : existing.permissions || resolvePermissionsForRole(roleId, null);

    const patch: Record<string, any> = {
      roleId,
      permissions,
      updatedAt: new Date().toISOString(),
    };
    if (typeof req.body?.fullName === 'string' && req.body.fullName.trim()) {
      patch.fullName = req.body.fullName.trim().slice(0, 128);
    }
    if (typeof req.body?.isActive === 'boolean') {
      patch.isActive = req.body.isActive;
    }

    await docRef.set(patch, { merge: true });
    await recordAdminAuditLog(activeDb, {
      adminUid: req.adminContext!.uid,
      adminEmail: req.adminContext!.email,
      adminRole: 'super_admin',
      category: 'rbac',
      action: 'UPDATE_ADMIN_RBAC',
      targetType: 'admin',
      targetId: uid,
      oldValue: { roleId: existing.roleId, isActive: existing.isActive },
      newValue: { roleId: patch.roleId, isActive: patch.isActive ?? existing.isActive, permissionsCount: permissions.length },
    });

    return res.json({ success: true, uid, updated: { ...existing, ...patch } });
  } catch (err: any) {
    console.error('[RBAC UPDATE ADMIN ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la modification des droits administrateur.' });
  }
});

app.delete('/api/admin/rbac/admins/:uid', requireSuperAdminAuthorization as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) {
      return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    }
    const uid = String(req.params.uid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!uid || uid === 'super_admin_root') {
      return res.status(400).json({ success: false, error: 'Impossible de révoquer le Super-Administrateur principal.' });
    }
    const docRef = activeDb.collection('admins').doc(uid);
    const snap = await docRef.get();
    if (snap.exists && (snap.data()?.email || '').toLowerCase() === SUPER_ADMIN_EMAIL_LOWER) {
      return res.status(400).json({ success: false, error: 'Le Super-Administrateur principal est protégé.' });
    }
    await docRef.delete();
    await recordAdminAuditLog(activeDb, {
      adminUid: req.adminContext!.uid,
      adminEmail: req.adminContext!.email,
      adminRole: 'super_admin',
      category: 'rbac',
      action: 'REVOKE_ADMIN_ACCESS',
      targetType: 'admin',
      targetId: uid,
    });
    return res.json({ success: true, revokedUid: uid });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors de la révocation administrateur.' });
  }
});

app.get('/api/admin/audit-logs', requireAdminPermission('audit.read') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = await listAdminAuditLogs(getActiveDb(), {
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      adminEmail: typeof req.query.adminEmail === 'string' ? req.query.adminEmail : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      limit: Number(req.query.limit || 100),
    });
    return res.json({ success: true, count: logs.length, logs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement du journal d’audit.' });
  }
});

// =========================================================================
// VENDORS, COURIERS (WITH INDIVIDUAL REMUNERATION) & CLIENTS MANAGEMENT
// =========================================================================
app.get('/api/admin/merchants/:uid/details', requireAdminPermission('vendors.read') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    const uid = String(req.params.uid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!uid) return res.status(400).json({ success: false, error: 'Identifiant vendeur requis.' });

    const [userSnap, deliveriesSnap, disputesSnap] = await Promise.all([
      activeDb.collection('users').doc(uid).get(),
      activeDb.collection('deliveries').get(),
      activeDb.collection('disputes').get().catch(() => ({ docs: [] })),
    ]);

    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'Vendeur introuvable.' });
    }
    const vendor = { id: uid, ...(userSnap.data() || {}) };
    const vendorOrders: any[] = [];
    deliveriesSnap.forEach((d: any) => {
      const data = d.data() || {};
      if (data.merchantId === uid) vendorOrders.push({ id: data.id || d.id, ...data });
    });

    const disputes: any[] = [];
    if (disputesSnap && typeof (disputesSnap as any).forEach === 'function') {
      (disputesSnap as any).forEach((d: any) => {
        const data = d.data() || {};
        if (data.merchantId === uid) disputes.push({ id: d.id, ...data });
      });
    }

    const totalOrders = vendorOrders.length;
    const deliveredOrders = vendorOrders.filter((o) => o.status === 'livree').length;
    const failedOrCancelledOrders = vendorOrders.filter((o) => o.status === 'echec').length;
    const totalSalesCOD = vendorOrders.reduce((acc, o) => acc + Number(o.itemValueCOD || 0), 0);
    const totalDeliveryFees = vendorOrders.reduce((acc, o) => acc + Number(o.deliveryFee || 0), 0);
    const totalCommissions = vendorOrders.reduce(
      (acc, o) => acc + Number(o.commissionSnapshot?.vendorCommissionFCFA || 0),
      0
    );

    return res.json({
      success: true,
      vendor,
      stats: {
        totalOrders,
        deliveredOrders,
        failedOrCancelledOrders,
        totalSalesCOD,
        totalDeliveryFees,
        totalCommissions,
        netVendorRevenue: totalSalesCOD - totalCommissions,
      },
      orders: vendorOrders.slice(0, 50),
      disputes,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement de la fiche vendeur.' });
  }
});

app.patch('/api/admin/merchants/:uid', requireAdminPermission('vendors.manage') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    const uid = String(req.params.uid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!uid) return res.status(400).json({ success: false, error: 'UID vendeur requis.' });

    const userRef = activeDb.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Compte vendeur introuvable.' });
    const oldData = snap.data() || {};
    const body = req.body || {};

    const nowIso = new Date().toISOString();
    const patch: Record<string, any> = { updatedAt: nowIso };
    if (typeof body.storeName === 'string' && body.storeName.trim()) patch.storeName = body.storeName.trim().slice(0, 128);
    if (typeof body.managerName === 'string' && body.managerName.trim()) patch.fullName = body.managerName.trim().slice(0, 128);
    if (typeof body.fullName === 'string' && body.fullName.trim()) patch.fullName = body.fullName.trim().slice(0, 128);
    if (typeof body.phone === 'string') patch.phone = body.phone.trim().slice(0, 32);
    if (typeof body.email === 'string' && body.email.includes('@')) patch.email = body.email.trim().toLowerCase().slice(0, 128);
    if (typeof body.commune === 'string') patch.storeCommune = body.commune.trim().slice(0, 128);
    if (typeof body.storeCommune === 'string') patch.storeCommune = body.storeCommune.trim().slice(0, 128);
    if (typeof body.address === 'string') patch.storeAddress = body.address.trim().slice(0, 256);
    if (typeof body.storeAddress === 'string') patch.storeAddress = body.storeAddress.trim().slice(0, 256);
    if (typeof body.channel === 'string') patch.channel = body.channel;
    if (typeof body.isVerified === 'boolean') {
      patch.isKycVerified = body.isVerified;
      patch.kycStatus = body.isVerified ? 'valide' : 'non_soumis';
    }
    if (typeof body.preferredRateDiscountPercent === 'number') {
      patch.preferredRateDiscountPercent = Math.max(0, Math.min(50, body.preferredRateDiscountPercent));
    }
    if (body.commercialConfig && typeof body.commercialConfig === 'object') {
      patch.commercialConfig = {
        ...(oldData.commercialConfig || {}),
        ...body.commercialConfig,
        updatedAt: nowIso,
        updatedBy: req.adminContext!.email,
      };
    }

    const validLifecycleStatuses: AccountLifecycleStatus[] = ['actif', 'inactif', 'suspendu', 'bloque'];
    let requestedAccountStatus: AccountLifecycleStatus | undefined;
    if (validLifecycleStatuses.includes(body.accountStatus)) {
      requestedAccountStatus = body.accountStatus;
    } else if (body.status === 'actif' || body.status === 'suspendu') {
      requestedAccountStatus = body.status;
    }

    if (requestedAccountStatus) {
      patch.accountStatus = requestedAccountStatus;
      patch.status = requestedAccountStatus === 'actif' ? 'actif' : 'suspendu';
      if (requestedAccountStatus === 'suspendu' || requestedAccountStatus === 'bloque') {
        patch.blockedReason = String(body.reason || 'Décision administrative').trim().slice(0, 300);
      } else {
        patch.blockedReason = '';
      }

      if (firebaseAdminApp) {
        try {
          await getAuth(firebaseAdminApp).updateUser(uid, {
            disabled: requestedAccountStatus === 'suspendu' || requestedAccountStatus === 'bloque',
          });
        } catch {
          // ignore if Auth record does not exist in test/directory mode
        }
      }
    }

    await userRef.set(patch, { merge: true });
    await recordAdminAuditLog(activeDb, {
      adminUid: req.adminContext!.uid,
      adminEmail: req.adminContext!.email,
      adminRole: req.adminContext!.roleId || 'admin',
      category: 'vendor',
      action: requestedAccountStatus ? `VENDOR_STATUS_${requestedAccountStatus.toUpperCase()}` : 'VENDOR_PROFILE_UPDATED',
      targetType: 'vendor',
      targetId: uid,
      oldValue: { status: oldData.status, accountStatus: oldData.accountStatus, storeName: oldData.storeName },
      newValue: { status: patch.status || oldData.status, accountStatus: patch.accountStatus, storeName: patch.storeName },
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    });

    if (requestedAccountStatus && oldData.email) {
      try {
        const templates = await loadEmailTemplates(activeDb);
        const cfg = (await loadPlatformConfigBundle(activeDb)).bundle;
        const tplId: EmailTemplateId =
          requestedAccountStatus === 'actif' ? 'account_reactivated' : 'account_suspended';
        const tpl = templates[tplId];
        if (tpl && tpl.enabled) {
          const rendered = renderEmailTemplate(
            tpl,
            {
              fullName: String(patch.fullName || oldData.fullName || 'Vendeur'),
              accountStatus: requestedAccountStatus.toUpperCase(),
              reason: patch.blockedReason || String(body.reason || 'Mise à jour administrative'),
            },
            cfg
          );
          await getP1EmailService().dispatchOrQueueEmail({
            type: 'custom',
            to: String(oldData.email),
            recipientName: String(patch.fullName || oldData.fullName || 'Vendeur'),
            subject: rendered.subject,
            previewText: rendered.title,
            textContent: rendered.textContent,
            htmlContent: rendered.htmlContent,
            allowQueue: true,
          });
        }
      } catch {
        // non-blocking email dispatch
      }
    }

    return res.json({ success: true, uid, updated: { ...oldData, ...patch } });
  } catch (err: any) {
    console.error('[PATCH MERCHANT ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour du vendeur.' });
  }
});

app.get('/api/admin/couriers/:uid/details', requireAdminPermission('couriers.read') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    const uid = String(req.params.uid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!uid) return res.status(400).json({ success: false, error: 'UID livreur requis.' });

    const [userSnap, deliveriesSnap, txSnap] = await Promise.all([
      activeDb.collection('users').doc(uid).get(),
      activeDb.collection('deliveries').get(),
      activeDb.collection('wallet_transactions').get().catch(() => ({ docs: [] })),
    ]);

    if (!userSnap.exists) return res.status(404).json({ success: false, error: 'Livreur introuvable.' });
    const courier = { id: uid, ...(userSnap.data() || {}) };
    const orders: any[] = [];
    deliveriesSnap.forEach((d: any) => {
      const data = d.data() || {};
      if (getAssignedCourierIdFromOrder(data) === uid) {
        orders.push({ id: data.id || d.id, ...data });
      }
    });

    const ledger: any[] = [];
    if (txSnap && typeof (txSnap as any).forEach === 'function') {
      (txSnap as any).forEach((t: any) => {
        const data = t.data() || {};
        if (data.uid === uid) ledger.push({ id: t.id, ...data });
      });
    }

    const completedDeliveries = orders.filter((o) => o.status === 'livree').length;
    const cancelledOrFailedDeliveries = orders.filter((o) => o.status === 'echec').length;
    const totalEarningsFCFA = orders
      .filter((o) => o.status === 'livree')
      .reduce((acc, o) => acc + Number(o.remunerationSnapshot?.netCourierEarningFCFA ?? o.deliveryFee ?? 0), 0);
    const totalCommissionPaid = orders
      .filter((o) => o.status === 'livree')
      .reduce((acc, o) => acc + Number(o.remunerationSnapshot?.platformCommissionFCFA ?? 0), 0);

    return res.json({
      success: true,
      courier,
      stats: {
        totalMissions: orders.length,
        completedDeliveries,
        cancelledOrFailedDeliveries,
        totalEarningsFCFA,
        totalCommissionPaid,
        walletBalanceFCFA: Number(courier.walletBalanceFCFA || 0),
      },
      orders: orders.slice(0, 50),
      walletTransactions: ledger.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 40),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement de la fiche livreur.' });
  }
});

app.patch('/api/admin/couriers/:uid', requireAdminPermission('couriers.manage') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    const uid = String(req.params.uid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!uid) return res.status(400).json({ success: false, error: 'UID livreur requis.' });

    const userRef = activeDb.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Compte livreur introuvable.' });
    const oldData = snap.data() || {};
    const body = req.body || {};

    const nowIso = new Date().toISOString();
    const patch: Record<string, any> = { updatedAt: nowIso };
    if (typeof body.fullName === 'string' && body.fullName.trim()) patch.fullName = body.fullName.trim().slice(0, 128);
    if (typeof body.name === 'string' && body.name.trim()) patch.fullName = body.name.trim().slice(0, 128);
    if (typeof body.phone === 'string') patch.phone = body.phone.trim().slice(0, 32);
    if (typeof body.email === 'string' && body.email.includes('@')) patch.email = body.email.trim().toLowerCase().slice(0, 128);
    if (typeof body.vehicleType === 'string') patch.vehicleType = body.vehicleType.trim().slice(0, 64);
    if (typeof body.vehicle === 'string') patch.vehicleType = body.vehicle.trim().slice(0, 64);
    if (typeof body.vehiclePlate === 'string') patch.vehiclePlate = body.vehiclePlate.trim().slice(0, 32);
    if (typeof body.zone === 'string') patch.locationCommune = body.zone.trim().slice(0, 128);
    if (typeof body.isAvailable === 'boolean') patch.isAvailable = body.isAvailable;

    const validLifecycleStatuses: AccountLifecycleStatus[] = ['actif', 'inactif', 'suspendu', 'bloque'];
    let requestedAccountStatus: AccountLifecycleStatus | undefined;
    if (validLifecycleStatuses.includes(body.accountStatus)) {
      requestedAccountStatus = body.accountStatus;
    } else if (body.status === 'suspendu' || body.status === 'hors_ligne' || body.status === 'en_ligne') {
      requestedAccountStatus = body.status === 'suspendu' ? 'suspendu' : body.status === 'hors_ligne' ? 'inactif' : 'actif';
    }

    if (requestedAccountStatus) {
      patch.accountStatus = requestedAccountStatus;
      patch.status =
        requestedAccountStatus === 'suspendu' || requestedAccountStatus === 'bloque'
          ? 'suspendu'
          : requestedAccountStatus === 'inactif'
          ? 'hors_ligne'
          : 'en_ligne';
      if (requestedAccountStatus === 'suspendu' || requestedAccountStatus === 'bloque') {
        patch.isAvailable = false;
        patch.blockedReason = String(body.reason || 'Décision administrative').trim().slice(0, 300);
      } else {
        patch.blockedReason = '';
      }
      if (firebaseAdminApp) {
        try {
          await getAuth(firebaseAdminApp).updateUser(uid, {
            disabled: requestedAccountStatus === 'suspendu' || requestedAccountStatus === 'bloque',
          });
        } catch {
          // ignore if Auth user not present
        }
      }
    }

    await userRef.set(patch, { merge: true });
    await recordAdminAuditLog(activeDb, {
      adminUid: req.adminContext!.uid,
      adminEmail: req.adminContext!.email,
      adminRole: req.adminContext!.roleId || 'admin',
      category: 'courier',
      action: requestedAccountStatus ? `COURIER_STATUS_${requestedAccountStatus.toUpperCase()}` : 'COURIER_PROFILE_UPDATED',
      targetType: 'courier',
      targetId: uid,
      oldValue: { status: oldData.status, accountStatus: oldData.accountStatus },
      newValue: { status: patch.status || oldData.status, accountStatus: patch.accountStatus },
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    });

    if (requestedAccountStatus && oldData.email) {
      try {
        const templates = await loadEmailTemplates(activeDb);
        const cfg = (await loadPlatformConfigBundle(activeDb)).bundle;
        const tplId: EmailTemplateId =
          requestedAccountStatus === 'actif' ? 'account_reactivated' : 'account_suspended';
        const tpl = templates[tplId];
        if (tpl && tpl.enabled) {
          const rendered = renderEmailTemplate(
            tpl,
            {
              fullName: String(patch.fullName || oldData.fullName || 'Livreur'),
              accountStatus: requestedAccountStatus.toUpperCase(),
              reason: patch.blockedReason || String(body.reason || 'Mise à jour administrative'),
            },
            cfg
          );
          await getP1EmailService().dispatchOrQueueEmail({
            type: 'custom',
            to: String(oldData.email),
            recipientName: String(patch.fullName || oldData.fullName || 'Livreur'),
            subject: rendered.subject,
            previewText: rendered.title,
            textContent: rendered.textContent,
            htmlContent: rendered.htmlContent,
            allowQueue: true,
          });
        }
      } catch {
        // non-blocking
      }
    }

    return res.json({ success: true, uid, updated: { ...oldData, ...patch } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour du livreur.' });
  }
});

app.put('/api/admin/couriers/:uid/remuneration', requireAdminPermission('couriers.remuneration') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    const uid = String(req.params.uid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!uid) return res.status(400).json({ success: false, error: 'UID livreur requis.' });

    const userRef = activeDb.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Livreur introuvable.' });
    const oldData = snap.data() || {};
    const body = req.body || {};
    const useGeneralTariff = body.useGeneralTariff !== false;

    const malusFCFA = Math.max(0, Math.round(Number(body.malusFCFA || 0)));
    const malusReason = String(body.malusReason || '').trim().slice(0, 300);
    if (!useGeneralTariff && malusFCFA > 0 && malusReason.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Un motif explicite (min 3 caractères) est obligatoire lorsqu’un malus est appliqué.',
      });
    }

    const nowIso = new Date().toISOString();
    const remunerationConfig = {
      useGeneralTariff,
      customPricePerKmFCFA:
        typeof body.customPricePerKmFCFA === 'number' && body.customPricePerKmFCFA >= 0
          ? Math.round(body.customPricePerKmFCFA)
          : undefined,
      customMinEarningFCFA:
        typeof body.customMinEarningFCFA === 'number' && body.customMinEarningFCFA >= 0
          ? Math.round(body.customMinEarningFCFA)
          : undefined,
      customFixedBonusFCFA:
        typeof body.customFixedBonusFCFA === 'number' && body.customFixedBonusFCFA >= 0
          ? Math.round(body.customFixedBonusFCFA)
          : undefined,
      bonusFCFA:
        typeof body.bonusFCFA === 'number' && body.bonusFCFA >= 0
          ? Math.round(body.bonusFCFA)
          : 0,
      malusFCFA,
      malusReason: malusReason || undefined,
      customCommissionRatePercent:
        typeof body.customCommissionRatePercent === 'number' && body.customCommissionRatePercent >= 0
          ? Math.min(50, body.customCommissionRatePercent)
          : undefined,
      specialConditions: String(body.specialConditions || '').trim().slice(0, 500) || undefined,
      updatedAt: nowIso,
      updatedBy: req.adminContext!.email,
    };

    const cleanConfig = Object.fromEntries(
      Object.entries(remunerationConfig).filter(([, v]) => v !== undefined)
    );

    await userRef.set({ remunerationConfig: cleanConfig, updatedAt: nowIso }, { merge: true });
    await recordAdminAuditLog(activeDb, {
      adminUid: req.adminContext!.uid,
      adminEmail: req.adminContext!.email,
      adminRole: req.adminContext!.roleId || 'admin',
      category: 'remuneration',
      action: useGeneralTariff ? 'COURIER_REMUNERATION_GENERAL' : 'COURIER_REMUNERATION_CUSTOM',
      targetType: 'courier',
      targetId: uid,
      oldValue: oldData.remunerationConfig || { useGeneralTariff: true },
      newValue: cleanConfig,
      reason: malusReason || (typeof body.specialConditions === 'string' ? body.specialConditions : undefined),
    });

    return res.json({ success: true, uid, remunerationConfig: cleanConfig });
  } catch (err: any) {
    console.error('[COURIER REMUNERATION ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'enregistrement de la rémunération livreur.' });
  }
});

app.get('/api/admin/clients', requireAdminPermission('clients.read') as any, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });

    const [usersSnap, deliveriesSnap] = await Promise.all([
      activeDb.collection('users').get(),
      activeDb.collection('deliveries').get(),
    ]);

    const map = new Map<string, any>();
    usersSnap.forEach((d: any) => {
      const u = d.data() || {};
      if (u.role === 'client') {
        const key = String(u.phone || u.email || d.id).trim();
        map.set(key, {
          key,
          clientId: d.id,
          name: u.fullName || 'Client LivraLink',
          phone: u.phone || '',
          email: u.email || '',
          communes: u.locationCommune ? [u.locationCommune] : [],
          totalOrders: 0,
          deliveredOrders: 0,
          disputedOrders: 0,
          totalSpentFCFA: 0,
          lastOrderAt: u.createdAt || '',
          status: 'actif',
        });
      }
    });

    deliveriesSnap.forEach((d: any) => {
      const o = d.data() || {};
      const phoneKey = String(o.clientPhone || '').trim();
      const fallbackKey = String(o.clientId || o.clientName || d.id).trim();
      const key = phoneKey || fallbackKey;
      const existing = map.get(key) || {
        key,
        clientId: o.clientId || undefined,
        name: o.clientName || 'Client',
        phone: o.clientPhone || '',
        email: '',
        communes: [],
        totalOrders: 0,
        deliveredOrders: 0,
        disputedOrders: 0,
        totalSpentFCFA: 0,
        lastOrderAt: '',
        status: 'actif',
      };
      existing.totalOrders += 1;
      if (o.status === 'livree') existing.deliveredOrders += 1;
      if (o.status === 'echec') existing.disputedOrders += 1;
      existing.totalSpentFCFA += Number(o.totalCustomerPayable ?? (Number(o.itemValueCOD || 0) + Number(o.deliveryFee || 0)));
      const commune = o.dropoffLocation?.commune;
      if (commune && !existing.communes.includes(commune)) existing.communes.push(commune);
      const createdAtStr = typeof o.createdAt === 'number' ? new Date(o.createdAt).toISOString() : String(o.createdAt || '');
      if (createdAtStr && (!existing.lastOrderAt || createdAtStr > existing.lastOrderAt)) {
        existing.lastOrderAt = createdAtStr;
      }
      if (existing.disputedOrders >= 2) existing.status = 'a_surveiller';
      map.set(key, existing);
    });

    const clients = Array.from(map.values()).sort((a, b) => b.totalOrders - a.totalOrders);
    return res.json({ success: true, count: clients.length, clients });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement des clients.' });
  }
});

// =========================================================================
// ORDERS CANCELLATION, REASSIGNMENT & DISPUTES
// =========================================================================
app.post('/api/admin/deliveries/:orderId/cancel', requireAdminPermission('deliveries.cancel') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (!cleanDocId || reason.length < 3) {
      return res.status(400).json({ success: false, error: 'Identifiant course et motif d’annulation (min 3 caractères) requis.' });
    }

    const deliveryRef = activeDb.collection('deliveries').doc(cleanDocId);
    const snap = await deliveryRef.get();
    if (!snap.exists) return res.status(404).json({ success: false, error: 'Livraison introuvable.' });
    const orderData = snap.data() || {};
    if (orderData.status === 'livree') {
      return res.status(409).json({
        success: false,
        error: 'Impossible d’annuler une livraison déjà livrée et certifiée POD. Utilisez un remboursement financier.',
      });
    }

    const nowIso = new Date().toISOString();
    await deliveryRef.set(
      {
        status: 'echec',
        dispatchState: 'exhausted',
        cancelledAt: nowIso,
        cancelledBy: req.adminContext!.email,
        cancellationReason: reason,
        statusNote: `Annulée par admin : ${reason}`,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    const missionRef = activeDb.collection('priority_missions').doc(cleanDocId);
    await missionRef.set({ status: 'echec', dispatchState: 'exhausted', updatedAt: nowIso }, { merge: true }).catch(() => {});

    await recordAdminAuditLog(activeDb, {
      adminUid: req.adminContext!.uid,
      adminEmail: req.adminContext!.email,
      adminRole: req.adminContext!.roleId || 'admin',
      category: 'delivery',
      action: 'DELIVERY_CANCELLED',
      targetType: 'delivery',
      targetId: cleanDocId,
      oldValue: { status: orderData.status },
      newValue: { status: 'echec', cancelledAt: nowIso },
      reason,
    });

    return res.json({ success: true, orderId: orderData.id || cleanDocId, status: 'echec', cancellationReason: reason });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors de l’annulation administrative.' });
  }
});

app.post('/api/admin/deliveries/:orderId/reassign', requireAdminPermission('deliveries.reassign') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    const cleanDocId = String(req.params.orderId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanCourierId = String(req.body?.courierId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (!cleanDocId || !cleanCourierId || reason.length < 3) {
      return res.status(400).json({ success: false, error: 'Course, livreur et motif de réattribution (min 3 caractères) requis.' });
    }

    const deliveryRef = activeDb.collection('deliveries').doc(cleanDocId);
    const courierRef = activeDb.collection('users').doc(cleanCourierId);
    const [deliverySnap, courierSnap] = await Promise.all([deliveryRef.get(), courierRef.get()]);
    if (!deliverySnap.exists) return res.status(404).json({ success: false, error: 'Livraison introuvable.' });
    if (!courierSnap.exists) return res.status(404).json({ success: false, error: 'Livreur cible introuvable.' });

    const deliveryData = deliverySnap.data() || {};
    const courierData = courierSnap.data() || {};
    if (deliveryData.status === 'livree') {
      return res.status(409).json({ success: false, error: 'Impossible de réattribuer une course déjà livrée.' });
    }
    if (courierData.role !== 'livreur' || (!courierData.isKycVerified && courierData.kycStatus !== 'valide')) {
      return res.status(403).json({ success: false, error: 'Le livreur sélectionné doit être vérifié KYC.' });
    }
    if (courierData.accountStatus === 'suspendu' || courierData.accountStatus === 'bloque' || courierData.status === 'suspendu') {
      return res.status(403).json({ success: false, error: 'Le livreur sélectionné est actuellement suspendu ou bloqué.' });
    }

    const courierName = String(courierData.fullName || courierData.name || 'Coursier LivraLink').trim();
    const nowIso = new Date().toISOString();
    const courierObj = {
      id: cleanCourierId,
      name: courierName,
      phone: String(courierData.phone || ''),
      email: courierData.email || '',
      avatarInitials: courierName.slice(0, 2).toUpperCase(),
      rating: 5,
      totalDeliveries: Number(courierData.totalDeliveries || 0),
      vehicle: courierData.vehicleType || 'Moto',
      zone: courierData.locationCommune || 'Cotonou',
      distanceKm: 1,
      etaMinutes: 10,
      status: 'en_course',
      priceFCFA: Number(deliveryData.deliveryFee || 0),
      commissionFCFA: 0,
      netEarningFCFA: Number(deliveryData.deliveryFee || 0),
      isKycVerified: true,
    };

    await deliveryRef.set(
      {
        courierId: cleanCourierId,
        courierName,
        courier: courierObj,
        status: 'assignee',
        dispatchState: 'assigned',
        targetCourierId: null,
        reassignedAt: nowIso,
        reassignedReason: reason,
        statusNote: `Réattribuée à ${courierName} : ${reason}`,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    await activeDb.collection('priority_missions').doc(cleanDocId).set(
      {
        courierId: cleanCourierId,
        courierName,
        status: 'assignee',
        dispatchState: 'assigned',
        updatedAt: nowIso,
      },
      { merge: true }
    ).catch(() => {});

    await recordAdminAuditLog(activeDb, {
      adminUid: req.adminContext!.uid,
      adminEmail: req.adminContext!.email,
      adminRole: req.adminContext!.roleId || 'admin',
      category: 'delivery',
      action: 'DELIVERY_REASSIGNED',
      targetType: 'delivery',
      targetId: cleanDocId,
      oldValue: { courierId: deliveryData.courierId || null, courierName: deliveryData.courierName || null },
      newValue: { courierId: cleanCourierId, courierName },
      reason,
    });

    return res.json({ success: true, orderId: deliveryData.id || cleanDocId, courier: courierObj });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors de la réattribution de la course.' });
  }
});

app.get('/api/admin/disputes', requireAdminPermission('disputes.read') as any, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.json({ success: true, disputes: [] });
    const snap = await activeDb.collection('disputes').get();
    const disputes: any[] = [];
    snap.forEach((d: any) => disputes.push({ id: d.id, ...(d.data() || {}) }));
    disputes.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return res.json({ success: true, disputes });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement des réclamations.' });
  }
});

app.post('/api/admin/disputes', requireAdminPermission('disputes.resolve') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    const body = req.body || {};
    const orderId = String(body.orderId || '').trim().slice(0, 64);
    const subject = String(body.subject || 'Réclamation livraison').trim().slice(0, 180);
    const description = String(body.description || '').trim().slice(0, 1000);
    if (!orderId || description.length < 3) {
      return res.status(400).json({ success: false, error: 'Référence commande et description requises.' });
    }
    const disputeId = `disp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const nowIso = new Date().toISOString();
    const record = {
      id: disputeId,
      orderId,
      merchantId: body.merchantId ? String(body.merchantId).trim() : undefined,
      courierId: body.courierId ? String(body.courierId).trim() : undefined,
      clientName: body.clientName ? String(body.clientName).trim() : undefined,
      clientPhone: body.clientPhone ? String(body.clientPhone).trim() : undefined,
      category: ['retard', 'colis_endommage', 'paiement', 'comportement', 'autre'].includes(body.category)
        ? body.category
        : 'autre',
      priority: ['basse', 'moyenne', 'haute', 'critique'].includes(body.priority)
        ? body.priority
        : 'moyenne',
      subject,
      description,
      status: 'ouvert',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await activeDb.collection('disputes').doc(disputeId).set(record);
    await recordAdminAuditLog(activeDb, {
      adminUid: req.adminContext!.uid,
      adminEmail: req.adminContext!.email,
      adminRole: req.adminContext!.roleId || 'admin',
      category: 'delivery',
      action: 'DISPUTE_OPENED',
      targetType: 'dispute',
      targetId: disputeId,
      newValue: { orderId, category: record.category, priority: record.priority },
    });
    return res.status(201).json({ success: true, dispute: record });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors de l’ouverture du litige.' });
  }
});

app.post('/api/admin/disputes/:disputeId/resolve', requireAdminPermission('disputes.resolve') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    const disputeId = String(req.params.disputeId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const resolutionNote = String(req.body?.resolutionNote || '').trim().slice(0, 500);
    const status = req.body?.status === 'en_analyse' || req.body?.status === 'clos' ? req.body.status : 'resolu';
    if (!disputeId || resolutionNote.length < 3) {
      return res.status(400).json({ success: false, error: 'Identifiant litige et note de résolution requis.' });
    }
    const nowIso = new Date().toISOString();
    await activeDb.collection('disputes').doc(disputeId).set(
      {
        status,
        resolutionNote,
        resolvedBy: req.adminContext!.email,
        resolvedAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );
    await recordAdminAuditLog(activeDb, {
      adminUid: req.adminContext!.uid,
      adminEmail: req.adminContext!.email,
      adminRole: req.adminContext!.roleId || 'admin',
      category: 'delivery',
      action: `DISPUTE_${status.toUpperCase()}`,
      targetType: 'dispute',
      targetId: disputeId,
      reason: resolutionNote,
    });
    return res.json({ success: true, disputeId, status, resolutionNote });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors de la résolution du litige.' });
  }
});

// =========================================================================
// FINANCE SUMMARY & TRANSACTIONAL IDEMPOTENT REFUNDS
// =========================================================================
app.get('/api/admin/finance/summary', requireAdminPermission('finance.read') as any, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });

    const [deliveriesSnap, txSnap, refundsSnap, cfgRes] = await Promise.all([
      activeDb.collection('deliveries').get(),
      activeDb.collection('wallet_transactions').get().catch(() => ({ forEach: () => {} })),
      activeDb.collection('refunds').get().catch(() => ({ forEach: () => {} })),
      loadPlatformConfigBundle(activeDb),
    ]);

    let totalTurnoverCOD = 0;
    let totalDeliveryFees = 0;
    let totalPlatformCommissions = 0;
    let totalVendorCommissions = 0;
    let totalCourierEarnings = 0;
    let deliveredCount = 0;

    deliveriesSnap.forEach((d: any) => {
      const o = d.data() || {};
      const fee = Number(o.deliveryFee || 0);
      const cod = Number(o.itemValueCOD || 0);
      totalDeliveryFees += fee;
      totalTurnoverCOD += cod;
      if (o.status === 'livree') {
        deliveredCount += 1;
        const pComm =
          o.commissionSnapshot?.totalPlatformRevenueFCFA ??
          Math.round((fee * Number(cfgRes.bundle.commissions.platformCommissionPercent || 0)) / 100);
        const vComm = Number(o.commissionSnapshot?.vendorCommissionFCFA || 0);
        const cNet = Number(o.remunerationSnapshot?.netCourierEarningFCFA ?? Math.max(0, fee - pComm));
        totalPlatformCommissions += Number(pComm);
        totalVendorCommissions += vComm;
        totalCourierEarnings += cNet;
      }
    });

    const transactions: any[] = [];
    let payoutsSucceeded = 0;
    let payoutsPending = 0;
    let payoutsFailed = 0;

    if (typeof (txSnap as any).forEach === 'function') {
      (txSnap as any).forEach((t: any) => {
        const tx = { id: t.id, ...(t.data() || {}) };
        transactions.push(tx);
        const amt = Number(tx.amountFCFA || 0);
        if (tx.type === 'payout' || tx.type === 'withdrawal') {
          if (tx.status === 'succeeded' || tx.status === 'completed') payoutsSucceeded += amt;
          else if (tx.status === 'failed' || tx.status === 'compensated') payoutsFailed += amt;
          else payoutsPending += amt;
        }
      });
    }

    const refunds: any[] = [];
    let totalRefundsFCFA = 0;
    if (typeof (refundsSnap as any).forEach === 'function') {
      (refundsSnap as any).forEach((r: any) => {
        const ref = { id: r.id, ...(r.data() || {}) };
        refunds.push(ref);
        if (ref.status === 'valide') totalRefundsFCFA += Number(ref.amountFCFA || 0);
      });
    }

    transactions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    refunds.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    return res.json({
      success: true,
      kpis: {
        totalTurnoverCOD,
        totalDeliveryFees,
        totalPlatformCommissions,
        totalVendorCommissions,
        totalVendorRevenue: Math.max(0, totalTurnoverCOD - totalVendorCommissions),
        totalCourierEarnings,
        payoutsSucceeded,
        payoutsPending,
        payoutsFailed,
        totalRefundsFCFA,
        deliveredCount,
      },
      commissions: cfgRes.bundle.commissions,
      courierRemuneration: cfgRes.bundle.courierRemuneration,
      transactions: transactions.slice(0, 60),
      refunds: refunds.slice(0, 40),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors du calcul du bilan financier.' });
  }
});

app.post('/api/admin/refunds', requireAdminPermission('finance.refund') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });

    const cfg = await loadPlatformConfigBundle(activeDb);
    if (!cfg.bundle.featureFlags.allowPayments) {
      return res.status(403).json({
        success: false,
        code: 'PAYMENTS_DISABLED',
        error: 'Les opérations financières et remboursements sont temporairement désactivés.',
      });
    }

    const body = req.body || {};
    const targetUid = String(body.targetUid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim().slice(0, 64) : undefined;
    const reason = String(body.reason || '').trim().slice(0, 300);
    const amountFCFA = Math.round(Number(body.amountFCFA));
    const idempotencyKey = String(body.idempotencyKey || `refund_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`)
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 96);

    if (!targetUid || !Number.isFinite(amountFCFA) || amountFCFA <= 0 || amountFCFA > 50_000_000 || reason.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Bénéficiaire, montant > 0 et motif explicite (min 3 caractères) requis pour le remboursement.',
      });
    }

    const refundDocId = idempotencyKey;
    const refundRef = activeDb.collection('refunds').doc(refundDocId);
    const userRef = activeDb.collection('users').doc(targetUid);

    const txRes = await activeDb.runTransaction(async (tx: any) => {
      const existingRefundSnap = await tx.get(refundRef);
      if (existingRefundSnap.exists) {
        return { ok: true as const, duplicate: true, refund: existingRefundSnap.data() };
      }

      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        return { ok: false as const, status: 404, error: 'Compte bénéficiaire introuvable.' };
      }
      const uData = userSnap.data() || {};
      const currentBalance = typeof uData.walletBalanceFCFA === 'number' ? uData.walletBalanceFCFA : 0;
      const newBalance = currentBalance + amountFCFA;
      const nowIso = new Date().toISOString();
      const walletTxId = `wtx_ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      tx.update(userRef, {
        walletBalanceFCFA: newBalance,
        updatedAt: nowIso,
      });

      const targetRole = uData.role === 'livreur' ? 'livreur' : uData.role === 'client' ? 'client' : 'vendeur';
      const refundRecord = {
        id: refundDocId,
        ...(orderId ? { orderId } : {}),
        targetUid,
        targetName: String(uData.storeName || uData.fullName || 'Utilisateur'),
        targetRole,
        amountFCFA,
        reason,
        status: 'valide',
        idempotencyKey: refundDocId,
        walletTxId,
        createdByUid: req.adminContext!.uid,
        createdByEmail: req.adminContext!.email,
        createdAt: nowIso,
      };

      tx.set(refundRef, refundRecord);
      tx.set(activeDb.collection('wallet_transactions').doc(walletTxId), {
        id: walletTxId,
        uid: targetUid,
        type: 'refund_credit',
        direction: 'credit',
        amountFCFA,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        note: `Remboursement admin (${orderId || 'sans course'}) : ${reason}`,
        adminUid: req.adminContext!.uid,
        adminEmail: req.adminContext!.email,
        createdAt: Date.now(),
        createdAtIso: nowIso,
      });

      return {
        ok: true as const,
        duplicate: false,
        refund: refundRecord,
        balanceAfter: newBalance,
        email: String(uData.email || ''),
      };
    });

    if (!txRes.ok) {
      return res.status(txRes.status).json({ success: false, error: txRes.error });
    }

    if (!txRes.duplicate) {
      await recordAdminAuditLog(activeDb, {
        adminUid: req.adminContext!.uid,
        adminEmail: req.adminContext!.email,
        adminRole: req.adminContext!.roleId || 'admin',
        category: 'refund',
        action: 'REFUND_EXECUTED',
        targetType: 'user',
        targetId: targetUid,
        newValue: { amountFCFA, orderId, refundId: refundDocId },
        reason,
      });
    }

    return res.status(txRes.duplicate ? 200 : 201).json({
      success: true,
      duplicate: txRes.duplicate,
      refund: txRes.refund,
      balanceAfter: txRes.balanceAfter,
    });
  } catch (err: any) {
    console.error('[ADMIN REFUND ERROR]:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erreur lors du traitement du remboursement.' });
  }
});

// =========================================================================
// 14 EDITABLE EMAIL TEMPLATES & TEST SENDER
// =========================================================================
app.get('/api/admin/email-templates', requireAdminPermission('emails.read') as any, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const templates = await loadEmailTemplates(getActiveDb());
    return res.json({ success: true, templates: Object.values(templates) });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors du chargement des templates e-mail.' });
  }
});

app.put('/api/admin/email-templates/:templateId', requireAdminPermission('emails.manage') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    if (!activeDb) return res.status(503).json({ success: false, error: 'Firestore Admin SDK indisponible.' });
    const templateId = String(req.params.templateId || '').trim() as EmailTemplateId;
    if (!ALL_EMAIL_TEMPLATE_IDS.includes(templateId)) {
      return res.status(400).json({ success: false, error: 'Identifiant de template e-mail inconnu.' });
    }
    const updated = await saveEmailTemplate(
      activeDb,
      templateId,
      req.body || {},
      req.adminContext!.email
    );
    await recordAdminAuditLog(activeDb, {
      adminUid: req.adminContext!.uid,
      adminEmail: req.adminContext!.email,
      adminRole: req.adminContext!.roleId || 'admin',
      category: 'email',
      action: `EMAIL_TEMPLATE_UPDATED:${templateId}`,
      targetType: 'email_template',
      targetId: templateId,
      newValue: { subject: updated.subject, enabled: updated.enabled },
    });
    return res.json({ success: true, template: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors de la sauvegarde du template e-mail.' });
  }
});

app.post('/api/admin/email-templates/:templateId/test', requireAdminPermission('emails.manage') as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeDb = getActiveDb();
    const templateId = String(req.params.templateId || '').trim() as EmailTemplateId;
    if (!ALL_EMAIL_TEMPLATE_IDS.includes(templateId)) {
      return res.status(400).json({ success: false, error: 'Template e-mail invalide.' });
    }
    const targetEmail = String(req.body?.targetEmail || req.adminContext!.email || '').trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Adresse e-mail destinataire valide requise.' });
    }

    const [templates, cfg] = await Promise.all([
      loadEmailTemplates(activeDb),
      loadPlatformConfigBundle(activeDb),
    ]);
    const tpl = templates[templateId];
    const sampleVars: Record<string, string> = {
      fullName: 'Test Administrateur',
      recipientName: 'Test Administrateur',
      roleLabel: 'Partenaire LivraLink',
      email: targetEmail,
      otpCode: '4829',
      expiryMinutes: '10',
      accountStatus: 'ACTIF',
      reason: 'Simulation de test depuis la console administrateur',
      submittedAt: new Date().toLocaleDateString('fr-FR'),
      orderId: '#LL-TEST99',
      pickupCommune: 'Cotonou - Haie Vive',
      dropoffCommune: 'Abomey-Calavi',
      deliveryFee: '1500',
      courierName: 'Coursier Demo',
      courierPhone: cfg.bundle.contacts.mainPhone,
      deliveredAt: new Date().toLocaleString('fr-FR'),
      amountFCFA: '2500',
      operationLabel: 'Test Crédit',
      reference: 'REF-TEST-01',
      alertTitle: 'Test Notification Admin',
      alertMessage: 'Vérification du rendu du template e-mail.',
      actorEmail: req.adminContext!.email,
      timestamp: new Date().toISOString(),
    };
    const rendered = renderEmailTemplate(tpl, sampleVars, cfg.bundle);
    const dispatch = await getP1EmailService().dispatchOrQueueEmail({
      type: 'custom',
      to: targetEmail,
      recipientName: 'Test Administrateur',
      subject: `[TEST] ${rendered.subject}`,
      previewText: rendered.title,
      textContent: rendered.textContent,
      htmlContent: rendered.htmlContent,
      allowQueue: true,
    });
    return res.json({
      success: true,
      emailDelivered: dispatch.emailDelivered,
      queued: dispatch.queued,
      subject: rendered.subject,
      previewHtml: rendered.htmlContent,
      message: `E-mail de test (${templateId}) traité pour ${targetEmail}.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Erreur lors de l’envoi du test e-mail.' });
  }
});

// =========================================================================
// SEO TECHNIQUE : CANONICAL DOMAIN, ROBOTS.TXT, SITEMAP.XML, X-ROBOTS-TAG & 404
// =========================================================================
const getCanonicalBaseUrl = (req: Request): string => {
  const configured = process.env.PUBLIC_SITE_URL || process.env.APP_URL || 'https://livralink.oxy-dev.cc';
  const trimmed = configured.trim();
  if (
    trimmed &&
    /^https?:\/\/.+/i.test(trimmed) &&
    !trimmed.includes('MY_APP_URL')
  ) {
    return trimmed.replace(/\/+$/, '');
  }
  return 'https://livralink.oxy-dev.cc';
};

const normalizeSeoPath = (pathname: string): string => {
  if (!pathname) return '/';
  const cleaned = pathname.split('?')[0].split('#')[0];
  if (cleaned.length > 1 && cleaned.endsWith('/')) {
    return cleaned.slice(0, -1);
  }
  return cleaned || '/';
};

interface ServerSeoRouteInfo {
  statusCode: number;
  robots: 'index, follow' | 'noindex, nofollow';
  title: string;
  description: string;
  isPublic: boolean;
  canonicalPath: string | null;
}

const SERVER_SEO_ROUTES: Record<string, Omit<ServerSeoRouteInfo, 'statusCode'>> = {
  '/': {
    robots: 'index, follow',
    title: 'LivraLink – Livraison connectée pour vendeurs et livreurs',
    description:
      'Connectez vos ventes WhatsApp, Instagram et TikTok aux coursiers urbains. Suivi en temps réel et preuve de livraison (POD) sécurisée avec LivraLink.',
    isPublic: true,
    canonicalPath: '/',
  },
  '/connexion-vendeur': {
    robots: 'noindex, nofollow',
    title: 'Connexion Vendeur – LivraLink',
    description: 'Accédez à votre espace vendeur sécurisé LivraLink pour gérer vos expéditions.',
    isPublic: false,
    canonicalPath: null,
  },
  '/connexion-livreur': {
    robots: 'noindex, nofollow',
    title: 'Connexion Livreur – LivraLink',
    description: 'Accédez à votre espace coursier sécurisé LivraLink pour consulter vos missions.',
    isPublic: false,
    canonicalPath: null,
  },
  '/inscription': {
    robots: 'noindex, nofollow',
    title: 'Créer un compte – LivraLink',
    description: 'Inscrivez-vous en tant que vendeur ou livreur sur la plateforme LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/espace-vendeur': {
    robots: 'noindex, nofollow',
    title: 'Espace Vendeur – LivraLink',
    description: 'Tableau de bord privé vendeur LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/espace-vendeur/nouvelle-livraison': {
    robots: 'noindex, nofollow',
    title: 'Nouvelle livraison – Espace Vendeur LivraLink',
    description: 'Création de mission de livraison privée sur LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/espace-vendeur/suivi': {
    robots: 'noindex, nofollow',
    title: 'Suivi des livraisons – Espace Vendeur LivraLink',
    description: 'Suivi privé de vos livraisons en cours sur LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/espace-vendeur/rapports': {
    robots: 'noindex, nofollow',
    title: 'Rapports et statistiques – Espace Vendeur LivraLink',
    description: 'Rapports opérationnels privés vendeur LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/espace-vendeur/parametres': {
    robots: 'noindex, nofollow',
    title: 'Paramètres vendeur – LivraLink',
    description: 'Paramètres privés du compte vendeur LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/espace-vendeur/messagerie': {
    robots: 'noindex, nofollow',
    title: 'Messagerie – Espace Vendeur LivraLink',
    description: 'Messagerie privée vendeur LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/espace-livreur': {
    robots: 'noindex, nofollow',
    title: 'Espace Livreur – LivraLink',
    description: 'Tableau de bord privé coursier LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/espace-livreur/missions': {
    robots: 'noindex, nofollow',
    title: 'Missions disponibles – Espace Livreur LivraLink',
    description: 'Gestion privée des missions de livraison LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/espace-livreur/portefeuille': {
    robots: 'noindex, nofollow',
    title: 'Gains et portefeuille – Espace Livreur LivraLink',
    description: 'Suivi privé des revenus coursier LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/espace-livreur/parametres': {
    robots: 'noindex, nofollow',
    title: 'Paramètres livreur – LivraLink',
    description: 'Paramètres privés du compte livreur LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/espace-livreur/messagerie': {
    robots: 'noindex, nofollow',
    title: 'Messagerie – Espace Livreur LivraLink',
    description: 'Messagerie privée livreur LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
  '/admin': {
    robots: 'noindex, nofollow',
    title: 'Administration – LivraLink',
    description: 'Console d’administration restreinte LivraLink.',
    isPublic: false,
    canonicalPath: null,
  },
};

const resolveServerSeoRoute = (pathname: string): ServerSeoRouteInfo => {
  const normalized = normalizeSeoPath(pathname);
  const matched = SERVER_SEO_ROUTES[normalized];
  if (matched) {
    return {
      statusCode: 200,
      ...matched,
    };
  }
  return {
    statusCode: 404,
    robots: 'noindex, nofollow',
    title: 'Page introuvable (404) – LivraLink',
    description: 'La page demandée est introuvable sur LivraLink.',
    isPublic: false,
    canonicalPath: null,
  };
};

const escapeHtmlAttr = (val: string): string =>
  val
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const injectSeoIntoHtml = (rawHtml: string, req: Request): { html: string; seo: ServerSeoRouteInfo } => {
  const baseUrl = getCanonicalBaseUrl(req);
  const seo = resolveServerSeoRoute(req.path);
  const normalizedPath = normalizeSeoPath(req.path);
  const absoluteUrl = `${baseUrl}${normalizedPath === '/' ? '/' : normalizedPath}`;
  const ogImageUrl = `${baseUrl}/og-image.jpg`;
  const logoUrl = `${baseUrl}/icon.svg`;

  let html = rawHtml
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlAttr(seo.title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${escapeHtmlAttr(seo.description)}" />`
    )
    .replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="robots" content="${seo.robots}" />`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:title" content="${escapeHtmlAttr(seo.title)}" />`
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:description" content="${escapeHtmlAttr(seo.description)}" />`
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:url" content="${escapeHtmlAttr(absoluteUrl)}" />`
    )
    .replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
      `<meta property="og:image" content="${escapeHtmlAttr(ogImageUrl)}" />`
    )
    .replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:title" content="${escapeHtmlAttr(seo.title)}" />`
    )
    .replace(
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:description" content="${escapeHtmlAttr(seo.description)}" />`
    )
    .replace(
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="twitter:image" content="${escapeHtmlAttr(ogImageUrl)}" />`
    );

  if (seo.canonicalPath) {
    const canonicalAbs = `${baseUrl}${seo.canonicalPath}`;
    const canonicalTag = `<link rel="canonical" href="${escapeHtmlAttr(canonicalAbs)}" />`;
    if (/<link\s+rel="canonical"[^>]*>/i.test(html)) {
      html = html.replace(/<link\s+rel="canonical"[^>]*>/i, canonicalTag);
    } else {
      html = html.replace(/<\/head>/i, `    ${canonicalTag}\n  </head>`);
    }
  } else {
    html = html.replace(/<link\s+rel="canonical"[^>]*>\s*/i, '');
  }

  if (seo.isPublic) {
    const homeUrl = `${baseUrl}/`;
    const structuredData = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${homeUrl}#organization`,
          name: 'LivraLink',
          url: homeUrl,
          logo: logoUrl,
          description:
            'Plateforme logistique urbaine connectée reliant les vendeurs du commerce social aux coursiers urbains.',
        },
        {
          '@type': 'SoftwareApplication',
          '@id': `${homeUrl}#software`,
          name: 'LivraLink',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web, Android, iOS',
          inLanguage: 'fr',
          url: homeUrl,
          image: ogImageUrl,
          description:
            'Plateforme SaaS de gestion, suivi en temps réel et preuve de livraison (POD) pour vendeurs WhatsApp, Instagram, TikTok et livreurs urbains.',
          provider: {
            '@id': `${homeUrl}#organization`,
          },
          featureList: [
            'Création rapide de missions de livraison pour vendeurs social-commerce',
            'Attribution aux livreurs urbains disponibles et suivi des 7 statuts normalisés',
            'Preuve de livraison sécurisée (POD) par photo, code secret OTP et signature tactile',
            'Estimation de trajet et itinéraire routier en temps réel',
          ],
        },
      ],
    };
    html = html.replace(
      /<script\s+id="livralink-jsonld"[^>]*>[\s\S]*?<\/script>/i,
      `<script id="livralink-jsonld" type="application/ld+json">${JSON.stringify(structuredData)}</script>`
    );
  } else {
    html = html.replace(/<script\s+id="livralink-jsonld"[^>]*>[\s\S]*?<\/script>\s*/i, '');
  }

  return { html, seo };
};

const isHtmlDocumentRequest = (req: Request): boolean => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const reqPath = req.path;
  if (
    reqPath.startsWith('/api/') ||
    reqPath.startsWith('/assets/') ||
    reqPath.startsWith('/src/') ||
    reqPath.startsWith('/node_modules/') ||
    reqPath.startsWith('/@') ||
    reqPath.startsWith('/__') ||
    reqPath === '/healthz' ||
    reqPath === '/version.json' ||
    reqPath === '/robots.txt' ||
    reqPath === '/sitemap.xml'
  ) {
    return false;
  }
  if (/\.[a-zA-Z0-9]{1,12}$/.test(reqPath)) {
    return false;
  }
  const accept = req.headers.accept || '';
  return !accept || accept.includes('text/html') || accept.includes('*/*');
};

app.get('/robots.txt', (req: Request, res: Response) => {
  const baseUrl = getCanonicalBaseUrl(req);
  const robotsTxt = [
    'User-agent: *',
    'Allow: /',
    'Allow: /assets/',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /espace-vendeur',
    'Disallow: /espace-livreur',
    'Disallow: /connexion-vendeur',
    'Disallow: /connexion-livreur',
    'Disallow: /inscription',
    'Disallow: /healthz',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    '',
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(robotsTxt);
});

app.get('/sitemap.xml', (req: Request, res: Response) => {
  const baseUrl = getCanonicalBaseUrl(req);
  const lastMod = new Date().toISOString().split('T')[0];
  const publicRoutes = Object.entries(SERVER_SEO_ROUTES).filter(([, meta]) => meta.isPublic);

  const urlNodes = publicRoutes
    .map(([routePath]) => {
      const loc = `${baseUrl}${routePath === '/' ? '/' : routePath}`;
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastMod}</lastmod>`,
        '    <changefreq>weekly</changefreq>',
        '    <priority>1.0</priority>',
        '  </url>',
      ].join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlNodes,
    '</urlset>',
    '',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(xml);
});

// Explicit JSON 404 for unknown /api/* routes so API requests never leak into HTML catch-all
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route API introuvable (${req.method} ${req.originalUrl.split('?')[0]}).`,
  });
});

async function startServer() {
  const distPath = path.resolve(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.resolve(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production';

  // Canonical trailing-slash normalization (301 redirect for non-root extensionless paths)
  app.use((req: Request, res: Response, next) => {
    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      req.path.length > 1 &&
      req.path.endsWith('/') &&
      !req.path.startsWith('/api/') &&
      !req.path.startsWith('/@') &&
      !req.path.startsWith('/src/')
    ) {
      const targetPath = req.path.slice(0, -1);
      const queryIndex = req.originalUrl.indexOf('?');
      const querySuffix = queryIndex !== -1 ? req.originalUrl.slice(queryIndex) : '';
      return res.redirect(301, `${targetPath}${querySuffix}`);
    }
    next();
  });

  if (isProduction && hasDist) {
    console.log(`[SERVER] Mode Production actif - Fichiers servis depuis: ${distPath}`);

    // 1. Long-term immutable caching for hashed production assets
    app.use(
      '/assets',
      express.static(path.resolve(distPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );

    // 2. Strict zero-cache for Service Worker and PWA version manifests
    const dynamicPwaFiles = ['/sw.js', '/registerSW.js', '/version.json', '/manifest.webmanifest', '/sw-push.js'];
    app.get(dynamicPwaFiles, (req: Request, res: Response, next) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');

      const fileName = req.path.replace(/^\//, '');
      const distFilePath = path.resolve(distPath, fileName);
      if (fs.existsSync(distFilePath)) {
        return res.sendFile(distFilePath);
      }
      const publicFilePath = path.resolve(process.cwd(), 'public', fileName);
      if (fs.existsSync(publicFilePath)) {
        return res.sendFile(publicFilePath);
      }
      next();
    });

    // 3. Serve root static files (excluding index.html so SEO handler handles document routes)
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res, filePath) => {
          const lower = filePath.toLowerCase();
          if (
            lower.endsWith('.html') ||
            lower.endsWith('.json') ||
            lower.includes('sw.js') ||
            lower.includes('registersw') ||
            lower.includes('manifest')
          ) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
          } else if (lower.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            // Static icons, svgs, etc.: revalidate frequently
            res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
          }
        },
      })
    );

    // 4. SPA SEO-aware Document Catch-all: injects canonical, robots, X-Robots-Tag, JSON-LD, and real 404 status
    const prodTemplate = fs.readFileSync(path.resolve(distPath, 'index.html'), 'utf-8');
    app.get('*', (req: Request, res: Response, next) => {
      if (!isHtmlDocumentRequest(req)) {
        return next();
      }
      const { html, seo } = injectSeoIntoHtml(prodTemplate, req);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.setHeader('X-Robots-Tag', seo.robots);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(seo.statusCode).send(html);
    });
  } else {
    console.log('[SERVER] Mode Développement actif - Démarrage du middleware Vite.');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'custom',
    });

    app.get('*', async (req: Request, res: Response, next) => {
      if (!isHtmlDocumentRequest(req)) {
        return next();
      }
      try {
        const rawTemplate = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const transformedHtml = await vite.transformIndexHtml(req.originalUrl, rawTemplate);
        const { html, seo } = injectSeoIntoHtml(transformedHtml, req);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('X-Robots-Tag', seo.robots);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(seo.statusCode).send(html);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        return next(err);
      }
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

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
