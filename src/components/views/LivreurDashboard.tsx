import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { GoogleMapDelivery } from '../maps/GoogleMapDelivery';
import { getLocationForCommune, calculateDistanceKm } from '../../config/maps';
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
    setCurrentView,
    featureFlags,
    openKYCModal,
    kycRequests,
    firebaseUser,
    isAdminAuthenticated,
    isUserMasterAdmin,
    gpsTrackingStatus,
    syncCourierGpsPosition,
    platformConfig,
    computeQuotePreview,
  } = useApp();

  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [expandedMapOrderId, setExpandedMapOrderId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const activeUid = userProfile?.uid || firebaseUser?.uid || '';
  const isSupervisory = isAdminAuthenticated && isUserMasterAdmin;

  // Propositions ciblées exclusivement à ce livreur (aucune diffusion massive)
  const pendingDeliveries = deliveries.filter((d) => {
    if (d.status !== 'en_attente' || d.courier || d.courierId) return false;
    if (isSupervisory) return true;
    return Boolean(activeUid && d.targetCourierId === activeUid);
  });

  const activeCourierName =
    (userProfile?.role === 'livreur' && userProfile?.fullName) ||
    courierSettings.fullName ||
    (isSupervisory ? selectedCourier?.name : '') ||
    'Coursier LivraLink';

  const displayName = activeCourierName.split(' ')[0] || 'Livreur';
  const activeCourierPhone = (userProfile?.role === 'livreur' && userProfile.phone) || courierSettings.phone || (isSupervisory ? selectedCourier?.phone : '') || '';
  const activeCourierVehicle = courierSettings.vehicleType || (isSupervisory ? selectedCourier?.vehicle : '') || 'Moto';

  const kycTargetId = activeUid || (isSupervisory ? selectedCourier?.id || '' : '');

  // KYC status evaluation (strictly scoped by UID)
  const isKycApproved =
    (isSupervisory && selectedCourier?.isKycVerified) ||
    userProfile?.isKycVerified ||
    courierSettings.isKycVerified ||
    (kycTargetId
      ? kycRequests.some((k) => k.courierId === kycTargetId && k.status === 'valide')
      : false);

  const existingKyc = kycTargetId
    ? kycRequests.find((k) => k.courierId === kycTargetId || k.id === kycTargetId)
    : undefined;

  const kycStatus: 'valide' | 'en_attente' | 'refuse' | 'non_soumis' = isKycApproved
    ? 'valide'
    : ((existingKyc?.status ||
        userProfile?.kycStatus ||
        courierSettings.kycStatus ||
        'non_soumis') as 'valide' | 'en_attente' | 'refuse' | 'non_soumis');

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

  // Mission active en cours attribuée à ce livreur (isolation stricte par UID)
  const activeOrder = deliveries.find((d) => {
    const isOngoing = d.status === 'acceptee' || d.status === 'colis_recupere' || d.status === 'en_cours';
    if (!isOngoing) return false;
    if (activeUid) {
      return d.courier?.id === activeUid || d.courierId === activeUid;
    }
    if (isSupervisory && selectedCourier?.id) {
      return d.courier?.id === selectedCourier.id || d.courierId === selectedCourier.id;
    }
    return false;
  });

  // Décompte en direct pour les propositions exclusives avec offerExpiresAt
  const hasTimedPendingOffer = pendingDeliveries.some((d) => Boolean(d.offerExpiresAt));
  useEffect(() => {
    if (!hasTimedPendingOffer) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasTimedPendingOffer]);

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
  const activeFee = activeOrder?.deliveryFee || computeQuotePreview({ distanceKm: activeDistanceKm }).finalDeliveryFeeFCFA;

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

  // Livraisons terminées attribuées spécifiquement à ce livreur
  const myCompletedDeliveries = deliveries.filter((d) => {
    if (d.status !== 'livree') return false;
    if (activeUid) {
      return d.courier?.id === activeUid || d.courierId === activeUid;
    }
    if (isSupervisory && selectedCourier?.id) {
      return d.courier?.id === selectedCourier.id || d.courierId === selectedCourier.id;
    }
    return false;
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
                  {isSupervisory && couriers.length > 0 && (
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
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => void syncCourierGpsPosition()}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 cursor-pointer transition-colors ${
                  gpsTrackingStatus === 'active'
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                    : gpsTrackingStatus === 'denied'
                    ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
                title="Actualiser votre position GPS pour recevoir les livraisons les plus proches"
              >
                <span className="material-symbols-outlined text-sm">my_location</span>
                <span>
                  {gpsTrackingStatus === 'active'
                    ? 'GPS Actif'
                    : gpsTrackingStatus === 'denied'
                    ? 'GPS Refusé'
                    : 'Actualiser GPS'}
                </span>
              </button>
              <button
                type="button"
                onClick={openKYCModal}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                  kycStatus === 'valide'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : kycStatus === 'en_attente'
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                    : kycStatus === 'refuse'
                    ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                    : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                }`}
              >
                {kycStatus === 'valide'
                  ? 'KYC Validé'
                  : kycStatus === 'en_attente'
                  ? 'KYC En examen'
                  : kycStatus === 'refuse'
                  ? 'KYC Refusé'
                  : 'Vérification KYC'}
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
            <div
              className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                kycStatus === 'en_attente'
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                  : kycStatus === 'refuse'
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined text-lg shrink-0 ${
                    kycStatus === 'en_attente'
                      ? 'text-blue-600'
                      : kycStatus === 'refuse'
                      ? 'text-red-600'
                      : 'text-amber-600'
                  }`}
                >
                  {kycStatus === 'en_attente' ? 'hourglass_top' : kycStatus === 'refuse' ? 'error' : 'verified_user'}
                </span>
                <span>
                  {kycStatus === 'en_attente'
                    ? 'Votre dossier KYC a bien été transmis et est en cours d’examen par l’administrateur.'
                    : kycStatus === 'refuse'
                    ? `Votre dossier KYC a été refusé : ${existingKyc?.rejectionReason || userProfile?.kycRejectionReason || courierSettings.kycRejectionReason || 'Veuillez corriger vos pièces et soumettre à nouveau.'}`
                    : 'Votre dossier KYC est non soumis. Veuillez déposer votre pièce d’identité pour débloquer toutes vos missions.'}
                </span>
              </div>
              <button
                onClick={openKYCModal}
                className={`px-3 py-1.5 rounded-lg text-white font-medium text-xs shrink-0 cursor-pointer ${
                  kycStatus === 'en_attente'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : kycStatus === 'refuse'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {kycStatus === 'en_attente'
                  ? 'Consulter mon dossier'
                  : kycStatus === 'refuse'
                  ? 'Corriger & Re-soumettre'
                  : 'Déposer pièce'}
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

          {/* Propositions Exclusives pour ce Livreur */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Propositions Exclusives pour Vous ({pendingDeliveries.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Attribution intelligente selon votre proximité GPS • {platformConfig.pricing.pricePerKmFCFA} {platformConfig.general.currency}/km
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
              <div className="py-8 text-center text-xs text-slate-500 space-y-2">
                <p>Aucune proposition ciblée pour vous en ce moment.</p>
                <p className="text-[11px] text-slate-400">Restez en ligne avec votre GPS actif pour recevoir en priorité les courses proches de votre position.</p>
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
                  const price = order.deliveryFee || computeQuotePreview({ distanceKm: distKm }).finalDeliveryFeeFCFA;
                  const isMapExpanded = expandedMapOrderId === order.id;
                  const expMs = typeof order.offerExpiresAt === 'number'
                    ? order.offerExpiresAt
                    : order.offerExpiresAt
                    ? Date.parse(String(order.offerExpiresAt))
                    : NaN;
                  const remainingSec = Number.isFinite(expMs) ? Math.max(0, Math.ceil((expMs - nowMs) / 1000)) : null;

                  return (
                    <div
                      key={order.id}
                      className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10 space-y-3 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{order.id}</span>
                          {order.targetIsPreferred && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">
                              ⭐ Client vous préfère
                            </span>
                          )}
                          {typeof order.targetCourierDistanceKm === 'number' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              À {order.targetCourierDistanceKm} km de vous
                            </span>
                          )}
                          {remainingSec !== null && (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-black text-[10px] font-mono">
                              ⏳ {remainingSec}s
                            </span>
                          )}
                          <span className="text-slate-700 dark:text-slate-200 font-medium">{order.itemDescription} ({order.itemWeightKg || 1} kg)</span>
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
                  {(activeOrder.status === 'acceptee' || activeOrder.status === 'assignee') && (
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
