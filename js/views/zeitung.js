// Verbindungszeitung: Archiv aller Ausgaben und Leseansicht mit Umblätter-Animation
import { html, setHtml, icon, hero, skeletonList, emptyState, errorBox, toast, loadScript, isIos } from '../ui.js';
import { fDateShort } from '../lib/dates.js';
import { kv } from '../lib/store.js';
import { config } from '../config.js';
import { issueCover } from './parts.js';

const PDFJS = new URL('../../vendor/pdfjs/pdf.min.mjs', import.meta.url).href;
const PDFJS_WORKER = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const PDFJS_FONTS = new URL('../../vendor/pdfjs/standard_fonts/', import.meta.url).href;
const PAGEFLIP = new URL('../../vendor/page-flip/page-flip.browser.js', import.meta.url).href;

let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS).then((m) => {
      m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return m;
    }).catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

async function openPdf(data) {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({
    data,
    standardFontDataUrl: PDFJS_FONTS,
    isEvalSupported: false,
    disableAutoFetch: true,
  }).promise;
}

function closePdf(pdf) {
  try {
    const task = pdf?.loadingTask;
    if (task?.destroy) task.destroy().catch(() => {});
    else pdf?.destroy?.();
  } catch { /* egal */ }
}

const coverKey = (issue) => `cover:${issue.id}:${issue.version || ''}`;

async function renderCover(pdf, issue) {
  const page = await pdf.getPage(1);
  const vp1 = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 420 / vp1.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport }).promise;
  const url = canvas.toDataURL('image/jpeg', 0.82);
  await kv.set(coverKey(issue), url);
  return url;
}

function formatSize(bytes) {
  if (!bytes) return '';
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.round(bytes / 1e3)} kB`;
}

/* ===================================================================== Archiv */

export default async function zeitung(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  const folderUrl = config.zeitungOrdnerId && app.mode === 'google' ? `https://drive.google.com/drive/folders/${config.zeitungOrdnerId}` : '';
  setHtml(el, html`
    ${hero('Verbindungszeitung', 'Alle Ausgaben zum Durchblättern', folderUrl ? html`<a class="btn" href="${folderUrl}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Ordner in Google Drive</a>` : '')}
    <div id="c">${skeletonList(2)}</div>`);
  const c = el.querySelector('#c');
  let issues = [];

  async function render() {
    const covers = await Promise.all(issues.map(async (i) => (await kv.get(coverKey(i))) || (i.thumbnail ? i.thumbnail.replace(/=s\d+$/, '=s600') : '')));
    if (!ctx.alive()) return;
    const [latest, ...older] = issues;
    setHtml(c, html`
      <div class="card issue-feature">
        <a class="issue" href="#/zeitung/${encodeURIComponent(latest.id)}">${issueCover(latest, covers[0])}</a>
        <div>
          <span class="badge badge-green">Neueste Ausgabe</span>
          <h2 style="margin-top:.625rem">${latest.title}</h2>
          <p class="muted">${[latest.ausgabe, latest.date ? `erschienen ${fDateShort(latest.date)}` : '', formatSize(latest.size)].filter(Boolean).join(' · ')}</p>
          <div class="row wrap">
            <a class="btn btn-primary btn-lg" href="#/zeitung/${encodeURIComponent(latest.id)}">${icon('paper', 'icon-sm')}Jetzt lesen</a>
            <a class="btn btn-lg" href="${b.issueOpenUrl(latest)}" target="_blank" rel="noopener">${icon('download', 'icon-sm')}PDF</a>
          </div>
        </div>
      </div>
      ${older.length ? html`
        <h2 class="month-label">Archiv</h2>
        <div class="issues-grid">${older.map((i, k) => html`
          <a class="issue" href="#/zeitung/${encodeURIComponent(i.id)}">
            ${issueCover(i, covers[k + 1])}
            <span class="title">${i.title}</span>
            <span class="sub">${i.ausgabe || (i.date ? fDateShort(i.date) : '')}</span>
          </a>`)}</div>` : ''}
      <p class="small muted" style="margin-top:1.375rem">${icon('info', 'icon-sm')} Neue Ausgaben erscheinen automatisch, sobald die Redaktion das PDF in den Zeitungsordner legt. Dateiname am besten nach dem Muster „2026-2 Titel.pdf“ (Jahr-Nummer).</p>`);
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
    await app.load('issues', () => b.listIssues(), (list) => {
      issues = list;
      if (!ctx.alive()) return;
      if (!issues.length) {
        setHtml(c, html`<div class="card">${emptyState('paper', 'Noch keine Ausgaben', 'Sobald die erste Ausgabe als PDF im Zeitungsordner liegt, erscheint sie hier.')}</div>`);
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

export async function reader(ctx) {
  const { el, app, params } = ctx;
  const b = app.backend;
  document.body.classList.add('reader-open');
  const canFullscreen = !!document.documentElement.requestFullscreen && !isIos();
  setHtml(el, html`
    <div class="reader" role="dialog" aria-label="Verbindungszeitung lesen">
      <div class="reader-bar">
        <a class="btn btn-on-dark btn-icon btn-sm" href="#/zeitung" data-back aria-label="Schließen">${icon('x')}</a>
        <h1 id="r-title">Verbindungszeitung</h1>
        <button class="btn btn-on-dark btn-icon btn-sm" data-action="zoom" title="Seite vergrößern" aria-label="Seite vergrößern" disabled>${icon('zoom')}</button>
        <a class="btn btn-on-dark btn-icon btn-sm" id="r-open" target="_blank" rel="noopener" title="PDF öffnen" aria-label="PDF öffnen">${icon('download')}</a>
        ${canFullscreen ? html`<button class="btn btn-on-dark btn-icon btn-sm" data-action="fullscreen" title="Vollbild" aria-label="Vollbild">${icon('maximize')}</button>` : ''}
      </div>
      <div class="reader-stage" id="stage">
        <div class="reader-progress"><i id="prog"></i></div>
        <div class="reader-loading" id="r-loading"><span class="spinner"></span><span id="r-status">Ausgabe wird geladen …</span></div>
      </div>
      <div class="reader-foot">
        <button class="btn btn-on-dark btn-icon" data-action="prev" aria-label="Zurückblättern" disabled>${icon('chevronLeft')}</button>
        <span class="count" id="count">–</span>
        <button class="btn btn-on-dark btn-icon" data-action="next" aria-label="Weiterblättern" disabled>${icon('chevronRight')}</button>
      </div>
    </div>`);

  const stage = el.querySelector('#stage');
  const status = el.querySelector('#r-status');
  const prog = el.querySelector('#prog');
  let flip = null;
  let pdf = null;
  let destroyed = false;
  const rendered = new Map(); // Seitenindex → { url, width }
  let queue = Promise.resolve();
  let n = 0;

  const cleanup = () => {
    destroyed = true;
    document.body.classList.remove('reader-open');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    try { flip?.destroy(); } catch { /* egal */ }
    for (const r of rendered.values()) URL.revokeObjectURL(r.url);
    closePdf(pdf);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };

  let issue;
  try {
    // zuerst die zwischengespeicherte Liste (klappt auch offline), sonst frisch laden
    let list = null;
    await app.load('issues', () => b.listIssues(), (l) => { list = l; }, { maxAge: 15 * 60_000 }).catch((e) => { if (!list) throw e; });
    issue = list.find((i) => i.id === params.id);
    if (!issue) issue = (await b.listIssues()).find((i) => i.id === params.id);
    if (!issue) throw Object.assign(new Error('Diese Ausgabe wurde nicht gefunden.'), { status: 404 });
    el.querySelector('#r-title').textContent = [issue.title, issue.ausgabe].filter(Boolean).join(' · ');
    el.querySelector('#r-open').href = b.issueOpenUrl(issue);
    prog.style.width = '15%';
    const [data] = await Promise.all([
      b.loadIssue(issue, () => { status.textContent = 'PDF wird heruntergeladen …'; }),
      loadPdfJs(),
      loadScript(PAGEFLIP),
    ]);
    if (destroyed) return cleanup;
    prog.style.width = '55%';
    status.textContent = 'Seiten werden vorbereitet …';
    pdf = await openPdf(data);
    n = pdf.numPages;
  } catch (err) {
    console.error(err);
    if (!destroyed) {
      setHtml(stage, html`<div style="max-width:32.5rem">${errorBox(err)}</div>`);
      stage.addEventListener('click', (e) => { if (e.target.closest('[data-action=retry]')) app.refresh(); });
    }
    return cleanup;
  }
  if (destroyed || !ctx.alive()) return cleanup;

  const first = await pdf.getPage(1);
  const vp1 = first.getViewport({ scale: 1 });
  const ratio = vp1.height / vp1.width;
  prog.style.width = '80%';

  // Seiten-Gerüst anlegen; Inhalte werden nach Bedarf gerendert
  const book = document.createElement('div');
  book.className = 'reader-book';
  // innerhalb der seitlichen Schutzabstände bleiben (Kameraaussparung bei Handys im Querformat)
  book.style.cssText = 'position:absolute;top:14px;bottom:14px;left:calc(10px + env(safe-area-inset-left, 0px));right:calc(10px + env(safe-area-inset-right, 0px));';
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'flip-page';
    p.dataset.density = i === 0 || i === n - 1 ? 'hard' : 'soft';
    p.innerHTML = `<div class="pg"><div class="ph">Seite ${i + 1}</div></div>`;
    book.appendChild(p);
  }
  setHtml(stage, html`<div class="reader-progress"><i style="width:100%;opacity:0;transition:opacity .6s"></i></div>`);
  stage.appendChild(book);

  const baseW = 600;
  flip = new window.St.PageFlip(book, {
    width: baseW,
    height: Math.round(baseW * ratio),
    size: 'stretch',
    minWidth: 180,
    maxWidth: 1400,
    minHeight: 250,
    maxHeight: 2000,
    showCover: true,
    usePortrait: true,
    autoSize: false,
    drawShadow: true,
    maxShadowOpacity: 0.5,
    flippingTime: 750,
    mobileScrollSupport: false,
    showPageCorners: true,
    swipeDistance: 20,
  });
  flip.loadFromHTML(book.querySelectorAll('.flip-page'));
  // Immer nur EINE Seite, auch quer und auf großen Bildschirmen (Wunsch der Verbindung, E11).
  // StPageFlip kennt dafür keine Einstellung: Hochkant („portrait“) wählt es im Modus „stretch“,
  // solange die Fläche schmaler als 2 × minWidth ist. minWidth wird deshalb nach dem Aufbau
  // hochgesetzt (vorher würde die Bibliothek daraus eine riesige Mindestbreite des Elements machen).
  flip.getSettings().minWidth = 1e6;
  flip.update();

  const pageEls = () => book.querySelectorAll('.flip-page');
  const pageWidth = () => {
    try { return flip.getBoundsRect?.().pageWidth || pageEls()[0].offsetWidth; } catch { return pageEls()[0]?.offsetWidth || 400; }
  };

  async function renderPage(i) {
    if (i < 0 || i >= n || destroyed) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const target = Math.round(Math.max(300, pageWidth() * dpr));
    const have = rendered.get(i);
    if (have && have.width >= target * 0.8) return;
    const page = await pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(target, 2600) / vp.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const c2d = canvas.getContext('2d');
    c2d.fillStyle = '#fff';
    c2d.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: c2d, canvas, viewport }).promise;
    if (destroyed) return;
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (!blob || destroyed) return;
    const url = URL.createObjectURL(blob);
    const old = rendered.get(i);
    rendered.set(i, { url, width: canvas.width });
    const host = pageEls()[i]?.querySelector('.pg');
    if (host) host.innerHTML = `<img src="${url}" alt="Seite ${i + 1}" draggable="false">`;
    if (old) setTimeout(() => URL.revokeObjectURL(old.url), 1500);
    // Speicher sparen: weit entfernte Seiten wieder freigeben
    const cur = flip.getCurrentPageIndex();
    for (const [k, r] of rendered) {
      if (Math.abs(k - cur) > 8) {
        URL.revokeObjectURL(r.url);
        rendered.delete(k);
        const h = pageEls()[k]?.querySelector('.pg');
        if (h) h.innerHTML = `<div class="ph">Seite ${k + 1}</div>`;
      }
    }
  }

  function schedule() {
    const cur = flip.getCurrentPageIndex();
    const order = [cur, cur + 1, cur + 2, cur - 1, cur + 3, cur - 2, cur + 4];
    for (const i of order) queue = queue.then(() => renderPage(i)).catch((e) => console.warn(e));
  }

  const counter = el.querySelector('#count');
  function update() {
    const cur = flip.getCurrentPageIndex();
    counter.textContent = `Seite ${cur + 1} von ${n}`;
    el.querySelector('[data-action=prev]').disabled = cur <= 0;
    el.querySelector('[data-action=next]').disabled = cur >= n - 1;
    el.querySelector('[data-action=zoom]').disabled = false;
    schedule();
  }

  flip.on('flip', update);
  update();
  // Größe nach dem ersten Zeichnen noch einmal messen (Layout kann sich gesetzt haben)
  requestAnimationFrame(() => setTimeout(() => { try { flip.update(); } catch { /* egal */ } update(); }, 60));

  // Titelseite für das Archiv merken
  kv.get(coverKey(issue)).then((hit) => { if (!hit) renderCover(pdf, issue).catch(() => {}); });

  // Hinweis zum Blättern
  const hint = document.createElement('div');
  hint.className = 'reader-hint';
  hint.textContent = matchMedia('(pointer: coarse)').matches ? 'Wischen oder an der Ecke ziehen zum Umblättern' : 'Pfeiltasten, Klick auf die Seite oder an der Ecke ziehen';
  stage.appendChild(hint);
  setTimeout(() => { hint.style.opacity = '0'; }, 3500);
  setTimeout(() => hint.remove(), 4500);

  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') flip.flipNext();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') flip.flipPrev();
    else if (e.key === 'Escape' && !document.querySelector('.zoom-view')) app.navigate('#/zeitung');
  }
  document.addEventListener('keydown', onKey);

  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { try { flip.update(); } catch { /* egal */ } schedule(); }, 250);
  }
  window.addEventListener('resize', onResize);

  async function zoom() {
    const pages = [flip.getCurrentPageIndex()];
    const view = document.createElement('div');
    view.className = 'zoom-view';
    view.innerHTML = `<button class="btn btn-primary btn-icon close" aria-label="Schließen"><svg class="icon" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button><div class="center-load" style="color:#fff"><span class="spinner"></span></div>`;
    document.body.appendChild(view);
    const close = () => { view.querySelectorAll('img').forEach((i) => URL.revokeObjectURL(i.src)); view.remove(); };
    view.querySelector('.close').addEventListener('click', close);
    const width = Math.min(2400, Math.round(Math.max(window.innerWidth, 800) * Math.min(window.devicePixelRatio || 1, 2) * 1.6));
    const urls = [];
    for (const i of pages) {
      const page = await pdf.getPage(i + 1);
      const vp = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / vp.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport }).promise;
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      urls.push(URL.createObjectURL(blob));
    }
    if (!view.isConnected) { urls.forEach((u) => URL.revokeObjectURL(u)); return; }
    view.querySelector('.center-load').remove();
    for (const u of urls) {
      const img = document.createElement('img');
      img.src = u;
      img.alt = 'Vergrößerte Seite';
      img.style.marginBottom = '12px';
      view.appendChild(img);
    }
  }

  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-action=next]')) flip.flipNext();
    else if (t.closest('[data-action=prev]')) flip.flipPrev();
    else if (t.closest('[data-action=zoom]')) zoom().catch((err) => toast(err.message, { type: 'err' }));
    else if (t.closest('[data-action=fullscreen]')) {
      if (document.fullscreenElement) document.exitFullscreen();
      else el.querySelector('.reader').requestFullscreen?.().catch(() => {});
    }
  });

  return cleanup;
}
