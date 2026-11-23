import React, { useEffect, useState } from 'react';
import { PlatformFeatureFlags, PlatformGeneralConfig } from '../../types';
import { useApp } from '../../context/AppContext';

export const AdminGeneralSettingsPanel: React.FC = () => {
  const {
    platformConfig,
    featureFlags,
    savePlatformConfigSection,
    showToast,
    hasAdminPermission,
  } = useApp();

  const [general, setGeneral] = useState<PlatformGeneralConfig>(platformConfig.general);
  const [flags, setFlags] = useState<PlatformFeatureFlags>(featureFlags);
  const [saving, setSaving] = useState(false);

  const canManage = hasAdminPermission('settings.manage');

  useEffect(() => {
    setGeneral(platformConfig.general);
  }, [platformConfig.general]);

  useEffect(() => {
    setFlags(featureFlags);
  }, [featureFlags]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await savePlatformConfigSection(
        { general, featureFlags: flags },
        'Mise à jour des paramètres généraux & activation globale'
      );
      if (res.success) {
        showToast('Paramètres généraux et restrictions globales enregistrés.', 'success');
      } else {
        showToast(res.error || 'Erreur sauvegarde paramètres généraux', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const criticalToggles: Array<{ key: keyof PlatformFeatureFlags; label: string; desc: string }> = [
    { key: 'allowVendorRegistration', label: 'Autoriser l’inscription de nouveaux vendeurs', desc: 'Si désactivé, l’inscription vendeur est bloquée côté formulaire et backend.' },
    { key: 'allowCourierRegistration', label: 'Autoriser l’inscription de nouveaux livreurs', desc: 'Si désactivé, l’inscription livreur est fermée sur la plateforme.' },
    { key: 'allowNewOrders', label: 'Autoriser la création de nouvelles commandes', desc: 'Permet de geler temporairement toute nouvelle expédition en cas de maintenance.' },
    { key: 'allowPriorityDeliveries', label: 'Autoriser les livraisons prioritaires (Express / Urgent)', desc: 'Désactive les modes express/urgent lors de la création de course.' },
    { key: 'allowPayments', label: 'Autoriser les paiements & retraits Mobile Money', desc: 'Gèle les opérations de décaissement si désactivé.' },
    { key: 'allowNotifications', label: 'Autoriser les notifications automatiques', desc: 'Suspend l’envoi automatique de notifications non critiques.' },
    { key: 'allowPromotions', label: 'Autoriser les codes promotionnels & remises', desc: 'Désactive la prise en compte des codes promo au calcul des frais.' },
  ];

  return (
    <form onSubmit={handleSave} className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-800">settings_applications</span>
            <span>Paramètres Généraux de l’Application</span>
          </h2>
          <p className="text-xs text-slate-500">
            Identité officielle, localisation, mentions légales, conditions d’utilisation et interrupteurs globaux de la plateforme
          </p>
        </div>
        {canManage && (
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold rounded-xl text-xs shadow-sm cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Sauvegarde...' : 'Enregistrer les paramètres'}
          </button>
        )}
      </div>

      {/* Identity & Localization */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4 text-xs">
        <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
          1. Identité, Localisation &amp; Horaires
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Nom de l’application</label>
            <input
              required
              value={general.appName}
              onChange={(e) => setGeneral({ ...general, appName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Slogan / Tagline</label>
            <input
              value={general.tagline}
              onChange={(e) => setGeneral({ ...general, tagline: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Adresse officielle</label>
            <input
              value={general.officialAddress}
              onChange={(e) => setGeneral({ ...general, officialAddress: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Pays</label>
            <input
              value={general.country}
              onChange={(e) => setGeneral({ ...general, country: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Devise</label>
            <input
              value={general.currency}
              onChange={(e) => setGeneral({ ...general, currency: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Fuseau horaire</label>
            <input
              value={general.timezone}
              onChange={(e) => setGeneral({ ...general, timezone: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Horaires d’ouverture</label>
            <input
              value={general.operatingHours}
              onChange={(e) => setGeneral({ ...general, operatingHours: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">URL Logo personnalisé</label>
            <input
              value={general.logoUrl}
              onChange={(e) => setGeneral({ ...general, logoUrl: e.target.value })}
              placeholder="https://... (optionnel)"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">URL Favicon</label>
            <input
              value={general.faviconUrl}
              onChange={(e) => setGeneral({ ...general, faviconUrl: e.target.value })}
              placeholder="https://... (optionnel)"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
        </div>
        <div>
          <label className="font-bold text-slate-700 block mb-1">Description officielle</label>
          <textarea
            rows={2}
            value={general.description}
            onChange={(e) => setGeneral({ ...general, description: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl"
          />
        </div>
      </div>

      {/* Global Feature Toggles */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4 text-xs">
        <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
          2. Activation &amp; Contrôle Global des Opérations
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {criticalToggles.map((item) => {
            const active = flags[item.key] !== false;
            return (
              <div
                key={String(item.key)}
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                  active ? 'bg-emerald-50/40 border-emerald-200' : 'bg-red-50/40 border-red-200'
                }`}
              >
                <div>
                  <p className="font-extrabold text-slate-900">{item.label}</p>
                  <p className="text-[11px] text-slate-500">{item.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFlags((prev) => ({ ...prev, [item.key]: !active }))}
                  className={`px-3.5 py-1.5 rounded-xl font-extrabold text-[11px] shrink-0 cursor-pointer ${
                    active ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                  }`}
                >
                  {active ? 'ACTIF' : 'BLOQUÉ'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legal Texts */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4 text-xs">
        <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
          3. Textes Légaux, CGU &amp; Conditions Partenaires
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Mentions légales</label>
            <textarea
              rows={3}
              value={general.legalNotice}
              onChange={(e) => setGeneral({ ...general, legalNotice: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Conditions Générales d’Utilisation (CGU)</label>
            <textarea
              rows={3}
              value={general.cguText}
              onChange={(e) => setGeneral({ ...general, cguText: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Politique de confidentialité</label>
            <textarea
              rows={3}
              value={general.privacyPolicyText}
              onChange={(e) => setGeneral({ ...general, privacyPolicyText: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Conditions spécifiques Vendeurs</label>
            <textarea
              rows={3}
              value={general.vendorTermsText}
              onChange={(e) => setGeneral({ ...general, vendorTermsText: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div className="md:col-span-2">
            <label className="font-bold text-slate-700 block mb-1">Conditions spécifiques Livreurs</label>
            <textarea
              rows={2}
              value={general.courierTermsText}
              onChange={(e) => setGeneral({ ...general, courierTermsText: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
        </div>
      </div>
    </form>
  );
};
