import type { AppView } from '../context/AppContext';

export interface SeoRouteMeta {
  path: string;
  title: string;
  description: string;
  robots: 'index, follow' | 'noindex, nofollow';
  isPublic: boolean;
}

export const VIEW_TO_PATH: Record<AppView, string> = {
  landing: '/',
  login_vendeur: '/connexion-vendeur',
  login_livreur: '/connexion-livreur',
  register: '/inscription',
  vendeur_dashboard: '/espace-vendeur',
  vendeur_new_delivery: '/espace-vendeur/nouvelle-livraison',
  vendeur_tracking: '/espace-vendeur/suivi',
  vendeur_reports: '/espace-vendeur/rapports',
  vendeur_settings: '/espace-vendeur/parametres',
  vendeur_chat: '/espace-vendeur/messagerie',
  livreur_dashboard: '/espace-livreur',
  livreur_missions: '/espace-livreur/missions',
  livreur_wallet: '/espace-livreur/portefeuille',
  livreur_settings: '/espace-livreur/parametres',
  livreur_chat: '/espace-livreur/messagerie',
  admin_console: '/admin',
  not_found: '/404',
};

const PATH_TO_VIEW_MAP: Record<string, AppView> = {
  '/': 'landing',
  '/connexion-vendeur': 'login_vendeur',
  '/connexion-livreur': 'login_livreur',
  '/inscription': 'register',
  '/espace-vendeur': 'vendeur_dashboard',
  '/espace-vendeur/nouvelle-livraison': 'vendeur_new_delivery',
  '/espace-vendeur/suivi': 'vendeur_tracking',
  '/espace-vendeur/rapports': 'vendeur_reports',
  '/espace-vendeur/parametres': 'vendeur_settings',
  '/espace-vendeur/messagerie': 'vendeur_chat',
  '/espace-livreur': 'livreur_dashboard',
  '/espace-livreur/missions': 'livreur_missions',
  '/espace-livreur/portefeuille': 'livreur_wallet',
  '/espace-livreur/parametres': 'livreur_settings',
  '/espace-livreur/messagerie': 'livreur_chat',
  '/admin': 'admin_console',
  '/404': 'not_found',
};

export const normalizePathname = (pathname: string): string => {
  if (!pathname) return '/';
  const cleaned = pathname.split('?')[0].split('#')[0];
  if (cleaned.length > 1 && cleaned.endsWith('/')) {
    return cleaned.slice(0, -1);
  }
  return cleaned || '/';
};

export const resolveAppViewFromPathname = (pathname: string): AppView => {
  const normalized = normalizePathname(pathname);
  return PATH_TO_VIEW_MAP[normalized] ?? 'not_found';
};

export const SEO_METADATA_BY_VIEW: Record<AppView, SeoRouteMeta> = {
  landing: {
    path: '/',
    title: 'LivraLink – Livraison connectée pour vendeurs et livreurs',
    description:
      'Connectez vos ventes WhatsApp, Instagram et TikTok aux coursiers urbains. Suivi en temps réel et preuve de livraison (POD) sécurisée avec LivraLink.',
    robots: 'index, follow',
    isPublic: true,
  },
  login_vendeur: {
    path: '/connexion-vendeur',
    title: 'Connexion Vendeur – LivraLink',
    description: 'Accédez à votre espace vendeur sécurisé LivraLink pour gérer vos expéditions.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  login_livreur: {
    path: '/connexion-livreur',
    title: 'Connexion Livreur – LivraLink',
    description: 'Accédez à votre espace coursier sécurisé LivraLink pour consulter vos missions.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  register: {
    path: '/inscription',
    title: 'Créer un compte – LivraLink',
    description: 'Inscrivez-vous en tant que vendeur ou livreur sur la plateforme LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  vendeur_dashboard: {
    path: '/espace-vendeur',
    title: 'Espace Vendeur – LivraLink',
    description: 'Tableau de bord privé vendeur LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  vendeur_new_delivery: {
    path: '/espace-vendeur/nouvelle-livraison',
    title: 'Nouvelle livraison – Espace Vendeur LivraLink',
    description: 'Création de mission de livraison privée sur LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  vendeur_tracking: {
    path: '/espace-vendeur/suivi',
    title: 'Suivi des livraisons – Espace Vendeur LivraLink',
    description: 'Suivi privé de vos livraisons en cours sur LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  vendeur_reports: {
    path: '/espace-vendeur/rapports',
    title: 'Rapports et statistiques – Espace Vendeur LivraLink',
    description: 'Rapports opérationnels privés vendeur LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  vendeur_settings: {
    path: '/espace-vendeur/parametres',
    title: 'Paramètres vendeur – LivraLink',
    description: 'Paramètres privés du compte vendeur LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  vendeur_chat: {
    path: '/espace-vendeur/messagerie',
    title: 'Messagerie – Espace Vendeur LivraLink',
    description: 'Messagerie privée vendeur LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  livreur_dashboard: {
    path: '/espace-livreur',
    title: 'Espace Livreur – LivraLink',
    description: 'Tableau de bord privé coursier LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  livreur_missions: {
    path: '/espace-livreur/missions',
    title: 'Missions disponibles – Espace Livreur LivraLink',
    description: 'Gestion privée des missions de livraison LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  livreur_wallet: {
    path: '/espace-livreur/portefeuille',
    title: 'Gains et portefeuille – Espace Livreur LivraLink',
    description: 'Suivi privé des revenus coursier LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  livreur_settings: {
    path: '/espace-livreur/parametres',
    title: 'Paramètres livreur – LivraLink',
    description: 'Paramètres privés du compte livreur LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  livreur_chat: {
    path: '/espace-livreur/messagerie',
    title: 'Messagerie – Espace Livreur LivraLink',
    description: 'Messagerie privée livreur LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  admin_console: {
    path: '/admin',
    title: 'Administration – LivraLink',
    description: 'Console d’administration restreinte LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
  not_found: {
    path: '/404',
    title: 'Page introuvable (404) – LivraLink',
    description: 'La page demandée est introuvable sur LivraLink.',
    robots: 'noindex, nofollow',
    isPublic: false,
  },
};

export const getClientCanonicalOrigin = (): string => {
  const configured = (import.meta as any)?.env?.VITE_PUBLIC_SITE_URL as string | undefined;
  if (
    configured &&
    /^https?:\/\/.+/i.test(configured.trim()) &&
    !configured.includes('MY_APP_URL')
  ) {
    return configured.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
};

const upsertMetaTag = (attr: 'name' | 'property', key: string, content: string) => {
  if (typeof document === 'undefined') return;
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

const upsertCanonicalLink = (href: string | null) => {
  if (typeof document === 'undefined') return;
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.setAttribute('href', href);
    return;
  }
  const link = document.createElement('link');
  link.setAttribute('rel', 'canonical');
  link.setAttribute('href', href);
  document.head.appendChild(link);
};

export const buildPublicStructuredData = (origin: string) => {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const homeUrl = cleanOrigin ? `${cleanOrigin}/` : '/';
  const logoUrl = cleanOrigin ? `${cleanOrigin}/icon.svg` : '/icon.svg';
  const imageUrl = cleanOrigin ? `${cleanOrigin}/og-image.jpg` : '/og-image.jpg';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${homeUrl}#organization`,
        name: 'LivraLink',
        url: homeUrl,
        logo: logoUrl,
        description:
          'Plateforme logistique urbaine connectée reliant les vendeurs du commerce social aux coursiers urbains.',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${homeUrl}#software`,
        name: 'LivraLink',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, Android, iOS',
        inLanguage: 'fr',
        url: homeUrl,
        image: imageUrl,
        description:
          'Plateforme SaaS de gestion, suivi en temps réel et preuve de livraison (POD) pour vendeurs WhatsApp, Instagram, TikTok et livreurs urbains.',
        provider: {
          '@id': `${homeUrl}#organization`,
        },
        featureList: [
          'Création rapide de missions de livraison pour vendeurs social-commerce',
          'Attribution aux livreurs urbains disponibles et suivi des 7 statuts normalisés',
          'Preuve de livraison sécurisée (POD) par photo, code secret OTP et signature tactile',
          'Estimation de trajet et itinéraire routier en temps réel',
        ],
      },
    ],
  };
};

export const applySeoMetadata = (effectiveView: AppView) => {
  if (typeof document === 'undefined') return;
  const meta = SEO_METADATA_BY_VIEW[effectiveView] ?? SEO_METADATA_BY_VIEW.not_found;
  const origin = getClientCanonicalOrigin();
  const canonicalUrl = meta.isPublic && origin ? `${origin}${meta.path}` : null;
  const currentUrl = origin ? `${origin}${meta.path}` : meta.path;
  const ogImageUrl = origin ? `${origin}/og-image.jpg` : '/og-image.jpg';

  document.title = meta.title;
  upsertMetaTag('name', 'description', meta.description);
  upsertMetaTag('name', 'robots', meta.robots);

  upsertCanonicalLink(canonicalUrl);

  upsertMetaTag('property', 'og:type', 'website');
  upsertMetaTag('property', 'og:site_name', 'LivraLink');
  upsertMetaTag('property', 'og:locale', 'fr_FR');
  upsertMetaTag('property', 'og:title', meta.title);
  upsertMetaTag('property', 'og:description', meta.description);
  upsertMetaTag('property', 'og:url', currentUrl);
  upsertMetaTag('property', 'og:image', ogImageUrl);
  upsertMetaTag('property', 'og:image:alt', 'LivraLink – Plateforme logistique urbaine connectée');

  upsertMetaTag('name', 'twitter:card', 'summary_large_image');
  upsertMetaTag('name', 'twitter:title', meta.title);
  upsertMetaTag('name', 'twitter:description', meta.description);
  upsertMetaTag('name', 'twitter:image', ogImageUrl);

  const existingJsonLd = document.getElementById('livralink-jsonld');
  if (meta.isPublic) {
    const jsonLdString = JSON.stringify(buildPublicStructuredData(origin));
    if (existingJsonLd) {
      existingJsonLd.textContent = jsonLdString;
    } else {
      const script = document.createElement('script');
      script.id = 'livralink-jsonld';
      script.type = 'application/ld+json';
      script.textContent = jsonLdString;
      document.head.appendChild(script);
    }
  } else if (existingJsonLd) {
    existingJsonLd.remove();
  }
};
