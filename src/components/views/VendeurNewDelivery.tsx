import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';

export const VendeurNewDelivery: React.FC = () => {
  const { couriers, selectedCourier, setSelectedCourier, createDelivery, setCurrentView, showToast } = useApp();

  // Wizard state
  const [selectedDriverId, setSelectedDriverId] = useState(selectedCourier.id || 'c-david');
  const [filterType, setFilterType] = useState<'all' | 'nearest' | 'top'>('all');
  const [isSummaryAccordionOpen, setIsSummaryAccordionOpen] = useState(true);

  // Step 1: Client data
  const [clientName, setClientName] = useState('Sarah Kouamé');
  const [clientPhone, setClientPhone] = useState('+225 07 48 92 11 04');
  const [clientNote, setClientNote] = useState('« Appeler avant départ pour confirmation présence »');
  const [isEditingStep1, setIsEditingStep1] = useState(false);

  // Step 2: Parcel data
  const [pickupAddress, setPickupAddress] = useState('Cocody Angré 8ème tranche, Boulevard Latrille');
  const [dropoffAddress, setDropoffAddress] = useState('Cocody Danga, Résidence Les Jardins, Bât B, Apt 14 (Code: 2489)');
  const [itemDescription, setItemDescription] = useState('Sac à main cuir & coffret cosmétique');
  const [itemWeight, setItemWeight] = useState(1.2);
  const [isFragile, setIsFragile] = useState(true);
  const [codAmount, setCodAmount] = useState(25000);
  const [isEditingStep2, setIsEditingStep2] = useState(false);

  // Fixed Delivery Fee calculated by LivraLink system (Rule 9 & 10)
  const deliveryFee = 2500;
  const totalClient = codAmount + deliveryFee;

  const currentSelectedDriver = couriers.find((c) => c.id === selectedDriverId) || couriers[0];

  // Filtering
  const displayedDrivers = couriers.filter((c) => {
    if (filterType === 'nearest') return c.distanceKm <= 2.0;
    if (filterType === 'top') return c.rating >= 4.9;
    return true;
  });

  const handleSelectCourier = (courierId: string) => {
    setSelectedDriverId(courierId);
    const driver = couriers.find((c) => c.id === courierId);
    if (driver) {
      setSelectedCourier(driver);
      showToast(`Coursier ${driver.name} sélectionné pour l'attribution.`, 'info');
    }
  };

  const handleConfirmAssignment = () => {
    createDelivery({
      clientName,
      clientPhone,
      clientNote,
      pickupLocation: {
        name: 'Boutique Glam Chic',
        address: pickupAddress,
        commune: 'Cocody Angré'
      },
      dropoffLocation: {
        name: clientName,
        address: dropoffAddress,
        commune: 'Cocody Danga'
      },
      itemDescription,
      itemWeightKg: itemWeight,
      isFragile,
      itemValueCOD: codAmount,
      deliveryFee,
      courier: currentSelectedDriver
    });

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
              { label: 'LivraLink Vendeur', view: 'vendeur_dashboard' },
              { label: 'Expéditions', view: 'vendeur_dashboard' },
              { label: 'Nouvelle livraison' }
            ]}
          />
        </div>

        {/* Mobile Header (Strict Stitch Mobile Header Specification) */}
        <header className="md:hidden sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md shadow-xs border-b border-slate-200">
          <div className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
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
                    #LL-8942
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>Brouillon auto-enregistré</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => showToast('Brouillon sauvegardé.', 'info')}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:scale-95"
                title="Sauvegarder"
              >
                <span className="material-symbols-outlined text-[18px]">bookmark_border</span>
              </button>
              <button
                onClick={() => showToast('Assistance LivraLink disponible au 01 02 03 04', 'info')}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:scale-95"
                title="Aide"
              >
                <span className="material-symbols-outlined text-[18px]">help_outline</span>
              </button>
            </div>
          </div>

          {/* Stepper indicateur d'étapes mobile compact */}
          <div className="px-4 py-2 bg-slate-50 flex items-center justify-between gap-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                <span className="material-symbols-outlined text-[12px]">check</span>
              </span>
              <span className="text-[11px] font-bold text-emerald-700 truncate">1. Client</span>
            </div>
            <span className="w-4 h-[2px] bg-emerald-500 shrink-0"></span>

            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                <span className="material-symbols-outlined text-[12px]">check</span>
              </span>
              <span className="text-[11px] font-bold text-emerald-700 truncate">2. Colis</span>
            </div>
            <span className="w-4 h-[2px] bg-blue-600 shrink-0"></span>

            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-600 opacity-40"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-blue-600 text-white items-center justify-center text-[10px] font-bold">
                  3
                </span>
              </span>
              <span className="text-[11px] font-bold text-blue-700 truncate">3. Livreur</span>
            </div>
          </div>
        </header>

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto custom-scrollbar px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-44 md:pb-12">
          {/* Desktop Top Header Card & Horizontal Stepper */}
          <div className="hidden md:flex bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  Créer une nouvelle livraison
                </h1>
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-mono text-xs font-bold">
                  COMMANDE #LL-8942
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500">
                Renseignez les détails du colis et assignez instantanément un coursier certifié.
              </p>
            </div>

            {/* Stepper (3 Steps Desktop) */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shadow-xs">
                  <span className="material-symbols-outlined text-base">check</span>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-emerald-700 uppercase">Complétée</div>
                  <div className="text-xs font-bold text-slate-900">1. Client</div>
                </div>
              </div>
              <div className="w-6 sm:w-8 h-0.5 bg-emerald-400"></div>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shadow-xs">
                  <span className="material-symbols-outlined text-base">check</span>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-emerald-700 uppercase">Complétée</div>
                  <div className="text-xs font-bold text-slate-900">2. Colis &amp; Trajet</div>
                </div>
              </div>
              <div className="w-6 sm:w-8 h-0.5 bg-blue-600"></div>

              <div className="flex items-center gap-2.5 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-sm ring-4 ring-blue-600/20 animate-pulse">
                  3
                </div>
                <div>
                  <div className="text-[10px] font-bold text-blue-700 uppercase">Étape active</div>
                  <div className="text-xs font-bold text-blue-900">3. Attribution Livreur</div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Accordion Summary (Strict Stitch Mobile Specification) */}
          <div className="md:hidden bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <button
              onClick={() => setIsSummaryAccordionOpen(!isSummaryAccordionOpen)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-left bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-[20px]">inventory</span>
                <span className="text-xs font-bold text-slate-900">Récapitulatif de la commande</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                  2 étapes validées
                </span>
              </div>
              <span className={`material-symbols-outlined text-slate-400 text-xl transition-transform duration-200 ${isSummaryAccordionOpen ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {isSummaryAccordionOpen && (
              <div className="px-3.5 py-3 space-y-3 divide-y divide-slate-100 text-xs">
                {/* Client Block */}
                <div className="flex items-start justify-between pt-1">
                  <div className="flex gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px]">person</span>
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900">{clientName}</span>
                        <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1 rounded">
                          <span className="material-symbols-outlined text-[11px] mr-0.5">verified</span>Vérifié
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <span>{clientPhone}</span>
                        <span>•</span>
                        <span className="italic text-amber-700">« Appeler avant départ »</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsEditingStep1(!isEditingStep1)}
                    className="p-1 text-slate-400 hover:text-blue-600"
                    title="Modifier"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                  </button>
                </div>

                {/* Route & Parcel Block */}
                <div className="flex items-start justify-between pt-2.5">
                  <div className="flex gap-2.5 flex-1 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px]">route</span>
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-800">
                        <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0"></span>
                        <span className="font-bold truncate">Boutique Glam Chic</span>
                        <span className="text-[10px] text-slate-400 shrink-0">(Cocody Angré)</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-800">
                        <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"></span>
                        <span className="font-bold truncate">Cocody Danga</span>
                        <span className="text-[10px] text-slate-400 shrink-0">Rés. Les Jardins</span>
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                        <span className="material-symbols-outlined text-xs">package_2</span>
                        <span className="truncate">{itemDescription}</span>
                        <span className="font-bold text-blue-700 shrink-0">• {totalClient.toLocaleString('fr-FR')} F</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsEditingStep2(!isEditingStep2)}
                    className="p-1 text-slate-400 hover:text-blue-600 ml-2"
                    title="Modifier"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2-Columns Grid on Desktop & Stack on Mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
            {/* Desktop Left Column: Step 1 & Step 2 Details (Hidden on mobile because shown in accordion) */}
            <div className="hidden md:block lg:col-span-5 space-y-6">
              {/* Step 1 Recap */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    <h2 className="text-sm font-bold text-slate-900">Destinataire (Client)</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingStep1(!isEditingStep1)}
                    className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    <span>{isEditingStep1 ? 'Fermer' : 'Modifier'}</span>
                  </button>
                </div>

                {isEditingStep1 ? (
                  <div className="space-y-3 pt-1 text-xs">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Nom du client</label>
                      <input
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Téléphone / WhatsApp</label>
                      <input
                        type="tel"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">Consignes</label>
                      <input
                        type="text"
                        value={clientNote}
                        onChange={(e) => setClientNote(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEditingStep1(false)}
                      className="w-full py-2 bg-blue-600 text-white font-bold text-xs rounded-xl"
                    >
                      Enregistrer
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[11px] text-slate-500 block mb-1">Nom du client</span>
                      <div className="flex items-center gap-2 font-bold text-slate-900 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <span className="material-symbols-outlined text-base text-blue-600">person</span>
                        <span>{clientName}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-500 block mb-1">Téléphone / WhatsApp</span>
                      <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2 font-semibold text-slate-900">
                          <span className="material-symbols-outlined text-emerald-600 text-base">chat</span>
                          <span>{clientPhone}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          <span className="material-symbols-outlined text-xs">check_circle</span>
                          Vérifié
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-500 block mb-1">Note de livraison</span>
                      <div className="flex items-center gap-2 text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200 italic">
                        <span className="material-symbols-outlined text-base text-amber-600">info</span>
                        <span>{clientNote}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2 Recap */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    <h2 className="text-sm font-bold text-slate-900">Détails du colis &amp; Trajet</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingStep2(!isEditingStep2)}
                    className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    <span>{isEditingStep2 ? 'Fermer' : 'Modifier'}</span>
                  </button>
                </div>

                <div className="relative pl-6 space-y-4 border-l-2 border-dashed border-slate-200 ml-2 text-xs">
                  <div className="relative">
                    <span className="absolute -left-[31px] top-0 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-blue-100"></span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Point de ramassage</span>
                    <p className="font-bold text-slate-900 leading-snug">Boutique Glam Chic</p>
                    <p className="text-slate-500">{pickupAddress}</p>
                  </div>

                  <div className="relative pt-1">
                    <span className="absolute -left-[31px] top-2 w-3.5 h-3.5 rounded-full bg-emerald-600 ring-4 ring-emerald-100"></span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Destination finale</span>
                    <p className="font-bold text-slate-900 leading-snug">{clientName}</p>
                    <p className="text-slate-500">{dropoffAddress}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-white text-blue-600 border border-slate-200 shrink-0">
                      <span className="material-symbols-outlined text-lg">inventory_2</span>
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900">{itemDescription}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-semibold">
                          Poids : ~{itemWeight} kg
                        </span>
                        {isFragile && (
                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-xs">warning</span>
                            Fragile
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-semibold">
                          Format M
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-slate-100 p-4 border border-blue-100 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Montant marchandise à encaisser (COD) :</span>
                    <span className="font-bold text-slate-900">{codAmount.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Frais de livraison standard (Cocody) :</span>
                    <span className="font-bold text-slate-900">{deliveryFee.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
                    <span className="font-bold text-blue-700">Total à percevoir client :</span>
                    <span className="font-extrabold text-blue-700 text-base">{totalClient.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column / Major Focus Area: Étape 3 (Interactive GPS Map + Courier Cards List) */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-6">
              {/* Interactive Vector GPS Map */}
              <div className="relative w-full h-[260px] sm:h-[340px] rounded-2xl overflow-hidden border border-slate-200 bg-[#edf1fa] shadow-md select-none">
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 600 380">
                  <defs>
                    <pattern id="mapGridV" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f2" strokeWidth="1" />
                    </pattern>
                  </defs>

                  <rect width="600" height="380" fill="#eef2f8" />
                  <rect width="600" height="380" fill="url(#mapGridV)" />

                  {/* Laguna */}
                  <path d="M 0 320 Q 180 300 310 330 T 600 350 L 600 380 L 0 380 Z" fill="#d7e5fa" />

                  {/* Avenues */}
                  <path d="M -10 120 C 140 130 260 90 380 95 C 460 98 520 130 610 120" stroke="#cbd5e6" strokeWidth="16" fill="none" />
                  <path d="M -10 120 C 140 130 260 90 380 95 C 460 98 520 130 610 120" stroke="#ffffff" strokeWidth="12" fill="none" />

                  <path d="M 140 0 L 150 280 L 170 380" stroke="#cbd5e6" strokeWidth="14" fill="none" />
                  <path d="M 140 0 L 150 280 L 170 380" stroke="#ffffff" strokeWidth="10" fill="none" />

                  <path d="M 380 0 L 375 220 L 410 380" stroke="#cbd5e6" strokeWidth="16" fill="none" />
                  <path d="M 380 0 L 375 220 L 410 380" stroke="#ffffff" strokeWidth="12" fill="none" />

                  {/* Active trajectory to Selected Courier */}
                  <path
                    d="M 130 85 L 146 122 L 240 122 L 310 170"
                    fill="none"
                    stroke="#1d4ed8"
                    strokeWidth="4"
                    strokeDasharray="6 6"
                    className="animate-[pulse_1.5s_infinite]"
                  />

                  {/* Delivery track */}
                  <path
                    d="M 310 170 L 375 210 L 460 260"
                    fill="none"
                    stroke="#059669"
                    strokeWidth="4"
                    strokeDasharray="5 5"
                  />

                  {/* Pins */}
                  <circle cx="310" cy="170" r="10" fill="#1d4ed8" className="animate-ping opacity-40" />
                  <circle cx="310" cy="170" r="7" fill="#1d4ed8" />
                  <circle cx="310" cy="170" r="3" fill="#ffffff" />

                  <circle cx="460" cy="260" r="7" fill="#059669" />
                  <circle cx="460" cy="260" r="3" fill="#6cf8bb" />

                  <circle cx="130" cy="85" r="6" fill="#0037b0" />
                  <circle cx="510" cy="90" r="5" fill="#747686" />
                  <circle cx="240" cy="270" r="5" fill="#747686" />
                </svg>

                {/* Top Status Overlays on Map */}
                <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between pointer-events-none text-xs">
                  <div className="bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-full shadow-xs border border-slate-200 flex items-center gap-1.5 pointer-events-auto">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span className="font-bold text-slate-800 text-[11px]">3 livreurs actifs • Cocody</span>
                  </div>
                  <div className="bg-white/95 backdrop-blur-md px-2 py-1 rounded-lg shadow-xs border border-slate-200 flex items-center gap-1 text-[11px] font-semibold text-emerald-700 pointer-events-auto">
                    <span className="material-symbols-outlined text-[14px]">traffic</span>
                    <span>Trafic fluide</span>
                  </div>
                </div>

                {/* Marker 1: Boutique Glam Chic */}
                <div className="absolute top-24 left-[45%] -translate-x-1/2 z-10">
                  <div className="bg-blue-600 text-white rounded-xl px-2.5 py-1 shadow-md flex items-center gap-1.5 border border-white/40">
                    <span className="material-symbols-outlined text-xs">storefront</span>
                    <span className="text-[10px] font-bold">Boutique Glam Chic</span>
                  </div>
                </div>

                {/* Marker 2: Sarah K. (Destination) */}
                <div className="absolute bottom-12 right-6 z-10">
                  <div className="bg-emerald-700 text-white rounded-xl px-2.5 py-1 shadow-md flex items-center gap-1.5 border border-white/40">
                    <span className="material-symbols-outlined text-xs">home_pin</span>
                    <span className="text-[10px] font-bold">{clientName}</span>
                  </div>
                </div>

                {/* Marker 3: Selected Driver David */}
                <div className="absolute top-10 left-6 z-10 cursor-pointer">
                  <div className="bg-slate-900 text-white px-2 py-0.5 rounded-full shadow-lg text-[10px] font-bold flex items-center gap-1 border border-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>{currentSelectedDriver.name} (~6 min • 1.2km)</span>
                  </div>
                </div>

                {/* Map Controls Floating */}
                <div className="absolute bottom-2.5 right-2.5 flex flex-col gap-1 z-10">
                  <button className="w-7 h-7 rounded-lg bg-white shadow border border-slate-200 flex items-center justify-center text-slate-700 text-sm">
                    <span className="material-symbols-outlined text-xs">add</span>
                  </button>
                  <button className="w-7 h-7 rounded-lg bg-white shadow border border-slate-200 flex items-center justify-center text-slate-700 text-sm">
                    <span className="material-symbols-outlined text-xs">remove</span>
                  </button>
                  <button className="w-7 h-7 rounded-lg bg-white shadow border border-slate-200 flex items-center justify-center text-blue-600 text-sm">
                    <span className="material-symbols-outlined text-xs">my_location</span>
                  </button>
                </div>
              </div>

              {/* Section Header & Filters for Couriers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900">Coursiers certifiés disponibles</h2>
                    <p className="text-xs text-slate-500">Attribution directe avec garantie de prise en charge</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    3 en ligne
                  </span>
                </div>

                {/* Quick Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  <button
                    type="button"
                    onClick={() => setFilterType('all')}
                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                      filterType === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tous (3)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('nearest')}
                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                      filterType === 'nearest'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Plus proche (&lt; 2 km)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('top')}
                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                      filterType === 'top'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xs text-amber-500">star</span>
                    <span>Note &gt; 4.8★</span>
                  </button>
                </div>

                {/* Driver Cards List */}
                <div className="space-y-2.5">
                  {displayedDrivers.map((courier) => {
                    const isSelected = courier.id === selectedDriverId;
                    return (
                      <div
                        key={courier.id}
                        onClick={() => handleSelectCourier(courier.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'border-2 border-blue-600 bg-blue-50/40 shadow-sm ring-2 ring-blue-600/20'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {/* Recommended Badge */}
                        {courier.badge && (
                          <div className="flex items-center justify-between mb-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                              <span className="material-symbols-outlined text-xs">award_star</span>
                              <span>Recommandé LivraLink</span>
                            </span>
                            <span className="text-[10px] font-bold text-blue-700 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                              Prise en charge ~{courier.etaMinutes} min
                            </span>
                          </div>
                        )}

                        <div className="flex items-start gap-3">
                          {/* Radio Selector */}
                          <div className="pt-0.5">
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-transparent'
                              }`}
                            >
                              {isSelected && <span className="material-symbols-outlined text-xs font-bold">check</span>}
                            </div>
                          </div>

                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-extrabold flex items-center justify-center text-sm shrink-0 shadow-inner">
                            {courier.avatarInitials}
                          </div>

                          {/* Courier Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h3 className="font-bold text-xs sm:text-sm text-slate-900">{courier.name}</h3>
                              <span className="font-black text-xs sm:text-sm text-blue-700">
                                {courier.priceFCFA.toLocaleString('fr-FR')} F <span className="text-[10px] font-normal text-slate-400">CFA</span>
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                              <span className="flex items-center font-bold text-slate-800">
                                <span className="material-symbols-outlined text-xs text-amber-500 mr-0.5">star</span>
                                {courier.rating}
                              </span>
                              <span>({courier.totalDeliveries} courses)</span>
                              <span>•</span>
                              <span>{courier.vehicle}</span>
                            </div>

                            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                              <span className="text-slate-600 font-medium flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs text-blue-600">near_me</span>
                                À <strong>{courier.distanceKm} km</strong> de Glam Chic
                              </span>
                              <span className="text-emerald-700 font-bold">
                                Arrivée ~{courier.etaMinutes} min
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Trust Ribbon */}
                <div className="p-3 bg-slate-100 rounded-2xl border border-slate-200/60 flex items-start gap-2.5 text-xs text-slate-600">
                  <span className="material-symbols-outlined text-emerald-600 text-base shrink-0 mt-0.5">verified_user</span>
                  <p>
                    <strong className="text-slate-900">Garantie Livraison Express :</strong> Le coursier sélectionné dispose de 3 minutes pour confirmer l'attribution, sans quoi la commande est rediffusée sans surcoût.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Fixed Bottom Sticky Action Bar (Strict Google Stitch Specification) */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md shadow-[0_-8px_24px_rgba(15,23,42,0.1)] px-4 py-3 border-t border-slate-200">
          <div className="max-w-xl mx-auto space-y-2">
            {/* Quick info bar */}
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Total course :</span>
                <span className="text-sm font-black text-blue-700">{deliveryFee.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex items-center gap-1 text-slate-800 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Assigné : <strong>{currentSelectedDriver.name}</strong></span>
                <span className="text-slate-500">(~{currentSelectedDriver.etaMinutes} min)</span>
              </div>
            </div>

            {/* Main Primary CTA Button */}
            <button
              type="button"
              onClick={handleConfirmAssignment}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg font-bold">bolt</span>
              <span>Attribuer la livraison à {currentSelectedDriver.name}</span>
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>

            {/* Secondary broadcast switch */}
            <button
              type="button"
              onClick={() => {
                showToast('Mode diffusion automatique activé pour tous les coursiers.', 'info');
                handleConfirmAssignment();
              }}
              className="w-full text-center text-[11px] text-slate-500 hover:text-blue-600 flex items-center justify-center gap-1 transition-colors"
            >
              <span className="material-symbols-outlined text-xs">podcasts</span>
              <span>Changer de mode : <strong>Diffusion automatique à tous les coursiers</strong></span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
