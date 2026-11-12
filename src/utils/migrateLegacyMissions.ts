import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface MigrationResult {
  totalChecked: number;
  migratedCount: number;
  skippedCount: number;
  errors: string[];
}

/**
 * Non-destructive migration utility for legacy priority_missions lacking merchantId.
 * Maps missing merchantId from corresponding delivery document or default seller.
 */
export const migrateLegacyPriorityMissions = async (): Promise<MigrationResult> => {
  const result: MigrationResult = {
    totalChecked: 0,
    migratedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  try {
    const prioritySnap = await getDocs(collection(db, 'priority_missions'));
    const deliveriesSnap = await getDocs(collection(db, 'deliveries'));

    const deliveriesMap = new Map<string, string>();
    deliveriesSnap.forEach((dDoc) => {
      const data = dDoc.data();
      if (data.id && data.merchantId) {
        deliveriesMap.set(String(data.id).trim(), String(data.merchantId).trim());
      }
    });

    const batch = writeBatch(db);
    let batchCount = 0;

    prioritySnap.forEach((pDoc) => {
      result.totalChecked++;
      const data = pDoc.data();
      const orderId = data.orderId || data.id || pDoc.id;

      if (!data.merchantId) {
        const foundMerchantId = deliveriesMap.get(orderId) || 'pamphile_gbede_admin_legacy';
        batch.update(doc(db, 'priority_missions', pDoc.id), {
          merchantId: foundMerchantId,
          legacyMigrated: true,
          migratedAt: new Date().toISOString(),
        });
        batchCount++;
        result.migratedCount++;
      } else {
        result.skippedCount++;
      }
    });

    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (err: any) {
    result.errors.push(err?.message || 'Erreur inconnue lors de la migration');
  }

  return result;
};
