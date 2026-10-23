import React from 'react';
import { useApp } from '../../context/AppContext';
import { LivraLinkLogo } from './LivraLinkLogo';

export const Sidebar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    currentRole,
    setCurrentRole,
    merchantSettings,
    courierSettings,
    showToast,
    logout,
    openTestModal,
    adminActiveTab,
    setAdminActiveTab,
    deliveries,
    couriers,
    merchants,
    kycRequests
  } = useApp();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <aside className="hidden md:flex flex-col justify-between h-screen w-64 bg-white border-r border-slate-200 shadow-sm z-30 shrink-0 select-none sticky top-0">
      {/* Top Part: Logo, CTA, Navigation (Scrollable) */}
      <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar">
        {/* Brand Logo & Switcher */}
        <div className="flex items-center justify-between px-2 py-3 mb-4">
          <button
            type="button"
            onClick={() => setCurrentView('landing')}
            className="inline-flex items-center group text-left transition-transform active:scale-95"
            title="Retour à l'accueil LivraLink"
          >
            <LivraLinkLogo size="md" subtitle="CONNECT & DELIVER" />
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
            <span className="text-[10px] font-bold text-blue-700">Cotonou Littoral</span>
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

              {/* Bouton Déconnexion dans la barre latérale Vendeur */}
              <div className="pt-2 mt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all active:scale-95 group"
                  title="Déconnexion de votre espace vendeur"
                >
                  <span className="material-symbols-outlined text-xl text-red-500 group-hover:translate-x-0.5 transition-transform">logout</span>
                  <span>Déconnexion</span>
                </button>
              </div>
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

              {/* Bouton Déconnexion dans la barre latérale Livreur */}
              <div className="pt-2 mt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all active:scale-95 group"
                  title="Déconnexion de votre espace coursier"
                >
                  <span className="material-symbols-outlined text-xl text-red-500 group-hover:translate-x-0.5 transition-transform">logout</span>
                  <span>Déconnexion</span>
                </button>
              </div>
            </>
          )}

          {/* ADMIN TABS */}
          {currentRole === 'admin' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                  setAdminActiveTab('overview');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all ${
                  currentView === 'admin_console' && adminActiveTab === 'overview'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                }`}
              >
                <span className="material-symbols-outlined text-xl">dashboard</span>
                <span>Tableau de bord</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                  setAdminActiveTab('deliveries');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all ${
                  currentView === 'admin_console' && adminActiveTab === 'deliveries'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl">local_shipping</span>
                  <span>Supervision Courses</span>
                </div>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  currentView === 'admin_console' && adminActiveTab === 'deliveries'
                    ? 'bg-white text-blue-700'
                    : 'bg-blue-600 text-white'
                }`}>
                  {deliveries.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                  setAdminActiveTab('users');
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all ${
                  currentView === 'admin_console' && adminActiveTab === 'users'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl">group</span>
                  <span>Utilisateurs ({couriers.length + merchants.length})</span>
                </div>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  currentView === 'admin_console' && adminActiveTab === 'users'
                    ? 'bg-white text-blue-700'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  Tous
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                  setAdminActiveTab('kyc');
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all ${
                  currentView === 'admin_console' && adminActiveTab === 'kyc'
                    ? 'bg-amber-600 text-white font-bold shadow-xs'
                    : 'text-amber-800 hover:bg-amber-50 hover:text-amber-950 font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl">verified_user</span>
                  <span>Vérifications KYC</span>
                </div>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  currentView === 'admin_console' && adminActiveTab === 'kyc'
                    ? 'bg-white text-amber-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {kycRequests.filter(k => k.status === 'en_attente').length} En attente
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                  setAdminActiveTab('couriers');
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all ${
                  currentView === 'admin_console' && adminActiveTab === 'couriers'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl">two_wheeler</span>
                  <span>Flotte Livreurs</span>
                </div>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  currentView === 'admin_console' && adminActiveTab === 'couriers'
                    ? 'bg-white text-blue-700'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {couriers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                  setAdminActiveTab('merchants');
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all ${
                  currentView === 'admin_console' && adminActiveTab === 'merchants'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl">storefront</span>
                  <span>Boutiques Vendeurs</span>
                </div>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  currentView === 'admin_console' && adminActiveTab === 'merchants'
                    ? 'bg-white text-blue-700'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {merchants.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                  setAdminActiveTab('disputes');
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all ${
                  currentView === 'admin_console' && adminActiveTab === 'disputes'
                    ? 'bg-red-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-xl text-red-500">warning</span>
                  <span>Litiges &amp; Support</span>
                </div>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  currentView === 'admin_console' && adminActiveTab === 'disputes'
                    ? 'bg-white text-red-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {deliveries.filter(d => d.status === 'echec').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                  setAdminActiveTab('pricing');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all ${
                  currentView === 'admin_console' && adminActiveTab === 'pricing'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                }`}
              >
                <span className="material-symbols-outlined text-xl">tune</span>
                <span>Tarifs &amp; Commissions</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                  setAdminActiveTab('tests');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all ${
                  currentView === 'admin_console' && adminActiveTab === 'tests'
                    ? 'bg-indigo-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                }`}
              >
                <span className="material-symbols-outlined text-xl text-indigo-600">science</span>
                <span>Tests &amp; Validations</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                  setAdminActiveTab('audit');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all ${
                  currentView === 'admin_console' && adminActiveTab === 'audit'
                    ? 'bg-slate-800 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                }`}
              >
                <span className="material-symbols-outlined text-xl">history</span>
                <span>Journal d'Audit</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                  setAdminActiveTab('security');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all ${
                  currentView === 'admin_console' && adminActiveTab === 'security'
                    ? 'bg-amber-600 text-white font-bold shadow-xs'
                    : 'text-amber-800 hover:bg-amber-50 hover:text-amber-950 font-medium'
                }`}
              >
                <span className="material-symbols-outlined text-xl text-amber-600">shield_person</span>
                <span>Whitelist &amp; Sécurité</span>
              </button>
            </>
          )}
        </nav>
      </div>

      {/* Footer Navigation Tabs (Help, Logout, Profile preview) - Always Pinned */}
      <div className="p-4 border-t border-slate-200 space-y-2 shrink-0 bg-white">
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
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-red-600 hover:bg-red-600 hover:text-white text-xs font-bold transition-all border border-red-200 bg-red-50/60 shadow-2xs active:scale-95 group cursor-pointer"
          title="Se déconnecter de la session"
        >
          <span className="material-symbols-outlined text-lg group-hover:-translate-x-0.5 transition-transform">logout</span>
          <span>Se déconnecter</span>
        </button>

        {/* Profile Card */}
        {(() => {
          const courierInitials = (courierSettings.fullName || 'Awa Véloce')
            .split(' ')
            .map((n) => n[0])
            .filter(Boolean)
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'AV';

          const vendorInitials = (merchantSettings.storeName || 'Boutique')
            .split(' ')
            .map((n) => n[0])
            .filter(Boolean)
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'BT';

          return (
            <div className="mt-2 pt-3 border-t border-slate-200 flex items-center gap-3 px-2">
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs border border-blue-200 shrink-0">
                {currentRole === 'vendeur' ? vendorInitials : currentRole === 'livreur' ? courierInitials : 'AD'}
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
          );
        })()}
      </div>
    </aside>
  );
};
