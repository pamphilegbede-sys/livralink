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
    courierSettings,
    toggleCourierAvailability,
    showToast,
    logout,
    isDarkMode,
    toggleDarkMode,
    openEmailCenter,
    notifications,
    openNotificationCenter,
  } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <>
      <header className="h-16 md:h-[72px] bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-3 md:px-8 flex justify-between items-center shrink-0 z-20 shadow-xs transition-colors">
        {/* Left Cluster: Mobile Drawer Trigger + Breadcrumbs / Title */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 min-w-0">

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 rounded-xl text-slate-600 hover:bg-slate-100 active:scale-95 shrink-0"
            title="Menu de navigation"
            aria-label="Menu de navigation"
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

        {/* Right Cluster: Store / Driver Status, Icons, New Delivery CTA */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Status Badge */}
          {currentRole === 'vendeur' && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Brouillon synchronisé</span>
            </div>
          )}

          {/* Store badge for Vendor */}
          {currentRole === 'vendeur' && (
            <div className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-blue-50 text-blue-800 border border-blue-100 text-[11px] sm:text-xs font-bold shadow-xs">
              <span className="material-symbols-outlined text-sm sm:text-base text-blue-600">storefront</span>
              <span className="truncate max-w-[100px] sm:max-w-none">{merchantSettings.storeName}</span>
            </div>
          )}

          {/* Courier Online Toggle for Courier */}
          {currentRole === 'livreur' && (
            <button
              onClick={toggleCourierAvailability}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-bold transition-all shadow-xs active:scale-95 ${
                courierSettings.isAvailable
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                  : 'bg-slate-200 text-slate-700 border border-slate-300 hover:bg-slate-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${courierSettings.isAvailable ? 'bg-emerald-600 animate-ping' : 'bg-slate-500'}`}></span>
              <span>{courierSettings.isAvailable ? 'En ligne' : 'En pause'}</span>
            </button>
          )}

          {/* Action icons */}
          <div className="flex items-center gap-0.5">
            {/* Quick Dark Mode Toggle */}
            <button
              type="button"
              onClick={toggleDarkMode}
              className="p-1.5 sm:p-2 rounded-xl text-slate-500 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isDarkMode ? 'Basculer en mode clair' : 'Basculer en mode sombre'}
              aria-label="Basculer le thème visuel"
            >
              <span className="material-symbols-outlined text-lg sm:text-xl">
                {isDarkMode ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <button
              onClick={openEmailCenter}
              className="p-1.5 sm:p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors relative"
              title="Centre des e-mails envoyés (Bienvenue, Codes, Sécurité)"
              aria-label="Centre d'e-mails"
            >
              <span className="material-symbols-outlined text-lg sm:text-xl">mail</span>
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            </button>
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
            <button
              onClick={() => setCurrentView(currentRole === 'vendeur' ? 'vendeur_settings' : 'livreur_settings')}
              className="p-1.5 sm:p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              title="Paramètres"
            >
              <span className="material-symbols-outlined text-lg sm:text-xl">tune</span>
            </button>
          </div>

          {/* New Delivery CTA for Vendor */}
          {currentRole === 'vendeur' && currentView !== 'vendeur_new_delivery' && (
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
        <div className="fixed inset-0 z-50 md:hidden bg-slate-900/60 backdrop-blur-xs flex" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col justify-between p-5" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <LivraLinkLogo size="sm" subtitle="MENU RAPIDE" />
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>

              <div className="space-y-1">
                {currentRole === 'vendeur' && (
                  <>
                    <button
                      onClick={() => { setCurrentView('vendeur_dashboard'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'vendeur_dashboard' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
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
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'vendeur_tracking' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="material-symbols-outlined text-lg">local_shipping</span>
                      <span>Suivi des Livraisons</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('vendeur_reports'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'vendeur_reports' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="material-symbols-outlined text-lg">insights</span>
                      <span>Rapports &amp; Statistiques</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('vendeur_settings'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'vendeur_settings' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="material-symbols-outlined text-lg">settings</span>
                      <span>Paramètres Vendeur</span>
                    </button>
                    <div className="pt-2 mt-2 border-t border-slate-100">
                      <button
                        onClick={async () => {
                          setIsMobileMenuOpen(false);
                          await logout();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50"
                      >
                        <span className="material-symbols-outlined text-lg">logout</span>
                        <span>Déconnexion</span>
                      </button>
                    </div>
                  </>
                )}

                {currentRole === 'livreur' && (
                  <>
                    <button
                      onClick={() => { setCurrentView('livreur_dashboard'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'livreur_dashboard' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="material-symbols-outlined text-lg">dashboard</span>
                      <span>Tableau de bord Livreur</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('livreur_missions'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'livreur_missions' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="material-symbols-outlined text-lg">two_wheeler</span>
                      <span>Missions Disponibles</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('livreur_wallet'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'livreur_wallet' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
                      <span>Portefeuille (0% MVP)</span>
                    </button>
                    <button
                      onClick={() => { setCurrentView('livreur_settings'); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${currentView === 'livreur_settings' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="material-symbols-outlined text-lg">settings</span>
                      <span>Paramètres Livreur</span>
                    </button>
                    <div className="pt-2 mt-2 border-t border-slate-100">
                      <button
                        onClick={async () => {
                          setIsMobileMenuOpen(false);
                          await logout();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50"
                      >
                        <span className="material-symbols-outlined text-lg">logout</span>
                        <span>Déconnexion</span>
                      </button>
                    </div>
                  </>
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
