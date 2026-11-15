// The Contents list at the top of a generated single note, and how each entry reaches its chapter.
//
// **Resolved after the note is written**, because whether a link lands depends on every heading above its target. The
// kind headings — Bookmarks, Passage selections, Notes — repeat in every chapter, so a chapter CALLED Notes comes after
// one, and a link by name goes to whichever heading of that name is first. So each chapter heading carries a marker
// while the note is built, each Contents entry is a placeholder, and one pass over the finished note fills them in:
//
// - **In the vault**, `[[#Chapter One]]` when the chapter's heading is the first of its name. Otherwise no heading path
//   can reach it — Obsidian's path finds the first DEEPER heading after its first part, and the section that shares the
//   name is deeper — so the chapter's ↗ Open in book line takes a block id, and the entry links to that block.
// - **Out of the vault** (Export, Share), a standard Markdown link to the anchor GitHub gives the heading, repeats
//   numbered `-1`, `-2`, which most Markdown editors follow.

import { githubSlug, headingKey } from '../export-links';

/** Private-use characters, so a marker cannot collide with anything a book or a reader writes. */
const MARK = '\u{E0F0}';
const HEADING_MARK = new RegExp(`${MARK}h(\\d+)${MARK}`);
const ENTRY_MARK = new RegExp(`${MARK}a(\\d+)${MARK}`, 'g');
/** The line a chapter heading is followed by in the vault note — see `headingWithJump`. */
const JUMP_LINE = /^\[↗ Open in book\]\(/;

/** Appended to the heading of chapter `n`, so its target can be read off once the whole note exists. */
export function chapterHeadingMark(n: number): string {
  return `${MARK}h${n}${MARK}`;
}

/** The Contents entry for chapter `n`, filled in by one of the resolvers below. */
export function contentsEntry(n: number): string {
  return `${MARK}a${n}${MARK}`;
}

interface MarkedHeading {
  /** Chapter number, from its marker. */
  n: string;
  /** The heading's line, in the finished note. */
  index: number;
  /** Whether a heading with the same name came earlier — by Obsidian's comparison, or by GitHub's slug. */
  repeated: boolean;
  slug: string;
}

/**
 * Walk the note's headings in order, outside fenced code, and take the markers off: what each resolver needs to know
 * about every chapter heading, and the slug count GitHub's numbering follows.
 */
function readHeadings(lines: string[], keyOf: (text: string) => string): MarkedHeading[] {
  const seen = new Map<string, number>();
  const marked: MarkedHeading[] = [];
  let fenced = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^#{1,6}[ \t]+(.+?)[ \t]*$/.exec(line);
    if (!heading) return;
    const mark = HEADING_MARK.exec(heading[1]);
    const key = keyOf(heading[1].replace(HEADING_MARK, '').trim());
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (!mark) return;
    lines[index] = line.replace(HEADING_MARK, '').replace(/[ \t]+$/, '');
    marked.push({ n: mark[1], index, repeated: count > 0, slug: count === 0 ? key : `${key}-${count}` });
  });
  return marked;
}

/**
 * The vault note: `[[#Label]]`, or a link to a block on the chapter's ↗ Open in book line when an earlier heading has
 * its name. `labels[n]` is already a link target (`headingLinkTarget`).
 */
export function resolveChapterWikiLinks(md: string, labels: readonly string[]): string {
  const lines = md.split('\n');
  const links = new Map<string, string>();
  for (const h of readHeadings(lines, headingKey)) {
    const label = labels[Number(h.n)] ?? '';
    if (!h.repeated) {
      links.set(h.n, `[[#${label}]]`);
      continue;
    }
    let next = h.index + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    if (next < lines.length && JUMP_LINE.test(lines[next])) {
      const id = `orbis-chapter-${Number(h.n) + 1}`;
      lines[next] = `${lines[next]} ^${id}`;
      links.set(h.n, `[[#^${id}|${label}]]`);
    } else {
      // A chapter the contents does not name has no jump line to carry a block id; the link goes by name.
      links.set(h.n, `[[#${label}]]`);
    }
  }
  return lines.join('\n').replace(ENTRY_MARK, (_m, n: string) => links.get(n) ?? '');
}

/**
 * A copy leaving the vault: `[Label](#anchor)`, the anchor as GitHub numbers it. `labels[n]` is already a line of text
 * (`bookTextLine`), so a `]` in a book's label cannot end the link text and start a link or a picture of its own.
 */
export function resolveChapterAnchors(md: string, labels: readonly string[]): string {
  const lines = md.split('\n');
  const links = new Map<string, string>();
  for (const h of readHeadings(lines, githubSlug)) links.set(h.n, `[${labels[Number(h.n)] ?? ''}](#${h.slug})`);
  return lines.join('\n').replace(ENTRY_MARK, (_m, n: string) => links.get(n) ?? '');
}
