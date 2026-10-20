// Echtbetrieb mit Google
// =====================
// Gemeinsame Daten werden NUR GELESEN:
//   Termine            → Google Kalender der Verbindung
//   Adressen, News     → Google-Tabellen (gepflegt von Admins/Redaktion direkt in Google)
//   Bundesbote, Liedermappe, Galerie → Ordner in Google Drive
//   Namen, Fotos       → Workspace-Verzeichnis bzw. Google-Konto
//
// Geändert werden ausschließlich EIGENE Daten des angemeldeten Mitglieds:
//   Zu-/Absage         → im eigenen Kalender (Google überträgt sie an den Termin)
//   Profilangaben      → eigene kleine Datei im eigenen Google Drive, für Mitglieder lesbar
//   Forenbeiträge      → je Beitrag eine eigene Datei im eigenen Drive, für Mitglieder lesbar
//   Chat-Nachrichten   → eigene Nachrichten in Google Chat
//   Einwilligungen     → eigene Datei im eigenen Drive, nur für die Datenschutz-Verantwortlichen lesbar
//                        (die Sammeltabelle schreibt nur deren eigenes Konto)
// Der Schreibschutz (google/guard.js) erzwingt das für jede einzelne Anfrage.
import { config, isAdminEmail, isNewsAuthorEmail } from '../config.js';
import * as cal from '../google/calendar.js';
import * as sheets from '../google/sheets.js';
import * as drive from '../google/drive.js';
import * as people from '../google/people.js';
import * as chat from '../google/chat.js';
import { ApiError } from '../google/client.js';
import { registerOwnFile, isOwnFile, registerOwnTable } from '../google/guard.js';
import { hasScope } from '../auth.js';
import { buildRecord, consentRecipients, isConsentManager, pruefsumme, ja } from '../lib/datenschutz.js';
import { prepareConsentSheet, syncConsentSheet, TABLE_TYPE } from '../lib/einwilligungsliste.js';
import {
  SHEETS, NEWS_SCHEMA, PROFILE_FIELDS, PROFILE_MAX, guessCategory, parseEventMeta, stripAppLink, issueFromFile, sortIssues, addressesFromRows, addressTab,
  buildForum, newsFromRows, sortNews, sortMembers, isSongFile, songFromFile, sortSongs, ZEITUNGEN,
} from './common.js';
import { htmlToText } from '../lib/text.js';
import { isoLocal } from '../lib/dates.js';
import { resizeImage } from '../ui.js';
import { findOwnAddress, nameKey } from '../lib/adressabgleich.js';
import { local } from '../lib/store.js';

const SCOPE_DIRECTORY = 'https://www.googleapis.com/auth/directory.readonly';
const SCOPE_CHAT_READ = 'https://www.googleapis.com/auth/chat.spaces.readonly';
const SCOPE_CHAT_MSG = 'https://www.googleapis.com/auth/chat.messages';
const SCOPE_CHAT_CREATE = 'https://www.googleapis.com/auth/chat.spaces.create';
const SCOPE_CHAT_MEMBERS = 'https://www.googleapis.com/auth/chat.memberships';
const CHAT_NAMES = 'fb.chatNamen'; // Namen selbst angelegter Unterhaltungen (falls das Verzeichnis fehlt)
const APP_FOLDER = 'Frankonia-Brunonia App – meine Beiträge und Profil';
const OWN_FIELDS = 'id,name,description,createdTime,modifiedTime,appProperties,ownedByMe,owners(emailAddress,displayName,photoLink)';
const GALLERY_FIELDS = 'id,name,mimeType,thumbnailLink,webViewLink,createdTime,modifiedTime,imageMediaMetadata(width,height,time),parents';
const TABLE_FIELDS = 'id,name,ownedByMe,appProperties,owners(emailAddress,displayName,photoLink)';
const CONSENT_FILE = 'Datenschutz-Einwilligung (Mitglieder-App).json';
const VISIBILITY_FILE = 'Sichtbarkeit (Mitglieder-App).json';
/** Wahl aus einer Sichtbarkeits-Datei (E40): true = in der Mitgliederliste zeigen */
const visibilityOf = (f) => {
  const d = parseJson(f.description);
  return typeof d.sichtbar === 'boolean' ? d.sichtbar : f.appProperties?.fbSichtbar !== 'nein';
};
const SPREADSHEET = 'application/vnd.google-apps.spreadsheet';
export const MAX_POST_LENGTH = 4000;
export const MAX_NEWS_LENGTH = 4000;

function notConfigured(what) {
  return Object.assign(new Error(`${what} ist noch nicht eingerichtet. Ein Admin muss das unter „Einrichtung“ erledigen.`), { code: 'not_configured' });
}

const nowIso = () => new Date().toISOString();
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

const ANTWORTEN = ['accepted', 'tentative', 'declined'];

/** Schlüssel eines Termins für appProperties (Google erlaubt höchstens 124 Byte je Eintrag) */
export function terminKey(eventId) {
  const id = String(eventId || '');
  return id.length <= 100 && /^[\w-]+$/.test(id) ? id : `h${pruefsumme(id)}`;
}

function parseJson(s) {
  try {
    const v = JSON.parse(s || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export class GoogleBackend {
  constructor(user) {
    this.kind = 'google';
    this.user = user;
    this.isWorkspace = !!user.hd;
    this.memo = new Map();
    this.blobUrls = new Map();
  }

  get me() {
    return this.user;
  }

  get myEmail() {
    return this.user.email.toLowerCase();
  }

  isAdmin() {
    return isAdminEmail(this.user.email);
  }

  cached(key, ttl, fn) {
    const hit = this.memo.get(key);
    if (hit && Date.now() - hit.t < ttl) return hit.p;
    const p = fn();
    this.memo.set(key, { t: Date.now(), p });
    p.catch(() => this.memo.delete(key));
    return p;
  }

  invalidate(...keys) {
    for (const k of keys) this.memo.delete(k);
  }

  /** Zwischenspeicher-Schlüssel des Adressverzeichnisses – ändert sich mit Tabelle und Blatt */
  addressKey() {
    return `addresses:${config.tabellen?.adressen || ''}:${config.adressenBlatt || ''}`;
  }

  sheetId(which) {
    const id = (config.tabellen?.[which] || '').trim();
    if (!id) throw notConfigured(which === 'adressen' ? 'Das Adressverzeichnis' : 'Die News-Tabelle');
    return id;
  }

  calendarId() {
    const id = (config.kalenderId || '').trim();
    if (!id) throw notConfigured('Der Kalender');
    return id;
  }

  /* ================================================================ eigene Dateien */

  /** Ordner im EIGENEN Drive, in dem die App Profil und Beiträge ablegt */
  async appFolder() {
    return this.cached('appFolder', 24 * 3600_000, async () => {
      const found = await drive.listFiles(
        "appProperties has { key='fbTyp' and value='ordner' } and 'me' in owners and trashed = false",
        { fields: 'id,ownedByMe', orderBy: 'createdTime' },
      );
      const own = found.find((f) => f.ownedByMe);
      if (own) {
        registerOwnFile(own.id);
        return own.id;
      }
      const f = await drive.createFile({ name: APP_FOLDER, mimeType: 'application/vnd.google-apps.folder', appProperties: { fbTyp: 'ordner' } });
      registerOwnFile(f.id);
      return f.id;
    });
  }

  /** Alle für mich sichtbaren App-Dateien eines Typs (eigene und von anderen freigegebene) */
  async listAppFiles(typ) {
    return this.queryAppFiles(`appProperties has { key='fbTyp' and value='${typ}' } and trashed = false`);
  }

  /** App-Dateien zu einer beliebigen Drive-Abfrage – im eigenen Drive und in der Domain */
  async queryAppFiles(q) {
    const lists = await Promise.all([
      drive.listFiles(q, { fields: OWN_FIELDS, orderBy: 'createdTime' }),
      this.isWorkspace && config.workspaceDomain
        ? drive.listFiles(q, { fields: OWN_FIELDS, orderBy: 'createdTime', corpora: 'domain' }).catch(() => [])
        : Promise.resolve([]),
    ]);
    const byId = new Map();
    for (const f of [...lists[0], ...lists[1]]) byId.set(f.id, f);
    const files = [...byId.values()];
    for (const f of files) if (f.ownedByMe) registerOwnFile(f.id);
    return files;
  }

  /** Eigene Datei für die Mitglieder lesbar machen (nie bearbeitbar) */
  async shareOwnFile(fileId) {
    const perms = [];
    if (config.mitgliederGruppe) perms.push({ type: 'group', role: 'reader', emailAddress: config.mitgliederGruppe });
    if (config.workspaceDomain) perms.push({ type: 'domain', role: 'reader', domain: config.workspaceDomain, allowFileDiscovery: true });
    for (const e of config.testMitglieder || []) perms.push({ type: 'user', role: 'reader', emailAddress: e });
    for (const p of perms) {
      try { await drive.addPermission(fileId, p); } catch (e) { console.warn('Freigabe nicht möglich', p, e); }
    }
  }

  async createOwnFile(typ, data, props, name) {
    const folder = await this.appFolder();
    const f = await drive.createFile({
      name,
      mimeType: 'application/json',
      parents: [folder],
      appProperties: { fbTyp: typ, ...props },
      description: JSON.stringify(data),
    }, 'id,createdTime');
    registerOwnFile(f.id);
    await this.shareOwnFile(f.id);
    return f;
  }

  ownerOf(f) {
    const o = f.owners?.[0] || {};
    return { email: String(o.emailAddress || '').toLowerCase(), name: o.displayName || '', photo: o.photoLink || '' };
  }

  /* ================================================================ Mitglieder */

  /** Google-Verzeichnis der Domain; this.directoryInfo hält fest, warum es ggf. leer bleibt (Hinweis für Admins) */
  async directory() {
    if (!this.isWorkspace) { this.directoryInfo = { ok: false, reason: 'no-workspace' }; return []; }
    if (!hasScope(SCOPE_DIRECTORY)) { this.directoryInfo = { ok: false, reason: 'scope' }; return []; }
    try {
      const list = await this.cached('directory', 30 * 60_000, () => people.listDirectory());
      this.directoryInfo = { ok: true, count: list.length };
      return list;
    } catch (e) {
      this.directoryInfo = { ok: false, reason: 'error', error: e.message || String(e) };
      throw e;
    }
  }

  async profileFiles() {
    return this.cached('profiles', 60_000, () => this.listAppFiles('profil'));
  }

  async listMembers() {
    const [dir, files, addr, vis] = await Promise.all([
      this.directory().catch(() => []),
      this.profileFiles().catch(() => []),
      config.tabellen?.adressen ? this.cached(this.addressKey(), 10 * 60_000, () => this.loadAddresses()).catch(() => null) : Promise.resolve(null),
      this.visibilityFiles().catch(() => []),
    ]);
    // Sichtbarkeit (E40): je Mitglied die zuletzt geänderte eigene Datei – Inhaber laut Google, nicht fälschbar.
    // Wer „nicht sichtbar“ gewählt hat, fehlt in der Liste (nur man selbst sieht sich immer).
    const visNewest = new Map();
    for (const f of vis) {
      const owner = this.ownerOf(f);
      if (!owner.email) continue;
      const prev = visNewest.get(owner.email);
      if (!prev || String(f.modifiedTime) > String(prev.f.modifiedTime)) visNewest.set(owner.email, { f, owner });
    }
    const hidden = new Set((config.ausgeblendeteKonten || []).map((e) => String(e).toLowerCase()));
    for (const [email, { f }] of visNewest) if (email !== this.myEmail && !visibilityOf(f)) hidden.add(email);
    const map = new Map();
    const get = (email) => {
      if (!map.has(email)) map.set(email, { email });
      return map.get(email);
    };
    for (const d of dir) {
      if (hidden.has(d.email)) continue;
      Object.assign(get(d.email), { name: d.name, photo: d.photo, directoryId: d.id, organisation: d.organisation });
    }
    // Adressverzeichnis (von Admins gepflegt): Kneipname, Status, Rezeption, Beruf, Wohnort
    const addrItems = addr?.items || [];
    const usedEntries = new Set();
    const matched = new Set();
    const enrich = (m, a) => {
      usedEntries.add(a);
      matched.add(m.email);
      m.name = m.name || a.name;
      if (a.kneipname) m.kneipname = a.kneipname;
      if (a.status) m.status = a.status;
      if (a.rezeption) m.rezeption = a.rezeption;
      if (a.beruf) m.studium = a.beruf;
      if (a.ort) m.wohnort = a.ort;
    };
    for (const a of addrItems) {
      if (!a.email || hidden.has(a.email)) continue;
      if (!this.isWorkspace || map.has(a.email)) enrich(get(a.email), a);
    }
    // Steht im Verzeichnis eine andere (z. B. private) E-Mail-Adresse: über den Namen zuordnen –
    // nur bei genau einem Treffer, lieber keiner als der falsche
    if (this.isWorkspace) {
      const free = addrItems.filter((a) => !usedEntries.has(a) && !(a.email && map.has(a.email)));
      const sameName = new Map();
      for (const m of map.values()) {
        const k = nameKey(m.name);
        if (k) sameName.set(k, (sameName.get(k) || 0) + 1);
      }
      for (const m of map.values()) {
        if (matched.has(m.email) || !m.name || sameName.get(nameKey(m.name)) > 1) continue;
        const { entry } = findOwnAddress(free, { name: m.name });
        if (!entry) continue;
        enrich(m, entry);
        free.splice(free.indexOf(entry), 1);
      }
    }
    // Selbst gepflegte Profile: Inhaber laut Google Drive (nicht fälschbar); je Mitglied zählt die zuletzt geänderte Datei
    const newest = new Map();
    for (const f of files) {
      const owner = this.ownerOf(f);
      if (!owner.email || hidden.has(owner.email)) continue;
      const prev = newest.get(owner.email);
      if (!prev || String(f.modifiedTime) > String(prev.f.modifiedTime)) newest.set(owner.email, { f, owner });
    }
    for (const { f, owner } of newest.values()) {
      const data = parseJson(f.description);
      const m = get(owner.email);
      m.name = m.name || owner.name || owner.email;
      m.photo = m.photo || owner.photo || '';
      for (const k of PROFILE_FIELDS) {
        const v = clip(data[k], 1500);
        if (!v) continue;
        if (k === 'status' && m.status) continue; // Status kommt bevorzugt aus dem Adressverzeichnis
        m[k] = v;
      }
      m.profilAktualisiert = f.modifiedTime;
    }
    // Wer die App schon genutzt hat und sichtbar ist, erscheint auch ohne Eintrag im Google-Verzeichnis
    for (const { owner } of visNewest.values()) {
      if (hidden.has(owner.email)) continue;
      const m = get(owner.email);
      m.name = m.name || owner.name || owner.email;
      m.photo = m.photo || owner.photo || '';
    }
    const me = get(this.myEmail);
    me.name = me.name || this.user.name;
    me.photo = me.photo || this.user.photo;
    return sortMembers([...map.values()].map((m) => ({ ...m, name: m.name || m.email, appNutzer: visNewest.has(m.email) })));
  }

  async getMember(email) {
    const list = await this.listMembers();
    return list.find((m) => m.email === String(email).toLowerCase()) || null;
  }

  /** Eigenes Profil speichern – als eigene Datei im eigenen Drive */
  async saveMyProfile(fields) {
    if (config.profilBearbeiten === false) throw new Error('Das Bearbeiten von Profilen ist ausgeschaltet.');
    const data = {};
    for (const k of PROFILE_FIELDS) if (fields[k] !== undefined) data[k] = clip(fields[k], PROFILE_MAX[k] || 200);
    const files = await this.listAppFiles('profil');
    const own = files.filter((f) => f.ownedByMe).sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0];
    if (own) {
      await drive.updateFile(own.id, { description: JSON.stringify(data) });
    } else {
      const f = await this.createOwnFile('profil', data, {}, 'Mein Profil (Mitglieder-App).json');
      // nicht sichtbar gewählt (E40): das neue Profil bleibt privat
      if ((await this.myVisibility()) === false) await this.unshareOwnFile(f.id);
    }
    this.invalidate('profiles');
  }

  /* ================================================================ Sichtbarkeit in der App (E40) */

  /** Alle für mich lesbaren Sichtbarkeits-Dateien (eigene und die der anderen Mitglieder) */
  async visibilityFiles() {
    return this.cached('visibility', 60_000, () => this.listAppFiles('sichtbarkeit'));
  }

  async ownVisibilityFile() {
    const files = await this.listAppFiles('sichtbarkeit');
    return files.filter((f) => f.ownedByMe).sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0] || null;
  }

  /** Eigene Wahl laut eigener Datei: true/false, null = noch keine Datei */
  async myVisibility() {
    const own = (await this.visibilityFiles().catch(() => [])).filter((f) => f.ownedByMe)
      .sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0];
    return own ? visibilityOf(own) : null;
  }

  /**
   * Eigene Sichtbarkeit speichern – als kleine Datei im eigenen Drive, für die Mitglieder lesbar: Daran erkennt die App
   * der anderen, dass ich die App nutze und ob sie mich anzeigen darf. Mein Profil ist nur freigegeben, solange ich sichtbar bin.
   */
  async saveMyVisibility(sichtbar) {
    const data = { sichtbar: !!sichtbar, geaendert: new Date().toISOString() };
    const props = { fbSichtbar: sichtbar ? 'ja' : 'nein' };
    const own = await this.ownVisibilityFile();
    const before = own ? visibilityOf(own) : null;
    if (own) await drive.updateFile(own.id, { description: JSON.stringify(data), appProperties: props });
    else await this.createOwnFile('sichtbarkeit', data, props, VISIBILITY_FILE);
    const profiles = (await this.listAppFiles('profil')).filter((f) => f.ownedByMe);
    for (const f of profiles) {
      if (!sichtbar) await this.unshareOwnFile(f.id);
      else if (before === false) await this.shareOwnFile(f.id);
    }
    this.invalidate('visibility');
    this.invalidate('profiles');
  }

  /** Lese-Freigaben einer eigenen Datei zurücknehmen (Gruppe, Domain, einzelne Konten); der Inhaber bleibt */
  async unshareOwnFile(fileId) {
    const perms = await drive.listPermissions(fileId);
    for (const p of perms) {
      if (p.role === 'owner' || String(p.emailAddress || '').toLowerCase() === this.myEmail) continue;
      try { await drive.deletePermission(fileId, p.id); } catch (e) { console.warn('Freigabe nicht entfernt', p, e); }
    }
  }

  /* ================================================================ Datenschutz-Einwilligungen */

  /** Eigene Einwilligungs-Datei (im eigenen Drive) oder null */
  async consentFile() {
    const files = await drive.listFiles(
      "appProperties has { key='fbTyp' and value='einwilligung' } and 'me' in owners and trashed = false",
      { fields: OWN_FIELDS, orderBy: 'modifiedTime desc' },
    );
    const own = files.filter((f) => f.ownedByMe).sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))[0] || null;
    if (own) registerOwnFile(own.id);
    return own;
  }

  /** Eigene Entscheidung (null = noch nie entschieden) */
  async getMyConsent() {
    const f = await this.consentFile();
    if (!f) return null;
    // Freigabe an die aktuellen Verantwortlichen anpassen (z. B. nach einem Wechsel im Vorstand)
    this.ensureConsentSharing(f.id, f.appProperties?.fbEmpf).catch((e) => console.warn('Freigabe der Einwilligung nicht angepasst', e));
    const rec = { ...parseJson(f.description), fileId: f.id, geaendert: f.modifiedTime };
    // Sichtbarkeit nachziehen, falls die eigene Datei fehlt oder abweicht (z. B. nach einem Fehler beim Speichern)
    if (typeof rec.sichtbar === 'boolean') {
      this.myVisibility().then((v) => (v === rec.sichtbar ? null : this.saveMyVisibility(rec.sichtbar)))
        .catch((e) => console.warn('Sichtbarkeit nicht abgeglichen', e));
    }
    return rec;
  }

  /** Entscheidung speichern – als eigene Datei im eigenen Drive (Inhalt und Beschreibung) */
  async saveMyConsent(decisions) {
    const f = await this.consentFile();
    const rec = buildRecord(f ? parseJson(f.description) : null, decisions, this.user);
    const meta = {
      description: JSON.stringify(rec),
      appProperties: { fbTyp: 'einwilligung', fbVz: ja(rec.vereinszwecke), fbDv: ja(rec.dachverband), fbFassung: rec.fassung },
      properties: { fbTyp: 'einwilligung' },
    };
    const content = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
    let id = f?.id;
    if (f) {
      await drive.updateWithContent(f.id, meta, content);
    } else {
      const folder = await this.appFolder();
      const created = await drive.upload({ name: CONSENT_FILE, mimeType: 'application/json', parents: [folder], ...meta }, content, 'id,modifiedTime');
      registerOwnFile(created.id);
      id = created.id;
    }
    await this.ensureConsentSharing(id, f?.appProperties?.fbEmpf).catch((e) => console.warn('Freigabe der Einwilligung nicht möglich', e));
    if (typeof rec.sichtbar === 'boolean') await this.saveMyVisibility(rec.sichtbar).catch((e) => console.warn('Sichtbarkeit nicht gespeichert', e));
    this.invalidate('consents');
    return { ...rec, fileId: id };
  }

  /**
   * Einwilligung NUR für die Datenschutz-Verantwortlichen lesbar machen.
   * Frühere Empfänger und alle anderen Freigaben (Gruppe, Domain, Link) werden entfernt.
   */
  async ensureConsentSharing(fileId, currentKey) {
    const wanted = consentRecipients(this.myEmail);
    const key = pruefsumme(wanted.slice().sort().join(','));
    if (currentKey === key) return;
    const perms = await drive.listPermissions(fileId);
    const have = new Set(perms.filter((p) => p.type === 'user').map((p) => String(p.emailAddress || '').toLowerCase()));
    for (const email of wanted) {
      if (!have.has(email)) await drive.addPermission(fileId, { type: 'user', role: 'reader', emailAddress: email });
    }
    for (const p of perms) {
      const email = String(p.emailAddress || '').toLowerCase();
      if (p.role === 'owner' || email === this.myEmail) continue;
      if (p.type !== 'user' || !wanted.includes(email)) {
        try { await drive.deletePermission(fileId, p.id); } catch (e) { console.warn('Freigabe nicht entfernt', p, e); }
      }
    }
    await drive.updateFile(fileId, { appProperties: { fbEmpf: key } });
  }

  isConsentManager() {
    return isConsentManager(this.myEmail);
  }

  /** Alle Einwilligungen, die ich sehen darf (nur Verantwortliche bekommen fremde Dateien freigegeben) */
  async listConsents() {
    return this.cached('consents', 60_000, async () => {
      const files = await drive.listFiles("appProperties has { key='fbTyp' and value='einwilligung' } and trashed = false", { fields: OWN_FIELDS, orderBy: 'modifiedTime desc' });
      const newest = new Map();
      for (const f of files) {
        const owner = this.ownerOf(f);
        if (!owner.email) continue;
        const prev = newest.get(owner.email);
        if (!prev || String(f.modifiedTime) > String(prev.modifiedTime)) newest.set(owner.email, f);
      }
      return [...newest.entries()].map(([email, f]) => {
        const rec = parseJson(f.description);
        return {
          email,
          name: this.ownerOf(f).name || rec.name || email,
          vereinszwecke: rec.vereinszwecke,
          dachverband: rec.dachverband,
          sichtbar: rec.sichtbar,
          fassung: String(rec.fassung || ''),
          pruefsumme: rec.pruefsumme || '',
          zeitpunkt: rec.zeitpunkt || f.modifiedTime,
          erstmals: rec.erstmals || f.createdTime,
          geaendert: f.modifiedTime,
          verlauf: Array.isArray(rec.verlauf) ? rec.verlauf : [],
          fileId: f.id,
          link: `https://drive.google.com/file/d/${f.id}/view`,
          kontoAbweichend: !!rec.konto && String(rec.konto).toLowerCase() !== email,
        };
      });
    });
  }

  /** Die Sammeltabelle: eingetragen in config.js oder eine eigene, von der App angelegte */
  async consentTable() {
    return this.cached('consentTable', 10 * 60_000, async () => {
      let id = String(config.tabellen?.einwilligungen || '').trim();
      let f = null;
      if (id) {
        f = await drive.getFile(id, TABLE_FIELDS).catch(() => null);
      } else {
        const found = await drive.listFiles(`appProperties has { key='fbTyp' and value='${TABLE_TYPE}' } and 'me' in owners and trashed = false`, { fields: TABLE_FIELDS, orderBy: 'createdTime' });
        f = found.find((x) => x.ownedByMe) || null;
        id = f?.id || '';
      }
      if (!id) return null;
      // schreiben darf nur das Konto, dem die von der App angelegte Tabelle gehört
      const own = !!(f?.ownedByMe && f?.appProperties?.fbTyp === TABLE_TYPE);
      if (own) registerOwnTable(id);
      return {
        id, url: `https://docs.google.com/spreadsheets/d/${id}/edit`, own, owner: f ? this.ownerOf(f) : null,
        erreichbar: !!f, eingetragen: !!config.tabellen?.einwilligungen, empfKey: f?.appProperties?.fbEmpf || '',
      };
    });
  }

  /** Neue, leere Sammeltabelle im eigenen Drive (nicht in einem freigegebenen Ordner!) */
  async createConsentTable() {
    if (!this.isConsentManager()) throw new Error('Nur Admins bzw. Datenschutz-Verantwortliche können die Einwilligungsliste anlegen.');
    const existing = await this.consentTable();
    if (existing?.own) return existing;
    const f = await drive.createFile({ name: `${config.appName} – Einwilligungen (vertraulich)`, mimeType: SPREADSHEET, appProperties: { fbTyp: TABLE_TYPE } }, 'id,name');
    registerOwnTable(f.id);
    await prepareConsentSheet(f.id);
    for (const email of consentRecipients(this.myEmail)) {
      await drive.addPermission(f.id, { type: 'user', role: 'reader', emailAddress: email }).catch((e) => console.warn('Freigabe nicht möglich', email, e));
    }
    this.invalidate('consentTable');
    return this.consentTable();
  }

  /** Sammeltabelle auf den aktuellen Stand bringen (nur im Konto, dem sie gehört) */
  async syncConsentTable() {
    this.invalidate('consents');
    const t = await this.consentTable();
    if (!t) throw new Error('Es ist noch keine Einwilligungsliste eingerichtet.');
    if (!t.own) throw new Error(`Die Einwilligungsliste führt das Konto ${t.owner?.email || 'der Datenschutz-Verantwortlichen'} – nur dort kann die App sie aktualisieren.`);
    const [consents, members] = await Promise.all([this.listConsents(), this.listMembers().catch(() => [])]);
    const result = await syncConsentSheet(t.id, { consents, members });
    // Lesezugriff für die aktuellen Verantwortlichen (und nur für sie)
    if (t.empfKey !== pruefsumme(consentRecipients(this.myEmail).sort().join(','))) {
      await this.ensureConsentSharing(t.id, t.empfKey).catch((e) => console.warn('Freigabe der Einwilligungsliste nicht angepasst', e));
      this.invalidate('consentTable');
    }
    return result;
  }

  /** Beim Öffnen der App durch die Verantwortlichen: höchstens alle 15 Minuten still abgleichen */
  async autoSyncConsents() {
    if (!this.isConsentManager()) return null;
    const key = `fb.einwilligungSync.${this.myEmail}`;
    let last = 0;
    try { last = Number(localStorage.getItem(key) || 0); } catch { /* egal */ }
    if (Date.now() - last < 15 * 60_000) return null;
    const t = await this.consentTable();
    if (!t?.own) return null;
    try { localStorage.setItem(key, String(Date.now())); } catch { /* egal */ }
    return this.syncConsentTable();
  }

  /* ================================================================ Termine (lesen + eigene Antwort) */

  async listEvents({ from, to }) {
    // Antworten aus der App: zu Terminen im Zeitraum, abgegeben höchstens 120 Tage vorher
    const since = new Date(from.getTime() - 120 * 86400_000).toISOString();
    const [res, answers] = await Promise.all([
      cal.listEvents(this.calendarId(), { timeMin: from.toISOString(), timeMax: to.toISOString() }),
      this.appResponses({ since }).catch(() => new Map()),
    ]);
    const events = res.items.filter((e) => e.status !== 'cancelled').map((e) => this.mapEvent(e, answers.get(terminKey(e.id))));
    return { events, canEdit: false, calendarName: res.summary };
  }

  async getEvent(id) {
    const answersP = this.appResponses({ eventId: id }).catch(() => new Map());
    let raw;
    try {
      raw = await cal.getEvent(this.calendarId(), id);
    } catch (e) {
      if (e.status !== 404) throw e;
      raw = await cal.getEvent('primary', id).catch(() => { throw e; });
    }
    return this.mapEvent(raw, (await answersP).get(terminKey(id)));
  }

  /**
   * Zu-/Absagen, die über die App ohne Einladung abgegeben wurden: je Mitglied und Termin eine kleine
   * eigene Datei (fbTyp=zusage). Wer geantwortet hat, bestimmt der Dateieigentümer laut Google.
   * Liefert Map Terminschlüssel → Map E-Mail → Antwort (je Mitglied die neueste).
   */
  async appResponses({ eventId, since } = {}) {
    let q = "appProperties has { key='fbTyp' and value='zusage' } and trashed = false";
    if (eventId) q += ` and appProperties has { key='fbTermin' and value='${terminKey(eventId)}' }`;
    if (since) q += ` and modifiedTime > '${since}'`;
    const files = await this.queryAppFiles(q);
    const hidden = new Set((config.ausgeblendeteKonten || []).map((e) => String(e).toLowerCase()));
    const out = new Map();
    for (const f of files) {
      const owner = this.ownerOf(f);
      const key = f.appProperties?.fbTermin;
      const d = parseJson(f.description);
      if (!owner.email || hidden.has(owner.email) || !key || !ANTWORTEN.includes(d.status)) continue;
      if (!out.has(key)) out.set(key, new Map());
      const prev = out.get(key).get(owner.email);
      if (prev && String(prev.time) > String(f.modifiedTime)) continue;
      out.get(key).set(owner.email, {
        email: owner.email, name: owner.name, status: d.status, guests: Math.max(0, Math.min(9, Number(d.gaeste) || 0)),
        comment: clip(d.kommentar, 200), time: f.modifiedTime, source: 'app',
      });
    }
    return out;
  }

  async canEditEvents() {
    return false;
  }

  mapEvent(e, appAnswers = null) {
    const me = this.myEmail;
    const group = String(config.mitgliederGruppe || '').toLowerCase();
    const calId = String(config.kalenderId || '').toLowerCase();
    const props = e.extendedProperties?.shared || {};
    const allDay = !!e.start?.date;
    const attendees = [];
    let groupInvited = false;
    for (const a of e.attendees || []) {
      const email = String(a.email || '').toLowerCase();
      if (a.resource) continue;
      if (group && email === group) { groupInvited = true; continue; }
      if (email === calId) continue;
      attendees.push({ email, name: a.displayName || '', status: a.responseStatus || 'needsAction', guests: a.additionalGuests || 0, comment: a.comment || '', source: 'calendar' });
    }
    // eingeladen = laut Google Kalender (persönlich oder über die Mitglieder-Gruppe)
    const invited = attendees.some((a) => a.email === me) || groupInvited;
    // Antworten aus der App ergänzen; eine offene Kalender-Antwort ersetzt die App-Antwort
    for (const r of appAnswers?.values() || []) {
      const cur = attendees.find((a) => a.email === r.email);
      if (!cur) attendees.push({ ...r });
      else if (cur.status === 'needsAction') Object.assign(cur, { status: r.status, guests: r.guests, comment: r.comment, source: 'app' });
    }
    const mine = attendees.find((a) => a.email === me);
    const meta = parseEventMeta(stripAppLink(htmlToText(e.description || '')));
    return {
      id: e.id,
      title: e.summary || '(ohne Titel)',
      description: meta.text,
      location: e.location || '',
      start: allDay ? e.start.date : e.start.dateTime,
      end: allDay ? e.end.date : e.end.dateTime,
      allDay,
      htmlLink: e.htmlLink || '',
      iCalUID: e.iCalUID || '',
      recurring: !!e.recurringEventId,
      category: props.fbKategorie || meta.kategorie || guessCategory(e.summary),
      dresscode: props.fbKleidung || meta.kleidung,
      mandatory: props.fbPflicht === '1' || meta.pflicht,
      attendees,
      // zu- oder absagen kann jedes Mitglied – ohne Einladung über die App (rsvpViaApp)
      myStatus: mine?.status || 'needsAction',
      myGuests: mine?.guests || 0,
      myComment: mine?.comment || '',
      invited,
      groupInvited,
      canEdit: false,
    };
  }

  /**
   * Eigene Zu-/Absage. Eingeladen: im EIGENEN Kalender (calendars/primary) – Google überträgt die
   * Antwort an den Termin, genau wie beim Antworten in Google Kalender. Nicht eingeladen: als eigene
   * Datei im eigenen Drive (rsvpViaApp). Der Kalender der Verbindung wird in keinem Fall geändert.
   */
  async rsvp(eventId, { status, guests, comment, title = '', start = '' } = {}) {
    let own = null;
    try {
      own = await cal.getEvent('primary', eventId);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
    if (!own) return this.rsvpViaApp(eventId, { status, guests, comment, title, start });
    const me = this.myEmail;
    const attendees = (own.attendees || []).map((a) => ({ ...a }));
    let mine = attendees.find((a) => a.self || String(a.email).toLowerCase() === me);
    if (!mine) {
      mine = { email: this.user.email };
      attendees.push(mine);
    }
    mine.responseStatus = status;
    if (guests !== undefined) mine.additionalGuests = Math.max(0, Math.min(9, Number(guests) || 0));
    if (comment !== undefined) mine.comment = clip(comment, 200);
    await cal.patchEvent('primary', eventId, { attendees }, 'none');
    return { via: 'calendar' };
  }

  /** Zu-/Absage ohne Einladung: eigene kleine Datei im eigenen App-Ordner, für Mitglieder nur lesbar */
  async rsvpViaApp(eventId, { status, guests, comment, title, start }) {
    if (!ANTWORTEN.includes(status)) throw new Error('Unbekannte Antwort');
    const key = terminKey(eventId);
    const found = await drive.listFiles(
      `appProperties has { key='fbTyp' and value='zusage' } and appProperties has { key='fbTermin' and value='${key}' } and 'me' in owners and trashed = false`,
      { fields: OWN_FIELDS, orderBy: 'modifiedTime desc' },
    );
    const file = found.find((f) => f.ownedByMe);
    const prev = file ? parseJson(file.description) : {};
    const data = {
      termin: String(eventId),
      titel: clip(title || prev.titel, 140),
      beginn: String(start || prev.beginn || ''),
      status,
      gaeste: guests !== undefined ? Math.max(0, Math.min(9, Number(guests) || 0)) : (Number(prev.gaeste) || 0),
      kommentar: comment !== undefined ? clip(comment, 200) : clip(prev.kommentar, 200),
      zeitpunkt: new Date().toISOString(),
    };
    if (file) {
      registerOwnFile(file.id);
      await drive.updateFile(file.id, { description: JSON.stringify(data) });
    } else {
      await this.createOwnFile('zusage', data, { fbTermin: key }, `Zusage – ${clip(data.titel, 80) || 'Termin'}.json`);
    }
    return { via: 'app' };
  }

  calendarInfo() {
    return { calendarId: config.kalenderId || '', name: config.appName };
  }

  /* ================================================================ News (nur lesen) */

  /**
   * News = Zeilen der Tabelle „News“ (falls eingetragen) + Beiträge, die Admins bzw. die Redaktion in der
   * App geschrieben haben (eigene Dateien, fbTyp=news). Die Tabelle wird nur gelesen.
   */
  async listNews() {
    let sheetError = null;
    const [fromSheet, fromApp] = await Promise.all([
      config.tabellen?.news
        ? sheets.readTable(this.sheetId('news'), SHEETS.news, NEWS_SCHEMA).then((t) => newsFromRows(t.items)).catch((e) => { sheetError = e; return []; })
        : Promise.resolve([]),
      this.appNews(),
    ]);
    if (sheetError && !fromApp.length) throw sheetError;
    return sortNews([...fromApp, ...fromSheet]);
  }

  /** In der App geschriebene News – nur von Admins/Redaktion; wer geschrieben hat, sagt Google (Dateieigentümer) */
  async appNews() {
    const files = await this.cached('appNews', 60_000, () => this.listAppFiles('news'));
    const out = [];
    for (const f of files) {
      const owner = this.ownerOf(f);
      if (!isNewsAuthorEmail(owner.email)) continue;
      const d = parseJson(f.description);
      const title = clip(d.titel, 140);
      if (!title) continue;
      out.push({
        id: f.id,
        source: 'app',
        own: !!f.ownedByMe,
        date: String(d.datum || f.createdTime || ''),
        title,
        text: clip(d.text, MAX_NEWS_LENGTH),
        image: clip(d.bild, 300),
        category: clip(d.kategorie, 60),
        pinned: !!d.angeheftet,
        authorEmail: owner.email,
        authorName: owner.name,
        edited: String(d.bearbeitet || ''),
      });
    }
    return out;
  }

  async canEditNews() {
    return isNewsAuthorEmail(this.myEmail);
  }

  newsData({ title, text, category, pinned, image }) {
    const titel = clip(title, 140);
    if (!titel) throw new Error('Bitte einen Titel eingeben.');
    const t = String(text || '').trim();
    if (t.length > MAX_NEWS_LENGTH) throw new Error(`Der Text ist zu lang (höchstens ${MAX_NEWS_LENGTH} Zeichen).`);
    return { titel, text: t, kategorie: clip(category, 60), angeheftet: !!pinned, bild: clip(image, 300) };
  }

  /** News schreiben: eigene Datei im eigenen App-Ordner, für Mitglieder nur lesbar (wie im Forum) */
  async createNews(fields) {
    if (!(await this.canEditNews())) throw new Error('News schreiben dürfen nur Admins und die Redaktion.');
    const data = { ...this.newsData(fields), datum: isoLocal(new Date()) };
    const f = await this.createOwnFile('news', data, { fbKategorie: data.kategorie }, `News – ${clip(data.titel, 80)}.json`);
    this.invalidate('appNews');
    return f.id;
  }

  async updateNews(id, fields) {
    const f = (await this.listAppFiles('news')).find((x) => x.id === id);
    if (!f || !f.ownedByMe) throw new Error('Nur eigene News können bearbeitet werden.');
    const prev = parseJson(f.description);
    const data = { ...prev, ...this.newsData(fields), datum: prev.datum || isoLocal(new Date()), bearbeitet: nowIso() };
    await drive.updateFile(id, { description: JSON.stringify(data), name: `News – ${clip(data.titel, 80)}.json`, appProperties: { fbKategorie: data.kategorie } });
    // ein ersetztes eigenes Bild aufräumen
    if (prev.bild && prev.bild !== data.bild) await this.trashOwnNewsImage(prev.bild);
    this.invalidate('appNews');
  }

  async deleteNews(id) {
    const f = (await this.listAppFiles('news')).find((x) => x.id === id);
    if (!f || !f.ownedByMe) throw new Error('Nur eigene News können gelöscht werden.');
    await drive.trashFile(id);
    await this.trashOwnNewsImage(parseJson(f.description).bild);
    this.invalidate('appNews');
  }

  /** Foto für eine News: verkleinert (längste Seite 1600 px, JPEG) im eigenen App-Ordner, für Mitglieder lesbar */
  async uploadNewsImage(file) {
    if (!(await this.canEditNews())) throw new Error('News schreiben dürfen nur Admins und die Redaktion.');
    const blob = await resizeImage(file, 1600, 0.85);
    if (!blob) throw new Error('Das Bild konnte nicht gelesen werden.');
    const folder = await this.appFolder();
    const name = `News-Bild – ${clip(String(file.name || 'Foto').replace(/\.[a-z0-9]{2,5}$/i, ''), 60)}.jpg`;
    const f = await drive.upload({ name, mimeType: 'image/jpeg', parents: [folder], appProperties: { fbTyp: 'newsbild' } }, blob, 'id');
    registerOwnFile(f.id);
    await this.shareOwnFile(f.id);
    return `drive:${f.id}`;
  }

  /** Eigenes, von der App hochgeladenes News-Bild in den Papierkorb (fremde Bilder bleiben unberührt) */
  async trashOwnNewsImage(ref) {
    const id = driveIdFrom(ref);
    if (!id) return;
    const own = (await this.listAppFiles('newsbild').catch(() => [])).find((x) => x.id === id && x.ownedByMe);
    if (own) await drive.trashFile(id).catch((e) => console.warn('News-Bild nicht gelöscht', e));
  }

  newsSheetUrl() {
    return config.tabellen?.news ? `https://docs.google.com/spreadsheets/d/${config.tabellen.news}/edit` : '';
  }

  async imageUrl(ref) {
    if (!ref) return '';
    const driveId = driveIdFrom(ref);
    if (!driveId) return /^https?:\/\//.test(ref) ? ref : '';
    if (this.blobUrls.has(driveId)) return this.blobUrls.get(driveId);
    const blob = await drive.downloadBlob(driveId);
    const url = URL.createObjectURL(blob);
    this.blobUrls.set(driveId, url);
    return url;
  }

  /* ================================================================ Forum (eigene Beiträge) */

  forumEnabled() {
    return config.forum?.aktiv !== false;
  }

  async forumFiles() {
    return this.cached('forum', 30_000, () => this.listAppFiles('forum'));
  }

  async listForum() {
    const files = await this.forumFiles();
    const threadRows = [];
    const postRows = [];
    for (const f of files) {
      const p = f.appProperties || {};
      const data = parseJson(f.description);
      const owner = this.ownerOf(f);
      const edited = data.bearbeitet || '';
      if (p.fbRolle === 'thema') {
        threadRows.push({ id: f.id, kategorie: p.fbKategorie || 'Allgemeines', titel: clip(data.titel, 140) || '(ohne Titel)', autorEmail: owner.email, autorName: owner.name, erstellt: f.createdTime });
        postRows.push({ id: f.id, themaId: f.id, autorEmail: owner.email, autorName: owner.name, erstellt: f.createdTime, text: clip(data.text, MAX_POST_LENGTH), bearbeitet: edited });
      } else if (p.fbRolle === 'antwort' && p.fbThema) {
        postRows.push({ id: f.id, themaId: p.fbThema, autorEmail: owner.email, autorName: owner.name, erstellt: f.createdTime, text: clip(data.text, MAX_POST_LENGTH), bearbeitet: edited });
      }
    }
    const forum = buildForum(threadRows, postRows);
    const ids = new Set(forum.threads.map((t) => t.id));
    forum.posts = forum.posts.filter((p) => ids.has(p.threadId));
    for (const p of forum.posts) p.own = isOwnFile(p.id);
    for (const t of forum.threads) t.own = isOwnFile(t.id);
    return forum;
  }

  checkText(text) {
    const t = String(text || '').trim();
    if (!t) throw new Error('Bitte einen Text eingeben.');
    if (t.length > MAX_POST_LENGTH) throw new Error(`Der Beitrag ist zu lang (höchstens ${MAX_POST_LENGTH} Zeichen).`);
    return t;
  }

  async createThread({ category, title, text }) {
    if (!this.forumEnabled()) throw new Error('Das Forum ist ausgeschaltet.');
    const f = await this.createOwnFile('forum', { titel: clip(title, 140), text: this.checkText(text) },
      { fbRolle: 'thema', fbKategorie: clip(category, 60) }, `Forum – ${clip(title, 80)}.json`);
    this.invalidate('forum');
    return f.id;
  }

  async reply(threadId, text) {
    if (!this.forumEnabled()) throw new Error('Das Forum ist ausgeschaltet.');
    await this.createOwnFile('forum', { text: this.checkText(text) }, { fbRolle: 'antwort', fbThema: threadId }, 'Forum – Antwort.json');
    this.invalidate('forum');
  }

  async editPost(postId, text) {
    const files = await this.listAppFiles('forum');
    const f = files.find((x) => x.id === postId);
    if (!f || !f.ownedByMe) throw new Error('Nur eigene Beiträge können bearbeitet werden.');
    const data = parseJson(f.description);
    await drive.updateFile(postId, { description: JSON.stringify({ ...data, text: this.checkText(text), bearbeitet: nowIso() }) });
    this.invalidate('forum');
  }

  async deletePost(postId) {
    const files = await this.listAppFiles('forum');
    const f = files.find((x) => x.id === postId);
    if (!f || !f.ownedByMe) throw new Error('Nur eigene Beiträge können gelöscht werden.');
    await drive.trashFile(postId);
    this.invalidate('forum');
  }

  /** Eigenes Thema löschen (= eigenen ersten Beitrag in den Papierkorb) */
  async deleteThread(threadId) {
    return this.deletePost(threadId);
  }

  /* ================================================================ Adressen (nur lesen) */

  async loadAddresses() {
    const id = this.sheetId('adressen');
    const meta = await this.cached(`addrMeta:${id}`, 3600_000, () => sheets.getMeta(id));
    const tab = addressTab(meta);
    const rows = await sheets.getValues(id, `${sheets.quoteSheet(tab)}!A1:AZ`, { render: 'FORMATTED_VALUE' });
    const result = addressesFromRows(rows);
    result.sheetUrl = `https://docs.google.com/spreadsheets/d/${id}/edit`;
    result.title = meta.properties?.title || '';
    result.tab = tab;
    return result;
  }

  async listAddresses() {
    const res = await this.loadAddresses();
    this.memo.set(this.addressKey(), { t: Date.now(), p: Promise.resolve(res) });
    return res;
  }

  /* ================================================================ Zeitung (nur lesen) */

  /** Liegt ein Ordner in einer geteilten Ablage, gezielt dort suchen (so empfiehlt es Google) */
  folderScope(folderId) {
    return this.cached(`scope:${folderId}`, 24 * 3600_000, async () => {
      const f = await drive.getFile(folderId, 'id,driveId').catch(() => null);
      return f?.driveId ? { corpora: 'drive', driveId: f.driveId } : {};
    });
  }

  /** Ausgaben einer Zeitung: quelle 'bundesbote' (Standard) oder 'ds' (DS-Zeitung), siehe ZEITUNGEN */
  async listIssues(quelle = 'bundesbote') {
    const z = ZEITUNGEN[quelle];
    const folder = (config[z.ordner] || '').trim();
    if (!folder) throw notConfigured(z.name);
    // auch Jahresordner („2019“, „Archiv/2003“): bis zwei Ebenen tief
    const { files } = await drive.listTree(folder, {
      depth: 2, filter: "mimeType = 'application/pdf'", fields: drive.FILE_FIELDS, orderBy: 'name desc', ...(await this.folderScope(folder)),
    });
    return sortIssues(files.map((f) => ({ ...issueFromFile(f), quelle })));
  }

  loadIssue(issue, onProgress) {
    return this.keptFile('fb-zeitung', ZEITUNGEN[issue.quelle || 'bundesbote'].prefix, issue, onProgress);
  }

  issueOpenUrl(issue) {
    return issue.webViewLink || `https://drive.google.com/file/d/${issue.id}/view`;
  }

  /** Adresse einer auf dem Gerät behaltenen Datei im Cache-Speicher (neue Fassung = neuer Schlüssel) */
  keptKey(prefix, f) {
    return `https://fb-cache.local/${prefix}/${f.id}?v=${encodeURIComponent(f.version || '')}`;
  }

  /** Datei herunterladen und auf dem Gerät behalten, damit sie auch offline lesbar ist; ältere Fassungen fliegen raus */
  async keptFile(cacheName, prefix, f, onProgress) {
    const key = this.keptKey(prefix, f);
    let cache = null;
    try {
      cache = await caches.open(cacheName);
      const hit = await cache.match(key);
      if (hit) return await hit.arrayBuffer();
    } catch { cache = null; }
    onProgress?.('download');
    const buf = await drive.download(f.id);
    if (cache) {
      try {
        for (const req of await cache.keys()) {
          if (req.url.includes(`/${prefix}/${f.id}?`) && req.url !== key) await cache.delete(req);
        }
        await cache.put(key, new Response(buf.slice(0), { headers: { 'Content-Type': f.mimeType || 'application/pdf' } }));
      } catch { /* Speicher voll – egal */ }
    }
    return buf;
  }

  /* ================================================================ Liedermappe (nur lesen) */

  async listSongs() {
    const folder = (config.liedermappeOrdnerId || '').trim();
    if (!folder) throw notConfigured('Der Ordner der Liedermappe');
    // Rubriken als Unterordner („Kommerslieder“, „Volkslieder/Wanderlieder“): bis drei Ebenen tief
    const { files } = await drive.listTree(folder, {
      depth: 3, filter: `mimeType != '${drive.FOLDER}'`, fields: drive.FILE_FIELDS, orderBy: 'name', ...(await this.folderScope(folder)),
    });
    const songs = files.filter(isSongFile);
    return { songs: sortSongs(songs.map(songFromFile)), other: files.length - songs.length, folderUrl: `https://drive.google.com/drive/folders/${folder}` };
  }

  loadSong(song, onProgress) {
    return this.keptFile('fb-lieder', 'lieder', song, onProgress);
  }

  songOpenUrl(song) {
    return song.webViewLink || `https://drive.google.com/file/d/${song.id}/view`;
  }

  /** IDs der Lieder, die schon auf diesem Gerät liegen (auch ohne Netz lesbar) */
  async songsOffline(songs) {
    try {
      const cache = await caches.open('fb-lieder');
      const keys = new Set((await cache.keys()).map((r) => r.url));
      return new Set(songs.filter((s) => keys.has(this.keptKey('lieder', s))).map((s) => s.id));
    } catch {
      return new Set();
    }
  }

  /* ================================================================ Galerie (nur lesen) */

  async listGallery() {
    const folder = (config.galerieOrdnerId || '').trim();
    if (!folder) throw notConfigured('Der Galerie-Ordner');
    // Alben = Ordner mit Fotos, auch verschachtelt („2023/Stiftungsfest“): bis zwei Ebenen tief
    const { files, folders } = await drive.listTree(folder, {
      depth: 2, filter: "mimeType contains 'image/'", fields: GALLERY_FIELDS, orderBy: 'name', ...(await this.folderScope(folder)),
    });
    const toPhoto = (f) => ({
      id: f.id,
      name: f.name,
      thumb: f.thumbnailLink || '',
      width: f.imageMediaMetadata?.width || 0,
      height: f.imageMediaMetadata?.height || 0,
      taken: exifToIso(f.imageMediaMetadata?.time) || f.createdTime || '',
      webViewLink: f.webViewLink || '',
    });
    const byFolder = new Map();
    for (const f of files) {
      if (!byFolder.has(f.parentId)) byFolder.set(f.parentId, []);
      byFolder.get(f.parentId).push(f);
    }
    const albums = [];
    const loose = byFolder.get(folder) || [];
    if (loose.length) albums.push({ id: folder, title: 'Allgemein', path: [], photos: loose.map(toPhoto) });
    for (const s of folders) {
      const list = byFolder.get(s.id) || [];
      // path = übergeordnete Ordner (z. B. ["2023"]), title = Name des Albums selbst
      if (list.length) albums.push({ id: s.id, title: s.name, path: s.path.slice(0, -1), photos: list.map(toPhoto), modified: s.modifiedTime });
    }
    // neueste Alben zuerst (Ordnernamen wie „2026-06 Stiftungsfest“ oder Jahresordner sortieren sich von selbst)
    const sortKey = (a) => [...(a.path || []), a.title].join(' ');
    albums.sort((a, b) => sortKey(b).localeCompare(sortKey(a), 'de', { numeric: true }));
    return { albums, folderUrl: `https://drive.google.com/drive/folders/${folder}` };
  }

  photoUrl(photo, size = 600) {
    if (!photo.thumb) return '';
    return /=s\d+(-c)?$/.test(photo.thumb) ? photo.thumb.replace(/=s\d+(-c)?$/, `=s${size}`) : `${photo.thumb}=s${size}`;
  }

  async photoFullUrl(photo) {
    if (this.blobUrls.has(photo.id)) return this.blobUrls.get(photo.id);
    const blob = await drive.downloadBlob(photo.id);
    const url = URL.createObjectURL(blob);
    this.blobUrls.set(photo.id, url);
    return url;
  }

  /* ================================================================ Chat (eigene Nachrichten, neue Unterhaltungen mit Personen) */

  chatStatus() {
    if (config.chat?.aktiv === false) return { available: false, reason: 'disabled' };
    if (!this.isWorkspace) return { available: false, reason: 'no-workspace' };
    if (!hasScope(SCOPE_CHAT_MSG) || !hasScope(SCOPE_CHAT_READ)) return { available: false, reason: 'scope' };
    return { available: true, canCreate: this.chatCanCreate() };
  }

  /** Direktnachrichten und Gruppen anlegen, Personen hinzufügen – braucht eine zusätzliche Zustimmung (E30) */
  chatCanCreate() {
    return this.isWorkspace && hasScope(SCOPE_CHAT_CREATE) && hasScope(SCOPE_CHAT_MEMBERS);
  }

  chatScopeError() {
    return Object.assign(new Error('Für neue Unterhaltungen braucht die App einmalig deine Zustimmung bei Google.'), { code: 'chat_scope' });
  }

  rememberChatName(spaceId, info) {
    const names = local.get(CHAT_NAMES, {});
    names[spaceId] = info;
    local.set(CHAT_NAMES, names);
  }

  /** Personen einer Unterhaltung (über das Verzeichnis aufgelöst, ohne Chat-Apps) */
  async spaceMembers(spaceId, dir = null) {
    if (!hasScope(SCOPE_CHAT_MEMBERS)) return [];
    const d = dir || await this.dirMap();
    const list = await this.cached(`members:${spaceId}`, 5 * 60_000, () => chat.listMembers(spaceId));
    return list
      .filter((m) => (m.member?.type || 'HUMAN') === 'HUMAN' && String(m.member?.name || '').startsWith('users/'))
      .map((m) => {
        const uid = m.member.name.replace('users/', '');
        const p = d.get(uid) || [...d.values()].find((x) => x.email === uid.toLowerCase());
        return { id: p?.id || uid, email: p?.email || (uid.includes('@') ? uid.toLowerCase() : ''), name: p?.name || m.member.displayName || 'Mitglied', photo: p?.photo || '' };
      });
  }

  /** Öffnet die Direktnachricht mit einem Mitglied – gibt es sie noch nicht, wird sie angelegt */
  async openDirectChat(email, name = '') {
    if (!this.chatCanCreate()) throw this.chatScopeError();
    const e = String(email || '').toLowerCase().trim();
    if (!e || e === this.myEmail) throw new Error('Bitte eine andere Person wählen.');
    let s = null;
    try {
      s = await chat.findDirectMessage(e);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    if (!s?.name) {
      s = await chat.setupSpace({
        space: { spaceType: 'DIRECT_MESSAGE', singleUserBotDm: false },
        memberships: [{ member: { name: `users/${e}`, type: 'HUMAN' } }],
      });
    }
    this.rememberChatName(s.name, { name: name || e, email: e });
    return { id: s.name, url: chat.spaceUrl(s.name) };
  }

  /** Neue Gruppe: mit Namen als Raum (SPACE), ohne Namen als Gruppenunterhaltung (GROUP_CHAT) */
  async createGroup({ name = '', emails = [] } = {}) {
    if (!this.chatCanCreate()) throw this.chatScopeError();
    const people = [...new Set(emails.map((x) => String(x).toLowerCase().trim()).filter((x) => x && x !== this.myEmail))];
    const title = clip(name, 128);
    if (!people.length) throw new Error('Bitte mindestens eine Person auswählen.');
    if (!title && people.length < 2) throw new Error('Für eine Gruppe ohne Namen bitte mindestens zwei Personen auswählen – oder einen Namen eingeben.');
    if (people.length > 49) throw new Error('Höchstens 49 Personen auf einmal – weitere später hinzufügen.');
    let s;
    try {
      s = await chat.setupSpace({
        space: title ? { spaceType: 'SPACE', displayName: title } : { spaceType: 'GROUP_CHAT' },
        memberships: people.map((e) => ({ member: { name: `users/${e}`, type: 'HUMAN' } })),
      });
    } catch (err) {
      if (err.status === 409) throw new Error(`Einen Raum „${title}“ gibt es schon – bitte einen anderen Namen wählen.`);
      throw err;
    }
    if (!title) this.rememberChatName(s.name, { name: 'Gruppe' });
    return { id: s.name, name: title, url: chat.spaceUrl(s.name) };
  }

  /** Personen zu einer Unterhaltung hinzufügen, in der man selbst ist (ob man das darf, entscheidet Google) */
  async addMembers(spaceId, emails = []) {
    if (!this.chatCanCreate()) throw this.chatScopeError();
    const out = { added: [], already: [], failed: [] };
    for (const e of [...new Set(emails.map((x) => String(x).toLowerCase().trim()).filter(Boolean))]) {
      try {
        await chat.addMember(spaceId, { name: `users/${e}`, type: 'HUMAN' });
        out.added.push(e);
      } catch (err) {
        if (err.status === 409) out.already.push(e);
        else out.failed.push({ email: e, error: err.message });
      }
    }
    this.invalidate(`members:${spaceId}`);
    return out;
  }

  async listSpaceMembers(spaceId) {
    return this.spaceMembers(spaceId);
  }

  async dirMap() {
    const dir = await this.directory().catch(() => []);
    const map = new Map();
    for (const p of dir) map.set(p.id, p);
    return map;
  }

  /**
   * Eigene Google-Konto-ID (= „users/{id}“ in Google Chat) – aus der Anmeldung, sonst aus dem Verzeichnis,
   * sonst aus dem Google-Profil. So erkennt die App eigene Nachrichten auch ohne Kontaktfreigabe.
   */
  async myId() {
    if (this.user.id) return this.user.id;
    return this.cached('myId', 24 * 3600_000, async () => {
      const dir = await this.dirMap();
      const hit = [...dir.values()].find((p) => p.email === this.myEmail)?.id;
      if (hit) return hit;
      const info = await people.userinfo().catch(() => null);
      return String(info?.sub || '');
    });
  }

  /** Räume, Gruppen und Direktnachrichten, in denen ich Mitglied bin – mit Namen der anderen */
  async listSpaces() {
    const [spaces, dir, myId] = await Promise.all([chat.listSpaces(), this.dirMap(), this.myId()]);
    const names = local.get(CHAT_NAMES, {});
    const rows = await Promise.all(spaces.map(async (s) => {
      const type = s.spaceType || (s.type === 'DM' ? 'DIRECT_MESSAGE' : s.type === 'ROOM' ? 'SPACE' : s.type) || '';
      const base = { id: s.name, type, lastActive: s.lastActiveTime || s.createTime || '', url: chat.spaceUrl(s.name), description: s.spaceDetails?.description || '' };
      if (type === 'SPACE') return (s.displayName || '').trim() ? { ...base, name: s.displayName } : null;
      if ((type !== 'DIRECT_MESSAGE' && type !== 'GROUP_CHAT') || s.singleUserBotDm) return null;
      const others = (await this.spaceMembers(s.name, dir).catch(() => [])).filter((p) => p.id !== myId && p.email !== this.myEmail);
      const hint = names[s.name];
      if (type === 'DIRECT_MESSAGE') {
        const p = others[0];
        return { ...base, name: p?.name || hint?.name || 'Direktnachricht', with: p?.email || hint?.email || '', photo: p?.photo || '' };
      }
      const first = others.map((p) => p.name.split(' ')[0]);
      const label = first.length > 3 ? `${first.slice(0, 3).join(', ')} und ${first.length - 3} weitere` : first.join(', ');
      return { ...base, name: label || hint?.name || 'Gruppe', members: others.map((p) => p.email) };
    }));
    return rows.filter(Boolean).sort((a, b) => String(b.lastActive).localeCompare(String(a.lastActive)));
  }

  async listMessages(spaceId, opts = {}) {
    const [msgs, dir, myId] = await Promise.all([chat.listMessages(spaceId, opts), this.dirMap(), this.myId()]);
    return msgs.map((m) => this.mapMessage(m, dir, myId));
  }

  /** Letzte Nachricht einer Unterhaltung (für die Hinweise auf Ungelesenes, E34) – oder null */
  async latestMessage(spaceId) {
    const [msgs, dir, myId] = await Promise.all([chat.listMessages(spaceId, { pageSize: 1 }), this.dirMap(), this.myId()]);
    const m = msgs[msgs.length - 1];
    return m ? this.mapMessage(m, dir, myId) : null;
  }

  async sendMessage(spaceId, text) {
    const [m, dir, myId] = await Promise.all([chat.createMessage(spaceId, text), this.dirMap(), this.myId()]);
    const msg = this.mapMessage(m, dir, myId);
    msg.mine = true;
    return msg;
  }

  mapMessage(m, dir, myId) {
    const uid = String(m.sender?.name || '').replace('users/', '');
    const person = dir.get(uid);
    return {
      id: m.name,
      text: m.text || (m.attachment?.length ? '📎 Anhang – in Google Chat ansehen' : ''),
      created: m.createTime,
      sender: !!myId && uid === myId
        ? { id: uid, name: this.user.name || 'Ich', photo: this.user.photo || '', email: this.myEmail }
        : { id: uid, name: person?.name || m.sender?.displayName || 'Mitglied', photo: person?.photo || '', email: person?.email || '' },
      mine: !!myId && uid === myId,
    };
  }

  async findDirectChat(email) {
    const s = await chat.findDirectMessage(email);
    return s?.name ? { id: s.name, url: chat.spaceUrl(s.name) } : null;
  }

  chatOpenUrl(space) {
    return space?.url || 'https://chat.google.com/';
  }
}

/** Aufnahmezeit aus Drive („2026:06:27 18:00:00“, EXIF-Format) → ISO */
export function exifToIso(t) {
  const m = String(t || '').match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : '';
}

export function driveIdFrom(ref) {
  const s = String(ref || '').trim();
  if (s.startsWith('drive:')) return s.slice(6);
  let m = s.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([-\w]{20,})/);
  if (m) return m[1];
  m = s.match(/^([-\w]{25,})$/);
  return m ? m[1] : '';
}
