// „Mehr“-Menü, Einstellungen & Datenschutz, Installationsanleitung
import {
  html, raw, setHtml, icon, hero, avatar, toast, confirmDialog, isStandalone, isIos, loadScript, copyText, notice,
} from '../ui.js';
import { config, appBaseUrl, hasOverride, clearOverride, isGoogleConfigured, hasSongbook, hasDsZeitung, extraLinks } from '../config.js';
import { ICON_NAMES } from '../icons.js';
import * as hinweise from '../lib/hinweise.js';
import * as auth from '../auth.js';
import { schriftAuswahl, bindSchriftAuswahl } from '../lib/schrift.js';

function menuItem(href, ic, label, sub = '', extra = '') {
  return html`<a class="menu-item" href="${href}" ${extra}>${icon(ic)}<span class="grow">${label}${sub ? html`<small>${sub}</small>` : ''}</span>${icon('chevronRight', 'icon-sm chev')}</a>`;
}

export default async function mehr(ctx) {
  const { el, app } = ctx;
  const me = app.user;
  const admin = app.isAdmin();
  setHtml(el, html`
    ${hero('Mehr', config.appName)}
    <div class="card account-card">
      <a class="account-who" href="#/profil">
        ${avatar(me, 56)}
        <div class="grow" style="min-width:0"><div style="font-weight:700;font-size:1.125rem" class="ellipsis">${me.name}</div><div class="small muted ellipsis">${me.email}</div></div>
      </a>
      <div class="account-actions">
        <a class="btn btn-sm" href="#/profil">${icon('edit', 'icon-sm')}Profil</a>
        <button class="btn btn-sm" data-action="logout">${icon('logout', 'icon-sm')}${app.mode === 'demo' ? 'Demo beenden' : 'Abmelden'}</button>
      </div>
    </div>
    <section class="card card-pad" style="margin-top:1rem" id="schrift-box">
      <div class="row between wrap" style="margin-bottom:.625rem"><h2 class="card-title">Schriftgröße</h2><span class="tiny muted">gilt für dieses Gerät</span></div>
      ${schriftAuswahl()}
    </section>
    <div class="grid-2" style="margin-top:1rem">
      <div class="card menu-list">
        ${menuItem('#/news', 'news', html`Neuigkeiten<span class="menu-badge hidden" data-badge="news"></span>`, 'Aus dem Bundesleben')}
        ${menuItem('#/forum', 'forum', 'Forum', 'Diskussionen und Fragen')}
        ${menuItem('#/zeitung', 'paper', 'Bundesbote', 'Alle Ausgaben zum Blättern')}
        ${app.mode === 'demo' || hasDsZeitung() ? menuItem('#/ds-zeitung', 'newspaper', 'DS-Zeitung', 'Zeitung der Deutschen Sängerschaft') : ''}
        ${app.mode === 'demo' || hasSongbook() ? menuItem('#/lieder', 'music', 'Liedermappe', 'Noten und Texte zum Mitsingen') : ''}
        ${menuItem('#/galerie', 'image', 'Galerie', 'Fotos aus dem Bundesleben')}
        ${menuItem('#/adressen', 'book', 'Adressverzeichnis', 'Nachschlagen, anrufen, in Kontakte übernehmen')}
        ${menuItem('#/termine?abo=1', 'calendarPlus', 'Kalender abonnieren', 'Termine im eigenen Kalender')}
        ${extraLinks().map((l) => html`<a class="menu-item" href="${l.url}" target="_blank" rel="noopener">${icon(ICON_NAMES.includes(l.symbol) ? l.symbol : 'globe')}<span class="grow">${l.titel}<small>${l.host} – öffnet sich außerhalb der App</small></span>${icon('external', 'icon-sm chev')}</a>`)}
      </div>
      <div class="card menu-list">
        ${menuItem('#/profil', 'user', 'Mein Profil', 'Kneipname, Status, Ämter, Über mich')}
        ${menuItem('#/datenschutz', 'shield', 'Datenschutz', 'Erklärung, Einwilligungen erteilen oder widerrufen')}
        ${!isStandalone() ? menuItem('#/installieren', 'smartphone', 'App installieren', 'Auf den Startbildschirm legen') : ''}
        ${menuItem('#/einstellungen', 'settings', 'Einstellungen', 'Konto, Daten auf diesem Gerät')}
        ${admin ? menuItem('#/einrichtung', 'tool', 'Einrichtung (Admins)', 'Google-Anbindung, Kalender, Tabellen') : ''}
        <button class="menu-item" data-action="logout">${icon('logout')}<span class="grow">${app.mode === 'demo' ? 'Demo beenden' : 'Abmelden'}</span></button>
      </div>
    </div>`);
  bindSchriftAuswahl(el.querySelector('#schrift-box'));
  hinweise.refreshBadges();
  el.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-action=logout]')) return;
    if (app.mode === 'demo') return app.endDemo();
    if (await confirmDialog(`Auf diesem Gerät abmelden (${me.email})? Beim nächsten Anmelden kannst du auch ein anderes Google-Konto wählen.`, { ok: 'Abmelden' })) app.logout();
  });
}

/* ===================================================================== Einstellungen */

export async function settings(ctx) {
  const { el, app } = ctx;
  const me = app.user;
  const scopes = auth.grantedScopes().map((s) => s.replace('https://www.googleapis.com/auth/', ''));
  setHtml(el, html`
    ${hero('Einstellungen', 'Konto, Daten und Datenschutz')}
    <div class="grid-2">
      <div class="stack">
        <section class="card card-pad" id="schrift-box">
          <h2 style="margin:0 0 .25rem;font-weight:300;font-size:1.375rem">Schriftgröße</h2>
          <p class="small muted">Vergrößert Text, Knöpfe und Symbole in der ganzen App – gut für kleine Bildschirme oder wenn das Lesen schwerfällt.</p>
          ${schriftAuswahl()}
        </section>
        <section class="card card-pad" id="notify-box">
          <h2 style="margin:0 0 .25rem;font-weight:300;font-size:1.375rem">Benachrichtigungen</h2>
          <p class="small"><strong>Aufs Handy, auch wenn diese App zu ist:</strong> die App „Google Chat“ installieren
            (<a href="${hinweise.GOOGLE_CHAT_APP.android}" target="_blank" rel="noopener">Android</a> · <a href="${hinweise.GOOGLE_CHAT_APP.ios}" target="_blank" rel="noopener">iPhone</a>)
            und mit dem Verbindungskonto anmelden. Dort kommen private Nachrichten und die Ankündigungen neuer News an.</p>
          <p class="small muted">In dieser App – nur wenn du es hier einschaltest: Zahlen am Chat und an „Mehr“, Markierungen für Neues, Hinweise auf neue Nachrichten und News und, solange die App im Hintergrund geöffnet ist, Mitteilungen des Systems (mit Absender und Anfang der Nachricht). Gilt nur für dieses Gerät.</p>
          <div id="notify-state"></div>
        </section>
        <div class="card card-pad">
          <h2 style="margin:0 0 .75rem;font-weight:300;font-size:1.375rem">Konto</h2>
          <dl class="kv">
            <dt>Name</dt><dd>${me.name}</dd>
            <dt>E-Mail</dt><dd>${me.email}</dd>
            <dt>Modus</dt><dd>${app.mode === 'demo' ? 'Demo (Beispieldaten)' : 'Google'}${me.hd ? ` · Workspace ${me.hd}` : app.mode === 'google' ? ' · privates Google-Konto' : ''}</dd>
            <dt>App-Version</dt><dd>${app.version}</dd>
          </dl>
          ${app.mode === 'google' ? html`<details style="margin-top:.75rem"><summary class="small" style="cursor:pointer">Erteilte Google-Berechtigungen</summary>
            <ul class="small muted" style="margin:.5rem 0 0;padding-left:1.125rem">${scopes.map((s) => html`<li><code>${s}</code></li>`)}</ul></details>` : ''}
          <div class="row wrap" style="margin-top:1rem">
            ${app.mode === 'demo'
              ? html`<button class="btn" data-action="demo-reset">${icon('refresh', 'icon-sm')}Demo zurücksetzen</button><button class="btn btn-primary" data-action="end-demo">Demo beenden</button>`
              : html`<button class="btn" data-action="logout">${icon('logout', 'icon-sm')}Abmelden</button>
                <button class="btn btn-danger" data-action="revoke">Zugriff widerrufen</button>`}
          </div>
        </div>
        <div class="card card-pad">
          <h2 style="margin:0 0 .75rem;font-weight:300;font-size:1.375rem">Daten auf diesem Gerät</h2>
          <p class="small">Damit die App schnell startet und auch ohne Netz funktioniert, merkt sie sich den zuletzt geladenen Stand (Termine, Mitglieder, gelesene Ausgaben des Bundesboten und der DS-Zeitung, geöffnete Lieder).</p>
          <div class="row wrap">
            <button class="btn" data-action="clear-cache">${icon('trash', 'icon-sm')}Zwischenspeicher leeren</button>
            <button class="btn" data-action="update">${icon('refresh', 'icon-sm')}Nach Updates suchen</button>
          </div>
          ${hasOverride() ? html`<hr><p class="small">Auf diesem Gerät ist eine eigene Konfiguration aus der Einrichtung aktiv.</p>
            <button class="btn btn-sm" data-action="clear-config">Lokale Konfiguration entfernen</button>` : ''}
        </div>
      </div>
      <div class="card card-pad prose" style="font-size:.9688rem">
        <h2 style="margin-top:0;font-weight:300;font-size:1.375rem">Datenschutz – kurz erklärt</h2>
        <ul>
          <li><strong>Keine eigenen Server:</strong> Die App ist eine Web-App. Sie lädt die Daten direkt aus dem Google-Konto der Verbindung – Kalender, Tabellen, Drive und Chat. Wer was sehen darf, regeln allein die Google-Freigaben.</li>
          <li><strong>Anmeldung über Google:</strong> Die App bekommt einen Zugangsschlüssel, der eine Stunde gilt. Dein Passwort sieht sie nie.</li>
          <li><strong>Auf dem Gerät</strong> liegen nur der Zugangsschlüssel und ein Zwischenspeicher für die Offline-Nutzung. „Abmelden“ löscht beides.</li>
          <li><strong>Keine Tracker, keine Werbung,</strong> keine Schriften oder Skripte von Fremdanbietern – alles wird mit der App ausgeliefert.</li>
          <li>Über <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener">myaccount.google.com</a> kannst du den Zugriff der App jederzeit widerrufen.</li>
        </ul>
        <p><a class="btn btn-sm" href="#/datenschutz">${icon('shield', 'icon-sm')}Datenschutzerklärung und Einwilligungen</a></p>
      </div>
    </div>`);

  bindSchriftAuswahl(el.querySelector('#schrift-box'));
  const renderNotify = () => {
    const perm = hinweise.notificationPermission();
    if (!hinweise.notificationsWanted()) {
      setHtml(el.querySelector('#notify-state'), html`<p class="small"><strong>Aus.</strong> Die App zeigt keine Zahlen, Hinweise oder Mitteilungen.</p>
        <button class="btn btn-sm btn-primary" data-action="notify-on">${icon('chat', 'icon-sm')}Benachrichtigungen einschalten</button>`);
      return;
    }
    const system = perm === 'granted' ? 'Mitteilungen des Systems sind erlaubt – sie erscheinen, wenn die App im Hintergrund geöffnet ist.'
      : perm === 'denied' ? 'Mitteilungen des Systems sind im Browser blockiert; erlauben lassen sie sich in den Website-Einstellungen des Browsers.'
        : perm === 'unsupported' ? `Mitteilungen des Systems kann dieser Browser nicht anzeigen.${isIos() && !isStandalone() ? ' Auf dem iPhone geht es nur, wenn die App auf dem Home-Bildschirm liegt (Mehr › App installieren).' : ''}`
          : 'Mitteilungen des Systems (wenn die App im Hintergrund geöffnet ist) sind noch nicht erlaubt.';
    setHtml(el.querySelector('#notify-state'), html`<p class="small">${icon('check', 'icon-sm')} <strong>Eingeschaltet:</strong> Zahlen am Chat und an „Mehr“ und Hinweise in der App.</p>
      <p class="small muted">${system}</p>
      <div class="row wrap">
        ${perm === 'default' ? html`<button class="btn btn-sm" data-action="notify-perm">Mitteilungen erlauben</button>` : ''}
        ${perm === 'granted' ? html`<button class="btn btn-sm" data-action="notify-test">Probe-Mitteilung</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-action="notify-off">Ausschalten</button>
      </div>`);
  };
  renderNotify();
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'notify-on':
        await hinweise.enableNotifications();
        renderNotify();
        toast('Benachrichtigungen eingeschaltet – ab jetzt zeigt die App, was neu ist.');
        break;
      case 'notify-perm':
        await hinweise.requestSystemPermission();
        renderNotify();
        break;
      case 'notify-off':
        hinweise.disableNotifications();
        renderNotify();
        break;
      case 'notify-test': {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (!reg) { toast('Mitteilungen gehen erst mit installiertem Service Worker (Seite neu laden).', { type: 'err' }); break; }
        await reg.showNotification('Mitglieder-App', { body: 'So sehen Mitteilungen aus.', icon: 'assets/icons/icon-192.png', tag: 'probe', data: { url: location.href } }).catch((err) => toast(err.message, { type: 'err' }));
        break;
      }
      case 'demo-reset':
        if (await confirmDialog('Alle in der Demo gemachten Änderungen (Zusagen, Beiträge, Profil) zurücksetzen?', { ok: 'Zurücksetzen' })) {
          app.backend.reset();
          await app.clearCache();
          toast('Demo zurückgesetzt');
          app.navigate('#/');
        }
        break;
      case 'end-demo':
        app.endDemo();
        break;
      case 'logout':
        if (await confirmDialog('Auf diesem Gerät abmelden?', { ok: 'Abmelden' })) app.logout();
        break;
      case 'revoke':
        if (await confirmDialog('Der App den Zugriff auf dein Google-Konto entziehen? Beim nächsten Anmelden fragt Google erneut nach deiner Zustimmung.', { ok: 'Widerrufen', danger: true })) app.logout({ revoke: true });
        break;
      case 'clear-cache':
        await app.clearCache();
        toast('Zwischenspeicher geleert');
        break;
      case 'update': {
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.update().catch(() => {});
        toast('Die App ist auf dem neuesten Stand – sonst erscheint gleich ein Hinweis.', { type: 'info' });
        break;
      }
      case 'clear-config':
        clearOverride();
        toast('Lokale Konfiguration entfernt');
        setTimeout(() => location.reload(), 600);
        break;
      default:
    }
  });
}

/* ===================================================================== Installieren */

function platform() {
  if (isIos()) return 'ios';
  if (/android/i.test(navigator.userAgent)) return 'android';
  return 'desktop';
}

export async function install(ctx) {
  const { el, app } = ctx;
  const url = appBaseUrl();
  const p = platform();
  const standalone = isStandalone();
  const shareIcon = raw('<svg class="icon icon-sm" viewBox="0 0 24 24" aria-label="Teilen-Symbol"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4M12 2v13"/></svg>');
  const steps = {
    ios: [
      html`Die App in <strong>Safari</strong> öffnen (nicht in der Instagram-, WhatsApp- oder Google-App – dort über „In Safari öffnen“).`,
      html`Unten auf das <strong>Teilen-Symbol</strong> ${shareIcon} tippen.`,
      html`Nach unten scrollen und <strong>„Zum Home-Bildschirm“</strong> wählen.`,
      html`Oben rechts auf <strong>„Hinzufügen“</strong> tippen – fertig. Das Wappen liegt jetzt auf dem Startbildschirm.`,
    ],
    android: [
      html`Die App in <strong>Chrome</strong> öffnen.`,
      html`Auf <strong>„Installieren“</strong> unten tippen – oder oben rechts auf <strong>⋮</strong> und dann <strong>„App installieren“</strong> bzw. „Zum Startbildschirm hinzufügen“.`,
      html`Bestätigen – die App erscheint wie jede andere im App-Menü.`,
    ],
    desktop: [
      html`In <strong>Chrome</strong> oder <strong>Edge</strong>: rechts in der Adressleiste auf das Installieren-Symbol klicken (Bildschirm mit Pfeil).`,
      html`Oder im Menü <strong>⋮ → „App installieren“</strong> bzw. „Apps → Diese Website als App installieren“ wählen.`,
      html`Am Handy geht es am schnellsten mit dem QR-Code rechts.`,
    ],
  };
  const names = { ios: 'iPhone & iPad', android: 'Android', desktop: 'Computer' };
  setHtml(el, html`
    ${hero('App installieren', 'Einmal einrichten – dann öffnet sie sich wie jede andere App')}
    ${standalone ? notice('green', 'Bereits installiert', 'Du nutzt die App schon vom Startbildschirm aus. 🎉') : ''}
    <div class="grid-2-1">
      <div class="stack">
        <div class="card card-pad" id="native-box" ${app.installPrompt && !standalone ? '' : 'hidden'}>
          <h2 style="margin:0 0 .375rem;font-weight:300;font-size:1.375rem">Direkt installieren</h2>
          <p class="small muted">Dein Browser unterstützt die Installation mit einem Klick.</p>
          <button class="btn btn-green btn-lg" data-action="install">${icon('download', 'icon-sm')}Jetzt installieren</button>
        </div>
        <div class="card card-pad">
          <div class="chips" role="tablist">${Object.keys(steps).map((k) => html`<button class="chip" role="tab" data-p="${k}" aria-pressed="${k === p}">${names[k]}</button>`)}</div>
          <ol class="install-steps" id="steps"></ol>
        </div>
        <div class="notice">${icon('info')}<div><h3>Danach</h3><p>Beim ersten Öffnen einmal mit dem Google-Konto der Verbindung anmelden. Die App merkt sich die Anmeldung. Updates kommen automatisch – nichts muss aus einem App-Store geladen werden.</p></div></div>
      </div>
      <aside class="card card-pad" style="text-align:center">
        <h3 style="margin:0 0 .625rem">Link zur App</h3>
        <div class="qr" id="qr" aria-label="QR-Code mit dem Link zur App"><div class="spinner"></div></div>
        <p class="small muted" style="margin:.625rem 0">Mit der Handykamera scannen</p>
        <div class="copy-row"><code class="ellipsis">${url}</code><button class="btn btn-sm btn-icon" data-action="copy" aria-label="Link kopieren">${icon('copy', 'icon-sm')}</button></div>
      </aside>
    </div>`);

  const renderSteps = (k) => {
    setHtml(el.querySelector('#steps'), html`${steps[k].map((s) => html`<li><span>${s}</span></li>`)}`);
    el.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === k)));
  };
  renderSteps(p);

  loadScript(new URL('../../vendor/qrcode/qrcode.js', import.meta.url).href).then(() => {
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    el.querySelector('#qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'QR-Code zur App' });
  }).catch(() => { el.querySelector('#qr').textContent = 'QR-Code nicht verfügbar'; });

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-p]');
    if (t) renderSteps(t.dataset.p);
    if (e.target.closest('[data-action=copy]')) copyText(url);
    if (e.target.closest('[data-action=install]') && app.installPrompt) {
      app.installPrompt.prompt();
      const choice = await app.installPrompt.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') toast('Wird installiert …');
      app.installPrompt = null;
      el.querySelector('#native-box')?.setAttribute('hidden', '');
    }
  });
}

export { isGoogleConfigured };
