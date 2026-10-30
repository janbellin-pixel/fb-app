// Chat über Google Chat: Direktnachrichten, Gruppen und Räume der Verbindung (E14, E30).
// Neue Unterhaltungen legt die App nur mit Personen an; Räume löschen oder Mitglieder entfernen kann sie nicht.
import {
  html, setHtml, icon, hero, backLink, avatar, skeletonList, emptyState, errorBox, notice, toast, showError, describeError, loading, setBusy, confirmDialog,
} from '../ui.js';
import { relTime, fTime, isSameDay, addDays, fDateNoYear, toDate } from '../lib/dates.js';
import { linkify, matchesQuery } from '../lib/text.js';
import { config } from '../config.js';
import * as auth from '../auth.js';
import { local } from '../lib/store.js';
import { isUnreadChat, markChatRead, onChange, GOOGLE_CHAT_APP, notificationsWanted, enableNotifications } from '../lib/hinweise.js';
import { inGruppe } from '../lib/gruppen.js';
import { sendRefusal } from './parts.js';

const CHAT_HOME = 'https://chat.google.com/';
/** Knöpfe „… kontaktieren“ (E45): Schlüssel in config.vorstand und Name der Gruppe */
const VORSTAENDE = [['aktive', 'Aktivenvorstand'], ['altherren', 'Altherrenvorstand']];

function unavailable(status) {
  if (status.reason === 'no-workspace') {
    return notice('gold', 'Chat braucht Google Workspace',
      'Der Chat nutzt Google Chat der Verbindung – mit diesem Konto geht das nicht. Google Chat selbst kannst du trotzdem öffnen.',
      html`<p style="margin-top:.625rem"><a class="btn btn-sm btn-primary" href="${CHAT_HOME}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Google Chat öffnen</a></p>`);
  }
  if (status.reason === 'scope') {
    return notice('gold', 'Chat noch nicht freigeschaltet',
      'Für Unterhaltungen und Nachrichten braucht die App einmalig deine Zustimmung bei Google.',
      html`<p style="margin-top:.625rem"><button class="btn btn-sm btn-primary" data-action="grant">${icon('key', 'icon-sm')}Chat freischalten</button></p>`);
  }
  return notice('gold', 'Chat ist deaktiviert', 'Die Chat-Funktion wurde in der Konfiguration ausgeschaltet.');
}

/**
 * Google verweigert schon das Lesen der Unterhaltungen (403): Meist ist Google Chat für dieses Konto aus, ohne Lizenz
 * oder (neues Konto) noch nicht eingerichtet – das ändern nur Admins. Statt „Freigabe fehlt“ das erklären. Sonst null.
 */
function chatBlocked(err) {
  if (describeError(err).key !== 'forbidden') return null;
  return notice('gold', 'Google Chat für dein Konto nicht verfügbar',
    html`Google lässt die App deine Unterhaltungen nicht lesen. Probier Google Chat direkt: Geht es dort auch nicht, ist Chat für dein Konto aus oder noch nicht bereit (bei neuen Konten einige Stunden) – dann den Admins Bescheid geben.${err.message ? html`<br><span class="muted">Google: „${err.message}“</span>` : ''}`,
    html`<p class="row wrap" style="margin-top:.625rem;gap:.5rem"><a class="btn btn-sm btn-primary" href="${CHAT_HOME}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Google Chat öffnen</a><button class="btn btn-sm" data-action="retry">${icon('refresh', 'icon-sm')}Erneut versuchen</button></p>`);
}

/** Zustimmung für Chat (inkl. neue Unterhaltungen, E30) einholen und an dieselbe Stelle zurückkehren */
function grantChat() {
  auth.login({ extraScopes: auth.SCOPES.workspace, consent: true, returnTo: location.hash || '#/chat' });
}

const initialOf = (name) => String(name || '').replace(/^[^A-Za-zÄÖÜäöü]*/, '').charAt(0).toUpperCase() || '#';
const spacePath = (id) => encodeURIComponent(String(id).replace('spaces/', ''));
const roomLink = (s) => `#/chat/${spacePath(s.id)}?name=${encodeURIComponent(s.name)}`;

function spaceIcon(s) {
  if (s.type === 'DIRECT_MESSAGE') return avatar({ name: s.name, photo: s.photo || '' }, 44);
  if (s.type === 'GROUP_CHAT') return html`<span class="space-icon" aria-hidden="true">${icon('users')}</span>`;
  return html`<span class="space-icon" aria-hidden="true">${initialOf(s.name)}</span>`;
}

function spaceSub(s) {
  if (s.type === 'DIRECT_MESSAGE') return 'Direktnachricht';
  if (s.type === 'GROUP_CHAT') return `Gruppe${s.members?.length ? ` · ${s.members.length + 1} Personen` : ''}`;
  return s.description || 'Raum';
}

export default async function chat(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  const status = b.chatStatus();
  const vs = b.vorstand?.() || {};
  const vorstand = status.available ? VORSTAENDE.filter(([k]) => vs[k]?.length) : [];
  const whatsapp = inGruppe('bundesbrueder'); // Hinweis auf die WhatsApp-Gruppen nur für Bundesbrüder
  setHtml(el, html`
    ${hero('Chat', 'Direktnachrichten, Gruppen und Räume', status.available ? html`
      <a class="btn btn-primary" href="#/chat-neu">${icon('send', 'icon-sm')}Neue Nachricht</a>
      <a class="btn" href="#/chat-neu?gruppe=1">${icon('users', 'icon-sm')}Neue Gruppe</a>` : '')}
    ${vorstand.length || whatsapp ? html`<section class="card card-pad vorstand-box">
      ${vorstand.length ? html`<div class="row wrap">${vorstand.map(([k, label]) => html`<button class="btn" data-vorstand="${k}">${icon('users', 'icon-sm')}${label} kontaktieren</button>`)}</div>` : ''}
      ${whatsapp ? html`<p class="small hint-line">${icon('smartphone', 'icon-sm')}<span>Zu unseren WhatsApp-Gruppen lädt dich jedes Vorstandsmitglied ein – frag einfach.</span></p>` : ''}
    </section>` : ''}
    <div id="c">${status.available ? skeletonList(4, 'sk-card') : unavailable(status)}</div>
    <div class="notice" style="margin-top:1.125rem">${icon('smartphone')}<div><h3>Tipp: Benachrichtigungen aufs Handy</h3>
      <p>Installier die App „Google Chat“ und melde dich mit dem Verbindungskonto an. Dort kommen alle Nachrichten an, auch wenn diese App zu ist. Oder schalte unter Mehr › Einstellungen Push-Mitteilungen ein: Dann meldet sich diese App, wenn dir jemand aus der Mitglieder-App schreibt.</p>
      <p class="row wrap" style="margin-top:.5rem;gap:.375rem 1rem"><a href="${GOOGLE_CHAT_APP.android}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Android</a><a href="${GOOGLE_CHAT_APP.ios}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}iPhone</a><a href="${CHAT_HOME}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Google Chat im Browser</a></p>
      <div id="notify-here" style="margin-top:.625rem">${status.available && !notificationsWanted() ? html`<button class="btn btn-sm" data-action="notify-on">${icon('chat', 'icon-sm')}Benachrichtigungen in dieser App einschalten</button>` : ''}</div></div></div>`);
  const c = el.querySelector('#c');

  async function contactVorstand(btn) {
    const [key, label] = VORSTAENDE.find(([k]) => k === btn.dataset.vorstand) || [];
    if (!key) return;
    if (!b.chatCanCreate()) {
      if (await confirmDialog('Für neue Unterhaltungen braucht die App einmalig deine Zustimmung bei Google.', { title: 'Zustimmung nötig', ok: 'Zustimmen' })) grantChat();
      return;
    }
    setBusy(btn, true, 'Wird geöffnet …');
    try {
      const s = await b.openGroupChat(vs[key], label);
      await app.forget('chat-spaces');
      app.navigate(`#/chat/${spacePath(s.id)}?name=${encodeURIComponent(label)}`);
    } catch (err) {
      setBusy(btn, false);
      if (err.code === 'chat_scope') grantChat();
      else showError(err);
    }
  }

  el.addEventListener('click', async (e) => {
    const vb = e.target.closest('[data-vorstand]');
    if (vb) contactVorstand(vb);
    if (e.target.closest('[data-action=grant]')) grantChat();
    if (e.target.closest('[data-action=retry]')) app.refresh();
    if (e.target.closest('[data-action=relogin]')) app.relogin();
    if (e.target.closest('[data-action=notify-on]')) {
      await enableNotifications();
      setHtml(el.querySelector('#notify-here'), html`<p class="small">${icon('check', 'icon-sm')} Eingeschaltet – ändern unter Mehr › Einstellungen.</p>`);
    }
  });

  if (!status.available) return;
  // Ungelesenes hervorheben – auch wenn es erst während des Lesens dazukommt
  const off = onChange(() => {
    el.querySelectorAll('.space-row[data-id]').forEach((r) => r.classList.toggle('unread', isUnreadChat(r.dataset.id)));
  });
  try {
    await app.load('chat-spaces', () => b.listSpaces(), (spaces) => {
      if (!ctx.alive()) return;
      setHtml(c, spaces.length
        ? html`<div class="list">${spaces.map((s) => html`
            <a class="card space-row ${isUnreadChat(s.id) ? 'unread' : ''}" href="${roomLink(s)}" data-id="${s.id}">
              ${spaceIcon(s)}
              <div class="grow" style="min-width:0">
                <div class="name ellipsis"><span class="dot-unread" title="Ungelesen"></span>${s.name}</div>
                <div class="sub ellipsis">${spaceSub(s)}</div>
              </div>
              <span class="tiny muted nowrap">${s.lastActive ? relTime(s.lastActive) : ''}</span>
              ${icon('chevronRight', 'icon-sm')}
            </a>`)}</div>`
        : html`<div class="card">${emptyState('chat', 'Noch keine Unterhaltungen', 'Schreib einem Bundesbruder über „Neue Nachricht“ oder gründe eine Gruppe.')}</div>`);
    }, { maxAge: 60_000 });
  } catch (err) {
    setHtml(c, chatBlocked(err) || errorBox(err));
  }
  return off;
}

/* ===================================================================== Neue Nachricht, Gruppe, Personen hinzufügen */

/**
 * #/chat-neu              Direktnachricht: Person antippen
 * #/chat-neu?gruppe=1     Neue Gruppe: Name (optional) und Personen
 * #/chat-neu?raum=<ID>    Personen zu einer Gruppe/einem Raum hinzufügen
 */
export async function newChat(ctx) {
  const { el, app, query } = ctx;
  const b = app.backend;
  const mode = query.raum ? 'add' : query.gruppe ? 'group' : 'dm';
  const roomId = query.raum ? `spaces/${query.raum}` : '';
  const roomName = query.name || '';
  const back = mode === 'add' ? `#/chat/${encodeURIComponent(query.raum)}?name=${encodeURIComponent(roomName)}` : '#/chat';
  const title = mode === 'add' ? 'Personen hinzufügen' : mode === 'group' ? 'Neue Gruppe' : 'Neue Nachricht';
  const sub = mode === 'add' ? roomName : mode === 'group' ? 'Für alle Ausgewählten – in der App und in Google Chat' : 'Wem möchtest du schreiben?';
  setHtml(el, html`${backLink(back, mode === 'add' ? 'Zurück zur Unterhaltung' : 'Alle Unterhaltungen')}${hero(title, sub)}<div id="c">${loading()}</div>`);
  document.title = `${title} · ${config.appName}`;
  const c = el.querySelector('#c');
  const status = b.chatStatus();
  if (!status.available) {
    setHtml(c, unavailable(status));
    c.addEventListener('click', (e) => { if (e.target.closest('[data-action=grant]')) grantChat(); });
    return;
  }
  if (!b.chatCanCreate()) {
    setHtml(c, notice('gold', 'Einmal zustimmen',
      'Für neue Unterhaltungen braucht die App einmalig deine Zustimmung bei Google. Löschen oder jemanden entfernen kann sie damit nicht.',
      html`<p style="margin-top:.625rem"><button class="btn btn-sm btn-primary" data-action="grant">${icon('key', 'icon-sm')}Zustimmen</button></p>`));
    c.addEventListener('click', (e) => { if (e.target.closest('[data-action=grant]')) grantChat(); });
    return;
  }

  let members = [];
  try {
    members = (await b.listMembers()).filter((m) => m.email && m.email !== app.user.email);
  } catch (err) {
    console.warn('Mitglieder nicht geladen', err);
  }
  if (mode === 'add') {
    // wer schon drin ist, wird nicht noch einmal angeboten
    const inside = new Set((await b.listSpaceMembers(roomId).catch(() => [])).map((p) => p.email));
    members = members.filter((m) => !inside.has(m.email));
  }
  if (!ctx.alive()) return;

  const domain = String(config.workspaceDomain || '').toLowerCase();
  const selected = new Map(); // E-Mail → Name
  let q = '';
  setHtml(c, html`
    <form class="card card-pad" id="f" novalidate style="max-width:46rem">
      ${mode === 'group' ? html`<div class="field"><label for="g-name">Name der Gruppe (optional)</label>
        <input class="input" id="g-name" maxlength="128" placeholder="z. B. Stammtisch-Orga" autocomplete="off">
        <span class="hint">Mit Namen entsteht ein Raum, ohne Namen eine Gruppe (ab zwei Personen).</span></div>` : ''}
      ${mode !== 'dm' ? html`<div class="pick-chips" id="chosen"></div>` : ''}
      <div class="search" style="margin-bottom:.625rem">${icon('search')}<input class="input" type="search" id="q" placeholder="Name suchen …" aria-label="Mitglieder durchsuchen" autocomplete="off"></div>
      <div class="pick-list" id="people"></div>
      <div class="field" style="margin-top:1rem"><label for="manual">Oder E-Mail-Adresse eingeben</label>
        <div class="row" style="gap:.5rem"><input class="input grow" id="manual" type="email" inputmode="email" autocomplete="off" placeholder="${domain ? `name@${domain}` : 'name@beispiel.de'}" style="min-width:0">
          <button type="button" class="btn" data-action="manual">${mode === 'dm' ? 'Schreiben' : 'Hinzufügen'}</button></div></div>
      ${mode !== 'dm' ? html`<div class="form-actions">
        <a class="btn btn-ghost" href="${back}">Abbrechen</a>
        <button class="btn btn-primary" type="submit" id="go" disabled>${icon('check', 'icon-sm')}<span id="go-label"></span></button></div>` : ''}
    </form>`);

  const form = el.querySelector('#f');
  const peopleEl = form.querySelector('#people');

  function renderChosen() {
    if (mode === 'dm') return;
    setHtml(form.querySelector('#chosen'), selected.size ? html`${[...selected].map(([email, name]) => html`
      <button type="button" class="chip" data-unpick="${email}" aria-label="${name} entfernen">${name} ${icon('x', 'icon-sm')}</button>`)}` : '');
    const go = form.querySelector('#go');
    go.disabled = !selected.size;
    form.querySelector('#go-label').textContent = mode === 'group'
      ? `Gruppe erstellen${selected.size ? ` (${selected.size + 1} Personen)` : ''}`
      : `Hinzufügen${selected.size ? ` (${selected.size})` : ''}`;
  }

  function renderPeople() {
    const shown = members.filter((m) => matchesQuery([m.name, m.kneipname, m.email].join(' '), q));
    const subOf = (m) => [m.kneipname ? `v/o ${m.kneipname}` : '', m.status].filter(Boolean).join(' · ');
    setHtml(peopleEl, shown.length ? html`${shown.map((m) => (mode === 'dm'
      ? html`<button type="button" class="pick-row" data-email="${m.email}" data-name="${m.name}">
          ${avatar(m, 40)}<span class="grow" style="min-width:0"><span class="name ellipsis">${m.name}</span>${subOf(m) ? html`<span class="sub ellipsis">${subOf(m)}</span>` : ''}</span>${icon('send', 'icon-sm')}</button>`
      : html`<label class="pick-row">
          ${avatar(m, 40)}<span class="grow" style="min-width:0"><span class="name ellipsis">${m.name}</span>${subOf(m) ? html`<span class="sub ellipsis">${subOf(m)}</span>` : ''}</span>
          <input type="checkbox" data-pick="${m.email}" data-name="${m.name}" ${selected.has(m.email) ? 'checked' : ''}></label>`))}`
      : html`<p class="small muted" style="margin:.25rem 0">${members.length ? 'Niemand gefunden.'
        : mode === 'add' ? 'Alle sind schon dabei. Du kannst unten eine E-Mail-Adresse eingeben.'
          : 'Keine anderen Mitglieder sichtbar. Du kannst unten eine E-Mail-Adresse eingeben.'}</p>`);
  }

  async function openDm(email, name) {
    try {
      const s = await b.openDirectChat(email, name);
      await app.forget('chat-spaces');
      app.navigate(`#/chat/${spacePath(s.id)}?name=${encodeURIComponent(name || email)}`, { replace: true });
    } catch (err) {
      if (err.code === 'chat_scope') grantChat();
      else showError(err);
    }
  }

  function manualEmail() {
    const input = form.querySelector('#manual');
    const v = input.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast('Bitte eine gültige E-Mail-Adresse eingeben', { type: 'err' }); return null; }
    if (domain && !v.endsWith(`@${domain}`)) { toast(`Bitte ein Konto der Verbindung (@${domain}) eingeben`, { type: 'err' }); return null; }
    if (v === app.user.email) { toast('Das bist du selbst', { type: 'err' }); return null; }
    input.value = '';
    return v;
  }

  renderPeople();
  renderChosen();

  form.querySelector('#q').addEventListener('input', (e) => { q = e.target.value; renderPeople(); });
  form.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-pick]');
    if (!cb) return;
    if (cb.checked) selected.set(cb.dataset.pick, cb.dataset.name);
    else selected.delete(cb.dataset.pick);
    renderChosen();
  });
  form.addEventListener('click', async (e) => {
    const row = e.target.closest('button.pick-row');
    if (row) {
      row.disabled = true;
      await openDm(row.dataset.email, row.dataset.name);
      row.disabled = false;
      return;
    }
    const un = e.target.closest('[data-unpick]');
    if (un) {
      selected.delete(un.dataset.unpick);
      renderChosen();
      renderPeople();
      return;
    }
    if (e.target.closest('[data-action=manual]')) {
      const v = manualEmail();
      if (!v) return;
      if (mode === 'dm') { await openDm(v, members.find((m) => m.email === v)?.name || v); return; }
      selected.set(v, members.find((m) => m.email === v)?.name || v);
      renderChosen();
      renderPeople();
    }
  });
  form.querySelector('#manual').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); form.querySelector('[data-action=manual]').click(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (mode === 'dm' || !selected.size) return;
    const go = form.querySelector('#go');
    setBusy(go, true, mode === 'group' ? 'Wird erstellt …' : 'Wird hinzugefügt …');
    try {
      if (mode === 'group') {
        const g = await b.createGroup({ name: form.querySelector('#g-name').value, emails: [...selected.keys()] });
        await app.forget('chat-spaces');
        toast('Gruppe erstellt');
        app.navigate(`#/chat/${spacePath(g.id)}?name=${encodeURIComponent(g.name || [...selected.values()].map((n) => n.split(' ')[0]).join(', '))}`, { replace: true });
      } else {
        const r = await b.addMembers(roomId, [...selected.keys()]);
        const parts = [r.added.length ? `${r.added.length} hinzugefügt` : '', r.already.length ? `${r.already.length} war(en) schon dabei` : '', r.failed.length ? `${r.failed.length} nicht möglich` : ''].filter(Boolean);
        toast(parts.join(' · ') || 'Erledigt', { type: r.failed.length ? 'err' : 'info', timeout: 6000 });
        if (r.failed.length) console.warn('Nicht hinzugefügt', r.failed);
        app.navigate(back, { replace: true });
      }
    } catch (err) {
      setBusy(go, false);
      if (err.code === 'chat_scope') grantChat();
      else showError(err);
    }
  });
}

/* ===================================================================== Unterhaltung */

function dayLabel(d) {
  const t = new Date();
  if (isSameDay(d, t)) return 'Heute';
  if (isSameDay(d, addDays(t, -1))) return 'Gestern';
  return fDateNoYear(d);
}

export async function room(ctx) {
  const { el, app, params, query } = ctx;
  const b = app.backend;
  const spaceId = `spaces/${params.space}`;
  const status = b.chatStatus();
  let name = query.name || 'Chat';
  if (!status.available) {
    setHtml(el, html`${backLink('#/chat', 'Alle Unterhaltungen')}<div style="margin-top:1rem">${unavailable(status)}</div>`);
    el.addEventListener('click', (e) => { if (e.target.closest('[data-action=grant]')) grantChat(); });
    return;
  }
  const draftKey = `fb.chatDraft.${spaceId}`;
  document.body.classList.add('chat-open');
  setHtml(el, html`
    <div class="card chat-room">
      <div class="chat-head">
        <a class="btn btn-ghost btn-icon btn-sm" href="#/chat" data-back aria-label="Zurück">${icon('chevronLeft')}</a>
        <span class="space-icon" id="room-icon" style="width:2.25rem;height:2.25rem;font-size:1rem;border-radius:10px" aria-hidden="true">${initialOf(name)}</span>
        <h2 class="grow ellipsis" id="room-name">${name}</h2>
        <a class="btn btn-ghost btn-sm hidden" id="add-people" href="#/chat" title="Personen hinzufügen">${icon('plus', 'icon-sm')}<span class="hide-sm">Personen</span></a>
        <a class="btn btn-ghost btn-sm" id="open-ext" href="${CHAT_HOME}" target="_blank" rel="noopener" title="In Google Chat öffnen">${icon('external', 'icon-sm')}<span class="hide-sm">Google Chat</span></a>
      </div>
      <div class="chat-scroll" id="scroll" aria-live="polite">${loading()}</div>
      <div class="chat-hint hidden" id="send-hint" role="status"></div>
      <form class="chat-compose" id="compose">
        <textarea class="textarea" id="msg" rows="1" placeholder="Nachricht schreiben …" aria-label="Nachricht" maxlength="4000">${local.get(draftKey, '')}</textarea>
        <button class="btn btn-primary" type="submit" aria-label="Senden">${icon('send', 'icon-sm')}</button>
      </form>
    </div>`);

  const scroll = el.querySelector('#scroll');
  const input = el.querySelector('#msg');
  const hintBox = el.querySelector('#send-hint');
  let messages = [];
  let timer = null;
  let stopped = false;
  // Wer unten (bei der neuesten Nachricht) war, bleibt unten – auch wenn die Tastatur den Bereich verkleinert
  let atBottom = true;
  scroll.addEventListener('scroll', () => { atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 48; }, { passive: true });
  const keepBottom = window.ResizeObserver ? new ResizeObserver(() => { if (atBottom) scroll.scrollTop = scroll.scrollHeight; }) : null;
  keepBottom?.observe(scroll);
  // Tastatur geht auf: danach wieder zur neuesten Nachricht (falls man dort war)
  input.addEventListener('focus', () => { if (atBottom) setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 350); });

  // Name, Art und Link der Unterhaltung ergänzen (auch wenn direkt aufgerufen)
  b.listSpaces().then((spaces) => {
    const s = spaces.find((x) => x.id === spaceId);
    if (!s || !ctx.alive()) return;
    name = s.name;
    el.querySelector('#room-name').textContent = s.name;
    if (s.url) el.querySelector('#open-ext').href = s.url;
    if (s.type === 'DIRECT_MESSAGE') {
      const ic = el.querySelector('#room-icon');
      ic.outerHTML = avatar({ name: s.name, photo: s.photo || '' }, 36).toString();
    } else {
      // Gruppen und Räume: Personen hinzufügen (ob man darf, entscheidet Google)
      const add = el.querySelector('#add-people');
      add.href = `#/chat-neu?raum=${spacePath(spaceId)}&name=${encodeURIComponent(s.name)}`;
      add.classList.remove('hidden');
    }
  }).catch(() => {});

  function render(stickToBottom = true) {
    const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120;
    if (!messages.length) {
      setHtml(scroll, emptyState('chat', 'Noch keine Nachrichten', 'Schreib die erste!'));
      return;
    }
    const parts = [];
    let prev = null;
    for (const m of messages) {
      const d = toDate(m.created);
      if (!prev || !isSameDay(toDate(prev.created), d)) parts.push(html`<div class="day-sep">${dayLabel(d)}</div>`);
      const cont = prev && prev.sender.name === m.sender.name && isSameDay(toDate(prev.created), d) && d - toDate(prev.created) < 10 * 60_000;
      parts.push(html`<div class="msg ${m.mine ? 'me' : ''} ${cont ? 'cont' : ''}">
        ${m.mine ? '' : avatar(m.sender, 30)}
        <div class="bubble">${m.mine ? '' : html`<div class="who">${m.sender.name}</div>`}${linkify(m.text)}<time datetime="${m.created}">${fTime(d)}</time></div>
      </div>`);
      prev = m;
    }
    setHtml(scroll, html`${parts}`);
    if (stickToBottom || nearBottom) scroll.scrollTop = scroll.scrollHeight;
  }

  async function poll() {
    if (stopped || document.visibilityState !== 'visible') return;
    try {
      const since = messages.length ? messages[messages.length - 1].created : undefined;
      const fresh = await b.listMessages(spaceId, { since });
      const known = new Set(messages.map((m) => m.id));
      const add = fresh.filter((m) => !known.has(m.id));
      if (add.length && ctx.alive()) {
        messages = [...messages, ...add];
        render(false);
        markChatRead(spaceId, messages[messages.length - 1].created);
      }
    } catch (err) {
      console.warn('Chat-Aktualisierung fehlgeschlagen', err);
    }
  }

  try {
    messages = await b.listMessages(spaceId, { pageSize: 80 });
    if (!ctx.alive()) { document.body.classList.remove('chat-open'); return; }
    render(true);
    markChatRead(spaceId, messages[messages.length - 1]?.created);
  } catch (err) {
    setHtml(scroll, errorBox(err));
  }
  timer = setInterval(poll, 5000);

  const autosize = () => {
    input.style.height = 'auto';
    const max = parseFloat(getComputedStyle(input).maxHeight) || 140;
    input.style.height = `${Math.min(max, input.scrollHeight)}px`;
  };
  input.addEventListener('input', () => { local.set(draftKey, input.value); autosize(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) {
      e.preventDefault();
      el.querySelector('#compose').requestSubmit();
    }
  });
  autosize();

  el.querySelector('#compose').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const msg = await b.sendMessage(spaceId, text);
      input.value = '';
      local.del(draftKey);
      autosize();
      hintBox.classList.add('hidden');
      if (!messages.some((m) => m.id === msg.id)) messages.push(msg);
      render(true);
      markChatRead(spaceId, msg.created);
      setTimeout(poll, 4500);
    } catch (err) {
      // Knopf im Hinweis führt zur Unterhaltung bei Google (Adresse wie „Google Chat“ oben), Admins bei Chat-Apps zur Einstellung
      const hint = sendRefusal(err, { url: el.querySelector('#open-ext')?.href || '', admin: app.isAdmin() });
      if (!hint) showError(err);
      else {
        console.error(err);
        setHtml(hintBox, hint);
        hintBox.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false;
      input.focus();
    }
  });

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=retry]')) app.refresh();
    if (e.target.closest('[data-action=relogin]')) app.relogin();
  });

  return () => {
    stopped = true;
    clearInterval(timer);
    keepBottom?.disconnect();
    document.body.classList.remove('chat-open');
  };
}
