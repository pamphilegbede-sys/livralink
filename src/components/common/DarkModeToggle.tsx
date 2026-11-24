import React from 'react';
import { useApp } from '../../context/AppContext';

export const DarkModeToggle: React.FC<{
  title?: string;
  subtitle?: string;
  className?: string;
  compact?: boolean;
}> = ({
  title = "Thème Visuel & Apparence",
  subtitle = "Sélectionnez votre mode d'affichage ou adaptez automatiquement l'application aux paramètres de votre téléphone / ordinateur.",
  className = "",
  compact = false
}) => {
  const { isDarkMode, themeMode, systemTheme, setThemeMode } = useApp();
  const resolvedSystemLabel = systemTheme === 'dark' ? 'Sombre' : 'Clair';
  const isManualOverride = themeMode !== 'system';

  if (compact) {
    return (
      <div
        data-testid="theme-switcher-compact"
        className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 transition-colors ${className}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-100 text-amber-600'}`}>
            <span className="material-symbols-outlined text-lg">
              {themeMode === 'system' ? 'desktop_windows' : isDarkMode ? 'dark_mode' : 'light_mode'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
              {themeMode === 'system'
                ? 'Thème Système (Auto)'
                : isDarkMode
                ? 'Surcharge manuelle : Sombre'
                : 'Surcharge manuelle : Clair'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {themeMode === 'system'
                ? `Détection auto active (${resolvedSystemLabel})`
                : `Remplace le thème système (${resolvedSystemLabel})`}
            </p>
          </div>
        </div>

        {/* 3-Segment Switch: Light / Dark / System */}
        <div
          role="group"
          aria-label="Sélecteur manuel de thème (Clair, Sombre, Système)"
          className="flex items-center p-1 rounded-xl bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 shrink-0"
        >
          <button
            type="button"
            data-theme-option="light"
            aria-pressed={themeMode === 'light'}
            onClick={() => setThemeMode('light')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              themeMode === 'light'
                ? 'bg-white text-amber-600 shadow-xs dark:bg-slate-800 dark:text-amber-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
            title="Forcer le thème Clair"
          >
            <span>☀️</span>
            <span>Clair</span>
          </button>
          <button
            type="button"
            data-theme-option="dark"
            aria-pressed={themeMode === 'dark'}
            onClick={() => setThemeMode('dark')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              themeMode === 'dark'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
            title="Forcer le thème Sombre"
          >
            <span>🌙</span>
            <span>Sombre</span>
          </button>
          <button
            type="button"
            data-theme-option="system"
            aria-pressed={themeMode === 'system'}
            onClick={() => setThemeMode('system')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              themeMode === 'system'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
            title={`Suivre la préférence système (${resolvedSystemLabel})`}
          >
            <span>💻</span>
            <span>Système</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      data-testid="theme-switcher-full"
      className={`bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors duration-200 space-y-5 ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-100 text-amber-600'}`}>
            <span className="material-symbols-outlined text-lg">
              {themeMode === 'system' ? 'desktop_windows' : isDarkMode ? 'dark_mode' : 'palette'}
            </span>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
              <span>{title}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                themeMode === 'system'
                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                  : isDarkMode
                  ? 'bg-indigo-950 text-indigo-300 border border-indigo-700/50'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {themeMode === 'system'
                  ? `💻 Système (Auto · ${resolvedSystemLabel})`
                  : isDarkMode
                  ? '🌙 Surcharge manuelle : Sombre'
                  : '☀️ Surcharge manuelle : Clair'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Active status indicator & quick reset to System */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
            Mode effectif :
          </span>
          <span className={`px-2.5 py-1 rounded-xl text-xs font-bold ${isDarkMode ? 'bg-slate-800 text-indigo-300 border border-slate-700' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
            {isDarkMode ? '🌙 Sombre (#090d16)' : '☀️ Clair (#faf8ff)'}
          </span>
          {isManualOverride && (
            <button
              type="button"
              onClick={() => setThemeMode('system')}
              className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 cursor-pointer transition-colors"
            >
              Revenir en Auto
            </button>
          )}
        </div>
      </div>

      {/* 3 Interactive Selection Cards: Light, Dark, System */}
      <div role="group" aria-label="Choix du thème (Clair, Sombre, Système)" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 1. Light Mode Card */}
        <button
          type="button"
          data-theme-option="light"
          aria-pressed={themeMode === 'light'}
          onClick={() => setThemeMode('light')}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 cursor-pointer active:scale-98 ${
            themeMode === 'light'
              ? 'border-2 border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 shadow-sm ring-2 ring-amber-500/20'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className="text-xl">☀️</span>
              <span className="font-bold text-sm text-slate-900 dark:text-white">Thème Clair</span>
            </div>
            {themeMode === 'light' && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-xs font-bold">check</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Arrière-plan lumineux (#faf8ff), contraste classique et lecture optimale en journée.
          </p>
          <div className="h-7 w-full rounded-lg bg-white border border-slate-200 flex items-center px-2 gap-1.5 shadow-2xs">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
            <div className="h-2 w-14 bg-slate-200 rounded"></div>
            <div className="h-2 w-6 bg-slate-100 rounded ml-auto"></div>
          </div>
        </button>

        {/* 2. Dark Mode Card */}
        <button
          type="button"
          data-theme-option="dark"
          aria-pressed={themeMode === 'dark'}
          onClick={() => setThemeMode('dark')}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 cursor-pointer active:scale-98 ${
            themeMode === 'dark'
              ? 'border-2 border-indigo-500 bg-indigo-950/30 dark:bg-indigo-950/50 shadow-sm ring-2 ring-indigo-500/20'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌙</span>
              <span className="font-bold text-sm text-slate-900 dark:text-white">Thème Sombre</span>
            </div>
            {themeMode === 'dark' && (
              <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-xs font-bold">check</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Arrière-plan sombre (#090d16), repos oculaire optimal sur la route et économie d'énergie.
          </p>
          <div className="h-7 w-full rounded-lg bg-slate-950 border border-slate-800 flex items-center px-2 gap-1.5 shadow-2xs">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-400"></div>
            <div className="h-2 w-14 bg-slate-700 rounded"></div>
            <div className="h-2 w-6 bg-slate-800 rounded ml-auto"></div>
          </div>
        </button>

        {/* 3. System Mode Card */}
        <button
          type="button"
          data-theme-option="system"
          aria-pressed={themeMode === 'system'}
          onClick={() => setThemeMode('system')}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 cursor-pointer active:scale-98 ${
            themeMode === 'system'
              ? 'border-2 border-blue-500 bg-blue-50/40 dark:bg-blue-950/40 shadow-sm ring-2 ring-blue-500/20'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className="text-xl">💻</span>
              <span className="font-bold text-sm text-slate-900 dark:text-white">Système (Auto)</span>
            </div>
            {themeMode === 'system' && (
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-xs font-bold">check</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Suit automatiquement l&apos;appareil (actuellement détecté : <strong className="text-slate-700 dark:text-slate-200">{resolvedSystemLabel}</strong>).
          </p>
          <div className="h-7 w-full rounded-lg bg-gradient-to-r from-white to-slate-950 border border-slate-300 dark:border-slate-700 flex items-center px-2 gap-1.5 shadow-2xs">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
            <div className="h-2 w-14 bg-slate-400/80 rounded"></div>
            <div className="h-2 w-6 bg-slate-500 rounded ml-auto"></div>
          </div>
        </button>
      </div>
    </section>
  );
};
