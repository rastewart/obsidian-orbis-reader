import { describe, expect, it } from 'vitest';
import { getReadingUnits, unitIndexForAnchor } from '../reader/tts/tts-blocks';
import { splitRangeForRects as untypedSplit } from '../vendor/foliate-js/overlayer.js';

const splitRangeForRects = untypedSplit as (range: Range) => Range[];

/** Pretty-printed section XHTML, exactly as a converted note (and most real EPUBs) is laid out:
 *  a newline text node after every close tag. The whitespace is the whole point of these tests. */
const BLOG = `<!DOCTYPE html><html lang="en"><body>
<h1>Frontier lab economics: tax the exit, lobby against the free</h1>
<p>Tuesday morning saw the Treasury Secretary on Fox Business. He left sanctions on the table.</p>
<h2>The <em>Amazon</em> contract</h2>
<ul>
<li>Efficiency gains will now accrue to Anthropic, not Amazon.</li>
<li>In the runup to a presumed IPO, this cleans up related-party cases. “Everyone pays us per token” is a lot cleaner structurally.</li>
</ul>
<p>This may well be structurally intended.</p>
</body></html>`;

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

/**
 * Whether the overlay would paint anything for `range`: foliate's own split, which decides what the overlayer
 * measures, gives back at least one piece with text in it. Asserted on rather than rect geometry, which jsdom has
 * none of. Before ORBIS patch 15 the split kept only `<p>` elements, so a heading's range that had leaked out to
 * `<body>` painted nothing.
 */
function paints(range: Range): boolean {
  return splitRangeForRects(range).some((piece) => piece.toString().trim() !== '');
}

/** The block element a unit sits in, per the tag list getBlocks walks. */
function blockOf(node: Node): Element | null {
  let el: Node | null = node.nodeType === 1 ? node : node.parentNode;
  while (el && el.nodeType === 1) {
    if (/^(p|h[1-6]|li|blockquote|figcaption|dt|dd|div|section|body)$/i.test((el as Element).tagName)) {
      return el as Element;
    }
    el = el.parentNode;
  }
  return null;
}

describe('getReadingUnits — every unit paints', () => {
  const doc = parse(BLOG);
  const units = getReadingUnits(doc, 0);

  it('reads the headings and list items as units', () => {
    const texts = units.map((u) => u.text);
    expect(texts).toContain('Frontier lab economics: tax the exit, lobby against the free');
    expect(texts).toContain('The Amazon contract');
    expect(texts).toContain('“Everyone pays us per token” is a lot cleaner structurally.');
  });

  it('paints every one of them — including the blocks that are not paragraphs', () => {
    // The bug: a heading, and the last sentence of the last <li>, painted nothing at all. Both had
    // ranges that ran past their own close tag into the inter-element whitespace, taking the cAC out
    // to <body>, where foliate's paragraph clipping finds nothing to clip to. A paragraph's leaked
    // range still intersects its own <p>, which is why paragraphs never showed the bug.
    const dead = units.filter((u) => !paints(u.range)).map((u) => u.text);
    expect(dead).toEqual([]);
  });

  it('paints every block range too (paragraph highlight mode)', () => {
    const dead = units.filter((u) => u.block && !paints(u.block)).map((u) => u.text);
    expect(dead).toEqual([]);
  });

  it('keeps each unit range inside its own block element', () => {
    for (const u of units) {
      const block = blockOf(u.range.startContainer);
      expect(block).not.toBeNull();
      expect(block?.contains(u.range.commonAncestorContainer)).toBe(true);
      expect(block?.contains(u.range.endContainer)).toBe(true);
    }
  });

  it('has no range starting or ending on whitespace', () => {
    // Which is also what removes the trailing-space rect from the end of a highlighted sentence.
    for (const u of units) {
      const drawn = u.range.toString();
      expect(drawn).toBe(drawn.trim());
      if (u.block) expect(u.block.toString()).toBe(u.block.toString().trim());
    }
  });
});

describe('getReadingUnits — the last sentence of a block', () => {
  it('stops at the close tag for a heading', () => {
    const doc = parse(
      '<!DOCTYPE html><html lang="en"><body>\n<h1>A title with no period</h1>\n<p>Body.</p>\n</body></html>'
    );
    const heading = getReadingUnits(doc, 0)[0];
    expect(heading.text).toBe('A title with no period');
    expect(doc.querySelector('h1')?.contains(heading.range.commonAncestorContainer)).toBe(true);
    expect(paints(heading.range)).toBe(true);
  });

  it('stops at the close tag for a list item — whose block otherwise runs past </ul>', () => {
    const doc = parse(
      '<!DOCTYPE html><html lang="en"><body>\n<p>Lead in.</p>\n<ul>\n<li>Only item.</li>\n</ul>\n<p>After.</p>\n</body></html>'
    );
    const item = getReadingUnits(doc, 0).find((u) => u.text === 'Only item.');
    expect(item).toBeDefined();
    expect(doc.querySelector('li')?.contains(item?.range.commonAncestorContainer as Node)).toBe(true);
    expect(paints(item?.range as Range)).toBe(true);
  });

  it('still spans both nodes when a sentence crosses inline markup', () => {
    const doc = parse(
      '<!DOCTYPE html><html lang="en"><body>\n<h2>The <em>Amazon</em> contract</h2>\n<p>x.</p>\n</body></html>'
    );
    const unit = getReadingUnits(doc, 0)[0];
    expect(unit.range.toString()).toBe('The Amazon contract');
    expect(unit.range.startContainer).not.toBe(unit.range.endContainer);
    expect(paints(unit.range)).toBe(true);
  });
});

describe('getReadingUnits — nothing to say, nothing to read', () => {
  const texts = (html: string) => getReadingUnits(parse(html), 0).map((u) => u.text);

  it('drops a block that is only punctuation', () => {
    // Straight from a converted note whose markdown link was malformed: `](` became its own paragraph, and
    // each such fragment cost a whole synthesis request — one came back with 250KB of audio for one character.
    expect(texts('<!DOCTYPE html><body>\n<p>](</p>\n<p>Real text here.</p>\n</body>')).toEqual(['Real text here.']);
  });

  it('leaves stray punctuation attached to the sentence it follows', () => {
    // Not a case the filter has to handle, and the reason is worth pinning: the Unicode sentence-break
    // algorithm keeps trailing punctuation with the sentence before it, so `?!` never becomes a unit of its
    // own. Only a punctuation fragment that is its own BLOCK does — which is the case above, and the case
    // that was costing a synthesis request each.
    expect(texts('<!DOCTYPE html><body>\n<p>First one. ?! Second one.</p>\n</body>')).toEqual([
      'First one. ?!',
      'Second one.',
    ]);
  });

  it('drops an em dash or ellipsis on its own', () => {
    expect(texts('<!DOCTYPE html><body>\n<p>—</p>\n<p>…</p>\n<p>Words.</p>\n</body>')).toEqual(['Words.']);
  });

  it('keeps a unit that is only a number', () => {
    // "1949." is a section heading in plenty of books, and a year is perfectly speakable.
    expect(texts('<!DOCTYPE html><body>\n<h2>1949.</h2>\n<p>Words.</p>\n</body>')).toEqual(['1949.', 'Words.']);
  });

  it('keeps a currency amount', () => {
    expect(texts('<!DOCTYPE html><body>\n<p>$5.</p>\n</body>')).toEqual(['$5.']);
  });

  it('keeps non-Latin script, which an ASCII test would have thrown away', () => {
    // `\w` is ASCII-only, so it would drop these blocks wholesale — hence \p{L}.
    expect(texts('<!DOCTYPE html><body>\n<p>日本語。</p>\n<p>Ελληνικά.</p>\n</body>')).toEqual([
      '日本語。',
      'Ελληνικά.',
    ]);
  });
});

describe('getReadingUnits — chunking keeps ranges tight', () => {
  const doc = parse(BLOG);
  const units = getReadingUnits(doc, 600);

  it('merges consecutive sentences within a block', () => {
    const merged = units.find((u) => (u.sentences?.length ?? 0) > 1);
    expect(merged).toBeDefined();
  });

  it('paints the merged chunks and their constituent sentences', () => {
    for (const u of units) {
      expect(paints(u.range)).toBe(true);
      for (const s of u.sentences ?? []) expect(paints(s.range)).toBe(true);
    }
  });
});

// Where a chapter begins inside a file that holds several of them. The player lands on this unit
// when ⏭ steps to a contents entry, and the recorder starts that chapter's MP3 at it — so the two
// share one resolver, and this is it.
describe('unitIndexForAnchor', () => {
  const DEVOTIONAL = `<!DOCTYPE html><html lang="en"><body>
<p>A preface, above the first Day.</p>
<h2 id="day1">Day 1</h2>
<p>The first day's reading.</p>
<h2 id="day2">Day 2</h2>
<p>The second day's reading.</p>
</body></html>`;

  it('lands on the heading the contents entry points at', () => {
    const doc = parse(DEVOTIONAL);
    const units = getReadingUnits(doc, 0);
    const idx = unitIndexForAnchor(units, doc, 'day2');
    expect(units[idx].text).toBe('Day 2');
  });

  /**
   * An `<a name>` with no text of its own falls BEFORE the chapter's first unit, where the
   * last-unit-at-or-before rule answers with the unit above — which would open every chapter on the
   * closing sentence of the one before it.
   */
  it('steps past an empty anchor rather than opening on the previous chapter', () => {
    const doc = parse(`<!DOCTYPE html><html lang="en"><body>
<p>The end of Day 1.</p>
<a name="day2"></a>
<p>The start of Day 2.</p>
</body></html>`);
    const units = getReadingUnits(doc, 0);
    const idx = unitIndexForAnchor(units, doc, 'day2');
    expect(units[idx].text).toBe('The start of Day 2.');
  });

  it('is -1 for an anchor that is not in this document', () => {
    const doc = parse(DEVOTIONAL);
    expect(unitIndexForAnchor(getReadingUnits(doc, 0), doc, 'day9')).toBe(-1);
  });
});
