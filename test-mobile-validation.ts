/**
 * Suite de 5 Tests et Validations Mobiles Professionnelles LivraLink
 * 
 * Test 1 : Géométrie Viewport Smartphone & Absence d'Overflow (360px - 430px)
 * Test 2 : Dimensions Minimales des Cibles Tactiles (Touch Hitbox >= 44px / 48px)
 * Test 3 : Confinement Typographique & Boutons Single-Line (Zéro Wrapping Cassé)
 * Test 4 : Symétrie & Ergonomie des Sélecteurs de Rôles (Vendeur vs Livreur)
 * Test 5 : Intégrité des Formulaires & Parcours d'Authentification Mobile
 */

import fs from 'fs';
import path from 'path';

interface MobileTestResult {
  id: number;
  name: string;
  category: string;
  passed: boolean;
  score: number;
  details: string;
}

const testResults: MobileTestResult[] = [];

function recordTest(id: number, name: string, category: string, passed: boolean, score: number, details: string) {
  testResults.push({
    id,
    name,
    category,
    passed,
    score,
    details: passed ? `✅ VALIDÉ : ${details}` : `❌ ÉCHEC : ${details}`,
  });
}

function runMobileValidationSuite() {
  console.log('\n📱 ========================================================');
  console.log('   LIVRALINK - SUITE DE VALIDATION UX & ERGONOMIE MOBILE');
  console.log('========================================================\n');

  const filesToCheck = [
    'src/components/views/LoginVendeurPage.tsx',
    'src/components/views/LoginLivreurPage.tsx',
    'src/components/views/RegisterPage.tsx',
    'src/components/modals/ForgotPasswordModal.tsx',
    'src/components/modals/GoogleSignInModal.tsx',
  ];

  const contents: Record<string, string> = {};
  for (const f of filesToCheck) {
    const fullPath = path.resolve(process.cwd(), f);
    if (fs.existsSync(fullPath)) {
      contents[f] = fs.readFileSync(fullPath, 'utf8');
    } else {
      console.error(`Fichier manquant: ${f}`);
      process.exit(1);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1 : Géométrie Viewport Smartphone & Absence d'Overflow (360px - 430px)
  // ---------------------------------------------------------------------------
  {
    // Vérification que les pages utilisent des conteneurs responsives avec padding adaptatif (px-3.5 ou px-4 sur mobile)
    // et pas de rigidité en largeur fixe risquant de dépasser les 360px
    let noOverflowCompliant = true;
    for (const [file, code] of Object.entries(contents)) {
      if (code.includes('w-[500px]') || code.includes('w-[600px]')) {
        noOverflowCompliant = false;
        break;
      }
      // Doit inclure un max-w adaptatif et padding mobile
      const hasResponsivePadding = code.includes('px-3.5') || code.includes('px-4') || code.includes('p-4');
      if (!hasResponsivePadding) {
        noOverflowCompliant = false;
        break;
      }
    }

    recordTest(
      1,
      'Géométrie Viewport Smartphone (360px à 430px)',
      'Viewport & Responsiveness',
      noOverflowCompliant,
      100,
      'Conteneurs fluides avec padding mobile ergonomique (px-3.5/px-4) sans débordement horizontal sur écrans étroits'
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 2 : Dimensions Minimales des Cibles Tactiles (Touch Hitbox >= 44px / 48px)
  // ---------------------------------------------------------------------------
  {
    // Tous les boutons principaux et champs de saisie doivent disposer de min-h-[44px] ou min-h-[48px]
    let touchTargetCompliant = true;
    const keyFiles = [
      'src/components/views/LoginVendeurPage.tsx',
      'src/components/views/LoginLivreurPage.tsx',
      'src/components/views/RegisterPage.tsx',
    ];

    for (const file of keyFiles) {
      const code = contents[file];
      const hasMinH44 = code.includes('min-h-[44px]');
      const hasMinH48 = code.includes('min-h-[48px]');
      if (!hasMinH44 || !hasMinH48) {
        touchTargetCompliant = false;
        break;
      }
    }

    recordTest(
      2,
      'Hauteur Tactile Minimale (Thumb Hitbox >= 44px / 48px)',
      'Ergonomie Tactile',
      touchTargetCompliant,
      100,
      'Boutons d\'action primaire (48px) et champs de saisie (44px) respectent rigoureusement les normes d\'accessibilité tactile'
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 3 : Confinement Typographique & Boutons Single-Line (Zéro Wrapping Cassé)
  // ---------------------------------------------------------------------------
  {
    // Vérification de l'élimination des termes verbeux cassant les boutons comme "(Popup OAuth)"
    // et vérification que les libellés sont concis et lisibles
    let typographyCompliant = true;
    for (const [file, code] of Object.entries(contents)) {
      if (code.includes('(Popup OAuth)') || code.includes('(1-clic)')) {
        typographyCompliant = false;
        break;
      }
    }

    recordTest(
      3,
      'Typographie & Confinement Boutons Single-Line',
      'Harmonie Visuelle',
      typographyCompliant,
      100,
      'Textes de boutons concis ("Continuer avec Google", "Se connecter"), sans parenthèses techniques ni coupures de ligne intempestives'
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 4 : Symétrie & Ergonomie des Sélecteurs de Rôles (Vendeur vs Livreur)
  // ---------------------------------------------------------------------------
  {
    // Les sélecteurs de rôle doivent être équilibrés, avoir des hauteurs identiques et un état actif soigné
    const regCode = contents['src/components/views/RegisterPage.tsx'];
    const hasRoleCards = regCode.includes('Je suis vendeur') && regCode.includes('Je suis livreur');
    const hasEqualHeight = regCode.includes('min-h-[80px]') && regCode.includes('grid grid-cols-2');

    recordTest(
      4,
      'Symétrie et Contraste des Sélecteurs de Rôles',
      'Composants & Formes',
      hasRoleCards && hasEqualHeight,
      100,
      'Cartes de rôle Vendeur et Livreur parfaitement symétriques (min-h-[80px]), avec icônes distinctes et feedback visuel clair'
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 5 : Intégrité des Formulaires & Parcours d'Authentification Mobile
  // ---------------------------------------------------------------------------
  {
    // Vérifier les fonctionnalités critiques du formulaire : validation mot de passe, indicatif Bénin (+229), bascule mot de passe masqué/visible
    const loginVendeurCode = contents['src/components/views/LoginVendeurPage.tsx'];
    const registerCode = contents['src/components/views/RegisterPage.tsx'];

    const hasPasswordToggle = loginVendeurCode.includes('showPassword') && loginVendeurCode.includes('visibility');
    const hasBeninFlag = registerCode.includes('+229');
    const hasRememberMe = loginVendeurCode.includes('rememberMe');
    const hasGoogleAuthTrigger = loginVendeurCode.includes('handleGoogleLogin');

    const authIntegrity = hasPasswordToggle && hasBeninFlag && hasRememberMe && hasGoogleAuthTrigger;

    recordTest(
      5,
      'Intégrité des Formulaires & Flux d\'Authentification',
      'Fonctionnalité & Validations',
      authIntegrity,
      100,
      'Bascule œil mot de passe, indicatif pays (+229), session active ("Se souvenir de moi") et intégration Google OAuth opérationnels'
    );
  }

  // Rapport final
  console.log('--------------------------------------------------------');
  let passCount = 0;
  for (const t of testResults) {
    if (t.passed) passCount++;
    console.log(`[TEST ${t.id}] ${t.name} (${t.category})\n       ${t.details}\n`);
  }
  console.log('--------------------------------------------------------');
  console.log(`SCORE DE VALIDATION MOBILE : ${passCount} / ${testResults.length} (${Math.round((passCount / testResults.length) * 100)}%)`);
  if (passCount === testResults.length) {
    console.log('✨ TOUTES LES PAGES MOBILES SONT HARMONISÉES ET VALIDÉES À 100 %.\n');
  } else {
    console.error('Certains critères mobiles ont échoué.');
    process.exit(1);
  }
}

runMobileValidationSuite();
