// Terminübersicht: Liste oder Monatsansicht, Filter, Kalender-Abo
import { html, setHtml, icon, hero, skeletonList, emptyState, errorBox, openModal, toast } from '../ui.js';
import {
  semesterLabel, startOfDay, addDays, startOfMonth, addMonths, toDate, fMonthYear, isSameDay, isoDate, fDateNoYear,
} from '../lib/dates.js';
import { categoryInfo, eventLink } from '../config.js';
import { eventCard, memberMap } from './parts.js';
import { eventsToIcs, googleSubscribeUrl, downloadFile } from '../lib/export.js';
import { local } from '../lib/store.js';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export default async function termine(ctx) {
  const { el, app, query } = ctx;
  const b = app.backend;
  let mode = local.get('fb.termineView', 'liste');
  let filter = 'alle';
  let showPast = false;
  let cursor = startOfMonth(new Date());
  let selected = startOfDay(new Date());
  let data = null;
  let members = new Map();

  const today = startOfDay(new Date());
  const range = { from: addDays(today, -150), to: addDays(today, 365) };

  setHtml(el, html`
    ${hero('Termine', semesterLabel(), html`
      <button class="btn" data-action="subscribe">${icon('calendarPlus', 'icon-sm')}Kalender abonnieren</button>`)}
    <div class="row between wrap" style="gap:.5rem;margin-bottom:.25rem">
      <div class="chips grow" id="filters" role="group" aria-label="Filter"></div>
      <div class="row" role="group" aria-label="Ansicht" style="gap:.375rem;margin-bottom:.375rem">
        <button class="chip" data-mode="liste" aria-pressed="${mode === 'liste'}">${icon('list', 'icon-sm')}Liste</button>
        <button class="chip" data-mode="monat" aria-pressed="${mode === 'monat'}">${icon('calendar', 'icon-sm')}Monat</button>
      </div>
    </div>
    <div id="content">${skeletonList(4)}</div>
    ${app.isAdmin() && app.mode === 'google' ? html`<p class="small muted" style="margin-top:1.25rem">${icon('info', 'icon-sm')} Für Admins: Termine pflegt ihr im Google Kalender der Verbindung, die App zeigt sie nur an. Optional je eine Zeile in der Beschreibung: <code>Kategorie: Kneipe</code>, <code>Kleidung: Vollcouleur</code>, <code>Pflichttermin</code>.</p>` : ''}`);

  const content = el.querySelector('#content');

  const matches = (ev) => {
    if (filter === 'alle') return true;
    if (filter === 'offen') return !ev.myStatus || ev.myStatus === 'needsAction';
    if (filter === 'zugesagt') return ev.myStatus === 'accepted' || ev.myStatus === 'tentative';
    return ev.category === filter;
  };

  function renderFilters() {
    if (!data) return;
    const now = Date.now();
    const upcoming = data.events.filter((e) => toDate(e.end) >= now);
    const open = upcoming.filter((e) => !e.myStatus || e.myStatus === 'needsAction').length;
    const cats = [...new Set(data.events.map((e) => e.category))].sort();
    const chip = (id, label, count) => html`<button class="chip" data-filter="${id}" aria-pressed="${filter === id}">${label}${count !== undefined ? html` <span class="count">${count}</span>` : ''}</button>`;
    setHtml(el.querySelector('#filters'), html`
      ${chip('alle', 'Alle')}
      ${chip('offen', 'Antwort offen', open)}
      ${chip('zugesagt', 'Meine Zusagen')}
      ${cats.map((c) => html`<button class="chip" data-filter="${c}" aria-pressed="${filter === c}"><span class="cat-dot" style="--c:${categoryInfo(c).farbe}"></span>${c}</button>`)}`);
  }

  function groupByMonth(list) {
    const groups = [];
    for (const ev of list) {
      const key = fMonthYear(toDate(ev.start));
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) { g = { key, items: [] }; groups.push(g); }
      g.items.push(ev);
    }
    return groups;
  }

  function renderList() {
    const now = Date.now();
    const upcoming = data.events.filter((e) => toDate(e.end) >= now && matches(e));
    const past = data.events.filter((e) => toDate(e.end) < now && matches(e)).reverse();
    setHtml(content, html`
      ${upcoming.length
        ? groupByMonth(upcoming).map((g) => html`<h2 class="month-label">${g.key}</h2><div class="list">${g.items.map((ev) => eventCard(ev, { members }))}</div>`)
        : html`<div class="card">${emptyState('calendar', filter === 'alle' ? 'Keine anstehenden Termine' : 'Keine passenden Termine', filter === 'alle' ? '' : 'Probiere einen anderen Filter.')}</div>`}
      <div style="text-align:center;margin:1.625rem 0 .375rem">
        <button class="btn btn-ghost" data-action="past">${showPast ? 'Vergangene Termine ausblenden' : `Vergangene Termine anzeigen (${past.length})`}</button>
      </div>
      ${showPast && past.length ? groupByMonth(past).map((g) => html`<h2 class="month-label">${g.key}</h2><div class="list">${g.items.map((ev) => eventCard(ev, { members, past: true }))}</div>`) : ''}
    `);
  }

  function eventsOnDay(day) {
    return data.events.filter((e) => {
      if (!matches(e)) return false;
      const s = startOfDay(toDate(e.start));
      // Ende ist exklusiv: ganztägig = Folgetag, sonst z. B. 0:00 Uhr nicht mehr mitzählen
      const en = e.allDay ? addDays(toDate(e.end), -1) : new Date(toDate(e.end).getTime() - 1);
      return startOfDay(day) >= s && startOfDay(day) <= startOfDay(en);
    });
  }

  function renderMonth() {
    const first = startOfMonth(cursor);
    const offset = (first.getDay() + 6) % 7; // Montag zuerst
    const start = addDays(first, -offset);
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    const lastRowNeeded = days.slice(35).some((d) => d.getMonth() === first.getMonth());
    const shown = lastRowNeeded ? days : days.slice(0, 35);
    const dayEvents = eventsOnDay(selected);
    setHtml(content, html`
      <div class="card card-pad">
        <div class="cal-head">
          <button class="btn btn-ghost btn-icon btn-sm" data-month="-1" aria-label="Vorheriger Monat">${icon('chevronLeft')}</button>
          <h3>${fMonthYear(first)}</h3>
          <button class="btn btn-ghost btn-icon btn-sm" data-month="1" aria-label="Nächster Monat">${icon('chevronRight')}</button>
        </div>
        <div class="cal-grid" role="grid">
          ${WEEKDAYS.map((w) => html`<div class="wdh">${w}</div>`)}
          ${shown.map((d) => {
            const evs = eventsOnDay(d);
            const other = d.getMonth() !== first.getMonth();
            return html`<button class="cal-day ${other ? 'other' : ''} ${isSameDay(d, today) ? 'today' : ''}" data-day="${isoDate(d)}" aria-pressed="${isSameDay(d, selected)}" aria-label="${d.getDate()}. ${evs.length ? `– ${evs.length} Termin(e)` : ''}">
              <span>${d.getDate()}</span>
              <span class="cal-dots">${evs.slice(0, 4).map((e) => html`<i style="--c:${categoryInfo(e.category).farbe}"></i>`)}</span>
            </button>`;
          })}
        </div>
      </div>
      <h2 class="month-label">${fDateNoYear(selected)}</h2>
      ${dayEvents.length
        ? html`<div class="list">${dayEvents.map((ev) => eventCard(ev, { members, past: toDate(ev.end) < Date.now() }))}</div>`
        : html`<p class="muted">Keine Termine an diesem Tag.</p>`}`);
  }

  function render() {
    if (!data) return;
    renderFilters();
    el.querySelectorAll('[data-mode]').forEach((b2) => b2.setAttribute('aria-pressed', String(b2.dataset.mode === mode)));
    if (mode === 'monat') renderMonth();
    else renderList();
  }

  async function ensureRange(d) {
    if (d >= range.from && d <= range.to) return;
    const from = d < range.from ? startOfMonth(d) : range.from;
    const to = d > range.to ? addMonths(startOfMonth(d), 1) : range.to;
    const more = await b.listEvents({ from, to });
    range.from = from;
    range.to = to;
    const ids = new Set(data.events.map((e) => e.id));
    data.events = [...data.events, ...more.events.filter((e) => !ids.has(e.id))].sort((x, y) => String(x.start).localeCompare(String(y.start)));
  }

  function subscribeDialog() {
    const info = b.calendarInfo();
    const upcoming = (data?.events || []).filter((e) => toDate(e.end) >= Date.now());
    const m = openModal({
      title: 'Termine in den eigenen Kalender',
      body: html`
        <div class="stack">
          <div class="notice notice-green">${icon('check')}<div>
            <h3>Am einfachsten: zusagen</h3>
            <p>Termine, zu denen du eingeladen bist oder zusagst, stehen automatisch in deinem Google Kalender.</p></div></div>
          <div>
            <h3 style="margin:0 0 .25rem;font-size:1rem">Ganzen Verbindungskalender abonnieren</h3>
            <p class="small muted">Dann stehen alle Termine in deinem Google Kalender – auch neue und geänderte.</p>
            ${info.calendarId
              ? html`<a class="btn btn-primary" href="${googleSubscribeUrl(info.calendarId)}" target="_blank" rel="noopener">${icon('calendarPlus', 'icon-sm')}In Google Kalender abonnieren</a>`
              : html`<button class="btn" disabled>${icon('calendarPlus', 'icon-sm')}In Google Kalender abonnieren</button><p class="tiny muted">${info.demo ? 'Im Demo-Modus nicht verfügbar.' : 'Kalender ist noch nicht eingerichtet.'}</p>`}
          </div>
          <div>
            <h3 style="margin:0 0 .25rem;font-size:1rem">Für Apple- oder Outlook-Kalender</h3>
            <p class="small muted">Alle ${upcoming.length} kommenden Termine als Kalenderdatei (.ics).</p>
            <button class="btn" data-action="ics">${icon('download', 'icon-sm')}Termine als Datei (.ics)</button>
          </div>
        </div>`,
    });
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-action=ics]')) {
        downloadFile('Verbindungstermine.ics', eventsToIcs(upcoming, { calendarName: info.name, linkFor: (ev) => eventLink(ev.id) }), 'text/calendar');
        toast('Kalenderdatei heruntergeladen');
      }
    });
  }

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const f = t.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; render(); return; }
    const md = t.closest('[data-mode]');
    if (md) { mode = md.dataset.mode; local.set('fb.termineView', mode); render(); return; }
    if (t.closest('[data-action=past]')) { showPast = !showPast; render(); return; }
    if (t.closest('[data-action=subscribe]')) { subscribeDialog(); return; }
    if (t.closest('[data-action=retry]')) { app.refresh(); return; }
    if (t.closest('[data-action=relogin]')) { app.relogin(); return; }
    const mon = t.closest('[data-month]');
    if (mon) {
      cursor = addMonths(cursor, Number(mon.dataset.month));
      selected = isSameDay(startOfMonth(today), cursor) ? today : startOfMonth(cursor);
      try { await ensureRange(cursor); await ensureRange(addMonths(cursor, 1)); } catch (err) { toast(err.message, { type: 'err' }); }
      render();
      return;
    }
    const day = t.closest('[data-day]');
    if (day) {
      selected = toDate(day.dataset.day);
      if (selected.getMonth() !== cursor.getMonth()) cursor = startOfMonth(selected);
      render();
    }
  });

  if (query.abo) setTimeout(subscribeDialog, 300);

  b.listMembers().then((list) => { members = memberMap(list); if (ctx.alive()) render(); }).catch(() => {});

  try {
    await app.load('events-all', () => b.listEvents(range), (d) => {
      data = { ...d, events: d.events.slice() };
      if (ctx.alive()) render();
    }, { maxAge: 2 * 60_000 });
  } catch (err) {
    if (!data) setHtml(content, errorBox(err));
    else toast(`Aktualisierung fehlgeschlagen: ${err.message}`, { type: 'err' });
  }
}
