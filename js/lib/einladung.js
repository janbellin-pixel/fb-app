// Einladung in die App (E58): Wer im Adressverzeichnis steht, aber kein App-Konto hat, lässt sich von den
// Geburtstagen aus einladen – mit einer vorbereiteten E-Mail (mailto) oder telefonisch. Die App schreibt dabei
// nichts; Konten legt der Vorstand an, Zugangsdaten gibt es auf Anfrage an config.zugangsdaten.
// Hier auch die Zuordnung Adresseintrag → Mitglied: über die E-Mail-Adresse, sonst über den Namen.
import { config, appBaseUrl } from '../config.js';
import { mailEnc, nameKey } from './adressabgleich.js';
import { firstName } from './text.js';

/** Postfach, bei dem neue Mitglieder ihre Zugangsdaten anfragen (Einrichtung → Optionen); leer = beim Absender */
export function zugangsdatenEmail() {
  return String(config.zugangsdaten || '').trim();
}

/**
 * Nachschlagen für viele Einträge des Adressverzeichnisses: members ist die Map E-Mail → Mitglied (memberMap()).
 * Gefunden wird über die E-Mail-Adresse, sonst über den Namen ohne Titel (nameKey) – nur bei genau einem
 * Mitglied dieses Namens, lieber keins als das falsche. Steht im Verzeichnis eine private Adresse, zählt der Name.
 */
export function memberFinder(members) {
  const byName = new Map();
  for (const m of members?.values?.() || []) {
    const k = nameKey(m.name);
    if (k) byName.set(k, byName.has(k) ? null : m); // null = mehrdeutig
  }
  return (a) => {
    if (!a || !members?.size) return null;
    const mail = String(a.email || '').toLowerCase().trim();
    if (mail && members.has(mail)) return members.get(mail);
    for (const k of [nameKey(a.name), nameKey(`${a.vorname || ''} ${a.nachname || ''}`)]) {
      if (k && byName.has(k)) return byName.get(k);
    }
    return null;
  };
}

/** Mitglied (App-Konto) zu einem Eintrag des Adressverzeichnisses – oder null, wenn es keins gibt */
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
