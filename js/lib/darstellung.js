// Darstellung der App (pro Gerät, E53): Hell, Dunkel oder wie das System.
// Wirksam ist allein `html[data-theme="dunkel"]` – js/boot.js setzt es vor dem ersten Zeichnen,
// hier wird es bei einer Änderung der Wahl oder der Systemeinstellung nachgeführt.
import { html } from '../html.js';
import { local } from './store.js';

const KEY = 'fb.darstellung';
const SYSTEM_DUNKEL = '(prefers-color-scheme: dark)';
/** Farbe der Browser-Leiste (theme-color) je Darstellung – wie --bg in css/app.css */
export const LEISTENFARBE = { hell: '#f3f3f3', dunkel: '#141414' };

export const DARSTELLUNGEN = [
  { id: 'system', label: 'Wie das System', sub: 'folgt dem Gerät' },
  { id: 'hell', label: 'Hell', sub: '' },
  { id: 'dunkel', label: 'Dunkel', sub: '' },
];

export function getDarstellung() {
  const d = local.get(KEY, 'system');
  return DARSTELLUNGEN.some((x) => x.id === d) ? d : 'system';
}

/** Ist die App gerade dunkel? (gewählt oder – bei „System“ – laut Gerät) */
export function istDunkel(wahl = getDarstellung()) {
  if (wahl === 'dunkel') return true;
  if (wahl === 'hell') return false;
  try { return matchMedia(SYSTEM_DUNKEL).matches; } catch { return false; }
}

/** Attribut am <html> und Farbe der Browser-Leiste nachführen */
export function anwenden(wahl = getDarstellung()) {
  const dunkel = istDunkel(wahl);
  const root = document.documentElement;
  if (dunkel) root.setAttribute('data-theme', 'dunkel');
  else root.removeAttribute('data-theme');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dunkel ? LEISTENFARBE.dunkel : LEISTENFARBE.hell);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', dunkel ? 'dark' : 'light');
  return dunkel;
}

export function setDarstellung(id) {
  const wahl = DARSTELLUNGEN.some((x) => x.id === id) ? id : 'system';
  local.set(KEY, wahl);
  return anwenden(wahl);
}

/** Beim Start: anwenden und bei „System“ der Systemeinstellung folgen */
export function startDarstellung() {
  anwenden();
  try {
    matchMedia(SYSTEM_DUNKEL).addEventListener('change', () => { if (getDarstellung() === 'system') anwenden('system'); });
  } catch { /* alter Browser */ }
}

/** Auswahl mit kleiner Vorschau (hell, dunkel, halb/halb) */
export function darstellungAuswahl() {
  const aktuell = getDarstellung();
  return html`<div class="darstellung" role="radiogroup" aria-label="Darstellung">
    ${DARSTELLUNGEN.map((d) => html`
      <button type="button" class="schrift-btn darstellung-btn" role="radio" aria-checked="${d.id === aktuell}" data-darstellung="${d.id}">
        <span class="muster muster-${d.id}" aria-hidden="true"></span>
        <span class="lbl">${d.label}</span>
      </button>`)}
  </div>`;
}

export function bindDarstellungAuswahl(root, onChange) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-darstellung]');
    if (!btn || !root.contains(btn)) return;
    setDarstellung(btn.dataset.darstellung);
    root.querySelectorAll('[data-darstellung]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    onChange?.(btn.dataset.darstellung);
  });
}
