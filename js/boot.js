// Läuft vor dem ersten Zeichnen: gewählte Schriftgröße und Darstellung (hell/dunkel) sofort
// anwenden, damit die Seite beim Start nicht sichtbar „springt“ oder aufblitzt.
(function () {
  try {
    var stufe = JSON.parse(localStorage.getItem('fb.schrift') || 'null');
    if (stufe && stufe !== 'normal') document.documentElement.setAttribute('data-schrift', stufe);
  } catch (e) {
    /* privater Modus: Standardgröße */
  }
  try {
    // 'hell' | 'dunkel' | sonst wie das System (js/lib/darstellung.js, E53)
    var wahl = JSON.parse(localStorage.getItem('fb.darstellung') || 'null');
    var dunkel = wahl === 'dunkel' || (wahl !== 'hell' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    if (dunkel) {
      document.documentElement.setAttribute('data-theme', 'dunkel');
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#141414');
    }
  } catch (e) {
    /* Standard: hell */
  }
})();
