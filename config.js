/*
 * Konfiguration der Mitglieder-App
 * ================================
 * Diese Datei wird am einfachsten über die App selbst erzeugt:
 *   App öffnen → „Einrichtung“ → Schritte durchgehen → „config.js herunterladen“
 * und dann diese Datei damit ersetzen.
 *
 * Alle IDs sind keine Geheimnisse – der Zugriff auf die Daten wird
 * ausschließlich über die Google-Freigaben gesteuert.
 */
window.FB_CONFIG = {
  // Name der Verbindung (erscheint in der App)
  appName: 'Frankonia-Brunonia',

  // OAuth-Client-ID aus der Google Cloud Console (Typ „Webanwendung“)
  googleClientId: '',

  // Domain des Google Workspace, z. B. 'frankonia-brunonia.de'.
  // Leer lassen für den Test mit privaten Google-Konten.
  workspaceDomain: '',

  // Google-Gruppe mit allen Mitgliedern, z. B. 'mitglieder@frankonia-brunonia.de'.
  // Wird zu allen Terminen eingeladen und bekommt Lesezugriff auf die Daten.
  mitgliederGruppe: '',

  // Diese Konten sehen die Einrichtungsseite und Hinweise zur Pflege der Daten
  admins: [],

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
    verein: '',        // Verantwortlicher, z. B. 'Sängerschaft Frankonia-Brunonia e. V.'
    anschrift: '',     // Straße, PLZ Ort
    email: '',         // Kontakt für Datenschutzfragen
    dachverband: 'Deutsche Sängerschaft (DS)',
    dachverbandKurz: 'DS',
    fassung: '1',      // erhöhen, wenn sich die Einwilligungstexte ändern – dann werden alle erneut gefragt
    stand: '17.10.2026',
    empfaenger: []     // wer die Einwilligungen einsehen darf (E-Mail-Adressen); leer = die Admins
  },

  // Demo-Modus mit Beispieldaten auf der Anmeldeseite anbieten
  demoErlaubt: true
};
