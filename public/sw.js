/* Self-destructing service worker (v4-final).
   History: SW caching on github.io kept serving poisoned shells after bad
   deploys (users saw "Application error" long after the fix). The app is a
   static export with content-hashed assets — plain HTTP caching plus the
   in-page build-mismatch auto-reload guard are enough. This worker's ONLY
   job is to remove every registration and purge all caches on activate,
   then stay out of the way. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {}
      try {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        await self.registration.unregister();
        await Promise.all(
          all.map((c) =>
            c.navigate ? c.navigate(c.url.split('?')[0] + '?r=' + Date.now()) : Promise.resolve()
          )
        );
      } catch {}
    })()
  );
});
