// Papierpost abbestellen (E44): Semesterprogramm und Bundesbote einzeln abwählen.
// Die Wahl liegt als eigene Datei im eigenen Drive und ist nur für die Admins lesbar.
import { html, setHtml, icon, hero, toast, showError, setBusy, loading, errorBox, emptyState, copyText } from '../ui.js';
import { fDateShort, toDate, isValid } from '../lib/dates.js';

const ARTEN = [
  { id: 'semesterprogramm', titel: 'Semesterprogramm', app: 'Die Termine stehen unter „Termine“.' },
  { id: 'bundesbote', titel: 'Bundesbote', app: 'Jede Ausgabe steht unter „Bundesbote“.' },
];

const datum = (iso) => {
  const d = toDate(iso);
  return isValid(d) ? fDateShort(d) : '';
};

export default async function papierpost(ctx) {
  const { el, app } = ctx;
  const b = app.backend;
  let current = null;

  setHtml(el, html`
    ${hero('Papierpost abbestellen', 'Semesterprogramm und Bundesbote')}
    <form class="card card-pad" id="pp-form" novalidate>
      <p style="margin-top:0">Was du hier abwählst, bekommst du nicht mehr per Post, sondern über die App.</p>
      <div class="pick-list" id="pp-items">${loading()}</div>
      <p class="small muted">${icon('info', 'icon-sm')} Es kann sein, dass dich trotzdem einmal etwas per Post erreicht – beim Versand lässt sich das nicht immer verhindern.</p>
      <div class="form-actions" style="justify-content:flex-start">
        <button class="btn btn-primary" type="submit" disabled>${icon('check', 'icon-sm')}Speichern</button>
      </div>
      <p class="tiny muted" id="pp-status" aria-live="polite"></p>
    </form>
    ${app.isAdmin() ? html`<section class="card card-pad" style="margin-top:1rem">
      <h2 class="card-title">Abbestellungen</h2>
      <p class="small muted" style="margin-top:0">Nur für Admins sichtbar.</p>
      <div id="pp-list">${loading()}</div>
    </section>` : ''}`);

  const form = el.querySelector('#pp-form');
  const items = el.querySelector('#pp-items');
  const submit = form.querySelector('[type=submit]');
  const statusEl = el.querySelector('#pp-status');

  const chosen = () => Object.fromEntries(ARTEN.map((a) => [a.id, !!form.elements[a.id]?.checked]));
  const changed = () => {
    const c = chosen();
    return ARTEN.some((a) => c[a.id] !== !!current?.[a.id]);
  };

  function renderItems() {
    setHtml(items, html`${ARTEN.map((a) => html`
      <label class="pick-row">
        <input type="checkbox" name="${a.id}" ${current?.[a.id] ? 'checked' : ''}>
        <span class="grow"><span class="name">${a.titel} nicht mehr per Post</span><span class="sub">${a.app}</span></span>
      </label>`)}`);
    update();
  }

  function update() {
    submit.disabled = !changed();
    statusEl.textContent = current?.geaendert && !changed() ? `Gespeichert am ${datum(current.geaendert)}.` : '';
  }

  form.addEventListener('change', update);
  el.addEventListener('click', (e) => {
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
      loadList();
    } catch (err) {
      setBusy(submit, false);
      showError(err);
      update();
    }
  });

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

  try {
    current = await b.getMyPapierpost();
  } catch (err) {
    if (!ctx.alive()) return;
    setHtml(items, errorBox(err));
    return;
  }
  if (!ctx.alive()) return;
  renderItems();
  loadList();
}
