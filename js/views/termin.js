// Termin: Details, eigene Zu-/Absage, wer kommt.
// Termine selbst werden in der App nicht geändert – das geschieht im Google Kalender.
import {
  html, setHtml, icon, hero, backLink, loading, avatar, toast, showError, errorBox, shareLink, notice,
} from '../ui.js';
import { fEventWhen, toDate } from '../lib/dates.js';
import { linkify } from '../lib/text.js';
import { categoryInfo, eventLink, config } from '../config.js';
import { summarizeAttendees } from '../backend/common.js';
import { memberMap, personFor, STATUS_LABEL } from './parts.js';
import { eventsToIcs, googleTemplateUrl, downloadFile, mapsUrl } from '../lib/export.js';

export default async function termin(ctx) {
  const { el, app, params } = ctx;
  const b = app.backend;
  const me = app.user;
  setHtml(el, html`${backLink('#/termine', 'Alle Termine')}<div id="c">${loading()}</div>`);
  const c = el.querySelector('#c');

  let ev;
  let members = new Map();
  let allMembers = [];
  try {
    const [e, list] = await Promise.all([b.getEvent(params.id), b.listMembers().catch(() => [])]);
    ev = e;
    allMembers = list;
    members = memberMap(list);
  } catch (err) {
    setHtml(c, errorBox(err));
    c.addEventListener('click', (e) => { if (e.target.closest('[data-action=retry]')) app.refresh(); if (e.target.closest('[data-action=relogin]')) app.relogin(); });
    return;
  }
  if (!ctx.alive()) return;

  let guests = ev.myGuests || 0;
  let comment = ev.myComment || '';
  const link = eventLink(ev.id);
  const isPast = toDate(ev.end) < Date.now();

  function attendeeItem(a) {
    const p = personFor(a.email, members, a.name);
    const sub = [p.kneipname ? `v/o ${p.kneipname}` : '', a.comment ? `„${a.comment}“` : ''].filter(Boolean).join(' · ');
    return html`<a class="attendee" href="#/mitglied/${encodeURIComponent(a.email)}">
      ${avatar(p, 36)}
      <div style="min-width:0"><div class="name ellipsis">${p.name}${a.guests ? html` <span class="badge badge-green">+${a.guests}</span>` : ''}</div>
      ${sub ? html`<div class="sub ellipsis">${sub}</div>` : ''}</div>
    </a>`;
  }

  function renderAttendees() {
    const sum = summarizeAttendees(ev.attendees);
    const responded = new Set(ev.attendees.map((a) => a.email));
    const silent = allMembers.filter((m) => !responded.has(m.email)).map((m) => ({ email: m.email, name: m.name, status: 'needsAction' }));
    const open = [...sum.groups.needsAction, ...silent];
    const group = (title, list, iconName, open2 = true) => (list.length ? html`
      <details class="attendee-group" ${open2 ? 'open' : ''}>
        <summary style="cursor:pointer;list-style:none"><h4>${icon(iconName, 'icon-sm')}${title} <span class="badge">${list.length}</span></h4></summary>
        <div class="attendee-list">${list.map(attendeeItem)}</div>
      </details>` : '');
    return html`
      <div class="row wrap" style="gap:.5rem;margin-bottom:.875rem">
        <span class="pill pill-yes">${icon('check')}${sum.yes} Zusagen${sum.guests ? ` + ${sum.guests} Gäste` : ''}</span>
        <span class="pill pill-maybe">${icon('question')}${sum.maybe} Vielleicht</span>
        <span class="pill pill-no">${icon('x')}${sum.no} Absagen</span>
      </div>
      <div class="attendee-groups">
        ${group('Zusagen', sum.groups.accepted, 'check')}
        ${group('Vielleicht', sum.groups.tentative, 'question')}
        ${group('Absagen', sum.groups.declined, 'x', false)}
        ${group('Noch keine Antwort', open, 'clock', false)}
      </div>`;
  }

  function rsvpSection() {
    if (!ev.invited) {
      return notice('gold', 'Nicht eingeladen',
        'Zu- und Absagen sind nur für eingeladene Mitglieder möglich (normalerweise über die Mitglieder-Gruppe). Du kannst den Termin aber in deinen eigenen Kalender übernehmen – rechts unter „In den eigenen Kalender“.');
    }
    const st = ev.myStatus;
    const btn = (status, cls, label, ic) => html`<button class="${cls}" data-status="${status}" aria-pressed="${st === status}">${icon(ic)}${label}</button>`;
    return html`
      <div class="rsvp" role="group" aria-label="Deine Antwort">
        ${btn('accepted', 'yes', 'Zusagen', 'check')}
        ${btn('tentative', 'maybe', 'Vielleicht', 'question')}
        ${btn('declined', 'no', 'Absagen', 'x')}
      </div>
      <div class="form-grid cols-2" style="margin-top:.875rem">
        <div class="field">
          <label>Ich bringe Gäste mit</label>
          <div class="stepper"><button type="button" data-guests="-1" aria-label="Weniger">−</button><span id="guests">${guests}</span><button type="button" data-guests="1" aria-label="Mehr">+</button></div>
        </div>
        <div class="field">
          <label for="comment">Kommentar (für alle sichtbar)</label>
          <input class="input" id="comment" maxlength="200" placeholder="z. B. Komme etwas später" value="${comment}">
        </div>
      </div>
      <div class="row between wrap">
        <p class="tiny muted" style="margin:0" id="rsvp-info">${rsvpInfo()}</p>
        <button class="btn btn-sm hidden" data-action="save-extra">Gäste/Kommentar speichern</button>
      </div>`;
  }

  function rsvpInfo() {
    if (app.mode === 'demo') return 'Demo: Antworten werden nur in diesem Browser gespeichert.';
    return 'Deine Antwort wird in deinem eigenen Google Kalender gespeichert – genau wie bei einer normalen Einladung. Die App ändert sonst nichts am Termin.';
  }

  function render() {
    const cat = categoryInfo(ev.category);
    const calendarLink = ev.htmlLink;
    setHtml(c, html`
      ${hero(ev.title, fEventWhen(ev, { long: true }))}
      <div class="grid-2-1">
        <div class="stack">
          <div class="card card-pad">
            <dl class="detail-list">
              <div><dt>${icon('clock')}</dt><dd>${fEventWhen(ev, { long: true })}${ev.recurring ? html`<br><span class="small muted">Teil einer Terminserie</span>` : ''}</dd></div>
              ${ev.location ? html`<div><dt>${icon('pin')}</dt><dd><a href="${mapsUrl(ev.location)}" target="_blank" rel="noopener">${ev.location}</a></dd></div>` : ''}
              <div><dt>${icon('tag')}</dt><dd><span class="row" style="gap:.5rem"><span class="cat-dot" style="--c:${cat.farbe}"></span>${ev.category}</span></dd></div>
              ${ev.dresscode ? html`<div><dt>${icon('shirt')}</dt><dd>Kleidung: <strong>${ev.dresscode}</strong></dd></div>` : ''}
              ${ev.mandatory ? html`<div><dt>${icon('alert')}</dt><dd><span class="badge badge-black">Pflichttermin</span></dd></div>` : ''}
            </dl>
            ${ev.description ? html`<hr><div class="description">${linkify(ev.description)}</div>` : ''}
          </div>

          <div class="card card-pad">
            <h2 style="margin:0 0 .75rem;font-weight:300;font-size:1.375rem">${isPast ? 'Deine Antwort (Termin ist vorbei)' : 'Deine Antwort'}</h2>
            ${rsvpSection()}
          </div>

          <div class="card card-pad">
            <h2 style="margin:0 0 .75rem;font-weight:300;font-size:1.375rem">Wer kommt?</h2>
            <div id="attendees">${renderAttendees()}</div>
          </div>
        </div>

        <aside class="stack">
          <div class="card card-pad stack">
            <h3 style="margin:0;font-size:1.0625rem">In den eigenen Kalender</h3>
            ${ev.invited && calendarLink
              ? html`<p class="small muted" style="margin:0">Du bist eingeladen – der Termin steht bereits in deinem Google Kalender.</p>
                <a class="btn btn-block" href="${calendarLink}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}In Google Kalender öffnen</a>`
              : html`<a class="btn btn-block" href="${googleTemplateUrl(ev, link)}" target="_blank" rel="noopener">${icon('calendarPlus', 'icon-sm')}Zu Google Kalender hinzufügen</a>`}
            <button class="btn btn-block" data-action="ics">${icon('download', 'icon-sm')}Für Apple/Outlook (.ics)</button>
          </div>
          <div class="card card-pad stack">
            <h3 style="margin:0;font-size:1.0625rem">Termin teilen</h3>
            <p class="small muted" style="margin:0">Der Link führt direkt zu dieser Seite – zum Beispiel für den Chat.</p>
            <button class="btn btn-block" data-action="share">${icon('share', 'icon-sm')}Link teilen</button>
          </div>
        </aside>
      </div>`);
  }

  async function save(status) {
    const prev = { status: ev.myStatus, guests: ev.myGuests, comment: ev.myComment };
    ev.myStatus = status;
    ev.myGuests = guests;
    ev.myComment = comment;
    const mine = ev.attendees.find((a) => a.email === me.email);
    if (mine) Object.assign(mine, { status, guests, comment });
    else ev.attendees.push({ email: me.email, name: me.name, status, guests, comment, source: 'calendar' });
    render();
    try {
      await b.rsvp(ev.id, { status, guests, comment });
      toast(status === 'accepted' ? 'Zugesagt – wir freuen uns!' : status === 'tentative' ? 'Als „Vielleicht“ gespeichert' : 'Abgesagt – schade!');
    } catch (err) {
      Object.assign(ev, { myStatus: prev.status, myGuests: prev.guests, myComment: prev.comment });
      if (mine) Object.assign(mine, { status: prev.status, guests: prev.guests, comment: prev.comment });
      else ev.attendees = ev.attendees.filter((a) => a.email !== me.email);
      render();
      showError(err);
    }
  }

  render();

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const st = t.closest('[data-status]');
    if (st) { await save(st.dataset.status); return; }
    const g = t.closest('[data-guests]');
    if (g) {
      guests = Math.max(0, Math.min(9, guests + Number(g.dataset.guests)));
      el.querySelector('#guests').textContent = guests;
      el.querySelector('[data-action=save-extra]')?.classList.remove('hidden');
      return;
    }
    if (t.closest('[data-action=save-extra]')) {
      comment = el.querySelector('#comment').value.trim();
      await save(ev.myStatus && ev.myStatus !== 'needsAction' ? ev.myStatus : 'accepted');
      return;
    }
    if (t.closest('[data-action=ics]')) {
      downloadFile(`${ev.title.replace(/[^\wäöüÄÖÜß -]+/g, '').trim() || 'Termin'}.ics`, eventsToIcs([ev], { calendarName: config.appName, linkFor: () => link }), 'text/calendar');
      return;
    }
    if (t.closest('[data-action=share]')) {
      await shareLink(ev.title, link, `${ev.title} – ${fEventWhen(ev)}`);
    }
  });
  el.addEventListener('input', (e) => {
    if (e.target.id === 'comment') {
      comment = e.target.value.trim();
      el.querySelector('[data-action=save-extra]')?.classList.remove('hidden');
    }
  });
  el.addEventListener('keydown', (e) => {
    if (e.target.id === 'comment' && e.key === 'Enter') el.querySelector('[data-action=save-extra]')?.click();
  });
}

export { STATUS_LABEL };
