// Ferramenta de Gestão O&M — service worker (notificações e modo sem internet)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Ferramenta de Gestão O&M', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'badge-96.png',  // ícone da barra de status (Android): silhueta branca com fundo transparente
    tag: d.tag,
    renotify: !!d.tag,
    data: { url: d.url || 'agenda.html' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || 'agenda.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) {
      if (w.url.indexOf('agenda.html') >= 0 && 'focus' in w) { if ('navigate' in w) w.navigate(url); return w.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});

// ===== 27/11: modo sem internet =====
// Guarda a ferramenta (agenda.html), os ícones e as bibliotecas (cdnjs, jsdelivr, unpkg, fontes) no aparelho.
// agenda.html: busca na internet primeiro (sempre a versão nova) e usa a cópia guardada quando não há internet.
// Bibliotecas: usam a cópia guardada (o endereço tem a versão). O banco (Supabase) nunca passa por aqui:
// quem guarda os dados e a fila de envio é a própria ferramenta.
const CACHE = 'gestao-om-v1';
const BASE = ['agenda.html', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'badge-96.png'];
const LIBS = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(BASE.map(u => c.add(u).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gestao-om-') && k !== CACHE).map(k => caches.delete(k)))));
});
async function guardar(url) {
  try {
    const c = await caches.open(CACHE), u = new URL(url, self.registration.scope);
    if (await c.match(u.href, { ignoreSearch: u.origin === location.origin })) return;
    const r = u.origin === location.origin ? await fetch(u.href) : await fetch(u.href, { mode: 'no-cors' });
    if (r && (r.ok || r.type === 'opaque')) await c.put(u.origin === location.origin ? u.origin + u.pathname : u.href, r);
  } catch (e) {}
}
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.tipo === 'guardar' && Array.isArray(d.urls)) e.waitUntil(Promise.all(d.urls.map(guardar)));
});
function comPrazo(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('prazo')), ms))]); }
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (/supabase\.co$/.test(u.hostname)) return;
  const pagina = req.mode === 'navigate' || (u.origin === location.origin && /\.html$/.test(u.pathname));
  if (pagina) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await comPrazo(fetch(req), 8000);
        if (r && r.ok) c.put(u.origin + u.pathname, r.clone()).catch(() => {});
        return r;
      } catch (x) {
        return (await c.match(u.origin + u.pathname)) || (await c.match(req, { ignoreSearch: true })) ||
          (await c.match(new URL('agenda.html', self.registration.scope).href)) ||
          new Response('<meta charset="utf-8"><p style="font-family:sans-serif;padding:20px">Sem internet e a ferramenta ainda não foi guardada neste aparelho. Abra uma vez com internet.</p>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }
  if (LIBS.test(req.url) || (u.origin === location.origin && /\.(png|webmanifest|js|css|woff2?)$/.test(u.pathname))) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE), chave = u.origin === location.origin ? u.origin + u.pathname : req.url;
      const h = await c.match(chave);
      if (h) return h;
      try {
        const r = await fetch(req);
        if (r && (r.ok || r.type === 'opaque')) c.put(chave, r.clone()).catch(() => {});
        return r;
      } catch (x) { return h || Response.error(); }
    })());
  }
});
