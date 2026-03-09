const CACHE_NAME = "final-tap-cache-v3";

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
  "./factory-ambience.mp3"
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

