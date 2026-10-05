import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { DeliveryOrder } from '../../types';

export const VendeurDashboard: React.FC = () => {
  const {
    deliveries,
    setCurrentView,
    setSelectedDelivery,
    openWhatsAppModal,
    setIsPODModalOpen,
    updateDeliveryStatus,
    showToast,
    userProfile,
    merchantSettings,
  } = useApp();

  const greetingName = userProfile?.fullName || merchantSettings.managerName || merchantSettings.storeName || 'Commerçant';

  const [activeFilter, setActiveFilter] = useState<'all' | 'en_attente' | 'en_cours' | 'livree' | 'echec'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Counters
  const totalCount = deliveries.length;
  const pendingCount = deliveries.filter((d) => d.status === 'en_attente' || d.status === 'assignee').length;
  const inProgressCount = deliveries.filter((d) => d.status === 'en_cours' || d.status === 'acceptee' || d.status === 'colis_recupere').length;
  const deliveredCount = deliveries.filter((d) => d.status === 'livree').length;
  const failedCount = deliveries.filter((d) => d.status === 'echec').length;

  // Filtered deliveries
  const filteredDeliveries = deliveries.filter((order) => {
    // Tab filter
    if (activeFilter === 'en_attente' && !(order.status === 'en_attente' || order.status === 'assignee')) return false;
    if (activeFilter === 'en_cours' && !(order.status === 'en_cours' || order.status === 'acceptee' || order.status === 'colis_recupere')) return false;
    if (activeFilter === 'livree' && order.status !== 'livree') return false;
    if (activeFilter === 'echec' && order.status !== 'echec') return false;

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchId = order.id.toLowerCase().includes(q);
      const matchName = order.clientName.toLowerCase().includes(q);
      const matchPhone = order.clientPhone.includes(q);
      const matchDestination = order.dropoffLocation.commune.toLowerCase().includes(q) || order.dropoffLocation.address.toLowerCase().includes(q);
      return matchId || matchName || matchPhone || matchDestination;
    }
    return true;
  });

  const handleInspectDelivery = (order: DeliveryOrder) => {
    setSelectedDelivery(order);
    setCurrentView('vendeur_tracking');
  };

  const handleOpenPOD = (order: DeliveryOrder) => {
    setSelectedDelivery(order);
    setIsPODModalOpen(true);
  };

  const handleWhatsAppAction = (order: DeliveryOrder) => {
    const msg = `Bonjour ${order.clientName}, votre commande chez Boutique Glam Chic (${order.id}) est suivie sur LivraLink. Votre coursier est en route !`;
    openWhatsAppModal(order.clientPhone, order.clientName, msg);
  };

  const handleRelaunchSearch = (orderId: string) => {
    updateDeliveryStatus(orderId, 'en_attente', 'Recherche coursier relancée (Rayon 4 km)');
    showToast(`Recherche de coursier relancée pour ${orderId}`, 'info');
  };

  const handleReschedule = (orderId: string) => {
    updateDeliveryStatus(orderId, 'en_attente', 'Reprogrammation validée par le vendeur');
    showToast(`Course ${orderId} reprogrammée au statut En attente.`, 'success');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <Header
          title={`Bonjour, ${greetingName} 👋`}
          subtitle="Voici la situation de vos expéditions aujourd'hui"
        />

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          {/* Quick Header and Search for Mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                Tableau de bord Vendeur
              </h1>
              <p className="text-xs text-slate-500">Supervision directe de votre flotte et vos colis</p>
            </div>
            <button
              onClick={() => setCurrentView('vendeur_new_delivery')}
              className="py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              <span>+ Nouvelle livraison</span>
            </button>
          </div>

          {/* 1. 5 KPI Metric Cards */}
          <section aria-label="Compteurs d'activité">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
              {/* Total Livraisons */}
              <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Livraisons aujourd'hui</span>
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <span className="material-symbols-outlined text-lg">local_shipping</span>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{totalCount}</div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 font-bold">
                    <span className="material-symbols-outlined text-sm">trending_up</span>
                    <span>+12% vs hier</span>
                  </div>
                </div>
              </div>

              {/* En attente */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">En attente</span>
                  <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                    <span className="material-symbols-outlined text-lg">hourglass_top</span>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-extrabold text-amber-700">{pendingCount}</div>
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    Recherche de coursier
                  </span>
                </div>
              </div>

              {/* En cours */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">En cours</span>
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <span className="material-symbols-outlined text-lg">two_wheeler</span>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-extrabold text-blue-700">{inProgressCount}</div>
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                    En transit / prise en charge
                  </span>
                </div>
              </div>

              {/* Livrées */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Livrées</span>
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700">{deliveredCount}</div>
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <span className="material-symbols-outlined text-xs">done_all</span>
                    Validées avec POD
                  </span>
                </div>
              </div>

              {/* Échecs */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Échecs</span>
                  <div className="p-2 rounded-xl bg-red-50 text-red-600">
                    <span className="material-symbols-outlined text-lg">warning</span>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl sm:text-3xl font-extrabold text-red-700">{failedCount}</div>
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                    À reprogrammer
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Live Operational Alert Banner */}
          <section className="rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/90 via-white to-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <span className="material-symbols-outlined text-xl">radar</span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900">
                    Activité directe : Course #LL-4192 en cours d'acheminement
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    À 4 min de la cliente
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Livreur David T. se dirige vers Cocody Danga • ETA 14:38 • Code OTP envoyé par SMS
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <button
                onClick={() => setCurrentView('vendeur_tracking')}
                className="px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Voir sur la carte
              </button>
              <button
                onClick={() => {
                  const target = deliveries.find((d) => d.id === '#LL-4192');
                  if (target) handleWhatsAppAction(target);
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Aviser la cliente
              </button>
            </div>
          </section>

          {/* 3. Deliveries Table and Filter Tabs */}
          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeFilter === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Toutes ({totalCount})
                </button>
                <button
                  onClick={() => setActiveFilter('en_attente')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'en_attente' ? 'bg-white text-amber-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  En attente ({pendingCount})
                </button>
                <button
                  onClick={() => setActiveFilter('en_cours')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'en_cours' ? 'bg-white text-blue-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  En cours ({inProgressCount})
                </button>
                <button
                  onClick={() => setActiveFilter('livree')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'livree' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Livrées ({deliveredCount})
                </button>
                <button
                  onClick={() => setActiveFilter('echec')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'echec' ? 'bg-white text-red-700 shadow-xs font-bold' : 'text-slate-600 hover:text-red-700'
                  }`}
                >
                  Échecs ({failedCount})
                </button>
              </div>

              {/* Search & Export */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrer client, ID..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <button
                  onClick={() => showToast('Export CSV généré avec succès !', 'success')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 shrink-0"
                >
                  <span className="material-symbols-outlined text-sm">file_download</span>
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Destination</th>
                    <th className="py-3 px-4">Livreur</th>
                    <th className="py-3 px-4">Statut</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredDeliveries.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                        {order.id}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{order.clientName}</div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-xs text-emerald-600">chat</span>
                          <span>{order.clientPhone}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{order.dropoffLocation.commune}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">{order.dropoffLocation.address}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        {order.courier ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
                              {order.courier.avatarInitials}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{order.courier.name}</div>
                              <div className="text-[10px] text-amber-600 font-bold flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-xs">star</span>
                                <span>{order.courier.rating}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 italic">
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                            <span>Non assigné</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {order.status === 'en_cours' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                            🚚 En cours de livraison
                          </span>
                        )}
                        {order.status === 'acceptee' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                            🟣 Course acceptée
                          </span>
                        )}
                        {order.status === 'assignee' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                            🔵 Assignée
                          </span>
                        )}
                        {order.status === 'en_attente' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            🟡 En attente
                          </span>
                        )}
                        {order.status === 'livree' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
                            <span className="material-symbols-outlined text-xs">check_circle</span>
                            🟢 Livrée (POD)
                          </span>
                        )}
                        {order.status === 'echec' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-300">
                            <span className="material-symbols-outlined text-xs">error</span>
                            🔴 Échec (Client injoignable)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => handleWhatsAppAction(order)}
                            className="p-1.5 rounded-lg border border-slate-200 text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="Contacter sur WhatsApp"
                          >
                            <span className="material-symbols-outlined text-base">chat</span>
                          </button>

                          {order.status === 'en_cours' && (
                            <button
                              onClick={() => handleInspectDelivery(order)}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold transition-colors"
                            >
                              Suivi direct
                            </button>
                          )}

                          {order.status === 'acceptee' && (
                            <button
                              onClick={() => handleInspectDelivery(order)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors"
                            >
                              Voir détails
                            </button>
                          )}

                          {order.status === 'en_attente' && (
                            <button
                              onClick={() => handleRelaunchSearch(order.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors"
                            >
                              Relancer recherche
                            </button>
                          )}

                          {order.status === 'livree' && (
                            <button
                              onClick={() => handleOpenPOD(order)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold transition-colors flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-xs">receipt_long</span>
                              <span>Preuve POD</span>
                            </button>
                          )}

                          {order.status === 'echec' && (
                            <button
                              onClick={() => handleReschedule(order.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 font-bold transition-colors"
                            >
                              Reprogrammer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Architecture (from Stitch mobile mockup) */}
            <div className="md:hidden divide-y divide-slate-100 p-3 space-y-3">
              {filteredDeliveries.map((order) => (
                <article key={order.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-blue-700">{order.id}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                      {order.status === 'en_cours' && '🚚 En cours'}
                      {order.status === 'acceptee' && '🟣 Acceptée'}
                      {order.status === 'en_attente' && '🟡 En attente'}
                      {order.status === 'livree' && '🟢 Livrée'}
                      {order.status === 'echec' && '🔴 Échec'}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-900">{order.clientName}</span>
                      <span className="text-slate-500 font-mono">{order.clientPhone}</span>
                    </div>
                    <p className="text-slate-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">location_on</span>
                      <span>{order.dropoffLocation.commune}</span>
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="font-bold text-slate-700">
                      {order.courier ? `${order.courier.name} (${order.courier.rating}★)` : 'Non assigné'}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleWhatsAppAction(order)}
                        className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200"
                      >
                        <span className="material-symbols-outlined text-sm">chat</span>
                      </button>
                      <button
                        onClick={() => handleInspectDelivery(order)}
                        className="px-2.5 py-1 bg-blue-600 text-white font-bold rounded-lg text-xs"
                      >
                        Détails
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Pagination Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <p>Affichage de <strong className="text-slate-900">{filteredDeliveries.length}</strong> sur <strong>{totalCount}</strong> livraisons enregistrées</p>
              <div className="flex items-center gap-1">
                <button className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 font-bold">1</button>
                <button className="px-2.5 py-1 rounded hover:bg-slate-100">2</button>
                <button className="px-2.5 py-1 rounded hover:bg-slate-100">3</button>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav />
    </div>
  );
};
