// Vertrauliche Sammeltabelle der Datenschutz-Einwilligungen
// ==========================================================
// Liegt im Google Drive der Datenschutz-Verantwortlichen und wird NUR von deren Konto geschrieben
// (der Schreibschutz lässt Tabellen-Schreibzugriffe ausschließlich für diese eigene, von der App
// angelegte Tabelle zu). Mitglieder haben keinen Zugriff.
//   „Stand“      – je Mitglied die aktuelle Entscheidung (auch: wer noch nicht geantwortet hat)
//   „Verlauf“    – jede einzelne Erklärung mit Zeitpunkt, nur ergänzt, nie überschrieben
//   „Fassungen“  – der genaue Wortlaut jeder Fassung mit Prüfsumme
import * as sheets from '../google/sheets.js';
import { dsConfig, einwilligungen, wortlaut, textPruefsumme, ja } from './datenschutz.js';

export const TABS = { stand: 'Stand', verlauf: 'Verlauf', fassungen: 'Fassungen' };
export const TABLE_TYPE = 'einwilligungen-tabelle';

export function headers() {
  const kurz = dsConfig().dachverbandKurz;
  return {
    [TABS.stand]: ['E-Mail (Google-Konto)', 'Name', 'Vereinsübliche Zwecke', `Weitergabe an ${kurz}`, 'Sichtbar in der App', 'Fassung',
      'Zuletzt entschieden', 'Erstmals entschieden', 'Datei geändert (Zeit laut Google)', 'Nachweis (Datei)', 'Hinweis'],
    // „Sichtbar in der App“ am Ende, damit ältere Zeilen (ohne diese Angabe) an ihrem Platz bleiben
    [TABS.verlauf]: ['Zeitpunkt', 'E-Mail (Google-Konto)', 'Name', 'Vereinsübliche Zwecke', `Weitergabe an ${kurz}`, 'Fassung',
      'Prüfsumme', 'Gerät', 'Datei-ID', 'Übernommen am', 'Zeitstempel (UTC)', 'Sichtbar in der App'],
    [TABS.fassungen]: ['Fassung', 'Prüfsumme', 'Stand', 'Einwilligung', 'Wortlaut'],
  };
}

/** „2026-10-17 14:32:05“ in Ortszeit – lesbar und sortierbar */
export function zeit(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v || '');
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Leere, neu angelegte Tabelle einrichten: drei Blätter mit Kopfzeilen */
export async function prepareConsentSheet(id) {
  const meta = await sheets.getMeta(id);
  const firstId = meta.sheets[0].properties.sheetId;
  const names = [TABS.stand, TABS.verlauf, TABS.fassungen];
  const res = await sheets.batchUpdate(id, [
    { updateSheetProperties: { properties: { sheetId: firstId, title: names[0], gridProperties: { frozenRowCount: 1 } }, fields: 'title,gridProperties.frozenRowCount' } },
    ...names.slice(1).map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })),
  ]);
  const ids = [firstId, ...(res.replies || []).slice(1).map((r) => r.addSheet?.properties?.sheetId)].filter((x) => x !== undefined);
  const h = headers();
  await sheets.valuesBatchUpdate(id, names.map((t) => ({ range: `${sheets.quoteSheet(t)}!A1`, values: [h[t]] })));
  await sheets.batchUpdate(id, ids.map((sheetId) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { backgroundColor: { red: 0, green: 0, blue: 0 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true } } },
      fields: 'userEnteredFormat(backgroundColor,textFormat)',
    },
  })));
}

const pad = (row, n) => Array.from({ length: n }, (_, i) => (row[i] === undefined || row[i] === null ? '' : row[i]));

/**
 * Tabelle auf den aktuellen Stand bringen.
 *   consents: Einwilligungen aus den Dateien der Mitglieder (Inhaber laut Google)
 *   members:  alle bekannten Mitglieder – wer fehlt, erscheint als „keine Rückmeldung“
 */
export async function syncConsentSheet(id, { consents, members = [] }) {
  const ds = dsConfig();
  const h = headers();
  const q = (t) => `${sheets.quoteSheet(t)}!A1:Z`;
  const [standOld, verlaufOld, fassungOld] = await sheets.batchGet(id, [q(TABS.stand), q(TABS.verlauf), q(TABS.fassungen)], { render: 'FORMATTED_VALUE' });

  // ---- Stand: komplett neu schreiben (alte Zeilen werden geleert)
  const byEmail = new Map(consents.map((c) => [c.email, c]));
  const rows = consents.map((c) => {
    const hint = [];
    if (c.fassung !== ds.fassung) hint.push(`ältere Fassung ${c.fassung || '?'} – wird beim nächsten Öffnen neu gefragt`);
    if (c.kontoAbweichend) hint.push('Achtung: Konto in der Datei weicht vom Inhaber ab – Inhaber gilt');
    return [c.email, c.name, ja(c.vereinszwecke), ja(c.dachverband), ja(c.sichtbar), c.fassung, zeit(c.zeitpunkt), zeit(c.erstmals), zeit(c.geaendert), c.link, hint.join(' · ')];
  });
  for (const m of members) {
    const email = String(m.email || '').toLowerCase();
    if (email && !byEmail.has(email)) rows.push([email, m.name || email, '', '', '', '', '', '', '', '', 'keine Rückmeldung']);
  }
  rows.sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'de'));
  const width = h[TABS.stand].length;
  const stand = [h[TABS.stand], ...rows].map((r) => pad(r, width));
  while (stand.length < standOld.length) stand.push(pad([], width));
  await sheets.update(id, `${sheets.quoteSheet(TABS.stand)}!A1`, stand);

  // ---- Verlauf: nur neue Erklärungen anhängen (Schlüssel: Datei + genauer Zeitstempel)
  const seen = new Set(verlaufOld.slice(1).map((r) => `${r[8]}|${r[10]}`));
  const now = zeit(new Date());
  const neu = [];
  for (const c of consents) {
    const entries = c.verlauf?.length ? c.verlauf : [c];
    for (const v of entries) {
      const stamp = String(v.zeitpunkt || '');
      const key = `${c.fileId}|${stamp}`;
      if (!stamp || seen.has(key)) continue;
      seen.add(key);
      neu.push([zeit(stamp), c.email, c.name, ja(v.vereinszwecke), ja(v.dachverband), v.fassung || '', v.pruefsumme || '', v.geraet || '', c.fileId, now, stamp, ja(v.sichtbar)]);
    }
  }
  neu.sort((a, b) => a[10].localeCompare(b[10]));
  // Kopfzeile auf den aktuellen Stand (ältere Tabellen kennen „Sichtbar in der App“ noch nicht)
  if (String((verlaufOld[0] || [])[11] || '') !== h[TABS.verlauf][11]) await sheets.update(id, `${sheets.quoteSheet(TABS.verlauf)}!A1`, [h[TABS.verlauf]]);
  if (neu.length) await sheets.append(id, `${sheets.quoteSheet(TABS.verlauf)}!A1`, neu);

  // ---- Fassungen: Wortlaut der aktuellen Fassung festhalten
  const sum = textPruefsumme();
  const known = new Set(fassungOld.slice(1).map((r) => `${r[1]}|${r[3]}`));
  const texte = einwilligungen().filter((e) => !known.has(`${sum}|${e.titel}`)).map((e) => [ds.fassung, sum, ds.stand, e.titel, wortlaut(e)]);
  if (texte.length) await sheets.append(id, `${sheets.quoteSheet(TABS.fassungen)}!A1`, texte);

  return {
    mitglieder: rows.length,
    rueckmeldungen: consents.length,
    vereinszwecke: consents.filter((c) => c.vereinszwecke === true).length,
    dachverband: consents.filter((c) => c.dachverband === true).length,
    neueEintraege: neu.length,
    zeit: now,
  };
}
