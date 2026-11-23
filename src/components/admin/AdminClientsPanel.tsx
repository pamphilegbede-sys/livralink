import React, { useEffect, useState, useMemo } from 'react';
import { ClientDirectoryEntry } from '../../types';
import { useApp } from '../../context/AppContext';
import { downloadCsvFile } from '../../utils/csvExport';

export const AdminClientsPanel: React.FC = () => {
  const { authorizedGetIdToken, showToast, deliveries } = useApp();
  const [clients, setClients] = useState<ClientDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientDirectoryEntry | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await fetch('/api/admin/clients', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && Array.isArray(data.clients)) {
        setClients(data.clients);
      } else {
        showToast(data?.error || 'Impossible de charger les clients.', 'error');
      }
    } catch {
      showToast('Erreur réseau lors du chargement des clients.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchClients();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        c.communes.some((cm) => cm.toLowerCase().includes(q))
    );
  }, [clients, search]);

  const handleExportCsv = () => {
    downloadCsvFile(
      `livralink-clients-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Nom', 'Telephone', 'Email', 'Commandes', 'Livrees', 'Litiges', 'TotalDepenseFCFA', 'Communes', 'DerniereCommande'],
      filtered.map((c) => [
        c.name,
        c.phone,
        c.email || '',
        c.totalOrders,
        c.deliveredOrders,
        c.disputedOrders,
        c.totalSpentFCFA,
        c.communes.join(' | '),
        c.lastOrderAt || '',
      ])
    );
    showToast('Export CSV des clients téléchargé.', 'success');
  };

  const clientOrders = useMemo(() => {
    if (!selectedClient) return [];
    const targetPhone = selectedClient.phone;
    const targetName = selectedClient.name.toLowerCase();
    return deliveries.filter(
      (d) =>
        (targetPhone && d.clientPhone === targetPhone) ||
        (!targetPhone && d.clientName.toLowerCase() === targetName)
    );
  }, [selectedClient, deliveries]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-600">person_pin_circle</span>
            <span>Répertoire Clients Finaux ({filtered.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Historique consolidé des destinataires, montants dépensés, communes livrées et réclamations
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher client, tél, commune..."
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white outline-none w-52"
          />
          <button
            type="button"
            onClick={fetchClients}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
          >
            Actualiser
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs cursor-pointer flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xs overflow-x-auto">
        {loading ? (
          <p className="p-8 text-center text-xs text-slate-500">Consolidation du répertoire clients...</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Téléphone / E-mail</th>
                <th className="px-4 py-3">Communes</th>
                <th className="px-4 py-3 text-center">Courses</th>
                <th className="px-4 py-3 text-center">Livrées</th>
                <th className="px-4 py-3 text-right">Total payé</th>
                <th className="px-4 py-3 text-center">Litiges</th>
                <th className="px-4 py-3 text-right">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((client) => (
                <tr key={client.key} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-extrabold text-slate-900">{client.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{client.phone || '—'}</div>
                    {client.email && <div className="text-[10px] text-slate-400">{client.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{client.communes.join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-center font-bold">{client.totalOrders}</td>
                  <td className="px-4 py-3 text-center font-bold text-emerald-700">{client.deliveredOrders}</td>
                  <td className="px-4 py-3 text-right font-extrabold text-slate-900">
                    {client.totalSpentFCFA.toLocaleString('fr-FR')} FCFA
                  </td>
                  <td className="px-4 py-3 text-center">
                    {client.disputedOrders > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                        {client.disputedOrders}
                      </span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedClient(client)}
                      className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                    >
                      Historique
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    Aucun client trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {selectedClient && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedClient(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">{selectedClient.name}</h3>
                <p className="text-xs text-slate-500">{selectedClient.phone} · {selectedClient.communes.join(', ')}</p>
              </div>
              <button type="button" onClick={() => setSelectedClient(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-700">Courses associées ({clientOrders.length})</p>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                {clientOrders.map((o) => (
                  <div key={o.id} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{o.id}</span>
                      <span className="text-slate-500 ml-2">{o.pickupLocation.name} → {o.dropoffLocation.commune}</span>
                    </div>
                    <span className="font-bold">{o.totalCustomerPayable.toLocaleString('fr-FR')} F ({o.status})</span>
                  </div>
                ))}
                {clientOrders.length === 0 && (
                  <p className="p-4 text-center text-xs text-slate-400">Détail disponible via synchronisation complète.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
