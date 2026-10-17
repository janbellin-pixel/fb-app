// Chat über Google Chat: Räume der Verbindung und Unterhaltungen
import { html, setHtml, icon, hero, backLink, avatar, skeletonList, emptyState, errorBox, notice, toast, showError, loading } from '../ui.js';
import { relTime, fTime, isSameDay, addDays, fDateNoYear, toDate } from '../lib/dates.js';
import { linkify } from '../lib/text.js';
import * as auth from '../auth.js';
import { local } from '../lib/store.js';

const CHAT_HOME = 'https://chat.google.com/';

function unavailable(status, app) {
  if (status.reason === 'no-workspace') {
    return notice('gold', 'Chat braucht Google Workspace',
      'Der Chat der App nutzt Google Chat im Workspace der Verbindung. Mit dem aktuellen Konto ist die Einbindung nicht möglich – Google Chat selbst kannst du aber jederzeit öffnen.',
      html`<p style="margin-top:.625rem"><a class="btn btn-sm btn-primary" href="${CHAT_HOME}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Google Chat öffnen</a></p>`);
  }
  if (status.reason === 'scope') {
    return notice('gold', 'Chat noch nicht freigeschaltet',
      'Damit die App deine Chat-Räume anzeigen und Nachrichten senden kann, braucht sie einmalig deine Zustimmung bei Google.',
      html`<p style="margin-top:.625rem"><button class="btn btn-sm btn-primary" data-action="grant">${icon('key', 'icon-sm')}Chat freischalten</button></p>`);
  }
  return notice('gold', 'Chat ist deaktiviert', 'Die Chat-Funktion wurde in der Konfiguration ausgeschaltet.');
}

export default async function chat(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  const status = b.chatStatus();
  setHtml(el, html`
    ${hero('Chat', 'Die Räume der Verbindung in Google Chat', html`<a class="btn" href="${CHAT_HOME}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Google Chat öffnen</a>`)}
    <div id="c">${status.available ? skeletonList(4, 'sk-card') : unavailable(status, app)}</div>
    <div class="notice" style="margin-top:1.125rem">${icon('smartphone')}<div><h3>Tipp: Benachrichtigungen</h3>
      <p>Für Push-Mitteilungen bei neuen Nachrichten die App „Google Chat“ auf dem Handy installieren und mit dem Verbindungskonto anmelden. Alle Räume sind dort und hier gleich.</p></div></div>`);
  const c = el.querySelector('#c');

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=grant]')) {
      auth.login({ extraScopes: auth.SCOPES.workspace, consent: true, returnTo: '#/chat' });
    }
    if (e.target.closest('[data-action=retry]')) app.refresh();
    if (e.target.closest('[data-action=relogin]')) app.relogin();
  });

  if (!status.available) return;
  try {
    await app.load('chat-spaces', () => b.listSpaces(), (spaces) => {
      if (!ctx.alive()) return;
      setHtml(c, spaces.length
        ? html`<div class="list">${spaces.map((s) => html`
            <a class="card space-row" href="#/chat/${encodeURIComponent(s.id.replace('spaces/', ''))}?name=${encodeURIComponent(s.name)}">
              <span class="space-icon" aria-hidden="true">${s.type === 'DIRECT_MESSAGE' ? icon('user') : s.name.replace(/^[^A-Za-zÄÖÜäöü]*/, '').charAt(0).toUpperCase() || '#'}</span>
              <div class="grow" style="min-width:0">
                <div class="name ellipsis">${s.name}</div>
                <div class="sub ellipsis">${s.description || (s.type === 'DIRECT_MESSAGE' ? 'Direktnachricht' : 'Gruppenraum')}</div>
              </div>
              <span class="tiny muted nowrap">${s.lastActive ? relTime(s.lastActive) : ''}</span>
              ${icon('chevronRight', 'icon-sm')}
            </a>`)}</div>`
        : html`<div class="card">${emptyState('chat', 'Noch keine Räume', 'Du bist noch in keinem Chat-Raum der Verbindung. Frag die Admins, dich hinzuzufügen.')}</div>`);
    }, { maxAge: 60_000 });
  } catch (err) {
    setHtml(c, errorBox(err));
  }
}

/* ===================================================================== Raum */

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
    setHtml(el, html`${backLink('#/chat', 'Alle Räume')}<div style="margin-top:1rem">${unavailable(status, app)}</div>`);
    return;
  }
  const draftKey = `fb.chatDraft.${spaceId}`;
  document.body.classList.add('chat-open');
  setHtml(el, html`
    <div class="card chat-room">
      <div class="chat-head">
        <a class="btn btn-ghost btn-icon btn-sm" href="#/chat" data-back aria-label="Zurück">${icon('chevronLeft')}</a>
        <span class="space-icon" style="width:2.25rem;height:2.25rem;font-size:1rem;border-radius:10px" aria-hidden="true">${name.replace(/^[^A-Za-zÄÖÜäöü]*/, '').charAt(0).toUpperCase() || '#'}</span>
        <h2 class="grow ellipsis" id="room-name">${name}</h2>
        <a class="btn btn-ghost btn-sm" id="open-ext" href="${CHAT_HOME}" target="_blank" rel="noopener" title="In Google Chat öffnen">${icon('external', 'icon-sm')}<span class="hide-sm">Google Chat</span></a>
      </div>
      <div class="chat-scroll" id="scroll" aria-live="polite">${loading()}</div>
      <form class="chat-compose" id="compose">
        <textarea class="textarea" id="msg" rows="1" placeholder="Nachricht schreiben …" aria-label="Nachricht" maxlength="4000">${local.get(draftKey, '')}</textarea>
        <button class="btn btn-primary" type="submit" aria-label="Senden">${icon('send', 'icon-sm')}</button>
      </form>
    </div>`);

  const scroll = el.querySelector('#scroll');
  const input = el.querySelector('#msg');
  let messages = [];
  let timer = null;
  let stopped = false;

  // Raumname und Link ergänzen, falls direkt aufgerufen
  b.listSpaces().then((spaces) => {
    const s = spaces.find((x) => x.id === spaceId);
    if (s && ctx.alive()) {
      name = s.name;
      el.querySelector('#room-name').textContent = s.name;
      if (s.url) el.querySelector('#open-ext').href = s.url;
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
      }
    } catch (err) {
      console.warn('Chat-Aktualisierung fehlgeschlagen', err);
    }
  }

  try {
    messages = await b.listMessages(spaceId, { pageSize: 80 });
    if (!ctx.alive()) { document.body.classList.remove('chat-open'); return; }
    render(true);
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
      if (!messages.some((m) => m.id === msg.id)) messages.push(msg);
      render(true);
      setTimeout(poll, 4500);
    } catch (err) {
      showError(err);
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
    document.body.classList.remove('chat-open');
  };
}
