import { auth } from '../firebase/config';

const getAdminAuthHeaders = async (withJson = true): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {};
  if (withJson) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch (err) {
    console.warn('Impossible de récupérer le jeton Firebase ID:', err);
  }
  return headers;
};

export interface SentEmailItem {
  id: string;
  dedupKey?: string;
  type: 'welcome' | 'password_reset_request' | 'password_changed_confirmation' | 'priority_mission' | 'custom' | 'kyc_submitted' | 'kyc_approved' | 'kyc_rejected';
  to: string;
  recipientName: string;
  recipientRole?: string;
  subject: string;
  previewText: string;
  htmlContent: string;
  sentAt: string;
  deliveredViaSmtp: boolean;
  status?: 'sent' | 'queued' | 'failed';
  retryCount?: number;
  lastError?: string;
}

const LOCAL_STORAGE_KEY = 'livralink_sent_emails';

export const getLocalSentEmails = (): SentEmailItem[] => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

export const saveLocalSentEmail = (email: SentEmailItem) => {
  try {
    const list = getLocalSentEmails();
    const updated = [email, ...list.filter((e) => e.id !== email.id)].slice(0, 50);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Erreur sauvegarde locale email:', err);
  }
};

/**
 * Envoie un e-mail de bienvenue personnalisé dès qu'un utilisateur crée son compte.
 */
export const sendWelcomeEmail = async (payload: {
  email: string;
  fullName: string;
  role: 'vendeur' | 'livreur';
  storeName?: string;
  vehicleType?: string;
  phone?: string;
}): Promise<{ success: boolean; emailDelivered?: boolean; message?: string }> => {
  const localRecord: SentEmailItem = {
    id: `welcome_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: 'welcome',
    to: payload.email,
    recipientName: payload.fullName,
    recipientRole: payload.role,
    subject: `Bienvenue sur LivraLink, ${payload.fullName} ! 🚀 Votre compte ${payload.role === 'vendeur' ? 'Vendeur' : 'Livreur'} est activé`,
    previewText: `Félicitations pour votre inscription sur LivraLink Bénin. Votre espace est prêt.`,
    htmlContent: `
      <div style="font-family: sans-serif; padding: 20px; color: #0f172a;">
        <h2 style="color: #2563eb;">Bienvenue sur LivraLink, ${payload.fullName} !</h2>
        <p>Votre compte <strong>${payload.role === 'vendeur' ? 'Vendeur' : 'Livreur'}</strong> a été créé avec succès.</p>
        <p>Identifiant de connexion : <strong>${payload.email}</strong></p>
        ${payload.storeName ? `<p>Boutique : <strong>${payload.storeName}</strong></p>` : ''}
        ${payload.vehicleType ? `<p>Véhicule : <strong>${payload.vehicleType}</strong></p>` : ''}
        <p style="margin-top: 20px; font-size: 12px; color: #64748b;">© LivraLink Bénin - Logistique urbaine sécurisée</p>
      </div>
    `,
    sentAt: new Date().toISOString(),
    deliveredViaSmtp: false,
  };

  try {
    const res = await fetch('/api/email/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      localRecord.deliveredViaSmtp = Boolean(data.emailDelivered);
      saveLocalSentEmail(localRecord);
      return { success: true, emailDelivered: data.emailDelivered, message: data.message };
    }
  } catch (err) {
    console.warn('Notice envoi email serveur (sauvegarde locale effectuée):', err);
  }

  saveLocalSentEmail(localRecord);
  return { success: true, emailDelivered: false, message: 'Email de bienvenue généré et archivé.' };
};

/**
 * Envoie un e-mail de confirmation après une mise à jour réussie du mot de passe.
 */
export const sendPasswordChangedConfirmationEmail = async (payload: {
  email: string;
  fullName?: string;
}): Promise<{ success: boolean; emailDelivered?: boolean }> => {
  const localRecord: SentEmailItem = {
    id: `pwd_changed_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: 'password_changed_confirmation',
    to: payload.email,
    recipientName: payload.fullName || payload.email.split('@')[0],
    subject: '🔐 LivraLink : Votre mot de passe a été modifié',
    previewText: 'Confirmation de sécurité : votre mot de passe a été mis à jour avec succès.',
    htmlContent: `
      <div style="font-family: sans-serif; padding: 20px; color: #0f172a;">
        <h2 style="color: #16a34a;">Mot de passe mis à jour</h2>
        <p>Le mot de passe de votre compte LivraLink (<strong>${payload.email}</strong>) a été modifié avec succès.</p>
        <p style="color: #dc2626; font-size: 13px;">Si vous n'êtes pas à l'origine de cette action, veuillez contacter le support immédiatement.</p>
      </div>
    `,
    sentAt: new Date().toISOString(),
    deliveredViaSmtp: false,
  };

  try {
    const res = await fetch('/api/email/password-changed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      localRecord.deliveredViaSmtp = Boolean(data.emailDelivered);
      saveLocalSentEmail(localRecord);
      return { success: true, emailDelivered: data.emailDelivered };
    }
  } catch (err) {
    console.warn('Notice confirmation mot de passe serveur:', err);
  }

  saveLocalSentEmail(localRecord);
  return { success: true, emailDelivered: false };
};

/**
 * Envoie un e-mail de confirmation après validation ou mise à jour du KYC par l'administrateur.
 */
export const sendKycConfirmationEmail = async (payload: {
  email: string;
  fullName: string;
  role?: 'vendeur' | 'livreur' | string;
  status: 'approved' | 'rejected';
  reason?: string;
}): Promise<{ success: boolean; emailDelivered?: boolean; message?: string }> => {
  const isApproved = payload.status === 'approved';
  const roleLabel = payload.role === 'vendeur' ? 'Vendeur / Marchand' : 'Livreur Partenaire';

  const localRecord: SentEmailItem = {
    id: `kyc_${payload.status}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: isApproved ? 'kyc_approved' : 'kyc_rejected',
    to: payload.email,
    recipientName: payload.fullName,
    recipientRole: payload.role,
    subject: isApproved
      ? `🎉 Compte Activé ! Votre vérification KYC LivraLink est confirmée, ${payload.fullName}`
      : `⚠️ Dossier KYC LivraLink : Action requise pour la validation de votre compte`,
    previewText: isApproved
      ? `Bonne nouvelle ! Votre dossier KYC est validé et votre compte ${roleLabel} est 100% opérationnel.`
      : `Information sur votre dossier d'accréditation LivraLink.`,
    htmlContent: `
      <div style="font-family: sans-serif; padding: 20px; color: #0f172a;">
        <h2 style="color: ${isApproved ? '#16a34a' : '#dc2626'};">${isApproved ? '🎉 Votre compte est activé !' : '⚠️ Mise à jour de votre dossier KYC'}</h2>
        <p>Bonjour <strong>${payload.fullName}</strong>,</p>
        ${
          isApproved
            ? `<p>Nous avons le plaisir de vous informer que votre dossier d'identification et vos pièces justificatives KYC ont été vérifiés et <strong>approuvés</strong> par notre équipe d'administration.</p>
               <p>Votre compte <strong>${roleLabel}</strong> est désormais pleinement actif et accrédité sur la plateforme LivraLink Bénin.</p>`
            : `<p>Votre dossier KYC a été examiné par notre équipe. Malheureusement, il ne peut pas être validé en l'état pour la raison suivante :</p>
               <blockquote style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; color: #991b1b;">${payload.reason || 'Documents d\'identité non conformes ou illisibles.'}</blockquote>
               <p>Veuillez vous connecter à votre espace pour soumettre à nouveau vos cartes et documents mis à jour.</p>`
        }
      </div>
    `,
    sentAt: new Date().toISOString(),
    deliveredViaSmtp: false,
  };

  try {
    const res = await fetch('/api/email/kyc-approved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      localRecord.deliveredViaSmtp = Boolean(data.emailDelivered);
      saveLocalSentEmail(localRecord);
      return { success: true, emailDelivered: data.emailDelivered, message: data.message };
    }
  } catch (err) {
    console.warn('Notice envoi email KYC serveur:', err);
  }

  saveLocalSentEmail(localRecord);
  return { success: true, emailDelivered: false, message: 'Notification KYC générée et archivée.' };
};

/**
 * Envoie une confirmation par e-mail au dépôt d'un dossier KYC.
 */
export const sendKycSubmissionEmail = async (payload: {
  email: string;
  fullName: string;
  role?: 'vendeur' | 'livreur' | string;
  idType?: string;
  idNumber?: string;
}): Promise<{ success: boolean; emailDelivered?: boolean; message?: string }> => {
  const roleLabel = payload.role === 'vendeur' ? 'Vendeur / Marchand' : 'Livreur Partenaire';

  const localRecord: SentEmailItem = {
    id: `kyc_sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: 'kyc_submitted',
    to: payload.email,
    recipientName: payload.fullName,
    recipientRole: payload.role,
    subject: `📥 Réception de vos documents KYC - LivraLink Bénin`,
    previewText: `Nous avons bien reçu vos pièces d'identité (${payload.idType || 'Document'} #${payload.idNumber || ''}). Traitement en cours.`,
    htmlContent: `
      <div style="font-family: sans-serif; padding: 20px; color: #0f172a;">
        <h2 style="color: #2563eb;">Dossier KYC bien reçu !</h2>
        <p>Bonjour <strong>${payload.fullName}</strong>,</p>
        <p>Nous vous confirmons la réception de vos pièces d'identité pour la vérification KYC de votre compte <strong>${roleLabel}</strong>.</p>
        <p>Nos équipes procèdent à la vérification de vos documents (${payload.idType || 'Pièce'} #${payload.idNumber || ''}). Vous recevrez une notification par email dès la validation administrative.</p>
      </div>
    `,
    sentAt: new Date().toISOString(),
    deliveredViaSmtp: false,
  };

  try {
    const res = await fetch('/api/email/kyc-submitted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      localRecord.deliveredViaSmtp = Boolean(data.emailDelivered);
      saveLocalSentEmail(localRecord);
      return { success: true, emailDelivered: data.emailDelivered, message: data.message };
    }
  } catch (err) {
    console.warn('Notice envoi email KYC soumis:', err);
  }

  saveLocalSentEmail(localRecord);
  return { success: true, emailDelivered: false, message: 'Email de réception KYC archivé.' };
};

/**
 * Envoie une notification par e-mail au livreur pour une mission prioritaire.
 */
export const sendPriorityMissionEmail = async (payload: {
  email: string;
  courierName?: string;
  orderId: string;
  pickupName?: string;
  dropoffCommune?: string;
  feeFCFA?: number;
  codFCFA?: number;
}): Promise<{ success: boolean; emailDelivered?: boolean }> => {
  try {
    const res = await fetch('/api/email/priority-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { success: Boolean(data.success), emailDelivered: Boolean(data.emailDelivered) };
  } catch (err) {
    console.warn('Erreur envoi notification mission par email:', err);
    return { success: false, emailDelivered: false };
  }
};

/**
 * Récupère l'historique complet des e-mails envoyés (serveur + local).
 */
export const fetchSentEmailsHistory = async (): Promise<SentEmailItem[]> => {
  try {
    const headers = await getAdminAuthHeaders(false);
    const res = await fetch('/api/email/outbox', { headers });
    const data = await res.json();
    if (res.ok && data.success && Array.isArray(data.emails) && data.emails.length > 0) {
      // Merge with local records
      const serverEmails: SentEmailItem[] = data.emails;
      const local = getLocalSentEmails();
      const ids = new Set(serverEmails.map((e) => e.id));
      const merged = [...serverEmails, ...local.filter((l) => !ids.has(l.id))];
      return merged.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    }
  } catch (err) {
    console.warn('Notice récupération outbox serveur:', err);
  }
  return getLocalSentEmails();
};

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  from: string;
  hasPassword: boolean;
  secure?: boolean;
  isConfigured?: boolean;
}

export const fetchSmtpConfig = async (): Promise<SmtpConfig | null> => {
  try {
    const headers = await getAdminAuthHeaders(false);
    const res = await fetch('/api/admin/email/config', { headers });
    const data = await res.json();
    if (res.ok && data.success) {
      return data.config;
    }
  } catch (err) {
    console.warn('Erreur récupération config SMTP:', err);
  }
  return null;
};

export const updateSmtpConfig = async (payload: {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
}): Promise<{ success: boolean; message?: string; config?: SmtpConfig }> => {
  try {
    const headers = await getAdminAuthHeaders(true);
    const res = await fetch('/api/admin/email/config', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, message: data.message, config: data.config };
    }
    return { success: false, message: data.error || 'Erreur lors de la mise à jour SMTP.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Erreur réseau.' };
  }
};

export const testSmtpConnection = async (payload?: {
  sendTestEmail?: boolean;
  targetEmail?: string;
}): Promise<{
  success: boolean;
  verified: boolean;
  latencyMs?: number;
  messageSent?: boolean;
  recipient?: string;
  testEmailError?: string;
  message?: string;
  error?: string;
  config?: SmtpConfig;
}> => {
  try {
    const headers = await getAdminAuthHeaders(true);
    const res = await fetch('/api/admin/email/test-smtp', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload || {}),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      verified: false,
      error: err?.message || 'Impossible de contacter le serveur backend pour tester SMTP.',
    };
  }
};

export interface AutomatedEmailPayload {
  eventType: 'delivery_created' | 'delivery_accepted' | 'delivery_picked_up' | 'delivery_completed' | 'delivery_cancelled' | 'wallet_transaction' | 'security_alert';
  recipientEmail: string;
  recipientName?: string;
  details?: {
    orderId?: string;
    pickupName?: string;
    dropoffCommune?: string;
    feeFCFA?: number;
    codFCFA?: number;
    courierName?: string;
    courierPhone?: string;
    otpVerified?: boolean;
    reason?: string;
    transactionType?: 'credit' | 'debit';
    amountFCFA?: number;
    newBalanceFCFA?: number;
    alertTitle?: string;
    alertDesc?: string;
    message?: string;
  };
}

/**
 * Service centralisé d'envoi automatique de notifications par e-mail
 * pour les événements de la plateforme LivraLink (création, acceptation, récupération, livraison, annulation, paiement, sécurité).
 */
export const sendPlatformNotification = async (
  payload: AutomatedEmailPayload
): Promise<{ success: boolean; emailDelivered?: boolean; message?: string }> => {
  try {
    const res = await fetch('/api/email/notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return {
      success: Boolean(data.success),
      emailDelivered: Boolean(data.emailDelivered),
      message: data.message,
    };
  } catch (err) {
    console.warn('Erreur envoi notification e-mail automatisée:', err);
    return { success: false, emailDelivered: false };
  }
};

export const processEmailQueue = async (): Promise<{
  success: boolean;
  message?: string;
  processedCount?: number;
  successCount?: number;
}> => {
  try {
    const headers = await getAdminAuthHeaders(true);
    const res = await fetch('/api/admin/email/process-queue', {
      method: 'POST',
      headers,
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erreur lors du traitement de la file d\'attente.',
    };
  }
};


