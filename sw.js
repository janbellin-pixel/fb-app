// Service Worker: macht die App installierbar und offline nutzbar.
// Die Version wird beim Veröffentlichen über GitHub Actions automatisch ersetzt.
const VERSION = 'fb-app-__BUILD__';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './config.js',
  './css/app.css',
  './js/app.js',
  './js/auth.js',
  './js/boot.js',
  './js/config.js',
  './js/html.js',
  './js/icons.js',
  './js/router.js',
  './js/ui.js',
  './js/backend/common.js',
  './js/backend/demo-backend.js',
  './js/backend/demo-data.js',
  './js/backend/google-backend.js',
  './js/google/calendar.js',
  './js/google/chat.js',
  './js/google/client.js',
  './js/google/drive.js',
  './js/google/guard.js',
  './js/google/people.js',
  './js/google/sheets.js',
  './js/lib/adressabgleich.js',
  './js/lib/darstellung.js',
  './js/lib/datenschutz.js',
  './js/lib/dates.js',
  './js/lib/einladung.js',
  './js/lib/einwilligungsliste.js',
  './js/lib/export.js',
  './js/lib/gruppen.js',
  './js/lib/hinweise.js',
  './js/lib/konfiguration.js',
  './js/lib/push.js',
  './js/lib/schrift.js',
  './js/lib/setup.js',
  './js/lib/store.js',
  './js/lib/tastatur.js',
  './js/lib/text.js',
  './js/lib/vorlesen.js',
  './js/views/adressen.js',
  './js/views/anhang.js',
  './js/views/chat.js',
  './js/views/datenschutz.js',
  './js/views/einrichtung.js',
  './js/views/forum.js',
  './js/views/galerie.js',
  './js/views/home.js',
  './js/views/lieder.js',
  './js/views/login.js',
  './js/views/mehr.js',
  './js/views/mitglieder.js',
  './js/views/news.js',
  './js/views/papierpost.js',
  './js/views/parts.js',
  './js/views/profil.js',
  './js/views/reader.js',
  './js/views/termin.js',
  './js/views/termine.js',
  './js/views/zeitung.js',
  './assets/wappen-klein.webp',
  './assets/wappen-voll.webp',
  './assets/wappen.webp',
  './assets/skyline-1000.png',
  './assets/skyline.png',
  './assets/wappen-klein.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
  './assets/icons/favicon-64.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
  './assets/fonts/raleway-latin-ext-wght-normal.woff2',
  './assets/fonts/raleway-latin-wght-italic.woff2',
  './assets/fonts/raleway-latin-wght-normal.woff2',
  './assets/fonts/unifrakturmaguntia-latin-400-normal.woff2',
  './vendor/page-flip/page-flip.browser.js',
  './vendor/qrcode/qrcode.js',
];

const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  // neue Version sofort aktivieren – unbedenklich, weil ohnehin zuerst das Netz gefragt wird
  self.skipWaiting();
  event.waitUntil(
    caches.open(VERSION).then((cache) => Promise.all(CORE.map((url) => cache.add(url).catch(() => null)))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('fb-app-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Anmelde-Token für Videos (E62): kommt per Nachricht aus der App, liegt nur im Arbeitsspeicher
let videoToken = null;
let tokenWaiters = [];

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data?.type === 'token') {
    videoToken = typeof event.data.token === 'string' && event.data.token ? event.data.token : null;
    tokenWaiters.splice(0).forEach((resolve) => resolve(videoToken));
  }
});

/** Token aus dem Speicher, sonst bei den offenen Fenstern der App nachfragen (höchstens 3 s warten) */
async function askToken() {
  if (videoToken) return videoToken;
  const wins = await self.clients.matchAll({ type: 'window' });
  if (!wins.length) return null;
  const antwort = new Promise((resolve) => {
    tokenWaiters.push(resolve);
    setTimeout(() => resolve(null), 3000);
  });
  wins.forEach((w) => w.postMessage({ type: 'tokenRequest' }));
  return antwort;
}

/**
 * Video aus Google Drive durchreichen (E62): „_video/<id>?size=…“ → Drive-API mit Anmeldung. Der Bereich (Range),
 * den der Player anfordert, wird weitergegeben, so dass auch große Videos sofort anlaufen und vorgespult werden
 * können. Die Antwort wird gestreamt, nichts wird zwischengespeichert. Drive gibt den Bereich in Content-Range
 * nicht immer frei (CORS) – dann wird er aus der Anfrage und der Größe aus der Adresse nachgebildet.
 */
async function proxyVideo(req, id, size) {
  let token = await askToken();
  if (!token) return new Response('Nicht angemeldet', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`;
  const range = req.headers.get('range') || '';
  const laden = (t) => fetch(url, { headers: { Authorization: `Bearer ${t}`, ...(range ? { Range: range } : {}) } });
  let res = await laden(token);
  if (res.status === 401) {
    videoToken = null;
    token = await askToken();
    if (token) res = await laden(token);
  }
  if (!res.ok) return new Response(`Video nicht geladen (${res.status})`, { status: res.status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const headers = new Headers();
  for (const h of ['content-type', 'content-length', 'content-range', 'last-modified', 'etag']) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'no-store');
  if (!headers.has('content-type')) headers.set('content-type', 'video/mp4');
  let status = res.status;
  const m = range.match(/^bytes=(\d+)-(\d*)$/);
  if (m && status === 200 && res.headers.get('content-length') && size && Number(res.headers.get('content-length')) < size) {
    // Drive hat nur den Bereich geliefert, aber 200 gemeldet (oder Content-Range ist nicht lesbar)
    status = 206;
  }
  if (status === 206 && !headers.has('content-range') && m) {
    const von = Number(m[1]);
    const laenge = Number(res.headers.get('content-length')) || 0;
    const bis = m[2] ? Number(m[2]) : (laenge ? von + laenge - 1 : size - 1);
    headers.set('content-range', `bytes ${von}-${bis}/${size || '*'}`);
  }
  return new Response(res.body, { status, statusText: res.statusText, headers });
}

// Push-Mitteilung (E50, verschickt von apps-script/Push.gs): Titel, Text und Ziel in der App. Jede Push-Nachricht
// muss sichtbar werden (sonst entziehen die Browser die Erlaubnis) – zur Not mit einem allgemeinen Text.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = {}; }
  const text = (v, n) => String(v || '').slice(0, n);
  const hash = typeof d.url === 'string' && d.url.startsWith('#/') ? d.url : '#/';
  event.waitUntil(self.registration.showNotification(text(d.title, 120) || 'Mitglieder-App', {
    body: text(d.body, 300) || 'Es gibt Neues in der App.',
    tag: text(d.tag, 120) || undefined,
    // Chat-Hinweise (E51) ersetzen die vorige Mitteilung gleicher Art, sollen aber wieder auffallen
    renotify: d.renotify === true && !!text(d.tag, 120),
    icon: 'assets/icons/icon-192.png',
    data: { url: new URL(hash, self.registration.scope).href },
  }));
});

// Mitteilung angetippt (E34, E50): offenes Fenster der App nach vorn holen und zur Unterhaltung bzw. News wechseln
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  let target = new URL(scope);
  try {
    const u = new URL(event.notification.data?.url || scope, scope);
    if (u.href.startsWith(scope)) target = u;
  } catch { /* ungültig – Startseite */ }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(scope));
    if (win) {
      await win.focus();
      win.postMessage({ type: 'navigate', hash: target.hash || '#/' });
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

// App-Code (Seiten, Skripte, Stile, config.js) immer beim Server nachfragen: GitHub Pages erlaubt
// Browsern sonst, eine Datei 10 Minuten lang ungeprüft weiterzuverwenden – Updates kämen verspätet an.
// Ist nichts geändert, antwortet der Server kurz mit „304“. Bilder, Schriften und vendor/ dürfen im
// Browser-Zwischenspeicher bleiben.
function freshFetch(req, url) {
  const code = req.mode === 'navigate' || (/\.(js|mjs|css|html|webmanifest)$/.test(url.pathname) && !url.pathname.includes('/vendor/'));
  if (!code) return fetch(req);
  if (req.mode === 'navigate') return fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' });
  return fetch(new Request(req, { cache: 'no-cache' }));
}

// Netzwerk zuerst (immer aktuell), bei Funkloch der zuletzt gespeicherte Stand
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google-Schnittstellen nicht anfassen
  if (url.pathname.includes('/vendor/pdfjs/standard_fonts/')) return;
  const video = url.pathname.match(/\/_video\/([-\w]+)$/);
  if (video) {
    event.respondWith(proxyVideo(req, video[1], Number(url.searchParams.get('size')) || 0));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await (DEV ? fetch(req) : Promise.race([freshFetch(req, url), timeout(4000)]));
      if (res.ok && res.type === 'basic' && !url.pathname.endsWith('.pdf')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html') || await cache.match('./');
        if (shell) return shell;
      }
      // nach Timeout trotzdem auf das Netz warten
      return fetch(req);
    }
  })());
});
