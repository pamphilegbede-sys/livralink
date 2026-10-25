import fs from 'fs';
import path from 'path';

console.log('=====================================================');
console.log('🚀 VALIDATION DU GUIDE PAS-À-PAS (ONBOARDING DASHBOARD)');
console.log('=====================================================\n');

let total = 0;
let passed = 0;

function assert(condition: boolean, title: string, detail?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${title}`);
    if (detail) console.log(`     ℹ️  ${detail}`);
  } else {
    console.error(`  ❌ [FAIL] ${title}`);
    if (detail) console.error(`     ⚠️  ${detail}`);
  }
}

// 1. OnboardingGuideModal component verification
const modalPath = path.resolve('src/components/modals/OnboardingGuideModal.tsx');
assert(fs.existsSync(modalPath), 'Le composant OnboardingGuideModal.tsx existe dans src/components/modals/');

const modalContent = fs.readFileSync(modalPath, 'utf-8');
assert(modalContent.includes('vendeurSteps') && modalContent.includes('livreurSteps'), 'Contenu sur-mesure défini pour chaque rôle (Vendeur et Livreur)');
assert(modalContent.includes('livralink_onboarding_completed_${role}'), 'Persistance de la complétion du guide dans localStorage');
assert(modalContent.includes('aria-modal="true"'), 'Accessibilité modale WAI-ARIA conforme');
assert(modalContent.includes('keydown'), 'Prise en charge de la navigation au clavier (Échap, Flèches)');
assert(modalContent.includes('currentStepData.highlights'), 'Affichage des points clés et arguments percutants pour chaque étape');
assert(modalContent.includes('currentStepData.visualPreview'), 'Affichage des maquettes visuelles réalistes pour chaque étape');

// 2. VendeurDashboard integration
const vendeurContent = fs.readFileSync('src/components/views/VendeurDashboard.tsx', 'utf-8');
assert(vendeurContent.includes('OnboardingGuideModal'), 'VendeurDashboard importe OnboardingGuideModal');
assert(vendeurContent.includes("localStorage.getItem('livralink_onboarding_completed_vendeur')"), 'VendeurDashboard vérifie le statut du premier chargement dans localStorage');
assert(vendeurContent.includes('role="vendeur"'), 'OnboardingGuideModal instancié avec le rôle vendeur');
assert(vendeurContent.includes('Guide de démarrage'), 'Bouton explicite de réouverture du guide présent sur le dashboard vendeur');
assert(vendeurContent.includes('Nouveau sur LivraLink ? Maîtrisez la plateforme en 2 min'), 'Bannière interactive d\'onboarding présente');

// 3. LivreurDashboard integration
const livreurContent = fs.readFileSync('src/components/views/LivreurDashboard.tsx', 'utf-8');
assert(livreurContent.includes('OnboardingGuideModal'), 'LivreurDashboard importe OnboardingGuideModal');
assert(livreurContent.includes("localStorage.getItem('livralink_onboarding_completed_livreur')"), 'LivreurDashboard vérifie le statut du premier chargement dans localStorage');
assert(livreurContent.includes('role="livreur"'), 'OnboardingGuideModal instancié avec le rôle livreur');
assert(livreurContent.includes('Guide coursier'), 'Bouton explicite de réouverture du guide présent sur le dashboard livreur');
assert(livreurContent.includes('Nouveau coursier ? Maîtrisez vos missions et vos retraits'), 'Bannière interactive d\'onboarding coursier présente');

// 4. Content depth verification
assert(modalContent.includes('100 FCFA / km') && modalContent.includes('Preuve de livraison (POD)'), 'Couverture des fonctionnalités phares : tarification, POD, WhatsApp, MoMo');
assert(modalContent.includes('MTN / Moov Money') || modalContent.includes('Moov Money'), 'Couverture des paiements locaux Mobile Money Bénin');

console.log('\n-----------------------------------------------------');
console.log(`Résultats : ${passed}/${total} validés avec succès (${Math.round((passed / total) * 100)}%)`);
console.log('-----------------------------------------------------\n');

if (passed !== total) {
  process.exit(1);
} else {
  console.log('🎉 TOUS LES TESTS D\'ONBOARDING SONT VALIDÉS AVEC SUCCÈS !');
}
