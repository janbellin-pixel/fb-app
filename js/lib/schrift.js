// Schriftgröße der App (pro Gerät): Klein, Normal, Groß, Sehr groß
import { html } from '../html.js';
import { local } from './store.js';

const KEY = 'fb.schrift';

export const STUFEN = [
  { id: 'klein', label: 'Klein', vorschau: 14 },
  { id: 'normal', label: 'Normal', vorschau: 17 },
  { id: 'gross', label: 'Groß', vorschau: 21 },
  { id: 'sehr-gross', label: 'Sehr groß', vorschau: 25 },
];

export function getSchrift() {
  const s = local.get(KEY, 'normal');
  return STUFEN.some((x) => x.id === s) ? s : 'normal';
}

export function setSchrift(id) {
  local.set(KEY, id);
  if (id === 'normal') document.documentElement.removeAttribute('data-schrift');
  else document.documentElement.setAttribute('data-schrift', id);
}

/** Auswahl mit Vorschau „Aa“ in der jeweiligen Größe */
export function schriftAuswahl() {
  const aktuell = getSchrift();
  return html`<div class="schrift" role="radiogroup" aria-label="Schriftgröße">
    ${STUFEN.map((s) => html`
      <button type="button" class="schrift-btn" role="radio" aria-checked="${s.id === aktuell}" data-stufe="${s.id}">
        <span class="aa" style="font-size:${s.vorschau}px" aria-hidden="true">Aa</span>
        <span class="lbl">${s.label}</span>
      </button>`)}
  </div>`;
}

export function bindSchriftAuswahl(root, onChange) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-stufe]');
    if (!btn || !root.contains(btn)) return;
    setSchrift(btn.dataset.stufe);
    root.querySelectorAll('[data-stufe]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    onChange?.(btn.dataset.stufe);
  });
}
