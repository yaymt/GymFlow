// Service worker: makes the app load offline (e.g. weak signal inside the gym).
// Bump VERSION whenever you upload changed files so users get the update.
const VERSION = 'gymflow-v1.4.0';
// Exercise demo images (from the CDN) are kept in their own cache so they survive app updates and work offline once viewed.
const MEDIA_CACHE = 'gymflow-media';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/store.js',
  './js/config.js',
  './js/i18n.js',
  './js/data.js',
  './js/exmedia.js',
  './js/ui.js',
  './js/charts.js',
  './js/vendor/firebase.js',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== MEDIA_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Demo images: cache first, fetch once, then available offline
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/gh/yuhonas/free-exercise-db')) {
    e.respondWith(caches.open(MEDIA_CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  // Only handle our own files; Firebase/Google traffic goes straight to the network.
  if (url.origin !== location.origin) return;
  // Network first (so new uploads show up), cache as fallback when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
