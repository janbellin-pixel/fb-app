// Bausteine, die auf mehreren Seiten vorkommen
import { html, icon, avatarStack, avatar, notice, describeError } from '../ui.js';
import { categoryInfo, config } from '../config.js';
import { summarizeAttendees } from '../backend/common.js';
import { toDate, fWeekdayShort, fMonthShort, fEventTime, relTime, fDateShort } from '../lib/dates.js';
import { plainText } from '../lib/text.js';

export const STATUS_LABEL = {
  accepted: 'Zugesagt',
  tentative: 'Vielleicht',
  declined: 'Abgesagt',
  needsAction: 'Noch offen',
};

export function rsvpPill(status) {
  if (status === 'accepted') return html`<span class="pill pill-yes">${icon('check')}Zugesagt</span>`;
  if (status === 'tentative') return html`<span class="pill pill-maybe">${icon('question')}Vielleicht</span>`;
  if (status === 'declined') return html`<span class="pill pill-no">${icon('x')}Abgesagt</span>`;
  if (status === 'needsAction') return html`<span class="pill pill-open">Antwort offen</span>`;
  return '';
}

/** Name aus dem Adressverzeichnis: Nachname, dahinter klein Titel und Vorname („Bellin, Jan“) */
export function adrName(a) {
  if (!a?.nachname) return html`${a?.name || ''}`;
  const rest = [a.titel, a.vorname].filter(Boolean).join(' ');
  return html`${a.nachname}${rest ? html`<span class="vorname">, ${rest}</span>` : ''}`;
}

export function memberMap(members = []) {
  const m = new Map();
  for (const p of members) m.set(p.email, p);
  return m;
}

/** Person für Anzeige: Profil (Foto, Name) bevorzugen, sonst Angaben aus Kalender/Forum */
export function personFor(email, members, fallbackName = '') {
  const p = members?.get(String(email || '').toLowerCase());
  return p || { email, name: fallbackName || String(email || '').split('@')[0], photo: '' };
}

export function dateBlock(start) {
  const s = toDate(start);
  return html`<div class="date-block" aria-hidden="true"><span class="wd">${fWeekdayShort(s)}</span><span class="d">${s.getDate()}</span><span class="m">${fMonthShort(s)}</span></div>`;
}

export function eventCard(ev, { members = new Map(), past = false, quick = false } = {}) {
  const cat = categoryInfo(ev.category);
  const sum = summarizeAttendees(ev.attendees || []);
  const yesPeople = sum.groups.accepted.map((a) => personFor(a.email, members, a.name));
  const inner = html`
    ${dateBlock(ev.start)}
    <div class="grow" style="min-width:0">
      <h3>${ev.title}</h3>
      <div class="meta">
        <span>${icon('clock')}${fEventTime(ev)}</span>
        ${ev.location ? html`<span class="ellipsis" style="max-width:100%">${icon('pin')}${ev.location}</span>` : ''}
      </div>
      <div class="event-foot">
        ${rsvpPill(ev.myStatus)}
        ${sum.yes ? html`<span class="row wrap" style="gap:.375rem">${avatarStack(yesPeople, 4, 24)}<span class="small muted">${sum.total} ${sum.total === 1 ? 'Zusage' : 'Zusagen'}</span></span>` : ''}
        ${ev.mandatory ? html`<span class="badge badge-black">Pflicht</span>` : ''}
        ${ev.dresscode ? html`<span class="badge">${ev.dresscode}</span>` : ''}
      </div>
      ${quick && (!ev.myStatus || ev.myStatus === 'needsAction') ? html`
        <div class="rsvp-quick" style="margin-top:.625rem">
          <button class="btn btn-sm btn-green" data-rsvp="accepted" data-id="${ev.id}">${icon('check', 'icon-sm')}Zusagen</button>
          <button class="btn btn-sm" data-rsvp="declined" data-id="${ev.id}">Absagen</button>
        </div>` : ''}
    </div>`;
  if (quick) {
    return html`<div class="card event clickable ${past ? 'past' : ''}" data-href="#/termin/${encodeURIComponent(ev.id)}" style="--c:${cat.farbe}" title="${ev.category}">${inner}</div>`;
  }
  return html`<a class="card event ${past ? 'past' : ''}" href="#/termin/${encodeURIComponent(ev.id)}" style="--c:${cat.farbe}" title="${ev.category}">${inner}</a>`;
}

/** Klicks auf Karten mit data-href weiterleiten (Karten mit Knöpfen darin) */
export function bindCardLinks(root, navigate) {
  root.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, select, textarea')) return;
    const card = e.target.closest('[data-href]');
    if (card) navigate(card.dataset.href);
  });
}

export function issueCover(issue, coverUrl = '') {
  const label = issue.ausgabe || issue.title;
  // Ersatz-Titelseite: Bundesbote mit Wappen, DS-Zeitung (E38) neutral ohne Wappen der Verbindung
  const ds = issue.quelle === 'ds';
  return html`<div class="cover">
    ${coverUrl ? html`<img src="${coverUrl}" alt="" loading="lazy" referrerpolicy="no-referrer" data-cover-fallback>` : ''}
    <div class="cover-fallback ${ds ? 'ds' : ''}" ${coverUrl ? html`style="display:none"` : ''}>
      <div class="t">${ds ? 'DS-Zeitung' : html`Bundes&shy;bote`}</div>
      ${ds ? icon('newspaper') : html`<img src="assets/wappen.webp" alt="">`}
      <div class="band">${label}</div>
    </div>
  </div>`;
}

// Fehlgeschlagene Cover-Bilder durch die Ersatzgestaltung ersetzen
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName === 'IMG' && img.hasAttribute('data-cover-fallback')) {
    img.nextElementSibling?.style.removeProperty('display');
    img.remove();
  }
}, true);

export function newsCard(item, imageUrl = '', { isNew = false } = {}) {
  return html`<a class="card news-card" href="#/news/${encodeURIComponent(item.id)}">
    ${imageUrl ? html`<img class="img" src="${imageUrl}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
    <div class="body">
      <div class="row wrap" style="gap:.375rem">
        ${isNew ? html`<span class="badge badge-new">Neu</span>` : ''}
        ${item.pinned ? html`<span class="badge badge-black">${icon('bookmark', 'icon-sm')}Angeheftet</span>` : ''}
        ${item.category ? html`<span class="badge badge-green">${item.category}</span>` : ''}
      </div>
      <h3>${item.title}</h3>
      <p>${plainText(item.text, 180)}</p>
      <div class="meta"><span>${fDateShort(item.date)}</span>${item.authorName ? html`<span>${item.authorName}</span>` : ''}</div>
    </div>
  </a>`;
}

export function threadRow(t, members, unread = false) {
  const author = personFor(t.authorEmail, members, t.authorName);
  return html`<a class="card thread-row" href="#/forum/${encodeURIComponent(t.id)}">
    <div style="min-width:0">
      <h3>${unread ? html`<span class="dot-unread" title="Neue Beiträge"></span>` : ''}${t.pinned ? icon('bookmark', 'icon-sm') : ''}${t.closed ? icon('lock', 'icon-sm') : ''}<span>${t.title}</span></h3>
      <div class="meta" style="margin-top:.25rem">
        <span class="row" style="gap:.375rem">${avatar(author, 20)}${author.name}</span>
        <span class="badge">${t.category}</span>
        <span>${relTime(t.lastActivity)}</span>
      </div>
    </div>
    <div class="stats"><strong>${t.replies}</strong>${t.replies === 1 ? 'Antwort' : 'Antworten'}</div>
  </a>`;
}

/** Ungelesen-Markierung im Forum (pro Gerät) */
export function forumSeen() {
  try { return JSON.parse(localStorage.getItem('fb.forumSeen') || '{}'); } catch { return {}; }
}

export function markThreadSeen(id, time) {
  const s = forumSeen();
  s[id] = time || new Date().toISOString();
  try { localStorage.setItem('fb.forumSeen', JSON.stringify(s)); } catch { /* egal */ }
}

export function isUnread(t, seen = forumSeen()) {
  if (!seen.__init) return false;
  const last = seen[t.id];
  return !last || String(t.lastActivity) > String(last);
}

export function initForumSeen(threads) {
  const s = forumSeen();
  if (s.__init) return;
  s.__init = new Date().toISOString();
  for (const t of threads) s[t.id] = t.lastActivity;
  try { localStorage.setItem('fb.forumSeen', JSON.stringify(s)); } catch { /* egal */ }
}

export function appName() {
  return config.appName;
}

const CHAT_HOME = 'https://chat.google.com/';
/** Google Chat in der Admin-Konsole (Chateinladungen, Chat-Apps) – Adresse aus der Google-Hilfe „Chateinladungen automatisch annehmen“ */
const ADMIN_CHAT = 'https://admin.google.com/ac/appsettings/216932279217';

/**
 * Senden im Chat abgelehnt (403): Meist ist die Unterhaltung bei Google noch eine Nachrichtenanfrage bzw. Einladung –
 * lesen geht, antworten erst nach dem Annehmen in Google Chat. Das erklärt ein Hinweis mit dem Grund von Google statt
 * der allgemeinen Meldung „Kein Zugriff … Freigabe“: im Chat über dem Eingabefeld, im Profil unter „Nachricht“ und
 * „Bierjunge“ (E30, E45). Der Knopf führt direkt dorthin, wo man annehmen kann: zur Unterhaltung bei Google (url, nur
 * https), sonst zu Google Chat; bei gesperrten Chat-Apps für Admins zur Einstellung in der Admin-Konsole. Andere Fehler: null.
 */
export function sendRefusal(err, { url = '', admin = false } = {}) {
  if (err?.status !== 403 || err.code || describeError(err).relogin) return null;
  const google = err.message ? html`<br><span class="muted">Google: „${err.message}“</span>` : '';
  const knopf = (href, text) => html`<p style="margin:.625rem 0 0"><a class="btn btn-sm" href="${href}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}${text}</a></p>`;
  if (/chat app|allowlist/i.test(err.message || '')) {
    return notice('gold', 'Chat-Apps nicht erlaubt',
      html`Die Admins müssen in der Google-Admin-Konsole Chat-Apps erlauben: Apps › Google Workspace › Google Chat › Chat-Apps › „Nutzern erlauben, Chat-Apps zu installieren“.${google}`,
      admin ? knopf(ADMIN_CHAT, 'Einstellung in der Admin-Konsole') : '');
  }
  const direkt = /^https:\/\//.test(url);
  return notice('gold', 'Antworten noch nicht möglich',
    html`Vermutlich eine noch nicht angenommene <b>Nachrichtenanfrage</b> (jemand hat dir zuerst geschrieben) oder Einladung. ${direkt
      ? 'Öffne die Unterhaltung in Google Chat und nimm die Anfrage dort an.'
      : html`Annehmen in Google Chat: <b>Neuer Chat › Nachrichtenanfragen</b>.`} Danach klappt es auch hier.${google}`,
    knopf(direkt ? url : CHAT_HOME, direkt ? 'In Google Chat öffnen' : 'Google Chat öffnen'));
}
