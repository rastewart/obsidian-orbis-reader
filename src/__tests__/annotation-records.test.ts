import { describe, expect, it } from 'vitest';
import type { Highlight, Note } from '../progress';
import {
  bookmarkRecord,
  derivedBody,
  highlightRecord,
  mergeRecordBody,
  newRecordBody,
  noteRecord,
  RECORD_MARKER,
  RECORD_PROPERTY_KEYS,
  RECORD_TAG,
  type RecordBookContext,
  readerWroteInRecord,
  recordFileName,
  recordKeepReason,
} from '../reader/annotation-records';

const book: RecordBookContext = {
  filePath: 'fixtures/First-Open.epub',
  title: 'First Open',
  author: 'Orbis Tester',
  chapterIndex: new Map([
    ['front.xhtml', 1],
    ['ch1.xhtml', 2],
    ['ch5.xhtml', 6],
    ['ch9.xhtml', 10],
  ]),
  marks: [
    {
      id: 'mk_1',
      name: 'Follow up',
      highlightColor: '#FFEB3B',
      treatment: 'underline',
      treatmentColor: '#000000',
      enabled: true,
    },
  ],
};

const hl = (over: Partial<Highlight> = {}): Highlight => ({
  id: 'h_8f2c4a',
  cfiRange: 'epubcfi(/6/4!/4/630)',
  text: 'Wren passed the long hours of the night in her brother\u2019s room',
  color: '#FFEB3B',
  markId: 'mk_1',
  createdAt: Date.UTC(2026, 7, 3),
  chapter: 'CHAPTER IX.',
  loc: 51,
  ...over,
});

describe('record properties', () => {
  it('carries the mark as a name and a badge', () => {
    const p = highlightRecord(hl(), book);
    expect(p.kind).toBe('passage selection');
    expect(p.mark).toBe('Follow up');
    expect(p.mark_badge).toBe('\u{1F7E1}\u2796');
  });

  it('leaves `mark` EMPTY when there is none, which is the group Bases shows for it', () => {
    // The whole reason grouping belongs in a database view: a document would need an invented "Unmarked"
    // heading, and a ruling on whether bookmarks belong under it.
    expect(highlightRecord(hl({ markId: undefined }), book).mark).toBe('');
    expect(bookmarkRecord({ id: 'b1', cfi: 'c', label: 'x', createdAt: 1 }, book).mark).toBe('');
  });

  it('still names a colour when the mark no longer resolves', () => {
    // A deleted mark, or a book shared from another vault: the annotation knows its own color.
    expect(highlightRecord(hl({ markId: 'mk_gone' }), book).mark_badge).toBe('\u{1F7E1}');
  });

  it('gives the book as a link and as plain text', () => {
    // Bases groups on a property, and grouping by a link would show link markup as the group name.
    const p = highlightRecord(hl(), book);
    expect(p.book).toBe('[[fixtures/First-Open.epub]]');
    expect(p.book_title).toBe('First Open');
  });

  it('dates in ISO and keeps loc a number so it sorts numerically', () => {
    const p = highlightRecord(hl(), book);
    expect(p.created).toBe('2026-08-03');
    expect(p.loc).toBe(51);
    expect(highlightRecord(hl({ loc: undefined }), book).loc).toBeNull();
  });

  it('mirrors a note\u2019s own text into a property, and nothing else\u2019s', () => {
    // Bases cannot read a note\u2019s body, so a table column needs the property. A highlight has no second
    // text to mirror.
    const n: Note = { id: 'n1', cfiRange: 'c', text: 'my thought', selectedText: 'the passage', createdAt: 1 };
    expect(noteRecord(n, book).note_text).toBe('my thought');
    expect(highlightRecord(hl(), book).note_text).toBeUndefined();
  });
});

describe('the excerpt property', () => {
  it('keeps the punctuation a filename cannot', () => {
    // The base cannot read this from `file.name`: sanitizing strips `?` and quotes,
    // and punctuation removed from the middle of a sentence reads as broken English in a table column.
    const text = '"Would you not like to hear who has bought it?" asked her brother quietly.';
    expect(highlightRecord(hl({ text }), book).excerpt).toBe(text);
    expect(recordFileName('passage selection', text, 'h_1')).not.toContain('?');
  });

  it('flattens newlines and caps the length, with an ellipsis when it cuts', () => {
    const long = highlightRecord(hl({ text: `${'x'.repeat(400)}\n\nmore` }), book).excerpt;
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBeLessThanOrEqual(201);
  });

  it('is a note\u2019s passage when it has one, and its own words when it does not', () => {
    const withSel: Note = { id: 'n1', cfiRange: 'c', text: 'my thought', selectedText: 'the passage', createdAt: 1 };
    const standalone: Note = { id: 'n2', cfiRange: 'c', text: 'my thought', createdAt: 1 };
    expect(noteRecord(withSel, book).excerpt).toBe('the passage');
    expect(noteRecord(standalone, book).excerpt).toBe('my thought');
  });

  // An empty excerpt made Obsidian's list view drop a bookmark's entry, leaving its group heading over nothing.
  it('is the words a bookmark marks', () => {
    const b = { id: 'b1', cfi: 'c', label: 'FAIR WEATHER · loc. 69', createdAt: 1, text: '  The tide\nturned early. ' };
    expect(bookmarkRecord(b, book).excerpt).toBe('The tide turned early.');
  });

  it("is a bookmark's label when it was made before its words were kept", () => {
    const b = { id: 'b1', cfi: 'c', label: 'FAIR WEATHER · loc. 69', createdAt: 1 };
    expect(bookmarkRecord(b, book).excerpt).toBe('FAIR WEATHER · loc. 69');
  });
});

describe('chapter_index', () => {
  it('is the chapter\u2019s position in the table of contents', () => {
    expect(highlightRecord(hl({ chapterHref: 'ch9.xhtml' }), book).chapter_index).toBe(10);
  });

  it('exists because a chapter title cannot sort itself', () => {
    // Roman numerals are alphabetically hostile: "CHAPTER IX." sorts BEFORE "CHAPTER V.", because I < V.
    // (IX before I. happens to come out right, which is what makes this easy to miss.) And a book that
    // titles its chapters — "A Ferry at Dawn" — leaves no ordering to recover at all.
    const five = highlightRecord(hl({ chapter: 'CHAPTER V.', chapterHref: 'ch5.xhtml' }), book);
    const nine = highlightRecord(hl({ chapter: 'CHAPTER IX.', chapterHref: 'ch9.xhtml' }), book);
    expect(nine.chapter < five.chapter).toBe(true); // the text sorts the ninth chapter before the fifth
    expect((nine.chapter_index ?? 0) > (five.chapter_index ?? 0)).toBe(true); // the index does not
  });

  it('is null when the annotation names no chapter, or one outside the contents', () => {
    expect(highlightRecord(hl({ chapterHref: undefined }), book).chapter_index).toBeNull();
    expect(highlightRecord(hl({ chapterHref: 'nowhere.xhtml' }), book).chapter_index).toBeNull();
  });
});

describe('cfi_sort', () => {
  it('orders two annotations in one chapter, which loc cannot', () => {
    const first = highlightRecord(hl({ cfiRange: 'epubcfi(/6/4!/4/2/1:0)', loc: 4 }), book);
    const later = highlightRecord(hl({ cfiRange: 'epubcfi(/6/4!/4/48/1:0)', loc: 4 }), book);
    expect(first.loc).toBe(later.loc); // a tie that would send rows to file.name and alphabetize them
    expect(first.cfi_sort.localeCompare(later.cfi_sort)).toBeLessThan(0);
  });

  it('places a bookmark by its exact CFI when it has one', () => {
    const exact = bookmarkRecord(
      { id: 'b1', cfi: 'epubcfi(/6/4!/4/2/1:0)', exactCfi: 'epubcfi(/6/4!/4/48/1:0)', label: 'x', createdAt: 1 },
      book
    );
    expect(exact.orbis_cfi).toBe('epubcfi(/6/4!/4/48/1:0)');
    expect(exact.cfi_sort).toBe(highlightRecord(hl({ cfiRange: 'epubcfi(/6/4!/4/48/1:0)' }), book).cfi_sort);
  });
});

describe('the two link shapes', () => {
  it('gives markdown for a table cell and a bare URL for a formula', () => {
    const p = highlightRecord(hl(), book);
    expect(p.link).toBe(`[loc. 51](${p.link_url})`);
    expect(p.link_url).toMatch(/^obsidian:\/\/orbis-nav\?file=/);
    // Both shapes exist because markdown renders in a Bases TABLE cell and nowhere else; a list or cards view
    // needs an html() formula, which must build an href.
    expect(p.link_url).not.toContain('[');
  });

  it('falls back to a generic label when there is no location to name', () => {
    expect(highlightRecord(hl({ loc: undefined }), book).link).toContain('[View in book]');
  });

  it('points a bookmark at its exact CFI, the same one it sorts by', () => {
    const b = bookmarkRecord(
      { id: 'b1', cfi: 'epubcfi(/6/4!/4/2/1:0)', exactCfi: 'epubcfi(/6/4!/4/48/1:0)', label: 'x', createdAt: 1 },
      book
    );
    expect(b.link_url).toContain(encodeURIComponent('epubcfi(/6/4!/4/48/1:0)'));
  });
});

describe('recordFileName', () => {
  it('leads with the kind, so the file explorer groups them', () => {
    expect(recordFileName('passage selection', 'Wren passed the long hours of the night', 'h_8f2c4a')).toBe(
      'passage selection \u2014 Wren passed the long hours of the night \u2014 8f2c4a'
    );
  });

  it('strips characters a path cannot hold', () => {
    expect(recordFileName('note', 'He said: "why?" / then left', 'n_1')).not.toMatch(/[:"/]/);
  });

  it('caps the excerpt, because a passage can be 300 characters and a path cannot', () => {
    const name = recordFileName('passage selection', 'x'.repeat(300), 'h_abcdef');
    expect(name.length).toBeLessThan(90);
  });

  it('always ends in something unique, even for an id with no usable characters', () => {
    expect(recordFileName('passage selection', 'a', '---')).toContain('record');
  });
});

describe('the derived/user boundary', () => {
  const props = noteRecord(
    { id: 'n1', cfiRange: 'c', text: 'my thought', selectedText: 'the passage', createdAt: 1 },
    book
  );

  it('ends with a link back to the book, so a record is not a dead end', () => {
    // A Bases list or cards view cannot render a link, so clicking there lands on the record — which needs a
    // way onward to the passage.
    const p = highlightRecord(hl(), book);
    expect(derivedBody(p, 'the passage').trimEnd().endsWith(p.link)).toBe(true);
  });

  it('puts the passage above the note text, and the link below both', () => {
    expect(derivedBody(props, 'the passage')).toBe(`> "the passage"\n\nmy thought\n\n${props.link}\n`);
  });

  it('keeps everything the reader wrote below the marker', () => {
    const existing = newRecordBody(derivedBody(props, 'the passage')) + '\nMy own commentary.\n';
    const next = mergeRecordBody(existing, derivedBody(props, 'a corrected passage'));
    expect(next).toContain('a corrected passage');
    expect(next).toContain('My own commentary.');
    expect(next).not.toContain('"the passage"');
  });

  it('writes nothing at all when the marker is gone', () => {
    // Deleting it has to be an opt-out of updates, never a way to lose work: without it there is no way to
    // know where the reader\u2019s writing starts.
    expect(mergeRecordBody('Just my own words, no marker.\n', 'anything')).toBeNull();
  });

  it('writes nothing when the derived region already matches', () => {
    // Otherwise every run touches every file, for sync traffic and no change.
    const body = newRecordBody(derivedBody(props, 'the passage'));
    expect(mergeRecordBody(body, derivedBody(props, 'the passage'))).toBeNull();
  });

  it('leaves the marker in place so the next write can find it', () => {
    const body = newRecordBody(derivedBody(props, 'a'));
    expect(mergeRecordBody(body, derivedBody(props, 'b'))).toContain(RECORD_MARKER);
  });

  // What `vault.read` hands this function is the WHOLE FILE, frontmatter included — never the naked body every
  // other test in this block passes it. Splicing from the marker without accounting for that region deletes the
  // properties of any record whose derived half changed, which is every record whose mark someone edited. The file
  // then looks untagged, so it falls out of every base.
  it('keeps the frontmatter above the derived region', () => {
    const file = `---\nkind: highlight\nmark: Green\ntags:\n  - orbis-reading-record\n---\n${newRecordBody(
      derivedBody(props, 'the passage')
    )}\nMy own commentary.\n`;
    const next = mergeRecordBody(file, derivedBody(props, 'a corrected passage'));
    expect(next).toContain('orbis-reading-record');
    expect(next?.startsWith('---\nkind: highlight')).toBe(true);
    expect(next).toContain('a corrected passage');
    expect(next).toContain('My own commentary.');
    expect(next).not.toContain('"the passage"');
  });

  it('finds the marker below the frontmatter, not inside it', () => {
    // A property whose value happens to hold the marker text would otherwise be the split point, and everything
    // after it in the frontmatter — including `tags` — would be replaced by the derived region.
    const file = `---\nexcerpt: ${RECORD_MARKER}\ntags:\n  - orbis-reading-record\n---\n${newRecordBody(
      derivedBody(props, 'x')
    )}`;
    const next = mergeRecordBody(file, derivedBody(props, 'y'));
    expect(next?.startsWith(`---\nexcerpt: ${RECORD_MARKER}\ntags:\n  - orbis-reading-record\n---\n`)).toBe(true);
    expect(next).toContain('> "y"');
  });

  it('writes nothing when the whole file already matches', () => {
    const file = `---\nkind: highlight\n---\n${newRecordBody(derivedBody(props, 'the passage'))}`;
    expect(mergeRecordBody(file, derivedBody(props, 'the passage'))).toBeNull();
  });
});

describe('live export', () => {
  it('produces byte-identical properties for an unchanged annotation', () => {
    // The live path re-runs a full pass on every settle, and skips a file whose frontmatter already matches. That
    // only works because the same annotation always shapes to the same properties — a timestamp or an id
    // generated at write time would make every pass look like a change and rewrite every record.
    const a = highlightRecord(hl(), book);
    const b = highlightRecord(hl(), book);
    expect(a).toEqual(b);
  });

  it('changes the properties when the passage, mark or position changes', () => {
    const base = highlightRecord(hl(), book);
    expect(highlightRecord(hl({ text: 'different' }), book).excerpt).not.toBe(base.excerpt);
    expect(highlightRecord(hl({ markId: undefined }), book).mark).not.toBe(base.mark);
    expect(highlightRecord(hl({ cfiRange: 'epubcfi(/6/4!/4/2/1:0)' }), book).cfi_sort).not.toBe(base.cfi_sort);
  });
});

describe('readerWroteInRecord', () => {
  const props = highlightRecord(hl(), book);
  const fresh = newRecordBody(derivedBody(props, 'the passage'));

  it('is false for an untouched record, which the cleanup action may remove', () => {
    expect(readerWroteInRecord(fresh)).toBe(false);
  });

  it('is true once the reader has written below the marker', () => {
    expect(readerWroteInRecord(`${fresh}\nMy own commentary.\n`)).toBe(true);
  });

  it('ignores whitespace, so a stray blank line is not "writing"', () => {
    expect(readerWroteInRecord(`${fresh}\n\n   \n`)).toBe(false);
  });

  it('is TRUE when the marker is gone — the safe direction', () => {
    // Same reasoning as mergeRecordBody: without the marker there is no way to know where their writing starts,
    // so the whole file has to be assumed to hold some. Erring the other way deletes prose.
    expect(readerWroteInRecord('Just my own words, no marker.\n')).toBe(true);
  });
});

describe('RECORD_PROPERTY_KEYS', () => {
  // It decides whether a file is DELETED: a key missing from this list makes every record look reader-edited,
  // and a key listed here that we never write would let a hand-added property go unnoticed. Types cannot check
  // either direction, because the list is what exists at runtime and `RecordProperties` is not.
  it('is exactly the keys the three record builders produce', () => {
    const note: Note = { id: 'n1', cfiRange: 'c', text: 'my thought', selectedText: 'the passage', createdAt: 1 };
    const withCover: RecordBookContext = { ...book, coverPath: 'Reading records/cover.jpg' };
    const produced = new Set<string>();
    for (const props of [
      highlightRecord(hl(), withCover),
      noteRecord(note, withCover),
      bookmarkRecord({ id: 'b1', cfi: 'c', label: 'x', createdAt: 1 }, withCover),
    ]) {
      for (const key of Object.keys(props)) produced.add(key);
    }
    expect([...produced].sort()).toEqual([...RECORD_PROPERTY_KEYS].sort());
  });
});

describe('recordKeepReason', () => {
  const props = highlightRecord(hl(), book);
  const fresh = newRecordBody(derivedBody(props, 'the passage'));
  const path = 'Reading records/content/book/passage selection — x — abc123.md';
  const ours: Record<string, unknown> = { ...props };
  const keep = (over: Partial<Parameters<typeof recordKeepReason>[0]> = {}) =>
    recordKeepReason({ body: fresh, frontmatter: ours, resolvedLinks: {}, path, ...over });

  it('is null for a record nobody has touched, which is the one case that may be deleted', () => {
    expect(keep()).toBeNull();
  });

  it('keeps a record the reader wrote in', () => {
    expect(keep({ body: `${fresh}\nMy own commentary.\n` })).toBe('wrote');
  });

  it('keeps a record carrying a property we never write', () => {
    // Someone who put `status:` on a record is using it as a note of their own, even with nothing below the marker.
    expect(keep({ frontmatter: { ...ours, status: 'follow up' } })).toBe('properties');
  });

  it('does not mistake our own properties for the reader’s', () => {
    // The whole list has to be recognized, or every record looks edited and nothing is ever removable.
    expect(keep({ frontmatter: ours })).toBeNull();
  });

  it('keeps a record another note links to, so no broken link is left behind', () => {
    expect(keep({ resolvedLinks: { 'Projects/Reading.md': { [path]: 1 } } })).toBe('linked');
  });

  it('does not count the record’s own outgoing links', () => {
    // A record links to its book and its cover. Its own entry in the map is about what IT points at.
    expect(keep({ resolvedLinks: { [path]: { 'fixtures/First-Open.epub': 1 } } })).toBeNull();
  });

  it('does not treat a note’s own text as the reader writing in the file', () => {
    // `note_text` mirrors the annotation, and the annotation is what was just deleted — keeping a copy of prose
    // they deleted in the reader is clutter. Writing in the note FILE is a different fact.
    const noteProps = noteRecord({ id: 'n1', cfiRange: 'c', text: 'my thought', createdAt: 1 }, book);
    const body = newRecordBody(derivedBody(noteProps, undefined));
    expect(recordKeepReason({ body, frontmatter: { ...noteProps }, resolvedLinks: {}, path })).toBeNull();
  });
});

describe('the orphaned flag', () => {
  it('is written on every record, so a `!= true` filter is definite', () => {
    // Absent on the normal ones, whether they passed the filter would depend on how Bases treats a missing value
    // in a comparison — and getting that wrong empties every view.
    expect(highlightRecord(hl(), book).orphaned).toBe(false);
    expect(noteRecord({ id: 'n1', cfiRange: 'c', text: 't', createdAt: 1 }, book).orphaned).toBe(false);
    expect(bookmarkRecord({ id: 'b1', cfi: 'c', label: 'x', createdAt: 1 }, book).orphaned).toBe(false);
  });
});

describe('RECORD_TAG', () => {
  it('is namespaced, because both bases filter on it', () => {
    // It is a query key, not decoration: a bare `reading-record` would pull in any note where the reader had
    // used that tag themselves, and every generated view would quietly include things that are not records.
    expect(RECORD_TAG.startsWith('orbis-')).toBe(true);
  });

  it('is the only tag a record carries', () => {
    // One, not a taxonomy: per-mark tags would explode and duplicate the `mark` property, which Bases groups by.
    expect(highlightRecord(hl(), book).tags).toEqual([RECORD_TAG]);
  });
});
