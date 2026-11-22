import React, { useEffect, useState } from 'react';

export interface PriorityMissionAlert {
  id: string;
  orderId: string;
  pickupName: string;
  pickupCommune: string;
  dropoffCommune: string;
  itemDescription?: string;
  deliveryFee: number;
  itemValueCOD?: number;
  createdAt: string;
  source: 'firestore' | 'simulation';
  distanceKm?: number | null;
  isPreferred?: boolean;
  offerExpiresAt?: number | null;
  offerTimeoutSeconds?: number;
  offerAttempt?: number;
}

interface PriorityMissionNotificationBannerProps {
  alert: PriorityMissionAlert | null;
  onDismiss: () => void;
  onAccept: (orderId: string) => void;
  onRefuse?: (orderId: string) => void;
  onViewDetails?: (orderId: string) => void;
}

export const PriorityMissionNotificationBanner: React.FC<PriorityMissionNotificationBannerProps> = ({
  alert,
  onDismiss,
  onAccept,
  onRefuse,
  onViewDetails,
}) => {
  const totalSeconds = Math.max(10, alert?.offerTimeoutSeconds || 30);

  const computeRemaining = (a: PriorityMissionAlert | null): number => {
    if (!a) return 0;
    if (typeof a.offerExpiresAt === 'number' && Number.isFinite(a.offerExpiresAt)) {
      return Math.max(0, Math.ceil((a.offerExpiresAt - Date.now()) / 1000));
    }
    return totalSeconds;
  };

  const [secondsLeft, setSecondsLeft] = useState<number>(() => computeRemaining(alert));

  useEffect(() => {
    if (!alert) return;
    setSecondsLeft(computeRemaining(alert));
  }, [alert]);

  useEffect(() => {
    if (!alert) return;

    const timer = setInterval(() => {
      const next = typeof alert.offerExpiresAt === 'number' && Number.isFinite(alert.offerExpiresAt)
        ? Math.max(0, Math.ceil((alert.offerExpiresAt - Date.now()) / 1000))
        : Math.max(0, secondsLeft - 1);
      setSecondsLeft(next);
      if (next <= 0) {
        clearInterval(timer);
        onDismiss();
      }
    }, 500);

    return () => clearInterval(timer);
  }, [alert, secondsLeft, onDismiss]);

  if (!alert) return null;

  const percentLeft = Math.min(100, Math.max(0, Math.round((secondsLeft / totalSeconds) * 100)));

  return (
    <aside
      aria-label="Alerte Mission Prioritaire"
      className="fixed top-3 sm:top-5 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-md z-50 animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <div className="bg-slate-900 text-white rounded-2xl sm:rounded-3xl shadow-2xl border-2 border-amber-500/80 overflow-hidden backdrop-blur-xl bg-slate-900/95">
        {/* Animated Urgency Progress Bar */}
        <div className="w-full bg-slate-800 h-1.5 overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-amber-500 via-emerald-400 to-amber-500 transition-all duration-500 ease-linear"
            style={{ width: `${percentLeft}%` }}
          />
        </div>

        <div className="p-4 sm:p-5">
          {/* Top Badge & Timer */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black tracking-wide uppercase">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>{alert.isPreferred ? '⭐ Livreur Préféré' : '⚡ Offre Ciblée GPS'}</span>
              </div>
              {typeof alert.offerAttempt === 'number' && alert.offerAttempt > 1 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Tour #{alert.offerAttempt}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono font-bold text-amber-400/90 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700">
                ⏱️ {secondsLeft}s
              </span>
              <button
                type="button"
                onClick={onDismiss}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                title="Réduire la bannière"
              >
                <span className="material-symbols-outlined text-lg leading-none">close</span>
              </button>
            </div>
          </div>

          {/* Mission Details Card */}
          <div className="space-y-2 mb-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-extrabold text-base text-white tracking-tight leading-snug">
                  {alert.orderId} • {alert.itemDescription || 'Colis Express'}
                </h4>
                <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1 flex-wrap">
                  <span className="material-symbols-outlined text-amber-400 text-sm">storefront</span>
                  <span className="font-medium text-amber-200">{alert.pickupName}</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-400">{alert.pickupCommune}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs text-slate-400 block font-medium">Gain Coursier</span>
                <span className="text-lg font-black text-emerald-400 font-mono">
                  {alert.deliveryFee.toLocaleString('fr-FR')} F
                </span>
              </div>
            </div>

            {/* Destination & COD */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
              <div className="bg-slate-800/60 p-2 rounded-xl border border-slate-700/60">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Destination</span>
                <span className="font-bold text-slate-200 truncate block">
                  📍 {alert.dropoffCommune}
                </span>
              </div>
              <div className="bg-slate-800/60 p-2 rounded-xl border border-slate-700/60">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">À encaisser (COD)</span>
                <span className="font-bold text-amber-300 font-mono block">
                  💵 {alert.itemValueCOD ? `${alert.itemValueCOD.toLocaleString('fr-FR')} F` : '0 F (Payé)'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-1.5 text-[11px] text-slate-400 pt-1">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-xs text-emerald-400">my_location</span>
                <span>
                  {typeof alert.distanceKm === 'number'
                    ? `À ${alert.distanceKm.toFixed(1)} km du point de collecte`
                    : 'Proposition exclusive en temps réel'}
                </span>
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            {onRefuse ? (
              <button
                type="button"
                onClick={() => {
                  onRefuse(alert.orderId);
                  onDismiss();
                }}
                className="w-full py-2.5 px-2.5 rounded-xl bg-red-950/70 hover:bg-red-900 text-red-200 font-bold text-xs border border-red-800/60 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                <span>Refuser</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onDismiss}
                className="w-full py-2.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              >
                <span>Ignorer</span>
              </button>
            )}

            {onViewDetails && (
              <button
                type="button"
                onClick={() => {
                  onViewDetails(alert.orderId);
                  onDismiss();
                }}
                className="w-full py-2.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">map</span>
                <span>Détails</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onAccept(alert.orderId);
                onDismiss();
              }}
              className={`${onViewDetails ? 'col-span-1' : 'col-span-2'} w-full py-2.5 px-3 rounded-xl bg-linear-to-r from-amber-500 to-emerald-500 hover:from-amber-600 hover:to-emerald-600 text-slate-950 font-black text-xs tracking-wide shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer`}
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
              <span>Accepter</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
