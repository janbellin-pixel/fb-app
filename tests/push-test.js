// Testlauf: Push-Skript (apps-script/Push.gs, E50)
// Verschlüsselung (RFC 8291), Unterschrift (RFC 8292/6979) und Bausteine mit den Prüfwerten der RFCs und gegen
// Web Crypto des Browsers; dazu ganze Durchläufe mit nachgebauten Google-Diensten. Nichts geht ins Netz.
const out = document.getElementById('out');
const results = [];
let current = '';
function section(name) {
  current = name;
  out.insertAdjacentHTML('beforeend', `<h2>${name}</h2>`);
}
function check(cond, label, detail = '') {
  results.push({ ok: !!cond, label: `${current}: ${label}`, detail });
  out.insertAdjacentHTML('beforeend', `<div class="${cond ? 'ok' : 'fail'}">${cond ? '✓' : '✗'} ${label}${detail && !cond ? ` – <code>${String(detail).replace(/</g, '&lt;')}</code>` : ''}</div>`);
}
async function step(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    check(false, label, e.stack || e.message || e);
    return undefined;
  }
}

if (!['127.0.0.1', 'localhost'].includes(location.hostname)) {
  document.body.textContent = 'Diese Testseite läuft nur lokal.';
  throw new Error('Nur lokal');
}

const { subtle } = crypto;
const u8 = (a) => new Uint8Array(a);
const arr = (buf) => [...new Uint8Array(buf)];
const hex = (bytes) => bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
const vonHex = (s) => s.match(/../g).map((h) => parseInt(h, 16));
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const vonB64u = (s) => [...atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))].map((c) => c.charCodeAt(0));
const enc = (s) => [...new TextEncoder().encode(s)];
const zufall = (n) => arr(crypto.getRandomValues(new Uint8Array(n)));
const gleich = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Apps-Script-Dienste, die schon die Bausteine brauchen (der Rest kommt im Durchlauf dazu)
window.Utilities = { getUuid: () => crypto.randomUUID() };

/** Push.gs als normales Skript laden – seine Funktionen sind dann global */
async function ladePushGs() {
  const text = await (await fetch('../apps-script/Push.gs', { cache: 'no-store' })).text();
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  let fehler = null;
  const merken = (e) => { fehler = e.error || e.message; };
  window.addEventListener('error', merken);
  await new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = ok;
    s.onerror = () => fail(new Error('Push.gs nicht geladen'));
    document.head.append(s);
  });
  window.removeEventListener('error', merken);
  if (fehler) throw fehler;
}

/** Empfänger-Seite nach RFC 8291 mit Web Crypto (so entschlüsselt der Browser) */
async function entschluesseln(koerper, uaPrivat, uaOeffentlich, auth) {
  const salt = koerper.slice(0, 16);
  const rs = ((koerper[16] << 24) | (koerper[17] << 16) | (koerper[18] << 8) | koerper[19]) >>> 0;
  const idlen = koerper[20];
  const asOeffentlich = koerper.slice(21, 21 + idlen);
  const asKey = await subtle.importKey('raw', u8(asOeffentlich), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = arr(await subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPrivat, 256));
  const hkdf = async (s, ikm, info, len) => {
    const k = await subtle.importKey('raw', u8(ikm), 'HKDF', false, ['deriveBits']);
    return arr(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: u8(s), info: u8(info) }, k, len * 8));
  };
  const ikm = await hkdf(auth, ecdh, [...enc('WebPush: info'), 0, ...uaOeffentlich, ...asOeffentlich], 32);
  const cek = await hkdf(salt, ikm, [...enc('Content-Encoding: aes128gcm'), 0], 16);
  const nonce = await hkdf(salt, ikm, [...enc('Content-Encoding: nonce'), 0], 12);
  const key = await subtle.importKey('raw', u8(cek), 'AES-GCM', false, ['decrypt']);
  const klar = arr(await subtle.decrypt({ name: 'AES-GCM', iv: u8(nonce) }, key, u8(koerper.slice(21 + idlen))));
  let i = klar.length - 1;
  while (i >= 0 && klar[i] === 0) i--;
  if (klar[i] !== 2) throw new Error('Trenner 0x02 fehlt');
  return { rs, idlen, text: new TextDecoder().decode(u8(klar.slice(0, i))) };
}

/** Gerät wie im Browser: ECDH-Schlüsselpaar und auth-Geheimnis */
async function neuesGeraet() {
  const paar = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const oeffentlich = arr(await subtle.exportKey('raw', paar.publicKey));
  const auth = zufall(16);
  return { privat: paar.privateKey, oeffentlich, auth, p256dh: b64u(oeffentlich), authB64: b64u(auth) };
}

/** VAPID-Kopf zerlegen und die Unterschrift mit Web Crypto prüfen */
async function vapidPruefen(kopf) {
  const m = /^vapid t=([^,\s]+), k=([A-Za-z0-9_-]+)$/.exec(kopf || '');
  if (!m) return { ok: false, grund: `Format: ${kopf}` };
  const [h, p, s] = m[1].split('.');
  const key = await subtle.importKey('raw', u8(vonB64u(m[2])), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, u8(vonB64u(s)), u8(enc(`${h}.${p}`)));
  return { ok, k: m[2], kopf: JSON.parse(new TextDecoder().decode(u8(vonB64u(h)))), claims: JSON.parse(new TextDecoder().decode(u8(vonB64u(p)))) };
}

await step('Push.gs laden', async () => {
  section('Laden');
  await ladePushGs();
  check(typeof pushSenden === 'function' && typeof verschluesseln_ === 'function', 'Push.gs geladen, Funktionen vorhanden');
  // Manifest: nur Lese-Rechte; jeder benutzte Google-Dienst ist eingeschaltet und kommt mit Lese-Rechten aus
  const manifest = await (await fetch('../apps-script/Push.appsscript.json', { cache: 'no-store' })).json();
  const ohneDaten = ['script.external_request', 'script.scriptapp', 'userinfo.email'].map((s) => `https://www.googleapis.com/auth/${s}`);
  const scopes = manifest.oauthScopes || [];
  check(scopes.length && scopes.every((s) => s.endsWith('.readonly') || ohneDaten.includes(s)), 'Manifest: nur Lese-Rechte (dazu Auslöser, Abrufe nach außen, eigene Adresse)', scopes.join(' '));
  const code = (await (await fetch('../apps-script/Push.gs', { cache: 'no-store' })).text())
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const dienste = (manifest.dependencies?.enabledAdvancedServices || []).map((d) => d.userSymbol);
  const benutzt = [...new Set([...code.matchAll(/\b(Drive|Calendar|Sheets|Gmail|People|AdminDirectory)\.[A-Z]/g)].map((m) => m[1]))];
  check(benutzt.length && benutzt.every((d) => dienste.includes(d)), 'jeder benutzte Google-Dienst ist im Manifest eingeschaltet', `benutzt: ${benutzt}, eingeschaltet: ${dienste}`);
  const schreibend = code.match(/\b(SpreadsheetApp|CalendarApp|DocumentApp|GmailApp|FormApp|SlidesApp)\b/g);
  check(!schreibend, 'keine Apps-Script-Dienste, die Schreibrechte verlangen (z. B. SpreadsheetApp)', schreibend);
});

await step('Bausteine', async () => {
  section('Bausteine: SHA-256, HMAC, HKDF, Base64url, AES');
  check(hex(sha256_([])) === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'SHA-256 von „“ (FIPS 180-4)');
  check(hex(sha256_(enc('abc'))) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 von „abc“');
  let alle = true;
  for (const n of [1, 55, 56, 63, 64, 65, 119, 1000]) {
    const d = zufall(n);
    if (hex(sha256_(d)) !== hex(arr(await subtle.digest('SHA-256', u8(d))))) alle = false;
  }
  check(alle, 'SHA-256 wie Web Crypto (Längen 1 bis 1000, auch an Blockgrenzen)');
  check(hex(hmac_(enc('Jefe'), enc('what do ya want for nothing?'))) === '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843', 'HMAC-SHA-256 (RFC 4231, Fall 2)');
  const lang = zufall(100);
  const hk = await subtle.importKey('raw', u8(lang), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  check(hex(hmac_(lang, enc('Nachricht'))) === hex(arr(await subtle.sign('HMAC', hk, u8(enc('Nachricht'))))), 'HMAC mit langem Schlüssel wie Web Crypto');
  const salt = zufall(16), ikm = zufall(32), info = zufall(20);
  const wk = await subtle.importKey('raw', u8(ikm), 'HKDF', false, ['deriveBits']);
  check(hex(hkdf_(salt, ikm, info, 16)) === hex(arr(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: u8(salt), info: u8(info) }, wk, 128))), 'HKDF wie Web Crypto');
  const probe = zufall(31);
  check(b64u_(probe) === b64u(probe) && gleich(vonB64u_(b64u(probe)), probe) && gleich(vonB64u_('AQID=='), [1, 2, 3]), 'Base64url hin und zurück');
  check(hex(aesBlock_(aesSchluessel_(vonHex('000102030405060708090a0b0c0d0e0f')), vonHex('00112233445566778899aabbccddeeff'))) === '69c4e0d86a7b0430d8cdb78070b4c55a', 'AES-128 (FIPS 197, Anhang C.1)');
  alle = true;
  for (const n of [1, 15, 16, 17, 100, 1000]) {
    const key = zufall(16), iv = zufall(12), text = zufall(n);
    const ck = await subtle.importKey('raw', u8(key), 'AES-GCM', false, ['encrypt']);
    if (hex(gcm_(key, iv, text)) !== hex(arr(await subtle.encrypt({ name: 'AES-GCM', iv: u8(iv) }, ck, u8(text))))) alle = false;
  }
  check(alle, 'AES-128-GCM wie Web Crypto (1 bis 1000 Byte)');
  check(utf8_('Grüße 🍺') .length === 12 && new TextDecoder().decode(u8(utf8_('Grüße 🍺'))) === 'Grüße 🍺', 'UTF-8 mit Umlauten und Emoji');
});

await step('P-256', async () => {
  section('P-256, ECDSA (RFC 6979), ECDH');
  const d = BigInt('0xC9AFA9D845BA75166B5C215767B1D6934E50C3DB36E89B127B8A622B120F6721');
  const pub = mul_(d, G_);
  check(pub.x === BigInt('0x60FED4BA255A9D31C961EB74C6356D68C049B8923B61FA6CE669622E60F29FB6') && pub.y === BigInt('0x7903FE1008B8BC99A41AE9E95628BC64F2F1B20C2D7E9F5177A3C294D4462299'), 'öffentlicher Schlüssel (RFC 6979, A.2.5)');
  const sample = signieren_(d, enc('sample'));
  check(hex(sample).toUpperCase() === 'EFD48B2AACB6A8FD1140DD9CD45E81D69D2C877B56AAF991C34D0EA84EAF3716F7CB1C942D657C41D436C7A1B6E29F65F3E900DBB9AFF4064DC4AB2F843ACDA8', 'Unterschrift „sample“ = r | s aus RFC 6979');
  const test = signieren_(d, enc('test'));
  check(hex(test).toUpperCase() === 'F1ABB023518351CD71D881567B1EA663ED3EFCF6C5132B354F28D3B0B7D38367019F4113742A2B14BD25926B49C649155F267E60D3814B4C0CC84250E46F0083', 'Unterschrift „test“ = r | s aus RFC 6979');
  const vk = await subtle.importKey('raw', u8(punktBytes_(pub)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  check(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk, u8(sample), u8(enc('sample'))), 'Web Crypto bestätigt die Unterschrift');
  // ECDH gegen Web Crypto
  const paar = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const jwk = await subtle.exportKey('jwk', paar.privateKey);
  const meinD = zahl_(vonB64u(jwk.d));
  const meinPunkt = mul_(meinD, G_);
  check(b64u(bytes_(meinPunkt.x, 32)) === jwk.x && b64u(bytes_(meinPunkt.y, 32)) === jwk.y, 'öffentlicher Punkt wie bei Web Crypto');
  const anderes = await neuesGeraet();
  const mein = bytes_(mul_(meinD, punkt_(anderes.oeffentlich)).x, 32);
  const fremdKey = await subtle.importKey('raw', u8(punktBytes_(meinPunkt)), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ihres = arr(await subtle.deriveBits({ name: 'ECDH', public: fremdKey }, anderes.privat, 256));
  check(gleich(mein, ihres), 'ECDH: gemeinsames Geheimnis wie Web Crypto');
  let abgelehnt = false;
  try { punkt_([4, ...zufall(64)]); } catch { abgelehnt = true; }
  check(abgelehnt, 'Punkt außerhalb der Kurve wird abgelehnt');
  let zufallOk = true;
  const gesehen = new Set();
  for (let i = 0; i < 20; i++) {
    const z = neuerPrivatschluessel_();
    if (z <= 0n || z >= N_ || gesehen.has(z)) zufallOk = false;
    gesehen.add(z);
  }
  check(zufallOk, 'neue Schlüssel: im gültigen Bereich und jedes Mal anders');
});

await step('RFC 8291', async () => {
  section('Verschlüsselung nach RFC 8291');
  // Beispiel aus RFC 8291, Abschnitt 5 und Anhang A
  const rfc = {
    klartext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
    asPrivat: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    uaOeffentlich: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    uaPrivat: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
    salt: 'DGv6ra1nlYgDCS1FRnbzlw',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    nachricht: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  };
  const koerper = verschluesseln_({ p256dh: rfc.uaOeffentlich, auth: rfc.auth }, vonB64u(rfc.klartext), { privat: zahl_(vonB64u(rfc.asPrivat)), salt: vonB64u(rfc.salt) });
  check(b64u(koerper) === rfc.nachricht, 'Ergebnis Byte für Byte wie im RFC', b64u(koerper));
  const uaPub = vonB64u(rfc.uaOeffentlich);
  const uaKey = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: rfc.uaPrivat, x: b64u(uaPub.slice(1, 33)), y: b64u(uaPub.slice(33)) }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const r = await entschluesseln(vonB64u(rfc.nachricht), uaKey, uaPub, vonB64u(rfc.auth));
  check(r.text === 'When I grow up, I want to be a watermelon' && r.rs === 4096 && r.idlen === 65, 'Web Crypto entschlüsselt das RFC-Beispiel');
  // mit Zufall: Gerät wie im Browser, Text mit Umlauten
  let alle = true;
  for (const text of ['x', 'Grüße vom Stiftungsfest 🍺', JSON.stringify({ title: 'News: Test', body: 'ä'.repeat(300), url: '#/news/1', tag: 'news:1' })]) {
    const g = await neuesGeraet();
    const k1 = verschluesseln_({ p256dh: g.p256dh, auth: g.authB64 }, utf8_(text));
    const k2 = verschluesseln_({ p256dh: g.p256dh, auth: g.authB64 }, utf8_(text));
    const e = await entschluesseln(k1, g.privat, g.oeffentlich, g.auth);
    if (e.text !== text || b64u(k1.slice(0, 16)) === b64u(k2.slice(0, 16)) || b64u(k1.slice(21, 86)) === b64u(k2.slice(21, 86))) alle = false;
  }
  check(alle, 'Gerät entschlüsselt; Salt und Schlüssel sind bei jeder Nachricht neu');
  let zuLang = false;
  try { verschluesseln_({ p256dh: rfc.uaOeffentlich, auth: rfc.auth }, utf8_('x'.repeat(4000))); } catch { zuLang = true; }
  check(zuLang, 'zu lange Nachricht wird abgelehnt (passt nicht in einen Datensatz)');
});

await step('VAPID', async () => {
  section('Unterschrift für den Push-Dienst (VAPID, RFC 8292)');
  const d = neuerPrivatschluessel_();
  const schluessel = { privat: d, oeffentlich: b64u(punktBytes_(mul_(d, G_))) };
  const v = await vapidPruefen(vapidKopf_('https://web.push.apple.com', schluessel, 'mailto:push@beispiel.de'));
  const jetzt = Date.now() / 1000;
  check(v.ok, 'Unterschrift gültig (Web Crypto)', JSON.stringify(v));
  check(v.k === schluessel.oeffentlich && v.kopf.alg === 'ES256' && v.kopf.typ === 'JWT', 'Kopf: ES256, öffentlicher Schlüssel als k');
  check(v.claims.aud === 'https://web.push.apple.com' && v.claims.sub === 'mailto:push@beispiel.de' && v.claims.exp > jetzt + 3000 && v.claims.exp <= jetzt + 3700, 'aud = Push-Dienst, sub = Kontakt, gültig eine Stunde', JSON.stringify(v.claims));
  check(gueltigesAbo_({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: b64u([4, ...zufall(64)]), auth: b64u(zufall(16)) })
    && gueltigesAbo_({ endpoint: 'https://web.push.apple.com/QK', p256dh: b64u([4, ...zufall(64)]), auth: b64u(zufall(16)) })
    && gueltigesAbo_({ endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/x', p256dh: b64u([4, ...zufall(64)]), auth: b64u(zufall(16)) })
    && gueltigesAbo_({ endpoint: 'https://wns2-par02p.notify.windows.com/w/?token=x', p256dh: b64u([4, ...zufall(64)]), auth: b64u(zufall(16)) }), 'Anmeldungen bei Apple, Google, Mozilla, Microsoft gelten');
  check(!gueltigesAbo_({ endpoint: 'https://boese.example.com/x', p256dh: b64u([4, ...zufall(64)]), auth: b64u(zufall(16)) })
    && !gueltigesAbo_({ endpoint: 'http://fcm.googleapis.com/x', p256dh: b64u([4, ...zufall(64)]), auth: b64u(zufall(16)) })
    && !gueltigesAbo_({ endpoint: 'https://fcm.googleapis.com.boese.de/x', p256dh: b64u([4, ...zufall(64)]), auth: b64u(zufall(16)) })
    && !gueltigesAbo_({ endpoint: 'https://fcm.googleapis.com/x', p256dh: b64u(zufall(10)), auth: b64u(zufall(16)) }), 'andere Adressen und kaputte Schlüssel werden abgelehnt');
});

/* ------------------------------------------------------------ Durchläufe mit nachgebauten Google-Diensten */

const PUSH = 'push@beispiel.de';
const welt = { props: {}, dateien: [], termine: [], tabelle: null, tabellenAbrufe: [], anfragen: [], ausloeser: [], antwort: () => 201, konfiguration: null };
const iso = (ms) => new Date(ms).toISOString();

Object.assign(window, {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: (k) => (k in welt.props ? welt.props[k] : null),
    getProperties: () => ({ ...welt.props }),
    setProperties: (o) => { for (const [k, v] of Object.entries(o)) welt.props[k] = String(v); },
    deleteProperty: (k) => { delete welt.props[k]; },
  }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => PUSH }), getScriptTimeZone: () => 'Europe/Berlin' },
  ScriptApp: {
    newTrigger: (name) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create: () => welt.ausloeser.push({ name, n }) }) }) }),
    getProjectTriggers: () => welt.ausloeser.map((t) => ({ getHandlerFunction: () => t.name, t })),
    deleteTrigger: (x) => { welt.ausloeser = welt.ausloeser.filter((t) => t !== x.t); },
  },
  DriveApp: { getFileById: () => ({ getBlob: () => ({ getDataAsString: () => JSON.stringify(welt.konfiguration) }) }) },
  Sheets: { Spreadsheets: { Values: { get: (id, range, o) => {
    welt.tabellenAbrufe.push({ id, range, o });
    if (!welt.tabelle || !range.startsWith("'News'!")) throw new Error(`Unable to parse range: ${range}`);
    // wie die echte API: leere Zellen am Zeilenende fallen weg
    return { range, majorDimension: 'ROWS', values: welt.tabelle.map((r) => r.slice(0, r.findLastIndex((z) => z !== '') + 1)) };
  } } } },
  Drive: { Files: {
    list: ({ q, corpora }) => {
      const typ = /value='(\w+)'/.exec(q)[1];
      const ab = /createdTime > '([^']+)'/.exec(q)?.[1];
      const mod = /modifiedTime > '([^']+)'/.exec(q)?.[1];
      const files = welt.dateien.filter((f) => f.properties?.fbTyp === typ && !f.trashed && (!ab || f.createdTime > ab) && (!mod || f.modifiedTime > mod)
        && (corpora === 'domain' ? f.domain : f.owners[0].emailAddress === PUSH || (f.geteilt || []).includes(PUSH)));
      return { files: files.map((f) => ({ ...f })) };
    },
    get: (id) => ({ ...welt.dateien.find((f) => f.id === id) }),
  } },
  Calendar: { Events: { list: (kal, o) => ({ items: welt.termine.filter((t) => t.updated >= o.updatedMin).map((t) => ({ ...t })) }) } },
  UrlFetchApp: { fetchAll: (anfragen) => anfragen.map((a) => {
    welt.anfragen.push(a);
    const code = welt.antwort(a);
    return { getResponseCode: () => code, getContentText: () => (code === 201 ? '' : 'abgelehnt') };
  }) },
});
Utilities.formatDate = (d, tz) => {
  const teile = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const t = (typ) => teile.find((p) => p.type === typ)?.value;
  return `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(t('weekday')) + 1}|${t('day')}|${t('month')}|${t('hour')}:${t('minute')}`;
};

let nr = 0;
const datei = (typ, besitzer, beschreibung, extra = {}) => {
  const f = { id: `d${++nr}x${Math.random().toString(36).slice(2, 8)}`, createdTime: iso(Date.now()), modifiedTime: iso(Date.now()), description: JSON.stringify(beschreibung),
    owners: [{ emailAddress: besitzer, displayName: besitzer.split('@')[0].replace(/^./, (c) => c.toUpperCase()) + ' Beispiel' }], properties: { fbTyp: typ, ...(extra.properties || {}) },
    // Push-Anmeldungen und Chat-Hinweise sind nur mit dem Push-Konto geteilt, nicht für die Domain sichtbar
    domain: !['push', 'chathinweis'].includes(typ), geteilt: ['push', 'chathinweis'].includes(typ) ? [PUSH] : [], ...extra };
  welt.dateien.push(f);
  return f;
};
const geraete = {};
async function anmelden(name, email, themen, endpoint, extra = {}) {
  const g = await neuesGeraet();
  geraete[endpoint] = g;
  datei('push', email, { endpoint, p256dh: g.p256dh, auth: g.authB64, themen, ...(extra.daten || {}) }, extra.datei || {});
  return g;
}
/** verschickte Mitteilungen: entschlüsselt, mit geprüfter Unterschrift */
async function verschickt(ab = 0) {
  const liste = [];
  for (const a of welt.anfragen.slice(ab)) {
    const g = geraete[a.url];
    const body = a.payload.map((b) => b & 255);
    const e = g ? await entschluesseln(body, g.privat, g.oeffentlich, g.auth).catch((err) => ({ fehler: String(err) })) : { fehler: 'unbekanntes Gerät' };
    const v = await vapidPruefen(a.headers.Authorization);
    liste.push({ url: a.url, kopf: a.headers, vapid: v, nachricht: e.text ? JSON.parse(e.text) : null, fehler: e.fehler });
  }
  return liste;
}

await step('Durchläufe', async () => {
  section('Ablauf mit nachgebauten Google-Diensten');
  const vorher = Date.now() - 86400000;
  welt.konfiguration = { kalenderId: 'kal@group.calendar.google.com', tabellen: { news: 'tab1' }, admins: ['admin@beispiel.de'], redaktion: ['redaktion@beispiel.de'], forum: { aktiv: true }, push: { konto: PUSH, schluessel: '' } };
  welt.tabelle = [['ID', 'Datum', 'Titel', 'Text', 'Bild', 'Kategorie', 'Angeheftet', 'Autor (E-Mail)', 'Autor (Name)', 'Gelöscht'],
    ['', '01.10.2026', 'Alte Nachricht ohne ID', 'Text', '', '', '', '', '', '']];
  datei('news', 'admin@beispiel.de', { titel: 'Alte News von gestern', text: 'schon bekannt' }, { createdTime: iso(vorher) });
  EINSTELLUNGEN.konfigurationId = 'konfig-id';

  // 1. Einrichten = erster Durchlauf: Schlüssel, Auslöser, nichts verschicken
  einrichten();
  const oeffentlich = welt.props.vapidOeffentlich;
  check(/^B[A-Za-z0-9_-]{86}$/.test(oeffentlich || '') && /^[A-Za-z0-9_-]{43}$/.test(welt.props.vapidPrivat || ''), 'Schlüsselpaar angelegt (privat bleibt in den Skript-Eigenschaften)');
  check(b64u(punktBytes_(mul_(zahl_(vonB64u(welt.props.vapidPrivat)), G_))) === oeffentlich, 'öffentlicher Schlüssel passt zum privaten');
  check(welt.ausloeser.length === 2 && welt.ausloeser[0].name === 'pushSenden' && welt.ausloeser[0].n === 10 && welt.ausloeser[1].name === 'chatSenden' && welt.ausloeser[1].n === 1,
    'zwei Auslöser: Neues alle 10 Minuten, Chat-Hinweise jede Minute', JSON.stringify(welt.ausloeser));
  check(welt.tabellenAbrufe.length > 0 && welt.tabellenAbrufe.every((a) => a.id === 'tab1' && a.range === "'News'!A1:AZ" && a.o?.valueRenderOption === 'FORMATTED_VALUE'),
    'News-Tabelle über den Sheets-Dienst gelesen (Anzeigewerte, Bereich wie in der App)', JSON.stringify(welt.tabellenAbrufe));
  einrichten();
  check(welt.ausloeser.length === 2 && welt.props.vapidOeffentlich === oeffentlich, 'nochmal einrichten: keine doppelten Auslöser, Schlüssel bleibt');
  check(welt.anfragen.length === 0 && !!welt.props.seit && !!welt.props.chatSeit, 'erster Durchlauf verschickt nichts und merkt sich die Zeit (auch für Chat-Hinweise)');
  welt.konfiguration.push.schluessel = oeffentlich;

  // 2. Geräte melden sich an – jedes neue bekommt eine Bestätigung
  await anmelden('Anna', 'anna@beispiel.de', ['news', 'forum', 'termine'], 'https://fcm.googleapis.com/fcm/send/anna1');
  await anmelden('Bernd', 'bernd@beispiel.de', ['forum'], 'https://web.push.apple.com/QBernd');
  await anmelden('Carl', 'carl@beispiel.de', ['news'], 'https://updates.push.services.mozilla.com/wpush/v2/carl');
  await anmelden('Böse', 'boese@beispiel.de', ['news'], 'https://boese.example.com/sammeln');
  // gleiche Adresse noch einmal, älter (z. B. nach gelöschtem Gerätespeicher) – zählt nur einmal
  datei('push', 'anna@beispiel.de', { endpoint: 'https://fcm.googleapis.com/fcm/send/anna1', p256dh: geraete['https://fcm.googleapis.com/fcm/send/anna1'].p256dh, auth: geraete['https://fcm.googleapis.com/fcm/send/anna1'].authB64, themen: ['news'] }, { modifiedTime: iso(vorher) });
  // nicht mit dem Push-Konto geteilt: unsichtbar
  datei('push', 'dora@beispiel.de', { endpoint: 'https://fcm.googleapis.com/fcm/send/dora', p256dh: b64u([4, ...zufall(64)]), auth: b64u(zufall(16)), themen: ['news'] }, { geteilt: [] });
  welt.antwort = (a) => (a.url.includes('mozilla') ? 410 : 201);
  pushSenden();
  let m = await verschickt();
  check(m.length === 3 && m.every((x) => x.nachricht?.tag === 'push-ok'), 'drei Bestätigungen (Anna, Bernd, Carl) – nicht an fremde Adressen, doppelte und nicht geteilte', JSON.stringify(m.map((x) => [x.url, x.nachricht?.tag, x.fehler])));
  check(m.every((x) => x.vapid.ok && x.vapid.k === oeffentlich && x.vapid.claims.aud === new URL(x.url).origin && x.vapid.claims.sub === `mailto:${PUSH}`), 'jede Anfrage mit gültiger VAPID-Unterschrift für den jeweiligen Dienst');
  check(m.every((x) => x.kopf['Content-Encoding'] === 'aes128gcm' && x.kopf.TTL === '86400'), 'Kopfzeilen: aes128gcm, TTL');
  check(Object.keys(JSON.parse(welt.props.tot)).length === 1, 'Carls Adresse antwortet 410 – wird gemerkt und nicht mehr beliefert');

  // 3. Neues: News (Admin, Fremder), Forum (Thema, Antwort), Termine (neu, privat, vergangen), Tabelle (neue und gelöschte Zeile)
  const start = welt.anfragen.length;
  await anmelden('Fritz', 'fritz@beispiel.de', ['termine'], 'https://wns2-par02p.notify.windows.com/w/?token=fritz');
  datei('news', 'admin@beispiel.de', { titel: 'Stiftungsfest 2027', text: 'Anmeldung ab sofort in der App.' });
  datei('news', 'bernd@beispiel.de', { titel: 'Gefälschte News', text: 'Bernd ist nicht in der Redaktion' });
  const thema = datei('forum', 'anna@beispiel.de', { titel: 'Grillen am Samstag', text: 'Wer bringt die Kohle mit?' }, { properties: { fbTyp: 'forum', fbRolle: 'thema', fbKategorie: 'Allgemeines' } });
  datei('forum', 'bernd@beispiel.de', { text: 'Ich bringe zwei Säcke mit.' }, { properties: { fbTyp: 'forum', fbRolle: 'antwort', fbThema: thema.id } });
  const morgen = new Date(Date.now() + 86400000);
  morgen.setHours(20, 0, 0, 0);
  const t = (id, extra) => welt.termine.push({ id, status: 'confirmed', created: iso(Date.now()), updated: iso(Date.now()), summary: 'Kneipe', location: 'Haus',
    start: { dateTime: morgen.toISOString() }, end: { dateTime: new Date(morgen.getTime() + 3 * 3600000).toISOString() }, creator: { email: 'admin@beispiel.de' }, ...extra });
  t('kneipe1');
  t('geheim', { visibility: 'private', summary: 'Vorstandssitzung' });
  t('vorbei', { start: { dateTime: iso(Date.now() - 7200000) }, end: { dateTime: iso(Date.now() - 3600000) } });
  t('alt', { created: iso(vorher) });
  const heute = new Date();
  const deDatum = `${String(heute.getDate()).padStart(2, '0')}.${String(heute.getMonth() + 1).padStart(2, '0')}.${heute.getFullYear()}`;
  welt.tabelle.splice(1, 0, ['n7', deDatum, 'Semesterprogramm ist online', 'Alle Termine des Wintersemesters', '', '', '', 'redaktion@beispiel.de', '', ''],
    ['n8', deDatum, 'Zurückgezogen', '', '', '', '', '', '', 'ja']);
  pushSenden();
  m = await verschickt(start);
  const an = (teil) => m.filter((x) => x.url.includes(teil)).map((x) => x.nachricht);
  const anna = an('anna1'), bernd = an('QBernd'), fritz = an('fritz');
  check(m.every((x) => !x.fehler && x.vapid.ok), 'alle Mitteilungen entschlüsselbar und gültig unterschrieben', JSON.stringify(m.map((x) => x.fehler)));
  check(anna.length === 1 && anna[0].tag === 'sammel' && anna[0].body === '2 News, 1 Forumsbeitrag, 1 neuer Termin' && anna[0].url === '#/',
    'Anna (alles): vier Neuigkeiten → eine Sammel-Mitteilung, ihr eigenes Thema nicht', JSON.stringify(anna));
  check(bernd.length === 1 && bernd[0].title === 'Forum: Grillen am Samstag' && bernd[0].url === `#/forum/${thema.id}` && bernd[0].body.startsWith('Anna Beispiel: Wer bringt'),
    'Bernd (Forum): Annas Thema, nicht seine eigene Antwort', JSON.stringify(bernd));
  check(fritz.length === 2 && fritz[0].tag === 'push-ok' && fritz[1].title === 'Neuer Termin: Kneipe' && fritz[1].url === '#/termin/kneipe1' && / 20:00 Uhr · Haus$/.test(fritz[1].body),
    'Fritz (Termine): Bestätigung und nur der neue Termin – nicht privat, vergangen oder alt', JSON.stringify(fritz));
  check(!m.some((x) => x.url.includes('mozilla')), 'abgemeldetes Gerät (410) bekommt nichts mehr');

  // einzelne Mitteilungen (unter der Sammel-Grenze): Inhalt prüfen
  const start2 = welt.anfragen.length;
  datei('news', 'redaktion@beispiel.de', { titel: 'Neues Wappen', text: 'Ab sofort auf allen Briefen.' });
  pushSenden();
  m = await verschickt(start2);
  check(m.length === 1 && m[0].url.includes('anna1') && m[0].nachricht.title === 'News: Neues Wappen' && m[0].nachricht.body === 'Ab sofort auf allen Briefen.' && /^#\/news\/d\d+x/.test(m[0].nachricht.url) && m[0].nachricht.tag.startsWith('news:'),
    'News der Redaktion: einzeln an Anna (Titel, Text, Link)', JSON.stringify(m.map((x) => x.nachricht)));

  // 4. nichts Neues → nichts verschickt (Zeitfenster überlappen, Gemeldetes zählt nicht doppelt)
  const start3 = welt.anfragen.length;
  pushSenden();
  check(welt.anfragen.length === start3, 'nächster Durchlauf ohne Neues verschickt nichts');

  // 5. Tabelle: neue Zeile oben ohne ID verschiebt die anderen – nur die neue wird gemeldet
  welt.tabelle.splice(1, 0, ['', deDatum, 'Kneipe fällt aus', 'Wegen Renovierung', '', '', '', '', '', '']);
  const start4 = welt.anfragen.length;
  pushSenden();
  m = await verschickt(start4);
  check(m.length === 1 && m[0].nachricht.title === 'News: Kneipe fällt aus' && m[0].nachricht.url === '#/news/zeile-2', 'neue Zeile ohne ID: Link wie in der App (zeile-2), verschobene Zeilen nicht doppelt', JSON.stringify(m.map((x) => x.nachricht)));

  // 6. Push-Dienst lehnt ab (z. B. falscher Schlüssel): Fehler im Protokoll, Gerät bleibt angemeldet
  welt.antwort = () => 403;
  datei('news', 'admin@beispiel.de', { titel: 'Probe', text: 'x' });
  const start5 = welt.anfragen.length;
  pushSenden();
  check(welt.anfragen.length === start5 + 1 && Object.keys(JSON.parse(welt.props.tot)).length === 1, '403: nicht als abgemeldet gemerkt');
  welt.antwort = () => 201;

  // 7. Speicher bleibt klein
  check(Object.values(welt.props).every((v) => String(v).length < 9000), 'jede Skript-Eigenschaft unter 9 KB');
  check(sammel_([{ thema: 'news' }, { thema: 'forum' }, { thema: 'forum' }, { thema: 'termine' }, { thema: 'termine' }]).body === '1 News, 2 Forumsbeiträge, 2 neue Termine', 'Sammeltext mit Mehrzahl');
  check(kurz_('a  b\n c', 10) === 'a b c' && kurz_('x'.repeat(20), 10) === `${'x'.repeat(9)}…`, 'Texte gekürzt, Leerraum zusammengefasst');
});

await step('Chat-Hinweise', async () => {
  section('Chat-Hinweise (E51): Direktnachricht, Gruppennachricht, Bierjunge – ohne Inhalt und Absender');
  const sek = () => Math.floor(Date.now() / 1000);
  // Geräte: Gerd will alles, Hanna nur Direktnachrichten und Bierjunge, Ingo nur Gruppen und Räume; Anna (oben) nichts vom Chat
  await anmelden('Gerd', 'gerd@beispiel.de', ['news', 'chat', 'chatgruppen'], 'https://fcm.googleapis.com/fcm/send/gerd');
  await anmelden('Hanna', 'hanna@beispiel.de', ['chat'], 'https://web.push.apple.com/QHanna');
  await anmelden('Ingo', 'ingo@beispiel.de', ['chatgruppen'], 'https://fcm.googleapis.com/fcm/send/ingo');
  pushSenden(); // Bestätigungen für die neuen Geräte
  let start = welt.anfragen.length;
  // Bernd schreibt Gerd, Hanna und Ingo je eine Direktnachricht – Adressen der Domain nur mit dem Teil vor dem @;
  // dazu Unsinn in der Datei: er selbst, ein kaputter Eintrag, eine unmögliche Adresse
  const t1 = sek();
  const bernd = datei('chathinweis', 'bernd@beispiel.de', { zeit: t1, an: { gerd: { direkt: t1 }, hanna: { direkt: t1 }, ingo: { direkt: t1 }, bernd: { direkt: t1 }, kaputt: 5, 'x y@z': { direkt: t1 } } });
  chatSenden();
  let m = await verschickt(start);
  const an = (teil) => m.filter((x) => x.url.includes(teil)).map((x) => x.nachricht);
  check(m.length === 2 && an('gerd').length === 1 && an('QHanna').length === 1 && !an('ingo').length && !an('anna1').length,
    'Direktnachricht an Gerd und Hanna – nicht an Ingo (nur Gruppen), Anna (kein Chat-Thema) oder Bernd selbst', JSON.stringify(m.map((x) => [x.url, x.nachricht])));
  check(an('gerd')[0]?.title === 'Direktnachricht' && an('gerd')[0].url === '#/chat' && an('gerd')[0].tag === 'chat:direkt' && an('gerd')[0].renotify === true && !/bernd/i.test(JSON.stringify(an('gerd'))),
    'Mitteilung: „Direktnachricht“, Link zum Chat, ohne Absender und Inhalt', JSON.stringify(an('gerd')));
  check(m.every((x) => !x.fehler && x.vapid.ok), 'entschlüsselbar und gültig unterschrieben');
  const stand = JSON.parse(welt.props.chat);
  check(Object.keys(stand).join() === bernd.id && stand[bernd.id] === t1 && !/gerd|hanna|bernd/.test(JSON.stringify(welt.props)),
    'gemerkt wird je Datei nur der zuletzt gemeldete Zeitpunkt – keine Namen in den Skript-Eigenschaften', welt.props.chat);
  start = welt.anfragen.length;
  chatSenden();
  check(welt.anfragen.length === start, 'nächste Minute ohne Neues: nichts verschickt');
  // Datei geändert (z. B. aufgeräumt), aber kein neuer Zeitpunkt: nichts
  bernd.modifiedTime = iso(Date.now());
  chatSenden();
  check(welt.anfragen.length === start, 'Datei geändert, aber nichts Neues: nichts verschickt');
  // In derselben Minute: Bernd schreibt in eine Gruppe (Gerd, Hanna, Ingo), Carl schickt Gerd und Hanna einen Bierjungen
  const t2 = t1 + 30;
  bernd.description = JSON.stringify({ zeit: t2, an: { gerd: { direkt: t1, gruppe: t2 }, hanna: { direkt: t1, gruppe: t2 }, ingo: { direkt: t1, gruppe: t2 } } });
  bernd.modifiedTime = iso(Date.now());
  datei('chathinweis', 'carl@beispiel.de', { zeit: t2, an: { gerd: { bierjunge: t2 }, 'hanna@beispiel.de': { bierjunge: t2 } } });
  // nicht mit dem Push-Konto geteilt: unsichtbar
  datei('chathinweis', 'dora@beispiel.de', { zeit: t2, an: { gerd: { direkt: t2 }, ingo: { direkt: t2 } } }, { geteilt: [] });
  start = welt.anfragen.length;
  chatSenden();
  m = await verschickt(start);
  check(an('gerd').length === 1 && an('gerd')[0].title === 'Neues im Chat' && an('gerd')[0].body === '1 Gruppennachricht, 1 Bierjunge' && an('gerd')[0].tag === 'chat:sammel',
    'Gerd: Gruppennachricht und Bierjunge als eine Mitteilung – die alte Direktnachricht nicht noch einmal', JSON.stringify(an('gerd')));
  check(an('QHanna').length === 1 && an('QHanna')[0].title === 'Bierjunge!' && an('QHanna')[0].tag === 'chat:bierjunge' && /Prost/.test(an('QHanna')[0].body),
    'Hanna: „Bierjunge!“ (volle Adresse in der Datei), die Gruppe nicht (abgewählt)', JSON.stringify(an('QHanna')));
  check(an('ingo').length === 1 && an('ingo')[0].title === 'Gruppennachricht' && an('ingo')[0].tag === 'chat:gruppe' && m.length === 3,
    'Ingo: „Gruppennachricht“; Doras nicht geteilte Datei bleibt unsichtbar', JSON.stringify(m.map((x) => [x.url, x.nachricht?.title])));
  check(chatMitteilung_([{ art: 'direkt' }, { art: 'direkt' }, { art: 'bierjunge' }]).body === '2 Direktnachrichten, 1 Bierjunge', 'Sammeltext mit Mehrzahl');
  check(Object.values(welt.props).every((v) => String(v).length < 9000), 'jede Skript-Eigenschaft unter 9 KB');
});

const failed = results.filter((r) => !r.ok);
const summary = `${results.length - failed.length}/${results.length} Prüfungen bestanden`;
document.getElementById('summary').textContent = summary;
document.getElementById('summary').className = failed.length ? 'fail' : 'ok';
window.__testResult = { summary, failed };
console.log(summary, failed);
