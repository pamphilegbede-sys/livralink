import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { LivraLinkLogo } from './LivraLinkLogo';

export const Header: React.FC<{
  title?: string;
  subtitle?: string;
  showReturn?: boolean;
  breadcrumbs?: { label: string; view?: any }[];
  onReturn?: () => void;
}> = ({ title, subtitle, breadcrumbs }) => {
  const {
    currentRole,
    setCurrentRole,
    currentView,
    setCurrentView,
    merchantSettings,
    logout,
    openEmailCenter,
    notifications,
    openNotificationCenter,
    userProfile,
    isUserMasterAdmin,
    courierMissionsFilter,
    setCourierMissionsFilter,
  } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isUserSuperAdmin = isUserMasterAdmin;

  const effectiveNavRole: 'vendeur' | 'livreur' | 'admin' =
    currentView === 'admin_console'
      ? 'admin'
      : currentView.startsWith('vendeur_')
      ? 'vendeur'
      : currentView.startsWith('livreur_')
      ? 'livreur'
      : userProfile?.role === 'vendeur' || userProfile?.role === 'livreur'
      ? userProfile.role
      : currentRole;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shadow-md transition-all h-16 md:h-[72px] px-3 md:px-8 flex justify-between items-center shrink-0">
        {/* Left Cluster: Mobile Drawer Trigger + Breadcrumbs / Title */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 min-w-0">

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="sm:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 shrink-0 cursor-pointer shadow-2xs"
            title="Ouvrir le menu de navigation"
            aria-label="Ouvrir le menu de navigation"
          >
            <span className="material-symbols-outlined text-xl">menu</span>
          </button>

          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              {breadcrumbs.map((b, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="material-symbols-outlined text-xs text-slate-400">chevron_right</span>}
                  {b.view ? (
                    <button
                      onClick={() => setCurrentView(b.view)}
                      className="hover:text-blue-600 transition-colors"
                    >
                      {b.label}
                    </button>
                  ) : (
                    <span className={idx === breadcrumbs.length - 1 ? 'text-blue-700 font-bold' : ''}>
                      {b.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}

          {title && !breadcrumbs && (
            <div className="truncate">
              <h1 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-tight truncate">
                {title}
              </h1>
              {subtitle && <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate hidden xs:block">{subtitle}</p>}
            </div>
          )}
        </div>

        {/* Right Cluster: Store / Driver Status, Notifications, Email Center & New Delivery CTA */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Store badge for Vendor - Hidden on mobile screens to avoid title collision */}
          {effectiveNavRole === 'vendeur' && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-blue-900 text-xs font-bold shadow-2xs">
              <span className="material-symbols-outlined text-base text-blue-600 dark:text-blue-400">storefront</span>
              <span className="truncate max-w-[160px] lg:max-w-none">{merchantSettings.storeName}</span>
            </div>
          )}

          {/* Action icons (Chat, Email Center, Notifications) */}
          <div className="flex items-center gap-0.5">
            {effectiveNavRole !== 'admin' && (
              <button
                onClick={() => setCurrentView(effectiveNavRole === 'vendeur' ? 'vendeur_chat' : 'livreur_chat')}
                className="p-1.5 sm:p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors relative cursor-pointer active:scale-95"
                title="Messagerie Directe Chat Vendeur-Livreur"
                aria-label="Messagerie Directe"
              >
                <span className="material-symbols-outlined text-lg sm:text-xl">forum</span>
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </button>
            )}

            {effectiveNavRole === 'admin' && (
              <button
                onClick={openEmailCenter}
                className="p-1.5 sm:p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors relative cursor-pointer"
                title="Centre des e-mails envoyés (Bienvenue, Codes, Sécurité)"
                aria-label="Centre d'e-mails"
              >
                <span className="material-symbols-outlined text-lg sm:text-xl">mail</span>
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              </button>
            )}
            <button
              onClick={openNotificationCenter}
              className="p-1.5 sm:p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors relative cursor-pointer active:scale-95"
              title={`Centre de Notifications (${unreadCount} non lue${unreadCount > 1 ? 's' : ''})`}
              aria-label="Notifications"
            >
              <span className="material-symbols-outlined text-lg sm:text-xl">notifications</span>
              {unreadCount > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white font-extrabold text-[10px] flex items-center justify-center animate-pulse shadow-xs border-2 border-white dark:border-slate-900">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : null}
            </button>
          </div>

          {/* New Delivery CTA for Vendor */}
          {effectiveNavRole === 'vendeur' && currentView !== 'vendeur_new_delivery' && (
            <button
              onClick={() => setCurrentView('vendeur_new_delivery')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-base">add</span>
              <span>+ Nouvelle livraison</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 sm:hidden bg-slate-900/60 backdrop-blur-xs flex" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="w-4/5 max-w-xs bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col justify-between p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <LivraLinkLogo size="sm" subtitle="MENU RAPIDE" />
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>

              <div className="space-y-1">
                {effectiveNavRole === 'vendeur' && (
                  <>
                    <button
                      onClick={() => { setCurrentView('vendeur_dashboard'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'vendeur_dashboard' ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">dashboard</span>
                      <span>Tableau de bord</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('vendeur_new_delivery'); setIsMobileMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-sm active:scale-95 transition-transform"
                    >
                      <span className="material-symbols-outlined text-lg">add</span>
                      <span>+ Nouvelle livraison</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('vendeur_tracking'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'vendeur_tracking' ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">local_shipping</span>
                      <span>Mes Livraisons</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('vendeur_reports'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'vendeur_reports' ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">insights</span>
                      <span>Rapports &amp; Statistiques</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('vendeur_chat'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'vendeur_chat' ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">forum</span>
                      <span>Messagerie Chat</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('vendeur_settings'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'vendeur_settings' ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">settings</span>
                      <span>Paramètres Vendeur</span>
                    </button>
                  </>
                )}

                {effectiveNavRole === 'livreur' && (
                  <>
                    <button
                      onClick={() => { setCurrentView('livreur_dashboard'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'livreur_dashboard' ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">dashboard</span>
                      <span>Tableau de bord Livreur</span>
                    </button>
                    <button
                      onClick={() => {
                        setCourierMissionsFilter('en_attente');
                        setCurrentView('livreur_missions');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'livreur_missions' && (courierMissionsFilter === 'en_attente' || courierMissionsFilter === 'all') ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">two_wheeler</span>
                      <span>Missions disponibles</span>
                    </button>
                    <button
                      onClick={() => {
                        setCourierMissionsFilter('en_cours');
                        setCurrentView('livreur_missions');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'livreur_missions' && courierMissionsFilter === 'en_cours' ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">local_shipping</span>
                      <span>Mes livraisons</span>
                    </button>
                    <button
                      onClick={() => {
                        setCourierMissionsFilter('livree');
                        setCurrentView('livreur_missions');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'livreur_missions' && courierMissionsFilter === 'livree' ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">history</span>
                      <span>Historique</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('livreur_wallet'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'livreur_wallet' ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
                      <span>Portefeuille (0% MVP)</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('livreur_chat'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'livreur_chat' ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">forum</span>
                      <span>Messagerie Chat</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('livreur_settings'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'livreur_settings' ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <span className="material-symbols-outlined text-lg">settings</span>
                      <span>Paramètres Livreur</span>
                    </button>
                  </>
                )}
                {isUserSuperAdmin && (
                  <div className="pt-3 mt-3 border-t border-amber-200 dark:border-amber-900/40 space-y-1.5">
                    <p className="px-3 text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Accès Super-Admin</p>
                    {effectiveNavRole !== 'vendeur' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentRole('vendeur');
                          setCurrentView('vendeur_dashboard');
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200"
                      >
                        <span className="material-symbols-outlined text-base text-blue-600">storefront</span>
                        <span>Espace Vendeur</span>
                      </button>
                    )}
                    {effectiveNavRole !== 'livreur' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentRole('livreur');
                          setCurrentView('livreur_dashboard');
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-900 hover:bg-emerald-100 border border-emerald-200"
                      >
                        <span className="material-symbols-outlined text-base text-emerald-600">two_wheeler</span>
                        <span>Espace Livreur</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentRole('admin');
                        setCurrentView('admin_console');
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold ${
                        currentView === 'admin_console'
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">👑</span>
                        <span>Dashboard Admin</span>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <button
                onClick={async () => {
                  setIsMobileMenuOpen(false);
                  await logout();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200"
              >
                <span className="material-symbols-outlined text-base">logout</span>
                <span>Se déconnecter de LivraLink</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
