// Eigenes Profil pflegen.
// • Foto und Name kommen aus dem Google-Konto.
// • Die Verbindungsangaben (Kneipname, Tätigkeit, Angebot für Jüngere …) pflegt jedes Mitglied selbst –
//   gespeichert als eigene Datei im eigenen Drive.
// • Anschrift und Kontakt stehen im Adressverzeichnis, das der Schriftwart pflegt. Die App gleicht die
//   Eingaben damit ab und bereitet bei Abweichungen eine E-Mail an das Postfach für Adressänderungen vor.
//   Bewusst getrennt: siehe docs/ENTSCHEIDUNGEN.md („Selbst gepflegte Profile ≠ Adressverzeichnis“).
import {
  html, setHtml, icon, hero, avatar, loading, errorBox, toast, showError, formData, setBusy, notice, copyText, openModal,
} from '../ui.js';
import { config, statusKey } from '../config.js';
import * as auth from '../auth.js';
import { firstName, matchesQuery } from '../lib/text.js';
import { PROFILE_MAX } from '../backend/common.js';
import {
  ADRESS_FELDER, PROFIL_FELDER, findOwnAddress, anzeigeWert, vergleiche, mailEntwurf, adressaenderungEmail, adressaenderungMail,
} from '../lib/adressabgleich.js';

export default async function profil(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  const me = app.user;
  setHtml(el, html`${hero('Mein Profil', 'So sehen dich die anderen Mitglieder')}<div id="c">${loading()}</div>`);
  const c = el.querySelector('#c');

  let m;
  let addr = null;
  let addrError = null;
  try {
    [m] = await Promise.all([
      b.getMember(me.email).then((x) => x || { email: me.email, name: me.name, photo: me.photo }),
      b.listAddresses().then((d) => { addr = d; }).catch((e) => { addrError = e; }),
    ]);
  } catch (err) {
    setHtml(c, errorBox(err));
    return;
  }
  if (!ctx.alive()) return;

  const demo = app.mode === 'demo';
  const editable = config.profilBearbeiten !== false;
  let own = addr ? findOwnAddress(addr.items, { email: me.email, name: m.name || me.name }) : { entry: null };
  const statuses = config.statusOptionen || [];
  const field = (name, label, value, attrs = {}) => html`
    <div class="field"><label for="p-${name}">${label}</label>
      <input class="input" id="p-${name}" name="${name}" value="${value || ''}" maxlength="${attrs.max || 120}" placeholder="${attrs.ph || ''}"
        ${attrs.type ? html`type="${attrs.type}"` : ''} ${attrs.auto ? html`autocomplete="${attrs.auto}"` : ''} ${attrs.mode ? html`inputmode="${attrs.mode}"` : ''}>
      ${attrs.hint ? html`<span class="hint">${attrs.hint}</span>` : ''}</div>`;
  // „Aktiver Bursch“ aus dem Adressverzeichnis wählt „Aktiver Bursche“ (statusKey)
  const statusSelect = (value) => {
    const hit = statuses.find((s) => statusKey(s) === statusKey(value));
    return html`
    <div class="field"><label for="p-status">Status</label>
      <select class="select" id="p-status" name="status">
        <option value="">– bitte wählen –</option>
        ${statuses.map((s) => html`<option ${s === hit ? 'selected' : ''}>${s}</option>`)}
        ${value && !hit ? html`<option selected>${value}</option>` : ''}
      </select>
      <span class="hint">Maßgeblich ist das Adressverzeichnis – Abweichungen meldest du unten.</span></div>`;
  };

  const ownLine = () => (own.entry
    ? html`${icon('check', 'icon-sm')} Dein Eintrag im Adressverzeichnis${own.via === 'name' ? ' (über deinen Namen gefunden)' : own.via === 'auswahl' ? ` (ausgewählt: ${own.entry.name})` : ''}.`
    : addrError ? html`${icon('alert', 'icon-sm')} Das Adressverzeichnis ist gerade nicht erreichbar.`
      : !addr ? html`${icon('info', 'icon-sm')} Kein Adressverzeichnis eingerichtet.`
        : own.mehrdeutig ? html`${icon('alert', 'icon-sm')} Es gibt mehrere mögliche Einträge mit deinem Namen. Trag deine Angaben ein – der Schriftwart ordnet sie zu.`
          : html`${icon('alert', 'icon-sm')} Für dich gibt es noch keinen Eintrag. Trag deine Angaben ein und melde sie.`);

  // Adressänderungen: immer sichtbar oben – ein Tipp öffnet die E-Mail an das Postfach für Adressänderungen
  const mailTo = adressaenderungEmail();
  const vorlage = mailTo ? adressaenderungMail({ name: m.name || me.name, email: me.email }) : null;

  setHtml(c, html`
    ${vorlage ? html`
    <section class="card card-pad adr-hinweis">
      ${icon('mail')}
      <div class="grow" style="min-width:0">
        <h2 class="card-title" style="margin:0">Adressänderungen</h2>
        <p style="margin:.25rem 0 .75rem">Bitte teile uns Adressänderungen per E-Mail mit – zum Beispiel nach einem Umzug oder mit neuer Telefonnummer. Der Schriftwart trägt sie ins Adressverzeichnis ein.</p>
        <a class="btn btn-primary" id="adr-mail" href="${vorlage.href}">${icon('mail', 'icon-sm')}Adressänderung per E-Mail mitteilen</a>
        <p class="tiny muted" style="margin:.5rem 0 0">Öffnet eine E-Mail an <strong>${mailTo}</strong> in deinem E-Mail-Programm. Hast du unten unter „Anschrift und Kontakt“ etwas geändert, steht es schon drin.</p>
      </div>
    </section>` : ''}
    ${editable ? html`
    <div class="grid-2-1">
      <form class="card card-pad" id="f" novalidate>
        <h2 class="card-title" style="margin-bottom:.875rem">Angaben für die Verbindung</h2>
        <div class="form-grid cols-2">
          ${field('kneipname', 'Kneipname (v/o)', m.kneipname, { ph: 'z. B. Merlin' })}
          ${statusSelect(m.status)}
          ${field('rezeption', 'Rezeption', m.rezeption, { ph: 'z. B. WiSe 2024/25' })}
          ${field('aemter', 'Ämter / Chargen', m.aemter, { ph: 'z. B. Kassenwart (xx)' })}
          ${field('studium', 'Studium / Beruf', m.studium, { ph: 'z. B. Maschinenbau (M.Sc.)' })}
          ${field('taetigkeit', 'Aktuelle bzw. letzte Tätigkeit', m.taetigkeit, { max: 200, ph: 'z. B. Projektleiter bei … / im Ruhestand, zuletzt …' })}
          ${field('wohnort', 'Wohnort', m.wohnort, { ph: 'z. B. Hamburg' })}
        </div>
        <div class="field"><label for="p-ueber">Über mich</label>
          <textarea class="textarea" id="p-ueber" name="ueberMich" maxlength="${PROFILE_MAX.ueberMich}" placeholder="Hobbys, Interessen, wofür man dich ansprechen kann …">${m.ueberMich || ''}</textarea></div>
        <div class="field"><label for="p-angebot">Das kann ich jüngeren Bundesbrüdern anbieten</label>
          <textarea class="textarea" id="p-angebot" name="angebot" rows="3" maxlength="${PROFILE_MAX.angebot}" placeholder="z. B. Praktikum in meiner Firma, Mentoring, Bewerbungstipps, Kontakte in der Branche …">${m.angebot || ''}</textarea>
          <span class="hint">Erscheint hervorgehoben in deinem Profil und ist in der Mitgliederliste unter „Angebote“ zu finden.</span></div>
        <div class="form-grid cols-2">
          ${field('telefon', 'Telefon (für alle Mitglieder sichtbar)', m.telefon, { type: 'tel', ph: 'optional' })}
          ${field('instagram', 'Instagram', m.instagram, { ph: '@benutzername (optional)' })}
          ${field('linkedin', 'LinkedIn', m.linkedin, { ph: 'Profil-Link (optional)' })}
        </div>
        <p class="small muted">${icon('lock', 'icon-sm')} Deine Angaben werden als kleine Datei in <strong>deinem eigenen Google Drive</strong> gespeichert und für die Mitglieder nur lesbar freigegeben. Ändern kannst nur du.</p>
        <div class="form-actions">
          <a class="btn btn-ghost" href="#/mitglied/${encodeURIComponent(me.email)}">${icon('eye', 'icon-sm')}Profil ansehen</a>
          <button class="btn btn-primary" type="submit">${icon('check', 'icon-sm')}Speichern</button>
        </div>
      </form>

      <aside class="card card-pad stack" style="text-align:center">
        <div>${avatar(m, 132)}</div>
        <div><div style="font-weight:700;font-size:1.1875rem">${m.name}</div><div class="small muted">${me.email}</div></div>
        ${demo ? html`
          <label class="btn btn-block" style="cursor:pointer">${icon('image', 'icon-sm')}Foto ändern (Demo)
            <input type="file" accept="image/*" id="photo" class="sr-only"></label>
          <p class="tiny muted" style="margin:0">Im Echtbetrieb kommt das Foto aus dem Google-Konto.</p>`
        : html`
          <p class="small muted" style="margin:0">Foto und Name stammen aus deinem Google-Konto${me.hd ? ' der Verbindung' : ''} und sind dort für alle Mitglieder sichtbar.</p>
          <a class="btn btn-block" href="https://myaccount.google.com/personal-info" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Foto/Name bei Google ändern</a>
          <button class="btn btn-block btn-ghost" data-action="reload-google">${icon('refresh', 'icon-sm')}Änderungen übernehmen</button>`}
      </aside>
    </div>`
    : notice('gold', 'Profile werden zentral gepflegt', 'Kneipname, Status und weitere Angaben kommen aus dem Adressverzeichnis. Foto und Name änderst du in deinem Google-Konto.',
      html`<p style="margin-top:.625rem"><a class="btn btn-sm" href="https://myaccount.google.com/personal-info" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Google-Konto öffnen</a></p>`)}

    <section class="card card-pad" id="abgleich" style="margin-top:1rem">
      <h2 class="card-title">Anschrift und Kontakt</h2>
      <p class="small muted" style="margin:.25rem 0 .5rem">Diese Angaben stehen im <strong>Adressverzeichnis</strong>, das der Schriftwart pflegt. Prüfe sie hier: Stimmt etwas nicht oder fehlt etwas, bereitet die App eine E-Mail${adressaenderungEmail() ? html` an <strong>${adressaenderungEmail()}</strong>` : ''} mit deinen neuen Angaben vor.</p>
      <p class="small abgleich-status" id="own-line">${ownLine()}</p>
      ${addr?.items?.length ? html`<p style="margin:0 0 1rem"><button class="btn btn-sm" type="button" data-action="from-directory">${icon('book', 'icon-sm')}Aus Adressverzeichnis übernehmen</button></p>` : ''}
      <form id="adr" novalidate>
        ${!editable ? html`<div class="form-grid cols-2">${PROFIL_FELDER.map((f) => f.key === 'status' ? statusSelect(anzeigeWert(own.entry, 'status')) : field(f.key, f.label, anzeigeWert(own.entry, f.key)))}</div>` : ''}
        <div class="form-grid cols-2">${ADRESS_FELDER.map((f) => field(f.key, f.label, anzeigeWert(own.entry, f.key), { type: f.type, auto: f.auto, mode: f.mode, ph: f.ph || '', max: 160 }))}</div>
      </form>
      <div id="diffs" aria-live="polite"></div>
    </section>`);

  const diffsEl = c.querySelector('#diffs');
  let current = { diffs: [], mail: null };

  /** aktuelle Eingaben (Profilformular und Adressteil) */
  function eingabe() {
    const out = {};
    for (const f of [...PROFIL_FELDER, ...ADRESS_FELDER]) {
      const inp = c.querySelector(`#f [name="${f.key}"], #adr [name="${f.key}"]`);
      out[f.key] = inp ? inp.value : anzeigeWert(own.entry, f.key);
    }
    return out;
  }

  function renderDiffs() {
    if (!addr) {
      setHtml(diffsEl, '');
      current = { diffs: [], mail: null };
      const top = c.querySelector('#adr-mail');
      if (top && vorlage) top.href = vorlage.href;
      return;
    }
    const e = eingabe();
    const diffs = vergleiche(e, own.entry);
    const mail = diffs.length ? mailEntwurf({ user: { name: m.name || me.name, email: me.email }, eingabe: e, diffs, gefunden: !!own.entry }) : null;
    current = { diffs, mail };
    // der Knopf oben nimmt die eingetragenen Abweichungen mit, sonst die leere Vorlage
    const top = c.querySelector('#adr-mail');
    if (top && vorlage) top.href = mail?.href || vorlage.href;
    if (!diffs.length) {
      setHtml(diffsEl, html`<div class="notice notice-green" style="margin-top:.875rem">${icon('check')}<div class="grow"><p>Stimmt mit dem Adressverzeichnis überein.</p></div></div>`);
      return;
    }
    setHtml(diffsEl, html`
      <div class="notice notice-gold" style="margin-top:.875rem">${icon('alert')}<div class="grow">
        <h3>${own.entry ? 'Abweichung vom Adressverzeichnis' : 'Noch nicht im Adressverzeichnis'}</h3>
        <ul class="abgleich-liste">${diffs.map((d) => html`<li><strong>${d.label}:</strong> ${d.neu || html`<em>bitte löschen</em>`} <span class="muted">– ${d.alt ? `bisher: ${d.alt}` : 'bisher: fehlt'}</span></li>`)}</ul>
        <div class="row wrap" style="margin-top:.625rem">
          ${mail.href ? html`<a class="btn btn-primary" href="${mail.href}" data-action="mail">${icon('mail', 'icon-sm')}Änderung per E-Mail melden</a>` : ''}
          <button class="btn" type="button" data-action="copy-mail">${icon('copy', 'icon-sm')}Text kopieren</button>
        </div>
        <p class="tiny muted" style="margin:.5rem 0 0">${mail.an ? `Die E-Mail geht an ${mail.an}` : 'Es ist noch keine Adresse für Adressänderungen eingerichtet'} und wird erst verschickt, wenn du sie in deinem E-Mail-Programm absendest.</p>
      </div></div>`);
  }

  /** Eigenen Eintrag im Adressverzeichnis auswählen – wenn die App ihn nicht eindeutig gefunden hat */
  function chooseEntry() {
    const items = addr?.items || [];
    const nachname = String(m.name || me.name || '').trim().split(/\s+/).pop() || '';
    const list = (q) => {
      const hits = items.filter((a) => matchesQuery([a.name, a.kneipname, a.ort, a.email].join(' '), q)).slice(0, 40);
      return hits.length
        ? html`${hits.map((a) => html`<button type="button" class="pick-row" data-idx="${items.indexOf(a)}"><span class="grow" style="min-width:0">
            <span class="name">${a.name}</span><span class="sub">${[a.kneipname && `v/o ${a.kneipname}`, a.ort, a.status].filter(Boolean).join(' · ')}</span></span></button>`)}`
        : html`<p class="small muted">Kein Eintrag gefunden – anderen Teil des Namens versuchen.</p>`;
    };
    return openModal({
      title: 'Dein Eintrag im Adressverzeichnis',
      body: html`<p class="small muted" style="margin-top:0">Die App hat dich nicht eindeutig gefunden. Tippe auf deinen Eintrag – seine Angaben werden übernommen.</p>
        <div class="search" style="margin-bottom:.625rem">${icon('search')}<input class="input" type="search" id="pick-q" value="${nachname}" placeholder="Name, Ort …" aria-label="Im Adressverzeichnis suchen" autocomplete="off"></div>
        <div class="pick-list" id="pick-list">${list(nachname)}</div>`,
      actions: [{ label: 'Abbrechen', kind: 'ghost', value: null }],
      onOpen: (body, close) => {
        body.querySelector('#pick-q').addEventListener('input', (e) => setHtml(body.querySelector('#pick-list'), list(e.target.value)));
        body.addEventListener('click', (e) => {
          const row = e.target.closest('[data-idx]');
          if (row) close(items[+row.dataset.idx]);
        });
      },
    }).result;
  }

  const setField = (inp, v) => {
    if (inp.tagName === 'SELECT') {
      const hit = [...inp.options].find((o) => o.value && statusKey(o.value) === statusKey(v));
      if (hit) inp.value = hit.value;
      else if (v) inp.add(new Option(v, v, true, true));
      else inp.value = '';
    } else {
      inp.value = v;
    }
  };

  /**
   * Felder unter „Anschrift und Kontakt“ mit den Angaben aus dem Adressverzeichnis füllen (eigene Eingaben
   * dort weg). Kneipname, Status und Rezeption im Profil oben nur, wo noch nichts steht.
   */
  function fillFromEntry(entry) {
    for (const f of [...ADRESS_FELDER, ...(editable ? [] : PROFIL_FELDER)]) {
      const inp = c.querySelector(`#adr [name="${f.key}"]`);
      if (inp) setField(inp, anzeigeWert(entry, f.key));
    }
    if (!editable) return;
    for (const f of PROFIL_FELDER) {
      const inp = c.querySelector(`#f [name="${f.key}"]`);
      const v = anzeigeWert(entry, f.key);
      if (inp && v && !String(inp.value || '').trim()) setField(inp, v);
    }
  }

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(renderDiffs, 150); };
  c.addEventListener('input', schedule);
  c.addEventListener('change', schedule);
  renderDiffs();

  const form = c.querySelector('#f');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    setBusy(btn, true, 'Speichern …');
    try {
      await b.saveMyProfile(formData(form));
      renderDiffs();
      if (current.diffs.length) {
        // erst auf die Abweichungen hinweisen, statt die Seite zu verlassen
        setBusy(btn, false);
        toast('Profil gespeichert. Bitte melde noch die Abweichungen zum Adressverzeichnis.', { type: 'info', timeout: 6000 });
        c.querySelector('#abgleich').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        toast('Profil gespeichert');
        app.navigate(`#/mitglied/${encodeURIComponent(me.email)}`);
      }
    } catch (err) {
      setBusy(btn, false);
      showError(err);
    }
  });
  c.querySelector('#adr').addEventListener('submit', (e) => e.preventDefault());

  c.querySelector('#photo')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await b.setDemoPhoto(file);
      app.user = b.me;
      toast('Foto geändert');
      app.refresh();
    } catch (err) {
      showError(err);
    }
  });

  c.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action=from-directory]')) {
      const entry = own.entry || await chooseEntry();
      if (!entry || !ctx.alive()) return;
      if (!own.entry) {
        own = { entry, via: 'auswahl' };
        setHtml(c.querySelector('#own-line'), ownLine());
      }
      fillFromEntry(entry);
      renderDiffs();
      toast('Angaben aus dem Adressverzeichnis übernommen');
      return;
    }
    if (e.target.closest('[data-action=copy-mail]') && current.mail) {
      const { an, subject, body } = current.mail;
      copyText(`${an ? `An: ${an}\n` : ''}Betreff: ${subject}\n\n${body}`);
      return;
    }
    const btn = e.target.closest('[data-action=reload-google]');
    if (!btn) return;
    setBusy(btn, true, 'Wird geladen …');
    try {
      const { userinfo } = await import('../google/people.js');
      const info = await userinfo();
      Object.assign(app.user, { name: info.name || app.user.name, photo: info.picture || '', firstName: info.given_name || firstName(info.name) });
      auth.setUser(app.user);
      b.user = app.user;
      b.invalidate?.('directory');
      toast('Foto und Name aktualisiert');
      app.refresh();
    } catch (err) {
      setBusy(btn, false);
      showError(err);
    }
  });
}
