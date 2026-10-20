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
- **Ergänzt 2026-10-18 (Wunsch der Verbindung):** Oben im Profil steht immer sichtbar „Bitte teile uns Adressänderungen per E-Mail mit“ mit dem Knopf **„Adressänderung per E-Mail mitteilen“**. Er öffnet eine E-Mail an `config.adressaenderung` – als Vorlage zum Ausfüllen (`adressaenderungMail()`) bzw. mit den Abweichungen, die unter „Anschrift und Kontakt“ eingetragen sind.
- **Ergänzt 2026-10-18:** Unter „Anschrift und Kontakt“ füllt **„Aus Adressverzeichnis übernehmen“** die Felder wieder mit dem Stand des Adressverzeichnisses (eigene Eingaben dort werden verworfen; Kneipname, Status und Rezeption im Profil nur, wo noch nichts steht). Findet die App den eigenen Eintrag nicht eindeutig (z. B. private E-Mail-Adresse und anderer Vorname im Verzeichnis), wählt das Mitglied ihn aus einer Liste (vorgefiltert nach dem Nachnamen) – nur für diesen Abgleich, gespeichert wird die Wahl nicht. Status-Werte vergleicht die App tolerant (`statusKey()`: Groß/klein egal, „Bursch“ = „Bursche“), damit die ältere Schreibweise im Verzeichnis nicht als Abweichung gilt.
- **Ergänzt 2026-10-20:** Im `mailto:`-Link stehen nur ASCII-Zeichen (Umlaute als ae/oe/ue/ss), weil manche E-Mail-Apps Umlaute darin falsch entschlüsseln (E37).

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
- **Ergänzt durch E25** (Jahresordner, andere Dateinamen) und **E31** (Leser ausgelagert nach `js/views/reader.js`, auch für die Liedermappe; „Zu Seite …“ und PDF-Lesezeichen als Inhalt) und **E39** (Reihenfolge allein nach dem Dateinamen).

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
- **Ergänzt durch E30** (Direktnachrichten und Gruppen in der App anlegen), **E33** (News im Chat ankündigen), **E34** (Benachrichtigungen) und **E35** (eigene Nachrichten über die Konto-ID).

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

- **Entscheidung:** `tools/make_anleitung.py <Adresse>` erzeugt ein dreiseitiges PDF (Installation, Anmeldung, Datenschutz · „Was finde ich wo?“ · „Was steckt dahinter?“) und `qr-code.png`. Ohne Adresse entsteht ein als MUSTER markierter Entwurf ohne QR-Code. Das Skript warnt, wenn Text in die Fußzeile ragt.
- **Folgen:** Die Anleitung lässt sich nach jeder Änderung der App oder der Adresse neu erzeugen. Die Raleway-Schnitte haben eindeutige interne Namen, weil PDF-Betrachter sie sonst verwechseln (kein Fettdruck).
- **Ergänzt 2026-10-20:** Dritte Seite „Was steckt dahinter?“: Die App ist nur eine Oberfläche für den Google Workspace, alles ist auch ohne sie erreichbar; dazu, warum das sicher ist, der Hinweis auf Tablets und die Hilfe durch die Aktiven. Beim Anmelden steht nur, dass Google beim ersten Mal ein neues Passwort verlangt – wie das Startpasswort gebildet wird, steht bewusst nicht in der Anleitung, weil sie öffentlich im Repository liegt.

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
  - **Zeitung:** PDFs bis zwei Ordnerebenen tief. Das Jahr kommt aus dem Namen oder aus dem Ordner, die Nummer aus „Nr.“, „Heft“ oder „Ausgabe“ (weitere Namensformen und Reihenfolge: E39).
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

## E31 · Liedermappe aus einem Drive-Ordner, Leseansicht wie beim Bundesboten
*2026-10-18 – Wunsch der Verbindung: die digitale Liedermappe (Noten) analog zum Bundesboten in der App*

- **Kontext:** Die Noten liegen in einem Google-Drive-Ordner der Verbindung. Wie die Dateien benannt und gegliedert sind (einzelne PDFs, Scans, Unterordner, Nummern), war beim Bau nicht bekannt. Gesungen wird meist am Handy, auf der Kneipe auch bei schlechtem Empfang.
- **Entscheidung:** Ordner `config.liedermappeOrdnerId`, nur lesen; freiwillig (leer = Liedermappe ausgeblendet). Angezeigt werden PDFs und Bilder (JPG, PNG, WebP, GIF) bis drei Ordnerebenen tief, Unterordner = Rubriken. Nummer und Titel kommen aus dem Dateinamen („012 Titel.pdf“, „12 - Titel“, „Nr. 12 Titel“, „Titel (Nr. 12)“; `songFromFile()` in `common.js`). Laufen die Nummern durch die ganze Mappe, zeigt die App eine Liste nach Nummer mit der Rubrik als Untertitel; fängt jede Rubrik neu an oder gibt es keine Nummern, gliedert sie nach Rubriken (`songsGrouped()`). Suche nach Titel, Nummer und Rubrik; Nummer eintippen und Enter öffnet das Lied direkt. Andere Dateien (Word, MuseScore, HEIC) zählt die App und verweist dafür auf Google Drive; die Prüfung in der Einrichtung nennt sie.
- **Leser:** derselbe wie beim Bundesboten, herausgelöst nach `js/views/reader.js` (`openReader()`): eine Seite, Umblättern, Zoom. Anders als beim Bundesboten werden Querformat-Seiten **nicht** geteilt (Noten dürfen nicht zerschnitten werden) und es gibt keine festen Umschlagseiten. Ein einzelnes Blatt erscheint ohne Umblättern, bei breiter Fläche (Handy quer, Computer) auf volle Breite mit senkrechtem Scrollen. Solange ein Lied offen ist, bleibt der Bildschirm an (Screen Wake Lock, wo der Browser es kann). Längere PDFs bekommen „Zu Seite …“ und, falls vorhanden, ihre Lesezeichen als Inhalt – das gilt auch für den Bundesboten.
- **Offline:** Geöffnete Lieder bleiben im Cache-Speicher `fb-lieder` (wie `fb-zeitung`, gemeinsamer Helfer `keptFile()`); „Alle Lieder speichern“ lädt die ganze Mappe auf das Gerät. Zuletzt geöffnete Lieder stehen oben (`fb.lieder.zuletzt`, nur auf dem Gerät).
- **Navigation:** Kachel im Schnellzugriff, Eintrag unter „Mehr“, Verknüpfung am App-Symbol (Manifest). Bewusst **nicht** in der Textleiste am Computer: Sie ist bei „Sehr groß“ schon voll (E17), und die Liedermappe wird vor allem am Handy genutzt.
- **Folgen:** Keine neuen Berechtigungen (`drive.readonly` genügt), keine neue Schreibregel. Gepflegt wird direkt in Google Drive (Liederwart). „Fehlendes neu anlegen“ legt bei Bedarf einen leeren, nur lesbar freigegebenen Ordner „Liedermappe“ an. Grenzen: Drive-Verknüpfungen (Shortcuts) und Google-Dokumente zeigt die App nicht an.

## E32 · Weitere Links im Schnellzugriff (z. B. das Wiki)
*2026-10-18 – Wunsch der Verbindung: ein Link zum Wiki als Schaltfläche wie die anderen im Schnellzugriff*

- **Entscheidung:** Liste `config.links` (`[{ titel, url, symbol? }]`) statt einer festen Wiki-Adresse, damit weitere Angebote der Verbindung ohne Programmänderung dazukommen können. Angezeigt werden nur vollständige `https`-Adressen mit Titel (`extraLinks()` in `js/config.js`): als Kachel im Schnellzugriff und als Eintrag unter „Mehr“ mit dem Hinweis „öffnet sich außerhalb der App“ (`target="_blank" rel="noopener"`).
- **Nicht eingebettet:** Die CSP bleibt unverändert (`frame-src 'none'`). Die App gibt dem fremden Angebot keine Daten und keine Anmeldung weiter; die Datenschutzerklärung nennt die Links und dass dort deren eigene Hinweise gelten.
- **Folgen:** Für das Wiki gilt dessen eigene Anmeldung. Eingetragen ist `https://frbr-bookstack.cubiga.to/login`.

## E33 · Neue News im Chat ankündigen
*2026-10-18 – Wunsch der Verbindung: Mitglieder sollen von neuen News erfahren, auch wenn die App geschlossen ist*

- **Kontext:** Die App hat keinen eigenen Server (E3) und kann deshalb keine Push-Nachrichten verschicken. Google Chat dagegen benachrichtigt auf dem Handy zuverlässig – auch wenn unsere App zu ist.
- **Entscheidung:** Beim Schreiben einer News (nur neue, nicht beim Bearbeiten) kann die Redaktion **„Im Chat ankündigen“** ankreuzen und einen Raum oder eine Gruppe wählen, in der sie selbst ist. Die App schickt dann als **eigene Nachricht** der Verfasserin bzw. des Verfassers Titel, Anfang des Textes und den Link zur News. Das Kästchen ist jedes Mal aus und muss bewusst gesetzt werden; vorgeschlagen wird der zuletzt gewählte Raum (`fb.newsRaum`) bzw. `config.chat.newsRaum`.
- **Folgen:** Keine neue Berechtigung und keine neue Schreibregel (eigene Chat-Nachricht, E14). Wer im Raum ist und die App „Google Chat“ nutzt, bekommt eine Benachrichtigung; stummschalten lässt sich der Raum wie jeder andere in Google Chat. Klappt die Ankündigung nicht (z. B. kein Mitglied des Raums), bleibt die News veröffentlicht und die App meldet den Fehler.

## E34 · Benachrichtigungen nur nach Einschalten, ohne eigenen Server
*2026-10-18 – Wunsch der Verbindung: über neue News und Direktnachrichten informiert werden – aber nur, wenn man das in der App aktiv auswählt*

- **Kontext:** Push-Nachrichten bei geschlossener App brauchen einen Absender, der sie über die Push-Dienste der Browser verschickt (Web Push mit VAPID). Den gibt es bewusst nicht (E3). Private Nachrichten könnte ein solcher Absender ohnehin nicht lesen.
- **Entscheidung:** Ein Schalter **„Benachrichtigungen“** (Mehr › Einstellungen, auch im Chat) – je Gerät und Konto, Standard **aus**. Ausgeschaltet fragt die App nichts ab und zeigt nichts an. Eingeschaltet prüft `js/lib/hinweise.js`, solange die App geöffnet ist, jede Minute die Unterhaltungen (im Hintergrund alle drei Minuten) und alle fünf Minuten die News: Zahlen am Chat und an „Mehr“/News und am App-Symbol (Badging API), Markierungen in den Listen, Hinweise in der App und – nur mit Erlaubnis des Browsers – Mitteilungen des Systems; antippen öffnet die Unterhaltung bzw. News (`notificationclick` im Service Worker). Gezählt wird ab dem Einschalten; Ungelesenes erkennt die App am Zeitpunkt der letzten Nachricht (`lastActive`) und an deren Absender (`latestMessage()`), eigene Nachrichten zählen nicht. Viele Neuigkeiten auf einmal werden zu einem Hinweis zusammengefasst. Bei (fast) abgelaufener Anmeldung, offline und während der Datenschutz-Abfrage wird nicht geprüft.
- **Bei geschlossener App:** die App „Google Chat“ (Direktnachrichten und Ankündigungen nach E33) – Hinweis mit Links im Chat und in den Einstellungen.
- **Nicht umgesetzt:** Web Push über ein Google-Apps-Script im Konto eines Admins. Möglich wäre es für News, Forum und Termine (nicht für Direktnachrichten), braucht aber dort eingerichtete Schlüssel und einen Zeitauslöser, eine eigene Krypto-Umsetzung (Apps Script kennt kein ES256/AES-GCM) und die Speicherung der Push-Adressen der Geräte. Erst nach Rückfrage bei der Verbindung.
- **Folgen:** Was gelesen ist, steht nur auf dem Gerät (`fb.gelesen.<email>`, `fb.benachrichtigungen.<email>`); die Datenschutzerklärung nennt das. Keine neuen Berechtigungen.

## E35 · Eigene Chat-Nachrichten über die Google-Konto-ID erkennen
*2026-10-18 – Beim Bau von E34: Ohne Kontaktfreigabe fehlt das eigene Konto im Verzeichnis*

- **Kontext:** Die App erkannte eigene Nachrichten bisher daran, dass die Absender-ID zum eigenen Eintrag im Google-Verzeichnis passt. Ohne Kontaktfreigabe (oder ohne Berechtigung) ist das Verzeichnis leer – dann standen eigene Nachrichten als „Mitglied“ auf der falschen Seite und hätten als ungelesen gezählt.
- **Entscheidung:** `myId()` im Google-Backend nimmt die Konto-ID aus der Anmeldung (`sub` aus `userinfo`, gespeichert als `user.id`), sonst aus dem Verzeichnis, sonst einmal aus dem Google-Profil. Sie ist dieselbe ID wie in `users/{id}` bei Google Chat.
- **Folgen:** Keine neue Berechtigung (`openid` war schon dabei). Für Konten, die vor dieser Änderung angemeldet waren, wird die ID einmal nachgeladen.

## E36 · Bildschirmtastatur: Chat verkleinert sich statt nach oben zu rutschen
*2026-10-18 – Rückmeldung der Verbindung: Beim Tippen im Chat verschwand am Handy der Text nach oben*

- **Kontext:** Viele Browser verkleinern die Seite nicht, wenn die Bildschirmtastatur aufgeht, sondern schieben sie nach oben, damit das Eingabefeld sichtbar bleibt (Android Chrome seit Version 108, iPhone immer). Der Chat war mit `100dvh` genau so hoch wie der Bildschirm; mit offener Tastatur rutschten Kopf und Nachrichten aus dem Bild. Auch `100dvh` berücksichtigt die Tastatur meist nicht.
- **Entscheidung:** `js/lib/tastatur.js` misst den tatsächlich sichtbaren Bereich (VisualViewport) und stellt ihn als `--vvh`/`--vv-top` bereit; solange auf einem Touch-Gerät ein Textfeld die Tastatur geöffnet hat (sichtbare Höhe deutlich kleiner als ohne Tastatur), trägt `<body>` die Klasse `keyboard-open`. Dann ist die Tab-Leiste ausgeblendet; im Chat füllt das Chatfenster genau den sichtbaren Bereich über der Tastatur (`position: fixed`), mit seinem Kopf (Zurück, Name) oben, dem Eingabefeld unten und den Nachrichten dazwischen; die Kopfzeile der App ist solange ausgeblendet. Die Nachrichtenliste bleibt bei der neuesten Nachricht (ResizeObserver). Hinweise erscheinen über der Tastatur.
- **Verworfen:** `interactive-widget=resizes-content` im Viewport-Tag – wirkt nur in Chrome für Android, nicht auf dem iPhone, und hätte das Verhalten aller Seiten geändert.
- **Folgen:** Kein Einfluss auf Computer (keine Bildschirmtastatur). Auf echten Geräten (iPhone, Android, installiert und im Browser) prüfen; im Test lässt sich das Verhalten nur nachstellen.

## E37 · Adressänderungs-Mail: Link nur mit ASCII-Zeichen
*2026-10-20 – Rückmeldung der Verbindung: In Yahoo Mail kam die vorbereitete E-Mail mit Zeichensalat an („f%3%Cr“ statt „für“)*

- **Kontext:** Die Knöpfe für Adressänderungen öffnen die E-Mail über einen `mailto:`-Link. Betreff und Text stehen darin prozentkodiert (UTF-8, RFC 6068). Yahoo Mail entschlüsselt davon nur Codes, die mit einer Ziffer beginnen (`%0A`, `%20`, `%3A` …). Umlaute, „ß“, „•“ und „–“ bestehen aus Bytes wie `%C3` bzw. `%E2` und kamen als „f%3%Cr“, „Stra%3�e“ oder „%2�%2“ an. Gmail, Apple Mail und Outlook zeigen sie richtig. Welche E-Mail-App ein Mitglied nutzt, kann die App nicht erkennen.
- **Entscheidung:** Im Link stehen nur ASCII-Zeichen (`mailAscii()` in `js/lib/adressabgleich.js`): Umlaute als ae/oe/ue, ß als ss, typografische Anführungszeichen, Striche und Aufzählungspunkte als `"`, `'` und `-`; andere Akzente entfallen (é → e), seltene andere Schriftzeichen (z. B. chinesische) bleiben. „Text kopieren“ übernimmt Betreff und Text unverändert mit Umlauten. Ein Hinweis bei den Knöpfen sagt beides.
- **Verworfen:** Ein Gmail-Link zum Verfassen (öffnet am Handy nicht verlässlich die Gmail-App) und Senden über die Gmail-API (bräuchte eine neue Berechtigung).
- **Folgen:** Die E-Mail kommt in jedem E-Mail-Programm lesbar an. Namen und Anschriften stehen darin ohne Umlaute (z. B. „Strasse“). Der Schriftwart trägt sie mit Umlauten ins Verzeichnis ein. Wer den genauen Text braucht, nutzt „Text kopieren“.

## E38 · DS-Zeitung als zweites Zeitungsarchiv
*2026-10-20 – Wunsch der Verbindung: Leser und Schaltfläche für die DS-Zeitung analog zum Bundesboten*

- **Kontext:** Die Verbindung legt die Ausgaben der DS-Zeitung (Zeitung der Deutschen Sängerschaft) als PDFs in einen eigenen Google-Drive-Ordner. Mitglieder sollen sie wie den Bundesboten in der App lesen.
- **Entscheidung:** Ordner `config.dsZeitungOrdnerId`, nur lesen; freiwillig (leer = ausgeblendet, wie die Liedermappe, E31). Archiv und Leser sind dieselben wie beim Bundesboten: `js/views/zeitung.js` mit eigenen Texten je Zeitung, Route `#/ds-zeitung`, Leser aus `reader.js`. Im Backend nimmt `listIssues(quelle)` die Zeitung als Parameter (`'bundesbote'` als Standard, `'ds'`); Ordner, Fehlermeldung und Ablage stehen in `ZEITUNGEN` (`js/backend/common.js`). Jede Ausgabe trägt `quelle`; `loadIssue()` legt sie im Cache-Speicher `fb-zeitung` unter eigenem Präfix ab. Dateinamen wie beim Bundesboten („2026-2 DS-Zeitung.pdf“, auch Jahresordner, E25; Reihenfolge allein nach dem Dateinamen, E39). Die Ersatz-Titelseite (ohne Vorschaubild) zeigt „DS-Zeitung“ ohne das Wappen der Verbindung.
- **Navigation:** Kachel im Schnellzugriff (eigenes Zeitungssymbol `newspaper`) und Eintrag unter „Mehr“. Nicht in der Textleiste am Computer (E17) und nicht als Verknüpfung am App-Symbol – das Manifest hat schon vier.
- **Folgen:** Keine neuen Berechtigungen (`drive.readonly` genügt), keine neue Schreibregel. Gepflegt wird direkt in Google Drive; der Ordner muss für die Mitglieder (Domain bzw. Gruppe) als Betrachter freigegeben sein. Die Einrichtung kennt den Ordner als achte Datenquelle (freiwillig; „Fehlendes neu anlegen“ legt bei Bedarf einen leeren, nur lesbar freigegebenen Ordner an). Demo: zwei erfundene Ausgaben aus `tools/make_demo_ds.py`. Die Datenschutzerklärung nennt die DS-Zeitung; die Einwilligungstexte bleiben gleich, daher keine neue Fassung.

## E39 · Reihenfolge der Zeitungsausgaben allein nach dem Dateinamen
*2026-10-20 – Rückmeldung der Verbindung: In der DS-Zeitung stand nicht die neueste Ausgabe oben; „das richtet sich nach dem Dateinamen, nicht nach dem Datum des Uploads“*

- **Kontext:** Jahr und Nummer las die App nur aus Namen wie „2026-2 …“ (bzw. „Nr.“, „Heft“, „Ausgabe“ mit Jahr). Bei anderen Namen entschied das Datum des Hochladens. Wer ein Archiv auf einmal hochlädt oder alte Ausgaben nachreicht, bekam so eine falsche Reihenfolge – als „neueste Ausgabe“ erschien die zuletzt hochgeladene Datei.
- **Entscheidung:** Die Reihenfolge richtet sich allein nach dem Dateinamen (`datumAusName()`, `ausgabeAusName()`, `sortIssues()` in `js/backend/common.js`), für Bundesbote und DS-Zeitung:
  - Ein vollständiges Datum hat Vorrang, bei mehreren das letzte (die Dateien der DS-Zeitung tragen das Datum am Ende): „26.11.2025“, „26.11.25“, „2025-11-26“, „20251126“, „26112025“. Dann zählt auch der Tag.
  - Sonst Jahr und Nummer an beliebiger Stelle im Namen: „2026-2“, „2-2026“, „2026_02“, „202602“, „Nr. 2“ / „Heft 2“ / „Ausgabe 2“.
  - Sonst Monat oder Jahreszeit neben dem Jahr: „März 2026“, „Herbst 2026“ (Frühjahr = 3, Sommer = 6, Herbst = 9, Winter = 12). „2025-26“ gilt als Studienjahr, nicht als Nummer.
  - Fehlt das Jahr im Namen, zählt weiter der Jahresordner (E25).
  - Lässt sich nichts davon erkennen, entscheiden die Zahlen im Namen (Zahl für Zahl von vorn: „… 12“ vor „… 9“), danach der Name selbst. Das Upload-Datum zählt nur noch bei gleichem Namen.
  - Sechsstellige Kurzdaten („261125“) sind mehrdeutig (TTMMJJ oder JJMMTT) und zählen nur als Zahl.
- **Folgen:** Dateinamen sollten ein Datum oder Jahr und Nummer (bzw. Monat) tragen – wie bisher empfohlen, aber in mehr Schreibweisen. Die App zeigt dann „26.11.2025“, „März 2026“ oder „Ausgabe 3/2026“. Tests mit absichtlich verkehrter Upload-Reihenfolge in `tests/google-mock.js`.

## E40 · Sichtbarkeit selbst wählen, Mitgliederliste „Nur App-Nutzer“
*2026-10-20 – Wunsch der Verbindung: Mitglieder sollen selbst entscheiden, ob andere sie sehen – abgefragt mit der Datenschutzerklärung –, und die Mitgliederliste soll standardmäßig nur zeigen, wer die App schon genutzt hat*

- **Kontext:** Die Mitgliederliste zeigte alle Konten des Google-Verzeichnisses, auch frisch angelegte, die die App nie geöffnet haben. Wer im Google-Verzeichnis steht, legt nur ein Super-Admin fest (Verzeichnisfreigabe je Nutzer); Mitglieder selbst können das nicht. Die App sieht nicht, wer sich wann angemeldet hat.
- **Entscheidung:**
  - **Abfrage:** Als dritter Punkt der Datenschutz-Abfrage (`einwilligungen()`, id `sichtbar`) wählt jedes Mitglied „Ja, sichtbar“ oder „Nein, nicht anzeigen“; änderbar unter Mehr → Datenschutz. Fassung 3, damit alle beim nächsten Öffnen gefragt werden. Die Wahl steht im Nachweis der Einwilligung (`sichtbar`), in der Übersicht der Verantwortlichen (Filter „Nicht sichtbar“) und in der Sammeltabelle (Spalte „Sichtbar in der App“, im Verlauf am Ende).
  - **Eigene Datei:** Beim Speichern legt die App „Sichtbarkeit (Mitglieder-App).json“ im eigenen Drive an (`fbTyp=sichtbarkeit`, `{ sichtbar, geaendert }`), für die Mitglieder lesbar, auch bei „Nein“. Ihr Vorhandensein heißt: hat die App genutzt. Identität = Dateieigentümer (E3), gefälschte Dateien anderer wirken nicht.
  - **Wirkung von „Nein“:** Das Mitglied fehlt in der Mitgliederliste (auch bei „alle zeigen“) und als Profilseite; die Freigaben des eigenen Profils werden zurückgenommen (neu angelegte Profile bleiben privat), bei „Ja“ wieder gesetzt. Wo man selbst handelt (Chat, Forum, Zusagen), steht der Name weiter. Man selbst sieht sich immer.
  - **„Nur App-Nutzer“:** Schalter in der Mitgliederliste, standardmäßig an (auf dem Gerät gemerkt); aus = auch Konten ohne Sichtbarkeits-Datei.
  - **Google-Verzeichnis:** bleibt unberührt – ausblenden kann dort nur ein Super-Admin von Hand (Nutzer → Nutzerinformationen → Verzeichnisfreigabe). Kein Admin-Skript, auf Wunsch der Verbindung.
- **Verworfen:** Die Wahl automatisch ins Google-Verzeichnis übernehmen (bräuchte eine Admin-Berechtigung und würde gemeinsame Daten ändern, Regel 1); die Einwilligungs-Datei als Kennzeichen (nur für Verantwortliche lesbar).
- **Folgen:** Kein neuer Scope; die Schreibregeln für eigene Dateien (anlegen, ändern, Freigabe setzen und zurücknehmen) genügen, Tests positiv und negativ. Direkt nach dem Update zeigt „Nur App-Nutzer“ nur, wer die neue Abfrage schon beantwortet hat. Bereits eingerichtete Apps-Scripts (`apps-script/Einwilligungen.gs`) müssen den neuen Stand übernehmen (Spalte „Sichtbar in der App“).

## E41 · Bereiche je Google-Gruppe ausblenden (Kennungsdateien)
*2026-10-20 – Wunsch der Verbindung: Chordamen und Verkehrsgäste sehen kein Adressverzeichnis; Gäste (dazu gehört der Chor) sehen kein Adressverzeichnis, kein Forum, kein Wiki und keine Galerie*

- **Kontext:** Die Konten der Verbindung liegen in Google-Gruppen (`bundesbrueder@`, `chordamen@`, `verkehrsgaeste@`, `gaeste@`). Die Gruppenmitgliedschaft des eigenen Kontos kann eine Web-App mit Nutzerrechten nicht abfragen: Die Directory API braucht Admin-Rechte, die Cloud-Identity-Abfrage der eigenen Gruppen gibt es nur in teureren Tarifen und bräuchte einen neuen Scope.
- **Entscheidung:**
  - **Kennungsdateien:** Die Einrichtung („Fehlende Gruppen-Kennungen anlegen“ bzw. „Fehlendes neu anlegen“) legt je Gruppe aus `config.gruppen.adressen` eine kleine Datei an (`fbTyp=gruppe`, `fbGruppe=<Schlüssel>`), in „Meine Ablage“ des Admins, **nur für diese Gruppe** lesbar (ohne Benachrichtigung). `myGroups()` zählt die lesbaren Kennungen; nur Dateien von Admins (Inhaber laut Google, E3), sonst könnte jedes Mitglied Kennungen fälschen. Admins besitzen alle Kennungen und sehen alles.
  - **Bereiche:** `config.gruppen.ohne` nennt je Bereich (`termine, chat, mitglieder, adressen, news, forum, zeitung, dsZeitung, lieder, galerie`) die Gruppen, die ihn nicht sehen; Links sperrt `links[].ohne`. Gesperrt ist ein Bereich nur, wenn **keine** der eigenen Gruppen ihn sehen darf (Bundesbruder und Gast → sieht alles); ohne bekannte Gruppe ist nichts gesperrt. Ausgeblendet werden Navigation, Kacheln und Abschnitte der Startseite, Einträge unter „Mehr“, der Link „Im Adressverzeichnis suchen“ und der Adressabgleich im Profil; ein direkter Aufruf führt zur Startseite. Die Mitgliederliste liest das Adressverzeichnis dann nicht.
  - **Speicher:** Die Gruppen merkt sich das Gerät (`fb.gruppen.<email>`), damit die Oberfläche sofort und offline passt; bei jedem Start fragt die App neu (Zwischenspeicher 30 Minuten).
- **Verworfen:** Neuer Scope `cloud-identity.groups.readonly` (Tarif, Regel 2); Gruppen aus dem Inhalt einer Datei oder Tabelle (fälschbar bzw. eine weitere Liste zu pflegen); nur über die Freigaben der Daten (Forum und Wiki haben keine eigene Freigabe).
- **Folgen:** Kein neuer Scope, keine neue Schreibregel (eigene Dateien anlegen und lesbar freigeben). Das Ausblenden ist **Oberfläche**: Wirklich geschützt sind Daten über ihre Drive-Freigaben (Adressverzeichnis nur für `bundesbrueder@`, Galerie nicht für `gaeste@`). Forumsbeiträge sind weiterhin für die Domain freigegeben – über Google Drive könnten Gäste sie technisch finden. Neue Konten ohne Gruppe sehen alles, bis sie einer Gruppe angehören. Die Verbindungsprüfung meldet fehlende oder zu weit freigegebene Kennungen.
