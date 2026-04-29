/* StudyTrack — minimal service worker for offline shell + asset caching.
   Strategy:
   - App-shell precache (very small list).
   - Navigation requests: network-first, fallback to cached "/" for offline SPA shell.
   - Same-origin static assets (JS/CSS/images/fonts): stale-while-revalidate.
   - Firestore/Firebase API calls: never intercepted (Firebase has its own offline persistence).
*/
const VERSION = 'studytrack-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const isFirebaseHost = (url) => {
  const h = url.hostname;
  return (
    h.endsWith('googleapis.com') ||
    h.endsWith('firebaseio.com') ||
    h.endsWith('firebaseapp.com') ||
    h.endsWith('googleusercontent.com') ||
    h.includes('firestore') ||
    h.includes('identitytoolkit')
  );
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }

  // Never intercept Firebase / Google APIs (they handle their own caching)
  if (isFirebaseHost(url)) return;

  // Navigation requests — network-first, fallback to cached shell
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('/', fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await caches.match('/') || await caches.match('/index.html');
        if (cached) return cached;
        return new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  // Same-origin static assets — stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(req);
      const networkPromise = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || networkPromise;
    })());
  }
});
