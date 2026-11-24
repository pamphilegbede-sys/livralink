import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyThemeToDocument,
  getSystemThemePreference,
  readSavedThemeMode,
  resolveTheme,
  subscribeToSystemThemeChange,
  SYSTEM_COLOR_SCHEME_QUERY,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
} from '../utils/themeUtils';

test('Détection automatique du thème système LivraLink (light/dark/system)', async (t) => {
  await t.test('readSavedThemeMode retourne system par défaut et valide les préférences persistées', () => {
    assert.equal(readSavedThemeMode(null), 'system');
    assert.equal(readSavedThemeMode({ getItem: () => null }), 'system');
    assert.equal(readSavedThemeMode({ getItem: () => 'invalid-value' }), 'system');
    assert.equal(readSavedThemeMode({ getItem: (k) => (k === THEME_STORAGE_KEY ? 'dark' : null) }), 'dark');
    assert.equal(readSavedThemeMode({ getItem: (k) => (k === THEME_STORAGE_KEY ? 'light' : null) }), 'light');
    assert.equal(readSavedThemeMode({ getItem: (k) => (k === THEME_STORAGE_KEY ? 'system' : null) }), 'system');
  });

  await t.test('getSystemThemePreference détecte dark / light depuis matchMedia et reste sûr sans DOM', () => {
    assert.equal(getSystemThemePreference(null), 'light');
    assert.equal(
      getSystemThemePreference((q) => {
        assert.equal(q, SYSTEM_COLOR_SCHEME_QUERY);
        return { matches: true };
      }),
      'dark'
    );
    assert.equal(
      getSystemThemePreference((q) => {
        assert.equal(q, SYSTEM_COLOR_SCHEME_QUERY);
        return { matches: false };
      }),
      'light'
    );
  });

  await t.test('resolveTheme bascule automatiquement selon le thème système en mode system et respecte les choix manuels', () => {
    assert.equal(resolveTheme('system', 'dark'), 'dark');
    assert.equal(resolveTheme('system', 'light'), 'light');
    assert.equal(resolveTheme('light', 'dark'), 'light');
    assert.equal(resolveTheme('dark', 'light'), 'dark');
  });

  await t.test('subscribeToSystemThemeChange réagit en temps réel (addEventListener & addListener) et se désabonne', () => {
    const modernHolder: { fn: ((e: MediaQueryListEvent) => void) | null; removed: boolean } = {
      fn: null,
      removed: false,
    };
    const observedModern: ResolvedTheme[] = [];

    const unsubModern = subscribeToSystemThemeChange(
      (next) => observedModern.push(next),
      () => ({
        matches: false,
        addEventListener: (_type, fn) => {
          modernHolder.fn = fn;
        },
        removeEventListener: (_type, fn) => {
          if (modernHolder.fn === fn) modernHolder.removed = true;
        },
      })
    );

    assert.ok(modernHolder.fn);
    modernHolder.fn({ matches: true } as MediaQueryListEvent);
    modernHolder.fn({ matches: false } as MediaQueryListEvent);
    assert.deepEqual(observedModern, ['dark', 'light']);
    unsubModern();
    assert.equal(modernHolder.removed, true);

    const legacyHolder: { fn: ((e: MediaQueryListEvent) => void) | null; removed: boolean } = {
      fn: null,
      removed: false,
    };
    const observedLegacy: ResolvedTheme[] = [];

    const unsubLegacy = subscribeToSystemThemeChange(
      (next) => observedLegacy.push(next),
      () => ({
        matches: true,
        addListener: (fn) => {
          legacyHolder.fn = fn;
        },
        removeListener: (fn) => {
          if (legacyHolder.fn === fn) legacyHolder.removed = true;
        },
      })
    );

    assert.ok(legacyHolder.fn);
    legacyHolder.fn({ matches: false } as MediaQueryListEvent);
    legacyHolder.fn({ matches: true } as MediaQueryListEvent);
    assert.deepEqual(observedLegacy, ['light', 'dark']);
    unsubLegacy();
    assert.equal(legacyHolder.removed, true);
  });

  await t.test('applyThemeToDocument met à jour .dark, colorScheme, data-theme et meta theme-color', () => {
    const createMockDoc = () => {
      const rootClasses = new Set<string>();
      const bodyClasses = new Set<string>();
      let metaContent = '#1d4ed8';
      const doc = {
        documentElement: {
          classList: {
            toggle: (cls: string, force?: boolean) => {
              if (force) rootClasses.add(cls);
              else rootClasses.delete(cls);
              return force ?? rootClasses.has(cls);
            },
          },
          style: { colorScheme: '' },
          dataset: {} as Record<string, string>,
        },
        body: {
          classList: {
            toggle: (cls: string, force?: boolean) => {
              if (force) bodyClasses.add(cls);
              else bodyClasses.delete(cls);
              return force ?? bodyClasses.has(cls);
            },
          },
        },
        querySelector: (sel: string) =>
          sel === 'meta[name="theme-color"]'
            ? {
                setAttribute: (_k: string, val: string) => {
                  metaContent = val;
                },
              }
            : null,
      } as unknown as Document;

      return { doc, rootClasses, bodyClasses, getMeta: () => metaContent };
    };

    const mock = createMockDoc();
    applyThemeToDocument('dark', mock.doc);
    assert.equal(mock.rootClasses.has('dark'), true);
    assert.equal(mock.bodyClasses.has('dark'), true);
    assert.equal(mock.doc.documentElement.style.colorScheme, 'dark');
    assert.equal(mock.doc.documentElement.dataset.theme, 'dark');
    assert.equal(mock.getMeta(), '#090d16');

    applyThemeToDocument('light', mock.doc);
    assert.equal(mock.rootClasses.has('dark'), false);
    assert.equal(mock.bodyClasses.has('dark'), false);
    assert.equal(mock.doc.documentElement.style.colorScheme, 'light');
    assert.equal(mock.doc.documentElement.dataset.theme, 'light');
    assert.equal(mock.getMeta(), '#1d4ed8');
  });

  await t.test('AppProvider et index.html intègrent la détection système en temps réel et pré-hydratation', () => {
    const appCtxSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/context/AppContext.tsx'), 'utf8');
    const htmlSrc = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');

    assert.ok(appCtxSrc.includes('readSavedThemeMode'));
    assert.ok(appCtxSrc.includes('getSystemThemePreference'));
    assert.ok(appCtxSrc.includes('subscribeToSystemThemeChange'));
    assert.ok(appCtxSrc.includes("window.addEventListener('storage', handleStorageSync)"));
    assert.ok(appCtxSrc.includes('resolvedTheme'));
    assert.ok(appCtxSrc.includes('systemTheme'));
    assert.ok(htmlSrc.includes('(prefers-color-scheme: dark)'));
    assert.ok(htmlSrc.includes('livralink_theme_mode'));
  });
});
