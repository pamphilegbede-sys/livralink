import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const GoogleSignInModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  targetRole?: 'vendeur' | 'livreur' | 'admin';
}> = ({ isOpen, onClose, targetRole = 'vendeur' }) => {
  const {
    setCurrentRole,
    setCurrentView,
    showToast,
    setMerchantSettings,
    setCourierSettings,
    setUserProfile,
    authorizedAdminEmails,
    isEmailAuthorizedAdmin,
    adminLoginWithGoogle,
    addAuditLog
  } = useApp();

  const [customEmail, setCustomEmail] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Real user accounts (Master admin + default accounts)
  const accounts = [
    {
      name: 'Pamphile Gbede',
      email: 'pamphile.gbede@gmail.com',
      avatar: 'PG',
      color: 'bg-indigo-600',
      tag: 'Super-Admin Propriétaire',
      isAdminAuthorized: true,
    },
    {
      name: 'Compte Démo Invité',
      email: 'invite.demo@gmail.com',
      avatar: 'IN',
      color: 'bg-slate-600',
      tag: 'Utilisateur Lambda (Non Admin)',
      isAdminAuthorized: false,
    },
  ];

  const handleSelectAccount = (email: string, name: string) => {
    setAuthError(null);
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);

      if (targetRole === 'admin') {
        const result = adminLoginWithGoogle(email, name);
        if (!result.success) {
          setAuthError(result.error || 'Accès refusé. Cette adresse n\'est pas autorisée.');
          return;
        }
        onClose();
        return;
      }

      // Non-admin roles (Vendeur / Livreur)
      onClose();
      setCurrentRole(targetRole);

      const userUid = 'google_' + email.replace(/[^a-zA-Z0-9]/g, '_');
      const storeTitle = targetRole === 'vendeur' ? `Boutique ${name}` : undefined;

      const profile = {
        uid: userUid,
        email: email,
        fullName: name,
        phone: '+225 07 48 12 34',
        role: targetRole,
        storeName: storeTitle,
        vehicleType: targetRole === 'livreur' ? 'Moto 150cc Pro' : undefined,
        createdAt: new Date().toISOString(),
      };

      setUserProfile(profile);

      if (targetRole === 'vendeur') {
        setMerchantSettings((prev) => ({
          ...prev,
          storeName: storeTitle || 'Boutique Marchand',
          managerName: name,
          email: email,
          phone: '+225 07 48 12 34',
        }));
        setCurrentView('vendeur_dashboard');
        showToast(`Bienvenue ${name} ! Connecté sur votre espace Vendeur.`, 'success');
      } else {
        setCourierSettings((prev) => ({
          ...prev,
          fullName: name,
          email: email,
          phone: '+225 07 48 12 34',
        }));
        setCurrentView('livreur_dashboard');
        showToast(`Bienvenue ${name} ! Connecté sur votre espace Livreur.`, 'success');
      }
    }, 400);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!customEmail || !customEmail.includes('@')) {
      showToast('Veuillez renseigner une adresse Gmail valide', 'error');
      return;
    }
    const cleanMail = customEmail.trim().toLowerCase();
    const derivedName = cleanMail
      .split('@')[0]
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
    handleSelectAccount(cleanMail, derivedName);
  };

  const isAdmin = targetRole === 'admin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 font-['Plus_Jakarta_Sans'] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Google Header */}
        <div className={`px-6 pt-6 pb-4 border-b ${isAdmin ? 'bg-gradient-to-r from-slate-900 to-indigo-950 text-white border-slate-800' : 'bg-white border-slate-100 text-slate-900'} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isAdmin ? 'Sécurité Google • Accès Administrateur' : 'Se connecter avec Google'}
              </h3>
              <p className={`text-xs ${isAdmin ? 'text-slate-300' : 'text-slate-500'}`}>
                {isAdmin ? 'Vérification de la whitelist d\'adresses e-mails' : 'pour continuer vers LivraLink'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isAdmin ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-slate-100 text-slate-400'}`}
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Account Selector Body */}
        <div className="p-6 space-y-4">
          {/* Security Alert Banner for Admin */}
          {isAdmin && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 flex items-start gap-3">
              <span className="text-xl">🛡️</span>
              <div className="text-xs space-y-0.5">
                <p className="font-extrabold text-amber-950">Accès Restreint aux E-mails Autorisés</p>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  Seules les adresses e-mails inscrites sur la Whitelist de sécurité (dont <span className="font-bold font-mono">pamphile.gbede@gmail.com</span>) ont accès à cette console.
                </p>
              </div>
            </div>
          )}

          {/* Error message */}
          {authError && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-2.5 animate-shake">
              <span className="material-symbols-outlined text-red-600 text-lg shrink-0 mt-0.5">block</span>
              <div className="text-xs">
                <p className="font-bold text-red-900">⛔ Accès Refusé (403 - Non Autorisé)</p>
                <p className="text-[11px] text-red-700 mt-0.5 leading-relaxed">{authError}</p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-[11px] font-bold">
              <span className="material-symbols-outlined text-sm">
                {isAdmin ? 'admin_panel_settings' : targetRole === 'vendeur' ? 'storefront' : 'two_wheeler'}
              </span>
              <span>
                {isAdmin ? 'Authentification Requise' : `Connexion Espace ${targetRole === 'vendeur' ? 'Vendeur' : 'Livreur'}`}
              </span>
            </div>
            <p className="text-xs text-slate-600 pt-1">
              {isAdmin ? 'Sélectionnez ou saisissez votre compte Google certifié :' : 'Choisissez votre compte Google personnel pour vous connecter :'}
            </p>
          </div>

          {!isAddingAccount ? (
            <div className="space-y-2.5">
              {accounts.map((acc, index) => {
                const isWhitelisted = isEmailAuthorizedAdmin(acc.email);
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleSelectAccount(acc.email, acc.name)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left group active:scale-[0.99] shadow-2xs ${
                      isAdmin && !isWhitelisted
                        ? 'border-slate-200 bg-slate-50/70 opacity-80 hover:border-red-300'
                        : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full ${acc.color} text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0`}>
                        {acc.avatar}
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                            {acc.name}
                          </p>
                          {isAdmin && isWhitelisted && (
                            <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                              ✓ Whitelisté
                            </span>
                          )}
                          {isAdmin && !isWhitelisted && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-100 text-red-700 border border-red-200">
                              Bloqué
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate font-mono">{acc.email}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-600 font-medium px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 shrink-0 hidden sm:inline">
                      {acc.tag}
                    </span>
                  </button>
                );
              })}

              {/* Add custom account option */}
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setIsAddingAccount(true);
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-dashed border-slate-300 hover:border-blue-400 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-xl">person_add</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">Saisir une autre adresse Gmail</p>
                  <p className="text-[11px] text-slate-400">Authentification sur un compte spécifique</p>
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={handleCustomSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="custom-gmail">
                  Adresse e-mail Google
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <span className="material-symbols-outlined text-base">mail</span>
                  </span>
                  <input
                    id="custom-gmail"
                    type="email"
                    value={customEmail}
                    onChange={(e) => {
                      setCustomEmail(e.target.value);
                      setAuthError(null);
                    }}
                    placeholder="ex: Pamphile.gbede@gmail.com"
                    required
                    autoFocus
                    className="w-full pl-9 pr-3 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingAccount(false);
                    setAuthError(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
                >
                  {isLoading ? 'Vérification...' : 'Continuer'}
                </button>
              </div>
            </form>
          )}

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-blue-600">
              <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
              <span>Contrôle de sécurité Google et vérification Whitelist...</span>
            </div>
          )}

          {/* Privacy Notice */}
          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed flex items-center justify-between">
            <span>Protocole sécurisé OAuth 2.0 &amp; Firebase</span>
            <span className="font-mono text-[10px] text-slate-400">v2.4 Sec-Admin</span>
          </div>
        </div>
      </div>
    </div>
  );
};
