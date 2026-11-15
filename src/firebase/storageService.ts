import {
  ref,
  uploadBytes,
  uploadString,
  getDownloadURL,
} from 'firebase/storage';
import { storage, auth } from './config';

/**
 * Utility: Convert a base64 Data URL to a Blob
 */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; contentType: string } {
  const parts = dataUrl.split(';base64,');
  const contentType = parts[0].replace('data:', '') || 'image/png';
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

/**
 * Securely uploads a file or Base64 data URL to Firebase Storage.
 * Returns the permanent public HTTPS download URL.
 */
export async function uploadFileToStorage(
  storagePath: string,
  fileOrDataUrl: File | Blob | string,
  customContentType?: string
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
      if (fileOrDataUrl.startsWith('data:')) {
        const { blob, contentType } = dataUrlToBlob(fileOrDataUrl);
        const metadata = {
          contentType: customContentType || contentType,
          customMetadata: baseCustomMetadata,
        };
        await uploadBytes(storageRef, blob, metadata);
      } else if (fileOrDataUrl.startsWith('https://firebasestorage.googleapis.com/') || fileOrDataUrl.includes('.firebasestorage.app/')) {
        // Already uploaded to trusted Firebase Storage
        return fileOrDataUrl;
      } else if (fileOrDataUrl.startsWith('http://') || fileOrDataUrl.startsWith('https://')) {
        throw new Error('URL externe non autorisée comme preuve stockée. Veuillez capturer ou téléverser un fichier.');
      } else {
        await uploadString(storageRef, fileOrDataUrl, 'raw', {
          contentType: customContentType || 'text/plain',
          customMetadata: baseCustomMetadata,
        });
      }
    } else {
      const metadata = {
        contentType: customContentType || (fileOrDataUrl as File).type || 'application/octet-stream',
        customMetadata: baseCustomMetadata,
      };
      await uploadBytes(storageRef, fileOrDataUrl, metadata);
    }

    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (error: any) {
    const msg = error?.message || 'Échec du téléversement vers Firebase Storage.';
    throw new Error(`Erreur de stockage (${storagePath}) : ${msg}`);
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
 * 3. Upload KYC Identity Document to Storage: kyc/{userId}/{docType}_{timestamp}
 */
export async function uploadKYCDocument(
  userId: string,
  docType: 'cni' | 'permis' | 'assurance' | 'identity_photo',
  fileOrDataUrl: File | Blob | string
): Promise<string> {
  const cleanUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  const timestamp = Date.now();
  const path = `kyc/${cleanUserId}/${docType}_${timestamp}.jpg`;
  return uploadFileToStorage(path, fileOrDataUrl, 'image/jpeg');
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
