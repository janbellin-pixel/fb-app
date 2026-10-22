# Entwicklung der Mitglieder-App

Leitfaden für alle, die die App weiterentwickeln – Menschen wie KI-Assistenten. Er erklärt Aufbau, Abläufe, Regeln und typische Aufgaben. **Warum** etwas so gebaut ist, steht in [ENTSCHEIDUNGEN.md](ENTSCHEIDUNGEN.md). Die Kurzfassung der Regeln für KI-Assistenten steht in [`AGENTS.md`](../AGENTS.md).

> **Pflege:** Diese Datei, ENTSCHEIDUNGEN.md und AGENTS.md werden **mit jeder Änderung** aktualisiert: neue Dateien, neue Funktionen, neue Konfiguration, neue Entscheidungen, behobene oder neue offene Punkte. Stand: 2026-10-18.

---

## 1. Was die App ist

Eine **Progressive Web App** für die Mitglieder der Frankonia-Brunonia. Sie bietet Termine mit Zu- und Absage, Mitglieder mit Profilen, Chat, Adressverzeichnis, Bundesbote (Zeitung der Verbindung), DS-Zeitung (Deutsche Sängerschaft), Liedermappe (Noten), Fotogalerie, News und Forum, dazu Datenschutz mit Einwilligungen und Links zu weiteren Angeboten wie dem Wiki. Sie läuft ohne eigenen Server direkt gegen **Google Workspace**; jedes Mitglied meldet sich mit seinem Google-Konto an.

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
| `js/lib/*.js` | Datum, Text/Markdown, Speicher/Cache, Export (ICS/vCard), Schriftgröße, Einrichtung (`setup.js`), Datenschutz (`datenschutz.js`, `einwilligungsliste.js`), Adressabgleich (`adressabgleich.js`), Benachrichtigungen (`hinweise.js`, E34), Bildschirmtastatur (`tastatur.js`, E36), Gruppen (`gruppen.js`: welche Bereiche die eigene Gruppe nicht sieht, E41) |
| `js/views/*.js` | Seiten (eine Datei je Bereich); `reader.js` = gemeinsame Leseansicht für PDFs und Bilder (Bundesbote, DS-Zeitung, Liedermappe); `zeitung.js` = Archiv und Leser für Bundesbote und DS-Zeitung (E38) |
| `vendor/` | PDF.js, StPageFlip, qrcode-generator (mit Lizenzen) |
| `assets/` | Wappen, Skyline, Icons, Schriften, Demo-Zeitungen, -Lieder (`assets/demo/lieder/`) und -Fotos |
| `apps-script/` | optionale Skripte für Verantwortliche: `Automatik.gs` (Kalender), `Einwilligungen.gs` (Sammeltabelle) |
| `tests/` | `fake-google.js` (API-Nachbau), `google-mock.*` (Backend-Test), `app-mock.html`, `layout-check.js` |
| `tools/` | Python-Hilfen: Server, Grafiken, Demo-PDFs und -Fotos, Mitglieder-Anleitung (PDF + QR), Service-Worker-Liste |
| `docs/` | Doku für Admins (EINRICHTUNG), Mitglieder (MITGLIEDER-ANLEITUNG + PDF), Technik (ARCHITEKTUR), Entwicklung (diese Datei, ENTSCHEIDUNGEN) |
| `.github/workflows/pages.yml` | Veröffentlichung auf GitHub Pages |

## 4. Ablauf zur Laufzeit

1. `index.html` lädt `boot.js` (Schriftgröße), CSS, `config.js` und `app.js`.
2. `app.js → boot()`: Service Worker registrieren und OAuth-Rückkehr auswerten (`auth.handleRedirect()`). Dann den Modus wählen: Demo (`fb.mode = demo`), Google (gültiger Zugangsschlüssel) oder stille Erneuerung.
3. `enterGoogle()` erzeugt `new GoogleBackend(user)`, `enterDemo()` erzeugt `new DemoBackend()`. Danach ist `app.backend` gesetzt.
4. `initConsent()` prüft die Datenschutz-Entscheidung, erst auf dem Gerät, dann bei Google. Fehlt sie, setzt die Funktion `app.consentPending = true`. Fehlt nur der Nachweis in Google (Datei gelöscht), obwohl das Gerät eine Entscheidung kennt, fragt die App ebenfalls neu; die Abfrage lässt dann auch dieselbe Auswahl erneut speichern (`remoteMissing` in `views/datenschutz.js`).
5. `renderShell()` zeichnet Kopfzeile, Tab-Leiste und Fuß. `startRouter(app)` zeigt die Seite zur aktuellen Hash-Route.
6. Bei jedem Seitenwechsel läuft `app.beforeRoute(match)`: Ist eine Datenschutz-Entscheidung offen, geht es zu `#/datenschutz?erstmals=1&weiter=…`. Läuft der Schlüssel bald ab, wird er still erneuert – aber nur, solange ein Konto gespeichert ist und nicht gerade abgemeldet wird. Neu laden mit der Startseite immer über `reloadAtStart()` (kein `location.hash = …` davor).
7. Eine Seite ist ein ES-Modul in `js/views/`: `export default async function (ctx)` bzw. benannte Exporte. `ctx = { el, params, query, route, app, alive }`. `alive()` meldet, ob die Seite noch angezeigt wird (nach `await` prüfen!). Optional wird eine Aufräumfunktion zurückgegeben.
8. Daten lädt eine Seite über `app.load(key, fetcher, onData, { maxAge })`: zuerst der zwischengespeicherte Stand (IndexedDB), dann frisch. `onData` kann deshalb zweimal kommen. Offline bleibt der letzte Stand sichtbar (`err.usedCache`). Wichtig deshalb: Ein `fetcher` darf bei vorübergehenden Fehlern (kein Netz, abgelaufene Anmeldung) keine halbe Liste liefern, sonst wird sie gespeichert – Quellen mit `.catch(unlessTransient(…))` abfangen, nicht mit `.catch(() => [])` (E42).
9. Für Verantwortliche gleicht `autoSyncConsents()` vier Sekunden nach dem Start die Einwilligungsliste ab (höchstens alle 15 Minuten).
10. `startHinweise(app)` (`js/lib/hinweise.js`) startet die Benachrichtigungen – sie prüfen nur, wenn das Mitglied sie eingeschaltet hat (E34). Seiten mit Zahlen tragen `data-badge="chat|news"`; nach dem Aufbau `refreshBadges()` aufrufen. Gelesen markieren: `markChatRead(space, zeit)` (Raum geöffnet, Nachricht gesendet) und `markNewsRead(ids)` (News-Übersicht bzw. Artikel). Der Service Worker leitet angetippte Mitteilungen per `postMessage({ type: 'navigate', hash })` weiter.

### Routen (`js/router.js`)

`''` Start · `termine` · `termin/:id` · `mitglieder` · `mitglied/:email` · `profil` · `chat` · `chat/:space` · `chat-neu` (`?gruppe=1`, `?raum=<ID>`) · `adressen` · `zeitung` · `zeitung/:id` · `lieder` (`?q=`, `?rubrik=`) · `lieder/:id` · `galerie` · `galerie/:album` · `news` · `news/:id` · `news-neu` · `news-bearbeiten/:id` · `forum` · `forum-neu` · `forum/:id` · `mehr` · `einstellungen` · `datenschutz` (öffentlich) · `datenschutz/uebersicht` · `installieren` (öffentlich) · `einrichtung` (öffentlich)

Öffentliche Routen funktionieren ohne Anmeldung, alle anderen zeigen sonst die Anmeldeseite. Deren Knopf verlangt bei Google immer die Kontoauswahl (`selectAccount` → `prompt=select_account`); nur die stille Erneuerung nutzt `login_hint`. Abmelden: `app.logout()` (Knöpfe in `views/mehr.js`: Kontokarte oben und Menü unten, sowie Einstellungen).

## 5. Backend-Schnittstelle

`GoogleBackend` und `DemoBackend` haben dieselben öffentlichen Methoden. **Neue Funktionen immer in beiden umsetzen** und im Demo-Modus sinnvoll vorführen.

| Bereich | Methoden |
|---|---|
| Allgemein | `me`, `isAdmin()`, `kind` (`google`/`demo`), `isWorkspace` |
| Mitglieder | `listMembers()` (jedes Mitglied mit `appNutzer`; wer „nicht sichtbar“ gewählt hat, fehlt, E40), `getMember(email)`, `saveMyProfile(fields)` |
| Gruppen (E41) | `myGroups()` → Schlüssel aus `config.gruppen.adressen`, deren Kennungsdatei (von einem Admin) ich lesen kann; Demo: `['bundesbrueder']` |
| Termine | `listEvents({from, to})` → `{events, canEdit:false}`, `getEvent(id)`, `rsvp(id, {status, guests, comment, title?, start?})` → `{via: 'calendar' \| 'app'}`, `calendarInfo()`, `canEditEvents()` (immer false). Jeder Termin hat `invited` (laut Google Kalender) und `attendees[]` mit `source: 'calendar' \| 'app'` |
| News | `listNews()` (Tabelle + App-News, `source: 'sheet' \| 'app'`, `own`), `canEditNews()` (Admins/Redaktion), `createNews(fields)`, `updateNews(id, fields)`, `deleteNews(id)`, `uploadNewsImage(file)` → `drive:<ID>`, `newsSheetUrl()`, `imageUrl(ref)` – Schreiben nur eigene (E29) |
| Forum | `forumEnabled()`, `listForum()` → `{threads, posts}` mit `own`, `createThread()`, `reply()`, `editPost()`, `deletePost()`, `deleteThread()` – nur Eigenes |
| Adressen | `listAddresses()` → `{items, hasBirthdays, sheetUrl, …}` |
| Zeitungen (Bundesbote, DS-Zeitung) | `listIssues(quelle = 'bundesbote')` (`'ds'` = DS-Zeitung; Ordner und Ablage in `ZEITUNGEN`, `common.js`), `loadIssue(issue)` (nach `issue.quelle`), `issueOpenUrl(issue)` |
| Liedermappe | `listSongs()` → `{songs, other, folderUrl}` (`other` = nicht anzeigbare Dateien), `loadSong(song)`, `songOpenUrl(song)`, `songsOffline(songs)` → `Set` der IDs, die auf dem Gerät liegen |
| Galerie | `listGallery()` → `{albums, folderUrl}`, `photoUrl(photo, size)`, `photoFullUrl(photo)` |
| Chat | `chatStatus()` (`canCreate`), `chatCanCreate()`, `listSpaces()` (Räume, Gruppen, Direktnachrichten mit Namen – sind die Mitglieder nicht lesbar, aus den Nachrichten der anderen Person), `listMessages(space)`, `latestMessage(space)` (letzte Nachricht oder `null`, für E34), `sendMessage(space, text)`, `openDirectChat(email, name)`, `createGroup({name, emails})`, `addMembers(space, emails)`, `listSpaceMembers(space)`, `findDirectChat(email)`, `chatOpenUrl()` |
| Datenschutz | `getMyConsent()`, `saveMyConsent({vereinszwecke, dachverband, zeitpunkt?})`, `isConsentManager()`, `listConsents()`, `consentTable()`, `createConsentTable()`, `syncConsentTable()`, `autoSyncConsents()` |

Nur Google (intern): `cached(key, ttl, fn)` und `invalidate(key)` (Speicher-Cache; Schlüssel mit ID, z. B. `addressKey()`, damit ein neu verbundenes Verzeichnis nie aus dem alten Zwischenspeicher kommt), `myId()` (eigene Google-Konto-ID für Chat, E35), `folderScope(id)` (geteilte Ablage gezielt durchsuchen), `keptFile(cache, prefix, file)` (Datei herunterladen und offline behalten: Bundesbote, Liedermappe), `appFolder()`, `listAppFiles(typ)`, `createOwnFile()`, `shareOwnFile()`, `ownerOf(file)`, `ensureConsentSharing()`. `app.clearCache()` leert auch diesen Speicher-Cache. Nur Demo: `reset()`, `setDemoPhoto(file)`.

## 6. Datenformate in Google

**Eigene Dateien** (Ordner „Frankonia-Brunonia App – meine Beiträge und Profil“, `appProperties.fbTyp = ordner`, nicht freigegeben):

| Typ | `appProperties` | Beschreibung (JSON) | Freigabe |
|---|---|---|---|
| Profil | `fbTyp=profil` | Felder aus `PROFILE_FIELDS`: `kneipname, status, rezeption, studium, taetigkeit, wohnort, aemter, ueberMich, angebot, telefon, instagram, linkedin` | Gruppe/Domain/Testkonten: Leser – nur, solange das Mitglied sichtbar ist (E40), sonst ohne Freigabe |
| Forum | `fbTyp=forum`, `fbRolle=thema\|antwort`, `fbThema=<Datei-ID>`, `fbKategorie` | `{ titel, text, bearbeitet }` | Gruppe/Domain/Testkonten: Leser |
| News (Redaktion, E29) | `fbTyp=news`, `fbKategorie` | `{ titel, text, kategorie, angeheftet, bild, datum, bearbeitet }` – zählt nur, wenn der Eigentümer Admin oder in `redaktion` ist | Gruppe/Domain/Testkonten: Leser |
| News-Bild | `fbTyp=newsbild` (JPEG, verkleinert) | – | Gruppe/Domain/Testkonten: Leser |
| Zusage (ohne Einladung, E28) | `fbTyp=zusage`, `fbTermin=<Termin-ID>` (bei sehr langen IDs eine Prüfsumme, `terminKey()`) | `{ termin, titel, beginn, status, gaeste, kommentar, zeitpunkt }` | Gruppe/Domain/Testkonten: Leser |
| Einwilligung | `fbTyp=einwilligung`, `fbVz`, `fbDv` (`Ja`/`Nein`), `fbFassung`, `fbEmpf` (Prüfsumme der Empfänger); öffentlich `properties.fbTyp=einwilligung` | `{ typ, version, konto, name, zeitpunkt, fassung, pruefsumme, vereinszwecke, dachverband, sichtbar, geraet, stand, erstmals, verlauf:[…max. 10] }`, zusätzlich als lesbarer Dateiinhalt | nur einzelne Verantwortliche: Leser |
| Sichtbarkeit (E40) | `fbTyp=sichtbarkeit`, `fbSichtbar` (`ja`/`nein`); Name „Sichtbarkeit (Mitglieder-App).json“ | `{ sichtbar, geaendert }` – entsteht beim Speichern der Datenschutz-Auswahl, zeigt anderen: nutzt die App, darf (nicht) angezeigt werden | Gruppe/Domain/Testkonten: Leser (auch bei „nein“, sonst wüssten die anderen nichts von der Wahl) |

**Gemeinsame Daten** (nur lesen): Kalender (`extendedProperties.shared.fbKategorie/fbKleidung/fbPflicht` oder Zeilen in der Beschreibung), Tabelle „News“ (Spalten aus `NEWS_SCHEMA`), Tabelle „Adressverzeichnis“ (Spalten frei; Erkennung über `ADDRESS_FIELDS` in `common.js`; Kopfzeile in den ersten zehn Zeilen; Blatt aus `adressenBlatt`, sonst „Adressen“, sonst das erste), Ordner des Bundesboten und der DS-Zeitung (`JJJJ-N Titel.pdf`, auch in Jahresordnern bis zwei Ebenen tief; Datum, Jahr und Nummer bzw. Monat liest `ausgabeAusName()` aus dem Dateinamen, sonst zählen die Zahlen im Namen; die Reihenfolge in `sortIssues()` richtet sich allein danach, nicht nach dem Upload-Datum, E39; der Leser zeigt immer eine Seite und teilt Querformat-Seiten als Doppelseiten: `layoutPages()`/`drawPart()` in `views/reader.js`), Ordner der Liedermappe (PDFs und Bilder bis drei Ebenen tief, Unterordner = Rubriken; Nummer und Titel aus dem Dateinamen: `songFromFile()`, Reihenfolge `sortSongs()`/`songsGrouped()` in `common.js`; Querformat wird hier nicht geteilt, E31), Ordner „Galerie“ (Unterordner `JJJJ-MM Name` = Alben, auch in Jahresordnern bis zwei Ebenen tief). Unterordner liest `drive.listTree()` je Ebene gebündelt (bis 25 Ordner pro Abfrage), in geteilten Ablagen mit `corpora=drive&driveId` (E25). Kennungsdateien der Gruppen (E41): `fbTyp=gruppe`, `fbGruppe=<Schlüssel aus config.gruppen.adressen>`, in „Meine Ablage“ eines Admins, nur für die jeweilige Google-Gruppe lesbar; gezählt werden nur Dateien von Admins.

**Einwilligungsliste** (`appProperties.fbTyp = einwilligungen-tabelle`, im Drive der Verantwortlichen): Blätter „Stand“, „Verlauf“ (Schlüssel: Datei-ID + Zeitstempel UTC, nur anhängen) und „Fassungen“; Aufbau in `js/lib/einwilligungsliste.js`, Gegenstück in `apps-script/Einwilligungen.gs`.

**Auf dem Gerät** (`localStorage`): `fb.token`, `fb.user`, `fb.mode`, `fb.oauthState`, `fb.silentTry`, `fb.configOverride` (Einrichtung), `fb.schrift`, `fb.demo.v1`, `fb.einwilligung.<email>`, `fb.einwilligungSync.<email>`, Entwürfe (`fb.forumDraft.*`, `fb.forumNewDraft`, `fb.chatDraft.*`) und Ansichtszustände (`fb.memberSearch`, `fb.termineView`, `fb.forumSeen`, `fb.installDismissed`, `fb.lieder.zuletzt`, `fb.newsRaum`), Benachrichtigungen (`fb.benachrichtigungen.<email>` ein/aus, `fb.gelesen.<email>` = je Raum zuletzt gelesen, gesehene News, schon gemeldete Nachrichten). Daneben IndexedDB `fb-app` (Datencache) und Cache-Speicher `fb-zeitung` (PDFs des Bundesboten) und `fb-lieder` (Noten).

## 7. Schreibschutz – wie er funktioniert und wie man ihn erweitert

`js/google/client.js` ruft vor **jedem** `fetch` `assertWriteAllowed(method, url, body)` auf (`js/google/guard.js`). `GET`/`HEAD` sind frei; alles andere muss einer Regel entsprechen:

- **Kalender:** nur `PATCH calendars/primary/events/{id}` mit genau `{attendees}` (eigene Antwort). Während der Einrichtung: neuen Kalender anlegen und befüllen.
- **Drive:** Datei anlegen (`POST files`), aber nur in eigenen bzw. gerade angelegten Ordnern (`assertParentsAllowed`). Ändern/Papierkorb (`PATCH`), Freigabe setzen (`POST …/permissions`) und Freigabe entfernen (`DELETE …/permissions/{id}`) nur bei **eigenen** Dateien (`registerOwnFile`, nur nach `ownedByMe` von Google). `addParents`/`removeParents` sind immer gesperrt.
- **Tabellen:** nur während der Einrichtung (gerade angelegte Tabellen) und für die eigene, von der App angelegte Einwilligungsliste (`registerOwnTable`, nur nach Prüfung `ownedByMe` + `fbTyp`).
- **Chat:** eigene Nachrichten senden, ändern, löschen; `POST spaces:setup` nur für Direktnachricht/Gruppe/Raum mit ausschließlich Personen (`users/…`, `type: HUMAN`, keine Chat-App-DM); `POST spaces/{id}/members` nur für Personen. Räume ändern/löschen und Mitglieder entfernen sind gesperrt (E30).

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
- **Raster** mit `minmax(0, 1fr)`; lange Wörter mit `hyphens: auto`, in engen Spalten zusätzlich `overflow-wrap: anywhere` (z. B. „Adressverzeichnis“).
- **Breakpoints:** 480/520/560 (kleine Handys), 600 (Dialoge mittig), 640, 700 (Abstände, Formulare zweispaltig, Tab-Leiste mittig), **768** (zweispaltige Seiten), 900 (größere Skyline), 1000/1100. Die **Navigation** hängt nur an `(min-width: 1280px) and (hover: hover) and (pointer: fine)` (E17). Bei `(orientation: landscape) and (max-height: 500px)` ist die Ansicht kompakt.
- **Safe Areas:** `--safe-t/-b/-l/-r` und `--pad-l/-r` (Rand + Aussparung) für alles, was bis an den Rand reicht.
- **Bildschirmtastatur (E36):** `js/lib/tastatur.js` setzt `--vvh`/`--vv-top` (sichtbarer Bereich) und `body.keyboard-open`, solange auf einem Touch-Gerät ein Textfeld die Tastatur geöffnet hat. Dann ist die Tab-Leiste ausgeblendet, und der Chat füllt genau den sichtbaren Bereich. Ganze Seitenhöhen nie nur mit `100dvh` rechnen, wenn dort getippt wird. Im versteckten Browser-Fenster (Test) feuern `visualViewport`-Ereignisse nicht – dort per `visualViewport.dispatchEvent(new Event('resize'))` auslösen.
- **Hover-Effekte** mit Bewegung nur in `@media (hover: hover)`.
- **ARIA:** `aria-pressed` und ähnliche Attribute mit Wahrheitswerten schreibt `html``…`` automatisch als "true"/"false".
- **Prüfen:** 375 px und „Sehr groß“ sowie die Tablet-Größen aus Abschnitt 2 mit `tests/layout-check.js`.

## 9. Sicherheit im Code

- HTML nur über `html``…`` (maskiert alles). `raw()` nur für eigene, feste Inhalte. Formatierung in Beiträgen nur über `markdown()` (kleine, sichere Teilmenge).
- Kein `eval`/`new Function`; die CSP verbietet es ohnehin.
- Keine Geheimnisse im Code. Die OAuth-Client-ID ist öffentlich.
- Personenbezogene Daten nie in URLs (außer `mailto:` an das Adressänderungs-Postfach, das das Mitglied selbst abschickt). Betreff und Text im `mailto:`-Link nur über `mailAscii()` (nur ASCII, Umlaute als ae/oe/ue/ss), sonst zeigen manche E-Mail-Apps Zeichensalat (E37).

## 10. Konfiguration

Alle Schlüssel mit Standardwert stehen in `js/config.js → DEFAULTS`, kommentiert in `config.js`. Reihenfolge: `DEFAULTS` ← `config.js` (veröffentlicht) ← lokale Einrichtungswerte (`fb.configOverride`, nur in diesem Browser). Die Einrichtung erzeugt mit `configFileContent()` eine neue `config.js`; **neue Schlüssel in die `keep`-Liste aufnehmen**, sonst landen sie nicht in der heruntergeladenen Datei.

Wichtige Schlüssel: `googleClientId`, `workspaceDomain`, `mitgliederGruppe`, `admins`, `redaktion`, `appUrl`, `kalenderId`, `tabellen.{adressen,news,einwilligungen}`, `adressenBlatt`, `zeitungOrdnerId`, `liedermappeOrdnerId` (freiwillig), `dsZeitungOrdnerId` (freiwillig, E38), `galerieOrdnerId`, `chat.aktiv`, `chat.newsRaum` (vorgeschlagener Raum für News-Ankündigungen, E33), `forum.aktiv`, `profilBearbeiten`, `links` (`[{ titel, url, symbol? }]`, nur https, E32), `adressaenderung`, `datenschutz.{verein,anschrift,email,dachverband,dachverbandKurz,fassung,stand,empfaenger}`, `demoErlaubt`, `testMitglieder`, `ausgeblendeteKonten`, Listen für Status (`statusOptionen`, `statusGruppen` = Filter in „Mitglieder“; Vergleiche immer über `statusKey()`, „Bursch“ = „Bursche“), Kategorien und Kleiderordnung.

**Einrichtung** (`js/lib/setup.js`, `views/einrichtung.js`, E23/E24): `RESOURCES` listet die acht Datenquellen (Liedermappe und DS-Zeitung sind freiwillig; ohne Ordner meldet die Prüfung nur einen Hinweis), `missingResources()` die noch nicht eingetragenen. „1. Vorhandenes verbinden“ speichert nur IDs (`idFromUrl` versteht Tabellen-, Ordner- und Datei-Links sowie Kalender-Links mit Base64-`cid`, `src=` und iCal). „2. Fehlendes neu anlegen“ ruft `createMissing({ only })` auf: legt nur das Fehlende neu an (Ordner „… – Mitglieder-App“ nur, wenn Tabellen oder Ordner fehlen; Einwilligungsliste außerhalb), gibt nur Neues frei, Beispieldaten nur in Neues. `createEverything()` = alles neu (für Tests von Grund auf). `checkSetup()` liest nur und liefert je Datenquelle `{label, ok, detail, lines, warn}` – auch für Google-Verzeichnis (Mitgliederliste) und Google Chat, mit der Fehlermeldung von Google und einer Abhilfe; Freigaben bewerten `judgeSharing()` (Drive) und `judgeCalendarAcl()` (Kalender, nur mit vorhandener Berechtigung „Kalender verwalten“).

## 11. Tests

- **`tests/google-mock.js`** (Backend, derzeit 288 Prüfungen): Einrichtung, Schreibschutz (gezielte Angriffsversuche), Mitglieder/Profile inkl. Fälschungsversuch, Profilfelder, Termine/Zusagen (auch ohne Einladung über eigene Dateien, inkl. Fälschungsversuch), News der Redaktion (schreiben, Bild, bearbeiten, löschen, Fälschung ignoriert, fremde gesperrt), Chat (Direktnachricht anlegen und wiederverwenden, Gruppen, Personen hinzufügen, Angriffe wie Bot hinzufügen, Raum löschen, Mitglied entfernen; letzte Nachricht, eigene Nachrichten auch ohne Verzeichnis, Name einer fremd angefangenen Direktnachricht ohne Mitglieder-Recht, von Google abgelehntes Senden, Link aus `spaceUri`), Benachrichtigungen (Zeitvergleich, neue News), News, Forum, Adressen, Abgleich mit dem Adressverzeichnis (E-Mail-Link nur ASCII), Zeitung, DS-Zeitung (eigener Ordner, getrennt vom Bundesboten, Angriffe, ohne Ordner ausgeblendet), Reihenfolge der Ausgaben nach dem Dateinamen statt nach dem Upload-Datum, Liedermappe (Unterordner, Nummern, Bilder, nicht anzeigbare Dateien, Suche, offline, Angriffe), Galerie, Chat, privates Konto, Einwilligungen (Speichern, Widerruf, Empfängerwechsel, neue Fassung, fremde Dateien, Sammeltabelle), Sichtbarkeit (eigene Datei, „nicht sichtbar“ blendet aus, Fälschung, Profil-Freigabe zurücknehmen und wieder setzen, „Nur App-Nutzer“; abgelaufene Anmeldung und gestörte Domain-Suche brechen ab, der gespeicherte Stand bleibt; dauerhaft gesperrtes Verzeichnis), Gruppen (Regeln, Kennungsdateien nur für die Gruppe, nichts doppelt, nur Kennungen von Admins, Angriff, kein Adressverzeichnis für Gäste), **Einrichtung mit vorhandenen Daten** (Links erkennen, nur Fehlendes anlegen, Vorhandenes bleibt Byte für Byte unverändert, Prüfung meldet „Jeder mit dem Link“, Bearbeitungsrechte, vertrauliche Spalten, Termine ohne Einladung; Jahresordner, verschachtelte Alben, geteilte Ablage, Titelzeile, „Nachname, Vorname“, Zuordnung über den Namen) und die Gesamtbilanz (0 Verstöße). Die Testseite lädt bewusst **nicht** die echte `config.js` und ignoriert `fb.configOverride`.
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
| `python tools/make_demo_lieder.py` | Demo-Lieder (fiktiv: Notensatz als PDF und ein „Scan“ als JPG) |
| `python tools/make_demo_gallery.py`, `make_demo_images.py` | Demo-Fotos und News-Bilder |
| `python tools/build_assets.py` | Wappen, Skyline, Icons aus `tools/screenshot.webp` |

Benötigt: Python 3 mit Pillow, numpy, scipy, reportlab, pyphen, fonttools.

## 13. Veröffentlichen

Repository: <https://github.com/janbellin-pixel/fb-app> (öffentlich, Hauptzweig `main`) · App: <https://janbellin-pixel.github.io/fb-app/>

Der Service Worker fragt App-Code bei jedem Start beim Server nach und aktiviert neue Versionen sofort (E27). GitHub Actions (`.github/workflows/pages.yml`) kopiert `index.html`, `manifest.webmanifest`, `sw.js`, `config.js`, `css/`, `js/`, `assets/`, `vendor/` nach `_site` und setzt die Versionskennung im Service Worker auf den Commit. Neue Ordner, die ausgeliefert werden sollen, dort ergänzen. Nach dem Hochladen zeigen installierte Apps „Neue Version verfügbar“.

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
- **Gruppen (E41) nur in der Oberfläche:** Forumsbeiträge (und Profile, Zusagen) sind weiter für die Domain freigegeben; über Google Drive könnten Gäste sie technisch finden. Echter Ausschluss bräuchte Freigaben je Gruppe statt Domain (`shareOwnFile`). Mit echten Gruppen prüfen, dass die Kennungsdateien über die Gruppenmitgliedschaft lesbar sind (der Nachbau kennt keine Gruppen).
- **Sichtbarkeit (E40):** Direkt nach dem Update zeigt „Nur App-Nutzer“ nur, wer die Abfrage der Fassung 3 schon beantwortet hat.
- **Länge der Drive-Beschreibung:** Das Limit ist nicht dokumentiert. Beiträge (bis 4000 Zeichen) und Einwilligungen sind daher kompakt gehalten; mit echtem Drive prüfen.
- **Apps-Scripts** (`Automatik.gs`, `Einwilligungen.gs`) sind nur auf Syntax geprüft und mit nachgebauten Diensten simuliert, nicht in echtem Apps Script ausgeführt.
- **Einwilligungsliste nach Eigentümerwechsel:** `drive.file` erlaubt das Schreiben nur dem Konto, das die Tabelle mit der App angelegt hat. Nach einer Übertragung schreibt die App sie nicht mehr; dann übernimmt `Einwilligungen.gs` im Konto des neuen Eigentümers (vollständige Drive-Rechte des Skripts), oder es wird eine neue Liste angelegt (EINRICHTUNG, Teil D).
- **iPhone:** Links aus dem Kalender öffnen Safari statt der installierten App (iOS).
- **Touch-Tablets** mit Maus/Trackpad zeigen je nach Gerät die Tab-Leiste oder die Textleiste; beides funktioniert.
- **Doppelseiten-Erkennung:** Querformat-Seiten im PDF gelten als Doppelseiten und werden geteilt (E11). Eine echte Querformat-Einzelseite (z. B. eine Tabelle) würde ebenfalls geteilt.
- **Nachrichtenanfragen (E30):** Eine noch nicht angenommene Direktnachricht erscheint in der App wie jede andere; erst beim Senden kommt der Hinweis „Antworten noch nicht möglich“. Vorab erkennen ließe sie sich nur am eigenen Mitgliedsstatus `INVITED` (braucht `chat.memberships`). Am einfachsten: Chateinladungen in der Admin-Konsole automatisch annehmen lassen (EINRICHTUNG, B2).
- **Bildschirmtastatur (E36):** nur nachgestellt geprüft – auf echten Geräten (iPhone und Android, installiert und im Browser) testen, ob der Chat beim Tippen sauber über der Tastatur bleibt.
- **Benachrichtigungen bei geschlossener App:** gibt es nur über die App „Google Chat“ (E33/E34). Web Push über ein Apps-Script wäre für News, Forum und Termine möglich (E34, „Nicht umgesetzt“). Badging API und Mitteilungen des Systems unterstützen nicht alle Browser (iPhone: nur installierte App).
- **DS-Zeitung (E38, E39):** Mit dem echten Ordner prüfen, ob die App Jahr und Nummer bzw. Monat aus den Dateinamen liest. Ohne erkennbare Angabe stehen die Ausgaben in der Reihenfolge ihrer Namen (das Upload-Datum zählt nicht); die Verbindungsprüfung nennt Ausgaben ohne erkennbares Jahr.
- **Liedermappe:** Mit dem echten Ordner prüfen, wie die Dateien benannt und gegliedert sind (Nummern, Rubriken). Drive-Verknüpfungen und Google-Dokumente zeigt die App nicht an; „Alle Lieder speichern“ hängt vom freien Speicher des Geräts ab.
- **Große Fotoarchive:** Die Galerie lädt die Angaben aller Fotos auf einmal (je Ordnerebene bis 4000). Bei sehr großen Archiven wäre Nachladen je Album besser. Verknüpfungen (Drive-Shortcuts) in den Ordnern werden nicht verfolgt.
- **Kalender-Freigaben** prüft die Einrichtung nur, wenn die Berechtigung „Kalender verwalten“ schon erteilt ist (sonst Hinweis, selbst in Google Kalender nachzusehen). Ein neuer Scope dafür ist bewusst nicht vorgesehen (AGENTS.md, Regel 2).
- **Vertrauliche Spalten** erkennt die Prüfung nur an typischen Spaltennamen – ein Hinweis, keine Garantie.
- **Muster-Texte:** Datenschutzerklärung und Einwilligungen müssen vom Vorstand freigegeben werden.
- **Mitglieder-Anleitung:** liegt mit der echten Adresse und QR-Code vor; vor dem Verteilen ggf. mit `--kontakt` (Ansprechpartner) neu erzeugen.
