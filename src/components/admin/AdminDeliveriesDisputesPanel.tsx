import React, { useEffect, useState, useMemo } from 'react';
import { DeliveryDisputeRecord, DeliveryOrder } from '../../types';
import { useApp } from '../../context/AppContext';

export const AdminDeliveriesDisputesPanel: React.FC<{
  mode: 'deliveries' | 'disputes';
  onOpenNewDelivery?: () => void;
  onOpenArbitrateOrder?: (orderId: string) => void;
}> = ({ mode, onOpenNewDelivery, onOpenArbitrateOrder }) => {
  const {
    deliveries,
    couriers,
    authorizedGetIdToken,
    refreshAdminData,
    showToast,
    hasAdminPermission,
    deleteDelivery,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [inspectOrder, setInspectOrder] = useState<DeliveryOrder | null>(null);

  // Cancel modal
  const [cancelTarget, setCancelTarget] = useState<DeliveryOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Reassign modal
  const [reassignTarget, setReassignTarget] = useState<DeliveryOrder | null>(null);
  const [reassignCourierId, setReassignCourierId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  // Formal disputes
  const [disputes, setDisputes] = useState<DeliveryDisputeRecord[]>([]);
  const [loadingDisputes, setLoadingDisputes] = useState(false);
  const [newDisputeModal, setNewDisputeModal] = useState(false);
  const [newDisputeForm, setNewDisputeForm] = useState({
    orderId: '',
    category: 'retard',
    priority: 'moyenne',
    subject: '',
    description: '',
  });
  const [resolveTarget, setResolveTarget] = useState<DeliveryDisputeRecord | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [resolveStatus, setResolveStatus] = useState<'en_analyse' | 'resolu' | 'clos'>('resolu');

  const canCancel = hasAdminPermission('deliveries.cancel');
  const canReassign = hasAdminPermission('deliveries.reassign');
  const canResolveDisputes = hasAdminPermission('disputes.resolve');

  const loadDisputes = async () => {
    setLoadingDisputes(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch('/api/admin/disputes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && Array.isArray(data.disputes)) {
        setDisputes(data.disputes);
      }
    } finally {
      setLoadingDisputes(false);
    }
  };

  useEffect(() => {
    if (mode === 'disputes') {
      void loadDisputes();
    }
  }, [mode]);

  const filteredDeliveries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (d.id || '').toLowerCase().includes(q) ||
        (d.clientName || '').toLowerCase().includes(q) ||
        (d.clientPhone || '').toLowerCase().includes(q) ||
        (d.pickupLocation?.name || '').toLowerCase().includes(q) ||
        (d.dropoffLocation?.commune || '').toLowerCase().includes(q) ||
        (d.courier?.name || '').toLowerCase().includes(q)
      );
    });
  }, [deliveries, statusFilter, search]);

  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget || cancelReason.trim().length < 3) {
      showToast('Veuillez saisir un motif officiel (min. 3 caractères).', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const cleanId = cancelTarget.id.replace(/[^a-zA-Z0-9_-]/g, '');
      const res = await fetch(`/api/admin/deliveries/${encodeURIComponent(cleanId)}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast(data?.error || 'Impossible d’annuler la course.', 'error');
      } else {
        showToast(`Course ${cancelTarget.id} annulée et auditée.`, 'success');
        setCancelTarget(null);
        setCancelReason('');
        await refreshAdminData(true);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReassignOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignTarget || !reassignCourierId || reassignReason.trim().length < 3) {
      showToast('Sélectionnez un livreur KYC vérifié et indiquez un motif.', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const cleanId = reassignTarget.id.replace(/[^a-zA-Z0-9_-]/g, '');
      const res = await fetch(`/api/admin/deliveries/${encodeURIComponent(cleanId)}/reassign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          courierId: reassignCourierId,
          reason: reassignReason.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast(data?.error || 'Impossible de réattribuer la course.', 'error');
      } else {
        showToast(`Course ${reassignTarget.id} réattribuée à ${data.courier?.name || 'livreur'}.`, 'success');
        setReassignTarget(null);
        setReassignCourierId('');
        setReassignReason('');
        await refreshAdminData(true);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const order = deliveries.find((d) => d.id === newDisputeForm.orderId);
      const res = await fetch('/api/admin/disputes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newDisputeForm,
          merchantId: order?.merchantId,
          courierId: order?.courier?.id,
          clientName: order?.clientName,
          clientPhone: order?.clientPhone,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        showToast('Litige / réclamation enregistré.', 'success');
        setNewDisputeModal(false);
        setNewDisputeForm({ orderId: '', category: 'retard', priority: 'moyenne', subject: '', description: '' });
        await loadDisputes();
      } else {
        showToast(data?.error || 'Erreur création litige', 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolveDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveTarget || resolveNote.trim().length < 3) return;
    setIsProcessing(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/disputes/${encodeURIComponent(resolveTarget.id)}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: resolveStatus,
          resolutionNote: resolveNote.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        showToast('Décision enregistrée sur le litige.', 'success');
        setResolveTarget(null);
        setResolveNote('');
        await loadDisputes();
      } else {
        showToast(data?.error || 'Erreur résolution', 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const failedOrders = useMemo(() => deliveries.filter((d) => d.status === 'echec'), [deliveries]);

  if (mode === 'disputes') {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-red-600">gavel</span>
              <span>Centre de Résolution des Litiges &amp; Réclamations</span>
            </h2>
            <p className="text-xs text-slate-500">
              {disputes.length} dossier(s) formel(s) + {failedOrders.length} incident(s) de livraison en échec
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadDisputes}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
            >
              Actualiser
            </button>
            {canResolveDisputes && (
              <button
                type="button"
                onClick={() => setNewDisputeModal(true)}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                + Ouvrir un Litige
              </button>
            )}
          </div>
        </div>

        {/* Formal Disputes Table */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900">Dossiers de Réclamation Formels ({disputes.length})</h3>
          {loadingDisputes ? (
            <p className="text-xs text-slate-500 py-4">Chargement des réclamations...</p>
          ) : disputes.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">Aucune réclamation formelle ouverte.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {disputes.map((d) => (
                <div key={d.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-slate-900">{d.orderId}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 uppercase">
                        {d.priority}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          d.status === 'resolu' || d.status === 'clos'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>
                  </div>
                  <p className="font-bold text-slate-900">{d.subject}</p>
                  <p className="text-slate-600">{d.description}</p>
                  {d.resolutionNote && (
                    <p className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px]">
                      <strong>Résolution ({d.resolvedBy}) :</strong> {d.resolutionNote}
                    </p>
                  )}
                  {canResolveDisputes && d.status !== 'clos' && (
                    <button
                      type="button"
                      onClick={() => {
                        setResolveTarget(d);
                        setResolveNote(d.resolutionNote || '');
                        setResolveStatus('resolu');
                      }}
                      className="mt-1 px-3 py-1.5 bg-slate-900 text-white font-bold rounded-xl text-[11px] cursor-pointer"
                    >
                      Traiter / Clôturer le litige
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Failed Deliveries Arbitration */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900">Courses en Échec / Incidents POD ({failedOrders.length})</h3>
          {failedOrders.length === 0 ? (
            <p className="text-xs text-slate-400">Aucun échec de livraison actif.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {failedOrders.map((order) => (
                <div key={order.id} className="p-4 rounded-2xl border border-red-200 bg-red-50/30 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-red-700">{order.id}</span>
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full font-bold text-[10px]">Échec</span>
                  </div>
                  <p className="font-semibold text-slate-800">{order.statusNote || 'Incident signalé'}</p>
                  <p className="text-slate-600">
                    Boutique : {order.pickupLocation.name} · Client : {order.clientName} ({order.itemValueCOD.toLocaleString('fr-FR')} F COD)
                  </p>
                  {onOpenArbitrateOrder && (
                    <button
                      type="button"
                      onClick={() => onOpenArbitrateOrder(order.id)}
                      className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs cursor-pointer"
                    >
                      Ouvrir l’Arbitrage Superviseur
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Dispute Modal */}
        {newDisputeModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4" onClick={() => setNewDisputeModal(false)}>
            <form
              onSubmit={handleCreateDispute}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-md w-full p-6 space-y-3 text-xs shadow-2xl"
            >
              <h3 className="text-base font-extrabold text-slate-900">Ouvrir un Dossier de Litige</h3>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Course concernée *</label>
                <input
                  required
                  list="deliveries-ids-list"
                  value={newDisputeForm.orderId}
                  onChange={(e) => setNewDisputeForm({ ...newDisputeForm, orderId: e.target.value })}
                  placeholder="#LL-..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
                <datalist id="deliveries-ids-list">
                  {deliveries.slice(0, 50).map((d) => (
                    <option key={d.id} value={d.id} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Catégorie</label>
                  <select
                    value={newDisputeForm.category}
                    onChange={(e) => setNewDisputeForm({ ...newDisputeForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    <option value="retard">Retard</option>
                    <option value="colis_endommage">Colis endommagé</option>
                    <option value="paiement">Paiement / COD</option>
                    <option value="comportement">Comportement</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Priorité</label>
                  <select
                    value={newDisputeForm.priority}
                    onChange={(e) => setNewDisputeForm({ ...newDisputeForm, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    <option value="basse">Basse</option>
                    <option value="moyenne">Moyenne</option>
                    <option value="haute">Haute</option>
                    <option value="critique">Critique</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Objet *</label>
                <input
                  required
                  value={newDisputeForm.subject}
                  onChange={(e) => setNewDisputeForm({ ...newDisputeForm, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Description détaillée *</label>
                <textarea
                  required
                  rows={3}
                  value={newDisputeForm.description}
                  onChange={(e) => setNewDisputeForm({ ...newDisputeForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setNewDisputeModal(false)} className="px-4 py-2 bg-slate-100 rounded-xl font-bold cursor-pointer">
                  Annuler
                </button>
                <button type="submit" disabled={isProcessing} className="px-4 py-2 bg-red-600 text-white rounded-xl font-extrabold cursor-pointer">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Resolve Dispute Modal */}
        {resolveTarget && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4" onClick={() => setResolveTarget(null)}>
            <form
              onSubmit={handleResolveDispute}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-md w-full p-6 space-y-3 text-xs shadow-2xl"
            >
              <h3 className="text-base font-extrabold text-slate-900">Décision sur {resolveTarget.orderId}</h3>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nouveau statut</label>
                <select
                  value={resolveStatus}
                  onChange={(e) => setResolveStatus(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="en_analyse">En analyse</option>
                  <option value="resolu">Résolu</option>
                  <option value="clos">Clos</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Note de résolution / décision *</label>
                <textarea
                  required
                  rows={3}
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setResolveTarget(null)} className="px-4 py-2 bg-slate-100 rounded-xl font-bold cursor-pointer">
                  Annuler
                </button>
                <button type="submit" disabled={isProcessing} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-extrabold cursor-pointer">
                  Valider la décision
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // MODE === 'deliveries'
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* KPI Filter Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
        {[
          { id: 'all', label: 'Toutes', count: deliveries.length, cls: 'bg-slate-900 text-white' },
          { id: 'en_attente', label: 'En attente', count: deliveries.filter((d) => d.status === 'en_attente').length, cls: 'bg-amber-500 text-slate-950' },
          { id: 'assignee', label: 'Assignées', count: deliveries.filter((d) => d.status === 'assignee' || d.status === 'acceptee').length, cls: 'bg-indigo-600 text-white' },
          { id: 'en_cours', label: 'En transit', count: deliveries.filter((d) => d.status === 'en_cours' || d.status === 'colis_recupere').length, cls: 'bg-blue-600 text-white' },
          { id: 'livree', label: 'Livrées (POD)', count: deliveries.filter((d) => d.status === 'livree').length, cls: 'bg-emerald-600 text-white' },
          { id: 'echec', label: 'Échecs', count: deliveries.filter((d) => d.status === 'echec').length, cls: 'bg-red-600 text-white' },
        ].map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => setStatusFilter(tile.id)}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
              statusFilter === tile.id ? `${tile.cls} border-transparent shadow-sm` : 'bg-white border-slate-200 text-slate-800 hover:border-blue-400'
            }`}
          >
            <span className="text-[10px] font-bold uppercase block opacity-80">{tile.label}</span>
            <span className="text-lg font-black">{tile.count}</span>
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-600">local_shipping</span>
            <span>Supervision Complète des Courses ({filteredDeliveries.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Inspection des instantanés tarifaires, réattribution forcée, annulation motivée et contrôle POD
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher #LL, client, boutique, livreur..."
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white outline-none w-56"
          />
          {onOpenNewDelivery && (
            <button
              type="button"
              onClick={onOpenNewDelivery}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer"
            >
              + Nouvelle Course
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xs overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Boutique → Destination</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Livreur</th>
              <th className="px-4 py-3 text-right">Frais / COD</th>
              <th className="px-4 py-3 text-center">Statut</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredDeliveries.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <span className="font-mono font-extrabold text-slate-900">{order.id}</span>
                  <div className="text-[10px] text-slate-400">
                    {order.deliveryType || 'standard'} · {order.distanceKm ? `${order.distanceKm} km` : ''}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-bold text-slate-800">{order.pickupLocation?.name}</div>
                  <div className="text-[11px] text-slate-500">→ {order.dropoffLocation?.commune}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{order.clientName}</div>
                  <div className="text-[11px] text-slate-500">{order.clientPhone}</div>
                </td>
                <td className="px-4 py-3">
                  {order.courier?.name ? (
                    <span className="font-bold text-blue-700">{order.courier.name}</span>
                  ) : (
                    <span className="text-amber-700 italic">Non assignée</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="font-extrabold text-slate-900">{order.deliveryFee.toLocaleString('fr-FR')} F</div>
                  <div className="text-[10px] text-slate-500">COD: {order.itemValueCOD.toLocaleString('fr-FR')} F</div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-800">
                    {order.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setInspectOrder(order)}
                      className="px-2 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                    >
                      Détails
                    </button>
                    {canReassign && order.status !== 'livree' && order.status !== 'echec' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReassignTarget(order);
                          setReassignCourierId(order.courier?.id || '');
                          setReassignReason('');
                        }}
                        className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Réattribuer
                      </button>
                    )}
                    {canCancel && order.status !== 'livree' && order.status !== 'echec' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancelTarget(order);
                          setCancelReason('');
                        }}
                        className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Annuler
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Supprimer définitivement la course ${order.id} ?`)) {
                            deleteDelivery(order.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                        title="Supprimer"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredDeliveries.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  Aucune course trouvée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Inspect Order Snapshot & POD Modal */}
      {inspectOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4" onClick={() => setInspectOrder(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Inspection Course {inspectOrder.id}</h3>
                <p className="text-slate-500">{inspectOrder.pickupLocation.name} → {inspectOrder.dropoffLocation.address}</p>
              </div>
              <button type="button" onClick={() => setInspectOrder(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {inspectOrder.pricingSnapshot && (
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
                <p className="font-extrabold text-blue-950">Instantané Tarifaire Immuable (au moment de la création)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>Distance: <strong>{inspectOrder.pricingSnapshot.distanceKm} km</strong></div>
                  <div>Tarif/km: <strong>{inspectOrder.pricingSnapshot.pricePerKmFCFA} F</strong></div>
                  <div>Prise en charge: <strong>{inspectOrder.pricingSnapshot.pickupFixedFeeFCFA} F</strong></div>
                  <div>Supp. type ({inspectOrder.pricingSnapshot.deliveryType}): <strong>{inspectOrder.pricingSnapshot.deliveryTypeSurchargeFCFA} F</strong></div>
                  <div>Remise/Promo: <strong>-{inspectOrder.pricingSnapshot.promoDiscountFCFA} F</strong></div>
                  <div>Total frais: <strong className="text-blue-700">{inspectOrder.pricingSnapshot.finalDeliveryFeeFCFA.toLocaleString('fr-FR')} F</strong></div>
                </div>
              </div>
            )}

            {inspectOrder.remunerationSnapshot && (
              <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-2">
                <p className="font-extrabold text-purple-950">
                  Instantané Rémunération Livreur ({inspectOrder.remunerationSnapshot.usedGeneralTariff ? 'Tarif Général' : 'Tarif Individuel'})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>Brut: <strong>{inspectOrder.remunerationSnapshot.courierGrossEarningFCFA.toLocaleString('fr-FR')} F</strong></div>
                  <div>Commission: <strong>{inspectOrder.remunerationSnapshot.platformCommissionFCFA.toLocaleString('fr-FR')} F</strong></div>
                  <div>Primes/Bonus: <strong>+{(inspectOrder.remunerationSnapshot.fixedBonusFCFA + inspectOrder.remunerationSnapshot.bonusFCFA).toLocaleString('fr-FR')} F</strong></div>
                  <div>Malus: <strong>-{inspectOrder.remunerationSnapshot.malusFCFA.toLocaleString('fr-FR')} F</strong></div>
                  <div>Net Livreur: <strong className="text-emerald-700">{inspectOrder.remunerationSnapshot.netCourierEarningFCFA.toLocaleString('fr-FR')} F</strong></div>
                </div>
              </div>
            )}

            {inspectOrder.podData && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                <p className="font-extrabold text-emerald-900">Preuve de Livraison (POD)</p>
                <p>Signé par : <strong>{inspectOrder.podData.signedByName || 'Client'}</strong> · {inspectOrder.podData.validatedAt}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4" onClick={() => setCancelTarget(null)}>
          <form onSubmit={handleCancelOrder} onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl max-w-md w-full p-6 space-y-3 text-xs shadow-2xl">
            <h3 className="text-base font-extrabold text-red-700">Annuler la course {cancelTarget.id}</h3>
            <p className="text-slate-600">L’annulation notifie le vendeur et trace la décision dans le journal d’audit.</p>
            <textarea
              required
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motif officiel d’annulation *"
              className="w-full px-3 py-2 border border-red-300 rounded-xl"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCancelTarget(null)} className="px-4 py-2 bg-slate-100 rounded-xl font-bold cursor-pointer">
                Fermer
              </button>
              <button type="submit" disabled={isProcessing} className="px-4 py-2 bg-red-600 text-white rounded-xl font-extrabold cursor-pointer">
                Confirmer l’annulation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reassign Modal */}
      {reassignTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4" onClick={() => setReassignTarget(null)}>
          <form onSubmit={handleReassignOrder} onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl max-w-md w-full p-6 space-y-3 text-xs shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">Réattribuer {reassignTarget.id}</h3>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Livreur cible (KYC vérifié uniquement)</label>
              <select
                required
                value={reassignCourierId}
                onChange={(e) => setReassignCourierId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
              >
                <option value="">-- Choisir un livreur --</option>
                {couriers.filter((c) => c.isKycVerified).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.zone} · {c.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Motif de réattribution *</label>
              <input
                required
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Ex: Livreur initial indisponible / urgence client"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReassignTarget(null)} className="px-4 py-2 bg-slate-100 rounded-xl font-bold cursor-pointer">
                Annuler
              </button>
              <button type="submit" disabled={isProcessing} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-extrabold cursor-pointer">
                Réattribuer maintenant
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
