import React from 'react';

export const GoogleSignInModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-xl">
        <h3 className="font-bold text-lg mb-2">Authentification Google</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Connexion sécurisée en cours avec votre compte Google...
        </p>
        <button
          onClick={onClose}
          className="w-full min-h-[44px] bg-blue-600 text-white font-bold rounded-xl"
        >
          Fermer
        </button>
      </div>
    </div>
  );
};
