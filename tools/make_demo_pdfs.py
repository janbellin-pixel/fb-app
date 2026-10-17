"""
Erzeugt drei Beispielausgaben der Verbindungszeitung (fiktive Inhalte)
für den Demo-Modus und den Einrichtungs-Assistenten der App.

Aufruf (im Projektordner):
    python tools/make_demo_pdfs.py

Benötigt: reportlab, pyphen (Silbentrennung). Vorher tools/build_assets.py
ausführen (liefert Wappen-PNGs) und Schriften nach tools/out/fonts konvertieren.
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Frame, FrameBreak, KeepTogether,
                                NextPageTemplate, PageBreak, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle)

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "tools" / "out" / "fonts"
OUT = ROOT / "assets" / "demo"
CREST_FULL = ImageReader(str(ROOT / "tools" / "out" / "wappen-voll-pdf.png"))
CREST = ImageReader(str(ROOT / "tools" / "out" / "wappen-pdf.png"))
SKYLINE = ImageReader(str(ROOT / "assets" / "skyline.png"))

W, H = A4
M = 18 * mm
GREEN = colors.HexColor("#88bb2a")
GREEN_DARK = colors.HexColor("#4f7a12")
GREEN_LIGHT = colors.HexColor("#eef5e1")
BG = colors.HexColor("#f3f3f3")
GREY = colors.HexColor("#6b6b6b")
BLACK = colors.black
WHITE = colors.white


def register_fonts():
    for name, file in [("Raleway-Light", "Raleway-300.ttf"), ("Raleway", "Raleway-400.ttf"),
                       ("Raleway-SemiBold", "Raleway-600.ttf"), ("Raleway-Bold", "Raleway-700.ttf"),
                       ("Raleway-Italic", "Raleway-400i.ttf"), ("Fraktur", "Unifraktur.ttf")]:
        pdfmetrics.registerFont(TTFont(name, str(FONTS / file)))
    pdfmetrics.registerFontFamily("Raleway", normal="Raleway", bold="Raleway-Bold",
                                  italic="Raleway-Italic", boldItalic="Raleway-Bold")


def styles():
    hy = dict(hyphenationLang="de_DE", embeddedHyphenation=1, uriWasteReduce=0.3)
    s = {}
    s["body"] = ParagraphStyle("body", fontName="Raleway", fontSize=9.6, leading=13.8,
                               alignment=TA_JUSTIFY, spaceAfter=6, **hy)
    s["lead"] = ParagraphStyle("lead", fontName="Raleway-Light", fontSize=12.5, leading=17,
                               spaceAfter=10, textColor=colors.HexColor("#222222"), **hy)
    s["kicker"] = ParagraphStyle("kicker", fontName="Raleway-Bold", fontSize=8, leading=10,
                                 textColor=GREEN_DARK, spaceAfter=3)
    s["h1"] = ParagraphStyle("h1", fontName="Raleway-Light", fontSize=25, leading=29,
                             spaceAfter=8, textColor=BLACK)
    s["h2"] = ParagraphStyle("h2", fontName="Raleway-SemiBold", fontSize=11.5, leading=15,
                             spaceBefore=8, spaceAfter=4)
    s["quote"] = ParagraphStyle("quote", fontName="Raleway-Light", fontSize=15, leading=20,
                                textColor=WHITE, alignment=TA_LEFT)
    s["quote_src"] = ParagraphStyle("quote_src", fontName="Raleway", fontSize=8.5, leading=11,
                                    textColor=colors.HexColor("#bbbbbb"), spaceBefore=6)
    s["box_title"] = ParagraphStyle("box_title", fontName="Raleway-Bold", fontSize=9.5,
                                    leading=12, textColor=GREEN_DARK, spaceAfter=3)
    s["box"] = ParagraphStyle("box", fontName="Raleway", fontSize=9, leading=12.6, **hy)
    s["toc"] = ParagraphStyle("toc", fontName="Raleway-Light", fontSize=13, leading=20,
                              textColor=WHITE)
    s["sign"] = ParagraphStyle("sign", fontName="Raleway-Italic", fontSize=9.6, leading=13.8,
                               spaceBefore=4)
    s["small"] = ParagraphStyle("small", fontName="Raleway", fontSize=8, leading=11,
                                textColor=GREY)
    s["cell"] = ParagraphStyle("cell", fontName="Raleway", fontSize=8.8, leading=11.5)
    s["cellb"] = ParagraphStyle("cellb", fontName="Raleway-Bold", fontSize=8.8, leading=11.5,
                                textColor=WHITE)
    s["motto"] = ParagraphStyle("motto", fontName="Fraktur", fontSize=22, leading=26,
                                alignment=TA_CENTER)
    return s


S = None


def quote_box(text, source=None):
    content = [Paragraph(text, S["quote"])]
    if source:
        content.append(Paragraph(source, S["quote_src"]))
    t = Table([[content]], colWidths=["100%"])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BLACK),
                           ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                           ("TOPPADDING", (0, 0), (-1, -1), 12), ("BOTTOMPADDING", (0, 0), (-1, -1), 13)]))
    return KeepTogether([Spacer(1, 4), t, Spacer(1, 10)])


def info_box(title, paragraphs):
    content = [Paragraph(title, S["box_title"])] + [Paragraph(p, S["box"]) for p in paragraphs]
    t = Table([[content]], colWidths=["100%"])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), GREEN_LIGHT),
                           ("LINEBEFORE", (0, 0), (0, -1), 3, GREEN),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
    return KeepTogether([Spacer(1, 4), t, Spacer(1, 10)])


def article(kicker, title, lead=None):
    parts = [Paragraph(kicker.upper(), S["kicker"]), Paragraph(title, S["h1"])]
    if lead:
        parts.append(Paragraph(lead, S["lead"]))
    return KeepTogether(parts)


def article_page(kicker, title, lead=None):
    """Neue Seite: Artikelkopf über die volle Breite, Text darunter zweispaltig."""
    parts = [NextPageTemplate("article"), PageBreak(),
             Paragraph(kicker.upper(), S["kicker"]), Paragraph(title, S["h1"])]
    if lead:
        parts.append(Paragraph(lead, S["lead"]))
    return parts + [FrameBreak(), NextPageTemplate("two")]


def paras(*texts):
    return [Paragraph(t, S["body"]) for t in texts]


def h2(text):
    return CondPageBreak(30 * mm), Paragraph(text, S["h2"])


def termine_table(rows, width):
    data = [[Paragraph("Datum", S["cellb"]), Paragraph("Veranstaltung", S["cellb"]),
             Paragraph("Kleidung", S["cellb"])]]
    for d, t, k in rows:
        data.append([Paragraph(d, S["cell"]), Paragraph(t, S["cell"]), Paragraph(k, S["cell"])])
    t = Table(data, colWidths=[width * 0.24, width * 0.54, width * 0.22], repeatRows=1)
    style = [("BACKGROUND", (0, 0), (-1, 0), BLACK),
             ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
             ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.HexColor("#d5d5d5"))]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#f6f6f6")))
    t.setStyle(TableStyle(style))
    return t


# --------------------------------------------------------------------------- Seiten

def draw_cover(c, issue):
    c.saveState()
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(BLACK)
    c.setFont("Fraktur", 50)
    c.drawCentredString(W / 2, H - 40 * mm, "Verbindungszeitung")
    c.setFont("Raleway-Light", 12.5)
    c.drawCentredString(W / 2, H - 49 * mm, "Mitteilungen der Frankonia-Brunonia")
    iw, ih = CREST_FULL.getSize()
    w = 104 * mm
    h = w * ih / iw
    c.drawImage(CREST_FULL, (W - w) / 2, H - 58 * mm - h, w, h, mask="auto")
    # schwarzer Kasten wie auf der Website, rechts angeschnitten
    bw, bh = 96 * mm, 33 * mm
    x, y = W - bw, 64 * mm
    c.setFillColor(BLACK)
    c.rect(x, y, bw, bh, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Raleway-Light", 24)
    c.drawString(x + 9 * mm, y + bh - 14 * mm, issue["ausgabe"])
    c.setFont("Raleway-Light", 12.5)
    c.drawString(x + 9 * mm, y + 8.5 * mm, issue["semester"])
    # Themen links
    c.setFillColor(BLACK)
    c.setFont("Raleway-SemiBold", 8)
    c.drawString(M, y + bh - 6 * mm, "IN DIESER AUSGABE")
    c.setFont("Raleway", 9.5)
    for i, t in enumerate(issue["cover_topics"]):
        c.drawString(M, y + bh - 12.5 * mm - i * 5.2 * mm, t)
    # Skyline auf schwarzem Grund
    sw, sh = SKYLINE.getSize()
    h2_ = W * sh / sw
    c.drawImage(SKYLINE, 0, 10 * mm, W, h2_, mask="auto")
    c.setFillColor(BLACK)
    c.rect(0, 0, W, 10.6 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Raleway", 7.5)
    c.drawCentredString(W / 2, 4.2 * mm, "Beispielausgabe mit fiktiven Inhalten · erstellt für die Demo der Mitglieder-App")
    # Eckband
    c.translate(W, H)
    c.rotate(-45)
    c.setFillColor(GREEN)
    c.rect(-45 * mm, -21 * mm, 90 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Raleway-Bold", 8.5)
    c.drawCentredString(0, -18.2 * mm, "BEISPIELAUSGABE")
    c.restoreState()


def draw_content(c, doc, issue):
    c.saveState()
    c.setFillColor(BLACK)
    c.setFont("Fraktur", 14)
    c.drawString(M, H - 14 * mm, "Verbindungszeitung")
    c.setFont("Raleway", 8)
    c.setFillColor(GREY)
    c.drawRightString(W - M, H - 13.6 * mm, f'{issue["ausgabe"]} · {issue["semester"]}')
    c.setStrokeColor(BLACK)
    c.setLineWidth(0.6)
    c.line(M, H - 16.8 * mm, W - M, H - 16.8 * mm)
    # Fußzeile: kleine Skyline auf einer Grundlinie
    sw, sh = SKYLINE.getSize()
    w2 = 46 * mm
    h2_ = w2 * sh / sw
    c.drawImage(SKYLINE, M, 9.2 * mm, w2, h2_, mask="auto")
    c.setFillColor(BLACK)
    c.rect(M, 8 * mm, W - 2 * M, 1.4 * mm, fill=1, stroke=0)
    c.setFont("Raleway-SemiBold", 9)
    c.drawRightString(W - M, 11.5 * mm, str(doc.page))
    c.restoreState()


def draw_back(c, doc, issue):
    c.saveState()
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    sw, sh = SKYLINE.getSize()
    h2_ = W * sh / sw
    c.drawImage(SKYLINE, 0, 10 * mm, W, h2_, mask="auto")
    c.setFillColor(BLACK)
    c.rect(0, 0, W, 10.6 * mm, fill=1, stroke=0)
    iw, ih = CREST.getSize()
    w = 34 * mm
    c.drawImage(CREST, (W - w) / 2, 86 * mm, w, w * ih / iw, mask="auto")
    c.setFont("Fraktur", 20)
    c.drawCentredString(W / 2, 77 * mm, "Auf ewig ungeteilt.")
    c.setFillColor(WHITE)
    c.setFont("Raleway-SemiBold", 9)
    c.drawRightString(W - M, 4 * mm, str(doc.page))
    c.restoreState()


def build_issue(issue):
    doc = BaseDocTemplate(str(OUT / issue["file"]), pagesize=A4,
                          title=f'Verbindungszeitung {issue["ausgabe"]} – {issue["semester"]}',
                          author="Frankonia-Brunonia (Beispiel)",
                          subject="Beispielausgabe der Verbindungszeitung (fiktive Inhalte)",
                          leftMargin=M, rightMargin=M, topMargin=22 * mm, bottomMargin=24 * mm)
    gap = 7 * mm
    colw = (W - 2 * M - gap) / 2
    top = H - 22 * mm
    bottom = 22 * mm
    frames2 = [Frame(M, bottom, colw, top - bottom, id="c1", leftPadding=0, rightPadding=0,
                     topPadding=0, bottomPadding=0),
               Frame(M + colw + gap, bottom, colw, top - bottom, id="c2", leftPadding=0,
                     rightPadding=0, topPadding=0, bottomPadding=0)]
    frame1 = Frame(M, bottom, W - 2 * M, top - bottom, id="one", leftPadding=0, rightPadding=0,
                   topPadding=0, bottomPadding=0)
    head_h = 44 * mm
    art_frames = [Frame(M, top - head_h, W - 2 * M, head_h, id="head", leftPadding=0,
                        rightPadding=0, topPadding=0, bottomPadding=0),
                  Frame(M, bottom, colw, top - head_h - bottom, id="a1", leftPadding=0,
                        rightPadding=0, topPadding=0, bottomPadding=0),
                  Frame(M + colw + gap, bottom, colw, top - head_h - bottom, id="a2",
                        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)]
    back_frame = Frame(M + 20 * mm, 120 * mm, W - 2 * M - 40 * mm, H - 140 * mm, id="back",
                       leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[frame1], onPage=lambda c, d: draw_cover(c, issue)),
        PageTemplate(id="one", frames=[frame1], onPage=lambda c, d: draw_content(c, d, issue)),
        PageTemplate(id="two", frames=frames2, onPage=lambda c, d: draw_content(c, d, issue)),
        PageTemplate(id="article", frames=art_frames, onPage=lambda c, d: draw_content(c, d, issue)),
        PageTemplate(id="back", frames=[back_frame], onPage=lambda c, d: draw_back(c, d, issue)),
    ])
    story = [Spacer(1, 1), NextPageTemplate("one"), PageBreak()]
    story += issue["story"](colw, W - 2 * M)
    story += [NextPageTemplate("back"), PageBreak()]
    story += issue["impressum"]()
    doc.build(story)
    print("PDF erzeugt:", issue["file"])


def toc_box(entries):
    t = Table([[[Paragraph("Inhalt", ParagraphStyle("t", fontName="Raleway-Bold", fontSize=8,
                                                    textColor=GREEN, leading=12, spaceAfter=4))]
                 + [Paragraph(e, S["toc"]) for e in entries]]], colWidths=["100%"])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BLACK),
                           ("LEFTPADDING", (0, 0), (-1, -1), 16), ("RIGHTPADDING", (0, 0), (-1, -1), 16),
                           ("TOPPADDING", (0, 0), (-1, -1), 14), ("BOTTOMPADDING", (0, 0), (-1, -1), 16)]))
    return [t, Spacer(1, 16)]


def impressum(extra=None):
    def f():
        items = [Paragraph("Impressum", ParagraphStyle("imp", fontName="Raleway-Light", fontSize=22,
                                                       leading=26, alignment=TA_CENTER, spaceAfter=10))]
        lines = [
            "<b>Herausgeber:</b> Frankonia-Brunonia – Aktivitas und Altherrenschaft",
            "<b>Redaktion:</b> Felix Fiktiv v/o Merlin (xxx), Dr. Max Mustermann v/o Faust",
            "<b>Beiträge</b> für die nächste Ausgabe bitte bis zum Ende der Vorlesungszeit an die "
            "Redaktion – am einfachsten über das Forum der Mitglieder-App.",
            "Alle Inhalte dieser Beispielausgabe sind frei erfunden. Ähnlichkeiten mit realen "
            "Personen oder Ereignissen sind rein zufällig.",
        ] + (extra or [])
        for line in lines:
            items.append(Paragraph(line, ParagraphStyle("impl", parent=S["body"], alignment=TA_CENTER,
                                                         fontSize=9.2, leading=13.5)))
        return items
    return f


# --------------------------------------------------------------------------- Inhalte

def story_2026_2(colw, fullw):
    s = []
    s += toc_box(["Grußwort des Sprechers", "Stiftungsfest 2026: Drei Tage, ein Bund",
                  "Aus der Aktivitas: Semesterbericht", "Haus &amp; Zimmer: Neue Küche, freie Zimmer",
                  "Altherrenschaft: Ein Netzwerk, das trägt", "Neu: Die Mitglieder-App",
                  "Personalia", "Termine im Wintersemester 2026/27"])
    s.append(article("Grußwort", "Liebe Bundesbrüder, liebe Freunde unseres Bundes,"))
    s += paras(
        "ein ereignisreiches Sommersemester liegt hinter uns. Mit sechs neuen Füxen, einem rundum "
        "gelungenen Stiftungsfest und einer frisch renovierten Küche im Haus können wir mit Stolz auf "
        "die vergangenen Monate blicken. Mein herzlicher Dank gilt allen, die mit angepackt haben: den "
        "Chargen, den Hauswarten, den vielen Alten Herren, die uns mit Rat, Tat und Spenden unterstützt "
        "haben, und nicht zuletzt der Aktivitas, die das Semesterprogramm mit Leben gefüllt hat.",
        "Eine Neuerung möchte ich besonders hervorheben: Ab diesem Semester gibt es unsere "
        "<b>Mitglieder-App</b>. Termine mit Zu- und Absage, das Adressverzeichnis, der Chat und das "
        "Archiv dieser Zeitung sind damit für jeden Bundesbruder mit wenigen Fingertipps erreichbar. "
        "Ich bitte euch herzlich: Installiert die App und pflegt euer Profil. Je mehr mitmachen, desto "
        "lebendiger wird unser Bund auch zwischen den Kneipen.",
        "Für das kommende Wintersemester wünsche ich uns viele schöne Stunden auf dem Haus, spannende "
        "Vorträge und eine Weihnachtskneipe, von der wir noch lange erzählen werden.")
    s.append(Paragraph("Mit bundesbrüderlichen Grüßen<br/>Jonas Beispiel v/o Sokrates (x)", S["sign"]))

    s += article_page("Stiftungsfest 2026", "Drei Tage, ein Bund",
                     "Vom Begrüßungsabend bis zum Frühschoppen: Rund 140 Bundesbrüder, Damen und Gäste "
                     "feierten Ende Juni gemeinsam unser Stiftungsfest.")
    s += paras(
        "Schon am Freitagabend war das Haus bis unters Dach gefüllt. Beim Begrüßungsabend im Garten "
        "trafen sich Jahrgänge, die sich teils seit Jahrzehnten nicht gesehen hatten. Am Grill standen "
        "die Füxe – und bewiesen, dass sie neben dem Comment auch die perfekte Bratwurst beherrschen. "
        "Bis tief in die Nacht wurde erzählt, gelacht und das eine oder andere Lied angestimmt.",
        "Höhepunkt des Wochenendes war der Festkommers am Samstag. In seiner Festrede sprach "
        "AH Dr. Karl Vorlage v/o Leibniz über „Tradition als Auftrag“ und darüber, was einen "
        "Lebensbund im 21. Jahrhundert ausmacht: Verlässlichkeit, Offenheit für Neues und die "
        "Bereitschaft, Verantwortung füreinander zu übernehmen.")
    s.append(quote_box("„Tradition heißt nicht, die Asche aufzubewahren, sondern das Feuer "
                       "weiterzugeben.“", "Aus der Festrede beim Kommers"))
    s += paras(
        "Im Anschluss wurden sechs Bundesbrüder für ihre langjährige Treue geehrt. Besonders bewegend "
        "war die Ehrung von AH Hans Exempel v/o Goethe, der seit fünfzig Jahren das Band trägt und es "
        "sich nicht nehmen ließ, den jüngsten Füxen persönlich zu gratulieren.",
        "Am Abend verwandelte sich der große Saal in einen Ballsaal. Die Live-Band sorgte bis weit nach "
        "Mitternacht für eine volle Tanzfläche. Der Sonntag gehörte traditionell dem Frühschoppen, zu "
        "dem auch viele Familien mit Kindern kamen – eine schöne Gelegenheit, unser Haus den "
        "Jüngsten zu zeigen.")
    s.append(info_box("Danke an den Festausschuss!", [
        "Ein großes Dankeschön an Paul Platzhalter v/o Lessing und sein Team, die das Fest über Monate "
        "vorbereitet haben – von der Saalplanung bis zur Nachtschicht beim Aufräumen."]))
    s.append(info_box("Das Fest in Zahlen", [
        "140 Gäste · 3 Festtage · 6 Ehrungen · 1 Live-Band · unzählige Lieder"]))

    s += article_page("Aus der Aktivitas", "Ein Semester voller Leben",
                     "Sechs Rezeptionen, volle Kneipen und ein zweiter Platz beim Fußballturnier: "
                     "Die Aktivitas blickt auf ein starkes Sommersemester zurück.")
    s += paras(
        "Mit der Semesterantrittskneipe im April ging es los. Schon in den ersten Wochen konnten wir "
        "sechs Interessenten für unseren Bund begeistern, die inzwischen als Füxe fester Bestandteil "
        "der Aktivitas sind. Unser Fuxmajor Lukas Muster v/o Kant führte sie in zahlreichen "
        "Fuxenstunden in Geschichte, Comment und Liedgut unseres Bundes ein.")
    s += h2("Vorträge und Bildung")
    s += paras(
        "Die Vortragsreihe war in diesem Semester besonders gut besucht. AH Dr. Max Mustermann v/o "
        "Faust sprach über den Berufseinstieg nach dem Studium, und ein Gastreferent aus der "
        "Energiewirtschaft stellte die Frage „Wasserstoff – Energieträger der Zukunft?“ zur "
        "Diskussion. Beide Abende endeten mit lebhaften Gesprächen bis spät in die Nacht.")
    s += h2("Sport und Ausflüge")
    s += paras(
        "Beim Fußballturnier der Verbindungen unserer Stadt erreichten wir einen hervorragenden "
        "zweiten Platz unter acht Mannschaften. Die Kanutour im Juni führte uns bei bestem Wetter "
        "über zwanzig Flusskilometer – mit nur einer unfreiwilligen Abkühlung.")
    s.append(info_box("Neue Füxe im Sommersemester 2026", [
        "Tim Testmann v/o Schiller · Niklas Neu v/o Kepler · Benedikt Demo v/o Bach · "
        "Leon Lorem v/o Dürer · Jakob Ipsum v/o Euler · Simon Skizze v/o Brahms"]))
    s += paras(
        "Unser Dank gilt allen Bundesbrüdern, die das Programm mit Ideen und Engagement bereichert "
        "haben. Für das Wintersemester sind bereits mehrere Vortragsabende und eine Exkursion in "
        "Planung – die Termine findet ihr wie immer in der App.")

    s += article_page("Haus &amp; Zimmer", "Neue Küche, freie Zimmer",
                     "In den Semesterferien wurde die Hausküche komplett erneuert. Zum Wintersemester "
                     "sind außerdem noch zwei Zimmer frei.")
    s += paras(
        "Nach über zwanzig Jahren hatte unsere alte Küche ausgedient. Dank des Beschlusses der "
        "Generalversammlung und vieler Spenden aus der Altherrenschaft konnte sie in den "
        "Semesterferien vollständig modernisiert werden: neue Arbeitsflächen, ein Induktionsherd, "
        "zwei Geschirrspüler und deutlich mehr Stauraum. Die Bewohner des Hauses haben beim Abbau der "
        "alten Küche und beim Streichen selbst mit angepackt.",
        "Hauswart Hans Exempel v/o Goethe zieht eine positive Bilanz: Die Arbeiten wurden pünktlich "
        "fertig und blieben im Budget. Ein Einweihungsessen für alle Spender ist für den Herbst "
        "geplant.")
    s.append(info_box("Zimmer frei zum Wintersemester", [
        "Zwei möblierte Zimmer (14 und 18 m²) mit WLAN, Gemeinschaftsküche und Garten. "
        "Warmmiete ab 290 € im Monat. Interesse? Einfach den Hauswart über den Chat der "
        "Mitglieder-App anschreiben."]))
    s += h2("Arbeitseinsätze")
    s += paras(
        "Damit unser Haus in gutem Zustand bleibt, finden auch im Wintersemester wieder zwei "
        "Arbeitseinsätze statt. Wer helfen möchte, sagt einfach über die App zu – für Verpflegung "
        "ist gesorgt.")

    s += article_page("Altherrenschaft", "Ein Netzwerk, das trägt",
                     "Stammtische in vier Städten und ein neues Mentoring-Programm: Die Altherrenschaft "
                     "rückt näher an die Aktivitas heran.")
    s += paras(
        "Unsere Alten Herren treffen sich regelmäßig zu Stammtischen in Hamburg, Frankfurt, München "
        "und Berlin. Die Termine stehen im Kalender der App – Gäste aus der Aktivitas sind jederzeit "
        "willkommen und werden ausdrücklich ermutigt, vorbeizuschauen.",
        "Neu ist das Mentoring-Programm „Bundesbrüder für Bundesbrüder“. Alte Herren aus Industrie, "
        "Verwaltung, Wissenschaft und freien Berufen stehen den Aktiven bei Fragen zu Praktika, "
        "Abschlussarbeiten und Berufseinstieg zur Seite. Bereits zwölf Alte Herren haben sich als "
        "Mentoren gemeldet.")
    s.append(quote_box("„Was ich im Bund gelernt habe, hat mir im Beruf oft mehr geholfen als "
                       "manches Seminar.“", "Ein Alter Herr beim Stammtisch"))
    s += paras(
        "Der Vorstand der Altherrenschaft bedankt sich für die zahlreichen Spenden zur "
        "Küchenrenovierung. Ein Hinweis in eigener Sache: Bitte prüft, ob eure Adressdaten aktuell "
        "sind. In der neuen App seht ihr auf einen Blick, welche Angaben im Verzeichnis hinterlegt "
        "sind.")

    s += article_page("In eigener Sache", "Neu: Die Mitglieder-App",
                     "Termine, Zusagen, Chat, Adressen und diese Zeitung – ab sofort alles an einem Ort.")
    s += paras(
        "Mit der neuen Mitglieder-App haben wir einen lang gehegten Wunsch umgesetzt. Die App läuft "
        "auf iPhone, Android-Smartphones und am Computer. Angemeldet wird man einmalig mit dem "
        "Google-Konto der Verbindung – ein eigenes Passwort ist nicht nötig.")
    s += h2("Was die App kann")
    s += paras(
        "• <b>Termine:</b> alle Veranstaltungen mit Zu- und Absage. Man sieht, wer sonst noch kommt.<br/>"
        "• <b>Kalender:</b> Abo des Verbindungskalenders im eigenen Google-Kalender.<br/>"
        "• <b>Mitglieder:</b> Profile mit Foto, Kneipname, Status und Ämtern.<br/>"
        "• <b>Chat:</b> die Räume aus Google Chat direkt in der App.<br/>"
        "• <b>Adressen:</b> das Adressverzeichnis zum Nachschlagen.<br/>"
        "• <b>Zeitung:</b> alle Ausgaben zum Durchblättern – mit echtem Umblätter-Effekt.<br/>"
        "• <b>News und Forum</b> für Neuigkeiten und Diskussionen.")
    s += h2("So geht's")
    s += paras(
        "Den Link zur App auf dem Handy öffnen, mit dem Verbindungs-Google-Konto anmelden und die App "
        "anschließend „Zum Home-Bildschirm“ hinzufügen. Eine bebilderte Anleitung findet ihr direkt in "
        "der App unter „Mehr → App installieren“.")
    s.append(info_box("Datenschutz", [
        "Alle Daten bleiben im Google Workspace unserer Verbindung. Die App selbst speichert nichts "
        "auf fremden Servern."]))

    s += article_page("Personalia", "Wir gratulieren")
    s += h2("Rezeptionen")
    s += paras("Tim Testmann v/o Schiller, Niklas Neu v/o Kepler, Benedikt Demo v/o Bach, "
               "Leon Lorem v/o Dürer, Jakob Ipsum v/o Euler, Simon Skizze v/o Brahms")
    s += h2("Burschungen")
    s += paras("Erik Entwurf v/o Humboldt, Moritz Probe v/o Gauß, David Dummy v/o Mozart")
    s += h2("Examina")
    s += paras("Felix Fiktiv v/o Merlin – M.Sc. Maschinenbau<br/>"
               "Erik Entwurf v/o Humboldt – Erstes Juristisches Staatsexamen<br/>"
               "Moritz Probe v/o Gauß – B.Sc. Informatik")
    s += h2("Runde Geburtstage")
    s += paras("AH Hans Exempel v/o Goethe – 75 Jahre<br/>AH Dr. Karl Vorlage v/o Leibniz – 70 Jahre<br/>"
               "AH Dr. Max Mustermann v/o Faust – 60 Jahre")
    s += h2("Familiennachrichten")
    s += paras("AH Daniel Dokument v/o Ranke und seine Frau Anna freuen sich über die Geburt ihrer "
               "Tochter Marie. Bbr. Paul Platzhalter v/o Lessing hat im Mai geheiratet. Herzlichen "
               "Glückwunsch!")
    s.append(info_box("Nachrichten für die Personalia", [
        "Ihr habt etwas zu berichten? Schreibt der Redaktion einfach über das Forum der App."]))

    s += [NextPageTemplate("one"), PageBreak()]
    s.append(article("Vorschau", "Termine im Wintersemester 2026/27"))
    s.append(termine_table([
        ("Fr, 23.10.2026, 20 Uhr", "Semesterantrittskneipe", "Vollcouleur"),
        ("Mi, 28.10.2026, 19 Uhr", "Fuxenstunde: Geschichte des Bundes", "Band"),
        ("Do, 05.11.2026, 19:30 Uhr", "Vortragsabend: Künstliche Intelligenz im Beruf", "Zivil"),
        ("Sa, 14.11.2026, 10 Uhr", "Arbeitseinsatz am Haus", "Arbeitskleidung"),
        ("Sa, 21.11.2026, 15 Uhr", "Convent", "Band"),
        ("Fr, 27.11.2026, 20 Uhr", "Krambambuli-Abend", "Band"),
        ("Sa, 12.12.2026, 19 Uhr", "Weihnachtskneipe mit Damen", "Vollcouleur"),
        ("Sa, 09.01.2027, 11 Uhr", "Neujahrsempfang", "Festlich"),
        ("Fr, 29.01.2027, 20 Uhr", "Semesterabschlusskneipe", "Vollcouleur"),
        ("Sa, 06.02.2027, 14 Uhr", "Generalversammlung der Altherrenschaft", "Zivil"),
    ], fullw))
    s.append(Spacer(1, 10))
    s.append(Paragraph("Alle Termine mit Zu- und Absage findet ihr in der Mitglieder-App. Änderungen "
                       "vorbehalten.", S["small"]))
    return s


def story_2026_1(colw, fullw):
    s = []
    s += toc_box(["Grußwort", "Semesterbericht Wintersemester 2025/26",
                  "Haus: Heizung erneuert, Küche beschlossen", "Generalversammlung der Altherrenschaft",
                  "Personalia", "Termine im Sommersemester 2026"])
    s.append(article("Grußwort", "Liebe Bundesbrüder,"))
    s += paras(
        "das Wintersemester ist traditionell die Zeit der großen Kneipen – und davon hatten wir "
        "einige. Die Weihnachtskneipe war mit über achtzig Teilnehmern so gut besucht wie seit Jahren "
        "nicht mehr. Dafür und für die vielen helfenden Hände bei Aufbau, Küche und Abbau sage ich "
        "herzlichen Dank.",
        "Hinter den Kulissen hat sich ebenfalls viel getan: Die Heizung im Haus wurde erneuert, und "
        "die Generalversammlung hat die Renovierung der Küche beschlossen. Damit ist unser Haus für "
        "die kommenden Jahre gut aufgestellt.",
        "Ich übergebe das Amt des Sprechers nun an Jonas Beispiel v/o Sokrates und wünsche ihm und "
        "allen neuen Chargen ein glückliches Händchen.")
    s.append(Paragraph("Mit bundesbrüderlichen Grüßen<br/>Lukas Muster v/o Kant (x)", S["sign"]))

    s += article_page("Aus der Aktivitas", "Kneipen, Krambambuli und Künstliche Intelligenz",
                     "Ein Rückblick auf ein abwechslungsreiches Wintersemester 2025/26.")
    s += paras(
        "Den Auftakt bildete die Semesterantrittskneipe im Oktober, bei der wir drei Gäste begrüßen "
        "durften, die inzwischen rezipiert wurden. Im November folgte der beliebte Krambambuli-Abend, "
        "bei dem das traditionelle Heißgetränk nach überliefertem Rezept angesetzt wurde.",
        "Der Vortragsabend „KI im Studium – Fluch oder Segen?“ lockte viele Gäste ins Haus. Die "
        "Diskussion zwischen Aktiven und Alten Herren zeigte, wie unterschiedlich die Generationen "
        "auf neue Technik blicken – und wie viel sie voneinander lernen können.")
    s.append(quote_box("„Die beste Kneipe ist die, von der man noch Jahre später erzählt.“",
                       "Ein Bundesbruder nach der Weihnachtskneipe"))
    s += h2("Weihnachtskneipe")
    s += paras(
        "Höhepunkt des Semesters war die Weihnachtskneipe mit Damen. Festlich geschmückt, mit "
        "Kerzenschein und vielen Liedern wurde der Saal zum Mittelpunkt eines unvergesslichen "
        "Abends. Die Füxe hatten eine kleine Bierzeitung vorbereitet, die für viele Lacher sorgte.")
    s += h2("Neujahrsempfang")
    s += paras(
        "Zum Neujahrsempfang im Januar kamen Bundesbrüder aller Generationen. Bei Sekt und Brezeln "
        "wurde auf das neue Jahr angestoßen und auf das vergangene zurückgeblickt.")

    s += article_page("Haus", "Heizung erneuert, Küche beschlossen")
    s += paras(
        "Pünktlich vor dem Winter wurde die alte Ölheizung durch eine moderne Wärmepumpe mit "
        "Gasbrennwert-Unterstützung ersetzt. Die Heizkosten sinken dadurch spürbar, und das Haus "
        "leistet seinen Beitrag zum Klimaschutz.",
        "Die Generalversammlung hat außerdem einstimmig die Renovierung der Küche beschlossen. Die "
        "Arbeiten sollen in den Semesterferien im Sommer stattfinden. Spenden sind herzlich "
        "willkommen.")
    s.append(info_box("Spendenaufruf Küche", [
        "Jeder Beitrag hilft! Spenden bitte mit dem Stichwort „Küche“ an den Hausbauverein. Eine "
        "Spendenquittung wird automatisch ausgestellt."]))
    s.append(article("Altherrenschaft", "Generalversammlung 2026"))
    s += paras(
        "Die Generalversammlung im Februar war mit über sechzig Alten Herren sehr gut besucht. Neben "
        "dem Beschluss zur Küche wurde der Vorstand entlastet und für zwei weitere Jahre im Amt "
        "bestätigt. Außerdem wurde beschlossen, eine Mitglieder-App einzuführen.")

    s += article_page("Personalia", "Wir gratulieren")
    s += h2("Rezeptionen")
    s += paras("Erik Entwurf v/o Humboldt, Moritz Probe v/o Gauß, David Dummy v/o Mozart")
    s += h2("Examina")
    s += paras("Lukas Muster v/o Kant – M.A. Geschichte<br/>Jonas Beispiel v/o Sokrates – B.Sc. Physik")
    s += h2("Runde Geburtstage")
    s += paras("AH Daniel Dokument v/o Ranke – 50 Jahre<br/>AH Dr. Max Mustermann v/o Faust – 59 Jahre "
               "(fast rund, aber wir gratulieren trotzdem)")

    s += [NextPageTemplate("one"), PageBreak()]
    s.append(article("Vorschau", "Termine im Sommersemester 2026"))
    s.append(termine_table([
        ("Fr, 17.04.2026, 20 Uhr", "Semesterantrittskneipe", "Vollcouleur"),
        ("Do, 30.04.2026, 19 Uhr", "Maibowle im Garten", "Band"),
        ("Do, 14.05.2026, 19:30 Uhr", "Vortrag: Berufseinstieg nach dem Studium", "Zivil"),
        ("Sa, 30.05.2026, 9 Uhr", "Fußballturnier der Verbindungen", "Sport"),
        ("Fr–So, 26.–28.06.2026", "Stiftungsfest", "Vollcouleur"),
        ("Sa, 11.07.2026, 10 Uhr", "Kanutour", "Freizeit"),
        ("Fr, 24.07.2026, 20 Uhr", "Semesterabschlusskneipe", "Vollcouleur"),
    ], fullw))
    return s


def story_2025_2(colw, fullw):
    s = []
    s += toc_box(["Grußwort", "Stiftungsfest 2025", "Haus: Garten und Grillplatz",
                  "Termine im Wintersemester 2025/26"])
    s.append(article("Grußwort", "Liebe Bundesbrüder,"))
    s += paras(
        "ein sonniges Sommersemester geht zu Ende. Wir haben gefeiert, diskutiert, gesungen und "
        "gemeinsam gearbeitet – und dabei gezeigt, dass unser Bund lebendig ist wie eh und je.",
        "Mein Dank gilt allen, die das Semester möglich gemacht haben. Ich freue mich auf das "
        "Wintersemester und auf viele Begegnungen auf dem Haus.")
    s.append(Paragraph("Mit bundesbrüderlichen Grüßen<br/>Lukas Muster v/o Kant (x)", S["sign"]))

    s += article_page("Stiftungsfest 2025", "Ein Fest bei Sonnenschein",
                     "Bei strahlendem Wetter feierten wir im Juni unser Stiftungsfest im Garten des "
                     "Hauses.")
    s += paras(
        "Zum ersten Mal fand der Begrüßungsabend komplett unter freiem Himmel statt. Lichterketten, "
        "Bierbänke und ein Grill, der den ganzen Abend nicht kalt wurde, sorgten für eine "
        "unvergleichliche Atmosphäre.",
        "Beim Festkommers am Samstag wurden drei Bundesbrüder für ihre langjährige Treue geehrt. Die "
        "Festrede hielt AH Daniel Dokument v/o Ranke zum Thema „Freundschaft über Generationen“.")
    s.append(quote_box("„Ein Bund lebt von denen, die kommen – und von denen, die bleiben.“",
                       "Aus der Festrede 2025"))
    s += paras(
        "Mit dem Frühschoppen am Sonntag ging ein Fest zu Ende, das uns noch lange in Erinnerung "
        "bleiben wird. Danke an alle Helfer!")

    s += article_page("Haus", "Garten und Grillplatz")
    s += paras(
        "Bei zwei Arbeitseinsätzen haben Aktive und Alte Herren den Garten neu gestaltet. Ein "
        "gemauerter Grillplatz, neue Beete und eine Sitzecke unter der alten Linde laden jetzt zum "
        "Verweilen ein.",
        "Ein besonderer Dank geht an AH Hans Exempel v/o Goethe, der nicht nur die Pläne gezeichnet, "
        "sondern auch selbst die Kelle geschwungen hat.")
    s.append(info_box("Gartenpatenschaft gesucht", [
        "Wer hat Lust, sich um die Beete zu kümmern? Meldet euch beim Hauswart."]))

    s += [NextPageTemplate("one"), PageBreak()]
    s.append(article("Vorschau", "Termine im Wintersemester 2025/26"))
    s.append(termine_table([
        ("Fr, 24.10.2025, 20 Uhr", "Semesterantrittskneipe", "Vollcouleur"),
        ("Fr, 21.11.2025, 20 Uhr", "Krambambuli-Abend", "Band"),
        ("Do, 04.12.2025, 19:30 Uhr", "Vortrag: KI im Studium – Fluch oder Segen?", "Zivil"),
        ("Sa, 13.12.2025, 19 Uhr", "Weihnachtskneipe mit Damen", "Vollcouleur"),
        ("Sa, 10.01.2026, 11 Uhr", "Neujahrsempfang", "Festlich"),
        ("Sa, 07.02.2026, 14 Uhr", "Generalversammlung der Altherrenschaft", "Zivil"),
    ], fullw))
    return s


ISSUES = [
    dict(file="2026-2 Verbindungszeitung SoSe 2026.pdf", ausgabe="Ausgabe 2/2026",
         semester="Sommersemester 2026",
         cover_topics=["Stiftungsfest 2026", "Neue Küche im Haus", "Sechs neue Füxe", "Die Mitglieder-App"],
         story=story_2026_2, impressum=impressum()),
    dict(file="2026-1 Verbindungszeitung WiSe 2025-26.pdf", ausgabe="Ausgabe 1/2026",
         semester="Wintersemester 2025/26",
         cover_topics=["Weihnachtskneipe", "Neue Heizung", "Generalversammlung"],
         story=story_2026_1, impressum=impressum()),
    dict(file="2025-2 Verbindungszeitung SoSe 2025.pdf", ausgabe="Ausgabe 2/2025",
         semester="Sommersemester 2025",
         cover_topics=["Stiftungsfest 2025", "Garten und Grillplatz"],
         story=story_2025_2, impressum=impressum()),
]


def main():
    global S
    OUT.mkdir(parents=True, exist_ok=True)
    register_fonts()
    S = styles()
    for issue in ISSUES:
        build_issue(issue)


if __name__ == "__main__":
    main()
