"""
Erzeugt die Kurzanleitung für die Mitglieder als PDF (3 Seiten A4: Installieren, Überblick, Hintergrund) mit QR-Code
und den QR-Code zusätzlich als Bild:

    docs/Anleitung-Mitglieder-App.pdf
    docs/qr-code.png

Aufruf (im Projektordner), mit der echten Adresse der App:

    python tools/make_anleitung.py https://DEINNAME.github.io/fb-app/
    python tools/make_anleitung.py https://… --domain frankonia-brunonia.de --kontakt "Max Muster, 0151 1234567"

Ohne Adresse entsteht ein deutlich markiertes MUSTER (ohne QR-Code).
Benötigt: reportlab, Pillow, pyphen (Silbentrennung).
"""
import argparse
import io
import math
import sys
from pathlib import Path

from PIL import Image
from reportlab.graphics.barcode import qrencoder
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "tools" / "out" / "fonts"
OUT_PDF = ROOT / "docs" / "Anleitung-Mitglieder-App.pdf"
OUT_QR = ROOT / "docs" / "qr-code.png"
PLACEHOLDER = "https://DEINNAME.github.io/fb-app/"
PAGES = 3

W, H = A4
M = 16 * mm
GREEN = colors.HexColor("#88bb2a")
GREEN_INK = colors.HexColor("#46700f")
GREEN_SOFT = colors.HexColor("#eef5e1")
GREY_BG = colors.HexColor("#f3f3f3")
GREY = colors.HexColor("#5f5f5f")
LINE = colors.HexColor("#d6d6d6")
BLACK = colors.black
WHITE = colors.white

F = {"light": "Helvetica", "regular": "Helvetica", "semi": "Helvetica-Bold", "bold": "Helvetica-Bold", "fraktur": "Times-Italic"}


# Eindeutige interne Namen je Schnitt. Die aus der variablen Schrift erzeugten Dateien heißen
# sonst alle „Raleway-Thin“ – PDF-Betrachter verwechseln die Schnitte dann (kein Fettdruck).
FONT_NAMES = {
    "Raleway-300.ttf": ("Raleway Light", "Regular", "Raleway-Light"),
    "Raleway-400.ttf": ("Raleway", "Regular", "Raleway-Regular"),
    "Raleway-400i.ttf": ("Raleway", "Italic", "Raleway-Italic"),
    "Raleway-600.ttf": ("Raleway SemiBold", "Regular", "Raleway-SemiBold"),
    "Raleway-700.ttf": ("Raleway", "Bold", "Raleway-Bold"),
}


def ensure_unique_font_names():
    """Benennt die Schriftdateien in tools/out/fonts eindeutig (einmalig; auch für make_demo_pdfs.py)"""
    try:
        from fontTools.ttLib import TTFont as FTFont
    except ImportError:
        return
    for file, (family, sub, ps) in FONT_NAMES.items():
        path = FONTS / file
        if not path.exists():
            continue
        font = FTFont(str(path))
        names = font["name"]
        if names.getDebugName(6) == ps:
            continue
        for nid in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
            names.removeNames(nameID=nid)
        full = f"{family} {sub}".replace(" Regular", "") if sub == "Regular" else f"{family} {sub}"
        for nid, value in ((1, family), (2, sub), (3, f"{ps};FB"), (4, full), (6, ps)):
            names.setName(value, nid, 3, 1, 0x409)
            names.setName(value, nid, 1, 0, 0)
        font.save(str(path))
        print(f"Schrift umbenannt: {file} → {ps}")


def register_fonts():
    """Raleway wie in der App; falls die Schriftdateien fehlen, Helvetica."""
    ensure_unique_font_names()
    files = {"light": "Raleway-300.ttf", "regular": "Raleway-400.ttf", "semi": "Raleway-600.ttf", "bold": "Raleway-700.ttf", "fraktur": "Unifraktur.ttf"}
    for key, file in files.items():
        path = FONTS / file
        if path.exists():
            name = f"FB-{key}"
            pdfmetrics.registerFont(TTFont(name, str(path)))
            F[key] = name
    if F["regular"].startswith("FB-"):
        pdfmetrics.registerFontFamily("FB", normal=F["regular"], bold=F["bold"], italic=F["regular"], boldItalic=F["bold"])


def style(size, font="regular", color=BLACK, leading=None, **kw):
    hy = dict(hyphenationLang="de_DE", embeddedHyphenation=1, uriWasteReduce=0.3)
    return ParagraphStyle(f"s{size}{font}", fontName=F[font], fontSize=size, leading=leading or size * 1.38,
                          textColor=color, alignment=TA_LEFT, **hy, **kw)


def para(c, text, st, x, y_top, width):
    """Absatz mit Umbruch zeichnen; gibt die Höhe zurück"""
    p = Paragraph(text, st)
    _, h = p.wrap(width, 2000)
    p.drawOn(c, x, y_top - h)
    return h


def b(text):
    return f'<font name="{F["bold"]}">{text}</font>'


def image(path, max_w=None, max_h=None):
    img = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 0))
    bg.alpha_composite(img)
    buf = io.BytesIO()
    bg.save(buf, "PNG")
    buf.seek(0)
    return ImageReader(buf), img.size


# ------------------------------------------------------------------ QR-Code

def qr_matrix(url):
    q = qrencoder.QRCode(None, qrencoder.QRErrorCorrectLevel.M)
    q.addData(url)
    q.make()
    n = q.getModuleCount()
    return [[q.isDark(r, col) for col in range(n)] for r in range(n)]


def draw_qr(c, url, x, y, size):
    m = qr_matrix(url)
    n = len(m)
    quiet = 2
    cell = size / (n + 2 * quiet)
    c.setFillColor(WHITE)
    c.rect(x, y, size, size, stroke=0, fill=1)
    c.setFillColor(BLACK)
    for r in range(n):
        col = 0
        while col < n:
            if m[r][col]:
                start = col
                while col < n and m[r][col]:
                    col += 1
                c.rect(x + (quiet + start) * cell, y + size - (quiet + r + 1) * cell, (col - start) * cell + 0.05, cell + 0.05, stroke=0, fill=1)
            else:
                col += 1


def save_qr_png(url, path, box=24, border=4):
    m = qr_matrix(url)
    n = len(m)
    size = (n + 2 * border) * box
    img = Image.new("L", (size, size), 255)
    px = img.load()
    for r in range(n):
        for col in range(n):
            if m[r][col]:
                for dy in range(box):
                    for dx in range(box):
                        px[(border + col) * box + dx, (border + r) * box + dy] = 0
    img.save(path, optimize=True)
    return size


# ------------------------------------------------------------------ Symbole (wie in der App)

def _pen(c, color, width):
    c.setStrokeColor(color)
    c.setLineWidth(width)
    c.setLineCap(1)
    c.setLineJoin(1)


def icon(c, name, cx, cy, s, color=BLACK, width=None):
    """Einfache Linien-Symbole, s = Kantenlänge in pt, Mittelpunkt cx/cy"""
    _pen(c, color, width or s * 0.085)
    x0, y0 = cx - s / 2, cy - s / 2
    u = s / 24.0  # Raster wie die App-Symbole (24er)

    def P(x, y):
        return x0 + x * u, y0 + (24 - y) * u

    if name == "home":
        p = c.beginPath()
        p.moveTo(*P(3, 10.5)); p.lineTo(*P(12, 3)); p.lineTo(*P(21, 10.5))
        p.moveTo(*P(5, 9)); p.lineTo(*P(5, 21)); p.lineTo(*P(19, 21)); p.lineTo(*P(19, 9))
        p.moveTo(*P(10, 21)); p.lineTo(*P(10, 14)); p.lineTo(*P(14, 14)); p.lineTo(*P(14, 21))
        c.drawPath(p, stroke=1, fill=0)
    elif name == "calendar":
        c.roundRect(*P(3, 21), 18 * u, 16 * u, 2 * u, stroke=1, fill=0)
        c.line(*P(3, 10), *P(21, 10))
        c.line(*P(8, 3), *P(8, 7))
        c.line(*P(16, 3), *P(16, 7))
    elif name == "chat":
        p = c.beginPath()
        p.moveTo(*P(4, 5)); p.lineTo(*P(20, 5)); p.lineTo(*P(20, 16)); p.lineTo(*P(11, 16)); p.lineTo(*P(6, 20)); p.lineTo(*P(6, 16)); p.lineTo(*P(4, 16)); p.close()
        c.drawPath(p, stroke=1, fill=0)
    elif name == "users":
        c.circle(*P(9, 8), 3.6 * u, stroke=1, fill=0)
        p = c.beginPath()
        p.moveTo(*P(2.5, 20)); p.curveTo(*P(2.5, 14.5), *P(15.5, 14.5), *P(15.5, 20))
        c.drawPath(p, stroke=1, fill=0)
        p = c.beginPath()
        p.moveTo(*P(16, 4.6)); p.curveTo(*P(19.8, 5.5), *P(19.8, 10.5), *P(16, 11.4))
        p.moveTo(*P(18, 14.6)); p.curveTo(*P(20.5, 15.4), *P(21.5, 17.5), *P(21.5, 20))
        c.drawPath(p, stroke=1, fill=0)
    elif name == "grid":
        for gx, gy in ((4, 4), (13.5, 4), (4, 13.5), (13.5, 13.5)):
            c.roundRect(*P(gx, gy + 6.5), 6.5 * u, 6.5 * u, 1.2 * u, stroke=1, fill=0)
    elif name == "share":
        p = c.beginPath()
        p.moveTo(*P(8, 9)); p.lineTo(*P(5, 9)); p.lineTo(*P(5, 21)); p.lineTo(*P(19, 21)); p.lineTo(*P(19, 9)); p.lineTo(*P(16, 9))
        p.moveTo(*P(12, 15)); p.lineTo(*P(12, 2.5))
        p.moveTo(*P(8, 6)); p.lineTo(*P(12, 2.5)); p.lineTo(*P(16, 6))
        c.drawPath(p, stroke=1, fill=0)
    elif name == "music":
        p = c.beginPath()
        p.moveTo(*P(9, 18)); p.lineTo(*P(9, 5)); p.lineTo(*P(21, 3)); p.lineTo(*P(21, 16))
        c.drawPath(p, stroke=1, fill=0)
        c.circle(*P(6, 18), 3 * u, stroke=1, fill=0)
        c.circle(*P(18, 16), 3 * u, stroke=1, fill=0)
    elif name == "plussquare":
        c.roundRect(*P(4, 20), 16 * u, 16 * u, 3 * u, stroke=1, fill=0)
        c.line(*P(12, 8), *P(12, 16))
        c.line(*P(8, 12), *P(16, 12))
    elif name == "dots-v":
        c.setFillColor(color)
        for yy in (5, 12, 19):
            c.circle(*P(12, yy), 1.9 * u, stroke=0, fill=1)
    elif name == "dots-h":
        c.setFillColor(color)
        for xx in (5, 12, 19):
            c.circle(*P(xx, 12), 1.9 * u, stroke=0, fill=1)
    elif name == "check":
        p = c.beginPath()
        p.moveTo(*P(4, 12.5)); p.lineTo(*P(9.5, 18)); p.lineTo(*P(20, 6.5))
        c.drawPath(p, stroke=1, fill=0)
    elif name == "shield":
        p = c.beginPath()
        p.moveTo(*P(12, 2.5)); p.lineTo(*P(20, 5.5)); p.lineTo(*P(20, 11)); p.curveTo(*P(20, 16.5), *P(16.5, 19.8), *P(12, 21.5))
        p.curveTo(*P(7.5, 19.8), *P(4, 16.5), *P(4, 11)); p.lineTo(*P(4, 5.5)); p.close()
        c.drawPath(p, stroke=1, fill=0)
    elif name == "text":
        c.setFillColor(color)
        c.setFont(F["semi"], 9.5 * u)
        c.drawCentredString(*P(8, 18), "A")
        c.setFont(F["semi"], 15 * u)
        c.drawCentredString(*P(16.5, 19), "A")
    elif name == "mail":
        c.roundRect(*P(3, 19), 18 * u, 14 * u, 2 * u, stroke=1, fill=0)
        p = c.beginPath()
        p.moveTo(*P(3.5, 6)); p.lineTo(*P(12, 12.5)); p.lineTo(*P(20.5, 6))
        c.drawPath(p, stroke=1, fill=0)
    elif name == "tablet":
        c.roundRect(*P(4, 22), 16 * u, 20 * u, 2.5 * u, stroke=1, fill=0)
        c.setFillColor(color)
        c.circle(*P(12, 18.5), 1.1 * u, stroke=0, fill=1)
    elif name == "folder":
        p = c.beginPath()
        p.moveTo(*P(3, 19)); p.lineTo(*P(3, 6)); p.lineTo(*P(9, 6)); p.lineTo(*P(11, 8.5)); p.lineTo(*P(21, 8.5)); p.lineTo(*P(21, 19)); p.close()
        c.drawPath(p, stroke=1, fill=0)


def number_badge(c, n, x, y, r=11):
    c.setFillColor(GREEN)
    c.circle(x, y, r, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#0f1f00"))
    c.setFont(F["bold"], r * 1.15)
    c.drawCentredString(x, y - r * 0.4, str(n))


def watermark(c):
    c.saveState()
    c.setFillColor(colors.HexColor("#c0392b"))
    c.setFillAlpha(0.09)
    c.translate(W / 2, H / 2)
    c.rotate(38)
    c.setFont(F["bold"], 110)
    c.drawCentredString(0, -30, "MUSTER")
    c.restoreState()


def header(c, title, subtitle, crest):
    top = H - M
    ch = 22 * mm
    if crest:
        reader, (iw, ih) = crest
        cw = ch * iw / ih
        c.drawImage(reader, M, top - ch, cw, ch, mask="auto")
        bx = M + cw + 5 * mm
    else:
        bx = M
    c.setFillColor(BLACK)
    c.rect(bx, top - ch, W - M - bx, ch, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont(F["light"], 25)
    c.drawString(bx + 6 * mm, top - 10.5 * mm, title)
    c.setFillColor(colors.HexColor("#d9d9d9"))
    c.setFont(F["regular"], 11.5)
    c.drawString(bx + 6 * mm, top - 17 * mm, subtitle)
    return top - ch


def footer(c, page, sample):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(M, M + 4 * mm, W - M, M + 4 * mm)
    c.setFillColor(GREY)
    c.setFont(F["regular"], 8.5)
    c.drawString(M, M, "Frankonia-Brunonia · Mitglieder-App · Kurzanleitung" + (" · MUSTER – Adresse noch nicht eingetragen" if sample else ""))
    c.drawRightString(W - M, M, f"Seite {page} von {PAGES}")


# ------------------------------------------------------------------ Seite 1: Installieren

def page_install(c, url, sample, domain, crest):
    if sample:
        watermark(c)
    y = header(c, "Mitglieder-App", "Frankonia-Brunonia · so kommt die App auf dein Handy", crest) - 5 * mm
    body = style(12, leading=16.5)
    small = style(10.5, color=GREY, leading=14)
    tw = W - 2 * M

    y -= para(c, "Termine, Zu- und Absagen, Mitglieder, Chat, Adressen, Bundesbote, DS-Zeitung, Liedermappe und Fotos – alles in einer App. "
                 "Kostenlos und ohne App-Store.", style(13, "light", leading=18), M, y, tw)
    y -= 5 * mm

    def step(n, title, y):
        number_badge(c, n, M + 11, y - 10)
        c.setFillColor(BLACK)
        c.setFont(F["semi"], 15.5)
        c.drawString(M + 30, y - 15, title)
        return y - 22

    # 1 · Öffnen (mit QR-Code)
    qr_size = 46 * mm
    top1 = y
    y = step(1, "Öffnen", y)
    text_w = tw - qr_size - 8 * mm
    y -= para(c, "Die Kamera deines Handys auf den QR-Code richten und auf den Link tippen, der dann erscheint.", body, M + 30, y, text_w - 30)
    y -= 3 * mm
    y -= para(c, "Oder diese Adresse im Browser eingeben:", small, M + 30, y, text_w - 30)
    y -= 1.5 * mm
    font_size = 13
    while c.stringWidth(url, F["bold"], font_size) > text_w - 30 and font_size > 8:
        font_size -= 0.5
    c.setFillColor(GREEN_INK if not sample else colors.HexColor("#c0392b"))
    c.setFont(F["bold"], font_size)
    c.drawString(M + 30, y - font_size, url)
    y -= font_size + 3 * mm
    if sample:
        y -= para(c, "(Platzhalter – die echte Adresse wird eingetragen, sobald die App veröffentlicht ist.)", style(9.5, color=colors.HexColor("#c0392b")), M + 30, y, text_w - 30)
    qx = W - M - qr_size
    qy = top1 - qr_size - 1 * mm
    if sample:
        c.setStrokeColor(LINE)
        c.setDash(4, 3)
        c.setLineWidth(1)
        c.rect(qx, qy, qr_size, qr_size, stroke=1, fill=0)
        c.setDash()
        c.setFillColor(GREY)
        c.setFont(F["regular"], 10)
        c.drawCentredString(qx + qr_size / 2, qy + qr_size / 2 + 3, "Hier erscheint")
        c.drawCentredString(qx + qr_size / 2, qy + qr_size / 2 - 10, "der QR-Code")
    else:
        draw_qr(c, url, qx, qy, qr_size)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.8)
        c.rect(qx, qy, qr_size, qr_size, stroke=1, fill=0)
    y = min(y, qy) - 5 * mm

    # 2 · Anmelden
    y = step(2, "Anmelden – nur einmal", y)
    konto = f"dein Google-Konto der Verbindung ({b('…@' + domain)})" if domain else "dein Google-Konto der Verbindung"
    y -= para(c, f"Auf {b('„Mit Google anmelden“')} tippen und {konto} wählen – die App merkt sich die Anmeldung. "
                 f"{b('Beim allerersten Anmelden')} verlangt Google ein neues, eigenes Passwort.", body, M + 30, y, tw - 30)
    y -= 3.5 * mm

    # 3 · Datenschutz
    y = step(3, "Datenschutz bestätigen", y)
    y -= para(c, f"Hinweise lesen, bei den drei Fragen jeweils {b('Ja')} oder {b('Nein')} antippen, dann {b('„Speichern und weiter“')} – "
                 "änderbar unter Mehr › Datenschutz.", body, M + 30, y, tw - 30)
    y -= 3.5 * mm

    # 4 · Startbildschirm
    y = step(4, "Auf den Startbildschirm legen", y)
    y -= 1 * mm
    col_w = (tw - 30 - 5 * mm) / 2
    box_top = y
    boxes = [
        ("iPhone / iPad", "in Safari", [
            ("share", f"Auf das {b('Teilen-Symbol')} tippen (Viereck mit Pfeil). Bei neueren iPhones zuerst auf {b('•••')} neben der Adresszeile, dann auf {b('„Teilen“')}."),
            ("plussquare", f"Etwas nach unten wischen und {b('„Zum Home-Bildschirm“')} wählen."),
            ("check", f"„Als Web-App öffnen“ eingeschaltet lassen und oben rechts auf {b('„Hinzufügen“')} tippen."),
        ]),
        ("Android", "in Chrome", [
            ("check", f"Erscheint unten {b('„Installieren“')} oder {b('„App installieren“')}: antippen – fertig."),
            ("dots-v", f"Sonst oben rechts auf die {b('drei Punkte')} tippen und {b('„App installieren“')} bzw. {b('„Zum Startbildschirm hinzufügen“')} wählen."),
            ("plussquare", "Bestätigen. Die App erscheint wie jede andere auf dem Handy."),
        ]),
    ]
    heights = []
    # erst messen, dann zeichnen (gleich hohe Kästen)
    for _, _, items in boxes:
        h = 14.5 * mm
        for _, t in items:
            h += Paragraph(t, style(11, leading=15)).wrap(col_w - 16 * mm, 1000)[1] + 3 * mm
        heights.append(h)
    bh = max(heights) + 2 * mm
    for i, (title, sub, items) in enumerate(boxes):
        bx = M + 30 + i * (col_w + 5 * mm)
        c.setFillColor(GREY_BG)
        c.roundRect(bx, box_top - bh, col_w, bh, 6, stroke=0, fill=1)
        c.setFillColor(BLACK)
        c.setFont(F["bold"], 13)
        c.drawString(bx + 5 * mm, box_top - 8 * mm, title)
        c.setFillColor(GREY)
        c.setFont(F["regular"], 10)
        c.drawString(bx + 5 * mm + c.stringWidth(title, F["bold"], 13) + 2.5 * mm, box_top - 8 * mm, sub)
        yy = box_top - 13 * mm
        for ic, t in items:
            icon(c, ic, bx + 8.5 * mm, yy - 3.2 * mm, 5.2 * mm, GREEN_INK)
            yy -= para(c, t, style(11, leading=15), bx + 14 * mm, yy, col_w - 16 * mm) + 3 * mm
    y = box_top - bh - 4 * mm

    done = Paragraph(f"{b('Fertig!')} Ab jetzt öffnest du die App mit dem Wappen auf deinem Startbildschirm. "
                     f"{b('Hilfe?')} Die Aktiven unterstützen gern.", style(11.5, color=GREEN_INK, leading=15.5))
    dh = done.wrap(tw - 10 * mm, 1000)[1] + 6 * mm
    c.setFillColor(GREEN_SOFT)
    c.roundRect(M, y - dh, tw, dh, 6, stroke=0, fill=1)
    done.drawOn(c, M + 5 * mm, y - dh + 3 * mm)
    check_fits(y - dh, "Seite 1")
    footer(c, 1, sample)


def check_fits(bottom, where):
    """Warnt, falls Inhalt in die Fußzeile ragt (z. B. nach Textänderungen)"""
    if bottom < M + 7 * mm:
        print(f"WARNUNG: {where} ist zu voll – der Inhalt reicht {round((M + 7 * mm - bottom) / mm, 1)} mm in die Fußzeile.", file=sys.stderr)


# ------------------------------------------------------------------ Seite 2: Was finde ich wo?

def page_overview(c, sample, kontakt, crest, skyline):
    if sample:
        watermark(c)
    y = header(c, "Was finde ich wo?", "Die Leiste unten in der App – fünf Bereiche", crest) - 8 * mm
    tw = W - 2 * M

    # Leiste wie in der App
    tabs = [("home", "Start"), ("calendar", "Termine"), ("chat", "Chat"), ("users", "Mitglieder"), ("grid", "Mehr")]
    bar_h = 19 * mm
    c.setFillColor(BLACK)
    c.roundRect(M, y - bar_h, tw, bar_h, 8, stroke=0, fill=1)
    cw = tw / len(tabs)
    for i, (ic, label) in enumerate(tabs):
        cx = M + cw * i + cw / 2
        icon(c, ic, cx, y - 7.5 * mm, 6.5 * mm, GREEN if i == 0 else WHITE)
        c.setFillColor(WHITE)
        c.setFont(F["semi"], 10.5)
        c.drawCentredString(cx, y - 15.5 * mm, label)
    y -= bar_h + 5.5 * mm

    rows = [
        ("home", "Start", "Begrüßung, die nächsten Termine (direkt zu- oder absagen), die nächsten drei Geburtstage, Neuigkeiten, der neueste Bundesbote und neue Fotos."),
        ("calendar", "Termine", f"Alle Veranstaltungen als Liste oder Monat. Termin antippen › {b('Zusagen, Vielleicht oder Absagen')}, Gäste und Kommentar angeben, sehen wer kommt. "
                                f"„Kalender abonnieren“ holt alle Termine in deinen eigenen Kalender."),
        ("chat", "Chat", "Private Nachrichten und Gruppen: „Neue Nachricht“, „Neue Gruppe“ oder im Profil auf „Nachricht“. Benachrichtigungen: Mehr › Einstellungen oder App „Google Chat“."),
        ("users", "Mitglieder", f"Wer die App nutzt, mit Foto und Profil ({b('„Nur App-Nutzer“')} abschaltbar). Antippen › anrufen, E-Mail oder Nachricht schreiben. Unter {b('„Angebote für Jüngere“')} steht, wer Praktika, Mentoring & Co. anbietet."),
        ("grid", "Mehr", f"{b('Bundesbote')} · {b('DS-Zeitung')} · {b('Liedermappe')} · {b('Galerie')} · {b('News')} · {b('Forum')} · {b('Adressverzeichnis')} · {b('Wiki')} · "
                         f"{b('Mein Profil')} · {b('Datenschutz')} · {b('Schriftgröße')} · Einstellungen"),
    ]
    st = style(11.5, leading=16)
    for ic, title, text in rows:
        c.setFillColor(GREEN_SOFT)
        c.circle(M + 7 * mm, y - 6 * mm, 6.2 * mm, stroke=0, fill=1)
        icon(c, ic, M + 7 * mm, y - 6 * mm, 6.4 * mm, GREEN_INK)
        c.setFillColor(BLACK)
        c.setFont(F["semi"], 13.5)
        c.drawString(M + 17 * mm, y - 4.6 * mm, title)
        h = para(c, text, st, M + 17 * mm, y - 6.5 * mm, tw - 17 * mm)
        y -= max(13.5 * mm, 6.5 * mm + h + 2.5 * mm)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        c.line(M + 17 * mm, y + 1.8 * mm, W - M, y + 1.8 * mm)
    y -= 4 * mm

    # Gut zu wissen
    tips = [
        ("text", f"{b('Schrift zu klein?')} Mehr › Schriftgröße › „Groß“ oder „Sehr groß“."),
        ("users", f"{b('Profil ausfüllen, Anschrift prüfen:')} Mehr › Mein Profil. Adressänderungen schickst du dort mit dem Knopf „Adressänderung per E-Mail mitteilen“ an den Schriftwart."),
        ("music", f"{b('Liedermappe:')} Liednummer eintippen und Enter – schon ist das Lied offen."),
        ("shield", f"{b('Keine Sorge:')} Termine, Adressen, Bundesbote, DS-Zeitung, Liedermappe und Fotos zeigt die App nur an – kaputt machen kann man nichts. Ändern kannst du nur deine Zusagen, dein Profil und deine eigenen Beiträge."),
        ("share", f"{b('iPhone:')} Links aus dem Kalender öffnen sich in Safari statt in der App. Beim ersten Mal dort einmal anmelden – danach geht es direkt."),
        ("chat", f"{b('Fragen?')} {kontakt}"),
    ]
    tip_st = style(11, leading=15)
    inner_w = tw - 20 * mm
    hs = [Paragraph(t, tip_st).wrap(inner_w, 1000)[1] for _, t in tips]
    box_h = 13 * mm + sum(hs) + len(tips) * 3 * mm
    c.setFillColor(GREY_BG)
    c.roundRect(M, y - box_h, tw, box_h, 6, stroke=0, fill=1)
    c.setFillColor(BLACK)
    c.setFont(F["bold"], 13)
    c.drawString(M + 5 * mm, y - 8 * mm, "Gut zu wissen")
    yy = y - 12.5 * mm
    for (ic, t), h in zip(tips, hs):
        icon(c, ic, M + 9 * mm, yy - 3 * mm, 5 * mm, GREEN_INK)
        para(c, t, tip_st, M + 15 * mm, yy, inner_w)
        yy -= h + 3 * mm
    y -= box_h
    check_fits(y, "Seite 2")
    footer(c, 2, sample)


def draw_skyline(c, y, skyline):
    """Skyline und Wahlspruch unten, klein – nur, wenn Platz ist"""
    if not skyline:
        return
    reader, (iw, ih) = skyline
    sw = 80 * mm
    sh = sw * ih / iw
    if y - sh - 14 * mm > M + 6 * mm:
        c.drawImage(reader, (W - sw) / 2, M + 13 * mm, sw, sh, mask="auto")
        c.setFillColor(GREY)
        c.setFont(F["fraktur"], 15)
        c.drawCentredString(W / 2, M + 8 * mm, "Auf ewig ungeteilt.")


# ------------------------------------------------------------------ Seite 3: Was steckt dahinter?

def page_background(c, sample, crest, skyline):
    if sample:
        watermark(c)
    y = header(c, "Was steckt dahinter?", "Google Workspace, Sicherheit, Tablet und Hilfe", crest) - 7 * mm
    tw = W - 2 * M
    body = style(12, leading=16.5)
    y -= para(c, f"Die App ist eigentlich nur eine {b('Oberfläche für den Google Workspace der Verbindung')}. Alles, was sie zeigt, liegt dort – "
                 f"und ist mit deinem FrBr-Konto auch {b('ohne die App')} erreichbar:", body, M, y, tw)
    y -= 3.5 * mm
    services = [
        ("calendar", "Termine", "Google Kalender · calendar.google.com"),
        ("chat", "Chat", "Google Chat · chat.google.com"),
        ("folder", "Bundesbote, DS-Zeitung, Fotos,<br/>Liedermappe, Adressverzeichnis", "Google Drive · drive.google.com"),
        ("mail", "E-Mail", "Gmail · mail.google.com"),
    ]
    row = style(11, leading=14.5)
    col_w = (tw - 6 * mm) / 2
    for r in range(0, len(services), 2):  # zwei Spalten, damit unten Platz für die Skyline bleibt
        hs = []
        for i, (ic, what, where) in enumerate(services[r:r + 2]):
            x = M + i * (col_w + 6 * mm)
            c.setFillColor(GREEN_SOFT)
            c.circle(x + 5 * mm, y - 4.2 * mm, 4.4 * mm, stroke=0, fill=1)
            icon(c, ic, x + 5 * mm, y - 4.2 * mm, 4.8 * mm, GREEN_INK)
            hs.append(para(c, f"{b(what)}<br/>{where}", row, x + 13 * mm, y - 0.6 * mm, col_w - 13 * mm))
        y -= max(10 * mm, max(hs) + 2.5 * mm)
    y -= para(c, "Die App bündelt das nur übersichtlich an einem Ort – auf Handy, Tablet und Computer.", style(11, color=GREY, leading=14.5), M, y, tw)
    y -= 5 * mm

    # Sicherheit
    tips = [
        f"{b('Keine eigenen Server, keine eigene Datenbank:')} Die App ist nur eine Webseite. Die Daten liegen allein im Google Workspace der Verbindung – mit dessen Schutz (Verschlüsselung, Schutz vor verdächtigen Anmeldungen).",
        f"{b('Dein Passwort bekommt nur Google:')} Du meldest dich direkt bei Google an; die App erhält nur einen Zugangsschlüssel, der eine Stunde gilt.",
        f"{b('Wer was sieht, regelt allein Google:')} Es gelten die Freigaben des Workspace – die App zeigt nie mehr, als du ohnehin sehen darfst.",
        f"{b('Nur lesen:')} Gemeinsame Daten kann die App nicht verändern, nur deine eigenen Angaben, Zusagen und Beiträge.",
        f"{b('Nichts geht verloren:')} Fällt die App aus oder wird sie abgeschaltet, bleiben alle Daten erhalten und über Google erreichbar.",
        f"{b('Volle Kontrolle:')} Keine Werbung, keine Tracker. Den Zugriff der App kannst du in deinem Google-Konto jederzeit widerrufen; endet eine Mitgliedschaft, sperrt der Admin das Konto.",
    ]
    tip_st = style(10.5, leading=14)
    inner_w = tw - 20 * mm
    hs = [Paragraph(t, tip_st).wrap(inner_w, 1000)[1] for t in tips]
    box_h = 14 * mm + sum(hs) + len(tips) * 2.6 * mm
    c.setFillColor(GREY_BG)
    c.roundRect(M, y - box_h, tw, box_h, 6, stroke=0, fill=1)
    icon(c, "shield", M + 9 * mm, y - 7 * mm, 5.5 * mm, GREEN_INK)
    c.setFillColor(BLACK)
    c.setFont(F["bold"], 13)
    c.drawString(M + 15 * mm, y - 8.5 * mm, "Warum das sicher ist")
    yy = y - 13 * mm
    for t, h in zip(tips, hs):
        icon(c, "check", M + 9 * mm, yy - 2.8 * mm, 4.4 * mm, GREEN_INK)
        para(c, t, tip_st, M + 15 * mm, yy, inner_w)
        yy -= h + 2.6 * mm
    y -= box_h + 5 * mm

    # Tablet und Hilfe nebeneinander
    col_w = (tw - 5 * mm) / 2
    boxes = [
        ("tablet", "Auch auf dem Tablet", "Die App läuft genauso gut auf iPad und Android-Tablets – zum Schmökern im Bundesboten oder in der DS-Zeitung noch bequemer. Installieren wie auf dem Handy (Seite 1)."),
        ("users", "Hilfe beim Einrichten", "Die Aktiven unterstützen gern bei allem rund um die Einrichtung: Anmelden, neues Passwort, Installieren auf Handy oder Tablet. Einfach ansprechen."),
    ]
    st = style(10.5, leading=14)
    bh = max(Paragraph(t, st).wrap(col_w - 10 * mm, 1000)[1] for _, _, t in boxes) + 15 * mm
    for i, (ic, title, text) in enumerate(boxes):
        bx = M + i * (col_w + 5 * mm)
        c.setFillColor(GREEN_SOFT)
        c.roundRect(bx, y - bh, col_w, bh, 6, stroke=0, fill=1)
        icon(c, ic, bx + 8 * mm, y - 7 * mm, 5.5 * mm, GREEN_INK)
        c.setFillColor(BLACK)
        c.setFont(F["bold"], 12.5)
        c.drawString(bx + 14 * mm, y - 8.5 * mm, title)
        para(c, text, st, bx + 5 * mm, y - 12.5 * mm, col_w - 10 * mm)
    y -= bh
    check_fits(y, "Seite 3")
    draw_skyline(c, y, skyline)
    footer(c, 3, sample)


def shown(path):
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def main():
    ap = argparse.ArgumentParser(description="Kurzanleitung mit QR-Code erzeugen")
    ap.add_argument("url", nargs="?", default="", help="Adresse der App, z. B. https://name.github.io/fb-app/")
    ap.add_argument("--domain", default="", help="Workspace-Domain, z. B. frankonia-brunonia.de")
    ap.add_argument("--kontakt", default="", help="Ansprechpartner bei Fragen, z. B. 'Max Muster, 0151 1234567'")
    ap.add_argument("--ordner", default="", help="Zielordner (Standard: docs/)")
    args = ap.parse_args()
    global OUT_PDF, OUT_QR
    if args.ordner:
        OUT_PDF = Path(args.ordner).resolve() / OUT_PDF.name
        OUT_QR = Path(args.ordner).resolve() / OUT_QR.name

    url = args.url.strip() or PLACEHOLDER
    sample = "DEINNAME" in url or not url.startswith("http")
    if not sample and not url.startswith("https://"):
        print("Hinweis: Die App braucht im Echtbetrieb eine https-Adresse.", file=sys.stderr)
    kontakt = args.kontakt.strip() or "Im Chat fragen oder die Aktiven bzw. Admins ansprechen."

    register_fonts()
    crest = image(ROOT / "assets" / "wappen.webp") if (ROOT / "assets" / "wappen.webp").exists() else None
    skyline = image(ROOT / "assets" / "skyline.png") if (ROOT / "assets" / "skyline.png").exists() else None

    OUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT_PDF), pagesize=A4)
    c.setTitle("Mitglieder-App Frankonia-Brunonia – Kurzanleitung")
    c.setAuthor("Frankonia-Brunonia")
    c.setSubject("Installation und Überblick")
    page_install(c, url, sample, args.domain.strip().lstrip("@"), crest)
    c.showPage()
    page_overview(c, sample, kontakt, crest, skyline)
    c.showPage()
    page_background(c, sample, crest, skyline)
    c.showPage()
    c.save()
    print(f"PDF:  {shown(OUT_PDF)}" + ("  (MUSTER – ohne echte Adresse)" if sample else ""))

    if sample:
        print("QR-Code: nicht erzeugt – bitte mit der echten Adresse aufrufen:")
        print("  python tools/make_anleitung.py https://DEINNAME.github.io/fb-app/")
    else:
        px = save_qr_png(url, OUT_QR)
        print(f"QR:   {shown(OUT_QR)}  ({px}×{px} Pixel) → {url}")


if __name__ == "__main__":
    main()
