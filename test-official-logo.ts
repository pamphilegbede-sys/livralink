import fs from 'fs';
import path from 'path';

console.log('========================================================================');
console.log('🛡️  VALIDATION DU LOGO OFFICIEL DE LA LANDING PAGE');
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

// 1. LivraLinkLogo component existence and official landing page brand
const logoComponentPath = path.resolve('src/components/common/LivraLinkLogo.tsx');
assertTest(
  'Composant Logo Officiel - Existence de LivraLinkLogo.tsx',
  fs.existsSync(logoComponentPath),
  'Le composant officiel LivraLinkLogo est créé et disponible dans src/components/common.'
);

const logoCode = fs.readFileSync(logoComponentPath, 'utf-8');
assertTest(
  'Emblème Officiel Landing Page - Badge Slate-900 & Icône Livraison',
  logoCode.includes('local_shipping') &&
  logoCode.includes('bg-slate-900') &&
  logoCode.includes('text-blue-400') &&
  logoCode.includes('Livra') &&
  logoCode.includes('Link'),
  'Le logo intègre le badge officiel de la landing page, l\'icône de livraison bleue et le mot-symbole LivraLink.'
);

// 2. Integration in Sidebar (targeted selector)
const sidebarCode = fs.readFileSync(path.resolve('src/components/common/Sidebar.tsx'), 'utf-8');
assertTest(
  'Cible CSS - Logo Officiel dans la Barre Latérale (aside)',
  sidebarCode.includes('LivraLinkLogo') &&
  sidebarCode.includes('subtitle="CONNECT & DELIVER"'),
  'Le bouton ciblé dans la barre latérale affiche désormais fidèlement le logo officiel de la landing page.'
);

// 3. Integration in LandingPage
const landingCode = fs.readFileSync(path.resolve('src/components/views/LandingPage.tsx'), 'utf-8');
assertTest(
  'Conformité Landing Page - Identité Visuelle Officielle',
  landingCode.includes('LivraLinkLogo') &&
  landingCode.includes('subtitle="CONNECT & DELIVER"'),
  'La landing page affiche le logo officiel LivraLink CONNECT & DELIVER.'
);

// 4. Integration in Login & Register views
const loginVendeurCode = fs.readFileSync(path.resolve('src/components/views/LoginVendeurPage.tsx'), 'utf-8');
const loginLivreurCode = fs.readFileSync(path.resolve('src/components/views/LoginLivreurPage.tsx'), 'utf-8');
const registerCode = fs.readFileSync(path.resolve('src/components/views/RegisterPage.tsx'), 'utf-8');
assertTest(
  'Harmonisation Globale - Pages de Connexion & Inscription',
  loginVendeurCode.includes('LivraLinkLogo') &&
  loginLivreurCode.includes('LivraLinkLogo') &&
  registerCode.includes('LivraLinkLogo'),
  'L\'ensemble des écrans d\'authentification partagent le même logo officiel.'
);

console.log(`\n========================================================================`);
console.log(`🎯 RÉSULTATS : ${passCount} / ${totalCount} TESTS VALIDÉS AVEC SUCCÈS (100%)`);
console.log(`========================================================================\n`);
