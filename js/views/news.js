// Neuigkeiten: Übersicht, Artikel und – für Admins und die Redaktion – News schreiben.
// News aus der App sind eigene Dateien der Verfasser (wie im Forum, E29). Die Tabelle „News“ wird nur gelesen.
import {
  html, setHtml, icon, hero, backLink, avatar, skeletonList, emptyState, errorBox, loading, shareLink,
  toast, showError, setBusy, formData, confirmDialog, notice,
} from '../ui.js';
import { markdown } from '../lib/text.js';
import { fDateLong, fDateShort } from '../lib/dates.js';
import { appBaseUrl, config } from '../config.js';
import { local } from '../lib/store.js';
import { newsCard, memberMap, personFor } from './parts.js';

const MAX_TEXT = 4000;

export default async function news(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  let items = [];
  let cat = 'Alle';
  const canWrite = await b.canEditNews().catch(() => false);
  if (!ctx.alive()) return;
  setHtml(el, html`
    ${hero('Neuigkeiten', 'Aus dem Bundesleben', canWrite ? html`<a class="btn btn-primary" href="#/news-neu">${icon('plus', 'icon-sm')}News schreiben</a>` : '')}
    <div class="chips" id="cats"></div>
    <div id="c">${skeletonList(3)}</div>
    ${canWrite ? html`<p class="small muted" style="margin-top:1.25rem">${icon('info', 'icon-sm')} Für die Redaktion: News schreibst du hier mit „News schreiben“. Sie liegen wie Forumsbeiträge in deinem eigenen Google Drive; ändern und löschen kannst nur du.${b.newsSheetUrl() ? html` Meldungen aus der <a href="${b.newsSheetUrl()}" target="_blank" rel="noopener">Google-Tabelle „News“</a> erscheinen weiterhin.` : ''}</p>` : ''}`);
  const c = el.querySelector('#c');

  async function render() {
    const cats = [...new Set(items.map((n) => n.category).filter(Boolean))];
    setHtml(el.querySelector('#cats'), cats.length > 1 ? html`
      <button class="chip" data-cat="Alle" aria-pressed="${cat === 'Alle'}">Alle</button>
      ${cats.map((x) => html`<button class="chip" data-cat="${x}" aria-pressed="${cat === x}">${x}</button>`)}` : '');
    const list = items.filter((n) => cat === 'Alle' || n.category === cat);
    if (!list.length) {
      setHtml(c, html`<div class="card">${emptyState('news', 'Noch keine Neuigkeiten', 'Sobald die Redaktion etwas veröffentlicht, erscheint es hier.')}
        ${canWrite ? html`<p style="text-align:center;margin:0 0 1.25rem"><a class="btn btn-primary" href="#/news-neu">${icon('plus', 'icon-sm')}Erste News schreiben</a></p>` : ''}</div>`);
      return;
    }
    const urls = await Promise.all(list.map((n) => b.imageUrl(n.image).catch(() => '')));
    if (!ctx.alive()) return;
    setHtml(c, html`<div class="news-grid three">${list.map((n, i) => newsCard(n, urls[i]))}</div>`);
  }

  el.addEventListener('click', (e) => {
    const ch = e.target.closest('[data-cat]');
    if (ch) { cat = ch.dataset.cat; render(); }
    if (e.target.closest('[data-action=retry]')) app.refresh();
    if (e.target.closest('[data-action=relogin]')) app.relogin();
  });

  try {
    await app.load('news', () => b.listNews(), (d) => { items = d; if (ctx.alive()) render(); }, { maxAge: 5 * 60_000 });
  } catch (err) {
    if (!items.length) setHtml(c, errorBox(err));
  }
}

export async function detail(ctx) {
  const { el, app, params } = ctx;
  const b = app.backend;
  setHtml(el, html`${backLink('#/news', 'Alle Neuigkeiten')}<div id="c">${loading()}</div>`);
  const c = el.querySelector('#c');
  let item;
  let members = new Map();
  try {
    const [list, mem] = await Promise.all([b.listNews(), b.listMembers().catch(() => [])]);
    item = list.find((n) => n.id === params.id);
    members = memberMap(mem);
  } catch (err) {
    setHtml(c, errorBox(err));
    return;
  }
  if (!ctx.alive()) return;
  if (!item) {
    setHtml(c, html`<div class="card" style="margin-top:1rem">${emptyState('news', 'Meldung nicht gefunden', 'Vielleicht wurde sie gelöscht.')}</div>`);
    return;
  }
  const img = await b.imageUrl(item.image).catch(() => '');
  const author = personFor(item.authorEmail, members, item.authorName);
  setHtml(c, html`
    ${hero(item.title, `${fDateLong(item.date)}${item.category ? ` · ${item.category}` : ''}`)}
    <article class="card card-pad" style="max-width:51.25rem">
      ${img ? html`<img class="news-hero-img" src="${img}" alt="" referrerpolicy="no-referrer">` : ''}
      <div class="prose">${markdown(item.text)}</div>
      <hr>
      <div class="row between wrap">
        <a class="row" style="color:inherit;text-decoration:none" href="${author.email ? `#/mitglied/${encodeURIComponent(author.email)}` : '#/mitglieder'}">
          ${avatar(author, 40)}<div><div style="font-weight:650">${author.name}</div><div class="small muted">${fDateShort(item.date)}${item.edited ? ' · bearbeitet' : ''}</div></div>
        </a>
        <div class="row wrap" style="gap:.5rem">
          ${item.own ? html`
            <a class="btn btn-sm" href="#/news-bearbeiten/${encodeURIComponent(item.id)}">${icon('edit', 'icon-sm')}Bearbeiten</a>
            <button class="btn btn-sm btn-danger" data-action="delete">${icon('trash', 'icon-sm')}Löschen</button>` : ''}
          <button class="btn btn-sm" data-action="share">${icon('share', 'icon-sm')}Teilen</button>
        </div>
      </div>
    </article>`);
  c.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action=share]')) {
      await shareLink(item.title, `${appBaseUrl()}#/news/${encodeURIComponent(item.id)}`);
    }
    const del = e.target.closest('[data-action=delete]');
    if (del && item.own) {
      if (!(await confirmDialog('Diese News löschen? Sie verschwindet für alle Mitglieder.', { title: 'News löschen', ok: 'Löschen', danger: true }))) return;
      setBusy(del, true, 'Wird gelöscht …');
      try {
        await b.deleteNews(item.id);
        await app.forget('news');
        toast('News gelöscht');
        app.navigate('#/news', { replace: true });
      } catch (err) {
        setBusy(del, false);
        showError(err);
      }
    }
  });
}

/** News schreiben (#/news-neu) oder eigene News bearbeiten (#/news-bearbeiten/:id) – nur Admins und Redaktion */
export async function editor(ctx) {
  const { el, app, params } = ctx;
  const b = app.backend;
  const editId = params.id || '';
  const draftKey = 'fb.newsDraft';
  setHtml(el, html`${backLink(editId ? `#/news/${encodeURIComponent(editId)}` : '#/news', editId ? 'Zur News' : 'Alle Neuigkeiten')}<div id="c">${loading()}</div>`);
  const c = el.querySelector('#c');

  let item = null;
  try {
    if (!(await b.canEditNews())) {
      setHtml(c, html`<div style="margin-top:1rem">${notice('gold', 'Nur für die Redaktion', 'News schreiben können die Admins und die Redaktion. Alle anderen lesen sie unter „Neuigkeiten“.')}</div>`);
      return;
    }
    if (editId) {
      item = (await b.listNews()).find((n) => n.id === editId);
      if (!item || !item.own) {
        setHtml(c, html`<div style="margin-top:1rem">${notice('gold', 'Nicht bearbeitbar', 'Bearbeiten kannst du nur News, die du selbst in der App geschrieben hast.')}</div>`);
        return;
      }
    }
  } catch (err) {
    setHtml(c, errorBox(err));
    return;
  }
  if (!ctx.alive()) return;

  const v = item ? { title: item.title, text: item.text, category: item.category, pinned: item.pinned } : local.get(draftKey, {});
  const cats = config.newsKategorien || ['Allgemein'];
  let image = item?.image || '';
  let newFile = null;
  let previewUrl = image ? await b.imageUrl(image).catch(() => '') : '';

  setHtml(c, html`
    ${hero(editId ? 'News bearbeiten' : 'News schreiben', 'Für alle Mitglieder unter „Neuigkeiten“ und auf der Startseite')}
    <form class="card card-pad" id="f" style="max-width:51.25rem" novalidate>
      <div class="field"><label for="n-title">Titel *</label><input class="input" id="n-title" name="title" maxlength="140" required value="${v.title || ''}" placeholder="z. B. Stiftungsfest 2027: Anmeldung offen"></div>
      <div class="form-grid cols-2">
        <div class="field"><label for="n-cat">Kategorie</label><select class="select" id="n-cat" name="category">${cats.map((x) => html`<option ${x === (v.category || cats[0]) ? 'selected' : ''}>${x}</option>`)}</select></div>
        <div class="field"><span class="label">Hervorheben</span><label class="checkbox" style="margin-top:.5rem"><input type="checkbox" id="n-pin" name="pinned" ${v.pinned ? 'checked' : ''}> Oben anheften</label></div>
      </div>
      <div class="field"><label for="n-text">Text</label><textarea class="textarea" id="n-text" name="text" rows="10" maxlength="${MAX_TEXT}" placeholder="Was gibt es Neues? (**fett**, *kursiv*, - Listen, Links)">${v.text || ''}</textarea>
        <span class="hint" id="n-count"></span></div>
      <div class="field">
        <span class="label">Bild (optional)</span>
        <div id="n-img" class="news-edit-img"></div>
        <div class="row wrap" style="gap:.5rem;margin-top:.5rem">
          <label class="btn btn-sm" for="n-file">${icon('image', 'icon-sm')}Bild auswählen</label>
          <input type="file" id="n-file" accept="image/*" class="sr-only">
          <button type="button" class="btn btn-sm btn-ghost hidden" data-action="remove-image">${icon('x', 'icon-sm')}Bild entfernen</button>
        </div>
        <span class="hint">Wird verkleinert und in deinem eigenen Google Drive gespeichert, für die Mitglieder nur lesbar.</span>
      </div>
      <p class="small muted">${icon('shield', 'icon-sm')} Die News wird in deinem eigenen Google Drive gespeichert und für die Mitglieder lesbar freigegeben. Ändern oder löschen kannst nur du.</p>
      <div class="form-actions">
        <a class="btn btn-ghost" href="${editId ? `#/news/${encodeURIComponent(editId)}` : '#/news'}">Abbrechen</a>
        <button class="btn btn-primary" type="submit">${icon('send', 'icon-sm')}${editId ? 'Änderungen speichern' : 'Veröffentlichen'}</button>
      </div>
    </form>`);

  const form = el.querySelector('#f');
  const textEl = form.querySelector('#n-text');
  const countEl = form.querySelector('#n-count');
  const updateCount = () => { countEl.textContent = `${textEl.value.length} von ${MAX_TEXT} Zeichen`; };
  updateCount();

  function renderImage() {
    setHtml(form.querySelector('#n-img'), previewUrl ? html`<img src="${previewUrl}" alt="Vorschau des Bildes">` : '');
    form.querySelector('[data-action=remove-image]').classList.toggle('hidden', !previewUrl);
  }
  renderImage();

  form.addEventListener('input', () => {
    updateCount();
    if (!editId) {
      const d = formData(form);
      local.set(draftKey, { title: d.title, text: textEl.value, category: d.category, pinned: form.querySelector('#n-pin').checked });
    }
  });
  form.querySelector('#n-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Bitte eine Bilddatei wählen', { type: 'err' }); return; }
    newFile = file;
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    renderImage();
  });
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=remove-image]')) {
      newFile = null;
      image = '';
      previewUrl = '';
      form.querySelector('#n-file').value = '';
      renderImage();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    const fields = { title: d.title.trim(), text: textEl.value.trim(), category: d.category, pinned: form.querySelector('#n-pin').checked };
    if (!fields.title) { toast('Bitte einen Titel eingeben', { type: 'err' }); form.querySelector('#n-title').focus(); return; }
    const btn = form.querySelector('[type=submit]');
    setBusy(btn, true, newFile ? 'Bild wird hochgeladen …' : 'Wird gespeichert …');
    try {
      if (newFile) image = await b.uploadNewsImage(newFile);
      fields.image = image;
      let id = editId;
      if (editId) await b.updateNews(editId, fields);
      else id = await b.createNews(fields);
      local.del(draftKey);
      await app.forget('news');
      toast(editId ? 'Änderungen gespeichert' : 'News veröffentlicht');
      app.navigate(`#/news/${encodeURIComponent(id)}`, { replace: true });
    } catch (err) {
      setBusy(btn, false);
      showError(err);
    }
  });

  return () => { if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl); };
}
