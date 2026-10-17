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

  // Google-Gruppe mit allen Mitgliedern, z. B. 'mitglieder@frankonia-brunonia.de' (empfohlen).
  // Für die Anmeldung nicht nötig – aber Zu- und Absagen gehen nur bei Terminen, zu denen man
  // eingeladen ist, und über die Gruppe sind alle mit einer Einladung erreicht.
  mitgliederGruppe: '',

  // Diese Konten sehen die Einrichtungsseite und Hinweise zur Pflege der Daten
  // (und die Einwilligungen, solange unter datenschutz.empfaenger niemand steht)
  admins: ['jan@frankonia-brunonia.de'],

  // Öffentliche Adresse der App (für die Links in den Kalenderterminen).
  // Leer = Adresse, unter der die App gerade läuft.
  appUrl: 'https://janbellin-pixel.github.io/fb-app/',

  // Google-Kalender der Verbindung (Kalender-ID, endet meist auf @group.calendar.google.com)
  kalenderId: '',

  // Google-Tabellen (IDs aus der Adresszeile: docs.google.com/spreadsheets/d/<ID>/edit)
  // Die App liest sie nur – gepflegt werden sie direkt in Google Tabellen.
  tabellen: {
    adressen: '',       // Adressverzeichnis
    news: '',           // Neuigkeiten (Redaktion pflegt die Tabelle)
    einwilligungen: ''  // Sammelliste der Datenschutz-Einwilligungen (vertraulich, nur Verantwortliche)
  },

  // Tabellenblatt des Adressverzeichnisses; leer = „Adressen“, sonst das erste Blatt
  adressenBlatt: '',

  // Google-Drive-Ordner mit den PDF-Ausgaben der Verbindungszeitung (nur lesen)
  zeitungOrdnerId: '',

  // Google-Drive-Ordner mit den Fotos der Galerie; Unterordner = Alben (nur lesen)
  galerieOrdnerId: '',

  // Google Chat (nur mit Google Workspace verfügbar)
  chat: {
    aktiv: true
  },

  // Forum: Beiträge liegen als eigene Dateien im Drive des jeweiligen Mitglieds
  forum: {
    aktiv: true
  },

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
    fassung: '1',      // erhöhen, wenn sich die Einwilligungstexte ändern – dann werden alle erneut gefragt
    stand: '17.10.2026',
    empfaenger: []     // wer die Einwilligungen einsehen darf (E-Mail-Adressen); leer = die Admins
  },

  // Demo-Modus mit Beispieldaten auf der Anmeldeseite anbieten
  demoErlaubt: true
};
