// Einrichtung (nur für Admins, nur auf ausdrücklichen Klick):
// Vorhandene Kalender, Tabellen und Ordner werden nur VERBUNDEN (ID eintragen) – nie geändert und
// nie neu freigegeben. NEU angelegt wird nur, was noch fehlt, und zwar im eigenen Google-Konto.
// Der Schreibschutz lässt dabei nur Änderungen an den gerade neu angelegten Dateien zu.
import { config, eventLink, categoryInfo, appBaseUrl } from '../config.js';
import * as auth from '../auth.js';
import * as drive from '../google/drive.js';
import * as sheets from '../google/sheets.js';
import * as cal from '../google/calendar.js';
import * as people from '../google/people.js';
import * as chat from '../google/chat.js';
import { beginSetup, endSetup, registerSetupResource } from '../google/guard.js';
import {
  SHEETS, SHEET_HEADERS, appLinkBlock, addressesFromRows, addressTab, issueFromFile, isSongFile, songFromFile,
} from '../backend/common.js';
import { buildMembers, buildAddressRows, buildNews, buildGallery, DEMO_ISSUES } from '../backend/demo-data.js';
import { calendarEventId, newId } from './text.js';
import { addDays, startOfDay, isoDate } from './dates.js';
import { consentRecipients } from './datenschutz.js';
import { prepareConsentSheet, TABLE_TYPE, TABS as CONSENT_TABS } from './einwilligungsliste.js';

const SPREADSHEET = 'application/vnd.google-apps.spreadsheet';

/** Kalender-ID aus „cid=“ (Google kodiert sie dort meist mit Base64), „src=“ oder dem iCal-Link */
function calendarIdFrom(param) {
  let v = param;
  try { v = decodeURIComponent(param); } catch { /* so lassen */ }
  if (v.includes('@')) return v;
  try {
    const decoded = atob(v.replace(/-/g, '+').replace(/_/g, '/'));
    if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(decoded)) return decoded;
  } catch { /* kein Base64 */ }
  return v;
}

/** IDs aus Google-Links herauslesen (Tabellen, Ordner, Dateien, Kalender) */
export function idFromUrl(input) {
  const s = String(input || '').trim();
  let m = s.match(/\/(?:spreadsheets|document|presentation)\/d\/([-\w]{20,})/);
  if (m) return m[1];
  m = s.match(/\/folders\/([-\w]{20,})/);
  if (m) return m[1];
  m = s.match(/\/file\/d\/([-\w]{20,})/);
  if (m) return m[1];
  m = s.match(/[?&]id=([-\w]{20,})/);
  if (m) return m[1];
  m = s.match(/[?&](?:cid|src)=([^&#]+)/) || s.match(/\/calendar\/ical\/([^/]+)\//);
  if (m) return calendarIdFrom(m[1]);
  return s;
}

/* ------------------------------------------------------------ Datenquellen */

/** Die Datenquellen der App: Schlüssel, Bezeichnung, eingetragene ID */
export const RESOURCES = [
  { key: 'kalender', label: 'Kalender', id: (c) => c.kalenderId },
  { key: 'adressen', label: 'Adressverzeichnis', id: (c) => c.tabellen?.adressen },
  { key: 'news', label: 'News-Tabelle', id: (c) => c.tabellen?.news },
  { key: 'zeitung', label: 'Ordner Bundesbote', id: (c) => c.zeitungOrdnerId },
  { key: 'lieder', label: 'Ordner Liedermappe', id: (c) => c.liedermappeOrdnerId },
  { key: 'ds', label: 'Ordner DS-Zeitung', id: (c) => c.dsZeitungOrdnerId },
  { key: 'galerie', label: 'Ordner Galerie', id: (c) => c.galerieOrdnerId },
  { key: 'einwilligungen', label: 'Einwilligungsliste (vertraulich)', id: (c) => c.tabellen?.einwilligungen },
];

/** Schlüssel der Datenquellen, für die noch nichts eingetragen ist */
export function missingResources(c = config) {
  return RESOURCES.filter((r) => !String(r.id(c) || '').trim()).map((r) => r.key);
}

async function newFolder(name, parentId) {
  const f = await drive.createFolder(name, parentId);
  registerSetupResource(f.id);
  return f;
}

async function createSpreadsheet(name, parentId, sheetNames) {
  const file = await drive.createFile({ name, mimeType: SPREADSHEET, parents: [parentId] });
  registerSetupResource(file.id);
  const meta = await sheets.getMeta(file.id);
  const firstId = meta.sheets[0].properties.sheetId;
  const requests = [
    { updateSheetProperties: { properties: { sheetId: firstId, title: sheetNames[0], gridProperties: { frozenRowCount: 1 } }, fields: 'title,gridProperties.frozenRowCount' } },
    ...sheetNames.slice(1).map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })),
  ];
  const res = await sheets.batchUpdate(file.id, requests);
  const ids = [firstId, ...(res.replies || []).slice(1).map((r) => r.addSheet?.properties?.sheetId)];
  await sheets.valuesBatchUpdate(file.id, sheetNames.map((t) => ({ range: `${sheets.quoteSheet(t)}!A1`, values: [SHEET_HEADERS[t]] })));
  // Kopfzeile schwarz mit weißer, fetter Schrift – wie die App
  await sheets.batchUpdate(file.id, ids.filter((id) => id !== undefined).map((sheetId) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { backgroundColor: { red: 0, green: 0, blue: 0 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true } } },
      fields: 'userEnteredFormat(backgroundColor,textFormat)',
    },
  })));
  return { id: file.id, url: `https://docs.google.com/spreadsheets/d/${file.id}/edit` };
}

function shareTargets({ group, domain, testUsers }) {
  const targets = [];
  if (group) targets.push({ type: 'group', emailAddress: group });
  else if (domain) targets.push({ type: 'domain', domain });
  for (const u of testUsers || []) targets.push({ type: 'user', emailAddress: u });
  return targets;
}

/** Mitglieder dürfen nur LESEN */
async function shareReadOnly(fileId, targets, log) {
  for (const t of targets) {
    try {
      await drive.addPermission(fileId, { ...t, role: 'reader' });
    } catch (e) {
      log(`Freigabe für ${t.emailAddress || t.domain} fehlgeschlagen: ${e.message}`, 'err');
    }
  }
}

async function shareCalendarReadOnly(calendarId, targets, log) {
  for (const t of targets) {
    const scope = t.type === 'domain' ? { type: 'domain', value: t.domain } : { type: t.type, value: t.emailAddress };
    try {
      await cal.insertAcl(calendarId, { role: 'reader', scope });
    } catch (e) {
      log(`Kalenderfreigabe für ${scope.value} fehlgeschlagen: ${e.message}`, 'err');
    }
  }
}

/* -------------------------------------------------------------- Beispieldaten */

function sampleEvents(me, invitees) {
  const base = startOfDay(new Date());
  const list = [
    { d: 3, t: '20:00', h: 4, title: 'Semesterantrittskneipe', cat: 'Kneipe', loc: 'Großer Saal, Verbindungshaus', dress: 'Vollcouleur', pflicht: true,
      desc: 'Wir eröffnen das Semester mit einer feierlichen Kneipe. Alte Herren und Gäste sind herzlich willkommen.' },
    { d: 7, t: '19:00', h: 2, title: 'Fuxenstunde: Geschichte des Bundes', cat: 'Fuxenstunde', loc: 'Kneipsaal', dress: 'Band',
      desc: 'Für alle Füxe, Burschen sind willkommen.' },
    { d: 10, t: '19:30', h: 2.5, title: 'Vortragsabend: Künstliche Intelligenz im Beruf', cat: 'Vortrag', loc: 'Bibliothek, Verbindungshaus', dress: 'Zivil',
      desc: 'Vortrag mit anschließender Diskussion. Gäste willkommen.' },
    { d: 15, t: '15:00', h: 3, title: 'Convent', cat: 'Convent', loc: 'Conventsraum', dress: 'Band', pflicht: true,
      desc: 'Tagesordnung folgt per E-Mail.' },
    { d: 18, t: '10:00', h: 5, title: 'Arbeitseinsatz am Haus', cat: 'Haus', loc: 'Verbindungshaus', dress: 'Arbeitskleidung',
      desc: 'Gartenarbeit und Streichen. Für Verpflegung ist gesorgt.' },
    { d: 28, t: '20:00', h: 4, title: 'Krambambuli-Abend', cat: 'Kneipe', loc: 'Kneipsaal', dress: 'Band',
      desc: 'Das traditionelle Heißgetränk nach überliefertem Rezept.' },
    { d: 42, t: '19:00', h: 5, title: 'Festkneipe mit Damen', cat: 'Fest', loc: 'Großer Saal, Verbindungshaus', dress: 'Vollcouleur',
      desc: 'Festliche Kneipe mit anschließendem Tanz.' },
  ];
  const sample = buildMembers().slice(1, 9);
  const pad = (n) => String(n).padStart(2, '0');
  const local = (d) => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  return list.map((e, k) => {
    const s = addDays(base, e.d);
    const [hh, mm] = e.t.split(':').map(Number);
    s.setHours(hh, mm, 0, 0);
    const end = new Date(s.getTime() + e.h * 3600_000);
    const id = calendarEventId();
    const cat = categoryInfo(e.cat);
    const attendees = [...invitees.map((email) => ({ email })), { email: me.email }];
    sample.forEach((m, i) => {
      const r = (i * 7 + k * 3) % 10;
      attendees.push({ email: m.email, displayName: m.name, responseStatus: r < 5 ? 'accepted' : r < 7 ? 'tentative' : r < 8 ? 'declined' : 'needsAction' });
    });
    return {
      id,
      summary: e.title,
      location: e.loc,
      description: `${e.desc}\n\n(Beispieltermin aus der Einrichtung – kann gelöscht werden.)${appLinkBlock(eventLink(id))}`,
      start: { dateTime: local(s), timeZone: 'Europe/Berlin' },
      end: { dateTime: local(end), timeZone: 'Europe/Berlin' },
      extendedProperties: { shared: { fbKategorie: e.cat, fbKleidung: e.dress || '', fbPflicht: e.pflicht ? '1' : '0' } },
      ...(cat.googleFarbe ? { colorId: cat.googleFarbe } : {}),
      guestsCanSeeOtherGuests: true,
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      source: { title: `${config.appName} – Mitglieder-App`, url: eventLink(id) },
      attendees,
    };
  });
}

async function uploadFromApp(url, metadata, type) {
  // relativ zum App-Hauptordner auflösen (setup.js liegt in js/lib/)
  const res = await fetch(new URL(`../../${url}`, import.meta.url));
  if (!res.ok) throw new Error(`Datei nicht gefunden: ${url}`);
  const blob = await res.blob();
  return drive.upload(metadata, new Blob([blob], { type }));
}

/* ------------------------------------------------------------ Anlegen */

/**
 * Fehlendes NEU anlegen – nur die Datenquellen in `only` (Standard: alles, was noch nicht eingetragen ist).
 * Bereits eingetragene (vorhandene) Kalender, Tabellen und Ordner werden dabei nicht angefasst:
 * nicht gelesen, nicht geändert, nicht neu freigegeben. Beispieldaten kommen nur in Neues.
 * options: { only, withSamples, withIssues, withPhotos, group, domain, testUsers, me, log }
 * Liefert die IDs des NEU Angelegten und `created` (Schlüssel aus RESOURCES).
 */
export async function createMissing({
  only = missingResources(), withSamples = true, withIssues = true, withPhotos = true, group = '', domain = '', testUsers = [], me, log,
}) {
  const want = new Set(only);
  const name = config.appName;
  const targets = shareTargets({ group, domain, testUsers });
  const out = { created: [], tabellen: {} };
  if (!want.size) {
    log('Es fehlt nichts – alle Datenquellen sind eingetragen.', 'ok');
    return out;
  }
  beginSetup();
  try {
    // Neue Tabellen und Ordner kommen in einen gemeinsamen Ordner (die Einwilligungsliste bewusst nicht)
    let root = null;
    if (['adressen', 'news', 'zeitung', 'lieder', 'ds', 'galerie'].some((k) => want.has(k))) {
      log('Ordner in Google Drive anlegen …');
      root = await newFolder(`${name} – Mitglieder-App`);
      out.rootFolderId = root.id;
      log(`Ordner „${name} – Mitglieder-App“ angelegt`, 'ok');
    }
    let zeitung = null;
    let lieder = null;
    let dsZeitung = null;
    let galerie = null;
    if (want.has('zeitung')) {
      zeitung = await newFolder('Bundesbote', root.id);
      out.zeitungOrdnerId = zeitung.id;
      out.created.push('zeitung');
      log('Ordner „Bundesbote“ angelegt', 'ok');
    }
    if (want.has('lieder')) {
      lieder = await newFolder('Liedermappe', root.id);
      out.liedermappeOrdnerId = lieder.id;
      out.created.push('lieder');
      log('Ordner „Liedermappe“ angelegt (Noten als PDF oder Bild hineinlegen, Unterordner = Rubriken)', 'ok');
    }
    if (want.has('ds')) {
      dsZeitung = await newFolder('DS-Zeitung', root.id);
      out.dsZeitungOrdnerId = dsZeitung.id;
      out.created.push('ds');
      log('Ordner „DS-Zeitung“ angelegt (Ausgaben als PDF hineinlegen)', 'ok');
    }
    if (want.has('galerie')) {
      galerie = await newFolder('Galerie', root.id);
      out.galerieOrdnerId = galerie.id;
      out.created.push('galerie');
      log('Ordner „Galerie“ angelegt', 'ok');
    }
    let adressen = null;
    let news = null;
    if (want.has('adressen')) {
      adressen = await createSpreadsheet(`${name} – Adressverzeichnis`, root.id, [SHEETS.addresses]);
      out.tabellen.adressen = adressen.id;
      out.created.push('adressen');
      log('Tabelle „Adressverzeichnis“ angelegt', 'ok');
    }
    if (want.has('news')) {
      news = await createSpreadsheet(`${name} – News`, root.id, [SHEETS.news]);
      out.tabellen.news = news.id;
      out.created.push('news');
      log('Tabelle „News“ angelegt', 'ok');
    }

    if (want.has('einwilligungen')) {
      // bewusst NICHT im freigegebenen Ordner (Freigaben würden vererbt)
      const consents = await drive.createFile({ name: `${name} – Einwilligungen (vertraulich)`, mimeType: SPREADSHEET, appProperties: { fbTyp: TABLE_TYPE } });
      registerSetupResource(consents.id);
      await prepareConsentSheet(consents.id);
      for (const email of consentRecipients(me?.email)) {
        try {
          await drive.addPermission(consents.id, { type: 'user', role: 'reader', emailAddress: email });
        } catch (e) {
          log(`Freigabe der Einwilligungsliste für ${email} fehlgeschlagen: ${e.message}`, 'err');
        }
      }
      out.tabellen.einwilligungen = consents.id;
      out.created.push('einwilligungen');
      log('Vertrauliche Einwilligungsliste angelegt (in „Meine Ablage“, nur für die Datenschutz-Verantwortlichen)', 'ok');
    }

    let calendar = null;
    if (want.has('kalender')) {
      log('Kalender anlegen …');
      calendar = await cal.createCalendar(name, `Termine der ${name}. Zu- und Absagen über die Mitglieder-App: ${appBaseUrl()}`);
      registerSetupResource(calendar.id);
      out.kalenderId = calendar.id;
      out.created.push('kalender');
      log(`Kalender „${name}“ angelegt`, 'ok');
    }

    // Freigaben nur für das NEU Angelegte – Mitglieder dürfen nur lesen
    const newShared = [root, zeitung, lieder, dsZeitung, galerie, adressen, news].filter(Boolean).map((x) => x.id);
    if (newShared.length || calendar) {
      if (targets.length) {
        log('Für die Mitglieder freigeben – nur lesen …');
        for (const id of newShared) await shareReadOnly(id, targets, log);
        if (calendar) await shareCalendarReadOnly(calendar.id, targets, log);
        log('Freigaben gesetzt: Mitglieder dürfen die neuen Dateien nur lesen', 'ok');
      } else {
        log('Keine Gruppe/Domain/Testkonten angegeben – die neuen Dateien sind vorerst nur für dich sichtbar.');
      }
    }

    if (withSamples && (adressen || news || calendar)) {
      log('Beispieldaten in die neuen Dateien eintragen …');
      if (adressen) {
        const rows = buildAddressRows().slice(1, 16);
        const parts = String(me.name || '').trim().split(/\s+/);
        rows.unshift([parts.pop() || '', parts.join(' '), '', '', '', '', '', '', '', '', me.email, '', '', '']);
        await sheets.append(adressen.id, `${sheets.quoteSheet(SHEETS.addresses)}!A1`, rows);
        log('Beispiel-Adressen eingetragen', 'ok');
      }
      if (news) {
        await sheets.append(news.id, `${sheets.quoteSheet(SHEETS.news)}!A1`, buildNews().slice(0, 4).map((n) => [
          newId('n'), n.date, n.title, n.text, n.image ? `${appBaseUrl()}${n.image}` : '', n.category, n.pinned ? 'ja' : '', n.authorEmail, n.authorName, '',
        ]));
        log('Beispiel-News eingetragen', 'ok');
      }
      if (calendar) {
        const invitees = [group, ...testUsers].filter(Boolean);
        let n = 0;
        for (const ev of sampleEvents(me, invitees)) {
          try {
            await cal.insertEvent(calendar.id, ev, 'none');
            n++;
          } catch {
            try {
              const real = new Set([...invitees, me.email].map((x) => x.toLowerCase()));
              await cal.insertEvent(calendar.id, { ...ev, attendees: ev.attendees.filter((a) => real.has(a.email.toLowerCase())) }, 'none');
              n++;
            } catch (e2) {
              log(`Termin „${ev.summary}“: ${e2.message}`, 'err');
            }
          }
        }
        log(`${n} Beispieltermine angelegt`, 'ok');
      }
    }

    if (withIssues && zeitung) {
      log('Beispielausgaben des Bundesboten hochladen …');
      for (const issue of DEMO_ISSUES) {
        try {
          await uploadFromApp(issue.url, { name: issue.name, mimeType: 'application/pdf', parents: [zeitung.id] }, 'application/pdf');
          log(`„${issue.name}“ hochgeladen`, 'ok');
        } catch (e) {
          log(`Upload „${issue.name}“ fehlgeschlagen: ${e.message}`, 'err');
        }
      }
    }

    if (withPhotos && galerie) {
      log('Beispielfotos für die Galerie hochladen …');
      for (const album of buildGallery()) {
        try {
          const folder = await newFolder(album.title, galerie.id);
          for (const p of album.photos) {
            await uploadFromApp(p.url, { name: `${p.name}.webp`, mimeType: 'image/webp', parents: [folder.id] }, 'image/webp');
          }
          log(`Album „${album.title}“ mit ${album.photos.length} Bildern angelegt`, 'ok');
        } catch (e) {
          log(`Album „${album.title}“: ${e.message}`, 'err');
        }
      }
    }

    log('Fertig! 🎉', 'ok');
    return out;
  } finally {
    endSetup();
  }
}

/** Alles neu anlegen, unabhängig davon, was eingetragen ist (für einen Test von Grund auf) */
export const createEverything = (options) => createMissing({ ...options, only: RESOURCES.map((r) => r.key) });

/* ------------------------------------------------------------ Prüfen (nur lesend) */

const EDIT_ROLES = ['owner', 'organizer', 'fileOrganizer', 'writer'];
const ROLE = { owner: 'Inhaber', organizer: 'Verwalten', fileOrganizer: 'Inhalte verwalten', writer: 'Bearbeiten', commenter: 'Kommentieren', reader: 'Lesen' };
const WIDE = ['group', 'domain', 'anyone'];

function who(p) {
  if (p.type === 'anyone') return '„Jeder mit dem Link“';
  if (p.type === 'domain') return `alle in ${p.domain}`;
  return p.emailAddress || p.displayName || p.type;
}

const short = (list, n = 6) => (list.length > n ? `${list.slice(0, n).join(', ')} und ${list.length - n} weitere` : list.join(', '));

/**
 * Freigaben einer Drive-Datei bewerten (nur lesend). Liefert { warn, info }:
 *  – „Jeder mit dem Link“ ist eine Warnung: die IDs stehen in der öffentlichen config.js.
 *  – Gruppe oder Domain mit Bearbeitungsrechten ist eine Warnung: Mitglieder sollen nur lesen.
 *  – Fehlt eine Lesefreigabe für Mitglieder-Gruppe bzw. Domain, gibt es einen Hinweis.
 */
export function judgeSharing(perms, { group = config.mitgliederGruppe, domain = config.workspaceDomain } = {}) {
  const warn = [];
  const info = [];
  const g = String(group || '').toLowerCase();
  const d = String(domain || '').toLowerCase();
  const anyone = perms.filter((p) => p.type === 'anyone');
  if (anyone.length) {
    warn.push(`${who(anyone[0])} hat Zugriff (${ROLE[anyone[0].role] || anyone[0].role}). Die ID steht in der öffentlichen config.js – damit könnte jeder im Internet mitlesen. Bitte in Google Drive unter „Teilen → Allgemeiner Zugriff“ auf „Eingeschränkt“${d ? ` oder „${d}“` : ''} stellen.`);
  }
  const wideEdit = perms.filter((p) => WIDE.includes(p.type) && EDIT_ROLES.includes(p.role));
  if (wideEdit.length) warn.push(`Bearbeiten dürfen ${wideEdit.map(who).join(', ')}. Mitglieder sollen nur lesen – bitte auf „Betrachter“ stellen.`);
  // der Inhaber steht schon in der Zeile „Inhaber“
  const editors = perms.filter((p) => !WIDE.includes(p.type) && EDIT_ROLES.includes(p.role) && p.role !== 'owner').map(who);
  if (editors.length) info.push(`Bearbeiten: ${short(editors)}`);
  const readers = perms.filter((p) => !EDIT_ROLES.includes(p.role) && p.type !== 'anyone');
  if (readers.length) info.push(`Lesen: ${short(readers.map(who))}`);
  // erreicht die Freigabe die Mitglieder? (egal mit welcher Rolle – zu viel Recht meldet die Warnung oben)
  const reach = perms.filter((p) => (p.type === 'group' && g && String(p.emailAddress || '').toLowerCase() === g) || (p.type === 'domain' && d && String(p.domain || '').toLowerCase() === d));
  if ((g || d) && !reach.length && !anyone.length) {
    warn.push(`Keine Lesefreigabe für ${g || `alle in ${d}`} gefunden – sehen die Mitglieder die Daten? Falls nicht: in Google Drive „Teilen“ → ${g || d} als „Betrachter“ hinzufügen.`);
  }
  return { warn, info };
}

/** Freigaben eines Kalenders bewerten (nur lesend), Regeln aus calendar.acl.list */
export function judgeCalendarAcl(rules, { group = config.mitgliederGruppe, domain = config.workspaceDomain } = {}) {
  const warn = [];
  const info = [];
  const g = String(group || '').toLowerCase();
  const d = String(domain || '').toLowerCase();
  const label = (r) => (r.scope?.type === 'default' ? 'öffentlich' : r.scope?.type === 'domain' ? `alle in ${r.scope.value}` : r.scope?.value || '');
  const pub = rules.find((r) => r.scope?.type === 'default' && r.role !== 'none');
  if (pub) {
    info.push(`öffentlich (${pub.role === 'freeBusyReader' ? 'nur frei/belegt' : 'alle Termindetails'})`);
    if (pub.role !== 'freeBusyReader') warn.push('Der Kalender ist öffentlich – bitte prüfen, ob Termindetails und Gästelisten öffentlich sein sollen.');
  }
  const wideEdit = rules.filter((r) => ['group', 'domain', 'default'].includes(r.scope?.type) && ['owner', 'writer'].includes(r.role));
  if (wideEdit.length) warn.push(`Termine ändern dürfen ${wideEdit.map(label).join(', ')}. Mitglieder sollen nur lesen – bitte auf „Alle Termindetails sehen“ stellen.`);
  const reach = rules.filter((r) => (r.scope?.type === 'group' && g && String(r.scope.value).toLowerCase() === g) || (r.scope?.type === 'domain' && d && String(r.scope.value).toLowerCase() === d));
  if (reach.some((r) => r.role === 'freeBusyReader') && !reach.some((r) => r.role !== 'freeBusyReader')) {
    warn.push(`${reach.map(label).join(', ')} sehen nur „frei/belegt“ – für die App bitte „Alle Termindetails sehen“ freigeben.`);
  } else if (reach.length) {
    info.push(`lesbar für ${reach.map(label).join(', ')}`);
  } else if ((g || d) && !(pub && pub.role !== 'freeBusyReader')) {
    warn.push(`Keine Freigabe für ${g || `alle in ${d}`} gefunden – in Google Kalender unter „Für bestimmte Personen oder Gruppen freigeben“ hinzufügen (Alle Termindetails sehen).`);
  }
  return { warn, info };
}

const FILE_META = 'id,name,mimeType,driveId,owners(emailAddress)';

/** Inhaber und Freigaben einer vorhandenen Datei in die Prüfung übernehmen */
async function addSharing(c, id) {
  const d = String(config.workspaceDomain || '').toLowerCase();
  const f = await drive.getFile(id, FILE_META).catch(() => null);
  if (f?.driveId) c.lines.push('liegt in einer geteilten Ablage');
  const owner = f?.owners?.[0]?.emailAddress;
  if (owner) {
    c.lines.push(`Inhaber: ${owner}`);
    if (d && !owner.toLowerCase().endsWith(`@${d}`)) {
      c.warn.push(`Gehört einem Konto außerhalb von ${d} (${owner}). Besser in den Workspace übertragen, damit die Daten der Verbindung gehören.`);
    }
  }
  let perms;
  try {
    perms = await drive.listPermissions(id);
  } catch {
    c.lines.push('Freigaben nicht einsehbar (nur Inhaber und Bearbeiter sehen sie)');
    return;
  }
  const r = judgeSharing(perms);
  c.lines.push(...r.info);
  c.warn.push(...r.warn);
}

/**
 * Prüft (nur lesend), ob alle eingetragenen Datenquellen erreichbar und richtig freigegeben sind.
 * Jeder Eintrag: { label, ok, detail, lines: [], warn: [] } – ok=false: Fehler; warn: bitte ansehen.
 */
export async function checkSetup() {
  const checks = [];
  const add = async (label, fn) => {
    const c = { label, ok: true, detail: '', lines: [], warn: [] };
    try {
      await fn(c);
    } catch (e) {
      Object.assign(c, { ok: false, detail: e.message || String(e), status: e.status });
    }
    checks.push(c);
  };
  const t = config.tabellen || {};
  const g = String(config.mitgliederGruppe || '').toLowerCase();
  const d = String(config.workspaceDomain || '').toLowerCase();

  await add('Kalender', async (c) => {
    if (!config.kalenderId) throw new Error('Keine Kalender-ID eingetragen');
    const r = await cal.listEvents(config.kalenderId, { timeMin: new Date().toISOString(), timeMax: addDays(new Date(), 90).toISOString() });
    c.detail = `${r.summary ? `„${r.summary}“ · ` : ''}${r.items.length} Termine in den nächsten 90 Tagen`;
    // Zu- und Absagen gehen immer (ohne Einladung über die App). Mit Einladung der Mitglieder-Gruppe stehen die
    // Termine zusätzlich in den Kalendern der Mitglieder und die Antworten auch im Google Kalender.
    if (g) {
      const invited = r.items.filter((e) => (e.attendees || []).some((a) => String(a.email).toLowerCase() === g)).length;
      const without = r.items.length - invited;
      if (r.items.length) c.lines.push(`${invited} davon mit Einladung an ${g}`);
      if (without) c.lines.push(`${without} ${without === 1 ? 'Termin' : 'Termine'} ohne Einladung an die Gruppe – Zu- und Absagen laufen dort über die App (im Google Kalender nicht sichtbar). Wer sie auch im Kalender haben will: Gruppe als Gast hinzufügen, automatisch mit apps-script/Automatik.gs.`);
    } else {
      c.lines.push('Ohne Mitglieder-Gruppe laufen Zu- und Absagen über die App (im Google Kalender nicht sichtbar). Optional: Google-Gruppe aller Mitglieder anlegen, hier eintragen und mit apps-script/Automatik.gs einladen lassen – dann stehen die Termine auch im eigenen Kalender.');
    }
    if (auth.hasScope(auth.SCOPES.setup[0])) {
      const rules = await cal.listAcl(config.kalenderId).catch(() => null);
      if (rules) {
        const j = judgeCalendarAcl(rules);
        c.lines.push(...j.info.map((x) => `Freigabe: ${x}`));
        c.warn.push(...j.warn);
      } else {
        c.lines.push('Freigaben nicht einsehbar (nur für Inhaber des Kalenders)');
      }
    } else {
      c.lines.push('Freigaben bitte in Google Kalender prüfen (Einstellungen des Kalenders → „Für bestimmte Personen oder Gruppen freigeben“): Mitglieder höchstens „Alle Termindetails sehen“.');
    }
  });

  await add('Adressverzeichnis', async (c) => {
    if (!t.adressen) throw new Error('Keine Tabellen-ID eingetragen');
    const meta = await sheets.getMeta(t.adressen);
    const tab = addressTab(meta);
    const rows = await sheets.getValues(t.adressen, `${sheets.quoteSheet(tab)}!A1:AZ`, { render: 'FORMATTED_VALUE' });
    const a = addressesFromRows(rows);
    c.detail = `„${meta.properties.title}“ · Blatt „${tab}“ · ${a.items.length} Einträge`;
    const others = meta.sheets.map((s) => s.properties.title).filter((x) => x !== tab);
    if (others.length) c.lines.push(`Weitere Blätter (liest die App nicht): ${short(others)}`);
    if (a.headerRow > 0) c.lines.push(`Spaltennamen in Zeile ${a.headerRow + 1}`);
    c.lines.push(`Erkannte Spalten: ${a.mapped.map((m) => m.label).join(', ') || '–'}`);
    if (a.unmapped.length) c.lines.push(`Zusätzlich angezeigt: ${a.unmapped.join(', ')}`);
    if (!a.hasName) c.warn.push('Keine Namensspalte erkannt (z. B. „Nachname“ und „Vorname“ oder „Name“).');
    if (a.sensitive.length) {
      c.warn.push(`Diese Spalten sehen vertraulich aus: ${a.sensitive.join(', ')}. Wer die Tabelle lesen darf, sieht sie – in der App und in Google Tabellen. Tipp: eine eigene Tabelle nur mit den freigebbaren Spalten anlegen (z. B. per IMPORTRANGE) und diese verbinden.`);
    }
    if (d && a.items.length) {
      const own = a.items.filter((x) => x.email.endsWith(`@${d}`)).length;
      c.lines.push(`${own} von ${a.items.length} Einträgen mit E-Mail-Adresse @${d} (sonst ordnet die App über den Namen zu)`);
    }
    await addSharing(c, t.adressen);
  });

  await add('News-Tabelle', async (c) => {
    if (!t.news) throw new Error('Keine Tabellen-ID eingetragen – „Fehlendes neu anlegen“ legt sie an.');
    const meta = await sheets.getMeta(t.news);
    if (!meta.sheets.some((s) => s.properties.title === SHEETS.news)) throw new Error(`Tabellenblatt „${SHEETS.news}“ fehlt`);
    c.detail = `„${meta.properties.title}“`;
    await addSharing(c, t.news);
  });

  const folderCheck = async (c, id, kind) => {
    if (!id) throw new Error('Keine Ordner-ID eingetragen');
    const f = await drive.getFile(id, 'id,name,mimeType,driveId');
    if (f.mimeType !== drive.FOLDER) throw new Error('Die ID gehört nicht zu einem Ordner');
    const scope = f.driveId ? { corpora: 'drive', driveId: f.driveId } : {};
    if (kind === 'zeitung') {
      const { files, folders } = await drive.listTree(id, { depth: 2, filter: "mimeType = 'application/pdf'", fields: 'id,name,mimeType,parents', ...scope });
      const undated = files.map((x) => issueFromFile(x)).filter((i) => !i.year).length;
      c.detail = `„${f.name}“ · ${files.length} Ausgaben (PDF)${folders.length ? ` in ${folders.length} Unterordnern` : ''}`;
      if (!files.length) c.warn.push('Keine PDF-Dateien gefunden (gesucht wird bis zwei Ordnerebenen tief).');
      if (undated) c.lines.push(`${undated} ohne erkennbares Jahr – Tipp: Dateinamen wie „2026-1 Titel.pdf“ (Jahr-Nummer)`);
    } else if (kind === 'lieder') {
      const { files, folders } = await drive.listTree(id, { depth: 3, filter: `mimeType != '${drive.FOLDER}'`, fields: 'id,name,mimeType,parents', ...scope });
      const songs = files.filter(isSongFile).map((x) => songFromFile(x));
      const pdfs = songs.filter((s) => s.kind === 'pdf').length;
      const imgs = songs.length - pdfs;
      const rubriken = new Set(songs.map((s) => s.category).filter(Boolean)).size;
      c.detail = `„${f.name}“ · ${songs.length} ${songs.length === 1 ? 'Lied' : 'Lieder'}${songs.length ? ` (${pdfs} PDF${imgs ? `, ${imgs} ${imgs === 1 ? 'Bild' : 'Bilder'}` : ''})` : ''}${rubriken ? ` in ${rubriken} ${rubriken === 1 ? 'Rubrik' : 'Rubriken'}` : ''}`;
      if (!songs.length) c.warn.push(`Keine PDFs oder Bilder gefunden (gesucht wird bis drei Ordnerebenen tief${folders.length ? `, ${folders.length} Unterordner` : ''}).`);
      const other = files.filter((x) => !isSongFile(x)).map((x) => x.name);
      if (other.length) c.lines.push(`${other.length} weitere Dateien zeigt die App nicht an: ${short(other, 4)} – Tipp: als PDF oder JPG ablegen`);
      const numbered = songs.filter((s) => s.nr).length;
      if (numbered && numbered < songs.length) c.lines.push(`${songs.length - numbered} ohne Liednummer im Dateinamen – sortiert nach Titel ans Ende (Tipp: „012 Titel.pdf“)`);
    } else {
      const { files, folders } = await drive.listTree(id, { depth: 2, filter: "mimeType contains 'image/'", fields: 'id,name,mimeType,parents', ...scope });
      const albums = new Set(files.map((x) => x.parentId)).size;
      c.detail = `„${f.name}“ · ${albums} Alben · ${files.length} Fotos`;
      if (!files.length) c.warn.push(`Keine Fotos gefunden (gesucht wird bis zwei Ordnerebenen tief${folders.length ? `, ${folders.length} Unterordner` : ''}).`);
    }
    await addSharing(c, id);
  };
  await add('Ordner Bundesbote', (c) => folderCheck(c, config.zeitungOrdnerId, 'zeitung'));
  await add('Ordner Liedermappe', async (c) => {
    // freiwillig: ohne Ordner ist die Liedermappe in der App einfach ausgeblendet
    if (!String(config.liedermappeOrdnerId || '').trim()) {
      c.detail = 'Nicht eingetragen – die Liedermappe ist in der App ausgeblendet (freiwillig).';
      return;
    }
    await folderCheck(c, config.liedermappeOrdnerId, 'lieder');
  });
  await add('Ordner DS-Zeitung', async (c) => {
    // freiwillig wie die Liedermappe; Ausgaben werden wie beim Bundesboten gezählt
    if (!String(config.dsZeitungOrdnerId || '').trim()) {
      c.detail = 'Nicht eingetragen – die DS-Zeitung ist in der App ausgeblendet (freiwillig).';
      return;
    }
    await folderCheck(c, config.dsZeitungOrdnerId, 'zeitung');
  });
  await add('Ordner Galerie', (c) => folderCheck(c, config.galerieOrdnerId, 'galerie'));

  await add('Einwilligungsliste (vertraulich)', async (c) => {
    if (!t.einwilligungen) throw new Error('Noch nicht eingetragen – „Fehlendes neu anlegen“ legt sie an (oder Mehr → Datenschutz → „Einwilligungen aller Mitglieder“).');
    const meta = await sheets.getMeta(t.einwilligungen);
    const missing = Object.values(CONSENT_TABS).filter((n) => !meta.sheets.some((s) => s.properties.title === n));
    if (missing.length) throw new Error(`Tabellenblatt „${missing.join('“, „')}“ fehlt`);
    // vertraulich? Keine Freigabe an Gruppe, Domain oder „jeder mit Link“
    const perms = await drive.listPermissions(t.einwilligungen).catch(() => null);
    const wide = (perms || []).filter((p) => WIDE.includes(p.type));
    if (wide.length) throw new Error(`Achtung: für ${wide.map(who).join(', ')} freigegeben – bitte nur einzelne Verantwortliche freigeben.`);
    const readers = (perms || []).filter((p) => p.role !== 'owner');
    const access = readers.length ? `lesbar für ${readers.length === 1 ? 'eine weitere verantwortliche Person' : `${readers.length} weitere Verantwortliche`}` : 'nur für den Inhaber lesbar';
    c.detail = `„${meta.properties.title}“${perms ? ` · ${access}, nicht für Gruppe oder Domain` : ''}`;
  });
  await add('Google-Verzeichnis (Mitgliederliste)', async (c) => {
    if (!d) { c.detail = 'Nur mit Google Workspace (Workspace-Domain eintragen)'; return; }
    if (!auth.hasScope('https://www.googleapis.com/auth/directory.readonly')) throw new Error('Die Berechtigung „Verzeichnis lesen“ fehlt – einmal ab- und wieder anmelden.');
    let list;
    try {
      list = await people.listDirectory();
    } catch (e) {
      throw new Error(`${e.message}${/disabled|has not been used|not been enabled/i.test(e.message) ? ' – Abhilfe: in der Google Cloud Console die „People API“ aktivieren.' : ''}`);
    }
    c.detail = `${list.length} ${list.length === 1 ? 'Konto' : 'Konten'} im Verzeichnis von ${d}`;
    if (list.length <= 1) {
      c.warn.push('Nur ein Konto sichtbar – dann zeigt „Mitglieder“ nur dich. In der Admin-Konsole unter Verzeichnis → Verzeichniseinstellungen → Freigabeeinstellungen die „Kontaktfreigabe“ einschalten. Neue Konten erscheinen manchmal erst nach einigen Stunden.');
    }
  });

  await add('Google Chat', async (c) => {
    if (!d) { c.detail = 'Nur mit Google Workspace (Workspace-Domain eintragen)'; return; }
    if (config.chat?.aktiv === false) { c.detail = 'In der App ausgeschaltet (chat.aktiv)'; return; }
    if (!auth.hasScope('https://www.googleapis.com/auth/chat.spaces.readonly')) throw new Error('Die Berechtigung für Google Chat fehlt – einmal ab- und wieder anmelden.');
    let spaces;
    try {
      spaces = await chat.listSpaces();
    } catch (e) {
      const hint = /chat app not found|configure the app/i.test(e.message)
        ? ' – Abhilfe: in der Google Cloud Console unter „Google Chat API → Konfiguration“ App-Name, Avatar und Beschreibung eintragen und speichern.'
        : /disabled|has not been used/i.test(e.message) ? ' – Abhilfe: in der Google Cloud Console die „Google Chat API“ aktivieren.' : '';
      throw new Error(`${e.message}${hint}`);
    }
    const rooms = spaces.filter((s) => (s.spaceType || s.type) !== 'DIRECT_MESSAGE');
    c.detail = `${rooms.length} ${rooms.length === 1 ? 'Raum, in dem' : 'Räume, in denen'} du Mitglied bist`;
    c.lines.push('Jeder sieht in der App nur die Räume, in denen er Mitglied ist – neue Konten in Google Chat zu den Räumen hinzufügen.');
    if (!rooms.length) c.warn.push('Noch keine Räume: in Google Chat Räume anlegen (z. B. „Allgemein“) und die Mitglieder hinzufügen.');
  });

  checks.push({ label: 'Schreibschutz', ok: true, detail: 'aktiv – die App ändert nur eigene Daten (Zusage, Profil, eigene Beiträge, Einwilligung, Chat-Nachrichten)', lines: [], warn: [] });
  return checks;
}
