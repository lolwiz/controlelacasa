// Ao atualizar arquivos no GitHub, aumente o número da versão abaixo.
const VERSAO = 'controle-financeiro-v2';
const ARQUIVOS = ['./', './index.html', './app.js', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './logo.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // API vai direto para a rede
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
      const copia = res.clone();
      caches.open(VERSAO).then(c => c.put(req, copia));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
