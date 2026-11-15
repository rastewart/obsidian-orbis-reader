// The generated fixture books — each one named for the case it covers, none of them a real book.
//
// **A book's title is its file name in words, and its author is the invented Orbis Tester** — `parts-and-chapters.epub`
// is *Parts and Chapters*, by Orbis Tester — so the book on screen, the file in the folder and the Library note all say
// the same thing. Every book also says what it is: its publisher, its description and the line on its cover (see
// `FIXTURE_PUBLISHER` and `cover`). The books reproduce the STRUCTURES Orbis has to handle — how a contents page is shaped, which files it
// reaches, how chapters share files — because those are what the code is written against. The text is incidental and
// invented (see `prose.ts`); it only has to be readable and of the right length.
//
// What each book is for is said above it, with the tests or manual steps that depend on it. `chapter-rows.test.ts`
// reads the shapes of most of them through `book-shapes.json`, which `build-fixtures.ts` writes from these books.

import { zipSync } from 'fflate';
import { buildEpub, type EpubSection, xhtmlDocument } from '../../src/epub-builder';
import { buildFixtureEpub, type EpubFile, type EpubSpec, type NavEntry, xhtml } from './epub';
import { buildFb2, type Fb2Section } from './fb2';
import { FIXTURE_COVER_LINE, FIXTURE_PUBLISHER } from './marker';
import { cover, plate, png } from './png';
import { esc, proseFrom, ps } from './prose';

/** Deliberately plain: the reader supplies the typography, and a fixture should not fight it. */
export const CSS = 'p { margin: 0 0 0.6em; }\nh1, h2, h3 { text-align: center; }\n';
export const css = (): EpubFile => ({ path: 'style.css', mediaType: 'text/css', content: CSS });
export const page = (path: string, title: string, body: string): EpubFile => ({
  path,
  mediaType: 'application/xhtml+xml',
  content: xhtml(title, body),
});

/** A cover image and the wrapper page most real books put it on — the wrapper sits in the spine with no entry. */
export function coverFiles(palette: number, title: string): EpubFile[] {
  return [
    { path: 'cover.png', mediaType: 'image/png', content: cover(palette, title, ['EPUB']) },
    page('cover.xhtml', 'Cover', '<div class="cover"><img src="cover.png" alt="Cover"/></div>'),
  ];
}

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const WORDS = [
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
];

/**
 * Every fixture's author: invented, and plainly a label, but in two parts, because the Library's tests compare "First
 * Last" with "Last, First" and sort by surname.
 */
export const AUTHOR = { name: 'Orbis Tester', fileAs: 'Tester, Orbis' };
const SERIES = 'Orbis Reader Fixtures';

/** A fixture's title: its file name in words. `parts-and-chapters.epub` → "Parts and Chapters". */
export function titleFromFile(file: string): string {
  const small = new Set(['and', 'of', 'the', 'a', 'in', 'to']);
  return file
    .replace(/\.[^.]+$/, '')
    .split('-')
    .map((w, i) => {
      if (/^fb2$/i.test(w)) return 'FB2';
      const lower = w.toLowerCase();
      return i > 0 && small.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export interface Built {
  /** File name in `test-vault/fixtures/`. */
  file: string;
  bytes: Uint8Array;
  /** Whether its shape goes into `book-shapes.json`. */
  shape: boolean;
  /** For the Library title note, when it gets one. */
  title?: string;
  authors?: string[];
  cover?: Uint8Array;
  /** The cover's palette, so a title note listing several formats can draw one naming them all. */
  palette?: number;
}

export function epub(file: string, spec: EpubSpec, palette?: number): Built {
  const coverImage = spec.coverImage ? spec.files.find((f) => f.path === spec.coverImage)?.content : undefined;
  return {
    file,
    bytes: buildFixtureEpub(spec),
    shape: true,
    title: spec.title,
    authors: spec.creators.map((c) => c.name),
    cover: coverImage instanceof Uint8Array ? coverImage : undefined,
    palette,
  };
}

/**
 * First open: a plain novel, long enough that building its locations visibly takes a moment.
 *
 * The manual plans open it fresh (no `!orbis-data` yet) to watch the load stages, and the file name is mixed-case on
 * purpose: reading-record paths keep the book's file name exactly, so a lower-cased copy would be a different book.
 * Twelve chapters, one per file, about 15,000 characters each.
 */
export function firstOpen(): Built {
  const p = proseFrom(101);
  const names = [
    'The Weir',
    'Low Water',
    'The Tollkeeper',
    'A Letter from the Mill',
    'Market Day',
    'The Flood Gate',
    'Night Crossing',
    'The Survey',
    'Two Lanterns',
    'The Long Field',
    'Harvest Moon',
    'Home Again',
  ];
  const chapters = names.map((name, i) => {
    const title = `Chapter ${WORDS[i]}: ${name}`;
    return page(
      `chapter-${String(i + 1).padStart(2, '0')}.xhtml`,
      title,
      `<h2 id="ch">${esc(title)}</h2>\n${ps(p.paragraphsOf(15000))}`
    );
  });
  const files = [...coverFiles(0, titleFromFile('First-Open.epub')), css(), ...chapters];
  return epub(
    'First-Open.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: titleFromFile('First-Open.epub'),
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:first-open',
      date: '2026-03-28',
      files,
      spine: [{ path: 'cover.xhtml' }, ...chapters.map((c) => ({ path: c.path }))],
      nav: chapters.map((c, i) => ({ label: `Chapter ${WORDS[i]}: ${names[i]}`, href: `${c.path}#ch` })),
      coverImage: 'cover.png',
    },
    0
  );
}

/**
 * The annotation workhorse — highlights, notes, search, pages, the Data view — and the contents shape where a
 * top-level entry CONTAINS the chapters.
 *
 * Two top-level entries in the first file: the full title, and the short title as a heading, with all 26 chapters
 * under it spread over five files, several to a file. As "a top-level entry and its subtree" that would be one row
 * for the whole book; `containsChapters` opens it, so the exports list 28 rows (`chapter-rows.test.ts`). Every
 * chapter mentions the lantern, so a search for it returns results in every chapter.
 */
export function annotationWorkhorse(): Built {
  const p = proseFrom(202);
  const names = [
    'A HOME BY THE WEIR',
    'THE FIRST LANTERN',
    'THE NIGHT FERRY',
    'A QUARREL AT MARKET',
    'THE SURVEYOR',
    'MENDING THE NETS',
    'THE LONG WINTER',
    'A LETTER ARRIVES',
    'THE BELL TOWER',
    'SPRING TIDES',
    'THE LOST LEDGER',
    'A VISIT TO KETTLEBY',
    'THE HARBOR WALL',
    'THE ORCHARD GATE',
    'A DAY OF RAIN',
    'THE BOATHOUSE',
    'FAIR WEATHER',
    'THE NEW KEEPER',
    'A SUPPER IN THE KITCHEN',
    'THE FOOTBRIDGE',
    'A STORM FROM THE EAST',
    'THE MILL RACE',
    // Every name unique, and none equal to the title heading they sit under: a repeated name makes the parent lend its
    // name to all of its children, which is a different case (see `flattenTocWithDisambiguation`).
    'LAMPLIGHT',
    'THE LAST FERRY',
    "THE KEEPERS' RETURN",
    'AFTERWORD',
  ];
  const files: EpubFile[] = [...coverFiles(1, titleFromFile('annotation-workhorse.epub')), css()];
  const nav: NavEntry[] = [];
  const children: NavEntry[] = [];
  for (let f = 0; f < 5; f++) {
    const inFile = names.slice(f * 5, f === 4 ? 26 : f * 5 + 5);
    const path = `text-${f}.xhtml`;
    const head =
      f === 0
        ? '<h1 id="title">ANNOTATION WORKHORSE: A SAMPLE BOOK</h1>\n<h2 id="head">ANNOTATION WORKHORSE</h2>\n'
        : '';
    const body = inFile
      .map((name, k) => {
        const n = f * 5 + k + 1;
        children.push({ label: name, href: `${path}#c${n}` });
        return `<h2 id="c${n}">${esc(name)}</h2>\n${ps(p.paragraphsOf(6000, 'lantern'))}`;
      })
      .join('\n');
    files.push(page(path, titleFromFile('annotation-workhorse.epub'), head + body));
  }
  nav.push({ label: 'ANNOTATION WORKHORSE: A SAMPLE BOOK', href: 'text-0.xhtml#title' });
  nav.push({ label: 'ANNOTATION WORKHORSE', href: 'text-0.xhtml#head', children });
  return epub(
    'annotation-workhorse.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: titleFromFile('annotation-workhorse.epub'),
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:annotation-workhorse',
      date: '2026-08-01',
      files,
      spine: [{ path: 'cover.xhtml' }, ...[0, 1, 2, 3, 4].map((f) => ({ path: `text-${f}.xhtml` }))],
      nav,
      coverImage: 'cover.png',
    },
    1
  );
}

/**
 * Parts and chapters, flat: PART and CHAPTER entries at the same rank, and "CHAPTER I" in every part.
 *
 * The manual plans use it to check that a chapter picker can take one "CHAPTER I" and not another, and chapter names
 * read "Book: PART II – CHAPTER I". Built the way many books are: the title page's heading is the book's name in
 * capitals (a section named only that keeps the name alone); PART I has a file of its own; each later part shares a
 * file with its first chapter, so that file carries two headings; the epilogue has two sections nested one rank below
 * it. It also has a twin FB2 with the same title and author (`partsAndChaptersFb2`) and is the source of the AZW3
 * fixture.
 */
/** One heading of `partsAndChaptersBook` and the text under it. `nested` puts it one rank below the heading before. */
interface BookPart {
  heading: { id: string; tag: 'h1' | 'h2' | 'h3'; text: string; nested?: boolean };
  paragraphs: string[];
}

/** One file of the EPUB: its title and the headings in it, in reading order. */
interface BookPage {
  path: string;
  title: string;
  parts: BookPart[];
}

/**
 * *Parts and Chapters* as content, before it is any format: the pages, the headings in each, and the text under them.
 *
 * The EPUB and the FB2 are both written from this, so they are one book in two formats — the same contents in the
 * same order and the same text, word for word — which is what the format twins exist to compare: positions, marks,
 * and which edition the Library opens. (The AZW3 matches too, being Calibre's conversion of the EPUB.)
 */
function partsAndChaptersBook(): { title: string; pages: BookPage[] } {
  const p = proseFrom(303);
  const TITLE = titleFromFile('parts-and-chapters.epub');
  const CAPS = TITLE.toUpperCase();
  const h = (
    id: string,
    tag: BookPart['heading']['tag'],
    text: string,
    paragraphs: string[] = [],
    nested = false
  ): BookPart => ({
    heading: { id, tag, text, nested },
    paragraphs,
  });
  // The prose is drawn in reading order, and the order is what fixes the text: reorder these calls and every word
  // after the change moves, which would also make the committed AZW3 stop matching its source.
  const pages: BookPage[] = [
    {
      path: 'title.xhtml',
      title: TITLE,
      parts: [h('title', 'h1', CAPS), h('note', 'h3', 'A NOTE ON THE TEXT', p.paragraphsOf(900))],
    },
    { path: 'preface.xhtml', title: 'Preface', parts: [h('preface', 'h2', 'PREFACE', p.paragraphsOf(2500))] },
  ];
  [6, 5, 5, 4, 4, 5].forEach((count, pi) => {
    const part = `PART ${ROMAN[pi]}`;
    if (pi === 0)
      pages.push({ path: 'part-1.xhtml', title: part, parts: [h('half', 'h1', CAPS), h('part', 'h2', part)] });
    for (let c = 0; c < count; c++) {
      const chapter = `CHAPTER ${ROMAN[c]}`;
      const parts = pi > 0 && c === 0 ? [h('part', 'h2', part)] : [];
      parts.push(h('ch', 'h2', chapter, p.paragraphsOf(4000)));
      pages.push({ path: `part-${pi + 1}-chapter-${c + 1}.xhtml`, title: `${part} – ${chapter}`, parts });
    }
  });
  pages.push({
    path: 'epilogue.xhtml',
    title: 'Epilogue',
    parts: [
      h('epi', 'h2', 'EPILOGUE'),
      h('i', 'h3', 'I', p.paragraphsOf(3000), true),
      h('ii', 'h3', 'II', p.paragraphsOf(3000), true),
    ],
  });
  pages.push({
    path: 'about.xhtml',
    title: 'About this edition',
    parts: [h('about', 'h2', 'ABOUT THIS EDITION', p.paragraphsOf(700))],
  });
  return { title: TITLE, pages };
}

export function partsAndChapters(): Built {
  const book = partsAndChaptersBook();
  const files: EpubFile[] = [...coverFiles(2, book.title), css()];
  const nav: NavEntry[] = [];
  for (const pg of book.pages) {
    const body = pg.parts
      .map(({ heading: hd, paragraphs }) => {
        const tag = `<${hd.tag} id="${hd.id}">${esc(hd.text)}</${hd.tag}>`;
        return paragraphs.length ? `${tag}\n${ps(paragraphs)}` : tag;
      })
      .join('\n');
    files.push(page(pg.path, pg.title, body));
    for (const { heading: hd } of pg.parts) {
      const entry = { label: hd.text, href: `${pg.path}#${hd.id}` };
      const parent = nav[nav.length - 1];
      if (hd.nested && parent) (parent.children ??= []).push(entry);
      else nav.push(entry);
    }
  }
  return epub(
    'parts-and-chapters.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: book.title,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:parts-and-chapters',
      date: '2006-03-28',
      files,
      spine: [{ path: 'cover.xhtml' }, ...book.pages.map((pg) => ({ path: pg.path }))],
      nav,
      coverImage: 'cover.png',
    },
    2
  );
}

/**
 * Volumes: chapter numbering that restarts in each volume, and files that hold several chapters and cross volumes.
 *
 * Each volume opens with a pair of half-title entries (the title with a colon, then with a full stop), the volume
 * label nested one rank below; the third volume also lists a plate. Four image pages follow the last entry with no
 * entry of their own, so the exports have spine sections the contents never reaches (`chapter-rows.test.ts`).
 */
export function volumes(): Built {
  const p = proseFrom(404);
  const TITLE = titleFromFile('volumes.epub');
  const CAPS = TITLE.toUpperCase();
  const files: EpubFile[] = [...coverFiles(3, TITLE), css()];
  const nav: NavEntry[] = [];
  // Which chapters of which volume go in which file: volumes cross file boundaries, as they do in real books.
  const layout: { vol: number; ch: number }[][] = [
    [
      { vol: 1, ch: 1 },
      { vol: 1, ch: 2 },
      { vol: 1, ch: 3 },
      { vol: 1, ch: 4 },
      { vol: 1, ch: 5 },
    ],
    [
      { vol: 1, ch: 6 },
      { vol: 1, ch: 7 },
      { vol: 1, ch: 8 },
      { vol: 2, ch: 1 },
      { vol: 2, ch: 2 },
    ],
    [
      { vol: 2, ch: 3 },
      { vol: 2, ch: 4 },
      { vol: 2, ch: 5 },
      { vol: 2, ch: 6 },
      { vol: 2, ch: 7 },
    ],
    [
      { vol: 2, ch: 8 },
      { vol: 3, ch: 1 },
      { vol: 3, ch: 2 },
      { vol: 3, ch: 3 },
      { vol: 3, ch: 4 },
    ],
    [
      { vol: 3, ch: 5 },
      { vol: 3, ch: 6 },
      { vol: 3, ch: 7 },
      { vol: 3, ch: 8 },
    ],
  ];
  layout.forEach((chapters, f) => {
    const path = `text-${f}.xhtml`;
    let body = '';
    for (const { vol, ch } of chapters) {
      if (ch === 1) {
        body += `<h1 id="v${vol}a">${esc(CAPS)}:</h1>\n<h1 id="v${vol}b">${esc(CAPS)}.</h1>\n`;
        const kids: NavEntry[] = [];
        if (vol > 1) {
          body += `<h2 id="v${vol}">VOL. ${ROMAN[vol - 1]}.</h2>\n`;
          kids.push({ label: `VOL. ${ROMAN[vol - 1]}.`, href: `${path}#v${vol}` });
        }
        if (vol === 3) {
          body += '<p id="plate"><img src="plate-1.png" alt="A view of the market cross"/></p>\n';
          kids.push({ label: 'A VIEW OF THE MARKET CROSS', href: `${path}#plate` });
        }
        nav.push({ label: `${CAPS}:`, href: `${path}#v${vol}a` });
        nav.push({ label: `${CAPS}.`, href: `${path}#v${vol}b`, children: kids.length ? kids : undefined });
      }
      body += `<h2 id="v${vol}c${ch}">CHAPTER ${ROMAN[ch - 1]}.</h2>\n${ps(p.paragraphsOf(2500))}\n`;
      nav.push({ label: `CHAPTER ${ROMAN[ch - 1]}.`, href: `${path}#v${vol}c${ch}` });
    }
    if (f === 4) {
      body += `<h2 id="licence">ABOUT THIS EDITION</h2>\n${ps(p.paragraphsOf(500))}\n`;
      nav.push({ label: 'ABOUT THIS EDITION', href: `${path}#licence` });
    }
    files.push(page(path, TITLE, body));
  });
  const plates = [1, 2, 3, 4].map((n) => {
    // Plate 1 is the one the text shows — the market cross — so it carries a cross; the rest carry their number.
    files.push({ path: `plate-${n}.png`, mediaType: 'image/png', content: plate(n, n === 1 ? '+' : String(n)) });
    const wrapper = page(`plate-${n}.xhtml`, `Plate ${n}`, `<div><img src="plate-${n}.png" alt="Plate ${n}"/></div>`);
    files.push(wrapper);
    return wrapper.path;
  });
  return epub(
    'volumes.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:volumes',
      date: '2013-05-09',
      files,
      spine: [
        { path: 'cover.xhtml' },
        ...layout.map((_, f) => ({ path: `text-${f}.xhtml` })),
        ...plates.map((path) => ({ path })),
      ],
      nav,
      coverImage: 'cover.png',
    },
    3
  );
}

/**
 * The layout Calibre writes: the package document at the root, `titlepage.xhtml` plus `index_split_NNN.html`, an NCX
 * and no nav document (EPUB 2), and a contents list that is not in reading order.
 *
 * The chapters are listed first although three files come before them; an illustration is reached by a `#filepos`
 * fragment, the only fragment in the contents; the title page, the first two splits and a short half-title (the title
 * in capitals) are never listed.
 */
export function calibreSplit(): Built {
  const p = proseFrom(505);
  const TITLE = titleFromFile('calibre-split.epub');
  const split = (n: number) => `index_split_${String(n).padStart(3, '0')}.html`;
  const cal = (title: string, body: string): string =>
    xhtml(title, body, '<link rel="stylesheet" type="text/css" href="stylesheet.css"/>').replace(
      '<body>',
      '<body class="calibre">'
    );
  const para = (text: string) => `<p class="calibre1">${esc(text)}</p>`;
  const files: EpubFile[] = [
    {
      path: 'stylesheet.css',
      mediaType: 'text/css',
      content: '.calibre { display: block; }\n.calibre1 { margin: 0 0 0.5em; }\n',
    },
    { path: 'cover.png', mediaType: 'image/png', content: cover(4, TITLE, ['EPUB']) },
    {
      path: 'titlepage.xhtml',
      mediaType: 'application/xhtml+xml',
      content: cal('Cover', '<div><img src="cover.png" alt=""/></div>'),
    },
  ];
  const bodies: Record<number, string> = {
    0: `<h1 class="calibre2">${esc(TITLE.toUpperCase())}</h1>\n${para('A record kept over one year.')}`,
    1: para('For the ferry keepers, who were always patient with questions.'),
    2: `${p.paragraphsOf(1200).map(para).join('\n')}\n<p class="calibre1"><a id="filepos3082"></a><img src="cover.png" alt="The mill in winter"/></p>\n${p.paragraphsOf(800).map(para).join('\n')}`,
    3: `<h2 class="calibre3">INTRODUCTION</h2>\n${p.paragraphsOf(3000).map(para).join('\n')}`,
    4: `<h2 class="calibre3">FOREWORD</h2>\n${p.paragraphsOf(2000).map(para).join('\n')}`,
    5: `<p class="calibre4">${esc(TITLE.toUpperCase())}</p>`,
    6: `<h2 class="calibre3">CHAPTER I</h2>\n${p.paragraphsOf(5000).map(para).join('\n')}`,
    7: `<h2 class="calibre3">CHAPTER II.</h2>\n${p.paragraphsOf(5000).map(para).join('\n')}`,
    8: `<h2 class="calibre3">CHAPTER III</h2>\n${p.paragraphsOf(5000).map(para).join('\n')}`,
    9: `<h2 class="calibre3">APPENDIX A</h2>\n${p.paragraphsOf(1500).map(para).join('\n')}`,
    10: `<h2 class="calibre3">APPENDIX B</h2>\n${p.paragraphsOf(1500).map(para).join('\n')}`,
    11: `<h2 class="calibre3">APPENDIX C</h2>\n${p.paragraphsOf(1500).map(para).join('\n')}`,
  };
  for (let n = 0; n < 12; n++)
    files.push({ path: split(n), mediaType: 'application/xhtml+xml', content: cal(TITLE, bodies[n]) });
  return epub(
    'calibre-split.epub',
    {
      version: 2,
      opfDir: '',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:calibre-split',
      series: { name: SERIES, index: 1 },
      files,
      spine: [{ path: 'titlepage.xhtml' }, ...Array.from({ length: 12 }, (_, n) => ({ path: split(n) }))],
      nav: [
        { label: 'CHAPTER I', href: split(6) },
        { label: 'CHAPTER II.', href: split(7) },
        { label: 'CHAPTER III', href: split(8) },
        { label: 'The mill in winter', href: `${split(2)}#filepos3082` },
        { label: 'INTRODUCTION', href: split(3) },
        { label: 'FOREWORD', href: split(4) },
        { label: 'APPENDIX A', href: split(9) },
        { label: 'APPENDIX B', href: split(10) },
        { label: 'APPENDIX C', href: split(11) },
      ],
      coverImage: 'cover.png',
    },
    4
  );
}

/**
 * Many chapters to a file, under a running header.
 *
 * Seven files hold more than thirty top-level entries. Most of them are the book's running header — its title in
 * capitals — with the next day's reading nested under it, so siblings share one name and are told apart by a child.
 * Labels carry printed-page markers (`[p11]`), and the notes at the back nest three deep. The exports must offer
 * every top-level entry as its own row (`chapter-rows.test.ts`: more than thirty).
 */
export function runningHeader(): Built {
  const p = proseFrom(606);
  const TITLE = titleFromFile('running-header.epub');
  const HEADER = `${TITLE.toUpperCase()}.`;
  const ORD = [
    'First',
    'Second',
    'Third',
    'Fourth',
    'Fifth',
    'Sixth',
    'Seventh',
    'Eighth',
    'Ninth',
    'Tenth',
    'Eleventh',
    'Twelfth',
    'Thirteenth',
    'Fourteenth',
    'Fifteenth',
    'Sixteenth',
    'Seventeenth',
    'Eighteenth',
    'Nineteenth',
    'Twentieth',
    'Twenty-first',
    'Twenty-second',
    'Twenty-third',
    'Twenty-fourth',
    'Twenty-fifth',
    'Twenty-sixth',
    'Twenty-seventh',
    'Twenty-eighth',
    'Twenty-ninth',
    'Thirtieth',
    'Thirty-first',
  ];
  const THEMES = ['The Lamp', 'Waiting', 'The Open Door', 'Small Things', 'The Tide', 'Keeping Watch', 'Rest'];
  const files: EpubFile[] = [css()];
  const nav: NavEntry[] = [];
  let pageNo = 3;
  files.push(
    page(
      'front.xhtml',
      TITLE,
      `<h1 id="title">${esc(TITLE.toUpperCase())}</h1>\n<h2 id="preface">PREFACE.</h2>\n${ps(p.paragraphsOf(1500))}\n<h2 id="contents">CONTENTS.</h2>`
    )
  );
  nav.push({ label: `[p${pageNo++}] PREFACE.`, href: 'front.xhtml#preface' });
  const contents: NavEntry = { label: `[p${pageNo++}] CONTENTS.`, href: 'front.xhtml#contents', children: [] };
  nav.push(contents);
  // Days 1–31 over five files; the first sits under CONTENTS., every later one under a running header.
  for (let d = 0; d < 31; d++) {
    const f = 1 + Math.floor(d / 7);
    const path = `days-${f}.xhtml`;
    let file = files.find((x) => x.path === path);
    if (!file) {
      file = page(path, TITLE, '');
      files.push(file);
    }
    const day = `[p${pageNo}] ${ORD[d]} Day. ${THEMES[d % THEMES.length]}`;
    const header = d === 0 ? '' : `<h2 id="h${d}">${esc(HEADER)}</h2>\n`;
    const body = `${header}<h3 id="d${d}">${esc(`${ORD[d]} Day. ${THEMES[d % THEMES.length]}`)}</h3>\n${ps(p.paragraphsOf(1800))}\n`;
    file.content = (file.content as string).replace('</body>', `${body}</body>`);
    if (d === 0) contents.children?.push({ label: day, href: `${path}#d${d}` });
    else
      nav.push({
        label: `[p${pageNo}] ${HEADER}`,
        href: `${path}#h${d}`,
        children: [{ label: day, href: `${path}#d${d}` }],
      });
    pageNo += 4;
  }
  const notes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const noteBody = notes
    .map(
      (n, i) =>
        `<h3 id="n${n}">NOTE ${n}.</h3>\n${i % 3 === 0 ? `<h4 id="s${n}">${esc(THEMES[i])}</h4>\n` : ''}${ps(p.paragraphsOf(900))}`
    )
    .join('\n');
  files.push(page('notes.xhtml', 'Notes', `<h2 id="notes">NOTES.</h2>\n${noteBody}`));
  nav.push({
    label: `[p${pageNo}] NOTES. Contents`,
    href: 'notes.xhtml#notes',
    children: notes.map((n, i) => ({
      label: `NOTE ${n}.`,
      href: `notes.xhtml#n${n}`,
      children: i % 3 === 0 ? [{ label: THEMES[i], href: `notes.xhtml#s${n}` }] : undefined,
    })),
  });
  const spine = files.filter((f) => f.path.endsWith('.xhtml')).map((f) => ({ path: f.path }));
  return epub('running-header.epub', {
    version: 3,
    opfDir: 'OEBPS',
    title: TITLE,
    creators: [AUTHOR],
    identifier: 'urn:orbis-fixture:running-header',
    files,
    spine,
    nav,
  });
}

/**
 * Numbered chapters, one per file: "1 The Lamplighter", and one chapter continued under the same name with
 * "(contd.)". Also a contents entry for the contents page itself, transcriber's notes and a license at the back.
 */
export function numberedChapters(): Built {
  const p = proseFrom(707);
  const TITLE = titleFromFile('numbered-chapters.epub');
  const names = [
    'The Lamplighter',
    'A Missing Key',
    'The Night Coach',
    'Questions at the Inn',
    'The Ledger',
    'A Second Visitor',
    'The Footprints',
    'An Alibi',
    'The Weir',
    'Market Gossip',
    'A Letter Burned',
    'The Flood',
    'The Flood (contd.)',
    'The Keeper Speaks',
    'A False Trail',
    'The Mill at Dawn',
    'Confession',
    'The Tollhouse Again',
    'Loose Ends',
    'Home',
  ];
  const files: EpubFile[] = [css()];
  const nav: NavEntry[] = [];
  files.push(page('title.xhtml', TITLE, `<h1 id="t">${esc(TITLE)}</h1>`));
  nav.push({ label: TITLE, href: 'title.xhtml#t' });
  files.push(
    page(
      'contents.xhtml',
      'Contents',
      `<h2 id="c">Contents</h2>\n${names.map((n, i) => `<p>${i + 1} ${esc(n)}</p>`).join('\n')}`
    )
  );
  nav.push({ label: 'Contents', href: 'contents.xhtml#c' });
  names.forEach((name, i) => {
    const path = `chapter-${i + 1}.xhtml`;
    files.push(page(path, name, `<h2 id="c">${i + 1} ${esc(name)}</h2>\n${ps(p.paragraphsOf(3500))}`));
    nav.push({ label: `${i + 1} ${name}`, href: `${path}#c` });
  });
  files.push(
    page('notes.xhtml', "Transcriber's Notes", `<h2 id="n">Transcriber's Notes</h2>\n${ps(p.paragraphsOf(600))}`)
  );
  nav.push({ label: "Transcriber's Notes", href: 'notes.xhtml#n' });
  files.push(
    page('about.xhtml', 'About This Edition', `<h2 id="a">About This Edition</h2>\n${ps(p.paragraphsOf(600))}`)
  );
  nav.push({ label: 'About This Edition', href: 'about.xhtml#a' });
  return epub('numbered-chapters.epub', {
    version: 3,
    opfDir: 'OEBPS',
    title: TITLE,
    creators: [AUTHOR],
    identifier: 'urn:orbis-fixture:numbered-chapters',
    files,
    spine: files.filter((f) => f.path.endsWith('.xhtml')).map((f) => ({ path: f.path })),
    nav,
  });
}

/**
 * Books Orbis makes from notes, through its own `buildEpub` — the shape Read in Orbis Reader and Notes to EPUB produce.
 *
 * `converted-note`: one note, so one file and one entry with its headings under it; it must stay one row, not open
 * into its headings. `converted-folder`: a folder of 39 notes, one file each, 434 entries in all — a deep contents
 * with a small top level. The notes are invented; only the shape is that of a folder of design docs.
 */
function convertedBook(file: string, title: string, seed: number, sectionCounts: number[]): Built {
  const p = proseFrom(seed);
  const sections: EpubSection[] = sectionCounts.map((headings, s) => {
    const id = `sect${s + 1}`;
    const name =
      sectionCounts.length === 1
        ? title
        : `${String(s + 1).padStart(3, '0')} ${p.pick(['Survey', 'Field notes', 'Ledger', 'Visit', 'Plan', 'Report'])} ${s + 1}`;
    const children = Array.from({ length: headings }, (_, h) => ({
      anchor: `h-${s + 1}-${h + 1}`,
      title: `Heading ${h + 1}`,
    }));
    const body = [
      `<h1>${esc(name)}</h1>`,
      ps(p.paragraphsOf(600)),
      ...children.map((c) => `<h2 id="${c.anchor}">${esc(c.title)}</h2>\n${ps(p.paragraphsOf(400))}`),
    ].join('\n');
    return { id, title: name, xhtml: xhtmlDocument(name, 'en', body), children };
  });
  const bytes = buildEpub(
    {
      title,
      author: AUTHOR.name,
      language: 'en',
      identifier: `urn:orbis-fixture:${file}`,
      modified: '2026-01-01T00:00:00Z',
      // Orbis's own converter takes no description, so the publisher alone says what this book is.
      publisher: FIXTURE_PUBLISHER,
    },
    sections
  );
  return { file, bytes, shape: true };
}

export function convertedNote(): Built {
  return convertedBook('converted-note.epub', titleFromFile('converted-note.epub'), 808, [9]);
}

export function convertedFolder(): Built {
  // 39 notes, 395 headings under them: five notes with eleven headings, the rest with ten.
  return convertedBook(
    'converted-folder.epub',
    titleFromFile('converted-folder.epub'),
    909,
    Array.from({ length: 39 }, (_, i) => (i < 5 ? 11 : 10))
  );
}

/**
 * The FB2 twin of `partsAndChapters`: the same book, from the same `partsAndChaptersBook`, in the same folder. The
 * Library shows one work held twice, and names the second title note "… (2)".
 *
 * One FB2 section per heading, in the same order, so the contents list the same entries at the same rank as the EPUB —
 * PART and CHAPTER flat, the epilogue's two sections nested under it. No body title: the EPUB's contents begin with its
 * title page's heading, and foliate would list a body title as an extra first entry.
 */
export function partsAndChaptersFb2(): Built {
  const book = partsAndChaptersBook();
  const c = cover(2, book.title, ['FB2']);
  const sections: Fb2Section[] = [];
  for (const { heading, paragraphs } of book.pages.flatMap((pg) => pg.parts)) {
    const s: Fb2Section = { title: heading.text, paragraphs };
    const parent = sections[sections.length - 1];
    if (heading.nested && parent) (parent.sections ??= []).push(s);
    else sections.push(s);
  }
  const bytes = buildFb2({
    title: book.title,
    authors: [{ first: 'Orbis', last: 'Tester' }],
    year: '2006',
    bodyTitle: false,
    sections,
    cover: c,
  });
  return {
    file: 'parts-and-chapters.fb2',
    bytes,
    shape: false,
    title: book.title,
    authors: [AUTHOR.name],
    cover: c,
    palette: 2,
  };
}

/** An FB2 with a maker's nickname in its document info, a publication year and a series. */
export function fb2Sample(): Built {
  const p = proseFrom(1101);
  const title = titleFromFile('fb2-sample.fb2');
  const c = cover(1, title, ['FB2']);
  const bytes = buildFb2({
    title,
    authors: [{ first: 'Orbis', last: 'Tester' }],
    maker: 'orbis-fixtures',
    year: '2011',
    series: { name: SERIES, number: 2 },
    sections: ['Chapter One', 'Chapter Two', 'Chapter Three', 'Chapter Four', 'Chapter Five', 'Chapter Six'].map(
      (t) => ({
        title: t,
        paragraphs: p.paragraphsOf(2500),
      })
    ),
    cover: c,
  });
  return { file: 'fb2-sample.fb2', bytes, shape: false, title, authors: [AUTHOR.name], cover: c, palette: 1 };
}

/**
 * A comic: six page images, the first one landscape, and no metadata at all — so its title is its file name and its
 * cover is the first page.
 */
export function sampleComic(): Built {
  const at = { mtime: Date.UTC(1980, 6, 1, 12) };
  const pages: Record<string, [Uint8Array, typeof at]> = {
    'page-01.png': [
      png(900, 600, [70, 110, 150], [{ from: 0.1, to: 0.45, color: [230, 200, 120] }], 12, [
        { text: 'SAMPLE COMIC', y: 0.53, scale: 8, color: [230, 200, 120] },
        { text: 'CBZ', y: 0.72, scale: 10, color: [230, 200, 120] },
        // A comic has no metadata Orbis reads, so its cover page says what it is.
        { text: FIXTURE_COVER_LINE, y: 0.9, scale: 3, color: [230, 200, 120] },
      ]),
      at,
    ],
  };
  for (let n = 2; n <= 6; n++) {
    pages[`page-${String(n).padStart(2, '0')}.png`] = [
      png(
        600,
        900,
        [235, 232, 225],
        [
          { from: 0.05, to: 0.32, color: [200, 210, 225] },
          { from: 0.36, to: 0.63, color: [225, 210, 200] },
          { from: 0.67, to: 0.95, color: [210, 225, 205] },
        ]
      ),
      at,
    ];
  }
  return {
    file: 'sample-comic.cbz',
    bytes: zipSync(pages),
    shape: false,
    title: 'sample-comic.cbz',
    cover: pages['page-01.png'][0],
  };
}

/**
 * Listening: one chapter long enough to be divided into tracks, between two short enough to record in a minute.
 *
 * The long one is about 70,000 characters, 12,231 words, 79 minutes at the 155 words a minute track lengths are
 * estimated at: over the 60 that divides a chapter, and three even slices of about 26 (`splitLongParts`) — *The Long Night 1 of
 * 3*, *2 of 3*, *3 of 3*. The short ones are under three minutes each, so the Listening test plan can record them,
 * mix them and delete them without waiting. Three files of text and a cover page, so a count of files (four) and a
 * count of tracks (five) disagree, which is what tells a coverage line counting the wrong thing.
 */
export function longChapter(): Built {
  const p = proseFrom(1201);
  const TITLE = titleFromFile('long-chapter.epub');
  const chapters: [string, string, number][] = [
    ['chapter-1.xhtml', 'Chapter One: The Lantern', 2400],
    ['chapter-2.xhtml', 'Chapter Two: The Long Night', 70000],
    ['chapter-3.xhtml', 'Chapter Three: Morning', 2400],
  ];
  const files: EpubFile[] = [...coverFiles(2, TITLE), css()];
  const nav: NavEntry[] = [];
  for (const [path, name, chars] of chapters) {
    files.push(page(path, name, `<h2 id="c">${esc(name)}</h2>\n${ps(p.paragraphsOf(chars))}`));
    nav.push({ label: name, href: `${path}#c` });
  }
  return epub(
    'long-chapter.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:long-chapter',
      files,
      spine: files.filter((f) => f.path.endsWith('.xhtml')).map((f) => ({ path: f.path })),
      nav,
      coverImage: 'cover.png',
    },
    2
  );
}

/**
 * Listening: a book whose contents page names nothing — four files of text, no headings, an empty contents.
 *
 * With nothing to divide by but the files, each file is a track of one chapter named after the book: *No Contents 1
 * of 4* to *4 of 4* (`bookLabel`). Each file is a few minutes, far under the hour that would divide one further.
 */
export function noContents(): Built {
  const p = proseFrom(1301);
  const TITLE = titleFromFile('no-contents.epub');
  const files: EpubFile[] = [css()];
  for (let n = 1; n <= 4; n++) files.push(page(`part-${n}.xhtml`, TITLE, ps(p.paragraphsOf(3000))));
  return epub('no-contents.epub', {
    version: 3,
    opfDir: 'OEBPS',
    title: TITLE,
    creators: [AUTHOR],
    identifier: 'urn:orbis-fixture:no-contents',
    files,
    spine: files.filter((f) => f.path.endsWith('.xhtml')).map((f) => ({ path: f.path })),
    nav: [],
  });
}

/**
 * Listening: what the text rewrites before a voice reads it (`normalizeForSpeech`), for hearing rather than reading.
 *
 * One chapter per rewrite, so each is a track to step to: capitals of two letters, which the caps rule never touches;
 * longer initialisms, which it leaves in capitals for the phonemizer to spell; capitals it turns into words; headings
 * and lines all in capitals, which is what the rule was written for; plurals, possessives and dotted forms; Roman
 * numerals after a heading word; and web and email addresses. The expected reading of every line is in the Listening
 * test plan, not here, since anything in the book is read aloud.
 *
 * **Each case twice** where it is a single token: in a sentence, and as a line of its own. A short input takes another
 * path through the synthesizer — its timing noise is zeroed (`SHORT_INPUT_PHONEMES`) — so a word can sound right in one
 * and wrong in the other. Change a pronunciation glossary entry and play the line again: the cached audio is keyed by
 * the text the voice was given, so a new respelling is synthesized fresh.
 */
export function speechSampler(): Built {
  const TITLE = titleFromFile('speech-sampler.epub');
  /** A case in a sentence, then on its own line. */
  const pairs = (cases: readonly [string, string][]): string =>
    cases.map(([word, sentence]) => `<p>${esc(sentence)}</p>\n<p>${esc(word)}.</p>`).join('\n');
  const chapters: [string, string, string][] = [
    [
      'two-letters.xhtml',
      'Two-Letter Capitals',
      pairs([
        ['AI', 'Ask the AI for help.'],
        ['IT', 'The IT desk is on the second floor.'],
        ['UI', 'The UI has two menus.'],
        ['UX', 'Good UX takes time.'],
        ['ID', 'Show your ID at the door.'],
        ['TV', 'The TV was left on all night.'],
        ['PC', 'The PC would not start.'],
        ['US', 'The US team won the match.'],
        ['AM', 'We left at six AM.'],
        ['OK', 'Everything is OK now.'],
      ]),
    ],
    [
      'initialisms.xhtml',
      'Initialisms',
      pairs([
        ['FBI', 'The FBI opened a file.'],
        ['USA', 'The crate was made in the USA.'],
        ['HTML', 'The page is written in HTML.'],
        ['IBM', 'An IBM keyboard sat on the desk.'],
        ['API', 'The API returns a list of names.'],
        ['GPU', 'The GPU ran hot all afternoon.'],
        ['URL', 'Copy the URL into the box.'],
        ['RIAA', 'The RIAA issued a statement.'],
        ['IEEE', 'The IEEE approved the standard.'],
        ['AWS', 'The site runs on AWS.'],
      ]),
    ],
    [
      'capitals-as-words.xhtml',
      'Capitals Read as Words',
      pairs([
        ['NASA', 'NASA launched a rocket at dawn.'],
        ['FUD', 'That claim is pure FUD.'],
        ['MIT', 'She studied at MIT for a year.'],
        ['CIA', 'The CIA kept the file closed.'],
        ['SCUBA', 'They went SCUBA diving by the harbor.'],
        ['UNESCO', 'UNESCO named the old mill a heritage site.'],
      ]),
    ],
    [
      'headings-in-capitals.xhtml',
      'Headings in Capitals',
      [
        '<h3>CHAPTER ONE</h3>',
        '<p>The heading above is in capitals.</p>',
        '<h3>PROLOGUE</h3>',
        '<p>So is this one.</p>',
        '<h3>THE LONG NIGHT</h3>',
        '<p>IT WAS A DARK NIGHT, AND THE LANTERN WAS OUT.</p>',
        '<p>The sign by the weir read KEEP OUT in red letters.</p>',
        '<p>IT was nearly midnight when the ferry came in.</p>',
        '<p>HENRY VI WAS KING IN THOSE YEARS.</p>',
        '<p>THE END</p>',
      ].join('\n'),
    ],
    [
      'plurals-and-dots.xhtml',
      'Plurals, Possessives and Dots',
      ps([
        'Two AIs disagreed about the weather.',
        "The AI's answer was short.",
        'Check both URLs before you send them.',
        "AWS's prices rose again.",
        'The A.I. was polite to everyone.',
        'The lantern was made in the U.S.A.',
        'Bring a few tools, e.g. a hammer and a saw.',
        'Bring one tool, i.e. the hammer.',
        'She has a Ph.D. in physics.',
        'He has a PhD in history.',
      ]),
    ],
    [
      'roman-numerals.xhtml',
      'Roman Numerals',
      ps([
        'Chapter IV begins at dawn.',
        'Chapter I was the shortest.',
        'Part II is shorter than the first.',
        'Book III ends the story.',
        'Volume XII is missing from the shelf.',
        'Act V, Scene II takes place by the harbor.',
        'Canto IX is the longest of all.',
        'Section XL covers the ferry timetable.',
        'King George III ruled in those years.',
        'Louis XIV built a palace by the harbor.',
        'Emperor Talvar IV ruled the coast for a decade.',
        'After World War II ended, the mill reopened.',
        'Article IV covers the ferry timetable.',
        'Malcolm X spoke in the hall that evening.',
        'I think I can reach the ferry in time.',
      ]),
    ],
    [
      'web-addresses.xhtml',
      'Web and Email Addresses',
      ps([
        'See https://example.com/docs/page?id=42 for the details.',
        'Go to www.example.org before the market closes.',
        'The notes are at example.net/notes/2026 if you need them.',
        'Write to mailto:help@example.com if you get stuck.',
        'Or email help@example.com instead.',
        'Visit example.com for more.',
      ]),
    ],
  ];
  const files: EpubFile[] = [...coverFiles(4, TITLE), css()];
  const nav: NavEntry[] = [];
  for (const [path, name, body] of chapters) {
    files.push(page(path, name, `<h2 id="c">${esc(name)}</h2>\n${body}`));
    nav.push({ label: name, href: `${path}#c` });
  }
  return epub(
    'speech-sampler.epub',
    {
      version: 3,
      opfDir: 'OEBPS',
      title: TITLE,
      creators: [AUTHOR],
      identifier: 'urn:orbis-fixture:speech-sampler',
      files,
      spine: files.filter((f) => f.path.endsWith('.xhtml')).map((f) => ({ path: f.path })),
      nav,
      coverImage: 'cover.png',
    },
    4
  );
}

/** Every fixture, in the order `book-shapes.json` lists them. */
export const ALL = [
  firstOpen,
  annotationWorkhorse,
  partsAndChapters,
  volumes,
  calibreSplit,
  runningHeader,
  numberedChapters,
  convertedNote,
  convertedFolder,
  partsAndChaptersFb2,
  fb2Sample,
  sampleComic,
  longChapter,
  noContents,
  speechSampler,
];
