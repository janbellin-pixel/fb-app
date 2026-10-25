// Fiktive Beispieldaten für den Demo-Modus. Alle Personen sind frei erfunden.
import { addDays, isoDate, startOfDay } from '../lib/dates.js';

export const DEMO_DOMAIN = 'frankonia-brunonia.example';
const GREEN = '#88bb2a';

const SKIN = ['#f2d3b8', '#e8c0a0', '#d9a77f', '#c68b5e', '#a8714a', '#f5dcc8'];
const HAIR = { schwarz: '#1d1a17', dunkel: '#3b2a1e', braun: '#6b4a2b', blond: '#b98d55', rot: '#8f4a24', grau: '#9e9e9e', hellgrau: '#c9c9c9', weiss: '#e6e6e6' };
const BGS = ['#e7f0d6', '#efe7d1', '#e3e3e3', '#dde8ee', '#ebe3ea', '#e5eddc', '#f1e9da', '#e0e6dd'];
const JACKETS = ['#1f2937', '#2b2b2b', '#374151', '#3f3f46', '#1e3a2f', '#2b2b40', '#4a4a4a', '#283618'];

/** Gezeichneter Avatar mit Band in den Farben der Verbindung */
function drawAvatar({ skin = 0, hair = 'braun', style = 'short', glasses = false, beard = false, bg = 0, jacket = 0, fux = false }) {
  const s = SKIN[skin];
  const h = HAIR[hair] || hair;
  const bands = fux ? ['#111', GREEN] : ['#111', '#fff', GREEN];
  const stripes = bands.map((c, i) => `<line x1="${72 + 3.1 * i}" y1="${58 + 3.4 * i}" x2="${24 + 3.1 * i}" y2="${102 + 3.4 * i}" stroke="${c}" stroke-width="3.5"/>`).join('');
  const hairShapes = {
    short: `<path d="M33.5 38C33 25 40 21 48 21c9 0 15.5 5 14.5 17-1.5-6.5-6.5-9.5-14.5-9.5-7 0-13 2.5-14.5 9.5z" fill="${h}"/>`,
    side: `<path d="M33.4 40C31.5 26 39 19.5 49 19.5S65 26 62.6 40c-1.1-7-3.6-11-7.6-12.5-7 3-15 2.5-21.6 12.5z" fill="${h}"/>`,
    curly: `<g fill="${h}"><circle cx="38" cy="29" r="6"/><circle cx="46" cy="25" r="7"/><circle cx="55" cy="26" r="6.5"/><circle cx="61" cy="32" r="5"/><circle cx="34.5" cy="35" r="4.5"/></g>`,
    bald: `<path d="M33.2 44c-.7-6 .3-10 1.8-11 .5 4 .5 8 1 13zM62.8 44c.7-6-.3-10-1.8-11-.5 4-.5 8-1 13z" fill="${h}"/>`,
    parted: `<path d="M33.5 39C33 24 42 20 48 20c8 0 16 4 14.5 19-1.5-7-4.5-10-12.5-11l-3-5c-2 5-9 6-13.5 16z" fill="${h}"/>`,
    long: `<path d="M32 50c-2-18 3-30 16-30s18 12 16 30c-1-9-3-16-6-19-5 3-13 3-20 1-3 3-5 10-6 18z" fill="${h}"/>`,
  };
  const beardSvg = beard
    ? `<path d="M34.5 43c.5 12 6.5 17.5 13.5 17.5S61 55 61.5 43c-2.5 6-6.5 9.5-13.5 9.5S37 49 34.5 43z" fill="${h}"/><path d="M43 47.5q5-2.5 10 0-5 1.5-10 0z" fill="${h}"/>`
    : '';
  const mouth = beard
    ? '<path d="M44.5 50.5q3.5 2 7 0" stroke="#f0e0d0" stroke-width="1.3" fill="none" stroke-linecap="round"/>'
    : '<path d="M44 49.5q4 3 8 0" stroke="#7a4b3a" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
  const glassesSvg = glasses
    ? '<g fill="none" stroke="#1f1f1f" stroke-width="1.4"><circle cx="42.5" cy="41" r="4.6"/><circle cx="53.5" cy="41" r="4.6"/><path d="M47.1 41h1.8M37.9 40l-4-1M58.1 40l4-1"/></g>'
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
<rect width="96" height="96" fill="${BGS[bg % BGS.length]}"/>
<defs><clipPath id="b"><path d="M8 96C10 74 28 65 48 65s38 9 40 31z"/></clipPath></defs>
<path d="M8 96C10 74 28 65 48 65s38 9 40 31z" fill="${JACKETS[jacket % JACKETS.length]}"/>
<path d="M41 65l7 15 7-15z" fill="#fff"/>
<g clip-path="url(#b)">${stripes}</g>
<path d="M42 54h12v12q-6 4-12 0z" fill="${s}"/>
<ellipse cx="33.5" cy="42" rx="2.6" ry="4" fill="${s}"/><ellipse cx="62.5" cy="42" rx="2.6" ry="4" fill="${s}"/>
<ellipse cx="48" cy="40" rx="14.5" ry="16.5" fill="${s}"/>
${hairShapes[style] || hairShapes.short}
<path d="M39 36.5q3.5-2 7 0M50 36.5q3.5-2 7 0" stroke="${h}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<circle cx="42.5" cy="41" r="1.5" fill="#2a2a2a"/><circle cx="53.5" cy="41" r="1.5" fill="#2a2a2a"/>
${beardSvg}${mouth}${glassesSvg}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const mailOf = (v, n) => `${v}.${n}`.toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z.]/g, '') + `@${DEMO_DOMAIN}`;

// [Titel, Vorname, Nachname, Kneipname, Status, Ämter, Studium/Beruf, Wohnort, Rezeption, Aussehen, Über mich]
const RAW_MEMBERS = [
  ['', 'Felix', 'Fiktiv', 'Merlin', 'Aktiver Bursche', 'Schriftwart (xxx), Redaktion Bundesbote', 'Maschinenbau (M.Sc.)', 'Verbindungshaus', 'WiSe 2022/23',
    { skin: 0, hair: 'braun', style: 'side', glasses: true, bg: 0, jacket: 0 },
    'Schriftwart und Redakteur unseres Bundesboten. Ich koche gern für das ganze Haus und spiele Posaune.'],
  ['', 'Jonas', 'Beispiel', 'Sokrates', 'Aktiver Bursche', 'Sprecher (x)', 'Physik (B.Sc.)', 'Verbindungshaus', 'WiSe 2022/23',
    { skin: 1, hair: 'dunkel', style: 'short', bg: 1, jacket: 1 },
    'Sprecher im Wintersemester. Fragen zum Semesterprogramm gern jederzeit an mich.'],
  ['', 'Lukas', 'Muster', 'Kant', 'Aktiver Bursche', 'Fuxmajor (FM)', 'Geschichte (M.A.)', 'Musterstadt', 'SoSe 2022',
    { skin: 0, hair: 'blond', style: 'parted', bg: 2, jacket: 2 }, 'Als Fuxmajor kümmere ich mich um unsere Füxe.'],
  ['', 'Paul', 'Platzhalter', 'Lessing', 'Aktiver Bursche', 'Kassenwart (xx)', 'BWL', 'Verbindungshaus', 'WiSe 2023/24',
    { skin: 2, hair: 'schwarz', style: 'curly', bg: 3, jacket: 3 }, 'Kassenwart – Belege bitte zeitnah einreichen 😉'],
  ['', 'Erik', 'Entwurf', 'Humboldt', 'Aktiver Bursche', '', 'Rechtswissenschaft', 'Musterstadt', 'WiSe 2025/26',
    { skin: 0, hair: 'rot', style: 'short', bg: 4, jacket: 4 }, ''],
  ['', 'Moritz', 'Probe', 'Gauß', 'Aktiver Bursche', 'Hauswart (Aktivitas)', 'Informatik (B.Sc.)', 'Verbindungshaus', 'WiSe 2025/26',
    { skin: 3, hair: 'schwarz', style: 'side', glasses: true, bg: 5, jacket: 5 }, 'Bei Problemen mit WLAN oder Technik im Haus: einfach melden.'],
  ['', 'David', 'Dummy', 'Mozart', 'Aktiver Bursche', '', 'Musikwissenschaft', 'Musterstadt', 'WiSe 2025/26',
    { skin: 1, hair: 'braun', style: 'curly', bg: 6, jacket: 6 }, ''],
  ['', 'Tim', 'Testmann', 'Schiller', 'Fux', '', 'Germanistik', 'Verbindungshaus', 'SoSe 2026',
    { skin: 0, hair: 'blond', style: 'short', bg: 7, jacket: 7, fux: true }, ''],
  ['', 'Niklas', 'Neu', 'Kepler', 'Fux', '', 'Luft- und Raumfahrttechnik', 'Musterstadt', 'SoSe 2026',
    { skin: 4, hair: 'schwarz', style: 'short', bg: 0, jacket: 1, fux: true }, 'Neu in der Stadt und im Bund – freue mich auf alles, was kommt!'],
  ['', 'Benedikt', 'Demo', 'Bach', 'Fux', '', 'Lehramt Musik/Mathematik', 'Verbindungshaus', 'SoSe 2026',
    { skin: 1, hair: 'dunkel', style: 'parted', glasses: true, bg: 1, jacket: 2, fux: true }, ''],
  ['', 'Leon', 'Lorem', 'Dürer', 'Fux', '', 'Architektur', 'Musterstadt', 'SoSe 2026',
    { skin: 2, hair: 'braun', style: 'long', bg: 2, jacket: 3, fux: true }, ''],
  ['', 'Jakob', 'Ipsum', 'Euler', 'Fux', '', 'Mathematik', 'Verbindungshaus', 'SoSe 2026',
    { skin: 0, hair: 'dunkel', style: 'side', bg: 3, jacket: 4, fux: true }, ''],
  ['', 'Simon', 'Skizze', 'Brahms', 'Fux', '', 'Medizin', 'Musterstadt', 'SoSe 2026',
    { skin: 5, hair: 'blond', style: 'curly', bg: 4, jacket: 5, fux: true }, ''],
  ['', 'Florian', 'Formular', 'Galilei', 'Inaktiver Bursche', '', 'Elektrotechnik (M.Sc.), Doktorand', 'München', 'WiSe 2019/20',
    { skin: 1, hair: 'braun', style: 'short', beard: true, bg: 5, jacket: 6 }, ''],
  ['', 'Sebastian', 'Schablone', 'Haydn', 'Inaktiver Bursche', '', 'Wirtschaftsingenieurwesen', 'Hamburg', 'SoSe 2020',
    { skin: 0, hair: 'dunkel', style: 'parted', bg: 6, jacket: 7 }, ''],
  ['', 'Alexander', 'Annex', 'Archimedes', 'Inaktiver Bursche', '', 'Bauingenieurwesen', 'Musterstadt', 'WiSe 2020/21',
    { skin: 3, hair: 'schwarz', style: 'short', beard: true, bg: 7, jacket: 0 }, ''],
  ['Dr.', 'Max', 'Mustermann', 'Faust', 'Alter Herr', 'Vorsitzender der Altherrenschaft', 'Unternehmensberater', 'Frankfurt am Main', 'WiSe 1985/86',
    { skin: 0, hair: 'grau', style: 'side', glasses: true, bg: 0, jacket: 2 }, 'Ansprechpartner für alle Fragen rund um die Altherrenschaft und das Mentoring-Programm.'],
  ['', 'Hans', 'Exempel', 'Goethe', 'Alter Herr', 'Hauswart (Altherrenschaft)', 'Architekt i. R.', 'Musterstadt', 'SoSe 1976',
    { skin: 1, hair: 'weiss', style: 'bald', beard: true, bg: 1, jacket: 3 }, 'Seit fünfzig Jahren dabei – und immer noch gern mit Werkzeug auf dem Haus.'],
  ['Dr.', 'Karl', 'Vorlage', 'Leibniz', 'Alter Herr', '', 'Chemiker i. R.', 'Hannover', 'WiSe 1975/76',
    { skin: 0, hair: 'hellgrau', style: 'bald', glasses: true, bg: 2, jacket: 4 }, ''],
  ['', 'Daniel', 'Dokument', 'Ranke', 'Alter Herr', '', 'Studienrat (Geschichte, Latein)', 'Hannover', 'WiSe 1996/97',
    { skin: 2, hair: 'dunkel', style: 'short', beard: true, bg: 3, jacket: 5 }, ''],
  ['', 'Christian', 'Concept', 'Newton', 'Alter Herr', 'Stammtisch Stuttgart', 'Ingenieur, Automobilindustrie', 'Stuttgart', 'SoSe 2001',
    { skin: 0, hair: 'braun', style: 'parted', bg: 4, jacket: 6 }, ''],
  ['', 'Andreas', 'Annahme', 'Planck', 'Alter Herr', 'Stammtisch Berlin', 'Physiker', 'Berlin', 'WiSe 1990/91',
    { skin: 1, hair: 'grau', style: 'short', glasses: true, bg: 5, jacket: 7 }, ''],
  ['', 'Michael', 'Modell', 'Dante', 'Alter Herr', '', 'Rechtsanwalt', 'Köln', 'SoSe 1994',
    { skin: 3, hair: 'grau', style: 'side', bg: 6, jacket: 0 }, ''],
  ['Dr.', 'Stefan', 'Stichprobe', 'Händel', 'Alter Herr', 'Stammtisch Hamburg', 'Arzt', 'Hamburg', 'WiSe 2003/04',
    { skin: 0, hair: 'dunkel', style: 'short', glasses: true, bg: 7, jacket: 1 }, 'Organisiere den Hamburger Stammtisch – jeden zweiten Donnerstag im Monat.'],
  ['', 'Peter', 'Prototyp', 'Rubens', 'Alter Herr', '', 'Kaufmann', 'Leipzig', 'SoSe 2008',
    { skin: 2, hair: 'braun', style: 'short', beard: true, bg: 0, jacket: 2 }, ''],
  ['', 'Markus', 'Musterhaft', 'Fontane', 'Alter Herr', '', 'Journalist', 'Berlin', 'WiSe 2009/10',
    { skin: 0, hair: 'blond', style: 'side', bg: 1, jacket: 3 }, ''],
  ['', 'Johannes', 'Jedermann', 'Herder', 'Alter Herr', 'Stammtisch München', 'Studienrat', 'München', 'SoSe 2012',
    { skin: 4, hair: 'schwarz', style: 'parted', glasses: true, bg: 2, jacket: 4 }, ''],
  ['Prof. Dr.', 'Wolfgang', 'Wert', 'Ovid', 'Ehrenmitglied', '', 'Professor für Klassische Philologie i. R.', 'Göttingen', 'Ehrenmitglied seit 2010',
    { skin: 0, hair: 'weiss', style: 'bald', glasses: true, beard: true, bg: 3, jacket: 5 }, ''],
];

export const DEMO_ME_EMAIL = mailOf('Felix', 'Fiktiv');

// Aktuelle/letzte Tätigkeit und Angebote für jüngere Bundesbrüder (nach Nachname)
const EXTRA = {
  Fiktiv: { taetigkeit: 'Masterstudium, Werkstudent im Anlagenbau' },
  Formular: { taetigkeit: 'Doktorand am Institut für Leistungselektronik', angebot: 'Tipps rund um Masterarbeit und Promotion in den Ingenieurwissenschaften.' },
  Mustermann: { taetigkeit: 'Partner bei einer Unternehmensberatung', angebot: 'Mentoring für Studierende aller Fachrichtungen, Praktikumsplätze in der Beratung, Bewerbungstraining vor dem ersten Job.' },
  Exempel: { taetigkeit: 'Architekt im Ruhestand, zuletzt eigenes Büro', angebot: 'Hilfe bei Fragen zu Bau und Handwerk – und gern ein Blick auf Mappen für die Architektur-Bewerbung.' },
  Concept: { taetigkeit: 'Entwicklungsingenieur in der Automobilindustrie', angebot: 'Werkstudentenstellen und Praktika in der Fahrzeugentwicklung (Raum Stuttgart) vermitteln.' },
  Modell: { taetigkeit: 'Rechtsanwalt, eigene Kanzlei für Arbeitsrecht', angebot: 'Praktikum und Referendariatsstation in meiner Kanzlei in Köln; Fragen zum Jurastudium.' },
  Stichprobe: { taetigkeit: 'Oberarzt Innere Medizin', angebot: 'Kontakte für Famulatur und PJ, Fragen rund ums Medizinstudium.' },
  Annahme: { taetigkeit: 'Physiker in der Forschung' },
  Musterhaft: { taetigkeit: 'Redakteur bei einer Tageszeitung', angebot: 'Hospitanz in der Redaktion, Tipps für Bewerbungen im Journalismus.' },
};

export function buildMembers() {
  return RAW_MEMBERS.map(([titel, v, n, k, status, aemter, studium, wohnort, rez, look, about]) => ({
    email: mailOf(v, n),
    name: [titel, v, n].filter(Boolean).join(' '),
    photo: drawAvatar(look),
    kneipname: k,
    status,
    aemter,
    studium,
    taetigkeit: '',
    wohnort,
    rezeption: rez,
    ueberMich: about,
    angebot: '',
    telefon: '',
    instagram: '',
    linkedin: '',
    ...(EXTRA[n] || {}),
  }));
}

/* ------------------------------------------------------------------ Adressen */
const CITY = {
  Verbindungshaus: ['Musterweg 1', '12345', 'Musterstadt'],
  Musterstadt: ['Beispielstraße', '12345', 'Musterstadt'],
  München: ['Platzhalterstraße', '80331', 'München'],
  Hamburg: ['Am Beispielkai', '20457', 'Hamburg'],
  'Frankfurt am Main': ['Musterallee', '60311', 'Frankfurt am Main'],
  Hannover: ['Lindenweg', '30159', 'Hannover'],
  Stuttgart: ['Am Probehang', '70173', 'Stuttgart'],
  Berlin: ['Beispielufer', '10115', 'Berlin'],
  Köln: ['Musterring', '50667', 'Köln'],
  Leipzig: ['Vorlagenstraße', '04109', 'Leipzig'],
  Göttingen: ['Am Entwurf', '37073', 'Göttingen'],
};

export function buildAddressRows(today = new Date()) {
  const header = ['Nachname', 'Vorname', 'Kneipname', 'Status', 'Straße', 'PLZ', 'Ort', 'Land', 'Telefon', 'Mobil', 'E-Mail', 'Geburtstag', 'Rezeption', 'Beruf'];
  const rows = [header];
  RAW_MEMBERS.forEach(([titel, v, n, k, status, , studium, wohnort, rez], i) => {
    const [street, plz, ort] = CITY[wohnort] || CITY.Musterstadt;
    const nr = wohnort === 'Verbindungshaus' ? '' : ` ${(i * 7) % 40 + 2}`;
    const isAh = /Alter Herr|Ehrenmitglied/.test(status);
    const year = status === 'Fux' ? 2006 : /Aktiver/.test(status) ? 2003 : /Inaktiver/.test(status) ? 1998 : 1945 + ((i * 13) % 45);
    let bday = new Date(year, (i * 5) % 12, ((i * 11) % 27) + 1);
    // ein paar Geburtstage in den nächsten Tagen, damit die Startseite etwas zeigt
    const soon = { 2: 3, 17: 8, 24: 13 };
    if (soon[i] !== undefined) {
      const d = addDays(startOfDay(today), soon[i]);
      bday = new Date(year, d.getMonth(), d.getDate());
    }
    rows.push([
      (titel ? `${titel} ` : '') + n,
      v,
      k,
      status,
      street + nr,
      plz,
      ort,
      'Deutschland',
      isAh ? `+49 ${['40', '69', '511', '711', '30', '221', '341', '551', '89'][i % 9]} 000${String(100 + i)}` : '',
      `+49 170 0000${String(100 + i * 3).slice(-3)}`,
      mailOf(v, n),
      `${String(bday.getDate()).padStart(2, '0')}.${String(bday.getMonth() + 1).padStart(2, '0')}.${bday.getFullYear()}`,
      rez,
      studium,
    ]);
  });
  return rows;
}

/* ------------------------------------------------------------------ Termine */
const EVENTS = [
  { id: 'demo01', d: -9, t: '19:00', dur: 3, title: 'Begrüßungsabend für Erstsemester', cat: 'Fest', loc: 'Verbindungshaus, Garten', dress: 'Zivil',
    desc: 'Lockerer Abend für alle Erstsemester und Interessenten. Bringt gern Freunde mit!' },
  { id: 'demo02', d: -3, t: '10:00', dur: 4, title: 'Hausputz vor Semesterbeginn', cat: 'Haus', loc: 'Verbindungshaus', dress: 'Arbeitskleidung',
    desc: 'Gemeinsam machen wir das Haus fit für das Semester. Für Mittagessen ist gesorgt.' },
  { id: 'demo03', d: 2, t: '20:00', dur: 4, title: 'Semesterantrittskneipe', cat: 'Kneipe', loc: 'Großer Saal, Verbindungshaus', dress: 'Vollcouleur', mandatory: true,
    desc: 'Wir eröffnen das Semester mit einer feierlichen Kneipe. Alte Herren und Gäste sind herzlich willkommen.\n\nPräside: Jonas Beispiel v/o Sokrates (x)\nAnschließend gemütliches Beisammensein.' },
  { id: 'demo04', d: 5, t: '19:00', dur: 2, title: 'Fuxenstunde: Geschichte des Bundes', cat: 'Fuxenstunde', loc: 'Kneipsaal', dress: 'Band',
    desc: 'Für alle Füxe verpflichtend, Burschen sind willkommen. Leitung: Lukas Muster v/o Kant (FM).' },
  { id: 'demo05', d: 9, t: '19:30', dur: 2.5, title: 'Vortragsabend: Künstliche Intelligenz im Beruf', cat: 'Vortrag', loc: 'Bibliothek, Verbindungshaus', dress: 'Zivil',
    desc: 'AH Dr. Max Mustermann v/o Faust berichtet aus der Beratungspraxis: Wo hilft KI wirklich – und wo nicht?\n\nIm Anschluss Diskussion bei Brezeln und Getränken. Gäste willkommen.' },
  { id: 'demo06', d: 12, t: '19:00', dur: 3, title: 'AH-Stammtisch Hamburg', cat: 'Stammtisch', loc: 'Gasthaus „Zum Anker“, Hamburg', dress: 'Zivil',
    desc: 'Monatlicher Stammtisch der Hamburger Alten Herren. Aktive auf Durchreise sind herzlich eingeladen.' },
  { id: 'demo07', d: 14, t: '15:00', dur: 3, title: 'Convent', cat: 'Convent', loc: 'Conventsraum', dress: 'Band', mandatory: true,
    desc: 'Tagesordnung folgt per E-Mail. Anträge bitte bis eine Woche vorher an den Schriftwart.' },
  { id: 'demo08', d: 17, t: '10:00', dur: 5, title: 'Arbeitseinsatz am Haus', cat: 'Haus', loc: 'Verbindungshaus', dress: 'Arbeitskleidung',
    desc: 'Gartenarbeit, Fenster streichen, Keller entrümpeln. Jede helfende Hand zählt!' },
  { id: 'demo09', d: 21, t: '18:00', dur: 4, title: 'Kegelabend', cat: 'Sport & Freizeit', loc: 'Kegelbahn „Zur Linde“', dress: 'Zivil',
    desc: 'Aktive gegen Alte Herren – der Verlierer zahlt die erste Runde.' },
  { id: 'demo10', d: 27, t: '20:00', dur: 4, title: 'Krambambuli-Abend', cat: 'Kneipe', loc: 'Kneipsaal', dress: 'Band',
    desc: 'Das traditionelle Heißgetränk nach überliefertem Rezept. Bitte eigene Tasse mitbringen.' },
  { id: 'demo11', d: 34, t: '19:30', dur: 2, title: 'Vortragsabend: Ehrenamt und Verantwortung', cat: 'Vortrag', loc: 'Bibliothek, Verbindungshaus', dress: 'Zivil',
    desc: 'Ein Gespräch mit Bundesbrüdern, die sich in Vereinen, Feuerwehr und Kommunalpolitik engagieren.' },
  { id: 'demo12', d: 41, t: '19:00', dur: 5, title: 'Festkneipe mit Damen', cat: 'Fest', loc: 'Großer Saal, Verbindungshaus', dress: 'Vollcouleur', mandatory: true,
    desc: 'Festliche Kneipe mit anschließendem Tanz. Anmeldung bitte bis eine Woche vorher, damit wir planen können.' },
  { id: 'demo13', d: 48, allDay: true, days: 2, title: 'Hüttenwochenende', cat: 'Sport & Freizeit', loc: 'Selbstversorgerhütte im Mittelgebirge', dress: 'Sportlich',
    desc: 'Wandern, Kochen, Singen. Abfahrt Samstag 8 Uhr am Haus, Rückkehr Sonntagabend. Kosten ca. 40 €.' },
  { id: 'demo14', d: 62, t: '11:00', dur: 3, title: 'Empfang der Altherrenschaft', cat: 'Fest', loc: 'Verbindungshaus', dress: 'Festlich',
    desc: 'Empfang für alle Bundesbrüder mit Familie. Rückblick und Ausblick durch den Vorstand der Altherrenschaft.' },
];

function hash(s) {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function buildEvents(members, today = new Date()) {
  const base = startOfDay(today);
  return EVENTS.map((e) => {
    const day = addDays(base, e.d);
    let start;
    let end;
    if (e.allDay) {
      start = isoDate(day);
      end = isoDate(addDays(day, e.days || 1));
    } else {
      const [hh, mm] = e.t.split(':').map(Number);
      const s = new Date(day);
      s.setHours(hh, mm, 0, 0);
      start = s.toISOString();
      end = new Date(s.getTime() + e.dur * 3600_000).toISOString();
    }
    const attendees = members.map((m) => {
      if (m.email === DEMO_ME_EMAIL) {
        const mine = { demo03: 'accepted', demo01: 'accepted', demo02: 'accepted', demo07: 'accepted', demo06: 'declined' }[e.id];
        return { email: m.email, name: m.name, status: mine || 'needsAction', guests: 0, comment: '', source: 'calendar' };
      }
      const r = hash(e.id + m.email) % 100;
      const isAh = /Alter Herr|Ehrenmitglied/.test(m.status);
      let status = 'needsAction';
      const likes = isAh ? (/Stammtisch|Empfang|Festkneipe|Vortrag/.test(e.title) ? 70 : 25) : 72;
      if (r < likes * 0.75) status = 'accepted';
      else if (r < likes) status = 'tentative';
      else if (r < likes + 15) status = 'declined';
      if (e.d < 0 && status === 'needsAction') status = 'declined';
      const guests = status === 'accepted' && e.cat === 'Fest' && r % 3 === 0 ? 1 : 0;
      const comment = status === 'tentative' && r % 4 === 0 ? 'Komme evtl. etwas später' : '';
      return { email: m.email, name: m.name, status, guests, comment, source: 'calendar' };
    });
    return {
      id: e.id,
      title: e.title,
      description: e.desc || '',
      location: e.loc || '',
      start,
      end,
      allDay: !!e.allDay,
      category: e.cat,
      dresscode: e.dress || '',
      mandatory: !!e.mandatory,
      attendees,
      htmlLink: '',
      invited: true,
      groupInvited: true,
    };
  });
}

/* ------------------------------------------------------------------ News */
export function buildNews(now = new Date()) {
  const ago = (days, h = 10) => { const d = addDays(startOfDay(now), -days); d.setHours(h, 15); return d.toISOString(); };
  return [
    {
      id: 'n1', date: ago(1), pinned: true, category: 'Allgemein', image: 'assets/demo/news-app.webp',
      title: 'Willkommen in der neuen Mitglieder-App!',
      authorEmail: mailOf('Felix', 'Fiktiv'), authorName: 'Felix Fiktiv',
      text: `Liebe Bundesbrüder,

ab sofort haben wir eine eigene **Mitglieder-App**. Sie läuft auf dem iPhone, auf Android-Smartphones und am Computer – und alle Daten bleiben in unserem Google Workspace.

## Was ihr damit machen könnt
- **Termine** ansehen und direkt zu- oder absagen – und sehen, wer sonst noch kommt
- den **Verbindungskalender** in den eigenen Google-Kalender übernehmen
- **Profile** aller Bundesbrüder mit Foto, Kneipname und Ämtern ansehen
- im **Chat** schreiben (Google Chat)
- im **Adressverzeichnis** nachschlagen
- in allen Ausgaben des **Bundesboten** blättern
- im **Forum** diskutieren

## So geht's
Link öffnen, einmal mit dem Verbindungskonto anmelden und die App zum Startbildschirm hinzufügen. Eine Anleitung findet ihr unter *Mehr → App installieren*.

Bitte pflegt als Erstes euer Profil – danke!`,
    },
    {
      id: 'n2', date: ago(9), category: 'Veranstaltungen', image: 'assets/demo/news-stiftungsfest.webp',
      title: 'Rückblick: Unser Stiftungsfest 2026',
      authorEmail: mailOf('Paul', 'Platzhalter'), authorName: 'Paul Platzhalter',
      text: `Rund **140 Bundesbrüder, Damen und Gäste** haben mit uns drei Tage lang gefeiert. Vom Begrüßungsabend im Garten über den Festkommers bis zum Frühschoppen am Sonntag war alles dabei.

> Tradition heißt nicht, die Asche aufzubewahren, sondern das Feuer weiterzugeben.

Ein ausführlicher Bericht mit allen Ehrungen steht in der neuen Ausgabe des Bundesboten. Danke an alle Helfer!`,
    },
    {
      id: 'n3', date: ago(16), category: 'Haus', image: 'assets/demo/news-kueche.webp',
      title: 'Die neue Küche ist fertig',
      authorEmail: mailOf('Hans', 'Exempel'), authorName: 'Hans Exempel',
      text: `Pünktlich zum Semesterstart ist die Hausküche fertig: neue Arbeitsflächen, Induktionsherd, zwei Geschirrspüler und deutlich mehr Stauraum.

Herzlichen Dank an alle Spender aus der Altherrenschaft und an die Bewohner, die beim Abbau und Streichen geholfen haben. Ein **Einweihungsessen** für alle Spender folgt – der Termin steht bald im Kalender.`,
    },
    {
      id: 'n4', date: ago(23), category: 'Haus', image: '',
      title: 'Zwei Zimmer frei zum Wintersemester',
      authorEmail: mailOf('Moritz', 'Probe'), authorName: 'Moritz Probe',
      text: `Im Verbindungshaus sind noch **zwei möblierte Zimmer** (14 und 18 m²) frei. WLAN, Gemeinschaftsküche und Garten inklusive, Warmmiete ab 290 € im Monat.

Kennt ihr Studenten, die ein Zimmer suchen? Sprecht sie gern an oder schreibt mir im Chat.`,
    },
    {
      id: 'n5', date: ago(30), category: 'Veranstaltungen', image: 'assets/demo/news-vortrag.webp',
      title: 'Vortragsreihe im Wintersemester',
      authorEmail: mailOf('Jonas', 'Beispiel'), authorName: 'Jonas Beispiel',
      text: `Auch in diesem Semester laden wir wieder zu Vortragsabenden ein – offen für Bundesbrüder und Gäste:

1. **Künstliche Intelligenz im Beruf** – AH Dr. Max Mustermann v/o Faust
2. **Ehrenamt und Verantwortung** – Gesprächsrunde mit Bundesbrüdern

Die genauen Termine findet ihr im Kalender. Ideen für weitere Vorträge gern ins Forum!`,
    },
  ];
}

/* ------------------------------------------------------------------ Forum */
export function buildForumData(now = new Date()) {
  const t = (daysAgo, h, m = 0) => { const d = addDays(startOfDay(now), -daysAgo); d.setHours(h, m); return d.toISOString(); };
  const who = (v, n) => ({ authorEmail: mailOf(v, n), authorName: `${v} ${n}` });
  const threads = [
    { id: 't1', category: 'Allgemeines', title: 'Willkommen im Forum – bitte kurz lesen', ...who('Felix', 'Fiktiv'), created: t(20, 9), pinned: true },
    { id: 't2', category: 'Veranstaltungen', title: 'Fahrgemeinschaften zur Festkneipe', ...who('Daniel', 'Dokument'), created: t(4, 18, 20) },
    { id: 't3', category: 'Aktivitas', title: 'Ideen für das Semesterprogramm', ...who('Jonas', 'Beispiel'), created: t(12, 21, 5) },
    { id: 't4', category: 'Altherrenschaft', title: 'Wer hat noch alte Fotos vom Stiftungsfest 1996?', ...who('Hans', 'Exempel'), created: t(15, 11, 30) },
    { id: 't5', category: 'Beruf & Karriere', title: 'Praktikumsplätze im Maschinenbau gesucht', ...who('Niklas', 'Neu'), created: t(7, 16, 45) },
    { id: 't6', category: 'Biete & Suche', title: 'Biete: Umzugskartons und ein Fahrrad', ...who('Sebastian', 'Schablone'), created: t(2, 12, 10) },
  ];
  const posts = [
    { threadId: 't1', ...who('Felix', 'Fiktiv'), created: t(20, 9), text: 'Liebe Bundesbrüder,\n\nhier im Forum können wir Themen in Ruhe diskutieren, die im Chat untergehen würden. Bitte bleibt freundlich und sachlich – wie auf dem Haus auch.\n\n- Ein Thema pro Beitrag\n- Passende **Kategorie** wählen\n- Persönliches lieber per Direktnachricht' },
    { threadId: 't1', ...who('Max', 'Mustermann'), created: t(19, 20, 12), text: 'Sehr schön, danke für die Mühe! Endlich ein Ort, an dem auch wir Alten Herren mitreden können.' },
    { threadId: 't2', ...who('Daniel', 'Dokument'), created: t(4, 18, 20), text: 'Ich fahre aus Hannover zur Festkneipe und habe noch zwei Plätze frei. Abfahrt gegen 15 Uhr. Wer möchte mit?' },
    { threadId: 't2', ...who('Karl', 'Vorlage'), created: t(4, 19, 2), text: 'Gern, lieber Ranke! Ich wäre dabei – Abholung am Hauptbahnhof wäre ideal.' },
    { threadId: 't2', ...who('Stefan', 'Stichprobe'), created: t(3, 8, 40), text: 'Aus Hamburg fahren wir zu dritt mit der Bahn. Wer sich anschließen will: ICE um 13:24.' },
    { threadId: 't2', ...who('Felix', 'Fiktiv'), created: t(1, 22, 15), text: 'Super! Für alle, die übernachten wollen: Im Haus gibt es ein paar Gästebetten – kurz bei Moritz melden.' },
    { threadId: 't3', ...who('Jonas', 'Beispiel'), created: t(12, 21, 5), text: 'Das Semesterprogramm steht in groben Zügen. Habt ihr noch Ideen für Vorträge, Ausflüge oder Sport? Alles ist willkommen!' },
    { threadId: 't3', ...who('Moritz', 'Probe'), created: t(12, 22, 30), text: 'Wie wäre es mit einem Spieleabend mit Brettspielen? Wir haben im Keller noch einiges stehen.' },
    { threadId: 't3', ...who('Lukas', 'Muster'), created: t(11, 9, 15), text: 'Für die Füxe fände ich eine Exkursion ins Stadtarchiv spannend – dort liegen auch Akten zu unserer Geschichte.' },
    { threadId: 't3', ...who('Andreas', 'Annahme'), created: t(10, 18, 0), text: 'Ich biete gern einen Vortrag über **Quantencomputer** an – verständlich, versprochen 🙂' },
    { threadId: 't3', ...who('Jonas', 'Beispiel'), created: t(9, 10, 20), text: 'Klasse, danke! Spieleabend und Vortrag kommen ins Programm, die Exkursion plane ich mit Kant.' },
    { threadId: 't4', ...who('Hans', 'Exempel'), created: t(15, 11, 30), text: 'Für die Chronik zum nächsten Jubiläum suchen wir Fotos vom Stiftungsfest 1996. Wer hat noch Abzüge oder Dias? Ich scanne alles ein und gebe es zurück.' },
    { threadId: 't4', ...who('Michael', 'Modell'), created: t(14, 19, 45), text: 'Ich habe noch ein Album auf dem Dachboden. Schaue am Wochenende nach!' },
    { threadId: 't4', ...who('Daniel', 'Dokument'), created: t(13, 8, 5), text: 'Bei mir gibt es einige Bilder vom Kommers. Schicke sie dir per Post.' },
    { threadId: 't5', ...who('Niklas', 'Neu'), created: t(7, 16, 45), text: 'Hallo zusammen, ich suche für den kommenden Sommer ein Praktikum im Bereich Maschinenbau oder Luftfahrt. Hat jemand Kontakte oder Tipps?' },
    { threadId: 't5', ...who('Christian', 'Concept'), created: t(6, 20, 30), text: 'Melde dich gern bei mir – bei uns gibt es jedes Jahr Praktikumsplätze in der Entwicklung. Schick mir deinen Lebenslauf per Chat.' },
    { threadId: 't6', ...who('Sebastian', 'Schablone'), created: t(2, 12, 10), text: 'Ich ziehe um und habe übrig: ca. 20 Umzugskartons und ein Trekkingrad (28 Zoll). Gegen eine Spende für die Hauskasse abzugeben.' },
  ];
  return {
    threads,
    posts: posts.map((p, i) => ({ id: `p${i + 1}`, edited: '', ...p })),
  };
}

/* ------------------------------------------------------------------ Chat */
export function buildChat(now = new Date()) {
  const t = (minAgo) => new Date(now.getTime() - minAgo * 60_000).toISOString();
  const who = (v, n) => ({ email: mailOf(v, n) });
  const spaces = [
    { id: 'spaces/demo-allgemein', name: 'Frankonia-Brunonia – Allgemein', description: 'Für alle Bundesbrüder', lastActive: t(12) },
    { id: 'spaces/demo-aktivitas', name: 'Aktivitas', description: 'Aktive und Füxe', lastActive: t(48) },
    { id: 'spaces/demo-haus', name: 'Haus & Zimmer', description: 'Alles rund ums Verbindungshaus', lastActive: t(300) },
    { id: 'spaces/demo-ahv', name: 'Altherrenschaft', description: 'Austausch der Alten Herren', lastActive: t(1500) },
  ];
  const messages = {
    'spaces/demo-allgemein': [
      [who('Max', 'Mustermann'), t(1500), 'Guten Morgen zusammen! Kurze Erinnerung: Der Vortragsabend zu KI ist jetzt im Kalender – Anmeldung über die App.'],
      [who('Jonas', 'Beispiel'), t(1460), 'Danke! Wir rechnen mit vielen Gästen, also gern früh zusagen.'],
      [who('Stefan', 'Stichprobe'), t(700), 'Gibt es schon Fotos vom Begrüßungsabend?'],
      [who('Felix', 'Fiktiv'), t(690), 'Kommen in den nächsten Bundesboten – ein paar lade ich vorher hier hoch 📸'],
      [who('Hans', 'Exempel'), t(95), 'Die neue Küche ist übrigens wunderbar geworden. Respekt an alle, die mitgeholfen haben!'],
      [who('Paul', 'Platzhalter'), t(60), 'Danke, Goethe! Ohne die Spenden der Altherrenschaft wäre das nicht gegangen.'],
      [who('Niklas', 'Neu'), t(12), 'Kann mir jemand sagen, wo ich für die Antrittskneipe ein Band herbekomme?'],
    ],
    'spaces/demo-aktivitas': [
      [who('Lukas', 'Muster'), t(240), 'Füxe: Fuxenstunde diese Woche wie geplant. Bitte Liederbuch mitbringen!'],
      [who('Tim', 'Testmann'), t(200), 'Alles klar 👍'],
      [who('Benedikt', 'Demo'), t(180), 'Ich bringe meine Gitarre mit.'],
      [who('Jonas', 'Beispiel'), t(48), 'Für den Arbeitseinsatz brauchen wir noch Leute. Bitte in der App zusagen, damit wir Essen planen können.'],
    ],
    'spaces/demo-haus': [
      [who('Moritz', 'Probe'), t(900), 'Das WLAN im zweiten Stock ist wieder stabil. Neuer Router ist eingebaut.'],
      [who('Jakob', 'Ipsum'), t(860), 'Endlich 🙌'],
      [who('Hans', 'Exempel'), t(300), 'Am Samstag kommt der Schornsteinfeger zwischen 9 und 12 Uhr. Bitte Zugang zum Keller ermöglichen.'],
    ],
    'spaces/demo-ahv': [
      [who('Max', 'Mustermann'), t(4000), 'Liebe Alte Herren, die Einladung zur Generalversammlung geht in den nächsten Wochen raus.'],
      [who('Andreas', 'Annahme'), t(3900), 'Danke für die Info. Gibt es diesmal auch eine Online-Teilnahme?'],
      [who('Max', 'Mustermann'), t(1500), 'Ja, wir übertragen per Google Meet. Den Link gibt es mit der Einladung.'],
    ],
  };
  const out = {};
  for (const [space, list] of Object.entries(messages)) {
    out[space] = list.map(([sender, created, text], i) => ({ id: `${space}/m${i}`, senderEmail: sender.email, created, text }));
  }
  return { spaces, messages: out };
}

/* ------------------------------------------------------------------ Zeitung */
export const DEMO_ISSUES = [
  { id: 'z2026-2', name: '2026-2 Bundesbote SoSe 2026.pdf', createdTime: '2026-10-05T10:00:00Z', modifiedTime: '2026-10-18T12:00:00Z', size: 1150000, url: 'assets/demo/2026-2 Bundesbote SoSe 2026.pdf' },
  { id: 'z2026-1', name: '2026-1 Bundesbote WiSe 2025-26.pdf', createdTime: '2026-04-10T10:00:00Z', modifiedTime: '2026-10-18T12:00:00Z', size: 1150000, url: 'assets/demo/2026-1 Bundesbote WiSe 2025-26.pdf' },
  { id: 'z2025-2', name: '2025-2 Bundesbote SoSe 2025.pdf', createdTime: '2025-10-08T10:00:00Z', modifiedTime: '2026-10-18T12:00:00Z', size: 1150000, url: 'assets/demo/2025-2 Bundesbote SoSe 2025.pdf' },
];

// DS-Zeitung: fiktive Beispielausgaben (tools/make_demo_ds.py)
export const DEMO_DS_ISSUES = [
  { id: 'ds2026-2', name: '2026-2 DS-Zeitung.pdf', createdTime: '2026-09-15T10:00:00Z', modifiedTime: '2026-10-20T12:00:00Z', size: 58286, url: 'assets/demo/ds/2026-2 DS-Zeitung.pdf' },
  { id: 'ds2026-1', name: '2026-1 DS-Zeitung.pdf', createdTime: '2026-03-20T10:00:00Z', modifiedTime: '2026-10-20T12:00:00Z', size: 57250, url: 'assets/demo/ds/2026-1 DS-Zeitung.pdf' },
];

/* ------------------------------------------------------------------ Liedermappe */
// Fiktive Beispiellieder (tools/make_demo_lieder.py): Name wie in Google Drive, Unterordner = Rubrik
const SONGS = [
  ['Kommerslieder', '001 Morgenlied der Füxe.pdf', 'morgenlied.pdf'],
  ['Kommerslieder', '002 Vom alten Haus am Fluss.pdf', 'altes-haus.pdf'],
  ['Kommerslieder', '003 Rundgesang (Scan).jpg', 'rundgesang.jpg'],
  ['Volkslieder', '010 Abendlied am Ufer.pdf', 'abendlied.pdf'],
  ['Volkslieder', '011 Wanderlied.pdf', 'wanderlied.pdf'],
  ['Festlieder', '020 Ständchen zum Stiftungsfest.pdf', 'staendchen.pdf'],
];
export const DEMO_SONGS = SONGS.map(([folder, name, file], i) => ({
  id: `lied${i + 1}`, name, path: [folder], mimeType: file.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf',
  modifiedTime: '2026-10-18T12:00:00Z', url: `assets/demo/lieder/${file}`,
}));

/* ------------------------------------------------------------------ Galerie */
const GALLERY = [
  ['2026-06 Stiftungsfest', ['01 Festkommers', '02 Ballabend', '03 Begrüßungsabend im Garten', '04 Frühschoppen'], '2026-06-27'],
  ['2026-05 Semesterprogramm', ['01 Kanutour', '02 Fußballturnier', '03 Vortragsabend', '04 Krambambuli-Abend'], '2026-05-30'],
  ['2025-12 Haus & Garten', ['01 Das Haus im Winter', '02 Garten im Sommer', '03 Neue Küche'], '2025-12-12'],
];

export function buildGallery() {
  return GALLERY.map(([album, names, date], a) => ({
    id: `album${a + 1}`,
    title: album,
    path: [album.slice(0, 4)], // Jahresordner – für die Ordneransicht
    photos: names.map((n, i) => {
      const url = encodeURI(`assets/demo/galerie/${album}/${n}.webp`);
      return { id: `album${a + 1}-${i + 1}`, name: n.replace(/^\d+\s+/, ''), thumb: url, url, width: 1200, height: 800, taken: `${date}T18:00:00Z` };
    }),
  }));
}
