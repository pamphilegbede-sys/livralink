import express, { Request, Response } from 'express';
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
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

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

/**
 * POST /api/auth/send-reset-code
 * Generates an unpredictable 6-digit random code, hashes it on the server,
 * enforces rate-limiting (60s), and dispatches it via Brevo SMTP.
 */
app.post('/api/auth/send-reset-code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ success: false, error: 'Veuillez saisir une adresse e-mail valide.' });
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
    const { email, code } = req.body;

    if (!email || !code) {
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

    // Hash provided code and compare with stored hash
    const inputHash = hashOTPCode(cleanEmail, cleanCode);

    if (inputHash !== stored.hashedCode) {
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
    const { email, resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      res.status(400).json({ success: false, error: 'Paramètres manquants pour la réinitialisation.' });
      return;
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({ success: false, error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
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

    res.json({
      success: true,
      firebaseAuthUpdated,
      message: 'Votre mot de passe a été mis à jour avec succès dans Firebase Authentication.',
    });
  } catch (error: any) {
    console.error('[AUTH ERROR] reset-password:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour du mot de passe.' });
  }
});

// Health check endpoint for Render / cloud monitoring
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

async function startServer() {
  const distPath = path.resolve(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.resolve(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' || hasDist;

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
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] LivraLink running at http://0.0.0.0:${PORT} (Mode: ${isProduction ? 'production' : 'development'})`);
  });

  // Graceful shutdown on Render / container stop
  const handleShutdown = (signal: string) => {
    console.log(`[SERVER] Reçu ${signal}, arrêt propre du serveur...`);
    server.close(() => {
      console.log('[SERVER] Serveur arrêté avec succès.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer();
