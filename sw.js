// MediStudy Service Worker — sw.js
// Works on GitHub Pages (/medistudy/) and any custom domain
const CACHE_NAME = 'medistudy-shell-v26';
const SKIP_WAITING_MSG = 'SKIP_WAITING';
const NAV_TIMEOUT_MS = 4000; // how long to wait for the network before showing the saved page

// Core app shell — cached upfront on install so offline mode works
// from the very first load, not just after each file has been fetched once.
const PRECACHE_URLS = [
  './',
  'index.html',
  'style.css',
  'core.js',
  'features.js',
  'admin.js',
  'manifest.json'
];

// ── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(err => console.error('MediStudy precache failed:', err))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && !k.startsWith('medistudy-pdf'))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Message: skipWaiting for instant updates ──────────────────────────────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === SKIP_WAITING_MSG) self.skipWaiting();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Never intercept external APIs
  const externalApis = [
    'firebaseio.com', 'googleapis.com', 'google-analytics.com',
    'googletagmanager.com', 'groq.com', 'drive.google.com'
  ];
  if (externalApis.some(api => url.includes(api))) return;

  // Navigation requests — Network First: always try for the newest page, so updates show on the FIRST open.
  // Falls back to the saved copy when offline, when the server errors, or if the network takes longer than 4s
  // (slow connections) — the saved copy is then shown and the download keeps going to refresh it for next time.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        const network = fetch(e.request).then(res => {
          if (res && res.ok) { cache.put(e.request, res.clone()); return res; }
          return Promise.reject(new Error('bad response'));
        });
        const slow = new Promise(resolve => setTimeout(() => resolve(null), NAV_TIMEOUT_MS));
        const fromCache = () =>
          cache.match(e.request, { ignoreSearch: true })
            .then(c => c || cache.match('index.html', { ignoreSearch: true }))
            .then(c => c || cache.match('./', { ignoreSearch: true }));
        return Promise.race([network.catch(() => null), slow]).then(res => {
          if (res) return res;
          return fromCache().then(cached => cached || network.catch(() => fromCache()));
        });
      })
    );
    return;
  }

  // Fonts and icons — Cache First forever
  const staticAssets = ['fonts.gstatic.com', 'fonts.googleapis.com', 'icons8.com'];
  if (staticAssets.some(a => url.includes(a))) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.ok) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else — Network first, cache as fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.ok && e.request.method === 'GET') {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
