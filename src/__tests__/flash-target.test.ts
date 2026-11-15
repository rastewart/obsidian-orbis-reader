import { describe, expect, it } from 'vitest';
import { flashTarget } from '../reader/flash-target';

describe('flashTarget', () => {
  // The passage a highlight, a note or a bookmark names — the case the landing flash exists for.
  it('flashes the position a CFI names', () => {
    expect(flashTarget({ cfi: 'epubcfi(/6/14!/4/2,/1:0,/1:24)' })).toBe('epubcfi(/6/14!/4/2,/1:0,/1:24)');
  });

  /**
   * **A chapter, a location and a percentage have no passage in them.** Each lands you on a page without saying which
   * lines were the point, so there is nothing to outline: outlining a whole chapter would be noise, and guessing a
   * line from a percentage would be precision that is not there. They arrive unmarked, which is the honest answer.
   */
  it('flashes nothing for a destination that names no passage', () => {
    expect(flashTarget({ href: 'chapter-3.xhtml' })).toBeNull();
    expect(flashTarget({ loc: 412 })).toBeNull();
    expect(flashTarget({ pct: 50 })).toBeNull();
    expect(flashTarget({})).toBeNull();
  });

  // A link carrying `cfi=` with nothing after it is a link with no position. Asking the overlay to resolve an empty
  // string would be a flash request that can only fail.
  it('treats a blank CFI as no position at all', () => {
    expect(flashTarget({ cfi: '' })).toBeNull();
    expect(flashTarget({ cfi: '   ' })).toBeNull();
    expect(flashTarget({ cfi: null })).toBeNull();
  });

  // A destination can carry both — the deep link reads every parameter it is given. The CFI wins, because it is the
  // only one of them that says where on the page to look.
  it('prefers the CFI when a destination names more than one thing', () => {
    expect(flashTarget({ cfi: 'epubcfi(/6/4)', href: 'ch1.xhtml', loc: 12, pct: 3 })).toBe('epubcfi(/6/4)');
  });
});
