// Reading an OPDS catalog: one feed shape, and a parser for the format that shape came from.
//
// **OPDS 1.2 is Atom XML and OPDS 2.0 is JSON**, and both describe the same three things: where else you can go, what
// books are here, and how to get them. So the plugin knows one `OpdsFeed`, and a parser per format produces it. 1.2
// first, because it is what Calibre speaks and what everything speaks today — and behind a seam, because Gutenberg
// expects to sunset its XML feeds in 2027 and that date will arrive.
//
// Pure string in, object out: no vault, no network. Every shape of real-world feed can then be pinned by a test rather
// than by finding a server that has one — which matters more here than for the OPF parser, because the alternative is
// hitting somebody's public catalog to find out whether we read it correctly.
//
// See docs/design/book-sources.md.

/** One link on a feed or an entry, as OPDS writes them. */
export interface OpdsLink {
  rel: string;
  type: string;
  href: string;
  /**
   * The feed's own words for this link — "EPUB3 (E-readers incl. Send-to-Kindle)", "Kindle (no images)".
   *
   * Worth keeping, because it is often the only thing that tells two links apart. Gutenberg offers one book as two
   * entries with identical titles, distinguished by whether the edition has images: the entries look the same and the
   * link titles do not.
   */
  title: string;
  /** Bytes, when the feed says — `length` on the link. Zero when it does not, which is not the same as an empty file. */
  length: number;
}

/** A book, or a category to open. */
export interface OpdsEntry {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  language: string;
  published: string;
  publisher: string;
  /** Files this entry offers, in the order the feed listed them. Empty on a category. */
  acquisitions: OpdsLink[];
  /** Cover art, thumbnails first-come. Empty when the feed offers none. */
  images: OpdsLink[];
  /**
   * The feed this entry leads to, when it is a category rather than a book.
   *
   * **An entry is one or the other, and the feed says which by what it links to.** A category links to another
   * catalog document; a book links to something you can acquire. Nothing in the spec marks the distinction directly,
   * which is why this is derived here rather than trusted from a `rel`.
   */
  subfeed: string | null;
}

/** A feed: where you are, what is here, and where else you can go. */
export interface OpdsFeed {
  title: string;
  entries: OpdsEntry[];
  /** The next page, when the feed has one — `rel="next"`. Absent means this is the end. */
  next: string | null;
  previous: string | null;
  /**
   * A search template we can fill in directly — `{searchTerms}` somewhere in it.
   *
   * **Calibre answers the search question in one step, not two.** Its feed carries
   * `rel="search" type="application/atom+xml" href="/opds/search/{searchTerms}?library_id=…"`: the template itself,
   * rather than a pointer to an OpenSearch description. Gutenberg does it the other way. Both are legal, so both are
   * read — and a template found here saves the description fetch entirely.
   */
  searchTemplate: string | null;
  /** An OpenSearch description document to fetch, when the feed points at one instead. */
  searchDescription: string | null;
  /**
   * This feed's own address — `rel="self"` — which is how a row that goes nowhere is recognized.
   *
   * Calibre's content server offers "Library: calibre-library — Change calibre library to: calibre-library" whether or
   * not there is another library to change to, and its href is exactly this. An entry linking to the feed it is on is a
   * tap that costs a request and lands where it started, whatever catalog produced it.
   */
  self: string | null;
  /**
   * The same page for a browser — `rel="alternate"`, `type="text/html"` — when the feed offers one.
   *
   * **The escape hatch when a catalog does something we cannot follow.** Gutenberg's bot protection refuses the OPDS
   * facet endpoints its own feed advertises while serving the HTML ones happily, and no amount of care on this side
   * changes that. A link the feed itself published is the honest way out: it is their address for this page, not our
   * guess at how their URLs are built.
   */
  alternate: string | null;
}

/** The catalog media type, in the several spellings feeds use for it. */
const CATALOG_TYPE = /application\/atom\+xml/i;

/** Acquisition rels: the plain one, plus open-access, which is what Gutenberg and Standard Ebooks use. */
const ACQUISITION_REL = /^http:\/\/opds-spec\.org\/acquisition/i;

const IMAGE_REL = /^http:\/\/opds-spec\.org\/(image|cover)/i;

/**
 * What Orbis can open, best first, mapped from the media types feeds actually publish.
 *
 * **Preference is a list, not a score.** EPUB leads because it is the format the reader was written for; the rest
 * follow in the order they degrade. A type absent from this table is a file we cannot open — which is worth saying to
 * the reader rather than downloading anyway, so the absence has to be visible instead of falling through to a default.
 */
const TYPE_EXTENSIONS: ReadonlyArray<{ pattern: RegExp; ext: string }> = [
  { pattern: /application\/epub\+zip/i, ext: 'epub' },
  { pattern: /application\/(vnd\.amazon\.ebook|x-azw3?|azw3)/i, ext: 'azw3' },
  { pattern: /application\/x-mobipocket-ebook/i, ext: 'mobi' },
  { pattern: /application\/(vnd\.comicbook\+zip|x-cbz)/i, ext: 'cbz' },
  { pattern: /(application|text)\/(x-)?fb2(\+xml)?/i, ext: 'fb2' },
];

/** The extension a media type means for us, or null when it is something Orbis cannot open. */
export function extensionForType(type: string): string | null {
  return TYPE_EXTENSIONS.find((entry) => entry.pattern.test(type))?.ext ?? null;
}

function parseXml(xml: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    // A parse failure arrives as a document containing `parsererror` rather than as a throw, so a malformed feed would
    // otherwise sail through as a feed with no entries — which reads as "this catalog is empty".
    return doc.querySelector('parsererror') ? null : doc;
  } catch {
    return null;
  }
}

/** Direct children with this local name, ignoring namespace prefixes — feeds differ about every prefix but this. */
function childrenNamed(parent: Element, localName: string): Element[] {
  return [...parent.children].filter((el) => el.localName === localName);
}

function textOf(parent: Element, localName: string): string {
  return childrenNamed(parent, localName)[0]?.textContent?.trim() ?? '';
}

function linksOf(parent: Element): OpdsLink[] {
  return childrenNamed(parent, 'link').map((el) => ({
    rel: el.getAttribute('rel')?.trim() ?? '',
    type: el.getAttribute('type')?.trim() ?? '',
    href: el.getAttribute('href')?.trim() ?? '',
    title: el.getAttribute('title')?.trim() ?? '',
    // A size the feed volunteers, and it matters here more than most places: one of the two editions Gutenberg
    // offers of one novel is 545 KB and the other is 24 MB, which is a decision a reader can only make if we say so.
    length: Number.parseInt(el.getAttribute('length') ?? '', 10) || 0,
  }));
}

/**
 * An entry's authors.
 *
 * `<author><name>` is the Atom shape; `<dc:creator>` is what some Calibre versions write instead. Both are read, and
 * an entry that has both is not a book with two authors — so the second is only consulted when the first says nothing.
 */
function authorsOf(entry: Element): string[] {
  const atom = childrenNamed(entry, 'author')
    .map((el) => textOf(el, 'name'))
    .filter(Boolean);
  if (atom.length) return atom;
  return childrenNamed(entry, 'creator')
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean);
}

/**
 * Parse an OPDS 1.2 (Atom) document.
 *
 * `null` means "this is not a feed we can read" — a parse error, or a document with no `feed` element — and the caller
 * says so rather than showing an empty catalog. An empty `entries` on a real feed is a different answer: that is a
 * catalog with nothing in it, which happens and is not an error.
 *
 * **Every href is left exactly as the feed wrote it.** Relative hrefs are the norm in Calibre's feeds, and resolving
 * them needs the URL the document was fetched from, which a parser has no business knowing — see `resolveOpdsHref`.
 */
export function parseOpds12(xml: string): OpdsFeed | null {
  const doc = parseXml(xml);
  const feed = doc?.documentElement;
  if (!feed || feed.localName !== 'feed') return null;

  const feedLinks = linksOf(feed);
  const relHref = (rel: string): string | null =>
    feedLinks.find((link) => link.rel.toLowerCase() === rel && link.href)?.href ?? null;

  return {
    title: textOf(feed, 'title'),
    next: relHref('next'),
    previous: relHref('previous') ?? relHref('prev'),
    // A `rel="search"` link is one of two things, and which one is decided by what is IN it: an href carrying
    // `{searchTerms}` is the template, and anything else points at an OpenSearch description to fetch.
    searchTemplate:
      feedLinks.find((link) => link.rel.toLowerCase() === 'search' && /\{searchTerms\??\}/.test(link.href))?.href ??
      null,
    searchDescription:
      feedLinks.find(
        (link) =>
          link.rel.toLowerCase() === 'search' &&
          !/\{searchTerms\??\}/.test(link.href) &&
          (/opensearchdescription/i.test(link.type) || /osd|opensearch/i.test(link.href))
      )?.href ?? null,
    alternate:
      feedLinks.find((link) => link.rel.toLowerCase() === 'alternate' && /text\/html/i.test(link.type))?.href ?? null,
    self: relHref('self'),
    entries: childrenNamed(feed, 'entry').map((el) => entryOf(el)),
  };
}

function entryOf(el: Element): OpdsEntry {
  const links = linksOf(el);
  const acquisitions = links.filter((link) => ACQUISITION_REL.test(link.rel) && link.href);
  return {
    id: textOf(el, 'id'),
    title: textOf(el, 'title'),
    authors: authorsOf(el),
    // `summary` is the Atom field; `content` is what Gutenberg fills in, and it is often the only description there is.
    summary: textOf(el, 'summary') || textOf(el, 'content'),
    language: textOf(el, 'language'),
    // `issued` is the work's date — the year the book was written — while `published` is the feed entry's own. The
    // work's date is the one a catalog record wants, so it leads.
    published: textOf(el, 'issued') || textOf(el, 'published'),
    publisher: textOf(el, 'publisher'),
    acquisitions,
    images: links.filter((link) => IMAGE_REL.test(link.rel) && link.href),
    // A category, and only when it offers nothing to acquire: an entry with both is a book that happens to link to a
    // series page, and following that instead of downloading it would be the wrong action on a tap.
    subfeed: acquisitions.length
      ? null
      : (links.find((link) => CATALOG_TYPE.test(link.type) && link.href)?.href ?? null),
  };
}

/**
 * The file to download for an entry: the best type it offers, or `null` when it offers nothing we can open.
 *
 * `null` is the answer that matters. A feed that has only PDFs, or only a DRM-wrapped type, must not be downloaded
 * from and told about afterwards — the row can say "not a format Orbis opens" before anyone taps it.
 */
export function bestAcquisition(entry: OpdsEntry): { link: OpdsLink; ext: string } | null {
  for (const { pattern, ext } of TYPE_EXTENSIONS) {
    const link = entry.acquisitions.find((candidate) => pattern.test(candidate.type));
    if (link) return { link, ext };
  }
  return null;
}

/**
 * A feed's href against the URL it was fetched from.
 *
 * Calibre writes relative hrefs throughout, so this is not an edge case; Gutenberg writes absolute ones. `URL` answers
 * both, and answers `null` for an href that is neither — a malformed link should drop one row rather than throw while
 * a page is being drawn.
 */
export function resolveOpdsHref(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    /**
     * **Only the two schemes we can fetch**, the same rule `nextHop` applies to a redirect — applied here because
     * this is the other door into the same machinery. A feed is a document written by whoever runs the catalog,
     * and `new URL()` will happily build `file:///etc/passwd`, `data:` or `javascript:` from an href. Whether
     * `requestUrl` would refuse those is not a thing to find out by relying on it.
     */
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The search template from an OpenSearch description document — the `{searchTerms}` URL a feed's search link leads to.
 *
 * Feeds offer several `Url` elements, one per response type; the catalog one is what we want, and a description that
 * offers only HTML is a feed whose search is for a browser rather than for us.
 */
export function parseOpenSearchTemplate(xml: string): string | null {
  const doc = parseXml(xml);
  const root = doc?.documentElement;
  if (!root) return null;
  const urls = [...root.getElementsByTagName('*')].filter((el) => el.localName === 'Url');
  const catalog = urls.find((el) => CATALOG_TYPE.test(el.getAttribute('type') ?? ''));
  const template = (catalog ?? urls[0])?.getAttribute('template')?.trim();
  return template && /\{searchTerms\??\}/.test(template) ? template : null;
}

/**
 * Fill a search template with what the reader typed.
 *
 * Optional parameters — `{count?}`, `{startIndex?}` — are dropped rather than guessed at: a feed that marks them
 * optional accepts their absence, and inventing a page size would be deciding how much of somebody's catalog to ask
 * for. Anything left mandatory is left in place, which produces a URL the server will reject with a message worth
 * showing rather than a silent wrong answer.
 */
export function searchUrlFrom(template: string, query: string): string {
  return template
    .replace(/\{searchTerms\??\}/g, encodeURIComponent(query.trim()))
    .replace(/\{[^{}]+\?\}/g, '')
    .replace(/[?&]([^=&]+)=(?=&|$)/g, '');
}

/**
 * A size a reader can weigh, from the bytes a feed volunteered. Empty when it volunteered none.
 *
 * Rounded coarsely on purpose: the question a size answers here is "is this the 500 KB edition or the 24 MB one",
 * and that is answered by one significant figure past the unit.
 */
export function sizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(kb / 1024 < 10 ? 1 : 0)} MB`;
}

/**
 * The year out of whatever a feed put in a date field.
 *
 * Feeds write dates in every shape they are allowed to: `1851`, `1998-06-01`, `1998-06-01T00:00:00+00:00`. A row has
 * space for the year and nothing is gained by the rest — the timestamp Gutenberg publishes is the day it added the
 * file, and printing it in full says nothing while taking a line.
 *
 * Anything without a recognisable year comes back as it was, trimmed: a feed that writes "Victorian era" in a date
 * field has said something, and blanking it would be us deciding it said nothing.
 */
export function yearOf(value: string): string {
  const text = value.trim();
  const match = /^(\d{4})(?:[-/].*)?$/.exec(text);
  return match ? match[1] : text;
}
