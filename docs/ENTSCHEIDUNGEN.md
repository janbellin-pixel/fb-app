# Entwicklungsentscheidungen

Dieses Protokoll hält fest, **was** entschieden wurde, **warum** und **was daraus folgt**. Es ist die Grundlage, um die App ohne die ursprünglichen Beteiligten weiterzuentwickeln – auch mit Hilfe von KI.

**Pflege:** Jede neue grundlegende Entscheidung bekommt einen eigenen Eintrag (fortlaufende Nummer, Datum). Wird eine Entscheidung geändert, bleibt der alte Eintrag stehen; er wird als „ersetzt durch Nr. X“ markiert, und der neue Eintrag erklärt den Grund. So bleibt nachvollziehbar, warum etwas so ist, wie es ist.

Format je Eintrag: **Kontext** (Ausgangslage, Anforderung) · **Entscheidung** · **Folgen** (Vor- und Nachteile, verworfene Alternativen).

---

## E1 · Web-App (PWA) statt App-Store-App
*2026-10-16*

- **Kontext:** Rund 100 Mitglieder mit iPhone, Android und PC sollen die App „wie jede normale App“ installieren können. Ein Apple-Entwicklerkonto, App-Prüfungen und zwei native Codebasen wären für einen Verein unverhältnismäßig.
- **Entscheidung:** Progressive Web App. Die Installation erfolgt über den Browser („Zum Home-Bildschirm“ bzw. „App installieren“).
- **Folgen:** Eine Codebasis, Updates ohne Store. Auf dem iPhone öffnen Links aus dem Kalender Safari statt der installierten App (iOS-Einschränkung, dokumentiert). Eine spätere Verpackung für die Stores ist möglich (PWABuilder, siehe ARCHITEKTUR.md).

## E2 · Kein Build-Schritt, keine Laufzeit-Abhängigkeiten
*2026-10-16*

- **Kontext:** Die App soll lange und von wechselnden, nicht unbedingt professionellen Entwicklern gepflegt werden.
- **Entscheidung:** Reines HTML/CSS/JavaScript mit ES-Modulen, ohne npm, Bundler oder Framework. Bibliotheken liegen mit fester Version in `vendor/` (PDF.js 6.3, StPageFlip 2.0.7, qrcode-generator 2.0.4). Schriften werden mitgeliefert.
- **Folgen:** Jede Datei ist direkt lesbar und änderbar. Es gibt nichts zu bauen, das veralten kann. Keine Abfragen an fremde Server (DSGVO). Neue Dateien müssen in die Liste des Service Workers (`python tools/update_sw.py`).

## E3 · Google Workspace als einziges Backend, kein eigener Server
*2026-10-16*

- **Kontext:** Die Verbindung hat Google Workspace Enterprise; jedes Mitglied hat ein Konto. Die Daten sollen im Workspace liegen.
- **Entscheidung:** Die App spricht direkt aus dem Browser mit den Google-APIs (Calendar, Drive, Sheets, People, Chat) – angemeldet als das jeweilige Mitglied. GitHub Pages liefert nur die statischen Dateien aus.
- **Folgen:** Keine Serverkosten, keine Server-Sicherheitspflege, keine Daten außerhalb von Google. Rechte regeln die Google-Freigaben. Alles, was „im Namen der Verbindung“ automatisch passieren soll, braucht ein Apps-Script im Konto eines Verantwortlichen (z. B. `Automatik.gs`, `Einwilligungen.gs`).

## E4 · Anmeldung: OAuth „Implicit Flow“ mit Weiterleitung, ohne Refresh-Token
*2026-10-16*

- **Kontext:** Ohne eigenen Server kann die App keine Refresh-Tokens sicher verwahren. Pop-up-Anmeldungen funktionieren in installierten Web-Apps auf dem iPhone nicht zuverlässig.
- **Entscheidung:** Anmeldung per Weiterleitung zu Google. Der Zugangsschlüssel gilt eine Stunde und wird danach still (`prompt=none`) erneuert. Der Client ist bei Google mit Zielgruppe „Intern“ registriert.
- **Folgen:** Kein Passwort in der App, keine dauerhaften Schlüssel. Alle 60 Minuten eine kurze, meist unsichtbare Weiterleitung. Ausbaustufe denkbar: kleiner Token-Dienst (Cloud Run).
- **Ergänzt 2026-10-18:** Der Knopf „Mit Google anmelden“ fordert immer die Kontoauswahl an (`prompt=select_account`). Sonst meldete Google nach dem Abmelden still wieder das zuletzt genutzte Konto an, und ein Wechsel zu einem anderen Konto der Verbindung war nicht möglich. „Abmelden“ steht oben in „Mehr“ neben „Profil“ (und unter Einstellungen); es löscht Schlüssel und Zwischenspeicher auf dem Gerät, meldet aber nicht bei Google selbst ab. Abmelden lädt die App ohne vorherigen Seitenwechsel neu (`reloadAtStart()` in `app.js`), und still erneuert wird nur, solange ein Konto gespeichert ist – sonst löste der Seitenwechsel beim Abmelden sofort wieder eine stille Anmeldung aus (Fehler vom 2026-10-18).

## E5 · Nur-Lesen-Prinzip mit Schreibschutz in drei Ebenen
*2026-10-17 – Anforderung des Auftraggebers: „Die App dient ausschließlich zur Information und zum Austausch und nicht zum Ändern der angezeigten Daten.“*

- **Kontext:** Durch die App dürfen weder während der Entwicklung noch im Betrieb Daten im Drive geändert werden – außer denen des jeweiligen Nutzers.
- **Entscheidung:**
  1. Google-Freigaben: Mitglieder haben auf Kalender, Tabellen und Ordner nur Leserechte.
  2. Minimale OAuth-Scopes: `drive.readonly` und `drive.file`, kein Tabellen-Schreib-Scope.
  3. Sperre im Code (`js/google/guard.js`): Jede ändernde Anfrage wird vor dem Senden geprüft. Nur ausdrücklich erlaubte Fälle gehen durch.
- **Folgen:** Termine, News, Adressen, Bundesbote und Fotos werden **direkt bei Google** gepflegt, nicht in der App (siehe E9–E12). Jede neue Schreibfunktion braucht eine Regel im Wächter **und** einen Test in `tests/google-mock.js`. Der Test zählt unerlaubte Schreibzugriffe; das Ergebnis muss 0 sein. Frühere Funktionen (Termine und News in der App bearbeiten, gemeinsame Tabelle „Mitgliederdaten“, Forum-Moderation) wurden dafür entfernt.

## E6 · Eigene Daten liegen im eigenen Drive; Identität = Dateieigentümer
*2026-10-17*

- **Kontext:** Profile, Forumsbeiträge und Einwilligungen müssen gespeichert werden, ohne dass Mitglieder Schreibrechte auf gemeinsame Dateien bekommen.
- **Entscheidung:** Jede dieser Angaben ist eine kleine JSON-Datei im **eigenen** Drive des Mitglieds (Ordner „Frankonia-Brunonia App – meine Beiträge und Profil“). Typ und Bezug stehen in `appProperties` (z. B. `fbTyp=forum`). Wer etwas geschrieben hat, ergibt sich aus dem Eigentümer, den Google meldet (`owners[0]`), nie aus dem Dateiinhalt.
- **Folgen:** Niemand kann im Namen anderer schreiben oder fremde Beiträge ändern. Es gibt keinen gemeinsamen beschreibbaren Ordner. Der Inhalt steht in der Beschreibung der Datei, damit eine einzige Listen-Abfrage alles liefert. Die zulässige Länge der Beschreibung ist bei Google nicht dokumentiert; deshalb sind Beiträge auf 4000 Zeichen begrenzt und Einwilligungen kompakt. Das ist mit echtem Google noch zu prüfen.

## E7 · Selbst gepflegte Profile sind bewusst vom Adressverzeichnis getrennt
*2026-10-17 – ausdrücklicher Wunsch des Auftraggebers*

- **Kontext:** Es gibt zwei Arten von Personendaten. Das **Adressverzeichnis** (Anschrift, Telefon, Geburtstag, Status …) ist das offizielle Verzeichnis der Verbindung und wird vom Schriftwart in einer Google-Tabelle gepflegt. Das **Profil** sind freiwillige Angaben der Mitglieder über sich selbst (Kneipname, Studium/Beruf, aktuelle Tätigkeit, „Über mich“, was man Jüngeren anbieten kann, Social Media).
- **Entscheidung:** Beides bleibt getrennt. Mitglieder schreiben nie ins Adressverzeichnis. Ihr Profil liegt in einer eigenen Datei (E6). Die Profilseite gleicht Anschrift und Stammdaten mit dem Adressverzeichnis ab (`js/lib/adressabgleich.js`). Bei Abweichungen bereitet sie eine E-Mail an das Postfach für Adressänderungen vor (`config.adressaenderung`), mit den neuen Angaben und dem Hinweis, dass der Eintrag falsch oder unvollständig ist. Abgeschickt wird die E-Mail vom Mitglied selbst.
- **Folgen:** Das Adressverzeichnis bleibt verlässlich und in einer Hand (Schriftwart). Die Anschrift wird nicht im Profil gespeichert. Beim **Status** gilt immer das Adressverzeichnis; Kneipname und andere Angaben darf das Mitglied im Profil ergänzen oder überschreiben. Verworfen wurde: Mitglieder dürfen das Verzeichnis selbst bearbeiten (verletzt E5, keine Kontrolle) bzw. Profilangaben ersetzen das Verzeichnis (keine offizielle Quelle mehr).

## E8 · Zu- und Absagen über den eigenen Kalender (ergänzt durch E28)
*2026-10-17*

- **Kontext:** Zu- und Absagen sollen möglichst die normale Google-Antwort sein und in den eigenen Kalender exportierbar.
- **Entscheidung:** Die App setzt die Antwort im **eigenen** Kalender (`calendars/primary`, nur das Feld `attendees`); Google überträgt sie an den Termin. Wer nicht eingeladen ist, bekommt einen Hinweis statt einer Ersatzlösung.
- **Folgen:** Kein Schreibzugriff auf den Verbindungskalender nötig. Die Mitglieder-Gruppe muss als Gast eingeladen sein (manuell oder per `Automatik.gs`). Eine frühere Ersatzliste in einer Tabelle wurde entfernt (E5).
- **Geändert 2026-10-18:** Der Hinweis statt einer Ersatzlösung entfällt – wer nicht eingeladen ist, sagt über eine eigene Datei zu (E28).

## E9 · Termine werden im Google Kalender gepflegt
*2026-10-17*

- **Kontext:** Folge aus E5.
- **Entscheidung:** Termine werden direkt im Google Kalender angelegt. Kategorie, Kleidung und Pflichttermin erkennt die App aus `extendedProperties` oder aus eigenen Zeilen in der Beschreibung (`Kategorie: Kneipe`, `Kleidung: Vollcouleur`, `Pflichttermin`); sonst wird die Kategorie aus dem Titel geraten. Das optionale `Automatik.gs` trägt App-Link und Gruppe ein.
- **Folgen:** Die Chargen arbeiten im vertrauten Google Kalender. Die Beschreibungszeilen sind eine einfache Konvention ohne eigene Oberfläche.

## E10 · News aus einer Google-Tabelle
*2026-10-17*

- **Entscheidung:** Die Redaktion pflegt die Tabelle „News“ direkt. Die ID ist optional (sonst Zeilennummer). Datumsangaben werden in allen üblichen Schreibweisen erkannt, weil Google von Hand eingetippte Daten als „16.10.2026“ liefert.
- **Folgen:** Kein Editor in der App nötig. Bilder per Drive-Link oder URL.
- **Ergänzt durch E29** (News direkt in der App, als eigene Beiträge der Redaktion).

## E11 · Bundesbote (Zeitung der Verbindung) als PDFs mit Umblätter-Ansicht
*2026-10-16*

- **Entscheidung:** PDFs liegen in einem Drive-Ordner (Dateiname `JJJJ-N Titel.pdf`). PDF.js rendert die Seiten, StPageFlip blättert sie. Geöffnete Ausgaben werden offline zwischengespeichert.
- **Geändert 2026-10-18 (Wunsch der Verbindung):** immer nur **eine Seite**, keine Doppelseite – auch quer und auf Tablets/Computern. Umsetzung: `minWidth` von StPageFlip wird nach dem Aufbau auf 1e6 gesetzt, damit die Bibliothek stets „portrait“ wählt (`js/views/zeitung.js`). Vorher: hochkant Einzelseite, quer Doppelseite. Zusätzlich gelten PDF-Seiten im Querformat (Breite ≥ 1,25 × Höhe) als Doppelseiten, z. B. aus Scans, und werden in linke und rechte Hälfte geteilt; ist schon die erste PDF-Seite eine Doppelseite, gilt sie als Umschlag (Titel zuerst, Rückseite ans Ende). Grenze: Eine echte Querformat-Einzelseite würde ebenfalls geteilt.
- **Folgen:** Die Redaktion lädt nur PDFs hoch. Große PDFs brauchen beim ersten Öffnen etwas Ladezeit.
- **Ergänzt durch E25** (Jahresordner, andere Dateinamen).

## E12 · Fotogalerie aus einem festen Drive-Ordner
*2026-10-17*

- **Entscheidung:** Unterordner = Alben (`JJJJ-MM Name`, neueste zuerst), lose Bilder = Album „Allgemein“. Vorschaubilder über `thumbnailLink`; schlägt das fehl, wird das Original über die Anmeldung geladen. Kameranamen wie `IMG_2041` werden nicht als Bildunterschrift gezeigt.
- **Folgen:** Pflege komplett in Google Drive.
- **Ergänzt durch E25** (Alben in Jahresordnern).

## E13 · Forum ohne gemeinsame Tabelle
*2026-10-17*

- **Entscheidung:** Jeder Beitrag ist eine eigene Datei des Verfassers (E6); Themen und Antworten werden über `appProperties` verknüpft. Löschen bedeutet: eigene Datei in den Papierkorb.
- **Folgen:** Keine Moderation durch Admins in der App (das würde Schreibrechte auf fremde Dateien erfordern). Unangemessene Beiträge müssen die Verfasser selbst löschen, oder ein Workspace-Admin greift über Google ein. Ist das Forum unerwünscht, gibt es `forum.aktiv = false`.

## E14 · Chat über Google Chat
*2026-10-16*

- **Entscheidung:** Die App zeigt Räume und Nachrichten aus Google Chat und sendet eigene Nachrichten. Für Push-Benachrichtigungen dient die Google-Chat-App.
- **Folgen:** Kein eigener Chat-Server. Funktioniert nur mit Workspace, und das Cloud-Projekt braucht die Chat-API-Konfiguration.
- **Ergänzt durch E30** (Direktnachrichten und Gruppen in der App anlegen).

## E15 · Datenschutz: zwei getrennte Einwilligungen, nachweisbar gespeichert
*2026-10-17 – Anforderung des Auftraggebers*

- **Kontext:** Beim ersten Öffnen sollen eine Datenschutzerklärung und getrennt wählbare Einwilligungen erscheinen. Gefragt wird nach vereinsüblichen Zwecken und nach der Weitergabe an die Deutsche Sängerschaft (Kontakt, Verbandszeitung, DS-Beitrag, allgemeine Zwecke). Die Rückmeldung soll nachvollziehbar vom Google-Nutzer stammen und in einer gemeinsamen Tabelle gesammelt werden.
- **Entscheidung:**
  - Ausdrückliches **Ja/Nein** je Einwilligung, nichts vorausgewählt, Speichern erst nach beiden Antworten. Die App ist auch mit „Nein“ voll nutzbar (Kopplungsverbot).
  - Die Entscheidung ist eine Datei im eigenen Drive des Mitglieds (E6), nur für die Verantwortlichen lesbar. Sie enthält Zeitpunkt, Fassung, Prüfsumme des Wortlauts, Gerät und Verlauf.
  - Die **Sammeltabelle** liegt im Drive der Verantwortlichen, außerhalb freigegebener Ordner, und wird **nur von deren eigenem Konto** geschrieben: automatisch beim Öffnen der App bzw. stündlich per `Einwilligungen.gs`. Die Blätter heißen „Stand“, „Verlauf“ (nur anhängen) und „Fassungen“ (Wortlaut).
  - Wird die Fassung in `config.js` erhöht, fragt die App alle Mitglieder erneut.
- **Folgen:** Kein gemeinsamer beschreibbarer Speicher und keine Ausnahme vom Nur-Lesen-Prinzip für Mitglieder. Die Texte sind ein **Muster** und vom Vorstand zu prüfen. Ein „Nein“ setzt der Vorstand um (die App ändert gemeinsame Daten nicht).

## E16 · Lesbarkeit: Schriftgrößen in vier Stufen
*2026-10-17 – Anforderung: auch Menschen mit schlechten Augen sollen alles erkennen*

- **Entscheidung:** Alle Maße sind in `rem` angegeben. `html[data-schrift]` skaliert in den Stufen 87,5 %, 100 %, 118,75 % und 137,5 %; `js/boot.js` setzt die Stufe vor dem ersten Bild. Raster werden mit `minmax(0, 1fr)` gebaut, lange Wörter dürfen trennen.
- **Folgen:** Neue Gestaltung muss bei 375 px Breite und „Sehr groß“ ohne seitliches Überstehen funktionieren (`tests/layout-check.js`).

## E17 · Navigation: Tab-Leiste auf allen Touch-Geräten
*2026-10-17 – Anforderung: ordentliche Darstellung auf Tablets und Phablets*

- **Kontext:** Die obere Textleiste mit neun Einträgen passte auf großen Handys quer (ca. 930 px) und auf Tablets mit großer Schrift nicht mehr; Einträge wurden abgeschnitten.
- **Entscheidung:** Die Tab-Leiste unten (Start, Termine, Chat, Mitglieder, Mehr) gibt es auf Handys, Phablets und Tablets in jeder Ausrichtung. Ab 700 px stehen die Einträge mittig zusammen. Die Textleiste oben gibt es nur am Computer mit Maus ab 1280 px (`(min-width: 1280px) and (hover: hover) and (pointer: fine)`). Zweispaltige Raster beginnen ab 768 px (iPad hochkant). Seitliche Schutzabstände (`env(safe-area-inset-*)`) gelten für Kameraaussparungen im Querformat. Ist der Bildschirm niedrig (Handy quer), scrollt die Kopfzeile mit.
- **Folgen:** Große Touch-Ziele und dieselbe Bedienung auf allen mobilen Geräten. Alle CSS-Regeln, die von der Tab-Leiste abhängen, verwenden dieselbe Media-Query.

## E18 · Demo-Modus mit erfundenen Daten
*2026-10-16*

- **Entscheidung:** `DemoBackend` mit derselben Schnittstelle wie `GoogleBackend`, fiktiven Personen und Daten. Änderungen bleiben nur im Browser.
- **Folgen:** Die App lässt sich ohne Google-Konto vorführen und testen. Neue Backend-Funktionen müssen in **beiden** Backends umgesetzt werden.

## E19 · Tests gegen einen Nachbau der Google-APIs
*2026-10-16*

- **Kontext:** Es gab (noch) keinen Zugang zu einem echten Workspace, und echte Daten dürfen beim Testen nicht verändert werden.
- **Entscheidung:** `tests/fake-google.js` bildet die benutzten APIs im Browser nach, inklusive Dateieigentümern, `drive.file`-Regeln und Zählung unerlaubter Schreibzugriffe. `tests/google-mock.html` spielt Einrichtung und alle Funktionen durch. `tests/app-mock.html` startet die ganze App gegen den Nachbau.
- **Folgen:** Schnelle, sichere Tests. **Grenze:** Abweichungen der echten APIs, z. B. Längenlimits und Freigabe-Details, fallen erst im Test mit echtem Google auf (siehe ENTWICKLUNG.md, „Offene Punkte“).

## E20 · Mitglieder-Anleitung als erzeugtes PDF mit QR-Code
*2026-10-17*

- **Entscheidung:** `tools/make_anleitung.py <Adresse>` erzeugt ein zweiseitiges PDF (Installation, Anmeldung, Datenschutz, „Was finde ich wo?“) und `qr-code.png`. Ohne Adresse entsteht ein als MUSTER markierter Entwurf ohne QR-Code. Das Skript warnt, wenn Text in die Fußzeile ragt.
- **Folgen:** Die Anleitung lässt sich nach jeder Änderung der App oder der Adresse neu erzeugen. Die Raleway-Schnitte haben eindeutige interne Namen, weil PDF-Betrachter sie sonst verwechseln (kein Fettdruck).

## E21 · Postfach für Adressänderungen ohne Umlaut
*2026-10-17*

- **Kontext:** Gewünscht war „Adressänderung@frankonia-brunonia.de“. Google Workspace erlaubt keine Umlaute in E-Mail-Adressen, und viele Mailprogramme können damit nicht umgehen.
- **Entscheidung:** Voreinstellung `adressaenderung@frankonia-brunonia.de`, änderbar unter `config.adressaenderung` bzw. in der Einrichtung.
- **Folgen:** Das Postfach (oder ein Gruppen-Alias) muss im Workspace mit genau dieser Adresse angelegt werden.

## E22 · Hosting über GitHub Pages
*2026-10-16*

- **Entscheidung:** Veröffentlichung über GitHub Actions (`.github/workflows/pages.yml`). Der Workflow kopiert nur die App-Dateien und setzt die Versionskennung des Service Workers.
- **Folgen:** Kostenlos mit **öffentlichem** Repository. Pages aus einem **privaten** Repository geht nur mit einem kostenpflichtigen GitHub-Tarif (Pro, Team, Enterprise); die veröffentlichte Seite ist auch dann öffentlich erreichbar. Im Code stehen keine Geheimnisse, die Daten schützt Google. Wer das Repository verwaltet, bestimmt den ausgelieferten Code. Das Konto deshalb mit Zwei-Faktor-Anmeldung schützen.
- **Umsetzung (2026-10-17):** öffentliches Repository <https://github.com/janbellin-pixel/fb-app> im **persönlichen GitHub-Konto** des Auftraggebers; Adresse der App <https://janbellin-pixel.github.io/fb-app/> (auch `appUrl` in `config.js`). GitHub und Google Workspace sind voneinander unabhängig; verbunden sind sie nur dadurch, dass die Adresse der App beim OAuth-Client als erlaubte Quelle und Weiterleitung eingetragen ist. Die Adresse lautet `https://<github-name>.github.io/<repository>/`; eine eigene Subdomain der Verbindung ist später per CNAME möglich (dann die Adresse beim OAuth-Client und in `config.js` ändern). Damit die App nicht an einer Person hängt: einen zweiten Verwalter mit Schreibrecht eintragen oder das Repository später in eine kostenlose GitHub-Organisation der Verbindung übertragen.

## E23 · Einrichtung: Vorhandenes verbinden, nur Fehlendes neu anlegen
*2026-10-17 – Anlass: Einrichtung im echten Workspace*

- **Kontext:** Im Workspace gibt es schon den Kalender, die Mitgliederliste und die Ordner mit dem Bundesboten und den Fotos. „Neu anlegen“ ging bisher nur vor jeder Einrichtung und legte dann alles neu an – auch das, was es schon gibt.
- **Entscheidung:** Die Einrichtung trennt **verbinden** (nur die ID eintragen; die App liest) und **„Fehlendes neu anlegen“** (`createMissing`, nur Datenquellen ohne Eintrag). Verbundenes wird dabei weder gelesen noch verändert noch neu freigegeben. Beispieldaten kommen nur in Neues und sind nur beim Start von Grund auf vorausgewählt. Die Berechtigung „Kalender verwalten“ wird nur angefragt, wenn ein neuer Kalender nötig ist. Der Schreibschutz bleibt unverändert: Während des Klicks sind nur die gerade angelegten Ressourcen beschreibbar.
- **Folgen:** Ein erneuter Klick legt nichts doppelt an. Freigaben vorhandener Dateien richten die Verantwortlichen selbst in Google ein; die Prüfung (E24) zeigt, was fehlt.

## E24 · Freigaben vor dem Veröffentlichen prüfen
*2026-10-17*

- **Kontext:** `config.js` ist öffentlich lesbar (GitHub Pages), also auch alle IDs. Geschützt sind die Daten allein durch die Google-Freigaben. Eine Datei mit „Jeder mit dem Link“ wäre damit für jeden lesbar. Außerdem sollen Mitglieder nur lesen dürfen.
- **Entscheidung:** „Verbindung prüfen“ liest (nur lesend) Inhaber, Freigaben und Kalender-Freigaben und meldet: „Jeder mit dem Link“, Bearbeitungsrechte für Gruppe/Domain, fehlenden Lesezugriff der Mitglieder, Inhaber außerhalb der Domain, vertraulich wirkende Spalten und Termine ohne Einladung an die Mitglieder-Gruppe. Kalender-Freigaben nur mit schon erteilter Berechtigung „Kalender verwalten“ (kein neuer Scope). Ablauf: erst lokal verbinden und prüfen (Werte stehen nur im eigenen Browser), dann `config.js` veröffentlichen. Bei der Einrichtung im Workspace der Frankonia-Brunonia wurden zunächst nur Client-ID, Domain, Admins und Datenschutzangaben veröffentlicht. Die IDs von Kalender, Mitgliederliste, Zeitungs- und Fotoordner folgten am 2026-10-18, nachdem ein Abruf ohne Anmeldung gezeigt hatte, dass keine der vier Ressourcen öffentlich erreichbar ist (Tabelle 401, Ordner leiten zur Anmeldung um, öffentliche iCal-Adresse 404). Die Prüfung in der App (Bearbeitungsrechte, vertrauliche Spalten, Einladungen) steht vor dem Verteilen an die Mitglieder noch aus.
- **Folgen:** Probleme fallen vor dem Start auf. Die Spaltenprüfung ist eine Heuristik. Der Testlauf lädt die echte `config.js` nicht.

## E25 · Vorhandene Strukturen tolerant lesen
*2026-10-17*

- **Kontext:** Vorhandene Listen und Ordner sind über Jahre gewachsen und folgen nicht den Namensregeln der App.
- **Entscheidung:**
  - **Adressverzeichnis:** Kopfzeile in den ersten zehn Zeilen suchen (Titelzeilen darüber erlaubt), „Nachname, Vorname“ in einer Spalte, Hausnummer und „PLZ/Ort“ als eigene Spalten. Das Tabellenblatt ist einstellbar (`adressenBlatt`); fehlt das eingetragene Blatt, gibt es einen Fehler statt eines anderen Blattes. Mitglieder werden über die E-Mail-Adresse zugeordnet, sonst über den Namen, aber nur, wenn der Name auf beiden Seiten eindeutig ist.
  - **Zeitung:** PDFs bis zwei Ordnerebenen tief. Das Jahr kommt aus dem Namen oder aus dem Ordner, die Nummer aus „Nr.“, „Heft“ oder „Ausgabe“.
  - **Galerie:** Alben sind Ordner mit Fotos bis zwei Ebenen tief; übergeordnete Ordner erscheinen als Zusatz („Stiftungsfest · 2023“).
  - **Abruf:** gebündelt je Ebene, geteilte Ablagen gezielt mit `corpora=drive&driveId`.
- **Folgen:** Vorhandenes muss nicht umgebaut werden. Grenze: Sehr große Fotoarchive laden alle Angaben auf einmal (ENTWICKLUNG.md, Offene Punkte).

## E26 · Die Zeitung heißt „Bundesbote“
*2026-10-18 – Wunsch der Verbindung*

- **Entscheidung:** Überall, wo Mitglieder es sehen, heißt die Zeitung „Bundesbote“ (mit Beugung: des Bundesboten, im Bundesboten): Menü, Startseite, Titel, Einrichtung, Datenschutzerklärung, App-Beschreibung, Verknüpfung im Startbildschirm-Menü, Mitglieder-Anleitung und Demo-Ausgaben. Technische Namen bleiben `zeitung` (Route `#/zeitung`, `zeitungOrdnerId`, `views/zeitung.js`), damit Links, Einstellungen und Lesezeichen weiter funktionieren.
- **Folgen:** Der Wortlaut der Einwilligung „vereinsübliche Zwecke“ hat sich dadurch geändert. Deshalb steigt `datenschutz.fassung` auf 2, und wer schon geantwortet hat, wird einmal erneut gefragt. „Verbandszeitung“ (die Zeitung der Deutschen Sängerschaft) ist etwas anderes und bleibt.

## E27 · Updates ohne Wartezeit
*2026-10-18*

- **Kontext:** GitHub Pages liefert Dateien mit `Cache-Control: max-age=600`. Browser dürfen eine Datei also zehn Minuten lang ungeprüft weiterverwenden – auch über den „Netz zuerst“-Weg des Service Workers. Eine Korrektur kam deshalb auf dem iPhone zunächst nicht an.
- **Entscheidung:** Der Service Worker fragt App-Code (Seiten, Skripte, Stile, `config.js`, Manifest) immer beim Server nach (`cache: 'no-cache'`; unverändert = kurze 304-Antwort). Bilder, Schriften und `vendor/` dürfen im Zwischenspeicher bleiben. Eine neue Service-Worker-Version übernimmt sofort (`skipWaiting`).
- **Folgen:** Nach dem Neustart der App ist die neueste Version da. Pro Start eine kurze Nachfrage je Code-Datei.

## E28 · Zu- und Absagen auch ohne Einladung
*2026-10-18 – Wunsch der Verbindung: „Es sollen alle zusagen können, egal, ob sie eingeladen sind.“*

- **Kontext:** Google Kalender lässt nur Eingeladene antworten. Eine Mitglieder-Gruppe gibt es (noch) nicht, und die App darf den Kalender der Verbindung nicht ändern (E5) – Mitglieder können sich also nicht selbst als Gast eintragen.
- **Entscheidung:** Ist ein Mitglied eingeladen, bleibt alles wie in E8 (Antwort im eigenen Kalender). Sonst speichert die App die Antwort als kleine eigene Datei im eigenen App-Ordner (`fbTyp=zusage`, `fbTermin=<Termin-ID>`, Beschreibung `{ termin, titel, beginn, status, gaeste, kommentar, zeitpunkt }`), für Mitglieder nur lesbar – wie Profil und Forum (E6). „Wer kommt?“ führt Kalender-Antworten und App-Antworten zusammen; wer geantwortet hat, bestimmt der Dateieigentümer laut Google. Eine offene Kalender-Antwort („keine Antwort“) wird durch eine App-Antwort ersetzt. Je Termin und Mitglied gibt es eine Datei, Änderungen überschreiben sie.
- **Folgen:** Jedes Mitglied kann antworten, ohne neue Berechtigungen und ohne Schreibzugriff auf gemeinsame Daten. App-Antworten sieht man nur in der App, nicht im Google Kalender des Organisators. Die Mitglieder-Gruppe ist damit optional (bringt aber Termine in die eigenen Kalender und Antworten in Google Kalender). Die Terminliste liest App-Antworten der letzten 120 Tage vor Beginn des angezeigten Zeitraums.

## E29 · News der Redaktion direkt in der App
*2026-10-18 – Wunsch der Verbindung: Admins sollen News aus der App heraus schreiben können*

- **Kontext:** Die App darf gemeinsame Daten nicht ändern (E5), also auch nicht die Tabelle „News“. Schreiben über die Tabelle würde außerdem einen breiteren Google-Zugriff verlangen (`drive.file` deckt nur von der App selbst angelegte Dateien ab).
- **Entscheidung:** News sind – wie Forumsbeiträge – **eigene Dateien** der Verfasser im eigenen App-Ordner (`fbTyp=news`, Beschreibung `{ titel, text, kategorie, angeheftet, bild, datum, bearbeitet }`), für Mitglieder nur lesbar. Fotos werden vor dem Hochladen verkleinert (1600 px, JPEG) und als eigene Datei `fbTyp=newsbild` gespeichert (`bild = drive:<ID>`). **Als News zählen nur Dateien, deren Eigentümer laut Google Admin ist oder in `config.redaktion` steht** – andere Mitglieder können sich so nicht als Redaktion ausgeben. Bearbeiten und Löschen nur der eigenen News (Löschen = Papierkorb, samt eigenem Bild). Die Tabelle „News“ wird weiter gelesen und mit den App-News zusammen sortiert (angeheftet zuerst, dann neueste).
- **Folgen:** Keine neuen Berechtigungen, keine neue Schreibregel. Wird jemand aus Admins/Redaktion entfernt, verschwinden seine News aus der App (die Dateien bleiben in seinem Drive). Mehrere Redakteure können nicht gemeinsam an einer News arbeiten. Routen `#/news-neu` und `#/news-bearbeiten/:id`.

## E30 · Private Nachrichten und Gruppen direkt in der App
*2026-10-18 – Wunsch der Verbindung: Mitglieder sollen sich ohne Einrichtung bei Google privat oder in Gruppen schreiben können, auch aus der Mitgliederliste und aus Terminen heraus*

- **Kontext:** Bisher zeigte die App nur Räume, in denen man schon Mitglied ist, und öffnete für neue Direktnachrichten Google Chat. Sich selbst in einen bestehenden Raum aufnehmen erlaubt Google über die Schnittstelle nicht (nur Mitglieder bzw. Verwalter können hinzufügen; auffindbare Räume brauchen eine Bestätigung).
- **Entscheidung:** Zwei zusätzliche OAuth-Scopes (Ausnahme von AGENTS.md, Regel 2): `chat.spaces.create` (Direktnachricht, Gruppe oder benannten Raum anlegen – `spaces.setup`; eine bestehende Direktnachricht liefert Google zurück) und `chat.memberships` (Mitglieder lesen, damit Direktnachrichten und Gruppen mit Namen erscheinen, und Personen hinzufügen). Der Schreibschutz lässt nur zu: `spaces:setup` mit ausschließlich Personen (keine Chat-Apps, keine Google-Gruppen, keine Bot-Direktnachricht) und `spaces/{id}/members` für eine Person. Räume umbenennen oder löschen und Mitglieder entfernen bleiben gesperrt. Wer welchen Raum ergänzen darf, entscheidet Google (man muss selbst Mitglied sein).
- **Oberfläche:** „Nachricht“ im Profil (erreichbar aus der Mitgliederliste und aus „Wer kommt?“ bei Terminen) öffnet bzw. legt die Direktnachricht an. Im Chat gibt es „Neue Nachricht“, „Neue Gruppe“ (mit Namen = Raum, ohne Namen = Gruppenunterhaltung) und in Gruppen/Räumen „Personen“. Ist das Verzeichnis leer, kann man eine E-Mail-Adresse der Domain eingeben.
- **Folgen:** Jedes Mitglied bestätigt die zusätzlichen Rechte einmal bei Google. Namen in Direktnachrichten kommen aus dem Google-Verzeichnis (Kontaktfreigabe nötig); für selbst angelegte Unterhaltungen merkt sich das Gerät den Namen zusätzlich (`fb.chatNamen`). Bestehende Räume ohne eigene Mitgliedschaft lassen sich weiterhin nicht selbst betreten.
