// Datenschutz: Erklärung, eigene Einwilligungen (erteilen/widerrufen) und – für die
// Verantwortlichen – die Übersicht aller Rückmeldungen mit der vertraulichen Sammeltabelle.
import { html, setHtml, icon, hero, notice, toast, showError, setBusy, avatar, backLink, loading, errorBox, emptyState } from '../ui.js';
import {
  dsConfig, einwilligungen, erklaerung, einwilligungHinweis, speicherHinweis, needsDecision, angabenVollstaendig,
  localConsent, setLocalConsent, buildRecord, ja,
} from '../lib/datenschutz.js';
import { fDateShort, toDate, isValid } from '../lib/dates.js';

const when = (iso) => {
  const d = toDate(iso);
  if (!isValid(d)) return '';
  return `${fDateShort(d)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr`;
};

function erklaerungHtml({ open = true } = {}) {
  const ds = dsConfig();
  return html`
    <p class="small muted" style="margin-top:0">Fassung ${ds.fassung}${ds.stand ? html` · Stand ${ds.stand}` : ''}</p>
    ${erklaerung().map((s) => html`<details class="ds-section" ${open ? 'open' : ''}><summary>${s.titel}</summary><div class="ds-body">${s.inhalt}</div></details>`)}`;
}

function consentText(e) {
  return html`<p>${e.text}</p><ul>${e.punkte.map((p) => html`<li>${p}</li>`)}</ul><p class="small muted">Betroffene Daten: ${e.daten}</p>
    ${e.hinweis ? html`<p class="small muted">${e.hinweis}</p>` : ''}`;
}

export default async function datenschutz(ctx) {
  const { el, app, query } = ctx;
  const ds = dsConfig();

  // Ohne Anmeldung: nur die Erklärung (z. B. von der Anmeldeseite aus)
  if (!app.user) {
    setHtml(el, html`
      ${hero('Datenschutz', `Mitglieder-App der ${ds.verein}`)}
      <div class="card card-pad prose ds-erklaerung">${erklaerungHtml()}</div>
      <section class="card card-pad prose" style="margin-top:1rem">
        <h2 class="card-title">Einwilligungen</h2>
        <p class="small">Nach der Anmeldung entscheidest du in der App jeweils mit Ja oder Nein über diese Einwilligungen:</p>
        ${einwilligungen().map((e) => html`<h3>${e.titel}</h3>${consentText(e)}`)}
        <p class="small">${einwilligungHinweis()}</p>
      </section>
      <p style="margin-top:1rem"><a class="btn btn-primary" href="#/">${icon('arrowLeft', 'icon-sm')}Zur Anmeldung</a></p>`);
    return;
  }

  const first = !!query.erstmals;
  const weiter = query.weiter && query.weiter.startsWith('#/') && !query.weiter.startsWith('#/datenschutz') ? query.weiter : '#/';
  const email = app.user.email;
  const b = app.backend;
  let current = localConsent(email);
  // Auf dem Gerät gespeichert, aber der Nachweis in Google Drive fehlt (z. B. Datei gelöscht):
  // dann muss erneut gespeichert werden können – auch mit derselben Auswahl
  let remoteMissing = false;

  setHtml(el, html`
    ${first ? html`
      <section class="hero"><div class="hero-box"><h1>Willkommen!</h1><p>Bevor es losgeht: kurz zum Datenschutz</p></div></section>
      <div class="card card-pad ds-kurz">
        <h2 class="card-title">Kurz gesagt</h2>
        <ul class="ds-points">
          <li>${icon('lock', 'icon-sm')}<span>Deine Daten bleiben im Google-Konto der Verbindung. Keine Werbung, keine Tracker.</span></li>
          <li>${icon('eye', 'icon-sm')}<span>Gemeinsame Daten (Termine, Adressen, Bundesbote, DS-Zeitung, Liedermappe, Fotos) zeigt die App nur an. Ändern kannst du nur deine eigenen Angaben.</span></li>
          <li>${icon('check', 'icon-sm')}<span>Die Angaben unten – zwei Einwilligungen und ob andere dich in der Mitgliederliste sehen – sind freiwillig. Du kannst sie jederzeit unter Mehr → Datenschutz ändern.</span></li>
        </ul>
        <details class="ds-section" style="margin-top:.75rem"><summary>Die ganze Datenschutzerklärung lesen</summary><div class="ds-body prose">${erklaerungHtml({ open: false })}</div></details>
      </div>`
    : hero('Datenschutz', 'Erklärung und deine Einwilligungen')}
    ${!first && app.isAdmin() && !angabenVollstaendig() ? html`<div style="margin-bottom:1rem">${notice('gold', 'Für Admins: Angaben ergänzen', 'Die Datenschutzerklärung ist ein Muster. Bitte unter Einrichtung → Datenschutz den Verein (Verantwortlicher), die Anschrift und eine Kontaktadresse eintragen und den Text vom Vorstand prüfen lassen.',
      html`<p style="margin-top:.5rem"><a class="btn btn-sm" href="#/einrichtung">${icon('tool', 'icon-sm')}Zur Einrichtung</a></p>`)}</div>` : ''}
    <form class="card card-pad" id="consent-form" novalidate>
      <h2 class="card-title">Deine Einwilligungen und Sichtbarkeit</h2>
      <p class="small muted" style="margin-top:0">Bitte entscheide dich bei jedem Punkt für <strong>Ja</strong> oder <strong>Nein</strong>.</p>
      <div id="consent-items"></div>
      <p class="small">${einwilligungHinweis()}</p>
      <p class="small muted">${icon('shield', 'icon-sm')} ${speicherHinweis()}</p>
      <div class="form-actions" style="justify-content:flex-start">
        <button class="btn btn-primary btn-lg" type="submit" disabled>${icon('check', 'icon-sm')}${first ? 'Speichern und weiter' : 'Auswahl speichern'}</button>
      </div>
      <p class="tiny muted" id="consent-status" aria-live="polite"></p>
    </form>
    ${!first ? html`
      <div id="consent-history"></div>
      ${b.isConsentManager?.() ? html`<a class="card card-pad row" href="#/datenschutz/uebersicht" style="margin-top:1rem;gap:.75rem;align-items:center;color:inherit;text-decoration:none">
        ${icon('users')}<div class="grow"><strong>Einwilligungen aller Mitglieder</strong><div class="small muted">Für die Datenschutz-Verantwortlichen: Übersicht und vertrauliche Sammeltabelle</div></div>${icon('chevronRight', 'icon-sm')}</a>` : ''}
      <section class="card card-pad prose ds-erklaerung" style="margin-top:1rem"><h2 class="card-title">Datenschutzerklärung</h2>${erklaerungHtml()}</section>` : ''}`);

  const form = el.querySelector('#consent-form');
  const items = el.querySelector('#consent-items');
  const submit = form.querySelector('[type=submit]');
  const statusEl = el.querySelector('#consent-status');

  function chosen() {
    const out = {};
    for (const e of einwilligungen()) {
      const v = form.elements[e.id]?.value;
      out[e.id] = v === 'ja' ? true : v === 'nein' ? false : undefined;
    }
    return out;
  }

  function renderItems() {
    const valid = current && !needsDecision(current);
    setHtml(items, html`${einwilligungen().map((e) => {
      const cur = current?.[e.id];
      const pre = valid ? cur : undefined; // bei neuer Fassung nichts vorauswählen
      return html`<fieldset class="consent">
        <legend>${e.titel}</legend>
        ${consentText(e)}
        <div class="consent-choice" role="radiogroup" aria-label="${e.titel}">
          <label class="choice yes"><input type="radio" name="${e.id}" value="ja" ${pre === true ? 'checked' : ''}><span>${icon('check', 'icon-sm')}${e.ja || 'Ja, ich willige ein'}</span></label>
          <label class="choice no"><input type="radio" name="${e.id}" value="nein" ${pre === false ? 'checked' : ''}><span>${icon('x', 'icon-sm')}${e.nein || 'Nein'}</span></label>
        </div>
        ${typeof cur === 'boolean' ? html`<p class="tiny muted" style="margin:.5rem 0 0">Bisher: <strong>${ja(cur)}</strong>${current.zeitpunkt ? ` · ${when(current.zeitpunkt)}` : ''}${!valid ? ` · Fassung ${current.fassung} – bitte neu entscheiden` : ''}</p>` : ''}
      </fieldset>`;
    })}`);
    update();
  }

  function update() {
    const c = chosen();
    const complete = Object.values(c).every((v) => typeof v === 'boolean');
    // bei der Abfrage beim ersten Öffnen (first) immer speichern lassen, sonst bliebe man dort hängen
    const changed = first || remoteMissing || !current || needsDecision(current) || einwilligungen().some((e) => current[e.id] !== c[e.id]);
    submit.disabled = !complete || !changed;
    statusEl.textContent = current?.ausstehend ? 'Noch nicht übertragen – wird gespeichert, sobald eine Verbindung besteht.'
      : remoteMissing ? 'Der Nachweis in deinem Google Drive fehlt – bitte deine Auswahl noch einmal speichern.'
        : current && !needsDecision(current) && !changed ? `Gespeichert am ${when(current.zeitpunkt)}.` : '';
  }

  function renderHistory() {
    const box = el.querySelector('#consent-history');
    if (!box) return;
    const list = (current?.verlauf || []).slice().reverse();
    setHtml(box, list.length ? html`
      <details class="card card-pad" style="margin-top:1rem"><summary style="cursor:pointer;font-weight:700">Deine bisherigen Entscheidungen (${list.length})</summary>
        <ul class="ds-history">${list.map((v) => html`<li><strong>${when(v.zeitpunkt)}</strong> – Vereinszwecke: ${ja(v.vereinszwecke)} · ${ds.dachverbandKurz}: ${ja(v.dachverband)}${typeof v.sichtbar === 'boolean' ? ` · sichtbar: ${ja(v.sichtbar)}` : ''} <span class="tiny muted">· Fassung ${v.fassung}${v.geraet ? ` · ${v.geraet}` : ''}</span></li>`)}</ul>
        ${current?.fileId && !String(current.fileId).startsWith('demo') ? html`<p class="small" style="margin-bottom:0"><a href="https://drive.google.com/file/d/${current.fileId}/view" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Nachweis in deinem Google Drive öffnen</a></p>` : ''}
      </details>` : '');
  }

  renderItems();
  renderHistory();
  form.addEventListener('change', update);

  // aktuellen Stand von Google holen (z. B. auf einem anderen Gerät geändert)
  if (!current?.ausstehend) {
    b.getMyConsent().then((rec) => {
      if (!ctx.alive()) return;
      if (!rec) {
        if (current) { remoteMissing = true; update(); }
        return;
      }
      const changedRemote = JSON.stringify(rec.verlauf || []) !== JSON.stringify(current?.verlauf || []);
      current = rec;
      setLocalConsent(email, rec);
      if (changedRemote) { renderItems(); renderHistory(); }
    }).catch(() => {});
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = chosen();
    if (!Object.values(c).every((v) => typeof v === 'boolean')) return;
    setBusy(submit, true, 'Wird gespeichert …');
    const zeitpunkt = new Date().toISOString();
    try {
      const rec = await b.saveMyConsent({ ...c, zeitpunkt });
      current = rec;
      remoteMissing = false;
      setLocalConsent(email, rec);
      app.consentPending = false;
      toast('Danke – deine Auswahl ist gespeichert.');
    } catch (err) {
      if (err.status === 0 || err.reason === 'network' || !navigator.onLine) {
        // offline: Entscheidung merken und beim nächsten Start übertragen
        current = { ...buildRecord(current, { ...c, zeitpunkt }, app.user), ausstehend: true };
        setLocalConsent(email, current);
        app.consentPending = false;
        toast('Gespeichert – wird übertragen, sobald du wieder online bist.', { type: 'info' });
      } else {
        setBusy(submit, false);
        showError(err);
        return;
      }
    }
    if (first) {
      app.navigate(weiter, { replace: true });
      return;
    }
    setBusy(submit, false);
    renderItems();
    renderHistory();
  });
}

/* ===================================================================== Übersicht (Verantwortliche) */

export async function uebersicht(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  const ds = dsConfig();
  setHtml(el, html`${backLink('#/datenschutz', 'Datenschutz')}<div id="c">${loading()}</div>`);
  const c = el.querySelector('#c');
  if (!b.isConsentManager?.()) {
    setHtml(c, html`<div class="card" style="margin-top:1rem">${emptyState('lock', 'Nur für Datenschutz-Verantwortliche', 'Diese Übersicht sehen nur die Admins bzw. die in der Einrichtung eingetragenen Verantwortlichen.')}</div>`);
    return;
  }

  let filter = 'alle';
  let data;
  async function load() {
    const [consents, members, table] = await Promise.all([b.listConsents(), b.listMembers().catch(() => []), b.consentTable().catch(() => null)]);
    const byEmail = new Map(consents.map((x) => [x.email, x]));
    const rows = consents.map((x) => ({ ...x, offen: false }));
    for (const m of members) if (m.email && !byEmail.has(m.email)) rows.push({ email: m.email, name: m.name, photo: m.photo, offen: true });
    const photos = new Map(members.map((m) => [m.email, m.photo]));
    for (const r of rows) r.photo = r.photo || photos.get(r.email) || '';
    rows.sort((x, y) => String(x.name).localeCompare(String(y.name), 'de'));
    data = { rows, table, consents };
  }

  const pill = (v) => (v === true ? html`<span class="pill pill-yes">Ja</span>` : v === false ? html`<span class="pill pill-no">Nein</span>` : html`<span class="pill pill-open">–</span>`);

  function render() {
    const { rows, table, consents } = data;
    const n = (f) => rows.filter(f).length;
    const stats = [
      ['Rückmeldungen', `${consents.length} von ${rows.length}`],
      ['Vereinszwecke: Ja', n((r) => r.vereinszwecke === true)],
      [`${ds.dachverbandKurz}: Ja`, n((r) => r.dachverband === true)],
      ['In der App sichtbar', n((r) => r.sichtbar === true)],
      ['Noch offen', n((r) => r.offen || r.fassung !== ds.fassung)],
    ];
    const filters = {
      alle: ['Alle', () => true],
      offen: ['Offen', (r) => r.offen || r.fassung !== ds.fassung],
      dvja: [`${ds.dachverbandKurz}: Ja`, (r) => r.dachverband === true],
      dvnein: [`${ds.dachverbandKurz}: Nein`, (r) => r.dachverband === false],
      vznein: ['Vereinszwecke: Nein', (r) => r.vereinszwecke === false],
      // wer nicht sichtbar sein möchte – bei Bedarf im Google-Verzeichnis von Hand ausblenden (E40)
      unsichtbar: ['Nicht sichtbar', (r) => r.sichtbar === false],
    };
    const shown = rows.filter(filters[filter][1]);
    setHtml(c, html`
      ${hero('Einwilligungen', 'Übersicht für die Datenschutz-Verantwortlichen')}
      <div class="ds-stats">${stats.map(([k, v]) => html`<div class="card card-pad"><div class="small muted">${k}</div><div class="ds-stat">${v}</div></div>`)}</div>
      <section class="card card-pad" style="margin-top:1rem">
        <h2 class="card-title">Vertrauliche Sammeltabelle</h2>
        ${app.mode === 'demo' ? html`<p class="small muted">Im Demo-Modus gibt es keine Tabelle. Im Echtbetrieb sammelt eine Google-Tabelle im Konto der Verantwortlichen alle Rückmeldungen mit Verlauf und Wortlaut.</p>`
        : table ? html`
          <p class="small">${table.own ? 'Die Tabelle liegt in deinem Google Drive. Die App gleicht sie automatisch ab, wenn du die App öffnest (höchstens alle 15 Minuten).' : html`Die Tabelle führt das Konto <strong>${table.owner?.email || 'der Verantwortlichen'}</strong>. Nur dort kann die App sie aktualisieren – du kannst sie lesen.`}</p>
          <div class="row wrap">
            <a class="btn" href="${table.url}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Tabelle öffnen</a>
            ${table.own ? html`<button class="btn btn-primary" data-action="sync">${icon('refresh', 'icon-sm')}Jetzt abgleichen</button>` : ''}
          </div>
          ${table.own && !table.eingetragen ? html`<p class="tiny muted">Tipp: Die Tabelle in der Einrichtung bei „Tabelle Einwilligungen“ eintragen und config.js neu herunterladen – dann finden auch die anderen Verantwortlichen sie.</p>` : ''}`
        : html`
          <p class="small">Noch keine Tabelle eingerichtet. Sie wird in <strong>deinem</strong> Google Drive angelegt (nicht in einem freigegebenen Ordner) und nur für die Verantwortlichen lesbar freigegeben.</p>
          <button class="btn btn-primary" data-action="create">${icon('plus', 'icon-sm')}Einwilligungsliste anlegen</button>`}
        <p class="tiny muted" id="sync-info" aria-live="polite"></p>
      </section>
      <div class="chips" style="margin-top:1rem" role="group" aria-label="Filter">${Object.entries(filters).map(([k, [label, f]]) => html`<button class="chip" data-filter="${k}" aria-pressed="${k === filter}">${label} <span class="count">${rows.filter(f).length}</span></button>`)}</div>
      <div class="card ds-list">${shown.length ? shown.map((r) => html`
        <div class="ds-row">
          ${avatar(r, 40)}
          <div class="grow" style="min-width:0"><div class="ellipsis"><strong>${r.name}</strong></div><div class="tiny muted ellipsis">${r.email}</div></div>
          <div class="ds-pills">
            <span class="tiny muted">Verein</span>${pill(r.vereinszwecke)}
            <span class="tiny muted">${ds.dachverbandKurz}</span>${pill(r.dachverband)}
            <span class="tiny muted">Sichtbar</span>${pill(r.sichtbar)}
          </div>
          <div class="tiny muted ds-when">${r.offen ? 'keine Rückmeldung' : html`${when(r.zeitpunkt)}${r.fassung !== ds.fassung ? html`<br>ältere Fassung ${r.fassung}` : ''}`}</div>
        </div>`) : html`<div class="card-pad">${emptyState('users', 'Niemand in dieser Auswahl')}</div>`}</div>`);
  }

  try {
    await load();
  } catch (err) {
    setHtml(c, errorBox(err));
    return;
  }
  if (!ctx.alive()) return;
  render();

  c.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; render(); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'retry') { app.refresh(); return; }
    setBusy(a, true, a.dataset.action === 'create' ? 'Wird angelegt …' : 'Wird abgeglichen …');
    try {
      if (a.dataset.action === 'create') await b.createConsentTable();
      const res = await b.syncConsentTable();
      await load();
      render();
      const info = c.querySelector('#sync-info');
      const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      if (info) info.textContent = `Abgeglichen: ${plural(res.rueckmeldungen, 'Rückmeldung', 'Rückmeldungen')}, ${plural(res.neueEintraege, 'neuer Eintrag', 'neue Einträge')} im Verlauf (${res.zeit}).`;
      toast(a.dataset.action === 'create' ? 'Einwilligungsliste angelegt' : 'Tabelle aktualisiert');
    } catch (err) {
      setBusy(a, false);
      showError(err);
    }
  });
}
