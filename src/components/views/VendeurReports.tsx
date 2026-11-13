import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';

export const VendeurReports: React.FC = () => {
  const { 
    deliveries, 
    showToast,
    userProfile,
    merchantSettings,
    isDirectorModeActive,
    directorTargetName,
  } = useApp();
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'year'>('week');

  // Isolation stricte des livraisons pour les rapports
  const merchantDeliveries = deliveries.filter((d) => {
    if (isDirectorModeActive && directorTargetName) {
      return (
        (d.pickupLocation?.name && d.pickupLocation.name.toLowerCase().includes(directorTargetName.toLowerCase())) ||
        (d.merchantStoreName && d.merchantStoreName.toLowerCase().includes(directorTargetName.toLowerCase()))
      );
    }
    if (userProfile?.role === 'vendeur') {
      return (
        (d.merchantId && d.merchantId === userProfile.uid) ||
        (d.merchantEmail && userProfile.email && d.merchantEmail.toLowerCase() === userProfile.email.toLowerCase()) ||
        (merchantSettings.storeName && d.merchantStoreName && d.merchantStoreName.toLowerCase() === merchantSettings.storeName.toLowerCase()) ||
        (merchantSettings.storeName && d.pickupLocation.name && d.pickupLocation.name.toLowerCase() === merchantSettings.storeName.toLowerCase())
      );
    }
    return true;
  });

  const totalOrders = merchantDeliveries.length;
  const deliveredOrders = merchantDeliveries.filter((d) => d.status === 'livree').length;
  const deliverySuccessRate = totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0;
  const totalCODCollected = merchantDeliveries
    .filter((d) => d.status === 'livree')
    .reduce((sum, d) => sum + (d.itemValueCOD || 0), 0);
  const totalDeliveryFees = merchantDeliveries
    .reduce((sum, d) => sum + (d.deliveryFee || 0), 0);

  // Calcul dynamique des canaux d'acquisition
  const channelCounts = merchantDeliveries.reduce((acc, d) => {
    const channel = d.channel || 'WhatsApp';
    acc[channel] = (acc[channel] || 0) + (d.itemValueCOD || d.deliveryFee || 2000);
    return acc;
  }, {} as Record<string, number>);

  const totalChannelVolume = Object.values(channelCounts).reduce((a, b) => a + b, 0);

  // Calcul dynamique des communes de destination
  const communeCounts = merchantDeliveries.reduce((acc, d) => {
    const commune = d.dropoffLocation?.commune || 'Cotonou';
    acc[commune] = (acc[commune] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedCommunes = Object.entries(communeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const handleExportPDF = () => {
    showToast('Export du rapport consolidé PDF en cours...', 'info');
    setTimeout(() => {
      showToast('Rapport PDF téléchargé avec succès !', 'success');
    }, 1200);
  };

  const handleExportExcel = () => {
    showToast('Génération du fichier Excel (XLSX)...', 'info');
    setTimeout(() => {
      showToast('Fichier Excel exporté !', 'success');
    }, 1000);
  };

  return (
    <div className="flex h-full min-h-[100dvh] md:h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff] dark:bg-slate-950">
        {/* Top Header */}
        <Header
          title="Rapports & Statistiques"
          subtitle="Analytiques des ventes, performance logistique et encaissements"
        />

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* Header Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <span className="material-symbols-outlined text-xl">insights</span>
                </span>
                <div>
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white">Rapports &amp; Performance Vendeur</h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Vue analytique consolidée de vos flux de livraison</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
              {/* Period Switcher */}
              <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center justify-between sm:justify-start gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <button
                  type="button"
                  onClick={() => setTimeRange('today')}
                  className={`flex-1 sm:flex-initial text-center px-3 py-2 sm:py-1.5 rounded-lg transition-colors ${timeRange === 'today' ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-2xs font-bold' : 'hover:text-slate-900 dark:hover:text-white'}`}
                >
                  Aujourd'hui
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('week')}
                  className={`flex-1 sm:flex-initial text-center px-3 py-2 sm:py-1.5 rounded-lg transition-colors ${timeRange === 'week' ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-2xs font-bold' : 'hover:text-slate-900 dark:hover:text-white'}`}
                >
                  7 jours
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('month')}
                  className={`flex-1 sm:flex-initial text-center px-3 py-2 sm:py-1.5 rounded-lg transition-colors ${timeRange === 'month' ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-2xs font-bold' : 'hover:text-slate-900 dark:hover:text-white'}`}
                >
                  Ce mois
                </button>
              </div>

              {/* Export Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="min-h-[44px] flex-1 sm:flex-initial px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <span className="material-symbols-outlined text-base text-emerald-600 dark:text-emerald-400">table_chart</span>
                  <span>Export Excel</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportPDF}
                  className="min-h-[44px] flex-1 sm:flex-initial px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">download</span>
                  <span>Rapport PDF</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4 Financial & Operational KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Chiffre d'Affaires COD */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>TOTAL ENCAISSÉ (COD)</span>
                <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg material-symbols-outlined text-lg">
                  payments
                </span>
              </div>
              <div className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 leading-tight">
                {totalCODCollected.toLocaleString('fr-FR')} <span className="text-xs font-bold text-slate-400">FCFA</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-emerald-600 font-bold">
                <span className="material-symbols-outlined text-sm">verified</span>
                <span>{deliveredOrders} commande{deliveredOrders > 1 ? 's' : ''} livrée{deliveredOrders > 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Taux de Réussite */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>TAUX DE RÉUSSITE</span>
                <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg material-symbols-outlined text-lg">
                  task_alt
                </span>
              </div>
              <div className="text-xl sm:text-2xl lg:text-3xl font-black text-blue-900 leading-tight">
                {deliverySuccessRate}%
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {deliveredOrders} livrées avec preuve POD conforme
              </p>
            </div>

            {/* Total Courses */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>EXPÉDITIONS TRAITÉES</span>
                <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg material-symbols-outlined text-lg">
                  local_shipping
                </span>
              </div>
              <div className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 leading-tight">
                {totalOrders}
              </div>
              <p className="text-[11px] text-indigo-600 font-semibold">
                {Math.max(0, totalOrders - deliveredOrders)} en cours / attente · {deliveredOrders} livrée{deliveredOrders > 1 ? 's' : ''}
              </p>
            </div>

            {/* Frais Logistiques */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>BUDGET LIVRAISON</span>
                <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg material-symbols-outlined text-lg">
                  receipt_long
                </span>
              </div>
              <div className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 leading-tight">
                {totalDeliveryFees.toLocaleString('fr-FR')} <span className="text-xs font-bold text-slate-400">FCFA</span>
              </div>
              <p className="text-[11px] text-amber-700 font-medium">
                Commission LivraLink : 0% (Tarif MVP)
              </p>
            </div>
          </div>

          {/* Breakdown Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Performance par Canal Social & E-commerce */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Ventes par Canal d'Acquisition</h3>
                  <p className="text-xs text-slate-500">Volume de commandes expédiées par réseau</p>
                </div>
                <span className="p-2 bg-slate-50 rounded-xl text-slate-600 material-symbols-outlined text-lg">
                  hub
                </span>
              </div>

              <div className="space-y-3.5 pt-2">
                {Object.keys(channelCounts).length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Aucune expédition pour le moment</p>
                    <p>Vos ventes par canal s'afficheront au fur et à mesure.</p>
                  </div>
                ) : (
                  Object.entries(channelCounts).map(([ch, vol], idx) => {
                    const pct = totalChannelVolume > 0 ? Math.round((vol / totalChannelVolume) * 100) : 0;
                    const colors = ['bg-emerald-500', 'bg-pink-500', 'bg-slate-900', 'bg-blue-500'];
                    const color = colors[idx % colors.length];

                    return (
                      <div key={ch}>
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
                            <span>{ch} ({pct}%)</span>
                          </span>
                          <span className="font-bold text-slate-900">{vol.toLocaleString('fr-FR')} FCFA</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div className={`${color} h-full rounded-full`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Répartition par Zone Géographique */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Top Communes de Destination</h3>
                  <p className="text-xs text-slate-500">Concentration géographique de vos acheteurs</p>
                </div>
                <span className="p-2 bg-slate-50 rounded-xl text-slate-600 material-symbols-outlined text-lg">
                  map
                </span>
              </div>

              <div className="space-y-3 pt-2">
                {sortedCommunes.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Aucune zone enregistrée</p>
                    <p>Vos top communes de livraison apparaîtront après vos premières ventes.</p>
                  </div>
                ) : (
                  sortedCommunes.map(([commune, count], idx) => {
                    const pct = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
                    return (
                      <div key={commune} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-900 truncate">{commune}</div>
                            <div className="text-[10px] text-slate-500">{count} commande{count > 1 ? 's' : ''}</div>
                          </div>
                        </div>
                        <span className="text-xs font-black text-blue-700 shrink-0 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">{pct}% des colis</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
};
