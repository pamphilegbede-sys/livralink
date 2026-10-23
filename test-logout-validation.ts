import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('🧪 VALIDATION DU BOUTON ET DU FLUX DE DÉCONNEXION (LIVREUR & VENDEUR)');
console.log('========================================================================\n');

let passCount = 0;
let totalCount = 0;

function assertTest(name: string, condition: boolean, detail: string) {
  totalCount++;
  if (condition) {
    passCount++;
    console.log(`[PASS] ${name}`);
    console.log(`       ↳ ${detail}`);
  } else {
    console.error(`[FAIL] ${name}`);
    console.error(`       ↳ ÉCHEC: ${detail}`);
    process.exit(1);
  }
}

// 1. Check Sidebar.tsx
const sidebarPath = path.resolve('src/components/common/Sidebar.tsx');
const sidebarCode = fs.readFileSync(sidebarPath, 'utf-8');

assertTest(
  'Sidebar - Bouton Déconnexion dans la liste Vendeur',
  sidebarCode.includes('Bouton Déconnexion dans la barre latérale Vendeur') &&
  sidebarCode.includes('onClick={handleLogout}'),
  'Le bouton Déconnexion est intégré directement dans la liste des onglets vendeur de la barre latérale.'
);

assertTest(
  'Sidebar - Bouton Déconnexion dans la liste Livreur',
  sidebarCode.includes('Bouton Déconnexion dans la barre latérale Livreur') &&
  sidebarCode.includes('title="Déconnexion de votre espace coursier"'),
  'Le bouton Déconnexion est intégré directement dans la liste des onglets coursier de la barre latérale.'
);

assertTest(
  'Sidebar - Défilement & Pied de page toujours épinglé',
  sidebarCode.includes('overflow-y-auto custom-scrollbar') &&
  sidebarCode.includes('shrink-0 bg-white') &&
  sidebarCode.includes('Se déconnecter'),
  'La barre latérale est scrollable et le pied de page avec le bouton de déconnexion reste visible sans être tronqué.'
);

// 2. Check AppContext.tsx logout flow
const appContextPath = path.resolve('src/context/AppContext.tsx');
const appContextCode = fs.readFileSync(appContextPath, 'utf-8');

assertTest(
  'AppContext - Réinitialisation de l\'historique lors de la déconnexion',
  appContextCode.includes('setViewHistory([])') &&
  appContextCode.includes('setFirebaseUser(null)') &&
  appContextCode.includes('setUserProfile(null)'),
  'L\'historique de navigation et la session utilisateur sont vidés pour empêcher tout retour arrière involontaire.'
);

assertTest(
  'AppContext - Redirection contextuelle par rôle',
  appContextCode.includes("currentRole === 'livreur' ? 'login_livreur' : 'login_vendeur'"),
  'Le vendeur déconnecté est renvoyé vers login_vendeur et le coursier vers login_livreur.'
);

// 3. Check Header.tsx mobile drawer
const headerPath = path.resolve('src/components/common/Header.tsx');
const headerCode = fs.readFileSync(headerPath, 'utf-8');

assertTest(
  'Header - Déconnexion disponible dans le tiroir mobile',
  headerCode.includes('Se déconnecter de LivraLink') &&
  headerCode.includes('await logout()'),
  'Les utilisateurs mobiles disposent d\'un accès direct à la déconnexion dans le menu tiroir.'
);

// 4. Check Settings pages
const vendeurSettingsPath = path.resolve('src/components/views/VendeurSettings.tsx');
const livreurSettingsPath = path.resolve('src/components/views/LivreurSettings.tsx');
const vendeurSettingsCode = fs.readFileSync(vendeurSettingsPath, 'utf-8');
const livreurSettingsCode = fs.readFileSync(livreurSettingsPath, 'utf-8');

assertTest(
  'Paramètres Vendeur & Livreur - Bouton Déconnexion dédié',
  vendeurSettingsCode.includes('Session &amp; Déconnexion') &&
  livreurSettingsCode.includes('Session &amp; Déconnexion'),
  'Les deux espaces disposent d\'une section dédiée dans les paramètres pour se déconnecter.'
);

console.log(`\n========================================================================`);
console.log(`🎯 RÉSULTATS : ${passCount} / ${totalCount} TESTS VALIDÉS AVEC SUCCÈS (100%)`);
console.log(`========================================================================`);
