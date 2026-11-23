import React, { useEffect, useState } from 'react';
import { AdminAccountRecord, AdminRoleId } from '../../types';
import { useApp } from '../../context/AppContext';

export const AdminRbacSecurityPanel: React.FC = () => {
  const {
    authorizedGetIdToken,
    showToast,
    isSuperAdminMaster,
    adminRoleId,
    adminPermissions,
  } = useApp();

  const [admins, setAdmins] = useState<AdminAccountRecord[]>([]);
  const [roleCatalog, setRoleCatalog] = useState<Array<{ id: AdminRoleId; label: string; permissions: string[] }>>([]);
  const [loading, setLoading] = useState(true);

  const [createForm, setCreateForm] = useState({
    email: '',
    fullName: '',
    roleId: 'responsable_support' as AdminRoleId,
  });
  const [creating, setCreating] = useState(false);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch('/api/admin/rbac/admins', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setAdmins(data.admins || []);
        setRoleCatalog(data.roleCatalog || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdmins();
  }, []);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.email.trim() || !createForm.fullName.trim()) return;
    setCreating(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch('/api/admin/rbac/admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(createForm),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast(data?.error || 'Impossible de créer ce compte administrateur.', 'error');
      } else {
        showToast(`Administrateur ${createForm.email} habilité (${createForm.roleId}).`, 'success');
        setCreateForm({ email: '', fullName: '', roleId: 'responsable_support' });
        await loadAdmins();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRoleOrState = async (uid: string, patch: { roleId?: AdminRoleId; isActive?: boolean }) => {
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/rbac/admins/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast(data?.error || 'Erreur modification admin', 'error');
      } else {
        showToast('Droits administrateur mis à jour.', 'success');
        await loadAdmins();
      }
    } catch {}
  };

  const handleDeleteAdmin = async (adm: AdminAccountRecord) => {
    if (!window.confirm(`Révoquer définitivement l’accès administrateur de ${adm.email} ?`)) return;
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/rbac/admins/${encodeURIComponent(adm.uid)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast(data?.error || 'Erreur révocation admin', 'error');
      } else {
        showToast(`Accès révoqué pour ${adm.email}.`, 'success');
        await loadAdmins();
      }
    } catch {}
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950 uppercase">
            Contrôle d’Accès RBAC Strict
          </span>
          <h2 className="text-lg font-extrabold mt-1">Gestion des Administrateurs &amp; Rôles Granulaires</h2>
          <p className="text-xs text-slate-300">
            Votre session : <strong className="text-amber-300">{adminRoleId || 'super_admin'}</strong> ({adminPermissions.length} permission(s) actives)
          </p>
        </div>
        <button
          type="button"
          onClick={loadAdmins}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs cursor-pointer"
        >
          Actualiser la liste
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
        {/* Admin Accounts List */}
        <div className="lg:col-span-7 bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900">Comptes Administrateurs Habilités ({admins.length})</h3>
          {loading ? (
            <p className="py-6 text-center text-slate-400">Chargement des administrateurs...</p>
          ) : (
            <div className="space-y-2.5">
              {admins.map((adm) => (
                <div
                  key={adm.uid}
                  className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    adm.isProtectedMaster
                      ? 'bg-amber-50/70 border-amber-300'
                      : adm.isActive
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-red-50/50 border-red-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-900">{adm.fullName}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-amber-300">
                        {adm.roleId}
                      </span>
                      {!adm.isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
                          DÉSACTIVÉ
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-slate-600 mt-0.5">{adm.email}</p>
                  </div>

                  {!adm.isProtectedMaster && isSuperAdminMaster ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={adm.roleId}
                        onChange={(e) => handleUpdateRoleOrState(adm.uid, { roleId: e.target.value as AdminRoleId })}
                        className="px-2 py-1 border border-slate-300 rounded-lg bg-white font-bold text-[11px]"
                      >
                        {roleCatalog.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleUpdateRoleOrState(adm.uid, { isActive: !adm.isActive })}
                        className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${
                          adm.isActive ? 'bg-amber-100 text-amber-900' : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {adm.isActive ? 'Désactiver' : 'Réactiver'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAdmin(adm)}
                        className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg font-bold text-[11px] cursor-pointer"
                      >
                        Révoquer
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-800 px-2 py-1 rounded bg-amber-100">
                      {adm.isProtectedMaster ? 'Super-Admin Protégé' : 'Lecture seule'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Co-Admin Form (Super-Admin Only) */}
        <div className="lg:col-span-5 space-y-4">
          {isSuperAdminMaster ? (
            <form onSubmit={handleCreateAdmin} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900">+ Habiliter un Nouvel Administrateur</h3>
              <p className="text-slate-500">
                L’utilisateur devra se connecter via Google OAuth avec cette adresse vérifiée.
              </p>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nom complet *</label>
                <input
                  required
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                  placeholder="Ex: Marie Koudjo"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Adresse E-mail Google *</label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="admin.adjoint@gmail.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Rôle attribué *</label>
                <select
                  value={createForm.roleId}
                  onChange={(e) => setCreateForm({ ...createForm, roleId: e.target.value as AdminRoleId })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  {roleCatalog
                    .filter((r) => r.id !== 'super_admin')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} ({r.permissions.length} droits)
                      </option>
                    ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold rounded-xl cursor-pointer disabled:opacity-50"
              >
                {creating ? 'Création en cours...' : 'Créer et Habiliter l’Administrateur'}
              </button>
            </form>
          ) : (
            <div className="bg-amber-50 border border-amber-200 p-5 rounded-3xl text-amber-950">
              <p className="font-extrabold">Privilège Super-Admin requis</p>
              <p className="mt-1">Seul le Super-Administrateur principal peut créer, modifier ou révoquer d’autres comptes administrateurs.</p>
            </div>
          )}

          {/* Roles Matrix Summary */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-2.5">
            <h4 className="font-extrabold text-slate-900">Catalogue des 7 Rôles RBAC</h4>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {roleCatalog.map((r) => (
                <div key={r.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>{r.label}</span>
                    <span className="text-blue-700">{r.permissions.length} droits</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">
                    {r.permissions.slice(0, 6).join(', ')}
                    {r.permissions.length > 6 ? ` +${r.permissions.length - 6}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
