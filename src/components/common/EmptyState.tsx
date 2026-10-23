import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'inbox',
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = '',
}) => {
  return (
    <div
      className={`p-8 sm:p-12 text-center bg-white rounded-3xl border border-dashed border-slate-200/90 shadow-2xs flex flex-col items-center justify-center max-w-lg mx-auto my-4 space-y-4 ${className}`}
    >
      <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shadow-2xs">
        <span className="material-symbols-outlined text-3xl">{icon}</span>
      </div>

      <div className="space-y-1">
        <h3 className="text-base font-bold text-slate-800 tracking-tight">{title}</h3>
        <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">{description}</p>
      </div>

      {(actionLabel || secondaryActionLabel) && (
        <div className="flex items-center gap-2.5 pt-2 flex-wrap justify-center">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              <span>{actionLabel}</span>
            </button>
          )}

          {secondaryActionLabel && onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="min-h-[44px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              <span>{secondaryActionLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
