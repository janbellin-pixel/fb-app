// Start der App: Anmeldung prüfen, Modus wählen (Google oder Demo), Oberfläche aufbauen
import { config, isGoogleConfigured } from './config.js';
import * as auth from './auth.js';
import { html, setHtml, icon, avatar, toast, openModal, $, $$, isStandalone } from './ui.js';
import { startRouter, navigate, refresh, lastRenderTime } from './router.js';
import { cachedLoad, local, kv } from './lib/store.js';
import { firstName } from './lib/text.js';

export const APP_VERSION = '1.0.0';

const NAV = [
  { id: 'start', path: '', label: 'Start' },
  { id: 'termine', path: 'termine', label: 'Termine' },
  { id: 'chat', path: 'chat', label: 'Chat' },
  { id: 'mitglieder', path: 'mitglieder', label: 'Mitglieder' },
  { id: 'adressen', path: 'adressen', label: 'Adressen' },
  { id: 'zeitung', path: 'zeitung', label: 'Zeitung' },
  { id: 'galerie', path: 'galerie', label: 'Galerie' },
  { id: 'news', path: 'news', label: 'News' },
  { id: 'forum', path: 'forum', label: 'Forum' },
];

const TABS = [
  { id: 'start', path: '', label: 'Start', icon: 'home' },
  { id: 'termine', path: 'termine', label: 'Termine', icon: 'calendar' },
  { id: 'chat', path: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'mitglieder', path: 'mitglieder', label: 'Mitglieder', icon: 'users' },
  { id: 'mehr', path: 'mehr', label: 'Mehr', icon: 'grid' },
];

const app = {
  config,
  version: APP_VERSION,
  backend: null,
  user: null,
  mode: null,
  loginError: null,
  installPrompt: null,
  navigate,
  refresh,

  /** Daten mit Zwischenspeicher laden (Demo: direkt) */
  load(key, fetcher, onData, opts = {}) {
    if (this.mode !== 'google') {
      return fetcher().then((v) => { onData(v, { cached: false }); return v; });
    }
    return cachedLoad(`${this.user.email}:${key}`, fetcher, onData, opts);
  },

  async clearCache() {
    await kv.clear();
    try { await caches.delete('fb-zeitung'); } catch { /* egal */ }
  },

  isAdmin() {
    return !!this.backend?.isAdmin();
  },

  relogin(opts = {}) {
    if (this.mode !== 'google') return location.reload();
    auth.login({ returnTo: location.hash || '#/', ...opts });
  },

  startDemo() {
    local.set('fb.mode', 'demo');
    location.hash = '#/';
    location.reload();
  },

  endDemo() {
    local.del('fb.mode');
    location.hash = '#/';
    location.reload();
  },

  logout({ revoke = false } = {}) {
    auth.logout({ revoke });
    local.del('fb.mode');
    kv.clear().finally(() => {
      location.hash = '#/';
      location.reload();
    });
  },

  /** Datenschutz: muss das Mitglied (erstmals oder nach neuer Fassung) über die Einwilligungen entscheiden? */
  consentPending: false,

  /** Vor jedem Seitenwechsel: Datenschutz-Abfrage beim ersten Öffnen, Google-Sitzung rechtzeitig still erneuern */
  beforeRoute(match) {
    if (this.consentPending && this.user && !match.route.public) {
      const weiter = location.hash && !location.hash.startsWith('#/datenschutz') ? location.hash : '#/';
      navigate(`#/datenschutz?erstmals=1&weiter=${encodeURIComponent(weiter)}`, { replace: true });
      return false;
    }
    if (this.mode !== 'google' || !navigator.onLine) return true;
    const left = auth.tokenExpiresIn();
    if (left > 4 * 60_000) return true;
    if (!auth.recentSilentAttempt()) {
      auth.login({ silent: true, returnTo: `#/${match.path}${location.hash.includes('?') ? `?${location.hash.split('?')[1]}` : ''}` });
      return false;
    }
    return true;
  },

  onRoute(match) {
    document.body.classList.toggle('logged-out', !this.user);
    // während der Datenschutz-Abfrage keine Navigation zeigen (sie führt ohnehin zurück)
    document.body.classList.toggle('consent-gate', !!(this.consentPending && this.user && match.route.path === 'datenschutz'));
    $$('.topnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === match.route.nav && !!this.user));
    $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === match.route.tab));
  },
};
window.fbApp = app; // zur Fehlersuche in der Konsole

/* ------------------------------------------------------------------ Start */

async function enterGoogle(fresh) {
  let user = auth.getUser();
  if (!user || fresh) {
    const { userinfo } = await import('./google/people.js');
    const info = await userinfo();
    user = {
      email: String(info.email || '').toLowerCase(),
      name: info.name || info.email,
      photo: info.picture || '',
      hd: info.hd || '',
      firstName: info.given_name || firstName(info.name),
    };
    auth.setUser(user);
  }
  if (config.workspaceDomain && user.hd !== config.workspaceDomain) {
    app.loginError = {
      title: 'Falsches Konto',
      text: `Du bist als ${user.email} angemeldet. Bitte melde dich mit deinem Verbindungskonto (@${config.workspaceDomain}) an.`,
      selectAccount: true,
    };
    auth.logout();
    return false;
  }
  const { GoogleBackend } = await import('./backend/google-backend.js');
  app.backend = new GoogleBackend(user);
  app.user = user;
  app.mode = 'google';
  local.set('fb.mode', 'google');
  return true;
}

async function enterDemo() {
  const { DemoBackend } = await import('./backend/demo-backend.js');
  app.backend = new DemoBackend();
  app.user = app.backend.me;
  app.mode = 'demo';
}

function describeOAuthError(code) {
  const texts = {
    access_denied: 'Die Anmeldung wurde abgebrochen oder nicht erlaubt.',
    interaction_required: 'Bitte melde dich erneut an.',
    login_required: 'Bitte melde dich an.',
    consent_required: 'Bitte bestätige die Berechtigungen der App.',
    state_mismatch: 'Die Anmeldung konnte nicht zugeordnet werden. Bitte versuche es noch einmal.',
    unauthorized_client: 'Die App ist bei Google nicht richtig eingerichtet (Client-ID oder Weiterleitungsadresse prüfen).',
    invalid_request: 'Die Anmeldeanfrage war ungültig. Bitte prüfe die Einrichtung (Weiterleitungsadresse).',
  };
  return texts[code] || `Anmeldung fehlgeschlagen (${code}).`;
}

async function boot() {
  registerServiceWorker();
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    app.installPrompt = e;
  });
  window.addEventListener('appinstalled', () => { app.installPrompt = null; toast('App installiert 🎉'); });

  const redirect = auth.handleRedirect();
  const mode = local.get('fb.mode');

  if (redirect?.error && !redirect.silent) {
    app.loginError = { title: 'Anmeldung nicht möglich', text: describeOAuthError(redirect.error) };
  }

  try {
    if (mode === 'demo' && !redirect?.ok) {
      await enterDemo();
    } else if (isGoogleConfigured() && auth.getAccessToken()) {
      await enterGoogle(!!redirect?.ok);
    } else if (isGoogleConfigured() && auth.getUser() && mode === 'google' && !navigator.onLine) {
      // Offline: mit dem zuletzt geladenen Stand starten
      await enterGoogle(false);
    } else if (isGoogleConfigured() && auth.getUser() && !redirect?.error && !auth.recentSilentAttempt()) {
      // Abgelaufene Sitzung still erneuern (dauert nur einen Augenblick)
      auth.login({ silent: true, returnTo: location.hash || '#/' });
      return;
    }
  } catch (e) {
    console.error(e);
    app.loginError = { title: 'Anmeldung nicht möglich', text: e.message || String(e) };
  }

  if (app.user) await initConsent();

  auth.setUnauthorizedHandler(onUnauthorized);
  renderShell();
  startRouter(app);
  watchConnection();
  watchVisibility();
  // Verantwortliche: Einwilligungs-Sammeltabelle im Hintergrund abgleichen
  if (app.user && app.backend?.autoSyncConsents) {
    setTimeout(() => app.backend.autoSyncConsents().catch((e) => console.warn('Einwilligungsliste nicht abgeglichen', e)), 4000);
  }
}

/**
 * Datenschutz beim Start: Hat das Mitglied für die aktuelle Fassung entschieden?
 * Zuerst der Stand auf dem Gerät (schnell, offline), dann Google (maßgeblich).
 */
async function initConsent() {
  const ds = await import('./lib/datenschutz.js');
  const email = app.user.email;
  const local = ds.localConsent(email);
  // offline getroffene Entscheidung nachträglich übertragen
  if (local?.ausstehend && navigator.onLine) {
    try {
      const rec = await app.backend.saveMyConsent(local);
      ds.setLocalConsent(email, rec);
    } catch (e) { console.warn('Einwilligung noch nicht übertragen', e); }
  }
  const cached = ds.localConsent(email);
  if (cached && !ds.needsDecision(cached)) {
    app.consentPending = false;
    if (cached.ausstehend) return;
    // im Hintergrund mit Google abgleichen (z. B. auf einem anderen Gerät geändert oder Datei gelöscht)
    app.backend.getMyConsent().then((rec) => {
      if (rec) ds.setLocalConsent(email, rec);
      if (ds.needsDecision(rec)) {
        app.consentPending = true;
        if (!location.hash.startsWith('#/datenschutz')) refresh();
      }
    }).catch(() => {});
    return;
  }
  try {
    const rec = await app.backend.getMyConsent();
    if (rec) ds.setLocalConsent(email, rec);
    app.consentPending = ds.needsDecision(rec);
  } catch (e) {
    // offline o. Ä.: nicht blockieren – beim nächsten Start wird erneut gefragt
    console.warn('Einwilligung nicht geladen', e);
    app.consentPending = false;
  }
}

let reloginOpen = false;
function onUnauthorized() {
  if (reloginOpen || app.mode !== 'google' || !navigator.onLine) return;
  reloginOpen = true;
  openModal({
    title: 'Sitzung abgelaufen',
    body: 'Aus Sicherheitsgründen gilt eine Anmeldung bei Google eine Stunde. Mit einem Klick geht es weiter – meist ohne erneute Passworteingabe.',
    actions: [
      { label: 'Später', kind: 'ghost', value: null },
      { label: 'Weiter', kind: 'primary', onClick: () => { auth.login({ silent: !auth.recentSilentAttempt(), returnTo: location.hash || '#/' }); } },
    ],
  }).result.then(() => { reloginOpen = false; });
}

/* ------------------------------------------------------------------ Oberfläche */

function renderShell() {
  const root = document.getElementById('app');
  const loggedIn = !!app.user;
  document.body.classList.toggle('logged-out', !loggedIn);
  document.body.classList.toggle('demo', app.mode === 'demo');
  setHtml(root, html`
    <a class="sr-only" href="#main">Zum Inhalt springen</a>
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="#/" aria-label="${config.appName} – Startseite">
          <img src="assets/wappen-klein.webp" alt="" width="47" height="44">
          <span class="brand-name">${config.appName}</span>
        </a>
        ${loggedIn ? html`
          <nav class="topnav" aria-label="Hauptnavigation">
            ${NAV.map((n) => html`<a href="#/${n.path}" data-nav="${n.id}">${n.label}</a>`)}
          </nav>
          <a class="topbar-user" href="#/mehr" aria-label="Mein Bereich und Einstellungen">${avatar(app.user, 36)}</a>` : ''}
      </div>
    </header>
    ${app.mode === 'demo' ? html`<div class="demo-bar">Demo-Modus · erfundene Beispieldaten <a href="#" data-action="end-demo">Beenden</a></div>` : ''}
    <div class="offline-bar hidden" id="offline-bar">${icon('wifiOff', 'icon-sm')} Offline – du siehst den zuletzt geladenen Stand.</div>
    <main class="main" id="main" tabindex="-1"></main>
    <footer class="footer">
      <p class="footer-motto">Auf ewig ungeteilt.</p>
      <div class="footer-skyline" aria-hidden="true"></div>
      <div class="footer-ground">${config.appName} · Mitglieder-App ${APP_VERSION} · <a href="#/datenschutz">Datenschutz</a>${loggedIn ? html` · <a href="#/einstellungen">Einstellungen</a>` : ''}</div>
    </footer>
    ${loggedIn ? html`<nav class="tabbar" aria-label="Navigation">
      ${TABS.map((t) => html`<a href="#/${t.path}" data-tab="${t.id}">${icon(t.icon)}<span>${t.label}</span></a>`)}
    </nav>` : ''}
  `);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=end-demo]')) {
      e.preventDefault();
      app.endDemo();
    }
  });
}

function watchConnection() {
  const bar = document.getElementById('offline-bar');
  const update = () => bar?.classList.toggle('hidden', navigator.onLine);
  window.addEventListener('online', () => { update(); toast('Wieder online'); });
  window.addEventListener('offline', update);
  update();
}

function watchVisibility() {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    // Nach längerer Pause aktuelle Seite neu laden (holt frische Daten)
    if (app.user && hiddenAt && Date.now() - hiddenAt > 5 * 60_000 && Date.now() - lastRenderTime() > 60_000) {
      const reader = document.querySelector('.reader');
      if (!reader) refresh();
    }
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  if (new URLSearchParams(location.search).has('nosw')) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Neue Version der App verfügbar', { type: 'info', action: 'Neu laden', onAction: () => location.reload(), timeout: 15000 });
        }
      });
    });
    // regelmäßig nach Updates schauen
    setInterval(() => reg.update().catch(() => {}), 60 * 60_000);
  }).catch((e) => console.warn('Service Worker nicht registriert', e));
}

export function isInstalled() {
  return isStandalone();
}

export default app;

boot();
