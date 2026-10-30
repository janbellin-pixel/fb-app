// Einladung in die App (E58): Wer im Adressverzeichnis steht, aber die App noch nicht nutzt, lässt sich von den
// Geburtstagen und aus dem Adressverzeichnis einladen – mit einer vorbereiteten E-Mail (mailto) oder telefonisch.
// Die App schreibt dabei nichts; Konten legt der Vorstand an, Zugangsdaten gibt es auf Anfrage an config.zugangsdaten.
// Hier auch die Zuordnung Adresseintrag → Mitglied: nur unter denen, die die App nutzen (appNutzer, E40), über die
// E-Mail-Adresse, sonst über Vor- und Nachnamen.
import { config, appBaseUrl } from '../config.js';
import { mailEnc, nameKey, nameParts } from './adressabgleich.js';
import { firstName } from './text.js';

/** Postfach, bei dem neue Mitglieder ihre Zugangsdaten anfragen (Einrichtung → Optionen); leer = beim Absender */
export function zugangsdatenEmail() {
  return String(config.zugangsdaten || '').trim();
}

/**
 * Nachschlagen für viele Einträge des Adressverzeichnisses: members ist die Map E-Mail → Mitglied (memberMap()).
 * Es zählen nur Mitglieder, die die App nutzen (appNutzer) – wer nur ein Konto hat, bekommt die Einladung; so stört
 * auch ein zweites, ungenutztes Konto gleichen Namens nicht. Gefunden wird über die E-Mail-Adresse, sonst über den
 * Namen: erst genau (nameKey, ohne Titel), dann über Vor- und Nachnamen (der Nachname und ein Vorname des Eintrags
 * kommen im Kontonamen vor – Reihenfolge und zweite Vornamen sind egal, Initialen reichen nicht). Immer nur bei
 * genau einem Treffer, lieber keins als das falsche.
 */
export function memberFinder(members) {
  const nutzer = [...(members?.values?.() || [])].filter((m) => m?.appNutzer);
  const genau = new Map();
  for (const m of nutzer) {
    const k = nameKey(m.name);
    if (k) genau.set(k, genau.has(k) ? null : m); // null = mehrdeutig
  }
  const teile = nutzer.map((m) => ({ m, set: new Set(nameParts(m.name)) }));
  return (a) => {
    if (!a || !nutzer.length) return null;
    const mail = String(a.email || '').toLowerCase().trim();
    const direkt = mail ? members.get(mail) : null;
    if (direkt?.appNutzer) return direkt;
    for (const k of [nameKey(a.name), nameKey(`${a.vorname || ''} ${a.nachname || ''}`)]) {
      if (k && genau.has(k)) return genau.get(k);
    }
    let nach = nameParts(a.nachname);
    let vor = nameParts(a.vorname);
    if (!nach.length || !vor.length) {
      const t = nameParts(a.name);
      nach = t.slice(-1);
      vor = t.slice(0, -1);
    }
    if (!nach.length || !vor.length) return null;
    const treffer = teile.filter(({ set }) => nach.every((t) => set.has(t)) && vor.some((t) => set.has(t)));
    return treffer.length === 1 ? treffer[0].m : null;
  };
}

/** Mitglied, das die App nutzt, zu einem Eintrag des Adressverzeichnisses – oder null, wenn es keins gibt */
export const memberForAddress = (a, members) => memberFinder(members)(a);

/** Ansprache: Vorname ohne Titel, sonst der ganze Name */
export const rufname = (a) => firstName(a?.vorname || a?.name) || String(a?.name || '').trim();

/**
 * Vorbereitete Einladung als mailto-Link (nur ASCII im Link wie bei Adressänderungen, E37): in der Ich-Form des
 * Absenders, mit dem Weg zu den Zugangsdaten (config.zugangsdaten; ist dort nichts eingetragen: beim Absender)
 * und der Adresse der App. Ohne E-Mail-Adresse im Verzeichnis gibt es keinen Link (href leer).
 */
export function einladungsMail(a, absender) {
  const an = String(a?.email || '').trim();
  const zugang = zugangsdatenEmail();
  const subject = `Einladung in die Mitglieder-App der ${config.appName}`;
  const body = [
    `Hallo ${rufname(a)},`,
    '',
    `ich möchte dich in die Mitglieder-App der ${config.appName} einladen. Dort findest du unsere Termine mit Zu- und Absage, den Bundesboten zum Durchblättern, Fotos, News, Forum, das Adressverzeichnis und den Chat – alles an einem Ort, auf dem Handy wie am PC.`,
    '',
    zugang
      ? `Zur Registrierung schreib einfach eine E-Mail mit der Bitte um Zugangsdaten an ${zugang}.`
      : 'Zur Registrierung antworte einfach auf diese E-Mail mit der Bitte um Zugangsdaten.',
    `Danach kannst du dich in der App anmelden: ${appBaseUrl()}`,
    '',
    'Viele Grüße',
    String(absender?.name || '').trim(),
  ].join('\n');
  return { an, subject, body, href: an ? `mailto:${an}?subject=${mailEnc(subject)}&body=${mailEnc(body)}` : '' };
}
