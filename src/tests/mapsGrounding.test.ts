import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_GEMINI_MAPS_MODEL,
  extractMapsGroundingSources,
  queryMapsGroundingWithGemini,
  sanitizeSafeExternalHttpUrl,
  setMapsGroundingGeneratorForTests,
} from '../server/mapsGroundingService';
import { KycGeminiAnalysisError } from '../server/kycGeminiAnalysis';

process.env.NODE_ENV = 'test';

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

test('Maps Grounding service validates inputs, enforces Gemini Maps protocol rules, and sanitizes extracted links', async (t) => {
  await t.test('Uses gemini-4-hydrogen, tools:[{googleMaps:{}}], toolConfig.retrievalConfig.latLng, and never sets responseMimeType/responseSchema', async () => {
    let capturedParams: any = null;
    setMapsGroundingGeneratorForTests(async (params) => {
      capturedParams = params;
      return {
        text: '**Pharmacie Camp Guézo** est située à Cotonou.\n- Accès facile en moto depuis le boulevard.',
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [
                {
                  maps: {
                    title: 'Pharmacie Camp Guézo',
                    uri: 'https://maps.google.com/?cid=123456',
                    placeId: 'ChIJ_demo_place_1',
                    text: 'Ouverte 24h/24 à Cotonou',
                    placeAnswerSources: {
                      reviewSnippets: [
                        {
                          title: 'Avis client',
                          uri: 'https://maps.google.com/review/1',
                          text: 'Service rapide et repère très visible sur le carrefour.',
                          author: 'Afi',
                        },
                        {
                          title: 'Lien malveillant à rejeter',
                          uri: 'javascript:alert(1)',
                          text: 'Doit être filtré',
                        },
                      ],
                    },
                  },
                },
                {
                  maps: {
                    title: 'Doublon même URI',
                    uri: 'https://maps.google.com/?cid=123456',
                  },
                },
                {
                  maps: {
                    title: 'URI XSS à bloquer',
                    uri: 'javascript:alert(document.cookie)',
                  },
                },
              ],
            },
          },
        ],
      };
    });

    try {
      const result = await queryMapsGroundingWithGemini({
        query: 'Pharmacie Camp Guézo',
        commune: 'Cotonou - Haie Vive',
        context: 'dropoff',
        latitude: 6.3571,
        longitude: 2.4175,
      });

      assert.ok(capturedParams);
      assert.equal(capturedParams.model, DEFAULT_GEMINI_MAPS_MODEL);
      assert.equal(capturedParams.model, 'gemini-4-hydrogen');
      assert.deepEqual(capturedParams.config.tools, [{ googleMaps: {} }]);
      assert.deepEqual(capturedParams.config.toolConfig, {
        retrievalConfig: {
          latLng: { latitude: 6.3571, longitude: 2.4175 },
        },
      });
      assert.equal((capturedParams.config as any).responseMimeType, undefined);
      assert.equal((capturedParams.config as any).responseSchema, undefined);

      assert.equal(result.model, 'gemini-4-hydrogen');
      assert.equal(result.context, 'dropoff');
      assert.deepEqual(result.latLngUsed, { latitude: 6.3571, longitude: 2.4175 });
      assert.equal(result.places.length, 1);
      assert.equal(result.places[0].title, 'Pharmacie Camp Guézo');
      assert.equal(result.places[0].uri, 'https://maps.google.com/?cid=123456');
      assert.equal(result.places[0].placeId, 'ChIJ_demo_place_1');

      assert.equal(result.reviewSnippets.length, 1);
      assert.equal(result.reviewSnippets[0].uri, 'https://maps.google.com/review/1');
      assert.equal(result.reviewSnippets[0].author, 'Afi');
    } finally {
      setMapsGroundingGeneratorForTests(null);
    }
  });

  await t.test('sanitizeSafeExternalHttpUrl only permits http/https URLs', () => {
    assert.equal(sanitizeSafeExternalHttpUrl('https://maps.google.com/?q=Cotonou'), 'https://maps.google.com/?q=Cotonou');
    assert.equal(sanitizeSafeExternalHttpUrl('http://maps.example.com/place'), 'http://maps.example.com/place');
    assert.equal(sanitizeSafeExternalHttpUrl('javascript:alert(1)'), null);
    assert.equal(sanitizeSafeExternalHttpUrl('data:text/html,<script>alert(1)</script>'), null);
    assert.equal(sanitizeSafeExternalHttpUrl('/relative/path'), null);
    assert.equal(sanitizeSafeExternalHttpUrl(''), null);
  });

  await t.test('extractMapsGroundingSources falls back cleanly to parent maps.uri for text reviewSnippets without explicit snippet uri', () => {
    const extracted = extractMapsGroundingSources({
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              {
                maps: {
                  title: 'Stade de l’Amitié',
                  uri: 'https://maps.google.com/?cid=999',
                  placeAnswerSources: {
                    reviewSnippets: [{ text: 'Grand parking facile d’accès en moto.' }],
                  },
                },
              },
            ],
          },
        },
      ],
    });
    assert.equal(extracted.places.length, 1);
    assert.equal(extracted.reviewSnippets.length, 1);
    assert.equal(extracted.reviewSnippets[0].uri, 'https://maps.google.com/?cid=999');
  });

  await t.test('Rejects empty/oversized query and invalid/partial coordinates with 400', async () => {
    await assert.rejects(
      () => queryMapsGroundingWithGemini({ query: '   ' }),
      (err: any) => err instanceof KycGeminiAnalysisError && err.httpStatus === 400 && err.code === 'INVALID_MAPS_QUERY'
    );

    await assert.rejects(
      () => queryMapsGroundingWithGemini({ query: 'x'.repeat(301) }),
      (err: any) => err instanceof KycGeminiAnalysisError && err.httpStatus === 400 && err.code === 'INVALID_MAPS_QUERY'
    );

    await assert.rejects(
      () => queryMapsGroundingWithGemini({ query: 'Cotonou', latitude: 6.37 }),
      (err: any) => err instanceof KycGeminiAnalysisError && err.httpStatus === 400 && err.code === 'INVALID_COORDINATES'
    );

    await assert.rejects(
      () => queryMapsGroundingWithGemini({ query: 'Cotonou', latitude: 95, longitude: 2.4 }),
      (err: any) => err instanceof KycGeminiAnalysisError && err.httpStatus === 400 && err.code === 'INVALID_COORDINATES'
    );
  });

  await t.test('Fails closed with 503 GEMINI_API_KEY_MISSING when GEMINI_API_KEY is absent', async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    setMapsGroundingGeneratorForTests(null);
    try {
      await assert.rejects(
        () => queryMapsGroundingWithGemini({ query: 'Akpakpa Cotonou' }),
        (err: any) =>
          err instanceof KycGeminiAnalysisError &&
          err.httpStatus === 503 &&
          err.code === 'GEMINI_API_KEY_MISSING'
      );
    } finally {
      if (prevKey !== undefined) {
        process.env.GEMINI_API_KEY = prevKey;
      }
    }
  });
});

test('POST /api/maps/grounding HTTP route enforces auth, validation, rate limiting, and error classification', async (t) => {
  const { baseUrl, close } = await startTestServer();
  const serverMod = await import('../../server');

  t.after(async () => {
    serverMod.setMapsGroundingForTests(null);
    serverMod.setTokenVerifierForTests(null);
    await close();
  });

  serverMod.setTokenVerifierForTests(async (tok) => {
    if (tok === 'vendor-verified-tok') {
      return { uid: 'vendor_maps_1', email: 'vendor@livralink.bj', email_verified: true };
    }
    if (tok === 'courier-verified-tok') {
      return { uid: 'courier_maps_1', email: 'courier@livralink.bj', email_verified: true };
    }
    if (tok === 'unverified-tok') {
      return { uid: 'unv_maps_1', email: 'unv@livralink.bj', email_verified: false };
    }
    throw new Error('Invalid token');
  });

  await t.test('Rejects unauthenticated (401) and unverified-email (403) callers', async () => {
    const res401 = await fetch(`${baseUrl}/api/maps/grounding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Cotonou Haie Vive' }),
    });
    assert.equal(res401.status, 401);

    const res403 = await fetch(`${baseUrl}/api/maps/grounding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer unverified-tok' },
      body: JSON.stringify({ query: 'Cotonou Haie Vive' }),
    });
    assert.equal(res403.status, 403);
  });

  await t.test('Returns grounded places & review snippets for verified vendor and courier', async () => {
    serverMod.setMapsGroundingForTests(async (params) => {
      assert.equal(params.model, 'gemini-4-hydrogen');
      assert.deepEqual(params.config.tools, [{ googleMaps: {} }]);
      return {
        text: 'Repère confirmé : Carrefour Unafrica, Akpakpa, Cotonou.',
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [
                {
                  maps: {
                    title: 'Carrefour Unafrica',
                    uri: 'https://maps.google.com/?cid=777888',
                    placeAnswerSources: {
                      reviewSnippets: [
                        {
                          title: 'Accès rapide',
                          uri: 'https://maps.google.com/reviews/777888',
                          text: 'Axe principal bien desservi.',
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        ],
      };
    });

    const res = await fetch(`${baseUrl}/api/maps/grounding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer vendor-verified-tok',
      },
      body: JSON.stringify({
        query: 'Carrefour Unafrica',
        commune: 'Cotonou - Akpakpa',
        context: 'dropoff',
        latitude: 6.3645,
        longitude: 2.4567,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.result.model, 'gemini-4-hydrogen');
    assert.equal(body.result.places.length, 1);
    assert.equal(body.result.places[0].uri, 'https://maps.google.com/?cid=777888');
    assert.equal(body.result.reviewSnippets.length, 1);
    assert.deepEqual(body.result.latLngUsed, { latitude: 6.3645, longitude: 2.4567 });
  });

  await t.test('Validates invalid payload (400), auth failures without key leakage (502), and timeout (504)', async () => {
    const res400 = await fetch(`${baseUrl}/api/maps/grounding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer courier-verified-tok',
      },
      body: JSON.stringify({ query: '' }),
    });
    assert.equal(res400.status, 400);

    serverMod.setMapsGroundingForTests(async () => {
      throw new Error(
        JSON.stringify({
          error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: 'API_KEY_INVALID AIzaSyDemoFakeSecretKey123456',
            details: [{ reason: 'API_KEY_INVALID' }],
          },
        })
      );
    });

    const res502 = await fetch(`${baseUrl}/api/maps/grounding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer courier-verified-tok',
      },
      body: JSON.stringify({ query: 'Calavi Carrefour IITA', __testMaxRetries: 0 }),
    });
    assert.equal(res502.status, 502);
    const body502 = await res502.json();
    assert.equal(body502.code, 'GEMINI_AUTH_ERROR');
    assert.equal(JSON.stringify(body502).includes('AIza'), false);

    serverMod.setMapsGroundingForTests(async ({ config }) => {
      return await new Promise((_resolve, reject) => {
        config.abortSignal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const res504 = await fetch(`${baseUrl}/api/maps/grounding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer courier-verified-tok',
      },
      body: JSON.stringify({
        query: 'Porto-Novo Ouando',
        __testTimeoutMs: 40,
        __testMaxRetries: 0,
      }),
    });
    assert.equal(res504.status, 504);
    const body504 = await res504.json();
    assert.equal(body504.code, 'GEMINI_MAPS_TIMEOUT');
  });
});

test('Frontend security & Maps Grounding UI compliance verification', () => {
  const clientServiceSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/mapsGroundingService.ts'),
    'utf8'
  );
  const assistantUiSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/maps/GoogleMapsGroundingAssistant.tsx'),
    'utf8'
  );
  const serverServiceSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/server/mapsGroundingService.ts'),
    'utf8'
  );

  // Never expose @google/genai or GEMINI_API_KEY in frontend code
  assert.equal(clientServiceSrc.includes('@google/genai'), false);
  assert.equal(clientServiceSrc.includes('GEMINI_API_KEY'), false);
  assert.equal(assistantUiSrc.includes('@google/genai'), false);
  assert.equal(assistantUiSrc.includes('GEMINI_API_KEY'), false);

  // UI renders clickable external links for places & reviewSnippets without dangerouslySetInnerHTML
  assert.equal(assistantUiSrc.includes('dangerouslySetInnerHTML'), false);
  assert.equal(assistantUiSrc.includes('href={place.uri}'), true);
  assert.equal(assistantUiSrc.includes('href={snippet.uri}'), true);
  assert.equal(assistantUiSrc.includes('rel="noopener noreferrer"'), true);

  // Server uses gemini-4-hydrogen with googleMaps and no responseSchema/responseMimeType
  assert.equal(serverServiceSrc.includes("'gemini-4-hydrogen'"), true);
  assert.equal(serverServiceSrc.includes('googleMaps: {}'), true);
  assert.equal(/responseMimeType\s*:/.test(serverServiceSrc), false);
  assert.equal(/responseSchema\s*:/.test(serverServiceSrc), false);
});
