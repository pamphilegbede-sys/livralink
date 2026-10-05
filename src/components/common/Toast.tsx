import React from 'react';
import { useApp } from '../../context/AppContext';

export const Toast: React.FC = () => {
  const { toastMessage } = useApp();

  if (!toastMessage) return null;

  const bgColors = {
    success: 'bg-[#006c49] text-white border-[#6cf8bb]/40',
    info: 'bg-[#0037b0] text-white border-[#cad3ff]/40',
    error: 'bg-[#ba1a1a] text-white border-[#ffdad6]/40',
  };

  const icons = {
    success: 'check_circle',
    info: 'info',
    error: 'warning',
  };

  return (
    <div className="fixed top-16 right-4 sm:right-6 z-50 animate-bounce transition-all duration-300">
      <div
        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border text-sm font-semibold ${
          bgColors[toastMessage.type]
        }`}
      >
        <span className="material-symbols-outlined text-lg" data-icon={icons[toastMessage.type]}>
          {icons[toastMessage.type]}
        </span>
        <span>{toastMessage.text}</span>
      </div>
    </div>
  );
};
