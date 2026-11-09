import React from 'react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  isOpen,
  onClose,
  onAccept,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 font-['Plus_Jakarta_Sans'] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden transition-all text-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-xl">shield_lock</span>
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                Politique de Confidentialité &amp; CGU
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Protection des données et règles d'utilisation LivraLink Bénin
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-base text-blue-600 shrink-0 mt-0.5">verified_user</span>
            <div>
              <strong className="block text-slate-900 dark:text-white">Engagement de Transparence &amp; Sécurité</strong>
              Conformément au Code du Numérique en République du Bénin (Loi n° 2017-20), LivraLink s'engage à protéger l'intégralité de vos données personnelles et commerciales.
            </div>
          </div>

          {/* Section 1 */}
          <section className="space-y-1.5">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
              <span>1. Collecte et Utilisation des Données Personnelles</span>
            </h4>
            <p>
              Pour permettre l'exécution et le suivi logistique des livraisons, LivraLink collecte uniquement les données strictement nécessaires :
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-300">
              <li><strong>Vendeurs &amp; Commerçants</strong> : Nom complet, nom de boutique, adresse e-mail, numéro WhatsApp, commune de localisation et coordonnées GPS du point de collecte.</li>
              <li><strong>Livreurs &amp; Coursiers</strong> : Nom complet, numéro de téléphone, immatriculation et type de véhicule, zones d'intervention et géolocalisation en cours de mission.</li>
              <li><strong>Destinataires &amp; Clients</strong> : Nom, téléphone d'appel, commune et adresse précise de livraison.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-1.5">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
              2. Preuve de Livraison (POD) &amp; Horodatage
            </h4>
            <p>
              Afin de prévenir tout litige lors de la remise des marchandises, le système utilise un mécanisme de preuve tri-facteur horodaté comprenant :
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-300">
              <li>Code OTP confidentiel communiqué par le client final au livreur.</li>
              <li>Photo horodatée du colis remis sur le lieu de livraison.</li>
              <li>Signature manuscrite tactile du réceptionnaire.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-1.5">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
              3. Modèle Financier Direct (P2P / Cash / MoMo)
            </h4>
            <p>
              Pour la version MVP de LivraLink, aucun fonds bancaire ou commission n'est prélevé directement par la plateforme. Tous les paiements de marchandises (COD) et les frais de livraison s'effectuent directement de main à main ou par transfert Mobile Money entre les vendeurs, livreurs et clients.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-1.5">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
              4. Sécurité et Non-Divulgation des Données
            </h4>
            <p>
              Vos données ne sont ni vendues, ni cédées à des tiers commerciaux. Elles sont conservées sur des serveurs sécurisés avec chiffrement des accès et contrôle strict des autorisations d'administration.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-1.5">
            <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
              5. Droits des Utilisateurs &amp; Modification de Profil
            </h4>
            <p>
              À tout moment, vous disposez d'un droit d'accès, de rectification et de suppression de votre compte en accédant aux paramètres de votre profil ou en contactant notre équipe d'assistance dédiée (01 02 03 04).
            </p>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            Dernière mise à jour : Novembre 2026
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-200 dark:hover:bg-slate-800 text-xs transition-colors"
            >
              Fermer
            </button>

            {onAccept && (
              <button
                type="button"
                onClick={() => {
                  onAccept();
                  onClose();
                }}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">check_circle</span>
                <span>J'accepte les conditions</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
