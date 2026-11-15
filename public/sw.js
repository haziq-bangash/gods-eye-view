/* Nadelöhr's service worker: Web Push alerts only. It shows a notification
   for each push from the alert check (scripts/send-alerts.mjs) and opens the
   app when one is tapped. It caches nothing and does not handle fetches, so
   the app always loads fresh from the network. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Nadelöhr', body: event.data ? event.data.text() : '' };
  }
  const title = String(data.title || 'Nadelöhr').slice(0, 120);
  event.waitUntil(
    self.registration.showNotification(title, {
      body: String(data.body || '').slice(0, 240),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: String(data.tag || 'nadeloehr'),
      data: { url: typeof data.url === 'string' ? data.url : '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || '/',
    self.location.origin,
  );
  // Only ever open this app's own pages.
  const url =
    target.origin === self.location.origin ? target.href : self.location.origin;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find((client) =>
          client.url.startsWith(self.location.origin),
        );
        if (open) return open.focus();
        return self.clients.openWindow(url);
      }),
  );
});
