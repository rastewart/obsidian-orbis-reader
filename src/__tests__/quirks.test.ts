import { describe, expect, it } from 'vitest';
import {
  downloadEdition,
  knownIssueFor,
  languagesFor,
  languageTerm,
  takesLanguage,
  withLanguageTerm,
} from '../sources/quirks';

describe('knownIssueFor', () => {
  /**
   * **The rows Gutenberg publishes and refuses.** Its search results advertise facet feeds — "Authors — 13 author names
   * match your search", and the same for subjects — whose `.opds` endpoints answer 403 with or without a user agent,
   * over either host and scheme. Their 403 page says what it is: automated access denied. A row that always fails looks
   * like a way in and answers with a refusal, so it is not drawn.
   */
  it('knows the facet feeds Gutenberg refuses', () => {
    expect(knownIssueFor('https://www.gutenberg.org/ebooks/authors/search.opds/?query=Finn')).toContain('403');
    expect(knownIssueFor('https://www.gutenberg.org/ebooks/subjects/search.opds/?query=Finn')).toContain('403');
    // The mobile host their OpenSearch template still points at, and plain http, both reach the same place.
    expect(knownIssueFor('http://m.gutenberg.org/ebooks/authors/search.opds/?query=Finn')).not.toBeNull();
  });

  // Everything else Gutenberg offers works and must keep being offered — the books search, a book's own document, the
  // next page. A rule that swallowed those would hide the catalog to spare two rows.
  it('leaves the rest of the same catalog alone', () => {
    expect(knownIssueFor('https://www.gutenberg.org/ebooks/search.opds/?query=Finn')).toBeNull();
    expect(knownIssueFor('https://www.gutenberg.org/ebooks/1342.opds')).toBeNull();
    expect(knownIssueFor('https://www.gutenberg.org/ebooks/search.opds/?start_index=26')).toBeNull();
  });

  /**
   * **Host suffix, not substring.** `notgutenberg.org` and `gutenberg.org.example.com` are other people's servers, and
   * a curation list that reached them would be hiding rows in a catalog we know nothing about.
   */
  it('matches the host it names and nothing that merely contains it', () => {
    expect(knownIssueFor('https://notgutenberg.org/ebooks/authors/search.opds/?query=Finn')).toBeNull();
    expect(knownIssueFor('https://gutenberg.org.example.com/ebooks/authors/search.opds/')).toBeNull();
    // A subdomain of the named host is the named host — `m.gutenberg.org` is theirs.
    expect(knownIssueFor('https://beta.gutenberg.org/ebooks/authors/search.opds/')).not.toBeNull();
  });

  // Nothing here is a known issue: a catalog nobody has curated, and a string that is not a URL at all. The second
  // fails its own way, in `resolveOpdsHref`, and must not be reported as somebody's broken endpoint.
  it('says nothing about anything else', () => {
    expect(knownIssueFor('http://192.168.1.10:8080/opds/navcatalog/authors')).toBeNull();
    expect(knownIssueFor('not a url')).toBeNull();
    expect(knownIssueFor('')).toBeNull();
  });
});

describe('asking a catalog for one language', () => {
  /**
   * **Only where the catalog has a way to be asked.** Gutenberg takes filter terms in its query — `l.en` — and a search
   * for "Finn" without one comes back mostly Finnish. Nothing generic is possible: its search feed carries no language
   * per entry, so filtering what came back is not an option, and OPDS has no standard way to say this. A catalog we know
   * no syntax for is not offered the setting at all rather than offered a box that quietly does nothing.
   */
  it('knows which catalogs can be asked', () => {
    expect(takesLanguage('https://www.gutenberg.org/ebooks/search.opds/')).toBe(true);
    expect(takesLanguage('http://m.gutenberg.org/ebooks/search.opds/?query=Finn')).toBe(true);
    expect(takesLanguage('http://192.168.1.10:8080/opds')).toBe(false);
    expect(takesLanguage('https://standardebooks.org/feeds/opds')).toBe(false);
    expect(takesLanguage('not a url')).toBe(false);
  });

  it('is the catalog’s own filter syntax', () => {
    expect(languageTerm('https://www.gutenberg.org/ebooks/search.opds/', 'en')).toBe('l.en');
    // Passed through as typed, lowercased: catalogs disagree about which codes they know, and a table of our own would
    // be a second thing to keep correct. An unknown code returns nothing, which is a legible answer.
    expect(languageTerm('https://www.gutenberg.org/ebooks/search.opds/', 'FR')).toBe('l.fr');
    expect(languageTerm('https://www.gutenberg.org/ebooks/search.opds/', '  ')).toBeNull();
    expect(languageTerm('http://192.168.1.10:8080/opds', 'en')).toBeNull();
  });

  describe('withLanguageTerm', () => {
    // A source's own browse URL has no query at all, and `?query=l.en` is how Gutenberg reads "everything, in English".
    it('adds the term to a URL with no query', () => {
      expect(withLanguageTerm('https://www.gutenberg.org/ebooks/search.opds/', 'l.en')).toContain('query=l.en');
    });

    // A search URL arrives as `?query=Finn` and has to become `?query=Finn l.en` — added to what is there, not over it.
    it('joins a query that already has terms', () => {
      const out = withLanguageTerm('https://www.gutenberg.org/ebooks/search.opds/?query=Finn', 'l.en');
      expect(decodeURIComponent(new URL(out).searchParams.get('query') ?? '')).toBe('Finn l.en');
    });

    /**
     * **Paging must not accumulate it.** The `next` link a server builds carries the query it answered — including the
     * filter — so adding it again on every page would produce `query=Finn l.en l.en l.en`.
     */
    it('leaves a term that is already there alone', () => {
      const once = withLanguageTerm('https://www.gutenberg.org/ebooks/search.opds/?query=Finn+l.en', 'l.en');
      expect(decodeURIComponent(new URL(once).searchParams.get('query') ?? '')).toBe('Finn l.en');
    });

    it('leaves a catalog it knows nothing about untouched', () => {
      expect(withLanguageTerm('http://192.168.1.10:8080/opds', 'l.en')).toBe('http://192.168.1.10:8080/opds');
      expect(withLanguageTerm('not a url', 'l.en')).toBe('not a url');
    });
  });
});

describe('languagesFor', () => {
  /**
   * **One language, never several.** Gutenberg reads two filter terms as an intersection: `l.en l.fr` answers with books
   * that are in *both* — bilingual editions — rather than either, which is almost never what anyone means. So the
   * setting offers a list to pick one from, and "every language" as its own answer.
   */
  it('offers the languages a catalog holds enough of', () => {
    const codes = languagesFor('https://www.gutenberg.org/ebooks/search.opds/');
    expect(codes).toContain('en');
    expect(codes).toContain('fi');
    expect(codes.length).toBeGreaterThan(10);
    // Codes only: they are named to the reader by `Intl.DisplayNames`, so this list never carries English words.
    for (const code of codes) expect(code).toMatch(/^[a-z]{2}$/);
  });

  // A catalog with no syntax for it offers nothing, which is what keeps the row out of its editor entirely.
  it('offers nothing for a catalog that cannot be asked', () => {
    expect(languagesFor('http://192.168.1.10:8080/opds')).toEqual([]);
    expect(languagesFor('not a url')).toEqual([]);
  });
});

describe('downloadEdition', () => {
  it("knows Gutenberg's edition without images by its address, and nobody else's", () => {
    expect(downloadEdition('https://www.gutenberg.org/ebooks/2701.epub.noimages')).toBe('no-images');
    expect(downloadEdition('https://www.gutenberg.org/ebooks/2701.epub3.images')).toBeNull();
    expect(downloadEdition('https://calibre.local/get/epub/42.noimages')).toBeNull();
  });
});
