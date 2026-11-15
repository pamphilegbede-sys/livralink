/**
 * LivraLink P0 Legacy Data Audit & Migration Script
 * -------------------------------------------------
 * Targets the named Firestore database:
 *   ai-studio-livralink-f9d2844b-bf6d-492f-9504-2721bd1820b6
 *
 * SAFETY DEFAULTS:
 * - Runs in --dry-run mode by default (read-only audit, ZERO Firestore writes).
 * - Requires explicit --apply flag to perform batch writes.
 * - Creates a local JSON backup snapshot + rollback instructions before writing.
 *
 * Usage:
 *   npx tsx scripts/migrate-p0-legacy.ts --help
 *   npx tsx scripts/migrate-p0-legacy.ts --dry-run
 *   npx tsx scripts/migrate-p0-legacy.ts --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const NAMED_DATABASE_ID = 'ai-studio-livralink-f9d2844b-bf6d-492f-9504-2721bd1820b6';

interface PlannedMutation {
  collection: 'deliveries' | 'deliveries_private_otp' | 'priority_missions' | 'kyc';
  docPath: string;
  action: 'set_private_otp' | 'delete_plaintext_otp' | 'patch_priority_mission' | 'patch_kyc';
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

interface AuditSummary {
  databaseId: string;
  mode: 'dry-run' | 'apply';
  startedAt: string;
  deliveriesScanned: number;
  deliveriesWithPlaintextOtp: number;
  priorityMissionsScanned: number;
  priorityMissionsMissingMerchantOrOrderId: number;
  usersScanned: number;
  usersWithLegacyExtraFields: Array<{ uid: string; extraFields: string[] }>;
  kycScanned: number;
  kycMissingIdentityLinks: number;
  plannedMutations: PlannedMutation[];
  appliedCount: number;
  backupFile?: string;
}

const ALLOWED_USER_KEYS = new Set([
  'uid', 'email', 'fullName', 'phone', 'role', 'channel', 'status', 'avatarUrl',
  'storeName', 'storeCommune', 'storeAddress', 'storeCoordinates', 'vehicleType',
  'gpsCoordinates', 'locationCommune', 'locationAddress', 'locationLat', 'locationLng',
  'locationUpdatedAt', 'isKycVerified', 'kycStatus', 'kycRejectionReason',
  'kycSubmittedAt', 'preferredRateDiscountPercent', 'mfaEnabled', 'mfaMethod',
  'createdAt', 'updatedAt',
]);

function printHelp() {
  console.log(`
LivraLink P0 Legacy Migration Utility (Safe --dry-run by default)

Target database : ${NAMED_DATABASE_ID}

Options:
  --dry-run   (Default) Read-only audit of legacy fields without modifying Firestore.
  --apply     Apply idempotent migrations after writing a JSON backup snapshot.
  --help      Show this help message and exit.
`);
}

function loadDatabaseConfig(): { projectId: string; databaseId: string } {
  const cfgPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return {
      projectId: raw.projectId || process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0654978401',
      databaseId: raw.firestoreDatabaseId || process.env.FIREBASE_DATABASE_ID || NAMED_DATABASE_ID,
    };
  }
  return {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0654978401',
    databaseId: process.env.FIREBASE_DATABASE_ID || NAMED_DATABASE_ID,
  };
}

function initAdminFirestore(projectId: string, databaseId: string) {
  if (!getApps().length) {
    const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (saRaw) {
      const parsed = JSON.parse(saRaw);
      initializeApp({ credential: cert(parsed), projectId });
    } else {
      initializeApp({ credential: applicationDefault(), projectId });
    }
  }
  return getFirestore(getApps()[0], databaseId);
}

async function run() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const isApply = args.includes('--apply');
  const mode: 'dry-run' | 'apply' = isApply ? 'apply' : 'dry-run';

  const { projectId, databaseId } = loadDatabaseConfig();
  if (databaseId !== NAMED_DATABASE_ID) {
    console.warn(`Warning: config databaseId (${databaseId}) differs from expected (${NAMED_DATABASE_ID}).`);
  }

  console.log(`[LivraLink Migration] Mode=${mode.toUpperCase()} | Project=${projectId} | Database=${databaseId}`);

  const db = initAdminFirestore(projectId, databaseId);
  const summary: AuditSummary = {
    databaseId,
    mode,
    startedAt: new Date().toISOString(),
    deliveriesScanned: 0,
    deliveriesWithPlaintextOtp: 0,
    priorityMissionsScanned: 0,
    priorityMissionsMissingMerchantOrOrderId: 0,
    usersScanned: 0,
    usersWithLegacyExtraFields: [],
    kycScanned: 0,
    kycMissingIdentityLinks: 0,
    plannedMutations: [],
    appliedCount: 0,
  };

  // 1. Audit /deliveries for plaintext otpCode
  const deliveriesSnap = await db.collection('deliveries').get();
  const deliveryMerchantByOrderId = new Map<string, string>();
  summary.deliveriesScanned = deliveriesSnap.size;

  for (const dDoc of deliveriesSnap.docs) {
    const data = dDoc.data();
    const orderIdKey = String(data.id || data.orderId || dDoc.id).trim();
    if (orderIdKey && data.merchantId) {
      deliveryMerchantByOrderId.set(orderIdKey, String(data.merchantId));
      deliveryMerchantByOrderId.set(orderIdKey.replace(/^#/, ''), String(data.merchantId));
    }

    if (typeof data.otpCode === 'string' && data.otpCode.trim().length > 0) {
      summary.deliveriesWithPlaintextOtp++;
      const cleanOtp = data.otpCode.trim();
      const privateOtpPath = `deliveries/${dDoc.id}/private/otp`;
      const existingOtpSnap = await db.doc(privateOtpPath).get();

      if (!existingOtpSnap.exists) {
        summary.plannedMutations.push({
          collection: 'deliveries_private_otp',
          docPath: privateOtpPath,
          action: 'set_private_otp',
          before: {},
          after: {
            otpCode: cleanOtp,
            merchantId: data.merchantId || '',
            migratedFromDelivery: dDoc.id,
            generatedAt: data.createdAt || Date.now(),
          },
        });
      }

      summary.plannedMutations.push({
        collection: 'deliveries',
        docPath: `deliveries/${dDoc.id}`,
        action: 'delete_plaintext_otp',
        before: { otpCode: cleanOtp },
        after: { otpCode: '<DELETE_FIELD>', otpRequired: true },
      });
    }
  }

  // 2. Audit /priority_missions for missing merchantId / orderId
  const missionsSnap = await db.collection('priority_missions').get();
  summary.priorityMissionsScanned = missionsSnap.size;
  for (const mDoc of missionsSnap.docs) {
    const data = mDoc.data();
    const rawOrderId = String(data.orderId || data.id || mDoc.id).trim();
    const needsMerchant = !data.merchantId;
    const needsOrderId = !data.orderId;
    if (needsMerchant || needsOrderId) {
      summary.priorityMissionsMissingMerchantOrOrderId++;
      const resolvedMerchantId =
        data.merchantId ||
        deliveryMerchantByOrderId.get(rawOrderId) ||
        deliveryMerchantByOrderId.get(rawOrderId.replace(/^#/, '')) ||
        '';
      if (resolvedMerchantId || needsOrderId) {
        summary.plannedMutations.push({
          collection: 'priority_missions',
          docPath: `priority_missions/${mDoc.id}`,
          action: 'patch_priority_mission',
          before: { merchantId: data.merchantId || null, orderId: data.orderId || null },
          after: {
            ...(needsMerchant && resolvedMerchantId ? { merchantId: resolvedMerchantId } : {}),
            ...(needsOrderId ? { orderId: rawOrderId } : {}),
            legacyMigrated: true,
            migratedAt: new Date().toISOString(),
          },
        });
      }
    }
  }

  // 3. Audit /users for legacy extra fields
  const usersSnap = await db.collection('users').get();
  summary.usersScanned = usersSnap.size;
  for (const uDoc of usersSnap.docs) {
    const keys = Object.keys(uDoc.data());
    const extraFields = keys.filter((k) => !ALLOWED_USER_KEYS.has(k));
    if (extraFields.length > 0) {
      summary.usersWithLegacyExtraFields.push({ uid: uDoc.id, extraFields });
    }
  }

  // 4. Audit /kyc for missing id / userId links
  const kycSnap = await db.collection('kyc').get();
  summary.kycScanned = kycSnap.size;
  for (const kDoc of kycSnap.docs) {
    const data = kDoc.data();
    const needsId = !data.id;
    const needsUserId = !data.userId;
    if (needsId || needsUserId) {
      summary.kycMissingIdentityLinks++;
      summary.plannedMutations.push({
        collection: 'kyc',
        docPath: `kyc/${kDoc.id}`,
        action: 'patch_kyc',
        before: { id: data.id || null, userId: data.userId || null },
        after: {
          ...(needsId ? { id: kDoc.id } : {}),
          ...(needsUserId ? { userId: String(data.courierId || kDoc.id) } : {}),
        },
      });
    }
  }

  // Write backup / dry-run report file locally
  const backupsDir = path.join(__dirname, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `migration-${mode}-${stamp}.json`);
  summary.backupFile = backupPath;

  if (mode === 'dry-run') {
    fs.writeFileSync(backupPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(JSON.stringify({
      status: 'DRY_RUN_COMPLETE',
      databaseId: summary.databaseId,
      deliveriesScanned: summary.deliveriesScanned,
      deliveriesWithPlaintextOtp: summary.deliveriesWithPlaintextOtp,
      priorityMissionsScanned: summary.priorityMissionsScanned,
      priorityMissionsMissingMerchantOrOrderId: summary.priorityMissionsMissingMerchantOrOrderId,
      usersScanned: summary.usersScanned,
      usersWithLegacyExtraFieldsCount: summary.usersWithLegacyExtraFields.length,
      kycScanned: summary.kycScanned,
      kycMissingIdentityLinks: summary.kycMissingIdentityLinks,
      plannedMutationsCount: summary.plannedMutations.length,
      backupReportPath: backupPath,
    }, null, 2));
    return;
  }

  // --apply mode: save pre-write backup FIRST, then execute chunked batches (max 400 ops/batch)
  fs.writeFileSync(backupPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`[LivraLink Migration] Snapshot saved to ${backupPath}. Applying ${summary.plannedMutations.length} operations...`);

  const CHUNK_SIZE = 400;
  for (let i = 0; i < summary.plannedMutations.length; i += CHUNK_SIZE) {
    const chunk = summary.plannedMutations.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    for (const op of chunk) {
      const ref = db.doc(op.docPath);
      if (op.action === 'set_private_otp') {
        batch.set(ref, op.after, { merge: true });
      } else if (op.action === 'delete_plaintext_otp') {
        batch.update(ref, { otpCode: FieldValue.delete(), otpRequired: true });
      } else {
        batch.set(ref, op.after, { merge: true });
      }
    }
    await batch.commit();
    summary.appliedCount += chunk.length;
  }

  fs.writeFileSync(backupPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`[LivraLink Migration] Applied ${summary.appliedCount} operations cleanly.`);
}

run().catch((err) => {
  console.error('[LivraLink Migration ERROR]:', err?.message || err);
  process.exit(1);
});
