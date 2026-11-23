import type { AdminAccountRecord, AdminPermission, AdminRoleId } from '../types';

export const SUPER_ADMIN_EMAIL_LOWER = 'pamphile.gbede@gmail.com';

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [
  'overview.view',
  'users.read',
  'users.manage',
  'vendors.read',
  'vendors.manage',
  'couriers.read',
  'couriers.manage',
  'couriers.remuneration',
  'clients.read',
  'deliveries.read',
  'deliveries.manage',
  'deliveries.reassign',
  'deliveries.cancel',
  'kyc.read',
  'kyc.review',
  'pricing.read',
  'pricing.manage',
  'finance.read',
  'finance.manage',
  'finance.refund',
  'emails.read',
  'emails.manage',
  'contacts.manage',
  'settings.manage',
  'disputes.read',
  'disputes.resolve',
  'audit.read',
  'admins.manage',
  'backups.manage',
  'notifications.manage',
];

export const ADMIN_ROLE_LABELS: Record<AdminRoleId, string> = {
  super_admin: 'Super-Administrateur',
  admin_general: 'Administrateur Général',
  admin_financier: 'Administrateur Financier',
  responsable_vendeurs: 'Responsable Vendeurs',
  responsable_livreurs: 'Responsable Livreurs',
  responsable_support: 'Responsable Support & Litiges',
  responsable_kyc: 'Responsable KYC & Conformité',
};

export const ADMIN_ROLE_PERMISSIONS: Record<AdminRoleId, AdminPermission[]> = {
  super_admin: [...ALL_ADMIN_PERMISSIONS],
  admin_general: ALL_ADMIN_PERMISSIONS.filter((p) => p !== 'admins.manage'),
  admin_financier: [
    'overview.view',
    'vendors.read',
    'couriers.read',
    'couriers.remuneration',
    'clients.read',
    'deliveries.read',
    'pricing.read',
    'pricing.manage',
    'finance.read',
    'finance.manage',
    'finance.refund',
    'audit.read',
  ],
  responsable_vendeurs: [
    'overview.view',
    'users.read',
    'vendors.read',
    'vendors.manage',
    'clients.read',
    'deliveries.read',
    'deliveries.manage',
    'deliveries.cancel',
    'disputes.read',
    'audit.read',
  ],
  responsable_livreurs: [
    'overview.view',
    'users.read',
    'couriers.read',
    'couriers.manage',
    'couriers.remuneration',
    'deliveries.read',
    'deliveries.reassign',
    'kyc.read',
    'disputes.read',
    'audit.read',
  ],
  responsable_support: [
    'overview.view',
    'users.read',
    'vendors.read',
    'couriers.read',
    'clients.read',
    'deliveries.read',
    'deliveries.cancel',
    'deliveries.reassign',
    'disputes.read',
    'disputes.resolve',
    'emails.read',
    'notifications.manage',
    'audit.read',
  ],
  responsable_kyc: [
    'overview.view',
    'users.read',
    'couriers.read',
    'vendors.read',
    'kyc.read',
    'kyc.review',
    'audit.read',
  ],
};

export interface ResolvedAdminContext {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  uid: string;
  email: string;
  roleId: AdminRoleId | null;
  permissions: AdminPermission[];
  isActive: boolean;
  record?: AdminAccountRecord | null;
}

export interface RbacDbLike {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): Record<string, any> | undefined }>;
    };
  };
}

export function isValidAdminRoleId(role: any): role is AdminRoleId {
  return typeof role === 'string' && role in ADMIN_ROLE_PERMISSIONS;
}

export function resolvePermissionsForRole(
  roleId: AdminRoleId,
  customPermissions?: string[] | null
): AdminPermission[] {
  if (roleId === 'super_admin') {
    return [...ALL_ADMIN_PERMISSIONS];
  }
  if (Array.isArray(customPermissions) && customPermissions.length > 0) {
    const valid = customPermissions.filter((p): p is AdminPermission =>
      ALL_ADMIN_PERMISSIONS.includes(p as AdminPermission)
    );
    if (valid.length > 0) return Array.from(new Set(valid));
  }
  return [...ADMIN_ROLE_PERMISSIONS[roleId]];
}

export async function resolveAdminContext(
  db: RbacDbLike | null | undefined,
  user?: { uid?: string; email?: string; email_verified?: boolean; isAdmin?: boolean } | null
): Promise<ResolvedAdminContext> {
  const uid = String(user?.uid || '').trim();
  const email = String(user?.email || '').trim();
  const emailLower = email.toLowerCase();

  if (!uid || user?.email_verified !== true) {
    return {
      isAdmin: false,
      isSuperAdmin: false,
      uid,
      email,
      roleId: null,
      permissions: [],
      isActive: false,
      record: null,
    };
  }

  if (emailLower === SUPER_ADMIN_EMAIL_LOWER) {
    return {
      isAdmin: true,
      isSuperAdmin: true,
      uid,
      email,
      roleId: 'super_admin',
      permissions: [...ALL_ADMIN_PERMISSIONS],
      isActive: true,
      record: {
        uid,
        email,
        fullName: 'Super-Administrateur Principal',
        roleId: 'super_admin',
        permissions: [...ALL_ADMIN_PERMISSIONS],
        isActive: true,
        isSuperAdmin: true,
        isProtectedMaster: true,
        createdAt: new Date(0).toISOString(),
      },
    };
  }

  if (db) {
    try {
      const adminSnap = await db.collection('admins').doc(uid).get();
      if (adminSnap.exists) {
        const data = adminSnap.data() || {};
        const isActive = data.isActive !== false;
        if (!isActive) {
          return {
            isAdmin: false,
            isSuperAdmin: false,
            uid,
            email,
            roleId: isValidAdminRoleId(data.roleId) ? data.roleId : 'admin_general',
            permissions: [],
            isActive: false,
            record: null,
          };
        }
        const roleId: AdminRoleId = isValidAdminRoleId(data.roleId) ? data.roleId : 'admin_general';
        const permissions = resolvePermissionsForRole(roleId, data.permissions);
        return {
          isAdmin: true,
          isSuperAdmin: roleId === 'super_admin' || Boolean(data.isSuperAdmin),
          uid,
          email: String(data.email || email),
          roleId,
          permissions,
          isActive: true,
          record: {
            uid,
            email: String(data.email || email),
            fullName: String(data.fullName || data.name || email || 'Administrateur'),
            phone: data.phone ? String(data.phone) : undefined,
            roleId,
            permissions,
            isActive: true,
            isSuperAdmin: roleId === 'super_admin' || Boolean(data.isSuperAdmin),
            createdAt: String(data.createdAt || data.addedAt || new Date().toISOString()),
            createdBy: data.createdBy ? String(data.createdBy) : undefined,
            updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
          },
        };
      }

      const userSnap = await db.collection('users').doc(uid).get();
      if (userSnap.exists) {
        const uData = userSnap.data() || {};
        if (uData.role === 'admin' && uData.isActive !== false && uData.accountStatus !== 'suspendu' && uData.accountStatus !== 'bloque') {
          const roleId: AdminRoleId = isValidAdminRoleId(uData.adminRoleId) ? uData.adminRoleId : 'admin_general';
          const permissions = resolvePermissionsForRole(roleId, uData.adminPermissions);
          return {
            isAdmin: true,
            isSuperAdmin: roleId === 'super_admin',
            uid,
            email,
            roleId,
            permissions,
            isActive: true,
            record: null,
          };
        }
      }
    } catch {
      return {
        isAdmin: false,
        isSuperAdmin: false,
        uid,
        email,
        roleId: null,
        permissions: [],
        isActive: false,
        record: null,
      };
    }
  }

  // Fallback for test tokens that explicitly set custom claim admin=true without Firestore admins doc
  if (Boolean(user?.isAdmin)) {
    return {
      isAdmin: true,
      isSuperAdmin: true,
      uid,
      email,
      roleId: 'super_admin',
      permissions: [...ALL_ADMIN_PERMISSIONS],
      isActive: true,
      record: null,
    };
  }

  return {
    isAdmin: false,
    isSuperAdmin: false,
    uid,
    email,
    roleId: null,
    permissions: [],
    isActive: false,
    record: null,
  };
}

export function hasAdminPermission(
  ctx: ResolvedAdminContext | null | undefined,
  permission: AdminPermission
): boolean {
  if (!ctx || !ctx.isAdmin || !ctx.isActive) return false;
  if (ctx.isSuperAdmin) return true;
  return ctx.permissions.includes(permission);
}
