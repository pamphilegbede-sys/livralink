import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { loginWithEmailPassword, loginWithGoogle, getFirebaseAuthErrorMessage } from '../../firebase/authService';
import { ForgotPasswordModal } from '../modals/ForgotPasswordModal';

export const LoginVendeurPage: React.FC = () => {
  const { setCurrentView, setCurrentRole, setMerchantSettings, setUserProfile, showToast, openGoogleModal, openTestModal } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  const fillTestAccount = (email: string, pass: string) => {
    setIdentifier(email);
    setPassword(pass);
    setErrorMessage(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const { user, profile } = await loginWithEmailPassword(identifier, password, 'vendeur');
      const resolvedRole = profile?.role || 'vendeur';

      setCurrentRole(resolvedRole);
      if (resolvedRole === 'livreur') {
        setCurrentView('livreur_dashboard');
        showToast(`Bienvenue sur votre Espace Livreur, ${profile?.fullName || user.displayName || 'Coursier'} !`, 'success');
      } else {
        setCurrentRole('vendeur');
        setCurrentView('vendeur_dashboard');
        if (profile) {
          setUserProfile(profile);
          setMerchantSettings((prev) => ({
            ...prev,
            managerName: profile.fullName || prev.managerName,
            storeName: profile.storeName || profile.fullName || prev.storeName,
            email: profile.email || prev.email,
            phone: profile.phone || prev.phone,
          }));
        }
        showToast(`Bienvenue sur votre Espace Vendeur, ${profile?.fullName || user.displayName || 'Marchand'} !`, 'success');
      }
    } catch (err: any) {
      const friendlyMsg = getFirebaseAuthErrorMessage(err);
      setErrorMessage(friendlyMsg);
      showToast(friendlyMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { user, profile } = await loginWithGoogle('vendeur');
      setCurrentRole('vendeur');
      if (profile) {
        setUserProfile(profile);
        setMerchantSettings((prev) => ({
          ...prev,
          managerName: profile.fullName || prev.managerName,
          storeName: profile.storeName || `Boutique ${profile.fullName}` || prev.storeName,
          email: profile.email || prev.email,
        }));
      }
      setCurrentView('vendeur_dashboard');
      showToast(`Connexion Google réussie ! Bienvenue ${profile?.fullName || user.displayName || 'Vendeur'}.`, 'success');
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        showToast('Connexion Google annulée.', 'info');
      } else {
        openGoogleModal('vendeur');
        if (err?.code === 'auth/unauthorized-domain') {
          showToast('Déploiement Render détecté : ouverture du sélecteur Google certifié Vendeur.', 'info');
        } else {
          showToast('Ouverture du sélecteur de compte Google Vendeur...', 'info');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-full flex-1 flex flex-col justify-between bg-slate-50 text-slate-800 antialiased font-['Plus_Jakarta_Sans']">
      {/* Top Bar - Mobile Optimized */}
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 px-3.5 sm:px-6 py-3 sm:py-4 shadow-2xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <button onClick={() => setCurrentView('landing')} className="flex items-center gap-2 group min-h-[44px]">
            <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-2xs">
              <span className="material-symbols-outlined text-xl text-blue-400">local_shipping</span>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 leading-none">
                Livra<span className="text-blue-600">Link</span>
              </span>
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                MARCHAND
              </span>
            </div>
          </button>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 hidden md:inline">Pas encore inscrit ?</span>
            <button
              onClick={() => {
                setCurrentRole('vendeur');
                setCurrentView('register');
              }}
              className="min-h-[40px] px-3 sm:px-3.5 py-1.5 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 active:scale-95 transition-all text-xs whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm sm:hidden">person_add</span>
              <span>Créer un compte</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-3.5 sm:px-6 py-4 sm:py-10 flex items-center justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start w-full">
          
          {/* Form Card (Order 1 on mobile: User sees login first) */}
          <div className="lg:col-span-6 xl:col-span-5 order-1 lg:order-2 w-full">
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-7 border border-slate-200/90 shadow-sm space-y-4 sm:space-y-5">
              
              {/* Role Toggle Selector */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Type de compte
                </label>
                <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-semibold gap-1">
                  <button
                    type="button"
                    className="min-h-[42px] py-2 px-2.5 rounded-lg bg-white text-blue-700 shadow-2xs font-bold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <span className="material-symbols-outlined text-base">storefront</span>
                    <span className="truncate">Vendeur</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentRole('livreur');
                      setCurrentView('login_livreur');
                    }}
                    className="min-h-[42px] py-2 px-2.5 rounded-lg text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1.5 transition-colors active:scale-95"
                  >
                    <span className="material-symbols-outlined text-base">two_wheeler</span>
                    <span className="truncate">Livreur</span>
                  </button>
                </div>
              </div>

              {/* Form Header */}
              <div>
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  Connexion Espace Vendeur
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilotez vos livraisons et suivez vos encaissements COD.
                </p>
              </div>

              {/* Google SSO Buttons */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
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
                  <span className="truncate">Continuer avec Google</span>
                </button>

                <button
                  type="button"
                  onClick={() => openGoogleModal('vendeur')}
                  className="w-full min-h-[40px] py-2 px-3 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200 text-blue-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-[0.99]"
                >
                  <span className="material-symbols-outlined text-sm">manage_accounts</span>
                  <span className="truncate">Sélectionner un compte Google vérifié</span>
                </button>
              </div>

              {/* Quiet Divider */}
              <div className="relative py-1 flex items-center justify-center">
                <div className="border-t border-slate-200 w-full"></div>
                <span className="bg-white px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider absolute">
                  ou avec votre e-mail
                </span>
              </div>

              {/* Test Accounts Quick Bar - Balanced 3-column grid on mobile */}
              <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-amber-600">science</span>
                    <span>Comptes Vendeurs de test :</span>
                  </span>
                  <button
                    type="button"
                    onClick={openTestModal}
                    className="text-[10px] text-amber-700 underline hover:text-amber-900 font-extrabold"
                  >
                    Voir tous
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => fillTestAccount('sarah.boutique@gmail.com', 'SarahPassword2025!')}
                    className="min-h-[36px] px-1.5 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold shadow-2xs transition-colors truncate text-center"
                    title="Sarah Chic Boutique"
                  >
                    1. Sarah
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestAccount('karim.tech@gmail.com', 'KarimPassword2025#')}
                    className="min-h-[36px] px-1.5 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold shadow-2xs transition-colors truncate text-center"
                    title="Karim Tech Store"
                  >
                    2. Karim
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestAccount('amadou.bio@gmail.com', 'AmadouBio2025!')}
                    className="min-h-[36px] px-1.5 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold shadow-2xs transition-colors truncate text-center"
                    title="Amadou Bio Marché"
                  >
                    3. Amadou
                  </button>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleLogin} className="space-y-3.5">
                {errorMessage && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2 animate-in fade-in">
                    <span className="material-symbols-outlined text-base text-red-500 shrink-0">error</span>
                    <span className="leading-snug">{errorMessage}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="identifier">
                    Adresse e-mail
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <span className="text-sm font-semibold">@</span>
                    </span>
                    <input
                      id="identifier"
                      type="email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      placeholder="sarah.glamchic@gmail.com"
                      className="w-full min-h-[44px] pl-8 pr-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-700" htmlFor="password">
                      Mot de passe
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsForgotModalOpen(true)}
                      className="text-xs font-semibold text-blue-600 hover:underline min-h-[32px] flex items-center"
                    >
                      Oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <span className="material-symbols-outlined text-base">lock</span>
                    </span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full min-h-[44px] pl-8 pr-10 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 min-w-[40px] justify-center"
                    >
                      <span className="material-symbols-outlined text-base">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 select-none min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Se souvenir de moi</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Session active</span>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full min-h-[48px] py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-sm active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Connexion en cours...</span>
                    </>
                  ) : (
                    <>
                      <span>Se connecter</span>
                      <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-600">
                  Nouveau sur LivraLink ?{' '}
                  <button
                    onClick={() => {
                      setCurrentRole('vendeur');
                      setCurrentView('register');
                    }}
                    className="font-bold text-blue-600 hover:underline min-h-[36px] inline-flex items-center"
                  >
                    Créer mon compte
                  </button>
                </p>
              </div>
            </div>
          </div>

          {/* Left Column: Reassurance, Features & Live Demo (Order 2 on mobile) */}
          <div className="lg:col-span-6 xl:col-span-7 order-2 lg:order-1 space-y-4 sm:space-y-6 w-full">
            <div className="space-y-2">
              <div className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">verified_user</span>
                <span>Espace Marchand Certifié</span>
              </div>
              <h2 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
                Expédiez en toute confiance, suivez vos colis en direct.
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Connectez vos ventes WhatsApp, Instagram, TikTok et boutiques physiques directement aux coursiers urbains qualifiés.
              </p>
            </div>

            {/* 3 Value Props */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">bolt</span>
                </div>
                <h3 className="font-bold text-xs text-slate-900">En 30 secondes</h3>
                <p className="text-[11px] text-slate-500 leading-tight">Créez une course et trouvez un coursier à proximité.</p>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">timeline</span>
                </div>
                <h3 className="font-bold text-xs text-slate-900">7 statuts certifiés</h3>
                <p className="text-[11px] text-slate-500 leading-tight">Suivi transparent du ramassage à la remise en main propre.</p>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs space-y-1">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">verified</span>
                </div>
                <h3 className="font-bold text-xs text-slate-900">Preuve POD 0 litige</h3>
                <p className="text-[11px] text-slate-500 leading-tight">Signature électronique, photo et code OTP sécurisé.</p>
              </div>
            </div>

            {/* Live Shipment Demo Widget */}
            <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <span className="p-1 rounded bg-blue-50 text-blue-700 shrink-0">
                    <span className="material-symbols-outlined text-sm">local_shipping</span>
                  </span>
                  <span className="font-bold text-slate-900 truncate">Course #LL-4190</span>
                  <span className="text-slate-400 hidden sm:inline">• Glam Chic</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                  En route
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span className="truncate">Destination : Cotonou Fidjrossè</span>
                  <span className="font-bold text-blue-700 shrink-0 ml-2">ETA 18 min</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500 h-full w-2/3"></div>
                  <div className="bg-blue-600 h-full w-1/6"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        defaultEmail={identifier}
      />
    </div>
  );
};
