import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { GoogleMapDelivery, LatLng } from '../maps/GoogleMapDelivery';
import {
  getLocationForCommune,
  calculateDistanceKm,
  calculateDeliveryPrice,
  RATE_PER_KM_FCFA,
  BENIN_DEPARTMENTS,
  ALL_BENIN_COMMUNES,
} from '../../config/maps';

export const VendeurNewDelivery: React.FC = () => {
  const {
    couriers,
    selectedCourier,
    setSelectedCourier,
    createDelivery,
    setCurrentView,
    showToast,
    merchantSettings
  } = useApp();

  // Active Wizard Step: 1 = Client, 2 = Colis & Trajet, 3 = Attribution Coursier
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Destinataire (TOUS VIDES par défaut à la demande du vendeur)
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientNote, setClientNote] = useState('');

  // Fonction pour obtenir les coordonnées Google Maps de la boutique du vendeur
  const getBoutiquePosition = (settings: typeof merchantSettings): LatLng => {
    if (settings.storeCoordinates && settings.storeCoordinates.length === 2 && !isNaN(settings.storeCoordinates[0])) {
      return { lat: settings.storeCoordinates[0], lng: settings.storeCoordinates[1] };
    }
    const targetCommune = settings.storeCommune || 'Cotonou - Haie Vive';
    const loc = getLocationForCommune(targetCommune);
    if (loc && !isNaN(loc.lat)) {
      return { lat: loc.lat, lng: loc.lng };
    }
    if (settings.defaultPickupAddress) {
      const locAddr = getLocationForCommune(settings.defaultPickupAddress);
      if (locAddr && !isNaN(locAddr.lat)) return { lat: locAddr.lat, lng: locAddr.lng };
    }
    return { lat: 6.3571, lng: 2.4175 }; // Cotonou - Haie Vive par défaut
  };

  // Mode de collecte : 'store_default' (boutique par défaut) ou 'custom' (saisie libre / ailleurs)
  const [pickupMode, setPickupMode] = useState<'custom' | 'store_default'>('store_default');

  // Coordonnées GPS dynamiques Google Maps (automatiquement initialisées avec la position de la boutique)
  const [originPos, setOriginPos] = useState<LatLng | null>(() => getBoutiquePosition(merchantSettings));
  const [destinationPos, setDestinationPos] = useState<LatLng | null>(null);
  const [mapActiveTarget, setMapActiveTarget] = useState<'origin' | 'destination'>('destination');

  // Step 2: Colis & Trajet (automatiquement pré-rempli avec les coordonnées et l'adresse de la boutique)
  const [pickupStoreName, setPickupStoreName] = useState(merchantSettings.storeName || 'Boutique Glam Chic Cotonou');
  const [pickupAddress, setPickupAddress] = useState(merchantSettings.defaultPickupAddress || 'Haie Vive, Avenue Jean-Paul II, Cotonou, Bénin');
  const [pickupCommune, setPickupCommune] = useState(merchantSettings.storeCommune || 'Cotonou - Haie Vive');
  const [dropoffCommune, setDropoffCommune] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemWeight, setItemWeight] = useState<number | ''>('');
  const [itemFormat, setItemFormat] = useState<'S' | 'M' | 'L' | 'XL'>('M');
  const [isFragile, setIsFragile] = useState<boolean>(false);
  const [codAmount, setCodAmount] = useState<number | ''>('');

  // Charger la boutique par défaut et placer automatiquement le marqueur sur Google Maps
  const handleUseDefaultStore = () => {
    setPickupMode('store_default');
    const storeName = merchantSettings.storeName || 'Boutique Glam Chic Cotonou';
    const defaultCommune = merchantSettings.storeCommune || 'Cotonou - Haie Vive';
    const defaultAddress = merchantSettings.defaultPickupAddress || 'Haie Vive, Avenue Jean-Paul II, Cotonou, Bénin';
    const pos = getBoutiquePosition(merchantSettings);

    setPickupStoreName(storeName);
    setPickupCommune(defaultCommune);
    setPickupAddress(defaultAddress);
    setOriginPos(pos);
    setStep2Errors((prev) => ({ ...prev, pickupName: undefined, pickupAddress: undefined }));
    showToast(`📍 Position par défaut de votre boutique (${storeName}) sélectionnée sur Google Maps.`, 'success');
  };

  // Revenir en saisie libre / collecte ponctuelle ailleurs (champs réinitialisés, carte libre)
  const handleUseCustomPickup = () => {
    setPickupMode('custom');
    setPickupStoreName('');
    setPickupCommune('');
    setPickupAddress('');
    setOriginPos(null);
    showToast('📦 Mode saisie libre activé. Choisissez librement le lieu de collecte.', 'info');
  };

  // Détection GPS en un clic
  const handleDetectCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setOriginPos({ lat, lng });
          showToast(`📍 Position GPS détectée (${lat.toFixed(4)}, ${lng.toFixed(4)}).`, 'success');
        },
        () => {
          showToast('Impossible d\'obtenir votre position GPS. Veuillez sélectionner votre commune.', 'error');
        }
      );
    } else {
      showToast('Géolocalisation non supportée par votre navigateur.', 'error');
    }
  };

  // Synchronisation des coordonnées lorsque la commune de livraison est sélectionnée
  const handleCommuneChange = (newCommune: string) => {
    setDropoffCommune(newCommune);
    if (newCommune) {
      const loc = getLocationForCommune(newCommune);
      setDestinationPos({ lat: loc.lat, lng: loc.lng });
    } else {
      setDestinationPos(null);
    }
  };

  const handlePickupCommuneChange = (newCommune: string) => {
    setPickupCommune(newCommune);
    // L'adresse de collecte (pickupAddress) n'est JAMAIS écrasée automatiquement !
    if (newCommune) {
      const loc = getLocationForCommune(newCommune);
      setOriginPos({ lat: loc.lat, lng: loc.lng });
    } else {
      setOriginPos(null);
    }
  };

  // Calcul dynamique de la distance et du tarif (100 FCFA par kilomètre)
  const distanceKm = useMemo(() => {
    if (originPos && destinationPos) {
      return calculateDistanceKm(originPos, destinationPos);
    }
    return 0;
  }, [originPos, destinationPos]);

  const deliveryFee = useMemo(() => {
    if (originPos && destinationPos) {
      return calculateDeliveryPrice(distanceKm);
    }
    return 100; // Tarif de base minimum en attente (100 FCFA)
  }, [originPos, destinationPos, distanceKm]);

  const numericCod = typeof codAmount === 'number' ? codAmount : 0;
  const totalClient = numericCod + deliveryFee;

  // Step 3: Attribution Coursier & Diffusion
  const [dispatchMode, setDispatchMode] = useState<'broadcast' | 'direct'>('broadcast');
  const [selectedDriverId, setSelectedDriverId] = useState(selectedCourier.id || couriers[0]?.id || 'c-david');
  const [filterType, setFilterType] = useState<'all' | 'nearest' | 'top'>('all');

  // Validation errors
  const [step1Errors, setStep1Errors] = useState<{ name?: string; phone?: string }>({});
  const [step2Errors, setStep2Errors] = useState<{
    address?: string;
    desc?: string;
    pickupName?: string;
    pickupAddress?: string;
    dropoffCommune?: string;
  }>({});

  const currentSelectedDriver = couriers.find((c) => c.id === selectedDriverId) || couriers[0];

  // Couriers filtering
  const displayedDrivers = couriers.filter((c) => {
    if (filterType === 'nearest') return c.distanceKm <= 2.0;
    if (filterType === 'top') return c.rating >= 4.9;
    return true;
  });

  const handleSelectCourier = (courierId: string) => {
    setSelectedDriverId(courierId);
    setDispatchMode('direct');
    const driver = couriers.find((c) => c.id === courierId);
    if (driver) {
      setSelectedCourier(driver);
      showToast(`Coursier ${driver.name} sélectionné pour attribution directe.`, 'info');
    }
  };

  const validateStep1 = (): boolean => {
    const errors: { name?: string; phone?: string } = {};
    if (!clientName.trim()) {
      errors.name = 'Veuillez saisir le nom du destinataire.';
    }
    if (!clientPhone.trim()) {
      errors.phone = 'Veuillez saisir le numéro de téléphone ou WhatsApp.';
    } else if (clientPhone.trim().length < 8) {
      errors.phone = 'Le numéro de téléphone semble trop court.';
    }

    setStep1Errors(errors);
    if (Object.keys(errors).length > 0) {
      showToast('Veuillez renseigner les champs obligatoires du destinataire.', 'error');
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    const errors: {
      address?: string;
      desc?: string;
      pickupName?: string;
      pickupAddress?: string;
      dropoffCommune?: string;
    } = {};

    if (!pickupStoreName.trim()) {
      errors.pickupName = 'Veuillez saisir le nom de votre boutique.';
    }
    if (!pickupAddress.trim()) {
      errors.pickupAddress = 'Veuillez indiquer l\'adresse ou le quartier de collecte.';
    }
    if (!dropoffCommune.trim()) {
      errors.dropoffCommune = 'Veuillez sélectionner la commune de destination.';
    }
    if (!dropoffAddress.trim()) {
      errors.address = 'Veuillez préciser l\'adresse ou les repères de livraison.';
    }
    if (!itemDescription.trim()) {
      errors.desc = 'Veuillez décrire brièvement le contenu du colis.';
    }

    setStep2Errors(errors);
    if (Object.keys(errors).length > 0) {
      showToast('Veuillez renseigner tous les champs obligatoires du trajet et du colis.', 'error');
      return false;
    }
    return true;
  };

  const goToStep2 = () => {
    if (validateStep1()) {
      if (pickupMode === 'store_default') {
        const storeName = merchantSettings.storeName || 'Boutique Glam Chic Cotonou';
        const defaultCommune = merchantSettings.storeCommune || 'Cotonou - Haie Vive';
        const defaultAddress = merchantSettings.defaultPickupAddress || 'Haie Vive, Avenue Jean-Paul II, Cotonou, Bénin';
        const pos = getBoutiquePosition(merchantSettings);

        setPickupStoreName(storeName);
        setPickupCommune(defaultCommune);
        setPickupAddress(defaultAddress);
        setOriginPos(pos);
      }
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToStep3 = () => {
    if (validateStep2()) {
      setCurrentStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleConfirmAssignment = (forceBroadcast = true) => {
    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }
    if (!validateStep2()) {
      setCurrentStep(2);
      return;
    }

    // Par défaut : diffusion ouverte à tous les livreurs (aucune assignation automatique)
    const isDirect = dispatchMode === 'direct' && !forceBroadcast;
    const assignedDriver = isDirect ? currentSelectedDriver : undefined;

    const effectiveOrigin = originPos || (pickupCommune ? getLocationForCommune(pickupCommune) : (pickupAddress.trim() ? getLocationForCommune(pickupAddress) : getLocationForCommune('Cotonou - Haie Vive')));
    const effectiveDestination = destinationPos || (dropoffCommune ? getLocationForCommune(dropoffCommune) : (dropoffAddress.trim() ? getLocationForCommune(dropoffAddress) : getLocationForCommune('Cotonou - Cadjehoun')));

    const newOrder = createDelivery({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      clientNote: clientNote.trim(),
      channel: 'WhatsApp',
      pickupLocation: {
        name: pickupStoreName.trim() || 'Boutique Vendeur',
        address: pickupAddress.trim() || (pickupCommune || 'Haie Vive, Cotonou'),
        commune: pickupCommune || 'Cotonou - Haie Vive',
        coordinates: [effectiveOrigin.lat, effectiveOrigin.lng]
      },
      dropoffLocation: {
        name: clientName.trim() || 'Destinataire',
        address: dropoffAddress.trim() || dropoffCommune,
        commune: dropoffCommune,
        coordinates: [effectiveDestination.lat, effectiveDestination.lng]
      },
      itemDescription: itemDescription.trim() || 'Colis Marchandise',
      itemWeightKg: typeof itemWeight === 'number' ? itemWeight : undefined,
      itemFormat,
      isFragile,
      itemValueCOD: numericCod,
      deliveryFee,
      courier: assignedDriver, // undefined en diffusion ouverte
      status: assignedDriver ? 'assignee' : 'en_attente',
      statusNote: assignedDriver
        ? `Assignée au livreur (${assignedDriver.name})`
        : `Course publiée • En attente d'acceptation par les livreurs de la zone (${dropoffCommune || 'Bénin'})`
    });

    if (!assignedDriver) {
      showToast(`🚀 Course ${newOrder.id} publiée avec succès ! Elle est désormais disponible pour tous les livreurs de la zone (${dropoffCommune}).`, 'success');
    } else {
      showToast(`Course ${newOrder.id} assignée au livreur ${assignedDriver.name}.`, 'success');
    }

    // Redirect to tracking page
    setCurrentView('vendeur_tracking');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff] relative">
        {/* Desktop Header */}
        <div className="hidden md:block">
          <Header
            showReturn
            breadcrumbs={[
              { label: 'Tableau de bord Vendeur', view: 'vendeur_dashboard' },
              { label: 'Expéditions', view: 'vendeur_tracking' },
              { label: 'Nouvelle livraison' }
            ]}
          />
        </div>

        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md shadow-xs border-b border-slate-200">
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setCurrentView('vendeur_dashboard')}
                aria-label="Retour au tableau de bord"
                className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 active:scale-95 transition-transform shadow-xs"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-blue-700 text-sm tracking-tight">LivraLink</span>
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-bold">
                    Nouvelle Course
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Étape {currentStep} sur 3
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setClientName('');
                  setClientPhone('');
                  setClientNote('');
                  setDropoffAddress('');
                  setItemDescription('');
                  setCodAmount('');
                  showToast('Formulaire réinitialisé à vide.', 'info');
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold flex items-center gap-1"
                title="Vider tous les champs"
              >
                <span className="material-symbols-outlined text-sm">restart_alt</span>
                <span className="hidden sm:inline">Effacer</span>
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Container */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* Top Title & Step Indicator Banner */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-blue-600 mb-1 uppercase tracking-wide">
                <span className="material-symbols-outlined text-base">add_circle</span>
                <span>Création de course Vendeur</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {currentStep === 1 && '1. Coordonnées du Destinataire'}
                {currentStep === 2 && '2. Détails du Colis & Adresse de Livraison'}
                {currentStep === 3 && '3. Publication & Diffusion aux Livreurs'}
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {currentStep === 1 && 'Renseignez le nom, téléphone WhatsApp et consignes pour votre client.'}
                {currentStep === 2 && 'Indiquez la commune de destination, la description du colis et le montant COD.'}
                {currentStep === 3 && 'Publiez la course : elle sera disponible pour tous les livreurs de la zone pour acceptation immédiate.'}
              </p>
            </div>

            {/* Interactive Step Navigation Pills */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200 text-xs font-bold self-start md:self-auto overflow-x-auto">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentStep === 1
                    ? 'bg-blue-600 text-white shadow-xs'
                    : clientName && clientPhone
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>1. Client</span>
                {clientName && clientPhone && currentStep !== 1 && (
                  <span className="material-symbols-outlined text-xs">check</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (validateStep1()) setCurrentStep(2);
                }}
                className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentStep === 2
                    ? 'bg-blue-600 text-white shadow-xs'
                    : dropoffAddress && itemDescription
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>2. Colis</span>
                {dropoffAddress && itemDescription && currentStep !== 2 && (
                  <span className="material-symbols-outlined text-xs">check</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (validateStep1() && validateStep2()) setCurrentStep(3);
                }}
                className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentStep === 3
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>3. Diffusion</span>
              </button>
            </div>
          </div>

          {/* =========================================================================
              ÉTAPE 1 : DESTINATAIRE (CLIENT)
             ========================================================================= */}
          {currentStep === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-blue-50 text-blue-600 material-symbols-outlined text-lg">person</span>
                    <span>Informations du Destinataire</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Ces coordonnées permettront au livreur de contacter votre client et de confirmer la livraison par code OTP.
                  </p>
                </div>

                <div className="space-y-5">
                  {/* Nom du client */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nom complet du client <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <span className="material-symbols-outlined text-lg">person</span>
                      </span>
                      <input
                        type="text"
                        value={clientName}
                        onChange={(e) => {
                          setClientName(e.target.value);
                          if (step1Errors.name) setStep1Errors({ ...step1Errors, name: undefined });
                        }}
                        placeholder="Ex: Reine Dossou, M. Bio, Mme Mensah, Jean Agossa..."
                        className={`w-full pl-10 pr-4 py-3 rounded-2xl border text-sm transition-all outline-none ${
                          step1Errors.name
                            ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                            : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                        }`}
                        autoFocus
                      />
                    </div>
                    {step1Errors.name && (
                      <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        {step1Errors.name}
                      </p>
                    )}
                  </div>

                  {/* Numéro Téléphone / WhatsApp */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        Numéro Téléphone &amp; WhatsApp <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">chat</span>
                        WhatsApp Bénin (+229)
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <span className="material-symbols-outlined text-lg">call</span>
                      </span>
                      <input
                        type="tel"
                        value={clientPhone}
                        onChange={(e) => {
                          setClientPhone(e.target.value);
                          if (step1Errors.phone) setStep1Errors({ ...step1Errors, phone: undefined });
                        }}
                        placeholder="Ex: +229 97 12 34 56 ou 61 00 11 22"
                        className={`w-full pl-10 pr-4 py-3 rounded-2xl border text-sm transition-all outline-none ${
                          step1Errors.phone
                            ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                            : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                        }`}
                      />
                    </div>
                    {step1Errors.phone && (
                      <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        {step1Errors.phone}
                      </p>
                    )}
                  </div>

                  {/* Note / Consignes de livraison */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Consignes particulières pour le coursier (Optionnel)
                    </label>
                    <div className="relative">
                      <span className="absolute top-3 left-3.5 pointer-events-none text-slate-400">
                        <span className="material-symbols-outlined text-lg">edit_note</span>
                      </span>
                      <textarea
                        rows={3}
                        value={clientNote}
                        onChange={(e) => setClientNote(e.target.value)}
                        placeholder="Ex: Appeler avant le départ pour confirmation, sonner à la porte métallique noire, 2ème étage..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-sm transition-all outline-none resize-none"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Cette consigne apparaîtra sur l'application du livreur lors de la prise en charge.
                    </p>
                  </div>
                </div>

                {/* Step 1 Actions */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentView('vendeur_dashboard')}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all"
                  >
                    Annuler
                  </button>

                  <button
                    type="button"
                    onClick={goToStep2}
                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>Continuer vers Colis &amp; Trajet</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>

              {/* Side Assistance Box */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <span className="material-symbols-outlined text-emerald-600 text-lg">verified</span>
                    <span>Validation Anti-Litige</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Sur LivraLink, chaque commande dispose d'une traçabilité complète. Le client recevra automatiquement un lien de suivi en direct et un code OTP de confirmation dès que le coursier sera en route.
                  </p>
                  <div className="p-3 rounded-2xl bg-blue-50 border border-blue-100 text-[11px] text-blue-900 flex items-start gap-2">
                    <span className="material-symbols-outlined text-blue-600 text-base shrink-0 mt-0.5">info</span>
                    <span>Les champs ont été initialisés 100% vides afin que vous puissiez saisir les données réelles de votre commande.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              ÉTAPE 2 : COLIS & TRAJET
             ========================================================================= */}
          {currentStep === 2 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-blue-50 text-blue-600 material-symbols-outlined text-lg">package_2</span>
                    <span>Détails du Colis &amp; Trajet de Livraison</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Précisez le lieu de départ (votre boutique), la commune d'arrivée et les caractéristiques du colis.
                  </p>
                </div>

                <div className="space-y-5">
                  {/* Choix du lieu de collecte : Boutique par défaut OU Collecte ponctuelle ailleurs */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                      <button
                        type="button"
                        onClick={handleUseDefaultStore}
                        className={`flex-1 min-w-[220px] py-2.5 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          pickupMode === 'store_default'
                            ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-600/30'
                            : 'text-slate-600 hover:text-slate-900 bg-transparent'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">store</span>
                        <span>Utiliser la position par défaut de ma boutique</span>
                        {pickupMode === 'store_default' && (
                          <span className="material-symbols-outlined text-sm text-emerald-300">check_circle</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleUseCustomPickup}
                        className={`flex-1 min-w-[220px] py-2.5 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          pickupMode === 'custom'
                            ? 'bg-white text-blue-700 shadow-md border border-slate-200 ring-2 ring-blue-500/20'
                            : 'text-slate-600 hover:text-slate-900 bg-transparent'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">pin_drop</span>
                        <span>Autre lieu de collecte ponctuel (Ailleurs / Saisie libre)</span>
                        {pickupMode === 'custom' && (
                          <span className="material-symbols-outlined text-sm text-blue-600">check_circle</span>
                        )}
                      </button>
                    </div>

                    {pickupMode === 'store_default' ? (
                      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-xs text-blue-900 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <span className="material-symbols-outlined text-lg">store</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900">
                                {pickupStoreName || 'Boutique Vendeur'}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-extrabold flex items-center gap-1 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Détecté sur Google Maps {originPos ? `(${originPos.lat.toFixed(4)}, ${originPos.lng.toFixed(4)})` : ''}
                              </span>
                            </div>
                            <p className="text-slate-600 text-[11px] mt-0.5">
                              Commune : <strong>{pickupCommune || 'Bénin'}</strong> • Adresse : {pickupAddress || 'Enregistrée'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleUseCustomPickup}
                          className="text-[11px] font-bold text-blue-700 hover:underline shrink-0 bg-white px-2.5 py-1.5 rounded-xl border border-blue-200 shadow-2xs hover:bg-blue-50 transition-colors"
                        >
                          Changer pour ailleurs
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-base text-slate-500">edit_location_alt</span>
                          <span>
                            <strong>Saisie libre :</strong> Remplissez librement l'adresse et la commune où le livreur doit récupérer le colis.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleUseDefaultStore}
                          className="text-[11px] font-bold text-blue-600 hover:underline shrink-0 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs hover:bg-slate-50 transition-colors"
                        >
                          Charger ma boutique
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Point de ramassage (Origine) */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-blue-600 text-base">store</span>
                        <span>Coordonnées du Point de Collecte (Origine)</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleDetectCurrentLocation}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg border border-blue-200 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Remplir avec votre position GPS réelle"
                      >
                        <span className="material-symbols-outlined text-xs">my_location</span>
                        <span>Détecter GPS</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Nom de la boutique ou lieu <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={pickupStoreName}
                          onChange={(e) => {
                            setPickupStoreName(e.target.value);
                            if (step2Errors.pickupName) setStep2Errors({ ...step2Errors, pickupName: undefined });
                          }}
                          placeholder="Ex: Ma Boutique, Dépôt Sarah..."
                          className={`w-full text-xs p-2.5 rounded-xl border outline-none bg-white ${
                            step2Errors.pickupName
                              ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                              : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                          }`}
                        />
                        {step2Errors.pickupName && (
                          <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {step2Errors.pickupName}
                          </p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-semibold text-slate-700">
                            Commune de collecte (Bénin)
                          </label>
                          <span className="text-[10px] text-blue-600 font-medium">77 communes</span>
                        </div>
                        <select
                          value={pickupCommune}
                          onChange={(e) => handlePickupCommuneChange(e.target.value)}
                          className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:border-blue-600 outline-none bg-white font-medium"
                        >
                          <option value="">-- Choisir la commune de collecte (Bénin) --</option>
                          {BENIN_DEPARTMENTS.map((dept) => (
                            <optgroup key={dept.code} label={`📍 ${dept.name}`}>
                              {dept.communes.map((commune) => (
                                <option key={commune} value={commune}>
                                  {commune}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Adresse / Quartier de collecte <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={pickupAddress}
                          onChange={(e) => {
                            setPickupAddress(e.target.value);
                            if (step2Errors.pickupAddress) setStep2Errors({ ...step2Errors, pickupAddress: undefined });
                          }}
                          placeholder="Adresse ou quartier de collecte"
                          className={`w-full text-xs p-2.5 rounded-xl border outline-none bg-white ${
                            step2Errors.pickupAddress
                              ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                              : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                          }`}
                        />
                        {step2Errors.pickupAddress && (
                          <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {step2Errors.pickupAddress}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Destination */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-bold text-slate-700">
                            Commune de livraison <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                            77 communes (12 dép.)
                          </span>
                        </div>
                        <select
                          value={dropoffCommune}
                          onChange={(e) => {
                            handleCommuneChange(e.target.value);
                            if (step2Errors.dropoffCommune) setStep2Errors({ ...step2Errors, dropoffCommune: undefined });
                          }}
                          className={`w-full text-xs p-2.5 rounded-xl border outline-none bg-white font-medium ${
                            step2Errors.dropoffCommune
                              ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                              : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                          }`}
                        >
                          <option value="">-- Sélectionner la commune de livraison (77 communes) --</option>
                          {BENIN_DEPARTMENTS.map((dept) => (
                            <optgroup key={dept.code} label={`📍 ${dept.name}`}>
                              {dept.communes.map((commune) => (
                                <option key={commune} value={commune}>
                                  {commune}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        {step2Errors.dropoffCommune && (
                          <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {step2Errors.dropoffCommune}
                          </p>
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Adresse exacte / Repères de livraison <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={dropoffAddress}
                          onChange={(e) => {
                            setDropoffAddress(e.target.value);
                            if (step2Errors.address) setStep2Errors({ ...step2Errors, address: undefined });
                          }}
                          placeholder="Ex: Rue L14, en face de la pharmacie, Résidence Les Jardins..."
                          className={`w-full text-xs p-2.5 rounded-xl border outline-none ${
                            step2Errors.address
                              ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                              : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                          }`}
                        />
                        {step2Errors.address && (
                          <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {step2Errors.address}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Intégration Google Maps Interactive & Calculateur de Distance (100 FCFA/km) */}
                    <div className="pt-2 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm text-blue-600">navigation</span>
                          <span>Itinéraire &amp; Distance Google Maps</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setOriginPos(null);
                              setDestinationPos(null);
                              showToast('Positions réinitialisées sur la carte.', 'info');
                            }}
                            className="text-[10px] font-bold text-slate-500 hover:text-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 bg-white"
                          >
                            Effacer les pins
                          </button>
                          <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                            Tarification : {RATE_PER_KM_FCFA} FCFA / km
                          </span>
                        </div>
                      </div>

                      <GoogleMapDelivery
                        origin={originPos}
                        destination={destinationPos}
                        originLabel={pickupStoreName || 'Point Collecte (Boutique)'}
                        destinationLabel={`${clientName || 'Client'} (${dropoffCommune || 'Livraison'})`}
                        interactive={true}
                        onOriginChange={(pos) => {
                          setOriginPos(pos);
                          showToast(`Point de collecte fixé (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`, 'info');
                        }}
                        onDestinationChange={(pos) => {
                          setDestinationPos(pos);
                          showToast(`Point de livraison fixé (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`, 'info');
                        }}
                        activeTarget={mapActiveTarget}
                        onActiveTargetChange={setMapActiveTarget}
                        heightClass="h-[270px]"
                      />

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-2xl bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-500 font-semibold block">Distance calculée</span>
                          <span className="text-sm font-black text-blue-900">
                            {originPos && destinationPos ? `${distanceKm} km` : 'En attente des 2 points'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-semibold block">Frais livraison (100 F/km)</span>
                          <span className="text-sm font-black text-emerald-700">
                            {originPos && destinationPos ? `${deliveryFee.toLocaleString('fr-FR')} FCFA` : 'Calcul automatique'}
                          </span>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <span className="text-[10px] text-slate-500 font-semibold block">Durée estimée</span>
                          <span className="text-sm font-bold text-slate-800">
                            {originPos && destinationPos ? `~${Math.round(distanceKm * 3.5 + 4)} min` : '--'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Description du colis */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Description du contenu du colis <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={itemDescription}
                      onChange={(e) => {
                        setItemDescription(e.target.value);
                        if (step2Errors.desc) setStep2Errors({ ...step2Errors, desc: undefined });
                      }}
                      placeholder="Ex: Robe de soirée, sac à main, coffret cosmétique, paire de baskets..."
                      className={`w-full text-xs p-3 rounded-2xl border outline-none ${
                        step2Errors.desc
                          ? 'border-red-400 bg-red-50/30 focus:ring-2 focus:ring-red-400'
                          : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                      }`}
                    />
                    {step2Errors.desc && (
                      <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">error</span>
                        {step2Errors.desc}
                      </p>
                    )}
                  </div>

                  {/* Format & Poids & Fragile */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Format colis</label>
                      <div className="grid grid-cols-4 gap-1">
                        {(['S', 'M', 'L', 'XL'] as const).map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => setItemFormat(fmt)}
                            className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                              itemFormat === fmt
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {fmt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Poids approx. (kg)</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={itemWeight}
                        onChange={(e) => setItemWeight(parseFloat(e.target.value) || 1)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:border-blue-600 outline-none"
                      />
                    </div>

                    <div className="flex flex-col justify-end">
                      <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={isFragile}
                          onChange={(e) => setIsFragile(e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300"
                        />
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                          <span>Fragile ⚠️</span>
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Montant COD (Paiement à la livraison) */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-black text-slate-900 block">
                          Montant Marchandise à Encaisser (COD)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Saisir 0 si le client a déjà réglé sa commande
                        </span>
                      </div>
                      <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        FCFA
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="500"
                        value={codAmount === '' ? '' : codAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCodAmount(val === '' ? '' : Math.max(0, parseInt(val, 10) || 0));
                        }}
                        placeholder="0 (si prépayé) ou ex: 15000"
                        className="w-full text-base font-extrabold text-slate-900 p-3 rounded-xl border border-blue-300 focus:border-blue-600 outline-none bg-white"
                      />
                    </div>

                    {/* Synthèse Tarification */}
                    <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between text-xs">
                      <div className="text-slate-600">
                        <span>Frais de livraison : <strong>{deliveryFee.toLocaleString('fr-FR')} FCFA</strong></span>
                      </div>
                      <div className="text-blue-900 font-extrabold text-sm">
                        Total à percevoir client : <strong>{totalClient.toLocaleString('fr-FR')} FCFA</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2 Actions */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Retour : Client</span>
                  </button>

                  <button
                    type="button"
                    onClick={goToStep3}
                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>Continuer vers Publication &amp; Diffusion</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>

              {/* Step 2 Client Summary Sidebar */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-blue-600">person</span>
                      <span>Destinataire saisi</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="text-[11px] font-bold text-blue-600 hover:underline"
                    >
                      Modifier
                    </button>
                  </div>

                  <div className="text-xs space-y-1.5">
                    <p className="font-bold text-slate-900">{clientName || 'Non renseigné'}</p>
                    <p className="text-slate-600 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-emerald-600">call</span>
                      {clientPhone || 'Aucun numéro'}
                    </p>
                    {clientNote && (
                      <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-xl border border-slate-100">
                        « {clientNote} »
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              ÉTAPE 3 : ATTRIBUTION LIVREUR & CONFIRMATION
             ========================================================================= */}
          {currentStep === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Recap of Order */}
              <div className="lg:col-span-5 space-y-5">
                {/* Order Summary Card */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-600">receipt_long</span>
                      <span>Récapitulatif de la livraison</span>
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                      Prêt à assigner
                    </span>
                  </div>

                  {/* Client info */}
                  <div className="flex items-start justify-between text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Destinataire</span>
                      <p className="font-bold text-slate-900">{clientName || 'Client'}</p>
                      <p className="text-slate-600">{clientPhone}</p>
                      {clientNote && <p className="text-[11px] text-amber-700 italic mt-0.5">« {clientNote} »</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="text-slate-400 hover:text-blue-600 p-1"
                      title="Modifier le client"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                    </button>
                  </div>

                  {/* Route info */}
                  <div className="text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 text-slate-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0"></span>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Ramassage :</span>
                          <strong className="text-slate-900">{pickupStoreName}</strong> ({pickupAddress})
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCurrentStep(2)}
                        className="text-slate-400 hover:text-blue-600 p-1"
                        title="Modifier l'adresse"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-slate-700 pt-1 border-t border-slate-100">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0"></span>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Livraison ({dropoffCommune}) :</span>
                        <strong className="text-slate-900">{dropoffAddress}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Parcel info & COD */}
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Contenu : <strong>{itemDescription || 'Marchandise'}</strong></span>
                      <span className="text-slate-500">{itemFormat} • {itemWeight} kg {isFragile && '• ⚠️ Fragile'}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs">
                      <span>Montant COD :</span>
                      <strong className="text-slate-900">{numericCod.toLocaleString('fr-FR')} FCFA</strong>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span>Frais livraison standard :</span>
                      <strong className="text-slate-900">{deliveryFee.toLocaleString('fr-FR')} FCFA</strong>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-black text-blue-700">
                      <span>Total à percevoir client :</span>
                      <span>{totalClient.toLocaleString('fr-FR')} FCFA</span>
                    </div>
                  </div>
                </div>

                {/* Dispatch Mode Card */}
                <div className="p-5 rounded-3xl bg-slate-900 text-white space-y-4 shadow-md border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base">podcasts</span>
                      <span>Mode de Validation &amp; Dispatching</span>
                    </span>
                    <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full font-bold">
                      {dispatchMode === 'broadcast' ? 'Diffusion Ouverte' : 'Direct'}
                    </span>
                  </div>

                  {/* Mode switcher tabs */}
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800/80 rounded-2xl text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setDispatchMode('broadcast')}
                      className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                        dispatchMode === 'broadcast'
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">campaign</span>
                      <span>Tous les livreurs</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDispatchMode('direct')}
                      className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                        dispatchMode === 'direct'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">person</span>
                      <span>Attribution directe</span>
                    </button>
                  </div>

                  {dispatchMode === 'broadcast' ? (
                    <div className="space-y-3">
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        ✅ <strong>Aucune assignation automatique forcée :</strong> La livraison sera disponible instantanément pour l'ensemble des livreurs connectés dans la zone (<strong>{dropoffCommune || 'Bénin'}</strong>). Le premier livreur libre prendra en charge la course.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleConfirmAssignment(true)}
                        className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                      >
                        <span className="material-symbols-outlined text-base font-bold">podcasts</span>
                        <span>Diffuser la course à tous les livreurs</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Attribution ciblée : la course sera directement assignée au coursier <strong>{currentSelectedDriver.name}</strong> sélectionné dans la liste ci-contre.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleConfirmAssignment(false)}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                      >
                        <span className="material-symbols-outlined text-base">person_check</span>
                        <span>Assigner à {currentSelectedDriver.name}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Live GPS Map + Couriers Fleet in Zone */}
              <div className="lg:col-span-7 space-y-5">
                {/* Vector Map Preview */}
                <div className="relative w-full h-[240px] sm:h-[300px] rounded-3xl overflow-hidden border border-slate-200 bg-[#edf1fa] shadow-sm select-none">
                  <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 600 380">
                    <defs>
                      <pattern id="mapGridNew" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f2" strokeWidth="1" />
                      </pattern>
                    </defs>

                    <rect width="600" height="380" fill="#eef2f8" />
                    <rect width="600" height="380" fill="url(#mapGridNew)" />

                    {/* Laguna Ebrié / Cotonou Nokoue */}
                    <path d="M 0 320 Q 180 300 310 330 T 600 350 L 600 380 L 0 380 Z" fill="#d7e5fa" />

                    {/* Main roads */}
                    <path d="M -10 120 C 140 130 260 90 380 95 C 460 98 520 130 610 120" stroke="#cbd5e6" strokeWidth="16" fill="none" />
                    <path d="M -10 120 C 140 130 260 90 380 95 C 460 98 520 130 610 120" stroke="#ffffff" strokeWidth="12" fill="none" />

                    <path d="M 140 0 L 150 280 L 170 380" stroke="#cbd5e6" strokeWidth="14" fill="none" />
                    <path d="M 140 0 L 150 280 L 170 380" stroke="#ffffff" strokeWidth="10" fill="none" />

                    <path d="M 380 0 L 375 220 L 410 380" stroke="#cbd5e6" strokeWidth="16" fill="none" />
                    <path d="M 380 0 L 375 220 L 410 380" stroke="#ffffff" strokeWidth="12" fill="none" />

                    {/* Route line */}
                    <path
                      d="M 150 120 L 280 140 L 420 220"
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="4"
                      strokeDasharray="6 6"
                      className="animate-[pulse_1.5s_infinite]"
                    />

                    {/* Pins */}
                    <circle cx="150" cy="120" r="8" fill="#2563eb" />
                    <circle cx="150" cy="120" r="3" fill="#ffffff" />

                    <circle cx="420" cy="220" r="8" fill="#10b981" />
                    <circle cx="420" cy="220" r="3" fill="#ffffff" />

                    <circle cx="280" cy="140" r="6" fill="#f59e0b" />
                  </svg>

                  {/* Overlays on Map */}
                  <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-xs border border-slate-200 text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>Zone {dropoffCommune || 'Bénin'} : {couriers.length} livreurs connectés</span>
                  </div>

                  {/* Departure marker */}
                  <div className="absolute top-16 left-6 z-10">
                    <div className="bg-blue-600 text-white rounded-xl px-2.5 py-1 shadow-md text-[10px] font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">store</span>
                      <span>Départ : {pickupStoreName || 'Boutique'}</span>
                    </div>
                  </div>

                  {/* Destination marker */}
                  <div className="absolute bottom-10 right-6 z-10">
                    <div className="bg-emerald-600 text-white rounded-xl px-2.5 py-1 shadow-md text-[10px] font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">home_pin</span>
                      <span>Client : {clientName || 'Destinataire'} ({dropoffCommune})</span>
                    </div>
                  </div>
                </div>

                {/* Available Couriers Fleet List */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span>Livreurs connectés dans la zone</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {displayedDrivers.length} prêts à accepter
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        {dispatchMode === 'broadcast'
                          ? 'Tous ces coursiers recevront la notification en temps réel dès votre validation.'
                          : 'Cliquez sur un livreur pour lui attribuer directement cette course.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setFilterType('all')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                          filterType === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Tous
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterType('nearest')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                          filterType === 'nearest' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Plus proche
                      </button>
                    </div>
                  </div>

                  {dispatchMode === 'broadcast' && (
                    <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-lg text-amber-600 shrink-0">info</span>
                      <p className="leading-snug">
                        <strong>Mode Diffusion Active :</strong> La livraison ne sera pas bloquée sur un seul livreur. Le premier coursier disponible qui accepte la mission sur son écran la prendra en charge.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {displayedDrivers.map((courier) => {
                      const isSelected = courier.id === selectedDriverId && dispatchMode === 'direct';
                      return (
                        <div
                          key={courier.id}
                          onClick={() => handleSelectCourier(courier.id)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'border-2 border-blue-600 bg-blue-50/50 shadow-sm ring-2 ring-blue-600/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-extrabold flex items-center justify-center text-sm">
                                {courier.avatarInitials}
                              </div>
                              <div>
                                <h4 className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                                  <span>{courier.name}</span>
                                  <span className="text-[10px] font-semibold text-slate-500">({courier.vehicle})</span>
                                </h4>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                  <span className="text-amber-600 font-bold flex items-center">
                                    ★ {courier.rating}
                                  </span>
                                  <span>•</span>
                                  <span>{courier.totalDeliveries} courses</span>
                                  <span>•</span>
                                  <span className="text-emerald-700 font-bold">~{courier.etaMinutes} min ({courier.distanceKm} km)</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="font-extrabold text-blue-700 text-xs sm:text-sm">
                                {deliveryFee.toLocaleString('fr-FR')} F
                              </span>
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                  isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'
                                }`}
                              >
                                {isSelected && <span className="material-symbols-outlined text-xs font-bold">check</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Final Step Actions */}
                <div className="pt-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Retour : Colis</span>
                  </button>

                  {dispatchMode === 'broadcast' ? (
                    <button
                      type="button"
                      onClick={() => handleConfirmAssignment(true)}
                      className="flex-1 py-3.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-blue-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-lg">podcasts</span>
                      <span>Diffuser &amp; Rendre disponible à tous les livreurs</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleConfirmAssignment(false)}
                      className="flex-1 py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-blue-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-lg">person_check</span>
                      <span>Attribuer et Créer la course ({currentSelectedDriver.name})</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
