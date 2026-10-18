// Anmeldeseite (erscheint für jede Seite, solange niemand angemeldet ist)
import { config, isGoogleConfigured } from '../config.js';
import * as auth from '../auth.js';
import { html, setHtml, notice, icon } from '../ui.js';
import { GOOGLE_G } from '../icons.js';

export default async function login(ctx) {
  const { el, app } = ctx;
  document.body.classList.add('login-open');
  const err = app.loginError;
  const configured = isGoogleConfigured();
  setHtml(el, html`
    <div class="login">
      <div class="login-main">
        <img class="login-crest" src="assets/wappen-voll.webp" alt="Wappen der ${config.appName}" width="330" height="402">
        <h1>Mitglieder-App</h1>
        <p class="lead">Termine, Mitglieder, Chat, Adressen und der Bundesbote – alles an einem Ort.</p>
        ${err ? notice('red', err.title, err.text) : ''}
        ${configured ? html`
          <button class="google-btn" data-action="login">${GOOGLE_G}<span>Mit Google anmelden</span></button>
          <p class="small muted" style="margin:0">Bitte mit deinem Verbindungskonto${config.workspaceDomain ? html` (<strong>@${config.workspaceDomain}</strong>)` : ''} anmelden.<br>Das ist nur einmal nötig.</p>
        ` : notice('gold', 'Noch nicht eingerichtet', 'Die Google-Anmeldung ist für diese App noch nicht konfiguriert. Ein Admin kann das in wenigen Minuten erledigen.',
          html`<p style="margin-top:.625rem"><a class="btn btn-sm btn-primary" href="#/einrichtung">${icon('tool', 'icon-sm')}Einrichtung starten</a></p>`)}
        <div class="secondary">
          ${config.demoErlaubt ? html`<button class="btn btn-ghost btn-sm" data-action="demo">${icon('eye', 'icon-sm')}Demo mit Beispieldaten ansehen</button>` : ''}
          <a href="#/installieren" class="small">Wie installiere ich die App?</a>
          <a href="#/datenschutz" class="small">Datenschutzerklärung</a>
          ${configured ? html`<a href="#/einrichtung" class="tiny muted">Einrichtung (Admins)</a>` : ''}
        </div>
      </div>
      <div class="login-skyline" aria-hidden="true"><div class="sky"></div><div class="ground">Auf ewig ungeteilt.</div></div>
    </div>`);

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-action=login]')) {
      auth.clearSilentAttempt();
      // Kontoauswahl immer anzeigen: sonst meldet Google nach dem Abmelden still wieder das zuletzt
      // genutzte Konto an, und man kann nicht zu einem anderen Konto wechseln
      auth.login({ returnTo: location.hash && location.hash !== '#' ? location.hash : '#/', selectAccount: true });
    }
    if (e.target.closest('[data-action=demo]')) app.startDemo();
  });

  return () => document.body.classList.remove('login-open');
}
