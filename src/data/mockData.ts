import { Courier, Merchant, DeliveryOrder, KYCUserRequest, MerchantSettings, CourierSettings, SystemAuditLog, PricingRule } from '../types';

export const INITIAL_MERCHANTS: Merchant[] = [
  {
    id: 'm-glamchic',
    storeName: 'Boutique Glam Chic',
    managerName: 'Sarah Kouamé',
    phone: '+225 07 48 92 11 04',
    email: 'contact@glamchic-abidjan.ci',
    commune: 'Cocody Angré 8ème tranche',
    address: 'Boulevard Latrille, Résidence les Arums',
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
    storeName: 'Tech Accessoire Côte d\'Ivoire',
    managerName: 'Koffi Emmanuel',
    phone: '+225 05 12 34 56 78',
    email: 'koffi.tech@gmail.com',
    commune: 'Plateau',
    address: 'Rue du Commerce, Immeuble Postel 2001',
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
    storeName: 'Amani Afro Couture',
    managerName: 'Aïcha Traoré',
    phone: '+225 07 77 88 99 00',
    email: 'amani.couture@afrikdesign.ci',
    commune: 'Marcory Zone 4',
    address: 'Rue Paul Langevin, Galerie Marchande',
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
    storeName: 'Saveurs & Délices Bio CI',
    managerName: 'Jean-Marc Bamba',
    phone: '+225 01 44 55 66 77',
    email: 'delices.bio@abidjan-gourmet.ci',
    commune: 'Yopougon',
    address: 'Carrefour Siporex, Allée Principale',
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
    storeName: 'Sneakers & Shoes Direct',
    managerName: 'Bakary Fofana',
    phone: '+225 05 99 11 22 33',
    email: 'sneakers.direct@yahoo.fr',
    commune: 'Treichville',
    address: 'Avenue 16, Rue 12',
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
    id: 'c-david',
    name: 'David Kouadio',
    phone: '+225 07 48 92 11 04',
    email: 'david.kouadio@coursier-link.ci',
    avatarInitials: 'DK',
    rating: 4.9,
    totalDeliveries: 312,
    vehicle: 'Yamaha 125',
    vehiclePlate: 'AB-8492-CI',
    zone: 'Centre-ville / Cocody',
    distanceKm: 1.2,
    etaMinutes: 6,
    status: 'en_ligne',
    walletBalanceFCFA: 48500,
    priceFCFA: 2500,
    commissionFCFA: 0,
    netEarningFCFA: 2500,
    badge: 'Recommandé ★',
    isKycVerified: true,
    createdAt: '2025-09-12'
  },
  {
    id: 'c-paul',
    name: 'Paul Agbo',
    phone: '+225 05 66 12 88 41',
    email: 'paul.agbo@livreur.ci',
    avatarInitials: 'PA',
    rating: 4.8,
    totalDeliveries: 185,
    vehicle: 'Boxer 150',
    vehiclePlate: 'CI-1102-TG',
    zone: 'Zongo / Treichville',
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
    phone: '+225 07 19 88 44 22',
    email: 'ibrahim.kone@coursier-express.ci',
    avatarInitials: 'IK',
    rating: 5.0,
    totalDeliveries: 420,
    vehicle: 'Yamaha FZ / Honda CG',
    vehiclePlate: 'CI-9043-AB',
    zone: 'Angré / Riviera',
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
    phone: '+225 05 77 33 22 11',
    email: 'mamadou.d@livralink.ci',
    avatarInitials: 'MD',
    rating: 4.9,
    totalDeliveries: 280,
    vehicle: 'Yamaha NMAX',
    vehiclePlate: 'CI-4491-CC',
    zone: 'Plateau / Cocody',
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
    phone: '+225 05 64 22 88 19',
    email: 'moussa.t@coursier.ci',
    avatarInitials: 'MT',
    rating: 4.8,
    totalDeliveries: 210,
    vehicle: 'TVS Apache 160',
    vehiclePlate: 'CI-5521-YZ',
    zone: 'Treichville / Plateau',
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
    phone: '+225 07 88 12 34 56',
    email: 'seydou.diabate@coursier.ci',
    avatarInitials: 'SD',
    rating: 5.0,
    totalDeliveries: 380,
    vehicle: 'Bajaj Pulsar',
    vehiclePlate: 'CI-7734-DK',
    zone: 'Riviera Palmeraie',
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
    phone: '+225 07 11 22 33 44',
    email: 'bakary.s@coursier.ci',
    avatarInitials: 'BS',
    rating: 3.5,
    totalDeliveries: 42,
    vehicle: 'Scooter 110cc',
    vehiclePlate: 'CI-9901-AA',
    zone: 'Yopougon',
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
    clientPhone: '+225 07 48 92 11 04',
    clientNote: 'Appeler avant départ pour confirmation présence',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic',
      address: 'Boulevard Latrille, Résidence les Arums',
      commune: 'Cocody Angré 8ème tranche'
    },
    dropoffLocation: {
      name: 'Sarah Kouamé',
      address: 'Résidence Les Jardins, Bâtiment B, Apt 14 (Code: 2489)',
      commune: 'Cocody Danga',
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
    courier: INITIAL_COURIERS[0], // David
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'Enregistrée via WhatsApp Checkout', timestamp: '13:45', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Livreur assigné', description: 'Attribuée à David (Yamaha 125)', timestamp: '13:52', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'Mission acceptée', description: 'Coursier en route vers la boutique', timestamp: '13:55', status: 'completed' },
      { id: 't4', stepNumber: 4, title: 'Colis récupéré', description: 'Scan QR & vérification au comptoir', timestamp: '14:10', status: 'completed' },
      { id: 't5', stepNumber: 5, title: 'En cours de livraison', description: 'En transit vers Cocody Danga (1.2 km restant)', timestamp: '14:38', status: 'active' },
      { id: 't6', stepNumber: 6, title: 'Preuve de livraison (POD)', description: 'Validation par code OTP 4 chiffres & photo', status: 'pending' }
    ]
  },
  {
    id: '#LL-4191',
    clientName: 'Marc Antoine B.',
    clientPhone: '+225 05 64 22 88 19',
    clientNote: 'Bureau 802, demander l\'accueil',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic',
      address: 'Boulevard Latrille',
      commune: 'Cocody Angré'
    },
    dropoffLocation: {
      name: 'Marc Antoine B.',
      address: 'Immeuble CCIA, 8ème étage, Porte 802',
      commune: 'Plateau'
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
    courier: INITIAL_COURIERS[4], // Moussa T.
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'Enregistrée via WhatsApp', timestamp: '14:00', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Livreur assigné', description: 'Attribuée à Moussa T.', timestamp: '14:05', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'Mission acceptée', description: 'En route vers boutique Glam Chic (~4 min)', timestamp: '14:08', status: 'active' },
      { id: 't4', stepNumber: 4, title: 'Colis récupéré', description: 'Enlèvement boutique', status: 'pending' },
      { id: 't5', stepNumber: 5, title: 'En cours de livraison', description: 'Trajet vers Plateau', status: 'pending' },
      { id: 't6', stepNumber: 6, title: 'Livrée (POD)', description: 'Signature client', status: 'pending' }
    ]
  },
  {
    id: '#LL-4190',
    clientName: 'Aïcha Diop',
    clientPhone: '+225 01 70 33 45 90',
    clientNote: 'Gardiennage à l\'entrée',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic',
      address: 'Boulevard Latrille',
      commune: 'Cocody Angré'
    },
    dropoffLocation: {
      name: 'Aïcha Diop',
      address: 'Rue Paul Langevin, Résidence Iris',
      commune: 'Marcory Zone 4'
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
    clientPhone: '+225 07 88 12 34 56',
    clientNote: 'Remis en mains propres',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic',
      address: 'Boulevard Latrille',
      commune: 'Cocody Angré'
    },
    dropoffLocation: {
      name: 'Clarisse N\'Guessan',
      address: 'Rond-point Mitterrand, Villa 18',
      commune: 'Riviera Palmeraie'
    },
    itemDescription: 'Robe de cocktail & bijoux dorés',
    itemWeightKg: 0.9,
    itemFormat: 'S',
    isFragile: true,
    itemValueCOD: 55000,
    deliveryFee: 2000,
    totalCustomerPayable: 57000,
    status: 'livree',
    statusNote: 'Livrée avec succès (Preuve POD validée)',
    createdAt: '11:20',
    estimatedArrival: '12:05',
    courier: INITIAL_COURIERS[5], // Seydou D.
    podData: {
      type: 'otp',
      validatedAt: '12:04',
      code: '8492'
    },
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'Validée', timestamp: '11:20', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Livreur assigné', description: 'Seydou D.', timestamp: '11:24', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'Mission acceptée', description: 'Confirmée', timestamp: '11:25', status: 'completed' },
      { id: 't4', stepNumber: 4, title: 'Colis récupéré', description: 'Boutique Glam Chic', timestamp: '11:40', status: 'completed' },
      { id: 't5', stepNumber: 5, title: 'En livraison', description: 'Vers Riviera Palmeraie', timestamp: '11:58', status: 'completed' },
      { id: 't6', stepNumber: 6, title: 'Livrée (POD validée)', description: 'Code OTP #8492 vérifié à 12:04', timestamp: '12:04', status: 'completed' }
    ]
  },
  {
    id: '#LL-4185',
    clientName: 'Kevin Kouassi',
    clientPhone: '+225 05 11 99 77 33',
    clientNote: 'Près de la Pharmacie Lumière',
    isClientVerified: false,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic',
      address: 'Boulevard Latrille',
      commune: 'Cocody Angré'
    },
    dropoffLocation: {
      name: 'Kevin Kouassi',
      address: 'Près de la Pharmacie Lumière, Carrefour Siporex',
      commune: 'Yopougon Ananeraie'
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
    courier: INITIAL_COURIERS[2], // Ibrahim K.
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'Validée', timestamp: '09:40', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Livreur assigné', description: 'Ibrahim K.', timestamp: '09:44', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'Colis récupéré', description: 'Départ Yopougon', timestamp: '10:05', status: 'completed' },
      { id: 't4', stepNumber: 4, title: 'En cours', description: 'Sur place à Ananeraie', timestamp: '10:45', status: 'completed' },
      { id: 't5', stepNumber: 5, title: 'Incident constaté', description: '3 tentatives d\'appels sans réponse', timestamp: '11:02', status: 'completed' },
      { id: 't6', stepNumber: 6, title: 'Échec documenté', description: 'Colis retourné / Reprogrammation requise', timestamp: '11:15', status: 'completed' }
    ]
  },
  {
    id: '#LL-4182',
    clientName: 'Estelle Touré',
    clientPhone: '+225 07 55 43 21 00',
    clientNote: 'Rue des Ambassades, Villa 12',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic',
      address: 'Boulevard Latrille',
      commune: 'Cocody Angré'
    },
    dropoffLocation: {
      name: 'Estelle Touré',
      address: 'Rue des Ambassades, Villa 12',
      commune: 'Cocody Danga'
    },
    itemDescription: 'Coffret parfums & crèmes bio',
    itemWeightKg: 1.1,
    itemFormat: 'M',
    isFragile: true,
    itemValueCOD: 38000,
    deliveryFee: 2000,
    totalCustomerPayable: 40000,
    status: 'livree',
    statusNote: 'Livrée avec succès (Photo POD validée)',
    createdAt: '08:30',
    estimatedArrival: '09:15',
    courier: INITIAL_COURIERS[4], // Moussa T.
    podData: {
      type: 'photo',
      validatedAt: '09:12'
    },
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Commande créée', description: 'WhatsApp direct', timestamp: '08:30', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Livreur assigné', description: 'Moussa T.', timestamp: '08:35', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'Colis récupéré', description: 'Pris en charge', timestamp: '08:50', status: 'completed' },
      { id: 't4', stepNumber: 4, title: 'En cours', description: 'Trajet Cocody Danga', timestamp: '09:05', status: 'completed' },
      { id: 't5', stepNumber: 5, title: 'Livrée (POD)', description: 'Photo de remise horodatée validée', timestamp: '09:12', status: 'completed' }
    ]
  },
  {
    id: '#LL-1048',
    clientName: 'Mme Bamba Fatou',
    clientPhone: '+225 07 22 33 44 55',
    isClientVerified: true,
    channel: 'WhatsApp',
    pickupLocation: {
      name: 'Boutique Glam Chic',
      address: 'Boulevard Latrille',
      commune: 'Cocody Angré 8e'
    },
    dropoffLocation: {
      name: 'Mme Bamba Fatou',
      address: 'Rue des Majorettes, Villa 4',
      commune: 'Marcory Zone 4'
    },
    itemDescription: 'Tenues traditionnelles & pagnes',
    itemWeightKg: 2.0,
    itemFormat: 'M',
    isFragile: false,
    itemValueCOD: 60000,
    deliveryFee: 2400,
    totalCustomerPayable: 62400,
    status: 'en_cours',
    statusNote: 'En transit - 11.4 km • Arrivée estimée dans ~14 min',
    createdAt: '14:15',
    estimatedArrival: '14:45',
    courier: INITIAL_COURIERS[0], // David K.
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Créée', description: 'WhatsApp', timestamp: '14:15', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Colis récupéré', description: 'Enlevé à 14:22', timestamp: '14:22', status: 'completed' },
      { id: 't3', stepNumber: 3, title: 'En transit', description: 'Vers Marcory Zone 4', timestamp: '14:35', status: 'active' },
      { id: 't4', stepNumber: 4, title: 'Livrée', description: 'Attente', status: 'pending' }
    ]
  },
  {
    id: '#LL-1047',
    clientName: 'Alain Kouassi',
    clientPhone: '+225 05 12 77 99 00',
    isClientVerified: true,
    channel: 'Instagram',
    pickupLocation: {
      name: 'TechZone CI',
      address: 'Plateau CCIA',
      commune: 'Plateau'
    },
    dropoffLocation: {
      name: 'Alain Kouassi',
      address: 'Avenue 12, Rue 14',
      commune: 'Treichville'
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
    clientPhone: '+225 01 44 55 66 77',
    isClientVerified: true,
    channel: 'TikTok',
    pickupLocation: {
      name: 'Mode Abidjan',
      address: 'Riviera 2',
      commune: 'Riviera'
    },
    dropoffLocation: {
      name: 'Roland Yao',
      address: 'Yopougon Ananeraie',
      commune: 'Yopougon'
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
    timeline: [
      { id: 't1', stepNumber: 1, title: 'Créée', description: 'TikTok Shop', timestamp: '14:10', status: 'completed' },
      { id: 't2', stepNumber: 2, title: 'Diffusion', description: 'Rayon 3.5 km', timestamp: '14:12', status: 'active' }
    ]
  },
  {
    id: '#LL-1042',
    clientName: 'Destinataire Anonyme',
    clientPhone: '+225 07 00 00 00 00',
    isClientVerified: false,
    channel: 'Instagram',
    pickupLocation: {
      name: 'Kréa Fashion',
      address: 'Koumassi Remblais',
      commune: 'Koumassi'
    },
    dropoffLocation: {
      name: 'Client Inconnu',
      address: 'Adresse erronée / Non localisée',
      commune: 'Koumassi'
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
    phone: '+225 07 77 12 90 44',
    role: 'coursier',
    vehicleType: 'Moto TVS Apache 160',
    idNumber: 'CI-0089248-B',
    operatingZone: 'Yopougon / Attécoubé',
    submittedAt: 'Aujourd\'hui à 11:20',
    status: 'en_attente',
    documents: { cni: true, permis: true, assurance: true }
  },
  {
    id: 'kyc-2',
    fullName: 'Koffi Kouamé Jean',
    phone: '+225 05 44 88 12 00',
    role: 'coursier',
    vehicleType: 'Scooter Yamaha RayZR',
    idNumber: 'CI-0044910-K',
    operatingZone: 'Cocody / Riviera',
    submittedAt: 'Aujourd\'hui à 12:45',
    status: 'en_attente',
    documents: { cni: true, permis: true, assurance: false }
  },
  {
    id: 'kyc-3',
    fullName: 'Amadou Touré',
    phone: '+225 01 22 99 88 77',
    role: 'coursier',
    vehicleType: 'Haojue 125',
    idNumber: 'CI-0099412-T',
    operatingZone: 'Marcory / Koumassi',
    submittedAt: 'Aujourd\'hui à 13:10',
    status: 'valide',
    documents: { cni: true, permis: true, assurance: true }
  },
  {
    id: 'kyc-4',
    fullName: 'Boutique Glamour Chic',
    phone: '+225 07 48 92 11 04',
    role: 'marchand',
    vehicleType: 'Magasin Physique & En ligne',
    idNumber: 'RCCM-CI-ABJ-2023-B-148',
    operatingZone: 'Cocody Angré',
    submittedAt: 'Hier à 16:30',
    status: 'valide',
    documents: { cni: true, permis: true, assurance: true }
  }
];

export const INITIAL_MERCHANT_SETTINGS: MerchantSettings = {
  storeName: 'Boutique Glam Chic',
  managerName: 'Sarah Kouamé',
  phone: '+225 07 48 92 11 04',
  email: 'contact@glamchic-abidjan.ci',
  defaultPickupAddress: 'Cocody Angré 8ème tranche, Boulevard Latrille, Abidjan',
  gpsCoordinates: '5.3892° N, 3.9856° W',
  defaultExpress: true,
  frequentZones: ['Cocody', 'Plateau', 'Marcory', 'Yopougon', 'Deux Plateaux'],
  permanentInstructions: 'Toujours appeler la boutique 10 min avant l\'arrivée pour la remise du colis scellé.',
  notifyOnCreated: true,
  notifyOnStatusChange: true,
  notifyOnCourierAssigned: true,
  notifyOnDelivered: true,
  notifyOnIncident: true,
  channelWhatsApp: true,
  channelSMS: true,
  channelEmail: true,
  defaultPaymentMethod: 'MTN Mobile Money (+225 05 •• •• 42)',
  twoFactorAuth: true
};

export const INITIAL_COURIER_SETTINGS: CourierSettings = {
  fullName: 'David Kouadio',
  phone: '+225 07 48 92 11 04',
  email: 'david.kouadio@coursier-link.ci',
  parkingBaseAddress: 'Carrefour Duncan, Cocody 2 Plateaux, Abidjan',
  isAvailable: true,
  workingHours: 'Lundi à Samedi de 08:00 à 19:30',
  soundAlerts: true,
  activeZones: ['Centre-ville', 'Zongo', 'Akpakpa'],
  vehicleType: 'Moto · Yamaha 125cc',
  vehiclePlate: 'AB-8492-CI',
  vehicleInsuranceUpToDate: true,
  defaultPayoutMethod: 'MTN Mobile Money',
  payoutPhone: '+225 07 •• •• 04',
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
    details: 'Zone Cocody & Plateau. Retour automatique aux tarifs nominaux de livraison.'
  },
  {
    id: 'log-3',
    timestamp: '13:48:19',
    type: 'dispute',
    title: 'Litige #LL-1029 résolu',
    details: 'Colis re-routé vers le bon destinataire à Treichville sans frais additionnels.'
  },
  {
    id: 'log-4',
    timestamp: '12:10:04',
    type: 'pricing',
    title: 'Moteur tarifaire synchronisé',
    details: 'Barème kilométrique 0-3km: 1000 FCFA, 3-5km: 1500 FCFA, +150 FCFA/km.'
  }
];

export const PRICING_RULES: PricingRule = {
  baseDistanceKm: 3,
  baseFeeFCFA: 1000,
  extraPerKmFCFA: 150,
  fragileSurchargeFCFA: 200,
  commissionRatePercent: 0 // 0% MVP Launch Offer
};
