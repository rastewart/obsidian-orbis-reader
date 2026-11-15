import { describe, expect, it } from 'vitest';
import { libraryNotes } from '../library/candidates';

/**
 * Enough of an `App` for a projection: a list of markdown files and a cache to ask about each.
 *
 * `walks` counts `getMarkdownFiles` calls, because "one pass" is the property under test and it is invisible in the
 * result — two walks and one walk return the same records.
 */
function vault(notes: Array<{ path: string; frontmatter: Record<string, unknown> | null }>) {
  const state = { walks: 0 };
  const app = {
    vault: {
      getMarkdownFiles: () => {
        state.walks += 1;
        return notes.map((note) => ({ path: note.path }));
      },
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => {
        const found = notes.find((note) => note.path === file.path);
        return found ? { frontmatter: found.frontmatter } : null;
      },
    },
  };
  // The projection asks for far less of `App` than its type describes.
  return { app: app as unknown as Parameters<typeof libraryNotes>[0], state };
}

const title = (t: string) => ({ orbis_note: 'title', title: t });
const record = (excerpt: string) => ({ orbis_note: 'reading_record', excerpt, kind: 'note' });

describe('libraryNotes', () => {
  it('sorts both species out of one list of notes', () => {
    const { app } = vault([
      { path: 'Titles/Sample Book.md', frontmatter: title('Sample Book') },
      { path: 'Records/a.md', frontmatter: record('a passage') },
      { path: 'Records/b.md', frontmatter: record('another') },
      { path: 'Daily/2026-08-17.md', frontmatter: { tags: ['daily'] } },
      { path: 'Notes/plain.md', frontmatter: null },
    ]);
    const notes = libraryNotes(app);
    expect(notes.titles.map((t) => t.title)).toEqual(['Sample Book']);
    expect(notes.records.map((r) => r.excerpt)).toEqual(['a passage', 'another']);
    // The candidates come back too, so a caller that counts or matches does not need a walk of its own.
    expect(notes.candidates).toHaveLength(5);
  });

  // **The property this exists for.** Filtering `vaultCandidates` twice returns the same answer and costs two
  // walks of every note in the vault — and a vault with a year of reading holds thousands of records.
  it('walks the vault once', () => {
    const { app, state } = vault([
      { path: 'Titles/Sample Book.md', frontmatter: title('Sample Book') },
      { path: 'Records/a.md', frontmatter: record('a passage') },
    ]);
    libraryNotes(app);
    expect(state.walks).toBe(1);
  });

  it('says nothing about a vault with neither species', () => {
    const { app } = vault([{ path: 'Daily/x.md', frontmatter: { tags: ['daily'] } }]);
    const notes = libraryNotes(app);
    expect(notes.titles).toEqual([]);
    expect(notes.records).toEqual([]);
  });
});
