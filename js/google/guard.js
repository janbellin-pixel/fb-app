// Schreibschutz der App
// ====================
// Grundsatz: Die App dient der Information und dem Austausch. Gemeinsame Daten
// (Termine, News, Adressen, Zeitung, Galerie, Mitgliederliste) werden nur gelesen.
// Ändern darf jedes Mitglied ausschließlich seine EIGENEN Daten:
//   • die eigene Zu-/Absage – im eigenen Kalender (calendars/primary)
//   • eigene Dateien, die die App im eigenen Google Drive angelegt hat (Profil, Forenbeiträge,
//     Datenschutz-Einwilligung) und deren Lese-Freigaben
//   • eigene Chat-Nachrichten (Google lässt ohnehin nur eigene zu)
//   • die eigene, von der App angelegte Einwilligungs-Sammeltabelle (nur das Konto des
//     Datenschutz-Verantwortlichen, das sie angelegt hat)
//
// Jede ändernde Anfrage (alles außer GET) läuft durch assertWriteAllowed().
// Was nicht ausdrücklich erlaubt ist, wird blockiert, bevor es das Gerät verlässt.
// Zusätzlich fragt die App bei Google nur Rechte an, mit denen fremde Drive-Dateien
// gar nicht geändert werden können (drive.readonly + drive.file).

export class WriteBlockedError extends Error {
  constructor(message) {
    super(`Schreibschutz: ${message}`);
    this.name = 'WriteBlockedError';
    this.code = 'write_blocked';
    this.status = 403;
  }
}

// Dateien, die nachweislich dem angemeldeten Mitglied gehören (laut Google „ownedByMe“
// oder von der App gerade selbst angelegt)
const ownFiles = new Set();
// Eigene, von der App angelegte Tabellen, in die geschrieben werden darf (nur die Einwilligungs-Sammeltabelle)
const ownTables = new Set();
// Während der Einrichtung (nur Admins, nur auf ausdrücklichen Klick) neu angelegte Ressourcen
let setupResources = null;

export function registerOwnFile(id) {
  if (id) ownFiles.add(id);
}

export function isOwnFile(id) {
  return ownFiles.has(id);
}

/** Nur aufrufen, wenn Google bestätigt hat: Tabelle gehört mir und wurde von der App als Sammeltabelle angelegt */
export function registerOwnTable(id) {
  if (!id) return;
  ownTables.add(id);
  ownFiles.add(id);
}

export function isOwnTable(id) {
  return ownTables.has(id);
}

export function beginSetup() {
  setupResources = new Set();
}

export function registerSetupResource(id) {
  if (setupResources && id) setupResources.add(id);
}

export function endSetup() {
  setupResources = null;
}

export function inSetup() {
  return !!setupResources;
}

/** Ordner für neu anzulegende Dateien prüfen: nur eigene Ordner (nie in fremde Ordner schreiben) */
export function assertParentsAllowed(parents = []) {
  for (const p of parents) {
    if (!ownFiles.has(p) && !(setupResources && setupResources.has(p))) {
      throw new WriteBlockedError('Neue Dateien dürfen nur in eigenen Ordnern der App angelegt werden.');
    }
  }
}

const MESSAGES = {
  calendar: 'Termine des Verbindungskalenders werden in der App nicht geändert – nur die eigene Zu-/Absage.',
  drive: 'In Google Drive dürfen nur eigene Dateien der App geändert werden.',
  sheets: 'Tabellen werden in der App nur gelesen (Ausnahme: die eigene Einwilligungsliste der Datenschutz-Verantwortlichen).',
  other: 'Diese Änderung ist in der App nicht vorgesehen.',
};

export function assertWriteAllowed(method, url, body) {
  if (method === 'GET' || method === 'HEAD') return;
  const u = new URL(url);
  const path = decodeURIComponent(u.pathname);
  let m;

  // ---- Google Kalender
  if (path.startsWith('/calendar/v3/')) {
    // eigene Antwort auf einen Termin: nur im eigenen Kalender, nur die Teilnehmerliste
    m = path.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events\/([^/]+)$/);
    if (m && m[1] === 'primary' && method === 'PATCH') {
      const keys = Object.keys(body || {});
      if (keys.length === 1 && keys[0] === 'attendees' && Array.isArray(body.attendees)) return;
    }
    if (setupResources) {
      if (path === '/calendar/v3/calendars' && method === 'POST') return;
      m = path.match(/^\/calendar\/v3\/calendars\/([^/]+)\/(acl|events)$/);
      if (m && method === 'POST' && setupResources.has(m[1])) return;
    }
    throw new WriteBlockedError(MESSAGES.calendar);
  }

  // ---- Google Drive
  if (path.startsWith('/drive/v3/') || path.startsWith('/upload/drive/v3/')) {
    const p = path.replace(/^\/(upload\/)?drive\/v3\//, '');
    if (u.searchParams.has('addParents') || u.searchParams.has('removeParents')) {
      throw new WriteBlockedError(MESSAGES.drive);
    }
    // neue Datei anlegen = eigene Datei (Zielordner prüft drive.js vorab)
    if (p === 'files' && method === 'POST') return;
    m = p.match(/^files\/([^/]+)(?:\/(permissions)(?:\/([^/]+))?)?$/);
    if (m) {
      const id = m[1];
      const own = ownFiles.has(id) || (setupResources && setupResources.has(id));
      if (own && !m[2] && method === 'PATCH') return; // eigene Datei aktualisieren oder in den Papierkorb
      if (own && m[2] && !m[3] && method === 'POST') return; // eigene Datei lesbar freigeben
      if (own && m[2] && m[3] && method === 'DELETE') return; // Freigabe der eigenen Datei zurücknehmen
    }
    throw new WriteBlockedError(MESSAGES.drive);
  }

  // ---- Google Tabellen: nur in der Einrichtung neu angelegte Tabellen befüllen
  //      und die eigene Einwilligungs-Sammeltabelle aktualisieren
  if (u.hostname === 'sheets.googleapis.com') {
    m = path.match(/^\/v4\/spreadsheets\/([^/:]+)/);
    if (m && setupResources && setupResources.has(m[1])) return;
    if (m && ownTables.has(m[1])) return;
    throw new WriteBlockedError(MESSAGES.sheets);
  }

  // ---- Google Chat: eigene Nachrichten schreiben, ändern, löschen
  if (u.hostname === 'chat.googleapis.com') {
    if (method === 'POST' && /^\/v1\/spaces\/[^/]+\/messages$/.test(path)) return;
    if ((method === 'PATCH' || method === 'DELETE') && /^\/v1\/spaces\/[^/]+\/messages\/[^/]+$/.test(path)) return;
    throw new WriteBlockedError(MESSAGES.other);
  }

  throw new WriteBlockedError(MESSAGES.other);
}
