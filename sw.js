const CACHE = 'mukanya-v2'; // bump version to trigger update notification on existing installs

const APP_SHELL = [
  '/',
  '/index.html',
];

// Install: cache app shell so the app loads offline
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  // Don't skipWaiting here — wait for the user to confirm update
});

// Activate: remove stale caches from old versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Message handler — client sends 'skipWaiting' to activate the new SW
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Fetch strategy:
//   Google APIs (Firebase, Firestore) → network only  (never cache live data)
//   Google Fonts                       → stale-while-revalidate
//   Everything else (app shell)        → cache first, network fallback
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept Firebase, Firestore, or any googleapis call
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebase')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({error:'offline'}), {
        status: 503,
        headers: {'Content-Type': 'application/json'}
      }))
    );
    return;
  }

  // Google Fonts: serve cached, refresh in background
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

  // App shell: cache first, then network; cache any new responses
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
