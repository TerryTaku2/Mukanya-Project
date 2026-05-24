const CACHE = 'mukanya-v4';

const APP_SHELL = [
  '/',
  '/index.html',
];

// Install: cache app shell then activate immediately — no waiting
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: remove stale caches, claim all clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//   Firebase Realtime Database / googleapis → network only (never cache live data)
//   Google Fonts / gstatic SDKs            → stale-while-revalidate
//   Everything else (app shell)            → network first, cache fallback
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept Firebase or Google API calls
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebase') ||
      url.hostname.includes('gstatic.com')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({error:'offline'}), {
        status: 503,
        headers: {'Content-Type': 'application/json'}
      }))
    );
    return;
  }

  // Google Fonts: stale-while-revalidate
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          const network = fetch(event.request).then(res => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // App shell: network first so updates are picked up immediately,
  // fall back to cache when offline
  event.respondWith(
    fetch(event.request).then(res => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, clone));
      }
      return res;
    }).catch(() => caches.match(event.request))
  );
});
