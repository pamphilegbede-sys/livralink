import { Courier, Merchant, DeliveryOrder, KYCUserRequest, MerchantSettings, CourierSettings, SystemAuditLog, PricingRule, AppNotification } from '../types';

export const INITIAL_MERCHANTS: Merchant[] = [
  {
    id: 'm-glamchic',
    storeName: 'Boutique Glam Chic Cotonou',
    managerName: 'Sarah Kouamé',
    phone: '+229 97 48 92 11',
    email: 'contact@glamchic-cotonou.bj',
    commune: 'Cotonou - Haie Vive',
    address: 'Haie Vive, Avenue Jean-Paul II, Résidence les Palmiers',
    channel: 'WhatsApp',
    totalOrders: 184,
    totalVolumeFCFA: 4850000,
    rating: 4.9,
    status: 'actif',
    isVerified: true,
    preferredRateDiscountPercent: 5,
    createdAt: '2025-11-10',
  },
  {
    id: 'm-techiv',
    storeName: 'Tech Accessoire Bénin',
    managerName: 'Koffi Emmanuel',
    phone: '+229 95 12 34 56',
    email: 'koffi.tech@gmail.com',
    commune: 'Cotonou - Cadjehoun',
    address: 'Avenue Steinmetz, Immeuble Le Béninois',
    channel: 'E-commerce',
    totalOrders: 310,
    totalVolumeFCFA: 9420000,
    rating: 4.8,
    status: 'actif',
    isVerified: true,
    preferredRateDiscountPercent: 10,
    createdAt: '2025-10-15',
  },
  {
    id: 'm-modeafrik',
    storeName: 'Amani Afro Couture Bénin',
    managerName: 'Aïcha Traoré',
    phone: '+229 97 77 88 99',
    email: 'amani.couture@afrikdesign.bj',
    commune: 'Cotonou - Akpakpa',
    address: 'Boulevard de la Marina, Galerie Marchande',
    channel: 'Instagram',
    totalOrders: 95,
    totalVolumeFCFA: 2890000,
    rating: 4.7,
    status: 'actif',
    isVerified: true,
    createdAt: '2025-12-01',
  },
  {
    id: 'm-saveursbio',
    storeName: 'Saveurs & Délices Bio Bénin',
    managerName: 'Jean-Marc Bamba',
    phone: '+229 96 44 55 66',
    email: 'delices.bio@cotonou-gourmet.bj',
    commune: 'Abomey-Calavi - Godomey',
    address: 'Carrefour Godomey, Allée Principale',
    channel: 'TikTok',
    totalOrders: 42,
    totalVolumeFCFA: 860000,
    rating: 4.6,
    status: 'en_attente_kyc',
    isVerified: false,
    createdAt: '2026-01-20',
  },
  {
    id: 'm-shoesexpress',
    storeName: 'Sneakers & Shoes Direct Cotonou',
    managerName: 'Bakary Fofana',
    phone: '+229 95 99 11 22',
    email: 'sneakers.direct@yahoo.fr',
    commune: 'Cotonou - Dantokpa',
    address: 'Avenue Clozel, Proche Grand Marché Dantokpa',
    channel: 'WhatsApp',
    totalOrders: 18,
    totalVolumeFCFA: 340000,
    rating: 3.8,
    status: 'suspendu',
    isVerified: false,
    createdAt: '2026-02-05',
  }
];

export const INITIAL_COURIERS: Courier[] = [
  {
    id: 'c-awa',
    name: 'Awa Véloce Livraisons',
    phone: '+229 95 87 65 43',
    email: 'awa.veloce@gmail.com',
    avatarInitials: 'AV',
    rating: 5.0,
    totalDeliveries: 385,
    vehicle: 'Scooter Électrique / Van Léger',
    vehiclePlate: 'BJ-6621-RB',
    zone: 'Zone Akpakpa, Porto-Novo & Sèmè',
    distanceKm: 0.9,
    etaMinutes: 5,
    status: 'en_ligne',
    walletBalanceFCFA: 62000,
    priceFCFA: 100,
    commissionFCFA: 0,
    netEarningFCFA: 100,
    badge: 'Livreuse Premium ★',
    isKycVerified: true,
    createdAt: '2025-07-15'
  },
  {
    id: 'c-david',
    name: 'David Kouadio',
    phone: '+229 97 48 92 11',
    email: 'david.kouadio@coursier-link.bj',
    avatarInitials: 'DK',
    rating: 4.9,
    totalDeliveries: 312,
    vehicle: 'Yamaha 125',
    vehiclePlate: 'BJ-8492-RB',
    zone: 'Cotonou Centre / Haie Vive',
    distanceKm: 1.2,
    etaMinutes: 6,
    status: 'en_ligne',
    walletBalanceFCFA: 48500,
    priceFCFA: 100,
    commissionFCFA: 0,
    netEarningFCFA: 100,
    badge: 'Recommandé ★',
    isKycVerified: true,
    createdAt: '2025-09-12'
  },
  {
    id: 'c-paul',
    name: 'Paul Agbo',
    phone: '+229 95 66 12 88',
    email: 'paul.agbo@livreur.bj',
    avatarInitials: 'PA',
    rating: 4.8,
    totalDeliveries: 185,
    vehicle: 'Boxer 150',
    vehiclePlate: 'BJ-1102-RB',
    zone: 'Cotonou - Akpakpa',
    distanceKm: 2.5,
    etaMinutes: 12,
    status: 'en_ligne',
    walletBalanceFCFA: 22000,
    priceFCFA: 2500,
    commissionFCFA: 0,
    netEarningFCFA: 2500,
    badge: 'Attente standard',
    isKycVerified: true,
    createdAt: '2025-10-04'
  },
  {
    id: 'c-ibrahim',
    name: 'Ibrahim Koné',
    phone: '+229 97 19 88 44',
    email: 'ibrahim.kone@coursier-express.bj',
    avatarInitials: 'IK',
    rating: 5.0,
    totalDeliveries: 420,
    vehicle: 'Yamaha FZ / Honda CG',
    vehiclePlate: 'BJ-9043-RB',
    zone: 'Abomey-Calavi / Godomey',
    distanceKm: 3.1,
    etaMinutes: 15,
    status: 'en_ligne',
    walletBalanceFCFA: 65200,
    priceFCFA: 2800,
    commissionFCFA: 0,
    netEarningFCFA: 2800,
    badge: 'Collecte express',
    isKycVerified: true,
    createdAt: '2025-08-20'
  },
  {
    id: 'c-mamadou',
    name: 'Mamadou Doumbia',
    phone: '+229 95 77 33 22',
    email: 'mamadou.d@livralink.bj',
    avatarInitials: 'MD',
    rating: 4.9,
    totalDeliveries: 280,
    vehicle: 'Yamaha NMAX',
    vehiclePlate: 'BJ-4491-RB',
    zone: 'Cotonou - Cadjehoun / Haie Vive',
    distanceKm: 1.8,
    etaMinutes: 10,
    status: 'en_course',
    walletBalanceFCFA: 34000,
    priceFCFA: 2400,
    commissionFCFA: 0,
    netEarningFCFA: 2400,
    badge: 'Pro Connect',
    isKycVerified: true,
    createdAt: '2025-11-01'
  },
  {
    id: 'c-moussa',
    name: 'Moussa Touré',
    phone: '+229 95 64 22 88',
    email: 'moussa.t@coursier.bj',
    avatarInitials: 'MT',
    rating: 4.8,
    totalDeliveries: 210,
    vehicle: 'TVS Apache 160',
    vehiclePlate: 'BJ-5521-RB',
    zone: 'Cotonou - Fidjrossè / Kouhounou',
    distanceKm: 2.1,
    etaMinutes: 11,
    status: 'en_course',
    walletBalanceFCFA: 19800,
    priceFCFA: 1800,
    commissionFCFA: 0,
    netEarningFCFA: 1800,
    isKycVerified: true,
    createdAt: '2025-11-15'
  },
  {
    id: 'c-seydou',
    name: 'Seydou Diabaté',
    phone: '+229 97 88 12 34',
    email: 'seydou.diabate@coursier.bj',
    avatarInitials: 'SD',
    rating: 5.0,
    totalDeliveries: 380,
    vehicle: 'Bajaj Pulsar',
    vehiclePlate: 'BJ-7734-RB',
    zone: 'Porto-Novo & Sèmè-Kpodji',
    distanceKm: 1.5,
    etaMinutes: 8,
    status: 'en_ligne',
    walletBalanceFCFA: 51200,
    priceFCFA: 2200,
    commissionFCFA: 0,
    netEarningFCFA: 2200,
    isKycVerified: true,
    createdAt: '2025-07-28'
  },
  {
    id: 'c-bakary',
    name: 'Bakary Sissoko',
    phone: '+229 97 11 22 33',
    email: 'bakary.s@coursier.bj',
    avatarInitials: 'BS',
    rating: 3.5,
    totalDeliveries: 42,
    vehicle: 'Scooter 110cc',
    vehiclePlate: 'BJ-9901-RB',
    zone: 'Abomey-Calavi - Tankpè',
    distanceKm: 4.2,
    etaMinutes: 20,
    status: 'suspendu',
    walletBalanceFCFA: 4500,
    priceFCFA: 2000,
    commissionFCFA: 0,
    netEarningFCFA: 2000,
    badge: 'Compte Restreint',
    isKycVerified: false,
    createdAt: '2026-01-10'
  }
];

export const INITIAL_DELIVERIES: DeliveryOrder[] = [
  {
    id: '#LL-4192',
    clientName: 'Sarah Kouamé',
    clientPhone: '+229 97 48 92 11',
    clientNote: 'Appeler avant départ pour confirmation présence',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic Cotonou',
      address: 'Avenue Jean-Paul II, Résidence les Palmiers',
      commune: 'Cotonou - Haie Vive'
    },
    dropoffLocation: {
      name: 'Sarah Kouamé',
      address: 'Résidence Les Jardins, Bâtiment B, Apt 14 (Code: 2489)',
      commune: 'Cotonou - Cadjehoun',
      details: 'Sonner à l\'interphone 14B ou laisser au vigile si indisponible.'
    },
    itemDescription: 'Sac à main cuir & coffret cosmétique',
    itemWeightKg: 1.2,
    itemFormat: 'M',
    isFragile: true,
    itemValueCOD: 25000,
    deliveryFee: 2500,
    totalCustomerPayable: 27500,
    status: 'en_cours',
    statusNote: 'En cours d\'acheminement - ETA 14:38 (~6 min)',
    createdAt: '13:45',
    estimatedArrival: '14:38',
    otpCode: '8492',
    otpGeneratedAt: '13:46',
    courier: INITIAL_COURIERS[0], // Awa Véloce Livraisons
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'Enregistrée via WhatsApp Checkout', timestamp: '13:45', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Livreur assigné', description: 'Attribuée à Awa (Scooter Électrique)', timestamp: '13:52', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'Mission acceptée', description: 'Coursière en route vers la boutique', timestamp: '13:55', status: 'completed' },
      { id: 't4', stepNumber: 4, title: 'Colis récupéré', description: 'Scan QR & vérification au comptoir', timestamp: '14:10', status: 'completed' },
      { id: 't5', stepNumber: 5, title: 'En cours de livraison', description: 'En transit vers Cadjehoun (1.2 km restant)', timestamp: '14:38', status: 'active' },
      { id: 't6', stepNumber: 6, title: 'Preuve de livraison (POD)', description: 'Validation obligatoire : Code OTP + Photo en direct + Signature tactile', status: 'pending' }
    ]
  },
  {
    id: '#LL-4191',
    clientName: 'Marc Antoine B.',
    clientPhone: '+229 95 64 22 88',
    clientNote: 'Bureau 802, demander l\'accueil',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic Cotonou',
      address: 'Avenue Jean-Paul II',
      commune: 'Cotonou - Haie Vive'
    },
    dropoffLocation: {
      name: 'Marc Antoine B.',
      address: 'Immeuble Ganhi, 8ème étage, Porte 802',
      commune: 'Cotonou - Cadjehoun'
    },
    itemDescription: 'Ensemble costume & cravate soie',
    itemWeightKg: 1.8,
    itemFormat: 'M',
    isFragile: false,
    itemValueCOD: 42000,
    deliveryFee: 1800,
    totalCustomerPayable: 43800,
    status: 'acceptee',
    statusNote: 'Course acceptée - Prise en charge en cours',
    createdAt: '14:00',
    estimatedArrival: '15:15',
    otpCode: '3914',
    otpGeneratedAt: '14:01',
    courier: INITIAL_COURIERS[4], // Moussa T.
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'Enregistrée via WhatsApp', timestamp: '14:00', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Livreur assigné', description: 'Attribuée à Moussa T.', timestamp: '14:05', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'Mission acceptée', description: 'En route vers boutique Glam Chic (~4 min)', timestamp: '14:08', status: 'active' },
      { id: 't4', stepNumber: 4, title: 'Colis récupéré', description: 'Enlèvement boutique', status: 'pending' },
      { id: 't5', stepNumber: 5, title: 'En cours de livraison', description: 'Trajet vers Ganhi / Cadjehoun', status: 'pending' },
      { id: 't6', stepNumber: 6, title: 'Livrée (POD)', description: 'Validation obligatoire OTP + Photo + Signature', status: 'pending' }
    ]
  },
  {
    id: '#LL-4190',
    clientName: 'Aïcha Diop',
    clientPhone: '+229 96 70 33 45',
    clientNote: 'Gardiennage à l\'entrée',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic Cotonou',
      address: 'Avenue Jean-Paul II',
      commune: 'Cotonou - Haie Vive'
    },
    dropoffLocation: {
      name: 'Aïcha Diop',
      address: 'Boulevard de la Marina, Résidence Iris',
      commune: 'Cotonou - Akpakpa'
    },
    itemDescription: 'Chaussures talons hauts & pochette soirée',
    itemWeightKg: 1.5,
    itemFormat: 'M',
    isFragile: false,
    itemValueCOD: 35000,
    deliveryFee: 2500,
    totalCustomerPayable: 37500,
    status: 'en_attente',
    statusNote: 'En recherche de coursier disponible',
    createdAt: '14:15',
    otpCode: '7251',
    otpGeneratedAt: '14:15',
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'Enregistrée par vendeur', timestamp: '14:15', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Diffusion coursier', description: 'Rayon étendu à 3.5 km', timestamp: '14:16', status: 'active' },
      { id: 't3', stepNumber: 3, title: 'Acceptation', description: 'En attente', status: 'pending' },
      { id: 't4', stepNumber: 4, title: 'Récupération', description: 'En attente', status: 'pending' },
      { id: 't5', stepNumber: 5, title: 'En transit', description: 'En attente', status: 'pending' },
      { id: 't6', stepNumber: 6, title: 'Livrée', description: 'En attente', status: 'pending' }
    ]
  },
  {
    id: '#LL-4188',
    clientName: 'Clarisse N\'Guessan',
    clientPhone: '+229 97 88 12 34',
    clientNote: 'Remis en mains propres',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic Cotonou',
      address: 'Avenue Jean-Paul II',
      commune: 'Cotonou - Haie Vive'
    },
    dropoffLocation: {
      name: 'Clarisse N\'Guessan',
      address: 'Carrefour Fidjrossè Calvaire, Villa 18',
      commune: 'Cotonou - Fidjrossè'
    },
    itemDescription: 'Robe de cocktail & bijoux dorés',
    itemWeightKg: 0.9,
    itemFormat: 'S',
    isFragile: true,
    itemValueCOD: 55000,
    deliveryFee: 2000,
    totalCustomerPayable: 57000,
    status: 'livree',
    statusNote: 'Livrée avec succès (Preuve POD Tri-Facteur validée)',
    createdAt: '11:20',
    estimatedArrival: '12:05',
    otpCode: '8492',
    otpGeneratedAt: '11:21',
    courier: INITIAL_COURIERS[5], // Seydou D.
    podData: {
      type: 'complete_tri_factor',
      otpCode: '8492',
      photoUrl: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=500&auto=format&fit=crop&q=60',
      signatureDataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="70" viewBox="0 0 220 70"><path d="M 20 50 C 45 15, 75 60, 115 30 S 170 55, 200 35" stroke="%231e3a8a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
      signedByName: 'Clarisse N\'Guessan',
      validatedAt: '12:04',
      code: '8492'
    },
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'Validée', timestamp: '11:20', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Livreur assigné', description: 'Seydou D.', timestamp: '11:24', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'Mission acceptée', description: 'Confirmée', timestamp: '11:25', status: 'completed' },
      { id: 't4', stepNumber: 4, title: 'Colis récupéré', description: 'Boutique Glam Chic Cotonou', timestamp: '11:40', status: 'completed' },
      { id: 't5', stepNumber: 5, title: 'En livraison', description: 'Vers Fidjrossè', timestamp: '11:58', status: 'completed' },
      { id: 't6', stepNumber: 6, title: 'Livrée (POD Tri-Facteur certifiée)', description: 'Code OTP #8492, photo colis & signature Clarisse N\'Guessan', timestamp: '12:04', status: 'completed' }
    ]
  },
  {
    id: '#LL-4185',
    clientName: 'Kevin Kouassi',
    clientPhone: '+229 95 11 99 77',
    clientNote: 'Près de la Pharmacie Haie Vive',
    isClientVerified: false,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic Cotonou',
      address: 'Avenue Jean-Paul II',
      commune: 'Cotonou - Haie Vive'
    },
    dropoffLocation: {
      name: 'Kevin Kouassi',
      address: 'Près de la Pharmacie Godomey, Carrefour Godomey',
      commune: 'Abomey-Calavi - Godomey'
    },
    itemDescription: 'Montre chronographe & bracelet cuir',
    itemWeightKg: 0.6,
    itemFormat: 'S',
    isFragile: true,
    itemValueCOD: 28000,
    deliveryFee: 2500,
    totalCustomerPayable: 30500,
    status: 'echec',
    statusNote: 'Échec de livraison : Client injoignable après 3 appels',
    createdAt: '09:40',
    otpCode: '5820',
    otpGeneratedAt: '09:41',
    courier: INITIAL_COURIERS[2], // Ibrahim K.
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'Validée', timestamp: '09:40', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Livreur assigné', description: 'Ibrahim K.', timestamp: '09:44', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'Colis récupéré', description: 'Départ Godomey', timestamp: '10:05', status: 'completed' },
      { id: 't4', stepNumber: 4, title: 'En cours', description: 'Sur place à Godomey', timestamp: '10:45', status: 'completed' },
      { id: 't5', stepNumber: 5, title: 'Incident constaté', description: '3 tentatives d\'appels sans réponse', timestamp: '11:02', status: 'completed' },
      { id: 't6', stepNumber: 6, title: 'Échec documenté', description: 'Colis retourné / Reprogrammation requise', timestamp: '11:15', status: 'completed' }
    ]
  },
  {
    id: '#LL-4182',
    clientName: 'Estelle Touré',
    clientPhone: '+229 97 55 43 21',
    clientNote: 'Rue des Ambassades, Villa 12',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic Cotonou',
      address: 'Avenue Jean-Paul II',
      commune: 'Cotonou - Haie Vive'
    },
    dropoffLocation: {
      name: 'Estelle Touré',
      address: 'Rue des Ambassades, Villa 12',
      commune: 'Cotonou - Cadjehoun'
    },
    itemDescription: 'Coffret parfums & crèmes bio',
    itemWeightKg: 1.1,
    itemFormat: 'M',
    isFragile: true,
    itemValueCOD: 38000,
    deliveryFee: 2000,
    totalCustomerPayable: 40000,
    status: 'livree',
    statusNote: 'Livrée avec succès (Preuve POD Tri-Facteur validée)',
    createdAt: '08:30',
    estimatedArrival: '09:15',
    otpCode: '4619',
    otpGeneratedAt: '08:31',
    courier: INITIAL_COURIERS[4], // Moussa T.
    podData: {
      type: 'complete_tri_factor',
      otpCode: '4619',
      photoUrl: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=500&auto=format&fit=crop&q=60',
      signatureDataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="220" height="70" viewBox="0 0 220 70"><path d="M 25 45 C 55 15, 85 55, 125 30 S 165 60, 195 30" stroke="%231e3a8a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
      signedByName: 'Estelle Touré',
      validatedAt: '09:12',
      code: '4619'
    },
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'WhatsApp direct', timestamp: '08:30', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Livreur assigné', description: 'Moussa T.', timestamp: '08:35', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'Colis récupéré', description: 'Pris en charge', timestamp: '08:50', status: 'completed' },
      { id: 't4', stepNumber: 4, title: 'En cours', description: 'Trajet Cadjehoun', timestamp: '09:05', status: 'completed' },
      { id: 't5', stepNumber: 5, title: 'Livrée (POD Tri-Facteur certifiée)', description: 'Code OTP #4619, photo & signature d\'Estelle Touré', timestamp: '09:12', status: 'completed' }
    ]
  },
  {
    id: '#LL-1048',
    clientName: 'Mme Bamba Fatou',
    clientPhone: '+229 97 22 33 44',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic Cotonou',
      address: 'Avenue Jean-Paul II',
      commune: 'Cotonou - Haie Vive'
    },
    dropoffLocation: {
      name: 'Mme Bamba Fatou',
      address: 'Rue de la Marina, Villa 4',
      commune: 'Cotonou - Akpakpa'
    },
    itemDescription: 'Tenues traditionnelles & pagnes',
    itemWeightKg: 2.0,
    itemFormat: 'M',
    isFragile: false,
    itemValueCOD: 60000,
    deliveryFee: 2400,
    totalCustomerPayable: 62400,
    status: 'en_cours',
    statusNote: 'En transit - 4.2 km • Arrivée estimée dans ~10 min',
    createdAt: '14:15',
    estimatedArrival: '14:45',
    otpCode: '2938',
    otpGeneratedAt: '14:16',
    courier: INITIAL_COURIERS[0], // David K.
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Créée', description: 'WhatsApp', timestamp: '14:15', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Colis récupéré', description: 'Enlevé à 14:22', timestamp: '14:22', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'En transit', description: 'Vers Cotonou Akpakpa', timestamp: '14:35', status: 'active' },
      { id: 't4', stepNumber: 4, title: 'Livrée', description: 'Attente validation obligatoire POD', status: 'pending' }
    ]
  },
  {
    id: '#LL-1047',
    clientName: 'Alain Kouassi',
    clientPhone: '+229 95 12 77 99',
    isClientVerified: true,
    channel: 'Instagram',
    pickupLocation: {
      name: 'TechZone Bénin',
      address: 'Avenue Steinmetz',
      commune: 'Cotonou - Cadjehoun'
    },
    dropoffLocation: {
      name: 'Alain Kouassi',
      address: 'Avenue Clozel, Dantokpa',
      commune: 'Cotonou - Dantokpa'
    },
    itemDescription: 'AirPods Pro & coque de protection',
    itemWeightKg: 0.5,
    itemFormat: 'S',
    isFragile: true,
    itemValueCOD: 85000,
    deliveryFee: 1800,
    totalCustomerPayable: 86800,
    status: 'assignee',
    statusNote: 'Assignée à Ibrahim K. - Prise en charge en route',
    createdAt: '14:20',
    estimatedArrival: '14:55',
    otpCode: '6145',
    otpGeneratedAt: '14:21',
    courier: INITIAL_COURIERS[2], // Ibrahim K.
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Créée', description: 'Instagram Shop', timestamp: '14:20', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Assignée', description: 'Ibrahim K. (Bajaj Boxer)', timestamp: '14:22', status: 'active' },
      { id: 't3', stepNumber: 3, title: 'En route collecte', description: '~4 min', status: 'pending' }
    ]
  },
  {
    id: '#LL-1045',
    clientName: 'Roland Yao',
    clientPhone: '+229 96 44 55 66',
    isClientVerified: true,
    channel: 'TikTok',
    pickupLocation: {
      name: 'Mode Cotonou',
      address: 'Haie Vive',
      commune: 'Cotonou - Haie Vive'
    },
    dropoffLocation: {
      name: 'Roland Yao',
      address: 'Abomey-Calavi Centre, Carrefour Arconville',
      commune: 'Abomey-Calavi - Centre'
    },
    itemDescription: 'Colis Vêtements (2.4 kg)',
    itemWeightKg: 2.4,
    itemFormat: 'L',
    isFragile: false,
    itemValueCOD: 30000,
    deliveryFee: 3200,
    totalCustomerPayable: 33200,
    status: 'en_attente',
    statusNote: 'En attente coursier • Recherche élargie à 3.5 km',
    createdAt: '14:10',
    otpCode: '9312',
    otpGeneratedAt: '14:11',
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Créée', description: 'TikTok Shop', timestamp: '14:10', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Diffusion', description: 'Rayon 3.5 km', timestamp: '14:12', status: 'active' }
    ]
  },
  {
    id: '#LL-1042',
    clientName: 'Destinataire Anonyme',
    clientPhone: '+229 97 00 00 00',
    isClientVerified: false,
    channel: 'Instagram',
    pickupLocation: {
      name: 'Kréa Fashion',
      address: 'Akpakpa Dodomè',
      commune: 'Cotonou - Akpakpa'
    },
    dropoffLocation: {
      name: 'Client Inconnu',
      address: 'Adresse erronée / Non localisée',
      commune: 'Cotonou - Akpakpa'
    },
    itemDescription: 'Robe imprimée',
    itemWeightKg: 0.8,
    itemFormat: 'S',
    isFragile: false,
    itemValueCOD: 18000,
    deliveryFee: 2100,
    totalCustomerPayable: 20100,
    status: 'echec',
    statusNote: '🔴 Litige adresse : Bloqué sur place depuis 22 min • Numéro client non attribué',
    createdAt: '13:50',
    otpCode: '1784',
    otpGeneratedAt: '13:51',
    courier: INITIAL_COURIERS[1], // Paul M.
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Créée', description: 'Kréa Fashion', timestamp: '13:50', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Enlevé', description: 'Paul M.', timestamp: '14:02', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'Litige adresse', description: 'Client injoignable, arrêt sur place 22 min', timestamp: '14:20', status: 'active' }
    ]
  }
];

export const INITIAL_KYC_REQUESTS: KYCUserRequest[] = [
  {
    id: 'kyc-1',
    fullName: 'Moussa Bamba',
    phone: '+229 97 77 12 90',
    role: 'coursier',
    vehicleType: 'Moto TVS Apache 160',
    idNumber: 'BJ-0089248-B',
    operatingZone: 'Cotonou / Akpakpa',
    submittedAt: 'Aujourd\'hui à 11:20',
    status: 'en_attente',
    documents: { cni: true, permis: true, assurance: true }
  },
  {
    id: 'kyc-2',
    fullName: 'Koffi Kouamé Jean',
    phone: '+229 95 44 88 12',
    role: 'coursier',
    vehicleType: 'Scooter Yamaha RayZR',
    idNumber: 'BJ-0044910-K',
    operatingZone: 'Cotonou - Cadjehoun / Haie Vive',
    submittedAt: 'Aujourd\'hui à 12:45',
    status: 'en_attente',
    documents: { cni: true, permis: true, assurance: false }
  },
  {
    id: 'kyc-3',
    fullName: 'Amadou Touré',
    phone: '+229 96 22 99 88',
    role: 'coursier',
    vehicleType: 'Haojue 125',
    idNumber: 'BJ-0099412-T',
    operatingZone: 'Abomey-Calavi / Godomey',
    submittedAt: 'Aujourd\'hui à 13:10',
    status: 'valide',
    documents: { cni: true, permis: true, assurance: true }
  },
  {
    id: 'kyc-4',
    fullName: 'Boutique Glamour Chic',
    phone: '+229 97 48 92 11',
    role: 'marchand',
    vehicleType: 'Magasin Physique & En ligne',
    idNumber: 'RCCM-RB-COT-2023-B-148',
    operatingZone: 'Cotonou - Haie Vive',
    submittedAt: 'Hier à 16:30',
    status: 'valide',
    documents: { cni: true, permis: true, assurance: true }
  }
];

export const INITIAL_MERCHANT_SETTINGS: MerchantSettings = {
  storeName: 'Boutique Glam Chic Cotonou',
  managerName: 'Sarah Kouamé',
  phone: '+229 97 48 92 11',
  email: 'contact@glamchic-cotonou.bj',
  storeCommune: 'Cotonou - Haie Vive',
  defaultPickupAddress: 'Haie Vive, Avenue Jean-Paul II, Cotonou, Bénin',
  gpsCoordinates: '6.3571° N, 2.4175° E',
  storeCoordinates: [6.3571, 2.4175],
  defaultExpress: true,
  frequentZones: ['Cotonou - Haie Vive', 'Cotonou - Cadjehoun', 'Cotonou - Akpakpa', 'Abomey-Calavi', 'Porto-Novo'],
  permanentInstructions: 'Toujours appeler la boutique 10 min avant l\'arrivée pour la remise du colis scellé.',
  notifyOnCreated: true,
  notifyOnStatusChange: true,
  notifyOnCourierAssigned: true,
  notifyOnDelivered: true,
  notifyOnIncident: true,
  channelWhatsApp: true,
  channelSMS: true,
  channelEmail: true,
  defaultPaymentMethod: 'MTN Mobile Money Bénin (+229 97 •• •• 42)',
  twoFactorAuth: true
};

export const INITIAL_COURIER_SETTINGS: CourierSettings = {
  fullName: 'Awa Véloce Livraisons',
  phone: '+229 95 87 65 43',
  email: 'awa.veloce@gmail.com',
  parkingBaseAddress: 'Carrefour de l\'Étoile Rouge, Cotonou, Bénin',
  isAvailable: true,
  workingHours: 'Lundi à Samedi de 08:00 à 19:30',
  soundAlerts: true,
  activeZones: ['Cotonou Centre', 'Cadjehoun', 'Akpakpa', 'Abomey-Calavi'],
  vehicleType: 'Scooter Électrique / Van Léger',
  vehiclePlate: 'BJ-6621-RB',
  vehicleInsuranceUpToDate: true,
  defaultPayoutMethod: 'MTN Mobile Money Bénin',
  payoutPhone: '+229 95 •• •• 43',
  twoFactorAuth: true
};

export const INITIAL_AUDIT_LOGS: SystemAuditLog[] = [
  {
    id: 'log-1',
    timestamp: '14:32:05',
    type: 'kyc',
    title: 'Validation KYC réussie',
    details: 'Dossier vérifié pour le coursier #CR-88 (Amadou Touré). Carte de transporteur validée.'
  },
  {
    id: 'log-2',
    timestamp: '14:15:22',
    type: 'weather',
    title: 'Majoration dynamique pluie levée',
    details: 'Zone Cotonou Littoral. Retour automatique aux tarifs nominaux de livraison.'
  },
  {
    id: 'log-3',
    timestamp: '13:48:19',
    type: 'dispute',
    title: 'Litige #LL-1029 résolu',
    details: 'Colis re-routé vers le bon destinataire à Cadjehoun sans frais additionnels.'
  },
  {
    id: 'log-4',
    timestamp: '12:10:04',
    type: 'pricing',
    title: 'Moteur tarifaire synchronisé',
    details: 'Tarif officiel : 100 FCFA par kilomètre calculé via Google Maps Bénin.'
  }
];

export const PRICING_RULES: PricingRule = {
  baseDistanceKm: 1,
  baseFeeFCFA: 100,
  extraPerKmFCFA: 100,
  fragileSurchargeFCFA: 0,
  commissionRatePercent: 0 // 0% MVP Launch Offer
};

export const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    type: 'order_status',
    title: '🚚 Colis en transit vers Akpakpa',
    message: 'La commande #LL-4192 a été récupérée par Awa Véloce et est en route.',
    timestamp: '14:35',
    isRead: false,
    orderId: '#LL-4192',
    actionView: 'vendeur_tracking'
  },
  {
    id: 'notif-2',
    type: 'order_assigned',
    title: '🛵 Nouveau coursier assigné',
    message: 'Koffi Sègbo a accepté la prise en charge de la livraison #LL-3810.',
    timestamp: '13:50',
    isRead: false,
    orderId: '#LL-3810',
    actionView: 'vendeur_tracking'
  },
  {
    id: 'notif-3',
    type: 'pod_validated',
    title: '✅ Livraison certifiée (POD Tri-Facteur)',
    message: 'La livraison #LL-2091 a été remise avec succès. OTP et signature validés.',
    timestamp: '12:15',
    isRead: true,
    orderId: '#LL-2091',
    actionView: 'vendeur_tracking'
  },
  {
    id: 'notif-4',
    type: 'priority_mission',
    title: '⚡ Nouvelle mission prioritaire disponible',
    message: 'Course express Cotonou Haie Vive ➔ Godomey (2 400 FCFA net).',
    timestamp: '11:05',
    isRead: true,
    actionView: 'livreur_missions'
  }
];
