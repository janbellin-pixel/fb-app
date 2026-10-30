/**
 * Frankonia-Brunonia – Push-Mitteilungen der Mitglieder-App (E50)
 * ================================================================
 *
 * Wozu?
 *   Wer in der App unter Mehr › Einstellungen „Push-Mitteilungen“ einschaltet, bekommt eine Mitteilung
 *   aufs Gerät, sobald es Neues gibt – auch wenn die App zu ist:
 *     • neue News (Tabelle „News“ und in der App geschriebene News der Redaktion),
 *     • neue Themen und Antworten im Forum,
 *     • neue Termine im Verbindungskalender,
 *     • Chat (E51): „Direktnachricht“, „Gruppennachricht“ oder „Bierjunge!“, wenn jemand aus der Mitglieder-App
 *       schreibt – ohne Inhalt und ohne Absender; nur der Bierjunge nennt, wer ihn geschickt hat („Carl Beispiel hat
 *       dir einen angehängt!“, Name laut Google-Konto des Absenders). Die App des Absenders legt dafür in seinem
 *       Drive eine Hinweis-Datei ab (je Empfänger und Art nur der Zeitpunkt der letzten Nachricht, eine Stunde lang),
 *       lesbar nur für dieses Konto. Was direkt in Google Chat geschrieben wird, meldet weiter die App „Google Chat“.
 *
 *   Das Skript LIEST nur: die private Konfiguration der App, den Kalender, die News-Tabelle, Forum- und
 *   News-Dateien, die Push-Anmeldungen und die Chat-Hinweise, die Mitglieder mit diesem Konto geteilt haben. Es
 *   ändert nichts in Drive, im Kalender oder in Tabellen (mit Push.appsscript.json sind ihm nur Lese-Rechte erteilt).
 *   Merken muss es sich nur, was schon gemeldet ist, und den eigenen Schlüssel – in den Skript-Eigenschaften.
 *   Ins Protokoll schreibt es nur Anzahlen, nie wer wem geschrieben hat.
 *   Die Mitteilungen gehen verschlüsselt (RFC 8291) an die Push-Dienste der Browser-Hersteller
 *   (Apple, Google, Mozilla, Microsoft); die können sie nicht lesen.
 *
 * Einrichtung (einmalig, ca. 10 Minuten – im Konto, das die Mitteilungen verschicken soll, z. B. ein Admin):
 *   1. https://script.google.com → „Neues Projekt“ (eigenes Projekt, nicht zusammen mit anderen Skripten)
 *      → diesen Code einfügen.
 *   2. Projekteinstellungen (Zahnrad) → „Manifestdatei „appsscript.json“ im Editor anzeigen“ anhaken, dann
 *      im Editor appsscript.json öffnen und den Inhalt von Push.appsscript.json einfügen (Lese-Rechte,
 *      Kalender-, Drive- und Sheets-Dienst, Zeitzone).
 *   3. Unten in EINSTELLUNGEN die ID der privaten Konfiguration eintragen (steht in config.js der App
 *      unter privateConfigId).
 *   4. Oben die Funktion „einrichten“ auswählen und ▶ Ausführen klicken, Berechtigungen bestätigen.
 *      Im Ausführungsprotokoll stehen danach das Konto und der öffentliche Schlüssel.
 *   5. In der App unter Einrichtung › Optionen › Push-Mitteilungen beides eintragen und speichern.
 *   Danach schaut das Skript alle 10 Minuten nach Neuem und jede Minute nach Chat-Hinweisen. Wer Push einschaltet,
 *   bekommt beim nächsten Durchlauf eine Bestätigung.
 *   Nach einer neuen Fassung dieses Codes „einrichten“ noch einmal ausführen: Das legt fehlende Auslöser an, der
 *   Schlüssel bleibt.
 *
 * Bleiben Mitteilungen aus: „diagnose“ ausführen – schreibt nur ins Protokoll (Auslöser, Geräte je Mitglied mit
 * Themen, Chat-Hinweise der letzten Stunde, Empfänger ohne angemeldetes Gerät), am besten direkt nach einer Testnachricht.
 * Abschalten: Funktion „abschalten“ ausführen. Neuer Schlüssel (falls der alte bekannt geworden ist):
 * „schluesselErneuern“ ausführen und den neuen Schlüssel in der App eintragen – die Geräte melden sich
 * beim nächsten Öffnen der App von selbst neu an.
 */

const EINSTELLUNGEN = {
  // Drive-ID der privaten Konfiguration (config_private.json) – steht in config.js der App unter privateConfigId
  konfigurationId: 'HIER_ID_DER_PRIVATEN_KONFIGURATION',
  // alle wie viele Minuten nach News, Forum und Terminen sehen (1, 5, 10, 15 oder 30)
  minuten: 10,
  // alle wie viele Minuten nach Chat-Hinweisen sehen (1, 5, 10, 15 oder 30) – jede Minute ist eine kleine Drive-Abfrage
  chatMinuten: 1,
};

const THEMEN = ['news', 'forum', 'termine', 'chat', 'chatgruppen'];
// Chat-Hinweise (E51): Arten, wie die App sie in die Hinweis-Datei schreibt, und die Mitteilungen dazu (ohne Absender)
const CHAT_ARTEN = ['direkt', 'gruppe', 'bierjunge'];
const CHAT_TEXTE = {
  direkt: { title: 'Direktnachricht', body: 'Jemand hat dir aus der Mitglieder-App geschrieben.', einzahl: 'Direktnachricht', mehrzahl: 'Direktnachrichten', thema: 'chat' },
  gruppe: { title: 'Gruppennachricht', body: 'Neue Nachricht in einer deiner Gruppen oder Räume.', einzahl: 'Gruppennachricht', mehrzahl: 'Gruppennachrichten', thema: 'chatgruppen' },
  bierjunge: { title: 'Bierjunge!', body: 'Jemand hat dir einen angehängt!', einzahl: 'Bierjunge', mehrzahl: 'Bierjungen', thema: 'chat' },
};
/** Text der Bierjungen-Mitteilung mit dem Absender (Name laut Google-Konto, Wunsch der Verbindung) */
function bierjungeText_(von) {
  return (kurz_(von, 60) || 'Jemand') + ' hat dir einen angehängt!';
}
// Anmeldungen nur bei diesen Push-Diensten annehmen (Apple, Google, Mozilla, Microsoft)
const PUSH_DIENSTE = [/^fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
const UEBERLAPPUNG = 5 * 60000; // Zeitfenster überlappen, Doppeltes fällt über „gesendet“ heraus
const BUENDELN_AB = 4; // ab so vielen Neuigkeiten auf einmal: eine Sammel-Mitteilung
const minuten_ = function () { return Math.floor(Date.now() / 60000); };

/* ======================================================================= Ablauf */

/** Einmalig ausführen: Schlüssel anlegen, Auslöser einrichten, ersten Durchlauf machen (steht vorn, damit der Editor sie vorauswählt) */
function einrichten() {
  const speicher = PropertiesService.getScriptProperties();
  const schluessel = vapidSchluessel_(speicher, true);
  konfiguration_(); // prüft die ID der Konfiguration schon jetzt
  abschalten();
  ScriptApp.newTrigger('pushSenden').timeBased().everyMinutes(EINSTELLUNGEN.minuten).create();
  ScriptApp.newTrigger('chatSenden').timeBased().everyMinutes(EINSTELLUNGEN.chatMinuten).create();
  pushSenden();
  chatSenden();
  console.log('Fertig. In der App unter Einrichtung › Optionen › Push-Mitteilungen eintragen:\n'
    + '  Konto: ' + Session.getEffectiveUser().getEmail() + '\n  Öffentlicher Schlüssel: ' + schluessel.oeffentlich);
}

/** Hauptfunktion – wird vom Auslöser alle paar Minuten aufgerufen */
function pushSenden() {
  const sperre = LockService.getScriptLock();
  if (!sperre.tryLock(10000)) {
    console.warn('Ein anderer Durchlauf ist noch nicht fertig – übersprungen.');
    return;
  }
  try {
    const speicher = PropertiesService.getScriptProperties();
    const schluessel = vapidSchluessel_(speicher, false);
    if (!schluessel) throw new Error('Noch kein Schlüssel – bitte zuerst „einrichten“ ausführen.');
    const cfg = konfiguration_();
    pruefen_(cfg, schluessel);
    const stand = ladeStand_(speicher);
    const jetzt = new Date();
    const erster = !stand.seit;
    const seit = new Date(Math.max(new Date(stand.seit || jetzt).getTime() - UEBERLAPPUNG, jetzt.getTime() - 2 * 86400000));

    // Neues einsammeln – eine Quelle mit Fehler hält die anderen nicht auf
    const neues = [];
    let fehler = false;
    const quelle = function (name, holen) {
      try {
        holen().forEach(function (x) { neues.push(x); });
      } catch (e) {
        fehler = true;
        console.warn(name + ': ' + e);
      }
    };
    quelle('News-Tabelle', function () { return tabellenNews_(cfg, stand, erster); });
    if (!erster) {
      quelle('News', function () { return appNews_(cfg, seit); });
      quelle('Forum', function () { return forum_(cfg, seit); });
      quelle('Termine', function () { return termine_(cfg, seit, jetzt); });
    }
    const frisch = neues.filter(function (x) { return !stand.gesendet[kennung_(x.schluessel)]; });

    // je Gerät: passende Themen, nichts Eigenes; neue Geräte bekommen eine Bestätigung
    const abos = abos_();
    const auftraege = [];
    abos.forEach(function (abo) {
      const h = kennung_(abo.endpoint);
      if (stand.tot[h]) return;
      const nachrichten = [];
      if (!stand.abos[h] && !erster) {
        nachrichten.push({ title: 'Push-Mitteilungen sind eingeschaltet', body: 'Auf diesem Gerät meldet sich die Mitglieder-App ab jetzt, wenn es Neues gibt.', url: '#/einstellungen', tag: 'push-ok' });
      }
      stand.abos[h] = minuten_();
      const passend = frisch.filter(function (x) { return abo.themen.indexOf(x.thema) >= 0 && x.autor !== abo.email; });
      if (passend.length >= BUENDELN_AB) nachrichten.push(sammel_(passend));
      else passend.forEach(function (x) { nachrichten.push({ title: x.titel, body: x.text, url: x.url, tag: x.schluessel }); });
      nachrichten.forEach(function (n) { auftraege.push({ abo: abo, h: h, nachricht: n }); });
    });

    const ergebnis = verschicken_(auftraege, schluessel, stand);
    frisch.forEach(function (x) { stand.gesendet[kennung_(x.schluessel)] = minuten_(); });
    // nach einem Fehler beim Einsammeln das Zeitfenster nicht weiterschieben (beim nächsten Mal erneut versuchen)
    if (!fehler || erster) stand.seit = jetzt.toISOString();
    speichereStand_(speicher, stand);
    console.log(frisch.length + ' Neuigkeit(en), ' + abos.length + ' Gerät(e), ' + ergebnis.ok + ' Mitteilung(en) verschickt'
      + (ergebnis.abgemeldet ? ', ' + ergebnis.abgemeldet + ' Gerät(e) nicht mehr erreichbar' : '')
      + (ergebnis.fehler ? ', ' + ergebnis.fehler + ' Fehler' : '') + (erster ? ' (erster Durchlauf: ab jetzt wird gemeldet)' : '') + '.');
  } finally {
    sperre.releaseLock();
  }
}

/**
 * Chat-Hinweise (E51) – vom eigenen Auslöser jede Minute aufgerufen. Liest die Hinweis-Dateien, die seit dem letzten
 * Durchlauf geändert wurden, und meldet den Empfängern nur „Direktnachricht“, „Gruppennachricht“ oder „Bierjunge!“
 * (mehrere auf einmal als eine Mitteilung). Je Datei merkt es sich nur den zuletzt gemeldeten Zeitpunkt.
 */
function chatSenden() {
  const sperre = LockService.getScriptLock();
  if (!sperre.tryLock(10000)) return; // pushSenden läuft gerade – die nächste Minute kommt bald
  try {
    const speicher = PropertiesService.getScriptProperties();
    const schluessel = vapidSchluessel_(speicher, false);
    if (!schluessel) throw new Error('Noch kein Schlüssel – bitte zuerst „einrichten“ ausführen.');
    const stand = ladeStand_(speicher);
    const jetzt = new Date();
    const erster = !stand.chatSeit;
    const seit = new Date(Math.max(new Date(stand.chatSeit || jetzt).getTime() - UEBERLAPPUNG, jetzt.getTime() - 2 * 3600000));
    // beim ersten Durchlauf nur merken, was schon da ist
    const hinweise = chatHinweise_(seit, stand).filter(function () { return !erster; });
    let ergebnis = { ok: 0, abgemeldet: 0, fehler: 0 };
    let geraete = 0;
    if (hinweise.length) {
      const auftraege = [];
      abos_().forEach(function (abo) {
        const h = kennung_(abo.endpoint);
        if (stand.tot[h]) return;
        const meine = hinweise.filter(function (x) { return x.empfaenger === abo.email && abo.themen.indexOf(x.thema) >= 0; });
        if (!meine.length) return;
        geraete++;
        auftraege.push({ abo: abo, h: h, nachricht: chatMitteilung_(meine) });
      });
      ergebnis = verschicken_(auftraege, schluessel, stand);
    }
    stand.chatSeit = jetzt.toISOString();
    speichereStand_(speicher, stand);
    if (hinweise.length || erster) {
      console.log(hinweise.length + ' Chat-Hinweis(e), ' + geraete + ' Gerät(e), ' + ergebnis.ok + ' Mitteilung(en) verschickt'
        + (ergebnis.abgemeldet ? ', ' + ergebnis.abgemeldet + ' Gerät(e) nicht mehr erreichbar' : '')
        + (ergebnis.fehler ? ', ' + ergebnis.fehler + ' Fehler' : '') + (erster ? ' (erster Durchlauf: ab jetzt wird gemeldet)' : '') + '.');
    }
  } finally {
    sperre.releaseLock();
  }
}

/** Auslöser entfernen (die Geräte bleiben angemeldet, bekommen aber nichts mehr) */
function abschalten() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pushSenden' || t.getHandlerFunction() === 'chatSenden') ScriptApp.deleteTrigger(t);
  });
}

/** Konto und öffentlichen Schlüssel noch einmal ins Protokoll schreiben */
function schluesselZeigen() {
  const schluessel = vapidSchluessel_(PropertiesService.getScriptProperties(), false);
  console.log(schluessel ? 'Konto: ' + Session.getEffectiveUser().getEmail() + '\nÖffentlicher Schlüssel: ' + schluessel.oeffentlich
    : 'Noch kein Schlüssel – „einrichten“ ausführen.');
}

/** Neuen Schlüssel anlegen. Danach den neuen öffentlichen Schlüssel in der App eintragen. */
function schluesselErneuern() {
  const speicher = PropertiesService.getScriptProperties();
  speicher.deleteProperty('vapidPrivat');
  speicher.deleteProperty('vapidOeffentlich');
  speicher.deleteProperty('tot');
  const schluessel = vapidSchluessel_(speicher, true);
  console.log('Neuer öffentlicher Schlüssel (in der App eintragen): ' + schluessel.oeffentlich);
}

/**
 * Zum Nachsehen, wenn Mitteilungen ausbleiben – schreibt nur ins Protokoll, verschickt nichts: Konto und Auslöser,
 * Geräte je Mitglied mit Themen (so, wie das Skript sie sieht), Chat-Hinweise der letzten Stunde und Empfänger, für die
 * kein Gerät angemeldet ist (nur die Empfänger, nicht wer ihnen geschrieben hat). Am besten direkt nach einer
 * Testnachricht aus der App ausführen – die Hinweise verfallen nach einer Stunde.
 */
function diagnose() {
  const speicher = PropertiesService.getScriptProperties();
  const schluessel = vapidSchluessel_(speicher, false);
  const ich = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const zeilen = ['Skript läuft als ' + ich + (schluessel ? '' : ' – noch kein Schlüssel: „einrichten“ ausführen')];
  const ausloeser = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  zeilen.push('Auslöser: ' + (ausloeser.length ? ausloeser.join(', ') : 'keine')
    + (ausloeser.indexOf('chatSenden') < 0 ? ' – chatSenden FEHLT, darum keine Chat-Mitteilungen: „einrichten“ ausführen' : '')
    + (ausloeser.indexOf('pushSenden') < 0 ? ' – pushSenden FEHLT: „einrichten“ ausführen' : ''));
  try {
    const cfg = konfiguration_();
    if (cfg.konto !== ich) zeilen.push('ACHTUNG: In der App steht als Push-Konto „' + (cfg.konto || '–') + '“ – Geräte und Chat-Hinweise sind mit jenem Konto geteilt, nicht mit diesem.');
    if (schluessel && cfg.schluessel !== schluessel.oeffentlich) zeilen.push('ACHTUNG: Der Schlüssel in der App passt nicht zu diesem Skript („schluesselZeigen“ ausführen, in der App eintragen).');
  } catch (e) {
    zeilen.push('Konfiguration nicht lesbar: ' + e);
  }
  const stand = ladeStand_(speicher);
  const abos = abos_();
  const jeMitglied = {};
  abos.forEach(function (a) { (jeMitglied[a.email] = jeMitglied[a.email] || []).push(a); });
  zeilen.push(abos.length + ' Gerät(e) von ' + Object.keys(jeMitglied).length + ' Mitglied(ern)'
    + (abos.length ? ':' : ' – noch niemand hat Push eingeschaltet, oder die Dateien sind nicht mit diesem Konto geteilt.'));
  Object.keys(jeMitglied).sort().forEach(function (email) {
    jeMitglied[email].forEach(function (a) {
      const h = kennung_(a.endpoint);
      zeilen.push('  ' + email + ': ' + (a.themen.length ? a.themen.join(', ') : 'keine Themen') + ' · Datei vom ' + String(a.zeit).slice(0, 16).replace('T', ' ')
        + (stand.tot[h] ? ' · NICHT ERREICHBAR – der Push-Dienst kennt das Gerät nicht mehr; in der App Push aus- und wieder einschalten'
          : stand.abos[h] ? '' : ' · noch nicht beliefert (Bestätigung kommt beim nächsten Durchlauf)'));
    });
  });
  const domain = ich.split('@')[1] || '';
  const grenze = Math.floor(Date.now() / 1000) - 3600;
  const ohneGeraet = {};
  let eintraege = 0;
  const dateien = dateien_("properties has { key='fbTyp' and value='chathinweis' } and trashed = false", ['user']);
  dateien.forEach(function (f) {
    const an = json_(f.description).an;
    Object.keys(an && typeof an === 'object' ? an : {}).forEach(function (k) {
      const arten = an[k] && typeof an[k] === 'object' ? an[k] : {};
      const email = (k.indexOf('@') >= 0 ? k : k + '@' + domain).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !CHAT_ARTEN.some(function (art) { return Number(arten[art]) > grenze; })) return;
      eintraege++;
      if (!jeMitglied[email]) ohneGeraet[email] = true;
    });
  });
  zeilen.push(dateien.length + ' Chat-Hinweis-Datei(en) lesbar, ' + eintraege + ' Empfänger-Eintrag/-Einträge aus der letzten Stunde'
    + (stand.chatSeit ? ', chatSenden lief zuletzt ' + stand.chatSeit.slice(0, 16).replace('T', ' ') + ' (UTC)' : ', chatSenden lief noch nie'));
  const fehlend = Object.keys(ohneGeraet).sort();
  if (fehlend.length) {
    zeilen.push('  Empfänger ohne angemeldetes Gerät (bekommen nichts): ' + fehlend.join(', ')
      + ' – ist dort Push eingeschaltet? Stimmt die Adresse mit dem Google-Konto überein (kein Alias)?');
  }
  console.log(zeilen.join('\n'));
  return zeilen;
}

/* ======================================================================= Konfiguration und Stand */

function konfiguration_() {
  const id = String(EINSTELLUNGEN.konfigurationId || '').trim();
  if (!id || id.indexOf('HIER_') === 0) throw new Error('In EINSTELLUNGEN fehlt die ID der privaten Konfiguration (config.js: privateConfigId).');
  const c = JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
  const liste = function (v) {
    return (Array.isArray(v) ? v : []).map(function (e) { return String(e || '').trim().toLowerCase(); }).filter(Boolean);
  };
  return {
    kalenderId: String(c.kalenderId || '').trim(),
    newsTabelle: String((c.tabellen && c.tabellen.news) || '').trim(),
    // News aus der App zählen nur von Admins und Redaktion (wie in der App)
    autoren: liste(c.admins).concat(liste(c.redaktion)),
    forum: !(c.forum && c.forum.aktiv === false),
    konto: String((c.push && c.push.konto) || '').trim().toLowerCase(),
    schluessel: String((c.push && c.push.schluessel) || '').trim(),
  };
}

/** Hinweise ins Protokoll, wenn App und Skript nicht zusammenpassen */
function pruefen_(cfg, schluessel) {
  const ich = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (cfg.konto && cfg.konto !== ich) console.warn('In der App steht als Konto „' + cfg.konto + '“, das Skript läuft aber als „' + ich + '“ – die Geräte sind mit dem anderen Konto geteilt.');
  if (cfg.schluessel && cfg.schluessel !== schluessel.oeffentlich) console.warn('Der Schlüssel in der App passt nicht zu diesem Skript – „schluesselZeigen“ ausführen und in der App eintragen.');
  if (!cfg.konto || !cfg.schluessel) console.warn('In der App sind Konto oder Schlüssel für Push noch nicht eingetragen.');
}

function ladeStand_(speicher) {
  const p = speicher.getProperties();
  const json = function (k, leer) {
    try { return p[k] ? JSON.parse(p[k]) : leer; } catch (e) { return leer; }
  };
  return { seit: p.seit || '', gesendet: json('gesendet', {}), news: json('newsBekannt', []), abos: json('abos', {}), tot: json('tot', {}),
    chatSeit: p.chatSeit || '', chat: json('chat', {}) };
}

function speichereStand_(speicher, stand) {
  const jetzt = minuten_();
  // nur Junges behalten (Zeitstempel in Minuten, bei `sekunden` in Sekunden) – jede Eigenschaft darf höchstens 9 KB groß sein
  const jungeEintraege = function (obj, tage, max, sekunden) {
    const paare = Object.keys(obj).map(function (k) { return [k, obj[k]]; })
      .filter(function (e) { return (sekunden ? jetzt * 60 - e[1] < tage * 86400 : jetzt - e[1] < tage * 1440); })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, max);
    const raus = {};
    paare.forEach(function (e) { raus[e[0]] = e[1]; });
    return raus;
  };
  speicher.setProperties({
    seit: stand.seit,
    gesendet: JSON.stringify(jungeEintraege(stand.gesendet, 3, 250)),
    newsBekannt: JSON.stringify(stand.news.slice(-400)),
    abos: JSON.stringify(jungeEintraege(stand.abos, 60, 300)),
    tot: JSON.stringify(jungeEintraege(stand.tot, 30, 200)),
    chatSeit: stand.chatSeit,
    // je Hinweis-Datei der zuletzt gemeldete Zeitpunkt (Sekunden); ältere Einträge löscht die App ohnehin nach einer Stunde
    chat: JSON.stringify(jungeEintraege(stand.chat, 1, 300, true)),
  });
}

function vapidSchluessel_(speicher, anlegen) {
  let privat = speicher.getProperty('vapidPrivat');
  if (!privat && anlegen) {
    const d = neuerPrivatschluessel_();
    privat = b64u_(bytes_(d, 32));
    speicher.setProperties({ vapidPrivat: privat, vapidOeffentlich: b64u_(punktBytes_(mul_(d, G_))) });
  }
  if (!privat) return null;
  return { privat: zahl_(vonB64u_(privat)), oeffentlich: speicher.getProperty('vapidOeffentlich') };
}

/* ======================================================================= Neuigkeiten */

/** Zeilen der Tabelle „News“: neu ist, was noch nicht bekannt war (beim ersten Durchlauf: alles bekannt) */
function tabellenNews_(cfg, stand, erster) {
  if (!cfg.newsTabelle) return [];
  // über den Sheets-Dienst wie in der App – SpreadsheetApp ginge nur mit Schreibrechten für alle Tabellen
  const werte = Sheets.Spreadsheets.Values.get(cfg.newsTabelle, "'News'!A1:AZ", { valueRenderOption: 'FORMATTED_VALUE' }).values || [];
  const kopf = (werte[0] || []).map(norm_);
  const spalte = function (label, key) { return kopf.indexOf(norm_(label)) >= 0 ? kopf.indexOf(norm_(label)) : kopf.indexOf(norm_(key)); };
  const s = { id: spalte('ID', 'id'), datum: spalte('Datum', 'datum'), titel: spalte('Titel', 'titel'), text: spalte('Text', 'text'),
    autor: spalte('Autor (E-Mail)', 'autorEmail'), geloescht: spalte('Gelöscht', 'geloescht') };
  if (s.titel < 0) return [];
  const bekannt = {};
  stand.news.forEach(function (k) { bekannt[k] = true; });
  const raus = [];
  for (let r = 1; r < werte.length; r++) {
    const z = werte[r];
    const zelle = function (i) { return i >= 0 ? String(z[i] || '').trim() : ''; };
    const titel = zelle(s.titel);
    if (!titel || /^(ja|x|true|wahr|1|yes)$/i.test(zelle(s.geloescht))) continue;
    // Kennung wie in der App (ID oder Zeilennummer) für den Link; zum Wiedererkennen zählt der Inhalt
    const id = zelle(s.id) || 'zeile-' + (r + 1);
    const k = kennung_(zelle(s.id) ? 'id:' + zelle(s.id) : 'titel:' + titel + '|' + zelle(s.datum));
    if (bekannt[k]) continue;
    bekannt[k] = true;
    stand.news.push(k);
    if (erster || alt_(zelle(s.datum), 7)) continue;
    raus.push({ schluessel: 'news:' + id, thema: 'news', titel: 'News: ' + kurz_(titel, 90), text: kurz_(zelle(s.text), 140) || 'Neu in der Mitglieder-App',
      url: '#/news/' + encodeURIComponent(id), autor: zelle(s.autor).toLowerCase() });
  }
  return raus;
}

/** In der App geschriebene News (eigene Dateien der Redaktion) */
function appNews_(cfg, seit) {
  return appDateien_('news', seit).filter(function (f) { return cfg.autoren.indexOf(inhaber_(f).email) >= 0; }).map(function (f) {
    const d = json_(f.description);
    if (!String(d.titel || '').trim()) return null;
    return { schluessel: 'news:' + f.id, thema: 'news', titel: 'News: ' + kurz_(d.titel, 90), text: kurz_(d.text, 140) || 'Neu in der Mitglieder-App',
      url: '#/news/' + encodeURIComponent(f.id), autor: inhaber_(f).email };
  }).filter(Boolean);
}

/** Neue Themen und Antworten im Forum */
function forum_(cfg, seit) {
  if (!cfg.forum) return [];
  const titelVon = {};
  return appDateien_('forum', seit).map(function (f) {
    const p = f.properties || {};
    const d = json_(f.description);
    const wer = inhaber_(f);
    const text = kurz_((wer.name ? wer.name + ': ' : '') + String(d.text || ''), 140);
    if (p.fbRolle === 'thema') {
      return { schluessel: 'forum:' + f.id, thema: 'forum', titel: 'Forum: ' + kurz_(d.titel || 'Neues Thema', 90), text: text, url: '#/forum/' + encodeURIComponent(f.id), autor: wer.email };
    }
    if (p.fbRolle === 'antwort' && p.fbThema) {
      if (!(p.fbThema in titelVon)) {
        try { titelVon[p.fbThema] = json_(Drive.Files.get(p.fbThema, { fields: 'description' }).description).titel || ''; } catch (e) { titelVon[p.fbThema] = ''; }
      }
      return { schluessel: 'forum:' + f.id, thema: 'forum', titel: titelVon[p.fbThema] ? 'Antwort: ' + kurz_(titelVon[p.fbThema], 90) : 'Neue Antwort im Forum', text: text,
        url: '#/forum/' + encodeURIComponent(p.fbThema), autor: wer.email };
    }
    return null;
  }).filter(Boolean);
}

/** Neu angelegte Termine im Verbindungskalender (keine privaten, keine vergangenen) */
function termine_(cfg, seit, jetzt) {
  if (!cfg.kalenderId) return [];
  const raus = [];
  let seite;
  do {
    const a = Calendar.Events.list(cfg.kalenderId, { updatedMin: seit.toISOString(), showDeleted: false, singleEvents: false, maxResults: 250, pageToken: seite });
    (a.items || []).forEach(function (t) {
      if (t.status === 'cancelled' || t.visibility === 'private' || t.visibility === 'confidential') return;
      if (!t.created || new Date(t.created).getTime() < seit.getTime() || !t.start) return;
      const ende = (t.end && (t.end.dateTime || t.end.date)) || t.start.dateTime || t.start.date;
      if (!t.recurrence && new Date(ende).getTime() < jetzt.getTime()) return;
      raus.push({ schluessel: 'termin:' + t.id, thema: 'termine', titel: 'Neuer Termin: ' + kurz_(t.summary || 'Termin', 80),
        text: wann_(t) + (t.location ? ' · ' + kurz_(t.location, 60) : ''), url: '#/termin/' + encodeURIComponent(t.id),
        autor: String((t.creator && t.creator.email) || '').toLowerCase() });
    });
    seite = a.nextPageToken;
  } while (seite);
  return raus;
}

/** Dateien der App mit fbTyp (öffentliche Eigenschaft), angelegt seit … – eigene, geteilte und in der Domain */
function appDateien_(typ, seit) {
  const q = "properties has { key='fbTyp' and value='" + typ + "' } and createdTime > '" + seit.toISOString() + "' and trashed = false";
  return dateien_(q, ['user', 'domain']);
}

function dateien_(q, bereiche) {
  const felder = 'nextPageToken, files(id, description, createdTime, modifiedTime, owners(emailAddress, displayName), properties)';
  const gefunden = {};
  bereiche.forEach(function (corpora) {
    let seite;
    try {
      do {
        const a = Drive.Files.list({ q: q, corpora: corpora, fields: felder, pageSize: 100, pageToken: seite });
        (a.files || []).forEach(function (f) { gefunden[f.id] = f; });
        seite = a.nextPageToken;
      } while (seite);
    } catch (e) {
      if (corpora === 'user') throw e;
      console.warn('Suche in der Domain nicht möglich: ' + e);
    }
  });
  return Object.keys(gefunden).map(function (k) { return gefunden[k]; });
}

/** Push-Anmeldungen, die Mitglieder mit diesem Konto geteilt haben – je Gerät die neueste */
function abos_() {
  const neueste = {};
  dateien_("properties has { key='fbTyp' and value='push' } and trashed = false", ['user']).forEach(function (f) {
    const wer = inhaber_(f); // Mitglied = Inhaber laut Google, nicht der Dateiinhalt
    const d = json_(f.description);
    if (!wer.email || !gueltigesAbo_(d)) return;
    const abo = { email: wer.email, endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, zeit: f.modifiedTime || '',
      themen: (Array.isArray(d.themen) ? d.themen : []).filter(function (t) { return THEMEN.indexOf(t) >= 0; }) };
    const alt = neueste[abo.endpoint];
    if (!alt || abo.zeit > alt.zeit) neueste[abo.endpoint] = abo;
  });
  return Object.keys(neueste).map(function (k) { return neueste[k]; });
}

function gueltigesAbo_(d) {
  const m = /^https:\/\/([^/:?#]+)\//.exec(String(d.endpoint || ''));
  if (!m || String(d.endpoint).length > 1000 || !PUSH_DIENSTE.some(function (re) { return re.test(m[1].toLowerCase()); })) return false;
  try {
    return vonB64u_(d.p256dh).length === 65 && vonB64u_(d.auth).length === 16;
  } catch (e) {
    return false;
  }
}

/**
 * Chat-Hinweise (E51) aus den Hinweis-Dateien, die seit „seit“ geändert wurden – je Datei (= ein Absender) zählt, was
 * jünger ist als der zuletzt gemeldete Zeitpunkt dieser Datei (stand.chat). Die App schreibt die Zeit innerhalb einer
 * Datei immer aufsteigend, darum reicht dieser eine Zeitpunkt. Ergebnis: { empfaenger, art, thema, von } –
 * „von“ (Name des Absenders laut Google) nur beim Bierjungen, sonst leer.
 */
function chatHinweise_(seit, stand) {
  const domain = String(Session.getEffectiveUser().getEmail() || '').toLowerCase().split('@')[1] || '';
  const raus = [];
  const q = "properties has { key='fbTyp' and value='chathinweis' } and modifiedTime > '" + seit.toISOString() + "' and trashed = false";
  dateien_(q, ['user']).forEach(function (f) {
    const absender = inhaber_(f); // Absender = Inhaber laut Google (nicht der Dateiinhalt)
    const wer = absender.email;
    const d = json_(f.description);
    const an = d.an && typeof d.an === 'object' ? d.an : {};
    const marke = Number(stand.chat[f.id]) || 0;
    let neu = marke;
    Object.keys(an).forEach(function (k) {
      // Adressen der eigenen Domain stehen nur mit dem Teil vor dem @ in der Datei
      const email = (k.indexOf('@') >= 0 ? k : k + '@' + domain).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === wer) return;
      const arten = an[k] && typeof an[k] === 'object' ? an[k] : {};
      CHAT_ARTEN.forEach(function (art) {
        const t = Number(arten[art]);
        if (!(t > marke)) return;
        raus.push({ empfaenger: email, art: art, thema: CHAT_TEXTE[art].thema, von: art === 'bierjunge' ? absender.name : '' });
        if (t > neu) neu = t;
      });
    });
    if (neu > marke) stand.chat[f.id] = neu;
  });
  return raus;
}

/** Eine Mitteilung für alle Chat-Hinweise eines Geräts in diesem Durchlauf – ohne Inhalt; Absender nur beim Bierjungen */
function chatMitteilung_(liste) {
  if (liste.length === 1) {
    const t = CHAT_TEXTE[liste[0].art];
    const body = liste[0].art === 'bierjunge' ? bierjungeText_(liste[0].von) : t.body;
    return { title: t.title, body: body, url: '#/chat', tag: 'chat:' + liste[0].art, renotify: true };
  }
  const teile = CHAT_ARTEN.map(function (art) {
    const n = liste.filter(function (x) { return x.art === art; }).length;
    return n ? n + ' ' + (n === 1 ? CHAT_TEXTE[art].einzahl : CHAT_TEXTE[art].mehrzahl) : '';
  }).filter(Boolean);
  return { title: 'Neues im Chat', body: teile.join(', '), url: '#/chat', tag: 'chat:sammel', renotify: true };
}

function sammel_(liste) {
  const zahl = function (thema) { return liste.filter(function (x) { return x.thema === thema; }).length; };
  const teile = [];
  if (zahl('news')) teile.push(zahl('news') + ' News');
  if (zahl('forum')) teile.push(zahl('forum') + (zahl('forum') === 1 ? ' Forumsbeitrag' : ' Forumsbeiträge'));
  if (zahl('termine')) teile.push(zahl('termine') + (zahl('termine') === 1 ? ' neuer Termin' : ' neue Termine'));
  return { title: 'Neues in der Mitglieder-App', body: teile.join(', '), url: '#/', tag: 'sammel' };
}

/* ======================================================================= Verschicken */

function verschicken_(auftraege, schluessel, stand) {
  const ergebnis = { ok: 0, abgemeldet: 0, fehler: 0 };
  const kontakt = 'mailto:' + Session.getEffectiveUser().getEmail();
  const vapid = {};
  for (let i = 0; i < auftraege.length; i += 25) {
    const teil = [];
    auftraege.slice(i, i + 25).forEach(function (a) {
      try {
        const herkunft = /^https:\/\/[^/]+/.exec(a.abo.endpoint)[0];
        if (!vapid[herkunft]) vapid[herkunft] = vapidKopf_(herkunft, schluessel, kontakt);
        const koerper = verschluesseln_(a.abo, utf8_(JSON.stringify(a.nachricht)));
        teil.push({ a: a, anfrage: {
          url: a.abo.endpoint, method: 'post', muteHttpExceptions: true, contentType: 'application/octet-stream',
          headers: { Authorization: vapid[herkunft], 'Content-Encoding': 'aes128gcm', TTL: '86400', Urgency: 'normal' },
          payload: koerper.map(function (b) { return b > 127 ? b - 256 : b; }),
        } });
      } catch (e) {
        ergebnis.fehler++;
        console.warn('Mitteilung für ' + a.abo.email + ' nicht vorbereitet: ' + e);
      }
    });
    if (!teil.length) continue;
    let antworten;
    try {
      antworten = UrlFetchApp.fetchAll(teil.map(function (t) { return t.anfrage; }));
    } catch (e) {
      // ein Netzfehler bricht fetchAll ganz ab – dann einzeln, damit die übrigen trotzdem ankommen
      antworten = teil.map(function (t) {
        try { return UrlFetchApp.fetch(t.anfrage.url, t.anfrage); } catch (e2) { return null; }
      });
    }
    antworten.forEach(function (r, j) {
      const a = teil[j].a;
      if (!r) {
        ergebnis.fehler++;
        console.warn('Push-Dienst für ' + a.abo.email + ' nicht erreichbar.');
        return;
      }
      const code = r.getResponseCode();
      if (code >= 200 && code < 300) ergebnis.ok++;
      else if (code === 404 || code === 410) {
        if (!stand.tot[a.h]) ergebnis.abgemeldet++;
        stand.tot[a.h] = minuten_();
      } else {
        ergebnis.fehler++;
        console.warn('Push-Dienst antwortet ' + code + ' für ' + a.abo.email + ': ' + kurz_(r.getContentText(), 200));
      }
    });
  }
  return ergebnis;
}

/** Authorization-Kopf nach RFC 8292 (VAPID): signiertes JWT für den Push-Dienst, eine Stunde gültig */
function vapidKopf_(herkunft, schluessel, kontakt) {
  const kopf = b64u_(utf8_(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const inhalt = b64u_(utf8_(JSON.stringify({ aud: herkunft, exp: Math.floor(Date.now() / 1000) + 3600, sub: kontakt })));
  return 'vapid t=' + kopf + '.' + inhalt + '.' + b64u_(signieren_(schluessel.privat, utf8_(kopf + '.' + inhalt))) + ', k=' + schluessel.oeffentlich;
}

/**
 * Nachricht für ein Gerät verschlüsseln (RFC 8291 mit aes128gcm nach RFC 8188, ein Datensatz).
 * fest = { privat, salt } nur für die Prüfwerte aus dem RFC (tests/push-test.html).
 */
function verschluesseln_(abo, klartext, fest) {
  const uaOeffentlich = vonB64u_(abo.p256dh);
  const auth = vonB64u_(abo.auth);
  const geraet = punkt_(uaOeffentlich);
  const d = fest ? fest.privat : neuerPrivatschluessel_();
  const asOeffentlich = punktBytes_(mul_(d, G_));
  const geheim = bytes_(mul_(d, geraet).x, 32);
  const ikm = hkdf_(auth, geheim, utf8_('WebPush: info').concat([0], uaOeffentlich, asOeffentlich), 32);
  const salt = fest ? fest.salt : zufall_(16);
  const cek = hkdf_(salt, ikm, utf8_('Content-Encoding: aes128gcm').concat([0]), 16);
  const nonce = hkdf_(salt, ikm, utf8_('Content-Encoding: nonce').concat([0]), 12);
  if (klartext.length > 3800) throw new Error('Nachricht zu lang');
  // Kopf: salt | Datensatzgröße 4096 | Länge der Kennung (65) | öffentlicher Schlüssel; dann Text + Trenner 2
  return salt.concat([0, 0, 16, 0, 65], asOeffentlich, gcm_(cek, nonce, klartext.concat([2])));
}

/* ======================================================================= Hilfen */

function inhaber_(f) {
  const o = (f.owners && f.owners[0]) || {};
  return { email: String(o.emailAddress || '').toLowerCase(), name: String(o.displayName || '') };
}

function json_(s) {
  try {
    const v = JSON.parse(s || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
}

function kurz_(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trim() + '…' : t;
}

function norm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
}

/** Datum aus der Tabelle (TT.MM.JJJJ oder JJJJ-MM-TT) älter als n Tage? Ohne Datum: nein */
function alt_(text, tage) {
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  let d = m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  m = d ? null : /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
  return !!d && Date.now() - d.getTime() > tage * 86400000;
}

const WOCHENTAGE_ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONATE_ = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

/** „Fr, 6. Nov., 20:00 Uhr“ bzw. „Fr, 6. Nov.“ (ganztägig) */
function wann_(t) {
  if (t.start.date) {
    const p = t.start.date.split('-').map(Number);
    const tag = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return WOCHENTAGE_[tag.getUTCDay()] + ', ' + p[2] + '. ' + MONATE_[p[1] - 1];
  }
  const teile = Utilities.formatDate(new Date(t.start.dateTime), Session.getScriptTimeZone() || 'Europe/Berlin', 'u|d|M|HH:mm').split('|');
  return WOCHENTAGE_[Number(teile[0]) % 7] + ', ' + teile[1] + '. ' + MONATE_[Number(teile[2]) - 1] + ', ' + teile[3] + ' Uhr';
}

/** Kurze, feste Kennung eines Textes (für die Skript-Eigenschaften) */
function kennung_(s) {
  return b64u_(sha256_(utf8_(s)).slice(0, 8));
}

/** Zufall aus Utilities.getUuid() (Java SecureRandom), durch SHA-256 gemischt */
function zufall_(laenge) {
  zufall_.zaehler = (zufall_.zaehler || 0) + 1;
  const quelle = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(), Date.now(), Math.random(), zufall_.zaehler];
  return sha256_(utf8_(quelle.join('|'))).slice(0, laenge);
}

function utf8_(s) {
  const raus = [];
  for (const zeichen of String(s)) {
    const c = zeichen.codePointAt(0);
    if (c < 0x80) raus.push(c);
    else if (c < 0x800) raus.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) raus.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else raus.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return raus;
}

const B64_ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Base64url ohne „=“ (RFC 4648 §5) */
function b64u_(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += B64_[(n >> 18) & 63] + B64_[(n >> 12) & 63] + (i + 1 < bytes.length ? B64_[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64_[n & 63] : '');
  }
  return s;
}

function vonB64u_(s) {
  const text = String(s || '').replace(/[=\s]/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const raus = [];
  let puffer = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i++) {
    const v = B64_.indexOf(text[i]);
    if (v < 0) throw new Error('Ungültiges Base64');
    puffer = ((puffer << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      raus.push((puffer >> bits) & 255);
    }
  }
  return raus;
}

/* ======================================================================= Kryptografie (ohne Bibliothek) */
// Apps Script bringt weder ECDH noch AES-GCM mit. Darum hier kurz und nach den Standards:
// SHA-256 (FIPS 180-4), HMAC/HKDF (RFC 2104/5869), AES-128 (FIPS 197) mit GCM (SP 800-38D),
// P-256 (FIPS 186-4) mit ECDSA nach RFC 6979. Geprüft mit den Prüfwerten der RFCs und gegen
// die Web-Crypto-Schnittstelle der Browser: tests/push-test.html.

const SHA_K_ = (function () {
  const k = [];
  const h = [];
  for (let n = 2; k.length < 64; n++) {
    let prim = true;
    for (let t = 2; t * t <= n; t++) if (n % t === 0) prim = false;
    if (!prim) continue;
    if (h.length < 8) h.push(Math.floor((Math.sqrt(n) % 1) * 4294967296) | 0);
    k.push(Math.floor((Math.cbrt(n) % 1) * 4294967296) | 0);
  }
  k.start = h;
  return k;
})();

function sha256_(bytes) {
  const h = SHA_K_.start.slice();
  const m = bytes.slice();
  const bits = bytes.length * 8;
  m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  m.push(0, 0, 0, Math.floor(bits / 4294967296) & 255, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);
  const w = new Array(64);
  const ror = function (x, n) { return (x >>> n) | (x << (32 - n)); };
  for (let i = 0; i < m.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = (m[i + 4 * t] << 24) | (m[i + 4 * t + 1] << 16) | (m[i + 4 * t + 2] << 8) | m[i + 4 * t + 3];
    for (let t = 16; t < 64; t++) {
      const s0 = ror(w[t - 15], 7) ^ ror(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = ror(w[t - 2], 17) ^ ror(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K_[t] + w[t]) | 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  const raus = [];
  h.forEach(function (x) { raus.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); });
  return raus;
}

function hmac_(schluessel, daten) {
  const k = schluessel.length > 64 ? sha256_(schluessel) : schluessel.slice();
  while (k.length < 64) k.push(0);
  return sha256_(k.map(function (b) { return b ^ 0x5c; }).concat(sha256_(k.map(function (b) { return b ^ 0x36; }).concat(daten))));
}

/** HKDF mit SHA-256 (RFC 5869), höchstens 32 Byte */
function hkdf_(salt, ikm, info, laenge) {
  return hmac_(hmac_(salt, ikm), info.concat([1])).slice(0, laenge);
}

const SBOX_ = (function () {
  const s = new Array(256);
  const rotl = function (x, n) { return ((x << n) | (x >>> (8 - n))) & 255; };
  let p = 1;
  let q = 1;
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 255; // p · 3
    q = (q ^ (q << 1)) & 255; q = (q ^ (q << 2)) & 255; q = (q ^ (q << 4)) & 255; // q / 3
    if (q & 0x80) q ^= 0x09;
    s[p] = q ^ rotl(q, 1) ^ rotl(q, 2) ^ rotl(q, 3) ^ rotl(q, 4) ^ 0x63;
  } while (p !== 1);
  s[0] = 0x63;
  return s;
})();

function xtime_(b) {
  return ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 255;
}

/** AES-128: Rundenschlüssel (176 Byte) */
function aesSchluessel_(key) {
  const w = key.slice();
  let rcon = 1;
  for (let i = 16; i < 176; i += 4) {
    let t = w.slice(i - 4, i);
    if (i % 16 === 0) {
      t = [SBOX_[t[1]] ^ rcon, SBOX_[t[2]], SBOX_[t[3]], SBOX_[t[0]]];
      rcon = xtime_(rcon);
    }
    for (let j = 0; j < 4; j++) w.push(w[i - 16 + j] ^ t[j]);
  }
  return w;
}

/** AES-128: einen Block (16 Byte) verschlüsseln */
function aesBlock_(w, block) {
  let s = block.map(function (b, i) { return b ^ w[i]; });
  for (let r = 1; r <= 10; r++) {
    const t = new Array(16);
    for (let c = 0; c < 4; c++) for (let z = 0; z < 4; z++) t[c * 4 + z] = SBOX_[s[((c + z) % 4) * 4 + z]];
    if (r < 10) {
      for (let c = 0; c < 16; c += 4) {
        const a0 = t[c], a1 = t[c + 1], a2 = t[c + 2], a3 = t[c + 3];
        const x = a0 ^ a1 ^ a2 ^ a3;
        t[c] = a0 ^ x ^ xtime_(a0 ^ a1);
        t[c + 1] = a1 ^ x ^ xtime_(a1 ^ a2);
        t[c + 2] = a2 ^ x ^ xtime_(a2 ^ a3);
        t[c + 3] = a3 ^ x ^ xtime_(a3 ^ a0);
      }
    }
    s = t.map(function (b, i) { return b ^ w[r * 16 + i]; });
  }
  return s;
}

/** AES-128-GCM ohne Zusatzdaten: Geheimtext und 16 Byte Prüfsumme */
function gcm_(key, iv, klartext) {
  const w = aesSchluessel_(key);
  const h = zahl_(aesBlock_(w, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const j0 = iv.concat([0, 0, 0, 1]);
  const geheim = [];
  for (let i = 0; i < klartext.length; i += 16) {
    const z = 2 + i / 16; // Zähler: J0 + 1, + 2, …
    const strom = aesBlock_(w, iv.concat([(z >>> 24) & 255, (z >>> 16) & 255, (z >>> 8) & 255, z & 255]));
    for (let j = 0; j < 16 && i + j < klartext.length; j++) geheim.push(klartext[i + j] ^ strom[j]);
  }
  let y = BigInt(0);
  for (let i = 0; i < geheim.length; i += 16) {
    const block = geheim.slice(i, i + 16);
    while (block.length < 16) block.push(0);
    y = gmul_(y ^ zahl_(block), h);
  }
  y = gmul_(y ^ BigInt(geheim.length * 8), h); // Längen-Block: 0 Bit Zusatzdaten | Länge des Geheimtexts in Bit
  const maske = aesBlock_(w, j0);
  return geheim.concat(bytes_(y, 16).map(function (b, i) { return b ^ maske[i]; }));
}

const GCM_R_ = BigInt('0xe1') << BigInt(120);

/** Multiplikation in GF(2^128) mit der Bit-Reihenfolge von GCM */
function gmul_(x, y) {
  let z = BigInt(0);
  let v = y;
  const eins = BigInt(1);
  for (let i = BigInt(127); i >= BigInt(0); i--) {
    if ((x >> i) & eins) z ^= v;
    v = (v & eins) ? (v >> eins) ^ GCM_R_ : v >> eins;
  }
  return z;
}

function zahl_(bytes) {
  let n = BigInt(0);
  for (let i = 0; i < bytes.length; i++) n = (n << BigInt(8)) | BigInt(bytes[i]);
  return n;
}

function bytes_(n, laenge) {
  const raus = new Array(laenge);
  let x = n;
  for (let i = laenge - 1; i >= 0; i--) {
    raus[i] = Number(x & BigInt(255));
    x >>= BigInt(8);
  }
  return raus;
}

// P-256 (secp256r1): y² = x³ − 3x + b über GF(p)
const P_ = (BigInt(1) << BigInt(256)) - (BigInt(1) << BigInt(224)) + (BigInt(1) << BigInt(192)) + (BigInt(1) << BigInt(96)) - BigInt(1);
const N_ = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const B_ = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');
const G_ = { x: BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'), y: BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5') };

function mod_(a, m) {
  const r = a % m;
  return r < BigInt(0) ? r + m : r;
}

/** Inverses modulo m (erweiterter euklidischer Algorithmus) */
function inv_(a, m) {
  let r0 = mod_(a, m), r1 = m, s0 = BigInt(1), s1 = BigInt(0);
  while (r1 !== BigInt(0)) {
    const q = r0 / r1;
    const r2 = r0 - q * r1; r0 = r1; r1 = r2;
    const s2 = s0 - q * s1; s0 = s1; s1 = s2;
  }
  return mod_(s0, m);
}

/** Punktaddition (null = unendlich ferner Punkt) */
function add_(p1, p2) {
  if (!p1) return p2;
  if (!p2) return p1;
  let l;
  if (p1.x === p2.x) {
    if (mod_(p1.y + p2.y, P_) === BigInt(0)) return null;
    l = mod_((BigInt(3) * p1.x * p1.x - BigInt(3)) * inv_(BigInt(2) * p1.y, P_), P_);
  } else {
    l = mod_((p2.y - p1.y) * inv_(p2.x - p1.x, P_), P_);
  }
  const x = mod_(l * l - p1.x - p2.x, P_);
  return { x: x, y: mod_(l * (p1.x - x) - p1.y, P_) };
}

/** k · Punkt (Verdoppeln und Addieren) */
function mul_(k, punkt) {
  let r = null;
  for (let i = BigInt(k.toString(2).length - 1); i >= BigInt(0); i--) {
    r = add_(r, r);
    if ((k >> i) & BigInt(1)) r = add_(r, punkt);
  }
  return r;
}

/** Öffentlicher Schlüssel 0x04 | X | Y → Punkt (nur, wenn er wirklich auf der Kurve liegt) */
function punkt_(bytes) {
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('Kein gültiger P-256-Schlüssel');
  const x = zahl_(bytes.slice(1, 33));
  const y = zahl_(bytes.slice(33));
  if (x >= P_ || y >= P_ || mod_(y * y - (x * x * x - BigInt(3) * x + B_), P_) !== BigInt(0)) throw new Error('Punkt liegt nicht auf P-256');
  return { x: x, y: y };
}

function punktBytes_(p) {
  return [4].concat(bytes_(p.x, 32), bytes_(p.y, 32));
}

function neuerPrivatschluessel_() {
  let d;
  do d = zahl_(zufall_(32)); while (d === BigInt(0) || d >= N_);
  return d;
}

/** ECDSA mit P-256 und SHA-256; k deterministisch nach RFC 6979. Ergebnis r | s (je 32 Byte, wie in JWT) */
function signieren_(d, nachricht) {
  const h1 = sha256_(nachricht);
  const e = zahl_(h1);
  const x = bytes_(d, 32);
  const hm = bytes_(mod_(e, N_), 32);
  let v = new Array(32).fill(1);
  let k = new Array(32).fill(0);
  k = hmac_(k, v.concat([0], x, hm)); v = hmac_(k, v);
  k = hmac_(k, v.concat([1], x, hm)); v = hmac_(k, v);
  for (;;) {
    v = hmac_(k, v);
    const kz = zahl_(v);
    if (kz > BigInt(0) && kz < N_) {
      const r = mod_(mul_(kz, G_).x, N_);
      const s = mod_(inv_(kz, N_) * (e + r * d), N_);
      if (r !== BigInt(0) && s !== BigInt(0)) return bytes_(r, 32).concat(bytes_(s, 32));
    }
    k = hmac_(k, v.concat([0])); v = hmac_(k, v);
  }
}
