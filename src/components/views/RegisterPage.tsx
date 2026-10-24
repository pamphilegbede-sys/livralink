import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { registerWithEmailPassword, loginWithGoogle, getFirebaseAuthErrorMessage } from '../../firebase/authService';
import { BENIN_DEPARTMENTS, getLocationForCommune } from '../../config/maps';
import { BackButton } from '../common/BackButton';
import { LivraLinkLogo } from '../common/LivraLinkLogo';

export const RegisterPage: React.FC = () => {
  const { setCurrentView, currentRole, setCurrentRole, setUserProfile, setMerchantSettings, setCourierSettings, showToast, openTestModal } = useApp();
  const [selectedRole, setSelectedRole] = useState<'vendeur' | 'livreur'>(currentRole === 'livreur' ? 'livreur' : 'vendeur');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeCommune, setStoreCommune] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fillTestRegister = (
    name: string,
    mail: string,
    pass: string,
    tel: string,
    role: 'vendeur' | 'livreur',
    commune?: string,
    address?: string
  ) => {
    setSelectedRole(role);
    setFullName(name);
    setEmail(mail);
    setPassword(pass);
    setConfirmPassword(pass);
    setPhone(tel);
    if (role === 'vendeur') {
      setStoreName(name);
      setStoreCommune(commune || 'Cotonou - Haie Vive');
      setStoreAddress(address || 'Avenue Jean-Paul II, Cotonou');
    }
    setErrorMessage(null);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!acceptTerms) {
      setErrorMessage('Veuillez accepter les CGU et la politique de confidentialité pour continuer.');
      showToast('Veuillez accepter les CGU pour continuer.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Les deux mots de passe ne correspondent pas.');
      showToast('Les mots de passe ne correspondent pas.', 'error');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Le mot de passe doit contenir au moins 6 caractères.');
      showToast('Mot de passe trop court (min 6 caractères).', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const coords = storeCommune ? getLocationForCommune(storeCommune) : undefined;
      const { user, profile } = await registerWithEmailPassword(
        email,
        password,
        selectedRole,
        fullName,
        phone,
        selectedRole === 'vendeur'
          ? {
              storeName: storeName.trim() || fullName.trim(),
              storeCommune: storeCommune.trim(),
              storeAddress: storeAddress.trim(),
              storeCoordinates: coords ? [coords.lat, coords.lng] : undefined,
            }
          : undefined
      );

      setCurrentRole(selectedRole);

      if (selectedRole === 'vendeur') {
        setUserProfile(profile);
        setMerchantSettings((prev) => ({
          ...prev,
          storeName: storeName.trim() || fullName.trim(),
          managerName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          storeCommune: storeCommune.trim(),
          defaultPickupAddress: storeAddress.trim() || (storeCommune ? `Boutique, ${storeCommune}` : prev.defaultPickupAddress),
          gpsCoordinates: coords ? `${coords.lat.toFixed(4)}° N, ${coords.lng.toFixed(4)}° E` : prev.gpsCoordinates,
          storeCoordinates: coords ? [coords.lat, coords.lng] : undefined,
        }));
        setCurrentView('vendeur_dashboard');
        showToast(`Compte Vendeur créé avec succès ! Bienvenue ${profile.fullName}.`, 'success');
      } else {
        setUserProfile(profile);
        setCourierSettings((prev) => ({
          ...prev,
          fullName: profile.fullName || prev.fullName,
          phone: phone.trim() || prev.phone,
          email: email.trim() || prev.email,
        }));
        setCurrentView('livreur_dashboard');
        showToast(`Compte Livreur créé avec succès ! Bienvenue ${profile.fullName}.`, 'success');
      }
    } catch (err: any) {
      const friendlyMsg = getFirebaseAuthErrorMessage(err);
      setErrorMessage(friendlyMsg);
      showToast(friendlyMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { user, profile } = await loginWithGoogle(selectedRole);
      setCurrentRole(selectedRole);
      if (profile) {
        setUserProfile(profile);
        if (selectedRole === 'vendeur') {
          setMerchantSettings((prev) => ({
            ...prev,
            managerName: profile.fullName || prev.managerName,
            storeName: profile.storeName || `Boutique ${profile.fullName}` || prev.storeName,
            email: profile.email || prev.email,
          }));
        } else {
          setCourierSettings((prev) => ({
            ...prev,
            fullName: profile.fullName || prev.fullName,
            phone: profile.phone || prev.phone,
            email: profile.email || prev.email,
          }));
        }
      }
      setCurrentView(selectedRole === 'vendeur' ? 'vendeur_dashboard' : 'livreur_dashboard');
      showToast(`Inscription Google réussie ! Bienvenue ${profile?.fullName || user.displayName || 'Utilisateur'}.`, 'success');
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        showToast('Inscription Google annulée.', 'info');
      } else {
        const errorMsg = getFirebaseAuthErrorMessage(err);
        setErrorMessage(errorMsg);
        showToast(errorMsg, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-full flex-1 flex flex-col justify-between bg-slate-50 text-slate-800 antialiased font-['Plus_Jakarta_Sans']">
      {/* Top Header - Mobile Optimized */}
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 px-3.5 sm:px-6 py-3 sm:py-4 shadow-2xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <BackButton />
            <button
              type="button"
              onClick={() => setCurrentView('landing')}
              className="flex items-center group min-h-[44px] transition-transform active:scale-95"
              title="Retour à l'accueil LivraLink"
            >
              <LivraLinkLogo size="md" subtitle="INSCRIPTION" />
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 hidden md:inline">Déjà inscrit ?</span>
            <button
              onClick={() => {
                if (selectedRole === 'vendeur') {
                  setCurrentRole('vendeur');
                  setCurrentView('login_vendeur');
                } else {
                  setCurrentRole('livreur');
                  setCurrentView('login_livreur');
                }
              }}
              className="min-h-[40px] px-3 sm:px-3.5 py-1.5 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all text-xs whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">login</span>
              <span>Connexion</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-3.5 sm:px-6 py-4 sm:py-10 flex items-center justify-center">
        <div className="max-w-xl w-full mx-auto">
          
          {/* Registration Form Card */}
          <div className="w-full">
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-7 border border-slate-200/90 shadow-sm space-y-4 sm:space-y-5">
              
              {/* Back Shortcut & Card Category */}
              <div className="flex items-center justify-between pb-1">
                <BackButton variant="subtle" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Nouveau Compte
                </span>
              </div>

              <div>
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  Créer votre compte LivraLink
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rejoignez la plateforme logistique et démarrez en 2 minutes.
                </p>
              </div>

              {/* Role Selection Dual Cards - Balanced & Symmetrical */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Choisissez votre activité
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole('vendeur');
                      if (!fullName) setFullName('Sarah Kouamé');
                    }}
                    className={`min-h-[80px] p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      selectedRole === 'vendeur'
                        ? 'border-2 border-blue-600 bg-blue-50/50 shadow-2xs ring-2 ring-blue-600/10'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xl">🛍️</span>
                      {selectedRole === 'vendeur' ? (
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                          <span className="material-symbols-outlined text-xs font-bold">check</span>
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-slate-300"></span>
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 block truncate">Je suis vendeur</span>
                      <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                        Boutiques &amp; Réseaux
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole('livreur');
                      if (!fullName) setFullName('Ibrahim Touré');
                    }}
                    className={`min-h-[80px] p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      selectedRole === 'livreur'
                        ? 'border-2 border-emerald-600 bg-emerald-50/50 shadow-2xs ring-2 ring-emerald-600/10'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xl">🛵</span>
                      {selectedRole === 'livreur' ? (
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                          <span className="material-symbols-outlined text-xs font-bold">check</span>
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-slate-300"></span>
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-900 block truncate">Je suis livreur</span>
                      <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                        Courses &amp; Flotte
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Google SSO Button */}
              <button
                type="button"
                disabled={isLoading}
                onClick={handleGoogleRegister}
                className="w-full min-h-[44px] py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl text-xs font-bold text-slate-800 shadow-2xs transition-all active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                <span className="truncate">S'inscrire en 1 clic avec Google</span>
              </button>

              {/* Quiet Divider */}
              <div className="relative py-1 flex items-center justify-center">
                <div className="border-t border-slate-200 w-full"></div>
                <span className="bg-white px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider absolute">
                  ou formulaire d'inscription
                </span>
              </div>


              {/* Form Body */}
              <form onSubmit={handleRegister} className="space-y-3.5">
                {errorMessage && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2 animate-in fade-in">
                    <span className="material-symbols-outlined text-base text-red-500 shrink-0">error</span>
                    <span className="leading-snug">{errorMessage}</span>
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="fullname">
                    {selectedRole === 'vendeur' ? 'Nom du propriétaire ou gérant *' : 'Nom complet *'}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <span className="material-symbols-outlined text-base">person</span>
                    </span>
                    <input
                      id="fullname"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      placeholder={selectedRole === 'vendeur' ? 'Sarah Kouamé' : 'Ibrahim Touré'}
                      className="w-full min-h-[44px] pl-8 pr-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                  </div>
                </div>

                {/* Vendor Store Location Block */}
                {selectedRole === 'vendeur' && (
                  <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-blue-600">storefront</span>
                        <span>Emplacement de la Boutique</span>
                      </span>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        77 Communes
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Nom de la boutique *
                      </label>
                      <input
                        type="text"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        placeholder="ex: Glam Chic Cotonou"
                        className="w-full min-h-[40px] px-3 py-2 text-xs bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Commune *
                        </label>
                        <select
                          value={storeCommune}
                          onChange={(e) => setStoreCommune(e.target.value)}
                          className="w-full min-h-[40px] px-2.5 py-2 text-xs bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-medium"
                        >
                          <option value="">-- Choisir la commune --</option>
                          {BENIN_DEPARTMENTS.map((dept) => (
                            <optgroup key={dept.code} label={`📍 ${dept.name}`}>
                              {dept.communes.map((commune) => (
                                <option key={commune} value={commune}>
                                  {commune}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Adresse / Quartier *
                        </label>
                        <input
                          type="text"
                          value={storeAddress}
                          onChange={(e) => setStoreAddress(e.target.value)}
                          placeholder="Haie Vive, Rue 320"
                          className="w-full min-h-[40px] px-3 py-2 text-xs bg-white text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Phone */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-700" htmlFor="reg-phone">
                      Téléphone WhatsApp *
                    </label>
                    <span className="text-[10px] text-emerald-600 font-bold">
                      Alerte instantanée
                    </span>
                  </div>
                  <div className="flex rounded-xl overflow-hidden border border-slate-300 bg-white min-h-[44px]">
                    <div className="px-3 bg-slate-50 border-r border-slate-300 flex items-center gap-1 text-xs font-bold text-slate-700 select-none">
                      <span>🇧🇯</span>
                      <span>+229</span>
                    </div>
                    <input
                      id="reg-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      placeholder="97 00 00 00"
                      className="w-full px-3 py-2 text-xs text-slate-900 outline-none"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="reg-email">
                    Adresse e-mail *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <span className="text-sm font-semibold">@</span>
                    </span>
                    <input
                      id="reg-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="votre-compte@gmail.com"
                      className="w-full min-h-[44px] pl-8 pr-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                  </div>
                </div>

                {/* Passwords */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="reg-pwd">
                      Mot de passe *
                    </label>
                    <input
                      id="reg-pwd"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="Min. 6 caractères"
                      className="w-full min-h-[44px] px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="reg-cpwd">
                      Confirmer mot de passe *
                    </label>
                    <input
                      id="reg-cpwd"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="Répétez le mot de passe"
                      className="w-full min-h-[44px] px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                  </div>
                </div>

                {/* Terms checkbox */}
                <div className="pt-0.5">
                  <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="leading-tight">
                      J'accepte les conditions d'utilisation et la politique de confidentialité.
                    </span>
                  </label>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full min-h-[48px] py-3 px-4 text-white rounded-xl font-bold text-xs sm:text-sm shadow-sm active:scale-[0.99] transition-all flex items-center justify-center gap-2 ${
                    selectedRole === 'vendeur'
                      ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Création en cours...</span>
                    </>
                  ) : (
                    <>
                      <span>{selectedRole === 'vendeur' ? 'Créer mon compte Vendeur' : 'Devenir Livreur Partenaire'}</span>
                      <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 text-center text-xs text-slate-500">
                <span>Déjà membre ? </span>
                <button
                  onClick={() => {
                    if (selectedRole === 'vendeur') {
                      setCurrentRole('vendeur');
                      setCurrentView('login_vendeur');
                    } else {
                      setCurrentRole('livreur');
                      setCurrentView('login_livreur');
                    }
                  }}
                  className="text-blue-600 font-bold hover:underline min-h-[36px] inline-flex items-center"
                >
                  Se connecter à mon espace
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200/80 py-4 px-4 text-center text-xs text-slate-500">
        <p>© {new Date().getFullYear()} LivraLink CI/BJ — Tous droits réservés.</p>
      </footer>
    </div>
  );
};
