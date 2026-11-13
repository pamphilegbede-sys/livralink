import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { DeliveryOrder } from '../../types';
import { GoogleMapDelivery } from '../maps/GoogleMapDelivery';
import { getLocationForCommune } from '../../config/maps';
import { filterVendorDeliveries } from '../../utils/deliveryIsolation';

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
    duplicateDeliveryOrder,
    generateNewOTP,
    firebaseUser,
    userProfile,
    isAdminAuthenticated,
    isUserMasterAdmin,
    isDirectorModeActive,
    directorTargetId,
    directorTargetName,
    openLivreurSearchModal,
    openRateLivreurModal,
  } = useApp();

  // Isolation stricte des livraisons pour le suivi vendeur (par UID uniquement)
  const merchantDeliveries = filterVendorDeliveries(deliveries, {
    userProfile,
    firebaseUserUid: firebaseUser?.uid,
    isAdminAuthenticated,
    isUserMasterAdmin,
    isDirectorModeActive,
    directorTargetId,
    directorTargetName,
  });

  const [activeCourseId, setActiveCourseId] = useState(
    merchantDeliveries.find((d) => d.id === selectedDelivery?.id)?.id || merchantDeliveries[0]?.id || ''
  );
  const [activeFilter, setActiveFilter] = useState<'all' | 'en_attente' | 'en_cours' | 'terminees'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Sync active course strictly within merchantDeliveries
  React.useEffect(() => {
    if (selectedDelivery?.id && merchantDeliveries.some((d) => d.id === selectedDelivery.id)) {
      setActiveCourseId(selectedDelivery.id);
    } else if (!merchantDeliveries.some((d) => d.id === activeCourseId)) {
      setActiveCourseId(merchantDeliveries[0]?.id || '');
    }
  }, [selectedDelivery, merchantDeliveries, activeCourseId]);

  const currentOrder = merchantDeliveries.find((d) => d.id === activeCourseId) || merchantDeliveries[0];

  // Calcul dynamique des compteurs de statut pour les onglets
  const countAll = merchantDeliveries.length;
  const countPending = merchantDeliveries.filter((d) => d.status === 'en_attente' || d.status === 'assignee').length;
  const countOngoing = merchantDeliveries.filter((d) => d.status === 'en_cours' || d.status === 'acceptee' || d.status === 'colis_recupere').length;
  const countCompleted = merchantDeliveries.filter((d) => d.status === 'livree').length;

  const filteredDeliveries = merchantDeliveries.filter((order) => {
    // Filtres par statut demandés par l'utilisateur : en attente, en cours, terminées
    if (activeFilter === 'en_attente' && !(order.status === 'en_attente' || order.status === 'assignee')) return false;
    if (activeFilter === 'en_cours' && !(order.status === 'en_cours' || order.status === 'acceptee' || order.status === 'colis_recupere')) return false;
    if (activeFilter === 'terminees' && order.status !== 'livree') return false;

    // Barre de recherche textuelle multi-critères
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      return (
        order.id.toLowerCase().includes(q) ||
        order.clientName.toLowerCase().includes(q) ||
        order.clientPhone.toLowerCase().includes(q) ||
        order.dropoffLocation.commune.toLowerCase().includes(q) ||
        order.dropoffLocation.address.toLowerCase().includes(q) ||
        order.pickupLocation.commune.toLowerCase().includes(q) ||
        order.itemDescription.toLowerCase().includes(q) ||
        (order.courier && order.courier.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleSelectOrder = (order: DeliveryOrder) => {
    setActiveCourseId(order.id);
    setSelectedDelivery(order);
  };

  const handleShareTrackingLink = () => {
    const trackingUrl = `https://livralink.bj/track/${currentOrder.id.replace('#', '')}`;
    navigator.clipboard.writeText(trackingUrl);
    showToast(`Lien de suivi client copié : ${trackingUrl}`, 'success');
  };

  const handleDirectWhatsApp = () => {
    const msg = `Bonjour ${currentOrder.clientName}, votre colis LivraLink (${currentOrder.id}) est en cours de livraison par ${currentOrder.courier?.name || 'votre coursier'}. Suivi direct : https://livralink.bj/track/${currentOrder.id.replace('#', '')}`;
    openWhatsAppModal(currentOrder.clientPhone, currentOrder.clientName, msg);
  };

  const handleRelaunch = (orderId: string) => {
    updateDeliveryStatus(orderId, 'en_attente', 'Recherche coursier relancée par le vendeur');
    showToast(`Recherche de coursier relancée pour ${orderId}`, 'info');
  };

  const currentOtp = currentOrder?.otpCode || '8492';

  const handleCopyOtp = () => {
    navigator.clipboard.writeText(currentOtp);
    showToast(`Code secret OTP #${currentOtp} copié !`, 'success');
  };

  const handleSendOtpWhatsApp = () => {
    const msg = `Bonjour *${currentOrder.clientName}*, votre colis LivraLink (${currentOrder.id}) est prêt pour la livraison. Voici votre *code secret OTP de livraison : ${currentOtp}*.\n\n⚠️ Veuillez communiquer ou taper ce code à 4 chiffres sur le smartphone de votre coursier à son arrivée pour valider la réception.`;
    openWhatsAppModal(currentOrder.clientPhone, currentOrder.clientName, msg);
  };

  const handleRegenerateOtp = () => {
    if (!currentOrder) return;
    const newOtp = generateNewOTP(currentOrder.id);
    showToast(`Nouveau code secret #${newOtp} généré avec succès !`, 'success');
  };

  return (
    <div className="flex h-full min-h-[100dvh] md:h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff] dark:bg-slate-950">
        {/* Top Header */}
        <Header
          title="Mes Livraisons"
          subtitle="Suivi temps réel, traçabilité GPS et gestion des colis expédiés"
          showReturn
        />

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-3.5 sm:p-5 md:p-8 space-y-6 pb-28 md:pb-12 max-w-7xl mx-auto w-full">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <span className="material-symbols-outlined text-xl">local_shipping</span>
                </span>
                <div>
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white">Suivi Opérationnel des Livraisons</h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Supervision de l'état d'acheminement et des preuves POD</p>
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
            <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-2xl">two_wheeler</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Colis {currentOrder.id}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        currentOrder.status === 'livree' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300' :
                        currentOrder.status === 'en_cours' ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 animate-pulse' :
                        currentOrder.status === 'echec' ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                      }`}>
                        {currentOrder.status === 'livree' ? 'Livrée avec succès' :
                         currentOrder.status === 'en_cours' ? 'En cours d\'acheminement' :
                         currentOrder.status === 'colis_recupere' ? 'Colis récupéré' :
                         currentOrder.status === 'acceptee' ? 'Acceptée par coursier' :
                         currentOrder.status === 'echec' ? 'Incident / Échec' : 'En attente coursier'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Client : <strong className="text-slate-900 dark:text-white">{currentOrder.clientName}</strong> • Tél : {currentOrder.clientPhone} • Montant COD :{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400 font-bold">{currentOrder.itemValueCOD.toLocaleString('fr-FR')} FCFA</strong> ({currentOrder.itemDescription})
                    </p>
                  </div>
                </div>

                {/* Actions for current order (Mobile Touch Friendly) */}
                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleShareTrackingLink}
                    className="min-h-[44px] flex-1 sm:flex-initial px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-95"
                  >
                    <span className="material-symbols-outlined text-base">share</span>
                    <span>Lien suivi</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDirectWhatsApp}
                    className="min-h-[44px] flex-1 sm:flex-initial px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                  >
                    <span className="material-symbols-outlined text-base">chat</span>
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateDeliveryOrder(currentOrder.id)}
                    className="min-h-[44px] flex-1 sm:flex-initial px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-95 cursor-pointer"
                    title="Créer une nouvelle course à partir de celle-ci"
                  >
                    <span className="material-symbols-outlined text-base">content_copy</span>
                    <span>Dupliquer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDelivery(currentOrder);
                      setIsPODModalOpen(true);
                    }}
                    className="min-h-[44px] w-full sm:w-auto px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                  >
                    <span className="material-symbols-outlined text-base">verified</span>
                    <span>Preuve POD</span>
                  </button>
                </div>
              </div>

              {/* Seller Read-Only Tracking Status Info Banner */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold">
                  <span className="material-symbols-outlined text-sm text-blue-600 dark:text-blue-400">info</span>
                  <span>Suivi Vendeur : Seul le livreur certifié assigné peut valider les étapes de livraison (colis récupéré, en transit, POD).</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="px-2.5 py-1 rounded-lg bg-blue-100/70 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    Mises à jour en direct
                  </span>
                </div>
              </div>

              {/* Carte Gestion Code OTP Vendeur ➔ Client (Sécurité POD Obligatoire) */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-lg space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-400/30">
                      <span className="material-symbols-outlined text-xl">pin</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm text-white">Code Secret OTP Client</h4>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30">
                          Preuve Obligatoire n°1
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Transmettez ce code à <strong>{currentOrder.clientName}</strong> afin qu'il le tape sur le smartphone du livreur à la livraison.
                      </p>
                    </div>
                  </div>

                  {/* Secret OTP Display */}
                  <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-2xl border border-white/15 self-start sm:self-auto">
                    <span className="text-xs text-slate-400 font-medium">Code secret :</span>
                    <span className="font-mono text-2xl font-black text-amber-400 tracking-widest">
                      {currentOtp}
                    </span>
                  </div>
                </div>

                {/* OTP Actions for Seller */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-emerald-400">lock</span>
                    <span>Inviolable : Le livreur ne peut pas certifier la course sans ce code tapé par le client.</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleCopyOtp}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer border border-white/10"
                    >
                      <span className="material-symbols-outlined text-sm">content_copy</span>
                      <span>Copier code</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRegenerateOtp}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-amber-300 text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer border border-amber-400/20"
                      title="Générer un nouveau code secret 4 chiffres"
                    >
                      <span className="material-symbols-outlined text-sm">sync</span>
                      <span>Régénérer OTP</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSendOtpWhatsApp}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md shadow-emerald-600/30 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">send</span>
                      <span>Envoyer au client via WhatsApp</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Certificat de Livraison POD Tri-Facteur (affiché si la course est livrée) */}
              {currentOrder.status === 'livree' && currentOrder.podData && (
                <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border-2 border-emerald-300 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-emerald-200">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <span className="material-symbols-outlined text-xl">verified</span>
                      </span>
                      <div>
                        <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                          <span>Certificat de Livraison Tri-Facteur Validé</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-extrabold">
                            3/3 Preuves Conformes
                          </span>
                        </h4>
                        <p className="text-xs text-slate-600">
                          Horodatage de remise certifiée : <strong>{currentOrder.podData.validatedAt || '12:04'}</strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* The 3 proofs displayed side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Proof 1: OTP */}
                    <div className="p-3.5 rounded-2xl bg-white border border-emerald-200 shadow-2xs space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">✓</span>
                        <span>1. Code Secret OTP</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-150 text-center">
                        <span className="text-[10px] text-slate-400 block font-medium">Code tapé par le client</span>
                        <span className="font-mono text-xl font-black text-emerald-700">
                          #{currentOrder.podData.otpCode || currentOrder.podData.code || currentOtp}
                        </span>
                      </div>
                      <p className="text-[10px] text-emerald-800 font-semibold text-center">
                        Code client validé avec succès
                      </p>
                    </div>

                    {/* Proof 2: Direct live photo without face */}
                    <div className="p-3.5 rounded-2xl bg-white border border-emerald-200 shadow-2xs space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">✓</span>
                        <span>2. Photo Directe Colis</span>
                      </div>
                      <div className="h-24 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 relative group">
                        {currentOrder.podData.photoUrl ? (
                          <img
                            src={currentOrder.podData.photoUrl}
                            alt="Photo certifiée du colis en direct"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                            <span className="material-symbols-outlined text-2xl text-emerald-600">photo_camera</span>
                            <span>Photo prise en direct</span>
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                          Sans visage
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 text-center">
                        Colis photographié en mains propres
                      </p>
                    </div>

                    {/* Proof 3: Tactile signature & Signer Name */}
                    <div className="p-3.5 rounded-2xl bg-white border border-emerald-200 shadow-2xs space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">✓</span>
                        <span>3. Signature &amp; Nom</span>
                      </div>
                      <div className="h-24 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center p-2">
                        {currentOrder.podData.signatureDataUrl ? (
                          <img
                            src={currentOrder.podData.signatureDataUrl}
                            alt="Signature tactile"
                            className="max-h-14 object-contain"
                          />
                        ) : (
                          <span className="text-xs text-blue-700 font-serif italic font-bold">
                            Signature certifiée
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-slate-800 mt-1 truncate max-w-full">
                          {currentOrder.podData.signedByName || currentOrder.clientName}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 text-center">
                        Signé sur écran tactile du livreur
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tracé Google Maps Bénin en direct */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5 text-blue-700">
                    <span className="material-symbols-outlined text-base">map</span>
                    <span>Trajet Google Maps &amp; Tarification (100 FCFA/km)</span>
                  </span>
                  <span className="text-slate-500">
                    {currentOrder.pickupLocation.commune} ➔ {currentOrder.dropoffLocation.commune}
                  </span>
                </div>
                <GoogleMapDelivery
                  origin={
                    currentOrder.pickupLocation?.coordinates
                      ? { lat: currentOrder.pickupLocation.coordinates[0], lng: currentOrder.pickupLocation.coordinates[1] }
                      : getLocationForCommune(currentOrder.pickupLocation?.commune || 'Cotonou - Haie Vive')
                  }
                  destination={
                    currentOrder.dropoffLocation?.coordinates
                      ? { lat: currentOrder.dropoffLocation.coordinates[0], lng: currentOrder.dropoffLocation.coordinates[1] }
                      : getLocationForCommune(currentOrder.dropoffLocation?.commune || 'Cotonou - Cadjehoun')
                  }
                  originLabel={`Boutique: ${currentOrder.pickupLocation.name}`}
                  destinationLabel={`Client: ${currentOrder.clientName}`}
                  courierPosition={
                    (currentOrder.courierLat && currentOrder.courierLng)
                      ? { lat: currentOrder.courierLat, lng: currentOrder.courierLng }
                      : (currentOrder.status === 'en_cours' || currentOrder.status === 'colis_recupere')
                      ? getLocationForCommune(currentOrder.pickupLocation?.commune || 'Cotonou - Haie Vive')
                      : undefined
                  }
                  courierName={currentOrder.courier?.name || 'Livreur Partenaire'}
                  heightClass="h-[280px]"
                />
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
                  {currentOrder.courier ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Coursier assigné</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                          {currentOrder.courier.status === 'en_course' ? 'En livraison' : 'Disponible'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                          {currentOrder.courier.avatarInitials}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">{currentOrder.courier.name}</div>
                          <div className="text-[11px] text-slate-500">{currentOrder.courier.vehicle} • {currentOrder.courier.phone}</div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-center text-xs">
                        <div className="p-2 bg-white rounded-xl border border-slate-100">
                          <span className="text-[10px] text-slate-400 block">Note globale</span>
                          <strong className="text-amber-600">★ {currentOrder.courier.rating?.toFixed(1) || '5.0'}</strong>
                        </div>
                        <div className="p-2 bg-white rounded-xl border border-slate-100">
                          <span className="text-[10px] text-slate-400 block">Courses réussies</span>
                          <strong className="text-slate-900">{currentOrder.courier.totalDeliveries}+</strong>
                        </div>
                      </div>

                      {/* Évaluation / Notation du livreur pour cette course */}
                      {currentOrder.status === 'livree' && (
                        <div className="pt-2 border-t border-slate-200/60 space-y-2">
                          {currentOrder.courierRating ? (
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-amber-900 flex items-center gap-1">
                                  <span>⭐ Votre avis enregistré :</span>
                                  <strong className="text-amber-700">{currentOrder.courierRating.rating}/5</strong>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openRateLivreurModal(currentOrder)}
                                  className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                                >
                                  Modifier
                                </button>
                              </div>
                              {currentOrder.courierRating.comment && (
                                <p className="text-[11px] text-slate-600 italic">
                                  « {currentOrder.courierRating.comment} »
                                </p>
                              )}
                              {currentOrder.courierRating.tags && currentOrder.courierRating.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {currentOrder.courierRating.tags.map((tag) => (
                                    <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-medium">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openRateLivreurModal(currentOrder)}
                              className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-sm">star</span>
                              <span>Évaluer la prestation du livreur (Note 1-5★)</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-amber-50/90 border-2 border-amber-300 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-amber-900 tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                          <span>Attribution en cours</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-950 text-[10px] font-black">
                          Diffusion ouverte
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 font-black flex items-center justify-center text-sm shadow-xs border border-amber-200">
                          <span className="material-symbols-outlined text-xl">podcasts</span>
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">Aucun livreur pré-assigné</div>
                          <div className="text-[11px] text-amber-800 font-medium">Disponible pour tous les livreurs de la zone</div>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-600 bg-white/80 p-2.5 rounded-xl border border-amber-200 leading-relaxed">
                        Cette livraison est visible en temps réel par tous les livreurs connectés à proximité de <strong>{currentOrder.dropoffLocation.commune}</strong>. Vous pouvez aussi rechercher activement un coursier spécifique et lui assigner la mission.
                      </p>

                      <div className="pt-1 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => openLivreurSearchModal(currentOrder.id)}
                          className="w-full py-2.5 px-3 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">person_search</span>
                          <span>Rechercher &amp; Assigner un livreur</span>
                        </button>
                      </div>
                    </div>
                  )}

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
          <section className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            {/* Header: Title and Status Filter Buttons */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base sm:text-lg flex items-center gap-2">
                  <span>Toutes vos expéditions</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 text-xs font-bold font-mono">
                    {filteredDeliveries.length} / {merchantDeliveries.length}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Recherchez et filtrez vos livraisons par statut pour faciliter la gestion de vos commandes
                </p>
              </div>

              {/* Status Filter Tabs (Demandés : En attente, En cours, Terminées) */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl text-xs font-semibold overflow-x-auto no-scrollbar border border-slate-200/60 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    activeFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>Toutes</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 font-mono">
                    {countAll}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilter('en_attente')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    activeFilter === 'en_attente'
                      ? 'bg-amber-500 text-white shadow-xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span>En attente</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeFilter === 'en_attente' ? 'bg-amber-600 text-white' : 'bg-slate-200 dark:bg-slate-700'
                  }`}>
                    {countPending}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilter('en_cours')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    activeFilter === 'en_cours'
                      ? 'bg-blue-600 text-white shadow-xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-300 animate-pulse"></span>
                  <span>En cours</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeFilter === 'en_cours' ? 'bg-blue-700 text-white' : 'bg-slate-200 dark:bg-slate-700'
                  }`}>
                    {countOngoing}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilter('terminees')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    activeFilter === 'terminees'
                      ? 'bg-emerald-600 text-white shadow-xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Terminées</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeFilter === 'terminees' ? 'bg-emerald-700 text-white' : 'bg-slate-200 dark:bg-slate-700'
                  }`}>
                    {countCompleted}
                  </span>
                </button>
              </div>
            </div>

            {/* Dedicated Search Bar Input with Quick Clear and Stats */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                  search
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher par N° commande (#LL-...), client, téléphone, commune, livreur..."
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all shadow-2xs"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs transition-colors cursor-pointer"
                    title="Effacer la recherche"
                  >
                    ✕
                  </button>
                )}
              </div>

              {(searchTerm || activeFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setActiveFilter('all');
                  }}
                  className="px-3.5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer border border-slate-200/80 dark:border-slate-700"
                  title="Réinitialiser tous les filtres"
                >
                  <span className="material-symbols-outlined text-sm">restart_alt</span>
                  <span>Réinitialiser</span>
                </button>
              )}
            </div>

            {/* Empty State when no orders match filter or search */}
            {filteredDeliveries.length === 0 && (
              <div className="py-12 px-4 text-center bg-slate-50/80 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl">search_off</span>
                </div>
                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  Aucune commande ne correspond à vos critères
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {searchTerm
                    ? `Aucun résultat pour "${searchTerm}" dans le filtre sélectionné (${
                        activeFilter === 'all'
                          ? 'Toutes'
                          : activeFilter === 'en_attente'
                          ? 'En attente'
                          : activeFilter === 'en_cours'
                          ? 'En cours'
                          : 'Terminées'
                      }).`
                    : `Aucune expédition n'est actuellement dans le statut sélectionné.`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setActiveFilter('all');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">restart_alt</span>
                  <span>Voir toutes les expéditions</span>
                </button>
              </div>
            )}

            {/* Mobile Cards View (Smartphones) */}
            <div className="md:hidden divide-y divide-slate-100 p-3 space-y-3">
              {filteredDeliveries.map((order) => {
                const isSelected = order.id === activeCourseId;
                return (
                  <article
                    key={order.id}
                    onClick={() => handleSelectOrder(order)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                      isSelected
                        ? 'bg-blue-50/90 border-blue-400 shadow-sm ring-1 ring-blue-300'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-blue-700 text-xs px-2 py-0.5 bg-blue-100/70 rounded-md shrink-0">
                          {order.id}
                        </span>
                        {isSelected && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-600 text-white shrink-0">
                            Actif
                          </span>
                        )}
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                        order.status === 'livree' ? 'bg-emerald-100 text-emerald-800' :
                        order.status === 'en_cours' ? 'bg-blue-100 text-blue-800 animate-pulse' :
                        order.status === 'echec' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {order.status === 'livree' ? '🟢 Livrée' :
                         order.status === 'en_cours' ? '🚚 En cours' :
                         order.status === 'echec' ? '🔴 Échec' : '🟡 En attente'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-slate-900 truncate min-w-0 flex-1">{order.clientName}</span>
                        <span className="text-emerald-700 font-black font-mono shrink-0 pl-1">{order.itemValueCOD.toLocaleString('fr-FR')} FCFA</span>
                      </div>
                      
                      <div className="text-[11px] text-slate-600 flex items-start gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <span className="material-symbols-outlined text-xs text-blue-600 shrink-0 mt-0.5">location_on</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 truncate">{order.dropoffLocation.commune}</p>
                          <p className="text-slate-500 text-[10px] truncate">{order.dropoffLocation.address}</p>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-y-1 gap-x-2 pt-1 border-t border-slate-100">
                        <span className="truncate max-w-[180px]">Colis : <strong className="text-slate-800">{order.itemDescription}</strong></span>
                        <span className="font-semibold text-slate-700 shrink-0 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-slate-400">two_wheeler</span>
                          <span>{order.courier?.name || 'Non assigné'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openWhatsAppModal(
                            order.clientPhone,
                            order.clientName,
                            `Bonjour ${order.clientName}, votre commande ${order.id} (${order.itemDescription}) est en cours de traitement par LivraLink.`
                          );
                        }}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                      >
                        <span className="material-symbols-outlined text-sm">chat</span>
                        <span>WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectOrder(order);
                        }}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs active:scale-95 flex items-center gap-1.5 transition-all"
                      >
                        <span className="material-symbols-outlined text-sm">map</span>
                        <span>Voir sur carte</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Orders Table for Tablets and Desktops */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[650px]">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px] tracking-wider bg-slate-50/60">
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
                          <div className="text-slate-800 font-medium">{order.dropoffLocation.commune}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{order.dropoffLocation.address}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-emerald-700 font-black">{order.itemValueCOD.toLocaleString('fr-FR')} FCFA</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{order.itemDescription}</div>
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
                            className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-[10px] font-bold text-slate-700 shadow-2xs transition-all active:scale-95"
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

        {/* Mobile Bottom Navigation */}
        <MobileBottomNav />
      </div>
    </div>
  );
};
