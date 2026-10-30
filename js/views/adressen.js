// Adressverzeichnis (Google-Tabelle, nur lesen)
import { html, setHtml, icon, hero, avatar, skeletonList, emptyState, errorBox, toast } from '../ui.js';
import { matchesQuery, norm } from '../lib/text.js';
import { toDate, nextBirthday, fDateShort } from '../lib/dates.js';
import { toVcard, downloadFile, mapsUrl } from '../lib/export.js';
import { config } from '../config.js';
import { memberMap, adrName } from './parts.js';
import { memberFinder } from '../lib/einladung.js';

const tel = (s) => String(s || '').replace(/[^\d+]/g, '');

export default async function adressen(ctx) {
  const { el, app, query } = ctx;
  const b = app.backend;
  let data = null;
  let members = new Map();
  let q = query.q || '';
  let status = 'Alle';
  let open = null;

  setHtml(el, html`
    ${hero('Adressverzeichnis', 'Nur zum Nachschlagen – Änderungen bitte an die Admins', html`
      <a class="btn hidden" id="sheet-link" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Tabelle öffnen</a>
      <button class="btn" data-action="vcf-all">${icon('download', 'icon-sm')}Alle als Kontakte</button>`)}
    <div class="search" style="margin-bottom:.625rem">${icon('search')}<input class="input" type="search" id="q" placeholder="Name, Ort, Telefon …" value="${q}" aria-label="Adressen durchsuchen" autocomplete="off"></div>
    <div class="chips" id="status"></div>
    <div id="list">${skeletonList(6, 'sk-line')}</div>`);
  const listEl = el.querySelector('#list');

  function filtered() {
    return data.items.filter((a) => (status === 'Alle' || a.status === status)
      && matchesQuery([a.name, a.kneipname, a.status, a.strasse, a.plz, a.ort, a.telefon, a.mobil, a.email, a.beruf].join(' '), q));
  }

  /** Ohne Google-Verzeichnis (Berechtigung fehlt, Fehler) ist die Mitgliederliste unvollständig – dann lieber kein „Einladen“ */
  const verzeichnisFehlt = () => app.mode === 'google' && !!b.directoryInfo && !b.directoryInfo.ok && b.directoryInfo.reason !== 'no-workspace';

  /** member: Mitglied mit App-Konto zu diesem Eintrag (über E-Mail-Adresse oder Namen, E58) oder null */
  function detailHtml(a, member) {
    const bday = a.geburtstag ? toDate(a.geburtstag) : null;
    const nb = nextBirthday(bday);
    const addr = [a.strasse, [a.plz, a.ort].filter(Boolean).join(' '), a.land && a.land !== 'Deutschland' ? a.land : ''].filter(Boolean);
    return html`<div class="addr-detail">
      <dl class="facts">
        ${addr.length ? html`<div><dt>Adresse</dt><dd>${addr.map((l, i) => html`${i ? html`<br>` : ''}${l}`)}</dd></div>` : ''}
        ${a.mobil ? html`<div><dt>Mobil</dt><dd><a href="tel:${tel(a.mobil)}">${a.mobil}</a></dd></div>` : ''}
        ${a.telefon ? html`<div><dt>Telefon</dt><dd><a href="tel:${tel(a.telefon)}">${a.telefon}</a></dd></div>` : ''}
        ${a.email ? html`<div><dt>E-Mail</dt><dd><a href="mailto:${a.email}">${a.email}</a></dd></div>` : ''}
        ${bday ? html`<div><dt>Geburtstag</dt><dd>${fDateShort(bday)}${nb?.age ? html` <span class="muted small">(wird ${nb.age} in ${nb.days === 0 ? 'heute!' : `${nb.days} Tagen`})</span>` : ''}</dd></div>`
          : a.geburtstagText ? html`<div><dt>Geburtstag</dt><dd>${a.geburtstagText}</dd></div>` : ''}
        ${a.rezeption ? html`<div><dt>Rezeption</dt><dd>${a.rezeption}</dd></div>` : ''}
        ${a.beruf ? html`<div><dt>Beruf / Studium</dt><dd>${a.beruf}</dd></div>` : ''}
        ${a.extras.map((x) => html`<div><dt>${x.label}</dt><dd>${x.value}</dd></div>`)}
      </dl>
      <div class="addr-actions">
        ${a.mobil || a.telefon ? html`<a class="btn btn-sm" href="tel:${tel(a.mobil || a.telefon)}">${icon('phone', 'icon-sm')}Anrufen</a>` : ''}
        ${a.email ? html`<a class="btn btn-sm" href="mailto:${a.email}">${icon('mail', 'icon-sm')}E-Mail</a>` : ''}
        ${addr.length ? html`<a class="btn btn-sm" href="${mapsUrl(addr.join(', '))}" target="_blank" rel="noopener">${icon('pin', 'icon-sm')}Karte</a>` : ''}
        <button class="btn btn-sm" data-vcf="${a.id}">${icon('download', 'icon-sm')}In Kontakte</button>
        ${member ? html`<a class="btn btn-sm btn-ghost" href="#/mitglied/${encodeURIComponent(member.email)}">${icon('user', 'icon-sm')}Profil</a>`
          : members.size && !verzeichnisFehlt() ? html`<a class="btn btn-sm btn-ghost" href="#/einladen/${encodeURIComponent(a.id)}?von=adressen" title="${a.name} ist noch nicht in der App">${icon('smartphone', 'icon-sm')}In die App einladen</a>` : ''}
      </div>
    </div>`;
  }

  function render() {
    if (!data) return;
    const statuses = data.hasStatus ? [...new Set(data.items.map((a) => a.status).filter(Boolean))] : [];
    setHtml(el.querySelector('#status'), statuses.length > 1 ? html`
      <button class="chip" data-status="Alle" aria-pressed="${status === 'Alle'}">Alle <span class="count">${data.items.length}</span></button>
      ${statuses.map((s) => html`<button class="chip" data-status="${s}" aria-pressed="${status === s}">${s}</button>`)}` : '');
    const list = filtered();
    if (!list.length) {
      setHtml(listEl, html`<div class="card">${emptyState('book', 'Keine Einträge gefunden', q ? `Keine Treffer für „${q}“.` : '')}</div>`);
      return;
    }
    let letter = '';
    const parts = [];
    const find = memberFinder(members);
    for (const a of list) {
      const l = norm(a.nachname || a.name).charAt(0).toUpperCase();
      if (l !== letter) {
        letter = l;
        parts.push(html`<h3 class="alpha-head">${l}</h3>`);
      }
      const m = find(a);
      const person = m || { name: a.name, email: a.email };
      const isOpen = open === a.id;
      parts.push(html`<div class="card" style="margin-bottom:.5rem">
        <div class="addr-row" data-open="${a.id}" role="button" tabindex="0" aria-expanded="${isOpen}">
          ${avatar(person, 42)}
          <div class="grow" style="min-width:0">
            <div class="name ellipsis">${adrName(a)}${a.kneipname ? html` <span class="muted" style="font-weight:450;font-style:italic">v/o ${a.kneipname}</span>` : ''}</div>
            <div class="sub ellipsis">${[a.status, a.ort].filter(Boolean).join(' · ')}</div>
          </div>
          ${icon(isOpen ? 'chevronDown' : 'chevronRight', 'icon-sm')}
        </div>
        ${isOpen ? detailHtml(a, m) : ''}
      </div>`);
    }
    setHtml(listEl, html`<p class="small muted" style="margin:0 0 .375rem">${list.length} ${list.length === 1 ? 'Eintrag' : 'Einträge'}</p>${parts}`);
  }

  el.addEventListener('input', (e) => {
    if (e.target.id === 'q') { q = e.target.value; render(); }
  });
  el.addEventListener('click', (e) => {
    const t = e.target;
    const st = t.closest('[data-status]');
    if (st) { status = st.dataset.status; render(); return; }
    const vcf = t.closest('[data-vcf]');
    if (vcf) {
      const a = data.items.find((x) => x.id === vcf.dataset.vcf);
      if (a) downloadFile(`${a.name}.vcf`, toVcard({ ...a, geburtstagDate: a.geburtstag ? toDate(a.geburtstag) : null }, config.appName), 'text/vcard');
      return;
    }
    if (t.closest('[data-action=vcf-all]')) {
      if (!data) return;
      const list = filtered();
      downloadFile(`${config.appName} – Adressen.vcf`, list.map((a) => toVcard({ ...a, geburtstagDate: a.geburtstag ? toDate(a.geburtstag) : null }, config.appName)).join(''), 'text/vcard');
      toast(`${list.length} Kontakte exportiert`);
      return;
    }
    if (t.closest('a, button')) {
      if (t.closest('[data-action=retry]')) app.refresh();
      if (t.closest('[data-action=relogin]')) app.relogin();
      return;
    }
    const row = t.closest('[data-open]');
    if (row) { open = open === row.dataset.open ? null : row.dataset.open; render(); }
  });
  el.addEventListener('keydown', (e) => {
    const row = e.target.closest?.('[data-open]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
  });

  b.listMembers().then((list) => { members = memberMap(list); render(); }).catch(() => {});

  try {
    await app.load('addresses', () => b.listAddresses(), (d) => {
      data = d;
      if (d.sheetUrl) {
        const link = el.querySelector('#sheet-link');
        link.href = d.sheetUrl;
        link.classList.remove('hidden');
      }
      if (ctx.alive()) render();
    }, { maxAge: 30 * 60_000 });
  } catch (err) {
    if (!data) setHtml(listEl, errorBox(err));
  }
}
