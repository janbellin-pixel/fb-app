# Leitfaden für KI-Assistenten und Entwickler

Mitglieder-App der Frankonia-Brunonia: eine PWA ohne Build-Schritt, die direkt gegen Google Workspace läuft. Ausführlich: [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md) (Aufbau, Abläufe, Aufgaben) und [docs/ENTSCHEIDUNGEN.md](docs/ENTSCHEIDUNGEN.md) (warum es so ist). Diese Datei ist die verbindliche Kurzfassung.

## Unverhandelbare Regeln

1. **Nur lesen.** Die App ändert **nie** gemeinsame Daten (Kalender der Verbindung, Adressverzeichnis, News, Bundesbote, Liedermappe, Galerie, Dateien anderer Mitglieder). Mitglieder ändern nur Eigenes: eigene Zu-/Absage im eigenen Kalender, eigene Dateien im eigenen Drive (Profil, Forumsbeiträge, Zusagen ohne Einladung, News der Redaktion, Einwilligung, Sichtbarkeit, Papierpost-Wahl, Push-Anmeldung, Chat-Hinweise für Push), eigene Chat-Nachrichten, neue Chat-Unterhaltungen nur mit Personen, Personen hinzufügen. Jede ändernde Anfrage läuft durch `js/google/guard.js`. Eine neue Schreibfunktion braucht eine **enge** Wächter-Regel und Tests (positiv + negativ) in `tests/google-mock.js`. Am Ende des Tests müssen **0 Verstöße** stehen.
2. **Keine neuen OAuth-Scopes** (`js/auth.js`) und keine Aufweichung der CSP (`index.html`) ohne dokumentierte Entscheidung.
3. **Identität = Dateieigentümer laut Google** (`owners[0]`), nie Angaben im Dateiinhalt.
4. **Profil ≠ Adressverzeichnis:** Selbst gepflegte Profile bleiben bewusst getrennt vom Adressverzeichnis, das der Schriftwart pflegt. Abweichungen werden per vorbereiteter E-Mail an `config.adressaenderung` gemeldet, nie direkt geschrieben (E7).
5. **Kein Build, keine Laufzeit-Abhängigkeiten.** Reines ES-Modul-JavaScript; Bibliotheken mit fester Version in `vendor/`.
6. **Beide Backends:** Jede Backend-Funktion gibt es in `js/backend/google-backend.js` **und** `js/backend/demo-backend.js` (gleiche Schnittstelle, Demo mit erfundenen Daten).
7. **Sicheres HTML:** nur über `html``…`` aus `js/html.js` (maskiert automatisch); kein `innerHTML` mit fremden Daten, kein `eval`.
8. **Oberfläche auf Deutsch, du-Form.** Barrierearm: Größen in `rem`, Raster mit `minmax(0, 1fr)`. Bei 375 px und Schriftstufe „Sehr groß“ sowie auf Tablets darf nichts seitlich überstehen.
9. **Datenschutz:** Werden Einwilligungstexte geändert, `datenschutz.fassung` erhöhen. Neue Datenarten in der Datenschutzerklärung (`js/lib/datenschutz.js`) nennen.
10. **Öffentlich nur das Nötigste:** `config.js` enthält nur, was vor der Anmeldung gebraucht wird (`PUBLIC_KEYS`). Alle weiteren Einstellungen gehören in die private Konfiguration (`config_private.json` in Drive, E43) – sie wird nur als JSON gelesen und geprüft (`RULES`), nie als Code ausgeführt. `config_private.json` nie ins Repository.

## Arbeitsablauf

1. `python tools/serve.py` starten, Demo unter http://localhost:8080 ansehen.
2. Ändern; neue Dateien → `python tools/update_sw.py`.
3. Prüfen:
   - http://localhost:8080/tests/google-mock.html – alles grün, 0 Verstöße
   - http://127.0.0.1:8080/tests/app-mock.html – App gegen den Google-Nachbau; `window.__fake.state.violations` leer
   - nach Änderungen an den Skripten: http://localhost:8080/tests/push-test.html (`Push.gs`) und http://localhost:8080/tests/ds-zeitung-test.html (`DsZeitung.gs`)
   - Layout in der Konsole: `const m = await import('/tests/layout-check.js'); await m.run({ levels: ['normal', 'sehr-gross'] })` bei Handy-, Querformat- und Tablet-Größen
4. **Dokumentation mitpflegen** (Pflicht bei jeder Änderung):
   - `docs/ENTWICKLUNG.md` – Aufbau, Schnittstellen, Datenformate, Aufgaben, offene Punkte
   - `docs/ENTSCHEIDUNGEN.md` – jede grundlegende Entscheidung als neuer Eintrag (Kontext, Entscheidung, Folgen); geänderte Entscheidungen als „ersetzt durch“ markieren
   - je nach Änderung `README.md`, `docs/EINRICHTUNG.md` (Admins), `docs/ARCHITEKTUR.md` (Technik), `docs/MITGLIEDER-ANLEITUNG.md` und `tools/make_anleitung.py` (Mitglieder)
5. Zeigt eine Änderung neue Bedienschritte, die Mitglieder-PDF neu erzeugen: `python tools/make_anleitung.py <URL>`.

## Wo finde ich was?

- Start, Datenschutz-Abfrage, Navigation: `js/app.js`, `js/router.js`
- Konfiguration: `config.js` (öffentlich), `js/config.js` (Standardwerte, Zusammenführen), private Konfiguration laden/prüfen/speichern: `js/lib/konfiguration.js`, Vorlage `config_private.beispiel.json` (E43)
- Seiten: `js/views/<bereich>.js`; Leseansicht für PDFs und Bilder (Bundesbote, Liedermappe): `js/views/reader.js` (Umblättern mit StPageFlip, in `vendor/` lokal korrigiert, E49)
- Google-Zugriffe: `js/google/*.js`; Schreibschutz: `js/google/guard.js`
- Benachrichtigungen (nur nach Einschalten, E34): `js/lib/hinweise.js`; Push-Mitteilungen (E50): `js/lib/push.js`, Service Worker `sw.js` (`push`), Absender `apps-script/Push.gs`, Test `tests/push-test.html`; Chat-Hinweise ohne Inhalt (E51): `chatHinweis()` in `js/backend/google-backend.js`, `chatSenden()` in `Push.gs`
- Papierpost (E44, Formular unter Einstellungen): `js/views/papierpost.js`, eingebettet in `js/views/mehr.js`; Darstellung hell/dunkel (E53): `js/lib/darstellung.js`, `js/boot.js`, Block `html[data-theme="dunkel"]` in `css/app.css`; Vorlesen (E54): `js/lib/vorlesen.js`, `js/views/reader.js` (Option `vorlesen`); DS-Zeitung automatisch von der Website (E55): `apps-script/DsZeitung.gs`, Test `tests/ds-zeitung-test.html`; Vorstände kontaktieren und Bierjunge (E45): `js/views/chat.js`, `js/views/mitglieder.js` (Hinweis bei abgelehntem Senden: `sendRefusal` in `js/views/parts.js`); Galerie mit Upload-Link und Ordneransicht (E46): `js/views/galerie.js`; Einladung in die App für Personen ohne Konto, von den Geburtstagen aus (E58): `js/lib/einladung.js` (Adresseintrag → Mitglied, E-Mail-Vorlage), `einladen()` in `js/views/mitglieder.js`, Schlüssel `zugangsdaten`
- Gruppen (Bereiche je Google-Gruppe ausblenden, E41; Kästchen in der Einrichtung, E52): `js/lib/gruppen.js`, Kennungsdateien in `js/lib/setup.js`; Sichtbarkeit (E40): `js/backend/google-backend.js`
- Datenmodelle: `js/backend/common.js` (dort auch Anhänge an News und Forum, E56: `ANHANG_*`, `anhangPruefen`; Feld und Liste in `js/views/parts.js`, Leseansicht `js/views/anhang.js`); Einwilligungen: `js/lib/datenschutz.js`, `js/lib/einwilligungsliste.js`; Adressabgleich: `js/lib/adressabgleich.js`
- Einrichtung (verbindet Vorhandenes, legt nur Fehlendes neu an, prüft Freigaben nur lesend): `js/lib/setup.js`, `js/views/einrichtung.js`
- Gestaltung: `css/app.css` (Tokens in `:root`, dunkle Darstellung unter `html[data-theme="dunkel"]` – neue Farbliterale brauchen dort einen Gegenpart; Navigation nur an einer Media-Query, siehe E17)
- Tests: `tests/`; Werkzeuge: `tools/`; optionale Skripte für Verantwortliche: `apps-script/`
