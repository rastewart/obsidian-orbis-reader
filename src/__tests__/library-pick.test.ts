import { describe, expect, it } from 'vitest';
import { pickable, pickTitles } from '../library/pick';

const pool = (n: number) => Array.from({ length: n }, (_, i) => ({ notePath: `Titles/book-${i}.md` }));

describe('pickTitles', () => {
  // The whole point: the Library repaints on every vault change, and a suggestion that changed each time would be
  // gone before you decided about it.
  it('picks the same titles for the same seed', () => {
    expect(pickTitles(pool(50), 7, 1)).toEqual(pickTitles(pool(50), 7, 1));
  });

  it('picks different titles for a different seed', () => {
    const rolls = new Set(Array.from({ length: 8 }, (_, seed) => pickTitles(pool(50), seed, 1)[0].notePath));
    expect(rolls.size).toBeGreaterThan(1);
  });

  // Cataloging a book must not deal a whole new hand: everything already in the pool keeps its place.
  it('is stable when the pool grows', () => {
    const before = pickTitles(pool(50), 3, 5);
    const after = pickTitles([...pool(50), { notePath: 'Titles/newcomer.md' }], 3, 6);
    expect(after.filter((p) => p.notePath !== 'Titles/newcomer.md').slice(0, 5)).toEqual(before);
  });

  it('copes with a pool smaller than the count, and with no pool at all', () => {
    expect(pickTitles(pool(2), 1, 5)).toHaveLength(2);
    expect(pickTitles([], 1, 5)).toEqual([]);
    expect(pickTitles(pool(5), 1, 0)).toEqual([]);
  });
});

describe('pickable', () => {
  const titles = [
    { notePath: 'a.md', status: null, hasFile: true },
    { notePath: 'b.md', status: 'reading', hasFile: true },
    { notePath: 'c.md', status: 'interested', hasFile: true },
    { notePath: 'd.md', status: null, hasFile: false },
  ];
  const facts = (t: (typeof titles)[number]) => ({ status: t.status, hasFile: t.hasFile });
  const paths = (out: typeof titles) => out.map((t) => t.notePath);

  /**
   * **Any status takes a title out, "want to read" included.** A status is a decision about a book and a suggestion
   * is for the books nobody has decided about — a flagged book is one you have already picked. The pool someone has
   * flagged is a different question, answered by a collection of that status with a pick of its own.
   */
  it('suggests only titles with no reading status, by default', () => {
    expect(paths(pickable(titles, {}, facts))).toEqual(['a.md', 'd.md']);
    expect(paths(pickable(titles, { pool: 'no-status' }, facts))).toEqual(['a.md', 'd.md']);
  });

  it('suggests anything when told to', () => {
    expect(paths(pickable(titles, { pool: 'any' }, facts))).toEqual(['a.md', 'b.md', 'c.md', 'd.md']);
  });

  /**
   * **A title with no book file is suggested unless the widget says otherwise.** A library item is a note and its
   * file is optional: a book owned in print is worth being reminded of, and its row opens the title note. This is
   * the half no collection can express — a frontmatter link says nothing about whether its target exists.
   */
  it('keeps titles with no book file until asked not to', () => {
    expect(paths(pickable(titles, {}, facts))).toContain('d.md');
    expect(paths(pickable(titles, { requiresFile: true }, facts))).toEqual(['a.md']);
    expect(paths(pickable(titles, { pool: 'any', requiresFile: true }, facts))).toEqual(['a.md', 'b.md', 'c.md']);
  });

  // Deliberately NOT "never opened": a book you opened once and put down is exactly
  // what a suggestion is for, and a book you are part way through says so by carrying a status.
  it('says nothing about whether a title has been opened', () => {
    const started = [{ notePath: 'a.md', status: null, hasFile: true }];
    expect(paths(pickable(started, {}, facts))).toEqual(['a.md']);
  });
});
