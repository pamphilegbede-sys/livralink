import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { loginWithEmailPassword, loginWithGoogle, getFirebaseAuthErrorMessage } from '../../firebase/authService';
import { ForgotPasswordModal } from '../modals/ForgotPasswordModal';
import { BackButton } from '../common/BackButton';
import { LivraLinkLogo } from '../common/LivraLinkLogo';

export const LoginVendeurPage: React.FC = () => {
  const { setCurrentView, setCurrentRole, setMerchantSettings, setUserProfile, showToast, openTestModal } = useApp();
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
      {/* Top Bar - Mobile Optimized */}
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
              <LivraLinkLogo size="md" subtitle="ESPACE VENDEUR" />
            </button>
          </div>

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
        <div className="max-w-md w-full mx-auto">
          {/* Form Card */}
          <div className="w-full">
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-7 border border-slate-200/90 shadow-sm space-y-4 sm:space-y-5">
              
              {/* Back Shortcut & Card Category */}
              <div className="flex items-center justify-between pb-1">
                <BackButton variant="subtle" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Espace Vendeur
                </span>
              </div>

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
                  disabled={isLoading}
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
              </div>

              {/* Quiet Divider */}
              <div className="relative py-1 flex items-center justify-center">
                <div className="border-t border-slate-200 w-full"></div>
                <span className="bg-white px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider absolute">
                  ou avec votre e-mail
                </span>
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
