// What we know about particular catalogs: a link one publishes and refuses, and how one asks for a language.
//
// **A curation list, and Orbis is entitled to one for the sources it ships.** We keep those URLs correct, which is the
// same undertaking. Everything here is host-specific by nature — it is knowledge about somebody else's server — so it
// lives in one module where it can be read, dated and deleted, rather than as conditions scattered through the client.
//
// See docs/design/book-sources.md.
//
// ── Links a catalog publishes and its own server refuses ────────────────────
//
// **A row that always fails is worse than no row.** It looks like a way in, costs a request, and answers with a
// refusal — so where we know a link cannot work, the row is not drawn. This is a curation list, and Orbis is entitled
// to one for the sources it ships: we keep those URLs correct, which is the same undertaking.
//
// **Narrow, dated, and logged.** Every entry names what it matches, why, and when it was last checked, because this is
// somebody else's behavior and it can change without telling us. A hidden row is written to the `sources` debug
// channel, so "the catalog offered nothing" and "we hid two things" are never the same observation. If a rule here
// starts hiding a link that works, deleting it is the whole fix.

/** One link we do not offer, and the reason we do not. */
interface KnownIssue {
  /** Host suffix, matched case-insensitively — never a bare substring, so `notgutenberg.org` cannot match. */
  host: string;
  /** Path fragment, matched case-insensitively. */
  path: RegExp;
  /** For the debug log, and for whoever revisits this. */
  why: string;
  checked: string;
}

const KNOWN_ISSUES: readonly KnownIssue[] = [
  {
    host: 'gutenberg.org',
    // The facet feeds its search results advertise: "Authors — 13 author names match your search", and the same for
    // subjects. Their HTML equivalents work in a browser, which is what the feed's `alternate` link is for.
    path: /\/(authors|subjects)\/search\.opds/i,
    why: 'Gutenberg answers 403 to its own facet feeds — bot protection, not a retired endpoint',
    checked: '2026-08-19',
  },
];

/**
 * Why this link is not offered, or `null` when there is no reason not to.
 *
 * Answered from the URL rather than from the row's words, because a title is the feed's to change and a path is what
 * the refusal attaches to. An unparseable URL is not a known issue — it fails its own way, in `resolveOpdsHref`.
 */
export function knownIssueFor(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const issue = KNOWN_ISSUES.find(
    (candidate) =>
      (host === candidate.host || host.endsWith(`.${candidate.host}`)) && candidate.path.test(new URL(url).pathname)
  );
  return issue ? `${issue.why} (checked ${issue.checked})` : null;
}

// ── Asking a catalog for one language ───────────────────────────────────────
//
// **Only where the catalog has a way to be asked.** Gutenberg's search takes filter terms in the query itself — `l.en`
// means English — and answers a feed retitled "Books: Finn  Language: English". Nothing generic is possible: its search
// feed carries no language element per entry, so filtering what came back is not an option, and OPDS has no standard way
// to say this. A source we know no syntax for is not offered the setting at all, rather than offered a box that quietly
// does nothing.

/**
 * The languages worth offering for a catalog, as ISO 639-1 codes — the ones it has enough of to be worth filtering to.
 *
 * **One language, never several.** Gutenberg reads two filter terms as an intersection: `l.en l.fr` answers with books
 * that are in *both*, which is bilingual editions rather than "either" — almost never what anyone means. So the setting
 * offers one, or none.
 *
 * Named to the reader by `Intl.DisplayNames` rather than by a table of ours, so "French" arrives in their own language
 * and this list stays a list of codes.
 */
const GUTENBERG_LANGUAGES = [
  'en',
  'fr',
  'de',
  'fi',
  'nl',
  'it',
  'es',
  'pt',
  'zh',
  'la',
  'sv',
  'da',
  'el',
  'hu',
  'ru',
  'pl',
  'no',
  'eo',
  'cs',
  'ja',
  'ca',
  'tl',
] as const;

/** How a catalog is asked for a language, by host suffix. */
const LANGUAGE_TERMS: ReadonlyArray<{
  host: string;
  term: (code: string) => string;
  queryParam: string;
  languages: readonly string[];
}> = [{ host: 'gutenberg.org', term: (code) => `l.${code}`, queryParam: 'query', languages: GUTENBERG_LANGUAGES }];

function hostRule<T extends { host: string }>(rules: readonly T[], url: string): T | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return rules.find((rule) => host === rule.host || host.endsWith(`.${rule.host}`)) ?? null;
  } catch {
    return null;
  }
}

/** Whether this catalog can be asked for a language at all — what decides whether the setting is offered. */
export function takesLanguage(url: string): boolean {
  return hostRule(LANGUAGE_TERMS, url) !== null;
}

/** The codes to offer for this catalog, or an empty list when it cannot be asked. */
export function languagesFor(url: string): readonly string[] {
  return hostRule(LANGUAGE_TERMS, url)?.languages ?? [];
}

/**
 * The filter term to add for a language code, or `null` when the catalog has no way of being asked.
 *
 * The code is passed through as the reader typed it, lowercased: catalogs disagree about which codes they know — `en`,
 * `en-GB`, `zh` — and a table of our own would be a second thing to keep correct. An unknown code makes a search that
 * returns nothing, which is a legible answer.
 */
export function languageTerm(url: string, code: string): string | null {
  const trimmed = code.trim().toLowerCase();
  if (!trimmed) return null;
  const rule = hostRule(LANGUAGE_TERMS, url);
  return rule ? rule.term(trimmed) : null;
}

/**
 * The same URL with a filter term folded into its query parameter.
 *
 * **Added to what is already there rather than replacing it.** A search URL arrives as `?query=Finn` and has to become
 * `?query=Finn l.en`; a source's own browse URL has no query at all and becomes `?query=l.en`, which Gutenberg reads as
 * "everything, in English". A term already present is left alone, so paging through a filtered feed — whose `next` link
 * carries the query the server built — cannot accumulate it twice.
 */
export function withLanguageTerm(url: string, term: string): string {
  const rule = hostRule(LANGUAGE_TERMS, url);
  if (!rule || !term) return url;
  try {
    const parsed = new URL(url);
    const current = parsed.searchParams.get(rule.queryParam) ?? '';
    if (current.split(/\s+/).includes(term)) return url;
    parsed.searchParams.set(rule.queryParam, current ? `${current} ${term}` : term);
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Editions a catalog publishes as separate entries under one title and author, told apart by their download address. */
const EDITIONS: ReadonlyArray<{ host: string; edition: (path: string) => 'no-images' | null }> = [
  { host: 'gutenberg.org', edition: (path) => (/\.noimages$/i.test(path) ? 'no-images' : null) },
];

/**
 * Which edition a download is, where its catalog publishes more than one under the same title and author.
 *
 * **Gutenberg publishes a book twice** — with images and without — as two entries identical in title and author. Named
 * by those alone, both downloads wanted one file name, and choosing both got one book and "Already in your vault" for
 * the other. Read from the ADDRESS (`…/2701.epub.noimages`), not from the feed's label, so the same edition always
 * gets the same name and a second download of it is still recognized as already there. Only the edition without
 * images is marked: the one with them is the book as published, and keeps the plain name.
 */
export function downloadEdition(url: string): 'no-images' | null {
  const rule = hostRule(EDITIONS, url);
  if (!rule) return null;
  try {
    return rule.edition(new URL(url).pathname);
  } catch {
    return null;
  }
}
