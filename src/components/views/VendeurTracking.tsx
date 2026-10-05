import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { DeliveryOrder } from '../../types';

export const VendeurTracking: React.FC = () => {
  const {
    deliveries,
    selectedDelivery,
    setSelectedDelivery,
    openWhatsAppModal,
    setIsPODModalOpen,
    showToast,
    setCurrentView,
    updateDeliveryStatus,
  } = useApp();

  const [activeCourseId, setActiveCourseId] = useState(selectedDelivery?.id || '#LL-4192');
  const [activeFilter, setActiveFilter] = useState<'all' | 'en_cours' | 'en_attente' | 'livree' | 'echec'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const currentOrder = deliveries.find((d) => d.id === activeCourseId) || deliveries[0];

  const filteredDeliveries = deliveries.filter((order) => {
    if (activeFilter === 'en_cours' && !(order.status === 'en_cours' || order.status === 'acceptee' || order.status === 'colis_recupere')) return false;
    if (activeFilter === 'en_attente' && !(order.status === 'en_attente' || order.status === 'assignee')) return false;
    if (activeFilter === 'livree' && order.status !== 'livree') return false;
    if (activeFilter === 'echec' && order.status !== 'echec') return false;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        order.id.toLowerCase().includes(q) ||
        order.clientName.toLowerCase().includes(q) ||
        order.clientPhone.includes(q) ||
        order.dropoffLocation.commune.toLowerCase().includes(q) ||
        order.itemDescription.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSelectOrder = (order: DeliveryOrder) => {
    setActiveCourseId(order.id);
    setSelectedDelivery(order);
  };

  const handleShareTrackingLink = () => {
    const trackingUrl = `https://livralink.ci/track/${currentOrder.id.replace('#', '')}`;
    navigator.clipboard.writeText(trackingUrl);
    showToast(`Lien de suivi client copié : ${trackingUrl}`, 'success');
  };

  const handleDirectWhatsApp = () => {
    const msg = `Bonjour ${currentOrder.clientName}, votre colis LivraLink (${currentOrder.id}) est en cours de livraison par ${currentOrder.courier?.name || 'votre coursier'}. Suivi direct : https://livralink.ci/track/${currentOrder.id.replace('#', '')}`;
    openWhatsAppModal(currentOrder.clientPhone, currentOrder.clientName, msg);
  };

  const handleRelaunch = (orderId: string) => {
    updateDeliveryStatus(orderId, 'en_attente', 'Recherche coursier relancée par le vendeur');
    showToast(`Recherche de coursier relancée pour ${orderId}`, 'info');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff]">
        {/* Top Header */}
        <Header
          title="Mes Livraisons"
          subtitle="Suivi temps réel, traçabilité GPS et gestion des colis expédiés"
          showReturn
          onReturn={() => setCurrentView('vendeur_dashboard')}
        />

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <span className="material-symbols-outlined text-xl">local_shipping</span>
                </span>
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Suivi Opérationnel des Livraisons</h1>
                  <p className="text-xs text-slate-500">Supervision de l'état d'acheminement et des preuves POD</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentView('vendeur_new_delivery')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 active:scale-95"
              >
                <span className="material-symbols-outlined text-base">add</span>
                <span>+ Nouvelle livraison</span>
              </button>
            </div>
          </div>

          {/* Active Order Focus Banner */}
          {currentOrder && (
            <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-2xl">two_wheeler</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-extrabold text-slate-900">Colis {currentOrder.id}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        currentOrder.status === 'livree' ? 'bg-emerald-100 text-emerald-800' :
                        currentOrder.status === 'en_cours' ? 'bg-blue-100 text-blue-800 animate-pulse' :
                        currentOrder.status === 'echec' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {currentOrder.status === 'livree' ? 'Livrée avec succès' :
                         currentOrder.status === 'en_cours' ? 'En cours d\'acheminement' :
                         currentOrder.status === 'colis_recupere' ? 'Colis récupéré' :
                         currentOrder.status === 'acceptee' ? 'Acceptée par coursier' :
                         currentOrder.status === 'echec' ? 'Incident / Échec' : 'En attente coursier'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Client : <strong className="text-slate-900">{currentOrder.clientName}</strong> • Tél : {currentOrder.clientPhone} • Montant COD :{' '}
                      <strong className="text-emerald-700 font-bold">{currentOrder.itemValueCOD.toLocaleString('fr-FR')} FCFA</strong> ({currentOrder.itemDescription})
                    </p>
                  </div>
                </div>

                {/* Actions for current order */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleShareTrackingLink}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">share</span>
                    <span>Lien de suivi</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDirectWhatsApp}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">chat</span>
                    <span>Aviser client</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDelivery(currentOrder);
                      setIsPODModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">verified</span>
                    <span>Preuve POD</span>
                  </button>
                </div>
              </div>

              {/* Steps and Courier Details */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* 6 Steps Timeline (7 cols) */}
                <div className="lg:col-span-7 space-y-4">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-400">
                    Étapes d'acheminement certifiées
                  </h4>
                  <div className="relative pl-6 space-y-5 border-l-2 border-slate-200 ml-2 text-xs">
                    {currentOrder.timeline.map((step) => (
                      <div key={step.id} className="relative">
                        {step.status === 'completed' && (
                          <span className="absolute -left-[31px] top-0 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[11px] shadow-xs">
                            <span className="material-symbols-outlined text-xs font-bold">check</span>
                          </span>
                        )}
                        {step.status === 'active' && (
                          <span className="absolute -left-[31px] top-0 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] ring-4 ring-blue-100 animate-pulse">
                            {step.stepNumber}
                          </span>
                        )}
                        {step.status === 'pending' && (
                          <span className="absolute -left-[31px] top-0 w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[11px] font-bold">
                            {step.stepNumber}
                          </span>
                        )}
                        <div className="flex items-baseline justify-between">
                          <span className={`font-bold ${step.status === 'active' ? 'text-blue-700 text-sm' : step.status === 'completed' ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                            {step.title}
                          </span>
                          {step.timestamp && (
                            <span className="text-[10px] text-slate-400 font-mono">{step.timestamp}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{step.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Courier & Location (5 cols) */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Coursier assigné</span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                        {currentOrder.courier?.status === 'en_course' ? 'En livraison' : 'Disponible'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                        {currentOrder.courier?.avatarInitials || 'LL'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs">{currentOrder.courier?.name || 'Coursier Express'}</div>
                        <div className="text-[11px] text-slate-500">{currentOrder.courier?.vehicle || 'Moto 125cc'} • {currentOrder.courier?.phone}</div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="p-2 bg-white rounded-xl border border-slate-100">
                        <span className="text-[10px] text-slate-400 block">Note globale</span>
                        <strong className="text-amber-600">★ {currentOrder.courier?.rating || 4.9}</strong>
                      </div>
                      <div className="p-2 bg-white rounded-xl border border-slate-100">
                        <span className="text-[10px] text-slate-400 block">Courses réussies</span>
                        <strong className="text-slate-900">{currentOrder.courier?.totalDeliveries || 350}+</strong>
                      </div>
                    </div>
                  </div>

                  {/* Destination Info */}
                  <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-2 text-xs">
                    <div className="flex items-center gap-1.5 text-blue-900 font-bold">
                      <span className="material-symbols-outlined text-base text-blue-600">place</span>
                      <span>Lieu de livraison : {currentOrder.dropoffLocation.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {currentOrder.dropoffLocation.address}, {currentOrder.dropoffLocation.commune}
                    </p>
                    {currentOrder.dropoffLocation.details && (
                      <p className="text-[10px] text-blue-800 bg-white/70 p-2 rounded-lg border border-blue-100">
                        Repère : {currentOrder.dropoffLocation.details}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* All Deliveries Table with Filter & Search */}
          <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Toutes vos expéditions ({filteredDeliveries.length})</h3>
                <p className="text-xs text-slate-500">Cliquez sur une course pour afficher ses détails de suivi</p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-semibold overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'all' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Toutes
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('en_cours')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'en_cours' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  En cours
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('en_attente')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'en_attente' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  En attente
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('livree')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'livree' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Livrées
                </button>
              </div>
            </div>

            {/* Orders Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3">Réf</th>
                    <th className="py-3 px-3">Client</th>
                    <th className="py-3 px-3">Destination</th>
                    <th className="py-3 px-3">Articles &amp; COD</th>
                    <th className="py-3 px-3">Statut</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDeliveries.map((order) => {
                    const isSelected = order.id === activeCourseId;
                    return (
                      <tr
                        key={order.id}
                        onClick={() => handleSelectOrder(order)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/70 font-semibold' : 'hover:bg-slate-50'}`}
                      >
                        <td className="py-3 px-3 font-mono font-bold text-blue-700">
                          {order.id}
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-slate-900 font-bold">{order.clientName}</div>
                          <div className="text-[10px] text-slate-400">{order.clientPhone}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-slate-800">{order.dropoffLocation.commune}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{order.dropoffLocation.address}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-emerald-700 font-black">{order.itemValueCOD.toLocaleString('fr-FR')} FCFA</div>
                          <div className="text-[10px] text-slate-500">{order.itemDescription}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            order.status === 'livree' ? 'bg-emerald-100 text-emerald-800' :
                            order.status === 'en_cours' ? 'bg-blue-100 text-blue-800' :
                            order.status === 'echec' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {order.status === 'livree' ? 'Livrée' :
                             order.status === 'en_cours' ? 'En cours' :
                             order.status === 'echec' ? 'Échec' : 'En attente'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectOrder(order);
                            }}
                            className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-[10px] font-bold text-slate-700 shadow-2xs"
                          >
                            Détails ›
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
};
