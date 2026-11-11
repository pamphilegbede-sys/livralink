import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { GoogleMapDelivery } from '../maps/GoogleMapDelivery';
import { getLocationForCommune, calculateDistanceKm, calculateDeliveryPrice } from '../../config/maps';
import { DeliveryOrder } from '../../types';

import { OnboardingGuideModal } from '../modals/OnboardingGuideModal';

export const LivreurDashboard: React.FC = () => {
  const {
    deliveries,
    courierSettings,
    setCourierSettings,
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
    updateDeliveryDetails,
    createDelivery,
    setCurrentView,
    featureFlags,
    openKYCModal,
    kycRequests,
  } = useApp();

  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [expandedMapOrderId, setExpandedMapOrderId] = useState<string | null>(null);

  // Livraisons en attente d'acceptation par les livreurs
  const pendingDeliveries = deliveries.filter(
    (d) => d.status === 'en_attente' || !d.courier
  );

  const activeCourierName =
    (userProfile?.role === 'livreur' && userProfile?.fullName) ||
    courierSettings.fullName ||
    selectedCourier?.name ||
    'Coursier LivraLink';

  const displayName = activeCourierName.split(' ')[0] || 'Livreur';
  const activeCourierPhone = (userProfile?.role === 'livreur' && userProfile.phone) || courierSettings.phone || selectedCourier?.phone || '';
  const activeCourierVehicle = courierSettings.vehicleType || selectedCourier?.vehicle || 'Moto';

  // KYC status evaluation
  const isKycApproved =
    selectedCourier?.isKycVerified ||
    userProfile?.isKycVerified ||
    courierSettings.isKycVerified ||
    kycRequests.some(
      (k) =>
        (k.courierId === (userProfile?.uid || selectedCourier?.id) ||
          k.fullName.toLowerCase() === activeCourierName.toLowerCase()) &&
        k.status === 'valide'
    );

  const existingKyc = kycRequests.find(
    (k) =>
      k.courierId === (userProfile?.uid || selectedCourier?.id) ||
      k.fullName.toLowerCase() === activeCourierName.toLowerCase() ||
      k.phone === activeCourierPhone
  );

  const kycStatus: 'valide' | 'en_attente' | 'refuse' | 'non_soumis' = isKycApproved
    ? 'valide'
    : (existingKyc?.status as any) || 'non_soumis';

  // Désactiver immédiatement le voyant vert et le statut connecté si le livreur n'est pas accrédité KYC
  useEffect(() => {
    if (!isKycApproved && courierSettings.isAvailable) {
      setCourierSettings((prev) => {
        const updated = { ...prev, isAvailable: false };
        if (userProfile?.uid) {
          try {
            localStorage.setItem(`livralink_courier_settings_${userProfile.uid}`, JSON.stringify(updated));
          } catch {}
        }
        return updated;
      });
    }
  }, [isKycApproved, courierSettings.isAvailable, userProfile?.uid, setCourierSettings]);

  // Mission active en cours attribuée à ce livreur
  const activeOrder = deliveries.find((d) => {
    const isOngoing = d.status === 'acceptee' || d.status === 'colis_recupere' || d.status === 'en_cours';
    if (!isOngoing) return false;
    if (userProfile?.role === 'livreur') {
      const isDemo = userProfile.fullName === 'Awa Véloce Livraisons';
      if (isDemo) return true;
      return (
        d.courier?.id === userProfile.uid ||
        (d.courier?.email && userProfile.email && d.courier.email.toLowerCase() === userProfile.email.toLowerCase()) ||
        (d.courier?.name && d.courier.name.toLowerCase() === userProfile.fullName.toLowerCase())
      );
    }
    return d.courier?.id === selectedCourier?.id || (selectedCourier && d.courier?.name === selectedCourier.name);
  });

  // Transmission automatique de la position GPS du livreur en direct pendant une course active
  useEffect(() => {
    if (!activeOrder || !courierSettings.isAvailable) return;
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lng = Math.round(pos.coords.longitude * 10000) / 10000;
        updateDeliveryDetails(activeOrder.id, {
          courierLat: lat,
          courierLng: lng,
          courierLocationUpdatedAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        });
      },
      (err) => {
        console.warn('Suivi GPS livreur en arrière-plan:', err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [activeOrder?.id, courierSettings.isAvailable, updateDeliveryDetails]);

  // GPS coordinates for map
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

  const handleAcceptOrder = (order: DeliveryOrder) => {
    if (!featureFlags.livreurSpaceEnabled) {
      showToast("L'espace livreur est actuellement verrouillé par l'administrateur.", 'error');
      return;
    }
    acceptDelivery(order.id);
  };

  const handleRefuseOrder = (orderId: string) => {
    if (!featureFlags.allowMissionRefusal) {
      showToast("Le refus de mission a été désactivé par l'administrateur.", 'error');
      return;
    }
    refuseDelivery(orderId);
  };

  const handleValidatePickup = (orderId: string) => {
    updateDeliveryStatus(orderId, 'colis_recupere', 'Colis récupéré chez le marchand • En route vers le destinataire');
    showToast(`Colis récupéré pour la course ${orderId}`, 'success');
  };

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
      statusNote: 'Nouvelle course créée par le vendeur',
    });
    showToast(`Nouvelle course ${testOrder.id} créée !`, 'success');
  };

  // Livraisons terminées attribuées spécifiquement à ce livreur
  const myCompletedDeliveries = deliveries.filter((d) => {
    if (d.status !== 'livree') return false;
    if (userProfile?.role === 'livreur') {
      return (
        d.courier?.id === userProfile.uid ||
        (d.courier?.email && userProfile.email && d.courier.email.toLowerCase() === userProfile.email.toLowerCase()) ||
        (d.courier?.name && d.courier.name.toLowerCase() === activeCourierName.toLowerCase())
      );
    }
    return (
      (selectedCourier?.id && d.courier?.id === selectedCourier.id) ||
      (selectedCourier?.name && d.courier?.name === selectedCourier.name)
    );
  });

  const myEstimatedEarnings = myCompletedDeliveries.reduce(
    (sum, d) => sum + (d.deliveryFee || 2500),
    0
  );

  return (
    <div className="flex h-full min-h-[100dvh] md:h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-['Plus_Jakarta_Sans'] transition-colors duration-200">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
        <Header
          title="Tableau de bord Livreur"
          subtitle="Aperçu des missions et tournées en cours"
        />

        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8 max-w-7xl w-full mx-auto">
          {/* Top Profile Header & Availability Bar */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                    Bonjour, {displayName}
                  </h1>
                  <button
                    type="button"
                    onClick={toggleCourierAvailability}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                      isKycApproved && courierSettings.isAvailable
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isKycApproved && courierSettings.isAvailable ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                    <span>{isKycApproved && courierSettings.isAvailable ? 'En ligne' : 'En pause'}</span>
                  </button>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                  <span>{activeCourierVehicle} · {activeCourierPhone}</span>
                  <select
                    value={selectedCourier?.name || activeCourierName}
                    onChange={(e) => selectActiveCourier(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-0.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
                    title="Changer de coursier"
                  >
                    {couriers.map((c) => (
                      <option key={c.id} value={c.name} className="bg-white dark:bg-slate-900">
                        {c.name} ({c.vehicle})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={openKYCModal}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                  isKycApproved
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                }`}
              >
                {isKycApproved ? 'KYC Validé' : 'Vérification KYC'}
              </button>
              <button
                type="button"
                onClick={() => setIsOnboardingOpen(true)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-50"
              >
                Guide
              </button>
            </div>
          </div>

          {/* KYC Alert if not approved */}
          {!isKycApproved && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-amber-600 shrink-0">verified_user</span>
                <span>Votre dossier KYC est en attente ou non soumis. Veuillez déposer votre pièce pour débloquer toutes vos missions.</span>
              </div>
              <button
                onClick={openKYCModal}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-medium text-xs hover:bg-amber-700 shrink-0"
              >
                Déposer pièce
              </button>
            </div>
          )}

          {/* Key Stats Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Courses du jour</span>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {myCompletedDeliveries.length}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Revenus estimés</span>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {myEstimatedEarnings.toLocaleString('fr-FR')} <span className="text-xs text-slate-400 font-normal">FCFA</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Validation POD</span>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
                {myCompletedDeliveries.length}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Disponibles</span>
              <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {pendingDeliveries.length}
              </div>
            </div>
          </div>

          {/* Available Vendor Missions */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Missions Vendeurs Disponibles ({pendingDeliveries.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Choisissez vos courses à exécuter à 100 FCFA/km
                </p>
              </div>

              <button
                onClick={() => setCurrentView('livreur_missions')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Toutes les missions →
              </button>
            </div>

            {pendingDeliveries.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 space-y-3">
                <p>Aucune course vendeur en attente pour le moment.</p>
                <button
                  onClick={handleCreateTestOrder}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  Simuler une nouvelle course
                </button>
              </div>
            ) : (
              <div className="space-y-3">
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
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{order.id}</span>
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span className="text-slate-700 dark:text-slate-200 font-medium">{order.itemDescription} ({order.itemWeightKg} kg)</span>
                        </div>
                        <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm sm:text-right">
                          {price.toLocaleString('fr-FR')} FCFA <span className="text-xs font-normal text-slate-400">({distKm} km)</span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <div>
                          <span className="text-slate-400 text-[11px] block">Collecte:</span>
                          <span className="font-semibold text-slate-900 dark:text-white">{order.pickupLocation.name}</span> ({order.pickupLocation.commune})
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] block">Livraison:</span>
                          <span className="font-semibold text-slate-900 dark:text-white">{order.clientName}</span> ({order.dropoffLocation.commune})
                        </div>
                      </div>

                      {isMapExpanded && (
                        <div className="pt-1">
                          <GoogleMapDelivery
                            origin={pOrigin}
                            destination={pDropoff}
                            originLabel={`Collecte: ${order.pickupLocation.name}`}
                            destinationLabel={`Client: ${order.clientName}`}
                            heightClass="h-[240px]"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          onClick={() => setExpandedMapOrderId(isMapExpanded ? null : order.id)}
                          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">map</span>
                          <span>{isMapExpanded ? 'Masquer carte' : 'Tracé carte'}</span>
                        </button>

                        <div className="flex items-center gap-2">
                          {featureFlags.allowMissionRefusal && (
                            <button
                              onClick={() => handleRefuseOrder(order.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                            >
                              Refuser
                            </button>
                          )}
                          <button
                            onClick={() => handleAcceptOrder(order)}
                            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs"
                          >
                            Accepter ({price.toLocaleString('fr-FR')} F)
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Active Mission View (If assigned) */}
          {activeOrder && (
            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Mission en cours</span>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Course <span className="font-mono">{activeOrder.id}</span>
                  </h2>
                </div>
                <div className="font-mono font-bold text-emerald-600 text-sm">
                  {(activeOrder.deliveryFee || activeFee).toLocaleString('fr-FR')} FCFA
                </div>
              </div>

              <GoogleMapDelivery
                origin={activeOriginCoords}
                destination={activeDropoffCoords}
                originLabel={`Collecte: ${activeOrder.pickupLocation.name}`}
                destinationLabel={`Client: ${activeOrder.clientName}`}
                heightClass="h-[280px]"
              />

              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
                  <div>
                    <div className="text-slate-400 text-[11px]">1. Point de collecte (Marchand)</div>
                    <div className="font-semibold text-slate-900 dark:text-white">{activeOrder.pickupLocation.name}</div>
                  </div>
                  {activeOrder.status === 'acceptee' && (
                    <button
                      onClick={() => handleValidatePickup(activeOrder.id)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs"
                    >
                      Valider collecte
                    </button>
                  )}
                </div>

                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
                  <div>
                    <div className="text-slate-400 text-[11px]">2. Point de livraison (Client)</div>
                    <div className="font-semibold text-slate-900 dark:text-white">{activeOrder.clientName} ({activeOrder.clientPhone})</div>
                  </div>
                  {(activeOrder.status === 'colis_recupere' || activeOrder.status === 'en_cours') && (
                    <button
                      onClick={handleOpenPOD}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                    >
                      Valider livraison (POD)
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}
        </main>

        <OnboardingGuideModal
          isOpen={isOnboardingOpen}
          onClose={() => setIsOnboardingOpen(false)}
          role="livreur"
        />

        <MobileBottomNav />
      </div>
    </div>
  );
};
