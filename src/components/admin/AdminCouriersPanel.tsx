import React, { useState, useMemo } from 'react';
import {
  AccountLifecycleStatus,
  Courier,
  CourierIndividualRemunerationConfig,
} from '../../types';
import { useApp } from '../../context/AppContext';
import { calculateCourierRemuneration } from '../../utils/pricingCalculator';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  actif: { label: 'Actif', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  en_ligne: { label: 'En ligne', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  hors_ligne: { label: 'Hors ligne', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
  en_course: { label: 'En course', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  inactif: { label: 'Inactif', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
  suspendu: { label: 'Suspendu', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
  bloque: { label: 'Bloqué', cls: 'bg-red-50 text-red-700 border-red-300' },
};

export const AdminCouriersPanel: React.FC<{
  onOpenAddCourier: () => void;
}> = ({ onOpenAddCourier }) => {
  const {
    couriers,
    deliveries,
    platformConfig,
    authorizedGetIdToken,
    refreshAdminData,
    showToast,
    impersonateCourier,
    adjustCourierWallet,
    hasAdminPermission,
    deleteCourier,
    addAuditLog,
  } = useApp();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [kycFilter, setKycFilter] = useState<'all' | 'verified' | 'unverified'>('all');

  const [detailCourier, setDetailCourier] = useState<Courier | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'remuneration' | 'edit'>('overview');
  const [detailData, setDetailData] = useState<any | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Edit profile state
  const [editProfile, setEditProfile] = useState<{
    fullName: string;
    email: string;
    phone: string;
    vehicle: string;
    vehiclePlate: string;
    zone: string;
    accountStatus: AccountLifecycleStatus;
    blockedReason: string;
  }>({
    fullName: '',
    email: '',
    phone: '',
    vehicle: 'Moto 125cc',
    vehiclePlate: '',
    zone: 'Cotonou',
    accountStatus: 'actif',
    blockedReason: '',
  });

  // Individual remuneration state
  const [remunForm, setRemunForm] = useState<CourierIndividualRemunerationConfig>({
    useGeneralTariff: true,
    customPricePerKmFCFA: undefined,
    customMinEarningFCFA: undefined,
    customFixedBonusFCFA: 0,
    bonusFCFA: 0,
    malusFCFA: 0,
    malusReason: '',
    customCommissionRatePercent: undefined,
    specialConditions: '',
  });
  const [simKm, setSimKm] = useState(4);
  const [simFee, setSimFee] = useState(800);
  const [isSaving, setIsSaving] = useState(false);

  // Wallet quick adjustment
  const [walletAmount, setWalletAmount] = useState('1000');
  const [walletNote, setWalletNote] = useState('');

  const canManage = hasAdminPermission('couriers.manage');
  const canRemun = hasAdminPermission('couriers.remuneration');
  const canFinance = hasAdminPermission('finance.manage');

  const filteredCouriers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return couriers.filter((c) => {
      const effStatus = c.accountStatus || c.status;
      if (statusFilter !== 'all' && effStatus !== statusFilter) return false;
      if (kycFilter === 'verified' && !c.isKycVerified) return false;
      if (kycFilter === 'unverified' && c.isKycVerified) return false;
      if (!q) return true;
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.zone || '').toLowerCase().includes(q) ||
        (c.vehicle || '').toLowerCase().includes(q)
      );
    });
  }, [couriers, search, statusFilter, kycFilter]);

  const openCourierModal = async (courier: Courier, initialTab: 'overview' | 'remuneration' | 'edit' = 'overview') => {
    setDetailCourier(courier);
    setDetailTab(initialTab);
    setDetailData(null);
    setEditProfile({
      fullName: courier.name || '',
      email: courier.email || '',
      phone: courier.phone || '',
      vehicle: courier.vehicle || 'Moto 125cc',
      vehiclePlate: courier.vehiclePlate || '',
      zone: courier.zone || 'Cotonou',
      accountStatus: (courier.accountStatus || (courier.status === 'suspendu' ? 'suspendu' : 'actif')) as AccountLifecycleStatus,
      blockedReason: courier.blockedReason || '',
    });
    const curRemun = courier.remunerationConfig || { useGeneralTariff: true };
    setRemunForm({
      useGeneralTariff: curRemun.useGeneralTariff !== false,
      customPricePerKmFCFA: curRemun.customPricePerKmFCFA ?? platformConfig.courierRemuneration.perKmFCFA,
      customMinEarningFCFA: curRemun.customMinEarningFCFA ?? platformConfig.courierRemuneration.minEarningFCFA,
      customFixedBonusFCFA: curRemun.customFixedBonusFCFA ?? 0,
      bonusFCFA: curRemun.bonusFCFA ?? 0,
      malusFCFA: curRemun.malusFCFA ?? 0,
      malusReason: curRemun.malusReason || '',
      customCommissionRatePercent: curRemun.customCommissionRatePercent ?? undefined,
      specialConditions: curRemun.specialConditions || '',
    });

    setIsLoadingDetails(true);
    try {
      const token = await authorizedGetIdToken();
      if (token) {
        const res = await fetch(`/api/admin/couriers/${encodeURIComponent(courier.id)}/details`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          setDetailData(data);
          const serverCourier = data.courier || data.user;
          if (serverCourier?.remunerationConfig) {
            const srvRem = serverCourier.remunerationConfig as CourierIndividualRemunerationConfig;
            setRemunForm({
              useGeneralTariff: srvRem.useGeneralTariff !== false,
              customPricePerKmFCFA: srvRem.customPricePerKmFCFA ?? platformConfig.courierRemuneration.perKmFCFA,
              customMinEarningFCFA: srvRem.customMinEarningFCFA ?? platformConfig.courierRemuneration.minEarningFCFA,
              customFixedBonusFCFA: srvRem.customFixedBonusFCFA ?? 0,
              bonusFCFA: srvRem.bonusFCFA ?? 0,
              malusFCFA: srvRem.malusFCFA ?? 0,
              malusReason: srvRem.malusReason || '',
              customCommissionRatePercent: srvRem.customCommissionRatePercent ?? undefined,
              specialConditions: srvRem.specialConditions || '',
            });
          }
        }
      }
    } catch {}
    setIsLoadingDetails(false);
  };

  const handleSaveCourierProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailCourier) return;
    if ((editProfile.accountStatus === 'suspendu' || editProfile.accountStatus === 'bloque') && editProfile.blockedReason.trim().length < 3) {
      showToast('Motif requis pour suspendre ou bloquer un livreur.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/couriers/${encodeURIComponent(detailCourier.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: editProfile.fullName.trim(),
          email: editProfile.email.trim(),
          phone: editProfile.phone.trim(),
          vehicleType: editProfile.vehicle.trim(),
          vehiclePlate: editProfile.vehiclePlate.trim(),
          locationCommune: editProfile.zone.trim(),
          accountStatus: editProfile.accountStatus,
          blockedReason: editProfile.blockedReason.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast(data?.error || 'Erreur lors de la mise à jour du livreur.', 'error');
      } else {
        showToast(`Profil de ${editProfile.fullName} enregistré.`, 'success');
        addAuditLog('system', `Livreur modifié : ${editProfile.fullName}`, `Statut : ${editProfile.accountStatus}`);
        await refreshAdminData(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRemuneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailCourier) return;
    const malusVal = Number(remunForm.malusFCFA) || 0;
    if (!remunForm.useGeneralTariff && malusVal > 0 && (!remunForm.malusReason || remunForm.malusReason.trim().length < 3)) {
      showToast('Un malus nécessite obligatoirement une justification claire.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/couriers/${encodeURIComponent(detailCourier.id)}/remuneration`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          useGeneralTariff: remunForm.useGeneralTariff,
          customPricePerKmFCFA: remunForm.useGeneralTariff ? null : Number(remunForm.customPricePerKmFCFA || 0),
          customMinEarningFCFA: remunForm.useGeneralTariff ? null : Number(remunForm.customMinEarningFCFA || 0),
          customFixedBonusFCFA: Number(remunForm.customFixedBonusFCFA || 0),
          bonusFCFA: Number(remunForm.bonusFCFA || 0),
          malusFCFA: malusVal,
          malusReason: (remunForm.malusReason || '').trim(),
          customCommissionRatePercent:
            remunForm.customCommissionRatePercent !== null && remunForm.customCommissionRatePercent !== undefined
              ? Number(remunForm.customCommissionRatePercent)
              : null,
          specialConditions: (remunForm.specialConditions || '').trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast(data?.error || 'Impossible de sauvegarder la rémunération individuelle.', 'error');
      } else {
        showToast(
          remunForm.useGeneralTariff
            ? `${detailCourier.name} repassé au tarif général de la plateforme.`
            : `Rémunération personnalisée enregistrée pour ${detailCourier.name}.`,
          'success'
        );
        await refreshAdminData(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const quickStatus = async (courier: Courier, nextStatus: AccountLifecycleStatus) => {
    try {
      const token = await authorizedGetIdToken();
      if (!token) return;
      const res = await fetch(`/api/admin/couriers/${encodeURIComponent(courier.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountStatus: nextStatus,
          blockedReason:
            nextStatus === 'suspendu' || nextStatus === 'bloque'
              ? 'Décision administrative depuis le Centre de Contrôle'
              : '',
        }),
      });
      if (res.ok) {
        showToast(`Statut de ${courier.name} mis à jour : ${nextStatus}.`, 'success');
        await refreshAdminData(true);
      }
    } catch {}
  };

  const simulatedRemun = useMemo(() => {
    return calculateCourierRemuneration({
      deliveryFeeFCFA: simFee,
      distanceKm: simKm,
      courierId: detailCourier?.id,
      individualConfig: remunForm,
      generalConfig: platformConfig.courierRemuneration,
      commissionsConfig: platformConfig.commissions,
      pricingConfig: platformConfig.pricing,
    });
  }, [simFee, simKm, detailCourier?.id, remunForm, platformConfig]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-600">two_wheeler</span>
            <span>Flotte Livreurs &amp; Rémunérations ({filteredCouriers.length}/{couriers.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Supervision GPS, validation KYC, portefeuilles, suspensions et tarification individuelle par livreur
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher nom, tél, zone..."
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none w-48"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-white"
          >
            <option value="all">Tous statuts</option>
            <option value="en_ligne">En ligne</option>
            <option value="en_course">En course</option>
            <option value="hors_ligne">Hors ligne</option>
            <option value="suspendu">Suspendus</option>
            <option value="bloque">Bloqués</option>
          </select>
          <select
            value={kycFilter}
            onChange={(e) => setKycFilter(e.target.value as any)}
            className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-white"
          >
            <option value="all">Tout KYC</option>
            <option value="verified">KYC Validé</option>
            <option value="unverified">Non vérifié</option>
          </select>
          {canManage && (
            <button
              type="button"
              onClick={onOpenAddCourier}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">person_add</span>
              <span>+ Livreur</span>
            </button>
          )}
        </div>
      </div>

      {/* Couriers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCouriers.map((courier) => {
          const effStatus = courier.accountStatus || courier.status || 'hors_ligne';
          const badge = STATUS_BADGE[effStatus] || STATUS_BADGE.hors_ligne;
          const customTariffActive = courier.remunerationConfig && courier.remunerationConfig.useGeneralTariff === false;
          const courierDeliveries = deliveries.filter((d) => d.courier?.id === courier.id);
          const doneCount = courierDeliveries.filter((d) => d.status === 'livree').length;

          return (
            <div
              key={courier.id}
              className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-extrabold text-sm text-slate-900 truncate">{courier.name}</h3>
                      {courier.isKycVerified ? (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ✓ KYC
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                          KYC requis
                        </span>
                      )}
                      {customTariffActive && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
                          Tarif perso
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      🛵 {courier.vehicle} {courier.vehiclePlate ? `(${courier.vehiclePlate})` : ''} · ⭐ {(courier.rating || 5).toFixed(1)}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border shrink-0 ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 bg-slate-50 rounded-xl p-2.5 border border-slate-100 space-y-1">
                  <p className="truncate">📧 {courier.email || '—'}</p>
                  <p>📞 {courier.phone || '—'}</p>
                  <p className="truncate">
                    📍 {courier.zone || 'Cotonou'}
                    {typeof courier.locationLat === 'number' && typeof courier.locationLng === 'number' && (
                      <span className="text-slate-400 font-mono ml-1">
                        ({courier.locationLat.toFixed(4)}, {courier.locationLng.toFixed(4)})
                      </span>
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-500 block font-bold">Missions</span>
                    <span className="text-sm font-black text-slate-900">{doneCount || courier.completedDeliveries || courier.totalDeliveries || 0}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-100">
                    <span className="text-[10px] text-emerald-700 block font-bold">Solde</span>
                    <span className="text-xs font-black text-emerald-800">{(courier.walletBalanceFCFA || 0).toLocaleString('fr-FR')} F</span>
                  </div>
                  <div className="p-2 rounded-xl bg-blue-50/70 border border-blue-100">
                    <span className="text-[10px] text-blue-700 block font-bold">Tarif/km</span>
                    <span className="text-xs font-black text-blue-900">
                      {customTariffActive
                        ? `${courier.remunerationConfig?.customPricePerKmFCFA ?? platformConfig.courierRemuneration.perKmFCFA} F`
                        : 'Général'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openCourierModal(courier, 'overview')}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xs">badge</span>
                  <span>Fiche</span>
                </button>
                {canRemun && (
                  <button
                    type="button"
                    onClick={() => openCourierModal(courier, 'remuneration')}
                    className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xs">payments</span>
                    <span>Rémunération</span>
                  </button>
                )}
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => openCourierModal(courier, 'edit')}
                      className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[11px] font-bold cursor-pointer"
                    >
                      Éditer
                    </button>
                    {effStatus === 'suspendu' || effStatus === 'bloque' ? (
                      <button
                        type="button"
                        onClick={() => quickStatus(courier, 'actif')}
                        className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-[11px] font-bold cursor-pointer"
                      >
                        Activer
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => quickStatus(courier, 'suspendu')}
                        className="px-2.5 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-[11px] font-bold cursor-pointer"
                      >
                        Suspendre
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => impersonateCourier(courier.id)}
                      className="px-2 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-[11px] font-bold cursor-pointer"
                      title="Ouvrir l'espace livreur en Mode Directeur"
                    >
                      👑
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Supprimer le livreur ${courier.name} ?`)) {
                          deleteCourier(courier.id);
                        }
                      }}
                      className="px-2 py-1.5 text-slate-400 hover:text-red-600 rounded-xl text-[11px] cursor-pointer ml-auto"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {filteredCouriers.length === 0 && (
          <div className="col-span-full bg-white p-8 rounded-3xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
            Aucun livreur ne correspond à votre recherche.
          </div>
        )}
      </div>

      {/* Rich Courier Sheet Modal */}
      {detailCourier && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDetailCourier(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-5 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">{detailCourier.name}</h3>
                <p className="text-xs text-slate-500">
                  {detailCourier.email} · {detailCourier.phone} · Solde :{' '}
                  <strong className="text-emerald-700">{(detailCourier.walletBalanceFCFA || 0).toLocaleString('fr-FR')} FCFA</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailCourier(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-fit">
              <button
                type="button"
                onClick={() => setDetailTab('overview')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  detailTab === 'overview' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Synthèse &amp; Portefeuille
              </button>
              {canRemun && (
                <button
                  type="button"
                  onClick={() => setDetailTab('remuneration')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                    detailTab === 'remuneration' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Rémunération Individuelle
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => setDetailTab('edit')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                    detailTab === 'edit' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Modifier &amp; Statut
                </button>
              )}
            </div>

            {/* TAB 1: Overview */}
            {detailTab === 'overview' && (
              <div className="space-y-4">
                {isLoadingDetails ? (
                  <p className="py-8 text-center text-xs text-slate-500">Chargement de l’historique et des statistiques...</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Total Missions</span>
                        <p className="text-lg font-black text-slate-900">{detailData?.stats?.totalMissions ?? 0}</p>
                      </div>
                      <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase">Livrées</span>
                        <p className="text-lg font-black text-emerald-800">
                          {detailData?.stats?.completedDeliveries ?? detailData?.stats?.deliveredMissions ?? 0}
                        </p>
                      </div>
                      <div className="p-3 rounded-2xl bg-red-50 border border-red-200">
                        <span className="text-[10px] font-bold text-red-700 uppercase">Échecs / Annulées</span>
                        <p className="text-lg font-black text-red-800">
                          {detailData?.stats?.cancelledOrFailedDeliveries ?? detailData?.stats?.cancelledMissions ?? 0}
                        </p>
                      </div>
                      <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200">
                        <span className="text-[10px] font-bold text-blue-700 uppercase">Total Gains</span>
                        <p className="text-base font-black text-blue-900">
                          {(detailData?.stats?.totalEarningsFCFA ?? detailData?.stats?.totalFeesFCFA ?? 0).toLocaleString('fr-FR')} F
                        </p>
                      </div>
                    </div>

                    {canFinance && (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-end gap-3">
                        <div className="flex-1 text-xs">
                          <label className="font-bold text-slate-700 block mb-1">Ajustement rapide Portefeuille (FCFA)</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min={100}
                              value={walletAmount}
                              onChange={(e) => setWalletAmount(e.target.value)}
                              className="w-28 px-3 py-1.5 border border-slate-300 rounded-xl bg-white"
                            />
                            <input
                              type="text"
                              value={walletNote}
                              onChange={(e) => setWalletNote(e.target.value)}
                              placeholder="Motif (prime, régularisation...)"
                              className="flex-1 px-3 py-1.5 border border-slate-300 rounded-xl bg-white"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => adjustCourierWallet(detailCourier.id, Number(walletAmount) || 0, 'credit', walletNote || 'Crédit admin')}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                          >
                            + Créditer
                          </button>
                          <button
                            type="button"
                            onClick={() => adjustCourierWallet(detailCourier.id, Number(walletAmount) || 0, 'debit', walletNote || 'Débit admin')}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                          >
                            - Débiter
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h4 className="text-xs font-extrabold text-slate-800 uppercase">Dernières courses du livreur</h4>
                      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100">
                        {(detailData?.orders || detailData?.deliveries || []).slice(0, 10).map((d: any) => (
                          <div key={d.id} className="p-2.5 flex items-center justify-between text-xs">
                            <span>
                              <strong>{d.id}</strong> — {d.dropoffLocation?.commune || 'Cotonou'}
                            </span>
                            <span className="font-bold">{(d.deliveryFee || 0).toLocaleString('fr-FR')} F · {d.status}</span>
                          </div>
                        ))}
                        {(!detailData?.orders?.length && !detailData?.deliveries?.length) && (
                          <p className="p-4 text-center text-xs text-slate-400">Aucune course enregistrée.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB 2: Individual Remuneration */}
            {detailTab === 'remuneration' && (
              <form onSubmit={handleSaveRemuneration} className="space-y-4">
                <div className="p-4 rounded-2xl border-2 border-purple-200 bg-purple-50/50 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-extrabold text-purple-950">Utiliser le tarif général de la plateforme</p>
                    <p className="text-xs text-purple-700">
                      Si activé, ce livreur suit exactement les règles globales ({platformConfig.courierRemuneration.courierSharePercent}% ou{' '}
                      {platformConfig.courierRemuneration.perKmFCFA} FCFA/km).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemunForm((prev) => ({ ...prev, useGeneralTariff: !prev.useGeneralTariff }))}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                      remunForm.useGeneralTariff
                        ? 'bg-emerald-600 text-white'
                        : 'bg-purple-700 text-white'
                    }`}
                  >
                    {remunForm.useGeneralTariff ? 'OUI (Tarif Général)' : 'NON (Tarif Individuel)'}
                  </button>
                </div>

                {!remunForm.useGeneralTariff && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Tarif personnalisé / km (FCFA)</label>
                      <input
                        type="number"
                        min={0}
                        value={remunForm.customPricePerKmFCFA ?? ''}
                        onChange={(e) => setRemunForm({ ...remunForm, customPricePerKmFCFA: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Gain minimum garanti / course (FCFA)</label>
                      <input
                        type="number"
                        min={0}
                        value={remunForm.customMinEarningFCFA ?? ''}
                        onChange={(e) => setRemunForm({ ...remunForm, customMinEarningFCFA: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Prime fixe / course (FCFA)</label>
                      <input
                        type="number"
                        min={0}
                        value={remunForm.customFixedBonusFCFA ?? 0}
                        onChange={(e) => setRemunForm({ ...remunForm, customFixedBonusFCFA: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Commission spécifique plateforme (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        placeholder="Laisser vide pour défaut"
                        value={remunForm.customCommissionRatePercent ?? ''}
                        onChange={(e) =>
                          setRemunForm({
                            ...remunForm,
                            customCommissionRatePercent: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-emerald-700 block mb-1">Bonus exceptionnel (FCFA)</label>
                      <input
                        type="number"
                        min={0}
                        value={remunForm.bonusFCFA ?? 0}
                        onChange={(e) => setRemunForm({ ...remunForm, bonusFCFA: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-emerald-300 rounded-xl bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-red-700 block mb-1">Malus (FCFA)</label>
                      <input
                        type="number"
                        min={0}
                        value={remunForm.malusFCFA ?? 0}
                        onChange={(e) => setRemunForm({ ...remunForm, malusFCFA: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-red-300 rounded-xl bg-white"
                      />
                    </div>
                    {(Number(remunForm.malusFCFA) || 0) > 0 && (
                      <div className="sm:col-span-2">
                        <label className="font-bold text-red-700 block mb-1">Justification obligatoire du malus *</label>
                        <input
                          required
                          value={remunForm.malusReason || ''}
                          onChange={(e) => setRemunForm({ ...remunForm, malusReason: e.target.value })}
                          placeholder="Ex: Retard répété ou non-respect procédure POD"
                          className="w-full px-3 py-2 border border-red-300 bg-red-50/40 rounded-xl"
                        />
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className="font-bold text-slate-700 block mb-1">Conditions particulières / notes</label>
                      <textarea
                        rows={2}
                        value={remunForm.specialConditions || ''}
                        onChange={(e) => setRemunForm({ ...remunForm, specialConditions: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* Simulator */}
                <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-amber-300">Simulateur de Gain Net Livreur</span>
                    <div className="flex items-center gap-2 text-xs">
                      <label>Dist (km):</label>
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={simKm}
                        onChange={(e) => setSimKm(Number(e.target.value) || 1)}
                        className="w-16 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white"
                      />
                      <label>Tarif client:</label>
                      <input
                        type="number"
                        min={100}
                        step={50}
                        value={simFee}
                        onChange={(e) => setSimFee(Number(e.target.value) || 100)}
                        className="w-20 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-slate-800">
                      <span className="text-slate-400 block">Base calculée</span>
                      <strong>{simulatedRemun.courierGrossEarningFCFA.toLocaleString('fr-FR')} F</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-800">
                      <span className="text-slate-400 block">Commission ({simulatedRemun.platformCommissionRatePercent}%)</span>
                      <strong>{simulatedRemun.platformCommissionFCFA.toLocaleString('fr-FR')} F</strong>
                    </div>
                    <div className="p-2 rounded-xl bg-emerald-600/30 border border-emerald-500/40">
                      <span className="text-emerald-200 block">Net Livreur</span>
                      <strong className="text-emerald-300 text-sm">{simulatedRemun.netCourierEarningFCFA.toLocaleString('fr-FR')} F</strong>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailCourier(null)}
                    className="px-4 py-2 text-xs font-bold bg-slate-100 text-slate-700 rounded-xl cursor-pointer"
                  >
                    Fermer
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 text-xs font-extrabold bg-purple-600 hover:bg-purple-700 text-white rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Sauvegarde...' : 'Enregistrer la rémunération'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: Edit Profile */}
            {detailTab === 'edit' && (
              <form onSubmit={handleSaveCourierProfile} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Nom complet</label>
                    <input
                      required
                      value={editProfile.fullName}
                      onChange={(e) => setEditProfile({ ...editProfile, fullName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Téléphone</label>
                    <input
                      value={editProfile.phone}
                      onChange={(e) => setEditProfile({ ...editProfile, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">E-mail</label>
                    <input
                      type="email"
                      value={editProfile.email}
                      onChange={(e) => setEditProfile({ ...editProfile, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Zone principale</label>
                    <input
                      value={editProfile.zone}
                      onChange={(e) => setEditProfile({ ...editProfile, zone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Type de véhicule</label>
                    <input
                      value={editProfile.vehicle}
                      onChange={(e) => setEditProfile({ ...editProfile, vehicle: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Immatriculation</label>
                    <input
                      value={editProfile.vehiclePlate}
                      onChange={(e) => setEditProfile({ ...editProfile, vehiclePlate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Statut du compte</label>
                    <select
                      value={editProfile.accountStatus}
                      onChange={(e) => setEditProfile({ ...editProfile, accountStatus: e.target.value as AccountLifecycleStatus })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                    >
                      <option value="actif">Actif</option>
                      <option value="inactif">Inactif</option>
                      <option value="suspendu">Suspendu</option>
                      <option value="bloque">Bloqué (Auth Firebase désactivé)</option>
                    </select>
                  </div>
                </div>
                {(editProfile.accountStatus === 'suspendu' || editProfile.accountStatus === 'bloque') && (
                  <div>
                    <label className="font-bold text-red-700 block mb-1">Motif officiel *</label>
                    <input
                      required
                      value={editProfile.blockedReason}
                      onChange={(e) => setEditProfile({ ...editProfile, blockedReason: e.target.value })}
                      className="w-full px-3 py-2 border border-red-300 bg-red-50/40 rounded-xl"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Mise à jour...' : 'Sauvegarder le profil'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
