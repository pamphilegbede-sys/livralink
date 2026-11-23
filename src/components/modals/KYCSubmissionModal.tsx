import React, { useState, useEffect, useRef } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../../firebase/config';
import { useApp } from '../../context/AppContext';
import {
  KYCUserRequest,
  KycDocumentSlotKey,
  KycStorageDocType,
} from '../../types';
import {
  UploadedKYCDocumentResult,
  cleanupOrphanKYCDocument,
  fetchAuthorizedKYCDocumentBlob,
  formatFileSizeFr,
  isAllowedKycMimeType,
  normalizeMimeType,
} from '../../firebase/storageService';

import {
  KYC_ACTIVE_DOCUMENT_SLOTS,
  KycFormSlotDescriptor,
  getMissingRequiredKycSlots,
} from '../../utils/kycSlots';

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

const KYC_DOCUMENT_SLOTS: KycFormSlotDescriptor[] = KYC_ACTIVE_DOCUMENT_SLOTS;

interface KycSlotUiState {
  file: File | null;
  previewUrl: string | null;
  originalFileName: string;
  mimeType: string;
  size: number | null;
  uploadedAsset: UploadedKYCDocumentResult | null;
  isLoadingExisting: boolean;
  uploadStatus: 'idle' | 'ready' | 'uploading' | 'uploaded' | 'error';
  progress: number;
  error: string | null;
}

const createEmptySlotState = (): KycSlotUiState => ({
  file: null,
  previewUrl: null,
  originalFileName: '',
  mimeType: '',
  size: null,
  uploadedAsset: null,
  isLoadingExisting: false,
  uploadStatus: 'idle',
  progress: 0,
  error: null,
});

const createInitialSlotsState = (): Record<KycDocumentSlotKey, KycSlotUiState> => ({
  idFront: createEmptySlotState(),
  idBack: createEmptySlotState(),
  drivingLicenseFront: createEmptySlotState(),
  drivingLicenseBack: createEmptySlotState(),
});

const formatMimeBadge = (mime?: string, fileName?: string): string => {
  const norm = normalizeMimeType(mime, fileName);
  if (norm === 'application/pdf') return 'PDF';
  if (norm === 'image/png') return 'PNG';
  if (norm === 'image/webp') return 'WebP';
  if (norm === 'image/jpeg') return 'JPG';
  return norm ? norm.toUpperCase() : 'FICHIER';
};

interface KYCSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KYCSubmissionModal: React.FC<KYCSubmissionModalProps> = ({ isOpen, onClose }) => {
  const {
    userProfile,
    firebaseUser,
    selectedCourier,
    kycRequests,
    submitKYCRequest,
    showToast,
  } = useApp();

  const activeCourierId = userProfile?.uid || firebaseUser?.uid || '';

  // Strict UID matching only (never match by name or phone)
  const existingKyc = activeCourierId
    ? kycRequests.find((k) => k.courierId === activeCourierId || k.id === activeCourierId)
    : undefined;

  const isSelectedCourierSelf = Boolean(activeCourierId && selectedCourier?.id === activeCourierId);
  const currentStatus: 'non_soumis' | 'en_attente' | 'valide' | 'refuse' =
    existingKyc?.status ||
    userProfile?.kycStatus ||
    (isSelectedCourierSelf && selectedCourier?.isKycVerified ? 'valide' : 'non_soumis');

  const isSubmissionLocked = currentStatus === 'en_attente' || currentStatus === 'valide';

  const [emailVerified, setEmailVerified] = useState<boolean>(
    Boolean(auth.currentUser?.emailVerified ?? firebaseUser?.emailVerified)
  );
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);

  const [lastName, setLastName] = useState(existingKyc?.lastName || '');
  const [firstName, setFirstName] = useState(existingKyc?.firstName || '');
  const [phone, setPhone] = useState(existingKyc?.phone || '');
  const [operatingZone, setOperatingZone] = useState(existingKyc?.operatingZone || '');

  const [npi, setNpi] = useState(existingKyc?.npi || '');
  const [idType, setIdType] = useState<'CIP' | 'CNI' | 'PASSPORT'>(existingKyc?.idType || 'CIP');
  const [idNumber, setIdNumber] = useState(existingKyc?.idNumber || '');
  const [ifuNumber, setIfuNumber] = useState(existingKyc?.ifuNumber || '');

  const existingVehicle = existingKyc?.vehicleType || '';
  const isKnownVehicle = BENIN_VEHICLE_OPTIONS.includes(existingVehicle);

  const [vehicleSelect, setVehicleSelect] = useState<string>(
    existingVehicle ? (isKnownVehicle ? existingVehicle : 'Autre engin (préciser)') : BENIN_VEHICLE_OPTIONS[0]
  );
  const [customVehicle, setCustomVehicle] = useState<string>(
    existingVehicle && !isKnownVehicle ? existingVehicle : ''
  );

  const [vehiclePlate, setVehiclePlate] = useState(existingKyc?.vehiclePlate || '');
  const [hasAgreedTerms, setHasAgreedTerms] = useState(true);

  const [slots, setSlots] = useState<Record<KycDocumentSlotKey, KycSlotUiState>>(createInitialSlotsState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const slotObjectUrlsRef = useRef<Partial<Record<KycDocumentSlotKey, string>>>({});
  const sessionUploadedPathsRef = useRef<Set<string>>(new Set());
  const replacedSavedPathsRef = useRef<Set<string>>(new Set());
  const uploadAbortRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef<boolean>(false);

  const revokeSlotObjectUrl = (slotKey: KycDocumentSlotKey) => {
    const existingUrl = slotObjectUrlsRef.current[slotKey];
    if (existingUrl && existingUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(existingUrl);
      } catch {}
    }
    delete slotObjectUrlsRef.current[slotKey];
  };

  const revokeAllSlotObjectUrls = () => {
    (Object.keys(slotObjectUrlsRef.current) as KycDocumentSlotKey[]).forEach((key) => {
      revokeSlotObjectUrl(key);
    });
  };

  useEffect(() => {
    return () => {
      try {
        uploadAbortRef.current?.abort();
      } catch {}
      revokeAllSlotObjectUrls();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const currentVerified = Boolean(auth.currentUser?.emailVerified ?? firebaseUser?.emailVerified);
    setEmailVerified(currentVerified);

    let cancelled = false;
    if (!currentVerified && auth.currentUser && typeof auth.currentUser.reload === 'function') {
      auth.currentUser
        .reload()
        .then(async () => {
          if (cancelled || !auth.currentUser) return;
          if (auth.currentUser.emailVerified) {
            await auth.currentUser.getIdToken(true).catch(() => {});
            if (!cancelled) {
              setEmailVerified(true);
            }
          }
        })
        .catch(() => {});
    }

    setLastName(existingKyc?.lastName || '');
    setFirstName(existingKyc?.firstName || '');
    setPhone(existingKyc?.phone || '');
    setOperatingZone(existingKyc?.operatingZone || '');
    setNpi(existingKyc?.npi || '');
    setIdType(existingKyc?.idType || 'CIP');
    setIdNumber(existingKyc?.idNumber || '');
    setIfuNumber(existingKyc?.ifuNumber || '');

    const vType = existingKyc?.vehicleType || '';
    const known = BENIN_VEHICLE_OPTIONS.includes(vType);
    setVehicleSelect(vType ? (known ? vType : 'Autre engin (préciser)') : BENIN_VEHICLE_OPTIONS[0]);
    setCustomVehicle(vType && !known ? vType : '');
    setVehiclePlate(existingKyc?.vehiclePlate || '');
    setSubmitError(null);
    setUploadProgress(null);

    revokeAllSlotObjectUrls();
    sessionUploadedPathsRef.current.clear();
    replacedSavedPathsRef.current.clear();

    const nextSlots = createInitialSlotsState();
    const docsToFetch: Array<{
      slotKey: KycDocumentSlotKey;
      docType: KycStorageDocType;
      storagePath?: string;
      legacyUrl?: string;
      fileName?: string;
      mimeType?: string;
      size?: number;
      uploadedAt?: string;
    }> = [];

    for (const def of KYC_DOCUMENT_SLOTS) {
      const existingSlotMeta = existingKyc?.documents?.[def.slotKey];
      if (existingSlotMeta && existingSlotMeta.uploaded !== false && existingSlotMeta.storagePath) {
        nextSlots[def.slotKey] = {
          file: null,
          previewUrl: null,
          originalFileName: existingSlotMeta.originalFileName || existingSlotMeta.fileName || '',
          mimeType: existingSlotMeta.mimeType || '',
          size: existingSlotMeta.size ?? null,
          uploadedAsset: {
            storagePath: existingSlotMeta.storagePath,
            docType: existingSlotMeta.docType || def.docType,
            contentType: existingSlotMeta.mimeType || 'image/jpeg',
            fileName: existingSlotMeta.fileName || existingSlotMeta.storagePath.split('/').pop() || `${def.docType}.jpg`,
            originalFileName: existingSlotMeta.originalFileName,
            size: existingSlotMeta.size || 0,
            uploadedAt: existingSlotMeta.uploadedAt || '',
          },
          isLoadingExisting: true,
          uploadStatus: 'uploaded',
          progress: 100,
          error: null,
        };
        docsToFetch.push({
          slotKey: def.slotKey,
          docType: def.docType,
          storagePath: existingSlotMeta.storagePath,
          fileName: existingSlotMeta.originalFileName || existingSlotMeta.fileName,
          mimeType: existingSlotMeta.mimeType,
          size: existingSlotMeta.size,
          uploadedAt: existingSlotMeta.uploadedAt,
        });
      } else if (
        def.slotKey === 'idFront' &&
        !existingKyc?.documents?.idFront &&
        (existingKyc?.documentStoragePath || existingKyc?.documentPhotoUrl)
      ) {
        // Rétrocompatibilité lecture pour un ancien dossier mono-fichier
        nextSlots.idFront = {
          file: null,
          previewUrl: null,
          originalFileName: existingKyc.documentFileName || 'justificatif_existant',
          mimeType: existingKyc.documentMimeType || '',
          size: null,
          uploadedAsset: existingKyc.documentStoragePath
            ? {
                storagePath: existingKyc.documentStoragePath,
                docType: 'id_front',
                contentType: existingKyc.documentMimeType || 'image/jpeg',
                fileName: existingKyc.documentFileName || 'justificatif_existant',
                originalFileName: existingKyc.documentFileName,
                size: 0,
                uploadedAt: existingKyc.submittedAt || '',
              }
            : null,
          isLoadingExisting: true,
          uploadStatus: existingKyc.documentStoragePath ? 'uploaded' : 'idle',
          progress: existingKyc.documentStoragePath ? 100 : 0,
          error: null,
        };
        docsToFetch.push({
          slotKey: 'idFront',
          docType: 'id_front',
          storagePath: existingKyc.documentStoragePath,
          legacyUrl: existingKyc.documentPhotoUrl,
          fileName: existingKyc.documentFileName,
          mimeType: existingKyc.documentMimeType,
        });
      }
    }

    setSlots(nextSlots);

    docsToFetch.forEach((entry) => {
      fetchAuthorizedKYCDocumentBlob({
        storagePath: entry.storagePath,
        legacyUrl: entry.legacyUrl,
      })
        .then(({ blob, mimeType, fileName }) => {
          if (cancelled) return;
          revokeSlotObjectUrl(entry.slotKey);
          const objUrl = URL.createObjectURL(blob);
          slotObjectUrlsRef.current[entry.slotKey] = objUrl;
          setSlots((prev) => ({
            ...prev,
            [entry.slotKey]: {
              ...prev[entry.slotKey],
              previewUrl: objUrl,
              mimeType: mimeType || prev[entry.slotKey].mimeType,
              originalFileName: prev[entry.slotKey].originalFileName || fileName,
              size: prev[entry.slotKey].size || blob.size || null,
              isLoadingExisting: false,
            },
          }));
        })
        .catch(() => {
          if (cancelled) return;
          setSlots((prev) => ({
            ...prev,
            [entry.slotKey]: {
              ...prev[entry.slotKey],
              isLoadingExisting: false,
            },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    existingKyc?.id,
    existingKyc?.status,
    existingKyc?.documentStoragePath,
    existingKyc?.documentPhotoUrl,
    firebaseUser?.emailVerified,
  ]);

  if (!isOpen) return null;

  const handleCloseModal = () => {
    if (uploadAbortRef.current) {
      try {
        uploadAbortRef.current.abort();
      } catch {}
      uploadAbortRef.current = null;
    }
    // Nettoyer uniquement les fichiers uploadés durant cette session non finalisée
    for (const tempPath of sessionUploadedPathsRef.current) {
      void cleanupOrphanKYCDocument(tempPath);
    }
    sessionUploadedPathsRef.current.clear();
    replacedSavedPathsRef.current.clear();
    revokeAllSlotObjectUrls();
    setSubmitError(null);
    setUploadProgress(null);
    onClose();
  };

  const handleCancelOngoingUpload = () => {
    if (uploadAbortRef.current) {
      try {
        uploadAbortRef.current.abort();
      } catch {}
      uploadAbortRef.current = null;
    }
  };

  const handleResendVerificationEmail = async () => {
    if (!auth.currentUser) {
      showToast('Session Firebase requise pour renvoyer le lien de vérification.', 'error');
      return;
    }
    setIsResendingEmail(true);
    try {
      await sendEmailVerification(auth.currentUser);
      showToast('E-mail de vérification envoyé. Consultez votre boîte de réception (et spams).', 'success');
    } catch (err: any) {
      showToast(err?.message || "Impossible d'envoyer l'e-mail de vérification pour le moment.", 'error');
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleRefreshVerificationStatus = async () => {
    if (!auth.currentUser) {
      showToast('Session Firebase introuvable.', 'error');
      return;
    }
    setIsCheckingEmail(true);
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const verified = Boolean(auth.currentUser.emailVerified);
      setEmailVerified(verified);
      if (verified) {
        setSubmitError(null);
        showToast('Adresse e-mail vérifiée ! Vous pouvez maintenant soumettre votre dossier KYC.', 'success');
      } else {
        showToast('E-mail pas encore confirmé. Cliquez sur le lien reçu dans votre boîte mail.', 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Erreur lors de la vérification du statut e-mail.', 'error');
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleSlotFileChange = (slotDef: KycFormSlotDescriptor, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const resolvedMime = normalizeMimeType(file.type, file.name);
    if (!isAllowedKycMimeType(resolvedMime)) {
      const msg = `${slotDef.shortTitle} : format non supporté. Formats acceptés : JPG, JPEG, PNG, WebP ou PDF.`;
      setSlots((prev) => ({
        ...prev,
        [slotDef.slotKey]: {
          ...prev[slotDef.slotKey],
          uploadStatus: 'error',
          error: msg,
        },
      }));
      setSubmitError(msg);
      showToast(msg, 'error');
      e.target.value = '';
      return;
    }

    const maxBytes = 10 * 1024 * 1024;
    if (file.size <= 0 || file.size >= maxBytes) {
      const msg =
        file.size <= 0
          ? `${slotDef.shortTitle} : le fichier sélectionné est vide.`
          : `${slotDef.shortTitle} : le fichier dépasse la taille maximale autorisée de 10 Mo.`;
      setSlots((prev) => ({
        ...prev,
        [slotDef.slotKey]: {
          ...prev[slotDef.slotKey],
          uploadStatus: 'error',
          error: msg,
        },
      }));
      setSubmitError(msg);
      showToast(msg, 'error');
      e.target.value = '';
      return;
    }

    const previousSlot = slots[slotDef.slotKey];
    if (previousSlot.uploadedAsset?.storagePath) {
      const prevPath = previousSlot.uploadedAsset.storagePath;
      if (sessionUploadedPathsRef.current.has(prevPath)) {
        // Fichier temporaire uploadé dans cette session -> nettoyage immédiat
        sessionUploadedPathsRef.current.delete(prevPath);
        void cleanupOrphanKYCDocument(prevPath);
      } else {
        // Ancien fichier d'un dossier refusé -> nettoyage différé APRÈS succès du commit Firestore
        replacedSavedPathsRef.current.add(prevPath);
      }
    }

    revokeSlotObjectUrl(slotDef.slotKey);
    const localObjectUrl = URL.createObjectURL(file);
    slotObjectUrlsRef.current[slotDef.slotKey] = localObjectUrl;

    setSlots((prev) => ({
      ...prev,
      [slotDef.slotKey]: {
        file,
        previewUrl: localObjectUrl,
        originalFileName: file.name,
        mimeType: resolvedMime,
        size: file.size,
        uploadedAsset: null,
        isLoadingExisting: false,
        uploadStatus: 'ready',
        progress: 0,
        error: null,
      },
    }));
    setSubmitError(null);
    e.target.value = '';
  };

  const handleDeleteSlot = (slotDef: KycFormSlotDescriptor) => {
    const previousSlot = slots[slotDef.slotKey];
    if (previousSlot.uploadedAsset?.storagePath) {
      const prevPath = previousSlot.uploadedAsset.storagePath;
      if (sessionUploadedPathsRef.current.has(prevPath)) {
        sessionUploadedPathsRef.current.delete(prevPath);
        void cleanupOrphanKYCDocument(prevPath);
      } else {
        replacedSavedPathsRef.current.add(prevPath);
      }
    }
    revokeSlotObjectUrl(slotDef.slotKey);
    setSlots((prev) => ({
      ...prev,
      [slotDef.slotKey]: createEmptySlotState(),
    }));
    setSubmitError(null);
  };

  const requiredSlotsList = KYC_DOCUMENT_SLOTS.filter((def) => !def.optional);
  const optionalLicenseSlotsList = KYC_DOCUMENT_SLOTS.filter((def) => def.optional);

  const countCompletedRequiredSlots = (): number => {
    return requiredSlotsList.filter((def) => {
      const s = slots[def.slotKey];
      return Boolean(s.file || s.uploadedAsset?.storagePath);
    }).length;
  };

  const countCompletedOptionalLicenseSlots = (): number => {
    return optionalLicenseSlotsList.filter((def) => {
      const s = slots[def.slotKey];
      return Boolean(s.file || s.uploadedAsset?.storagePath);
    }).length;
  };

  const performSubmit = async () => {
    if (isSubmittingRef.current) {
      return;
    }
    setSubmitError(null);

    if (!activeCourierId || !auth.currentUser) {
      const msg = 'Authentification requise pour soumettre votre dossier KYC.';
      setSubmitError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!emailVerified) {
      const msg = 'Veuillez vérifier votre adresse e-mail avant de soumettre votre dossier KYC.';
      setSubmitError(msg);
      showToast(msg, 'error');
      return;
    }

    if (currentStatus === 'en_attente') {
      const msg = "Votre dossier est déjà en cours d'examen par l'administrateur.";
      setSubmitError(msg);
      showToast(msg, 'info');
      return;
    }

    if (currentStatus === 'valide') {
      const msg = 'Votre dossier KYC est déjà validé.';
      setSubmitError(msg);
      showToast(msg, 'info');
      return;
    }

    if (!lastName.trim() || !firstName.trim()) {
      const msg = 'Veuillez renseigner votre Nom et vos Prénoms séparément.';
      setSubmitError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!phone.trim()) {
      const msg = 'Veuillez renseigner votre numéro de téléphone.';
      setSubmitError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!operatingZone.trim()) {
      const msg = "Veuillez préciser votre zone d'activité.";
      setSubmitError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!idNumber.trim()) {
      const msg = "Veuillez renseigner le numéro de votre pièce d'identité.";
      setSubmitError(msg);
      showToast(msg, 'error');
      return;
    }

    const finalVehicleType =
      vehicleSelect === 'Autre engin (préciser)'
        ? customVehicle.trim() || 'Moto / Engin'
        : vehicleSelect;

    if (!finalVehicleType.trim()) {
      const msg = "Veuillez préciser votre type d'engin ou véhicule.";
      setSubmitError(msg);
      showToast(msg, 'error');
      return;
    }

    const missingSlots = getMissingRequiredKycSlots({
      idFront: { hasFile: Boolean(slots.idFront.file), storagePath: slots.idFront.uploadedAsset?.storagePath },
      idBack: { hasFile: Boolean(slots.idBack.file), storagePath: slots.idBack.uploadedAsset?.storagePath },
      drivingLicenseFront: {
        hasFile: Boolean(slots.drivingLicenseFront.file),
        storagePath: slots.drivingLicenseFront.uploadedAsset?.storagePath,
      },
      drivingLicenseBack: {
        hasFile: Boolean(slots.drivingLicenseBack.file),
        storagePath: slots.drivingLicenseBack.uploadedAsset?.storagePath,
      },
    });

    if (missingSlots.length > 0) {
      const missingNames = missingSlots.map((m) => m.shortTitle).join(', ');
      const msg = `Tous les justificatifs obligatoires doivent être fournis avant la soumission. Manquant(s) : ${missingNames}.`;
      setSlots((prev) => {
        const updated = { ...prev };
        missingSlots.forEach((m) => {
          updated[m.slotKey] = {
            ...updated[m.slotKey],
            uploadStatus: 'error',
            error: 'Document obligatoire requis.',
          };
        });
        return updated;
      });
      setSubmitError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!hasAgreedTerms) {
      const msg = 'Veuillez accepter les conditions de vérification KYC.';
      setSubmitError(msg);
      showToast(msg, 'error');
      return;
    }

    const pendingFiles: Partial<Record<KycDocumentSlotKey, File>> = {};
    const reuseUploadedAssetsBySlot: Partial<Record<KycDocumentSlotKey, UploadedKYCDocumentResult>> = {};
    let hasPendingUpload = false;

    for (const def of KYC_DOCUMENT_SLOTS) {
      const slot = slots[def.slotKey];
      if (slot.file) {
        pendingFiles[def.slotKey] = slot.file;
        hasPendingUpload = true;
      } else if (slot.uploadedAsset) {
        reuseUploadedAssetsBySlot[def.slotKey] = slot.uploadedAsset;
      }
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setUploadProgress(hasPendingUpload ? 5 : null);

    setSlots((prev) => {
      const updated = { ...prev };
      KYC_DOCUMENT_SLOTS.forEach((def) => {
        const current = updated[def.slotKey];
        if (current.file) {
          updated[def.slotKey] = {
            ...current,
            uploadStatus: 'uploading',
            progress: 5,
            error: null,
          };
        }
      });
      return updated;
    });

    const fullFormattedName = `${lastName.trim()} ${firstName.trim()}`.trim();

    const retainedDocuments: KYCUserRequest['documents'] = {};
    for (const def of KYC_DOCUMENT_SLOTS) {
      const slot = slots[def.slotKey];
      if (!slot.file && slot.uploadedAsset?.storagePath && existingKyc?.documents?.[def.slotKey]) {
        retainedDocuments[def.slotKey] = existingKyc.documents[def.slotKey];
      }
    }

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
      npi: npi.trim() || undefined,
      idNumber: idNumber.trim(),
      ifuNumber: ifuNumber.trim() || undefined,
      operatingZone: operatingZone.trim(),
      pendingFiles,
      documents: retainedDocuments,
      status: 'en_attente',
    };

    const abortController = new AbortController();
    uploadAbortRef.current = abortController;

    try {
      await submitKYCRequest(newKycData, {
        onProgress: (pct) => setUploadProgress(pct),
        onSlotProgress: (slotKey, pct) => {
          setSlots((prev) => ({
            ...prev,
            [slotKey]: {
              ...prev[slotKey],
              uploadStatus: pct >= 100 ? 'uploaded' : 'uploading',
              progress: pct,
              error: null,
            },
          }));
        },
        onSlotUploaded: (slotKey, asset) => {
          sessionUploadedPathsRef.current.add(asset.storagePath);
          setSlots((prev) => ({
            ...prev,
            [slotKey]: {
              ...prev[slotKey],
              file: null,
              uploadedAsset: asset,
              uploadStatus: 'uploaded',
              progress: 100,
              error: null,
            },
          }));
        },
        reuseUploadedAssetsBySlot,
        replacedStoragePaths: Array.from(replacedSavedPathsRef.current),
        signal: abortController.signal,
      });

      sessionUploadedPathsRef.current.clear();
      replacedSavedPathsRef.current.clear();
      setSubmitError(null);
      onClose();
    } catch (err: any) {
      const uploadedBySlot = err?.uploadedAssetsBySlot as
        | Partial<Record<KycDocumentSlotKey, UploadedKYCDocumentResult>>
        | undefined;
      if (uploadedBySlot) {
        setSlots((prev) => {
          const updated = { ...prev };
          (Object.keys(uploadedBySlot) as KycDocumentSlotKey[]).forEach((k) => {
            const asset = uploadedBySlot[k];
            if (asset) {
              sessionUploadedPathsRef.current.add(asset.storagePath);
              updated[k] = {
                ...updated[k],
                file: null,
                uploadedAsset: asset,
                uploadStatus: 'uploaded',
                progress: 100,
                error: null,
              };
            }
          });
          return updated;
        });
      }
      const stepPrefix =
        err?.stepCode && !String(err?.message || '').includes(err.stepCode)
          ? `[${err.stepCode}] `
          : '';
      const errMsg = `${stepPrefix}${
        err?.message || '[KYC-STEP-D] Erreur lors de la soumission du dossier KYC. Veuillez réessayer.'
      }`;
      setSubmitError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      uploadAbortRef.current = null;
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performSubmit();
  };

  const completedRequiredCount = countCompletedRequiredSlots();
  const completedOptionalLicenseCount = countCompletedOptionalLicenseSlots();

  const renderSlotCard = (slotDef: KycFormSlotDescriptor) => {
    const slot = slots[slotDef.slotKey];
    const hasDoc = Boolean(slot.file || slot.uploadedAsset?.storagePath);
    const isPdf = normalizeMimeType(slot.mimeType, slot.originalFileName) === 'application/pdf';
    const formatBadge = hasDoc ? formatMimeBadge(slot.mimeType, slot.originalFileName) : null;

    return (
      <div
        key={slotDef.slotKey}
        data-testid={`kyc-slot-${slotDef.slotKey}`}
        className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-2.5 ${
          slot.uploadStatus === 'error'
            ? 'bg-red-50/50 dark:bg-red-950/20 border-red-300 dark:border-red-800'
            : slot.uploadStatus === 'uploaded'
            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
            : hasDoc
            ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
            : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
              <span className="material-symbols-outlined text-blue-600 text-sm shrink-0">
                {slotDef.icon}
              </span>
              <span>{slotDef.title}</span>
            </span>

            {slot.uploadStatus === 'uploading' ? (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold shrink-0">
                {slot.progress}%
              </span>
            ) : slot.uploadStatus === 'uploaded' ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold shrink-0">
                ✓ Téléversé
              </span>
            ) : slot.file ? (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold shrink-0">
                Prêt
              </span>
            ) : slotDef.optional ? (
              <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-[10px] font-bold shrink-0">
                Facultatif
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 text-[10px] font-bold shrink-0">
                Requis
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {slotDef.description}
          </p>
        </div>

        {/* Preview Area */}
        {slot.isLoadingExisting ? (
          <div className="h-28 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 bg-white/60 dark:bg-slate-900/40">
            <span className="material-symbols-outlined text-xl animate-spin">sync</span>
            <span className="text-[10px] mt-1">Chargement sécurisé...</span>
          </div>
        ) : hasDoc ? (
          <div className="space-y-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            {isPdf ? (
              <div className="h-24 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex flex-col items-center justify-center text-red-700 dark:text-red-300 gap-1">
                <span className="material-symbols-outlined text-3xl">picture_as_pdf</span>
                {slot.previewUrl && (
                  <a
                    href={slot.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold underline"
                  >
                    Ouvrir le PDF
                  </a>
                )}
              </div>
            ) : slot.previewUrl ? (
              <div className="w-full h-32 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
                <img
                  src={slot.previewUrl}
                  alt={slotDef.shortTitle}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="h-24 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                <span className="material-symbols-outlined text-3xl">description</span>
              </div>
            )}

            <div className="min-w-0 space-y-1 px-0.5">
              <p className="font-bold text-slate-800 dark:text-slate-100 text-[11px] truncate" title={slot.originalFileName}>
                {slot.originalFileName || 'Document enregistré'}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500 dark:text-slate-400">
                {formatBadge && (
                  <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">
                    {formatBadge}
                  </span>
                )}
                {slot.size ? <span>{formatFileSizeFr(slot.size)}</span> : null}
              </div>
              {slot.uploadStatus === 'uploading' && (
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-200"
                    style={{ width: `${Math.max(10, slot.progress)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-24 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 bg-white/50 dark:bg-slate-900/30">
            <span className="material-symbols-outlined text-xl">add_photo_alternate</span>
            <span className="text-[10px] mt-0.5">
              {slotDef.optional ? 'Optionnel • Photo ou fichier (< 10 Mo)' : 'JPG, PNG, WebP ou PDF (< 10 Mo)'}
            </span>
          </div>
        )}

        {slot.error && (
          <p className="text-[10px] font-bold text-red-700 dark:text-red-300 leading-tight">
            {slot.error}
          </p>
        )}

        {/* Action Buttons: Camera Capture + Gallery/File + Replace + Delete */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <label
            className={`flex-1 min-w-[110px] justify-center px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-800 dark:text-slate-200 font-bold text-[11px] shadow-2xs transition-colors inline-flex items-center gap-1 ${
              isSubmissionLocked || isSubmitting
                ? 'opacity-50 pointer-events-none'
                : 'cursor-pointer'
            }`}
          >
            <span className="material-symbols-outlined text-sm">photo_camera</span>
            <span>{hasDoc ? 'Reprendre' : 'Prendre une photo'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={isSubmissionLocked || isSubmitting}
              onChange={(e) => handleSlotFileChange(slotDef, e)}
              className="hidden"
            />
          </label>

          <label
            className={`flex-1 min-w-[110px] justify-center px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-800 dark:text-slate-200 font-bold text-[11px] shadow-2xs transition-colors inline-flex items-center gap-1 ${
              isSubmissionLocked || isSubmitting
                ? 'opacity-50 pointer-events-none'
                : 'cursor-pointer'
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              {hasDoc ? 'swap_horiz' : 'photo_library'}
            </span>
            <span>{hasDoc ? 'Remplacer' : 'Galerie / Fichier'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
              disabled={isSubmissionLocked || isSubmitting}
              onChange={(e) => handleSlotFileChange(slotDef, e)}
              className="hidden"
            />
          </label>

          {hasDoc && !isSubmissionLocked && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleDeleteSlot(slotDef)}
              aria-label={`Supprimer ${slotDef.shortTitle}`}
              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl font-bold text-[11px] inline-flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              <span>Supprimer</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={handleCloseModal}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-gradient-to-r from-blue-500/10 via-slate-500/5 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0">
              <span className="material-symbols-outlined text-2xl">verified_user</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Contrôle &amp; Accréditation KYC Livreur
                </h2>
                {currentStatus === 'valide' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    ✓ Validé par Administrateur
                  </span>
                )}
                {currentStatus === 'en_attente' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    ⏳ En examen Administrateur
                  </span>
                )}
                {currentStatus === 'refuse' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                    ✕ Rejeté
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Saisie obligatoire de vos informations, pièce d&apos;identité requise et permis de conduire facultatif.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseModal}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            title="Fermer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Status Callout Banner */}
        <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 shrink-0 space-y-3">
          {!emailVerified && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 text-xs">
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-amber-600 text-xl shrink-0">mark_email_unread</span>
                <div>
                  <p className="font-bold">Vérification d&apos;adresse e-mail requise</p>
                  <p className="text-[11px] text-amber-900 dark:text-amber-300 mt-0.5">
                    Confirmez votre adresse e-mail avant d&apos;envoyer vos pièces justificatives.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResendVerificationEmail}
                  disabled={isResendingEmail}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] disabled:opacity-50 cursor-pointer"
                >
                  {isResendingEmail ? 'Envoi...' : 'Renvoyer le lien'}
                </button>
                <button
                  type="button"
                  onClick={handleRefreshVerificationStatus}
                  disabled={isCheckingEmail}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 text-amber-900 dark:text-amber-200 font-bold text-[11px] disabled:opacity-50 cursor-pointer"
                >
                  {isCheckingEmail ? 'Vérif...' : "J'ai vérifié"}
                </button>
              </div>
            </div>
          )}

          {currentStatus === 'valide' ? (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs">
              <span className="material-symbols-outlined text-emerald-600 text-2xl shrink-0">check_circle</span>
              <div>
                <p className="font-bold">Votre dossier KYC a été validé et accrédité par l&apos;administrateur !</p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                  Vous êtes pleinement autorisé à passer en ligne et effectuer vos livraisons.
                </p>
              </div>
            </div>
          ) : currentStatus === 'en_attente' ? (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 text-xs">
              <span className="material-symbols-outlined text-amber-600 text-2xl shrink-0 animate-spin">sync</span>
              <div className="flex-1">
                <p className="font-bold">Dossier KYC en cours d&apos;examen par l&apos;administrateur</p>
                <p className="text-[11px] text-amber-900 dark:text-amber-300 mt-0.5">
                  Votre dossier est verrouillé pendant la vérification. Vous serez notifié dès la décision de l&apos;administrateur.
                </p>
              </div>
            </div>
          ) : currentStatus === 'refuse' ? (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-red-100/80 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-950 dark:text-red-200 text-xs">
              <span className="material-symbols-outlined text-red-600 text-2xl shrink-0">error</span>
              <div>
                <p className="font-bold">Votre dossier KYC a été refusé par l&apos;administrateur</p>
                <p className="text-[11px] text-red-900 dark:text-red-300 mt-0.5">
                  Motif : {existingKyc?.rejectionReason || 'Documents illisibles ou informations non conformes. Veuillez remplacer les pièces concernées puis re-soumettre.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-blue-100/70 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs">
              <span className="material-symbols-outlined text-blue-600 text-2xl shrink-0">shield</span>
              <div>
                <p className="font-bold">
                  Pièce d&apos;identité obligatoire ({completedRequiredCount}/2 pièces prêtes
                  {completedOptionalLicenseCount > 0 ? ` • permis ${completedOptionalLicenseCount}/2` : ''})
                </p>
                <p className="text-[11px] text-blue-800 dark:text-blue-300 mt-0.5">
                  Téléversez le recto et le verso de votre pièce d&apos;identité (JPG, PNG, WebP ou PDF, &lt; 10 Mo). Le permis de conduire reste facultatif.
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
                Nom de famille (tel qu&apos;indiqué sur la pièce) *
              </label>
              <input
                type="text"
                required
                disabled={isSubmissionLocked || isSubmitting}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="ex: GBÉDÉ"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-blue-500 uppercase disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Prénom(s) (tels qu&apos;indiqués sur la pièce) *
              </label>
              <input
                type="text"
                required
                disabled={isSubmissionLocked || isSubmitting}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="ex: Pamphile Kodjo"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-blue-500 capitalize disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Numéro de téléphone (MoMo / WhatsApp) *
              </label>
              <input
                type="tel"
                required
                disabled={isSubmissionLocked || isSubmitting}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="ex: +229 97 00 00 00"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Zone d&apos;activité principale *
              </label>
              <input
                type="text"
                required
                disabled={isSubmissionLocked || isSubmitting}
                value={operatingZone}
                onChange={(e) => setOperatingZone(e.target.value)}
                placeholder="ex: Cotonou, Abomey-Calavi, Porto-Novo"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Numéro Personnel d&apos;Identification (NPI)
              </label>
              <input
                type="text"
                disabled={isSubmissionLocked || isSubmitting}
                value={npi}
                onChange={(e) => setNpi(e.target.value)}
                placeholder="Saisissez votre NPI (10 chiffres)"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Numéro de pièce d&apos;identité *
              </label>
              <input
                type="text"
                required
                disabled={isSubmissionLocked || isSubmitting}
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="Saisissez le numéro figurant sur la pièce"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Type de pièce d&apos;identité *
              </label>
              <select
                disabled={isSubmissionLocked || isSubmitting}
                value={idType}
                onChange={(e) => setIdType(e.target.value as any)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              >
                <option value="CIP">CIP (Certificat d&apos;Identification Personnelle)</option>
                <option value="CNI">CNI Biométrique Béninoise</option>
                <option value="PASSPORT">Passeport CEDEAO / Bénin</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                Numéro IFU (optionnel)
              </label>
              <input
                type="text"
                disabled={isSubmissionLocked || isSubmitting}
                value={ifuNumber}
                onChange={(e) => setIfuNumber(e.target.value)}
                placeholder="Saisissez vos 13 chiffres IFU"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>
          </div>

          {/* BENIN VEHICLE / ENGIN SELECTION */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Type d&apos;engin / Véhicule au Bénin *
                </label>
                <select
                  disabled={isSubmissionLocked || isSubmitting}
                  value={vehicleSelect}
                  onChange={(e) => setVehicleSelect(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                >
                  {BENIN_VEHICLE_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Plaque d&apos;immatriculation *
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmissionLocked || isSubmitting}
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  placeholder="ex: BJ-8492-RB"
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono outline-none focus:ring-2 focus:ring-blue-500 uppercase disabled:opacity-60"
                />
              </div>
            </div>

            {vehicleSelect === 'Autre engin (préciser)' && (
              <div className="animate-in fade-in duration-200 pt-1">
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Saisissez le type ou modèle exact de votre engin *
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmissionLocked || isSubmitting}
                  value={customVehicle}
                  onChange={(e) => setCustomVehicle(e.target.value)}
                  placeholder="ex: Moto Tricycle Spéciale, Scooter Honda Dio 110cc, etc."
                  className="w-full p-2.5 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                />
              </div>
            )}

          </div>

          {/* 1. REQUIRED IDENTITY DOCUMENTS (RECTO / VERSO) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-base">folder_shared</span>
                <span className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm">
                  Pièces d&apos;identité obligatoires
                </span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  completedRequiredCount === 2
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                }`}
              >
                {completedRequiredCount}/2 obligatoires
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {requiredSlotsList.map((slotDef) => renderSlotCard(slotDef))}
            </div>
          </div>

          {/* 2. OPTIONAL DRIVING LICENSE SECTION (RECTO / VERSO) */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-base">directions_car</span>
                <span className="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm">
                  Permis de conduire (facultatif)
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Facultatif • {completedOptionalLicenseCount}/2 photo{completedOptionalLicenseCount > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Vous pouvez photographier directement avec votre téléphone ou choisir depuis votre galerie le recto et/ou le verso de votre permis. Leur absence n&apos;empêche pas la soumission du dossier.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {optionalLicenseSlotsList.map((slotDef) => renderSlotCard(slotDef))}
            </div>
          </div>

          {/* Notice confidentialité & analyse assistée par IA */}
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-2.5">
            <span className="material-symbols-outlined text-blue-600 text-base shrink-0 mt-0.5">privacy_tip</span>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100">
                Confidentialité &amp; vérification assistée par IA
              </p>
              <p className="mt-0.5">
                Vos pièces justificatives sont stockées dans un espace privé sécurisé. Elles peuvent faire l&apos;objet d&apos;une analyse automatisée assistée par intelligence artificielle afin de vérifier la lisibilité et la cohérence du dossier. La validation ou le refus définitif est toujours décidé par un administrateur humain LivraLink.
              </p>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2 pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hasAgreedTerms}
                disabled={isSubmissionLocked || isSubmitting}
                onChange={(e) => setHasAgreedTerms(e.target.checked)}
                className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-slate-600 dark:text-slate-400 text-[11px]">
                Je certifie sur l&apos;honneur l&apos;exactitude des informations et des pièces justificatives fournies et accepte le contrôle d&apos;accréditation LivraLink (incluant l&apos;analyse documentaire assistée décrite ci-dessus).
              </span>
            </label>
          </div>

          {/* Inline Global Upload Progress & Error Alert */}
          {isSubmitting && (
            <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-blue-900 dark:text-blue-200">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                  <span>
                    {uploadProgress !== null && uploadProgress < 100
                      ? `Téléversement sécurisé des justificatifs (${uploadProgress}%)...`
                      : 'Enregistrement du dossier KYC dans Firestore...'}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  {uploadProgress !== null && <span className="font-mono">{uploadProgress}%</span>}
                  <button
                    type="button"
                    onClick={handleCancelOngoingUpload}
                    className="px-2 py-0.5 rounded-lg bg-blue-100 hover:bg-red-100 text-blue-900 hover:text-red-700 text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-blue-200/70 dark:bg-blue-900 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${uploadProgress !== null ? Math.max(8, uploadProgress) : 100}%` }}
                />
              </div>
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-950 dark:text-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-red-600 text-xl shrink-0">error</span>
                <div>
                  <p className="font-bold text-xs">Échec de la soumission du dossier KYC</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed">{submitError}</p>
                </div>
              </div>
              {!isSubmissionLocked && (
                <button
                  type="button"
                  onClick={() => void performSubmit()}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[11px] font-bold shrink-0 cursor-pointer disabled:opacity-50"
                >
                  Réessayer l&apos;envoi
                </button>
              )}
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
            >
              {isSubmissionLocked ? 'Fermer' : 'Annuler'}
            </button>
            {!isSubmissionLocked && (
              <button
                type="submit"
                disabled={isSubmitting || !emailVerified}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-md shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">{isSubmitting ? 'sync' : 'send'}</span>
                <span>
                  {isSubmitting
                    ? uploadProgress !== null && uploadProgress < 100
                      ? `Téléversement (${uploadProgress}%)...`
                      : 'Enregistrement...'
                    : submitError
                    ? "Réessayer l'envoi"
                    : currentStatus === 'refuse'
                    ? 'Re-soumettre mon dossier KYC'
                    : 'Soumettre mon dossier KYC'}
                </span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
