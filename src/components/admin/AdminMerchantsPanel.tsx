import React, { useState, useMemo } from 'react';
import {
  AccountLifecycleStatus,
  Merchant,
  VendorCommercialConfig,
} from '../../types';
import { useApp } from '../../context/AppContext';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  actif: { label: 'Actif', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  inactif: { label: 'Inactif', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
  suspendu: { label: 'Suspendu', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
  bloque: { label: 'Bloqué', cls: 'bg-red-50 text-red-700 border-red-300' },
};

export const AdminMerchantsPanel: React.FC<{
  onOpenAddMerchant: () => void;
  onSelectDelivery?: (orderId: string) => void;
}> = ({ onOpenAddMerchant }) => {
  const {
    merchants,
    deliveries,
    authorizedGetIdToken,
    refreshAdminData,
    showToast,
    impersonateMerchant,
    hasAdminPermission,
    deleteMerchant,
    addAuditLog,
  } = useApp();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountLifecycleStatus>('all');
  const [detailMerchant, setDetailMerchant] = useState<Merchant | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const [editingMerchant, setEditingMerchant] = useState<Merchant | null>(null);
  const [editForm, setEditForm] = useState<{
    storeName: string;
    managerName: string;
    phone: string;
    email: string;
    commune: string;
    address: string;
    channel: string;
    accountStatus: AccountLifecycleStatus;
    blockedReason: string;
    customCommissionRatePercent: string;
    fixedOrderFeeFCFA: string;
    serviceFeePercent: string;
    preferredRateDiscountPercent: string;
    commercialNotes: string;
  }>({
    storeName: '',
    managerName: '',
    phone: '',
    email: '',
    commune: '',
    address: '',
    channel: 'WhatsApp',
    accountStatus: 'actif',
    blockedReason: '',
    customCommissionRatePercent: '',
    fixedOrderFeeFCFA: '',
    serviceFeePercent: '',
    preferredRateDiscountPercent: '0',
    commercialNotes: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const canManage = hasAdminPermission('vendors.manage');

  const filteredMerchants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merchants.filter((m) => {
      const mStatus = (m.accountStatus || (m.status === 'suspendu' ? 'suspendu' : 'actif')) as AccountLifecycleStatus;
      if (statusFilter !== 'all' && mStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        (m.storeName || '').toLowerCase().includes(q) ||
        (m.managerName || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.phone || '').toLowerCase().includes(q) ||
        (m.commune || '').toLowerCase().includes(q)
      );
    });
  }, [merchants, search, statusFilter]);

  const openDetailModal = async (merchant: Merchant) => {
    setDetailMerchant(merchant);
    setDetailData(null);
    setIsLoadingDetails(true);
    try {
      const token = await authorizedGetIdToken();
      if (token) {
        const res = await fetch(`/api/admin/merchants/${encodeURIComponent(merchant.id)}/details`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          setDetailData(data);
        }
      }
    } catch {}
    setIsLoadingDetails(false);
  };

  const openEditModal = (merchant: Merchant) => {
    setEditingMerchant(merchant);
    const comm: VendorCommercialConfig = merchant.commercialConfig || {};
    setEditForm({
      storeName: merchant.storeName || '',
      managerName: merchant.managerName || '',
      phone: merchant.phone || '',
      email: merchant.email || '',
      commune: merchant.commune || 'Cotonou',
      address: merchant.address || '',
      channel: merchant.channel || 'WhatsApp',
      accountStatus: (merchant.accountStatus || (merchant.status === 'suspendu' ? 'suspendu' : 'actif')) as AccountLifecycleStatus,
      blockedReason: merchant.blockedReason || '',
      customCommissionRatePercent:
        typeof comm.customCommissionRatePercent === 'number' ? String(comm.customCommissionRatePercent) : '',
      fixedOrderFeeFCFA: typeof comm.fixedOrderFeeFCFA === 'number' ? String(comm.fixedOrderFeeFCFA) : '',
      serviceFeePercent: typeof comm.serviceFeePercent === 'number' ? String(comm.serviceFeePercent) : '',
      preferredRateDiscountPercent: String(merchant.preferredRateDiscountPercent ?? 0),
      commercialNotes: comm.commercialNotes || '',
    });
  };

  const handleSaveMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMerchant) return;
    if ((editForm.accountStatus === 'suspendu' || editForm.accountStatus === 'bloque') && editForm.blockedReason.trim().length < 3) {
      showToast('Veuillez indiquer un motif de suspension ou de blocage (min. 3 caractères).', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) {
        showToast('Session administrateur expirée.', 'error');
        setIsSaving(false);
        return;
      }
      const commercialConfig: VendorCommercialConfig = {
        customCommissionRatePercent:
          editForm.customCommissionRatePercent.trim() !== '' ? Number(editForm.customCommissionRatePercent) : null,
        fixedOrderFeeFCFA: editForm.fixedOrderFeeFCFA.trim() !== '' ? Number(editForm.fixedOrderFeeFCFA) : null,
        serviceFeePercent: editForm.serviceFeePercent.trim() !== '' ? Number(editForm.serviceFeePercent) : null,
        commercialNotes: editForm.commercialNotes.trim(),
      };
      const res = await fetch(`/api/admin/merchants/${encodeURIComponent(editingMerchant.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storeName: editForm.storeName.trim(),
          managerName: editForm.managerName.trim(),
          fullName: editForm.managerName.trim(),
          phone: editForm.phone.trim(),
          email: editForm.email.trim(),
          storeCommune: editForm.commune.trim(),
          storeAddress: editForm.address.trim(),
          channel: editForm.channel,
          accountStatus: editForm.accountStatus,
          blockedReason: editForm.blockedReason.trim(),
          preferredRateDiscountPercent: Math.max(0, Math.min(50, Number(editForm.preferredRateDiscountPercent) || 0)),
          commercialConfig,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast(data?.error || 'Échec de mise à jour du vendeur.', 'error');
        setIsSaving(false);
        return;
      }
      showToast(`Boutique « ${editForm.storeName} » mise à jour avec succès.`, 'success');
      addAuditLog('system', `Vendeur mis à jour : ${editForm.storeName}`, `Statut : ${editForm.accountStatus}`);
      setEditingMerchant(null);
      await refreshAdminData(true);
    } catch (err: any) {
      showToast(err?.message || 'Erreur réseau', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const quickChangeStatus = async (merchant: Merchant, nextStatus: AccountLifecycleStatus) => {
    let reason = '';
    if (nextStatus === 'suspendu' || nextStatus === 'bloque') {
      reason = 'Suspension/Blocage administratif depuis le Centre de Contrôle';
    }
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/merchants/${encodeURIComponent(merchant.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountStatus: nextStatus,
          ...(reason ? { blockedReason: reason } : { blockedReason: '' }),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        showToast(`Statut de ${merchant.storeName} changé en "${nextStatus}".`, 'success');
        await refreshAdminData(true);
      } else {
        showToast(data?.error || 'Erreur changement statut', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erreur réseau', 'error');
    }
  };

  const toggleMerchantKyc = async (merchant: Merchant) => {
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const nextVerified = !merchant.isVerified;
      const res = await fetch(`/api/admin/merchants/${encodeURIComponent(merchant.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          isKycVerified: nextVerified,
          kycStatus: nextVerified ? 'valide' : 'non_soumis',
        }),
      });
      if (res.ok) {
        showToast(
          nextVerified ? `${merchant.storeName} est désormais vérifié KYC.` : `Vérification retirée pour ${merchant.storeName}.`,
          'success'
        );
        await refreshAdminData(true);
      }
    } catch {}
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600">storefront</span>
            <span>Gestion Complète des Boutiques Vendeurs ({filteredMerchants.length}/{merchants.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Supervision des comptes marchands, statuts (actif / inactif / suspendu / bloqué), conditions commerciales et chiffre d’affaires
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher boutique, gérant, tél..."
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none w-52"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-white text-slate-700 outline-none"
          >
            <option value="all">Tous statuts</option>
            <option value="actif">Actifs</option>
            <option value="inactif">Inactifs</option>
            <option value="suspendu">Suspendus</option>
            <option value="bloque">Bloqués</option>
          </select>
          {canManage && (
            <button
              type="button"
              onClick={onOpenAddMerchant}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">add_business</span>
              <span>+ Boutique</span>
            </button>
          )}
        </div>
      </div>

      {/* Merchants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredMerchants.map((merchant) => {
          const mStatus = (merchant.accountStatus || (merchant.status === 'suspendu' ? 'suspendu' : 'actif')) as AccountLifecycleStatus;
          const badge = STATUS_BADGE[mStatus] || STATUS_BADGE.actif;
          const merchantOrders = deliveries.filter(
            (d) => d.merchantId === merchant.id || (merchant.email && d.merchantEmail?.toLowerCase() === merchant.email.toLowerCase())
          );
          const deliveredOrders = merchantOrders.filter((d) => d.status === 'livree');
          const caCod = deliveredOrders.reduce((s, d) => s + (d.itemValueCOD || 0), 0);

          return (
            <div
              key={merchant.id}
              className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-extrabold text-sm text-slate-900 truncate">{merchant.storeName}</h3>
                      {merchant.isVerified && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                          ✓ KYC
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 font-medium truncate">
                      {merchant.managerName} · <span className="text-slate-400">{merchant.channel || 'WhatsApp'}</span>
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border shrink-0 ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 space-y-1 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                  <p className="truncate">📧 {merchant.email || '—'}</p>
                  <p>📞 {merchant.phone || '—'}</p>
                  <p className="truncate">📍 {merchant.commune}{merchant.address ? ` — ${merchant.address}` : ''}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-500 block font-bold">Courses</span>
                    <span className="text-sm font-black text-slate-900">{merchantOrders.length || merchant.totalOrders || 0}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-100">
                    <span className="text-[10px] text-emerald-700 block font-bold">Livrées</span>
                    <span className="text-sm font-black text-emerald-800">{deliveredOrders.length}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-blue-50/70 border border-blue-100">
                    <span className="text-[10px] text-blue-700 block font-bold">CA COD</span>
                    <span className="text-xs font-black text-blue-900">{caCod.toLocaleString('fr-FR')} F</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openDetailModal(merchant)}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xs">visibility</span>
                  <span>Fiche</span>
                </button>
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditModal(merchant)}
                      className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-xs">edit</span>
                      <span>Modifier</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMerchantKyc(merchant)}
                      className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-[11px] font-bold cursor-pointer"
                    >
                      {merchant.isVerified ? 'Retirer KYC' : 'Valider KYC'}
                    </button>
                    {mStatus === 'actif' ? (
                      <button
                        type="button"
                        onClick={() => quickChangeStatus(merchant, 'suspendu')}
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-[11px] font-bold cursor-pointer"
                      >
                        Suspendre
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => quickChangeStatus(merchant, 'actif')}
                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-[11px] font-bold cursor-pointer"
                      >
                        Activer
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => impersonateMerchant(merchant.id)}
                      className="px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[11px] font-bold cursor-pointer"
                      title="Ouvrir l'espace vendeur en Mode Directeur"
                    >
                      👑 Gérer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Supprimer définitivement la boutique ${merchant.storeName} ?`)) {
                          deleteMerchant(merchant.id);
                        }
                      }}
                      className="px-2 py-1.5 text-slate-400 hover:text-red-600 rounded-xl text-[11px] cursor-pointer ml-auto"
                      title="Supprimer la boutique"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {filteredMerchants.length === 0 && (
          <div className="col-span-full bg-white p-8 rounded-3xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
            Aucun vendeur ne correspond aux filtres sélectionnés.
          </div>
        )}
      </div>

      {/* Rich Merchant Detail Modal */}
      {detailMerchant && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDetailMerchant(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">{detailMerchant.storeName}</h3>
                <p className="text-xs text-slate-500">
                  Gérant : <strong>{detailMerchant.managerName}</strong> · {detailMerchant.email} · {detailMerchant.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailMerchant(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {isLoadingDetails ? (
              <div className="py-12 text-center text-xs text-slate-500">Chargement des données détaillées depuis Firestore Admin...</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Total Commandes</span>
                    <p className="text-lg font-black text-slate-900">{detailData?.stats?.totalOrders ?? detailMerchant.totalOrders ?? 0}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Livrées</span>
                    <p className="text-lg font-black text-emerald-800">{detailData?.stats?.deliveredOrders ?? 0}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200">
                    <span className="text-[10px] font-bold text-blue-700 uppercase">CA COD Encaissé</span>
                    <p className="text-base font-black text-blue-900">
                      {(detailData?.stats?.totalSalesCOD ?? detailData?.stats?.turnoverCODFCFA ?? 0).toLocaleString('fr-FR')} FCFA
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200">
                    <span className="text-[10px] font-bold text-purple-700 uppercase">Commissions</span>
                    <p className="text-base font-black text-purple-900">
                      {(detailData?.stats?.totalCommissions ?? detailData?.stats?.totalCommissionsFCFA ?? 0).toLocaleString('fr-FR')} FCFA
                    </p>
                  </div>
                </div>

                {/* Recent orders */}
                <div className="space-y-2">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                    Dernières expéditions ({(detailData?.orders || detailData?.deliveries || []).length})
                  </h4>
                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100">
                    {(detailData?.orders || detailData?.deliveries || []).slice(0, 15).map((d: any) => (
                      <div key={d.id} className="p-2.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{d.id}</span>
                          <span className="text-slate-500 ml-2">{d.clientName} · {d.dropoffLocation?.commune || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700">{(d.deliveryFee || 0).toLocaleString('fr-FR')} F</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{d.status}</span>
                        </div>
                      </div>
                    ))}
                    {(!detailData?.orders?.length && !detailData?.deliveries?.length) && (
                      <p className="p-4 text-center text-xs text-slate-400">Aucune commande enregistrée pour ce vendeur.</p>
                    )}
                  </div>
                </div>

                {/* Disputes & Audit logs */}
                {Array.isArray(detailData?.disputes) && detailData.disputes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-extrabold text-red-700 uppercase">Litiges associés ({detailData.disputes.length})</h4>
                    <div className="space-y-1.5">
                      {detailData.disputes.map((disp: any) => (
                        <div key={disp.id} className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs">
                          <p className="font-bold text-red-900">{disp.subject} ({disp.status})</p>
                          <p className="text-red-700">{disp.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Merchant Modal */}
      {editingMerchant && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEditingMerchant(null)}
        >
          <form
            onSubmit={handleSaveMerchant}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Modifier Boutique &amp; Conditions Commerciales</h3>
              <button type="button" onClick={() => setEditingMerchant(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nom de la boutique</label>
                <input
                  required
                  value={editForm.storeName}
                  onChange={(e) => setEditForm({ ...editForm, storeName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Responsable / Gérant</label>
                <input
                  required
                  value={editForm.managerName}
                  onChange={(e) => setEditForm({ ...editForm, managerName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">E-mail</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Téléphone</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Commune</label>
                <input
                  value={editForm.commune}
                  onChange={(e) => setEditForm({ ...editForm, commune: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Adresse physique</label>
                <input
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Statut du compte (Auth Firebase synchronisé)</label>
                <select
                  value={editForm.accountStatus}
                  onChange={(e) => setEditForm({ ...editForm, accountStatus: e.target.value as AccountLifecycleStatus })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                  <option value="suspendu">Suspendu</option>
                  <option value="bloque">Bloqué (connexion désactivée)</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Remise tarifaire vendeur (%)</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={editForm.preferredRateDiscountPercent}
                  onChange={(e) => setEditForm({ ...editForm, preferredRateDiscountPercent: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            {(editForm.accountStatus === 'suspendu' || editForm.accountStatus === 'bloque') && (
              <div className="text-xs">
                <label className="font-bold text-red-700 block mb-1">Motif de suspension / blocage *</label>
                <input
                  required
                  value={editForm.blockedReason}
                  onChange={(e) => setEditForm({ ...editForm, blockedReason: e.target.value })}
                  placeholder="Précisez le motif officiel..."
                  className="w-full px-3 py-2 border border-red-300 bg-red-50/40 rounded-xl"
                />
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <p className="text-xs font-extrabold text-slate-800">Conditions Commerciales Particulières (Optionnel — vide = tarif général)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Commission perso (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    placeholder="Défaut général"
                    value={editForm.customCommissionRatePercent}
                    onChange={(e) => setEditForm({ ...editForm, customCommissionRatePercent: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Frais fixe / course (FCFA)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={editForm.fixedOrderFeeFCFA}
                    onChange={(e) => setEditForm({ ...editForm, fixedOrderFeeFCFA: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Frais service (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    placeholder="Défaut général"
                    value={editForm.serviceFeePercent}
                    onChange={(e) => setEditForm({ ...editForm, serviceFeePercent: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-600 text-xs block mb-1">Notes commerciales internes</label>
                <textarea
                  rows={2}
                  value={editForm.commercialNotes}
                  onChange={(e) => setEditForm({ ...editForm, commercialNotes: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingMerchant(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
