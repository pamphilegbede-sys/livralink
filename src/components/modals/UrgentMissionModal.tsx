import React from 'react';
import { useApp } from '../../context/AppContext';

export const UrgentMissionModal: React.FC = () => {
  const { isUrgentOfferOpen, urgentOfferTimer, acceptUrgentOffer, dismissUrgentOffer } = useApp();

  if (!isUrgentOfferOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 text-white rounded-3xl p-6 max-w-md w-full shadow-2xl border-2 border-amber-300 space-y-4 relative overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/20">
          <div className="flex items-center gap-2">
            <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-yellow-200">bolt</span>
              Course Express 45 min
            </span>
            <span className="text-xs font-semibold text-amber-100">#LL-4195</span>
          </div>
          <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1 rounded-full text-xs font-black text-amber-200">
            <span className="material-symbols-outlined text-sm animate-spin">schedule</span>
            <span>{urgentOfferTimer}s</span>
          </div>
        </div>

        {/* Course Details */}
        <div className="space-y-2.5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="font-extrabold text-sm flex items-center gap-1.5 text-white">
                <span className="w-2 h-2 rounded-full bg-emerald-300 shrink-0"></span>
                Plateau CCIA ➔ Marcory Zone 4
              </p>
              <p className="text-xs text-amber-100 font-medium pl-3.5">
                Docs juridiques (0.4 kg) • 6.2 km
              </p>
              <p className="text-[11px] text-emerald-200 pl-3.5 font-bold">
                📍 Collecte à 1.1 km de votre position actuelle
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-black tracking-tight text-white leading-none">3 000 F</div>
              <span className="text-[11px] text-amber-100 font-medium">Revenu net garanti</span>
            </div>
          </div>

          {/* Breakdown notice */}
          <div className="p-3 bg-black/20 rounded-xl text-xs space-y-1 text-amber-100">
            <div className="flex justify-between">
              <span>Prix de la livraison :</span>
              <span className="font-bold text-white">3 000 FCFA</span>
            </div>
            <div className="flex justify-between">
              <span>Commission LivraLink :</span>
              <span className="font-bold text-emerald-300">0 FCFA (Offre MVP 0%)</span>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-1 font-bold text-white">
              <span>Votre gain net direct :</span>
              <span className="text-emerald-300 font-black">3 000 FCFA</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2.5 pt-2">
          <button
            type="button"
            onClick={dismissUrgentOffer}
            className="col-span-1 py-3 px-3 bg-black/30 hover:bg-black/40 rounded-xl font-bold text-xs text-white transition active:scale-95"
          >
            Ignorer
          </button>
          <button
            type="button"
            onClick={acceptUrgentOffer}
            className="col-span-2 py-3 px-4 bg-white hover:bg-slate-100 text-slate-950 rounded-xl font-black text-xs shadow-lg transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base text-emerald-600">touch_app</span>
            <span>Accepter la mission ({urgentOfferTimer}s)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
