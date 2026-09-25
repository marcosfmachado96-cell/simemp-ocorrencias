// Service worker: deixa o app disponível sem sinal (app shell + malha + bibliotecas)
const CACHE = 'simemp-v1.6.0';
const VERSAO = CACHE.replace('simemp-v', '');
// os arquivos do próprio site levam ?v=<versão> para o navegador nunca misturar versões
const LOCAIS = [
  './', './index.html', './painel.html', './manifest.webmanifest',
  './css/app.css', './css/painel.css',
  './js/config.js', './js/icons.js', './js/geo.js', './js/store.js', './js/remote.js',
  './js/fotos.js', './js/seed.js', './js/app.js', './js/painel.js', './js/relatorio.js',
  './data/malha_leste.geojson',
  './icons/icon-192.png', './icons/icon-512.png', './icons/logo-64.png',
];
const EXTERNOS = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
];

self.addEventListener('install', e => {
  const pedidos = LOCAIS.map(a => new Request(a.endsWith('/') || a.endsWith('.html') || a.endsWith('.webmanifest') ? a : a + '?v=' + VERSAO, { cache: 'reload' }))
    .concat(EXTERNOS.map(u => new Request(u)));
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(pedidos.map(r => fetch(r).then(resp => resp.ok && c.put(r, resp)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'pular-espera') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // tiles de mapa, Supabase e fotos: sempre rede (volume e dados sempre atuais)
  if (url.hostname.includes('tile.openstreetmap') || url.hostname.endsWith('supabase.co')) return;

  const proprio = url.origin === location.origin;
  const guardavel = proprio || url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'cdn.jsdelivr.net'
    || url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com');

  // Arquivos do site: rede primeiro, revalidando com o servidor (nunca usa cópia velha do
  // cache do navegador). Sem sinal, cai para o cache guardado.
  const req = proprio ? new Request(e.request, { cache: 'no-cache' }) : e.request;
  e.respondWith(
    fetch(req)
      .then(r => {
        if (r.ok && guardavel) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        return r;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match(e.request, { ignoreSearch: true })))
  );
});
