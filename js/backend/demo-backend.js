// Demo-Modus: gleiche Schnittstelle wie GoogleBackend, Daten sind fiktiv.
// Änderungen (Zusagen, Beiträge, Profil …) werden nur in diesem Browser gespeichert.
import {
  buildMembers, buildEvents, buildNews, buildForumData, buildChat, buildAddressRows, buildGallery, DEMO_ISSUES, DEMO_DS_ISSUES, DEMO_SONGS, DEMO_ME_EMAIL, DEMO_DOMAIN,
} from './demo-data.js';
import {
  addressesFromRows, buildForum, issueFromFile, sortIssues, sortMembers, sortNews, songFromFile, sortSongs, PROFILE_FIELDS,
} from './common.js';
import { local } from '../lib/store.js';
import { newId, calendarEventId, firstName } from '../lib/text.js';
import { addDays, isoDate, isoLocal } from '../lib/dates.js';
import { resizeImage } from '../ui.js';
import { buildRecord, dsConfig, textPruefsumme } from '../lib/datenschutz.js';
import { anhangPruefen, anhaengeAus } from './common.js';

const STATE_KEY = 'fb.demo.v1';
const wait = (ms = 160) => new Promise((r) => setTimeout(r, ms + Math.random() * 140));
const nowIso = () => new Date().toISOString();

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export class DemoBackend {
  constructor() {
    this.kind = 'demo';
    this.isWorkspace = true;
    this.state = local.get(STATE_KEY) || {};
    this.baseMembers = buildMembers();
    const me = this.member(DEMO_ME_EMAIL);
    this.user = { email: DEMO_ME_EMAIL, name: me.name, photo: me.photo, firstName: firstName(me.name), hd: DEMO_DOMAIN };
  }

  get me() {
    const m = this.member(DEMO_ME_EMAIL);
    return { ...this.user, name: m.name, photo: m.photo };
  }

  isAdmin() {
    return true;
  }

  save() {
    local.set(STATE_KEY, this.state);
  }

  reset() {
    local.del(STATE_KEY);
    this.state = {};
  }

  bucket(name, init) {
    if (!this.state[name]) this.state[name] = init;
    return this.state[name];
  }

  /* ---------------------------------------------------------- Mitglieder */
  member(email) {
    const base = this.baseMembers.find((m) => m.email === email);
    if (!base) return null;
    if (email !== DEMO_ME_EMAIL) return base;
    return { ...base, ...(this.state.profile || {}) };
  }

  members() {
    // erfunden: jedes vierte Mitglied hat die App noch nicht genutzt („App-Nutzer | Alle Mitglieder“, E40)
    return this.baseMembers.map((m, i) => ({ ...this.member(m.email), appNutzer: m.email === DEMO_ME_EMAIL || i % 4 !== 3 }));
  }

  async listMembers() {
    await wait();
    return sortMembers(this.members());
  }

  async getMember(email) {
    await wait(60);
    return this.members().find((m) => m.email === String(email).toLowerCase()) || null;
  }

  async saveMyProfile(fields) {
    await wait(300);
    const p = this.bucket('profile', {});
    for (const k of PROFILE_FIELDS) if (fields[k] !== undefined) p[k] = String(fields[k]);
    this.save();
  }

  /** Nur im Demo-Modus: Foto direkt in der App ändern (sonst über das Google-Konto) */
  async setDemoPhoto(file) {
    const blob = await resizeImage(file, 320, 0.85);
    const p = this.bucket('profile', {});
    p.photo = await blobToDataUrl(blob);
    this.save();
  }

  /** Demo: Das Demo-Mitglied ist Bundesbruder und sieht alle Bereiche (E41) */
  async myGroups() {
    await wait(30);
    return ['bundesbrueder'];
  }

  /* ---------------------------------------------------------- Datenschutz-Einwilligungen */
  async getMyConsent() {
    await wait(60);
    return this.state.einwilligung || null;
  }

  async saveMyConsent(decisions) {
    await wait(250);
    this.state.einwilligung = { ...buildRecord(this.state.einwilligung, decisions, this.me), fileId: 'demo-einwilligung' };
    this.save();
    return this.state.einwilligung;
  }

  isConsentManager() {
    return true;
  }

  /* ---------------------------------------------------------- Papierpost abbestellen (E44) */
  async getMyPapierpost() {
    await wait(40);
    const p = this.state.papierpost; // gespeicherte Demo-Stände von vor 2026-10-30 können noch `semesterprogramm` tragen
    return p ? { bundesbote: !!p.bundesbote, geaendert: p.geaendert } : null;
  }

  async saveMyPapierpost({ bundesbote }) {
    await wait(200);
    this.state.papierpost = { bundesbote: !!bundesbote, geaendert: new Date().toISOString() };
    this.save();
    return this.state.papierpost;
  }

  /* ---------------------------------------------------------- Push-Mitteilungen (E50) – in der Demo ohne Absender */
  async saveMyPush({ geraet, themen }) {
    await wait(120);
    this.state.push = { ...(this.state.push || {}), [geraet]: { themen: [...(themen || [])], geaendert: new Date().toISOString() } };
    this.save();
    return this.state.push[geraet];
  }

  async deleteMyPush({ geraet }) {
    await wait(60);
    if (this.state.push) delete this.state.push[geraet];
    this.save();
  }

  /** Chat-Hinweise (E51) gibt es nur mit echtem Push-Skript – in der Demo nichts zu tun */
  async chatHinweiseAufraeumen() {}

  /** Erfundene Abbestellungen der Demo-Mitglieder (plus die eigene) */
  async listPapierpost() {
    await wait();
    const out = this.members().filter((m, i) => m.email !== DEMO_ME_EMAIL && i % 4 === 1)
      .map((m, i) => ({ email: m.email, name: m.name, bundesbote: true, geaendert: new Date(Date.now() - i * 5 * 86400_000).toISOString() }));
    const mine = this.state.papierpost;
    if (mine?.bundesbote) out.push({ email: DEMO_ME_EMAIL, name: this.me.name, bundesbote: true, geaendert: mine.geaendert });
    return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  /** Erfundene Rückmeldungen der Demo-Mitglieder (plus die eigene) */
  async listConsents() {
    await wait();
    const fassung = dsConfig().fassung;
    const out = [];
    this.members().forEach((m, i) => {
      if (m.email === DEMO_ME_EMAIL) return;
      if (i % 5 === 3) return; // noch keine Rückmeldung
      const d = new Date(Date.now() - ((i * 37) % 60) * 86400_000);
      d.setHours(9 + ((i * 5) % 13), (i * 17) % 60, 0, 0);
      const zeitpunkt = d.toISOString();
      const v = { zeitpunkt, fassung, pruefsumme: textPruefsumme(), vereinszwecke: i % 7 !== 2, dachverband: i % 3 !== 1, sichtbar: i % 6 !== 4, geraet: i % 2 ? 'iPhone · Safari · installierte App' : 'Android · Chrome' };
      out.push({ email: m.email, name: m.name, ...v, erstmals: zeitpunkt, geaendert: zeitpunkt, verlauf: [v], fileId: `demo-${i}`, link: '' });
    });
    const mine = this.state.einwilligung;
    if (mine) out.push({ email: DEMO_ME_EMAIL, name: this.me.name, ...mine, geaendert: mine.zeitpunkt, link: '' });
    return out;
  }

  async consentTable() {
    return null;
  }

  async createConsentTable() {
    throw new Error('Im Demo-Modus gibt es keine Einwilligungsliste in Google Tabellen.');
  }

  async syncConsentTable() {
    throw new Error('Im Demo-Modus gibt es keine Einwilligungsliste in Google Tabellen.');
  }

  async autoSyncConsents() {
    return null;
  }

  /* ---------------------------------------------------------- Termine */
  allEvents() {
    const ev = this.bucket('events', { added: [], edited: {}, deleted: [] });
    const rsvps = this.state.rsvps || {};
    const list = [...buildEvents(this.members()), ...ev.added]
      .filter((e) => !ev.deleted.includes(e.id))
      .map((e) => ({ ...e, ...(ev.edited[e.id] || {}) }));
    return list.map((e) => {
      const mine = rsvps[e.id];
      let attendees = e.attendees.map((a) => ({ ...a }));
      if (mine) {
        const a = attendees.find((x) => x.email === DEMO_ME_EMAIL);
        if (a) Object.assign(a, mine);
        else attendees.push({ email: DEMO_ME_EMAIL, name: this.user.name, source: 'calendar', ...mine });
      }
      const me = attendees.find((x) => x.email === DEMO_ME_EMAIL);
      return {
        ...e,
        attendees,
        myStatus: me?.status || 'needsAction',
        myGuests: me?.guests || 0,
        myComment: me?.comment || '',
        mySource: 'calendar',
        invited: true,
      };
    }).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  }

  async listEvents({ from, to }) {
    await wait();
    const events = this.allEvents().filter((e) => {
      const s = new Date(e.allDay ? `${e.start}T00:00:00` : e.start);
      const en = new Date(e.allDay ? `${e.end}T00:00:00` : e.end);
      return en >= from && s <= to;
    });
    return { events, canEdit: false, calendarName: 'Frankonia-Brunonia' };
  }

  async getEvent(id) {
    await wait(80);
    const e = this.allEvents().find((x) => x.id === id);
    if (!e) throw Object.assign(new Error('Termin nicht gefunden'), { status: 404 });
    return { ...e, canEdit: false };
  }

  async canEditEvents() {
    return false;
  }

  async rsvp(eventId, { status, guests, comment } = {}) {
    await wait(350);
    const r = this.bucket('rsvps', {});
    // nicht angegebene Gäste/Kommentare bleiben erhalten (z. B. beim schnellen Zusagen auf der Startseite)
    const prev = r[eventId] || {};
    r[eventId] = {
      status,
      guests: guests !== undefined ? Number(guests) || 0 : prev.guests || 0,
      comment: comment !== undefined ? comment || '' : prev.comment || '',
    };
    this.save();
    return { via: 'calendar' };
  }

  calendarInfo() {
    return { calendarId: '', name: 'Frankonia-Brunonia', demo: true };
  }

  /* ---------------------------------------------------------- News */
  async listNews() {
    await wait();
    const n = this.bucket('news', { added: [], edited: {}, deleted: [] });
    // in der Demo geschriebene News gehören dem Demo-Nutzer; die Beispielmeldungen stehen für die Tabelle
    return sortNews([...n.added.map((x) => ({ ...x, source: 'app', own: true })), ...buildNews().map((x) => ({ ...x, source: 'sheet' }))]
      .filter((x) => !n.deleted.includes(x.id))
      .map((x) => ({ ...x, ...(n.edited[x.id] || {}) })));
  }

  async canEditNews() {
    return true; // der Demo-Nutzer ist Admin
  }

  newsFields({ title, text, category, pinned, image, anhaenge }) {
    const t = String(title || '').trim().slice(0, 140);
    if (!t) throw new Error('Bitte einen Titel eingeben.');
    return { title: t, text: String(text || '').trim().slice(0, 4000), category: String(category || '').slice(0, 60), pinned: !!pinned, image: image || '', anhaenge: anhaengeAus(anhaenge) };
  }

  async createNews(fields) {
    await wait(300);
    const n = this.bucket('news', { added: [], edited: {}, deleted: [] });
    const item = { id: newId('n'), date: isoLocal(new Date()), ...this.newsFields(fields), authorEmail: DEMO_ME_EMAIL, authorName: this.user.name };
    n.added.unshift(item);
    this.save();
    return item.id;
  }

  async updateNews(id, fields) {
    await wait(300);
    const n = this.bucket('news', { added: [], edited: {}, deleted: [] });
    const own = n.added.find((x) => x.id === id);
    if (!own) throw new Error('Nur eigene News können bearbeitet werden.');
    Object.assign(own, this.newsFields(fields), { edited: new Date().toISOString() });
    this.save();
  }

  async deleteNews(id) {
    await wait(300);
    const n = this.bucket('news', { added: [], edited: {}, deleted: [] });
    if (!n.added.some((x) => x.id === id)) throw new Error('Nur eigene News können gelöscht werden.');
    n.added = n.added.filter((x) => x.id !== id);
    this.save();
  }

  /** Demo: Bild nur verkleinert im Browser speichern */
  async uploadNewsImage(file) {
    const blob = await resizeImage(file, 900, 0.8);
    if (!blob) throw new Error('Das Bild konnte nicht gelesen werden.');
    return blobToDataUrl(blob);
  }

  newsSheetUrl() {
    return '';
  }

  async imageUrl(ref) {
    return ref || '';
  }

  /* ---------------------------------------------------------- Anhänge (E56): in der Demo nur in dieser Sitzung im Speicher */
  async uploadAnhang(file) {
    await wait(300);
    const mime = anhangPruefen(file);
    const id = newId('a');
    this.anhangBlobs = this.anhangBlobs || new Map();
    this.anhangBlobs.set(id, file);
    return { id, name: String(file.name || 'Anhang').slice(0, 100), mime, groesse: file.size };
  }

  async trashOwnAnhaenge() {}

  async loadAnhang(a) {
    const f = this.anhangBlobs?.get(a.id);
    if (!f) throw new Error('In der Demo sind Anhänge nur in der Sitzung da, in der sie angehängt wurden.');
    return f.arrayBuffer();
  }

  async anhangUrl(a) {
    const f = this.anhangBlobs?.get(a.id);
    return f ? URL.createObjectURL(f) : '';
  }

  anhangOpenUrl() {
    return '';
  }

  /* ---------------------------------------------------------- Forum */
  forumRows() {
    const f = this.bucket('forum', { threads: [], posts: [], edits: {}, deletedPosts: [], flags: {} });
    const base = buildForumData();
    const threads = [...base.threads, ...f.threads].map((t) => {
      const flags = f.flags[t.id] || {};
      return {
        id: t.id, kategorie: t.category, titel: t.title, autorEmail: t.authorEmail, autorName: t.authorName, erstellt: t.created,
        angeheftet: (flags.pinned ?? t.pinned) ? 'ja' : '', geschlossen: (flags.closed ?? t.closed) ? 'ja' : '', geloescht: flags.deleted ? 'ja' : '',
      };
    });
    const posts = [...base.posts, ...f.posts].map((p) => ({
      id: p.id, themaId: p.threadId, autorEmail: p.authorEmail, autorName: p.authorName, erstellt: p.created,
      text: f.edits[p.id]?.text ?? p.text, bearbeitet: f.edits[p.id]?.edited || p.edited || '',
      anhaenge: f.edits[p.id]?.anhaenge ?? p.anhaenge ?? [],
      geloescht: f.deletedPosts.includes(p.id) ? 'ja' : '',
    }));
    return { threads, posts };
  }

  async listForum() {
    await wait();
    const { threads, posts } = this.forumRows();
    const forum = buildForum(threads, posts);
    for (const t of forum.threads) t.own = t.authorEmail === DEMO_ME_EMAIL;
    for (const p of forum.posts) p.own = p.authorEmail === DEMO_ME_EMAIL;
    return forum;
  }

  forumEnabled() {
    return true;
  }

  ownPost(postId) {
    const p = this.forumRows().posts.find((x) => x.id === postId);
    if (!p || p.autorEmail !== DEMO_ME_EMAIL) throw new Error('Nur eigene Beiträge können geändert werden.');
  }

  async createThread({ category, title, text, anhaenge = [] }) {
    await wait(350);
    const f = this.bucket('forum', { threads: [], posts: [], edits: {}, deletedPosts: [], flags: {} });
    const id = newId('t');
    const now = nowIso();
    f.threads.push({ id, category, title, authorEmail: DEMO_ME_EMAIL, authorName: this.user.name, created: now });
    f.posts.push({ id: newId('p'), threadId: id, authorEmail: DEMO_ME_EMAIL, authorName: this.user.name, created: now, text, anhaenge: anhaengeAus(anhaenge) });
    this.save();
    return id;
  }

  async reply(threadId, text, anhaenge = []) {
    await wait(300);
    const f = this.bucket('forum', { threads: [], posts: [], edits: {}, deletedPosts: [], flags: {} });
    f.posts.push({ id: newId('p'), threadId, authorEmail: DEMO_ME_EMAIL, authorName: this.user.name, created: nowIso(), text, anhaenge: anhaengeAus(anhaenge) });
    this.save();
  }

  async editPost(postId, text, anhaenge) {
    await wait(250);
    this.ownPost(postId);
    const f = this.bucket('forum', { threads: [], posts: [], edits: {}, deletedPosts: [], flags: {} });
    const own = f.posts.find((p) => p.id === postId);
    const liste = anhaenge === undefined ? (f.edits[postId]?.anhaenge ?? own?.anhaenge ?? []) : anhaengeAus(anhaenge);
    if (own) Object.assign(own, { text, anhaenge: liste });
    f.edits[postId] = { text, anhaenge: liste, edited: nowIso() };
    this.save();
  }

  async deletePost(postId) {
    await wait(200);
    this.ownPost(postId);
    const f = this.bucket('forum', { threads: [], posts: [], edits: {}, deletedPosts: [], flags: {} });
    f.deletedPosts.push(postId);
    this.save();
  }

  async deleteThread(threadId) {
    await wait(200);
    const t = this.forumRows().threads.find((x) => x.id === threadId);
    if (!t || t.autorEmail !== DEMO_ME_EMAIL) throw new Error('Nur eigene Themen können gelöscht werden.');
    const f = this.bucket('forum', { threads: [], posts: [], edits: {}, deletedPosts: [], flags: {} });
    f.flags[threadId] = { ...(f.flags[threadId] || {}), deleted: true };
    this.save();
  }

  /* ---------------------------------------------------------- Adressen */
  async listAddresses() {
    await wait();
    const result = addressesFromRows(buildAddressRows());
    result.sheetUrl = '';
    return result;
  }

  /* ---------------------------------------------------------- Zeitung */
  async listIssues(quelle = 'bundesbote') {
    await wait();
    return sortIssues((quelle === 'ds' ? DEMO_DS_ISSUES : DEMO_ISSUES).map((f) => ({ ...issueFromFile(f), quelle })));
  }

  async loadIssue(issue) {
    const res = await fetch(issue.url);
    if (!res.ok) throw new Error('Ausgabe konnte nicht geladen werden');
    return res.arrayBuffer();
  }

  issueOpenUrl(issue) {
    return issue.url;
  }

  /* ---------------------------------------------------------- Liedermappe */
  async listSongs() {
    await wait();
    return { songs: sortSongs(DEMO_SONGS.map((f) => songFromFile(f))), other: 0, folderUrl: '' };
  }

  async loadSong(song) {
    const res = await fetch(song.url);
    if (!res.ok) throw new Error('Lied konnte nicht geladen werden');
    return res.arrayBuffer();
  }

  songOpenUrl(song) {
    return song.url;
  }

  async songsOffline() {
    return new Set();
  }

  /* ---------------------------------------------------------- Galerie */
  async listGallery() {
    await wait();
    return { albums: buildGallery(), folderUrl: '' };
  }

  /** Demo: kein echter Upload-Ordner – der Link führt nur zu Google Drive */
  galleryUploadUrl() {
    return 'https://drive.google.com/';
  }

  photoUrl(photo) {
    return photo.thumb || photo.url;
  }

  async photoFullUrl(photo) {
    return photo.url;
  }

  /* ---------------------------------------------------------- Chat */
  chatStatus() {
    return { available: true, canCreate: true };
  }

  chatCanCreate() {
    return true;
  }

  chatState() {
    const c = this.bucket('chat', { messages: {}, dms: [] });
    c.groups = c.groups || [];
    return c;
  }

  /** Beispiel-Unterhaltungen mit festen Zeiten (einmal am Tag neu), damit nichts ständig „neu“ wirkt */
  chatBase() {
    const c = this.chatState();
    if (!c.epoch || Date.now() - Date.parse(c.epoch) > 24 * 3600_000) {
      c.epoch = nowIso();
      this.save();
    }
    return buildChat(new Date(c.epoch));
  }

  async openDirectChat(email, name = '') {
    await wait(200);
    const space = await this.findDirectChat(email);
    if (name) {
      const dm = this.chatState().dms.find((d) => d.id === space.id);
      if (dm && !this.member(email)) dm.name = name;
    }
    return space;
  }

  async createGroup({ name = '', emails = [] } = {}) {
    await wait(300);
    const people = [...new Set(emails.map((x) => String(x).toLowerCase()).filter((x) => x && x !== DEMO_ME_EMAIL))];
    if (!people.length) throw new Error('Bitte mindestens eine Person auswählen.');
    if (!name.trim() && people.length < 2) throw new Error('Für eine Gruppe ohne Namen bitte mindestens zwei Personen auswählen – oder einen Namen eingeben.');
    const c = this.chatState();
    const first = people.map((e) => (this.member(e)?.name || e).split(' ')[0]);
    const group = {
      id: `spaces/grp-${newId('g')}`,
      name: name.trim() || first.join(', '),
      description: name.trim() ? 'Gruppe' : '',
      type: name.trim() ? 'SPACE' : 'GROUP_CHAT',
      members: people,
      lastActive: nowIso(),
    };
    c.groups.push(group);
    this.save();
    return { id: group.id, name: group.name, url: 'https://chat.google.com/' };
  }

  /** Vorstände für „… kontaktieren“ (E45) – in der Demo aus den erfundenen Ämtern */
  vorstand() {
    const pick = (re) => this.baseMembers.filter((m) => re.test(m.aemter || '') && m.email !== DEMO_ME_EMAIL).map((m) => m.email);
    return { aktive: pick(/sprecher|fuxmajor|kassenwart/i), altherren: pick(/altherrenschaft/i) };
  }

  /** Gruppe mit genau diesen Personen öffnen oder anlegen; bei einer Person die Direktnachricht (E45) */
  async openGroupChat(emails, name = '') {
    const people = [...new Set(emails.map((x) => String(x).toLowerCase()).filter((x) => x && x !== DEMO_ME_EMAIL))].sort();
    if (!people.length) throw new Error('Hier ist niemand eingetragen.');
    if (people.length === 1) return this.openDirectChat(people[0], name);
    const key = people.join(',');
    let g = this.chatState().groups.find((x) => x.type === 'GROUP_CHAT' && [...x.members].sort().join(',') === key);
    if (!g) {
      const made = await this.createGroup({ emails: people });
      g = this.chatState().groups.find((x) => x.id === made.id);
    }
    if (name) { g.name = name; this.save(); }
    return { id: g.id, name: g.name, url: 'https://chat.google.com/' };
  }

  async addMembers(spaceId, emails = []) {
    await wait(250);
    const g = this.chatState().groups.find((x) => x.id === spaceId);
    const out = { added: [], already: [], failed: [] };
    for (const e of emails.map((x) => String(x).toLowerCase())) {
      if (g?.members.includes(e)) out.already.push(e);
      else { if (g) g.members.push(e); out.added.push(e); }
    }
    this.save();
    return out;
  }

  async listSpaceMembers(spaceId) {
    const g = this.chatState().groups.find((x) => x.id === spaceId);
    const emails = g ? g.members : this.baseMembers.slice(0, 8).map((m) => m.email);
    return emails.map((e) => { const m = this.member(e); return { email: e, name: m?.name || e, photo: m?.photo || '' }; });
  }

  async listSpaces() {
    await wait();
    const base = this.chatBase();
    const c = this.chatState();
    const now = nowIso();
    const spaces = [...base.spaces.map((s) => ({ type: 'SPACE', ...s })), ...c.groups, ...c.dms].map((s) => {
      // die Demo-Antwort kommt erst ein paar Sekunden später an – vorher zählt sie nicht
      const own = (c.messages[s.id] || []).filter((m) => m.created <= now);
      const last = own[own.length - 1];
      return { ...s, lastActive: last && last.created > s.lastActive ? last.created : s.lastActive, url: 'https://chat.google.com/' };
    });
    return spaces.sort((a, b) => String(b.lastActive).localeCompare(String(a.lastActive)));
  }

  async listMessages(spaceId, { since } = {}) {
    await wait(since ? 40 : 150);
    const base = this.chatBase().messages[spaceId] || [];
    const own = this.chatState().messages[spaceId] || [];
    const now = nowIso();
    return [...base, ...own]
      .filter((m) => m.created <= now && (!since || m.created > since))
      .sort((a, b) => a.created.localeCompare(b.created))
      .map((m) => this.mapMessage(m));
  }

  async latestMessage(spaceId) {
    const list = await this.listMessages(spaceId);
    return list[list.length - 1] || null;
  }

  mapMessage(m) {
    const p = this.member(m.senderEmail) || { name: 'Mitglied', photo: '' };
    return { id: m.id, text: m.text, created: m.created, sender: { name: p.name, photo: p.photo, email: m.senderEmail }, mine: m.senderEmail === DEMO_ME_EMAIL };
  }

  /** opts.art ('bierjunge') braucht nur das Google-Backend für den Chat-Hinweis (E51) */
  async sendMessage(spaceId, text, opts = {}) { // eslint-disable-line no-unused-vars
    await wait(200);
    const c = this.chatState();
    const list = (c.messages[spaceId] = c.messages[spaceId] || []);
    const msg = { id: newId('m'), senderEmail: DEMO_ME_EMAIL, created: nowIso(), text };
    list.push(msg);
    // kleine Demo-Antwort, damit sich der Chat lebendig anfühlt
    const replies = ['👍', 'Danke für die Info!', 'Bin dabei.', 'Super, bis dann!', 'Gute Idee 🙂'];
    const others = this.baseMembers.filter((m) => m.email !== DEMO_ME_EMAIL);
    const dm = c.dms.find((d) => d.id === spaceId);
    const grp = c.groups.find((g) => g.id === spaceId);
    const replier = dm ? this.member(dm.with)
      : grp ? this.member(grp.members[Math.floor(Math.random() * grp.members.length)])
        : others[Math.floor(Math.random() * others.length)];
    if (replier && Math.random() < 0.7) {
      list.push({
        id: newId('m'), senderEmail: replier.email, created: new Date(Date.now() + 4000).toISOString(),
        text: replies[Math.floor(Math.random() * replies.length)],
      });
    }
    this.save();
    return this.mapMessage(msg);
  }

  async findDirectChat(email) {
    const c = this.chatState();
    const id = `spaces/dm-${email.split('@')[0].replace(/[^a-z0-9]/gi, '')}`;
    if (!c.dms.find((d) => d.id === id)) {
      const m = this.member(email);
      c.dms.push({ id, name: m ? m.name : email, description: 'Direktnachricht', lastActive: nowIso(), with: email, type: 'DIRECT_MESSAGE' });
      this.save();
    }
    return { id, url: 'https://chat.google.com/' };
  }

  chatOpenUrl() {
    return 'https://chat.google.com/';
  }
}
