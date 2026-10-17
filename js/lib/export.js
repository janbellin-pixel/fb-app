// Export: Kalenderdateien (.ics), Kontakte (.vcf), Google-Kalender-Vorlagen
import { toDate, addDays } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');

function utcStamp(d) {
  d = toDate(d);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function dateOnly(d) {
  d = toDate(d);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function icsText(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Zeilen nach RFC 5545 auf 75 Bytes falten */
function fold(line) {
  const enc = new TextEncoder();
  const parts = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function eventsToIcs(events, { calendarName = 'Termine', linkFor } = {}) {
  const now = utcStamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Frankonia-Brunonia//Mitglieder-App//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(calendarName)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
  ];
  for (const ev of events) {
    const link = linkFor ? linkFor(ev) : '';
    const desc = [ev.description, link && `Zu-/Absage in der App: ${link}`].filter(Boolean).join('\n\n');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${icsText(ev.iCalUID || `${ev.id}@fb-app`)}`);
    lines.push(`DTSTAMP:${now}`);
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(ev.start)}`);
      lines.push(`DTEND;VALUE=DATE:${dateOnly(ev.end)}`);
    } else {
      lines.push(`DTSTART:${utcStamp(ev.start)}`);
      lines.push(`DTEND:${utcStamp(ev.end)}`);
    }
    lines.push(`SUMMARY:${icsText(ev.title)}`);
    if (ev.location) lines.push(`LOCATION:${icsText(ev.location)}`);
    if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
    if (link) lines.push(`URL:${link}`);
    if (ev.category) lines.push(`CATEGORIES:${icsText(ev.category)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Link „Termin in Google Kalender übernehmen“ (für Nicht-Eingeladene) */
export function googleTemplateUrl(ev, link = '') {
  const dates = ev.allDay
    ? `${dateOnly(ev.start)}/${dateOnly(ev.end || addDays(ev.start, 1))}`
    : `${utcStamp(ev.start)}/${utcStamp(ev.end)}`;
  const details = [ev.description, link && `Zu-/Absage in der App: ${link}`].filter(Boolean).join('\n\n');
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.title || '', dates, details, location: ev.location || '', ctz: 'Europe/Berlin' });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** Ganzen Kalender im eigenen Google Kalender abonnieren */
export function googleSubscribeUrl(calendarId) {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarId)}`;
}

function vText(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Ein Eintrag des Adressverzeichnisses als vCard 3.0 */
export function toVcard(a, org = 'Frankonia-Brunonia') {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`N:${vText(a.nachname)};${vText(a.vorname)};;;`);
  lines.push(`FN:${vText(a.name || `${a.vorname} ${a.nachname}`.trim())}`);
  if (a.kneipname) lines.push(`NICKNAME:${vText(a.kneipname)}`);
  lines.push(`ORG:${vText(org)}`);
  if (a.status) lines.push(`TITLE:${vText(a.status)}`);
  if (a.mobil) lines.push(`TEL;TYPE=CELL:${vText(a.mobil)}`);
  if (a.telefon) lines.push(`TEL;TYPE=HOME,VOICE:${vText(a.telefon)}`);
  if (a.email) lines.push(`EMAIL;TYPE=INTERNET:${vText(a.email)}`);
  if (a.strasse || a.ort || a.plz) lines.push(`ADR;TYPE=HOME:;;${vText(a.strasse)};${vText(a.ort)};;${vText(a.plz)};${vText(a.land)}`);
  if (a.geburtstagDate) {
    const d = a.geburtstagDate;
    lines.push(`BDAY:${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  lines.push('END:VCARD');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadFile(filename, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

export function mapsUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
