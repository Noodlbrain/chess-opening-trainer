// Service worker: precaches the app so it works offline once visited, then
// serves everything stale-while-revalidate (cached copy immediately, refresh
// in the background). Bump VERSION together with the ?v= asset query in
// index.html / js/app.js on any change.
const VERSION = "v7";
const CACHE = `chess-trainer-${VERSION}`;

const PIECES = [];
for (const c of "wb") for (const t of "pnbrqk") PIECES.push(`img/pieces-kaneo/${c}${t}.svg`);

const PRECACHE = [
  "./",
  "index.html",
  "css/style.css?v=7",
  "js/app.js?v=7",
  "js/board.js?v=7",
  "js/repertoire.js?v=7",
  "lib/chess.js?v=7",
  "manifest.webmanifest",
  "img/icon-192.png",
  "img/icon-512.png",
  "img/apple-touch-icon.png",
  ...PIECES,
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
