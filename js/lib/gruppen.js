// Gruppen der Verbindung (E41)
// ============================
// Welche Bereiche eine Gruppe in der App NICHT sieht, steht in config.gruppen.ohne (bei Links in links[].ohne).
// Zu welchen Gruppen das angemeldete Mitglied gehört, erkennt die App ohne neue Google-Berechtigung an
// „Kennungsdateien“: je Gruppe eine kleine Datei eines Admins, die nur für diese Gruppe freigegeben ist –
// wer sie lesen kann, gehört dazu (GoogleBackend.myGroups(), angelegt in der Einrichtung).
// Das Ausblenden betrifft nur die Oberfläche. Wirklich geschützt sind Daten über ihre Drive-Freigaben
// (z. B. das Adressverzeichnis nur für die Bundesbrüder freigeben).
import { config } from '../config.js';
import { local } from './store.js';

/** Bereiche der App, die sich je Gruppe ausblenden lassen (Schlüssel wie in config.gruppen.ohne) */
export const BEREICHE = {
  termine: 'Termine', chat: 'Chat', mitglieder: 'Mitgliederliste', adressen: 'Adressverzeichnis', news: 'News',
  forum: 'Forum', zeitung: 'Bundesbote', dsZeitung: 'DS-Zeitung', lieder: 'Liedermappe', galerie: 'Galerie',
};

const KEY = (email) => `fb.gruppen.${String(email || '').toLowerCase()}`;
let meine = null; // Set der Gruppen-Schlüssel; null = (noch) unbekannt

/** Gruppen-Adressen aus config.gruppen.adressen, z. B. { gaeste: 'gaeste@…' } */
export function gruppenAdressen() {
  const a = config.gruppen?.adressen || {};
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v || '').trim().toLowerCase()]).filter(([, v]) => v));
}

/** Eigene Gruppen setzen und auf dem Gerät merken (für den nächsten Start und offline) */
export function setMeineGruppen(email, keys) {
  meine = new Set((keys || []).map(String));
  local.set(KEY(email), [...meine]);
  return meine;
}

/** Beim Start: zuletzt bekannte Gruppen vom Gerät */
export function ladeGemerkteGruppen(email) {
  const v = local.get(KEY(email), null);
  meine = Array.isArray(v) ? new Set(v.map(String)) : null;
  return meine;
}

export const meineGruppen = () => meine;

function gesperrtFuer(ohne, gruppen) {
  const list = (Array.isArray(ohne) ? ohne : []).map(String);
  if (!gruppen || !gruppen.size || !list.length) return false;
  // gesperrt nur, wenn KEINE meiner Gruppen den Bereich sehen darf (Bundesbruder und Gast → sieht ihn)
  return [...gruppen].every((g) => list.includes(g));
}

/** Ist der Bereich für mich ausgeblendet? Ohne bekannte Gruppe ist nichts gesperrt. */
export const gesperrt = (bereich, gruppen = meine) => gesperrtFuer(config.gruppen?.ohne?.[bereich], gruppen);

/** Ist ein Link aus config.links (mit links[].ohne) für mich ausgeblendet? */
export const linkGesperrt = (link, gruppen = meine) => gesperrtFuer(link?.ohne, gruppen);
