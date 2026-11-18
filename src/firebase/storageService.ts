import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  uploadString,
  getDownloadURL,
  getBlob,
  UploadTask,
} from 'firebase/storage';
import { storage, auth } from './config';

export interface UploadedKYCDocumentResult {
  storagePath: string;
  contentType: string;
  fileName: string;
  size: number;
}

export interface UploadProgressOptions {
  onProgress?: (percent: number) => void;
  timeoutMs?: number;
}

const DEFAULT_UPLOAD_TIMEOUT_MS = 35_000;
const MAX_KYC_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_KYC_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

/**
 * Utility: Convert a base64 Data URL to a Blob
 */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; contentType: string } {
  const parts = dataUrl.split(';base64,');
  if (parts.length !== 2) {
    throw new Error('Format de fichier Base64 invalide.');
  }
  const contentType = normalizeMimeType(parts[0].replace('data:', '')) || 'image/jpeg';
  const raw = atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return {
    blob: new Blob([uInt8Array], { type: contentType }),
    contentType,
  };
}

export function normalizeMimeType(rawMime?: string, fileName?: string): string {
  const lower = (rawMime || '').trim().toLowerCase().split(';')[0];
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  if (lower && lower !== 'application/octet-stream') return lower;

  const lowerName = (fileName || '').trim().toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  return lower || '';
}

export function getExtensionForMimeType(contentType: string): string {
  const norm = normalizeMimeType(contentType);
  if (norm === 'application/pdf') return 'pdf';
  if (norm === 'image/png') return 'png';
  if (norm === 'image/webp') return 'webp';
  if (norm === 'image/gif') return 'gif';
  return 'jpg';
}

export function isAllowedKycMimeType(contentType: string): boolean {
  const norm = normalizeMimeType(contentType);
  return ALLOWED_KYC_MIME_TYPES.has(norm);
}

export function formatStorageErrorMessage(error: any, storagePath: string): string {
  const code = String(error?.code || '');
  const rawMessage = String(error?.message || '');

  if (code === 'storage/unauthorized' || /403|permission|unauthorized/i.test(rawMessage)) {
    return 'Accès refusé par Firebase Storage (403). Vérifiez que votre adresse e-mail est bien vérifiée et que vous n’avez pas déjà un dossier en attente ou validé.';
  }
  if (code === 'storage/unauthenticated') {
    return 'Session Firebase expirée ou non authentifiée. Reconnectez-vous puis réessayez.';
  }
  if (code === 'storage/canceled') {
    return rawMessage || 'Téléversement annulé ou délai réseau dépassé. Vérifiez votre connexion et réessayez.';
  }
  if (code === 'storage/retry-limit-exceeded') {
    return 'Connexion instable ou serveur Firebase Storage inaccessible. Vérifiez votre connexion internet et réessayez.';
  }
  if (code === 'storage/quota-exceeded') {
    return 'Quota de stockage temporairement atteint. Contactez le support LivraLink.';
  }
  if (rawMessage) {
    return `Erreur de stockage (${storagePath}) : ${rawMessage}`;
  }
  return `Échec du téléversement vers Firebase Storage (${storagePath}).`;
}

function uploadResumableWithTimeout(
  storageRef: ReturnType<typeof ref>,
  data: Blob | Uint8Array,
  metadata: { contentType: string; customMetadata: Record<string, string> },
  options?: UploadProgressOptions
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
  const onProgress = options?.onProgress;

  return new Promise((resolve, reject) => {
    let settled = false;
    let uploadTask: UploadTask;

    const finishError = (err: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };

    const finishSuccess = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (onProgress) onProgress(100);
      resolve();
    };

    const timer = setTimeout(() => {
      try {
        uploadTask?.cancel();
      } catch {}
      const timeoutErr = new Error(
        `Délai de téléversement dépassé (${Math.round(timeoutMs / 1000)} s). Vérifiez votre connexion internet et réessayez.`
      );
      (timeoutErr as any).code = 'storage/canceled';
      finishError(timeoutErr);
    }, timeoutMs);

    try {
      uploadTask = uploadBytesResumable(storageRef, data, metadata);
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (settled || !onProgress) return;
          if (snapshot.totalBytes > 0) {
            const pct = Math.min(99, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
            onProgress(pct);
          }
        },
        (err) => {
          finishError(err);
        },
        () => {
          finishSuccess();
        }
      );
    } catch (syncErr) {
      finishError(syncErr);
    }
  });
}

async function resolveBlobAndMimeType(
  fileOrDataUrl: File | Blob | string,
  customContentType?: string
): Promise<{ blob: Blob; contentType: string }> {
  if (typeof fileOrDataUrl === 'string') {
    if (fileOrDataUrl.startsWith('data:')) {
      const { blob, contentType } = dataUrlToBlob(fileOrDataUrl);
      const resolvedMime = normalizeMimeType(customContentType || contentType) || contentType;
      return { blob, contentType: resolvedMime };
    }
    if (fileOrDataUrl.startsWith('blob:')) {
      const res = await fetch(fileOrDataUrl);
      if (!res.ok) {
        throw new Error('Impossible de lire le fichier local sélectionné. Veuillez le sélectionner à nouveau.');
      }
      const blob = await res.blob();
      const resolvedMime = normalizeMimeType(customContentType || blob.type) || 'application/octet-stream';
      return { blob, contentType: resolvedMime };
    }
    throw new Error('Format de fichier non reconnu pour le téléversement.');
  }

  const fileName = (fileOrDataUrl as File).name;
  const resolvedMime = normalizeMimeType(customContentType || fileOrDataUrl.type, fileName) || 'application/octet-stream';
  return {
    blob: fileOrDataUrl,
    contentType: resolvedMime,
  };
}

/**
 * Securely uploads a file or Base64 data URL to Firebase Storage.
 * Returns the permanent HTTPS download URL (used for POD photos/signatures, avatars, chat media).
 */
export async function uploadFileToStorage(
  storagePath: string,
  fileOrDataUrl: File | Blob | string,
  customContentType?: string,
  options?: UploadProgressOptions
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Authentification Firebase requise pour téléverser un fichier vers le stockage sécurisé.');
  }

  const baseCustomMetadata = {
    uploadedBy: currentUser.uid,
    uploadedAt: new Date().toISOString(),
  };

  try {
    const storageRef = ref(storage, storagePath);

    if (typeof fileOrDataUrl === 'string') {
      if (fileOrDataUrl.startsWith('https://firebasestorage.googleapis.com/') || fileOrDataUrl.includes('.firebasestorage.app/')) {
        return fileOrDataUrl;
      }
      if (fileOrDataUrl.startsWith('http://') || fileOrDataUrl.startsWith('https://')) {
        throw new Error('URL externe non autorisée comme preuve stockée. Veuillez capturer ou téléverser un fichier.');
      }
      if (fileOrDataUrl.startsWith('data:') || fileOrDataUrl.startsWith('blob:')) {
        const { blob, contentType } = await resolveBlobAndMimeType(fileOrDataUrl, customContentType);
        await uploadResumableWithTimeout(
          storageRef,
          blob,
          { contentType, customMetadata: baseCustomMetadata },
          options
        );
      } else {
        await uploadString(storageRef, fileOrDataUrl, 'raw', {
          contentType: customContentType || 'text/plain',
          customMetadata: baseCustomMetadata,
        });
      }
    } else {
      const { blob, contentType } = await resolveBlobAndMimeType(fileOrDataUrl, customContentType);
      if (typeof uploadBytesResumable === 'function') {
        await uploadResumableWithTimeout(
          storageRef,
          blob,
          { contentType, customMetadata: baseCustomMetadata },
          options
        );
      } else {
        await uploadBytes(storageRef, blob, { contentType, customMetadata: baseCustomMetadata });
      }
    }

    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (error: any) {
    throw new Error(formatStorageErrorMessage(error, storagePath));
  }
}

/**
 * 1. Upload POD Delivery Photo to Storage: pod/{orderId}/photo_{timestamp}.jpg
 */
export async function uploadPODPhoto(orderId: string, photoDataUrl: string | File | Blob): Promise<string> {
  const cleanOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, '');
  const timestamp = Date.now();
  const path = `pod/${cleanOrderId}/photo_${timestamp}.jpg`;
  return uploadFileToStorage(path, photoDataUrl, 'image/jpeg');
}

/**
 * 2. Upload POD Recipient Signature to Storage: pod/{orderId}/signature_{timestamp}.png
 */
export async function uploadPODSignature(orderId: string, signatureDataUrl: string): Promise<string> {
  const cleanOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, '');
  const timestamp = Date.now();
  const path = `pod/${cleanOrderId}/signature_${timestamp}.png`;
  return uploadFileToStorage(path, signatureDataUrl, 'image/png');
}

/**
 * 3. Upload KYC Identity Document to Storage: kyc/{userId}/{docType}_{timestamp}.{ext}
 * Respecte strictement le MIME réel (JPG, PNG, WebP, PDF) et ne génère AUCUNE URL publique permanente.
 */
export async function uploadKYCDocument(
  userId: string,
  docType: 'cni' | 'permis' | 'assurance' | 'identity_photo',
  fileOrDataUrl: File | Blob | string,
  options?: UploadProgressOptions
): Promise<UploadedKYCDocumentResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Authentification Firebase requise pour téléverser votre pièce KYC.');
  }
  if (!currentUser.emailVerified) {
    throw new Error('Votre adresse e-mail doit être vérifiée avant de téléverser votre pièce KYC.');
  }

  const cleanUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanUserId || cleanUserId !== currentUser.uid) {
    throw new Error('Identifiant utilisateur incohérent pour le téléversement KYC.');
  }

  const { blob, contentType } = await resolveBlobAndMimeType(fileOrDataUrl);
  if (!isAllowedKycMimeType(contentType)) {
    throw new Error('Format de document non autorisé. Formats acceptés : JPG, JPEG, PNG, WebP ou PDF.');
  }
  if (blob.size <= 0) {
    throw new Error('Le fichier sélectionné est vide.');
  }
  if (blob.size >= MAX_KYC_FILE_BYTES) {
    throw new Error('Le document dépasse la taille maximale autorisée de 10 Mo.');
  }

  const ext = getExtensionForMimeType(contentType);
  const timestamp = Date.now();
  const fileName = `${docType}_${timestamp}.${ext}`;
  const storagePath = `kyc/${cleanUserId}/${fileName}`;

  const metadata = {
    contentType,
    customMetadata: {
      uploadedBy: currentUser.uid,
      uploadedAt: new Date().toISOString(),
    },
  };

  try {
    const storageRef = ref(storage, storagePath);
    await uploadResumableWithTimeout(storageRef, blob, metadata, options);
    return {
      storagePath,
      contentType,
      fileName,
      size: blob.size,
    };
  } catch (error: any) {
    throw new Error(formatStorageErrorMessage(error, storagePath));
  }
}

/**
 * Extract storagePath from a legacy Firebase Storage URL if needed.
 */
export function extractStoragePathFromUrl(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/\/o\/([^?]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Fetch KYC document bytes strictly via authorized Firebase Storage SDK (`getBlob` gated by `storage.rules`)
 * or authenticated backend endpoint (`/api/kyc/document` gated by Firebase ID Token + Admin/Owner check).
 */
export async function fetchAuthorizedKYCDocumentBlob(params: {
  storagePath?: string;
  legacyUrl?: string;
}): Promise<{ blob: Blob; mimeType: string; fileName: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Session Firebase requise pour consulter ce justificatif KYC.');
  }

  const resolvedPath = (params.storagePath || extractStoragePathFromUrl(params.legacyUrl) || '').trim();
  const fallbackName = resolvedPath.split('/').pop() || 'justificatif_kyc';

  if (resolvedPath) {
    // 1. Primary: Firebase Storage SDK getBlob (strictly enforced by storage.rules)
    try {
      const blob = await getBlob(ref(storage, resolvedPath));
      const mimeType = normalizeMimeType(blob.type, fallbackName) || 'application/octet-stream';
      return { blob, mimeType, fileName: fallbackName };
    } catch (sdkErr: any) {
      // 2. Fallback: Authenticated backend proxy (useful when Storage SDK CORS/network is blocked)
      const token = await currentUser.getIdToken();
      const res = await fetch(`/api/kyc/document?path=${encodeURIComponent(resolvedPath)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          errBody?.error ||
            formatStorageErrorMessage(sdkErr, resolvedPath)
        );
      }
      const blob = await res.blob();
      const mimeType =
        normalizeMimeType(res.headers.get('content-type') || blob.type, fallbackName) ||
        'application/octet-stream';
      return { blob, mimeType, fileName: fallbackName };
    }
  }

  // Legacy data: URL stored directly on historical test/dev records
  if (params.legacyUrl && params.legacyUrl.startsWith('data:')) {
    const { blob, contentType } = dataUrlToBlob(params.legacyUrl);
    return {
      blob,
      mimeType: contentType,
      fileName: `justificatif_kyc.${getExtensionForMimeType(contentType)}`,
    };
  }

  throw new Error('Aucun justificatif KYC sécurisé disponible pour ce dossier.');
}

/**
 * Best-effort cleanup of an orphan KYC file via strictly authenticated backend route
 * (never allows deleting a file referenced by an active/validated dossier).
 */
export async function cleanupOrphanKYCDocument(storagePath: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !storagePath || !storagePath.startsWith(`kyc/${currentUser.uid}/`)) {
    return;
  }
  try {
    const token = await currentUser.getIdToken();
    await fetch('/api/courier/kyc/cleanup-orphan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ storagePath }),
    });
  } catch {
    // Non-blocking cleanup
  }
}

/**
 * 4. Upload User Avatar: avatars/{userId}/avatar_{timestamp}.jpg
 */
export async function uploadUserAvatar(
  userId: string,
  fileOrDataUrl: File | Blob | string
): Promise<string> {
  const cleanUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const timestamp = Date.now();
  const path = `avatars/${cleanUserId}/avatar_${timestamp}.jpg`;
  return uploadFileToStorage(path, fileOrDataUrl, 'image/jpeg');
}

/**
 * 5. Upload Chat Attachment: chat/{conversationId}/{timestamp}_{filename}
 */
export async function uploadChatAttachment(
  conversationId: string,
  fileName: string,
  fileOrDataUrl: File | Blob | string
): Promise<string> {
  const cleanConvId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '');
  const timestamp = Date.now();
  const path = `chat/${cleanConvId}/${timestamp}_${cleanFileName}`;
  return uploadFileToStorage(path, fileOrDataUrl);
}
