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
/**
 * "2026-2 Bundesbote SoSe 2026.pdf" → Jahr, Nummer, Titel.
 * Andere Namen („Zeitung Nr. 3 2019.pdf“) werden so gut wie möglich gelesen; fehlt das Jahr im Namen,
 * zählt ein Jahresordner („2019/…“, siehe f.path aus drive.listTree).
 */
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
  } else {
    const y = base.match(/(?:^|\D)((?:19|20)\d{2})(?!\d)/);
    const n = base.match(/(?:nr\.?|nummer|ausgabe|heft)\s*(\d{1,2})(?!\d)/i);
    const fromPath = [...(f.path || [])].reverse().map((p) => String(p).match(/(?:^|\D)((?:19|20)\d{2})(?!\d)/)?.[1]).find(Boolean);
    year = y ? +y[1] : fromPath ? +fromPath : null;
    nr = n ? +n[1] : null;
  }
  title = title.replace(/[_]+/g, ' ').trim();
  return {
    id: f.id,
    name: f.name,
    title: f.description?.trim() || title,
    ausgabe: year && nr ? `Ausgabe ${nr}/${year}` : year ? String(year) : '',
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
  { key: 'strasse', names: ['Straße', 'Strasse', 'Adresse', 'Anschrift', 'Straße und Hausnummer', 'Straße/Nr.', 'Straße Nr.'] },
  { key: 'hausnummer', names: ['Hausnummer', 'Hausnr', 'Hausnr.', 'Haus-Nr.'] },
  { key: 'plzOrt', names: ['PLZ Ort', 'PLZ/Ort', 'PLZ und Ort', 'PLZ, Ort'] },
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

function mapHeader(header) {
  const map = {};
  const used = new Set();
  for (const f of ADDRESS_FIELDS) {
    const wanted = f.names.map(keyOf);
    const idx = header.findIndex((h, i) => !used.has(i) && wanted.includes(keyOf(h)));
    if (idx >= 0) { map[f.key] = idx; used.add(idx); }
  }
  return { map, used };
}

/** Kopfzeile finden: die erste der ersten zehn Zeilen mit mindestens zwei bekannten Spaltennamen (sonst Zeile 1) */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const header = (rows[i] || []).map((h) => String(h ?? '').trim());
    if (Object.keys(mapHeader(header).map).length >= 2) return i;
  }
  return 0;
}

/**
 * Welches Tabellenblatt ist das Adressverzeichnis? config.adressenBlatt (falls eingetragen),
 * sonst „Adressen“, sonst das erste Blatt. Ein eingetragenes, aber fehlendes Blatt ist ein Fehler –
 * die App zeigt dann lieber nichts als womöglich ein falsches Blatt.
 */
export function addressTab(meta) {
  const tabs = (meta.sheets || []).map((s) => s.properties.title);
  const wanted = String(config.adressenBlatt || '').trim();
  if (wanted) {
    if (!tabs.includes(wanted)) throw Object.assign(new Error(`Tabellenblatt „${wanted}“ gibt es im Adressverzeichnis nicht (vorhanden: ${tabs.join(', ')})`), { code: 'not_configured' });
    return wanted;
  }
  return tabs.includes(SHEETS.addresses) ? SHEETS.addresses : tabs[0];
}

/** Spaltennamen, die auf vertrauliche Inhalte hindeuten (Hinweis in der Einrichtung) */
const SENSITIVE = /iban|\bbic\b|bank|konto|beitrag|zahlung|lastschrift|sepa|mandat|schulden|mahnung|passwort|kennwort|steuer|versicherung|gesundheit|krank|religion|konfession|austritt|ausschluss|bemerkung|notiz|\bintern(e|es|er)?\b|vertraulich/;

/** Freie Tabellenstruktur auf bekannte Felder abbilden; Unbekanntes landet in extras */
export function addressesFromRows(rows) {
  const headerRow = findHeaderRow(rows);
  const header = (rows[headerRow] || []).map((h) => String(h ?? '').trim());
  const { map, used } = mapHeader(header);
  const items = [];
  rows.slice(headerRow + 1).forEach((r, i) => {
    const get = (k) => (map[k] >= 0 ? String(r[map[k]] ?? '').trim() : '');
    if (!r.some((v) => String(v ?? '').trim())) return;
    let vorname = get('vorname');
    let nachname = get('nachname');
    let name = get('name');
    // Nur „Name“ ohne Vor-/Nachname: „Müller, Hans“ oder „Hans Müller“
    if (!vorname && !nachname && name) {
      const comma = name.match(/^([^,]+),\s*(.+)$/);
      if (comma) {
        nachname = comma[1].trim();
        vorname = comma[2].trim();
        name = `${vorname} ${nachname}`;
      } else {
        const parts = name.split(/\s+/);
        nachname = parts.pop();
        vorname = parts.join(' ');
      }
    }
    if (!name) name = [get('titel'), vorname, nachname].filter(Boolean).join(' ');
    let plz = get('plz');
    let ort = get('ort');
    const plzOrt = get('plzOrt').match(/^(?:D-)?(\d{4,5})\s+(.+)$/i);
    if (plzOrt && !plz && !ort) {
      plz = plzOrt[1];
      ort = plzOrt[2].trim();
    } else if (!ort && get('plzOrt')) {
      ort = get('plzOrt');
    }
    const strasse = [get('strasse'), get('hausnummer')].filter(Boolean).join(' ');
    const bday = parseFlexibleDate(map.geburtstag >= 0 ? r[map.geburtstag] : '');
    const extras = [];
    header.forEach((h, idx) => {
      if (used.has(idx) || !h) return;
      const v = String(r[idx] ?? '').trim();
      if (v) extras.push({ label: h, value: v });
    });
    items.push({
      id: `r${headerRow + i + 2}`,
      name,
      vorname,
      nachname,
      kneipname: get('kneipname'),
      status: get('status'),
      strasse,
      plz,
      ort,
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
  // für die Prüfung in der Einrichtung: welche Spalten erkannt wurden und was zusätzlich angezeigt wird
  const mapped = Object.entries(map).sort((a, b) => a[1] - b[1]).map(([key, idx]) => ({ key, label: header[idx] }));
  const unmapped = header.filter((h, idx) => h && !used.has(idx));
  return {
    items, header, headerRow, mapped, unmapped,
    sensitive: unmapped.filter((h) => SENSITIVE.test(norm(h))),
    hasBirthdays: map.geburtstag >= 0, hasStatus: map.status >= 0,
    hasName: map.name >= 0 || map.nachname >= 0 || map.vorname >= 0,
  };
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
