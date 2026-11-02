import { DeliveryOrder, UserRole } from '../types';

export interface AutomatedTestResult {
  testId: string;
  name: string;
  category: 'role_segregation' | 'step_validation' | 'anti_fraud' | 'admin_supervision';
  expectedOutcome: 'SUCCESS' | 'REJECTED';
  actualOutcome: 'SUCCESS' | 'REJECTED';
  passed: boolean;
  durationMs: number;
  message: string;
}

export const runDeliveryStepValidationTestSuite = async (
  updateStatusFn: (orderId: string, newStatus: any, note?: string, callerRoleOverride?: UserRole) => { success: boolean; reason?: string },
  validatePodFn: (orderId: string, data: any, code?: string, callerRoleOverride?: UserRole) => { success: boolean; reason?: string }
): Promise<AutomatedTestResult[]> => {
  const results: AutomatedTestResult[] = [];

  // -------------------------------------------------------------------------
  // Test 1: Livreur assigné valide l'étape 'colis_recupere'
  // -------------------------------------------------------------------------
  const startT1 = performance.now();
  const resT1 = updateStatusFn('#LL-4190', 'colis_recupere', 'Test automatisé : Récupération par livreur', 'livreur');
  const durationT1 = Math.round(performance.now() - startT1);
  results.push({
    testId: 'TEST-01',
    name: 'Validation étape par le Livreur assigné',
    category: 'step_validation',
    expectedOutcome: 'SUCCESS',
    actualOutcome: resT1.success ? 'SUCCESS' : 'REJECTED',
    passed: resT1.success === true,
    durationMs: durationT1,
    message: resT1.success
      ? 'Étape "colis_recupere" validée avec succès par le livreur assigné.'
      : `Échec inattendu : ${resT1.reason || 'Erreur inconnue'}`,
  });

  // -------------------------------------------------------------------------
  // Test 2: Livreur assigné certifie la livraison avec preuve POD Tri-Facteur
  // -------------------------------------------------------------------------
  const startT2 = performance.now();
  const resT2 = validatePodFn('#LL-4190', {
    otpCode: '8492',
    photoUrl: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=500',
    signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    signedByName: 'Sarah Kouamé (Client Test)',
  }, '8492', 'livreur');
  const durationT2 = Math.round(performance.now() - startT2);
  results.push({
    testId: 'TEST-02',
    name: 'Certification POD Tri-Facteur par le Livreur',
    category: 'step_validation',
    expectedOutcome: 'SUCCESS',
    actualOutcome: resT2.success ? 'SUCCESS' : 'REJECTED',
    passed: resT2.success === true,
    durationMs: durationT2,
    message: resT2.success
      ? 'Certificat POD (OTP + Photo + Signature) validé avec succès par le livreur.'
      : `Échec inattendu : ${resT2.reason || 'Erreur inconnue'}`,
  });

  // -------------------------------------------------------------------------
  // Test 3: Vendeur tente de valider une étape de livraison (Blocage Sécurité)
  // -------------------------------------------------------------------------
  const startT3 = performance.now();
  const resT3 = updateStatusFn('#LL-4190', 'en_cours', 'Tentative de validation par le vendeur', 'vendeur');
  const durationT3 = Math.round(performance.now() - startT3);
  results.push({
    testId: 'TEST-03',
    name: 'Blocage de validation d\'étape par le Vendeur (Sécurité Anti-Usurpation)',
    category: 'anti_fraud',
    expectedOutcome: 'REJECTED',
    actualOutcome: resT3.success ? 'SUCCESS' : 'REJECTED',
    passed: resT3.success === false,
    durationMs: durationT3,
    message: !resT3.success
      ? `Sécurité OK : Tentative du vendeur bloquée conformément aux règles (${resT3.reason || 'Accès refusé'}).`
      : 'ECHEC DE SÉCURITÉ : Le vendeur a pu valider une étape réservée au livreur !',
  });

  // -------------------------------------------------------------------------
  // Test 4: Vendeur tente de certifier un POD de livraison (Blocage Sécurité)
  // -------------------------------------------------------------------------
  const startT4 = performance.now();
  const resT4 = validatePodFn('#LL-4190', {
    otpCode: '8492',
    photoUrl: '...',
    signatureDataUrl: '...',
    signedByName: 'Vendeur Unauthorized',
  }, '8492', 'vendeur');
  const durationT4 = Math.round(performance.now() - startT4);
  results.push({
    testId: 'TEST-04',
    name: 'Blocage de validation POD par le Vendeur',
    category: 'anti_fraud',
    expectedOutcome: 'REJECTED',
    actualOutcome: resT4.success ? 'SUCCESS' : 'REJECTED',
    passed: resT4.success === false,
    durationMs: durationT4,
    message: !resT4.success
      ? `Sécurité OK : Certification POD du vendeur rejetée (${resT4.reason}).`
      : 'ECHEC DE SÉCURITÉ : Le vendeur a pu valider le POD !',
  });

  // -------------------------------------------------------------------------
  // Test 5: Administrateur effectue une supervision / résolution
  // -------------------------------------------------------------------------
  const startT5 = performance.now();
  const resT5 = updateStatusFn('#LL-4190', 'en_cours', 'Supervision administrative / Résolution litige', 'admin');
  const durationT5 = Math.round(performance.now() - startT5);
  results.push({
    testId: 'TEST-05',
    name: 'Supervision & Contrôle Administrateur',
    category: 'admin_supervision',
    expectedOutcome: 'SUCCESS',
    actualOutcome: resT5.success ? 'SUCCESS' : 'REJECTED',
    passed: resT5.success === true,
    durationMs: durationT5,
    message: resT5.success
      ? 'Droit de supervision administrateur exécuté avec succès.'
      : `Échec inattendu de l'admin : ${resT5.reason}`,
  });

  return results;
};
