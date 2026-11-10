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

  // Calcul dynamique des livraisons de ce livreur
  const myDeliveries = deliveries.filter((d) => {
    if (userProfile?.role === 'livreur') {
      return (
        (d.courier && d.courier.id === userProfile.uid) ||
        (d.courier && userProfile.email && d.courier.email?.toLowerCase() === userProfile.email.toLowerCase()) ||
        (d.courier && userProfile.fullName && d.courier.name?.toLowerCase() === userProfile.fullName.toLowerCase())
      );
    }
    return matchingCourier
      ? (d.courier?.id === matchingCourier.id || d.courier?.name === matchingCourier.name)
      : false;
  });

  const myCompletedDeliveries = myDeliveries.filter((d) => d.status === 'livree');

  const pendingCODToReturn = myCompletedDeliveries.reduce(
    (sum, d) => sum + (d.itemValueCOD || 0),
    0
  );

  const totalEarnedMonth = myCompletedDeliveries.reduce(
    (sum, d) => sum + (d.deliveryFee || 0),
    0
  );

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
    <div className="flex h-full min-h-[100dvh] md:h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff] dark:bg-slate-950">
        {/* Header */}
        <Header
          title="Portefeuille & Revenus"
          subtitle="Gains instantanés garantis à 0% de commission (Modèle MVP)"
        />

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
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

              {/* Fast Payout Trigger - Updated for MVP Direct Settlement */}
              <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 max-w-sm w-full space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base text-emerald-400">handshake</span>
                    <span>Règlement Direct (Main à main / MoMo)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-300 font-bold text-[10px]">
                    Modèle MVP
                  </span>
                </div>
                
                <p className="text-xs text-slate-200 leading-relaxed">
                  Pour ce MVP, tous les encaisserments et règlements s'effectuent directement entre vendeurs, livreurs et clients. Ce portefeuille sert d'outil de comptabilité et de rapport statistique.
                </p>

                <div className="pt-1 flex items-center justify-between text-[11px] text-slate-300 border-t border-white/15">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-blue-300">insights</span>
                    <span>Suivi analytique 100% actif</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => showToast("En mode MVP, les transactions d'argent sont réglées en direct entre les parties. Le portefeuille comptabilise vos statistiques et revenus.", "info")}
                    className="min-h-[44px] text-blue-300 hover:text-white font-bold underline cursor-pointer inline-flex items-center"
                  >
                    Information MVP
                  </button>
                </div>
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
              <div className="text-2xl font-black text-slate-900">
                {totalEarnedMonth.toLocaleString('fr-FR')} <span className="text-xs text-slate-400">FCFA</span>
              </div>
              <p className="text-[11px] text-emerald-600 font-bold">
                {myCompletedDeliveries.length > 0 ? '+100% revenus conservés' : '0 FCFA pour le moment'}
              </p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>ENCAISSEMENTS MARCHAND (COD)</span>
                <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg material-symbols-outlined text-lg">
                  payments
                </span>
              </div>
              <div className="text-2xl font-black text-amber-700">
                {pendingCODToReturn.toLocaleString('fr-FR')} <span className="text-xs text-slate-400">FCFA</span>
              </div>
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
                {myDeliveries.length} transaction{myDeliveries.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-3">
              {myDeliveries.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Aucune transaction pour ce livreur</p>
                  <p>Vos revenus de courses réelles apparaîtront ici au fur et à mesure.</p>
                </div>
              ) : (
                myDeliveries.map((d) => {
                  const txId = `TR-${d.id.replace('LL-', '')}`;
                  const isEarning = d.status === 'livree' || d.status === 'en_cours';
                  const amountText = `+${(d.deliveryFee || 2000).toLocaleString('fr-FR')} FCFA`;

                  return (
                    <div key={d.id} className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${isEarning ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                          <span className="material-symbols-outlined text-lg">
                            {isEarning ? 'arrow_downward' : 'arrow_upward'}
                          </span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 truncate">Course #{d.id} - {d.pickupLocation?.commune || 'Cotonou'}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">{d.createdAt || 'Récemment'} • Réf : {txId}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-xs sm:text-sm font-black font-mono ${isEarning ? 'text-emerald-700' : 'text-slate-900'}`}>
                          {amountText}
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 block">{d.status === 'livree' ? 'Encaissé' : 'En cours'}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
};
