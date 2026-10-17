/**
 * Frankonia-Brunonia – Automatik für den Verbindungskalender
 * ===========================================================
 *
 * Wozu?
 *   Termine, die im Google Kalender der Verbindung angelegt werden,
 *   bekommen automatisch
 *     1. den Link zur Mitglieder-App in die Beschreibung („Zu-/Absage …“) und
 *     2. die Mitglieder-Gruppe als Gast – damit alle den Termin im eigenen
 *        Kalender sehen und über Google zu- oder absagen können.
 *
 *   Die Mitglieder-App selbst ändert keine Termine. Dieses Skript ist ein
 *   freiwilliges Werkzeug für den Kalender-Inhaber und läuft nur in dessen Konto.
 *
 * Einrichtung (einmalig, ca. 5 Minuten, als Kalender-Inhaber):
 *   1. https://script.google.com → „Neues Projekt“ → diesen Code einfügen.
 *   2. Links unter „Dienste“ (+) den „Google Calendar API“-Dienst hinzufügen
 *      (Kennung: Calendar).
 *   3. Unten die drei Werte in EINSTELLUNGEN anpassen.
 *   4. Oben die Funktion „einrichten“ auswählen und ▶ Ausführen klicken,
 *      Berechtigungen bestätigen. Danach läuft alles stündlich von selbst.
 *
 * Abschalten: Funktion „abschalten“ ausführen.
 */

const EINSTELLUNGEN = {
  // Kalender-ID des Verbindungskalenders (steht in der config.js der App)
  kalenderId: 'HIER_KALENDER_ID@group.calendar.google.com',
  // Adresse der App (mit / am Ende)
  appUrl: 'https://NAME.github.io/fb-app/',
  // Google-Gruppe aller Mitglieder (leer lassen, wenn niemand eingeladen werden soll)
  mitgliederGruppe: 'mitglieder@frankonia-brunonia.de',
  // Wie viele Tage im Voraus geprüft werden
  tageVoraus: 365,
  // E-Mails an Mitglieder schicken, wenn sie neu eingeladen werden? ('none' = nein, 'all' = ja)
  benachrichtigen: 'none',
};

/** Hauptfunktion – wird stündlich vom Auslöser aufgerufen */
function termineVerknuepfen() {
  const s = EINSTELLUNGEN;
  const jetzt = new Date();
  const bis = new Date(jetzt.getTime() + s.tageVoraus * 86400000);
  let seite;
  const erledigt = {};
  let geaendert = 0;
  do {
    const antwort = Calendar.Events.list(s.kalenderId, {
      timeMin: jetzt.toISOString(),
      timeMax: bis.toISOString(),
      singleEvents: true,
      maxResults: 250,
      pageToken: seite,
    });
    (antwort.items || []).forEach(function (termin) {
      if (termin.status === 'cancelled') return;
      // Serientermine nur einmal (am Serien-Haupttermin) bearbeiten
      const id = termin.recurringEventId || termin.id;
      if (erledigt[id]) return;
      erledigt[id] = true;

      const aenderung = {};
      const beschreibung = termin.description || '';
      if (beschreibung.indexOf('#/termin/') === -1) {
        aenderung.description = (beschreibung + '\n\n—\nZu-/Absage und wer kommt – in der Mitglieder-App:\n' + s.appUrl + '#/termin/' + id).trim();
      }
      const gaeste = termin.attendees || [];
      const gruppeDabei = gaeste.some(function (g) { return (g.email || '').toLowerCase() === s.mitgliederGruppe.toLowerCase(); });
      if (s.mitgliederGruppe && !gruppeDabei) {
        aenderung.attendees = gaeste.concat([{ email: s.mitgliederGruppe }]);
        aenderung.guestsCanSeeOtherGuests = true;
      }
      if (Object.keys(aenderung).length === 0) return;
      try {
        Calendar.Events.patch(aenderung, s.kalenderId, id, { sendUpdates: s.benachrichtigen });
        geaendert++;
      } catch (e) {
        console.warn('Termin „' + termin.summary + '“ nicht geändert: ' + e);
      }
    });
    seite = antwort.nextPageToken;
  } while (seite);
  console.log(geaendert + ' Termin(e) aktualisiert.');
}

/** Einmalig ausführen: richtet den stündlichen Auslöser ein */
function einrichten() {
  abschalten();
  ScriptApp.newTrigger('termineVerknuepfen').timeBased().everyHours(1).create();
  termineVerknuepfen();
  console.log('Fertig: Die Termine werden ab jetzt stündlich geprüft.');
}

/** Stündlichen Auslöser entfernen */
function abschalten() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'termineVerknuepfen') ScriptApp.deleteTrigger(t);
  });
}
