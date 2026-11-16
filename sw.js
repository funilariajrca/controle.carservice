/* Controle Car Service - Funilaria · service worker
   Ao publicar uma nova versão do app, troque o número de VERSION abaixo. */
var VERSION = 'v7';
var SHELL = 'cs-shell-' + VERSION;
var RUNTIME = 'cs-runtime-' + VERSION;
var SHELL_FILES = [
  './', 'index.html', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
/* Hosts de bibliotecas/fontes: podem ficar em cache. */
var STATIC_HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      return Promise.all(SHELL_FILES.map(function (u) { return c.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== RUNTIME; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function networkFirst(req, cacheName, fallbackUrl) {
  return new Promise(function (resolve) {
    var done = false;
    function fromCache() {
      return caches.match(req).then(function (r) { return r || (fallbackUrl ? caches.match(fallbackUrl) : null); });
    }
    var timer = setTimeout(function () {
      fromCache().then(function (r) { if (r && !done) { done = true; resolve(r); } });
    }, 4000);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) { var copy = res.clone(); caches.open(cacheName).then(function (c) { c.put(req, copy); }); }
      if (!done) { done = true; resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      fromCache().then(function (r) { if (!done) { done = true; resolve(r || Response.error()); } });
    });
  });
}

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { e.respondWith(networkFirst(req, SHELL, 'index.html')); return; }
    e.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }
  /* Dados (Firebase/Firestore/Auth) e qualquer outro host: não interceptar. */
  if (STATIC_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(staleWhileRevalidate(req, RUNTIME));
  }
});

/* Notificações do aparelho: ao tocar, abre/foca o app e manda o carro a abrir. */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var car = e.notification.data && e.notification.data.car;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ('focus' in c) {
          return c.focus().then(function () { if (car) c.postMessage({ jrcaCar: car }); });
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
