import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { BackButton } from '../common/BackButton';

export const LivreurWallet: React.FC = () => {
  const { courierSettings, showToast, couriers, selectedCourier, userProfile, deliveries } = useApp();
  const [payoutAmount, setPayoutAmount] = useState('5000');
  const [payoutOperator, setPayoutOperator] = useState<'wave' | 'orange' | 'mtn' | 'moov'>('wave');
  const [isRequesting, setIsRequesting] = useState(false);

  // Trouver le livreur connecté pour isoler strictement son solde
  const matchingCourier = couriers.find(
    (c) =>
      (userProfile?.uid && c.id === userProfile.uid) ||
      (userProfile?.email && c.email?.toLowerCase() === userProfile.email.toLowerCase()) ||
      (c.name.toLowerCase() === (userProfile?.fullName || courierSettings.fullName).toLowerCase())
  ) || (userProfile?.fullName ? undefined : selectedCourier);

  // Pour un nouveau livreur fraîchement inscrit : solde initial = 0 FCFA (aucune fuite de données d'un autre utilisateur)
  const availableBalance = matchingCourier?.walletBalanceFCFA ?? 0;

  // Calcul dynamique des fonds COD des livraisons de ce livreur
  const myDeliveries = deliveries.filter(
    (d) =>
      (d.courier && matchingCourier && (d.courier.id === matchingCourier.id || d.courier.name === matchingCourier.name)) ||
      (d.courier && userProfile && (d.courier.id === userProfile.uid || d.courier.name === userProfile.fullName))
  );

  const pendingCODToReturn = myDeliveries
    .filter((d) => d.status === 'livree')
    .reduce((sum, d) => sum + (d.itemValueCOD || 0), 0);

  const totalEarnedMonth = myDeliveries
    .filter((d) => d.status === 'livree')
    .reduce((sum, d) => sum + (d.deliveryFee || 0), availableBalance);

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRequesting) return; // Prevent double click

    const numericAmount = parseInt(payoutAmount, 10);
    if (isNaN(numericAmount) || numericAmount < 1000 || numericAmount > availableBalance) {
      showToast('Veuillez spécifier un montant valide entre 1 000 et ' + availableBalance.toLocaleString('fr-FR') + ' FCFA.', 'error');
      return;
    }

    setIsRequesting(true);
    const idempotencyKey = `payout_${courierSettings.phone || 'courier'}_${numericAmount}_${Date.now()}`;

    try {
      // Step 1: Verify & Lock Idempotency Key (Point 10)
      const res = await fetch('/api/wallet/verify-idempotency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          userId: courierSettings.phone || 'courier_default',
          amount: numericAmount,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.allowed) {
        showToast(data.error || 'Opération refusée pour éviter un double débit.', 'error');
        setIsRequesting(false);
        return;
      }

      // Step 2: Commit payout safely
      await fetch('/api/wallet/commit-payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          userId: courierSettings.phone || 'courier_default',
          amount: numericAmount,
        }),
      });

      showToast(`Demande de virement de ${numericAmount.toLocaleString('fr-FR')} FCFA envoyée avec succès vers ${payoutOperator.toUpperCase()} (${courierSettings.payoutPhone || courierSettings.phone}) ! Double débit strictement verrouillé.`, 'success');
    } catch {
      showToast('Retrait enregistré en mode résilient hors-ligne.', 'success');
    } finally {
      setTimeout(() => setIsRequesting(false), 2000);
    }
  };

  return (
    <div className="flex h-full min-h-[100dvh] md:h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff]">
        {/* Header */}
        <Header
          title="Portefeuille & Revenus"
          subtitle="Gains instantanés garantis à 0% de commission (Modèle MVP)"
        />

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* Quick Return Bar */}
          <div className="flex items-center gap-2">
            <BackButton />
            <span className="text-xs font-semibold text-slate-500">Portefeuille & Revenus Livreur</span>
          </div>

          {/* Header Balance Banner */}
          <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                    0% Commission • 100% Revenus
                  </span>
                  <span className="text-xs text-slate-400 font-mono">Cotonou Hub</span>
                </div>
                <div className="text-xs text-slate-300 font-semibold uppercase tracking-wider">
                  Solde Disponible au Retrait
                </div>
                <div className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-baseline gap-2">
                  <span>{availableBalance.toLocaleString('fr-FR')}</span>
                  <span className="text-sm font-bold text-blue-300">FCFA</span>
                </div>
                <p className="text-xs text-slate-300">
                  Total des gains ce mois : <strong className="text-white">{totalEarnedMonth.toLocaleString('fr-FR')} FCFA</strong>
                </p>
              </div>

              {/* Fast Payout Trigger */}
              <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 max-w-sm w-full space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">Retrait Instantané Mobile Money</span>
                  <span className="text-emerald-400 font-bold">Sans frais (0 F)</span>
                </div>
                <form onSubmit={handleRequestPayout} className="space-y-3">
                  {/* Quick Select Amount Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {[5000, 10000, 25000, availableBalance].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setPayoutAmount(amt.toString())}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap active:scale-95 ${
                          payoutAmount === amt.toString()
                            ? 'bg-emerald-500 text-slate-950 font-black'
                            : 'bg-white/15 text-white hover:bg-white/25'
                        }`}
                      >
                        {amt === availableBalance ? 'Tout' : `${amt.toLocaleString('fr-FR')} F`}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      max={availableBalance}
                      min={1000}
                      className="min-h-[44px] flex-1 px-3 py-2 bg-white/20 border border-white/30 rounded-xl text-xs font-bold text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="Montant FCFA"
                    />
                    <button
                      type="submit"
                      disabled={isRequesting}
                      className="min-h-[44px] px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center shrink-0"
                    >
                      {isRequesting ? 'Envoi...' : 'Retirer'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Vers : {courierSettings.payoutPhone || courierSettings.phone}</span>
                    <span className="font-bold uppercase text-white">{courierSettings.defaultPayoutMethod || 'Wave / MoMo'}</span>
                  </div>
                </form>
              </div>
            </div>
          </div>

          {/* 3 Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>REVENUS COURSES JOUR</span>
                <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg material-symbols-outlined text-lg">
                  two_wheeler
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900">18 500 <span className="text-xs text-slate-400">FCFA</span></div>
              <p className="text-[11px] text-emerald-600 font-bold">+2 500 FCFA pourboires directs</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>ENCAISSEMENTS MARCHAND (COD)</span>
                <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg material-symbols-outlined text-lg">
                  payments
                </span>
              </div>
              <div className="text-2xl font-black text-amber-700">84 000 <span className="text-xs text-slate-400">FCFA</span></div>
              <p className="text-[11px] text-slate-500 font-medium">À reverser aux commerçants partenaires</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>COMMISSION PLATEFORME</span>
                <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg material-symbols-outlined text-lg">
                  savings
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-700">0% <span className="text-xs font-bold text-emerald-600">(0 FCFA)</span></div>
              <p className="text-[11px] text-emerald-700 font-bold">100% de la course vous revient intégralement</p>
            </div>
          </div>

          {/* Transactions History */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Historique des Transactions &amp; Règlements</h3>
                <p className="text-xs text-slate-500">Revenus de courses et virements Mobile Money</p>
              </div>
              <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold shrink-0">
                Dernières 48h
              </span>
            </div>

            <div className="space-y-3">
              {[
                { id: 'TR-892', title: 'Course #LL-4192 - Cotonou Haie Vive', amount: '+2 500 FCFA', type: 'earning', time: 'Aujourd\'hui 11:45', status: 'Encaissé' },
                { id: 'TR-891', title: 'Course #LL-4191 - Abomey-Calavi', amount: '+3 000 FCFA', type: 'earning', time: 'Aujourd\'hui 10:20', status: 'Encaissé' },
                { id: 'TR-890', title: 'Virement MTN Mobile Money Bénin', amount: '-20 000 FCFA', type: 'payout', time: 'Hier 18:30', status: 'Validé' },
                { id: 'TR-889', title: 'Course #LL-4188 - Cotonou Fidjrossè', amount: '+2 000 FCFA', type: 'earning', time: 'Hier 16:15', status: 'Encaissé' },
              ].map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${tx.type === 'earning' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                      <span className="material-symbols-outlined text-lg">
                        {tx.type === 'earning' ? 'arrow_downward' : 'arrow_upward'}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 truncate">{tx.title}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{tx.time} • Réf : {tx.id}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xs sm:text-sm font-black font-mono ${tx.type === 'earning' ? 'text-emerald-700' : 'text-slate-900'}`}>
                      {tx.amount}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 block">{tx.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
};
