import { afterEach, describe, expect, it } from 'vitest';
import { adoptable } from '../library/adopt';
import type { CatalogCandidate } from '../library/catalog';
import { setLibraryFields } from '../library/fields';

const note = (path: string, frontmatter: Record<string, unknown> | null): CatalogCandidate => ({
  path,
  frontmatter,
  tags: [],
});

afterEach(() => setLibraryFields([]));

describe('adoptable', () => {
  it('offers a note that has a title, another library field, and has never said what it is', () => {
    const found = adoptable([note('Books/Sample Book.md', { title: 'Sample Book', authors: ['Tester, Orbis'] })]);
    expect(found).toEqual([{ path: 'Books/Sample Book.md', title: 'Sample Book' }]);
  });

  // A `title:` line is written by templates, daily notes, meeting notes and half the plugins that touch
  // frontmatter. A list built on that alone would offer a reader their whole vault and invite Select all.
  it('will not offer a note whose only library field is its title', () => {
    expect(adoptable([note('Meetings/Standup.md', { title: 'Standup', attendees: ['Orbis'] })])).toEqual([]);
  });

  it('takes any library field as corroboration, through its aliases', () => {
    expect(adoptable([note('a.md', { title: 'A', isbn: '9780000000002' })])).toHaveLength(1);
    expect(adoptable([note('b.md', { title: 'B', files: ['[[B.epub]]'] })])).toHaveLength(1);
    setLibraryFields([{ key: 'source_url', keys: ['logos_link'] }]);
    expect(adoptable([note('c.md', { title: 'C', logos_link: 'logosres:LLS:1' })])).toHaveLength(1);
  });

  // The folder is the second way in: a stub typed into the title-notes folder is a title note nobody has filled
  // in yet, and there the location IS the claim.
  it('offers a bare title that lives where title notes live', () => {
    const bare = [note('Library/Titles/Stub.md', { title: 'Stub' }), note('Notes/Other.md', { title: 'Other' })];
    expect(adoptable(bare, 'Library/Titles').map((f) => f.path)).toEqual(['Library/Titles/Stub.md']);
    // And a folder whose name merely starts the same way is a different folder.
    expect(adoptable([note('Library/TitlesOld/x.md', { title: 'X' })], 'Library/Titles')).toEqual([]);
  });

  // Offering to stamp a note that already answered would be offering to overwrite the answer.
  it('leaves alone anything that already declares itself', () => {
    expect(adoptable([note('a.md', { orbis_note: 'title', title: 'A', isbn: '1' })])).toEqual([]);
    expect(adoptable([note('b.md', { orbis_note: 'reading_record', title: 'B', isbn: '1' })])).toEqual([]);
  });

  // A README, an index, a reading log. Adopting one puts a nameless row in the catalog.
  it('skips a note with no title, and one with no frontmatter at all', () => {
    expect(adoptable([note('Books/README.md', { tags: ['books'], authors: ['Someone'] })])).toEqual([]);
    expect(adoptable([note('plain.md', null)])).toEqual([]);
  });

  // The old heuristic, now doing the job it is good at: one export of a long novel is fifty chapter notes, and a
  // list where the real answer is buried under fifty wrong ones is a list nobody reads.
  it('skips notes that look generated from a book', () => {
    expect(adoptable([note('n/006 - PART I.md', { title: 'PART I', chapter: 6, book: '[[x.epub]]' })])).toEqual([]);
    expect(adoptable([note('n/x.md', { title: 'Sample', authors: ['S'], orbis_generated: 'book-export' })])).toEqual(
      []
    );
  });

  // A vault whose titles are written some other way has said so on the Fields page. Reading only the canonical
  // key here would leave out exactly the notes that most need adopting.
  it('finds a title through the reader’s aliases', () => {
    setLibraryFields([{ key: 'title', keys: ['book_title'] }]);
    expect(adoptable([note('x.md', { book_title: 'Sample Book', isbn: '1' })])).toEqual([
      { path: 'x.md', title: 'Sample Book' },
    ]);
  });

  it('sorts by title, then by path, so two of the same name are still told apart', () => {
    const found = adoptable([
      note('z.md', { title: 'Sample Book', isbn: '1' }),
      note('b.md', { title: 'Another Book', isbn: '2' }),
      note('a.md', { title: 'Sample Book', isbn: '3' }),
    ]);
    expect(found.map((f) => f.path)).toEqual(['b.md', 'a.md', 'z.md']);
  });
});
