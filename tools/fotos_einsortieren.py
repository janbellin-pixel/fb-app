#!/usr/bin/env python3
"""Fotos aus dem Upload-Ordner in die Galerie einsortieren – Werkzeug für Verantwortliche (E59, E60).

Läuft auf dem eigenen Rechner gegen die im Explorer eingebundene geteilte Ablage (Google Drive für Desktop).
Die App selbst schreibt nie in die Galerie; dieses Skript ist der Weg vom Upload-Ordner in die Zeitachse
„Chronik/<Jahr>/<Album>“: wenige, große Alben je Jahr, ein Foto je Motiv, nichts Unpassendes (E60).

Schritte:
  plan     Dateien einer Quelle (Unterordner des Upload-Ordners) nach Tag gruppieren – Datum aus dem Dateinamen,
           sonst aus EXIF – Termine aus dem Kalender (ICS) zuordnen, je Gruppe einen Kontaktbogen (20 Vorschaubilder)
           erzeugen und einen Plan als CSV schreiben. Spalte „ziel“ = Album relativ zur Chronik („2026/2026-06-20
           133. Stiftungsfest“; mit „/“ davor relativ zur Galerie, etwa „/Dia-Scans/Magazin 01“), „Semester“ = kein
           eigenes Album (Vorgabe ohne eindeutigen Termin), leer = bleibt liegen.
           --je-ordner (E61): jeder Ordner mit Bildern ist eine Gruppe (Datum aus drei EXIF-Stichproben, passend zum
           Semesterordner; Titel aus dem Ordnernamen); Unterordner ab --mindestalbum Bildern werden eigene Alben
           „Titel – Unterordner“, kleinere gehen im Album darüber auf und ihre Dateien bekommen den Unterordner als
           Vorsilbe (die App zeigt sie als Bildunterschrift). Spalten „ordner“, „titel“, „vorsilbe“.
  auswahl  Den Plan auf ein Foto je Motiv eindampfen (Serien gleicher Motive, es bleibt das schärfste Bild; --ohne-doppelte
           behält alles), Gesperrte (sperrliste.txt) ausnehmen, Alben unter der Mindestgröße ins Semester-Album legen
           (Vorsilbe = Titel des Ordners); Videos bleiben bei ihrem Album (die App spielt sie ab, E62). Schreibt
           auswahl.csv und Bögen zum Sichten (sichtung_*.jpg: alles, was in die Galerie käme; serien_*.jpg: was entfällt).
  move     auswahl.csv ausführen: Fotos in die Zielalben verschieben (innerhalb derselben Ablage, Drive lädt nichts neu
           hoch), Doppelte und Gesperrte nach „Archiv/Nicht in der Galerie/<Quelle>/…“, Protokoll schreiben (auch in den
           Archiv-Ordner), leere Quellordner entfernen. Nichts wird gelöscht.
  undo     Ein Protokoll rückwärts ausführen.

Einstellungen in tools/fotos_einsortieren.lokal.json (nicht im Repository, Vorlage: fotos_einsortieren.beispiel.json):
  upload, galerie, archiv (Ordner), ics (Kalender-Adresse oder Datei), chronik (Name des Zeitachsen-Ordners).

Beispiele:
  python tools/fotos_einsortieren.py plan --quelle "Fotos Bahl unsortiert" --ausgabe C:/Temp/bahl
  python tools/fotos_einsortieren.py auswahl --plan C:/Temp/bahl/plan.csv      (Bögen sichten, ggf. sperrliste.txt, erneut)
  python tools/fotos_einsortieren.py move --plan C:/Temp/bahl/plan.csv --probe (dann ohne --probe)
  python tools/fotos_einsortieren.py undo --protokoll C:/Temp/bahl/protokoll.csv
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import shutil
import struct
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps, ImageStat

HIER = Path(__file__).resolve().parent
BILD = {'.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif', '.tif', '.tiff', '.bmp'}
VIDEO = {'.mp4', '.mov', '.m4v', '.avi', '.3gp', '.mkv'}
# Datum (und Uhrzeit) im Dateinamen, z. B. 20230123_014446.jpg, IMG-20230525-WA0012.jpg, WhatsApp Image 2024-06-15 at 19.20.33.jpeg
NAME_MUSTER = [
    re.compile(r'(?<!\d)(20\d\d|19\d\d)(\d\d)(\d\d)[_-](\d\d)(\d\d)(\d\d)(?!\d)'),
    re.compile(r'(?<!\d)(20\d\d|19\d\d)-(\d\d)-(\d\d)[ _T-](?:at )?(\d\d)[.:-](\d\d)[.:-](\d\d)(?!\d)'),
    re.compile(r'(?<!\d)(20\d\d|19\d\d)(\d\d)(\d\d)(?!\d)'),
    re.compile(r'(?<!\d)(20\d\d|19\d\d)-(\d\d)-(\d\d)(?!\d)'),
]
# Nachtfotos gehören zum Abend davor: Tagwechsel um 5 Uhr
TAGWECHSEL = dt.timedelta(hours=5)
VERBOTEN = re.compile(r'[\\/:*?"<>|]+')


# ---------------------------------------------------------------- Einstellungen

def einstellungen(args):
    cfg = {}
    pfad = HIER / 'fotos_einsortieren.lokal.json'
    if pfad.exists():
        cfg = json.loads(pfad.read_text(encoding='utf-8'))
    for k in ('upload', 'galerie', 'archiv', 'ics', 'chronik'):
        v = getattr(args, k, None)
        if v:
            cfg[k] = v
    cfg.setdefault('chronik', 'Chronik')
    fehlt = [k for k in ('upload', 'galerie') if not cfg.get(k)]
    if fehlt:
        sys.exit(f'Einstellung fehlt: {", ".join(fehlt)} (fotos_einsortieren.lokal.json oder --upload/--galerie)')
    return cfg


# ---------------------------------------------------------------- Datum je Datei

def datum_aus_name(name):
    for m in NAME_MUSTER:
        t = m.search(name)
        if not t:
            continue
        g = [int(x) for x in t.groups()]
        try:
            if len(g) == 6:
                return dt.datetime(*g), 'name'
            return dt.datetime(g[0], g[1], g[2], 12, 0, 0), 'name-tag'
        except ValueError:
            continue
    return None, ''


def exif_datum(pfad):
    try:
        with Image.open(pfad) as im:
            ex = im.getexif()
            d = ex.get_ifd(0x8769).get(36867) or ex.get(306)
            if d:
                return dt.datetime.strptime(str(d)[:19], '%Y:%m:%d %H:%M:%S'), 'exif'
    except Exception:
        pass
    return None, ''


def dateien_sammeln(quelle):
    """Alle Bilder und Videos unterhalb der Quelle mit Zeitpunkt"""
    out = []
    for dp, dn, fn in os.walk(quelle):
        dn.sort()
        for f in sorted(fn):
            ext = os.path.splitext(f)[1].lower()
            if ext not in BILD and ext not in VIDEO:
                continue
            p = os.path.join(dp, f)
            zeit, woher = datum_aus_name(f)
            if not zeit and ext in BILD:
                zeit, woher = exif_datum(p)
            if not zeit:
                zeit, woher = dt.datetime.fromtimestamp(os.path.getmtime(p)), 'mtime'
            out.append({'pfad': p, 'name': f, 'zeit': zeit, 'woher': woher, 'typ': 'video' if ext in VIDEO else 'bild'})
    out.sort(key=lambda e: (e['zeit'], e['name']))
    return out


def gruppen_bilden(dateien):
    """Je Veranstaltungstag eine Gruppe (Nacht zählt zum Vortag)"""
    gruppen = defaultdict(list)
    for e in dateien:
        gruppen[(e['zeit'] - TAGWECHSEL).date()].append(e)
    return [(tag, gruppen[tag]) for tag in sorted(gruppen)]


# ---------------------------------------------------------------- Kalender

def ics_laden(quelle, ablage):
    if not quelle:
        return []
    if re.match(r'^https?://', quelle):
        try:
            with urllib.request.urlopen(quelle, timeout=60) as r:
                daten = r.read()
            (ablage / 'kalender.ics').write_bytes(daten)
        except Exception as e:
            print(f'Kalender nicht geladen ({e}) – nehme die zuletzt gespeicherte Kopie, falls vorhanden', file=sys.stderr)
            daten = (ablage / 'kalender.ics').read_bytes() if (ablage / 'kalender.ics').exists() else b''
    else:
        daten = Path(quelle).read_bytes()
    text = daten.decode('utf-8', 'replace').replace('\r\n', '\n').replace('\n ', '')
    termine = []
    for block in text.split('BEGIN:VEVENT')[1:]:
        block = block.split('END:VEVENT')[0]
        felder = {}
        for zeile in block.split('\n'):
            if ':' not in zeile:
                continue
            k, v = zeile.split(':', 1)
            felder[k.split(';')[0]] = (k, v.strip())
        start = felder.get('DTSTART')
        if not start:
            continue
        try:
            d1 = dt.date(int(start[1][:4]), int(start[1][4:6]), int(start[1][6:8]))
            ende = felder.get('DTEND')
            if ende:
                d2 = dt.date(int(ende[1][:4]), int(ende[1][4:6]), int(ende[1][6:8]))
                if 'VALUE=DATE' in ende[0]:
                    d2 -= dt.timedelta(days=1)  # ganztägig: DTEND ist exklusiv
                elif len(ende[1]) > 8 and int(ende[1][9:11]) < 5:
                    d2 -= dt.timedelta(days=1)  # endet in der Nacht: gehört zum Vortag
            else:
                d2 = d1
        except ValueError:
            continue
        titel = felder.get('SUMMARY', ('', ''))[1].replace('\\,', ',').replace('\\;', ';')
        termine.append({'von': d1, 'bis': max(d1, d2), 'titel': titel, 'serie': 'RRULE' in felder})
    return termine


def termine_zu_tag(termine, tag):
    return [t for t in termine if t['von'] - dt.timedelta(days=1) <= tag <= t['bis']]


# ---------------------------------------------------------------- Kontaktbögen

def exif_vorschau(im):
    """Eingebettetes EXIF-Vorschaubild (liegt in den ersten Kilobytes – spart das Laden ganzer Dateien)"""
    raw = im.info.get('exif')
    if not raw or not raw.startswith(b'Exif\x00\x00'):
        return None
    t = raw[6:]
    if len(t) < 8:
        return None
    end = '<' if t[:2] == b'II' else '>'
    try:
        u16 = lambda o: struct.unpack(end + 'H', t[o:o + 2])[0]  # noqa: E731
        u32 = lambda o: struct.unpack(end + 'I', t[o:o + 4])[0]  # noqa: E731
        ifd0 = u32(4)
        ifd1 = u32(ifd0 + 2 + u16(ifd0) * 12)
        if not ifd1 or ifd1 + 2 > len(t):
            return None
        off = laenge = None
        for i in range(u16(ifd1)):
            e = ifd1 + 2 + i * 12
            tag = u16(e)
            if tag == 0x0201:
                off = u32(e + 8)
            elif tag == 0x0202:
                laenge = u32(e + 8)
        if not off or not laenge:
            return None
        daten = t[off:off + laenge]
        if not daten.startswith(b'\xff\xd8'):
            return None
        return Image.open(io.BytesIO(daten)).convert('RGB')
    except Exception:
        return None


def vorschau(pfad, groesse=(200, 150)):
    try:
        with Image.open(pfad) as im:
            ori = im.getexif().get(274, 1)
            klein = exif_vorschau(im)
            if klein is None:
                im.draft('RGB', (groesse[0] * 2, groesse[1] * 2))
                klein = im.convert('RGB')
                klein.thumbnail((groesse[0] * 2, groesse[1] * 2))
                ori = 1 if False else ori
            if ori in (3, 6, 8):
                klein = klein.transpose({3: Image.Transpose.ROTATE_180, 6: Image.Transpose.ROTATE_270, 8: Image.Transpose.ROTATE_90}[ori])
            klein.thumbnail(groesse)
            return klein
    except Exception:
        return None


def schrift(groesse):
    for name in ('arial.ttf', 'DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(name, groesse)
        except OSError:
            continue
    return ImageFont.load_default()


def kontaktbogen(dateien, titel, ziel, spalten=5, zeilen=4, zelle=(200, 150), mit_gruppe=False):
    """Bis zu spalten×zeilen Vorschaubilder gleichmäßig aus der Gruppe, mit Nummer und Uhrzeit
    (mit_gruppe: Monatsbogen über mehrere kleine Gruppen – beschriftet mit Gruppe und Tag)"""
    n = spalten * zeilen
    auswahl = dateien if len(dateien) <= n else [dateien[round(i * (len(dateien) - 1) / (n - 1))] for i in range(n)]
    kopf, fuss = 30, 18
    breite = spalten * zelle[0]
    hoehe = kopf + zeilen * (zelle[1] + fuss)
    bogen = Image.new('RGB', (breite, hoehe), (28, 28, 28))
    zeichnen = ImageDraw.Draw(bogen)
    zeichnen.text((8, 7), titel, fill=(255, 255, 255), font=schrift(16))
    klein = schrift(12)
    for i, e in enumerate(auswahl):
        x = (i % spalten) * zelle[0]
        y = kopf + (i // spalten) * (zelle[1] + fuss)
        bild = vorschau(e['pfad'], zelle) if e['typ'] == 'bild' else None
        if bild is not None:
            bogen.paste(bild, (x + (zelle[0] - bild.width) // 2, y + (zelle[1] - bild.height) // 2))
        else:
            zeichnen.rectangle((x + 2, y + 2, x + zelle[0] - 3, y + zelle[1] - 3), outline=(120, 120, 120))
            zeichnen.text((x + 10, y + zelle[1] // 2 - 8), 'VIDEO' if e['typ'] == 'video' else 'kein Bild', fill=(200, 200, 200), font=klein)
        nr = dateien.index(e) + 1
        text = f'{e.get("gid", "")} {e["zeit"]:%d.%m. %H:%M}' if mit_gruppe else f'{nr} · {e["zeit"]:%H:%M}'
        zeichnen.text((x + 4, y + zelle[1] + 2), text, fill=(230, 230, 230), font=klein)
    bogen.save(ziel, 'JPEG', quality=82)


# ---------------------------------------------------------------- plan

def titel_bereinigen(s):
    return VERBOTEN.sub('-', s).strip(' .')


PLAN_SPALTEN = ['id', 'tag', 'wochentag', 'bilder', 'videos', 'von', 'bis', 'termine', 'ziel', 'hinweis', 'ordner', 'titel', 'vorsilbe']


def plan_schreiben(ablage, plan, listen):
    with open(ablage / 'plan.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=PLAN_SPALTEN, delimiter=';', extrasaction='ignore')
        w.writeheader()
        w.writerows([{k: z.get(k, '') for k in PLAN_SPALTEN} for z in plan])
    (ablage / 'dateien.json').write_text(json.dumps(listen, ensure_ascii=False, indent=0), encoding='utf-8')


def cmd_plan(args, cfg):
    quelle = os.path.join(cfg['upload'], args.quelle) if args.quelle else cfg['upload']
    ablage = Path(args.ausgabe or (HIER.parent / 'tmp' / 'einsortieren'))
    ablage.mkdir(parents=True, exist_ok=True)
    print(f'Quelle: {quelle}')
    termine = ics_laden(cfg.get('ics'), ablage)
    print(f'{len(termine)} Termine im Kalender')
    if args.je_ordner:
        return plan_je_ordner(args, quelle, ablage, termine)
    dateien = dateien_sammeln(quelle)
    if args.max:
        dateien = dateien[:args.max]
    print(f'{len(dateien)} Dateien, Datum aus: ' + ', '.join(f'{k}={v}' for k, v in sorted(
        ((w, sum(1 for e in dateien if e['woher'] == w)) for w in {e['woher'] for e in dateien}), key=lambda x: -x[1])))
    gruppen = gruppen_bilden(dateien)
    plan = []
    listen = {}
    kleine = defaultdict(list)  # kleine Gruppen je Monat auf einen gemeinsamen Bogen
    for i, (tag, liste) in enumerate(gruppen, 1):
        gid = f'g{i:03d}'
        for e in liste:
            e['gid'] = gid
        kandidaten = termine_zu_tag(termine, tag)
        feste = [t for t in kandidaten if not t['serie']]
        eindeutig = len(feste) == 1
        plan.append({
            'id': gid, 'tag': tag.isoformat(), 'wochentag': ('Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So')[tag.weekday()],
            'bilder': sum(1 for e in liste if e['typ'] == 'bild'), 'videos': sum(1 for e in liste if e['typ'] == 'video'),
            'von': min(e['zeit'] for e in liste).strftime('%H:%M'), 'bis': max(e['zeit'] for e in liste).strftime('%H:%M'),
            'termine': ' | '.join((('(Serie) ' if t['serie'] else '') + t['titel']) for t in kandidaten),
            'ziel': f'{tag.year}/{tag.isoformat()} {titel_bereinigen(feste[0]["titel"])}' if eindeutig else SEMESTER,
            'hinweis': '' if eindeutig else 'kein eindeutiger Termin: Titel eintragen oder im Semester-Album lassen',
        })
        listen[gid] = [e['pfad'] for e in liste]
        if args.ohne_boegen:
            continue
        if plan[-1]['bilder'] >= args.mindestens:
            kontaktbogen(liste, f'{gid} · {tag:%a %d.%m.%Y} · {len(liste)} Dateien · {plan[-1]["termine"] or "kein Termin"}'[:110], ablage / f'bogen_{gid}.jpg')
        else:
            kleine[tag.strftime('%Y-%m')].extend(liste)
    for monat, liste in sorted(kleine.items()):
        gids = sorted({e['gid'] for e in liste})
        kontaktbogen(liste, f'Monat {monat} · kleine Gruppen {gids[0]}–{gids[-1]} · {len(liste)} Dateien', ablage / f'monat_{monat}.jpg',
                     zelle=(160, 120), mit_gruppe=True)
    plan_schreiben(ablage, plan, listen)
    print(f'{len(plan)} Gruppen → {ablage / "plan.csv"}' + ('' if args.ohne_boegen else f', Kontaktbögen bogen_g*.jpg (ab {args.mindestens} Bildern) und monat_*.jpg in {ablage}'))
    for z in plan:
        print(f'{z["id"]} {z["wochentag"]} {z["tag"]} {z["bilder"]:4d} B {z["videos"]:2d} V {z["von"]}–{z["bis"]}  {z["termine"][:70]}')
    print(f'Dann „ziel“ prüfen (Titel eintragen, „{SEMESTER}“ lassen oder leeren) und „auswahl --plan {ablage / "plan.csv"}“ ausführen')


# ---------------------------------------------------------------- plan --je-ordner (E61)

# Ordner alter Fotoarchive: Semester- und Sammelordner sind nur Hüllen, Unterordner sind die Alben
SEMESTER_NAME = re.compile(r'^(ss|sose|sommersemester|ws|wise|wintersemester|wintersemster)[_ -]?(\d{4}|\d{2})', re.I)
GENERISCH = re.compile(r'^(?:album|neuer ordner|ordner|fotos?|bilder|pics?|dcim|camera|kamera|sonstiges)(?:[ _-]?\d+)?$', re.I)
ROHSCAN = re.compile(r'^(?:img|scan|bild)[ _-]?\d{3,4}\.(?:jpe?g|tiff?|png)$', re.I)
# Abkürzungen und Schreibweisen aus Ordnernamen → Titel
TITEL_WOERTER = {
    'ankneipe': 'Ankneipe', 'abkneipe': 'Abkneipe', 'kk': 'Kreuzkneipe', 'kreuzkneipe': 'Kreuzkneipe', 'uecomm': 'Übergabekommers',
    'stifte': 'Stiftungsfest', 'stiftungsfest': 'Stiftungsfest', 'adv': 'Adventskaffee', 'adventskaffee': 'Adventskaffee',
    'chorsem': 'Chorseminar', 'sofe': 'Sommerfest', 'sommerfest': 'Sommerfest', 'bosseln': 'Boßeln', 'weisserfleck': 'Weißer Fleck',
    'havanaclubparty': 'Havana-Club-Party', 'bierathlon': 'Bierathlon', 'siegerehrung': 'Siegerehrung', 'begruessungsabend': 'Begrüßungsabend',
    'begruessung': 'Begrüßung', 'landesvater': 'Landesvater', 'uebungen': 'Übungen', 'festball': 'Festball', 'kommers': 'Kommers',
    'exbummel': 'Exbummel', 'feuerzangenbowle': 'Feuerzangenbowle', 'dartturnier': 'Dartturnier', 'segeln': 'Segeln', 'ah': 'AH', 'ab': 'AB',
    'partyvorbereitungen': 'Partyvorbereitungen', 'aktivenfahrt': 'Aktivenfahrt', 'semesterankneipe': 'Semesterankneipe',
    'und': 'und', 'mit': 'mit', 'oder': 'oder', 'der': 'der', 'die': 'die', 'das': 'das', 'im': 'im', 'am': 'am', 'in': 'in',
}


def semester_aus_name(name):
    """(Startjahr, 'S'|'W') aus Ordnernamen wie ss2005, ws0405, sommersemester_2003, WS1314 – sonst None"""
    m = SEMESTER_NAME.match(name)
    if not m:
        return None
    z = m.group(2)
    jahr = int(z) if len(z) == 4 and int(z) >= 1900 else 2000 + int(z[:2])
    return jahr, 'S' if m.group(1).lower() in ('ss', 'sose', 'sommersemester') else 'W'


def titel_aus_name(name):
    """Ordnername → Titel: ohne Semester-Kürzel, Jahreszahlen und Nummern, Unterstriche zu Leerzeichen, bekannte Kürzel ausgeschrieben;
    Platzhalternamen wie „album_003“ ergeben '' (Titel kommt vom Kontaktbogen)"""
    if GENERISCH.match(name) or semester_aus_name(name) and len(name) <= 8:
        return ''
    s = re.sub(r'(?i)[_ -]?(ss|ws|sose|wise)[_ -]?\d{2,8}(?:[_-]\d{2,4})?$', '', name)  # ankneipe_ss2005, kk_ws0405, abkneipe_ws200405
    s = re.sub(r'(?i)^(ss|ws|sose|wise)[_ -]?\d{2,4}[_-]+', '', s)  # ss2009_akwhameln
    s = re.sub(r'(?<!\d)(19|20)\d{2}(?!\d)', ' ', s)  # Jahreszahlen, auch angehängt (stifte2005, Ralf2006)
    s = re.sub(r'(?<=[A-Za-zäöüß])\d{2,3}$', '', s)  # SoFe17, stifte120, Ankneipe1718 (schon oben)
    s = re.sub(r'^\d+[_ .-]+', '', s)  # 31_Danzig_Stadt
    s = re.sub(r'^[A-F]_', '', s)  # A_Begruessungsabend
    s = re.sub(r'[_\s]+', ' ', s).strip(' -_.')
    worte = [TITEL_WOERTER.get(w.lower(), w[:1].upper() + w[1:]) for w in s.split(' ') if w]
    return titel_bereinigen(' '.join(worte))


GRUENDUNG = 1893  # Stiftungsfest-Nummer = Jahr − Gründungsjahr (2005 → 112.)


def mit_nummer(titel, jahr):
    """„Stiftungsfest“ bekommt seine Nummer aus dem Jahr, wenn sie fehlt"""
    if titel.lower().startswith('stiftungsfest') and jahr and not re.match(r'^\d+\.', titel):
        return f'{int(jahr) - GRUENDUNG}. {titel}'
    return titel


def ordner_datum(dp, bilder, semester):
    """Datum eines Ordners aus drei Stichproben (Dateiname, sonst EXIF) – nur Daten, die zum Semesterordner passen:
    (Text „JJJJ-MM-TT“ | „JJJJ-MM“ | „JJJJ“ | '', Tag, Herkunft)"""
    proben = [bilder[round(i * (len(bilder) - 1) / 2)] for i in range(3)] if len(bilder) >= 3 else list(bilder)
    daten = []
    for f in dict.fromkeys(proben):
        z, _ = datum_aus_name(f)
        if not z:
            z, _ = exif_datum(os.path.join(dp, f))
        if z and 1990 <= z.year <= dt.date.today().year:
            daten.append(z.date())
    if semester:
        jahr, art = semester
        von = dt.date(jahr, 4, 1) if art == 'S' else dt.date(jahr, 10, 1)
        bis = dt.date(jahr, 9, 30) if art == 'S' else dt.date(jahr + 1, 3, 31)
        passend = [d for d in daten if von - dt.timedelta(days=45) <= d <= bis + dt.timedelta(days=45)]
        if daten and not passend:
            return (f'{jahr}-04' if art == 'S' else f'{jahr}-10'), von, 'semester (EXIF passt nicht)'
        daten = passend
    daten.sort()
    if daten:
        if (daten[-1] - daten[0]).days <= 3:
            return daten[0].isoformat(), daten[0], 'exif'
        mitte = daten[len(daten) // 2]
        if daten[0].year == daten[-1].year and daten[0].month == daten[-1].month:
            return mitte.strftime('%Y-%m'), mitte.replace(day=1), 'exif (Monat)'
        return str(mitte.year), dt.date(mitte.year, 1, 1), 'exif (nur Jahr)'
    if semester:
        jahr, art = semester
        return (f'{jahr}-04', dt.date(jahr, 4, 1), 'semester') if art == 'S' else (f'{jahr}-10', dt.date(jahr, 10, 1), 'semester')
    return '', None, 'offen'


def plan_je_ordner(args, quelle, ablage, termine):
    """Jeder Ordner mit Bildern ist eine Gruppe. Ebenen: Hülle (Semester- oder Sammelordner oben) → Album → Unterordner.
    Unterordner ab --mindestalbum Bildern (samt Inhalt) werden eigene Alben „Titel – Unterordner“, kleinere und tiefer
    liegende gehen im Album darüber auf (ziel des Albums, Vorsilbe = eigener Titel). Hüllen ohne eigenen Titel liefern
    kein Albumziel: dann steht nur das Datum, der Titel kommt vom Kontaktbogen."""
    ordner = {}  # rel → Angaben
    for dp, dn, fn in os.walk(quelle):
        dn.sort()
        bilder = sorted(f for f in fn if os.path.splitext(f)[1].lower() in BILD)
        videos = sorted(f for f in fn if os.path.splitext(f)[1].lower() in VIDEO)
        rel = os.path.relpath(dp, quelle).replace('\\', '/')
        teile = [] if rel == '.' else rel.split('/')
        ordner[rel] = {'rel': rel, 'teile': teile, 'dp': dp, 'bilder': bilder, 'videos': videos, 'unter': sorted(dn)}
    # Bilder samt Unterordnern und Semester je Ordner
    def gesamt(rel):
        o = ordner[rel]
        if 'gesamt' not in o:
            o['gesamt'] = len(o['bilder']) + sum(gesamt((rel + '/' if rel != '.' else '') + u) for u in o['unter'] if (rel + '/' if rel != '.' else '') + u in ordner)
        return o['gesamt']
    for rel, o in ordner.items():
        sem = None
        for t in o['teile']:
            sem = semester_aus_name(t) or sem
        o['semester'] = sem
        o['huelle'] = bool(o['teile']) and len(o['teile']) == 1 and (bool(semester_aus_name(o['teile'][0])) or bool(GENERISCH.match(o['teile'][0])) or (not o['bilder'] and bool(o['unter'])))
    # Datum und Titel je Ordner (Datum notfalls vom ersten Unterordner mit Bildern)
    def datum(rel):
        o = ordner[rel]
        if 'datum' not in o:
            if o['bilder']:
                o['datum'] = ordner_datum(o['dp'], o['bilder'], o['semester'])
            else:
                kinder = [(rel + '/' if rel != '.' else '') + u for u in o['unter']]
                erst = next((k for k in kinder if k in ordner and gesamt(k)), None)
                o['datum'] = datum(erst) if erst else ordner_datum(o['dp'], [], o['semester'])
        return o['datum']
    def albumebene(teile):
        return 2 if teile and ordner.get(teile[0], {}).get('huelle') else 1
    def ziel_von(rel):
        """(ziel, titel, vorsilbe) für den Ordner: eigenes Album, Album darüber oder Hülle"""
        o = ordner[rel]
        teile = o['teile']
        if 'ziel' in o:
            return o['ziel']
        ebene = albumebene(teile)
        text, tag, _ = datum(rel)
        jahr = text[:4]
        eigen = mit_nummer(titel_aus_name(teile[-1]), jahr) if teile else ''
        if len(teile) <= ebene:  # Album (oder Hülle mit losen Bildern)
            titel = eigen if len(teile) == ebene else ''
            o['ziel'] = (f'{jahr}/{text} {titel}'.strip() if text else '', titel, '')
        elif len(teile) == ebene + 1 and gesamt(rel) >= args.mindestalbum:  # Unterordner als eigenes Album
            oben = ziel_von('/'.join(teile[:ebene]))
            titel = f'{oben[1]} – {eigen}' if oben[1] and eigen else (eigen or oben[1])
            o['ziel'] = (f'{jahr}/{text} {titel}'.strip() if text else '', titel, '')
        else:  # geht im Album darüber auf
            oben = ziel_von('/'.join(teile[:-1]))
            o['ziel'] = (oben[0], oben[1], eigen or oben[2])
        return o['ziel']
    plan = []
    listen = {}
    kleine = defaultdict(list)
    n = 0
    for rel in sorted(ordner, key=lambda r: ordner[r]['teile']):
        o = ordner[rel]
        if not o['bilder'] and not o['videos']:
            continue
        n += 1
        gid = f'f{n:03d}'
        text, tag, woher = datum(rel)
        ziel, titel, vorsilbe = ziel_von(rel)
        rohscan = bool(o['bilder']) and all(ROHSCAN.match(f) for f in o['bilder'])
        liste = []
        for f in o['bilder'] + o['videos']:
            z, _ = datum_aus_name(f)
            liste.append({'pfad': os.path.join(o['dp'], f), 'name': f, 'zeit': z or dt.datetime.combine(tag or dt.date(1900, 1, 1), dt.time(12)),
                          'typ': 'video' if os.path.splitext(f)[1].lower() in VIDEO else 'bild', 'gid': gid})
        kandidaten = termine_zu_tag(termine, tag) if tag and woher == 'exif' else []
        hinweise = []
        if not text:
            hinweise.append('kein Datum')
        elif not titel and not vorsilbe:
            hinweise.append('Titel fehlt (Kontaktbogen)')
        if rohscan:
            hinweise.append('Rohscans')
        if vorsilbe:
            hinweise.append(f'geht auf in „{ziel}“')
        plan.append({
            'id': gid, 'tag': tag.isoformat() if tag else '', 'wochentag': ('Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So')[tag.weekday()] if tag else '',
            'bilder': len(o['bilder']), 'videos': len(o['videos']), 'von': text, 'bis': woher,
            'termine': ' | '.join((('(Serie) ' if t['serie'] else '') + t['titel']) for t in kandidaten),
            'ziel': ziel, 'hinweis': '; '.join(hinweise), 'ordner': rel, 'titel': titel, 'vorsilbe': vorsilbe,
        })
        listen[gid] = [e['pfad'] for e in liste]
        # Bögen nur für Ordner ohne Titel (dort kommt der Titel vom Bogen); alte Archive haben oft keine EXIF-Vorschau,
        # dann muss jede Datei ganz gelesen werden – darum nur zwölf Bilder je Bogen
        if args.ohne_boegen or titel or vorsilbe or rohscan:
            continue
        if len(o['bilder']) >= args.mindestens:
            kontaktbogen(liste, f'{gid} · {rel} · {text or "?"} · {len(liste)} Dateien'[:110], ablage / f'bogen_{gid}.jpg', spalten=4, zeilen=3, zelle=(240, 180))
        else:
            kleine[o['teile'][0] if o['teile'] else '(oben)'].extend(liste)
    for huelle, liste in sorted(kleine.items()):
        gids = sorted({e['gid'] for e in liste})
        kontaktbogen(liste, f'{huelle} · kleine Ordner {gids[0]}–{gids[-1]} · {len(liste)} Dateien'[:110], ablage / f'klein_{titel_bereinigen(huelle)[:30]}.jpg',
                     zelle=(160, 120), mit_gruppe=True)
    plan_schreiben(ablage, plan, listen)
    print(f'{len(plan)} Ordner → {ablage / "plan.csv"}' + ('' if args.ohne_boegen else f', Kontaktbögen bogen_f*.jpg (Ordner ohne Titel ab {args.mindestens} Bildern) und klein_*.jpg in {ablage}'))
    for z in plan:
        print(f'{z["id"]} {z["von"]:10} {z["bilder"]:4d} B {z["videos"]:2d} V  {z["ziel"][:50]:50} {("← " + z["vorsilbe"]) if z["vorsilbe"] else ""} {z["hinweis"]}  [{z["ordner"]}]')
    print(f'Dann „ziel“ und „titel“ prüfen und „auswahl --plan {ablage / "plan.csv"} --ohne-doppelte“ ausführen')


# ---------------------------------------------------------------- auswahl (E60)

# Gleiches Motiv wie das ERSTE Bild einer Serie, wenn der dHash-Abstand höchstens so viele Bit beträgt und seit dem
# letzten Bild der Serie höchstens so viele Sekunden vergangen sind (None = egal): fast gleiche Bilder immer,
# ähnliche innerhalb einer Minute, grob ähnliche innerhalb von 20 Sekunden (Serienaufnahme)
MOTIV_REGELN = [(6, None), (20, 60), (26, 20)]
STETS_EIGEN = ('Stiftungsfest',)  # eigenes Album schon ab zwei Dritteln der Mindestgröße
SEMESTER = 'Semester'  # „ziel“ in plan.csv: kein eigenes Album, ins Semester-Album
ARCHIV_ORDNER = {'doppelt': 'Doppelte', 'video': 'Videos', 'gesperrt': 'Aussortiert'}  # unter Archiv/Nicht in der Galerie/<Quelle>/


def dhash(im):
    """64-Bit-Differenzhash: Graustufen 9×8, je Bit „linker Nachbar heller als rechter“ – unempfindlich gegen Größe und Qualität"""
    g = im.convert('L').resize((9, 8), Image.Resampling.LANCZOS)
    px = list(g.getdata())
    h = 0
    for r in range(8):
        for c in range(8):
            h = (h << 1) | int(px[r * 9 + c] > px[r * 9 + c + 1])
    return h


def abstand(a, b):
    return bin(a ^ b).count('1')


def schaerfe(im):
    """Grobes Schärfemaß (mittlere Kantenstärke bei fester Größe) – reicht, um in einer Serie das schärfste Bild zu wählen"""
    g = ImageOps.fit(im.convert('L'), (128, 96))
    return round(ImageStat.Stat(g.filter(ImageFilter.FIND_EDGES)).mean[0], 2)


def serien_bilden(bilder):
    """Serien gleicher Motive in einer Tagesgruppe: zeitlich sortiert; ein Bild kommt zu einer Serie, wenn es deren ERSTEM
    Bild nach MOTIV_REGELN ähnelt – so entstehen keine Ketten über allmählich wechselnde Bilder"""
    serien = []  # [erstes Bild, Zeit des letzten Bildes, Mitglieder]
    for e in sorted(bilder, key=lambda x: (x['zeit'], x['name'])):
        treffer = None
        if e['hash'] is not None:
            for s in reversed(serien):
                if s[0]['hash'] is None:
                    continue
                d = abstand(s[0]['hash'], e['hash'])
                sek = (e['zeit'] - s[1]).total_seconds()
                if any(d <= dm and (sm is None or sek <= sm) for dm, sm in MOTIV_REGELN):
                    treffer = s
                    break
        if treffer is None:
            serien.append([e, e['zeit'], [e]])
        else:
            treffer[1] = e['zeit']
            treffer[2].append(e)
    return [s[2] for s in serien]


def bestes_der_serie(serie):
    """Das Bild, das bleibt: unter denen, die den anderen der Serie am ähnlichsten sind (Abstandssumme höchstens 2 Bit je
    Bild über der kleinsten – so bleibt kein Ausreißer, der nur knapp in die Serie rutschte), das schärfste; bei Gleichstand das erste"""
    summen = [sum(abstand(e['hash'], f['hash']) for f in serie if f is not e and f['hash'] is not None) if e['hash'] is not None else None
              for e in serie]
    gueltig = [s for s in summen if s is not None]
    if not gueltig:
        return max(serie, key=lambda e: e['schaerfe'])
    grenze = min(gueltig) + 2 * (len(serie) - 1)
    return max((e for e, s in zip(serie, summen) if s is not None and s <= grenze), key=lambda e: e['schaerfe'])


def semester_von(tag):
    """(Startjahr, 'S' oder 'W') des Semesters eines Tages: Sommer April–September, Winter Oktober–März"""
    if 4 <= tag.month <= 9:
        return tag.year, 'S'
    return (tag.year if tag.month >= 10 else tag.year - 1), 'W'


def semester_album(schluessel, erster_tag):
    """Album (relativ zur Chronik) für Fotos ohne eigenes Album; liegt im Jahresordner des ersten Fotos"""
    jahr, art = schluessel
    if art == 'S':
        return f'{jahr}/{jahr}-04 Sommersemester {jahr}'
    name = f'Wintersemester {jahr}-{(jahr + 1) % 100:02d}'
    return f'{jahr}/{jahr}-10 {name}' if erster_tag.year == jahr else f'{jahr + 1}/{jahr + 1}-01 {name}'


def sperrliste_lesen(pfad):
    """Dateinamen, einer je Zeile (# Kommentar): genannte Fotos kommen samt ihrer Serie nicht in die Galerie"""
    if not pfad.exists():
        return set()
    namen = set()
    for zeile in pfad.read_text(encoding='utf-8-sig').splitlines():
        zeile = zeile.split('#')[0].strip()
        if zeile:
            namen.add(zeile.lower())
    return namen


def raster_bogen(zellen, titel, ziel, spalten=5, zelle=(160, 120), zeilen_text=2):
    """Bogen aus Zellen (Bild oder None, Textzeilen) in festem Raster"""
    fuss = 14 * zeilen_text + 4
    zeilen = -(-len(zellen) // spalten)
    bogen = Image.new('RGB', (spalten * zelle[0], 30 + zeilen * (zelle[1] + fuss)), (28, 28, 28))
    zeichnen = ImageDraw.Draw(bogen)
    zeichnen.text((8, 7), titel, fill=(255, 255, 255), font=schrift(16))
    klein = schrift(12)
    for i, (bild, texte) in enumerate(zellen):
        x = (i % spalten) * zelle[0]
        y = 30 + (i // spalten) * (zelle[1] + fuss)
        if bild is not None:
            bogen.paste(bild, (x + (zelle[0] - bild.width) // 2, y + (zelle[1] - bild.height) // 2))
        elif any(texte):
            zeichnen.rectangle((x + 2, y + 2, x + zelle[0] - 3, y + zelle[1] - 3), outline=(120, 120, 120))
        for k, t in enumerate(texte):
            zeichnen.text((x + 4, y + zelle[1] + 2 + 14 * k), t, fill=(230, 230, 230) if k == 0 else (170, 170, 170), font=klein)
    bogen.save(ziel, 'JPEG', quality=82)


def cmd_auswahl(args, cfg):
    plan_pfad = Path(args.plan)
    ablage = plan_pfad.parent
    listen = json.loads((ablage / 'dateien.json').read_text(encoding='utf-8'))
    with open(plan_pfad, encoding='utf-8-sig', newline='') as f:
        plan = list(csv.DictReader(f, delimiter=';'))
    gesperrt = sperrliste_lesen(Path(args.sperrliste) if args.sperrliste else ablage / 'sperrliste.txt')
    cache_pfad = ablage / 'hashes.json'
    cache = json.loads(cache_pfad.read_text(encoding='utf-8')) if cache_pfad.exists() else {}
    vorschauen = {}

    def bild(e):
        if e['pfad'] not in vorschauen:
            vorschauen[e['pfad']] = vorschau(e['pfad'], (160, 120)) if e['typ'] == 'bild' else None
        return vorschauen[e['pfad']]

    # alle Dateien mit Zeit, Hash und Schärfe (Vorschaubilder aus den Dateiköpfen; Ergebnis in hashes.json für den nächsten Lauf);
    # mit --ohne-doppelte wird keine Datei gelesen (Zeit aus dem Namen, sonst der Tag der Gruppe)
    t0 = time.time()
    eintraege = []
    for z in plan:
        tag = dt.date.fromisoformat(z['tag']) if z['tag'].strip() else None
        for p in listen.get(z['id'], []):
            name = os.path.basename(p)
            e = {'pfad': p, 'name': name, 'gid': z['id'], 'ziel': z['ziel'].strip(), 'tag': tag,
                 'titel': z.get('titel', '').strip(), 'vorsilbe': z.get('vorsilbe', '').strip(),
                 'typ': 'video' if os.path.splitext(name)[1].lower() in VIDEO else 'bild', 'motiv': '', 'serie': 1, 'album': '', 'nr': ''}
            c = cache.get(p)
            if c is None:
                zeit, _ = datum_aus_name(name)
                if args.ohne_doppelte or e['typ'] == 'video':
                    c = {'zeit': (zeit or dt.datetime.combine(tag or dt.date(1900, 1, 1), dt.time(12))).isoformat(timespec='seconds'), 'hash': None, 'schaerfe': 0.0}
                else:
                    if not zeit:
                        zeit, _ = exif_datum(p)
                    if not zeit:
                        zeit = dt.datetime.fromtimestamp(os.path.getmtime(p))
                    im = bild(e)
                    c = cache[p] = {'zeit': zeit.isoformat(timespec='seconds'), 'hash': dhash(im) if im is not None else None,
                                    'schaerfe': schaerfe(im) if im is not None else 0.0}
            e.update(zeit=dt.datetime.fromisoformat(c['zeit']), hash=c['hash'], schaerfe=c['schaerfe'])
            eintraege.append(e)
    cache_pfad.write_text(json.dumps(cache), encoding='utf-8')
    print(f'{len(eintraege)} Dateien gelesen ({time.time() - t0:.0f} s)')

    # Serien gleicher Motive je Tagesgruppe; es bleibt das typischste und davon das schärfste Bild. Videos bleiben immer (E62)
    je_gruppe = defaultdict(list)
    for e in eintraege:
        if e['typ'] == 'bild' and not args.ohne_doppelte:
            je_gruppe[e['gid']].append(e)
        else:
            e['status'] = 'bleibt'
    for gid, bilder in je_gruppe.items():
        for k, serie in enumerate(serien_bilden(bilder), 1):
            bestes = bestes_der_serie(serie)
            for e in serie:
                e.update(motiv=f'{gid}-{k:02d}', serie=len(serie), status='bleibt' if e is bestes else 'doppelt')

    # Sperrliste: genannte Dateien samt ihrer Serie
    sperren = {e['motiv'] for e in eintraege if e['name'].lower() in gesperrt and e['motiv']}
    for e in eintraege:
        if e['name'].lower() in gesperrt or (e['motiv'] and e['motiv'] in sperren):
            e['status'] = 'gesperrt'

    # Alben: eigenes Album ab Mindestgröße (Stiftungsfest ab zwei Dritteln), sonst Semester-Album; ohne „ziel“ bleibt die Gruppe
    # liegen; „/…“ liegt fest in der Galerie (Sammlung). Für die Mindestgröße zählen nur Fotos
    bleibt_je_ziel = defaultdict(int)
    for e in eintraege:
        if e['status'] == 'bleibt' and e['typ'] == 'bild':
            bleibt_je_ziel[e['ziel']] += 1

    def eigenes_album(ziel):
        if not ziel or ziel.lower() == SEMESTER.lower():
            return False
        if ziel.startswith('/'):
            return True
        mindest = args.mindestalbum
        if any(w.lower() in ziel.lower() for w in STETS_EIGEN):
            mindest = -(-mindest * 2 // 3)
        return bleibt_je_ziel[ziel] >= mindest

    zu_klein = sorted(z for z in bleibt_je_ziel if z and z.lower() != SEMESTER.lower() and not eigenes_album(z))
    je_semester = defaultdict(list)
    for e in eintraege:
        if not e['ziel'] or (not e['tag'] and not eigenes_album(e['ziel'])):
            e['status'] = 'offen'
        elif eigenes_album(e['ziel']):
            e['album'] = e['ziel']
        else:
            je_semester[semester_von(e['tag'])].append(e)
    for schluessel, liste in je_semester.items():
        erster = min((e['tag'] for e in liste if e['status'] == 'bleibt'), default=min(e['tag'] for e in liste))
        album = semester_album(schluessel, erster)
        for e in liste:
            e['album'] = album
    # Vorsilbe: aus dem Plan (Unterordner, der im Album darüber aufgeht) oder der Titel eines zu kleinen Albums im Semester-Album
    # (Spalte „titel“, sonst der Titel aus „ziel“ ohne Jahr und Datum)
    def titel_aus_ziel(ziel):
        if not ziel or ziel.startswith('/') or ziel.lower() == SEMESTER.lower():
            return ''
        return re.sub(r'^\d{4}(?:-\d{2}){0,2}\s*', '', ziel.split('/', 1)[-1]).strip()

    for e in eintraege:
        vs = e['vorsilbe']
        if e['album'] and e['album'] != e['ziel']:
            vs = ' – '.join(x for x in (e['titel'] or titel_aus_ziel(e['ziel']), e['vorsilbe']) if x)
        e['neuer_name'] = f'{vs} {e["name"]}' if vs and not e['name'].lower().startswith(vs.lower()) else e['name']

    # Reihenfolge Album, Zeit; laufende Nummer für alles, was in die Galerie kommt
    eintraege.sort(key=lambda e: (e['album'] or '~', e['zeit'], e['name']))
    nr = 0
    for e in eintraege:
        if e['status'] == 'bleibt':
            nr += 1
            e['nr'] = nr
    with open(ablage / 'auswahl.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['nr', 'status', 'album', 'datei', 'neuer_name', 'gruppe', 'tag', 'zeit', 'motiv', 'serie', 'schaerfe', 'pfad'])
        for e in eintraege:
            w.writerow([e['nr'], e['status'], e['album'], e['name'], e['neuer_name'], e['gid'], e['tag'].isoformat() if e['tag'] else '',
                        e['zeit'].strftime('%Y-%m-%d %H:%M:%S'), e['motiv'], e['serie'], e['schaerfe'], e['pfad']])
    zaehler = defaultdict(int)
    alben = defaultdict(lambda: [0, 0])
    for e in eintraege:
        zaehler[e['status']] += 1
        if e['status'] == 'bleibt':
            alben[e['album']][0 if e['typ'] == 'bild' else 1] += 1
    print('Ergebnis: ' + ', '.join(f'{k} {v}' for k, v in sorted(zaehler.items())) + f', davon Videos {sum(1 for e in eintraege if e["typ"] == "video")}'
          + f', umbenannt {sum(1 for e in eintraege if e["neuer_name"] != e["name"])}')
    if zu_klein:
        print('Zu klein für ein eigenes Album, ins Semester-Album: ' + ', '.join(f'{z} ({bleibt_je_ziel[z]})' for z in zu_klein))
    print(f'{len(alben)} Alben:')
    for a in sorted(alben):
        print(f'  {a}: {alben[a][0]} Fotos' + (f', {alben[a][1]} Videos' if alben[a][1] else ''))
    print(f'→ {ablage / "auswahl.csv"}')
    if args.ohne_boegen:
        return

    # Bögen: Sichtung (alles, was in die Galerie käme) und Serien (was als Mehrfachaufnahme entfällt)
    bleibt = [e for e in eintraege if e['status'] == 'bleibt']
    je_bogen = 20
    n_sicht = -(-len(bleibt) // je_bogen)
    for i in range(n_sicht):
        teil = bleibt[i * je_bogen:(i + 1) * je_bogen]
        zellen = [(bild(e), [f'{e["nr"]} · {e["zeit"]:%d.%m.%y %H:%M}', e['album'].split('/', 1)[-1][:26]]) for e in teil]
        raster_bogen(zellen, f'Sichtung {i + 1}/{n_sicht} · Nr. {teil[0]["nr"]}–{teil[-1]["nr"]} · alles, was in die Galerie käme',
                     ablage / f'sichtung_{i + 1:02d}.jpg')
    serien = defaultdict(list)
    for e in eintraege:
        if e['motiv'] and e['serie'] > 1:
            serien[e['motiv']].append(e)
    reihen = [sorted(s, key=lambda e: (e['status'] != 'bleibt', e['zeit'])) for _, s in sorted(serien.items())]
    spalten, je_bogen = 6, 10
    n_serien = -(-len(reihen) // je_bogen)
    for i in range(n_serien):
        zellen = []
        for s in reihen[i * je_bogen:(i + 1) * je_bogen]:
            erstes = s[0]
            for k in range(spalten):
                if k >= len(s):
                    zellen.append((None, ['']))
                    continue
                e = s[k]
                if e['status'] == 'bleibt':
                    text = f'Nr. {e["nr"]} bleibt'
                elif e['status'] == 'doppelt' and erstes['hash'] is not None and e['hash'] is not None:
                    text = f'd={abstand(erstes["hash"], e["hash"])} {(e["zeit"] - erstes["zeit"]).total_seconds():+.0f} s'
                else:
                    text = e['status']
                unten = f'{e["motiv"]} · {len(s)} Bilder' if k == 0 else (f'+{len(s) - spalten} weitere' if k == spalten - 1 and len(s) > spalten else '')
                zellen.append((bild(e), [text, unten]))
        raster_bogen(zellen, f'Serien {i + 1}/{n_serien} · je Zeile ein Motiv: das schärfste Bild bleibt, die anderen entfallen',
                     ablage / f'serien_{i + 1:02d}.jpg', spalten=spalten)
    print(f'Bögen: sichtung_01–{n_sicht:02d}.jpg und serien_01–{n_serien:02d}.jpg in {ablage}; Unpassendes als Dateiname in sperrliste.txt, dann „auswahl“ erneut')


# ---------------------------------------------------------------- move / undo

def protokoll_schreiben(pfad, zeilen):
    neu = not pfad.exists()
    with open(pfad, 'a', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';')
        if neu:
            w.writerow(['zeit', 'von', 'nach'])
        w.writerows(zeilen)


def verschieben(von, nach):
    """Innerhalb der Ablage umbenennen; bei Namensgleichheit „ (2)“, „ (3)“ … anhängen. Gibt den tatsächlichen Zielpfad zurück"""
    os.makedirs(os.path.dirname(nach), exist_ok=True)
    stamm, ext = os.path.splitext(nach)
    k = 1
    while os.path.exists(nach):
        k += 1
        nach = f'{stamm} ({k}){ext}'
    os.rename(von, nach)
    return nach


def quellname(pfad, upload):
    """Upload-Unterordner einer Datei als Name für den Archiv-Ordner (ohne „unsortiert“), sonst „Upload“"""
    try:
        rel = os.path.relpath(pfad, upload).replace('\\', '/')
    except ValueError:
        return 'Upload'
    teile = rel.split('/')
    name = teile[0] if len(teile) > 1 and not rel.startswith('..') else 'Upload'
    return titel_bereinigen(re.sub(r'\s*\bunsortiert\b', '', name, flags=re.I)) or 'Upload'


def cmd_move(args, cfg):
    plan_pfad = Path(args.plan)
    ablage = plan_pfad.parent
    auswahl_pfad = ablage / 'auswahl.csv'
    if not auswahl_pfad.exists():
        sys.exit(f'{auswahl_pfad} fehlt – erst „auswahl --plan {plan_pfad}“ ausführen und die Bögen sichten')
    if not cfg.get('archiv'):
        sys.exit('Einstellung fehlt: archiv (dorthin kommen Doppelte, Videos und Aussortiertes)')
    with open(auswahl_pfad, encoding='utf-8-sig', newline='') as f:
        auswahl = list(csv.DictReader(f, delimiter=';'))
    chronik = os.path.join(cfg['galerie'], cfg['chronik'])
    protokoll = ablage / 'protokoll.csv'
    offen = sorted({z['gruppe'] for z in auswahl if z['status'] == 'offen'})
    if offen:
        print(f'{len(offen)} Gruppen ohne Ziel bleiben liegen: ' + ', '.join(offen))
    auftraege = defaultdict(list)  # Zielordner → (Quellpfad, neuer Name)
    quellen = set()
    for z in auswahl:
        if z['status'] == 'bleibt':
            album = z['album'].replace('\\', '/')
            basis = cfg['galerie'] if album.startswith('/') else chronik  # „/…“ = Sammlung in der Galerie statt in der Chronik
            ordner = os.path.join(basis, *[titel_bereinigen(t) for t in album.strip('/').split('/')])
        elif z['status'] in ARCHIV_ORDNER:
            quelle = quellname(z['pfad'], cfg['upload'])
            quellen.add(quelle)
            ordner = os.path.join(cfg['archiv'], 'Nicht in der Galerie', quelle, ARCHIV_ORDNER[z['status']])
        else:
            continue
        auftraege[ordner].append((z['pfad'], z.get('neuer_name') or os.path.basename(z['pfad'])))
    n = fehler = 0
    quellordner = set()
    heute = dt.date.today().isoformat()
    for ordner in sorted(auftraege):
        zeilen = []
        for von, name in auftraege[ordner]:
            quellordner.add(os.path.dirname(von))
            if args.probe:
                n += 1
                continue
            try:
                nach = verschieben(von, os.path.join(ordner, titel_bereinigen(name) or os.path.basename(von)))
                zeilen.append([dt.datetime.now().isoformat(timespec='seconds'), von, nach])
                n += 1
            except OSError as e:
                fehler += 1
                print(f'!! {von}: {e}', file=sys.stderr)
        if zeilen:
            protokoll_schreiben(protokoll, zeilen)
            os.makedirs(cfg['archiv'], exist_ok=True)
            protokoll_schreiben(Path(cfg['archiv']) / f'Einsortiert {heute}.csv', zeilen)
        print(f'→ {ordner}: {len(auftraege[ordner]) if args.probe else len(zeilen)} Dateien')
    if not args.probe:
        if n:
            # Auswahl und Sperrliste (mit den Gründen) neben das Protokoll ins Archiv
            quelle = ', '.join(sorted(quellen)) or 'Upload'
            shutil.copy2(auswahl_pfad, Path(cfg['archiv']) / f'Einsortiert {heute} – Auswahl {quelle}.csv')
            sperrliste = ablage / 'sperrliste.txt'
            if sperrliste.exists():
                shutil.copy2(sperrliste, Path(cfg['archiv']) / f'Einsortiert {heute} – Sperrliste {quelle}.txt')
        # leere Quellordner entfernen, auch leer gewordene Hüllen darüber (nie den Upload-Ordner selbst)
        upload = os.path.normcase(os.path.normpath(cfg['upload']))
        for d in sorted(quellordner, key=len, reverse=True):
            while True:
                norm = os.path.normcase(os.path.normpath(d))
                if norm == upload or not norm.startswith(upload + os.sep) or not os.path.isdir(d):
                    break
                try:
                    if not all(x.lower() == 'desktop.ini' for x in os.listdir(d)):
                        break
                    for x in os.listdir(d):
                        os.remove(os.path.join(d, x))
                    os.rmdir(d)
                    print(f'leeren Ordner entfernt: {d}')
                except OSError:
                    break
                d = os.path.dirname(d)
    print(f'{n} Dateien verschoben, {fehler} Fehler' + (' (nur Probe)' if args.probe else f', Protokoll: {protokoll}'))


def cmd_undo(args, cfg):
    with open(args.protokoll, encoding='utf-8-sig', newline='') as f:
        zeilen = list(csv.DictReader(f, delimiter=';'))
    n = 0
    for z in reversed(zeilen):
        try:
            zurueck = verschieben(z['nach'], z['von'])
            n += 1
            if zurueck != z['von']:
                print(f'Name war belegt, zurück als: {zurueck}')
        except OSError as e:
            print(f'!! {z["nach"]}: {e}', file=sys.stderr)
    print(f'{n} Dateien zurückverschoben')


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description='Fotos aus dem Upload-Ordner in die Galerie einsortieren')
    for k in ('upload', 'galerie', 'archiv', 'ics', 'chronik'):
        ap.add_argument(f'--{k}')
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('plan', help='Gruppen, Termine, Kontaktbögen, plan.csv')
    p.add_argument('--quelle', help='Unterordner des Upload-Ordners (sonst der ganze Upload-Ordner)')
    p.add_argument('--ausgabe', help='Ordner für plan.csv, dateien.json, Kontaktbögen')
    p.add_argument('--max', type=int, help='nur die ersten N Dateien (zum Ausprobieren)')
    p.add_argument('--ohne-boegen', action='store_true', help='keine Kontaktbögen erzeugen')
    p.add_argument('--mindestens', type=int, default=4, help='eigener Kontaktbogen ab so vielen Bildern, kleinere Gruppen je Monat gesammelt (Standard 4)')
    p.add_argument('--je-ordner', action='store_true', help='Ordner statt Tage als Gruppen (alte Archive mit Album-Ordnern, E61)')
    p.add_argument('--mindestalbum', type=int, default=15, help='mit --je-ordner: Unterordner ab so vielen Bildern werden eigene Alben (Standard 15)')
    a = sub.add_parser('auswahl', help='ein Foto je Motiv, Mindestgröße und Semester-Alben, Sperrliste → auswahl.csv und Bögen')
    a.add_argument('--plan', required=True)
    a.add_argument('--mindestalbum', type=int, default=15, help='eigenes Album ab so vielen Fotos (Stiftungsfest ab zwei Dritteln), sonst Semester-Album (Standard 15)')
    a.add_argument('--sperrliste', help='Datei mit Dateinamen, die samt Serie nicht in die Galerie kommen (Standard: sperrliste.txt neben plan.csv)')
    a.add_argument('--ohne-doppelte', action='store_true', help='keine Serien zusammenlegen, alle Fotos bleiben (liest keine Dateien)')
    a.add_argument('--ohne-boegen', action='store_true', help='keine Bögen erzeugen')
    m = sub.add_parser('move', help='auswahl.csv ausführen')
    m.add_argument('--plan', required=True)
    m.add_argument('--probe', action='store_true', help='nur zeigen, nichts verschieben')
    u = sub.add_parser('undo', help='Protokoll rückwärts ausführen')
    u.add_argument('--protokoll', required=True)
    args = ap.parse_args()
    cfg = einstellungen(args)
    {'plan': cmd_plan, 'auswahl': cmd_auswahl, 'move': cmd_move, 'undo': cmd_undo}[args.cmd](args, cfg)


if __name__ == '__main__':
    main()
