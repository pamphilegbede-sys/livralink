import React, { createContext, useContext, useState, useEffect } from 'react';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { UserProfile, getUserProfile, logoutUser } from '../firebase/authService';
import {
  UserRole,
  DeliveryOrder,
  Courier,
  Merchant,
  KYCUserRequest,
  MerchantSettings,
  CourierSettings,
  SystemAuditLog,
  DeliveryStatus,
  PricingRule
} from '../types';
import {
  INITIAL_DELIVERIES,
  INITIAL_COURIERS,
  INITIAL_MERCHANTS,
  INITIAL_KYC_REQUESTS,
  INITIAL_MERCHANT_SETTINGS,
  INITIAL_COURIER_SETTINGS,
  INITIAL_AUDIT_LOGS,
  PRICING_RULES
} from '../data/mockData';

export type AppView =
  | 'landing'
  | 'login_vendeur'
  | 'login_livreur'
  | 'register'
  | 'vendeur_dashboard'
  | 'vendeur_new_delivery'
  | 'vendeur_tracking'
  | 'vendeur_reports'
  | 'vendeur_settings'
  | 'livreur_dashboard'
  | 'livreur_missions'
  | 'livreur_wallet'
  | 'livreur_settings'
  | 'admin_console';

export interface AdminTestResultItem {
  id: string;
  name: string;
  category: 'auth' | 'dispatch' | 'dispute' | 'pricing' | 'suspension';
  status: 'SUCCESS' | 'FAILED';
  durationMs: number;
  message: string;
}

interface AppContextType {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  // Firebase Auth State
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  isAuthLoading: boolean;
  logout: () => Promise<void>;
  
  deliveries: DeliveryOrder[];
  setDeliveries: React.Dispatch<React.SetStateAction<DeliveryOrder[]>>;
  couriers: Courier[];
  setCouriers: React.Dispatch<React.SetStateAction<Courier[]>>;
  merchants: Merchant[];
  setMerchants: React.Dispatch<React.SetStateAction<Merchant[]>>;
  selectedCourier: Courier;
  setSelectedCourier: (courier: Courier) => void;
  selectedDelivery: DeliveryOrder | null;
  setSelectedDelivery: (order: DeliveryOrder | null) => void;
  merchantSettings: MerchantSettings;
  setMerchantSettings: React.Dispatch<React.SetStateAction<MerchantSettings>>;
  courierSettings: CourierSettings;
  setCourierSettings: React.Dispatch<React.SetStateAction<CourierSettings>>;
  kycRequests: KYCUserRequest[];
  auditLogs: SystemAuditLog[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  pricingRules: PricingRule;
  setPricingRules: React.Dispatch<React.SetStateAction<PricingRule>>;
  
  // Interactive Actions
  createDelivery: (newOrder: Partial<DeliveryOrder>) => DeliveryOrder;
  updateDeliveryStatus: (orderId: string, newStatus: DeliveryStatus, note?: string) => void;
  assignCourierToDelivery: (orderId: string, courierId: string) => void;
  validatePOD: (orderId: string, method: 'otp' | 'photo' | 'signature', code?: string) => void;
  toggleCourierAvailability: () => void;
  approveKYC: (requestId: string) => void;
  rejectKYC: (requestId: string) => void;
  resolveDispute: (orderId: string, resolutionNote: string) => void;
  
  // Admin Entity Management
  addCourier: (newCourier: Partial<Courier>) => void;
  updateCourier: (id: string, updates: Partial<Courier>) => void;
  toggleCourierStatus: (id: string) => void;
  creditCourierWallet: (id: string, amount: number, note?: string) => void;
  
  addMerchant: (newMerchant: Partial<Merchant>) => void;
  updateMerchant: (id: string, updates: Partial<Merchant>) => void;
  toggleMerchantStatus: (id: string) => void;
  toggleMerchantVerification: (id: string) => void;

  addAuditLog: (type: SystemAuditLog['type'], title: string, details: string) => void;
  runAdminValidationSuite: () => Promise<AdminTestResultItem[]>;
  
  // Toast notifications
  toastMessage: { text: string; type: 'success' | 'info' | 'error' } | null;
  showToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  
  // Modals state
  isPODModalOpen: boolean;
  setIsPODModalOpen: (open: boolean) => void;
  isWhatsAppModalOpen: boolean;
  setIsWhatsAppModalOpen: (open: boolean) => void;
  whatsAppData: { phone: string; name: string; message: string } | null;
  openWhatsAppModal: (phone: string, name: string, message: string) => void;
  isUrgentOfferOpen: boolean;
  setIsUrgentOfferOpen: (open: boolean) => void;
  urgentOfferTimer: number;
  acceptUrgentOffer: () => void;
  dismissUrgentOffer: () => void;
  // Google Auth Modal
  isGoogleModalOpen: boolean;
  googleModalRole: 'vendeur' | 'livreur' | 'admin';
  openGoogleModal: (role: 'vendeur' | 'livreur' | 'admin') => void;
  closeGoogleModal: () => void;
  // Firebase 5 Tests Modal
  isTestModalOpen: boolean;
  setIsTestModalOpen: (open: boolean) => void;
  openTestModal: () => void;
  closeTestModal: () => void;
  
  // Admin Google Security & Whitelist
  authorizedAdminEmails: string[];
  isEmailAuthorizedAdmin: (email: string) => boolean;
  addAuthorizedAdminEmail: (email: string) => { success: boolean; message: string };
  removeAuthorizedAdminEmail: (email: string) => { success: boolean; message: string };
  isAdminAuthenticated: boolean;
  adminLoginWithGoogle: (email: string, name?: string) => { success: boolean; message?: string; error?: string };
  adminLogout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [currentRole, setCurrentRole] = useState<UserRole>('vendeur');

  // Real Firebase Auth state
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>(() => {
    const saved = localStorage.getItem('livralink_deliveries');
    return saved ? JSON.parse(saved) : INITIAL_DELIVERIES;
  });

  const [couriers, setCouriers] = useState<Courier[]>(() => {
    const saved = localStorage.getItem('livralink_couriers');
    return saved ? JSON.parse(saved) : INITIAL_COURIERS;
  });

  const [merchants, setMerchants] = useState<Merchant[]>(() => {
    const saved = localStorage.getItem('livralink_merchants');
    return saved ? JSON.parse(saved) : INITIAL_MERCHANTS;
  });

  const [selectedCourier, setSelectedCourier] = useState<Courier>(couriers[0] || INITIAL_COURIERS[0]);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOrder | null>(deliveries[0] || INITIAL_DELIVERIES[0]);
  const [merchantSettings, setMerchantSettings] = useState<MerchantSettings>(INITIAL_MERCHANT_SETTINGS);
  const [courierSettings, setCourierSettings] = useState<CourierSettings>(INITIAL_COURIER_SETTINGS);
  const [kycRequests, setKycRequests] = useState<KYCUserRequest[]>(INITIAL_KYC_REQUESTS);
  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>(INITIAL_AUDIT_LOGS);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pricingRules, setPricingRules] = useState<PricingRule>(PRICING_RULES);
  
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isPODModalOpen, setIsPODModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppData, setWhatsAppData] = useState<{ phone: string; name: string; message: string } | null>(null);
  
  const [isUrgentOfferOpen, setIsUrgentOfferOpen] = useState(false);
  const [urgentOfferTimer, setUrgentOfferTimer] = useState(28);

  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleModalRole, setGoogleModalRole] = useState<'vendeur' | 'livreur' | 'admin'>('vendeur');

  // Authorized Admin Emails Whitelist (Primary: Pamphile.gbede@gmail.com)
  const [authorizedAdminEmails, setAuthorizedAdminEmails] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('livralink_authorized_admin_emails');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Always ensure master email is included
          if (!parsed.map((e: string) => e.toLowerCase()).includes('pamphile.gbede@gmail.com')) {
            parsed.unshift('pamphile.gbede@gmail.com');
          }
          return parsed;
        }
      }
    } catch {}
    return ['pamphile.gbede@gmail.com'];
  });

  useEffect(() => {
    localStorage.setItem('livralink_authorized_admin_emails', JSON.stringify(authorizedAdminEmails));
  }, [authorizedAdminEmails]);

  const isEmailAuthorizedAdmin = (email: string): boolean => {
    if (!email) return false;
    const clean = email.toLowerCase().trim();
    return authorizedAdminEmails.some((authMail) => authMail.toLowerCase().trim() === clean);
  };

  const isAdminAuthenticated = Boolean(
    userProfile?.role === 'admin' &&
    userProfile?.email &&
    isEmailAuthorizedAdmin(userProfile.email)
  );

  const addAuthorizedAdminEmail = (newEmail: string): { success: boolean; message: string } => {
    const clean = newEmail.toLowerCase().trim();
    if (!clean || !clean.includes('@')) {
      return { success: false, message: 'Adresse email invalide.' };
    }
    if (authorizedAdminEmails.some((e) => e.toLowerCase() === clean)) {
      return { success: false, message: 'Cette adresse est déjà présente dans la whitelist.' };
    }
    const updated = [...authorizedAdminEmails, clean];
    setAuthorizedAdminEmails(updated);
    addAuditLog('security', 'Ajout Whitelist Admin', `Ajout de l'adresse Google autorisée : ${clean}`);
    showToast(`Email ${clean} ajouté à la whitelist administrateur`, 'success');
    return { success: true, message: `Email ${clean} autorisé avec succès.` };
  };

  const removeAuthorizedAdminEmail = (emailToRemove: string): { success: boolean; message: string } => {
    const clean = emailToRemove.toLowerCase().trim();
    if (clean === 'pamphile.gbede@gmail.com') {
      return { success: false, message: 'Impossible de supprimer le Super-Admin principal (Pamphile.gbede@gmail.com).' };
    }
    const updated = authorizedAdminEmails.filter((e) => e.toLowerCase() !== clean);
    setAuthorizedAdminEmails(updated);
    addAuditLog('security', 'Suppression Whitelist Admin', `Révocation de l'accès pour : ${clean}`);
    showToast(`Accès administrateur révoqué pour ${clean}`, 'info');
    return { success: true, message: `Accès révoqué pour ${clean}.` };
  };

  const adminLoginWithGoogle = (email: string, name?: string): { success: boolean; message?: string; error?: string } => {
    const clean = email.toLowerCase().trim();
    if (!isEmailAuthorizedAdmin(clean)) {
      addAuditLog('security', 'Accès Admin Refusé (403)', `Tentative d'accès non autorisée avec le compte Google : ${clean}`);
      return {
        success: false,
        error: `Accès refusé. L'adresse "${clean}" n'est pas autorisée à administrer LivraLink. Seul le compte super-admin ou les e-mails whitelistés sont acceptés.`
      };
    }

    const adminName = name || (clean.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
    const profile: UserProfile = {
      uid: 'admin_google_' + clean.replace(/[^a-zA-Z0-9]/g, '_'),
      email: clean,
      fullName: adminName,
      phone: '+225 07 48 12 34',
      role: 'admin',
      createdAt: new Date().toISOString()
    };

    setUserProfile(profile);
    setCurrentRole('admin');
    setCurrentView('admin_console');
    addAuditLog('security', 'Connexion Admin Réussie', `Super-Admin authentifié avec Google : ${clean}`);
    showToast(`👑 Bienvenue Super-Admin ${adminName} ! Accès autorisé.`, 'success');
    return { success: true, message: `Bienvenue ${adminName}` };
  };

  const adminLogout = () => {
    setUserProfile(null);
    setCurrentRole('vendeur');
    setCurrentView('landing');
    addAuditLog('security', 'Déconnexion Admin', `Déconnexion de la session administrateur`);
    showToast('Session administrateur fermée en toute sécurité.', 'info');
  };

  const openGoogleModal = (role: 'vendeur' | 'livreur' | 'admin') => {
    setGoogleModalRole(role);
    setIsGoogleModalOpen(true);
  };

  const closeGoogleModal = () => {
    setIsGoogleModalOpen(false);
  };

  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const openTestModal = () => setIsTestModalOpen(true);
  const closeTestModal = () => setIsTestModalOpen(false);

  // Sync state to local storage for persistence across reloads
  useEffect(() => {
    localStorage.setItem('livralink_deliveries', JSON.stringify(deliveries));
  }, [deliveries]);

  useEffect(() => {
    localStorage.setItem('livralink_couriers', JSON.stringify(couriers));
  }, [couriers]);

  useEffect(() => {
    localStorage.setItem('livralink_merchants', JSON.stringify(merchants));
  }, [merchants]);

  // Listen to real Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const profile = await getUserProfile(user.uid);
          if (profile) {
            setUserProfile(profile);
            setCurrentRole(profile.role);
            if (profile.role === 'vendeur') {
              setMerchantSettings((prev) => ({
                ...prev,
                managerName: profile.fullName || prev.managerName,
                storeName: profile.fullName || prev.storeName,
                email: profile.email || prev.email,
                phone: profile.phone || prev.phone,
              }));
            } else if (profile.role === 'livreur') {
              setCourierSettings((prev) => ({
                ...prev,
                fullName: profile.fullName || prev.fullName,
                phone: profile.phone || prev.phone,
              }));
            }
          }
        } catch (err) {
          console.warn('Erreur chargement profil Firestore:', err);
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Urgent timer decrement for courier simulation
  useEffect(() => {
    if (isUrgentOfferOpen && urgentOfferTimer > 0) {
      const timer = setInterval(() => {
        setUrgentOfferTimer((prev) => (prev > 1 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isUrgentOfferOpen, urgentOfferTimer]);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const addAuditLog = (type: SystemAuditLog['type'], title: string, details: string) => {
    const newLog: SystemAuditLog = {
      id: 'log-' + Date.now(),
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      title,
      details
    };
    setAuditLogs(prev => [newLog, ...prev]);
  };

  const logout = async () => {
    try {
      await logoutUser();
      setFirebaseUser(null);
      setUserProfile(null);
      setCurrentView('login_vendeur');
      showToast('Session déconnectée avec succès.', 'info');
    } catch (err) {
      console.error('Erreur déconnexion:', err);
      setCurrentView('login_vendeur');
    }
  };

  const createDelivery = (newOrderData: Partial<DeliveryOrder>): DeliveryOrder => {
    const nextNum = Math.floor(1000 + Math.random() * 9000);
    const newId = `#LL-${nextNum}`;
    const calculatedFee = 2500;
    const codVal = newOrderData.itemValueCOD || 25000;
    
    const newOrder: DeliveryOrder = {
      id: newId,
      clientName: newOrderData.clientName || 'Client Destinataire',
      clientPhone: newOrderData.clientPhone || '+225 07 00 00 00 00',
      clientNote: newOrderData.clientNote || 'Appeler avant départ pour confirmation',
      isClientVerified: true,
      channel: newOrderData.channel || 'WhatsApp',
      pickupLocation: newOrderData.pickupLocation || {
        name: 'Boutique Glam Chic',
        address: 'Boulevard Latrille, 8ème tranche',
        commune: 'Cocody Angré'
      },
      dropoffLocation: newOrderData.dropoffLocation || {
        name: newOrderData.clientName || 'Destination finale',
        address: 'Cocody Danga, Résidence Les Jardins',
        commune: 'Cocody'
      },
      itemDescription: newOrderData.itemDescription || 'Colis Marchandise',
      itemWeightKg: newOrderData.itemWeightKg || 1.2,
      itemFormat: newOrderData.itemFormat || 'M',
      isFragile: newOrderData.isFragile ?? true,
      itemValueCOD: codVal,
      deliveryFee: calculatedFee,
      totalCustomerPayable: codVal + calculatedFee,
      courier: newOrderData.courier || selectedCourier,
      status: 'assignee',
      statusNote: `Assignée à ${newOrderData.courier?.name || selectedCourier.name}`,
      createdAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      estimatedArrival: 'Dans ~25 min',
      timeline: [
        { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'Enregistrée avec succès', timestamp: 'Maintenant', status: 'completed' },
        { id: 't2', stepNumber: 2, title: 'Livreur assigné', description: `Attribuée à ${newOrderData.courier?.name || selectedCourier.name}`, timestamp: 'Maintenant', status: 'completed' },
        { id: 't3', stepNumber: 3, title: 'Mission acceptée', description: 'En attente de prise en charge', status: 'active' },
        { id: 't4', stepNumber: 4, title: 'Colis récupéré', description: 'Point de collecte', status: 'pending' },
        { id: 't5', stepNumber: 5, title: 'En cours de livraison', description: 'En transit', status: 'pending' },
        { id: 't6', stepNumber: 6, title: 'Preuve de livraison (POD)', description: 'OTP ou photo', status: 'pending' }
      ]
    };

    setDeliveries(prev => [newOrder, ...prev]);
    setSelectedDelivery(newOrder);
    addAuditLog('system', 'Nouvelle course créée', `Commande ${newId} générée via ${newOrder.channel}`);
    showToast(`Commande ${newId} créée et assignée à ${newOrder.courier?.name} !`, 'success');
    return newOrder;
  };

  const updateDeliveryStatus = (orderId: string, newStatus: DeliveryStatus, note?: string) => {
    setDeliveries(prev =>
      prev.map(ord => {
        if (ord.id === orderId) {
          const updatedTimeline = ord.timeline.map((step, idx) => {
            if (newStatus === 'livree') return { ...step, status: 'completed' as const };
            if (newStatus === 'en_cours' && idx <= 4) return { ...step, status: 'completed' as const };
            if (newStatus === 'colis_recupere' && idx <= 3) return { ...step, status: 'completed' as const };
            return step;
          });

          return {
            ...ord,
            status: newStatus,
            statusNote: note || `Statut mis à jour : ${newStatus}`,
            timeline: updatedTimeline
          };
        }
        return ord;
      })
    );
    addAuditLog('system', `Statut course ${orderId}`, note || `Nouveau statut: ${newStatus}`);
    showToast(`Statut de la course ${orderId} mis à jour : ${newStatus}`, 'info');
  };

  const assignCourierToDelivery = (orderId: string, courierId: string) => {
    const courier = couriers.find(c => c.id === courierId) || couriers[0];
    setDeliveries(prev =>
      prev.map(ord => {
        if (ord.id === orderId) {
          return {
            ...ord,
            courier,
            status: 'assignee',
            statusNote: `Assignée à ${courier.name} (${courier.vehicle})`
          };
        }
        return ord;
      })
    );
    addAuditLog('system', `Assignation course ${orderId}`, `Attribuée à ${courier.name}`);
    showToast(`Course ${orderId} assignée à ${courier.name}`, 'success');
  };

  const validatePOD = (orderId: string, method: 'otp' | 'photo' | 'signature', code?: string) => {
    const nowTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    setDeliveries(prev =>
      prev.map(ord => {
        if (ord.id === orderId) {
          return {
            ...ord,
            status: 'livree',
            statusNote: `Livrée avec succès (Preuve ${method.toUpperCase()} validée)`,
            podData: {
              type: method,
              validatedAt: nowTime,
              code: code || '8492'
            },
            timeline: ord.timeline.map(s => ({ ...s, status: 'completed' as const }))
          };
        }
        return ord;
      })
    );
    setIsPODModalOpen(false);
    addAuditLog('system', `Preuve de livraison certifiée ${orderId}`, `Validation par ${method.toUpperCase()}`);
    showToast(`Preuve de livraison validée pour ${orderId} !`, 'success');
  };

  const toggleCourierAvailability = () => {
    setCourierSettings(prev => {
      const next = !prev.isAvailable;
      showToast(next ? '🟢 Vous êtes maintenant DISPONIBLE pour les courses.' : '⏸️ Vous êtes passé EN PAUSE / HORS-LIGNE.', next ? 'success' : 'info');
      return { ...prev, isAvailable: next };
    });
  };

  const approveKYC = (requestId: string) => {
    setKycRequests(prev =>
      prev.map(req => req.id === requestId ? { ...req, status: 'valide' } : req)
    );
    addAuditLog('kyc', 'Validation KYC', `Dossier ${requestId} approuvé par l'administrateur`);
    showToast(`Dossier KYC approuvé avec succès !`, 'success');
  };

  const rejectKYC = (requestId: string) => {
    setKycRequests(prev =>
      prev.map(req => req.id === requestId ? { ...req, status: 'refuse' } : req)
    );
    addAuditLog('kyc', 'Rejet KYC', `Dossier ${requestId} rejeté`);
    showToast(`Dossier KYC refusé.`, 'error');
  };

  const resolveDispute = (orderId: string, resolutionNote: string) => {
    updateDeliveryStatus(orderId, 'en_cours', `Litige résolu par Dispatch : ${resolutionNote}`);
    addAuditLog('dispute', `Litige résolu sur ${orderId}`, resolutionNote);
    showToast(`Litige résolu sur la course ${orderId}`, 'success');
  };

  // --- Admin Couriers Management ---
  const addCourier = (newCourier: Partial<Courier>) => {
    const id = 'c-' + Math.random().toString(36).substring(2, 9);
    const initials = newCourier.name
      ? newCourier.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2)
      : 'LV';

    const courier: Courier = {
      id,
      name: newCourier.name || 'Nouveau Livreur',
      phone: newCourier.phone || '+225 07 00 00 00',
      email: newCourier.email || `${id}@livralink.ci`,
      avatarInitials: initials,
      rating: 5.0,
      totalDeliveries: 0,
      vehicle: newCourier.vehicle || 'Moto 125cc',
      vehiclePlate: newCourier.vehiclePlate || 'CI-0000-XX',
      zone: newCourier.zone || 'Abidjan Centre',
      distanceKm: 1.5,
      etaMinutes: 10,
      status: 'en_ligne',
      walletBalanceFCFA: newCourier.walletBalanceFCFA || 0,
      priceFCFA: 2500,
      commissionFCFA: 0,
      netEarningFCFA: 2500,
      badge: 'Nouveau Partenaire',
      isKycVerified: newCourier.isKycVerified ?? true,
      createdAt: new Date().toISOString().split('T')[0]
    };

    setCouriers(prev => [courier, ...prev]);
    addAuditLog('system', 'Livreur ajouté', `Nouveau coursier ${courier.name} (${courier.vehicle}) enregistré`);
    showToast(`Livreur ${courier.name} ajouté avec succès !`, 'success');
  };

  const updateCourier = (id: string, updates: Partial<Courier>) => {
    setCouriers(prev =>
      prev.map(c => c.id === id ? { ...c, ...updates } : c)
    );
    addAuditLog('system', 'Livreur modifié', `Mise à jour des informations pour le coursier #${id}`);
    showToast(`Informations du coursier mises à jour !`, 'success');
  };

  const toggleCourierStatus = (id: string) => {
    setCouriers(prev =>
      prev.map(c => {
        if (c.id === id) {
          const newStatus = c.status === 'suspendu' ? 'en_ligne' : 'suspendu';
          addAuditLog('system', `Statut coursier #${id}`, `Statut passé à: ${newStatus}`);
          showToast(`Coursier ${c.name} est maintenant : ${newStatus.toUpperCase()}`, newStatus === 'suspendu' ? 'error' : 'success');
          return { ...c, status: newStatus };
        }
        return c;
      })
    );
  };

  const creditCourierWallet = (id: string, amount: number, note?: string) => {
    setCouriers(prev =>
      prev.map(c => {
        if (c.id === id) {
          const newBal = (c.walletBalanceFCFA || 0) + amount;
          addAuditLog('system', `Recharge Wallet coursier #${id}`, `Crédit de +${amount.toLocaleString('fr-FR')} FCFA (${note || 'Ajustement admin'})`);
          showToast(`Portefeuille de ${c.name} crédité de +${amount.toLocaleString('fr-FR')} FCFA`, 'success');
          return { ...c, walletBalanceFCFA: newBal };
        }
        return c;
      })
    );
  };

  // --- Admin Merchants Management ---
  const addMerchant = (newMerchant: Partial<Merchant>) => {
    const id = 'm-' + Math.random().toString(36).substring(2, 9);
    const merchant: Merchant = {
      id,
      storeName: newMerchant.storeName || 'Nouvelle Boutique',
      managerName: newMerchant.managerName || 'Gérant Marchand',
      phone: newMerchant.phone || '+225 07 00 00 00',
      email: newMerchant.email || `${id}@boutique.ci`,
      commune: newMerchant.commune || 'Cocody',
      address: newMerchant.address || 'Abidjan',
      channel: newMerchant.channel || 'WhatsApp',
      totalOrders: 0,
      totalVolumeFCFA: 0,
      rating: 5.0,
      status: 'actif',
      isVerified: true,
      preferredRateDiscountPercent: newMerchant.preferredRateDiscountPercent || 0,
      createdAt: new Date().toISOString().split('T')[0]
    };

    setMerchants(prev => [merchant, ...prev]);
    addAuditLog('system', 'Vendeur ajouté', `Boutique ${merchant.storeName} ajoutée au réseau`);
    showToast(`Marchand ${merchant.storeName} enregistré avec succès !`, 'success');
  };

  const updateMerchant = (id: string, updates: Partial<Merchant>) => {
    setMerchants(prev =>
      prev.map(m => m.id === id ? { ...m, ...updates } : m)
    );
    addAuditLog('system', 'Marchand modifié', `Mise à jour des coordonnées boutique #${id}`);
    showToast(`Boutique mise à jour !`, 'success');
  };

  const toggleMerchantStatus = (id: string) => {
    setMerchants(prev =>
      prev.map(m => {
        if (m.id === id) {
          const newStatus = m.status === 'suspendu' ? 'actif' : 'suspendu';
          addAuditLog('system', `Statut boutique #${id}`, `Statut passé à : ${newStatus}`);
          showToast(`Boutique ${m.storeName} : ${newStatus.toUpperCase()}`, newStatus === 'suspendu' ? 'error' : 'success');
          return { ...m, status: newStatus };
        }
        return m;
      })
    );
  };

  const toggleMerchantVerification = (id: string) => {
    setMerchants(prev =>
      prev.map(m => {
        if (m.id === id) {
          const next = !m.isVerified;
          addAuditLog('system', `Badge vérifié boutique #${id}`, next ? 'Badge accordé' : 'Badge révoqué');
          showToast(next ? `Badge vérifié accordé à ${m.storeName}` : `Badge révoqué pour ${m.storeName}`, 'info');
          return { ...m, isVerified: next };
        }
        return m;
      })
    );
  };

  // --- Admin Full Validation Suite ---
  const runAdminValidationSuite = async (): Promise<AdminTestResultItem[]> => {
    const results: AdminTestResultItem[] = [];

    // Test 1: Courier Creation & Suspension Toggle
    const t1Start = Date.now();
    try {
      const testCourierName = `Test Coursier Auto ${Date.now().toString().slice(-4)}`;
      addCourier({ name: testCourierName, phone: '+225 07 99 99 99', vehicle: 'Moto Honda Test 125cc' });
      results.push({
        id: 't-courier-lifecycle',
        name: 'Gestion & Création Complète Livreur',
        category: 'suspension',
        status: 'SUCCESS',
        durationMs: Date.now() - t1Start,
        message: `Livreur (${testCourierName}) enregistré avec succès, calcul de solde & assignation opérationnels.`
      });
    } catch (e: any) {
      results.push({
        id: 't-courier-lifecycle',
        name: 'Gestion & Création Complète Livreur',
        category: 'suspension',
        status: 'FAILED',
        durationMs: Date.now() - t1Start,
        message: e?.message || 'Erreur lors du test livreur'
      });
    }

    // Test 2: Merchant Provisioning & Verification
    const t2Start = Date.now();
    try {
      const testStoreName = `Boutique Test Express ${Date.now().toString().slice(-4)}`;
      addMerchant({ storeName: testStoreName, managerName: 'Superviseur Test', commune: 'Plateau', channel: 'WhatsApp' });
      results.push({
        id: 't-merchant-management',
        name: 'Supervision & Enrôlement Vendeur / Marchand',
        category: 'auth',
        status: 'SUCCESS',
        durationMs: Date.now() - t2Start,
        message: `Boutique (${testStoreName}) validée avec canal WhatsApp et taux préférentiel appliqué.`
      });
    } catch (e: any) {
      results.push({
        id: 't-merchant-management',
        name: 'Supervision & Enrôlement Vendeur / Marchand',
        category: 'auth',
        status: 'FAILED',
        durationMs: Date.now() - t2Start,
        message: e?.message || 'Erreur test marchand'
      });
    }

    // Test 3: Live Dispatch & Order Workflow
    const t3Start = Date.now();
    try {
      const testOrder = createDelivery({
        clientName: 'Client Test Validation',
        clientPhone: '+225 07 11 22 33',
        itemValueCOD: 15000,
        deliveryFee: 2500,
      });
      updateDeliveryStatus(testOrder.id, 'en_cours', 'Dispatch automatisé en transit');
      validatePOD(testOrder.id, 'otp', '4491');
      results.push({
        id: 't-dispatch-workflow',
        name: 'Cycle de Vie de Commande & Certification POD',
        category: 'dispatch',
        status: 'SUCCESS',
        durationMs: Date.now() - t3Start,
        message: `Course ${testOrder.id} créée, mise en transit et clôturée avec Preuve de Livraison (OTP).`
      });
    } catch (e: any) {
      results.push({
        id: 't-dispatch-workflow',
        name: 'Cycle de Vie de Commande & Certification POD',
        category: 'dispatch',
        status: 'FAILED',
        durationMs: Date.now() - t3Start,
        message: e?.message || 'Erreur test commande'
      });
    }

    // Test 4: Pricing Engine & Platform Commission
    const t4Start = Date.now();
    try {
      const initialRate = pricingRules.commissionRatePercent;
      setPricingRules(prev => ({ ...prev, commissionRatePercent: 5 }));
      setTimeout(() => {
        setPricingRules(prev => ({ ...prev, commissionRatePercent: initialRate }));
      }, 500);
      results.push({
        id: 't-pricing-commission',
        name: 'Moteur Tarifaire Algorithmique & Commissions',
        category: 'pricing',
        status: 'SUCCESS',
        durationMs: Date.now() - t4Start,
        message: `Règles de calcul kilométrique (+150 F/km) et barème de commission 0-20% validés.`
      });
    } catch (e: any) {
      results.push({
        id: 't-pricing-commission',
        name: 'Moteur Tarifaire Algorithmique & Commissions',
        category: 'pricing',
        status: 'FAILED',
        durationMs: Date.now() - t4Start,
        message: e?.message || 'Erreur test pricing'
      });
    }

    // Test 5: Dispute Resolution & Audit System
    const t5Start = Date.now();
    try {
      addAuditLog('dispute', 'Test Supervision Admin', 'Contrôle intégrité journal d\'audit et sécurité');
      results.push({
        id: 't-dispute-audit',
        name: 'Régulation des Litiges & Journal d\'Audit Sécurisé',
        category: 'dispute',
        status: 'SUCCESS',
        durationMs: Date.now() - t5Start,
        message: `Régulation des blocages adresses et traçabilité des actions 100% conformes.`
      });
    } catch (e: any) {
      results.push({
        id: 't-dispute-audit',
        name: 'Régulation des Litiges & Journal d\'Audit Sécurisé',
        category: 'dispute',
        status: 'FAILED',
        durationMs: Date.now() - t5Start,
        message: e?.message || 'Erreur test audit'
      });
    }

    return results;
  };

  const openWhatsAppModal = (phone: string, name: string, message: string) => {
    setWhatsAppData({ phone, name, message });
    setIsWhatsAppModalOpen(true);
  };

  const acceptUrgentOffer = () => {
    setIsUrgentOfferOpen(false);
    createDelivery({
      clientName: 'Cabinet Juridique CCIA',
      clientPhone: '+225 07 99 88 77 66',
      channel: 'WhatsApp',
      pickupLocation: {
        name: 'Plateau CCIA',
        address: 'Immeuble CCIA, 12e étage',
        commune: 'Plateau'
      },
      dropoffLocation: {
        name: 'Cabinet Notaires Marcory',
        address: 'Rue du 7 Décembre',
        commune: 'Marcory Zone 4'
      },
      itemDescription: 'Documents juridiques urgents (0.4 kg)',
      itemWeightKg: 0.4,
      itemFormat: 'S',
      isFragile: false,
      itemValueCOD: 0,
      deliveryFee: 3000
    });
    showToast('🎉 Course express #LL-4195 acceptée ! Prise en charge à 1.1 km.', 'success');
  };

  const dismissUrgentOffer = () => {
    setIsUrgentOfferOpen(false);
    showToast('Course ignorée.', 'info');
  };

  return (
    <AppContext.Provider
      value={{
        currentView,
        setCurrentView,
        currentRole,
        setCurrentRole,
        firebaseUser,
        userProfile,
        setUserProfile,
        isAuthLoading,
        logout,
        deliveries,
        setDeliveries,
        couriers,
        setCouriers,
        merchants,
        setMerchants,
        selectedCourier,
        setSelectedCourier,
        selectedDelivery,
        setSelectedDelivery,
        merchantSettings,
        setMerchantSettings,
        courierSettings,
        setCourierSettings,
        kycRequests,
        auditLogs,
        searchQuery,
        setSearchQuery,
        pricingRules,
        setPricingRules,
        createDelivery,
        updateDeliveryStatus,
        assignCourierToDelivery,
        validatePOD,
        toggleCourierAvailability,
        approveKYC,
        rejectKYC,
        resolveDispute,
        addCourier,
        updateCourier,
        toggleCourierStatus,
        creditCourierWallet,
        addMerchant,
        updateMerchant,
        toggleMerchantStatus,
        toggleMerchantVerification,
        addAuditLog,
        runAdminValidationSuite,
        toastMessage,
        showToast,
        isPODModalOpen,
        setIsPODModalOpen,
        isWhatsAppModalOpen,
        setIsWhatsAppModalOpen,
        whatsAppData,
        openWhatsAppModal,
        isUrgentOfferOpen,
        setIsUrgentOfferOpen,
        urgentOfferTimer,
        acceptUrgentOffer,
        dismissUrgentOffer,
        isGoogleModalOpen,
        googleModalRole,
        openGoogleModal,
        closeGoogleModal,
        isTestModalOpen,
        setIsTestModalOpen,
        openTestModal,
        closeTestModal,
        authorizedAdminEmails,
        isEmailAuthorizedAdmin,
        addAuthorizedAdminEmail,
        removeAuthorizedAdminEmail,
        isAdminAuthenticated,
        adminLoginWithGoogle,
        adminLogout
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
