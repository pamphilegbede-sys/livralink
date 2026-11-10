import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { KYCUserRequest } from '../../types';

export const BENIN_VEHICLE_OPTIONS = [
  'Moto Haujue 115 / 125cc',
  'Moto Bajaj Boxer 100 / 125cc',
  'Moto TVS XL / HLX 125cc',
  'Moto Dayang / Sanili / Lifan 125cc',
  'Moto Kasea / Wave / Dream 110cc',
  'Moto Électrique / Scooter Moped',
  'Tricycle / Keke Napep (3 roues)',
  'Voiture Berline / Compacte (Toyota, Hyundai, Nissan)',
  'Voiture SUV / Break (Toyota, Suzuki, Kia)',
  'Fourgonnette / Camionnette de livraison (Peugeot, HiAce)',
  'Vélo / Deux-roues non motorisé',
  'Autre engin (préciser)',
];

interface KYCSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KYCSubmissionModal: React.FC<KYCSubmissionModalProps> = ({ isOpen, onClose }) => {
  const {
    userProfile,
    courierSettings,
    selectedCourier,
    kycRequests,
    submitKYCRequest,
    approveKYC,
    showToast,
  } = useApp();

  const activeCourierName =
    userProfile?.fullName || courierSettings.fullName || selectedCourier?.name || '';
  const activeCourierPhone =
    userProfile?.phone || courierSettings.phone || selectedCourier?.phone || '';
  const activeCourierId = userProfile?.uid || selectedCourier?.id || 'c-awa';

  // Find existing KYC submission for this courier
  const existingKyc = kycRequests.find(
    (k) =>
      k.courierId === activeCourierId ||
      (activeCourierName && k.fullName.toLowerCase() === activeCourierName.toLowerCase()) ||
      (activeCourierPhone && k.phone === activeCourierPhone)
  );

  // Initialize Name split
  const nameParts = (existingKyc?.fullName || activeCourierName || '').trim().split(' ');
  const defaultLastName = existingKyc?.lastName || nameParts[0] || '';
  const defaultFirstName = existingKyc?.firstName || nameParts.slice(1).join(' ') || '';

  const [lastName, setLastName] = useState(defaultLastName);
  const [firstName, setFirstName] = useState(defaultFirstName);
  const [phone, setPhone] = useState(existingKyc?.phone || activeCourierPhone || '');
  const [idType, setIdType] = useState<'CIP' | 'CNI' | 'PASSPORT'>(existingKyc?.idType || 'CIP');
  const [idNumber, setIdNumber] = useState(existingKyc?.idNumber || '');
  const [ifuNumber, setIfuNumber] = useState(existingKyc?.ifuNumber || '');

  // Vehicle Selection logic
  const existingVehicle = existingKyc?.vehicleType || '';
  const isKnownVehicle = BENIN_VEHICLE_OPTIONS.includes(existingVehicle);

  const [vehicleSelect, setVehicleSelect] = useState<string>(
    existingVehicle ? (isKnownVehicle ? existingVehicle : 'Autre engin (préciser)') : BENIN_VEHICLE_OPTIONS[0]
  );
  const [customVehicle, setCustomVehicle] = useState<string>(
    existingVehicle && !isKnownVehicle ? existingVehicle : ''
  );

  const [vehiclePlate, setVehiclePlate] = useState(existingKyc?.vehiclePlate || '');
  const [operatingZone, setOperatingZone] = useState(
    existingKyc?.operatingZone || 'Cotonou - Littoral (Haie Vive, Cadjehoun, Akpakpa)'
  );
  const [hasInsurance, setHasInsurance] = useState(true);
  const [hasAgreedTerms, setHasAgreedTerms] = useState(true);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    existingKyc?.documentPhotoUrl || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!lastName && activeCourierName) {
      const parts = activeCourierName.trim().split(' ');
      setLastName(parts[0] || '');
      setFirstName(parts.slice(1).join(' ') || '');
    }
    if (!phone && activeCourierPhone) setPhone(activeCourierPhone);
  }, [activeCourierName, activeCourierPhone]);

  if (!isOpen) return null;

  const currentStatus = existingKyc?.status || (selectedCourier?.isKycVerified ? 'valide' : 'non_soumis');

  const handleSimulatePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
        showToast('Photo de la pièce d\'identité importée avec succès !', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!lastName.trim() || !firstName.trim()) {
      showToast('Veuillez renseigner votre Nom et vos Prénoms séparément.', 'error');
      return;
    }

    if (!idNumber.trim()) {
      showToast('Veuillez renseigner le numéro de votre pièce d\'identité.', 'error');
      return;
    }

    const finalVehicleType =
      vehicleSelect === 'Autre engin (préciser)'
        ? customVehicle.trim() || 'Moto / Engin'
        : vehicleSelect;

    if (!finalVehicleType.trim()) {
      showToast('Veuillez préciser votre type d\'engin ou véhicule.', 'error');
      return;
    }

    if (!hasAgreedTerms) {
      showToast('Veuillez accepter les conditions de vérification KYC.', 'error');
      return;
    }

    setIsSubmitting(true);

    const fullFormattedName = `${lastName.trim()} ${firstName.trim()}`.trim();

    const newKycData: Partial<KYCUserRequest> = {
      courierId: activeCourierId,
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      fullName: fullFormattedName,
      phone: phone.trim(),
      role: 'coursier',
      vehicleType: finalVehicleType,
      vehiclePlate: vehiclePlate.trim(),
      idType,
      idNumber: idNumber.trim(),
      ifuNumber: ifuNumber.trim(),
      operatingZone: operatingZone.trim(),
      documentPhotoUrl:
        photoPreview || 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop&q=60',
      documents: {
        cni: true,
        permis: true,
        assurance: hasInsurance,
      },
    };

    submitKYCRequest(newKycData);
    setIsSubmitting(false);
    onClose();
  };

  const handleInstantAdminValidation = () => {
    const fullFormattedName = `${lastName.trim() || 'Nom'} ${firstName.trim() || 'Prénom'}`.trim();
    const finalVehicleType =
      vehicleSelect === 'Autre engin (préciser)'
        ? customVehicle.trim() || 'Moto / Engin'
        : vehicleSelect;

    if (existingKyc) {
      approveKYC(existingKyc.id);
    } else {
      const req = submitKYCRequest({
        courierId: activeCourierId,
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        fullName: fullFormattedName,
        phone: phone.trim(),
        role: 'coursier',
        vehicleType: finalVehicleType,
        vehiclePlate: vehiclePlate.trim(),
        idType,
        idNumber: idNumber.trim() || 'BJ-KYC-TEMP',
        operatingZone,
        documents: { cni: true, permis: true, assurance: true },
      });
      if (req?.id) {
        approveKYC(req.id);
      }
    }
    showToast('🎉 Compte validé avec succès par le contrôle KYC ! Vous pouvez maintenant passer en ligne.', 'success');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
              <span className="material-symbols-outlined text-2xl">verified_user</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Contrôle &amp; Accréditation KYC Livreur
                </h2>
                {currentStatus === 'valide' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    ✓ Validé &amp; Autorisé
                  </span>
                )}
                {currentStatus === 'en_attente' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    ⏳ En cours d'examen
                  </span>
                )}
                {currentStatus === 'refuse' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                    ✕ Rejeté
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Vérification obligatoire de votre identité avant de démarrer l'activité et recevoir des livraisons.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            title="Fermer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Status Callout Banner */}
        <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 shrink-0">
          {currentStatus === 'valide' ? (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs">
              <span className="material-symbols-outlined text-emerald-600 text-2xl shrink-0">check_circle</span>
              <div>
                <p className="font-bold">Votre dossier KYC est validé et accrédité !</p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                  Vous êtes pleinement autorisé à démarrer vos livraisons, passer en statut « En ligne » et accepter des courses des vendeurs.
                </p>
              </div>
            </div>
          ) : currentStatus === 'en_attente' ? (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 text-xs">
              <span className="material-symbols-outlined text-amber-600 text-2xl shrink-0 animate-spin">sync</span>
              <div className="flex-1">
                <p className="font-bold">Dossier KYC en cours d'examen par les superviseurs</p>
                <p className="text-[11px] text-amber-900 dark:text-amber-300 mt-0.5">
                  Votre dossier déposé est en cours de contrôle par l'administrateur.
                </p>
              </div>
              <button
                type="button"
                onClick={handleInstantAdminValidation}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs shrink-0 cursor-pointer"
              >
                ⚡ Valider maintenant (Test)
              </button>
            </div>
          ) : currentStatus === 'refuse' ? (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-red-100/80 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-950 dark:text-red-200 text-xs">
              <span className="material-symbols-outlined text-red-600 text-2xl shrink-0">error</span>
              <div>
                <p className="font-bold">Votre dossier KYC a été refusé</p>
                <p className="text-[11px] text-red-900 dark:text-red-300 mt-0.5">
                  Motif : {existingKyc?.rejectionReason || 'Documents illisibles ou informations non conformes. Veuillez re-soumettre des photos nettes de votre pièce.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-blue-100/70 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs">
              <span className="material-symbols-outlined text-blue-600 text-2xl shrink-0">shield</span>
              <div>
                <p className="font-bold">Étape préalable obligatoire avant vos premières courses</p>
                <p className="text-[11px] text-blue-800 dark:text-blue-300 mt-0.5">
                  Conformément aux directives de sécurité LivraLink au Bénin, renseignez vos pièces d'identité (CIP, CNI biométrique ou permis) pour activer votre compte coursier.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* KYC Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar text-xs">
          {/* SEPARATE NOM ET PRÉNOMS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Nom de famille (tel qu'indiqué sur la pièce) *
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="ex: GBÉDÉ"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Prénom(s) (tels qu'indiqués sur la pièce) *
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="ex: Pamphile Kodjo"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-emerald-500 capitalize"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Phone */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Numéro de téléphone (MoMo / WhatsApp) *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="ex: +229 97 00 00 00"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Operating Zone */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Zone d'activité principale *
              </label>
              <input
                type="text"
                required
                value={operatingZone}
                onChange={(e) => setOperatingZone(e.target.value)}
                placeholder="ex: Cotonou, Abomey-Calavi, Porto-Novo, Parakou"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* ID Type */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Type de pièce d'identité *
              </label>
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value as any)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="CIP">CIP (Certificat d'Identification Personnelle)</option>
                <option value="CNI">CNI Biométrique Béninoise</option>
                <option value="PASSPORT">Passeport CEDEAO / Bénin</option>
              </select>
            </div>

            {/* ID Number (NO PRE-FILL DEFAULT) */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Numéro de la pièce (NPI / CNI) *
              </label>
              <input
                type="text"
                required
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="Saisissez votre numéro de pièce"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* IFU Number (NO PRE-FILL DEFAULT) */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Numéro IFU (optionnel)
              </label>
              <input
                type="text"
                value={ifuNumber}
                onChange={(e) => setIfuNumber(e.target.value)}
                placeholder="Saisissez vos 13 chiffres IFU"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* BENIN VEHICLE / ENGIN SELECTION */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Type d'engin / Véhicule au Bénin *
                </label>
                <select
                  value={vehicleSelect}
                  onChange={(e) => setVehicleSelect(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {BENIN_VEHICLE_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vehicle Plate (NO PRE-FILL DEFAULT) */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Plaque d'immatriculation *
                </label>
                <input
                  type="text"
                  required
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  placeholder="ex: BJ-8492-RB"
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                />
              </div>
            </div>

            {/* Custom vehicle input field if "Autre engin (préciser)" is selected */}
            {vehicleSelect === 'Autre engin (préciser)' && (
              <div className="animate-in fade-in duration-200 pt-1">
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Saisissez le type ou modèle exact de votre engin *
                </label>
                <input
                  type="text"
                  required
                  value={customVehicle}
                  onChange={(e) => setCustomVehicle(e.target.value)}
                  placeholder="ex: Moto Tricycle Spéciale, Scooter Honda Dio 110cc, etc."
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}
          </div>

          {/* Photo Upload Simulation / Preview */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-emerald-600 text-sm">badge</span>
                <span>Photo de la pièce d'identité (Recto / Verso) *</span>
              </span>
              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                Document Requis
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {photoPreview ? (
                <div className="relative w-full sm:w-48 h-32 rounded-xl overflow-hidden border-2 border-emerald-500 shadow-xs shrink-0 bg-slate-100">
                  <img
                    src={photoPreview}
                    alt="Aperçu pièce d'identité"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-bold">
                    ✓ Chargée
                  </span>
                </div>
              ) : (
                <div className="w-full sm:w-48 h-32 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 shrink-0">
                  <span className="material-symbols-outlined text-2xl">add_photo_alternate</span>
                  <span className="text-[10px] mt-1">Photo requise</span>
                </div>
              )}

              <div className="space-y-2 flex-1 w-full">
                <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                  Prenez une photo nette et lisible de votre pièce d'identité (CIP, CNI ou permis). Les 4 coins du document doivent être visibles.
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <label className="px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 rounded-xl text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer shadow-2xs transition-colors inline-flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">upload_file</span>
                    <span>Prendre / Télécharger la photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSimulatePhotoUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setPhotoPreview('https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop&q=60');
                      showToast('Exemple de pièce CIP chargé.', 'info');
                    }}
                    className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl font-bold text-xs cursor-pointer"
                  >
                    Spécimen de test
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2 pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hasInsurance}
                onChange={(e) => setHasInsurance(e.target.checked)}
                className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                Mon engin / véhicule dispose d'une assurance circulation valide au Bénin.
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hasAgreedTerms}
                onChange={(e) => setHasAgreedTerms(e.target.checked)}
                className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                Je certifie sur l'honneur l'exactitude des pièces fournies et accepte le contrôle d'accréditation LivraLink.
              </span>
            </label>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleInstantAdminValidation}
              className="text-emerald-700 dark:text-emerald-400 hover:underline font-bold text-xs flex items-center gap-1 cursor-pointer"
              title="Valider immédiatement en mode simulation pour débloquer les livraisons"
            >
              <span className="material-symbols-outlined text-sm">bolt</span>
              <span>Validation rapide (Test)</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">send</span>
                <span>{currentStatus === 'en_attente' ? 'Mettre à jour mon dossier' : 'Soumettre mon dossier KYC'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
