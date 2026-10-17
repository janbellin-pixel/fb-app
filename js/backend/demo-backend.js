// Demo-Modus: gleiche Schnittstelle wie GoogleBackend, Daten sind fiktiv.
// Änderungen (Zusagen, Beiträge, Profil …) werden nur in diesem Browser gespeichert.
import {
  buildMembers, buildEvents, buildNews, buildForumData, buildChat, buildAddressRows, buildGallery, DEMO_ISSUES, DEMO_ME_EMAIL, DEMO_DOMAIN,
} from './demo-data.js';
import { addressesFromRows, buildForum, issueFromFile, sortIssues, sortMembers, PROFILE_FIELDS } from './common.js';
import { local } from '../lib/store.js';
import { newId, calendarEventId, firstName } from '../lib/text.js';
import { addDays, isoDate } from '../lib/dates.js';
import { resizeImage } from '../ui.js';
import { buildRecord, dsConfig, textPruefsumme } from '../lib/datenschutz.js';

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
    return this.baseMembers.map((m) => this.member(m.email));
  }

  async listMembers() {
    await wait();
    return sortMembers(this.members());
  }

  async getMember(email) {
    await wait(60);
    return this.member(String(email).toLowerCase());
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
      const v = { zeitpunkt, fassung, pruefsumme: textPruefsumme(), vereinszwecke: i % 7 !== 2, dachverband: i % 3 !== 1, geraet: i % 2 ? 'iPhone · Safari · installierte App' : 'Android · Chrome' };
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

  async rsvp(eventId, { status, guests, comment }) {
    await wait(350);
    const r = this.bucket('rsvps', {});
    r[eventId] = { status, guests: Number(guests) || 0, comment: comment || '' };
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
    return [...n.added, ...buildNews()]
      .filter((x) => !n.deleted.includes(x.id))
      .map((x) => ({ ...x, ...(n.edited[x.id] || {}) }))
      .sort((a, b) => (b.pinned - a.pinned) || String(b.date).localeCompare(String(a.date)));
  }

  async canEditNews() {
    return false;
  }

  newsSheetUrl() {
    return '';
  }

  async imageUrl(ref) {
    return ref || '';
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

  async createThread({ category, title, text }) {
    await wait(350);
    const f = this.bucket('forum', { threads: [], posts: [], edits: {}, deletedPosts: [], flags: {} });
    const id = newId('t');
    const now = nowIso();
    f.threads.push({ id, category, title, authorEmail: DEMO_ME_EMAIL, authorName: this.user.name, created: now });
    f.posts.push({ id: newId('p'), threadId: id, authorEmail: DEMO_ME_EMAIL, authorName: this.user.name, created: now, text });
    this.save();
    return id;
  }

  async reply(threadId, text) {
    await wait(300);
    const f = this.bucket('forum', { threads: [], posts: [], edits: {}, deletedPosts: [], flags: {} });
    f.posts.push({ id: newId('p'), threadId, authorEmail: DEMO_ME_EMAIL, authorName: this.user.name, created: nowIso(), text });
    this.save();
  }

  async editPost(postId, text) {
    await wait(250);
    this.ownPost(postId);
    const f = this.bucket('forum', { threads: [], posts: [], edits: {}, deletedPosts: [], flags: {} });
    const own = f.posts.find((p) => p.id === postId);
    if (own) own.text = text;
    f.edits[postId] = { text, edited: nowIso() };
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
  async listIssues() {
    await wait();
    return sortIssues(DEMO_ISSUES.map((f) => issueFromFile(f)));
  }

  async loadIssue(issue) {
    const res = await fetch(issue.url);
    if (!res.ok) throw new Error('Ausgabe konnte nicht geladen werden');
    return res.arrayBuffer();
  }

  issueOpenUrl(issue) {
    return issue.url;
  }

  /* ---------------------------------------------------------- Galerie */
  async listGallery() {
    await wait();
    return { albums: buildGallery(), folderUrl: '' };
  }

  photoUrl(photo) {
    return photo.thumb || photo.url;
  }

  async photoFullUrl(photo) {
    return photo.url;
  }

  /* ---------------------------------------------------------- Chat */
  chatStatus() {
    return { available: true };
  }

  chatState() {
    return this.bucket('chat', { messages: {}, dms: [] });
  }

  async listSpaces() {
    await wait();
    const base = buildChat();
    const c = this.chatState();
    const spaces = [...base.spaces, ...c.dms].map((s) => {
      const own = c.messages[s.id] || [];
      const last = own[own.length - 1];
      return { ...s, lastActive: last && last.created > s.lastActive ? last.created : s.lastActive, url: 'https://chat.google.com/' };
    });
    return spaces.sort((a, b) => String(b.lastActive).localeCompare(String(a.lastActive)));
  }

  async listMessages(spaceId, { since } = {}) {
    await wait(since ? 40 : 150);
    const base = buildChat().messages[spaceId] || [];
    const own = this.chatState().messages[spaceId] || [];
    const now = nowIso();
    return [...base, ...own]
      .filter((m) => m.created <= now && (!since || m.created > since))
      .sort((a, b) => a.created.localeCompare(b.created))
      .map((m) => this.mapMessage(m));
  }

  mapMessage(m) {
    const p = this.member(m.senderEmail) || { name: 'Mitglied', photo: '' };
    return { id: m.id, text: m.text, created: m.created, sender: { name: p.name, photo: p.photo, email: m.senderEmail }, mine: m.senderEmail === DEMO_ME_EMAIL };
  }

  async sendMessage(spaceId, text) {
    await wait(200);
    const c = this.chatState();
    const list = (c.messages[spaceId] = c.messages[spaceId] || []);
    const msg = { id: newId('m'), senderEmail: DEMO_ME_EMAIL, created: nowIso(), text };
    list.push(msg);
    // kleine Demo-Antwort, damit sich der Chat lebendig anfühlt
    const replies = ['👍', 'Danke für die Info!', 'Bin dabei.', 'Super, bis dann!', 'Gute Idee 🙂'];
    const others = this.baseMembers.filter((m) => m.email !== DEMO_ME_EMAIL);
    const dm = c.dms.find((d) => d.id === spaceId);
    const replier = dm ? this.member(dm.with) : others[Math.floor(Math.random() * others.length)];
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
