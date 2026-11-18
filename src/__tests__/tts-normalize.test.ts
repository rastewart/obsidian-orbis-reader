import { describe, expect, it } from 'vitest';
import { compilePronouncer } from '../reader/tts/pronunciations';
import { normalizeForSpeech } from '../reader/tts/tts-blocks';

describe('normalizeForSpeech', () => {
  it('converts roman numerals after a heading word (any case)', () => {
    expect(normalizeForSpeech('Chapter I')).toBe('Chapter 1');
    expect(normalizeForSpeech('chapter iv')).toBe('chapter 4');
    expect(normalizeForSpeech('Part VIII')).toBe('Part 8');
    expect(normalizeForSpeech('Book XIV: The Return')).toBe('Book 14: The Return');
  });

  it('title-cases long ALL-CAPS words so espeak reads them instead of spelling them out', () => {
    // "CHAPTER" spelled letter-by-letter by some espeak voices garbles the audio.
    expect(normalizeForSpeech('CHAPTER II')).toBe('Chapter 2');
    expect(normalizeForSpeech('PROLOGUE')).toBe('Prologue');
    // Two words in capitals are a run, read as ordinary words — see the runs block below.
    expect(normalizeForSpeech('THE PREFACE')).toBe('The preface');
    // Pure roman-numeral tokens are left for the roman rule, not title-cased.
    expect(normalizeForSpeech('Chapter IIII')).toBe('Chapter IIII');
  });

  it('leaves the pronoun "I" and other capitals alone', () => {
    expect(normalizeForSpeech('And I went home.')).toBe('And I went home.');
    expect(normalizeForSpeech('I saw it')).toBe('I saw it');
    // No heading keyword → untouched, even if it looks like a numeral.
    expect(normalizeForSpeech('V for Vantry')).toBe('V for Vantry');
  });

  it('does not rewrite a following word that merely starts with numeral letters', () => {
    expect(normalizeForSpeech('Chapter Individual')).toBe('Chapter Individual');
    expect(normalizeForSpeech('Section Development')).toBe('Section Development');
  });

  it('leaves malformed roman numerals unchanged', () => {
    expect(normalizeForSpeech('Chapter IIII')).toBe('Chapter IIII');
  });

  it('handles multiple headings in one string', () => {
    expect(normalizeForSpeech('Part I and Part III')).toBe('Part 1 and Part 3');
  });
});

describe('normalizeForSpeech — a numeral on its own', () => {
  it('reads a heading that is only a numeral as a number, the lone I included', () => {
    // A chapter heading with no heading word, <h3>I</h3>, was read "eye".
    expect(normalizeForSpeech('I')).toBe('1');
    expect(normalizeForSpeech('II')).toBe('2');
    expect(normalizeForSpeech('XIV')).toBe('14');
    expect(normalizeForSpeech('L')).toBe('50');
  });

  it('keeps a period or colon after it, and ignores surrounding space', () => {
    expect(normalizeForSpeech('I.')).toBe('1.');
    expect(normalizeForSpeech('IV.')).toBe('4.');
    expect(normalizeForSpeech('  XII:  ')).toBe('12:');
  });

  it('leaves the numeral alone when anything else is there', () => {
    expect(normalizeForSpeech('I said.')).toBe('I said.');
    expect(normalizeForSpeech('“I.”')).toBe('“I.”');
    expect(normalizeForSpeech('I?')).toBe('I?');
    expect(normalizeForSpeech('I, too')).toBe('I, too');
  });

  it('leaves lower case, malformed numerals and other letters alone', () => {
    expect(normalizeForSpeech('i')).toBe('i');
    expect(normalizeForSpeech('IIII')).toBe('IIII');
    expect(normalizeForSpeech('A')).toBe('A');
  });
});

describe('normalizeForSpeech — acronyms vs ALL-CAPS words', () => {
  const said = (s: string) => normalizeForSpeech(s);

  it('leaves an initialism in caps, so it is still spelled out', () => {
    // Title-casing these was the bug: "the RIAA" came out "the Riaa", spoken "ree-ah".
    expect(said('the RIAA could not')).toBe('the RIAA could not');
    expect(said('hosted on AWS')).toBe('hosted on AWS');
    expect(said('valid HTML')).toBe('valid HTML');
    expect(said('an IEEE paper')).toBe('an IEEE paper');
    expect(said('the USSR')).toBe('the USSR');
  });

  it('keeps a possessive or plural out of the length test', () => {
    // "AWS's" is three letters and an initialism; the old rule counted the apostrophe, matched four
    // characters and title-cased it to "Aws's".
    expect(said("AWS's outage")).toBe("AWS's outage");
    expect(said('AWS’s outage')).toBe('AWS’s outage');
    expect(said('two URLs')).toBe('two URLs');
  });

  it('still says an ALL-CAPS word as a word', () => {
    expect(said('pure FUD')).toBe('pure Fud');
    expect(said('NASA and NATO')).toBe('Nasa and Nato');
    expect(said('went AWOL')).toBe('went Awol');
    expect(said('BEAUTIFUL')).toBe('Beautiful'); // EAU is a vowel run, but not in a short token
    expect(said("O'BRIEN")).toBe("O'brien");
    expect(said("DON'T")).toBe("Don't");
  });

  it('reads ONE and THE in a heading as words, since the heading is a run of capitals', () => {
    // On their own, ONE and THE have vowels only at the edges and stay in capitals as initialisms would. Beside
    // another word in capitals they are display text, and the run is lower-cased whole.
    expect(said('PART ONE')).toBe('Part one');
    expect(said('THE END')).toBe('The end');
    expect(said('PART THREE')).toBe('Part three');
    expect(said('CHAPTER SIX')).toBe('Chapter six');
  });

  it('reads MIT and CIA as words — the known cost of a spelling-shape test', () => {
    // Convention, not spelling, decides these; both are as pronounceable as FUD. The pronunciation
    // glossary is the per-book fix.
    expect(said('at MIT')).toBe('at Mit');
    expect(said('the CIA')).toBe('the Cia');
  });

  it('leaves a single capital and two-letter tokens alone', () => {
    expect(said('And I went home')).toBe('And I went home');
    expect(said('on TV in the EU')).toBe('on TV in the EU');
  });
});

describe('normalizeForSpeech — runs of capitals', () => {
  const said = (s: string) => normalizeForSpeech(s);

  it('reads a line in capitals as words, so IT and US are no longer spelled', () => {
    // The voice spells IT and US in capitals ("I-T was a dark night"); in a run they are the words.
    expect(said('IT WAS A DARK NIGHT, AND THE LANTERN WAS OUT.')).toBe('It was a dark night, and the lantern was out.');
    expect(said('GOD IS WITH US')).toBe('God is with us');
    expect(said('The sign by the weir read KEEP OUT in red letters.')).toBe(
      'The sign by the weir read keep out in red letters.'
    );
    expect(said('ASK DR VANTRY')).toBe('Ask dr vantry');
  });

  it('keeps the capital where a sentence starts, after a quote or an earlier sentence', () => {
    expect(said('“STOP RIGHT THERE,” she said.')).toBe('“Stop right there,” she said.');
    expect(said('STOP. GO NOW.')).toBe('Stop. Go now.');
  });

  it('leaves a Roman numeral in a run in capitals for the numeral rules', () => {
    expect(said('CHAPTER VI')).toBe('Chapter 6');
    expect(said('HENRY VI WAS KING')).toBe('Henry the Sixth was king'); // see spoken-numerals.test.ts
    expect(said('I AM TIRED')).toBe('I am tired'); // the pronoun is the numeral I, and keeps its capital
  });

  it('lower-cases a word that only looks like a numeral', () => {
    // DID and MILD use numeral letters but are not numerals; only a valid one is kept.
    expect(said('HE DID IT')).toBe('He did it');
  });

  it('leaves a single word in capitals to the per-word rule', () => {
    expect(said('Ask the AI for help.')).toBe('Ask the AI for help.');
    expect(said('the FBI arrived')).toBe('the FBI arrived');
    expect(said('at MIT')).toBe('at Mit');
    expect(said('the US Army')).toBe('the US Army');
  });

  it('needs a word of two letters or more to be a run', () => {
    expect(said('I A')).toBe('I A');
  });
});

describe('normalizeForSpeech — "IT was" at the start of a sentence', () => {
  const said = (s: string) => normalizeForSpeech(s);

  it('reads IT as the word before the verbs measured after it', () => {
    expect(said('IT was a dark night.')).toBe('It was a dark night.');
    expect(said('IT is late.')).toBe('It is late.');
    expect(said('They waited. IT had stopped raining.')).toBe('They waited. It had stopped raining.');
    expect(said('“IT wasn’t me,” he said.')).toBe('“It wasn’t me,” he said.');
  });

  it('leaves the acronym, which is followed by a noun or a modal', () => {
    expect(said('IT systems were down.')).toBe('IT systems were down.');
    expect(said('IT will need a new budget.')).toBe('IT will need a new budget.');
    expect(said('She worked in IT was the rumor.')).toBe('She worked in IT was the rumor.');
  });
});

describe('normalizeForSpeech — URLs in prose', () => {
  it('says "web link" plus the host, dropping the path', () => {
    // The whole point: 19 digits of status id read out one by one is unlistenable.
    expect(normalizeForSpeech('See https://x.com/wrenpellow/status/2079509493805642189 for more')).toBe(
      'See web link x dot com for more'
    );
  });

  it('handles the shape a broken markdown link leaves behind', () => {
    // Straight out of a converted blog post, brackets and all.
    expect(normalizeForSpeech('](https://x.com/wrenpellow/status/2079509493805642189)')).toBe('](web link x dot com)');
  });

  it('drops www., the port and any userinfo', () => {
    expect(normalizeForSpeech('www.cnbc.com/2026/07/21/ferry-timetable.html')).toBe('web link cnbc dot com');
    expect(normalizeForSpeech('https://user:pw@example.com:8443/x')).toBe('web link example dot com');
  });

  it('spells every dot, so a multi-part host is still followed', () => {
    expect(normalizeForSpeech('https://docs.google.com/document/d/abc')).toBe('web link docs dot google dot com');
  });

  it('lowercases the host — espeak spells short capitals out letter by letter', () => {
    expect(normalizeForSpeech('HTTPS://EXAMPLE.COM/PATH')).toBe('web link example dot com');
  });

  it('leaves the punctuation around a URL where it was', () => {
    // The sentence-final period has to survive: it is the engine's cue to fall and pause.
    expect(normalizeForSpeech('Go to www.example.com.')).toBe('Go to web link example dot com.');
    expect(normalizeForSpeech('(see https://example.com), then stop')).toBe(
      '(see web link example dot com), then stop'
    );
  });

  it('takes a bare host only when a path follows it', () => {
    expect(normalizeForSpeech('see x.com/wrenpellow today')).toBe('see web link x dot com today');
    // No scheme, no www., no path — prose, or an abbreviation, far more often than a link.
    expect(normalizeForSpeech('Read Inc.com today')).toBe('Read Inc.com today');
    expect(normalizeForSpeech('e.g. the second one')).toBe('e.g. the second one');
  });

  it('says "email link" for an address or a mailto:', () => {
    expect(normalizeForSpeech('write to jim@example.com now')).toBe('write to email link example dot com now');
    expect(normalizeForSpeech('mailto:jim@example.com')).toBe('email link example dot com');
  });

  it('leaves a social handle alone — no host, no link', () => {
    expect(normalizeForSpeech('Wren Pellow@wrenpellow')).toBe('Wren Pellow@wrenpellow');
  });

  it('collapses several links in one sentence', () => {
    expect(normalizeForSpeech('Compare https://a.example.com/x with https://b.example.org/y.')).toBe(
      'Compare web link a dot example dot com with web link b dot example dot org.'
    );
  });

  it('runs BEFORE the other rules, so a path cannot reach them', () => {
    // An ALL-CAPS path segment would otherwise be title-cased, and "/part/iv/" turned into digits —
    // work done on text that is thrown away.
    expect(normalizeForSpeech('https://example.com/ABOUT-US/part/iv')).toBe('web link example dot com');
    expect(normalizeForSpeech('Chapter IV, at https://example.com/x')).toBe('Chapter 4, at web link example dot com');
  });

  it('composes with the pronunciation dictionary', () => {
    const p = compilePronouncer([{ word: 'link', say: 'linnk', enabled: true }]);
    expect(normalizeForSpeech('at https://example.com/x', p)).toBe('at web linnk example dot com');
  });
});

describe('normalizeForSpeech — pronunciation respellings', () => {
  const pron = compilePronouncer([{ word: 'Vantry', say: 'van tree', enabled: true }]);

  it('substitutes when a pronouncer is supplied', () => {
    expect(normalizeForSpeech('I read Vantry', pron)).toBe('I read van tree');
  });

  it('is unchanged when no pronouncer is supplied', () => {
    expect(normalizeForSpeech('I read Vantry')).toBe('I read Vantry');
  });

  it('lowercases a shouty respelling, so espeak cannot spell it out letter by letter', () => {
    // espeak spells short all-caps runs out ("VAN" → "V-A-N"), and the all-caps rule above
    // deliberately leaves runs of 3 or fewer alone because those are usually acronyms. Canonicalizing
    // respellings to lowercase is what keeps a stress-marked spelling from being garbled.
    const shouty = compilePronouncer([{ word: 'Vantry', say: 'VAN-TRY', enabled: true }]);
    expect(normalizeForSpeech('by Vantry', shouty)).toBe('by van-try');
  });

  it('runs AFTER the built-in rules, so a replacement is passed through and not re-processed', () => {
    // Substituting first would let the Roman-numeral rule rewrite the replacement's own text.
    const p = compilePronouncer([{ word: 'Foo', say: 'chapter iv', enabled: true }]);
    expect(normalizeForSpeech('the Foo', p)).toBe('the chapter iv');
  });

  it('runs after the Roman-numeral rule and composes with it', () => {
    const p = compilePronouncer([{ word: 'Chapter', say: 'chap ter', enabled: true }]);
    expect(normalizeForSpeech('Chapter IV', p)).toBe('chap ter 4');
  });

  it('still applies the built-in rules to text the dictionary does not touch', () => {
    expect(normalizeForSpeech('CHAPTER II', pron)).toBe('Chapter 2');
  });
});
