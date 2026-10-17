// Gemeinsame Datenstrukturen und Hilfen für Demo- und Google-Modus
import { config } from '../config.js';
import { norm } from '../lib/text.js';
import { parseFlexibleDate, isoDate, isoLocal } from '../lib/dates.js';

/* ---------------------------------------------------------- Tabellenblätter */
export const SHEETS = {
  news: 'News',
  addresses: 'Adressen',
};

export const NEWS_SCHEMA = [
  { key: 'id', label: 'ID', required: true },
  { key: 'datum', label: 'Datum' },
  { key: 'titel', label: 'Titel', required: true },
  { key: 'text', label: 'Text' },
  { key: 'bild', label: 'Bild' },
  { key: 'kategorie', label: 'Kategorie' },
  { key: 'angeheftet', label: 'Angeheftet' },
  { key: 'autorEmail', label: 'Autor (E-Mail)' },
  { key: 'autorName', label: 'Autor (Name)' },
  { key: 'geloescht', label: 'Gelöscht' },
];

/** Kopfzeilen der Tabellen, die die Einrichtung anlegt */
export const SHEET_HEADERS = {
  [SHEETS.news]: NEWS_SCHEMA.map((f) => f.label),
  [SHEETS.addresses]: ['Nachname', 'Vorname', 'Kneipname', 'Status', 'Straße', 'PLZ', 'Ort', 'Land', 'Telefon',
    'Mobil', 'E-Mail', 'Geburtstag', 'Rezeption', 'Beruf'],
};

export const truthy = (v) => v === true || /^(ja|x|true|wahr|1|yes)$/i.test(String(v).trim());

/* ---------------------------------------------------------- Mitglieder */
// Selbst gepflegte Profilangaben (eigene Datei im eigenen Drive). Bewusst getrennt vom Adressverzeichnis,
// das der Schriftwart pflegt – siehe docs/ENTSCHEIDUNGEN.md.
export const PROFILE_FIELDS = ['kneipname', 'status', 'rezeption', 'studium', 'taetigkeit', 'wohnort', 'aemter', 'ueberMich',
  'angebot', 'telefon', 'instagram', 'linkedin'];

/** Höchstlänge je Profilfeld (Zeichen) */
export const PROFILE_MAX = { ueberMich: 1500, angebot: 1000 };

export function sortMembers(list) {
  return list.slice().sort((a, b) => norm(lastName(a.name)).localeCompare(norm(lastName(b.name))) || norm(a.name).localeCompare(norm(b.name)));
}

export function lastName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts[parts.length - 1] || '';
}

/* ---------------------------------------------------------- Termine */
export function guessCategory(title) {
  const t = norm(title);
  const rules = [
    [/kneipe|kommers|krambambuli/, 'Kneipe'],
    [/convent|\bcc\b|\bahc\b|generalversammlung|mitgliederversammlung/, 'Convent'],
    [/vortrag|referat|seminar|lesung|diskussion/, 'Vortrag'],
    [/fux|fuchs/, 'Fuxenstunde'],
    [/stammtisch/, 'Stammtisch'],
    [/sport|turnier|wander|kanu|kegel|ausflug|exkursion|huette|fahrt|spieleabend/, 'Sport & Freizeit'],
    [/arbeitseinsatz|hausputz|putz|renovier|garten|hausbau/, 'Haus'],
    [/stiftungsfest|ball|empfang|feier|fest|gottesdienst|jubilaeum/, 'Fest'],
  ];
  for (const [re, cat] of rules) if (re.test(t)) return cat;
  return 'Sonstiges';
}

/**
 * Zusatzangaben, die man direkt in Google Kalender in die Terminbeschreibung schreibt (je eine eigene Zeile):
 *   „Kategorie: Kneipe“ · „Kleidung: Vollcouleur“ · „Pflichttermin“ (oder „Pflicht: ja“)
 * Liefert die Angaben und die Beschreibung ohne diese Zeilen.
 */
export function parseEventMeta(text) {
  const meta = { kategorie: '', kleidung: '', pflicht: false };
  const known = (config.terminKategorien || []).map((k) => k.name);
  const rest = [];
  for (const line of String(text || '').split('\n')) {
    let m = line.match(/^\s*(?:kategorie|art)\s*:\s*(.+?)\s*$/i);
    const kat = m && known.find((n) => norm(n) === norm(m[1]));
    if (kat) { meta.kategorie = kat; continue; }
    m = line.match(/^\s*(?:kleidung|kleiderordnung|dresscode)\s*:\s*(.+?)\s*$/i);
    if (m) { meta.kleidung = m[1]; continue; }
    if (/^\s*pflicht(?:termin|veranstaltung)?\s*(?::\s*(?:ja|x|1)\s*)?[.!]?\s*$/i.test(line)) { meta.pflicht = true; continue; }
    rest.push(line);
  }
  return { ...meta, text: rest.join('\n').trim() };
}

const STATUS_ORDER = { accepted: 0, tentative: 1, declined: 2, needsAction: 3 };

/** Teilnehmerliste auswerten: Gruppen nach Antwort, Zählung inkl. Gäste */
export function summarizeAttendees(attendees) {
  const groups = { accepted: [], tentative: [], declined: [], needsAction: [] };
  for (const a of attendees) (groups[a.status] || groups.needsAction).push(a);
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => norm(a.name || a.email).localeCompare(norm(b.name || b.email)));
  const guests = groups.accepted.reduce((n, a) => n + (Number(a.guests) || 0), 0);
  return {
    groups,
    yes: groups.accepted.length,
    maybe: groups.tentative.length,
    no: groups.declined.length,
    open: groups.needsAction.length,
    guests,
    total: groups.accepted.length + guests,
  };
}

export function sortAttendees(list) {
  return list.slice().sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
}

/** Link zur App aus der Terminbeschreibung entfernen (wird separat angezeigt) */
export function stripAppLink(text) {
  return String(text || '')
    .replace(/\n*[—–-]{1,3}\s*\n?Zu-\s*\/?\s*Absage[^\n]*\n?\s*https?:\/\/\S+#\/termin\/\S+/gi, '')
    .replace(/\n*Zu-\s*\/?\s*Absage[^\n]*?:?\s*https?:\/\/\S+#\/termin\/\S+/gi, '')
    .replace(/\n*https?:\/\/\S+#\/termin\/\S+/g, '')
    .trim();
}

export function appLinkBlock(link) {
  return `\n\n—\nZu-/Absage und wer kommt – in der Mitglieder-App:\n${link}`;
}

/* ---------------------------------------------------------- Zeitung */
/** "2026-2 Verbindungszeitung SoSe 2026.pdf" → Jahr, Nummer, Titel */
export function issueFromFile(f) {
  const base = String(f.name || '').replace(/\.pdf$/i, '');
  const m = base.match(/^(\d{4})[-_ .](\d{1,2})\s*[-_ ]?\s*(.*)$/);
  let title = base;
  let year = null;
  let nr = null;
  if (m) {
    year = +m[1];
    nr = +m[2];
    title = m[3] || base;
  }
  title = title.replace(/[_]+/g, ' ').trim();
  return {
    id: f.id,
    name: f.name,
    title: f.description?.trim() || title,
    ausgabe: year ? `Ausgabe ${nr}/${year}` : '',
    year,
    nr,
    date: f.createdTime || f.modifiedTime || '',
    modified: f.modifiedTime || '',
    size: Number(f.size) || 0,
    thumbnail: f.thumbnailLink || '',
    webViewLink: f.webViewLink || '',
    version: f.md5Checksum || f.modifiedTime || '',
    url: f.url || '',
  };
}

export function sortIssues(list) {
  return list.slice().sort((a, b) => ((b.year || 0) - (a.year || 0)) || ((b.nr || 0) - (a.nr || 0)) || String(b.date).localeCompare(String(a.date)) || String(b.name).localeCompare(String(a.name)));
}

/* ---------------------------------------------------------- Adressen */
const ADDRESS_FIELDS = [
  { key: 'vorname', names: ['Vorname', 'Rufname', 'First name'] },
  { key: 'nachname', names: ['Nachname', 'Familienname', 'Last name', 'Zuname'] },
  { key: 'name', names: ['Name', 'Vollständiger Name', 'Mitglied'] },
  { key: 'titel', names: ['Titel', 'Akad. Titel', 'Anrede'] },
  { key: 'kneipname', names: ['Kneipname', 'Vulgo', 'v/o', 'Biername', 'Couleurname'] },
  { key: 'status', names: ['Status', 'Mitgliedsstatus', 'Stand'] },
  { key: 'strasse', names: ['Straße', 'Strasse', 'Adresse', 'Anschrift', 'Straße und Hausnummer'] },
  { key: 'plz', names: ['PLZ', 'Postleitzahl'] },
  { key: 'ort', names: ['Ort', 'Wohnort', 'Stadt'] },
  { key: 'land', names: ['Land', 'Staat'] },
  { key: 'telefon', names: ['Telefon', 'Tel', 'Tel.', 'Festnetz', 'Telefon privat'] },
  { key: 'mobil', names: ['Mobil', 'Handy', 'Mobiltelefon', 'Mobilnummer'] },
  { key: 'email', names: ['E-Mail', 'Email', 'Mail', 'E-Mail-Adresse'] },
  { key: 'geburtstag', names: ['Geburtstag', 'Geburtsdatum', 'Geb.', 'Geboren'] },
  { key: 'rezeption', names: ['Rezeption', 'Aufnahme', 'Eintritt', 'Rezipiert'] },
  { key: 'beruf', names: ['Beruf', 'Studium', 'Studium/Beruf', 'Tätigkeit'] },
];

const keyOf = (s) => norm(s).replace(/[^a-z0-9]/g, '');

/** Freie Tabellenstruktur auf bekannte Felder abbilden; Unbekanntes landet in extras */
export function addressesFromRows(rows) {
  const header = (rows[0] || []).map((h) => String(h ?? '').trim());
  const map = {};
  const used = new Set();
  for (const f of ADDRESS_FIELDS) {
    const wanted = f.names.map(keyOf);
    const idx = header.findIndex((h, i) => !used.has(i) && wanted.includes(keyOf(h)));
    if (idx >= 0) { map[f.key] = idx; used.add(idx); }
  }
  // Nur „Name“ ohne Vor-/Nachname: als vollständigen Namen behandeln
  const items = [];
  rows.slice(1).forEach((r, i) => {
    const get = (k) => (map[k] >= 0 ? String(r[map[k]] ?? '').trim() : '');
    if (!r.some((v) => String(v ?? '').trim())) return;
    let vorname = get('vorname');
    let nachname = get('nachname');
    let name = get('name');
    if (!vorname && !nachname && name) {
      const parts = name.split(/\s+/);
      nachname = parts.pop();
      vorname = parts.join(' ');
    }
    if (!name) name = [get('titel'), vorname, nachname].filter(Boolean).join(' ');
    const bday = parseFlexibleDate(map.geburtstag >= 0 ? r[map.geburtstag] : '');
    const extras = [];
    header.forEach((h, idx) => {
      if (used.has(idx) || !h) return;
      const v = String(r[idx] ?? '').trim();
      if (v) extras.push({ label: h, value: v });
    });
    items.push({
      id: `r${i + 2}`,
      name,
      vorname,
      nachname,
      kneipname: get('kneipname'),
      status: get('status'),
      strasse: get('strasse'),
      plz: get('plz'),
      ort: get('ort'),
      land: get('land'),
      telefon: get('telefon'),
      mobil: get('mobil'),
      email: get('email').toLowerCase(),
      geburtstag: bday ? isoDate(bday) : '',
      geburtstagText: map.geburtstag >= 0 ? String(r[map.geburtstag] ?? '') : '',
      rezeption: get('rezeption'),
      beruf: get('beruf'),
      extras,
    });
  });
  items.sort((a, b) => norm(a.nachname || a.name).localeCompare(norm(b.nachname || b.name)) || norm(a.vorname).localeCompare(norm(b.vorname)));
  return { items, header, hasBirthdays: map.geburtstag >= 0, hasStatus: map.status >= 0 };
}

/* ---------------------------------------------------------- Forum */
export function buildForum(threadRows, postRows) {
  const posts = postRows
    .filter((p) => p.id && p.themaId && !truthy(p.geloescht))
    .map((p) => ({
      id: String(p.id),
      threadId: String(p.themaId),
      authorEmail: String(p.autorEmail || '').toLowerCase(),
      authorName: String(p.autorName || ''),
      created: String(p.erstellt || ''),
      text: String(p.text || ''),
      edited: String(p.bearbeitet || ''),
      _row: p._row,
    }))
    .sort((a, b) => a.created.localeCompare(b.created));
  const byThread = new Map();
  for (const p of posts) {
    if (!byThread.has(p.threadId)) byThread.set(p.threadId, []);
    byThread.get(p.threadId).push(p);
  }
  const threads = threadRows
    .filter((t) => t.id && !truthy(t.geloescht))
    .map((t) => {
      const ps = byThread.get(String(t.id)) || [];
      const last = ps[ps.length - 1];
      return {
        id: String(t.id),
        category: String(t.kategorie || 'Allgemeines'),
        title: String(t.titel || '(ohne Titel)'),
        authorEmail: String(t.autorEmail || '').toLowerCase(),
        authorName: String(t.autorName || ''),
        created: String(t.erstellt || ''),
        pinned: truthy(t.angeheftet),
        closed: truthy(t.geschlossen),
        replies: Math.max(0, ps.length - 1),
        postCount: ps.length,
        lastActivity: last?.created || String(t.erstellt || ''),
        lastAuthor: last?.authorName || '',
        firstText: ps[0]?.text || '',
        _row: t._row,
      };
    })
    .sort((a, b) => (b.pinned - a.pinned) || b.lastActivity.localeCompare(a.lastActivity));
  return { threads, posts };
}

/* ---------------------------------------------------------- News */
export function newsFromRows(rows) {
  return rows
    .filter((r) => r.titel && !truthy(r.geloescht))
    .map((r) => ({
      // ohne eigene ID: Zeilennummer (die Redaktion muss die Spalte nicht ausfüllen)
      id: String(r.id || `zeile-${r._row}`),
      // Google liefert Datumszellen je nach Tabelle als „16.10.2026“ – einheitlich als ISO-Text speichern
      date: (() => { const d = parseFlexibleDate(r.datum); return d ? isoLocal(d) : String(r.datum || ''); })(),
      title: String(r.titel),
      text: String(r.text || ''),
      image: String(r.bild || ''),
      category: String(r.kategorie || ''),
      pinned: truthy(r.angeheftet),
      authorEmail: String(r.autorEmail || '').toLowerCase(),
      authorName: String(r.autorName || ''),
      _row: r._row,
    }))
    .sort((a, b) => (b.pinned - a.pinned) || String(b.date).localeCompare(String(a.date)));
}

export function eventCategories() {
  return (config.terminKategorien || []).map((c) => c.name);
}
