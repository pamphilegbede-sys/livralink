import crypto from 'crypto';
import type { AdminRoleId, PlatformAuditLog } from '../types';

export const ADMIN_AUDIT_LOGS_COLLECTION = 'admin_audit_logs';

export interface AuditDbLike {
  collection(name: string): any;
}

export interface RecordAdminAuditInput {
  adminUid: string;
  adminEmail: string;
  adminRole?: AdminRoleId | string;
  category: PlatformAuditLog['category'];
  action: string;
  targetType: string;
  targetId: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  result?: PlatformAuditLog['result'];
}

function sanitizeAuditValue(val: any): any {
  if (val === undefined) return null;
  if (val === null) return null;
  if (typeof val === 'string') return val.slice(0, 500);
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (Array.isArray(val)) return val.slice(0, 20).map(sanitizeAuditValue);
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (k.toLowerCase().includes('pass') || k.toLowerCase().includes('secret') || k.toLowerCase().includes('token')) {
        out[k] = '[REDACTED]';
      } else if (v !== undefined) {
        out[k] = sanitizeAuditValue(v);
      }
    }
    return out;
  }
  return String(val).slice(0, 200);
}

export async function recordAdminAuditLog(
  db: AuditDbLike | null | undefined,
  input: RecordAdminAuditInput
): Promise<PlatformAuditLog> {
  const nowMs = Date.now();
  const id = `audit_${nowMs}_${crypto.randomBytes(4).toString('hex')}`;
  const entry: PlatformAuditLog = {
    id,
    adminUid: String(input.adminUid || 'system'),
    adminEmail: String(input.adminEmail || 'system'),
    adminRole: String(input.adminRole || 'admin'),
    category: input.category,
    action: String(input.action || 'ACTION').slice(0, 140),
    targetType: String(input.targetType || 'system').slice(0, 64),
    targetId: String(input.targetId || '-').slice(0, 128),
    oldValue: sanitizeAuditValue(input.oldValue),
    newValue: sanitizeAuditValue(input.newValue),
    reason: input.reason ? String(input.reason).trim().slice(0, 500) : undefined,
    result: input.result || 'success',
    timestamp: new Date(nowMs).toISOString(),
    createdAtMs: nowMs,
  };

  if (db) {
    try {
      const payload: Record<string, any> = { ...entry };
      if (payload.reason === undefined) delete payload.reason;
      await db.collection(ADMIN_AUDIT_LOGS_COLLECTION).doc(id).set(payload);
    } catch (err: any) {
      console.warn('[ADMIN AUDIT LOG WARN]:', err?.message || err);
    }
  }
  return entry;
}

export async function listAdminAuditLogs(
  db: AuditDbLike | null | undefined,
  filters?: {
    category?: string;
    adminEmail?: string;
    search?: string;
    limit?: number;
  }
): Promise<PlatformAuditLog[]> {
  if (!db) return [];
  const limit = Math.min(200, Math.max(10, Number(filters?.limit) || 100));
  const snap = await db.collection(ADMIN_AUDIT_LOGS_COLLECTION).get();
  const docs = Array.isArray(snap?.docs) ? snap.docs : [];
  let items: PlatformAuditLog[] = docs
    .map((d: any) => (typeof d.data === 'function' ? d.data() : d) as PlatformAuditLog)
    .filter((item: PlatformAuditLog) => Boolean(item && item.id));

  if (filters?.category && filters.category !== 'all') {
    items = items.filter((i) => i.category === filters.category);
  }
  if (filters?.adminEmail) {
    const q = filters.adminEmail.toLowerCase().trim();
    items = items.filter((i) => (i.adminEmail || '').toLowerCase().includes(q));
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase().trim();
    items = items.filter(
      (i) =>
        (i.action || '').toLowerCase().includes(q) ||
        (i.targetId || '').toLowerCase().includes(q) ||
        (i.adminEmail || '').toLowerCase().includes(q) ||
        (i.reason || '').toLowerCase().includes(q)
    );
  }

  items.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return items.slice(0, limit);
}
