// MediStudy Service Worker — sw.js
// Deploy this file in the ROOT of your GitHub repo (same folder as index.html)
// Version bump this string any time you want to force a cache refresh
const CACHE_NAME = 'medistudy-shell-v1';
const SKIP_WAITING_MSG = 'SKIP_WAITING';

// ── Install: skip waiting so this SW activates immediately ──────────────────
self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting());
});

// ── Activate: delete old caches, claim all open tabs ───────────────────────
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

// ── Message: allow page to trigger skipWaiting for instant updates ──────────
self.addEventListener('message', e => {
  if (e.data && e.data.type === SKIP_WAITING_MSG) self.skipWaiting();
});

// ── Fetch: the core offline strategy ───────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // 1. Never intercept external APIs — let them fail naturally when offline
  const externalApis = [
    'firebaseio.com', 'googleapis.com', 'google-analytics.com',
    'googletagmanager.com', 'groq.com', 'drive.google.com'
  ];
  if (externalApis.some(api => url.includes(api))) return;

  // 2. Navigation requests (loading the app URL) — Cache First, update in bg
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          // Background refresh — keep cache up to date silently
          const networkFetch = fetch(e.request)
            .then(res => {
              if (res && res.ok) cache.put(e.request, res.clone());
              return res;
            })
            .catch(() => null);

          if (cached) return cached; // Serve from cache immediately

          // Not in cache yet — try network, then fallback to root
          return networkFetch.then(res => res || null)
            .then(res => res ||
              cache.match('/') ||
              cache.match('/index.html')
            );
        })
      )
    );
    return;
  }

  // 3. Fonts and icons — Cache First forever (they never change)
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

  // 4. Everything else — Network first, cache as fallback
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
