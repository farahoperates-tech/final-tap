const CACHE_NAME = "final-tap-cache-v4";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./overrides.css",
  "./game.js",
  "./manifest.json",
  "./favicon.ico",

  "./intro-1.png",
  "./intro-2.png",
  "./intro-1.mp3",
  "./intro-2.mp3",
  "./factory-ambience.mp3",

  "./icon-vent.png",
  "./icon-coolant.png",
  "./icon-breaker.png",
  "./icon-purge.png",
  "./icon-hotwire.png",
  "./icon-leak.png",
  "./icon-override.png",
  "./icon-worker.png",

  "./audit-bg.png",
  "./audit-wrench.png",
  "./audit-mug.png",
  "./audit-fuse.png",
  "./audit-badge.png",
  "./audit-bolts.png",
  "./audit-tape.png",
  "./audit-stamp.png",
  "./audit-valvecap.png",
  "./audit-key.png",
  "./audit-rag.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

