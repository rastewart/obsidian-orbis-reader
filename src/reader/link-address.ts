// What a link in a book says, against where it goes — read before anything leaves the book.
//
// **A link's text is the book's claim; its address is the fact.** Markup lets the two say different things, and
// nothing between a book and the system would tell the reader: foliate hands the address to `window.open`, and
// Obsidian opens `http`, `https` and `obsidian` links without a word. So every link that leaves the book is shown
// first — see `LinkCheck` — and this is the part of that which can be tested without a screen.
//
// **Read with the browser's own parser**, the same one `window.open` uses, so the scheme and host shown are the ones
// that will be acted on. A string test would disagree with it on exactly the spellings a hostile book would choose:
// `JAVASCRIPT:`, a tab inside the scheme, `https://bank.example@elsewhere.invalid/`.

/** What selecting a link does, decided by its scheme. */
export type LinkKind =
  /** `obsidian://orbis-nav` — another book of a converted set, opened directly. See `OrbisReaderView.openBookLink`. */
  | 'book'
  /** `javascript:` — refused outright. No book has a use for one, and it would run in Obsidian's window. */
  | 'script'
  | 'web'
  | 'email'
  /** Any other scheme: a phone number, an Obsidian or other app's link, a file. Shown, and opened if the reader says. */
  | 'other'
  /** Nothing the browser can parse — there is nothing to open. */
  | 'invalid';

export interface LinkAddress {
  kind: LinkKind;
  /** The host a `web` link goes to, as the URL parser serializes it — punycode (`xn--`) for anything not ASCII. */
  host?: string;
  /** The parsed address — what the browser will actually open. Absent for a book link and an invalid one. */
  url?: URL;
}

export function readLinkAddress(raw: string): LinkAddress {
  // Kept as the string test it always was: the converter writes these links, so their spelling is known.
  if (raw.startsWith('obsidian://orbis-nav')) return { kind: 'book' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: 'invalid' };
  }
  switch (url.protocol) {
    case 'javascript:':
      return { kind: 'script', url };
    case 'http:':
    case 'https:':
      return { kind: 'web', host: url.hostname, url };
    case 'mailto:':
      return { kind: 'email', url };
    default:
      return { kind: 'other', url };
  }
}

/**
 * Code points that change how text reads without being seen, as inclusive ranges: controls, the soft hyphen,
 * direction marks, overrides and isolates, zero-width spaces and joiners, fillers, variation selectors, the
 * byte-order mark and tag characters.
 *
 * A right-to-left override placed before `fdp.exe` makes `invoice` + override + `fdp.exe` read as `invoiceexe.pdf`;
 * a zero-width space splits a word that looks whole. Written out, they are harmless.
 *
 * **Numbers, not a character class.** A class would have to hold these characters, and source holding invisible
 * characters is the thing being guarded against — the same reasoning as `yamlString`'s scan.
 */
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x206f],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xe0000, 0xe0fff],
];

const isInvisible = (code: number): boolean => INVISIBLE_RANGES.some(([lo, hi]) => code >= lo && code <= hi);

/** Text with every invisible character written out as its code point, such as `[U+202E]`. */
export function showInvisibles(text: string): string {
  let shown = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    shown += isInvisible(code) ? `[U+${code.toString(16).toUpperCase().padStart(4, '0')}]` : ch;
  }
  return shown;
}

/** Longest link text shown in full. An address is never cut: it is the thing being checked. */
export const LINK_TEXT_MAX = 300;

/**
 * A link's text as the reader saw it: runs of spaces, tabs and line breaks collapsed as the page renders them,
 * invisibles written out, cut at `LINK_TEXT_MAX`. Empty when the link has no text — the caller says what it holds
 * instead.
 *
 * Only those four are collapsed, not `\s`, which also takes in the byte-order mark and would hide it as a space.
 */
export function linkTextShown(text: string): string {
  const collapsed = text.replace(/[ \t\r\n]+/g, ' ').trim();
  const chars = Array.from(collapsed);
  const cut = chars.length > LINK_TEXT_MAX ? `${chars.slice(0, LINK_TEXT_MAX).join('')}…` : collapsed;
  return showInvisibles(cut);
}

// ── Deviations ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A way a link could mislead about where it goes, even after the dialog has shown it — each one a fact the dialog
 * states, never a verdict.
 *
 * **Only what can still mislead.** Text naming another site makes a claim the address breaks; a look-alike letter can
 * still pass for the real one in the browser's own address bar after opening; a name before `@` makes the address
 * start with a site it does not go to. A hidden character is not one of these: the dialog writes it out in the text,
 * and the browser drops or encodes it in the address, so the rows already show the truth — see `hiddenIn`.
 *
 * **Deviations, not danger.** In ordinary books the text-and-site comparison fires on links that are nearly all
 * harmless: a publisher's short domain over its full one, an author's site behind a store's name, a link shortener, an
 * address broken by a typo. The name before `@` fires on mistyped email links. So each is reported as what differs,
 * and the reader decides.
 */
export type LinkDeviation =
  /** The domain holds characters outside basic Latin — each listed — however the book wrote it. */
  | { kind: 'other-letters'; chars: string[] }
  /** A name before `@`: `https://bank.example@elsewhere.invalid/` reaches `elsewhere.invalid`. */
  | { kind: 'user-name'; name: string; host: string }
  /** The link text names a site, and the address goes to a different one. */
  | { kind: 'text-names-other-site'; shown: string; host: string };

/**
 * Domain endings that make a dotted word in link text a site name rather than initials (`c.s.lewis`) or a file
 * (`panorama.jpg`). Measured: with any ending of two letters or more, those were most of what the comparison found.
 * A site with an ending not listed is simply not compared — a missed deviation, never a false one.
 */
const SITE_ENDINGS = new Set(
  (
    'com org net edu gov mil int info biz io co me tv app dev ai us uk ca au nz de fr nl it es se no fi dk ch at be ' +
    'ie jp cn ru in br mx za eu pl cz pt gr'
  ).split(' ')
);

/**
 * Dotted ASCII words in text, not starting inside a word, an address's `@`, or another dotted word.
 *
 * The character before is matched as a group of its own (or the start of the text) rather than looked behind for,
 * because iOS before 16.4 cannot parse a lookbehind. The word is group 2, and starts `group 1`'s length into the match.
 */
const DOTTED_WORD = /(^|[^\w.@-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?![\w-])/gi;

/**
 * Site names in link text: a dotted word with a known ending, or one written with `www.` or after `://`.
 *
 * Hidden characters are taken out first, as the reader never saw them: `exa` + zero-width space + `mple.com` reads as
 * `example.com` on the page, and left in, it would be compared as `mple.com`.
 */
export function siteNamesIn(text: string): string[] {
  const seen = withoutInvisibles(text);
  const names: string[] = [];
  for (const m of seen.matchAll(DOTTED_WORD)) {
    const name = m[2];
    const at = (m.index ?? 0) + m[1].length;
    const ending = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    const before = seen.slice(Math.max(0, at - 3), at);
    if (SITE_ENDINGS.has(ending) || /^www\./i.test(name) || before === '://') names.push(name);
  }
  return names;
}

const withoutInvisibles = (text: string): string =>
  Array.from(text)
    .filter((ch) => !isInvisible(ch.codePointAt(0) ?? 0))
    .join('');

const bareHost = (host: string): string =>
  host
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');

/** The same site, give or take `www.` and a subdomain: `gutenberg.org` and `www.gutenberg.org/ebooks` agree. */
export function sameSite(a: string, b: string): boolean {
  const x = bareHost(a);
  const y = bareHost(b);
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

/** Every way this link could mislead about where it goes. `text` is the link's text as the book holds it. */
export function linkDeviations(raw: string, text: string): LinkDeviation[] {
  const { kind, host, url } = readLinkAddress(raw);
  const found: LinkDeviation[] = [];
  if (kind !== 'web' || !host || !url) return found;
  // From the parsed domain, decoded, so a look-alike written as letters and one written already encoded are the same.
  const others = domainLetters(host).filter((ch) => (ch.codePointAt(0) ?? 0) > 0x7f);
  if (others.length) found.push({ kind: 'other-letters', chars: [...new Set(others)] });
  if (url.username || url.password) found.push({ kind: 'user-name', name: decodeLoosely(url.username), host });
  const named = siteNamesIn(text);
  if (named.length && !named.some((n) => sameSite(n, host))) {
    found.push({ kind: 'text-names-other-site', shown: named[0], host });
  }
  return found;
}

const decodeLoosely = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text; // a stray `%` — read it as written
  }
};

/**
 * Where the book's link holds characters a reader cannot see — not a deviation, but worth a word in the dialog.
 *
 * - **text**: written out in **Link text** as codes such as `[U+202E]`, so the note says what the codes are. Every
 *   invisible counts, control characters included, since every one of them is written out.
 * - **address**: the browser drops these from a domain and encodes them anywhere else, so **Link address** — which
 *   shows the address as it will be opened — has none of them. The note says so, so the address does not look as if
 *   it were the book's own spelling.
 */
export function hiddenIn(raw: string, text: string): { text?: string; address: boolean } {
  const firstInText = Array.from(text).find((ch) => isInvisible(ch.codePointAt(0) ?? 0) && !/[ \t\r\n]/.test(ch));
  return {
    text: firstInText === undefined ? undefined : showInvisibles(firstInText),
    address: Array.from(raw.trim()).some((ch) => isInvisible(ch.codePointAt(0) ?? 0)),
  };
}

// ── Encoded domain names (RFC 3492) ────────────────────────────────────────────────────────────────────────────────

/**
 * The characters of a domain, with every `xn--` label decoded back to the letters it stands for.
 *
 * **Why decode at all.** A look-alike domain can be written as letters or already encoded, and the browser treats
 * both the same — then may show the decoded letters in its own address bar. Reading only what the book wrote would
 * catch the first spelling and miss the second. The browser has no decoder to call, so this is RFC 3492's.
 */
function domainLetters(host: string): string[] {
  const letters: string[] = [];
  for (const label of host.split('.')) {
    const decoded = /^xn--/i.test(label) ? decodePunycode(label.slice(4)) : label;
    letters.push(...Array.from(decoded ?? label));
  }
  return letters;
}

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 0x80;

function adapt(delta: number, points: number, first: boolean): number {
  let d = first ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / points);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

/** A base-36 digit's value: `a`-`z` are 0-25, `0`-`9` are 26-35. `BASE` for anything else. */
function digitValue(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26;
  if (code >= 0x41 && code <= 0x5a) return code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61;
  return BASE;
}

/** One label's encoded part (without `xn--`) decoded, or null when it is not valid. */
export function decodePunycode(input: string): string | null {
  const output: number[] = [];
  const delimiter = input.lastIndexOf('-');
  for (let j = 0; j < Math.max(delimiter, 0); j++) {
    const code = input.charCodeAt(j);
    if (code >= 0x80) return null;
    output.push(code);
  }
  let n = INITIAL_N;
  let bias = INITIAL_BIAS;
  let i = 0;
  for (let index = delimiter > 0 ? delimiter + 1 : 0; index < input.length; ) {
    const before = i;
    let weight = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) return null;
      const digit = digitValue(input.charCodeAt(index++));
      if (digit >= BASE) return null;
      i += digit * weight;
      const threshold = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < threshold) break;
      weight *= BASE - threshold;
      if (i > 0x7fffffff || weight > 0x7fffffff) return null;
    }
    const length = output.length + 1;
    bias = adapt(i - before, length, before === 0);
    n += Math.floor(i / length);
    i %= length;
    if (n > 0x10ffff) return null;
    output.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...output);
}

/** Writing systems a character is named by, as ISO 15924 codes — the ones a look-alike letter usually comes from. */
const SCRIPTS = [
  'Latn',
  'Cyrl',
  'Grek',
  'Armn',
  'Cher',
  'Geor',
  'Hebr',
  'Arab',
  'Deva',
  'Thai',
  'Hang',
  'Hira',
  'Kana',
  'Hani',
];

/**
 * A character as the dialog names it: itself, its writing system in the reader's language, and its code point —
 * the letter, then `(Cyrillic, U+0430)`. A system not in `SCRIPTS`, or a language with no names, leaves just the code point.
 */
export function describeCharacter(ch: string, lang: string): string {
  const code = `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
  const script = SCRIPTS.find((s) => new RegExp(`^\\p{Script=${s}}$`, 'u').test(ch));
  let name: string | undefined;
  try {
    name = script ? new Intl.DisplayNames([lang, 'en'], { type: 'script' }).of(script) : undefined;
  } catch {
    name = undefined;
  }
  return name ? `${ch} (${name}, ${code})` : `${ch} (${code})`;
}

// ── What the dialog states ─────────────────────────────────────────────────────────────────────────────────────────

/** What kind of link it is, named from its scheme — what the dialog's **Link type** row says. */
export type LinkType = 'web' | 'email' | 'phone' | 'obsidian' | 'file' | 'app' | 'invalid';

export interface LinkFacts {
  type: LinkType;
  /** A web link's site, or the domains an email link writes to. Absent where a link has none. */
  domain?: string;
  /** An Obsidian link's action (`search`, `new`, `open`), or another app's scheme (`steam:`). */
  detail?: string;
}

export function linkFacts(raw: string): LinkFacts {
  const { host, url } = readLinkAddress(raw);
  if (!url) return { type: 'invalid' };
  switch (url.protocol) {
    case 'http:':
    case 'https:':
      return { type: 'web', domain: host || undefined };
    case 'mailto:':
      return { type: 'email', domain: emailDomains(url.pathname) || undefined };
    case 'tel:':
      return { type: 'phone' };
    case 'obsidian:':
      // From the address rather than `hostname`, which older engines leave empty for a scheme they do not know.
      return { type: 'obsidian', detail: /^obsidian:\/\/([^/?#]+)/i.exec(url.href)?.[1] };
    case 'file:':
      return { type: 'file' };
    default:
      return { type: 'app', detail: url.protocol };
  }
}

/** The domains after each recipient's `@`, in order, without repeats: `a@example.com,b@example.org`. */
function emailDomains(path: string): string {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // A stray `%` — read it as written.
  }
  const domains: string[] = [];
  for (const recipient of decoded.split(',')) {
    const at = recipient.lastIndexOf('@');
    const domain =
      at < 0
        ? ''
        : recipient
            .slice(at + 1)
            .trim()
            .toLowerCase();
    if (domain && !domains.includes(domain)) domains.push(domain);
  }
  return domains.join(', ');
}

/** Which row of the dialog a difference is about — the line is drawn under it. */
export function deviationRow(d: LinkDeviation): 'domain' | 'text' | 'address' {
  switch (d.kind) {
    case 'other-letters':
      return 'domain';
    case 'text-names-other-site':
      return 'text';
    case 'user-name':
      return 'address';
  }
}
