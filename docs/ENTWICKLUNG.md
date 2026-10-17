# Entwicklung der Mitglieder-App

Leitfaden für alle, die die App weiterentwickeln – Menschen wie KI-Assistenten. Er erklärt Aufbau, Abläufe, Regeln und typische Aufgaben. **Warum** etwas so gebaut ist, steht in [ENTSCHEIDUNGEN.md](ENTSCHEIDUNGEN.md). Die Kurzfassung der Regeln für KI-Assistenten steht in [`AGENTS.md`](../AGENTS.md).

> **Pflege:** Diese Datei, ENTSCHEIDUNGEN.md und AGENTS.md werden **mit jeder Änderung** aktualisiert: neue Dateien, neue Funktionen, neue Konfiguration, neue Entscheidungen, behobene oder neue offene Punkte. Stand: 2026-10-17.

---

## 1. Was die App ist

Eine **Progressive Web App** für die Mitglieder der Frankonia-Brunonia. Sie bietet Termine mit Zu- und Absage, Mitglieder mit Profilen, Chat, Adressverzeichnis, Verbindungszeitung, Fotogalerie, News und Forum, dazu Datenschutz mit Einwilligungen. Sie läuft ohne eigenen Server direkt gegen **Google Workspace**; jedes Mitglied meldet sich mit seinem Google-Konto an.

Drei Grundsätze bestimmen alles:

1. **Nur lesen:** Gemeinsame Daten werden nie geändert. Jedes Mitglied ändert nur Eigenes (E5).
2. **Eigenes im eigenen Drive**, Identität = Dateieigentümer (E6).
3. **Einfach wartbar:** kein Build, keine Abhängigkeiten, deutschsprachige Oberfläche, barrierearm (E2, E16).

## 2. Schnellstart für Entwickler

```bash
python tools/serve.py            # lokaler Server auf http://localhost:8080 (ohne Zwischenspeicher)
```

- **Demo:** http://localhost:8080 → „Demo mit Beispieldaten ansehen“.
- **Backend-Test:** http://localhost:8080/tests/google-mock.html. Muss „… Prüfungen bestanden“ ohne Fehler zeigen. Der letzte Punkt verlangt 0 unerlaubte Schreibzugriffe.
- **App gegen den Google-Nachbau:** http://127.0.0.1:8080/tests/app-mock.html. Bewusst `127.0.0.1` statt `localhost`, damit der lokale Speicher getrennt bleibt. Links in dieser Seite per `location.hash` setzen; `<base href>` lenkt Klicks sonst auf die echte App um.
- **Layout-Prüfung** in der laufenden App, in der Browser-Konsole:
  ```js
  const m = await import('/tests/layout-check.js'); await m.run({ levels: ['normal', 'sehr-gross'] })
  ```
  Meldet seitlich überstehende Inhalte, eine abgeschnittene obere Navigation und die Spaltenzahl. Typische Größen: 375×812 und 430×932 (Handy), 932×430 (Handy quer), 744×1133 und 820×1180 (iPad hochkant), 1024×768 und 1180×820 (iPad quer), 800×1280 (Android-Tablet), 1366×1024 (iPad Pro bzw. PC).
- **Service Worker:** Nach dem Hinzufügen oder Entfernen von Dateien `python tools/update_sw.py` ausführen.

## 3. Projektstruktur

| Pfad | Aufgabe |
|---|---|
| `index.html` | App-Hülle; CSP (nur eigene Skripte, kein `eval`); lädt `js/boot.js`, `css/app.css`, `config.js`, `js/app.js` |
| `config.js` | Einstellungen der Verbindung (wird über die Einrichtung erzeugt und im Repository ersetzt) |
| `manifest.webmanifest`, `sw.js` | PWA-Manifest (Ausrichtung `any`) und Service Worker (Netz zuerst, Liste aus `tools/update_sw.py`) |
| `css/app.css` | gesamte Gestaltung, Design-Tokens in `:root`, alles in `rem` |
| `js/boot.js` | setzt die Schriftgröße vor dem ersten Bild |
| `js/app.js` | Start, Modus (Demo/Google), Datenschutz-Abfrage, Oberfläche, Offline, Updates |
| `js/router.js` | Hash-Router, Routenliste (`ROUTES`), öffentliche Routen, `beforeRoute` |
| `js/auth.js` | OAuth (Weiterleitung, stille Erneuerung, Scopes `SCOPES`) |
| `js/config.js` | Standardwerte (`DEFAULTS`), Zusammenführen mit `config.js` und lokalen Einrichtungswerten, `configFileContent` |
| `js/html.js` | sicheres Templating `html```, `raw()`, `setHtml()` |
| `js/ui.js` | Bausteine (hero, avatar, notice, toast, Dialoge, Fehlertexte) |
| `js/icons.js` | Liniensymbole |
| `js/google/client.js` | `api()` mit Wiederholungen, Fehlern und **Schreibschutz-Prüfung** vor jedem Senden |
| `js/google/guard.js` | **Schreibschutz** – Regeln, was gesendet werden darf |
| `js/google/{calendar,drive,sheets,people,chat}.js` | dünne Hüllen um die APIs |
| `js/backend/google-backend.js` | Echtbetrieb: alle Funktionen auf Google abgebildet |
| `js/backend/demo-backend.js`, `demo-data.js` | Demo mit erfundenen Daten, gleiche Schnittstelle |
| `js/backend/common.js` | gemeinsame Datenmodelle: Profilfelder, News, Adressen, Forum, Kategorien, Hilfen |
| `js/lib/*.js` | Datum, Text/Markdown, Speicher/Cache, Export (ICS/vCard), Schriftgröße, Einrichtung (`setup.js`), Datenschutz (`datenschutz.js`, `einwilligungsliste.js`), Adressabgleich (`adressabgleich.js`) |
| `js/views/*.js` | Seiten (eine Datei je Bereich) |
| `vendor/` | PDF.js, StPageFlip, qrcode-generator (mit Lizenzen) |
| `assets/` | Wappen, Skyline, Icons, Schriften, Demo-Zeitungen und -Fotos |
| `apps-script/` | optionale Skripte für Verantwortliche: `Automatik.gs` (Kalender), `Einwilligungen.gs` (Sammeltabelle) |
| `tests/` | `fake-google.js` (API-Nachbau), `google-mock.*` (Backend-Test), `app-mock.html`, `layout-check.js` |
| `tools/` | Python-Hilfen: Server, Grafiken, Demo-PDFs und -Fotos, Mitglieder-Anleitung (PDF + QR), Service-Worker-Liste |
| `docs/` | Doku für Admins (EINRICHTUNG), Mitglieder (MITGLIEDER-ANLEITUNG + PDF), Technik (ARCHITEKTUR), Entwicklung (diese Datei, ENTSCHEIDUNGEN) |
| `.github/workflows/pages.yml` | Veröffentlichung auf GitHub Pages |

## 4. Ablauf zur Laufzeit

1. `index.html` lädt `boot.js` (Schriftgröße), CSS, `config.js` und `app.js`.
2. `app.js → boot()`: Service Worker registrieren und OAuth-Rückkehr auswerten (`auth.handleRedirect()`). Dann den Modus wählen: Demo (`fb.mode = demo`), Google (gültiger Zugangsschlüssel) oder stille Erneuerung.
3. `enterGoogle()` erzeugt `new GoogleBackend(user)`, `enterDemo()` erzeugt `new DemoBackend()`. Danach ist `app.backend` gesetzt.
4. `initConsent()` prüft die Datenschutz-Entscheidung, erst auf dem Gerät, dann bei Google. Fehlt sie, setzt die Funktion `app.consentPending = true`.
5. `renderShell()` zeichnet Kopfzeile, Tab-Leiste und Fuß. `startRouter(app)` zeigt die Seite zur aktuellen Hash-Route.
6. Bei jedem Seitenwechsel läuft `app.beforeRoute(match)`: Ist eine Datenschutz-Entscheidung offen, geht es zu `#/datenschutz?erstmals=1&weiter=…`. Läuft der Schlüssel bald ab, wird er still erneuert.
7. Eine Seite ist ein ES-Modul in `js/views/`: `export default async function (ctx)` bzw. benannte Exporte. `ctx = { el, params, query, route, app, alive }`. `alive()` meldet, ob die Seite noch angezeigt wird (nach `await` prüfen!). Optional wird eine Aufräumfunktion zurückgegeben.
8. Daten lädt eine Seite über `app.load(key, fetcher, onData, { maxAge })`: zuerst der zwischengespeicherte Stand (IndexedDB), dann frisch. `onData` kann deshalb zweimal kommen. Offline bleibt der letzte Stand sichtbar (`err.usedCache`).
9. Für Verantwortliche gleicht `autoSyncConsents()` vier Sekunden nach dem Start die Einwilligungsliste ab (höchstens alle 15 Minuten).

### Routen (`js/router.js`)

`''` Start · `termine` · `termin/:id` · `mitglieder` · `mitglied/:email` · `profil` · `chat` · `chat/:space` · `adressen` · `zeitung` · `zeitung/:id` · `galerie` · `galerie/:album` · `news` · `news/:id` · `forum` · `forum-neu` · `forum/:id` · `mehr` · `einstellungen` · `datenschutz` (öffentlich) · `datenschutz/uebersicht` · `installieren` (öffentlich) · `einrichtung` (öffentlich)

Öffentliche Routen funktionieren ohne Anmeldung, alle anderen zeigen sonst die Anmeldeseite.

## 5. Backend-Schnittstelle

`GoogleBackend` und `DemoBackend` haben dieselben öffentlichen Methoden. **Neue Funktionen immer in beiden umsetzen** und im Demo-Modus sinnvoll vorführen.

| Bereich | Methoden |
|---|---|
| Allgemein | `me`, `isAdmin()`, `kind` (`google`/`demo`), `isWorkspace` |
| Mitglieder | `listMembers()`, `getMember(email)`, `saveMyProfile(fields)` |
| Termine | `listEvents({from, to})` → `{events, canEdit:false}`, `getEvent(id)`, `rsvp(id, {status, guests, comment})`, `calendarInfo()`, `canEditEvents()` (immer false) |
| News | `listNews()`, `canEditNews()` (false), `newsSheetUrl()`, `imageUrl(ref)` |
| Forum | `forumEnabled()`, `listForum()` → `{threads, posts}` mit `own`, `createThread()`, `reply()`, `editPost()`, `deletePost()`, `deleteThread()` – nur Eigenes |
| Adressen | `listAddresses()` → `{items, hasBirthdays, sheetUrl, …}` |
| Zeitung | `listIssues()`, `loadIssue(issue)`, `issueOpenUrl(issue)` |
| Galerie | `listGallery()` → `{albums, folderUrl}`, `photoUrl(photo, size)`, `photoFullUrl(photo)` |
| Chat | `chatStatus()`, `listSpaces()`, `listMessages(space)`, `sendMessage(space, text)`, `findDirectChat(email)`, `chatOpenUrl()` |
| Datenschutz | `getMyConsent()`, `saveMyConsent({vereinszwecke, dachverband, zeitpunkt?})`, `isConsentManager()`, `listConsents()`, `consentTable()`, `createConsentTable()`, `syncConsentTable()`, `autoSyncConsents()` |

Nur Google (intern): `cached(key, ttl, fn)` und `invalidate(key)` (Speicher-Cache; Schlüssel mit ID, z. B. `addressKey()`, damit ein neu verbundenes Verzeichnis nie aus dem alten Zwischenspeicher kommt), `folderScope(id)` (geteilte Ablage gezielt durchsuchen), `appFolder()`, `listAppFiles(typ)`, `createOwnFile()`, `shareOwnFile()`, `ownerOf(file)`, `ensureConsentSharing()`. `app.clearCache()` leert auch diesen Speicher-Cache. Nur Demo: `reset()`, `setDemoPhoto(file)`.

## 6. Datenformate in Google

**Eigene Dateien** (Ordner „Frankonia-Brunonia App – meine Beiträge und Profil“, `appProperties.fbTyp = ordner`, nicht freigegeben):

| Typ | `appProperties` | Beschreibung (JSON) | Freigabe |
|---|---|---|---|
| Profil | `fbTyp=profil` | Felder aus `PROFILE_FIELDS`: `kneipname, status, rezeption, studium, taetigkeit, wohnort, aemter, ueberMich, angebot, telefon, instagram, linkedin` | Gruppe/Domain/Testkonten: Leser |
| Forum | `fbTyp=forum`, `fbRolle=thema\|antwort`, `fbThema=<Datei-ID>`, `fbKategorie` | `{ titel, text, bearbeitet }` | Gruppe/Domain/Testkonten: Leser |
| Einwilligung | `fbTyp=einwilligung`, `fbVz`, `fbDv` (`Ja`/`Nein`), `fbFassung`, `fbEmpf` (Prüfsumme der Empfänger); öffentlich `properties.fbTyp=einwilligung` | `{ typ, version, konto, name, zeitpunkt, fassung, pruefsumme, vereinszwecke, dachverband, geraet, stand, erstmals, verlauf:[…max. 10] }`, zusätzlich als lesbarer Dateiinhalt | nur einzelne Verantwortliche: Leser |

**Gemeinsame Daten** (nur lesen): Kalender (`extendedProperties.shared.fbKategorie/fbKleidung/fbPflicht` oder Zeilen in der Beschreibung), Tabelle „News“ (Spalten aus `NEWS_SCHEMA`), Tabelle „Adressverzeichnis“ (Spalten frei; Erkennung über `ADDRESS_FIELDS` in `common.js`; Kopfzeile in den ersten zehn Zeilen; Blatt aus `adressenBlatt`, sonst „Adressen“, sonst das erste), Ordner „Verbindungszeitung“ (`JJJJ-N Titel.pdf`, auch in Jahresordnern bis zwei Ebenen tief), Ordner „Galerie“ (Unterordner `JJJJ-MM Name` = Alben, auch in Jahresordnern bis zwei Ebenen tief). Unterordner liest `drive.listTree()` je Ebene gebündelt (bis 25 Ordner pro Abfrage), in geteilten Ablagen mit `corpora=drive&driveId` (E25).

**Einwilligungsliste** (`appProperties.fbTyp = einwilligungen-tabelle`, im Drive der Verantwortlichen): Blätter „Stand“, „Verlauf“ (Schlüssel: Datei-ID + Zeitstempel UTC, nur anhängen) und „Fassungen“; Aufbau in `js/lib/einwilligungsliste.js`, Gegenstück in `apps-script/Einwilligungen.gs`.

**Auf dem Gerät** (`localStorage`): `fb.token`, `fb.user`, `fb.mode`, `fb.oauthState`, `fb.silentTry`, `fb.configOverride` (Einrichtung), `fb.schrift`, `fb.demo.v1`, `fb.einwilligung.<email>`, `fb.einwilligungSync.<email>`, Entwürfe (`fb.forumDraft.*`, `fb.forumNewDraft`, `fb.chatDraft.*`) und Ansichtszustände (`fb.memberSearch`, `fb.termineView`, `fb.forumSeen`, `fb.installDismissed`). Daneben IndexedDB `fb-app` (Datencache) und Cache-Speicher `fb-zeitung` (PDFs).

## 7. Schreibschutz – wie er funktioniert und wie man ihn erweitert

`js/google/client.js` ruft vor **jedem** `fetch` `assertWriteAllowed(method, url, body)` auf (`js/google/guard.js`). `GET`/`HEAD` sind frei; alles andere muss einer Regel entsprechen:

- **Kalender:** nur `PATCH calendars/primary/events/{id}` mit genau `{attendees}` (eigene Antwort). Während der Einrichtung: neuen Kalender anlegen und befüllen.
- **Drive:** Datei anlegen (`POST files`), aber nur in eigenen bzw. gerade angelegten Ordnern (`assertParentsAllowed`). Ändern/Papierkorb (`PATCH`), Freigabe setzen (`POST …/permissions`) und Freigabe entfernen (`DELETE …/permissions/{id}`) nur bei **eigenen** Dateien (`registerOwnFile`, nur nach `ownedByMe` von Google). `addParents`/`removeParents` sind immer gesperrt.
- **Tabellen:** nur während der Einrichtung (gerade angelegte Tabellen) und für die eigene, von der App angelegte Einwilligungsliste (`registerOwnTable`, nur nach Prüfung `ownedByMe` + `fbTyp`).
- **Chat:** eigene Nachrichten senden, ändern, löschen.

**Eine neue Schreibfunktion einbauen:**
1. Prüfen, ob sie wirklich nur **eigene** Daten betrifft. Sonst ist sie nicht erlaubt (E5); stattdessen Pflege direkt bei Google bzw. per Apps-Script im Konto eines Verantwortlichen.
2. Die engste mögliche Regel in `guard.js` ergänzen, mit Kommentar.
3. In `tests/fake-google.js` das Verhalten nachbilden (fremde Dateien → 403 und `violations`).
4. In `tests/google-mock.js` positive **und** negative Tests ergänzen (`blocked(...)`). Der Test muss weiter mit 0 Verstößen enden.
5. ENTSCHEIDUNGEN.md, ARCHITEKTUR.md (Abschnitt Schreibschutz) und EINRICHTUNG.md aktualisieren.

**OAuth-Scopes** (`js/auth.js → SCOPES`) nie ohne neue Entscheidung erweitern; jeder zusätzliche Scope vergrößert, was ein manipulierter Code tun könnte.

## 8. Gestaltung und Barrierefreiheit

- **Design-Tokens** in `:root` (`--bg`, `--ink`, `--green`, `--line` …). Stil der Website: hellgrau, schwarze Titelkästen, Raleway, Grün aus dem Wappen; Wappen klein oben, Skyline unten.
- **Nur `rem`** für Größen (Schriftstufen in `html[data-schrift]`). Ausnahmen in `px` nur dort, wo bewusst nicht mitskaliert wird (Kopfzeilenhöhe, Wappen oben, Avatar oben).
- **Raster** mit `minmax(0, 1fr)`; lange Wörter mit `hyphens: auto`, in engen Spalten zusätzlich `overflow-wrap: anywhere` (z. B. „Verbindungszeitung“).
- **Breakpoints:** 480/520/560 (kleine Handys), 600 (Dialoge mittig), 640, 700 (Abstände, Formulare zweispaltig, Tab-Leiste mittig), **768** (zweispaltige Seiten), 900 (größere Skyline), 1000/1100. Die **Navigation** hängt nur an `(min-width: 1280px) and (hover: hover) and (pointer: fine)` (E17). Bei `(orientation: landscape) and (max-height: 500px)` ist die Ansicht kompakt.
- **Safe Areas:** `--safe-t/-b/-l/-r` und `--pad-l/-r` (Rand + Aussparung) für alles, was bis an den Rand reicht.
- **Hover-Effekte** mit Bewegung nur in `@media (hover: hover)`.
- **ARIA:** `aria-pressed` und ähnliche Attribute mit Wahrheitswerten schreibt `html``…`` automatisch als "true"/"false".
- **Prüfen:** 375 px und „Sehr groß“ sowie die Tablet-Größen aus Abschnitt 2 mit `tests/layout-check.js`.

## 9. Sicherheit im Code

- HTML nur über `html``…`` (maskiert alles). `raw()` nur für eigene, feste Inhalte. Formatierung in Beiträgen nur über `markdown()` (kleine, sichere Teilmenge).
- Kein `eval`/`new Function`; die CSP verbietet es ohnehin.
- Keine Geheimnisse im Code. Die OAuth-Client-ID ist öffentlich.
- Personenbezogene Daten nie in URLs (außer `mailto:` an das Adressänderungs-Postfach, das das Mitglied selbst abschickt).

## 10. Konfiguration

Alle Schlüssel mit Standardwert stehen in `js/config.js → DEFAULTS`, kommentiert in `config.js`. Reihenfolge: `DEFAULTS` ← `config.js` (veröffentlicht) ← lokale Einrichtungswerte (`fb.configOverride`, nur in diesem Browser). Die Einrichtung erzeugt mit `configFileContent()` eine neue `config.js`; **neue Schlüssel in die `keep`-Liste aufnehmen**, sonst landen sie nicht in der heruntergeladenen Datei.

Wichtige Schlüssel: `googleClientId`, `workspaceDomain`, `mitgliederGruppe`, `admins`, `appUrl`, `kalenderId`, `tabellen.{adressen,news,einwilligungen}`, `adressenBlatt`, `zeitungOrdnerId`, `galerieOrdnerId`, `chat.aktiv`, `forum.aktiv`, `profilBearbeiten`, `adressaenderung`, `datenschutz.{verein,anschrift,email,dachverband,dachverbandKurz,fassung,stand,empfaenger}`, `demoErlaubt`, `testMitglieder`, `ausgeblendeteKonten`, Listen für Status, Kategorien und Kleiderordnung.

**Einrichtung** (`js/lib/setup.js`, `views/einrichtung.js`, E23/E24): `RESOURCES` listet die sechs Datenquellen, `missingResources()` die noch nicht eingetragenen. „1. Vorhandenes verbinden“ speichert nur IDs (`idFromUrl` versteht Tabellen-, Ordner- und Datei-Links sowie Kalender-Links mit Base64-`cid`, `src=` und iCal). „2. Fehlendes neu anlegen“ ruft `createMissing({ only })` auf: legt nur das Fehlende neu an (Ordner „… – Mitglieder-App“ nur, wenn Tabellen oder Ordner fehlen; Einwilligungsliste außerhalb), gibt nur Neues frei, Beispieldaten nur in Neues. `createEverything()` = alles neu (für Tests von Grund auf). `checkSetup()` liest nur und liefert je Datenquelle `{label, ok, detail, lines, warn}`; Freigaben bewerten `judgeSharing()` (Drive) und `judgeCalendarAcl()` (Kalender, nur mit vorhandener Berechtigung „Kalender verwalten“).

## 11. Tests

- **`tests/google-mock.js`** (Backend, derzeit 167 Prüfungen): Einrichtung, Schreibschutz (gezielte Angriffsversuche), Mitglieder/Profile inkl. Fälschungsversuch, Profilfelder, Termine/Zusagen, News, Forum, Adressen, Abgleich mit dem Adressverzeichnis, Zeitung, Galerie, Chat, privates Konto, Einwilligungen (Speichern, Widerruf, Empfängerwechsel, neue Fassung, fremde Dateien, Sammeltabelle), **Einrichtung mit vorhandenen Daten** (Links erkennen, nur Fehlendes anlegen, Vorhandenes bleibt Byte für Byte unverändert, Prüfung meldet „Jeder mit dem Link“, Bearbeitungsrechte, vertrauliche Spalten, Termine ohne Einladung; Jahresordner, verschachtelte Alben, geteilte Ablage, Titelzeile, „Nachname, Vorname“, Zuordnung über den Namen) und die Gesamtbilanz (0 Verstöße). Die Testseite lädt bewusst **nicht** die echte `config.js` und ignoriert `fb.configOverride`.
- **`tests/fake-google.js`:** zustandsbehafteter Nachbau. Dateien haben Eigentümer (optional `driveId` = geteilte Ablage); `drive.file` lehnt fremde Dateien ab; jeder Schreibzugriff landet in `state.writes`, unerlaubte in `state.violations`; alle Drive-Suchen in `state.queries`. Die Drive-Suchsprache wird ausgewertet (`and`/`or`/`not`, Klammern, `in parents`, `in owners`, `has { key, value }`, `=`, `!=`, `contains`). Kalender-Freigaben lassen sich lesen (`acl` GET, nur Inhaber oder `aclReadable`). Während der Einrichtung `state.setupPhase = true` setzen. Neue API-Aufrufe der App müssen hier nachgebildet werden, sonst antwortet der Nachbau mit „Unbekannter …-Aufruf“.
- **`tests/app-mock.html`:** ganze App im Google-Modus gegen den Nachbau, mit Inhalten eines zweiten Mitglieds. `window.__fake.state.violations` muss leer bleiben.
- **`tests/layout-check.js`:** siehe Abschnitt 2.
- Vor jeder Veröffentlichung: google-mock grün, app-mock ohne Verstöße, Demo-Rundgang, Layout-Prüfung.

## 12. Werkzeuge

| Befehl | Zweck |
|---|---|
| `python tools/serve.py` | lokaler Server (ohne Zwischenspeicher) |
| `python tools/update_sw.py` | Dateiliste des Service Workers neu erzeugen |
| `python tools/make_anleitung.py <URL> [--domain …] [--kontakt …]` | Mitglieder-Anleitung (PDF) und `qr-code.png`; ohne URL ein MUSTER |
| `python tools/make_demo_pdfs.py` | Demo-Zeitungen |
| `python tools/make_demo_gallery.py`, `make_demo_images.py` | Demo-Fotos und News-Bilder |
| `python tools/build_assets.py` | Wappen, Skyline, Icons aus `tools/screenshot.webp` |

Benötigt: Python 3 mit Pillow, numpy, scipy, reportlab, pyphen, fonttools.

## 13. Veröffentlichen

Repository: <https://github.com/janbellin-pixel/fb-app> (öffentlich, Hauptzweig `main`) · App: <https://janbellin-pixel.github.io/fb-app/>

GitHub Actions (`.github/workflows/pages.yml`) kopiert `index.html`, `manifest.webmanifest`, `sw.js`, `config.js`, `css/`, `js/`, `assets/`, `vendor/` nach `_site` und setzt die Versionskennung im Service Worker auf den Commit. Neue Ordner, die ausgeliefert werden sollen, dort ergänzen. Nach dem Hochladen zeigen installierte Apps „Neue Version verfügbar“.

Der Workflow läuft nur bei Uploads in `main` und bei manuellem Start, nicht bei Pull Requests aus fremden Kopien. Schreiben können nur Inhaber und eingeladene Mitarbeiter. Absicherung des Kontos (Zwei-Faktor, Regeln für `main`, Notfall-Sperre): EINRICHTUNG.md, Abschnitt A3.

## 14. Häufige Aufgaben

- **Neue Seite:** Datei in `js/views/`, Route in `ROUTES` (`tab`, `nav`, `title`, ggf. `public`), Menüpunkt in `views/mehr.js` bzw. `NAV`/`TABS` in `app.js`, Service-Worker-Liste neu erzeugen, Layout prüfen.
- **Neues Profilfeld:** `PROFILE_FIELDS` (und ggf. `PROFILE_MAX`) in `common.js`, Formular in `views/profil.js`, Anzeige in `views/mitglieder.js`, Demo-Daten, Test in `google-mock.js`, Datenschutzerklärung (`js/lib/datenschutz.js`, Abschnitt „Was du selbst einträgst“) und Doku. Steht das Feld auch im Adressverzeichnis, in `adressabgleich.js` (`PROFIL_FELDER`) aufnehmen.
- **Neue Spalte im Adressverzeichnis erkennen:** `ADDRESS_FIELDS` in `common.js`; soll sie abgeglichen werden, zusätzlich in `ADRESS_FELDER` (`adressabgleich.js`). Vertraulich wirkende Spaltennamen (Hinweis in der Prüfung) stehen in `SENSITIVE` (`common.js`).
- **Neue Datenquelle:** Eintrag in `RESOURCES` (`setup.js`), Anlegen in `createMissing()`, Prüfung in `checkSetup()`, Feld in „1. Vorhandenes verbinden“, Schlüssel in `config.js` (siehe „Neuer Konfigurationsschlüssel“), Tests.
- **Einwilligungstext ändern:** `js/lib/datenschutz.js`, dann `datenschutz.fassung` in `config.js` erhöhen und `stand` setzen. Alle werden erneut gefragt; die Sammeltabelle übernimmt den neuen Wortlaut ins Blatt „Fassungen“.
- **Neuer Konfigurationsschlüssel:** `DEFAULTS` und `keep`-Liste in `js/config.js`, Kommentar in `config.js`, ggf. Feld in `views/einrichtung.js`, Doku (EINRICHTUNG, Abschnitt 10 hier).
- **Neuer Google-Aufruf:** Hülle in `js/google/*.js`, Nachbau in `tests/fake-google.js`, bei Schreibzugriff Abschnitt 7 befolgen.

## 15. Offene Punkte und bekannte Grenzen

- **Kein Test mit echtem Google:** Alles ist gegen den Nachbau und im Demo-Modus geprüft. Vor dem Start einmal komplett mit echtem Workspace testen (Teil A/B der EINRICHTUNG).
- **Länge der Drive-Beschreibung:** Das Limit ist nicht dokumentiert. Beiträge (bis 4000 Zeichen) und Einwilligungen sind daher kompakt gehalten; mit echtem Drive prüfen.
- **Apps-Scripts** (`Automatik.gs`, `Einwilligungen.gs`) sind nur auf Syntax geprüft und mit nachgebauten Diensten simuliert, nicht in echtem Apps Script ausgeführt.
- **Einwilligungsliste nach Eigentümerwechsel:** `drive.file` erlaubt das Schreiben nur dem Konto, das die Tabelle mit der App angelegt hat. Nach einer Übertragung schreibt die App sie nicht mehr; dann übernimmt `Einwilligungen.gs` im Konto des neuen Eigentümers (vollständige Drive-Rechte des Skripts), oder es wird eine neue Liste angelegt (EINRICHTUNG, Teil D).
- **iPhone:** Links aus dem Kalender öffnen Safari statt der installierten App (iOS).
- **Touch-Tablets** mit Maus/Trackpad zeigen je nach Gerät die Tab-Leiste oder die Textleiste; beides funktioniert.
- **Große Fotoarchive:** Die Galerie lädt die Angaben aller Fotos auf einmal (je Ordnerebene bis 4000). Bei sehr großen Archiven wäre Nachladen je Album besser. Verknüpfungen (Drive-Shortcuts) in den Ordnern werden nicht verfolgt.
- **Kalender-Freigaben** prüft die Einrichtung nur, wenn die Berechtigung „Kalender verwalten“ schon erteilt ist (sonst Hinweis, selbst in Google Kalender nachzusehen). Ein neuer Scope dafür ist bewusst nicht vorgesehen (AGENTS.md, Regel 2).
- **Vertrauliche Spalten** erkennt die Prüfung nur an typischen Spaltennamen – ein Hinweis, keine Garantie.
- **Muster-Texte:** Datenschutzerklärung und Einwilligungen müssen vom Vorstand freigegeben werden.
- **Mitglieder-Anleitung:** liegt mit der echten Adresse und QR-Code vor; vor dem Verteilen ggf. mit `--kontakt` (Ansprechpartner) neu erzeugen.
