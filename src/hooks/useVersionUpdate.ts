import { useState, useEffect, useCallback, useRef } from 'react';
import { onSWUpdateAvailable, checkForSWUpdate, applySWUpdate } from '../utils/serviceWorkerRegistration';

export interface VersionInfo {
  version: string;
  buildTime: string;
  appName?: string;
}

const LOCAL_CLIENT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.4.0';

export function useVersionUpdate() {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean>(false);
  const [latestVersionInfo, setLatestVersionInfo] = useState<VersionInfo | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const lastCheckTimeRef = useRef<number>(0);

  // Check version from server endpoint
  const checkServerVersion = useCallback(async (): Promise<boolean> => {
    // Avoid double-checking within 5 seconds
    const now = Date.now();
    if (now - lastCheckTimeRef.current < 5000) {
      return false;
    }
    lastCheckTimeRef.current = now;
    setIsChecking(true);

    try {
      // 1. Proactively check Service Worker for new byte update
      checkForSWUpdate().catch(() => {});

      // 2. Fetch fresh version.json with anti-cache query param & headers
      const res = await fetch(`/version.json?_t=${now}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });

      if (!res.ok) {
        setIsChecking(false);
        return false;
      }

      const data: VersionInfo = await res.json();
      if (data && data.version) {
        // If server version is different from the bundle version running in this tab
        if (data.version !== LOCAL_CLIENT_VERSION) {
          console.log(`[Version Manager] Nouvelle version détectée sur le serveur: ${data.version} (actuelle: ${LOCAL_CLIENT_VERSION})`);
          setLatestVersionInfo(data);
          setIsUpdateAvailable(true);
          setIsChecking(false);
          return true;
        }
      }
    } catch (err) {
      // Network errors are non-fatal
    } finally {
      setIsChecking(false);
    }
    return false;
  }, []);

  // Listen to Service Worker updates
  useEffect(() => {
    const unsubscribe = onSWUpdateAvailable((hasWaitingWorker) => {
      if (hasWaitingWorker) {
        console.log('[Version Manager] Service Worker en attente d\'activation détecté.');
        setIsUpdateAvailable(true);
      }
    });

    return unsubscribe;
  }, []);

  // Set up periodic and event-driven version checks
  useEffect(() => {
    // 1. Initial check shortly after app loads (after 3 seconds)
    const initialTimer = setTimeout(() => {
      checkServerVersion();
    }, 3000);

    // 2. Check on window focus
    const handleFocus = () => {
      checkServerVersion();
    };
    window.addEventListener('focus', handleFocus);

    // 3. Check on tab visibility change
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkServerVersion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // 4. Check on network online
    const handleOnline = () => {
      checkServerVersion();
    };
    window.addEventListener('online', handleOnline);

    // 5. Periodic polling every 45 seconds
    const intervalTimer = setInterval(() => {
      checkServerVersion();
    }, 45 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [checkServerVersion]);

  // Apply update cleanly
  const applyUpdate = useCallback(async () => {
    setIsUpdating(true);
    try {
      await applySWUpdate();
    } catch (e) {
      console.warn('[Apply Update Notice] Direct reload fallback:', e);
      window.location.reload();
    }
  }, []);

  // Dismiss update temporarily (e.g. while courier is actively finalizing a mission)
  const dismissUpdate = useCallback(() => {
    setIsDismissed(true);
    // Un-dismiss after 15 minutes in case user forgets
    setTimeout(() => {
      setIsDismissed(false);
    }, 15 * 60 * 1000);
  }, []);

  return {
    isUpdateAvailable: isUpdateAvailable && !isDismissed,
    latestVersionInfo,
    currentVersion: LOCAL_CLIENT_VERSION,
    isChecking,
    isUpdating,
    checkServerVersion,
    applyUpdate,
    dismissUpdate,
  };
}
