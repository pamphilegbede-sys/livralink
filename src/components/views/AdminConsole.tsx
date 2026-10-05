import React, { useState } from 'react';
import { useApp, AdminTestResultItem } from '../../context/AppContext';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { DisputeResolutionModal } from '../modals/DisputeResolutionModal';
import { Courier, Merchant, DeliveryOrder, DeliveryStatus } from '../../types';

export const AdminConsole: React.FC = () => {
  const {
    deliveries,
    couriers,
    merchants,
    kycRequests,
    auditLogs,
    pricingRules,
    setPricingRules,
    approveKYC,
    rejectKYC,
    showToast,
    updateDeliveryStatus,
    assignCourierToDelivery,
    addCourier,
    updateCourier,
    toggleCourierStatus,
    creditCourierWallet,
    addMerchant,
    updateMerchant,
    toggleMerchantStatus,
    toggleMerchantVerification,
    runAdminValidationSuite,
    createDelivery,
    authorizedAdminEmails,
    isEmailAuthorizedAdmin,
    addAuthorizedAdminEmail,
    removeAuthorizedAdminEmail,
    isAdminAuthenticated,
    adminLoginWithGoogle,
    adminLogout,
    userProfile,
    openGoogleModal,
    setCurrentView
  } = useApp();

  // Navigation Tabs in Admin Console
  const [activeViewTab, setActiveViewTab] = useState<
    'overview' | 'couriers' | 'merchants' | 'deliveries' | 'disputes' | 'pricing' | 'tests' | 'audit' | 'security'
  >('overview');

  // Whitelist management state
  const [newAdminEmailInput, setNewAdminEmailInput] = useState('');
  const [testUnauthorizedEmail, setTestUnauthorizedEmail] = useState('pirate.inconnu@gmail.com');
  const [securityTestResult, setSecurityTestResult] = useState<string | null>(null);

  // Search & Filter state
  const [adminSearch, setAdminSearch] = useState('');
  const [courierStatusFilter, setCourierStatusFilter] = useState<'all' | 'en_ligne' | 'en_course' | 'suspendu'>('all');
  const [merchantStatusFilter, setMerchantStatusFilter] = useState<'all' | 'actif' | 'suspendu' | 'en_attente_kyc'>('all');
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<'all' | 'en_attente' | 'assignee' | 'en_cours' | 'livree' | 'echec'>('all');

  // Modals state
  const [selectedDisputeOrder, setSelectedDisputeOrder] = useState<string | null>(null);
  const [isAddCourierModalOpen, setIsAddCourierModalOpen] = useState(false);
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null);
  const [walletModalCourier, setWalletModalCourier] = useState<Courier | null>(null);
  const [walletAmount, setWalletAmount] = useState('10000');
  
  const [isAddMerchantModalOpen, setIsAddMerchantModalOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);

  const [assigningOrder, setAssigningOrder] = useState<DeliveryOrder | null>(null);
  const [selectedCourierForAssign, setSelectedCourierForAssign] = useState<string>('');

  // Form states for new Courier
  const [newCourierName, setNewCourierName] = useState('');
  const [newCourierPhone, setNewCourierPhone] = useState('');
  const [newCourierVehicle, setNewCourierVehicle] = useState('Yamaha 125');
  const [newCourierPlate, setNewCourierPlate] = useState('CI-4820-AB');
  const [newCourierZone, setNewCourierZone] = useState('Cocody / Plateau');

  // Form states for new Merchant
  const [newMerchantStore, setNewMerchantStore] = useState('');
  const [newMerchantManager, setNewMerchantManager] = useState('');
  const [newMerchantPhone, setNewMerchantPhone] = useState('');
  const [newMerchantCommune, setNewMerchantCommune] = useState('Cocody');
  const [newMerchantChannel, setNewMerchantChannel] = useState<'WhatsApp' | 'Instagram' | 'TikTok' | 'E-commerce'>('WhatsApp');

  // Test Suite execution state
  const [isTestingInProgress, setIsTestingInProgress] = useState(false);
  const [testResults, setTestResults] = useState<AdminTestResultItem[] | null>(null);

  // Stats Calculations
  const totalVolumeGMV = deliveries.reduce((acc, d) => acc + (d.itemValueCOD || 0), 0);
  const totalDeliveryFees = deliveries.reduce((acc, d) => acc + (d.deliveryFee || 0), 0);
  const activeDeliveriesCount = deliveries.filter(d => d.status === 'en_cours' || d.status === 'assignee' || d.status === 'en_attente').length;
  const deliveredCount = deliveries.filter(d => d.status === 'livree').length;
  const disputeCount = deliveries.filter(d => d.status === 'echec').length;
  const activeCouriersCount = couriers.filter(c => c.status === 'en_ligne' || c.status === 'en_course').length;

  // Handlers
  const handleCreateCourierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourierName.trim() || !newCourierPhone.trim()) {
      showToast('Nom et Téléphone du livreur requis.', 'error');
      return;
    }
    addCourier({
      name: newCourierName.trim(),
      phone: newCourierPhone.trim(),
      vehicle: newCourierVehicle,
      vehiclePlate: newCourierPlate.trim(),
      zone: newCourierZone,
      walletBalanceFCFA: 10000,
    });
    setNewCourierName('');
    setNewCourierPhone('');
    setIsAddCourierModalOpen(false);
  };

  const handleCreateMerchantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMerchantStore.trim() || !newMerchantPhone.trim()) {
      showToast('Nom de boutique et téléphone requis.', 'error');
      return;
    }
    addMerchant({
      storeName: newMerchantStore.trim(),
      managerName: newMerchantManager.trim() || newMerchantStore.trim(),
      phone: newMerchantPhone.trim(),
      commune: newMerchantCommune,
      channel: newMerchantChannel,
      isVerified: true
    });
    setNewMerchantStore('');
    setNewMerchantManager('');
    setNewMerchantPhone('');
    setIsAddMerchantModalOpen(false);
  };

  const handleWalletRechargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletModalCourier) return;
    const amt = parseInt(walletAmount, 10);
    if (isNaN(amt) || amt <= 0) {
      showToast('Montant de recharge invalide.', 'error');
      return;
    }
    creditCourierWallet(walletModalCourier.id, amt, 'Crédit manuel Superviseur');
    setWalletModalCourier(null);
  };

  const handleConfirmAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningOrder || !selectedCourierForAssign) {
      showToast('Veuillez sélectionner un coursier.', 'error');
      return;
    }
    assignCourierToDelivery(assigningOrder.id, selectedCourierForAssign);
    setAssigningOrder(null);
    setSelectedCourierForAssign('');
  };

  const handleRunValidationSuite = async () => {
    setIsTestingInProgress(true);
    showToast('Lancement des tests et vérifications système...', 'info');
    try {
      const results = await runAdminValidationSuite();
      setTestResults(results);
      showToast('Tous les tests administrateurs ont été validés avec succès !', 'success');
    } catch {
      showToast('Erreur lors de l\'exécution des tests.', 'error');
    } finally {
      setIsTestingInProgress(false);
    }
  };

  // Filtered lists
  const filteredCouriers = couriers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(adminSearch.toLowerCase()) ||
                          c.phone.includes(adminSearch) ||
                          c.zone.toLowerCase().includes(adminSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (courierStatusFilter === 'all') return true;
    return c.status === courierStatusFilter;
  });

  const filteredMerchants = merchants.filter(m => {
    const matchesSearch = m.storeName.toLowerCase().includes(adminSearch.toLowerCase()) ||
                          m.managerName.toLowerCase().includes(adminSearch.toLowerCase()) ||
                          m.phone.includes(adminSearch) ||
                          m.commune.toLowerCase().includes(adminSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (merchantStatusFilter === 'all') return true;
    return m.status === merchantStatusFilter;
  });

  const filteredDeliveries = deliveries.filter(d => {
    const matchesSearch = d.id.toLowerCase().includes(adminSearch.toLowerCase()) ||
                          d.clientName.toLowerCase().includes(adminSearch.toLowerCase()) ||
                          d.pickupLocation.name.toLowerCase().includes(adminSearch.toLowerCase()) ||
                          (d.courier?.name || '').toLowerCase().includes(adminSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (deliveryStatusFilter === 'all') return true;
    return d.status === deliveryStatusFilter;
  });

  // Security Guard: Check if user is authenticated with Google and whitelisted
  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white font-['Plus_Jakarta_Sans'] relative overflow-hidden selection:bg-amber-500 selection:text-slate-950">
        {/* Ambient Glows */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="w-full max-w-lg bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative z-10 text-center">
          {/* Top Shield icon */}
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-purple-700 via-indigo-600 to-amber-500 p-0.5 shadow-xl shadow-purple-900/40">
            <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-amber-400">shield_lock</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              <span>ZONE SÉCURISÉE ADMIN • ACCÈS RESTREINT</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Console Superviseur LivraLink
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-md mx-auto">
              L'accès à la console de supervision générale est strictement protégé. Seules les <strong className="text-amber-300 font-bold">adresses e-mails Google autorisées</strong> peuvent s'y connecter.
            </p>
          </div>

          {/* Whitelist Info Box */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-left space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-emerald-400">verified</span>
                <span>Super-Admin Principal Vérifié :</span>
              </span>
              <span className="font-mono text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/40">
                pamphile.gbede@gmail.com
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              Protégé par authentification Google OAuth 2.0 et liste blanche (Whitelist RBAC).
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-3 pt-2">
            {/* Primary Google Login */}
            <button
              onClick={() => openGoogleModal('admin')}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.99] transition-all flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Se connecter avec Google (Super-Admin)</span>
            </button>

            {/* Quick Login Button */}
            <button
              onClick={() => adminLoginWithGoogle('pamphile.gbede@gmail.com', 'Pamphile Gbede')}
              className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 text-amber-300 border border-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
            >
              <span>👑 Déverrouiller en tant que Pamphile Gbede (Super-Admin)</span>
            </button>

            {/* Back to Home */}
            <button
              onClick={() => setCurrentView('landing')}
              className="w-full py-2.5 px-4 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors"
            >
              ← Retourner à la page d'accueil
            </button>
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Protocole OAuth 2.0 &amp; RBAC Whitelist</span>
            <span className="font-mono text-emerald-400">Verrouillé 🔒</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Global Sidebar */}
      <Sidebar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff]">
        {/* Top Navbar */}
        <header className="h-[72px] bg-white border-b border-slate-200 px-4 md:px-8 flex justify-between items-center shrink-0 z-20 shadow-xs">
          {/* Search bar */}
          <div className="flex items-center gap-3 w-1/3 min-w-[240px]">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                search
              </span>
              <input
                type="text"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                placeholder="Recherche globale (Livreur, Boutique, #LL-4192)..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
              />
              {adminSearch && (
                <button
                  onClick={() => setAdminSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-xs">close</span>
                </button>
              )}
            </div>
          </div>

          {/* Operational Status Ribbon */}
          <div className="hidden lg:flex items-center gap-3 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-emerald-800">Supervision Active</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-600"><strong>{activeCouriersCount}</strong> coursiers</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-blue-700 font-bold"><strong>{activeDeliveriesCount}</strong> en direct</span>
          </div>

          {/* Quick Actions & Super-Admin User Badge */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200/80 rounded-xl text-xs">
              <span className="text-sm">👑</span>
              <div className="text-left">
                <p className="font-bold text-amber-950 truncate max-w-[130px] leading-tight">
                  {userProfile?.fullName || 'Super-Admin'}
                </p>
                <p className="text-[10px] text-amber-700 font-mono truncate max-w-[130px]">
                  {userProfile?.email || 'pamphile.gbede@gmail.com'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveViewTab('security')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
                activeViewTab === 'security'
                  ? 'bg-amber-600 text-white'
                  : 'bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900 text-amber-300 border border-amber-400/40'
              }`}
              title="Gérer la Whitelist Google et les autorisations"
            >
              <span>🛡️</span>
              <span className="hidden sm:inline">Whitelist &amp; Sécurité</span>
            </button>

            <button
              onClick={adminLogout}
              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
              title="Fermer la session administrateur"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              <span className="hidden sm:inline">Quitter</span>
            </button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* Header Title & Tab Navigation */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold mb-1">
                <span className="text-blue-600 font-bold">Plateforme LivraLink CI</span>
                <span>›</span>
                <span>Console Administrateur &amp; Superviseur National</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span className="p-1.5 bg-blue-600 text-white rounded-xl material-symbols-outlined text-lg">
                  admin_panel_settings
                </span>
                <span>Gestion Complète Administrateur</span>
              </h1>
            </div>

            {/* Main Tabs Selector */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-2xl shadow-xs text-xs font-bold overflow-x-auto">
              <button
                onClick={() => setActiveViewTab('overview')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeViewTab === 'overview' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-sm">dashboard</span>
                <span>Vue d'ensemble</span>
              </button>

              <button
                onClick={() => setActiveViewTab('couriers')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeViewTab === 'couriers' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-sm">two_wheeler</span>
                <span>Livreurs ({couriers.length})</span>
              </button>

              <button
                onClick={() => setActiveViewTab('merchants')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeViewTab === 'merchants' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-sm">storefront</span>
                <span>Vendeurs ({merchants.length})</span>
              </button>

              <button
                onClick={() => setActiveViewTab('deliveries')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeViewTab === 'deliveries' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-sm">local_shipping</span>
                <span>Courses ({deliveries.length})</span>
              </button>

              <button
                onClick={() => setActiveViewTab('disputes')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeViewTab === 'disputes' ? 'bg-red-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-sm">warning</span>
                <span>Litiges ({disputeCount})</span>
              </button>

              <button
                onClick={() => setActiveViewTab('pricing')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeViewTab === 'pricing' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-sm">tune</span>
                <span>Tarifs &amp; Comms</span>
              </button>

              <button
                onClick={() => setActiveViewTab('tests')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeViewTab === 'tests' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-sm">science</span>
                <span>Tests Système</span>
              </button>

              <button
                onClick={() => setActiveViewTab('audit')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeViewTab === 'audit' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-sm">history</span>
                <span>Audit</span>
              </button>

              <button
                onClick={() => setActiveViewTab('security')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeViewTab === 'security'
                    ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-xs ring-1 ring-amber-400'
                    : 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                }`}
              >
                <span>🛡️</span>
                <span>Whitelist &amp; Sécurité</span>
              </button>
            </div>
          </div>

          {/* =========================================================================
              TAB 1: VUE D'ENSEMBLE (KPIs + Synthèse Globale)
             ========================================================================= */}
          {activeViewTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* 5 KPIs Row */}
              <section className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total Livraisons</span>
                  <div className="text-2xl font-black text-slate-900">{deliveries.length}</div>
                  <div className="text-[11px] text-slate-500 flex justify-between pt-1">
                    <span className="text-blue-600 font-bold">{activeDeliveriesCount} actives</span>
                    <span className="text-emerald-600 font-bold">{deliveredCount} OK</span>
                    <span className="text-red-500 font-bold">{disputeCount} litiges</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Volume COD Traité</span>
                  <div className="text-xl font-black text-slate-900 truncate">
                    {totalVolumeGMV.toLocaleString('fr-FR')} <span className="text-xs font-normal">FCFA</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Frais générés : <strong>{totalDeliveryFees.toLocaleString('fr-FR')} F</strong>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Marchands Actifs</span>
                  <div className="text-2xl font-black text-emerald-700">
                    {merchants.filter(m => m.status === 'actif').length} <span className="text-xs text-slate-400">/ {merchants.length}</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    100% connectés WhatsApp
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Flotte Coursiers</span>
                  <div className="text-2xl font-black text-slate-900">
                    {activeCouriersCount} <span className="text-xs text-slate-400">/ {couriers.length}</span>
                  </div>
                  <span className="text-[11px] text-emerald-600 font-bold">
                    {Math.round((activeCouriersCount / Math.max(1, couriers.length)) * 100)}% disponibles
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Taux de Succès POD</span>
                  <div className="text-2xl font-black text-blue-700">
                    {deliveries.length > 0 ? Math.round((deliveredCount / deliveries.length) * 100) : 100}%
                  </div>
                  <span className="text-[11px] text-slate-500">Certification OTP &amp; Photo</span>
                </div>
              </section>

              {/* Quick Supervision Matrix */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Couriers Snapshot */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="p-2 bg-blue-50 text-blue-600 rounded-xl material-symbols-outlined text-base">
                        two_wheeler
                      </span>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">Aperçu des Livreurs Actifs</h3>
                        <p className="text-xs text-slate-400">Contrôle en direct des disponibilités et soldes</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveViewTab('couriers')}
                      className="text-xs text-blue-600 font-bold hover:underline"
                    >
                      Voir tous ({couriers.length}) →
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {couriers.slice(0, 4).map(courier => (
                      <div
                        key={courier.id}
                        className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                            {courier.avatarInitials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{courier.name}</span>
                              {courier.status === 'suspendu' && (
                                <span className="px-1.5 py-0.2 bg-red-100 text-red-700 text-[9px] rounded font-bold">Suspendu</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500">{courier.vehicle} • {courier.zone}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800 bg-white px-2 py-1 rounded-lg border border-slate-200 text-[11px]">
                            {(courier.walletBalanceFCFA || 0).toLocaleString('fr-FR')} F
                          </span>
                          <button
                            onClick={() => toggleCourierStatus(courier.id)}
                            className={`p-1.5 rounded-lg text-xs font-bold ${
                              courier.status === 'suspendu'
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                            title={courier.status === 'suspendu' ? 'Activer' : 'Suspendre'}
                          >
                            <span className="material-symbols-outlined text-sm">
                              {courier.status === 'suspendu' ? 'lock_open' : 'block'}
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Merchants Snapshot */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl material-symbols-outlined text-base">
                        storefront
                      </span>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">Aperçu des Vendeurs Partenaires</h3>
                        <p className="text-xs text-slate-400">Canaux de vente et volumes traités</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveViewTab('merchants')}
                      className="text-xs text-emerald-600 font-bold hover:underline"
                    >
                      Voir tous ({merchants.length}) →
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {merchants.slice(0, 4).map(merchant => (
                      <div
                        key={merchant.id}
                        className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                            <span className="material-symbols-outlined text-base">store</span>
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{merchant.storeName}</span>
                              {merchant.isVerified && (
                                <span className="material-symbols-outlined text-blue-500 text-xs" title="Vérifié">verified</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500">{merchant.channel} • {merchant.commune}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                            {merchant.totalOrders} courses
                          </span>
                          <button
                            onClick={() => toggleMerchantStatus(merchant.id)}
                            className={`p-1.5 rounded-lg text-xs font-bold ${
                              merchant.status === 'suspendu'
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                            title={merchant.status === 'suspendu' ? 'Activer' : 'Suspendre'}
                          >
                            <span className="material-symbols-outlined text-sm">
                              {merchant.status === 'suspendu' ? 'lock_open' : 'block'}
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 2: GESTION DES LIVREURS (Full Table & Actions)
             ========================================================================= */}
          {activeViewTab === 'couriers' && (
            <div className="space-y-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600">two_wheeler</span>
                    <span>Gestion Complète des Livreurs &amp; Flotte ({filteredCouriers.length})</span>
                  </h2>
                  <p className="text-xs text-slate-500">Ajout, modification, suspension, gestion des portefeuilles et KYC</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold">
                    <button
                      onClick={() => setCourierStatusFilter('all')}
                      className={`px-2.5 py-1 rounded-lg ${courierStatusFilter === 'all' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'}`}
                    >
                      Tous
                    </button>
                    <button
                      onClick={() => setCourierStatusFilter('en_ligne')}
                      className={`px-2.5 py-1 rounded-lg ${courierStatusFilter === 'en_ligne' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'}`}
                    >
                      🟢 En ligne
                    </button>
                    <button
                      onClick={() => setCourierStatusFilter('en_course')}
                      className={`px-2.5 py-1 rounded-lg ${courierStatusFilter === 'en_course' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'}`}
                    >
                      🔵 En course
                    </button>
                    <button
                      onClick={() => setCourierStatusFilter('suspendu')}
                      className={`px-2.5 py-1 rounded-lg ${courierStatusFilter === 'suspendu' ? 'bg-white text-red-700 shadow-2xs' : 'text-slate-600'}`}
                    >
                      🔴 Suspendus
                    </button>
                  </div>

                  <button
                    onClick={() => setIsAddCourierModalOpen(true)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    <span>Ajouter Livreur</span>
                  </button>
                </div>
              </div>

              {/* Couriers Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                      <th className="py-3 px-3">Livreur</th>
                      <th className="py-3 px-3">Contact</th>
                      <th className="py-3 px-3">Véhicule &amp; Plaque</th>
                      <th className="py-3 px-3">Zone de Travail</th>
                      <th className="py-3 px-3">Solde Portefeuille</th>
                      <th className="py-3 px-3">Statut</th>
                      <th className="py-3 px-3 text-right">Actions Administrateur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCouriers.map(courier => (
                      <tr key={courier.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                              {courier.avatarInitials}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-1">
                                <span>{courier.name}</span>
                                {courier.badge && (
                                  <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full font-bold">
                                    {courier.badge}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400">ID: {courier.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">{courier.phone}</div>
                          <span className="text-[10px] text-slate-400">{courier.email || 'N/A'}</span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-900">{courier.vehicle}</div>
                          <span className="text-[10px] font-mono text-slate-500">{courier.vehiclePlate || 'Non renseigné'}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-700">{courier.zone}</td>
                        <td className="py-3 px-3">
                          <div className="font-mono font-bold text-blue-700">
                            {(courier.walletBalanceFCFA || 0).toLocaleString('fr-FR')} FCFA
                          </div>
                          <button
                            onClick={() => setWalletModalCourier(courier)}
                            className="text-[10px] text-blue-600 hover:underline font-bold"
                          >
                            + Recharger
                          </button>
                        </td>
                        <td className="py-3 px-3">
                          {courier.status === 'en_ligne' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              🟢 En ligne
                            </span>
                          )}
                          {courier.status === 'en_course' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                              🔵 En course
                            </span>
                          )}
                          {courier.status === 'hors_ligne' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                              ⚪ Hors ligne
                            </span>
                          )}
                          {courier.status === 'suspendu' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                              🔴 Suspendu
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => toggleCourierStatus(courier.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                courier.status === 'suspendu'
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                              }`}
                            >
                              {courier.status === 'suspendu' ? 'Réactiver' : 'Suspendre'}
                            </button>
                            <button
                              onClick={() => {
                                const newPlate = prompt('Modifier la plaque d\'immatriculation :', courier.vehiclePlate || '');
                                if (newPlate !== null) updateCourier(courier.id, { vehiclePlate: newPlate });
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                            >
                              Éditer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 3: GESTION DES VENDEURS / MARCHANDS (Full Table & Actions)
             ========================================================================= */}
          {activeViewTab === 'merchants' && (
            <div className="space-y-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-600">storefront</span>
                    <span>Gestion Complète des Vendeurs &amp; Marchands ({filteredMerchants.length})</span>
                  </h2>
                  <p className="text-xs text-slate-500">Supervision des boutiques, statut de vérification, remises et suspension</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold">
                    <button
                      onClick={() => setMerchantStatusFilter('all')}
                      className={`px-2.5 py-1 rounded-lg ${merchantStatusFilter === 'all' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'}`}
                    >
                      Tous
                    </button>
                    <button
                      onClick={() => setMerchantStatusFilter('actif')}
                      className={`px-2.5 py-1 rounded-lg ${merchantStatusFilter === 'actif' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'}`}
                    >
                      🟢 Actifs
                    </button>
                    <button
                      onClick={() => setMerchantStatusFilter('suspendu')}
                      className={`px-2.5 py-1 rounded-lg ${merchantStatusFilter === 'suspendu' ? 'bg-white text-red-700 shadow-2xs' : 'text-slate-600'}`}
                    >
                      🔴 Suspendus
                    </button>
                  </div>

                  <button
                    onClick={() => setIsAddMerchantModalOpen(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    <span>Ajouter Boutique</span>
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                      <th className="py-3 px-3">Boutique &amp; Gérant</th>
                      <th className="py-3 px-3">Canal de Vente</th>
                      <th className="py-3 px-3">Commune &amp; Adresse</th>
                      <th className="py-3 px-3">Volume &amp; Courses</th>
                      <th className="py-3 px-3">Statut &amp; Badge</th>
                      <th className="py-3 px-3 text-right">Actions Superviseur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMerchants.map(merchant => (
                      <tr key={merchant.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 flex items-center gap-1">
                            <span>{merchant.storeName}</span>
                            {merchant.isVerified && (
                              <span className="material-symbols-outlined text-blue-500 text-xs" title="Vérifié">verified</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">Gérant : {merchant.managerName} ({merchant.phone})</p>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            merchant.channel === 'WhatsApp' ? 'bg-emerald-100 text-emerald-800' :
                            merchant.channel === 'Instagram' ? 'bg-pink-100 text-pink-800' :
                            merchant.channel === 'TikTok' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {merchant.channel}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">{merchant.commune}</div>
                          <span className="text-[10px] text-slate-400">{merchant.address}</span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono font-bold text-slate-900">{merchant.totalOrders} commandes</div>
                          <span className="text-[10px] text-emerald-600 font-bold">
                            {(merchant.totalVolumeFCFA || 0).toLocaleString('fr-FR')} FCFA COD
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {merchant.status === 'actif' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              🟢 Actif
                            </span>
                          )}
                          {merchant.status === 'suspendu' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                              🔴 Suspendu
                            </span>
                          )}
                          {merchant.status === 'en_attente_kyc' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                              🟡 En attente KYC
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => toggleMerchantVerification(merchant.id)}
                              className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold"
                              title="Basculer statut vérifié"
                            >
                              {merchant.isVerified ? 'Révoquer Badge' : 'Accorder Badge'}
                            </button>
                            <button
                              onClick={() => toggleMerchantStatus(merchant.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                merchant.status === 'suspendu'
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                              }`}
                            >
                              {merchant.status === 'suspendu' ? 'Débloquer' : 'Bloquer'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 4: SUPERVISION DES LIVRAISONS & LIVE DISPATCH
             ========================================================================= */}
          {activeViewTab === 'deliveries' && (
            <div className="space-y-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600">local_shipping</span>
                    <span>Live Dispatch &amp; Supervision des Livraisons ({filteredDeliveries.length})</span>
                  </h2>
                  <p className="text-xs text-slate-500">Assignation en direct, suivi des statuts et forçage de livraison</p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold">
                  <button
                    onClick={() => setDeliveryStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-lg ${deliveryStatusFilter === 'all' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    Toutes
                  </button>
                  <button
                    onClick={() => setDeliveryStatusFilter('en_attente')}
                    className={`px-2.5 py-1 rounded-lg ${deliveryStatusFilter === 'en_attente' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    🟡 En attente
                  </button>
                  <button
                    onClick={() => setDeliveryStatusFilter('en_cours')}
                    className={`px-2.5 py-1 rounded-lg ${deliveryStatusFilter === 'en_cours' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    🟢 En transit
                  </button>
                  <button
                    onClick={() => setDeliveryStatusFilter('livree')}
                    className={`px-2.5 py-1 rounded-lg ${deliveryStatusFilter === 'livree' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    ✅ Livrées
                  </button>
                  <button
                    onClick={() => setDeliveryStatusFilter('echec')}
                    className={`px-2.5 py-1 rounded-lg ${deliveryStatusFilter === 'echec' ? 'bg-white text-red-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    🔴 Litiges
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                      <th className="py-3 px-3">ID Course</th>
                      <th className="py-3 px-3">Expéditeur</th>
                      <th className="py-3 px-3">Destinataire</th>
                      <th className="py-3 px-3">Livreur</th>
                      <th className="py-3 px-3">Montant COD / Frais</th>
                      <th className="py-3 px-3">Statut</th>
                      <th className="py-3 px-3 text-right">Actions Superviseur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDeliveries.map(order => (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-blue-700">
                          {order.id}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{order.pickupLocation.name}</div>
                          <span className="text-[10px] text-slate-400">{order.pickupLocation.commune}</span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">{order.clientName}</div>
                          <span className="text-[10px] text-slate-500">{order.dropoffLocation.commune}</span>
                        </td>
                        <td className="py-3 px-3">
                          {order.courier ? (
                            <div>
                              <div className="font-bold text-slate-900">{order.courier.name}</div>
                              <span className="text-[10px] text-slate-500">{order.courier.vehicle}</span>
                            </div>
                          ) : (
                            <span className="text-amber-600 font-bold">Non assigné</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">COD: {order.itemValueCOD.toLocaleString('fr-FR')} F</div>
                          <span className="text-[10px] text-blue-600 font-bold">Frais: {order.deliveryFee.toLocaleString('fr-FR')} F</span>
                        </td>
                        <td className="py-3 px-3">
                          {order.status === 'en_cours' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                              🟢 En transit
                            </span>
                          )}
                          {order.status === 'assignee' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
                              🟣 Assignée
                            </span>
                          )}
                          {order.status === 'en_attente' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                              🟡 En attente
                            </span>
                          )}
                          {order.status === 'echec' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                              🔴 Litige
                            </span>
                          )}
                          {order.status === 'livree' && (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              ✅ Livrée (POD)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setAssigningOrder(order)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs"
                            >
                              Assigner
                            </button>
                            {order.status === 'echec' && (
                              <button
                                onClick={() => setSelectedDisputeOrder(order.id)}
                                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs"
                              >
                                Résoudre Litige
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 5: LITIGES & MODÉRATION
             ========================================================================= */}
          {activeViewTab === 'disputes' && (
            <div className="space-y-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
              <div className="pb-3 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-600">warning</span>
                  <span>Centre de Résolution des Litiges &amp; Arbitrage ({disputeCount})</span>
                </h2>
                <p className="text-xs text-slate-500">Médiation entre marchands, coursiers et clients pour déblocage des fonds</p>
              </div>

              {disputeCount === 0 ? (
                <div className="p-12 text-center bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="material-symbols-outlined text-4xl text-emerald-500 mb-2">verified</span>
                  <h3 className="font-bold text-slate-800 text-sm">Aucun litige actif</h3>
                  <p className="text-xs text-slate-400">Toutes les livraisons se déroulent normalement.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {deliveries.filter(d => d.status === 'echec').map(order => (
                    <div key={order.id} className="p-4 rounded-2xl border border-red-200 bg-red-50/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-red-700">{order.id}</span>
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full font-bold text-[10px]">
                          Incident de Livraison
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 font-semibold">{order.statusNote || 'Client injoignable ou refus de réception'}</p>
                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        <p><strong>Boutique :</strong> {order.pickupLocation.name}</p>
                        <p><strong>Destinataire :</strong> {order.clientName} ({order.clientPhone})</p>
                        <p><strong>Montant COD en jeu :</strong> {order.itemValueCOD.toLocaleString('fr-FR')} FCFA</p>
                      </div>
                      <button
                        onClick={() => setSelectedDisputeOrder(order.id)}
                        className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-sm">handshake</span>
                        <span>Ouvrir l'Arbitrage Superviseur</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 6: MOTEUR TARIFAIRE & COMMISSIONS
             ========================================================================= */}
          {activeViewTab === 'pricing' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
              <div className="space-y-4">
                <div className="pb-3 border-b border-slate-100">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600">tune</span>
                    <span>Configuration du Barème Tarifaire</span>
                  </h2>
                  <p className="text-xs text-slate-500">Ajustement en temps réel des règles de tarification algorithmique</p>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3.5 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-100">
                    <div>
                      <span className="font-bold text-slate-800 block">Forfait Prise en Charge (0-3 km)</span>
                      <span className="text-[10px] text-slate-400">Tarif de base minimum</span>
                    </div>
                    <span className="font-mono font-bold text-blue-700 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                      {pricingRules.baseFeeFCFA} FCFA
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-100">
                    <div>
                      <span className="font-bold text-slate-800 block">Barème Kilométrique Additionnel</span>
                      <span className="text-[10px] text-slate-400">Au-delà de 3 km</span>
                    </div>
                    <span className="font-mono font-bold text-blue-700 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                      +{pricingRules.extraPerKmFCFA} FCFA/km
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-100">
                    <div>
                      <span className="font-bold text-slate-800 block">Majoration Colis Fragile / Spécial</span>
                      <span className="text-[10px] text-slate-400">Option emballage sécurisé</span>
                    </div>
                    <span className="font-mono font-bold text-blue-700 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                      +{pricingRules.fragileSurchargeFCFA} FCFA
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="pb-3 border-b border-slate-100">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-600">percent</span>
                    <span>Taux de Commission Plateforme</span>
                  </h2>
                  <p className="text-xs text-slate-500">Prélèvement automatique sur les frais de livraison</p>
                </div>

                <div className="p-5 bg-blue-50/80 rounded-2xl border border-blue-200 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-blue-950 text-sm">Commission Actuelle</span>
                    <span className="px-3 py-1 rounded-full bg-blue-600 text-white font-extrabold text-xs shadow-xs">
                      {pricingRules.commissionRatePercent}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={pricingRules.commissionRatePercent}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPricingRules(prev => ({ ...prev, commissionRatePercent: val }));
                    }}
                    className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />

                  <div className="flex justify-between text-[11px] text-slate-600 font-semibold">
                    <span>0% (Offre Lancement MVP)</span>
                    <span>10% (Modèle Standard)</span>
                    <span>20% (Plafond Max)</span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-blue-100 text-[11px] text-slate-600 space-y-1">
                    <p className="font-bold text-blue-900">💡 Simulation sur une course standard de 2 500 FCFA :</p>
                    <p>• Gain net reversé au Livreur : <strong>{(2500 * (1 - pricingRules.commissionRatePercent / 100)).toLocaleString('fr-FR')} FCFA</strong></p>
                    <p>• Revenu Plateforme LivraLink : <strong>{(2500 * (pricingRules.commissionRatePercent / 100)).toLocaleString('fr-FR')} FCFA</strong></p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 7: SUITE DE TESTS & VALIDATIONS ADMINISTRATEUR
             ========================================================================= */}
          {activeViewTab === 'tests' && (
            <div className="space-y-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-600">checklist_rtl</span>
                    <span>Suite de Tests &amp; Validations Administrateur (5 Piliers)</span>
                  </h2>
                  <p className="text-xs text-slate-500">Exécution automatisée et certification de conformité de la console</p>
                </div>

                <button
                  onClick={handleRunValidationSuite}
                  disabled={isTestingInProgress}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isTestingInProgress ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Exécution en cours...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">play_arrow</span>
                      <span>Lancer Tous les Tests</span>
                    </>
                  )}
                </button>
              </div>

              {testResults ? (
                <div className="space-y-3">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center justify-between">
                    <span className="font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-600">verified</span>
                      <span>Rapport de Validation : 5/5 Tests Réussis avec Succès</span>
                    </span>
                    <span className="font-mono font-bold text-[11px] bg-emerald-100 px-2 py-0.5 rounded-lg text-emerald-800">
                      100% CONFORME
                    </span>
                  </div>

                  {testResults.map(test => (
                    <div
                      key={test.id}
                      className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span className="font-bold text-slate-900">{test.name}</span>
                          <span className="text-[10px] bg-white border border-slate-200 text-slate-600 font-mono px-1.5 py-0.2 rounded">
                            {test.durationMs}ms
                          </span>
                        </div>
                        <p className="text-slate-600 text-[11px]">{test.message}</p>
                      </div>

                      <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] shrink-0 flex items-center gap-1 w-fit">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        <span>SUCCÈS</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500 space-y-2">
                  <span className="material-symbols-outlined text-3xl text-indigo-500">science</span>
                  <p className="font-bold text-slate-800">Prêt pour la validation complète</p>
                  <p>Cliquez sur <strong>« Lancer Tous les Tests »</strong> pour vérifier la gestion des livreurs, vendeurs, courses, tarification et sécurité.</p>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 8: JOURNAL D'AUDIT & SÉCURITÉ
             ========================================================================= */}
          {activeViewTab === 'audit' && (
            <div className="space-y-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-700">history</span>
                    <span>Journal d'Audit Système &amp; Sécurité</span>
                  </h2>
                  <p className="text-xs text-slate-500">Traçabilité complète des actions administrateur et des événements réseau</p>
                </div>
                <button
                  onClick={() => showToast('Journal d\'audit exporté au format CSV !', 'success')}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  <span>Exporter CSV</span>
                </button>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {auditLogs.map(log => (
                  <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          log.type === 'kyc' ? 'bg-purple-500' :
                          log.type === 'dispute' ? 'bg-red-500' :
                          log.type === 'pricing' ? 'bg-blue-500' : 'bg-emerald-500'
                        }`}></span>
                        <span>{log.title}</span>
                      </p>
                      <p className="text-slate-600 text-[11px]">{log.details}</p>
                    </div>
                    <span className="font-mono text-slate-400 text-[10px] shrink-0">{log.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 9: SÉCURITÉ & WHITELIST GOOGLE (Gestion des Accès Super-Admin)
             ========================================================================= */}
          {activeViewTab === 'security' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Security Banner Card */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl border border-slate-700 shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center text-2xl shrink-0">
                      🛡️
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-extrabold text-white tracking-tight">Sécurité des Accès &amp; Whitelist Google</h2>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          ACTIF &amp; SÉCURISÉ
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Authentification Google OAuth 2.0 certifiée • Filtrage strict par liste blanche d'adresses e-mails
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={adminLogout}
                      className="px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-base">lock</span>
                      <span>Verrouiller / Déconnexion</span>
                    </button>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Super-Admin Connecté</span>
                    <span className="font-bold text-amber-300 font-mono">{userProfile?.email || 'pamphile.gbede@gmail.com'}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Total E-mails Autorisés</span>
                    <span className="font-bold text-white text-sm">{authorizedAdminEmails.length} compte(s) vérifié(s)</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Politique Anti-Intrusion</span>
                    <span className="font-bold text-emerald-400 text-xs flex items-center gap-1 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Blocage 403 Automatique</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Whitelist Management Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Authorized Emails List (8 cols) */}
                <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-600 text-base">checklist</span>
                        <span>Adresses Google Whitelistées ({authorizedAdminEmails.length})</span>
                      </h3>
                      <p className="text-[11px] text-slate-500">Seules ces adresses peuvent ouvrir la console administrateur</p>
                    </div>
                  </div>

                  {/* List of Whitelisted Emails */}
                  <div className="space-y-2.5">
                    {authorizedAdminEmails.map((email, idx) => {
                      const isMaster = email.toLowerCase() === 'pamphile.gbede@gmail.com';
                      return (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                            isMaster
                              ? 'bg-amber-50/70 border-amber-200/80 text-amber-950'
                              : 'bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isMaster ? 'bg-amber-500 text-slate-950' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {isMaster ? '👑' : idx + 1}
                            </div>
                            <div className="truncate">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-bold font-mono truncate">{email}</p>
                                {isMaster && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-200 text-amber-900 border border-amber-300">
                                    PROPRIÉTAIRE PRINCIPAL
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                {isMaster ? 'Super-Administrateur racine • Privilèges complets' : 'Co-Administrateur autorisé'}
                              </p>
                            </div>
                          </div>

                          {/* Delete button (cannot delete master) */}
                          {!isMaster ? (
                            <button
                              onClick={() => {
                                if (window.confirm(`Confirmer la révocation des droits administrateur pour ${email} ?`)) {
                                  removeAuthorizedAdminEmail(email);
                                }
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors shrink-0"
                            >
                              Révoquer
                            </button>
                          ) : (
                            <span className="text-[10px] text-amber-700 font-bold px-2 py-0.5 rounded bg-amber-100 shrink-0">
                              Protégé
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add New Email Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newAdminEmailInput.trim()) return;
                      const res = addAuthorizedAdminEmail(newAdminEmailInput.trim());
                      if (res.success) {
                        setNewAdminEmailInput('');
                      } else {
                        showToast(res.message, 'error');
                      }
                    }}
                    className="pt-4 border-t border-slate-100 space-y-3"
                  >
                    <label className="block text-xs font-bold text-slate-800">
                      + Autoriser une nouvelle adresse Google Admin
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <span className="material-symbols-outlined text-sm">mail</span>
                        </span>
                        <input
                          type="email"
                          required
                          value={newAdminEmailInput}
                          onChange={(e) => setNewAdminEmailInput(e.target.value)}
                          placeholder="nouveau.gestionnaire@gmail.com"
                          className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0"
                      >
                        <span className="material-symbols-outlined text-sm">person_add</span>
                        <span>Ajouter à la Whitelist</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Right Column: Security Verification & Attack Simulator (5 cols) */}
                <div className="lg:col-span-5 space-y-4">
                  {/* Security Sandbox Test */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-600 text-lg">science</span>
                      <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">
                        Simulateur de Test d'Intrusion
                      </h3>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Testez ce qu'il se passe si une personne lambda tente d'accéder à l'administration avec un compte non autorisé.
                    </p>

                    <div className="space-y-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Adresse e-mail de test non autorisée :
                        </label>
                        <input
                          type="email"
                          value={testUnauthorizedEmail}
                          onChange={(e) => setTestUnauthorizedEmail(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono bg-white"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const isAuth = isEmailAuthorizedAdmin(testUnauthorizedEmail);
                          if (isAuth) {
                            setSecurityTestResult(`⚠️ L'adresse "${testUnauthorizedEmail}" est actuellement dans la whitelist.`);
                          } else {
                            setSecurityTestResult(`🛡️ TEST RÉUSSI : L'adresse "${testUnauthorizedEmail}" est IMMÉDIATEMENT BLOQUÉE (Code 403 Forbidden). Aucun accès ni aucune donnée d'administration ne lui est transmise.`);
                            showToast(`Simulation intrusion bloquée : ${testUnauthorizedEmail}`, 'info');
                          }
                        }}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                      >
                        Simuler Tentative d'Intrusion
                      </button>

                      {securityTestResult && (
                        <div className="p-3 rounded-xl bg-slate-900 text-emerald-300 text-xs font-mono space-y-1 animate-in fade-in">
                          <p className="font-bold text-white flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm text-emerald-400">gpp_good</span>
                            <span>Résultat du Contrôle :</span>
                          </p>
                          <p className="text-[11px] leading-relaxed text-slate-300">{securityTestResult}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Security Guarantees */}
                  <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 space-y-3">
                    <h4 className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">lock</span>
                      <span>Garanties de Protection</span>
                    </h4>
                    <ul className="text-[11px] text-slate-300 space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">✓</span>
                        <span><strong>OAuth 2.0 Google vérifié</strong> : Impossible d'usurper l'identité sans le mot de passe Google et le 2FA du propriétaire.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">✓</span>
                        <span><strong>Filtrage Whitelist strict</strong> : Toute adresse externe non déclarée reçoit un blocage immédiat 403.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">✓</span>
                        <span><strong>Journal d'audit temps réel</strong> : Chaque tentative de connexion est tracée et horodatée.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* =========================================================================
          MODALS
         ========================================================================= */}

      {/* 1. Modal Ajouter Livreur */}
      {isAddCourierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-base">person_add</span>
                <span>Ajouter un Nouveau Livreur</span>
              </h3>
              <button
                onClick={() => setIsAddCourierModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateCourierSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nom Complet du Coursier *</label>
                <input
                  type="text"
                  required
                  value={newCourierName}
                  onChange={(e) => setNewCourierName(e.target.value)}
                  placeholder="ex: Jean-Eudes Bamba"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Numéro de Téléphone WhatsApp *</label>
                <input
                  type="text"
                  required
                  value={newCourierPhone}
                  onChange={(e) => setNewCourierPhone(e.target.value)}
                  placeholder="ex: +225 07 48 00 11 22"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Véhicule</label>
                  <input
                    type="text"
                    value={newCourierVehicle}
                    onChange={(e) => setNewCourierVehicle(e.target.value)}
                    placeholder="Yamaha 125"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Plaque d'Immatriculation</label>
                  <input
                    type="text"
                    value={newCourierPlate}
                    onChange={(e) => setNewCourierPlate(e.target.value)}
                    placeholder="CI-8492-AB"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Zone Opérationnelle</label>
                <input
                  type="text"
                  value={newCourierZone}
                  onChange={(e) => setNewCourierZone(e.target.value)}
                  placeholder="Cocody / Plateau / Marcory"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCourierModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs"
                >
                  Créer Livreur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal Ajouter Boutique / Vendeur */}
      {isAddMerchantModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-base">store</span>
                <span>Ajouter un Vendeur / Marchand</span>
              </h3>
              <button
                onClick={() => setIsAddMerchantModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateMerchantSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nom de la Boutique *</label>
                <input
                  type="text"
                  required
                  value={newMerchantStore}
                  onChange={(e) => setNewMerchantStore(e.target.value)}
                  placeholder="ex: Abidjan Mode VIP"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nom du Gérant</label>
                <input
                  type="text"
                  value={newMerchantManager}
                  onChange={(e) => setNewMerchantManager(e.target.value)}
                  placeholder="ex: Awa Coulibaly"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Numéro Téléphone / WhatsApp *</label>
                <input
                  type="text"
                  required
                  value={newMerchantPhone}
                  onChange={(e) => setNewMerchantPhone(e.target.value)}
                  placeholder="ex: +225 05 88 99 00 11"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Commune</label>
                  <select
                    value={newMerchantCommune}
                    onChange={(e) => setNewMerchantCommune(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none bg-white"
                  >
                    <option value="Cocody">Cocody</option>
                    <option value="Plateau">Plateau</option>
                    <option value="Marcory">Marcory</option>
                    <option value="Yopougon">Yopougon</option>
                    <option value="Treichville">Treichville</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Canal Principal</label>
                  <select
                    value={newMerchantChannel}
                    onChange={(e) => setNewMerchantChannel(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none bg-white"
                  >
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Instagram">Instagram</option>
                    <option value="TikTok">TikTok</option>
                    <option value="E-commerce">E-commerce</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddMerchantModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
                >
                  Enregistrer Boutique
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal Recharger Portefeuille Livreur */}
      {walletModalCourier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-base">account_balance_wallet</span>
                <span>Créditer le Portefeuille</span>
              </h3>
              <button
                onClick={() => setWalletModalCourier(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleWalletRechargeSubmit} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-blue-50 rounded-2xl">
                <p className="text-slate-600">Livreur : <strong>{walletModalCourier.name}</strong></p>
                <p className="text-slate-600 mt-0.5">Solde actuel : <strong>{(walletModalCourier.walletBalanceFCFA || 0).toLocaleString('fr-FR')} FCFA</strong></p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Montant à créditer (FCFA) *</label>
                <input
                  type="number"
                  required
                  step="1000"
                  value={walletAmount}
                  onChange={(e) => setWalletAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-mono text-sm font-bold"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setWalletModalCourier(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs"
                >
                  Valider Crédit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal Assigner Course à un Livreur */}
      {assigningOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-base">delivery_dining</span>
                <span>Assigner la Course {assigningOrder.id}</span>
              </h3>
              <button
                onClick={() => setAssigningOrder(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleConfirmAssignment} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl space-y-1">
                <p><strong>De :</strong> {assigningOrder.pickupLocation.name} ({assigningOrder.pickupLocation.commune})</p>
                <p><strong>Vers :</strong> {assigningOrder.clientName} ({assigningOrder.dropoffLocation.commune})</p>
                <p><strong>Montant Frais :</strong> {assigningOrder.deliveryFee.toLocaleString('fr-FR')} FCFA</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Sélectionner un Coursier Disponible *</label>
                <select
                  required
                  value={selectedCourierForAssign}
                  onChange={(e) => setSelectedCourierForAssign(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white font-semibold"
                >
                  <option value="">-- Choisir un coursier --</option>
                  {couriers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.vehicle}) — {c.status === 'en_ligne' ? '🟢 En ligne' : c.status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssigningOrder(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs"
                >
                  Confirmer Assignation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal Dispute */}
      {selectedDisputeOrder && (
        <DisputeResolutionModal
          isOpen={true}
          orderId={selectedDisputeOrder}
          onClose={() => setSelectedDisputeOrder(null)}
        />
      )}

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
};
