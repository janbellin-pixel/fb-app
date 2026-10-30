// Einfacher Hash-Router: #/pfad/:param?query
import { setHtml, errorBox, $ } from './ui.js';

const v = (file, exp = 'default') => () => import(`./views/${file}.js`).then((m) => m[exp]);

// bereich: lässt sich je Gruppe ausblenden (config.gruppen.ohne, js/lib/gruppen.js, E41)
export const ROUTES = [
  { path: '', load: v('home'), tab: 'start', nav: 'start', title: 'Start' },
  { path: 'termine', load: v('termine'), tab: 'termine', nav: 'termine', title: 'Termine', bereich: 'termine' },
  { path: 'termin/:id', load: v('termin'), tab: 'termine', nav: 'termine', title: 'Termin', bereich: 'termine' },
  { path: 'mitglieder', load: v('mitglieder'), tab: 'mitglieder', nav: 'mitglieder', title: 'Mitglieder', bereich: 'mitglieder' },
  { path: 'mitglied/:email', load: v('mitglieder', 'detail'), tab: 'mitglieder', nav: 'mitglieder', title: 'Mitglied', bereich: 'mitglieder' },
  { path: 'profil', load: v('profil'), tab: 'mehr', nav: 'mitglieder', title: 'Mein Profil' },
  { path: 'chat', load: v('chat'), tab: 'chat', nav: 'chat', title: 'Chat', bereich: 'chat' },
  { path: 'chat/:space', load: v('chat', 'room'), tab: 'chat', nav: 'chat', title: 'Chat', bereich: 'chat' },
  { path: 'chat-neu', load: v('chat', 'newChat'), tab: 'chat', nav: 'chat', title: 'Neue Nachricht', bereich: 'chat' },
  { path: 'adressen', load: v('adressen'), tab: 'mehr', nav: 'adressen', title: 'Adressverzeichnis', bereich: 'adressen' },
  { path: 'zeitung', load: v('zeitung'), tab: 'mehr', nav: 'zeitung', title: 'Bundesbote', bereich: 'zeitung' },
  { path: 'zeitung/:id', load: v('zeitung', 'reader'), tab: 'mehr', nav: 'zeitung', title: 'Bundesbote', bereich: 'zeitung' },
  { path: 'ds-zeitung', load: v('zeitung', 'ds'), tab: 'mehr', nav: '', title: 'DS-Zeitung', bereich: 'dsZeitung' },
  { path: 'ds-zeitung/:id', load: v('zeitung', 'dsReader'), tab: 'mehr', nav: '', title: 'DS-Zeitung', bereich: 'dsZeitung' },
  { path: 'lieder', load: v('lieder'), tab: 'mehr', nav: '', title: 'Liedermappe', bereich: 'lieder' },
  { path: 'lieder/:id', load: v('lieder', 'reader'), tab: 'mehr', nav: '', title: 'Liedermappe', bereich: 'lieder' },
  { path: 'galerie', load: v('galerie'), tab: 'mehr', nav: 'galerie', title: 'Galerie', bereich: 'galerie' },
  { path: 'galerie/:album', load: v('galerie', 'album'), tab: 'mehr', nav: 'galerie', title: 'Galerie', bereich: 'galerie' },
  { path: 'news', load: v('news'), tab: 'mehr', nav: 'news', title: 'News', bereich: 'news' },
  { path: 'news/:id', load: v('news', 'detail'), tab: 'mehr', nav: 'news', title: 'News', bereich: 'news' },
  { path: 'news-neu', load: v('news', 'editor'), tab: 'mehr', nav: 'news', title: 'News schreiben', bereich: 'news' },
  { path: 'news-bearbeiten/:id', load: v('news', 'editor'), tab: 'mehr', nav: 'news', title: 'News bearbeiten', bereich: 'news' },
  { path: 'forum', load: v('forum'), tab: 'mehr', nav: 'forum', title: 'Forum', bereich: 'forum' },
  { path: 'forum-neu', load: v('forum', 'newThread'), tab: 'mehr', nav: 'forum', title: 'Neues Thema', bereich: 'forum' },
  { path: 'forum/:id', load: v('forum', 'thread'), tab: 'mehr', nav: 'forum', title: 'Forum', bereich: 'forum' },
  { path: 'anhang/:id', load: v('anhang'), tab: 'mehr', nav: '', title: 'Anhang' },
  { path: 'mehr', load: v('mehr'), tab: 'mehr', nav: '', title: 'Mehr' },
  { path: 'einstellungen', load: v('mehr', 'settings'), tab: 'mehr', nav: '', title: 'Einstellungen' },
  { path: 'datenschutz', load: v('datenschutz'), tab: 'mehr', nav: '', title: 'Datenschutz', public: true },
  { path: 'datenschutz/uebersicht', load: v('datenschutz', 'uebersicht'), tab: 'mehr', nav: '', title: 'Einwilligungen' },
  { path: 'papierpost', load: v('papierpost'), tab: 'mehr', nav: '', title: 'Papierpost' },
  { path: 'installieren', load: v('mehr', 'install'), tab: 'mehr', nav: '', title: 'App installieren', public: true },
  { path: 'einrichtung', load: v('einrichtung'), tab: 'mehr', nav: '', title: 'Einrichtung', public: true },
];

export function parseHash(hash = location.hash) {
  const h = String(hash || '').replace(/^#\/?/, '');
  const [pathPart, qs = ''] = h.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const route of ROUTES) {
    const rsegs = route.path.split('/').filter(Boolean);
    if (rsegs.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < rsegs.length; i++) {
      if (rsegs[i].startsWith(':')) params[rsegs[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (rsegs[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { route, params, query, path: pathPart };
  }
  return { route: null, params: {}, query, path: pathPart };
}

let app = null;
let dispose = null;
let renderId = 0;
let navCount = 0;
let lastRender = 0;

export function navigate(to, { replace = false } = {}) {
  const target = to.startsWith('#') ? to : `#/${to.replace(/^\/+/, '')}`;
  if (replace) {
    history.replaceState(null, '', location.pathname + location.search + target);
    render();
  } else if (location.hash === target) {
    render();
  } else {
    location.hash = target;
  }
}

export function refresh() {
  render({ keepScroll: true });
}

export function lastRenderTime() {
  return lastRender;
}

export function startRouter(theApp) {
  app = theApp;
  window.addEventListener('hashchange', () => { navCount++; render(); });
  document.addEventListener('click', (e) => {
    const back = e.target.closest?.('[data-back]');
    if (back && navCount > 0) {
      e.preventDefault();
      history.back();
    }
  });
  render();
}

async function render({ keepScroll = false } = {}) {
  const match = parseHash();
  if (!match.route) {
    navigate('#/', { replace: true });
    return;
  }
  if (app.beforeRoute && (await app.beforeRoute(match)) === false) return;
  const token = ++renderId;
  lastRender = Date.now();
  try { dispose?.(); } catch (e) { console.warn(e); }
  dispose = null;
  const main = $('#main');
  if (!main) return;
  const el = document.createElement('div');
  el.className = 'view';
  const scrollY = window.scrollY;
  main.replaceChildren(el);
  app.onRoute?.(match);
  document.title = `${match.route.title} · ${app.config.appName}`;
  if (keepScroll) requestAnimationFrame(() => window.scrollTo(0, scrollY));
  else window.scrollTo(0, 0);
  const ctx = {
    el,
    params: match.params,
    query: match.query,
    route: match.route,
    app,
    alive: () => token === renderId,
  };
  if (!app.user && !match.route.public) {
    const login = await import('./views/login.js');
    if (token === renderId) dispose = (await login.default(ctx)) || null;
    return;
  }
  try {
    const view = await match.route.load();
    const result = await view(ctx);
    if (token === renderId) dispose = typeof result === 'function' ? result : null;
    else if (typeof result === 'function') result();
  } catch (err) {
    console.error(err);
    if (token !== renderId) return;
    setHtml(el, errorBox(err));
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-action=retry]')) refresh();
      if (e.target.closest('[data-action=relogin]')) app.relogin();
    });
  }
}
