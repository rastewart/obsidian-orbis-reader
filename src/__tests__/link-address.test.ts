// What the link check reads from a link's address, and how it shows a link's text.
//
// The kind decides what selecting a link does — a book link opens, a script link is refused, anything else is shown
// first — and the host is the line that tells the reader where a web link really goes. Both are read with the URL
// parser `window.open` uses, so these cases are the spellings where a string test would disagree with it.
//
// Invisible characters are built with `String.fromCodePoint` so this file holds none of its own.

import { describe, expect, it } from 'vitest';
import {
  decodePunycode,
  describeCharacter,
  deviationRow,
  hiddenIn,
  LINK_TEXT_MAX,
  linkDeviations,
  linkFacts,
  linkTextShown,
  readLinkAddress,
  sameSite,
  showInvisibles,
  siteNamesIn,
} from '../reader/link-address';

const RLO = String.fromCodePoint(0x202e);
const ZWSP = String.fromCodePoint(0x200b);
const BOM = String.fromCodePoint(0xfeff);
const TAG_A = String.fromCodePoint(0xe0041);
const CYRILLIC_A = String.fromCodePoint(0x0430);
const NEL = String.fromCodePoint(0x0085);

describe('readLinkAddress', () => {
  it('opens a book of a converted set directly', () => {
    expect(readLinkAddress('obsidian://orbis-nav?file=Set%2FTwo.epub').kind).toBe('book');
  });

  it('shows any other obsidian link first — it would reach another plugin or the vault without a word', () => {
    expect(readLinkAddress('obsidian://new?file=probe&content=x').kind).toBe('other');
    expect(readLinkAddress('obsidian://search?query=x').kind).toBe('other');
  });

  it('refuses a script link however it is spelled', () => {
    expect(readLinkAddress('javascript:void(0)').kind).toBe('script');
    expect(readLinkAddress('JavaScript:void(0)').kind).toBe('script');
    expect(readLinkAddress('  javascript:void(0)').kind).toBe('script');
    // The parser drops a tab or line break anywhere in a URL, so this is a script link to the browser.
    expect(readLinkAddress('java\tscript:void(0)').kind).toBe('script');
    expect(readLinkAddress('java\nscript:void(0)').kind).toBe('script');
  });

  it('names the host a web link goes to', () => {
    expect(readLinkAddress('https://example.com/page?q=1')).toMatchObject({ kind: 'web', host: 'example.com' });
    expect(readLinkAddress('HTTP://EXAMPLE.COM/')).toMatchObject({ kind: 'web', host: 'example.com' });
  });

  it('names the real host behind a user name that looks like one', () => {
    expect(readLinkAddress('https://bank.example@elsewhere.invalid/login').host).toBe('elsewhere.invalid');
  });

  it('shows a look-alike host in the form that cannot pass for the real one', () => {
    const host = readLinkAddress(`https://ex${CYRILLIC_A}mple.com/`).host ?? '';
    expect(host.startsWith('xn--')).toBe(true);
    expect(host).not.toBe('example.com');
  });

  it('tells email from other apps', () => {
    expect(readLinkAddress('mailto:someone@example.com').kind).toBe('email');
    expect(readLinkAddress('tel:+15555550100').kind).toBe('other');
    expect(readLinkAddress('file:///').kind).toBe('other');
  });

  it('calls an address the parser rejects invalid', () => {
    expect(readLinkAddress('https://exa mple.com/').kind).toBe('invalid');
    expect(readLinkAddress('http://[::1').kind).toBe('invalid');
  });
});

describe('showInvisibles', () => {
  it('writes out a direction override, a zero-width space, a byte-order mark and a tag character', () => {
    expect(showInvisibles(`invoice${RLO}fdp.exe`)).toBe('invoice[U+202E]fdp.exe');
    expect(showInvisibles(`exa${ZWSP}mple`)).toBe('exa[U+200B]mple');
    expect(showInvisibles(`${BOM}x`)).toBe('[U+FEFF]x');
    expect(showInvisibles(`x${TAG_A}`)).toBe('x[U+E0041]');
  });

  it('writes out control characters, a tab and a line break included', () => {
    expect(showInvisibles('a\tb\nc')).toBe('a[U+0009]b[U+000A]c');
  });

  it('leaves ordinary text alone, accents and other scripts included', () => {
    const text = `caf${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x65e5, 0x672c)} — fine`;
    expect(showInvisibles(text)).toBe(text);
  });
});

describe('linkTextShown', () => {
  it('collapses whitespace the way the page renders it', () => {
    expect(linkTextShown('  Read\n   the   notice ')).toBe('Read the notice');
  });

  it('keeps a byte-order mark visible rather than folding it into a space', () => {
    expect(linkTextShown(`a${BOM}b`)).toBe('a[U+FEFF]b');
  });

  it('cuts long text', () => {
    const shown = linkTextShown('x'.repeat(LINK_TEXT_MAX + 50));
    expect(shown).toBe(`${'x'.repeat(LINK_TEXT_MAX)}…`);
  });

  it('is empty for a link with no text', () => {
    expect(linkTextShown(' \n ')).toBe('');
  });
});

describe('siteNamesIn', () => {
  it('finds site names with a known ending, or written with www. or after a scheme', () => {
    expect(siteNamesIn('Visit gutenberg.org today')).toEqual(['gutenberg.org']);
    expect(siteNamesIn('www.example.shop')).toEqual(['www.example.shop']);
    expect(siteNamesIn('https://example.shop/page')).toEqual(['example.shop']);
  });

  // With any two-letter ending, initials and picture names would be most of what it finds in ordinary books.
  it('leaves initials, file names and email addresses alone', () => {
    expect(siteNamesIn('by c.s.lewis')).toEqual([]);
    expect(siteNamesIn('panorama.jpg')).toEqual([]);
    expect(siteNamesIn('Write to orders@example.com')).toEqual([]);
  });
});

describe('sameSite', () => {
  it('agrees across www. and subdomains, and not across different sites', () => {
    expect(sameSite('gutenberg.org', 'www.gutenberg.org')).toBe(true);
    expect(sameSite('example.com', 'login.example.com')).toBe(true);
    expect(sameSite('example.com', 'example.com.elsewhere.invalid')).toBe(false);
    expect(sameSite('hc.com', 'harpercollins.com')).toBe(false);
  });
});

describe('linkDeviations', () => {
  const kinds = (raw: string, text: string) => linkDeviations(raw, text).map((d) => d.kind);

  it('finds nothing in an ordinary link', () => {
    expect(kinds('https://www.gutenberg.org/ebooks/1', 'gutenberg.org')).toEqual([]);
    expect(kinds('https://example.com/', 'Read more')).toEqual([]);
    expect(kinds('mailto:someone@example.com', 'someone@example.com')).toEqual([]);
  });

  it('reports link text naming a different site, as both names', () => {
    expect(linkDeviations('https://example.org/sign-in', 'https://example.com/account')).toEqual([
      { kind: 'text-names-other-site', shown: 'example.com', host: 'example.org' },
    ]);
  });

  // An address doubled by a typo goes to a site literally called `http` — a real difference, reported as one.
  it('reports a broken address whose site is not the one its text names', () => {
    expect(linkDeviations('http://http://news.example.com', 'news.example.com')).toEqual([
      { kind: 'text-names-other-site', shown: 'news.example.com', host: 'http' },
    ]);
  });

  it('reports a name before @, with the site it really reaches', () => {
    expect(linkDeviations('https://example.com@example.net/', 'Sign in')).toEqual([
      { kind: 'user-name', name: 'example.com', host: 'example.net' },
    ]);
  });

  it('lists each character outside basic Latin in the site name as the book wrote it', () => {
    const found = linkDeviations(`https://ex${CYRILLIC_A}mple.com/`, 'https://example.com/');
    expect(found[0]).toEqual({ kind: 'other-letters', chars: [CYRILLIC_A] });
    // The text names example.com and the browser goes to the encoded name: both facts are reported.
    expect(found.map((d) => d.kind)).toEqual(['other-letters', 'text-names-other-site']);
  });

  // The same look-alike, delivered encoded: the browser treats both spellings alike, and may show the letters after.
  it('names the letters of a domain the book wrote already encoded', () => {
    expect(linkDeviations('https://xn--exmple-4nf.com/', 'A shop')).toEqual([
      { kind: 'other-letters', chars: [CYRILLIC_A] },
    ]);
  });

  // The rows already show the truth: the text writes the character out, the browser drops it from the domain.
  it('does not treat hidden characters as a difference', () => {
    expect(kinds(`https://exa${ZWSP}mple.com/`, 'https://example.com/')).toEqual([]);
    expect(kinds('https://example.com/invoice', `invoice${RLO}fdp.exe`)).toEqual([]);
    expect(kinds('https://example.com/', `Part One${NEL}Continued`)).toEqual([]);
  });

  it('compares the text as the reader saw it, without its hidden characters', () => {
    expect(kinds('https://example.com/', `exa${ZWSP}mple.com`)).toEqual([]);
    expect(kinds('https://example.org/', `exa${ZWSP}mple.com`)).toEqual(['text-names-other-site']);
  });
});

describe('describeCharacter', () => {
  it('names the writing system and the code point', () => {
    expect(describeCharacter(CYRILLIC_A, 'en')).toBe(`${CYRILLIC_A} (Cyrillic, U+0430)`);
  });

  it('falls back to the code point for a system it does not name', () => {
    expect(describeCharacter(String.fromCodePoint(0x16a0), 'en')).toBe(`${String.fromCodePoint(0x16a0)} (U+16A0)`);
  });
});

describe('linkFacts', () => {
  it('names the type from the scheme, with the domain where there is one', () => {
    expect(linkFacts('https://www.example.com/a')).toEqual({ type: 'web', domain: 'www.example.com' });
    expect(linkFacts('tel:+15555550100')).toEqual({ type: 'phone' });
    expect(linkFacts('file:///')).toEqual({ type: 'file' });
    expect(linkFacts('https://exa mple.com/')).toEqual({ type: 'invalid' });
  });

  it('gives an email link the domains it writes to, once each', () => {
    expect(linkFacts('mailto:a@Example.com,b@example.com,c@example.org?subject=Hi')).toEqual({
      type: 'email',
      domain: 'example.com, example.org',
    });
    expect(linkFacts('mailto:?subject=Hi')).toEqual({ type: 'email' });
  });

  it('names an Obsidian link by its action, and another app by its scheme', () => {
    expect(linkFacts('obsidian://search?query=x')).toEqual({ type: 'obsidian', detail: 'search' });
    expect(linkFacts('steam://run/1')).toEqual({ type: 'app', detail: 'steam:' });
  });
});

describe('deviationRow', () => {
  it('puts each difference under the row it is about', () => {
    expect(deviationRow({ kind: 'other-letters', chars: [CYRILLIC_A] })).toBe('domain');
    expect(deviationRow({ kind: 'text-names-other-site', shown: 'a.com', host: 'b.com' })).toBe('text');
    expect(deviationRow({ kind: 'user-name', name: 'a', host: 'b.com' })).toBe('address');
  });
});

describe('hiddenIn', () => {
  it('names the first hidden character in the text, as the dialog writes it', () => {
    expect(hiddenIn('https://example.com/', `invoice${RLO}fdp.exe`)).toEqual({ text: '[U+202E]', address: false });
    expect(hiddenIn('https://example.com/', `Part One${NEL}Continued`).text).toBe('[U+0085]');
  });

  it('ignores the spaces and line breaks the page collapses', () => {
    expect(hiddenIn('https://example.com/', 'Read\n  more\t').text).toBeUndefined();
  });

  it('notices a hidden character in the address, but not whitespace around it', () => {
    expect(hiddenIn(`https://exa${ZWSP}mple.com/`, 'x').address).toBe(true);
    expect(hiddenIn('  https://example.com/\n', 'x').address).toBe(false);
  });
});

describe('decodePunycode', () => {
  it('decodes the encoded part of a label (RFC 3492)', () => {
    expect(decodePunycode('exmple-4nf')).toBe(`ex${CYRILLIC_A}mple`);
    // RFC 3492's own sample 7.1 (L), in Japanese.
    expect(decodePunycode('3B-ww4c5e180e575a65lsy2b')).toBe(
      String.fromCodePoint(0x33, 0x5e74, 0x42, 0x7d44, 0x91d1, 0x516b, 0x5148, 0x751f)
    );
  });

  it('refuses what is not valid', () => {
    expect(decodePunycode('exmple-4n!')).toBeNull();
    expect(decodePunycode('abc-9')).toBeNull();
  });
});
