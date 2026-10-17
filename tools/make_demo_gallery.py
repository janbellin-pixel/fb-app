"""
Erzeugt stilisierte Beispielbilder für die Demo-Galerie (keine echten Fotos).
Aufruf: python tools/make_demo_gallery.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "demo" / "galerie"
W, H = 1200, 800
random.seed(7)


def gradient(top, bottom, w=W, h=H):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img.convert("RGBA")


def skyline(width, color=(0, 0, 0)):
    sk = Image.open(ROOT / "assets" / "skyline.png").convert("RGBA")
    h = int(sk.height * width / sk.width)
    sk = sk.resize((width, h), Image.LANCZOS)
    solid = Image.new("RGBA", sk.size, color + (255,))
    solid.putalpha(sk.getchannel("A"))
    return solid


def bokeh(img, n, colors, rmin, rmax, area=None, blur=6):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = area or (0, 0, img.width, img.height)
    for _ in range(n):
        r = random.randint(rmin, rmax)
        x, y = random.randint(x0, x1), random.randint(y0, y1)
        c = random.choice(colors)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (random.randint(60, 150),))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def crest(height):
    c = Image.open(ROOT / "tools" / "out" / "wappen.png").convert("RGBA")
    return c.resize((int(c.width * height / c.height), height), Image.LANCZOS)


def save(img, album, name):
    (OUT / album).mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(OUT / album / f"{name}.webp", "WEBP", quality=80, method=6)
    print(album, name)


def ground(img, sk_color=(0, 0, 0), y_off=0):
    sk = skyline(img.width, sk_color)
    img.alpha_composite(sk, (0, img.height - sk.height + y_off))


# ------------------------------------------------------------ Stiftungsfest
def kommers():
    img = gradient((18, 40, 12), (4, 10, 4))
    bokeh(img, 70, [(217, 178, 58), (255, 214, 120), (136, 187, 42)], 8, 34, (0, 0, W, 520))
    c = crest(300)
    img.alpha_composite(c, ((W - c.width) // 2, 90))
    ground(img)
    save(img, "2026-06 Stiftungsfest", "01 Festkommers")


def ball():
    img = gradient((12, 18, 48), (40, 18, 60))
    d = ImageDraw.Draw(img)
    for k in range(3):
        pts = []
        for i in range(0, W + 1, 20):
            y = 120 + k * 90 + 60 * math.sin(i / W * math.pi) ** 2
            pts.append((i, y))
        d.line(pts, fill=(70, 70, 70, 255), width=2)
        for i in range(0, W, 48):
            y = 120 + k * 90 + 60 * math.sin(i / W * math.pi) ** 2
            d.ellipse([i - 7, y - 2, i + 7, y + 12], fill=(255, 215, 120, 255))
    bokeh(img, 40, [(255, 200, 90), (255, 240, 200)], 6, 22, (0, 80, W, 420), blur=8)
    ground(img)
    save(img, "2026-06 Stiftungsfest", "02 Ballabend")


def garten_abend():
    img = gradient((246, 152, 76), (120, 60, 120))
    d = ImageDraw.Draw(img)
    d.ellipse([W // 2 - 90, 330, W // 2 + 90, 510], fill=(255, 226, 150, 255))
    ground(img)
    save(img, "2026-06 Stiftungsfest", "03 Begrüßungsabend im Garten")


def fruehschoppen():
    img = gradient((166, 206, 236), (245, 238, 220))
    d = ImageDraw.Draw(img)
    d.ellipse([880, 90, 1010, 220], fill=(255, 236, 170, 255))
    for x, y in [(160, 140), (420, 90), (700, 170)]:
        for dx, dy, r in [(0, 0, 40), (45, 10, 32), (-40, 12, 30), (20, -18, 34)]:
            d.ellipse([x + dx - r, y + dy - r, x + dx + r, y + dy + r], fill=(255, 255, 255, 230))
    ground(img, (30, 40, 30))
    save(img, "2026-06 Stiftungsfest", "04 Frühschoppen")


# ------------------------------------------------------------ Semesterprogramm
def kanu():
    img = gradient((150, 200, 230), (30, 90, 140))
    d = ImageDraw.Draw(img)
    for i in range(14):
        y = 430 + i * 28
        d.line([(x, y + 8 * math.sin(x / 60 + i)) for x in range(0, W + 1, 12)], fill=(220, 240, 255, 120), width=3)
    for x in range(0, W, 70):
        h = random.randint(120, 220)
        d.polygon([(x, 430), (x + 35, 430 - h), (x + 70, 430)], fill=(30, 70, 40, 255))
    d.chord([380, 470, 860, 560], 0, 180, fill=(140, 40, 20, 255))
    for px in (500, 700):
        d.ellipse([px - 16, 420, px + 16, 452], fill=(240, 200, 160, 255))
        d.rectangle([px - 18, 452, px + 18, 500], fill=(136, 187, 42, 255))
        d.line([(px - 60, 440), (px + 40, 540)], fill=(90, 60, 30, 255), width=6)
    save(img, "2026-05 Semesterprogramm", "01 Kanutour")


def fussball():
    img = gradient((70, 150, 60), (40, 110, 40))
    d = ImageDraw.Draw(img)
    for i in range(0, W, 120):
        d.rectangle([i, 0, i + 60, H], fill=(84, 164, 72, 255))
    d.rectangle([60, 60, W - 60, H - 60], outline=(255, 255, 255, 220), width=6)
    d.line([(W // 2, 60), (W // 2, H - 60)], fill=(255, 255, 255, 220), width=6)
    d.ellipse([W // 2 - 110, H // 2 - 110, W // 2 + 110, H // 2 + 110], outline=(255, 255, 255, 220), width=6)
    bx, by, r = 760, 520, 60
    d.ellipse([bx - r, by - r, bx + r, by + r], fill=(250, 250, 250, 255), outline=(20, 20, 20, 255), width=4)
    pts = [(bx + 22 * math.cos(a), by + 22 * math.sin(a)) for a in [math.pi / 2 + k * 2 * math.pi / 5 for k in range(5)]]
    d.polygon(pts, fill=(20, 20, 20, 255))
    save(img, "2026-05 Semesterprogramm", "02 Fußballturnier")


def vortrag():
    img = gradient((26, 26, 30), (8, 8, 10))
    d = ImageDraw.Draw(img)
    d.rectangle([520, 120, 1080, 440], fill=(230, 230, 220, 255))
    d.rectangle([560, 160, 1040, 200], fill=(136, 187, 42, 255))
    for i in range(4):
        d.rectangle([560, 240 + i * 45, 560 + random.randint(250, 470), 260 + i * 45], fill=(120, 120, 120, 255))
    light = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(light).polygon([(300, 0), (200, H), (420, H)], fill=(255, 240, 200, 50))
    img.alpha_composite(light.filter(ImageFilter.GaussianBlur(12)))
    d.polygon([(250, 520), (350, 520), (330, 760), (270, 760)], fill=(60, 40, 25, 255))
    for x in range(40, W, 90):
        d.ellipse([x, 690, x + 70, 760], fill=(18, 18, 20, 255))
        d.rectangle([x + 5, 730, x + 65, 800], fill=(18, 18, 20, 255))
    save(img, "2026-05 Semesterprogramm", "03 Vortragsabend")


def kneipe():
    img = gradient((92, 54, 28), (42, 24, 12))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 560, W, H], fill=(60, 36, 18, 255))
    for i, x in enumerate(range(170, W - 100, 230)):
        d.rounded_rectangle([x, 380, x + 110, 560], 18, fill=(214, 160, 40, 255))
        d.rounded_rectangle([x - 6, 360, x + 116, 400], 20, fill=(250, 245, 230, 255))
        d.arc([x + 90, 420, x + 160, 520], -90, 90, fill=(214, 160, 40, 255), width=14)
        d.rectangle([x + 20, 160 + (i % 2) * 40, x + 32, 300], fill=(240, 235, 220, 255))
        d.ellipse([x + 16, 130 + (i % 2) * 40, x + 36, 165 + (i % 2) * 40], fill=(255, 190, 80, 255))
    bokeh(img, 30, [(255, 190, 80)], 6, 18, (0, 60, W, 340), blur=10)
    save(img, "2026-05 Semesterprogramm", "04 Krambambuli-Abend")


# ------------------------------------------------------------ Haus & Garten
def haus_winter():
    img = gradient((14, 24, 54), (40, 60, 100))
    bokeh(img, 160, [(255, 255, 255)], 2, 6, blur=1)
    ground(img, (250, 250, 255))
    sk = skyline(W, (10, 14, 30))
    img.alpha_composite(sk, (0, H - sk.height + 10))
    save(img, "2025-12 Haus & Garten", "01 Das Haus im Winter")


def garten():
    img = gradient((180, 220, 160), (90, 150, 80))
    d = ImageDraw.Draw(img)
    for x, y, r, c in [(200, 380, 150, (60, 120, 50)), (520, 320, 190, (80, 140, 60)), (900, 360, 170, (50, 105, 45))]:
        d.rectangle([x - 18, y + r - 40, x + 18, y + r + 160], fill=(90, 60, 35, 255))
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,))
    d.rectangle([0, 640, W, H], fill=(70, 120, 55, 255))
    d.rectangle([440, 600, 760, 620], fill=(110, 70, 40, 255))
    d.rectangle([460, 620, 480, 680], fill=(110, 70, 40, 255))
    d.rectangle([720, 620, 740, 680], fill=(110, 70, 40, 255))
    save(img, "2025-12 Haus & Garten", "02 Garten im Sommer")


def kueche():
    img = Image.open(ROOT / "assets" / "demo" / "news-kueche.webp").convert("RGBA").resize((W, H // 2 * 2 * 2 // 2), Image.LANCZOS)
    save(img, "2025-12 Haus & Garten", "03 Neue Küche")


if __name__ == "__main__":
    for f in (kommers, ball, garten_abend, fruehschoppen, kanu, fussball, vortrag, kneipe, haus_winter, garten, kueche):
        f()
