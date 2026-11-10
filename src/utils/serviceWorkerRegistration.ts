import { Workbox } from 'workbox-window';

export interface ServiceWorkerRegistrationStatus {
  isRegistered: boolean;
  wbInstance: Workbox | null;
  registration: ServiceWorkerRegistration | null;
}

let activeWorkboxInstance: Workbox | null = null;
let activeRegistration: ServiceWorkerRegistration | null = null;
let hasUpdateWaiting = false;

type UpdateListener = (hasUpdate: boolean) => void;
const updateListeners = new Set<UpdateListener>();

export const onSWUpdateAvailable = (callback: UpdateListener) => {
  updateListeners.add(callback);
  if (hasUpdateWaiting) {
    callback(true);
  }
  return () => {
    updateListeners.delete(callback);
  };
};

const notifyUpdateListeners = (waiting: boolean) => {
  hasUpdateWaiting = waiting;
  updateListeners.forEach((fn) => {
    try {
      fn(waiting);
    } catch (err) {
      console.warn('[SW Update Listener Error]', err);
    }
  });
};

/**
 * Registers the Service Worker using workbox-window for robust lifecycle management
 * and background notification/push capabilities.
 */
export const registerServiceWorkerWithWorkbox = async (): Promise<ServiceWorkerRegistrationStatus> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { isRegistered: false, wbInstance: null, registration: null };
  }

  try {
    const wb = new Workbox('/sw.js');
    activeWorkboxInstance = wb;

    wb.addEventListener('installed', (event) => {
      if (event.isUpdate) {
        console.log('🔄 Mise à jour du Service Worker LivraLink détectée et installée.');
        notifyUpdateListeners(true);
      } else {
        console.log('✅ Service Worker LivraLink initialisé avec succès via workbox-window.');
      }
    });

    wb.addEventListener('waiting', () => {
      console.log('⏳ Un nouveau Service Worker LivraLink attend d\'être activé.');
      notifyUpdateListeners(true);
    });

    wb.addEventListener('controlling', () => {
      console.log('⚡ Service Worker LivraLink a pris le contrôle de la page.');
    });

    wb.addEventListener('activated', () => {
      console.log('⚡ Service Worker LivraLink activé et opérationnel.');
    });

    const reg = await wb.register();
    activeRegistration = reg || null;

    if (reg) {
      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (installingWorker) {
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('✨ Nouvelle version du Service Worker prête à être activée.');
              notifyUpdateListeners(true);
            }
          });
        }
      });
    }

    // Set up proactive checks: on window focus, visibility change, and every 60s
    setupProactiveSWChecks();

    return {
      isRegistered: true,
      wbInstance: wb,
      registration: reg || null,
    };
  } catch (error) {
    console.warn('Notice d\'enregistrement Service Worker workbox-window:', error);
    return { isRegistered: false, wbInstance: null, registration: null };
  }
};

/**
 * Periodically and conditionally check for service worker updates
 */
const setupProactiveSWChecks = () => {
  if (typeof window === 'undefined') return;

  const performCheck = () => {
    checkForSWUpdate().catch(() => {});
  };

  // Check when window gains focus
  window.addEventListener('focus', performCheck);

  // Check when user switches back to this tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      performCheck();
    }
  });

  // Check when network connection is restored
  window.addEventListener('online', performCheck);

  // Periodic background check every 60 seconds
  setInterval(performCheck, 60 * 1000);
};

/**
 * Manually or proactively triggers an update check for the Service Worker
 */
export const checkForSWUpdate = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    if (activeWorkboxInstance) {
      await activeWorkboxInstance.update();
    } else if (activeRegistration) {
      await activeRegistration.update();
    } else {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        activeRegistration = reg;
        await reg.update();
      }
    }
    return true;
  } catch (err) {
    // Network errors or offline mode are expected occasionally
    return false;
  }
};

/**
 * Applies the waiting Service Worker update cleanly
 */
export const applySWUpdate = async (): Promise<void> => {
  if (activeWorkboxInstance) {
    activeWorkboxInstance.messageSkipWaiting();
  }

  // Also notify any waiting registration directly
  if (activeRegistration?.waiting) {
    activeRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  // Safely delete outdated caches before reloading
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !name.includes('google-fonts') && !name.includes('gstatic'))
          .map((name) => caches.delete(name))
      );
    } catch (e) {
      console.warn('[Cache Clear Notice]', e);
    }
  }

  // Clean reload to pick up fresh JS bundles
  window.location.reload();
};

export const getActiveWorkboxInstance = () => activeWorkboxInstance;
export const getActiveSWRegistration = () => activeRegistration;
export const isSWUpdateWaiting = () => hasUpdateWaiting;
