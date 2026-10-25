import React, { useState } from 'react';
import { adminResetUserPassword, requestPasswordResetCode, getFirebaseAuthErrorMessage } from '../../firebase/authService';
import { useApp } from '../../context/AppContext';

export interface TargetResetUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'vendeur' | 'livreur';
  status: string;
  storeName?: string;
  vehicle?: string;
}

interface ResetUserAccessModalProps {
  user: TargetResetUser | null;
  onClose: () => void;
  onUserStatusChange?: (id: string, role: 'vendeur' | 'livreur', newStatus: string) => void;
}

export const ResetUserAccessModal: React.FC<ResetUserAccessModalProps> = ({
  user,
  onClose,
  onUserStatusChange,
}) => {
  const { showToast, addAuditLog, toggleCourierStatus, toggleMerchantStatus } = useApp();

  const [activeTab, setActiveTab] = useState<'direct' | 'email'>('direct');
  const [newPassword, setNewPassword] = useState('LivraLink@2025!');
  const [showPassword, setShowPassword] = useState(false);
  const [autoReactivate, setAutoReactivate] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [successResult, setSuccessResult] = useState<{
    temporaryPassword?: string;
    message: string;
  } | null>(null);

  if (!user) return null;

  const isSuspended = user.status === 'suspendu';

  // Generate strong random password
  const generateStrongPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let res = 'LL-';
    for (let i = 0; i < 8; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(res);
  };

  // Handle direct password reset
  const handleDirectReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      showToast('Le mot de passe doit comporter au moins 6 caractères.', 'error');
      return;
    }

    setIsLoading(true);
    setSuccessResult(null);

    try {
      const res = await adminResetUserPassword(user.email, newPassword);

      // Auto reactivate if requested and currently suspended
      if (autoReactivate && isSuspended) {
        if (user.role === 'livreur') {
          toggleCourierStatus(user.id);
        } else {
          toggleMerchantStatus(user.id);
        }
        if (onUserStatusChange) {
          onUserStatusChange(user.id, user.role, user.role === 'livreur' ? 'en_ligne' : 'actif');
        }
      }

      addAuditLog(
        'security',
        `Réinitialisation d'accès : ${user.name}`,
        `Mot de passe réinitialisé pour ${user.email} (${user.role.toUpperCase()}) par l'administrateur.`
      );

      setSuccessResult({
        temporaryPassword: newPassword,
        message: res.message,
      });

      showToast(`Accès réinitialisés pour ${user.name} !`, 'success');
    } catch (err: any) {
      const msg = getFirebaseAuthErrorMessage(err);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle official email reset link
  const handleSendResetEmail = async () => {
    setIsLoading(true);
    setSuccessResult(null);

    try {
      const res = await requestPasswordResetCode(user.email);
      addAuditLog(
        'security',
        `Envoi lien réinitialisation : ${user.email}`,
        `L'administrateur a déclenché l'envoi d'un code de sécurité pour ${user.name}.`
      );

      setSuccessResult({
        message: res.message || `Lien et code de sécurité transmis à ${user.email}.`,
      });

      showToast(`E-mail de réinitialisation transmis à ${user.email} !`, 'success');
    } catch (err: any) {
      const msg = getFirebaseAuthErrorMessage(err);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Copy credentials message for WhatsApp or SMS
  const handleCopyCredentials = () => {
    const pwd = successResult?.temporaryPassword || newPassword;
    const msg = `Bonjour ${user.name},\nVos identifiants d'accès sur l'application LivraLink Bénin ont été réinitialisés par l'administrateur :\n\n📧 Identifiant : ${user.email}\n🔑 Nouveau mot de passe : ${pwd}\n\n👉 Vous pouvez vous connecter dès maintenant. Pensez à changer votre mot de passe après connexion.`;

    navigator.clipboard.writeText(msg).then(() => {
      showToast('Identifiants copiés dans le presse-papiers (prêt pour WhatsApp/SMS) !', 'success');
    }).catch(() => {
      showToast('Impossible de copier automatiquement.', 'error');
    });
  };

  // Toggle user suspension right inside modal
  const handleToggleSuspension = () => {
    if (user.role === 'livreur') {
      toggleCourierStatus(user.id);
    } else {
      toggleMerchantStatus(user.id);
    }
    const newStat = isSuspended ? (user.role === 'livreur' ? 'en_ligne' : 'actif') : 'suspendu';
    if (onUserStatusChange) {
      onUserStatusChange(user.id, user.role, newStat);
    }
    addAuditLog(
      'security',
      `${isSuspended ? 'Réactivation' : 'Suspension'} de compte : ${user.name}`,
      `L'administrateur a ${isSuspended ? 'réactivé' : 'suspendu'} le compte de ${user.name} (${user.role}).`
    );
    showToast(`Compte ${isSuspended ? 'réactivé' : 'suspendu'} avec succès !`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-lg w-full shadow-2xl border border-slate-200 space-y-5 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl">lock_reset</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-base sm:text-lg text-slate-900">
                  Gestion des Accès &amp; Sécurité
                </h3>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                  user.role === 'livreur' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {user.role}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Contrôle administrateur des identifiants et du statut de connexion
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Fermer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* User Card Summary */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900 text-sm">{user.name}</span>
            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
              isSuspended ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {isSuspended ? '🔴 Compte Suspendu' : '🟢 Compte Actif'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-slate-600 pt-1 border-t border-slate-200/60 text-[11px]">
            <div>
              <span className="text-slate-400 block">E-mail de connexion :</span>
              <span className="font-mono font-semibold text-slate-900 truncate block">{user.email}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Téléphone / WhatsApp :</span>
              <span className="font-semibold text-slate-900 block">{user.phone}</span>
            </div>
          </div>
        </div>

        {/* Action Toggle Tab */}
        <div className="flex items-center p-1 bg-slate-100 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => { setActiveTab('direct'); setSuccessResult(null); }}
            className={`flex-1 py-2 text-center rounded-lg transition-all ${
              activeTab === 'direct' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            🔑 Définir Nouveau Mot de Passe
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('email'); setSuccessResult(null); }}
            className={`flex-1 py-2 text-center rounded-lg transition-all ${
              activeTab === 'email' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            ✉️ Envoyer Lien E-mail
          </button>
        </div>

        {/* Tab 1: Direct Password Setup */}
        {activeTab === 'direct' && (
          <form onSubmit={handleDirectReset} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Nouveau mot de passe temporaire :
                </label>
                <button
                  type="button"
                  onClick={generateStrongPassword}
                  className="text-[11px] text-blue-600 hover:underline font-bold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-xs">autorenew</span>
                  <span>Générer un mot de passe</span>
                </button>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 caractères"
                  className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-sm">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Auto Reactivate Checkbox */}
            {isSuspended && (
              <label className="flex items-center gap-2 p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoReactivate}
                  onChange={(e) => setAutoReactivate(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-amber-900">
                  Débloquer et réactiver le compte automatiquement lors de la réinitialisation
                </span>
              </label>
            )}

            {/* Success state box */}
            {successResult && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <span className="material-symbols-outlined text-base text-emerald-600">check_circle</span>
                  <span>{successResult.message}</span>
                </div>
                <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-emerald-200">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Nouveau mot de passe :</span>
                    <span className="font-mono font-black text-slate-900 text-sm">
                      {successResult.temporaryPassword}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCredentials}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shadow-xs"
                  >
                    <span className="material-symbols-outlined text-xs">content_copy</span>
                    <span>Copier message WhatsApp</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">vpn_key</span>
                <span>{isLoading ? 'Enregistrement...' : 'Valider le mot de passe'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyCredentials}
                className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                title="Copier les identifiants pour transmission"
              >
                <span className="material-symbols-outlined text-sm">content_copy</span>
                <span>Copier</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Email Reset Link */}
        {activeTab === 'email' && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              Un e-mail officiel contenant un code de réinitialisation sécurisé à 6 chiffres et un lien d'action sera transmis directement à l'adresse e-mail vérifiée de l'utilisateur.
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800">
              Destinataire : <strong>{user.email}</strong>
            </div>

            {successResult && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-emerald-600">mail</span>
                <span>{successResult.message}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleSendResetEmail}
              disabled={isLoading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">send</span>
              <span>{isLoading ? 'Envoi en cours...' : 'Envoyer l\'e-mail de réinitialisation'}</span>
            </button>
          </div>
        )}

        {/* Bottom Suspension Status Control */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-slate-500">Statut du compte : </span>
            <span className={`font-bold ${isSuspended ? 'text-red-600' : 'text-emerald-700'}`}>
              {isSuspended ? 'Suspendu / Bloqué' : 'Opérationnel / Actif'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleToggleSuspension}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer ${
              isSuspended
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              {isSuspended ? 'lock_open' : 'block'}
            </span>
            <span>{isSuspended ? 'Réactiver le compte' : 'Suspendre le compte'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
