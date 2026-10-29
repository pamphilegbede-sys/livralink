import { Workbox } from 'workbox-window';

export interface ServiceWorkerRegistrationStatus {
  isRegistered: boolean;
  wbInstance: Workbox | null;
  registration: ServiceWorkerRegistration | null;
}

let activeWorkboxInstance: Workbox | null = null;
let activeRegistration: ServiceWorkerRegistration | null = null;

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
        console.log('🔄 Mise à jour du Service Worker LivraLink détectée.');
      } else {
        console.log('✅ Service Worker LivraLink initialisé avec succès via workbox-window.');
      }
    });

    wb.addEventListener('activated', () => {
      console.log('⚡ Service Worker LivraLink activé et opérationnel.');
    });

    wb.addEventListener('waiting', () => {
      console.log('⏳ Un nouveau Service Worker LivraLink attend d\'être activé.');
      wb.messageSkipWaiting();
    });

    const reg = await wb.register();
    activeRegistration = reg || null;

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

export const getActiveWorkboxInstance = () => activeWorkboxInstance;
export const getActiveSWRegistration = () => activeRegistration;
