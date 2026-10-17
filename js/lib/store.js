// Lokaler Zwischenspeicher: IndexedDB (große Daten) und localStorage (Kleinkram)

const DB_NAME = 'fb-app';
const STORE = 'kv';
let dbPromise = null;
const memory = new Map();

function openDb() {
  if (!('indexedDB' in self)) return Promise.reject(new Error('no idb'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    }).catch((e) => { dbPromise = null; throw e; });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    const r = fn(store);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const kv = {
  async get(key) {
    try { return await tx('readonly', (s) => s.get(key)); } catch { return memory.get(key); }
  },
  async set(key, value) {
    memory.set(key, value);
    try { await tx('readwrite', (s) => s.put(value, key)); } catch { /* nur im Speicher */ }
  },
  async del(key) {
    memory.delete(key);
    try { await tx('readwrite', (s) => s.delete(key)); } catch { /* egal */ }
  },
  async clear() {
    memory.clear();
    try { await tx('readwrite', (s) => s.clear()); } catch { /* egal */ }
  },
};

export const local = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* voll oder gesperrt */ }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch { /* egal */ }
  },
};

/**
 * Daten laden mit Zwischenspeicher („stale while revalidate“):
 * zeigt sofort den letzten Stand und lädt im Hintergrund neu.
 *   onData(data, { cached, stale })
 */
export async function cachedLoad(key, fetcher, onData, { maxAge = 60_000, force = false } = {}) {
  const cached = force ? null : await kv.get(key);
  const fresh = cached && Date.now() - cached.t < maxAge;
  if (cached) onData(cached.v, { cached: true, stale: !fresh, time: cached.t });
  if (fresh) return cached.v;
  try {
    const v = await fetcher();
    await kv.set(key, { t: Date.now(), v });
    if (!cached || JSON.stringify(cached.v) !== JSON.stringify(v)) onData(v, { cached: false, stale: false, time: Date.now() });
    return v;
  } catch (e) {
    if (cached) {
      e.usedCache = true;
      e.cacheTime = cached.t;
    }
    throw e;
  }
}
