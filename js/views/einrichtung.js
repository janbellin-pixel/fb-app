// Einrichtungs-Assistent für Admins: Google-Zugang, Anmeldung, Daten anlegen, config.js erzeugen
import { html, setHtml, icon, hero, notice, toast, showError, copyText, setBusy, formData, confirmDialog } from '../ui.js';
import { config, saveOverride, currentBaseUrl, appBaseUrl, configFileContent, isGoogleConfigured, isConfigured } from '../config.js';
import * as auth from '../auth.js';
import { downloadFile } from '../lib/export.js';
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

export default async function einrichtung(ctx) {
  const { el, app, query } = ctx;
  const google = app.mode === 'google';
  const demo = app.mode === 'demo';
  const me = app.user;
  const hasSetupScope = auth.hasScope(auth.SCOPES.setup[0]);
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
          : html`<p class="small">Melde dich mit dem Konto an, in dem Kalender, Tabellen und Zeitungsordner liegen sollen.</p>
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
            <div class="field"><label for="o-group">Mitglieder-Gruppe (optional)</label>
              <input class="input" id="o-group" name="mitgliederGruppe" placeholder="z. B. mitglieder@frankonia-brunonia.de" value="${config.mitgliederGruppe}">
              <span class="hint">Google-Gruppe aller Mitglieder: wird zu Terminen eingeladen und bekommt die Freigaben.</span></div>
            <div class="field"><label for="o-test">Test-Mitglieder (optional)</label>
              <input class="input" id="o-test" name="testMitglieder" placeholder="freund@gmail.com, zweitkonto@gmail.com" value="${(config.testMitglieder || []).join(', ')}">
              <span class="hint">Für den Prototyp ohne Gruppe: diese Konten bekommen Zugriff und Einladungen.</span></div>
            <div class="field"><label for="o-admins">Admins</label>
              <input class="input" id="o-admins" name="admins" placeholder="deine@adresse.de" value="${(config.admins || []).join(', ') || me?.email || ''}">
              <span class="hint">Nur Admins sehen diese Einrichtungsseite.</span></div>
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
        ${resourcesDone ? html`<p class="small">Alles ist eingetragen. Unten kannst du die Verbindung prüfen.</p>` : ''}
        <div class="grid-2">
          <div>
            <h4 style="margin:.25rem 0 .375rem">A) Neu anlegen <span class="badge badge-green">für den Start</span></h4>
            ${resourcesDone ? html`<p class="small muted">Schon eingerichtet. Aus Sicherheitsgründen legt die App nur dann etwas an, solange noch keine Daten eingetragen sind.</p>` : html`
            <p class="small muted">Legt <strong>neue</strong> Dateien in deinem eigenen Google Drive an: einen Ordner mit den Tabellen „Adressverzeichnis“ und „News“, die Ordner „Verbindungszeitung“ und „Galerie“, einen neuen Google-Kalender und – außerhalb davon – die vertrauliche Einwilligungsliste. Mitglieder bekommen überall <strong>nur Leserechte</strong>, die Einwilligungsliste sehen nur die Verantwortlichen. Vorhandene Daten werden nicht angefasst.</p>
            <label class="checkbox small" style="margin-bottom:.375rem"><input type="checkbox" id="c-samples" checked> Beispieldaten eintragen (Termine, News, Adressen)</label>
            <label class="checkbox small" style="margin-bottom:.375rem"><input type="checkbox" id="c-issues" checked> Drei Beispielausgaben der Zeitung hochladen</label>
            <label class="checkbox small" style="margin-bottom:.75rem"><input type="checkbox" id="c-photos" checked> Beispielbilder für die Galerie hochladen</label>
            <button class="btn btn-primary" data-action="create" ${google ? '' : 'disabled'}>${icon('sparkle', 'icon-sm')}Neu anlegen</button>
            ${google && !hasSetupScope ? html`<p class="tiny muted">Google fragt dafür einmal nach der zusätzlichen Berechtigung „Kalender verwalten“.</p>` : ''}`}
          </div>
          <form id="manual-form" novalidate>
            <h4 style="margin:.25rem 0 .375rem">B) Vorhandene verbinden</h4>
            <p class="small muted">Links oder IDs bestehender Dateien einfügen.</p>
            <div class="field"><label for="m-cal">Kalender-ID</label><input class="input" id="m-cal" name="kalenderId" value="${config.kalenderId}" placeholder="…@group.calendar.google.com"></div>
            <div class="field"><label for="m-adr">Tabelle Adressverzeichnis</label><input class="input" id="m-adr" name="adressen" value="${config.tabellen?.adressen}" placeholder="https://docs.google.com/spreadsheets/d/…"></div>
            <div class="field"><label for="m-news">Tabelle News</label><input class="input" id="m-news" name="news" value="${config.tabellen?.news}"></div>
            <div class="field"><label for="m-z">Ordner Verbindungszeitung</label><input class="input" id="m-z" name="zeitung" value="${config.zeitungOrdnerId}" placeholder="https://drive.google.com/drive/folders/…"></div>
            <div class="field"><label for="m-g">Ordner Galerie (Fotos, Unterordner = Alben)</label><input class="input" id="m-g" name="galerie" value="${config.galerieOrdnerId}" placeholder="https://drive.google.com/drive/folders/…"></div>
            <div class="field"><label for="m-ew">Tabelle Einwilligungen (vertraulich, optional)</label><input class="input" id="m-ew" name="einwilligungen" value="${config.tabellen?.einwilligungen}" placeholder="wird unter Datenschutz angelegt">
              <span class="hint">Nur eine Tabelle, die die App selbst angelegt hat (Mehr → Datenschutz → Einwilligungen aller Mitglieder).</span></div>
            <button class="btn" type="submit">Übernehmen</button>
          </form>
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
    appUrl: config.appUrl,
    kalenderId: config.kalenderId,
    tabellen: config.tabellen,
    zeitungOrdnerId: config.zeitungOrdnerId,
    galerieOrdnerId: config.galerieOrdnerId,
    testMitglieder: config.testMitglieder,
    adressaenderung: config.adressaenderung,
    datenschutz: config.datenschutz,
  });
  const showCfg = () => { el.querySelector('#cfg').textContent = cfgText(); };
  showCfg();

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
      appUrl: d.appUrl,
      adressaenderung: d.adressaenderung.trim().toLowerCase(),
      datenschutz,
    });
    // leere Werte bewusst übernehmen
    Object.assign(config, {
      workspaceDomain: d.workspaceDomain.toLowerCase().replace(/^@/, ''),
      mitgliederGruppe: d.mitgliederGruppe.toLowerCase(),
      testMitglieder: list(d.testMitglieder),
      datenschutz,
    });
    showCfg();
    toast('Optionen gespeichert');
  });

  el.querySelector('#manual-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { idFromUrl } = await import('../lib/setup.js');
    const d = formData(e.target);
    saveOverride({
      kalenderId: idFromUrl(d.kalenderId),
      tabellen: { adressen: idFromUrl(d.adressen), news: idFromUrl(d.news), einwilligungen: idFromUrl(d.einwilligungen) },
      zeitungOrdnerId: idFromUrl(d.zeitung),
      galerieOrdnerId: idFromUrl(d.galerie),
    });
    showCfg();
    toast('Übernommen – jetzt „Verbindung prüfen“');
  });

  async function runCreate() {
    const btn = el.querySelector('[data-action=create]');
    setBusy(btn, true, 'Wird angelegt …');
    logEl.innerHTML = '';
    try {
      const { createEverything } = await import('../lib/setup.js');
      saveOverride({ appUrl: config.appUrl || currentBaseUrl() });
      const res = await createEverything({
        withSamples: el.querySelector('#c-samples').checked,
        withIssues: el.querySelector('#c-issues').checked,
        withPhotos: el.querySelector('#c-photos').checked,
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
        galerieOrdnerId: res.galerieOrdnerId,
        admins: config.admins?.length ? config.admins : [me.email],
      });
      await app.clearCache();
      showCfg();
      log(`Alles liegt in Google Drive im Ordner „${config.appName} – Mitglieder-App“.`, 'ok');
      toast('Einrichtung abgeschlossen 🎉');
      setBusy(btn, false);
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
      case 'create':
        if (resourcesDone) return;
        if (!(await confirmDialog('Jetzt neue Dateien und einen neuen Kalender in deinem Google-Konto anlegen? Vorhandene Daten werden nicht verändert.', { title: 'Neu anlegen', ok: 'Anlegen' }))) return;
        if (!auth.hasScope(auth.SCOPES.setup[0])) {
          auth.login({ extraScopes: auth.SCOPES.setup, returnTo: '#/einrichtung?anlegen=1' });
          return;
        }
        runCreate();
        break;
      case 'check': {
        const box = el.querySelector('#check');
        setHtml(box, html`<div class="center-load"><span class="spinner"></span></div>`);
        try {
          const { checkSetup } = await import('../lib/setup.js');
          const checks = await checkSetup();
          setHtml(box, html`<div class="list">${checks.map((c) => html`
            <div class="notice ${c.ok ? 'notice-green' : 'notice-red'}">${icon(c.ok ? 'check' : 'alert')}<div><h3>${c.label}</h3><p class="small">${c.detail}</p></div></div>`)}</div>`);
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
  if (query.anlegen && google && auth.hasScope(auth.SCOPES.setup[0]) && !resourcesDone && app.isAdmin()) {
    history.replaceState(null, '', '#/einrichtung');
    runCreate();
  }
}

export { appBaseUrl };
