/*
 * Two jobs: showing push notifications while the platform is closed, and answering with a plain
 * "you are offline" page when a page is opened without a connection. The app itself always comes
 * from the network, so a new version is never held back by an old cache.
 */
const OFFLINE_CACHE = 'offline-v1';
const OFFLINE_FILES = ['/offline.html', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(OFFLINE_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== OFFLINE_CACHE).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only page loads are answered here; everything else goes to the network untouched.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/offline.html').then((page) => page ?? Response.error()),
      ),
    );
    return;
  }
  if (new URL(request.url).pathname === '/icon-192.png') {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});

self.addEventListener('push', (event) => {
  let message = { title: 'ACU Languages', body: '', url: '/app', tag: 'acu' };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // A push without a readable payload still deserves a notification.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      icon: '/icon-192.png',
      badge: '/favicon.png',
      data: { url: message.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? '/app', self.location.origin);
  // Only ever to this platform, whatever the payload says.
  if (target.origin !== self.location.origin) {
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === target.origin);
      if (open) {
        return open.navigate(target.href).then((client) => (client ?? open).focus());
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
