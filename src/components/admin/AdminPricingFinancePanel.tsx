import React, { useEffect, useState, useMemo } from 'react';
import {
  CommissionsConfig,
  CourierRemunerationGeneralConfig,
  DistanceTierRule,
  ExtendedPricingConfig,
} from '../../types';
import { useApp } from '../../context/AppContext';
import { calculateDynamicDeliveryQuote, calculateCourierRemuneration, calculateCommissionBreakdown } from '../../utils/pricingCalculator';
import { downloadCsvFile } from '../../utils/csvExport';

export const AdminPricingFinancePanel: React.FC<{
  mode: 'pricing' | 'finance';
}> = ({ mode }) => {
  const {
    platformConfig,
    savePlatformConfigSection,
    authorizedGetIdToken,
    showToast,
    hasAdminPermission,
    couriers,
    merchants,
    deliveries,
  } = useApp();

  const canManagePricing = hasAdminPermission('pricing.manage');
  const canManageFinance = hasAdminPermission('finance.manage');
  const canRefund = hasAdminPermission('finance.refund');

  // Local editable states synced from platformConfig
  const [pricingForm, setPricingForm] = useState<ExtendedPricingConfig>(platformConfig.pricing);
  const [remunForm, setRemunForm] = useState<CourierRemunerationGeneralConfig>(platformConfig.courierRemuneration);
  const [commForm, setCommForm] = useState<CommissionsConfig>(platformConfig.commissions);
  const [isSaving, setIsSaving] = useState(false);

  // Simulator inputs
  const [simKm, setSimKm] = useState(5);
  const [simType, setSimType] = useState<'standard' | 'express' | 'urgent'>('standard');
  const [simVehicle, setSimVehicle] = useState<'moto' | 'tricycle' | 'voiture' | 'camionnette'>('moto');
  const [simWeight, setSimWeight] = useState(2);
  const [simFragile, setSimFragile] = useState(false);
  const [simPromo, setSimPromo] = useState('');
  const [simPeak, setSimPeak] = useState(false);

  // Finance summary + refunds
  const [financeSummary, setFinanceSummary] = useState<any | null>(null);
  const [loadingFinance, setLoadingFinance] = useState(false);
  const [refundForm, setRefundForm] = useState({
    targetUid: '',
    orderId: '',
    amountFCFA: '1000',
    reason: '',
  });
  const [isRefunding, setIsRefunding] = useState(false);

  useEffect(() => {
    setPricingForm(platformConfig.pricing);
    setRemunForm(platformConfig.courierRemuneration);
    setCommForm(platformConfig.commissions);
  }, [platformConfig.updatedAt]);

  const loadFinanceSummary = async () => {
    setLoadingFinance(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch('/api/admin/finance/summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setFinanceSummary(data);
      }
    } finally {
      setLoadingFinance(false);
    }
  };

  useEffect(() => {
    if (mode === 'finance') {
      void loadFinanceSummary();
    }
  }, [mode]);

  const simQuote = useMemo(() => {
    return calculateDynamicDeliveryQuote(
      {
        distanceKm: simKm,
        deliveryType: simType,
        vehicleCategory: simVehicle,
        itemWeightKg: simWeight,
        isFragile: simFragile,
        promoCode: simPromo,
        isPeakPeriod: simPeak,
        allowPromotions: platformConfig.featureFlags.allowPromotions !== false,
      },
      pricingForm
    );
  }, [simKm, simType, simVehicle, simWeight, simFragile, simPromo, simPeak, pricingForm, platformConfig.featureFlags.allowPromotions]);

  const simRemun = useMemo(() => {
    return calculateCourierRemuneration({
      deliveryFeeFCFA: simQuote.finalDeliveryFeeFCFA,
      distanceKm: simKm,
      generalConfig: remunForm,
      commissionsConfig: commForm,
      pricingConfig: pricingForm,
    });
  }, [simQuote.finalDeliveryFeeFCFA, simKm, remunForm, commForm, pricingForm]);

  const simComm = useMemo(() => {
    return calculateCommissionBreakdown({
      deliveryFeeFCFA: simQuote.finalDeliveryFeeFCFA,
      commissionsConfig: commForm,
      pricingConfig: pricingForm,
    });
  }, [simQuote.finalDeliveryFeeFCFA, commForm, pricingForm]);

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await savePlatformConfigSection(
        {
          pricing: pricingForm,
          courierRemuneration: remunForm,
        },
        'Mise à jour des tarifs au km et rémunération générale depuis le Centre de Contrôle'
      );
      if (res.success) {
        showToast('Configuration des tarifs enregistrée. Les commandes passées conservent leur tarif historique.', 'success');
      } else {
        showToast(res.error || 'Erreur lors de la sauvegarde tarifaire.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCommissions = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await savePlatformConfigSection(
        { commissions: commForm },
        'Mise à jour des commissions & frais depuis le Centre de Contrôle'
      );
      if (res.success) {
        showToast('Barème des commissions et frais enregistré.', 'success');
        void loadFinanceSummary();
      } else {
        showToast(res.error || 'Erreur lors de la sauvegarde des commissions.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecuteRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundForm.targetUid || refundForm.reason.trim().length < 3) {
      showToast('Sélectionnez un bénéficiaire et précisez le motif du remboursement.', 'error');
      return;
    }
    setIsRefunding(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const idempotencyKey = `ref_${refundForm.targetUid}_${Date.now()}`;
      const res = await fetch('/api/admin/refunds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUid: refundForm.targetUid,
          orderId: refundForm.orderId.trim(),
          amountFCFA: Math.round(Number(refundForm.amountFCFA) || 0),
          reason: refundForm.reason.trim(),
          idempotencyKey,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast(data?.error || 'Échec du remboursement.', 'error');
      } else {
        showToast(`Remboursement crédité avec succès (Nouveau solde : ${(data.balanceAfter ?? 0).toLocaleString('fr-FR')} FCFA).`, 'success');
        setRefundForm({ targetUid: '', orderId: '', amountFCFA: '1000', reason: '' });
        void loadFinanceSummary();
      }
    } finally {
      setIsRefunding(false);
    }
  };

  const addTier = () => {
    const newTier: DistanceTierRule = {
      id: `tier_${Date.now()}`,
      label: 'Nouvelle tranche',
      minKm: 0,
      maxKm: null,
      ratePerKmFCFA: pricingForm.pricePerKmFCFA,
      fixedFeeFCFA: 0,
    };
    setPricingForm((p) => ({ ...p, distanceTiers: [...p.distanceTiers, newTier] }));
  };

  const updateTier = (idx: number, patch: Partial<DistanceTierRule>) => {
    setPricingForm((p) => ({
      ...p,
      distanceTiers: p.distanceTiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  };

  const removeTier = (idx: number) => {
    setPricingForm((p) => ({
      ...p,
      distanceTiers: p.distanceTiers.filter((_, i) => i !== idx),
    }));
  };

  if (mode === 'finance') {
    const kpis = financeSummary?.kpis || {
      turnoverCODFCFA: 0,
      deliveryFeesFCFA: 0,
      platformCommissionsFCFA: 0,
      vendorCommissionsFCFA: 0,
      courierEarningsFCFA: 0,
      totalRefundsFCFA: 0,
      deliveredCount: 0,
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Financial KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: 'CA COD Livré', val: `${kpis.turnoverCODFCFA.toLocaleString('fr-FR')} F`, cls: 'bg-white border-slate-200 text-slate-900' },
            { label: 'Frais Livraison', val: `${kpis.deliveryFeesFCFA.toLocaleString('fr-FR')} F`, cls: 'bg-white border-slate-200 text-blue-700' },
            { label: 'Comm. Plateforme', val: `${kpis.platformCommissionsFCFA.toLocaleString('fr-FR')} F`, cls: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
            { label: 'Comm. Vendeurs', val: `${kpis.vendorCommissionsFCFA.toLocaleString('fr-FR')} F`, cls: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
            { label: 'Revenus Livreurs', val: `${kpis.courierEarningsFCFA.toLocaleString('fr-FR')} F`, cls: 'bg-purple-50 border-purple-200 text-purple-800' },
            { label: 'Remboursements', val: `${kpis.totalRefundsFCFA.toLocaleString('fr-FR')} F`, cls: 'bg-red-50 border-red-200 text-red-800' },
          ].map((k) => (
            <div key={k.label} className={`p-4 rounded-2xl border shadow-2xs ${k.cls}`}>
              <span className="text-[10px] font-bold uppercase opacity-75 block">{k.label}</span>
              <span className="text-base font-black">{loadingFinance ? '...' : k.val}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Commissions & Fees Config */}
          <form onSubmit={handleSaveCommissions} className="lg:col-span-6 bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Barème Commissions &amp; Frais Plateforme</h3>
                <p className="text-slate-500">Taux appliqués aux nouvelles courses &amp; retraits</p>
              </div>
              {canManageFinance && (
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Sauvegarde...' : 'Enregistrer'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Commission générale plateforme (%)</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={commForm.platformCommissionPercent}
                  onChange={(e) => setCommForm({ ...commForm, platformCommissionPercent: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Commission vendeur (%)</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={commForm.vendorCommissionPercent}
                  onChange={(e) => setCommForm({ ...commForm, vendorCommissionPercent: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Commission livreur (%)</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={commForm.courierCommissionPercent}
                  onChange={(e) => setCommForm({ ...commForm, courierCommissionPercent: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Frais de service (%)</label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={commForm.serviceFeePercent}
                  onChange={(e) => setCommForm({ ...commForm, serviceFeePercent: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Frais de retrait (%)</label>
                <input
                  type="number"
                  min={0}
                  max={15}
                  step={0.5}
                  value={commForm.withdrawalFeePercent}
                  onChange={(e) => setCommForm({ ...commForm, withdrawalFeePercent: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Frais fixe retrait (FCFA)</label>
                <input
                  type="number"
                  min={0}
                  value={commForm.withdrawalFixedFeeFCFA}
                  onChange={(e) => setCommForm({ ...commForm, withdrawalFixedFeeFCFA: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </form>

          {/* Transactional Idempotent Refund Form */}
          <form onSubmit={handleExecuteRefund} className="lg:col-span-6 bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4 text-xs">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-red-700">Remboursement Transactionnel Sécurisé</h3>
              <p className="text-slate-500">Crédit atomique du portefeuille bénéficiaire avec écriture au grand livre &amp; journal d’audit</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Bénéficiaire (Vendeur ou Livreur) *</label>
                <select
                  required
                  value={refundForm.targetUid}
                  onChange={(e) => setRefundForm({ ...refundForm, targetUid: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="">-- Sélectionner un compte --</option>
                  {merchants.map((m) => (
                    <option key={m.id} value={m.id}>
                      🏪 {m.storeName} ({m.managerName})
                    </option>
                  ))}
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      🛵 {c.name} ({c.walletBalanceFCFA} F)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Montant (FCFA) *</label>
                <input
                  type="number"
                  required
                  min={50}
                  value={refundForm.amountFCFA}
                  onChange={(e) => setRefundForm({ ...refundForm, amountFCFA: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Référence course (optionnel)</label>
                <input
                  list="refund-orders-list"
                  value={refundForm.orderId}
                  onChange={(e) => setRefundForm({ ...refundForm, orderId: e.target.value })}
                  placeholder="#LL-..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
                <datalist id="refund-orders-list">
                  {deliveries.slice(0, 40).map((d) => (
                    <option key={d.id} value={d.id} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Motif officiel *</label>
                <input
                  required
                  value={refundForm.reason}
                  onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                  placeholder="Ex: Surfacturation / Colis annulé"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
            {canRefund && (
              <button
                type="submit"
                disabled={isRefunding}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl cursor-pointer disabled:opacity-50"
              >
                {isRefunding ? 'Exécution transactionnelle...' : 'Exécuter le Remboursement'}
              </button>
            )}
          </form>
        </div>

        {/* Ledger & Export */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900">
              Journal des Transactions &amp; Remboursements ({(financeSummary?.recentTransactions || []).length})
            </h3>
            <button
              type="button"
              onClick={() => {
                const rows = (financeSummary?.recentTransactions || []).map((t: any) => [
                  t.id,
                  t.uid,
                  t.type,
                  t.direction,
                  t.amountFCFA,
                  t.note,
                  t.createdAtIso || '',
                ]);
                downloadCsvFile(
                  `livralink-finance-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['ID', 'UID', 'Type', 'Direction', 'MontantFCFA', 'Note', 'Date'],
                  rows
                );
              }}
              className="px-3 py-1.5 bg-slate-900 text-white font-bold rounded-xl cursor-pointer"
            >
              Export CSV Financier
            </button>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Réf</th>
                  <th className="px-3 py-2">Compte</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Motif / Note</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(financeSummary?.recentTransactions || []).map((tx: any) => (
                  <tr key={tx.id}>
                    <td className="px-3 py-2 font-mono text-[11px]">{tx.id}</td>
                    <td className="px-3 py-2">{tx.uid}</td>
                    <td className="px-3 py-2 font-bold">{tx.type}</td>
                    <td className="px-3 py-2 text-slate-600">{tx.note}</td>
                    <td className={`px-3 py-2 text-right font-extrabold ${tx.direction === 'credit' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {tx.direction === 'credit' ? '+' : '-'}{Number(tx.amountFCFA || 0).toLocaleString('fr-FR')} F
                    </td>
                  </tr>
                ))}
                {(!financeSummary?.recentTransactions || financeSummary.recentTransactions.length === 0) && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      Aucune transaction enregistrée dans le grand livre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // MODE === 'pricing'
  return (
    <form onSubmit={handleSavePricing} className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-amber-950">
          <p className="font-extrabold">Protection Historique des Commandes Activée</p>
          <p>
            Chaque modification des tarifs s’applique immédiatement aux <strong>nouvelles</strong> livraisons. Les courses déjà créées conservent définitivement leur <code className="font-mono">pricingSnapshot</code> d’origine.
          </p>
        </div>
        {canManagePricing && (
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold rounded-xl text-xs shadow-sm cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isSaving ? 'Sauvegarde...' : 'Enregistrer toute la tarification'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Core Per-Km & Surcharges + Tiers */}
        <div className="lg:col-span-7 space-y-5 text-xs">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">1. Tarifs de base au kilomètre &amp; Plafonds</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Prix / km (FCFA)</label>
                <input
                  type="number"
                  min={0}
                  value={pricingForm.pricePerKmFCFA}
                  onChange={(e) => setPricingForm({ ...pricingForm, pricePerKmFCFA: Number(e.target.value), extraPerKmFCFA: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Minimum (FCFA)</label>
                <input
                  type="number"
                  min={50}
                  value={pricingForm.minDeliveryFeeFCFA}
                  onChange={(e) => setPricingForm({ ...pricingForm, minDeliveryFeeFCFA: Number(e.target.value), baseFeeFCFA: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Maximum (FCFA)</label>
                <input
                  type="number"
                  min={500}
                  value={pricingForm.maxDeliveryFeeFCFA}
                  onChange={(e) => setPricingForm({ ...pricingForm, maxDeliveryFeeFCFA: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Prise en charge fixe</label>
                <input
                  type="number"
                  min={0}
                  value={pricingForm.fixedPickupFeeFCFA}
                  onChange={(e) => setPricingForm({ ...pricingForm, fixedPickupFeeFCFA: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Palier arrondi (FCFA)</label>
                <input
                  type="number"
                  min={1}
                  value={pricingForm.roundingStepFCFA}
                  onChange={(e) => setPricingForm({ ...pricingForm, roundingStepFCFA: Number(e.target.value) || 50 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Supplément fragile</label>
                <input
                  type="number"
                  min={0}
                  value={pricingForm.fragileSurchargeFCFA}
                  onChange={(e) => setPricingForm({ ...pricingForm, fragileSurchargeFCFA: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Suppl. poids &gt;5kg (/kg)</label>
                <input
                  type="number"
                  min={0}
                  value={pricingForm.weightSurchargePerKgFCFA}
                  onChange={(e) => setPricingForm({ ...pricingForm, weightSurchargePerKgFCFA: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Majoration Nuit/Pointe (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={pricingForm.nightOrPeakSurchargePercent}
                  onChange={(e) => setPricingForm({ ...pricingForm, nightOrPeakSurchargePercent: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Tranches de distance */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">2. Tranches de Distance</h3>
              <button type="button" onClick={addTier} className="px-3 py-1 bg-blue-50 text-blue-700 font-bold rounded-xl cursor-pointer">
                + Ajouter tranche
              </button>
            </div>
            <div className="space-y-2">
              {pricingForm.distanceTiers.map((tier, idx) => (
                <div key={tier.id} className="grid grid-cols-12 gap-2 items-center p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <input
                    value={tier.label}
                    onChange={(e) => updateTier(idx, { label: e.target.value })}
                    className="col-span-4 px-2 py-1 border border-slate-300 rounded-lg bg-white"
                    placeholder="Libellé"
                  />
                  <input
                    type="number"
                    min={0}
                    value={tier.minKm}
                    onChange={(e) => updateTier(idx, { minKm: Number(e.target.value) })}
                    className="col-span-2 px-2 py-1 border border-slate-300 rounded-lg bg-white"
                    placeholder="Min km"
                  />
                  <input
                    type="number"
                    min={0}
                    value={tier.maxKm ?? ''}
                    onChange={(e) => updateTier(idx, { maxKm: e.target.value === '' ? null : Number(e.target.value) })}
                    className="col-span-2 px-2 py-1 border border-slate-300 rounded-lg bg-white"
                    placeholder="Max (∞)"
                  />
                  <input
                    type="number"
                    min={0}
                    value={tier.ratePerKmFCFA}
                    onChange={(e) => updateTier(idx, { ratePerKmFCFA: Number(e.target.value) })}
                    className="col-span-2 px-2 py-1 border border-slate-300 rounded-lg bg-white font-bold"
                    placeholder="F/km"
                  />
                  <button
                    type="button"
                    onClick={() => removeTier(idx)}
                    className="col-span-2 text-red-600 font-bold cursor-pointer text-center"
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery Types & Vehicle Multipliers & Promos */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900">3. Types, Véhicules &amp; Promotions</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Coeff. Express</label>
                <input
                  type="number"
                  step={0.05}
                  min={1}
                  value={pricingForm.deliveryTypes.expressMultiplier}
                  onChange={(e) =>
                    setPricingForm({
                      ...pricingForm,
                      deliveryTypes: { ...pricingForm.deliveryTypes, expressMultiplier: Number(e.target.value) },
                    })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Coeff. Urgent</label>
                <input
                  type="number"
                  step={0.05}
                  min={1}
                  value={pricingForm.deliveryTypes.urgentMultiplier}
                  onChange={(e) =>
                    setPricingForm({
                      ...pricingForm,
                      deliveryTypes: { ...pricingForm.deliveryTypes, urgentMultiplier: Number(e.target.value) },
                    })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Fixe Urgent (FCFA)</label>
                <input
                  type="number"
                  min={0}
                  value={pricingForm.deliveryTypes.urgentFixedExtraFCFA}
                  onChange={(e) =>
                    setPricingForm({
                      ...pricingForm,
                      deliveryTypes: { ...pricingForm.deliveryTypes, urgentFixedExtraFCFA: Number(e.target.value) },
                    })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {(['moto', 'tricycle', 'voiture', 'camionnette'] as const).map((v) => (
                <div key={v}>
                  <label className="font-bold text-slate-600 capitalize block mb-1">{v} (x)</label>
                  <input
                    type="number"
                    step={0.05}
                    min={0.5}
                    value={pricingForm.vehicleMultipliers[v]}
                    onChange={(e) =>
                      setPricingForm({
                        ...pricingForm,
                        vehicleMultipliers: { ...pricingForm.vehicleMultipliers, [v]: Number(e.target.value) },
                      })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Code Promo Actif</label>
                <input
                  value={pricingForm.activePromoCode}
                  onChange={(e) => setPricingForm({ ...pricingForm, activePromoCode: e.target.value.toUpperCase() })}
                  placeholder="EX: LIVRA10"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Réduction (%)</label>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={pricingForm.promoDiscountPercent}
                  onChange={(e) => setPricingForm({ ...pricingForm, promoDiscountPercent: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Plafond promo (F)</label>
                <input
                  type="number"
                  min={0}
                  value={pricingForm.promoMaxDiscountFCFA}
                  onChange={(e) => setPricingForm({ ...pricingForm, promoMaxDiscountFCFA: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: General Courier Remuneration + Live Simulator */}
        <div className="lg:col-span-5 space-y-5 text-xs">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900">4. Rémunération Générale des Livreurs</h3>
            <p className="text-slate-500">Appliquée par défaut à tous les livreurs sauf dérogation individuelle.</p>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Mode de calcul</label>
              <select
                value={remunForm.mode}
                onChange={(e) => setRemunForm({ ...remunForm, mode: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
              >
                <option value="percentage_of_fee">Pourcentage du tarif course</option>
                <option value="per_km_plus_base">Forfait fixe + Tarif / km livreur</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Part livreur (%)</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={remunForm.courierSharePercent}
                  onChange={(e) => setRemunForm({ ...remunForm, courierSharePercent: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tarif / km livreur (F)</label>
                <input
                  type="number"
                  min={0}
                  value={remunForm.perKmFCFA}
                  onChange={(e) => setRemunForm({ ...remunForm, perKmFCFA: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Minimum garanti (F)</label>
                <input
                  type="number"
                  min={50}
                  value={remunForm.minEarningFCFA}
                  onChange={(e) => setRemunForm({ ...remunForm, minEarningFCFA: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Bonus pointe / course</label>
                <input
                  type="number"
                  min={0}
                  value={remunForm.peakBonusFCFA}
                  onChange={(e) => setRemunForm({ ...remunForm, peakBonusFCFA: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Live Simulator */}
          <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 space-y-4">
            <h3 className="text-sm font-extrabold text-amber-300 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">calculate</span>
              <span>Simulateur Tarifaire en Direct</span>
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-slate-400 block mb-1">Distance (km)</label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={simKm}
                  onChange={(e) => setSimKm(Number(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Type de livraison</label>
                <select
                  value={simType}
                  onChange={(e) => setSimType(e.target.value as any)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                >
                  <option value="standard">Standard</option>
                  <option value="express">Express</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Véhicule</label>
                <select
                  value={simVehicle}
                  onChange={(e) => setSimVehicle(e.target.value as any)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                >
                  <option value="moto">Moto</option>
                  <option value="tricycle">Tricycle</option>
                  <option value="voiture">Voiture</option>
                  <option value="camionnette">Camionnette</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Poids (kg) / Promo</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={0.5}
                    value={simWeight}
                    onChange={(e) => setSimWeight(Number(e.target.value) || 1)}
                    className="w-16 px-2 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                  <input
                    value={simPromo}
                    onChange={(e) => setSimPromo(e.target.value.toUpperCase())}
                    placeholder="Code promo"
                    className="flex-1 px-2 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={simFragile} onChange={(e) => setSimFragile(e.target.checked)} />
                <span>Colis fragile</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={simPeak} onChange={(e) => setSimPeak(e.target.checked)} />
                <span>Heure de pointe / nuit</span>
              </label>
            </div>

            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-300">Tarif km effectif ({simQuote.pricePerKmFCFA} F/km)</span>
                <strong>{simQuote.distanceChargeFCFA.toLocaleString('fr-FR')} FCFA</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Prise en charge &amp; suppléments</span>
                <strong>
                  {(
                    simQuote.pickupFixedFeeFCFA +
                    simQuote.deliveryTypeSurchargeFCFA +
                    simQuote.fragileSurchargeFCFA +
                    simQuote.weightSurchargeFCFA +
                    simQuote.peakSurchargeFCFA
                  ).toLocaleString('fr-FR')}{' '}
                  FCFA
                </strong>
              </div>
              {simQuote.promoDiscountFCFA > 0 && (
                <div className="flex justify-between text-emerald-300">
                  <span>Remise promo</span>
                  <strong>-{simQuote.promoDiscountFCFA.toLocaleString('fr-FR')} FCFA</strong>
                </div>
              )}
              <div className="pt-2 border-t border-slate-700 flex justify-between text-sm">
                <span className="font-bold text-amber-300">Tarif Final Client</span>
                <strong className="text-amber-300">{simQuote.finalDeliveryFeeFCFA.toLocaleString('fr-FR')} FCFA</strong>
              </div>
              <div className="flex justify-between text-emerald-300">
                <span>Gain Net Livreur estimé</span>
                <strong>{simRemun.netCourierEarningFCFA.toLocaleString('fr-FR')} FCFA</strong>
              </div>
              <div className="flex justify-between text-blue-300">
                <span>Revenu Net Plateforme estimé</span>
                <strong>{simComm.totalPlatformRevenueFCFA.toLocaleString('fr-FR')} FCFA</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
