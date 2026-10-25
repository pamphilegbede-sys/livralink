import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

export interface OnboardingGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: 'vendeur' | 'livreur';
}

interface StepItem {
  badge: string;
  badgeColor: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  description: string;
  highlights: { icon: string; title: string; desc: string }[];
  visualPreview: {
    type: string;
    headline: string;
    subline: string;
    tag: string;
    details: { label: string; value: string; color?: string }[];
  };
}

export const OnboardingGuideModal: React.FC<OnboardingGuideModalProps> = ({
  isOpen,
  onClose,
  role
}) => {
  const { setCurrentView, showToast } = useApp();
  const [currentStep, setCurrentStep] = useState(0);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      } else if (e.key === 'ArrowRight' && currentStep < steps.length - 1) {
        setCurrentStep((prev) => prev + 1);
      } else if (e.key === 'ArrowLeft' && currentStep > 0) {
        setCurrentStep((prev) => prev - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep]);

  // Steps definition based on user role
  const vendeurSteps: StepItem[] = [
    {
      badge: "BIENVENUE",
      badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800",
      icon: "storefront",
      iconBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
      iconColor: "text-blue-600 dark:text-blue-400",
      title: "Bienvenue sur votre espace Vendeur LivraLink",
      subtitle: "La plateforme de livraison express dédiée aux commerçants et e-commerçants du Bénin.",
      description: "LivraLink connecte immédiatement votre boutique physique ou en ligne aux coursiers professionnels à deux-roues dans tout le Grand Cotonou, Calavi, Porto-Novo et les 77 communes béninoises.",
      highlights: [
        { icon: "schedule", title: "Collecte rapide", desc: "Mise en relation directe avec le coursier le plus proche de votre boutique." },
        { icon: "distance", title: "100 FCFA / km", desc: "Tarif kilométrique juste et transparent calculé au mètre près via Google Maps." },
        { icon: "verified_user", title: "Zéro risque", desc: "Gestion sécurisée du Cash on Delivery et traçabilité intégrale de bout en bout." }
      ],
      visualPreview: {
        type: "Marchand Certifié",
        headline: "Boutique Prêt-à-porter & Cosmétiques",
        subline: "Cotonou - Haie Vive, Littoral",
        tag: "Connecté au réseau",
        details: [
          { label: "Zone de collecte", value: "Cotonou & Calavi" },
          { label: "Délai moyen collecte", value: "12 minutes", color: "text-emerald-600 dark:text-emerald-400 font-bold" },
          { label: "Mode de reversement", value: "MTN / Moov Money" }
        ]
      }
    },
    {
      badge: "EXPÉDITION EXPRESS",
      badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
      icon: "add_box",
      iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      title: "Créez une livraison en 30 secondes",
      subtitle: "Calcul tarifaire instantané et géolocalisation précise des quartiers.",
      description: "Renseignez le nom du client, son numéro de téléphone et son adresse de livraison. Notre moteur Google Maps calcule automatiquement la distance kilométrique exacte et le coût de la course.",
      highlights: [
        { icon: "my_location", title: "Repères locaux", desc: "Indiquez les carrefours et repères usuels pour faciliter l'accès au livreur." },
        { icon: "payments", title: "Montant à encaisser", desc: "Spécifiez le prix des articles que le coursier doit récupérer auprès du client." },
        { icon: "bolt", title: "Option Express", desc: "Activez la priorité haute pour une livraison ultra-urgente en moins d'une heure." }
      ],
      visualPreview: {
        type: "Calculateur de Course",
        headline: "Course #CMD-8492 - Haie Vive → Calavi",
        subline: "Distance calculée : 14.8 km",
        tag: "Prix garanti 1 480 FCFA",
        details: [
          { label: "Frais de livraison", value: "1 480 FCFA", color: "text-blue-600 dark:text-blue-400 font-bold" },
          { label: "Montant à encaisser", value: "25 000 FCFA (Articles)" },
          { label: "Statut", value: "En attente de coursier", color: "text-amber-600 dark:text-amber-400 font-bold" }
        ]
      }
    },
    {
      badge: "SUIVI LIVE & WHATSAPP",
      badgeColor: "bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 border-teal-200 dark:border-teal-800",
      icon: "chat",
      iconBg: "bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400",
      iconColor: "text-teal-600 dark:text-teal-400",
      title: "Suivi en direct & Partage WhatsApp 1-Clic",
      subtitle: "Rassurez vos acheteurs avec des mises à jour automatiques sur WhatsApp.",
      description: "Dès qu'un coursier accepte votre course, vous accédez à son identité et sa progression sur la carte. Cliquez sur le bouton WhatsApp pour envoyer au client un message pré-rédigé avec son lien de suivi personnel.",
      highlights: [
        { icon: "send", title: "Lien WhatsApp direct", desc: "Message automatique avec récapitulatif du colis, nom du livreur et statut." },
        { icon: "two_wheeler", title: "Position en temps réel", desc: "Suivez le coursier en direct sur la carte interactive de prise en charge." },
        { icon: "phone_in_talk", title: "Contact instantané", desc: "Appelez directement le coursier ou joignez l'assistance dispatch si besoin." }
      ],
      visualPreview: {
        type: "Aperçu WhatsApp Client",
        headline: "Message prêt pour +229 97 00 12 34",
        subline: "« Bonjour Eric ! Votre colis LivraLink est pris en charge par Awa Véloce... »",
        tag: "Lien wa.me généré",
        details: [
          { label: "Coursier assigné", value: "Awa Véloce (Moto 125cc)" },
          { label: "Téléphone coursier", value: "+229 97 11 22 33" },
          { label: "Suivi en direct", value: "https://livralink.bj/track/8492" }
        ]
      }
    },
    {
      badge: "PREUVE DE LIVRAISON (POD)",
      badgeColor: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
      icon: "fact_check",
      iconBg: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400",
      iconColor: "text-indigo-600 dark:text-indigo-400",
      title: "Preuve de livraison (POD) Multi-Garanties",
      subtitle: "Finis les litiges de non-réception grâce à notre triple verrouillage sécurisé.",
      description: "À la remise du paquet au destinataire, le livreur doit valider la course en fournissant obligatoirement une photo du paquet, la signature manuscrite du client sur écran et le code secret OTP unique.",
      highlights: [
        { icon: "photo_camera", title: "Photo horodatée", desc: "Cliché net du colis devant le domicile ou entre les mains du destinataire." },
        { icon: "draw", title: "Signature sur smartphone", desc: "Émargement manuscrit direct sur l'écran tactile du livreur." },
        { icon: "pin", title: "Code secret OTP", desc: "Code de vérification à 4 chiffres transmis uniquement au destinataire final." }
      ],
      visualPreview: {
        type: "Contrôle de Sécurité",
        headline: "Bordereau Numérique #POD-8492",
        subline: "Validé le 24 Octobre 2026 à 14:32:05",
        tag: "Triple Garantie Validée ✓",
        details: [
          { label: "Photo de conformité", value: "Présente & Archivée ✓", color: "text-emerald-600 dark:text-emerald-400 font-bold" },
          { label: "Signature tactile", value: "Certifiée sur écran ✓", color: "text-emerald-600 dark:text-emerald-400 font-bold" },
          { label: "Code OTP secret", value: "Vérifié (OTP: 7492) ✓", color: "text-emerald-600 dark:text-emerald-400 font-bold" }
        ]
      }
    },
    {
      badge: "REVERSEMENTS & CASH",
      badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800",
      icon: "account_balance_wallet",
      iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
      iconColor: "text-amber-600 dark:text-amber-400",
      title: "Vos fonds reversés en toute sécurité",
      subtitle: "Retraits automatiques vers vos comptes MTN Mobile Money & Moov Money.",
      description: "Tous les montants encaissés lors des livraisons sont instantanément comptabilisés dans votre solde. Demandez un reversement sur votre numéro Mobile Money en 1 clic sans frais cachés.",
      highlights: [
        { icon: "account_balance", title: "Solde en direct", desc: "Consultez en temps réel le détail de vos ventes et de vos encaissements." },
        { icon: "phone_android", title: "MTN & Moov Money", desc: "Paiements directs sécurisés vers tous les opérateurs du Bénin." },
        { icon: "security", title: "Idempotence bancaire", desc: "Protection anti-double prélèvement et traçabilité d'audit certifiée." }
      ],
      visualPreview: {
        type: "Portefeuille Vendeur",
        headline: "Solde disponible : 142 500 FCFA",
        subline: "Dernier reversement : 85 000 FCFA (MTN MoMo)",
        tag: "Compte Audité & Protégé",
        details: [
          { label: "En attente reversement", value: "142 500 FCFA", color: "text-emerald-600 dark:text-emerald-400 font-bold" },
          { label: "Numéro de réception", value: "+229 97 00 00 00" },
          { label: "Délai de transfert", value: "Instantané (< 2 min)" }
        ]
      }
    }
  ];

  const livreurSteps: StepItem[] = [
    {
      badge: "BIENVENUE COURSIER",
      badgeColor: "bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 border-teal-200 dark:border-teal-800",
      icon: "two_wheeler",
      iconBg: "bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400",
      iconColor: "text-teal-600 dark:text-teal-400",
      title: "Bienvenue sur le réseau des livreurs LivraLink",
      subtitle: "Rejoignez la flotte de coursiers de référence au Bénin et boostez vos gains quotidiens.",
      description: "LivraLink vous propose chaque jour des dizaines de courses rémunérées postées par les commerçants de votre zone. Prenez des courses en toute liberté, quand vous le souhaitez.",
      highlights: [
        { icon: "payments", title: "Revenus attractifs", desc: "Rémunération transparente basée sur les kilomètres réels parcourus." },
        { icon: "toggle_on", title: "En ligne / En pause", desc: "Contrôlez votre disponibilité en 1 clic selon votre emploi du temps." },
        { icon: "support_agent", title: "Dispatch 24/7", desc: "Une équipe d'assistance dédiée joignable en permanence en cas de besoin." }
      ],
      visualPreview: {
        type: "Statut Coursier",
        headline: "Flotte Professionnelle Deux-Roues",
        subline: "Zone principale : Cotonou & Abomey-Calavi",
        tag: "Prêt pour les missions",
        details: [
          { label: "Statut d'intervention", value: "En ligne (Prêt à rouler)", color: "text-emerald-600 dark:text-emerald-400 font-bold" },
          { label: "Moyen de transport", value: "Moto 125cc" },
          { label: "Note de réputation", value: "★ 4.9 / 5.0 (Certifié)" }
        ]
      }
    },
    {
      badge: "MISSIONS EN DIRECT",
      badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800",
      icon: "notifications_active",
      iconBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
      iconColor: "text-blue-600 dark:text-blue-400",
      title: "Acceptez les courses en un clic",
      subtitle: "Visualisez tous les détails de la mission avant de l'accepter.",
      description: "Les nouvelles commandes apparaissent en temps réel sur votre tableau de bord. Consultez le point de ramassage, la destination finale, la distance, le type de colis et le gain net garanti.",
      highlights: [
        { icon: "flash_on", title: "Alertes prioritaires", desc: "Missions urgentes signalées avec bonus kilométrique express." },
        { icon: "map", title: "Filtres géographiques", desc: "Filtrez les courses selon vos communes de prédilection (Calavi, Akpakpa, etc.)." },
        { icon: "check_circle", title: "Acceptation immédiate", desc: "Un clic suffit pour verrouiller la course et lancer le trajet." }
      ],
      visualPreview: {
        type: "Alerte Mission Disponible",
        headline: "Boutique VIP Chic → Ganhi Marché",
        subline: "Colis : Sac de vêtements (1.5 kg)",
        tag: "Gain : 1 650 FCFA",
        details: [
          { label: "Distance totale", value: "6.2 km" },
          { label: "Rémunération coursier", value: "1 650 FCFA net", color: "text-emerald-600 dark:text-emerald-400 font-bold" },
          { label: "Délai recommandé", value: "Moins de 45 minutes" }
        ]
      }
    },
    {
      badge: "NAVIGATION & CONTACT",
      badgeColor: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
      icon: "navigation",
      iconBg: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400",
      iconColor: "text-indigo-600 dark:text-indigo-400",
      title: "Itinéraire GPS & Contact client instantané",
      subtitle: "Trouvez facilement chaque client même dans les ruelles non nommées.",
      description: "Profitez de la carte interactive intégrée pour suivre l'itinéraire le plus fluide. Contactez le destinataire en 1 clic par appel direct ou WhatsApp pour convenir du point de rencontre exact.",
      highlights: [
        { icon: "near_me", title: "Google Maps intégré", desc: "Trajet optimisé tenant compte des axes principaux et secondaires." },
        { icon: "call", title: "Bouton d'appel direct", desc: "Appelez le client sans avoir à composer manuellement son numéro." },
        { icon: "chat", title: "Message d'arrivée WhatsApp", desc: "Prévenez le destinataire que vous êtes au portail en un clic." }
      ],
      visualPreview: {
        type: "En Route vers Destination",
        headline: "Client : Koffi Mensah (+229 97 22 33 44)",
        subline: "Adresse : Zogbo, 2ème rue après la pharmacie",
        tag: "Navigation Active",
        details: [
          { label: "Distance restante", value: "1.8 km (5 min)" },
          { label: "Collecte marchand", value: "Effectuée avec succès ✓" },
          { label: "Espèces à récupérer", value: "18 000 FCFA (Pour le vendeur)" }
        ]
      }
    },
    {
      badge: "PREUVE DE LIVRAISON (POD)",
      badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-200 dark:border-purple-800",
      icon: "verified",
      iconBg: "bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400",
      iconColor: "text-purple-600 dark:text-purple-400",
      title: "Validation POD : Photo, Signature & OTP",
      subtitle: "La garantie absolue de la remise du colis pour valider votre rémunération.",
      description: "Une fois arrivé chez le client, ouvrez la modale de validation POD : prenez une photo nette du paquet remis, faites signer le client sur votre écran et saisissez le code OTP à 4 chiffres.",
      highlights: [
        { icon: "photo_camera", title: "Prise de photo", desc: "Preuve visuelle incontestable de la bonne remise du colis." },
        { icon: "draw", title: "Signature du client", desc: "Recueil simple de la signature avec le doigt sur l'écran." },
        { icon: "lock", title: "Validation OTP", desc: "Le code secret confirme que le bon destinataire a réceptionné le paquet." }
      ],
      visualPreview: {
        type: "Validation de Course",
        headline: "Remise du Colis #CMD-8492",
        subline: "Statut : Colis livré en mains propres",
        tag: "POD Débloqué",
        details: [
          { label: "Photo de livraison", value: "Capturée avec succès ✓", color: "text-emerald-600 dark:text-emerald-400 font-bold" },
          { label: "Signature client", value: "Enregistrée sur écran ✓", color: "text-emerald-600 dark:text-emerald-400 font-bold" },
          { label: "Code OTP", value: "Code 7492 vérifié ✓", color: "text-emerald-600 dark:text-emerald-400 font-bold" }
        ]
      }
    },
    {
      badge: "PORTEFEUILLE COURSIER",
      badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
      icon: "wallet",
      iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      title: "Portefeuille & Retraits instantanés Mobile Money",
      subtitle: "Chaque course validée crédite immédiatement vos gains disponibles.",
      description: "Retirez votre argent quand vous le souhaitez vers votre numéro MTN Mobile Money ou Moov Money. Suivez votre historique journalier et hebdomadaire de gains en toute clarté.",
      highlights: [
        { icon: "trending_up", title: "Gains en temps réel", desc: "Votre solde augmente dès que la preuve POD est validée." },
        { icon: "smartphone", title: "Retrait instantané", desc: "Virement direct vers votre numéro MoMo sans attente de fin de mois." },
        { icon: "stars", title: "Bonus de fidélité", desc: "Primes spéciales pour les coursiers réguliers avec note > 4.8." }
      ],
      visualPreview: {
        type: "Solde Coursier Disponible",
        headline: "Portefeuille : 48 500 FCFA",
        subline: "Courses effectuées aujourd'hui : 6 missions",
        tag: "Retirable immédiatement",
        details: [
          { label: "Gains du jour", value: "+ 9 900 FCFA", color: "text-emerald-600 dark:text-emerald-400 font-bold" },
          { label: "Mode de retrait", value: "MTN Mobile Money Bénin" },
          { label: "Frais de retrait", value: "0 FCFA (Offerts)" }
        ]
      }
    }
  ];

  const steps = role === 'vendeur' ? vendeurSteps : livreurSteps;
  const currentStepData = steps[currentStep] || steps[0];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(`livralink_onboarding_completed_${role}`, 'true');
    } catch {}
    onClose();
  };

  const handleComplete = () => {
    try {
      localStorage.setItem(`livralink_onboarding_completed_${role}`, 'true');
    } catch {}
    showToast(
      role === 'vendeur'
        ? "🎉 Félicitations ! Votre espace Vendeur est prêt."
        : "🎉 Félicitations ! Vous êtes prêt à accepter vos premières courses.",
      'success'
    );
    onClose();

    // Contextual redirection on completion
    if (role === 'vendeur') {
      setCurrentView('vendeur_new_delivery');
    } else {
      setCurrentView('livreur_missions');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      {/* Modal Dialog Card */}
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 my-auto animate-in zoom-in-95 duration-200 transition-colors"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-step-title"
      >
        {/* Top Progress Bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 shrink-0">
          <div
            className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 transition-all duration-300 ease-out"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Modal Header */}
        <div className="px-5 sm:px-7 pt-5 sm:pt-6 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${currentStepData.iconBg}`}>
              <span className="material-symbols-outlined text-2xl">
                {currentStepData.icon}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${currentStepData.badgeColor}`}>
                  {currentStepData.badge}
                </span>
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                  Étape {currentStep + 1} sur {steps.length}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                Guide de prise en main LivraLink {role === 'vendeur' ? 'Marchand' : 'Coursier'}
              </p>
            </div>
          </div>

          {/* Close / Skip button */}
          <button
            type="button"
            onClick={handleDismiss}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Fermer le guide"
            aria-label="Fermer le guide"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-5 sm:p-7 space-y-5 overflow-y-auto max-h-[calc(85vh-160px)] custom-scrollbar">
          {/* Step Main Title & Description */}
          <div>
            <h2
              id="onboarding-step-title"
              className="text-lg sm:text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-snug"
            >
              {currentStepData.title}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 mt-1">
              {currentStepData.subtitle}
            </p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
              {currentStepData.description}
            </p>
          </div>

          {/* Realistic Feature Visual Mockup */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/40 dark:from-slate-800/80 dark:to-slate-900 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {currentStepData.visualPreview.headline}
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 text-[10px] font-extrabold shrink-0">
                {currentStepData.visualPreview.tag}
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
              {currentStepData.visualPreview.subline}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
              {currentStepData.visualPreview.details.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-0.5"
                >
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{item.label}</p>
                  <p className={`font-bold truncate text-[11px] sm:text-xs ${item.color || 'text-slate-800 dark:text-slate-200'}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Key Feature Highlights */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Points clés à retenir :
            </h4>
            <div className="grid grid-cols-1 gap-2.5">
              {currentStepData.highlights.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 flex items-start gap-3"
                >
                  <div className="w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-base">{item.icon}</span>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </h5>
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="px-5 sm:px-7 py-4 bg-slate-50/80 dark:bg-slate-900/90 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {/* Step Dots Indicators */}
          <div className="flex items-center gap-1.5 order-2 sm:order-1">
            {steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentStep(idx)}
                className={`transition-all rounded-full ${
                  idx === currentStep
                    ? 'w-6 h-2 bg-blue-600 dark:bg-blue-500'
                    : 'w-2 h-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                }`}
                aria-label={`Aller à l'étape ${idx + 1}`}
              />
            ))}
          </div>

          {/* Navigation Action Buttons */}
          <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-2 order-1 sm:order-2">
            {currentStep > 0 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-all active:scale-95 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                <span>Précédent</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDismiss}
                className="min-h-[44px] px-3.5 py-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-semibold transition-colors"
              >
                Passer le guide
              </button>
            )}

            {currentStep < steps.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-1.5"
              >
                <span>Étape suivante</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>{role === 'vendeur' ? 'Créer ma 1ère course 🚀' : 'Explorer mes missions 🛵'}</span>
                <span className="material-symbols-outlined text-sm">check</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
