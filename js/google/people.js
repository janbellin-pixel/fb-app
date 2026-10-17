// Google-Profil und Workspace-Verzeichnis (People API)
import { api, apiAll } from './client.js';

/** Eigenes Profil aus dem Anmelde-Token */
export const userinfo = () => api('https://openidconnect.googleapis.com/v1/userinfo');

/**
 * Alle Profile der Workspace-Domain (Name, Foto, E-Mail, Telefon, Organisation).
 * Funktioniert nur mit Google-Workspace-Konten.
 */
export async function listDirectory() {
  const { items } = await apiAll('https://people.googleapis.com/v1/people:listDirectoryPeople', {
    query: {
      readMask: 'names,photos,emailAddresses,phoneNumbers,organizations,locations',
      sources: 'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE',
      pageSize: 1000,
    },
  }, 'people');
  return items.map((p) => {
    const email = (p.emailAddresses?.find((e) => e.metadata?.primary) || p.emailAddresses?.[0])?.value || '';
    const photo = p.photos?.find((x) => !x.default)?.url || '';
    return {
      id: p.resourceName?.replace('people/', '') || '',
      email: email.toLowerCase(),
      name: p.names?.[0]?.displayName || email,
      photo,
      phone: p.phoneNumbers?.[0]?.value || '',
      organisation: p.organizations?.[0]?.title || p.organizations?.[0]?.name || '',
      location: p.locations?.[0]?.value || '',
    };
  }).filter((p) => p.email);
}
