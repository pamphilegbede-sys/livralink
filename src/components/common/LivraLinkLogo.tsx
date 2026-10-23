import React from 'react';

interface LivraLinkLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  subtitle?: string;
  variant?: 'dark' | 'light';
  showText?: boolean;
  className?: string;
}

export const LivraLinkLogo: React.FC<LivraLinkLogoProps> = ({
  size = 'md',
  subtitle = 'CONNECT & DELIVER',
  variant = 'light',
  showText = true,
  className = '',
}) => {
  const badgeClasses = {
    sm: 'w-7 h-7 rounded-lg',
    md: 'w-8 h-8 sm:w-9 sm:h-9 rounded-xl',
    lg: 'w-10 h-10 rounded-xl',
    xl: 'w-12 h-12 rounded-2xl',
  }[size];

  const iconSizes = {
    sm: 'text-base',
    md: 'text-xl sm:text-2xl',
    lg: 'text-2xl sm:text-3xl',
    xl: 'text-3xl sm:text-4xl',
  }[size];

  const titleSizes = {
    sm: 'text-sm',
    md: 'text-base sm:text-lg',
    lg: 'text-lg sm:text-xl',
    xl: 'text-2xl sm:text-3xl',
  }[size];

  const subSizes = {
    sm: 'text-[8px]',
    md: 'text-[9px]',
    lg: 'text-[10px]',
    xl: 'text-[11px]',
  }[size];

  return (
    <div className={`inline-flex items-center gap-2 sm:gap-2.5 select-none ${className}`}>
      {/* Official Landing Page Emblem: Slate-900 badge with electric-blue delivery icon */}
      <div
        className={`${badgeClasses} bg-slate-900 flex items-center justify-center text-white shadow-sm shrink-0 border border-slate-800`}
      >
        <span className={`material-symbols-outlined ${iconSizes} text-blue-400`}>
          local_shipping
        </span>
      </div>

      {/* Official Typography Wordmark from Landing Page */}
      {showText && (
        <div className="flex flex-col text-left">
          <span
            className={`font-extrabold tracking-tight ${titleSizes} ${
              variant === 'dark' ? 'text-white' : 'text-slate-900'
            } leading-none`}
          >
            Livra<span className="text-blue-600">Link</span>
          </span>
          <span
            className={`font-bold tracking-widest uppercase mt-0.5 ${subSizes} ${
              variant === 'dark' ? 'text-slate-400' : 'text-slate-400'
            }`}
          >
            {subtitle}
          </span>
        </div>
      )}
    </div>
  );
};
