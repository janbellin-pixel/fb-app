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

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

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
