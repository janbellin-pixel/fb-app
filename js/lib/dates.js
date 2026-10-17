// Datums-Hilfen (deutsche Formate, Ortszeit des Geräts)

const cache = new Map();
function fmt(opts) {
  const key = JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat('de-DE', opts));
  return cache.get(key);
}

/** 'YYYY-MM-DD' als lokales Datum, alles andere über new Date() */
export function toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10));
  }
  return new Date(v);
}

export const isValid = (d) => d instanceof Date && !isNaN(d);

export function isoDate(d) {
  d = toDate(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const startOfDay = (d) => { d = new Date(toDate(d)); d.setHours(0, 0, 0, 0); return d; };
export const addDays = (d, n) => { d = new Date(toDate(d)); d.setDate(d.getDate() + n); return d; };
export const addMonths = (d, n) => { d = new Date(toDate(d)); d.setDate(1); d.setMonth(d.getMonth() + n); return d; };
export const startOfMonth = (d) => { d = new Date(toDate(d)); return new Date(d.getFullYear(), d.getMonth(), 1); };
export const isSameDay = (a, b) => isoDate(a) === isoDate(b);

export const fDate = (d) => fmt({ weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(d));
export const fDateLong = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(toDate(d));
export const fDateNoYear = (d) => fmt({ weekday: 'short', day: 'numeric', month: 'long' }).format(toDate(d));
export const fDateShort = (d) => fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(toDate(d));
export const fDayMonth = (d) => fmt({ day: 'numeric', month: 'long' }).format(toDate(d));
export const fTime = (d) => fmt({ hour: '2-digit', minute: '2-digit' }).format(toDate(d));
export const fWeekdayShort = (d) => fmt({ weekday: 'short' }).format(toDate(d)).replace('.', '');
export const fMonthShort = (d) => fmt({ month: 'short' }).format(toDate(d)).replace('.', '');
export const fMonthYear = (d) => fmt({ month: 'long', year: 'numeric' }).format(toDate(d));
export const fDateTime = (d) => `${fDateShort(d)}, ${fTime(d)} Uhr`;

/** "Fr., 23. Oktober 2026 · 20:00–23:00 Uhr" */
export function fEventWhen(ev, { long = false } = {}) {
  const s = toDate(ev.start);
  const e = toDate(ev.end);
  const day = long ? fDateLong : fDate;
  if (ev.allDay) {
    const last = addDays(e, -1);
    if (isSameDay(s, last) || last < s) return `${day(s)} · ganztägig`;
    return `${fDateNoYear(s)} – ${day(last)}`;
  }
  if (isSameDay(s, e) || e - s < 20 * 3600_000) return `${day(s)} · ${fTime(s)}–${fTime(e)} Uhr`;
  return `${day(s)}, ${fTime(s)} Uhr – ${fDateNoYear(e)}, ${fTime(e)} Uhr`;
}

export function fEventTime(ev) {
  const s = toDate(ev.start);
  const e = toDate(ev.end);
  if (ev.allDay) {
    const last = addDays(e, -1);
    return isSameDay(s, last) || last < s ? 'ganztägig' : `bis ${fDateNoYear(last)}`;
  }
  // bis in die Nacht hinein (unter 24 Stunden): einfach „20:00–01:00 Uhr“
  if (isSameDay(s, e) || e - s < 20 * 3600_000) return `${fTime(s)}–${fTime(e)} Uhr`;
  return `${fTime(s)} Uhr – ${fDateNoYear(e)}`;
}

export function relTime(d) {
  d = toDate(d);
  if (!isValid(d)) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'gerade eben';
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400 && isSameDay(d, new Date())) return `vor ${Math.floor(diff / 3600)} Std.`;
  if (isSameDay(d, addDays(new Date(), -1))) return `gestern, ${fTime(d)}`;
  if (diff < 7 * 86400) return `vor ${Math.max(2, Math.round(diff / 86400))} Tagen`;
  return fDateShort(d);
}

/** "in 3 Tagen", "heute", "morgen" */
export function relDay(d) {
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days === 2) return 'übermorgen';
  if (days === -1) return 'gestern';
  if (days > 0) return `in ${days} Tagen`;
  return `vor ${-days} Tagen`;
}

export function semesterLabel(d = new Date()) {
  d = toDate(d);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (m >= 3 && m <= 8) return `Sommersemester ${y}`;
  if (m >= 9) return `Wintersemester ${y}/${String((y + 1) % 100).padStart(2, '0')}`;
  return `Wintersemester ${y - 1}/${String(y % 100).padStart(2, '0')}`;
}

/** Datum aus Tabellen: "12.03.1985", "12.3.85", "16.10.2026 18:30", "1985-03-12" oder Seriennummer */
export function parseFlexibleDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 1000 && v < 80000) {
    // Tabellen-Seriennummer (Tage seit 30.12.1899, Nachkommastellen = Uhrzeit)
    const days = Math.floor(v);
    const d = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, Math.round((v - days) * 86400000));
  }
  const s = String(v).trim();
  // deutsches Datum, optional mit Uhrzeit: „16.10.2026“, „16.10.26 18:30“, „16.10.2026, 18:30:00“
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?:[\s,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*Uhr)?$/i);
  if (m) {
    let y = m[3] ? +m[3] : 1900;
    if (y < 100) y += y > 30 ? 1900 : 2000;
    return new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  // ISO ohne Zeitzone = Ortszeit: „1985-03-12“, „2026-10-16 18:30“
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const d = new Date(s);
  if (isValid(d)) return d;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/** Datum als sortierbarer Text in Ortszeit: „2026-10-16“ bzw. „2026-10-16T18:30“ */
export function isoLocal(d) {
  const day = isoDate(d);
  if (!d.getHours() && !d.getMinutes()) return day;
  return `${day}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Tage bis zum nächsten Geburtstag (0 = heute) und das neue Alter */
export function nextBirthday(bday, today = new Date()) {
  if (!bday) return null;
  const t = startOfDay(today);
  let next = new Date(t.getFullYear(), bday.getMonth(), bday.getDate());
  if (next < t) next = new Date(t.getFullYear() + 1, bday.getMonth(), bday.getDate());
  const days = Math.round((next - t) / 86400000);
  const age = bday.getFullYear() > 1900 ? next.getFullYear() - bday.getFullYear() : null;
  return { date: next, days, age };
}
