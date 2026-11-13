import React from 'react';
import { useApp } from '../../context/AppContext';
import { LivraLinkLogo } from '../common/LivraLinkLogo';

export const NotFoundView: React.FC = () => {
  const { setCurrentView } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      <header className="w-full bg-white border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setCurrentView('landing');
          }}
          className="inline-flex items-center"
          aria-label="Retour à l'accueil LivraLink"
        >
          <LivraLinkLogo size="md" subtitle="CONNECT & DELIVER" />
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm space-y-5">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-extrabold text-xl">
            404
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-slate-900">Page introuvable</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              L'adresse demandée n'existe pas ou n'est plus disponible sur LivraLink.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                setCurrentView('landing');
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all"
            >
              Retour à l'accueil
            </a>
            <a
              href="/connexion-vendeur"
              onClick={(e) => {
                e.preventDefault();
                setCurrentView('login_vendeur');
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all"
            >
              Espace Vendeur
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};
