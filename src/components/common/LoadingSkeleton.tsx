import React from 'react';

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="space-y-3 w-full">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-3 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 bg-slate-200 rounded-md w-28"></div>
            <div className="h-4 bg-slate-200 rounded-full w-16"></div>
          </div>
          <div className="space-y-1.5">
            <div className="h-3.5 bg-slate-100 rounded-md w-3/4"></div>
            <div className="h-3.5 bg-slate-100 rounded-md w-1/2"></div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="h-3 bg-slate-200 rounded-md w-20"></div>
            <div className="h-7 bg-slate-200 rounded-lg w-24"></div>
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
    <div className="w-full bg-white rounded-2xl border border-slate-200 overflow-hidden animate-pulse">
      <div className="h-10 bg-slate-100 border-b border-slate-200 flex items-center px-4 gap-4">
        {Array.from({ length: columns }).map((_, idx) => (
          <div key={idx} className="h-3 bg-slate-300 rounded-md flex-1"></div>
        ))}
      </div>
      <div className="divide-y divide-slate-100 p-2">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="h-12 flex items-center px-4 gap-4">
            {Array.from({ length: columns }).map((_, cIdx) => (
              <div
                key={cIdx}
                className="h-3 bg-slate-200 rounded-md flex-1"
                style={{ opacity: 1 - cIdx * 0.1 }}
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
    <div className="flex-1 flex flex-col items-center justify-center min-h-[350px] p-6 text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs animate-bounce">
        <span className="material-symbols-outlined text-2xl">local_shipping</span>
      </div>
      <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
        <span className="w-4 h-4 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></span>
        <span>{label}</span>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-400">Optimisation ultra-rapide du chargement...</p>
    </div>
  );
};
