export interface SentEmailItem {
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
    const res = await fetch('/api/email/outbox');
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
