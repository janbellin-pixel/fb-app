"""
Erzeugt zwei Beispielausgaben der DS-Zeitung (Zeitung der Deutschen Sängerschaft) mit frei
erfundenen Inhalten für den Demo-Modus der App (E38).

Aufruf (im Projektordner):
    python tools/make_demo_ds.py

Benötigt: reportlab, pyphen (Silbentrennung) und die Schriften in tools/out/fonts
(siehe tools/make_demo_pdfs.py).
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Frame, KeepTogether, NextPageTemplate,
                                PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle)

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "tools" / "out" / "fonts"
OUT = ROOT / "assets" / "demo" / "ds"

W, H = A4
M = 18 * mm
NAVY = colors.HexColor("#1d3557")
NAVY_LIGHT = colors.HexColor("#eaf0f6")
GOLD = colors.HexColor("#c9a227")
GREY = colors.HexColor("#6b6b6b")
WHITE = colors.white


def register_fonts():
    for name, file in [("Raleway-Light", "Raleway-300.ttf"), ("Raleway", "Raleway-400.ttf"),
                       ("Raleway-SemiBold", "Raleway-600.ttf"), ("Raleway-Bold", "Raleway-700.ttf"),
                       ("Raleway-Italic", "Raleway-400i.ttf")]:
        pdfmetrics.registerFont(TTFont(name, str(FONTS / file)))
    pdfmetrics.registerFontFamily("Raleway", normal="Raleway", bold="Raleway-Bold",
                                  italic="Raleway-Italic", boldItalic="Raleway-Bold")


def styles():
    hy = dict(hyphenationLang="de_DE", embeddedHyphenation=1, uriWasteReduce=0.3)
    return {
        "body": ParagraphStyle("body", fontName="Raleway", fontSize=9.6, leading=13.8,
                               alignment=TA_JUSTIFY, spaceAfter=6, **hy),
        "lead": ParagraphStyle("lead", fontName="Raleway-Light", fontSize=12, leading=16.5,
                               spaceAfter=9, **hy),
        "kicker": ParagraphStyle("kicker", fontName="Raleway-Bold", fontSize=8, leading=10,
                                 textColor=GOLD, spaceAfter=3),
        "h1": ParagraphStyle("h1", fontName="Raleway-Bold", fontSize=19, leading=23,
                             textColor=NAVY, spaceAfter=7),
        "h2": ParagraphStyle("h2", fontName="Raleway-SemiBold", fontSize=11.5, leading=15,
                             textColor=NAVY, spaceBefore=8, spaceAfter=4),
        "box_title": ParagraphStyle("box_title", fontName="Raleway-Bold", fontSize=9.5, leading=12,
                                    textColor=NAVY, spaceAfter=3),
        "box": ParagraphStyle("box", fontName="Raleway", fontSize=9, leading=12.6, **hy),
        "cell": ParagraphStyle("cell", fontName="Raleway", fontSize=8.8, leading=11.5),
        "cellb": ParagraphStyle("cellb", fontName="Raleway-Bold", fontSize=8.8, leading=11.5,
                                textColor=WHITE),
        "imp": ParagraphStyle("imp", fontName="Raleway", fontSize=9.2, leading=13.5,
                              alignment=TA_CENTER, spaceAfter=6),
    }


S = None


def article(kicker, title, lead=None):
    parts = [Paragraph(kicker.upper(), S["kicker"]), Paragraph(title, S["h1"])]
    if lead:
        parts.append(Paragraph(lead, S["lead"]))
    return [CondPageBreak(60 * mm), KeepTogether(parts)]


def paras(*texts):
    return [Paragraph(t, S["body"]) for t in texts]


def info_box(title, paragraphs):
    content = [Paragraph(title, S["box_title"])] + [Paragraph(p, S["box"]) for p in paragraphs]
    t = Table([[content]], colWidths=["100%"])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY_LIGHT),
                           ("LINEBEFORE", (0, 0), (0, -1), 3, GOLD),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
    return KeepTogether([Spacer(1, 4), t, Spacer(1, 10)])


def termine(rows, width):
    data = [[Paragraph("Datum", S["cellb"]), Paragraph("Veranstaltung", S["cellb"])]]
    data += [[Paragraph(d, S["cell"]), Paragraph(t, S["cell"])] for d, t in rows]
    t = Table(data, colWidths=[width * 0.3, width * 0.7], repeatRows=1)
    style = [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
             ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.HexColor("#d5d9e0"))]
    t.setStyle(TableStyle(style))
    return [CondPageBreak(50 * mm), Paragraph("Termine", S["h2"]), t]


# --------------------------------------------------------------------------- Seiten

def draw_cover(c, issue):
    c.saveState()
    # Kopf: dunkelblaues Band mit Titel
    c.setFillColor(NAVY)
    c.rect(0, H - 78 * mm, W, 78 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Raleway-Bold", 52)
    c.drawString(M, H - 42 * mm, "DS-Zeitung")
    c.setFont("Raleway-Light", 13)
    c.drawString(M, H - 52 * mm, "Zeitung der Deutschen Sängerschaft")
    c.setFillColor(GOLD)
    c.rect(M, H - 62 * mm, 42 * mm, 1.6 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Raleway-SemiBold", 12)
    c.drawRightString(W - M, H - 42 * mm, issue["ausgabe"])
    c.setFont("Raleway-Light", 11)
    c.drawRightString(W - M, H - 49 * mm, issue["zeit"])
    # Aufmacher
    c.setFillColor(NAVY)
    c.setFont("Raleway-Bold", 27)
    for i, line in enumerate(issue["aufmacher"]):
        c.drawString(M, H - 105 * mm - i * 11 * mm, line)
    c.setFillColor(GREY)
    c.setFont("Raleway-Light", 12.5)
    c.drawString(M, H - 108 * mm - len(issue["aufmacher"]) * 11 * mm, issue["unterzeile"])
    # Themen
    y = 92 * mm
    c.setFillColor(NAVY_LIGHT)
    c.rect(M, y - 6 * mm - len(issue["themen"]) * 7 * mm, W - 2 * M, 14 * mm + len(issue["themen"]) * 7 * mm, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.setFont("Raleway-Bold", 8)
    c.drawString(M + 8 * mm, y, "IN DIESER AUSGABE")
    c.setFillColor(colors.black)
    c.setFont("Raleway", 11)
    for i, t in enumerate(issue["themen"]):
        c.drawString(M + 8 * mm, y - 8 * mm - i * 7 * mm, f"›  {t}")
    # Fuß
    c.setFillColor(NAVY)
    c.rect(0, 0, W, 10.6 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Raleway", 7.5)
    c.drawCentredString(W / 2, 4.2 * mm, "Beispielausgabe mit frei erfundenen Inhalten · erstellt für die Demo der Mitglieder-App")
    # Eckband
    c.translate(W, H)
    c.rotate(-45)
    c.setFillColor(GOLD)
    c.rect(-45 * mm, -21 * mm, 90 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.setFont("Raleway-Bold", 8.5)
    c.drawCentredString(0, -18.2 * mm, "BEISPIELAUSGABE")
    c.restoreState()


def draw_content(c, doc, issue):
    c.saveState()
    c.setFillColor(NAVY)
    c.setFont("Raleway-Bold", 13)
    c.drawString(M, H - 14 * mm, "DS-Zeitung")
    c.setFont("Raleway", 8)
    c.setFillColor(GREY)
    c.drawRightString(W - M, H - 13.6 * mm, f'{issue["ausgabe"]} · {issue["zeit"]}')
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.line(M, H - 16.8 * mm, W - M, H - 16.8 * mm)
    c.setFillColor(NAVY)
    c.rect(M, 8 * mm, W - 2 * M, 1.2 * mm, fill=1, stroke=0)
    c.setFont("Raleway-SemiBold", 9)
    c.drawRightString(W - M, 11.5 * mm, str(doc.page))
    c.setFont("Raleway", 7.5)
    c.setFillColor(GREY)
    c.drawString(M, 11.5 * mm, "Beispielausgabe – alle Inhalte frei erfunden")
    c.restoreState()


def draw_back(c, doc, issue):
    c.saveState()
    c.setFillColor(NAVY)
    c.rect(0, 0, W, 10.6 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Raleway-SemiBold", 9)
    c.drawRightString(W - M, 4 * mm, str(doc.page))
    c.restoreState()


def build_issue(issue):
    doc = BaseDocTemplate(str(OUT / issue["file"]), pagesize=A4,
                          title=f'DS-Zeitung {issue["ausgabe"]} – {issue["zeit"]} (Beispiel)',
                          author="Mitglieder-App (Beispiel)",
                          subject="Beispielausgabe der DS-Zeitung mit frei erfundenen Inhalten",
                          leftMargin=M, rightMargin=M, topMargin=22 * mm, bottomMargin=22 * mm)
    gap = 7 * mm
    colw = (W - 2 * M - gap) / 2
    top, bottom = H - 22 * mm, 20 * mm
    one = Frame(M, bottom, W - 2 * M, top - bottom, id="one", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    two = [Frame(M, bottom, colw, top - bottom, id="c1", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0),
           Frame(M + colw + gap, bottom, colw, top - bottom, id="c2", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)]
    back = Frame(M + 20 * mm, 60 * mm, W - 2 * M - 40 * mm, H - 120 * mm, id="back", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[one], onPage=lambda c, d: draw_cover(c, issue)),
        PageTemplate(id="two", frames=two, onPage=lambda c, d: draw_content(c, d, issue)),
        PageTemplate(id="back", frames=[back], onPage=lambda c, d: draw_back(c, d, issue)),
    ])
    story = [Spacer(1, 1), NextPageTemplate("two"), PageBreak()]
    story += issue["story"](colw)
    story += [NextPageTemplate("back"), PageBreak()] + impressum()
    doc.build(story)
    print("PDF erzeugt:", issue["file"])


def impressum():
    items = [Paragraph("Impressum", ParagraphStyle("t", fontName="Raleway-Bold", fontSize=20, leading=24,
                                                   alignment=TA_CENTER, textColor=NAVY, spaceAfter=12))]
    for line in [
        "Diese <b>Beispielausgabe</b> zeigt, wie die DS-Zeitung in der Mitglieder-App aussieht: "
        "zum Blättern auf dem Handy, Tablet und Computer.",
        "Alle Inhalte, Namen, Orte und Termine sind <b>frei erfunden</b>. Ähnlichkeiten mit realen "
        "Personen, Bünden oder Ereignissen sind rein zufällig.",
        "Die echten Ausgaben legt die Verbindung als PDF in den Ordner der DS-Zeitung in Google Drive – "
        "sie erscheinen dann automatisch in der App.",
    ]:
        items.append(Paragraph(line, S["imp"]))
    return items


# --------------------------------------------------------------------------- Inhalte

def story_2026_2(colw):
    s = article("Sängertag", "Drei Tage Gesang in Musterstadt",
                "Rund 400 Sängerinnen und Sänger aus 30 Bünden kamen zum Sängertag zusammen – "
                "mit Festkommers, Chorwettbewerb und einer langen Nacht der Lieder.")
    s += paras(
        "Schon am Freitagabend war der Marktplatz von Musterstadt voller Farben: Bünde aus dem ganzen Land "
        "zogen mit Fahnen und Liederbüchern zum Begrüßungsabend in die Stadthalle. Der gastgebende Bund, die "
        "erfundene Sängerschaft Beispielia, hatte ein Jahr lang geplant – und es hat sich gelohnt.",
        "Höhepunkt am Samstag war der Chorwettbewerb. Zwölf Chöre traten an, jeder mit einem Pflichtstück und "
        "einem frei gewählten Lied. Die Jury lobte vor allem die jungen Chöre, die mit viel Mut zu neuen "
        "Sätzen antraten. Den ersten Preis gewann der Chor der Sängerschaft Fiktivia mit einem vierstimmigen "
        "Satz eines alten Wanderlieds.",
        "Beim Festkommers am Abend sangen alle gemeinsam – vom Gaudeamus bis zu neuen Liedern, die erst in "
        "diesem Jahr ins Kommersbuch aufgenommen wurden. Der Sonntag gehörte dem Gottesdienst, einem "
        "Frühschoppen und dem Abschied am Bahnhof, natürlich mit einem letzten Lied.",
    )
    s.append(info_box("Nächster Sängertag", [
        "Der nächste Sängertag findet 2028 in Probstadt statt. Anmeldungen sind ab dem Frühjahr 2027 "
        "über die Bünde möglich.",
    ]))
    s += article("Chorarbeit", "Neue Lieder für den Kommers",
                 "Zehn Lieder kommen neu ins Kommersbuch – leicht zu lernen und gut zu singen.")
    s += paras(
        "Die Musikkommission hat ein Jahr lang Vorschläge gesammelt. Ausgewählt wurden Lieder, die sich auch "
        "ohne Klavier gut anstimmen lassen und die nicht mehr als eine Oktave umfassen. Zu jedem Lied gibt es "
        "Noten, einen Klaviersatz und eine Aufnahme zum Mitsingen.",
        "Die Bünde bekommen die Noten als PDF. Wer eine digitale Liedermappe nutzt, kann sie einfach in den "
        "passenden Ordner legen – so sind die neuen Lieder beim nächsten Kommers auf jedem Handy dabei.",
    )
    s += article("Stimmbildung", "Fünf Tipps für Einsteiger")
    s += paras(
        "<b>1. Aufwärmen:</b> Zwei Minuten summen lockern die Stimme. <b>2. Atmen:</b> Tief in den Bauch, "
        "nicht in die Schultern. <b>3. Haltung:</b> Aufrecht stehen, Knie locker. <b>4. Zuhören:</b> Wer die "
        "Nachbarn hört, singt sauberer. <b>5. Trinken:</b> Wasser zwischen den Liedern hilft mehr als jedes "
        "Bonbon.",
    )
    s += article("Aus den Bünden", "Kurz berichtet")
    s += paras(
        "<b>Beispielia zu Musterstadt</b> hat ihr Haus renoviert: neue Fenster, ein neuer Flügel und ein "
        "Saal, in dem auch Proben mit 40 Stimmen Platz haben.",
        "<b>Fiktivia zu Probstadt</b> feiert im nächsten Jahr ihr 150. Stiftungsfest und lädt schon jetzt alle "
        "Bünde ein.",
        "<b>Demonia zu Testhausen</b> probt seit diesem Semester gemeinsam mit dem Chor der Hochschule – mit "
        "großem Erfolg beim Adventskonzert.",
    )
    s += termine([("14. November 2026", "Chorleitertreffen, online"),
                   ("23. Januar 2027", "Neujahrssingen in Musterstadt"),
                   ("6. bis 8. Mai 2027", "Seminar Stimmbildung in Probstadt")], colw)
    return s


def story_2026_1(colw):
    s = article("Sängertag 2026", "Herzliche Einladung nach Musterstadt",
                "Im Herbst ist es so weit: Der Sängertag kommt nach Musterstadt. Hier steht, was euch erwartet.")
    s += paras(
        "Drei Tage lang wird die Stadt zum Treffpunkt aller Bünde. Geplant sind ein Begrüßungsabend, ein "
        "Chorwettbewerb, der Festkommers und ein gemeinsamer Abschluss am Sonntag. Unterkünfte vermittelt "
        "der gastgebende Bund, die erfundene Sängerschaft Beispielia.",
        "Für den Chorwettbewerb können sich Chöre aller Größen anmelden. Neben dem Pflichtstück darf jeder "
        "Chor ein Lied frei wählen – gern auch ein neues oder selbst gesetztes.",
    )
    s.append(info_box("Anmeldung", [
        "Bitte meldet euch bis Ende Juni über euren Bund an. Die Teilnahme am Chorwettbewerb gebt ihr "
        "dabei gleich mit an.",
    ]))
    s += article("Fortbildung", "Chorleiter-Seminar im Mai",
                 "Ein Wochenende für alle, die im Bund den Ton angeben – oder es bald tun wollen.")
    s += paras(
        "Im Seminar geht es um Probenplanung, Dirigieren für Einsteiger und das Einstudieren mehrstimmiger "
        "Sätze. Am Samstagabend wird das Gelernte gleich ausprobiert: mit einem gemeinsamen Chor aus allen "
        "Teilnehmern.",
        "Vorkenntnisse braucht es nicht. Wer Noten lesen kann, ist im Vorteil – wer es nicht kann, lernt es "
        "nebenbei.",
    )
    s += article("Aus den Bünden", "Kurz berichtet")
    s += paras(
        "<b>Fiktivia zu Probstadt</b> hat einen neuen Chorleiter gewählt und probt ab sofort zweimal in der "
        "Woche.",
        "<b>Demonia zu Testhausen</b> sucht noch Bässe für das Sommerkonzert – Gäste sind willkommen.",
        "<b>Beispielia zu Musterstadt</b> bereitet sich auf den Sängertag vor und freut sich auf viele "
        "Besucher.",
    )
    s += termine([("9. bis 11. Mai 2026", "Chorleiter-Seminar in Probstadt"),
                  ("30. Juni 2026", "Anmeldeschluss Sängertag"),
                  ("18. bis 20. September 2026", "Sängertag in Musterstadt")], colw)
    return s


ISSUES = [
    dict(file="2026-2 DS-Zeitung.pdf", ausgabe="Ausgabe 2/2026", zeit="Herbst 2026",
         aufmacher=["Sängertag 2026:", "Drei Tage Gesang"], unterzeile="Rückblick auf das Treffen in Musterstadt",
         themen=["Sängertag 2026 – der Rückblick", "Neue Lieder für den Kommers", "Stimmbildung: fünf Tipps",
                 "Aus den Bünden", "Termine"], story=story_2026_2),
    dict(file="2026-1 DS-Zeitung.pdf", ausgabe="Ausgabe 1/2026", zeit="Frühjahr 2026",
         aufmacher=["Auf nach", "Musterstadt!"], unterzeile="Einladung zum Sängertag im Herbst",
         themen=["Einladung zum Sängertag", "Chorleiter-Seminar im Mai", "Aus den Bünden", "Termine"],
         story=story_2026_1),
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
