// Source: Google Maps Platform Code Assist
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { BackButton } from '../common/BackButton';
import { GoogleMapDelivery } from '../maps/GoogleMapDelivery';
import { getLocationForCommune, calculateDistanceKm, calculateDeliveryPrice } from '../../config/maps';
import { DeliveryOrder } from '../../types';

export const LivreurDashboard: React.FC = () => {
  const {
    deliveries,
    courierSettings,
    userProfile,
    couriers,
    selectedCourier,
    selectActiveCourier,
    toggleCourierAvailability,
    setIsPODModalOpen,
    setSelectedDelivery,
    openWhatsAppModal,
    showToast,
    acceptDelivery,
    refuseDelivery,
    updateDeliveryStatus,
    createDelivery,
    setCurrentView,
  } = useApp();

  const [expandedMapOrderId, setExpandedMapOrderId] = useState<string | null>(null);

  // Livraisons en attente d'acceptation par les livreurs (créées par les vendeurs, ouvertes à tous)
  const pendingDeliveries = deliveries.filter(
    (d) => d.status === 'en_attente' || !d.courier
  );

  // Mission active en cours pour ce livreur (acceptée, colis récupéré ou en cours)
  const activeOrder = deliveries.find(
    (d) =>
      d.status === 'acceptee' ||
      d.status === 'colis_recupere' ||
      d.status === 'en_cours'
  );

  const activeCourierName =
    (userProfile?.role === 'livreur' && userProfile?.fullName) ||
    selectedCourier?.name ||
    courierSettings.fullName ||
    'Awa Véloce Livraisons';

  const displayName = activeCourierName.split(' ')[0] || 'Livreur';
  const activeCourierVehicle = selectedCourier?.vehicle || courierSettings.vehicleType || 'Scooter Électrique';
  const activeCourierPhone = selectedCourier?.phone || courierSettings.phone || '+229 95 87 65 43';

  // Coordonnées GPS pour la carte Google Maps de la mission active
  const activeOriginCoords = activeOrder?.pickupLocation?.coordinates
    ? {
        lat: activeOrder.pickupLocation.coordinates[0],
        lng: activeOrder.pickupLocation.coordinates[1],
      }
    : getLocationForCommune(activeOrder?.pickupLocation?.commune || 'Cotonou - Haie Vive');

  const activeDropoffCoords = activeOrder?.dropoffLocation?.coordinates
    ? {
        lat: activeOrder.dropoffLocation.coordinates[0],
        lng: activeOrder.dropoffLocation.coordinates[1],
      }
    : getLocationForCommune(activeOrder?.dropoffLocation?.commune || 'Cotonou - Cadjehoun');

  const activeDistanceKm = calculateDistanceKm(activeOriginCoords, activeDropoffCoords);
  const activeFee = calculateDeliveryPrice(activeDistanceKm);

  const handleOpenPOD = () => {
    if (!activeOrder) return;
    setSelectedDelivery(activeOrder);
    setIsPODModalOpen(true);
  };

  const handleWhatsApp = (order: DeliveryOrder) => {
    const msg = `Bonjour ${order.clientName}, je suis votre livreur LivraLink pour votre commande ${order.id}. Je suis en route pour la livraison. Êtes-vous bien disponible ?`;
    openWhatsAppModal(order.clientPhone, order.clientName, msg);
  };

  const handleAcceptOrder = (order: DeliveryOrder) => {
    acceptDelivery(order.id);
  };

  const handleRefuseOrder = (orderId: string) => {
    refuseDelivery(orderId);
  };

  const handleValidatePickup = (orderId: string) => {
    updateDeliveryStatus(orderId, 'colis_recupere', 'Colis récupéré chez le marchand • En route vers le destinataire');
    showToast(`📦 Colis récupéré pour la course ${orderId} ! En route vers le destinataire.`, 'success');
  };

  // Création instantanée d'une livraison test vendeur pour valider le flux
  const handleCreateTestOrder = () => {
    const testOrder = createDelivery({
      clientName: 'Marius Dossou',
      clientPhone: '+229 97 12 34 56',
      clientNote: 'Appeler à l\'arrivée au carrefour Kpota',
      channel: 'WhatsApp',
      pickupLocation: {
        name: 'Boutique Cotonou Chic',
        address: 'Avenue Jean-Paul II, Haie Vive, Cotonou',
        commune: 'Cotonou - Haie Vive',
        coordinates: [6.3571, 2.4175],
      },
      dropoffLocation: {
        name: 'Marius Dossou',
        address: 'Carrefour Kpota, Abomey-Calavi',
        commune: 'Abomey-Calavi - Centre',
        coordinates: [6.4485, 2.3556],
      },
      itemDescription: 'Vêtements & Chaussures de mode',
      itemWeightKg: 1.5,
      itemFormat: 'M',
      isFragile: false,
      itemValueCOD: 25000,
      deliveryFee: calculateDeliveryPrice(calculateDistanceKm({ lat: 6.3571, lng: 2.4175 }, { lat: 6.4485, lng: 2.3556 })),
      status: 'en_attente',
      statusNote: 'Nouvelle course créée par le vendeur • En attente de validation livreur',
    });
    showToast(`Nouvelle course ${testOrder.id} créée ! Elle est désormais disponible ci-dessous.`, 'success');
  };

  return (
    <div className="flex h-full min-h-[100dvh] md:h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff]">
        {/* Top Header */}
        <Header
          title="Tableau de bord Livreur"
          subtitle="Tournée en cours • Cotonou, Calavi & Grand Nokoué (Bénin)"
        />

        {/* Scrollable Container */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* 1. Courier Greeting & Availability Toggle */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3 sm:gap-4">
              <BackButton />
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">two_wheeler</span>
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                    Bonjour, {displayName} !
                  </h1>
                  <button
                    type="button"
                    onClick={toggleCourierAvailability}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-2xs ${
                      courierSettings.isAvailable
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-200 text-slate-700 border border-slate-300'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        courierSettings.isAvailable
                          ? 'bg-emerald-600 animate-ping'
                          : 'bg-slate-500'
                      }`}
                    ></span>
                    <span>
                      {courierSettings.isAvailable
                        ? 'Statut : En ligne 🟢'
                        : 'Statut : En pause ⏸️'}
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-blue-50/80 border border-blue-200/80 px-2.5 py-1 rounded-xl text-xs">
                    <span className="material-symbols-outlined text-sm text-blue-600">badge</span>
                    <span className="text-[11px] font-bold text-blue-800">Compte coursier :</span>
                    <select
                      value={selectedCourier?.name || activeCourierName}
                      onChange={(e) => selectActiveCourier(e.target.value)}
                      className="bg-transparent font-extrabold text-slate-900 focus:outline-none cursor-pointer text-xs"
                      title="Changer de coursier pour tester les attributions et acceptations"
                    >
                      {couriers.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name} ({c.vehicle})
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {activeCourierVehicle} • {activeCourierPhone}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Courses instantanées avec tarification Google Maps à 100 FCFA/km • Vous avez le choix d'accepter ou de refuser chaque livraison.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              <button
                type="button"
                onClick={handleCreateTestOrder}
                className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-200 flex items-center gap-1.5 transition-colors"
                title="Simuler une course créée par un vendeur"
              >
                <span className="material-symbols-outlined text-base">add_circle</span>
                <span>+ Simuler course vendeur</span>
              </button>
            </div>
          </div>

          {/* 2. Key Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Courses Jour */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>COURSES JOUR</span>
                <span className="material-symbols-outlined text-blue-600">calendar_today</span>
              </div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-2xl sm:text-3xl font-black text-slate-900">
                  {deliveries.filter((d) => d.status === 'livree').length}
                </span>
                <span className="text-xs text-slate-400 font-bold">/ 10 courses</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-full rounded-full" style={{ width: '70%' }}></div>
              </div>
              <span className="text-[10px] text-slate-400 block">Objectif journalier</span>
            </div>

            {/* Revenus Jour */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>REVENUS JOUR</span>
                <button
                  type="button"
                  onClick={() => setCurrentView('livreur_wallet')}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Retrait ›
                </button>
              </div>
              <div className="flex items-baseline gap-1 flex-wrap">
                <span className="text-2xl sm:text-3xl font-black text-slate-900">
                  {(
                    deliveries
                      .filter((d) => d.status === 'livree')
                      .reduce((sum, d) => sum + (d.deliveryFee || 2500), 0) + 12500
                  ).toLocaleString('fr-FR')}
                </span>
                <span className="text-xs font-bold text-slate-400">FCFA</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1">
                <span className="text-emerald-600 font-bold">100 F/km net</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  MoMo / Celtiis
                </span>
              </div>
            </div>

            {/* Livrées (POD) */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>LIVRÉES (POD)</span>
                <span className="material-symbols-outlined text-emerald-600">check_circle</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-emerald-700">
                  {deliveries.filter((d) => d.status === 'livree').length}
                </span>
                <span className="text-xs font-bold text-emerald-600">100% Validées</span>
              </div>
              <p className="text-[11px] text-slate-500">Preuves POD sécurisées sans litige</p>
            </div>

            {/* En attente d'acceptation */}
            <div className="bg-amber-50/80 border-2 border-amber-300 p-4 sm:p-5 rounded-3xl shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-amber-800 font-bold">
                <span>EN ATTENTE</span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-amber-950">
                  {pendingDeliveries.length}
                </span>
                <span className="text-xs font-bold text-amber-700">à accepter</span>
              </div>
              <p className="text-[11px] text-amber-900 font-medium">Courses vendeurs prêtes</p>
            </div>
          </div>

          {/* 3. Section Clé : COURSES CRÉÉES PAR LES VENDEURS DISPONIBLES À ACCEPTER */}
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-xl">notifications_active</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                      Courses Vendeurs Disponibles
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-500 text-white animate-pulse">
                      {pendingDeliveries.length} disponible{pendingDeliveries.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Lorsqu'un vendeur crée une expédition, elle apparaît ici. Vous avez le choix d'accepter ou de refuser.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCurrentView('livreur_missions')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 self-start sm:self-auto"
              >
                <span>Voir toutes les missions</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>

            {pendingDeliveries.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl">local_shipping</span>
                </div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Toutes les courses sont actuellement prises en charge
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Dès qu'un vendeur crée une nouvelle livraison, elle apparaîtra ici instantanément avec le calcul de la distance Google Maps et le prix à 100 F/km.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCreateTestOrder}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all inline-flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    <span>Tester la liaison : Créer une livraison vendeur (Cotonou ➔ Calavi)</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingDeliveries.map((order) => {
                  const pOrigin = order.pickupLocation?.coordinates
                    ? { lat: order.pickupLocation.coordinates[0], lng: order.pickupLocation.coordinates[1] }
                    : getLocationForCommune(order.pickupLocation?.commune || 'Cotonou - Haie Vive');

                  const pDropoff = order.dropoffLocation?.coordinates
                    ? { lat: order.dropoffLocation.coordinates[0], lng: order.dropoffLocation.coordinates[1] }
                    : getLocationForCommune(order.dropoffLocation?.commune || 'Cotonou - Cadjehoun');

                  const distKm = calculateDistanceKm(pOrigin, pDropoff);
                  const price = order.deliveryFee || calculateDeliveryPrice(distKm);

                  const isMapExpanded = expandedMapOrderId === order.id;

                  return (
                    <div
                      key={order.id}
                      className="p-4 sm:p-5 rounded-2xl border-2 border-amber-200/80 bg-gradient-to-r from-amber-50/40 via-white to-white shadow-xs space-y-4 transition-all hover:border-amber-300"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-black text-sm text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                              {order.id}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              🟡 En attente de coursier
                            </span>
                            <span className="text-xs text-slate-500 font-medium">
                              Créée à {order.createdAt?.length <= 8 ? order.createdAt : isNaN(new Date(order.createdAt).getTime()) ? order.createdAt : new Date(order.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-800">
                            Colis : {order.itemDescription} ({order.itemWeightKg} kg)
                          </p>
                        </div>

                        {/* Tarif calculé Google Maps (100 FCFA par km) */}
                        <div className="sm:text-right">
                          <div className="flex sm:flex-col items-baseline sm:items-end justify-between gap-1">
                            <div className="text-xl font-black text-emerald-700">
                              {price.toLocaleString('fr-FR')} FCFA
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                              <span className="text-blue-600 font-bold">{distKm} km</span>
                              <span>• 100 F/km</span>
                            </div>
                          </div>
                          {order.itemValueCOD > 0 && (
                            <span className="text-[11px] text-amber-700 font-semibold block">
                              COD client à percevoir : {order.itemValueCOD.toLocaleString('fr-FR')} FCFA
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Itinéraire Collecte ➔ Livraison */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50/80 p-3.5 rounded-xl border border-slate-200">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-blue-700 font-bold uppercase text-[10px]">
                            <span className="material-symbols-outlined text-sm">store</span>
                            <span>Point de Collecte (Vendeur)</span>
                          </div>
                          <p className="font-extrabold text-slate-900">{order.pickupLocation.name}</p>
                          <p className="text-slate-600">{order.pickupLocation.address}</p>
                          <span className="text-[10px] text-slate-400 font-medium">
                            Commune : {order.pickupLocation.commune}
                          </span>
                        </div>

                        <div className="space-y-1 md:border-l md:border-slate-200 md:pl-3">
                          <div className="flex items-center gap-1.5 text-emerald-700 font-bold uppercase text-[10px]">
                            <span className="material-symbols-outlined text-sm">person_pin_circle</span>
                            <span>Point de Livraison (Client Destinataire)</span>
                          </div>
                          <p className="font-extrabold text-slate-900">{order.clientName}</p>
                          <p className="text-slate-600">{order.dropoffLocation.address}</p>
                          <span className="text-[10px] text-slate-400 font-medium">
                            Tél : {order.clientPhone} • Commune : {order.dropoffLocation.commune}
                          </span>
                        </div>
                      </div>

                      {/* Google Maps Preview accordéon si activé */}
                      {isMapExpanded && (
                        <div className="pt-2 animate-fade-in">
                          <GoogleMapDelivery
                            origin={pOrigin}
                            destination={pDropoff}
                            originLabel={`Vendeur: ${order.pickupLocation.name}`}
                            destinationLabel={`Client: ${order.clientName}`}
                            heightClass="h-[280px]"
                          />
                        </div>
                      )}

                      {/* Action buttons : ACCEPTER ou REFUSER (Mobile Touch Friendly) */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-amber-200/60">
                        <button
                          type="button"
                          onClick={() => setExpandedMapOrderId(isMapExpanded ? null : order.id)}
                          className="min-h-[44px] text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-base text-blue-600">
                            {isMapExpanded ? 'map_off' : 'map'}
                          </span>
                          <span>{isMapExpanded ? 'Masquer la carte' : 'Voir tracé Google Maps'}</span>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRefuseOrder(order.id)}
                            className="min-h-[44px] px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition active:scale-95 flex items-center justify-center"
                          >
                            Refuser
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAcceptOrder(order)}
                            className="min-h-[44px] flex-1 sm:flex-initial px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow-md shadow-emerald-600/30 transition active:scale-95 flex items-center justify-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-base">check_circle</span>
                            <span>Accepter ({price.toLocaleString('fr-FR')} F)</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 4. Active Mission Card with Real Google Maps Integration */}
          {activeOrder && (
            <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
              {/* Header of Active Mission */}
              <div className="bg-slate-900 text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    activeOrder.status === 'acceptee'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                  }`}>
                    {activeOrder.status === 'acceptee'
                      ? 'Étape 1/2 : En route pour collecte'
                      : activeOrder.status === 'colis_recupere' || activeOrder.status === 'en_cours'
                      ? 'Étape 2/2 : En route pour livraison'
                      : 'Course terminée'}
                  </span>
                  <h2 className="font-extrabold text-base sm:text-lg">
                    Course {activeOrder.id}
                  </h2>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-emerald-400">
                    {(activeOrder.deliveryFee || activeFee).toLocaleString('fr-FR')} FCFA
                  </span>
                  <span className="text-xs text-slate-400 block">
                    {activeDistanceKm} km • Tarif 100 F/km
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 sm:p-6 space-y-5">
                {/* Visual Google Map Component */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5 text-blue-700">
                      <span className="material-symbols-outlined text-base">explore</span>
                      <span>Navigation &amp; Tracé Temps Réel Google Maps Bénin</span>
                    </span>
                    <span className="text-slate-500">
                      {activeOrder.pickupLocation.commune} ➔ {activeOrder.dropoffLocation.commune}
                    </span>
                  </div>

                  <GoogleMapDelivery
                    origin={activeOriginCoords}
                    destination={activeDropoffCoords}
                    originLabel={`Collecte: ${activeOrder.pickupLocation.name}`}
                    destinationLabel={`Client: ${activeOrder.clientName}`}
                    heightClass="h-[320px]"
                  />
                </div>

                {/* Itinerary Steps */}
                <div className="space-y-4 text-xs">
                  {/* Step 1: Pickup */}
                  <div className={`flex items-start gap-3 p-3.5 rounded-2xl border ${
                    activeOrder.status === 'colis_recupere' || activeOrder.status === 'en_cours' || activeOrder.status === 'livree'
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : 'bg-amber-50/70 border-2 border-amber-300'
                  }`}>
                    <div className={`w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs shrink-0 ${
                      activeOrder.status === 'colis_recupere' || activeOrder.status === 'en_cours' || activeOrder.status === 'livree'
                        ? 'bg-emerald-500'
                        : 'bg-amber-500 animate-pulse'
                    }`}>
                      <span className="material-symbols-outlined text-sm">
                        {activeOrder.status === 'colis_recupere' || activeOrder.status === 'en_cours' || activeOrder.status === 'livree'
                          ? 'check'
                          : 'store'}
                      </span>
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900 uppercase text-[10px]">
                          1. Collecte chez le marchand
                        </span>
                        <span className={`text-[10px] font-bold ${
                          activeOrder.status === 'colis_recupere' || activeOrder.status === 'en_cours' || activeOrder.status === 'livree'
                            ? 'text-emerald-700'
                            : 'text-amber-800'
                        }`}>
                          {activeOrder.status === 'colis_recupere' || activeOrder.status === 'en_cours' || activeOrder.status === 'livree'
                            ? 'Collecté ✅'
                            : 'En attente de retrait'}
                        </span>
                      </div>
                      <p className="font-bold text-slate-900 text-xs">{activeOrder.pickupLocation.name}</p>
                      <p className="text-slate-600">{activeOrder.pickupLocation.address}</p>

                      {activeOrder.status === 'acceptee' && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => handleValidatePickup(activeOrder.id)}
                            className="py-2 px-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs shadow-xs active:scale-95 transition-all flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-sm">inventory_2</span>
                            <span>Valider la récupération du colis en boutique</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 2: Dropoff */}
                  <div className={`flex items-start gap-3 p-3.5 rounded-2xl border ${
                    activeOrder.status === 'colis_recupere' || activeOrder.status === 'en_cours'
                      ? 'bg-blue-50/70 border-2 border-blue-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className={`w-7 h-7 rounded-full text-white flex items-center justify-center font-bold text-xs shrink-0 ${
                      activeOrder.status === 'colis_recupere' || activeOrder.status === 'en_cours'
                        ? 'bg-blue-600 animate-pulse'
                        : 'bg-slate-300 text-slate-600'
                    }`}>
                      <span className="material-symbols-outlined text-sm">location_on</span>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-blue-700 uppercase text-[10px]">
                          2. Livraison au client (Destination)
                        </span>
                        <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-[10px]">
                          {activeOrder.dropoffLocation.commune}
                        </span>
                      </div>
                      <p className="font-extrabold text-slate-900 text-sm">{activeOrder.clientName}</p>
                      <p className="text-slate-600">{activeOrder.dropoffLocation.address}</p>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <span className="px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 text-[10px] font-bold">
                          {activeOrder.itemDescription} ({activeOrder.itemWeightKg} kg)
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                          {activeOrder.itemValueCOD > 0
                            ? `COD à percevoir : ${activeOrder.itemValueCOD.toLocaleString('fr-FR')} FCFA`
                            : 'Payé en ligne (0 FCFA)'}
                        </span>
                      </div>

                      {/* Contact client buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleWhatsApp(activeOrder)}
                          className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <span className="material-symbols-outlined text-sm">chat</span>
                          <span>WhatsApp (+229)</span>
                        </button>
                        <a
                          href={`tel:${activeOrder.clientPhone}`}
                          className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm text-blue-600">call</span>
                          <span>Appeler client</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Major Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
                      activeOrder.pickupLocation.address
                    )}&destination=${encodeURIComponent(activeOrder.dropoffLocation.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3.5 px-4 rounded-2xl border-2 border-blue-600 text-blue-700 font-bold text-xs hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">navigation</span>
                    <span>Ouvrir GPS Externe (Google Maps)</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleOpenPOD}
                    className="py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-lg">task_alt</span>
                    <span>Valider la remise POD (Photo / OTP)</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {!activeOrder && (
            <section className="bg-white rounded-3xl border border-dashed border-slate-200 p-8 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">two_wheeler</span>
              </div>
              <h3 className="font-bold text-slate-800 text-sm">
                Aucune mission active en cours
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Vous êtes libre et disponible sur le réseau. Consultez la section <strong>« Courses Vendeurs Disponibles »</strong> ci-dessus et cliquez sur <strong>Accepter</strong> pour prendre en charge une livraison.
              </p>
            </section>
          )}

          {/* 5. Emergency SOS Dispatch Banner */}
          <section className="bg-red-50 border border-red-200 rounded-3xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">support_agent</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-red-900 leading-tight">
                  Besoin d'aide sur votre tournée à Cotonou ?
                </p>
                <p className="text-[11px] text-red-700 truncate">
                  Contactez le Dispatch LivraLink Bénin en direct au +229 97 00 00 00
                </p>
              </div>
            </div>
            <a
              href="tel:+22997000000"
              className="w-full sm:w-auto text-center px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shrink-0 shadow-xs active:scale-95 transition-all"
            >
              SOS Dispatch (+229)
            </a>
          </section>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav />
    </div>
  );
};
