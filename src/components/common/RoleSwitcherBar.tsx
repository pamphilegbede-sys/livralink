import React, { useState } from 'react';
import { useApp, AppView } from '../../context/AppContext';

export const RoleSwitcherBar: React.FC<{
  deviceMode: 'responsive' | 'mobile-mock';
  setDeviceMode: (mode: 'responsive' | 'mobile-mock') => void;
}> = ({ deviceMode, setDeviceMode }) => {
  const { currentView, setCurrentView, currentRole, setCurrentRole, openTestModal } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBarCollapsed, setIsBarCollapsed] = useState(false);

  const views: { id: AppView; label: string; role: 'vendeur' | 'livreur' | 'admin' | 'public'; badge?: string; icon: string }[] = [
    { id: 'admin_console', label: 'Console Superviseur Admin', role: 'admin', badge: 'GESTION', icon: '👑' },
    { id: 'landing', label: 'Accueil Vitrine', role: 'public', icon: '🏠' },
    { id: 'vendeur_dashboard', label: 'Dashboard Vendeur', role: 'vendeur', icon: '📊' },
    { id: 'vendeur_new_delivery', label: '+ Nouvelle Livraison', role: 'vendeur', badge: 'Wizard', icon: '📦' },
    { id: 'vendeur_tracking', label: 'Suivi Vendeur', role: 'vendeur', icon: '📍' },
    { id: 'vendeur_reports', label: 'Rapports & Ventes', role: 'vendeur', icon: '📈' },
    { id: 'vendeur_settings', label: 'Paramètres Vendeur', role: 'vendeur', icon: '⚙️' },
    { id: 'livreur_dashboard', label: 'Dashboard Livreur', role: 'livreur', icon: '🛵' },
    { id: 'livreur_missions', label: 'Missions & Courses', role: 'livreur', icon: '📋' },
    { id: 'livreur_wallet', label: 'Portefeuille & Gains', role: 'livreur', icon: '💰' },
    { id: 'livreur_settings', label: 'Paramètres Livreur', role: 'livreur', icon: '🔧' },
    { id: 'login_vendeur', label: 'Connexion Vendeur', role: 'public', icon: '🔐' },
    { id: 'login_livreur', label: 'Connexion Livreur', role: 'public', icon: '🔑' },
    { id: 'register', label: 'Inscription', role: 'public', icon: '✨' },
  ];

  const currentViewObj = views.find((v) => v.id === currentView) || views[1];
  const isAdminActive = currentView === 'admin_console';

  if (isBarCollapsed) {
    return (
      <aside aria-label="Sélecteur d'écran" className="fixed top-2 right-2 z-50">
        <button
          type="button"
          onClick={() => setIsBarCollapsed(false)}
          className="px-2.5 py-1.5 rounded-full bg-slate-900/90 text-amber-300 border border-slate-700 shadow-xl backdrop-blur-md text-[11px] font-bold flex items-center gap-1.5 active:scale-95"
          title="Déplier la barre de navigation et rôles"
        >
          <span>👑</span>
          <span className="font-extrabold text-[10px]">Hub</span>
          <span className="material-symbols-outlined text-xs">expand_more</span>
        </button>
      </aside>
    );
  }

  return (
    <aside aria-label="Barre d'outils LivraLink" className="bg-[#0f172a] text-white px-2.5 sm:px-3 py-1.5 text-xs border-b border-slate-700/80 select-none z-50 shrink-0 shadow-md">
      {/* Mobile Drawer / Modal when Mobile Menu is opened */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 sm:hidden bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="bg-slate-900 border-t border-slate-700 rounded-t-3xl p-4 max-h-[80vh] overflow-y-auto space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-2"></div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-sm text-white">Changer de vue &amp; de rôle</span>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {views.map((v) => {
                const isActive = currentView === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setCurrentView(v.id);
                      if (v.role !== 'public') {
                        setCurrentRole(v.role);
                      }
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-left border transition-all active:scale-95 ${
                      isActive
                        ? 'bg-blue-600 border-blue-400 text-white font-bold'
                        : 'bg-slate-800/80 border-slate-700 text-slate-200'
                    }`}
                  >
                    <span className="text-base">{v.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate leading-tight">{v.label}</div>
                      {v.badge && (
                        <span className="inline-block px-1 py-0.2 rounded text-[8px] font-bold bg-amber-400/20 text-amber-300 mt-0.5">
                          {v.badge}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Single Row Toolbar */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        {/* Left: Brand & Admin Pinned Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700">
            <span className="flex h-1.5 w-1.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="font-extrabold tracking-tight text-white text-[10px] hidden xs:inline">Hub</span>
          </div>

          {/* Primary Admin Button */}
          <button
            type="button"
            onClick={() => {
              setCurrentRole('admin');
              setCurrentView('admin_console');
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95 ${
              isAdminActive
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 ring-2 ring-amber-300 font-extrabold'
                : 'bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600 hover:from-purple-600 text-white ring-1 ring-purple-400/50'
            }`}
            title="Accéder directement à la console Superviseur Administrateur"
          >
            <span>👑</span>
            <span className="tracking-wide text-[11px]">ADMIN</span>
          </button>
        </div>

        {/* Middle: On mobile, dropdown trigger button; on desktop, horizontal scroll list */}
        <div className="sm:hidden flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="w-full flex items-center justify-between px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-semibold"
          >
            <div className="flex items-center gap-1.5 truncate">
              <span>{currentViewObj.icon}</span>
              <span className="truncate">{currentViewObj.label}</span>
            </div>
            <span className="material-symbols-outlined text-xs text-slate-400 shrink-0">unfold_more</span>
          </button>
        </div>

        {/* Desktop Views Scrollbar */}
        <div className="hidden sm:flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-[200px]">
          {views.slice(1).map((v) => {
            const isActive = currentView === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setCurrentView(v.id);
                  if (v.role !== 'public') {
                    setCurrentRole(v.role);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs ring-1 ring-blue-400'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <span>{v.label}</span>
                {v.badge && (
                  <span className="px-1 py-0.2 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {v.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Tests, Device mode, and Minimize bar */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={openTestModal}
            className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-[10px] sm:text-[11px] font-bold flex items-center gap-1 transition-colors"
            title="Ouvrir la suite de tests et validation des profils"
          >
            <span className="material-symbols-outlined text-xs">science</span>
            <span className="hidden xs:inline">Tests</span>
          </button>

          <div className="hidden sm:flex items-center p-0.5 bg-slate-800 rounded-lg border border-slate-700 text-[11px]">
            <button
              type="button"
              onClick={() => setDeviceMode('responsive')}
              className={`px-2 py-0.5 rounded-md font-semibold transition-all flex items-center gap-1 ${
                deviceMode === 'responsive' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="Mode Responsive fluide"
            >
              <span className="material-symbols-outlined text-xs">devices</span>
              <span>Fluide</span>
            </button>
            <button
              type="button"
              onClick={() => setDeviceMode('mobile-mock')}
              className={`px-2 py-0.5 rounded-md font-semibold transition-all flex items-center gap-1 ${
                deviceMode === 'mobile-mock' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
              title="Simulateur Mobile Dédié"
            >
              <span className="material-symbols-outlined text-xs">smartphone</span>
              <span>Mobile</span>
            </button>
          </div>

          {/* Minimize button */}
          <button
            type="button"
            onClick={() => setIsBarCollapsed(true)}
            className="p-1 text-slate-400 hover:text-white transition-colors"
            title="Réduire la barre d'outils"
          >
            <span className="material-symbols-outlined text-xs">expand_less</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
