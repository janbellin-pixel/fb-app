// Startseite: Begrüßung, nächste Termine, Neuigkeiten, Bundesbote, Forum, Geburtstage
import { html, setHtml, icon, avatar, sectionTitle, skeletonList, toast, showError, isStandalone, emptyState } from '../ui.js';
import { fDateLong, fDateNoYear, semesterLabel, addDays, startOfDay, nextBirthday, toDate, relDay } from '../lib/dates.js';
import { eventCard, memberMap, newsCard, threadRow, issueCover, bindCardLinks, isUnread, forumSeen } from './parts.js';
import { local } from '../lib/store.js';
import { albumInfo } from './galerie.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 17) return 'Hallo';
  return 'Guten Abend';
}

export default async function home(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  const me = app.user;
  const showInstall = !isStandalone() && !local.get('fb.installDismissed');

  setHtml(el, html`
    <section class="home-hero">
      <img class="crest" src="assets/wappen.webp" alt="Wappen" width="150" height="142">
      <div class="welcome">
        <h1>${greeting()}${me.firstName ? html`, ${me.firstName}` : ''}!</h1>
        <p>${fDateLong(new Date())} · ${semesterLabel()}</p>
      </div>
    </section>
    ${showInstall ? html`
      <div class="install-banner" id="install-banner">
        <img src="assets/icons/icon-192.png" alt="">
        <div class="grow"><strong>Als App installieren</strong><p>Aufs Handy legen – wie jede andere App.</p></div>
        <a class="btn btn-sm btn-green" href="#/installieren">Anleitung</a>
        <button class="btn btn-sm btn-icon btn-on-dark" data-action="dismiss-install" aria-label="Ausblenden">${icon('x', 'icon-sm')}</button>
      </div>` : ''}
    <div class="grid-2-1">
      <div>
        ${sectionTitle('Nächste Termine', { href: '#/termine', label: 'Alle Termine' })}
        <div id="h-events">${skeletonList(3)}</div>
        <div id="h-birthdays"></div>
        ${sectionTitle('Neuigkeiten', { href: '#/news', label: 'Alle News' })}
        <div id="h-news">${skeletonList(2)}</div>
      </div>
      <aside>
        ${sectionTitle('Schnellzugriff')}
        <div class="tiles">
          <a class="tile" href="#/chat">${icon('chat')}Chat</a>
          <a class="tile" href="#/mitglieder">${icon('users')}Mitglieder</a>
          <a class="tile" href="#/adressen">${icon('book')}Adressen</a>
          <a class="tile" href="#/zeitung">${icon('paper')}Bundesbote</a>
          <a class="tile" href="#/galerie">${icon('image')}Galerie</a>
          <a class="tile" href="#/forum">${icon('forum')}Forum</a>
          <a class="tile" href="#/news">${icon('news')}News</a>
          <a class="tile" href="#/profil">${icon('user')}Profil</a>
          <a class="tile" href="#/termine?abo=1">${icon('calendarPlus')}Kalender</a>
        </div>
        ${sectionTitle('Bundesbote', { href: '#/zeitung', label: 'Archiv' })}
        <div id="h-zeitung"><div class="skeleton" style="height:7.5rem"></div></div>
        <div id="h-photos"></div>
        ${sectionTitle('Aus dem Forum', { href: '#/forum', label: 'Zum Forum' })}
        <div id="h-forum">${skeletonList(2)}</div>
      </aside>
    </div>`);

  const q = (id) => el.querySelector(id);
  let members = new Map();
  let lastEvents = null;

  const renderEvents = (data) => {
    lastEvents = data;
    const now = Date.now();
    const upcoming = data.events.filter((e) => toDate(e.end) >= now).slice(0, 4);
    setHtml(q('#h-events'), upcoming.length
      ? html`<div class="list">${upcoming.map((ev) => eventCard(ev, { members, quick: true }))}</div>`
      : html`<div class="card">${emptyState('calendar', 'Keine anstehenden Termine', 'Sobald neue Termine im Kalender stehen, erscheinen sie hier.')}</div>`);
  };

  let lastForum = null;
  const renderForum = (forum) => {
    lastForum = forum;
    const seen = forumSeen();
    const list = forum.threads.filter((t) => !t.pinned).slice(0, 3);
    setHtml(q('#h-forum'), list.length
      ? html`<div class="list">${list.map((t) => threadRow(t, members, isUnread(t, seen)))}</div>`
      : html`<div class="card">${emptyState('forum', 'Noch keine Themen')}</div>`);
  };

  let lastAddresses = null;
  const renderBirthdays = (res) => {
    lastAddresses = res;
    if (!res.hasBirthdays || !ctx.alive()) return;
    // die nächsten drei Geburtstage – egal wie weit entfernt
    const next = res.items
      .map((a) => ({ a, nb: nextBirthday(a.geburtstag ? toDate(a.geburtstag) : null) }))
      .filter((x) => x.nb)
      .sort((x, y) => x.nb.days - y.nb.days || x.a.name.localeCompare(y.a.name, 'de'))
      .slice(0, 3);
    if (!next.length) return;
    setHtml(q('#h-birthdays'), html`
      ${sectionTitle('Nächste Geburtstage', { href: '#/adressen', label: 'Adressverzeichnis' })}
      <div class="card">${next.map(({ a, nb }) => {
        const m = members.get(a.email) || { name: a.name, email: a.email };
        const when = nb.days === 0 ? 'heute' : relDay(nb.date);
        return html`<a class="birthday ${nb.days === 0 ? 'today' : ''}" href="${m.email ? `#/mitglied/${encodeURIComponent(m.email)}` : '#/adressen'}">
          ${avatar(m, 44)}
          <div class="grow" style="min-width:0">
            <div class="name ellipsis">${a.name}</div>
            <div class="small muted ellipsis">${a.kneipname ? `v/o ${a.kneipname}` : a.status}</div>
          </div>
          <div class="when">
            <span class="day">${icon('gift', 'icon-sm')} ${nb.days === 0 ? html`<strong>heute 🎉</strong>` : fDateNoYear(nb.date)}</span>
            <span>${nb.days === 0 ? '' : when}${nb.age ? html`${nb.days === 0 ? '' : ' · '}wird ${nb.age}` : ''}</span>
          </div>
        </a>`;
      })}</div>`);
  };

  bindCardLinks(el, app.navigate);

  el.addEventListener('click', async (e) => {
    const dismiss = e.target.closest('[data-action=dismiss-install]');
    if (dismiss) {
      local.set('fb.installDismissed', true);
      q('#install-banner')?.remove();
      return;
    }
    const btn = e.target.closest('[data-rsvp]');
    if (btn) {
      btn.disabled = true;
      try {
        const ev = lastEvents?.events.find((x) => x.id === btn.dataset.id);
        await b.rsvp(btn.dataset.id, { status: btn.dataset.rsvp, title: ev?.title, start: ev?.start });
        toast(btn.dataset.rsvp === 'accepted' ? 'Zugesagt – bis dann!' : 'Abgesagt');
        if (ev) {
          ev.myStatus = btn.dataset.rsvp;
          const mine = ev.attendees.find((a) => a.email === me.email);
          if (mine) mine.status = btn.dataset.rsvp;
          else ev.attendees.push({ email: me.email, name: me.name, status: btn.dataset.rsvp, guests: 0 });
          renderEvents(lastEvents);
        }
      } catch (err) {
        btn.disabled = false;
        showError(err);
      }
    }
  });

  const from = startOfDay(new Date());
  const to = addDays(from, 60);
  // Fehlermeldung nur, wenn nichts Zwischengespeichertes angezeigt wird (z. B. offline)
  const failed = (sel, text) => (err) => {
    if (err.usedCache || !ctx.alive()) return;
    setHtml(q(sel), html`<div class="card card-pad small muted">${icon('alert', 'icon-sm')} ${text}: ${err.message}</div>`);
  };
  // Vorschaubild nicht ladbar → Original über die Anmeldung holen
  const photos = new Map();
  q('#h-photos').addEventListener('error', async (e) => {
    const img = e.target;
    if (img?.tagName !== 'IMG' || !photos.has(img.dataset.photo) || img.dataset.fallback) return;
    img.dataset.fallback = '1';
    try { img.src = await b.photoFullUrl(photos.get(img.dataset.photo)); } catch { img.remove(); }
  }, true);

  const jobs = [
    app.load('members', () => b.listMembers(), (list) => {
      members = memberMap(list);
      if (!ctx.alive()) return;
      if (lastEvents) renderEvents(lastEvents);
      if (lastForum) renderForum(lastForum);
      if (lastAddresses) renderBirthdays(lastAddresses);
    }, { maxAge: 10 * 60_000 }).catch(() => {}),
    app.load('events-home', () => b.listEvents({ from, to }), renderEvents, { maxAge: 2 * 60_000 })
      .catch(failed('#h-events', 'Termine konnten nicht geladen werden')),
    app.load('news', () => b.listNews(), async (items) => {
      const top = items.slice(0, 2);
      const urls = await Promise.all(top.map((n) => b.imageUrl(n.image).catch(() => '')));
      if (!ctx.alive()) return;
      setHtml(q('#h-news'), top.length
        ? html`<div class="news-grid">${top.map((n, i) => newsCard(n, urls[i]))}</div>`
        : html`<div class="card">${emptyState('news', 'Noch keine Neuigkeiten')}</div>`);
    }, { maxAge: 5 * 60_000 }).catch(failed('#h-news', 'News nicht verfügbar')),
    app.load('issues', () => b.listIssues(), (issues) => {
      const latest = issues[0];
      setHtml(q('#h-zeitung'), latest
        ? html`<a class="card card-pad row" href="#/zeitung/${encodeURIComponent(latest.id)}" style="align-items:center;gap:1rem">
            <div class="issue" style="width:5.25rem;flex:none">${issueCover(latest, latest.thumbnail)}</div>
            <div class="grow"><div class="small muted">Neueste Ausgabe</div><div style="font-weight:700;font-size:1.0625rem">${latest.title}</div><div class="small muted">${latest.ausgabe}</div>
            <span class="btn btn-sm btn-primary" style="margin-top:.625rem">${icon('paper', 'icon-sm')}Jetzt lesen</span></div>
          </a>`
        : html`<div class="card">${emptyState('paper', 'Noch keine Ausgaben')}</div>`);
    }, { maxAge: 30 * 60_000 }).catch(failed('#h-zeitung', 'Bundesbote nicht verfügbar')),
    app.load('forum', () => b.listForum(), renderForum, { maxAge: 2 * 60_000 }).catch(failed('#h-forum', 'Forum nicht verfügbar')),
    app.load('addresses', () => b.listAddresses(), renderBirthdays, { maxAge: 60 * 60_000 }).catch(() => {}),
    app.load('gallery', () => b.listGallery(), (data) => {
      const a = data.albums[0];
      if (!a || !ctx.alive()) return;
      const shown = a.photos.slice(0, 6);
      photos.clear();
      for (const p of shown) photos.set(p.id, p);
      setHtml(q('#h-photos'), html`
        ${sectionTitle('Neue Fotos', { href: '#/galerie', label: 'Galerie' })}
        <a class="home-photos" href="#/galerie/${encodeURIComponent(a.id)}" aria-label="Album ${albumInfo(a).name} öffnen">
          ${shown.map((p) => html`<img src="${b.photoUrl(p, 300)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-photo="${p.id}">`)}
        </a>`);
    }, { maxAge: 15 * 60_000 }).catch(() => {}),
  ];
  await Promise.allSettled(jobs);
}
