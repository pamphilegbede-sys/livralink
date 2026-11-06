import React, { useState, useMemo } from 'react';
import { useApp, AdminTab } from '../../context/AppContext';

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
    createDelivery,
    showToast,
  } = useApp();

  const navigateToTab = (tab: AdminTab) => {
    if (onNavigateTab) {
      onNavigateTab(tab);
    } else {
      setAdminActiveTab(tab);
    }
  };

  const [timeframe, setTimeframe] = useState<'today' | '7days' | 'month' | 'all'>('today');
  const [activityFeedFilter, setActivityFeedFilter] = useState<'all' | 'delivery' | 'finance' | 'security'>('all');

  // Indicators
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

  const totalUsersCount = useMemo(() => {
    return merchants.length + couriers.length;
  }, [merchants, couriers]);

  const activeMerchants = useMemo(() => merchants.filter((m) => m.status === 'actif'), [merchants]);
  const activeCouriers = useMemo(() => couriers.filter((c) => c.status === 'en_ligne' || c.status === 'en_course'), [couriers]);
  const pendingKycCount = useMemo(() => kycRequests.filter((k) => k.status === 'en_attente').length, [kycRequests]);

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

  const activityEvents = useMemo(() => {
    const events: Array<{
      id: string;
      category: 'delivery' | 'finance' | 'security' | 'user';
      title: string;
      subtitle: string;
      time: string;
      statusText: string;
      rawDate: number;
    }> = [];

    deliveries.forEach((d, idx) => {
      events.push({
        id: `deliv-${d.id}-${idx}`,
        category: 'delivery',
        title: `Course ${d.id} · ${d.status === 'livree' ? 'Livrée (POD)' : d.status === 'en_cours' ? 'En livraison' : 'En attente'}`,
        subtitle: `${d.pickupLocation.commune} ➔ ${d.dropoffLocation.commune} (${(d.itemValueCOD || 0).toLocaleString('fr-FR')} FCFA)`,
        time: d.createdAt ? new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '10:45',
        statusText: d.status.toUpperCase(),
        rawDate: d.createdAt ? new Date(d.createdAt).getTime() : Date.now() - idx * 3600000,
      });
    });

    auditLogs.forEach((log, idx) => {
      events.push({
        id: `audit-${log.id}-${idx}`,
        category: log.type === 'pricing' ? 'finance' : log.type === 'security' || log.type === 'system' ? 'security' : 'user',
        title: log.title,
        subtitle: log.details,
        time: log.timestamp || '12:00',
        statusText: log.type.toUpperCase(),
        rawDate: Date.now() - (idx + 1) * 1800000,
      });
    });

    return events
      .filter((ev) => {
        if (activityFeedFilter === 'all') return true;
        return ev.category === activityFeedFilter;
      })
      .sort((a, b) => b.rawDate - a.rawDate)
      .slice(0, 6);
  }, [deliveries, auditLogs, activityFeedFilter]);

  const handleQuickSimulateCourse = () => {
    const newCourse = createDelivery({
      clientName: 'Astride Hounhouigan',
      clientPhone: '+229 97 45 67 89',
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
      statusNote: 'Nouvelle course simulée depuis la supervision',
    });
    showToast(`Course ${newCourse.id} créée avec succès !`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* 1. Executive Top Header */}
      <section className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Supervision en direct · Grand Cotonou &amp; Calavi</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Tour de Contrôle Admin
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {activeCouriers.length} coursiers actifs · Tarification 100 FCFA/km · Validation POD Tri-Factor
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center p-1 bg-slate-800 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setTimeframe('today')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                timeframe === 'today' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Aujourd'hui
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('7days')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                timeframe === '7days' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              7 jours
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                timeframe === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Global
            </button>
          </div>

          <button
            type="button"
            onClick={handleQuickSimulateCourse}
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">add</span>
            <span>Simuler course</span>
          </button>
        </div>
      </section>

      {/* 2. Primary 3 Indicator Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Hub 1: Livraisons Actives */}
        <div
          onClick={() => navigateToTab('deliveries')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 hover:border-blue-500 transition-colors cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span className="font-medium">FLUX OPÉRATIONNEL</span>
              <span className="material-symbols-outlined text-blue-600 text-lg">local_shipping</span>
            </div>
            <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {activeDeliveries.length}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {pendingDeliveries.length} en attente · {inTransitDeliveries.length} en transit · {deliveredOrders.length} livrées
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>Taux POD :</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{podSuccessRate}%</span>
          </div>
        </div>

        {/* Hub 2: Volume Total COD */}
        <div
          onClick={() => navigateToTab('pricing')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 transition-colors cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span className="font-medium">ÉCONOMIE PLATEFORME</span>
              <span className="material-symbols-outlined text-emerald-600 text-lg">payments</span>
            </div>
            <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {totalVolumeCOD.toLocaleString('fr-FR')} <span className="text-sm font-normal text-slate-400">FCFA</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Frais générés : {totalDeliveryFees.toLocaleString('fr-FR')} FCFA · Com ({pricingRules?.commissionRatePercent ?? 10}%) : +{totalPlatformCommissions.toLocaleString('fr-FR')} FCFA
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>Mode d'encaissement :</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">100% Cash &amp; MoMo</span>
          </div>
        </div>

        {/* Hub 3: Partenaires & Flotte */}
        <div
          onClick={() => navigateToTab('users')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 hover:border-purple-500 transition-colors cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span className="font-medium">ÉCOSYSTÈME</span>
              <span className="material-symbols-outlined text-purple-600 text-lg">group</span>
            </div>
            <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {totalUsersCount}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {activeMerchants.length} boutiques marchandes · {activeCouriers.length} livreurs actifs
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>KYC en attente :</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">{pendingKycCount} dossiers</span>
          </div>
        </div>
      </section>

      {/* 3. Centralized Activity & Top Communes */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                Fil d'Activité en Direct
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Événements récents et journal de la plateforme</p>
            </div>

            <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium">
              <button
                onClick={() => setActivityFeedFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  activityFeedFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => setActivityFeedFilter('delivery')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  activityFeedFilter === 'delivery' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Courses
              </button>
              <button
                onClick={() => setActivityFeedFilter('finance')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  activityFeedFilter === 'finance' ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Finances
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {activityEvents.map((ev) => (
              <div key={ev.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">{ev.title}</div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] truncate mt-0.5">{ev.subtitle}</div>
                </div>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">{ev.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-bold text-sm text-slate-900 dark:text-white">Top Communes</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Répartition du volume des courses</p>
          </div>

          <div className="space-y-3 text-xs">
            {topCommunes.map((comm) => (
              <div key={comm.commune} className="space-y-1">
                <div className="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
                  <span>{comm.commune}</span>
                  <span className="font-mono">{comm.count} courses</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.round((comm.count / Math.max(1, deliveries.length)) * 100))}%`,
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Quick Modules Grid */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Modules d'Administration
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs">
          <button
            type="button"
            onClick={() => navigateToTab('deliveries')}
            className="p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-blue-600 text-lg">local_shipping</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">Courses ({deliveries.length})</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('couriers')}
            className="p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-blue-600 text-lg">two_wheeler</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">Livreurs ({couriers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('merchants')}
            className="p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-emerald-600 text-lg">storefront</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">Vendeurs ({merchants.length})</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('features')}
            className="p-3 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100/60 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <span className="text-base">👑</span>
            <span className="font-medium text-amber-900 dark:text-amber-200">Directeur</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('kyc')}
            className="p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-purple-600 text-lg">badge</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">KYC ({pendingKycCount})</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('pricing')}
            className="p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-emerald-600 text-lg">tune</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">Tarifs</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('disputes')}
            className="p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-red-600 text-lg">gavel</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">Litiges ({disputeOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToTab('tests')}
            className="p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-indigo-600 text-lg">science</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">Tests</span>
          </button>
        </div>
      </section>
    </div>
  );
};
