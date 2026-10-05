import React from 'react';
import { useApp, AppView } from '../../context/AppContext';

export const RoleSwitcherBar: React.FC<{
  deviceMode: 'responsive' | 'mobile-mock';
  setDeviceMode: (mode: 'responsive' | 'mobile-mock') => void;
}> = ({ deviceMode, setDeviceMode }) => {
  const { currentView, setCurrentView, currentRole, setCurrentRole, openTestModal } = useApp();

  const views: { id: AppView; label: string; role: 'vendeur' | 'livreur' | 'admin' | 'public'; badge?: string }[] = [
    { id: 'admin_console', label: '👑 Console Superviseur Admin', role: 'admin', badge: 'GESTION COMPLÈTE' },
    { id: 'landing', label: 'Accueil Vitrine', role: 'public' },
    { id: 'vendeur_dashboard', label: 'Dashboard Vendeur', role: 'vendeur' },
    { id: 'vendeur_new_delivery', label: '+ Nouvelle Livraison', role: 'vendeur', badge: 'Wizard' },
    { id: 'vendeur_tracking', label: 'Suivi Vendeur', role: 'vendeur' },
    { id: 'vendeur_settings', label: 'Paramètres Vendeur', role: 'vendeur' },
    { id: 'livreur_dashboard', label: 'Dashboard Livreur', role: 'livreur' },
    { id: 'livreur_settings', label: 'Paramètres Livreur', role: 'livreur' },
    { id: 'login_vendeur', label: 'Connexion Vendeur', role: 'public' },
    { id: 'login_livreur', label: 'Connexion Livreur', role: 'public' },
    { id: 'register', label: 'Inscription', role: 'public' },
  ];

  const isAdminActive = currentView === 'admin_console';

  return (
    <div className="bg-[#0f172a] text-white px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 select-none z-50 shrink-0 shadow-md">
      {/* Brand & Direct Admin Highlight Button */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-extrabold tracking-tight text-white text-[11px]">LivraLink Hub</span>
        </div>

        {/* PRIMARY PINNED ADMIN BUTTON */}
        <button
          onClick={() => {
            setCurrentRole('admin');
            setCurrentView('admin_console');
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${
            isAdminActive
              ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 ring-2 ring-amber-300 font-extrabold shadow-amber-500/30'
              : 'bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600 hover:from-purple-600 hover:to-blue-500 text-white ring-1 ring-purple-400/50 hover:shadow-lg'
          }`}
          title="Accéder directement à la console Superviseur Administrateur"
        >
          <span className="text-sm">👑</span>
          <span className="tracking-wide">CONSOLE ADMIN</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-black/30 text-amber-200 border border-amber-300/30">
            DIRECT
          </span>
        </button>
      </div>

      {/* Other Navigation views */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-[200px]">
        {views.slice(1).map((v) => {
          const isActive = currentView === v.id;
          return (
            <button
              key={v.id}
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

      {/* Device frame toggle & active role badge */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={openTestModal}
          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-[11px] font-bold flex items-center gap-1 transition-colors shadow-xs"
          title="Ouvrir la suite de tests et validation des profils"
        >
          <span className="material-symbols-outlined text-xs">science</span>
          <span>Tests &amp; Comptes</span>
        </button>

        <div className="hidden sm:flex items-center p-0.5 bg-slate-800 rounded-lg border border-slate-700 text-[11px]">
          <button
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

        <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border ${
          currentRole === 'admin' 
            ? 'bg-amber-500/20 text-amber-300 border-amber-400/50' 
            : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
        }`}>
          {currentRole}
        </span>
      </div>
    </div>
  );
};
