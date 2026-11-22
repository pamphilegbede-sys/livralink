import crypto from 'crypto';

export const SYSTEM_BACKUPS_COLLECTION = 'system_backups';
export const SYSTEM_BACKUP_LATEST_DOC_ID = 'latest';
export const MAX_BACKUP_PAYLOAD_BYTES = 750 * 1024; // 750 KB (< 1 MiB Firestore document cap)
export const MAX_DOCS_PER_EXPORTED_COLLECTION = 250;

/**
 * Collections opérationnelles exportées par défaut lorsqu'aucun instantané explicite `data` n'est fourni.
 * Les collections d'administration racine et de secrets internes (`admins`, `system_config`, `auth_reset_*`,
 * `pod_otp_*`, `payout_*`, `email_*`, `ai_usage_guards`, `system_backups`) sont strictement exclues.
 */
export const SAFE_BACKUP_COLLECTIONS = [
  'users',
  'deliveries',
  'priority_missions',
  'kyc',
  'notifications',
  'announcements',
  'wallet_transactions',
] as const;

export const SAFE_RESTORE_COLLECTIONS = [
  'users',
  'deliveries',
  'priority_missions',
  'kyc',
  'notifications',
  'announcements',
] as const;

export type BackupMode = 'payload_snapshot' | 'operational_collections';

export class SystemBackupError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'SystemBackupError';
    this.status = status;
    this.code = code;
  }
}

export interface BackupDocSnapshotLike {
  exists: boolean;
  id: string;
  data(): Record<string, any> | undefined;
}

export interface BackupCollectionRefLike {
  doc(id: string): {
    id?: string;
    get(): Promise<BackupDocSnapshotLike>;
    set(data: Record<string, any>, options?: { merge?: boolean }): Promise<any>;
  };
  limit?(n: number): {
    get(): Promise<{ empty?: boolean; docs: BackupDocSnapshotLike[] }>;
  };
  orderBy?(field: string, direction?: 'asc' | 'desc'): {
    limit?(n: number): {
      get(): Promise<{ empty?: boolean; docs: BackupDocSnapshotLike[] }>;
    };
    get(): Promise<{ empty?: boolean; docs: BackupDocSnapshotLike[] }>;
  };
  get?(): Promise<{ empty?: boolean; docs: BackupDocSnapshotLike[] }>;
}

export interface BackupFirestoreLike {
  collection(name: string): BackupCollectionRefLike;
  batch?(): {
    set(ref: any, data: Record<string, any>, options?: { merge?: boolean }): any;
    commit(): Promise<any>;
  };
}

export interface SystemBackupMetadata {
  backupId: string;
  timestamp: string;
  checksum: string;
  mode: BackupMode;
  sizeBytes: number;
  storage: 'firestore_persistent';
  instanceRevision?: string;
  createdByUid?: string;
  createdByEmail?: string;
  note?: string;
  collectionsSummary?: Record<string, number>;
}

export interface CreateSystemBackupResult extends SystemBackupMetadata {
  snapshotChecksum: string;
}

export interface RestoreSystemBackupResult {
  backupId: string;
  timestamp: string;
  checksum: string;
  integrityVerified: true;
  mode: BackupMode;
  storage: 'firestore_persistent';
  appliedToFirestore: boolean;
  restoredDocCount: number;
  restoredData: unknown;
}

function isIamDeniedError(err: any): boolean {
  const code = String(err?.code ?? '');
  const msg = String(err?.message || err || '');
  return code === '7' || /PERMISSION_DENIED|Missing or insufficient permissions/i.test(msg);
}

function normalizeJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as any)?.toDate === 'function') {
    try {
      return (value as any).toDate().toISOString();
    } catch {
      return String(value);
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        out[key] = normalizeJsonValue(v);
      }
    }
    return out;
  }
  return value;
}

export function computePayloadChecksum(payloadJson: string): string {
  return crypto.createHash('sha256').update(payloadJson, 'utf8').digest('hex');
}

export function verifySha256TimingSafe(payloadJson: string, expectedHex: string): boolean {
  if (typeof payloadJson !== 'string' || typeof expectedHex !== 'string') {
    return false;
  }
  const cleanExpected = expectedHex.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(cleanExpected)) {
    return false;
  }
  const actualHex = computePayloadChecksum(payloadJson);
  const actualBuf = Buffer.from(actualHex, 'hex');
  const expectedBuf = Buffer.from(cleanExpected, 'hex');
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

async function readCollectionDocs(
  colRef: BackupCollectionRefLike,
  maxDocs: number
): Promise<BackupDocSnapshotLike[]> {
  if (typeof colRef.limit === 'function') {
    const snap = await colRef.limit(maxDocs).get();
    return snap.docs || [];
  }
  if (typeof colRef.get === 'function') {
    const snap = await colRef.get();
    return (snap.docs || []).slice(0, maxDocs);
  }
  throw new SystemBackupError(
    503,
    'FIRESTORE_API_INCOMPATIBLE',
    'Interface Firestore incompatible pour la lecture de sauvegarde.'
  );
}

export async function createSystemBackup(
  db: BackupFirestoreLike | null,
  options: {
    data?: unknown;
    includeCollections?: string[];
    requestedByUid?: string;
    requestedByEmail?: string;
    note?: string;
    instanceRevision?: string;
    nowMs?: number;
  } = {}
): Promise<CreateSystemBackupResult> {
  if (!db) {
    throw new SystemBackupError(
      503,
      'FIRESTORE_UNAVAILABLE',
      'Service de sauvegarde persistant indisponible : Firestore Admin SDK non initialisé.'
    );
  }

  const nowMs = options.nowMs ?? Date.now();
  const timestamp = new Date(nowMs).toISOString();
  const backupId = `bkp_${nowMs}_${crypto.randomBytes(4).toString('hex')}`;
  const instanceRevision =
    options.instanceRevision ||
    process.env.K_REVISION ||
    process.env.RENDER_INSTANCE_ID ||
    `node_${process.pid}`;

  let mode: BackupMode = 'payload_snapshot';
  let payloadToStore: unknown = options.data;
  const collectionsSummary: Record<string, number> = {};

  try {
    if (options.data === undefined) {
      mode = 'operational_collections';
      const allowedSet = new Set<string>(SAFE_BACKUP_COLLECTIONS);
      const requestedCols = Array.isArray(options.includeCollections) && options.includeCollections.length > 0
        ? options.includeCollections.filter((c) => allowedSet.has(c))
        : [...SAFE_BACKUP_COLLECTIONS];

      if (requestedCols.length === 0) {
        throw new SystemBackupError(
          400,
          'INVALID_BACKUP_COLLECTIONS',
          'Aucune collection opérationnelle autorisée sélectionnée pour la sauvegarde.'
        );
      }

      const collectionsPayload: Record<string, Record<string, unknown>> = {};
      for (const colName of requestedCols) {
        const docs = await readCollectionDocs(db.collection(colName), MAX_DOCS_PER_EXPORTED_COLLECTION);
        const docsMap: Record<string, unknown> = {};
        for (const d of docs) {
          const docData = d.data();
          if (docData) {
            docsMap[d.id] = normalizeJsonValue(docData);
          }
        }
        collectionsPayload[colName] = docsMap;
        collectionsSummary[colName] = Object.keys(docsMap).length;
      }

      payloadToStore = {
        schemaVersion: 1,
        exportedAt: timestamp,
        collections: collectionsPayload,
      };
    }

    const payloadJson = JSON.stringify(payloadToStore ?? {});
    const sizeBytes = Buffer.byteLength(payloadJson, 'utf8');
    if (sizeBytes > MAX_BACKUP_PAYLOAD_BYTES) {
      throw new SystemBackupError(
        413,
        'BACKUP_PAYLOAD_TOO_LARGE',
        `Instantané trop volumineux (${Math.round(sizeBytes / 1024)} Ko > ${Math.round(
          MAX_BACKUP_PAYLOAD_BYTES / 1024
        )} Ko max par document Firestore).`
      );
    }

    const checksum = computePayloadChecksum(payloadJson);
    const cleanNote =
      typeof options.note === 'string' && options.note.trim()
        ? options.note.trim().slice(0, 240)
        : undefined;

    const record: Record<string, any> = {
      backupId,
      timestamp,
      checksum,
      mode,
      sizeBytes,
      storage: 'firestore_persistent',
      instanceRevision: String(instanceRevision).slice(0, 128),
      createdByUid: options.requestedByUid ? String(options.requestedByUid).slice(0, 128) : '',
      createdByEmail: options.requestedByEmail ? String(options.requestedByEmail).slice(0, 128) : '',
      payloadJson,
      createdAtMs: nowMs,
      ...(cleanNote ? { note: cleanNote } : {}),
      ...(Object.keys(collectionsSummary).length > 0 ? { collectionsSummary } : {}),
    };

    const backupsCol = db.collection(SYSTEM_BACKUPS_COLLECTION);
    const historyRef = backupsCol.doc(backupId);
    const latestRef = backupsCol.doc(SYSTEM_BACKUP_LATEST_DOC_ID);

    if (typeof db.batch === 'function') {
      const batch = db.batch();
      batch.set(historyRef, record);
      batch.set(latestRef, {
        ...record,
        pointerToBackupId: backupId,
      });
      await batch.commit();
    } else {
      await Promise.all([
        historyRef.set(record),
        latestRef.set({
          ...record,
          pointerToBackupId: backupId,
        }),
      ]);
    }

    return {
      backupId,
      timestamp,
      checksum,
      snapshotChecksum: checksum,
      mode,
      sizeBytes,
      storage: 'firestore_persistent',
      instanceRevision: record.instanceRevision,
      createdByUid: record.createdByUid,
      createdByEmail: record.createdByEmail,
      ...(cleanNote ? { note: cleanNote } : {}),
      ...(Object.keys(collectionsSummary).length > 0 ? { collectionsSummary } : {}),
    };
  } catch (err: any) {
    if (err instanceof SystemBackupError) {
      throw err;
    }
    if (isIamDeniedError(err)) {
      throw new SystemBackupError(
        503,
        'IAM_PERMISSION_DENIED',
        'Permissions IAM Cloud Firestore insuffisantes pour écrire dans system_backups.'
      );
    }
    throw new SystemBackupError(
      500,
      'BACKUP_PERSISTENCE_FAILED',
      err?.message || 'Erreur lors de la persistance de la sauvegarde Firestore.'
    );
  }
}

export async function restoreSystemBackup(
  db: BackupFirestoreLike | null,
  options: {
    backupId?: string;
    applyToFirestore?: boolean;
  } = {}
): Promise<RestoreSystemBackupResult> {
  if (!db) {
    throw new SystemBackupError(
      503,
      'FIRESTORE_UNAVAILABLE',
      'Service de restauration indisponible : Firestore Admin SDK non initialisé.'
    );
  }

  const requestedId =
    typeof options.backupId === 'string' && options.backupId.trim()
      ? options.backupId.trim()
      : SYSTEM_BACKUP_LATEST_DOC_ID;

  if (
    requestedId !== SYSTEM_BACKUP_LATEST_DOC_ID &&
    !/^[a-zA-Z0-9_-]{1,100}$/.test(requestedId)
  ) {
    throw new SystemBackupError(400, 'INVALID_BACKUP_ID', 'Identifiant de sauvegarde invalide.');
  }

  try {
    const docSnap = await db.collection(SYSTEM_BACKUPS_COLLECTION).doc(requestedId).get();
    if (!docSnap.exists) {
      throw new SystemBackupError(
        404,
        'BACKUP_NOT_FOUND',
        'Aucun instantané de sauvegarde disponible dans Firestore.'
      );
    }

    const stored = docSnap.data() || {};
    const payloadJson = typeof stored.payloadJson === 'string' ? stored.payloadJson : '';
    const storedChecksum = typeof stored.checksum === 'string' ? stored.checksum : '';

    if (!payloadJson || !verifySha256TimingSafe(payloadJson, storedChecksum)) {
      throw new SystemBackupError(
        409,
        'BACKUP_CHECKSUM_MISMATCH',
        'Intégrité cryptographique SHA-256 compromise : sauvegarde rejetée.'
      );
    }

    let restoredData: unknown;
    try {
      restoredData = JSON.parse(payloadJson);
    } catch {
      throw new SystemBackupError(
        409,
        'BACKUP_CORRUPTED_JSON',
        'Données de sauvegarde JSON corrompues.'
      );
    }

    const mode: BackupMode =
      stored.mode === 'operational_collections' ? 'operational_collections' : 'payload_snapshot';
    const resolvedBackupId = String(stored.pointerToBackupId || stored.backupId || requestedId);
    let restoredDocCount = 0;
    let appliedToFirestore = false;

    if (options.applyToFirestore === true) {
      if (mode !== 'operational_collections' || !restoredData || typeof (restoredData as any).collections !== 'object') {
        throw new SystemBackupError(
          400,
          'RESTORE_MODE_NOT_APPLICABLE',
          'La restauration directe dans Firestore nécessite une sauvegarde de type operational_collections.'
        );
      }

      const safeColsSet = new Set<string>(SAFE_RESTORE_COLLECTIONS);
      const collectionsMap = (restoredData as any).collections as Record<string, Record<string, any>>;

      const operations: Array<{ colName: string; docId: string; data: Record<string, any> }> = [];
      for (const [colName, docsMap] of Object.entries(collectionsMap)) {
        if (!safeColsSet.has(colName) || !docsMap || typeof docsMap !== 'object') continue;
        for (const [docId, docData] of Object.entries(docsMap)) {
          if (!/^[a-zA-Z0-9_#-]{1,128}$/.test(docId) || !docData || typeof docData !== 'object') {
            continue;
          }
          operations.push({ colName, docId, data: docData });
        }
      }

      const BATCH_LIMIT = 400;
      for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
        const chunk = operations.slice(i, i + BATCH_LIMIT);
        if (typeof db.batch === 'function') {
          const batch = db.batch();
          for (const op of chunk) {
            batch.set(db.collection(op.colName).doc(op.docId), op.data, { merge: true });
          }
          await batch.commit();
        } else {
          await Promise.all(
            chunk.map((op) => db.collection(op.colName).doc(op.docId).set(op.data, { merge: true }))
          );
        }
        restoredDocCount += chunk.length;
      }
      appliedToFirestore = true;
    }

    return {
      backupId: resolvedBackupId,
      timestamp: String(stored.timestamp || ''),
      checksum: computePayloadChecksum(payloadJson),
      integrityVerified: true,
      mode,
      storage: 'firestore_persistent',
      appliedToFirestore,
      restoredDocCount,
      restoredData,
    };
  } catch (err: any) {
    if (err instanceof SystemBackupError) {
      throw err;
    }
    if (isIamDeniedError(err)) {
      throw new SystemBackupError(
        503,
        'IAM_PERMISSION_DENIED',
        'Permissions IAM Cloud Firestore insuffisantes pour lire ou restaurer system_backups.'
      );
    }
    throw new SystemBackupError(
      500,
      'BACKUP_RESTORE_FAILED',
      err?.message || 'Erreur lors de la restauration de la sauvegarde Firestore.'
    );
  }
}

export async function listSystemBackups(
  db: BackupFirestoreLike | null,
  limitCount = 20
): Promise<SystemBackupMetadata[]> {
  if (!db) {
    throw new SystemBackupError(
      503,
      'FIRESTORE_UNAVAILABLE',
      'Service de sauvegarde indisponible : Firestore Admin SDK non initialisé.'
    );
  }

  try {
    const col = db.collection(SYSTEM_BACKUPS_COLLECTION);
    let docs: BackupDocSnapshotLike[] = [];
    if (typeof col.orderBy === 'function') {
      const ordered = col.orderBy('createdAtMs', 'desc');
      if (typeof ordered.limit === 'function') {
        const snap = await ordered.limit(Math.min(Math.max(limitCount, 1), 50) + 1).get();
        docs = snap.docs || [];
      } else {
        const snap = await ordered.get();
        docs = snap.docs || [];
      }
    } else {
      docs = await readCollectionDocs(col, 60);
    }

    return docs
      .filter((d) => d.id !== SYSTEM_BACKUP_LATEST_DOC_ID)
      .map((d) => {
        const data = d.data() || {};
        return {
          backupId: String(data.backupId || d.id),
          timestamp: String(data.timestamp || ''),
          checksum: String(data.checksum || ''),
          mode: (data.mode === 'operational_collections' ? 'operational_collections' : 'payload_snapshot') as BackupMode,
          sizeBytes: Number(data.sizeBytes || 0),
          storage: 'firestore_persistent' as const,
          instanceRevision: typeof data.instanceRevision === 'string' ? data.instanceRevision : undefined,
          createdByUid: typeof data.createdByUid === 'string' ? data.createdByUid : undefined,
          createdByEmail: typeof data.createdByEmail === 'string' ? data.createdByEmail : undefined,
          note: typeof data.note === 'string' ? data.note : undefined,
          collectionsSummary:
            data.collectionsSummary && typeof data.collectionsSummary === 'object'
              ? data.collectionsSummary
              : undefined,
          _sortMs: Number(data.createdAtMs || 0),
        };
      })
      .sort((a, b) => b._sortMs - a._sortMs)
      .slice(0, Math.min(Math.max(limitCount, 1), 50))
      .map(({ _sortMs: _omit, ...meta }) => meta);
  } catch (err: any) {
    if (err instanceof SystemBackupError) {
      throw err;
    }
    if (isIamDeniedError(err)) {
      throw new SystemBackupError(
        503,
        'IAM_PERMISSION_DENIED',
        'Permissions IAM Cloud Firestore insuffisantes pour lister system_backups.'
      );
    }
    throw new SystemBackupError(
      500,
      'BACKUP_LIST_FAILED',
      err?.message || 'Erreur lors du listage des sauvegardes Firestore.'
    );
  }
}
