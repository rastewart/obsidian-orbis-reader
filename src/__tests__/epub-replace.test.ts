import { describe, expect, it } from 'vitest';
import { type ReplaceCheck, setReplaceMessage, setSavedNotice } from '../epub-replace';

const check = (change: ReplaceCheck['change'], annotated = false): ReplaceCheck => ({ change, annotated });

describe('setReplaceMessage', () => {
  it('asks nothing when no book with saved content has changed text', () => {
    // Books already there, some changed, some with annotations — but never both at once: nothing can move.
    expect(setReplaceMessage([check('identical'), check('same-text'), check('text-changed'), check('new')])).toBeNull();
  });

  it('counts only the changed books with something saved in them, and agrees with the count', () => {
    const one = setReplaceMessage([check('text-changed', true), check('text-changed'), check('identical')]);
    expect(one).toBe(
      '1 of the previously generated EPUBs has annotations, and its source changed after generation. Annotations are kept, however they may be in the wrong place when it is regenerated.'
    );
    const two = setReplaceMessage([check('text-changed', true), check('text-changed', true)]);
    expect(two).toMatch(
      /^2 of the previously generated EPUBs have .* their sources changed .* when they are regenerated\.$/
    );
  });
});

describe('setSavedNotice', () => {
  it('says how many were written, and that the rest needed nothing', () => {
    expect(setSavedNotice(6, 6, 'F')).toBe('Saved 6 EPUBs to F.');
    expect(setSavedNotice(1, 1, 'F')).toBe('Saved 1 EPUB to F.');
    expect(setSavedNotice(2, 6, 'F')).toBe('Saved 2 of 6 EPUBs to F. The rest were already up to date.');
    expect(setSavedNotice(0, 6, 'F')).toBe('Every EPUB in F is already up to date.');
  });
});
