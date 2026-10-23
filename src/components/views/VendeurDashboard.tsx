import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { BackButton } from '../common/BackButton';
import { DeliveryOrder } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { PaginationControls } from '../common/PaginationControls';

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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Counters
  const totalCount = deliveries.length;
  const pendingCount = deliveries.filter((d) => d.status === 'en_attente' || d.status === 'assignee').length;
  const inProgressCount = deliveries.filter((d) => d.status === 'en_cours' || d.status === 'acceptee' || d.status === 'colis_recupere').length;
  const deliveredCount = deliveries.filter((d) => d.status === 'livree').length;
  const failedCount = deliveries.filter((d) => d.status === 'echec').length;
  const liveOrder = deliveries.find((d) => d.status === 'en_cours' || d.status === 'acceptee' || d.status === 'colis_recupere');

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

  const paginatedDeliveries = filteredDeliveries.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleFilterChange = (filter: 'all' | 'en_attente' | 'en_cours' | 'livree' | 'echec') => {
    setActiveFilter(filter);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

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
    <div className="flex h-full min-h-[100dvh] md:h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
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
            <div className="flex items-center gap-3">
              <BackButton />
              <div>
                <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                  Tableau de bord Vendeur
                </h1>
                <p className="text-xs text-slate-500">Supervision directe de votre flotte et vos colis</p>
              </div>
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
          {liveOrder ? (
            <section className="rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/90 via-white to-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <span className="material-symbols-outlined text-xl">radar</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">
                      Activité directe : Course {liveOrder.id} ({liveOrder.status === 'acceptee' ? 'Course acceptée' : liveOrder.status === 'colis_recupere' ? 'Colis récupéré' : 'En acheminement'})
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {liveOrder.courier ? `Livreur : ${liveOrder.courier.name}` : 'En attente de coursier'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {liveOrder.courier
                      ? `Livreur ${liveOrder.courier.name} (${liveOrder.courier.vehicle}) • Destination : ${liveOrder.dropoffLocation.commune} • ${liveOrder.statusNote}`
                      : `En attente d'acceptation par les livreurs de la zone (${liveOrder.dropoffLocation.commune})`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  onClick={() => {
                    setSelectedDelivery(liveOrder);
                    setCurrentView('vendeur_tracking');
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Voir sur la carte
                </button>
                <button
                  onClick={() => handleWhatsAppAction(liveOrder)}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Aviser la cliente
                </button>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-white to-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <span className="material-symbols-outlined text-xl">electric_moped</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">
                      Flotte LivraLink Bénin prête &amp; connectée
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Tarif 100 F/km
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Toutes vos expéditions sont diffusées instantanément aux coursiers dès validation.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  onClick={() => setCurrentView('vendeur_new_delivery')}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  + Nouvelle livraison
                </button>
              </div>
            </section>
          )}

          {/* 3. Deliveries Table and Filter Tabs */}
          <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => handleFilterChange('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeFilter === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Toutes ({totalCount})
                </button>
                <button
                  onClick={() => handleFilterChange('en_attente')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'en_attente' ? 'bg-white text-amber-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  En attente ({pendingCount})
                </button>
                <button
                  onClick={() => handleFilterChange('en_cours')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'en_cours' ? 'bg-white text-blue-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  En cours ({inProgressCount})
                </button>
                <button
                  onClick={() => handleFilterChange('livree')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'livree' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Livrées ({deliveredCount})
                </button>
                <button
                  onClick={() => handleFilterChange('echec')}
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
                    onChange={(e) => handleSearchChange(e.target.value)}
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

            {/* Deliveries Content: Empty State vs Tables */}
            {filteredDeliveries.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon="inventory_2"
                  title="Aucune livraison trouvée"
                  description={
                    searchTerm
                      ? `Aucune course ne correspond à "${searchTerm}".`
                      : activeFilter !== 'all'
                      ? `Aucune livraison avec le statut sélectionné (${activeFilter}).`
                      : "Vous n'avez pas encore créé de livraison. Démarrez en quelques secondes."
                  }
                  actionLabel="Nouvelle livraison"
                  onAction={() => setCurrentView('vendeur_new_delivery')}
                  secondaryActionLabel={searchTerm ? 'Effacer recherche' : activeFilter !== 'all' ? 'Toutes les courses' : undefined}
                  onSecondaryAction={
                    searchTerm
                      ? () => handleSearchChange('')
                      : activeFilter !== 'all'
                      ? () => handleFilterChange('all')
                      : undefined
                  }
                />
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
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
                  {paginatedDeliveries.map((order) => (
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
            {/* Mobile Card Architecture (Full-featured touch cards) */}
            <div className="md:hidden divide-y divide-slate-100 p-3 space-y-3.5">
              {paginatedDeliveries.map((order) => (
                <article key={order.id} className="p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs space-y-3 hover:border-slate-300 transition-all">
                  {/* Header: ID + Status Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-black text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                      {order.id}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                      order.status === 'livree' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      order.status === 'en_cours' ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse' :
                      order.status === 'acceptee' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                      order.status === 'assignee' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      order.status === 'echec' ? 'bg-red-50 text-red-700 border border-red-200' :
                      'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      {order.status === 'en_cours' && '🚚 En cours'}
                      {order.status === 'acceptee' && '🟣 Course acceptée'}
                      {order.status === 'assignee' && '🔵 Assignée'}
                      {order.status === 'en_attente' && '🟡 En attente'}
                      {order.status === 'livree' && '🟢 Livrée (POD)'}
                      {order.status === 'echec' && '🔴 Échec'}
                    </span>
                  </div>

                  {/* Destination & Client details */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-extrabold text-slate-900 truncate">{order.clientName}</p>
                        <p className="text-slate-500 font-mono text-[11px] flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-xs text-emerald-600">call</span>
                          <span>{order.clientPhone}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-emerald-700 font-mono">{(order.itemValueCOD || 0).toLocaleString('fr-FR')} F</p>
                        <span className="text-[10px] text-slate-400 font-medium">COD à encaisser</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-1.5 text-slate-600 bg-slate-50 p-2 rounded-xl">
                      <span className="material-symbols-outlined text-sm text-blue-600 shrink-0 mt-0.5">location_on</span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-[11px]">{order.dropoffLocation.commune}</p>
                        <p className="text-[10px] text-slate-500 truncate">{order.dropoffLocation.address}</p>
                      </div>
                    </div>
                  </div>

                  {/* Courier & Fees Info */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="material-symbols-outlined text-sm text-slate-400">two_wheeler</span>
                      <span className="text-[11px] font-semibold text-slate-700 truncate">
                        {order.courier ? `${order.courier.name} (${order.courier.rating}★)` : 'En attente de coursier'}
                      </span>
                    </div>
                    <span className="text-[11px] text-blue-700 font-bold shrink-0">
                      Frais : {order.deliveryFee.toLocaleString('fr-FR')} F
                    </span>
                  </div>

                  {/* Mobile Action Buttons (Full Feature Parity with Desktop, Min 44px Touch Heights) */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleWhatsAppAction(order)}
                      className="min-h-[44px] px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200/80 font-bold text-xs flex items-center gap-1.5 transition-colors active:scale-95"
                      title="Contacter le client sur WhatsApp"
                    >
                      <span className="material-symbols-outlined text-base">chat</span>
                      <span>WhatsApp</span>
                    </button>

                    {order.status === 'en_cours' && (
                      <button
                        type="button"
                        onClick={() => handleInspectDelivery(order)}
                        className="min-h-[44px] flex-1 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-base">near_me</span>
                        <span>Suivi direct</span>
                      </button>
                    )}

                    {order.status === 'acceptee' && (
                      <button
                        type="button"
                        onClick={() => handleInspectDelivery(order)}
                        className="min-h-[44px] flex-1 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-base">visibility</span>
                        <span>Détails course</span>
                      </button>
                    )}

                    {order.status === 'en_attente' && (
                      <button
                        type="button"
                        onClick={() => handleRelaunchSearch(order.id)}
                        className="min-h-[44px] flex-1 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-base">radar</span>
                        <span>Relancer coursier</span>
                      </button>
                    )}

                    {order.status === 'livree' && (
                      <button
                        type="button"
                        onClick={() => handleOpenPOD(order)}
                        className="min-h-[44px] flex-1 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-base">verified</span>
                        <span>Preuve POD</span>
                      </button>
                    )}

                    {order.status === 'echec' && (
                      <button
                        type="button"
                        onClick={() => handleReschedule(order.id)}
                        className="min-h-[44px] flex-1 px-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-base">replay</span>
                        <span>Reprogrammer</span>
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>

                {/* Pagination Controls */}
                <PaginationControls
                  currentPage={currentPage}
                  totalItems={filteredDeliveries.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </section>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav />
    </div>
  );
};
