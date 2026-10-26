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
  // Spalten „Name | Vorname“: „Name“ ist dann der Nachname (sonst fehlte der Vorname in Liste und Geburtstagen)
  fake.newSpreadsheet('namevorname000000000000000', 'Mitgliederliste_App');
  fake.state.sheets.namevorname000000000000000.tabs[0].rows = [
    ['Name', 'Vorname', 'Titel', 'Ort'],
    ['Bellin', 'Jan', 'Dr.', 'Braunschweig'],
    ['Max Muster', 'Max', 'Herr', 'Hannover'],
  ];
  config.tabellen.adressen = 'namevorname000000000000000';
  b.invalidate('addrMeta');
  const a3 = await step('listAddresses (Name | Vorname)', () => b.listAddresses());
  const jan = a3?.items.find((x) => x.vorname === 'Jan');
  const maxM = a3?.items.find((x) => x.vorname === 'Max');
  check(jan?.nachname === 'Bellin' && jan.name === 'Dr. Jan Bellin' && jan.titel === 'Dr.', '„Name“ neben „Vorname“ = Nachname; Titel vor dem Namen', JSON.stringify(jan));
  check(maxM?.nachname === 'Muster' && maxM.name === 'Max Muster' && maxM.titel === '', 'voller Name in „Name“ erkannt; Anrede ist kein Titel', JSON.stringify(maxM));
  const { adrName } = await import('../js/views/parts.js');
  const adrText = (a) => { const d = document.createElement('div'); d.innerHTML = String(adrName(a)); return d.textContent; };
  check(adrText(jan) === 'Bellin, Dr. Jan' && adrText(maxM) === 'Muster, Max', 'Anzeige: Nachname, dahinter klein Titel und Vorname', `${adrText(jan)} | ${adrText(maxM)}`);
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
  // Reihenfolge allein nach dem Dateinamen (E39): die zuletzt hochgeladene Datei ist nicht automatisch die neueste Ausgabe
  const zc = await import('../js/backend/common.js');
  const order = (...names) => zc.sortIssues(names.map((name, i) => zc.issueFromFile({ id: `t${i}`, name: `${name}.pdf`, createdTime: `2026-10-1${i}T10:00:00Z` })))
    .map((x) => x.name.replace(/\.pdf$/, '')).join(' | ');
  const orders = [
    [order('DS-Zeitung 1-2026', 'DS-Zeitung 12-2025', 'DS-Zeitung 4-2025'), 'DS-Zeitung 1-2026 | DS-Zeitung 12-2025 | DS-Zeitung 4-2025'],
    [order('DSZ_2025_10', 'DSZ_2025_03', 'DSZ_2024_12'), 'DSZ_2025_10 | DSZ_2025_03 | DSZ_2024_12'],
    [order('Ausgabe 2025-11', 'Ausgabe 2025-02', 'DS-Zeitung 202412'), 'Ausgabe 2025-11 | Ausgabe 2025-02 | DS-Zeitung 202412'],
    [order('DS-Zeitung Juli 2025', 'DS-Zeitung März 2025', 'DS-Zeitung Dezember 2024'), 'DS-Zeitung Juli 2025 | DS-Zeitung März 2025 | DS-Zeitung Dezember 2024'],
    [order('DS-Zeitung Herbst 2025', 'DS-Zeitung Frühjahr 2025', 'DS-Zeitung Winter 2024-25'), 'DS-Zeitung Herbst 2025 | DS-Zeitung Frühjahr 2025 | DS-Zeitung Winter 2024-25'],
    [order('DS-Zeitung Nr. 116', 'DS-Zeitung Nr. 115', 'DS-Zeitung Nr. 99'), 'DS-Zeitung Nr. 116 | DS-Zeitung Nr. 115 | DS-Zeitung Nr. 99'],
    [order('DS-Zeitung 10', 'DS-Zeitung 9'), 'DS-Zeitung 10 | DS-Zeitung 9'],
    [order('DS-Zeitung 26.11.2025', 'DS-Zeitung 05.11.2025', 'DS-Zeitung 15.03.2025'), 'DS-Zeitung 26.11.2025 | DS-Zeitung 05.11.2025 | DS-Zeitung 15.03.2025'],
    [order('DSZ 20251126', 'DSZ 20250815', 'DS-Zeitung 20241201'), 'DSZ 20251126 | DSZ 20250815 | DS-Zeitung 20241201'],
    [order('DS-Zeitung 26.11.25', 'DS-Zeitung 15.03.25', 'DS-Zeitung 05.12.24'), 'DS-Zeitung 26.11.25 | DS-Zeitung 15.03.25 | DS-Zeitung 05.12.24'],
    [order('DS-Zeitung 26112025', 'DS-Zeitung 01062025'), 'DS-Zeitung 26112025 | DS-Zeitung 01062025'],
    [order('Ausgabe A 12', 'Ausgabe B 9'), 'Ausgabe A 12 | Ausgabe B 9'],
    [order('2026-2 Bundesbote SoSe 2026', '2026-1 Bundesbote WiSe 2025-26', '2025-2 Bundesbote SoSe 2025'), '2026-2 Bundesbote SoSe 2026 | 2026-1 Bundesbote WiSe 2025-26 | 2025-2 Bundesbote SoSe 2025'],
  ];
  check(orders.every(([got, want]) => got === want), 'Ausgaben nach dem Dateinamen geordnet, nicht nach dem Upload-Datum', JSON.stringify(orders.filter(([got, want]) => got !== want)));
  const labels = ['DS-Zeitung März 2025', 'DS-Zeitung Herbst 2025', 'DS-Zeitung Nr. 116', '2026-1 Bundesbote WiSe 2025-26', 'DS-Zeitung 3-2026', 'DS-Zeitung 26.11.2025', 'DSZ 20251126']
    .map((name) => zc.issueFromFile({ name: `${name}.pdf` }).ausgabe);
  check(labels.join() === 'März 2025,Herbst 2025,Ausgabe 116,Ausgabe 1/2026,Ausgabe 3/2026,26.11.2025,26.11.2025', 'Anzeige: Datum, Monat, Jahreszeit oder Nummer; „2025-26“ ist keine Nummer', labels.join());
  const gal = await step('listGallery', () => b.listGallery());
  check(gal?.albums.length === 3 && gal.albums[0].title === '2026-06 Stiftungsfest', 'Alben, neuestes zuerst', JSON.stringify(gal?.albums.map((a) => a.title)));
  check(gal?.albums[0].photos.length === 4 && gal.albums[0].photos[0].thumb, 'Fotos mit Vorschaubild');
  check(b.photoUrl(gal.albums[0].photos[0], 1600).endsWith('=s1600'), 'Vorschaugröße wählbar');
  check(gal?.albums[0].photos[0].taken === '2026-06-27T18:30:00', 'Aufnahmedatum (EXIF) gelesen', gal?.albums[0].photos[0].taken);
  const full = await step('photoFullUrl', () => b.photoFullUrl(gal.albums[0].photos[0]));
  check(String(full).startsWith('blob:'), 'Original über Anmeldung geladen');
  // Fotos hochladen (E46): nur ein Link auf den Upload-Ordner – die App selbst lädt nichts hoch
  check(b.galleryUploadUrl() === '', 'ohne Upload-Ordner kein Knopf „Fotos hochladen“');
  config.galerieUploadOrdnerId = '1UpLoAdOrDnEr0123456789';
  check(b.galleryUploadUrl() === 'https://drive.google.com/drive/folders/1UpLoAdOrDnEr0123456789', 'Upload-Ordner als Link in Google Drive');
  config.galerieUploadOrdnerId = '';
  // Alben bis drei Ebenen tief (Jahr/Semester/Veranstaltung) – mit Pfad für die Ordneransicht
  const FW = { ownerEmail: 'fotowart@beispiel.de', ownerName: 'Fotowart' };
  const gTY = fake.addFile({ ...FW, name: '2025', mimeType: DIR, parents: [res.galerieOrdnerId] });
  const gTS = fake.addFile({ ...FW, name: 'Wintersemester', mimeType: DIR, parents: [gTY.id] });
  const gTK = fake.addFile({ ...FW, name: 'Kneipe', mimeType: DIR, parents: [gTS.id] });
  fake.addFile({ ...FW, name: 'Kneipe 1.jpg', mimeType: 'image/jpeg', parents: [gTK.id], thumbnailLink: 'https://lh3.googleusercontent.com/k1=s220' });
  fake.addFile({ ...FW, name: 'Gruppenbild.jpg', mimeType: 'image/jpeg', parents: [gTY.id], thumbnailLink: 'https://lh3.googleusercontent.com/g1=s220' });
  const wGal = fake.state.writes.length;
  const galTief = await step('listGallery (verschachtelt)', () => b.listGallery());
  const tiefAlbum = galTief?.albums.find((a) => a.id === gTK.id);
  const jahrAlbum = galTief?.albums.find((a) => a.id === gTY.id);
  check(tiefAlbum?.title === 'Kneipe' && tiefAlbum.path.join('/') === '2025/Wintersemester' && tiefAlbum.photos.length === 1, 'Album drei Ebenen tief, mit übergeordneten Ordnern', JSON.stringify(tiefAlbum && [tiefAlbum.title, tiefAlbum.path]));
  check(jahrAlbum?.title === '2025' && jahrAlbum.path.length === 0 && jahrAlbum.photos.length === 1, 'Fotos direkt im Jahresordner: eigenes Album', JSON.stringify(jahrAlbum && [jahrAlbum.title, jahrAlbum.path]));
  const { albumTree } = await import('../js/views/galerie.js');
  const galBaum = albumTree(galTief?.albums || []);
  const knoten2025 = galBaum.children.get('2025');
  check(knoten2025?.album?.id === gTY.id && knoten2025.children.get('Wintersemester')?.children.get('Kneipe')?.album?.id === gTK.id, 'Ordnerbaum für die Ansicht „Ordner“');
  check(fake.state.writes.length === wGal, 'Galerie lesen schreibt nichts');

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
  // Google lehnt das Senden ab (z. B. Chat-Apps nicht erlaubt): Grund kommt bei der App an, ohne Schreibschutz-Kennung
  fake.state.chatSendDenied = "This organization's administrator must allow users to install this Chat app.";
  const denied = await b.sendMessage('spaces/AAA', 'geht nicht').then(() => null).catch((e) => e);
  fake.state.chatSendDenied = '';
  check(denied?.status === 403 && !denied.code && /install this Chat app/.test(denied.message), 'Senden von Google abgelehnt: Grund kommt für die Meldung im Chat an', JSON.stringify([denied?.status, denied?.code, denied?.message]));
  // Direktnachricht, die jemand anderes angefangen hat – ohne Zustimmung aus E30 sind die Mitglieder nicht lesbar
  fake.state.spaces.push({ name: 'spaces/DM9', spaceType: 'DIRECT_MESSAGE', lastActiveTime: new Date().toISOString(), spaceUri: 'https://chat.google.com/dm/DM9?cls=11' });
  fake.state.chatMembers['spaces/DM9'] = ['111', '222'];
  fake.state.messages['spaces/DM9'] = [{ name: 'spaces/DM9/messages/1', text: 'Eine Anmerkung zur App', createTime: new Date().toISOString(), sender: { name: 'users/222', type: 'HUMAN' } }];
  const tokenBackup = localStorage.getItem('fb.token');
  localStorage.setItem('fb.token', JSON.stringify({ access_token: 'test-token', expires_at: Date.now() + 3600_000, scope: ALL_SCOPES.filter((s) => !/chat\.(memberships|spaces\.create)$/.test(s)).join(' ') }));
  const dm9 = (await step('listSpaces (ohne Recht, Mitglieder zu lesen)', () => new GoogleBackend(me).listSpaces()))?.find((s) => s.id === 'spaces/DM9');
  const reads9 = fake.state.log.filter((l) => l.includes('/spaces/DM9/messages')).length;
  const dm9b = (await step('listSpaces (neu geladen)', () => new GoogleBackend(me).listSpaces()))?.find((s) => s.id === 'spaces/DM9');
  const reads9b = fake.state.log.filter((l) => l.includes('/spaces/DM9/messages')).length;
  localStorage.setItem('fb.token', tokenBackup);
  check(dm9?.name === 'Anna Andere' && dm9.with === ANNA, 'Direktnachricht von jemand anderem: Name aus ihren Nachrichten statt „Direktnachricht“', JSON.stringify(dm9));
  check(dm9b?.name === 'Anna Andere' && reads9 === 1 && reads9b === 1, 'Name danach gemerkt – Nachrichten nicht erneut gelesen', JSON.stringify([dm9b?.name, reads9, reads9b]));
  const allg = sp2?.find((s) => s.id === 'spaces/AAA');
  check(dm9?.url === 'https://chat.google.com/dm/DM9?cls=11' && allg?.url === 'https://chat.google.com/room/AAA', 'Link nach Google Chat: von Google (spaceUri), sonst gebaut', JSON.stringify([dm9?.url, allg?.url]));
  // Vorstände kontaktieren (E45): Gruppe mit genau diesen Personen – vorhandene wiederverwenden
  config.vorstand = { aktive: [ANNA, 'Karl@beispiel.de ', me.email], altherren: ['kasse@beispiel.de'] };
  const vorst = b.vorstand();
  check(vorst.aktive.join() === `${ANNA},karl@beispiel.de,${me.email}` && vorst.altherren.join() === 'kasse@beispiel.de', 'Vorstände aus der Konfiguration (klein geschrieben)', JSON.stringify(vorst));
  const nSp = fake.state.spaces.length;
  const av = await step('openGroupChat (Aktivenvorstand)', () => b.openGroupChat(vorst.aktive, 'Aktivenvorstand'));
  check(av?.id === grp2?.id && fake.state.spaces.length === nSp, 'vorhandene Gruppe mit genau diesen Personen wiederverwendet (ich zähle nicht mit)', JSON.stringify([av?.id, grp2?.id]));
  const avRow = (await step('listSpaces (Vorstand)', () => b.listSpaces()))?.find((s) => s.id === grp2?.id);
  check(avRow?.name === 'Aktivenvorstand', 'Gruppe heißt auf diesem Gerät „Aktivenvorstand“', avRow?.name);
  const ah = await step('openGroupChat (eine Person)', () => b.openGroupChat(vorst.altherren, 'Altherrenvorstand'));
  check(fake.state.spaces.find((s) => s.name === ah?.id)?.spaceType === 'DIRECT_MESSAGE', 'nur eine Person: Direktnachricht');
  const nv = await step('openGroupChat (neue Zusammensetzung)', () => b.openGroupChat([ANNA, 'kasse@beispiel.de'], 'Test'));
  const nv2 = await step('openGroupChat (erneut)', () => b.openGroupChat(['kasse@beispiel.de', ANNA], 'Test'));
  check(fake.state.spaces.find((s) => s.name === nv?.id)?.spaceType === 'GROUP_CHAT' && nv.id !== grp2?.id && nv2?.id === nv.id, 'fehlt die Gruppe, wird sie einmal angelegt und danach wiederverwendet', JSON.stringify([nv?.id, nv2?.id]));
  const noOne = await b.openGroupChat([me.email], 'Leer').then(() => null).catch((e) => e);
  check(noOne && /niemand/.test(noOne.message), 'niemand außer mir eingetragen: verständliche Meldung', noOne?.message);
  config.vorstand = { aktive: [], altherren: [] };
  // Bierjunge: Direktnachricht öffnen und „Bierjunge!“ als eigene Nachricht senden – ohne neue Rechte
  const bj = await step('Bierjunge', async () => b.sendMessage((await b.openDirectChat(ANNA, 'Anna Andere')).id, 'Bierjunge!'));
  check(bj?.mine && bj.text === 'Bierjunge!' && fake.state.messages[dm?.id]?.some((x) => x.text === 'Bierjunge!'), '„Bierjunge!“ als eigene Nachricht in der Direktnachricht', JSON.stringify(bj));

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
  await step('saveMyConsent (erstmals)', () => b.saveMyConsent({ vereinszwecke: true, dachverband: false, sichtbar: true }));
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
  await step('saveMyConsent (DS erteilt)', () => b.saveMyConsent({ vereinszwecke: true, dachverband: true, sichtbar: true }));
  await step('saveMyConsent (DS widerrufen)', () => b.saveMyConsent({ vereinszwecke: true, dachverband: false, sichtbar: true }));
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

  section('Papierpost abbestellen (E44)');
  const adminsBefore = config.admins;
  config.admins = [me.email, 'vorstand@beispiel.de'];
  check((await b.getMyPapierpost()) === null, 'noch nichts gewählt');
  await step('saveMyPapierpost (erstmals)', () => b.saveMyPapierpost({ semesterprogramm: true, bundesbote: false }));
  const ppFiles = () => [...fake.state.files.values()].filter((f) => f.appProperties.fbTyp === 'papierpost' && f.ownerEmail === me.email);
  const ppf = ppFiles()[0];
  check(ppFiles().length === 1 && ppf.parents.includes(folder.id), 'eigene Datei im eigenen App-Ordner');
  const ppPerms = fake.state.permissions.filter((p) => p.file === ppf?.id);
  check(ppPerms.length === 1 && ppPerms[0].type === 'user' && ppPerms[0].emailAddress === 'vorstand@beispiel.de' && ppPerms[0].role === 'reader',
    'nur für die Admins lesbar – nicht für Gruppe oder Domain', JSON.stringify(ppPerms));
  await step('saveMyPapierpost (geändert)', () => b.saveMyPapierpost({ semesterprogramm: true, bundesbote: true }));
  const pp2 = await step('getMyPapierpost', () => b.getMyPapierpost());
  check(ppFiles().length === 1 && pp2?.semesterprogramm === true && pp2.bundesbote === true, 'Änderung in derselben Datei', JSON.stringify(pp2));
  const annaPp = fake.addFile({ name: 'Papierpost (Mitglieder-App).json', appProperties: { fbTyp: 'papierpost' }, description: JSON.stringify({ semesterprogramm: false, bundesbote: true }), ownerEmail: ANNA, ownerName: 'Anna Andere', modifiedTime: '2026-10-02T10:00:00.000Z' });
  // Fälschungsversuch: Anna legt eine Datei an, die angeblich Theos Wahl ist
  fake.addFile({ name: 'y.json', appProperties: { fbTyp: 'papierpost' }, description: JSON.stringify({ konto: me.email, semesterprogramm: false, bundesbote: false }), ownerEmail: ANNA, ownerName: 'Anna Andere', modifiedTime: '2026-01-01T00:00:00.000Z' });
  b.invalidate('papierpost');
  const ppList = await step('listPapierpost', () => b.listPapierpost());
  const annaRow = ppList?.find((r) => r.email === ANNA);
  const theoRow = ppList?.find((r) => r.email === me.email);
  check(annaRow?.bundesbote === true && annaRow.semesterprogramm === false && annaRow.name === 'Anna Andere', 'Admins sehen die Abbestellungen der anderen', JSON.stringify(annaRow));
  check(theoRow?.semesterprogramm === true && theoRow.bundesbote === true, 'je Mitglied die neueste eigene Datei (Inhaber laut Google)', JSON.stringify(theoRow));
  await blocked('fremde Papierpost-Wahl ändern', fake, () => drive.updateFile(annaPp.id, { description: '{}' }));
  await blocked('fremde Papierpost-Wahl freigeben', fake, () => drive.addPermission(annaPp.id, { type: 'domain', role: 'reader', domain: 'beispiel.de' }));
  config.admins = [me.email, 'schriftwart@beispiel.de'];
  await step('getMyPapierpost (neue Admins)', () => b.getMyPapierpost());
  await new Promise((r) => setTimeout(r, 200)); // Freigabe passt sich im Hintergrund an
  const ppPerms2 = fake.state.permissions.filter((p) => p.file === ppf?.id).map((p) => p.emailAddress);
  check(ppPerms2.join() === 'schriftwart@beispiel.de', 'Freigabe folgt dem Wechsel der Admins (alter Zugriff entfernt)', ppPerms2.join());
  config.admins = adminsBefore;

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
  check(stand[0]?.[0] === 'E-Mail (Google-Konto)' && stand.some((r) => r[0] === ANNA && r[2] === 'Nein' && r[3] === 'Ja' && String(r[9]).includes(annaConsent.id)), 'Stand: Annas Zeile mit Nachweis-Link', JSON.stringify(stand));
  check(stand[0]?.[4] === 'Sichtbar in der App' && stand.some((r) => r[0] === me.email && r[2] === 'Ja' && r[3] === 'Nein' && r[4] === 'Ja'), 'Stand: Theos aktuelle Entscheidung, auch zur Sichtbarkeit');
  check(stand.some((r) => r[0] === 'karl@beispiel.de' && r[10] === 'keine Rückmeldung'), 'Stand: wer noch nicht geantwortet hat');
  check(tab('Verlauf').length - 1 === 4 && s1?.neueEintraege === 4 && tab('Verlauf')[0][11] === 'Sichtbar in der App', 'Verlauf: alle 4 Erklärungen (3 von Theo, 1 von Anna)', JSON.stringify(tab('Verlauf')));
  check(tab('Fassungen').length - 1 === 3 && tab('Fassungen')[1][4].includes('Bundesbote') && tab('Fassungen')[3][3].includes('Sichtbarkeit'), 'Fassungen: Wortlaut aller drei Punkte festgehalten');
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

  /* ---------------------------------------------------------------- Sichtbarkeit (E40) */
  section('Sichtbarkeit in der App und „Nur App-Nutzer“ (E40)');
  const visOf = (email) => [...fake.state.files.values()].filter((f) => f.appProperties.fbTyp === 'sichtbarkeit' && f.ownerEmail === email);
  const myVis = () => visOf(me.email)[0];
  check(visOf(me.email).length === 1 && myVis().parents.includes(folder.id) && JSON.parse(myVis().description).sichtbar === true,
    'eigene Sichtbarkeits-Datei im eigenen App-Ordner, auch nach mehrmaligem Speichern nur eine', myVis()?.description);
  check(fake.state.permissions.some((p) => p.file === myVis()?.id && p.type === 'domain' && p.role === 'reader'), 'für die Mitglieder lesbar – daran erkennt deren App die Nutzung');
  const BERT = 'bert@beispiel.de';
  const KARL = 'karl@beispiel.de';
  fake.state.directory.push({ resourceName: 'people/555', names: [{ displayName: 'Bert Bleibtweg' }], emailAddresses: [{ value: BERT }], photos: [] });
  const annaVis = fake.addFile({ name: 'Sichtbarkeit (Mitglieder-App).json', appProperties: { fbTyp: 'sichtbarkeit', fbSichtbar: 'ja' }, description: JSON.stringify({ sichtbar: true }), ownerEmail: ANNA, ownerName: 'Anna Andere' });
  const bertProfil = fake.addFile({ name: 'Mein Profil (Mitglieder-App).json', appProperties: { fbTyp: 'profil' }, description: JSON.stringify({ kneipname: 'Geheim' }), ownerEmail: BERT, ownerName: 'Bert Bleibtweg' });
  fake.state.permissions.push({ file: bertProfil.id, id: 'perm-bert', type: 'domain', role: 'reader', domain: 'beispiel.de' });
  fake.addFile({ name: 'Sichtbarkeit (Mitglieder-App).json', appProperties: { fbTyp: 'sichtbarkeit', fbSichtbar: 'nein' }, description: JSON.stringify({ sichtbar: false }), ownerEmail: BERT, ownerName: 'Bert Bleibtweg' });
  // Fälschungsversuch: Anna legt eine ältere Datei an, die Theo verstecken soll
  fake.addFile({ name: 'x.json', appProperties: { fbTyp: 'sichtbarkeit', fbSichtbar: 'nein' }, description: JSON.stringify({ sichtbar: false, konto: me.email }), ownerEmail: ANNA, ownerName: 'Anna Andere', modifiedTime: '2020-01-01T00:00:00.000Z' });
  for (const k of ['directory', 'profiles', 'visibility']) b.invalidate(k);
  const visList = await step('listMembers (Sichtbarkeit)', () => b.listMembers());
  const vm = (email) => visList?.find((m) => m.email === email);
  check(vm(ANNA)?.appNutzer === true, 'Anna nutzt die App und ist sichtbar', JSON.stringify(vm(ANNA)));
  check(vm(KARL) && vm(KARL).appNutzer === false, 'Karl steht im Google-Verzeichnis, hat die App aber noch nicht genutzt (nur bei „alle zeigen“)', JSON.stringify(vm(KARL)));
  check(!vm(BERT) && (await b.getMember(BERT)) === null, 'Bert hat „nicht sichtbar“ gewählt: fehlt in der Liste und als Profil', JSON.stringify(vm(BERT)));
  check(vm(me.email)?.appNutzer === true, 'gefälschte Datei versteckt Theo nicht (Inhaber zählt)');
  await blocked('fremde Sichtbarkeit ändern', fake, () => drive.updateFile(annaVis.id, { description: '{"sichtbar":false}' }));
  await blocked('Freigabe eines fremden Profils entfernen', fake, () => drive.deletePermission(bertProfil.id, 'perm-bert'));
  if (![...fake.state.files.values()].some((f) => f.appProperties.fbTyp === 'profil' && f.ownerEmail === me.email)) await b.saveMyProfile({ kneipname: 'Testo' });
  const myProfil = [...fake.state.files.values()].find((f) => f.appProperties.fbTyp === 'profil' && f.ownerEmail === me.email);
  const profilShared = () => fake.state.permissions.filter((p) => p.file === myProfil?.id && ['group', 'domain', 'user'].includes(p.type)).length;
  check(profilShared() > 0, 'vorher: eigenes Profil für die Mitglieder freigegeben');
  await step('saveMyConsent (nicht sichtbar)', () => b.saveMyConsent({ vereinszwecke: true, dachverband: false, sichtbar: false }));
  check(visOf(me.email).length === 1 && JSON.parse(myVis().description).sichtbar === false && myVis().appProperties.fbSichtbar === 'nein', 'Wahl „nicht sichtbar“ in derselben Datei', myVis()?.description);
  check(profilShared() === 0 && fake.state.permissions.some((p) => p.file === myVis().id && p.type === 'domain'),
    'eigenes Profil nicht mehr freigegeben; die Sichtbarkeits-Datei bleibt lesbar (sonst wüsste die App der anderen nichts von der Wahl)');
  const writesV = fake.state.writes.length;
  await step('saveMyProfile (unsichtbar)', () => b.saveMyProfile({ kneipname: 'Testo', wohnort: 'Braunschweig' }));
  check(profilShared() === 0 && fake.state.writes.length > writesV, 'Profil bearbeiten geht weiter, es bleibt aber privat');
  await step('saveMyConsent (wieder sichtbar)', () => b.saveMyConsent({ vereinszwecke: true, dachverband: false, sichtbar: true }));
  check(profilShared() > 0 && JSON.parse(myVis().description).sichtbar === true, 'wieder sichtbar: Profil wieder freigegeben');
  const consentsV = await b.listConsents();
  check(consentsV.find((x) => x.email === me.email)?.sichtbar === true, 'Übersicht der Verantwortlichen kennt die Wahl (zum Abgleich mit dem Google-Verzeichnis)');

  /* ---------------------------------------------------------------- Gruppen (E41) */
  // Abgelaufene Anmeldung, Netz weg, Google kurz gestört: keine fast leere Liste, die sich die App merken würde
  const { cachedLoad, kv } = await import('../js/lib/store.js');
  const good = await step('listMembers (vollständig)', () => new GoogleBackend(me).listMembers());
  const tokenSaved = localStorage.getItem('fb.token');
  localStorage.setItem('fb.token', JSON.stringify({ ...JSON.parse(tokenSaved), expires_at: Date.now() - 1000 }));
  const expired = await new GoogleBackend(me).listMembers().then(() => null).catch((e) => e);
  await kv.set('test:members', { t: 0, v: good });
  let shownMembers = null;
  const keptErr = await cachedLoad('test:members', () => new GoogleBackend(me).listMembers(), (v) => { shownMembers = v; }).then(() => null).catch((e) => e);
  const storedMembers = (await kv.get('test:members'))?.v;
  localStorage.setItem('fb.token', tokenSaved);
  await kv.del('test:members');
  check(expired?.status === 401, 'Anmeldung abgelaufen: Mitgliederliste bricht ab, statt nur einen selbst zu liefern', JSON.stringify([expired?.status, expired?.message]));
  check(keptErr && good?.length > 2 && shownMembers?.length === good.length && storedMembers?.length === good.length,
    'dann bleibt der zuletzt gespeicherte Stand – angezeigt und nicht überschrieben', JSON.stringify([shownMembers?.length, storedMembers?.length, good?.length]));
  fake.state.domainError = 408;
  const domainDown = await new GoogleBackend(me).listMembers().then(() => null).catch((e) => e);
  fake.state.domainError = 0;
  check(domainDown?.status === 408, 'Suche in der Domain kurz gestört: Abbruch statt „Nur App-Nutzer“ ohne die anderen', JSON.stringify([domainDown?.status, domainDown?.message]));
  fake.state.peopleError = 403;
  const noDir = await new GoogleBackend(me).listMembers().catch((e) => e);
  fake.state.peopleError = 0;
  check(Array.isArray(noDir) && noDir.some((m) => m.email === ANNA && m.appNutzer) && !noDir.some((m) => m.email === KARL),
    'Verzeichnis dauerhaft gesperrt (403): Liste kommt weiter, ohne Verzeichnis', JSON.stringify(Array.isArray(noDir) ? noDir.map((m) => m.email) : noDir?.message));

  section('Gruppen: Bereiche je Gruppe ausblenden (E41)');
  const gr = await import('../js/lib/gruppen.js');
  const savedGruppen = config.gruppen;
  config.gruppen = {
    adressen: { bundesbrueder: 'bundesbrueder@beispiel.de', chordamen: 'chordamen@beispiel.de', gaeste: 'gaeste@beispiel.de' },
    ohne: { adressen: ['chordamen', 'gaeste'], forum: ['gaeste'], galerie: ['gaeste'] },
  };
  const S = (...k) => new Set(k);
  check(gr.gesperrt('adressen', S('gaeste')) && gr.gesperrt('forum', S('gaeste')) && gr.gesperrt('adressen', S('chordamen')) && !gr.gesperrt('forum', S('chordamen')),
    'Gäste: kein Adressverzeichnis, kein Forum; Chordamen: nur kein Adressverzeichnis');
  check(!gr.gesperrt('adressen', S('gaeste', 'bundesbrueder')) && !gr.gesperrt('adressen', S()) && !gr.gesperrt('adressen', null) && !gr.gesperrt('termine', S('gaeste')),
    'wer zusätzlich Bundesbruder ist, sieht alles; ohne bekannte Gruppe ist nichts gesperrt');
  check(gr.linkGesperrt({ titel: 'Wiki', ohne: ['gaeste'] }, S('gaeste')) && !gr.linkGesperrt({ titel: 'Wiki', ohne: ['gaeste'] }, S('bundesbrueder')), 'Links wie das Wiki je Gruppe ausblendbar');
  // Die Gruppe gaeste@ gibt es noch nicht: Freigabe scheitert, die übrigen Kennungen entstehen trotzdem
  fake.state.failShareFor = 'gaeste@beispiel.de';
  const logG0 = [];
  const resG0 = await step('createMissing (Gruppe gibt es noch nicht)', () => setup.createMissing({ only: [], me, log: (t, k) => logG0.push([t, k]) }));
  fake.state.failShareFor = '';
  const markersOf = (email) => [...fake.state.files.values()].filter((f) => f.appProperties.fbTyp === 'gruppe' && f.ownerEmail === email);
  check(resG0?.gruppen?.join() === 'bundesbrueder,chordamen' && markersOf(me.email).length === 3 && logG0.some(([t, k]) => k === 'err' && /gaeste@beispiel\.de/.test(t)),
    'fehlende Gruppe: verständlicher Hinweis, die anderen Kennungen entstehen trotzdem', JSON.stringify([resG0?.gruppen, logG0]));
  const resG = await step('createMissing (Gruppen-Kennungen)', () => setup.createMissing({ only: [], me, log: () => {} }));
  check(resG?.gruppen?.join() === 'gaeste' && markersOf(me.email).length === 3, 'erneut: Freigabe für die inzwischen angelegte Gruppe nachgeholt, keine Kennung doppelt', JSON.stringify(resG?.gruppen));
  check(markersOf(me.email).every((f) => {
    const ps = fake.state.permissions.filter((p) => p.file === f.id);
    return !f.parents.length && ps.length === 1 && ps[0].type === 'group' && ps[0].role === 'reader' && ps[0].emailAddress === config.gruppen.adressen[f.appProperties.fbGruppe];
  }), 'jede Kennung nur für ihre Gruppe lesbar – nicht für die Domain, nicht im freigegebenen Ordner');
  const resG2 = await step('createMissing (Gruppen, erneut)', () => setup.createMissing({ only: [], me, log: () => {} }));
  check(resG2?.gruppen?.length === 0 && markersOf(me.email).length === 3, 'erneut ausgeführt: nichts doppelt');
  // Prüfung der Freigaben mit Gruppen: Gruppen-Freigaben zählen, zu viel und zu wenig wird genannt
  const js = (perms, bereich) => setup.judgeSharing(perms, { group: '', domain: 'beispiel.de', bereich }).warn;
  const G = (e) => ({ type: 'group', role: 'reader', emailAddress: e });
  const js1 = js([G('Bundesbrueder@beispiel.de')], 'adressen');
  check(!js1.length, 'Prüfung: Adressverzeichnis nur für die Bundesbrüder freigegeben – kein Hinweis', JSON.stringify(js1));
  const js2 = js([G('bundesbrueder@beispiel.de'), G('gaeste@beispiel.de')], 'adressen');
  check(js2.length === 1 && /gaeste@beispiel\.de/.test(js2[0]), 'Prüfung: Gäste können das Adressverzeichnis lesen – Warnung', JSON.stringify(js2));
  const js3 = js([{ type: 'domain', role: 'reader', domain: 'beispiel.de' }], 'galerie');
  check(js3.length === 1 && /alle in beispiel\.de/.test(js3[0]), 'Prüfung: Galerie für die ganze Domain, obwohl Gäste sie nicht sehen – Warnung', JSON.stringify(js3));
  const js4 = js([G('chordamen@beispiel.de')], 'zeitung');
  check(js4.length === 1 && /bundesbrueder@beispiel\.de, gaeste@beispiel\.de/.test(js4[0]), 'Prüfung: Bundesbote – Gruppen ohne Freigabe werden genannt', JSON.stringify(js4));
  const js5 = js([{ type: 'user', role: 'reader', emailAddress: 'x@beispiel.de' }], 'zeitung');
  check(js5.length === 1 && /Keine Lesefreigabe/.test(js5[0]), 'Prüfung: weder Gruppe noch Domain – Hinweis wie bisher', JSON.stringify(js5));
  b.invalidate('gruppen');
  check((await b.myGroups()).length === 3, 'Admin besitzt alle Kennungen und sieht damit alles');
  // Sicht eines Mitglieds, das nur die Gäste-Kennung lesen kann (Kennungen gehören dem Vorstand)
  const savedAdminsG = config.admins;
  config.admins = ['vorstand@beispiel.de'];
  const VS = { ownerEmail: 'vorstand@beispiel.de', ownerName: 'Vorstand' };
  const gastKennung = fake.addFile({ ...VS, name: 'Gruppe gaeste@beispiel.de – Kennung', appProperties: { fbTyp: 'gruppe', fbGruppe: 'gaeste' } });
  // Fälschungsversuch: Anna legt eine „Bundesbrüder“-Kennung an, die jeder lesen kann
  fake.addFile({ name: 'Gruppe bundesbrueder', appProperties: { fbTyp: 'gruppe', fbGruppe: 'bundesbrueder' }, ownerEmail: ANNA, ownerName: 'Anna Andere' });
  fake.addFile({ ...VS, name: 'Gruppe unbekannt', appProperties: { fbTyp: 'gruppe', fbGruppe: 'kegelclub' } });
  b.invalidate('gruppen');
  const gastGruppen = await step('myGroups (Gast)', () => b.myGroups());
  check(gastGruppen?.join() === 'gaeste', 'nur Kennungen von Admins zählen – gefälschte und unbekannte nicht', JSON.stringify(gastGruppen));
  await blocked('fremde Kennung für die Domain freigeben', fake, () => drive.addPermission(gastKennung.id, { type: 'domain', role: 'reader', domain: 'beispiel.de' }));
  gr.setMeineGruppen(me.email, gastGruppen);
  b.invalidate(b.addressKey(), 'profiles', 'visibility');
  const logG = fake.state.log.length;
  await step('listMembers (als Gast)', () => b.listMembers());
  check(!fake.state.log.slice(logG).some((l) => l.includes(config.tabellen.adressen)), 'Gast: Mitgliederliste liest das Adressverzeichnis nicht');
  gr.setMeineGruppen(me.email, []);
  config.admins = savedAdminsG;
  config.gruppen = savedGruppen;
  b.invalidate('gruppen');

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
  // Konto ist nicht Mitglied der geteilten Ablage, nur der Ordner ist freigegeben (z. B. für chordamen@)
  fake.state.notMemberOf = new Set([SD.driveId]);
  const qNM = fake.state.queries.length;
  const bNM = new GoogleBackend(me);
  const issNM = await step('listIssues (nur der Ordner freigegeben)', () => bNM.listIssues());
  const issNM2 = await step('listIssues (erneut)', () => bNM.listIssues());
  fake.state.notMemberOf = null;
  const corporaNM = fake.state.queries.slice(qNM).map((q) => q.corpora);
  check(issNM?.length === 3 && issNM2?.length === 3 && corporaNM.includes('allDrives') && corporaNM.filter((c) => c === 'drive').length === 1,
    'nicht Mitglied der geteilten Ablage: Suche über alles Lesbare – Ausgaben trotzdem da, danach gleich so', JSON.stringify(corporaNM));
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

  /* ---------------------------------------------------------------- Private Konfiguration (E43) */
  section('Private Konfiguration in Google Drive (E43)');
  const kf = await import('../js/lib/konfiguration.js');
  const cfgBefore = JSON.parse(JSON.stringify(config));
  const asJson = (o) => new TextEncoder().encode(typeof o === 'string' ? o : JSON.stringify(o)).buffer;
  const fromJson = (buf) => JSON.parse(new TextDecoder().decode(buf));
  const privOk = {
    _hinweis: 'Anmerkungen mit „_“ ignoriert die App', admins: [me.email], kalenderId: 'privat@group.calendar.google.com',
    tabellen: { adressen: '1PUfw03rWme3QXVzluFMWSa', news: '', einwilligungen: '' }, zeitungOrdnerId: '1sZ9aHz2aiOPqNiyEVxRbJ',
    links: [{ titel: 'Wiki', url: 'https://wiki.beispiel.de/', ohne: ['gaeste'] }], gruppen: { adressen: { gaeste: 'gaeste@beispiel.de' }, ohne: { forum: ['gaeste'] } },
    datenschutz: { empfaenger: ['Vorstand@Beispiel.de'] },
  };
  const v1 = kf.validatePrivateConfig(privOk, { owner: me.email });
  check(!v1.errors.length && !v1.warnings.length && v1.values.datenschutz?.empfaenger?.[0] === 'vorstand@beispiel.de' && !('_hinweis' in v1.values),
    'gültige private Konfiguration: keine Fehler, Anmerkungen ignoriert, E-Mail-Adressen klein', JSON.stringify(v1));
  const v2 = kf.validatePrivateConfig({ ...privOk, googleClientId: 'x', datenschutz: { verein: 'X', empfaenger: [] }, kalenderID: 'Tippfehler' }, { owner: me.email });
  check(!v2.errors.length && v2.warnings.length === 3 && !('googleClientId' in v2.values) && !('kalenderID' in v2.values) && !v2.values.datenschutz?.verein,
    'öffentliche und unbekannte Schlüssel: Hinweis, werden ignoriert', JSON.stringify(v2.warnings));
  const v3 = kf.validatePrivateConfig({ ...privOk, admins: [], links: [{ titel: 'X', url: 'http://unsicher.de' }], zeitungOrdnerId: 'a b' }, { owner: me.email });
  check(v3.errors.length === 3, 'Fehler: keine Admins, Link ohne https, ungültige Ordner-ID', JSON.stringify(v3.errors));
  const v4 = kf.validatePrivateConfig(privOk, { owner: 'fremd@beispiel.de' });
  check(v4.errors.length === 1 && /fremd@beispiel\.de/.test(v4.errors[0]), 'Datei gehört keinem Admin (Inhaber laut Google): Fehler', JSON.stringify(v4.errors));
  check(kf.validatePrivateConfig([1, 2]).errors.length === 1 && kf.validatePrivateConfig({ kalenderId: '' }).errors.some((e) => /admins/.test(e)), 'kein Objekt bzw. ohne „admins“: Fehler');
  const v5 = kf.validatePrivateConfig({ ...privOk, vorstand: { aktive: ['Senior@Beispiel.de'], altherren: [] }, galerieUploadOrdnerId: '1UpLoAdOrDnEr0123456789' }, { owner: me.email });
  check(!v5.errors.length && !v5.warnings.length && v5.values.vorstand?.aktive?.[0] === 'senior@beispiel.de' && v5.values.galerieUploadOrdnerId === '1UpLoAdOrDnEr0123456789',
    'Vorstände (E45) und Upload-Ordner (E46) gültig, E-Mail-Adressen klein', JSON.stringify(v5));
  const v6 = kf.validatePrivateConfig({ ...privOk, vorstand: { aktive: ['kein-mail'], kasse: [] }, galerieUploadOrdnerId: 'a b' }, { owner: me.email });
  check(v6.errors.length === 2, 'Fehler: Vorstand ohne gültige E-Mail-Adressen bzw. mit unbekannter Gruppe, ungültige Upload-Ordner-ID', JSON.stringify(v6.errors));
  const vb = kf.validatePrivateConfig(await (await fetch('../config_private.beispiel.json')).json());
  check(!vb.errors.length && !vb.warnings.length, 'Vorlage config_private.beispiel.json ist gültig', JSON.stringify([vb.errors, vb.warnings]));
  // Laden aus Drive (nur lesen), Vorrang: lokale Werte der Einrichtung vor der privaten Konfiguration
  localStorage.removeItem('fb.privateKonfig');
  const privFile = fake.addFile({ name: 'config_private.json', mimeType: 'application/json', content: asJson(privOk) });
  config.privateConfigId = privFile.id;
  cfgMod.saveOverride({ adressenBlatt: 'Lokal' });
  const st1 = await step('loadPrivateConfig', () => kf.loadPrivateConfig());
  check(st1?.status === 'ok' && config.kalenderId === 'privat@group.calendar.google.com' && config.links?.[0]?.titel === 'Wiki' && config.privateConfigId === privFile.id
    && config.googleClientId === 'test.apps.googleusercontent.com' && config.adressenBlatt === 'Lokal',
  'aus Drive geladen, geprüft, übernommen – öffentliche Werte bleiben, lokale Werte der Einrichtung haben Vorrang', JSON.stringify([st1?.status, config.kalenderId, config.adressenBlatt]));
  cfgMod.clearOverride();
  privFile.content = asJson('{ "admins": [ kaputt');
  const st2 = await step('loadPrivateConfig (kaputtes JSON)', () => kf.loadPrivateConfig());
  check(st2?.status === 'cache' && st2.error?.code === 'config_invalid' && config.kalenderId === 'privat@group.calendar.google.com',
    'kaputtes JSON: der zuletzt geprüfte Stand gilt weiter', JSON.stringify([st2?.status, st2?.error?.message]));
  const fetchBefore = window.fetch;
  window.fetch = (input, init) => (String(input?.url || input).includes(privFile.id) ? Promise.reject(new TypeError('Failed to fetch')) : fetchBefore(input, init));
  const st3 = await kf.loadPrivateConfig().catch((e) => e);
  window.fetch = fetchBefore;
  check(st3?.status === 'cache' && st3.error?.status === 0, 'Netz weg: der zuletzt geprüfte Stand gilt weiter', JSON.stringify([st3?.status, st3?.error?.message]));
  localStorage.removeItem('fb.privateKonfig');
  const foreignPriv = fake.addFile({ name: 'config_private.json', mimeType: 'application/json', ownerEmail: 'fremd@beispiel.de', ownerName: 'Fremd', content: asJson(privOk) });
  config.privateConfigId = foreignPriv.id;
  const e1 = await kf.loadPrivateConfig().then(() => null).catch((e) => e);
  check(e1?.code === 'config_invalid' && /fremd@beispiel\.de/.test(e1.message), 'Datei eines Nicht-Admins: ohne gespeicherten Stand startet die App nicht damit', e1?.message);
  config.privateConfigId = 'gibtesnicht1234567890';
  const e2 = await kf.loadPrivateConfig().then(() => null).catch((e) => e);
  check(e2?.status === 404 && kf.privateConfigStatus().status === 'fehler', 'nicht gefunden bzw. nicht freigegeben: Fehler (die Anmeldeseite erklärt ihn)', JSON.stringify([e2?.status, e2?.message]));
  const gdoc = fake.addFile({ name: 'config_private', mimeType: 'application/vnd.google-apps.document' });
  config.privateConfigId = gdoc.id;
  const e3 = await kf.loadPrivateConfig().then(() => null).catch((e) => e);
  check(e3?.code === 'config_invalid' && /Google-Dokument/.test(e3.message), 'Google-Dokument statt JSON-Datei: verständlicher Fehler', e3?.message);
  // Speichern (Einrichtung): eigene Datei mit JSON-Inhalt, für die Domain nur lesbar
  config.privateConfigId = '';
  const privSaved = await step('savePrivateConfig (neu)', () => kf.savePrivateConfig(privOk, { owner: me.email }));
  const savedFile = fake.state.files.get(privSaved?.id);
  const savedPerms = () => fake.state.permissions.filter((p) => p.file === privSaved?.id);
  check(privSaved?.neu && savedFile?.ownerEmail === me.email && savedFile.appProperties.fbTyp === 'konfiguration' && fromJson(savedFile.content).admins?.[0] === me.email,
    'neu angelegt: eigene Datei „config_private.json“ mit JSON-Inhalt', JSON.stringify(privSaved));
  check(savedPerms().length === 1 && savedPerms()[0].type === 'domain' && savedPerms()[0].role === 'reader' && savedPerms()[0].allowFileDiscovery === false,
    'nur für die Domain lesbar (ohne Suche), nicht bearbeitbar', JSON.stringify(savedPerms()));
  config.privateConfigId = privSaved?.id;
  const privSaved2 = await step('savePrivateConfig (ändern)', () => kf.savePrivateConfig({ ...privOk, redaktion: ['red@beispiel.de'] }, { owner: me.email }));
  check(privSaved2?.id === privSaved?.id && !privSaved2.neu && fromJson(fake.state.files.get(privSaved.id).content).redaktion?.[0] === 'red@beispiel.de' && savedPerms().length === 1,
    'erneut gespeichert: dieselbe Datei, Inhalt ersetzt, keine doppelte Freigabe');
  config.privateConfigId = foreignPriv.id;
  const privSaved3 = await step('savePrivateConfig (ID gehört einem anderen Admin)', () => kf.savePrivateConfig(privOk, { owner: me.email }));
  check(privSaved3?.id === privSaved?.id && fromJson(foreignPriv.content).admins?.[0] === me.email && !fake.state.permissions.some((p) => p.file === foreignPriv.id),
    'fremde Datei bleibt unverändert – die eigene wird verwendet');
  const notAdmin = await kf.savePrivateConfig({ ...privOk, admins: ['anderer@beispiel.de'] }, { owner: me.email }).then(() => null).catch((e) => e);
  check(notAdmin?.code === 'config_invalid', 'nicht gespeichert, wenn man selbst nicht unter „admins“ steht (die Datei würde nicht geladen)', notAdmin?.message);
  await blocked('fremde private Konfiguration überschreiben', fake, () => drive.updateWithContent(foreignPriv.id, {}, new Blob(['{"admins":["boese@beispiel.de"]}'], { type: 'application/json' })));
  const pub = cfgMod.publicConfigContent({ privateConfigId: 'abc1234567890' });
  check(/privateConfigId/.test(pub) && /googleClientId/.test(pub) && !/kalenderId|admins|tabellen|gruppen|empfaenger/.test(pub),
    'öffentliches config.js enthält nur Client-ID, Domain, ID der privaten Datei, Demo-Schalter und Datenschutz-Angaben', pub);
  localStorage.removeItem('fb.privateKonfig');
  for (const k of Object.keys(config)) delete config[k];
  Object.assign(config, cfgBefore);

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
