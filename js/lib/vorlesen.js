// Vorlesen (E54): den Text einer PDF-Seite mit der Sprachausgabe des Geräts vorlesen (Web Speech API) –
// Bundesbote und DS-Zeitung. Nichts geht ins Netz: Die Stimme kommt vom Betriebssystem bzw. Browser.
// Gelesen wird Stück für Stück (Sätze, höchstens ~200 Zeichen), weil Chrome lange Äußerungen abbricht;
// „Pause“ bricht das laufende Stück ab und „Weiter“ beginnt es von vorn – das geht auf allen Geräten gleich.

export const vorlesenMoeglich = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

const KLEIN = /^[a-zäöüß]/;

/**
 * Text einer Leseseite aus den Textstücken von pdf.js (page.getTextContent().items).
 * part 'L'/'R': nur die linke bzw. rechte Hälfte einer Doppelseite (die Mitte des Stücks entscheidet; width = Seitenbreite).
 * Zeilen werden zusammengefügt, Trennstriche am Zeilenende entfernt („Bundes-“ + „brüder“ → „Bundesbrüder“).
 */
export function seitenText(items, { part = 'F', width = 0 } = {}) {
  const zeilen = [];
  let zeile = '';
  for (const it of items || []) {
    if (part !== 'F' && width) {
      const x = (Number(it.transform?.[4]) || 0) + (Number(it.width) || 0) / 2;
      if (part === 'L' ? x >= width / 2 : x < width / 2) continue;
    }
    zeile += String(it.str || '');
    if (it.hasEOL) {
      zeilen.push(zeile);
      zeile = '';
    }
  }
  if (zeile) zeilen.push(zeile);
  let out = '';
  for (const z of zeilen) {
    const t = z.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (/[a-zäöüß]-$/i.test(out) && KLEIN.test(t)) out = out.slice(0, -1) + t;
    else out += (out ? ' ' : '') + t;
  }
  return out.replace(/\s+([,.;:!?])/g, '$1').trim();
}

/** Text in sprechbare Stücke teilen: ganze Sätze, zusammen höchstens `max` Zeichen; überlange Sätze an Kommas oder Leerzeichen */
export function stuecke(text, max = 200) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const saetze = t.match(/[^.!?…]*[.!?…]+["“”»«')\]]*\s*|[^.!?…]+$/g) || [t];
  const out = [];
  let akt = '';
  const teilen = (s) => {
    const teile = [];
    let rest = s.trim();
    while (rest.length > max) {
      let cut = rest.lastIndexOf(', ', max - 1);
      if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
      if (cut < max * 0.4) cut = max;
      teile.push(rest.slice(0, cut + (rest[cut] === ',' ? 1 : 0)).trim());
      rest = rest.slice(cut).replace(/^[,\s]+/, '');
    }
    if (rest) teile.push(rest);
    return teile;
  };
  for (const s of saetze) {
    const satz = s.trim();
    if (!satz) continue;
    if (satz.length > max) {
      if (akt) { out.push(akt); akt = ''; }
      out.push(...teilen(satz));
      continue;
    }
    if (akt && akt.length + 1 + satz.length > max) { out.push(akt); akt = satz; } else akt = akt ? `${akt} ${satz}` : satz;
  }
  if (akt) out.push(akt);
  return out;
}

let gewaehlt = null;
/** Deutsche Stimme des Geräts (am liebsten de-DE und lokal); null = Browser wählt selbst anhand von lang */
export function stimme() {
  if (gewaehlt) return gewaehlt;
  let voices = [];
  try { voices = window.speechSynthesis.getVoices() || []; } catch { return null; }
  const de = voices.filter((v) => /^de([-_]|$)/i.test(String(v.lang || '')));
  const punkte = (v) => (/^de[-_]DE/i.test(v.lang) ? 4 : 0) + (v.localService ? 2 : 0) + (v.default ? 1 : 0)
    + (/natural|premium|enhanced|neural|google|microsoft|anna|petra|helena|katja/i.test(v.name) ? 1 : 0);
  de.sort((a, b) => punkte(b) - punkte(a));
  gewaehlt = de[0] || null;
  return gewaehlt;
}
try { window.speechSynthesis?.addEventListener?.('voiceschanged', () => { gewaehlt = null; }); } catch { /* kein Browser */ }

/**
 * Vorleser: start(text) liest die Stücke nacheinander, onEnde() nach dem letzten; stop(), pause(), weiter().
 * freischalten() im Klick aufrufen – iPhone und iPad erlauben die Sprachausgabe nur nach einer Berührung.
 */
export function vorleser({ onEnde, onFehler, rate = 1 } = {}) {
  let teile = [];
  let i = 0;
  let laeuft = false;
  let pausiert = false;
  let aktuell = null;
  const synth = () => window.speechSynthesis;

  function sprich() {
    if (!laeuft || pausiert) return;
    if (i >= teile.length) {
      laeuft = false;
      aktuell = null;
      onEnde?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(teile[i]);
    u.lang = 'de-DE';
    const v = stimme();
    if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => { if (aktuell !== u) return; i++; sprich(); };
    u.onerror = (e) => {
      if (aktuell !== u || e?.error === 'interrupted' || e?.error === 'canceled') return;
      laeuft = false;
      aktuell = null;
      onFehler?.(e);
    };
    aktuell = u;
    synth().speak(u);
  }

  return {
    freischalten() {
      try { synth().cancel(); synth().speak(new SpeechSynthesisUtterance('')); } catch { /* egal */ }
    },
    start(text) {
      this.stop();
      teile = stuecke(text);
      i = 0;
      laeuft = teile.length > 0;
      pausiert = false;
      sprich();
      return laeuft;
    },
    stop() {
      laeuft = false;
      pausiert = false;
      aktuell = null;
      teile = [];
      i = 0;
      try { synth().cancel(); } catch { /* egal */ }
    },
    pause() {
      if (!laeuft || pausiert) return;
      pausiert = true;
      aktuell = null; // das laufende Stück wird beim Weiterlesen wiederholt
      try { synth().cancel(); } catch { /* egal */ }
    },
    weiter() {
      if (!laeuft || !pausiert) return;
      pausiert = false;
      sprich();
    },
    get laeuft() { return laeuft; },
    get pausiert() { return pausiert; },
    /** Stand für Tests: welches Stück von wie vielen */
    get stand() { return { i, n: teile.length }; },
  };
}
