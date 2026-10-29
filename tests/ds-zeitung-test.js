// Testlauf: DS-Zeitung-Skript (apps-script/DsZeitung.gs, E55) mit nachgebauter Website und nachgebauten
// Google-Diensten (DriveApp, UrlFetchApp, ScriptApp, MailApp …). Nichts geht ins Netz.
const out = document.getElementById('out');
const results = [];
let current = '';
function section(name) {
  current = name;
  out.insertAdjacentHTML('beforeend', `<h2>${name}</h2>`);
}
function check(cond, label, detail = '') {
  results.push({ ok: !!cond, label: `${current}: ${label}`, detail });
  out.insertAdjacentHTML('beforeend', `<div class="${cond ? 'ok' : 'fail'}">${cond ? '✓' : '✗'} ${label}${detail && !cond ? ` – <code>${String(detail).replace(/</g, '&lt;')}</code>` : ''}</div>`);
}
async function step(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    check(false, label, e.stack || e.message || e);
    return undefined;
  }
}

if (!['127.0.0.1', 'localhost'].includes(location.hostname)) {
  document.body.textContent = 'Diese Testseite läuft nur lokal.';
  throw new Error('Nur lokal');
}

/* ------------------------------------------------------------ nachgebaute Welt */

const KONTO = 'admin@beispiel.de';
const SEITE = 'https://xn--deutsche-sngerschaft-kzb.de/zeitung';
const welt = { html: '', antworten: {}, abrufe: [], ausloeser: [], mails: [], ordner: null, konfiguration: { dsZeitungOrdnerId: 'ordner-ds' }, warnungen: [], protokoll: [] };
const PDF = (text) => [37, 80, 68, 70, 45, 49, 46, 52, ...[...new TextEncoder().encode(`\n${text}`)]]; // „%PDF-1.4“ + Inhalt

/** Seite wie bei der Deutschen Sängerschaft: Bild-Link, Anker, Download-Link, Überschrift, eingebettetes PDF */
const ausgabeHtml = (id, titel, text) => `
  <table class="zeitung tdPadding5 invisible overview lightContainer">
    <tr>
      <td rowspan="3">
        <a href="ajax/getFile.php?zeitung_id=${id}" target="_blank">
          <img src="ajax/getFile.php?zeitung_id=${id}&type=picture" style="max-height: 200px" />
        </a>
      </td>
      <td style="height: 40px; text-align: left">
        <a name="zeitung${id}"></a>
        <a href="ajax/getFile.php?zeitung_id=${id}&amp;type=picture"><img src="graphX/icons/pdf.png" alt="Bild" /></a>
        <a href="ajax/getFile.php?zeitung_id=${id}" target="_blank" style="float: right;">
          <img src="graphX/icons/pdf.png" alt="Download" title="Download" style="max-height: 35px; margin-bottom: -10px;" />
        </a>
        <h2>
          ${titel}                    </h2>
      </td>
    </tr>
    <tr><td colspan="99">${text}</td></tr>
    <tr><td colspan="99"><object origData='https://xn--deutsche-sngerschaft-kzb.de/ajax/getFile.php?zeitung_id=${id}&disposition=inline' type='application/pdf' width='100%' height='1024'></object></td></tr>
  </table>`;
const seiteHtml = (ausgaben) => `<!DOCTYPE html><html lang="de"><head><title>Deutsche Sängerschaft (Weimarer CC)</title>
  <base href="https://xn--deutsche-sngerschaft-kzb.de/"><meta charset="utf-8"></head><body>
  <div id="content"><h1>Die DS-Zeitung</h1><a href="zeitung#zeitung199">Aktuell</a>${ausgaben.map((a) => ausgabeHtml(...a)).join('')}</div></body></html>`;

class Datei {
  constructor(name, bytes, typ) { this.name = name; this.bytes = bytes; this.typ = typ; this.beschreibung = ''; this.geaendert = []; }
  getName() { return this.name; }
  setName(n) { this.geaendert.push(`setName:${n}`); this.name = n; return this; }
  setDescription(d) { this.geaendert.push('setDescription'); this.beschreibung = d; return this; }
  setTrashed() { this.geaendert.push('setTrashed'); return this; }
  getSize() { return this.bytes.length; }
  getBlob() { return { getDataAsString: () => new TextDecoder().decode(new Uint8Array(this.bytes)) }; }
}
class Ordner {
  constructor(name, id) { this.name = name; this.id = id; this.dateien = []; this.unterordner = []; this.angelegt = []; }
  getName() { return this.name; }
  getUrl() { return `https://drive.google.com/drive/folders/${this.id}`; }
  getFiles() { return iterator(this.dateien); }
  getFolders() { return iterator(this.unterordner); }
  createFile(blob) {
    const f = new Datei(blob.getName(), blob.getBytes(), blob.getContentType());
    this.dateien.push(f);
    this.angelegt.push(f);
    return f;
  }
}
const iterator = (liste) => { let i = 0; return { hasNext: () => i < liste.length, next: () => liste[i++] }; };
const blob = (bytes, typ) => ({ _name: '', _typ: typ, getBytes: () => bytes.slice(), getContentType() { return this._typ; }, setContentType(t) { this._typ = t; return this; }, setName(n) { this._name = n; return this; }, getName() { return this._name; } });

Object.assign(window, {
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => KONTO }), getScriptTimeZone: () => 'Europe/Berlin' },
  ScriptApp: {
    newTrigger: (name) => ({ timeBased: () => ({ everyDays: (n) => ({ atHour: (h) => ({ create: () => welt.ausloeser.push({ name, n, h }) }) }) }) }),
    getProjectTriggers: () => welt.ausloeser.map((t) => ({ getHandlerFunction: () => t.name, t })),
    deleteTrigger: (x) => { welt.ausloeser = welt.ausloeser.filter((t) => t !== x.t); },
  },
  DriveApp: {
    getFileById: (id) => {
      if (id !== 'konfig-id') throw new Error(`Datei nicht gefunden: ${id}`);
      return { getBlob: () => ({ getDataAsString: () => JSON.stringify(welt.konfiguration) }) };
    },
    getFolderById: (id) => {
      if (!welt.ordner || id !== welt.ordner.id) throw new Error(`Ordner nicht gefunden: ${id}`);
      return welt.ordner;
    },
  },
  UrlFetchApp: {
    fetch: (url, opts) => {
      welt.abrufe.push({ url, opts });
      if (url === SEITE) return { getResponseCode: () => 200, getContentText: () => welt.html };
      const a = welt.antworten[url];
      if (!a) return { getResponseCode: () => 404, getContentText: () => 'nicht da', getBlob: () => blob([], 'text/html') };
      return { getResponseCode: () => a.code ?? 200, getContentText: () => '', getBlob: () => blob(a.bytes, a.typ || 'application/pdf') };
    },
  },
  MailApp: { sendEmail: (an, betreff, text) => welt.mails.push({ an, betreff, text }) },
  Utilities: { formatDate: (d) => d.toISOString() },
});
const warnAlt = console.warn;
const logAlt = console.log;
console.warn = (...a) => { welt.warnungen.push(a.join(' ')); warnAlt(...a); };
console.log = (...a) => { welt.protokoll.push(a.join(' ')); logAlt(...a); };

/** DsZeitung.gs als normales Skript laden – seine Funktionen sind dann global */
async function ladeSkript() {
  const text = await (await fetch('../apps-script/DsZeitung.gs', { cache: 'no-store' })).text();
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  let fehler = null;
  const merken = (e) => { fehler = e.error || e.message; };
  window.addEventListener('error', merken);
  await new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = ok;
    s.onerror = () => fail(new Error('DsZeitung.gs nicht geladen'));
    document.head.append(s);
  });
  window.removeEventListener('error', merken);
  if (fehler) throw fehler;
  return text;
}

/* ------------------------------------------------------------ Prüfungen */

await step('Skript laden', async () => {
  section('Skript und Manifest');
  const text = await ladeSkript();
  check(typeof einrichten === 'function' && typeof pruefen === 'function' && typeof abschalten === 'function', 'DsZeitung.gs geladen: einrichten, pruefen, abschalten');
  const manifest = await (await fetch('../apps-script/DsZeitung.appsscript.json', { cache: 'no-store' })).json();
  const scopes = manifest.oauthScopes || [];
  check(scopes.includes('https://www.googleapis.com/auth/drive') && scopes.includes('https://www.googleapis.com/auth/script.external_request')
    && scopes.includes('https://www.googleapis.com/auth/script.scriptapp') && scopes.includes('https://www.googleapis.com/auth/script.send_mail'),
    'Manifest: Drive (neue Dateien im Ordner anlegen), Website abrufen, Auslöser, E-Mail', JSON.stringify(scopes));
  check(!/\b(setTrashed|removeFile|setContent|SpreadsheetApp|CalendarApp)\b/.test(text), 'Skript löscht und ändert nichts (kein setTrashed, removeFile, setContent)');
});

await step('Seite lesen', async () => {
  section('Ausgaben von der Website erkennen');
  const html = seiteHtml([[199, '131. Jahrgang 2/2026', 'Die neue Ausgabe'], [198, '131. Jahrgang 1/2026', 'Frühjahr'], [197, '130. Jahrgang 3/2025', 'Notausgabe']]);
  const liste = ausgabenAusHtml_(html, SEITE);
  check(liste.length === 3 && liste.map((a) => a.id).join() === '199,198,197', 'drei Ausgaben in der Reihenfolge der Seite (neueste zuerst), Bild-Links und doppelte Links zählen nicht', JSON.stringify(liste));
  check(liste[0].url === 'https://xn--deutsche-sngerschaft-kzb.de/ajax/getFile.php?zeitung_id=199', 'Download-Adresse absolut', liste[0].url);
  check(liste.map((a) => a.name).join('|') === '2026-2 DS-Zeitung.pdf|2026-1 DS-Zeitung.pdf|2025-3 DS-Zeitung.pdf', 'Dateinamen wie die App sie erwartet (Jahr-Nummer)', liste.map((a) => a.name).join('|'));
  check(liste[0].titel === '131. Jahrgang 2/2026' && liste[0].jahr === 2026 && liste[0].nr === 2, 'Überschrift, Jahr und Nummer', JSON.stringify(liste[0]));
  const ohne = ausgabenAusHtml_(seiteHtml([[200, 'Sonderausgabe zum Sängerfest', '']]), SEITE);
  check(ohne[0].name === 'DS-Zeitung Sonderausgabe zum Sängerfest.pdf' && ohne[0].jahr === null, 'ohne Jahr und Nummer: Name aus der Überschrift');
  check(ausgabenAusHtml_('<html><body><h1>Umgebaut</h1></body></html>', SEITE).length === 0, 'Seite ohne Links: nichts');
  const jn = (s, j) => JSON.stringify(jahrNummer_(s, j));
  check(jn('131. Jahrgang 2/2026') === '{"jahr":2026,"nr":2}' && jn('2026-2 DS-Zeitung.pdf') === '{"jahr":2026,"nr":2}' && jn('DS-Zeitung 2-2026.pdf') === '{"jahr":2026,"nr":2}'
    && jn('DS-Zeitung_2026_02.pdf') === '{"jahr":2026,"nr":2}' && jn('DS-Zeitung März 2026.pdf') === '{"jahr":2026,"nr":3}' && jn('Heft 3.pdf', 2025) === '{"jahr":2025,"nr":3}',
    'Jahr und Nummer aus allen üblichen Schreibweisen (auch Jahresordner)', [jn('131. Jahrgang 2/2026'), jn('2026-2 DS-Zeitung.pdf'), jn('DS-Zeitung 2-2026.pdf'), jn('DS-Zeitung_2026_02.pdf'), jn('DS-Zeitung März 2026.pdf'), jn('Heft 3.pdf', 2025)].join(' '));
  check(jn('WiSe 2025-26.pdf') === '{"jahr":2025,"nr":null}' && jn('Sonderausgabe.pdf') === '{"jahr":null,"nr":null}' && jn('3 DS-Zeitung Herbst.pdf') === '{"jahr":null,"nr":null}',
    'Studienjahr ist keine Nummer; ohne Jahr: nichts');
  check(jn('3 DS-Zeitung.pdf', 2025) === '{"jahr":2025,"nr":3}' && jn('DS-Zeitung Herbst 2026.pdf') === '{"jahr":2026,"nr":9}', 'Jahresordner: führende Nummer; Jahreszeit wie in der App (Herbst = 9)');
  check(absolut_('ajax/getFile.php?zeitung_id=1', SEITE) === 'https://xn--deutsche-sngerschaft-kzb.de/ajax/getFile.php?zeitung_id=1'
    && absolut_('/x.pdf', SEITE) === 'https://xn--deutsche-sngerschaft-kzb.de/x.pdf' && absolut_('https://a.de/b.pdf', SEITE) === 'https://a.de/b.pdf', 'Adressen aufgelöst');
});

await step('Durchläufe', async () => {
  section('Durchläufe mit nachgebauten Google-Diensten');
  welt.ordner = new Ordner('DS-Zeitung', 'ordner-ds');
  // von Hand schon abgelegt: 1/2026 unter anderem Namen, 3/2025 im Jahresordner
  welt.ordner.dateien.push(new Datei('DS-Zeitung 1-2026.pdf', PDF('alt'), 'application/pdf'));
  const jahr2025 = new Ordner('2025', 'ordner-2025');
  jahr2025.dateien.push(new Datei('3 DS-Zeitung Herbst.pdf', PDF('alt'), 'application/pdf'));
  welt.ordner.unterordner.push(jahr2025);
  welt.html = seiteHtml([[199, '131. Jahrgang 2/2026', 'Neu'], [198, '131. Jahrgang 1/2026', 'Frühjahr'], [197, '130. Jahrgang 3/2025', 'Notausgabe']]);
  const url = (id) => `https://xn--deutsche-sngerschaft-kzb.de/ajax/getFile.php?zeitung_id=${id}`;
  welt.antworten[url(199)] = { bytes: PDF('Ausgabe 2/2026'), typ: 'application/pdf' };
  welt.antworten[url(198)] = { bytes: PDF('Ausgabe 1/2026'), typ: 'application/pdf' };
  welt.antworten[url(197)] = { bytes: PDF('Ausgabe 3/2025'), typ: 'application/pdf' };

  // Konfiguration fehlt
  EINSTELLUNGEN.konfigurationId = 'HIER_ID_DER_PRIVATEN_KONFIGURATION';
  let fehler = null;
  try { pruefen(); } catch (e) { fehler = e; }
  check(/privaten Konfiguration/.test(String(fehler)) && welt.abrufe.length === 0, 'ohne ID der privaten Konfiguration: verständlicher Fehler, kein Abruf', String(fehler));

  // einrichten: Ordner aus der privaten Konfiguration, täglicher Auslöser, erster Durchlauf
  EINSTELLUNGEN.konfigurationId = 'konfig-id';
  einrichten();
  check(welt.ausloeser.length === 1 && welt.ausloeser[0].name === 'pruefen' && welt.ausloeser[0].n === 1 && welt.ausloeser[0].h === EINSTELLUNGEN.stunde, 'ein täglicher Auslöser „pruefen“', JSON.stringify(welt.ausloeser));
  einrichten();
  check(welt.ausloeser.length === 1, 'nochmal einrichten: kein doppelter Auslöser');
  const neu = welt.ordner.angelegt.map((f) => f.getName());
  check(neu.join() === '2026-2 DS-Zeitung.pdf', 'nur die fehlende Ausgabe 2/2026 abgelegt – 1/2026 (anderer Name) und 3/2025 (Jahresordner) sind schon da', neu.join());
  const f = welt.ordner.angelegt[0];
  check(f && f.typ === 'application/pdf' && new TextDecoder().decode(new Uint8Array(f.bytes)).includes('Ausgabe 2/2026') && !f.beschreibung, 'Datei: PDF-Inhalt unverändert, ohne Beschreibung (die App zeigt sonst die Beschreibung als Titel)');
  check(welt.abrufe.filter((a) => a.url !== SEITE).map((a) => a.url).join() === url(199), 'nur die fehlende Ausgabe heruntergeladen', JSON.stringify(welt.abrufe.map((a) => a.url)));
  check(welt.abrufe.every((a) => a.opts?.muteHttpExceptions === true), 'Abrufe mit muteHttpExceptions (Fehler landen im Protokoll statt im Abbruch)');
  check(welt.mails.length === 1 && welt.mails[0].an === KONTO && /2026-2 DS-Zeitung\.pdf/.test(welt.mails[0].text) && /DS-Zeitung/.test(welt.mails[0].betreff), 'eine E-Mail an das eigene Konto mit dem Dateinamen', JSON.stringify(welt.mails));
  check(welt.ordner.dateien.every((d) => d.geaendert.length === 0) && jahr2025.dateien.every((d) => d.geaendert.length === 0), 'vorhandene Dateien unberührt (nicht umbenannt, beschrieben oder gelöscht)');

  // nächster Tag: nichts Neues
  const abrufe = welt.abrufe.length;
  pruefen();
  check(welt.ordner.angelegt.length === 1 && welt.mails.length === 1 && welt.abrufe.length === abrufe + 1, 'nächster Durchlauf: nur die Seite abgerufen, nichts angelegt, keine E-Mail');

  // neue Ausgabe erscheint; dazu Störungen: Fehlerseite statt PDF, 404, zu groß
  welt.html = seiteHtml([[203, '132. Jahrgang 1/2027', 'Zu groß'], [202, '131. Jahrgang 4/2026', 'Fehlt'], [201, '131. Jahrgang 3/2026', 'Fehlerseite'], [200, '131. Jahrgang Sonderheft 2026', 'Sonder'], [199, '131. Jahrgang 2/2026', 'Neu']]);
  welt.antworten[url(201)] = { bytes: [...new TextEncoder().encode('<html>Wartung</html>')], typ: 'text/html' };
  welt.antworten[url(200)] = { bytes: PDF('Sonderheft'), typ: 'application/octet-stream' };
  welt.antworten[url(203)] = { bytes: PDF('x'.repeat(2000)), typ: 'application/pdf' };
  EINSTELLUNGEN.hoechstensMb = 0.001;
  welt.warnungen.length = 0;
  pruefen();
  const neu2 = welt.ordner.angelegt.slice(1).map((f) => f.getName());
  check(neu2.join() === 'DS-Zeitung 131. Jahrgang Sonderheft 2026.pdf', 'Sonderheft (PDF trotz anderem Content-Type) abgelegt; Fehlerseite, 404 und zu große Datei übersprungen', neu2.join());
  check(welt.warnungen.some((w) => /kein PDF/.test(w)) && welt.warnungen.some((w) => /404/.test(w)) && welt.warnungen.some((w) => /mehr als erlaubt/.test(w)), 'Warnungen im Protokoll für jede übersprungene Ausgabe', JSON.stringify(welt.warnungen));
  check(welt.mails.length === 2 && /Sonderheft/.test(welt.mails[1].text), 'E-Mail nur für das Abgelegte');
  EINSTELLUNGEN.hoechstensMb = 60;
  pruefen();
  check(welt.ordner.angelegt.length === 3 && welt.ordner.angelegt[2].getName() === '2027-1 DS-Zeitung.pdf', 'mit normaler Grenze: 1/2027 beim nächsten Durchlauf nachgeholt; das Sonderheft nicht doppelt');

  // Website umgebaut: Warnung, nichts passiert
  welt.html = '<html><body><h1>Neue Website</h1></body></html>';
  welt.warnungen.length = 0;
  pruefen();
  check(welt.warnungen.some((w) => /Aufbau der Website/.test(w)) && welt.ordner.angelegt.length === 3, 'Seite ohne Ausgaben: Warnung, nichts angelegt');

  // Ordner direkt angeben, Mail aus
  EINSTELLUNGEN.ordnerId = 'ordner-ds';
  EINSTELLUNGEN.konfigurationId = 'HIER_ID_DER_PRIVATEN_KONFIGURATION';
  EINSTELLUNGEN.mail = false;
  welt.html = seiteHtml([[204, '132. Jahrgang 2/2027', 'Neu']]);
  welt.antworten[url(204)] = { bytes: PDF('2/2027'), typ: 'application/pdf' };
  const mails = welt.mails.length;
  pruefen();
  check(welt.ordner.angelegt.length === 4 && welt.ordner.angelegt[3].getName() === '2027-2 DS-Zeitung.pdf' && welt.mails.length === mails,
    'Ordner-ID direkt: funktioniert ohne private Konfiguration; mail: false schickt nichts', JSON.stringify([welt.ordner.angelegt.map((f) => f.getName()), welt.mails.length, mails]));

  abschalten();
  check(welt.ausloeser.length === 0, 'abschalten: Auslöser weg');
  check(welt.protokoll.some((p) => /Ausgabe\(n\) auf der Website/.test(p)) && !welt.protokoll.concat(welt.warnungen).some((p) => /@/.test(p)), 'Protokoll nennt Anzahlen und Dateinamen, keine Adressen');
});

console.warn = warnAlt;
console.log = logAlt;
const failed = results.filter((r) => !r.ok);
const summary = `${results.length - failed.length}/${results.length} Prüfungen bestanden`;
document.getElementById('summary').textContent = summary;
document.getElementById('summary').className = failed.length ? 'fail' : 'ok';
window.__testResult = { summary, failed };
