// Service worker for Web SWD Flasher PWA.
// Strategy: stale-while-revalidate for app shell, skip caching for build-info.js
// so the version stamp is always current.

const CACHE = "swd-flasher-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(["./", "./index.html", "./styles/base.css", "./manifest.json", "./icons/icon.svg"])
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;
  // Always fetch build-info.js fresh so the version stamp reflects the latest deploy.
  if (request.url.includes("build-info.js")) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      // Serve the cached version immediately and update the cache in the background.
      if (cached) {
        networkFetch;
        return cached;
      }
      return networkFetch;
    })
  );
});
