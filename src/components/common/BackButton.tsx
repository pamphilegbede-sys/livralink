import React from 'react';
import { useApp } from '../../context/AppContext';

export interface BackButtonProps {
  onClick?: () => void;
  label?: string;
  className?: string;
  variant?: 'default' | 'subtle' | 'compact' | 'light' | 'dark';
  showLabelOnMobile?: boolean;
}

/**
 * Standardized Retour (Back) Button for PC & Mobile
 * Defaults to AppContext.navigateBack() to return to the previous page in history.
 */
export const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  label = 'Retour',
  className = '',
  variant = 'default',
  showLabelOnMobile = true,
}) => {
  const { navigateBack } = useApp();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (onClick) {
      onClick();
    } else {
      navigateBack();
    }
  };

  const getVariantClasses = () => {
    switch (variant) {
      case 'subtle':
        return 'border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900';
      case 'light':
        return 'border border-slate-200 bg-white/95 hover:bg-white text-slate-800 hover:text-blue-600 shadow-2xs';
      case 'dark':
        return 'border border-slate-700 bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-amber-300 shadow-xs';
      case 'compact':
        return 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-600 p-1.5 sm:px-2.5 sm:py-1.5';
      case 'default':
      default:
        return 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 hover:text-blue-600 shadow-2xs';
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs transition-all active:scale-95 cursor-pointer shrink-0 select-none ${getVariantClasses()} ${className}`}
      title="Retour à la page précédente"
      aria-label="Retour à la page précédente"
    >
      <span className="material-symbols-outlined text-base">arrow_back</span>
      <span className={showLabelOnMobile ? 'font-bold' : 'hidden sm:inline font-bold'}>{label}</span>
    </button>
  );
};
