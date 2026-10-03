/*
 * Shows push notifications while the platform is closed, and opens the right page when one is
 * pressed. It caches nothing: the app itself always comes from the network.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
      icon: '/apple-touch-icon.png',
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
