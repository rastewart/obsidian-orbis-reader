import { describe, expect, it } from 'vitest';
import { SearchController } from '../reader/SearchController';

// The same controller serves every book opened in the tab, so a book closing has to take its Advanced search with it.
describe('Advanced search across books in one tab', () => {
  it('starts from book text alone once the book is closed', () => {
    const search = new SearchController({} as never, {} as never);
    const inside = search as unknown as {
      scope: { bookText: boolean; passages: boolean; noteAnchors: boolean; noteContent: boolean };
      markFilter: Set<string>;
      caseSensitive: boolean;
      wholeWord: boolean;
    };
    inside.scope = { bookText: false, passages: true, noteAnchors: false, noteContent: true };
    inside.markFilter = new Set(['quote']);
    inside.caseSensitive = true;
    inside.wholeWord = true;
    expect(search.advancedActive).toBe(true);
    search.dispose();
    expect(search.advancedActive).toBe(false);
  });
});

// With Book text alone the mark section dims and filters nothing, so marks left in it must not light the button.
describe('a mark filter with no scope it can filter', () => {
  it('leaves Advanced search at its default', () => {
    const search = new SearchController({} as never, {} as never);
    const inside = search as unknown as { markFilter: Set<string>; scope: Record<string, boolean> };
    inside.markFilter = new Set(['quote']);
    expect(search.advancedActive).toBe(false);
    inside.scope = { bookText: true, passages: true, noteAnchors: false, noteContent: false };
    expect(search.advancedActive).toBe(true);
  });
});
