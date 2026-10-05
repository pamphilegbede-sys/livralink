import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';

export const LivreurSettings: React.FC = () => {
  const { courierSettings, setCourierSettings, toggleCourierAvailability, showToast, setCurrentView } = useApp();

  const [fullName, setFullName] = useState(courierSettings.fullName);
  const [phone, setPhone] = useState(courierSettings.phone);
  const [email, setEmail] = useState(courierSettings.email);
  const [parkingBaseAddress, setParkingBaseAddress] = useState(courierSettings.parkingBaseAddress);
  const [vehicleType, setVehicleType] = useState(courierSettings.vehicleType);
  const [vehiclePlate, setVehiclePlate] = useState(courierSettings.vehiclePlate);
  const [activeZones, setActiveZones] = useState<string[]>(courierSettings.activeZones);
  const [workingHours, setWorkingHours] = useState(courierSettings.workingHours);

  // Notification toggles
  const [notifyNewMission, setNotifyNewMission] = useState(true);
  const [notifyMissionAccepted, setNotifyMissionAccepted] = useState(true);
  const [notifyMissionChange, setNotifyMissionChange] = useState(true);
  const [notifyPODValidated, setNotifyPODValidated] = useState(true);
  const [notifyPayoutReceived, setNotifyPayoutReceived] = useState(true);

  const availableZones = ['Centre-ville', 'Zongo', 'Akpakpa', 'Fidjrossè', 'Godomey', 'Cocody', 'Plateau'];

  const toggleZone = (zone: string) => {
    if (activeZones.includes(zone)) {
      setActiveZones(activeZones.filter((z) => z !== zone));
    } else {
      setActiveZones([...activeZones, zone]);
    }
  };

  const handleSave = () => {
    setCourierSettings((prev) => ({
      ...prev,
      fullName,
      phone,
      email,
      parkingBaseAddress,
      vehicleType,
      vehiclePlate,
      activeZones,
      workingHours,
    }));
    showToast('Paramètres Livreur enregistrés avec succès !', 'success');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff]">
        {/* Top Header */}
        <Header
          title="Paramètres du compte Livreur"
          subtitle="Profil coursier, zones, moyens de transport et gestion du portefeuille"
          showReturn
          onReturn={() => setCurrentView('livreur_dashboard')}
        />

        {/* Scrollable Container */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* Header Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                  Paramètres du compte Livreur
                </h1>
                <span className="px-3 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                  Livreur Partenaire Vérifié ✓
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Gérez votre profil coursier, vos modes d'encaissement transparents et votre disponibilité d'intervention.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => showToast('Paramètres réinitialisés.', 'info')}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
              >
                Réinitialiser
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">check_circle</span>
                <span>Enregistrer les modifications</span>
              </button>
            </div>
          </div>

          {/* Quick Anchor Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-xs sticky top-0 z-10 text-xs font-semibold">
            <a href="#mon-profil" className="px-3.5 py-2 rounded-xl bg-blue-50 text-blue-700 font-bold whitespace-nowrap">
              Mon Profil
            </a>
            <a href="#disponibilite" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Activité &amp; Disponibilité
            </a>
            <a href="#zones-transport" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Transport &amp; Zones
            </a>
            <a href="#portefeuille" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Portefeuille &amp; Revenus
            </a>
            <a href="#historique" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Historique
            </a>
            <a href="#notifications" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Notifications
            </a>
            <a href="#securite" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Sécurité
            </a>
          </div>

          {/* ================= 1. MON PROFIL LIVREUR ================= */}
          <section id="mon-profil" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">badge</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Mon Profil Livreur</h2>
                  <p className="text-xs text-slate-500">Données officielles d'identification du livreur et réputation sur le réseau</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-200">
                Certifié LivraLink
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Photo & Performance metrics */}
              <div className="lg:col-span-4 p-5 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-3 flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-2xl ring-4 ring-blue-100 shadow-md">
                  DK
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{fullName}</h3>
                  <p className="text-xs text-slate-500">Coursier Urbain Indépendant</p>
                </div>
                <div className="w-full pt-3 border-t border-slate-200 flex justify-around text-xs">
                  <div>
                    <span className="text-lg font-black text-slate-900 block">4.9 ★</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Note globale</span>
                  </div>
                  <div className="w-px bg-slate-200"></div>
                  <div>
                    <span className="text-lg font-black text-blue-700 block">842</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Courses livrées</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => showToast('Mise à jour photo profil simulée.', 'info')}
                  className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">photo_camera</span>
                  <span>Changer la photo</span>
                </button>
              </div>

              {/* Fields */}
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nom complet</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-bold text-slate-700">Téléphone vérifié</label>
                    <span className="text-emerald-600 font-bold text-[10px]">Vérifié ✓</span>
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-bold text-slate-700">Email officiel</label>
                    <span className="text-emerald-600 font-bold text-[10px]">Vérifié ✓</span>
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Adresse de stationnement / Base</label>
                  <input
                    type="text"
                    value={parkingBaseAddress}
                    onChange={(e) => setParkingBaseAddress(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ================= 2. ACTIVITÉ & DISPONIBILITÉ ================= */}
          <section id="disponibilite" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">toggle_on</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Activité de livraison &amp; Disponibilité</h2>
                <p className="text-xs text-slate-500">Contrôlez la réception en temps réel des courses selon votre statut</p>
              </div>
            </div>

            {/* Toggle Card */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xl">sensors</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {courierSettings.isAvailable ? '🟢 Actuellement Disponible (En Ligne)' : '⏸️ En Pause / Hors-ligne'}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-bold">
                      {courierSettings.isAvailable ? 'EN SERVICE' : 'PAUSE'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 max-w-xl">
                    Le statut <strong>Disponible</strong> permet de recevoir instantanément des missions géolocalisées sur votre secteur.
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={courierSettings.isAvailable}
                  onChange={toggleCourierAvailability}
                  className="sr-only peer"
                />
                <div className="w-14 h-8 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
                <span className="ml-3 text-xs font-bold text-slate-900">Accepter des courses</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">Horaires habituels de tournée</p>
                  <p className="text-slate-500">{workingHours}</p>
                </div>
                <button
                  type="button"
                  onClick={() => showToast('Horaires de tournée mis à jour.', 'success')}
                  className="text-blue-600 font-bold hover:underline"
                >
                  Modifier
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">Mode d'alerte sonore</p>
                  <p className="text-slate-500">Push prioritaire + Sonnerie forte</p>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Actif</span>
              </div>
            </div>
          </section>

          {/* ================= 3. ZONES & TRANSPORT ================= */}
          <section id="zones-transport" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">two_wheeler</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Zones de livraison &amp; Moyen de transport</h2>
                <p className="text-xs text-slate-500">Définition de votre périmètre d'intervention et véhicule homologué</p>
              </div>
            </div>

            {/* Zone Chips */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800">Ma zone de livraison (puces sélectionnables)</label>
              <div className="flex flex-wrap gap-2">
                {availableZones.map((zone) => {
                  const isSelected = activeZones.includes(zone);
                  return (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => toggleZone(zone)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span>{zone}</span>
                      <span className="material-symbols-outlined text-xs">
                        {isSelected ? 'check' : 'add'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Note informative obligatoire (Rule 8 & 9) */}
              <div className="mt-3 p-3 rounded-xl bg-slate-50 border-l-4 border-blue-600 flex items-start gap-2.5 text-xs text-slate-700">
                <span className="material-symbols-outlined text-blue-600 text-base shrink-0 mt-0.5">info</span>
                <p>
                  <strong>Note informative :</strong> Les tarifs kilométriques et forfaits de chaque zone sont fixés automatiquement par la plateforme LivraLink et ne peuvent pas être modifiés par le livreur.
                </p>
              </div>
            </div>

            {/* Vehicle Specs */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xl">two_wheeler</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-xs text-slate-900">{vehicleType}</h4>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      Véhicule vérifié ✓
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Immatriculation : <strong className="text-slate-900">{vehiclePlate}</strong> • Assurance à jour (2025)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => showToast('Mise à jour véhicule enregistrée.', 'info')}
                className="px-3.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Mettre à jour le véhicule
              </button>
            </div>
          </section>

          {/* ================= 4. PORTEFEUILLE & REVENUS (0% MVP BANNER & RULE 10/11) ================= */}
          <section id="portefeuille" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Paiements, Revenus &amp; Transparence</h2>
                  <p className="text-xs text-slate-500">Solde en direct, règles de rétribution automatique et modes de retrait</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => showToast('Demande de versement Mobile Money envoyée !', 'success')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">payments</span>
                <span>Demander un versement</span>
              </button>
            </div>

            {/* 0% MVP Commission Banner (Exact Stitch Banner) */}
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-emerald-600 text-2xl">stars</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xs text-slate-900">Offre MVP 0% de commission</h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                      0% Commission (Phase MVP)
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    100% du montant de la course vous est directement reversé. Aucun frais déduit durant la phase de lancement.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-white text-emerald-800 font-bold text-xs border border-emerald-200 shadow-xs shrink-0">
                100% pour vous ✓
              </span>
            </div>

            {/* 4 Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-blue-700">Solde disponible au retrait</span>
                <div className="text-2xl font-black text-blue-900">25 500 F</div>
                <span className="text-emerald-700 font-bold text-[10px]">Prêt à virer sur Mobile Money</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Revenus du jour</span>
                <div className="text-2xl font-black text-slate-900">7 500 F</div>
                <span className="text-slate-500 text-[10px]">3 missions finalisées</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Revenus de la semaine</span>
                <div className="text-2xl font-black text-slate-900">42 000 F</div>
                <span className="text-slate-500 text-[10px]">18 missions terminées</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Revenus du mois</span>
                <div className="text-2xl font-black text-slate-900">165 000 F</div>
                <span className="text-slate-500 text-[10px]">68 missions au total</span>
              </div>
            </div>

            {/* Payout Methods */}
            <div className="space-y-3">
              <h3 className="font-bold text-xs text-slate-900">Moyen de paiement principal pour les versements</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-4 rounded-2xl border-2 border-blue-600 bg-blue-50/50 space-y-1 relative">
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-[10px]">
                    Défaut
                  </span>
                  <p className="font-bold text-slate-900">MTN Mobile Money</p>
                  <p className="text-slate-500">+225 07 •• •• 04</p>
                  <span className="text-emerald-600 font-bold text-[10px] block">Instantané (0s)</span>
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-1">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[10px]">Secondaire</span>
                  <p className="font-bold text-slate-900">Moov Money</p>
                  <p className="text-slate-500">+225 01 •• •• 99</p>
                </div>

                <div className="p-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-center p-4">
                  <span className="material-symbols-outlined text-slate-400 text-2xl">account_balance</span>
                  <p className="font-bold text-slate-800 mt-1">Compte Bancaire (RIB)</p>
                  <button
                    type="button"
                    onClick={() => showToast('Formulaire RIB ouvert.', 'info')}
                    className="text-blue-600 font-bold hover:underline text-[11px] mt-1"
                  >
                    Lier un compte
                  </button>
                </div>
              </div>
            </div>

            {/* Rule 10 & 11: Breakdown & Transparency Before Mission Acceptance Mockup */}
            <div className="p-5 rounded-3xl bg-slate-50 border-2 border-blue-600/30 space-y-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-base">visibility</span>
                <h3 className="font-bold text-xs text-slate-900">Transparence avant acceptation (Aperçu d'une mission entrante)</h3>
              </div>
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 text-xs space-y-1.5 text-slate-700">
                <div className="flex justify-between">
                  <span>Prix de la livraison (calculé automatiquement) :</span>
                  <span className="font-bold text-slate-900">1 000 FCFA</span>
                </div>
                <div className="flex justify-between">
                  <span>Commission LivraLink (fixée par le système) :</span>
                  <span className="font-bold text-emerald-600">0 FCFA (Offre Spéciale MVP 0%)</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-sm font-bold">
                  <span className="text-emerald-700">Votre gain garanti net :</span>
                  <span className="text-emerald-700 text-base font-black">1 000 FCFA (100% de la course)</span>
                </div>
              </div>
            </div>
          </section>

          {/* ================= 5. HISTORIQUE DES TRANSACTIONS ================= */}
          <section id="historique" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Historique des revenus &amp; Transactions récentes</h2>
                <p className="text-xs text-slate-500">Relevé clair de chaque course exécutée et calcul de la rémunération nette</p>
              </div>
              <button
                type="button"
                onClick={() => showToast('Export PDF généré avec succès !', 'success')}
                className="text-blue-600 font-bold text-xs hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">file_download</span>
                <span>Exporter (PDF)</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Réf Livraison</th>
                    <th className="py-2.5 px-3">Prix course</th>
                    <th className="py-2.5 px-3">Commission</th>
                    <th className="py-2.5 px-3 text-blue-700 font-bold">Revenu Net perçu</th>
                    <th className="py-2.5 px-3">Moyen de versement</th>
                    <th className="py-2.5 px-3 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50">
                    <td className="py-3 px-3 text-slate-500 font-medium">14 Oct 2024</td>
                    <td className="py-3 px-3 font-mono font-bold text-blue-700">#LL-1024</td>
                    <td className="py-3 px-3">1 000 FCFA</td>
                    <td className="py-3 px-3 text-emerald-600 font-bold">0 FCFA (0% MVP)</td>
                    <td className="py-3 px-3 font-black text-emerald-700">1 000 FCFA</td>
                    <td className="py-3 px-3 text-slate-600">MTN MoMo</td>
                    <td className="py-3 px-3 text-right">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                        Payé
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-3 px-3 text-slate-500 font-medium">14 Oct 2024</td>
                    <td className="py-3 px-3 font-mono font-bold text-blue-700">#LL-1020</td>
                    <td className="py-3 px-3">2 500 FCFA</td>
                    <td className="py-3 px-3 text-emerald-600 font-bold">0 FCFA (0% MVP)</td>
                    <td className="py-3 px-3 font-black text-emerald-700">2 500 FCFA</td>
                    <td className="py-3 px-3 text-slate-600">MTN MoMo</td>
                    <td className="py-3 px-3 text-right">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                        Payé
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="py-3 px-3 text-slate-500 font-medium">13 Oct 2024</td>
                    <td className="py-3 px-3 font-mono font-bold text-blue-700">#LL-0994</td>
                    <td className="py-3 px-3">1 500 FCFA</td>
                    <td className="py-3 px-3 text-emerald-600 font-bold">0 FCFA (0% MVP)</td>
                    <td className="py-3 px-3 font-black text-emerald-700">1 500 FCFA</td>
                    <td className="py-3 px-3 text-slate-600">Solde compte</td>
                    <td className="py-3 px-3 text-right">
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px]">
                        Transféré
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ================= 6. NOTIFICATIONS ================= */}
          <section id="notifications" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">notifications_active</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Préférences de Notifications Coursier</h2>
                <p className="text-xs text-slate-500">Alertes sonores et notifications pour ne rater aucune opportunité</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Nouvelle mission dans ma zone</span>
                  <span className="text-slate-500">Sonnerie forte prioritaire</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifyNewMission}
                  onChange={(e) => setNotifyNewMission(e.target.checked)}
                  className="rounded text-blue-600 w-4 h-4"
                />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Mission acceptée &amp; itinéraire GPS</span>
                  <span className="text-slate-500">Ouverture automatique</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifyMissionAccepted}
                  onChange={(e) => setNotifyMissionAccepted(e.target.checked)}
                  className="rounded text-blue-600 w-4 h-4"
                />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Preuve POD validée par le client</span>
                  <span className="text-slate-500">Clôture de la course</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifyPODValidated}
                  onChange={(e) => setNotifyPODValidated(e.target.checked)}
                  className="rounded text-blue-600 w-4 h-4"
                />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Paiement reçu sur portefeuille</span>
                  <span className="text-slate-500">Alerte versement</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifyPayoutReceived}
                  onChange={(e) => setNotifyPayoutReceived(e.target.checked)}
                  className="rounded text-blue-600 w-4 h-4"
                />
              </div>
            </div>
          </section>

          {/* ================= 7. SÉCURITÉ & SUPPORT ================= */}
          <section id="securite" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">shield</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Sécurité &amp; Support Coursier</h2>
                <p className="text-xs text-slate-500">Protection du compte et assistance 24/7 en cas d'urgence sur la route</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900">Support Dispatch 24/7</h4>
                <p className="text-slate-500">Panne de moto, accident ou litige adresse ? Contactez immédiatement la hotline.</p>
                <a
                  href="tel:01020304"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold shadow-xs"
                >
                  <span className="material-symbols-outlined text-sm">support_agent</span>
                  <span>Appeler le Dispatch (01 02 03 04)</span>
                </a>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900">Chartes &amp; Assurance</h4>
                <p className="text-slate-500">Votre compte coursier est couvert par l'assurance responsabilité civile transporteur.</p>
                <button
                  type="button"
                  onClick={() => showToast('Conditions partenaires téléchargées.', 'info')}
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100"
                >
                  Consulter mon contrat
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav />
    </div>
  );
};
