// Abgleich „Mein Profil“ ↔ Adressverzeichnis
// ===========================================
// Das Adressverzeichnis pflegt der Schriftwart; die App ändert es nie (Schreibschutz).
// Gibt ein Mitglied abweichende Daten ein, bereitet die App eine E-Mail an das Postfach für
// Adressänderungen vor – mit den neuen Angaben und dem Hinweis, dass der Eintrag falsch oder
// unvollständig ist. Abgeschickt wird sie vom Mitglied selbst aus dem eigenen E-Mail-Programm.
import { config } from '../config.js';
import { norm } from './text.js';
import { parseFlexibleDate, isoDate } from './dates.js';

/** Anschrift und Kontakt – nur zum Abgleich, wird nicht im Profil gespeichert */
export const ADRESS_FELDER = [
  { key: 'strasse', label: 'Straße und Hausnummer', auto: 'street-address' },
  { key: 'plz', label: 'PLZ', auto: 'postal-code', mode: 'numeric' },
  { key: 'ort', label: 'Ort', auto: 'address-level2' },
  { key: 'land', label: 'Land', auto: 'country-name' },
  { key: 'telefon', label: 'Telefon (Festnetz)', type: 'tel', auto: 'tel' },
  { key: 'mobil', label: 'Mobil', type: 'tel', auto: 'tel' },
  { key: 'email', label: 'E-Mail-Adresse', type: 'email', auto: 'email' },
  { key: 'geburtstag', label: 'Geburtstag', ph: 'TT.MM.JJJJ' },
];

/** Diese Profilfelder stehen auch im Adressverzeichnis und werden mit abgeglichen */
export const PROFIL_FELDER = [
  { key: 'kneipname', label: 'Kneipname' },
  { key: 'status', label: 'Status' },
  { key: 'rezeption', label: 'Rezeption' },
];

export const ALLE_FELDER = [...PROFIL_FELDER, ...ADRESS_FELDER];

/** Empfänger für Änderungsmeldungen */
export function adressaenderungEmail() {
  return String(config.adressaenderung || '').trim();
}

/* ------------------------------------------------------------------ eigenen Eintrag finden */

const TITEL = /\b(prof|dr|dipl|ing|med|jur|rer|nat|phil|habil|mult|h\.?\s?c)\b\.?/gi;
/** Vergleichsschlüssel für Namen: ohne Titel, Leer- und Sonderzeichen */
export const nameKey = (s) => norm(String(s || '').replace(TITEL, ' ')).replace(/[^a-z]/g, '');

/**
 * Eintrag des Mitglieds im Adressverzeichnis: zuerst über die E-Mail-Adresse des Google-Kontos,
 * sonst über den Namen (ohne Titel). Bei mehreren Treffern lieber keinen als den falschen.
 */
export function findOwnAddress(items, { email, name }) {
  const list = Array.isArray(items) ? items : [];
  const mail = String(email || '').toLowerCase().trim();
  const byMail = mail ? list.filter((a) => a.email && a.email.toLowerCase() === mail) : [];
  if (byMail.length === 1) return { entry: byMail[0], via: 'email' };
  const key = nameKey(name);
  if (!key) return { entry: null, mehrdeutig: false };
  const byName = list.filter((a) => nameKey(a.name) === key || nameKey(`${a.vorname} ${a.nachname}`) === key);
  if (byName.length === 1) return { entry: byName[0], via: 'name' };
  return { entry: null, mehrdeutig: byName.length > 1 };
}

/* ------------------------------------------------------------------ vergleichen */

const deDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);

/** Wert eines Verzeichniseintrags so, wie er im Formular erscheinen soll */
export function anzeigeWert(entry, key) {
  if (!entry) return '';
  if (key === 'geburtstag') return entry.geburtstag ? deDate(entry.geburtstag) : String(entry.geburtstagText || '').trim();
  return String(entry[key] ?? '').trim();
}

/** Vergleichsschlüssel: kleine Schreibweisen-Unterschiede gelten nicht als Abweichung */
export function vergleichsWert(key, value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  switch (key) {
    case 'plz':
      return s.replace(/\D/g, '');
    case 'telefon':
    case 'mobil': {
      let d = s.replace(/\(0\)/g, '').replace(/[^\d+]/g, '');
      if (d.startsWith('+49')) d = `0${d.slice(3)}`;
      else if (d.startsWith('0049')) d = `0${d.slice(4)}`;
      return d.replace(/\+/g, '');
    }
    case 'email':
      return s.toLowerCase();
    case 'geburtstag': {
      const d = parseFlexibleDate(s);
      return d ? isoDate(d) : norm(s);
    }
    case 'strasse':
      return norm(s).replace(/(strasse|str\.?)(?=\s|\d|$)/g, 'str').replace(/[\s.,-]+/g, '');
    case 'land': {
      const l = norm(s).replace(/[^a-z]/g, '');
      return ['de', 'deu', 'deutschland', 'germany', 'brd'].includes(l) ? 'deutschland' : l;
    }
    default:
      return norm(s).replace(/\s+/g, ' ');
  }
}

/**
 * Unterschiede zwischen Eingabe und Verzeichniseintrag.
 * art: 'fehlt' (im Verzeichnis leer), 'anders' (abweichend), 'entfernen' (Eingabe geleert)
 */
export function vergleiche(eingabe, entry) {
  const diffs = [];
  for (const f of ALLE_FELDER) {
    const neu = String(eingabe?.[f.key] ?? '').trim();
    const alt = anzeigeWert(entry, f.key);
    if (vergleichsWert(f.key, neu) === vergleichsWert(f.key, alt)) continue;
    diffs.push({ key: f.key, label: f.label, alt, neu, art: !alt ? 'fehlt' : !neu ? 'entfernen' : 'anders' });
  }
  return diffs;
}

/* ------------------------------------------------------------------ E-Mail vorbereiten */

export function mailEntwurf({ user, eingabe, diffs, gefunden, an = adressaenderungEmail() }) {
  const subject = `Adressänderung: ${user.name}`;
  const lines = [
    'Hallo,',
    '',
    gefunden
      ? 'meine Daten im Adressverzeichnis sind falsch oder unvollständig. Bitte ändert bzw. ergänzt Folgendes:'
      : 'ich habe im Adressverzeichnis keinen Eintrag für mich gefunden. Bitte nehmt mich mit diesen Angaben auf bzw. ordnet sie meinem Eintrag zu:',
    '',
    ...diffs.map((d) => `• ${d.label}: ${d.neu || '(bitte löschen)'}${d.alt ? ` – bisher: ${d.alt}` : ' – bisher: fehlt'}`),
    '',
    'Meine vollständigen Angaben:',
    `Name: ${user.name}`,
    ...ALLE_FELDER.map((f) => `${f.label}: ${String(eingabe?.[f.key] ?? '').trim() || '–'}`),
    `Google-Konto: ${user.email}`,
    '',
    'Viele Grüße',
    user.name,
    '',
    '(vorbereitet in der Mitglieder-App)',
  ];
  const body = lines.join('\n');
  const enc = (s) => encodeURIComponent(s).replace(/%0A/g, '%0D%0A');
  return { an, subject, body, href: an ? `mailto:${an}?subject=${enc(subject)}&body=${enc(body)}` : '' };
}
