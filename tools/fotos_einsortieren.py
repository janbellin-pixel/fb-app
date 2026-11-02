#!/usr/bin/env python3
"""Fotos aus dem Upload-Ordner in die Galerie einsortieren – Werkzeug für Verantwortliche (E59).

Läuft auf dem eigenen Rechner gegen die im Explorer eingebundene geteilte Ablage (Google Drive für Desktop).
Die App selbst schreibt nie in die Galerie; dieses Skript ist der Weg vom Upload-Ordner in die Zeitachse
„Chronik nach Jahren/<Jahr>/<JJJJ-MM-TT Titel>“.

Schritte:
  plan   Dateien einer Quelle (Unterordner des Upload-Ordners) nach Tag gruppieren – Datum aus dem Dateinamen,
         sonst aus EXIF – Termine aus dem Kalender (ICS) zuordnen, je Gruppe einen Kontaktbogen (20 Vorschaubilder)
         erzeugen und einen Plan als CSV schreiben (Spalte „ziel“ = Album relativ zur Chronik, leer = noch offen).
  move   Einen Plan ausführen: Dateien in die Zielalben verschieben (innerhalb derselben Ablage, Drive lädt nichts
         neu hoch), Protokoll schreiben (auch in den Archiv-Ordner), leere Quellordner entfernen.
  undo   Ein Protokoll rückwärts ausführen.

Einstellungen in tools/fotos_einsortieren.lokal.json (nicht im Repository, Vorlage: fotos_einsortieren.beispiel.json):
  upload, galerie, archiv (Ordner), ics (Kalender-Adresse oder Datei), chronik (Name des Zeitachsen-Ordners).

Beispiele:
  python tools/fotos_einsortieren.py plan --quelle "Fotos Bahl unsortiert" --ausgabe C:/Temp/bahl
  python tools/fotos_einsortieren.py move --plan C:/Temp/bahl/plan.csv
  python tools/fotos_einsortieren.py undo --protokoll C:/Temp/bahl/protokoll.csv
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import struct
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

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
    cfg.setdefault('chronik', 'Chronik nach Jahren')
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


def cmd_plan(args, cfg):
    quelle = os.path.join(cfg['upload'], args.quelle) if args.quelle else cfg['upload']
    ablage = Path(args.ausgabe or (HIER.parent / 'tmp' / 'einsortieren'))
    ablage.mkdir(parents=True, exist_ok=True)
    print(f'Quelle: {quelle}')
    dateien = dateien_sammeln(quelle)
    if args.max:
        dateien = dateien[:args.max]
    print(f'{len(dateien)} Dateien, Datum aus: ' + ', '.join(f'{k}={v}' for k, v in sorted(
        ((w, sum(1 for e in dateien if e['woher'] == w)) for w in {e['woher'] for e in dateien}), key=lambda x: -x[1])))
    termine = ics_laden(cfg.get('ics'), ablage)
    print(f'{len(termine)} Termine im Kalender')
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
        ziel = f'{tag.year}/{tag.isoformat()} {titel_bereinigen(feste[0]["titel"])}' if len(feste) == 1 else ''
        plan.append({
            'id': gid, 'tag': tag.isoformat(), 'wochentag': ('Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So')[tag.weekday()],
            'bilder': sum(1 for e in liste if e['typ'] == 'bild'), 'videos': sum(1 for e in liste if e['typ'] == 'video'),
            'von': min(e['zeit'] for e in liste).strftime('%H:%M'), 'bis': max(e['zeit'] for e in liste).strftime('%H:%M'),
            'termine': ' | '.join((('(Serie) ' if t['serie'] else '') + t['titel']) for t in kandidaten),
            'ziel': ziel, 'hinweis': '',
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
    with open(ablage / 'plan.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(plan[0].keys()) if plan else ['id'], delimiter=';')
        w.writeheader()
        w.writerows(plan)
    (ablage / 'dateien.json').write_text(json.dumps(listen, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f'{len(plan)} Gruppen → {ablage / "plan.csv"}' + ('' if args.ohne_boegen else f', Kontaktbögen bogen_g*.jpg (ab {args.mindestens} Bildern) und monat_*.jpg in {ablage}'))
    for z in plan:
        print(f'{z["id"]} {z["wochentag"]} {z["tag"]} {z["bilder"]:4d} B {z["videos"]:2d} V {z["von"]}–{z["bis"]}  {z["termine"][:70]}')


# ---------------------------------------------------------------- move / undo

def protokoll_schreiben(pfad, zeilen):
    neu = not pfad.exists()
    with open(pfad, 'a', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';')
        if neu:
            w.writerow(['zeit', 'von', 'nach'])
        w.writerows(zeilen)


def verschieben(von, nach):
    os.makedirs(os.path.dirname(nach), exist_ok=True)
    if os.path.exists(nach):
        raise FileExistsError(nach)
    os.rename(von, nach)


def cmd_move(args, cfg):
    plan_pfad = Path(args.plan)
    ablage = plan_pfad.parent
    listen = json.loads((ablage / 'dateien.json').read_text(encoding='utf-8'))
    with open(plan_pfad, encoding='utf-8-sig', newline='') as f:
        plan = list(csv.DictReader(f, delimiter=';'))
    chronik = os.path.join(cfg['galerie'], cfg['chronik'])
    protokoll = ablage / 'protokoll.csv'
    offen = [z for z in plan if not z['ziel'].strip()]
    if offen:
        print(f'{len(offen)} Gruppen ohne Ziel bleiben liegen: ' + ', '.join(z['id'] for z in offen))
    n = fehler = 0
    quellordner = set()
    for z in plan:
        ziel = z['ziel'].strip()
        if not ziel:
            continue
        zielordner = os.path.join(chronik, *[titel_bereinigen(t) for t in ziel.replace('\\', '/').split('/')])
        zeilen = []
        k = 0
        for von in listen.get(z['id'], []):
            nach = os.path.join(zielordner, os.path.basename(von))
            quellordner.add(os.path.dirname(von))
            if args.probe:
                print(f'  {von} → {nach}')
                k += 1
                n += 1
                continue
            try:
                verschieben(von, nach)
                zeilen.append([dt.datetime.now().isoformat(timespec='seconds'), von, nach])
                n += 1
            except OSError as e:
                fehler += 1
                print(f'!! {von}: {e}', file=sys.stderr)
        if zeilen:
            protokoll_schreiben(protokoll, zeilen)
            if cfg.get('archiv'):
                os.makedirs(cfg['archiv'], exist_ok=True)
                protokoll_schreiben(Path(cfg['archiv']) / f'Einsortiert {dt.date.today().isoformat()}.csv', zeilen)
        print(f'{z["id"]} → {ziel}: {len(zeilen) or k} Dateien')
    if not args.probe:
        # leere Quellordner entfernen (Papierkorb der Ablage)
        for d in sorted(quellordner, key=len, reverse=True):
            try:
                if not os.listdir(d) or all(x.lower() == 'desktop.ini' for x in os.listdir(d)):
                    for x in os.listdir(d):
                        os.remove(os.path.join(d, x))
                    os.rmdir(d)
                    print(f'leeren Ordner entfernt: {d}')
            except OSError:
                pass
    print(f'{n} Dateien verschoben, {fehler} Fehler' + (' (nur Probe)' if args.probe else f', Protokoll: {protokoll}'))


def cmd_undo(args, cfg):
    with open(args.protokoll, encoding='utf-8-sig', newline='') as f:
        zeilen = list(csv.DictReader(f, delimiter=';'))
    n = 0
    for z in reversed(zeilen):
        try:
            verschieben(z['nach'], z['von'])
            n += 1
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
    m = sub.add_parser('move', help='plan.csv ausführen')
    m.add_argument('--plan', required=True)
    m.add_argument('--probe', action='store_true', help='nur zeigen, nichts verschieben')
    u = sub.add_parser('undo', help='Protokoll rückwärts ausführen')
    u.add_argument('--protokoll', required=True)
    args = ap.parse_args()
    cfg = einstellungen(args)
    {'plan': cmd_plan, 'move': cmd_move, 'undo': cmd_undo}[args.cmd](args, cfg)


if __name__ == '__main__':
    main()
