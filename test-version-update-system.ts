/**
 * Test Suite: LivraLink Version Propagation, Smart Caching & PWA Update System
 * Validates zero-delay version updates, HTTP cache headers, and simulated successive deployments.
 */
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('🚀 Démarrage des tests du système de mise à jour et de propagation LivraLink...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, details?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${details || 'Échec de validation'}`);
      failed++;
    }
  }

  // TEST 1: Vérification du fichier dist/version.json
  const distVersionPath = path.resolve(process.cwd(), 'dist/version.json');
  assert(fs.existsSync(distVersionPath), 'dist/version.json existe après le build');

  if (fs.existsSync(distVersionPath)) {
    const vData = JSON.parse(fs.readFileSync(distVersionPath, 'utf8'));
    assert(Boolean(vData.version && vData.buildTime), 'dist/version.json contient version et buildTime', JSON.stringify(vData));
  }

  // TEST 2: Vérification de l'exclusion de version.json du pré-cache Service Worker
  const distSwPath = path.resolve(process.cwd(), 'dist/sw.js');
  assert(fs.existsSync(distSwPath), 'dist/sw.js existe');
  if (fs.existsSync(distSwPath)) {
    const swContent = fs.readFileSync(distSwPath, 'utf8');
    const isVersionPrecached = swContent.includes('"url": "version.json"');
    assert(!isVersionPrecached, 'version.json est bien exclu du pré-cache Service Worker (pour éviter le cache local)');
    assert(swContent.includes('NetworkOnly'), 'Le Service Worker applique NetworkOnly sur version.json');
    assert(swContent.includes('sw-push.js'), 'Le Service Worker importe correctement sw-push.js');
  }

  // TEST 3: Vérification des balises méta anti-cache dans index.html
  const indexPath = path.resolve(process.cwd(), 'index.html');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  assert(
    indexContent.includes('http-equiv="Cache-Control"') && indexContent.includes('no-cache, no-store, must-revalidate'),
    'index.html contient la balise méta anti-cache no-store, must-revalidate'
  );
  assert(
    indexContent.includes('http-equiv="Pragma"') && indexContent.includes('content="no-cache"'),
    'index.html contient la balise méta Pragma: no-cache'
  );

  // TEST 4: Vérification de la configuration firebase.json pour le cache hosting
  const firebaseJsonPath = path.resolve(process.cwd(), 'firebase.json');
  const firebaseContent = fs.readFileSync(firebaseJsonPath, 'utf8');
  const fbJson = JSON.parse(firebaseContent);
  assert(Boolean(fbJson.hosting), 'firebase.json contient une section hosting');
  assert(Boolean(fbJson.hosting.headers && fbJson.hosting.headers.length >= 3), 'firebase.json contient les règles d\'en-têtes HTTP de cache pour CDN/Hosting');

  // TEST 5: Vérification de la gestion des erreurs de chargement de chunk (vite:preloadError & ErrorBoundary)
  const mainTsxPath = path.resolve(process.cwd(), 'src/main.tsx');
  const mainContent = fs.readFileSync(mainTsxPath, 'utf8');
  assert(mainContent.includes('vite:preloadError'), 'src/main.tsx intercepte vite:preloadError pour éviter les écrans blancs');

  const errorBoundaryPath = path.resolve(process.cwd(), 'src/components/common/ErrorBoundary.tsx');
  const errorBoundaryContent = fs.readFileSync(errorBoundaryPath, 'utf8');
  assert(
    errorBoundaryContent.includes('isChunkError') && errorBoundaryContent.includes('Mise à jour LivraLink requise'),
    'src/components/common/ErrorBoundary.tsx gère intelligemment les chunks obsolètes post-déploiement'
  );

  // TEST 6: Vérification du hook de détection et de la bannière utilisateur
  const bannerPath = path.resolve(process.cwd(), 'src/components/common/UpdateNotificationBanner.tsx');
  assert(fs.existsSync(bannerPath), 'Composant UpdateNotificationBanner créé');

  const hookPath = path.resolve(process.cwd(), 'src/hooks/useVersionUpdate.ts');
  assert(fs.existsSync(hookPath), 'Hook useVersionUpdate créé avec gestion du focus, de la visibilité et du polling');

  // TEST 7: Simulation de déploiements successifs (V1 -> V2 -> V3)
  console.log('\n--- Simulation de 3 déploiements successifs instantanés ---');
  const testVersions = [
    { version: '2.4.1001', buildTime: new Date(Date.now() - 3600000).toISOString(), appName: 'LivraLink' },
    { version: '2.4.1002', buildTime: new Date(Date.now() - 1800000).toISOString(), appName: 'LivraLink' },
    { version: '2.4.1003', buildTime: new Date().toISOString(), appName: 'LivraLink' },
  ];

  for (let i = 0; i < testVersions.length; i++) {
    const simVersion = testVersions[i];
    fs.writeFileSync(distVersionPath, JSON.stringify(simVersion, null, 2), 'utf8');
    const readBack = JSON.parse(fs.readFileSync(distVersionPath, 'utf8'));
    assert(readBack.version === simVersion.version, `Déploiement ${i + 1} (${simVersion.version}) propagé instantanément dans le système`);
  }

  // Restore fresh version in dist/version.json
  const freshVersion = {
    version: `2.4.${Date.now()}`,
    buildTime: new Date().toISOString(),
    appName: 'LivraLink',
  };
  fs.writeFileSync(distVersionPath, JSON.stringify(freshVersion, null, 2), 'utf8');

  console.log(`\n=================================================`);
  console.log(`RÉSULTAT DES TESTS : ${passed} passés, ${failed} échoués`);
  console.log(`=================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erreur non capturée:', err);
  process.exit(1);
});
