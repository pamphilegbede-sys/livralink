/**
 * Device Notification Utility for LivraLink
 * Handles real OS/browser notifications, Web Audio API sound chimes, and mobile vibration haptics.
 * Operates offline, in foreground, and in background/PWA mode.
 */

// Synthesize distinct audio chimes for different notification events
export const playNotificationChime = (type: string = 'default') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    if (type === 'order_created' || type === 'priority_mission') {
      // 3-tone energetic alert (D5 -> A5 -> D6)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.2);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.0, now + 0.1);
      gain2.gain.setValueAtTime(0.35, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.32);

      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(1174.66, now + 0.22);
      gain3.gain.setValueAtTime(0.25, now + 0.22);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now + 0.22);
      osc3.stop(now + 0.45);
    } else if (type === 'pod_validated' || type === 'order_accepted') {
      // Success melody (G5 -> C6)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(783.99, now);
      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.18);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.5, now + 0.12);
      gain2.gain.setValueAtTime(0.3, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.38);
    } else {
      // Standard pleasant double chime (C5 -> G5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.18);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.1);
      gain2.gain.setValueAtTime(0.25, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.32);
    }

    // Mobile haptic vibration feedback
    triggerVibration([200, 100, 200]);
  } catch (err) {
    console.warn('Playback audio chime notice:', err);
  }
};

// Trigger tactile device vibration pattern
export const triggerVibration = (pattern: number[] = [200, 100, 200]) => {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    console.warn('Vibration error:', e);
  }
};

// Get current browser notification permission status
export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export const getNotificationPermissionStatus = (): NotificationPermissionStatus => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionStatus;
};

// Request notification permission from user
export const requestNotificationPermission = async (): Promise<NotificationPermissionStatus> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      playNotificationChime('default');
    }
    return permission as NotificationPermissionStatus;
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return Notification.permission as NotificationPermissionStatus;
  }
};

// Send a real native web browser notification
export const sendBrowserNotification = (
  title: string,
  message: string,
  options?: {
    tag?: string;
    icon?: string;
    data?: any;
    onClickUrl?: string;
  }
) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    try {
      // Service Worker notification if available, otherwise fallback to window Notification
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, {
            body: message,
            icon: options?.icon || '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: options?.tag || `livralink_${Date.now()}`,
            renotify: true,
            vibrate: [200, 100, 200, 100, 200],
            data: options?.data,
          } as any);
        }).catch(() => {
          fallbackWindowNotification(title, message, options);
        });
      } else {
        fallbackWindowNotification(title, message, options);
      }
    } catch (err) {
      console.warn('Error sending browser notification:', err);
    }
  }
};

const fallbackWindowNotification = (
  title: string,
  message: string,
  options?: { tag?: string; icon?: string; onClickUrl?: string }
) => {
  try {
    const notif = new Notification(title, {
      body: message,
      icon: options?.icon || '/pwa-192x192.png',
      tag: options?.tag || `livralink_${Date.now()}`,
    });

    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch (e) {
    console.warn('Window notification fallback error:', e);
  }
};

// Master real device trigger function: plays chime + vibrates + triggers browser notification
export const triggerRealDeviceAlert = (
  title: string,
  message: string,
  type: string = 'default',
  orderId?: string
) => {
  // 1. Play sound chime and vibrate
  playNotificationChime(type);

  // 2. Fire real native browser notification
  sendBrowserNotification(title, message, {
    tag: orderId || `notif_${Date.now()}`,
  });
};
