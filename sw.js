// MediStudy Service Worker — sw.js
// Works on GitHub Pages (/medistudy/) and any custom domain
const CACHE_NAME = 'medistudy-shell-v2';
const SKIP_WAITING_MSG = 'SKIP_WAITING';

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting());
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

  // Navigation requests — Cache First
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          // Background refresh to keep cache fresh
          fetch(e.request)
            .then(res => { if (res && res.ok) cache.put(e.request, res.clone()); })
            .catch(() => {});

          if (cached) return cached;

          // Not cached yet — try network
          return fetch(e.request).catch(() => {
            // Last resort: find ANY cached page in our cache
            return caches.open(CACHE_NAME).then(c =>
              c.keys().then(keys => {
                const page = keys.find(k => k.url && k.url.includes('.html') || k.url.endsWith('/'));
                return page ? c.match(page) : null;
              })
            );
          });
        })
      )
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
