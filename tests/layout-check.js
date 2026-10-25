// Layout-Prüfung für verschiedene Bildschirmgrößen (nur für Tests).
// In der laufenden App (z. B. im Demo-Modus) in der Browser-Konsole aufrufen:
//   const m = await import('/tests/layout-check.js'); await m.run({ levels: ['normal', 'sehr-gross'] })
// Meldet: seitlich überstehende Inhalte, abgeschnittene obere Navigation, welche Navigation sichtbar ist
// und wie viele Spalten die Startseite nutzt.

const ROUTES = ['#/', '#/termine', '#/chat', '#/mitglieder', '#/mehr', '#/zeitung', '#/ds-zeitung', '#/lieder', '#/galerie', '#/news', '#/forum',
  '#/adressen', '#/profil', '#/einstellungen', '#/datenschutz', '#/datenschutz/uebersicht', '#/papierpost', '#/installieren',
  '#/mitglied/jonas.beispiel%40frankonia-brunonia.example'];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (el) => !!el && getComputedStyle(el).display !== 'none';

export async function run({ routes = ROUTES, levels = ['normal'], pause = 800 } = {}) {
  const vw = document.documentElement.clientWidth;
  const problems = [];
  let columns = '';
  for (const level of levels) {
    if (level === 'normal') document.documentElement.removeAttribute('data-schrift');
    else document.documentElement.setAttribute('data-schrift', level);
    for (const r of routes) {
      location.hash = r;
      await wait(pause);
      const sw = document.documentElement.scrollWidth;
      if (sw > vw + 1) problems.push(`${level} ${r}: Seite ${sw} px breit (Fenster ${vw})`);
      const bad = [...document.querySelectorAll('.view *, .topbar *, .tabbar *')].filter((e) => {
        if (e.closest('.chips, .topnav')) return false; // diese Leisten scrollen absichtlich seitwärts
        if (e.parentElement?.closest('.ellipsis')) return false; // absichtlich mit „…“ gekürzt (abgeschnitten, nicht übergelaufen)
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && (b.right > vw + 1 || b.left < -1);
      });
      if (bad.length) problems.push(`${level} ${r}: ${bad.length} Element(e) außerhalb, z. B. ${bad.slice(0, 2).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`).join(', ')}`);
      const tn = document.querySelector('.topnav');
      if (visible(tn) && tn.scrollWidth > tn.clientWidth + 1) problems.push(`${level} ${r}: obere Navigation abgeschnitten (${tn.scrollWidth} statt ${tn.clientWidth} px)`);
      if (r === '#/' && level === levels[0]) {
        const grid = document.querySelector('.view .grid-2-1');
        columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
      }
    }
  }
  document.documentElement.removeAttribute('data-schrift');
  return {
    fenster: `${innerWidth}×${innerHeight}`,
    navigation: visible(document.querySelector('.tabbar')) ? 'unten (Tab-Leiste)' : visible(document.querySelector('.topnav')) ? 'oben (Textleiste)' : '–',
    startseiteSpalten: columns,
    probleme: problems.length ? problems : 'keine',
  };
}
