import React from 'react';

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="space-y-3 w-full" aria-busy="true" aria-label="Chargement des cartes">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-28"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-full w-16"></div>
          </div>
          <div className="space-y-1.5">
            <div className="h-3.5 bg-slate-100 dark:bg-slate-800/70 rounded-md w-3/4"></div>
            <div className="h-3.5 bg-slate-100 dark:bg-slate-800/70 rounded-md w-1/2"></div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-20"></div>
            <div className="h-7 bg-slate-200 dark:bg-slate-800 rounded-lg w-24"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 6,
}) => {
  return (
    <div
      className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-pulse"
      aria-busy="true"
      aria-label="Chargement du tableau"
    >
      <div className="h-10 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 gap-4">
        {Array.from({ length: columns }).map((_, idx) => (
          <div key={idx} className="h-3 bg-slate-300 dark:bg-slate-700 rounded-md flex-1"></div>
        ))}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800 p-2">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="h-12 flex items-center px-4 gap-4">
            {Array.from({ length: columns }).map((_, cIdx) => (
              <div
                key={cIdx}
                className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md flex-1"
                style={{ opacity: Math.max(0.35, 1 - cIdx * 0.1) }}
              ></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const FullViewSkeleton: React.FC<{ label?: string }> = ({ label = 'Chargement en cours...' }) => {
  return (
    <div
      className="flex-1 flex flex-col min-h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 p-4 md:p-8 max-w-7xl mx-auto space-y-6"
      aria-busy="true"
      aria-label={label}
    >
      {/* Top Header Skeleton matching dashboard header geometry */}
      <div className="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <span className="material-symbols-outlined text-xl">local_shipping</span>
          </div>
          <div className="space-y-2">
            <div className="h-4 w-44 sm:w-56 bg-slate-200 dark:bg-slate-800 rounded-md"></div>
            <div className="h-3 w-28 sm:w-40 bg-slate-100 dark:bg-slate-800/70 rounded-md"></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:inline">{label}</span>
          <div className="h-9 w-28 bg-blue-600/20 dark:bg-blue-500/20 rounded-xl"></div>
        </div>
      </div>

      {/* KPI Cards Strip Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5"
          >
            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div>
            <div className="h-6 w-24 bg-slate-300 dark:bg-slate-700 rounded"></div>
            <div className="h-2.5 w-16 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
          </div>
        ))}
      </div>

      {/* Content Area Skeleton (Table on md+, Cards on mobile) */}
      <div className="hidden md:block">
        <TableSkeleton rows={6} columns={5} />
      </div>
      <div className="md:hidden">
        <CardSkeleton count={3} />
      </div>
    </div>
  );
};
