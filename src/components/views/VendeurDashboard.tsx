import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { DeliveryOrder } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { PaginationControls } from '../common/PaginationControls';

import { OnboardingGuideModal } from '../modals/OnboardingGuideModal';
import { VendeurFAQSection } from '../vendeur/VendeurFAQSection';

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
    featureFlags,
    isDirectorModeActive,
    directorTargetName,
    openLivreurSearchModal,
    openRateLivreurModal,
    openChatModal,
  } = useApp();

  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  const greetingName = userProfile?.fullName || merchantSettings.managerName || merchantSettings.storeName || 'Commerçant';

  const [activeFilter, setActiveFilter] = useState<'all' | 'en_attente' | 'en_cours' | 'livree' | 'echec'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Isolation stricte des livraisons : chaque compte marchand voit exclusivement ses propres commandes
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

  // Counters basés sur les livraisons propres à ce vendeur
  const totalCount = merchantDeliveries.length;
  const pendingCount = merchantDeliveries.filter((d) => d.status === 'en_attente' || d.status === 'assignee').length;
  const inProgressCount = merchantDeliveries.filter((d) => d.status === 'en_cours' || d.status === 'acceptee' || d.status === 'colis_recupere').length;
  const deliveredCount = merchantDeliveries.filter((d) => d.status === 'livree').length;
  const failedCount = merchantDeliveries.filter((d) => d.status === 'echec').length;
  const liveOrder = merchantDeliveries.find((d) => d.status === 'en_cours' || d.status === 'acceptee' || d.status === 'colis_recupere');

  // Filtered deliveries
  const filteredDeliveries = merchantDeliveries.filter((order) => {
    if (activeFilter === 'en_attente' && !(order.status === 'en_attente' || order.status === 'assignee')) return false;
    if (activeFilter === 'en_cours' && !(order.status === 'en_cours' || order.status === 'acceptee' || order.status === 'colis_recupere')) return false;
    if (activeFilter === 'livree' && order.status !== 'livree') return false;
    if (activeFilter === 'echec' && order.status !== 'echec') return false;

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
    if (!featureFlags.allowWhatsAppOrdering) {
      showToast("L'assistance WhatsApp client a été suspendue par l'administrateur.", 'error');
      return;
    }
    const msg = `Bonjour ${order.clientName}, votre commande chez ${merchantSettings.storeName || 'Boutique'} (${order.id}) est suivie sur LivraLink. Votre coursier est en route !`;
    openWhatsAppModal(order.clientPhone, order.clientName, msg);
  };

  const handleNewDeliveryClick = () => {
    if (!featureFlags.vendeurSpaceEnabled) {
      showToast("L'espace vendeur est actuellement verrouillé par l'administrateur.", 'error');
      return;
    }
    if (!featureFlags.allowExpressCreation) {
      showToast("La création de courses express est temporairement suspendue par l'administrateur.", 'error');
      return;
    }
    setCurrentView('vendeur_new_delivery');
  };

  const handleRelaunchSearch = (orderId: string) => {
    updateDeliveryStatus(orderId, 'en_attente', 'Recherche coursier relancée (Rayon 4 km)');
    showToast(`Recherche de coursier relancée pour ${orderId}`, 'info');
  };

  const handleReschedule = (orderId: string) => {
    updateDeliveryStatus(orderId, 'en_attente', 'Reprogrammation validée par le vendeur');
    showToast(`Course ${orderId} reprogrammée au statut En attente.`, 'success');
  };

  const scrollToFAQ = () => {
    const el = document.getElementById('vendeur-faq-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex h-full min-h-[100dvh] md:h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-['Plus_Jakarta_Sans'] transition-colors duration-200">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
        <Header
          title={`Bonjour, ${greetingName}`}
          subtitle="Aperçu et suivi synthétique de vos expéditions"
        />

        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-24 md:pb-8 max-w-7xl w-full mx-auto">
          {/* Top Page Header & Primary Actions Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Gestion des Livraisons
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-blue-900 text-xs font-bold shadow-2xs">
                  <span className="material-symbols-outlined text-sm text-blue-600 dark:text-blue-400">storefront</span>
                  <span>{merchantSettings.storeName}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Supervision en direct de vos expéditions et livreurs
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => openLivreurSearchModal()}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Trouver un livreur accrédité"
              >
                <span className="material-symbols-outlined text-base text-blue-600 dark:text-blue-400">person_search</span>
                <span>Trouver un Livreur</span>
              </button>

              <button
                type="button"
                onClick={scrollToFAQ}
                className="px-3 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/60 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Consulter la Foire Aux Questions Vendeur"
              >
                <span className="material-symbols-outlined text-base text-blue-600 dark:text-blue-400">help</span>
                <span>FAQ &amp; Aide</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOnboardingOpen(true)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                title="Guide interactif"
              >
                <span className="material-symbols-outlined text-base text-slate-500">help_outline</span>
                <span className="hidden md:inline">Guide</span>
              </button>

              <button
                type="button"
                onClick={handleNewDeliveryClick}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer active:scale-95 ${
                  !featureFlags.vendeurSpaceEnabled || !featureFlags.allowExpressCreation
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 ring-2 ring-blue-500/20'
                }`}
              >
                <span className="material-symbols-outlined text-lg">add_circle</span>
                <span>Nouvelle livraison</span>
              </button>
            </div>
          </div>

          {/* Maintenance Notice if space disabled */}
          {!featureFlags.vendeurSpaceEnabled && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-center gap-3 text-xs">
              <span className="material-symbols-outlined text-xl text-amber-600 shrink-0">admin_panel_settings</span>
              <span>L'espace vendeur est temporairement en maintenance par l'administrateur.</span>
            </div>
          )}

          {/* 1. Key Activity Metrics (Airy Single-Elevation KPI Grid) */}
          <section aria-label="Statistiques d'activité">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total aujourd'hui</span>
                  <span className="material-symbols-outlined text-slate-400 text-base">local_shipping</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">{totalCount}</span>
                  <span className="text-xs text-slate-400">expéditions</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">En attente</span>
                  <span className="material-symbols-outlined text-amber-500 text-base">hourglass_empty</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">{pendingCount}</span>
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">Recherche livreur</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">En transit</span>
                  <span className="material-symbols-outlined text-blue-500 text-base">near_me</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">{inProgressCount}</span>
                  <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">En cours</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Livrées (POD)</span>
                  <span className="material-symbols-outlined text-emerald-500 text-base">verified</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{deliveredCount}</span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Certifiées</span>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Live Order Bar (If active) */}
          {liveOrder && (
            <section className="p-4 rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-xl shrink-0">radar</span>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Course active <span className="font-mono text-blue-600 dark:text-blue-400">{liveOrder.id}</span> · {liveOrder.dropoffLocation.commune}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                    {liveOrder.courier ? `Livreur : ${liveOrder.courier.name} (${liveOrder.courier.vehicle})` : 'En attente de prise en charge par un coursier'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleInspectDelivery(liveOrder)}
                  className="px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 font-medium text-xs hover:bg-blue-50 dark:hover:bg-slate-800"
                >
                  Suivi carte
                </button>
                <button
                  onClick={() => handleWhatsAppAction(liveOrder)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium text-xs hover:bg-blue-700"
                >
                  Aviser le client
                </button>
              </div>
            </section>
          )}

          {/* 3. Deliveries Table & Controls */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            {/* Toolbar: Segmented Controls + Search */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => handleFilterChange('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Toutes ({totalCount})
                </button>
                <button
                  onClick={() => handleFilterChange('en_attente')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'en_attente' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  En attente ({pendingCount})
                </button>
                <button
                  onClick={() => handleFilterChange('en_cours')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'en_cours' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  En cours ({inProgressCount})
                </button>
                <button
                  onClick={() => handleFilterChange('livree')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'livree' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Livrées ({deliveredCount})
                </button>
                <button
                  onClick={() => handleFilterChange('echec')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeFilter === 'echec' ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 font-bold shadow-2xs' : 'text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400'
                  }`}
                >
                  Échecs ({failedCount})
                </button>
              </div>

              {/* Search & Export */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-56">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Rechercher client, ID..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <button
                  onClick={() => showToast('Export CSV généré avec succès !', 'success')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1 shrink-0 cursor-pointer"
                  title="Exporter au format CSV"
                >
                  <span className="material-symbols-outlined text-sm">file_download</span>
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>
            </div>

            {/* Content: Empty State or Table */}
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
                      : "Vous n'avez pas encore créé de livraison."
                  }
                  actionLabel="Nouvelle livraison"
                  onAction={() => setCurrentView('vendeur_new_delivery')}
                  secondaryActionLabel={searchTerm ? 'Effacer la recherche' : activeFilter !== 'all' ? 'Toutes les courses' : undefined}
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
                {/* Desktop Data Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <th className="py-3 px-4">ID Course</th>
                        <th className="py-3 px-4">Client</th>
                        <th className="py-3 px-4">Destination</th>
                        <th className="py-3 px-4">Livreur</th>
                        <th className="py-3 px-4">Statut</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {paginatedDeliveries.map((order) => (
                        <tr key={order.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                            {order.id}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 dark:text-white">{order.clientName}</div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                              {order.clientPhone}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-slate-800 dark:text-slate-200 font-medium">{order.dropoffLocation.commune}</div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-xs">{order.dropoffLocation.address}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                            {order.courier ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-slate-900 dark:text-white">{order.courier.name}</span>
                                <span className="text-slate-400">·</span>
                                <span className="text-amber-600 dark:text-amber-400 font-mono text-[11px]">★ {order.courier.rating}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Non assigné</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {order.status === 'en_cours' && (
                              <span className="text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                En cours
                              </span>
                            )}
                            {order.status === 'acceptee' && (
                              <span className="text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                                Course acceptée
                              </span>
                            )}
                            {order.status === 'assignee' && (
                              <span className="text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                Assignée
                              </span>
                            )}
                            {order.status === 'en_attente' && (
                              <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                En attente
                              </span>
                            )}
                            {order.status === 'livree' && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                Livrée (POD)
                              </span>
                            )}
                            {order.status === 'echec' && (
                              <span className="text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">error</span>
                                Échec
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => handleWhatsAppAction(order)}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 transition-colors"
                                title="Contacter le client sur WhatsApp"
                              >
                                <span className="material-symbols-outlined text-base">chat</span>
                              </button>

                              {order.courier && (
                                <button
                                  onClick={() => openChatModal(order)}
                                  className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 transition-colors"
                                  title="Discuter directement avec le livreur"
                                >
                                  <span className="material-symbols-outlined text-base">forum</span>
                                </button>
                              )}

                              {(order.status === 'en_cours' || order.status === 'acceptee') && (
                                <button
                                  onClick={() => handleInspectDelivery(order)}
                                  className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs transition-colors"
                                >
                                  Suivi
                                </button>
                              )}

                              {order.status === 'en_attente' && (
                                <>
                                  <button
                                    onClick={() => openLivreurSearchModal(order.id)}
                                    className="px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 text-blue-700 dark:text-blue-300 font-medium text-xs transition-colors"
                                  >
                                    Assigner
                                  </button>
                                  <button
                                    onClick={() => handleRelaunchSearch(order.id)}
                                    className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-medium text-xs transition-colors"
                                  >
                                    Relancer
                                  </button>
                                </>
                              )}

                              {order.status === 'livree' && (
                                <>
                                  <button
                                    onClick={() => handleOpenPOD(order)}
                                    className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    Preuve POD
                                  </button>
                                  {order.courier && (
                                    <button
                                      onClick={() => openRateLivreurModal(order)}
                                      className="px-2 py-1 rounded-md text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 font-medium text-xs hover:bg-amber-100 transition-colors"
                                    >
                                      ★ {order.courierRating ? `${order.courierRating.rating}/5` : 'Noter'}
                                    </button>
                                  )}
                                </>
                              )}

                              {order.status === 'echec' && (
                                <button
                                  onClick={() => handleReschedule(order.id)}
                                  className="px-2 py-1 rounded-md bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 font-medium text-xs hover:bg-red-100 transition-colors"
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

                {/* Mobile Cards Architecture */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 p-3 space-y-3">
                  {paginatedDeliveries.map((order) => (
                    <article key={order.id} className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          {order.id}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500">
                          {order.status === 'livree' ? 'Livrée (POD)' : order.status === 'en_cours' ? 'En cours' : order.status === 'en_attente' ? 'En attente' : 'Échec'}
                        </span>
                      </div>

                      <div className="text-xs">
                        <div className="font-semibold text-slate-900 dark:text-white">{order.clientName}</div>
                        <div className="text-slate-500 dark:text-slate-400 text-[11px]">{order.dropoffLocation.commune} · {order.dropoffLocation.address}</div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleWhatsAppAction(order)}
                          className="px-2.5 py-1 rounded-md text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-xs font-medium"
                        >
                          WhatsApp
                        </button>

                        {(order.status === 'en_cours' || order.status === 'acceptee') && (
                          <button
                            onClick={() => handleInspectDelivery(order)}
                            className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-medium"
                          >
                            Suivi
                          </button>
                        )}

                        {order.status === 'en_attente' && (
                          <button
                            onClick={() => openLivreurSearchModal(order.id)}
                            className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-medium"
                          >
                            Assigner
                          </button>
                        )}

                        {order.status === 'livree' && (
                          <button
                            onClick={() => handleOpenPOD(order)}
                            className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium"
                          >
                            Preuve POD
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>

                {/* Pagination */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={filteredDeliveries.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={(page) => setCurrentPage(page)}
                  />
                </div>
              </>
            )}
          </section>

          {/* 4. Foire aux Questions & Support Vendeur */}
          <div id="vendeur-faq-section" className="scroll-mt-6">
            <VendeurFAQSection onOpenGuide={() => setIsOnboardingOpen(true)} />
          </div>
        </main>

        <OnboardingGuideModal
          isOpen={isOnboardingOpen}
          onClose={() => setIsOnboardingOpen(false)}
          role="vendeur"
        />

        <MobileBottomNav />
      </div>
    </div>
  );
};
