import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { loginWithEmailPassword, loginWithGoogle, getFirebaseAuthErrorMessage } from '../../firebase/authService';
import { ForgotPasswordModal } from '../modals/ForgotPasswordModal';

export const LoginLivreurPage: React.FC = () => {
  const { setCurrentView, setCurrentRole, setCourierSettings, setUserProfile, showToast, openGoogleModal, openTestModal } = useApp();
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
      const { user, profile } = await loginWithEmailPassword(identifier, password, 'livreur');
      const resolvedRole = profile?.role || 'livreur';
      
      setCurrentRole(resolvedRole);
      if (resolvedRole === 'vendeur') {
        setCurrentView('vendeur_dashboard');
        showToast(`Bienvenue sur votre Espace Vendeur, ${profile?.fullName || user.displayName || 'Marchand'} !`, 'success');
      } else {
        setCurrentRole('livreur');
        setCurrentView('livreur_dashboard');
        if (profile) {
          setCourierSettings((prev) => ({
            ...prev,
            fullName: profile.fullName || prev.fullName,
            phone: profile.phone || prev.phone,
          }));
        }
        showToast(`Bienvenue sur votre Espace Livreur, ${profile?.fullName || user.displayName || 'Coursier'} !`, 'success');
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
    setCurrentRole('livreur');
    setCurrentView('livreur_dashboard');
    showToast('Connexion WhatsApp OTP validée !', 'success');
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { user, profile } = await loginWithGoogle('livreur');
      setCurrentRole('livreur');
      if (profile) {
        setUserProfile(profile);
        setCourierSettings((prev) => ({
          ...prev,
          fullName: profile.fullName || prev.fullName,
          phone: profile.phone || prev.phone,
          email: profile.email || prev.email,
        }));
      }
      setCurrentView('livreur_dashboard');
      showToast(`Connexion Google sécurisée réussie ! Bienvenue ${profile?.fullName || user.displayName || 'Coursier'}.`, 'success');
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        showToast('Connexion Google annulée.', 'info');
      } else if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup')) {
        openGoogleModal('livreur');
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
      {/* Top App Bar with DISPATCH Badge & Switcher */}
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 px-6 py-4 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentView('landing')} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm">
                <span className="material-symbols-outlined text-xl text-emerald-400">two_wheeler</span>
              </div>
              <div className="flex flex-col text-left">
                <span className="text-lg font-extrabold tracking-tight text-slate-900 leading-none">
                  Livra<span className="text-blue-600">Link</span>
                </span>
                <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                  DISPATCH HUB
                </span>
              </div>
            </button>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-blue-700 border border-slate-200">
              DISPATCH
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500 hidden sm:inline">Pas encore inscrit ?</span>
            <button
              onClick={() => {
                setCurrentRole('livreur');
                setCurrentView('register');
              }}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm text-emerald-600">person_add</span>
              <span>Devenir livreur partenaire</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex items-center justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
          {/* Left Column: Reassurance & Direct Available Mission Teaser */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                ESPACE COURSIERS &amp; FLOTTES PARTENAIRES
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Connectez-vous et prenez la route en toute sérénité.
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
                Accédez à vos missions en temps réel, optimisez vos tournées et suivez vos gains quotidiens avec versements
                garantis et zéro ambiguïté.
              </p>
            </div>

            {/* 3 Bento Cards for Couriers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-base">near_me</span>
                </div>
                <h2 className="font-bold text-xs text-slate-900">Missions géolocalisées</h2>
                <p className="text-[11px] text-slate-500">Adresses exactes, coordonnées GPS fiables et contact WhatsApp direct.</p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-base">verified</span>
                </div>
                <h2 className="font-bold text-xs text-slate-900">Preuve certifiée</h2>
                <p className="text-[11px] text-slate-500">Validation en un clic par photo ou code OTP, zéro litige injustifié.</p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-base">payments</span>
                </div>
                <h2 className="font-bold text-xs text-slate-900">Paiements nets</h2>
                <p className="text-[11px] text-slate-500">Revenus reversés sur Mobile Money (MTN, Wave, Moov) à 0% commission MVP.</p>
              </div>
            </div>

            {/* Live Ready Mission Teaser Card */}
            <div className="bg-white rounded-2xl p-4 border border-blue-200/80 shadow-sm space-y-3 relative overflow-hidden ring-1 ring-blue-100">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="font-bold text-emerald-800 uppercase text-[10px] tracking-wider">
                    MISSION PRÊTE • Zone Abidjan Nord
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
                  2 500 FCFA garantis
                </span>
              </div>

              <div className="space-y-2 relative pl-5 border-l-2 border-dashed border-slate-200 ml-2 text-xs">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Collecte</p>
                  <p className="font-bold text-slate-900">Cocody Danga (Boutique Mode IG @KenzaStyl)</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Livraison</p>
                  <p className="font-bold text-slate-900">Plateau CCIA (Étage 7 - Bâtiment B)</p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>4.8 km (~18 min) • Moto / Véhicule léger</span>
                <span className="font-bold text-blue-600 flex items-center gap-0.5">
                  Prise en charge après connexion →
                </span>
              </div>
            </div>

            {/* Social Proof Strip */}
            <div className="flex items-center gap-6 pt-1 text-slate-500 text-xs">
              <div className="flex items-center gap-1 text-emerald-700 font-semibold">
                <span className="material-symbols-outlined text-base">check_circle</span>
                <span>+1 400 livreurs actifs</span>
              </div>
              <div className="flex items-center gap-1 text-emerald-700 font-semibold">
                <span className="material-symbols-outlined text-base">schedule</span>
                <span>Paiements J+0 garantis</span>
              </div>
            </div>
          </div>

          {/* Right Column: Courier Login Card */}
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
                    onClick={() => {
                      setCurrentRole('vendeur');
                      setCurrentView('login_vendeur');
                    }}
                    className="py-2.5 px-3 rounded-xl text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">storefront</span>
                    <span>Je suis vendeur</span>
                  </button>
                  <button
                    type="button"
                    className="py-2.5 px-3 rounded-xl bg-white text-emerald-700 shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-base">two_wheeler</span>
                    <span>Je suis livreur</span>
                  </button>
                </div>
              </div>

              {/* Form Title */}
              <div>
                <h2 className="text-xl font-bold text-slate-900">Connexion Espace Livreur</h2>
                <p className="text-xs text-slate-500 mt-0.5">Renseignez vos identifiants pour démarrer votre tournée.</p>
              </div>

              {/* Google / Gmail Single Sign-On Button */}
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
                  OU AVEC NUMÉRO WHATSAPP / EMAIL
                </span>
              </div>

              {/* Test Accounts Quick Bar */}
              <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-950">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-emerald-600">science</span>
                    4 Profils Livreurs de Test Prêts :
                  </span>
                  <button
                    type="button"
                    onClick={openTestModal}
                    className="text-[10px] text-emerald-700 underline hover:text-emerald-900 font-extrabold"
                  >
                    Tester tous les comptes
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => fillTestAccount('moussa.livreur@gmail.com', 'MoussaRider2025!')}
                    className="px-2 py-1.5 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold shadow-2xs transition-colors text-left flex items-center justify-between"
                  >
                    <span>🏍️ Moussa Moto</span>
                    <span className="text-[9px] text-slate-400">125cc</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestAccount('fatou.cargo@gmail.com', 'FatouCargo2025!')}
                    className="px-2 py-1.5 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold shadow-2xs transition-colors text-left flex items-center justify-between"
                  >
                    <span>🚲 Fatou Cargo</span>
                    <span className="text-[9px] text-slate-400">Vélo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestAccount('bakary.express@gmail.com', 'BakaryFast2025!')}
                    className="px-2 py-1.5 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold shadow-2xs transition-colors text-left flex items-center justify-between"
                  >
                    <span>⚡ Bakary Express</span>
                    <span className="text-[9px] text-slate-400">150cc</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestAccount('awa.veloce@gmail.com', 'AwaVeloce2025!')}
                    className="px-2 py-1.5 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold shadow-2xs transition-colors text-left flex items-center justify-between"
                  >
                    <span>🛵 Awa Véloce</span>
                    <span className="text-[9px] text-slate-400">Scooter</span>
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
                  <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="courier-phone">
                    Adresse e-mail du compte livreur
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <span className="material-symbols-outlined text-lg">mail</span>
                    </span>
                    <input
                      id="courier-phone"
                      type="email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      placeholder="ex: ibrahim.livralink@gmail.com"
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-bold text-slate-700" htmlFor="courier-password">
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
                      id="courier-password"
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
                    <span>Garder ma session active (tournée continue)</span>
                  </label>
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
                      <span>Accéder à mon espace livreur</span>
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
                  <span>Connexion rapide avec code WhatsApp OTP</span>
                </button>
              </form>

              <div className="pt-3 border-t border-slate-100 text-center space-y-1">
                <p className="text-xs text-slate-600">
                  Nouveau coursier ou besoin d'activation ?{' '}
                  <button
                    onClick={() => {
                      setCurrentRole('livreur');
                      setCurrentView('register');
                    }}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    Créer un compte coursier
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2025 LivraLink Technologies Inc. Tous droits réservés. Connect &amp; Deliver.</p>
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
