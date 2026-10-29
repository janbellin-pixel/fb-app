// Konfiguration = Standardwerte + config.js (öffentlich) + private Konfiguration aus Google Drive
// (nach der Anmeldung, E43, js/lib/konfiguration.js) + lokale Werte aus der Einrichtung

/**
 * Was vor der Anmeldung gebraucht wird – nur das steht im öffentlichen config.js (E43). Alles andere gehört
 * in die private Konfiguration (config_private.json in Google Drive, nur für angemeldete Mitglieder lesbar).
 */
export const PUBLIC_KEYS = ['appName', 'googleClientId', 'workspaceDomain', 'privateConfigId', 'demoErlaubt', 'debug'];
/** Angaben der Datenschutzerklärung – sie ist auch ohne Anmeldung lesbar (Route „datenschutz“ ist öffentlich) */
export const PUBLIC_DATENSCHUTZ = ['verein', 'anschrift', 'email', 'dachverband', 'dachverbandKurz', 'fassung', 'stand'];

const DEFAULTS = {
  appName: 'Frankonia-Brunonia',
  googleClientId: '',
  workspaceDomain: '',
  // Drive-ID der privaten Konfiguration (config_private.json); leer = alles steht noch in config.js (alte Form)
  privateConfigId: '',
  // Nur für die Entwicklung auf localhost: private Konfiguration aus einer lokalen Datei statt aus Drive
  debug: { privateConfigFile: '' },
  mitgliederGruppe: '',
  admins: [],
  // Wer außer den Admins News in der App schreiben darf (E-Mail-Adressen)
  redaktion: [],
  appUrl: '',
  kalenderId: '',
  tabellen: { adressen: '', news: '', einwilligungen: '' },
  // Tabellenblatt des Adressverzeichnisses; leer = „Adressen“, sonst das erste Blatt
  adressenBlatt: '',
  zeitungOrdnerId: '',
  // Ordner mit den Noten der Liedermappe (PDFs oder Bilder, Unterordner = Rubriken); leer = ausgeblendet
  liedermappeOrdnerId: '',
  // Ordner mit den PDF-Ausgaben der DS-Zeitung (Zeitung der Deutschen Sängerschaft); leer = ausgeblendet
  dsZeitungOrdnerId: '',
  galerieOrdnerId: '',
  // Ordner, in den alle Mitglieder Fotos hochladen dürfen (in Drive für sie bearbeitbar freigegeben); die Galerie verlinkt ihn (E46)
  galerieUploadOrdnerId: '',
  // newsRaum: vorgeschlagener Chat-Raum für Ankündigungen neuer News, z. B. 'spaces/AAAA…' (E33)
  chat: { aktiv: true, newsRaum: '' },
  forum: { aktiv: true },
  profilBearbeiten: true,
  // Weitere Links im Schnellzugriff und unter „Mehr“, z. B. [{ titel: 'Wiki', url: 'https://…' }] – nur https;
  // ohne: ['gaeste'] blendet einen Link für diese Gruppen aus (E41)
  links: [],
  // Gruppen der Verbindung (E41): adressen = Google-Gruppen, z. B. { gaeste: 'gaeste@…' } – die Einrichtung legt je Gruppe
  // eine nur für sie lesbare Kennungsdatei an; ohne = Bereiche, die eine Gruppe nicht sieht, z. B. { forum: ['gaeste'] }
  gruppen: { adressen: {}, ohne: {} },
  // Postfach für Adressänderungen: „Mein Profil“ bereitet bei Abweichungen vom Adressverzeichnis eine E-Mail vor.
  // (Umlaute sind in E-Mail-Adressen bei Google Workspace nicht möglich – daher „ae“.)
  adressaenderung: 'adressaenderung@frankonia-brunonia.de',
  // Vorstände für „… kontaktieren“ im Chat (E45): E-Mail-Adressen; leer = Knopf ausgeblendet
  vorstand: { aktive: [], altherren: [] },
  // Push-Mitteilungen (E50): Konto, in dem apps-script/Push.gs läuft, und dessen öffentlicher Schlüssel; leer = aus
  push: { konto: '', schluessel: '' },
  demoErlaubt: true,
  // Datenschutzerklärung und Einwilligungen (Texte: js/lib/datenschutz.js)
  datenschutz: {
    verein: '', // Verantwortlicher, z. B. „Sängerschaft Frankonia-Brunonia e. V.“
    anschrift: '', // Straße, PLZ Ort
    email: '', // Kontakt für Datenschutzfragen
    dachverband: 'Deutsche Sängerschaft (DS)',
    dachverbandKurz: 'DS',
    fassung: '3', // erhöhen, wenn sich die Einwilligungstexte ändern – dann werden alle erneut gefragt (3: Sichtbarkeit, E40)
    stand: '29.10.2026',
    empfaenger: [], // wer die Einwilligungen einsehen darf; leer = die Admins
  },
  // Nur für den Prototyp ohne Workspace: diese Konten werden zu Terminen eingeladen
  // und bekommen Zugriff auf die Daten (statt einer Mitglieder-Gruppe).
  testMitglieder: [],
  // E-Mail-Adressen, die nicht im Mitgliederverzeichnis erscheinen (z. B. Funktionskonten)
  ausgeblendeteKonten: [],
  statusOptionen: ['Fux', 'Aktiver Bursche', 'Inaktiver Bursche', 'Alter Herr', 'Ehrenmitglied', 'Verkehrsgast', 'Chordame', 'Chormitglied'],
  statusGruppen: {
    Aktivitas: ['Fux', 'Aktiver Bursche', 'Inaktiver Bursche'],
    Altherrenschaft: ['Alter Herr'],
    Ehrenmitglieder: ['Ehrenmitglied'],
    Chor: ['Chordame', 'Chormitglied'],
    Verkehrsgäste: ['Verkehrsgast'],
  },
  terminKategorien: [
    { name: 'Kneipe', farbe: '#88bb2a', googleFarbe: '10' },
    { name: 'Convent', farbe: '#111111', googleFarbe: '8' },
    { name: 'Vortrag', farbe: '#d9b23a', googleFarbe: '5' },
    { name: 'Fuxenstunde', farbe: '#4f9a8a', googleFarbe: '2' },
    { name: 'Stammtisch', farbe: '#e07b39', googleFarbe: '6' },
    { name: 'Sport & Freizeit', farbe: '#3b82c4', googleFarbe: '7' },
    { name: 'Haus', farbe: '#8e6bbf', googleFarbe: '3' },
    { name: 'Fest', farbe: '#c0392b', googleFarbe: '11' },
    { name: 'Sonstiges', farbe: '#9a9a9a', googleFarbe: '' },
  ],
  kleiderordnung: ['Vollcouleur', 'Band', 'Zivil', 'Festlich', 'Sportlich', 'Arbeitskleidung'],
  forumKategorien: ['Allgemeines', 'Aktivitas', 'Altherrenschaft', 'Haus & Zimmer', 'Veranstaltungen',
    'Beruf & Karriere', 'Biete & Suche'],
  newsKategorien: ['Allgemein', 'Aktivitas', 'Altherrenschaft', 'Haus', 'Veranstaltungen'],
};

const OVERRIDE_KEY = 'fb.configOverride';

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (v === undefined || v === null) continue;
    if (isObj(v) && isObj(base[k])) out[k] = merge(base[k], v);
    else if (v === '' && base[k]) continue; // leere Werte überschreiben nichts
    else out[k] = v;
  }
  return out;
}

function readOverride() {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || 'null') || {};
  } catch {
    return {};
  }
}

export const deployedConfig = merge(DEFAULTS, window.FB_CONFIG || {});
export const config = merge(deployedConfig, readOverride());

// zuletzt übernommene private Konfiguration (geprüft, ohne öffentliche Schlüssel)
let privateValues = {};

/** Geprüfte private Konfiguration übernehmen – vor dem Start der App (E43). Lokale Werte der Einrichtung bleiben vorn. */
export function applyPrivateConfig(values) {
  privateValues = values || {};
  Object.assign(config, merge(merge(config, privateValues), readOverride()));
}

export const getPrivateValues = () => privateValues;

export function saveOverride(partial) {
  const next = merge(readOverride(), partial);
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(next)); } catch { /* privater Modus */ }
  Object.assign(config, merge(config, partial));
}

export function clearOverride() {
  try { localStorage.removeItem(OVERRIDE_KEY); } catch { /* egal */ }
}

/** Nur diese Schlüssel aus den lokalen Werten der Einrichtung entfernen (z. B. nach dem Speichern in Drive) */
export function clearOverrideKeys(keys) {
  const o = readOverride();
  for (const k of keys) delete o[k];
  try {
    if (Object.keys(o).length) localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o));
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch { /* privater Modus */ }
}

export function getOverride() {
  return readOverride();
}

export function hasOverride() {
  return Object.keys(readOverride()).length > 0;
}

/** Adresse, unter der die App gerade läuft (Verzeichnis von index.html). */
export function currentBaseUrl() {
  return location.origin + location.pathname.replace(/[^/]*$/, '');
}

/** Öffentliche Adresse der App – für Links in Kalenderterminen. */
export function appBaseUrl() {
  const u = (config.appUrl || '').trim();
  return u ? u.replace(/\/?$/, '/') : currentBaseUrl();
}

export function eventLink(eventId) {
  return `${appBaseUrl()}#/termin/${encodeURIComponent(eventId)}`;
}

export const isGoogleConfigured = () => !!(config.googleClientId || '').trim();

export function isAdminEmail(email) {
  const list = (config.admins || []).map((e) => String(e).toLowerCase().trim()).filter(Boolean);
  // vor der Einrichtung darf man einrichten, danach nur die Admins – mit privater Konfiguration (E43) stehen sie dort
  if (!list.length) return !isConfigured() && !String(config.privateConfigId || '').trim();
  return list.includes(String(email || '').toLowerCase());
}

/** Darf dieses Konto News in der App schreiben? Admins und die Redaktion (config.redaktion) */
export function isNewsAuthorEmail(email) {
  const e = String(email || '').toLowerCase().trim();
  const list = [...(config.admins || []), ...(config.redaktion || [])].map((x) => String(x).toLowerCase().trim()).filter(Boolean);
  return !!e && list.includes(e);
}

/** Sind alle Datenquellen eingetragen? */
export function isConfigured() {
  return !!(config.kalenderId && config.tabellen?.adressen && config.tabellen?.news && config.zeitungOrdnerId && config.galerieOrdnerId);
}

/** Ist eine Liedermappe eingetragen? (sonst bleibt sie in der App ausgeblendet) */
export const hasSongbook = () => !!String(config.liedermappeOrdnerId || '').trim();

/** Ist ein Ordner für die DS-Zeitung eingetragen? (sonst bleibt sie in der App ausgeblendet) */
export const hasDsZeitung = () => !!String(config.dsZeitungOrdnerId || '').trim();

/** Weitere Links aus config.links – nur vollständige https-Adressen mit Titel */
export function extraLinks() {
  return (Array.isArray(config.links) ? config.links : []).map((l) => {
    const titel = String(l?.titel || '').trim();
    try {
      const u = new URL(String(l?.url || '').trim());
      return titel && u.protocol === 'https:' ? { titel, url: u.href, host: u.hostname, symbol: String(l?.symbol || 'globe'), ohne: Array.isArray(l?.ohne) ? l.ohne : [] } : null;
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export function categoryInfo(name) {
  const cats = config.terminKategorien || [];
  return cats.find((c) => c.name === name) || cats[cats.length - 1] || { name: 'Sonstiges', farbe: '#9a9a9a' };
}

/** Status vergleichbar machen: Groß/klein und Leerzeichen egal, „Bursch“ = „Bursche“ (ältere Schreibweise) */
export const statusKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\bbursch\b/g, 'bursche');

export function statusGroup(status) {
  const k = statusKey(status);
  if (!k) return '';
  for (const [group, list] of Object.entries(config.statusGruppen || {})) {
    if (list.some((s) => statusKey(s) === k)) return group;
  }
  return '';
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

/** Öffentliches config.js (E43): nur Client-ID, Domain, ID der privaten Konfiguration, Demo-Schalter, Datenschutz-Angaben */
export function publicConfigContent(values = {}) {
  const c = merge(config, values);
  const obj = pick(c, ['appName', 'googleClientId', 'workspaceDomain', 'privateConfigId', 'demoErlaubt']);
  obj.datenschutz = pick(c.datenschutz || {}, PUBLIC_DATENSCHUTZ);
  const dbg = window.FB_CONFIG?.debug;
  if (dbg && Object.values(dbg).some(Boolean)) obj.debug = dbg;
  return `/*
 * Öffentliche Konfiguration der Mitglieder-App – erzeugt am ${new Date().toLocaleString('de-DE')} über „Einrichtung“.
 * Hier steht nur, was vor der Anmeldung gebraucht wird. Alle weiteren Einstellungen liegen in der privaten
 * Konfiguration (config_private.json) in Google Drive – lesbar nur für angemeldete Konten der Domain (E43).
 * Weitere Optionen: siehe docs/EINRICHTUNG.md
 */
window.FB_CONFIG = ${JSON.stringify(obj, null, 2)};
`;
}

/** Schlüssel, die die Einrichtung in die private Konfiguration schreibt (dazu bleiben eigene Zusatzeinstellungen erhalten) */
export const PRIVATE_WRITE_KEYS = ['mitgliederGruppe', 'admins', 'redaktion', 'appUrl', 'kalenderId', 'tabellen', 'adressenBlatt',
  'zeitungOrdnerId', 'liedermappeOrdnerId', 'dsZeitungOrdnerId', 'galerieOrdnerId', 'galerieUploadOrdnerId', 'chat', 'forum', 'profilBearbeiten', 'links',
  'gruppen', 'adressaenderung', 'vorstand', 'push', 'testMitglieder', 'ausgeblendeteKonten'];

/** Private Konfiguration als Objekt: aktuelle Werte, ohne öffentliche Schlüssel (E43) */
export function privateConfigObject(values = {}) {
  const c = merge(config, values);
  const obj = { ...privateValues };
  for (const k of PRIVATE_WRITE_KEYS) obj[k] = c[k];
  const ds = Object.fromEntries(Object.entries(c.datenschutz || {}).filter(([k]) => !PUBLIC_DATENSCHUTZ.includes(k)));
  if (Object.keys(ds).length) obj.datenschutz = ds;
  else delete obj.datenschutz;
  for (const k of PUBLIC_KEYS) delete obj[k];
  return obj;
}

export const privateConfigContent = (values = {}) => `${JSON.stringify(privateConfigObject(values), null, 2)}\n`;
