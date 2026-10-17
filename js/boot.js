// Läuft vor dem ersten Zeichnen: gewählte Schriftgröße sofort anwenden,
// damit die Seite beim Start nicht sichtbar „springt“.
(function () {
  try {
    var stufe = JSON.parse(localStorage.getItem('fb.schrift') || 'null');
    if (stufe && stufe !== 'normal') document.documentElement.setAttribute('data-schrift', stufe);
  } catch (e) {
    /* privater Modus: Standardgröße */
  }
})();
