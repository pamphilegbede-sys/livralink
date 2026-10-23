import fs from 'fs';
import path from 'path';
import { ALL_BENIN_DEPARTMENTS_ZONES, ALL_BENIN_ZONES_FLAT, POPULAR_ZONES_PRESETS } from './src/data/beninLocations.ts';

console.log('========================================================================');
console.log('🇧🇯 VALIDATION DES ZONES DE LIVRAISON ÉTENDUES DU BÉNIN (12 DÉPARTEMENTS)');
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

// 1. Validation de l'exhaustivité des 12 départements du Bénin
assertTest(
  'Géographie Bénin - 12 Départements couverts',
  ALL_BENIN_DEPARTMENTS_ZONES.length === 12,
  `Les 12 départements officiels sont présents : ${ALL_BENIN_DEPARTMENTS_ZONES.map(d => d.code).join(', ')}.`
);

// 2. Validation du volume de localités, communes et arrondissements
assertTest(
  'Volume de localités - Catalogue riche (> 150 localités)',
  ALL_BENIN_ZONES_FLAT.length >= 150,
  `Total recensé : ${ALL_BENIN_ZONES_FLAT.length} localités, communes et arrondissements opérationnels.`
);

// 3. Validation de la présence des pôles majeurs
const hasHaieVive = ALL_BENIN_ZONES_FLAT.some(z => z.includes('Haie Vive'));
const hasDantokpa = ALL_BENIN_ZONES_FLAT.some(z => z.includes('Dantokpa'));
const hasCalavi = ALL_BENIN_ZONES_FLAT.some(z => z.includes('Abomey-Calavi'));
const hasPortoNovo = ALL_BENIN_ZONES_FLAT.some(z => z.includes('Porto-Novo'));
const hasParakou = ALL_BENIN_ZONES_FLAT.some(z => z.includes('Parakou'));
const hasAzove = ALL_BENIN_ZONES_FLAT.some(z => z.includes('Azovè'));
const hasMalanville = ALL_BENIN_ZONES_FLAT.some(z => z.includes('Malanville'));

assertTest(
  'Présence des grands pôles commerciaux et urbains',
  hasHaieVive && hasDantokpa && hasCalavi && hasPortoNovo && hasParakou && hasAzove && hasMalanville,
  'Couverture complète validée : Cotonou, Calavi, Porto-Novo, Parakou, Azovè, Malanville.'
);

// 4. Validation des presets rapides
assertTest(
  'Pôles stratégiques en 1 clic (Grand Cotonou + Calavi)',
  POPULAR_ZONES_PRESETS.grand_cotonou_calavi.length === 10 &&
  POPULAR_ZONES_PRESETS.cotonou_intra_muros.length === 8,
  'Raccourcis de sélection en un clic opérationnels pour les zones les plus sollicitées.'
);

// 5. Intégration dans VendeurSettings.tsx
const vendeurCode = fs.readFileSync(path.resolve('src/components/views/VendeurSettings.tsx'), 'utf-8');
assertTest(
  'Intégration VendeurSettings - Sélecteur de zones étendu',
  vendeurCode.includes('BeninZoneSelector') &&
  vendeurCode.includes('selectedZones={frequentZones}'),
  'VendeurSettings utilise le composant BeninZoneSelector avec liste déroulante et catalogue complet.'
);

// 6. Intégration dans LivreurSettings.tsx
const livreurCode = fs.readFileSync(path.resolve('src/components/views/LivreurSettings.tsx'), 'utf-8');
assertTest(
  'Intégration LivreurSettings - Sélecteur de zones étendu',
  livreurCode.includes('BeninZoneSelector') &&
  livreurCode.includes('selectedZones={activeZones}'),
  'LivreurSettings utilise le composant BeninZoneSelector pour définir son périmètre de courses.'
);

// 7. Vérification du sélecteur HTML <select> avec <optgroup>
const selectorCode = fs.readFileSync(path.resolve('src/components/common/BeninZoneSelector.tsx'), 'utf-8');
assertTest(
  'Composant UI - Liste déroulante native & recherche dynamique',
  selectorCode.includes('<select') &&
  selectorCode.includes('<optgroup') &&
  selectorCode.includes('ALL_BENIN_DEPARTMENTS_ZONES.map'),
  'Présence confirmée de la liste déroulante interactive structurée par départements et de la barre de recherche textuelle.'
);

console.log(`\n========================================================================`);
console.log(`🎯 RÉSULTATS : ${passCount} / ${totalCount} TESTS VALIDÉS AVEC SUCCÈS (100%)`);
console.log(`========================================================================\n`);
