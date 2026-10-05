import React from 'react';
import { useApp } from '../../context/AppContext';

export const Sidebar: React.FC = () => {
  const { currentView, setCurrentView, currentRole, setCurrentRole, merchantSettings, courierSettings, showToast, logout, openTestModal } = useApp();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <aside className="hidden md:flex flex-col justify-between h-screen w-64 bg-white border-r border-slate-200 shadow-sm z-30 shrink-0 select-none sticky top-0">
      {/* Top Part: Logo, CTA, Navigation */}
      <div className="flex flex-col p-4">
        {/* Brand Logo & Switcher */}
        <div className="flex items-center justify-between px-2 py-3 mb-4">
          <button
            onClick={() => setCurrentView('landing')}
            className="inline-flex items-center gap-2 group text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm">
              <span className="material-symbols-outlined text-xl text-blue-400">local_shipping</span>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-extrabold tracking-tight text-slate-900 leading-none">
                Livra<span className="text-blue-600">Link</span>
              </span>
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                CONNECT &amp; DELIVER
              </span>
            </div>
          </button>
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {currentRole}
          </span>
        </div>

        {/* Primary Action Button (New delivery for vendor / Search for driver) */}
        {currentRole === 'vendeur' && (
          <button
            onClick={() => setCurrentView('vendeur_new_delivery')}
            className="mb-5 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            <span>+ Nouvelle livraison</span>
          </button>
        )}

        {currentRole === 'livreur' && (
          <div className="mb-5 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${courierSettings.isAvailable ? 'bg-emerald-400' : 'bg-slate-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${courierSettings.isAvailable ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
              </span>
              <span className="text-xs font-bold text-slate-800">
                {courierSettings.isAvailable ? 'Disponible 🟢' : 'En pause ⏸️'}
              </span>
            </div>
            <span className="text-[10px] font-bold text-blue-700">Abidjan Nord</span>
          </div>
        )}

        {currentRole === 'admin' && (
          <div className="mb-5 p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs font-bold">Réseau Opérationnel</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">HUB CI</span>
          </div>
        )}

        {/* Navigation Tabs - Role-specific */}
        <nav className="space-y-1">
          {/* Quick Admin switch button for non-admin roles */}
          {currentRole !== 'admin' && (
            <button
              onClick={() => {
                setCurrentRole('admin');
                setCurrentView('admin_console');
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900 text-amber-300 border border-amber-400/40 shadow-xs mb-3 transition-all active:scale-95"
              title="Basculer vers la console administrateur"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">👑</span>
                <span>Console Admin</span>
              </div>
              <span className="material-symbols-outlined text-sm text-amber-300">arrow_forward</span>
            </button>
          )}

          {/* VENDEUR TABS */}
          {currentRole === 'vendeur' && (
            <>
              <button
                type="button"
                onClick={() => setCurrentView('vendeur_dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  currentView === 'vendeur_dashboard'
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-xl">dashboard</span>
                <span>Tableau de bord</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('vendeur_tracking')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  currentView === 'vendeur_tracking'
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl">local_shipping</span>
                  <span>Mes Livraisons</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('vendeur_reports')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  currentView === 'vendeur_reports'
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-xl">analytics</span>
                <span>Rapports &amp; Statistiques</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('vendeur_settings')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  currentView === 'vendeur_settings'
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-xl">settings</span>
                <span>Paramètres Vendeur</span>
              </button>
            </>
          )}

          {/* LIVREUR TABS */}
          {currentRole === 'livreur' && (
            <>
              <button
                type="button"
                onClick={() => setCurrentView('livreur_dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  currentView === 'livreur_dashboard'
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-xl">dashboard</span>
                <span>Tableau de bord</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('livreur_missions')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  currentView === 'livreur_missions'
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl">local_shipping</span>
                  <span>Mes Courses</span>
                </div>
                <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-bold">2</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('livreur_wallet')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  currentView === 'livreur_wallet'
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-xl">account_balance_wallet</span>
                <span>Portefeuille (0% MVP)</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentView('livreur_settings')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  currentView === 'livreur_settings'
                    ? 'bg-blue-50 text-blue-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-xl">settings</span>
                <span>Paramètres Livreur</span>
              </button>
            </>
          )}

          {/* ADMIN TABS */}
          {currentRole === 'admin' && (
            <>
              <button
                onClick={() => setCurrentView('admin_console')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 shadow-xs"
              >
                <span className="material-symbols-outlined text-xl">dashboard</span>
                <span>Tableau de bord</span>
              </button>

              <button
                onClick={() => setCurrentView('admin_console')}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl">local_shipping</span>
                  <span>Supervision Courses</span>
                </div>
                <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-bold">28</span>
              </button>

              <button
                onClick={() => setCurrentView('admin_console')}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl">groups</span>
                  <span>Utilisateurs</span>
                </div>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">4 KYC</span>
              </button>

              <button
                onClick={() => setCurrentView('admin_console')}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl text-red-500">warning</span>
                  <span>Litiges &amp; Support</span>
                </div>
                <span className="px-1.5 py-0.2 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">2</span>
              </button>
            </>
          )}
        </nav>
      </div>

      {/* Footer Navigation Tabs (Help, Logout, Profile preview) */}
      <div className="p-4 border-t border-slate-200 space-y-2">
        <button
          onClick={openTestModal}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold transition-colors border border-amber-200/80 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-amber-600">science</span>
            <span>Suite de Tests &amp; Profils</span>
          </div>
          <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-extrabold">7</span>
        </button>
        <button
          onClick={() => showToast('Centre d\'assistance LivraLink 24/7 disponible au 01 02 03 04', 'info')}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-50 text-xs font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-lg">help</span>
          <span>Centre d'aide</span>
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-600 text-xs font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-lg">logout</span>
          <span>Déconnexion</span>
        </button>

        {/* Profile Card */}
        <div className="mt-2 pt-3 border-t border-slate-200 flex items-center gap-3 px-2">
          <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs border border-blue-200 shrink-0">
            {currentRole === 'vendeur' ? 'GC' : currentRole === 'livreur' ? 'DK' : 'AD'}
          </div>
          <div className="overflow-hidden min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">
              {currentRole === 'vendeur'
                ? merchantSettings.storeName
                : currentRole === 'livreur'
                ? courierSettings.fullName
                : 'Super Admin CI'}
            </p>
            <p className="text-[10px] font-bold text-emerald-600 truncate">
              {currentRole === 'vendeur' ? 'Vendeur Certifié' : currentRole === 'livreur' ? 'Livreur ★ 4.9' : 'Superviseur National'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};
