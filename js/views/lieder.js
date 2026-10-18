// Liedermappe: Noten und Liedtexte aus einem Google-Drive-Ordner (nur lesen). Suche nach Titel oder
// Nummer, Rubriken aus Unterordnern, zuletzt geöffnete Lieder, alles auf dem Gerät speichern;
// Leseansicht wie beim Bundesboten, der Bildschirm bleibt beim Singen an (E31)
import { html, setHtml, icon, hero, skeletonList, emptyState, errorBox, toast } from '../ui.js';
import { matchesQuery } from '../lib/text.js';
import { local } from '../lib/store.js';
import { config } from '../config.js';
import { songsGrouped } from '../backend/common.js';
import { openReader } from './reader.js';

const RECENT = 'fb.lieder.zuletzt';
const recentIds = () => {
  const v = local.get(RECENT, []);
  return Array.isArray(v) ? v : [];
};
function remember(id) {
  local.set(RECENT, [id, ...recentIds().filter((x) => x !== id)].slice(0, 8));
}

const mb = (bytes) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`);

/** Gesuchte Liednummer, wenn die Suche nur aus einer Nummer besteht („47“, „Nr. 47“, „047“) */
function numberQuery(query) {
  const m = String(query || '').trim().match(/^(?:nr\.?\s*)?0*(\d{1,4}[a-z]?)$/i);
  return m ? m[1].toLowerCase() : '';
}

/** Passt ein Lied zur Suche? Eine reine Zahl sucht die Liednummer (und Titel mit dieser Zahl). */
export function songMatches(s, query) {
  const q = String(query || '').trim();
  if (!q) return true;
  const nr = numberQuery(q);
  if (nr) return s.nr === nr || matchesQuery(s.title, q);
  return matchesQuery([s.nr && `Nr. ${s.nr}`, s.title, s.category, s.info].filter(Boolean).join(' '), q);
}

/* ===================================================================== Übersicht */

export default async function lieder(ctx) {
  const { el, app, query } = ctx;
  const b = app.backend;
  let q = query.q || '';
  let rubrik = query.rubrik || '';
  let data = null; // { songs, other, folderUrl }
  let offline = new Set();
  let saving = '';
  const folderUrl = app.mode === 'google' && config.liedermappeOrdnerId ? `https://drive.google.com/drive/folders/${config.liedermappeOrdnerId}` : '';
  setHtml(el, html`
    ${hero('Liedermappe', 'Noten und Texte zum Mitsingen', folderUrl ? html`<a class="btn" href="${folderUrl}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Ordner in Google Drive</a>` : '')}
    <div class="search" style="margin-bottom:.625rem">${icon('search')}<input class="input" type="search" id="q" placeholder="Titel oder Nummer …" value="${q}" aria-label="Lieder durchsuchen" autocomplete="off" enterkeyhint="search"></div>
    <div class="chips" id="rubriken"></div>
    <div id="recent"></div>
    <div id="list">${skeletonList(4)}</div>
    <div id="more"></div>`);
  const listEl = el.querySelector('#list');
  const input = el.querySelector('#q');

  // Suche und Rubrik in der Adresse merken: „Zurück“ aus dem Lied landet wieder in derselben Liste
  const keepUrl = () => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (rubrik) p.set('rubrik', rubrik);
    const qs = p.toString();
    history.replaceState(null, '', `${location.pathname}${location.search}#/lieder${qs ? `?${qs}` : ''}`);
  };

  const visible = () => data.songs.filter((s) => (!rubrik || s.category === rubrik) && songMatches(s, q));

  function row(s, sub) {
    return html`<a class="song-row" href="#/lieder/${encodeURIComponent(s.id)}">
      <span class="song-nr">${s.nr}</span>
      <span class="song-text"><span class="song-title">${s.title}</span>${sub ? html`<span class="song-sub">${sub}</span>` : ''}</span>
      ${offline.has(s.id) ? html`<span class="song-off" title="Auf diesem Gerät gespeichert">${icon('check', 'icon-sm')}</span>` : ''}
      ${icon('chevronRight', 'icon-sm chev')}
    </a>`;
  }

  function render() {
    const { songs } = data;
    const cats = [...new Set(songs.map((s) => s.category).filter(Boolean))];
    if (rubrik && !cats.includes(rubrik)) rubrik = '';
    setHtml(el.querySelector('#rubriken'), cats.length > 1 ? html`${['', ...cats].map((c) => html`
      <button class="chip" data-rubrik="${c}" aria-pressed="${rubrik === c}">${c || 'Alle'} <span class="count">${c ? songs.filter((s) => s.category === c).length : songs.length}</span></button>`)}` : '');
    // zuletzt geöffnet – schnell wieder da, z. B. auf der Kneipe
    const byId = new Map(songs.map((s) => [s.id, s]));
    const recent = !q && !rubrik ? recentIds().map((id) => byId.get(id)).filter(Boolean).slice(0, 4) : [];
    setHtml(el.querySelector('#recent'), recent.length ? html`<div class="song-recent"><span class="small muted">Zuletzt:</span>${recent.map((s) => html`
      <a class="chip" href="#/lieder/${encodeURIComponent(s.id)}">${s.nr ? html`<strong>${s.nr}</strong>` : ''}<span class="ellipsis">${s.title}</span></a>`)}</div>` : '');
    if (!songs.length) {
      setHtml(listEl, html`<div class="card">${emptyState('music', 'Noch keine Lieder', 'Sobald Noten als PDF oder Bild im Ordner der Liedermappe liegen, erscheinen sie hier.')}</div>`);
      return;
    }
    const shown = visible();
    if (!shown.length) {
      setHtml(listEl, html`<div class="card">${emptyState('search', 'Kein Lied gefunden', q ? `Nichts zu „${q}“${rubrik ? ` in „${rubrik}“` : ''}.` : '')}</div>`);
      return;
    }
    // Rubriken als Abschnitte, wenn jede Rubrik eigene Nummern hat; sonst eine Liste nach Nummer
    const grouped = songsGrouped(songs) && !rubrik;
    const cls = `card song-list${songs.some((s) => s.nr) ? '' : ' no-nr'}`;
    const parts = [];
    let rows = [];
    let cur = null;
    const flush = () => {
      if (rows.length) parts.push(html`${grouped ? html`<h2 class="month-label">${cur || 'Allgemein'}</h2>` : ''}<div class="${cls}">${rows}</div>`);
      rows = [];
    };
    for (const s of shown) {
      if (grouped && s.category !== cur) {
        flush();
        cur = s.category;
      }
      rows.push(row(s, grouped || rubrik ? s.info : [s.category, s.info].filter(Boolean).join(' · ')));
    }
    flush();
    setHtml(listEl, html`<p class="small muted" style="margin:0 0 .625rem">${shown.length} ${shown.length === 1 ? 'Lied' : 'Lieder'}</p>${parts}`);
  }

  function renderMore() {
    const box = el.querySelector('#more');
    if (!data?.songs.length) { setHtml(box, ''); return; }
    const total = data.songs.length;
    const have = data.songs.filter((s) => offline.has(s.id)).length;
    const missing = data.songs.filter((s) => !offline.has(s.id)).reduce((sum, s) => sum + (s.size || 0), 0);
    setHtml(box, html`
      ${app.mode === 'google' ? html`<div class="card card-pad song-offline">
        ${icon('wifiOff')}
        <div class="grow" style="min-width:0">
          <p class="small" style="margin:0"><strong>${have === total ? `${total === 1 ? 'Das Lied ist' : `Alle ${total} Lieder sind`} auf diesem Gerät` : !have ? 'Noch kein Lied ist auf diesem Gerät gespeichert' : `${have} von ${total} Liedern ${have === 1 ? 'ist' : 'sind'} auf diesem Gerät`}</strong>
            – ${have === total ? 'auch ohne Netz lesbar.' : 'geöffnete Lieder bleiben auch ohne Netz lesbar.'}</p>
          ${have < total ? html`<button class="btn btn-sm" data-action="offline" style="margin-top:.625rem" ${saving ? 'disabled' : ''}>${icon('download', 'icon-sm')}${saving ? `Wird gespeichert … ${saving}` : `Alle Lieder speichern${missing ? ` (${mb(missing)})` : ''}`}</button>` : ''}
        </div>
      </div>` : ''}
      ${data.other && folderUrl ? html`<p class="small muted" style="margin-top:1rem">${icon('info', 'icon-sm')} ${data.other === 1 ? 'Eine weitere Datei' : `${data.other} weitere Dateien`} im Ordner kann die App nicht anzeigen (nur PDFs und Bilder) – <a href="${folderUrl}" target="_blank" rel="noopener">in Google Drive öffnen</a>.</p>` : ''}
      <p class="small muted" style="margin-top:1rem">${icon('info', 'icon-sm')} Neue Lieder erscheinen automatisch, sobald sie im Ordner der Liedermappe liegen. Dateiname am besten mit Liednummer, z. B. „012 Titel.pdf“; Unterordner werden zu Rubriken.</p>`);
  }

  async function saveAll() {
    const todo = data.songs.filter((s) => !offline.has(s.id));
    let failed = 0;
    for (let i = 0; i < todo.length; i++) {
      if (!ctx.alive()) return;
      saving = `${i + 1} von ${todo.length}`;
      renderMore();
      try {
        await b.loadSong(todo[i]);
      } catch {
        failed++;
      }
    }
    saving = '';
    offline = await b.songsOffline(data.songs);
    if (!ctx.alive()) return;
    render();
    renderMore();
    const left = failed || data.songs.length - offline.size;
    if (!left) toast('Alle Lieder sind jetzt auf diesem Gerät – auch ohne Netz.', { timeout: 6000 });
    else toast(`${left === 1 ? 'Ein Lied konnte' : `${left} Lieder konnten`} nicht gespeichert werden${failed ? '' : ' (Speicher voll?)'}.`, { type: 'err', timeout: 6000 });
  }

  input.addEventListener('input', () => {
    q = input.value;
    keepUrl();
    if (data) render();
  });
  // Enter: Lied mit genau dieser Nummer oder den einzigen Treffer direkt öffnen
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !data) return;
    const hits = visible();
    const nr = numberQuery(q);
    const hit = (nr && hits.find((s) => s.nr === nr)) || (hits.length === 1 ? hits[0] : null);
    if (hit) {
      e.preventDefault();
      app.navigate(`#/lieder/${encodeURIComponent(hit.id)}`);
    }
  });

  el.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-rubrik]');
    if (chip) {
      rubrik = chip.dataset.rubrik;
      keepUrl();
      render();
      return;
    }
    if (e.target.closest('[data-action=offline]') && !saving) saveAll().catch((err) => { saving = ''; renderMore(); toast(err.message, { type: 'err' }); });
    if (e.target.closest('[data-action=retry]')) app.refresh();
    if (e.target.closest('[data-action=relogin]')) app.relogin();
  });

  try {
    await app.load('songs', () => b.listSongs(), (d) => {
      data = d;
      if (!ctx.alive()) return;
      render();
      renderMore();
      b.songsOffline(d.songs).then((set) => {
        offline = set;
        if (!ctx.alive() || data !== d) return;
        render();
        renderMore();
      });
    }, { maxAge: 15 * 60_000 });
  } catch (err) {
    if (!data) setHtml(listEl, errorBox(err));
  }
}

/* ===================================================================== Leser */

export async function reader(ctx) {
  const { app, params } = ctx;
  const b = app.backend;
  return openReader(ctx, {
    label: 'Lied aus der Liedermappe',
    heading: 'Liedermappe',
    back: '#/lieder',
    loading: 'Lied wird geladen …',
    downloading: 'Noten werden heruntergeladen …',
    openLabel: 'Datei öffnen',
    keepAwake: true,
    async find() {
      // zuerst die zwischengespeicherte Liste (klappt auch offline), sonst frisch laden
      let data = null;
      await app.load('songs', () => b.listSongs(), (d) => { data = d; }, { maxAge: 15 * 60_000 }).catch((e) => { if (!data) throw e; });
      const song = data.songs.find((s) => s.id === params.id) || (await b.listSongs()).songs.find((s) => s.id === params.id);
      if (!song) throw Object.assign(new Error('Dieses Lied wurde nicht gefunden.'), { status: 404 });
      remember(song.id);
      return song;
    },
    title: (s) => (s.nr ? `Nr. ${s.nr} · ${s.title}` : s.title),
    openUrl: (s) => b.songOpenUrl(s),
    load: (s, onProgress) => b.loadSong(s, onProgress),
    isImage: (s) => s.kind === 'image',
  });
}
