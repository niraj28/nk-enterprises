/* Offline support for Line Up 5. Pages and scripts always come from the network when
   it's available (so updates show up at once) and from this cache when it isn't, so local games
   against the AI keep working offline. Online rooms and Gemini need a connection anyway. */
const CACHE = "lineup5-v1";
const CORE = [
  "./", "game.css", "engine.js", "brain.js", "lines.js", "muse.js", "sound.js", "daily.js", "progress.js",
  "room-core.js", "online.js", "game.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "../assets/style.css", "../assets/navigation.css", "../assets/lic-logo.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return; // fonts, ads, game server: browser default
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("./")))
  );
});
