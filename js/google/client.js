// Gemeinsamer Zugriff auf die Google-APIs mit dem Zugangsschlüssel des Mitglieds
import { getAccessToken, notifyUnauthorized } from '../auth.js';
import { assertWriteAllowed } from './guard.js';

export class ApiError extends Error {
  constructor(status, message, reason = '', details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
    this.details = details;
    if (status === 403 && /insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(`${message} ${reason}`)) {
      this.code = 'scope';
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withQuery(url, query) {
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? url + (url.includes('?') ? '&' : '?') + s : url;
}

/**
 * api(url, { method, query, body, headers, as: 'json'|'arrayBuffer'|'blob'|'text'|'none' })
 */
export async function api(url, { method = 'GET', query, body, headers = {}, as = 'json', retries = 2 } = {}) {
  const token = getAccessToken();
  if (!token && !navigator.onLine) throw new ApiError(0, 'Keine Verbindung zum Server', 'network');
  if (!token) {
    const err = new ApiError(401, 'Nicht angemeldet', 'unauthenticated');
    notifyUnauthorized(err);
    throw err;
  }
  const init = { method, headers: { Authorization: `Bearer ${token}`, ...headers } };
  if (body !== undefined) {
    if (body instanceof Blob || body instanceof ArrayBuffer || typeof body === 'string' || body instanceof FormData) {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = 'application/json';
    }
  }
  const full = withQuery(url, query);
  // Schreibschutz: nur eigene Daten dürfen geändert werden (wirft vor dem Senden)
  assertWriteAllowed(method.toUpperCase(), full, body);
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(full, init);
    } catch {
      if (attempt < retries) { await sleep(600 * 2 ** attempt); continue; }
      throw new ApiError(0, 'Keine Verbindung zum Server', 'network');
    }
    if (res.ok) {
      if (res.status === 204 || as === 'none') return null;
      if (as === 'arrayBuffer') return res.arrayBuffer();
      if (as === 'blob') return res.blob();
      if (as === 'text') return res.text();
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(900 * 2 ** attempt + Math.random() * 300);
      continue;
    }
    let message = res.statusText || `Fehler ${res.status}`;
    let reason = '';
    let details = null;
    try {
      const j = await res.json();
      message = j.error?.message || j.error_description || message;
      reason = j.error?.errors?.[0]?.reason || j.error?.status || (typeof j.error === 'string' ? j.error : '');
      details = j.error || j;
    } catch { /* keine JSON-Antwort */ }
    const err = new ApiError(res.status, message, reason, details);
    if (res.status === 401) notifyUnauthorized(err);
    throw err;
  }
}

/** Alle Seiten einer Liste laden (nextPageToken) */
export async function apiAll(url, { query = {}, ...opts } = {}, itemsKey = 'items', maxPages = 20) {
  let out = [];
  let pageToken;
  let first = null;
  for (let i = 0; i < maxPages; i++) {
    const r = await api(url, { ...opts, query: { ...query, pageToken } });
    if (!first) first = r;
    out = out.concat(r[itemsKey] || []);
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  return { items: out, first };
}

export const enc = encodeURIComponent;
