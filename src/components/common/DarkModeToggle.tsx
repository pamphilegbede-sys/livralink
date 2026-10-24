import React from 'react';
import { useApp } from '../../context/AppContext';

export const DarkModeToggle: React.FC<{
  title?: string;
  subtitle?: string;
  className?: string;
  compact?: boolean;
}> = ({
  title = "Thème Visuel & Mode Sombre",
  subtitle = "Basculez entre le mode clair et le mode sombre pour reposer vos yeux et préserver votre batterie.",
  className = "",
  compact = false
}) => {
  const { isDarkMode, toggleDarkMode, setIsDarkMode } = useApp();

  if (compact) {
    return (
      <div className={`flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 transition-colors ${className}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-100 text-amber-600'}`}>
            <span className="material-symbols-outlined text-lg">
              {isDarkMode ? 'dark_mode' : 'light_mode'}
            </span>
          </div>
          <div className="truncate">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
              {isDarkMode ? 'Mode Sombre Activé' : 'Mode Clair Activé'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              Couleurs globales synchronisées
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <button
          type="button"
          role="switch"
          aria-checked={isDarkMode}
          aria-label="Basculer le mode sombre"
          onClick={toggleDarkMode}
          className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full p-0.5 border border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
            isDarkMode ? 'bg-indigo-600' : 'bg-slate-300'
          }`}
        >
          <span
            className={`pointer-events-none inline-flex h-6 w-6 transform items-center justify-center rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out text-xs ${
              isDarkMode ? 'translate-x-6 bg-slate-900 text-amber-300' : 'translate-x-0 text-amber-500'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {isDarkMode ? 'dark_mode' : 'light_mode'}
            </span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <section className={`bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors duration-200 space-y-5 ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-100 text-amber-600'}`}>
            <span className="material-symbols-outlined text-lg">
              {isDarkMode ? 'dark_mode' : 'palette'}
            </span>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{title}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-indigo-950 text-indigo-300 border border-indigo-700/50' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {isDarkMode ? '🌙 Sombre' : '☀️ Clair'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Global Toggle Switch */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 hidden sm:inline">
            {isDarkMode ? 'Mode Sombre' : 'Mode Clair'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isDarkMode}
            aria-label="Basculer le mode sombre"
            onClick={toggleDarkMode}
            className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full p-0.5 border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
              isDarkMode ? 'bg-indigo-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-flex h-7 w-7 transform items-center justify-center rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out text-sm ${
                isDarkMode ? 'translate-x-6 bg-slate-900 text-amber-300' : 'translate-x-0 text-amber-500'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {isDarkMode ? 'dark_mode' : 'light_mode'}
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Two Interactive Selection Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Light Mode Card */}
        <button
          type="button"
          onClick={() => setIsDarkMode(false)}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 ${
            !isDarkMode
              ? 'border-2 border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 shadow-sm ring-2 ring-amber-500/20'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className="text-lg">☀️</span>
              <span className="font-bold text-sm text-slate-900 dark:text-white">Thème Clair</span>
            </div>
            {!isDarkMode && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-xs font-bold">check</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Arrière-plan lumineux (#faf8ff), contraste classique et lecture idéale en plein jour.
          </p>
          <div className="h-6 w-full rounded-lg bg-white border border-slate-200 flex items-center px-2 gap-1.5 shadow-2xs">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
            <div className="h-2 w-16 bg-slate-200 rounded"></div>
            <div className="h-2 w-8 bg-slate-100 rounded ml-auto"></div>
          </div>
        </button>

        {/* Dark Mode Card */}
        <button
          type="button"
          onClick={() => setIsDarkMode(true)}
          className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 ${
            isDarkMode
              ? 'border-2 border-indigo-500 bg-indigo-950/30 dark:bg-indigo-950/50 shadow-sm ring-2 ring-indigo-500/20'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌙</span>
              <span className="font-bold text-sm text-slate-900 dark:text-white">Thème Sombre</span>
            </div>
            {isDarkMode && (
              <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-xs">
                <span className="material-symbols-outlined text-xs font-bold">check</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Arrière-plan profond (#090d16), repos oculaire optimal pour les livraisons nocturnes et économie d'énergie.
          </p>
          <div className="h-6 w-full rounded-lg bg-slate-950 border border-slate-800 flex items-center px-2 gap-1.5 shadow-2xs">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-400"></div>
            <div className="h-2 w-16 bg-slate-700 rounded"></div>
            <div className="h-2 w-8 bg-slate-800 rounded ml-auto"></div>
          </div>
        </button>
      </div>
    </section>
  );
};
