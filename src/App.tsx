import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Toast } from './components/common/Toast';
import { PODValidationModal } from './components/modals/PODValidationModal';
import { WhatsAppPreviewModal } from './components/modals/WhatsAppPreviewModal';
import { UrgentMissionModal } from './components/modals/UrgentMissionModal';
import { FirebaseTestModal } from './components/modals/FirebaseTestModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { FullViewSkeleton } from './components/common/LoadingSkeleton';
import { AdminDirectorFloatingBanner } from './components/common/AdminDirectorFloatingBanner';
import { PlatformBroadcastBanner } from './components/common/PlatformBroadcastBanner';

// Views
import { LandingPage } from './components/views/LandingPage';
import { LoginVendeurPage } from './components/views/LoginVendeurPage';
import { LoginLivreurPage } from './components/views/LoginLivreurPage';
import { RegisterPage } from './components/views/RegisterPage';
import { VendeurDashboard } from './components/views/VendeurDashboard';
import { VendeurNewDelivery } from './components/views/VendeurNewDelivery';
import { VendeurTracking } from './components/views/VendeurTracking';
import { VendeurReports } from './components/views/VendeurReports';
import { VendeurSettings } from './components/views/VendeurSettings';
import { LivreurDashboard } from './components/views/LivreurDashboard';
import { LivreurMissions } from './components/views/LivreurMissions';
import { LivreurWallet } from './components/views/LivreurWallet';
import { LivreurSettings } from './components/views/LivreurSettings';
import { AdminConsole } from './components/views/AdminConsole';

const MainAppRouter: React.FC = () => {
  const { currentView, isAuthLoading, isTestModalOpen, closeTestModal, isDarkMode } = useApp();
  const [deviceMode, setDeviceMode] = useState<'responsive' | 'mobile-mock'>('responsive');

  const renderActiveView = () => {
    if (isAuthLoading) {
      return <FullViewSkeleton label="Vérification de session sécurisée..." />;
    }

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
  };

  return (
    <div className={`flex flex-col min-h-screen w-full bg-[#f8fafc] dark:bg-slate-950 text-[#131b2e] dark:text-slate-100 antialiased transition-colors duration-200 ${isDarkMode ? 'dark' : ''}`}>
      {/* Global Toast */}
      <Toast />

      {/* Admin Director Mode Sticky Banner */}
      <AdminDirectorFloatingBanner />

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

      {/* Global Modals */}
      <PODValidationModal />
      <WhatsAppPreviewModal />
      <UrgentMissionModal />
      <FirebaseTestModal isOpen={isTestModalOpen} onClose={closeTestModal} />
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
