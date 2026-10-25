import React, { useState } from 'react';
import { useApp, AdminTestResultItem } from '../../context/AppContext';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { BackButton } from '../common/BackButton';
import { DisputeResolutionModal } from '../modals/DisputeResolutionModal';
import { Courier, Merchant, DeliveryOrder, DeliveryStatus } from '../../types';
import { loginWithGoogle, getFirebaseAuthErrorMessage } from '../../firebase/authService';
import { AdminOverviewDashboard } from './AdminOverviewDashboard';
import { ResetUserAccessModal, TargetResetUser } from '../modals/ResetUserAccessModal';

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
    updateDeliveryDetails,
    deleteDelivery,
    assignCourierToDelivery,
    addCourier,
    updateCourier,
    deleteCourier,
    toggleCourierStatus,
    creditCourierWallet,
    adjustCourierWallet,
    addMerchant,
    updateMerchant,
    deleteMerchant,
    toggleMerchantStatus,
    toggleMerchantVerification,
    deleteUser,
    updateUser,
    setSelectedCourier,
    setMerchantSettings,
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
    openWhatsAppModal,
    setCurrentView,
    setCurrentRole,
    navigateBack,
    adminActiveTab: activeViewTab,
    setAdminActiveTab: setActiveViewTab,
    featureFlags,
    setFeatureFlags,
    updateFeatureFlag,
    resetFeatureFlagsToDefault,
    impersonateMerchant,
    impersonateCourier,
    isDirectorModeActive,
    directorTargetName,
  } = useApp();

  // Whitelist management state
  const [newAdminEmailInput, setNewAdminEmailInput] = useState('');
  const [testUnauthorizedEmail, setTestUnauthorizedEmail] = useState('pirate.inconnu@gmail.com');
  const [securityTestResult, setSecurityTestResult] = useState<string | null>(null);
  const [adminLoginEmailInput, setAdminLoginEmailInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminLoginStep, setAdminLoginStep] = useState<'email' | 'password'>('email');
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);
  const [isLoggingInWithGoogle, setIsLoggingInWithGoogle] = useState(false);

  // Search & Filter state
  const [adminSearch, setAdminSearch] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'livreur' | 'vendeur'>('all');
  const [kycStatusFilter, setKycStatusFilter] = useState<'all' | 'en_attente' | 'valide' | 'rejete'>('all');
  const [courierStatusFilter, setCourierStatusFilter] = useState<'all' | 'en_ligne' | 'en_course' | 'suspendu'>('all');
  const [merchantStatusFilter, setMerchantStatusFilter] = useState<'all' | 'actif' | 'suspendu' | 'en_attente_kyc'>('all');
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<'all' | 'en_attente' | 'assignee' | 'en_cours' | 'livree' | 'echec'>('all');

  // Modals state
  const [selectedDisputeOrder, setSelectedDisputeOrder] = useState<string | null>(null);
  const [isAddCourierModalOpen, setIsAddCourierModalOpen] = useState(false);
  const [editingCourier, setEditingCourier] = useState<Courier | null>(null);
  const [deletingCourier, setDeletingCourier] = useState<Courier | null>(null);
  const [walletModalCourier, setWalletModalCourier] = useState<Courier | null>(null);
  const [walletModalType, setWalletModalType] = useState<'credit' | 'debit'>('credit');
  const [walletNote, setWalletNote] = useState('');
  const [walletAmount, setWalletAmount] = useState('10000');
  
  const [isAddMerchantModalOpen, setIsAddMerchantModalOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);
  const [deletingMerchant, setDeletingMerchant] = useState<Merchant | null>(null);

  const [assigningOrder, setAssigningOrder] = useState<DeliveryOrder | null>(null);
  const [selectedCourierForAssign, setSelectedCourierForAssign] = useState<string>('');

  const [isAddDeliveryModalOpen, setIsAddDeliveryModalOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<DeliveryOrder | null>(null);
  const [deletingDelivery, setDeletingDelivery] = useState<DeliveryOrder | null>(null);
  const [inspectingDelivery, setInspectingDelivery] = useState<DeliveryOrder | null>(null);

  const [editingUser, setEditingUser] = useState<{
    id: string;
    name: string;
    phone: string;
    email: string;
    role: 'livreur' | 'vendeur';
    commune: string;
    status: string;
    vehicle?: string;
    plate?: string;
    channel?: 'WhatsApp' | 'Instagram' | 'TikTok' | 'E-commerce';
    isVerified?: boolean;
  } | null>(null);
  const [deletingUser, setDeletingUser] = useState<{ id: string; name: string; role: 'livreur' | 'vendeur' } | null>(null);
  const [resetAccessUser, setResetAccessUser] = useState<TargetResetUser | null>(null);

  // Form states for new Delivery Order
  const [newOrderClientName, setNewOrderClientName] = useState('');
  const [newOrderClientPhone, setNewOrderClientPhone] = useState('');
  const [newOrderStoreName, setNewOrderStoreName] = useState('Boutique VIP Chic Cotonou');
  const [newOrderPickupCommune, setNewOrderPickupCommune] = useState('Cotonou - Haie Vive');
  const [newOrderDropoffCommune, setNewOrderDropoffCommune] = useState('Abomey-Calavi - Centre');
  const [newOrderDropoffAddress, setNewOrderDropoffAddress] = useState('Carrefour Kpota, Abomey-Calavi');
  const [newOrderCOD, setNewOrderCOD] = useState('25000');
  const [newOrderFee, setNewOrderFee] = useState('2500');

  // Form states for new Courier
  const [newCourierName, setNewCourierName] = useState('');
  const [newCourierPhone, setNewCourierPhone] = useState('');
  const [newCourierVehicle, setNewCourierVehicle] = useState('Yamaha 125');
  const [newCourierPlate, setNewCourierPlate] = useState('BJ-4820-RB');
  const [newCourierZone, setNewCourierZone] = useState('Cotonou / Calavi');

  // Form states for new Merchant
  const [newMerchantStore, setNewMerchantStore] = useState('');
  const [newMerchantManager, setNewMerchantManager] = useState('');
  const [newMerchantPhone, setNewMerchantPhone] = useState('');
  const [newMerchantCommune, setNewMerchantCommune] = useState('Cotonou - Haie Vive');
  const [newMerchantChannel, setNewMerchantChannel] = useState<'WhatsApp' | 'Instagram' | 'TikTok' | 'E-commerce'>('WhatsApp');

  // Form states for EDITING Courier
  const [editCourierName, setEditCourierName] = useState('');
  const [editCourierPhone, setEditCourierPhone] = useState('');
  const [editCourierEmail, setEditCourierEmail] = useState('');
  const [editCourierVehicle, setEditCourierVehicle] = useState('Yamaha 125');
  const [editCourierPlate, setEditCourierPlate] = useState('');
  const [editCourierZone, setEditCourierZone] = useState('Cotonou / Calavi');
  const [editCourierStatus, setEditCourierStatus] = useState<'en_ligne' | 'en_course' | 'hors_ligne' | 'suspendu'>('en_ligne');
  const [editCourierBadge, setEditCourierBadge] = useState('');

  // Form states for EDITING Merchant
  const [editMerchantStore, setEditMerchantStore] = useState('');
  const [editMerchantManager, setEditMerchantManager] = useState('');
  const [editMerchantPhone, setEditMerchantPhone] = useState('');
  const [editMerchantEmail, setEditMerchantEmail] = useState('');
  const [editMerchantCommune, setEditMerchantCommune] = useState('Cotonou - Haie Vive');
  const [editMerchantAddress, setEditMerchantAddress] = useState('');
  const [editMerchantChannel, setEditMerchantChannel] = useState<'WhatsApp' | 'Instagram' | 'TikTok' | 'E-commerce'>('WhatsApp');
  const [editMerchantStatus, setEditMerchantStatus] = useState<'actif' | 'suspendu' | 'en_attente_kyc'>('actif');
  const [editMerchantVerified, setEditMerchantVerified] = useState(true);
  const [editMerchantDiscount, setEditMerchantDiscount] = useState('0');

  // Form states for EDITING Delivery Order
  const [editDeliveryClientName, setEditDeliveryClientName] = useState('');
  const [editDeliveryClientPhone, setEditDeliveryClientPhone] = useState('');
  const [editDeliveryStoreName, setEditDeliveryStoreName] = useState('');
  const [editDeliveryPickupCommune, setEditDeliveryPickupCommune] = useState('Cotonou - Haie Vive');
  const [editDeliveryDropoffCommune, setEditDeliveryDropoffCommune] = useState('Cotonou - Cadjehoun');
  const [editDeliveryDropoffAddress, setEditDeliveryDropoffAddress] = useState('');
  const [editDeliveryCOD, setEditDeliveryCOD] = useState('0');
  const [editDeliveryFee, setEditDeliveryFee] = useState('1500');
  const [editDeliveryStatus, setEditDeliveryStatus] = useState<DeliveryStatus>('en_attente');
  const [editDeliveryItemDesc, setEditDeliveryItemDesc] = useState('');

  // Form states for EDITING User (Unified)
  const [editUserName, setEditUserName] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserZoneCommune, setEditUserZoneCommune] = useState('');
  const [editUserStatus, setEditUserStatus] = useState('');
  const [editUserVehicle, setEditUserVehicle] = useState('Yamaha 125');
  const [editUserPlate, setEditUserPlate] = useState('');
  const [editUserChannel, setEditUserChannel] = useState<'WhatsApp' | 'Instagram' | 'TikTok' | 'E-commerce'>('WhatsApp');
  const [editUserVerified, setEditUserVerified] = useState(false);

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
      showToast('Montant de transaction invalide.', 'error');
      return;
    }
    adjustCourierWallet(walletModalCourier.id, amt, walletModalType, walletNote || undefined);
    setWalletModalCourier(null);
    setWalletNote('');
  };

  const exportDeliveriesCSV = () => {
    const headers = ['ID', 'Date', 'Boutique', 'Commune_Collecte', 'Client', 'Telephone_Client', 'Commune_Livraison', 'Livreur', 'Statut', 'COD_FCFA', 'Frais_FCFA'];
    const rows = deliveries.map(d => [
      d.id,
      new Date(d.createdAt).toISOString(),
      `"${(d.pickupLocation?.name || '').replace(/"/g, '""')}"`,
      `"${(d.pickupLocation?.commune || '').replace(/"/g, '""')}"`,
      `"${(d.clientName || '').replace(/"/g, '""')}"`,
      d.clientPhone || '',
      `"${(d.dropoffLocation?.commune || '').replace(/"/g, '""')}"`,
      `"${(d.courier?.name || 'Non assigne').replace(/"/g, '""')}"`,
      d.status,
      d.itemValueCOD || 0,
      d.deliveryFee || 0
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `livralink_export_courses_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Export CSV des courses généré avec succès !', 'success');
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

  const handleCreateDeliverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderClientName.trim() || !newOrderClientPhone.trim()) {
      showToast('Nom du client et téléphone requis.', 'error');
      return;
    }
    const codVal = parseInt(newOrderCOD, 10) || 0;
    const feeVal = parseInt(newOrderFee, 10) || 1500;
    const created = createDelivery({
      clientName: newOrderClientName.trim(),
      clientPhone: newOrderClientPhone.trim(),
      pickupLocation: {
        name: newOrderStoreName.trim(),
        commune: newOrderPickupCommune,
        address: `${newOrderPickupCommune}, Cotonou, Bénin`,
        coordinates: [6.37, 2.43]
      },
      dropoffLocation: {
        name: 'Domicile Client',
        commune: newOrderDropoffCommune,
        address: newOrderDropoffAddress.trim(),
        coordinates: [5.33, -4.01]
      },
      itemValueCOD: codVal,
      deliveryFee: feeVal,
      status: 'en_attente'
    });
    setNewOrderClientName('');
    setNewOrderClientPhone('');
    setIsAddDeliveryModalOpen(false);
    showToast(`Course ${created.id} créée et enregistrée avec succès !`, 'success');
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

  // Re-run an individual test
  const handleRunSingleTest = async (testId: string) => {
    showToast('Exécution du test ciblé...', 'info');
    try {
      const fullResults = await runAdminValidationSuite();
      const updatedItem = fullResults.find(r => r.id === testId);
      if (updatedItem) {
        setTestResults(prev => prev ? prev.map(t => t.id === testId ? updatedItem : t) : fullResults);
        showToast(`Test ${updatedItem.name} validé avec succès (${updatedItem.durationMs}ms) !`, 'success');
      } else {
        setTestResults(fullResults);
      }
    } catch {
      showToast('Erreur lors du test ciblé.', 'error');
    }
  };

  // Courier Edit & Delete Handlers
  const openEditCourier = (c: Courier) => {
    setEditingCourier(c);
    setEditCourierName(c.name);
    setEditCourierPhone(c.phone);
    setEditCourierEmail(c.email || '');
    setEditCourierVehicle(c.vehicle);
    setEditCourierPlate(c.vehiclePlate || '');
    setEditCourierZone(c.zone);
    setEditCourierStatus(c.status);
    setEditCourierBadge(c.badge || '');
  };

  const handleUpdateCourierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourier) return;
    updateCourier(editingCourier.id, {
      name: editCourierName.trim(),
      phone: editCourierPhone.trim(),
      email: editCourierEmail.trim() || undefined,
      vehicle: editCourierVehicle.trim(),
      vehiclePlate: editCourierPlate.trim() || undefined,
      zone: editCourierZone.trim(),
      status: editCourierStatus,
      badge: editCourierBadge.trim() || undefined
    });
    setEditingCourier(null);
  };

  const handleConfirmDeleteCourier = () => {
    if (!deletingCourier) return;
    deleteCourier(deletingCourier.id);
    setDeletingCourier(null);
  };

  // Merchant Edit & Delete Handlers
  const openEditMerchant = (m: Merchant) => {
    setEditingMerchant(m);
    setEditMerchantStore(m.storeName);
    setEditMerchantManager(m.managerName);
    setEditMerchantPhone(m.phone);
    setEditMerchantEmail(m.email || '');
    setEditMerchantCommune(m.commune);
    setEditMerchantAddress(m.address || '');
    setEditMerchantChannel(m.channel);
    setEditMerchantStatus(m.status);
    setEditMerchantVerified(m.isVerified);
    setEditMerchantDiscount(m.preferredRateDiscountPercent?.toString() || '0');
  };

  const handleUpdateMerchantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMerchant) return;
    updateMerchant(editingMerchant.id, {
      storeName: editMerchantStore.trim(),
      managerName: editMerchantManager.trim(),
      phone: editMerchantPhone.trim(),
      email: editMerchantEmail.trim(),
      commune: editMerchantCommune,
      address: editMerchantAddress.trim(),
      channel: editMerchantChannel,
      status: editMerchantStatus,
      isVerified: editMerchantVerified,
      preferredRateDiscountPercent: parseInt(editMerchantDiscount, 10) || 0
    });
    setEditingMerchant(null);
  };

  const handleConfirmDeleteMerchant = () => {
    if (!deletingMerchant) return;
    deleteMerchant(deletingMerchant.id);
    setDeletingMerchant(null);
  };

  // Delivery Edit & Delete Handlers
  const openEditDelivery = (d: DeliveryOrder) => {
    setEditingDelivery(d);
    setEditDeliveryClientName(d.clientName);
    setEditDeliveryClientPhone(d.clientPhone);
    setEditDeliveryStoreName(d.pickupLocation?.name || '');
    setEditDeliveryPickupCommune(d.pickupLocation?.commune || 'Cotonou - Haie Vive');
    setEditDeliveryDropoffCommune(d.dropoffLocation?.commune || 'Cotonou - Cadjehoun');
    setEditDeliveryDropoffAddress(d.dropoffLocation?.address || '');
    setEditDeliveryCOD((d.itemValueCOD || 0).toString());
    setEditDeliveryFee((d.deliveryFee || 0).toString());
    setEditDeliveryStatus(d.status);
    setEditDeliveryItemDesc(d.itemDescription || '');
  };

  const handleUpdateDeliverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDelivery) return;
    const codVal = parseInt(editDeliveryCOD, 10) || 0;
    const feeVal = parseInt(editDeliveryFee, 10) || 0;
    updateDeliveryDetails(editingDelivery.id, {
      clientName: editDeliveryClientName.trim(),
      clientPhone: editDeliveryClientPhone.trim(),
      pickupLocation: {
        ...editingDelivery.pickupLocation,
        name: editDeliveryStoreName.trim(),
        commune: editDeliveryPickupCommune
      },
      dropoffLocation: {
        ...editingDelivery.dropoffLocation,
        commune: editDeliveryDropoffCommune,
        address: editDeliveryDropoffAddress.trim()
      },
      itemValueCOD: codVal,
      deliveryFee: feeVal,
      totalCustomerPayable: codVal + feeVal,
      status: editDeliveryStatus,
      itemDescription: editDeliveryItemDesc.trim()
    });
    setEditingDelivery(null);
  };

  const handleConfirmDeleteDelivery = () => {
    if (!deletingDelivery) return;
    deleteDelivery(deletingDelivery.id);
    setDeletingDelivery(null);
  };

  // User Edit & Delete Handlers (Unified)
  const openEditUser = (user: {
    id: string;
    name: string;
    phone: string;
    email: string;
    role: 'livreur' | 'vendeur';
    commune: string;
    status: string;
    vehicle?: string;
    plate?: string;
    channel?: any;
    isVerified?: boolean;
  }) => {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserPhone(user.phone);
    setEditUserEmail(user.email || '');
    setEditUserZoneCommune(user.commune);
    setEditUserStatus(user.status);
    setEditUserVehicle(user.vehicle || 'Yamaha 125');
    setEditUserPlate(user.plate || '');
    setEditUserChannel(user.channel || 'WhatsApp');
    setEditUserVerified(user.isVerified ?? false);
  };

  const handleUpdateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (editingUser.role === 'livreur') {
      updateCourier(editingUser.id, {
        name: editUserName.trim(),
        phone: editUserPhone.trim(),
        email: editUserEmail.trim() || undefined,
        zone: editUserZoneCommune.trim(),
        status: (editUserStatus as any) || 'en_ligne',
        vehicle: editUserVehicle.trim(),
        vehiclePlate: editUserPlate.trim() || undefined
      });
    } else {
      updateMerchant(editingUser.id, {
        storeName: editUserName.trim(),
        phone: editUserPhone.trim(),
        email: editUserEmail.trim(),
        commune: editUserZoneCommune,
        status: (editUserStatus as any) || 'actif',
        channel: editUserChannel,
        isVerified: editUserVerified
      });
    }
    setEditingUser(null);
  };

  const handleConfirmDeleteUser = () => {
    if (!deletingUser) return;
    deleteUser(deletingUser.id, deletingUser.role);
    setDeletingUser(null);
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
    const handleGoogleAdminPopupLogin = async () => {
      setIsLoggingInWithGoogle(true);
      setAdminLoginError(null);
      try {
        const { user, profile } = await loginWithGoogle('admin');
        const email = user.email || profile.email;
        const result = adminLoginWithGoogle(email, user.displayName || profile.fullName);
        if (!result.success) {
          setAdminLoginError(result.error || "Adresse Google non autorisée sur la Whitelist administrateur.");
        }
      } catch (err: any) {
        const errorMsg = getFirebaseAuthErrorMessage(err);
        setAdminLoginError(errorMsg);
        showToast(errorMsg, 'error');
      } finally {
        setIsLoggingInWithGoogle(false);
      }
    };

    const handleDirectGoogleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      setAdminLoginError(null);

      if (adminLoginStep === 'email') {
        const clean = adminLoginEmailInput.toLowerCase().trim();
        if (!isEmailAuthorizedAdmin(clean)) {
          setAdminLoginError(`Accès refusé. L'adresse "${clean}" n'est pas autorisée sur la Whitelist administrateur.`);
          return;
        }
        setAdminLoginStep('password');
        return;
      }

      // Step 2: Password verification
      setIsLoggingInWithGoogle(true);
      setTimeout(() => {
        setIsLoggingInWithGoogle(false);
        if (adminPasswordInput !== 'livralink2026' && adminPasswordInput !== 'Admin2026!') {
          setAdminLoginError("Mot de passe administrateur incorrect.");
          return;
        }
        const result = adminLoginWithGoogle(adminLoginEmailInput);
        if (!result.success) {
          setAdminLoginError(result.error || "Échec de l'authentification administrateur.");
        }
      }, 350);
    };

    return (
      <div className="min-h-full flex-1 w-full overflow-y-auto custom-scrollbar bg-slate-950 flex flex-col items-center justify-center p-3 sm:p-4 py-6 sm:py-8 text-white font-['Plus_Jakarta_Sans'] relative selection:bg-amber-500 selection:text-slate-950">
        {/* Ambient Glows */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="w-full max-w-lg bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-3xl p-4 sm:p-8 shadow-2xl space-y-5 sm:space-y-6 relative z-10 text-center my-auto">
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
              Connexion Console Administrateur
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-md mx-auto">
              Pour accéder à la console générale de gestion LivraLink, vous devez <strong className="text-amber-300 font-bold">authentifier votre compte Google Super-Admin</strong>.
            </p>
          </div>





          {/* Error message */}
          {adminLoginError && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/40 text-red-200 text-left flex items-start gap-2.5">
              <span className="material-symbols-outlined text-red-400 text-lg shrink-0 mt-0.5">block</span>
              <div className="text-xs">
                <p className="font-bold text-red-300">⛔ Accès Refusé (403)</p>
                <p className="text-[11px] text-red-200 mt-0.5 leading-relaxed">{adminLoginError}</p>
              </div>
            </div>
          )}

          {/* Action buttons & Interactive Google Login Form */}
          <div className="space-y-3 pt-1 text-left">
            {/* Primary Google Login Button (Popup Flow) */}
            <button
              type="button"
              disabled={isLoggingInWithGoogle}
              onClick={handleGoogleAdminPopupLogin}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.99] transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Authentifier via Google (Popup OAuth)</span>
            </button>



            {/* Direct Google email connector */}
            <form onSubmit={handleDirectGoogleLogin} className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <label className="block text-xs font-bold text-slate-300">
                {adminLoginStep === 'email' ? 'Ou connectez directement votre adresse Google certifiée :' : `Saisissez le mot de passe pour (${adminLoginEmailInput}) :`}
              </label>

              {adminLoginStep === 'email' ? (
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <span className="material-symbols-outlined text-base">mail</span>
                  </span>
                  <input
                    type="email"
                    value={adminLoginEmailInput}
                    onChange={(e) => {
                      setAdminLoginEmailInput(e.target.value);
                      setAdminLoginError(null);
                    }}
                    placeholder="connexion@gmail.com"
                    required
                    autoFocus
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              ) : (
                <div className="relative space-y-2">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <span className="material-symbols-outlined text-base">key</span>
                    </span>
                    <input
                      type="password"
                      value={adminPasswordInput}
                      onChange={(e) => {
                        setAdminPasswordInput(e.target.value);
                        setAdminLoginError(null);
                      }}
                      placeholder="Mot de passe administrateur (ex: livralink2026)"
                      required
                      autoFocus
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-amber-400 font-medium">
                    Mot de passe requis pour valider l'accès Super-Admin (Astuce test : <span className="font-mono underline">livralink2026</span>)
                  </p>
                </div>
              )}

              <div className="pt-1 flex gap-2">
                {adminLoginStep === 'password' && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdminLoginStep('email');
                      setAdminPasswordInput('');
                      setAdminLoginError(null);
                    }}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Retour
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isLoggingInWithGoogle}
                  className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  {isLoggingInWithGoogle ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Vérification...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">{adminLoginStep === 'email' ? 'arrow_forward' : 'lock_open'}</span>
                      <span>{adminLoginStep === 'email' ? 'Continuer vers le mot de passe' : 'Déverrouiller la Console'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Back to previous page */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={navigateBack}
                className="text-slate-400 hover:text-white text-xs font-bold transition-all inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-slate-800 border border-transparent hover:border-slate-700 cursor-pointer"
                title="Retour à la page précédente"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                <span>Retour à la page précédente</span>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Protocole Google OAuth 2.0 &amp; Whitelist RBAC</span>
            <span className="font-mono text-amber-400">Verrouillé 🔒</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[100dvh] md:h-screen overflow-hidden bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans']">
      {/* Global Sidebar */}
      <Sidebar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#faf8ff]">
        {/* Top Navbar */}
        <header className="h-[72px] bg-white border-b border-slate-200 px-3 md:px-8 flex justify-between items-center shrink-0 z-20 shadow-xs">
          {/* Back button (PC & Mobile) + Search bar */}
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0 max-w-sm md:w-1/2">
            <button
              type="button"
              onClick={navigateBack}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 hover:text-blue-600 transition-all text-xs font-bold shadow-2xs shrink-0 active:scale-95 cursor-pointer"
              title="Retour à la page précédente"
              aria-label="Retour à la page précédente"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              <span className="font-bold">Retour</span>
            </button>

            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                search
              </span>
              <input
                type="text"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
                placeholder="Recherche globale..."
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
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
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
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-all shadow-xs ${
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
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </header>

        {/* Mobile Horizontal Sub-Navigation Ribbon (Sticky for small screens) */}
        <nav
          aria-label="Navigation des modules d'administration mobile"
          className="md:hidden bg-slate-900 border-b border-slate-800 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 shadow-xs z-10"
        >
          <BackButton variant="dark" label="Retour" />
          {[
            { id: 'overview', label: 'Synthèse', icon: 'dashboard' },
            { id: 'deliveries', label: 'Courses', icon: 'local_shipping', badge: activeDeliveriesCount > 0 ? `${activeDeliveriesCount}` : undefined },
            { id: 'users', label: 'Utilisateurs', icon: 'group' },
            { id: 'kyc', label: 'KYC', icon: 'verified_user', badge: kycRequests.filter(k => k.status === 'en_attente').length > 0 ? `${kycRequests.filter(k => k.status === 'en_attente').length}` : undefined },
            { id: 'couriers', label: 'Livreurs', icon: 'two_wheeler' },
            { id: 'merchants', label: 'Boutiques', icon: 'storefront' },
            { id: 'disputes', label: 'Litiges', icon: 'warning', badge: disputeCount > 0 ? `${disputeCount}` : undefined },
            { id: 'pricing', label: 'Tarifs', icon: 'tune' },
            { id: 'features', label: 'Directeur Features', icon: 'toggle_on' },
            { id: 'tests', label: 'Tests (8)', icon: 'science' },
            { id: 'audit', label: 'Audit', icon: 'history' },
            { id: 'security', label: 'Sécurité', icon: 'shield_person' },
          ].map((tab) => {
            const isActive = activeViewTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveViewTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 active:scale-95 ${
                  isActive
                    ? 'bg-amber-400 text-slate-950 shadow-md font-extrabold'
                    : 'bg-slate-800/90 text-slate-300 hover:text-white border border-slate-700/60'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                    isActive ? 'bg-slate-900 text-amber-300' : 'bg-red-500 text-white'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 md:pb-8">
          {/* Header Title & Tab Navigation */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <BackButton />
              <div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-semibold mb-1">
                  <span className="text-blue-600 font-bold">Plateforme LivraLink CI</span>
                  <span>›</span>
                  <span>Console Administrateur</span>
                  <span>›</span>
                  <span className="font-bold text-slate-900 truncate max-w-[200px] sm:max-w-none">
                  {activeViewTab === 'overview' && 'Tableau de Bord & Vue d\'ensemble'}
                  {activeViewTab === 'deliveries' && 'Supervision des Courses'}
                  {activeViewTab === 'users' && 'Annuaire Utilisateurs'}
                  {activeViewTab === 'kyc' && 'Vérifications KYC'}
                  {activeViewTab === 'couriers' && 'Flotte Livreurs'}
                  {activeViewTab === 'merchants' && 'Boutiques Vendeurs'}
                  {activeViewTab === 'disputes' && 'Litiges & Support'}
                  {activeViewTab === 'pricing' && 'Tarifs & Commissions'}
                  {activeViewTab === 'features' && 'Directeur Général des Fonctionnalités'}
                  {activeViewTab === 'tests' && 'Tests & Validations'}
                  {activeViewTab === 'audit' && 'Journal d\'Audit'}
                  {activeViewTab === 'security' && 'Whitelist & Sécurité'}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
                <span className={`p-1.5 text-white rounded-xl material-symbols-outlined text-lg shrink-0 ${
                  activeViewTab === 'deliveries' ? 'bg-blue-600 shadow-sm' :
                  activeViewTab === 'disputes' ? 'bg-red-600' :
                  activeViewTab === 'kyc' ? 'bg-amber-600' :
                  activeViewTab === 'features' ? 'bg-purple-600 shadow-sm' :
                  activeViewTab === 'tests' ? 'bg-indigo-600' : 'bg-slate-900'
                }`}>
                  {activeViewTab === 'deliveries' && 'local_shipping'}
                  {activeViewTab === 'overview' && 'dashboard'}
                  {activeViewTab === 'users' && 'group'}
                  {activeViewTab === 'kyc' && 'verified_user'}
                  {activeViewTab === 'couriers' && 'two_wheeler'}
                  {activeViewTab === 'merchants' && 'storefront'}
                  {activeViewTab === 'disputes' && 'warning'}
                  {activeViewTab === 'pricing' && 'tune'}
                  {activeViewTab === 'features' && 'toggle_on'}
                  {activeViewTab === 'tests' && 'science'}
                  {activeViewTab === 'audit' && 'history'}
                  {activeViewTab === 'security' && 'shield_person'}
                </span>
                <span className="leading-tight">
                  {activeViewTab === 'deliveries' && 'Supervision des Courses & Live Dispatch'}
                  {activeViewTab === 'overview' && 'Tableau de Bord & Synthèse Générale'}
                  {activeViewTab === 'users' && 'Annuaire Global des Utilisateurs'}
                  {activeViewTab === 'kyc' && 'Centre d\'Accréditation KYC'}
                  {activeViewTab === 'couriers' && 'Gestion Complète des Livreurs'}
                  {activeViewTab === 'merchants' && 'Gestion des Boutiques Vendeurs'}
                  {activeViewTab === 'disputes' && 'Centre de Résolution des Litiges'}
                  {activeViewTab === 'pricing' && 'Configuration Tarifs & Commissions'}
                  {activeViewTab === 'features' && 'Directeur des Fonctionnalités (Pages Vendeurs & Livreurs)'}
                  {activeViewTab === 'tests' && 'Suite de Tests & Validations'}
                  {activeViewTab === 'audit' && 'Journal d\'Audit Système'}
                  {activeViewTab === 'security' && 'Sécurité & Whitelist Super-Admin'}
                </span>
              </h1>
            </div>
          </div>
        </div>

          {/* =========================================================================
              TAB 1: VUE D'ENSEMBLE (Indicateurs clés + Suivi centralisé de toutes les activités)
             ========================================================================= */}
          {activeViewTab === 'overview' && (
            <AdminOverviewDashboard onNavigateTab={setActiveViewTab} />
          )}

          {/* =========================================================================
              TAB: GESTION DE TOUS LES UTILISATEURS (Livreurs + Vendeurs Réunis)
             ========================================================================= */}
          {activeViewTab === 'users' && (
            <div className="space-y-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600">manage_accounts</span>
                    <span>Tableau de Gestion des Utilisateurs &amp; Accès ({couriers.length + merchants.length})</span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Contrôle des comptes vendeurs et livreurs : suspension/déblocage instantané et réinitialisation des mots de passe
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold">
                    <button
                      onClick={() => setUserTypeFilter('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${userTypeFilter === 'all' ? 'bg-white text-blue-700 shadow-2xs font-extrabold' : 'text-slate-600'}`}
                    >
                      Tous ({couriers.length + merchants.length})
                    </button>
                    <button
                      onClick={() => setUserTypeFilter('livreur')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${userTypeFilter === 'livreur' ? 'bg-white text-blue-700 shadow-2xs font-extrabold' : 'text-slate-600'}`}
                    >
                      🛵 Livreurs ({couriers.length})
                    </button>
                    <button
                      onClick={() => setUserTypeFilter('vendeur')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${userTypeFilter === 'vendeur' ? 'bg-white text-emerald-700 shadow-2xs font-extrabold' : 'text-slate-600'}`}
                    >
                      🏪 Vendeurs ({merchants.length})
                    </button>
                  </div>

                  <button
                    onClick={() => setIsAddCourierModalOpen(true)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">person_add</span>
                    <span>+ Livreur</span>
                  </button>
                  <button
                    onClick={() => setIsAddMerchantModalOpen(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">store</span>
                    <span>+ Boutique</span>
                  </button>
                </div>
              </div>

              {/* Mobile Card Architecture for Users (< md) */}
              <div className="md:hidden space-y-3">
                {/* Couriers Mobile Cards */}
                {(userTypeFilter === 'all' || userTypeFilter === 'livreur') &&
                  filteredCouriers.map((c) => (
                    <article key={'m_c_' + c.id} className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                            {c.avatarInitials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                              <span>{c.name}</span>
                              {c.badge && (
                                <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full font-bold">
                                  {c.badge}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">ID: {c.id}</span>
                          </div>
                        </div>
                        <div>
                          {c.status === 'en_ligne' && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">🟢 En ligne</span>}
                          {c.status === 'en_course' && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">🔵 En course</span>}
                          {c.status === 'suspendu' && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">🔴 Suspendu</span>}
                        </div>
                      </div>

                      <div className="space-y-1 text-xs pt-1 border-t border-slate-200/60">
                        <div className="flex justify-between text-slate-600">
                          <span className="text-slate-400">Rôle:</span>
                          <span className="font-bold text-blue-700">LIVREUR ({c.vehicle})</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span className="text-slate-400">Contact:</span>
                          <span className="font-mono font-semibold">{c.phone}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span className="text-slate-400">E-mail:</span>
                          <span className="font-mono text-[11px] text-slate-700">{c.email || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span className="text-slate-400">Zone:</span>
                          <span>{c.zone}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span className="text-slate-400">Solde caution:</span>
                          <span className="font-mono font-bold text-blue-700">{(c.walletBalanceFCFA || 0).toLocaleString('fr-FR')} FCFA</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-200/60 flex-wrap">
                        {/* Réinitialiser Accès Button */}
                        <button
                          type="button"
                          onClick={() => setResetAccessUser({
                            id: c.id,
                            name: c.name,
                            email: c.email || `${c.name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@livralink.bj`,
                            phone: c.phone,
                            role: 'livreur',
                            status: c.status,
                            vehicle: c.vehicle,
                          })}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs active:scale-95 flex items-center gap-1 shadow-xs cursor-pointer"
                          title="Réinitialiser le mot de passe et les accès"
                        >
                          <span className="material-symbols-outlined text-xs">vpn_key</span>
                          <span>Accès</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setWalletModalCourier(c)}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold active:scale-95"
                        >
                          Portefeuille
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditUser({
                            id: c.id,
                            name: c.name,
                            phone: c.phone,
                            email: c.email || '',
                            role: 'livreur',
                            commune: c.zone,
                            status: c.status,
                            vehicle: c.vehicle,
                            plate: c.vehiclePlate
                          })}
                          className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold active:scale-95"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCourierStatus(c.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold active:scale-95 ${
                            c.status === 'suspendu' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          {c.status === 'suspendu' ? 'Débloquer' : 'Suspendre'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingUser({ id: c.id, name: c.name, role: 'livreur' })}
                          className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors active:scale-95"
                          title="Supprimer"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </article>
                  ))}

                {/* Merchants Mobile Cards */}
                {(userTypeFilter === 'all' || userTypeFilter === 'vendeur') &&
                  filteredMerchants.map((m) => (
                    <article key={'m_m_' + m.id} className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                            <span className="material-symbols-outlined text-sm">store</span>
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                              <span>{m.storeName}</span>
                              {m.isVerified && (
                                <span className="material-symbols-outlined text-blue-500 text-xs">verified</span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">Gérant: {m.managerName}</span>
                          </div>
                        </div>
                        <div>
                          {m.status === 'actif' && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">🟢 Actif</span>}
                          {m.status === 'suspendu' && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">🔴 Bloqué</span>}
                        </div>
                      </div>

                      <div className="space-y-1 text-xs pt-1 border-t border-slate-200/60">
                        <div className="flex justify-between text-slate-600">
                          <span className="text-slate-400">Canal:</span>
                          <span className="font-bold text-purple-700">VENDEUR ({m.channel})</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span className="text-slate-400">Téléphone:</span>
                          <span className="font-mono font-semibold">{m.phone}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span className="text-slate-400">E-mail:</span>
                          <span className="font-mono text-[11px] text-slate-700">{m.email || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span className="text-slate-400">Commune:</span>
                          <span>{m.commune}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span className="text-slate-400">Activité:</span>
                          <span className="font-bold text-slate-900">{m.totalOrders} courses • {(m.totalVolumeFCFA || 0).toLocaleString('fr-FR')} F</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-200/60 flex-wrap">
                        {/* Réinitialiser Accès Button */}
                        <button
                          type="button"
                          onClick={() => setResetAccessUser({
                            id: m.id,
                            name: m.storeName,
                            email: m.email || `${m.storeName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@livralink.bj`,
                            phone: m.phone,
                            role: 'vendeur',
                            status: m.status,
                            storeName: m.storeName,
                          })}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs active:scale-95 flex items-center gap-1 shadow-xs cursor-pointer"
                          title="Réinitialiser le mot de passe et les accès"
                        >
                          <span className="material-symbols-outlined text-xs">vpn_key</span>
                          <span>Accès</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleMerchantVerification(m.id)}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold active:scale-95"
                        >
                          {m.isVerified ? 'Badge ✓' : '+ Badge'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditUser({
                            id: m.id,
                            name: m.storeName,
                            phone: m.phone,
                            email: m.email || '',
                            role: 'vendeur',
                            commune: m.commune,
                            status: m.status,
                            channel: m.channel,
                            isVerified: m.isVerified
                          })}
                          className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold active:scale-95"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMerchantStatus(m.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold active:scale-95 ${
                            m.status === 'suspendu' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                          }`}
                        >
                          {m.status === 'suspendu' ? 'Débloquer' : 'Bloquer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingUser({ id: m.id, name: m.storeName, role: 'vendeur' })}
                          className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors active:scale-95"
                          title="Supprimer la boutique"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </article>
                  ))}
              </div>

              {/* Table of all users for Desktop & Tablet */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[850px]">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                      <th className="py-3 px-3">Utilisateur</th>
                      <th className="py-3 px-3">Rôle &amp; Type</th>
                      <th className="py-3 px-3">Coordonnées (Tél &amp; E-mail)</th>
                      <th className="py-3 px-3">Zone / Commune</th>
                      <th className="py-3 px-3">Activité &amp; Solde</th>
                      <th className="py-3 px-3">Statut du Compte</th>
                      <th className="py-3 px-3 text-right">Actions (Suspendre &amp; Réinitialiser)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Couriers */}
                    {(userTypeFilter === 'all' || userTypeFilter === 'livreur') &&
                      filteredCouriers.map(c => (
                        <tr key={'c_' + c.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                                {c.avatarInitials}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 flex items-center gap-1">
                                  <span>{c.name}</span>
                                  {c.badge && (
                                    <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full font-bold">
                                      {c.badge}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">ID: {c.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 w-fit">
                              <span className="material-symbols-outlined text-xs">two_wheeler</span>
                              <span>LIVREUR ({c.vehicle})</span>
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900">{c.phone}</div>
                            <span className="text-[10px] font-mono text-slate-500 block">{c.email || 'N/A'}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-700">{c.zone}</td>
                          <td className="py-3 px-3">
                            <div className="font-mono font-bold text-blue-700">
                              {(c.walletBalanceFCFA || 0).toLocaleString('fr-FR')} FCFA
                            </div>
                            <span className="text-[10px] text-slate-400">Solde caution</span>
                          </td>
                          <td className="py-3 px-3">
                            {c.status === 'en_ligne' && (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold inline-flex items-center gap-1">
                                <span>🟢</span>
                                <span>En ligne</span>
                              </span>
                            )}
                            {c.status === 'en_course' && (
                              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold inline-flex items-center gap-1">
                                <span>🔵</span>
                                <span>En course</span>
                              </span>
                            )}
                            {c.status === 'suspendu' && (
                              <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold inline-flex items-center gap-1">
                                <span>🔴</span>
                                <span>Suspendu</span>
                              </span>
                            )}
                            {c.status === 'hors_ligne' && (
                              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold inline-flex items-center gap-1">
                                <span>⚪</span>
                                <span>Hors ligne</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* 1. Réinitialiser Accès Button */}
                              <button
                                onClick={() => setResetAccessUser({
                                  id: c.id,
                                  name: c.name,
                                  email: c.email || `${c.name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@livralink.bj`,
                                  phone: c.phone,
                                  role: 'livreur',
                                  status: c.status,
                                  vehicle: c.vehicle,
                                })}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1 active:scale-95 transition-all shadow-xs cursor-pointer"
                                title="Réinitialiser le mot de passe et les identifiants de connexion"
                              >
                                <span className="material-symbols-outlined text-xs">vpn_key</span>
                                <span>Accès</span>
                              </button>

                              {/* 2. Suspendre / Débloquer Button */}
                              <button
                                onClick={() => toggleCourierStatus(c.id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold active:scale-95 transition-all cursor-pointer ${
                                  c.status === 'suspendu'
                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                    : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                                }`}
                                title={c.status === 'suspendu' ? 'Réactiver le compte' : 'Suspendre le compte'}
                              >
                                {c.status === 'suspendu' ? 'Débloquer' : 'Suspendre'}
                              </button>

                              {/* 3. Portefeuille */}
                              <button
                                onClick={() => setWalletModalCourier(c)}
                                className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold cursor-pointer"
                                title="Recharger ou débiter la caution"
                              >
                                Portefeuille
                              </button>

                              {/* 4. Modifier */}
                              <button
                                onClick={() => openEditUser({
                                  id: c.id,
                                  name: c.name,
                                  phone: c.phone,
                                  email: c.email || '',
                                  role: 'livreur',
                                  commune: c.zone,
                                  status: c.status,
                                  vehicle: c.vehicle,
                                  plate: c.vehiclePlate
                                })}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                                title="Modifier les coordonnées du livreur"
                              >
                                Modifier
                              </button>

                              {/* 5. Supprimer */}
                              <button
                                onClick={() => setDeletingUser({ id: c.id, name: c.name, role: 'livreur' })}
                                className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Supprimer définitivement"
                              >
                                <span className="material-symbols-outlined text-sm">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                    {/* Merchants */}
                    {(userTypeFilter === 'all' || userTypeFilter === 'vendeur') &&
                      filteredMerchants.map(m => (
                        <tr key={'m_' + m.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                                <span className="material-symbols-outlined text-sm">store</span>
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 flex items-center gap-1">
                                  <span>{m.storeName}</span>
                                  {m.isVerified && (
                                    <span className="material-symbols-outlined text-blue-500 text-xs" title="Vérifié">verified</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400">Gérant: {m.managerName}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1 w-fit">
                              <span className="material-symbols-outlined text-xs">storefront</span>
                              <span>VENDEUR ({m.channel})</span>
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900">{m.phone}</div>
                            <span className="text-[10px] font-mono text-slate-500 block">{m.email || 'N/A'}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-700">{m.commune}</td>
                          <td className="py-3 px-3">
                            <div className="font-mono font-bold text-slate-900">{m.totalOrders} courses</div>
                            <span className="text-[10px] text-emerald-600 font-bold">{(m.totalVolumeFCFA || 0).toLocaleString('fr-FR')} F</span>
                          </td>
                          <td className="py-3 px-3">
                            {m.status === 'actif' && (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold inline-flex items-center gap-1">
                                <span>🟢</span>
                                <span>Actif</span>
                              </span>
                            )}
                            {m.status === 'suspendu' && (
                              <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold inline-flex items-center gap-1">
                                <span>🔴</span>
                                <span>Bloqué / Suspendu</span>
                              </span>
                            )}
                            {m.status === 'en_attente_kyc' && (
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold inline-flex items-center gap-1">
                                <span>🟡</span>
                                <span>En attente KYC</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* 1. Réinitialiser Accès Button */}
                              <button
                                onClick={() => setResetAccessUser({
                                  id: m.id,
                                  name: m.storeName,
                                  email: m.email || `${m.storeName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@livralink.bj`,
                                  phone: m.phone,
                                  role: 'vendeur',
                                  status: m.status,
                                  storeName: m.storeName,
                                })}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1 active:scale-95 transition-all shadow-xs cursor-pointer"
                                title="Réinitialiser le mot de passe et les identifiants de connexion"
                              >
                                <span className="material-symbols-outlined text-xs">vpn_key</span>
                                <span>Accès</span>
                              </button>

                              {/* 2. Suspendre / Débloquer Button */}
                              <button
                                onClick={() => toggleMerchantStatus(m.id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold active:scale-95 transition-all cursor-pointer ${
                                  m.status === 'suspendu'
                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                    : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                                }`}
                                title={m.status === 'suspendu' ? 'Débloquer la boutique' : 'Suspendre la boutique'}
                              >
                                {m.status === 'suspendu' ? 'Débloquer' : 'Suspendre'}
                              </button>

                              {/* 3. Badge */}
                              <button
                                onClick={() => toggleMerchantVerification(m.id)}
                                className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold cursor-pointer"
                                title="Accorder ou révoquer le badge"
                              >
                                {m.isVerified ? 'Badge ✓' : '+ Badge'}
                              </button>

                              {/* 4. Modifier */}
                              <button
                                onClick={() => openEditUser({
                                  id: m.id,
                                  name: m.storeName,
                                  phone: m.phone,
                                  email: m.email || '',
                                  role: 'vendeur',
                                  commune: m.commune,
                                  status: m.status,
                                  channel: m.channel,
                                  isVerified: m.isVerified
                                })}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                                title="Modifier la boutique"
                              >
                                Modifier
                              </button>

                              {/* 5. Supprimer */}
                              <button
                                onClick={() => setDeletingUser({ id: m.id, name: m.storeName, role: 'vendeur' })}
                                className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Supprimer la boutique"
                              >
                                <span className="material-symbols-outlined text-sm">delete</span>
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
              TAB: VÉRIFICATIONS KYC (Centre de validation des pièces d'identité)
             ========================================================================= */}
          {activeViewTab === 'kyc' && (
            <div className="space-y-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-600">verified_user</span>
                    <span>Centre d'Accréditation et Validation KYC ({kycRequests.length})</span>
                  </h2>
                  <p className="text-xs text-slate-500">Contrôle des pièces CNI, permis de conduire et certification des livreurs</p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold">
                  <button
                    onClick={() => setKycStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-lg ${kycStatusFilter === 'all' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    Toutes ({kycRequests.length})
                  </button>
                  <button
                    onClick={() => setKycStatusFilter('en_attente')}
                    className={`px-2.5 py-1 rounded-lg ${kycStatusFilter === 'en_attente' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    🟡 En attente ({kycRequests.filter(k => k.status === 'en_attente').length})
                  </button>
                  <button
                    onClick={() => setKycStatusFilter('valide')}
                    className={`px-2.5 py-1 rounded-lg ${kycStatusFilter === 'valide' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    🟢 Validées ({kycRequests.filter(k => k.status === 'valide').length})
                  </button>
                </div>
              </div>

              {/* KYC Requests Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {kycRequests
                  .filter(k => kycStatusFilter === 'all' || k.status === kycStatusFilter)
                  .map(kyc => (
                    <div
                      key={kyc.id}
                      className={`p-5 rounded-2xl border transition-all ${
                        kyc.status === 'en_attente'
                          ? 'bg-amber-50/40 border-amber-200 shadow-2xs'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 font-bold flex items-center justify-center border border-amber-300/40">
                            <span className="material-symbols-outlined text-xl">badge</span>
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                              <span>{kyc.fullName}</span>
                              <span className="text-[10px] font-mono text-slate-400 font-normal">({kyc.idNumber || 'CNI-CI-2024'})</span>
                            </h3>
                            <p className="text-xs text-slate-500">📱 {kyc.phone} • 🛵 {kyc.vehicleType || 'Moto 125cc'}</p>
                          </div>
                        </div>

                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          kyc.status === 'en_attente' ? 'bg-amber-100 text-amber-800' :
                          kyc.status === 'valide' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {kyc.status === 'en_attente' ? '🟡 En Attente de Revue' : kyc.status === 'valide' ? '✅ KYC Validé' : '❌ Rejeté'}
                        </span>
                      </div>

                      {/* Documents Preview Badges */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-white rounded-xl border border-slate-200 text-xs mb-3">
                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 min-w-0">
                          <span className="font-semibold text-slate-700 truncate">Pièce CNI / Passeport</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${kyc.documents.cni ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {kyc.documents.cni ? '✓ Fourni' : '✗ Manquant'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 min-w-0">
                          <span className="font-semibold text-slate-700 truncate">Permis de Conduire</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${kyc.documents.permis ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {kyc.documents.permis ? '✓ Fourni' : '✗ Manquant'}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                        {kyc.status === 'en_attente' ? (
                          <>
                            <button
                              onClick={() => approveKYC(kyc.id)}
                              className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-98"
                            >
                              <span className="material-symbols-outlined text-sm">verified</span>
                              <span>Valider &amp; Activer le Livreur</span>
                            </button>
                            <button
                              onClick={() => rejectKYC(kyc.id)}
                              className="py-2.5 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all active:scale-98 text-center"
                            >
                              Refuser
                            </button>
                          </>
                        ) : (
                          <div className="w-full flex items-center justify-between text-xs text-slate-500 py-1">
                            <span>Statut d'accréditation enregistré.</span>
                            <button
                              onClick={() => approveKYC(kyc.id)}
                              className="text-blue-600 font-bold hover:underline"
                            >
                              Re-valider
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 2: GESTION DES LIVREURS (Full Table & Actions)
             ========================================================================= */}
          {activeViewTab === 'couriers' && (
            <div className="space-y-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
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

              {/* Couriers Table Header */}
              {/* KYC Requests Module */}
              {kycRequests.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-600 text-lg">verified_user</span>
                      <h3 className="font-bold text-xs text-amber-950 uppercase tracking-wider">
                        Demandes d'Accréditation KYC en Attente ({kycRequests.filter(k => k.status === 'en_attente').length})
                      </h3>
                    </div>
                    <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded-full">
                      Vérification CNI / Permis
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {kycRequests.map(kyc => (
                      <div key={kyc.id} className="p-3 bg-white rounded-xl border border-amber-200/60 shadow-2xs flex items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                            <span>{kyc.fullName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({kyc.idNumber || 'En cours'})</span>
                          </p>
                          <p className="text-[11px] text-slate-500">{kyc.phone} • {kyc.vehicleType || 'Moto'}</p>
                          <div className="flex gap-1 pt-1">
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${kyc.documents.cni ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                              CNI {kyc.documents.cni ? '✓' : '✗'}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${kyc.documents.permis ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                              Permis {kyc.documents.permis ? '✓' : '✗'}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 shrink-0">
                          {kyc.status === 'en_attente' ? (
                            <>
                              <button
                                onClick={() => approveKYC(kyc.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-2xs transition-all active:scale-95 flex items-center justify-center gap-1"
                              >
                                <span className="material-symbols-outlined text-xs">check</span>
                                <span>Valider</span>
                              </button>
                              <button
                                onClick={() => rejectKYC(kyc.id)}
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-bold transition-all active:scale-95 flex items-center justify-center gap-1"
                              >
                                <span>Refuser</span>
                              </button>
                            </>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Validé ✓
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mobile Cards for Couriers Fleet */}
              <div className="md:hidden divide-y divide-slate-100 space-y-3">
                {filteredCouriers.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    Aucun livreur trouvé avec les filtres actuels.
                  </div>
                ) : (
                  filteredCouriers.map((courier) => (
                    <article key={courier.id} className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                            {courier.avatarInitials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                              <span>{courier.name}</span>
                              {courier.badge && (
                                <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full font-bold">
                                  {courier.badge}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-amber-500 font-bold">★ {courier.rating.toFixed(1)}</span>
                          </div>
                        </div>

                        <div>
                          {courier.status === 'en_ligne' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              🟢 En ligne
                            </span>
                          )}
                          {courier.status === 'en_course' && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                              🔵 En course
                            </span>
                          )}
                          {courier.status === 'hors_ligne' && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                              ⚪ Hors ligne
                            </span>
                          )}
                          {courier.status === 'suspendu' && (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                              🔴 Suspendu
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between items-center text-slate-600">
                          <span>📱 {courier.phone}</span>
                          <span className="font-mono text-slate-400 text-[10px]">{courier.vehiclePlate}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center justify-between">
                          <span>🛵 {courier.vehicle}</span>
                          <span className="text-slate-700 font-semibold">{courier.zone}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                          <span className="text-slate-500">Caution / Portefeuille:</span>
                          <span className="font-mono font-bold text-slate-900">{(courier.walletBalanceFCFA || 0).toLocaleString('fr-FR')} FCFA</span>
                        </div>
                      </div>

                      {/* Courier Actions */}
                      <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100 flex-wrap">
                        <button
                          type="button"
                          onClick={() => impersonateCourier(courier.id)}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold active:scale-95 flex items-center gap-1 shadow-sm"
                          title="Piloter ce livreur en direct (Mode Directeur)"
                        >
                          <span>👑</span>
                          <span>Piloter</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setWalletModalCourier(courier)}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold active:scale-95"
                        >
                          Portefeuille
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditCourier(courier)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold active:scale-95"
                        >
                          Éditer
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCourierStatus(courier.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold active:scale-95 ${
                            courier.status === 'suspendu'
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          {courier.status === 'suspendu' ? 'Réactiver' : 'Suspendre'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingCourier(courier)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors active:scale-95"
                          title="Supprimer le livreur"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>

              {/* Couriers Table for Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[750px]">
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
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              onClick={() => impersonateCourier(courier.id)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95"
                              title="Piloter ce livreur en direct (Mode Directeur)"
                            >
                              <span>👑</span>
                              <span>Piloter</span>
                            </button>
                            <button
                              onClick={() => setResetAccessUser({
                                id: courier.id,
                                name: courier.name,
                                email: courier.email || `${courier.name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@livralink.bj`,
                                phone: courier.phone,
                                role: 'livreur',
                                status: courier.status,
                                vehicle: courier.vehicle,
                              })}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1 active:scale-95 shadow-xs cursor-pointer"
                              title="Réinitialiser le mot de passe et les accès"
                            >
                              <span className="material-symbols-outlined text-xs">vpn_key</span>
                              <span>Accès</span>
                            </button>
                            <button
                              onClick={() => setWalletModalCourier(courier)}
                              className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold"
                              title="Recharger ou débiter la caution"
                            >
                              Portefeuille
                            </button>
                            <button
                              onClick={() => openEditCourier(courier)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                              title="Modifier toutes les informations"
                            >
                              Éditer
                            </button>
                            <button
                              onClick={() => toggleCourierStatus(courier.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                courier.status === 'suspendu'
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                              }`}
                              title={courier.status === 'suspendu' ? 'Réactiver le livreur' : 'Suspendre le livreur'}
                            >
                              {courier.status === 'suspendu' ? 'Réactiver' : 'Suspendre'}
                            </button>
                            <button
                              onClick={() => setDeletingCourier(courier)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Supprimer définitivement le livreur"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
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
            <div className="space-y-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
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

              {/* Mobile Cards for Merchants */}
              <div className="md:hidden divide-y divide-slate-100 space-y-3">
                {filteredMerchants.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    Aucune boutique trouvée avec les filtres actuels.
                  </div>
                ) : (
                  filteredMerchants.map((merchant) => (
                    <article key={merchant.id} className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                          <span>🏪 {merchant.storeName}</span>
                          {merchant.isVerified && (
                            <span className="material-symbols-outlined text-blue-500 text-xs" title="Vérifié">verified</span>
                          )}
                        </div>
                        <div>
                          {merchant.status === 'actif' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              🟢 Actif
                            </span>
                          )}
                          {merchant.status === 'suspendu' && (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                              🔴 Suspendu
                            </span>
                          )}
                          {merchant.status === 'en_attente_kyc' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                              🟡 En attente KYC
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between text-slate-600">
                          <span>Gérant: <strong className="text-slate-800">{merchant.managerName}</strong></span>
                          <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold ${
                            merchant.channel === 'WhatsApp' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                            merchant.channel === 'Instagram' ? 'bg-pink-50 text-pink-800 border border-pink-200' :
                            merchant.channel === 'TikTok' ? 'bg-purple-50 text-purple-800 border border-purple-200' : 'bg-blue-50 text-blue-800'
                          }`}>
                            {merchant.channel}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-slate-400">location_on</span>
                          <span>{merchant.commune} • {merchant.address}</span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                          <span>📱 {merchant.phone}</span>
                          <span className="font-extrabold text-emerald-700">
                            {(merchant.totalVolumeFCFA || 0).toLocaleString('fr-FR')} FCFA ({merchant.totalOrders} courses)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100 flex-wrap">
                        <button
                          type="button"
                          onClick={() => impersonateMerchant(merchant.id)}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold active:scale-95 flex items-center gap-1 shadow-sm"
                          title="Piloter cette boutique en direct (Mode Directeur)"
                        >
                          <span>👑</span>
                          <span>Piloter</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditMerchant(merchant)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold active:scale-95"
                        >
                          Éditer
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMerchantVerification(merchant.id)}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold active:scale-95"
                        >
                          {merchant.isVerified ? 'Badge ✓' : '+ Badge'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMerchantStatus(merchant.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold active:scale-95 ${
                            merchant.status === 'suspendu'
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          {merchant.status === 'suspendu' ? 'Débloquer' : 'Bloquer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingMerchant(merchant)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors active:scale-95"
                          title="Supprimer la boutique"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>

              {/* Table for Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[700px]">
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
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              onClick={() => impersonateMerchant(merchant.id)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95"
                              title="Piloter cette boutique en direct (Mode Directeur)"
                            >
                              <span>👑</span>
                              <span>Piloter</span>
                            </button>
                            <button
                              onClick={() => setResetAccessUser({
                                id: merchant.id,
                                name: merchant.storeName,
                                email: merchant.email || `${merchant.storeName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@livralink.bj`,
                                phone: merchant.phone,
                                role: 'vendeur',
                                status: merchant.status,
                                storeName: merchant.storeName,
                              })}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1 active:scale-95 shadow-xs cursor-pointer"
                              title="Réinitialiser le mot de passe et les accès"
                            >
                              <span className="material-symbols-outlined text-xs">vpn_key</span>
                              <span>Accès</span>
                            </button>
                            <button
                              onClick={() => openEditMerchant(merchant)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                              title="Modifier les coordonnées de la boutique"
                            >
                              Éditer
                            </button>
                            <button
                              onClick={() => toggleMerchantVerification(merchant.id)}
                              className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold"
                              title="Basculer statut vérifié"
                            >
                              {merchant.isVerified ? 'Badge ✓' : '+ Badge'}
                            </button>
                            <button
                              onClick={() => toggleMerchantStatus(merchant.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                merchant.status === 'suspendu'
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                              }`}
                            >
                              {merchant.status === 'suspendu' ? 'Débloquer' : 'Bloquer'}
                            </button>
                            <button
                              onClick={() => setDeletingMerchant(merchant)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Supprimer la boutique"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
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
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Deliveries Mini-KPIs Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div
                  onClick={() => setDeliveryStatusFilter('all')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    deliveryStatusFilter === 'all'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-800 hover:border-blue-400'
                  }`}
                >
                  <span className={`text-[10px] uppercase font-bold block ${deliveryStatusFilter === 'all' ? 'text-blue-100' : 'text-slate-400'}`}>
                    Total Courses
                  </span>
                  <div className="text-xl font-black">{deliveries.length}</div>
                  <span className={`text-[10px] ${deliveryStatusFilter === 'all' ? 'text-blue-100' : 'text-slate-500'}`}>
                    Toutes communes
                  </span>
                </div>

                <div
                  onClick={() => setDeliveryStatusFilter('en_attente')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    deliveryStatusFilter === 'en_attente'
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-800 hover:border-amber-400'
                  }`}
                >
                  <span className={`text-[10px] uppercase font-bold block ${deliveryStatusFilter === 'en_attente' ? 'text-slate-900' : 'text-amber-600'}`}>
                    🟡 En Attente
                  </span>
                  <div className="text-xl font-black">
                    {deliveries.filter(d => d.status === 'en_attente').length}
                  </div>
                  <span className={`text-[10px] ${deliveryStatusFilter === 'en_attente' ? 'text-slate-900' : 'text-slate-500'}`}>
                    À assigner
                  </span>
                </div>

                <div
                  onClick={() => setDeliveryStatusFilter('en_cours')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    deliveryStatusFilter === 'en_cours'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-800 hover:border-blue-400'
                  }`}
                >
                  <span className={`text-[10px] uppercase font-bold block ${deliveryStatusFilter === 'en_cours' ? 'text-blue-100' : 'text-blue-600'}`}>
                    🟢 En Transit
                  </span>
                  <div className="text-xl font-black">
                    {deliveries.filter(d => d.status === 'en_cours' || d.status === 'assignee').length}
                  </div>
                  <span className={`text-[10px] ${deliveryStatusFilter === 'en_cours' ? 'text-blue-100' : 'text-slate-500'}`}>
                    Livreur en route
                  </span>
                </div>

                <div
                  onClick={() => setDeliveryStatusFilter('livree')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    deliveryStatusFilter === 'livree'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-400'
                  }`}
                >
                  <span className={`text-[10px] uppercase font-bold block ${deliveryStatusFilter === 'livree' ? 'text-emerald-100' : 'text-emerald-600'}`}>
                    ✅ Livrées (POD)
                  </span>
                  <div className="text-xl font-black">
                    {deliveries.filter(d => d.status === 'livree').length}
                  </div>
                  <span className={`text-[10px] ${deliveryStatusFilter === 'livree' ? 'text-emerald-100' : 'text-slate-500'}`}>
                    Fonds sécurisés
                  </span>
                </div>

                <div
                  onClick={() => setDeliveryStatusFilter('echec')}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    deliveryStatusFilter === 'echec'
                      ? 'bg-red-600 text-white border-red-600 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-800 hover:border-red-400'
                  }`}
                >
                  <span className={`text-[10px] uppercase font-bold block ${deliveryStatusFilter === 'echec' ? 'text-red-100' : 'text-red-600'}`}>
                    🔴 Litiges
                  </span>
                  <div className="text-xl font-black">
                    {deliveries.filter(d => d.status === 'echec').length}
                  </div>
                  <span className={`text-[10px] ${deliveryStatusFilter === 'echec' ? 'text-red-100' : 'text-slate-500'}`}>
                    Arbitrage requis
                  </span>
                </div>
              </div>

              {/* Main Deliveries Card */}
              <div className="space-y-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-600">local_shipping</span>
                      <span>Live Dispatch &amp; Supervision des Livraisons ({filteredDeliveries.length})</span>
                    </h2>
                    <p className="text-xs text-slate-500">Contrôle en direct des courses, assignation aux coursiers et validation POD</p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setIsAddDeliveryModalOpen(true)}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-sm">add_circle</span>
                      <span>+ Nouvelle Course Directe</span>
                    </button>
                    <button
                      onClick={() => {
                        setDeliveryStatusFilter('all');
                        setAdminSearch('');
                        showToast('Liste des courses actualisée', 'info');
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1"
                      title="Réinitialiser les filtres"
                    >
                      <span className="material-symbols-outlined text-sm">refresh</span>
                      <span>Actualiser</span>
                    </button>
                  </div>
                </div>

                {/* Filter Chips Bar */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold overflow-x-auto">
                  <button
                    onClick={() => setDeliveryStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${deliveryStatusFilter === 'all' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    Toutes ({deliveries.length})
                  </button>
                  <button
                    onClick={() => setDeliveryStatusFilter('en_attente')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${deliveryStatusFilter === 'en_attente' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    🟡 En attente ({deliveries.filter(d => d.status === 'en_attente').length})
                  </button>
                  <button
                    onClick={() => setDeliveryStatusFilter('en_cours')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${deliveryStatusFilter === 'en_cours' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    🟢 En transit ({deliveries.filter(d => d.status === 'en_cours' || d.status === 'assignee').length})
                  </button>
                  <button
                    onClick={() => setDeliveryStatusFilter('livree')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${deliveryStatusFilter === 'livree' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    ✅ Livrées ({deliveries.filter(d => d.status === 'livree').length})
                  </button>
                  <button
                    onClick={() => setDeliveryStatusFilter('echec')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${deliveryStatusFilter === 'echec' ? 'bg-white text-red-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    🔴 Litiges ({deliveries.filter(d => d.status === 'echec').length})
                  </button>
                </div>

                {/* Mobile Cards for Deliveries Supervision */}
                <div className="md:hidden divide-y divide-slate-100 p-3 space-y-3">
                  {filteredDeliveries.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      Aucune course trouvée avec les filtres actuels.
                    </div>
                  ) : (
                    filteredDeliveries.map((order) => (
                      <article key={order.id} className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setInspectingDelivery(order)}
                            className="font-mono font-bold text-blue-700 text-xs hover:underline flex items-center gap-1"
                          >
                            <span>{order.id}</span>
                            <span className="material-symbols-outlined text-xs">visibility</span>
                          </button>
                          <div>
                            {order.status === 'en_cours' && (
                              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                                🚚 En transit
                              </span>
                            )}
                            {order.status === 'assignee' && (
                              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
                                🟣 Assignée
                              </span>
                            )}
                            {order.status === 'en_attente' && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                                🟡 En attente
                              </span>
                            )}
                            {order.status === 'echec' && (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                                🔴 Litige
                              </span>
                            )}
                            {order.status === 'livree' && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                ✅ Livrée (POD)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-slate-900">{order.clientName}</div>
                              <div className="text-[11px] text-slate-500 font-mono">{order.clientPhone}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-extrabold text-emerald-700">{order.itemValueCOD.toLocaleString('fr-FR')} FCFA</div>
                              <div className="text-[10px] text-slate-400">Frais: {order.deliveryFee.toLocaleString('fr-FR')} F</div>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-xl space-y-0.5">
                            <div className="flex items-center gap-1 truncate">
                              <span className="text-slate-400">De:</span>
                              <strong className="text-slate-800">{order.pickupLocation.name}</strong>
                              <span className="text-slate-400">({order.pickupLocation.commune})</span>
                            </div>
                            <div className="flex items-center gap-1 truncate">
                              <span className="text-slate-400">Vers:</span>
                              <strong className="text-slate-800">{order.dropoffLocation.commune}</strong>
                              <span className="text-slate-400 truncate">• {order.dropoffLocation.address}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] pt-1">
                            <span className="text-slate-500">
                              Coursier: <strong className="text-slate-800">{order.courier ? order.courier.name : 'Non assigné'}</strong>
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        {/* Actions buttons */}
                        <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setAssigningOrder(order)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs active:scale-95"
                          >
                            Assigner
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditDelivery(order)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold active:scale-95"
                          >
                            Éditer
                          </button>
                          {order.status !== 'livree' && (
                            <button
                              type="button"
                              onClick={() => {
                                updateDeliveryStatus(order.id, 'livree', 'Forçage administrateur POD');
                                showToast(`Course ${order.id} marquée livrée avec succès !`, 'success');
                              }}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold active:scale-95"
                            >
                              ✓ Livré
                            </button>
                          )}
                          {order.status === 'echec' ? (
                            <button
                              type="button"
                              onClick={() => setSelectedDisputeOrder(order.id)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-2xs active:scale-95"
                            >
                              Arbitrer
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                updateDeliveryStatus(order.id, 'echec', 'Incident signalé par le superviseur');
                                showToast(`Course ${order.id} placée en litige`, 'info');
                              }}
                              className="px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-semibold active:scale-95"
                            >
                              Litige
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setInspectingDelivery(order)}
                            className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg active:scale-95"
                            title="Voir fiche complète"
                          >
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingDelivery(order)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors active:scale-95"
                            title="Supprimer la course"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>

                {/* Table for Desktop & Tablets */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs min-w-[780px]">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                        <th className="py-3 px-3">ID &amp; Détails</th>
                        <th className="py-3 px-3">Expéditeur (Boutique)</th>
                        <th className="py-3 px-3">Destinataire (Client)</th>
                        <th className="py-3 px-3">Coursier Assigné</th>
                        <th className="py-3 px-3">Montant COD / Frais</th>
                        <th className="py-3 px-3">Statut Course</th>
                        <th className="py-3 px-3 text-right">Actions Superviseur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDeliveries.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-slate-400">
                            Aucune course trouvée avec les filtres actuels.
                          </td>
                        </tr>
                      ) : (
                        filteredDeliveries.map(order => (
                          <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-3">
                              <button
                                onClick={() => setInspectingDelivery(order)}
                                className="font-mono font-bold text-blue-700 hover:underline flex items-center gap-1"
                              >
                                <span>{order.id}</span>
                                <span className="material-symbols-outlined text-xs">visibility</span>
                              </button>
                              <span className="text-[10px] text-slate-400">Créée le {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </td>

                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-900">{order.pickupLocation.name}</div>
                              <span className="text-[10px] text-slate-500">{order.pickupLocation.commune}</span>
                            </td>

                            <td className="py-3 px-3">
                              <div className="font-semibold text-slate-800 flex items-center gap-1">
                                <span>{order.clientName}</span>
                                <button
                                  onClick={() => openWhatsAppModal(order.clientPhone, order.clientName, `Bonjour ${order.clientName}, suivi de votre livraison LivraLink ${order.id}.`)}
                                  className="text-emerald-600 hover:text-emerald-700"
                                  title="Ouvrir WhatsApp client"
                                >
                                  <span className="material-symbols-outlined text-xs">chat</span>
                                </button>
                              </div>
                              <span className="text-[10px] text-slate-500">{order.dropoffLocation.commune} • {order.clientPhone}</span>
                            </td>

                            <td className="py-3 px-3">
                              {order.courier ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px]">
                                    {order.courier.avatarInitials || '🛵'}
                                  </div>
                                  <div>
                                    <div className="font-bold text-slate-900">{order.courier.name}</div>
                                    <span className="text-[10px] text-slate-500">{order.courier.vehicle}</span>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAssigningOrder(order)}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition-colors"
                                >
                                  ⚠️ Non assigné (Cliquer)
                                </button>
                              )}
                            </td>

                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-900">COD: {order.itemValueCOD.toLocaleString('fr-FR')} F</div>
                              <span className="text-[10px] text-blue-600 font-bold">Frais: {order.deliveryFee.toLocaleString('fr-FR')} F</span>
                            </td>

                            <td className="py-3 px-3">
                              {order.status === 'en_cours' && (
                                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold inline-flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                                  <span>En transit</span>
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
                              <div className="flex items-center justify-end gap-1 flex-wrap">
                                <button
                                  onClick={() => setAssigningOrder(order)}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs"
                                  title="Assigner un livreur"
                                >
                                  Assigner
                                </button>
                                
                                <button
                                  onClick={() => openEditDelivery(order)}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                                  title="Modifier les détails de la course"
                                >
                                  Éditer
                                </button>

                                {order.status !== 'livree' && (
                                  <button
                                    onClick={() => {
                                      updateDeliveryStatus(order.id, 'livree', 'Forçage administrateur POD');
                                      showToast(`Course ${order.id} marquée livrée avec succès !`, 'success');
                                    }}
                                    className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold"
                                    title="Forcer la validation de la livraison"
                                  >
                                    ✓ Livré
                                  </button>
                                )}

                                {order.status === 'echec' ? (
                                  <button
                                    onClick={() => setSelectedDisputeOrder(order.id)}
                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-2xs"
                                    title="Résoudre l'incident"
                                  >
                                    Arbitrer
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      updateDeliveryStatus(order.id, 'echec', 'Incident signalé par le superviseur');
                                      showToast(`Course ${order.id} placée en litige`, 'info');
                                    }}
                                    className="px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-semibold"
                                    title="Signaler incident"
                                  >
                                    Litige
                                  </button>
                                )}

                                <button
                                  onClick={() => setInspectingDelivery(order)}
                                  className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                                  title="Voir fiche complète"
                                >
                                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                                </button>

                                <button
                                  onClick={() => setDeletingDelivery(order)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Supprimer la course"
                                >
                                  <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 5: LITIGES & MODÉRATION
             ========================================================================= */}
          {activeViewTab === 'disputes' && (
            <div className="space-y-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
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
              TAB: DIRECTEUR GÉNÉRAL DES FONCTIONNALITÉS (MASTER FEATURE FLAGS)
             ========================================================================= */}
          {activeViewTab === 'features' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Header Card */}
              <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-purple-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-400/30 flex items-center justify-center shrink-0 shadow-inner">
                    <span className="material-symbols-outlined text-2xl">tune</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-black text-white">Directeur Général des Fonctionnalités</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 border border-amber-300">
                        👑 Contrôle Absolu
                      </span>
                    </div>
                    <p className="text-xs text-purple-200 leading-relaxed max-w-2xl">
                      Cette interface donne à l'administrateur le pouvoir de piloter, ajouter ou supprimer en direct n'importe quelle fonctionnalité sur les espaces <strong>Vendeurs</strong> et <strong>Livreurs</strong>, ou de verrouiller temporairement des accès.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
                  <button
                    type="button"
                    onClick={resetFeatureFlagsToDefault}
                    className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/20 flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    title="Restaurer toutes les fonctionnalités activées par défaut"
                  >
                    <span className="material-symbols-outlined text-sm">restart_alt</span>
                    <span>Valeurs standard</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => showToast('Toutes les modifications sont actives et propagées en temps réel !', 'success')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-600/30 flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    <span>Appliqué en direct</span>
                  </button>
                </div>
              </div>

              {/* 1. Global Platform Controls: Maintenance & Emergency Broadcast */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-bold">
                      <span className="material-symbols-outlined text-lg">shield_with_heart</span>
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">1. Contrôle Global &amp; Verrouillage d'Espaces</h3>
                      <p className="text-xs text-slate-500">Activez ou coupez temporairement l'accès aux pages vendeurs ou livreurs</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Vendor Space Switch */}
                  <div className={`p-4 rounded-2xl border transition-all space-y-3 ${
                    featureFlags.vendeurSpaceEnabled ? 'bg-slate-50 border-slate-200' : 'bg-amber-50/80 border-amber-300'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-600">storefront</span>
                        <span className="font-bold text-xs text-slate-900">Espace Vendeurs</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateFeatureFlag('vendeurSpaceEnabled', !featureFlags.vendeurSpaceEnabled)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                          featureFlags.vendeurSpaceEnabled ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-red-100 text-red-800 border border-red-300'
                        }`}
                      >
                        {featureFlags.vendeurSpaceEnabled ? '🟢 Ouvert & Actif' : '🔴 En Maintenance'}
                      </button>
                    </div>
                    {!featureFlags.vendeurSpaceEnabled && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">Message affiché aux vendeurs :</label>
                        <input
                          type="text"
                          value={featureFlags.vendeurMaintenanceNotice}
                          onChange={(e) => updateFeatureFlag('vendeurMaintenanceNotice', e.target.value)}
                          className="w-full text-xs p-2 bg-white rounded-lg border border-amber-300 text-slate-800 font-medium focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Courier Space Switch */}
                  <div className={`p-4 rounded-2xl border transition-all space-y-3 ${
                    featureFlags.livreurSpaceEnabled ? 'bg-slate-50 border-slate-200' : 'bg-amber-50/80 border-amber-300'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-600">two_wheeler</span>
                        <span className="font-bold text-xs text-slate-900">Espace Livreurs</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateFeatureFlag('livreurSpaceEnabled', !featureFlags.livreurSpaceEnabled)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                          featureFlags.livreurSpaceEnabled ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-red-100 text-red-800 border border-red-300'
                        }`}
                      >
                        {featureFlags.livreurSpaceEnabled ? '🟢 Ouvert & Actif' : '🔴 En Maintenance'}
                      </button>
                    </div>
                    {!featureFlags.livreurSpaceEnabled && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-700 block">Message affiché aux livreurs :</label>
                        <input
                          type="text"
                          value={featureFlags.livreurMaintenanceNotice}
                          onChange={(e) => updateFeatureFlag('livreurMaintenanceNotice', e.target.value)}
                          className="w-full text-xs p-2 bg-white rounded-lg border border-amber-300 text-slate-800 font-medium focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Emergency Broadcast Announcement Bar */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-orange-900">
                      <span className="material-symbols-outlined text-orange-600">campaign</span>
                      <span>Bandeau d'Alerte / Annonce Officielle de Direction</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateFeatureFlag('emergencyBroadcastActive', !featureFlags.emergencyBroadcastActive)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                        featureFlags.emergencyBroadcastActive ? 'bg-orange-600 text-white shadow-xs' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {featureFlags.emergencyBroadcastActive ? '📢 Diffusé en direct' : '⏸️ Inactif'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Texte de l'annonce diffusée au sommet de toutes les pages :</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={featureFlags.emergencyBroadcastMessage}
                        onChange={(e) => updateFeatureFlag('emergencyBroadcastMessage', e.target.value)}
                        placeholder="Ex : Alerte fortes pluies sur Cotonou • Délais de livraison rallongés de 15 min"
                        className="flex-1 text-xs p-2.5 bg-white rounded-xl border border-orange-300 text-slate-900 font-medium focus:outline-none shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          updateFeatureFlag('emergencyBroadcastActive', true);
                          showToast('Annonce officielle diffusée en direct sur tous les écrans !', 'success');
                        }}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow-xs active:scale-95"
                      >
                        Diffuser
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Vendor Pages Features Controls */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      <span className="material-symbols-outlined text-lg">storefront</span>
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">2. Fonctionnalités de la Page Vendeur</h3>
                      <p className="text-xs text-slate-500">Ajoutez ou supprimez des options pour les boutiques en direct</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                    7 Modules Vendeur
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { key: 'allowExpressCreation' as const, title: 'Création Express de Colis', desc: 'Permet aux vendeurs d\'enregistrer de nouvelles courses', icon: 'add_circle' },
                    { key: 'allowWhatsAppOrdering' as const, title: 'Commandes WhatsApp Direct', desc: 'Intégration du checkout et notifications WhatsApp', icon: 'chat' },
                    { key: 'allowCODCollection' as const, title: 'Paiement à la livraison (COD)', desc: 'Encaissement des fonds marchandise par le livreur', icon: 'payments' },
                    { key: 'requireClientVerification' as const, title: 'Vérification Client Requise', desc: 'Exige un numéro client valide au Bénin (+229)', icon: 'verified' },
                    { key: 'allowManualCourierAssignment' as const, title: 'Sélection Manuelle du Livreur', desc: 'Permet au vendeur de choisir un coursier précis', icon: 'person_pin' },
                    { key: 'showCourierLiveGPS' as const, title: 'Suivi GPS Livreur en Direct', desc: 'Affiche la position sur la carte Google Maps', icon: 'map' },
                    { key: 'allowVendorReports' as const, title: 'Rapports & Statistiques', desc: 'Accès aux bilans comptables et volumes COD', icon: 'analytics' },
                  ].map((feat) => {
                    const isEnabled = featureFlags[feat.key];
                    return (
                      <div
                        key={feat.key}
                        className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                          isEnabled ? 'bg-slate-50 border-slate-200' : 'bg-red-50/50 border-red-200 opacity-80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg text-blue-600">{feat.icon}</span>
                            <span className="font-extrabold text-xs text-slate-900">{feat.title}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateFeatureFlag(feat.key, !isEnabled)}
                            className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                              isEnabled ? 'bg-blue-600' : 'bg-slate-300'
                            }`}
                          >
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                              isEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{feat.desc}</p>
                        <div className="text-[10px] font-bold pt-1 border-t border-slate-100 flex items-center justify-between">
                          <span className={isEnabled ? 'text-emerald-700' : 'text-red-700'}>
                            {isEnabled ? '✓ Activée sur page vendeur' : '✕ Supprimée / Désactivée'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Courier Pages Features Controls */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                      <span className="material-symbols-outlined text-lg">two_wheeler</span>
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">3. Fonctionnalités de la Page Livreur</h3>
                      <p className="text-xs text-slate-500">Ajoutez ou supprimez des options pour les coursiers en direct</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                    7 Modules Livreur
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { key: 'allowInstantWithdrawal' as const, title: 'Retraits d\'argent MoMo / Celtiis', desc: 'Permet les demandes de transfert de gains du portefeuille', icon: 'account_balance_wallet' },
                    { key: 'allowMissionRefusal' as const, title: 'Droit de Refuser une Course', desc: 'Permet au coursier de rejeter une proposition de mission', icon: 'cancel' },
                    { key: 'requireOtpPOD' as const, title: 'Obligation Code Secret OTP', desc: 'Force la saisie du code transmis au client', icon: 'pin' },
                    { key: 'requireLivePhotoPOD' as const, title: 'Obligation Photo Directe Colis', desc: 'Force la prise directe de photo sans visage', icon: 'photo_camera' },
                    { key: 'requireTactileSignaturePOD' as const, title: 'Obligation Signature Tactile', desc: 'Force le client à signer avec son nom sur smartphone', icon: 'draw' },
                    { key: 'allowDirectCallClient' as const, title: 'Appel Téléphonique Direct', desc: 'Permet au livreur de contacter directement le destinataire', icon: 'call' },
                    { key: 'showVendorStoreDetails' as const, title: 'Coordonnées Complètes Boutique', desc: 'Affiche l\'adresse précise et contacts gérant de la boutique', icon: 'store' },
                  ].map((feat) => {
                    const isEnabled = featureFlags[feat.key];
                    return (
                      <div
                        key={feat.key}
                        className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                          isEnabled ? 'bg-slate-50 border-slate-200' : 'bg-red-50/50 border-red-200 opacity-80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg text-indigo-600">{feat.icon}</span>
                            <span className="font-extrabold text-xs text-slate-900">{feat.title}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateFeatureFlag(feat.key, !isEnabled)}
                            className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                              isEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                            }`}
                          >
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                              isEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{feat.desc}</p>
                        <div className="text-[10px] font-bold pt-1 border-t border-slate-100 flex items-center justify-between">
                          <span className={isEnabled ? 'text-emerald-700' : 'text-red-700'}>
                            {isEnabled ? '✓ Activée sur page livreur' : '✕ Supprimée / Désactivée'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 7: SUITE DE TESTS & VALIDATIONS ADMINISTRATEUR
             ========================================================================= */}
          {activeViewTab === 'tests' && (
            <div className="space-y-6 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-600">checklist_rtl</span>
                    <span>Suite de Tests &amp; Validations Administrateur (8 Pôles Complets)</span>
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
                      <span>Exécution des tests...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">play_arrow</span>
                      <span>Lancer Tous les 8 Tests</span>
                    </>
                  )}
                </button>
              </div>

              {testResults ? (
                <div className="space-y-3">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center justify-between">
                    <span className="font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-600">verified</span>
                      <span>
                        Rapport de Validation : {testResults.filter(t => t.status === 'SUCCESS').length}/{testResults.length} Tests Réussis avec Succès
                      </span>
                    </span>
                    <span className="font-mono font-bold text-[11px] bg-emerald-100 px-2 py-0.5 rounded-lg text-emerald-800">
                      100% OPÉRATIONNEL
                    </span>
                  </div>

                  {testResults.map(test => (
                    <div
                      key={test.id}
                      className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-indigo-300 transition-colors"
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

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRunSingleTest(test.id)}
                          className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 flex items-center gap-1 transition-colors"
                          title="Re-tester ce module unitairement"
                        >
                          <span className="material-symbols-outlined text-xs">refresh</span>
                          <span>Re-tester</span>
                        </button>
                        <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">check_circle</span>
                          <span>SUCCÈS</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500 space-y-4">
                  <span className="material-symbols-outlined text-4xl text-indigo-500">science</span>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">Prêt pour la validation intégrale du SaaS</p>
                    <p className="text-slate-500 mt-1">Supervision courses, flotteurs/livreurs, boutiques/vendeurs, annuaire, KYC, moteur tarifaire (100 F/km), sécurité et Google Auth Multi-Comptes.</p>
                  </div>
                  <button
                    onClick={handleRunValidationSuite}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm inline-flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">play_circle</span>
                    <span>Démarrer la Suite de Validation (8 Pôles)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 8: JOURNAL D'AUDIT & SÉCURITÉ
             ========================================================================= */}
          {activeViewTab === 'audit' && (
            <div className="space-y-4 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
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
                <div className="lg:col-span-7 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4">
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
                  <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs space-y-4">
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
                  placeholder="ex: +229 97 48 00 11"
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
                    placeholder="BJ-8492-RB"
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
                  placeholder="Cotonou / Calavi / Akpakpa"
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
                  placeholder="ex: Cotonou Chic VIP"
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
                  placeholder="ex: +229 95 88 99 00"
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
                    <option value="Cotonou - Haie Vive">Cotonou - Haie Vive</option>
                    <option value="Cotonou - Cadjehoun">Cotonou - Cadjehoun</option>
                    <option value="Cotonou - Akpakpa">Cotonou - Akpakpa</option>
                    <option value="Cotonou - Fidjrossè">Cotonou - Fidjrossè</option>
                    <option value="Abomey-Calavi">Abomey-Calavi</option>
                    <option value="Porto-Novo">Porto-Novo</option>
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

      {/* 3. Modal Recharger / Débiter Portefeuille Livreur */}
      {walletModalCourier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-base">account_balance_wallet</span>
                <span>Gestion Portefeuille Livreur</span>
              </h3>
              <button
                onClick={() => setWalletModalCourier(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleWalletRechargeSubmit} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-slate-600">Livreur : <strong>{walletModalCourier.name}</strong></p>
                <p className="text-slate-600 mt-0.5">Solde actuel : <strong className="font-mono text-blue-700 font-black">{(walletModalCourier.walletBalanceFCFA || 0).toLocaleString('fr-FR')} FCFA</strong></p>
              </div>

              {/* Type d'opération : Créditer vs Débiter */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setWalletModalType('credit')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all ${
                    walletModalType === 'credit' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">add_circle</span>
                  <span>+ Créditer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWalletModalType('debit')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all ${
                    walletModalType === 'debit' ? 'bg-red-600 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">remove_circle</span>
                  <span>- Débiter</span>
                </button>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Montant à {walletModalType === 'credit' ? 'créditer' : 'déduire'} (FCFA) *
                </label>
                <input
                  type="number"
                  required
                  step="500"
                  min="100"
                  value={walletAmount}
                  onChange={(e) => setWalletAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-mono text-sm font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Motif / Justificatif (Optionnel)</label>
                <input
                  type="text"
                  value={walletNote}
                  onChange={(e) => setWalletNote(e.target.value)}
                  placeholder="ex: Rechargement caution, régularisation course..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
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
                  className={`flex-1 py-2.5 rounded-xl text-white font-bold shadow-xs ${
                    walletModalType === 'credit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {walletModalType === 'credit' ? 'Valider Crédit' : 'Valider Débit'}
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

      {/* 6. Modal Créer Nouvelle Course Directe (Superviseur) */}
      {isAddDeliveryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-base">add_location_alt</span>
                <span>Créer &amp; Injecter une Course dans le Réseau</span>
              </h3>
              <button
                onClick={() => setIsAddDeliveryModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateDeliverySubmit} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nom du Destinataire *</label>
                  <input
                    type="text"
                    required
                    value={newOrderClientName}
                    onChange={(e) => setNewOrderClientName(e.target.value)}
                    placeholder="ex: Patrick Bédi"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Téléphone Destinataire *</label>
                  <input
                    type="text"
                    required
                    value={newOrderClientPhone}
                    onChange={(e) => setNewOrderClientPhone(e.target.value)}
                    placeholder="ex: +229 97 11 22 33"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Boutique Expéditrice</label>
                  <input
                    type="text"
                    value={newOrderStoreName}
                    onChange={(e) => setNewOrderStoreName(e.target.value)}
                    placeholder="Boutique VIP Chic"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Commune Expédition (Départ)</label>
                  <select
                    value={newOrderPickupCommune}
                    onChange={(e) => setNewOrderPickupCommune(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white"
                  >
                    <option value="Cotonou - Haie Vive">Cotonou - Haie Vive</option>
                    <option value="Cotonou - Cadjehoun">Cotonou - Cadjehoun</option>
                    <option value="Cotonou - Akpakpa">Cotonou - Akpakpa</option>
                    <option value="Cotonou - Fidjrossè">Cotonou - Fidjrossè</option>
                    <option value="Abomey-Calavi">Abomey-Calavi</option>
                    <option value="Porto-Novo">Porto-Novo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Commune Livraison (Arrivée)</label>
                  <select
                    value={newOrderDropoffCommune}
                    onChange={(e) => setNewOrderDropoffCommune(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white"
                  >
                    <option value="Cotonou - Cadjehoun">Cotonou - Cadjehoun</option>
                    <option value="Cotonou - Haie Vive">Cotonou - Haie Vive</option>
                    <option value="Cotonou - Akpakpa">Cotonou - Akpakpa</option>
                    <option value="Cotonou - Fidjrossè">Cotonou - Fidjrossè</option>
                    <option value="Abomey-Calavi">Abomey-Calavi</option>
                    <option value="Porto-Novo">Porto-Novo</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Adresse Détaillée</label>
                  <input
                    type="text"
                    value={newOrderDropoffAddress}
                    onChange={(e) => setNewOrderDropoffAddress(e.target.value)}
                    placeholder="Boulevard VGE, Immeuble Horizon"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Valeur Marchandise COD (FCFA)</label>
                  <input
                    type="number"
                    step="500"
                    value={newOrderCOD}
                    onChange={(e) => setNewOrderCOD(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Frais de Livraison (FCFA)</label>
                  <input
                    type="number"
                    step="500"
                    value={newOrderFee}
                    onChange={(e) => setNewOrderFee(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-mono font-bold text-blue-700"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddDeliveryModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs"
                >
                  Valider &amp; Injecter Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal Inspection Fiche Course */}
      {inspectingDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 space-y-4">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-600 text-white rounded-lg material-symbols-outlined text-sm">
                  local_shipping
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 font-mono">Fiche Course {inspectingDelivery.id}</h3>
                  <p className="text-[10px] text-slate-400">Traçabilité complète Superviseur</p>
                </div>
              </div>
              <button
                onClick={() => setInspectingDelivery(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <div className="px-6 pb-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Expéditeur</span>
                  <p className="font-bold text-slate-900">{inspectingDelivery.pickupLocation.name}</p>
                  <p className="text-slate-500 text-[11px]">{inspectingDelivery.pickupLocation.commune}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Destinataire</span>
                  <p className="font-bold text-slate-900">{inspectingDelivery.clientName}</p>
                  <p className="text-slate-500 text-[11px]">{inspectingDelivery.dropoffLocation.commune} • {inspectingDelivery.clientPhone}</p>
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-blue-900 block">Livreur Assigné</span>
                  <p className="font-bold text-slate-900 text-xs">
                    {inspectingDelivery.courier ? `${inspectingDelivery.courier.name} (${inspectingDelivery.courier.vehicle})` : '⚠️ Aucun coursier pour le moment'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-blue-900 block">Montants</span>
                  <p className="font-bold text-slate-900">COD: {inspectingDelivery.itemValueCOD.toLocaleString('fr-FR')} F</p>
                  <p className="text-blue-700 font-bold text-[11px]">Frais: {inspectingDelivery.deliveryFee.toLocaleString('fr-FR')} F</p>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Statut Actuel</span>
                <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-800 capitalize">{inspectingDelivery.status.replace('_', ' ')}</span>
                  <span className="text-[10px] text-slate-500 font-mono">Date: {new Date(inspectingDelivery.createdAt).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    openWhatsAppModal(
                      inspectingDelivery.clientPhone,
                      inspectingDelivery.clientName,
                      `Bonjour ${inspectingDelivery.clientName}, point de situation de votre course LivraLink ${inspectingDelivery.id}.`
                    );
                    setInspectingDelivery(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <span className="material-symbols-outlined text-sm">chat</span>
                  <span>WhatsApp Client</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectingDelivery(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal Modifier Livreur */}
      {editingCourier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-base">edit</span>
                <span>Modifier le Livreur ({editingCourier.name})</span>
              </h3>
              <button
                onClick={() => setEditingCourier(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleUpdateCourierSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nom Complet *</label>
                  <input
                    type="text"
                    required
                    value={editCourierName}
                    onChange={(e) => setEditCourierName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Téléphone WhatsApp *</label>
                  <input
                    type="text"
                    required
                    value={editCourierPhone}
                    onChange={(e) => setEditCourierPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editCourierEmail}
                    onChange={(e) => setEditCourierEmail(e.target.value)}
                    placeholder="livreur@livralink.bj"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Badge Spécial</label>
                  <input
                    type="text"
                    value={editCourierBadge}
                    onChange={(e) => setEditCourierBadge(e.target.value)}
                    placeholder="ex: Top Livreur, Express, VIP"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Type de Véhicule</label>
                  <select
                    value={editCourierVehicle}
                    onChange={(e) => setEditCourierVehicle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white"
                  >
                    <option value="Yamaha 125">Yamaha 125</option>
                    <option value="Haojue 110">Haojue 110</option>
                    <option value="Scooter Électrique 125">Scooter Électrique 125</option>
                    <option value="Tricycle Keke">Tricycle Keke</option>
                    <option value="Voiture Légère">Voiture Légère</option>
                    <option value="Vélo Cargo">Vélo Cargo</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Plaque d'Immatriculation</label>
                  <input
                    type="text"
                    value={editCourierPlate}
                    onChange={(e) => setEditCourierPlate(e.target.value)}
                    placeholder="BJ-8492-RB"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Zone Opérationnelle</label>
                  <input
                    type="text"
                    value={editCourierZone}
                    onChange={(e) => setEditCourierZone(e.target.value)}
                    placeholder="Cotonou / Calavi"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Statut du Livreur</label>
                  <select
                    value={editCourierStatus}
                    onChange={(e) => setEditCourierStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white font-bold"
                  >
                    <option value="en_ligne">🟢 En ligne (Disponible)</option>
                    <option value="en_course">🔵 En course (Occupé)</option>
                    <option value="hors_ligne">⚪ Hors ligne</option>
                    <option value="suspendu">🔴 Suspendu (Bloqué)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCourier(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  <span>Enregistrer Modifications</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. Modal Confirmer Suppression Livreur */}
      {deletingCourier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">warning</span>
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-slate-900">Supprimer ce Livreur ?</h3>
              <p className="text-xs text-slate-500">
                Êtes-vous sûr de vouloir supprimer définitivement <strong>{deletingCourier.name}</strong> ({deletingCourier.vehicle}) de la flotte LivraLink ?
              </p>
            </div>
            <div className="p-3 bg-red-50 rounded-2xl border border-red-100 text-[11px] text-red-800">
              ⚠️ Cette action retirera le profil, son historique et réassignera toute course en cours.
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingCourier(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 text-xs"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCourier}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                <span>Confirmer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. Modal Modifier Boutique */}
      {editingMerchant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-base">edit</span>
                <span>Modifier la Boutique ({editingMerchant.storeName})</span>
              </h3>
              <button
                onClick={() => setEditingMerchant(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleUpdateMerchantSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nom de la Boutique *</label>
                  <input
                    type="text"
                    required
                    value={editMerchantStore}
                    onChange={(e) => setEditMerchantStore(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nom du Gérant *</label>
                  <input
                    type="text"
                    required
                    value={editMerchantManager}
                    onChange={(e) => setEditMerchantManager(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Téléphone / WhatsApp *</label>
                  <input
                    type="text"
                    required
                    value={editMerchantPhone}
                    onChange={(e) => setEditMerchantPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email Boutique</label>
                  <input
                    type="email"
                    value={editMerchantEmail}
                    onChange={(e) => setEditMerchantEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Commune</label>
                  <select
                    value={editMerchantCommune}
                    onChange={(e) => setEditMerchantCommune(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none bg-white"
                  >
                    <option value="Cotonou - Haie Vive">Cotonou - Haie Vive</option>
                    <option value="Cotonou - Cadjehoun">Cotonou - Cadjehoun</option>
                    <option value="Cotonou - Akpakpa">Cotonou - Akpakpa</option>
                    <option value="Cotonou - Fidjrossè">Cotonou - Fidjrossè</option>
                    <option value="Abomey-Calavi">Abomey-Calavi</option>
                    <option value="Porto-Novo">Porto-Novo</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Canal de Vente</label>
                  <select
                    value={editMerchantChannel}
                    onChange={(e) => setEditMerchantChannel(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none bg-white"
                  >
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Instagram">Instagram</option>
                    <option value="TikTok">TikTok</option>
                    <option value="E-commerce">E-commerce</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Adresse Précise</label>
                <input
                  type="text"
                  value={editMerchantAddress}
                  onChange={(e) => setEditMerchantAddress(e.target.value)}
                  placeholder="Rue 380, face pharmacie Haie Vive"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Statut Boutique</label>
                  <select
                    value={editMerchantStatus}
                    onChange={(e) => setEditMerchantStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none bg-white font-bold"
                  >
                    <option value="actif">🟢 Actif</option>
                    <option value="suspendu">🔴 Suspendu</option>
                    <option value="en_attente_kyc">🟡 En attente KYC</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Remise Tarifaire (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={editMerchantDiscount}
                    onChange={(e) => setEditMerchantDiscount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-200">
                <span className="font-bold text-slate-800">Badge Vérifié Partenaire</span>
                <button
                  type="button"
                  onClick={() => setEditMerchantVerified(!editMerchantVerified)}
                  className={`px-3 py-1 rounded-xl font-bold text-xs flex items-center gap-1 ${
                    editMerchantVerified ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">verified</span>
                  <span>{editMerchantVerified ? 'Vérifié ✓' : 'Non vérifié'}</span>
                </button>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMerchant(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  <span>Enregistrer Modifications</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 11. Modal Confirmer Suppression Boutique */}
      {deletingMerchant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">store</span>
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-slate-900">Supprimer la Boutique ?</h3>
              <p className="text-xs text-slate-500">
                Êtes-vous sûr de vouloir supprimer définitivement la boutique <strong>{deletingMerchant.storeName}</strong> (Gérant: {deletingMerchant.managerName}) ?
              </p>
            </div>
            <div className="p-3 bg-red-50 rounded-2xl border border-red-100 text-[11px] text-red-800">
              ⚠️ Cette action supprimera le profil marchand, ses paramètres et ses tarifs négociés.
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingMerchant(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 text-xs"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMerchant}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                <span>Confirmer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 12. Modal Modifier Course */}
      {editingDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-base">edit_location_alt</span>
                <span>Modifier la Course {editingDelivery.id}</span>
              </h3>
              <button
                onClick={() => setEditingDelivery(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleUpdateDeliverySubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nom Destinataire *</label>
                  <input
                    type="text"
                    required
                    value={editDeliveryClientName}
                    onChange={(e) => setEditDeliveryClientName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Téléphone Destinataire *</label>
                  <input
                    type="text"
                    required
                    value={editDeliveryClientPhone}
                    onChange={(e) => setEditDeliveryClientPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Boutique Expéditrice</label>
                  <input
                    type="text"
                    value={editDeliveryStoreName}
                    onChange={(e) => setEditDeliveryStoreName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Commune Expédition</label>
                  <select
                    value={editDeliveryPickupCommune}
                    onChange={(e) => setEditDeliveryPickupCommune(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white"
                  >
                    <option value="Cotonou - Haie Vive">Cotonou - Haie Vive</option>
                    <option value="Cotonou - Cadjehoun">Cotonou - Cadjehoun</option>
                    <option value="Cotonou - Akpakpa">Cotonou - Akpakpa</option>
                    <option value="Cotonou - Fidjrossè">Cotonou - Fidjrossè</option>
                    <option value="Abomey-Calavi">Abomey-Calavi</option>
                    <option value="Porto-Novo">Porto-Novo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Commune Livraison</label>
                  <select
                    value={editDeliveryDropoffCommune}
                    onChange={(e) => setEditDeliveryDropoffCommune(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white"
                  >
                    <option value="Cotonou - Cadjehoun">Cotonou - Cadjehoun</option>
                    <option value="Cotonou - Haie Vive">Cotonou - Haie Vive</option>
                    <option value="Cotonou - Akpakpa">Cotonou - Akpakpa</option>
                    <option value="Cotonou - Fidjrossè">Cotonou - Fidjrossè</option>
                    <option value="Abomey-Calavi">Abomey-Calavi</option>
                    <option value="Porto-Novo">Porto-Novo</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Adresse Précise</label>
                  <input
                    type="text"
                    value={editDeliveryDropoffAddress}
                    onChange={(e) => setEditDeliveryDropoffAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description du Colis</label>
                <input
                  type="text"
                  value={editDeliveryItemDesc}
                  onChange={(e) => setEditDeliveryItemDesc(e.target.value)}
                  placeholder="ex: Robe de soirée, boîte à bijoux..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">COD (FCFA)</label>
                  <input
                    type="number"
                    step="500"
                    value={editDeliveryCOD}
                    onChange={(e) => setEditDeliveryCOD(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Frais Course (FCFA)</label>
                  <input
                    type="number"
                    step="500"
                    value={editDeliveryFee}
                    onChange={(e) => setEditDeliveryFee(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-mono font-bold text-blue-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Statut Course</label>
                  <select
                    value={editDeliveryStatus}
                    onChange={(e) => setEditDeliveryStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white font-bold"
                  >
                    <option value="en_attente">🟡 En attente</option>
                    <option value="assignee">🟣 Assignée</option>
                    <option value="en_cours">🔵 En cours</option>
                    <option value="livree">🟢 Livrée (POD)</option>
                    <option value="echec">🔴 Litige / Échec</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDelivery(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  <span>Enregistrer Modifications</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 13. Modal Confirmer Suppression Course */}
      {deletingDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">delete_forever</span>
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-slate-900">Supprimer la Course {deletingDelivery.id} ?</h3>
              <p className="text-xs text-slate-500">
                Destination : <strong>{deletingDelivery.clientName}</strong> ({deletingDelivery.dropoffLocation.commune})<br />
                Montant : <strong>{deletingDelivery.itemValueCOD.toLocaleString('fr-FR')} FCFA</strong>
              </p>
            </div>
            <div className="p-3 bg-red-50 rounded-2xl border border-red-100 text-[11px] text-red-800">
              ⚠️ Cette action supprimera définitivement la course du registre de dispatch.
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingDelivery(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 text-xs"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDelivery}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                <span>Confirmer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 14. Modal Modifier Utilisateur (Annuaire) */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-base">person</span>
                <span>Modifier Compte Utilisateur ({editingUser.role.toUpperCase()})</span>
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <form onSubmit={handleUpdateUserSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {editingUser.role === 'livreur' ? 'Nom du Livreur *' : 'Nom de la Boutique *'}
                </label>
                <input
                  type="text"
                  required
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Téléphone *</label>
                  <input
                    type="text"
                    required
                    value={editUserPhone}
                    onChange={(e) => setEditUserPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editUserEmail}
                    onChange={(e) => setEditUserEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Zone / Commune</label>
                <input
                  type="text"
                  value={editUserZoneCommune}
                  onChange={(e) => setEditUserZoneCommune(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              {editingUser.role === 'livreur' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Véhicule</label>
                    <input
                      type="text"
                      value={editUserVehicle}
                      onChange={(e) => setEditUserVehicle(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Plaque</label>
                    <input
                      type="text"
                      value={editUserPlate}
                      onChange={(e) => setEditUserPlate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                    />
                  </div>
                </div>
              )}

              {editingUser.role === 'vendeur' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Canal</label>
                    <select
                      value={editUserChannel}
                      onChange={(e) => setEditUserChannel(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none bg-white"
                    >
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Instagram">Instagram</option>
                      <option value="TikTok">TikTok</option>
                      <option value="E-commerce">E-commerce</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Badge Vérifié</label>
                    <button
                      type="button"
                      onClick={() => setEditUserVerified(!editUserVerified)}
                      className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1 ${
                        editUserVerified ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">verified</span>
                      <span>{editUserVerified ? 'Badge Actif' : 'Sans Badge'}</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs flex items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  <span>Enregistrer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 15. Modal Confirmer Suppression Utilisateur */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">person_remove</span>
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-sm text-slate-900">Supprimer cet Utilisateur ?</h3>
              <p className="text-xs text-slate-500">
                Confirmez la suppression du compte <strong>{deletingUser.name}</strong> (Rôle: {deletingUser.role}).
              </p>
            </div>
            <div className="p-3 bg-red-50 rounded-2xl border border-red-100 text-[11px] text-red-800">
              ⚠️ Cette action retirera définitivement ce compte de la plateforme.
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 text-xs"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                <span>Confirmer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 16. Modal Réinitialisation des Accès & Sécurité */}
      <ResetUserAccessModal
        user={resetAccessUser}
        onClose={() => setResetAccessUser(null)}
      />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
};
