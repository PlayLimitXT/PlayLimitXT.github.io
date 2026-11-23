/* PLXT - Offline cache (production strategy)
   Navigation is network-first, so a deployment never serves a stale cached
   index.html. Other same-origin assets are cache-first with background refresh;
   allow-listed third-party CDN assets are network-first; offline navigation
   falls back to offline.html. VERSION must be bumped with AI.VERSION. */
const VERSION = '3.3.0';
const CACHE = 'plxt-shell-' + VERSION;
const SHELL = [
  './',
  './index.html',
  './offline.html',
  './styles.css',
  './manifest.json',
  './logo.svg',
  './vendor/marked.min.js',
  './vendor/purify.min.js',
  './vendor/github.min.css',
  './vendor/github-dark.min.css',
  './js/01-core.js',
  './js/02-providers.js',
  './js/03-tools.js',
  './js/04-render.js',
  './js/05-ui.js',
  './js/06-main.js',
  './js/07-extras.js',
  './js/08-i18n.js',
  './js/09-plus.js'
];
/* Optional enhancement libraries (hljs, KaTeX, Mermaid, pdf.js, mammoth,
   qrcodejs) are not precached: c.add() would issue real requests and return
   404 for missing files. Once placed in vendor/, same-origin caching applies
   on demand. */
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
      /* skipWaiting is not called during install. The page prompts the user about a
   new version first, so an in-progress conversation is never replaced by a
   partially updated page. */
    })()
  );
});

/* The page sends SKIP_WAITING when the user selects Update now. */
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return; // Direct POST for application requests
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // Only static CDN libraries are cached; search endpoints, fetch_url, external images and application GET requests bypass Cache Storage.
    if (!CDN_HOSTS.includes(url.hostname)) return;
    e.respondWith(
      (async () => {
        try {
          const r = await fetch(req);
          if (r && r.ok) {
            const c = await caches.open(CACHE);
            c.put(req, r.clone()).catch(() => {});
          }
          return r;
        } catch (err) {
          const hit = await caches.match(req);
          if (hit) return hit;
          throw err;
        }
      })()
    );
    return;
  }
  /* Navigation: network-first so deployments serve the latest index.html; offline falls back to cache or offline.html. */
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          const r = await fetch(req);
          if (r && r.ok) {
            const c = await caches.open(CACHE);
            c.put('./index.html', r.clone()).catch(() => {});
          }
          return r;
        } catch (err) {
          const hit =
            (await caches.match(req)) || (await caches.match('./index.html')) || (await caches.match('./offline.html'));
          if (hit) return hit;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>离线</title><p>当前离线，且尚无可用缓存。</p>',
            { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }
  // Other same-origin static assets: cache-first with background refresh.
  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE);
      const hit = await caches.match(req);
      const net = fetch(req)
        .then(r => {
          if (r && r.ok) c.put(req, r.clone()).catch(() => {});
          return r;
        })
        .catch(() => null);
      if (hit) {
        e.waitUntil(net);
        return hit;
      }
      const r = await net;
      if (r) return r;
      return new Response('离线且无缓存', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    })()
  );
});
