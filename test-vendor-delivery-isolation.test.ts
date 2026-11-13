/**
 * Suite de tests unitaires — Isolation stricte des livraisons entre vendeurs (LivraLink)
 *
 * Valide :
 * 1. La création de livraisons par deux vendeurs distincts (Compte A et Compte B)
 *    avec attribution obligatoire de `merchantId = auth.uid`.
 * 2. La récupération scopée par `where('merchantId', '==', connectedVendorUid)`
 *    garantissant que le Compte B ne voit jamais les livraisons du Compte A.
 * 3. L'application stricte des règles de sécurité Firestore (`/deliveries` & `/priority_missions`) :
 *    rejet des requêtes non filtrées, des requêtes cross-tenant (`where('merchantId', '==', vendorA)`),
 *    des lectures directes `get(docA)`, de l'usurpation de `merchantId`, et des écritures étrangères.
 * 4. Les helpers de production réels (`src/utils/deliveryIsolation.ts` & `src/utils/adminReconciliation.ts`).
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOrderOwnedByVendor,
  filterVendorDeliveries,
  sanitizeDuplicateOrderDraft,
  buildVendorDeliveryCsv,
  isOrderOwnedByMerchantEntity,
} from './src/utils/deliveryIsolation';
import {
  mapFirestoreDeliveryToOrder,
  doesOrderBelongToMerchant,
  buildMerchantReportSummaries,
} from './src/utils/adminReconciliation';
import { DeliveryOrder, Merchant } from './src/types';

// ---------------------------------------------------------------------------
// Types & Simulateur fidèle aux règles Firestore (`/firestore.rules`)
// ---------------------------------------------------------------------------

type CollectionName = 'users' | 'deliveries' | 'priority_missions' | 'admins';

interface SimAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

interface WhereFilter {
  field: string;
  op: '==' | 'in';
  value: unknown;
}

class FirestorePermissionError extends Error {
  code = 'permission-denied';
  constructor(message: string) {
    super(`PERMISSION_DENIED: ${message}`);
    this.name = 'FirestorePermissionError';
  }
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-#]+$/;
const VALID_STATUSES = [
  'en_attente',
  'assignee',
  'acceptee',
  'colis_recupere',
  'en_cours',
  'livree',
  'echec',
] as const;

class RuleEnforcingFirestoreSimulator {
  private collections: Record<CollectionName, Map<string, Record<string, any>>> = {
    users: new Map(),
    deliveries: new Map(),
    priority_missions: new Map(),
    admins: new Map(),
  };

  seedUser(docId: string, data: Record<string, any>): void {
    this.collections.users.set(docId, structuredClone(data));
  }

  seedAdmin(uid: string): void {
    this.collections.admins.set(uid, { uid, active: true });
  }

  private isValidId(id: unknown): id is string {
    return typeof id === 'string' && id.length >= 1 && id.length <= 128 && VALID_ID_REGEX.test(id);
  }

  private isSignedIn(auth: SimAuthUser | null): auth is SimAuthUser {
    return auth !== null && typeof auth.uid === 'string' && auth.uid.length > 0;
  }

  private isAdmin(auth: SimAuthUser | null): boolean {
    if (!this.isSignedIn(auth)) return false;
    if (
      auth.email &&
      auth.emailVerified === true &&
      /^pamphile\.gbede@gmail\.com$/i.test(auth.email.trim())
    ) {
      return true;
    }
    if (this.collections.admins.has(auth.uid)) return true;
    const userDoc = this.collections.users.get(auth.uid);
    return Boolean(userDoc && userDoc.role === 'admin');
  }

  private isVendeur(auth: SimAuthUser | null): boolean {
    if (!this.isSignedIn(auth)) return false;
    if (auth.emailVerified !== true) return false;
    const userDoc = this.collections.users.get(auth.uid);
    return Boolean(userDoc && userDoc.role === 'vendeur');
  }

  private isLivreur(auth: SimAuthUser | null): boolean {
    if (!this.isSignedIn(auth)) return false;
    if (auth.emailVerified !== true) return false;
    const userDoc = this.collections.users.get(auth.uid);
    return Boolean(userDoc && userDoc.role === 'livreur');
  }

  private isClient(auth: SimAuthUser | null): boolean {
    if (!this.isSignedIn(auth)) return false;
    if (auth.emailVerified !== true) return false;
    const userDoc = this.collections.users.get(auth.uid);
    return Boolean(userDoc && userDoc.role === 'client');
  }

  private isValidDelivery(data: Record<string, any>): boolean {
    const required = ['id', 'clientName', 'clientPhone', 'status', 'deliveryFee', 'merchantId'];
    if (!required.every((k) => k in data)) return false;
    if (typeof data.id !== 'string' || data.id.length < 1 || data.id.length > 64) return false;
    if (typeof data.clientName !== 'string' || data.clientName.length < 1 || data.clientName.length > 128) return false;
    if (typeof data.clientPhone !== 'string' || data.clientPhone.length > 32) return false;
    if (typeof data.merchantId !== 'string' || data.merchantId.length < 1 || data.merchantId.length > 128) return false;
    if (typeof data.deliveryFee !== 'number' || data.deliveryFee < 0) return false;
    if (!VALID_STATUSES.includes(data.status)) return false;
    if ('itemValueCOD' in data && (typeof data.itemValueCOD !== 'number' || data.itemValueCOD < 0)) return false;
    if (
      'courierId' in data &&
      (typeof data.courierId !== 'string' || data.courierId.length < 1 || data.courierId.length > 128)
    ) {
      return false;
    }
    return true;
  }

  private isValidPriorityMission(data: Record<string, any>): boolean {
    const required = ['id', 'orderId', 'status', 'fee', 'merchantId'];
    if (!required.every((k) => k in data)) return false;
    if (typeof data.id !== 'string' || data.id.length < 1 || data.id.length > 64) return false;
    if (typeof data.orderId !== 'string' || data.orderId.length < 1 || data.orderId.length > 64) return false;
    if (typeof data.merchantId !== 'string' || data.merchantId.length < 1 || data.merchantId.length > 128) return false;
    if (!VALID_STATUSES.includes(data.status)) return false;
    if (typeof data.fee !== 'number' || data.fee < 0) return false;
    if ('cod' in data && (typeof data.cod !== 'number' || data.cod < 0)) return false;
    return true;
  }

  private affectedKeys(incoming: Record<string, any>, existing: Record<string, any>): string[] {
    const keys = new Set([...Object.keys(incoming), ...Object.keys(existing)]);
    const changed: string[] = [];
    for (const key of keys) {
      if (JSON.stringify(incoming[key]) !== JSON.stringify(existing[key])) {
        changed.push(key);
      }
    }
    return changed;
  }

  createDoc(
    auth: SimAuthUser | null,
    col: 'deliveries' | 'priority_missions',
    docId: string,
    incoming: Record<string, any>
  ): void {
    if (!this.isValidId(docId)) {
      throw new FirestorePermissionError(`Invalid document ID "${docId}" on /${col}`);
    }
    if (!this.isSignedIn(auth)) {
      throw new FirestorePermissionError(`Unauthenticated create on /${col}/${docId}`);
    }
    if (!(this.isVendeur(auth) || this.isAdmin(auth))) {
      throw new FirestorePermissionError(`Only verified vendeur or admin can create /${col}/${docId}`);
    }

    const payload = structuredClone(incoming);
    if (col === 'deliveries' && !this.isValidDelivery(payload)) {
      throw new FirestorePermissionError(`Schema violation (isValidDelivery) on /deliveries/${docId}`);
    }
    if (col === 'priority_missions' && !this.isValidPriorityMission(payload)) {
      throw new FirestorePermissionError(`Schema violation (isValidPriorityMission) on /priority_missions/${docId}`);
    }

    if (!(payload.merchantId === auth.uid || this.isAdmin(auth))) {
      throw new FirestorePermissionError(
        `merchantId spoofing blocked: auth.uid=${auth.uid}, incoming.merchantId=${payload.merchantId}`
      );
    }
    if (payload.status !== 'en_attente') {
      throw new FirestorePermissionError(`Initial status must be 'en_attente'`);
    }
    if ('courierId' in payload && payload.courierId !== undefined) {
      throw new FirestorePermissionError(`courierId cannot be pre-populated on create`);
    }

    this.collections[col].set(docId, payload);
  }

  getDoc(
    auth: SimAuthUser | null,
    col: 'deliveries' | 'priority_missions',
    docId: string
  ): Record<string, any> | null {
    if (!this.isValidId(docId)) {
      throw new FirestorePermissionError(`Invalid document ID "${docId}"`);
    }
    const existing = this.collections[col].get(docId);
    if (!existing) {
      // Even if absent, rules checking resource properties fail for non-admin if unauthenticated
      if (!this.isSignedIn(auth)) {
        throw new FirestorePermissionError(`Unauthenticated get on /${col}/${docId}`);
      }
      return null;
    }

    if (this.isAdmin(auth)) return structuredClone(existing);

    if (col === 'deliveries') {
      const allowed =
        (this.isSignedIn(auth) && existing.merchantId === auth.uid) ||
        (this.isSignedIn(auth) && 'courierId' in existing && existing.courierId === auth.uid) ||
        (this.isSignedIn(auth) && 'clientId' in existing && existing.clientId === auth.uid) ||
        (this.isLivreur(auth) && existing.status === 'en_attente');
      if (!allowed) {
        throw new FirestorePermissionError(`Direct get denied on /deliveries/${docId} for uid=${auth?.uid}`);
      }
      return structuredClone(existing);
    }

    const allowedMission =
      this.isSignedIn(auth) &&
      ((this.isLivreur(auth) && (existing.status === 'en_attente' || existing.courierId === auth.uid)) ||
        (this.isVendeur(auth) && existing.merchantId === auth.uid));
    if (!allowedMission) {
      throw new FirestorePermissionError(`Direct get denied on /priority_missions/${docId} for uid=${auth?.uid}`);
    }
    return structuredClone(existing);
  }

  /**
   * Simule l'évaluation statique des contraintes de requête par Firestore (`allow list`)
   * suivie du filtrage des documents correspondants.
   */
  listDocs(
    auth: SimAuthUser | null,
    col: 'deliveries' | 'priority_missions',
    filters: WhereFilter[] = []
  ): Record<string, any>[] {
    if (!this.isSignedIn(auth)) {
      throw new FirestorePermissionError(`Unauthenticated list on /${col}`);
    }

    if (!this.isAdmin(auth)) {
      const hasMerchantScope = filters.some(
        (f) => f.field === 'merchantId' && f.op === '==' && f.value === auth.uid
      );
      const hasCourierPendingScope = filters.some(
        (f) => f.field === 'status' && f.op === '==' && f.value === 'en_attente'
      );
      const hasCourierOwnScope = filters.some(
        (f) => f.field === 'courierId' && f.op === '==' && f.value === auth.uid
      );
      const hasClientScope = filters.some(
        (f) => f.field === 'clientId' && f.op === '==' && f.value === auth.uid
      );

      let queryAllowed = false;
      if (this.isVendeur(auth) && hasMerchantScope) {
        queryAllowed = true;
      } else if (this.isLivreur(auth) && (hasCourierPendingScope || hasCourierOwnScope)) {
        queryAllowed = true;
      } else if (col === 'deliveries' && this.isClient(auth) && hasClientScope) {
        queryAllowed = true;
      }

      if (!queryAllowed) {
        throw new FirestorePermissionError(
          `Query rejected by allow list rule on /${col} for uid=${auth.uid} (missing matching where constraint)`
        );
      }
    }

    const allDocs = Array.from(this.collections[col].values());
    const matched = allDocs.filter((doc) =>
      filters.every((f) => {
        if (f.op === '==') return doc[f.field] === f.value;
        if (f.op === 'in' && Array.isArray(f.value)) return f.value.includes(doc[f.field]);
        return false;
      })
    );
    return matched.map((d) => structuredClone(d));
  }

  updateDoc(
    auth: SimAuthUser | null,
    col: 'deliveries',
    docId: string,
    patch: Record<string, any>
  ): void {
    if (!this.isValidId(docId) || !this.isSignedIn(auth)) {
      throw new FirestorePermissionError(`Unauthorized update on /${col}/${docId}`);
    }
    const existing = this.collections[col].get(docId);
    if (!existing) {
      throw new FirestorePermissionError(`Document /${col}/${docId} not found`);
    }
    const incoming = { ...structuredClone(existing), ...structuredClone(patch) };
    if (!this.isValidDelivery(incoming)) {
      throw new FirestorePermissionError(`Invalid delivery payload on update`);
    }
    if (incoming.id !== existing.id || incoming.merchantId !== existing.merchantId) {
      throw new FirestorePermissionError(`id and merchantId are immutable`);
    }
    if (this.isAdmin(auth)) {
      this.collections[col].set(docId, incoming);
      return;
    }

    const allowedVendorKeys = new Set([
      'clientName',
      'clientPhone',
      'itemValueCOD',
      'deliveryFee',
      'totalCustomerPayable',
      'updatedAt',
    ]);
    const changed = this.affectedKeys(incoming, existing);
    const isVendorOwnerUpdate =
      !(existing.status === 'livree' || existing.status === 'echec') &&
      this.isVendeur(auth) &&
      existing.merchantId === auth.uid &&
      existing.status === 'en_attente' &&
      incoming.status === existing.status &&
      !('courierId' in incoming) &&
      changed.every((k) => allowedVendorKeys.has(k));

    if (!isVendorOwnerUpdate) {
      throw new FirestorePermissionError(`Update denied on /deliveries/${docId} for uid=${auth.uid}`);
    }
    this.collections[col].set(docId, incoming);
  }

  deleteDoc(auth: SimAuthUser | null, col: 'deliveries' | 'priority_missions', docId: string): void {
    if (!this.isAdmin(auth)) {
      throw new FirestorePermissionError(`Delete denied on /${col}/${docId} for non-admin uid=${auth?.uid}`);
    }
    this.collections[col].delete(docId);
  }
}

// ---------------------------------------------------------------------------
// Couche applicative reproduisant AppContext.createDelivery & AppContext.fetchDeliveries
// ---------------------------------------------------------------------------

interface CreateDeliveryInput {
  id?: string;
  clientName: string;
  clientPhone: string;
  itemDescription: string;
  itemValueCOD: number;
  deliveryFee: number;
  storeName?: string;
  dropoffCommune?: string;
  dropoffAddress?: string;
  merchantId?: string; // Champ potentiellement injecté par un attaquant (doit être écrasé par auth.uid)
}

function createVendorDeliveryViaAppLogic(
  db: RuleEnforcingFirestoreSimulator,
  connectedAuth: SimAuthUser,
  input: CreateDeliveryInput
): DeliveryOrder {
  const orderId = input.id || `#LL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const cleanDocId = orderId.replace(/[^a-zA-Z0-9_-]/g, '');
  const authenticatedMerchantUid = connectedAuth.uid;
  const storeName = input.storeName || 'Ma Boutique';

  const deliveryDoc = {
    id: orderId,
    orderId,
    merchantId: authenticatedMerchantUid, // Toujours lié à l'ID du vendeur connecté
    merchantEmail: connectedAuth.email,
    merchantStoreName: storeName,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    channel: 'WhatsApp',
    pickupLocation: {
      name: storeName,
      address: 'Haie Vive, Cotonou',
      commune: 'Cotonou - Haie Vive',
    },
    dropoffLocation: {
      name: input.clientName,
      address: input.dropoffAddress || 'Akpakpa, Cotonou',
      commune: input.dropoffCommune || 'Cotonou - Akpakpa',
    },
    itemDescription: input.itemDescription,
    itemWeightKg: 1,
    itemFormat: 'M',
    isFragile: false,
    itemValueCOD: input.itemValueCOD,
    deliveryFee: input.deliveryFee,
    totalCustomerPayable: input.itemValueCOD + input.deliveryFee,
    status: 'en_attente',
    createdAt: Date.now(),
  };

  const missionDoc = {
    id: orderId,
    orderId,
    merchantId: authenticatedMerchantUid,
    storeName,
    pickupCommune: 'Cotonou - Haie Vive',
    dropoffCommune: input.dropoffCommune || 'Cotonou - Akpakpa',
    fee: input.deliveryFee,
    cod: input.itemValueCOD,
    itemDescription: input.itemDescription,
    status: 'en_attente',
    createdAt: Date.now(),
  };

  db.createDoc(connectedAuth, 'deliveries', cleanDocId, deliveryDoc);
  db.createDoc(connectedAuth, 'priority_missions', cleanDocId, missionDoc);

  return mapFirestoreDeliveryToOrder(deliveryDoc, cleanDocId);
}

function fetchVendorDeliveriesViaAppLogic(
  db: RuleEnforcingFirestoreSimulator,
  connectedAuth: SimAuthUser
): DeliveryOrder[] {
  const resolvedVendorUid = connectedAuth.uid;

  // Clause where('merchantId', '==', resolvedVendorUid) conforme à AppContext.fetchDeliveries
  const deliveriesDocs = db.listDocs(connectedAuth, 'deliveries', [
    { field: 'merchantId', op: '==', value: resolvedVendorUid },
  ]);
  const missionsDocs = db.listDocs(connectedAuth, 'priority_missions', [
    { field: 'merchantId', op: '==', value: resolvedVendorUid },
  ]);

  const byNormId = new Map<string, DeliveryOrder>();
  for (const mDoc of missionsDocs) {
    const mapped = mapFirestoreDeliveryToOrder(
      {
        ...mDoc,
        deliveryFee: mDoc.fee,
        itemValueCOD: mDoc.cod,
        merchantStoreName: mDoc.storeName,
      },
      mDoc.id
    );
    if (isOrderOwnedByVendor(mapped, resolvedVendorUid)) {
      byNormId.set(mapped.id.replace(/^#/, ''), mapped);
    }
  }

  for (const dDoc of deliveriesDocs) {
    const mapped = mapFirestoreDeliveryToOrder(dDoc, dDoc.id);
    if (isOrderOwnedByVendor(mapped, resolvedVendorUid)) {
      byNormId.set(mapped.id.replace(/^#/, ''), mapped);
    }
  }

  return Array.from(byNormId.values());
}

// ---------------------------------------------------------------------------
// Jeux d'essai (Vendeur A, Vendeur B, Vendeur C, Livreur, Admin)
// ---------------------------------------------------------------------------

const VENDOR_A: SimAuthUser = {
  uid: 'uid_vendor_alpha_001',
  email: 'boutique.alpha@livralink.bj',
  emailVerified: true,
};

const VENDOR_B: SimAuthUser = {
  uid: 'uid_vendor_beta_002',
  email: 'boutique.beta@livralink.bj',
  emailVerified: true,
};

const VENDOR_C_NEW: SimAuthUser = {
  uid: 'uid_vendor_gamma_003',
  email: 'boutique.gamma@livralink.bj',
  emailVerified: true,
};

const VENDOR_UNVERIFIED: SimAuthUser = {
  uid: 'uid_vendor_unverified_004',
  email: 'unverified@livralink.bj',
  emailVerified: false,
};

const COURIER_1: SimAuthUser = {
  uid: 'uid_courier_001',
  email: 'coursier1@livralink.bj',
  emailVerified: true,
};

const MASTER_ADMIN: SimAuthUser = {
  uid: 'uid_master_admin_pamphile',
  email: 'pamphile.gbede@gmail.com',
  emailVerified: true,
};

// ---------------------------------------------------------------------------
// Suites de tests unitaires
// ---------------------------------------------------------------------------

describe('Isolation multi-vendeurs des livraisons (Création, Récupération & Règles Firestore)', () => {
  let db: RuleEnforcingFirestoreSimulator;

  beforeEach(() => {
    db = new RuleEnforcingFirestoreSimulator();
    db.seedUser(VENDOR_A.uid, { uid: VENDOR_A.uid, email: VENDOR_A.email, role: 'vendeur', storeName: 'Ma Boutique' });
    db.seedUser(VENDOR_B.uid, { uid: VENDOR_B.uid, email: VENDOR_B.email, role: 'vendeur', storeName: 'Ma Boutique' });
    db.seedUser(VENDOR_C_NEW.uid, { uid: VENDOR_C_NEW.uid, email: VENDOR_C_NEW.email, role: 'vendeur', storeName: 'Gamma Shop' });
    db.seedUser(VENDOR_UNVERIFIED.uid, { uid: VENDOR_UNVERIFIED.uid, email: VENDOR_UNVERIFIED.email, role: 'vendeur' });
    db.seedUser(COURIER_1.uid, { uid: COURIER_1.uid, email: COURIER_1.email, role: 'livreur' });
  });

  test('1. Création : les livraisons créées par Vendeur A et Vendeur B sont liées exclusivement à leur UID respectif', () => {
    const orderA1 = createVendorDeliveryViaAppLogic(db, VENDOR_A, {
      id: '#LL-A001',
      clientName: 'Client A1',
      clientPhone: '+22997000001',
      itemDescription: 'Sac cuir Alpha',
      itemValueCOD: 25000,
      deliveryFee: 1000,
      storeName: 'Ma Boutique',
    });

    const orderA2 = createVendorDeliveryViaAppLogic(db, VENDOR_A, {
      id: '#LL-A002',
      clientName: 'Client A2',
      clientPhone: '+22997000002',
      itemDescription: 'Montre Alpha',
      itemValueCOD: 40000,
      deliveryFee: 1500,
      storeName: 'Ma Boutique',
    });

    const orderB1 = createVendorDeliveryViaAppLogic(db, VENDOR_B, {
      id: '#LL-B001',
      clientName: 'Client B1',
      clientPhone: '+22997000003',
      itemDescription: 'Parfum Beta',
      itemValueCOD: 18000,
      deliveryFee: 1000,
      storeName: 'Ma Boutique', // Même nom de boutique volontairement pour prouver l'isolation par UID
    });

    assert.equal(orderA1.merchantId, VENDOR_A.uid);
    assert.equal(orderA2.merchantId, VENDOR_A.uid);
    assert.equal(orderB1.merchantId, VENDOR_B.uid);
    assert.notEqual(orderA1.merchantId, orderB1.merchantId);
  });

  test('2. Récupération par ID du vendeur connecté : Compte B ne récupère jamais les livraisons du Compte A', () => {
    createVendorDeliveryViaAppLogic(db, VENDOR_A, {
      id: '#LL-A101',
      clientName: 'Koffi Mensah',
      clientPhone: '+22997111111',
      itemDescription: 'Téléphone Alpha',
      itemValueCOD: 120000,
      deliveryFee: 2000,
      storeName: 'Boutique Identique',
    });
    createVendorDeliveryViaAppLogic(db, VENDOR_A, {
      id: '#LL-A102',
      clientName: 'Afiavi Dossou',
      clientPhone: '+22997111112',
      itemDescription: 'Chaussures Alpha',
      itemValueCOD: 30000,
      deliveryFee: 1200,
      storeName: 'Boutique Identique',
    });
    createVendorDeliveryViaAppLogic(db, VENDOR_B, {
      id: '#LL-B201',
      clientName: 'Sèna Houngbo',
      clientPhone: '+22997222221',
      itemDescription: 'Robe Beta',
      itemValueCOD: 22000,
      deliveryFee: 1000,
      storeName: 'Boutique Identique',
    });

    const listA = fetchVendorDeliveriesViaAppLogic(db, VENDOR_A);
    const listB = fetchVendorDeliveriesViaAppLogic(db, VENDOR_B);
    const listC = fetchVendorDeliveriesViaAppLogic(db, VENDOR_C_NEW);

    // Compte A voit uniquement ses 2 livraisons
    assert.equal(listA.length, 2);
    assert.deepEqual(
      listA.map((d) => d.id).sort(),
      ['#LL-A101', '#LL-A102']
    );
    assert.equal(listA.some((d) => d.merchantId === VENDOR_B.uid), false);

    // Compte B voit uniquement sa livraison (jamais celles de A)
    assert.equal(listB.length, 1);
    assert.equal(listB[0].id, '#LL-B201');
    assert.equal(listB[0].merchantId, VENDOR_B.uid);
    assert.equal(
      listB.some((d) => d.merchantId === VENDOR_A.uid || d.id.startsWith('#LL-A')),
      false,
      'Le compte B ne doit jamais voir les livraisons du compte A'
    );

    // Compte C nouvellement créé sans livraisons obtient []
    assert.deepEqual(listC, []);
  });

  test("3. Usurpation d'identité bloquée à la création : Compte B ne peut pas créer une livraison au nom du Compte A", () => {
    assert.throws(
      () =>
        db.createDoc(VENDOR_B, 'deliveries', 'LL-SPOOF-1', {
          id: '#LL-SPOOF-1',
          orderId: '#LL-SPOOF-1',
          merchantId: VENDOR_A.uid, // Usurpation !
          clientName: 'Client Piège',
          clientPhone: '+22997000099',
          deliveryFee: 1000,
          status: 'en_attente',
        }),
      (err: unknown) => err instanceof FirestorePermissionError && err.code === 'permission-denied'
    );

    assert.throws(
      () =>
        db.createDoc(VENDOR_B, 'priority_missions', 'LL-SPOOF-1', {
          id: '#LL-SPOOF-1',
          orderId: '#LL-SPOOF-1',
          merchantId: VENDOR_A.uid,
          fee: 1000,
          status: 'en_attente',
        }),
      (err: unknown) => err instanceof FirestorePermissionError && err.code === 'permission-denied'
    );

    // Même si un payload applicatif contenait merchantId du Vendeur A, createDelivery le rattache à connectedAuth.uid
    const sanitizedOrder = createVendorDeliveryViaAppLogic(db, VENDOR_B, {
      id: '#LL-SANITIZED-1',
      merchantId: VENDOR_A.uid,
      clientName: 'Client Légitime B',
      clientPhone: '+22997000088',
      itemDescription: 'Colis B',
      itemValueCOD: 15000,
      deliveryFee: 1000,
    });
    assert.equal(sanitizedOrder.merchantId, VENDOR_B.uid);
    assert.equal(fetchVendorDeliveriesViaAppLogic(db, VENDOR_A).length, 0);
    assert.equal(fetchVendorDeliveriesViaAppLogic(db, VENDOR_B).length, 1);
  });

  test('4. Règle Firestore allow list : Compte B ne peut exécuter ni requête cross-tenant ni requête sans clause where', () => {
    createVendorDeliveryViaAppLogic(db, VENDOR_A, {
      id: '#LL-A301',
      clientName: 'Client Confidentiel A',
      clientPhone: '+22997333331',
      itemDescription: 'Colis confidentiel A',
      itemValueCOD: 50000,
      deliveryFee: 1500,
    });

    // Requête cross-tenant sur /deliveries : where('merchantId', '==', VENDOR_A.uid) en tant que VENDOR_B
    assert.throws(
      () =>
        db.listDocs(VENDOR_B, 'deliveries', [
          { field: 'merchantId', op: '==', value: VENDOR_A.uid },
        ]),
      (err: unknown) => err instanceof FirestorePermissionError && err.code === 'permission-denied'
    );

    // Requête cross-tenant sur /priority_missions
    assert.throws(
      () =>
        db.listDocs(VENDOR_B, 'priority_missions', [
          { field: 'merchantId', op: '==', value: VENDOR_A.uid },
        ]),
      (err: unknown) => err instanceof FirestorePermissionError && err.code === 'permission-denied'
    );

    // Requête globale sans clause where('merchantId', '==', VENDOR_B.uid)
    assert.throws(
      () => db.listDocs(VENDOR_B, 'deliveries', []),
      (err: unknown) => err instanceof FirestorePermissionError && err.code === 'permission-denied'
    );

    assert.throws(
      () => db.listDocs(VENDOR_B, 'priority_missions', []),
      (err: unknown) => err instanceof FirestorePermissionError && err.code === 'permission-denied'
    );

    // Requête d'un vendeur non authentifié ou email non vérifié
    assert.throws(
      () => db.listDocs(null, 'deliveries', [{ field: 'merchantId', op: '==', value: VENDOR_A.uid }]),
      (err: unknown) => err instanceof FirestorePermissionError
    );
    assert.throws(
      () =>
        db.listDocs(VENDOR_UNVERIFIED, 'deliveries', [
          { field: 'merchantId', op: '==', value: VENDOR_UNVERIFIED.uid },
        ]),
      (err: unknown) => err instanceof FirestorePermissionError
    );
  });

  test('5. Règle Firestore allow get / update / delete : Compte B ne peut ni lire, ni modifier, ni supprimer une livraison de A', () => {
    createVendorDeliveryViaAppLogic(db, VENDOR_A, {
      id: '#LL-A401',
      clientName: 'Client Privé A',
      clientPhone: '+22997444441',
      itemDescription: 'Document confidentiel',
      itemValueCOD: 10000,
      deliveryFee: 1000,
    });

    // Lecture directe refusée pour B sur /deliveries et /priority_missions
    assert.throws(
      () => db.getDoc(VENDOR_B, 'deliveries', 'LL-A401'),
      (err: unknown) => err instanceof FirestorePermissionError && err.code === 'permission-denied'
    );
    assert.throws(
      () => db.getDoc(VENDOR_B, 'priority_missions', 'LL-A401'),
      (err: unknown) => err instanceof FirestorePermissionError && err.code === 'permission-denied'
    );

    // Modification par B sur le document de A refusée
    assert.throws(
      () => db.updateDoc(VENDOR_B, 'deliveries', 'LL-A401', { clientName: 'Piraté par B' }),
      (err: unknown) => err instanceof FirestorePermissionError && err.code === 'permission-denied'
    );

    // Modification de merchantId par A lui-même refusée (immuabilité)
    assert.throws(
      () => db.updateDoc(VENDOR_A, 'deliveries', 'LL-A401', { merchantId: VENDOR_B.uid }),
      (err: unknown) => err instanceof FirestorePermissionError && err.code === 'permission-denied'
    );

    // Suppression par B ou A refusée (réservée Admin)
    assert.throws(
      () => db.deleteDoc(VENDOR_B, 'deliveries', 'LL-A401'),
      (err: unknown) => err instanceof FirestorePermissionError && err.code === 'permission-denied'
    );

    // Compte A peut lire et modifier sa propre livraison en attente
    const ownDoc = db.getDoc(VENDOR_A, 'deliveries', 'LL-A401');
    assert.equal(ownDoc?.merchantId, VENDOR_A.uid);
    db.updateDoc(VENDOR_A, 'deliveries', 'LL-A401', { clientName: 'Client Privé A (MAJ)' });
    assert.equal(db.getDoc(VENDOR_A, 'deliveries', 'LL-A401')?.clientName, 'Client Privé A (MAJ)');
  });

  test('6. Rôle non-vendeur : un livreur ne peut pas créer de livraison mais peut lister les missions en attente', () => {
    createVendorDeliveryViaAppLogic(db, VENDOR_A, {
      id: '#LL-A501',
      clientName: 'Client Livraison',
      clientPhone: '+22997555551',
      itemDescription: 'Colis A',
      itemValueCOD: 12000,
      deliveryFee: 1000,
    });

    assert.throws(
      () =>
        db.createDoc(COURIER_1, 'deliveries', 'LL-COURIER-CREATE', {
          id: '#LL-COURIER-CREATE',
          merchantId: COURIER_1.uid,
          clientName: 'Test',
          clientPhone: '+22997000000',
          deliveryFee: 1000,
          status: 'en_attente',
        }),
      (err: unknown) => err instanceof FirestorePermissionError
    );

    const pendingMissions = db.listDocs(COURIER_1, 'priority_missions', [
      { field: 'status', op: '==', value: 'en_attente' },
    ]);
    assert.equal(pendingMissions.length, 1);
    assert.equal(pendingMissions[0].orderId, '#LL-A501');
  });

  test('7. Utilitaires de production (`deliveryIsolation.ts` & `adminReconciliation.ts`) garantissent zéro fuite vers Compte B', () => {
    const orderA = createVendorDeliveryViaAppLogic(db, VENDOR_A, {
      id: '#LL-PROD-A',
      clientName: 'Client Secret Alpha',
      clientPhone: '+22997666661',
      itemDescription: 'Bijou Alpha',
      itemValueCOD: 75000,
      deliveryFee: 2000,
      storeName: 'Boutique Commune',
    });

    const orderB = createVendorDeliveryViaAppLogic(db, VENDOR_B, {
      id: '#LL-PROD-B',
      clientName: 'Client Public Beta',
      clientPhone: '+22997666662',
      itemDescription: 'Tissu Beta',
      itemValueCOD: 15000,
      deliveryFee: 1000,
      storeName: 'Boutique Commune',
    });

    const mixedOrders: DeliveryOrder[] = [orderA, orderB];

    // 1. isOrderOwnedByVendor
    assert.equal(isOrderOwnedByVendor(orderA, VENDOR_A.uid), true);
    assert.equal(isOrderOwnedByVendor(orderA, VENDOR_B.uid), false);
    assert.equal(isOrderOwnedByVendor({ merchantId: '' }, VENDOR_B.uid), false);
    assert.equal(isOrderOwnedByVendor(orderA, ''), false);

    // 2. filterVendorDeliveries pour Compte B
    const filteredForB = filterVendorDeliveries(mixedOrders, {
      userProfile: { uid: VENDOR_B.uid, role: 'vendeur' },
      firebaseUserUid: VENDOR_B.uid,
      isAdminAuthenticated: false,
      isDirectorModeActive: false,
    });
    assert.equal(filteredForB.length, 1);
    assert.equal(filteredForB[0].id, '#LL-PROD-B');
    assert.equal(filteredForB.some((o) => o.id === '#LL-PROD-A'), false);

    // 3. sanitizeDuplicateOrderDraft : Compte B ne peut pas cloner la commande de A
    assert.equal(sanitizeDuplicateOrderDraft(orderA, VENDOR_B.uid), null);
    assert.notEqual(sanitizeDuplicateOrderDraft(orderB, VENDOR_B.uid), null);

    // 4. buildVendorDeliveryCsv : l'export CSV de B ne contient jamais la commande de A
    const csvB = buildVendorDeliveryCsv(mixedOrders, VENDOR_B.uid, 'Boutique Commune');
    assert.equal(csvB.exportedCount, 1);
    assert.equal(csvB.csvContent.includes('#LL-PROD-B'), true);
    assert.equal(csvB.csvContent.includes('#LL-PROD-A'), false);
    assert.equal(csvB.csvContent.includes('Client Secret Alpha'), false);

    // 5. Réconciliation admin : chaque commande est rattachée à son marchand par UID strict
    const merchantA: Merchant = {
      id: VENDOR_A.uid,
      storeName: 'Boutique Commune',
      managerName: 'Vendeur A',
      phone: '+22997000010',
      email: VENDOR_A.email,
      commune: 'Cotonou',
      address: 'Haie Vive',
      channel: 'WhatsApp',
      totalOrders: 0,
      totalVolumeFCFA: 0,
      rating: 5,
      status: 'actif',
      isVerified: true,
      createdAt: new Date().toISOString(),
    };
    const merchantB: Merchant = {
      id: VENDOR_B.uid,
      storeName: 'Boutique Commune',
      managerName: 'Vendeur B',
      phone: '+22997000020',
      email: VENDOR_B.email,
      commune: 'Cotonou',
      address: 'Akpakpa',
      channel: 'WhatsApp',
      totalOrders: 0,
      totalVolumeFCFA: 0,
      rating: 5,
      status: 'actif',
      isVerified: true,
      createdAt: new Date().toISOString(),
    };

    assert.equal(isOrderOwnedByMerchantEntity(orderA, merchantA), true);
    assert.equal(isOrderOwnedByMerchantEntity(orderA, merchantB), false);
    assert.equal(doesOrderBelongToMerchant(orderA, merchantB), false);

    const summaries = buildMerchantReportSummaries([merchantA, merchantB], mixedOrders);
    const summaryA = summaries.find((s) => s.merchant.id === VENDOR_A.uid);
    const summaryB = summaries.find((s) => s.merchant.id === VENDOR_B.uid);
    assert.equal(summaryA?.totalOrders, 1);
    assert.equal(summaryA?.totalVolumeCOD, 75000);
    assert.equal(summaryB?.totalOrders, 1);
    assert.equal(summaryB?.totalVolumeCOD, 15000);
  });

  test('8. Superviseur Master Admin vérifié conserve la visibilité globale et le filtrage Mode Directeur', () => {
    const orderA = createVendorDeliveryViaAppLogic(db, VENDOR_A, {
      id: '#LL-ADM-A',
      clientName: 'Client Admin A',
      clientPhone: '+22997777771',
      itemDescription: 'Colis A',
      itemValueCOD: 20000,
      deliveryFee: 1000,
    });
    const orderB = createVendorDeliveryViaAppLogic(db, VENDOR_B, {
      id: '#LL-ADM-B',
      clientName: 'Client Admin B',
      clientPhone: '+22997777772',
      itemDescription: 'Colis B',
      itemValueCOD: 35000,
      deliveryFee: 1500,
    });

    // Admin whitelisté avec email vérifié peut lister toutes les livraisons
    const allDeliveries = db.listDocs(MASTER_ADMIN, 'deliveries', []);
    assert.equal(allDeliveries.length, 2);

    // En Mode Directeur ciblant Vendeur B, filterVendorDeliveries n'expose que les livraisons de B
    const directorViewB = filterVendorDeliveries([orderA, orderB], {
      userProfile: { uid: MASTER_ADMIN.uid, role: 'admin' },
      firebaseUserUid: MASTER_ADMIN.uid,
      isAdminAuthenticated: true,
      isUserMasterAdmin: true,
      isDirectorModeActive: true,
      directorTargetId: VENDOR_B.uid,
    });
    assert.equal(directorViewB.length, 1);
    assert.equal(directorViewB[0].id, '#LL-ADM-B');

    // Même email sans emailVerified: true est strictement refusé par Firestore
    const unverifiedMasterAdmin: SimAuthUser = {
      uid: 'uid_spoof_master',
      email: 'pamphile.gbede@gmail.com',
      emailVerified: false,
    };
    assert.throws(
      () => db.listDocs(unverifiedMasterAdmin, 'deliveries', []),
      (err: unknown) => err instanceof FirestorePermissionError
    );
  });
});
