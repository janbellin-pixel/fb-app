// Google Calendar API v3
import { api, apiAll, enc } from './client.js';

const BASE = 'https://www.googleapis.com/calendar/v3';

/** Termine im Zeitraum (Serientermine aufgelöst). Liefert { items, accessRole } */
export async function listEvents(calendarId, { timeMin, timeMax, q, maxResults = 250 } = {}) {
  const { items, first } = await apiAll(`${BASE}/calendars/${enc(calendarId)}/events`, {
    query: { timeMin, timeMax, q, singleEvents: true, orderBy: 'startTime', maxResults, maxAttendees: 400 },
  }, 'items', 10);
  return { items, accessRole: first?.accessRole || 'reader', summary: first?.summary || '', timeZone: first?.timeZone };
}

export const getEvent = (calendarId, eventId) =>
  api(`${BASE}/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { query: { maxAttendees: 400 } });

export const patchEvent = (calendarId, eventId, body, sendUpdates = 'none') =>
  api(`${BASE}/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'PATCH', query: { sendUpdates }, body });

export const insertEvent = (calendarId, body, sendUpdates = 'none') =>
  api(`${BASE}/calendars/${enc(calendarId)}/events`, { method: 'POST', query: { sendUpdates }, body });

export const deleteEvent = (calendarId, eventId, sendUpdates = 'none') =>
  api(`${BASE}/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'DELETE', query: { sendUpdates }, as: 'none' });

export const createCalendar = (summary, description = '', timeZone = 'Europe/Berlin') =>
  api(`${BASE}/calendars`, { method: 'POST', body: { summary, description, timeZone } });

export const getCalendar = (calendarId) => api(`${BASE}/calendars/${enc(calendarId)}`);

export const insertAcl = (calendarId, rule) =>
  api(`${BASE}/calendars/${enc(calendarId)}/acl`, { method: 'POST', query: { sendNotifications: false }, body: rule });
