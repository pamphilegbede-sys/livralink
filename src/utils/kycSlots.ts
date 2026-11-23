import type { KycDocumentSlotKey, KycDocumentsMap, KycStorageDocType } from '../types';

export interface KycFormSlotDescriptor {
  slotKey: KycDocumentSlotKey;
  docType: KycStorageDocType;
  section: 'identity' | 'driving_license';
  optional: boolean;
  title: string;
  shortTitle: string;
  description: string;
  icon: string;
}

export const KYC_ACTIVE_DOCUMENT_SLOTS: KycFormSlotDescriptor[] = [
  {
    slotKey: 'idFront',
    docType: 'id_front',
    section: 'identity',
    optional: false,
    title: "1. Recto de la pièce d'identité *",
    shortTitle: "Recto de la pièce d'identité",
    description: 'Face avant lisible (CIP, CNI biométrique ou passeport). Les 4 coins doivent être visibles.',
    icon: 'badge',
  },
  {
    slotKey: 'idBack',
    docType: 'id_back',
    section: 'identity',
    optional: false,
    title: "2. Verso de la pièce d'identité *",
    shortTitle: "Verso de la pièce d'identité",
    description: 'Face arrière de votre pièce (ou page secondaire / couverture pour passeport).',
    icon: 'flip_to_back',
  },
  {
    slotKey: 'drivingLicenseFront',
    docType: 'driving_license_front',
    section: 'driving_license',
    optional: true,
    title: 'Recto du permis de conduire (facultatif)',
    shortTitle: 'Recto du permis de conduire',
    description: 'Face avant de votre permis de conduire (si vous en possédez un).',
    icon: 'directions_car',
  },
  {
    slotKey: 'drivingLicenseBack',
    docType: 'driving_license_back',
    section: 'driving_license',
    optional: true,
    title: 'Verso du permis de conduire (facultatif)',
    shortTitle: 'Verso du permis de conduire',
    description: 'Face arrière de votre permis de conduire (catégories et dates lisibles).',
    icon: 'flip_to_back',
  },
];

export const KYC_REQUIRED_SLOT_KEYS: KycDocumentSlotKey[] = KYC_ACTIVE_DOCUMENT_SLOTS
  .filter((s) => !s.optional)
  .map((s) => s.slotKey);

export const KYC_OPTIONAL_LICENSE_SLOT_KEYS: KycDocumentSlotKey[] = KYC_ACTIVE_DOCUMENT_SLOTS
  .filter((s) => s.optional)
  .map((s) => s.slotKey);

export interface MinimalKycSlotPresence {
  hasFile?: boolean;
  storagePath?: string | null;
}

export function getMissingRequiredKycSlots(
  slotPresence: Partial<Record<KycDocumentSlotKey, MinimalKycSlotPresence>>
): KycFormSlotDescriptor[] {
  return KYC_ACTIVE_DOCUMENT_SLOTS.filter((def) => {
    if (def.optional) return false;
    const state = slotPresence[def.slotKey];
    return !state?.hasFile && !state?.storagePath;
  });
}

export function buildActiveKycDocumentsSubmissionMap(
  uploadedBySlot: Partial<Record<KycDocumentSlotKey, KycDocumentsMap['idFront']>>
): KycDocumentsMap {
  const result: KycDocumentsMap = {};
  for (const def of KYC_ACTIVE_DOCUMENT_SLOTS) {
    const meta = uploadedBySlot[def.slotKey];
    if (meta && meta.uploaded !== false && meta.storagePath) {
      result[def.slotKey] = meta;
    }
  }
  return result;
}
