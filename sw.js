'use strict';

const CACHE = 'investcalc-v17';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './model.js',
  './seed.js',
  './pdfgen.js',
  './app.js',
  './investors.js',
  './reports.js',
  './investors-ui.js',
  './cloud.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro com fallback ao cache: o app funciona offline,
// mas pega atualizações assim que houver conexão.
self.addEventListener('fetch', (ev) => {
  if (ev.request.method !== 'GET') return;
  // só os arquivos do app passam pelo cache — a nuvem (outra origem) vai direto à rede
  if (new URL(ev.request.url).origin !== self.location.origin) return;
  ev.respondWith(
    fetch(ev.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(ev.request, copy));
        return resp;
      })
      .catch(() => caches.match(ev.request, { ignoreSearch: true }))
  );
});
