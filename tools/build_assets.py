"""
Erzeugt Wappen, Skyline und App-Icons aus dem Website-Screenshot.

Nur für die Entwicklung nötig. Aufruf (im Projektordner):
    python tools/build_assets.py

Benötigt: Pillow, numpy, scipy
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "screenshot.webp"
OUT = ROOT / "assets"
SRC_OUT = ROOT / "tools" / "out"  # große Quelldateien (nicht für die App)
ICONS = OUT / "icons"
BG = np.array([243, 243, 243], dtype=float)
PAGE_BG = (243, 243, 243)


def color_to_alpha(rgb, bg=BG):
    """GIMP-artiges 'Farbe zu Transparenz' gegen eine Hintergrundfarbe."""
    c = rgb.astype(float)
    alpha_c = np.where(c < bg, (bg - c) / bg, (c - bg) / np.maximum(255 - bg, 1))
    alpha = np.clip(alpha_c.max(axis=-1), 0, 1)
    safe = np.where(alpha > 1e-6, alpha, 1)[..., None]
    col = np.clip((c - bg) / safe + bg, 0, 255)
    return col, alpha


def flood_background(fg_like, seed_border=True):
    """Hintergrund = zusammenhängende Nicht-Vordergrund-Fläche, die den Rand berührt."""
    bg_like = ~fg_like
    labels, _ = ndimage.label(bg_like)
    border = np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])
    ids = np.unique(border[border > 0])
    return np.isin(labels, ids)


def crest(a, box, name, keep="all"):
    x0, y0, x1, y1 = box
    reg = a[y0:y1, x0:x1].astype(float)
    diff = np.abs(reg - BG).sum(axis=-1)
    darker = reg.mean(axis=-1) < BG.mean() - 2
    colored = (reg.max(axis=-1) - reg.min(axis=-1)) > 14
    fg_like = (diff > 24) & (darker | colored)
    bg = flood_background(fg_like)

    col, a2 = color_to_alpha(reg)
    band = ndimage.binary_dilation(bg, iterations=2) & ~bg
    alpha = np.ones(reg.shape[:2])
    alpha[bg] = 0
    alpha[band] = a2[band]
    rgb = reg.copy()
    rgb[band] = col[band]
    # Weißanteile leicht aufhellen (Screenshot-Grau -> Weiß)
    rgb = np.clip(rgb * (255 / 243), 0, 255)

    if keep != "all":
        # Nur das eigentliche Wappen behalten: größte zusammenhängende Fläche
        # plus alles, was darin eingeschlossen ist (Zahlen, Details im Schild).
        # Buchstaben des Schriftzugs liegen außerhalb und fallen weg.
        solid = alpha > 0.05
        labels, n = ndimage.label(solid, structure=np.ones((3, 3)))
        sizes = ndimage.sum(solid, labels, range(1, n + 1))
        main = int(np.argmax(sizes)) + 1
        main_mask = labels == main
        filled = ndimage.binary_fill_holes(ndimage.binary_closing(main_mask, iterations=4))
        near = ndimage.binary_dilation(main_mask, iterations=3)
        keep_ids = {main}
        for i in range(1, n + 1):
            if i == main:
                continue
            comp = labels == i
            share = (comp & (filled | near)).sum() / max(comp.sum(), 1)
            if share > 0.8:
                keep_ids.add(i)
        mask = np.isin(labels, list(keep_ids))
        mask = ndimage.binary_dilation(mask, iterations=2)
        alpha = np.where(mask, alpha, 0)

    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")
    img = img.crop(img.getbbox())
    SRC_OUT.mkdir(parents=True, exist_ok=True)
    img.save(SRC_OUT / f"{name}.png", optimize=True)
    print(name, img.size)
    return img


def skyline(a):
    y0, y1 = 1300, 1745
    reg = a[y0:y1, :].astype(float)
    lum = reg.mean(axis=-1)
    alpha = np.clip((BG.mean() - lum) / (BG.mean() - 8), 0, 1)
    rgba = np.zeros((*lum.shape, 4), dtype=np.uint8)
    rgba[..., 3] = (alpha * 255).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")
    img = img.crop(img.getbbox())
    img.save(OUT / "skyline.png", optimize=True)
    # kleinere Variante für Mobilgeräte
    small = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
    small.save(OUT / "skyline-1000.png", optimize=True)
    print("skyline", img.size)
    return img


def icon(crest_img, size, pad, bg=PAGE_BG, name=None, radius=0):
    canvas = Image.new("RGBA", (size, size), bg + (255,))
    inner = int(size * (1 - 2 * pad))
    c = crest_img.copy()
    c.thumbnail((inner, inner), Image.LANCZOS)
    canvas.alpha_composite(c, ((size - c.width) // 2, (size - c.height) // 2))
    if radius:
        mask = Image.new("L", (size, size), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius, fill=255)
        canvas.putalpha(mask)
    canvas.save(ICONS / name, optimize=True)
    return canvas


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    a = np.asarray(Image.open(SRC).convert("RGB"))
    full = crest(a, (530, 70, 1500, 1232), "wappen-voll")
    only = crest(a, (530, 70, 1500, 1232), "wappen", keep=150)
    sky = skyline(a)

    # Web-Varianten (WebP mit Transparenz, klein)
    def webp(img, width, name):
        c = img.copy()
        c.thumbnail((width, width * 2), Image.LANCZOS)
        c.save(OUT / name, "WEBP", quality=88, method=6)
        print(name, c.size)

    webp(full, 720, "wappen-voll.webp")
    webp(only, 480, "wappen.webp")
    webp(only, 200, "wappen-klein.webp")
    small = only.copy()
    small.thumbnail((200, 200), Image.LANCZOS)
    small.save(OUT / "wappen-klein.png", optimize=True)

    icon(only, 512, 0.08, name="icon-512.png")
    icon(only, 192, 0.08, name="icon-192.png")
    icon(only, 512, 0.17, name="maskable-512.png")
    icon(only, 192, 0.17, name="maskable-192.png")
    icon(only, 180, 0.09, name="apple-touch-icon.png")
    icon(only, 64, 0.04, name="favicon-64.png")
    icon(only, 32, 0.02, name="favicon-32.png")
    print("Icons fertig")


if __name__ == "__main__":
    main()
