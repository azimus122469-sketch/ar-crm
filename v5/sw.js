// АР · Тетрадь v5 — service worker.
// Сеть в приоритете, кэш только на случай, когда интернета нет. Принимает фоновые уведомления (Web Push).
// Область действия — только папка v5, старую CRM не затрагивает.
const CACHE = 'ar-v5-15';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Библиотеки базы и Excel тоже кладём в кэш: без них приложение не открывается без сети
  const lib = (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/exceljs@'));
  if (url.origin !== self.location.origin && !lib) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
  );
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'АР · Тетрадь', {
    body: d.body || '', tag: d.tag || 'ar-remind', icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
