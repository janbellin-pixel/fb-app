/**
 * Frankonia-Brunonia – DS-Zeitung automatisch von der Website holen (E55)
 * =======================================================================
 *
 * Wozu?
 *   Die Deutsche Sängerschaft veröffentlicht ihre Zeitung etwa viermal im Jahr als PDF auf
 *   https://deutsche-sängerschaft.de/zeitung. Dieses Skript schaut dort täglich nach und legt neue Ausgaben in
 *   den Drive-Ordner der DS-Zeitung – mit dem Dateinamen, den die Mitglieder-App erwartet („2026-2 DS-Zeitung.pdf“,
 *   Jahr-Nummer aus der Überschrift „131. Jahrgang 2/2026“). Die App zeigt sie dann von selbst an.
 *
 *   Das Skript läuft im Konto eines Admins (am besten dem, dem der Ordner gehört). Es LIEST die Website und den
 *   Ordner und LEGT nur neue Dateien darin AN. Es ändert und löscht nichts – auch keine Datei, die es selbst
 *   angelegt hat. Was schon da ist, erkennt es an Jahr und Nummer im Dateinamen (auch von Hand abgelegte Ausgaben
 *   wie „DS-Zeitung 2-2026.pdf“ oder im Jahresordner „2026/2 DS-Zeitung.pdf“) bzw. am gleichen Namen.
 *   Die Mitglieder-App selbst bleibt dabei nur lesend; die Mitglieder brauchen keine neuen Rechte.
 *
 * Einrichtung (einmalig, ca. 5 Minuten):
 *   1. https://script.google.com → „Neues Projekt“ (eigenes Projekt, nicht zusammen mit anderen Skripten)
 *      → diesen Code einfügen.
 *   2. Projekteinstellungen (Zahnrad) → „Manifestdatei „appsscript.json“ im Editor anzeigen“ anhaken, im Editor
 *      appsscript.json öffnen und den Inhalt von DsZeitung.appsscript.json einfügen (Zeitzone, nötige Rechte:
 *      Drive, Abruf der Website, Auslöser, E-Mail an sich selbst).
 *   3. Unten in EINSTELLUNGEN die ID der privaten Konfiguration eintragen (steht in config.js der App unter
 *      privateConfigId) – daraus liest das Skript den Ordner der DS-Zeitung. Oder direkt die Ordner-ID bei ordnerId.
 *   4. Oben die Funktion „einrichten“ auswählen und ▶ Ausführen klicken, Berechtigungen bestätigen. Das legt den
 *      täglichen Auslöser an und holt gleich die Ausgaben, die im Ordner noch fehlen.
 *   Ab dann läuft „pruefen“ jeden Tag. Bei einer neuen Ausgabe bekommt das Konto des Skripts eine kurze E-Mail
 *   (abschaltbar: mail: false). Ausprobieren: „pruefen“ von Hand ausführen – das Ausführungsprotokoll sagt, was es
 *   gefunden und angelegt hat.
 *
 * Abschalten: Funktion „abschalten“ ausführen (die Dateien bleiben).
 */

const EINSTELLUNGEN = {
  // Seite der Deutschen Sängerschaft mit den Ausgaben (= https://deutsche-sängerschaft.de/zeitung)
  seite: 'https://xn--deutsche-sngerschaft-kzb.de/zeitung',
  // Drive-ID der privaten Konfiguration (config_private.json) – steht in config.js der App unter privateConfigId;
  // daraus kommt der Ordner der DS-Zeitung (dsZeitungOrdnerId)
  konfigurationId: 'HIER_ID_DER_PRIVATEN_KONFIGURATION',
  // alternativ direkt die Drive-ID des Ordners der DS-Zeitung (hat Vorrang)
  ordnerId: '',
  // täglich in dieser Stunde prüfen (0–23)
  stunde: 6,
  // E-Mail an das eigene Konto, wenn eine neue Ausgabe abgelegt wurde
  mail: true,
  // größere Dateien werden nicht übernommen (MB)
  hoechstensMb: 60,
};

/* ======================================================================= Ablauf */

/** Einmalig ausführen: täglichen Auslöser anlegen und gleich prüfen (steht vorn, damit der Editor sie vorauswählt) */
function einrichten() {
  const ordner = ordner_(); // prüft Konfiguration und Zugriff schon jetzt
  abschalten();
  ScriptApp.newTrigger('pruefen').timeBased().everyDays(1).atHour(EINSTELLUNGEN.stunde).create();
  console.log('Täglicher Auslöser angelegt. Ordner der DS-Zeitung: „' + ordner.getName() + '“.');
  pruefen();
}

/** Hauptfunktion – täglich vom Auslöser aufgerufen: neue Ausgaben von der Website in den Ordner legen */
function pruefen() {
  const sperre = LockService.getScriptLock();
  if (!sperre.tryLock(10000)) {
    console.warn('Ein anderer Durchlauf ist noch nicht fertig – übersprungen.');
    return;
  }
  try {
    const ordner = ordner_();
    const ausgaben = ausgabenAusHtml_(seiteLaden_(EINSTELLUNGEN.seite), EINSTELLUNGEN.seite);
    if (!ausgaben.length) {
      console.warn('Keine Ausgaben auf der Seite gefunden – hat sich der Aufbau der Website geändert?');
      return;
    }
    const vorhanden = vorhandeneAusgaben_(ordner);
    const neu = [];
    ausgaben.forEach(function (a) {
      if (schonDa_(a, vorhanden)) return;
      try {
        const datei = herunterladen_(a, ordner);
        if (datei) neu.push(datei.getName());
      } catch (e) {
        console.warn(a.titel + ': ' + e);
      }
    });
    console.log(ausgaben.length + ' Ausgabe(n) auf der Website, ' + neu.length + ' neu abgelegt' + (neu.length ? ': ' + neu.join(', ') : '') + '.');
    if (neu.length && EINSTELLUNGEN.mail) mail_(neu, ordner);
  } finally {
    sperre.releaseLock();
  }
}

/** Auslöser entfernen (die Dateien bleiben) */
function abschalten() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pruefen') ScriptApp.deleteTrigger(t);
  });
}

/* ======================================================================= Website */

function seiteLaden_(url) {
  const antwort = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (Mitglieder-App Frankonia-Brunonia)' } });
  if (antwort.getResponseCode() !== 200) throw new Error('Die Website antwortet mit ' + antwort.getResponseCode() + '.');
  return antwort.getContentText('UTF-8');
}

/**
 * Ausgaben aus der Seite: je Ausgabe ein Link „ajax/getFile.php?zeitung_id=…“ und darunter eine Überschrift wie
 * „131. Jahrgang 2/2026“. Ergebnis in der Reihenfolge der Seite (neueste zuerst):
 * [{ id, url, titel, jahr, nr, name }] – name ist der Dateiname für den Ordner („2026-2 DS-Zeitung.pdf“).
 */
function ausgabenAusHtml_(html, basis) {
  const text = String(html || '');
  const gefunden = {};
  const reihenfolge = [];
  const re = /href=["']([^"']*getFile\.php\?[^"']*zeitung_id=(\d+)[^"']*)["']/gi;
  let m;
  while ((m = re.exec(text))) {
    const id = m[2];
    const href = entschaerfen_(m[1]);
    if (gefunden[id] || /type=picture/i.test(href)) continue;
    const anker = text.indexOf('name="zeitung' + id + '"');
    const ab = anker >= 0 ? anker : m.index;
    const h = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(text.slice(ab, ab + 3000));
    const titel = h ? entschaerfen_(h[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : '';
    const jn = jahrNummer_(titel);
    gefunden[id] = { id: id, url: absolut_(href, basis), titel: titel || ('DS-Zeitung ' + id), jahr: jn.jahr, nr: jn.nr };
    reihenfolge.push(id);
  }
  return reihenfolge.map(function (id) {
    const a = gefunden[id];
    a.name = a.jahr && a.nr ? a.jahr + '-' + a.nr + ' DS-Zeitung.pdf' : ('DS-Zeitung ' + a.titel.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf');
    return a;
  });
}

/**
 * Jahr und Nummer aus Überschrift oder Dateiname: „2/2026“, „2-2026“, „2026-2“, „2026_02“, „Nr. 2 … 2026“,
 * „März 2026“, „Herbst 2026“ (Jahreszeiten wie in der App: Frühjahr 3, Sommer 6, Herbst 9, Winter 12), im Jahresordner
 * auch „3 DS-Zeitung.pdf“. „2025-26“ ist ein Studienjahr, keine Nummer. Fehlt das Jahr, zählt das des Ordners (ordnerJahr).
 */
function jahrNummer_(s, ordnerJahr) {
  const t = String(s || '').replace(/\.pdf$/i, '').replace(/_/g, ' ');
  const JAHR = '((?:19|20)\\d{2})';
  let m = new RegExp('(?:^|\\D)(\\d{1,2})\\s*[/.-]\\s*' + JAHR + '(?!\\d)').exec(t);
  if (m) return { jahr: +m[2], nr: +m[1] };
  const re = new RegExp('(?:^|\\D)' + JAHR + '\\s*[-/. ]\\s*(\\d{1,2})(?!\\d)', 'g');
  while ((m = re.exec(t))) {
    if (+m[2] !== (+m[1] + 1) % 100) return { jahr: +m[1], nr: +m[2] };
  }
  const y = new RegExp('(?:^|\\D)' + JAHR + '(?!\\d)').exec(t);
  const jahr = y ? +y[1] : (Number(ordnerJahr) || null);
  m = /(?:^|[^a-zäöüß])(?:nr|no|nummer|ausgabe|heft)\.?\s*(\d{1,4})(?!\d)/i.exec(t);
  if (m && +m[1] !== jahr) return { jahr: jahr, nr: +m[1] };
  const MONATE = { januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
    frühjahr: 3, frühling: 3, fruehjahr: 3, fruehling: 3, sommer: 6, herbst: 9, winter: 12 };
  m = /(?:^|[^a-zäöüß])(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|frühjahr|frühling|fruehjahr|fruehling|sommer|herbst|winter)(?![a-zäöüß])/i.exec(t);
  if (m && y) return { jahr: jahr, nr: MONATE[m[1].toLowerCase()] }; // Monat bzw. Jahreszeit nur zusammen mit dem Jahr im Namen (wie die App)
  m = /^(\d{1,2})(?!\d)[\s.-]/.exec(t); // „3 DS-Zeitung“ im Jahresordner
  if (m && jahr && !y) return { jahr: jahr, nr: +m[1] };
  return { jahr: jahr, nr: null };
}

/* ======================================================================= Drive */

function ordner_() {
  let id = String(EINSTELLUNGEN.ordnerId || '').trim();
  if (!id) {
    const kid = String(EINSTELLUNGEN.konfigurationId || '').trim();
    if (!kid || kid.indexOf('HIER_') === 0) throw new Error('In EINSTELLUNGEN fehlt die ID der privaten Konfiguration (config.js: privateConfigId) oder die Ordner-ID.');
    const c = JSON.parse(DriveApp.getFileById(kid).getBlob().getDataAsString('UTF-8'));
    id = String(c.dsZeitungOrdnerId || '').trim();
    if (!id) throw new Error('In der privaten Konfiguration ist kein Ordner der DS-Zeitung eingetragen (dsZeitungOrdnerId) – in der App unter Einrichtung verbinden.');
  }
  return DriveApp.getFolderById(id);
}

/** Was im Ordner (und in Jahresordnern darin) schon liegt: nach Jahr-Nummer und nach Namen */
function vorhandeneAusgaben_(ordner) {
  const vorhanden = { nummern: {}, namen: {} };
  const merken = function (dateien, ordnerJahr) {
    while (dateien.hasNext()) {
      const f = dateien.next();
      const name = String(f.getName() || '');
      vorhanden.namen[name.toLowerCase()] = true;
      const jn = jahrNummer_(name, ordnerJahr);
      if (jn.jahr && jn.nr) vorhanden.nummern[jn.jahr + '-' + jn.nr] = true;
    }
  };
  merken(ordner.getFiles(), null);
  const unter = ordner.getFolders();
  while (unter.hasNext()) {
    const u = unter.next();
    const y = /(?:^|\D)((?:19|20)\d{2})(?!\d)/.exec(String(u.getName() || ''));
    merken(u.getFiles(), y ? +y[1] : null);
  }
  return vorhanden;
}

function schonDa_(a, vorhanden) {
  if (vorhanden.namen[a.name.toLowerCase()]) return true;
  return !!(a.jahr && a.nr && vorhanden.nummern[a.jahr + '-' + a.nr]);
}

/** PDF laden und als neue Datei im Ordner ablegen; null, wenn die Antwort kein PDF ist */
function herunterladen_(a, ordner) {
  const antwort = UrlFetchApp.fetch(a.url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (Mitglieder-App Frankonia-Brunonia)' } });
  if (antwort.getResponseCode() !== 200) {
    console.warn(a.titel + ': Download antwortet mit ' + antwort.getResponseCode() + '.');
    return null;
  }
  const blob = antwort.getBlob();
  const bytes = blob.getBytes();
  const pdf = bytes.length > 4 && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70; // „%PDF“
  if (!pdf) {
    console.warn(a.titel + ': Die Antwort ist kein PDF (' + blob.getContentType() + ') – übersprungen.');
    return null;
  }
  if (bytes.length > EINSTELLUNGEN.hoechstensMb * 1e6) {
    console.warn(a.titel + ': ' + Math.round(bytes.length / 1e6) + ' MB sind mehr als erlaubt – übersprungen.');
    return null;
  }
  blob.setName(a.name);
  blob.setContentType('application/pdf');
  return ordner.createFile(blob);
}

function mail_(namen, ordner) {
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Neue DS-Zeitung in der Mitglieder-App',
      'Neu im Ordner „' + ordner.getName() + '“ abgelegt:\n\n' + namen.map(function (n) { return '• ' + n; }).join('\n')
      + '\n\nDie Mitglieder-App zeigt die Ausgabe unter Mehr › DS-Zeitung.\nOrdner: ' + ordner.getUrl() + '\n\n(Diese E-Mail schickt das Skript DsZeitung.gs.)');
  } catch (e) {
    console.warn('E-Mail nicht verschickt: ' + e);
  }
}

/* ======================================================================= Hilfen */

function entschaerfen_(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

/** relative Adresse auf der Seite → absolute (https://…/ajax/getFile.php?zeitung_id=199) */
function absolut_(href, basis) {
  if (/^https?:\/\//i.test(href)) return href;
  const b = /^(https?:\/\/[^/]+)(\/.*)?$/i.exec(String(basis || ''));
  if (!b) return href;
  if (href.charAt(0) === '/') return b[1] + href;
  const pfad = (b[2] || '/').replace(/[^/]*$/, '');
  return b[1] + pfad + href;
}
