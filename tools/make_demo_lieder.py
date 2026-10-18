"""
Erzeugt die Beispiellieder der Liedermappe für den Demo-Modus (fiktive Texte und Melodien):
fünf PDFs (Notensatz als Vektorgrafik) und ein JPG, das wie ein Scan aussieht.

Aufruf (im Projektordner):
    python tools/make_demo_lieder.py

Benötigt: reportlab, Pillow und die Schriften in tools/out/fonts (siehe tools/make_demo_pdfs.py).
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "tools" / "out" / "fonts"
OUT = ROOT / "assets" / "demo" / "lieder"
PAGE_W, PAGE_H = 210.0, 297.0  # mm
S = 2.0  # Linienabstand der Notenzeile in mm

# Erste Strophe mit Silbentrennung (eine Silbe je Note); weitere Strophen als Text
SONGS = [
    {
        "file": "morgenlied.pdf", "nr": "1", "title": "Morgenlied der Füxe", "rubrik": "Kommerslieder", "seed": 3,
        "lines": ["Wenn früh die Glo-cke ruft zum Tag,", "dann ziehn wir froh hin-aus,",
                  "und was der Tag auch brin-gen mag,", "wir tra-gen's gern nach Haus."],
        "verses": [
            "Die Bücher unterm Arm geklemmt,\ndas Band auf treuer Brust,\nso geht's hinaus, so ungehemmt,\nvoll Mut und voller Lust.",
            "Und kehrt der Abend still zurück,\ndann sitzen wir im Kreis\nund singen von vergangnem Glück\ndie alte, frohe Weis'.",
        ],
    },
    {
        "file": "altes-haus.pdf", "nr": "2", "title": "Vom alten Haus am Fluss", "rubrik": "Kommerslieder", "seed": 11,
        "lines": ["Am Fluss, da steht ein al-tes Haus,", "mit E-feu dicht be-rankt,",
                  "da gehn die Freun-de ein und aus,", "so lang man denkt und dankt."],
        "verses": [
            "Im Keller klingt das alte Lied,\nim Garten blüht der Flieder,\nund wer auch in die Ferne zieht,\nder kommt doch immer wieder.",
            "Und wird das Dach auch einmal alt,\ndie Treppe knarrt und ächzt,\ndas Haus am Fluss gibt uns noch Halt,\nsolang ein Herz es schätzt.",
        ],
    },
    {
        "file": "rundgesang.jpg", "nr": "3", "title": "Rundgesang", "rubrik": "Kommerslieder", "seed": 5,
        "lines": ["Nun füllt die Run-de, Brü-der mein,", "und stimmt ein Lied-lein an,",
                  "der Letz-te soll der Ers-te sein,", "der heu-te sin-gen kann."],
        "verses": [
            "Und wer den Ton nicht treffen mag,\nder summt halt einfach mit,\nso klingt es bis zum hellen Tag\nim alten, frohen Schritt.",
        ],
    },
    {
        "file": "abendlied.pdf", "nr": "10", "title": "Abendlied am Ufer", "rubrik": "Volkslieder", "seed": 8,
        "lines": ["Der A-bend sinkt aufs stil-le Land,", "der Fluss zieht sacht da-hin,",
                  "wir rei-chen uns zum Gruß die Hand", "mit fro-hem, stil-lem Sinn."],
        "verses": [
            "Die Sterne ziehen still herauf,\ndie Nacht hüllt alles ein,\nund morgen nimmt der Tag den Lauf\nmit neuem Sonnenschein.",
        ],
    },
    {
        "file": "wanderlied.pdf", "nr": "11", "title": "Wanderlied", "rubrik": "Volkslieder", "seed": 21,
        "lines": ["Wir wan-dern froh durch Wald und Feld,", "der Mor-gen ist so klar,",
                  "der Him-mel spannt sein blau-es Zelt", "wie je-des, je-des Jahr."],
        "verses": [
            "Der Rucksack drückt, der Weg ist weit,\ndie Sonne steigt empor,\nwir haben alle Zeit der Zeit\nund singen laut im Chor.",
            "Am Bach wird kurz die Rast gemacht,\ndas Brot geteilt im Gras,\nund wer am lautesten gelacht,\nder hebt zuerst das Glas.",
            "Dann geht es fort durch Tal und Hain,\nvorbei an Feld und Flur,\nund bald schon blinkt der Abendschein\nauf unsrer langen Spur.",
            "Die Füße müd, das Herz ist leicht,\nder Tag war schön und lang,\nund wenn die Nacht die Hand uns reicht,\ndann bleibt uns der Gesang.",
            "So zieht der Bund durchs weite Land\nund kehrt doch stets zurück,\nwir halten fest das alte Band\nund wünschen allen Glück.",
        ],
    },
    {
        "file": "staendchen.pdf", "nr": "20", "title": "Ständchen zum Stiftungsfest", "rubrik": "Festlieder", "seed": 14,
        "lines": ["Zum Fest ver-sam-melt, Jung und Alt,", "er-hebt das Glas zum Gruß,",
                  "die Freund-schaft, die uns gibt den Halt,", "sie bleibt, so wie sie muss."],
        "verses": [
            "Wir danken allen, die da sind,\nund denen, die schon gingen,\nund lassen, wie ein warmer Wind,\ndas alte Lied erklingen.",
        ],
    },
]

# Violinschlüssel als Folge kubischer Bézierkurven, in Linienabständen; y nach oben, 0 = unterste Linie
CLEF = [
    ((0.15, 1.05), (0.15, 1.6), (-0.6, 1.65), (-0.62, 1.0)),
    ((-0.62, 1.0), (-0.66, 0.15), (0.45, -0.3), (0.85, 0.45)),
    ((0.85, 0.45), (1.2, 1.1), (0.95, 2.0), (0.15, 2.15)),
    ((0.15, 2.15), (-0.65, 2.35), (-0.75, 3.45), (-0.1, 4.35)),
    ((-0.1, 4.35), (0.35, 4.95), (0.6, 5.65), (0.3, 5.95)),
    ((0.3, 5.95), (0.0, 6.15), (-0.25, 5.3), (-0.12, 4.55)),
    ((-0.12, 4.55), (0.05, 3.0), (0.35, 0.5), (0.32, -1.0)),
    ((0.32, -1.0), (0.28, -1.65), (-0.5, -1.65), (-0.46, -1.1)),
]


def bezier(p0, p1, p2, p3, n=18):
    pts = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return pts


def clef_points():
    pts = []
    for seg in CLEF:
        pts.extend(bezier(*seg)[(1 if pts else 0):])
    return pts


def syllables(line):
    """„Wenn früh die Glo-cke …“ → [(Silbe, Bindestrich danach?), …]"""
    out = []
    for word in line.split():
        parts = word.split("-")
        for i, p in enumerate(parts):
            out.append((p, i < len(parts) - 1))
    return out


def bars_for(count):
    """Silben auf Takte verteilen (4/4): 8 → [4, 4], 6 → [4, 2], 7 → [4, 3]"""
    bars = []
    while count > 0:
        bars.append(min(4, count))
        count -= 4
    return bars


RHYTHM = {4: [1, 1, 1, 1], 3: [1, 1, 2], 2: [2, 2], 1: [4]}


def melody(song):
    """Einfache Melodie in C-Dur (Positionen: 0 = E4 auf der untersten Linie, 2 = G4, 5 = C5)"""
    rnd = random.Random(song["seed"])
    endings = [4, 2, 6, 5]  # Halbschluss, Ruhepunkt, Spannung, Grundton
    pos = rnd.choice([2, 5])
    lines = []
    for k, line in enumerate(song["lines"]):
        n = len(syllables(line))
        notes = []
        for i in range(n):
            if i == n - 1:
                pos = endings[k % 4]
            else:
                step = rnd.choice([-2, -1, -1, 0, 1, 1, 2])
                pos = max(-1, min(8, pos + step))
            notes.append(pos)
        lines.append(notes)
    return lines


class PdfPen:
    """Zeichnen in mm von oben links (wie auf Papier) – für reportlab"""

    def __init__(self, path):
        self.c = canvas.Canvas(str(path), pagesize=A4)
        self.c.setTitle("Beispiellied (fiktiv) – Demo der Mitglieder-App")

    def y(self, v):
        return (PAGE_H - v) * mm

    def line(self, x1, y1, x2, y2, w):
        self.c.setLineWidth(w * mm)
        self.c.line(x1 * mm, self.y(y1), x2 * mm, self.y(y2))

    def poly(self, pts, w):
        self.c.setLineWidth(w * mm)
        self.c.setLineCap(1)
        self.c.setLineJoin(1)
        p = self.c.beginPath()
        p.moveTo(pts[0][0] * mm, self.y(pts[0][1]))
        for x, y in pts[1:]:
            p.lineTo(x * mm, self.y(y))
        self.c.drawPath(p, stroke=1, fill=0)

    def ellipse(self, cx, cy, rx, ry, angle, fill, w=0.25):
        self.c.saveState()
        self.c.translate(cx * mm, self.y(cy))
        self.c.rotate(angle)
        self.c.setLineWidth(w * mm)
        self.c.ellipse(-rx * mm, -ry * mm, rx * mm, ry * mm, stroke=1, fill=1 if fill else 0)
        self.c.restoreState()

    def dot(self, cx, cy, r):
        self.c.circle(cx * mm, self.y(cy), r * mm, stroke=0, fill=1)

    def text(self, x, y, s, font, size, anchor="l", grey=False):
        self.c.setFillGray(0.42 if grey else 0)
        self.c.setFont(font, size)
        {"l": self.c.drawString, "c": self.c.drawCentredString, "r": self.c.drawRightString}[anchor](x * mm, self.y(y), s)
        self.c.setFillGray(0)

    def next_page(self):
        self.c.showPage()

    def save(self):
        self.c.save()


class ImagePen:
    """Dasselbe als Bild mit 150 dpi – sieht nach einem eingescannten Blatt aus"""
    DPI = 150

    def __init__(self, path):
        self.path = path
        self.k = self.DPI / 25.4
        self.img = Image.new("RGB", (round(PAGE_W * self.k), round(PAGE_H * self.k)), (250, 248, 241))
        self.d = ImageDraw.Draw(self.img)
        self.fonts = {}

    def p(self, x, y):
        return (x * self.k, y * self.k)

    def font(self, name, size):
        key = (name, size)
        if key not in self.fonts:
            file = {"Raleway": "Raleway-400.ttf", "Raleway-Bold": "Raleway-700.ttf", "Raleway-SemiBold": "Raleway-600.ttf",
                    "Raleway-Italic": "Raleway-400i.ttf"}[name]
            self.fonts[key] = ImageFont.truetype(str(FONTS / file), round(size / 72 * self.DPI))
        return self.fonts[key]

    def line(self, x1, y1, x2, y2, w):
        self.d.line([self.p(x1, y1), self.p(x2, y2)], fill=(28, 28, 28), width=max(1, round(w * self.k)))

    def poly(self, pts, w):
        self.d.line([self.p(x, y) for x, y in pts], fill=(28, 28, 28), width=max(1, round(w * self.k)), joint="curve")

    def ellipse(self, cx, cy, rx, ry, angle, fill, w=0.25):
        a = math.radians(-angle)
        pts = []
        for i in range(48):
            t = 2 * math.pi * i / 48
            x, y = rx * math.cos(t), ry * math.sin(t)
            pts.append(self.p(cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)))
        if fill:
            self.d.polygon(pts, fill=(28, 28, 28))
        else:
            self.d.line(pts + [pts[0]], fill=(28, 28, 28), width=max(1, round(w * self.k)), joint="curve")

    def dot(self, cx, cy, r):
        x, y = self.p(cx, cy)
        rr = r * self.k
        self.d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(28, 28, 28))

    def text(self, x, y, s, font, size, anchor="l", grey=False):
        self.d.text(self.p(x, y), s, font=self.font(font, size), fill=(110, 110, 110) if grey else (28, 28, 28),
                    anchor={"l": "ls", "c": "ms", "r": "rs"}[anchor])

    def save(self):
        img = self.img.rotate(0.5, resample=Image.BICUBIC, expand=False, fillcolor=(250, 248, 241))
        noise = Image.effect_noise(img.size, 9).convert("RGB")
        img = Image.blend(img, noise, 0.035).filter(ImageFilter.GaussianBlur(0.35))
        img.convert("L").save(self.path, quality=72, optimize=True)


def staff(pen, x0, x1, top):
    for i in range(5):
        y = top + i * S
        pen.line(x0, y, x1, y, 0.16)


def system(pen, x0, x1, top, notes, syls, first, last):
    """Eine Notenzeile: Schlüssel, ggf. 4/4, Noten mit Text darunter, Taktstriche"""
    bottom = top + 4 * S
    staff(pen, x0, x1, top)
    ys = lambda pos: bottom - pos * S / 2  # Notenposition → y in mm
    clef = [(x0 + 4.2 + px * S, bottom - py * S) for px, py in clef_points()]
    pen.poly(clef, 0.42)
    pen.dot(clef[-1][0] + 0.15, clef[-1][1], 0.3 * S)
    x = x0 + 9.5
    if first:
        pen.text(x + 2, top + 2 * S - 0.25, "4", "Raleway-Bold", 15.5, "c")
        pen.text(x + 2, bottom - 0.25, "4", "Raleway-Bold", 15.5, "c")
        x += 7
    bars = bars_for(len(notes))
    units = sum(4 for _ in bars)
    width = x1 - x - 2
    unit = width / units
    k = 0
    for b, count in enumerate(bars):
        for dur in RHYTHM[count]:
            pos = notes[k]
            cx = x + unit * 0.55
            cy = ys(pos)
            hollow = dur >= 2
            pen.ellipse(cx, cy, 0.62 * S, 0.44 * S, 20, not hollow, 0.3)
            if pos <= -2:
                pen.line(cx - 1.9, ys(-2), cx + 1.9, ys(-2), 0.16)
            if dur < 4:
                if pos < 4:
                    pen.line(cx + 0.58 * S, cy - 0.1, cx + 0.58 * S, cy - 3.5 * S, 0.2)
                else:
                    pen.line(cx - 0.58 * S, cy + 0.1, cx - 0.58 * S, cy + 3.5 * S, 0.2)
            syl, hyphen = syls[k]
            pen.text(cx, bottom + 7.2, syl, "Raleway", 10.5, "c")
            if hyphen:
                pen.text(cx + unit * dur / 2, bottom + 7.2, "-", "Raleway", 10.5, "c")
            x += unit * dur
            k += 1
        if b < len(bars) - 1:
            pen.line(x, top, x, bottom, 0.16)
    if last:
        pen.line(x1 - 1.1, top, x1 - 1.1, bottom, 0.16)
        pen.line(x1 - 0.2, top, x1 - 0.2, bottom, 0.8)
    else:
        pen.line(x1, top, x1, bottom, 0.16)


def verse_block(pen, x, y, number, text):
    lines = text.split("\n")
    pen.text(x, y, f"{number}.", "Raleway-Bold", 11)
    for i, l in enumerate(lines):
        pen.text(x + 7, y + i * 5.4, l, "Raleway", 11)
    return y + len(lines) * 5.4 + 4.5


def header(pen, song, page=1, pages=1):
    pen.text(20, 24, song["title"], "Raleway-Bold", 21)
    pen.text(20, 32, f"Nr. {song['nr']} · {song['rubrik']}", "Raleway", 11, grey=True)
    pen.text(190, 32, "Text und Weise: fiktiv", "Raleway-Italic", 9.5, "r", grey=True)
    pen.line(20, 36, 190, 36, 0.25)
    pen.text(105, 286, "Fiktives Beispiellied für den Demo-Modus der Mitglieder-App"
             + (f" · Seite {page} von {pages}" if pages > 1 else ""), "Raleway", 8.5, "c", grey=True)


def draw_song(pen, song):
    verses = song["verses"]
    first_page = verses[:2] if len(verses) > 3 else verses
    rest = verses[2:] if len(verses) > 3 else []
    pages = 2 if rest else 1
    header(pen, song, 1, pages)
    tunes = melody(song)
    top = 50
    for i, (line, notes) in enumerate(zip(song["lines"], tunes)):
        system(pen, 20, 190, top, notes, syllables(line), i == 0, i == len(tunes) - 1)
        top += 27
    y = top + 6
    for n, v in enumerate(first_page, start=2):
        y = verse_block(pen, 34, y, n, v)
    if rest:
        pen.next_page()
        header(pen, song, 2, pages)
        y = 50
        for n, v in enumerate(rest, start=2 + len(first_page)):
            y = verse_block(pen, 34, y, n, v)
        pen.text(34, y + 4, "Zum Schluss die erste Strophe noch einmal.", "Raleway-Italic", 10.5, grey=True)


def main():
    for name, file in [("Raleway", "Raleway-400.ttf"), ("Raleway-Bold", "Raleway-700.ttf"),
                       ("Raleway-SemiBold", "Raleway-600.ttf"), ("Raleway-Italic", "Raleway-400i.ttf")]:
        pdfmetrics.registerFont(TTFont(name, str(FONTS / file)))
    OUT.mkdir(parents=True, exist_ok=True)
    for song in SONGS:
        path = OUT / song["file"]
        if path.suffix == ".jpg":
            pen = ImagePen(path)
            draw_song(pen, song)
        else:
            pen = PdfPen(path)
            draw_song(pen, song)
        pen.save()
        print(f"{path.relative_to(ROOT)}: {path.stat().st_size // 1024} kB")


if __name__ == "__main__":
    main()
