import fs from 'fs';
import path from 'path';

console.log('=====================================================');
console.log('🧪 SUITE DE VALIDATION : SUPPRESSION MODALE & AUTH DIRECTE GOOGLE');
console.log('=====================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, title: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${title}`);
    if (details) console.log(`     ℹ️  ${details}`);
  } else {
    console.error(`  ❌ [FAIL] ${title}`);
    if (details) console.error(`     ⚠️  ${details}`);
  }
}

// 1. GoogleSignInModal file removal
const modalPath = path.resolve(process.cwd(), 'src/components/modals/GoogleSignInModal.tsx');
assert(!fs.existsSync(modalPath), 'Le composant GoogleSignInModal.tsx a été supprimé de src/components/modals/');

// 2. App.tsx should NOT import or render GoogleSignInModal
const appTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
assert(!appTsx.includes('GoogleSignInModal'), 'src/App.tsx ne contient plus aucun import ni balise GoogleSignInModal');
assert(!appTsx.includes('isGoogleModalOpen'), 'src/App.tsx n\'utilise plus isGoogleModalOpen pour afficher une modale interne');

// 3. LoginVendeurPage.tsx validation
const loginVendeurTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/components/views/LoginVendeurPage.tsx'), 'utf-8');
assert(!loginVendeurTsx.includes('openGoogleModal'), 'LoginVendeurPage.tsx n\'invoque plus openGoogleModal dans le catch block ni useApp');
assert(!loginVendeurTsx.includes('Sélectionner un compte Google'), 'Le bouton secondaire de sélection simulée a été retiré de LoginVendeurPage.tsx');
assert(loginVendeurTsx.includes("loginWithGoogle('vendeur')"), 'LoginVendeurPage.tsx appelle directement loginWithGoogle(\'vendeur\')');

// 4. LoginLivreurPage.tsx validation
const loginLivreurTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/components/views/LoginLivreurPage.tsx'), 'utf-8');
assert(!loginLivreurTsx.includes('openGoogleModal'), 'LoginLivreurPage.tsx n\'invoque plus openGoogleModal dans le catch block ni useApp');
assert(!loginLivreurTsx.includes('Sélectionner un compte Google'), 'Le bouton secondaire de sélection simulée a été retiré de LoginLivreurPage.tsx');
assert(loginLivreurTsx.includes("loginWithGoogle('livreur')"), 'LoginLivreurPage.tsx appelle directement loginWithGoogle(\'livreur\')');

// 5. RegisterPage.tsx validation
const registerTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/components/views/RegisterPage.tsx'), 'utf-8');
assert(!registerTsx.includes('openGoogleModal'), 'RegisterPage.tsx n\'invoque plus openGoogleModal');
assert(registerTsx.includes('loginWithGoogle(selectedRole)'), 'RegisterPage.tsx appelle directement loginWithGoogle(selectedRole)');

// 6. AdminConsole.tsx validation
const adminTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/components/views/AdminConsole.tsx'), 'utf-8');
assert(!adminTsx.includes('openGoogleModal'), 'AdminConsole.tsx n\'invoque plus openGoogleModal');
assert(adminTsx.includes("loginWithGoogle('admin')"), 'AdminConsole.tsx appelle directement loginWithGoogle(\'admin\')');

// 7. authService.ts direct Google flow validation
const authServiceTs = fs.readFileSync(path.resolve(process.cwd(), 'src/firebase/authService.ts'), 'utf-8');
assert(!authServiceTs.includes('shouldOpenFallbackModal'), 'authService.ts n\'active plus de fallback modal dans loginWithGoogle');
assert(authServiceTs.includes("prompt: 'select_account'"), 'authService.ts configure GoogleAuthProvider avec prompt: "select_account"');
assert(authServiceTs.includes('signInWithPopup(auth, provider)'), 'authService.ts utilise signInWithPopup pour ouvrir la mire authentique Google');

// 8. AppContext.tsx deactivation verification
const appContextTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AppContext.tsx'), 'utf-8');
assert(appContextTsx.includes('// In-app Google Modal permanently deactivated in favor of direct authentic Google Auth'), 'AppContext.tsx désactive définitivement toute ouverture de modale interne');

console.log('\n-----------------------------------------------------');
console.log(`Résultats des tests : ${passedTests}/${totalTests} réussis (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('-----------------------------------------------------\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('🎉 TOUS LES TESTS SONT VALIDES AVEC SUCCÈS !');
}
