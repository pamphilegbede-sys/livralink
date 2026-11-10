import React from 'react';
import { useVersionUpdate } from '../../hooks/useVersionUpdate';

export const UpdateNotificationBanner: React.FC = () => {
  const { isUpdateAvailable, isUpdating, latestVersionInfo, applyUpdate, dismissUpdate } = useVersionUpdate();

  if (!isUpdateAvailable) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-[9999] max-w-sm sm:max-w-md w-[calc(100%-2rem)] animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="bg-slate-900/95 backdrop-blur-md border border-blue-500/40 text-white rounded-2xl p-4 sm:p-5 shadow-2xl ring-1 ring-white/10 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <span className="material-symbols-outlined text-xl animate-pulse">
              published_with_changes
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
                Mise à jour disponible
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Nouvelle version
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              Une nouvelle version de LivraLink est prête. Vos sessions et données sont entièrement préservées.
              {latestVersionInfo?.buildTime && (
                <span className="block text-[10px] text-slate-400 mt-0.5">
                  Publiée le {new Date(latestVersionInfo.buildTime).toLocaleDateString('fr-FR')} à {new Date(latestVersionInfo.buildTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={dismissUpdate}
            title="Ignorer pour le moment"
            aria-label="Fermer la notification de mise à jour"
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-lg leading-none">close</span>
          </button>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1 border-t border-slate-800/80">
          <button
            type="button"
            onClick={dismissUpdate}
            disabled={isUpdating}
            className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition-colors hover:bg-slate-800/60"
          >
            Plus tard
          </button>

          <button
            type="button"
            onClick={applyUpdate}
            disabled={isUpdating}
            className="px-4 py-2 text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl shadow-md shadow-blue-900/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {isUpdating ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                <span>Actualisation...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">refresh</span>
                <span>Actualiser maintenant</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
