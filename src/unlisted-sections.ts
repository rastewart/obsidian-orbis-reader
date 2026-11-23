// What a spine file the contents does not list IS — a chapter of its own, or the chapter before it going on — and
// what it is called when its name repeats.
//
// **One answer for every list.** The recording list, Save as Markdown and its dialog, and Save as PDF each decide
// what an unlisted file becomes, and they have disagreed before; these rules are asked once, by the reader view
// (`OrbisReaderView.sectionContinues`), and every list takes that answer. Pure, so they can be tested without a
// book open.

/**
 * Whether a page holds a picture and no text — which, as the book's first page, is its cover (`headingOf`).
 *
 * **Named, where the book does not name it.** An EPUB's cover page and an AZW3's carry `<title>Cover</title>`, but an
 * old MOBI's keeps neither a heading nor a title, so its cover was "Section 1" in every list and in the note it became.
 * Only the FIRST page: a picture alone later in a book is a plate or a map, not a cover — which is why every caller of
 * `headingOf` passes the page's place in the book.
 */
export function isPictureOnly(doc: Document): boolean {
  return !doc.body?.textContent?.trim() && !!doc.body?.querySelector('img, svg, image');
}

/**
 * Whether a section's name says nothing but which book this is — so the section has no name of its own.
 *
 * **Because a running header is not a chapter title.** A publisher's software that splits a long chapter across files
 * leaves each piece with the book's title as its first heading, or with Calibre's generated page title — `Continued,
 * <Title>`, `Unknown`. An unlisted file between chapters that names nothing but the book is the rest of the chapter
 * before it; one with a heading of its own is a real section the navigation does not list.
 *
 * `name` is `headingOf`'s answer — the first heading, or a `<title>` that is not the book's. Deliberately exact:
 * the book's title, the part of it before any subtitle, or a truncation of it (a drop cap reads "T"). A name that
 * STARTS with the book's title and goes on — "<Title>: Phase Three" — says something, and is kept.
 */
export function namesOnlyTheBook(name: string, bookTitle: string): boolean {
  const n = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[®™©]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const x = n(name);
  if (!x) return true;
  if (/^(continued|unknown)\b/.test(x)) return true;
  const book = n(bookTitle);
  const short = n(bookTitle.split(/[(:]/)[0] ?? '');
  return x === book || x === short || (!!book && book.startsWith(x));
}

/**
 * The spine sections that continue the chapter before them rather than being chapters of their own.
 *
 * **The rule: a section no contents entry lands in, with no name of its own, between two sections that do.**
 *
 * - **No name of its own** — see `namesOnlyTheBook`. A section that carries a real heading is a real section the
 *   navigation leaves out (a technical book's "Summary", a history's "CHAPTER ONE"), and stays a chapter. **A heading
 *   that repeats the chapter's own name is no name of its own either.** A technical book lists each chapter's title
 *   page — the publisher's copyright line — and opens the chapter itself in the next, unlisted file under the same
 *   heading, which as a row of its own would read `1. First Steps – 1. First Steps`. **Nor is one that repeats the
 *   heading of the file just before it**: Calibre splits a long chapter into files that each carry the chapter's own
 *   `<title>` (`Chapter 3, The Book`), and a second half with no heading of its own is read by that title. The same
 *   name twice in a row is one chapter in two files.
 * - **Between two listed sections.** Not at the FRONT, where an untitled section is front matter with its own rule
 *   (`frontMatterMask`); and not at the BACK, where a long nameless section is often an excerpt from a different book,
 *   which would otherwise be glued to the last chapter.
 * - **Only once the headings are known.** Before the location index has measured the book, `heading` answers
 *   `undefined` and nothing continues — the list is then what it always was, until the measurement lands.
 * - **At least `minChars` of text** (the recording list's `LABEL_CHARS`). A few characters with no name — a
 *   half-title, a page ornament — is page furniture, not the chapter going on: a half-title that is the book's own
 *   name in capitals would otherwise become a one-second "<NEXT CHAPTER> 2 of 2".
 *
 * One answer for every list — the recording list, Save as Markdown and its dialog, and Save as PDF — so that a
 * section the export folds into a chapter is never a separate track, or the other way round.
 */
export function continuationSections(opts: {
  sectionCount: number;
  /** Whether a contents entry lands in this section. */
  listed: (sectionIndex: number) => boolean;
  /** `headingOf`'s answer for the section, or `undefined` while it has not been read. */
  heading: (sectionIndex: number) => string | undefined;
  /** The contents' name for a listed section — what the chapter before an unlisted one is called. */
  listedName?: (sectionIndex: number) => string | undefined;
  bookTitle: string;
  /** How much text the section holds, in characters. */
  chars: (sectionIndex: number) => number;
  /** Less text than this is page furniture, not the chapter going on — `LABEL_CHARS`, passed in by the caller. */
  minChars: number;
}): Set<number> {
  const out = new Set<number>();
  const listed: number[] = [];
  for (let i = 0; i < opts.sectionCount; i++) if (opts.listed(i)) listed.push(i);
  if (listed.length < 2) return out;
  const first = listed[0];
  const last = listed[listed.length - 1];
  const same = (a: string, b: string): boolean =>
    a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
  let chapterName = '';
  for (let i = first; i < last; i++) {
    if (opts.listed(i)) {
      chapterName = opts.listedName?.(i) ?? '';
      continue;
    }
    const heading = opts.heading(i);
    if (heading === undefined || opts.chars(i) < opts.minChars) continue;
    const before = opts.heading(i - 1);
    if (
      namesOnlyTheBook(heading, opts.bookTitle) ||
      (!!chapterName && same(heading, chapterName)) ||
      (!!before && same(heading, before))
    )
      out.add(i);
  }
  return out;
}

/**
 * Give a repeated name the chapter it sits in, so that every copy of it is something a link can name.
 *
 * **The contents page's own rule, applied to names the contents never gave.** `flattenTocWithDisambiguation`
 * turns a novel in parts' six `CHAPTER I`s into `PART I – CHAPTER I` and the rest; an unlisted section named
 * by its heading gets no such help, so a technical book has eleven chapters called "Summary" — eleven tracks, eleven
 * `# Summary` headings in a single note, and eleven links that cannot say which one they mean. Each becomes
 * `1. First Steps – Summary`: named by the contents entry before it, which is the chapter it belongs to.
 *
 * **All or nothing for each name**, as the contents rule is: a group is qualified only when every copy has a
 * listed row before it and the results are all different from each other and from every other name. Otherwise
 * the group keeps its names — repeated, and honest about it — rather than half of them changing.
 *
 * Only unlisted names change. A listed row's name is the contents page's, already disambiguated.
 */
export function qualifyRepeatedNames(rows: readonly { name: string; listed: boolean }[]): string[] {
  const key = (s: string): string => s.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const r of rows) if (r.name.trim()) counts.set(key(r.name), (counts.get(key(r.name)) ?? 0) + 1);

  const out = rows.map((r) => r.name);
  const groups = new Map<string, number[]>();
  let lastListed = '';
  const qualifier: string[] = [];
  rows.forEach((r, i) => {
    qualifier[i] = lastListed;
    if (r.listed) lastListed = r.name;
    if (!r.listed && r.name.trim() && (counts.get(key(r.name)) ?? 0) > 1) {
      const g = groups.get(key(r.name));
      if (g) g.push(i);
      else groups.set(key(r.name), [i]);
    }
  });

  const taken = new Set(rows.map((r) => key(r.name)));
  for (const [name, members] of groups) {
    // No qualifier, or one that IS the name: "1. Getting Started – 1. Getting Started" names nothing new.
    if (members.some((i) => !qualifier[i] || key(qualifier[i]) === name)) continue;
    const proposed = members.map((i) => `${qualifier[i]} – ${rows[i].name}`);
    const unique = new Set(proposed.map(key));
    if (unique.size !== proposed.length) continue;
    if (proposed.some((p) => key(p) !== name && taken.has(key(p)))) continue;
    members.forEach((i, j) => {
      out[i] = proposed[j];
    });
  }
  return out;
}
