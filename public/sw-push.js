// LivraLink Background Push and Notification Click Handlers
// Imported into Service Worker via Workbox importScripts

self.addEventListener('push', (event) => {
  let payload = {
    title: '🔔 LivraLink - Nouvelle Notification',
    body: 'Une mise à jour importante de livraison est disponible.',
    url: '/',
    tag: `livralink_push_${Date.now()}`
  };

  try {
    if (event.data) {
      const data = event.data.json();
      payload = { ...payload, ...data };
    }
  } catch (err) {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const notificationOptions = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: payload.tag,
    renotify: true,
    data: { url: payload.url || '/' },
    actions: [
      { action: 'open', title: 'Voir la livraison' },
      { action: 'close', title: 'Fermer' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
