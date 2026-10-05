import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';

export const VendeurSettings: React.FC = () => {
  const { merchantSettings, setMerchantSettings, showToast, setCurrentView } = useApp();

  const [storeName, setStoreName] = useState(merchantSettings.storeName);
  const [managerName, setManagerName] = useState(merchantSettings.managerName);
  const [phone, setPhone] = useState(merchantSettings.phone);
  const [email, setEmail] = useState(merchantSettings.email);
  const [defaultPickupAddress, setDefaultPickupAddress] = useState(merchantSettings.defaultPickupAddress);
  const [defaultExpress, setDefaultExpress] = useState(merchantSettings.defaultExpress);
  const [frequentZones, setFrequentZones] = useState<string[]>(merchantSettings.frequentZones);
  const [permanentInstructions, setPermanentInstructions] = useState(merchantSettings.permanentInstructions);

  // Notification toggles
  const [notifyOnCreated, setNotifyOnCreated] = useState(merchantSettings.notifyOnCreated);
  const [notifyOnStatusChange, setNotifyOnStatusChange] = useState(merchantSettings.notifyOnStatusChange);
  const [notifyOnCourierAssigned, setNotifyOnCourierAssigned] = useState(merchantSettings.notifyOnCourierAssigned);
  const [notifyOnDelivered, setNotifyOnDelivered] = useState(merchantSettings.notifyOnDelivered);
  const [notifyOnIncident, setNotifyOnIncident] = useState(merchantSettings.notifyOnIncident);

  // Channels
  const [channelWhatsApp, setChannelWhatsApp] = useState(merchantSettings.channelWhatsApp);
  const [channelSMS, setChannelSMS] = useState(merchantSettings.channelSMS);
  const [channelEmail, setChannelEmail] = useState(merchantSettings.channelEmail);

  const availableZones = ['Cocody', 'Plateau', 'Marcory', 'Yopougon', 'Deux Plateaux', 'Treichville', 'Koumassi'];

  const toggleZone = (zone: string) => {
    if (frequentZones.includes(zone)) {
      setFrequentZones(frequentZones.filter((z) => z !== zone));
    } else {
      setFrequentZones([...frequentZones, zone]);
    }
  };

  const handleSave = () => {
    setMerchantSettings((prev) => ({
      ...prev,
      storeName,
      managerName,
      phone,
      email,
      defaultPickupAddress,
      defaultExpress,
      frequentZones,
      permanentInstructions,
      notifyOnCreated,
      notifyOnStatusChange,
      notifyOnCourierAssigned,
      notifyOnDelivered,
      notifyOnIncident,
      channelWhatsApp,
      channelSMS,
      channelEmail,
    }));
    showToast('Paramètres Vendeur enregistrés avec succès !', 'success');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Sidebar Desktop */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff]">
        {/* Top Header */}
        <Header
          title="Paramètres du compte Vendeur"
          subtitle="Gérez votre profil marchand, préférences d'expédition et facturation"
          showReturn
          onReturn={() => setCurrentView('vendeur_dashboard')}
        />

        {/* Scrollable Container */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* Header Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                  Paramètres Vendeur
                </h1>
                <span className="px-3 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                  Compte Marchand Vérifié ✓
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Configuration des règles et des coordonnées de collecte</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => showToast('Modifications réinitialisées.', 'info')}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
              >
                Réinitialiser
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">check</span>
                <span>Enregistrer les modifications</span>
              </button>
            </div>
          </div>

          {/* Quick Anchor Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-xs sticky top-0 z-10 text-xs font-semibold">
            <a href="#mon-profil" className="px-3.5 py-2 rounded-xl bg-blue-50 text-blue-700 font-bold whitespace-nowrap">
              Mon Profil
            </a>
            <a href="#preferences-livraison" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Préférences livraison
            </a>
            <a href="#tarification-commissions" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Tarification &amp; Commissions
            </a>
            <a href="#notifications" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Notifications
            </a>
            <a href="#paiements-facturation" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Paiements &amp; Facturation
            </a>
            <a href="#securite" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Sécurité
            </a>
            <a href="#aide-support" className="px-3.5 py-2 rounded-xl text-slate-600 hover:bg-slate-50 whitespace-nowrap">
              Aide &amp; Support
            </a>
          </div>

          {/* ================= 1. MON PROFIL ================= */}
          <section id="mon-profil" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">store</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Mon Profil Marchand</h2>
                  <p className="text-xs text-slate-500">Informations visibles sur les bordereaux et lors des collectes</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
                Profil Professionnel
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Logo Box */}
              <div className="lg:col-span-4 p-5 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-3 flex flex-col items-center">
                <div className="w-24 h-24 rounded-2xl bg-white border-2 border-slate-200 flex items-center justify-center text-blue-700 font-extrabold text-2xl shadow-sm">
                  GC
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{storeName}</h3>
                  <p className="text-xs text-slate-500">Prêt-à-porter &amp; Cosmétiques</p>
                </div>
                <div className="flex gap-1.5 pt-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    WhatsApp Sync Actif
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                    Instagram Shop
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => showToast('Téléchargement de logo simulé.', 'info')}
                  className="w-full py-2 px-3 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">photo_camera</span>
                  <span>Changer le logo</span>
                </button>
              </div>

              {/* Form inputs */}
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nom de l'entreprise</label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nom du responsable</label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-bold text-slate-700">Numéro WhatsApp Pro</label>
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
                    <label className="font-bold text-slate-700">Adresse email pro</label>
                    <span className="text-emerald-600 font-bold text-[10px]">Vérifié ✓</span>
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Adresse de ramassage principale</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-blue-600 text-lg">
                      location_on
                    </span>
                    <input
                      type="text"
                      value={defaultPickupAddress}
                      onChange={(e) => setDefaultPickupAddress(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ================= 2. PRÉFÉRENCES DE LIVRAISON ================= */}
          <section id="preferences-livraison" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">local_shipping</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Préférences de Livraison</h2>
                <p className="text-xs text-slate-500">Configuration de vos collectes et consignes permanentes</p>
              </div>
            </div>

            {/* Notice Métier LivraLink */}
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-600 text-xl shrink-0 mt-0.5">info</span>
              <p className="text-xs text-blue-900 leading-relaxed">
                <strong>Règle Métier LivraLink :</strong> Les frais de livraison sont calculés automatiquement par le moteur intelligent selon la distance réelle, la zone urbaine et les spécificités du colis. Le vendeur ne peut pas modifier la tarification unitaire.
              </p>
            </div>

            {/* Frequent Zones Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800">Zones de livraison fréquentes</label>
              <div className="flex flex-wrap gap-2">
                {availableZones.map((zone) => {
                  const isSelected = frequentZones.includes(zone);
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
            </div>

            {/* Express Toggle & Instructions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-slate-900 block">Livraison express prioritaire par défaut</span>
                  <span className="text-[11px] text-slate-500">Attribution immédiate d'un coursier dédié sous 15 minutes</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-3">
                  <input
                    type="checkbox"
                    checked={defaultExpress}
                    onChange={(e) => setDefaultExpress(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <label className="block font-bold text-xs text-slate-900 mb-1">Consignes permanentes pour les coursiers</label>
                <textarea
                  value={permanentInstructions}
                  onChange={(e) => setPermanentInstructions(e.target.value)}
                  rows={2}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none bg-white"
                />
              </div>
            </div>
          </section>

          {/* ================= 3. TARIFICATION & COMMISSIONS ================= */}
          <section id="tarification-commissions" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">payments</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Grille Tarifaire Officielle &amp; Commissions</h2>
                  <p className="text-xs text-slate-500">Barème de référence applicable à l'ensemble du réseau logistique</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">lock</span>
                <span>Lecture seule</span>
              </span>
            </div>

            {/* Distance Matrix Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-blue-700">Court Trajet</span>
                <div className="text-2xl font-black text-slate-900">500 <span className="text-xs font-normal">FCFA</span></div>
                <p className="text-xs text-slate-600 font-semibold">Distance : 0 à 3 km</p>
                <p className="text-[10px] text-slate-400">Intra-quartier rapide.</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-blue-700">Intermédiaire</span>
                <div className="text-2xl font-black text-slate-900">700 <span className="text-xs font-normal">FCFA</span></div>
                <p className="text-xs text-slate-600 font-semibold">Distance : 3 à 5 km</p>
                <p className="text-[10px] text-slate-400">Ex: Angré ↔ Deux Plateaux.</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-blue-700">Inter-Zones</span>
                <div className="text-2xl font-black text-slate-900">1 200 <span className="text-xs font-normal">FCFA</span></div>
                <p className="text-xs text-slate-600 font-semibold">Distance : 5 à 10 km</p>
                <p className="text-[10px] text-slate-400">Ex: Cocody ↔ Plateau / Marcory.</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-blue-700">Long Trajet</span>
                <div className="text-2xl font-black text-slate-900">+150 <span className="text-xs font-normal">F / km</span></div>
                <p className="text-xs text-slate-600 font-semibold">Au-delà de 10 km</p>
                <p className="text-[10px] text-slate-400">Calcul dynamique LivraLink.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
              <div>
                <span className="font-bold text-xs text-emerald-900 block">Commission LivraLink Vendeur : 0% (Offre de Lancement)</span>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  100% de transparence. Les montants sont automatiquement reversés aux coursiers partenaires.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-200 text-emerald-900 font-bold text-xs shrink-0">
                0% Actif
              </span>
            </div>
          </section>

          {/* ================= 4. NOTIFICATIONS ================= */}
          <section id="notifications" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">notifications_active</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Préférences de Notifications &amp; Alertes</h2>
                <p className="text-xs text-slate-500">Configurez les étapes clés où vous souhaitez être prévenu</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Nouvelles livraisons créées</span>
                  <span className="text-slate-500">Confirmation de prise en charge</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifyOnCreated}
                  onChange={(e) => setNotifyOnCreated(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Changement de statut en direct</span>
                  <span className="text-slate-500">Mise à jour minute par minute</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifyOnStatusChange}
                  onChange={(e) => setNotifyOnStatusChange(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Livreur assigné &amp; en approche</span>
                  <span className="text-slate-500">Alerte de préparation de colis</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifyOnCourierAssigned}
                  onChange={(e) => setNotifyOnCourierAssigned(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 block">Livraison terminée avec preuve (POD)</span>
                  <span className="text-slate-500">Horodatage &amp; code OTP client</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifyOnDelivered}
                  onChange={(e) => setNotifyOnDelivered(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
              </div>
            </div>
          </section>

          {/* ================= 5. PAIEMENTS & FACTURATION ================= */}
          <section id="paiements-facturation" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Paiements &amp; Facturation</h2>
                  <p className="text-xs text-slate-500">Moyens de paiement enregistrés pour les frais de course</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => showToast('Moyen de paiement ajouté.', 'success')}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>Ajouter</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
              <div className="p-4 rounded-2xl border-2 border-blue-600 bg-blue-50/50 relative space-y-2">
                <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-[10px]">Par défaut</span>
                <h4 className="font-bold text-slate-900">MTN Mobile Money</h4>
                <p className="text-slate-500">+225 05 •• •• 42</p>
                <span className="text-emerald-600 font-bold text-[11px] block">Débit direct sans frais</span>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[10px]">Secondaire</span>
                <h4 className="font-bold text-slate-900">Moov Money</h4>
                <p className="text-slate-500">+225 01 •• •• 90</p>
                <span className="text-slate-400 text-[11px] block">Opérationnel</span>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[10px]">Carte Bancaire</span>
                <h4 className="font-bold text-slate-900">Visa Business</h4>
                <p className="text-slate-500">•••• 4892 (Exp 08/27)</p>
                <span className="text-slate-400 text-[11px] block">Sécurisé 3D-Secure</span>
              </div>
            </div>
          </section>

          {/* ================= 6. SÉCURITÉ, AIDE & SUPPORT ================= */}
          <section id="securite" className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">shield</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Sécurité &amp; Support Vendeur</h2>
                <p className="text-xs text-slate-500">Assistance prioritaire 24/7 et protection du compte marchand</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900">Assistance Dispatch 24/7</h4>
                <p className="text-slate-500">Ligne directe avec un régulateur LivraLink pour tout problème sur une course.</p>
                <button
                  type="button"
                  onClick={() => showToast('Appel hotline dispatch LivraLink : 01 02 03 04', 'info')}
                  className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">call</span>
                  <span>Appeler le Dispatch</span>
                </button>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-900">Sécurité du compte</h4>
                <p className="text-slate-500">Authentification à deux facteurs (2FA) par code SMS activée sur le compte.</p>
                <button
                  type="button"
                  onClick={() => showToast('Paramètres de sécurité validés.', 'success')}
                  className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100"
                >
                  Gérer le mot de passe
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
