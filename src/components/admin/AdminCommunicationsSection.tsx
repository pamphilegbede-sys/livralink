import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export interface AnnouncementRecord {
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

export const AdminCommunicationsSection: React.FC = () => {
  const {
    showToast,
    merchants,
    couriers,
    sendAdminBroadcast,
  } = useApp();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<'tous' | 'vendeurs' | 'livreurs' | 'admins' | 'individuel'>('tous');
  const [channel, setChannel] = useState<'notification' | 'email' | 'both'>('both');
  const [targetUid, setTargetUid] = useState('');
  const [targetEmail, setTargetEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [announcementsHistory, setAnnouncementsHistory] = useState<AnnouncementRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Fetch past announcements
  const fetchAnnouncementsHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/admin/announcements', {
        headers: {
          'x-admin-secret': 'livralink_super_admin_2026_key',
        },
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.announcements)) {
        setAnnouncementsHistory(data.announcements);
      }
    } catch (err) {
      console.warn('Notice chargement historique annonces:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchAnnouncementsHistory();
  }, []);

  // Compute recipient count based on audience
  const calculateRecipientCount = () => {
    if (audience === 'vendeurs') return merchants.length;
    if (audience === 'livreurs') return couriers.length;
    if (audience === 'admins') return 1;
    if (audience === 'individuel') return (targetUid || targetEmail) ? 1 : 0;
    return merchants.length + couriers.length + 1; // Tous
  };

  const recipientCount = calculateRecipientCount();

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Veuillez saisir un titre pour la communication.', 'error');
      return;
    }
    if (!message.trim()) {
      showToast('Veuillez saisir le contenu du message.', 'error');
      return;
    }
    if (audience === 'individuel' && !targetUid && !targetEmail) {
      showToast('Veuillez sélectionner ou renseigner un utilisateur cible.', 'error');
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmSend = async () => {
    setIsSubmitting(true);
    setShowConfirmModal(false);

    try {
      const success = await sendAdminBroadcast({
        title,
        message,
        audience,
        channel,
        targetUid: targetUid || undefined,
        targetEmail: targetEmail || undefined,
      });

      if (success) {
        setTitle('');
        setMessage('');
        setTargetUid('');
        setTargetEmail('');
        fetchAnnouncementsHistory();
      }
    } catch (err) {
      showToast('Erreur serveur lors de la diffusion.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in font-['Plus_Jakarta_Sans'] pb-24">
      {/* Header Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <span>TOTAL ANNONCES</span>
            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-xl">campaign</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {announcementsHistory.length}
          </div>
          <p className="text-[11px] text-slate-400">Diffusions officielles enregistrées</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <span>DISTRIBUTION MARCHANDS</span>
            <span className="material-symbols-outlined text-sky-600 text-xl">storefront</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {merchants.length}
          </div>
          <p className="text-[11px] text-slate-400">Boutiques répertoriées en cible</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <span>DISTRIBUTION LIVREURS</span>
            <span className="material-symbols-outlined text-emerald-600 text-xl">two_wheeler</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {couriers.length}
          </div>
          <p className="text-[11px] text-slate-400">Coursiers accrédités en cible</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <span>ISOLATION SÉCURISÉE</span>
            <span className="material-symbols-outlined text-purple-600 text-xl">verified_user</span>
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            100% UID
          </div>
          <p className="text-[11px] text-slate-400">Notifications filtrées par destinataire</p>
        </div>
      </div>

      {/* Main Broadcast Editor Form + Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editor Column */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-xl">send</span>
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Nouvelle Communication Officielle
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Rédigez et diffusez un message isolé auprès de l'audience de votre choix
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              🎯 {recipientCount} destinataire{recipientCount > 1 ? 's' : ''}
            </span>
          </div>

          <form onSubmit={handleOpenConfirm} className="space-y-4">
            {/* Title Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Sujet / Titre de la communication *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Alerte météo Cotonou • Mise à jour des frais de livraison"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
            </div>

            {/* Audience Scope Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Portée de l'Audience Cible *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'tous', label: '🌐 Tous les utilisateurs', desc: 'Vendeurs, livreurs, admins' },
                  { id: 'vendeurs', label: '🏪 Vendeurs uniquement', desc: `${merchants.length} boutiques` },
                  { id: 'livreurs', label: '🛵 Livreurs uniquement', desc: `${couriers.length} coursiers` },
                  { id: 'admins', label: '👑 Administrateurs', desc: 'Super-admins' },
                  { id: 'individuel', label: '👤 Utilisateur Précis', desc: 'Cible unique par UID' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAudience(item.id as any)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      audience === item.id
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 ring-2 ring-blue-500/20 text-blue-900 dark:text-blue-100 font-bold'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs'
                    }`}
                  >
                    <div className="text-xs font-bold">{item.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Individual User Selector if 'individuel' selected */}
            {audience === 'individuel' && (
              <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 space-y-3">
                <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-amber-600">person_search</span>
                  <span>Sélectionner l'utilisateur destinataire unique :</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Choisir dans la liste :
                    </label>
                    <select
                      value={targetUid}
                      onChange={(e) => {
                        setTargetUid(e.target.value);
                        const m = merchants.find((item) => item.id === e.target.value);
                        const c = couriers.find((item) => item.id === e.target.value);
                        if (m) setTargetEmail(m.email);
                        else if (c) setTargetEmail(c.email || '');
                      }}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="">-- Choisir un compte --</option>
                      <optgroup label="Boutiques Vendeurs">
                        {merchants.map((m) => (
                          <option key={m.id} value={m.id}>
                            🏪 {m.storeName} ({m.managerName})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Livreurs Partenaires">
                        {couriers.map((c) => (
                          <option key={c.id} value={c.id}>
                            🛵 {c.name} ({c.phone})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Ou saisir l'E-mail / UID direct :
                    </label>
                    <input
                      type="text"
                      value={targetEmail}
                      onChange={(e) => setTargetEmail(e.target.value)}
                      placeholder="nom@exemple.com ou UID Firebase"
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Distribution Channel Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Canaux de Transmission *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'notification', label: '🔔 Notification In-App', desc: 'Isolée par UID' },
                  { id: 'email', label: '📧 E-mail SMTP', desc: 'Envoi direct' },
                  { id: 'both', label: '🔔📧 Notification + E-mail', desc: 'Canal complet (Recommandé)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setChannel(item.id as any)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      channel === item.id
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/60 ring-2 ring-blue-500/20 text-blue-900 dark:text-blue-100 font-bold'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs'
                    }`}
                  >
                    <div className="text-xs font-bold">{item.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Message Body Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Corps du Message Officiel *
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Rédigez l'annonce officielle. Les sauts de ligne seront préservés dans le message..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none custom-scrollbar"
                required
              />
            </div>

            {/* Submit Action Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined text-base animate-spin">sync</span>
                    <span>Diffusion en cours...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">campaign</span>
                    <span>Lancer la diffusion de la communication</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Live Preview Column */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-lg">preview</span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Aperçu de la notification In-App
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[10px]">
                Modèle Isolé
              </span>
            </div>

            {/* Simulated Notification Card */}
            <div className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700/80 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                  <span className="material-symbols-outlined text-lg">campaign</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-extrabold text-white truncate">
                    📢 {title.trim() || 'Titre de la communication officielle'}
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed whitespace-pre-wrap">
                    {message.trim() || 'Le corps de votre message s\'affichera ici exactement comme il sera reçu par l\'utilisateur sur son compte.'}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono border-t border-slate-700/60 pt-2">
                    <span>Aujourd'hui à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-blue-400 font-bold">recipientId: user.uid</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Security Isolation Guarantee Note */}
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-emerald-400">shield</span>
                <span>Garantie d'Isolation des Données</span>
              </div>
              <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                Chaque annonce générale est découpée en notifications individuelles assignées strictement à l'UID de chaque destinataire. Aucun utilisateur ne peut accéder aux notifications d'un autre compte.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Communications History Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-lg">history</span>
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Historique des Communications Diffusées ({announcementsHistory.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Journal certifié des annonces envoyées par l'administration
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchAnnouncementsHistory}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            <span>Rafraîchir</span>
          </button>
        </div>

        {isLoadingHistory ? (
          <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-lg animate-spin text-blue-600">sync</span>
            <span>Chargement du journal des annonces...</span>
          </div>
        ) : announcementsHistory.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 space-y-2">
            <span className="material-symbols-outlined text-3xl text-slate-300">campaign</span>
            <p className="font-semibold text-slate-700 dark:text-slate-300">Aucune communication enregistrée pour le moment</p>
            <p>Utilisez le formulaire ci-dessus pour envoyer votre première annonce ciblée.</p>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3">Date &amp; Heure</th>
                  <th className="py-3 px-3">Sujet / Titre</th>
                  <th className="py-3 px-3">Audience</th>
                  <th className="py-3 px-3">Canal</th>
                  <th className="py-3 px-3 text-center">Destinataires</th>
                  <th className="py-3 px-3">Émetteur</th>
                  <th className="py-3 px-3 text-right">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {announcementsHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-3 text-slate-500 dark:text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {new Date(item.sentAt).toLocaleDateString('fr-FR')} {new Date(item.sentAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3.5 px-3 text-slate-900 dark:text-white font-bold">
                      {item.title}
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {item.audience === 'tous' && '🌐 Tous'}
                        {item.audience === 'vendeurs' && '🏪 Vendeurs'}
                        {item.audience === 'livreurs' && '🛵 Livreurs'}
                        {item.audience === 'admins' && '👑 Admins'}
                        {item.audience === 'individuel' && '👤 Individuel'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                      {item.channel === 'both' && '🔔📧 Notification + Email'}
                      {item.channel === 'notification' && '🔔 Notification'}
                      {item.channel === 'email' && '📧 Email'}
                    </td>
                    <td className="py-3.5 px-3 text-center font-bold text-slate-900 dark:text-white">
                      {item.recipientCount}
                    </td>
                    <td className="py-3.5 px-3 text-slate-500 dark:text-slate-400 text-[11px]">
                      {item.sentBy}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.status === 'complete'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}>
                        {item.status === 'complete' ? '✓ Diffusé' : '⚠️ Partiel'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-2xl">campaign</span>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Confirmer la diffusion officielle ?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Vous êtes sur le point d'envoyer l'annonce <strong>« {title} »</strong> auprès de <strong className="text-blue-600 dark:text-blue-400">{recipientCount} destinataire(s)</strong> via le canal <strong className="uppercase">{channel}</strong>.
              </p>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <div><strong>Portée :</strong> {audience}</div>
              <div><strong>Canal :</strong> {channel}</div>
              <div className="truncate"><strong>Sujet :</strong> {title}</div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-md cursor-pointer"
              >
                Confirmer &amp; Diffuser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
