import React, { useState, useEffect } from 'react';
import {
  requestPasswordResetCode,
  verifyResetCodeAndSetPassword,
  getFirebaseAuthErrorMessage,
  loginWithEmailPassword,
} from '../../firebase/authService';
import { useApp } from '../../context/AppContext';

export const ForgotPasswordModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}> = ({ isOpen, onClose, defaultEmail = '' }) => {
  const { setCurrentView, setCurrentRole, showToast } = useApp();
  const [step, setStep] = useState<'request' | 'verify' | 'success'>('request');
  const [email, setEmail] = useState(defaultEmail || '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolvedRole, setResolvedRole] = useState<'vendeur' | 'livreur'>('livreur');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!isOpen) return null;

  // Step 1: Send Reset Code / Email
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Veuillez renseigner une adresse e-mail valide.');
      showToast('Adresse e-mail invalide.', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const res = await requestPasswordResetCode(cleanEmail);
      setStep('verify');
      setCooldown(60); // 60s cooldown
      showToast(res.message || `Code de sécurité envoyé à ${cleanEmail} !`, 'success');
    } catch (err: any) {
      const friendlyMsg = getFirebaseAuthErrorMessage(err);
      setErrorMsg(friendlyMsg);
      showToast(friendlyMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify Code and Set New Password
  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanCode = code.trim();
    if (!cleanCode || cleanCode.length < 6) {
      setErrorMsg('Veuillez saisir le code de sécurité à 6 chiffres reçu dans votre boîte e-mail.');
      showToast('Code de sécurité à 6 chiffres requis.', 'error');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Le nouveau mot de passe doit comporter au moins 6 caractères.');
      showToast('Mot de passe trop court (minimum 6 caractères).', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Les deux mots de passe ne correspondent pas.');
      showToast('Les mots de passe ne correspondent pas.', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const result = await verifyResetCodeAndSetPassword(email, cleanCode, newPassword);
      setResolvedRole(result.role === 'vendeur' ? 'vendeur' : 'livreur');
      setStep('success');
      showToast('Votre mot de passe a été réinitialisé avec succès !', 'success');
    } catch (err: any) {
      const friendlyMsg = getFirebaseAuthErrorMessage(err);
      setErrorMsg(friendlyMsg);
      showToast(friendlyMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Connect Immediately
  const handleConnectNow = async () => {
    try {
      const res = await loginWithEmailPassword(email, newPassword);
      const role = res.profile?.role || resolvedRole;
      setCurrentRole(role);
      setCurrentView(role === 'vendeur' ? 'vendeur_dashboard' : 'livreur_dashboard');
      showToast(`Connexion réussie sur votre espace ${role.toUpperCase()} !`, 'success');
      handleClose();
    } catch {
      handleClose();
    }
  };

  const handleClose = () => {
    setStep('request');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 font-['Plus_Jakarta_Sans']">
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <span className="material-symbols-outlined text-2xl">lock_reset</span>
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 leading-tight">
                Réinitialisation du mot de passe
              </h3>
              <p className="text-xs text-slate-500">Procédure sécurisée LivraLink</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2 animate-in fade-in">
              <span className="material-symbols-outlined text-base text-red-500">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: Request Email Code */}
          {step === 'request' && (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Saisissez votre adresse e-mail. Nous vous enverrons votre code de sécurité à 6 chiffres ainsi que le lien de réinitialisation sécurisé par mail.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="reset-email">
                  Adresse e-mail du compte *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <span className="material-symbols-outlined text-lg">mail</span>
                  </span>
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ex: nom@domaine.com"
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2.5 text-[11px] text-slate-500">
                <span className="material-symbols-outlined text-blue-600 text-base">shield</span>
                <span>Transmission chiffrée SSL/TLS. Vos données personnelles sont strictement confidentielles.</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Envoi en cours...</span>
                    </>
                  ) : (
                    <>
                      <span>Envoyer le code</span>
                      <span className="material-symbols-outlined text-sm">send</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Verify Code and Set New Password (SECURED, NO CODE DISPLAYED ON SCREEN) */}
          {step === 'verify' && (
            <form onSubmit={handleVerifyAndReset} className="space-y-4 animate-in fade-in">
              <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-2xl space-y-1.5 text-xs text-blue-900">
                <div className="font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base text-blue-600">mark_email_read</span>
                    <span>Code &amp; Lien envoyés à :</span>
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                    Valide 15 min
                  </span>
                </div>
                <div className="font-semibold text-slate-800 break-all text-[11px] bg-white/80 px-2.5 py-1 rounded-lg border border-blue-100">
                  {email}
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed pt-0.5">
                  Veuillez consulter votre boîte de réception (et vos spams / courriers indésirables). Saisissez les 6 chiffres reçus dans le champ ci-dessous.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="verification-code">
                  Code de sécurité reçu par mail (6 chiffres) *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <span className="material-symbols-outlined text-lg">pin</span>
                  </span>
                  <input
                    id="verification-code"
                    type="text"
                    maxLength={128}
                    value={code}
                    onChange={(e) => setCode(e.target.value.trim())}
                    placeholder="ex: 123456"
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 text-center tracking-widest font-mono text-base font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-slate-50/50 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="reset-new-pwd">
                  Nouveau mot de passe (min. 6 caractères) *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <span className="material-symbols-outlined text-lg">lock</span>
                  </span>
                  <input
                    id="reset-new-pwd"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <span className="material-symbols-outlined text-base">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="reset-confirm-pwd">
                  Confirmer le mot de passe *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <span className="material-symbols-outlined text-lg">lock</span>
                  </span>
                  <input
                    id="reset-confirm-pwd"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setStep('request')}
                  className="text-blue-600 font-semibold hover:underline flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  <span>Changer d'e-mail</span>
                </button>
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={isLoading || cooldown > 0}
                  className="text-slate-500 hover:text-slate-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cooldown > 0 ? `Renvoyer (${cooldown}s)` : 'Renvoyer le code'}
                </button>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Validation...</span>
                    </>
                  ) : (
                    <>
                      <span>Mettre à jour</span>
                      <span className="material-symbols-outlined text-sm">check</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Success Confirmation */}
          {step === 'success' && (
            <div className="space-y-4 text-center py-3 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-3xl">verified</span>
              </div>

              <div className="space-y-1">
                <h4 className="font-extrabold text-base text-slate-900">
                  Mot de passe mis à jour avec succès
                </h4>
                <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                  Votre nouveau mot de passe a été enregistré et sécurisé. Vous pouvez désormais vous connecter en toute tranquillité.
                </p>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-sm">lock</span>
                <span>Compte sécurisé • Authentification prête</span>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleConnectNow}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">login</span>
                  <span>Se connecter à mon compte</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
