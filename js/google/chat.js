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

/** Bestehenden Direktchat mit einer Person finden (users/<E-Mail> ist als Alias erlaubt) */
export const findDirectMessage = (email) =>
  api(`${BASE}/spaces:findDirectMessage`, { query: { name: `users/${email}` } });

export function spaceUrl(spaceName) {
  const id = String(spaceName).replace('spaces/', '');
  return `https://chat.google.com/room/${enc(id)}`;
}
