// Einrichtungs-Assistent für Admins: Google-Zugang, Anmeldung, Daten anlegen, config.js erzeugen
import { html, setHtml, icon, hero, notice, toast, showError, copyText, setBusy, formData, confirmDialog } from '../ui.js';
import { config, saveOverride, currentBaseUrl, appBaseUrl, configFileContent, isGoogleConfigured, isConfigured } from '../config.js';
import * as auth from '../auth.js';
import { downloadFile } from '../lib/export.js';
import { RESOURCES, missingResources, idFromUrl } from '../lib/setup.js';
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
  if (!missing.length) return html`<p class="small muted">Es fehlt nichts – alle Datenquellen sind eingetragen. Unten kannst du sie prüfen.</p>`;
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
    ${google && missing.includes('kalender') && !auth.hasScope(auth.SCOPES.setup[0]) ? html`<p class="tiny muted">Für den neuen Kalender fragt Google einmal nach der zusätzlichen Berechtigung „Kalender verwalten“.</p>` : ''}`;
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
          <div class="field"><label for="o-adr">E-Mail für Adressänderungen</label>
            <input class="input" id="o-adr" name="adressaenderung" type="email" value="${config.adressaenderung}" placeholder="z. B. adressaenderung@frankonia-brunonia.de">
            <span class="hint">Weichen die Angaben in „Mein Profil“ vom Adressverzeichnis ab, bereitet die App eine E-Mail an diese Adresse vor. Ohne Umlaute.</span></div>
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
        <p class="small">Damit <strong>alle Mitglieder</strong> die Einstellungen bekommen, muss die Datei <code>config.js</code> der veröffentlichten App ersetzt werden (z. B. im GitHub-Repository). Bis dahin gelten die Einstellungen nur in diesem Browser.</p>
        <div class="row wrap">
          <button class="btn btn-primary" data-action="download-config">${icon('download', 'icon-sm')}config.js herunterladen</button>
          <button class="btn" data-action="copy-config">${icon('copy', 'icon-sm')}Inhalt kopieren</button>
        </div>
        <details style="margin-top:.75rem"><summary class="small" style="cursor:pointer">Vorschau der config.js</summary><pre class="code" id="cfg"></pre></details>
      </section>
    </div>`);

  const logEl = el.querySelector('#log');
  const log = (text, kind = '') => {
    logEl.classList.remove('hidden');
    logEl.insertAdjacentHTML('beforeend', logLine(text, kind).toString());
    logEl.scrollTop = logEl.scrollHeight;
  };
  const cfgText = () => configFileContent({
    googleClientId: config.googleClientId,
    workspaceDomain: config.workspaceDomain,
    mitgliederGruppe: config.mitgliederGruppe,
    admins: config.admins,
    redaktion: config.redaktion,
    appUrl: config.appUrl,
    kalenderId: config.kalenderId,
    tabellen: config.tabellen,
    adressenBlatt: config.adressenBlatt,
    zeitungOrdnerId: config.zeitungOrdnerId,
    liedermappeOrdnerId: config.liedermappeOrdnerId,
    dsZeitungOrdnerId: config.dsZeitungOrdnerId,
    galerieOrdnerId: config.galerieOrdnerId,
    testMitglieder: config.testMitglieder,
    adressaenderung: config.adressaenderung,
    datenschutz: config.datenschutz,
  });
  const showCfg = () => { el.querySelector('#cfg').textContent = cfgText(); };
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
    saveOverride({
      workspaceDomain: d.workspaceDomain.toLowerCase().replace(/^@/, ''),
      mitgliederGruppe: d.mitgliederGruppe.toLowerCase(),
      testMitglieder: list(d.testMitglieder),
      admins: list(d.admins),
      redaktion: list(d.redaktion),
      appUrl: d.appUrl,
      adressaenderung: d.adressaenderung.trim().toLowerCase(),
      datenschutz,
    });
    // leere Werte bewusst übernehmen
    Object.assign(config, {
      workspaceDomain: d.workspaceDomain.toLowerCase().replace(/^@/, ''),
      mitgliederGruppe: d.mitgliederGruppe.toLowerCase(),
      testMitglieder: list(d.testMitglieder),
      redaktion: list(d.redaktion),
      datenschutz,
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
    el.querySelector('#m-ew').value = values.tabellen.einwilligungen;
    app.clearCache().catch(() => {});
    showCfg();
    renderResources();
    toast('Übernommen – jetzt „Verbindung prüfen“');
  });

  async function runCreate() {
    const btn = el.querySelector('[data-action=create]');
    setBusy(btn, true, 'Wird angelegt …');
    logEl.innerHTML = '';
    try {
      const { createMissing } = await import('../lib/setup.js');
      saveOverride({ appUrl: config.appUrl || currentBaseUrl() });
      const res = await createMissing({
        only: missingResources(),
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
      log('Nächster Schritt: „Verbindung prüfen“ und danach die config.js veröffentlichen.');
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
        downloadFile('config.js', cfgText(), 'text/javascript');
        break;
      case 'copy-config':
        copyText(cfgText());
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
