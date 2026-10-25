// Forum: Themen, Beiträge, Antworten.
// Jeder Beitrag liegt als eigene Datei im Google Drive seines Verfassers – ändern und
// löschen kann man deshalb nur eigene Beiträge.
import {
  html, setHtml, icon, hero, backLink, avatar, skeletonList, emptyState, errorBox, loading, toast, showError, confirmDialog,
  formData, setBusy, notice,
} from '../ui.js';
import { markdown, matchesQuery } from '../lib/text.js';
import { relTime, fDateTime } from '../lib/dates.js';
import { config } from '../config.js';
import { threadRow, memberMap, personFor, forumSeen, isUnread, markThreadSeen, initForumSeen } from './parts.js';
import { local } from '../lib/store.js';

export default async function forum(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  let data = null;
  let members = new Map();
  let cat = 'Alle';
  let q = '';
  if (b.forumEnabled && !b.forumEnabled()) {
    setHtml(el, html`${hero('Forum', 'Diskussionen unter Bundesbrüdern')}${notice('gold', 'Forum ausgeschaltet', 'Das Forum ist ausgeschaltet – nutz gern den Chat.')}`);
    return;
  }
  setHtml(el, html`
    ${hero('Forum', 'Diskussionen unter Bundesbrüdern', html`<a class="btn btn-primary" href="#/forum-neu">${icon('plus', 'icon-sm')}Neues Thema</a>`)}
    <div class="search" style="margin-bottom:.625rem">${icon('search')}<input class="input" type="search" id="q" placeholder="Themen durchsuchen …" aria-label="Forum durchsuchen" autocomplete="off"></div>
    <div class="chips" id="cats"></div>
    <div id="c">${skeletonList(5)}</div>`);
  const c = el.querySelector('#c');

  function render() {
    if (!data) return;
    initForumSeen(data.threads);
    const seen = forumSeen();
    const cats = config.forumKategorien || [];
    const used = new Set(data.threads.map((t) => t.category));
    const all = [...cats.filter((x) => used.has(x)), ...[...used].filter((x) => !cats.includes(x))];
    setHtml(el.querySelector('#cats'), html`
      <button class="chip" data-cat="Alle" aria-pressed="${cat === 'Alle'}">Alle <span class="count">${data.threads.length}</span></button>
      ${all.map((x) => html`<button class="chip" data-cat="${x}" aria-pressed="${cat === x}">${x} <span class="count">${data.threads.filter((t) => t.category === x).length}</span></button>`)}`);
    const postsByThread = new Map();
    for (const p of data.posts) postsByThread.set(p.threadId, `${postsByThread.get(p.threadId) || ''} ${p.text}`);
    const list = data.threads.filter((t) => (cat === 'Alle' || t.category === cat)
      && matchesQuery(`${t.title} ${t.authorName} ${postsByThread.get(t.id) || ''}`, q));
    setHtml(c, list.length
      ? html`<div class="list">${list.map((t) => threadRow(t, members, isUnread(t, seen)))}</div>`
      : html`<div class="card">${emptyState('forum', q ? 'Nichts gefunden' : 'Noch keine Themen', q ? `Keine Treffer für „${q}“.` : 'Starte die erste Diskussion!',
        q ? '' : html`<a class="btn btn-primary" href="#/forum-neu">${icon('plus', 'icon-sm')}Neues Thema</a>`)}</div>`);
  }

  el.addEventListener('input', (e) => { if (e.target.id === 'q') { q = e.target.value; render(); } });
  el.addEventListener('click', (e) => {
    const ch = e.target.closest('[data-cat]');
    if (ch) { cat = ch.dataset.cat; render(); }
    if (e.target.closest('[data-action=retry]')) app.refresh();
    if (e.target.closest('[data-action=relogin]')) app.relogin();
  });

  b.listMembers().then((list) => { members = memberMap(list); render(); }).catch(() => {});
  try {
    await app.load('forum', () => b.listForum(), (d) => { data = d; if (ctx.alive()) render(); }, { maxAge: 60_000 });
  } catch (err) {
    if (!data) setHtml(c, errorBox(err));
  }
}

/* ===================================================================== Thema */

export async function thread(ctx) {
  const { el, app, params } = ctx;
  const b = app.backend;
  const me = app.user.email.toLowerCase();
  const draftKey = `fb.forumDraft.${params.id}`;
  setHtml(el, html`${backLink('#/forum', 'Alle Themen')}<div id="c">${loading()}</div>`);
  const c = el.querySelector('#c');
  let t;
  let posts = [];
  let members = new Map();
  let editing = null;

  async function load() {
    const [forumData, mem] = await Promise.all([b.listForum(), b.listMembers().catch(() => [])]);
    members = memberMap(mem);
    t = forumData.threads.find((x) => x.id === params.id);
    posts = forumData.posts.filter((p) => p.threadId === params.id);
  }

  function postHtml(p, i) {
    const author = personFor(p.authorEmail, members, p.authorName);
    const own = p.own ?? p.authorEmail === me;
    const isEditing = editing === p.id;
    return html`<div class="post ${i === 0 ? 'first' : ''}" id="post-${p.id}">
      <a href="#/mitglied/${encodeURIComponent(p.authorEmail)}" aria-hidden="true" tabindex="-1">${avatar(author, 44)}</a>
      <div style="min-width:0">
        <div class="post-head">
          <a class="name" href="#/mitglied/${encodeURIComponent(p.authorEmail)}">${author.name}</a>
          ${author.kneipname ? html`<span class="small muted">v/o ${author.kneipname}</span>` : ''}
          <time datetime="${p.created}" title="${fDateTime(p.created)}">${relTime(p.created)}</time>
          ${p.edited ? html`<span class="tiny muted" title="${fDateTime(p.edited)}">(bearbeitet)</span>` : ''}
        </div>
        ${isEditing ? html`
          <textarea class="textarea" id="edit-text" rows="5">${p.text}</textarea>
          <div class="row" style="justify-content:flex-end;margin-top:.5rem">
            <button class="btn btn-sm btn-ghost" data-action="cancel-edit">Abbrechen</button>
            <button class="btn btn-sm btn-primary" data-action="save-edit" data-id="${p.id}">Speichern</button>
          </div>`
        : html`<div class="post-body">${markdown(p.text)}</div>`}
        ${!isEditing && own ? html`<div class="post-tools">
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${p.id}">${icon('edit', 'icon-sm')}Bearbeiten</button>
          ${i > 0 ? html`<button class="btn btn-ghost btn-sm btn-danger" data-action="delete" data-id="${p.id}">${icon('trash', 'icon-sm')}Löschen</button>` : ''}
        </div>` : ''}
      </div>
    </div>`;
  }

  function render() {
    if (!t) {
      setHtml(c, html`<div class="card" style="margin-top:1rem">${emptyState('forum', 'Thema nicht gefunden', 'Vielleicht wurde es gelöscht.')}</div>`);
      return;
    }
    const ownThread = t.own ?? t.authorEmail === me;
    setHtml(c, html`
      ${hero(t.title, `${t.category} · ${posts.length} ${posts.length === 1 ? 'Beitrag' : 'Beiträge'}`, ownThread ? html`
        <button class="btn btn-sm btn-danger" data-action="delete-thread">${icon('trash', 'icon-sm')}Mein Thema löschen</button>` : '')}
      <div class="card">${posts.map((p, i) => postHtml(p, i))}</div>
      ${t.closed ? html`<div style="margin-top:.875rem">${notice('gold', 'Thema geschlossen', 'Hier kann nicht mehr geantwortet werden.')}</div>` : html`
        <form class="card composer" id="reply" style="margin-top:.875rem">
          <label for="reply-text" class="label">Antworten</label>
          <textarea class="textarea" id="reply-text" rows="4" maxlength="4000" placeholder="Deine Antwort … (**fett**, *kursiv*, Links möglich)">${local.get(draftKey, '')}</textarea>
          <div class="row"><button class="btn btn-primary" type="submit">${icon('send', 'icon-sm')}Antwort senden</button></div>
        </form>`}`);
    markThreadSeen(t.id, t.lastActivity);
  }

  try {
    await load();
  } catch (err) {
    setHtml(c, errorBox(err));
    return;
  }
  if (!ctx.alive()) return;
  render();

  c.addEventListener('input', (e) => { if (e.target.id === 'reply-text') local.set(draftKey, e.target.value); });

  c.addEventListener('submit', async (e) => {
    if (e.target.id !== 'reply') return;
    e.preventDefault();
    const ta = e.target.querySelector('#reply-text');
    const text = ta.value.trim();
    if (!text) return;
    const btn = e.target.querySelector('[type=submit]');
    setBusy(btn, true, 'Wird gesendet …');
    try {
      await b.reply(t.id, text);
      local.del(draftKey);
      await load();
      render();
      toast('Antwort veröffentlicht');
      const last = c.querySelector('.post:last-of-type');
      last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      setBusy(btn, false);
      showError(err);
    }
  });

  c.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const id = a.dataset.id;
    try {
      switch (a.dataset.action) {
        case 'edit':
          editing = id;
          render();
          c.querySelector('#edit-text')?.focus();
          break;
        case 'cancel-edit':
          editing = null;
          render();
          break;
        case 'save-edit': {
          const text = c.querySelector('#edit-text').value.trim();
          if (!text) return;
          setBusy(a, true);
          await b.editPost(id, text);
          editing = null;
          await load();
          render();
          toast('Beitrag gespeichert');
          break;
        }
        case 'delete':
          if (!(await confirmDialog('Diesen Beitrag löschen?', { ok: 'Löschen', danger: true }))) return;
          await b.deletePost(id);
          await load();
          render();
          toast('Beitrag gelöscht');
          break;
        case 'delete-thread':
          if (!(await confirmDialog(`Dein Thema „${t.title}“ löschen? Es verschwindet dann für alle aus dem Forum.`, { ok: 'Löschen', danger: true }))) return;
          await b.deleteThread(t.id);
          toast('Thema gelöscht');
          app.navigate('#/forum', { replace: true });
          break;
        case 'retry':
          app.refresh();
          break;
        default:
      }
    } catch (err) {
      showError(err);
    }
  });
}

/* ===================================================================== Neues Thema */

export async function newThread(ctx) {
  const { el, app, query } = ctx;
  const b = app.backend;
  const draftKey = 'fb.forumNewDraft';
  const draft = local.get(draftKey, {});
  const cats = config.forumKategorien || ['Allgemeines'];
  const preset = query.kategorie && cats.includes(query.kategorie) ? query.kategorie : draft.category || cats[0];
  setHtml(el, html`
    ${backLink('#/forum', 'Alle Themen')}
    ${hero('Neues Thema', 'Eine Frage, eine Idee, eine Diskussion')}
    <form class="card card-pad" id="f" style="max-width:51.25rem" novalidate>
      <div class="form-grid cols-2">
        <div class="field"><label for="t-cat">Kategorie</label><select class="select" id="t-cat" name="category">${cats.map((x) => html`<option ${x === preset ? 'selected' : ''}>${x}</option>`)}</select></div>
      </div>
      <div class="field"><label for="t-title">Titel *</label><input class="input" id="t-title" name="title" maxlength="140" required value="${draft.title || ''}" placeholder="Worum geht es?"></div>
      <div class="field"><label for="t-text">Beitrag *</label><textarea class="textarea" id="t-text" name="text" rows="9" maxlength="4000" placeholder="Schreib deinen Beitrag … (**fett**, *kursiv*, - Listen, Links)">${draft.text || ''}</textarea>
        <span class="hint">Gespeichert in deinem Google Drive; ändern oder löschen kannst nur du.</span></div>
      <div class="form-actions">
        <a class="btn btn-ghost" href="#/forum">Abbrechen</a>
        <button class="btn btn-primary" type="submit">${icon('send', 'icon-sm')}Thema erstellen</button>
      </div>
    </form>`);
  const form = el.querySelector('#f');
  form.addEventListener('input', () => local.set(draftKey, formData(form)));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(form);
    if (!d.title || !d.text) { toast('Bitte Titel und Beitrag ausfüllen', { type: 'err' }); return; }
    const btn = form.querySelector('[type=submit]');
    setBusy(btn, true, 'Wird erstellt …');
    try {
      const id = await b.createThread({ category: d.category, title: d.title, text: form.querySelector('#t-text').value.trim() });
      local.del(draftKey);
      toast('Thema erstellt');
      app.navigate(`#/forum/${encodeURIComponent(id)}`, { replace: true });
    } catch (err) {
      setBusy(btn, false);
      showError(err);
    }
  });
}
