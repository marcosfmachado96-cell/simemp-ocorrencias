// Service worker: deixa o app disponível sem sinal (app shell + malha + bibliotecas)
const CACHE = 'simemp-v1.4.1';
const ARQUIVOS = [
  './', './index.html', './painel.html', './manifest.webmanifest',
  './css/app.css', './css/painel.css',
  './js/config.js', './js/icons.js', './js/geo.js', './js/store.js', './js/remote.js', './js/fotos.js', './js/seed.js', './js/app.js', './js/painel.js', './js/relatorio.js',
  './data/malha_leste.geojson',
  './icons/icon-192.png', './icons/icon-512.png', './icons/logo-64.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ARQUIVOS.map(a => c.add(a)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // tiles de mapa: rede, sem cache (muito volume)
  if (url.hostname.includes('tile.openstreetmap') || url.hostname.includes('cartocdn') || url.hostname.endsWith('supabase.co')) return;
  // demais: rede primeiro (pega atualizações); sem sinal, usa o cache
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && (url.origin === location.origin || url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com'))) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
