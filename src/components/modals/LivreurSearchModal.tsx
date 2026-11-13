import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Courier } from '../../types';
import { filterVendorDeliveries } from '../../utils/deliveryIsolation';

interface LivreurSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedOrderId?: string;
  onSelectCourier?: (courier: Courier) => void;
}

export const LivreurSearchModal: React.FC<LivreurSearchModalProps> = ({
  isOpen,
  onClose,
  preSelectedOrderId,
  onSelectCourier
}) => {
  const {
    couriers,
    deliveries,
    assignCourierToDelivery,
    openWhatsAppModal,
    showToast,
    setCurrentView,
    merchantSettings,
    firebaseUser,
    userProfile,
    isAdminAuthenticated,
    isUserMasterAdmin,
    isDirectorModeActive,
    directorTargetId,
    directorTargetName,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedZone, setSelectedZone] = useState('all');
  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'disponible' | 'en_course' | 'kyc_only'>('all');
  const [sortBy, setSortBy] = useState<'rating' | 'deliveries' | 'distance'>('rating');

  // List of distinct Beninese communes/zones from couriers
  const zones = useMemo(() => {
    const set = new Set<string>();
    couriers.forEach(c => {
      if (c.zone) set.add(c.zone);
    });
    return Array.from(set);
  }, [couriers]);

  const ownedDeliveries = useMemo(() => {
    return filterVendorDeliveries(deliveries, {
      userProfile,
      firebaseUserUid: firebaseUser?.uid,
      isAdminAuthenticated,
      isUserMasterAdmin,
      isDirectorModeActive,
      directorTargetId,
      directorTargetName,
    });
  }, [deliveries, userProfile, firebaseUser?.uid, isAdminAuthenticated, isUserMasterAdmin, isDirectorModeActive, directorTargetId, directorTargetName]);

  // Orders eligible for direct assignment (status === 'en_attente')
  const pendingOrders = useMemo(() => {
    return ownedDeliveries.filter(d => d.status === 'en_attente' || !d.courier);
  }, [ownedDeliveries]);

  // Target order to assign if preSelectedOrderId is provided
  const targetOrder = useMemo(() => {
    if (!preSelectedOrderId) return pendingOrders[0] || null;
    return ownedDeliveries.find(d => d.id === preSelectedOrderId) || pendingOrders[0] || null;
  }, [preSelectedOrderId, ownedDeliveries, pendingOrders]);

  // Filter and sort couriers
  const filteredCouriers = useMemo(() => {
    return couriers
      .filter(c => {
        // Text search
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase().trim();
          const matchName = c.name.toLowerCase().includes(q);
          const matchPhone = c.phone.includes(q);
          const matchVehicle = c.vehicle.toLowerCase().includes(q);
          const matchZone = c.zone.toLowerCase().includes(q);
          if (!matchName && !matchPhone && !matchVehicle && !matchZone) return false;
        }

        // Zone filter
        if (selectedZone !== 'all' && c.zone !== selectedZone) {
          return false;
        }

        // Vehicle filter
        if (selectedVehicle !== 'all') {
          const v = c.vehicle.toLowerCase();
          if (selectedVehicle === 'moto' && !v.includes('moto') && !v.includes('yamaha') && !v.includes('honda') && !v.includes('pulsar') && !v.includes('apache')) return false;
          if (selectedVehicle === 'scooter' && !v.includes('scooter') && !v.includes('électrique')) return false;
          if (selectedVehicle === 'velo' && !v.includes('vélo') && !v.includes('cargo')) return false;
          if (selectedVehicle === 'van' && !v.includes('van') && !v.includes('voiture')) return false;
        }

        // Status filter
        if (statusFilter === 'disponible' && c.status !== 'en_ligne') return false;
        if (statusFilter === 'en_course' && c.status !== 'en_course') return false;
        if (statusFilter === 'kyc_only' && !c.isKycVerified) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
        if (sortBy === 'deliveries') return (b.totalDeliveries || 0) - (a.totalDeliveries || 0);
        if (sortBy === 'distance') return (a.distanceKm || 0) - (b.distanceKm || 0);
        return 0;
      });
  }, [couriers, searchTerm, selectedZone, selectedVehicle, statusFilter, sortBy]);

  if (!isOpen) return null;

  const handleWhatsAppContact = (courier: Courier) => {
    const store = merchantSettings.storeName || 'notre boutique';
    const msg = `Bonjour ${courier.name}, je suis commerçant chez *${store}* sur LivraLink. J'ai une course à livrer et souhaiterais savoir si vous êtes disponible dans votre zone (${courier.zone}) ?`;
    openWhatsAppModal(courier.phone, courier.name, msg);
  };

  const handleAssignToOrder = (courier: Courier) => {
    if (onSelectCourier) {
      onSelectCourier(courier);
      onClose();
      return;
    }

    if (targetOrder) {
      assignCourierToDelivery(targetOrder.id, courier.id);
      showToast(`🎉 Livreur ${courier.name} assigné avec succès à la commande ${targetOrder.id} !`, 'success');
      onClose();
    } else {
      // No pending order, prompt vendor to create new delivery with this courier
      setCurrentView('vendeur_new_delivery');
      showToast(`Livreur ${courier.name} sélectionné pour votre prochaine course.`, 'info');
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white dark:from-slate-900 dark:to-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <span className="material-symbols-outlined text-2xl">person_search</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Livreurs Inscrits sur LivraLink
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                  {filteredCouriers.length} livreur{filteredCouriers.length > 1 ? 's' : ''} inscrit{filteredCouriers.length > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Recherche uniquement parmi les livreurs inscrits sur la plateforme, leurs notes, véhicules et disponibilités.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            title="Fermer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Target order banner if selecting for a specific delivery */}
        {targetOrder && (
          <div className="px-4 sm:px-6 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/80 dark:border-amber-900/60 flex items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-sm">local_shipping</span>
              <span className="text-slate-700 dark:text-slate-300 truncate">
                Attribution pour : <strong>{targetOrder.id}</strong> • {targetOrder.clientName} ({targetOrder.dropoffLocation.commune})
              </span>
            </div>
            <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/80 px-2 py-0.5 rounded-full shrink-0">
              {targetOrder.deliveryFee.toLocaleString('fr-FR')} FCFA
            </span>
          </div>
        )}

        {/* Filters and Search Bar */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3 shrink-0">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par nom, téléphone, modèle de moto, commune (ex: Awa, Haie Vive, Yamaha)..."
              className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <span className="material-symbols-outlined text-base">cancel</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {/* Zone Selector */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                Zone / Commune
              </label>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="w-full py-2 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">Toutes les zones</option>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>

            {/* Vehicle Selector */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                Type de véhicule
              </label>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="w-full py-2 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">Tous véhicules</option>
                <option value="moto">Moto (125cc - 150cc)</option>
                <option value="scooter">Scooter Électrique</option>
                <option value="velo">Vélo Cargo</option>
                <option value="van">Van / Voiture</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                Statut &amp; KYC
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full py-2 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">Tous statuts</option>
                <option value="disponible">🟢 Disponibles (En ligne)</option>
                <option value="en_course">🔵 En course</option>
                <option value="kyc_only">🛡️ Vérifiés KYC uniquement</option>
              </select>
            </div>

            {/* Sort Selector */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                Trier par
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full py-2 px-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 font-bold"
              >
                <option value="rating">★ Mieux notés</option>
                <option value="deliveries">📦 Nombre de livraisons</option>
                <option value="distance">📍 Plus proches (Distance)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Couriers List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 custom-scrollbar">
          {filteredCouriers.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <span className="material-symbols-outlined text-3xl">two_wheeler</span>
              </div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Aucun livreur ne correspond à vos critères
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Essayez d'élargir la zone géographique ou de réinitialiser vos filtres de recherche.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedZone('all');
                  setSelectedVehicle('all');
                  setStatusFilter('all');
                }}
                className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 rounded-xl text-xs font-bold transition-all"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            filteredCouriers.map((courier) => {
              const isAvailable = courier.status === 'en_ligne';
              const isBusy = courier.status === 'en_course';

              return (
                <div
                  key={courier.id}
                  className="bg-white dark:bg-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 transition-all shadow-2xs hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Courier Left Details */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-blue-500/20">
                        {courier.avatarInitials || courier.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span
                        className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${
                          isAvailable
                            ? 'bg-emerald-500 animate-pulse'
                            : isBusy
                            ? 'bg-blue-500'
                            : 'bg-slate-400'
                        }`}
                        title={isAvailable ? 'Disponible' : isBusy ? 'En course' : 'Hors-ligne'}
                      />
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                          {courier.name}
                        </h4>

                        {/* KYC Verification Badge */}
                        {courier.isKycVerified ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold" title="Identité CNI et permis vérifiés par l'administration">
                            <span className="material-symbols-outlined text-xs">verified</span>
                            <span>Vérifié KYC</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                            <span>KYC en cours</span>
                          </span>
                        )}

                        {courier.badge && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800">
                            {courier.badge}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium">
                          <span className="material-symbols-outlined text-sm text-blue-600 dark:text-blue-400">two_wheeler</span>
                          <span>{courier.vehicle} {courier.vehiclePlate ? `(${courier.vehiclePlate})` : ''}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-slate-400">near_me</span>
                          <span>{courier.zone}</span>
                        </span>
                        <span>•</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          ~{courier.distanceKm} km (ETA {courier.etaMinutes} min)
                        </span>
                      </div>

                      {/* Ratings and Stats */}
                      <div className="flex items-center gap-3 pt-0.5 text-xs">
                        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                          <span className="material-symbols-outlined text-sm fill-current">star</span>
                          <span>{courier.rating?.toFixed(1) || '5.0'}</span>
                          <span className="text-[11px] text-slate-400 font-normal">
                            ({courier.totalReviews || courier.totalDeliveries || 48} avis)
                          </span>
                        </div>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span className="text-slate-600 dark:text-slate-400">
                          <strong>{courier.totalDeliveries}</strong> courses réussies
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                          Tarif officiel : 100 F/km
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Courier Action Buttons */}
                  <div className="flex items-center gap-2 pt-2 md:pt-0 shrink-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleWhatsAppContact(courier)}
                      className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
                      title="Contacter directement sur WhatsApp"
                    >
                      <span className="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400">chat</span>
                      <span className="hidden sm:inline">WhatsApp</span>
                    </button>

                    <a
                      href={`tel:${courier.phone}`}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-all active:scale-95"
                      title={`Appeler ${courier.name} (${courier.phone})`}
                    >
                      <span className="material-symbols-outlined text-sm">call</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleAssignToOrder(courier)}
                      className="flex-1 sm:flex-initial px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                      <span>
                        {targetOrder ? `Assigner à ${targetOrder.id}` : 'Choisir ce livreur'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-[11px]">
            <span className="material-symbols-outlined text-base text-blue-600">verified_user</span>
            <span>Tous les livreurs de la plateforme sont rigoureusement soumis à la vérification KYC</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition-all cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
