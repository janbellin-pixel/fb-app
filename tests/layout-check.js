// Layout-Prüfung für verschiedene Bildschirmgrößen (nur für Tests).
// In der laufenden App (z. B. im Demo-Modus) in der Browser-Konsole aufrufen:
//   const m = await import('/tests/layout-check.js'); await m.run({ levels: ['normal', 'sehr-gross'] })
// Meldet: seitlich überstehende Inhalte, abgeschnittene obere Navigation, welche Navigation sichtbar ist
// und wie viele Spalten die Startseite nutzt.
// Umblättern (E49), in der Demo bei Handygröße: await m.flip()

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

// Öffnet eine Zeitung, blättert die feste Titelseite um und meldet, wenn eine Seite oder ein Schatten dabei
// senkrecht gegenüber der stehenden Seite versetzt ist (StPageFlip ohne die Korrektur aus E49: oben bündig).
// Das Fenster muss sichtbar sein – verdeckte Tabs halten die Animation an.
export async function flip({ issue = '#/ds-zeitung/ds2026-2' } = {}) {
  location.hash = issue;
  let next = null;
  for (let i = 0; i < 300 && !next; i++) {
    await wait(100);
    next = document.querySelector('.reader [data-action=next]:not([disabled])');
  }
  if (!next) return { probleme: ['Leser nicht geöffnet oder nur eine Seite'] };
  await wait(1500);
  const shown = (sel) => [...document.querySelectorAll(sel)].filter((e) => visible(e) && e.getBoundingClientRect().height > 0);
  const middle = (e) => { const b = e.getBoundingClientRect(); return b.top + b.height / 2; };
  const before = shown('.reader-book .flip-page');
  if (before.length !== 1) return { probleme: [`vor dem Umblättern ${before.length} Seiten sichtbar`] };
  const target = middle(before[0]);
  const problems = [];
  let seen = 0;
  next.click();
  for (let i = 1; i <= 10; i++) {
    await wait(60);
    const pages = shown('.reader-book .flip-page');
    if (pages.length > 1) seen++;
    for (const [what, list] of [['Seite', pages], ['Schatten', shown('.reader-book .stf__hardShadow, .reader-book .stf__hardInnerShadow')]]) {
      for (const e of list) {
        const d = Math.round(middle(e) - target);
        if (Math.abs(d) > 2) problems.push(`nach ${i * 60} ms: ${what} ${d} px senkrecht versetzt`);
      }
    }
  }
  await wait(1200);
  const after = shown('.reader-book .flip-page');
  if (after.length === 1 && Math.abs(middle(after[0]) - target) > 2) problems.push('nach dem Umblättern: Seite versetzt');
  if (!seen) problems.push('Umblättern nicht beobachtet (Fenster verdeckt?)');
  const list = problems.length > 8 ? [...problems.slice(0, 8), `… insgesamt ${problems.length}`] : problems;
  return { seite: document.querySelector('#count')?.textContent, probleme: list.length ? list : 'keine' };
}
