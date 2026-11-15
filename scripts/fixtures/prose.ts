// Invented prose for the generated fixtures — readable English sentences about people and places that do not exist.
//
// **Not lorem ipsum.** Read-aloud speaks these books, sentence selection splits them, and search looks for words in
// them, so they need real sentence boundaries, real punctuation and words a voice can pronounce. Latin filler reads
// as noise and splits oddly.
//
// **Invented throughout, on purpose.** The fixtures replace real books so that no title, author or passage of one
// appears in the repository. Every name and place below was made up for this file; the sentence shapes are generic.
//
// **Deterministic.** Everything draws from a seeded generator, so the same seed gives the same text on every run and
// a rebuilt fixture is byte-identical to the committed one.

/** A small seeded generator (mulberry32): fast, and the same sequence for the same seed on every platform. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  'Avel Brannock',
  'Delphine Ashby',
  'Tobin Marsh',
  'Isolde Fenwick',
  'Orrin Tamsin',
  'Petra Calloway',
  'Jory Mabry',
  'Una Kestrel',
  'Roan Fairley',
  'Nell Harrow',
  'Esker Vantry',
  'Wren Pellow',
];
const PLACES = [
  'Saltmere',
  'Kettleby',
  'Marrowgate',
  'Hartsbury',
  'Rookhaven',
  'Nethercombe',
  'Oakhallow',
  'Pellbridge',
  'Ivel Down',
  'Thistlecombe',
  'Farrow Cross',
  'Larkspur Mill',
];
const ADJECTIVES = [
  'grey',
  'narrow',
  'quiet',
  'crooked',
  'distant',
  'windswept',
  'patient',
  'weathered',
  'lamplit',
  'uneven',
  'broad',
  'silent',
  'tidy',
  'ancient',
  'restless',
];
const NOUNS = [
  'lane',
  'harbor wall',
  'orchard',
  'mill race',
  'ferry',
  'lantern',
  'weir',
  'workshop',
  'hedgerow',
  'bell tower',
  'ledger',
  'kitchen garden',
  'reading room',
  'boathouse',
  'footbridge',
];
const VERBS = [
  'walked along',
  'looked across',
  'waited beside',
  'hurried past',
  'wrote about',
  'remembered',
  'swept out',
  'mended',
  'counted',
  'painted',
  'listened at',
  'returned to',
];
const TIMES = [
  'before breakfast',
  'at the turn of the tide',
  'long after supper',
  'on the second morning',
  'in the last of the light',
  'while the kettle boiled',
  'when the market closed',
  'as the rain eased',
];
const SAYINGS = [
  'We shall need more rope before the week is out',
  'Nobody has opened that door since the flood',
  'The ferry will not wait for anyone',
  'Leave the lantern where it is',
  'I counted them twice and the numbers still do not agree',
  'There is time enough if we start now',
];

/** A text generator bound to one seed. `words` are extra words the caller wants woven in (a search target, say). */
export function proseFrom(seed: number) {
  const rnd = seeded(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const sentence = (): string => {
    switch (Math.floor(rnd() * 5)) {
      case 0:
        return `${pick(NAMES)} ${pick(VERBS)} the ${pick(ADJECTIVES)} ${pick(NOUNS)} ${pick(TIMES)}.`;
      case 1:
        return `In ${pick(PLACES)} the ${pick(NOUNS)} was ${pick(ADJECTIVES)}, and the ${pick(NOUNS)} beyond it was ${pick(ADJECTIVES)} too.`;
      case 2:
        return `“${pick(SAYINGS)},” said ${pick(NAMES).split(' ')[0]}.`;
      case 3:
        return `${cap(pick(TIMES))}, ${pick(NAMES).split(' ')[0]} ${pick(VERBS)} the ${pick(NOUNS)} and thought about ${pick(PLACES)}.`;
      default:
        return `Nobody in ${pick(PLACES)} could say why the ${pick(ADJECTIVES)} ${pick(NOUNS)} had been left so ${pick(ADJECTIVES)}.`;
    }
  };

  /** One paragraph of `n` sentences. `word`, when given, is worked into one of them. */
  const paragraph = (n = 3 + Math.floor(rnd() * 4), word?: string): string => {
    const s = Array.from({ length: n }, sentence);
    if (word) s[Math.floor(rnd() * n)] = `The ${word} was mentioned again, as it always was in ${pick(PLACES)}.`;
    return s.join(' ');
  };

  /** Paragraphs until at least `chars` characters of text. */
  const paragraphsOf = (chars: number, word?: string): string[] => {
    const out: string[] = [];
    let total = 0;
    while (total < chars) {
      const p = paragraph(undefined, out.length === 0 ? word : undefined);
      out.push(p);
      total += p.length;
    }
    return out;
  };

  return { sentence, paragraph, paragraphsOf, pick, rnd };
}

/** Escape text going into XHTML. Every generated string passes through this; a stray `&` makes an unreadable book. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Paragraphs as `<p>` elements. */
export function ps(paragraphs: readonly string[]): string {
  return paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n');
}
