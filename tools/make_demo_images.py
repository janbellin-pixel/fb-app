"""
Erzeugt Titelbilder für die Demo-News im Stil der Verbindung.
Aufruf: python tools/make_demo_images.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "tools" / "out" / "fonts"
OUT = ROOT / "assets" / "demo"
W, H = 1200, 600
BG = (243, 243, 243)
GREEN = (136, 187, 42)
BLACK = (0, 0, 0)
GOLD = (217, 178, 58)


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def skyline(width, color=BLACK):
    sk = Image.open(ROOT / "assets" / "skyline.png").convert("RGBA")
    h = int(sk.height * width / sk.width)
    sk = sk.resize((width, h), Image.LANCZOS)
    if color != BLACK:
        solid = Image.new("RGBA", sk.size, color + (255,))
        solid.putalpha(sk.getchannel("A"))
        sk = solid
    return sk


def crest(height, full=False):
    c = Image.open(ROOT / "tools" / "out" / ("wappen-voll.png" if full else "wappen.png")).convert("RGBA")
    w = int(c.width * height / c.height)
    return c.resize((w, height), Image.LANCZOS)


def save(img, name):
    img.convert("RGB").save(OUT / name, "WEBP", quality=82, method=6)
    print("Bild:", name)


def app_banner():
    img = Image.new("RGBA", (W, H), BG + (255,))
    c = crest(470)
    img.alpha_composite(c, (60, (H - c.height) // 2))
    d = ImageDraw.Draw(img)
    box = (620, 170, W, 430)
    d.rectangle(box, fill=BLACK)
    d.text((660, 205), "Mitglieder-App", font=font("Raleway-300.ttf", 66), fill=(255, 255, 255))
    d.text((662, 300), "Termine · Chat · Zeitung", font=font("Raleway-300.ttf", 34), fill=(200, 200, 200))
    d.text((662, 350), "Mitglieder · Adressen · Forum", font=font("Raleway-300.ttf", 34), fill=(200, 200, 200))
    save(img, "news-app.webp")


def fest_banner():
    img = Image.new("RGBA", (W, H), GREEN + (255,))
    d = ImageDraw.Draw(img)
    f = font("Unifraktur.ttf", 120)
    text = "Stiftungsfest"
    tw = d.textlength(text, font=f)
    d.text(((W - tw) / 2, 60), text, font=f, fill=BLACK)
    f2 = font("Raleway-300.ttf", 40)
    sub = "Drei Tage, ein Bund"
    d.text(((W - d.textlength(sub, font=f2)) / 2, 215), sub, font=f2, fill=BLACK)
    sk = skyline(W)
    img.alpha_composite(sk, (0, H - sk.height))
    save(img, "news-stiftungsfest.webp")


def kueche_banner():
    img = Image.new("RGBA", (W, H), BLACK + (255,))
    d = ImageDraw.Draw(img)
    # stilisiertes Haus als Linienzeichnung
    s = 3.2
    ox, oy = 120, 120
    pts = [(3, 10.5), (12, 3), (21, 10.5)]
    d.line([(ox + x * 12 * s / 3, oy + y * 12 * s / 3) for x, y in pts], fill=GREEN, width=14, joint="curve")
    body = [(5, 9.5), (5, 20), (19, 20), (19, 9.5)]
    d.line([(ox + x * 12 * s / 3, oy + y * 12 * s / 3) for x, y in body], fill=GREEN, width=14, joint="curve")
    door = [(10, 20), (10, 14), (14, 14), (14, 20)]
    d.line([(ox + x * 12 * s / 3, oy + y * 12 * s / 3) for x, y in door], fill=GREEN, width=10, joint="curve")
    d.text((560, 180), "Die neue Küche", font=font("Raleway-300.ttf", 76), fill=(255, 255, 255))
    d.text((562, 290), "ist fertig.", font=font("Raleway-300.ttf", 76), fill=(255, 255, 255))
    d.text((564, 410), "Haus & Zimmer", font=font("Raleway-600.ttf", 30), fill=GREEN)
    save(img, "news-kueche.webp")


def vortrag_banner():
    img = Image.new("RGBA", (W, H), (22, 22, 22, 255))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 18, H), fill=GOLD)
    d.text((90, 150), "Vortragsreihe", font=font("Raleway-300.ttf", 96), fill=(255, 255, 255))
    d.text((94, 290), "Wissen teilen – über Generationen.", font=font("Raleway-300.ttf", 40), fill=(205, 205, 205))
    d.text((94, 380), "VORTRAG", font=font("Raleway-700.ttf", 28), fill=GOLD)
    sk = skyline(520, (60, 60, 60))
    img.alpha_composite(sk, (W - 560, H - sk.height))
    save(img, "news-vortrag.webp")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    app_banner()
    fest_banner()
    kueche_banner()
    vortrag_banner()
