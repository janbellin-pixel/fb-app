// Benachrichtigungen (E34) – nur, wenn das Mitglied sie in der App einschaltet (Mehr › Einstellungen
// oder im Chat). Dann gibt es: Zahlen am Chat und an „Mehr“/News und am App-Symbol (Badging API),
// Markierungen in den Listen, Hinweise in der App und – mit Erlaubnis des Browsers – Mitteilungen des
// Systems, solange die App läuft (auch im Hintergrund, solange der Browser sie lässt). Ohne eigenen
// Server gibt es keine Push-Nachrichten bei geschlossener App; dafür gibt es die App „Google Chat“
// (Direktnachrichten und Ankündigungen neuer News, E33). Ausgeschaltet fragt die App nichts ab.
// Ein/aus und was gelesen ist, merkt sich nur dieses Gerät (localStorage, je Konto).
import { local } from './store.js';
import { toast } from '../ui.js';
import * as auth from '../auth.js';

const prefKey = (email) => `fb.benachrichtigungen.${email}`;
const stateKey = (email) => `fb.gelesen.${email}`;
const CHAT_EVERY = 60_000;
const CHAT_EVERY_HIDDEN = 3 * 60_000;
const NEWS_EVERY = 5 * 60_000;
const SAME = 2000; // Zeitstempel von Google: innerhalb von 2 s gilt als dieselbe Nachricht

/** Links zur App „Google Chat“ (Push-Mitteilungen aufs Handy, auch wenn diese App zu ist) */
export const GOOGLE_CHAT_APP = {
  android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.dynamite',
  ios: 'https://apps.apple.com/app/google-chat/id1163852619',
};

let app = null;
let state = null;
let timer = null;
let busy = false;
let lastNews = 0;
let pending = [];
const unreadChat = new Map(); // Raum → letzte fremde Nachricht
const newNews = new Set();
const checked = new Map(); // Raum → zuletzt geprüftes lastActive (spart Abfragen)
const listeners = new Set();

const ms = (t) => new Date(t || 0).getTime() || 0;

/** Ist a (Zeitstempel) spürbar neuer als b? */
export const isNewer = (a, b) => ms(a) - ms(b) > SAME;

/** Neue News: noch nicht gesehen und nicht von einem selbst */
export const freshNews = (items, seenIds) => items.filter((n) => n?.id && !n.own && !seenIds.has(n.id));

/** Hat das Mitglied die Benachrichtigungen auf diesem Gerät eingeschaltet? */
export const notificationsWanted = () => !!app?.user && !!local.get(prefKey(app.user.email), false);
export const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export const counts = () => (notificationsWanted() ? { chat: unreadChat.size, news: newNews.size } : { chat: 0, news: 0 });
export const isUnreadChat = (id) => notificationsWanted() && unreadChat.has(id);
/** Ist diese News für dieses Gerät neu? (nur bei eingeschalteten Benachrichtigungen) */
export const isNewNews = (item) => notificationsWanted() && !!item && !item.own
  && (newNews.has(item.id) || (!!state?.newsInit && !state.news.includes(item.id)));
/** Zahlen neu zeichnen – nach dem Aufbau einer Seite mit [data-badge]-Elementen */
export const refreshBadges = () => emit();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function save() {
  if (app?.user && state) local.set(stateKey(app.user.email), state);
}

function emit() {
  const c = counts();
  document.querySelectorAll('[data-badge]').forEach((el) => {
    const n = el.dataset.badge === 'chat' ? c.chat : el.dataset.badge === 'news' ? c.news : 0;
    el.textContent = n > 9 ? '9+' : n ? String(n) : '';
    el.classList.toggle('hidden', !n);
    el.setAttribute('aria-label', n ? `${n} neu` : '');
  });
  const total = c.chat + c.news;
  try {
    if (total && navigator.setAppBadge) navigator.setAppBadge(total).catch(() => {});
    else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  } catch { /* nicht unterstützt */ }
  for (const fn of listeners) {
    try { fn(c); } catch (e) { console.warn(e); }
  }
}

/**
 * Benachrichtigungen einschalten – nur nach einem Klick des Mitglieds aufrufen (der Browser fragt nur
 * dann nach seiner Erlaubnis). Gezählt wird ab jetzt: was schon da ist, gilt als gesehen.
 */
export async function enableNotifications() {
  if (!app?.user) return 'unsupported';
  local.set(prefKey(app.user.email), true);
  if (state) {
    state.chatInit = false;
    state.newsInit = false;
    save();
  }
  schedule(300);
  return requestSystemPermission();
}

/** Mitteilungen des Systems erlauben (im Browser) – ebenfalls nur nach einem Klick */
export async function requestSystemPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

export function disableNotifications() {
  if (app?.user) local.set(prefKey(app.user.email), false);
  clearTimeout(timer);
  timer = null;
  unreadChat.clear();
  newNews.clear();
  pending = [];
  emit();
}

/** Unterhaltung gelesen (beim Öffnen und nach eigenen bzw. neu angezeigten Nachrichten) */
export function markChatRead(spaceId, lastActive) {
  if (!state) return;
  const prev = state.chat[spaceId];
  const t = lastActive || new Date().toISOString();
  if (!prev || ms(t) > ms(prev)) state.chat[spaceId] = t;
  checked.delete(spaceId);
  const had = unreadChat.delete(spaceId);
  save();
  if (had) emit();
}

/** News gesehen (Übersicht oder Artikel geöffnet) */
export function markNewsRead(ids) {
  if (!state) return;
  const seen = new Set(state.news);
  let changed = false;
  for (const id of ids) {
    if (!seen.has(id)) { seen.add(id); changed = true; }
    if (newNews.delete(id)) changed = true;
  }
  if (!changed) return;
  state.news = [...seen].slice(-400);
  save();
  emit();
}

/** Neues zum Melden vormerken – jedes nur einmal (auch über Neustarts hinweg) */
function queue(key, title, body, hash) {
  state.notified = state.notified || {};
  if (state.notified[key]) return;
  state.notified[key] = Date.now();
  const keys = Object.keys(state.notified);
  if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete state.notified[k];
  pending.push({ key, title, body, hash });
}

function summary(list) {
  const chats = list.filter((n) => n.key.startsWith('chat:')).length;
  const news = list.length - chats;
  const parts = [chats && `${chats} ${chats === 1 ? 'neue Nachricht' : 'neue Nachrichten'}`, news && `${news} neue News`].filter(Boolean);
  return { title: 'Neues in der Mitglieder-App', body: parts.join(' und '), hash: news ? '#/' : '#/chat', key: 'sammel' };
}

/** Vorgemerktes melden: in der App als Hinweis, im Hintergrund als Mitteilung des Systems (falls erlaubt) */
async function flush() {
  const list = pending;
  pending = [];
  if (!list.length || !notificationsWanted()) return;
  save();
  if (document.visibilityState === 'visible') {
    const show = list.length > 2 ? [summary(list)] : list;
    for (const n of show) toast(n.key === 'sammel' ? n.body : `${n.title}: ${n.body}`, { type: 'info', action: 'Öffnen', onAction: () => app.navigate(n.hash) });
    return;
  }
  if (notificationPermission() !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    for (const n of list.length > 3 ? [summary(list)] : list) {
      await reg?.showNotification(n.title, {
        body: n.body.length > 140 ? `${n.body.slice(0, 139)}…` : n.body,
        tag: n.key,
        icon: 'assets/icons/icon-192.png',
        data: { url: `${location.origin}${location.pathname}${n.hash}` },
      });
    }
  } catch (e) {
    console.warn('Mitteilung nicht gezeigt', e);
  }
}

const roomHash = (s) => `#/chat/${encodeURIComponent(String(s.id).replace('spaces/', ''))}?name=${encodeURIComponent(s.name || '')}`;

async function checkChat() {
  const b = app.backend;
  if (!b.chatStatus?.().available || !b.latestMessage) return;
  const spaces = await b.listSpaces();
  const first = !state.chatInit;
  let changed = false;
  for (const s of spaces) {
    if (!s.lastActive) continue;
    if (first) { state.chat[s.id] = s.lastActive; continue; }
    if (!isNewer(s.lastActive, state.chat[s.id])) {
      if (unreadChat.delete(s.id)) changed = true;
      continue;
    }
    // offene Unterhaltung: dort wird ohnehin gelesen
    if (location.hash.startsWith(roomHash(s).split('?')[0])) continue;
    if (checked.get(s.id) === s.lastActive) continue;
    checked.set(s.id, s.lastActive);
    // Wer hat zuletzt geschrieben? Eigene Nachrichten (auch von anderen Geräten) zählen nicht.
    const last = await b.latestMessage(s.id).catch(() => null);
    if (!last || last.mine) {
      state.chat[s.id] = s.lastActive;
      if (unreadChat.delete(s.id)) changed = true;
      continue;
    }
    unreadChat.set(s.id, last);
    changed = true;
    const dm = s.type === 'DIRECT_MESSAGE';
    queue(`chat:${last.id}`, dm ? last.sender.name : s.name, dm ? last.text : `${last.sender.name}: ${last.text}`, roomHash(s));
  }
  if (first) state.chatInit = true;
  save();
  if (changed || first) emit();
}

async function checkNews() {
  if (state.newsInit && Date.now() - lastNews < NEWS_EVERY) return;
  lastNews = Date.now();
  const items = await app.backend.listNews();
  if (!state.newsInit) {
    state.news = items.map((n) => n.id).slice(-400);
    state.newsInit = true;
    newNews.clear();
    save();
    emit();
    return;
  }
  const fresh = freshNews(items, new Set(state.news));
  const before = newNews.size;
  newNews.clear();
  for (const n of fresh) newNews.add(n.id);
  if (newNews.size !== before || fresh.length) emit();
  for (const n of fresh) queue(`news:${n.id}`, 'Neue News', n.title, `#/news/${encodeURIComponent(n.id)}`);
}

async function tick() {
  if (busy || !app?.user || !app.backend || !state || !notificationsWanted()) return;
  // nicht während der Datenschutz-Abfrage, offline oder mit (fast) abgelaufener Anmeldung –
  // sonst würde mitten im Hintergrund „Sitzung abgelaufen“ erscheinen
  if (app.consentPending || !navigator.onLine) return;
  if (app.mode === 'google' && auth.tokenExpiresIn() < 90_000) return;
  busy = true;
  try {
    await checkChat().catch((e) => console.warn('Benachrichtigungen (Chat)', e));
    await checkNews().catch((e) => console.warn('Benachrichtigungen (News)', e));
    await flush();
  } finally {
    busy = false;
  }
}

function schedule(delay) {
  clearTimeout(timer);
  if (!notificationsWanted()) { timer = null; return; }
  timer = setTimeout(async () => {
    await tick();
    schedule(document.visibilityState === 'visible' ? CHAT_EVERY : CHAT_EVERY_HIDDEN);
  }, delay);
}

/** Beim Start der App (angemeldet bzw. Demo) einmal aufrufen – prüft nur, wenn eingeschaltet */
export function startHinweise(theApp) {
  app = theApp;
  if (!app.user) return;
  const saved = local.get(stateKey(app.user.email), null);
  state = { chat: {}, news: [], chatInit: false, newsInit: false, notified: {}, ...(saved || {}) };
  if (!Array.isArray(state.news)) state.news = [];
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(1500);
  });
  schedule(3000);
  emit();
}

/** Sofort prüfen (für Tests) */
export function checkNow() {
  lastNews = 0;
  return tick().then(() => counts());
}
