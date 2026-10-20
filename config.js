/*
 * Konfiguration der Mitglieder-App
 * ================================
 * Diese Datei wird am einfachsten über die App selbst erzeugt:
 *   App öffnen → „Einrichtung“ → Schritte durchgehen → „config.js herunterladen“
 * und dann diese Datei damit ersetzen.
 *
 * Alle IDs sind keine Geheimnisse – der Zugriff auf die Daten wird
 * ausschließlich über die Google-Freigaben gesteuert. Diese Datei ist öffentlich
 * lesbar; darum keine Datei auf „Jeder mit dem Link“ freigeben (die Prüfung in
 * der Einrichtung warnt davor).
 */
window.FB_CONFIG = {
  // Name der Verbindung (erscheint in der App)
  appName: 'Frankonia-Brunonia',

  // OAuth-Client-ID aus der Google Cloud Console (Typ „Webanwendung“, Zielgruppe „Intern“)
  googleClientId: '390762816801-tsv0ge4745jeep64shi54vtk9u80ipaf.apps.googleusercontent.com',

  // Domain des Google Workspace: nur Konten dieser Domain können sich anmelden.
  workspaceDomain: 'frankonia-brunonia.de',

  // Google-Gruppe mit allen Mitgliedern, z. B. 'mitglieder@frankonia-brunonia.de' (optional).
  // Zu- und absagen kann jeder auch ohne Einladung (über die App). Wird die Gruppe zu Terminen
  // eingeladen, stehen sie zusätzlich in den Kalendern der Mitglieder und die Antworten im Google Kalender.
  mitgliederGruppe: '',

  // Diese Konten sehen die Einrichtungsseite und Hinweise zur Pflege der Daten
  // (und die Einwilligungen, solange unter datenschutz.empfaenger niemand steht)
  admins: ['jan@frankonia-brunonia.de'],

  // Wer außer den Admins News in der App schreiben darf (E-Mail-Adressen)
  redaktion: [],

  // Öffentliche Adresse der App (für die Links in den Kalenderterminen).
  // Leer = Adresse, unter der die App gerade läuft.
  appUrl: 'https://janbellin-pixel.github.io/fb-app/',

  // Google-Kalender der Verbindung (Kalender-ID, endet meist auf @group.calendar.google.com)
  kalenderId: 'c_92482b914db0f6dc0ed5fab395081064d14dd8c2d096e10d7d1f8760ee3632e1@group.calendar.google.com',

  // Google-Tabellen (IDs aus der Adresszeile: docs.google.com/spreadsheets/d/<ID>/edit)
  // Die App liest sie nur – gepflegt werden sie direkt in Google Tabellen.
  tabellen: {
    adressen: '1PUfw03rWme3QXVzluFMWSa-yUrHjfUtO43jbBne8_Sg', // Mitgliederliste
    news: '',           // Neuigkeiten (Redaktion pflegt die Tabelle)
    einwilligungen: ''  // Sammelliste der Datenschutz-Einwilligungen (vertraulich, nur Verantwortliche)
  },

  // Tabellenblatt des Adressverzeichnisses; leer = „Adressen“, sonst das erste Blatt
  adressenBlatt: '',

  // Google-Drive-Ordner mit den PDF-Ausgaben des Bundesboten (nur lesen)
  zeitungOrdnerId: '1sZ9aHz2aiOPqNiyEVxRbJOGgPQe8TpJt',

  // Google-Drive-Ordner mit den Noten der Liedermappe: PDFs oder Bilder, Unterordner = Rubriken (nur lesen)
  liedermappeOrdnerId: '1Alvm6W_XaqwQysdX-VhOAPL2C1BgPfvl',

  // Google-Drive-Ordner mit den PDF-Ausgaben der DS-Zeitung (Deutsche Sängerschaft, nur lesen); leer = ausgeblendet
  dsZeitungOrdnerId: '1MJZo2LXHPBjMK74fFiXuQP61upBGwu8H',

  // Google-Drive-Ordner mit den Fotos der Galerie; Unterordner = Alben (nur lesen)
  galerieOrdnerId: '1KHHPf5PG2uLJ8YosmDb85HlUVsNkCVPl',

  // Google Chat (nur mit Google Workspace verfügbar).
  // newsRaum: vorgeschlagener Raum für Ankündigungen neuer News, z. B. 'spaces/AAAA…' (leer = zuletzt gewählter Raum)
  chat: {
    aktiv: true,
    newsRaum: ''
  },

  // Forum: Beiträge liegen als eigene Dateien im Drive des jeweiligen Mitglieds
  forum: {
    aktiv: true
  },

  // Weitere Links im Schnellzugriff (Startseite) und unter „Mehr“ – nur https-Adressen;
  // symbol optional (Name eines App-Symbols, Standard 'globe')
  links: [
    { titel: 'Wiki', url: 'https://frbr-bookstack.cubiga.to/login' }
  ],

  // Mitglieder dürfen eigene Profilangaben (Kneipname, Tätigkeit, Angebot für Jüngere …) ergänzen
  profilBearbeiten: true,

  // Postfach für Adressänderungen: Weichen die Angaben in „Mein Profil“ vom Adressverzeichnis ab,
  // bereitet die App eine E-Mail an diese Adresse vor (Umlaute sind in E-Mail-Adressen nicht möglich).
  adressaenderung: 'adressaenderung@frankonia-brunonia.de',

  // Datenschutzerklärung und Einwilligungen (beim ersten Öffnen und unter Mehr → Datenschutz)
  datenschutz: {
    verein: 'S! Frankonia-Brunonia zu Braunschweig', // Verantwortlicher
    anschrift: 'Pockelsstr. 8, 38106 Braunschweig',
    email: 'info@frankonia-brunonia.de', // Kontakt für Datenschutzfragen
    dachverband: 'Deutsche Sängerschaft (DS)',
    dachverbandKurz: 'DS',
    fassung: '2',      // erhöhen, wenn sich die Einwilligungstexte ändern – dann werden alle erneut gefragt
    stand: '18.10.2026',
    empfaenger: []     // wer die Einwilligungen einsehen darf (E-Mail-Adressen); leer = die Admins
  },

  // Demo-Modus mit Beispieldaten auf der Anmeldeseite anbieten
  demoErlaubt: true
};
