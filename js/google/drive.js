// Google Drive API v3
import { api, apiAll, enc } from './client.js';
import { assertParentsAllowed } from './guard.js';

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const ALL = { supportsAllDrives: true };

export const FILE_FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink,webViewLink,description,md5Checksum';

export async function listFiles(q, { fields = FILE_FIELDS, orderBy = 'name desc', corpora } = {}) {
  const { items } = await apiAll(`${BASE}/files`, {
    query: { q, fields: `nextPageToken,files(${fields})`, orderBy, pageSize: 200, includeItemsFromAllDrives: true, corpora, ...ALL },
  }, 'files');
  return items;
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
  createFile({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) });

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

export async function listPermissions(fileId) {
  const r = await api(`${BASE}/files/${enc(fileId)}/permissions`, { query: { fields: 'permissions(id,type,role,emailAddress,domain)', ...ALL } });
  return r.permissions || [];
}

export const deletePermission = (fileId, permissionId) =>
  api(`${BASE}/files/${enc(fileId)}/permissions/${enc(permissionId)}`, { method: 'DELETE', query: { ...ALL } });
