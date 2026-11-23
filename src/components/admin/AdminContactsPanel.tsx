import React, { useEffect, useState } from 'react';
import { PlatformContactsConfig } from '../../types';
import { useApp } from '../../context/AppContext';

export const AdminContactsPanel: React.FC = () => {
  const { platformConfig, savePlatformConfigSection, showToast, hasAdminPermission } = useApp();
  const [form, setForm] = useState<PlatformContactsConfig>(platformConfig.contacts);
  const [saving, setSaving] = useState(false);

  const canManage = hasAdminPermission('contacts.manage');

  useEffect(() => {
    setForm(platformConfig.contacts);
  }, [platformConfig.contacts]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await savePlatformConfigSection(
        { contacts: form },
        'Mise à jour des numéros de téléphone officiels de la plateforme'
      );
      if (res.success) {
        showToast('Numéros de contact enregistrés et propagés dans toute l’application.', 'success');
      } else {
        showToast(res.error || 'Erreur sauvegarde contacts', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const fields: Array<{ key: keyof PlatformContactsConfig; label: string; hint: string }> = [
    { key: 'mainPhone', label: 'Numéro principal (Accueil / Pied de page)', hint: 'Affiché sur le site public et dans la navigation' },
    { key: 'whatsappPhone', label: 'Numéro WhatsApp officiel', hint: 'Lien direct support WhatsApp vendeurs & livreurs' },
    { key: 'customerServicePhone', label: 'Service client', hint: 'Assistance commandes et suivi destinataires' },
    { key: 'techSupportPhone', label: 'Support technique', hint: 'Aide comptes, connexion et application' },
    { key: 'complaintsPhone', label: 'Ligne réclamations & litiges', hint: 'Traitement prioritaire des incidents colis' },
    { key: 'emergencyPhone', label: 'Numéro d’urgence terrain', hint: 'Accidents ou blocages livreurs en course' },
    { key: 'billingPhone', label: 'Numéro facturation / paiements', hint: 'Suivi Mobile Money et reversements COD' },
    { key: 'notificationContactPhone', label: 'Contact affiché dans notifications/e-mails', hint: 'Pied de page automatique des messages sortants' },
  ];

  return (
    <form onSubmit={handleSave} className="space-y-5 animate-in fade-in duration-200">
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600">contact_phone</span>
              <span>Configuration des Numéros de Téléphone &amp; Support</span>
            </h2>
            <p className="text-xs text-slate-500">
              Tous les numéros saisis ici remplacent dynamiquement les contacts sur la Landing Page, FAQ, Paramètres et Modales de confidentialité.
            </p>
          </div>
          {canManage && (
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs shadow-xs cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Sauvegarde...' : 'Enregistrer tous les numéros'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {fields.map((f) => (
            <div key={f.key} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
              <label className="font-extrabold text-slate-800 block">{f.label}</label>
              <input
                type="tel"
                required={f.key === 'mainPhone'}
                value={form[f.key] || ''}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                placeholder="+229 01 97 00 00 00"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-mono text-sm"
              />
              <p className="text-[11px] text-slate-500">{f.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </form>
  );
};
