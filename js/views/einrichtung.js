// Einrichtungs-Assistent für Admins: Google-Zugang, Anmeldung, Daten anlegen, private Konfiguration in Drive
// speichern und das öffentliche config.js erzeugen (E43)
import { html, setHtml, icon, hero, notice, toast, showError, copyText, setBusy, formData, confirmDialog } from '../ui.js';
import {
  config, saveOverride, clearOverrideKeys, currentBaseUrl, appBaseUrl, publicConfigContent, privateConfigObject, privateConfigContent,
  PRIVATE_WRITE_KEYS, isGoogleConfigured, isConfigured,
} from '../config.js';
import { fDateTime } from '../lib/dates.js';
import { privateConfigStatus } from '../lib/konfiguration.js';
import * as auth from '../auth.js';
import { downloadFile } from '../lib/export.js';
import { RESOURCES, missingResources, idFromUrl } from '../lib/setup.js';
import { gruppenAdressen, gruppenOhneAus, BEREICHE } from '../lib/gruppen.js';
import { GOOGLE_G } from '../icons.js';

const CLOUD = 'https://console.cloud.google.com';
const APIS = [
  ['Google Calendar API', 'calendar-json.googleapis.com'],
  ['Google Sheets API (nur lesen)', 'sheets.googleapis.com'],
  ['Google Drive API', 'drive.googleapis.com'],
  ['People API', 'people.googleapis.com'],
  ['Google Chat API (nur Workspace)', 'chat.googleapis.com'],
];

function copyRow(value) {
  return html`<div class="copy-row" style="margin:.375rem 0 .625rem"><code class="grow" style="overflow-wrap:anywhere">${value}</code><button type="button" class="btn btn-sm btn-icon" data-copy="${value}" aria-label="Kopieren">${icon('copy', 'icon-sm')}</button></div>`;
}

function logLine(text, kind = '') {
  return html`<div class="${kind}">${kind === 'ok' ? '✓ ' : kind === 'err' ? '✗ ' : '… '}${text}</div>`;
}

const labelsOf = (keys) => RESOURCES.filter((r) => keys.includes(r.key)).map((r) => r.label);

/** Welche Datenquellen sind eingetragen, welche fehlen? (ohne Google-Abfrage) */
function resourceStatus() {
  return html`${RESOURCES.map((r) => {
    const set = !!String(r.id(config) || '').trim();
    return html`<li class="${set ? 'is-set' : ''}">${icon(set ? 'check' : 'minus', 'icon-sm')}<span><strong>${r.label}</strong> – ${set ? 'eingetragen' : 'fehlt'}</span></li>`;
  })}`;
}

/** Inhalt von „2. Fehlendes neu anlegen“ – passend zu dem, was noch fehlt */
function createBox(google) {
  const missing = missingResources();
  // Gruppen (E41): je Gruppe eine Kennungsdatei, nur für diese Gruppe lesbar – fehlende legt der Knopf an
  const gruppen = Object.values(gruppenAdressen());
  const gruppenBox = gruppen.length ? html`
    <p class="small" style="margin:.875rem 0 0"><strong>Gruppen:</strong> ${gruppen.join(', ')}. Damit die App weiß, wer zu welcher Gruppe gehört, braucht jede Gruppe eine kleine Kennungsdatei, die nur sie lesen kann. Vorher die Gruppen in der Admin-Konsole anlegen.</p>
    <p style="margin:.5rem 0 0"><button class="btn" data-action="create-gruppen" ${google ? '' : 'disabled'}>${icon('users', 'icon-sm')}Fehlende Gruppen-Kennungen anlegen</button></p>` : '';
  if (!missing.length) return html`<p class="small muted">Es fehlt nichts – alle Datenquellen sind eingetragen. Unten kannst du sie prüfen.</p>${gruppenBox}`;
  // Beispieldaten nur beim Test von Grund auf vorschlagen, nie neben echten Daten
  const fresh = missing.length === RESOURCES.length;
  const sampleKinds = [missing.includes('kalender') && 'Termine', missing.includes('news') && 'News', missing.includes('adressen') && 'Adressen'].filter(Boolean);
  return html`
    <p class="small">Neu angelegt wird: <strong>${labelsOf(missing).join(', ')}</strong>.</p>
    <p class="small muted">Alles entsteht neu in deinem eigenen Google-Konto. Mitglieder bekommen nur Leserechte; die Einwilligungsliste sehen nur die Datenschutz-Verantwortlichen. Bereits verbundene Dateien werden <strong>nicht verändert und nicht neu freigegeben</strong>.</p>
    ${sampleKinds.length ? html`<label class="checkbox small" style="margin-bottom:.375rem"><input type="checkbox" id="c-samples" ${fresh ? 'checked' : ''}> Beispieldaten in die neuen Dateien eintragen (${sampleKinds.join(', ')})</label>` : ''}
    ${missing.includes('zeitung') ? html`<label class="checkbox small" style="margin-bottom:.375rem"><input type="checkbox" id="c-issues" ${fresh ? 'checked' : ''}> Drei Beispielausgaben des Bundesboten hochladen</label>` : ''}
    ${missing.includes('galerie') ? html`<label class="checkbox small" style="margin-bottom:.375rem"><input type="checkbox" id="c-photos" ${fresh ? 'checked' : ''}> Beispielbilder für die Galerie hochladen</label>` : ''}
    <p style="margin:.75rem 0 0"><button class="btn btn-primary" data-action="create" ${google ? '' : 'disabled'}>${icon('sparkle', 'icon-sm')}Fehlendes neu anlegen</button></p>
    ${google && missing.includes('kalender') && !auth.hasScope(auth.SCOPES.setup[0]) ? html`<p class="tiny muted">Für den neuen Kalender fragt Google einmal nach der zusätzlichen Berechtigung „Kalender verwalten“.</p>` : ''}
    ${gruppenBox}`;
}

/**
 * Gruppen (E41/E52): je Gruppe Kästchen für die Bereiche, die sie in der App NICHT sieht (config.gruppen.ohne).
 * Die Gruppen selbst (gruppen.adressen) stehen in der privaten Konfiguration – ohne Gruppen bleibt der Abschnitt weg.
 */
function gruppenBereiche() {
  const adressen = gruppenAdressen();
  const keys = Object.keys(adressen);
  if (!keys.length) return '';
  const ohne = config.gruppen?.ohne || {};
  return html`
    <h4 style="margin:1rem 0 .25rem">Gruppen</h4>
    <p class="small muted" style="margin-top:0">Anhaken, was eine Gruppe in der App <strong>nicht</strong> sieht. Wer zusätzlich in einer anderen Gruppe ist, die den Bereich sieht, sieht ihn weiterhin; Admins sehen alles. Das Ausblenden betrifft nur die App – die Daten schützt die Freigabe in Google Drive („Verbindung prüfen“ nennt Freigaben, die dazu nicht passen).</p>
    ${keys.map((k) => html`
      <fieldset class="gruppen-feld">
        <legend><strong>${adressen[k]}</strong> <span class="muted">sieht nicht:</span></legend>
        <div class="row wrap" style="gap:.375rem .875rem">
          ${Object.entries(BEREICHE).map(([bereich, label]) => html`<label class="checkbox small"><input type="checkbox" name="ohne:${k}:${bereich}" ${(ohne[bereich] || []).includes(k) ? 'checked' : ''}> ${label}</label>`)}
        </div>
      </fieldset>`)}`;
}

/** Stand der privaten Konfiguration (E43) – ohne Google-Abfrage */
function privateInfo() {
  const id = String(config.privateConfigId || '').trim();
  if (!id) return html`<p class="small muted">Noch nicht in Google Drive: Bisher stehen alle Einstellungen im öffentlichen <code>config.js</code>.</p>`;
  const st = privateConfigStatus();
  const when = st.geladen ? fDateTime(st.geladen) : '';
  const text = st.status === 'ok' ? `aus Google Drive geladen${when ? ` (${when})` : ''}`
    : st.status === 'cache' ? `zuletzt nicht aus Drive geladen – die App nutzt den geprüften Stand vom ${when} (${st.error?.message || 'Fehler'})`
      : st.status === 'fehler' ? `nicht geladen: ${st.error?.message || 'Fehler'}`
        : 'in diesem Browser noch nicht geladen (erst beim nächsten Start der App)';
  return html`<p class="small">Datei-ID: <code style="overflow-wrap:anywhere">${id}</code> · ${text}</p>
    ${st.warnings?.length ? html`<ul class="check-warn small">${st.warnings.map((w) => html`<li>${w}</li>`)}</ul>` : ''}`;
}

/**
 * Knöpfe für das öffentliche config.js – erst mit der ID der privaten Datei: Ohne sie fehlten der veröffentlichten
 * App alle weiteren Einstellungen (Kalender, Tabellen, Admins …).
 */
function pubActions() {
  const ok = !!String(config.privateConfigId || '').trim();
  return html`${ok ? '' : html`<p class="small" style="margin:0 0 .5rem">${icon('alert', 'icon-sm')} Zuerst oben <strong>„Einstellungen in Google Drive speichern“</strong> – erst dann enthält config.js die ID der privaten Datei. Ohne sie fehlten der App alle weiteren Einstellungen.</p>`}
    <div class="row wrap">
      <button class="btn" data-action="download-config" ${ok ? '' : 'disabled'}>${icon('download', 'icon-sm')}config.js herunterladen</button>
      <button class="btn" data-action="copy-config" ${ok ? '' : 'disabled'}>${icon('copy', 'icon-sm')}Inhalt kopieren</button>
    </div>`;
}

function checkCard(c) {
  const kind = !c.ok ? 'red' : c.warn?.length ? 'gold' : 'green';
  return html`<div class="notice notice-${kind}">${icon(kind === 'green' ? 'check' : 'alert')}<div class="grow" style="min-width:0">
    <h3>${c.label}</h3>${c.detail ? html`<p class="small">${c.detail}</p>` : ''}
    ${c.warn?.length ? html`<ul class="check-warn small">${c.warn.map((w) => html`<li>${w}</li>`)}</ul>` : ''}
    ${c.lines?.length ? html`<ul class="check-lines small">${c.lines.map((l) => html`<li>${l}</li>`)}</ul>` : ''}
  </div></div>`;
}

export default async function einrichtung(ctx) {
  const { el, app, query } = ctx;
  const google = app.mode === 'google';
  const demo = app.mode === 'demo';
  const me = app.user;
  const resourcesDone = isConfigured();
  const origin = location.origin;
  const redirect = currentBaseUrl();
  const localhost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  setHtml(el, html`
    ${hero('Einrichtung', 'Für Admins: einmalig die Verbindung zu Google herstellen')}
    ${demo ? notice('gold', 'Du bist im Demo-Modus', 'Für die Einrichtung bitte die Demo beenden und dich mit deinem Google-Konto anmelden.', html`<p style="margin-top:.625rem"><button class="btn btn-sm btn-primary" data-action="end-demo">Demo beenden</button></p>`) : ''}
    ${!google && !demo && !isGoogleConfigured() ? html`<p class="muted" style="max-width:47.5rem">Diese Seite führt dich durch die Einrichtung. Du brauchst nur ein Google-Konto (für den Test reicht ein privates, später das Workspace-Konto der Verbindung). Dauer: etwa 15 Minuten.</p>` : ''}
    <div class="steps" style="max-width:56.25rem">

      <section class="card step ${isGoogleConfigured() ? 'done' : ''}">
        <h3>Google-Zugang anlegen (Client-ID)</h3>
        <p class="small">Damit sich Mitglieder mit Google anmelden können, braucht die App eine eigene „OAuth-Client-ID“ aus der Google Cloud Console.</p>
        <details ${isGoogleConfigured() ? '' : 'open'}>
          <summary style="cursor:pointer;font-weight:700">Schritt-für-Schritt-Anleitung</summary>
          <ol class="small" style="padding-left:1.25rem;line-height:1.6">
            <li><a href="${CLOUD}/projectcreate" target="_blank" rel="noopener">Neues Projekt anlegen</a> (Name z. B. „Mitglieder-App“).</li>
            <li>Diese Schnittstellen aktivieren (jeweils Link öffnen → „Aktivieren“):
              <ul>${APIS.map(([n, id]) => html`<li><a href="${CLOUD}/apis/library/${id}" target="_blank" rel="noopener">${n}</a></li>`)}</ul></li>
            <li><a href="${CLOUD}/auth/branding" target="_blank" rel="noopener">OAuth-Zustimmungsbildschirm</a> einrichten: App-Name „${config.appName}“, deine E-Mail-Adresse.
              Zielgruppe: <strong>Intern</strong> (mit Google Workspace) bzw. <strong>Extern</strong> für den Test mit privatem Konto – dann unter „Zielgruppe → Testnutzer“ die eigenen Test-Konten eintragen.</li>
            <li><a href="${CLOUD}/auth/clients/create" target="_blank" rel="noopener">Client erstellen</a>: Anwendungstyp <strong>„Webanwendung“</strong>.
              <div style="margin-top:.375rem">Unter <strong>Autorisierte JavaScript-Quellen</strong> eintragen:</div>${copyRow(origin)}
              <div>Unter <strong>Autorisierte Weiterleitungs-URIs</strong> eintragen:</div>${copyRow(redirect)}
              ${localhost ? html`<div class="tiny muted">Später für die veröffentlichte App zusätzlich die GitHub-Pages-Adresse eintragen (z. B. https://name.github.io und https://name.github.io/fb-app/).</div>` : ''}</li>
            <li>Die angezeigte <strong>Client-ID</strong> (endet auf <code>.apps.googleusercontent.com</code>) unten einfügen.</li>
          </ol>
        </details>
        <form class="row wrap" id="client-form" style="margin-top:.75rem" novalidate>
          <input class="input grow" name="clientId" id="client-id" placeholder="123456789-abc….apps.googleusercontent.com" value="${config.googleClientId}" style="flex:1 1 14rem;min-width:0" autocomplete="off">
          <button class="btn btn-primary" type="submit">Speichern</button>
        </form>
      </section>

      <section class="card step ${google ? 'done' : ''}">
        <h3>Mit Google anmelden</h3>
        ${google ? html`<p class="small">Angemeldet als <strong>${me.email}</strong>${me.hd ? html` (Workspace ${me.hd})` : ' (privates Google-Konto)'}.</p>`
          : html`<p class="small">Melde dich mit dem Konto an, in dem Kalender, Tabellen und die Ordner für Bundesbote und Fotos liegen sollen.</p>
            <button class="google-btn" data-action="login" ${isGoogleConfigured() && !demo ? '' : 'disabled'}>${GOOGLE_G}<span>Mit Google anmelden</span></button>
            <p class="tiny muted">Bei einem Test-Projekt zeigt Google den Hinweis „App wurde nicht überprüft“ – dann „Erweitert → Weiter zu …“ wählen. Mit Google Workspace und Zielgruppe „Intern“ entfällt das.</p>`}
      </section>

      <section class="card step ${resourcesDone ? 'done' : ''}">
        <h3>Optionen</h3>
        <form id="opt-form" novalidate>
          <div class="form-grid cols-2">
            <div class="field"><label for="o-domain">Workspace-Domain (optional)</label>
              <input class="input" id="o-domain" name="workspaceDomain" placeholder="z. B. frankonia-brunonia.de" value="${config.workspaceDomain}">
              <span class="hint">Nur Konten dieser Domain dürfen sich anmelden. Für den Test mit privatem Konto leer lassen.</span></div>
            <div class="field"><label for="o-group">Mitglieder-Gruppe (empfohlen)</label>
              <input class="input" id="o-group" name="mitgliederGruppe" placeholder="z. B. mitglieder@frankonia-brunonia.de" value="${config.mitgliederGruppe}">
              <span class="hint">Google-Gruppe aller Mitglieder. Nicht nötig: Anmelden kann jedes Konto der Domain, und zu- oder absagen kann jeder (ohne Einladung über die App). Mit der Gruppe als Gast stehen die Termine aber auch in den Kalendern der Mitglieder, und die Antworten erscheinen im Google Kalender.</span></div>
            <div class="field"><label for="o-test">Test-Mitglieder (optional)</label>
              <input class="input" id="o-test" name="testMitglieder" placeholder="freund@gmail.com, zweitkonto@gmail.com" value="${(config.testMitglieder || []).join(', ')}">
              <span class="hint">Für den Prototyp ohne Gruppe: diese Konten bekommen Zugriff und Einladungen.</span></div>
            <div class="field"><label for="o-admins">Admins</label>
              <input class="input" id="o-admins" name="admins" placeholder="deine@adresse.de" value="${(config.admins || []).join(', ') || me?.email || ''}">
              <span class="hint">Nur Admins sehen diese Einrichtungsseite. Solange unter „Wer darf die Einwilligungen sehen?“ niemand steht, sind sie auch die Datenschutz-Verantwortlichen.</span></div>
            <div class="field"><label for="o-red">Redaktion (optional)</label>
              <input class="input" id="o-red" name="redaktion" placeholder="z. B. schriftwart@frankonia-brunonia.de" value="${(config.redaktion || []).join(', ')}">
              <span class="hint">Wer außer den Admins News in der App schreiben darf.</span></div>
          </div>
          <div class="field"><label for="o-url">Adresse der App</label>
            <input class="input" id="o-url" name="appUrl" value="${config.appUrl || currentBaseUrl()}">
            <span class="hint">Wird in jeden Kalendertermin als Link eingetragen. Nach dem Veröffentlichen hier die GitHub-Pages-Adresse eintragen.</span></div>
          <div class="form-grid cols-2">
            <div class="field"><label for="o-adr">E-Mail für Adressänderungen</label>
              <input class="input" id="o-adr" name="adressaenderung" type="email" value="${config.adressaenderung}" placeholder="z. B. adressaenderung@frankonia-brunonia.de">
              <span class="hint">Weichen die Angaben in „Mein Profil“ vom Adressverzeichnis ab, bereitet die App eine E-Mail an diese Adresse vor. Ohne Umlaute.</span></div>
            <div class="field"><label for="o-zug">E-Mail für Zugangsdaten</label>
              <input class="input" id="o-zug" name="zugangsdaten" type="email" value="${config.zugangsdaten || ''}" placeholder="z. B. ahv@frankonia-brunonia.de">
              <span class="hint">Steht in der vorbereiteten Einladung in die App (Startseite › Geburtstage › Person ohne Konto): Dorthin schreiben Eingeladene für ihre Zugangsdaten.</span></div>
          </div>
          <div class="form-grid cols-2">
            <div class="field"><label for="o-vs-a">Aktivenvorstand</label>
              <input class="input" id="o-vs-a" name="vorstandAktive" placeholder="senior@…, consenior@…" value="${(config.vorstand?.aktive || []).join(', ')}">
              <span class="hint">Für „Aktivenvorstand kontaktieren“ im Chat. Leer = kein Knopf.</span></div>
            <div class="field"><label for="o-vs-ah">Altherrenvorstand</label>
              <input class="input" id="o-vs-ah" name="vorstandAltherren" placeholder="E-Mail-Adressen, mit Komma getrennt" value="${(config.vorstand?.altherren || []).join(', ')}">
              <span class="hint">Für „Altherrenvorstand kontaktieren“. Leer = kein Knopf.</span></div>
          </div>
          <h4 style="margin:1rem 0 .25rem">Push-Mitteilungen</h4>
          <p class="small muted" style="margin-top:0">Mitteilungen bei geschlossener App (News, Forum, Termine) verschickt das Skript <code>apps-script/Push.gs</code> in einem Konto der Verbindung. Konto und Schlüssel stehen nach „einrichten“ in dessen Protokoll (docs/EINRICHTUNG.md). Leer = aus.</p>
          <div class="form-grid cols-2">
            <div class="field"><label for="o-push-konto">Konto des Skripts</label>
              <input class="input" id="o-push-konto" name="pushKonto" type="email" value="${config.push?.konto || ''}" placeholder="z. B. vorstand@…">
              <span class="hint">Nur dieses Konto kann die Push-Anmeldungen der Geräte lesen.</span></div>
            <div class="field"><label for="o-push-key">Öffentlicher Schlüssel</label>
              <input class="input" id="o-push-key" name="pushSchluessel" value="${config.push?.schluessel || ''}" placeholder="B… (87 Zeichen)" autocomplete="off" spellcheck="false"></div>
          </div>
          ${gruppenBereiche()}
          <h4 style="margin:1rem 0 .25rem">Datenschutz</h4>
          <p class="small muted" style="margin-top:0">Erscheint in der Datenschutzerklärung, die jedes Mitglied beim ersten Öffnen sieht. Der Text ist ein Muster – bitte vom Vorstand prüfen lassen (<a href="#/datenschutz">ansehen</a>).</p>
          <div class="form-grid cols-2">
            <div class="field"><label for="o-ds-verein">Verantwortlicher (Verein)</label>
              <input class="input" id="o-ds-verein" name="dsVerein" placeholder="z. B. Sängerschaft Frankonia-Brunonia e. V." value="${config.datenschutz?.verein}"></div>
            <div class="field"><label for="o-ds-anschrift">Anschrift</label>
              <input class="input" id="o-ds-anschrift" name="dsAnschrift" placeholder="Straße Nr., PLZ Ort" value="${config.datenschutz?.anschrift}"></div>
            <div class="field"><label for="o-ds-email">E-Mail für Datenschutzfragen</label>
              <input class="input" id="o-ds-email" name="dsEmail" type="email" placeholder="z. B. vorstand@…" value="${config.datenschutz?.email}"></div>
            <div class="field"><label for="o-ds-empf">Wer darf die Einwilligungen sehen?</label>
              <input class="input" id="o-ds-empf" name="dsEmpfaenger" placeholder="leer = die Admins" value="${(config.datenschutz?.empfaenger || []).join(', ')}">
              <span class="hint">Einzelne E-Mail-Adressen (keine Gruppe). Sie bekommen Lesezugriff auf jede Einwilligung und die Sammelliste.</span></div>
            <div class="field"><label for="o-ds-dv">Dachverband</label>
              <input class="input" id="o-ds-dv" name="dsDachverband" value="${config.datenschutz?.dachverband}"></div>
            <div class="field"><label for="o-ds-fassung">Fassung der Einwilligungstexte</label>
              <input class="input" id="o-ds-fassung" name="dsFassung" value="${config.datenschutz?.fassung}" inputmode="numeric">
              <span class="hint">Erhöhen, wenn sich die Texte ändern – dann werden alle Mitglieder erneut gefragt.</span></div>
          </div>
          <button class="btn" type="submit">Optionen speichern</button>
        </form>
      </section>

      <section class="card step ${resourcesDone ? 'done' : ''}">
        <h3>Kalender, Tabellen und Ordner</h3>
        <p class="small">Was es schon gibt – etwa euren Kalender, die Mitgliederliste und die Ordner mit dem Bundesboten, der DS-Zeitung, der Liedermappe und den Fotos –, unter <strong>1.</strong> verbinden. <strong>2.</strong> legt danach nur noch an, was dann fehlt. Vorhandenes liest die App nur.</p>
        <ul class="res-status" id="res-status">${resourceStatus()}</ul>
        <div class="grid-2">
          <form id="manual-form" novalidate>
            <h4 style="margin:.25rem 0 .375rem">1. Vorhandenes verbinden</h4>
            <p class="small muted">Links oder IDs bestehender Dateien einfügen (Link aus der Adresszeile oder „Link kopieren“).</p>
            <div class="field"><label for="m-cal">Kalender (Link oder Kalender-ID)</label><input class="input" id="m-cal" name="kalenderId" value="${config.kalenderId}" placeholder="…@group.calendar.google.com"></div>
            <div class="field"><label for="m-adr">Tabelle Adressverzeichnis</label><input class="input" id="m-adr" name="adressen" value="${config.tabellen?.adressen}" placeholder="https://docs.google.com/spreadsheets/d/…"></div>
            <div class="field"><label for="m-tab">Tabellenblatt des Adressverzeichnisses (optional)</label><input class="input" id="m-tab" name="adressenBlatt" value="${config.adressenBlatt}" placeholder="leer = „Adressen“ bzw. das erste Blatt">
              <span class="hint">Nur nötig, wenn die Tabelle mehrere Blätter hat. Andere Blätter liest die App nicht.</span></div>
            <div class="field"><label for="m-news">Tabelle News</label><input class="input" id="m-news" name="news" value="${config.tabellen?.news}" placeholder="leer lassen – wird unter 2. neu angelegt"></div>
            <div class="field"><label for="m-z">Ordner Bundesbote (PDFs, auch in Jahresordnern)</label><input class="input" id="m-z" name="zeitung" value="${config.zeitungOrdnerId}" placeholder="https://drive.google.com/drive/folders/…"></div>
            <div class="field"><label for="m-l">Ordner Liedermappe (PDFs oder Bilder, Unterordner = Rubriken)</label><input class="input" id="m-l" name="lieder" value="${config.liedermappeOrdnerId}" placeholder="https://drive.google.com/drive/folders/…">
              <span class="hint">Freiwillig – ohne Ordner ist die Liedermappe ausgeblendet.</span></div>
            <div class="field"><label for="m-ds">Ordner DS-Zeitung (PDFs, auch in Jahresordnern)</label><input class="input" id="m-ds" name="ds" value="${config.dsZeitungOrdnerId}" placeholder="https://drive.google.com/drive/folders/…">
              <span class="hint">Freiwillig – ohne Ordner ist die DS-Zeitung ausgeblendet.</span></div>
            <div class="field"><label for="m-g">Ordner Galerie (Unterordner = Alben)</label><input class="input" id="m-g" name="galerie" value="${config.galerieOrdnerId}" placeholder="https://drive.google.com/drive/folders/…"></div>
            <div class="field"><label for="m-gu">Ordner für Foto-Uploads (optional)</label><input class="input" id="m-gu" name="galerieUpload" value="${config.galerieUploadOrdnerId}" placeholder="https://drive.google.com/drive/folders/…">
              <span class="hint">In Drive für die Mitglieder bearbeitbar freigeben. Die Galerie verlinkt ihn unter „Fotos hochladen“.</span></div>
            <div class="field"><label for="m-ew">Tabelle Einwilligungen (vertraulich)</label><input class="input" id="m-ew" name="einwilligungen" value="${config.tabellen?.einwilligungen}" placeholder="leer lassen – wird unter 2. neu angelegt">
              <span class="hint">Nur eine Tabelle, die die App selbst angelegt hat.</span></div>
            <button class="btn" type="submit">Übernehmen</button>
          </form>
          <div>
            <h4 style="margin:.25rem 0 .375rem">2. Fehlendes neu anlegen</h4>
            <div id="create-box">${createBox(google)}</div>
          </div>
        </div>
        <div class="log hidden" id="log" style="margin-top:.875rem" aria-live="polite"></div>
      </section>

      <section class="card step">
        <h3>Prüfen und veröffentlichen</h3>
        <div class="row wrap">
          <button class="btn" data-action="check" ${google ? '' : 'disabled'}>${icon('check', 'icon-sm')}Verbindung prüfen (nur lesend)</button>
        </div>
        <p class="small muted" style="margin-top:.75rem">${icon('info', 'icon-sm')} Den Link zur App in Termine eintragen, die direkt im Google Kalender angelegt werden: dafür gibt es das Skript <code>apps-script/Automatik.gs</code> (läuft im Konto des Kalender-Inhabers, Anleitung in <code>docs/EINRICHTUNG.md</code>). Die App selbst ändert keine Termine.</p>
        <div id="check" style="margin-top:.75rem"></div>
        <hr>
        <h4 style="margin:0 0 .375rem">Einstellungen für alle Mitglieder (privat, in Google Drive)</h4>
        <p class="small">Admins, Kalender, Tabellen, Ordner, Gruppen und Links speichert die App als Datei <code>config_private.json</code> in deinem Google Drive – lesbar für alle Konten der Domain, aber nicht öffentlich im Internet. Nach dem Speichern gelten Änderungen für alle beim nächsten Öffnen der App. Bis dahin gelten sie nur in diesem Browser.</p>
        <div id="private-info">${privateInfo()}</div>
        <div class="row wrap">
          <button class="btn btn-primary" data-action="save-private" ${google && app.isAdmin() ? '' : 'disabled'}>${icon('upload', 'icon-sm')}Einstellungen in Google Drive speichern</button>
          <button class="btn" data-action="download-private">${icon('download', 'icon-sm')}config_private.json herunterladen</button>
        </div>
        <div id="private-result" style="margin-top:.625rem"></div>
        <details style="margin-top:.5rem"><summary class="small" style="cursor:pointer">Vorschau der config_private.json</summary><pre class="code" id="cfg-private"></pre></details>
        <hr>
        <h4 style="margin:0 0 .375rem">Öffentliches config.js (GitHub)</h4>
        <p class="small">Im öffentlichen <code>config.js</code> der veröffentlichten App steht nur noch, was vor der Anmeldung gebraucht wird: Client-ID, Domain, die ID der privaten Datei, der Demo-Schalter und die Angaben der Datenschutzerklärung. Ersetzen (z. B. im GitHub-Repository) nur, wenn sich davon etwas ändert.</p>
        <div id="pub-actions">${pubActions()}</div>
        <details style="margin-top:.75rem"><summary class="small" style="cursor:pointer">Vorschau der config.js</summary><pre class="code" id="cfg"></pre></details>
      </section>
    </div>`);

  const logEl = el.querySelector('#log');
  const log = (text, kind = '') => {
    logEl.classList.remove('hidden');
    logEl.insertAdjacentHTML('beforeend', logLine(text, kind).toString());
    logEl.scrollTop = logEl.scrollHeight;
  };
  const cfgText = () => publicConfigContent();
  const showCfg = () => {
    el.querySelector('#cfg').textContent = cfgText();
    el.querySelector('#cfg-private').textContent = privateConfigContent();
  };
  showCfg();
  const renderResources = () => {
    setHtml(el.querySelector('#res-status'), resourceStatus());
    setHtml(el.querySelector('#create-box'), createBox(google));
  };

  const list = (s) => String(s || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

  el.querySelector('#client-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = el.querySelector('#client-id').value.trim();
    if (id && !/\.apps\.googleusercontent\.com$/.test(id)) {
      toast('Das sieht nicht wie eine Client-ID aus (sie endet auf .apps.googleusercontent.com)', { type: 'err', timeout: 6000 });
      return;
    }
    saveOverride({ googleClientId: id });
    toast('Client-ID gespeichert');
    app.refresh();
  });

  el.querySelector('#opt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const datenschutz = {
      ...config.datenschutz,
      verein: d.dsVerein.trim(),
      anschrift: d.dsAnschrift.trim(),
      email: d.dsEmail.trim(),
      empfaenger: list(d.dsEmpfaenger),
      dachverband: d.dsDachverband.trim() || config.datenschutz?.dachverband,
      fassung: d.dsFassung.trim() || '1',
    };
    const vorstand = { aktive: list(d.vorstandAktive), altherren: list(d.vorstandAltherren) };
    const pushWerte = { konto: d.pushKonto.trim().toLowerCase(), schluessel: d.pushSchluessel.trim() };
    if (pushWerte.schluessel && !/^B[\w-]{86}$/.test(pushWerte.schluessel)) {
      toast('Der öffentliche Schlüssel für Push sieht nicht richtig aus (87 Zeichen, beginnt mit „B“).', { type: 'err' });
      return;
    }
    // Gruppen (E41/E52): die Adressen bleiben, wie sie in der privaten Konfiguration stehen; nur „ohne“ kommt aus den Kästchen
    const gruppen = Object.keys(gruppenAdressen()).length ? { adressen: { ...config.gruppen?.adressen }, ohne: gruppenOhneAus(d) } : null;
    if (gruppen) clearOverrideKeys(['gruppen']); // merge() ließe abgehakte Bereiche im lokalen Stand sonst stehen
    saveOverride({
      workspaceDomain: d.workspaceDomain.toLowerCase().replace(/^@/, ''),
      mitgliederGruppe: d.mitgliederGruppe.toLowerCase(),
      testMitglieder: list(d.testMitglieder),
      admins: list(d.admins),
      redaktion: list(d.redaktion),
      appUrl: d.appUrl,
      adressaenderung: d.adressaenderung.trim().toLowerCase(),
      zugangsdaten: String(d.zugangsdaten || '').trim().toLowerCase(),
      vorstand,
      push: pushWerte,
      datenschutz,
      ...(gruppen ? { gruppen } : {}),
    });
    // leere Werte bewusst übernehmen (und abgehakte Bereiche: merge() ließe sie stehen)
    Object.assign(config, {
      workspaceDomain: d.workspaceDomain.toLowerCase().replace(/^@/, ''),
      mitgliederGruppe: d.mitgliederGruppe.toLowerCase(),
      testMitglieder: list(d.testMitglieder),
      redaktion: list(d.redaktion),
      vorstand,
      push: pushWerte,
      datenschutz,
      ...(gruppen ? { gruppen } : {}),
    });
    showCfg();
    toast('Optionen gespeichert');
  });

  el.querySelector('#manual-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const values = {
      kalenderId: idFromUrl(d.kalenderId),
      tabellen: { adressen: idFromUrl(d.adressen), news: idFromUrl(d.news), einwilligungen: idFromUrl(d.einwilligungen) },
      adressenBlatt: d.adressenBlatt.trim(),
      zeitungOrdnerId: idFromUrl(d.zeitung),
      liedermappeOrdnerId: idFromUrl(d.lieder),
      dsZeitungOrdnerId: idFromUrl(d.ds),
      galerieOrdnerId: idFromUrl(d.galerie),
      galerieUploadOrdnerId: idFromUrl(d.galerieUpload),
    };
    saveOverride(values);
    // geleerte Felder bewusst übernehmen (saveOverride lässt leere Werte sonst aus)
    Object.assign(config, { ...values, tabellen: { ...config.tabellen, ...values.tabellen } });
    // erkannte IDs anzeigen (z. B. die Kalender-ID statt des Links)
    el.querySelector('#m-cal').value = values.kalenderId;
    el.querySelector('#m-adr').value = values.tabellen.adressen;
    el.querySelector('#m-news').value = values.tabellen.news;
    el.querySelector('#m-z').value = values.zeitungOrdnerId;
    el.querySelector('#m-l').value = values.liedermappeOrdnerId;
    el.querySelector('#m-ds').value = values.dsZeitungOrdnerId;
    el.querySelector('#m-g').value = values.galerieOrdnerId;
    el.querySelector('#m-gu').value = values.galerieUploadOrdnerId;
    el.querySelector('#m-ew').value = values.tabellen.einwilligungen;
    app.clearCache().catch(() => {});
    showCfg();
    renderResources();
    toast('Übernommen – jetzt „Verbindung prüfen“');
  });

  async function runCreate({ nurGruppen = false } = {}) {
    const btn = el.querySelector(nurGruppen ? '[data-action=create-gruppen]' : '[data-action=create]');
    setBusy(btn, true, 'Wird angelegt …');
    logEl.innerHTML = '';
    try {
      const { createMissing } = await import('../lib/setup.js');
      saveOverride({ appUrl: config.appUrl || currentBaseUrl() });
      const res = await createMissing({
        only: nurGruppen ? [] : missingResources(),
        withSamples: !!el.querySelector('#c-samples')?.checked,
        withIssues: !!el.querySelector('#c-issues')?.checked,
        withPhotos: !!el.querySelector('#c-photos')?.checked,
        group: config.mitgliederGruppe,
        domain: config.workspaceDomain,
        testUsers: config.testMitglieder || [],
        me,
        log,
      });
      saveOverride({
        kalenderId: res.kalenderId,
        tabellen: res.tabellen,
        zeitungOrdnerId: res.zeitungOrdnerId,
        liedermappeOrdnerId: res.liedermappeOrdnerId,
        dsZeitungOrdnerId: res.dsZeitungOrdnerId,
        galerieOrdnerId: res.galerieOrdnerId,
        admins: config.admins?.length ? config.admins : [me.email],
      });
      await app.clearCache();
      showCfg();
      renderResources();
      if (res.rootFolderId) log(`Neue Tabellen und Ordner liegen in Google Drive im Ordner „${config.appName} – Mitglieder-App“.`, 'ok');
      if (res.created.includes('einwilligungen')) log('Die Einwilligungsliste liegt bewusst außerhalb davon in „Meine Ablage“ (keine vererbten Freigaben).', 'ok');
      log('Nächster Schritt: „Verbindung prüfen“, dann „Einstellungen in Google Drive speichern“.');
      toast('Angelegt 🎉');
    } catch (err) {
      setBusy(btn, false);
      log(err.message || String(err), 'err');
      if (err.code === 'scope' || err.status === 403) {
        log('Vermutlich fehlt eine Berechtigung oder eine Google-API ist im Cloud-Projekt nicht aktiviert (siehe Schritt 1).', 'err');
      }
      showError(err);
    }
  }

  /** Private Konfiguration in Google Drive speichern (E43): eigene Datei, für die Domain nur lesbar */
  async function savePrivate(btn) {
    const box = el.querySelector('#private-result');
    const before = String(config.privateConfigId || '').trim();
    setBusy(btn, true, 'Wird gespeichert …');
    try {
      const drive = await import('../google/drive.js');
      const { savePrivateConfig } = await import('../lib/konfiguration.js');
      // Die Datei eines anderen Admins ändert die App nicht (Schreibschutz) – dann nur auf Wunsch eine neue anlegen
      const cur = before ? await drive.getFile(before, 'id,ownedByMe,owners(emailAddress)').catch(() => null) : null;
      if (cur && !cur.ownedByMe && !(await confirmDialog(`Die bisherige Datei gehört ${cur.owners?.[0]?.emailAddress || 'einem anderen Konto'} – nur dieses Konto kann sie über die App ändern. Stattdessen eine neue Datei in deinem Drive anlegen? Deren ID muss dann in das öffentliche config.js.`,
        { title: 'Neue Datei anlegen?', ok: 'Neue Datei anlegen' }))) return;
      const res = await savePrivateConfig(privateConfigObject(), { owner: me.email });
      // ab jetzt gilt die Datei in Drive – die lokalen Werte der Einrichtung für diese Einstellungen braucht es nicht mehr
      clearOverrideKeys(PRIVATE_WRITE_KEYS);
      if (res.id !== before) saveOverride({ privateConfigId: res.id });
      showCfg();
      setHtml(el.querySelector('#private-info'), privateInfo());
      setHtml(el.querySelector('#pub-actions'), pubActions());
      setHtml(box, notice('green', res.neu ? 'In Google Drive angelegt' : 'In Google Drive gespeichert', html`<a href="${res.url}" target="_blank" rel="noopener">config_private.json in Drive öffnen</a>.
        ${res.id !== before ? html` <strong>Neue Datei:</strong> Ihre ID muss einmal als <code>privateConfigId</code> in das öffentliche config.js (der Download unten enthält sie schon). Bis dahin gilt sie nur in diesem Browser.`
          : ' Alle Mitglieder bekommen die Änderungen beim nächsten Öffnen der App.'}
        ${res.warnings.length ? html`<br><span class="small">Hinweise: ${res.warnings.join(' ')}</span>` : ''}`));
      toast('Gespeichert');
    } catch (err) {
      setHtml(box, notice('red', 'Nicht gespeichert', err.message || String(err)));
    } finally {
      setBusy(btn, false);
    }
  }

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const cp = t.closest('[data-copy]');
    if (cp) { copyText(cp.dataset.copy); return; }
    const a = t.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'end-demo':
        app.endDemo();
        break;
      case 'login':
        try {
          auth.clearSilentAttempt();
          auth.login({ returnTo: '#/einrichtung', selectAccount: true });
        } catch (err) { showError(err); }
        break;
      case 'create': {
        const missing = missingResources();
        if (!missing.length) return;
        if (!(await confirmDialog(`Jetzt neu in deinem Google-Konto anlegen: ${labelsOf(missing).join(', ')}? Bereits verbundene Dateien werden nicht verändert.`, { title: 'Fehlendes neu anlegen', ok: 'Anlegen' }))) return;
        // die zusätzliche Berechtigung „Kalender verwalten“ nur, wenn ein Kalender neu angelegt wird
        if (missing.includes('kalender') && !auth.hasScope(auth.SCOPES.setup[0])) {
          auth.login({ extraScopes: auth.SCOPES.setup, returnTo: '#/einrichtung?anlegen=1' });
          return;
        }
        runCreate();
        break;
      }
      case 'create-gruppen':
        runCreate({ nurGruppen: true });
        break;
      case 'check': {
        const box = el.querySelector('#check');
        setHtml(box, html`<div class="center-load"><span class="spinner"></span></div>`);
        try {
          const { checkSetup } = await import('../lib/setup.js');
          const checks = await checkSetup();
          const bad = checks.filter((c) => !c.ok).length;
          const warn = checks.filter((c) => c.ok && c.warn?.length).length;
          setHtml(box, html`
            <p class="small" style="margin:0 0 .625rem"><strong>${bad ? `${bad} Fehler` : 'Keine Fehler'}${warn ? ` · ${warn} mit Hinweisen (gelb)` : ''}.</strong> Die Prüfung liest nur – sie ändert nichts.</p>
            <div class="list">${checks.map(checkCard)}</div>`);
        } catch (err) {
          setHtml(box, notice('red', 'Prüfung fehlgeschlagen', err.message));
        }
        break;
      }
      case 'download-config':
      case 'copy-config':
        if (!String(config.privateConfigId || '').trim()) {
          toast('Zuerst „Einstellungen in Google Drive speichern“ – sonst fehlt die ID der privaten Datei.', { type: 'err', timeout: 6000 });
          break;
        }
        if (a.dataset.action === 'copy-config') copyText(cfgText());
        else downloadFile('config.js', cfgText(), 'text/javascript');
        break;
      case 'download-private':
        downloadFile('config_private.json', privateConfigContent(), 'application/json');
        break;
      case 'save-private':
        savePrivate(a);
        break;
      default:
    }
  });

  // Nach der zusätzlichen Berechtigung automatisch weitermachen
  if (query.anlegen && google && auth.hasScope(auth.SCOPES.setup[0]) && missingResources().length && app.isAdmin()) {
    history.replaceState(null, '', '#/einrichtung');
    runCreate();
  }
}

export { appBaseUrl };
