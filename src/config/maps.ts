// Source: Google Maps Platform Code Assist
// Google Maps Platform integration for LivraLink Bénin (77 Communes réparties sur 12 Départements)

export const GOOGLE_MAPS_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_GOOGLE_MAPS_API_KEY) ||
  'AIzaSyBLh57o8sYGPEtQn7H4DMRAihFykyXbFgM';

export const RATE_PER_KM_FCFA = 100; // 100 FCFA par kilomètre

export interface LocationPoint {
  lat: number;
  lng: number;
  name: string;
  department?: string;
  address?: string;
  commune?: string;
}

export interface BeninDepartment {
  name: string;
  code: string;
  communes: string[];
}

// Les 77 communes officielles du Bénin regroupées par les 12 départements
export const BENIN_DEPARTMENTS: BeninDepartment[] = [
  {
    name: 'Littoral (Grand Cotonou)',
    code: 'LIT',
    communes: [
      'Cotonou - Haie Vive',
      'Cotonou - Cadjehoun',
      'Cotonou - Akpakpa',
      'Cotonou - Fidjrossè',
      'Cotonou - Gbégamey',
      'Cotonou - Kouhounou / Stade',
      'Cotonou - Menontin / Agla',
      'Cotonou - Sainte-Rita',
      'Cotonou - Zongo / Dantokpa',
      'Cotonou (Centre-Ville)'
    ]
  },
  {
    name: 'Atlantique (8 communes)',
    code: 'ATL',
    communes: [
      'Abomey-Calavi - Centre',
      'Abomey-Calavi - Godomey',
      'Abomey-Calavi - Tankpè',
      'Abomey-Calavi - Akassato',
      'Abomey-Calavi - Arconville',
      'Allada',
      'Kpomassè',
      'Ouidah',
      'Sô-Ava',
      'Toffo',
      'Tori-Bossito',
      'Zè'
    ]
  },
  {
    name: 'Ouémé (9 communes)',
    code: 'OUE',
    communes: [
      'Porto-Novo (Capitale)',
      'Adjarra',
      'Adjohoun',
      'Aguégués',
      'Akpro-Missérété',
      'Avrankou',
      'Bonou',
      'Dangbo',
      'Sèmè-Kpodji / Kraké'
    ]
  },
  {
    name: 'Plateau (5 communes)',
    code: 'PLA',
    communes: [
      'Pobè',
      'Adja-Ouèrè',
      'Ifangni',
      'Kétou',
      'Sakété'
    ]
  },
  {
    name: 'Mono (6 communes)',
    code: 'MON',
    communes: [
      'Lokossa',
      'Athiémé',
      'Bopa',
      'Comè',
      'Grand-Popo',
      'Houéyogbé'
    ]
  },
  {
    name: 'Couffo (6 communes)',
    code: 'COU',
    communes: [
      'Aplahoué',
      'Djakotomey',
      'Dogbo',
      'Klouékanmè',
      'Lalo',
      'Toviklin'
    ]
  },
  {
    name: 'Zou (9 communes)',
    code: 'ZOU',
    communes: [
      'Abomey',
      'Bohicon',
      'Agbangnizoun',
      'Covè',
      'Djidja',
      'Ouinhi',
      'Za-Kpota',
      'Zagnanado',
      'Zogbodomey'
    ]
  },
  {
    name: 'Collines (6 communes)',
    code: 'COL',
    communes: [
      'Dassa-Zoumè',
      'Bantè',
      'Glazoué',
      'Ouèssè',
      'Savalou',
      'Savè'
    ]
  },
  {
    name: 'Borgou (8 communes)',
    code: 'BOR',
    communes: [
      'Parakou',
      'Bembèrèkè',
      'Kalalé',
      'N\'Dali',
      'Nikki',
      'Pèrèrè',
      'Sinendé',
      'Tchaourou'
    ]
  },
  {
    name: 'Donga (4 communes)',
    code: 'DON',
    communes: [
      'Djougou',
      'Bassila',
      'Copargo',
      'Ouaké'
    ]
  },
  {
    name: 'Atacora (9 communes)',
    code: 'ATA',
    communes: [
      'Natitingou',
      'Boukoumbé',
      'Cobly',
      'Kérou',
      'Kouandé',
      'Matéri',
      'Péhunco',
      'Tanguiéta',
      'Toucountouna'
    ]
  },
  {
    name: 'Alibori (6 communes)',
    code: 'ALI',
    communes: [
      'Kandi',
      'Banikoara',
      'Gogounou',
      'Karimama',
      'Malanville',
      'Ségbana'
    ]
  }
];

// Liste aplatie de toutes les communes et quartiers principaux
export const ALL_BENIN_COMMUNES: string[] = BENIN_DEPARTMENTS.flatMap((d) => d.communes);

// Coordonnées GPS des communes et quartiers du Bénin
export const BENIN_COMMUNES_COORDS: Record<string, LocationPoint> = {
  // --- LITTORAL (COTONOU) ---
  'Cotonou - Haie Vive': {
    lat: 6.3571,
    lng: 2.4175,
    name: 'Haie Vive',
    department: 'Littoral',
    address: 'Avenue Jean-Paul II, Cotonou',
    commune: 'Cotonou - Haie Vive'
  },
  'Cotonou - Cadjehoun': {
    lat: 6.3638,
    lng: 2.4082,
    name: 'Cadjehoun',
    department: 'Littoral',
    address: 'Avenue Steinmetz, Cadjehoun, Cotonou',
    commune: 'Cotonou - Cadjehoun'
  },
  'Cotonou - Akpakpa': {
    lat: 6.3762,
    lng: 2.4563,
    name: 'Akpakpa',
    department: 'Littoral',
    address: 'Boulevard de la Marina, Akpakpa, Cotonou',
    commune: 'Cotonou - Akpakpa'
  },
  'Cotonou - Fidjrossè': {
    lat: 6.3592,
    lng: 2.3789,
    name: 'Fidjrossè',
    department: 'Littoral',
    address: 'Route des Pêches / Calvaire, Fidjrossè, Cotonou',
    commune: 'Cotonou - Fidjrossè'
  },
  'Cotonou - Gbégamey': {
    lat: 6.3734,
    lng: 2.4128,
    name: 'Gbégamey',
    department: 'Littoral',
    address: 'Carrefour Étoile Rouge / Bourse du Travail, Cotonou',
    commune: 'Cotonou - Gbégamey'
  },
  'Cotonou - Kouhounou / Stade': {
    lat: 6.3860,
    lng: 2.3855,
    name: 'Kouhounou',
    department: 'Littoral',
    address: 'Stade Général Mathieu Kérékou, Cotonou',
    commune: 'Cotonou - Kouhounou / Stade'
  },
  'Cotonou - Menontin / Agla': {
    lat: 6.3888,
    lng: 2.3705,
    name: 'Menontin / Agla',
    department: 'Littoral',
    address: 'Hôpital de Menontin / Allée Agla, Cotonou',
    commune: 'Cotonou - Menontin / Agla'
  },
  'Cotonou - Sainte-Rita': {
    lat: 6.3792,
    lng: 2.3995,
    name: 'Sainte-Rita',
    department: 'Littoral',
    address: 'Église Sainte-Rita / Carrefour Wologuèdè, Cotonou',
    commune: 'Cotonou - Sainte-Rita'
  },
  'Cotonou - Zongo / Dantokpa': {
    lat: 6.3784,
    lng: 2.4346,
    name: 'Dantokpa Grand Marché',
    department: 'Littoral',
    address: 'Avenue Clozel, Cotonou',
    commune: 'Cotonou - Zongo / Dantokpa'
  },
  'Cotonou (Centre-Ville)': {
    lat: 6.3654,
    lng: 2.4183,
    name: 'Cotonou Centre-Ville',
    department: 'Littoral',
    address: 'Place de l\'Étoile Rouge, Cotonou',
    commune: 'Cotonou (Centre-Ville)'
  },
  'Cotonou': {
    lat: 6.3654,
    lng: 2.4183,
    name: 'Cotonou',
    department: 'Littoral',
    address: 'Cotonou, Bénin',
    commune: 'Cotonou'
  },

  // --- ATLANTIQUE ---
  'Abomey-Calavi - Centre': {
    lat: 6.4485,
    lng: 2.3556,
    name: 'Abomey-Calavi Centre',
    department: 'Atlantique',
    address: 'Carrefour Kpota / Mairie, Abomey-Calavi',
    commune: 'Abomey-Calavi - Centre'
  },
  'Abomey-Calavi - Godomey': {
    lat: 6.4011,
    lng: 2.3421,
    name: 'Godomey',
    department: 'Atlantique',
    address: 'Échangeur de Godomey, Abomey-Calavi',
    commune: 'Abomey-Calavi - Godomey'
  },
  'Abomey-Calavi - Tankpè': {
    lat: 6.4590,
    lng: 2.3410,
    name: 'Tankpè',
    department: 'Atlantique',
    address: 'Carrefour Tankpè, Abomey-Calavi',
    commune: 'Abomey-Calavi - Tankpè'
  },
  'Abomey-Calavi - Akassato': {
    lat: 6.5120,
    lng: 2.3480,
    name: 'Akassato',
    department: 'Atlantique',
    address: 'Carrefour Akassato, RNIE 2, Abomey-Calavi',
    commune: 'Abomey-Calavi - Akassato'
  },
  'Abomey-Calavi - Arconville': {
    lat: 6.4421,
    lng: 2.3610,
    name: 'Arconville',
    department: 'Atlantique',
    address: 'Quartier Arconville, Abomey-Calavi',
    commune: 'Abomey-Calavi - Arconville'
  },
  'Abomey-Calavi': {
    lat: 6.4485,
    lng: 2.3556,
    name: 'Abomey-Calavi',
    department: 'Atlantique',
    address: 'Abomey-Calavi, Bénin',
    commune: 'Abomey-Calavi'
  },
  'Allada': {
    lat: 6.6654,
    lng: 2.1513,
    name: 'Allada',
    department: 'Atlantique',
    address: 'Centre-ville Allada, RNIE 2',
    commune: 'Allada'
  },
  'Kpomassè': {
    lat: 6.4883,
    lng: 2.0167,
    name: 'Kpomassè',
    department: 'Atlantique',
    address: 'Kpomassè Centre, Bénin',
    commune: 'Kpomassè'
  },
  'Ouidah': {
    lat: 6.3630,
    lng: 2.0850,
    name: 'Ouidah Centre',
    department: 'Atlantique',
    address: 'Place du Fort Français / Route des Esclaves, Ouidah',
    commune: 'Ouidah'
  },
  'Sô-Ava': {
    lat: 6.4583,
    lng: 2.4167,
    name: 'Sô-Ava',
    department: 'Atlantique',
    address: 'Cité lacustre Sô-Ava, Lac Nokoué',
    commune: 'Sô-Ava'
  },
  'Toffo': {
    lat: 6.8447,
    lng: 2.0827,
    name: 'Toffo',
    department: 'Atlantique',
    address: 'Toffo Centre, RNIE 2',
    commune: 'Toffo'
  },
  'Tori-Bossito': {
    lat: 6.5000,
    lng: 2.1333,
    name: 'Tori-Bossito',
    department: 'Atlantique',
    address: 'Tori-Bossito Centre, Bénin',
    commune: 'Tori-Bossito'
  },
  'Zè': {
    lat: 6.5833,
    lng: 2.3167,
    name: 'Zè',
    department: 'Atlantique',
    address: 'Zè Centre, RNIE 2',
    commune: 'Zè'
  },

  // --- OUÉMÉ ---
  'Porto-Novo (Capitale)': {
    lat: 6.4969,
    lng: 2.6289,
    name: 'Porto-Novo',
    department: 'Ouémé',
    address: 'Marché Ouando / Boulevard Lagunaire, Porto-Novo',
    commune: 'Porto-Novo (Capitale)'
  },
  'Porto-Novo': {
    lat: 6.4969,
    lng: 2.6289,
    name: 'Porto-Novo',
    department: 'Ouémé',
    address: 'Porto-Novo, Bénin',
    commune: 'Porto-Novo'
  },
  'Adjarra': {
    lat: 6.5333,
    lng: 2.6667,
    name: 'Adjarra',
    department: 'Ouémé',
    address: 'Adjarra Centre, Cité des Tambours',
    commune: 'Adjarra'
  },
  'Adjohoun': {
    lat: 6.7000,
    lng: 2.5000,
    name: 'Adjohoun',
    department: 'Ouémé',
    address: 'Vallée de l\'Ouémé, Adjohoun',
    commune: 'Adjohoun'
  },
  'Aguégués': {
    lat: 6.5000,
    lng: 2.5333,
    name: 'Aguégués',
    department: 'Ouémé',
    address: 'Aguégués, Commune lacustre',
    commune: 'Aguégués'
  },
  'Akpro-Missérété': {
    lat: 6.5500,
    lng: 2.5833,
    name: 'Akpro-Missérété',
    department: 'Ouémé',
    address: 'Carrefour Missérété, RNIE 1',
    commune: 'Akpro-Missérété'
  },
  'Avrankou': {
    lat: 6.5500,
    lng: 2.6500,
    name: 'Avrankou',
    department: 'Ouémé',
    address: 'Avrankou Centre',
    commune: 'Avrankou'
  },
  'Bonou': {
    lat: 6.9000,
    lng: 2.4500,
    name: 'Bonou',
    department: 'Ouémé',
    address: 'Bonou, Vallée de l\'Ouémé',
    commune: 'Bonou'
  },
  'Dangbo': {
    lat: 6.5833,
    lng: 2.5500,
    name: 'Dangbo',
    department: 'Ouémé',
    address: 'Dangbo Centre',
    commune: 'Dangbo'
  },
  'Sèmè-Kpodji / Kraké': {
    lat: 6.3820,
    lng: 2.6100,
    name: 'Sèmè-Kpodji / Kraké',
    department: 'Ouémé',
    address: 'Carrefour Kraké / RNIE 1, Sèmè-Kpodji',
    commune: 'Sèmè-Kpodji / Kraké'
  },
  'Sèmè-Kpodji': {
    lat: 6.3820,
    lng: 2.6100,
    name: 'Sèmè-Kpodji',
    department: 'Ouémé',
    address: 'Sèmè-Kpodji, Bénin',
    commune: 'Sèmè-Kpodji'
  },

  // --- PLATEAU ---
  'Pobè': {
    lat: 6.9800,
    lng: 2.6650,
    name: 'Pobè',
    department: 'Plateau',
    address: 'Pobè Centre-Ville',
    commune: 'Pobè'
  },
  'Adja-Ouèrè': {
    lat: 7.0000,
    lng: 2.6167,
    name: 'Adja-Ouèrè',
    department: 'Plateau',
    address: 'Adja-Ouèrè Centre',
    commune: 'Adja-Ouèrè'
  },
  'Ifangni': {
    lat: 6.6667,
    lng: 2.7000,
    name: 'Ifangni',
    department: 'Plateau',
    address: 'Ifangni Centre / Frontière Nigeria',
    commune: 'Ifangni'
  },
  'Kétou': {
    lat: 7.3633,
    lng: 2.5997,
    name: 'Kétou',
    department: 'Plateau',
    address: 'Kétou Centre Historique',
    commune: 'Kétou'
  },
  'Sakété': {
    lat: 6.7364,
    lng: 2.6586,
    name: 'Sakété',
    department: 'Plateau',
    address: 'Sakété Centre-Ville',
    commune: 'Sakété'
  },

  // --- MONO ---
  'Lokossa': {
    lat: 6.6386,
    lng: 1.7167,
    name: 'Lokossa',
    department: 'Mono',
    address: 'Lokossa Centre-Ville',
    commune: 'Lokossa'
  },
  'Athiémé': {
    lat: 6.5833,
    lng: 1.6667,
    name: 'Athiémé',
    department: 'Mono',
    address: 'Athiémé Centre',
    commune: 'Athiémé'
  },
  'Bopa': {
    lat: 6.6167,
    lng: 1.9500,
    name: 'Bopa',
    department: 'Mono',
    address: 'Bopa, Lac Ahémé',
    commune: 'Bopa'
  },
  'Comè': {
    lat: 6.4000,
    lng: 1.8833,
    name: 'Comè',
    department: 'Mono',
    address: 'Carrefour Comè, RNIE 1',
    commune: 'Comè'
  },
  'Grand-Popo': {
    lat: 6.2833,
    lng: 1.8222,
    name: 'Grand-Popo',
    department: 'Mono',
    address: 'Grand-Popo Plage / Bouche du Roy',
    commune: 'Grand-Popo'
  },
  'Houéyogbé': {
    lat: 6.4500,
    lng: 1.9333,
    name: 'Houéyogbé',
    department: 'Mono',
    address: 'Houéyogbé Centre',
    commune: 'Houéyogbé'
  },

  // --- COUFFO ---
  'Aplahoué': {
    lat: 6.9333,
    lng: 1.6833,
    name: 'Aplahoué',
    department: 'Couffo',
    address: 'Aplahoué Centre-Ville',
    commune: 'Aplahoué'
  },
  'Djakotomey': {
    lat: 6.9000,
    lng: 1.7167,
    name: 'Djakotomey',
    department: 'Couffo',
    address: 'Djakotomey Centre',
    commune: 'Djakotomey'
  },
  'Dogbo': {
    lat: 6.8000,
    lng: 1.7833,
    name: 'Dogbo',
    department: 'Couffo',
    address: 'Dogbo-Tota Centre',
    commune: 'Dogbo'
  },
  'Klouékanmè': {
    lat: 6.9833,
    lng: 1.8500,
    name: 'Klouékanmè',
    department: 'Couffo',
    address: 'Klouékanmè Centre',
    commune: 'Klouékanmè'
  },
  'Lalo': {
    lat: 6.9167,
    lng: 1.9000,
    name: 'Lalo',
    department: 'Couffo',
    address: 'Lalo Centre',
    commune: 'Lalo'
  },
  'Toviklin': {
    lat: 6.9667,
    lng: 1.7833,
    name: 'Toviklin',
    department: 'Couffo',
    address: 'Toviklin Centre',
    commune: 'Toviklin'
  },

  // --- ZOU ---
  'Abomey': {
    lat: 7.1828,
    lng: 1.9911,
    name: 'Abomey (Cité Historique)',
    department: 'Zou',
    address: 'Palais Royaux d\'Abomey',
    commune: 'Abomey'
  },
  'Bohicon': {
    lat: 7.1783,
    lng: 2.0667,
    name: 'Bohicon (Carrefour Économique)',
    department: 'Zou',
    address: 'Carrefour Zakpo / Gare, Bohicon',
    commune: 'Bohicon'
  },
  'Agbangnizoun': {
    lat: 7.1167,
    lng: 1.9667,
    name: 'Agbangnizoun',
    department: 'Zou',
    address: 'Agbangnizoun Centre',
    commune: 'Agbangnizoun'
  },
  'Covè': {
    lat: 7.2167,
    lng: 2.3333,
    name: 'Covè',
    department: 'Zou',
    address: 'Covè Centre',
    commune: 'Covè'
  },
  'Djidja': {
    lat: 7.3500,
    lng: 1.9333,
    name: 'Djidja',
    department: 'Zou',
    address: 'Djidja Centre',
    commune: 'Djidja'
  },
  'Ouinhi': {
    lat: 7.0167,
    lng: 2.4500,
    name: 'Ouinhi',
    department: 'Zou',
    address: 'Ouinhi Centre',
    commune: 'Ouinhi'
  },
  'Za-Kpota': {
    lat: 7.2500,
    lng: 2.1833,
    name: 'Za-Kpota',
    department: 'Zou',
    address: 'Za-Kpota Centre',
    commune: 'Za-Kpota'
  },
  'Zagnanado': {
    lat: 7.2667,
    lng: 2.3500,
    name: 'Zagnanado',
    department: 'Zou',
    address: 'Zagnanado Centre',
    commune: 'Zagnanado'
  },
  'Zogbodomey': {
    lat: 7.0833,
    lng: 2.1000,
    name: 'Zogbodomey',
    department: 'Zou',
    address: 'Zogbodomey Centre, RNIE 2',
    commune: 'Zogbodomey'
  },

  // --- COLLINES ---
  'Dassa-Zoumè': {
    lat: 7.7500,
    lng: 2.1833,
    name: 'Dassa-Zoumè (Cité des 41 Collines)',
    department: 'Collines',
    address: 'Grotte Mariale / Carrefour Dassa',
    commune: 'Dassa-Zoumè'
  },
  'Bantè': {
    lat: 8.4167,
    lng: 1.8833,
    name: 'Bantè',
    department: 'Collines',
    address: 'Bantè Centre',
    commune: 'Bantè'
  },
  'Glazoué': {
    lat: 7.9667,
    lng: 2.2333,
    name: 'Glazoué',
    department: 'Collines',
    address: 'Glazoué Centre, RNIE 2',
    commune: 'Glazoué'
  },
  'Ouèssè': {
    lat: 8.4833,
    lng: 2.4333,
    name: 'Ouèssè',
    department: 'Collines',
    address: 'Ouèssè Centre',
    commune: 'Ouèssè'
  },
  'Savalou': {
    lat: 7.9333,
    lng: 1.9667,
    name: 'Savalou',
    department: 'Collines',
    address: 'Savalou Centre, Cité de l\'Igname',
    commune: 'Savalou'
  },
  'Savè': {
    lat: 8.0333,
    lng: 2.4833,
    name: 'Savè (Mamelles de Savè)',
    department: 'Collines',
    address: 'Savè Centre-Ville',
    commune: 'Savè'
  },

  // --- BORGOU ---
  'Parakou': {
    lat: 9.3372,
    lng: 2.6303,
    name: 'Parakou (Métropole du Nord)',
    department: 'Borgou',
    address: 'Place Hubert Maga / Centre-Ville, Parakou',
    commune: 'Parakou'
  },
  'Bembèrèkè': {
    lat: 10.2283,
    lng: 2.6633,
    name: 'Bembèrèkè',
    department: 'Borgou',
    address: 'Bembèrèkè Centre, RNIE 2',
    commune: 'Bembèrèkè'
  },
  'Kalalé': {
    lat: 10.2833,
    lng: 3.3667,
    name: 'Kalalé',
    department: 'Borgou',
    address: 'Kalalé Centre',
    commune: 'Kalalé'
  },
  'N\'Dali': {
    lat: 9.8667,
    lng: 2.7167,
    name: 'N\'Dali',
    department: 'Borgou',
    address: 'N\'Dali Centre, RNIE 2',
    commune: 'N\'Dali'
  },
  'Nikki': {
    lat: 9.9400,
    lng: 3.2100,
    name: 'Nikki (Cité de la Gaani)',
    department: 'Borgou',
    address: 'Cour Royale de Nikki',
    commune: 'Nikki'
  },
  'Pèrèrè': {
    lat: 9.6000,
    lng: 3.0167,
    name: 'Pèrèrè',
    department: 'Borgou',
    address: 'Pèrèrè Centre',
    commune: 'Pèrèrè'
  },
  'Sinendé': {
    lat: 10.3333,
    lng: 2.3833,
    name: 'Sinendé',
    department: 'Borgou',
    address: 'Sinendé Centre',
    commune: 'Sinendé'
  },
  'Tchaourou': {
    lat: 8.8833,
    lng: 2.6000,
    name: 'Tchaourou',
    department: 'Borgou',
    address: 'Tchaourou Centre, RNIE 2',
    commune: 'Tchaourou'
  },

  // --- DONGA ---
  'Djougou': {
    lat: 9.7083,
    lng: 1.6667,
    name: 'Djougou (Carrefour Commercial)',
    department: 'Donga',
    address: 'Grand Marché de Djougou',
    commune: 'Djougou'
  },
  'Bassila': {
    lat: 9.0083,
    lng: 1.6667,
    name: 'Bassila',
    department: 'Donga',
    address: 'Bassila Centre',
    commune: 'Bassila'
  },
  'Copargo': {
    lat: 9.8333,
    lng: 1.5500,
    name: 'Copargo',
    department: 'Donga',
    address: 'Copargo Centre',
    commune: 'Copargo'
  },
  'Ouaké': {
    lat: 9.6833,
    lng: 1.3833,
    name: 'Ouaké',
    department: 'Donga',
    address: 'Ouaké Centre / Frontière Togo',
    commune: 'Ouaké'
  },

  // --- ATACORA ---
  'Natitingou': {
    lat: 10.3042,
    lng: 1.3797,
    name: 'Natitingou (Porte de l\'Atacora)',
    department: 'Atacora',
    address: 'Natitingou Centre-Ville',
    commune: 'Natitingou'
  },
  'Boukoumbé': {
    lat: 10.1833,
    lng: 1.1000,
    name: 'Boukoumbé (Pays Tata Somba)',
    department: 'Atacora',
    address: 'Boukoumbé Centre',
    commune: 'Boukoumbé'
  },
  'Cobly': {
    lat: 10.4500,
    lng: 1.4333,
    name: 'Cobly',
    department: 'Atacora',
    address: 'Cobly Centre',
    commune: 'Cobly'
  },
  'Kérou': {
    lat: 10.8333,
    lng: 2.0667,
    name: 'Kérou',
    department: 'Atacora',
    address: 'Kérou Centre',
    commune: 'Kérou'
  },
  'Kouandé': {
    lat: 10.3333,
    lng: 1.6833,
    name: 'Kouandé',
    department: 'Atacora',
    address: 'Kouandé Centre',
    commune: 'Kouandé'
  },
  'Matéri': {
    lat: 10.6667,
    lng: 1.3000,
    name: 'Matéri',
    department: 'Atacora',
    address: 'Matéri Centre',
    commune: 'Matéri'
  },
  'Péhunco': {
    lat: 10.2333,
    lng: 2.0000,
    name: 'Péhunco',
    department: 'Atacora',
    address: 'Péhunco Centre',
    commune: 'Péhunco'
  },
  'Tanguiéta': {
    lat: 10.6167,
    lng: 1.2667,
    name: 'Tanguiéta (Parc de la Pendjari)',
    department: 'Atacora',
    address: 'Tanguiéta Centre',
    commune: 'Tanguiéta'
  },
  'Toucountouna': {
    lat: 10.4667,
    lng: 1.3500,
    name: 'Toucountouna',
    department: 'Atacora',
    address: 'Toucountouna Centre',
    commune: 'Toucountouna'
  },

  // --- ALIBORI ---
  'Kandi': {
    lat: 11.1342,
    lng: 2.9386,
    name: 'Kandi (Chef-Lieu Alibori)',
    department: 'Alibori',
    address: 'Kandi Centre, RNIE 2',
    commune: 'Kandi'
  },
  'Banikoara': {
    lat: 11.2975,
    lng: 2.4386,
    name: 'Banikoara (Capitale de l\'Or Blanc)',
    department: 'Alibori',
    address: 'Banikoara Centre',
    commune: 'Banikoara'
  },
  'Gogounou': {
    lat: 10.8333,
    lng: 2.8333,
    name: 'Gogounou',
    department: 'Alibori',
    address: 'Gogounou Centre, RNIE 2',
    commune: 'Gogounou'
  },
  'Karimama': {
    lat: 12.0667,
    lng: 3.1833,
    name: 'Karimama (Bord du Fleuve Niger)',
    department: 'Alibori',
    address: 'Karimama Centre',
    commune: 'Karimama'
  },
  'Malanville': {
    lat: 11.8667,
    lng: 3.3833,
    name: 'Malanville (Grand Port Sec)',
    department: 'Alibori',
    address: 'Pont sur le Niger / Marché Frontalier',
    commune: 'Malanville'
  },
  'Ségbana': {
    lat: 10.9333,
    lng: 3.7000,
    name: 'Ségbana',
    department: 'Alibori',
    address: 'Ségbana Centre / Frontière Nigeria',
    commune: 'Ségbana'
  }
};

/**
 * Calcul précis de la distance routière en kilomètres entre deux points GPS.
 * Applique le facteur de sinuosité routière (1.25x) propre aux axes béninois.
 */
export function calculateDistanceKm(
  p1: { lat: number; lng: number },
  p2: { lat: number; lng: number }
): number {
  if (!p1 || !p2) return 3.0;
  if (p1.lat === p2.lat && p1.lng === p2.lng) return 1.0;

  const R = 6371; // Rayon moyen de la terre en km
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const directDistance = R * c;

  // Facteur de parcours routier moyen (routes réelles vs vol d'oiseau)
  const roadFactor = 1.25;
  const roadDistance = directDistance * roadFactor;

  // Retourne au moins 1.0 km arrondi à un chiffre après la virgule
  return Math.max(1.0, Math.round(roadDistance * 10) / 10);
}

/**
 * Calcule le tarif de livraison selon le barème :
 * 100 FCFA par kilomètre (arrondi au 50 FCFA le plus proche, minimum 100 FCFA).
 */
export function calculateDeliveryPrice(distanceKm: number): number {
  const rawPrice = distanceKm * RATE_PER_KM_FCFA;
  // Arrondi à la tranche de 50 FCFA supérieure, minimum 100 FCFA
  const roundedPrice = Math.max(100, Math.ceil(rawPrice / 50) * 50);
  return roundedPrice;
}

/**
 * Recherche ou extrait les coordonnées d'une commune béninoise parmi les 77 communes
 */
export function getLocationForCommune(communeName: string): LocationPoint {
  if (!communeName) {
    return BENIN_COMMUNES_COORDS['Cotonou - Haie Vive'];
  }

  // Correspondance exacte
  if (BENIN_COMMUNES_COORDS[communeName]) {
    return BENIN_COMMUNES_COORDS[communeName];
  }

  const cleanName = communeName.toLowerCase().trim();

  // Recherche directe ou sur sous-parties (ex: "Kandi", "Parakou", "Fidjrossè")
  for (const [key, val] of Object.entries(BENIN_COMMUNES_COORDS)) {
    const keyLower = key.toLowerCase();
    const valNameLower = val.name.toLowerCase();
    if (keyLower === cleanName || valNameLower === cleanName) {
      return val;
    }
    if (cleanName.includes(keyLower) || keyLower.includes(cleanName)) {
      return val;
    }
  }

  // Recherche par mot clé principal
  for (const [key, val] of Object.entries(BENIN_COMMUNES_COORDS)) {
    const subParts = key.split(/[-–—/()]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (subParts.some((p) => p.length >= 3 && cleanName.includes(p))) {
      return val;
    }
  }

  // Par défaut: Cotonou Haie Vive
  return BENIN_COMMUNES_COORDS['Cotonou - Haie Vive'];
}

/**
 * Trouve la commune béninoise la plus proche de coordonnées GPS données (lat, lng).
 */
export function findClosestBeninCommune(
  lat: number,
  lng: number
): { communeKey: string; point: LocationPoint; distanceKm: number } {
  let closestKey = 'Cotonou - Haie Vive';
  let closestPoint = BENIN_COMMUNES_COORDS['Cotonou - Haie Vive'];
  let minDistance = Infinity;

  for (const [key, point] of Object.entries(BENIN_COMMUNES_COORDS)) {
    const dist = calculateDistanceKm({ lat, lng }, { lat: point.lat, lng: point.lng });
    if (dist < minDistance) {
      minDistance = dist;
      closestKey = key;
      closestPoint = point;
    }
  }

  return {
    communeKey: closestKey,
    point: closestPoint,
    distanceKm: minDistance
  };
}

export interface DetectedUserLocation {
  lat: number;
  lng: number;
  commune: string;
  address: string;
  gpsCoordinates: string;
  accuracyMeters?: number;
  source: 'browser_gps' | 'benin_default';
  detectedAt: string;
}

/**
 * Détecte automatiquement la position géographique de l'utilisateur (HTML5 Geolocation API).
 * Si autorisé, identifie la commune béninoise la plus proche et retourne les coordonnées formatées.
 * Si non disponible, refusé ou hors-délai, utilise la commune de référence (Cotonou - Haie Vive).
 */
export async function detectUserGeolocation(): Promise<DetectedUserLocation> {
  const defaultLoc: DetectedUserLocation = {
    lat: 6.3571,
    lng: 2.4175,
    commune: 'Cotonou - Haie Vive',
    address: 'Avenue Jean-Paul II, Cotonou, Bénin',
    gpsCoordinates: '6.3571, 2.4175',
    source: 'benin_default',
    detectedAt: new Date().toISOString()
  };

  if (typeof window === 'undefined' || !navigator.geolocation) {
    return defaultLoc;
  }

  return new Promise<DetectedUserLocation>((resolve) => {
    let resolved = false;

    // Timeout de sécurité de 5000ms
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(defaultLoc);
      }
    }, 5000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);

        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lng = Math.round(pos.coords.longitude * 10000) / 10000;
        const accuracy = Math.round(pos.coords.accuracy);

        // Trouve la commune béninoise la plus proche
        const match = findClosestBeninCommune(lat, lng);
        const commune = match.point.commune || match.communeKey;
        const address = match.point.address || `${commune}, Bénin`;

        resolve({
          lat,
          lng,
          commune,
          address,
          gpsCoordinates: `${lat}, ${lng}`,
          accuracyMeters: accuracy,
          source: 'browser_gps',
          detectedAt: new Date().toISOString()
        });
      },
      (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        console.warn('Geolocation detection fallback notice:', err.message);
        resolve(defaultLoc);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 60000
      }
    );
  });
}

