// Neuigkeiten: Übersicht und Artikel (nur lesen).
// Die Redaktion pflegt die News direkt in der Google-Tabelle „News“.
import {
  html, setHtml, icon, hero, backLink, avatar, skeletonList, emptyState, errorBox, loading, shareLink,
} from '../ui.js';
import { markdown } from '../lib/text.js';
import { fDateLong, fDateShort } from '../lib/dates.js';
import { appBaseUrl } from '../config.js';
import { newsCard, memberMap, personFor } from './parts.js';

export default async function news(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  let items = [];
  let cat = 'Alle';
  setHtml(el, html`
    ${hero('Neuigkeiten', 'Aus dem Bundesleben')}
    <div class="chips" id="cats"></div>
    <div id="c">${skeletonList(3)}</div>
    ${app.isAdmin() && b.newsSheetUrl() ? html`<p class="small muted" style="margin-top:1.25rem">${icon('info', 'icon-sm')} Für die Redaktion: Neuigkeiten werden direkt in der <a href="${b.newsSheetUrl()}" target="_blank" rel="noopener">Google-Tabelle „News“</a> gepflegt – die App zeigt sie nur an.</p>` : ''}`);
  const c = el.querySelector('#c');

  async function render() {
    const cats = [...new Set(items.map((n) => n.category).filter(Boolean))];
    setHtml(el.querySelector('#cats'), cats.length > 1 ? html`
      <button class="chip" data-cat="Alle" aria-pressed="${cat === 'Alle'}">Alle</button>
      ${cats.map((x) => html`<button class="chip" data-cat="${x}" aria-pressed="${cat === x}">${x}</button>`)}` : '');
    const list = items.filter((n) => cat === 'Alle' || n.category === cat);
    if (!list.length) {
      setHtml(c, html`<div class="card">${emptyState('news', 'Noch keine Neuigkeiten', 'Sobald die Redaktion etwas veröffentlicht, erscheint es hier.')}</div>`);
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
          ${avatar(author, 40)}<div><div style="font-weight:650">${author.name}</div><div class="small muted">${fDateShort(item.date)}</div></div>
        </a>
        <button class="btn btn-sm" data-action="share">${icon('share', 'icon-sm')}Teilen</button>
      </div>
    </article>`);
  c.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action=share]')) {
      await shareLink(item.title, `${appBaseUrl()}#/news/${encodeURIComponent(item.id)}`);
    }
  });
}
