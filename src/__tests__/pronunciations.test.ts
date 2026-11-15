import { describe, expect, it } from 'vitest';
import {
  compilePronouncer,
  isValidPronunciationSay,
  isValidPronunciationWord,
  normalizePronunciationSay,
  type Pronunciation,
} from '../reader/tts/pronunciations';

const p = (word: string, say: string, enabled = true): Pronunciation => ({ word, say, enabled });
/** Compile and apply in one step; asserts the pronouncer exists. */
const apply = (entries: Pronunciation[], text: string): string => {
  const fn = compilePronouncer(entries);
  if (!fn) throw new Error('expected a pronouncer');
  return fn(text);
};

describe('isValidPronunciationWord', () => {
  it('accepts a plain word', () => {
    expect(isValidPronunciationWord('Oakhallow')).toBe(true);
  });

  it('accepts a trailing period, internal hyphen and apostrophe', () => {
    // The three cases that are one word to a reader but would fail a letters-only rule.
    expect(isValidPronunciationWord('St.')).toBe(true);
    expect(isValidPronunciationWord('Saint-Saëns')).toBe(true);
    expect(isValidPronunciationWord("O'Pellow")).toBe(true);
  });

  it('rejects anything containing whitespace', () => {
    expect(isValidPronunciationWord('St. Petersburg')).toBe(false);
    expect(isValidPronunciationWord('a b')).toBe(false);
    expect(isValidPronunciationWord('tab\there')).toBe(false);
  });

  it('rejects empty / whitespace-only / punctuation-only', () => {
    expect(isValidPronunciationWord('')).toBe(false);
    expect(isValidPronunciationWord('   ')).toBe(false);
    expect(isValidPronunciationWord('---')).toBe(false);
  });

  it('tolerates surrounding whitespace', () => {
    expect(isValidPronunciationWord('  Oakhallow  ')).toBe(true);
  });
});

describe('isValidPronunciationSay', () => {
  it('allows spaces — that is how you respell', () => {
    expect(isValidPronunciationSay('Oak HAL oh')).toBe(true);
  });

  it('rejects empty', () => {
    expect(isValidPronunciationSay('')).toBe(false);
    expect(isValidPronunciationSay('  ')).toBe(false);
  });
});

describe('compilePronouncer — nothing to do', () => {
  it('returns null for an empty list', () => {
    expect(compilePronouncer([])).toBeNull();
  });

  it('returns null when every entry is disabled', () => {
    expect(compilePronouncer([p('Oakhallow', 'Oak HAL oh', false)])).toBeNull();
  });

  it('returns null when every entry is invalid', () => {
    expect(compilePronouncer([p('two words', 'x'), p('ok', '  ')])).toBeNull();
  });

  it('skips invalid entries but keeps valid ones', () => {
    expect(apply([p('two words', 'x'), p('Dover', 'doe ver')], 'to Dover')).toBe('to doe ver');
  });
});

describe('compilePronouncer — matching', () => {
  const dict = [p('Oakhallow', 'oak hal oh')];

  it('substitutes a whole word', () => {
    expect(apply(dict, 'I read Oakhallow today')).toBe('I read oak hal oh today');
  });

  it('matches case-insensitively', () => {
    expect(apply(dict, 'OAKHALLOW and oakhallow')).toBe('oak hal oh and oak hal oh');
  });

  it('matches at the very start and very end of the text', () => {
    expect(apply(dict, 'Oakhallow')).toBe('oak hal oh');
    expect(apply(dict, 'by Oakhallow')).toBe('by oak hal oh');
  });

  it('does not match inside a longer word', () => {
    expect(apply([p('read', 'reed')], 'already threaded')).toBe('already threaded');
    expect(apply([p('Dover', 'doe ver')], 'Dovercourt')).toBe('Dovercourt');
  });

  it('keeps a possessive suffix', () => {
    // An apostrophe is not a letter, so the name matches and 's survives.
    expect(apply(dict, "Oakhallow's novel")).toBe("oak hal oh's novel");
  });

  it('matches when adjacent to punctuation', () => {
    expect(apply(dict, '“Oakhallow,” he said.')).toBe('“oak hal oh,” he said.');
    expect(apply(dict, '(Oakhallow)')).toBe('(oak hal oh)');
  });

  it('handles repeated and adjacent occurrences', () => {
    expect(apply([p('Foo', 'faa')], 'Foo Foo Foo')).toBe('faa faa faa');
    expect(apply([p('Foo', 'faa')], 'Foo-Foo')).toBe('faa-faa');
  });

  it('is Unicode-aware at boundaries', () => {
    // \b would mis-fire here; the accented letter must still count as inside the word.
    expect(apply([p('Saëns', 'sonce')], 'by Saëns today')).toBe('by sonce today');
    expect(apply([p('Saens', 'sonce')], 'Saënsx')).toBe('Saënsx');
  });

  it('substitutes a token with a trailing period', () => {
    expect(apply([p('St.', 'saint')], 'St. Petersburg')).toBe('saint Petersburg');
  });

  it('leaves text without matches untouched', () => {
    expect(apply(dict, 'Wren wrote that')).toBe('Wren wrote that');
  });
});

describe('compilePronouncer — non-cascading', () => {
  it("does not rewrite one entry's output with another entry", () => {
    // Sequential passes would turn "Dover" into "Doe ver" then corrupt the "ver".
    const out = apply([p('Dover', 'doe ver'), p('ver', 'vee are')], 'to Dover');
    expect(out).toBe('to doe ver');
  });

  it('does not loop when a replacement contains its own key', () => {
    expect(apply([p('Bach', 'bach as in bark')], 'played Bach')).toBe('played bach as in bark');
  });

  it('prefers the longest key when two could match', () => {
    const out = apply([p('St.', 'saint'), p('St.Pete', 'saint peet')], 'in St.Pete now');
    expect(out).toBe('in saint peet now');
  });
});

describe('compilePronouncer — duplicates and hygiene', () => {
  it('lets a later duplicate win', () => {
    expect(apply([p('Foo', 'first'), p('Foo', 'second')], 'Foo')).toBe('second');
  });

  it('trims stored word and replacement', () => {
    expect(apply([p('  Foo  ', '  faa  ')], 'Foo')).toBe('faa');
  });

  it('treats regex metacharacters in a word literally', () => {
    expect(apply([p('C++', 'c plus plus')], 'wrote C++ code')).toBe('wrote c plus plus code');
    expect(apply([p('a.b', 'a dot b')], 'axb and a.b')).toBe('axb and a dot b');
  });

  it('does not treat $ in the replacement as a capture reference', () => {
    expect(apply([p('cost', '$1 each')], 'the cost')).toBe('the $1 each');
  });
});

describe('normalizePronunciationSay', () => {
  it('lowercases and trims', () => {
    expect(normalizePronunciationSay('  Oak-HAL-OH  ')).toBe('oak-hal-oh');
  });

  it('leaves an already-lowercase spelling alone', () => {
    expect(normalizePronunciationSay('oak hal oh')).toBe('oak hal oh');
  });

  it('keeps spaces and hyphens, which carry the syllable breaks', () => {
    expect(normalizePronunciationSay('OAK HAL-oh')).toBe('oak hal-oh');
  });

  it('is idempotent', () => {
    const once = normalizePronunciationSay('Oak-HAL');
    expect(normalizePronunciationSay(once)).toBe(once);
  });
});

describe('compilePronouncer — uppercase respellings', () => {
  it('substitutes the lowercased form even for an entry stored in caps', () => {
    // espeak spells short all-caps runs out letter by letter (HAL → "H-A-L"), so an entry saved
    // before respellings were lowercased must still speak cleanly without being re-entered.
    expect(apply([p('Oakhallow', 'Oak-HAL-OH')], 'by Oakhallow')).toBe('by oak-hal-oh');
  });

  it('does not lowercase the surrounding text', () => {
    expect(apply([p('Foo', 'BAR')], 'The Foo And The Rest')).toBe('The bar And The Rest');
  });
});
