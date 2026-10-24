import fs from 'fs';
import path from 'path';

console.log('=====================================================');
console.log('🌙 VALIDATION DU MODE SOMBRE (VENDEUR & LIVREUR)');
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

// 1. DarkModeToggle component
const togglePath = path.resolve('src/components/common/DarkModeToggle.tsx');
assert(fs.existsSync(togglePath), 'Le composant DarkModeToggle.tsx existe');
const toggleContent = fs.readFileSync(togglePath, 'utf-8');
assert(toggleContent.includes('role="switch"') && toggleContent.includes('aria-checked={isDarkMode}'), 'Interrupteur accessible avec role="switch" et aria-checked');
assert(toggleContent.includes('toggleDarkMode'), 'Interrupteur relié à toggleDarkMode');
assert(toggleContent.includes('dark:bg-slate-900'), 'Classes utilitaires Tailwind dark: présentes dans le composant');

// 2. AppContext dark mode support
const appContextContent = fs.readFileSync('src/context/AppContext.tsx', 'utf-8');
assert(appContextContent.includes('isDarkMode: boolean'), 'AppContextType définit isDarkMode');
assert(appContextContent.includes('toggleDarkMode: () => void'), 'AppContextType définit toggleDarkMode');
assert(appContextContent.includes("localStorage.getItem('livralink_dark_mode')"), 'Persistance de la préférence de mode sombre dans localStorage');
assert(appContextContent.includes("document.documentElement.classList.add('dark')"), 'Synchronisation dynamique de la classe dark sur le document');

// 3. VendeurSettings integration
const vendeurSettingsContent = fs.readFileSync('src/components/views/VendeurSettings.tsx', 'utf-8');
assert(vendeurSettingsContent.includes('DarkModeToggle'), 'VendeurSettings importe et instancie DarkModeToggle');
assert(vendeurSettingsContent.includes('Thème Visuel & Mode Sombre Vendeur'), 'Titre explicite configuré pour le Vendeur');
assert(vendeurSettingsContent.includes('dark:bg-slate-950') && vendeurSettingsContent.includes('dark:text-slate-100'), 'Classes utilitaires globales de fond et de texte sur VendeurSettings');

// 4. LivreurSettings integration
const livreurSettingsContent = fs.readFileSync('src/components/views/LivreurSettings.tsx', 'utf-8');
assert(livreurSettingsContent.includes('DarkModeToggle'), 'LivreurSettings importe et instancie DarkModeToggle');
assert(livreurSettingsContent.includes('Mode Sombre Coursier (Confort de Nuit)'), 'Titre explicite orienté confort de nuit pour le Livreur');
assert(livreurSettingsContent.includes('dark:bg-slate-950') && livreurSettingsContent.includes('dark:text-slate-100'), 'Classes utilitaires globales de fond et de texte sur LivreurSettings');

// 5. Global styles & Tailwind variant
const indexCssContent = fs.readFileSync('src/index.css', 'utf-8');
assert(indexCssContent.includes('@custom-variant dark'), 'Directive @custom-variant dark configurée dans index.css');
assert(indexCssContent.includes('html.dark body'), 'Règles de fond et de texte globales pour html.dark body définies');

// 6. Header & App wrapper dark classes
const appContent = fs.readFileSync('src/App.tsx', 'utf-8');
assert(appContent.includes('dark:bg-slate-950') && appContent.includes('dark:text-slate-100'), 'App.tsx applique les classes de fond et de texte globales');
assert(appContent.includes("isDarkMode ? 'dark' : ''"), 'App.tsx injecte la classe dark au conteneur principal');

const headerContent = fs.readFileSync('src/components/common/Header.tsx', 'utf-8');
assert(headerContent.includes('dark:bg-slate-900') && headerContent.includes('dark:border-slate-800'), 'Header.tsx supporte les classes utilitaires sombres');
assert(headerContent.includes('toggleDarkMode'), 'Header.tsx propose un bouton d\'accès rapide au basculement de thème');

console.log('\n-----------------------------------------------------');
console.log(`Résultats : ${passed}/${total} validés avec succès (${Math.round((passed / total) * 100)}%)`);
console.log('-----------------------------------------------------\n');

if (passed !== total) {
  process.exit(1);
} else {
  console.log('🎉 TOUS LES TESTS DU MODE SOMBRE SONT VALIDÉS AVEC SUCCÈS !');
}
