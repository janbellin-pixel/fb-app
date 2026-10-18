// Konfiguration = Standardwerte + config.js (Deployment) + lokale Werte aus der Einrichtung

const DEFAULTS = {
  appName: 'Frankonia-Brunonia',
  googleClientId: '',
  workspaceDomain: '',
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
  galerieOrdnerId: '',
  chat: { aktiv: true },
  forum: { aktiv: true },
  profilBearbeiten: true,
  // Weitere Links im Schnellzugriff und unter „Mehr“, z. B. [{ titel: 'Wiki', url: 'https://…' }] – nur https
  links: [],
  // Postfach für Adressänderungen: „Mein Profil“ bereitet bei Abweichungen vom Adressverzeichnis eine E-Mail vor.
  // (Umlaute sind in E-Mail-Adressen bei Google Workspace nicht möglich – daher „ae“.)
  adressaenderung: 'adressaenderung@frankonia-brunonia.de',
  demoErlaubt: true,
  // Datenschutzerklärung und Einwilligungen (Texte: js/lib/datenschutz.js)
  datenschutz: {
    verein: '', // Verantwortlicher, z. B. „Sängerschaft Frankonia-Brunonia e. V.“
    anschrift: '', // Straße, PLZ Ort
    email: '', // Kontakt für Datenschutzfragen
    dachverband: 'Deutsche Sängerschaft (DS)',
    dachverbandKurz: 'DS',
    fassung: '2', // erhöhen, wenn sich die Einwilligungstexte ändern – dann werden alle erneut gefragt
    stand: '18.10.2026',
    empfaenger: [], // wer die Einwilligungen einsehen darf; leer = die Admins
  },
  // Nur für den Prototyp ohne Workspace: diese Konten werden zu Terminen eingeladen
  // und bekommen Zugriff auf die Daten (statt einer Mitglieder-Gruppe).
  testMitglieder: [],
  // E-Mail-Adressen, die nicht im Mitgliederverzeichnis erscheinen (z. B. Funktionskonten)
  ausgeblendeteKonten: [],
  statusOptionen: ['Fux', 'Aktiver Bursch', 'Inaktiver Bursch', 'Alter Herr', 'Ehrenmitglied'],
  statusGruppen: {
    Aktivitas: ['Fux', 'Aktiver Bursch', 'Inaktiver Bursch'],
    Altherrenschaft: ['Alter Herr'],
    Ehrenmitglieder: ['Ehrenmitglied'],
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

export function saveOverride(partial) {
  const next = merge(readOverride(), partial);
  try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(next)); } catch { /* privater Modus */ }
  Object.assign(config, merge(config, partial));
}

export function clearOverride() {
  try { localStorage.removeItem(OVERRIDE_KEY); } catch { /* egal */ }
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
  if (!list.length) return !isConfigured(); // vor der Einrichtung darf man einrichten, danach nur die Admins
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

/** Weitere Links aus config.links – nur vollständige https-Adressen mit Titel */
export function extraLinks() {
  return (Array.isArray(config.links) ? config.links : []).map((l) => {
    const titel = String(l?.titel || '').trim();
    try {
      const u = new URL(String(l?.url || '').trim());
      return titel && u.protocol === 'https:' ? { titel, url: u.href, host: u.hostname, symbol: String(l?.symbol || 'globe') } : null;
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export function categoryInfo(name) {
  const cats = config.terminKategorien || [];
  return cats.find((c) => c.name === name) || cats[cats.length - 1] || { name: 'Sonstiges', farbe: '#9a9a9a' };
}

export function statusGroup(status) {
  for (const [group, list] of Object.entries(config.statusGruppen || {})) {
    if (list.includes(status)) return group;
  }
  return '';
}

/** Konfiguration als Text für eine neue config.js */
export function configFileContent(values) {
  const c = merge(deployedConfig, values);
  const keep = ['appName', 'googleClientId', 'workspaceDomain', 'mitgliederGruppe', 'admins', 'redaktion', 'appUrl',
    'kalenderId', 'tabellen', 'adressenBlatt', 'zeitungOrdnerId', 'liedermappeOrdnerId', 'galerieOrdnerId', 'chat', 'forum', 'profilBearbeiten', 'links',
    'adressaenderung', 'datenschutz',
    'demoErlaubt', 'testMitglieder'];
  // eigene Zusatzeinstellungen aus der bisherigen config.js behalten
  const obj = { ...(window.FB_CONFIG || {}) };
  for (const k of keep) obj[k] = c[k];
  return `/*
 * Konfiguration der Mitglieder-App – erzeugt am ${new Date().toLocaleString('de-DE')}
 * über „Einrichtung“ in der App. Weitere Optionen: siehe docs/EINRICHTUNG.md
 */
window.FB_CONFIG = ${JSON.stringify(obj, null, 2)};
`;
}
