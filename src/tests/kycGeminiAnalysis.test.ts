import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  classifyGeminiProviderError,
  inspectGeminiKeyFormat,
  normalizeGeminiApiKey,
  redactSensitiveForLogs,
  resetInMemoryGeminiGuardsForTests,
} from '../server/kycGeminiAnalysis';

process.env.NODE_ENV = 'test';

const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('FAKE_JPEG_KYC_DATA')]);
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('FAKE_PNG_KYC_DATA'),
]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
  Buffer.from('FAKE_WEBP_KYC_DATA'),
]);
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'ascii');

interface InMemoryDocStore {
  kyc: Map<string, Record<string, any>>;
  users: Map<string, Record<string, any>>;
  ai_usage_guards: Map<string, Record<string, any>>;
}

function createMockFirestoreAndStorage(initial?: Partial<InMemoryDocStore>, storageFiles?: Map<string, { contentType: string; data: Buffer }>) {
  const store: InMemoryDocStore = {
    kyc: initial?.kyc || new Map(),
    users: initial?.users || new Map(),
    ai_usage_guards: initial?.ai_usage_guards || new Map(),
  };

  const filesMap = storageFiles || new Map<string, { contentType: string; data: Buffer }>();

  const makeDocRef = (colName: keyof InMemoryDocStore, id: string) => ({
    id,
    _col: colName,
    get: async () => {
      const val = store[colName].get(id);
      return {
        id,
        exists: val !== undefined,
        data: () => (val ? structuredClone(val) : undefined),
      };
    },
    set: async (data: Record<string, any>, opts?: { merge?: boolean }) => {
      const prev = store[colName].get(id);
      if (opts?.merge && prev) {
        store[colName].set(id, { ...prev, ...structuredClone(data) });
      } else {
        store[colName].set(id, structuredClone(data));
      }
    },
  });

  const db = {
    collection: (name: string) => ({
      doc: (id: string) => makeDocRef(name as keyof InMemoryDocStore, id),
    }),
    runTransaction: async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (ref: any) => ref.get(),
        set: (ref: any, data: Record<string, any>, opts?: { merge?: boolean }) => ref.set(data, opts),
      };
      return fn(tx);
    },
  };

  const bucket = {
    file: (storagePath: string) => ({
      exists: async () => [filesMap.has(storagePath)],
      getMetadata: async () => [{ contentType: filesMap.get(storagePath)?.contentType }],
      download: async () => {
        const found = filesMap.get(storagePath);
        if (!found) throw new Error('File not found in mock bucket');
        return [found.data];
      },
    }),
  };

  return { store, filesMap, db, bucket };
}

async function startTestServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const { app } = await import('../../server');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function buildFourDocDossier(uid: string, overrides?: Record<string, any>) {
  return {
    id: uid,
    userId: uid,
    courierId: uid,
    lastName: 'GBEDE',
    firstName: 'Koffi Jean',
    fullName: 'GBEDE Koffi Jean',
    phone: '+22997001122',
    email: `${uid}@livralink.bj`,
    role: 'coursier',
    idType: 'CIP',
    idNumber: 'CIP-2026-998877',
    npi: '1234567890',
    vehicleType: 'Moto Bajaj Boxer 125cc',
    vehiclePlate: 'BJ-4455-RB',
    operatingZone: 'Cotonou',
    status: 'en_attente',
    isApproved: false,
    verified: false,
    documents: {
      idFront: {
        uploaded: true,
        storagePath: `kyc/${uid}/id_front/id_front_1.jpg`,
        docType: 'id_front',
        fileName: 'id_front_1.jpg',
        mimeType: 'image/jpeg',
        size: JPEG_BYTES.length,
        uploadedAt: '2026-03-01T10:00:00.000Z',
        uploadedBy: uid,
      },
      idBack: {
        uploaded: true,
        storagePath: `kyc/${uid}/id_back/id_back_1.png`,
        docType: 'id_back',
        fileName: 'id_back_1.png',
        mimeType: 'image/png',
        size: PNG_BYTES.length,
        uploadedAt: '2026-03-01T10:01:00.000Z',
        uploadedBy: uid,
      },
      drivingLicenseFront: {
        uploaded: true,
        storagePath: `kyc/${uid}/driving_license_front/driving_license_front_1.pdf`,
        docType: 'driving_license_front',
        fileName: 'driving_license_front_1.pdf',
        mimeType: 'application/pdf',
        size: PDF_BYTES.length,
        uploadedAt: '2026-03-01T10:02:00.000Z',
        uploadedBy: uid,
      },
      drivingLicenseBack: {
        uploaded: true,
        storagePath: `kyc/${uid}/driving_license_back/driving_license_back_1.webp`,
        docType: 'driving_license_back',
        fileName: 'driving_license_back_1.webp',
        mimeType: 'image/webp',
        size: WEBP_BYTES.length,
        uploadedAt: '2026-03-01T10:03:00.000Z',
        uploadedBy: uid,
      },
    },
    ...overrides,
  };
}

test('Suite complète Phase 2 — Analyse KYC Gemini serveur, sécurité, erreurs et quotas', async (t) => {
  const { baseUrl, close } = await startTestServer();
  const serverMod = await import('../../server');

  t.after(async () => {
    serverMod.setFirestoreAdminForTests(null);
    serverMod.setStorageBucketForTests(null);
    serverMod.setTokenVerifierForTests(null);
    serverMod.setGeminiKycAnalyzerForTests(null);
    serverMod.setGeminiBackendAuthVerifierForTests(null);
    await close();
  });

  t.beforeEach(() => {
    resetInMemoryGeminiGuardsForTests();
    serverMod.setGeminiKycAnalyzerForTests(null);
    serverMod.setGeminiBackendAuthVerifierForTests(null);
    serverMod.setTokenVerifierForTests(async (tok) => {
      if (tok === 'admin-token') {
        return { uid: 'admin_super', email: 'pamphile.gbede@gmail.com', email_verified: true, admin: true };
      }
      if (tok === 'courier-token') {
        return { uid: 'courier_1', email: 'courier1@livralink.bj', email_verified: true, admin: false };
      }
      if (tok === 'vendor-token') {
        return { uid: 'vendor_1', email: 'vendor1@livralink.bj', email_verified: true, admin: false };
      }
      throw new Error('INVALID_TOKEN');
    });
  });

  await t.test('1. Contrôle d’accès : un non-administrateur (403) et un anonyme (401) ne peuvent pas lancer l’analyse Gemini', async () => {
    const resAnon = await fetch(`${baseUrl}/api/admin/kyc/courier_1/analyze`, { method: 'POST' });
    assert.equal(resAnon.status, 401);

    const resCourier = await fetch(`${baseUrl}/api/admin/kyc/courier_1/analyze`, {
      method: 'POST',
      headers: { Authorization: 'Bearer courier-token' },
    });
    assert.equal(resCourier.status, 403);

    const resVendor = await fetch(`${baseUrl}/api/admin/kyc/courier_1/analyze`, {
      method: 'POST',
      headers: { Authorization: 'Bearer vendor-token' },
    });
    assert.equal(resVendor.status, 403);
  });

  await t.test('2. Dossier complet (4 documents : JPEG + PNG + PDF + WebP) — extraction structurée & statut compte inchangé', async () => {
    const uid = 'courier_full_4docs';
    const files = new Map([
      [`kyc/${uid}/id_front/id_front_1.jpg`, { contentType: 'image/jpeg', data: JPEG_BYTES }],
      [`kyc/${uid}/id_back/id_back_1.png`, { contentType: 'image/png', data: PNG_BYTES }],
      [`kyc/${uid}/driving_license_front/driving_license_front_1.pdf`, { contentType: 'application/pdf', data: PDF_BYTES }],
      [`kyc/${uid}/driving_license_back/driving_license_back_1.webp`, { contentType: 'image/webp', data: WEBP_BYTES }],
    ]);
    const { store, db, bucket } = createMockFirestoreAndStorage(
      {
        kyc: new Map([[uid, buildFourDocDossier(uid)]]),
        users: new Map([[uid, { uid, role: 'livreur', isKycVerified: false, kycStatus: 'en_attente' }]]),
      },
      files
    );

    serverMod.setFirestoreAdminForTests(db);
    serverMod.setStorageBucketForTests(bucket);

    let capturedMimeTypes: string[] = [];
    serverMod.setGeminiKycAnalyzerForTests(async ({ contents, model }) => {
      assert.equal(model, 'gemini-4-hydrogen');
      capturedMimeTypes = contents
        .filter((p) => p.inlineData)
        .map((p) => p.inlineData.mimeType);
      return {
        text: JSON.stringify({
          summary: 'Les justificatifs fournis sont lisibles et concordants avec la fiche déclarée.',
          extractedData: {
            lastName: 'GBEDE',
            firstName: 'Koffi Jean',
            fullName: 'GBEDE Koffi Jean',
            idTypeDetected: 'CIP',
            idNumber: 'CIP-2026-998877',
            npi: '1234567890',
            idExpiresAt: '2030-12-31',
            licenseNumber: 'PC-BJ-7741',
            licenseCategories: 'A, B',
            licenseExpiresAt: '2031-06-30',
            vehiclePlate: 'BJ-4455-RB',
          },
          documents: {
            idFront: {
              identifiedDocumentType: 'CIP Bénin (Recto)',
              readabilityStatus: 'readable',
              extractionConfidence: 'high',
              confidencePercent: 95,
              extractedFields: { fullName: 'GBEDE Koffi Jean', documentNumber: 'CIP-2026-998877', expiresAt: '2030-12-31' },
              anomalies: [],
              summary: 'Recto net et lisible.',
            },
            idBack: {
              identifiedDocumentType: 'CIP Bénin (Verso)',
              readabilityStatus: 'readable',
              extractionConfidence: 'high',
              confidencePercent: 92,
              extractedFields: { npi: '1234567890' },
              anomalies: [],
              summary: 'Verso lisible avec NPI.',
            },
            drivingLicenseFront: {
              identifiedDocumentType: 'Permis de conduire (Recto)',
              readabilityStatus: 'readable',
              extractionConfidence: 'high',
              confidencePercent: 90,
              extractedFields: { documentNumber: 'PC-BJ-7741', expiresAt: '2031-06-30' },
              anomalies: [],
              summary: 'Recto du permis PDF lisible.',
            },
            drivingLicenseBack: {
              identifiedDocumentType: 'Permis de conduire (Verso)',
              readabilityStatus: 'readable',
              extractionConfidence: 'high',
              confidencePercent: 89,
              extractedFields: { licenseCategories: 'A, B' },
              anomalies: [],
              summary: 'Verso du permis WebP lisible.',
            },
          },
          crossChecks: [
            { field: 'Nom et Prénoms', declaredValue: 'GBEDE Koffi Jean', extractedValue: 'GBEDE Koffi Jean', status: 'match', details: 'Correspondance exacte.' },
            { field: 'Immatriculation', declaredValue: 'BJ-4455-RB', extractedValue: 'BJ-4455-RB', status: 'match', details: 'Plaque conforme.' },
          ],
          warnings: [],
          issues: [],
          recommendations: ['Valider visuellement la photo sur le recto avant décision finale.'],
        }),
        usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 410, totalTokenCount: 1610 },
      };
    });

    const res = await fetch(`${baseUrl}/api/admin/kyc/${uid}/analyze`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.deepEqual(capturedMimeTypes, ['image/jpeg', 'image/png', 'application/pdf', 'image/webp']);
    assert.equal(body.aiAnalysis.status, 'completed');
    assert.equal(body.aiAnalysis.provider, 'gemini');
    assert.equal(body.aiAnalysis.usage.totalTokens, 1610);
    assert.equal(body.aiAnalysis.documents.drivingLicenseFront.readabilityStatus, 'readable');
    assert.equal(body.aiAnalysis.documents.drivingLicenseBack.readabilityStatus, 'readable');

    // Vérification absolue : Gemini n'a jamais approuvé ou modifié le statut métier du compte
    const savedKyc = store.kyc.get(uid)!;
    const savedUser = store.users.get(uid)!;
    assert.equal(savedKyc.status, 'en_attente');
    assert.equal(savedKyc.isApproved, false);
    assert.equal(savedKyc.verified, false);
    assert.equal(savedUser.isKycVerified, false);
    assert.equal(savedUser.kycStatus, 'en_attente');
  });

  await t.test('3. Document obligatoire manquant + permis facultatif omis sans fausse alerte + document illisible + expiration', async () => {
    const uid = 'courier_partial_issues';
    const partialDoc = buildFourDocDossier(uid, {
      documents: {
        idFront: {
          uploaded: true,
          storagePath: `kyc/${uid}/id_front/id_front_1.jpg`,
          docType: 'id_front',
          fileName: 'id_front_1.jpg',
          mimeType: 'image/jpeg',
          uploadedAt: '2026-03-01T10:00:00.000Z',
          uploadedBy: uid,
        },
        drivingLicenseFront: {
          uploaded: true,
          storagePath: `kyc/${uid}/driving_license_front/driving_license_front_1.pdf`,
          docType: 'driving_license_front',
          fileName: 'driving_license_front_1.pdf',
          mimeType: 'application/pdf',
          uploadedAt: '2026-03-01T10:02:00.000Z',
          uploadedBy: uid,
        },
      },
    });

    const files = new Map([
      [`kyc/${uid}/id_front/id_front_1.jpg`, { contentType: 'image/jpeg', data: JPEG_BYTES }],
      [`kyc/${uid}/driving_license_front/driving_license_front_1.pdf`, { contentType: 'application/pdf', data: PDF_BYTES }],
    ]);
    const { store, db, bucket } = createMockFirestoreAndStorage(
      { kyc: new Map([[uid, partialDoc]]) },
      files
    );

    serverMod.setFirestoreAdminForTests(db);
    serverMod.setStorageBucketForTests(bucket);

    serverMod.setGeminiKycAnalyzerForTests(async () => ({
      text: JSON.stringify({
        summary: 'Pièce d’identité floue et permis expiré avec divergence de nom.',
        extractedData: {
          fullName: 'AUTRE NOM',
          licenseExpiresAt: '2022-01-15',
        },
        documents: {
          idFront: {
            identifiedDocumentType: 'CNI',
            readabilityStatus: 'unreadable',
            extractionConfidence: 'low',
            confidencePercent: 25,
            anomalies: ['Image fortement floue, numéro illisible.'],
            summary: 'Photo illisible.',
          },
          drivingLicenseFront: {
            identifiedDocumentType: 'Permis de conduire (Recto)',
            readabilityStatus: 'readable',
            extractionConfidence: 'high',
            confidencePercent: 88,
            extractedFields: { fullName: 'AUTRE NOM', expiresAt: '2022-01-15' },
            anomalies: ['Permis expiré depuis 2022-01-15.'],
            summary: 'Permis expiré.',
          },
        },
        crossChecks: [
          {
            field: 'Nom complet',
            declaredValue: 'GBEDE Koffi Jean',
            extractedValue: 'AUTRE NOM',
            status: 'mismatch',
            details: 'Le nom lu sur le permis ne correspond pas au nom déclaré.',
          },
        ],
        warnings: ['Verso de la pièce d’identité absent.'],
        issues: ['Contradiction identité et permis expiré.'],
        recommendations: ['Demander un nouveau scan net.'],
      }),
    }));

    const res = await fetch(`${baseUrl}/api/admin/kyc/${uid}/analyze`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const ai = body.aiAnalysis;

    // Slot obligatoire absent -> 'missing' + warning; slot permis facultatif absent -> 'missing' sans anomalie ni faux avertissement
    assert.equal(ai.documents.idBack.readabilityStatus, 'missing');
    assert.equal(ai.documents.idBack.documentPresent, false);
    assert.equal(ai.documents.drivingLicenseBack.readabilityStatus, 'missing');
    assert.equal(ai.documents.drivingLicenseBack.documentPresent, false);
    assert.deepEqual(ai.documents.drivingLicenseBack.anomalies, []);
    // Slot illisible préservé
    assert.equal(ai.documents.idFront.readabilityStatus, 'unreadable');
    // Incohérence + expiration détectées
    assert.equal(ai.crossChecks.some((c: any) => c.status === 'mismatch'), true);
    assert.equal(ai.crossChecks.some((c: any) => c.status === 'expired'), true);
    // Statut KYC non altéré
    assert.equal(store.kyc.get(uid)!.status, 'en_attente');
  });

  await t.test('4. Erreur API Gemini persistée proprement comme failed sans faux rapport', async () => {
    const uid = 'courier_api_err';
    const files = new Map([[`kyc/${uid}/id_front/id_front_1.jpg`, { contentType: 'image/jpeg', data: JPEG_BYTES }]]);
    const { store, db, bucket } = createMockFirestoreAndStorage(
      { kyc: new Map([[uid, buildFourDocDossier(uid)]]) },
      files
    );
    serverMod.setFirestoreAdminForTests(db);
    serverMod.setStorageBucketForTests(bucket);

    serverMod.setGeminiKycAnalyzerForTests(async () => {
      throw new Error('503 SERVICE_UNAVAILABLE');
    });

    const res = await fetch(`${baseUrl}/api/admin/kyc/${uid}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token' },
      body: JSON.stringify({ __testMaxRetries: 0 }),
    });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'GEMINI_PROVIDER_ERROR');
    assert.equal(store.kyc.get(uid)!.aiAnalysis.status, 'failed');
    assert.equal(store.kyc.get(uid)!.status, 'en_attente');
  });

  await t.test('5. Timeout Gemini géré proprement (504 GEMINI_TIMEOUT)', async () => {
    const uid = 'courier_timeout';
    const files = new Map([[`kyc/${uid}/id_front/id_front_1.jpg`, { contentType: 'image/jpeg', data: JPEG_BYTES }]]);
    const { store, db, bucket } = createMockFirestoreAndStorage(
      { kyc: new Map([[uid, buildFourDocDossier(uid)]]) },
      files
    );
    serverMod.setFirestoreAdminForTests(db);
    serverMod.setStorageBucketForTests(bucket);

    serverMod.setGeminiKycAnalyzerForTests(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('Aborted')));
        })
    );

    const res = await fetch(`${baseUrl}/api/admin/kyc/${uid}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token' },
      body: JSON.stringify({ __testTimeoutMs: 40, __testMaxRetries: 0 }),
    });
    assert.equal(res.status, 504);
    const body = await res.json();
    assert.equal(body.code, 'GEMINI_TIMEOUT');
    assert.equal(store.kyc.get(uid)!.aiAnalysis.status, 'failed');
  });

  await t.test('6. Quota journalier dépassé bloqué avant tout appel Gemini (429 GEMINI_DAILY_QUOTA_EXCEEDED)', async () => {
    const uid = 'courier_quota';
    const dayKey = new Date().toISOString().slice(0, 10);
    const files = new Map([[`kyc/${uid}/id_front/id_front_1.jpg`, { contentType: 'image/jpeg', data: JPEG_BYTES }]]);
    const { db, bucket } = createMockFirestoreAndStorage(
      {
        kyc: new Map([[uid, buildFourDocDossier(uid)]]),
        ai_usage_guards: new Map([[`gemini_quota_${dayKey}`, { count: 200, estimatedCostEur: 0.5 }]]),
      },
      files
    );
    serverMod.setFirestoreAdminForTests(db);
    serverMod.setStorageBucketForTests(bucket);

    let called = false;
    serverMod.setGeminiKycAnalyzerForTests(async () => {
      called = true;
      return { text: '{}' };
    });

    const res = await fetch(`${baseUrl}/api/admin/kyc/${uid}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token' },
      body: JSON.stringify({ __testDailyCap: 200 }),
    });
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.code, 'GEMINI_DAILY_QUOTA_EXCEEDED');
    assert.equal(called, false, 'Gemini ne doit pas être invoqué si le quota est atteint');
  });

  await t.test('7. Double analyse simultanée bloquée par verrou transactionnel (409 ANALYSIS_IN_PROGRESS)', async () => {
    const uid = 'courier_concurrent';
    const files = new Map([[`kyc/${uid}/id_front/id_front_1.jpg`, { contentType: 'image/jpeg', data: JPEG_BYTES }]]);
    const { db, bucket } = createMockFirestoreAndStorage(
      { kyc: new Map([[uid, buildFourDocDossier(uid)]]) },
      files
    );
    serverMod.setFirestoreAdminForTests(db);
    serverMod.setStorageBucketForTests(bucket);

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    serverMod.setGeminiKycAnalyzerForTests(async () => {
      await firstGate;
      return {
        text: JSON.stringify({
          summary: 'Analyse OK',
          documents: {
            idFront: { readabilityStatus: 'readable', extractionConfidence: 'high', anomalies: [] },
          },
          crossChecks: [],
          warnings: [],
          issues: [],
          recommendations: [],
        }),
      };
    });

    const p1 = fetch(`${baseUrl}/api/admin/kyc/${uid}/analyze`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
    });

    // Laisser le premier appel acquérir le verrou Firestore
    await new Promise((r) => setTimeout(r, 35));

    const p2 = await fetch(`${baseUrl}/api/admin/kyc/${uid}/analyze`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
    });
    assert.equal(p2.status, 409);
    const body2 = await p2.json();
    assert.equal(body2.code, 'ANALYSIS_IN_PROGRESS');

    releaseFirst();
    const res1 = await p1;
    assert.equal(res1.status, 200);
  });

  await t.test('8. Redaction des données sensibles, clés AIza et Base64 dans les journaux serveur', () => {
    const raw =
      'Erreur sur CIP-2026-998877 NPI 1234567890 key=AIzaSyFakeSecretValue1234567890 payload data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const sanitized = redactSensitiveForLogs(raw);
    assert.equal(sanitized.includes('998877'), false);
    assert.equal(sanitized.includes('1234567890'), false);
    assert.equal(sanitized.includes('AIzaSyFakeSecretValue1234567890'), false);
    assert.equal(sanitized.includes('/9j/4AAQSkZJRg=='), false);
    assert.match(sanitized, /\[CLE_API_MASQUEE\]/);
    assert.match(sanitized, /\[ID_MASQUE\]/);
    assert.match(sanitized, /\[NUM_MASQUE\]/);
    assert.match(sanitized, /\[BASE64_MASQUE\]/);
  });

  await t.test('9. Normalisation avancée GEMINI_API_KEY, inspectGeminiKeyFormat & classification des erreurs (400/403/404)', () => {
    assert.equal(normalizeGeminiApiKey('  "AIzaSyValidKey_123" \n'), 'AIzaSyValidKey_123');
    assert.equal(normalizeGeminiApiKey("GEMINI_API_KEY='AIzaSyValidKey_123'"), 'AIzaSyValidKey_123');
    assert.equal(normalizeGeminiApiKey('\uFEFFexport GEMINI_API_KEY="AQ.Ab8RN6Sample_123";\r\n'), 'AQ.Ab8RN6Sample_123');
    assert.equal(normalizeGeminiApiKey('GEMINI_API_KEY: Bearer AIzaSyValidKey_456'), 'AIzaSyValidKey_456');
    assert.equal(normalizeGeminiApiKey('{"GEMINI_API_KEY":"AIzaSyJsonSecret_789"}'), 'AIzaSyJsonSecret_789');
    assert.equal(normalizeGeminiApiKey('{"apiKey":"AQ.JsonSample_321"}'), 'AQ.JsonSample_321');
    assert.equal(normalizeGeminiApiKey('AIzaSy With Spaces 123'), 'AIzaSyWithSpaces123');
    assert.equal(normalizeGeminiApiKey('replace-with-server-gemini-api-key-if-used'), '');
    assert.equal(normalizeGeminiApiKey('your_gemini_api_key_here'), '');
    assert.equal(normalizeGeminiApiKey('""'), '');

    assert.deepEqual(inspectGeminiKeyFormat(undefined), { configured: false, format: 'missing', length: 0 });
    assert.equal(inspectGeminiKeyFormat('AIzaSyValidKey_123').format, 'google_aiza');
    assert.equal(inspectGeminiKeyFormat('AQ.Ab8RN6Sample_123').format, 'aistudio_aq');
    assert.equal(inspectGeminiKeyFormat('custom_opaque_value').format, 'unexpected_format');

    const refErr = classifyGeminiProviderError(
      {
        status: 403,
        message: JSON.stringify({
          error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: 'Requests from referer <empty> are blocked.',
            details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }],
          },
        }),
      },
      'gemini-4-hydrogen'
    );
    assert.equal(refErr.code, 'GEMINI_AUTH_ERROR');
    assert.match(refErr.message, /référent HTTP/i);

    const svcErr = classifyGeminiProviderError(
      {
        status: 403,
        message: JSON.stringify({
          error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: 'Generative Language API has not been used in project 123 before or it is disabled.',
            details: [{ reason: 'SERVICE_DISABLED' }],
          },
        }),
      },
      'gemini-4-hydrogen'
    );
    assert.equal(svcErr.code, 'GEMINI_AUTH_ERROR');
    assert.match(svcErr.message, /generativelanguage\.googleapis\.com/i);

    const invErr = classifyGeminiProviderError(
      {
        status: 400,
        message: JSON.stringify({
          error: {
            code: 400,
            status: 'INVALID_ARGUMENT',
            message: 'API key not valid. Please pass a valid API key.',
            details: [{ reason: 'API_KEY_INVALID' }],
          },
        }),
      },
      'gemini-4-hydrogen'
    );
    assert.equal(invErr.code, 'GEMINI_AUTH_ERROR');
    assert.match(invErr.message, /API_KEY_INVALID/);

    const modelErr = classifyGeminiProviderError(
      { status: 404, message: '{"error":{"code":404,"status":"NOT_FOUND","message":"models/unknown is not found"}}' },
      'gemini-4-hydrogen'
    );
    assert.equal(modelErr.code, 'GEMINI_MODEL_NOT_FOUND');

    // Un identifiant de requête contenant "403" ne doit pas être classifié à tort comme erreur d'authentification
    const unrelatedErr = classifyGeminiProviderError(
      { status: 502, message: 'Upstream gateway error traceId=9940388' },
      'gemini-4-hydrogen'
    );
    assert.equal(unrelatedErr.code, 'GEMINI_PROVIDER_ERROR');
  });

  await t.test('10. Une erreur GEMINI_AUTH_ERROR répétée ne déclenche jamais le circuit-breaker 5xx', async () => {
    const uid = 'courier_auth_no_circuit';
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'AQ.TestKeyForAuthNoCircuit1234567890';
    try {
      const files = new Map([[`kyc/${uid}/id_front/id_front_1.jpg`, { contentType: 'image/jpeg', data: JPEG_BYTES }]]);
      const { db, bucket } = createMockFirestoreAndStorage(
        { kyc: new Map([[uid, buildFourDocDossier(uid)]]) },
        files
      );
      serverMod.setFirestoreAdminForTests(db);
      serverMod.setStorageBucketForTests(bucket);

      serverMod.setGeminiKycAnalyzerForTests(async () => {
        throw {
          status: 400,
          message: JSON.stringify({
            error: {
              code: 400,
              status: 'INVALID_ARGUMENT',
              message: 'API key not valid.',
              details: [{ reason: 'API_KEY_INVALID' }],
            },
          }),
        };
      });

      for (let i = 0; i < 6; i++) {
        const res = await fetch(`${baseUrl}/api/admin/kyc/${uid}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token' },
          body: JSON.stringify({ force: true, __testMaxRetries: 0 }),
        });
        assert.equal(res.status, 502);
        const body = await res.json();
        assert.equal(body.code, 'GEMINI_AUTH_ERROR');
      }

      // Dès que l'appel redevient valide, le circuit-breaker ne doit pas bloquer (pas de 503 GEMINI_CIRCUIT_OPEN)
      serverMod.setGeminiKycAnalyzerForTests(async () => ({
        text: JSON.stringify({
          summary: 'OK après correction clé',
          documents: { idFront: { readabilityStatus: 'readable', extractionConfidence: 'high', anomalies: [] } },
          crossChecks: [],
          warnings: [],
          issues: [],
          recommendations: [],
        }),
      }));

      const okRes = await fetch(`${baseUrl}/api/admin/kyc/${uid}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token' },
        body: JSON.stringify({ force: true }),
      });
      assert.equal(okRes.status, 200);
    } finally {
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
    }
  });

  await t.test('11. Endpoint POST /api/admin/gemini/verify protégé RBAC et diagnostics propres sans fuite de clé', async () => {
    const anonRes = await fetch(`${baseUrl}/api/admin/gemini/verify`, { method: 'POST' });
    assert.equal(anonRes.status, 401);

    const courierRes = await fetch(`${baseUrl}/api/admin/gemini/verify`, {
      method: 'POST',
      headers: { Authorization: 'Bearer courier-token' },
    });
    assert.equal(courierRes.status, 403);

    serverMod.setGeminiBackendAuthVerifierForTests(async () => ({
      ok: true,
      keyConfigured: true,
      keyFormat: 'aistudio_aq',
      model: 'gemini-4-hydrogen',
      httpStatus: 200,
      code: 'GEMINI_MODEL_HIGH_DEMAND',
      message: 'Clé GEMINI_API_KEY authentifiée avec succès auprès de Gemini (aistudio_aq).',
    }));

    const okRes = await fetch(`${baseUrl}/api/admin/gemini/verify`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
    });
    assert.equal(okRes.status, 200);
    const okBody = await okRes.json();
    assert.equal(okBody.success, true);
    assert.equal(okBody.keyFormat, 'aistudio_aq');
    assert.equal(okBody.code, 'GEMINI_MODEL_HIGH_DEMAND');

    serverMod.setGeminiBackendAuthVerifierForTests(async () => ({
      ok: false,
      keyConfigured: true,
      keyFormat: 'google_aiza',
      model: 'gemini-4-hydrogen',
      httpStatus: 502,
      code: 'GEMINI_AUTH_ERROR',
      message: "Échec d'authentification Gemini : API_KEY_INVALID.",
    }));

    const failRes = await fetch(`${baseUrl}/api/admin/gemini/verify`, {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
    });
    assert.equal(failRes.status, 502);
    const failBody = await failRes.json();
    assert.equal(failBody.success, false);
    assert.equal(failBody.code, 'GEMINI_AUTH_ERROR');
  });
});


