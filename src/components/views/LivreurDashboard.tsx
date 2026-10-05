import React from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';

export const LivreurDashboard: React.FC = () => {
  const {
    deliveries,
    courierSettings,
    userProfile,
    toggleCourierAvailability,
    setIsPODModalOpen,
    setSelectedDelivery,
    openWhatsAppModal,
    showToast,
    setIsUrgentOfferOpen
  } = useApp();

  const activeOrder = deliveries.find((d) => d.id === '#LL-4192') || deliveries[0];

  const handleOpenPOD = () => {
    setSelectedDelivery(activeOrder);
    setIsPODModalOpen(true);
  };

  const handleWhatsApp = () => {
    const msg = `Bonjour ${activeOrder.clientName}, je suis votre livreur LivraLink pour votre commande ${activeOrder.id}. Je suis en approche dans votre secteur (Cocody). Êtes-vous bien disponible ?`;
    openWhatsAppModal(activeOrder.clientPhone, activeOrder.clientName, msg);
  };

  const displayName = userProfile?.fullName?.split(' ')[0] || courierSettings.fullName.split(' ')[0] || 'Livreur';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff]">
        {/* Top Header */}
        <Header
          title="Tableau de bord Livreur"
          subtitle="Tournée en cours • Zone Abidjan Nord"
        />

        {/* Scrollable Container */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* 1. Courier Greeting & Telemetry Strip */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
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
                    <span className={`w-2 h-2 rounded-full ${courierSettings.isAvailable ? 'bg-emerald-600 animate-ping' : 'bg-slate-500'}`}></span>
                    <span>{courierSettings.isAvailable ? 'Statut : En ligne 🟢' : 'Statut : Hors-ligne ⏸️'}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Prêt pour votre tournée • Attribution intelligente et courses instantanées garanties sans litige.
                </p>
              </div>
            </div>

            {/* Context chips */}
            <div className="flex items-center gap-2 flex-wrap text-xs font-semibold">
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-blue-600">pin_drop</span>
                <span>Abidjan Nord (Cocody - Marcory)</span>
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">gps_fixed</span>
                <span>GPS Actif</span>
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600">
                Batt. 88%
              </span>
            </div>
          </div>

          {/* 2. 4 Key Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Courses Jour */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>COURSES JOUR</span>
                <span className="material-symbols-outlined text-blue-600">calendar_today</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-slate-900">12</span>
                <span className="text-xs text-slate-400 font-bold">/ 15 courses</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-full rounded-full" style={{ width: '80%' }}></div>
              </div>
              <span className="text-[10px] text-slate-400 block">Objectif : 80% réalisé</span>
            </div>

            {/* Revenus Jour */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>REVENUS JOUR</span>
                <span className="text-xs font-bold text-blue-600">Retrait ›</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900">18 500</span>
                <span className="text-xs font-bold text-slate-400">FCFA</span>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1">
                <span className="text-emerald-600 font-bold">+2 500 F pourb.</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  MoMo direct
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
                <span className="text-2xl sm:text-3xl font-black text-emerald-700">8</span>
                <span className="text-xs font-bold text-emerald-600">100% OK</span>
              </div>
              <p className="text-[11px] text-slate-500">Preuves POD certifiées sans litige</p>
            </div>

            {/* En Cours */}
            <div className="bg-blue-50/70 border-2 border-blue-300 p-4 sm:p-5 rounded-3xl shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-blue-700 font-bold">
                <span>EN COURS</span>
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping"></span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-blue-950">1 active</span>
              </div>
              <p className="text-[11px] text-blue-800 font-medium">#LL-4192 • Cocody Danga</p>
            </div>
          </div>

          {/* 3. Urgent Course Proposal Teaser (#LL-4195) */}
          <section className="bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 rounded-3xl p-4 sm:p-5 text-white shadow-md border border-amber-300 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/20">
              <div className="flex items-center gap-2">
                <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-yellow-200">bolt</span>
                  Course Express 45 min
                </span>
                <span className="text-xs font-semibold text-amber-100">#LL-4195</span>
              </div>
              <div className="flex items-center gap-1 bg-black/25 px-2.5 py-0.5 rounded-full text-xs font-bold text-amber-200">
                <span className="material-symbols-outlined text-xs animate-spin">schedule</span>
                <span>28s</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 text-xs">
                <p className="font-bold flex items-center gap-1.5 text-white">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Plateau, CCIA ➔ Marcory Zone 4
                </p>
                <p className="text-amber-100">
                  Docs juridiques (0.4 kg) • Collecte à 1.1 km de votre position
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xl font-black text-white">3 000 FCFA</div>
                  <span className="text-[10px] text-amber-100 block">Gain net garanti (0% commission)</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => showToast('Course ignorée.', 'info')}
                    className="py-2 px-3 bg-black/25 hover:bg-black/35 rounded-xl font-bold text-xs text-white"
                  >
                    Ignorer
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsUrgentOfferOpen(true)}
                    className="py-2 px-4 bg-white hover:bg-slate-100 text-slate-950 rounded-xl font-black text-xs shadow-md"
                  >
                    Accepter (30s)
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 4. Active Mission Card (#LL-4192) */}
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
            {/* Header of Active Mission */}
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Étape 2/2
                </span>
                <h2 className="font-extrabold text-base sm:text-lg">Course #LL-4192</h2>
                <span className="text-xs text-slate-400">Acceptée à 14:10</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-black text-emerald-400">2 500 FCFA</span>
                <span className="text-xs text-slate-400 block">+500 F pourboire potentiel</span>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 sm:p-6 space-y-5">
              {/* Itinerary Steps */}
              <div className="space-y-4 text-xs">
                {/* Pickup Step */}
                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    <span className="material-symbols-outlined text-sm">check</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-emerald-700 uppercase text-[10px]">1. Collecte validée</span>
                      <span className="text-slate-400">14:22</span>
                    </div>
                    <p className="font-bold text-slate-900 text-xs mt-0.5">Boutique Glam Chic (Kenza)</p>
                    <p className="text-slate-500">Cocody Angré 8ème tranche • Blvd Latrille</p>
                  </div>
                </div>

                {/* Dropoff Step */}
                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-blue-50/70 border-2 border-blue-300">
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 animate-pulse">
                    <span className="material-symbols-outlined text-sm">location_on</span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-blue-700 uppercase text-[10px]">2. Livraison en cours (Actuelle)</span>
                      <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-[10px]">Destination</span>
                    </div>
                    <p className="font-extrabold text-slate-900 text-sm">{activeOrder.clientName}</p>
                    <p className="text-slate-600">{activeOrder.dropoffLocation.address}</p>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 text-[10px] font-bold">
                        Sac mode (1.2 kg)
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                        Payé en ligne (0 FCFA à percevoir)
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                      <strong>Consigne client :</strong> "{activeOrder.dropoffLocation.details || 'Sonner à l\'interphone 14B ou laisser au vigile.'}"
                    </div>

                    {/* Contact buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleWhatsApp}
                        className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <span className="material-symbols-outlined text-sm">chat</span>
                        <span>WhatsApp</span>
                      </button>
                      <a
                        href={`tel:${activeOrder.clientPhone}`}
                        className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm text-blue-600">call</span>
                        <span>Appeler</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mini Map */}
              <div className="rounded-2xl border border-slate-200 overflow-hidden bg-[#edf1fa] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                  <span className="flex items-center gap-1 text-emerald-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Trafic fluide (Blvd Latrille)
                  </span>
                  <span className="text-blue-700">2.4 km • 8 min</span>
                </div>
                <div className="h-32 bg-slate-200/60 rounded-xl relative flex items-center justify-center overflow-hidden">
                  <svg className="w-full h-full" viewBox="0 0 320 120">
                    <path d="M 20 90 C 80 80, 120 40, 180 50 S 260 30, 300 20" stroke="#93c5fd" strokeWidth="6" strokeLinecap="round" fill="none" />
                    <path d="M 20 90 C 80 80, 120 40, 180 50" stroke="#2563eb" strokeWidth="6" strokeLinecap="round" fill="none" />
                    <circle cx="180" cy="50" r="8" fill="#1d4ed8" className="animate-pulse" />
                    <circle cx="300" cy="20" r="8" fill="#ef4444" />
                  </svg>
                  <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-800 shadow-xs">
                    Dans 350 m, tourner à droite (Rue des Jardins)
                  </div>
                </div>
              </div>

              {/* Major Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => showToast('Ouverture de Google Maps / Waze...', 'info')}
                  className="py-3.5 px-4 rounded-2xl border-2 border-blue-600 text-blue-700 font-bold text-xs hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">navigation</span>
                  <span>Ouvrir GPS (Google Maps / Waze)</span>
                </button>

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

          {/* 5. Emergency SOS Dispatch Banner */}
          <section className="bg-red-50 border border-red-200 rounded-3xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">support_agent</span>
              </div>
              <div>
                <p className="text-xs font-bold text-red-900 leading-tight">Besoin d'aide sur votre tournée ou incident ?</p>
                <p className="text-[11px] text-red-700">Contactez le Dispatch LivraLink en direct au 01 02 03 04</p>
              </div>
            </div>
            <a
              href="tel:01020304"
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shrink-0 shadow-xs active:scale-95"
            >
              SOS Dispatch
            </a>
          </section>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav />
    </div>
  );
};
