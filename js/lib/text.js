// Text-Hilfen: Suche, Links, einfache Formatierung (Markdown-Teilmenge)
import { esc, raw } from '../html.js';

/** Für Suche/Sortierung: Kleinbuchstaben, Umlaute vereinheitlicht */
export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
}

export function matchesQuery(haystack, query) {
  const q = norm(query);
  if (!q) return true;
  const h = norm(haystack);
  return q.split(/\s+/).every((part) => h.includes(part));
}

const URL_RE = /(^|[\s(>])((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"])/g;

function anchor(url, text) {
  const href = url.startsWith('www.') ? `https://${url}` : url;
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

/** Klartext → HTML mit klickbaren Links (Zeilenumbrüche bleiben über CSS erhalten) */
export function linkify(text) {
  return raw(esc(text).replace(URL_RE, (_, pre, url) => pre + anchor(url, url)));
}

/** Einfache Formatierung: **fett**, *kursiv*, [Text](Link), Listen, > Zitat, ## Überschrift */
export function markdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null;
  let quote = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join('\n')).replace(/\n/g, '<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${inline(quote.join('\n')).replace(/\n/g, '<br>')}</blockquote>`);
    quote = [];
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  for (const line of lines) {
    let m;
    if (!line.trim()) { flushAll(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.+)$/))) {
      flushAll();
      const lvl = m[1].length === 1 ? 2 : 3;
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
      continue;
    }
    if ((m = line.match(/^\s*[-*•]\s+(.+)$/))) {
      flushPara(); flushQuote();
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.+)$/))) {
      flushPara(); flushQuote();
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); flushList();
      quote.push(m[1]);
      continue;
    }
    flushList(); flushQuote();
    para.push(line);
  }
  flushAll();
  return raw(out.join('\n'));
}

function inline(text) {
  let s = esc(text);
  const links = [];
  const keep = (htmlStr) => { links.push(htmlStr); return `\u0000${links.length - 1}\u0000`; };
  s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (_, t, u) => keep(anchor(u, t)));
  s = s.replace(URL_RE, (_, pre, url) => pre + keep(anchor(url, url)));
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\n]+)_(?![\w])/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  s = s.replace(/&#96;([^\n]+?)&#96;/g, '<code>$1</code>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => links[+i]);
}

/** Markdown-Zeichen entfernen – für Vorschautexte */
export function plainText(src, max = 0) {
  let s = String(src ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (max && s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, '') + ' …';
  return s;
}

/** HTML aus Google-Kalender-Beschreibungen sicher in Text umwandeln */
export function htmlToText(input) {
  const src = String(input ?? '');
  if (!/<[a-z][\s\S]*>/i.test(src)) return src;
  const doc = new DOMParser().parseFromString(`<div id="r">${src}</div>`, 'text/html');
  const root = doc.getElementById('r');
  let out = '';
  const walk = (node) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += n.nodeValue; continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === 'br') { out += '\n'; continue; }
      if (tag === 'a') {
        const href = n.getAttribute('href') || '';
        const text = n.textContent || '';
        out += href && text && !text.includes(href.replace(/^https?:\/\//, '')) && /^https?:/i.test(href)
          ? `${text} (${href})` : (text || href);
        continue;
      }
      if (tag === 'li') out += '\n• ';
      walk(n);
      if (['p', 'div', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'blockquote'].includes(tag)) out += '\n';
    }
  };
  walk(root);
  return out.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function newId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** ID für Google-Kalender-Termine (nur Zeichen a–v und 0–9 erlaubt) */
export function calendarEventId() {
  const chars = '0123456789abcdefghijklmnopqrstuv';
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'fb' + Array.from(bytes, (b) => chars[b % 32]).join('');
}

export function firstName(name) {
  const parts = String(name || '').replace(/^(?:(?:prof|dr|dipl)\.?(?:-\w+\.?)?\s+)+/i, '').trim().split(/\s+/);
  return parts[0] || '';
}

export function initials(name) {
  const parts = String(name || '?')
    .replace(/\(.*?\)|v\/o.*$/gi, '')
    .split(/[\s@._-]+/)
    .filter((p) => p && !/^(dr|prof|dipl|ing|med|jur|rer|nat)\.?$/i.test(p));
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
