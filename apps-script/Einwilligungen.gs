/**
 * Frankonia-Brunonia – Einwilligungen automatisch einsammeln (optional)
 * =====================================================================
 *
 * Wozu?
 *   Jedes Mitglied speichert seine Datenschutz-Entscheidung in der App als kleine
 *   Datei im EIGENEN Google Drive. Lesen dürfen sie nur die Datenschutz-Verantwortlichen.
 *   Die App überträgt alle Entscheidungen in die vertrauliche Einwilligungsliste,
 *   sobald ein Verantwortlicher die App öffnet. Dieses Skript macht das zusätzlich
 *   stündlich – auch wenn niemand die App öffnet.
 *
 *   Es LIEST nur die freigegebenen Einwilligungs-Dateien und SCHREIBT nur in die
 *   eigene Einwilligungsliste (Blätter „Stand“ und „Verlauf“). Sonst ändert es nichts.
 *
 * Einrichtung (einmalig, ca. 5 Minuten – im Konto, dem die Einwilligungsliste gehört):
 *   1. https://script.google.com → „Neues Projekt“ → diesen Code einfügen.
 *   2. Unten in EINSTELLUNGEN die ID der Einwilligungsliste eintragen. Sie steht in
 *      config.js unter tabellen.einwilligungen bzw. in der Adresse der Tabelle:
 *      docs.google.com/spreadsheets/d/<ID>/edit
 *   3. Oben die Funktion „einrichten“ auswählen und ▶ Ausführen klicken,
 *      Berechtigungen bestätigen. Danach läuft alles stündlich von selbst.
 *
 * Abschalten: Funktion „abschalten“ ausführen.
 */

const EINSTELLUNGEN = {
  // ID der vertraulichen Einwilligungsliste (von der App angelegt)
  tabellenId: 'HIER_ID_DER_EINWILLIGUNGSLISTE',
};

/** Hauptfunktion – wird stündlich vom Auslöser aufgerufen */
function einwilligungenEinsammeln() {
  const tabelle = SpreadsheetApp.openById(EINSTELLUNGEN.tabellenId);
  const stand = tabelle.getSheetByName('Stand');
  const verlauf = tabelle.getSheetByName('Verlauf');
  if (!stand || !verlauf) throw new Error('Die Blätter „Stand“ und „Verlauf“ fehlen – ist das die Einwilligungsliste der App?');

  // je Mitglied die zuletzt geänderte Datei (Mitglied = Inhaber laut Google, nicht fälschbar)
  const neueste = {};
  const dateien = DriveApp.searchFiles("properties has { key='fbTyp' and value='einwilligung' and visibility='PUBLIC' } and trashed = false");
  while (dateien.hasNext()) {
    const datei = dateien.next();
    const inhaber = datei.getOwner();
    const email = inhaber ? String(inhaber.getEmail() || '').toLowerCase() : '';
    if (!email) continue;
    if (!neueste[email] || datei.getLastUpdated() > neueste[email].getLastUpdated()) neueste[email] = datei;
  }

  const jetzt = zeit(new Date());
  const zeilen = {};
  // Spalten wie in der App (seit Fassung 3 mit „Sichtbar in der App“): Stand 11, Verlauf 12
  if (stand.getLastRow() > 1) {
    stand.getRange(2, 1, stand.getLastRow() - 1, 11).getValues().forEach(function (r) {
      if (r[0]) zeilen[String(r[0]).toLowerCase()] = r;
    });
  }
  const gesehen = {};
  if (verlauf.getLastRow() > 1) {
    verlauf.getRange(2, 1, verlauf.getLastRow() - 1, 11).getValues().forEach(function (r) {
      gesehen[r[8] + '|' + r[10]] = true;
    });
  }
  const neu = [];

  Object.keys(neueste).forEach(function (email) {
    const datei = neueste[email];
    let d = {};
    try { d = JSON.parse(datei.getDescription() || '{}'); } catch (e) { d = {}; }
    const name = datei.getOwner().getName() || d.name || email;
    const hinweis = (d.konto && String(d.konto).toLowerCase() !== email) ? 'Achtung: Konto in der Datei weicht vom Inhaber ab – Inhaber gilt' : '';
    zeilen[email] = [email, name, ja(d.vereinszwecke), ja(d.dachverband), ja(d.sichtbar), d.fassung || '', zeit(d.zeitpunkt),
      zeit(d.erstmals || datei.getDateCreated()), zeit(datei.getLastUpdated()), datei.getUrl(), hinweis];
    const eintraege = (d.verlauf && d.verlauf.length) ? d.verlauf : [d];
    eintraege.forEach(function (v) {
      const stempel = String(v.zeitpunkt || '');
      const schluessel = datei.getId() + '|' + stempel;
      if (!stempel || gesehen[schluessel]) return;
      gesehen[schluessel] = true;
      neu.push([zeit(stempel), email, name, ja(v.vereinszwecke), ja(v.dachverband), v.fassung || '', v.pruefsumme || '',
        v.geraet || '', datei.getId(), jetzt, stempel, ja(v.sichtbar)]);
    });
  });

  // Stand: alle Zeilen (auch „keine Rückmeldung“ aus der App) nach Namen sortiert neu schreiben
  const liste = Object.keys(zeilen).map(function (k) { return zeilen[k]; })
    .sort(function (a, b) { return String(a[1]).localeCompare(String(b[1]), 'de'); });
  const bisher = Math.max(stand.getLastRow() - 1, 0);
  if (bisher) stand.getRange(2, 1, bisher, 11).clearContent();
  if (liste.length) {
    const bereich = stand.getRange(2, 1, liste.length, 11);
    bereich.setNumberFormat('@');
    bereich.setValues(liste);
  }

  // Verlauf: nur neue Erklärungen anhängen
  neu.sort(function (a, b) { return a[10] < b[10] ? -1 : a[10] > b[10] ? 1 : 0; });
  if (neu.length) {
    const bereich = verlauf.getRange(verlauf.getLastRow() + 1, 1, neu.length, 12);
    bereich.setNumberFormat('@');
    bereich.setValues(neu);
  }
  console.log(Object.keys(neueste).length + ' Rückmeldung(en), ' + neu.length + ' neue(r) Eintrag/Einträge im Verlauf.');
}

function ja(v) {
  return v === true ? 'Ja' : v === false ? 'Nein' : '';
}

function zeit(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

/** Einmalig ausführen: richtet den stündlichen Auslöser ein */
function einrichten() {
  abschalten();
  // stündlich; für kürzere Abstände z. B. .everyMinutes(15) statt .everyHours(1)
  ScriptApp.newTrigger('einwilligungenEinsammeln').timeBased().everyHours(1).create();
  einwilligungenEinsammeln();
  console.log('Fertig: Die Einwilligungen werden ab jetzt stündlich eingesammelt.');
}

/** Stündlichen Auslöser entfernen */
function abschalten() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'einwilligungenEinsammeln') ScriptApp.deleteTrigger(t);
  });
}
