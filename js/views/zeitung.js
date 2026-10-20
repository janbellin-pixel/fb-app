// Zeitungen als PDF-Archiv: Bundesbote (Zeitung der Verbindung, E11) und DS-Zeitung (Deutsche Sängerschaft, E38).
// Gleiche Ansicht, eigene Texte, Route und Ordner; Leseansicht mit Umblättern in reader.js
import { html, setHtml, icon, hero, skeletonList, emptyState, errorBox } from '../ui.js';
import { fDateShort } from '../lib/dates.js';
import { kv } from '../lib/store.js';
import { config } from '../config.js';
import { issueCover } from './parts.js';
import { openReader, openPdf, closePdf, drawPart, isSpread } from './reader.js';

/** Texte, Route und Ordner je Zeitung (quelle wie in ZEITUNGEN, backend/common.js) */
const ZEITUNG = {
  bundesbote: {
    quelle: 'bundesbote', route: 'zeitung', key: 'issues', titel: 'Bundesbote', untertitel: 'Alle Ausgaben zum Durchblättern', icon: 'paper',
    ordner: () => config.zeitungOrdnerId,
    leer: 'Sobald die erste Ausgabe als PDF im Ordner des Bundesboten liegt, erscheint sie hier.',
    hinweis: 'Neue Ausgaben erscheinen automatisch, sobald die Redaktion das PDF in den Ordner des Bundesboten legt. Dateiname am besten nach dem Muster „2026-2 Titel.pdf“ (Jahr-Nummer).',
  },
  ds: {
    quelle: 'ds', route: 'ds-zeitung', key: 'dsIssues', titel: 'DS-Zeitung', untertitel: 'Zeitung der Deutschen Sängerschaft', icon: 'newspaper',
    ordner: () => config.dsZeitungOrdnerId,
    leer: 'Sobald die erste Ausgabe als PDF im Ordner der DS-Zeitung liegt, erscheint sie hier.',
    hinweis: 'Neue Ausgaben erscheinen automatisch, sobald das PDF im Ordner der DS-Zeitung liegt. Dateiname am besten nach dem Muster „2026-2 DS-Zeitung.pdf“ (Jahr-Nummer).',
  },
};

const coverKey = (issue) => `cover:${issue.id}:${issue.version || ''}`;

async function renderCover(pdf, issue) {
  const page = await pdf.getPage(1);
  const canvas = await drawPart(page, isSpread(page.getViewport({ scale: 1 })) ? 'R' : 'F', 420);
  const url = canvas.toDataURL('image/jpeg', 0.82);
  await kv.set(coverKey(issue), url);
  return url;
}

function formatSize(bytes) {
  if (!bytes) return '';
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.round(bytes / 1e3)} kB`;
}

/* ===================================================================== Archiv */

export default (ctx) => archiv(ctx, ZEITUNG.bundesbote);
export const ds = (ctx) => archiv(ctx, ZEITUNG.ds);

async function archiv(ctx, z) {
  const { el, app } = ctx;
  const b = app.backend;
  const ordner = z.ordner();
  const folderUrl = ordner && app.mode === 'google' ? `https://drive.google.com/drive/folders/${ordner}` : '';
  setHtml(el, html`
    ${hero(z.titel, z.untertitel, folderUrl ? html`<a class="btn" href="${folderUrl}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Ordner in Google Drive</a>` : '')}
    <div id="c">${skeletonList(2)}</div>`);
  const c = el.querySelector('#c');
  let issues = [];

  async function render() {
    const covers = await Promise.all(issues.map(async (i) => (await kv.get(coverKey(i))) || (i.thumbnail ? i.thumbnail.replace(/=s\d+$/, '=s600') : '')));
    if (!ctx.alive()) return;
    const [latest, ...older] = issues;
    setHtml(c, html`
      <div class="card issue-feature">
        <a class="issue" href="#/${z.route}/${encodeURIComponent(latest.id)}">${issueCover(latest, covers[0])}</a>
        <div>
          <span class="badge badge-green">Neueste Ausgabe</span>
          <h2 style="margin-top:.625rem">${latest.title}</h2>
          <p class="muted">${[latest.ausgabe, latest.date ? `erschienen ${fDateShort(latest.date)}` : '', formatSize(latest.size)].filter(Boolean).join(' · ')}</p>
          <div class="row wrap">
            <a class="btn btn-primary btn-lg" href="#/${z.route}/${encodeURIComponent(latest.id)}">${icon(z.icon, 'icon-sm')}Jetzt lesen</a>
            <a class="btn btn-lg" href="${b.issueOpenUrl(latest)}" target="_blank" rel="noopener">${icon('download', 'icon-sm')}PDF</a>
          </div>
        </div>
      </div>
      ${older.length ? html`
        <h2 class="month-label">Archiv</h2>
        <div class="issues-grid">${older.map((i, k) => html`
          <a class="issue" href="#/${z.route}/${encodeURIComponent(i.id)}">
            ${issueCover(i, covers[k + 1])}
            <span class="title">${i.title}</span>
            <span class="sub">${i.ausgabe || (i.date ? fDateShort(i.date) : '')}</span>
          </a>`)}</div>` : ''}
      <p class="small muted" style="margin-top:1.375rem">${icon('info', 'icon-sm')} ${z.hinweis}</p>`);
  }

  // Im Demo-Modus Titelseiten selbst erzeugen (lokale Dateien, geht schnell)
  async function makeDemoCovers() {
    let changed = false;
    for (const i of issues) {
      if (await kv.get(coverKey(i))) continue;
      try {
        const pdf = await openPdf(await b.loadIssue(i));
        await renderCover(pdf, i);
        closePdf(pdf);
        changed = true;
      } catch (e) { console.warn('Cover nicht erzeugt', e); }
    }
    if (changed && ctx.alive()) render();
  }

  try {
    await app.load(z.key, () => b.listIssues(z.quelle), (list) => {
      issues = list;
      if (!ctx.alive()) return;
      if (!issues.length) {
        setHtml(c, html`<div class="card">${emptyState(z.icon, 'Noch keine Ausgaben', z.leer)}</div>`);
        return;
      }
      render();
      if (app.mode === 'demo') makeDemoCovers();
    }, { maxAge: 15 * 60_000 });
  } catch (err) {
    if (!issues.length) setHtml(c, errorBox(err));
  }
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=retry]')) app.refresh();
    if (e.target.closest('[data-action=relogin]')) app.relogin();
  });
}

/* ===================================================================== Leser */

export const reader = (ctx) => leser(ctx, ZEITUNG.bundesbote);
export const dsReader = (ctx) => leser(ctx, ZEITUNG.ds);

async function leser(ctx, z) {
  const { app, params } = ctx;
  const b = app.backend;
  return openReader(ctx, {
    label: `${z.titel} lesen`,
    heading: z.titel,
    back: `#/${z.route}`,
    loading: 'Ausgabe wird geladen …',
    downloading: 'PDF wird heruntergeladen …',
    openLabel: 'PDF öffnen',
    split: true,
    hardCover: true,
    async find() {
      // zuerst die zwischengespeicherte Liste (klappt auch offline), sonst frisch laden
      let list = null;
      await app.load(z.key, () => b.listIssues(z.quelle), (l) => { list = l; }, { maxAge: 15 * 60_000 }).catch((e) => { if (!list) throw e; });
      const issue = list.find((i) => i.id === params.id) || (await b.listIssues(z.quelle)).find((i) => i.id === params.id);
      if (!issue) throw Object.assign(new Error('Diese Ausgabe wurde nicht gefunden.'), { status: 404 });
      return issue;
    },
    title: (issue) => [issue.title, issue.ausgabe].filter(Boolean).join(' · '),
    openUrl: (issue) => b.issueOpenUrl(issue),
    load: (issue, onProgress) => b.loadIssue(issue, onProgress),
    // Titelseite für das Archiv merken
    onOpen: (issue, src) => { kv.get(coverKey(issue)).then((hit) => { if (!hit) renderCover(src.pdf, issue).catch(() => {}); }); },
  });
}
