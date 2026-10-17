// Einrichtung (nur für Admins, nur auf ausdrücklichen Klick):
// legt NEUE Ressourcen im eigenen Google-Konto an – vorhandene Daten werden nie verändert.
// Der Schreibschutz lässt dabei nur Änderungen an den gerade neu angelegten Dateien zu.
import { config, eventLink, categoryInfo, appBaseUrl } from '../config.js';
import * as drive from '../google/drive.js';
import * as sheets from '../google/sheets.js';
import * as cal from '../google/calendar.js';
import { beginSetup, endSetup, registerSetupResource } from '../google/guard.js';
import { SHEETS, SHEET_HEADERS, appLinkBlock } from '../backend/common.js';
import { buildMembers, buildAddressRows, buildNews, buildGallery, DEMO_ISSUES } from '../backend/demo-data.js';
import { calendarEventId, newId } from './text.js';
import { addDays, startOfDay, isoDate } from './dates.js';
import { consentRecipients } from './datenschutz.js';
import { prepareConsentSheet, TABLE_TYPE, TABS as CONSENT_TABS } from './einwilligungsliste.js';

const SPREADSHEET = 'application/vnd.google-apps.spreadsheet';

/** IDs aus Google-Links herauslesen */
export function idFromUrl(input) {
  const s = String(input || '').trim();
  let m = s.match(/\/(?:spreadsheets|document|presentation)\/d\/([-\w]{20,})/);
  if (m) return m[1];
  m = s.match(/\/folders\/([-\w]{20,})/);
  if (m) return m[1];
  m = s.match(/[?&]id=([-\w]{20,})/);
  if (m) return m[1];
  m = s.match(/[?&](?:cid|src)=([^&#]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  return s;
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

/**
 * Alles NEU anlegen. options: { withSamples, withIssues, withPhotos, group, domain, testUsers, me, log }
 */
export async function createEverything({ withSamples = true, withIssues = true, withPhotos = true, group = '', domain = '', testUsers = [], me, log }) {
  const name = config.appName;
  const targets = shareTargets({ group, domain, testUsers });
  beginSetup();
  try {
    log('Ordner in Google Drive anlegen …');
    const root = await newFolder(`${name} – Mitglieder-App`);
    const zeitung = await newFolder('Verbindungszeitung', root.id);
    const galerie = await newFolder('Galerie', root.id);
    log(`Ordner „${name} – Mitglieder-App“ mit „Verbindungszeitung“ und „Galerie“ angelegt`, 'ok');

    log('Tabellen anlegen …');
    const adressen = await createSpreadsheet(`${name} – Adressverzeichnis`, root.id, [SHEETS.addresses]);
    const news = await createSpreadsheet(`${name} – News`, root.id, [SHEETS.news]);
    log('Tabellen „Adressverzeichnis“ und „News“ angelegt', 'ok');

    // Einwilligungsliste: bewusst NICHT im freigegebenen Ordner (Freigaben werden vererbt)
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
    log('Vertrauliche Einwilligungsliste angelegt (nur für die Datenschutz-Verantwortlichen)', 'ok');

    log('Kalender anlegen …');
    const calendar = await cal.createCalendar(name, `Termine der ${name}. Zu- und Absagen über die Mitglieder-App: ${appBaseUrl()}`);
    registerSetupResource(calendar.id);
    log(`Kalender „${name}“ angelegt`, 'ok');

    if (targets.length) {
      log('Für die Mitglieder freigeben – nur lesen …');
      for (const id of [root.id, zeitung.id, galerie.id, adressen.id, news.id]) await shareReadOnly(id, targets, log);
      await shareCalendarReadOnly(calendar.id, targets, log);
      log('Freigaben gesetzt: Mitglieder dürfen alles nur lesen', 'ok');
    } else {
      log('Keine Gruppe/Domain/Testkonten angegeben – vorerst nur für dich sichtbar.');
    }

    if (withSamples) {
      log('Beispieldaten eintragen …');
      const rows = buildAddressRows().slice(1, 16);
      const parts = String(me.name || '').trim().split(/\s+/);
      rows.unshift([parts.pop() || '', parts.join(' '), '', '', '', '', '', '', '', '', me.email, '', '', '']);
      await sheets.append(adressen.id, `${sheets.quoteSheet(SHEETS.addresses)}!A1`, rows);
      await sheets.append(news.id, `${sheets.quoteSheet(SHEETS.news)}!A1`, buildNews().slice(0, 4).map((n) => [
        newId('n'), n.date, n.title, n.text, n.image ? `${appBaseUrl()}${n.image}` : '', n.category, n.pinned ? 'ja' : '', n.authorEmail, n.authorName, '',
      ]));
      log('Beispiel-Adressen und -News eingetragen', 'ok');
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

    if (withIssues) {
      log('Beispielausgaben der Zeitung hochladen …');
      for (const issue of DEMO_ISSUES) {
        try {
          await uploadFromApp(issue.url, { name: issue.name, mimeType: 'application/pdf', parents: [zeitung.id] }, 'application/pdf');
          log(`„${issue.name}“ hochgeladen`, 'ok');
        } catch (e) {
          log(`Upload „${issue.name}“ fehlgeschlagen: ${e.message}`, 'err');
        }
      }
    }

    if (withPhotos) {
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
    return {
      kalenderId: calendar.id,
      tabellen: { adressen: adressen.id, news: news.id, einwilligungen: consents.id },
      zeitungOrdnerId: zeitung.id,
      galerieOrdnerId: galerie.id,
      rootFolderId: root.id,
    };
  } finally {
    endSetup();
  }
}

/** Prüft (nur lesend), ob alle eingetragenen Ressourcen erreichbar sind */
export async function checkSetup() {
  const checks = [];
  const add = async (label, fn) => {
    try {
      const detail = await fn();
      checks.push({ label, ok: true, detail: detail || '' });
    } catch (e) {
      checks.push({ label, ok: false, detail: e.message || String(e), status: e.status });
    }
  };
  const t = config.tabellen || {};
  await add('Kalender', async () => {
    if (!config.kalenderId) throw new Error('Keine Kalender-ID eingetragen');
    const r = await cal.listEvents(config.kalenderId, { timeMin: new Date().toISOString(), timeMax: addDays(new Date(), 90).toISOString() });
    return `${r.items.length} Termine in den nächsten 90 Tagen`;
  });
  await add('Tabelle „Adressverzeichnis“', async () => {
    if (!t.adressen) throw new Error('Keine Tabellen-ID eingetragen');
    const meta = await sheets.getMeta(t.adressen);
    return `„${meta.properties.title}“ · Blatt „${meta.sheets[0].properties.title}“`;
  });
  await add('Tabelle „News“', async () => {
    if (!t.news) throw new Error('Keine Tabellen-ID eingetragen');
    const meta = await sheets.getMeta(t.news);
    if (!meta.sheets.some((s) => s.properties.title === SHEETS.news)) throw new Error(`Tabellenblatt „${SHEETS.news}“ fehlt`);
    return `„${meta.properties.title}“`;
  });
  const folderCheck = async (id, what) => {
    if (!id) throw new Error('Keine Ordner-ID eingetragen');
    const f = await drive.getFile(id, 'id,name,mimeType');
    if (f.mimeType !== 'application/vnd.google-apps.folder') throw new Error('Die ID gehört nicht zu einem Ordner');
    const items = await drive.listFiles(`'${id}' in parents and trashed = false`, { fields: 'id,mimeType' });
    return `„${f.name}“ · ${items.length} ${what}`;
  };
  await add('Ordner „Verbindungszeitung“', () => folderCheck(config.zeitungOrdnerId, 'Einträge'));
  await add('Ordner „Galerie“', () => folderCheck(config.galerieOrdnerId, 'Alben/Fotos'));
  await add('Einwilligungsliste (vertraulich)', async () => {
    if (!t.einwilligungen) throw new Error('Noch nicht eingetragen – unter Mehr → Datenschutz → „Einwilligungen aller Mitglieder“ anlegen oder hier verbinden.');
    const meta = await sheets.getMeta(t.einwilligungen);
    const missing = Object.values(CONSENT_TABS).filter((n) => !meta.sheets.some((s) => s.properties.title === n));
    if (missing.length) throw new Error(`Tabellenblatt „${missing.join('“, „')}“ fehlt`);
    // vertraulich? Keine Freigabe an Gruppe, Domain oder „jeder mit Link“
    const perms = await drive.listPermissions(t.einwilligungen).catch(() => null);
    const wide = (perms || []).filter((p) => ['group', 'domain', 'anyone'].includes(p.type));
    if (wide.length) throw new Error(`Achtung: für ${wide.map((p) => p.emailAddress || p.domain || 'alle mit Link').join(', ')} freigegeben – bitte nur einzelne Verantwortliche freigeben.`);
    const readers = (perms || []).filter((p) => p.role !== 'owner');
    return `„${meta.properties.title}“${perms ? ` · lesbar für ${readers.length} Verantwortliche(n), nicht für Gruppe oder Domain` : ''}`;
  });
  checks.push({ label: 'Schreibschutz', ok: true, detail: 'aktiv – die App ändert nur eigene Daten (Zusage, Profil, eigene Beiträge, Einwilligung, Chat-Nachrichten)' });
  return checks;
}
