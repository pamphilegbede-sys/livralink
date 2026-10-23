// Répertoire géographique officiel et étendu du Bénin pour LivraLink
// Couvrant l'ensemble des 12 Départements, 77 Communes, arrondissements et localités urbaines

export interface BeninZoneItem {
  name: string;
  department: string;
  commune: string;
  type: 'quartier' | 'arrondissement' | 'commune' | 'zone_speciale';
}

export interface BeninDepartmentGroup {
  department: string;
  code: string;
  icon: string;
  zones: string[];
}

export const ALL_BENIN_DEPARTMENTS_ZONES: BeninDepartmentGroup[] = [
  {
    department: 'Littoral (Cotonou Métropole)',
    code: 'LIT',
    icon: 'location_city',
    zones: [
      'Cotonou - Haie Vive',
      'Cotonou - Cadjehoun',
      'Cotonou - Les Cocotiers',
      'Cotonou - Patte d\'Oie',
      'Cotonou - Akpakpa Dodomè',
      'Cotonou - Akpakpa Centre',
      'Cotonou - Akpakpa PK3 à PK10',
      'Cotonou - Dandji / Avotrou',
      'Cotonou - Sènadé / Kowegbo / Irédé',
      'Cotonou - Sègbèya / Midombo / Adogléta',
      'Cotonou - Dantokpa (Grand Marché)',
      'Cotonou - Zongo / Jonquet',
      'Cotonou - Missébo (Marché Textile)',
      'Cotonou - Guinkomey / Ganhi (Centre Affaires)',
      'Cotonou - Sainte-Rita / Dagbègnon',
      'Cotonou - Vodjè Centre / Vodjè Kpota',
      'Cotonou - Gbégamey / Saint-Jean',
      'Cotonou - Kouhounou / Stade de l\'Amitié',
      'Cotonou - Vèdoko / Toyota',
      'Cotonou - Mènontin / Cité Vie Nouvelle',
      'Cotonou - Agla / Les Pylônes',
      'Cotonou - Fifadji / Houto',
      'Cotonou - Fidjrossè Plage',
      'Cotonou - Fidjrossè Centre / Kpota',
      'Cotonou - Cité Houéyiho',
      'Cotonou - Togbin Plage (Route des Pêches)',
      'Cotonou - Enangnon / Finagnon'
    ]
  },
  {
    department: 'Atlantique (Grand Calavi & Côte)',
    code: 'ATL',
    icon: 'directions_subway',
    zones: [
      'Abomey-Calavi - Centre (UAC / Campus)',
      'Abomey-Calavi - Godomey Togbin',
      'Abomey-Calavi - Godomey Salamey',
      'Abomey-Calavi - Godomey Womey',
      'Abomey-Calavi - Godomey Dénou',
      'Abomey-Calavi - Tankpè / Carrefour Séminaire',
      'Abomey-Calavi - Akassato Centre',
      'Abomey-Calavi - Arconville / Zopah',
      'Abomey-Calavi - Togba / Ouèdo Centre',
      'Abomey-Calavi - Ouèdo (Cité Logements Sociaux)',
      'Abomey-Calavi - Hêvié / Cococodji',
      'Abomey-Calavi - Zinvié',
      'Abomey-Calavi - Glo-Djigbé (GDIZ Zone Industrielle)',
      'Ouidah - Centre Historique',
      'Ouidah - Pahou / Djavikomey',
      'Ouidah - Djègbadji / Porte du Non-Retour',
      'Allada - Centre Ville',
      'Allada - Attogon',
      'Allada - Avakpa / Hinvi',
      'Tori-Bossito - Centre / Tori-Gare',
      'Kpomassè - Centre / Dékanmè',
      'Sô-Ava - Ganvié 1 & 2 (Cité Lacustre)',
      'Sô-Ava - Vekky',
      'Toffo - Centre / Houègbo',
      'Zè - Centre / Sedjè-Dénou'
    ]
  },
  {
    department: 'Ouémé (Porto-Novo & Sèmè-Kpodji)',
    code: 'OUE',
    icon: 'apartment',
    zones: [
      'Porto-Novo - Ouando (Grand Marché)',
      'Porto-Novo - Djassin / Oganla',
      'Porto-Novo - Attakè / Kandévié',
      'Porto-Novo - Tokpota 1 & 2',
      'Porto-Novo - Dowa / Djègan-Kpèvi',
      'Porto-Novo - Louho / Anavié',
      'Porto-Novo - Houinmè / Guévié',
      'Sèmè-Kpodji - Ekpè PK10',
      'Sèmè-Kpodji - Djeffa PK14',
      'Sèmè-Kpodji - Agblangandan',
      'Sèmè-Kpodji - Kraké Plage (Frontière Nigéria)',
      'Sèmè-Kpodji - Sèmè Centre',
      'Adjarra - Centre / Honvié',
      'Akpro-Missérété - Centre / Katagon',
      'Avrankou - Centre / Kouti',
      'Adjohoun - Centre / Azowlissè',
      'Dangbo - Centre / Gbéko',
      'Bonou - Centre / Affamè',
      'Aguégués - Houédomè / Avagbodji'
    ]
  },
  {
    department: 'Zou (Bohicon & Abomey)',
    code: 'ZOU',
    icon: 'fort',
    zones: [
      'Bohicon - Centre Commercial',
      'Bohicon - Carrefour Dako',
      'Bohicon - Passagon / Saclo',
      'Bohicon - Avogbana / Sodohomè',
      'Abomey - Centre Historique (Palais Royaux)',
      'Abomey - Place Goho',
      'Abomey - Djègbé / Hounli',
      'Abomey - Vidolè / Ahouaga',
      'Za-Kpota - Centre / Allahé',
      'Zogbodomey - Cana / Koussoukpa',
      'Djidja - Centre / Monsourou',
      'Covè - Centre / Houen-Hounso',
      'Agbangnizoun - Centre / Lissazounmè',
      'Zagnanado - Centre / Agonli',
      'Ouinhi - Centre / Dasso'
    ]
  },
  {
    department: 'Borgou (Parakou Métropole du Nord)',
    code: 'BOR',
    icon: 'hub',
    zones: [
      'Parakou - Titirou / Université UP',
      'Parakou - Banikanni / Kpébié',
      'Parakou - Guéma (Grand Marché)',
      'Parakou - Albarika / Ladji Farani',
      'Parakou - Tourou (Zone Aéroport)',
      'Parakou - Zongo / Dépôt SONACOP',
      'Parakou - Korobororou',
      'Bembèrèkè - Centre / Gamia',
      'Tchaourou - Centre',
      'Tchaourou - Bétérou / Tchatchou',
      'N\'Dali - Centre / Bori / Sirarou',
      'Nikki - Centre Historique (Palais Royal)',
      'Kalalé - Centre / Basso',
      'Pèrèrè - Centre / Gninsy',
      'Sinendé - Centre / Fô-Bouré'
    ]
  },
  {
    department: 'Mono (Grand-Popo & Lokossa)',
    code: 'MON',
    icon: 'water',
    zones: [
      'Lokossa - Centre Ville',
      'Lokossa - Agamé / Houin',
      'Grand-Popo - Centre Ville & Hôtels Plage',
      'Grand-Popo - Agoué (Frontière Togo / Sanvee-Condji)',
      'Grand-Popo - Avlo / Bouche du Roy',
      'Comè - Centre Ville / Grand Marché',
      'Comè - Agatogbo / Akodéha',
      'Bopa - Possotomè (Zone Thermale)',
      'Athiémé - Centre / Adohoun',
      'Houéyogbé - Dahé / Doutou'
    ]
  },
  {
    department: 'Couffo (Azovè & Aplahoué)',
    code: 'COU',
    icon: 'storefront',
    zones: [
      'Aplahoué - Azovè (Grand Pôle Commercial)',
      'Aplahoué - Centre Ville',
      'Djakotomey - Centre / Adjintimey',
      'Dogbo - Tota / Madjrè',
      'Klouékanmè - Centre / Ahogboya',
      'Lalo - Centre / Hlassamè',
      'Toviklin - Centre / Adjido'
    ]
  },
  {
    department: 'Collines (Dassa & Savalou)',
    code: 'COL',
    icon: 'landscape',
    zones: [
      'Dassa-Zoumè - Centre (Cité des 41 Collines)',
      'Dassa-Zoumè - Paouingnan',
      'Savalou - Centre Historique',
      'Savalou - Kpataba / Monkpa',
      'Savè - Centre Ville (Mamelles de Savè)',
      'Glazoué - Centre / Marché de Maïs',
      'Bantè - Centre / Akpassi',
      'Ouèssè - Centre / Kilibo'
    ]
  },
  {
    department: 'Plateau (Pobè, Kétou & Sakété)',
    code: 'PLA',
    icon: 'crop_free',
    zones: [
      'Pobè - Centre Ville',
      'Sakété - Centre / Ita-Djèbou',
      'Kétou - Centre Historique',
      'Ifangni - Centre / Igolo (Frontière Nigéria)',
      'Adja-Ouèrè - Ikpinlè'
    ]
  },
  {
    department: 'Alibori (Kandi & Malanville)',
    code: 'ALI',
    icon: 'local_shipping',
    zones: [
      'Kandi - Centre Ville 1, 2, 3',
      'Malanville - Grand Marché Frontalier Niger',
      'Malanville - Guéné / Madécali',
      'Banikoara - Centre (Capitale de l\'Or Blanc)',
      'Banikoara - Founougo / Gomparou',
      'Gogounou - Centre / Bagou',
      'Karimama - Centre / Parc W',
      'Ségbana - Centre'
    ]
  },
  {
    department: 'Atacora (Natitingou & Pendjari)',
    code: 'ATA',
    icon: 'terrain',
    zones: [
      'Natitingou - Centre Ville 1, 2, 3, 4',
      'Natitingou - Kotapounga / Perma',
      'Tanguiéta - Porte du Parc Pendjari',
      'Kouandé - Centre / Birni',
      'Kérou - Centre',
      'Cobly - Centre',
      'Boukoumbé - Koussoucoingou (Pays Somba)',
      'Matéri - Centre',
      'Toucountouna - Centre'
    ]
  },
  {
    department: 'Donga (Djougou & Bassila)',
    code: 'DON',
    icon: 'alt_route',
    zones: [
      'Djougou - Centre Ville & Grands Carrefours',
      'Djougou - Taïfa / Kolokondé',
      'Djougou - Bariénou / Bougou',
      'Bassila - Centre / Manigri / Alédjo',
      'Copargo - Centre / Anandana',
      'Ouaké - Centre / Séméré'
    ]
  }
];

// Liste plate complète de toutes les zones pour la recherche rapide
export const ALL_BENIN_ZONES_FLAT: string[] = ALL_BENIN_DEPARTMENTS_ZONES.flatMap(
  (group) => group.zones
);

// Raccourcis des pôles urbains les plus demandés pour un paramétrage rapide
export const POPULAR_ZONES_PRESETS = {
  cotonou_intra_muros: [
    'Cotonou - Haie Vive',
    'Cotonou - Cadjehoun',
    'Cotonou - Akpakpa Centre',
    'Cotonou - Fidjrossè Centre / Kpota',
    'Cotonou - Kouhounou / Stade de l\'Amitié',
    'Cotonou - Dantokpa (Grand Marché)',
    'Cotonou - Gbégamey / Saint-Jean',
    'Cotonou - Sainte-Rita / Dagbègnon'
  ],
  grand_cotonou_calavi: [
    'Cotonou - Haie Vive',
    'Cotonou - Cadjehoun',
    'Cotonou - Akpakpa Centre',
    'Cotonou - Fidjrossè Centre / Kpota',
    'Cotonou - Dantokpa (Grand Marché)',
    'Abomey-Calavi - Centre (UAC / Campus)',
    'Abomey-Calavi - Godomey Togbin',
    'Abomey-Calavi - Tankpè / Carrefour Séminaire',
    'Abomey-Calavi - Arconville / Zopah',
    'Sèmè-Kpodji - Ekpè PK10'
  ],
  axe_cotonou_portonovo: [
    'Cotonou - Akpakpa Centre',
    'Sèmè-Kpodji - Ekpè PK10',
    'Sèmè-Kpodji - Djeffa PK14',
    'Sèmè-Kpodji - Agblangandan',
    'Porto-Novo - Ouando (Grand Marché)',
    'Porto-Novo - Djassin / Oganla',
    'Porto-Novo - Tokpota 1 & 2'
  ],
  axe_cotonou_ouidah: [
    'Cotonou - Fidjrossè Plage',
    'Cotonou - Togbin Plage (Route des Pêches)',
    'Abomey-Calavi - Godomey Togbin',
    'Ouidah - Pahou / Djavikomey',
    'Ouidah - Centre Historique'
  ],
  poles_nord_parakou: [
    'Parakou - Titirou / Université UP',
    'Parakou - Guéma (Grand Marché)',
    'Parakou - Banikanni / Kpébié',
    'Parakou - Albarika / Ladji Farani'
  ]
};
