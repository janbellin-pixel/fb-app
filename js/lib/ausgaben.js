// Neue Ausgaben von Bundesbote und DS-Zeitung (E68): ein Punkt an den Menüpunkten – Navigation oben, Tab und Seite
// „Mehr“, Schnellzugriff auf der Startseite – und „Neu“ an der Ausgabe, bis sie auf diesem Gerät geöffnet wurde.
// Was gelesen ist, merkt sich nur dieses Gerät (localStorage, je Konto), wie die Markierungen im Forum; nichts davon
// geht an Google. Beim ersten Mal gilt alles, was schon da ist, als gelesen (in der Demo bleibt je Zeitung die neueste
// neu, damit man den Punkt sieht). Nachgereichte alte Ausgaben (Jahr vor dem Vorjahr) zählen nie als neu.
// Anders als die Zahlen an Chat und News (E34) ohne Schalter: Die Listen lädt die App ohnehin (Startseite, Archiv) –
// hier über denselben Zwischenspeicher, frisch höchstens alle 15 Minuten (beim Start, Seitenwechsel, Wiederkehren).
import { html } from '../html.js';
import { local, kv } from './store.js';
import { gesperrt } from './gruppen.js';
import { config, hasDsZeitung } from '../config.js';
import * as auth from '../auth.js';

/** Je Zeitung (Quelle wie in ZEITUNGEN, backend/common.js): Schlüssel des Zwischenspeichers und Bereich (Gruppen, E41) */
export const QUELLEN = {
  bundesbote: { key: 'issues', bereich: 'zeitung' },
  ds: { key: 'dsIssues', bereich: 'dsZeitung' },
};
const ABSTAND = 15 * 60_000;
const MAX_GELESEN = 2000;
const stateKey = (email) => `fb.ausgaben.${String(email || '').toLowerCase()}`;

let app = null;
let state = null; // { bundesbote: { voll, gelesen: [IDs] }, ds: … } – voll: die Liste war schon einmal geladen
const listen = {}; // Quelle → zuletzt geladene Ausgaben ({ id, year })
let zuletzt = 0;
let gestartet = false;

/** Neu ist, was nicht gelesen ist und nicht aus einem Jahr vor dem Vorjahr stammt (z. B. ein nachgereichtes Archiv) */
export function neueAusgaben(issues, gelesen, jetzt = new Date()) {
  const seen = new Set(gelesen || []);
  const vorjahr = jetzt.getFullYear() - 1;
  return (issues || []).filter((i) => i?.id && !seen.has(i.id) && (!i.year || i.year >= vorjahr));
}

const eingerichtet = (q) => app?.mode === 'demo' || (q === 'ds' ? hasDsZeitung() : !!String(config.zeitungOrdnerId || '').trim());
const sichtbar = (q) => !!app?.user && !gesperrt(QUELLEN[q].bereich) && eingerichtet(q);

function save() {
  if (app?.user && state) local.set(stateKey(app.user.email), state);
}

/** Neue Ausgaben einer Zeitung – leer, solange ihre Liste noch nie geladen wurde oder der Bereich ausgeblendet ist */
export function neue(q) {
  if (!QUELLEN[q] || !state?.[q]?.voll || !listen[q] || !sichtbar(q)) return [];
  return neueAusgaben(listen[q], state[q].gelesen);
}

/** Ist diese Ausgabe neu? (für „Neu“ im Archiv und auf der Startseite) */
export const istNeu = (issue) => !!issue?.id && neue(issue.quelle || 'bundesbote').some((i) => i.id === issue.id);

/** Anzahl neuer Ausgaben je Zeitung und zusammen („mehr“: Tab „Mehr“) */
export function anzahl() {
  const n = { bundesbote: neue('bundesbote').length, ds: neue('ds').length };
  return { ...n, mehr: n.bundesbote + n.ds };
}

/** Punkt für einen Menüpunkt (Zeitung oder „mehr“) – sichtbar, solange es dort Neues gibt */
export const punkt = (q) => html`<span class="neu-punkt hidden" data-dot="${q}"><span class="sr-only">(neue Ausgabe)</span></span>`;

/** Punkte neu zeichnen – nach dem Aufbau einer Seite mit [data-dot]-Elementen */
export function refreshDots() {
  const n = anzahl();
  document.querySelectorAll('[data-dot]').forEach((el) => el.classList.toggle('hidden', !n[el.dataset.dot]));
}

/** Liste geladen (Startseite, Archiv, Leser oder hier): merken; beim ersten Mal gilt alles, was da ist, als gelesen */
export function geladen(q, issues) {
  if (!state || !QUELLEN[q] || !Array.isArray(issues)) return;
  listen[q] = issues.filter((i) => i?.id).map((i) => ({ id: i.id, year: i.year || 0 }));
  if (!state[q]?.voll) {
    const ids = listen[q].map((i) => i.id);
    state[q] = { voll: true, gelesen: [...new Set([...(state[q]?.gelesen || []), ...(app.mode === 'demo' ? ids.slice(1) : ids)])].slice(-MAX_GELESEN) };
    save();
  }
  refreshDots();
}

/** Ausgabe geöffnet (Leseansicht oder PDF) → gelesen */
export function gelesen(q, id) {
  if (!state || !QUELLEN[q] || !id) return;
  const s = state[q] || (state[q] = { voll: false, gelesen: [] });
  if (!s.gelesen.includes(id)) {
    s.gelesen = [...s.gelesen, id].slice(-MAX_GELESEN);
    save();
  }
  refreshDots();
}

/**
 * Beide Listen laden (Zwischenspeicher, höchstens alle 15 Minuten frisch) – beim Start, bei jedem Seitenwechsel und wenn
 * die App wieder sichtbar wird; nicht während der Datenschutz-Abfrage (danach beim nächsten Seitenwechsel)
 */
export async function pruefen() {
  if (!app?.user || !app.backend || app.consentPending || Date.now() - zuletzt < ABSTAND) return;
  // offline oder mit (fast) abgelaufener Anmeldung nur den gespeicherten Stand – sonst käme „Sitzung abgelaufen“
  const frisch = app.mode !== 'google' || (navigator.onLine && auth.tokenExpiresIn() > 90_000);
  if (frisch) zuletzt = Date.now();
  for (const q of Object.keys(QUELLEN)) {
    if (!sichtbar(q)) continue;
    try {
      if (frisch) await app.load(QUELLEN[q].key, () => app.backend.listIssues(q), (list) => geladen(q, list), { maxAge: ABSTAND });
      else {
        const c = await kv.get(`${app.user.email}:${QUELLEN[q].key}`);
        if (c?.v) geladen(q, c.v);
      }
    } catch (e) {
      console.warn(`Neue Ausgaben (${q}) nicht geprüft`, e);
    }
  }
}

/** Stand dieses Kontos laden (ohne zu prüfen) – auch für die Tests */
export function initAusgaben(theApp) {
  app = theApp;
  zuletzt = 0;
  for (const k of Object.keys(listen)) delete listen[k];
  state = app?.user ? { ...(local.get(stateKey(app.user.email), null) || {}) } : null;
  refreshDots();
}

/** Beim Start der App (angemeldet bzw. Demo) einmal aufrufen */
export function startAusgaben(theApp) {
  initAusgaben(theApp);
  if (!app?.user || gestartet) return;
  gestartet = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pruefen();
  });
  setTimeout(pruefen, 2500);
}
