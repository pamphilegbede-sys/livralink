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

  const handleWhatsAppOTP = () => {
    setCurrentRole('vendeur');
    setCurrentView('vendeur_dashboard');
    showToast('Connexion rapide WhatsApp OTP réussie !', 'success');
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
      showToast(`Connexion Google sécurisée réussie ! Bienvenue ${profile?.fullName || user.displayName || 'Vendeur'}.`, 'success');
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        showToast('Connexion Google annulée.', 'info');
      } else if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup')) {
        openGoogleModal('vendeur');
      } else {
        const friendlyMsg = getFirebaseAuthErrorMessage(err);
        setErrorMessage(friendlyMsg);
        showToast(friendlyMsg, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 text-slate-800 antialiased bg-telemetry-grid font-['Plus_Jakarta_Sans']">
      {/* Top Bar */}
      <header className="w-full bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 px-6 py-4 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => setCurrentView('landing')} className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm">
              <span className="material-symbols-outlined text-xl text-blue-400">local_shipping</span>
            </div>
            <div className="flex flex-col text-left">
              <span className="text-lg font-extrabold tracking-tight text-slate-900 leading-none">
                Livra<span className="text-blue-600">Link</span>
              </span>
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                CONNECT &amp; DELIVER
              </span>
            </div>
          </button>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500 hidden sm:inline">Pas encore inscrit ?</span>
            <button
              onClick={() => {
                setCurrentRole('vendeur');
                setCurrentView('register');
              }}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Créer un compte Vendeur
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex items-center justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center w-full">
          {/* Left Column: Reassurance, Features & Live Delivery Demo */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                ESPACE VENDEUR SÉCURISÉ
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Gérez vos expéditions et suivez vos livraisons en temps réel.
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
                LivraLink synchronise automatiquement vos commandes issues de{' '}
                <strong>WhatsApp Business, Instagram DM, TikTok Shop</strong> et sites e-commerce avec notre flotte de
                coursiers urbains certifiés.
              </p>
            </div>

            {/* 3 Value Props Bento */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-base">bolt</span>
                </div>
                <h2 className="font-bold text-xs text-slate-900">Pilotage en 1 clic</h2>
                <p className="text-[11px] text-slate-500">Créez une course en 30 sec et assignez le coursier le plus proche.</p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-base">timeline</span>
                </div>
                <h2 className="font-bold text-xs text-slate-900">7 statuts audités</h2>
                <p className="text-[11px] text-slate-500">Traçabilité transparente du ramassage au dépôt client final.</p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-base">verified</span>
                </div>
                <h2 className="font-bold text-xs text-slate-900">Preuve POD certifiée</h2>
                <p className="text-[11px] text-slate-500">Signature électronique horodatée et photo pour 0 litige.</p>
              </div>
            </div>

            {/* Live Shipment Demo Widget */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded bg-blue-50 text-blue-700">
                    <span className="material-symbols-outlined text-sm">local_shipping</span>
                  </span>
                  <span className="font-bold text-slate-900">Expédition #LL-4190</span>
                  <span className="text-slate-400">• Boutique Glam Chic</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  En cours vers Cocody
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Ramassage : Plateau (14h15)</span>
                  <span className="font-bold text-blue-700">ETA 18 min</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500 h-full w-2/3"></div>
                  <div className="bg-blue-600 h-full w-1/6"></div>
                </div>
                <div className="flex justify-between items-center text-[11px] pt-1 text-slate-500">
                  <span>Coursier : Ibrahim K. (Note 4.9★)</span>
                  <span className="text-emerald-700 font-semibold">Paiement à la livraison sécurisé</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Merchant Login Form Card */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl space-y-5">
              {/* Role Toggle Selector */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Choisir votre profil
                </label>
                <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl text-xs font-bold">
                  <button
                    type="button"
                    className="py-2.5 px-3 rounded-xl bg-white text-blue-700 shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-base">storefront</span>
                    <span>Je suis vendeur</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentRole('livreur');
                      setCurrentView('login_livreur');
                    }}
                    className="py-2.5 px-3 rounded-xl text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">two_wheeler</span>
                    <span>Je suis livreur</span>
                  </button>
                </div>
              </div>

              {/* Form Header */}
              <div>
                <h2 className="text-xl font-bold text-slate-900">Connexion Espace Vendeur</h2>
                <p className="text-xs text-slate-500 mt-0.5">Accédez à votre tableau de bord et expédiez vos colis.</p>
              </div>

              {/* Google / Gmail Instant Login Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl text-xs font-bold text-slate-800 shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                <span>Se connecter avec Google (Gmail)</span>
              </button>

              <div className="relative py-0.5 flex items-center justify-center">
                <div className="border-t border-slate-200 w-full"></div>
                <span className="bg-white px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest absolute">
                  OU AVEC EMAIL / WHATSAPP
                </span>
              </div>

              {/* Test Accounts Quick Bar */}
              <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-amber-600">science</span>
                    Comptes Vendeurs de Test :
                  </span>
                  <button
                    type="button"
                    onClick={openTestModal}
                    className="text-[10px] text-amber-700 underline hover:text-amber-900 font-extrabold"
                  >
                    Voir les 5 tests
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => fillTestAccount('sarah.boutique@gmail.com', 'SarahPassword2025!')}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold shadow-2xs transition-colors"
                  >
                    1. Sarah Chic
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestAccount('karim.tech@gmail.com', 'KarimPassword2025#')}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold shadow-2xs transition-colors"
                  >
                    2. Karim Tech
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestAccount('amadou.bio@gmail.com', 'AmadouBio2025!')}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold shadow-2xs transition-colors"
                  >
                    3. Amadou Bio
                  </button>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                {errorMessage && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2 animate-in fade-in">
                    <span className="material-symbols-outlined text-base text-red-500">error</span>
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="identifier">
                    Adresse e-mail du compte
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <span className="text-base font-semibold">@</span>
                    </span>
                    <input
                      id="identifier"
                      type="email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      placeholder="ex: sarah.glamchic@gmail.com"
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-bold text-slate-700" htmlFor="password">
                      Mot de passe
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsForgotModalOpen(true)}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <span className="material-symbols-outlined text-lg">lock</span>
                    </span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-9 pr-10 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    >
                      <span className="material-symbols-outlined text-lg">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Se souvenir de moi</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Session 30 jours</span>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-600/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Connexion Firebase en cours...</span>
                    </>
                  ) : (
                    <>
                      <span>Se connecter à mon espace Vendeur</span>
                      <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleWhatsAppOTP}
                  className="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-base text-emerald-600">chat</span>
                  <span>Connexion rapide avec WhatsApp OTP</span>
                </button>
              </form>

              <div className="pt-3 border-t border-slate-100 text-center space-y-1">
                <p className="text-xs text-slate-600">
                  Pas encore de compte vendeur ?{' '}
                  <button
                    onClick={() => {
                      setCurrentRole('vendeur');
                      setCurrentView('register');
                    }}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    Créer mon compte en 2 min
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2025 LivraLink Technologies Inc. Tous droits réservés. Données sécurisées et cryptées bout-en-bout.</p>
      </footer>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        defaultEmail={identifier}
      />
    </div>
  );
};
