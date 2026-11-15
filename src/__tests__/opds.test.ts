import { describe, expect, it } from 'vitest';
import {
  bestAcquisition,
  extensionForType,
  type OpdsEntry,
  parseOpds12,
  parseOpenSearchTemplate,
  resolveOpdsHref,
  searchUrlFrom,
  sizeLabel,
  yearOf,
} from '../sources/opds';

/** A feed in the shape Gutenberg publishes: absolute hrefs, open-access acquisition, content rather than summary. */
const GUTENBERG = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <title>Search results</title>
  <link rel="next" type="application/atom+xml;profile=opds-catalog"
        href="https://www.gutenberg.org/ebooks/search.opds/?query=ferry&amp;start_index=26"/>
  <link rel="search" type="application/opensearchdescription+xml"
        href="https://www.gutenberg.org/catalog/osd-books.xml"/>
  <link rel="alternate" type="text/html" title="HTML Page" href="/ebooks/search/?query=ferry"/>
  <entry>
    <id>urn:gutenberg:12345</id>
    <title>Sample Book; Or, The Subtitle</title>
    <author><name>Tester, Orbis</name></author>
    <content type="text">A ferry crossing.</content>
    <dcterms:language>en</dcterms:language>
    <dcterms:issued>1851</dcterms:issued>
    <link rel="http://opds-spec.org/acquisition/open-access" type="application/epub+zip"
          href="https://www.gutenberg.org/ebooks/12345.epub.images"/>
    <link rel="http://opds-spec.org/acquisition/open-access" type="text/html"
          href="https://www.gutenberg.org/ebooks/12345.html"/>
    <link rel="http://opds-spec.org/image" type="image/jpeg"
          href="https://www.gutenberg.org/cache/epub/12345/pg12345.cover.medium.jpg"/>
  </entry>
</feed>`;

/** Calibre's content server: a direct search template, navigation entries with no `rel`, `length` and no link title. */
const CALIBRE_SERVER = `<?xml version='1.0' encoding='utf-8'?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/">
  <title>calibre Library</title>
  <link type="application/atom+xml" rel="search" title="Search"
        href="/opds/search/{searchTerms}?library_id=calibre-library"/>
  <link type="application/atom+xml;type=feed;profile=opds-catalog" rel="start" href="/opds?library_id=calibre-library"/>
  <link type="application/atom+xml;type=feed;profile=opds-catalog" rel="self" href="/opds?library_id=calibre-library"/>
  <entry>
    <title>Library: calibre-library</title>
    <id>calibre-library:calibre-library</id>
    <content type="text">Change calibre library to: calibre-library</content>
    <link type="application/atom+xml;type=feed;profile=opds-catalog" href="/opds?library_id=calibre-library"/>
  </entry>
  <entry>
    <title>Library: comics</title>
    <id>calibre-library:comics</id>
    <content type="text">Change calibre library to: comics</content>
    <link type="application/atom+xml;type=feed;profile=opds-catalog" href="/opds?library_id=comics"/>
  </entry>
  <entry>
    <title>By Newest</title>
    <id>calibre-navcatalog:dcd4ee</id>
    <content type="text">Books sorted by Date</content>
    <link type="application/atom+xml;type=feed;profile=opds-catalog"
          href="/opds/navcatalog/4f6e6577657374?library_id=calibre-library"/>
  </entry>
  <entry>
    <title>The World of Jane Doe’s Sample Series</title>
    <author><name>Jane Doe &amp; John Roe</name></author>
    <id>urn:uuid:cd65b145</id>
    <published>2025-04-13T20:41:56+00:00</published>
    <link type="application/epub+zip" href="/get/epub/892/calibre-library" rel="http://opds-spec.org/acquisition"
          length="169461311" mtime="2025-04-13T20:41:56.264140+00:00"/>
    <link type="image/jpeg" href="/get/cover/892/calibre-library" rel="http://opds-spec.org/cover"/>
  </entry>
</feed>`;

/** A feed in the shape Calibre-Web publishes: relative hrefs, dc:creator, a category entry to drill into. */
const CALIBRE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <title>calibre library</title>
  <entry>
    <title>By author</title>
    <id>urn:calibre:authors</id>
    <link type="application/atom+xml;profile=opds-catalog;kind=navigation" href="/opds/navcatalog/4e617574686f7273"/>
  </entry>
  <entry>
    <title>Third Book</title>
    <id>urn:uuid:9f8c</id>
    <dc:creator>Orbis Tester</dc:creator>
    <dc:publisher>Sample Press</dc:publisher>
    <summary>Life at Larkspur Mill.</summary>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="/get/EPUB/42/library"
          title="EPUB" length="558547"/>
    <link rel="http://opds-spec.org/image/thumbnail" type="image/jpeg" href="/get/thumb/42/library"/>
  </entry>
</feed>`;

describe('parseOpds12', () => {
  it('reads a feed’s title, its paging and its search link', () => {
    const feed = parseOpds12(GUTENBERG);
    expect(feed?.title).toBe('Search results');
    expect(feed?.next).toContain('start_index=26');
    expect(feed?.previous).toBeNull();
    expect(feed?.searchDescription).toBe('https://www.gutenberg.org/catalog/osd-books.xml');
  });

  it('reads a book entry whatever the namespace prefixes are', () => {
    const entry = parseOpds12(GUTENBERG)?.entries[0] as OpdsEntry;
    expect(entry.title).toBe('Sample Book; Or, The Subtitle');
    expect(entry.authors).toEqual(['Tester, Orbis']);
    expect(entry.language).toBe('en');
    // `issued` is the work's date — the year the book was written — and that is the one a catalog record wants.
    expect(entry.published).toBe('1851');
    // Gutenberg fills in `content` rather than `summary`, and it is often the only description there is.
    expect(entry.summary).toBe('A ferry crossing.');
    expect(entry.images[0].href).toContain('pg12345.cover.medium.jpg');
    expect(entry.subfeed).toBeNull();
  });

  /**
   * **Nothing in OPDS marks a category as a category.** A feed says so by what an entry links to — another catalog
   * document rather than something you can acquire — which is why this is derived rather than trusted from a `rel`.
   * Calibre's navigation entries carry no `rel` at all.
   */
  it('tells a category from a book by what it links to', () => {
    const [category, book] = parseOpds12(CALIBRE)?.entries ?? [];
    expect(category.subfeed).toBe('/opds/navcatalog/4e617574686f7273');
    expect(category.acquisitions).toEqual([]);
    expect(book.subfeed).toBeNull();
    expect(book.acquisitions).toHaveLength(1);
  });

  // `dc:creator` is what some Calibre versions write instead of Atom's `<author><name>`.
  it('reads an author from dc:creator when there is no Atom author', () => {
    const book = parseOpds12(CALIBRE)?.entries[1] as OpdsEntry;
    expect(book.authors).toEqual(['Orbis Tester']);
    expect(book.publisher).toBe('Sample Press');
    expect(book.summary).toBe('Life at Larkspur Mill.');
  });

  /**
   * **A parse failure is not an empty catalog.** `DOMParser` reports malformed XML as a document containing
   * `parsererror` rather than by throwing, so without the check a broken feed would read as a feed with nothing in it —
   * and the reader would be told their catalog is empty.
   */
  it('answers null for anything that is not a feed we can read', () => {
    expect(parseOpds12('<feed><entry><title>unclosed')).toBeNull();
    expect(parseOpds12('{"metadata":{"title":"OPDS 2.0"}}')).toBeNull();
    expect(parseOpds12('')).toBeNull();
    // A well-formed document that is not a feed: an OpenSearch description fetched by mistake, say.
    expect(parseOpds12('<?xml version="1.0"?><OpenSearchDescription/>')).toBeNull();
  });

  // A real feed with nothing in it is a different answer from a feed we could not read, and has to stay different.
  it('answers an empty list for a catalog that is genuinely empty', () => {
    const feed = parseOpds12('<feed xmlns="http://www.w3.org/2005/Atom"><title>Nothing here</title></feed>');
    expect(feed?.entries).toEqual([]);
    expect(feed?.title).toBe('Nothing here');
  });
});

describe('bestAcquisition', () => {
  const entry = (types: string[]): OpdsEntry => ({
    id: 'x',
    title: 'T',
    authors: [],
    summary: '',
    language: '',
    published: '',
    publisher: '',
    acquisitions: types.map((type, i) => ({
      rel: 'http://opds-spec.org/acquisition',
      type,
      href: `file-${i}`,
      title: '',
      length: 0,
    })),
    images: [],
    subfeed: null,
  });

  // Preference is a list, not a score: EPUB is the format the reader was written for, and the rest follow in the order
  // they degrade — so what the feed listed first does not decide it.
  it('prefers EPUB however the feed ordered its links', () => {
    const picked = bestAcquisition(entry(['application/x-mobipocket-ebook', 'application/epub+zip']));
    expect(picked?.ext).toBe('epub');
    expect(picked?.link.href).toBe('file-1');
  });

  it('falls back through the formats Orbis opens', () => {
    expect(bestAcquisition(entry(['application/vnd.comicbook+zip']))?.ext).toBe('cbz');
    expect(bestAcquisition(entry(['text/html', 'application/vnd.amazon.ebook']))?.ext).toBe('azw3');
  });

  /**
   * **Null is the answer that matters.** An entry offering only a PDF, or only a DRM-wrapped type, must not be
   * downloaded from and explained afterwards: the row can say "not a format Orbis opens" before anyone taps it.
   */
  it('answers null when nothing on offer can be opened', () => {
    expect(bestAcquisition(entry(['application/pdf', 'text/html']))).toBeNull();
    expect(bestAcquisition(entry([]))).toBeNull();
  });
});

describe('extensionForType', () => {
  it('maps the types Orbis opens', () => {
    expect(extensionForType('application/epub+zip')).toBe('epub');
    expect(extensionForType('application/epub+zip;charset=utf-8')).toBe('epub');
    expect(extensionForType('application/x-mobipocket-ebook')).toBe('mobi');
    expect(extensionForType('application/vnd.amazon.ebook')).toBe('azw3');
    expect(extensionForType('application/vnd.comicbook+zip')).toBe('cbz');
  });

  /**
   * **A type we cannot open has to be visibly absent**, not defaulted. A catalog of PDFs must be able to say "not a
   * format Orbis opens" before anyone taps a row, rather than handing over a file that fails at the door.
   */
  it('answers null for a format Orbis cannot open', () => {
    expect(extensionForType('application/pdf')).toBeNull();
    expect(extensionForType('text/html')).toBeNull();
    expect(extensionForType('')).toBeNull();
  });
});

describe('resolveOpdsHref', () => {
  // Calibre writes relative hrefs throughout, so this is the normal case rather than an edge one.
  it('resolves a relative href against the feed it came from', () => {
    expect(resolveOpdsHref('/get/EPUB/42/library', 'http://192.168.1.10:8080/opds')).toBe(
      'http://192.168.1.10:8080/get/EPUB/42/library'
    );
    expect(resolveOpdsHref('page2', 'https://example.com/opds/browse/')).toBe('https://example.com/opds/browse/page2');
  });

  it('leaves an absolute href alone', () => {
    expect(resolveOpdsHref('https://gutenberg.example/12345.epub', 'https://other.example/feed')).toBe(
      'https://gutenberg.example/12345.epub'
    );
  });

  // A malformed link should drop one row rather than throw while a page is being drawn.
  it('answers null rather than throwing on something that is not a URL', () => {
    expect(resolveOpdsHref('http://[bad', 'https://example.com')).toBeNull();
  });

  /**
   * **A feed is a document written by whoever runs the catalog.** `new URL()` will build any scheme it is given,
   * and these hrefs go on to be fetched, or handed to a download. The same rule `nextHop` applies to a redirect,
   * applied at the door a feed comes through.
   */
  it('refuses a scheme we have no business fetching', () => {
    expect(resolveOpdsHref('file:///etc/passwd', 'https://books.example/opds')).toBeNull();
    expect(resolveOpdsHref('javascript:alert(1)', 'https://books.example/opds')).toBeNull();
    expect(resolveOpdsHref('data:text/html,<script>x()</script>', 'https://books.example/opds')).toBeNull();
    expect(resolveOpdsHref('obsidian://open?vault=x', 'https://books.example/opds')).toBeNull();
  });

  it('still allows the two schemes a catalog actually uses', () => {
    expect(resolveOpdsHref('https://books.example/a.epub', 'https://books.example/opds')).toBe(
      'https://books.example/a.epub'
    );
    expect(resolveOpdsHref('http://192.168.1.10:8080/get/1', 'http://192.168.1.10:8080/opds')).toBe(
      'http://192.168.1.10:8080/get/1'
    );
  });
});

describe('parseOpenSearchTemplate', () => {
  const OSD = `<?xml version="1.0"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Gutenberg</ShortName>
  <Url type="text/html" template="https://example.com/search?q={searchTerms}"/>
  <Url type="application/atom+xml;profile=opds-catalog"
       template="https://example.com/search.opds/?query={searchTerms}&amp;start_index={startIndex?}"/>
</OpenSearchDescription>`;

  // Several Url elements, one per response type: the catalog one is the one we can read.
  it('takes the catalog template rather than the first one', () => {
    expect(parseOpenSearchTemplate(OSD)).toContain('search.opds/?query={searchTerms}');
  });

  // A description offering only HTML is a feed whose search is for a browser, not for us.
  it('answers null when there is no usable template', () => {
    expect(
      parseOpenSearchTemplate('<OpenSearchDescription><Url type="text/html" template="x"/></OpenSearchDescription>')
    ).toBeNull();
    expect(parseOpenSearchTemplate('not xml at all <')).toBeNull();
  });
});

describe('searchUrlFrom', () => {
  it('fills in what the reader typed, encoded', () => {
    expect(searchUrlFrom('https://example.com/s?q={searchTerms}', 'sample book')).toBe(
      'https://example.com/s?q=sample%20book'
    );
  });

  /**
   * **Optional parameters are dropped rather than guessed at.** A feed that marks `{count?}` optional accepts its
   * absence, and inventing a page size would be deciding how much of somebody's catalog to ask for — which is the
   * opposite of the one-request-per-action posture this feature lives under.
   */
  it('drops the optional parameters and their now-empty keys', () => {
    expect(searchUrlFrom('https://example.com/s?query={searchTerms}&start_index={startIndex?}', 'ferry')).toBe(
      'https://example.com/s?query=ferry'
    );
  });

  it('trims what was typed', () => {
    expect(searchUrlFrom('https://example.com/s?q={searchTerms}', '  ferry  ')).toBe('https://example.com/s?q=ferry');
  });
});

describe('link sizes', () => {
  /**
   * **Two identical-looking entries, told apart by their links.** Gutenberg publishes one book as two entries with the
   * same title — one edition with images, one without — and the only visible difference is the link's own title and its
   * size: 545 KB against 24 MB. Both are read, because a row that cannot tell them apart makes the reader guess.
   */
  it('reads a link’s title and length', () => {
    const link = parseOpds12(CALIBRE)?.entries[1].acquisitions[0];
    expect(link?.title).toBe('EPUB');
    expect(link?.length).toBe(558547);
  });

  // A feed that says nothing about size says nothing: zero, which is not the same as an empty file and prints as
  // nothing at all.
  it('reads no size as zero', () => {
    expect(parseOpds12(GUTENBERG)?.entries[0].acquisitions[0].length).toBe(0);
  });
});

describe('sizeLabel', () => {
  /**
   * Coarse on purpose: the question a size answers here is "is this the 500 KB edition or the 24 MB one", and a
   * decimal earns its place only under 10 MB, where it is the difference between 2 MB and 9 MB rather than noise.
   */
  it('weighs a download in units a reader can compare', () => {
    expect(sizeLabel(558547)).toBe('545 KB');
    expect(sizeLabel(24835612)).toBe('24 MB');
    expect(sizeLabel(3 * 1024 * 1024 + 512 * 1024)).toBe('3.5 MB');
    expect(sizeLabel(120 * 1024 * 1024)).toBe('120 MB');
    expect(sizeLabel(900)).toBe('900 B');
  });

  it('says nothing when the feed said nothing', () => {
    expect(sizeLabel(0)).toBe('');
    expect(sizeLabel(Number.NaN)).toBe('');
  });
});

describe('yearOf', () => {
  /**
   * Feeds write dates in every shape they are allowed to, and a row has space for the year. Gutenberg's `published` is
   * the day it added the file — printing `1998-06-01T00:00:00+00:00` in a list of books says nothing and costs a line.
   */
  it('takes the year out of any shape of date', () => {
    expect(yearOf('1998-06-01T00:00:00+00:00')).toBe('1998');
    expect(yearOf('1851')).toBe('1851');
    expect(yearOf('1998-06-01')).toBe('1998');
  });

  // A feed that writes something else in a date field has said something, and blanking it would be us deciding it
  // said nothing.
  it('leaves what it cannot read alone', () => {
    expect(yearOf('Victorian era')).toBe('Victorian era');
    expect(yearOf('  ')).toBe('');
  });
});

describe('the way out to a browser', () => {
  /**
   * **A feed's own HTML address is the escape hatch when a catalog does something we cannot follow.** Gutenberg's bot
   * protection refuses the OPDS facet endpoints its own feed advertises — *Authors*, *Subjects* — while serving the HTML
   * equivalents happily. Rewriting `.opds` into their HTML path would be guessing at how somebody else builds URLs;
   * `rel="alternate"` is their answer to the same question, published in the feed.
   */
  it('reads the feed’s alternate HTML link', () => {
    expect(parseOpds12(GUTENBERG)?.alternate).toBe('/ebooks/search/?query=ferry');
  });

  // A feed that offers no browser version says nothing, and the affordance simply is not drawn.
  it('is null when a feed offers none', () => {
    expect(parseOpds12(CALIBRE)?.alternate).toBeNull();
  });
});

describe('Calibre’s content server', () => {
  /**
   * **A `rel="search"` link is one of two things.** Gutenberg's points at an OpenSearch description, which has to be
   * fetched to learn the template; Calibre's *is* the template — `/opds/search/{searchTerms}?library_id=…`. Both are
   * legal, and reading only the first would leave Calibre with no search box at all.
   */
  it('reads the search template the feed publishes outright', () => {
    const feed = parseOpds12(CALIBRE_SERVER);
    expect(feed?.searchTemplate).toBe('/opds/search/{searchTerms}?library_id=calibre-library');
    // And does not mistake it for a description to fetch, which would be a wasted request answering nothing.
    expect(feed?.searchDescription).toBeNull();
  });

  // Gutenberg's is the other way round, and both have to keep working.
  it('still reads a description to fetch when that is what the feed offers', () => {
    const feed = parseOpds12(GUTENBERG);
    expect(feed?.searchTemplate).toBeNull();
    expect(feed?.searchDescription).toBe('https://www.gutenberg.org/catalog/osd-books.xml');
  });

  // Its navigation entries carry no `rel` at all — the type is the only signal, which is why a category is derived.
  it('tells its categories from its books', () => {
    // By title rather than by position: this feed's first rows are library switches, and a test that counted on the
    // order would break the next time a catalog put something new at the top.
    const entries = parseOpds12(CALIBRE_SERVER)?.entries ?? [];
    const category = entries.find((e) => e.title === 'By Newest') as OpdsEntry;
    const book = entries.find((e) => e.title.startsWith('The World of Jane')) as OpdsEntry;
    expect(category.subfeed).toBe('/opds/navcatalog/4f6e6577657374?library_id=calibre-library');
    expect(book.subfeed).toBeNull();
    expect(book.authors).toEqual(['Jane Doe & John Roe']);
  });

  /**
   * **A size with no link title.** Calibre gives `length` and no `title`, so a row falls back to the extension —
   * "EPUB · 162 MB" — where Gutenberg's own words are used when it has them. The size matters here more than most: this
   * is a real 169 MB book, and knowing that before tapping is the point.
   */
  it('reads a size where the feed gives no words for the file', () => {
    const book = (parseOpds12(CALIBRE_SERVER)?.entries ?? []).find((e) =>
      e.title.startsWith('The World of Jane')
    ) as OpdsEntry;
    const pick = bestAcquisition(book);
    expect(pick?.ext).toBe('epub');
    expect(pick?.link.title).toBe('');
    expect(sizeLabel(pick?.link.length ?? 0)).toBe('162 MB');
  });
});

describe('a row that goes nowhere', () => {
  /**
   * **Calibre offers to change to the library you are in.** Its feed carries "Library: calibre-library — Change calibre
   * library to: calibre-library" whether or not there is another library, and its href is the feed's own `rel="self"`.
   * So the rule is about the link rather than about Calibre: an entry pointing at the feed it appears on is a tap that
   * costs a request and lands where it started.
   */
  it('knows the feed’s own address', () => {
    expect(parseOpds12(CALIBRE_SERVER)?.self).toBe('/opds?library_id=calibre-library');
  });

  // And a genuine second library is a different address, so it survives — the reason this is not a rule about titles.
  it('leaves a real second library alone', () => {
    const entries = parseOpds12(CALIBRE_SERVER)?.entries ?? [];
    const others = entries.filter((e) => e.subfeed && e.subfeed !== '/opds?library_id=calibre-library');
    expect(others.map((e) => e.title)).toContain('Library: comics');
  });
});
