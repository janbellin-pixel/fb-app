// Google-Anmeldung (OAuth 2.0, Weiterleitungs-Variante)
//
// Warum Weiterleitung statt Pop-up? Pop-ups funktionieren in installierten
// Web-Apps auf dem iPhone nicht zuverlässig. Die Weiterleitung klappt überall.
// Ein Zugangsschlüssel gilt eine Stunde; danach holt die App automatisch und
// ohne erneute Passworteingabe einen neuen, solange man bei Google angemeldet ist.

import { config, currentBaseUrl } from './config.js';
import { local } from './lib/store.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_KEY = 'fb.token';
const USER_KEY = 'fb.user';
const STATE_KEY = 'fb.oauthState';
const SILENT_KEY = 'fb.silentTry';

export const SCOPES = {
  // Lesen: Kalender, Tabellen, Drive (drive.readonly gilt auch für Google Tabellen).
  // Schreiben nur Eigenes: eigene Zu-/Absage (calendar.events, vom Schreibschutz auf den
  // eigenen Kalender beschränkt) und Dateien, die die App selbst angelegt hat (drive.file).
  base: [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
  ],
  workspace: [
    'https://www.googleapis.com/auth/directory.readonly',
    'https://www.googleapis.com/auth/chat.spaces.readonly',
    'https://www.googleapis.com/auth/chat.messages',
    // Direktnachrichten und Gruppen anlegen, Personen hinzufügen (E30) – der Schreibschutz lässt
    // damit nur das Anlegen mit Personen und das Hinzufügen von Personen zu
    'https://www.googleapis.com/auth/chat.spaces.create',
    'https://www.googleapis.com/auth/chat.memberships',
  ],
  // nur für Admins in der Einrichtung: neuen Kalender anlegen und freigeben
  setup: ['https://www.googleapis.com/auth/calendar'],
  // nur für Admins: Mitglieder der Vorstandsgruppen lesen (E48) – angefragt erst in der Einrichtung
  adminGruppen: ['https://www.googleapis.com/auth/admin.directory.group.member.readonly'],
};

export function defaultScopes() {
  const s = [...SCOPES.base];
  if (config.workspaceDomain) s.push(...SCOPES.workspace);
  return s;
}

/** Die Weiterleitungsadresse muss exakt so in der Google Cloud Console eingetragen sein. */
export function redirectUri() {
  return currentBaseUrl();
}

export function getToken() {
  const t = local.get(TOKEN_KEY);
  if (!t?.access_token) return null;
  return t;
}

export function getAccessToken() {
  const t = getToken();
  if (!t || Date.now() > t.expires_at - 30_000) return null;
  return t.access_token;
}

export function tokenExpiresIn() {
  const t = getToken();
  return t ? t.expires_at - Date.now() : 0;
}

export function grantedScopes() {
  return (getToken()?.scope || '').split(/\s+/).filter(Boolean);
}

export function hasScope(scope) {
  return grantedScopes().includes(scope);
}

export function missingScopes(wanted = defaultScopes()) {
  const have = grantedScopes();
  return wanted.filter((s) => !['openid', 'email', 'profile'].includes(s) && !have.includes(s));
}

export function getUser() {
  return local.get(USER_KEY);
}

export function setUser(user) {
  local.set(USER_KEY, user);
}

function randomState() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Zur Google-Anmeldung weiterleiten.
 *  silent: ohne Rückfrage (prompt=none) – klappt, wenn bereits zugestimmt wurde
 *  extraScopes: zusätzliche Berechtigungen (z. B. für die Einrichtung)
 *  selectAccount: Kontoauswahl erzwingen
 */
export function login({ silent = false, extraScopes = [], returnTo = location.hash || '#/', selectAccount = false, consent = false } = {}) {
  if (!config.googleClientId) throw Object.assign(new Error('Google-Client-ID fehlt'), { code: 'not_configured' });
  const state = randomState();
  local.set(STATE_KEY, { state, returnTo, silent, t: Date.now() });
  if (silent) local.set(SILENT_KEY, Date.now());
  const user = getUser();
  const scopes = [...new Set([...defaultScopes(), ...grantedScopes(), ...extraScopes])];
  const params = new URLSearchParams({
    client_id: config.googleClientId.trim(),
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: scopes.join(' '),
    include_granted_scopes: 'true',
    state,
  });
  if (user?.email && !selectAccount) params.set('login_hint', user.email);
  if (config.workspaceDomain) params.set('hd', config.workspaceDomain);
  if (silent) params.set('prompt', 'none');
  else if (consent) params.set('prompt', 'consent');
  else if (selectAccount) params.set('prompt', 'select_account');
  location.assign(`${AUTH_URL}?${params}`);
}

/** Beim Start: Antwort von Google aus der Adresse lesen. */
export function handleRedirect() {
  const hash = location.hash || '';
  if (!/^#(?:.*&)?(access_token|error|state)=/.test(hash) || hash.startsWith('#/')) return null;
  const p = new URLSearchParams(hash.slice(1));
  if (!p.has('state')) return null;
  const saved = local.get(STATE_KEY);
  local.del(STATE_KEY);
  const returnTo = saved?.returnTo && saved.returnTo.startsWith('#/') ? saved.returnTo : '#/';
  history.replaceState(null, '', location.pathname + location.search + returnTo);
  if (!saved || saved.state !== p.get('state')) return { error: 'state_mismatch', returnTo };
  if (p.get('error')) return { error: p.get('error'), silent: !!saved.silent, returnTo };
  const expiresIn = Number(p.get('expires_in')) || 3600;
  local.set(TOKEN_KEY, {
    access_token: p.get('access_token'),
    expires_at: Date.now() + expiresIn * 1000,
    scope: p.get('scope') || '',
  });
  local.del(SILENT_KEY);
  return { ok: true, returnTo, silent: !!saved.silent };
}

/** Wurde gerade erst still versucht und ist gescheitert? (verhindert Endlosschleifen) */
export function recentSilentAttempt() {
  const t = local.get(SILENT_KEY);
  return t && Date.now() - t < 2 * 60_000;
}

export function clearSilentAttempt() {
  local.del(SILENT_KEY);
}

let onUnauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorizedHandler = fn;
}
export function notifyUnauthorized(err) {
  local.del(TOKEN_KEY);
  onUnauthorizedHandler?.(err);
}

export function logout({ revoke = false } = {}) {
  const t = getToken();
  if (revoke && t?.access_token) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.access_token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => {});
  }
  local.del(TOKEN_KEY);
  local.del(USER_KEY);
  local.del(SILENT_KEY);
}

export function forgetToken() {
  local.del(TOKEN_KEY);
}
