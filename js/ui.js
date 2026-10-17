// Wiederverwendbare Oberflächen-Bausteine
import { html, raw, setHtml, esc, SafeHtml } from './html.js';
import { icon } from './icons.js';
import { initials } from './lib/text.js';

export { html, raw, setHtml, esc, icon };

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Ereignis-Delegation: on(el, 'click', '[data-action=x]', (e, target) => …) */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest?.(selector);
    if (t && root.contains(t)) handler(e, t);
  });
}

/* ---------------------------------------------------------------- Meldungen */
let toastRoot = null;
export function toast(message, { type = 'ok', action, onAction, timeout = 3800 } = {}) {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toasts';
    toastRoot.setAttribute('role', 'status');
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastRoot);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  setHtml(el, html`${icon(type === 'err' ? 'alert' : type === 'info' ? 'info' : 'check')}<span>${message}</span>${action ? html`<button type="button">${action}</button>` : ''}`);
  const remove = () => el.remove();
  el.querySelector('button')?.addEventListener('click', () => { remove(); onAction?.(); });
  toastRoot.appendChild(el);
  setTimeout(remove, action ? Math.max(timeout, 7000) : timeout);
  return remove;
}

/* ---------------------------------------------------------------- Dialoge */
export function openModal({ title, body, actions = [], onOpen, dismissable = true }) {
  let resolveFn;
  const result = new Promise((r) => { resolveFn = r; });
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  setHtml(backdrop, html`
    <div class="modal" role="dialog" aria-modal="true" aria-label="${title || 'Dialog'}">
      <div class="modal-head">
        <h2>${title || ''}</h2>
        ${dismissable ? html`<button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Schließen">${icon('x')}</button>` : ''}
      </div>
      <div class="modal-body"></div>
      ${actions.length ? html`<div class="modal-foot">${actions.map((a, i) => html`
        <button type="button" class="btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'green' ? 'btn-green' : a.kind === 'danger' ? 'btn-danger' : a.kind === 'ghost' ? 'btn-ghost' : ''}" data-i="${i}">${a.label}</button>`)}
      </div>` : ''}
    </div>`);
  const bodyEl = backdrop.querySelector('.modal-body');
  if (body instanceof Node) bodyEl.appendChild(body);
  else setHtml(bodyEl, body instanceof SafeHtml ? body : html`<p>${body ?? ''}</p>`);
  const prevFocus = document.activeElement;
  const close = (value = null) => {
    if (!backdrop.isConnected) return;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
    resolveFn(value);
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(null); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', async (e) => {
    if (e.target === backdrop && dismissable) return close(null);
    if (e.target.closest('[data-close]')) return close(null);
    const btn = e.target.closest('[data-i]');
    if (!btn) return;
    const a = actions[+btn.dataset.i];
    if (a.onClick) {
      btn.disabled = true;
      try {
        const keepOpen = await a.onClick(bodyEl, close);
        if (keepOpen === false) { btn.disabled = false; return; }
      } catch (err) {
        btn.disabled = false;
        showError(err);
        return;
      }
    }
    close(a.value ?? a.label);
  });
  document.body.appendChild(backdrop);
  onOpen?.(bodyEl, close);
  setTimeout(() => (backdrop.querySelector('input, textarea, select') || backdrop.querySelector('.modal-foot .btn-primary, .modal-foot .btn-green'))?.focus(), 30);
  return { el: bodyEl, close, result };
}

export function confirmDialog(text, { title = 'Bist du sicher?', ok = 'OK', danger = false } = {}) {
  return openModal({
    title,
    body: text,
    actions: [
      { label: 'Abbrechen', value: false, kind: 'ghost' },
      { label: ok, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  }).result.then((v) => v === true);
}

/* ---------------------------------------------------------------- Avatare */
const AV_COLORS = ['#1f1f1f', '#46700f', '#7a5f0c', '#4b4b4b', '#2f5a0b', '#8a6d1a', '#353535', '#5e8a14', '#6b4f0e'];
export function colorFor(s) {
  let h = 0;
  for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

export function sizedPhoto(url, px) {
  if (!url) return '';
  if (/googleusercontent\.com/.test(url)) {
    if (/=s\d+(-c)?(-[a-z0-9]+)*$/i.test(url)) return url.replace(/=s\d+(-c)?(-[a-z0-9]+)*$/i, `=s${px}-c`);
    if (/\/s\d+(-c)?\//.test(url)) return url.replace(/\/s\d+(-c)?\//, `/s${px}-c/`);
    if (!url.includes('=')) return `${url}=s${px}-c`;
  }
  return url;
}

export function avatar(person, size = 40, cls = '') {
  const name = person?.name || person?.email || '?';
  const style = `--s:${size / 16}rem`;
  const photo = person?.photo ? sizedPhoto(person.photo, Math.min(512, Math.round(size * 2))) : '';
  if (photo) {
    return html`<img class="avatar ${cls}" style="${style}" src="${photo}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback="${initials(name)}" data-color="${colorFor(name)}">`;
  }
  return html`<span class="avatar avatar-initials ${cls}" style="${style};--av:${colorFor(name)}" aria-hidden="true">${initials(name)}</span>`;
}

// Fehlgeschlagene Profilbilder durch Initialen ersetzen (ohne Inline-Skripte)
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName !== 'IMG' || img.dataset.fallback === undefined) return;
  const span = document.createElement('span');
  span.className = `${img.className} avatar-initials`;
  span.setAttribute('style', `${img.getAttribute('style') || ''};--av:${img.dataset.color}`);
  span.textContent = img.dataset.fallback;
  img.replaceWith(span);
}, true);

export function avatarStack(people, max = 5, size = 28) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return html`<span class="avatar-stack">${shown.map((p) => avatar(p, size))}${rest > 0 ? html`<span class="more">+${rest}</span>` : ''}</span>`;
}

/* ---------------------------------------------------------------- Seitenteile */
export function hero(title, subtitle = '', actions = '') {
  return html`<section class="hero">
    <div class="hero-box"><h1>${title}</h1>${subtitle ? html`<p>${subtitle}</p>` : ''}</div>
    ${actions ? html`<div class="hero-actions">${actions}</div>` : ''}
  </section>`;
}

export function backLink(href, label = 'Zurück') {
  return html`<a class="back-link" href="${href}" data-back>${icon('chevronLeft', 'icon-sm')}${label}</a>`;
}

export function sectionTitle(title, link = null) {
  return html`<div class="section-title"><h2>${title}</h2>${link ? html`<a href="${link.href}">${link.label}</a>` : ''}</div>`;
}

export function skeletonList(n = 4, cls = 'sk-card') {
  return html`<div class="list">${Array.from({ length: n }, () => html`<div class="skeleton ${cls}"></div>`)}</div>`;
}

export function loading(text = 'Wird geladen …') {
  return html`<div class="center-load"><span class="spinner" role="progressbar" aria-label="${text}"></span></div>`;
}

export function emptyState(iconName, title, text = '', action = '') {
  return html`<div class="empty">${icon(iconName)}<h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action}</div>`;
}

export function notice(kind, title, text, action = '') {
  const ic = kind === 'red' ? 'alert' : kind === 'gold' ? 'info' : kind === 'green' ? 'check' : 'info';
  return html`<div class="notice notice-${kind}">${icon(ic)}<div class="grow">${title ? html`<h3>${title}</h3>` : ''}${text ? html`<p>${text}</p>` : ''}${action}</div></div>`;
}

/* ---------------------------------------------------------------- Fehler */
export function describeError(err) {
  const status = err?.status;
  const reason = String(err?.reason || '');
  const msg = String(err?.message || err || 'Unbekannter Fehler');
  if (err?.code === 'write_blocked') {
    return { title: 'Nicht erlaubt', text: 'Die App ändert nur deine eigenen Daten (Zusage, Profil, eigene Beiträge). Gemeinsame Daten werden direkt in Google gepflegt.', kind: 'gold' };
  }
  if (err?.code === 'not_invited') {
    return { title: 'Nicht eingeladen', text: err.message, kind: 'gold' };
  }
  if (err?.code === 'not_configured') {
    return { title: 'Noch nicht eingerichtet', text: msg, kind: 'gold', setup: true };
  }
  if (err?.code === 'scope') {
    return { title: 'Berechtigung fehlt', text: 'Bitte melde dich erneut an und erlaube der App alle angefragten Zugriffe.', kind: 'gold', relogin: true };
  }
  if (status === 0 || reason === 'network') {
    return { title: 'Keine Verbindung', text: 'Bitte prüfe deine Internetverbindung und versuche es erneut.', kind: 'red' };
  }
  if (status === 401) {
    return { title: 'Sitzung abgelaufen', text: 'Bitte melde dich erneut an.', kind: 'gold', relogin: true };
  }
  if (status === 403) {
    if (/insufficient|scope/i.test(msg + reason)) {
      return { title: 'Berechtigung fehlt', text: 'Bitte melde dich erneut an und setze bei der Google-Abfrage alle Häkchen.', kind: 'gold', relogin: true };
    }
    if (/not enabled|has not been used|disabled/i.test(msg)) {
      return { title: 'Google-Schnittstelle nicht aktiviert', text: `Die benötigte Google-API ist im Cloud-Projekt nicht aktiviert. Details: ${msg}`, kind: 'red' };
    }
    return { title: 'Kein Zugriff', text: 'Du hast keinen Zugriff auf diese Daten. Bitte wende dich an die Admins der App, damit sie dir die Freigabe erteilen.', kind: 'red' };
  }
  if (status === 404) {
    return { title: 'Nicht gefunden', text: 'Die Daten wurden nicht gefunden. Vielleicht ist die Konfiguration unvollständig oder die Datei wurde gelöscht.', kind: 'red', setup: true };
  }
  if (status === 429) {
    return { title: 'Zu viele Anfragen', text: 'Google bremst gerade die Anfragen. Bitte versuche es in einer Minute erneut.', kind: 'gold' };
  }
  return { title: 'Etwas ist schiefgelaufen', text: msg, kind: 'red' };
}

export function errorBox(err, { retry = true } = {}) {
  const d = describeError(err);
  return notice(d.kind, d.title, d.text, html`<div class="row wrap" style="margin-top:.625rem">
    ${retry ? html`<button class="btn btn-sm" data-action="retry">${icon('refresh', 'icon-sm')}Erneut versuchen</button>` : ''}
    ${d.relogin ? html`<button class="btn btn-sm btn-primary" data-action="relogin">Neu anmelden</button>` : ''}
    ${d.setup ? html`<a class="btn btn-sm" href="#/einrichtung">Zur Einrichtung</a>` : ''}
  </div>`);
}

export function showError(err, fallback = 'Das hat nicht geklappt') {
  console.error(err);
  const d = describeError(err);
  toast(`${d.title || fallback}${d.text && d.title !== d.text ? `: ${d.text}` : ''}`, { type: 'err', timeout: 7000 });
}

/* ---------------------------------------------------------------- Sonstiges */
export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${label ? esc(label) : ''}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value.trim();
  }
  return out;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('In die Zwischenablage kopiert');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('In die Zwischenablage kopiert'); } catch { toast('Kopieren nicht möglich', { type: 'err' }); }
    ta.remove();
  }
}

export async function shareLink(title, url, text = '') {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  await copyText(url);
}

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Skript konnte nicht geladen werden: ${src}`));
    document.head.appendChild(s);
  });
}

/** Bild verkleinern (für Uploads) */
export async function resizeImage(file, maxSize = 1600, quality = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}
