/* LisanQuran service worker — PUSH ONLY.
 *
 * Deliberately has NO fetch handler and caches nothing: a caching service
 * worker on a Vite build is how an app ends up serving a stale bundle for
 * weeks. Its only jobs are showing a push and opening the right page.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'LisanQuran', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'LisanQuran';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // One notification per subject replaces the previous one instead of stacking.
    tag: payload.tag || undefined,
    renotify: !!payload.tag,
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  // The payload links to the canonical host; this app may be installed from
  // another one (www vs the bare domain), and a cross-origin navigate is
  // simply refused. Keep the path and stay where we are.
  let path = target;
  try {
    const u = new URL(target, self.location.origin);
    path = u.pathname + u.search + u.hash;
  } catch { /* leave it as it came */ }

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse a tab that is already on this origin rather than opening another.
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        if (path === '/') return;
        // An installed iOS app ignores (or rejects) client.navigate, which used
        // to leave the student looking at whatever page they had open instead
        // of the one the notification was about. Tell the page where to go as
        // well — it routes itself (see index.tsx) — and let navigate try too.
        try { client.postMessage({ type: 'navigate', url: path }); } catch { /* no channel */ }
        if ('navigate' in client) {
          try {
            await client.navigate(path);
            return;
          } catch { /* not allowed here — the message above has to carry it */ }
        }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(path);
  })());
});
