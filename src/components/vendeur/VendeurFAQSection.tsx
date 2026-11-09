import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';

export interface FAQItem {
  id: string;
  category: 'expedition' | 'livreur' | 'paiement' | 'pod' | 'compte';
  categoryLabel: string;
  question: string;
  answer: string;
  keyPoints?: string[];
  action?: {
    label: string;
    icon: string;
    view?: 'vendeur_new_delivery' | 'vendeur_tracking' | 'vendeur_reports' | 'vendeur_settings';
    handler?: () => void;
  };
}

export const VENDEUR_FAQ_DATA: FAQItem[] = [
  {
    id: 'faq-1',
    category: 'expedition',
    categoryLabel: 'Expéditions & Envois',
    question: 'Comment lancer une nouvelle livraison express sur la plateforme ?',
    answer: 'Pour expédier un colis, cliquez sur le bouton "Nouvelle livraison" dans votre tableau de bord. Renseignez le nom du client, son numéro WhatsApp, la commune de destination et une description synthétique du colis. Une fois validée, la course est automatiquement diffusée aux livreurs actifs dans votre rayon.',
    keyPoints: [
      'Choix des 77 communes du Bénin et géolocalisation GPS',
      'Calcul automatique de la distance et de l\'estimation tarifaire',
      'Alerte instantanée envoyée au livreur le plus proche'
    ],
    action: {
      label: 'Créer une livraison',
      icon: 'add_circle',
      view: 'vendeur_new_delivery'
    }
  },
  {
    id: 'faq-2',
    category: 'paiement',
    categoryLabel: 'Paiements & Tarifs (P2P)',
    question: 'Comment s\'effectuent le règlement des marchandises et la livraison ?',
    answer: 'Dans la version MVP de LivraLink, la gestion des paiements repose sur un modèle direct de gré à gré (P2P). Le client règle directement les frais de livraison et le prix de l\'article au livreur ou à vous via espèces (Cash COD) ou transfert Mobile Money (MTN MoMo, Moov Money, Celtiis).',
    keyPoints: [
      '0% de commission prélevée par la plateforme pour ce MVP',
      'Encaissement direct sans intermédiaire bancaire',
      'Transparence totale des montants affichés dans vos rapports'
    ],
    action: {
      label: 'Voir mes statistiques',
      icon: 'analytics',
      view: 'vendeur_reports'
    }
  },
  {
    id: 'faq-3',
    category: 'pod',
    categoryLabel: 'Preuve de Livraison (POD)',
    question: 'Qu\'est-ce que la Preuve de Livraison POD et comment garantit-elle mes colis ?',
    answer: 'La Preuve de Livraison (POD) est un système d\'authentification tri-facteur. Lors de la remise du colis, le livreur saisit le code OTP confidentiel à 4 chiffres généré pour le client, prend une photo horodatée du colis et recueille la signature numérique du destinataire.',
    keyPoints: [
      'Code secret OTP envoyé par SMS / WhatsApp au client',
      'Horodatage certifié et coordonnées GPS au moment de la livraison',
      'Consultation en 1 clic de la preuve depuis le tableau de bord'
    ],
    action: {
      label: 'Consulter mes livraisons',
      icon: 'verified',
      view: 'vendeur_tracking'
    }
  },
  {
    id: 'faq-4',
    category: 'livreur',
    categoryLabel: 'Livreurs & Assignation',
    question: 'Comment attribuer directement une course à un livreur spécifique ?',
    answer: 'Vous pouvez soit laisser l\'algorithme de proximité attribuer le livreur le plus rapide, soit utiliser le bouton "Trouver un Livreur" pour consulter l\'annuaire des livreurs accrédités disponibles et sélectionner personnellement le livreur de votre choix.',
    keyPoints: [
      'Visualisation des notes (ex: ★ 4.9) et types de véhicules (moto, tricycle, voiture)',
      'Option de relance de recherche si aucun coursier n\'a accepté après 5 minutes',
      'Directeur de flotte avec statut en temps réel (En ligne / En mission)'
    ]
  },
  {
    id: 'faq-5',
    category: 'expedition',
    categoryLabel: 'Expéditions & Envois',
    question: 'Que se passe-t-il si un client est absent ou refuse le colis ?',
    answer: 'Si le client est injoignable ou annule la livraison à l\'arrivée, le livreur marque la course sous le statut "Échec" avec un motif explicite. Vous recevez une alerte sur votre tableau de bord et vous pouvez reprogrammer la course en 1 clic ou contacter le client sur WhatsApp.',
    keyPoints: [
      'Bouton "Reprogrammer" disponible directement sur la ligne de livraison',
      'Contact WhatsApp en 1 clic pré-rempli avec le numéro du client',
      'Suivi des motifs d\'échec pour l\'amélioration de vos envois'
    ]
  },
  {
    id: 'faq-6',
    category: 'compte',
    categoryLabel: 'Compte & Boutique',
    question: 'Comment modifier les informations de ma boutique (adresse, commune, contact) ?',
    answer: 'Rendez-vous dans la section "Paramètres Vendeur" accessible via le menu latéral. Vous pouvez y mettre à jour le nom de votre enseigne, la commune par défaut de votre point de collecte, votre numéro WhatsApp commercial et vos horaires habituels d\'ouverture.',
    keyPoints: [
      'Mise à jour instantanée prise en compte sur les nouvelles courses',
      'Gestion de la commune parmi la liste des 77 communes béninoises',
      'Sauvegarde automatique de votre profil marchand'
    ],
    action: {
      label: 'Accéder aux Paramètres',
      icon: 'settings',
      view: 'vendeur_settings'
    }
  },
  {
    id: 'faq-7',
    category: 'paiement',
    categoryLabel: 'Paiements & Tarifs (P2P)',
    question: 'Comment sont calculés les tarifs des courses sur LivraLink ?',
    answer: 'Les tarifs sont calculés de manière transparente en fonction de la distance kilométrique estimée entre la commune d\'enlèvement et la commune de destination, avec un tarif de base modulé selon la formule express ou standard retenue.',
    keyPoints: [
      'Transparence tarifaire affichée avant validation',
      'Estimation en FCFA adaptée au marché local',
      'Pas de surcoût caché ou de frais imprévus'
    ]
  },
  {
    id: 'faq-8',
    category: 'compte',
    categoryLabel: 'Compte & Boutique',
    question: 'Comment exporter mon rapport de ventes et livraisons ?',
    answer: 'Dans le tableau de bord de vos livraisons ou dans l\'onglet "Rapports & Statistiques", cliquez sur le bouton "Export" pour générer et télécharger un compte-rendu CSV récapitulant vos expéditions, les livreurs concernés et les montants enregistrés.',
    keyPoints: [
      'Exportation au format CSV compatible Excel & Google Sheets',
      'Filtres par date et par statut de livraison',
      'Outil idéal pour le suivi comptable de votre boutique'
    ],
    action: {
      label: 'Consulter les Rapports',
      icon: 'analytics',
      view: 'vendeur_reports'
    }
  }
];

export const VendeurFAQSection: React.FC<{
  onOpenGuide?: () => void;
}> = ({ onOpenGuide }) => {
  const { setCurrentView, showToast, openWhatsAppModal } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>('faq-1');

  // Filter items based on search and category
  const filteredFAQ = useMemo(() => {
    return VENDEUR_FAQ_DATA.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        (item.keyPoints && item.keyPoints.some((kp) => kp.toLowerCase().includes(q)));
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const toggleAccordion = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleSupportClick = () => {
    openWhatsAppModal(
      '+22901020304',
      'Support Vendeur LivraLink',
      'Bonjour, j\'ai une question concernant l\'utilisation de mon espace vendeur sur LivraLink.'
    );
  };

  return (
    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 md:p-7 space-y-6 shadow-2xs transition-colors">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900">
            <span className="material-symbols-outlined text-xl">help</span>
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Foire aux Questions &amp; Support Vendeur
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Toutes les réponses aux questions courantes sur l'expédition, le paiement P2P et la preuve POD.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenGuide && (
            <button
              type="button"
              onClick={onOpenGuide}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base text-blue-600 dark:text-blue-400">auto_stories</span>
              <span>Guide Interactif</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSupportClick}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">chat</span>
            <span>Support WhatsApp 24/7</span>
          </button>
        </div>
      </div>

      {/* Search & Category Segmented Filters */}
      <div className="space-y-3">
        {/* Search Input */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher une question (ex: OTP, paiement, retard, boutique...)..."
            className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-600 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Toutes les questions ({VENDEUR_FAQ_DATA.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('expedition')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'expedition'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Expéditions &amp; Envois
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('paiement')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'paiement'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Paiements (P2P)
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('pod')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'pod'
                ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Preuve POD
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('livreur')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'livreur'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Livreurs
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory('compte')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
              selectedCategory === 'compte'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Boutique &amp; Compte
          </button>
        </div>
      </div>

      {/* Accordion List */}
      <div className="space-y-3">
        {filteredFAQ.length === 0 ? (
          <div className="py-10 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <span className="material-symbols-outlined text-3xl text-slate-400">quiz</span>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Aucune question ne correspond à "{searchQuery}".
            </p>
            <p className="text-[11px] text-slate-500">
              Essayez avec d'autres mots-clés ou réinitialisez la recherche.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="mt-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors"
            >
              Réinitialiser la recherche
            </button>
          </div>
        ) : (
          filteredFAQ.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <article
                key={item.id}
                className={`rounded-xl border transition-all overflow-hidden ${
                  isExpanded
                    ? 'border-blue-200 dark:border-blue-900/80 bg-blue-50/20 dark:bg-blue-950/20 shadow-2xs'
                    : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Clickable Question Header */}
                <button
                  type="button"
                  onClick={() => toggleAccordion(item.id)}
                  className="w-full p-4 text-left flex items-start justify-between gap-3 cursor-pointer group select-none"
                >
                  <div className="space-y-1">
                    {/* Unboxed Metadata Category Label */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {item.categoryLabel}
                      </span>
                    </div>

                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                      {item.question}
                    </h3>
                  </div>

                  <span
                    className={`material-symbols-outlined text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 text-xl transition-transform duration-200 shrink-0 mt-0.5 ${
                      isExpanded ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
                    }`}
                  >
                    keyboard_arrow_down
                  </span>
                </button>

                {/* Expanded Answer Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in duration-150">
                    <p className="text-slate-700 dark:text-slate-200 font-medium">
                      {item.answer}
                    </p>

                    {item.keyPoints && item.keyPoints.length > 0 && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block uppercase tracking-wider">
                          Points clés à retenir :
                        </span>
                        <ul className="space-y-1">
                          {item.keyPoints.map((point, index) => (
                            <li key={index} className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                              <span className="text-blue-600 dark:text-blue-400 font-bold">✓</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Action button if defined */}
                    {item.action && (
                      <div className="pt-1 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (item.action?.view) {
                              setCurrentView(item.action.view);
                            } else if (item.action?.handler) {
                              item.action.handler();
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">{item.action.icon}</span>
                          <span>{item.action.label}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Footer Support Callout Card */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-lg">support_agent</span>
          </div>
          <div>
            <span className="font-bold text-slate-900 dark:text-white block">
              Besoin d'une assistance immédiate ?
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              Notre équipe d'assistance est joignable 24h/24 par WhatsApp ou téléphone.
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            showToast('Ligne directe assistance LivraLink : 01 02 03 04', 'info');
            handleSupportClick();
          }}
          className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs shrink-0 transition-all cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm text-emerald-600">call</span>
          <span>Contact Direct 01 02 03 04</span>
        </button>
      </div>
    </section>
  );
};
