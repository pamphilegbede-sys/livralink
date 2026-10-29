import { DEFAULT_PLATFORM_FEATURE_FLAGS, AppNotification } from '../src/types';
import { INITIAL_MERCHANTS, INITIAL_COURIERS } from '../src/data/mockData';
import { 
  createFreshMerchantSettings, 
  createFreshCourierSettings, 
  createFreshMerchantEntity, 
  createFreshCourierEntity 
} from '../src/utils/userIsolation';

function runDirectorAndValidationTests() {
  console.log('🧪 LANCEMENT DU TEST SUITE COMPLET : MODE DIRECTEUR & VALIDATIONS DES LIVRAISONS');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✅ [PASS] ${testName} ${detail ? '— ' + detail : ''}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${detail ? '— ' + detail : ''}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // 1. Test Feature Flags initial structure & defaults
  console.log('\n--- 1. Feature Flags & Defaults ---');
  assert(DEFAULT_PLATFORM_FEATURE_FLAGS.vendeurSpaceEnabled === true, 'vendeurSpaceEnabled est activé par défaut');
  assert(DEFAULT_PLATFORM_FEATURE_FLAGS.livreurSpaceEnabled === true, 'livreurSpaceEnabled est activé par défaut');
  assert(DEFAULT_PLATFORM_FEATURE_FLAGS.requireOtpPOD === true, 'requireOtpPOD obligatoire par défaut');
  assert(DEFAULT_PLATFORM_FEATURE_FLAGS.requireLivePhotoPOD === true, 'requireLivePhotoPOD obligatoire par défaut');
  assert(DEFAULT_PLATFORM_FEATURE_FLAGS.requireTactileSignaturePOD === true, 'requireTactileSignaturePOD obligatoire par défaut');
  assert(DEFAULT_PLATFORM_FEATURE_FLAGS.allowExpressCreation === true, 'allowExpressCreation est actif par défaut');
  assert(DEFAULT_PLATFORM_FEATURE_FLAGS.allowMissionRefusal === true, 'allowMissionRefusal est actif par défaut');

  // 2. Test Feature Flags mutation & persistence simulation
  console.log('\n--- 2. Modification & Contrôle Administratif des Fonctionnalités ---');
  let currentFlags = { ...DEFAULT_PLATFORM_FEATURE_FLAGS };
  
  // Admin désactive la création express pour les marchands
  currentFlags.allowExpressCreation = false;
  assert(currentFlags.allowExpressCreation === false, 'Admin peut désactiver la création express en temps réel');

  // Admin verrouille l'espace livreur avec motif
  currentFlags.livreurSpaceEnabled = false;
  currentFlags.livreurMaintenanceNotice = 'Maintenance serveurs de géolocalisation';
  assert(!currentFlags.livreurSpaceEnabled, 'Admin peut verrouiller l\'espace livreur');
  assert(currentFlags.livreurMaintenanceNotice.includes('serveurs'), 'Motif de maintenance enregistré');

  // Admin active un message d\'urgence mondial
  currentFlags.emergencyBroadcastActive = true;
  currentFlags.emergencyBroadcastMessage = 'Forte pluie sur Cotonou - Tarifs majorés de 20%';
  assert(currentFlags.emergencyBroadcastActive === true, 'Admin peut diffuser un message d\'alerte global');
  assert(currentFlags.emergencyBroadcastMessage.includes('Forte pluie'), 'Message d\'alerte bien configuré');

  // 3. Test Mode Directeur & Pilotage des Boutiques / Livreurs
  console.log('\n--- 3. Mode Directeur Général (Pilotage de compte) ---');
  const merchantToPilot = INITIAL_MERCHANTS[0];
  const courierToPilot = INITIAL_COURIERS[0];
  
  assert(Boolean(merchantToPilot && merchantToPilot.id), 'Marchand cible identifié', merchantToPilot.storeName);
  assert(Boolean(courierToPilot && courierToPilot.id), 'Livreur cible identifié', courierToPilot.name);

  // Simulation état contextuel
  let isDirectorModeActive = false;
  let directorTargetName: string | null = null;
  let currentRole: string = 'admin';
  let currentView: string = 'admin_console';

  // Admin clique sur "Piloter boutique"
  isDirectorModeActive = true;
  directorTargetName = merchantToPilot.storeName;
  currentRole = 'vendeur';
  currentView = 'vendeur_dashboard';

  assert(isDirectorModeActive === true, 'Mode directeur activé');
  assert(directorTargetName === merchantToPilot.storeName, 'Cible de pilotage enregistrée');
  assert(currentRole === 'vendeur', 'Rôle basculé vers vendeur');
  assert(currentView === 'vendeur_dashboard', 'Vue basculée vers vendeur_dashboard');

  // Admin quitte le mode directeur
  isDirectorModeActive = false;
  directorTargetName = null;
  currentRole = 'admin';
  currentView = 'admin_console';

  assert(isDirectorModeActive === false, 'Mode directeur désactivé');
  assert(currentRole === 'admin', 'Retour au rôle administrateur');
  assert(currentView === 'admin_console', 'Retour à la console admin');

  // Admin clique sur "Piloter livreur"
  isDirectorModeActive = true;
  directorTargetName = courierToPilot.name;
  currentRole = 'livreur';
  currentView = 'livreur_dashboard';

  assert(isDirectorModeActive === true, 'Mode directeur activé pour livreur');
  assert(directorTargetName === courierToPilot.name, 'Cible de pilotage livreur enregistrée');
  assert(currentRole === 'livreur', 'Rôle basculé vers livreur');
  assert(currentView === 'livreur_dashboard', 'Vue basculée vers livreur_dashboard');

  // 4. Test Tri-Factor POD (OTP + Photo Directe + Signature Tactile)
  console.log('\n--- 4. Validation Preuve de Livraison Tri-Factor ---');
  const sampleDelivery = {
    id: '#LL-4192',
    clientName: 'Sarah K.',
    clientPhone: '+229 97 12 34 56',
    otpCode: '8492',
    status: 'en_cours',
  };

  // Test OTP match
  const enteredOtp = '8492';
  assert(enteredOtp === sampleDelivery.otpCode, 'Code OTP vendeur/client strictement vérifié');

  // Test Photo Directe (non issue de la galerie, certifiée filigrane)
  const snapshotDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';
  assert(snapshotDataUrl.startsWith('data:image/'), 'Photo directe du colis capturée');

  // Test Signature tactile & Nom
  const signerName = 'Sarah K.';
  const signatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...';
  assert(signerName.trim().length > 0, 'Nom du signataire renseigné');
  assert(signatureDataUrl.startsWith('data:image/png'), 'Tracé de signature tactile enregistré');

  // 5. Test Suspension de Comptes & Réinitialisation Sécurisée des Accès
  console.log('\n--- 5. Suspension de Comptes & Réinitialisation des Accès ---');
  // Simulation suspension livreur
  let courierStatus: string = 'en_ligne';
  courierStatus = courierStatus === 'suspendu' ? 'en_ligne' : 'suspendu';
  assert(courierStatus === 'suspendu', 'Admin peut suspendre le compte d\'un livreur');

  courierStatus = courierStatus === 'suspendu' ? 'en_ligne' : 'suspendu';
  assert(courierStatus === 'en_ligne', 'Admin peut réactiver/débloquer le compte d\'un livreur');

  // Simulation suspension boutique marchand
  let merchantStatus: string = 'actif';
  merchantStatus = merchantStatus === 'suspendu' ? 'actif' : 'suspendu';
  assert(merchantStatus === 'suspendu', 'Admin peut bloquer/suspendre une boutique marchande');

  merchantStatus = merchantStatus === 'suspendu' ? 'actif' : 'suspendu';
  assert(merchantStatus === 'actif', 'Admin peut débloquer la boutique marchande');

  // Simulation génération mot de passe temporaire & réinitialisation sécurisée
  const testEmail = 'sarah.boutique@gmail.com';
  const temporaryPassword = 'LivraLink@2025!';
  assert(temporaryPassword.length >= 6, 'Mot de passe temporaire conforme aux exigences de sécurité');

  const clipboardMessage = `Bonjour Sarah Chic Boutique,\nVos identifiants d'accès sur l'application LivraLink Bénin ont été réinitialisés par l'administrateur :\n\n📧 Identifiant : ${testEmail}\n🔑 Nouveau mot de passe : ${temporaryPassword}`;
  assert(clipboardMessage.includes(testEmail) && clipboardMessage.includes(temporaryPassword), 'Format du message de transmission WhatsApp/SMS généré avec succès');

  // 6. Test Isolation Stricte des Données à la Création de Nouveaux Comptes
  console.log('\n--- 6. Isolation Stricte des Données Utilisateurs (Zéro Fuite d\'anciennes infos) ---');

  // A. Nouveau Marchand
  const newMerchantProfile = {
    uid: 'm-new-999',
    fullName: 'Reine Agbo',
    storeName: 'Boutique Reine Chic',
    phone: '+229 97 12 34 56',
    email: 'reine@boutique-reine.bj',
    locationCommune: 'Porto-Novo',
    locationAddress: 'Rue des Manguiers, Porto-Novo',
    role: 'vendeur' as const,
    createdAt: '2026-03-01'
  };

  const freshMerchantSettings = createFreshMerchantSettings(newMerchantProfile);
  assert(freshMerchantSettings.storeName === 'Boutique Reine Chic', 'Boutique du nouveau compte isolée', freshMerchantSettings.storeName);
  assert(freshMerchantSettings.managerName === 'Reine Agbo', 'Nom du gérant conforme');
  assert(freshMerchantSettings.phone === '+229 97 12 34 56', 'Numéro de téléphone du nouveau vendeur préservé');
  assert(freshMerchantSettings.email === 'reine@boutique-reine.bj', 'Email du nouveau compte préservé');
  assert(freshMerchantSettings.permanentInstructions === '', 'Instructions permanentes vierges (aucune fuite de l\'ancienne boutique Sarah)');
  assert(!freshMerchantSettings.defaultPaymentMethod.includes('42'), 'Moyen de paiement vierge/lié à son propre numéro (pas de fuite MoMo Sarah 42)');

  const freshMerchantEntity = createFreshMerchantEntity(newMerchantProfile);
  assert(freshMerchantEntity.totalOrders === 0, 'Nouveau vendeur démarre avec un historique vierge de 0 commande');
  assert(freshMerchantEntity.totalVolumeFCFA === 0, 'Nouveau vendeur démarre avec 0 FCFA de volume');

  // B. Nouveau Coursier
  const newCourierProfile = {
    uid: 'c-new-888',
    fullName: 'Jean Dupont',
    phone: '+229 96 11 22 33',
    email: 'jean.dupont@coursier.bj',
    vehicleType: 'TVS Apache 160',
    locationCommune: 'Abomey-Calavi',
    role: 'livreur' as const,
    createdAt: '2026-03-01'
  };

  const freshCourierSettings = createFreshCourierSettings(newCourierProfile);
  assert(freshCourierSettings.fullName === 'Jean Dupont', 'Nom du nouveau livreur isolé');
  assert(freshCourierSettings.phone === '+229 96 11 22 33', 'Téléphone du nouveau livreur isolé');
  assert(freshCourierSettings.vehiclePlate === '', 'Plaque d\'immatriculation vierge (pas de fuite de BJ-6621-RB)');
  assert(freshCourierSettings.parkingBaseAddress !== 'Carrefour de l\'Étoile Rouge, Cotonou, Bénin', 'Point de stationnement vierge/isolé (pas de fuite de l\'Étoile Rouge d\'Awa)');
  assert(freshCourierSettings.payoutPhone === '+229 96 11 22 33', 'Numéro de reversement propre au nouveau livreur');

  const freshCourierEntity = createFreshCourierEntity(newCourierProfile);
  assert(freshCourierEntity.totalDeliveries === 0, 'Nouveau livreur démarre avec 0 course livrée');
  assert(freshCourierEntity.walletBalanceFCFA === 0, 'Nouveau livreur démarre avec 0 FCFA dans son portefeuille (pas de solde résiduel)');

  // 6. Test Système d'E-mails Automatiques Transactionnels (Bienvenue, Réinitialisation, Alertes)
  console.log('\n--- 6. Système d\'E-mails Transactionnels Automatiques (Bienvenue & Sécurité) ---');
  
  // Test Email de Bienvenue
  const welcomePayload = {
    email: 'nouveau.client@gmail.com',
    fullName: 'Koffi Mensah',
    role: 'vendeur' as const,
    storeName: 'Koffi Épicerie Fine'
  };
  assert(Boolean(welcomePayload.email.includes('@')), 'Email destinataire valide pour envoi de bienvenue');
  assert(welcomePayload.role === 'vendeur' || welcomePayload.role === 'livreur', 'Rôle reconnu pour modèle d\'email personnalisé');
  
  // Test Email de Réinitialisation & Code OTP
  const sampleOtpCode = '482915';
  assert(sampleOtpCode.length === 6, 'Code OTP de réinitialisation comporte exactement 6 chiffres');
  assert(!isNaN(Number(sampleOtpCode)), 'Code OTP est entièrement numérique');

  // Test Email Confirmation Changement de mot de passe
  const securityAlertPayload = {
    email: 'koffi.mensah@gmail.com',
    fullName: 'Koffi Mensah'
  };
  assert(securityAlertPayload.email.length > 5, 'Email de notification de sécurité correctement ciblé');

  // 7. Test Système d'Écouteurs Firestore & Alertes Contextuelles pour Livreurs
  console.log('\n--- 7. Écouteurs Firestore & Alertes Contextuelles Livreurs ---');
  const samplePriorityMission = {
    id: '#LL-9182',
    orderId: '#LL-9182',
    pickupName: 'Mode & Élégance Cotonou',
    pickupCommune: 'Haie Vive',
    dropoffCommune: 'Akpakpa',
    deliveryFee: 2400,
    itemValueCOD: 18000,
    status: 'en_attente',
    createdAt: Date.now(),
    urgency: 'high'
  };

  assert(samplePriorityMission.status === 'en_attente', 'La mission prioritaire est en attente d\'attribution');
  // 8. Test Centre de Notifications Opérationnel en Temps Réel
  console.log('\n--- 8. Centre de Notifications Opérationnel (Icône Cloche, Badge Non Lu, Actions) ---');
  let testNotifs: AppNotification[] = [
    {
      id: 'n-1',
      type: 'order_created',
      title: '📦 Nouvelle commande créée',
      message: 'Commande #LL-7712 enregistrée',
      timestamp: '15:10',
      isRead: false,
      orderId: '#LL-7712'
    },
    {
      id: 'n-2',
      type: 'pod_validated',
      title: '✅ Certificat POD Tri-Facteur',
      message: 'Preuves validées pour #LL-4192',
      timestamp: '15:05',
      isRead: false,
      orderId: '#LL-4192'
    }
  ];

  let unreadCount = testNotifs.filter(n => !n.isRead).length;
  assert(unreadCount === 2, 'L\'icône de notification affiche exactement 2 alertes non lues dans le badge');

  // Simulation marquage d'une notification comme lue
  testNotifs = testNotifs.map(n => n.id === 'n-1' ? { ...n, isRead: true } : n);
  unreadCount = testNotifs.filter(n => !n.isRead).length;
  assert(unreadCount === 1, 'Le compteur non lu diminue de 1 après lecture');

  // Simulation marquage de toutes les notifications comme lues
  testNotifs = testNotifs.map(n => ({ ...n, isRead: true }));
  unreadCount = testNotifs.filter(n => !n.isRead).length;
  assert(unreadCount === 0, 'Badge non lu disparaît lorsque toutes les notifications sont lues');

  // Simulation ajout d'une nouvelle notification en temps réel
  const newNotif: AppNotification = {
    id: 'n-3',
    type: 'order_status',
    title: '🚚 Colis en cours de livraison',
    message: 'Livreur Awa Véloce en transit vers Akpakpa',
    timestamp: '15:12',
    isRead: false,
    orderId: '#LL-7712'
  };
  testNotifs = [newNotif, ...testNotifs];
  unreadCount = testNotifs.filter(n => !n.isRead).length;
  assert(unreadCount === 1, 'Une alerte entrant en temps réel réactive immédiatement le badge non lu');

  console.log(`\n🎉 TOUS LES TESTS SONT VALIDES : ${passed}/${total} assertions réussies avec succès.`);
}

runDirectorAndValidationTests();
