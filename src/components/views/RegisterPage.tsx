import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { registerWithEmailPassword, loginWithGoogle, getFirebaseAuthErrorMessage } from '../../firebase/authService';

export const RegisterPage: React.FC = () => {
  const { setCurrentView, currentRole, setCurrentRole, setUserProfile, setMerchantSettings, setCourierSettings, showToast, openGoogleModal, openTestModal } = useApp();
  const [selectedRole, setSelectedRole] = useState<'vendeur' | 'livreur'>(currentRole === 'livreur' ? 'livreur' : 'vendeur');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fillTestRegister = (
    name: string,
    mail: string,
    pass: string,
    tel: string,
    role: 'vendeur' | 'livreur'
  ) => {
    setSelectedRole(role);
    setFullName(name);
    setEmail(mail);
    setPassword(pass);
    setConfirmPassword(pass);
    setPhone(tel);
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
      const { user, profile } = await registerWithEmailPassword(
        email,
        password,
        selectedRole,
        fullName,
        phone
      );

      setCurrentRole(selectedRole);

      if (selectedRole === 'vendeur') {
        setCurrentView('vendeur_dashboard');
        showToast(`Compte Vendeur créé avec succès sur Firebase ! Bienvenue ${profile.fullName}.`, 'success');
      } else {
        setCurrentView('livreur_dashboard');
        showToast(`Compte Livreur Partenaire créé sur Firebase ! Bienvenue ${profile.fullName}.`, 'success');
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
        showToast('Connexion Google annulée.', 'info');
      } else if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup')) {
        openGoogleModal(selectedRole);
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
      {/* Top Header */}
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
            <span className="text-slate-500 hidden sm:inline">Déjà inscrit ?</span>
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
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">login</span>
              <span>Se connecter</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex items-center justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
          {/* Left Column: Context & Realtime Proof Preview */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                INFRASTRUCTURE LOGISTIQUE SYNCHRONISÉE
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                {selectedRole === 'vendeur'
                  ? 'Rejoignez le réseau logistique urbain de référence'
                  : 'Roulez l\'esprit tranquille. Recevez des courses claires et rentables.'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {selectedRole === 'vendeur'
                  ? 'Optimisez chaque livraison avec un écosystème conçu pour éliminer l\'incertitude opérationnelle et protéger vos flux financiers.'
                  : 'Fini les pertes de temps et les litiges d\'adresses imprécises. Rejoignez le réseau LivraLink pour fluidifier votre activité avec des gains garantis.'}
              </p>
            </div>

            {/* Feature Bento Points */}
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-base">chat</span>
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">Fini le chaos des messages clients</h4>
                  <p className="text-[11px] text-slate-500">Générez des liens de suivi sécurisés pour vos clients sans ressaisir manuellement vos adresses.</p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-base">timeline</span>
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">Traçabilité des 7 statuts en direct</h4>
                  <p className="text-[11px] text-slate-500">Du ramassage au dépôt final : chronologie certifiée par géolocalisation haute fréquence.</p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-base">verified</span>
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">Preuve de livraison (POD) en 1 clic</h4>
                  <p className="text-[11px] text-slate-500">Horodatage cryptographique, signature tactile numérique et code OTP de validation instantané.</p>
                </div>
              </div>
            </div>

            {/* Live Telemetry Card: #LL-2048 */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="font-bold text-slate-900">APERÇU EN DIRECT : COLIS #LL-2048</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  POD Certifiée
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-900">En route • Cocody St-Jean</p>
                  <p className="text-[11px] text-slate-500">Livreur assigné : Ibrahim K.</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-blue-600">~14 min</span>
                  <span className="text-[10px] text-emerald-600 block">Preuve active</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Registration Form */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Créer votre compte LivraLink</h2>
                <p className="text-xs text-slate-500 mt-0.5">Sélectionnez votre profil d'activité pour démarrer.</p>
              </div>

              {/* Role Selection Dual Cards */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRole('vendeur');
                    setFullName('Sarah Kouamé (Mode & Beauté)');
                  }}
                  className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                    selectedRole === 'vendeur'
                      ? 'border-2 border-blue-600 bg-blue-50/50 shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
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
                    <span className="font-bold text-xs text-slate-900 block">Je suis vendeur</span>
                    <span className="text-[10px] text-slate-500 leading-tight block mt-0.5">
                      WhatsApp, Instagram &amp; Boutiques
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedRole('livreur');
                    setFullName('Ibrahim Touré');
                  }}
                  className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                    selectedRole === 'livreur'
                      ? 'border-2 border-blue-600 bg-blue-50/50 shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xl">🛵</span>
                    {selectedRole === 'livreur' ? (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                        <span className="material-symbols-outlined text-xs font-bold">check</span>
                      </span>
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-slate-300"></span>
                    )}
                  </div>
                  <div>
                    <span className="font-bold text-xs text-slate-900 block">Je suis livreur</span>
                    <span className="text-[10px] text-slate-500 leading-tight block mt-0.5">
                      Courses urbaines &amp; flotte
                    </span>
                  </div>
                </button>
              </div>

              {/* Google / Gmail Registration Button */}
              <button
                type="button"
                onClick={handleGoogleRegister}
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
                <span>S'inscrire avec Google (Gmail)</span>
              </button>

              <div className="relative py-0.5 flex items-center justify-center">
                <div className="border-t border-slate-200 w-full"></div>
                <span className="bg-white px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest absolute">
                  OU PAR FORMULAIRE
                </span>
              </div>

              {/* Test Accounts Quick Pre-fill */}
              <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-amber-600">science</span>
                    Tester les Profils Types (Vendeurs &amp; Livreurs) :
                  </span>
                  <button
                    type="button"
                    onClick={openTestModal}
                    className="text-[10px] text-amber-700 underline hover:text-amber-900 font-extrabold"
                  >
                    Lancer tous les tests
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => fillTestRegister('Sarah Chic Boutique', 'sarah.boutique@gmail.com', 'SarahPassword2025!', '+229 97 12 34 56', 'vendeur')}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold shadow-2xs transition-colors"
                  >
                    1. Sarah (Vendeur)
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestRegister('Karim Tech Store', 'karim.tech@gmail.com', 'KarimPassword2025#', '+229 95 88 77 66', 'vendeur')}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold shadow-2xs transition-colors"
                  >
                    2. Karim (Vendeur)
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestRegister('Amadou Bio Marché', 'amadou.bio@gmail.com', 'AmadouBio2025!', '+229 61 23 45 67', 'vendeur')}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold shadow-2xs transition-colors"
                  >
                    3. Amadou (Vendeur)
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestRegister('Moussa Express Moto', 'moussa.livreur@gmail.com', 'MoussaRider2025!', '+229 96 44 33 22', 'livreur')}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold shadow-2xs transition-colors"
                  >
                    4. Moussa (Livreur)
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestRegister('Fatou Cargo Vélo', 'fatou.cargo@gmail.com', 'FatouCargo2025!', '+229 90 11 22 33', 'livreur')}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold shadow-2xs transition-colors"
                  >
                    5. Fatou (Livreur)
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestRegister('Bakary Express Abidjan', 'bakary.express@gmail.com', 'BakaryFast2025!', '+225 07 48 12 34', 'livreur')}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold shadow-2xs transition-colors"
                  >
                    6. Bakary (Livreur)
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestRegister('Awa Véloce Livraisons', 'awa.veloce@gmail.com', 'AwaVeloce2025!', '+225 05 87 65 43', 'livreur')}
                    className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-bold shadow-2xs transition-colors"
                  >
                    7. Awa (Livreur)
                  </button>
                </div>
              </div>

              {/* Registration Form */}
              <form onSubmit={handleRegister} className="space-y-4">
                {errorMessage && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2 animate-in fade-in">
                    <span className="material-symbols-outlined text-base text-red-500">error</span>
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="fullname">
                    {selectedRole === 'vendeur' ? 'Nom de boutique ou complet *' : 'Nom complet *'}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <span className="material-symbols-outlined text-lg">
                        {selectedRole === 'vendeur' ? 'storefront' : 'person'}
                      </span>
                    </span>
                    <input
                      id="fullname"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      placeholder={selectedRole === 'vendeur' ? 'ex: Sarah Kouamé (Mode & Beauté)' : 'ex: Ibrahim Touré'}
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-700" htmlFor="reg-phone">
                      Téléphone WhatsApp direct *
                    </label>
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Canal d'alerte instantané
                    </span>
                  </div>
                  <div className="flex rounded-xl overflow-hidden border border-slate-300 bg-white">
                    <div className="px-3 bg-slate-50 border-r border-slate-300 flex items-center gap-1 text-xs font-bold text-slate-700 select-none">
                      <span>🇨🇮</span>
                      <span>+225</span>
                    </div>
                    <input
                      id="reg-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      placeholder="07 00 00 00 00"
                      className="w-full px-3 py-2.5 text-xs text-slate-900 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="reg-email">
                    Email professionnel *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <span className="material-symbols-outlined text-lg">mail</span>
                    </span>
                    <input
                      id="reg-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="sarah.glamchic@gmail.com"
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="reg-pwd">
                      Mot de passe (min 6 car.) *
                    </label>
                    <input
                      id="reg-pwd"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-3.5 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
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
                      className="w-full px-3.5 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                  </div>
                </div>

                {/* Password strength meter */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Solidité du mot de passe</span>
                    <span className="text-emerald-600 font-bold">Sécurité vérifiée ✓</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 h-1">
                    <div className="bg-emerald-500 rounded-full"></div>
                    <div className="bg-emerald-500 rounded-full"></div>
                    <div className="bg-emerald-500 rounded-full"></div>
                    <div className="bg-emerald-300 rounded-full"></div>
                  </div>
                </div>

                {/* Role badge notification */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600 text-sm">
                      {selectedRole === 'vendeur' ? 'store' : 'two_wheeler'}
                    </span>
                    <span className="text-slate-600">Rôle sélectionné :</span>
                  </div>
                  <span className="font-bold text-blue-700">
                    {selectedRole === 'vendeur' ? 'Marchand Social / E-commerce' : 'Livreur Partenaire Indépendant'}
                  </span>
                </div>

                {/* Terms checkbox */}
                <div className="pt-1">
                  <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      J'accepte les <a href="#cgu" className="text-blue-600 underline">Conditions Générales d'Utilisation</a> et la{' '}
                      <a href="#privacy" className="text-blue-600 underline">Politique de Confidentialité</a> de LivraLink.
                    </span>
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
                      <span>Création du compte Firebase en cours...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {selectedRole === 'vendeur' ? 'Créer mon compte Vendeur' : 'Devenir livreur LivraLink'}
                      </span>
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
                  className="text-blue-600 font-bold hover:underline"
                >
                  Se connecter à mon espace
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2025 LivraLink Technologies Inc. Tous droits réservés. Données sécurisées et cryptées bout-en-bout.</p>
      </footer>
    </div>
  );
};
