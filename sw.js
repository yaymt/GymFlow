// Service worker: makes the app load offline (e.g. weak signal inside the gym).
// Bump VERSION whenever you upload changed files so users get the update.
const VERSION = 'gymflow-v1.16.1';
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
  './js/exsteps.js',
  './js/roles.js',
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

// Tapping the "rest is over" notification brings the app back
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => (cs.length ? cs[0].focus() : self.clients.openWindow('./'))));
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
  // Network first (so new uploads show up). On a weak signal (inside the gym) the saved copy is used after 3 s,
  // and when offline right away; the network answer still refreshes the saved copy when it arrives.
  const fromCache = () => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'));
  const net = fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  });
  e.respondWith(new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
    // after 3 s use the saved copy of this exact file if there is one; otherwise keep waiting for the network
    const timer = setTimeout(() => caches.match(req, { ignoreSearch: true }).then(finish), 3000);
    net.then((r) => { clearTimeout(timer); finish(r); }, () => { clearTimeout(timer); fromCache().then((r) => finish(r || Response.error())); });
  }));
});
