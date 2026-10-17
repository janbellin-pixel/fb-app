// Google Sheets API v4 + kleine Tabellen-Abstraktion (Spalten über Kopfzeile)
import { api, enc } from './client.js';
import { norm } from '../lib/text.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const quoteSheet = (name) => `'${String(name).replace(/'/g, "''")}'`;

export function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function getValues(id, range, { render = 'UNFORMATTED_VALUE' } = {}) {
  const r = await api(`${BASE}/${enc(id)}/values/${enc(range)}`, {
    query: { valueRenderOption: render, dateTimeRenderOption: 'FORMATTED_STRING', majorDimension: 'ROWS' },
  });
  return r.values || [];
}

export async function batchGet(id, ranges, { render = 'UNFORMATTED_VALUE' } = {}) {
  const r = await api(`${BASE}/${enc(id)}/values:batchGet`, {
    query: { ranges, valueRenderOption: render, dateTimeRenderOption: 'FORMATTED_STRING', majorDimension: 'ROWS' },
  });
  return (r.valueRanges || []).map((v) => v.values || []);
}

export const append = (id, range, rows) =>
  api(`${BASE}/${enc(id)}/values/${enc(range)}:append`, {
    method: 'POST',
    query: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
    body: { values: rows },
  });

export const update = (id, range, rows) =>
  api(`${BASE}/${enc(id)}/values/${enc(range)}`, { method: 'PUT', query: { valueInputOption: 'RAW' }, body: { values: rows } });

export const valuesBatchUpdate = (id, data) =>
  api(`${BASE}/${enc(id)}/values:batchUpdate`, { method: 'POST', body: { valueInputOption: 'RAW', data } });

export const getMeta = (id) =>
  api(`${BASE}/${enc(id)}`, { query: { fields: 'spreadsheetId,properties.title,sheets.properties,spreadsheetUrl' } });

export const batchUpdate = (id, requests) => api(`${BASE}/${enc(id)}:batchUpdate`, { method: 'POST', body: { requests } });

/* ------------------------------------------------------------------ Tabellen */

function headerKeyMap(header, schema) {
  const normalized = header.map((h) => norm(h).replace(/[^a-z0-9]/g, ''));
  const map = {};
  for (const f of schema) {
    const names = [f.label, f.key, ...(f.aliases || [])].map((n) => norm(n).replace(/[^a-z0-9]/g, ''));
    map[f.key] = normalized.findIndex((h) => names.includes(h));
  }
  return map;
}

/**
 * Liest ein Tabellenblatt in Objekte: { items, header, colIndex }
 * Jede Zeile erhält _row (Zeilennummer in der Tabelle) und _raw (Originalwerte).
 */
export async function readTable(id, sheet, schema) {
  const rows = await getValues(id, `${quoteSheet(sheet)}!A1:AZ`);
  return rowsToTable(rows, schema);
}

export function rowsToTable(rows, schema) {
  const header = (rows[0] || []).map((h) => String(h ?? ''));
  const colIndex = headerKeyMap(header, schema);
  const items = [];
  rows.slice(1).forEach((r, i) => {
    const o = { _row: i + 2, _raw: r };
    let any = false;
    for (const f of schema) {
      const idx = colIndex[f.key];
      const v = idx >= 0 ? r[idx] : undefined;
      o[f.key] = v === undefined || v === null ? '' : v;
      if (o[f.key] !== '') any = true;
    }
    if (any) items.push(o);
  });
  return { items, header, colIndex };
}

function rowFor(obj, table, schema, base = []) {
  const width = Math.max(table.header.length, base.length);
  const row = Array.from({ length: width }, (_, i) => (base[i] === undefined ? '' : base[i]));
  for (const f of schema) {
    const idx = table.colIndex[f.key];
    if (idx >= 0 && obj[f.key] !== undefined) row[idx] = obj[f.key];
  }
  return row;
}

export async function appendObject(id, sheet, table, schema, obj) {
  if (schema.some((f) => f.required && table.colIndex[f.key] < 0)) {
    throw new Error(`Spalten fehlen im Tabellenblatt „${sheet}“`);
  }
  await append(id, `${quoteSheet(sheet)}!A1`, [rowFor(obj, table, schema)]);
}

export async function updateObject(id, sheet, table, schema, item, changes) {
  const row = rowFor({ ...item, ...changes }, table, schema, item._raw || []);
  await update(id, `${quoteSheet(sheet)}!A${item._row}:${colLetter(row.length - 1)}${item._row}`, [row]);
}
