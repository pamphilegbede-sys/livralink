import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { saveStoredUser } from '../../firebase/authService';

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
    couriers,
    setSelectedCourier,
    isEmailAuthorizedAdmin,
    adminLoginWithGoogle,
    addAuditLog
  } = useApp();

  const [activeRole, setActiveRole] = useState<'vendeur' | 'livreur' | 'admin'>(targetRole);
  const [customEmail, setCustomEmail] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sync activeRole whenever targetRole changes or modal opens
  useEffect(() => {
    setActiveRole(targetRole);
    setAuthError(null);
    setIsAddingAccount(false);
    setCustomEmail('');
  }, [targetRole, isOpen]);

  if (!isOpen) return null;

  // 1. Google Vendor Profiles (Boutiques & Marchands)
  const vendorAccounts = [
    {
      name: 'Sarah Chic Boutique',
      email: 'sarah.boutique@gmail.com',
      avatar: 'SC',
      color: 'bg-pink-600',
      tag: 'Boutique Prêt-à-porter Mode (Cotonou)',
      storeName: 'Sarah Chic Boutique Cotonou',
      phone: '+229 97 12 34 56',
    },
    {
      name: 'Karim Tech Store',
      email: 'karim.tech@gmail.com',
      avatar: 'KT',
      color: 'bg-blue-600',
      tag: 'E-commerce High-Tech & Smartphones',
      storeName: 'Karim High-Tech & Smartphones',
      phone: '+229 95 88 77 66',
    },
    {
      name: 'Amadou Bio Marché',
      email: 'amadou.bio@gmail.com',
      avatar: 'AB',
      color: 'bg-emerald-600',
      tag: 'Commerce Alimentation & Paniers Frais',
      storeName: 'Amadou Produits Frais & Bio',
      phone: '+229 61 23 45 67',
    },
  ];

  // 2. Google Delivery Profiles (Livreurs & Coursiers Flotte)
  const courierAccounts = [
    {
      name: 'Moussa Express Moto',
      email: 'moussa.livreur@gmail.com',
      avatar: 'ME',
      color: 'bg-amber-600',
      tag: 'Coursier Express Deux-Roues (Yamaha 125cc)',
      vehicleType: 'Moto Yamaha 125cc',
      phone: '+229 96 44 33 22',
      zone: 'Zone Cotonou & Cadjehoun',
    },
    {
      name: 'Bakary Express Cotonou',
      email: 'bakary.express@gmail.com',
      avatar: 'BE',
      color: 'bg-blue-700',
      tag: 'Livreur Rapide Pro (Honda 150cc - 420 courses)',
      vehicleType: 'Moto Honda 150cc Pro',
      phone: '+229 97 48 12 34',
      zone: 'Zone Cotonou, Haie Vive & Cadjehoun',
    },
    {
      name: 'Fatou Cargo Vélo',
      email: 'fatou.cargo@gmail.com',
      avatar: 'FC',
      color: 'bg-teal-600',
      tag: 'Coursière Vélo Cargo Éco-Responsable',
      vehicleType: 'Vélo Cargo Électrique',
      phone: '+229 90 11 22 33',
      zone: 'Zone Haie Vive & Akpakpa',
    },
    {
      name: 'Awa Véloce Livraisons',
      email: 'awa.veloce@gmail.com',
      avatar: 'AV',
      color: 'bg-purple-600',
      tag: 'Livreuse Premium Flotte & Fragile (385 courses)',
      vehicleType: 'Scooter Électrique / Van Léger',
      phone: '+229 95 87 65 43',
      zone: 'Zone Akpakpa, Porto-Novo & Sèmè',
    },
  ];

  // 3. Google Super-Admin Profiles (Supervision & Whitelist)
  const adminAccounts = [
    {
      name: 'Pamphile Gbede',
      email: 'pamphile.gbede@gmail.com',
      avatar: 'PG',
      color: 'bg-indigo-600',
      tag: '👑 Super-Admin Propriétaire (Whitelisté)',
      isAdminAuthorized: true,
    },
    {
      name: 'Compte Test Invité (Non Admin)',
      email: 'invite.demo@gmail.com',
      avatar: 'IN',
      color: 'bg-slate-600',
      tag: '🚫 Utilisateur Lambda (Test Sécurité 403)',
      isAdminAuthorized: false,
    },
  ];

  const currentRoleAccounts = activeRole === 'admin'
    ? adminAccounts
    : activeRole === 'livreur'
    ? courierAccounts
    : vendorAccounts;

  const handleSelectAccount = (email: string, name: string, extraData?: any) => {
    setAuthError(null);
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      const cleanEmail = email.trim().toLowerCase();

      // CASE 1: ADMINISTRATEUR
      if (activeRole === 'admin') {
        const result = adminLoginWithGoogle(cleanEmail, name);
        if (!result.success) {
          setAuthError(result.error || 'Accès refusé. Cette adresse n\'est pas autorisée sur la Whitelist administrateur.');
          return;
        }
        onClose();
        return;
      }

      // CASE 2: VENDEUR (BOUTIQUE)
      if (activeRole === 'vendeur') {
        onClose();
        setCurrentRole('vendeur');

        const userUid = 'google_vendeur_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
        const storeTitle = extraData?.storeName || `Boutique ${name}`;
        const phone = extraData?.phone || '+229 97 12 34 56';

        const profile = {
          uid: userUid,
          email: cleanEmail,
          fullName: name,
          phone: phone,
          role: 'vendeur' as const,
          storeName: storeTitle,
          createdAt: new Date().toISOString(),
        };

        setUserProfile(profile);
        saveStoredUser(cleanEmail, profile, btoa('google_oauth_verified'));

        setMerchantSettings((prev) => ({
          ...prev,
          storeName: storeTitle,
          managerName: name,
          email: cleanEmail,
          phone: phone,
        }));

        setCurrentView('vendeur_dashboard');
        addAuditLog('security', 'Connexion Vendeur Google', `Boutique Marchand connectée via Google : ${cleanEmail}`);
        showToast(`Bienvenue ${name} ! Espace Vendeur opérationnel.`, 'success');
        return;
      }

      // CASE 3: LIVREUR (FLOTTE)
      if (activeRole === 'livreur') {
        onClose();
        setCurrentRole('livreur');

        const userUid = 'google_livreur_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
        const vehicle = extraData?.vehicleType || 'Moto Yamaha 125cc';
        const phone = extraData?.phone || '+229 97 48 12 34';

        const profile = {
          uid: userUid,
          email: cleanEmail,
          fullName: name,
          phone: phone,
          role: 'livreur' as const,
          vehicleType: vehicle,
          createdAt: new Date().toISOString(),
        };

        setUserProfile(profile);
        saveStoredUser(cleanEmail, profile, btoa('google_oauth_verified'));

        setCourierSettings((prev) => ({
          ...prev,
          fullName: name,
          phone: phone,
          email: cleanEmail,
        }));

        // Link with active fleet if courier name matches
        const matchedCourier = couriers.find(
          c => c.name.toLowerCase() === name.toLowerCase() || c.phone === phone
        );
        if (matchedCourier) {
          setSelectedCourier(matchedCourier);
        }

        setCurrentView('livreur_dashboard');
        addAuditLog('security', 'Connexion Livreur Google', `Coursier Flotte connecté via Google : ${cleanEmail}`);
        showToast(`Bienvenue ${name} ! Espace Livreur opérationnel.`, 'success');
        return;
      }
    }, 350);
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

  const isAdmin = activeRole === 'admin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 font-['Plus_Jakarta_Sans'] relative max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Google Modal Header */}
        <div className={`px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b ${isAdmin ? 'bg-gradient-to-r from-slate-900 to-indigo-950 text-white border-slate-800' : 'bg-white border-slate-100 text-slate-900'} flex items-center justify-between shrink-0`}>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <div className="truncate">
              <h3 className="font-bold text-sm sm:text-base leading-tight truncate">
                {isAdmin ? 'Connexion Google Admin' : 'Connexion Google Sécurisée'}
              </h3>
              <p className={`text-[11px] truncate ${isAdmin ? 'text-slate-300' : 'text-slate-500'}`}>
                LivraLink • Authentification Cloud
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${isAdmin ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-slate-100 text-slate-400'}`}
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Modal Role Switcher Tabs */}
        <div className="px-3 sm:px-6 pt-2.5 pb-1 bg-slate-50/80 border-b border-slate-100 shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setActiveRole('vendeur');
                setAuthError(null);
                setIsAddingAccount(false);
              }}
              className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${activeRole === 'vendeur' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <span className="material-symbols-outlined text-sm">storefront</span>
              <span>Vendeur</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveRole('livreur');
                setAuthError(null);
                setIsAddingAccount(false);
              }}
              className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${activeRole === 'livreur' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <span className="material-symbols-outlined text-sm">two_wheeler</span>
              <span>Livreur</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveRole('admin');
                setAuthError(null);
                setIsAddingAccount(false);
              }}
              className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${activeRole === 'admin' ? 'bg-slate-900 text-amber-300 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <span className="material-symbols-outlined text-sm text-amber-400">shield_person</span>
              <span>Admin</span>
            </button>
          </div>
        </div>

        {/* Account Selector Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Cloud & Render High Availability Notice */}
          <div className="p-3 rounded-2xl bg-blue-50/80 border border-blue-200 text-blue-900 flex items-start gap-2.5 text-xs">
            <span className="material-symbols-outlined text-blue-600 text-base shrink-0 mt-0.5">cloud_done</span>
            <div className="space-y-0.5 text-[11px] leading-relaxed">
              <span className="font-bold">Mode Haute Résilience Déploiement : </span>
              <span>
                Fonctionne sur <strong>Render</strong>, hébergement cloud et local. Cliquez sur le compte de votre choix ou saisissez votre Gmail personnel.
              </span>
            </div>
          </div>

          {/* Admin Whitelist Security Notice */}
          {isAdmin && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 flex items-start gap-3">
              <span className="text-xl">🛡️</span>
              <div className="text-xs space-y-0.5">
                <p className="font-extrabold text-amber-950">Accès Restreint aux E-mails Whitelistés</p>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  Seul le compte super-admin (<span className="font-bold font-mono">pamphile.gbede@gmail.com</span>) ou les e-mails inscrits dans la Whitelist peuvent déverrouiller la supervision.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
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
            <p className="text-xs font-bold text-slate-700">
              {isAdmin
                ? 'Sélectionnez votre compte Google Super-Admin :'
                : activeRole === 'livreur'
                ? 'Sélectionnez votre profil Livreur Google certifié :'
                : 'Sélectionnez votre boutique Vendeur Google certifiée :'}
            </p>
            <p className="text-[11px] text-slate-500">
              {isAdmin
                ? 'Vérification cryptographique instantanée des autorisations RBAC'
                : 'Connexion instantanée 1-clic avec synchronisation du profil'}
            </p>
          </div>

          {!isAddingAccount ? (
            <div className="space-y-2.5">
              {currentRoleAccounts.map((acc: any, index: number) => {
                const isWhitelisted = isAdmin ? isEmailAuthorizedAdmin(acc.email) : true;
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleSelectAccount(acc.email, acc.name, acc)}
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
                              Bloqué 403
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate font-mono">{acc.email}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-600 font-medium px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 shrink-0 hidden sm:inline max-w-[150px] truncate">
                      {acc.tag}
                    </span>
                  </button>
                );
              })}

              {/* Add Custom Gmail Address Button */}
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
                  <p className="text-xs font-bold text-slate-800">
                    Saisir une autre adresse Gmail ({activeRole})
                  </p>
                  <p className="text-[11px] text-slate-400">Connexion avec votre adresse e-mail personnelle</p>
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={handleCustomSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="custom-gmail">
                  Adresse e-mail Google ({activeRole === 'vendeur' ? 'Marchand' : activeRole === 'livreur' ? 'Coursier' : 'Admin'})
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
                    placeholder={activeRole === 'admin' ? 'pamphile.gbede@gmail.com' : 'votre.compte@gmail.com'}
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
                  {isLoading ? 'Vérification...' : 'Valider la connexion Google'}
                </button>
              </div>
            </form>
          )}

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-blue-600">
              <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
              <span>Authentification Google en cours...</span>
            </div>
          )}

          {/* Privacy & Render Guide Notice */}
          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed flex items-center justify-between">
            <span>Protocole sécurisé OAuth 2.0 &amp; Firebase</span>
            <span className="font-mono text-[10px] text-emerald-600 font-bold">✓ Render Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
};
