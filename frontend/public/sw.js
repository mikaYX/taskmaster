/**
 * Service Worker — Taskmaster Web Push
 *
 * Gère :
 * - La réception des notifications push (événement 'push')
 * - Le clic sur une notification (ouverture de l'app)
 * - L'installation / activation du SW (cache minimal)
 */

const APP_VERSION = 'taskmaster-sw-v1';

// ─── Installation ──────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  // Active immédiatement sans attendre la fermeture des anciens onglets
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Prend le contrôle des clients immédiatement
      self.clients.claim(),
      // Supprime les anciens caches de versions précédentes
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== APP_VERSION)
            .map((k) => caches.delete(k)),
        ),
      ),
    ]),
  );
});

// ─── Réception Push ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Taskmaster', body: event.data.text() };
  }

  const title = payload.title ?? 'Taskmaster';
  const options = {
    body: payload.body ?? '',
    icon: payload.icon ?? '/icons/icon-192.png',
    badge: payload.badge ?? '/icons/badge-72.png',
    tag: payload.tag ?? 'taskmaster-notification',
    data: { url: payload.url ?? '/' },
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options),
  );
});

// ─── Clic sur notification ─────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si l'app est déjà ouverte, on la met au premier plan
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Sinon, on ouvre un nouvel onglet
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
