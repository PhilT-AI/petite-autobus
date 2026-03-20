const CACHE_VERSION = 2;
const CACHE_NAME = `petite-autobus-v${CACHE_VERSION}`;

// Core shell to pre-cache on install
const PRECACHE = ["/", "/index.html"];

/* ── Install: cache shell, skip waiting immediately ── */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

/* ── Activate: purge old caches, claim clients, notify ── */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
     .then(() => {
       // Notify all open tabs that a new version is active
       return self.clients.matchAll({ type: "window" }).then((clients) => {
         clients.forEach((client) => client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION }));
       });
     })
  );
});

/* ── Fetch: stale-while-revalidate ── */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  // Skip cross-origin analytics etc.
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request).then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

/* ── Listen for manual update check from the app ── */
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "CHECK_UPDATE") {
    self.registration.update();
  }
});
