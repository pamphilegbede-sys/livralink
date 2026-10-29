import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Toast } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { FullViewSkeleton } from './components/common/LoadingSkeleton';
import { PlatformBroadcastBanner } from './components/common/PlatformBroadcastBanner';
import { PriorityMissionNotificationBanner } from './components/common/PriorityMissionNotificationBanner';
import { LandingPage } from './components/views/LandingPage';

// Lazy-loaded Views for ultra-fast initial load & reduced bundle size
const LoginVendeurPage = React.lazy(() => import('./components/views/LoginVendeurPage').then(m => ({ default: m.LoginVendeurPage })));
const LoginLivreurPage = React.lazy(() => import('./components/views/LoginLivreurPage').then(m => ({ default: m.LoginLivreurPage })));
const RegisterPage = React.lazy(() => import('./components/views/RegisterPage').then(m => ({ default: m.RegisterPage })));
const VendeurDashboard = React.lazy(() => import('./components/views/VendeurDashboard').then(m => ({ default: m.VendeurDashboard })));
const VendeurNewDelivery = React.lazy(() => import('./components/views/VendeurNewDelivery').then(m => ({ default: m.VendeurNewDelivery })));
const VendeurTracking = React.lazy(() => import('./components/views/VendeurTracking').then(m => ({ default: m.VendeurTracking })));
const VendeurReports = React.lazy(() => import('./components/views/VendeurReports').then(m => ({ default: m.VendeurReports })));
const VendeurSettings = React.lazy(() => import('./components/views/VendeurSettings').then(m => ({ default: m.VendeurSettings })));
const LivreurDashboard = React.lazy(() => import('./components/views/LivreurDashboard').then(m => ({ default: m.LivreurDashboard })));
const LivreurMissions = React.lazy(() => import('./components/views/LivreurMissions').then(m => ({ default: m.LivreurMissions })));
const LivreurWallet = React.lazy(() => import('./components/views/LivreurWallet').then(m => ({ default: m.LivreurWallet })));
const LivreurSettings = React.lazy(() => import('./components/views/LivreurSettings').then(m => ({ default: m.LivreurSettings })));
const AdminConsole = React.lazy(() => import('./components/views/AdminConsole').then(m => ({ default: m.AdminConsole })));

// Lazy-loaded Modals
const PODValidationModal = React.lazy(() => import('./components/modals/PODValidationModal').then(m => ({ default: m.PODValidationModal })));
const WhatsAppPreviewModal = React.lazy(() => import('./components/modals/WhatsAppPreviewModal').then(m => ({ default: m.WhatsAppPreviewModal })));
const UrgentMissionModal = React.lazy(() => import('./components/modals/UrgentMissionModal').then(m => ({ default: m.UrgentMissionModal })));
const FirebaseTestModal = React.lazy(() => import('./components/modals/FirebaseTestModal').then(m => ({ default: m.FirebaseTestModal })));
const EmailNotificationCenterModal = React.lazy(() => import('./components/modals/EmailNotificationCenterModal').then(m => ({ default: m.EmailNotificationCenterModal })));
const NotificationCenterModal = React.lazy(() => import('./components/modals/NotificationCenterModal').then(m => ({ default: m.NotificationCenterModal })));

const MainAppRouter: React.FC = () => {
  const { 
    currentView, 
    setCurrentView,
    deliveries,
    setSelectedDelivery,
    acceptDelivery,
    isAuthLoading, 
    isTestModalOpen, 
    closeTestModal, 
    isDarkMode,
    priorityMissionAlert,
    dismissPriorityMissionAlert,
    isEmailCenterOpen,
    closeEmailCenter,
    isNotificationCenterOpen,
    closeNotificationCenter
  } = useApp();
  const [deviceMode, setDeviceMode] = useState<'responsive' | 'mobile-mock'>('responsive');

  const renderActiveView = () => {
    if (isAuthLoading) {
      return <FullViewSkeleton label="Vérification de session sécurisée..." />;
    }

    return (
      <React.Suspense fallback={<FullViewSkeleton label="Chargement instantané..." />}>
        {(() => {
          switch (currentView) {
            case 'landing':
              return <LandingPage />;
            case 'login_vendeur':
              return <LoginVendeurPage />;
            case 'login_livreur':
              return <LoginLivreurPage />;
            case 'register':
              return <RegisterPage />;
            case 'vendeur_dashboard':
              return <VendeurDashboard />;
            case 'vendeur_new_delivery':
              return <VendeurNewDelivery />;
            case 'vendeur_tracking':
              return <VendeurTracking />;
            case 'vendeur_reports':
              return <VendeurReports />;
            case 'vendeur_settings':
              return <VendeurSettings />;
            case 'livreur_dashboard':
              return <LivreurDashboard />;
            case 'livreur_missions':
              return <LivreurMissions />;
            case 'livreur_wallet':
              return <LivreurWallet />;
            case 'livreur_settings':
              return <LivreurSettings />;
            case 'admin_console':
              return <AdminConsole />;
            default:
              return <LandingPage />;
          }
        })()}
      </React.Suspense>
    );
  };

  return (
    <div className={`flex flex-col min-h-screen w-full bg-[#f8fafc] dark:bg-slate-950 text-[#131b2e] dark:text-slate-100 antialiased transition-colors duration-200 ${isDarkMode ? 'dark' : ''}`}>
      {/* Global Toast */}
      <Toast />

      {/* Platform Emergency / Official Broadcast Banner */}
      <PlatformBroadcastBanner />

      {/* View router with optional Mobile Simulator Frame */}
      {deviceMode === 'mobile-mock' ? (
        <div className="flex-1 bg-slate-900 py-6 sm:py-10 px-4 flex items-center justify-center overflow-y-auto">
          {/* Smartphone Frame */}
          <div className="relative w-full max-w-[400px] h-[860px] bg-white rounded-[44px] shadow-2xl ring-12 ring-slate-800 ring-offset-4 ring-offset-slate-950 overflow-hidden flex flex-col border border-slate-700">
            {/* Dynamic Island / Speaker Notch */}
            <div className="h-6 bg-white w-full flex items-center justify-between px-7 pt-2 shrink-0 select-none z-50 text-[11px] font-bold text-slate-800">
              <span>09:41</span>
              <div className="w-20 h-4 bg-slate-900 rounded-full flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="material-symbols-outlined text-[13px]">signal_cellular_4_bar</span>
                <span className="material-symbols-outlined text-[13px]">wifi</span>
                <span className="material-symbols-outlined text-[14px]">battery_full</span>
              </div>
            </div>

            {/* Simulated Phone Screen Viewport */}
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-[#faf8ff] relative">
              {renderActiveView()}
            </div>

            {/* Bottom Home Indicator Bar */}
            <div className="h-4 bg-white w-full flex items-center justify-center pb-1 shrink-0 z-50">
              <div className="w-32 h-1 bg-slate-400 rounded-full"></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 w-full">
          {renderActiveView()}
        </div>
      )}

      {/* Priority Mission Contextual Real-Time Alert Banner */}
      <PriorityMissionNotificationBanner
        alert={priorityMissionAlert}
        onDismiss={dismissPriorityMissionAlert}
        onAccept={(orderId) => {
          acceptDelivery(orderId);
          dismissPriorityMissionAlert();
        }}
        onViewDetails={(orderId) => {
          const ord = deliveries.find(d => d.id === orderId);
          if (ord) {
            setSelectedDelivery(ord);
          }
          setCurrentView('livreur_missions');
          dismissPriorityMissionAlert();
        }}
      />

      {/* Global Modals (Lazy-loaded with Suspense) */}
      <React.Suspense fallback={null}>
        <PODValidationModal />
        <WhatsAppPreviewModal />
        <UrgentMissionModal />
        {isTestModalOpen && <FirebaseTestModal isOpen={isTestModalOpen} onClose={closeTestModal} />}
        {isEmailCenterOpen && <EmailNotificationCenterModal isOpen={isEmailCenterOpen} onClose={closeEmailCenter} />}
        {isNotificationCenterOpen && <NotificationCenterModal isOpen={isNotificationCenterOpen} onClose={closeNotificationCenter} />}
      </React.Suspense>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MainAppRouter />
      </AppProvider>
    </ErrorBoundary>
  );
}
