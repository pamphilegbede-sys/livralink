/**
 * LivraLink Legacy Storage Token Revocation & Media Proxy Migration Script
 * -------------------------------------------------------------------------
 * Targets:
 * - Project           : gen-lang-client-0654978401
 * - Named Firestore   : ai-studio-livralink-f9d2844b-bf6d-492f-9504-2721bd1820b6
 * - Storage Bucket    : gen-lang-client-0654978401.firebasestorage.app
 *
 * SAFETY DEFAULTS:
 * - Runs in --dry-run mode by default (read-only audit, ZERO Storage/Firestore writes).
 * - Requires explicit --apply flag to revoke legacy `firebaseStorageDownloadTokens`
 *   on `kyc/`, `pod/`, `chat/` objects and update Firestore references to authenticated
 *   backend routes (`/api/pod/media`, `/api/chat/media`, and `documentStoragePath`).
 * - Creates a local JSON backup snapshot before applying mutations.
 *
 * Usage:
 *   npx tsx scripts/migrate-legacy-storage-media.ts --help
 *   npx tsx scripts/migrate-legacy-storage-media.ts --dry-run
 *   npx tsx scripts/migrate-legacy-storage-media.ts --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  PRODUCTION_PROJECT_ID,
  PRODUCTION_DATABASE_ID,
  PRODUCTION_STORAGE_BUCKET,
  PlannedDocPatch,
  planDeliveryPodMediaMigration,
  planChatMessageMediaMigration,
  planKycMediaMigration,
} from '../src/server/legacyMediaMigration';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface StorageTokenPatch {
  objectPath: string;
  previousTokenPreview: string;
}

interface MediaMigrationReport {
  projectId: string;
  databaseId: string;
  storageBucket: string;
  mode: 'dry-run' | 'apply';
  startedAt: string;
  storageObjectsScanned: number;
  storageObjectsWithDownloadTokens: StorageTokenPatch[];
  deliveriesScanned: number;
  messagesScanned: number;
  kycScanned: number;
  plannedFirestorePatches: PlannedDocPatch[];
  appliedStorageTokenRevocations: number;
  appliedFirestorePatches: number;
  backupFile?: string;
}

function printHelp() {
  console.log(`
LivraLink Legacy Storage Token & URL Migration Utility (Safe --dry-run by default)

Project        : ${PRODUCTION_PROJECT_ID}
Named Database : ${PRODUCTION_DATABASE_ID}
Storage Bucket : ${PRODUCTION_STORAGE_BUCKET}

Options:
  --dry-run   (Default) Read-only audit of tokenized URLs and Storage downloadTokens.
  --apply     Revoke firebaseStorageDownloadTokens under kyc/, pod/, chat/ and update Firestore refs.
  --help      Show this help message and exit.
`);
}

function loadConfig(): { projectId: string; databaseId: string; storageBucket: string } {
  const cfgPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return {
      projectId: raw.projectId || process.env.VITE_FIREBASE_PROJECT_ID || PRODUCTION_PROJECT_ID,
      databaseId: raw.firestoreDatabaseId || process.env.FIREBASE_DATABASE_ID || PRODUCTION_DATABASE_ID,
      storageBucket: raw.storageBucket || process.env.VITE_FIREBASE_STORAGE_BUCKET || PRODUCTION_STORAGE_BUCKET,
    };
  }
  return {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || PRODUCTION_PROJECT_ID,
    databaseId: process.env.FIREBASE_DATABASE_ID || PRODUCTION_DATABASE_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || PRODUCTION_STORAGE_BUCKET,
  };
}

function initAdmin(projectId: string, databaseId: string, storageBucket: string) {
  if (!getApps().length) {
    const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (saRaw) {
      initializeApp({
        credential: cert(JSON.parse(saRaw)),
        projectId,
        storageBucket,
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        projectId,
        storageBucket,
      });
    }
  }
  const app = getApps()[0];
  return {
    db: getFirestore(app, databaseId),
    bucket: getStorage(app).bucket(storageBucket),
  };
}

async function run() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const isApply = args.includes('--apply');
  const mode: 'dry-run' | 'apply' = isApply ? 'apply' : 'dry-run';
  const { projectId, databaseId, storageBucket } = loadConfig();

  console.log(
    `[LivraLink Storage Media Migration] Mode=${mode.toUpperCase()} | Project=${projectId} | DB=${databaseId} | Bucket=${storageBucket}`
  );

  const { db, bucket } = initAdmin(projectId, databaseId, storageBucket);
  const nowIso = new Date().toISOString();

  const report: MediaMigrationReport = {
    projectId,
    databaseId,
    storageBucket,
    mode,
    startedAt: nowIso,
    storageObjectsScanned: 0,
    storageObjectsWithDownloadTokens: [],
    deliveriesScanned: 0,
    messagesScanned: 0,
    kycScanned: 0,
    plannedFirestorePatches: [],
    appliedStorageTokenRevocations: 0,
    appliedFirestorePatches: 0,
  };

  // 1. Scan protected Storage prefixes for legacy firebaseStorageDownloadTokens
  for (const prefix of ['kyc/', 'pod/', 'chat/'] as const) {
    const [files] = await bucket.getFiles({ prefix });
    for (const file of files) {
      report.storageObjectsScanned++;
      const [meta] = await file.getMetadata();
      const customMeta = (meta?.metadata || {}) as Record<string, string | undefined>;
      const rawToken = customMeta.firebaseStorageDownloadTokens;
      if (rawToken && String(rawToken).trim().length > 0) {
        report.storageObjectsWithDownloadTokens.push({
          objectPath: file.name,
          previousTokenPreview: `${String(rawToken).slice(0, 6)}...`,
        });
      }
    }
  }

  // 2. Scan deliveries POD URLs
  const deliveriesSnap = await db.collection('deliveries').get();
  for (const docSnap of deliveriesSnap.docs) {
    report.deliveriesScanned++;
    const plan = planDeliveryPodMediaMigration(docSnap.id, docSnap.data(), nowIso);
    if (plan) report.plannedFirestorePatches.push(plan);
  }

  // 3. Scan conversation messages attachment URLs
  const convsSnap = await db.collection('conversations').get();
  for (const convDoc of convsSnap.docs) {
    const msgsSnap = await convDoc.ref.collection('messages').get();
    for (const msgDoc of msgsSnap.docs) {
      report.messagesScanned++;
      const plan = planChatMessageMediaMigration(convDoc.id, msgDoc.id, msgDoc.data(), nowIso);
      if (plan) report.plannedFirestorePatches.push(plan);
    }
  }

  // 4. Scan KYC dossier URLs
  const kycSnap = await db.collection('kyc').get();
  for (const kycDoc of kycSnap.docs) {
    report.kycScanned++;
    const plan = planKycMediaMigration(kycDoc.id, kycDoc.data(), nowIso);
    if (plan) report.plannedFirestorePatches.push(plan);
  }

  if (mode === 'apply') {
    const backupDir = path.join(ROOT_DIR, 'scripts', 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `legacy-storage-media-backup-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(report, null, 2), 'utf8');
    report.backupFile = backupPath;
    console.log(`[BACKUP] Snapshot saved at ${backupPath}`);

    // Apply Firestore patches in safe chunks (<= 400 per batch)
    for (let i = 0; i < report.plannedFirestorePatches.length; i += 400) {
      const chunk = report.plannedFirestorePatches.slice(i, i + 400);
      const batch = db.batch();
      for (const item of chunk) {
        batch.update(db.doc(item.docPath), item.patch);
      }
      await batch.commit();
      report.appliedFirestorePatches += chunk.length;
    }

    // Revoke legacy firebaseStorageDownloadTokens on Storage objects
    for (const target of report.storageObjectsWithDownloadTokens) {
      const file = bucket.file(target.objectPath);
      await file.setMetadata({
        metadata: {
          firebaseStorageDownloadTokens: null as any,
          downloadTokensRevokedAt: nowIso,
        },
      });
      report.appliedStorageTokenRevocations++;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        projectId: report.projectId,
        databaseId: report.databaseId,
        storageBucket: report.storageBucket,
        storageObjectsScanned: report.storageObjectsScanned,
        storageObjectsWithDownloadTokensCount: report.storageObjectsWithDownloadTokens.length,
        deliveriesScanned: report.deliveriesScanned,
        messagesScanned: report.messagesScanned,
        kycScanned: report.kycScanned,
        plannedFirestorePatchesCount: report.plannedFirestorePatches.length,
        appliedStorageTokenRevocations: report.appliedStorageTokenRevocations,
        appliedFirestorePatches: report.appliedFirestorePatches,
        backupFile: report.backupFile,
      },
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error('[LivraLink Storage Media Migration ERROR]', err?.message || err);
  process.exit(1);
});
