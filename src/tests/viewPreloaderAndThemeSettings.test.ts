import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import {
  lazyWithPreload,
  PRIORITY_PRELOAD_MAP,
  createViewPreloadManager,
  shouldSkipBackgroundPreload,
} from '../utils/viewPreloader';

test('Système de préchargement des vues prioritaires React.Suspense et commutateurs manuels de thème', async (t) => {
  await t.test('lazyWithPreload déduplique les appels concurrents et réinitialise le cache en cas d\'erreur', async () => {
    let calls = 0;
    const DummyComp: React.FC = () => null;

    const LazyDummy = lazyWithPreload(async () => {
      calls += 1;
      return { default: DummyComp };
    });

    assert.equal(typeof LazyDummy.preload, 'function');

    const [first, second] = await Promise.all([LazyDummy.preload(), LazyDummy.preload()]);
    assert.equal(first.default, DummyComp);
    assert.equal(second.default, DummyComp);
    assert.equal(calls, 1);

    // Cache hit on subsequent preload
    await LazyDummy.preload();
    assert.equal(calls, 1);

    // Retry behavior when a chunk fails transiently
    let failingAttempts = 0;
    const RetryComp = lazyWithPreload(async () => {
      failingAttempts += 1;
      if (failingAttempts === 1) {
        throw new Error('Network chunk failure');
      }
      return { default: DummyComp };
    });

    await assert.rejects(() => RetryComp.preload(), /Network chunk failure/);
    const recovered = await RetryComp.preload();
    assert.equal(recovered.default, DummyComp);
    assert.equal(failingAttempts, 2);
  });

  await t.test('PRIORITY_PRELOAD_MAP relie de façon bidirectionnelle le dashboard et les paramètres (Vendeur & Livreur)', () => {
    assert.ok(PRIORITY_PRELOAD_MAP.vendeur_dashboard?.includes('vendeur_settings'));
    assert.ok(PRIORITY_PRELOAD_MAP.vendeur_dashboard?.includes('vendeur_new_delivery'));
    assert.ok(PRIORITY_PRELOAD_MAP.vendeur_settings?.includes('vendeur_dashboard'));

    assert.ok(PRIORITY_PRELOAD_MAP.livreur_dashboard?.includes('livreur_settings'));
    assert.ok(PRIORITY_PRELOAD_MAP.livreur_dashboard?.includes('livreur_missions'));
    assert.ok(PRIORITY_PRELOAD_MAP.livreur_settings?.includes('livreur_dashboard'));

    assert.ok(PRIORITY_PRELOAD_MAP.landing?.includes('login_vendeur'));
    assert.ok(PRIORITY_PRELOAD_MAP.landing?.includes('login_livreur'));
  });

  await t.test('createViewPreloadManager précharge les vues prioritaires en arrière-plan et gère l\'annulation', async () => {
    const loaded: string[] = [];
    const manager = createViewPreloadManager({
      vendeur_dashboard: async () => {
        loaded.push('vendeur_dashboard');
      },
      vendeur_settings: async () => {
        loaded.push('vendeur_settings');
      },
      vendeur_new_delivery: async () => {
        loaded.push('vendeur_new_delivery');
      },
      vendeur_tracking: async () => {
        loaded.push('vendeur_tracking');
      },
      vendeur_chat: async () => {
        loaded.push('vendeur_chat');
      },
      livreur_settings: async () => {
        throw new Error('Transient error');
      },
    });

    // Direct preload on intent (hover/focus)
    const ok = await manager.preloadView('vendeur_settings');
    assert.equal(ok, true);
    assert.equal(manager.isPreloaded('vendeur_settings'), true);

    // Failed preload returns false without throwing
    const failed = await manager.preloadView('livreur_settings');
    assert.equal(failed, false);

    // Cancellation before timer fires prevents unnecessary background load
    loaded.length = 0;
    const cancelImmediate = manager.schedulePriorityViewsForView('vendeur_dashboard', {
      delayMs: 30,
      respectSaveData: false,
    });
    cancelImmediate();
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(loaded.length, 0);

    // Active schedule triggers all priority targets for vendeur_dashboard
    const cancel = manager.schedulePriorityViewsForView('vendeur_dashboard', {
      delayMs: 15,
      respectSaveData: false,
    });
    await new Promise((r) => setTimeout(r, 60));
    cancel();

    assert.ok(loaded.includes('vendeur_settings'));
    assert.ok(loaded.includes('vendeur_new_delivery'));
    assert.ok(loaded.includes('vendeur_tracking'));
    assert.ok(loaded.includes('vendeur_chat'));
  });

  await t.test('shouldSkipBackgroundPreload respecte saveData et les connexions 2g/slow-2g', () => {
    assert.equal(shouldSkipBackgroundPreload({ connection: { saveData: true } }), true);
    assert.equal(shouldSkipBackgroundPreload({ connection: { effectiveType: '2g' } }), true);
    assert.equal(shouldSkipBackgroundPreload({ connection: { effectiveType: 'slow-2g' } }), true);
    assert.equal(shouldSkipBackgroundPreload({ connection: { saveData: false, effectiveType: '4g' } }), false);
    assert.equal(shouldSkipBackgroundPreload(undefined), false);
  });

  await t.test('Intégration UI : VendeurSettings, LivreurSettings, DarkModeToggle, App.tsx et navigation', () => {
    const darkToggleSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/common/DarkModeToggle.tsx'), 'utf8');
    const vendeurSettingsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/views/VendeurSettings.tsx'), 'utf8');
    const livreurSettingsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/views/LivreurSettings.tsx'), 'utf8');
    const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const sidebarSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/common/Sidebar.tsx'), 'utf8');
    const mobileNavSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/common/MobileBottomNav.tsx'), 'utf8');
    const headerSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/common/Header.tsx'), 'utf8');

    // DarkModeToggle exposes Light / Dark / System override controls + systemTheme
    assert.match(darkToggleSrc, /systemTheme/);
    assert.match(darkToggleSrc, /data-theme-option="light"/);
    assert.match(darkToggleSrc, /data-theme-option="dark"/);
    assert.match(darkToggleSrc, /data-theme-option="system"/);
    assert.match(darkToggleSrc, /setThemeMode\('light'\)/);
    assert.match(darkToggleSrc, /setThemeMode\('dark'\)/);
    assert.match(darkToggleSrc, /setThemeMode\('system'\)/);
    assert.match(darkToggleSrc, /aria-pressed=/);

    // VendeurSettings & LivreurSettings always display compact theme switcher + Tab 3 full switcher
    assert.match(vendeurSettingsSrc, /<DarkModeToggle compact/);
    assert.match(vendeurSettingsSrc, /<DarkModeToggle[\s\S]*Clair \/ Sombre \/ Système/);
    assert.match(livreurSettingsSrc, /<DarkModeToggle compact/);
    assert.match(livreurSettingsSrc, /<DarkModeToggle[\s\S]*Clair \/ Sombre \/ Système/);

    // App.tsx wires lazyWithPreload, registerViewPreloaders, schedulePriorityViewsForView inside Suspense
    assert.match(appSrc, /lazyWithPreload\(/);
    assert.match(appSrc, /registerViewPreloaders\(/);
    assert.match(appSrc, /schedulePriorityViewsForView\(effectiveView\)/);
    assert.match(appSrc, /<React\.Suspense/);

    // Sidebar, MobileBottomNav, Header trigger preloadView on navigation intent
    assert.match(sidebarSrc, /preloadView\(/);
    assert.match(sidebarSrc, /preloadHandlers\('vendeur_settings'\)/);
    assert.match(sidebarSrc, /preloadHandlers\('livreur_settings'\)/);
    assert.match(mobileNavSrc, /preloadView\(/);
    assert.match(headerSrc, /preloadView\(/);
    assert.match(headerSrc, /preloadViews\(/);
  });
});
