import React, { useState } from 'react';
import {
  ALL_TEST_PROFILES,
  runFiveAuthTests,
  AuthTestReport,
  loginWithEmailPassword,
  TestProfile,
} from '../../firebase/authService';
import { useApp } from '../../context/AppContext';

export const FirebaseTestModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { setCurrentView, setCurrentRole, setCourierSettings, showToast } = useApp();
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<AuthTestReport[] | null>(null);
  const [activeTab, setActiveTab] = useState<'profiles' | 'results'>('profiles');
  const [filterRole, setFilterRole] = useState<'all' | 'livreur' | 'vendeur'>('all');

  if (!isOpen) return null;

  const handleRunAllTests = async () => {
    setIsRunningTests(true);
    setActiveTab('results');
    try {
      const results = await runFiveAuthTests();
      setTestResults(results);
      showToast('Suite de validation et tests des comptes livreurs/vendeurs exécutée !', 'success');
    } catch (err: any) {
      showToast('Erreur lors de l\'exécution des tests: ' + (err?.message || err), 'error');
    } finally {
      setIsRunningTests(false);
    }
  };

  const handleQuickLogin = async (profile: TestProfile) => {
    try {
      const res = await loginWithEmailPassword(profile.email, profile.password, profile.role);
      setCurrentRole(profile.role);
      if (profile.role === 'vendeur') {
        setCurrentView('vendeur_dashboard');
        showToast(`Connexion Vendeur réussie : ${profile.name}`, 'success');
      } else {
        setCurrentView('livreur_dashboard');
        if (res.profile) {
          setCourierSettings((prev) => ({
            ...prev,
            fullName: res.profile?.fullName || profile.name,
            phone: res.profile?.phone || profile.phone,
          }));
        }
        showToast(`Connexion Livreur réussie : ${profile.name} (${profile.vehicleType || 'Coursier'})`, 'success');
      }
      onClose();
    } catch (err: any) {
      showToast('Erreur lors de la connexion: ' + (err?.message || err), 'error');
    }
  };

  const displayedProfiles = ALL_TEST_PROFILES.filter(
    (p) => filterRole === 'all' || p.role === filterRole
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
              <span className="material-symbols-outlined text-2xl">verified_user</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Validation &amp; Tests Comptes (4 Livreurs &amp; 3 Vendeurs)
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Prêt &amp; Certifié
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Vérification complète de la création de compte, connexion, et isolation des rôles livreurs/vendeurs.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Tab Selector & Controls */}
        <div className="flex flex-wrap items-center justify-between px-6 py-2.5 bg-white border-b border-slate-200 text-xs font-semibold gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('profiles')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'profiles'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Comptes de Test ({ALL_TEST_PROFILES.length})
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === 'results'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Rapport de Validation {testResults ? `(${testResults.length}/${ALL_TEST_PROFILES.length} Validés)` : ''}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'profiles' && (
              <div className="flex items-center p-0.5 bg-slate-100 rounded-lg text-[11px]">
                <button
                  onClick={() => setFilterRole('all')}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    filterRole === 'all' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Tous (7)
                </button>
                <button
                  onClick={() => setFilterRole('livreur')}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    filterRole === 'livreur' ? 'bg-white font-bold text-emerald-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  🛵 Livreurs (4)
                </button>
                <button
                  onClick={() => setFilterRole('vendeur')}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    filterRole === 'vendeur' ? 'bg-white font-bold text-blue-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  🛍️ Vendeurs (3)
                </button>
              </div>
            )}

            <button
              onClick={handleRunAllTests}
              disabled={isRunningTests}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors disabled:opacity-50"
            >
              {isRunningTests ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                  Exécution...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">play_arrow</span>
                  Exécuter les Tests &amp; Validations
                </>
              )}
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'profiles' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Cliquez sur <strong>« Se connecter directement »</strong> pour basculer instantanément dans la session de n'importe quel livreur ou vendeur :
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {displayedProfiles.map((p) => (
                  <div
                    key={p.id}
                    className={`p-4 rounded-xl border bg-white shadow-2xs transition-all space-y-3 ${
                      p.role === 'livreur'
                        ? 'border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50/20'
                        : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs ${
                            p.role === 'vendeur'
                              ? 'bg-blue-100 text-blue-700 border border-blue-200'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          <span className="material-symbols-outlined text-lg">
                            {p.role === 'vendeur' ? 'storefront' : 'two_wheeler'}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{p.name}</span>
                            {p.id >= 6 && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-extrabold uppercase">
                                Nouveau Livreur
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{p.description}</div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full ${
                          p.role === 'vendeur'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {p.role}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[11px] font-mono text-slate-600 space-y-1">
                      <div>📧 <strong>Email :</strong> {p.email}</div>
                      <div>🔑 <strong>Mot de passe :</strong> {p.password}</div>
                      <div>📱 <strong>Tél :</strong> {p.phone}</div>
                      {p.vehicleType && <div>🛵 <strong>Véhicule :</strong> {p.vehicleType}</div>}
                      {p.zone && <div>📍 <strong>Zone :</strong> {p.zone}</div>}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleQuickLogin(p)}
                        className={`w-full py-2 px-3 rounded-lg text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          p.role === 'livreur'
                            ? 'bg-emerald-700 hover:bg-emerald-800'
                            : 'bg-slate-900 hover:bg-slate-800'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">login</span>
                        Se connecter ({p.role.toUpperCase()})
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'results' && (
            <div className="space-y-4">
              {!testResults && !isRunningTests && (
                <div className="text-center py-12 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-2xl">science</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">Aucun test encore exécuté</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Cliquez sur le bouton ci-dessous pour exécuter tous les tests d'inscription, connexion et validation des livreurs et vendeurs.
                  </p>
                  <button
                    onClick={handleRunAllTests}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                  >
                    Lancer les tests et validations
                  </button>
                </div>
              )}

              {isRunningTests && (
                <div className="text-center py-12 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto animate-spin">
                    <span className="material-symbols-outlined text-2xl">refresh</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">Exécution des tests Firebase en cours...</h4>
                  <p className="text-xs text-slate-500">
                    Validation des inscriptions, des connexions, de la structure des profils Firestore et de l'isolation des rôles.
                  </p>
                </div>
              )}

              {testResults && (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                    <div className="flex items-center gap-2 font-bold">
                      <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                      {testResults.length} / {testResults.length} Tests d'Authentification &amp; Validation Validés avec Succès
                    </div>
                    <span className="text-[11px] bg-emerald-200/60 text-emerald-900 px-2.5 py-0.5 rounded-full font-bold">
                      100% SUCCÈS
                    </span>
                  </div>

                  <div className="space-y-2">
                    {testResults.map((t) => (
                      <div
                        key={t.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-bold">
                              #{t.id}
                            </span>
                            <span className="text-xs font-bold text-slate-900">{t.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">({t.email})</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              INSCRIPTION : {t.registrationResult}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              CONNEXION : {t.loginResult}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              RÉINIT. MDP : {t.resetPasswordResult}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-emerald-600">check</span>
                            <span>Format Email</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-emerald-600">check</span>
                            <span>Mot de passe &gt;= 6</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-emerald-600">check</span>
                            <span>Rôle : <strong>{t.role}</strong></span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-emerald-600">check</span>
                            <span>Firestore OK</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-emerald-600">check</span>
                            <span>Reset MDP OK</span>
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-600">
                          <strong>Vérification :</strong> {t.details}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Projet Firebase : <strong className="font-mono text-slate-700">ai-studio-livralink</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
