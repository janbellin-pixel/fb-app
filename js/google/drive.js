// Google Drive API v3
import { api, apiAll, enc } from './client.js';
import { assertParentsAllowed } from './guard.js';

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const ALL = { supportsAllDrives: true };

export const FILE_FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink,description,md5Checksum';
export const FOLDER = 'application/vnd.google-apps.folder';

/** Dateisuche. In einer geteilten Ablage gezielt suchen: { corpora: 'drive', driveId } */
export async function listFiles(q, { fields = FILE_FIELDS, orderBy = 'name desc', corpora, driveId } = {}) {
  const { items } = await apiAll(`${BASE}/files`, {
    query: { q, fields: `nextPageToken,files(${fields})`, orderBy, pageSize: 200, includeItemsFromAllDrives: true, corpora, driveId, ...ALL },
  }, 'files');
  return items;
}

/**
 * Inhalt eines Ordners samt Unterordnern bis `depth` Ebenen tief – je Ebene gebündelt abgefragt
 * (mehrere Ordner pro Anfrage), damit auch große Archive mit Jahresordnern schnell laden.
 * `filter` = Bedingung für die gesuchten Dateien, z. B. "mimeType = 'application/pdf'".
 * Liefert { files, folders }; jede Datei mit `parentId` und `path` (Ordnernamen ab dem Startordner),
 * jeder Ordner mit `path` einschließlich des eigenen Namens.
 */
export async function listTree(rootId, { depth = 2, filter, fields = FILE_FIELDS, orderBy = 'name', corpora, driveId } = {}) {
  const want = ['id', 'name', 'mimeType', 'parents'].filter((f) => !new RegExp(`(^|,)${f}(,|$)`).test(fields));
  const allFields = [fields, ...want].join(',');
  const files = [];
  const folders = [];
  let level = [{ id: rootId, path: [] }];
  for (let d = 0; d <= depth && level.length; d++) {
    const chunks = [];
    for (let i = 0; i < level.length; i += 25) chunks.push(level.slice(i, i + 25));
    const kinds = d < depth ? `(mimeType = '${FOLDER}' or (${filter}))` : `(${filter})`;
    const results = await Promise.all(chunks.map((chunk) => listFiles(
      `(${chunk.map((f) => `'${f.id}' in parents`).join(' or ')}) and trashed = false and ${kinds}`,
      { fields: allFields, orderBy, corpora, driveId },
    )));
    const next = [];
    results.forEach((items, k) => {
      const byId = new Map(chunks[k].map((f) => [f.id, f]));
      for (const it of items) {
        const parentId = (it.parents || []).find((p) => byId.has(p)) || chunks[k][0].id;
        const path = byId.get(parentId)?.path || [];
        if (it.mimeType === FOLDER) {
          const folder = { ...it, parentId, path: [...path, it.name] };
          folders.push(folder);
          next.push(folder);
        } else {
          files.push({ ...it, parentId, path });
        }
      }
    });
    level = next;
  }
  return { files, folders };
}

export const getFile = (id, fields = FILE_FIELDS) => api(`${BASE}/files/${enc(id)}`, { query: { fields, ...ALL } });

export const canEdit = async (id) => {
  const f = await api(`${BASE}/files/${enc(id)}`, { query: { fields: 'capabilities(canEdit)', ...ALL } });
  return !!f.capabilities?.canEdit;
};

export const download = (id) => api(`${BASE}/files/${enc(id)}`, { query: { alt: 'media', ...ALL }, as: 'arrayBuffer' });
export const downloadBlob = (id) => api(`${BASE}/files/${enc(id)}`, { query: { alt: 'media', ...ALL }, as: 'blob' });

export function createFile(metadata, fields = 'id,name,webViewLink') {
  assertParentsAllowed(metadata.parents || []);
  return api(`${BASE}/files`, { method: 'POST', query: { fields, ...ALL }, body: metadata });
}

export const createFolder = (name, parentId) =>
  createFile({ name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) });

export const updateFile = (id, metadata, query = {}) =>
  api(`${BASE}/files/${enc(id)}`, { method: 'PATCH', query: { fields: 'id,name,description,modifiedTime', ...ALL, ...query }, body: metadata });

/** Eigene Datei in den Papierkorb legen (nur eigene – der Schreibschutz prüft das) */
export const trashFile = (id) => updateFile(id, { trashed: true });

function multipart(metadata, blob) {
  const boundary = `fb${Math.random().toString(36).slice(2)}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  return { body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } };
}

/** Datei hochladen (multipart): Metadaten + Inhalt */
export async function upload(metadata, blob, fields = 'id,name,webViewLink,thumbnailLink') {
  assertParentsAllowed(metadata.parents || []);
  return api(`${UPLOAD}`, { method: 'POST', query: { uploadType: 'multipart', fields, ...ALL }, ...multipart(metadata, blob) });
}

/** Eigene Datei samt Inhalt ersetzen (der Schreibschutz lässt das nur bei eigenen Dateien zu) */
export const updateWithContent = (id, metadata, blob, fields = 'id,name,description,modifiedTime') =>
  api(`${UPLOAD}/${enc(id)}`, { method: 'PATCH', query: { uploadType: 'multipart', fields, ...ALL }, ...multipart(metadata, blob) });

/** Freigabe setzen, z. B. { type: 'group', role: 'reader', emailAddress } */
export const addPermission = (fileId, permission) =>
  api(`${BASE}/files/${enc(fileId)}/permissions`, {
    method: 'POST',
    query: { sendNotificationEmail: false, ...ALL },
    body: permission,
  });

/** Freigaben einer Datei (sehen nur Inhaber und Bearbeiter; sonst Fehler 403) */
export async function listPermissions(fileId) {
  const { items } = await apiAll(`${BASE}/files/${enc(fileId)}/permissions`, {
    query: { fields: 'nextPageToken,permissions(id,type,role,emailAddress,domain,displayName)', pageSize: 100, ...ALL },
  }, 'permissions');
  return items;
}

export const deletePermission = (fileId, permissionId) =>
  api(`${BASE}/files/${enc(fileId)}/permissions/${enc(permissionId)}`, { method: 'DELETE', query: { ...ALL } });
