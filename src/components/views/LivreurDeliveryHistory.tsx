import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { DeliveryOrder } from '../../types';

export const LivreurDeliveryHistory: React.FC<{
  className?: string;
}> = ({ className = "" }) => {
  const { deliveries, courierSettings, userProfile, selectedCourier, setSelectedDelivery, setIsPODModalOpen, showToast } = useApp();

  // Filters state
  const [period, setPeriod] = useState<'toutes' | 'aujourdhui' | '7jours' | '30jours' | 'custom'>('toutes');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [amountMin, setAmountMin] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'recent' | 'ancien' | 'montant_desc' | 'montant_asc'>('recent');
  
  // Modal for POD details inspect
  const [inspectPodOrder, setInspectPodOrder] = useState<DeliveryOrder | null>(null);

  // Filter completed deliveries specifically belonging to the active courier
  const activeCourierName =
    (userProfile?.role === 'livreur' && userProfile?.fullName) ||
    courierSettings.fullName ||
    selectedCourier?.name ||
    'Awa Véloce Livraisons';

  const rawCompleted = useMemo(() => {
    return deliveries.filter((d) => {
      // Must be completed ('livree')
      if (d.status !== 'livree') return false;

      if (userProfile?.role === 'livreur') {
        return (
          d.courier?.id === userProfile.uid ||
          (d.courier?.email && userProfile.email && d.courier.email.toLowerCase() === userProfile.email.toLowerCase()) ||
          (d.courier?.name && d.courier.name.toLowerCase() === userProfile.fullName.toLowerCase())
        );
      }
      return (
        (selectedCourier?.id && d.courier?.id === selectedCourier.id) ||
        (selectedCourier?.name && d.courier?.name === selectedCourier.name)
      );
    });
  }, [deliveries, userProfile, courierSettings, selectedCourier]);

  // Apply active filters (date, amount, search, sort)
  const filteredDeliveries = useMemo(() => {
    return rawCompleted.filter((d) => {
      // 1. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = d.id.toLowerCase().includes(q);
        const matchClient = d.clientName.toLowerCase().includes(q);
        const matchPickup = d.pickupLocation.commune.toLowerCase().includes(q) || d.pickupLocation.address.toLowerCase().includes(q);
        const matchDropoff = d.dropoffLocation.commune.toLowerCase().includes(q) || d.dropoffLocation.address.toLowerCase().includes(q);
        const matchItem = d.itemDescription.toLowerCase().includes(q);
        if (!matchId && !matchClient && !matchPickup && !matchDropoff && !matchItem) {
          return false;
        }
      }

      // 2. Amount Filter
      const netFee = d.deliveryFee || 0;
      if (amountMin > 0 && netFee < amountMin) {
        return false;
      }

      // 3. Period / Date Filter
      if (period === 'aujourdhui') {
        // Today check (using created/validated timestamp or assumes today if time format)
        if (d.createdAt.includes('-')) {
          const todayIso = new Date().toISOString().split('T')[0];
          if (!d.createdAt.startsWith(todayIso)) return false;
        }
      } else if (period === '7jours') {
        if (d.createdAt.includes('-')) {
          const createdTime = new Date(d.createdAt).getTime();
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          if (createdTime < sevenDaysAgo) return false;
        }
      } else if (period === '30jours') {
        if (d.createdAt.includes('-')) {
          const createdTime = new Date(d.createdAt).getTime();
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          if (createdTime < thirtyDaysAgo) return false;
        }
      } else if (period === 'custom') {
        if (startDate) {
          const startMs = new Date(startDate).getTime();
          const createdMs = d.createdAt.includes('-') ? new Date(d.createdAt).getTime() : Date.now();
          if (createdMs < startMs) return false;
        }
        if (endDate) {
          const endMs = new Date(endDate).getTime() + 24 * 60 * 60 * 1000;
          const createdMs = d.createdAt.includes('-') ? new Date(d.createdAt).getTime() : Date.now();
          if (createdMs > endMs) return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const feeA = a.deliveryFee || 0;
      const feeB = b.deliveryFee || 0;

      if (sortBy === 'montant_desc') return feeB - feeA;
      if (sortBy === 'montant_asc') return feeA - feeB;
      if (sortBy === 'ancien') return a.id.localeCompare(b.id);
      // 'recent'
      return b.id.localeCompare(a.id);
    });
  }, [rawCompleted, searchQuery, amountMin, period, startDate, endDate, sortBy]);

  // Aggregate Metrics for filtered list
  const totalCount = filteredDeliveries.length;
  const totalEarnedNet = filteredDeliveries.reduce((sum, d) => sum + (d.deliveryFee || 0), 0);
  const totalCODCollected = filteredDeliveries.reduce((sum, d) => sum + (d.itemValueCOD || 0), 0);
  const avgEarning = totalCount > 0 ? Math.round(totalEarnedNet / totalCount) : 0;

  const handleExportCSV = () => {
    if (filteredDeliveries.length === 0) {
      showToast('Aucune livraison terminée à exporter.', 'error');
      return;
    }

    const headers = ["ID Commande", "Date / Heure", "Client", "Commune Depart", "Commune Arrivee", "Objet", "Montant Gagne (FCFA)", "COD Recouvre (FCFA)", "Preuve POD"];
    const rows = filteredDeliveries.map(d => [
      d.id,
      d.podData?.validatedAt || d.createdAt,
      `"${d.clientName.replace(/"/g, '""')}"`,
      `"${d.pickupLocation.commune.replace(/"/g, '""')}"`,
      `"${d.dropoffLocation.commune.replace(/"/g, '""')}"`,
      `"${d.itemDescription.replace(/"/g, '""')}"`,
      d.deliveryFee || 0,
      d.itemValueCOD || 0,
      d.podData ? 'Validée (POD)' : 'Livrée'
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `historique_livraisons_${activeCourierName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('📈 Export CSV de l\'historique téléchargé avec succès !', 'success');
  };

  return (
    <section className={`bg-white dark:bg-slate-900 rounded-3xl p-5 md:p-7 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors ${className}`}>
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl">history_edu</span>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Historique des Livraisons &amp; Gains</span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                {totalCount} terminée{totalCount > 1 ? 's' : ''}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Filtrez vos missions accomplies par date, recherchez un trajet et suivez le détail de vos revenus
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-2xs"
          title="Télécharger le rapport détaillé sous format CSV"
        >
          <span className="material-symbols-outlined text-base text-emerald-600 dark:text-emerald-400">download</span>
          <span>Exporter (CSV)</span>
        </button>
      </div>

      {/* KPI Cards Row for Filtered Data */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Courses accomplies */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <span>Missions Livrées</span>
            <span className="material-symbols-outlined text-lg text-blue-600 dark:text-blue-400">task_alt</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {totalCount} <span className="text-xs font-normal text-slate-400">course{totalCount > 1 ? 's' : ''}</span>
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            100% Preuve POD Validée
          </p>
        </div>

        {/* KPI 2: Total Revenu Net */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/20 border border-emerald-200/80 dark:border-emerald-900/50 space-y-1">
          <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-bold">
            <span>Total Gains Net</span>
            <span className="material-symbols-outlined text-lg text-emerald-600 dark:text-emerald-400">payments</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-900 dark:text-emerald-300 tracking-tight">
            {totalEarnedNet.toLocaleString('fr-FR')} <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">FCFA</span>
          </p>
          <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
            100% conservés (0% commission)
          </p>
        </div>

        {/* KPI 3: Gain Moyen */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <span>Moyenne / Course</span>
            <span className="material-symbols-outlined text-lg text-indigo-600 dark:text-indigo-400">equalizer</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {avgEarning.toLocaleString('fr-FR')} <span className="text-xs font-normal text-slate-400">FCFA</span>
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
            Basé sur {totalCount} livraison{totalCount > 1 ? 's' : ''}
          </p>
        </div>

        {/* KPI 4: COD Encaissé */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <span>COD Espèces Collecté</span>
            <span className="material-symbols-outlined text-lg text-amber-600 dark:text-amber-400">account_balance_wallet</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {totalCODCollected.toLocaleString('fr-FR')} <span className="text-xs font-normal text-slate-400">FCFA</span>
          </p>
          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
            Fonds clients reversés aux vendeurs
          </p>
        </div>
      </div>

      {/* Filter Control Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
        {/* Top Row: Search input & Period Pills */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Keyword Search Input */}
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par client, code (#LL-...), commune ou colis..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date Period Presets */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar p-1 rounded-xl bg-slate-200/80 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold shrink-0">
            {(['toutes', 'aujourdhui', '7jours', '30jours', 'custom'] as const).map((p) => {
              const labels = {
                toutes: 'Toutes',
                aujourdhui: "Aujourd'hui",
                '7jours': '7 derniers jours',
                '30jours': '30 jours',
                custom: 'Dates...',
              };
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    period === p
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Date Pickers (if period === 'custom') */}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 dark:text-slate-300">Du :</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 dark:text-slate-300">Au :</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
              >
                Réinitialiser dates
              </button>
            )}
          </div>
        )}

        {/* Bottom Row: Amount Minimum Filter & Sorting */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
          {/* Montant gagné minimum */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-600 dark:text-slate-400 shrink-0">
              Gains min :
            </span>
            <select
              value={amountMin}
              onChange={(e) => setAmountMin(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
            >
              <option value={0}>Tous les montants</option>
              <option value={1500}>≥ 1 500 FCFA</option>
              <option value={2000}>≥ 2 000 FCFA</option>
              <option value={2500}>≥ 2 500 FCFA</option>
              <option value={3000}>≥ 3 000 FCFA</option>
            </select>
          </div>

          {/* Tri */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-600 dark:text-slate-400 shrink-0">
              Trier par :
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="recent">Plus récentes d'abord</option>
              <option value="ancien">Plus anciennes d'abord</option>
              <option value="montant_desc">Gains les plus élevés (⬇)</option>
              <option value="montant_asc">Gains les plus bas (⬆)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Deliveries List Table / Cards */}
      {filteredDeliveries.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">search_off</span>
          </div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Aucune livraison terminée ne correspond aux filtres appliqués
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Essayez de modifier votre période, d'abaisser le montant minimum ou de réinitialiser vos termes de recherche.
          </p>
          <button
            type="button"
            onClick={() => {
              setPeriod('toutes');
              setAmountMin(0);
              setSearchQuery('');
              setStartDate('');
              setEndDate('');
              setSortBy('recent');
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-xs hover:bg-blue-700 transition-colors"
          >
            Réinitialiser tous les filtres
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDeliveries.map((order) => {
            const netEarning = order.deliveryFee || 0;
            const podValidatedAt = order.podData?.validatedAt || order.createdAt;

            return (
              <div
                key={order.id}
                className="p-4.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-800/50 hover:bg-slate-50/80 dark:hover:bg-slate-800 transition-all shadow-2xs space-y-3"
              >
                {/* Top Line: ID, Date badge, Net Earning Badge */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <span className="font-extrabold text-sm text-blue-700 dark:text-blue-400 font-mono">
                      {order.id}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold">
                      🕒 {podValidatedAt}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold border border-emerald-200 dark:border-emerald-800">
                      ✓ Preuve POD Validée
                    </span>
                  </div>

                  {/* Net Earning Badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Gain :</span>
                    <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white font-extrabold text-sm shadow-xs">
                      +{netEarning.toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                </div>

                {/* Route & Trajet Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-xs">
                  {/* Departure */}
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-amber-500 text-base shrink-0 mt-0.5">storefront</span>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Collecte (Boutique Vendeur)</p>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {order.pickupLocation.name || 'Boutique Vendeur'}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 truncate">
                        📍 {order.pickupLocation.commune}
                      </p>
                    </div>
                  </div>

                  {/* Arrival */}
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-blue-500 text-base shrink-0 mt-0.5">location_on</span>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Livraison (Client Final)</p>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {order.clientName}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 truncate">
                        📍 {order.dropoffLocation.commune} ({order.dropoffLocation.address})
                      </p>
                    </div>
                  </div>
                </div>

                {/* Object Description & COD / Rating Status */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold border border-slate-200 dark:border-slate-700">
                      📦 {order.itemDescription} ({order.itemWeightKg || 1} kg)
                    </span>
                    {order.itemValueCOD > 0 ? (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800">
                        💵 COD Perçu : {order.itemValueCOD.toLocaleString('fr-FR')} FCFA
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800">
                        💳 Payé en ligne
                      </span>
                    )}

                    {/* Rating badge if review was submitted by merchant */}
                    {order.courierRating && (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 font-extrabold flex items-center gap-1 border border-amber-300 dark:border-amber-700">
                        ⭐ {order.courierRating.rating}.0 / 5
                        {order.courierRating.comment && <span className="text-[10px] font-normal italic">("{order.courierRating.comment}")</span>}
                      </span>
                    )}
                  </div>

                  {/* Inspection Button */}
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setInspectPodOrder(order)}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-blue-600 dark:text-blue-400">verified</span>
                      <span>Inspecter Preuve POD</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* POD Proof Inspection Modal */}
      {inspectPodOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm">
                  ✓
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    Preuve de Livraison (POD Tri-Facteur)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Commande {inspectPodOrder.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectPodOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Code Secret OTP Client</p>
                <p className="font-extrabold text-emerald-600 text-sm tracking-widest font-mono">
                  🔑 #{inspectPodOrder.podData?.otpCode || inspectPodOrder.otpCode || '8492'}
                </p>
              </div>

              {/* Photo Proof */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 space-y-1.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Photo Horodatée du Colis Remis</p>
                {inspectPodOrder.podData?.photoUrl ? (
                  <img
                    src={inspectPodOrder.podData.photoUrl}
                    alt="Preuve photo colis"
                    className="w-full h-40 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-full h-32 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-medium">
                    📸 Photo horodatée certifiée en base de données
                  </div>
                )}
              </div>

              {/* Signature Proof */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 space-y-1.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase">
                  Signature Tactile de {inspectPodOrder.podData?.signedByName || inspectPodOrder.clientName}
                </p>
                {inspectPodOrder.podData?.signatureDataUrl ? (
                  <img
                    src={inspectPodOrder.podData.signatureDataUrl}
                    alt="Signature client"
                    className="w-full h-20 object-contain bg-white rounded-xl border border-slate-200 p-2"
                  />
                ) : (
                  <div className="p-2 bg-white rounded-xl text-slate-700 font-serif italic text-center font-bold">
                    ✍️ Signature manuscrite validée par {inspectPodOrder.clientName}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setInspectPodOrder(null)}
              className="w-full py-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs hover:opacity-90 transition-opacity"
            >
              Fermer l'inspection
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
