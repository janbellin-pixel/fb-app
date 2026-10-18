# Einrichtung der Mitglieder-App

Diese Anleitung führt in zwei Etappen zur fertigen App:

- **Teil A – Prototyp** mit deinem eigenen Google-Konto (ca. 30 Minuten)
- **Teil B – Echtbetrieb** im Google Workspace der Verbindung für alle Mitglieder

Danach folgen **Teil C – Daten pflegen** (so kommen Termine, News, Zeitungen und Fotos in die App) und **Teil D – Datenschutz und Einwilligungen**.

Programmierkenntnisse brauchst du nicht. Die App legt Kalender, Tabellen und Ordner selbst an. Nur ein paar Klicks bei Google und GitHub kann dir aus Sicherheitsgründen niemand abnehmen.

> **Grundsatz der App:** Mitglieder können mit der App nur **ihre eigenen** Daten ändern: die eigene Zu-/Absage, das eigene Profil, eigene Forumsbeiträge, eigene Chat-Nachrichten und neue Chat-Unterhaltungen mit Personen. Alles Gemeinsame wird in der App nur angezeigt und direkt bei Google gepflegt (Teil C). Wie das abgesichert ist, steht unten unter [Schreibschutz](#schreibschutz).

---

## Teil A – Prototyp mit eigenem Google-Konto

### A1. Die App auf deinem Rechner starten (optional, zum Ausprobieren)

Voraussetzung: Python 3 ist installiert (unter Windows: `python --version` in der Eingabeaufforderung).

```bash
python tools/serve.py
```

Dann im Browser **http://localhost:8080** öffnen. Ohne weitere Einrichtung kannst du sofort **„Demo mit Beispieldaten ansehen“** wählen. Alle Funktionen laufen dann mit erfundenen Daten.

> Für die Installation auf dem Handy braucht die App eine `https://`-Adresse. Dafür ist Schritt A3 (GitHub Pages) da.

### A2. Google-Zugang anlegen (OAuth-Client-ID)

Die App zeigt dir alle nötigen Werte unter **Einrichtung** (auf der Anmeldeseite unten bzw. `…/#/einrichtung`) mit Kopier-Knöpfen an. Kurzfassung:

1. **Google Cloud Console** öffnen: <https://console.cloud.google.com> → oben **Projekt auswählen → Neues Projekt** (Name z. B. „Mitglieder-App“).
2. **Schnittstellen aktivieren** (jeweils öffnen → „Aktivieren“):
   - [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
   - [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com) (die App liest damit nur)
   - [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
   - [People API](https://console.cloud.google.com/apis/library/people.googleapis.com)
   - [Google Chat API](https://console.cloud.google.com/apis/library/chat.googleapis.com) – nur für Teil B (Workspace)
3. **Zustimmungsbildschirm** ([Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding)):
   - App-Name: `Frankonia-Brunonia`, Support-E-Mail: deine Adresse
   - **Zielgruppe: „Extern“** (für den Test mit privatem Konto)
   - Unter **Zielgruppe → Testnutzer** dich selbst und ggf. ein zweites Test-Konto eintragen (bis zu 100 möglich)
4. **Client erstellen** ([Clients → Client erstellen](https://console.cloud.google.com/auth/clients/create)):
   - Anwendungstyp: **Webanwendung**
   - **Autorisierte JavaScript-Quellen:** `http://localhost:8080` und später `https://DEINNAME.github.io`
   - **Autorisierte Weiterleitungs-URIs:** `http://localhost:8080/` und später `https://DEINNAME.github.io/fb-app/` (mit `/` am Ende, Repository-Name anpassen)
5. Die angezeigte **Client-ID** (endet auf `.apps.googleusercontent.com`) kopieren.

> **Hinweis „Google hat diese App nicht überprüft“:** Bei Test-Projekten ist das normal. Auf „Erweitert“ → „Weiter zu Frankonia-Brunonia (unsicher)“ klicken. Im Echtbetrieb mit Workspace und Zielgruppe „Intern“ entfällt der Hinweis.

### A3. Veröffentlichen mit GitHub Pages (kostenlos)

1. Auf <https://github.com> ein Konto anlegen bzw. anmelden.
2. **Neues Repository** anlegen: Name z. B. `fb-app`, Sichtbarkeit **Public**. Ein **privates** Repository geht auch, GitHub Pages braucht dafür aber einen kostenpflichtigen Tarif (GitHub Pro, Team oder Enterprise); die veröffentlichte App ist in beiden Fällen öffentlich aufrufbar. Im Code stehen keine Geheimnisse, alle Daten liegen geschützt bei Google. Das GitHub-Konto mit Zwei-Faktor-Anmeldung schützen: Wer das Repository ändern kann, bestimmt den ausgelieferten Code.
3. Alle Dateien dieses Projektordners hochladen:
   - am einfachsten mit **GitHub Desktop** (Ordner hinzufügen → „Publish repository“), oder
   - im Browser: „Add file → Upload files“ und den Ordnerinhalt hineinziehen.
4. Im Repository: **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
   Der mitgelieferte Ablauf (`.github/workflows/pages.yml`) veröffentlicht die App ab jetzt bei jedem Hochladen automatisch.
5. Nach 1–2 Minuten ist die App unter `https://DEINNAME.github.io/fb-app/` erreichbar.
6. Diese Adresse in der Google Cloud Console beim Client unter **JavaScript-Quellen** (`https://DEINNAME.github.io`) und **Weiterleitungs-URIs** (`https://DEINNAME.github.io/fb-app/`) ergänzen.

**Wer kann am Repository etwas ändern?** Ein öffentliches Repository kann jeder **ansehen**, aber nur der Inhaber und ausdrücklich eingeladene Mitarbeiter können etwas **hochladen**. Fremde können höchstens Änderungen vorschlagen („Pull Request“); das ändert nichts, solange sie niemand annimmt. Veröffentlicht wird nur bei Uploads in den Hauptzweig `main` (siehe `.github/workflows/pages.yml`), also nie durch fremde Vorschläge. Mitgliederdaten stehen nicht im Repository, die liegen bei Google.

So bleibt es dabei:
- **Zwei-Faktor-Anmeldung** für das GitHub-Konto einschalten (Settings → Password and authentication). Das ist der wichtigste Schutz, denn der Code bestimmt, was die App mit den Rechten der Mitglieder tut.
- **Mitarbeiter** (Settings → Collaborators) nur bewusst eintragen, z. B. einen Vertreter.
- **Vorschläge von Unbekannten** nicht annehmen.
- Optional eine Regel für `main` anlegen (Settings → Rules → Rulesets): „Restrict deletions“ und „Block force pushes“.
- Ist die GitHub-Anmeldung auf einem PC gespeichert (z. B. damit Claude hochladen kann), das Windows-Konto beim Verlassen sperren.

**Notfall:** Wird das GitHub-Konto doch einmal übernommen, sperrt ein Admin die App sofort für alle (Admin-Konsole → Sicherheit → Zugriffs- und Datenkontrolle → API-Steuerung → App-Zugriff verwalten). Danach den Code prüfen und zurücksetzen. Ohne Sperre könnte ein manipulierter Code lesen, was das jeweilige Mitglied lesen darf. Neue Berechtigungen müsste Google jedem Mitglied aber erst zur Zustimmung vorlegen.

### A4. In der App einrichten

1. App öffnen → unten **„Einrichtung (Admins)“** bzw. `…/#/einrichtung`.
2. **Google-Zugang:** Client-ID einfügen → Speichern.
3. **Mit Google anmelden.**
4. **Optionen:** Für den Prototyp kannst du unter **„Test-Mitglieder“** ein zweites Google-Konto eintragen. Es bekommt dann Lesezugriff und Einladungen. Workspace-Domain und Gruppe bleiben leer. Unter **Datenschutz** Verein, Anschrift und Kontakt-E-Mail eintragen (siehe Teil D).
5. **Kalender, Tabellen und Ordner → „2. Fehlendes neu anlegen“.** Ist noch nichts verbunden, legt die App alles neu an – in deinem Google Drive den Ordner *„Frankonia-Brunonia – Mitglieder-App“* mit
   - Tabelle **Adressverzeichnis**,
   - Tabelle **News**,
   - Ordner **Bundesbote** (auf Wunsch mit drei Beispielausgaben),
   - Ordner **Liedermappe** (leer – Noten als PDF oder Bild hineinlegen),
   - Ordner **Galerie** (auf Wunsch mit drei Beispielalben),
   - und einen neuen Google-Kalender **„Frankonia-Brunonia“** mit Beispielterminen.

   Außerdem entsteht – bewusst **außerhalb** dieses Ordners – die vertrauliche Tabelle **„Einwilligungen (vertraulich)“** (Teil D).

   Alles wird für die Mitglieder **nur lesbar** freigegeben, die Einwilligungsliste gar nicht. Für den neuen Kalender fragt Google einmal nach der Berechtigung „Kalender verwalten“; sie wird nur für diesen Schritt gebraucht. Die Beispieldaten sind nur beim Start von Grund auf vorausgewählt. Vorhandene Daten fasst der Knopf nie an (siehe B3).
6. **„Verbindung prüfen (nur lesend)“** – alles sollte grün sein (gelb = Hinweis, rot = Fehler).
7. **config.js herunterladen** und im GitHub-Repository die Datei `config.js` damit ersetzen (Datei öffnen → Stift-Symbol bzw. „Upload files“). Erst dann gelten die Einstellungen für alle, die die App öffnen, vorher nur in deinem Browser.

### A5. Testen

- Mit dem zweiten Test-Konto die App öffnen (z. B. im privaten Fenster oder auf dem Handy) und anmelden. Beim ersten Öffnen erscheint die Datenschutz-Abfrage.
- Einen Termin öffnen und **Zusagen**. Im Google Kalender des Test-Kontos erscheint der Termin als „Zugesagt“.
- Im Google Kalender selbst zu- oder absagen; die App zeigt die Antwort an.
- Profil ausfüllen, im Forum schreiben, im Bundesboten blättern, ein Lied in der Liedermappe öffnen, Galerie ansehen.
- Unter **Mehr → Schriftgröße** die Stufen „Groß“ und „Sehr groß“ ausprobieren.

---

## Teil B – Echtbetrieb im Google Workspace der Verbindung

Die App bleibt dieselbe, nur die Google-Seite wird „richtig“ eingerichtet. Am besten macht das ein Workspace-Admin.

### B1. Google-Cloud-Projekt im Workspace

1. Mit einem Admin-Konto der Verbindung ein neues Projekt in der Google Cloud Console anlegen (wie A2) und alle **fünf** Schnittstellen aktivieren, inklusive **Google Chat API**.
2. Zustimmungsbildschirm mit **Zielgruppe „Intern“**. Dann können sich nur Konten der Verbindung anmelden, es gibt keine Testnutzer-Grenze und keine „nicht überprüft“-Warnung.
3. Client wie in A2 anlegen (JavaScript-Quelle und Weiterleitungs-URI der veröffentlichten App).
4. **Google Chat API → Konfiguration** öffnen und ausfüllen: App-Name „Frankonia-Brunonia“, Avatar-URL z. B. `https://DEINNAME.github.io/fb-app/assets/icons/icon-192.png`, Beschreibung. „Interaktive Funktionen“ können aus bleiben. Ohne diese Konfiguration verweigert Google den Chat-Zugriff.

### B2. Einstellungen in der Admin-Konsole (admin.google.com)

| Einstellung | Wo | Wozu |
|---|---|---|
| **Gruppe „mitglieder@…“** mit allen Mitgliedern anlegen (optional) | Verzeichnis → Gruppen | Nicht nötig: Anmelden kann jedes Konto der Domain, und zu- oder absagen kann jeder auch ohne Einladung (über die App). Lädt man die Gruppe zu Terminen ein, stehen sie zusätzlich in den Kalendern der Mitglieder und die Antworten im Google Kalender. Lesefreigaben gehen ohne Gruppe auch an die ganze Domain |
| Gruppe: „Wer kann Beiträge posten“ → mindestens **Organisation** | Gruppeneinstellungen | Kalendereinladungen an die Gruppe kommen an |
| **Kontaktfreigabe / Verzeichnis sichtbar** | Verzeichnis → Verzeichniseinstellungen → Freigabeeinstellungen | Mitgliederliste mit Fotos in der App |
| Nutzer dürfen **Profilfoto ändern** | Konto → Kontoeinstellungen → Profil | Jeder pflegt sein Foto selbst |
| Freigabe von Drive-Dateien **innerhalb der Organisation** erlaubt | Apps → Google Workspace → Drive und Docs → Freigabeeinstellungen | Profile und Forumsbeiträge (kleine Dateien im eigenen Drive) sind für alle Mitglieder lesbar |
| **App als vertrauenswürdig** markieren (falls Drittanbieter-Apps eingeschränkt sind) | Sicherheit → API-Steuerung → App-Zugriff verwalten | Mitglieder können sich ohne Rückfrage anmelden |
| Freigabe **außerhalb der Organisation** einschränken (empfohlen, falls ihr nichts nach außen teilt) | Apps → Google Workspace → Drive und Docs → Freigabeeinstellungen | „Jeder mit dem Link“ ist dann nicht mehr möglich. Wichtig, weil die IDs in der öffentlichen `config.js` stehen |
| Google Chat aktiviert, Räume angelegt (z. B. „Allgemein“, „Aktivitas“, „Altherrenschaft“) | Apps → Google Workspace → Google Chat | Chat in der App |
| **Postfach `adressaenderung@…`** (Gruppe oder Alias, z. B. für den Schriftwart) | Verzeichnis → Gruppen bzw. Nutzer → Alternative E-Mail-Adressen | Empfänger der vorbereiteten Adressänderungen aus „Mein Profil“ (ohne Umlaut, siehe `adressaenderung` in config.js) |

### B3. Daten einrichten

In der App unter **Einrichtung** (als Admin angemeldet):

1. **Optionen:** Workspace-Domain (z. B. `frankonia-brunonia.de`), Mitglieder-Gruppe (`mitglieder@…`, falls vorhanden), **Admins** (nur sie sehen die Einrichtung) und die Angaben zum **Datenschutz** eintragen → „Optionen speichern“.
2. **„1. Vorhandenes verbinden“:** die Links zu dem eintragen, was es schon gibt – Kalender, Mitgliederliste, Ordner mit dem Bundesboten, mit der Liedermappe und mit den Fotos → „Übernehmen“. Es genügen die Links aus der Adresszeile bzw. „Link kopieren“; beim Kalender auch der Link aus den Kalendereinstellungen („Kalender-ID“, „Öffentliche Adresse“ oder der Link zum Hinzufügen des Kalenders). Hat die Mitgliederliste mehrere Tabellenblätter, das richtige unter „Tabellenblatt“ angeben – andere Blätter liest die App nicht.
3. **„Verbindung prüfen (nur lesend)“** und die Hinweise abarbeiten (siehe unten). Die Prüfung ändert nichts.
4. **„2. Fehlendes neu anlegen“:** legt nur noch an, was nicht verbunden ist – typischerweise die **News-Tabelle** und die **Einwilligungsliste**. Was verbunden ist, wird dabei weder verändert noch neu freigegeben; Beispieldaten sind hier nicht vorausgewählt.
5. Noch einmal prüfen, dann **config.js** herunterladen (siehe unten).

Bis zum Veröffentlichen der config.js gelten die Einträge nur in deinem Browser – so kannst du alles in Ruhe prüfen, bevor die IDs öffentlich werden.

**Was die Prüfung meldet** (gelb = bitte ansehen, rot = Fehler):

| Meldung | Bedeutung | Abhilfe |
|---|---|---|
| „Jeder mit dem Link“ hat Zugriff | Die ID steht in der öffentlichen `config.js` – damit könnte jeder im Internet mitlesen | In Google Drive „Teilen → Allgemeiner Zugriff“ auf „Eingeschränkt“ oder die Domain stellen |
| Bearbeiten dürfen Gruppe/Domain | Mitglieder könnten Daten ändern | Gruppe bzw. Domain auf „Betrachter“ stellen; Bearbeiten nur für einzelne Verantwortliche |
| Keine Lesefreigabe für Gruppe/Domain | Die Mitglieder sehen die Daten in der App nicht | Gruppe bzw. Domain als „Betrachter“ hinzufügen |
| Gehört einem Konto außerhalb der Domain | Die Datei liegt z. B. in einem privaten Google-Konto | Eigentum an ein Konto der Verbindung übertragen (oder in eine geteilte Ablage verschieben) |
| Spalten sehen vertraulich aus | z. B. IBAN, Beitrag, Bemerkung – wer die Tabelle lesen darf, sieht sie | Eigene Tabelle nur mit den freigebbaren Spalten anlegen (siehe unten) und diese verbinden |
| Termine ohne Einladung an die Mitglieder-Gruppe (Hinweis) | Zu- und Absagen laufen dort über die App, im Google Kalender sind sie nicht sichtbar | Nur falls gewünscht: Gruppe als Gast hinzufügen, automatisch mit B4 |
| Freigaben nicht einsehbar | Nur Inhaber und Bearbeiter sehen Freigaben | Als Inhaber/Bearbeiter prüfen oder in Google Drive selbst nachsehen |
| Google-Verzeichnis: nur ein Konto bzw. „People API … disabled“ | „Mitglieder“ zeigt dann nur das eigene Konto | Admin-Konsole → Verzeichnis → Verzeichniseinstellungen → Freigabeeinstellungen → **Kontaktfreigabe** einschalten bzw. in der Cloud Console die People API aktivieren. Neue Konten erscheinen teils erst nach einigen Stunden |
| Google Chat: „Google Chat app not found“ | Die Chat-Schnittstelle ist im Cloud-Projekt nicht konfiguriert | Cloud Console → Google Chat API → Konfiguration: App-Name, Avatar, Beschreibung (B1, Schritt 4) |
| Liedermappe: weitere Dateien bzw. ohne Liednummer (Hinweis) | Word-, MuseScore- oder HEIC-Dateien zeigt die App nicht an; Lieder ohne Nummer stehen nach Titel am Ende | Als PDF oder JPG ablegen; Dateiname mit Nummer, z. B. „012 Titel.pdf“ |
| Google Chat: keine Räume | Jeder sieht nur Unterhaltungen, in denen er Mitglied ist | In der App „Neue Nachricht“ bzw. „Neue Gruppe“ – oder in einer Gruppe unter „Personen“ neue Konten hinzufügen |

Die Rechte sehen danach so aus:

| Datei | Mitglieder | Wer pflegt sie (direkt bei Google) |
|---|---|---|
| Kalender | nur Lesen + eigene Antwort | Inhaber; Chargen per Kalender-Freigabe „Änderungen an Terminen vornehmen“ |
| Tabelle Adressverzeichnis | nur Lesen | Admins / Schriftwart in Google Tabellen |
| Tabelle News | nur Lesen | Redaktion in Google Tabellen (in Drive als „Bearbeiter“ hinzufügen) |
| Ordner Bundesbote | nur Lesen | Redaktion lädt PDFs in Google Drive hoch |
| Ordner Liedermappe | nur Lesen | Liederwart legt Noten in Google Drive ab |
| Ordner Galerie | nur Lesen | Admins / Fotowart legen Alben in Google Drive an |
| Profil und Forumsbeiträge | Lesen | jedes Mitglied seine eigenen: kleine Dateien im eigenen Drive, die die App anlegt |
| Einwilligung (je Mitglied) | **kein Zugriff** – nur das Mitglied selbst und die Datenschutz-Verantwortlichen | jedes Mitglied seine eigene, in der App |
| Einwilligungsliste (vertraulich) | **kein Zugriff** – nur die Datenschutz-Verantwortlichen (lesen) | nur das Konto, dem sie gehört – automatisch durch App bzw. Skript |

Eine **bestehende Adressliste** kann weiterverwendet werden. Die App erkennt übliche Spaltennamen (Vorname, Nachname oder „Name“ – auch als „Nachname, Vorname“ –, Straße und Hausnummer, PLZ und Ort – auch zusammen in einer Spalte –, Telefon, Mobil, E-Mail, Geburtstag, Status, Kneipname bzw. „v/o“ …) selbst, auch wenn über den Spaltennamen noch eine Titelzeile steht. Unbekannte Spalten zeigt sie zusätzlich an. Gelesen wird nur ein Tabellenblatt: das unter „Tabellenblatt“ eingetragene, sonst „Adressen“, sonst das erste. Die Prüfung zeigt, welche Spalten erkannt wurden. Steht in der Spalte *E-Mail* eine private Adresse, ordnet die App den Eintrag über den Namen dem Google-Konto zu (nur bei eindeutigem Namen).

> **Vertrauliche Spalten:** Wer eine Tabelle lesen darf, sieht alle ihre Spalten – in der App und direkt in Google Tabellen. Enthält die Mitgliederliste auch Interna (Bankverbindung, Beiträge, Bemerkungen …), dafür eine eigene Tabelle anlegen, die nur die freigebbaren Spalten übernimmt, z. B. mit `=IMPORTRANGE("<Link der Mitgliederliste>"; "Aktive!A:H")`, und **diese** verbinden und freigeben. Die Originalliste bleibt dann nur für den Schriftwart sichtbar.

> Wichtig bei vorhandenen Dateien: Gib der Mitglieder-Gruppe bzw. der Domain dort **nur Leserechte** („Betrachter“) und nie „Jeder mit dem Link“. Die App schreibt nie hinein, Bearbeitungsrechte braucht also kein Mitglied.

Danach **config.js herunterladen** und im GitHub-Repository ersetzen.

### B4. Termine automatisch verknüpfen (empfohlen, optional)

Die App ändert selbst keine Termine. Damit Termine aus dem Google Kalender trotzdem den Link zur App und die Einladung an alle bekommen, gibt es das Apps-Script `apps-script/Automatik.gs`. Es läuft **im Konto des Kalender-Inhabers** und trägt stündlich automatisch ein:

1. den Link zur App in die Beschreibung und
2. die Mitglieder-Gruppe als Gast (damit alle zu- oder absagen können).

Einrichtung: Die Anleitung steht oben in der Datei (5 Minuten, kein Programmieren). Ohne das Skript: Gruppe beim Anlegen des Termins selbst als Gast hinzufügen.

### B5. Verteilen an die Mitglieder

- **Anleitung als PDF** (mit QR-Code, Installation, „Was finde ich wo?“) mit der echten Adresse erzeugen:

  ```bash
  python tools/make_anleitung.py https://DEINNAME.github.io/fb-app/
  ```

  Ergebnis: `docs/Anleitung-Mitglieder-App.pdf` und `docs/qr-code.png`. Die PDF per E-Mail oder im Chat verschicken bzw. ausdrucken.
- In der App unter **Mehr → App installieren** gibt es den QR-Code ebenfalls, zum Zeigen auf dem Handy oder Teilen.
- Erinnerung an alle: einmal anmelden, **Profil ausfüllen**, App auf den Startbildschirm legen.
- **Benachrichtigungen:** Wer bei geschlossener App benachrichtigt werden will, installiert zusätzlich die App **„Google Chat“** (Direktnachrichten und Ankündigungen neuer News, E33). In unserer App schaltet jedes Mitglied Zahlen und Hinweise selbst ein (Mehr › Einstellungen › Benachrichtigungen); ohne Einschalten zeigt die App nichts an.

---

## Teil C – Daten pflegen

Alles Gemeinsame wird direkt bei Google gepflegt. Die App zeigt Änderungen nach kurzer Zeit automatisch an (spätestens nach dem nächsten Öffnen oder „Aktualisieren“).

| Was | Wo pflegen | So geht's |
|---|---|---|
| **Termine** | Google Kalender „Frankonia-Brunonia“ | Termin wie gewohnt anlegen, Mitglieder-Gruppe als Gast hinzufügen (oder Automatik, B4). Die Kategorie errät die App aus dem Titel (Kneipe, Convent, Vortrag, Stammtisch …). Optional je eine eigene Zeile in die Beschreibung: `Kategorie: Kneipe`, `Kleidung: Vollcouleur`, `Pflichttermin` |
| **News** | In der App: Neuigkeiten → **„News schreiben“** (nur Admins und Redaktion, siehe Optionen) – mit Kategorie, „oben anheften“ und Foto vom Handy. Mit **„Im Chat ankündigen“** geht zusätzlich eine Nachricht mit Link in einen Chat-Raum, in dem du bist – wer die App „Google Chat“ hat, bekommt dann eine Benachrichtigung. Bearbeiten und löschen kann jeder nur seine eigenen. Zusätzlich weiterhin möglich: Tabelle „News“ | Neue Zeile in der Tabelle: *Titel*, *Text* (Absätze, `**fett**`, Links möglich), *Datum*, *Kategorie*; *Bild* = Link zu einem Bild in Google Drive; *Angeheftet* = `ja` hält die Meldung oben; *Gelöscht* = `ja` blendet sie aus. Die *ID* ist ein beliebiges eindeutiges Kürzel (z. B. `n12`) |
| **Adressen, Geburtstage** | Tabelle „Adressverzeichnis“ | Zeilen ergänzen oder korrigieren; Geburtstag als Datum (z. B. `03.04.1970`). Die nächsten drei Geburtstage erscheinen auf der Startseite. Mitglieder prüfen ihre Angaben unter „Mein Profil“; Abweichungen kommen als vorbereitete E-Mail an das Postfach für Adressänderungen, der Schriftwart übernimmt sie hier. Damit die App jemanden zuordnet, sollte die Spalte *E-Mail* das Google-Konto der Verbindung enthalten (sonst wird über den Namen gesucht) |
| **Bundesbote** | Drive-Ordner des Bundesboten | PDF hochladen, am besten mit Dateiname `JJJJ-N Titel.pdf`, z. B. `2026-2 Bundesbote SoSe 2026.pdf` (Jahr, Nummer der Ausgabe im Jahr). Die App zeigt immer eine Seite; Doppelseiten im PDF (Querformat-Seiten, z. B. aus Scans) teilt sie selbst in zwei Einzelseiten. Jahresordner (`2019/…`, auch `Archiv/2003/…`, bis zwei Ebenen tief) sind möglich; fehlt das Jahr im Dateinamen, zählt der Ordner, „Nr. 3“ oder „Heft 3“ im Namen gilt als Nummer. Neueste Ausgabe steht oben |
| **Liedermappe** | Drive-Ordner der Liedermappe | Noten als **PDF** oder Bild (JPG, PNG) hineinlegen, am besten mit Liednummer vorn: `012 Gaudeamus igitur.pdf` (auch `12 - Titel`, `Nr. 12 Titel`). Unterordner werden zu Rubriken (`Kommerslieder/…`, bis drei Ebenen tief). Laufen die Nummern durch die ganze Mappe, zeigt die App eine Liste nach Nummer; fängt jede Rubrik wieder bei 1 an, gliedert sie nach Rubriken. Die Beschreibung einer Datei in Drive erscheint als Untertitel. Andere Dateien (Word, MuseScore, iPhone-Fotos im HEIC-Format) zeigt die App nicht an – bitte als PDF bzw. JPG ablegen. Querformat-Seiten bleiben ganz |
| **Fotos** | Drive-Ordner „Galerie“ | Pro Anlass einen **Unterordner** anlegen, Name `JJJJ-MM Name`, z. B. `2026-06 Stiftungsfest`, und die Fotos hineinladen. Auch Jahresordner mit Alben darin gehen (`2023/Stiftungsfest`, bis zwei Ebenen tief). Fotos direkt im Galerie-Ordner erscheinen als Album „Allgemein“. Neueste Alben stehen oben; Kameranamen wie `IMG_2041` blendet die App aus |
| **Chat** | In der App oder in Google Chat | Jedes Mitglied kann in der App private Nachrichten schreiben („Nachricht“ im Profil, „Neue Nachricht“), Gruppen gründen („Neue Gruppe“) und in Gruppen und Räumen, in denen es ist, Personen hinzufügen. Die App zeigt alle Unterhaltungen, in denen man Mitglied ist |
| **Profile** | jedes Mitglied selbst | In der App unter Mehr → Mein Profil (u. a. Tätigkeit und „Das kann ich jüngeren Bundesbrüdern anbieten“). Foto und Name im eigenen Google-Konto. Profile sind bewusst getrennt vom Adressverzeichnis (siehe ENTSCHEIDUNGEN.md, E7) |

---

## Fragen zur Google-Anmeldung (OAuth)

**Wer richtet was ein?** Ein Admin des Workspace legt einmal das Cloud-Projekt mit dem OAuth-Client an (Zielgruppe „Intern“) und gibt die App in der Admin-Konsole frei. Danach melden sich die Mitglieder mit ihren eigenen Konten an. Die App arbeitet dann **mit den Rechten des jeweiligen Mitglieds**: Wer auf Kalender, Tabellen und Ordner nur Leserechte hat, kann über die App auch nur lesen.

**Verändert die OAuth-Freigabe selbst etwas im Workspace?** Nein. Der OAuth-Client ist nur die „Ausweiskarte“ der App bei Google; er ändert keine Daten und keine Einstellungen. Meldet sich ein Mitglied an, darf die App in seinem Namen höchstens das, was die angefragten Berechtigungen **und** seine eigenen Rechte erlauben:
- Termine ansehen und im eigenen Kalender antworten (`calendar.events`),
- Dateien ansehen (`drive.readonly`) und nur von der App selbst angelegte Dateien bearbeiten (`drive.file`),
- das Verzeichnis lesen (`directory.readonly`) sowie Chat-Unterhaltungen lesen, eigene Nachrichten schreiben, Direktnachrichten und Gruppen anlegen und Personen hinzufügen (`chat.*`, E30). Räume löschen oder umbenennen und Mitglieder entfernen sperrt der Schreibschutz.

Zugriff auf E-Mails, fremde Dateien oder Einstellungen gibt es nicht. Zusätzlich sperrt der Schreibschutz im Code alles, was nicht eigene Daten betrifft. Nur wer in der Einrichtung einen neuen Kalender anlegen lässt (Admins), erteilt einmalig zusätzlich „Kalender verwalten“.

**Kann man die Freigabe zurücknehmen?** Ja, jederzeit:
- **jedes Mitglied für sich:** in der App unter Einstellungen → „Zugriff widerrufen“ oder unter <https://myaccount.google.com/connections>;
- **der Admin für alle:** Admin-Konsole → Sicherheit → Zugriffs- und Datenkontrolle → API-Steuerung → App-Zugriff verwalten → App sperren, oder in der Google Cloud Console den OAuth-Client bzw. das ganze Projekt löschen.

Die App erhält keine dauerhaften Schlüssel (kein Refresh-Token). Ein bereits ausgegebener Zugangsschlüssel endet spätestens nach einer Stunde.

**Braucht die App einen für Mitglieder beschreibbaren Ordner?** Nein. Gemeinsame Ordner und Tabellen sind für Mitglieder nur lesbar. Was ein Mitglied selbst speichert (Profil, Forumsbeiträge, Zusagen ohne Einladung, Datenschutz-Einwilligung), legt die App in einem eigenen kleinen Ordner in **seinem eigenen** Google Drive an. Voraussetzung ist, dass Google Drive für die Mitglieder eingeschaltet ist und Freigaben innerhalb der Organisation erlaubt sind (B2). Die Einwilligungsliste schreibt nur das Konto der Verantwortlichen.

---

## Teil D – Datenschutz und Einwilligungen

### Was die Mitglieder sehen

Beim **ersten Öffnen** der App erscheint die Datenschutzerklärung mit zwei Einwilligungen. Sie sind getrennt und jeweils mit **Ja** oder **Nein** zu beantworten:

1. **Nutzung zu vereinsüblichen Zwecken** – Einladungen und Rundschreiben, Zusendung des Bundesboten, Glückwünsche zu Geburtstagen und Jubiläen (auch auf der Startseite der App), internes Mitglieder- und Adressverzeichnis, Fotos und Berichte von Veranstaltungen (Galerie, Zeitung, Chronik), Kontaktpflege zwischen Aktiven und Alten Herren, Archiv.
2. **Weitergabe an die Deutsche Sängerschaft (DS)** – zur Kontaktaufnahme, zum Versand der Verbandszeitung, zur Bestimmung des DS-Beitrags und für allgemeine verbands- und vereinsbezogene Zwecke.

Erst nach der Entscheidung geht es in die App. Beide Einwilligungen sind freiwillig; auch mit „Nein“ funktioniert die App ganz normal. Unter **Mehr → Datenschutz** kann jedes Mitglied seine Entscheidung jederzeit ändern oder widerrufen und sieht seine bisherigen Entscheidungen. Die Erklärung ist auch ohne Anmeldung lesbar (Link auf der Anmeldeseite und unten in jeder Seite).

> **Wichtig:** Die Texte sind ein **Muster** (`js/lib/datenschutz.js`) und ersetzen keine Rechtsberatung. Bitte vom Vorstand bzw. Datenschutzbeauftragten prüfen lassen. Was für die Mitgliedschaft nötig ist (Mitgliederverwaltung, Beiträge, Einladungen zu Conventen), beruht laut Erklärung auf der Satzung und hängt nicht von der Einwilligung ab.

### Einstellungen

Unter **Einrichtung → Optionen → Datenschutz** (landet in `config.js` unter `datenschutz`):

| Feld | Bedeutung |
|---|---|
| Verantwortlicher (Verein) | Name des Vereins, z. B. „Sängerschaft Frankonia-Brunonia e. V.“ |
| Anschrift, E-Mail | Pflichtangaben in der Erklärung; fehlen sie, zeigt die App Admins einen Hinweis |
| Wer darf die Einwilligungen sehen? | einzelne E-Mail-Adressen, z. B. Vorsitzender und Schriftwart; leer = die Admins. **Keine Gruppe**, damit die Liste vertraulich bleibt |
| Dachverband | Standard „Deutsche Sängerschaft (DS)“ |
| Fassung | Wenn ihr die Einwilligungstexte ändert, die Fassung erhöhen (z. B. auf 2): Dann fragt die App alle Mitglieder beim nächsten Öffnen erneut |

### Wo und wie die Rückmeldungen gespeichert werden

- **Beim Mitglied:** Jede Entscheidung landet als kleine Datei *„Datenschutz-Einwilligung (Mitglieder-App).json“* im **eigenen** Google Drive des Mitglieds. Darin stehen die Entscheidung, Datum und Uhrzeit, Fassung, eine Prüfsumme des Wortlauts, das Gerät und die bisherigen Entscheidungen. **Inhaber und Änderungszeit setzt Google selbst** – so ist nachvollziehbar, dass die Erklärung wirklich von diesem Google-Konto kam. Lesen dürfen die Datei nur das Mitglied und die Datenschutz-Verantwortlichen; ändert sich die Liste der Verantwortlichen, passt die App die Freigabe beim nächsten Öffnen an.
- **Gesammelt:** Die vertrauliche Tabelle **„Einwilligungen (vertraulich)“** liegt im Drive der Person, die die Einrichtung gemacht hat, außerhalb des freigegebenen Ordners. Sie hat drei Blätter:
  - **Stand** – je Mitglied die aktuelle Entscheidung, mit Link zur Nachweis-Datei; Mitglieder ohne Rückmeldung stehen mit „keine Rückmeldung“ darin.
  - **Verlauf** – jede einzelne Erklärung und jeder Widerruf mit Zeitpunkt. Es wird nur ergänzt, nie überschrieben.
  - **Fassungen** – der genaue Wortlaut jeder Fassung mit Prüfsumme.
- **Wer schreibt die Tabelle?** Nur das Konto, dem sie gehört:
  - automatisch, sobald dieses Konto die App öffnet (höchstens alle 15 Minuten),
  - per Knopf unter **Mehr → Datenschutz → Einwilligungen aller Mitglieder → „Jetzt abgleichen“**,
  - und auf Wunsch **stündlich** mit dem Skript [`apps-script/Einwilligungen.gs`](../apps-script/Einwilligungen.gs) (5 Minuten Einrichtung, Anleitung oben in der Datei).

  Die anderen Verantwortlichen sehen die Übersicht in der App und können die Tabelle lesen.
- Gibt es noch keine Tabelle (z. B. weil vorhandene Dateien verbunden wurden), legt ein Verantwortlicher sie unter **Mehr → Datenschutz → Einwilligungen aller Mitglieder** mit einem Klick an. Danach die ID in der Einrichtung bei „Tabelle Einwilligungen“ eintragen und `config.js` neu herunterladen.
- **Empfehlung:** `Einwilligungen.gs` einrichten. Dann ist die Tabelle spätestens nach einer Stunde aktuell, auch wenn niemand die App öffnet. Für kürzere Abstände im Skript `everyHours(1)` durch `everyMinutes(15)` ersetzen.
- **Wechsel der Verantwortlichen** (z. B. neuer Vorstand):
  1. Unter „Wer darf die Einwilligungen sehen?“ die neuen Personen eintragen und `config.js` neu verteilen. Die Freigaben der einzelnen Einwilligungen passen sich an, sobald die Mitglieder die App öffnen.
  2. Die Tabelle in Google Drive auf die neue Person übertragen (Freigeben → Eigentümer übertragen).
  3. Dort `Einwilligungen.gs` einrichten. Die App selbst darf eine übertragene Tabelle nicht beschreiben (Google-Recht `drive.file` gilt nur für den, der sie mit der App angelegt hat), das Skript schon.

  Alternativ legt die neue Person in der App eine neue Liste an; die alte bleibt dann als Archiv mit dem bisherigen Verlauf erhalten.
- **Nachweis bleibt erhalten:** Was einmal im Blatt „Verlauf“ steht, bleibt dort, auch wenn ein Mitglied später seine Datei löscht oder austritt.

### Was tun mit einem „Nein“?

Die App setzt die Entscheidung nicht selbst um: Gemeinsame Daten ändert sie ja nicht. Der Vorstand sieht im Blatt „Stand“, wer wie entschieden hat, und handelt entsprechend, zum Beispiel:
- **Nein zu vereinsüblichen Zwecken:** Geburtstag nicht im Adressverzeichnis führen bzw. nicht veröffentlichen, auf Fotos verzichten, nicht im internen Verzeichnis zeigen (soweit nicht für die Mitgliedschaft nötig).
- **Nein zur Weitergabe an die DS:** Daten nicht an die DS melden bzw. dort löschen lassen.

---

## Wie funktionieren die Zu- und Absagen?

- **Eingeladen** (Mitglieder-Gruppe oder einzeln als Gast im Termin): Die App setzt die ganz normale Google-Antwort „Ja / Vielleicht / Nein“ **im eigenen Kalender**, inklusive Anzahl mitgebrachter Gäste und Kommentar. Google überträgt die Antwort an den Termin, genau wie beim Antworten in Google Kalender. Umgekehrt zeigt die App Antworten an, die jemand direkt in Google Kalender gibt.
- **Nicht eingeladen:** Zu- und absagen geht trotzdem. Die App speichert die Antwort (mit Gästen und Kommentar) als kleine Datei im eigenen Google Drive des Mitglieds, für die anderen Mitglieder nur lesbar; unter „Wer kommt?“ erscheint sie zusammen mit den Kalender-Antworten. Im Google Kalender des Organisators ist sie nicht zu sehen. Am Termin selbst ändert die App nichts.

Jeder Termin enthält in der Beschreibung den Link `…/#/termin/<ID>`, auch in exportierten Kalendern. Ein Tipp darauf öffnet die App direkt beim Termin (nach ggf. Anmeldung).

---

## Schreibschutz

Die App ist so gebaut, dass Mitglieder damit **nichts außer ihren eigenen Daten** ändern können, weder absichtlich noch aus Versehen:

1. **Google-Freigaben:** Kalender, Tabellen und Ordner sind für die Mitglieder nur lesbar.
2. **Berechtigungen beim Anmelden:** Die App fragt für Google Drive nur „Dateien ansehen“ (`drive.readonly`) und „von dieser App angelegte Dateien“ (`drive.file`) an, für Google Tabellen gar keine Schreibberechtigung. Fremde Dateien kann sie damit technisch nicht ändern, auch nicht im Konto eines Admins.
3. **Sperre im Code** (`js/google/guard.js`): Jede ändernde Anfrage wird vor dem Absenden geprüft. Erlaubt sind nur:
   - die eigene Antwort auf einen Termin, nur im eigenen Kalender und nur die Teilnehmerliste;
   - eigene Dateien, die die App im eigenen Drive angelegt hat (Profil, Forumsbeiträge, Zusagen ohne Einladung, Einwilligung), und deren Lese-Freigaben;
   - eigene Chat-Nachrichten, neue Unterhaltungen nur mit Personen und das Hinzufügen von Personen;
   - für die Datenschutz-Verantwortlichen: die **eigene**, von der App angelegte Einwilligungsliste.

   Alles andere wird blockiert. Die Meldung beginnt dann mit „Schreibschutz:“.
4. **Wer etwas geschrieben hat**, liest die App aus dem Dateieigentümer bei Google. Das kann niemand fälschen; fremde Beiträge und Einwilligungen erscheinen deshalb nie als eigene.

Ausnahme ist **„Fehlendes neu anlegen“** in der Einrichtung: nur für Admins, nur auf ausdrücklichen Klick, nur für das, was noch nicht eingetragen ist, und nur neue Dateien im eigenen Drive. Verbundene (vorhandene) Dateien werden dabei weder verändert noch neu freigegeben. Die Einrichtungsseite prüft die Verbindung ausschließlich lesend; sie warnt u. a. vor „Jeder mit dem Link“, vor Bearbeitungsrechten für Gruppe oder Domain und davor, dass die Einwilligungsliste versehentlich für eine Gruppe oder Domain freigegeben ist.

Der automatische Test `tests/google-mock.html` spielt alle Funktionen gegen einen Nachbau der Google-Schnittstellen durch. Er versucht dabei gezielt, gemeinsame und fremde Daten zu ändern, und prüft, dass jeder dieser Versuche blockiert wird, bevor etwas an Google gesendet wird.

---

## Häufige Fehlermeldungen

| Meldung | Ursache | Lösung |
|---|---|---|
| `redirect_uri_mismatch` | Die Adresse der App ist nicht als Weiterleitungs-URI eingetragen | Exakt die Adresse aus der Einrichtungsseite (mit `/` am Ende) beim Client eintragen |
| `access_denied` / „Zugriff blockiert“ | Konto ist kein Testnutzer (Teil A) bzw. App nicht vertrauenswürdig (Teil B) | Testnutzer eintragen bzw. App in der Admin-Konsole freigeben |
| „Google-Schnittstelle nicht aktiviert“ | Eine API fehlt im Cloud-Projekt | Die fünf Schnittstellen aus A2 aktivieren |
| „Kein Zugriff“ bei Tabellen, Kalender oder Ordnern | Freigabe fehlt | In Google Drive bzw. in den Kalender-Einstellungen für die Gruppe als „Betrachter“ freigeben |
| „Schreibschutz: …“ | Die App sollte etwas Gemeinsames ändern; das ist absichtlich gesperrt | Direkt bei Google pflegen (Teil C) |
| „Die Einwilligungsliste führt das Konto …“ | Die Tabelle gehört einer anderen Person | Normal: nur deren Konto aktualisiert sie (oder ihr Apps-Script) |
| Verantwortliche sehen keine Einwilligungen | Sie stehen nicht unter „Wer darf die Einwilligungen sehen?“ bzw. sind keine Admins | Eintragen, `config.js` neu verteilen; die Freigaben passen sich beim nächsten Öffnen der Mitglieder an |
| Profil oder Beitrag anderer nicht sichtbar | Freigabe innerhalb der Organisation ist in der Admin-Konsole gesperrt | Drive-Freigabe innerhalb der Organisation erlauben (B2) |
| „Chat braucht Google Workspace“ | Privates Konto | Normal im Prototyp, Chat geht nur mit Workspace |
| „Mitgliederliste unvollständig“ (ein Konto sieht andere, ein anderes nicht) | Diesem Konto fehlt die Berechtigung für das Verzeichnis (bei der Anmeldung abgewählt oder nie erteilt) | Auf der Mitglieder-Seite „Berechtigung erteilen“ bzw. ab- und wieder anmelden und alle Häkchen setzen; danach ggf. Mehr › Einstellungen › „Zwischenspeicher leeren“ |
| Chat: 403 / „Chat app not found“ | Chat-API-Konfiguration fehlt | B1 Schritt 4 |
| Neue Version erscheint nicht | Handy hat alte Version zwischengespeichert | App schließen und neu öffnen; es erscheint „Neue Version verfügbar → Neu laden“ |

## Zusätzliche Einstellungen in config.js (optional)

Neben den Werten aus der Einrichtung kann `config.js` diese Einstellungen anpassen:

```js
datenschutz: { verein: '…', anschrift: '…', email: '…', empfaenger: ['vorstand@…'], fassung: '1', stand: '17.10.2026' },
adressaenderung: 'adressaenderung@frankonia-brunonia.de', // Empfänger für Adressänderungen aus „Mein Profil“
forum: { aktiv: false },                         // Forum ausblenden
profilBearbeiten: false,                         // keine eigenen Profilangaben (nur Adressverzeichnis + Google-Konto)
chat: { aktiv: false },                          // Chat ausblenden
chat: { aktiv: true, newsRaum: 'spaces/AAAA…' }, // vorgeschlagener Raum für „Im Chat ankündigen“ (ID aus der Adresse des Raums)
statusOptionen: ['Fux', 'Aktiver Bursch', 'Inaktiver Bursch', 'Alter Herr', 'Ehrenmitglied'],
terminKategorien: [{ name: 'Kneipe', farbe: '#88bb2a', googleFarbe: '10' }, …],
forumKategorien: ['Allgemeines', 'Aktivitas', …],
newsKategorien: ['Allgemein', 'Aktivitas', …],
ausgeblendeteKonten: ['info@…', 'kasse@…'],      // Funktionskonten nicht als Mitglied zeigen
links: [{ titel: 'Wiki', url: 'https://…' }],   // weitere Links im Schnellzugriff und unter „Mehr“ (nur https; symbol optional, z. B. 'book')
demoErlaubt: false,                              // Demo-Knopf auf der Anmeldeseite ausblenden
```
