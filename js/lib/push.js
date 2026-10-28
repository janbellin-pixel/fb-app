// Push-Mitteilungen (E50) – nur, wenn das Mitglied sie auf einem Gerät einschaltet (Mehr › Einstellungen).
// Dann kommt auch bei geschlossener App eine Mitteilung bei neuen News, Forumsbeiträgen und Terminen.
// Verschickt werden sie von apps-script/Push.gs im Konto config.push.konto. Die App meldet dafür das Gerät an:
// Push-Adresse des Browsers mit Schlüsseln und Themen als eigene Datei im eigenen Drive (fbTyp=push), lesbar nur
// für dieses Konto. Chat-Nachrichten meldet weiter die App „Google Chat“ (E33).
// Ein/aus und Themen merkt sich das Gerät je Konto (localStorage); maßgeblich für das Skript ist die Datei.
import { config } from '../config.js';
import { local } from './store.js';
import { isIos, isStandalone } from '../ui.js';
import { gesperrt } from './gruppen.js';
import { geraetInfo } from './datenschutz.js';

export const THEMEN = [
  { id: 'news', label: 'News', sub: 'Neue Beiträge der Redaktion', bereich: 'news' },
  { id: 'forum', label: 'Forum', sub: 'Neue Themen und Antworten', bereich: 'forum' },
  { id: 'termine', label: 'Termine', sub: 'Neu eingetragene Termine', bereich: 'termine' },
];

const KEY = (email) => `fb.push.${String(email || '').toLowerCase()}`;

/** Stand auf diesem Gerät: { an, geraet, themen, endpoint, schluessel, konto, neu } */
export const pushStand = (email) => ({ an: false, themen: [], ...(local.get(KEY(email), null) || {}) });
const merken = (email, stand) => local.set(KEY(email), stand);

/** Haben die Admins Push eingerichtet (Konto des Skripts und dessen öffentlicher Schlüssel)? */
export const pushEingerichtet = () => /^B[A-Za-z0-9_-]{86}$/.test(String(config.push?.schluessel || ''))
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(config.push?.konto || ''));
export const pushUnterstuetzt = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** iPhone und iPad: Push gibt es nur für die App auf dem Home-Bildschirm (ab iOS 16.4) */
export const pushNurInstalliert = () => isIos() && !isStandalone();

/** Themen, die das Mitglied in der App überhaupt sieht (Gruppen, E41; Forum aus; kein Kalender) */
export const moeglicheThemen = () => THEMEN.filter((t) => !gesperrt(t.bereich)
  && (t.id !== 'forum' || config.forum?.aktiv !== false) && (t.id !== 'termine' || !!config.kalenderId));

/** Kommt dieses Thema auf diesem Gerät schon per Push? (Dann zeigt die App dieselbe Mitteilung nicht noch einmal) */
export const pushThemaAn = (email, thema) => {
  const s = pushStand(email);
  return !!s.an && !s.demo && s.themen.includes(thema);
};

function schluesselBytes(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

const gleicheBytes = (a, b) => !!a && !!b && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i]);

async function registrierung() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('Der Service Worker der App fehlt noch – bitte die Seite neu laden.');
  return reg;
}

const zufallsId = () => [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16);

/** Push-Adresse dieses Geräts (mit dem Schlüssel aus der Konfiguration) – bei anderem Schlüssel neu anmelden */
async function abonnieren(stand) {
  const reg = await registrierung();
  const key = schluesselBytes(config.push.schluessel);
  let sub = await reg.pushManager.getSubscription();
  const alterSchluessel = sub && (sub.options?.applicationServerKey ? !gleicheBytes(sub.options.applicationServerKey, key)
    : !!stand.schluessel && stand.schluessel !== config.push.schluessel);
  if (alterSchluessel) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const j = sub.toJSON();
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
}

async function anmelden(app, stand, themen) {
  const abo = await abonnieren(stand);
  await app.backend.saveMyPush({ geraet: stand.geraet, ...abo, themen, name: geraetInfo() });
  const neu = { an: true, geraet: stand.geraet, themen, endpoint: abo.endpoint, schluessel: config.push.schluessel, konto: config.push.konto };
  merken(app.user.email, neu);
  return neu;
}

/**
 * Einschalten – nur nach einem Klick aufrufen (der Browser fragt dann nach seiner Erlaubnis).
 * In der Demo gibt es keinen Absender: dort nur eine Beispiel-Mitteilung.
 */
export async function pushEinschalten(app, themen) {
  if (!pushUnterstuetzt()) throw new Error('Dieser Browser kann keine Push-Mitteilungen empfangen.');
  const erlaubnis = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission().catch(() => Notification.permission);
  if (erlaubnis !== 'granted') {
    throw Object.assign(new Error('Mitteilungen sind nicht erlaubt. Du kannst sie in den Einstellungen des Browsers für diese Seite erlauben.'), { code: 'denied' });
  }
  const email = app.user.email;
  const stand = { ...pushStand(email), geraet: pushStand(email).geraet || zufallsId() };
  if (app.mode === 'demo') {
    merken(email, { an: true, demo: true, geraet: stand.geraet, themen });
    const reg = await registrierung();
    await reg.showNotification('News: Stiftungsfest 2027', { body: 'So sieht eine Push-Mitteilung aus – in der Demo nur als Beispiel.', icon: 'assets/icons/icon-192.png', tag: 'push-beispiel', data: { url: `${location.origin}${location.pathname}#/news` } });
    return pushStand(email);
  }
  if (!pushEingerichtet()) throw new Error('Push-Mitteilungen sind noch nicht eingerichtet.');
  return anmelden(app, stand, themen);
}

/** Themen ändern (eingeschaltet) */
export async function pushThemenSetzen(app, themen) {
  const email = app.user.email;
  const stand = pushStand(email);
  if (!stand.an) return stand;
  if (stand.demo) {
    merken(email, { ...stand, themen });
    return pushStand(email);
  }
  return anmelden(app, stand, themen);
}

/** Ausschalten: Gerät beim Browser abmelden und die eigene Datei in den Papierkorb */
export async function pushAusschalten(app) {
  const email = app.user.email;
  const stand = pushStand(email);
  merken(email, { an: false, geraet: stand.geraet, themen: stand.themen });
  if (stand.demo || app.mode === 'demo') return;
  const reg = pushUnterstuetzt() ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  const endpoint = sub?.endpoint || stand.endpoint || '';
  await sub?.unsubscribe().catch(() => {});
  if (stand.geraet || endpoint) await app.backend.deleteMyPush({ geraet: stand.geraet, endpoint });
}

/**
 * Beim Start (angemeldet, eingeschaltet): neue Push-Adresse, neuer Schlüssel oder neues Konto des Skripts,
 * inzwischen ausgeblendete Themen → Datei nachziehen. Ist die Erlaubnis weg, abmelden.
 */
export async function pushAbgleichen(app) {
  if (app.mode !== 'google' || !pushUnterstuetzt()) return;
  const email = app.user.email;
  const stand = pushStand(email);
  if (!stand.an || stand.demo || !pushEingerichtet()) return;
  if (Notification.permission !== 'granted') {
    await pushAusschalten(app).catch((e) => console.warn('Push nicht abgemeldet', e));
    return;
  }
  const themen = stand.themen.filter((t) => moeglicheThemen().some((x) => x.id === t));
  try {
    const reg = await registrierung();
    const sub = await reg.pushManager.getSubscription();
    if (sub && sub.endpoint === stand.endpoint && stand.schluessel === config.push.schluessel && stand.konto === config.push.konto
      && themen.length === stand.themen.length) return;
    await anmelden(app, stand, themen);
  } catch (e) {
    // z. B. Safari: neu anmelden geht nur nach einem Tipp – die Einstellungen bitten darum
    merken(email, { ...stand, neu: true });
    console.warn('Push nicht abgeglichen', e);
  }
}
