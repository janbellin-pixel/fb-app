// Testlauf: Google-Backend, Einrichtung und Schreibschutz gegen den API-Nachbau
import { createFakeGoogle } from './fake-google.js';

const out = document.getElementById('out');
const results = [];
let current = '';
function section(name) {
  current = name;
  out.insertAdjacentHTML('beforeend', `<h2>${name}</h2>`);
}
function check(cond, label, detail = '') {
  results.push({ ok: !!cond, label: `${current}: ${label}`, detail });
  out.insertAdjacentHTML('beforeend', `<div class="${cond ? 'ok' : 'fail'}">${cond ? '✓' : '✗'} ${label}${detail && !cond ? ` – <code>${String(detail).replace(/</g, '&lt;')}</code>` : ''}</div>`);
}
async function step(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    check(false, label, e.stack || e.message || e);
    return undefined;
  }
}
/** erwartet, dass fn mit dem Schreibschutz scheitert – und dabei nichts an Google sendet */
async function blocked(label, fake, fn) {
  const before = fake.state.log.length;
  try {
    await fn();
    check(false, label, 'wurde nicht blockiert');
  } catch (e) {
    check(e.code === 'write_blocked' && fake.state.log.length === before, label, `${e.code} ${e.message}`);
  }
}

if (!['127.0.0.1', 'localhost'].includes(location.hostname)) {
  document.body.textContent = 'Diese Testseite läuft nur lokal.';
  throw new Error('Nur lokal');
}

// Lokalen Speicher sichern, damit die App im selben Browser unberührt bleibt
const backup = {};
for (let i = 0; i < localStorage.length; i++) {
  const k = localStorage.key(i);
  if (k.startsWith('fb.')) backup[k] = localStorage.getItem(k);
}
function restore() {
  for (const k of Object.keys(localStorage)) if (k.startsWith('fb.')) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(backup)) localStorage.setItem(k, v);
}
// eigene Einstellungen aus der Einrichtung (fb.configOverride) dürfen den Test nicht beeinflussen
for (const k of Object.keys(backup)) localStorage.removeItem(k);

const me = { email: 'tester@beispiel.de', name: 'Theo Tester', photo: 'https://lh3.googleusercontent.com/a/theo=s96-c', hd: 'beispiel.de', firstName: 'Theo' };
const ANNA = 'anna@beispiel.de';
const ALL_SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/directory.readonly', 'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages', 'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/chat.spaces.create', 'https://www.googleapis.com/auth/chat.memberships',
];

async function run() {
  localStorage.setItem('fb.token', JSON.stringify({ access_token: 'test-token', expires_at: Date.now() + 3600_000, scope: ALL_SCOPES.join(' ') }));
  localStorage.setItem('fb.user', JSON.stringify(me));

  const fake = createFakeGoogle({ me, workspace: true });
  fake.state.myGroup = 'mitglieder@beispiel.de';
  fake.state.myDirectoryId = '111';
  fake.state.directory = [
    { resourceName: 'people/111', names: [{ displayName: 'Theo Tester' }], emailAddresses: [{ value: me.email, metadata: { primary: true } }], photos: [{ url: 'https://lh3.googleusercontent.com/a/theo=s100' }] },
    { resourceName: 'people/222', names: [{ displayName: 'Anna Andere' }], emailAddresses: [{ value: ANNA }], photos: [{ url: 'https://lh3.googleusercontent.com/a/default=s100', default: true }] },
    { resourceName: 'people/333', names: [{ displayName: 'Kasse' }], emailAddresses: [{ value: 'kasse@beispiel.de' }], photos: [] },
  ];
  fake.state.spaces = [
    { name: 'spaces/AAA', displayName: 'Allgemein', spaceType: 'SPACE', lastActiveTime: new Date().toISOString() },
    { name: 'spaces/DM1', spaceType: 'DIRECT_MESSAGE' },
  ];
  fake.state.messages['spaces/AAA'] = [
    { name: 'spaces/AAA/messages/1', text: 'Hallo zusammen', createTime: new Date(Date.now() - 60_000).toISOString(), sender: { name: 'users/222', type: 'HUMAN' } },
  ];
  window.fetch = fake.fakeFetch;
  try { await caches.delete('fb-lieder'); } catch { /* egal */ }

  const { config } = await import('../js/config.js');
  Object.assign(config, {
    googleClientId: 'test.apps.googleusercontent.com', workspaceDomain: 'beispiel.de', mitgliederGruppe: 'mitglieder@beispiel.de',
    appUrl: 'https://beispiel.github.io/fb-app/', admins: [me.email], ausgeblendeteKonten: ['kasse@beispiel.de'], testMitglieder: [],
  });
  const drive = await import('../js/google/drive.js');
  const sheets = await import('../js/google/sheets.js');
  const cal = await import('../js/google/calendar.js');

  /* ---------------------------------------------------------------- Einrichtung */
  section('Einrichtung (legt nur Neues an)');
  const setup = await import('../js/lib/setup.js');
  const logs = [];
  fake.state.setupPhase = true;
  const res = await step('createEverything', () => setup.createEverything({
    withSamples: true, withIssues: true, withPhotos: true, group: config.mitgliederGruppe, domain: 'beispiel.de', testUsers: [], me,
    log: (t, k) => logs.push(`${k || '·'} ${t}`),
  }));
  fake.state.setupPhase = false;
  check(res?.kalenderId?.endsWith('@group.calendar.google.com'), 'Kalender angelegt', JSON.stringify(res));
  check(res?.tabellen?.adressen && res?.tabellen?.news && !res?.tabellen?.mitglieder, 'nur Adressen- und News-Tabelle (keine beschreibbare Mitgliedertabelle)');
  check(res?.tabellen?.einwilligungen, 'vertrauliche Einwilligungsliste angelegt');
  check(res?.zeitungOrdnerId && res?.galerieOrdnerId && res?.liedermappeOrdnerId && res?.dsZeitungOrdnerId, 'Ordner für Bundesbote, DS-Zeitung, Liedermappe und Galerie angelegt');
  check(!logs.some((l) => l.startsWith('err')), 'keine Fehler im Protokoll', logs.filter((l) => l.startsWith('err')).join(' | '));
  if (!res) return;
  Object.assign(config, { kalenderId: res.kalenderId, tabellen: res.tabellen, zeitungOrdnerId: res.zeitungOrdnerId, liedermappeOrdnerId: res.liedermappeOrdnerId, dsZeitungOrdnerId: res.dsZeitungOrdnerId, galerieOrdnerId: res.galerieOrdnerId });
  check(fake.state.permissions.length > 0 && fake.state.permissions.every((p) => p.role === 'reader'), 'Mitglieder bekommen überall nur Leserechte', JSON.stringify(fake.state.permissions.filter((p) => p.role !== 'reader')));
  check(fake.state.acls.every((a) => a.role === 'reader'), 'Kalender nur lesbar freigegeben');
  const fbCal = fake.state.calendars[res.kalenderId];
  check(fbCal.events.size === 7, '7 Beispieltermine', fbCal.events.size);
  const anyEv = [...fbCal.events.values()][0];
  check(anyEv.description.includes(`https://beispiel.github.io/fb-app/#/termin/${anyEv.id}`), 'App-Link in der Terminbeschreibung');
  const pdfs = [...fake.state.files.values()].filter((f) => f.mimeType === 'application/pdf');
  check(pdfs.length === 3 && pdfs.every((f) => f.parents.includes(res.zeitungOrdnerId)), '3 Zeitungen hochgeladen', pdfs.length);
  const albums = [...fake.state.files.values()].filter((f) => f.parents.includes(res.galerieOrdnerId));
  check(albums.length === 3, '3 Galerie-Alben angelegt', albums.length);
  const checks = await step('checkSetup', () => setup.checkSetup());
  check(checks?.every((c) => c.ok), 'Verbindungsprüfung: alles grün', JSON.stringify(checks?.filter((c) => !c.ok)));
  const cl0 = checks?.find((c) => c.label === 'Ordner Liedermappe');
  check(cl0?.ok && cl0.warn.some((w) => w.includes('Keine PDFs oder Bilder')), 'Liedermappe: neuer, leerer Ordner – Hinweis statt Fehler', JSON.stringify(cl0));
  check(fake.state.permissions.some((p) => p.file === res.liedermappeOrdnerId && p.role === 'reader'), 'neuer Liedermappen-Ordner für Mitglieder nur lesbar');
  const cd0 = checks?.find((c) => c.label === 'Ordner DS-Zeitung');
  check(cd0?.ok && cd0.warn.some((w) => w.includes('Keine PDF-Dateien')), 'DS-Zeitung: neuer, leerer Ordner – Hinweis statt Fehler', JSON.stringify(cd0));
  check(fake.state.permissions.some((p) => p.file === res.dsZeitungOrdnerId && p.role === 'reader'), 'neuer Ordner der DS-Zeitung für Mitglieder nur lesbar');

  // Noten, die der Liederwart (ein anderes Mitglied) in die Liedermappe gelegt hat
  const LW = { ownerEmail: 'liederwart@beispiel.de', ownerName: 'Liederwart' };
  const DIR = 'application/vnd.google-apps.folder';
  const lK = fake.addFile({ ...LW, name: 'Kommerslieder', mimeType: DIR, parents: [res.liedermappeOrdnerId] });
  const lV = fake.addFile({ ...LW, name: 'Volkslieder', mimeType: DIR, parents: [res.liedermappeOrdnerId] });
  const lW = fake.addFile({ ...LW, name: 'Wanderlieder', mimeType: DIR, parents: [lV.id] });
  const song1 = fake.addFile({ ...LW, name: '001 Gaudeamus igitur.pdf', mimeType: 'application/pdf', parents: [lK.id], content: new TextEncoder().encode('%PDF-1.4 Gaudeamus').buffer });
  fake.addFile({ ...LW, name: '12 - Burschen heraus.pdf', mimeType: 'application/pdf', parents: [lK.id] });
  fake.addFile({ ...LW, name: 'Nr. 2 Student sein.pdf', mimeType: 'application/pdf', parents: [lK.id] });
  fake.addFile({ ...LW, name: '003 Ergo bibamus.pdf', mimeType: 'application/pdf', parents: [res.liedermappeOrdnerId] });
  fake.addFile({ ...LW, name: 'Das Wandern.jpg', mimeType: 'image/jpeg', parents: [lW.id] });
  fake.addFile({ ...LW, name: 'Liederbuch.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', parents: [res.liedermappeOrdnerId] });
  fake.addFile({ ...LW, name: 'Notizen.mscz', mimeType: 'application/octet-stream', parents: [lK.id] });
  // Ausgaben der DS-Zeitung, die der Pressewart (ein anderes Mitglied) in ihren Ordner gelegt hat
  const PW = { ownerEmail: 'pressewart@beispiel.de', ownerName: 'Pressewart' };
  const ds1 = fake.addFile({ ...PW, name: '2026-2 DS-Zeitung.pdf', mimeType: 'application/pdf', parents: [res.dsZeitungOrdnerId], content: new TextEncoder().encode('%PDF-1.4 DS-Zeitung').buffer });
  fake.addFile({ ...PW, name: '2026-1 DS-Zeitung.pdf', mimeType: 'application/pdf', parents: [res.dsZeitungOrdnerId] });
  fake.addFile({ ...PW, name: 'Hinweise.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', parents: [res.dsZeitungOrdnerId] });

  /* ---------------------------------------------------------------- Schreibschutz */
  section('Schreibschutz: gemeinsame Daten bleiben unverändert');
  const eventId = anyEv.id;
  await blocked('Termin im Verbindungskalender ändern', fake, () => cal.patchEvent(res.kalenderId, eventId, { summary: 'Hack' }));
  await blocked('Termin im Verbindungskalender löschen', fake, () => cal.deleteEvent(res.kalenderId, eventId));
  await blocked('neuen Termin im Verbindungskalender anlegen', fake, () => cal.insertEvent(res.kalenderId, { summary: 'X', start: { date: '2026-12-01' }, end: { date: '2026-12-02' } }));
  await blocked('im eigenen Kalender mehr als die Antwort ändern', fake, () => cal.patchEvent('primary', eventId, { summary: 'Hack', attendees: [] }));
  await blocked('Adressverzeichnis ergänzen', fake, () => sheets.append(res.tabellen.adressen, "'Adressen'!A1", [['Hack']]));
  await blocked('Adressverzeichnis überschreiben', fake, () => sheets.update(res.tabellen.adressen, "'Adressen'!A2", [['Hack']]));
  await blocked('News-Tabelle formatieren', fake, () => sheets.batchUpdate(res.tabellen.news, [{}]));
  await blocked('Zeitung umbenennen', fake, () => drive.updateFile(pdfs[0].id, { name: 'Hack.pdf' }));
  await blocked('Zeitung in den Papierkorb legen', fake, () => drive.trashFile(pdfs[0].id));
  await blocked('Datei in den Zeitungsordner legen', fake, () => drive.createFile({ name: 'x.json', parents: [res.zeitungOrdnerId] }));
  await blocked('Lied umbenennen', fake, () => drive.updateFile(song1.id, { name: 'Hack.pdf' }));
  await blocked('Lied in den Papierkorb legen', fake, () => drive.trashFile(song1.id));
  await blocked('Datei in die Liedermappe legen', fake, () => drive.createFile({ name: 'x.pdf', parents: [res.liedermappeOrdnerId] }));
  await blocked('DS-Zeitung umbenennen', fake, () => drive.updateFile(ds1.id, { name: 'Hack.pdf' }));
  await blocked('DS-Zeitung in den Papierkorb legen', fake, () => drive.trashFile(ds1.id));
  await blocked('Datei in den Ordner der DS-Zeitung legen', fake, () => drive.createFile({ name: 'x.pdf', parents: [res.dsZeitungOrdnerId] }));
  await blocked('Liedermappe neu freigeben', fake, () => drive.addPermission(res.liedermappeOrdnerId, { type: 'anyone', role: 'reader' }));
  await blocked('Galerie-Ordner neu freigeben', fake, () => drive.addPermission(res.galerieOrdnerId, { type: 'anyone', role: 'writer' }));
  await blocked('Datei verschieben (addParents)', fake, () => drive.updateFile('irgendwas', {}, { addParents: res.galerieOrdnerId }));
  await blocked('Kalender-Freigabe ändern', fake, () => cal.insertAcl(res.kalenderId, { role: 'writer', scope: { type: 'default' } }));
  await blocked('neuen Kalender anlegen (außerhalb der Einrichtung)', fake, () => cal.createCalendar('X'));

  /* ---------------------------------------------------------------- Mitglieder */
  section('Mitglieder & eigenes Profil');
  // Anna hat ihr Profil schon angelegt (Datei in IHREM Drive) – und versucht, sich als Theo auszugeben
  const annaProfile = fake.addFile({ name: 'Mein Profil.json', appProperties: { fbTyp: 'profil' }, description: JSON.stringify({ kneipname: 'Annabella', ueberMich: 'Hallo!' }), ownerEmail: ANNA, ownerName: 'Anna Andere' });
  fake.addFile({ name: 'Fake.json', appProperties: { fbTyp: 'profil', fbEmail: me.email }, description: JSON.stringify({ kneipname: 'Gefälscht', wohnort: 'Nirgendwo' }), ownerEmail: ANNA, ownerName: 'Anna Andere', modifiedTime: '2026-01-01T10:00:00Z' });
  const { GoogleBackend } = await import('../js/backend/google-backend.js');
  const b = new GoogleBackend(me);
  const members = await step('listMembers', () => b.listMembers());
  const anna = members?.find((m) => m.email === ANNA);
  check(anna?.kneipname === 'Annabella' && anna?.ueberMich === 'Hallo!' && !anna?.wohnort, 'Annas Profil aus ihrer neuesten eigenen Datei', JSON.stringify(anna));
  check(!members?.some((m) => m.email === 'kasse@beispiel.de'), 'ausgeblendetes Konto fehlt');
  const theo0 = members?.find((m) => m.email === me.email);
  check(theo0 && theo0.kneipname !== 'Gefälscht', 'fremde Datei kann sich nicht als mein Profil ausgeben', JSON.stringify(theo0));
  check(anna && anna.photo === '', 'Google-Standardbild ignoriert (App zeigt Initialen)');
  await step('saveMyProfile (neu)', () => b.saveMyProfile({ kneipname: 'Testo', status: 'Fux', ueberMich: 'Ich teste.' }));
  await step('saveMyProfile (ändern)', () => b.saveMyProfile({ kneipname: 'Testo II', status: 'Fux', ueberMich: 'Ich teste weiter.' }));
  const myProfiles = [...fake.state.files.values()].filter((f) => f.appProperties.fbTyp === 'profil' && f.ownerEmail === me.email);
  check(myProfiles.length === 1, 'genau eine eigene Profildatei (kein Duplikat)', myProfiles.length);
  check(JSON.parse(myProfiles[0]?.description || '{}').kneipname === 'Testo II', 'Profil in eigener Datei gespeichert');
  const folder = [...fake.state.files.values()].find((f) => f.appProperties.fbTyp === 'ordner');
  check(folder && folder.ownerEmail === me.email && myProfiles[0]?.parents.includes(folder.id), 'liegt im eigenen App-Ordner');
  const profPerms = fake.state.permissions.filter((p) => p.file === myProfiles[0]?.id);
  check(profPerms.length >= 1 && profPerms.every((p) => p.role === 'reader'), 'für Mitglieder nur lesbar freigegeben', JSON.stringify(profPerms));
  const mine = await step('getMember', () => b.getMember(me.email));
  check(mine?.kneipname === 'Testo II', 'eigenes Profil sichtbar', JSON.stringify(mine));
  await step('saveMyProfile (Tätigkeit, Angebot)', () => b.saveMyProfile({
    kneipname: 'Testo II', taetigkeit: 'Projektleiter, Beispiel GmbH', angebot: 'Praktikum und Mentoring', strasse: 'Geheimweg 1', plz: '99999',
  }));
  const prof2 = JSON.parse(myProfiles[0]?.description || '{}');
  check(prof2.taetigkeit === 'Projektleiter, Beispiel GmbH' && prof2.angebot === 'Praktikum und Mentoring', 'Tätigkeit und Angebot im eigenen Profil gespeichert', JSON.stringify(prof2));
  check(!('strasse' in prof2) && !('plz' in prof2), 'Anschrift wird NICHT im Profil gespeichert (bleibt im Adressverzeichnis)', JSON.stringify(prof2));
  b.invalidate('profiles');
  const mine2 = await b.getMember(me.email);
  check(mine2?.taetigkeit === 'Projektleiter, Beispiel GmbH' && mine2?.angebot === 'Praktikum und Mentoring', 'neue Felder in der Mitgliederansicht');
  await blocked('Annas Profil ändern', fake, () => drive.updateFile(annaProfile.id, { description: '{"kneipname":"Hack"}' }));
  await blocked('Annas Profil löschen', fake, () => drive.trashFile(annaProfile.id));

  /* ---------------------------------------------------------------- Termine */
  section('Termine & eigene Zusage');
  const now = new Date();
  const range = { from: new Date(now.getTime() - 86400_000), to: new Date(now.getTime() + 90 * 86400_000) };
  const list = await step('listEvents', () => b.listEvents(range));
  check(list?.events.length === 7 && list.canEdit === false, '7 Termine, in der App nicht bearbeitbar', `${list?.events.length} ${list?.canEdit}`);
  const ev = list?.events[0];
  check(ev?.invited === true && ev?.myStatus === 'needsAction', 'eingeladen, Antwort offen');
  check(ev?.category === 'Kneipe' && ev?.dresscode === 'Vollcouleur' && ev?.mandatory === true, 'Kategorie/Kleidung/Pflicht gelesen');
  const manual = b.mapEvent({ id: 'manuell1', summary: 'Herbstkneipe', description: 'Kleidung: Band<br>Pflichttermin<br><br>Bitte pünktlich sein.', start: { dateTime: '2026-11-06T20:00:00+01:00' }, end: { dateTime: '2026-11-06T23:30:00+01:00' } });
  check(manual.dresscode === 'Band' && manual.mandatory && manual.category === 'Kneipe' && manual.description === 'Bitte pünktlich sein.', 'Zusatzangaben aus der Beschreibung (direkt in Google Kalender angelegt)', JSON.stringify(manual));
  const manual2 = b.mapEvent({ id: 'manuell2', summary: 'Treffen', description: 'Kategorie: Stammtisch\nPflicht: nein\nKleidung bitte sportlich', start: { date: '2026-11-07' }, end: { date: '2026-11-08' } });
  check(manual2.category === 'Stammtisch' && !manual2.mandatory && !manual2.dresscode && manual2.description.includes('Pflicht: nein'), 'nur eindeutige Zeilen werden erkannt', JSON.stringify(manual2));
  const before = JSON.stringify({ ...fbCal.events.get(ev.id), attendees: undefined });
  const r1 = await step('rsvp', () => b.rsvp(ev.id, { status: 'accepted', guests: 1, comment: 'Freue mich' }));
  check(r1?.via === 'calendar', 'Zusage über den eigenen Kalender');
  check(JSON.stringify({ ...fbCal.events.get(ev.id), attendees: undefined }) === before, 'Termin selbst unverändert (nur die eigene Antwort)');
  const ev2 = await step('getEvent', () => b.getEvent(ev.id));
  check(ev2?.myStatus === 'accepted' && ev2?.myGuests === 1 && ev2?.myComment === 'Freue mich', 'Antwort mit Gast und Kommentar sichtbar');
  const lonely = { id: 'fbohneeinladung000', summary: 'Spontaner Stammtisch', start: { dateTime: new Date(now.getTime() + 5 * 86400_000).toISOString() }, end: { dateTime: new Date(now.getTime() + 5 * 86400_000 + 7200_000).toISOString() } };
  fbCal.events.set(lonely.id, lonely);
  const ev3 = await step('getEvent (nicht eingeladen)', () => b.getEvent(lonely.id));
  check(ev3?.invited === false && ev3?.myStatus === 'needsAction', 'nicht eingeladen erkannt – antworten kann man trotzdem', JSON.stringify({ invited: ev3?.invited, myStatus: ev3?.myStatus }));
  const calBefore = JSON.stringify([...fbCal.events.values()]);
  const zusageFiles = () => [...fake.state.files.values()].filter((f) => f.appProperties.fbTyp === 'zusage' && f.ownerEmail === me.email);
  const rz = await step('rsvp ohne Einladung', () => b.rsvp(lonely.id, { status: 'accepted', guests: 2, comment: 'Komme gern', title: lonely.summary, start: lonely.start.dateTime }));
  check(rz?.via === 'app', 'Antwort ohne Einladung über die App', JSON.stringify(rz));
  const zf = zusageFiles()[0];
  check(zusageFiles().length === 1 && zf.parents.includes(folder.id) && zf.appProperties.fbTermin === lonely.id, 'als eigene Datei im eigenen App-Ordner gespeichert');
  const zPerms = fake.state.permissions.filter((p) => p.file === zf?.id);
  check(zPerms.length > 0 && zPerms.every((p) => p.role === 'reader'), 'für Mitglieder nur lesbar freigegeben', JSON.stringify(zPerms));
  check(JSON.stringify([...fbCal.events.values()]) === calBefore, 'Verbindungskalender unverändert');
  const ev4 = await step('getEvent (Antwort aus der App)', () => b.getEvent(lonely.id));
  const meA = ev4?.attendees.find((a) => a.email === me.email);
  check(ev4?.myStatus === 'accepted' && ev4?.myGuests === 2 && ev4?.myComment === 'Komme gern' && meA?.source === 'app', 'eigene Antwort mit Gästen und Kommentar sichtbar', JSON.stringify(meA));
  await step('rsvp ohne Einladung (Schnellabsage)', () => b.rsvp(lonely.id, { status: 'declined' }));
  const zd = JSON.parse(zusageFiles()[0]?.description || '{}');
  check(zusageFiles().length === 1 && zd.status === 'declined' && zd.gaeste === 2 && zd.kommentar === 'Komme gern', 'Änderung in derselben Datei; Gäste und Kommentar bleiben', JSON.stringify(zd));
  // Anna antwortet ebenfalls ohne Einladung (Datei in IHREM Drive) – und versucht, für Theo zuzusagen
  const annaZ = fake.addFile({ name: 'Zusage.json', appProperties: { fbTyp: 'zusage', fbTermin: lonely.id }, description: JSON.stringify({ termin: lonely.id, status: 'accepted', gaeste: 1, kommentar: 'Bis dann' }), ownerEmail: ANNA, ownerName: 'Anna Andere' });
  fake.addFile({ name: 'x.json', appProperties: { fbTyp: 'zusage', fbTermin: lonely.id }, description: JSON.stringify({ termin: lonely.id, konto: me.email, status: 'accepted' }), ownerEmail: ANNA, ownerName: 'Anna Andere', modifiedTime: '2026-01-01T00:00:00Z' });
  const ev5 = await step('getEvent (Antworten anderer)', () => b.getEvent(lonely.id));
  const annaAnt = ev5?.attendees.find((a) => a.email === ANNA);
  check(annaAnt?.status === 'accepted' && annaAnt?.guests === 1 && annaAnt?.comment === 'Bis dann', 'Annas Antwort unter „Wer kommt?“', JSON.stringify(ev5?.attendees));
  check(ev5?.myStatus === 'declined' && ev5.attendees.filter((a) => a.email === me.email).length === 1, 'fremde Datei ändert nichts an meiner Antwort (Inhaber zählt)');
  const list2 = await step('listEvents (mit App-Antworten)', () => b.listEvents(range));
  const l2 = list2?.events.find((x) => x.id === lonely.id);
  check(l2?.myStatus === 'declined' && l2?.attendees.some((a) => a.email === ANNA && a.status === 'accepted'), 'auch in der Terminliste');
  await blocked('Annas Zusage ändern', fake, () => drive.updateFile(annaZ.id, { description: '{"status":"declined"}' }));

  /* ---------------------------------------------------------------- News */
  section('News (nur lesen)');
  const news = await step('listNews', () => b.listNews());
  check(news?.length === 4 && news[0].pinned, '4 Beispielmeldungen, angeheftete zuerst', news?.length);
  check(b.newsSheetUrl().includes(res.tabellen.news), 'Tabelle verlinkt – sie wird in der App nur gelesen');
  // so trägt die Redaktion von Hand ein: deutsches Datum mit Uhrzeit, ohne ID
  const newsTab = fake.state.sheets[res.tabellen.news].tabs[0];
  newsTab.rows.push(['', '17.10.2026 18:30', 'Von Hand eingetragen', 'Text', '', 'Allgemein', '', '', '', '']);
  const manualNews = (await b.listNews()).find((n) => n.title === 'Von Hand eingetragen');
  check(manualNews?.id === `zeile-${newsTab.rows.length}` && manualNews?.date === '2026-10-17T18:30', 'Zeile ohne ID mit deutschem Datum erkannt', JSON.stringify(manualNews));

  /* ---------------------------------------------------------------- News der Redaktion */
  section('News der Redaktion (eigene Dateien)');
  check(await b.canEditNews(), 'Admin darf News schreiben');
  const nid = await step('createNews', () => b.createNews({ title: 'Neue Küche fertig', text: 'Die **Küche** ist fertig.', category: 'Haus', pinned: true }));
  const newsFiles = () => [...fake.state.files.values()].filter((f) => f.appProperties.fbTyp === 'news' && f.ownerEmail === me.email && !f.trashed);
  const nf = fake.state.files.get(nid);
  check(nf && nf.parents.includes(folder.id) && nf.appProperties.fbTyp === 'news', 'als eigene Datei im eigenen App-Ordner');
  const nPerms = fake.state.permissions.filter((p) => p.file === nid);
  check(nPerms.length > 0 && nPerms.every((p) => p.role === 'reader'), 'für Mitglieder nur lesbar', JSON.stringify(nPerms));
  const n1 = await step('listNews (mit eigener News)', () => b.listNews());
  check(n1?.[0]?.id === nid && n1[0].own && n1[0].source === 'app' && n1[0].pinned && n1.length === 6, 'angeheftet ganz oben, neben den Meldungen aus der Tabelle', JSON.stringify(n1?.map((x) => [x.title, x.source, x.pinned])));
  const cv = document.createElement('canvas');
  cv.width = 40; cv.height = 30;
  cv.getContext('2d').fillRect(0, 0, 40, 30);
  const png = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const ref = await step('uploadNewsImage', () => b.uploadNewsImage(new File([png], 'Foto.png', { type: 'image/png' })));
  const imgFile = fake.state.files.get(String(ref).replace('drive:', ''));
  check(String(ref).startsWith('drive:') && imgFile?.mimeType === 'image/jpeg' && imgFile.parents.includes(folder.id) && imgFile.appProperties.fbTyp === 'newsbild', 'Bild verkleinert als JPEG im eigenen App-Ordner', String(ref));
  check(fake.state.permissions.some((p) => p.file === imgFile?.id && p.role === 'reader'), 'Bild für Mitglieder lesbar');
  await step('updateNews', () => b.updateNews(nid, { title: 'Neue Küche eingeweiht', text: 'Mit Foto.', category: 'Haus', pinned: false, image: ref }));
  const nd = JSON.parse(fake.state.files.get(nid)?.description || '{}');
  check(newsFiles().length === 1 && nd.titel === 'Neue Küche eingeweiht' && nd.bild === ref && !nd.angeheftet && nd.bearbeitet, 'Änderung in derselben Datei', JSON.stringify(nd));
  // Anna gehört nicht zur Redaktion und legt trotzdem eine „News“-Datei an
  const annaNews = fake.addFile({ name: 'News.json', appProperties: { fbTyp: 'news' }, description: JSON.stringify({ titel: 'Gefälschte Meldung', text: 'Hack', angeheftet: true }), ownerEmail: ANNA, ownerName: 'Anna Andere' });
  b.invalidate('appNews');
  check(!(await b.listNews()).some((x) => x.id === annaNews.id), 'News von Mitgliedern außerhalb der Redaktion werden ignoriert (Inhaber zählt)');
  config.redaktion = [ANNA];
  const annaItem = (await b.listNews()).find((x) => x.id === annaNews.id);
  check(annaItem && !annaItem.own && annaItem.authorEmail === ANNA, 'Redaktion: News erscheint, aber nicht als eigene', JSON.stringify(annaItem));
  const deniedNews = await b.updateNews(annaNews.id, { title: 'X' }).then(() => false).catch(() => true);
  check(deniedNews && JSON.parse(annaNews.description).titel === 'Gefälschte Meldung', 'fremde News in der App nicht bearbeitbar');
  await blocked('fremde News direkt in Drive ändern', fake, () => drive.updateFile(annaNews.id, { description: '{}' }));
  config.redaktion = [];
  const savedAdmins = config.admins;
  config.admins = ['vorstand@beispiel.de'];
  const deniedCreate = await b.createNews({ title: 'X' }).then(() => false).catch(() => true);
  check(deniedCreate && !(await b.canEditNews()), 'ohne Admin- oder Redaktionsrecht keine News');
  check(!(await b.listNews()).some((x) => x.id === nid), 'eigene News zählt nur, solange man Admin oder Redaktion ist');
  config.admins = savedAdmins;
  await step('deleteNews', () => b.deleteNews(nid));
  check(fake.state.files.get(nid)?.trashed && imgFile?.trashed, 'eigene News samt Bild gelöscht (Papierkorb)');
  check(!(await b.listNews()).some((x) => x.id === nid), 'verschwindet aus der Liste');
  const savedNewsSheet = config.tabellen.news;
  config.tabellen.news = '';
  const nid2 = await step('createNews (ohne Tabelle)', () => b.createNews({ title: 'Ohne Tabelle', text: 'Geht auch.' }));
  const n4 = await step('listNews (ohne Tabelle)', () => b.listNews());
  check(n4?.length === 1 && n4[0].id === nid2, 'News gehen auch ganz ohne News-Tabelle', JSON.stringify(n4?.map((x) => x.title)));
  config.tabellen.news = savedNewsSheet;

  /* ---------------------------------------------------------------- Forum */
  section('Forum (eigene Beiträge)');
  const annaThread = fake.addFile({ name: 'Forum.json', appProperties: { fbTyp: 'forum', fbRolle: 'thema', fbKategorie: 'Allgemeines' }, description: JSON.stringify({ titel: 'Annas Frage', text: 'Wer kommt mit?' }), ownerEmail: ANNA, ownerName: 'Anna Andere', createdTime: new Date(Date.now() - 3600_000).toISOString() });
  const f1 = await step('listForum', () => b.listForum());
  const t1 = f1?.threads.find((t) => t.id === annaThread.id);
  check(t1?.title === 'Annas Frage' && t1?.authorEmail === ANNA && t1?.own === false, 'Annas Thema sichtbar, nicht als eigenes markiert', JSON.stringify(t1));
  const tid = await step('createThread', () => b.createThread({ category: 'Allgemeines', title: 'Mein Thema', text: 'Erster Beitrag' }));
  await step('reply auf Annas Thema', () => b.reply(annaThread.id, 'Ich komme!'));
  const f2 = await b.listForum();
  const mineT = f2.threads.find((t) => t.id === tid);
  check(mineT?.own && mineT?.title === 'Mein Thema', 'eigenes Thema angelegt');
  const myReply = f2.posts.find((p) => p.text === 'Ich komme!');
  check(myReply?.threadId === annaThread.id && myReply?.own, 'eigene Antwort in Annas Thema');
  check(f2.threads.find((t) => t.id === annaThread.id)?.replies === 1, 'Antwort wird gezählt');
  const forumFiles = [...fake.state.files.values()].filter((f) => f.appProperties.fbTyp === 'forum' && f.ownerEmail === me.email);
  check(forumFiles.length === 2 && forumFiles.every((f) => f.parents.includes(folder.id)), 'Beiträge liegen als eigene Dateien im eigenen Ordner');
  await step('editPost', () => b.editPost(myReply.id, 'Ich komme – mit Gast!'));
  check((await b.listForum()).posts.find((p) => p.id === myReply.id)?.edited, 'eigenen Beitrag bearbeitet');
  const deniedEdit = await b.editPost(annaThread.id, 'Hack').then(() => false).catch(() => true);
  check(deniedEdit && JSON.parse(annaThread.description).text === 'Wer kommt mit?', 'Annas Beitrag nicht bearbeitbar');
  await blocked('Annas Thema direkt in Drive ändern', fake, () => drive.updateFile(annaThread.id, { description: '{}' }));
  await step('deletePost', () => b.deletePost(myReply.id));
  check(!(await b.listForum()).posts.some((p) => p.id === myReply.id), 'eigenen Beitrag gelöscht (Papierkorb)');
  await step('deleteThread', () => b.deleteThread(tid));
  check(!(await b.listForum()).threads.some((t) => t.id === tid), 'eigenes Thema gelöscht');
  const deniedDel = await b.deleteThread(annaThread.id).then(() => false).catch(() => true);
  check(deniedDel && !annaThread.trashed, 'Annas Thema nicht löschbar');

  /* ---------------------------------------------------------------- Adressen */
  section('Adressverzeichnis (nur lesen)');
  const a1 = await step('listAddresses', () => b.listAddresses());
  check(a1?.items.length === 16 && a1?.hasBirthdays, '16 Einträge mit Geburtstagen', a1?.items.length);
  fake.newSpreadsheet('altetabelle0000000000000000', 'Alte Adressliste');
  fake.state.sheets.altetabelle0000000000000000.tabs[0].rows = [
    ['Name', 'Wohnort', 'Handy', 'E-Mail-Adresse', 'Geb.', 'Bemerkung'],
    ['Karl Kurz', 'Hamburg', '0170 1234', 'Karl@Example.org', '03.04.1970', 'Schatzmeister a. D.'],
    ['', '', '', '', '', ''],
    ['Max Lang', 'Köln', '', '', '', ''],
  ];
  const saved = config.tabellen.adressen;
  config.tabellen.adressen = 'altetabelle0000000000000000';
  b.invalidate('addrMeta');
  const a2 = await step('listAddresses (eigene Spalten)', () => b.listAddresses());
  const karl = a2?.items.find((x) => x.nachname === 'Kurz');
  check(a2?.items.length === 2, 'Leerzeilen ignoriert', a2?.items.length);
  check(karl?.vorname === 'Karl' && karl?.ort === 'Hamburg' && karl?.mobil === '0170 1234' && karl?.email === 'karl@example.org', 'Spalten erkannt', JSON.stringify(karl));
  check(karl?.geburtstag === '1970-04-03', 'Geburtstag gelesen', karl?.geburtstag);
  config.tabellen.adressen = saved;
  b.invalidate('addrMeta');

  /* ---------------------------------------------------------------- Abgleich mit dem Adressverzeichnis */
  section('Abgleich „Mein Profil“ ↔ Adressverzeichnis');
  const ab = await import('../js/lib/adressabgleich.js');
  const addrs = (await b.listAddresses()).items;
  const ownA = ab.findOwnAddress(addrs, { email: me.email, name: me.name });
  check(ownA.entry?.email === me.email && ownA.via === 'email', 'eigener Eintrag über die E-Mail-Adresse gefunden', JSON.stringify(ownA));
  const fakeList = [
    { name: 'Dr. Karl Kurz', vorname: 'Karl', nachname: 'Kurz', email: 'karl.privat@example.org' },
    { name: 'Max Lang', vorname: 'Max', nachname: 'Lang', email: '' },
    { name: 'Max Lang', vorname: 'Max', nachname: 'Lang', email: '' },
  ];
  check(ab.findOwnAddress(fakeList, { email: 'karl@beispiel.de', name: 'Karl Kurz' }).entry?.nachname === 'Kurz', 'sonst über den Namen (Titel wie „Dr.“ zählen nicht)');
  const amb = ab.findOwnAddress(fakeList, { email: 'max@beispiel.de', name: 'Max Lang' });
  check(!amb.entry && amb.mehrdeutig, 'bei mehreren gleichen Namen lieber keinen Eintrag als den falschen');
  check(ab.vergleichsWert('mobil', '+49 (0)170 123 45') === ab.vergleichsWert('mobil', '0170 12345'), 'Telefon: +49 und 0 gelten als gleich');
  check(ab.vergleichsWert('strasse', 'Musterstr. 5') === ab.vergleichsWert('strasse', 'Musterstraße 5'), 'Straße: „Str.“ = „Straße“');
  check(ab.vergleichsWert('geburtstag', '3.4.1970') === ab.vergleichsWert('geburtstag', '1970-04-03'), 'Geburtstag in jeder Schreibweise');
  check(ab.vergleichsWert('land', 'DE') === ab.vergleichsWert('land', 'Deutschland'), 'Land: DE = Deutschland');
  const entry = { kneipname: 'Testo', status: 'Fux', rezeption: '', strasse: 'Alter Weg 1', plz: '12345', ort: 'Musterstadt', land: 'Deutschland', telefon: '', mobil: '+49 170 1', email: me.email, geburtstag: '2001-02-03' };
  const eing = { ...Object.fromEntries(ab.ALLE_FELDER.map((f) => [f.key, ab.anzeigeWert(entry, f.key)])) };
  check(ab.vergleiche(eing, entry).length === 0, 'unveränderte Angaben: keine Abweichung', JSON.stringify(ab.vergleiche(eing, entry)));
  const diffs = ab.vergleiche({ ...eing, strasse: 'Neuer Weg 9', rezeption: 'WiSe 2020/21', mobil: '' }, entry);
  const art = Object.fromEntries(diffs.map((d) => [d.key, d.art]));
  check(art.strasse === 'anders' && art.rezeption === 'fehlt' && art.mobil === 'entfernen' && diffs.length === 3, 'Abweichungen erkannt: anders, fehlt, entfernen', JSON.stringify(diffs));
  const mail = ab.mailEntwurf({ user: { name: me.name, email: me.email }, eingabe: { ...eing, strasse: 'Neuer Weg 9' }, diffs, gefunden: true });
  const body = decodeURIComponent(mail.href.split('body=')[1]);
  check(mail.href.startsWith(`mailto:${config.adressaenderung}?subject=`) && config.adressaenderung === 'adressaenderung@frankonia-brunonia.de', 'E-Mail an das Postfach für Adressänderungen', mail.href.slice(0, 80));
  check(body.includes('falsch oder unvollstaendig') && body.includes('Neuer Weg 9') && body.includes('bisher: Alter Weg 1') && body.includes(`Google-Konto: ${me.email}`), 'E-Mail enthält die neuen Angaben und den Hinweis', body.slice(0, 200));
  // Yahoo Mail & Co. entschlüsseln Umlaute im mailto-Link falsch („f%3%Cr“) – im Link nur ASCII (E37)
  const umlautEingabe = { ...eing, strasse: 'Lindenstraße 5', ort: 'Köln' };
  const umlautMail = ab.mailEntwurf({ user: { name: 'Jörg Müßig', email: me.email }, eingabe: umlautEingabe, diffs: ab.vergleiche(umlautEingabe, entry), gefunden: true });
  const umlautBody = decodeURIComponent(umlautMail.href.split('body=')[1]);
  const umlautBetreff = decodeURIComponent(umlautMail.href.split('subject=')[1].split('&')[0]);
  check(/^[\x21-\x7e]+$/.test(umlautMail.href) && !/%[89a-f]/i.test(umlautMail.href), 'E-Mail-Link nur mit ASCII-Zeichen (sonst „f%3%Cr“ in Yahoo Mail)', umlautMail.href.slice(0, 160));
  check(umlautBetreff === 'Adressaenderung: Joerg Muessig' && umlautBody.includes('- Strasse und Hausnummer: Lindenstrasse 5 - bisher: Alter Weg 1') && umlautBody.includes('Ort: Koeln') && umlautBody.includes('Viele Gruesse') && !/[^\x00-\x7f]/.test(umlautBody),
    'im Link: Umlaute als ae/oe/ue/ss, Aufzählungspunkt und Gedankenstrich als „-“', `${umlautBetreff} | ${umlautBody.slice(0, 200)}`);
  check(umlautMail.subject === 'Adressänderung: Jörg Müßig' && umlautMail.body.includes('• Straße und Hausnummer: Lindenstraße 5 – bisher: Alter Weg 1'), '„Text kopieren“ behält Umlaute und Zeichen', umlautMail.body.slice(0, 160));
  check(ab.mailAscii('Grüße aus Köln – „Straße“ • é') === 'Gruesse aus Koeln - "Strasse" - e', 'mailAscii: Umlaute, Anführungszeichen, Striche, Akzente', ab.mailAscii('Grüße aus Köln – „Straße“ • é'));
  const cfgMod = await import('../js/config.js');
  check(cfgMod.statusGroup('Aktiver Bursche') === 'Aktivitas' && cfgMod.statusGroup('Inaktiver Bursch') === 'Aktivitas' && cfgMod.statusGroup('Chordame') === 'Chor' && cfgMod.statusGroup('Verkehrsgast') === 'Verkehrsgäste',
    'Status: „Bursche“ (auch alte Schreibweise „Bursch“), Chor und Verkehrsgäste als Gruppen');
  check(ab.vergleichsWert('status', 'Aktiver Bursch') === ab.vergleichsWert('status', 'aktiver  Bursche'), 'Status „Bursch“ und „Bursche“ gelten nicht als Abweichung');
  const vorlage = ab.adressaenderungMail({ name: me.name, email: me.email });
  check(vorlage.href.startsWith(`mailto:${config.adressaenderung || 'adressaenderung@frankonia-brunonia.de'}?subject=`) && decodeURIComponent(vorlage.href).includes(`Adressaenderung: ${ab.mailAscii(me.name)}`) && vorlage.body.includes('Gültig ab:'),
    'Knopf „Adressänderung per E-Mail mitteilen“: Vorlage an das Postfach', vorlage.href.slice(0, 120));
  const writesNow = fake.state.writes.length;
  ab.mailEntwurf({ user: { name: me.name, email: me.email }, eingabe: eing, diffs, gefunden: false });
  check(fake.state.writes.length === writesNow, 'Abgleich und E-Mail-Entwurf schreiben nichts in Google');

  /* ---------------------------------------------------------------- Zeitung & Galerie */
  section('Zeitung & Galerie (nur lesen)');
  const issues = await step('listIssues', () => b.listIssues());
  check(issues?.length === 3 && issues[0].year === 2026 && issues[0].nr === 2, 'neueste Ausgabe zuerst');
  const buf = await step('loadIssue', () => b.loadIssue(issues[0]));
  check(buf instanceof ArrayBuffer && buf.byteLength > 1000, 'PDF geladen');
  const wDs = fake.state.writes.length;
  const dsIssues = await step('listIssues (DS-Zeitung)', () => b.listIssues('ds'));
  check(dsIssues?.length === 2 && dsIssues[0].nr === 2 && dsIssues.every((i) => i.quelle === 'ds'), 'DS-Zeitung: nur PDFs aus ihrem Ordner, neueste zuerst', JSON.stringify(dsIssues?.map((i) => [i.name, i.quelle])));
  const bbAgain = await step('listIssues (Bundesbote erneut)', () => b.listIssues());
  check(bbAgain?.length === 3 && bbAgain.every((i) => i.quelle === 'bundesbote' && !i.name.includes('DS-Zeitung')), 'Bundesbote und DS-Zeitung bleiben getrennt');
  const dsLog = fake.state.log.length;
  const dsBuf = await step('loadIssue (DS-Zeitung)', () => b.loadIssue(dsIssues[0]));
  check(dsBuf instanceof ArrayBuffer && fake.state.log.slice(dsLog).some((l) => l.includes(ds1.id)), 'DS-Zeitung aus Google Drive geladen', dsBuf?.byteLength);
  const dsLog2 = fake.state.log.length;
  await step('loadIssue (DS-Zeitung erneut)', () => b.loadIssue(dsIssues[0]));
  check(fake.state.log.length === dsLog2, 'DS-Zeitung beim zweiten Mal vom Gerät (auch ohne Netz)');
  check(b.issueOpenUrl(dsIssues[0]).includes(ds1.id) && fake.state.writes.length === wDs, 'Link zum Öffnen in Google Drive; Lesen schreibt nichts');
  const dsSaved = config.dsZeitungOrdnerId;
  config.dsZeitungOrdnerId = '';
  const dsErr = await b.listIssues('ds').then(() => null, (e) => e);
  const { hasDsZeitung } = await import('../js/config.js');
  check(dsErr?.code === 'not_configured' && dsErr.message.includes('DS-Zeitung') && !hasDsZeitung(), 'ohne Ordner: DS-Zeitung ausgeblendet, verständliche Meldung', dsErr?.message);
  config.dsZeitungOrdnerId = dsSaved;
  const gal = await step('listGallery', () => b.listGallery());
  check(gal?.albums.length === 3 && gal.albums[0].title === '2026-06 Stiftungsfest', 'Alben, neuestes zuerst', JSON.stringify(gal?.albums.map((a) => a.title)));
  check(gal?.albums[0].photos.length === 4 && gal.albums[0].photos[0].thumb, 'Fotos mit Vorschaubild');
  check(b.photoUrl(gal.albums[0].photos[0], 1600).endsWith('=s1600'), 'Vorschaugröße wählbar');
  check(gal?.albums[0].photos[0].taken === '2026-06-27T18:30:00', 'Aufnahmedatum (EXIF) gelesen', gal?.albums[0].photos[0].taken);
  const full = await step('photoFullUrl', () => b.photoFullUrl(gal.albums[0].photos[0]));
  check(String(full).startsWith('blob:'), 'Original über Anmeldung geladen');

  /* ---------------------------------------------------------------- Liedermappe */
  section('Liedermappe (nur lesen)');
  const sb = await step('listSongs', () => b.listSongs());
  const songTitles = sb?.songs.map((s) => s.title).join(' | ');
  check(sb?.songs.length === 5 && songTitles === 'Gaudeamus igitur | Student sein | Ergo bibamus | Burschen heraus | Das Wandern', 'PDFs und Bilder auch aus Unterordnern, nach Liednummer, ohne Nummer ans Ende', songTitles);
  check(sb?.songs[0].nr === '1' && sb.songs[1].nr === '2' && sb.songs[3].nr === '12' && sb.songs[0].category === 'Kommerslieder' && sb.songs[2].category === '', 'Nummern aus „001 …“, „Nr. 2 …“ und „12 - …“, Rubrik aus dem Ordner', JSON.stringify(sb?.songs.map((s) => [s.nr, s.category])));
  const wand = sb?.songs.find((s) => s.title === 'Das Wandern');
  check(wand?.kind === 'image' && wand.category === 'Volkslieder › Wanderlieder' && !wand.nr, 'Bild aus einem Unterordner zweiter Ebene', JSON.stringify(wand));
  check(sb?.other === 2, 'andere Dateien (Word, MuseScore) werden gezählt, aber nicht angezeigt', sb?.other);
  const common = await import('../js/backend/common.js');
  const mkSong = (name, path) => common.songFromFile({ id: name, name, path, mimeType: 'application/pdf' });
  const perCat = [mkSong('2 B.pdf', ['Kommers']), mkSong('1 A.pdf', ['Kommers']), mkSong('Z.pdf', ['Volk']), mkSong('1 C.pdf', ['Volk'])];
  check(common.songsGrouped(perCat) && common.sortSongs(perCat).map((s) => s.title).join() === 'A,B,C,Z', 'jede Rubrik mit eigenen Nummern: nach Rubriken gegliedert');
  check(!common.songsGrouped(sb?.songs || []), 'durchgehende Nummern: eine Liste nach Nummer');
  const tailNr = common.songFromFile({ name: 'Gaudeamus igitur (Nr. 12).pdf' });
  check(tailNr.nr === '12' && tailNr.title === 'Gaudeamus igitur', 'Nummer auch am Ende („Titel (Nr. 12)“)', JSON.stringify(tailNr));
  const { songMatches } = await import('../js/views/lieder.js');
  const songsFor = (q) => (sb?.songs || []).filter((s) => songMatches(s, q)).map((s) => s.title).join();
  check(songsFor('12') === 'Burschen heraus' && songsFor('Nr. 2') === 'Student sein' && songsFor('gaudeamus') === 'Gaudeamus igitur' && songsFor('wanderlieder') === 'Das Wandern', 'Suche nach Nummer, Titel und Rubrik', [songsFor('12'), songsFor('Nr. 2'), songsFor('gaudeamus'), songsFor('wanderlieder')].join(' / '));
  const logBefore = fake.state.log.length;
  const songBuf = await step('loadSong', () => b.loadSong(sb.songs[0]));
  check(songBuf instanceof ArrayBuffer && songBuf.byteLength > 5 && fake.state.log.slice(logBefore).some((l) => l.includes(song1.id)), 'Noten aus Google Drive geladen', songBuf?.byteLength);
  const logAfter = fake.state.log.length;
  await step('loadSong (erneut)', () => b.loadSong(sb.songs[0]));
  check(fake.state.log.length === logAfter, 'beim zweiten Mal vom Gerät (auch ohne Netz)');
  const offline = await step('songsOffline', () => b.songsOffline(sb.songs));
  check(offline?.size === 1 && offline.has(song1.id), 'auf dem Gerät gespeicherte Lieder erkannt', JSON.stringify([...(offline || [])]));
  check(b.songOpenUrl(sb.songs[0]).includes(song1.id), 'Link zum Öffnen in Google Drive');

  /* ---------------------------------------------------------------- Chat */
  section('Chat (eigene Nachrichten, Direktnachrichten, Gruppen)');
  check(b.chatStatus().available, 'Chat verfügbar (Workspace + Berechtigung)');
  const spaces = await step('listSpaces', () => b.listSpaces());
  check(spaces?.length === 2 && spaces.some((s) => s.name === 'Allgemein' && s.type === 'SPACE') && spaces.some((s) => s.type === 'DIRECT_MESSAGE'), 'Räume und Direktnachrichten in der Liste', JSON.stringify(spaces?.map((s) => [s.name, s.type])));
  const msgs = await step('listMessages', () => b.listMessages('spaces/AAA'));
  check(msgs?.[0]?.sender.name === 'Anna Andere' && !msgs[0].mine, 'Absender über Verzeichnis aufgelöst');
  const lastBefore = await step('latestMessage', () => b.latestMessage('spaces/AAA'));
  check(lastBefore && !lastBefore.mine && lastBefore.sender.name === 'Anna Andere' && lastBefore.text === 'Hallo zusammen', 'letzte Nachricht: von Anna (Hinweis auf Ungelesenes)', JSON.stringify(lastBefore));
  const sent = await step('sendMessage', () => b.sendMessage('spaces/AAA', 'Test 123'));
  check(sent?.mine && sent?.text === 'Test 123', 'eigene Nachricht gesendet');
  const lastAfter = await step('latestMessage (nach dem Senden)', () => b.latestMessage('spaces/AAA'));
  check(lastAfter?.mine && lastAfter.text === 'Test 123', 'danach ist die letzte Nachricht die eigene (zählt nicht als ungelesen)', JSON.stringify(lastAfter));
  // ohne Kontaktfreigabe fehlt das eigene Konto im Verzeichnis: eigene Nachrichten über die Konto-ID aus dem Google-Profil
  const dirBackup = fake.state.directory;
  fake.state.directory = dirBackup.filter((p) => p.resourceName !== 'people/111');
  const bNoDir = new GoogleBackend(me);
  const myIdNoDir = await step('myId (ohne Verzeichnis)', () => bNoDir.myId());
  const ownNoDir = ((await bNoDir.listMessages('spaces/AAA').catch(() => [])) || []).filter((m) => m.mine).map((m) => m.text);
  fake.state.directory = dirBackup;
  check(myIdNoDir === '111' && ownNoDir.join() === 'Test 123', 'eigene Nachrichten auch ohne Verzeichnis erkannt (Konto-ID aus dem Google-Profil)', JSON.stringify([myIdNoDir, ownNoDir]));
  const hw = await import('../js/lib/hinweise.js');
  check(hw.isNewer('2026-10-18T12:00:05Z', '2026-10-18T12:00:00Z') && !hw.isNewer('2026-10-18T12:00:01.500Z', '2026-10-18T12:00:00Z') && hw.isNewer('2026-10-18T12:00:00Z', undefined),
    'Hinweise: neuer als zuletzt gelesen (2 s Spielraum), neue Unterhaltung zählt');
  const freshList = hw.freshNews([{ id: 'a' }, { id: 'b', own: true }, { id: 'c' }], new Set(['a']));
  check(freshList.map((n) => n.id).join() === 'c', 'Hinweise: neue News ohne gesehene und eigene', JSON.stringify(freshList));
  const chatApi = await import('../js/google/chat.js');
  const { api } = await import('../js/google/client.js');
  check(b.chatCanCreate(), 'neue Unterhaltungen möglich (Zustimmung erteilt)');
  const dm = await step('openDirectChat', () => b.openDirectChat(ANNA, 'Anna Andere'));
  const dm2 = await step('openDirectChat (erneut)', () => b.openDirectChat(ANNA));
  check(dm?.id && dm.id === dm2?.id && fake.state.spaces.filter((s) => s.spaceType === 'DIRECT_MESSAGE').length === 2, 'Direktnachricht wird angelegt und danach wiederverwendet');
  const sp2 = await step('listSpaces (mit neuer Direktnachricht)', () => b.listSpaces());
  const dmRow = sp2?.find((s) => s.id === dm?.id);
  check(dmRow?.type === 'DIRECT_MESSAGE' && dmRow.name === 'Anna Andere' && dmRow.with === ANNA, 'Direktnachricht mit Namen der anderen Person', JSON.stringify(dmRow));
  const sentDm = await step('sendMessage (Direktnachricht)', () => b.sendMessage(dm.id, 'Hallo Anna'));
  check(sentDm?.mine && sentDm.text === 'Hallo Anna', 'Nachricht in der Direktnachricht gesendet');
  const grp = await step('createGroup (mit Namen)', () => b.createGroup({ name: 'Stammtisch-Orga', emails: [ANNA] }));
  check(fake.state.spaces.some((s) => s.name === grp?.id && s.spaceType === 'SPACE' && s.displayName === 'Stammtisch-Orga'), 'Gruppe mit Namen als Raum angelegt');
  const grp2 = await step('createGroup (ohne Namen)', () => b.createGroup({ emails: [ANNA, 'karl@beispiel.de'] }));
  check(fake.state.spaces.some((s) => s.name === grp2?.id && s.spaceType === 'GROUP_CHAT'), 'Gruppe ohne Namen als Gruppenunterhaltung');
  const tooFew = await b.createGroup({ emails: [ANNA] }).then(() => null).catch((e) => e);
  check(tooFew && /mindestens zwei/.test(tooFew.message), 'ohne Namen mindestens zwei Personen', tooFew?.message);
  const dup = await b.createGroup({ name: 'Stammtisch-Orga', emails: [ANNA] }).then(() => null).catch((e) => e);
  check(dup && /gibt es schon/.test(dup.message), 'Raumname schon vergeben: verständliche Meldung', dup?.message);
  const addRes = await step('addMembers', () => b.addMembers(grp.id, ['karl@beispiel.de', ANNA]));
  check(addRes?.added.join() === 'karl@beispiel.de' && addRes.already.join() === ANNA, 'Personen hinzugefügt, schon Vorhandene erkannt', JSON.stringify(addRes));
  const gm = await step('listSpaceMembers', () => b.listSpaceMembers(grp.id));
  check(gm?.length === 3 && gm.some((p) => p.email === 'karl@beispiel.de') && gm.some((p) => p.name === 'Anna Andere'), 'Mitglieder der Gruppe', JSON.stringify(gm));
  // Angriffe: nur Personen, nichts löschen, umbenennen oder entfernen
  await blocked('Chat-App (Bot) in eine neue Unterhaltung holen', fake, () => chatApi.setupSpace({ space: { spaceType: 'SPACE', displayName: 'X' }, memberships: [{ member: { name: 'users/app', type: 'BOT' } }] }));
  await blocked('Direktnachricht mit einer Chat-App', fake, () => chatApi.setupSpace({ space: { spaceType: 'DIRECT_MESSAGE', singleUserBotDm: true }, memberships: [{ member: { name: `users/${ANNA}`, type: 'HUMAN' } }] }));
  await blocked('Google-Gruppe zu einem Raum hinzufügen', fake, () => chatApi.addMember(grp.id, { name: 'groups/123', type: 'HUMAN' }));
  await blocked('Raum umbenennen', fake, () => api('https://chat.googleapis.com/v1/spaces/AAA', { method: 'PATCH', body: { displayName: 'Hack' } }));
  await blocked('Raum löschen', fake, () => api('https://chat.googleapis.com/v1/spaces/AAA', { method: 'DELETE' }));
  await blocked('Mitglied entfernen', fake, () => api(`https://chat.googleapis.com/v1/${grp.id}/members/222`, { method: 'DELETE' }));

  /* ---------------------------------------------------------------- privates Konto */
  section('Privates Google-Konto (Prototyp)');
  const priv = new GoogleBackend({ ...me, hd: '' });
  const pm = await step('listMembers', () => priv.listMembers());
  check(pm?.some((m) => m.email === me.email), 'eigenes Konto sichtbar');
  check(priv.chatStatus().reason === 'no-workspace', 'Chat erklärt fehlenden Workspace');

  /* ---------------------------------------------------------------- Datenschutz */
  section('Datenschutz: eigene Einwilligung');
  const dsLib = await import('../js/lib/datenschutz.js');
  const FASSUNG = config.datenschutz.fassung; // aktuelle Fassung der Einwilligungstexte
  config.datenschutz = { ...config.datenschutz, empfaenger: ['vorstand@beispiel.de', me.email] };
  check(dsLib.consentRecipients(me.email).join() === 'vorstand@beispiel.de', 'Empfänger: Verantwortliche ohne mich selbst');
  check((await b.getMyConsent()) === null, 'noch keine Entscheidung → Abfrage beim ersten Öffnen');
  await step('saveMyConsent (erstmals)', () => b.saveMyConsent({ vereinszwecke: true, dachverband: false }));
  const consentFiles = () => [...fake.state.files.values()].filter((f) => f.appProperties.fbTyp === 'einwilligung' && f.ownerEmail === me.email);
  const cf = consentFiles()[0];
  check(consentFiles().length === 1 && cf.parents.includes(folder.id), 'als eigene Datei im eigenen App-Ordner gespeichert');
  const cRec = JSON.parse(cf?.description || '{}');
  check(cRec.vereinszwecke === true && cRec.dachverband === false && cRec.fassung === FASSUNG && cRec.pruefsumme === dsLib.textPruefsumme() && cRec.konto === me.email && cRec.geraet,
    'Entscheidung mit Zeitpunkt, Fassung, Prüfsumme, Konto und Gerät', cf?.description);
  check(cf?.content && new TextDecoder().decode(cf.content).includes('"vereinszwecke": true'), 'lesbarer Nachweis als Dateiinhalt');
  check(cf?.properties?.fbTyp === 'einwilligung', 'auffindbar für das optionale Apps-Script');
  const cPerms = fake.state.permissions.filter((p) => p.file === cf?.id);
  check(cPerms.length === 1 && cPerms[0].type === 'user' && cPerms[0].emailAddress === 'vorstand@beispiel.de' && cPerms[0].role === 'reader',
    'nur für die Verantwortlichen lesbar – nicht für Gruppe oder Domain', JSON.stringify(cPerms));
  check(dsLib.needsDecision(await b.getMyConsent()) === false, 'danach keine erneute Abfrage');
  await step('saveMyConsent (DS erteilt)', () => b.saveMyConsent({ vereinszwecke: true, dachverband: true }));
  await step('saveMyConsent (DS widerrufen)', () => b.saveMyConsent({ vereinszwecke: true, dachverband: false }));
  const c3 = await b.getMyConsent();
  check(consentFiles().length === 1 && c3?.verlauf?.length === 3 && c3.dachverband === false, 'Widerruf in derselben Datei, Verlauf mit allen 3 Entscheidungen', JSON.stringify(c3?.verlauf));
  config.datenschutz = { ...config.datenschutz, empfaenger: ['schriftwart@beispiel.de'] };
  await step('ensureConsentSharing', () => b.ensureConsentSharing(cf.id, cf.appProperties.fbEmpf));
  const cPerms2 = fake.state.permissions.filter((p) => p.file === cf?.id).map((p) => p.emailAddress);
  check(cPerms2.join() === 'schriftwart@beispiel.de', 'Freigabe folgt dem Wechsel der Verantwortlichen (alter Zugriff entfernt)', cPerms2.join());
  config.datenschutz = { ...config.datenschutz, fassung: String(Number(FASSUNG) + 1) };
  check(dsLib.needsDecision(await b.getMyConsent()) === true, 'neue Fassung → alle werden erneut gefragt');
  config.datenschutz = { ...config.datenschutz, fassung: FASSUNG };

  section('Datenschutz: Einwilligungen anderer');
  const annaV = { zeitpunkt: '2026-10-01T10:00:00.000Z', fassung: FASSUNG, pruefsumme: dsLib.textPruefsumme(), vereinszwecke: false, dachverband: true, geraet: 'Android · Chrome' };
  const annaConsent = fake.addFile({ name: 'Datenschutz-Einwilligung (Mitglieder-App).json', appProperties: { fbTyp: 'einwilligung' }, description: JSON.stringify({ konto: ANNA, ...annaV, verlauf: [annaV] }), ownerEmail: ANNA, ownerName: 'Anna Andere', createdTime: annaV.zeitpunkt, modifiedTime: annaV.zeitpunkt });
  // Fälschungsversuch: Anna legt eine Datei an, die angeblich Theos Einwilligung ist
  fake.addFile({ name: 'x.json', appProperties: { fbTyp: 'einwilligung' }, description: JSON.stringify({ konto: me.email, vereinszwecke: false, dachverband: false, fassung: '1', zeitpunkt: '2026-01-01T00:00:00.000Z' }), ownerEmail: ANNA, ownerName: 'Anna Andere', modifiedTime: '2026-01-01T00:00:00.000Z' });
  b.invalidate('consents');
  const allConsents = await step('listConsents', () => b.listConsents());
  const annaC = allConsents?.find((x) => x.email === ANNA);
  const theoC = allConsents?.find((x) => x.email === me.email);
  check(annaC?.dachverband === true && annaC?.vereinszwecke === false && !annaC.kontoAbweichend, 'Annas Entscheidung aus ihrer eigenen Datei', JSON.stringify(annaC));
  check(theoC?.dachverband === false && theoC?.vereinszwecke === true, 'gefälschte Datei ändert nichts an Theos Entscheidung (Inhaber zählt)', JSON.stringify(theoC));
  await blocked('fremde Einwilligung ändern', fake, () => drive.updateFile(annaConsent.id, { description: '{}' }));
  await blocked('fremde Einwilligung neu freigeben', fake, () => drive.addPermission(annaConsent.id, { type: 'anyone', role: 'reader' }));

  section('Datenschutz: vertrauliche Sammeltabelle');
  const tId = res.tabellen.einwilligungen;
  const tFile = fake.state.files.get(tId);
  check(tFile && tFile.parents.length === 0, 'liegt außerhalb des freigegebenen Ordners (keine vererbten Freigaben)');
  check(!fake.state.permissions.some((p) => p.file === tId && ['group', 'domain', 'anyone'].includes(p.type)), 'nicht für Gruppe oder Domain freigegeben');
  check(['Stand', 'Verlauf', 'Fassungen'].every((n) => fake.state.sheets[tId]?.tabs.some((t) => t.title === n)), 'Blätter Stand, Verlauf, Fassungen');
  fake.state.directory.push({ resourceName: 'people/444', names: [{ displayName: 'Karl Kein' }], emailAddresses: [{ value: 'karl@beispiel.de' }], photos: [] });
  b.invalidate('directory');
  const tInfo = await step('consentTable', () => b.consentTable());
  check(tInfo?.own && tInfo.id === tId, 'Tabelle aus der Einrichtung gehört mir → darf sie aktualisieren');
  const s1 = await step('syncConsentTable', () => b.syncConsentTable());
  const tab = (n) => fake.state.sheets[tId].tabs.find((t) => t.title === n).rows;
  const stand = tab('Stand');
  check(stand[0]?.[0] === 'E-Mail (Google-Konto)' && stand.some((r) => r[0] === ANNA && r[2] === 'Nein' && r[3] === 'Ja' && String(r[8]).includes(annaConsent.id)), 'Stand: Annas Zeile mit Nachweis-Link', JSON.stringify(stand));
  check(stand.some((r) => r[0] === me.email && r[2] === 'Ja' && r[3] === 'Nein'), 'Stand: Theos aktuelle Entscheidung');
  check(stand.some((r) => r[0] === 'karl@beispiel.de' && r[9] === 'keine Rückmeldung'), 'Stand: wer noch nicht geantwortet hat');
  check(tab('Verlauf').length - 1 === 4 && s1?.neueEintraege === 4, 'Verlauf: alle 4 Erklärungen (3 von Theo, 1 von Anna)', JSON.stringify(tab('Verlauf')));
  check(tab('Fassungen').length - 1 === 2 && tab('Fassungen')[1][4].includes('Bundesbote'), 'Fassungen: Wortlaut beider Einwilligungen festgehalten');
  const tPerms = fake.state.permissions.filter((p) => p.file === tId);
  check(tPerms.length === 1 && tPerms[0].emailAddress === 'schriftwart@beispiel.de' && tPerms[0].role === 'reader', 'Tabelle lesbar für die aktuellen Verantwortlichen – und nur für sie', JSON.stringify(tPerms));
  const s2 = await step('syncConsentTable (unverändert)', () => b.syncConsentTable());
  check(s2?.neueEintraege === 0 && tab('Verlauf').length - 1 === 4, 'erneuter Abgleich ergänzt nichts doppelt');
  // Anna widerruft auf ihrem Handy (ihre App schreibt in IHRE Datei)
  const annaV2 = { ...annaV, zeitpunkt: '2026-10-16T09:30:00.000Z', dachverband: false };
  annaConsent.description = JSON.stringify({ konto: ANNA, ...annaV2, verlauf: [annaV, annaV2] });
  annaConsent.modifiedTime = annaV2.zeitpunkt;
  b.invalidate('consents');
  const s3 = await step('syncConsentTable (nach Widerruf)', () => b.syncConsentTable());
  check(s3?.neueEintraege === 1 && tab('Stand').some((r) => r[0] === ANNA && r[3] === 'Nein'), 'Widerruf erscheint im Stand und als neuer Verlauf-Eintrag');
  check(tab('Verlauf').some((r) => r[1] === ANNA && r[4] === 'Ja') && tab('Verlauf').some((r) => r[1] === ANNA && r[4] === 'Nein'), 'alter Stand bleibt im Verlauf erhalten');
  try { localStorage.removeItem(`fb.einwilligungSync.${me.email}`); } catch { /* egal */ }
  const auto1 = await step('autoSyncConsents', () => b.autoSyncConsents());
  const auto2 = await b.autoSyncConsents();
  check(auto1?.rueckmeldungen === 2 && auto2 === null, 'automatischer Abgleich beim Öffnen, höchstens alle 15 Minuten');
  await blocked('Adressverzeichnis bleibt trotzdem gesperrt', fake, () => sheets.append(res.tabellen.adressen, "'Adressen'!A1", [['Hack']]));
  // fremde Sammeltabelle (gehört Anna) darf nicht beschrieben werden
  const annaTable = fake.addFile({ name: 'Annas Liste', mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { fbTyp: 'einwilligungen-tabelle' }, ownerEmail: ANNA, ownerName: 'Anna Andere' });
  config.tabellen.einwilligungen = annaTable.id;
  b.invalidate('consentTable');
  const deniedSync = await b.syncConsentTable().then(() => null).catch((e) => e);
  check(deniedSync && /anna@beispiel\.de/.test(deniedSync.message), 'fremde Sammeltabelle wird nicht beschrieben', deniedSync?.message);
  await blocked('fremde Sammeltabelle direkt beschreiben', fake, () => sheets.append(annaTable.id, "'Stand'!A1", [['x']]));
  config.tabellen.einwilligungen = '';
  b.invalidate('consentTable');
  const found = await b.consentTable();
  check(found?.id === tId && found.own, 'ohne Eintrag in config.js findet die App die eigene Tabelle selbst');
  config.tabellen.einwilligungen = tId;
  b.invalidate('consentTable');

  /* ---------------------------------------------------------------- Vorhandenes verbinden */
  section('Einrichtung mit vorhandenen Daten: nur Fehlendes anlegen');
  const calIdT = 'c_abc123@group.calendar.google.com';
  check(setup.idFromUrl(`https://calendar.google.com/calendar/u/0?cid=${btoa(calIdT).replace(/=+$/, '')}`) === calIdT, 'Kalender-Link mit Base64-„cid“ (so kopiert ihn Google Kalender)');
  check(setup.idFromUrl(`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calIdT)}&ctz=Europe%2FBerlin`) === calIdT, 'Einbettungslink mit „src=“');
  check(setup.idFromUrl(`https://calendar.google.com/calendar/ical/${encodeURIComponent(calIdT)}/public/basic.ics`) === calIdT, 'iCal-Adresse');
  check(setup.idFromUrl(calIdT) === calIdT, 'reine Kalender-ID bleibt, wie sie ist');
  check(setup.idFromUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-xy/edit?usp=drive_link') === '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-xy', 'Tabellen-Link mit „?usp=drive_link“');
  check(setup.idFromUrl('https://drive.google.com/drive/folders/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765?usp=drive_link') === '1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765', 'Ordner-Link');

  const OTHER = { ownerEmail: 'schriftwart@beispiel.de', ownerName: 'Schriftwart' };
  const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const soon = (d, h = 0) => new Date(Date.now() + d * 86400_000 + h * 3600_000).toISOString();
  // vorhandener Kalender (gehört dem Vorstand): ein Termin mit, einer ohne Einladung der Gruppe
  const extCal = 'c_vorhanden0000@group.calendar.google.com';
  fake.state.calendars[extCal] = { accessRole: 'reader', events: new Map(), summary: 'Semesterprogramm', owner: 'vorstand@beispiel.de', aclReadable: true };
  fake.state.calendars[extCal].events.set('ext1', { id: 'ext1', summary: 'Stiftungsfest', start: { dateTime: soon(3) }, end: { dateTime: soon(3, 5) }, attendees: [{ email: 'mitglieder@beispiel.de' }] });
  fake.state.calendars[extCal].events.set('ext2', { id: 'ext2', summary: 'Stammtisch', start: { dateTime: soon(6) }, end: { dateTime: soon(6, 2) } });
  fake.state.acls.push({ calendar: extCal, role: 'reader', scope: { type: 'domain', value: 'beispiel.de' } });
  // vorhandene Mitgliederliste: Titelzeile, „Nachname, Vorname“, Hausnummer und PLZ/Ort, vertrauliche Spalten, zweites Blatt
  const extSheet = fake.addFile({ ...OTHER, name: 'Mitgliederliste', mimeType: SHEET_MIME });
  fake.state.sheets[extSheet.id].tabs = [
    { sheetId: 0, title: 'Verstorbene', rows: [['Name'], ['Alt, Albert']] },
    { sheetId: 1, title: 'Aktive', rows: [
      ['Mitgliederliste – Stand Oktober 2026'],
      [],
      ['Name', 'v/o', 'Straße', 'Hausnr.', 'PLZ/Ort', 'E-Mail', 'IBAN', 'Bemerkung'],
      ['Andere, Anna', 'Ännchen', 'Lindenweg', '3', '38106 Braunschweig', 'anna.privat@example.org', 'DE00 1234', ''],
      ['Tester, Theo', '', 'Am Ring', '12a', '38100 Braunschweig', 'theo.privat@example.org', '', 'Kassenwart'],
    ] },
  ];
  fake.state.permissions.push({ file: extSheet.id, id: 'p-any', type: 'anyone', role: 'reader' });
  fake.state.permissions.push({ file: extSheet.id, id: 'p-vs', type: 'user', role: 'writer', emailAddress: 'vorstand@beispiel.de' });
  // vorhandene Zeitung in einer geteilten Ablage: Jahresordner, ein Archiv zwei Ebenen tief
  const SD = { driveId: 'geteilteablage01' };
  const extZ = fake.addFile({ ...OTHER, ...SD, name: 'Zeitung', mimeType: FOLDER_MIME });
  const z2025 = fake.addFile({ ...OTHER, ...SD, name: '2025', mimeType: FOLDER_MIME, parents: [extZ.id] });
  const z2026 = fake.addFile({ ...OTHER, ...SD, name: '2026', mimeType: FOLDER_MIME, parents: [extZ.id] });
  const zArch = fake.addFile({ ...OTHER, ...SD, name: 'Archiv', mimeType: FOLDER_MIME, parents: [extZ.id] });
  const z2003 = fake.addFile({ ...OTHER, ...SD, name: '2003', mimeType: FOLDER_MIME, parents: [zArch.id] });
  fake.addFile({ ...OTHER, ...SD, name: 'Zeitung Nr. 2.pdf', mimeType: 'application/pdf', parents: [z2025.id] });
  fake.addFile({ ...OTHER, ...SD, name: '2026-1 Frühjahr.pdf', mimeType: 'application/pdf', parents: [z2026.id] });
  fake.addFile({ ...OTHER, ...SD, name: 'Heft 1.pdf', mimeType: 'application/pdf', parents: [z2003.id] });
  fake.state.permissions.push({ file: extZ.id, id: 'p-dom', type: 'domain', role: 'reader', domain: 'beispiel.de' });
  // vorhandene Fotos: lose Bilder, ein Album, ein Jahresordner mit Album; die Gruppe darf (zu Unrecht) bearbeiten
  const extG = fake.addFile({ ...OTHER, name: 'Fotos', mimeType: FOLDER_MIME });
  const gK = fake.addFile({ ...OTHER, name: 'Kneipe', mimeType: FOLDER_MIME, parents: [extG.id] });
  const g2023 = fake.addFile({ ...OTHER, name: '2023', mimeType: FOLDER_MIME, parents: [extG.id] });
  const gSF = fake.addFile({ ...OTHER, name: 'Stiftungsfest', mimeType: FOLDER_MIME, parents: [g2023.id] });
  for (const [n, p] of [['lose.jpg', extG.id], ['k1.jpg', gK.id], ['sf1.jpg', gSF.id], ['sf2.jpg', gSF.id]]) fake.addFile({ ...OTHER, name: n, mimeType: 'image/jpeg', parents: [p] });
  fake.state.permissions.push({ file: extG.id, id: 'p-grp', type: 'group', role: 'writer', emailAddress: 'mitglieder@beispiel.de' });
  // vorhandene Liedermappe: jede Rubrik mit eigenen Nummern, ein Bild, ein Handyfoto (HEIC) und ein Word-Dokument
  const extL = fake.addFile({ ...OTHER, name: 'Noten', mimeType: FOLDER_MIME });
  const lKo = fake.addFile({ ...OTHER, name: 'Kommerslieder', mimeType: FOLDER_MIME, parents: [extL.id] });
  const lVo = fake.addFile({ ...OTHER, name: 'Volkslieder', mimeType: FOLDER_MIME, parents: [extL.id] });
  fake.addFile({ ...OTHER, name: '1 Gaudeamus igitur.pdf', mimeType: 'application/pdf', parents: [lKo.id] });
  fake.addFile({ ...OTHER, name: '2 Burschen heraus.pdf', mimeType: 'application/pdf', parents: [lKo.id] });
  fake.addFile({ ...OTHER, name: '1 Das Wandern.png', mimeType: 'image/png', parents: [lVo.id] });
  fake.addFile({ ...OTHER, name: 'Am Brunnen vor dem Tore.pdf', mimeType: 'application/pdf', parents: [lVo.id] });
  fake.addFile({ ...OTHER, name: 'Handyfoto.heic', mimeType: 'image/heic', parents: [lVo.id] });
  fake.addFile({ ...OTHER, name: 'Liederliste.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', parents: [extL.id] });
  fake.state.permissions.push({ file: extL.id, id: 'p-dom-l', type: 'domain', role: 'reader', domain: 'beispiel.de' });
  // vorhandene DS-Zeitung: eine Ausgabe im Jahresordner, eine direkt im Ordner
  const extD = fake.addFile({ ...OTHER, name: 'DS-Zeitung', mimeType: FOLDER_MIME });
  const d2026 = fake.addFile({ ...OTHER, name: '2026', mimeType: FOLDER_MIME, parents: [extD.id] });
  fake.addFile({ ...OTHER, name: 'DS-Zeitung Heft 3.pdf', mimeType: 'application/pdf', parents: [d2026.id] });
  fake.addFile({ ...OTHER, name: '2025-4 DS-Zeitung.pdf', mimeType: 'application/pdf', parents: [extD.id] });
  fake.state.permissions.push({ file: extD.id, id: 'p-dom-d', type: 'domain', role: 'reader', domain: 'beispiel.de' });

  const existing = new Set([...fake.state.files.values()].filter((f) => f.ownerEmail === OTHER.ownerEmail).map((f) => f.id));
  const extNames = new Set([...fake.state.files.values()].filter((f) => existing.has(f.id)).map((f) => f.name));
  const snap = () => JSON.stringify({
    sheet: fake.state.sheets[extSheet.id],
    files: [...fake.state.files.values()].filter((f) => existing.has(f.id)),
    perms: fake.state.permissions.filter((p) => existing.has(p.file)),
    events: [...fake.state.calendars[extCal].events.values()],
    acl: fake.state.acls.filter((a) => a.calendar === extCal),
  });
  const savedCfg = { kalenderId: config.kalenderId, tabellen: { ...config.tabellen }, adressenBlatt: config.adressenBlatt, zeitungOrdnerId: config.zeitungOrdnerId, liedermappeOrdnerId: config.liedermappeOrdnerId, dsZeitungOrdnerId: config.dsZeitungOrdnerId, galerieOrdnerId: config.galerieOrdnerId };
  Object.assign(config, { kalenderId: extCal, tabellen: { adressen: extSheet.id, news: '', einwilligungen: '' }, adressenBlatt: 'Aktive', zeitungOrdnerId: extZ.id, liedermappeOrdnerId: extL.id, dsZeitungOrdnerId: extD.id, galerieOrdnerId: extG.id });
  check(setup.missingResources().join() === 'news,einwilligungen', 'es fehlen nur News-Tabelle und Einwilligungsliste', setup.missingResources().join());
  const snapBefore = snap();
  const w0 = fake.state.writes.length;
  const logs2 = [];
  fake.state.setupPhase = true;
  const res2 = await step('createMissing', () => setup.createMissing({
    withSamples: true, withIssues: true, withPhotos: true, group: config.mitgliederGruppe, domain: 'beispiel.de', testUsers: [], me,
    log: (t, k) => logs2.push(`${k || '·'} ${t}`),
  }));
  fake.state.setupPhase = false;
  check(res2?.created.join() === 'news,einwilligungen', 'angelegt: nur News-Tabelle und Einwilligungsliste', res2?.created.join());
  check(res2 && !res2.kalenderId && !res2.zeitungOrdnerId && !res2.liedermappeOrdnerId && !res2.dsZeitungOrdnerId && !res2.galerieOrdnerId && !res2.tabellen.adressen, 'kein neuer Kalender, keine neue Adressliste, keine neuen Ordner für Bundesbote, DS-Zeitung, Liedermappe oder Fotos');
  check(snap() === snapBefore, 'vorhandene Dateien, Freigaben, Termine und Kalenderfreigaben unverändert');
  const newWrites = fake.state.writes.slice(w0);
  const touched = newWrites.filter((w) => existing.has(w.target) || extNames.has(w.target) || w.target === extCal || String(w.target).startsWith(extCal));
  check(newWrites.length > 0 && touched.length === 0, 'keine einzige Schreibanfrage an Vorhandenes', JSON.stringify(touched));
  const newsFile = fake.state.files.get(res2?.tabellen?.news);
  check(newsFile && newsFile.parents.includes(res2.rootFolderId), 'News-Tabelle im neuen App-Ordner');
  check(fake.state.sheets[res2?.tabellen?.news]?.tabs[0].rows.length === 5, 'Beispiel-News nur in der neuen Tabelle (Kopfzeile + 4)');
  check(!logs2.some((l) => /Zeitung hochladen|Galerie hochladen|Beispieltermine|Adressen eingetragen/.test(l)), 'keine Beispielausgaben, -fotos, -termine oder -adressen bei Vorhandenem', logs2.join(' | '));
  check(!logs2.some((l) => l.startsWith('err')), 'keine Fehler im Protokoll', logs2.filter((l) => l.startsWith('err')).join(' | '));
  const newPerms = fake.state.permissions.filter((p) => p.file === res2?.tabellen?.news || p.file === res2?.rootFolderId);
  check(newPerms.length > 0 && newPerms.every((p) => p.role === 'reader'), 'neue News-Tabelle für Mitglieder nur lesbar', JSON.stringify(newPerms));
  check(!fake.state.permissions.some((p) => p.file === res2?.tabellen?.einwilligungen && ['group', 'domain', 'anyone'].includes(p.type)), 'neue Einwilligungsliste nicht für Gruppe oder Domain');
  Object.assign(config, { tabellen: { ...config.tabellen, ...(res2?.tabellen || {}) } });
  check(setup.missingResources().length === 0, 'danach fehlt nichts mehr');
  const again = await setup.createMissing({ me, log: () => {} });
  check(again.created.length === 0, 'erneuter Klick legt nichts doppelt an');

  const c2 = await step('checkSetup (vorhandene Daten)', () => setup.checkSetup());
  const by = (l) => c2?.find((c) => c.label === l);
  const ck = by('Kalender');
  check(ck?.ok && ck.detail.includes('2 Termine') && !ck.warn.length && ck.lines.some((l) => l.startsWith('1 Termin ohne Einladung') && l.includes('über die App')), 'Kalender: Termin ohne Einladung als Hinweis (Zusagen laufen über die App)', JSON.stringify(ck));
  check(ck?.lines.some((l) => l.includes('lesbar für alle in beispiel.de')), 'Kalender-Freigaben gelesen (nur lesend)', JSON.stringify(ck?.lines));
  const ca = by('Adressverzeichnis');
  check(ca?.ok && ca.detail.includes('Blatt „Aktive“') && ca.detail.includes('2 Einträge'), 'Adressen: eingetragenes Blatt, 2 Einträge', JSON.stringify(ca));
  check(ca?.lines.some((l) => l.includes('Zeile 3')) && ca.lines.some((l) => l.includes('Verstorbene')), 'Kopfzeile unter einer Titelzeile gefunden, weiteres Blatt genannt', JSON.stringify(ca?.lines));
  check(ca?.warn.some((w) => w.includes('Jeder mit dem Link') && w.includes('öffentlichen config.js')), 'Warnung: „Jeder mit dem Link“ (die IDs sind öffentlich)', JSON.stringify(ca?.warn));
  check(ca?.warn.some((w) => w.includes('IBAN') && w.includes('Bemerkung')), 'Warnung: vertraulich wirkende Spalten');
  const cz = by('Ordner Bundesbote');
  check(cz?.ok && cz.detail.includes('3 Ausgaben') && !cz.warn.length, 'Zeitung: 3 PDFs in Jahresordnern, Freigabe in Ordnung', JSON.stringify(cz));
  check(fake.state.queries.some((q) => q.driveId === SD.driveId && q.corpora === 'drive'), 'geteilte Ablage gezielt durchsucht');
  const cl = by('Ordner Liedermappe');
  check(cl?.ok && cl.detail.includes('4 Lieder (3 PDF, 1 Bild) in 2 Rubriken') && !cl.warn.length, 'Liedermappe: Lieder und Rubriken gezählt, Freigabe in Ordnung', JSON.stringify(cl));
  check(cl?.lines.some((l) => l.startsWith('2 weitere Dateien') && l.includes('Handyfoto.heic')) && cl.lines.some((l) => l.startsWith('1 ohne Liednummer')), 'Liedermappe: nicht anzeigbare Dateien und fehlende Nummern genannt', JSON.stringify(cl?.lines));
  const cdz = by('Ordner DS-Zeitung');
  check(cdz?.ok && cdz.detail.includes('2 Ausgaben') && !cdz.warn.length, 'DS-Zeitung: Ausgaben auch im Jahresordner, Freigabe in Ordnung', JSON.stringify(cdz));
  const cg = by('Ordner Galerie');
  check(cg?.ok && cg.detail.includes('3 Alben') && cg.detail.includes('4 Fotos'), 'Galerie: auch verschachtelte Alben', JSON.stringify(cg));
  check(cg?.warn.length === 1 && cg.warn[0].includes('Bearbeiten dürfen mitglieder@beispiel.de'), 'Warnung: Gruppe darf bearbeiten (und nur diese)', JSON.stringify(cg?.warn));
  check(by('News-Tabelle')?.ok && !by('News-Tabelle').warn.length && by('Einwilligungsliste (vertraulich)')?.ok, 'neue News-Tabelle und Einwilligungsliste in Ordnung', JSON.stringify([by('News-Tabelle'), by('Einwilligungsliste (vertraulich)')]));
  const j1 = setup.judgeCalendarAcl([{ role: 'reader', scope: { type: 'default' } }, { role: 'writer', scope: { type: 'group', value: 'mitglieder@beispiel.de' } }]);
  check(j1.warn.length === 2, 'Kalender: „öffentlich“ und „Gruppe darf ändern“ werden angemahnt', JSON.stringify(j1));
  const j2 = setup.judgeCalendarAcl([{ role: 'freeBusyReader', scope: { type: 'domain', value: 'beispiel.de' } }]);
  check(j2.warn.some((w) => w.includes('frei/belegt')), 'Kalender: nur „frei/belegt“ reicht nicht');
  config.adressenBlatt = 'Gibtsnicht';
  const cWrongTab = await setup.checkSetup();
  check(cWrongTab.find((c) => c.label === 'Adressverzeichnis')?.ok === false, 'falsch eingetragenes Blatt: Fehler statt eines anderen Blattes');
  config.adressenBlatt = 'Aktive';

  section('Vorhandene Daten in der App (nur lesen)');
  const b2 = new GoogleBackend(me);
  const iss = await step('listIssues (Jahresordner)', () => b2.listIssues());
  check(iss?.map((i) => i.year).join() === '2026,2025,2003', 'Ausgaben aus Jahresordnern, neueste zuerst', JSON.stringify(iss?.map((i) => [i.name, i.year, i.nr])));
  check(iss?.[1]?.ausgabe === 'Ausgabe 2/2025' && iss?.[2]?.ausgabe === 'Ausgabe 1/2003', 'Nummer aus „Nr. 2“ bzw. „Heft 1“, Jahr aus dem Ordner', JSON.stringify(iss?.map((i) => i.ausgabe)));
  const dsIss = await step('listIssues (vorhandene DS-Zeitung)', () => b2.listIssues('ds'));
  check(dsIss?.map((i) => i.ausgabe).join() === 'Ausgabe 3/2026,Ausgabe 4/2025', 'DS-Zeitung: Nummer aus „Heft 3“, Jahr aus dem Ordner', JSON.stringify(dsIss?.map((i) => [i.name, i.ausgabe])));
  const gal2 = await step('listGallery (verschachtelt)', () => b2.listGallery());
  const sfAlbum = gal2?.albums.find((x) => x.title === 'Stiftungsfest');
  check(gal2?.albums.length === 3 && sfAlbum?.path.join() === '2023' && sfAlbum.photos.length === 2, 'Album im Jahresordner mit Pfad „2023“', JSON.stringify(gal2?.albums.map((x) => [x.title, x.path, x.photos.length])));
  const sb2 = await step('listSongs (Rubriken mit eigenen Nummern)', () => b2.listSongs());
  check(sb2?.songs.map((s) => s.title).join() === 'Gaudeamus igitur,Burschen heraus,Das Wandern,Am Brunnen vor dem Tore' && sb2.other === 2, 'je Rubrik nach Nummer, HEIC und Word nicht angezeigt', JSON.stringify(sb2?.songs.map((s) => [s.category, s.nr, s.title])));
  const adr = await step('listAddresses (vorhandene Liste)', () => b2.listAddresses());
  const annaA = adr?.items.find((x) => x.nachname === 'Andere');
  check(annaA?.vorname === 'Anna' && annaA?.name === 'Anna Andere' && annaA?.strasse === 'Lindenweg 3' && annaA?.plz === '38106' && annaA?.ort === 'Braunschweig' && annaA?.kneipname === 'Ännchen',
    '„Andere, Anna“, Hausnummer und PLZ/Ort richtig gelesen', JSON.stringify(annaA));
  check(adr?.items.length === 2 && !adr.items.some((x) => x.nachname === 'Alt'), 'nur das eingetragene Blatt (nicht „Verstorbene“)');
  check(annaA?.extras.some((x) => x.label === 'IBAN'), 'nicht zugeordnete Spalten bleiben sichtbar (darum die Warnung in der Prüfung)');
  const mem2 = await step('listMembers (Zuordnung über den Namen)', () => b2.listMembers());
  const annaM = mem2?.find((m) => m.email === ANNA);
  check(annaM?.wohnort === 'Braunschweig' && annaM?.kneipname === 'Annabella', 'private E-Mail im Verzeichnis: Zuordnung über den eindeutigen Namen (eigenes Profil hat Vorrang)', JSON.stringify(annaM));
  Object.assign(config, savedCfg);

  /* ---------------------------------------------------------------- Gesamtbilanz */
  section('Gesamtbilanz');
  const ownWrites = fake.state.writes.filter((w) => w.own).length;
  check(fake.state.violations.length === 0, `kein einziger Schreibzugriff auf fremde oder gemeinsame Daten (${ownWrites} erlaubte eigene Schreibvorgänge)`, fake.state.violations.join(' | '));
}

run()
  .catch((e) => check(false, 'Testlauf abgebrochen', e.stack || e))
  .finally(() => {
    restore();
    const failed = results.filter((r) => !r.ok);
    const summary = `${results.length - failed.length}/${results.length} Prüfungen bestanden`;
    document.getElementById('summary').textContent = summary;
    document.getElementById('summary').className = failed.length ? 'fail' : 'ok';
    window.__testResult = { summary, failed };
    console.log(summary, failed);
  });
