import { describe, expect, it } from 'vitest';
import { closeGaps, collapseWhitespace, columnWidths, type Measure, sanitizeForPdf, wrapLines } from '../pdf-layout';

/** The lines as plain strings — what most of these tests care about. Offsets have their own block below. */
const wrap = (text: string, width: number, measure: Measure): string[] =>
  wrapLines(text, width, measure).map((l) => l.text);

/** A monospace stand-in for `font.widthOfTextAtSize`: every character is one unit wide, so a "width" in these
 *  tests is a character count and the expected breaks are readable. */
const mono: Measure = (text) => text.length;

describe('wrapLines', () => {
  it('breaks on spaces at the last word that fits', () => {
    expect(wrap('the quick brown fox jumps', 10, mono)).toEqual(['the quick', 'brown fox', 'jumps']);
  });

  it('keeps existing paragraph breaks', () => {
    // A quoted passage can span paragraphs, and running them together changes what was said.
    expect(wrap('one\n\ntwo', 10, mono)).toEqual(['one', '', 'two']);
  });

  it('BREAKS a word too long for the line rather than letting it overflow', () => {
    // A URL or a file path in a quoted passage is exactly this case, and a PDF painting it past the margin
    // loses text with nothing on the page to say so.
    expect(wrap('aaaaaaaaaaaaaaa', 5, mono)).toEqual(['aaaaa', 'aaaaa', 'aaaaa']);
  });

  it('finishes the line it was on before breaking a long word', () => {
    expect(wrap('hi aaaaaaaa', 5, mono)).toEqual(['hi', 'aaaaa', 'aaa']);
  });

  it('PRESERVES runs of whitespace, because a line has to be a real slice of the input', () => {
    // No collapsing here: the text a line reports must be findable at the offsets it reports, so collapsing belongs to
    // a caller that runs first.
    expect(wrap('a    b', 10, mono)).toEqual(['a    b']);
    expect(wrap(collapseWhitespace('a    b'), 10, mono)).toEqual(['a b']);
  });

  it('survives an empty string without emitting a phantom line', () => {
    expect(wrap('', 10, mono)).toEqual(['']);
  });
});

describe('sanitizeForPdf', () => {
  it('leaves the typography a word processor inserts alone, because WinAnsi has it', () => {
    // Not mapped to ASCII: they are all in CP1252, and `…` → `...` would change the string's LENGTH, which is fatal
    // once marks are stored as offsets into it.
    const typo = '“curly” ‘quotes’ and… a – dash — and a • bullet';
    expect(sanitizeForPdf(typo)).toBe(typo);
  });

  it('PRESERVES length, which every mark offset depends on', () => {
    // A mark is a range over the document's text. If sanitizing can shift an index, every mark after the first
    // unencodable character lands somewhere it was not.
    for (const text of ['plain', '日本語 text', 'emoji 🟡 here', 'mixed 🎉 日本 ok']) {
      expect(sanitizeForPdf(text)).toHaveLength(text.length);
    }
  });

  it('keeps accented Latin, which WinAnsi does encode', () => {
    expect(sanitizeForPdf('café — naïve')).toBe('café — naïve');
  });

  it('leaves a space where an emoji was, not a question mark', () => {
    // A `?` in place of a mark badge is noise, and the mark's NAME is carried alongside it anyway. Two
    // spaces, because the emoji is a surrogate pair and what follows it must not move.
    expect(sanitizeForPdf('🟡 Follow up')).toBe('   Follow up');
  });

  it('keeps whatever the caller says the font can draw', () => {
    // With DejaVu installed the writer passes the union of the embedded faces, so an arrow, Greek and Cyrillic
    // survive instead of becoming the `?` the built-in fonts force.
    const dejavu = (code: number): boolean => code < 0x3000;
    expect(sanitizeForPdf('↩ → α д ≤ ∞', dejavu)).toBe('↩ → α д ≤ ∞');
    // And what even that cannot draw still degrades rather than throwing inside pdf-lib.
    expect(sanitizeForPdf('日本語', dejavu)).toBe('???');
  });

  it('marks anything else as unrepresentable rather than dropping it silently', () => {
    // A Greek or CJK passage should not vanish without trace — the `?` is the signal that a font would be needed,
    // rather than a silent loss.
    expect(sanitizeForPdf('日本語')).toBe('???');
  });
});

/**
 * The other half of the length-preserving substitution above: once nothing is counting characters any more, the
 * hole it leaves is just a hole. Headings pass through here; anything carrying `spans` must not.
 */
describe('closeGaps', () => {
  it('closes the hole a stripped emoji leaves in a heading', () => {
    // A hole must not survive into a heading: `Phase 7: Accessibility ✅ (see §5.3)` must not print as
    // `Accessibility␣␣␣(see`.
    expect(closeGaps(sanitizeForPdf('Phase 7: Accessibility ✅ (see §5.3)'))).toBe('Phase 7: Accessibility (see §5.3)');
  });

  it('trims a heading that began or ended with one', () => {
    expect(closeGaps(sanitizeForPdf('🟡 Follow up'))).toBe('Follow up');
    expect(closeGaps(sanitizeForPdf('Done ✅'))).toBe('Done');
  });

  it('leaves a heading that lost nothing exactly as it was', () => {
    expect(closeGaps('Plugin Architecture Overview')).toBe('Plugin Architecture Overview');
  });

  it('does not touch a single space, which is the ordinary case', () => {
    expect(closeGaps('one two three')).toBe('one two three');
  });
});

describe('code, which keeps the shape it was written in', () => {
  it('keeps leading indentation when asked, and drops it otherwise', () => {
    // Preserving the newlines and then dropping the indentation gives you code shaped like a paragraph, which is
    // the one thing a code block exists not to be.
    const code = 'function f() {\n  const x = 1;\n}';
    expect(wrapLines(code, 40, mono, { keepIndent: true }).map((l) => l.text)).toEqual([
      'function f() {',
      '  const x = 1;',
      '}',
    ]);
    expect(wrap(code, 40, mono)).toEqual(['function f() {', 'const x = 1;', '}']);
  });

  it('still reports offsets that slice back to the same text', () => {
    const code = '    deeply indented';
    for (const line of wrapLines(code, 40, mono, { keepIndent: true })) {
      expect(code.slice(line.start, line.end)).toBe(line.text);
    }
  });
});

describe('columnWidths', () => {
  const sum = (ws: number[]): number => ws.reduce((a, b) => a + b, 0);

  it('leaves a table that already fits alone', () => {
    // Stretching three short columns across the page suggests a relationship between the values that their widths
    // were never claiming.
    expect(columnWidths([50, 30, 20], 500, [20, 20, 20])).toEqual([50, 30, 20]);
  });

  it('scales in proportion to what each column asked for', () => {
    const widths = columnWidths([300, 100, 100], 250, [10, 10, 10]);
    expect(sum(widths)).toBeCloseTo(250);
    // The wide column stays the wide one: a column of dates should not end up as roomy as a column of sentences.
    expect(widths[0]).toBeGreaterThan(widths[1] * 2.5);
  });

  it('gives every column room for its longest word', () => {
    // The defect this floor exists for: proportional scaling would give a `Meaning` header beside a column of sentences
    // a share too narrow for the word, breaking it as `Meanin` / `g`.
    const widths = columnWidths([2000, 40], 400, [30, 40]);
    expect(widths[1]).toBeCloseTo(40);
    expect(sum(widths)).toBeCloseTo(400);
  });

  it('never takes a column below its own floor to pay for another’s', () => {
    const min = [60, 50, 40];
    const widths = columnWidths([600, 300, 45], 300, min);
    expect(sum(widths)).toBeCloseTo(300);
    for (const [i, w] of widths.entries()) expect(w).toBeGreaterThanOrEqual(Math.min(min[i], 45) - 0.001);
  });

  it('scales the floors together when even they will not fit', () => {
    // More columns than the page can carry at any readable width. Words break; there is no layout that avoids it.
    const widths = columnWidths([100, 100, 100, 100], 100, [60, 60, 60, 60]);
    expect(sum(widths)).toBeCloseTo(100);
    for (const w of widths) expect(w).toBeCloseTo(25);
  });

  it('never asks for more than the column would use unwrapped', () => {
    // A floor above the column's natural width would reserve room for text that is not there.
    expect(columnWidths([500, 10], 300, [50, 400])[1]).toBeLessThanOrEqual(10);
  });

  it('survives a table with no columns', () => {
    expect(columnWidths([], 500, [])).toEqual([]);
  });
});

describe('the offsets a wrapped line carries', () => {
  // They are what let a mark cover PART of a line: a highlight is a range over the document's text, so drawing
  // it accurately means knowing which characters of which line it covers.
  it('reports a real slice of the source for every line', () => {
    const text = 'the quick brown fox jumps';
    for (const line of wrapLines(text, 10, mono)) {
      expect(text.slice(line.start, line.end)).toBe(line.text);
    }
  });

  it('advances past the whitespace it broke on', () => {
    const lines = wrapLines('the quick brown fox', 10, mono);
    expect(lines.map((l) => [l.start, l.end])).toEqual([
      [0, 9],
      [10, 19],
    ]);
  });

  it('keeps offsets correct through a broken long word', () => {
    const text = 'hi aaaaaaaa';
    const lines = wrapLines(text, 5, mono);
    expect(lines.map((l) => l.text)).toEqual(['hi', 'aaaaa', 'aaa']);
    for (const line of lines) expect(text.slice(line.start, line.end)).toBe(line.text);
  });
});

describe('sanitizeForPdf, keeping pictures', () => {
  it('keeps a picture whole and every other offset where it was', () => {
    const keep = (g: string) => g === '👍🏽';
    const out = sanitizeForPdf('a👍🏽b→c', undefined, keep);
    expect(out).toBe('a👍🏽b?c');
    expect(out.length).toBe('a👍🏽b→c'.length);
  });
});
