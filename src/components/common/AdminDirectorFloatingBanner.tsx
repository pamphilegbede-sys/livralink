import React from 'react';
import { useApp } from '../../context/AppContext';

export const AdminDirectorFloatingBanner: React.FC = () => {
  const {
    isDirectorModeActive,
    directorTargetName,
    exitDirectorMode,
    setCurrentView,
    setAdminActiveTab,
    currentRole,
    currentView,
    userProfile,
    isEmailAuthorizedAdmin,
    featureFlags
  } = useApp();

  const isUserSuperAdmin = userProfile?.email && isEmailAuthorizedAdmin(userProfile.email);
  const shouldShow = (isDirectorModeActive || (isUserSuperAdmin && currentView !== 'admin_console' && currentView !== 'landing')) && currentView !== 'admin_console';

  if (!shouldShow) return null;

  const handleOpenAdminFeatures = () => {
    setAdminActiveTab('features');
    setCurrentView('admin_console');
  };

  const handleOpenAdminConsole = () => {
    setCurrentView('admin_console');
  };

  return (
    <aside aria-label="Bandeau Directeur Admin" className="sticky top-0 z-50 w-full bg-gradient-to-r from-amber-700 via-indigo-900 to-purple-950 text-white shadow-xl border-b border-amber-400/40 px-3 py-2 text-xs font-['Plus_Jakarta_Sans'] transition-all animate-fade-in">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
        
        {/* Left: Indicator & Context */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/40 flex items-center justify-center font-bold text-sm shrink-0 shadow-inner">
            👑
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-amber-300 text-xs tracking-wide">
                MODE DIRECTEUR GÉNÉRAL ADMIN
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/15 text-white border border-white/20">
                Supervision temps réel
              </span>
            </div>
            <p className="text-[11px] text-slate-200 truncate mt-0.5">
              Vous pilotez actuellement : <strong className="text-white font-bold">{directorTargetName || (currentRole === 'vendeur' ? 'Espace Marchand' : 'Espace Coursier')}</strong> • Tous vos changements s'appliquent immédiatement.
            </p>
          </div>
        </div>

        {/* Right: Quick Admin Navigation Actions */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handleOpenAdminFeatures}
            className="px-3 py-1.5 rounded-xl bg-purple-600/80 hover:bg-purple-600 text-white text-[11px] font-bold transition-all flex items-center gap-1 active:scale-95 border border-purple-400/30 cursor-pointer shadow-xs"
            title="Activer ou désactiver des fonctionnalités sur cette page"
          >
            <span className="material-symbols-outlined text-sm">toggle_on</span>
            <span>Gérer les fonctionnalités</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdminConsole}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-all flex items-center gap-1 active:scale-95 shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">dashboard</span>
            <span>Console Admin</span>
          </button>

          <button
            type="button"
            onClick={exitDirectorMode}
            className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-red-500/80 text-white text-[11px] font-bold transition-all flex items-center gap-1 active:scale-95 border border-white/20 cursor-pointer"
            title="Quitter le mode supervision et revenir à l'admin"
          >
            <span className="material-symbols-outlined text-sm">close</span>
            <span>Quitter</span>
          </button>
        </div>

      </div>
    </aside>
  );
};
