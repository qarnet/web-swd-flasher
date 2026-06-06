// Service worker for Web SWD Flasher PWA.
// Strategy:
//   - index.html + root: network-first so users always get fresh markup on open
//   - build-info.js: always network (no cache) so version stamp is current
//   - everything else: stale-while-revalidate

const CACHE = "swd-flasher-v1";

function isHtmlShell(url) {
  const path = new URL(url).pathname;
  return path === "/" || path.endsWith("/index.html");
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        "./",
        "./index.html",
        "./styles/base.css",
        "./manifest.json",
        "./icons/icon.svg",
      ])
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

  // Network-first for HTML shell: user always sees latest on open, cache is fallback.
  if (isHtmlShell(request.url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return cache.match(request);
        }
      })
    );
    return;
  }

  // Stale-while-revalidate for all other assets.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      if (cached) {
        networkFetch;
        return cached;
      }
      return networkFetch;
    })
  );
});
