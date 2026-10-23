import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { BackButton } from '../common/BackButton';
import { DeliveryOrder } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { PaginationControls } from '../common/PaginationControls';

export const LivreurMissions: React.FC = () => {
  const {
    deliveries,
    courierSettings,
    toggleCourierAvailability,
    setIsPODModalOpen,
    setSelectedDelivery,
    openWhatsAppModal,
    updateDeliveryStatus,
    acceptDelivery,
    refuseDelivery,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'all' | 'en_cours' | 'en_attente' | 'livree'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const itemsPerPage = 5;

  const filteredOrders = deliveries.filter((d) => {
    if (activeTab === 'en_cours' && !(d.status === 'en_cours' || d.status === 'acceptee' || d.status === 'colis_recupere')) return false;
    if (activeTab === 'en_attente' && !(d.status === 'en_attente' || !d.courier)) return false;
    if (activeTab === 'livree' && d.status !== 'livree') return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        d.id.toLowerCase().includes(q) ||
        d.clientName.toLowerCase().includes(q) ||
        d.dropoffLocation.commune.toLowerCase().includes(q) ||
        d.itemDescription.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleTabChange = (tab: 'all' | 'en_cours' | 'en_attente' | 'livree') => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleAcceptOrder = (orderId: string) => {
    if (processingId) return; // Point 09: Prevent double click
    setProcessingId(orderId);
    acceptDelivery(orderId);
    setTimeout(() => setProcessingId(null), 1200);
  };

  const handleRefuseOrder = (orderId: string) => {
    if (processingId) return; // Point 09: Prevent double click
    setProcessingId(orderId);
    refuseDelivery(orderId);
    setTimeout(() => setProcessingId(null), 1200);
  };

  const handlePickup = (orderId: string) => {
    if (processingId) return;
    setProcessingId(orderId);
    updateDeliveryStatus(orderId, 'colis_recupere', 'Colis récupéré chez le marchand');
    showToast('Colis pris en charge. En route vers le destinataire !', 'success');
    setTimeout(() => setProcessingId(null), 1200);
  };

  const handleOpenPOD = (order: DeliveryOrder) => {
    setSelectedDelivery(order);
    setIsPODModalOpen(true);
  };

  const handleWhatsApp = (order: DeliveryOrder) => {
    const msg = `Bonjour ${order.clientName}, je suis votre livreur LivraLink pour le colis ${order.id}. Je suis en route pour la livraison.`;
    openWhatsAppModal(order.clientPhone, order.clientName, msg);
  };

  return (
    <div className="flex h-full min-h-[100dvh] md:h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff]">
        {/* Header */}
        <Header
          title="Mes Courses & Missions"
          subtitle="Gestion opérationnelle des livraisons et validation POD"
        />

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <BackButton />
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <span className="material-symbols-outlined text-xl">two_wheeler</span>
                </span>
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Mes Courses du Jour</h1>
                  <p className="text-xs text-slate-500">Validation POD (Photo / Signature / Code OTP) sur chaque course</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleCourierAvailability}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs ${
                  courierSettings.isAvailable
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-slate-200 text-slate-700 border border-slate-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${courierSettings.isAvailable ? 'bg-emerald-600 animate-ping' : 'bg-slate-500'}`}></span>
                <span>{courierSettings.isAvailable ? 'En Ligne 🟢' : 'En Pause ⏸️'}</span>
              </button>
            </div>
          </div>

          {/* Search & Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-white rounded-2xl border border-slate-200 shadow-2xs text-xs font-semibold overflow-x-auto">
              <button
                type="button"
                onClick={() => handleTabChange('all')}
                className={`px-3.5 py-1.5 rounded-xl transition-all ${
                  activeTab === 'all' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Toutes ({deliveries.length})
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('en_cours')}
                className={`px-3.5 py-1.5 rounded-xl transition-all ${
                  activeTab === 'en_cours' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                En cours ({deliveries.filter((d) => d.status === 'en_cours' || d.status === 'acceptee' || d.status === 'colis_recupere').length})
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('en_attente')}
                className={`px-3.5 py-1.5 rounded-xl transition-all ${
                  activeTab === 'en_attente' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Disponibles ({deliveries.filter((d) => d.status === 'en_attente' || !d.courier).length})
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('livree')}
                className={`px-3.5 py-1.5 rounded-xl transition-all ${
                  activeTab === 'livree' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Livrées ({deliveries.filter((d) => d.status === 'livree').length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <span className="material-symbols-outlined text-base">search</span>
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Rechercher une course..."
                className="w-full pl-9 pr-3 py-2 bg-white text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none shadow-2xs"
              />
            </div>
          </div>

          {/* Missions List */}
          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <EmptyState
                icon="two_wheeler"
                title="Aucune mission trouvée"
                description={
                  searchTerm
                    ? `Aucune course disponible ne correspond à "${searchTerm}".`
                    : activeTab !== 'all'
                    ? `Aucune course avec le filtre sélectionné (${activeTab}).`
                    : "Aucune nouvelle course n'est disponible pour l'instant. Restez en ligne pour recevoir les alertes dès publication."
                }
                actionLabel={courierSettings.isAvailable ? undefined : "Passer en ligne"}
                onAction={courierSettings.isAvailable ? undefined : toggleCourierAvailability}
                secondaryActionLabel={searchTerm ? "Effacer recherche" : activeTab !== 'all' ? "Toutes les courses" : undefined}
                onSecondaryAction={
                  searchTerm
                    ? () => handleSearchChange('')
                    : activeTab !== 'all'
                    ? () => handleTabChange('all')
                    : undefined
                }
              />
            ) : (
              <>
                {paginatedOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all hover:border-slate-300"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono font-extrabold text-sm text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100">
                          {order.id}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          order.status === 'livree' ? 'bg-emerald-100 text-emerald-800' :
                          order.status === 'en_cours' || order.status === 'colis_recupere' ? 'bg-blue-100 text-blue-800 animate-pulse' :
                          order.status === 'echec' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {order.status === 'livree' ? 'Livrée (Certifiée)' :
                           order.status === 'en_cours' ? 'En transit' :
                           order.status === 'colis_recupere' ? 'Colis récupéré' :
                           order.status === 'acceptee' ? 'Acceptée' :
                           order.status === 'echec' ? 'Échec' : 'En attente coursier'}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          Créée à {order.createdAt?.length <= 8 ? order.createdAt : isNaN(new Date(order.createdAt).getTime()) ? order.createdAt : new Date(order.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-1">
                        <div className="flex items-start gap-2 min-w-0 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="material-symbols-outlined text-base text-blue-600 shrink-0 mt-0.5">store</span>
                          <div className="min-w-0 flex-1">
                            <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider">Point de ramassage</span>
                            <p className="text-slate-900 font-bold truncate">{order.pickupLocation.name}</p>
                            <p className="text-slate-500 text-[11px] truncate">{order.pickupLocation.commune}</p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2 min-w-0 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <span className="material-symbols-outlined text-base text-emerald-600 shrink-0 mt-0.5">person_pin_circle</span>
                          <div className="min-w-0 flex-1">
                            <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider">Point de livraison</span>
                            <p className="text-slate-900 font-bold truncate">{order.clientName}</p>
                            <p className="text-slate-500 text-[11px] truncate">{order.dropoffLocation.commune}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600 pt-1">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-[11px]">
                          Colis : <strong className="text-slate-900">{order.itemDescription}</strong>
                        </span>
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg text-[11px]">
                          COD à percevoir : <strong className="text-emerald-700">{order.itemValueCOD.toLocaleString('fr-FR')} FCFA</strong>
                        </span>
                        <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-lg text-[11px]">
                          Frais course : <strong className="text-blue-700">+{order.deliveryFee.toLocaleString('fr-FR')} FCFA</strong>
                        </span>
                      </div>
                    </div>

                    {/* Actions - Mobile Optimized (Min 44px Touch Targets) */}
                    <div className="flex items-center gap-2 flex-wrap pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 w-full lg:w-auto">
                      <button
                        type="button"
                        onClick={() => handleWhatsApp(order)}
                        className="min-h-[44px] px-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors active:scale-95"
                        title="Contacter le client sur WhatsApp"
                      >
                        <span className="material-symbols-outlined text-base">chat</span>
                        <span>WhatsApp</span>
                      </button>

                      {(order.status === 'en_attente' || order.status === 'assignee' || !order.courier) && (
                        <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                          <button
                            type="button"
                            disabled={processingId === order.id}
                            onClick={() => handleRefuseOrder(order.id)}
                            className="min-h-[44px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 flex-1 sm:flex-initial"
                          >
                            Refuser
                          </button>
                          <button
                            type="button"
                            disabled={processingId === order.id}
                            onClick={() => handleAcceptOrder(order.id)}
                            className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1 flex-1 sm:flex-initial"
                          >
                            {processingId === order.id ? (
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                <span>Accepter</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {order.status === 'acceptee' && (
                        <button
                          type="button"
                          disabled={processingId === order.id}
                          onClick={() => handlePickup(order.id)}
                          className="min-h-[44px] flex-1 sm:flex-initial px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {processingId === order.id ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-base">inventory</span>
                              <span>Valider Récupération Colis</span>
                            </>
                          )}
                        </button>
                      )}

                      {(order.status === 'colis_recupere' || order.status === 'en_cours') && (
                        <button
                          type="button"
                          onClick={() => handleOpenPOD(order)}
                          className="min-h-[44px] flex-1 sm:flex-initial px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-base">verified_user</span>
                          <span>Valider POD (Preuve)</span>
                        </button>
                      )}

                      {order.status === 'livree' && (
                        <span className="min-h-[44px] px-3.5 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-base">check_circle</span>
                          <span>Terminée &amp; Certifiée</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Pagination Controls */}
                <PaginationControls
                  currentPage={currentPage}
                  totalItems={filteredOrders.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
};
