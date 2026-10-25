import React from 'react';
import { useApp } from '../../context/AppContext';

export const PlatformBroadcastBanner: React.FC = () => {
  const { featureFlags, currentView } = useApp();

  if (!featureFlags.emergencyBroadcastActive || !featureFlags.emergencyBroadcastMessage) {
    return null;
  }

  // Do not show on landing page
  if (currentView === 'landing') return null;

  return (
    <aside aria-label="Alerte Générale Direction Admin" className="w-full bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 text-white px-4 py-2.5 text-xs font-['Plus_Jakarta_Sans'] shadow-md flex items-center justify-between gap-3 animate-fade-in border-b border-orange-400">
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0 animate-pulse text-amber-200">
            <span className="material-symbols-outlined text-base">campaign</span>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-[11px] uppercase tracking-wider bg-black/30 px-2 py-0.5 rounded-md">
                Diffusion Officielle Direction LivraLink
              </span>
            </div>
            <p className="text-xs font-bold text-white mt-0.5 leading-snug">
              {featureFlags.emergencyBroadcastMessage}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};
