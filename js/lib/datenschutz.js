// Datenschutzerklärung und Einwilligungen
// =======================================
// Die Texte sind ein Muster und müssen vom Vorstand geprüft werden. Name, Anschrift und Kontakt
// des Vereins kommen aus config.js (datenschutz.*), ebenso die Fassung: Wird sie erhöht,
// fragt die App alle Mitglieder beim nächsten Öffnen erneut.
//
// Jede Entscheidung wird nachvollziehbar gespeichert:
//   • als kleine Datei im EIGENEN Google Drive des Mitglieds (Inhaber und Zeitstempel setzt Google,
//     das kann niemand fälschen) – lesbar nur für das Mitglied und die Datenschutz-Verantwortlichen,
//   • gesammelt in einer vertraulichen Tabelle, die das Konto der Verantwortlichen führt.
import { config, extraLinks } from '../config.js';
import { html } from '../html.js';

const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/))
  .map((x) => String(x).trim().toLowerCase()).filter(Boolean);

export function dsConfig() {
  const d = config.datenschutz || {};
  const verein = String(d.verein || '').trim();
  return {
    verein: verein || config.appName,
    vereinGesetzt: !!verein,
    anschrift: String(d.anschrift || '').trim(),
    email: String(d.email || '').trim(),
    dachverband: String(d.dachverband || '').trim() || 'Deutsche Sängerschaft (DS)',
    dachverbandKurz: String(d.dachverbandKurz || '').trim() || 'DS',
    fassung: String(d.fassung || '1').trim(),
    stand: String(d.stand || '').trim(),
    empfaenger: list(d.empfaenger),
  };
}

/** Sind die Pflichtangaben (Verantwortlicher, Anschrift, Kontakt) eingetragen? */
export function angabenVollstaendig() {
  const ds = dsConfig();
  return ds.vereinGesetzt && !!ds.anschrift && !!ds.email;
}

/** Wer die Einwilligungen einsehen darf (ohne mich selbst): eingetragene Empfänger, sonst die Admins */
export function consentRecipients(myEmail = '') {
  const ds = dsConfig();
  const base = ds.empfaenger.length ? ds.empfaenger : list(config.admins);
  const me = String(myEmail).toLowerCase();
  return [...new Set(base)].filter((e) => e && e !== me);
}

export function isConsentManager(email) {
  const e = String(email || '').toLowerCase();
  const ds = dsConfig();
  return list(config.admins).includes(e) || ds.empfaenger.includes(e);
}

/* ------------------------------------------------------------------ Einwilligungen */

export function einwilligungen() {
  const ds = dsConfig();
  return [
    {
      id: 'vereinszwecke',
      titel: 'Nutzung zu vereinsüblichen Zwecken',
      text: `Ich willige ein, dass die ${ds.verein} meine personenbezogenen Daten über das für die Mitgliedschaft Notwendige hinaus zu folgenden vereinsüblichen Zwecken verarbeitet:`,
      punkte: [
        'Einladungen, Rundschreiben und Informationen zu Veranstaltungen und zum Verbindungsleben per Post, E-Mail, Kalendereinladung und Chat',
        'Zusendung des Bundesboten (Zeitung der Verbindung)',
        'Glückwünsche zu Geburtstagen und Jubiläen, auch durch Nennung im Bundesboten und auf der Startseite der Mitglieder-App',
        'Aufnahme in das interne Mitglieder- und Adressverzeichnis, das nur Mitgliedern zugänglich ist',
        'Fotos und Berichte von Veranstaltungen, auf denen ich zu sehen oder genannt bin – in der internen Galerie, im Bundesboten und in der Chronik',
        'Kontaktpflege zwischen Aktiven und Alten Herren, z. B. für Studien- und Berufsfragen',
        'Aufbewahrung im Archiv der Verbindung (Chronik, Mitgliederverzeichnisse)',
      ],
      daten: 'Name, Kneipname, Anschrift, Telefon, E-Mail-Adresse, Geburtsdatum, Mitgliedsstatus, Rezeption, Studium/Beruf, Ämter sowie Fotos von Veranstaltungen.',
    },
    {
      id: 'dachverband',
      titel: `Weitergabe an die ${ds.dachverband}`,
      text: `Ich willige ein, dass die ${ds.verein} meine Daten an die ${ds.dachverband} als Dachverband übermittelt. Die ${ds.dachverbandKurz} darf sie für folgende Zwecke nutzen:`,
      punkte: [
        'Kontaktaufnahme mit mir',
        'Versand der Verbandszeitung',
        `Bestimmung des ${ds.dachverbandKurz}-Beitrags`,
        'allgemeine verbands- und vereinsbezogene Zwecke, z. B. das Mitgliederverzeichnis des Verbands und Einladungen zu Verbandsveranstaltungen',
      ],
      daten: 'Name, Vorname, Anschrift, E-Mail-Adresse, Telefonnummer, Geburtsdatum, Mitgliedsstatus (z. B. Aktiver, Inaktiver, Alter Herr), Datum der Rezeption bzw. des Eintritts und die Zugehörigkeit zur Verbindung.',
    },
    {
      // keine Einwilligung im engeren Sinn, sondern die eigene Wahl, ob andere einen in der App sehen (E40)
      id: 'sichtbar',
      titel: 'Sichtbarkeit in der Mitgliederliste der App',
      text: 'Andere Mitglieder dürfen mich in der Mitgliederliste der App sehen und mein Profil aufrufen:',
      punkte: [
        'mit Name, Foto und E-Mail-Adresse aus meinem Google-Konto sowie Kneipname und Status aus dem Adressverzeichnis',
        'mit den Angaben, die ich selbst unter „Mein Profil“ eintrage',
      ],
      daten: 'Name, Profilfoto, E-Mail-Adresse, Kneipname, Status und die Angaben in „Mein Profil“.',
      ja: 'Ja, sichtbar',
      nein: 'Nein, nicht anzeigen',
      hinweis: 'Bei „Nein“ erscheinst du nicht in der Mitgliederliste der App, und dein Profil ist für andere nicht abrufbar. Wo du selbst etwas schreibst oder zusagst (Chat, Forum, Termine), steht weiterhin dein Name. Das Google-Verzeichnis (z. B. Adressvorschläge in Gmail) stellt nur ein Admin ein.',
    },
  ];
}

/** Wortlaut einer Einwilligung als reiner Text (für Nachweis und Prüfsumme) */
export function wortlaut(e) {
  return `${e.titel}\n${e.text}\n${e.punkte.map((p) => `– ${p}`).join('\n')}\nBetroffene Daten: ${e.daten}${e.hinweis ? `\nHinweis: ${e.hinweis}` : ''}`;
}

/** Kurze Prüfsumme (FNV-1a) – zeigt eindeutig, welcher Wortlaut zugestimmt wurde */
export function pruefsumme(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function textPruefsumme() {
  const ds = dsConfig();
  return pruefsumme([`Fassung ${ds.fassung}`, ...einwilligungen().map(wortlaut)].join('\n\n'));
}

/** Muss das Mitglied (erneut) entscheiden? */
export function needsDecision(rec) {
  return !rec || rec.fassung !== dsConfig().fassung
    || typeof rec.vereinszwecke !== 'boolean' || typeof rec.dachverband !== 'boolean' || typeof rec.sichtbar !== 'boolean';
}

/** Neuer Datensatz aus der bisherigen Erklärung und der neuen Entscheidung */
export function buildRecord(prev, { vereinszwecke, dachverband, sichtbar, zeitpunkt: when }, user) {
  const ds = dsConfig();
  // Zeitpunkt der Entscheidung (bei offline getroffener Entscheidung: der ursprüngliche)
  const zeitpunkt = when && !Number.isNaN(Date.parse(when)) ? new Date(when).toISOString() : new Date().toISOString();
  const entry = {
    zeitpunkt,
    fassung: ds.fassung,
    pruefsumme: textPruefsumme(),
    vereinszwecke: !!vereinszwecke,
    dachverband: !!dachverband,
    // fehlt die Wahl (ältere Aufrufe), bleibt sie offen – die App fragt dann erneut
    ...(typeof sichtbar === 'boolean' ? { sichtbar } : {}),
    geraet: geraetInfo(),
  };
  return {
    typ: 'fb-einwilligung',
    version: 1,
    konto: String(user?.email || '').toLowerCase(),
    name: user?.name || '',
    ...entry,
    stand: ds.stand,
    erstmals: prev?.erstmals || prev?.zeitpunkt || zeitpunkt,
    verlauf: [...(Array.isArray(prev?.verlauf) ? prev.verlauf : []), entry].slice(-10),
  };
}

/** Grobe Geräteangabe für den Nachweis, z. B. „iPhone · Safari · installierte App“ */
export function geraetInfo() {
  const ua = navigator.userAgent || '';
  const os = /iPad/.test(ua) ? 'iPad' : /iPhone|iPod/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Gerät';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  return `${os} · ${br}${standalone ? ' · installierte App' : ''}`;
}

/* ------------------------------------------------------------------ Zwischenspeicher auf dem Gerät */

const LOCAL = (email) => `fb.einwilligung.${String(email).toLowerCase()}`;

export function localConsent(email) {
  try { return JSON.parse(localStorage.getItem(LOCAL(email)) || 'null'); } catch { return null; }
}

export function setLocalConsent(email, rec) {
  try {
    if (rec) localStorage.setItem(LOCAL(email), JSON.stringify(rec));
    else localStorage.removeItem(LOCAL(email));
  } catch { /* privater Modus */ }
}

/* ------------------------------------------------------------------ Datenschutzerklärung */

export const ja = (v) => (v === true ? 'Ja' : v === false ? 'Nein' : '');

/** Die vollständige Erklärung (ohne die Einwilligungen selbst) als Abschnitte */
export function erklaerung() {
  const ds = dsConfig();
  const ph = (t) => html`<span class="ds-platzhalter">${t}</span>`;
  const links = extraLinks();
  return [
    {
      titel: 'Wer ist verantwortlich?',
      inhalt: html`<p><strong>${ds.verein}</strong>${ds.anschrift ? html`<br>${ds.anschrift}` : html`<br>${ph('Anschrift wird vom Vorstand ergänzt')}`}</p>
        <p>Kontakt für Datenschutzfragen: ${ds.email ? html`<a href="mailto:${ds.email}">${ds.email}</a>` : 'über den Vorstand bzw. die Admins der App'}</p>`,
    },
    {
      titel: 'Wofür gibt es die App?',
      inhalt: html`<p>Die Mitglieder-App ist ein internes Angebot der ${ds.verein} für ihre Mitglieder. Sie zeigt Termine, Mitglieder, das Adressverzeichnis, den Bundesboten (die Zeitung der Verbindung), die DS-Zeitung (Zeitung der Deutschen Sängerschaft), die Liedermappe, Fotos, Neuigkeiten, das Forum und den Chat. Nutzen können sie nur Mitglieder mit einem Google-Konto der Verbindung.</p>
        ${links.length ? html`<p>Links zu weiteren Angeboten (${links.map((l) => l.titel).join(', ')}) öffnen sich außerhalb der App; dort gelten deren eigene Datenschutzhinweise. Die App gibt dabei keine Daten weiter.</p>` : ''}`,
    },
    {
      titel: 'Welche Daten verarbeitet die App?',
      inhalt: html`<ul>
        <li><strong>Dein Google-Konto:</strong> Name, E-Mail-Adresse und Profilfoto.</li>
        <li><strong>Was du selbst einträgst:</strong> Profilangaben (z. B. Kneipname, Studium/Beruf, aktuelle Tätigkeit, Wohnort, Telefon, „Über mich“ und was du jüngeren Bundesbrüdern anbietest), Zu- und Absagen zu Terminen mit Gästen und Kommentar, Forumsbeiträge, als Admin oder Redaktion auch News mit Bildern, Chat-Nachrichten, deine Entscheidungen zu den Einwilligungen, ob du in der Mitgliederliste der App sichtbar bist und ob du Semesterprogramm und Bundesbote noch per Post bekommen möchtest.</li>
        <li><strong>App-Nutzung und Sichtbarkeit:</strong> Sobald du deine Auswahl speicherst, legt die App in deinem Google Drive eine kleine Datei an, die die Mitglieder lesen können. Sie enthält nur, ob du in der Mitgliederliste sichtbar sein möchtest, und den Zeitpunkt. Daran erkennt die App der anderen, dass du die App nutzt und ob sie dich anzeigen darf.</li>
        <li><strong>Adressänderungen:</strong> Unter „Mein Profil“ vergleicht die App deine Anschrift mit dem Adressverzeichnis. Weicht etwas ab, öffnet sie auf Wunsch dein E-Mail-Programm mit einer vorbereiteten Nachricht an das Postfach für Adressänderungen. Die App selbst speichert oder versendet diese Angaben nicht – erst du schickst die E-Mail ab.</li>
        <li><strong>Push-Mitteilungen (nur wenn du sie einschaltest):</strong> Dein Browser erzeugt für das Gerät eine Push-Adresse mit Schlüsseln. Die App legt sie mit deiner Themenwahl (News, Forum, Termine) und einer groben Geräteangabe (z. B. „iPhone · Safari“) als kleine Datei in deinem Google Drive ab, lesbar nur für das Konto der Verbindung, das die Mitteilungen verschickt. Ein Skript in diesem Konto schaut alle paar Minuten nach Neuem und schickt die Mitteilung verschlüsselt über den Push-Dienst deines Browser-Herstellers (Apple, Google, Mozilla oder Microsoft). Der kann den Inhalt nicht lesen, erfährt aber, dass eine Mitteilung an dein Gerät geht. Ausschalten löscht die Datei.</li>
        <li><strong>Daten der Verbindung:</strong> Termine, Adressverzeichnis (z. B. Anschrift, Telefon, Geburtsdatum, Status), Neuigkeiten, Bundesbote, DS-Zeitung und Fotos von Veranstaltungen.</li>
        <li><strong>Technisch notwendig:</strong> Beim Laden der App-Dateien verarbeitet der Webhoster deine IP-Adresse und Browserangaben kurzzeitig in Server-Protokollen. Auf deinem Gerät speichert die App einen Zugangsschlüssel (eine Stunde gültig), deine Einstellungen (z. B. Schriftgröße, Benachrichtigungen), die Einstellungen der App (damit sie auch offline startet), Entwürfe (Chat-Nachrichten, noch nicht eingetragene Adressänderungen), bei eingeschalteten Benachrichtigungen, welche Nachrichten und News du schon gesehen hast, und einen Zwischenspeicher, damit sie schnell startet und auch offline funktioniert (z. B. gespeicherte Lieder). Mitteilungen der offenen App zeigt dein Gerät selbst an; nur eingeschaltete Push-Mitteilungen laufen über den Push-Dienst deines Browsers (siehe oben).</li>
      </ul>`,
    },
    {
      titel: 'Wo liegen die Daten?',
      inhalt: html`<p>Alle Inhalte liegen im Google Workspace der Verbindung (Google Kalender, Google Drive, Google Tabellen, Google Chat). Google verarbeitet sie im Auftrag der Verbindung. Die App-Dateien selbst liefert GitHub Pages aus. Die App hat keinen eigenen Server, keine Werbung und keine Tracker, und sie lädt keine Inhalte anderer Anbieter nach. Soweit Daten in die USA übermittelt werden, stützen sich Google und GitHub auf das EU-US Data Privacy Framework bzw. auf EU-Standardvertragsklauseln. Eingeschaltete Push-Mitteilungen stellt der Push-Dienst deines Browser-Herstellers zu, zum Teil über Server in den USA; er bekommt nur die verschlüsselte Mitteilung und die Push-Adresse deines Geräts.</p>`,
    },
    {
      titel: 'Wer sieht was?',
      inhalt: html`<ul>
        <li>Dein Profil sehen die Mitglieder, solange du in der Mitgliederliste sichtbar bist. Zu- und Absagen und Forumsbeiträge sehen alle Mitglieder der Verbindung.</li>
        <li>Das Adressverzeichnis ist nur für Mitglieder und nur zum Lesen da.</li>
        <li>Chat-Nachrichten sehen die Mitglieder des jeweiligen Chat-Raums.</li>
        <li>Deine Einwilligungen sehen nur du und die für den Datenschutz Verantwortlichen der Verbindung.</li>
        <li>Ob du Papierpost abbestellt hast, sehen nur du und die Admins der App.</li>
        <li>Deine Push-Anmeldung sieht nur das Konto der Verbindung, das die Mitteilungen verschickt.</li>
      </ul>
      <p>Gemeinsame Daten kann in der App niemand verändern. Ändern kannst du nur deine eigenen Angaben.</p>`,
    },
    {
      titel: 'Auf welcher Grundlage?',
      inhalt: html`<ul>
        <li>Was für die Mitgliedschaft nötig ist – Mitgliederverwaltung, Beiträge, Einladungen zu Conventen und Pflichtveranstaltungen –, beruht auf der Satzung und deiner Mitgliedschaft (Art. 6 Abs. 1 lit. b DSGVO).</li>
        <li>Der Betrieb der App (Bereitstellung, Sicherheit, Austausch unter Mitgliedern) beruht auf dem berechtigten Interesse der Verbindung an einer einfachen internen Organisation (Art. 6 Abs. 1 lit. f DSGVO).</li>
        <li>Darüber hinausgehende Zwecke und die Weitergabe an den Dachverband erfolgen nur mit deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) – siehe „Deine Einwilligungen“.</li>
        <li>Push-Mitteilungen bekommst du nur, wenn du sie auf einem Gerät einschaltest (Art. 6 Abs. 1 lit. a DSGVO); ausschalten kannst du sie dort jederzeit.</li>
      </ul>`,
    },
    {
      titel: 'Wie lange werden Daten gespeichert?',
      inhalt: html`<p>Solange du Mitglied bist, und darüber hinaus nur, soweit gesetzliche Aufbewahrungspflichten bestehen (z. B. für Beitrags- und Spendenunterlagen) oder du in die Aufbewahrung im Archiv eingewilligt hast. Eigene Forumsbeiträge kannst du jederzeit selbst löschen. Nachweise über Einwilligungen und Widerrufe bewahrt die Verbindung auf, solange sie diese zum Nachweis benötigt. „Abmelden“ löscht Zugangsschlüssel, Entwürfe und Zwischenspeicher auf dem Gerät und schaltet dort Push-Mitteilungen aus. Die Push-Anmeldung eines Geräts löscht die App, sobald du Push ausschaltest; nicht mehr erreichbare Geräte beliefert das Skript nicht mehr.</p>`,
    },
    {
      titel: 'Deine Rechte',
      inhalt: html`<p>Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen aufgrund berechtigter Interessen (Art. 21). Einwilligungen kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO); die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt unberührt. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum Beispiel bei der Behörde deines Bundeslandes.</p>`,
    },
  ];
}

/** Hinweise unter den Einwilligungen */
export function einwilligungHinweis() {
  return html`Alle drei Angaben sind <strong>freiwillig und unabhängig voneinander</strong>. Auch ohne Einwilligung und ohne Sichtbarkeit kannst du die App ganz normal nutzen und bleibst vollwertiges Mitglied. Du kannst deine Entscheidung jederzeit unter <strong>Mehr → Datenschutz</strong> ändern oder formlos beim Vorstand widerrufen; der Widerruf gilt für die Zukunft.`;
}

export function speicherHinweis() {
  return html`Deine Entscheidung wird mit Datum und Uhrzeit als kleine Datei in <strong>deinem eigenen Google Drive</strong> gespeichert – lesen können sie nur du und die Datenschutz-Verantwortlichen – und in die vertrauliche Einwilligungsliste der Verbindung übernommen. Ob du sichtbar bist, steht zusätzlich in einer kleinen Datei in deinem Drive, die die Mitglieder lesen können – sonst wüsste ihre App nicht, ob sie dich anzeigen darf.`;
}
