import React, { useState, useMemo } from 'react';
import { useApp, AdminTab } from '../../context/AppContext';
import { DeliveryOrder, Courier, Merchant } from '../../types';

interface AdminOverviewDashboardProps {
  onNavigateTab?: (tab: AdminTab) => void;
}

export const AdminOverviewDashboard: React.FC<AdminOverviewDashboardProps> = ({ onNavigateTab }) => {
  const {
    deliveries,
    couriers,
    merchants,
    kycRequests,
    auditLogs,
    featureFlags,
    pricingRules,
    setAdminActiveTab,
    setCurrentView,
    setCurrentRole,
    impersonateMerchant,
    impersonateCourier,
    toggleCourierStatus,
    toggleMerchantStatus,
    createDelivery,
    updateFeatureFlag,
    showToast,
  } = useApp();

  // Navigation helper
  const navigateToTab = (tab: AdminTab) => {
    if (onNavigateTab) {
      onNavigateTab(tab);
    } else {
      setAdminActiveTab(tab);
    }
  };

  // Timeframe filter state
  const [timeframe, setTimeframe] = useState<'today' | '7days' | 'month' | 'all'>('today');
  const [activityFeedFilter, setActivityFeedFilter] = useState<'all' | 'delivery' | 'finance' | 'security'>('all');

  // --- 1. KEY INDICATOR: LIVRAISONS ACTIVES & FLUX OPÉRATIONNEL ---
  const activeDeliveries = useMemo(() => {
    return deliveries.filter(
      (d) => d.status === 'en_attente' || d.status === 'assignee' || d.status === 'acceptee' || d.status === 'colis_recupere' || d.status === 'en_cours'
    );
  }, [deliveries]);

  const pendingDeliveries = useMemo(() => deliveries.filter((d) => d.status === 'en_attente' || d.status === 'assignee'), [deliveries]);
  const inTransitDeliveries = useMemo(() => deliveries.filter((d) => d.status === 'acceptee' || d.status === 'colis_recupere' || d.status === 'en_cours'), [deliveries]);
  const deliveredOrders = useMemo(() => deliveries.filter((d) => d.status === 'livree'), [deliveries]);
  const disputeOrders = useMemo(() => deliveries.filter((d) => d.status === 'echec'), [deliveries]);

  const podSuccessRate = useMemo(() => {
    const totalFinished = deliveredOrders.length + disputeOrders.length;
    if (totalFinished === 0) return 100;
    return Math.round((deliveredOrders.length / totalFinished) * 100);
  }, [deliveredOrders, disputeOrders]);

  // --- 2. KEY INDICATOR: VOLUME TOTAL & PERFORMANCE FINANCIÈRE ---
  const totalVolumeCOD = useMemo(() => {
    return deliveries.reduce((acc, curr) => acc + (curr.itemValueCOD || 0), 0);
  }, [deliveries]);

  const totalDeliveryFees = useMemo(() => {
    return deliveries.reduce((acc, curr) => acc + (curr.deliveryFee || 0), 0);
  }, [deliveries]);

  const totalPlatformCommissions = useMemo(() => {
    const rate = (pricingRules?.commissionRatePercent ?? 10) / 100;
    return Math.round(totalDeliveryFees * rate);
  }, [totalDeliveryFees, pricingRules]);

  const totalCouriersWalletDeposit = useMemo(() => {
    return couriers.reduce((acc, curr) => acc + (curr.walletBalanceFCFA || 0), 0);
  }, [couriers]);

  const averageBasketCOD = useMemo(() => {
    if (deliveries.length === 0) return 0;
    return Math.round(totalVolumeCOD / deliveries.length);
  }, [totalVolumeCOD, deliveries]);

  // --- 3. KEY INDICATOR: NOMBRE D'UTILISATEURS & FLOTTE ---
  const totalUsersCount = useMemo(() => {
    return merchants.length + couriers.length;
  }, [merchants, couriers]);

  const activeMerchants = useMemo(() => merchants.filter((m) => m.status === 'actif'), [merchants]);
  const activeCouriers = useMemo(() => couriers.filter((c) => c.status === 'en_ligne' || c.status === 'en_course'), [couriers]);
  const onlineCouriers = useMemo(() => couriers.filter((c) => c.status === 'en_ligne'), [couriers]);
  const busyCouriers = useMemo(() => couriers.filter((c) => c.status === 'en_course'), [couriers]);
  const pendingKycCount = useMemo(() => kycRequests.filter((k) => k.status === 'en_attente').length, [kycRequests]);

  // Geographic Distribution by Commune
  const topCommunes = useMemo(() => {
    const counts: Record<string, { count: number; volume: number }> = {};
    deliveries.forEach((d) => {
      const commune = d.dropoffLocation.commune || 'Cotonou - Centre';
      if (!counts[commune]) counts[commune] = { count: 0, volume: 0 };
      counts[commune].count += 1;
      counts[commune].volume += d.itemValueCOD || 0;
    });

    return Object.entries(counts)
      .map(([commune, data]) => ({ commune, count: data.count, volume: data.volume }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [deliveries]);

  // Channel Distribution
  const channelStats = useMemo(() => {
    const channels: Record<string, number> = { WhatsApp: 0, Instagram: 0, TikTok: 0, 'E-commerce': 0 };
    deliveries.forEach((d) => {
      const ch = d.channel || 'WhatsApp';
      if (channels[ch] !== undefined) {
        channels[ch] += 1;
      } else {
        channels[ch] = 1;
      }
    });
    const total = Math.max(1, deliveries.length);
    return Object.entries(channels).map(([channel, count]) => ({
      channel,
      count,
      percent: Math.round((count / total) * 100),
    }));
  }, [deliveries]);

  // Unified Central Activity Stream
  const activityEvents = useMemo(() => {
    const events: Array<{
      id: string;
      category: 'delivery' | 'finance' | 'security' | 'user';
      title: string;
      subtitle: string;
      time: string;
      badgeText: string;
      badgeColor: string;
      rawDate: number;
    }> = [];

    // From deliveries
    deliveries.forEach((d, idx) => {
      events.push({
        id: `deliv-${d.id}-${idx}`,
        category: 'delivery',
        title: `Course ${d.id} • ${d.status === 'livree' ? 'Validée POD' : d.status === 'en_cours' ? 'En livraison' : 'Créée'}`,
        subtitle: `${d.pickupLocation.commune} ➔ ${d.dropoffLocation.commune} (${(d.itemValueCOD || 0).toLocaleString('fr-FR')} FCFA COD)`,
        time: d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '10:45',
        badgeText: d.status.toUpperCase(),
        badgeColor: d.status === 'livree' ? 'text-emerald-700 bg-emerald-50' : d.status === 'echec' ? 'text-red-700 bg-red-50' : 'text-blue-700 bg-blue-50',
        rawDate: d.createdAt ? new Date(d.createdAt).getTime() : Date.now() - idx * 3600000,
      });
    });

    // From audit logs
    auditLogs.forEach((log, idx) => {
      events.push({
        id: `audit-${log.id}-${idx}`,
        category: log.type === 'pricing' ? 'finance' : log.type === 'security' || log.type === 'system' ? 'security' : 'user',
        title: log.title,
        subtitle: log.details,
        time: log.timestamp || '12:00',
        badgeText: log.type.toUpperCase(),
        badgeColor: log.type === 'security' ? 'text-purple-700 bg-purple-50' : log.type === 'pricing' ? 'text-amber-700 bg-amber-50' : 'text-slate-700 bg-slate-100',
        rawDate: Date.now() - (idx + 1) * 1800000,
      });
    });

    // Filter and sort
    return events
      .filter((ev) => {
        if (activityFeedFilter === 'all') return true;
        return ev.category === activityFeedFilter;
      })
      .sort((a, b) => b.rawDate - a.rawDate)
      .slice(0, 8);
  }, [deliveries, auditLogs, activityFeedFilter]);

  // Quick Action: Simulate a realistic delivery
  const handleQuickSimulateCourse = () => {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const newCourse = createDelivery({
      clientName: 'Astride Hounhouigan',
      clientPhone: '+229 97 ' + Math.floor(10 + Math.random() * 89) + ' ' + Math.floor(10 + Math.random() * 89) + ' ' + Math.floor(10 + Math.random() * 89),
      channel: 'WhatsApp',
      pickupLocation: {
        name: 'Boutique Cotonou Chic',
        address: 'Rue de la Haie Vive, Cotonou',
        commune: 'Cotonou - Haie Vive',
        coordinates: [6.3571, 2.4175],
      },
      dropoffLocation: {
        name: 'Astride Hounhouigan',
        address: 'Carrefour Kpota, Calavi',
        commune: 'Abomey-Calavi - Centre',
        coordinates: [6.4485, 2.3556],
      },
      itemDescription: 'Colis Cosmétique & Accessoires',
      itemWeightKg: 1.2,
      itemFormat: 'S',
      isFragile: false,
      itemValueCOD: 22000,
      deliveryFee: 2500,
      status: 'en_attente',
      statusNote: 'Nouvelle course simulée depuis le tableau de bord de supervision.',
    });
    showToast(`🚀 Course express ${newCourse.id} créée avec succès !`, 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. EXECUTIVE OPERATIONAL HEADER */}
      <section className="bg-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-xl border border-slate-800 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black tracking-wide">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>PLATEFORME EN DIRECT • TOUS LES SYSTÈMES OPÉRATIONNELS</span>
              </span>

              {featureFlags.emergencyBroadcastActive && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-black animate-pulse">
                  <span className="material-symbols-outlined text-sm">campaign</span>
                  <span>Alerte Urgence Active</span>
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-white">
              Tour de Contrôle &amp; Supervision Centrale
            </h2>

            <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
              <span>Bénin (Grand Cotonou, Calavi, Porto-Novo)</span>
              <span aria-hidden="true">·</span>
              <span>Tarification 100 FCFA/km</span>
              <span aria-hidden="true">·</span>
              <span>Validation Tri-Factor POD Active</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 font-bold">{activeCouriers.length} coursiers disponibles</span>
            </div>
          </div>

          {/* Quick Action Center */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Timeframe selector */}
            <div className="inline-flex items-center p-1 bg-slate-800/80 rounded-xl border border-slate-700/80 text-xs">
              <button
                type="button"
                onClick={() => setTimeframe('today')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  timeframe === 'today' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Aujourd'hui
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('7days')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  timeframe === '7days' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                7 jours
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  timeframe === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Global
              </button>
            </div>

            <button
              type="button"
              onClick={handleQuickSimulateCourse}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              title="Créer instantanément une course test pour surveiller le flux"
            >
              <span className="material-symbols-outlined text-sm">add_circle</span>
              <span>+ Simuler course</span>
            </button>

            <button
              type="button"
              onClick={() => navigateToTab('features')}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              title="Ouvrir le directeur des fonctionnalités"
            >
              <span>👑</span>
              <span>Régulateur</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. THE 3 MANDATORY CORE INDICATOR HUBS */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* HUB 1: LIVRAISONS ACTIVES */}
        <div
          onClick={() => navigateToTab('deliveries')}
          className="bg-white rounded-3xl p-6 border-2 border-slate-200/90 shadow-sm hover:border-blue-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.99]"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-xl">local_shipping</span>
                </div>
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Indicateur 1 • Flux Opérationnel
                  </h3>
                  <div className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                    Livraisons Actives
                  </div>
                </div>
              </div>
              <span className="material-symbols-outlined text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </div>

            {/* Main Primary Value */}
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
                  {activeDeliveries.length}
                </span>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  en mouvement
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Sur un total de <span className="font-bold text-slate-800">{deliveries.length} courses</span> enregistrées.
              </p>
            </div>

            {/* Visual Operational Breakdown */}
            <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>En attente de coursier :</span>
                </span>
                <span className="font-mono font-bold text-slate-900">{pendingDeliveries.length}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  <span>En transit vers client :</span>
                </span>
                <span className="font-mono font-bold text-slate-900">{inTransitDeliveries.length}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Livrées &amp; certifiées POD :</span>
                </span>
                <span className="font-mono font-bold text-emerald-700">{deliveredOrders.length}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span>Échecs / Litiges :</span>
                </span>
                <span className="font-mono font-bold text-red-600">{disputeOrders.length}</span>
              </div>
            </div>
          </div>

          {/* Footer Badge */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Taux de succès POD :</span>
            <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
              {podSuccessRate}% (OTP + Photo + Signature)
            </span>
          </div>
        </div>

        {/* HUB 2: VOLUME TOTAL & FINANCE */}
        <div
          onClick={() => navigateToTab('pricing')}
          className="bg-white rounded-3xl p-6 border-2 border-slate-200/90 shadow-sm hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.99]"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-xl">payments</span>
                </div>
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Indicateur 2 • Économie Plateforme
                  </h3>
                  <div className="text-sm font-black text-slate-900 group-hover:text-emerald-600 transition-colors">
                    Volume Total Traité
                  </div>
                </div>
              </div>
              <span className="material-symbols-outlined text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </div>

            {/* Main Primary Value */}
            <div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                  {totalVolumeCOD.toLocaleString('fr-FR')}
                </span>
                <span className="text-sm font-bold text-emerald-700">FCFA</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Volume brut des marchandises encaissées à la livraison (COD).
              </p>
            </div>

            {/* Financial Breakdown */}
            <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Frais de livraison générés :</span>
                <span className="font-mono font-bold text-slate-900">
                  {totalDeliveryFees.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Commissions plateforme ({pricingRules?.commissionRatePercent ?? 10}%) :</span>
                <span className="font-mono font-bold text-emerald-700">
                  +{totalPlatformCommissions.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Cautions coursiers en dépôt :</span>
                <span className="font-mono font-bold text-blue-700">
                  {totalCouriersWalletDeposit.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Panier moyen par commande :</span>
                <span className="font-mono font-bold text-slate-800">
                  {averageBasketCOD.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>
          </div>

          {/* Footer Badge */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Règlement :</span>
            <span className="font-bold text-slate-700">
              100% Cash-on-Delivery &amp; Mobile Money
            </span>
          </div>
        </div>

        {/* HUB 3: NOMBRE TOTAL D'UTILISATEURS */}
        <div
          onClick={() => navigateToTab('users')}
          className="bg-white rounded-3xl p-6 border-2 border-slate-200/90 shadow-sm hover:border-purple-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group active:scale-[0.99]"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-xl">group</span>
                </div>
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Indicateur 3 • Écosystème
                  </h3>
                  <div className="text-sm font-black text-slate-900 group-hover:text-purple-600 transition-colors">
                    Nombre d'Utilisateurs
                  </div>
                </div>
              </div>
              <span className="material-symbols-outlined text-slate-300 group-hover:text-purple-600 group-hover:translate-x-1 transition-all">
                arrow_forward
              </span>
            </div>

            {/* Main Primary Value */}
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
                  {totalUsersCount}
                </span>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                  partenaires actifs
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Comptes marchands e-commerce et livreurs certifiés.
              </p>
            </div>

            {/* Users Breakdown */}
            <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-emerald-600">store</span>
                  <span>Boutiques marchandes :</span>
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {activeMerchants.length} <span className="text-slate-400 font-normal">/ {merchants.length}</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-blue-600">two_wheeler</span>
                  <span>Livreurs opérationnels :</span>
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {activeCouriers.length} <span className="text-slate-400 font-normal">/ {couriers.length}</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Livreurs en ligne :</span>
                </span>
                <span className="font-mono font-bold text-emerald-700">{onlineCouriers.length}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>Dossiers KYC en attente :</span>
                </span>
                <span className="font-mono font-bold text-amber-700">{pendingKycCount}</span>
              </div>
            </div>
          </div>

          {/* Footer Badge */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Accréditation CNI &amp; Permis :</span>
            <span className="font-bold text-emerald-700">
              {Math.round(((couriers.length - pendingKycCount) / Math.max(1, couriers.length)) * 100)}% validés
            </span>
          </div>
        </div>
      </section>

      {/* 3. CENTRALIZED PLATFORM ACTIVITY MONITORING (VUE CENTRALISÉE DES ACTIVITÉS) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Real-Time Platform Activity Stream */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                <span>Fil d'Activité en Direct de la Plateforme</span>
              </h3>
              <p className="text-xs text-slate-500">
                Suivi chronologique des courses, validations OTP, cautions et opérations système
              </p>
            </div>

            {/* Segmented Filter */}
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl text-xs font-bold self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setActivityFeedFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  activityFeedFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Tous
              </button>
              <button
                type="button"
                onClick={() => setActivityFeedFilter('delivery')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  activityFeedFilter === 'delivery' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Courses
              </button>
              <button
                type="button"
                onClick={() => setActivityFeedFilter('finance')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  activityFeedFilter === 'finance' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Finances
              </button>
              <button
                type="button"
                onClick={() => setActivityFeedFilter('security')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  activityFeedFilter === 'security' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Sécurité
              </button>
            </div>
          </div>

          {/* Activity Events List */}
          <div className="divide-y divide-slate-100">
            {activityEvents.map((ev) => (
              <div key={ev.id} className="py-3 flex items-start justify-between gap-3 text-xs hover:bg-slate-50/70 p-2 rounded-xl transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shrink-0 ${ev.badgeColor}`}>
                    {ev.badgeText}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{ev.title}</p>
                    <p className="text-slate-500 text-[11px] truncate mt-0.5">{ev.subtitle}</p>
                  </div>
                </div>
                <span className="font-mono text-[11px] text-slate-400 shrink-0 font-medium">{ev.time}</span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400">Total logs audités : {auditLogs.length} événements</span>
            <button
              type="button"
              onClick={() => navigateToTab('audit')}
              className="text-blue-600 font-bold hover:underline flex items-center gap-1"
            >
              <span>Consulter le journal d'audit complet</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Right Column (1 span): Geographic Breakdown & Readiness */}
        <div className="space-y-6">
          {/* Geographic Breakdown */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-blue-600">location_on</span>
                  <span>Top Communes Desservies</span>
                </h3>
                <p className="text-xs text-slate-400">Répartition du volume des courses</p>
              </div>
              <span className="text-[11px] font-bold text-slate-500">Bénin</span>
            </div>

            <div className="space-y-3">
              {topCommunes.map((comm) => (
                <div key={comm.commune} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{comm.commune}</span>
                    <span className="font-mono font-bold text-slate-900">
                      {comm.count} courses ({comm.volume.toLocaleString('fr-FR')} F)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.round((comm.count / Math.max(1, deliveries.length)) * 100))}%`,
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Channels Breakdown */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-emerald-600">share</span>
                  <span>Canaux de Vente Marchands</span>
                </h3>
                <p className="text-xs text-slate-400">Origine des flux de commandes</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {channelStats.map((st) => (
                <div key={st.channel} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">{st.channel}</span>
                    <span className="font-mono font-bold text-blue-600">{st.percent}%</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{st.count} commandes</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. SUPERVISION SHORTCUTS & MANAGEMENT MATRIX */}
      <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base text-amber-500">dashboard_customize</span>
              <span>Modules de Pilotage Opérationnel de l'Administrateur</span>
            </h3>
            <p className="text-xs text-slate-500">Accès direct aux modules de gestion de la plateforme</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <button
            type="button"
            onClick={() => navigateToTab('deliveries')}
            className="p-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-2xl flex flex-col items-center justify-center text-center gap-1.5 transition-all active:scale-95 cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center material-symbols-outlined text-lg group-hover:scale-110 transition-transform">
              local_shipping
            </span>
            <span className="font-bold text-xs text-slate-800">Courses ({deliveries.length})</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('couriers')}
            className="p-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-2xl flex flex-col items-center justify-center text-center gap-1.5 transition-all active:scale-95 cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center material-symbols-outlined text-lg group-hover:scale-110 transition-transform">
              two_wheeler
            </span>
            <span className="font-bold text-xs text-slate-800">Livreurs ({couriers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('merchants')}
            className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-2xl flex flex-col items-center justify-center text-center gap-1.5 transition-all active:scale-95 cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center material-symbols-outlined text-lg group-hover:scale-110 transition-transform">
              storefront
            </span>
            <span className="font-bold text-xs text-slate-800">Vendeurs ({merchants.length})</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('features')}
            className="p-3 bg-amber-50 hover:bg-amber-100/80 border border-amber-200 hover:border-amber-300 rounded-2xl flex flex-col items-center justify-center text-center gap-1.5 transition-all active:scale-95 cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center text-base font-black group-hover:scale-110 transition-transform">
              👑
            </span>
            <span className="font-bold text-xs text-amber-950">Directeur</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('kyc')}
            className="p-3 bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 rounded-2xl flex flex-col items-center justify-center text-center gap-1.5 transition-all active:scale-95 cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center material-symbols-outlined text-lg group-hover:scale-110 transition-transform">
              badge
            </span>
            <span className="font-bold text-xs text-slate-800">KYC ({pendingKycCount})</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('pricing')}
            className="p-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-2xl flex flex-col items-center justify-center text-center gap-1.5 transition-all active:scale-95 cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center material-symbols-outlined text-lg group-hover:scale-110 transition-transform">
              tune
            </span>
            <span className="font-bold text-xs text-slate-800">Tarifs 100 F/km</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('disputes')}
            className="p-3 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-300 rounded-2xl flex flex-col items-center justify-center text-center gap-1.5 transition-all active:scale-95 cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center material-symbols-outlined text-lg group-hover:scale-110 transition-transform">
              gavel
            </span>
            <span className="font-bold text-xs text-slate-800">Litiges ({disputeOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('tests')}
            className="p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-2xl flex flex-col items-center justify-center text-center gap-1.5 transition-all active:scale-95 cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center material-symbols-outlined text-lg group-hover:scale-110 transition-transform">
              science
            </span>
            <span className="font-bold text-xs text-slate-800">Tests Auto (9)</span>
          </button>
        </div>
      </section>
    </div>
  );
};
