import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type CollectionCandidate,
  countRules,
  isInFolder,
  matchesCollection,
  matchesRule,
  matchesRuleSet,
  normalizeTag,
  operatorsFor,
  operatorTakesValue,
  rulesFromLegacyCollection,
} from '../library/collection';
import type { CalendarDate } from '../library/dates';
import { setLibraryFields } from '../library/fields';
import {
  type CollectionRule,
  type CollectionRuleSet,
  type LibraryCollection,
  RULE_FIELD_FOLDER,
  RULE_FIELD_TAG,
  type RuleOperator,
} from '../settings';

const rule = (field: string, op: CollectionRule['op'], value = ''): CollectionRule => ({ field, op, value });

const collection = (ruleSets: CollectionRuleSet[]): LibraryCollection => ({
  id: 's1',
  name: 'Books',
  ruleSets,
});

const note = (over: Partial<CollectionCandidate> = {}): CollectionCandidate => ({
  path: 'Books/Fiction/Sample.md',
  tags: ['scifi'],
  frontmatter: { title: 'Sample-Book', source: 'calibre', authors: ['Tester, Orbis', 'Someone Else'] },
  ...over,
});

describe('isInFolder', () => {
  it('matches a note in the folder and below it', () => {
    expect(isInFolder('Books/Sample.md', 'Books', true)).toBe(true);
    expect(isInFolder('Books/Fiction/Sample.md', 'Books', true)).toBe(true);
  });

  it('excludes subfolders when asked to', () => {
    expect(isInFolder('Books/Sample.md', 'Books', false)).toBe(true);
    expect(isInFolder('Books/Fiction/Sample.md', 'Books', false)).toBe(false);
  });

  // A prefix comparison pulls in the neighbor silently, which is the kind of bug you only notice as
  // "why is that on my collection".
  it('does not match a folder that merely shares a prefix', () => {
    expect(isInFolder('Books2/Sample.md', 'Books', true)).toBe(false);
    expect(isInFolder('BooksArchive/Sample.md', 'Books', true)).toBe(false);
  });

  it('is not fooled by leading or trailing slashes', () => {
    expect(isInFolder('Books/Sample.md', '/Books/', true)).toBe(true);
  });

  it('treats an empty folder as anywhere, or as the vault root', () => {
    expect(isInFolder('anywhere/deep/x.md', '', true)).toBe(true);
    expect(isInFolder('root.md', '', false)).toBe(true);
    expect(isInFolder('deep/x.md', '', false)).toBe(false);
  });
});

describe('normalizeTag', () => {
  it('strips the hash and lowercases', () => {
    expect(normalizeTag('#SciFi')).toBe('scifi');
    expect(normalizeTag(' scifi ')).toBe('scifi');
    expect(normalizeTag('')).toBe('');
  });
});

describe('operatorsFor', () => {
  // A folder is not "contained", it is entered — offering `contains` on one would invite a rule that never fires.
  it('offers only what the field can mean', () => {
    expect(operatorsFor(RULE_FIELD_FOLDER)).toEqual(['under', 'directly-in']);
    expect(operatorsFor(RULE_FIELD_TAG)).toContain('is');
    expect(operatorsFor(RULE_FIELD_TAG)).not.toContain('contains');
    expect(operatorsFor('source')).toEqual(['is', 'is-not', 'contains', 'exists', 'not-exists']);
  });

  it('knows which operators use the value box', () => {
    expect(operatorTakesValue('is')).toBe(true);
    expect(operatorTakesValue('contains')).toBe(true);
    expect(operatorTakesValue('exists')).toBe(false);
    expect(operatorTakesValue('not-exists')).toBe(false);
  });
});

describe('matchesRule', () => {
  it('matches a folder, with and without subfolders', () => {
    expect(matchesRule(rule(RULE_FIELD_FOLDER, 'under', 'Books'), note())).toBe(true);
    expect(matchesRule(rule(RULE_FIELD_FOLDER, 'directly-in', 'Books'), note())).toBe(false);
    expect(matchesRule(rule(RULE_FIELD_FOLDER, 'directly-in', 'Books/Fiction'), note())).toBe(true);
    expect(matchesRule(rule(RULE_FIELD_FOLDER, 'under', 'Media'), note())).toBe(false);
  });

  it('matches a tag, including a nested child, as Obsidian does', () => {
    expect(matchesRule(rule(RULE_FIELD_TAG, 'is', 'scifi'), note())).toBe(true);
    expect(matchesRule(rule(RULE_FIELD_TAG, 'is', '#SciFi'), note())).toBe(true);
    expect(matchesRule(rule(RULE_FIELD_TAG, 'is', 'library'), note({ tags: ['library/wishlist'] }))).toBe(true);
    expect(matchesRule(rule(RULE_FIELD_TAG, 'is', 'poetry'), note())).toBe(false);
    expect(matchesRule(rule(RULE_FIELD_TAG, 'exists'), note({ tags: [] }))).toBe(false);
    expect(matchesRule(rule(RULE_FIELD_TAG, 'not-exists'), note({ tags: [] }))).toBe(true);
  });

  it('matches a frontmatter value', () => {
    expect(matchesRule(rule('source', 'is', 'calibre'), note())).toBe(true);
    expect(matchesRule(rule('source', 'is', 'CALIBRE'), note())).toBe(true);
    expect(matchesRule(rule('source', 'is', 'logos'), note())).toBe(false);
    expect(matchesRule(rule('title', 'contains', 'sample'), note())).toBe(true);
    expect(matchesRule(rule('title', 'contains', 'ferry'), note())).toBe(false);
  });

  it('treats a list field as a set of candidate values', () => {
    expect(matchesRule(rule('authors', 'is', 'Tester, Orbis'), note())).toBe(true);
    expect(matchesRule(rule('authors', 'contains', 'tester'), note())).toBe(true);
  });

  // `is not` is a statement about the whole field. Reading it as "some value differs" would make it true for
  // nearly every multi-valued field, which is never what anyone meant.
  it('reads is-not over the whole field, not one of its values', () => {
    expect(matchesRule(rule('authors', 'is-not', 'Tester, Orbis'), note())).toBe(false);
    expect(matchesRule(rule('authors', 'is-not', 'Nobody'), note())).toBe(true);
    // A note with no author at all is indeed not by them.
    expect(matchesRule(rule('authors', 'is-not', 'Tester, Orbis'), note({ frontmatter: {} }))).toBe(true);
  });

  it('asks only whether there is anything there for exists', () => {
    expect(matchesRule(rule('source', 'exists'), note())).toBe(true);
    expect(matchesRule(rule('isbn', 'exists'), note())).toBe(false);
    expect(matchesRule(rule('isbn', 'exists'), note({ frontmatter: { isbn: '  ' } }))).toBe(false);
    expect(matchesRule(rule('isbn', 'not-exists'), note())).toBe(true);
  });

  // A rule that read the raw key and nothing else would let a collection exclude the very records whose rows show
  // the field it filters on: `files exists` would be false for every note that writes `epub_link`, while the row it
  // draws has a working Read button. Filtering and display have to agree about what the note says.
  describe('with a field table in force', () => {
    beforeEach(() => setLibraryFields([{ key: 'files', keys: ['files', 'epub_link'] }]));
    afterEach(() => setLibraryFields([]));

    it('reads a rule’s field through its aliases', () => {
      const aliased = note({ frontmatter: { epub_link: '[[Sample.epub]]' } });
      expect(matchesRule(rule('files', 'exists'), aliased)).toBe(true);
      expect(matchesRule(rule('files', 'contains', 'sample'), aliased)).toBe(true);
      expect(matchesRule(rule('files', 'not-exists'), aliased)).toBe(false);
    });

    it('leaves a field nobody has described reading its own key', () => {
      expect(matchesRule(rule('isbn', 'exists'), note({ frontmatter: { epub_link: 'x' } }))).toBe(false);
    });
  });
});

describe('matchesRuleSet', () => {
  const folderRule = rule(RULE_FIELD_FOLDER, 'under', 'Books');
  const wrongSource = rule('source', 'is', 'logos');

  it('requires every rule with all, and one with any', () => {
    expect(matchesRuleSet({ match: 'all', rules: [folderRule, wrongSource] }, note())).toBe(false);
    expect(matchesRuleSet({ match: 'any', rules: [folderRule, wrongSource] }, note())).toBe(true);
  });

  // Logic would call "all of no rules" true. A half-built collection that sweeps the whole vault while you are still
  // typing is a trap, and reading zero costs nothing.
  it('matches nothing when it has no rules, whichever way it combines', () => {
    expect(matchesRuleSet({ match: 'all', rules: [] }, note())).toBe(false);
    expect(matchesRuleSet({ match: 'any', rules: [] }, note())).toBe(false);
  });
});

describe('matchesCollection', () => {
  it('gathers a note that any set claims', () => {
    const s = collection([
      { match: 'all', rules: [rule('source', 'is', 'logos')] },
      { match: 'all', rules: [rule('source', 'is', 'calibre')] },
    ]);
    expect(matchesCollection(s, note())).toBe(true);
  });

  // **No conditions means no narrowing.** Reading it as "gathers nothing" would force anyone wanting the whole
  // catalog under their own grouping to invent a tautology — `file.folder under ""` or `title exists`.
  it('gathers every title when it has no sets', () => {
    expect(matchesCollection(collection([]), note())).toBe(true);
  });

  // A set added and not yet filled in is not a license to gather the vault for as long as it takes to fill in.
  it('ignores a set with no rules in it', () => {
    expect(matchesCollection(collection([{ match: 'all', rules: [] }]), note())).toBe(true);
    const half = collection([
      { match: 'all', rules: [] },
      { match: 'all', rules: [rule('source', 'is', 'logos')] },
    ]);
    // The empty set is dropped, so the real one decides — rather than the empty one waving everything through.
    expect(matchesCollection(half, note())).toBe(false);
    expect(matchesCollection(half, note({ frontmatter: { source: 'logos' } }))).toBe(true);
  });

  // The case a single folder-and-tag collection cannot express: two imports in one folder, told apart by a field,
  // with one collection wanting either of them.
  it('expresses an or of ands', () => {
    const s = collection([
      { match: 'all', rules: [rule(RULE_FIELD_FOLDER, 'under', 'Library'), rule('source', 'is', 'calibre')] },
      { match: 'all', rules: [rule(RULE_FIELD_FOLDER, 'under', 'Books'), rule('source', 'is', 'logos')] },
    ]);
    expect(matchesCollection(s, note({ path: 'Library/Titles/a.md', frontmatter: { source: 'calibre' } }))).toBe(true);
    expect(matchesCollection(s, note({ path: 'Books/b.md', frontmatter: { source: 'logos' } }))).toBe(true);
    // Right folder, wrong source, and the other way round.
    expect(matchesCollection(s, note({ path: 'Library/Titles/c.md', frontmatter: { source: 'logos' } }))).toBe(false);
    expect(matchesCollection(s, note({ path: 'Books/d.md', frontmatter: { source: 'calibre' } }))).toBe(false);
  });

  it('counts rules across every set', () => {
    const s = collection([
      { match: 'all', rules: [rule('a', 'exists'), rule('b', 'exists')] },
      { match: 'any', rules: [rule('c', 'exists')] },
    ]);
    expect(countRules(s)).toBe(3);
  });
});

// A migration cannot be re-run to fix, so the conversion is pinned here rather than discovered in a vault.
describe('rulesFromLegacyCollection', () => {
  const legacy = (over: Partial<LibraryCollection>): LibraryCollection => ({
    id: 'old',
    name: 'Old',
    enabled: true,
    ...over,
  });

  it('turns the old narrowing fields into one all set', () => {
    const sets = rulesFromLegacyCollection(
      legacy({ folder: 'Library/Titles', includeSubfolders: true, tag: 'owned', property: 'source', value: 'calibre' })
    );
    expect(sets).toEqual([
      {
        match: 'all',
        rules: [
          { field: RULE_FIELD_FOLDER, op: 'under', value: 'Library/Titles' },
          { field: RULE_FIELD_TAG, op: 'is', value: 'owned' },
          { field: 'source', op: 'is', value: 'calibre' },
        ],
      },
    ]);
  });

  it('keeps the subfolder choice', () => {
    const [set] = rulesFromLegacyCollection(legacy({ folder: 'Books', includeSubfolders: false }));
    expect(set.rules[0].op).toBe('directly-in');
  });

  // In a legacy collection an empty value means "has this property at all", which is what `exists` says.
  it('converts a property with no value to exists', () => {
    const [set] = rulesFromLegacyCollection(legacy({ property: 'isbn', value: '' }));
    expect(set.rules).toEqual([{ field: 'isbn', op: 'exists', value: '' }]);
  });

  it('produces no sets for a collection that had no conditions', () => {
    expect(rulesFromLegacyCollection(legacy({}))).toEqual([]);
  });
});

// The other end of the same parser the groupings use: `library/dates.ts` answers both, so a filter cannot
// disagree with a grouping about which week a Sunday belongs to.
describe('date rules', () => {
  const now: CalendarDate = { year: 2026, month: 8, day: 16, precision: 'day' };
  const dated = (added: string): CollectionCandidate => note({ frontmatter: { added } });
  const holds = (op: RuleOperator, value: string, added: string): boolean =>
    matchesRule({ field: 'added', op, value }, dated(added), now);

  describe('is in the last N days', () => {
    it('includes its boundary and excludes the day beyond it', () => {
      expect(holds('in-last-days', '30', '2026-07-17')).toBe(true);
      expect(holds('in-last-days', '30', '2026-07-16')).toBe(false);
    });

    // Thresholds, unlike bands: "the last 60" includes the last 30, which is the difference between selecting and
    // partitioning.
    it('includes everything nearer than the threshold', () => {
      expect(holds('in-last-days', '60', '2026-08-16')).toBe(true);
      expect(holds('in-last-days', '60', '2026-07-01')).toBe(true);
    });

    // It has not been 30 days since something that has not happened.
    it('counts a future date as within the window', () => {
      expect(holds('in-last-days', '30', '2027-01-01')).toBe(true);
      expect(holds('older-than-days', '30', '2027-01-01')).toBe(false);
    });
  });

  it('answers more-than-days-ago past the threshold only', () => {
    expect(holds('older-than-days', '365', '2020-01-01')).toBe(true);
    expect(holds('older-than-days', '365', '2026-01-01')).toBe(false);
  });

  // Whole periods, not rolling windows: "last month" is the month that ended, not the four weeks behind you.
  describe('is in a named period', () => {
    it('reads this month and last month as whole months', () => {
      expect(holds('in-period', 'this-month', '2026-08-01')).toBe(true);
      expect(holds('in-period', 'this-month', '2026-08-31')).toBe(true);
      expect(holds('in-period', 'this-month', '2026-07-31')).toBe(false);
      expect(holds('in-period', 'last-month', '2026-07-31')).toBe(true);
    });

    it('reads a week from its Monday', () => {
      // 2026-08-16 is a Sunday, so this week began on Monday the 10th.
      expect(holds('in-period', 'this-week', '2026-08-10')).toBe(true);
      expect(holds('in-period', 'this-week', '2026-08-09')).toBe(false);
      expect(holds('in-period', 'last-week', '2026-08-09')).toBe(true);
    });

    it('reads quarters and years', () => {
      expect(holds('in-period', 'this-quarter', '2026-07-01')).toBe(true);
      expect(holds('in-period', 'this-quarter', '2026-06-30')).toBe(false);
      expect(holds('in-period', 'last-quarter', '2026-06-30')).toBe(true);
      expect(holds('in-period', 'this-year', '2026-01-01')).toBe(true);
      expect(holds('in-period', 'last-year', '2025-12-31')).toBe(true);
    });
  });

  it('compares against a fixed date, exclusive of it', () => {
    expect(holds('before', '2020-01-01', '2019-12-31')).toBe(true);
    expect(holds('before', '2020-01-01', '2020-01-01')).toBe(false);
    expect(holds('after', '2020-01-01', '2020-01-02')).toBe(true);
    expect(holds('after', '2020-01-01', '2020-01-01')).toBe(false);
  });

  // The anniversary compares a month and a day, so a note saying only a year cannot answer it.
  it('answers the anniversary only for a date that named its day', () => {
    expect(holds('on-date-annually', '', '1999-08-16')).toBe(true);
    expect(holds('on-date-annually', '', '1999-08-15')).toBe(false);
    expect(holds('on-date-annually', '', '1999')).toBe(false);
  });

  // A rule about time cannot be answered by something that is not a time — not even "more than a year ago",
  // where "unknown" might feel old. A filter that quietly said yes would build a collection nobody could explain.
  it('never matches a value that is not a date', () => {
    expect(holds('older-than-days', '365', 'unknown')).toBe(false);
    expect(holds('in-last-days', '30', '')).toBe(false);
    expect(holds('in-period', 'this-year', 'sometime')).toBe(false);
  });

  // Read as the first day it could mean — the same approximation the aging bands make, and for the same reason:
  // requiring a full date would drop every year-only date out of every date filter.
  it('accepts a year-only date, as 1 January', () => {
    expect(holds('in-period', 'this-year', '2026')).toBe(true);
    expect(holds('older-than-days', '365', '2020')).toBe(true);
    expect(holds('in-last-days', '30', '2026')).toBe(false);
  });

  // Any value, like every other rule here: a field with two dates satisfies the rule if either does.
  it('holds when any of a field’s dates does', () => {
    const two = note({ frontmatter: { added: ['2019-01-01', '2026-08-10'] } });
    expect(matchesRule({ field: 'added', op: 'in-last-days', value: '30' }, two, now)).toBe(true);
  });

  // Offered only where the field holds dates: "is in the last 30 days" on `authors` can only ever be false.
  it('offers the date operators only for a date field', () => {
    expect(operatorsFor('added', 'dates')).toContain('in-last-days');
    expect(operatorsFor('added', 'text')).not.toContain('in-last-days');
    expect(operatorsFor(RULE_FIELD_TAG, 'dates')).not.toContain('in-last-days');
  });
});

// `rating is at least 4` is the query that pays for these: without them it is four `is` conditions in an `any` group.
describe('number rules', () => {
  const rated = (rating: unknown): CollectionCandidate => note({ frontmatter: { rating } });
  const holds = (op: RuleOperator, value: string, rating: unknown): boolean =>
    matchesRule({ field: 'rating', op, value }, rated(rating));

  it('compares, inclusive where it says so', () => {
    expect(holds('at-least', '4', 4)).toBe(true);
    expect(holds('greater-than', '4', 4)).toBe(false);
    expect(holds('greater-than', '4', 5)).toBe(true);
    expect(holds('at-most', '2', 2)).toBe(true);
    expect(holds('less-than', '2', 2)).toBe(false);
    expect(holds('less-than', '2', 1)).toBe(true);
  });

  it('reads a number written as text', () => {
    expect(holds('at-least', '4', '4')).toBe(true);
  });

  // The same rule the date operators follow: a value that is not a number cannot answer a comparison.
  it('never matches a value that is not a number', () => {
    expect(holds('at-least', '4', 'unknown')).toBe(false);
    expect(holds('at-most', '4', '')).toBe(false);
    expect(holds('at-least', '4', undefined)).toBe(false);
  });

  it('needs a number to compare against', () => {
    expect(holds('at-least', '', 4)).toBe(false);
    expect(holds('at-least', 'four', 4)).toBe(false);
  });

  // Any value, as everywhere else here.
  it('holds when any of a field’s numbers does', () => {
    const two = note({ frontmatter: { rating: [1, 5] } });
    expect(matchesRule({ field: 'rating', op: 'at-least', value: '4' }, two)).toBe(true);
  });

  // A number has no fragments — `rating contains 4` would match 14 and 40 — so a numeric field is offered the
  // comparisons instead, as a folder is offered "under".
  it('offers comparisons instead of contains', () => {
    expect(operatorsFor('rating', 'numbers')).toContain('at-least');
    expect(operatorsFor('rating', 'numbers')).not.toContain('contains');
    expect(operatorsFor('rating', 'text')).not.toContain('at-least');
  });
});
