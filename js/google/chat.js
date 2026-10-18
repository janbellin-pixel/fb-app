// Google Chat API (nur mit Google Workspace)
import { api, apiAll, enc } from './client.js';

const BASE = 'https://chat.googleapis.com/v1';

export async function listSpaces() {
  const { items } = await apiAll(`${BASE}/spaces`, { query: { pageSize: 200 } }, 'spaces');
  return items;
}

/** Nachrichten eines Raums; space = 'spaces/AAAA…' */
export async function listMessages(space, { pageSize = 60, since } = {}) {
  const r = await api(`${BASE}/${space}/messages`, {
    query: {
      pageSize,
      orderBy: 'createTime desc',
      filter: since ? `createTime > "${since}"` : undefined,
      showDeleted: false,
    },
  });
  return (r.messages || []).reverse();
}

export const createMessage = (space, text) =>
  api(`${BASE}/${space}/messages`, { method: 'POST', body: { text } });

/**
 * Neue Unterhaltung anlegen (Direktnachricht, Gruppe oder benannter Raum) und Personen hinzufügen.
 * Gibt es die Direktnachricht schon, liefert Google die bestehende zurück.
 */
export const setupSpace = (body) => api(`${BASE}/spaces:setup`, { method: 'POST', body });

/** Mitglieder einer Unterhaltung */
export async function listMembers(space) {
  const { items } = await apiAll(`${BASE}/${space}/members`, { query: { pageSize: 1000 } }, 'memberships', 5);
  return items;
}

/** Person zu einer Unterhaltung hinzufügen (member: { name: 'users/<E-Mail>', type: 'HUMAN' }) */
export const addMember = (space, member) => api(`${BASE}/${space}/members`, { method: 'POST', body: { member } });

/** Bestehenden Direktchat mit einer Person finden (users/<E-Mail> ist als Alias erlaubt) */
export const findDirectMessage = (email) =>
  api(`${BASE}/spaces:findDirectMessage`, { query: { name: `users/${email}` } });

export function spaceUrl(spaceName) {
  const id = String(spaceName).replace('spaces/', '');
  return `https://chat.google.com/room/${enc(id)}`;
}
