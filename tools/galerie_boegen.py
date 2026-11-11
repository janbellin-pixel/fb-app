"""Übersichtsbögen für die Sichtung der Galerie (E64): alle Bilder eines Ordnerbaums in Dateireihenfolge auf Bögen
mit festem Raster (5×4, Zellen 320×240), jede Zelle nummeriert, Kopfzeile mit Bogen-Nummer und den Alben auf dem Bogen.
Schreibt karte.csv (bogen;zelle;pfad;status) und bogen_NNN.jpg nach <ausgabe>; vorhandene Bögen werden übersprungen
(Wiederaufnahme nach Abbruch). Liest die Dateien ganz (die Ablage im Explorer lädt sie dabei herunter) – mit 8 Threads
etwa 3–4 s je Bogen. Läuft lokal, schreibt nichts in die Ablage.
Aufruf: python -X utf8 -u tools/galerie_boegen.py "<Galerie-Ordner>" <ausgabe> [--spalten 5 --zeilen 4 --breite 320
        --hoehe 240 --threads 8] [--nur <Teilpfad>] [--ohne <Teilpfad>]... [--praefix bogen]"""
import argparse
import csv
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

BILDER = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tif', '.tiff', '.webp', '.heic'}
VIDEO = {'.mp4', '.mov', '.m4v', '.avi', '.3gp', '.mkv', '.wmv', '.mpg', '.mpeg', '.webm'}


def schrift(px):
    for name in ('C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf'):
        if os.path.exists(name):
            return ImageFont.truetype(name, px)
    return ImageFont.load_default()


def dateien(wurzel, nur, ohne):
    aus = []
    for dp, dn, fn in os.walk(wurzel):
        dn.sort()
        rel_dir = os.path.relpath(dp, wurzel).replace('\\', '/')
        if nur and not (rel_dir + '/').startswith(nur.rstrip('/') + '/') and rel_dir != nur.rstrip('/'):
            continue
        if any((rel_dir + '/').startswith(o.rstrip('/') + '/') for o in ohne):
            continue
        for f in sorted(fn):
            ext = os.path.splitext(f)[1].lower()
            if ext in BILDER or ext in VIDEO:
                aus.append(os.path.join(dp, f))
    return aus


def laden(pfad, groesse):
    ext = os.path.splitext(pfad)[1].lower()
    if ext in VIDEO:
        return None, 'video'
    try:
        with Image.open(pfad) as im:
            im.draft('RGB', (groesse[0] * 2, groesse[1] * 2))
            im = ImageOps.exif_transpose(im)
            im = im.convert('RGB')
            # Bild vollständig zeigen (kein Beschnitt), auf Zellgröße eingepasst
            im.thumbnail(groesse, Image.Resampling.LANCZOS)
            return im.copy(), 'ok'
    except Exception as e:  # noqa: BLE001
        return None, f'fehler: {type(e).__name__}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('wurzel')
    ap.add_argument('ausgabe')
    ap.add_argument('--spalten', type=int, default=5)
    ap.add_argument('--zeilen', type=int, default=4)
    ap.add_argument('--breite', type=int, default=320)
    ap.add_argument('--hoehe', type=int, default=240)
    ap.add_argument('--threads', type=int, default=8)
    ap.add_argument('--nur', default='')
    ap.add_argument('--ohne', action='append', default=[])
    ap.add_argument('--praefix', default='bogen')
    a = ap.parse_args()

    wurzel = os.path.abspath(a.wurzel)
    aus = Path(a.ausgabe)
    aus.mkdir(parents=True, exist_ok=True)
    alle = dateien(wurzel, a.nur, a.ohne)
    je = a.spalten * a.zeilen
    n_boegen = -(-len(alle) // je)
    print(f'{len(alle)} Dateien → {n_boegen} Bögen à {je}', flush=True)

    karte = aus / 'karte.csv'
    neu = not karte.exists()
    kf = open(karte, 'a', newline='', encoding='utf-8-sig')
    kw = csv.writer(kf, delimiter=';')
    if neu:
        kw.writerow(['bogen', 'zelle', 'pfad', 'status'])

    kopf_h = 34
    fuss = 18
    gross = schrift(18)
    klein = schrift(15)
    start = time.time()
    with ThreadPoolExecutor(max_workers=a.threads) as pool:
        for b in range(n_boegen):
            ziel = aus / f'{a.praefix}_{b + 1:03d}.jpg'
            teil = alle[b * je:(b + 1) * je]
            if ziel.exists():
                continue
            ergebnisse = list(pool.map(lambda p: laden(p, (a.breite, a.hoehe)), teil))
            zeilen = -(-len(teil) // a.spalten)
            bogen = Image.new('RGB', (a.spalten * a.breite, kopf_h + zeilen * (a.hoehe + fuss)), (24, 24, 24))
            z = ImageDraw.Draw(bogen)
            alben = []
            for p in teil:
                rel = os.path.relpath(os.path.dirname(p), wurzel).replace('\\', '/')
                if not alben or alben[-1][0] != rel:
                    alben.append([rel, teil.index(p) + 1])
            kopf = f'Bogen {b + 1:03d}   ' + ' | '.join(f'ab {i}: {r}' for r, i in alben)
            z.text((8, 8), kopf[:220], fill=(255, 255, 255), font=gross)
            for i, (p, (bild, status)) in enumerate(zip(teil, ergebnisse)):
                x = (i % a.spalten) * a.breite
                y = kopf_h + (i // a.spalten) * (a.hoehe + fuss)
                if bild is not None:
                    bogen.paste(bild, (x + (a.breite - bild.width) // 2, y + (a.hoehe - bild.height) // 2))
                else:
                    z.rectangle((x + 2, y + 2, x + a.breite - 3, y + a.hoehe - 3), outline=(110, 110, 110))
                    z.text((x + 10, y + a.hoehe // 2 - 8), status, fill=(200, 200, 200), font=klein)
                # Nummer der Zelle oben links auf dunklem Kasten
                z.rectangle((x, y, x + 34, y + 20), fill=(0, 0, 0))
                z.text((x + 4, y + 1), f'{i + 1:02d}', fill=(255, 230, 0), font=klein)
                z.text((x + 4, y + a.hoehe + 1), os.path.basename(p)[:40], fill=(185, 185, 185), font=klein)
                kw.writerow([b + 1, i + 1, p, status])
            bogen.save(ziel, 'JPEG', quality=84)
            kf.flush()
            dauer = time.time() - start
            print(f'Bogen {b + 1}/{n_boegen} nach {dauer:.0f}s', flush=True)
    kf.close()
    print('fertig', flush=True)


if __name__ == '__main__':
    main()
