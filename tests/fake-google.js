// Nachbau der benutzten Google-APIs im Browser (nur für Tests).
// Ersetzt window.fetch für *.googleapis.com und speichert alles im Arbeitsspeicher.
//
// Wächter: Jeder Schreibzugriff, der NICHT eigene Daten des angemeldeten Mitglieds betrifft,
// wird in state.violations protokolliert (außerhalb der Einrichtung). Google selbst würde
// fremde Dateien bei den Rechten drive.file ebenfalls ablehnen – das bildet der Nachbau nach.

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const error = (status, message, reason = '') => json({ error: { code: status, message, status: reason || String(status), errors: [{ reason }] } }, status);

let counter = 0;
const uid = (p = '') => `${p}${Date.now().toString(36)}${(counter++).toString(36).padStart(3, '0')}000000000000000000000000`.slice(0, 33);
const calId = () => `fb${Date.now().toString(32)}${(counter++).toString(32)}`.replace(/[^a-v0-9]/g, '0');

export function createFakeGoogle({ me, workspace = true }) {
  const state = {
    log: [],
    queries: [],
    writes: [],
    violations: [],
    setupPhase: false,
    myGroup: '',
    myDirectoryId: '',
    calendars: { primary: { accessRole: 'owner', events: new Map(), owner: me.email } },
    sheets: {},
    files: new Map(),
    permissions: [],
    acls: [],
    directory: [],
    spaces: [],
    messages: {},
  };

  function write(kind, target, own) {
    state.writes.push({ kind, target, own });
    if (!own && !state.setupPhase) state.violations.push(`${kind} → ${target}`);
  }

  /* ------------------------------------------------------------ Tabellen */
  function newSpreadsheet(id, title) {
    state.sheets[id] = { title, tabs: [{ sheetId: 0, title: 'Tabelle1', rows: [] }] };
  }
  function parseRange(range) {
    const m = range.match(/^(?:'((?:[^']|'')+)'|([^!]+))!([A-Z]+)(\d+)(?::([A-Z]+)(\d+)?)?$/);
    if (!m) throw new Error(`Bereich nicht verstanden: ${range}`);
    const col = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    return { tab: (m[1] || m[2]).replace(/''/g, "'"), c1: col(m[3]), r1: +m[4] - 1, c2: m[5] ? col(m[5]) : null, r2: m[6] ? +m[6] - 1 : null };
  }
  function tabOf(id, title) {
    return state.sheets[id]?.tabs.find((t) => t.title === title) || null;
  }
  function readRange(id, range) {
    const r = parseRange(range);
    const tab = tabOf(id, r.tab);
    if (!tab) throw Object.assign(new Error(`Tabellenblatt ${r.tab} fehlt`), { status: 400 });
    let rows = tab.rows.slice(r.r1, r.r2 === null ? undefined : r.r2 + 1).map((row) => row.slice(r.c1, r.c2 === null ? undefined : r.c2 + 1));
    while (rows.length && !rows[rows.length - 1].some((v) => v !== '' && v != null)) rows.pop();
    return rows.map((row) => { const x = row.slice(); while (x.length && (x[x.length - 1] === '' || x[x.length - 1] == null)) x.pop(); return x; });
  }
  function writeRange(id, range, values) {
    const r = parseRange(range);
    const tab = tabOf(id, r.tab);
    values.forEach((row, i) => {
      const target = (tab.rows[r.r1 + i] = tab.rows[r.r1 + i] || []);
      row.forEach((v, j) => { target[r.c1 + j] = v; });
    });
  }
  function appendRows(id, range, values) {
    const tab = tabOf(id, parseRange(range).tab);
    let last = tab.rows.length;
    while (last > 0 && !(tab.rows[last - 1] || []).some((v) => v !== '' && v != null)) last--;
    values.forEach((row, i) => { tab.rows[last + i] = row.slice(); });
  }
  const sheetOwn = (id) => state.files.get(id)?.ownerEmail === me.email;

  async function sheetsApi(url, method, body) {
    const path = decodeURIComponent(url.pathname.replace('/v4/spreadsheets/', ''));
    let m;
    if ((m = path.match(/^([^/:]+):batchUpdate$/))) {
      write('Tabelle formatieren', m[1], sheetOwn(m[1]));
      const s = state.sheets[m[1]];
      if (!s) return error(404, 'Requested entity was not found.');
      const replies = [];
      for (const req of body.requests) {
        if (req.updateSheetProperties) {
          const p = req.updateSheetProperties.properties;
          const tab = s.tabs.find((t) => t.sheetId === p.sheetId);
          if (p.title) tab.title = p.title;
          replies.push({});
        } else if (req.addSheet) {
          const sheetId = s.tabs.length * 1000 + 7;
          s.tabs.push({ sheetId, title: req.addSheet.properties.title, rows: [] });
          replies.push({ addSheet: { properties: { sheetId, title: req.addSheet.properties.title } } });
        } else replies.push({});
      }
      return json({ spreadsheetId: m[1], replies });
    }
    if ((m = path.match(/^([^/]+)\/values:batchGet$/))) {
      const ranges = url.searchParams.getAll('ranges');
      return json({ valueRanges: ranges.map((r) => ({ range: r, values: readRange(m[1], r) })) });
    }
    if ((m = path.match(/^([^/]+)\/values:batchUpdate$/))) {
      write('Tabelle schreiben', m[1], sheetOwn(m[1]));
      for (const d of body.data) writeRange(m[1], d.range, d.values);
      return json({ totalUpdatedRows: body.data.length });
    }
    if ((m = path.match(/^([^/]+)\/values\/(.+):append$/))) {
      write('Tabelle ergänzen', m[1], sheetOwn(m[1]));
      appendRows(m[1], m[2], body.values);
      return json({ updates: { updatedRows: body.values.length } });
    }
    if ((m = path.match(/^([^/]+)\/values\/(.+)$/))) {
      if (!state.sheets[m[1]]) return error(404, 'Requested entity was not found.');
      if (method === 'PUT') {
        write('Tabelle überschreiben', m[1], sheetOwn(m[1]));
        writeRange(m[1], m[2], body.values);
        return json({ updatedRows: body.values.length });
      }
      try { return json({ range: m[2], values: readRange(m[1], m[2]) }); } catch (e) { return error(e.status || 400, e.message); }
    }
    if ((m = path.match(/^([^/]+)$/))) {
      const s = state.sheets[m[1]];
      if (!s) return error(404, 'Requested entity was not found.');
      return json({ spreadsheetId: m[1], properties: { title: s.title }, sheets: s.tabs.map((t) => ({ properties: { sheetId: t.sheetId, title: t.title } })) });
    }
    return error(400, `Unbekannter Sheets-Aufruf ${path}`);
  }

  /* ------------------------------------------------------------ Kalender */
  function calendarApi(url, method, body) {
    const path = decodeURIComponent(url.pathname.replace('/calendar/v3/', ''));
    let m;
    if (path === 'calendars' && method === 'POST') {
      const id = `${uid('c')}@group.calendar.google.com`;
      state.calendars[id] = { accessRole: 'owner', events: new Map(), summary: body.summary, owner: me.email };
      write('Kalender anlegen', id, true);
      return json({ id, summary: body.summary });
    }
    if ((m = path.match(/^calendars\/([^/]+)\/acl$/))) {
      if (method === 'GET') {
        // Freigaben sehen nur Inhaber (bzw. wer sie verwalten darf)
        const c = state.calendars[m[1]];
        if (!c) return error(404, 'Not Found', 'notFound');
        if (c.owner !== me.email && !c.aclReadable) return error(403, 'Forbidden', 'forbidden');
        return json({ items: state.acls.filter((a) => a.calendar === m[1]).map(({ calendar, ...r }) => ({ id: `${r.scope.type}:${r.scope.value || ''}`, ...r })) });
      }
      write('Kalender freigeben', m[1], state.calendars[m[1]]?.owner === me.email);
      state.acls.push({ calendar: m[1], ...body });
      return json({ id: uid('acl'), ...body });
    }
    if ((m = path.match(/^calendars\/([^/]+)\/events(?:\/([^/]+))?$/))) {
      const cal = state.calendars[m[1]];
      if (!cal) return error(404, 'Not Found', 'notFound');
      const id = m[2];
      if (!id && method === 'GET') {
        const min = url.searchParams.get('timeMin');
        const max = url.searchParams.get('timeMax');
        const items = [...cal.events.values()].filter((e) => {
          const s = e.start.dateTime || e.start.date;
          return (!max || s <= max) && (!min || (e.end.dateTime || e.end.date) >= min);
        }).sort((a, b) => String(a.start.dateTime || a.start.date).localeCompare(String(b.start.dateTime || b.start.date)));
        return json({ kind: 'calendar#events', accessRole: cal.accessRole, summary: cal.summary || 'Kalender', items });
      }
      if (!id && method === 'POST') {
        write('Termin anlegen', m[1], m[1] === 'primary');
        if (!['owner', 'writer'].includes(cal.accessRole)) return error(403, 'Forbidden', 'forbidden');
        const ev = { ...body, id: body.id || calId(), htmlLink: `https://calendar.google.com/event?eid=${body.id}`, status: 'confirmed', organizer: { email: m[1], self: true } };
        cal.events.set(ev.id, ev);
        if ((ev.attendees || []).some((a) => a.email === me.email || a.email === state.myGroup)) {
          state.calendars.primary.events.set(ev.id, { ...structuredClone(ev), organizer: { email: m[1] } });
        }
        return json(ev);
      }
      const ev = cal.events.get(id);
      if (!ev) return error(404, 'Not Found', 'notFound');
      if (method === 'GET') return json(ev);
      if (method === 'DELETE') {
        write('Termin löschen', `${m[1]}/${id}`, m[1] === 'primary');
        cal.events.delete(id);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        // eigene Antwort im eigenen Kalender ist erlaubt – alles andere wäre ein Verstoß
        const ownAnswer = m[1] === 'primary' && Object.keys(body).length === 1 && Array.isArray(body.attendees);
        write('Termin ändern', `${m[1]}/${id}`, ownAnswer);
        if (m[1] !== 'primary' && !['owner', 'writer'].includes(cal.accessRole)) return error(403, 'Forbidden', 'forbidden');
        Object.assign(ev, body);
        if (m[1] === 'primary' && body.attendees) {
          for (const c of Object.values(state.calendars)) {
            const orig = c.events.get(id);
            if (orig && orig !== ev) orig.attendees = structuredClone(body.attendees);
          }
        }
        return json(ev);
      }
    }
    return error(400, `Unbekannter Kalender-Aufruf ${path}`);
  }

  /* ------------------------------------------------------------ Drive */
  function addFile(f) {
    const id = f.id || uid('f');
    const file = {
      id, name: f.name || 'Datei', mimeType: f.mimeType || 'application/json', parents: f.parents || [], appProperties: f.appProperties || {}, properties: f.properties || {},
      description: f.description || '', createdTime: f.createdTime || new Date().toISOString(), modifiedTime: f.modifiedTime || new Date().toISOString(),
      ownerEmail: f.ownerEmail || me.email, ownerName: f.ownerName || me.name, trashed: false, content: f.content || null,
      ...(f.driveId ? { driveId: f.driveId } : {}), // liegt in einer geteilten Ablage
    };
    if (file.mimeType.startsWith('image/')) {
      // lokale Adresse ohne Bild (404) – so wird auch der Ersatzweg über das Original geprüft
      file.thumbnailLink = `${location.origin}/tests/keine-vorschau/${id}=s220`;
      file.imageMediaMetadata = { width: 1200, height: 800, time: '2026:06:27 18:30:00' };
    }
    state.files.set(id, file);
    if (file.mimeType === 'application/vnd.google-apps.spreadsheet') newSpreadsheet(id, file.name);
    return file;
  }
  const view = (f) => {
    const { content, ownerEmail, ownerName, ...rest } = f;
    return { ...rest, ownedByMe: ownerEmail === me.email, owners: [{ emailAddress: ownerEmail, displayName: ownerName, photoLink: '' }], size: content ? content.byteLength : 0 };
  };
  /* Drive-Suchsprache (die Teilmenge, die die App benutzt): Bedingungen mit and/or/not und Klammern,
     z. B. "('a' in parents or 'b' in parents) and trashed = false and (mimeType = '…' or (mimeType contains 'image/'))" */
  function tokenize(q) {
    const tokens = [];
    const re = /\s*(?:'((?:[^'\\]|\\.)*)'|(\(|\)|\{|\}|!=|=|<=|>=|<|>)|([A-Za-z_][\w.]*))/y;
    while (re.lastIndex < q.length) {
      const start = re.lastIndex;
      const m = re.exec(q);
      if (!m) {
        if (/^\s*$/.test(q.slice(start))) break;
        throw new Error(`Drive-Abfrage nicht verstanden ab: ${q.slice(start)}`);
      }
      if (m[1] !== undefined) tokens.push({ t: 'str', v: m[1].replace(/\\(.)/g, '$1') });
      else if (m[2]) tokens.push({ t: 'op', v: m[2] });
      else tokens.push({ t: 'word', v: m[3] });
    }
    return tokens;
  }
  const compiled = new Map();
  function compile(q) {
    if (compiled.has(q)) return compiled.get(q);
    const tk = tokenize(q);
    let i = 0;
    const peek = () => tk[i];
    const next = (want) => {
      const tok = tk[i++];
      if (!tok || (want && tok.v !== want)) throw new Error(`Drive-Abfrage: „${want}“ erwartet in ${q}`);
      return tok;
    };
    const isWord = (w) => peek()?.t === 'word' && peek().v.toLowerCase() === w;
    const orExpr = () => {
      let left = andExpr();
      while (isWord('or')) { next(); const l = left; const r = andExpr(); left = (f) => l(f) || r(f); }
      return left;
    };
    const andExpr = () => {
      let left = notExpr();
      while (isWord('and')) { next(); const l = left; const r = notExpr(); left = (f) => l(f) && r(f); }
      return left;
    };
    const notExpr = () => {
      if (isWord('not')) { next(); const e = notExpr(); return (f) => !e(f); }
      return primary();
    };
    const primary = () => {
      const tok = peek();
      if (tok?.t === 'op' && tok.v === '(') { next(); const e = orExpr(); next(')'); return e; }
      if (tok?.t === 'str') { // 'x' in parents · 'me' in owners
        next();
        next('in');
        const field = next().v;
        if (field === 'parents') return (f) => f.parents.includes(tok.v);
        if (field === 'owners') return (f) => f.ownerEmail === (tok.v === 'me' ? me.email : tok.v);
        throw new Error(`Drive-Abfrage: „in ${field}“ nicht nachgebaut`);
      }
      const field = next().v;
      const op = next().v;
      if (op === 'has') { // appProperties has { key='k' and value='v' }
        next('{'); next('key'); next('='); const key = next().v; next('and'); next('value'); next('='); const val = next().v; next('}');
        return (f) => (f[field] || {})[key] === val;
      }
      const vt = next();
      const val = vt.t === 'str' ? vt.v : vt.v === 'true' ? true : vt.v === 'false' ? false : vt.v;
      if (op === '=') return (f) => f[field] === val;
      if (op === '!=') return (f) => f[field] !== val;
      if (op === 'contains') return (f) => String(f[field] ?? '').includes(val);
      if (op === '>') return (f) => String(f[field] ?? '') > val;
      if (op === '<') return (f) => String(f[field] ?? '') < val;
      throw new Error(`Drive-Abfrage: Vergleich „${op}“ nicht nachgebaut`);
    };
    const fn = orExpr();
    if (i < tk.length) throw new Error(`Drive-Abfrage: unerwartetes „${tk[i].v}“ in ${q}`);
    compiled.set(q, fn);
    return fn;
  }
  const matches = (f, q) => (q ? compile(q)(f) : true);

  async function parseMultipart(rawBody) {
    const bytes = new Uint8Array(await rawBody.arrayBuffer());
    const latin = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    const boundary = latin.slice(2, latin.indexOf('\r\n'));
    const jsonStart = latin.indexOf('{');
    const jsonEnd = latin.indexOf(`\r\n--${boundary}`, jsonStart);
    const meta = JSON.parse(new TextDecoder().decode(bytes.slice(jsonStart, jsonEnd)));
    const dataStart = latin.indexOf('\r\n\r\n', jsonEnd) + 4;
    const dataEnd = latin.lastIndexOf(`\r\n--${boundary}--`);
    return { meta, content: bytes.slice(dataStart, dataEnd).buffer };
  }

  async function driveApi(url, method, body, rawBody) {
    const upload = url.pathname.startsWith('/upload/');
    const path = decodeURIComponent(url.pathname.replace('/upload/drive/v3/', '').replace('/drive/v3/', ''));
    let m;
    if (path === 'files' && method === 'POST') {
      let meta = body;
      let content = null;
      if (upload) ({ meta, content } = await parseMultipart(rawBody));
      // neue Datei: gehört mir; Zielordner muss mir gehören
      const parentsOwn = (meta.parents || []).every((p) => state.files.get(p)?.ownerEmail === me.email);
      write('Datei anlegen', meta.name, parentsOwn);
      const f = addFile({ ...meta, content });
      return json({ id: f.id, name: f.name, createdTime: f.createdTime, webViewLink: `https://drive.google.com/file/d/${f.id}/view` });
    }
    if (path === 'files' && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const driveId = url.searchParams.get('driveId') || '';
      const allDrives = url.searchParams.get('includeItemsFromAllDrives') === 'true';
      state.queries.push({ q, driveId, corpora: url.searchParams.get('corpora') || '' });
      // Suche in der Domain kurz gestört (z. B. 408) – für den Test „keine fast leere Mitgliederliste“
      if (state.domainError && url.searchParams.get('corpora') === 'domain') return error(state.domainError, 'Request timed out.', 'timeout');
      // Dateien aus geteilten Ablagen nur mit includeItemsFromAllDrives (wie bei Google)
      const files = [...state.files.values()].filter((f) => (!f.driveId || allDrives) && (!driveId || f.driveId === driveId) && matches(f, q));
      return json({ files: files.map(view) });
    }
    if ((m = path.match(/^files\/([^/]+)\/permissions(?:\/([^/]+))?$/))) {
      const f = state.files.get(m[1]);
      if (!f) return error(404, 'File not found', 'notFound');
      if (method === 'GET') {
        const own = { id: 'owner', type: 'user', role: 'owner', emailAddress: f.ownerEmail };
        return json({ permissions: [own, ...state.permissions.filter((p) => p.file === m[1]).map(({ file, ...p }) => p)] });
      }
      if (method === 'DELETE') {
        write('Freigabe entfernen', f.name, f.ownerEmail === me.email);
        if (f.ownerEmail !== me.email) return error(403, 'The user does not have sufficient permissions for this file.', 'insufficientFilePermissions');
        const i = state.permissions.findIndex((p) => p.file === m[1] && p.id === m[2]);
        if (i < 0) return error(404, 'Permission not found', 'notFound');
        state.permissions.splice(i, 1);
        return new Response(null, { status: 204 });
      }
      write('Datei freigeben', f.name, f.ownerEmail === me.email);
      if (f.ownerEmail !== me.email) return error(403, 'The user does not have sufficient permissions for this file.', 'insufficientFilePermissions');
      const perm = { id: uid('p'), ...body };
      state.permissions.push({ file: m[1], ...perm });
      return json(perm);
    }
    if ((m = path.match(/^files\/([^/]+)$/))) {
      const f = state.files.get(m[1]);
      if (!f) return error(404, `File not found: ${m[1]}.`, 'notFound');
      if (method === 'PATCH') {
        let patch = body || {};
        let content;
        if (upload) ({ meta: patch, content } = await parseMultipart(rawBody));
        write('Datei ändern', f.name, f.ownerEmail === me.email);
        // drive.file: fremde Dateien darf die App nicht ändern
        if (f.ownerEmail !== me.email) return error(403, 'The user does not have sufficient permissions for this file.', 'insufficientFilePermissions');
        if (patch.description !== undefined) f.description = patch.description;
        if (patch.name !== undefined) f.name = patch.name;
        if (patch.trashed !== undefined) f.trashed = patch.trashed;
        if (patch.appProperties) f.appProperties = { ...f.appProperties, ...patch.appProperties };
        if (patch.properties) f.properties = { ...f.properties, ...patch.properties };
        if (content !== undefined) f.content = content;
        f.modifiedTime = new Date().toISOString();
        return json(view(f));
      }
      if (url.searchParams.get('alt') === 'media') return new Response(f.content || new ArrayBuffer(8), { status: 200, headers: { 'Content-Type': f.mimeType } });
      if ((url.searchParams.get('fields') || '').includes('capabilities')) return json({ capabilities: { canEdit: f.ownerEmail === me.email } });
      return json(view(f));
    }
    return error(400, `Unbekannter Drive-Aufruf ${path}`);
  }

  /* ------------------------------------------------------------ Chat & Personen */
  // Mitglieder je Raum als Verzeichnis-IDs (users/<ID>); unbekannte Konten bleiben als E-Mail
  const chatMembers = (state.chatMembers = {});
  const userKey = (ref) => {
    const v = String(ref || '').replace('users/', '').toLowerCase();
    const p = state.directory.find((d) => (d.emailAddresses || []).some((e) => String(e.value).toLowerCase() === v));
    return p ? p.resourceName.replace('people/', '') : v;
  };
  const membersOf = (space) => (chatMembers[space] = chatMembers[space] || [state.myDirectoryId]);

  function chatApi(url, method, body) {
    if (!workspace) return error(403, 'Google Chat API is only available to Google Workspace users.', 'PERMISSION_DENIED');
    const path = decodeURIComponent(url.pathname.replace('/v1/', ''));
    let m;
    // Google Chat für das Konto aus (z. B. Dienst aus, keine Lizenz): Google verweigert schon das Lesen
    if (path === 'spaces') return state.chatListError ? error(state.chatListError, 'The caller does not have permission', 'PERMISSION_DENIED') : json({ spaces: state.spaces });
    if (path === 'spaces:findDirectMessage') {
      const other = userKey(url.searchParams.get('name'));
      const dm = state.spaces.find((s) => s.spaceType === 'DIRECT_MESSAGE' && membersOf(s.name).includes(other));
      return dm ? json(dm) : error(404, 'Direct message not found', 'NOT_FOUND');
    }
    if (path === 'spaces:setup' && method === 'POST') {
      const type = body.space?.spaceType;
      const people = (body.memberships || []).map((x) => userKey(x.member?.name));
      if (type === 'DIRECT_MESSAGE') {
        const dm = state.spaces.find((s) => s.spaceType === 'DIRECT_MESSAGE' && membersOf(s.name).includes(people[0]));
        if (dm) return json(dm); // bestehende Direktnachricht (wie bei Google)
      }
      if (type === 'SPACE' && state.spaces.some((s) => s.displayName === body.space.displayName)) return error(409, 'A space with this name already exists.', 'ALREADY_EXISTS');
      const space = { name: `spaces/${uid('s')}`, spaceType: type, displayName: body.space.displayName || '', lastActiveTime: new Date().toISOString() };
      state.spaces.push(space);
      chatMembers[space.name] = [state.myDirectoryId, ...people];
      write('Chat-Unterhaltung anlegen', space.name, true);
      return json(space);
    }
    if ((m = path.match(/^(spaces\/[^/]+)\/members$/))) {
      const list = membersOf(m[1]);
      if (method === 'GET') return json({ memberships: list.map((u) => ({ name: `${m[1]}/members/${u}`, member: { name: `users/${u}`, type: 'HUMAN' } })) });
      if (method === 'POST') {
        write('Chat-Mitglied hinzufügen', m[1], true);
        if (!list.includes(state.myDirectoryId)) return error(403, 'The caller is not a member of the space.', 'PERMISSION_DENIED');
        const who = userKey(body.member?.name);
        if (list.includes(who)) return error(409, 'Membership already exists.', 'ALREADY_EXISTS');
        list.push(who);
        return json({ name: `${m[1]}/members/${who}`, member: { name: `users/${who}`, type: 'HUMAN' } });
      }
    }
    if ((m = path.match(/^(spaces\/[^/]+)\/messages$/))) {
      const list = (state.messages[m[1]] = state.messages[m[1]] || []);
      if (method === 'POST') {
        write('Chat-Nachricht', m[1], true);
        // wie bei Google, wenn z. B. Chat-Apps in der Admin-Konsole nicht erlaubt sind (Lesen geht weiter)
        if (state.chatSendDenied) return error(403, state.chatSendDenied, 'PERMISSION_DENIED');
        const msg ={ name: `${m[1]}/messages/${uid('m')}`, text: body.text, createTime: new Date().toISOString(), sender: { name: `users/${state.myDirectoryId}`, type: 'HUMAN' } };
        list.push(msg);
        return json(msg);
      }
      const filter = url.searchParams.get('filter');
      let outList = list.slice();
      const since = filter && filter.match(/createTime > "([^"]+)"/);
      if (since) outList = outList.filter((x) => x.createTime > since[1]);
      outList.sort((a, b) => b.createTime.localeCompare(a.createTime));
      const size = Number(url.searchParams.get('pageSize')) || 0;
      return json({ messages: size ? outList.slice(0, size) : outList });
    }
    return error(400, `Unbekannter Chat-Aufruf ${path}`);
  }

  function peopleApi(url) {
    if (url.pathname.includes('listDirectoryPeople')) {
      if (!workspace) return error(400, 'Must be a G Suite domain user.', 'FAILED_PRECONDITION');
      if (state.peopleError) return error(state.peopleError, 'People API has not been used in project 1 before or it is disabled.', 'PERMISSION_DENIED');
      return json({ people: state.directory });
    }
    return error(400, 'Unbekannter People-Aufruf');
  }

  const realFetch = window.fetch.bind(window);
  async function fakeFetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!/googleapis\.com$/.test(url.hostname)) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    const auth = (init.headers || {}).Authorization || '';
    if (!auth.startsWith('Bearer ')) return error(401, 'Login Required', 'UNAUTHENTICATED');
    let body = null;
    if (typeof init.body === 'string') body = JSON.parse(init.body);
    state.log.push(`${method} ${url.hostname}${url.pathname}`);
    try {
      if (url.hostname === 'sheets.googleapis.com') return await sheetsApi(url, method, body);
      if (url.pathname.startsWith('/calendar/')) return calendarApi(url, method, body);
      if (url.pathname.includes('/drive/v3/')) return await driveApi(url, method, body, init.body);
      if (url.hostname === 'chat.googleapis.com') return chatApi(url, method, body);
      if (url.hostname === 'people.googleapis.com') return peopleApi(url);
      if (url.hostname === 'openidconnect.googleapis.com') return json({ sub: state.myDirectoryId || '1000', email: me.email, name: me.name, picture: me.photo, hd: workspace ? 'beispiel.de' : undefined, given_name: me.name.split(' ')[0] });
      return error(404, `Kein Nachbau für ${url.href}`);
    } catch (e) {
      return error(e.status || 500, e.message);
    }
  }

  return { state, fakeFetch, newSpreadsheet, addFile };
}
