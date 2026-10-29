import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { fetchSentEmailsHistory, SentEmailItem, sendWelcomeEmail, sendPasswordChangedConfirmationEmail } from '../../services/emailService';

interface EmailNotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmailNotificationCenterModal: React.FC<EmailNotificationCenterModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { userProfile, currentRole, showToast } = useApp();
  const [emails, setEmails] = useState<SentEmailItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<SentEmailItem | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'welcome' | 'password_reset_request' | 'password_changed_confirmation' | 'priority_mission'>('all');
  const [isSendingTest, setIsSendingTest] = useState(false);

  const loadEmails = async () => {
    setIsLoading(true);
    try {
      const list = await fetchSentEmailsHistory();
      setEmails(list);
      if (list.length > 0 && !selectedEmail) {
        setSelectedEmail(list[0]);
      }
    } catch (err) {
      console.warn('Erreur chargement boîte d\'envoi:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadEmails();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredEmails = emails.filter((item) => {
    if (activeFilter === 'all') return true;
    return item.type === activeFilter;
  });

  const handleSendTestWelcome = async () => {
    setIsSendingTest(true);
    const targetEmail = userProfile?.email || 'test.utilisateur@livralink.bj';
    const targetName = userProfile?.fullName || 'Utilisateur Test';
    const targetRole = currentRole === 'livreur' ? 'livreur' : 'vendeur';

    try {
      const res = await sendWelcomeEmail({
        email: targetEmail,
        fullName: targetName,
        role: targetRole,
        storeName: targetRole === 'vendeur' ? 'Boutique Test LivraLink' : undefined,
        vehicleType: targetRole === 'livreur' ? 'Moto 125cc' : undefined,
        phone: userProfile?.phone || '+229 97 00 00 00',
      });

      showToast(`E-mail de bienvenue envoyé à ${targetEmail} !`, 'success');
      await loadEmails();
    } catch (err: any) {
      showToast('Erreur envoi e-mail test.', 'error');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSendTestPasswordConfirm = async () => {
    setIsSendingTest(true);
    const targetEmail = userProfile?.email || 'test.utilisateur@livralink.bj';
    const targetName = userProfile?.fullName || 'Utilisateur Test';

    try {
      await sendPasswordChangedConfirmationEmail({
        email: targetEmail,
        fullName: targetName,
      });

      showToast(`Notification de changement de mot de passe envoyée à ${targetEmail} !`, 'success');
      await loadEmails();
    } catch {
      showToast('Erreur envoi notification test.', 'error');
    } finally {
      setIsSendingTest(false);
    }
  };

  const getTypeBadge = (type: SentEmailItem['type']) => {
    switch (type) {
      case 'welcome':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-700">BIENVENUE</span>;
      case 'password_reset_request':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-700">CODE RÉINIT</span>;
      case 'password_changed_confirmation':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700">CONFIRMATION MOT DE PASSE</span>;
      case 'priority_mission':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700">MISSION PRIORITAIRE</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700">NOTIFICATION</span>;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-4xl h-[90vh] max-h-[780px] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <span className="material-symbols-outlined text-2xl">mark_email_read</span>
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Centre des E-mails &amp; Notifications</span>
                <span className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded-full font-mono font-bold">
                  {emails.length}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Suivi des envois automatiques (Bienvenue, réinitialisation de mot de passe, confirmation et alertes)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadEmails}
              disabled={isLoading}
              className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
              title="Rafraîchir"
            >
              <span className={`material-symbols-outlined text-lg ${isLoading ? 'animate-spin' : ''}`}>sync</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
              title="Fermer"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </header>

        {/* Action Row & Quick Test Triggers */}
        <div className="px-4 py-3 bg-blue-50/60 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar text-xs">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              Tous ({emails.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('welcome')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeFilter === 'welcome'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              Bienvenue
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('password_reset_request')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeFilter === 'password_reset_request'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              Codes Réinit
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('password_changed_confirmation')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeFilter === 'password_changed_confirmation'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              Confirmations
            </button>
          </div>

          {/* Test Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSendTestWelcome}
              disabled={isSendingTest}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">send</span>
              <span>Tester E-mail Bienvenue</span>
            </button>

            <button
              type="button"
              onClick={handleSendTestPasswordConfirm}
              disabled={isSendingTest}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">lock_reset</span>
              <span>Tester Notification Sécurité</span>
            </button>
          </div>
        </div>

        {/* Two-Pane Layout: List (left) & Live Preview (right) */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left: Email List */}
          <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 dark:border-slate-800 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-slate-50/50 dark:bg-slate-900/40">
            {filteredEmails.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <span className="material-symbols-outlined text-3xl mb-1 text-slate-300">drafts</span>
                <p className="text-xs">Aucun e-mail dans cette catégorie.</p>
              </div>
            ) : (
              filteredEmails.map((item) => {
                const isSelected = selectedEmail?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedEmail(item)}
                    className={`w-full text-left p-3 rounded-2xl transition-all border ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      {getTypeBadge(item.type)}
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(item.sentAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 line-clamp-1 mb-0.5">
                      {item.subject}
                    </h4>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mb-1.5">
                      {item.previewText}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                      <span className="truncate max-w-[150px]">À: {item.to}</span>
                      <span className={`inline-flex items-center gap-0.5 font-bold ${item.deliveredViaSmtp ? 'text-emerald-600' : 'text-blue-500'}`}>
                        <span className="material-symbols-outlined text-xs">
                          {item.deliveredViaSmtp ? 'cloud_done' : 'history_toggle_off'}
                        </span>
                        <span>{item.deliveredViaSmtp ? 'Brevo SMTP' : 'Archivé'}</span>
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right: Live Email Preview */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-slate-900">
            {selectedEmail ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Meta details bar */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-bold uppercase text-[10px]">Objet :</span>
                    <span className="text-slate-400 text-[11px]">
                      {new Date(selectedEmail.sentAt).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {selectedEmail.subject}
                  </h3>
                  <div className="flex items-center gap-2 pt-1 text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">Destinataire :</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-mono">
                      {selectedEmail.to}
                    </span>
                    {selectedEmail.recipientName && (
                      <span className="text-slate-400">({selectedEmail.recipientName})</span>
                    )}
                  </div>
                </div>

                {/* Email HTML Render Frame */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 bg-[#f8fafc] dark:bg-slate-950/40">
                  <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div
                      className="p-4 sm:p-6 prose prose-slate max-w-none"
                      dangerouslySetInnerHTML={{ __html: selectedEmail.htmlContent }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400">
                <div>
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">mail</span>
                  <p className="text-xs">Sélectionnez un e-mail dans la liste de gauche pour en afficher l'aperçu complet.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Passerelle Brevo SMTP &amp; Outbox LivraLink en service</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer transition-colors"
          >
            Fermer
          </button>
        </footer>
      </div>
    </div>
  );
};
