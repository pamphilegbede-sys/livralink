/**
 * LivraLink Legacy Firebase Storage Media Migration Helpers
 * ----------------------------------------------------------
 * Pure, testable helpers for converting historical tokenized Firebase Storage URLs
 * (`?alt=media&token=...`) in Firestore documents (`deliveries`, `conversations/messages`, `kyc`)
 * into authenticated backend media proxy routes or private storage paths.
 */

export const PRODUCTION_PROJECT_ID = 'gen-lang-client-0654978401';
export const PRODUCTION_DATABASE_ID = 'ai-studio-livralink-f9d2844b-bf6d-492f-9504-2721bd1820b6';
export const PRODUCTION_STORAGE_BUCKET = 'gen-lang-client-0654978401.firebasestorage.app';

export type ProtectedMediaPrefix = 'pod' | 'chat' | 'kyc';

export interface ParsedStorageObjectRef {
  bucket?: string;
  storagePath: string;
  prefix: ProtectedMediaPrefix | 'avatars' | 'other';
  hadDownloadToken: boolean;
}

/**
 * Extracts a normalized Firebase Storage object path from a legacy download URL
 * (firebasestorage.googleapis.com, storage.googleapis.com, or *.firebasestorage.app).
 * Returns null if the input is empty, already migrated to `/api/...`, or unsafe (`..`).
 */
export function extractStoragePathFromLegacyUrl(rawUrl: unknown): ParsedStorageObjectRef | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Already migrated proxy URLs are left untouched (idempotent)
  if (trimmed.startsWith('/api/pod/media?') || trimmed.startsWith('/api/chat/media?')) {
    return null;
  }

  // Raw storage path already stored without URL wrapper
  if (/^(pod|chat|kyc|avatars)\/[a-zA-Z0-9_.\-/]+$/.test(trimmed) && !trimmed.includes('..')) {
    const prefix = trimmed.split('/')[0] as ParsedStorageObjectRef['prefix'];
    return {
      storagePath: trimmed,
      prefix,
      hadDownloadToken: false,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const hadDownloadToken = parsed.searchParams.has('token');
  let bucket: string | undefined;
  let storagePath = '';

  if (host === 'firebasestorage.googleapis.com') {
    // Format: /v0/b/<bucket>/o/<urlEncodedObjectPath>
    const match = parsed.pathname.match(/^\/v\d+\/b\/([^/]+)\/o\/(.+)$/);
    if (!match) return null;
    bucket = decodeURIComponent(match[1]);
    try {
      storagePath = decodeURIComponent(match[2]);
    } catch {
      return null;
    }
  } else if (host === 'storage.googleapis.com') {
    // Format: /<bucket>/<objectPath>
    const trimmedPath = parsed.pathname.replace(/^\/+/, '');
    const slashIdx = trimmedPath.indexOf('/');
    if (slashIdx <= 0) return null;
    bucket = trimmedPath.slice(0, slashIdx);
    try {
      storagePath = decodeURIComponent(trimmedPath.slice(slashIdx + 1));
    } catch {
      return null;
    }
  } else if (host.endsWith('.firebasestorage.app') || host.endsWith('.storage.googleapis.com')) {
    bucket = host.replace(/\.storage\.googleapis\.com$/, '');
    try {
      storagePath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    } catch {
      return null;
    }
  } else {
    return null;
  }

  storagePath = storagePath.replace(/^\/+/, '');
  if (!storagePath || storagePath.includes('..') || storagePath.includes('\\')) {
    return null;
  }

  const firstSeg = storagePath.split('/')[0];
  const prefix: ParsedStorageObjectRef['prefix'] =
    firstSeg === 'pod' || firstSeg === 'chat' || firstSeg === 'kyc' || firstSeg === 'avatars'
      ? firstSeg
      : 'other';

  return {
    bucket,
    storagePath,
    prefix,
    hadDownloadToken,
  };
}

export interface PlannedDocPatch {
  collection: 'deliveries' | 'conversations_messages' | 'kyc';
  docPath: string;
  patch: Record<string, any>;
  migratedUrls: Array<{ field: string; from: string; to: string }>;
}

export function planDeliveryPodMediaMigration(
  docId: string,
  data: Record<string, any> | undefined,
  nowIso = new Date().toISOString()
): PlannedDocPatch | null {
  if (!data || !data.podData || typeof data.podData !== 'object') return null;

  const cleanDocId = String(docId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanDocId) return null;

  const patch: Record<string, any> = {};
  const migratedUrls: Array<{ field: string; from: string; to: string }> = [];

  for (const field of ['photoUrl', 'signatureDataUrl'] as const) {
    const rawVal = data.podData[field];
    const parsed = extractStoragePathFromLegacyUrl(rawVal);
    if (!parsed) continue;
    if (parsed.prefix !== 'pod') continue;

    // Preserve exact storage path and route via authenticated /api/pod/media proxy
    const proxyUrl = `/api/pod/media?path=${encodeURIComponent(parsed.storagePath)}`;
    if (rawVal !== proxyUrl) {
      patch[`podData.${field}`] = proxyUrl;
      migratedUrls.push({
        field: `podData.${field}`,
        from: String(rawVal),
        to: proxyUrl,
      });
    }
  }

  if (migratedUrls.length === 0) return null;
  patch['podData.mediaMigratedAt'] = nowIso;

  return {
    collection: 'deliveries',
    docPath: `deliveries/${cleanDocId}`,
    patch,
    migratedUrls,
  };
}

export function planChatMessageMediaMigration(
  convId: string,
  msgId: string,
  data: Record<string, any> | undefined,
  nowIso = new Date().toISOString()
): PlannedDocPatch | null {
  if (!data || typeof data.attachmentUrl !== 'string') return null;

  const parsed = extractStoragePathFromLegacyUrl(data.attachmentUrl);
  if (!parsed || parsed.prefix !== 'chat') return null;

  const proxyUrl = `/api/chat/media?path=${encodeURIComponent(parsed.storagePath)}`;
  if (data.attachmentUrl === proxyUrl) return null;

  return {
    collection: 'conversations_messages',
    docPath: `conversations/${convId}/messages/${msgId}`,
    patch: {
      attachmentUrl: proxyUrl,
      mediaMigratedAt: nowIso,
    },
    migratedUrls: [
      {
        field: 'attachmentUrl',
        from: data.attachmentUrl,
        to: proxyUrl,
      },
    ],
  };
}

export function planKycMediaMigration(
  userId: string,
  data: Record<string, any> | undefined,
  nowIso = new Date().toISOString()
): PlannedDocPatch | null {
  if (!data) return null;

  const rawPhotoUrl = typeof data.documentPhotoUrl === 'string' ? data.documentPhotoUrl.trim() : '';
  if (!rawPhotoUrl) return null;

  const parsed = extractStoragePathFromLegacyUrl(rawPhotoUrl);
  if (!parsed || parsed.prefix !== 'kyc') return null;

  const storagePath = typeof data.documentStoragePath === 'string' && data.documentStoragePath.trim()
    ? data.documentStoragePath.trim()
    : parsed.storagePath;

  return {
    collection: 'kyc',
    docPath: `kyc/${userId}`,
    patch: {
      documentStoragePath: storagePath,
      documentPhotoUrl: '',
      legacyUrlClearedAt: nowIso,
    },
    migratedUrls: [
      {
        field: 'documentPhotoUrl',
        from: rawPhotoUrl,
        to: `storagePath:${storagePath}`,
      },
    ],
  };
}
