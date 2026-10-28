// Private Konfiguration (E43)
// ===========================
// Im öffentlichen config.js (Repository, GitHub Pages) steht nur, was vor der Anmeldung gebraucht wird: Client-ID,
// Domain, die Drive-ID dieser Datei, der Demo-Schalter und die Angaben der Datenschutzerklärung. Alles Weitere –
// Admins, Kalender-, Tabellen- und Ordner-IDs, Gruppen, Links … – liegt als JSON-Datei „config_private.json“ in
// Google Drive, lesbar nur für Konten der Domain. Die App lädt sie nach der Anmeldung, prüft sie und startet erst dann.
//
// Bewusst JSON statt JavaScript: Die Datei wird nur gelesen und geprüft, nie ausgeführt (kein eval, die strenge CSP
// bleibt). Wer sie bearbeiten könnte, kann also keinen Programmcode in die App schleusen. Außerdem gilt sie nur, wenn
// sie einem Admin gehört (Inhaber laut Google, nicht laut Inhalt). Offline gilt der zuletzt geprüfte Stand auf dem Gerät.
import { config, applyPrivateConfig, PUBLIC_KEYS, PUBLIC_DATENSCHUTZ } from '../config.js';
import * as drive from '../google/drive.js';
import { registerOwnFile } from '../google/guard.js';
import { BEREICHE } from './gruppen.js';
import { local } from './store.js';

export const PRIVATE_FILE = 'config_private.json';
export const PRIVATE_TYP = 'konfiguration';
const CACHE = 'fb.privateKonfig';
const MAX_BYTES = 200_000;

/* ------------------------------------------------------------------ Prüfen */

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isBool = (v) => typeof v === 'boolean';
const isEmail = (v) => isStr(v) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const emails = (v) => Array.isArray(v) && v.every(isEmail);
const texts = (v) => Array.isArray(v) && v.every((x) => isStr(x) && !!x.trim());
const driveId = (v) => isStr(v) && (v === '' || /^[\w-]{10,}$/.test(v));
const orEmpty = (test) => (v) => v === '' || test(v);

/** Je Schlüssel: Prüfung und was erwartet wird (für die Meldung) */
const RULES = {
  mitgliederGruppe: [orEmpty(isEmail), 'die E-Mail-Adresse einer Google-Gruppe oder ""'],
  admins: [(v) => emails(v) && v.length > 0, 'eine Liste mit mindestens einer E-Mail-Adresse'],
  redaktion: [emails, 'eine Liste von E-Mail-Adressen'],
  appUrl: [orEmpty((v) => isStr(v) && /^https?:\/\/\S+$/.test(v)), 'eine Adresse (https://…) oder ""'],
  kalenderId: [orEmpty((v) => isStr(v) && /^\S+@\S+$/.test(v)), 'eine Kalender-ID (…@group.calendar.google.com) oder ""'],
  tabellen: [(v) => isObj(v) && Object.entries(v).every(([k, x]) => ['adressen', 'news', 'einwilligungen'].includes(k) && driveId(x)),
    '{ "adressen", "news", "einwilligungen" } mit Tabellen-IDs oder ""'],
  adressenBlatt: [isStr, 'den Namen eines Tabellenblatts oder ""'],
  zeitungOrdnerId: [driveId, 'eine Ordner-ID oder ""'],
  liedermappeOrdnerId: [driveId, 'eine Ordner-ID oder ""'],
  dsZeitungOrdnerId: [driveId, 'eine Ordner-ID oder ""'],
  galerieOrdnerId: [driveId, 'eine Ordner-ID oder ""'],
  galerieUploadOrdnerId: [driveId, 'eine Ordner-ID oder ""'],
  chat: [(v) => isObj(v) && (v.aktiv === undefined || isBool(v.aktiv)) && (v.newsRaum === undefined || v.newsRaum === '' || /^spaces\/[\w-]+$/.test(v.newsRaum)),
    '{ "aktiv": true/false, "newsRaum": "spaces/…" oder "" }'],
  forum: [(v) => isObj(v) && (v.aktiv === undefined || isBool(v.aktiv)), '{ "aktiv": true/false }'],
  profilBearbeiten: [isBool, 'true oder false'],
  links: [(v) => Array.isArray(v) && v.every((l) => isObj(l) && isStr(l.titel) && !!l.titel.trim() && isStr(l.url) && /^https:\/\/\S+$/.test(l.url)
    && (l.symbol === undefined || isStr(l.symbol)) && (l.ohne === undefined || texts(l.ohne))),
  'eine Liste von { "titel", "url": "https://…", "symbol" (optional), "ohne": [Gruppen] (optional) }'],
  gruppen: [(v) => isObj(v) && (v.adressen === undefined || (isObj(v.adressen) && Object.values(v.adressen).every(isEmail)))
    && (v.ohne === undefined || (isObj(v.ohne) && Object.values(v.ohne).every(texts))),
  '{ "adressen": { "schlüssel": "gruppe@…" }, "ohne": { "bereich": [Gruppen] } }'],
  adressaenderung: [orEmpty(isEmail), 'eine E-Mail-Adresse oder ""'],
  vorstand: [(v) => isObj(v) && Object.entries(v).every(([k, x]) => ['aktive', 'altherren'].includes(k) && emails(x)),
    '{ "aktive": [E-Mail-Adressen], "altherren": [E-Mail-Adressen] }'],
  push: [(v) => isObj(v) && (v.konto === undefined || v.konto === '' || isEmail(v.konto))
    && (v.schluessel === undefined || v.schluessel === '' || (isStr(v.schluessel) && /^B[\w-]{86}$/.test(v.schluessel))),
  '{ "konto": "E-Mail-Adresse des Push-Skripts", "schluessel": "öffentlicher Schlüssel aus Push.gs (87 Zeichen)" }'],
  testMitglieder: [emails, 'eine Liste von E-Mail-Adressen'],
  ausgeblendeteKonten: [emails, 'eine Liste von E-Mail-Adressen'],
  statusOptionen: [texts, 'eine Liste von Texten'],
  statusGruppen: [(v) => isObj(v) && Object.values(v).every(texts), '{ "Gruppe": [Status …] }'],
  terminKategorien: [(v) => Array.isArray(v) && v.length > 0 && v.every((k) => isObj(k) && isStr(k.name) && !!k.name.trim() && isStr(k.farbe) && /^#[0-9a-f]{6}$/i.test(k.farbe)),
    'eine Liste von { "name", "farbe": "#rrggbb", "googleFarbe" (optional) }'],
  kleiderordnung: [texts, 'eine Liste von Texten'],
  forumKategorien: [texts, 'eine Liste von Texten'],
  newsKategorien: [texts, 'eine Liste von Texten'],
};

const lower = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim().toLowerCase()) : String(v).trim().toLowerCase());
const EMAIL_KEYS = ['mitgliederGruppe', 'admins', 'redaktion', 'adressaenderung', 'testMitglieder', 'ausgeblendeteKonten'];

/**
 * Private Konfiguration prüfen. Fehler = Datei wird nicht verwendet; Hinweise = Einträge werden ignoriert.
 * owner: Inhaber laut Google – muss unter „admins“ stehen.
 * Liefert { values, errors, warnings }; values ohne öffentliche, unbekannte und Anmerkungs-Schlüssel („_…“).
 */
export function validatePrivateConfig(data, { owner = '' } = {}) {
  const errors = [];
  const warnings = [];
  const values = {};
  if (!isObj(data)) return { values, errors: ['Die Datei enthält kein JSON-Objekt ({ … }).'], warnings };
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('_')) continue; // Anmerkungen, z. B. "_hinweis"
    if (PUBLIC_KEYS.includes(k)) { warnings.push(`„${k}“ gehört in das öffentliche config.js und wird hier ignoriert.`); continue; }
    if (k === 'datenschutz') {
      if (!isObj(v)) { errors.push('„datenschutz“: erwartet { "empfaenger": [E-Mail-Adressen] }.'); continue; }
      const ds = {};
      for (const [dk, dv] of Object.entries(v)) {
        if (dk.startsWith('_')) continue;
        if (PUBLIC_DATENSCHUTZ.includes(dk)) warnings.push(`„datenschutz.${dk}“ gehört in das öffentliche config.js (die Datenschutzerklärung ist auch ohne Anmeldung lesbar) und wird hier ignoriert.`);
        else if (dk !== 'empfaenger') warnings.push(`Unbekannte Einstellung „datenschutz.${dk}“ wird ignoriert.`);
        else if (!emails(dv)) errors.push('„datenschutz.empfaenger“: erwartet eine Liste von E-Mail-Adressen.');
        else ds.empfaenger = lower(dv);
      }
      if (Object.keys(ds).length) values.datenschutz = ds;
      continue;
    }
    const rule = RULES[k];
    if (!rule) { warnings.push(`Unbekannte Einstellung „${k}“ wird ignoriert.`); continue; }
    if (!rule[0](v)) { errors.push(`„${k}“: erwartet ${rule[1]}.`); continue; }
    values[k] = EMAIL_KEYS.includes(k) ? lower(v) : k === 'vorstand' ? Object.fromEntries(Object.entries(v).map(([g, x]) => [g, lower(x)]))
      : k === 'push' ? { konto: lower(v.konto || ''), schluessel: String(v.schluessel || '').trim() } : v;
  }
  if (!('admins' in data)) errors.push('„admins“ fehlt: mindestens eine E-Mail-Adresse eintragen.');
  // Inhaber laut Google muss Admin sein – sonst könnte eine fremde Datei die App steuern
  const o = lower(owner || '');
  if (o && values.admins && !values.admins.includes(o)) {
    errors.push(`Die Datei gehört ${o}, und dieses Konto steht nicht unter „admins“. Sie muss einem Admin gehören (Inhaber laut Google Drive).`);
  }
  // Gruppen und Bereiche (E41): Tippfehler fallen sonst nicht auf
  const gruppenKeys = Object.keys(values.gruppen?.adressen || {});
  for (const [bereich, liste] of Object.entries(values.gruppen?.ohne || {})) {
    if (!(bereich in BEREICHE)) warnings.push(`gruppen.ohne: unbekannter Bereich „${bereich}“ (bekannt: ${Object.keys(BEREICHE).join(', ')}).`);
    for (const g of liste) if (!gruppenKeys.includes(g)) warnings.push(`gruppen.ohne.${bereich}: Gruppe „${g}“ steht nicht unter gruppen.adressen.`);
  }
  for (const l of values.links || []) {
    for (const g of l.ohne || []) if (!gruppenKeys.includes(g)) warnings.push(`links „${l.titel}“: Gruppe „${g}“ steht nicht unter gruppen.adressen.`);
  }
  return { values, errors, warnings };
}

function configError(message, errors = []) {
  return Object.assign(new Error(message), { code: 'config_invalid', errors });
}

function parse(text) {
  try {
    return JSON.parse(String(text || '').replace(/^﻿/, ''));
  } catch (e) {
    throw configError(`Die private Konfiguration ist kein gültiges JSON (${e.message}).`);
  }
}

/* ------------------------------------------------------------------ Laden */

let status = { status: 'aus' };

/** Ergebnis des letzten Ladens: aus (alte Form) | ok | cache (zuletzt geprüfter Stand) | fehler */
export const privateConfigStatus = () => status;

const isLocalhost = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

async function readDrive(id) {
  const meta = await drive.getFile(id, 'id,name,mimeType,size,modifiedTime,owners(emailAddress),driveId,webViewLink');
  if (String(meta.mimeType || '').startsWith('application/vnd.google-apps.')) {
    throw configError('Die private Konfiguration ist ein Google-Dokument – bitte als JSON-Datei „config_private.json“ hochladen bzw. in der Einrichtung speichern.');
  }
  if (Number(meta.size || 0) > MAX_BYTES) throw configError('Die private Konfiguration ist ungewöhnlich groß und wird nicht verwendet.');
  const text = await drive.downloadText(id);
  // geteilte Ablage: dort gehört die Datei der Ablage, nicht einer Person
  return { text, meta, owner: meta.driveId ? '' : String(meta.owners?.[0]?.emailAddress || '') };
}

/** Nur für die Entwicklung auf localhost (config.debug.privateConfigFile): lokale Datei statt Drive */
async function readLocal(file) {
  const res = await fetch(file, { cache: 'no-store' });
  if (!res.ok) throw configError(`Lokale Konfiguration „${file}“ nicht gefunden (${res.status}).`);
  return { text: await res.text(), meta: { name: file }, owner: '' };
}

/**
 * Private Konfiguration laden, prüfen und übernehmen – vor dem Start der App (app.js, enterGoogle).
 * Ohne privateConfigId (alte Form) passiert nichts. Scheitert das Laden oder die Prüfung, gilt der zuletzt geprüfte
 * Stand auf dem Gerät; ohne ihn wirft die Funktion (die App erklärt dann auf der Anmeldeseite, was fehlt).
 */
export async function loadPrivateConfig() {
  const id = String(config.privateConfigId || '').trim();
  const file = isLocalhost() ? String(config.debug?.privateConfigFile || '').trim() : '';
  if (!id && !file) {
    status = { status: 'aus' };
    return status;
  }
  const quelle = file ? `datei:${file}` : id;
  const cache = local.get(CACHE, null);
  const cacheOk = cache?.quelle === quelle && isObj(cache.values);
  const fromCache = (error) => {
    applyPrivateConfig(cache.values);
    status = { status: 'cache', quelle, error, geladen: cache.geladen, warnings: cache.warnings || [] };
    return status;
  };
  // offline: gleich der zuletzt geprüfte Stand (spart die Wartezeit der Wiederholversuche)
  if (!file && cacheOk && !navigator.onLine) return fromCache(Object.assign(new Error('Keine Verbindung'), { status: 0 }));
  let error;
  try {
    const { text, meta, owner } = file ? await readLocal(file) : await readDrive(id);
    const res = validatePrivateConfig(parse(text), { owner });
    if (!res.errors.length) {
      applyPrivateConfig(res.values);
      const geladen = new Date().toISOString();
      local.set(CACHE, { quelle, values: res.values, geladen, warnings: res.warnings });
      status = { status: 'ok', quelle, geladen, warnings: res.warnings, meta };
      if (res.warnings.length) console.warn('Private Konfiguration:', res.warnings.join(' '));
      return status;
    }
    error = configError(`Die App-Einstellungen sind fehlerhaft: ${res.errors.join(' ')}`, res.errors);
  } catch (e) {
    error = e;
  }
  console.warn('Private Konfiguration nicht geladen', error);
  if (cacheOk) return fromCache(error);
  status = { status: 'fehler', quelle, error };
  throw error;
}

/** Beim Abmelden: zuletzt geprüften Stand vom Gerät löschen */
export function clearPrivateConfigCache() {
  local.del(CACHE);
}

/* ------------------------------------------------------------------ Speichern (Einrichtung, nur Admins) */

/**
 * Private Konfiguration als eigene Datei in Google Drive speichern: ersetzt den Inhalt der eigenen Datei
 * (privateConfigId oder früher angelegt) oder legt „config_private.json“ im eigenen Drive neu an; danach für die
 * Konten der Domain lesbar (ohne Suche), im Prototyp ohne Workspace für die Test-Mitglieder. Fremde Dateien ändert
 * die App nicht (Schreibschutz). owner = eigenes Konto: muss unter „admins“ stehen, sonst würde die Datei nicht geladen.
 */
export async function savePrivateConfig(obj, { owner = '', neu = false } = {}) {
  const res = validatePrivateConfig(obj, { owner });
  if (res.errors.length) throw configError(`Nicht gespeichert – ${res.errors.join(' ')}`, res.errors);
  const blob = new Blob([`${JSON.stringify(obj, null, 2)}\n`], { type: 'application/json' });
  const id = String(config.privateConfigId || '').trim();
  let target = null;
  if (id && !neu) {
    const f = await drive.getFile(id, 'id,ownedByMe,trashed').catch(() => null);
    if (f?.ownedByMe && !f.trashed) target = f;
  }
  if (!target && !neu) {
    // früher angelegte eigene Datei wiederverwenden (z. B. vor dem Eintragen der ID in config.js)
    const own = await drive.listFiles(`appProperties has { key='fbTyp' and value='${PRIVATE_TYP}' } and trashed = false`,
      { fields: 'id,name,ownedByMe,modifiedTime', orderBy: 'modifiedTime desc' }).catch(() => []);
    target = own.find((f) => f.ownedByMe) || null;
  }
  let file;
  if (target) {
    registerOwnFile(target.id);
    file = await drive.updateWithContent(target.id, {}, blob, 'id,name,modifiedTime,webViewLink');
  } else {
    file = await drive.upload({ name: PRIVATE_FILE, mimeType: 'application/json', appProperties: { fbTyp: PRIVATE_TYP } }, blob, 'id,name,modifiedTime,webViewLink');
    registerOwnFile(file.id);
  }
  await sharePrivateConfig(file.id);
  return { id: file.id, url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`, neu: !target, warnings: res.warnings };
}

/** Lesbar für die Domain (ohne Suche) bzw. die Mitglieder-Gruppe; im Prototyp für die Test-Mitglieder – nie bearbeitbar */
async function sharePrivateConfig(fileId) {
  const perms = await drive.listPermissions(fileId).catch(() => []);
  const key = (p) => `${p.type}:${String(p.domain || p.emailAddress || '').toLowerCase()}`;
  const have = new Set(perms.map(key));
  const want = [];
  if (config.workspaceDomain) want.push({ type: 'domain', role: 'reader', domain: config.workspaceDomain, allowFileDiscovery: false });
  else if (config.mitgliederGruppe) want.push({ type: 'group', role: 'reader', emailAddress: config.mitgliederGruppe });
  for (const e of config.testMitglieder || []) want.push({ type: 'user', role: 'reader', emailAddress: e });
  for (const p of want) if (!have.has(key(p))) await drive.addPermission(fileId, p);
}
