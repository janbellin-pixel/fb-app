// Fotogalerie: Fotos aus einem festen Google-Drive-Ordner (nur lesen).
// Unterordner sind Alben; ein Name wie „2026-06 Stiftungsfest“ wird als „Stiftungsfest · Juni 2026“ angezeigt.
// Ansicht „Alben“: alle Alben nebeneinander; „Ordner“: die Ordner darüber als aufklappbare Gruppen (E46).
// Fotos hochladen: Link auf einen eigenen Upload-Ordner in Drive (die App selbst schreibt dort nicht, E46).
import { html, setHtml, icon, hero, backLink, skeletonList, emptyState, errorBox, loading, toast, openModal } from '../ui.js';
import { fDateShort, toDate, isValid } from '../lib/dates.js';
import { local } from '../lib/store.js';

const VIEW_KEY = 'fb.galerieAnsicht';

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function albumInfo(album) {
  const m = String(album.title).match(/^(\d{4})[-_.](\d{1,2})\s+(.+)$/);
  const name = m ? m[3] : album.title;
  // verschachtelte Alben („2023/Stiftungsfest“): übergeordnete Ordner als Zusatz
  const when = m ? `${MONATE[(+m[2] - 1 + 12) % 12]} ${m[1]}` : (album.path || []).join(' › ');
  const n = album.photos.length;
  return { name, when, count: `${n} ${n === 1 ? 'Foto' : 'Fotos'}` };
}

/** Bildunterschrift aus dem Dateinamen: ohne Endung und Nummer; Kameranamen (IMG_2041, DSC01234, PXL_…) entfallen */
export function photoTitle(name) {
  const base = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  if (/^(img|dsc[nf]?|pxl|p|mvimg|photo|bild|foto|wp|whatsapp image|screenshot)[\s_-]*\d/i.test(base) || /^[\d\s_.:-]+$/.test(base)) return '';
  return base.replace(/^\d+[\s._-]+(?=\D)/, '');
}

function thumbImg(b, photo, size, cls = '') {
  return html`<img class="${cls}" src="${b.photoUrl(photo, size)}" alt="${photoTitle(photo.name) || 'Foto'}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-photo="${photo.id}">`;
}

/** Falls ein Vorschaubild nicht lädt: Originalbild über die Anmeldung holen */
function bindImageFallback(root, b, photosById) {
  root.addEventListener('error', async (e) => {
    const img = e.target;
    if (img?.tagName !== 'IMG' || !img.dataset.photo || img.dataset.fallback === '1') return;
    img.dataset.fallback = '1';
    const photo = photosById.get(img.dataset.photo);
    if (!photo) return;
    try { img.src = await b.photoFullUrl(photo); } catch { img.classList.add('broken'); }
  }, true);
}

/** Ordnerbaum aus den Alben (path = übergeordnete Ordner): Knoten { name, album, children } */
export function albumTree(albums) {
  const root = { name: '', album: null, children: new Map() };
  for (const a of albums) {
    let node = root;
    for (const seg of [...(a.path || []), a.title]) {
      if (!node.children.has(seg)) node.children.set(seg, { name: seg, album: null, children: new Map() });
      node = node.children.get(seg);
    }
    node.album = a;
  }
  return root;
}

/** Alle Alben eines Knotens und darunter */
function albumsIn(node) {
  return [...(node.album ? [node.album] : []), ...[...node.children.values()].flatMap(albumsIn)];
}

const fotos = (n) => `${n} ${n === 1 ? 'Foto' : 'Fotos'}`;

function albumCard(b, a, { inFolder = false } = {}) {
  const info = albumInfo(a);
  const covers = a.photos.slice(0, 3);
  // in der Ordneransicht steht der Ordner schon darüber – nur ein Datum aus dem Namen bleibt
  const when = inFolder && !/^\d{4}[-_.]\d{1,2}\s/.test(a.title) ? '' : info.when;
  return html`<a class="card album-card" href="#/galerie/${encodeURIComponent(a.id)}">
    <div class="album-cover ${covers.length > 2 ? 'trio' : ''}">${covers.map((p) => thumbImg(b, p, 600))}</div>
    <div class="album-meta"><div class="title">${info.name}</div><div class="small muted">${[when, info.count].filter(Boolean).join(' · ')}</div></div>
  </a>`;
}

/** Ordneransicht: erst die Unterordner (aufklappbar), dann die Alben dieser Ebene */
function folderLevel(b, node, depth = 0) {
  const kids = [...node.children.values()];
  const folders = kids.filter((k) => k.children.size);
  const albums = [...(depth > 0 && node.album ? [node.album] : []), ...kids.filter((k) => !k.children.size).map((k) => k.album)];
  return html`
    ${folders.map((f) => {
      const inside = albumsIn(f);
      const n = inside.reduce((sum, a) => sum + a.photos.length, 0);
      return html`<details class="folder-group" ${depth === 0 ? 'open' : ''}>
        <summary>${icon('folder', 'icon-sm')}<span class="grow">${f.name}</span><span class="small muted nowrap">${inside.length === 1 ? '1 Album' : `${inside.length} Alben`} · ${fotos(n)}</span>${icon('chevronDown', 'icon-sm chev')}</summary>
        <div class="folder-body">${folderLevel(b, f, depth + 1)}</div>
      </details>`;
    })}
    ${albums.length ? html`<div class="album-grid">${albums.map((a) => albumCard(b, a, { inFolder: depth > 0 }))}</div>` : ''}`;
}

function uploadDialog(url) {
  openModal({
    title: 'Fotos hochladen',
    body: html`<p style="margin-top:0">Lade deine Fotos in den Upload-Ordner in Google Drive: Ordner öffnen, dann „Neu“ bzw. „+“ und „Hochladen“.</p>
      <p class="small muted">Ein Vorstandsmitglied sortiert die Fotos regelmäßig in die Galerie ein.</p>
      <p style="margin-bottom:0"><a class="btn btn-primary" href="${url}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Upload-Ordner öffnen</a></p>`,
    actions: [{ label: 'Schließen', kind: 'ghost' }],
  });
}

export default async function galerie(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  const uploadUrl = b.galleryUploadUrl?.() || '';
  setHtml(el, html`${hero('Galerie', 'Fotos aus dem Bundesleben', uploadUrl ? html`<button class="btn btn-primary" data-action="upload">${icon('upload', 'icon-sm')}Fotos hochladen</button>` : '')}
    <div id="c">${skeletonList(2)}</div>`);
  const c = el.querySelector('#c');
  const photosById = new Map();
  bindImageFallback(c, b, photosById);
  let shown = false;
  let data = null;
  let view = local.get(VIEW_KEY, 'alben') === 'ordner' ? 'ordner' : 'alben';

  function render() {
    if (!data.albums.length) {
      setHtml(c, html`<div class="card">${emptyState('image', 'Noch keine Fotos', 'Sobald Fotos im Galerie-Ordner liegen, erscheinen sie hier.')}</div>`);
      return;
    }
    const nested = data.albums.some((a) => a.path?.length);
    const mode = nested ? view : 'alben';
    setHtml(c, html`
      ${nested ? html`<div class="chips gallery-view" role="group" aria-label="Ansicht">
        <button class="chip" data-view="alben" aria-pressed="${mode === 'alben'}">${icon('grid', 'icon-sm')}Alben</button>
        <button class="chip" data-view="ordner" aria-pressed="${mode === 'ordner'}">${icon('folder', 'icon-sm')}Ordner</button>
      </div>` : ''}
      ${mode === 'ordner' ? folderLevel(b, albumTree(data.albums)) : html`<div class="album-grid">${data.albums.map((a) => albumCard(b, a))}</div>`}
      ${data.folderUrl ? html`<p class="small muted" style="margin-top:1.25rem">${icon('info', 'icon-sm')} Alle Fotos liegen auch im <a href="${data.folderUrl}" target="_blank" rel="noopener">Galerie-Ordner in Google Drive</a>.</p>` : ''}`);
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=upload]')) { uploadDialog(uploadUrl); return; }
    if (e.target.closest('[data-action=retry]')) { app.refresh(); return; }
    const v = e.target.closest('[data-view]');
    if (v && data) {
      view = v.dataset.view;
      local.set(VIEW_KEY, view);
      render();
    }
  });

  try {
    await app.load('gallery', () => b.listGallery(), (d) => {
      if (!ctx.alive()) return;
      shown = true;
      data = d;
      photosById.clear();
      for (const a of d.albums) for (const p of a.photos) photosById.set(p.id, p);
      render();
    }, { maxAge: 15 * 60_000 });
  } catch (err) {
    if (shown) return; // zwischengespeicherte Alben bleiben sichtbar (z. B. offline)
    setHtml(c, errorBox(err));
  }
}

export async function album(ctx) {
  const { el, app, params } = ctx;
  const b = app.backend;
  setHtml(el, html`${backLink('#/galerie', 'Alle Alben')}<div id="c">${loading()}</div>`);
  const c = el.querySelector('#c');
  const photosById = new Map();
  bindImageFallback(c, b, photosById);
  let a = null;
  let info = null;

  function render(data) {
    if (!ctx.alive()) return;
    a = data.albums.find((x) => x.id === params.album) || null;
    if (!a) {
      setHtml(c, html`<div class="card" style="margin-top:1rem">${emptyState('image', 'Album nicht gefunden')}</div>`);
      return;
    }
    info = albumInfo(a);
    photosById.clear();
    for (const p of a.photos) photosById.set(p.id, p);
    setHtml(c, html`
      ${hero(info.name, [info.when, info.count].filter(Boolean).join(' · '))}
      <div class="photo-grid">${a.photos.map((p, i) => html`
        <button class="photo-thumb" data-index="${i}" aria-label="${[`Foto ${i + 1}`, photoTitle(p.name)].filter(Boolean).join(': ')}">${thumbImg(b, p, 500)}</button>`)}</div>`);
  }

  // dieselben (zwischengespeicherten) Daten wie die Albumübersicht; fehlt das Album darin, einmal frisch laden
  try {
    const data = await app.load('gallery', () => b.listGallery(), render, { maxAge: 15 * 60_000 });
    if (!data.albums.some((x) => x.id === params.album)) await app.load('gallery', () => b.listGallery(), render, { force: true });
  } catch (err) {
    if (!a) setHtml(c, errorBox(err));
  }

  let closeLightbox = null;
  c.addEventListener('click', (e) => {
    const t = e.target.closest('[data-index]');
    if (t && a) closeLightbox = openLightbox(b, a, Number(t.dataset.index), info);
  });
  return () => closeLightbox?.();
}

/* ===================================================================== Vollbild */

function openLightbox(b, album, start, info) {
  let index = start;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Foto in groß');
  document.body.appendChild(box);
  document.body.classList.add('lightbox-open');

  function render() {
    const p = album.photos[index];
    const caption = [photoTitle(p.name), p.taken && isValid(toDate(p.taken)) ? fDateShort(p.taken) : ''].filter(Boolean).join(' · ');
    setHtml(box, html`
      <div class="lightbox-bar">
        <button class="btn btn-on-dark btn-icon btn-sm" data-lb="close" aria-label="Schließen">${icon('x')}</button>
        <div class="grow ellipsis"><strong>${info.name}</strong> · ${index + 1} / ${album.photos.length}</div>
        <button class="btn btn-on-dark btn-sm" data-lb="original">${icon('download', 'icon-sm')}Original</button>
      </div>
      <div class="lightbox-stage">
        <button class="lightbox-nav prev" data-lb="prev" aria-label="Vorheriges Foto" ${index === 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
        <img src="${b.photoUrl(p, 1600)}" alt="${photoTitle(p.name) || `Foto ${index + 1}`}" referrerpolicy="no-referrer" data-photo="${p.id}">
        <button class="lightbox-nav next" data-lb="next" aria-label="Nächstes Foto" ${index === album.photos.length - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
      </div>
      <div class="lightbox-caption">${caption}</div>`);
    const img = box.querySelector('img');
    img.addEventListener('error', async () => {
      if (img.dataset.fallback) return;
      img.dataset.fallback = '1';
      try { img.src = await b.photoFullUrl(p); } catch { /* bleibt leer */ }
    });
  }

  const go = (d) => {
    const n = index + d;
    if (n < 0 || n >= album.photos.length) return;
    index = n;
    render();
  };
  const close = () => {
    box.remove();
    document.body.classList.remove('lightbox-open');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  };
  document.addEventListener('keydown', onKey);

  box.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-lb]');
    if (!a) return;
    if (a.dataset.lb === 'close') close();
    if (a.dataset.lb === 'prev') go(-1);
    if (a.dataset.lb === 'next') go(1);
    if (a.dataset.lb === 'original') {
      try {
        const url = await b.photoFullUrl(album.photos[index]);
        window.open(url, '_blank', 'noopener');
      } catch (err) {
        toast(`Original nicht verfügbar: ${err.message}`, { type: 'err' });
      }
    }
  });

  // Wischen auf dem Handy
  let x0 = null;
  box.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  box.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  });

  render();
  return close;
}
