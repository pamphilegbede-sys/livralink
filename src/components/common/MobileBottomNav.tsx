import React from 'react';
import { useApp } from '../../context/AppContext';

export const MobileBottomNav: React.FC = () => {
  const { currentView, setCurrentView, currentRole, setCurrentRole, adminActiveTab, setAdminActiveTab, deliveries } = useApp();
  const [isAdminHubOpen, setIsAdminHubOpen] = React.useState(false);

  const activeDeliveriesCount = deliveries.filter((d) => d.status === 'en_cours' || d.status === 'acceptee' || d.status === 'colis_recupere').length;
  const pendingDeliveriesCount = deliveries.filter((d) => d.status === 'en_attente' || !d.courier).length;

  const adminModules = [
    { id: 'overview', label: 'Synthèse & KPIs', icon: 'dashboard', color: 'text-amber-400 bg-amber-500/10' },
    { id: 'deliveries', label: 'Courses Direct', icon: 'local_shipping', color: 'text-blue-400 bg-blue-500/10', badge: activeDeliveriesCount > 0 ? `${activeDeliveriesCount}` : undefined },
    { id: 'users', label: 'Utilisateurs', icon: 'group', color: 'text-purple-400 bg-purple-500/10' },
    { id: 'kyc', label: 'Vérifications KYC', icon: 'verified_user', color: 'text-emerald-400 bg-emerald-500/10' },
    { id: 'couriers', label: 'Flotte Livreurs', icon: 'two_wheeler', color: 'text-teal-400 bg-teal-500/10' },
    { id: 'merchants', label: 'Boutiques Vendeurs', icon: 'storefront', color: 'text-sky-400 bg-sky-500/10' },
    { id: 'disputes', label: 'Litiges & Arbitrage', icon: 'warning', color: 'text-red-400 bg-red-500/10' },
    { id: 'pricing', label: 'Tarifs & Zones', icon: 'tune', color: 'text-orange-400 bg-orange-500/10' },
    { id: 'tests', label: 'Suite Tests (8 Pôles)', icon: 'science', color: 'text-indigo-400 bg-indigo-500/10', badge: '8/8' },
    { id: 'audit', label: 'Journal d\'Audit', icon: 'history', color: 'text-slate-300 bg-slate-800' },
    { id: 'security', label: 'Sécurité Whitelist', icon: 'shield_person', color: 'text-rose-400 bg-rose-500/10' },
  ];

  if (currentRole === 'admin') {
    return (
      <>
        {/* Admin Quick Hub Drawer / Bottom Sheet */}
        {isAdminHubOpen && (
          <div
            className="fixed inset-0 z-50 md:hidden bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end"
            onClick={() => setIsAdminHubOpen(false)}
          >
            <div
              className="bg-slate-900 border-t border-slate-700 rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto custom-scrollbar shadow-2xl animate-in slide-in-from-bottom duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-4"></div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 flex items-center justify-center font-bold text-sm shadow-md">
                    👑
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">Hub Administrateur Mobile</h3>
                    <p className="text-[10px] text-slate-400">11 modules de supervision disponibles</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAdminHubOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>

              {/* 11 Modules Grid */}
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                {adminModules.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => {
                      setCurrentView('admin_console');
                      setAdminActiveTab(mod.id as any);
                      setIsAdminHubOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl text-left border transition-all active:scale-95 ${
                      currentView === 'admin_console' && adminActiveTab === mod.id
                        ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 font-bold shadow-xs'
                        : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${mod.color}`}>
                      <span className="material-symbols-outlined text-lg">{mod.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate leading-tight">{mod.label}</div>
                      {mod.badge && (
                        <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-400 text-slate-950 mt-0.5">
                          {mod.badge}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Quick Switch to Merchant or Driver */}
              <div className="pt-3 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentRole('vendeur');
                    setCurrentView('vendeur_dashboard');
                    setIsAdminHubOpen(false);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 text-blue-400 hover:bg-slate-700 font-bold flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">storefront</span>
                  <span>Espace Vendeur</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentRole('livreur');
                    setCurrentView('livreur_dashboard');
                    setIsAdminHubOpen(false);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 text-emerald-400 hover:bg-slate-700 font-bold flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">two_wheeler</span>
                  <span>Espace Livreur</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <nav
          aria-label="Navigation principale mobile Admin"
          className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 text-white backdrop-blur-md border-t border-slate-700 md:hidden pb-safe shadow-lg"
        >
          <div className="max-w-md mx-auto grid grid-cols-5 h-14 text-center">
            <button
              onClick={() => {
                setCurrentView('admin_console');
                setAdminActiveTab('overview');
              }}
              className={`flex flex-col items-center justify-center py-1 transition-colors ${
                currentView === 'admin_console' && adminActiveTab === 'overview'
                  ? 'text-amber-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">dashboard</span>
              <span className="text-[10px] mt-0.5">Synthèse</span>
            </button>

            <button
              onClick={() => {
                setCurrentView('admin_console');
                setAdminActiveTab('deliveries');
              }}
              className={`flex flex-col items-center justify-center py-1 transition-colors relative ${
                currentView === 'admin_console' && adminActiveTab === 'deliveries'
                  ? 'text-amber-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Supervision Courses"
            >
              <div className="relative">
                <span className="material-symbols-outlined text-[20px]">local_shipping</span>
                {activeDeliveriesCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-blue-500 text-white text-[8px] font-bold px-1 rounded-full">
                    {activeDeliveriesCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5">Courses</span>
            </button>

            <button
              onClick={() => setIsAdminHubOpen(!isAdminHubOpen)}
              className="flex flex-col items-center justify-center text-amber-400 py-1 transition-transform active:scale-95"
              title="Ouvrir le Hub Admin (11 Modules)"
            >
              <div className={`w-10 h-10 -mt-4 rounded-full flex items-center justify-center shadow-lg ring-4 ring-slate-900 font-bold transition-all ${
                isAdminHubOpen ? 'bg-amber-300 scale-110' : 'bg-gradient-to-tr from-amber-500 to-amber-400'
              } text-slate-950`}>
                <span>👑</span>
              </div>
              <span className="text-[10px] font-bold mt-0.5 text-amber-400">Hub 11</span>
            </button>

            <button
              onClick={() => {
                setCurrentView('admin_console');
                setAdminActiveTab('couriers');
              }}
              className={`flex flex-col items-center justify-center py-1 transition-colors ${
                currentView === 'admin_console' && adminActiveTab === 'couriers'
                  ? 'text-amber-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Gestion Livreurs"
            >
              <span className="material-symbols-outlined text-[20px]">two_wheeler</span>
              <span className="text-[10px] mt-0.5">Livreurs</span>
            </button>

            <button
              onClick={() => {
                setCurrentView('admin_console');
                setAdminActiveTab('disputes');
              }}
              className={`flex flex-col items-center justify-center py-1 transition-colors ${
                currentView === 'admin_console' && adminActiveTab === 'disputes'
                  ? 'text-red-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Litiges & Support"
            >
              <span className="material-symbols-outlined text-[20px]">warning</span>
              <span className="text-[10px] mt-0.5">Litiges</span>
            </button>
          </div>
        </nav>
      </>
    );
  }

  return (
    <nav
      aria-label="Navigation principale mobile"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 md:hidden pb-safe shadow-lg"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 h-14">
        {/* Destination 1: Tableau de bord */}
        <button
          onClick={() => setCurrentView(currentRole === 'vendeur' ? 'vendeur_dashboard' : 'livreur_dashboard')}
          className={`flex flex-col items-center justify-center py-1 transition-colors ${
            currentView === 'vendeur_dashboard' || currentView === 'livreur_dashboard'
              ? 'text-blue-600 font-bold'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">dashboard</span>
          <span className="text-[10px] mt-0.5">Tableau</span>
        </button>

        {/* Destination 2: Expéditions / Courses */}
        <button
          onClick={() => setCurrentView(currentRole === 'vendeur' ? 'vendeur_tracking' : 'livreur_missions')}
          className={`flex flex-col items-center justify-center py-1 transition-colors relative ${
            currentView === 'vendeur_tracking' || currentView === 'livreur_missions'
              ? 'text-blue-600 font-bold'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <div className="relative">
            <span className="material-symbols-outlined text-[20px]">local_shipping</span>
            <span className="absolute -top-1 -right-2 bg-blue-600 text-white text-[9px] font-bold px-1 rounded-full">
              {currentRole === 'vendeur' ? deliveries.length : (pendingDeliveriesCount || 1)}
            </span>
          </div>
          <span className="text-[10px] mt-0.5">{currentRole === 'vendeur' ? 'Livraisons' : 'Courses'}</span>
        </button>

        {/* Destination 3: Créer (FAB Center for Merchant / SOS for Courier) */}
        {currentRole === 'vendeur' ? (
          <button
            onClick={() => setCurrentView('vendeur_new_delivery')}
            className="flex flex-col items-center justify-center text-blue-600 py-1 transition-transform active:scale-95"
          >
            <div className="w-10 h-10 -mt-4 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg ring-4 ring-white">
              <span className="material-symbols-outlined text-[24px]">add</span>
            </div>
            <span className="text-[10px] font-bold mt-0.5 text-blue-700">Créer</span>
          </button>
        ) : (
          <button
            onClick={() => setCurrentView('livreur_missions')}
            className="flex flex-col items-center justify-center text-emerald-600 py-1 transition-transform active:scale-95"
          >
            <div className="w-10 h-10 -mt-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg ring-4 ring-white">
              <span className="material-symbols-outlined text-[22px]">two_wheeler</span>
            </div>
            <span className="text-[10px] font-bold mt-0.5 text-emerald-700">Missions</span>
          </button>
        )}

        {/* Destination 4: Rapports pour Vendeur / Portefeuille pour Livreur */}
        <button
          onClick={() => setCurrentView(currentRole === 'vendeur' ? 'vendeur_reports' : 'livreur_wallet')}
          className={`flex flex-col items-center justify-center py-1 transition-colors ${
            currentView === 'vendeur_reports' || currentView === 'livreur_wallet' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">
            {currentRole === 'vendeur' ? 'analytics' : 'account_balance_wallet'}
          </span>
          <span className="text-[10px] mt-0.5">{currentRole === 'vendeur' ? 'Rapports' : 'Gains'}</span>
        </button>

        {/* Destination 5: Profil / Réglages */}
        <button
          onClick={() => setCurrentView(currentRole === 'vendeur' ? 'vendeur_settings' : 'livreur_settings')}
          className={`flex flex-col items-center justify-center py-1 transition-colors ${
            currentView === 'vendeur_settings' || currentView === 'livreur_settings'
              ? 'text-blue-600 font-bold'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span className="text-[10px] mt-0.5">Paramètres</span>
        </button>
      </div>
    </nav>
  );
};
