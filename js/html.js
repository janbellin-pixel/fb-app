// Sicheres HTML-Templating: Alle eingesetzten Werte werden maskiert,
// außer sie wurden ausdrücklich mit raw() bzw. als html`` erzeugt.

export class SafeHtml {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);

export const raw = (s) => new SafeHtml(s == null ? '' : String(s));

function part(v) {
  // false/null → nichts (für `${bedingung && html`…`}`), true → "true"
  if (v == null || v === false) return '';
  if (v === true) return 'true';
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}

// direkt in einem aria-Attribut: Wahrheitswerte ausschreiben (aria-pressed="${a === b}" → "true"/"false")
const ARIA_ATTR = /\saria-[a-z]+="$/;

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out += (typeof v === 'boolean' && ARIA_ATTR.test(strings[i]) ? String(v) : part(v)) + strings[i + 1];
  }
  return new SafeHtml(out);
}

export function setHtml(el, content) {
  el.innerHTML = part(content);
  return el;
}

export function toHtmlString(content) {
  return part(content);
}
