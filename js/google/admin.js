// Admin SDK (nur für Admins, E48): Mitglieder einer Google-Gruppe lesen – ausschließlich GET.
// Berechtigung admin.directory.group.member.readonly fragt nur die Einrichtung an (auth.SCOPES.adminGruppen).
import { api } from './client.js';

const BASE = 'https://admin.googleapis.com/admin/directory/v1';

/** Alle Mitglieder einer Gruppe (E-Mail oder Alias als groupKey), auch über verschachtelte Gruppen */
export async function listGroupMembers(groupKey) {
  const out = [];
  let pageToken;
  do {
    const r = await api(`${BASE}/groups/${encodeURIComponent(groupKey)}/members`, {
      query: { includeDerivedMembership: true, maxResults: 200, pageToken, fields: 'members(email,type,status),nextPageToken' },
    });
    out.push(...(r.members || []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

/** Nur aktive Personen (keine Untergruppen), klein geschrieben, sortiert; mit domain nur Konten dieser Domain */
export async function groupPeople(groupKey, domain = '') {
  const d = String(domain || '').toLowerCase();
  let members;
  try {
    members = await listGroupMembers(groupKey);
  } catch (e) {
    if (e.status === 404) throw Object.assign(new Error(`Die Google-Gruppe ${groupKey} gibt es nicht (Tippfehler?).`), { code: 'group_not_found' });
    throw e;
  }
  const emails = members
    .filter((m) => m.type === 'USER' && (m.status || 'ACTIVE') === 'ACTIVE' && m.email)
    .map((m) => String(m.email).toLowerCase())
    .filter((e) => !d || e.endsWith(`@${d}`));
  return [...new Set(emails)].sort();
}
