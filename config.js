/*
 * Öffentliche Konfiguration der Mitglieder-App (E43)
 * ==================================================
 * Diese Datei ist öffentlich (GitHub-Repository, GitHub Pages). Hier steht nur, was vor der Anmeldung
 * gebraucht wird. Alle weiteren Einstellungen – Admins, Kalender, Tabellen, Ordner, Gruppen, Links … – liegen
 * in der privaten Konfiguration „config_private.json“ in Google Drive, lesbar nur für Konten der Domain.
 * Die App lädt und prüft sie nach der Anmeldung.
 *
 * Ändern: App → Einrichtung → „Einstellungen in Google Drive speichern“ (gilt dann für alle).
 * Diese Datei nur ersetzen („config.js herunterladen“), wenn sich etwas von dem hier Stehenden ändert.
 * Weitere Optionen: docs/EINRICHTUNG.md
 */
window.FB_CONFIG = {
  // Name der Verbindung (erscheint auf der Anmeldeseite)
  appName: 'Frankonia-Brunonia',

  // OAuth-Client-ID aus der Google Cloud Console (Typ „Webanwendung“, Zielgruppe „Intern“)
  googleClientId: '390762816801-tsv0ge4745jeep64shi54vtk9u80ipaf.apps.googleusercontent.com',

  // Domain des Google Workspace: nur Konten dieser Domain können sich anmelden.
  workspaceDomain: 'frankonia-brunonia.de',

  // Drive-ID der privaten Konfiguration (config_private.json) – nur für angemeldete Konten der Domain lesbar
  privateConfigId: '1XGv2G3HeNnXCOliCIhsarQKXLD0lx0Ic',

  // Demo-Modus mit Beispieldaten auf der Anmeldeseite anbieten
  demoErlaubt: true,

  // Datenschutzerklärung – auch ohne Anmeldung lesbar, darum hier.
  // Wer die Einwilligungen einsehen darf (empfaenger), steht in der privaten Konfiguration.
  datenschutz: {
    verein: 'S! Frankonia-Brunonia zu Braunschweig', // Verantwortlicher
    anschrift: 'Pockelsstr. 8, 38106 Braunschweig',
    email: 'info@frankonia-brunonia.de', // Kontakt für Datenschutzfragen
    dachverband: 'Deutsche Sängerschaft (DS)',
    dachverbandKurz: 'DS',
    fassung: '3',      // erhöhen, wenn sich die Einwilligungstexte ändern – dann werden alle erneut gefragt
    stand: '20.10.2026'
  }
};
