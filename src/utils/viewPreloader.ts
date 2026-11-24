import React from 'react';
import type { AppView } from '../context/AppContext';

export type PreloadableComponent<T extends React.ComponentType<any>> =
  React.LazyExoticComponent<T> & {
    preload: () => Promise<{ default: T }>;
  };

/**
 * Wraps React.lazy with an idempotent `.preload()` method so navigation links and
 * idle priority schedulers can warm up chunks before React.Suspense renders them.
 */
export function lazyWithPreload<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  let pendingPromise: Promise<{ default: T }> | null = null;

  const load = (): Promise<{ default: T }> => {
    if (!pendingPromise) {
      pendingPromise = factory().catch((error) => {
        pendingPromise = null;
        throw error;
      });
    }
    return pendingPromise;
  };

  const Component = React.lazy(load) as PreloadableComponent<T>;
  Component.preload = load;
  return Component;
}

export type ViewPreloadFn = () => Promise<unknown>;

/**
 * Priority preload graph: ensures bidirectional instant transitions between
 * dashboards and settings as well as primary adjacent operational views.
 */
export const PRIORITY_PRELOAD_MAP: Readonly<Partial<Record<AppView, readonly AppView[]>>> = {
  landing: ['login_vendeur', 'login_livreur', 'register'],
  login_vendeur: ['vendeur_dashboard', 'vendeur_settings', 'register'],
  login_livreur: ['livreur_dashboard', 'livreur_settings', 'register'],
  register: ['login_vendeur', 'login_livreur'],
  vendeur_dashboard: ['vendeur_settings', 'vendeur_new_delivery', 'vendeur_tracking', 'vendeur_chat'],
  vendeur_settings: ['vendeur_dashboard', 'vendeur_new_delivery', 'vendeur_tracking'],
  vendeur_new_delivery: ['vendeur_dashboard', 'vendeur_tracking', 'vendeur_settings'],
  vendeur_tracking: ['vendeur_dashboard', 'vendeur_new_delivery', 'vendeur_settings', 'vendeur_chat'],
  vendeur_reports: ['vendeur_dashboard', 'vendeur_settings', 'vendeur_tracking'],
  vendeur_chat: ['vendeur_dashboard', 'vendeur_tracking', 'vendeur_settings'],
  livreur_dashboard: ['livreur_settings', 'livreur_missions', 'livreur_wallet', 'livreur_chat'],
  livreur_settings: ['livreur_dashboard', 'livreur_missions', 'livreur_wallet'],
  livreur_missions: ['livreur_dashboard', 'livreur_settings', 'livreur_wallet', 'livreur_chat'],
  livreur_wallet: ['livreur_dashboard', 'livreur_settings', 'livreur_missions'],
  livreur_chat: ['livreur_dashboard', 'livreur_missions', 'livreur_settings'],
  admin_console: ['vendeur_dashboard', 'vendeur_settings', 'livreur_dashboard', 'livreur_settings'],
};

interface NetworkInfoLike {
  saveData?: boolean;
  effectiveType?: string;
}

export interface SchedulePreloadOptions {
  delayMs?: number;
  idleTimeoutMs?: number;
  respectSaveData?: boolean;
  priorityMap?: Readonly<Partial<Record<AppView, readonly AppView[]>>>;
}

export function shouldSkipBackgroundPreload(nav: { connection?: NetworkInfoLike } | undefined = typeof navigator !== 'undefined' ? (navigator as unknown as { connection?: NetworkInfoLike }) : undefined): boolean {
  const conn = nav?.connection;
  if (!conn) return false;
  if (conn.saveData === true) return true;
  if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return true;
  return false;
}

export function createViewPreloadManager(
  initialRegistry: Partial<Record<AppView, ViewPreloadFn>> = {}
) {
  const registry = new Map<AppView, ViewPreloadFn>();
  const completedViews = new Set<AppView>();

  const registerMany = (map: Partial<Record<AppView, ViewPreloadFn>>) => {
    (Object.entries(map) as [AppView, ViewPreloadFn | undefined][]).forEach(([view, fn]) => {
      if (fn) {
        registry.set(view, fn);
      }
    });
  };

  registerMany(initialRegistry);

  const preloadView = async (view: AppView): Promise<boolean> => {
    const loader = registry.get(view);
    if (!loader) return false;
    try {
      await loader();
      completedViews.add(view);
      return true;
    } catch {
      return false;
    }
  };

  const preloadViews = async (views: readonly AppView[]): Promise<void> => {
    await Promise.allSettled(views.map((view) => preloadView(view)));
  };

  const schedulePriorityViewsForView = (
    view: AppView,
    options: SchedulePreloadOptions = {}
  ): (() => void) => {
    const {
      delayMs = 120,
      idleTimeoutMs = 600,
      respectSaveData = true,
      priorityMap = PRIORITY_PRELOAD_MAP,
    } = options;

    if (respectSaveData && shouldSkipBackgroundPreload()) {
      return () => {};
    }

    const targets = priorityMap[view];
    if (!targets || targets.length === 0) {
      return () => {};
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const run = () => {
      if (cancelled) return;
      void preloadViews(targets);
    };

    const g = globalThis as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof g.requestIdleCallback === 'function') {
      idleId = g.requestIdleCallback(run, { timeout: idleTimeoutMs });
    } else {
      timeoutId = setTimeout(run, delayMs);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof g.cancelIdleCallback === 'function') {
        g.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  };

  return {
    registerMany,
    preloadView,
    preloadViews,
    schedulePriorityViewsForView,
    isPreloaded: (view: AppView) => completedViews.has(view),
    getRegisteredViews: () => Array.from(registry.keys()),
  };
}

const defaultManager = createViewPreloadManager();

export const registerViewPreloaders = defaultManager.registerMany;
export const preloadView = defaultManager.preloadView;
export const preloadViews = defaultManager.preloadViews;
export const schedulePriorityViewsForView = defaultManager.schedulePriorityViewsForView;
export const isViewPreloaded = defaultManager.isPreloaded;
