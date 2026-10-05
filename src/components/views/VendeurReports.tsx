import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';

export const VendeurReports: React.FC = () => {
  const { deliveries, setCurrentView, showToast } = useApp();
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'year'>('week');

  const totalOrders = deliveries.length;
  const deliveredOrders = deliveries.filter((d) => d.status === 'livree').length;
  const deliverySuccessRate = Math.round((deliveredOrders / (totalOrders || 1)) * 100);
  const totalCODCollected = deliveries
    .filter((d) => d.status === 'livree')
    .reduce((sum, d) => sum + (d.itemValueCOD || 0), 0);
  const totalDeliveryFees = deliveries
    .reduce((sum, d) => sum + (d.deliveryFee || 0), 0);

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
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff]">
        {/* Top Header */}
        <Header
          title="Rapports & Statistiques"
          subtitle="Analytiques des ventes, performance logistique et encaissements"
        />

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* Header Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <span className="material-symbols-outlined text-xl">insights</span>
                </span>
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Rapports &amp; Performance Vendeur</h1>
                  <p className="text-xs text-slate-500">Vue analytique consolidée de vos flux de livraison</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Period Switcher */}
              <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 text-xs font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={() => setTimeRange('today')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${timeRange === 'today' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'hover:text-slate-900'}`}
                >
                  Aujourd'hui
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('week')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${timeRange === 'week' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'hover:text-slate-900'}`}
                >
                  7 jours
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('month')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${timeRange === 'month' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'hover:text-slate-900'}`}
                >
                  Ce mois
                </button>
              </div>

              {/* Export Buttons */}
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base text-emerald-600">table_chart</span>
                <span>Export Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportPDF}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
              >
                <span className="material-symbols-outlined text-base">download</span>
                <span>Rapport PDF</span>
              </button>
            </div>
          </div>

          {/* 4 Financial & Operational KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Chiffre d'Affaires COD */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>TOTAL ENCAISSÉ (COD)</span>
                <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg material-symbols-outlined text-lg">
                  payments
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900">
                {totalCODCollected.toLocaleString('fr-FR')} <span className="text-xs font-bold text-slate-400">FCFA</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-emerald-600 font-bold">
                <span className="material-symbols-outlined text-sm">trending_up</span>
                <span>+18.4% vs période préc.</span>
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
              <div className="text-2xl sm:text-3xl font-black text-blue-900">
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
              <div className="text-2xl sm:text-3xl font-black text-slate-900">
                {totalOrders}
              </div>
              <p className="text-[11px] text-indigo-600 font-semibold">
                Délai moyen : 38 min / course
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
              <div className="text-2xl sm:text-3xl font-black text-slate-900">
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
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <span>WhatsApp Business (58%)</span>
                    </span>
                    <span className="font-bold text-slate-900">32 500 FCFA</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: '58%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-pink-500"></span>
                      <span>Instagram Direct (27%)</span>
                    </span>
                    <span className="font-bold text-slate-900">18 000 FCFA</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-pink-500 h-full rounded-full" style={{ width: '27%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-900"></span>
                      <span>TikTok Shop &amp; Live (15%)</span>
                    </span>
                    <span className="font-bold text-slate-900">9 500 FCFA</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className="bg-slate-900 h-full rounded-full" style={{ width: '15%' }}></div>
                  </div>
                </div>
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
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center">
                      1
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Cocody (Angré, Riviera, 2 Plateaux)</div>
                      <div className="text-[10px] text-slate-500">Délai moyen : 32 min</div>
                    </div>
                  </div>
                  <span className="text-xs font-black text-blue-700">46% des colis</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-xl bg-slate-200 text-slate-700 font-extrabold text-xs flex items-center justify-center">
                      2
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Marcory &amp; Zone 4</div>
                      <div className="text-[10px] text-slate-500">Délai moyen : 41 min</div>
                    </div>
                  </div>
                  <span className="text-xs font-black text-slate-700">28% des colis</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-xl bg-slate-200 text-slate-700 font-extrabold text-xs flex items-center justify-center">
                      3
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Plateau &amp; Treichville</div>
                      <div className="text-[10px] text-slate-500">Délai moyen : 45 min</div>
                    </div>
                  </div>
                  <span className="text-xs font-black text-slate-700">18% des colis</span>
                </div>
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
