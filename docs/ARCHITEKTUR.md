# Technischer Aufbau

> Für die Weiterentwicklung siehe [ENTWICKLUNG.md](ENTWICKLUNG.md) (Leitfaden) und [ENTSCHEIDUNGEN.md](ENTSCHEIDUNGEN.md) (Begründungen).

## Grundidee

Die Mitglieder-App ist eine **Progressive Web App (PWA)**: eine Web-App, die sich wie eine normale App auf iPhone, Android und PC installieren lässt. Es gibt **keinen eigenen Server**. Die App spricht direkt mit den Google-Schnittstellen, angemeldet mit dem Google-Konto des Mitglieds. Wer was sehen darf, regeln die **Freigaben in Google**.

**Leitlinie:** Die App dient der Information und dem Austausch. Gemeinsame Daten werden nur **gelesen**. Schreiben darf jedes Mitglied ausschließlich **eigene** Daten (eigene Zu-/Absage, eigenes Profil, eigene Forumsbeiträge, eigene Datenschutz-Einwilligung und Sichtbarkeit, eigene Papierpost-Wahl, eigene Push-Anmeldung, eigene Chat-Hinweise für Push, eigene Chat-Nachrichten). Siehe [Schreibschutz](#schreibschutz).

```
Handy / PC (PWA)  ──OAuth 2.0──▶  Google-Konto des Mitglieds
       │
       ├─ Google Calendar API   Termine lesen; eigene Antwort im eigenen Kalender
       ├─ Google Sheets API     nur lesen: News, Adressverzeichnis
       ├─ Google Drive API      lesen: Zeitungs-PDFs, Galerie, News-Bilder, Anhänge
       │                        eigene Dateien: Profil, Forum, Zusagen, Einwilligung,
       │                        Sichtbarkeit, Papierpost-Wahl, Push-Anmeldung, Chat-Hinweise
       ├─ People API            Workspace-Verzeichnis (Namen, Fotos)
       └─ Google Chat API       Räume lesen, eigene Nachrichten
GitHub Pages: liefert nur die statischen App-Dateien aus
Push (optional, E50/E51): apps-script/Push.gs im Konto eines Admins liest Neues und die Chat-Hinweise
       (wem jemand aus der App geschrieben hat, ohne Inhalt) und schickt Mitteilungen verschlüsselt
       über den Push-Dienst des Browser-Herstellers an die angemeldeten Geräte
```

Es gibt **keinen Build-Schritt**: reines HTML, CSS und JavaScript (ES-Module). Bibliotheken liegen im Ordner `vendor/`; zur Laufzeit hängt nichts von fremden Servern ab, auch nicht die Schriften.

## Ordner

| Pfad | Inhalt |
|---|---|
| `index.html`, `manifest.webmanifest`, `sw.js` | App-Hülle, PWA-Manifest, Service Worker (Offline, Updates) |
| `config.js` | Öffentliche Konfiguration: nur, was vor der Anmeldung gebraucht wird (Client-ID, Domain, ID der privaten Konfiguration, Demo-Schalter, Angaben der Datenschutzerklärung). Alles Weitere liegt als `config_private.json` in Google Drive, nur für Konten der Domain lesbar; die App lädt und prüft sie nach der Anmeldung (E43, `js/lib/konfiguration.js`) |
| `css/app.css` | Gestaltung; alle Größen in `rem`, damit die Schriftgröße-Stufen alles mitskalieren |
| `js/boot.js` | setzt die gewählte Schriftgröße schon vor dem ersten Bild (kein Springen) |
| `js/app.js`, `js/router.js` | Start, Anmeldefluss, Navigation (Hash-Routen wie `#/termin/<id>`) |
| `js/auth.js` | Google-Anmeldung (OAuth 2.0, Weiterleitung, stille Erneuerung) |
| `js/google/*.js` | dünne Hüllen um die Google-APIs |
| `js/google/guard.js` | **Schreibschutz**: prüft jede ändernde Anfrage, bevor sie das Gerät verlässt |
| `js/backend/google-backend.js` | Echtbetrieb: alle Funktionen auf Google abgebildet |
| `js/backend/demo-backend.js`, `demo-data.js` | Demo-Modus mit fiktiven Daten, gleiche Schnittstelle |
| `js/backend/common.js` | Datenmodell, Tabellen-Spalten, Auswertungen |
| `js/views/*.js` | die einzelnen Seiten (u. a. `galerie.js` für die Fotogalerie, `datenschutz.js` für Erklärung, Einwilligungen und Übersicht) |
| `js/lib/datenschutz.js` | Wortlaut der Datenschutzerklärung und der Einwilligungen (Muster), Fassung, Prüfsumme |
| `js/lib/einwilligungsliste.js` | Aufbau und Abgleich der vertraulichen Sammeltabelle |
| `js/lib/adressabgleich.js` | Abgleich „Mein Profil“ ↔ Adressverzeichnis, E-Mail-Entwurf für Adressänderungen |
| `AGENTS.md`, `CLAUDE.md` | verbindliche Kurzregeln für KI-Assistenten |
| `js/lib/*.js` | weitere Hilfen: Datum, Text/Markdown, Export (ICS/vCard), Speicher, Schriftgröße, Einrichtung |
| `vendor/` | PDF.js 6.3 (Apache 2.0), StPageFlip 2.0.7 (MIT, lokal korrigiert: E49), qrcode-generator 2.0.4 (MIT) |
| `assets/` | Wappen, Skyline, Icons, Schriften (Raleway, UnifrakturMaguntia – OFL), Demo-Zeitungen und -Fotos |
| `apps-script/Automatik.gs` | optional, läuft im Konto des Kalender-Inhabers: App-Link und Gruppe in neue Termine |
| `apps-script/Einwilligungen.gs` | optional, läuft im Konto der Datenschutz-Verantwortlichen: sammelt die Einwilligungen stündlich in die Sammeltabelle |
| `apps-script/Push.gs` (+ `Push.appsscript.json`) | optional, läuft im Konto eines Admins: alle 10 Minuten Push-Mitteilungen bei neuen News, Forumsbeiträgen und Terminen (E50), jede Minute „Direktnachricht“, „Gruppennachricht“ oder „Bierjunge!“ (mit Absender: „… hat dir einen angehängt!“) aus den Chat-Hinweisen (E51); nur Lese-Rechte |
| `apps-script/DsZeitung.gs` (+ `DsZeitung.appsscript.json`) | optional, läuft im Konto eines Admins: holt täglich neue Ausgaben der DS-Zeitung von der Website der Deutschen Sängerschaft in den Drive-Ordner (E55); legt nur neue Dateien an, ändert und löscht nichts |
| `tests/` | Nachbau der Google-APIs und automatische Tests |
| `tools/` | Hilfsskripte (lokaler Server, Grafiken, Demo-Daten, Service-Worker-Liste, Anleitung mit QR-Code) |

## Daten in Google

| Funktion | Speicherort | Rechte der Mitglieder | Gepflegt von |
|---|---|---|---|
| Termine | Google-Kalender „Frankonia-Brunonia“ | lesen | Chargen direkt im Google Kalender |
| Zu-/Absagen | Eingeladen: Teilnehmerstatus im Termin (`attendees[].responseStatus`, `additionalGuests`, `comment`), gesetzt über den **eigenen** Kalender (`calendars/primary`). Nicht eingeladen: eigene Datei im eigenen Drive (`fbTyp=zusage`, E28) | eigene Antwort | jedes Mitglied selbst |
| Kategorie, Kleidung, Pflicht | `extendedProperties.shared` (`fbKategorie`, `fbKleidung`, `fbPflicht`) oder Zeilen in der Beschreibung (`Kategorie: …`, `Kleidung: …`, `Pflichttermin`); sonst Kategorie aus dem Titel geraten | lesen | Chargen |
| Profilfoto, Name | Google-Konto bzw. Workspace-Verzeichnis | – | jedes Mitglied im Google-Konto |
| Profil-Zusatzangaben | JSON in der Beschreibung einer kleinen Datei im **eigenen** Drive (`appProperties.fbTyp = profil`), Ordner „Frankonia-Brunonia App – meine Beiträge und Profil“. Felder: Kneipname, Status, „Aktiv seit“ (Rezeption), Ämter, Studium/Beruf, aktuelle bzw. letzte Tätigkeit, Wohnort, Über mich, Angebot für Jüngere, Telefon, Instagram, LinkedIn | lesen (Freigabe Gruppe/Domain) – nur, solange das Mitglied sichtbar ist (E40) | jedes Mitglied selbst |
| Adressänderungen | keine Speicherung: „Mein Profil“ gleicht Anschrift und Stammdaten mit dem Adressverzeichnis ab (`js/lib/adressabgleich.js`) und bereitet eine E-Mail an `config.adressaenderung` vor | – | Mitglied schickt sie ab, Schriftwart pflegt das Verzeichnis |
| Forum | je Beitrag eine kleine Datei im **eigenen** Drive des Verfassers (`fbTyp = forum`, `fbRolle = thema/antwort`, `fbThema`, `fbKategorie`); Anhänge als eigene Dateien daneben (`fbTyp = anhang`, E56) | lesen | jeder seine eigenen |
| Status, Kneipname, Rezeption (in der App „Aktiv seit“), Beruf, Wohnort | Adressverzeichnis. Der **Status** von dort hat immer Vorrang; die übrigen Angaben kann das Mitglied im eigenen Profil ergänzen oder überschreiben | lesen | Admins / Schriftwart |
| News | Eigene Dateien der Redaktion (`fbTyp=news`, Bilder `fbTyp=newsbild`, Anhänge `fbTyp=anhang`, E56) und Tabelle „News“ | lesen; Admins/Redaktion schreiben eigene | Redaktion in der App bzw. in Google Tabellen |
| Adressen, Geburtstage | Tabelle „Adressverzeichnis“ (Spalten frei, werden erkannt) | lesen | Admins / Schriftwart |
| Bundesbote (Zeitung) | PDF-Dateien im Drive-Ordner, Dateiname `JJJJ-N Titel.pdf` | lesen | Redaktion in Google Drive |
| DS-Zeitung | PDF-Dateien im eigenen Drive-Ordner (`dsZeitungOrdnerId`, freiwillig), Dateiname `JJJJ-N DS-Zeitung.pdf`; gelesene Ausgaben wie beim Bundesboten im Cache-Speicher `fb-zeitung` (E38) | lesen | Verantwortliche der Verbindung in Google Drive |
| Liedermappe | PDFs und Bilder im Drive-Ordner (`liedermappeOrdnerId`), Unterordner = Rubriken, Dateiname `012 Titel.pdf`; geöffnete bzw. gespeicherte Lieder im Cache-Speicher `fb-lieder` | lesen | Liederwart in Google Drive |
| Weitere Links (z. B. Wiki) | `config.links`, öffnen sich außerhalb der App (E32) | – | Admins in der privaten Konfiguration |
| Benachrichtigungen | nur auf dem Gerät: ein/aus und was gelesen ist (`fb.benachrichtigungen.<email>`, `fb.gelesen.<email>`); Mitteilungen über den Service Worker, solange die App läuft (E34). Ankündigung neuer News = eigene Chat-Nachricht (E33) | – | jedes Mitglied selbst |
| Galerie | Bilder im Drive-Ordner; Unterordner = Alben (`JJJJ-MM Name`, bis drei Ebenen tief, Ansicht „Alben“ oder „Ordner“), lose Bilder = Album „Allgemein“. „Fotos hochladen“ verlinkt nur einen Upload-Ordner in Drive (E46) | lesen | Admins / Fotowart in Google Drive |
| Papierpost-Wahl (E44) | Datei *„Papierpost (Mitglieder-App).json“* im **eigenen** Drive (`fbTyp = papierpost`, `{ bundesbote, geaendert }`) | **kein Zugriff**; lesen nur Mitglied und Admins (`type: user`, `role: reader`) | jedes Mitglied selbst |
| Push-Anmeldung (E50) | je Gerät eine Datei *„Push-Mitteilungen (Mitglieder-App).json“* im **eigenen** Drive (`fbTyp = push`, öffentlich `properties.fbTyp` für das Apps-Script; `{ endpoint, p256dh, auth, themen, geraet, geaendert }`) | **kein Zugriff**; lesen nur Mitglied und das Konto des Push-Skripts (`type: user`, `role: reader`) | jedes Mitglied selbst (ein-/ausschalten) |
| Chat-Hinweise (E51) | eine Datei *„Chat-Hinweise (Mitglieder-App).json“* im **eigenen** Drive (`fbTyp = chathinweis`, öffentlich `properties.fbTyp`; `{ zeit, an: { Empfänger: { direkt\|gruppe\|bierjunge: Sekunden } } }` – wem man zuletzt aus der App geschrieben hat, kein Inhalt, kein Raum, kein Verlauf; Einträge älter als eine Stunde fallen weg) | **kein Zugriff**; lesen nur Mitglied und das Konto des Push-Skripts (`type: user`, `role: reader`) | die App des Absenders beim Senden |
| Chat | Google Chat (Räume des Workspace) | wie in Google Chat | – |
| Datenschutz-Einwilligung | Datei *„Datenschutz-Einwilligung (Mitglieder-App).json“* im **eigenen** Drive (`appProperties.fbTyp = einwilligung`, öffentlich `properties.fbTyp` für das Apps-Script). Inhalt und Beschreibung: Entscheidungen, Zeitpunkt, Fassung, Prüfsumme des Wortlauts, Gerät, letzte 10 Entscheidungen | **kein Zugriff**; lesen nur Mitglied und Verantwortliche (`type: user`, `role: reader`) | jedes Mitglied selbst |
| Sichtbarkeit (E40) | Datei *„Sichtbarkeit (Mitglieder-App).json“* im **eigenen** Drive (`fbTyp = sichtbarkeit`, `{ sichtbar, geaendert }`), entsteht beim Speichern der Datenschutz-Auswahl. Wer eine hat, hat die App genutzt („App-Nutzer“ in der Mitgliederliste); bei „nein“ blendet die App das Mitglied aus | lesen (Freigabe Gruppe/Domain) | jedes Mitglied selbst |
| Gruppen-Kennungen (E41) | je Google-Gruppe eine kleine Datei in „Meine Ablage“ eines Admins (`fbTyp = gruppe`, `fbGruppe`), nur für diese Gruppe lesbar; wer sie lesen kann, gehört dazu. `config.gruppen.ohne` legt fest, welche Bereiche eine Gruppe nicht sieht | lesen (nur die eigene Gruppe) | Admins in der Einrichtung |
| Einwilligungsliste | Google-Tabelle im Drive der Verantwortlichen, **außerhalb** des freigegebenen Ordners (`appProperties.fbTyp = einwilligungen-tabelle`), Blätter „Stand“, „Verlauf“, „Fassungen“ | **kein Zugriff** | nur das Konto, dem sie gehört (App oder Apps-Script) |

**Wer hat das geschrieben?** Für Profile, Forumsbeiträge, Einwilligungen, Sichtbarkeit, Papierpost-Wahl, Push-Anmeldungen und Chat-Hinweise nimmt die App (bzw. das Push-Skript) den Verfasser aus dem Dateieigentümer, den Google selbst meldet (`owners[0]`). Angaben in der Datei selbst, z. B. eine eingetragene E-Mail-Adresse, werden dafür nicht verwendet. Damit kann niemand im Namen eines anderen auftreten. Hat jemand mehrere solcher Dateien, zählt die zuletzt geänderte.

**Einwilligungen nachvollziehbar:** Jede Entscheidung entsteht in der angemeldeten Google-Sitzung des Mitglieds und liegt als dessen eigene Datei vor; Inhaber und Änderungszeit setzt Google. Die Sammeltabelle übernimmt jede Erklärung in den „Verlauf“ (nur anhängen, Schlüssel = Datei-ID + Zeitstempel) und hält im Blatt „Fassungen“ den genauen Wortlaut mit Prüfsumme fest. Die Freigabe jeder Einwilligung wird beim Öffnen der App an die aktuelle Liste der Verantwortlichen angepasst; andere Freigaben (Gruppe, Domain, Link) werden entfernt. Wird die Fassung in `config.js` erhöht, fragt die App alle Mitglieder erneut.

## Schreibschutz

Drei unabhängige Ebenen sorgen dafür, dass mit der App nur eigene Daten geändert werden:

1. **Google-Freigaben.** Kalender, Tabellen und Ordner sind für die Mitglieder-Gruppe nur lesbar. Profile und Beiträge geben die Verfasser nur lesbar frei (`role: reader`).
2. **Berechtigungen (OAuth-Scopes).** Angefragt werden nur:
   - `openid`, `email`, `profile`;
   - `calendar.events` für die eigene Antwort (Google lässt Teilnehmer ohnehin nur die eigene Antwort ändern);
   - `drive.readonly` (lesen) und `drive.file` (nur von dieser App angelegte Dateien). Fremde Dateien sind damit technisch nicht änderbar, auch nicht die des Admins, der die Einrichtung gemacht hat: Für ihn sind sie zwar „von der App angelegt“, aber der Code-Schutz (Ebene 3) sperrt sie;
   - mit Workspace zusätzlich `directory.readonly`, `chat.spaces.readonly`, `chat.messages` sowie `chat.spaces.create` und `chat.memberships` (Direktnachrichten und Gruppen anlegen, Personen hinzufügen – E30).

   Für Google Tabellen gibt es **keinen** eigenen Schreib-Scope; gelesen wird über `drive.readonly`, geschrieben (Einrichtung, Einwilligungsliste) nur in von der App selbst angelegte Tabellen über `drive.file`. Nur die Einrichtung fragt einmalig `calendar` an, um den neuen Verbindungskalender anzulegen.
3. **Sperre im Code** (`js/google/guard.js`). Jede Anfrage außer `GET` läuft durch `assertWriteAllowed()`. Erlaubt ist nur:
   - `PATCH calendars/primary/events/{id}` mit genau dem Feld `attendees`, also die eigene Antwort im eigenen Kalender;
   - Drive: neue Dateien nur in eigenen App-Ordnern, Ändern/Papierkorb sowie Freigaben setzen und zurücknehmen nur bei Dateien, die nachweislich dem Mitglied gehören (`ownedByMe`). Verschieben (`addParents`/`removeParents`) ist immer gesperrt;
   - Google Tabellen: nur die eigene, von der App angelegte Einwilligungsliste (`ownedByMe` und `fbTyp = einwilligungen-tabelle`, von Google bestätigt);
   - Chat: eigene Nachrichten senden, ändern, löschen.

   Alles andere wirft `WriteBlockedError`, bevor eine Anfrage gesendet wird.

**Einrichtung:** Vorhandene Daten werden nur verbunden (ID eintragen) und gelesen. Nur während eines ausdrücklichen Klicks auf „Fehlendes neu anlegen“ (nur Admins, nur für Datenquellen ohne Eintrag) erlaubt der Schutz zusätzlich das Befüllen der **in genau diesem Lauf neu angelegten** Dateien und des neuen Kalenders. Danach ist die Ausnahme sofort wieder aus. Die Prüfung „Verbindung prüfen“ liest nur – auch Freigaben und Inhaber (E24).

## Anmeldung

- OAuth 2.0 „Implicit Flow“ mit **Weiterleitung**. Das funktioniert zuverlässig in installierten Web-Apps auf dem iPhone, anders als Pop-ups.
- Ein Zugangsschlüssel gilt eine Stunde. Danach holt die App ihn **still** (`prompt=none`) neu, ohne Passworteingabe, solange das Google-Konto im Browser angemeldet ist.
- Bei Zielgruppe „Intern“ im Workspace ist keine Google-Überprüfung der App nötig.

**Mögliche Ausbaustufe:** Ein kleiner Token-Dienst (z. B. Google Cloud Run, kostenlos im Rahmen des Free Tier) könnte Refresh-Tokens verwalten. Dann entfällt auch die kurze Weiterleitung nach einer Stunde. Für den Start ist das nicht nötig.

## Links aus dem Kalender

Jeder Termin enthält den Link `…/#/termin/<ID>`. Auf **Android** öffnet ein Tipp darauf die installierte App direkt beim Termin. Auf dem **iPhone** öffnet Apple solche Links immer in Safari, nicht in der App auf dem Startbildschirm. In Safari ist deshalb beim ersten Mal eine eigene Anmeldung nötig, danach merkt sich auch Safari die Anmeldung. Das ist eine Einschränkung von iOS und betrifft alle Web-Apps.

**Profil und Adressverzeichnis sind bewusst getrennt** (ENTSCHEIDUNGEN.md, E7): Das Adressverzeichnis ist die offizielle, vom Schriftwart gepflegte Quelle; das Profil sind freiwillige Selbstangaben. Die App schreibt nie ins Verzeichnis, sondern hilft nur, Abweichungen zu melden.

## Geräte und Bildschirmgrößen

- Handy, Phablet und Tablet in jeder Ausrichtung (`orientation: any` im Manifest) sowie PC.
- **Navigation:** Auf allen Touch-Geräten die Tab-Leiste unten (ab 700 px mittig zusammengefasst). Die Textleiste oben gibt es nur mit Maus ab 1280 px Breite (`(min-width: 1280px) and (hover: hover) and (pointer: fine)`), siehe ENTSCHEIDUNGEN.md, E17.
- **Spalten:** zweispaltige Seiten ab 768 px (iPad hochkant, Handy quer).
- **Querformat:** Seitliche Schutzabstände für Kameraaussparungen (`env(safe-area-inset-left/right)`), auch in Zeitungsleser und Fotoansicht. Bei geringer Höhe scrollt die Kopfzeile mit, und Titel und Leisten sind kompakter.
- Der Zeitungsleser zeigt immer genau eine Seite – hochkant wie quer – und passt ihre Größe beim Drehen an.
- Geprüft mit `tests/layout-check.js` u. a. bei 375×812, 430×932, 932×430, 744×1133, 820×1180, 800×1280, 1024×768, 1180×820, 1280×800 und 1366×1024, jeweils mit normaler und sehr großer Schrift.

## Lesbarkeit

- Schriftgröße in vier Stufen (Klein 87,5 %, Normal, Groß 118,75 %, Sehr groß 137,5 %), gespeichert pro Gerät. Weil alle Maße in `rem` angegeben sind, wachsen Abstände, Knöpfe und Symbole mit.
- Raster mit `minmax(0, 1fr)`, Silbentrennung und umbrechende Knöpfe: Auch bei „Sehr groß“ auf einem 375 px breiten Handy läuft nichts seitlich aus dem Bild (geprüft für alle Seiten).

## Sicherheit und Datenschutz

- Alle Nutzerinhalte (Forum, News, Profile) werden beim Anzeigen maskiert (`js/html.js`); Formatierung geht nur über eine kleine Markdown-Teilmenge.
- Content-Security-Policy in `index.html`: Skripte nur von der eigenen Adresse.
- Schriften und Bibliotheken werden mitgeliefert, es gibt keine Google-Fonts-Abfrage (DSGVO-freundlich).
- Forumsbeiträge sind auf 4000 Zeichen begrenzt, Profilangaben auf 200 bzw. 1500 Zeichen.

## Offline und Updates

- Der Service Worker (`sw.js`) speichert die App-Dateien. Daten werden in IndexedDB zwischengespeichert („zuletzt geladener Stand“). Offline zeigt die App diesen Stand weiter an, statt einer Fehlermeldung. Geöffnete Zeitungsausgaben bleiben offline verfügbar (Cache „fb-zeitung“).
- Bei jeder Veröffentlichung setzt GitHub Actions eine neue Versionskennung, und die App meldet „Neue Version verfügbar“.
- Lokal (localhost) lädt der Service Worker immer frisch vom Netz.

## Store-Apps (optional, später)

Die PWA lässt sich ohne Codeänderung in Store-Pakete verpacken, z. B. mit [PWABuilder](https://www.pwabuilder.com):
- **Android / Google Play:** „Trusted Web Activity“. Das ist unkompliziert, die Google-Anmeldung funktioniert unverändert. Verteilung auch nur an eine Testgruppe möglich (geschlossener Test-Track mit Google-Gruppe).
- **iPhone / App Store:** möglich, aber mit Apple-Entwicklerkonto (99 €/Jahr) und Prüfung; die Google-Anmeldung muss dann über die native Google-Anmeldung laufen. Für iPhones ist die Installation über Safari („Zum Home-Bildschirm“) der einfachere Weg.

## Tests

- `tests/google-mock.html` (lokal öffnen: `http://localhost:8080/tests/google-mock.html`) spielt Einrichtung und alle Backend-Funktionen gegen einen Nachbau der Google-APIs durch (127 Prüfungen, inkl. Einwilligungen, Fälschungsversuchen, Empfängerwechsel, Sammeltabelle und Adressabgleich). Der Nachbau kennt Dateieigentümer und die Regeln von `drive.file` und zählt jeden Schreibzugriff auf fremde oder gemeinsame Daten. Der Test versucht gezielt, Termine, Tabellen, Zeitungen, Galerie-Ordner und fremde Profile/Beiträge zu ändern, und verlangt, dass jeder Versuch blockiert wird, **bevor** etwas gesendet wird. Am Ende muss die Zahl der unerlaubten Schreibzugriffe 0 sein.
- `tests/app-mock.html` (über `http://127.0.0.1:8080/tests/app-mock.html` öffnen) startet die komplette App im Google-Modus gegen den Nachbau, mit Inhalten eines zweiten Mitglieds. Unter `window.__fake.state.violations` stehen unerlaubte Schreibzugriffe; die Liste muss leer bleiben.
- Demo-Modus: alle Seiten mit Beispieldaten.

## Grafiken und Anleitung neu erzeugen

```bash
python tools/build_assets.py       # Wappen, Skyline, Icons aus tools/screenshot.webp
python tools/make_demo_pdfs.py     # Beispielausgaben des Bundesboten
python tools/make_demo_ds.py       # Beispielausgaben der DS-Zeitung (fiktiv)
python tools/make_demo_lieder.py   # Beispiellieder der Liedermappe (fiktiv)
python tools/make_demo_images.py   # Titelbilder der Demo-News
python tools/make_demo_gallery.py  # Beispielfotos der Galerie
python tools/make_anleitung.py https://DEINNAME.github.io/fb-app/   # PDF-Anleitung + QR-Code
python tools/update_sw.py          # Dateiliste des Service Workers
```
(benötigt Pillow, numpy, scipy, reportlab, pyphen, fonttools)
