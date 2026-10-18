// Leseansicht mit Umblätter-Animation für PDFs und Bilder – gemeinsam für den Bundesboten (E11)
// und die Liedermappe (E31). Immer EINE Seite; Inhalt (PDF-Lesezeichen) und „Zu Seite …“ bei
// längeren Dateien; auf Wunsch bleibt der Bildschirm an (Wake Lock, beim Singen).
import { html, setHtml, icon, errorBox, toast, loadScript, isIos } from '../ui.js';
import { matchesQuery } from '../lib/text.js';

const PDFJS = new URL('../../vendor/pdfjs/pdf.min.mjs', import.meta.url).href;
const PDFJS_WORKER = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const PDFJS_FONTS = new URL('../../vendor/pdfjs/standard_fonts/', import.meta.url).href;
const PAGEFLIP = new URL('../../vendor/page-flip/page-flip.browser.js', import.meta.url).href;

let pdfjsPromise = null;
export function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS).then((m) => {
      m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return m;
    }).catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

export async function openPdf(data) {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({
    data,
    standardFontDataUrl: PDFJS_FONTS,
    isEvalSupported: false,
    disableAutoFetch: true,
  }).promise;
}

export function closePdf(pdf) {
  try {
    const task = pdf?.loadingTask;
    if (task?.destroy) task.destroy().catch(() => {});
    else pdf?.destroy?.();
  } catch { /* egal */ }
}

/** Ab diesem Seitenverhältnis (Breite : Höhe) gilt eine PDF-Seite als Doppelseite */
export const SPREAD_RATIO = 1.25;
export const isSpread = (vp) => vp.width >= vp.height * SPREAD_RATIO;

/**
 * Leseseiten aus den PDF-Seiten. Der Leser zeigt immer EINE Seite (E11): Querformat-Seiten sind
 * meist gescannte Doppelseiten und werden in linke („L“) und rechte („R“) Hälfte geteilt.
 * Ist schon die erste PDF-Seite eine Doppelseite (Umschlag: Rückseite | Titel), kommt der Titel
 * zuerst und die Rückseite ans Ende.
 */
export async function layoutPages(pdf) {
  const out = [];
  let back = null;
  for (let p = 1; p <= pdf.numPages; p++) {
    const vp = (await pdf.getPage(p)).getViewport({ scale: 1 });
    if (!isSpread(vp)) {
      out.push({ p, part: 'F', w: vp.width, h: vp.height });
    } else if (p === 1 && pdf.numPages > 1) {
      out.push({ p, part: 'R', w: vp.width / 2, h: vp.height });
      back = { p, part: 'L', w: vp.width / 2, h: vp.height };
    } else {
      out.push({ p, part: 'L', w: vp.width / 2, h: vp.height }, { p, part: 'R', w: vp.width / 2, h: vp.height });
    }
  }
  if (back) out.push(back);
  return out;
}

/** Ganze PDF-Seite („F“) oder eine Hälfte einer Doppelseite („L“/„R“) in der gewünschten Breite zeichnen */
export async function drawPart(page, part, width) {
  const vp = page.getViewport({ scale: 1 });
  const w = part === 'F' ? vp.width : vp.width / 2;
  const scale = width / w;
  const viewport = page.getViewport({ scale, offsetX: part === 'R' ? -w * scale : 0 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(vp.height * scale);
  const c2d = canvas.getContext('2d');
  c2d.fillStyle = '#fff';
  c2d.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: c2d, canvas, viewport }).promise;
  return canvas;
}

const toJpeg = (canvas) => new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));

/* ===================================================================== Seitenquellen */

/**
 * Seiten aus einem PDF. split = Querformat-Seiten als Doppelseiten teilen (Bundesbote);
 * sonst bleibt jede PDF-Seite ganz (Noten im Querformat dürfen nicht zerschnitten werden).
 */
async function pdfSource(data, { split }) {
  const pdf = await openPdf(data);
  let pages;
  if (split) {
    pages = await layoutPages(pdf);
  } else {
    // große Liederbücher: nicht jede Seite vorab öffnen – die erste gibt das Format vor
    const vp = (await pdf.getPage(1)).getViewport({ scale: 1 });
    pages = Array.from({ length: pdf.numPages }, (_, i) => ({ p: i + 1, part: 'F', w: vp.width, h: vp.height }));
  }
  return {
    pdf,
    pages,
    async render(i, width) {
      const canvas = await drawPart(await pdf.getPage(pages[i].p), pages[i].part, width);
      return { blob: await toJpeg(canvas), width: canvas.width };
    },
    /** Lesezeichen des PDFs als Inhaltsverzeichnis: [{ title, level, index }] (index = Leseseite) */
    async outline() {
      const items = await pdf.getOutline().catch(() => null);
      if (!items?.length) return [];
      const out = [];
      const walk = async (list, level) => {
        for (const it of list) {
          if (out.length >= 800) return;
          try {
            const dest = typeof it.dest === 'string' ? await pdf.getDestination(it.dest) : it.dest;
            const ref = Array.isArray(dest) ? dest[0] : null;
            const pageIndex = ref == null ? null : typeof ref === 'number' ? ref : await pdf.getPageIndex(ref);
            const index = pageIndex == null ? -1 : pages.findIndex((x) => x.p === pageIndex + 1);
            if (index >= 0 && String(it.title || '').trim()) out.push({ title: String(it.title).trim(), level, index });
          } catch { /* Ziel nicht auflösbar */ }
          if (it.items?.length && level < 2) await walk(it.items, level + 1);
        }
      };
      await walk(items, 0);
      return out;
    },
    close() { closePdf(pdf); },
  };
}

/** Ein Bild (z. B. ein Scan) als einzige Seite */
async function imageSource(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    return {
      pages: [{ p: 1, part: 'F', w: img.naturalWidth || 1, h: img.naturalHeight || 1 }],
      async render() { return { blob, width: Infinity }; },
      async outline() { return []; },
      close() {},
    };
  } catch {
    throw new Error('Dieses Bild kann der Browser nicht anzeigen. Über „Datei öffnen“ geht es in Google Drive.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ===================================================================== Leser */

/**
 * Leseansicht öffnen. Liefert die Aufräumfunktion für den Router. opts:
 *   label, heading     – Name für Screenreader und vorläufige Überschrift
 *   back               – Ziel von „Schließen“ und Escape (z. B. '#/zeitung')
 *   loading, downloading, openLabel – Texte
 *   find()             – async: der Eintrag (wirft mit status 404, wenn es ihn nicht gibt)
 *   title(item), openUrl(item), load(item, onProgress) → ArrayBuffer, isImage(item)
 *   split              – Querformat-Seiten als Doppelseiten teilen (nur Bundesbote)
 *   hardCover          – erste und letzte Seite als feste Umschlagseiten
 *   keepAwake          – Bildschirm anlassen, solange der Leser offen ist (Liedermappe)
 *   onOpen(item, src)  – nach dem Öffnen (z. B. Titelbild merken)
 */
export async function openReader(ctx, opts) {
  const { el, app } = ctx;
  document.body.classList.add('reader-open');
  const canFullscreen = !!document.documentElement.requestFullscreen && !isIos();
  const openLabel = opts.openLabel || 'Datei öffnen';
  setHtml(el, html`
    <div class="reader" role="dialog" aria-label="${opts.label}">
      <div class="reader-bar">
        <a class="btn btn-on-dark btn-icon btn-sm" href="${opts.back}" data-back aria-label="Schließen">${icon('x')}</a>
        <h1 id="r-title">${opts.heading || ''}</h1>
        <button class="btn btn-on-dark btn-icon btn-sm hidden" data-action="toc" title="Inhalt und Seiten" aria-label="Inhalt und Seiten">${icon('list')}</button>
        <button class="btn btn-on-dark btn-icon btn-sm" data-action="zoom" title="Seite vergrößern" aria-label="Seite vergrößern" disabled>${icon('zoom')}</button>
        <a class="btn btn-on-dark btn-icon btn-sm" id="r-open" target="_blank" rel="noopener" title="${openLabel}" aria-label="${openLabel}">${icon('download')}</a>
        ${canFullscreen ? html`<button class="btn btn-on-dark btn-icon btn-sm" data-action="fullscreen" title="Vollbild" aria-label="Vollbild">${icon('maximize')}</button>` : ''}
      </div>
      <div class="reader-stage" id="stage">
        <div class="reader-progress"><i id="prog"></i></div>
        <div class="reader-loading" id="r-loading"><span class="spinner"></span><span id="r-status">${opts.loading || 'Wird geladen …'}</span></div>
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
  let src = null;
  let destroyed = false;
  const rendered = new Map(); // Seitenindex → { url, width }
  let queue = Promise.resolve();
  let n = 0;
  let wake = null;

  const cleanup = () => {
    destroyed = true;
    document.body.classList.remove('reader-open');
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('resize', onResize);
    try { flip?.destroy(); } catch { /* egal */ }
    for (const r of rendered.values()) URL.revokeObjectURL(r.url);
    src?.close();
    wake?.release?.().catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };

  // Bildschirm anlassen (z. B. beim Singen); der Browser gibt die Sperre beim Wegschalten frei
  async function keepAwake() {
    if (!opts.keepAwake || destroyed || document.visibilityState !== 'visible' || (wake && !wake.released)) return;
    try {
      wake = await navigator.wakeLock?.request('screen');
      if (destroyed) wake?.release?.().catch(() => {});
    } catch { /* nicht unterstützt oder abgelehnt */ }
  }
  function onVisible() { keepAwake(); }
  document.addEventListener('visibilitychange', onVisible);
  keepAwake();

  let item;
  try {
    item = await opts.find();
    if (destroyed) return cleanup;
    el.querySelector('#r-title').textContent = opts.title(item);
    el.querySelector('#r-open').href = opts.openUrl(item);
    prog.style.width = '15%';
    const image = !!opts.isImage?.(item);
    const [data] = await Promise.all([
      opts.load(item, () => { status.textContent = opts.downloading || 'Wird heruntergeladen …'; }),
      image ? null : loadPdfJs(),
    ]);
    if (destroyed) return cleanup;
    prog.style.width = '55%';
    status.textContent = 'Seiten werden vorbereitet …';
    src = image ? await imageSource(new Blob([data], { type: item.mimeType || 'image/jpeg' })) : await pdfSource(data, { split: !!opts.split });
    n = src.pages.length;
    if (n > 1) await loadScript(PAGEFLIP);
  } catch (err) {
    console.error(err);
    if (!destroyed) {
      setHtml(stage, html`<div style="max-width:32.5rem">${errorBox(err)}</div>`);
      stage.addEventListener('click', (e) => { if (e.target.closest('[data-action=retry]')) app.refresh(); });
    }
    return cleanup;
  }
  if (destroyed || !ctx.alive()) return cleanup;

  const first = src.pages[0];
  const ratio = first.h / first.w;
  prog.style.width = '80%';

  // Seiten-Gerüst anlegen; Inhalte werden nach Bedarf gerendert
  const book = document.createElement('div');
  book.className = 'reader-book';
  // innerhalb der seitlichen Schutzabstände bleiben (Kameraaussparung bei Handys im Querformat)
  book.style.cssText = 'position:absolute;top:14px;bottom:14px;left:calc(10px + env(safe-area-inset-left, 0px));right:calc(10px + env(safe-area-inset-right, 0px));';
  setHtml(stage, html`<div class="reader-progress"><i style="width:100%;opacity:0;transition:opacity .6s"></i></div>`);
  stage.appendChild(book);

  // eine einzige Seite: ohne Umblättern. Ganz eingepasst – außer die Fläche ist viel breiter als
  // das Blatt (Handy quer, Computer): dann auf Breite und senkrecht scrollen, damit Noten lesbar bleiben
  const fitWidth = () => {
    if (n !== 1) return;
    const containW = Math.min(book.clientWidth, book.clientHeight / ratio);
    book.classList.toggle('reader-scroll', containW < book.clientWidth * 0.6);
  };
  if (n === 1) {
    book.classList.add('reader-single');
    book.innerHTML = '<div class="pg"><div class="ph">Seite 1</div></div>';
    fitWidth();
  } else {
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'flip-page';
      p.dataset.density = opts.hardCover && (i === 0 || i === n - 1) ? 'hard' : 'soft';
      p.innerHTML = `<div class="pg"><div class="ph">Seite ${i + 1}</div></div>`;
      book.appendChild(p);
    }
    const baseW = 600;
    flip = new window.St.PageFlip(book, {
      width: baseW,
      height: Math.round(baseW * ratio),
      size: 'stretch',
      minWidth: 180,
      maxWidth: 1400,
      minHeight: 250,
      maxHeight: 2000,
      showCover: !!opts.hardCover,
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
  }

  const current = () => (flip ? flip.getCurrentPageIndex() : 0);
  const pageEls = () => book.querySelectorAll('.flip-page');
  const host = (i) => (flip ? pageEls()[i]?.querySelector('.pg') : book.querySelector('.pg'));
  const pageWidth = () => {
    if (!flip && book.classList.contains('reader-scroll')) return Math.min(book.clientWidth, 960);
    if (!flip) return Math.min(book.clientWidth, book.clientHeight / ratio) || 400;
    try { return flip.getBoundsRect?.().pageWidth || pageEls()[0].offsetWidth; } catch { return pageEls()[0]?.offsetWidth || 400; }
  };

  async function renderPage(i) {
    if (i < 0 || i >= n || destroyed) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const target = Math.round(Math.max(300, pageWidth() * dpr));
    const have = rendered.get(i);
    if (have && have.width >= target * 0.8) return;
    const { blob, width } = await src.render(i, Math.min(target, 2600));
    if (!blob || destroyed) return;
    const url = URL.createObjectURL(blob);
    const old = rendered.get(i);
    rendered.set(i, { url, width });
    const h = host(i);
    if (h) h.innerHTML = `<img src="${url}" alt="Seite ${i + 1}" draggable="false">`;
    if (old) setTimeout(() => URL.revokeObjectURL(old.url), 1500);
    // Speicher sparen: weit entfernte Seiten wieder freigeben
    const cur = current();
    for (const [k, r] of rendered) {
      if (Math.abs(k - cur) > 8) {
        URL.revokeObjectURL(r.url);
        rendered.delete(k);
        const hk = host(k);
        if (hk) hk.innerHTML = `<div class="ph">Seite ${k + 1}</div>`;
      }
    }
  }

  function schedule() {
    const cur = current();
    const order = [cur, cur + 1, cur + 2, cur - 1, cur + 3, cur - 2, cur + 4];
    for (const i of order) queue = queue.then(() => renderPage(i)).catch((e) => console.warn(e));
  }

  const counter = el.querySelector('#count');
  function update() {
    const cur = current();
    counter.textContent = `Seite ${cur + 1} von ${n}`;
    el.querySelector('[data-action=prev]').disabled = cur <= 0;
    el.querySelector('[data-action=next]').disabled = cur >= n - 1;
    el.querySelector('[data-action=zoom]').disabled = false;
    schedule();
  }

  function goTo(i) {
    if (!flip) return;
    flip.turnToPage(Math.max(0, Math.min(n - 1, i)));
    update();
  }

  flip?.on('flip', update);
  update();
  // Größe nach dem ersten Zeichnen noch einmal messen (Layout kann sich gesetzt haben)
  requestAnimationFrame(() => setTimeout(() => { try { flip?.update(); } catch { /* egal */ } update(); }, 60));

  opts.onOpen?.(item, src);

  // Inhalt (Lesezeichen) und „Zu Seite …“ – lohnt sich bei längeren Dateien
  const entries = await src.outline().catch(() => []);
  if (destroyed) return cleanup;
  if (n > 3 || entries.length) el.querySelector('[data-action=toc]').classList.remove('hidden');

  if (n > 1) {
    const hint = document.createElement('div');
    hint.className = 'reader-hint';
    hint.textContent = matchMedia('(pointer: coarse)').matches ? 'Wischen oder an der Ecke ziehen zum Umblättern' : 'Pfeiltasten, Klick auf die Seite oder an der Ecke ziehen';
    stage.appendChild(hint);
    setTimeout(() => { hint.style.opacity = '0'; }, 3500);
    setTimeout(() => hint.remove(), 4500);
  }

  function closeToc() {
    el.querySelector('.reader-toc')?.remove();
    el.querySelector('[data-action=toc]')?.focus();
  }

  function showToc() {
    if (el.querySelector('.reader-toc')) return;
    const box = document.createElement('div');
    box.className = 'reader-toc';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Inhalt und Seiten');
    const list = (q) => html`${entries.filter((e) => matchesQuery(e.title, q)).map((e) => html`
      <li><button type="button" data-index="${e.index}" style="padding-left:${0.25 + e.level * 1.125}rem"><span>${e.title}</span><span class="no">${e.index + 1}</span></button></li>`)}`;
    setHtml(box, html`
      <div class="reader-toc-head">
        <h2>${entries.length ? 'Inhalt' : 'Seite wählen'}</h2>
        <button class="btn btn-on-dark btn-icon btn-sm" data-close aria-label="Schließen">${icon('x')}</button>
      </div>
      <div class="reader-toc-body">
        <form class="reader-goto" novalidate>
          <label for="r-page">Zu Seite</label>
          <input class="input" id="r-page" type="number" inputmode="numeric" min="1" max="${n}" value="${current() + 1}">
          <span class="small">von ${n}</span>
          <button class="btn btn-sm btn-green" type="submit">Los</button>
        </form>
        ${entries.length > 8 ? html`<div class="search" style="margin-bottom:.75rem">${icon('search')}<input class="input" type="search" id="r-toc-q" placeholder="Im Inhalt suchen …" aria-label="Im Inhalt suchen" autocomplete="off"></div>` : ''}
        ${entries.length ? html`<ol class="reader-toc-list" id="r-toc-list">${list('')}</ol>` : ''}
      </div>`);
    el.querySelector('.reader').appendChild(box);
    box.querySelector('[data-close]').addEventListener('click', closeToc);
    box.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = parseInt(box.querySelector('#r-page').value, 10);
      if (!(v >= 1 && v <= n)) { toast(`Bitte eine Seite von 1 bis ${n} eingeben`, { type: 'err' }); return; }
      closeToc();
      goTo(v - 1);
    });
    box.querySelector('#r-toc-q')?.addEventListener('input', (e) => setHtml(box.querySelector('#r-toc-list'), list(e.target.value)));
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-index]');
      if (!b) return;
      closeToc();
      goTo(+b.dataset.index);
    });
    (box.querySelector('#r-toc-q') || box.querySelector('[data-close]')).focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      if (el.querySelector('.reader-toc')) closeToc();
      else if (!document.querySelector('.zoom-view')) app.navigate(opts.back);
      return;
    }
    if (e.target.closest?.('input, textarea, select') || el.querySelector('.reader-toc') || !flip) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') flip.flipNext();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') flip.flipPrev();
  }
  document.addEventListener('keydown', onKey);

  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { try { flip?.update(); } catch { /* egal */ } fitWidth(); schedule(); }, 250);
  }
  window.addEventListener('resize', onResize);

  async function zoom() {
    const i = current();
    const view = document.createElement('div');
    view.className = 'zoom-view';
    view.innerHTML = `<button class="btn btn-primary btn-icon close" aria-label="Schließen"><svg class="icon" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button><div class="center-load" style="color:#fff"><span class="spinner"></span></div>`;
    document.body.appendChild(view);
    let url = '';
    const close = () => { if (url) URL.revokeObjectURL(url); view.remove(); };
    view.querySelector('.close').addEventListener('click', close);
    const width = Math.min(2400, Math.round(Math.max(window.innerWidth, 800) * Math.min(window.devicePixelRatio || 1, 2) * 1.6));
    const { blob } = await src.render(i, width);
    if (!view.isConnected) return;
    url = URL.createObjectURL(blob);
    view.querySelector('.center-load').remove();
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Vergrößerte Seite';
    img.style.marginBottom = '12px';
    view.appendChild(img);
  }

  el.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-action=next]')) flip?.flipNext();
    else if (t.closest('[data-action=prev]')) flip?.flipPrev();
    else if (t.closest('[data-action=toc]')) showToc();
    else if (t.closest('[data-action=zoom]')) zoom().catch((err) => toast(err.message, { type: 'err' }));
    else if (t.closest('[data-action=fullscreen]')) {
      if (document.fullscreenElement) document.exitFullscreen();
      else el.querySelector('.reader').requestFullscreen?.().catch(() => {});
    }
  });

  return cleanup;
}
