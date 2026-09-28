// 2€ Sammler – Service Worker (V10)
const SHELL = 'sammler-shell-v10';
const IMGS  = 'sammler-img-v1';
const DATA  = 'sammler-data-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const MAX_IMGS = 600;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, IMGS, DATA].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_IMGS) await Promise.all(keys.slice(0, keys.length - MAX_IMGS).map(k => cache.delete(k)));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Seite selbst: erst Netz (immer aktuell), sonst Cache (offline)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(SHELL).then(c => c.put('index.html', cp)); return r; })
      .catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
    return;
  }

  // Münzbilder: Cache zuerst, danach nachladen und merken (auch fremde Hosts)
  if (req.destination === 'image') {
    e.respondWith(caches.open(IMGS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r && (r.ok || r.type === 'opaque')) { c.put(req, r.clone()); trim(c); }
        return r;
      } catch (err) { return hit || Response.error(); }
    }));
    return;
  }

  // Katalogdaten (GitHub-JSON): stale-while-revalidate
  if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith(caches.open(DATA).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // Eigene statische Dateien
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
  }
});
