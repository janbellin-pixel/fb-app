// Papierpost (E44): Semesterprogramm und Bundesbote – wer braucht sie nicht mehr auf Papier?
// Die Wahl liegt als eigene Datei im eigenen Drive und ist nur für die Admins lesbar.
// Das Formular steht unter Mehr › Einstellungen (papierpostFormular); die Seite #/papierpost zeigt es
// den Admins zusammen mit der Liste der Abbestellungen.
import { html, setHtml, icon, hero, toast, showError, setBusy, loading, errorBox, emptyState, copyText } from '../ui.js';
import { fDateShort, toDate, isValid } from '../lib/dates.js';

const ARTEN = [
  { id: 'semesterprogramm', titel: 'Semesterprogramm', app: 'Die Termine stehen unter „Termine“.' },
  { id: 'bundesbote', titel: 'Bundesbote', app: 'Jede Ausgabe steht unter „Bundesbote“.' },
];

/** Hinweis, warum vorerst trotzdem alles verschickt wird (Stand der Verbindung, 2026) */
export const PAPIERPOST_HINWEIS = 'Zurzeit verschicken wir aus logistischen Gründen ohnehin noch alles an alle. Mit deiner Angabe wollen wir erst einmal sehen, wer das künftig nicht mehr gedruckt braucht.';

const datum = (iso) => {
  const d = toDate(iso);
  return isValid(d) ? fDateShort(d) : '';
};

/**
 * Formular in ein Element zeichnen (Einstellungen und Seite „Papierpost“). opts.onSaved() nach dem Speichern.
 */
export async function papierpostFormular(ctx, mount, opts = {}) {
  const { app } = ctx;
  const b = app.backend;
  let current = null;

  setHtml(mount, html`
    <form class="pp-form" novalidate>
      <p style="margin-top:0">Semesterprogramm und Bundesbote gibt es auch in der App. Sag uns hier, was du nicht mehr auf Papier brauchst.</p>
      <div class="pick-list pp-items">${loading()}</div>
      <p class="small muted">${icon('info', 'icon-sm')} ${PAPIERPOST_HINWEIS}</p>
      <div class="form-actions" style="justify-content:flex-start">
        <button class="btn btn-primary" type="submit" disabled>${icon('check', 'icon-sm')}Speichern</button>
      </div>
      <p class="tiny muted pp-status" aria-live="polite"></p>
    </form>`);

  const form = mount.querySelector('.pp-form');
  const items = form.querySelector('.pp-items');
  const submit = form.querySelector('[type=submit]');
  const statusEl = form.querySelector('.pp-status');

  const chosen = () => Object.fromEntries(ARTEN.map((a) => [a.id, !!form.elements[a.id]?.checked]));
  const changed = () => {
    const c = chosen();
    return ARTEN.some((a) => c[a.id] !== !!current?.[a.id]);
  };

  function renderItems() {
    setHtml(items, html`${ARTEN.map((a) => html`
      <label class="pick-row">
        <input type="checkbox" name="${a.id}" ${current?.[a.id] ? 'checked' : ''}>
        <span class="grow"><span class="name">${a.titel} brauche ich nicht auf Papier</span><span class="sub">${a.app}</span></span>
      </label>`)}`);
    update();
  }

  function update() {
    submit.disabled = !changed();
    statusEl.textContent = current?.geaendert && !changed() ? `Gespeichert am ${datum(current.geaendert)}.` : '';
  }

  form.addEventListener('change', update);
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=retry]')) app.refresh();
    if (e.target.closest('[data-action=relogin]')) app.relogin();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setBusy(submit, true, 'Wird gespeichert …');
    try {
      current = await b.saveMyPapierpost(chosen());
      setBusy(submit, false);
      toast('Gespeichert');
      renderItems();
      opts.onSaved?.();
    } catch (err) {
      setBusy(submit, false);
      showError(err);
      update();
    }
  });

  try {
    current = await b.getMyPapierpost();
  } catch (err) {
    if (!ctx.alive()) return;
    setHtml(items, errorBox(err));
    return;
  }
  if (!ctx.alive()) return;
  renderItems();
}

/** Seite „Papierpost“: Formular und – für Admins – die Liste der Abbestellungen */
export default async function papierpost(ctx) {
  const { el, app } = ctx;
  const b = app.backend;

  setHtml(el, html`
    ${hero('Papierpost', 'Semesterprogramm und Bundesbote')}
    <div class="card card-pad" id="pp-form-box"></div>
    ${app.isAdmin() ? html`<section class="card card-pad" style="margin-top:1rem">
      <h2 class="card-title">Abbestellungen</h2>
      <p class="small muted" style="margin-top:0">Nur für Admins sichtbar. ${PAPIERPOST_HINWEIS}</p>
      <div id="pp-list">${loading()}</div>
    </section>` : ''}
    <p class="small muted" style="margin-top:1rem"><a href="#/einstellungen">${icon('settings', 'icon-sm')} Zu den Einstellungen</a></p>`);

  async function loadList() {
    const box = el.querySelector('#pp-list');
    if (!box) return;
    let rows;
    try {
      rows = (await b.listPapierpost()).filter((r) => r.semesterprogramm || r.bundesbote);
    } catch (err) {
      setHtml(box, errorBox(err, { retry: false }));
      return;
    }
    if (!ctx.alive()) return;
    const n = (id) => rows.filter((r) => r[id]).length;
    const text = rows.map((r) => `${r.name} – ${ARTEN.filter((a) => r[a.id]).map((a) => a.titel).join(', ')}`).join('\n');
    setHtml(box, rows.length ? html`
      <p class="small">${ARTEN.map((a) => `${a.titel}: ${n(a.id)}`).join(' · ')}</p>
      <ul class="pp-list">${rows.map((r) => html`<li><strong>${r.name}</strong>
        <span class="small muted">${ARTEN.filter((a) => r[a.id]).map((a) => a.titel).join(', ')}${r.geaendert ? ` · ${datum(r.geaendert)}` : ''}</span></li>`)}</ul>
      <button class="btn btn-sm" type="button" data-action="copy">${icon('copy', 'icon-sm')}Liste kopieren</button>`
      : emptyState('mail', 'Noch keine Abbestellungen'));
    box.querySelector('[data-action=copy]')?.addEventListener('click', () => copyText(text));
  }

  await papierpostFormular(ctx, el.querySelector('#pp-form-box'), { onSaved: loadList });
  loadList();
}
