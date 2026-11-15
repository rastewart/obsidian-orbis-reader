import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLibraryFields } from '../library/fields';
import {
  linkTarget,
  parseFiles,
  parseRating,
  parseReadingRecord,
  parseRecord,
  parseStatus,
  parseType,
  titleSortKey,
  toStringList,
  toText,
} from '../library/record';

// What makes a note a record: the note says so itself. Inferring it from a `title:` line would pull in any note
// carrying one — templates, daily notes, other plugins' exports.
describe('what the library counts as a title note', () => {
  it('is a record when it says so and has a title', () => {
    expect(parseRecord('Titles/x.md', { orbis_note: 'title', title: 'Sample Book' })?.title).toBe('Sample Book');
  });

  it('is not a record when it says nothing, however complete it looks', () => {
    const full = {
      title: 'Sample Book',
      authors: ['Tester, Orbis'],
      files: ['[[Sample Book.epub]]'],
      isbn: '9781234567897',
    };
    expect(parseRecord('Library/Titles/Sample Book.md', full)).toBeNull();
  });

  // Saying it cannot conjure a name for a row: the flag says which species, the title says what to call it.
  it('still needs a title, however loudly a note claims to be one', () => {
    expect(parseRecord('x.md', { orbis_note: 'title' })).toBeNull();
    expect(parseRecord('x.md', { orbis_note: 'title', title: '   ' })).toBeNull();
  });

  // Written by a script, typed by hand, or capitalized by someone's template.
  it('reads the claim as written', () => {
    expect(parseRecord('x.md', { orbis_note: ' Title ', title: 'A' })?.title).toBe('A');
    expect(parseRecord('x.md', { orbis_note: 'TITLE', title: 'A' })?.title).toBe('A');
  });

  // The whole point of one key with a value: another species is a different value, not another key, and it is
  // not a title note.
  it('is not a record when it says it is something else', () => {
    expect(parseRecord('x.md', { orbis_note: 'reading_record', title: 'A note about Sample Book' })).toBeNull();
  });

  // What Orbis generates from a book — a chapter of an exported book, an annotation note, a note set — is excluded
  // for the same reason as everything else: it never claims to be a title.
  it('is not a record: anything Orbis generated from a book', () => {
    expect(
      parseRecord('notes/Parts and Chapters Notes/006 - PART I – CHAPTER I.md', {
        title: 'PART I – CHAPTER I',
        chapter: 6,
        book: '[[fixtures/parts-and-chapters.epub]]',
      })
    ).toBeNull();
    expect(parseRecord('x.md', { title: 'Parts and Chapters', orbis_generated: 'book-export' })).toBeNull();
  });

  // And a note that says it IS one is one, whatever else it carries — there is no heuristic to override.
  it('takes the note at its word even when it looks generated', () => {
    const stamped = { orbis_note: 'title', title: 'Sample Book', book: '[[Sample Book.epub]]', chapter: 4 };
    expect(parseRecord('x.md', stamped)?.title).toBe('Sample Book');
  });
});

describe('parseRecord', () => {
  it('reads a full record', () => {
    const r = parseRecord('Library/Titles/Another-Book.md', {
      orbis_note: 'title',
      title: 'Another Book; Or, The Subtitle',
      authors: ['Doe, Jane'],
      type: 'book',
      genre: 'Sea story',
      publisher: 'Sample Press',
      publication_date: '1901-03-14',
      language: 'en',
      series: 'Sample Series',
      series_index: 2,
      subjects: ['Ferries', 'Adventure'],
      tags: ['fiction'],
      rating: 5,
      cover: '[[covers/another-book.jpg]]',
      files: ['[[epub/Another-Book.epub]]'],
      source: 'import',
      source_id: '849',
      source_url: 'https://example.com/x',
      reading_status: 'reading',
      date_read: '',
      added: '2026-05-03',
    });
    expect(r).not.toBeNull();
    expect(r?.title).toBe('Another Book; Or, The Subtitle');
    expect(r?.authors).toEqual(['Doe, Jane']);
    expect(r?.seriesIndex).toBe('2'); // a number survives as its text
    expect(r?.cover).toBe('covers/another-book.jpg');
    expect(r?.files).toEqual(['epub/Another-Book.epub']);
    expect(r?.status).toBe('reading');
    expect(r?.rating).toBe(5);
  });

  // The whole test for "is this note a record". A collection's folder holds README and index notes, and gathering
  // those would put junk on every collection.
  it('is not a record without a title', () => {
    expect(parseRecord('Library/README.md', { orbis_note: 'title', tags: ['book'] })).toBeNull();
    expect(parseRecord('Library/x.md', { orbis_note: 'title', title: '   ' })).toBeNull();
    expect(parseRecord('Library/x.md', null)).toBeNull();
    expect(parseRecord('Library/x.md', undefined)).toBeNull();
  });

  it('needs nothing but a title', () => {
    const r = parseRecord('Library/Titles/In print.md', { orbis_note: 'title', title: 'A book I own on paper' });
    expect(r?.authors).toEqual([]);
    expect(r?.files).toEqual([]);
    expect(r?.cover).toBeNull();
    expect(r?.rating).toBeNull();
    expect(r?.status).toBeNull();
  });

  // Frontmatter is hand-written and script-written, so a field that should be a list arrives as a scalar.
  it('survives frontmatter of the wrong shape', () => {
    const r = parseRecord('x.md', {
      orbis_note: 'title',
      title: 'T',
      authors: 'Solo, Author',
      tags: null,
      subjects: [null, 'Kept', 42, { nested: true }],
      files: '[[a/b.epub]]',
      rating: 'not a number',
      series_index: { oops: 1 },
    });
    expect(r?.authors).toEqual(['Solo, Author']);
    expect(r?.tags).toEqual([]);
    expect(r?.subjects).toEqual(['Kept', '42']);
    expect(r?.files).toEqual(['a/b.epub']);
    expect(r?.rating).toBeNull();
    expect(r?.seriesIndex).toBe('');
  });
});

// A vault that keeps a note per author writes `authors: ["[[people/John Roe]]"]`, and read as plain text that
// would show the brackets — and group the book under a folder path.
describe('values written as links', () => {
  it('reads a linked author as their name', () => {
    const r = parseRecord('x.md', {
      orbis_note: 'title',
      title: 'T',
      authors: ['[[people/John Roe|Johnny]]', '[[Jane Doe]]'],
    });
    expect(r?.authors).toEqual(['Johnny', 'Jane Doe']);
  });

  it('does the same for series, publisher and subjects', () => {
    const r = parseRecord('x.md', {
      orbis_note: 'title',
      title: 'T',
      series: '[[series/Sample Series]]',
      publisher: '[[Sample Press]]',
      subjects: ['[[topics/Ferries|Ferries]]'],
    });
    expect(r?.series).toBe('Sample Series');
    expect(r?.publisher).toBe('Sample Press');
    expect(r?.subjects).toEqual(['Ferries']);
  });

  // Not `linkTarget`: that answers which FILE this points at, which for a name would be a folder path.
  it('leaves plain text alone', () => {
    const r = parseRecord('x.md', { orbis_note: 'title', title: 'T', authors: ['Doe, Jane'] });
    expect(r?.authors).toEqual(['Doe, Jane']);
  });
});

describe('toStringList / toText', () => {
  it('normalizes one-or-many', () => {
    expect(toStringList('a')).toEqual(['a']);
    expect(toStringList(['a', ' b '])).toEqual(['a', 'b']);
    expect(toStringList([])).toEqual([]);
    expect(toStringList(undefined)).toEqual([]);
    expect(toStringList(['', '  '])).toEqual([]);
  });

  it('keeps numbers as text and rejects other types', () => {
    expect(toText(2)).toBe('2');
    expect(toText(0)).toBe('0');
    expect(toText(' x ')).toBe('x');
    expect(toText(true)).toBe('');
    expect(toText(null)).toBe('');
  });
});

describe('linkTarget', () => {
  it('unwraps wikilinks, aliases and embeds', () => {
    expect(linkTarget('[[covers/x.jpg]]')).toBe('covers/x.jpg');
    expect(linkTarget('![[covers/x.jpg]]')).toBe('covers/x.jpg');
    expect(linkTarget('[[a/b.epub|Some label]]')).toBe('a/b.epub');
  });

  // A filename can contain brackets, and stopping at the first `]` would make the whole pattern fail — returning the
  // raw `[[...]]` text, which resolves to nothing. Obsidian cannot follow such a link either.
  it('keeps brackets that are part of a filename', () => {
    expect(linkTarget('[[epub/Third Book [168 Tales].epub]]')).toBe('epub/Third Book [168 Tales].epub');
    expect(linkTarget('[[epub/Book [1].epub|Label]]')).toBe('epub/Book [1].epub');
  });

  // These fields point at FILES, and a heading inside an EPUB is not something you can link to — so a hash is
  // far more likely part of a filename than a heading reference. Stripping it would make such a book look
  // uncataloged; `resolveRecordFile` settles the ambiguity against the vault instead.
  it('keeps a # that is part of a filename', () => {
    expect(linkTarget('[[epub/Sample Series Book #3.epub]]')).toBe('epub/Sample Series Book #3.epub');
    expect(linkTarget('[[epub/Book #3.epub|Label]]')).toBe('epub/Book #3.epub');
  });

  it('unwraps markdown links, decoding the path', () => {
    expect(linkTarget('[label](epub/My%20Book.epub)')).toBe('epub/My Book.epub');
  });

  // A generator may write a plain path; refusing it would drop the only link on the record.
  it('passes a bare path through', () => {
    expect(linkTarget('epub/Another-Book.epub')).toBe('epub/Another-Book.epub');
  });
});

describe('parseStatus', () => {
  it('reads bare tokens', () => {
    expect(parseStatus('reading')).toBe('reading');
    expect(parseStatus('READ')).toBe('read');
    expect(parseStatus('abandoned')).toBe('abandoned');
  });

  /**
   * **A status the reader declared on the Fields page is a status.** Grouping and filtering accept any value — they
   * read the frontmatter — so refusing everything but the four would leave a value someone added with a group, a
   * name and an order, and no tick in the menu that sets it.
   */
  it('reads a status the reader declared', () => {
    setLibraryFields([{ key: 'reading_status', values: [{ value: 'Archived' }, { value: 'Lending' }] }]);
    expect(parseStatus('Archived')).toBe('Archived');
    // Folded for case, like every other value comparison in the library — and answered as the reader spelled it.
    expect(parseStatus('archived')).toBe('Archived');
    expect(parseStatus('borrowed')).toBeNull();
    setLibraryFields([]);
  });

  // A value switched off on the Fields page is not offered and does not parse: the note keeps what it says, the
  // menu shows no tick, and setting a new status is what puts it right.
  it('does not read a status the reader switched off', () => {
    setLibraryFields([{ key: 'reading_status', values: [{ value: 'Archived' }], disabled: ['Archived'] }]);
    expect(parseStatus('Archived')).toBeNull();
    setLibraryFields([]);
  });

  // The four keep working whatever the field table says, because code branches on them: finishing a book stamps
  // `date_read`, and nothing else does.
  it('always reads the four Orbis ships', () => {
    setLibraryFields([{ key: 'reading_status', values: [{ value: 'Archived' }] }]);
    expect(parseStatus('read')).toBe('read');
    expect(parseStatus('interested')).toBe('interested');
    setLibraryFields([]);
  });

  // Numbered values are a real convention: a Base orders groups by the value grouped on, so numbering them was
  // the way to get reading order out of a table. Orbis reads through the prefix rather than calling it invalid.
  it('reads through a sort prefix', () => {
    expect(parseStatus('01-reading')).toBe('reading');
    expect(parseStatus('02-interested')).toBe('interested');
    expect(parseStatus('03-read')).toBe('read');
    expect(parseStatus('1 - reading')).toBe('reading');
    expect(parseStatus('10_abandoned')).toBe('abandoned');
  });

  // `unread` is a status with no writer — nothing puts it in a note, and the books nobody has flagged are the ones
  // with no status at all. A note that says it anyway is saying nothing.
  it('reads unread as no status', () => {
    expect(parseStatus('unread')).toBeNull();
    expect(parseStatus('01-unread')).toBeNull();
  });

  it('is null for empty and unknown values', () => {
    expect(parseStatus('')).toBeNull();
    expect(parseStatus(undefined)).toBeNull();
    expect(parseStatus('finished')).toBeNull(); // not in the vocabulary
    expect(parseStatus('01-')).toBeNull();
  });
});

describe('parseRating', () => {
  it('accepts 0–5, quoted or not', () => {
    expect(parseRating(4)).toBe(4);
    expect(parseRating('4')).toBe(4);
    expect(parseRating('2.5')).toBe(2.5);
  });

  // **Zero is a rating.** "I really did not like it" is the strongest thing a reader says about a book, and reading
  // it as "unrated" throws that away — so it parses, and everything downstream tests `=== null` rather than
  // truthiness, since 0 is falsy.
  it('reads zero as a rating rather than as nothing', () => {
    expect(parseRating(0)).toBe(0);
    expect(parseRating('0')).toBe(0);
  });

  // Halves, because five buckets cannot separate the books you liked from the ones you loved.
  it('reads half steps, and rounds to the nearest one', () => {
    expect(parseRating(3.5)).toBe(3.5);
    expect(parseRating(3.7)).toBe(3.5);
    expect(parseRating(4.9)).toBe(5);
    expect(parseRating(0.2)).toBe(0);
  });

  // Out of range is a mistake, not an opinion — clamping 8 to 5 invents a rating nobody gave. It also means a
  // Calibre-style 0–10 scale reads as nothing rather than as wrong: `7` is not seven stars, and guessing it means
  // 3.5 is a guess this plugin does not make.
  it('is null outside the range or unparseable', () => {
    expect(parseRating(8)).toBeNull();
    expect(parseRating(7)).toBeNull();
    expect(parseRating(-1)).toBeNull();
    expect(parseRating('')).toBeNull();
    expect(parseRating('good')).toBeNull();
    expect(parseRating(undefined)).toBeNull();
  });
});

// `kind` and `type` would be synonyms, and nobody could say which answered what. One field for the medium, one for
// the genre, and both are free text the reader owns.
describe('genre', () => {
  it('is read as written, with nothing decided about it', () => {
    expect(parseRecord('x.md', { orbis_note: 'title', title: 'T', genre: 'Biography' })?.genre).toBe('Biography');
    expect(parseRecord('x.md', { orbis_note: 'title', title: 'T' })?.genre).toBe('');
  });
});

describe('parseType', () => {
  it('reads the canonical field', () => {
    expect(parseType({ type: 'Book' })).toBe('Book');
    expect(parseType({})).toBe('');
  });

  // A generator emitting both uses `type` for a machine taxonomy id, so a reader who maps them puts the label
  // first. Nothing is read from `type_label` until they say so.
  it('reads only the canonical key until the reader maps another', () => {
    expect(parseType({ type: 'text.monograph.biography', type_label: 'Biography' })).toBe('text.monograph.biography');
  });

  it('falls back to type when the label is empty', () => {
    expect(parseType({ type: 'Book', type_label: '' })).toBe('Book');
    expect(parseType({ type: 'Book', type_label: '   ' })).toBe('Book');
  });

  it('reaches parseRecord', () => {
    const r = parseRecord('x.md', { orbis_note: 'title', title: 'T', type: 'Monograph' });
    expect(r?.type).toBe('Monograph');
  });
});

describe('parseFiles', () => {
  it('reads the canonical list', () => {
    expect(parseFiles({ files: ['[[a/b.epub]]', '[[a/b.azw3]]'] })).toEqual(['a/b.epub', 'a/b.azw3']);
    expect(parseFiles({})).toEqual([]);
  });

  // An exporter's single-file key reads only once the reader has mapped it — see the alias block below.
  it('reads nothing from a key nobody has mapped', () => {
    expect(parseFiles({ epub_link: '[[epub/Sample Book.epub]]' })).toEqual([]);
  });
});

// Every alias is a decision about which of two keys a generator wrote is the one to believe, so each is pinned
// with the shape that actually turns up rather than a synthetic one.
// Aliases do not ship: which key means which field is the reader's statement about their vault, made on the
// Fields page. These are the mappings a Logos or Calibre export needs, installed the way a reader would.
describe('field aliases the reader has configured', () => {
  beforeEach(() => {
    // Aliases only: the field's own key is read first without being listed, which is what the Fields dialog says.
    setLibraryFields([
      { key: 'type', keys: ['type_label'] },
      { key: 'subjects', keys: ['subject_groups'] },
      { key: 'files', keys: ['epub_link'] },
      { key: 'tags', keys: ['user_tags'] },
      { key: 'rating', keys: ['user_rating'] },
      { key: 'language', keys: ['languages'] },
      { key: 'source_url', keys: ['logos_link'] },
      { key: 'source_id', keys: ['calibre_id', 'resource_id'] },
      { key: 'added', keys: ['added_to_calibre', 'added_to_logos', 'import_date'] },
    ]);
  });
  afterEach(() => setLibraryFields([]));

  it("reads a record written entirely in an exporter's dialect", () => {
    const r = parseRecord('Library/Titles/x.md', {
      orbis_note: 'title',
      title: 'Fourth Book',
      // `type_label` and no `type`: a catalog writes one spelling or the other, which is why the field's own key
      // can simply come first.
      type_label: 'Biography',
      subject_groups: ['Ferries', 'Ferries--History'],
      languages: ['en'],
      user_tags: ['owned'],
      user_rating: 4,
      community_rating: 3.6,
      logos_link: 'logosres:LLS:1.2.3',
      resource_id: 'LLS:1.2.3',
      added_to_logos: '2025-11-19',
    });
    expect(r?.type).toBe('Biography');
    expect(r?.subjects).toEqual(['Ferries', 'Ferries--History']);
    expect(r?.language).toBe('en');
    expect(r?.tags).toEqual(['owned']);
    expect(r?.sourceUrl).toBe('logosres:LLS:1.2.3');
    expect(r?.sourceId).toBe('LLS:1.2.3');
    expect(r?.added).toBe('2025-11-19');
  });

  // Without a mapping a generated record has no file at all: no Read, no Listen, and never in Continue.
  it('finds a file through the single-file key an exporter writes', () => {
    expect(
      parseRecord('x.md', { orbis_note: 'title', title: 'T', epub_link: '[[epub/Sample Book.epub]]' })?.files
    ).toEqual(['epub/Sample Book.epub']);
  });

  it('prefers the canonical key when a record states both, rather than listing the same book twice', () => {
    const r = parseRecord('x.md', {
      orbis_note: 'title',
      title: 'T',
      files: ['[[a/b.epub]]'],
      epub_link: '[[a/b.epub]]',
    });
    expect(r?.files).toEqual(['a/b.epub']);
  });

  // The crowd's average is a different fact from your opinion, and showing it as yours is a lie the interface
  // cannot walk back.
  it("takes the reader's rating and never the community's", () => {
    expect(parseRecord('x.md', { orbis_note: 'title', title: 'T', user_rating: 4, community_rating: 2 })?.rating).toBe(
      4
    );
    expect(parseRecord('x.md', { orbis_note: 'title', title: 'T', community_rating: 2 })?.rating).toBeNull();
  });

  // Written by the EPUB converter, read as targets: a caller that wants to open the note it came from needs the
  // path rather than the brackets around it.
  it('reads the notes a converted book was made from, as link targets', () => {
    const r = parseRecord('x.md', {
      orbis_note: 'title',
      title: 'T',
      source_notes: ['[[notes/Chapter one]]', '[[notes/Chapter two|Two]]'],
    });
    expect(r?.sourceNotes).toEqual(['notes/Chapter one', 'notes/Chapter two']);
    expect(parseRecord('x.md', { orbis_note: 'title', title: 'T' })?.sourceNotes).toEqual([]);
  });

  it('collapses per-tool ids and dates onto one field', () => {
    expect(parseRecord('x.md', { orbis_note: 'title', title: 'T', calibre_id: 849 })?.sourceId).toBe('849');
    expect(parseRecord('x.md', { orbis_note: 'title', title: 'T', import_date: '2026-05-03' })?.added).toBe(
      '2026-05-03'
    );
    // Canonical wins when both are present, so a converted vault does not read the stale copy.
    expect(
      parseRecord('x.md', { orbis_note: 'title', title: 'T', source_id: 'new', calibre_id: 'old' })?.sourceId
    ).toBe('new');
  });

  it('ignores an empty aliased value and moves on to the next key', () => {
    const r = parseRecord('x.md', {
      orbis_note: 'title',
      title: 'T',
      tags: [],
      user_tags: ['kept'],
      rating: '',
      user_rating: 5,
    });
    expect(r?.tags).toEqual(['kept']);
    expect(r?.rating).toBe(5);
  });
});

describe('titleSortKey', () => {
  it('ignores a leading article so titles file under the word people remember', () => {
    expect(titleSortKey('The Sample')).toBe('sample');
    expect(titleSortKey('A Sample Book')).toBe('sample book');
    expect(titleSortKey('An Essay')).toBe('essay');
  });

  it('does not eat a word that merely starts with one', () => {
    expect(titleSortKey('Theology')).toBe('theology');
    expect(titleSortKey('Another Book')).toBe('another book');
  });
});

// The second species. A title note describes a work; a record describes a passage of one — so it carries where in
// the book it is, and the species key is the whole test for whether it is ours.
describe('parseReadingRecord', () => {
  const record = {
    orbis_note: 'reading_record',
    kind: 'passage selection',
    excerpt: 'The ferry will not wait for anyone',
    mark: 'Key idea',
    mark_badge: '🔑',
    book: '[[Books/Fifth Book.epub]]',
    book_title: 'Fifth Book',
    author: 'Doe, Jane',
    chapter: 'Chapter 1',
    chapter_index: 1,
    loc: '42',
    orbis_cfi: 'epubcfi(/6/4!/4/2/2)',
    created: '2026-08-17',
    note_text: 'the whole book in one line',
    cover: '[[Library/Titles/covers/fifth-book.jpg]]',
    orphaned: false,
    tags: ['orbis/reading-record'],
  };

  it('reads what the exporter wrote', () => {
    const parsed = parseReadingRecord('Reading records/x.md', record);
    expect(parsed).toMatchObject({
      notePath: 'Reading records/x.md',
      kind: 'passage selection',
      excerpt: 'The ferry will not wait for anyone',
      mark: 'Key idea',
      markBadge: '🔑',
      bookTitle: 'Fifth Book',
      author: 'Doe, Jane',
      chapter: 'Chapter 1',
      chapterIndex: 1,
      loc: '42',
      // What lets a row open the book at this passage, which is the thing no table can do.
      cfi: 'epubcfi(/6/4!/4/2/2)',
      created: '2026-08-17',
      noteText: 'the whole book in one line',
      orphaned: false,
    });
  });

  // A link, resolved to what it points at — the same treatment a title note's cover gets.
  it('reads the cover as a target rather than as link text', () => {
    expect(parseReadingRecord('r.md', record)?.cover).toBe('Library/Titles/covers/fifth-book.jpg');
    expect(parseReadingRecord('r.md', { ...record, cover: undefined })?.cover).toBeNull();
  });

  // **The species key is the whole test.** A note about a passage that someone wrote by hand is theirs, and a
  // guess based on `orbis_cfi` would take it.
  it('refuses a note that does not say what it is', () => {
    expect(parseReadingRecord('r.md', { ...record, orbis_note: undefined })).toBeNull();
    expect(parseReadingRecord('r.md', { ...record, orbis_note: 'title' })).toBeNull();
    expect(parseReadingRecord('r.md', { excerpt: 'x', orbis_cfi: 'epubcfi(/6/4)' })).toBeNull();
    expect(parseReadingRecord('r.md', null)).toBeNull();
  });

  // One key holds one value, so a note is one species or the other and never both.
  it('is not a title note, and a title note is not one of these', () => {
    expect(parseRecord('r.md', record)).toBeNull();
    expect(parseReadingRecord('t.md', { orbis_note: 'title', title: 'Sixth Book' })).toBeNull();
  });

  // Written on every record, so an absent flag is a record from before the flag rather than an un-orphaned one.
  it('reads orphaned as a flag that is only true when it says so', () => {
    expect(parseReadingRecord('r.md', { ...record, orphaned: true })?.orphaned).toBe(true);
    expect(parseReadingRecord('r.md', { ...record, orphaned: undefined })?.orphaned).toBe(false);
  });

  // A chapter with no number is different from chapter zero.
  it('keeps a missing chapter number null', () => {
    expect(parseReadingRecord('r.md', { ...record, chapter_index: undefined })?.chapterIndex).toBeNull();
    expect(parseReadingRecord('r.md', { ...record, chapter_index: 0 })?.chapterIndex).toBe(0);
  });

  // The reader's own field on a record is readable without this interface knowing about it.
  it('carries the raw frontmatter for fields it does not name', () => {
    const parsed = parseReadingRecord('r.md', { ...record, my_theme: 'endurance' });
    expect(parsed?.raw.my_theme).toBe('endurance');
  });
});
