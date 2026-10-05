import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { DeliveryOrder } from '../../types';

export const LivreurMissions: React.FC = () => {
  const {
    deliveries,
    courierSettings,
    toggleCourierAvailability,
    setIsPODModalOpen,
    setSelectedDelivery,
    openWhatsAppModal,
    updateDeliveryStatus,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'all' | 'en_cours' | 'en_attente' | 'livree'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOrders = deliveries.filter((d) => {
    if (activeTab === 'en_cours' && !(d.status === 'en_cours' || d.status === 'acceptee' || d.status === 'colis_recupere')) return false;
    if (activeTab === 'en_attente' && !(d.status === 'en_attente' || d.status === 'assignee')) return false;
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

  const handleOpenPOD = (order: DeliveryOrder) => {
    setSelectedDelivery(order);
    setIsPODModalOpen(true);
  };

  const handleWhatsApp = (order: DeliveryOrder) => {
    const msg = `Bonjour ${order.clientName}, je suis votre livreur LivraLink pour le colis ${order.id}. Je suis en route pour la livraison.`;
    openWhatsAppModal(order.clientPhone, order.clientName, msg);
  };

  const handlePickup = (orderId: string) => {
    updateDeliveryStatus(orderId, 'colis_recupere', 'Colis récupéré chez le marchand');
    showToast(`Colis récupéré pour la course ${orderId} ! En route vers le destinataire.`, 'success');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
            <div>
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
                onClick={() => setActiveTab('all')}
                className={`px-3.5 py-1.5 rounded-xl transition-all ${
                  activeTab === 'all' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Toutes ({deliveries.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('en_cours')}
                className={`px-3.5 py-1.5 rounded-xl transition-all ${
                  activeTab === 'en_cours' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                En cours ({deliveries.filter((d) => d.status === 'en_cours' || d.status === 'acceptee' || d.status === 'colis_recupere').length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('en_attente')}
                className={`px-3.5 py-1.5 rounded-xl transition-all ${
                  activeTab === 'en_attente' ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Disponibles ({deliveries.filter((d) => d.status === 'en_attente' || d.status === 'assignee').length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('livree')}
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
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher une course..."
                className="w-full pl-9 pr-3 py-2 bg-white text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none shadow-2xs"
              />
            </div>
          </div>

          {/* Missions List */}
          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl">search_off</span>
                </div>
                <h3 className="font-bold text-slate-800 text-sm">Aucune course trouvée</h3>
                <p className="text-xs text-slate-500">Modifiez vos filtres ou activez votre statut En Ligne.</p>
              </div>
            ) : (
              filteredOrders.map((order) => (
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
                        Créée à {new Date(order.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-1">
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-base text-blue-600 shrink-0 mt-0.5">store</span>
                        <div>
                          <span className="text-slate-400 font-medium">Ramassage : </span>
                          <strong className="text-slate-800">{order.pickupLocation.name}</strong> ({order.pickupLocation.commune})
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-base text-emerald-600 shrink-0 mt-0.5">person_pin_circle</span>
                        <div>
                          <span className="text-slate-400 font-medium">Livraison : </span>
                          <strong className="text-slate-800">{order.clientName}</strong> - {order.dropoffLocation.commune}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 pt-1">
                      <span>Colis : <strong className="text-slate-800">{order.itemDescription}</strong></span>
                      <span>COD à encaisser : <strong className="text-emerald-700">{order.itemValueCOD.toLocaleString('fr-FR')} FCFA</strong></span>
                      <span>Frais course : <strong className="text-blue-700">+{order.deliveryFee.toLocaleString('fr-FR')} FCFA</strong></span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleWhatsApp(order)}
                      className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                      title="Contacter le client sur WhatsApp"
                    >
                      <span className="material-symbols-outlined text-base">chat</span>
                      <span className="hidden sm:inline">WhatsApp</span>
                    </button>

                    {order.status === 'acceptee' && (
                      <button
                        type="button"
                        onClick={() => handlePickup(order.id)}
                        className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all"
                      >
                        Valider Récupération Colis
                      </button>
                    )}

                    {(order.status === 'colis_recupere' || order.status === 'en_cours') && (
                      <button
                        type="button"
                        onClick={() => handleOpenPOD(order)}
                        className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-base">verified_user</span>
                        <span>Valider POD (Preuve)</span>
                      </button>
                    )}

                    {order.status === 'livree' && (
                      <span className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        <span>Terminée &amp; Certifiée</span>
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
};
