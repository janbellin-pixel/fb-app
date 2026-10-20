# Leitfaden für KI-Assistenten und Entwickler

Mitglieder-App der Frankonia-Brunonia: eine PWA ohne Build-Schritt, die direkt gegen Google Workspace läuft. Ausführlich: [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md) (Aufbau, Abläufe, Aufgaben) und [docs/ENTSCHEIDUNGEN.md](docs/ENTSCHEIDUNGEN.md) (warum es so ist). Diese Datei ist die verbindliche Kurzfassung.

## Unverhandelbare Regeln

1. **Nur lesen.** Die App ändert **nie** gemeinsame Daten (Kalender der Verbindung, Adressverzeichnis, News, Bundesbote, Liedermappe, Galerie, Dateien anderer Mitglieder). Mitglieder ändern nur Eigenes: eigene Zu-/Absage im eigenen Kalender, eigene Dateien im eigenen Drive (Profil, Forumsbeiträge, Zusagen ohne Einladung, News der Redaktion, Einwilligung, Sichtbarkeit), eigene Chat-Nachrichten, neue Chat-Unterhaltungen nur mit Personen, Personen hinzufügen. Jede ändernde Anfrage läuft durch `js/google/guard.js`. Eine neue Schreibfunktion braucht eine **enge** Wächter-Regel und Tests (positiv + negativ) in `tests/google-mock.js`. Am Ende des Tests müssen **0 Verstöße** stehen.
2. **Keine neuen OAuth-Scopes** (`js/auth.js`) und keine Aufweichung der CSP (`index.html`) ohne dokumentierte Entscheidung.
3. **Identität = Dateieigentümer laut Google** (`owners[0]`), nie Angaben im Dateiinhalt.
4. **Profil ≠ Adressverzeichnis:** Selbst gepflegte Profile bleiben bewusst getrennt vom Adressverzeichnis, das der Schriftwart pflegt. Abweichungen werden per vorbereiteter E-Mail an `config.adressaenderung` gemeldet, nie direkt geschrieben (E7).
5. **Kein Build, keine Laufzeit-Abhängigkeiten.** Reines ES-Modul-JavaScript; Bibliotheken mit fester Version in `vendor/`.
6. **Beide Backends:** Jede Backend-Funktion gibt es in `js/backend/google-backend.js` **und** `js/backend/demo-backend.js` (gleiche Schnittstelle, Demo mit erfundenen Daten).
7. **Sicheres HTML:** nur über `html``…`` aus `js/html.js` (maskiert automatisch); kein `innerHTML` mit fremden Daten, kein `eval`.
8. **Oberfläche auf Deutsch, du-Form.** Barrierearm: Größen in `rem`, Raster mit `minmax(0, 1fr)`. Bei 375 px und Schriftstufe „Sehr groß“ sowie auf Tablets darf nichts seitlich überstehen.
9. **Datenschutz:** Werden Einwilligungstexte geändert, `datenschutz.fassung` erhöhen. Neue Datenarten in der Datenschutzerklärung (`js/lib/datenschutz.js`) nennen.

## Arbeitsablauf

1. `python tools/serve.py` starten, Demo unter http://localhost:8080 ansehen.
2. Ändern; neue Dateien → `python tools/update_sw.py`.
3. Prüfen:
   - http://localhost:8080/tests/google-mock.html – alles grün, 0 Verstöße
   - http://127.0.0.1:8080/tests/app-mock.html – App gegen den Google-Nachbau; `window.__fake.state.violations` leer
   - Layout in der Konsole: `const m = await import('/tests/layout-check.js'); await m.run({ levels: ['normal', 'sehr-gross'] })` bei Handy-, Querformat- und Tablet-Größen
4. **Dokumentation mitpflegen** (Pflicht bei jeder Änderung):
   - `docs/ENTWICKLUNG.md` – Aufbau, Schnittstellen, Datenformate, Aufgaben, offene Punkte
   - `docs/ENTSCHEIDUNGEN.md` – jede grundlegende Entscheidung als neuer Eintrag (Kontext, Entscheidung, Folgen); geänderte Entscheidungen als „ersetzt durch“ markieren
   - je nach Änderung `README.md`, `docs/EINRICHTUNG.md` (Admins), `docs/ARCHITEKTUR.md` (Technik), `docs/MITGLIEDER-ANLEITUNG.md` und `tools/make_anleitung.py` (Mitglieder)
5. Zeigt eine Änderung neue Bedienschritte, die Mitglieder-PDF neu erzeugen: `python tools/make_anleitung.py <URL>`.

## Wo finde ich was?

- Start, Datenschutz-Abfrage, Navigation: `js/app.js`, `js/router.js`
- Seiten: `js/views/<bereich>.js`; Leseansicht für PDFs und Bilder (Bundesbote, Liedermappe): `js/views/reader.js`
- Google-Zugriffe: `js/google/*.js`; Schreibschutz: `js/google/guard.js`
- Benachrichtigungen (nur nach Einschalten, E34): `js/lib/hinweise.js`
- Datenmodelle: `js/backend/common.js`; Einwilligungen: `js/lib/datenschutz.js`, `js/lib/einwilligungsliste.js`; Adressabgleich: `js/lib/adressabgleich.js`
- Einrichtung (verbindet Vorhandenes, legt nur Fehlendes neu an, prüft Freigaben nur lesend): `js/lib/setup.js`, `js/views/einrichtung.js`
- Gestaltung: `css/app.css` (Tokens in `:root`, Navigation nur an einer Media-Query, siehe E17)
- Tests: `tests/`; Werkzeuge: `tools/`; optionale Skripte für Verantwortliche: `apps-script/`
