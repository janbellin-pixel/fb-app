// Mitgliederverzeichnis und Profilansicht
import { html, setHtml, icon, hero, backLink, avatar, skeletonList, emptyState, errorBox, loading, toast, showError } from '../ui.js';
import { matchesQuery, linkify } from '../lib/text.js';
import { config, statusGroup } from '../config.js';
import { local } from '../lib/store.js';

export function instagramUrl(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^https?:\/\//.test(s)) return s;
  return `https://www.instagram.com/${encodeURIComponent(s.replace(/^@/, ''))}/`;
}

export function linkedinUrl(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^https?:\/\//.test(s)) return s;
  return `https://www.linkedin.com/in/${encodeURIComponent(s.replace(/^@/, ''))}/`;
}

function statusBadge(status) {
  if (!status) return '';
  const g = statusGroup(status);
  const cls = g === 'Aktivitas' ? 'badge-green' : g === 'Ehrenmitglieder' ? 'badge-gold' : status === 'Alter Herr' ? 'badge-black' : '';
  return html`<span class="badge ${cls}">${status}</span>`;
}

export default async function mitglieder(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  let list = [];
  let q = local.get('fb.memberSearch', '');
  let group = 'Alle';

  setHtml(el, html`
    ${hero('Mitglieder', 'Bundesbrüder im Überblick', html`<a class="btn" href="#/profil">${icon('user', 'icon-sm')}Mein Profil bearbeiten</a>`)}
    <div class="search" style="margin-bottom:.625rem">${icon('search')}<input class="input" type="search" id="q" placeholder="Name, Kneipname, Studium, Tätigkeit, Wohnort …" value="${q}" aria-label="Mitglieder durchsuchen" autocomplete="off"></div>
    <div class="chips" id="groups"></div>
    <div id="list">${skeletonList(4)}</div>`);
  const listEl = el.querySelector('#list');
  const ANGEBOTE = 'Angebote für Jüngere';
  const inGroup = (m, g) => g === 'Alle' || (g === ANGEBOTE ? !!m.angebot : statusGroup(m.status) === g);

  function render() {
    const groups = ['Alle', ...Object.keys(config.statusGruppen || {}), ANGEBOTE];
    const counts = Object.fromEntries(groups.map((g) => [g, list.filter((m) => inGroup(m, g)).length]));
    setHtml(el.querySelector('#groups'), html`${groups.filter((g) => g === 'Alle' || counts[g]).map((g) => html`
      <button class="chip" data-group="${g}" aria-pressed="${group === g}">${g === ANGEBOTE ? icon('gift', 'icon-sm') : ''}${g} <span class="count">${counts[g]}</span></button>`)}`);
    const shown = list.filter((m) => inGroup(m, group)
      && matchesQuery([m.name, m.kneipname, m.status, m.studium, m.taetigkeit, m.wohnort, m.aemter, m.angebot, m.email].join(' '), q));
    setHtml(listEl, shown.length
      ? html`<p class="small muted" style="margin:0 0 .625rem">${shown.length} ${shown.length === 1 ? 'Mitglied' : 'Mitglieder'}</p>
        <div class="members-grid">${shown.map((m) => html`
        <a class="card member-card" href="#/mitglied/${encodeURIComponent(m.email)}">
          ${avatar(m, 88)}
          <span class="name">${m.name}</span>
          ${m.kneipname ? html`<span class="vulgo">v/o ${m.kneipname}</span>` : ''}
          ${statusBadge(m.status)}
          ${m.aemter ? html`<span class="tiny muted" style="margin-top:.25rem">${m.aemter}</span>` : ''}
          ${m.angebot ? html`<span class="badge badge-green" style="margin-top:.375rem" title="${m.angebot}">${icon('gift', 'icon-sm')}bietet Unterstützung an</span>` : ''}
        </a>`)}</div>`
      : html`<div class="card">${emptyState('users', 'Niemand gefunden', q ? `Keine Treffer für „${q}“.` : '')}</div>`);
  }

  el.addEventListener('input', (e) => {
    if (e.target.id === 'q') { q = e.target.value; local.set('fb.memberSearch', q); render(); }
  });
  el.addEventListener('click', (e) => {
    const g = e.target.closest('[data-group]');
    if (g) { group = g.dataset.group; render(); }
    if (e.target.closest('[data-action=retry]')) app.refresh();
    if (e.target.closest('[data-action=relogin]')) app.relogin();
  });

  try {
    await app.load('members', () => b.listMembers(), (data) => { list = data; if (ctx.alive()) render(); }, { maxAge: 10 * 60_000 });
  } catch (err) {
    if (!list.length) setHtml(listEl, errorBox(err));
  }
}

export async function detail(ctx) {
  const { el, app, params } = ctx;
  const b = app.backend;
  const email = String(params.email || '').toLowerCase();
  setHtml(el, html`${backLink('#/mitglieder', 'Alle Mitglieder')}<div id="c">${loading()}</div>`);
  const c = el.querySelector('#c');
  let m;
  try {
    m = await b.getMember(email);
  } catch (err) {
    setHtml(c, errorBox(err));
    return;
  }
  if (!ctx.alive()) return;
  if (!m) {
    setHtml(c, html`<div class="card">${emptyState('user', 'Profil nicht gefunden', `Für ${email} gibt es (noch) kein Profil.`)}</div>`);
    return;
  }
  const isMe = email === app.user.email.toLowerCase();
  const chatOk = b.chatStatus().available;
  const facts = [
    ['Status', m.status],
    ['Ämter', m.aemter],
    ['Studium / Beruf', m.studium || m.organisation],
    ['Tätigkeit', m.taetigkeit],
    ['Wohnort', m.wohnort || m.location],
    ['Rezeption', m.rezeption],
  ].filter(([, v]) => v);

  setHtml(c, html`
    <div class="card profile-head" style="margin-top:1rem">
      ${avatar(m, 148)}
      <div>
        <h1>${m.name}</h1>
        ${m.kneipname ? html`<div class="vulgo">v/o ${m.kneipname}</div>` : ''}
        <div class="row wrap" style="margin-top:.625rem;gap:.375rem">${statusBadge(m.status)}${m.aemter ? html`<span class="badge badge-outline">${m.aemter}</span>` : ''}</div>
        <div class="row wrap" style="margin-top:1rem;gap:.5rem">
          ${!isMe && chatOk ? html`<button class="btn btn-primary" data-action="chat">${icon('chat', 'icon-sm')}Nachricht</button>` : ''}
          ${m.email ? html`<a class="btn" href="mailto:${m.email}">${icon('mail', 'icon-sm')}E-Mail</a>` : ''}
          ${m.telefon ? html`<a class="btn" href="tel:${m.telefon.replace(/[^\d+]/g, '')}">${icon('phone', 'icon-sm')}Anrufen</a>` : ''}
          ${isMe ? html`<a class="btn btn-primary" href="#/profil">${icon('edit', 'icon-sm')}Profil bearbeiten</a>` : ''}
        </div>
      </div>
    </div>
    ${m.angebot ? html`
      <section class="card card-pad angebot-card" style="margin-top:1rem">
        <h2 class="card-title">${icon('gift')} ${isMe ? 'Das biete ich jüngeren Bundesbrüdern an' : 'Bietet jüngeren Bundesbrüdern an'}</h2>
        <p class="description" style="margin:.5rem 0 0">${linkify(m.angebot)}</p>
        ${!isMe ? html`<p class="small muted" style="margin:.625rem 0 0">Einfach ansprechen – per Nachricht oder E-Mail.</p>` : ''}
      </section>` : ''}
    <div class="grid-2" style="margin-top:1rem">
      <div class="card card-pad">
        <h2 style="margin:0 0 .375rem;font-weight:300;font-size:1.375rem">Steckbrief</h2>
        ${facts.length ? html`<dl class="facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`
          : html`<p class="muted">${isMe ? 'Du hast noch keine Angaben gemacht.' : 'Noch keine Angaben.'}</p>`}
      </div>
      <div class="card card-pad">
        <h2 style="margin:0 0 .375rem;font-weight:300;font-size:1.375rem">Über mich</h2>
        ${m.ueberMich ? html`<p class="description">${linkify(m.ueberMich)}</p>` : html`<p class="muted">${isMe ? 'Erzähl den Bundesbrüdern etwas über dich – im Profil.' : 'Noch nichts geschrieben.'}</p>`}
        <dl class="facts">
          ${m.email ? html`<div><dt>E-Mail</dt><dd><a href="mailto:${m.email}">${m.email}</a></dd></div>` : ''}
          ${m.telefon ? html`<div><dt>Telefon</dt><dd><a href="tel:${m.telefon.replace(/[^\d+]/g, '')}">${m.telefon}</a></dd></div>` : ''}
          ${m.instagram ? html`<div><dt>Instagram</dt><dd><a href="${instagramUrl(m.instagram)}" target="_blank" rel="noopener">${m.instagram}</a></dd></div>` : ''}
          ${m.linkedin ? html`<div><dt>LinkedIn</dt><dd><a href="${linkedinUrl(m.linkedin)}" target="_blank" rel="noopener">Profil öffnen</a></dd></div>` : ''}
        </dl>
        <p style="margin:.875rem 0 0"><a class="small" href="#/adressen?q=${encodeURIComponent(m.name.split(' ').pop())}">${icon('book', 'icon-sm')} Im Adressverzeichnis suchen</a></p>
      </div>
    </div>`);

  c.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action=chat]');
    if (!btn) return;
    btn.disabled = true;
    try {
      const space = await b.findDirectChat(m.email);
      if (space) app.navigate(`#/chat/${encodeURIComponent(space.id.replace('spaces/', ''))}?name=${encodeURIComponent(m.name)}`);
      else {
        toast('Noch kein Direktchat vorhanden – Google Chat wird geöffnet', { type: 'info' });
        window.open(`https://mail.google.com/chat/u/0/#chat/home`, '_blank', 'noopener');
      }
    } catch (err) {
      if (err.status === 404) {
        toast('Noch kein Direktchat vorhanden – Google Chat wird geöffnet', { type: 'info' });
        window.open('https://mail.google.com/chat/u/0/#chat/home', '_blank', 'noopener');
      } else showError(err);
    } finally {
      btn.disabled = false;
    }
  });
}
