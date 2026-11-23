import React, { useEffect, useState } from 'react';
import { EmailTemplateRecord, PlatformEmailsConfig } from '../../types';
import { useApp } from '../../context/AppContext';
import { buildSandboxedEmailPreviewDocument } from '../../utils/htmlSanitizer';

export const AdminEmailTemplatesPanel: React.FC<{
  onOpenSmtpSettings: () => void;
}> = ({ onOpenSmtpSettings }) => {
  const {
    platformConfig,
    savePlatformConfigSection,
    authorizedGetIdToken,
    showToast,
    hasAdminPermission,
  } = useApp();

  const canManage = hasAdminPermission('emails.manage');

  const [emailCfg, setEmailCfg] = useState<PlatformEmailsConfig>(platformConfig.emails);
  const [templates, setTemplates] = useState<EmailTemplateRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>('signup_welcome');
  const [editDraft, setEditDraft] = useState<Partial<EmailTemplateRecord>>({});
  const [testEmail, setTestEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    setEmailCfg(platformConfig.emails);
  }, [platformConfig.emails]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch('/api/admin/email-templates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && Array.isArray(data.templates)) {
        setTemplates(data.templates);
        const current = data.templates.find((t: EmailTemplateRecord) => t.id === selectedId) || data.templates[0];
        if (current) {
          setSelectedId(current.id);
          setEditDraft(current);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const currentTemplate = templates.find((t) => t.id === selectedId);

  const selectTemplate = (tpl: EmailTemplateRecord) => {
    setSelectedId(tpl.id);
    setEditDraft({ ...tpl });
  };

  const handleSaveAddresses = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await savePlatformConfigSection(
        { emails: emailCfg },
        'Mise à jour des adresses e-mail officielles'
      );
      if (res.success) {
        showToast('Adresses e-mail officielles enregistrées.', 'success');
      } else {
        showToast(res.error || 'Erreur sauvegarde e-mails', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTemplate) return;
    setSaving(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/email-templates/${encodeURIComponent(currentTemplate.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: editDraft.enabled ?? true,
          subject: editDraft.subject,
          title: editDraft.title,
          bodyHtml: editDraft.bodyHtml,
          bodyText: editDraft.bodyText,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast(data?.error || 'Impossible de sauvegarder le template.', 'error');
      } else {
        showToast(`Template "${currentTemplate.name}" enregistré.`, 'success');
        setTemplates((prev) => prev.map((t) => (t.id === currentTemplate.id ? data.template : t)));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!currentTemplate || !testEmail.trim()) {
      showToast('Indiquez une adresse e-mail de destination pour le test.', 'error');
      return;
    }
    setSendingTest(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/email-templates/${encodeURIComponent(currentTemplate.id)}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetEmail: testEmail.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        showToast(data.message || 'E-mail de test envoyé.', 'success');
      } else {
        showToast(data?.error || 'Échec de l’envoi de test.', 'error');
      }
    } finally {
      setSendingTest(false);
    }
  };

  const previewDoc = buildSandboxedEmailPreviewDocument(
    `<div style="font-family:sans-serif;padding:18px;color:#0f172a;">
      <p style="font-size:11px;color:#64748b;margin:0 0 8px 0;"><strong>De :</strong> ${emailCfg.senderName} &lt;${emailCfg.notificationsEmail}&gt;</p>
      <h2 style="margin:0 0 12px 0;font-size:18px;">${editDraft.title || ''}</h2>
      <div>${editDraft.bodyHtml || ''}</div>
    </div>`
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Section 1: Adresses & Identité E-mail */}
      <form onSubmit={handleSaveAddresses} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600">alternate_email</span>
              <span>Configuration des Adresses E-mail Officielles</span>
            </h2>
            <p className="text-slate-500">
              Utilisées dans toute l’application (Support, CGU, Pied de page, Notifications automatiques)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSmtpSettings}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl cursor-pointer"
            >
              Passerelle SMTP &amp; Outbox
            </button>
            {canManage && (
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl cursor-pointer disabled:opacity-50"
              >
                Enregistrer les adresses
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Nom d’expéditeur</label>
            <input
              value={emailCfg.senderName}
              onChange={(e) => setEmailCfg({ ...emailCfg, senderName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">E-mail de contact</label>
            <input
              type="email"
              value={emailCfg.contactEmail}
              onChange={(e) => setEmailCfg({ ...emailCfg, contactEmail: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">E-mail support client</label>
            <input
              type="email"
              value={emailCfg.supportEmail}
              onChange={(e) => setEmailCfg({ ...emailCfg, supportEmail: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">E-mail administrateur</label>
            <input
              type="email"
              value={emailCfg.adminEmail}
              onChange={(e) => setEmailCfg({ ...emailCfg, adminEmail: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">E-mail notifications</label>
            <input
              type="email"
              value={emailCfg.notificationsEmail}
              onChange={(e) => setEmailCfg({ ...emailCfg, notificationsEmail: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">E-mail facturation</label>
            <input
              type="email"
              value={emailCfg.billingEmail}
              onChange={(e) => setEmailCfg({ ...emailCfg, billingEmail: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">E-mail Reply-To</label>
            <input
              type="email"
              value={emailCfg.replyToEmail}
              onChange={(e) => setEmailCfg({ ...emailCfg, replyToEmail: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>
        </div>
      </form>

      {/* Section 2: 14 Templates E-mail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 p-4 space-y-2 max-h-[680px] overflow-y-auto">
          <h3 className="text-sm font-extrabold text-slate-900 px-2 pb-2 border-b border-slate-100">
            Modèles d’e-mails automatiques ({templates.length})
          </h3>
          {loading ? (
            <p className="p-4 text-slate-400">Chargement des 14 templates...</p>
          ) : (
            templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => selectTemplate(tpl)}
                className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                  selectedId === tpl.id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold truncate">{tpl.name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                      tpl.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {tpl.enabled ? 'ACTIF' : 'OFF'}
                  </span>
                </div>
                <p className={`text-[10px] truncate mt-0.5 ${selectedId === tpl.id ? 'text-slate-300' : 'text-slate-500'}`}>
                  {tpl.category} · {tpl.subject}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 p-5 space-y-4">
          {currentTemplate ? (
            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">{currentTemplate.name}</h3>
                  <p className="text-[11px] text-slate-500">
                    Variables disponibles :{' '}
                    {currentTemplate.variables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          setEditDraft((prev) => ({
                            ...prev,
                            bodyHtml: `${prev.bodyHtml || ''} {{${v}}}`,
                          }))
                        }
                        className="inline-block mr-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-mono text-[10px] cursor-pointer hover:bg-blue-100"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </p>
                </div>
                <label className="flex items-center gap-2 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editDraft.enabled !== false}
                    onChange={(e) => setEditDraft({ ...editDraft, enabled: e.target.checked })}
                  />
                  <span>Activé</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Objet (Subject)</label>
                  <input
                    required
                    value={editDraft.subject || ''}
                    onChange={(e) => setEditDraft({ ...editDraft, subject: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Titre d’en-tête</label>
                  <input
                    required
                    value={editDraft.title || ''}
                    onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Corps HTML du message</label>
                <textarea
                  rows={5}
                  value={editDraft.bodyHtml || ''}
                  onChange={(e) => setEditDraft({ ...editDraft, bodyHtml: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Prévisualisation en direct (Sandbox sécurisé)</label>
                <iframe
                  title="Prévisualisation template e-mail"
                  sandbox=""
                  srcDoc={previewDoc}
                  className="w-full h-44 rounded-2xl border border-slate-200 bg-slate-50"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="test@exemple.com"
                    className="px-3 py-2 border border-slate-300 rounded-xl w-52"
                  />
                  <button
                    type="button"
                    disabled={sendingTest || !canManage}
                    onClick={handleSendTest}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {sendingTest ? 'Envoi...' : 'Tester l’envoi'}
                  </button>
                </div>

                {canManage && (
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Enregistrement...' : 'Sauvegarder le template'}
                  </button>
                )}
              </div>
            </form>
          ) : (
            <p className="p-8 text-center text-slate-400">Sélectionnez un modèle à gauche.</p>
          )}
        </div>
      </div>
    </div>
  );
};
