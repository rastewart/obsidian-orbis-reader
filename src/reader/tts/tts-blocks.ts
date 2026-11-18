// Split a rendered section document into sentence-level reading units, in
// reading order. Each unit carries the text to speak and a *text-node* Range so
// it draws reliably on the annotation overlay (the path search hits / notes use)
// and can be paged to via the renderer's scrollToAnchor — which is why the
// highlight follows the audio even within a long paragraph.
//
// Block detection is adapted from foliate-js's tts.js `getBlocks`; the text-node
// collection + offset→DOM-range mapping is ported from foliate-js's
// text-walker.js / tts.js (which use the global `document` and so can't be called
// directly from our bundle — here everything is driven by the book `doc`).
// Sentence splitting uses Intl.Segmenter, with a whole-block fallback where it's
// unavailable.

import type { Pronouncer } from './pronunciations';
import { romanToArabic, speakNamedNumerals } from './spoken-numerals';

// ── Links in prose ──────────────────────────────────────────────────────────
//
// A URL read out character by character is unlistenable: "aitch tee tee pee colon slash slash ex dot
// com slash jimcramer slash status slash two zero seven nine five zero nine…". Prose that shows its
// links as bare URLs — converted blog posts, footnote-style references — is full of them.
//
// Only URLs that appear as *visible text* are affected. An `href` is never spoken, so a link whose
// text is prose ("US Treasury Secretary Scott Bessent on Fox Business") reads exactly as written.
//
// Spoken English, hardcoded like the heading keywords and the ALL-CAPS rule below. If Orbis ever
// localizes spoken text, these move to the i18n catalog together with those.
const WEB_LINK = 'web link';
const EMAIL_LINK = 'email link';

/** Host label: at least two dot-separated parts, so a domain is distinguishable from prose. */
const HOST = String.raw`[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]{2,})+`;
const EMAIL = String.raw`[a-z0-9._%+-]+@${HOST}`;
/** The rest of a URL: everything up to whitespace or a character that ends one in running text. */
const TAIL = String.raw`[^\s<>"'“”]*`;

/**
 * What counts as a link in prose. Deliberately narrow: a scheme, a `www.` prefix, or a domain
 * followed by a slash. A bare `x.com` with none of the three is left alone — abbreviations and
 * prose like "Inc.com" would false-positive, and the cost of missing one is a URL read the old way.
 */
const SPOKEN_LINK_RE = new RegExp(
  `\\b(?:${[
    String.raw`https?://${TAIL}`, // a scheme is unambiguous
    String.raw`www\.${TAIL}`, // no scheme, but no less certain
    `mailto:${EMAIL}`,
    `${HOST}/${TAIL}`, // bare host — only with a path, which is what makes it a URL and not prose
    EMAIL,
  ].join('|')})`,
  'gi'
);

/** Punctuation a URL in prose ends up wrapped in. Kept out of the reading and put back after it,
 *  so a sentence-final period still reaches the engine as a period — and `](url)` keeps its
 *  bracket and paren rather than having them swallowed by the match. */
const LINK_TRAIL_RE = /[.,;:!?)\]}"'’”]+$/;

/** "web link x dot com" — the kind, then the host, dots spoken. The path, query, port, userinfo and
 *  `www.` all go: a status ID is 19 digits of nothing, and the host is what identifies a link out
 *  loud. Dots are spelled out because no engine says a bare ".com" dependably. */
function spokenLink(match: string): string {
  const trail = LINK_TRAIL_RE.exec(match)?.[0] ?? '';
  const url = match.slice(0, match.length - trail.length);
  const scheme = /^[a-z][a-z0-9+.-]*:(?:\/\/)?/i.exec(url)?.[0] ?? '';
  const kind = /^mailto:/i.test(url) || (!scheme && url.includes('@')) ? EMAIL_LINK : WEB_LINK;
  let host = url.slice(scheme.length).split(/[/?#]/)[0];
  const at = host.lastIndexOf('@'); // userinfo, or an address's local part
  if (at >= 0) host = host.slice(at + 1);
  host = host
    .replace(/:\d+$/, '')
    .replace(/^www\./i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+$/, ''); // a dot left by trailing punctuation we already put aside
  const said = host.replace(/\./g, ' dot ').replace(/\s+/g, ' ').trim();
  return (said ? `${kind} ${said}` : kind) + trail;
}

// ── ALL-CAPS tokens ─────────────────────────────────────────────────────────
//
// espeak-ng spells an all-caps run out letter by letter ("C-H-A-P-T-E-R"), which Piper renders as
// garbled audio — worst on voices trained with the plain "en" espeak voice. Title-casing fixes a
// CAPS *word*; it ruins an *initialism*, which the engine already reads correctly ("RIAA" → "Riaa",
// spoken "ree-ah", instead of R-I-A-A). So the two have to be told apart.

const VOWEL = /[AEIOUY]/;

/**
 * Whether an all-caps token is an initialism — read letter by letter (AWS, RIAA, HTML) — rather than
 * a word (CHAPTER, NASA, FUD). Initialisms are left ALONE, in caps: spelling them out is what the
 * engine already does with a caps run, and leaving the text untouched means each engine keeps its own
 * handling rather than having espeak's forced onto it.
 *
 * Three shapes, none of which an English word takes:
 *  - no vowel at all — HTML, SCTV
 *  - vowels only in the first/last position — AWS, USA, FBI. Also ONE, TWO and THE, which are therefore
 *    read as letters.
 *  - a run of 3+ vowels in a short token — RIAA, IEEE. Length-capped, so BEAUTIFUL (EAU) stays a word.
 *
 * Imperfect, and unavoidably so: convention decides that AWS is spelled and FUD is said, and both are
 * perfectly pronounceable. It reads MIT and CIA as words ("Mit", "Cia") and QUEUE as letters. The
 * pronunciation glossary is the escape hatch for an acronym that matters in a particular book.
 */
function isInitialism(letters: string): boolean {
  if (!VOWEL.test(letters)) return true;
  if (!VOWEL.test(letters.slice(1, -1))) return true;
  return letters.length <= 5 && /[AEIOUY]{3}/.test(letters);
}

// ── Runs of capitals ────────────────────────────────────────────────────────
//
// Two or more words in capitals side by side are display or shouted text — "IT WAS A DARK NIGHT", "GOD IS WITH US",
// "KEEP OUT" — not a string of acronyms, and judged one word at a time the short ones were spelled: IT, US and DR are
// acronyms to espeak in capitals. Such runs are common, and of the short words found inside them, lower-casing changes
// the reading of very few — IT, US and DR now read as words, TO, NOT and HAS only lose stress, and a rare few such as
// UN and LA lose an acronym reading. Unpronounceable ones (FBI, HTML) are spelled in lower case too.

/** A word of letters, with any internal apostrophes. */
const WORD_TOKEN_RE = /[A-Za-z][A-Za-z'’]*/g;

const isCapsWord = (word: string): boolean => /[A-Z]/.test(word) && !/[a-z]/.test(word);

/**
 * Lower-case each run of two or more words in capitals, keeping a capital where a sentence starts.
 *
 * A run needs one word of two letters or more, so "I A" is left alone. Within it, a real Roman numeral (VI, XII, and
 * the pronoun I) keeps its capitals: after a heading word the numeral rule turns it into a number, and elsewhere a
 * lower-case "vi" is read "roman six", no better than V-I. A single word in capitals is not a run and goes to the
 * per-word rule below, which is what keeps "the FBI" and "at MIT" as they were.
 */
function lowerCapitalRuns(text: string): string {
  const tokens = [...text.matchAll(WORD_TOKEN_RE)].map((m) => ({ word: m[0], at: m.index ?? 0 }));
  let out = '';
  let last = 0;
  for (let i = 0; i < tokens.length; ) {
    if (!isCapsWord(tokens[i].word)) {
      i++;
      continue;
    }
    let j = i;
    while (j < tokens.length && isCapsWord(tokens[j].word)) j++;
    const run = tokens.slice(i, j);
    if (run.length >= 2 && run.some((t) => t.word.replace(/['’]/g, '').length >= 2)) {
      for (const { word, at } of run) {
        out += text.slice(last, at);
        if (romanToArabic(word) !== null) out += word;
        else {
          const lower = word.toLowerCase();
          // The start of the text or of a sentence, past any opening quote or bracket.
          const opens = /(^|[.!?])[\s"'“‘([]*$/.test(text.slice(0, at));
          out += opens ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
        }
        last = at + word.length;
      }
    }
    i = j;
  }
  return out + text.slice(last);
}

/**
 * "IT was…": the first word of a sentence set in capitals, as older books open a chapter, with the rest in lower case.
 * A lone IT is no run, and in capitals it is spelled. Only before the verbs measured after it (2026-10-23): at the
 * start of a paragraph IT was the pronoun all 26 times, but mid-paragraph a sentence can open with the acronym — "IT
 * systems", "IT governance" — and an acronym takes a modal as readily as a pronoun does ("IT will need…").
 */
const IT_OPENING_RE = /(^|[.!?]\s+)(["'“‘([]*)IT(?=\s+(?:was|is|had|turned|wasn['’]t|isn['’]t|doesn['’]t)\b)/g;

/** An all-caps run of two or more letters, with any internal apostrophes and a trailing possessive
 *  or plural ("O'BRIEN", "AWS's", "URLs"). The suffix is matched so it can be *excluded* from the
 *  word-shape test and then put back: counting the apostrophe toward the length would turn "AWS's"
 *  — three letters, and an initialism — into "Aws's". */
const CAPS_TOKEN_RE = /\b[A-Z][A-Z'’]*[A-Z](?:['’]?s)?\b/g;

/**
 * Text that is a Roman numeral and nothing else, with at most a period or colon after it: a chapter heading with no
 * heading word before it, as many books set their chapters (`<h3>I</h3>`). Read
 * as it was, the engine said "eye" for I and "roman two" for II. A reading unit never spans two blocks, so a unit
 * this short is a heading or a line on its own, or a sentence that is only a numeral, as in a list numbered
 * "I. … II. …" — a number every time. The lone I is included, since in a unit of its own it is not the pronoun.
 * Capitals only: a lone "i" or "v" is more likely a list marker or a letter than a chapter.
 */
const LONE_NUMERAL_RE = /^\s*([IVXLCDM]+)([.:]?)\s*$/;

/**
 * Normalize text for the TTS engine (not for display or highlighting — ranges are untouched).
 * Converts a Roman numeral to its digits when it follows a heading word ("Chapter I" →
 * "Chapter 1", "Part IV" → "Part 4"), so espeak-ng doesn't read "Chapter I" as "chapter eye"
 * or "Chapter II" as "chapter roman two". Requiring the preceding keyword keeps the pronoun
 * "I" and stray capitals from being rewritten. Collapses a URL in the text to "web link" plus its
 * host (see SPOKEN_LINK_RE).
 *
 * A URL is much longer written than spoken, so the char-proportional position estimate drifts
 * across a sentence containing one — the same caveat pronunciation respellings carry, and it
 * resyncs at the next sentence boundary.
 */
export function normalizeForSpeech(text: string, pronouncer?: Pronouncer | null): string {
  // A numeral with nothing else to say is a number, never a letter — see LONE_NUMERAL_RE.
  const lone = LONE_NUMERAL_RE.exec(text);
  const n = lone ? romanToArabic(lone[1]) : null;
  if (lone && n !== null) text = `${n}${lone[2]}`;
  // Links first, so a URL's own content never reaches the rules below — a path can hold an ALL-CAPS
  // run or a roman-numeral-looking token, and none of it is going to be spoken anyway.
  // Runs of capitals next, while a run can still be told from a lone word in capitals — see lowerCapitalRuns.
  const linked = lowerCapitalRuns(text.replace(SPOKEN_LINK_RE, spokenLink)).replace(IT_OPENING_RE, '$1$2It');
  // Title-case an ALL-CAPS *word* ("CHAPTER", "PROLOGUE", "FUD") so the engine says it instead of
  // spelling it; leave an initialism in caps so it keeps being spelled (see isInitialism). Pure
  // roman-numeral tokens (VIII, XIV) are left for the roman rule below, whatever their shape.
  const deCapsed = linked.replace(CAPS_TOKEN_RE, (token) => {
    const suffix = /['’]?s$/.exec(token)?.[0] ?? '';
    const body = token.slice(0, token.length - suffix.length);
    const letters = body.replace(/['’]/g, '');
    if (letters.length < 3 || /^[IVXLCDM]+$/.test(letters) || isInitialism(letters)) return token;
    return body.charAt(0) + body.slice(1).toLowerCase() + suffix;
  });
  const headed = deCapsed.replace(
    /\b(chapter|part|book|volume|section|canto|act|scene)\s+([ivxlcdm]+)\b/gi,
    (m, kw: string, roman: string) => {
      const n = romanToArabic(roman);
      return n ? `${kw} ${n}` : m;
    }
  );
  // Then a numeral after a name: "Henry the Sixth", "World War 2" — see spoken-numerals.ts.
  const romanFixed = speakNamedNumerals(headed);
  // User respellings run LAST, so what the user typed reaches the engine verbatim — the all-caps
  // rule above would otherwise title-case a deliberately-shouty respelling like "DOSTOYEVSKE".
  return pronouncer ? pronouncer(romanFixed) : romanFixed;
}

/**
 * Whether there is anything here worth speaking: at least one letter or digit.
 *
 * A sentence of pure punctuation is a real thing in a real book — `](`, a lone `)`, an em dash on its own line,
 * the leftovers of a malformed markdown link — and each one would cost a full synthesis. In a recorded run
 * that is a whole server request per fragment (a one-character unit comes back with about 250 KB of audio,
 * ~5 seconds of it), and in live listening it is a stop on something the voice has nothing to say about.
 *
 * `\p{L}\p{N}` rather than `\w`, which is ASCII-only and would drop 日本語 and Ελληνικά wholesale. Deliberately
 * NOT a check for "speakable by this voice": a number, a currency amount and a CJK sentence all qualify.
 */
const SPEAKABLE = /[\p{L}\p{N}]/u;

export interface ReadingUnit {
  range: Range;
  text: string;
  /** For a multi-sentence chunk: its constituent sentence units, so the controller can keep
   *  highlighting at the sentence level even though the whole chunk is synthesized at once. */
  sentences?: ReadingUnit[];
  /** The enclosing block/paragraph range this unit came from, so the listener can
   *  "highlight the whole paragraph" for the sentence currently being read. */
  block?: Range;
}

const BLOCK_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'caption',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'dd',
  'figure',
  'footer',
  'form',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'tr',
]);

/** The range spanning the block (paragraph / heading / list item / …) that encloses `range`'s
 *  start. Lets "highlight/note the whole paragraph" work when only a sentence range is known —
 *  e.g. recorded-audio segments, which carry no block model. Null if no block ancestor is found. */
export function enclosingBlockRange(range: Range): Range | null {
  let node: Node | null = range.startContainer;
  if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    if (BLOCK_TAGS.has((node as Element).tagName.toLowerCase())) {
      const doc = node.ownerDocument;
      if (!doc) return null;
      const r = doc.createRange();
      r.selectNodeContents(node);
      return r;
    }
    node = node.parentNode;
  }
  return null;
}

/**
 * Element-boundary block ranges — the paragraph structure of the document.
 *
 * **No emptiness test here, and that is a performance constraint rather than a shortcut.** Dropping blocks whose
 * `range.toString()` is blank would be quadratic: `Range.toString()` costs time proportional to the whole DOCUMENT
 * rather than to the range, so one such call per block is enough to freeze Obsidian on a book that ships as a
 * single 1 MB section.
 *
 * Nothing is lost, because the only caller already discards a block that has no text: `getReadingUnits` skips one
 * with no text nodes, and `tightSpan` returns null when a block holds only whitespace. The cheap application of
 * that filter is the one downstream.
 */
function getBlocks(doc: Document): Range[] {
  const blocks: Range[] = [];
  if (!doc.body) return blocks;
  let last: Range | null = null;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const name = (node as Element).tagName.toLowerCase();
    if (BLOCK_TAGS.has(name)) {
      if (last) {
        last.setEndBefore(node);
        blocks.push(last);
      }
      last = doc.createRange();
      last.setStart(node, 0);
    }
  }
  if (!last) {
    last = doc.createRange();
    last.setStart(doc.body.firstChild ?? doc.body, 0);
  }
  last.setEndAfter(doc.body.lastChild ?? doc.body);
  blocks.push(last);
  return blocks;
}

const WALK_FILTER = NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_CDATA_SECTION;

/** Text/CDATA nodes within `range`, in document order. Ported from foliate's
 *  text-walker.js `walkRange` (skips script/style, descends into inline markup). */
function collectRangeTextNodes(range: Range, doc: Document): Text[] {
  const walker = doc.createTreeWalker(range.commonAncestorContainer, WALK_FILTER, {
    acceptNode(node) {
      if (node.nodeType === 1) {
        const name = (node as Element).tagName.toLowerCase();
        if (name === 'script' || name === 'style') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  /** Collect `node` if the range holds it; false once we are past the end and can stop. */
  const take = (node: Node): boolean => {
    try {
      const cmp = range.comparePoint(node, 0);
      if (cmp === 0) nodes.push(node as Text);
      else if (cmp > 0) return false;
    } catch {
      /* node not comparable to this range — skip */
    }
    return true;
  };

  /**
   * **Seek to the range's own start, rather than walking to it.**
   *
   * A TreeWalker begins at its root, and this root is `commonAncestorContainer` — which for a block range is not
   * the block. `getBlocks` ends each block's range *before the next block element*, so for sibling paragraphs the
   * common ancestor is their shared parent, usually `<body>`. Starting there would mean re-walking the document
   * from the top for every block and stopping only once past that block: work proportional to the block's
   * POSITION, summed over every block. Quadratic.
   *
   * On a 1 MB section that is millions of node visits, each paying a `comparePoint`, on the main thread — enough
   * for opening the Listen bar on such a book to freeze Obsidian outright on a phone. `currentNode` is settable
   * precisely so a walk can begin somewhere other than the root.
   *
   * `nextNode()` returns what follows `currentNode`, so a text node used as the start would be skipped: it is
   * offered to `take` first.
   */
  walker.currentNode = range.startContainer;
  if (range.startContainer.nodeType === Node.TEXT_NODE && !take(range.startContainer)) return nodes;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!take(node)) break;
  return nodes;
}

function makeSegmenter(lang: string, granularity: 'sentence' | 'word' = 'sentence'): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
  try {
    return new Intl.Segmenter(lang || 'en', { granularity });
  } catch {
    return null;
  }
}

/** A text node's contribution to a range: the node plus the `[start, end)` offsets inside it.
 *  Unlike whole-block collection, a *sentence* range starts and ends mid-node, so the slice
 *  bounds matter. */
interface TextSlice {
  node: Text;
  start: number;
  end: number;
}

/** The text-node slices `range` covers, in document order.
 *
 *  Deliberately not `collectRangeTextNodes`: that tests `comparePoint(node, 0)`, which reports
 *  -1 for a start container the range enters partway through — so it drops the first node of any
 *  sentence range. Here a node is kept when it *intersects* the range (its end is at/after the
 *  range start and its start is at/before the range end), which keeps partial edge nodes and all
 *  interior ones (a hand-rolled `intersectsNode` walk truncates sentences). */
function rangeTextSlices(range: Range, doc: Document): TextSlice[] {
  const slices: TextSlice[] = [];
  // commonAncestorContainer IS the text node when the range sits inside one — a descendant
  // walker would find nothing, so handle that directly (same shape as anchorAtFraction).
  const cac = range.commonAncestorContainer;
  const candidates: Text[] = [];
  if (cac.nodeType === 3) candidates.push(cac as Text);
  else {
    const walker = doc.createTreeWalker(cac, WALK_FILTER, {
      acceptNode(node) {
        if (node.nodeType === 1) {
          const name = (node as Element).tagName.toLowerCase();
          if (name === 'script' || name === 'style') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) candidates.push(n as Text);
  }

  for (const node of candidates) {
    const len = node.nodeValue?.length ?? 0;
    try {
      if (range.comparePoint(node, len) < 0) continue; // wholly before the range
      if (range.comparePoint(node, 0) > 0) break; // wholly after — nothing later can intersect
    } catch {
      continue; // node not comparable to this range
    }
    const start = node === range.startContainer ? Math.min(range.startOffset, len) : 0;
    const end = node === range.endContainer ? Math.min(range.endOffset, len) : len;
    if (end > start) slices.push({ node, start, end });
  }
  return slices;
}

/** Cumulative character boundaries for a run of units — `[0, len₀+1, len₀+len₁+2, …]`, so the
 *  last entry is the total. The `+1` per unit accounts for the separator between them, matching
 *  how the units' texts are joined for synthesis. */
export function cumCharBounds(units: readonly { text: string }[]): number[] {
  const bounds = [0];
  for (const u of units) bounds.push(bounds[bounds.length - 1] + u.text.length + 1);
  return bounds;
}

/**
 * Index of the unit containing `frac` (0..1) through a run, by cumulative character count —
 * the char-proportional position estimate the reading highlight advances on.
 *
 * Used for both sentences within a synthesis chunk and words within a sentence. Exact when the
 * engine reports a real character index (Web Speech `onboundary`); an estimate when it reports
 * elapsed time (Piper, recorded MP3), where it assumes speech time is proportional to text
 * length. `from` is the current index — passing it keeps the scan forward-only during playback,
 * and it's clamped so the result never moves backwards mid-run.
 */
export function unitIndexAtFraction(cumChars: readonly number[], count: number, frac: number, from = 0): number {
  if (count <= 0) return 0;
  const total = cumChars[count];
  if (total <= 0) return Math.max(0, Math.min(from, count - 1));
  const pos = Math.max(0, Math.min(1, frac)) * total;
  let idx = Math.max(0, Math.min(from, count - 1));
  while (idx + 1 < count && pos >= cumChars[idx + 1]) idx++;
  return idx;
}

/**
 * Word units within one sentence range — the spans the word-granularity reading highlight draws.
 *
 * Word-like segments only: spaces and standalone punctuation are skipped so the highlight never
 * lands on a gap between words. Offsets map back to text nodes through the same length-preserving
 * newline normalization sentence segmentation uses, so pretty-printed book HTML maps correctly.
 * Returns `[]` when `Intl.Segmenter` is unavailable, which callers read as "no word highlighting"
 * and fall back to the sentence.
 */
export function getWordUnits(range: Range): ReadingUnit[] {
  const doc = range.startContainer.ownerDocument;
  if (!doc) return [];
  const segmenter = makeSegmenter(doc.documentElement?.lang || 'en', 'word');
  if (!segmenter) return [];
  const slices = rangeTextSlices(range, doc);
  if (!slices.length) return [];

  const strs = slices.map((s) => (s.node.nodeValue ?? '').slice(s.start, s.end));
  const str = strs.join('').replace(/\r\n/g, '  ').replace(/\r/g, ' ').replace(/\n/g, ' ');
  if (!str.trim()) return [];

  const units: ReadingUnit[] = [];
  let strIndex = -1;
  let sum = 0;
  for (const { index, segment, isWordLike } of segmenter.segment(str)) {
    if (!isWordLike) continue; // whitespace / punctuation — not a highlightable word
    const text = segment.trim();
    if (!text) continue;
    try {
      // Same offset→node walk as segmentBlock; monotonic in `index`, so skipped non-word
      // segments just mean the catch-up loop advances further on the next word.
      while (sum <= index) sum += strs[++strIndex].length;
      const startIndex = strIndex;
      const startOffset = index - (sum - strs[strIndex].length) + slices[startIndex].start;
      const end = index + segment.length - 1;
      if (end < str.length) while (sum <= end) sum += strs[++strIndex].length;
      const endIndex = strIndex;
      const endOffset = end - (sum - strs[strIndex].length) + 1 + slices[endIndex].start;
      const r = doc.createRange();
      r.setStart(slices[startIndex].node, startOffset);
      r.setEnd(slices[endIndex].node, endOffset);
      if (r.toString().trim()) units.push({ range: r, text });
    } catch {
      /* mapping fell out of bounds — skip this word */
    }
  }
  return units;
}

/**
 * A tight text-node range spanning `nodes`: whitespace-only nodes at either end are skipped, and the
 * edge nodes start and end on real characters. Null when there is nothing but whitespace.
 *
 * Section XHTML is pretty-printed, so a range that leaks past its own block's close tag ends in the
 * whitespace between blocks and takes `<body>` as its commonAncestorContainer. Keeping the ends on real
 * characters keeps the range inside its block, and keeps a trailing space out of the drawn highlight.
 * (Before ORBIS patch 15, foliate's overlayer measured only `<p>` elements, and a leaked heading or
 * last-`<li>` range painted nothing at all.)
 *
 * `tightenRange` in range-utils.ts repairs the same leak for stored annotations after the fact, by
 * walking the DOM. Here the offsets are already in hand, so the loose range is never built.
 */
function tightSpan(nodes: readonly Text[], doc: Document): Range | null {
  let first = 0;
  while (first < nodes.length && !(nodes[first].nodeValue ?? '').trim()) first++;
  let last = nodes.length - 1;
  while (last > first && !(nodes[last].nodeValue ?? '').trim()) last--;
  if (first > last) return null;
  const head = nodes[first].nodeValue ?? '';
  const tail = nodes[last].nodeValue ?? '';
  const range = doc.createRange();
  range.setStart(nodes[first], head.length - head.replace(/^\s+/, '').length);
  range.setEnd(nodes[last], tail.replace(/\s+$/, '').length);
  return range;
}

/** Sentence units for one block. Offset→node mapping ported from foliate tts.js. */
function segmentBlock(nodes: Text[], segmenter: Intl.Segmenter, doc: Document): ReadingUnit[] {
  const units: ReadingUnit[] = [];
  const strs = nodes.map((n) => n.nodeValue ?? '');
  // Normalize newlines to spaces before segmenting — the Unicode sentence-break
  // algorithm treats a hard newline (common in pretty-printed book HTML) as a
  // sentence boundary, which would split sentences at every source line wrap.
  // Length-preserving (\r\n → two spaces) so the offset→node mapping stays valid.
  // Mirrors foliate-js tts.js.
  const str = strs.join('').replace(/\r\n/g, '  ').replace(/\r/g, ' ').replace(/\n/g, ' ');
  if (!str.trim()) return units;

  let strIndex = -1;
  let sum = 0;
  for (const { index, segment } of segmenter.segment(str)) {
    // Collapse whitespace runs (source indentation on wrapped lines) for clean
    // spoken text; the range keeps the original offsets for accurate highlighting.
    const text = segment.replace(/\s+/g, ' ').trim();
    // Nothing to say, so nothing to synthesize, highlight or page to — see SPEAKABLE.
    if (!text || !SPEAKABLE.test(text)) continue;
    try {
      // Map the segment's TRIMMED bounds, not its raw ones. A block's last sentence has no sentence
      // boundary after it, so the segment runs on and swallows the whitespace between `</h1>` (or
      // `</li>`) and the next block — which pushes the range's cAC out to `<body>`. See tightSpan
      // for what that costs at paint time. Still monotonic in the string, so the catch-up walk holds.
      const from = index + (segment.length - segment.replace(/^\s+/, '').length);
      const to = index + segment.replace(/\s+$/, '').length; // exclusive
      if (to <= from) continue;
      while (sum <= from) sum += strs[++strIndex].length;
      const startIndex = strIndex;
      const startOffset = from - (sum - strs[strIndex].length);
      const end = to - 1;
      if (end < str.length) while (sum <= end) sum += strs[++strIndex].length;
      const endIndex = strIndex;
      const endOffset = end - (sum - strs[strIndex].length) + 1;
      const range = doc.createRange();
      range.setStart(nodes[startIndex], startOffset);
      range.setEnd(nodes[endIndex], endOffset);
      if (range.toString().trim()) units.push({ range, text });
    } catch {
      /* mapping fell out of bounds — skip this segment */
    }
  }
  return units;
}

/** One unit spanning a whole block, with a text-node range (draws reliably on the overlay). */
function paragraphUnit(nodes: Text[], doc: Document): ReadingUnit | null {
  const range = tightSpan(nodes, doc);
  if (!range) return null;
  const text = range.toString().replace(/\s+/g, ' ').trim();
  return SPEAKABLE.test(text) ? { range, text } : null;
}

/** Merge consecutive sentence units into one unit (range spans them; text is joined). */
function mergeUnits(group: ReadingUnit[], doc: Document): ReadingUnit {
  if (group.length === 1) return group[0];
  const range = doc.createRange();
  range.setStart(group[0].range.startContainer, group[0].range.startOffset);
  const last = group[group.length - 1].range;
  range.setEnd(last.endContainer, last.endOffset);
  return { range, text: group.map((u) => u.text).join(' '), sentences: group };
}

/** Tag a unit (and its constituent sentences) with the block range it came from. */
function tagBlock(unit: ReadingUnit, block: Range): ReadingUnit {
  unit.block = block;
  if (unit.sentences) for (const s of unit.sentences) s.block = block;
  return unit;
}

/** Group a block's sentences into chunks no longer than `maxChars` (breaking only at
 *  sentence boundaries; a single over-long sentence is its own chunk). */
function chunkSentences(sentences: ReadingUnit[], maxChars: number, doc: Document): ReadingUnit[] {
  const chunks: ReadingUnit[] = [];
  let group: ReadingUnit[] = [];
  let len = 0;
  for (const s of sentences) {
    if (group.length && len + s.text.length > maxChars) {
      chunks.push(mergeUnits(group, doc));
      group = [];
      len = 0;
    }
    group.push(s);
    len += s.text.length + 1;
  }
  if (group.length) chunks.push(mergeUnits(group, doc));
  return chunks;
}

/**
 * Reading units for the whole document, in reading order.
 *
 * `maxChars` sets the chunk size — the balance between natural cadence and latency/memory:
 *  - `0` (default): one unit per sentence — instant start, tight highlight/page-follow.
 *  - a middle value (A few sentences: `MAX_PIECE_CHARS`): group consecutive sentences up to
 *    that length, so the engine renders cross-sentence prosody within a chunk (more natural)
 *    while bounding per-unit synthesis time and memory.
 *  - very large: one unit per paragraph. No setting offers it — see `readAheadMaxChars`.
 * Chunks only ever break at sentence boundaries.
 */
export function getReadingUnits(doc: Document, maxChars = 0): ReadingUnit[] {
  const units: ReadingUnit[] = [];
  const lang = doc.documentElement.lang || 'en';
  const segmenter = makeSegmenter(lang);

  for (const block of getBlocks(doc)) {
    const nodes = collectRangeTextNodes(block, doc);
    if (!nodes.length) continue;

    // A *text-node* range spanning the block, so "highlight paragraph" draws cleanly (the raw
    // element-boundary block range doesn't map to a drawable highlight the way text nodes do), and
    // tight, so it stays inside its own block — getBlocks ends a block only at the NEXT block
    // element, which for the last `<li>` of a list is the paragraph after `</ul>`.
    const blockRange = tightSpan(nodes, doc);
    if (!blockRange) continue;

    if (!segmenter) {
      // No sentence segmentation available — read the block as one unit.
      const u = paragraphUnit(nodes, doc);
      if (u) units.push(tagBlock(u, blockRange));
      continue;
    }
    const sentences = segmentBlock(nodes, segmenter, doc);
    const blockUnits = maxChars > 0 ? chunkSentences(sentences, maxChars, doc) : sentences;
    units.push(...blockUnits.map((u) => tagBlock(u, blockRange)));
  }
  return units;
}

/**
 * Index of the unit to start reading from given the current page's anchor range
 * (from foliate's relocate event) — the last unit that starts at or before the
 * page anchor, i.e. the sentence the page currently opens on.
 */
export function unitIndexForRange(units: ReadingUnit[], pageRange: Range | null): number {
  if (!pageRange || !units.length) return 0;
  let idx = 0;
  for (let i = 0; i < units.length; i++) {
    try {
      if (pageRange.compareBoundaryPoints(Range.START_TO_START, units[i].range) >= 0) idx = i;
      else break;
    } catch {
      break; // ranges in different documents — bail to the start.
    }
  }
  return idx;
}

/**
 * The unit a contents anchor opens on — where a chapter begins inside a file that holds several.
 *
 * **One answer for two callers.** The player lands on this unit when ⏭ steps to a contents entry, and the recorder
 * starts that chapter's MP3 at it. Two resolvers would eventually disagree, and the symptom would be an MP3 whose
 * first sentence is not the sentence the reader sees.
 *
 * `name=` is accepted alongside `id=`, since older EPUBs anchor their contents with `<a name="ch1">`. Returns -1
 * when the anchor is not in this document at all — a different file, or a contents page pointing at nothing.
 */
export function unitIndexForAnchor(units: ReadingUnit[], doc: Document, anchor: string): number {
  if (!anchor || !units.length) return -1;
  let el: Element | null;
  try {
    el = doc.getElementById(anchor) ?? doc.querySelector(`[name="${anchor.replace(/["\\]/g, '\\$&')}"]`);
  } catch {
    el = null;
  }
  if (!el) return -1;
  const range = doc.createRange();
  range.selectNodeContents(el);
  const idx = unitIndexForRange(units, range);
  // **An anchor's boundary sits before its own text, so the rule above lands one unit early.** `selectNodeContents`
  // starts the range at (element, 0) — before the element's first child — while a reading unit starts inside the
  // text node itself, and (h2, 0) precedes (text, 0) in document order. So the last-unit-at-or-before a `<h2 id>`
  // anchor is the paragraph ABOVE the heading, and an empty `<a name>` between two paragraphs answers with the
  // paragraph before it. Either way a chapter would open on the closing sentence of the one before it. Step forward
  // when the unit found ends at or before where the anchor begins.
  try {
    if (units[idx].range.compareBoundaryPoints(Range.START_TO_END, range) <= 0) {
      return Math.min(idx + 1, units.length - 1);
    }
  } catch {
    /* keep the unit found */
  }
  return idx;
}
