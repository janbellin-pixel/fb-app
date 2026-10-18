// Bildschirmtastatur auf Handy und Tablet (E36): Viele Browser verkleinern die Seite nicht, wenn die
// Tastatur aufgeht, sondern schieben sie nach oben (Android Chrome seit Version 108, iPhone immer).
// Hier wird deshalb der tatsächlich sichtbare Bereich gemessen (VisualViewport) und als CSS-Variablen
// --vvh (Höhe) und --vv-top (Versatz) bereitgestellt; solange ein Textfeld die Tastatur geöffnet hat,
// trägt <body> die Klasse „keyboard-open“. Der Chat füllt dann genau den sichtbaren Bereich, die
// Tab-Leiste blendet sich aus (css/app.css).

const FIELD_TYPES = /^(text|search|email|tel|url|number|password|date|time|datetime-local|month|week)$/i;

function isTextField(el) {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && FIELD_TYPES.test(el.type || 'text');
}

export function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const touch = matchMedia('(pointer: coarse)');
  let width = window.innerWidth;
  let full = vv.height; // sichtbare Höhe ohne Tastatur (bei dieser Breite)

  const update = () => {
    // gedreht oder Fenstergröße geändert: neu messen
    if (Math.abs(window.innerWidth - width) > 40) {
      width = window.innerWidth;
      full = vv.height;
    }
    const typing = isTextField(document.activeElement);
    if (!typing) full = Math.max(full, vv.height);
    // Adressleiste ein-/ausblenden ändert die Höhe nur wenig – die Tastatur nimmt deutlich mehr weg
    const open = touch.matches && typing && vv.height < full - 120;
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
    if (document.body.classList.contains('keyboard-open') !== open) document.body.classList.toggle('keyboard-open', open);
  };

  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  // nach dem Antippen bzw. Verlassen eines Feldes: die Tastatur braucht einen Moment
  document.addEventListener('focusin', () => { update(); setTimeout(update, 350); });
  document.addEventListener('focusout', () => setTimeout(update, 100));
  update();
}
