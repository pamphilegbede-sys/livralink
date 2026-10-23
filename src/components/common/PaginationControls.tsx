import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export const PaginationControls: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  className = '',
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  if (totalPages <= 1) {
    return null; // Don't show pagination if all items fit on one page
  }

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2.5 bg-slate-50 border-t border-slate-100 rounded-b-2xl text-xs text-slate-600 ${className}`}
    >
      <div className="text-[11px] font-medium text-slate-500">
        Affichage de <span className="font-bold text-slate-800">{startItem}</span> à{' '}
        <span className="font-bold text-slate-800">{endItem}</span> sur{' '}
        <span className="font-bold text-slate-800">{totalItems}</span> éléments
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-700 transition-colors flex items-center gap-1 shadow-2xs"
          title="Page précédente"
        >
          <span className="material-symbols-outlined text-sm">chevron_left</span>
          <span className="hidden sm:inline">Précédent</span>
        </button>

        <span className="px-2 font-bold text-[11px] text-slate-800">
          Page {currentPage} / {totalPages}
        </span>

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-700 transition-colors flex items-center gap-1 shadow-2xs"
          title="Page suivante"
        >
          <span className="hidden sm:inline">Suivant</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
      </div>
    </div>
  );
};
