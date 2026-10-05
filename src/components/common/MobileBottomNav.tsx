import React from 'react';
import { useApp } from '../../context/AppContext';

export const MobileBottomNav: React.FC = () => {
  const { currentView, setCurrentView, currentRole } = useApp();

  if (currentRole === 'admin') {
    return (
      <nav
        aria-label="Navigation principale mobile Admin"
        className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 text-white backdrop-blur-md border-t border-slate-700 md:hidden pb-safe shadow-lg"
      >
        <div className="max-w-md mx-auto grid grid-cols-5 h-14 text-center">
          <button
            onClick={() => setCurrentView('admin_console')}
            className={`flex flex-col items-center justify-center py-1 transition-colors ${
              currentView === 'admin_console' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">dashboard</span>
            <span className="text-[10px] mt-0.5">Admin</span>
          </button>

          <button
            onClick={() => setCurrentView('vendeur_dashboard')}
            className="flex flex-col items-center justify-center py-1 text-slate-400 hover:text-white"
            title="Voir vue Vendeur"
          >
            <span className="material-symbols-outlined text-[20px]">storefront</span>
            <span className="text-[10px] mt-0.5">Vendeur</span>
          </button>

          <button
            onClick={() => setCurrentView('admin_console')}
            className="flex flex-col items-center justify-center text-amber-400 py-1 transition-transform active:scale-95"
          >
            <div className="w-10 h-10 -mt-4 rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 flex items-center justify-center shadow-lg ring-4 ring-slate-900 font-bold">
              <span>👑</span>
            </div>
            <span className="text-[10px] font-bold mt-0.5 text-amber-400">Hub</span>
          </button>

          <button
            onClick={() => setCurrentView('livreur_dashboard')}
            className="flex flex-col items-center justify-center py-1 text-slate-400 hover:text-white"
            title="Voir vue Livreur"
          >
            <span className="material-symbols-outlined text-[20px]">two_wheeler</span>
            <span className="text-[10px] mt-0.5">Livreur</span>
          </button>

          <button
            onClick={() => setCurrentView('landing')}
            className="flex flex-col items-center justify-center py-1 text-slate-400 hover:text-white"
            title="Accueil"
          >
            <span className="material-symbols-outlined text-[20px]">home</span>
            <span className="text-[10px] mt-0.5">Vitrine</span>
          </button>
        </div>
      </nav>
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
              {currentRole === 'vendeur' ? '14' : '2'}
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
