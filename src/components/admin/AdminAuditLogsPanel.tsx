import React, { useEffect, useState, useMemo } from 'react';
import { PlatformAuditLog } from '../../types';
import { useApp } from '../../context/AppContext';
import { downloadCsvFile } from '../../utils/csvExport';

export const AdminAuditLogsPanel: React.FC = () => {
  const { authorizedGetIdToken, auditLogs: localAuditLogs, showToast } = useApp();
  const [serverLogs, setServerLogs] = useState<PlatformAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fetchServerAuditLogs = async (cat = categoryFilter) => {
    setLoading(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) {
        setLoading(false);
        return;
      }
      const params = new URLSearchParams({ limit: '150' });
      if (cat !== 'all') params.set('category', cat);
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && Array.isArray(data.logs)) {
        setServerLogs(data.logs);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchServerAuditLogs('all');
  }, []);

  const filteredServerLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return serverLogs.filter((l) => {
      if (categoryFilter !== 'all' && l.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        (l.action || '').toLowerCase().includes(q) ||
        (l.adminEmail || '').toLowerCase().includes(q) ||
        (l.targetId || '').toLowerCase().includes(q) ||
        (l.reason || '').toLowerCase().includes(q)
      );
    });
  }, [serverLogs, categoryFilter, search]);

  const handleExport = () => {
    downloadCsvFile(
      `livralink-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Horodatage', 'Admin', 'Role', 'Categorie', 'Action', 'Cible', 'Motif'],
      filteredServerLogs.map((l) => [
        l.timestamp,
        l.adminEmail,
        l.adminRole,
        l.category,
        l.action,
        `${l.targetType || ''}:${l.targetId || ''}`,
        l.reason || '',
      ])
    );
    showToast('Journal d’audit exporté en CSV.', 'success');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-800">policy</span>
            <span>Journal d’Audit Immuable Serveur ({filteredServerLogs.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Traçabilité infalsifiable de toutes les actions critiques (tarifs, RBAC, remboursements, statuts, réattributions, e-mails)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer action, admin, ID..."
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-slate-50 outline-none w-48"
          />
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              void fetchServerAuditLogs(e.target.value);
            }}
            className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-white"
          >
            <option value="all">Toutes catégories</option>
            <option value="rbac">RBAC / Admins</option>
            <option value="pricing">Tarifs</option>
            <option value="vendor">Vendeurs</option>
            <option value="courier">Livreurs &amp; Rémun.</option>
            <option value="delivery">Courses &amp; Litiges</option>
            <option value="refund">Remboursements</option>
            <option value="email">E-mails</option>
            <option value="config">Paramètres &amp; Contacts</option>
          </select>
          <button
            type="button"
            onClick={() => fetchServerAuditLogs(categoryFilter)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs cursor-pointer"
          >
            Actualiser
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-1.5 bg-slate-900 text-amber-300 font-bold rounded-xl text-xs cursor-pointer"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-x-auto">
        {loading ? (
          <p className="p-8 text-center text-xs text-slate-400">Chargement des logs immuables Firestore...</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Date &amp; Heure</th>
                <th className="px-4 py-3">Auteur (Rôle)</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Cible</th>
                <th className="px-4 py-3">Détails / Motif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredServerLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('fr-FR')}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-bold text-slate-900">{log.adminEmail}</div>
                    <div className="text-[10px] text-slate-400">{log.adminRole}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 uppercase">
                      {log.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono font-bold text-blue-800">{log.action}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                    {log.targetType ? `${log.targetType}: ${log.targetId || ''}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">
                    {log.reason || (log.newValue ? JSON.stringify(log.newValue) : '—')}
                  </td>
                </tr>
              ))}
              {filteredServerLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Aucun log serveur trouvé. Événements locaux récents : {localAuditLogs.length}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
