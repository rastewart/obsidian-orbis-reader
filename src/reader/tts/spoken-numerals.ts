// How a Roman numeral in prose is said: "Henry the Sixth", "World War 2" — never "roman six".
//
// Left to itself the phonemizer reads a numeral after a capitalized word as "roman" and the number: "Louis roman
// fourteen", "World War roman two", "Article roman three". A heading word before it (Chapter, Part, …) is handled
// where the headings are (`normalizeForSpeech`); this is the rest.
//
// **Two kinds of numeral follow a capitalized word.** Rulers — Louis XIV, Charles II, Henry VIII, George III,
// John Paul II — whose numeral is an ordinal, and numbered things — World War II, Article III, Letters
// III, Stalag Luft III, Algebra II — whose numeral is a number. The word before decides, and of the two lists the
// rulers' names are the one that can be written down: the numbered things are any noun at all. So a numeral after a
// ruler's name, or after a title word ("Emperor Talvar IV"), is an ordinal, and after any other capitalized word a
// number. A ruler from fiction without a title becomes a number ("Brannoc 2") where it was "roman two" before.
//
// **Left as they were:** the single letter I, which is the pronoun as often as the numeral ("When George I was…");
// V and X except after a ruler (Malcolm X); numerals with L, C, D or M, which are abbreviations as often (Sega CD,
// Washington DC); and anything after a one-letter word, which in the library was SIX split by a decorative first
// letter ("S IX").

/** Parse a well-formed Roman numeral to its integer, or null if malformed. */
export function romanToArabic(s: string): number | null {
  const up = s.toUpperCase();
  if (!up || !/^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(up)) return null;
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;
  for (let i = up.length - 1; i >= 0; i--) {
    const v = map[up[i]];
    if (v < prev) total -= v;
    else {
      total += v;
      prev = v;
    }
  }
  return total || null;
}

/**
 * Names that take a regnal numeral — kings, queens, emperors, popes, pharaohs — as written in English. Not exhaustive
 * and not meant to be: a name missing from it is read as a number, which is no worse than before. Not Malcolm, though
 * Scotland had three: Malcolm X is in the library seventeen times and was never the tenth of anything.
 */
const RULERS = new Set(
  (
    'Adrian Alexander Alexios Alfonso Amenhotep Antiochus Artaxerxes Basil Bela Benedict Boniface Carlos Casimir ' +
    'Catherine Charles Christian Clement Constantine Cyrus Darius David Edward Elizabeth Emmanuel Eugene Felipe ' +
    'Ferdinand Francis Frederick George Gregory Gustav Gustavus Haakon Harald Henry Herod Honorius Innocent Ivan ' +
    'James Jeroboam John Joseph Juan Julius Justinian Leo Leopold Louis Ludwig Magnus Manuel Marcus Martin ' +
    'Mary Maximilian Mithridates Napoleon Nebuchadnezzar Nicholas Olaf Otto Paul Pedro Peter Philip Pius Ptolemy ' +
    'Ramesses Rameses Richard Robert Rudolf Sancho Sargon Seleucus Shalmaneser Sigismund Sixtus Stephen Theodosius ' +
    'Thutmose Umberto Urban Valentinian Victor Victoria Vittorio Wilhelm William Xerxes'
  ).split(' ')
);

/** Titles before a ruler's name: "King Brannoc II", "Emperor Talvar IV". */
const TITLES = new Set(
  'King Queen Pope Emperor Empress Tsar Tsarina Czar Kaiser Pharaoh Sultan Prince Princess Duke Duchess Saint'.split(
    ' '
  )
);

const ONES = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth'];
const TEENS = [
  'Tenth',
  'Eleventh',
  'Twelfth',
  'Thirteenth',
  'Fourteenth',
  'Fifteenth',
  'Sixteenth',
  'Seventeenth',
  'Eighteenth',
  'Nineteenth',
];
const TENS = ['', '', 'Twenty', 'Thirty'];
const TENTHS = ['', '', 'Twentieth', 'Thirtieth'];

/** "the Sixth", "the Twenty-third" — the regnal ordinal, 1 to 39, the range a numeral of I, V and X can write. */
export function regnalOrdinal(n: number): string | null {
  if (n < 1 || n > 39) return null;
  if (n < 10) return `the ${ONES[n]}`;
  if (n < 20) return `the ${TEENS[n - 10]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones ? `the ${TENS[tens]}-${ONES[ones].toLowerCase()}` : `the ${TENTHS[tens]}`;
}

/**
 * A capitalized word of two letters or more, a space, and a numeral of I, V and X, standing as a word — or before a
 * possessive, "Henry VI's reign". The word before that is captured too, for a title.
 */
const NAMED_NUMERAL_RE =
  /(?:\b([A-Z][a-z]+)\s+)?\b([A-Z][A-Za-z'’]*[a-z][A-Za-z'’]*)\s+([IVX]+)(?=['’]s\b|[^A-Za-z'’]|$)/g;

/** Read every numeral after a name as the ordinal or the number it is — see the note at the top. */
export function speakNamedNumerals(text: string): string {
  return text.replace(NAMED_NUMERAL_RE, (match, before: string | undefined, name: string, numeral: string) => {
    const n = romanToArabic(numeral);
    if (n === null || numeral === 'I') return match;
    const lead = match.slice(0, match.length - numeral.length);
    const ruler = RULERS.has(name) || TITLES.has(name) || (before !== undefined && TITLES.has(before));
    if (ruler) return lead + (regnalOrdinal(n) ?? numeral);
    // V and X alone are a ruler's or nothing: Malcolm X, Gen V.
    if (numeral.length < 2) return match;
    return lead + String(n);
  });
}
