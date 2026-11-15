// Renaming a book points its title note at the new file — `files` and the embed in Orbis's own region — whatever the
// reader told Obsidian about updating links. Found on the test page: a rename left `files` naming the old file, so the
// Library no longer knew which book the note was for.

import type { App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { relinkOwnedRegion, relinkTitleNotes } from '../library/title-note-rename';

const NOTE = `---
orbis_note: title
title: Sample
files:
  - "[[fixtures/sample.epub]]"
---

My own line mentions [[sample.epub]].

%%orbis:begin%%
![[sample.epub]]
%%orbis:end%%
`;

/** A vault of title notes, each with its frontmatter and its text, recording every write. */
function vault(notes: Record<string, { fm: Record<string, unknown>; text: string }>) {
  const writes: string[] = [];
  const file = (path: string) => ({ path, extension: 'md', basename: path.split('/').pop() }) as unknown as TFile;
  const app = {
    vault: {
      getMarkdownFiles: () => Object.keys(notes).map(file),
      getFileByPath: (p: string) => (notes[p] ? file(p) : null),
      cachedRead: async (f: TFile) => notes[f.path].text,
      process: async (f: TFile, edit: (s: string) => string) => {
        writes.push(f.path);
        notes[f.path].text = edit(notes[f.path].text);
      },
    },
    metadataCache: { getFileCache: (f: TFile) => ({ frontmatter: notes[f.path].fm }) },
    fileManager: {
      processFrontMatter: async (f: TFile, edit: (fm: Record<string, unknown>) => void) => {
        writes.push(f.path);
        edit(notes[f.path].fm);
      },
    },
  } as unknown as App;
  return { app, writes };
}

const renamed = { path: 'fixtures/sample-moved.epub', extension: 'epub' } as TFile;

describe('renaming a book', () => {
  it("re-points its title note's files and the embed Orbis owns, not the reader's own text", async () => {
    const notes = {
      'library/Sample.md': {
        fm: { orbis_note: 'title', title: 'Sample', files: ['[[fixtures/sample.epub]]'] },
        text: NOTE,
      },
    };
    const { app } = vault(notes);
    expect(await relinkTitleNotes(app, 'fixtures/sample.epub', renamed)).toBe(1);
    const { fm, text } = notes['library/Sample.md'];
    expect(fm.files).toEqual(['[[fixtures/sample-moved.epub]]']);
    expect(text).toContain('![[fixtures/sample-moved.epub]]');
    expect(text).toContain('My own line mentions [[sample.epub]].');
  });

  // A rename Obsidian already handled — or a book the note never named — must not rewrite, and so re-sync, the note.
  it('writes nothing to a title note that does not name the old file', async () => {
    const notes = {
      'library/Other.md': {
        fm: { orbis_note: 'title', title: 'Other', files: ['[[fixtures/other.epub]]'] },
        text: '%%orbis:begin%%\n![[other.epub]]\n%%orbis:end%%\n',
      },
    };
    const { app, writes } = vault(notes);
    expect(await relinkTitleNotes(app, 'fixtures/sample.epub', renamed)).toBe(0);
    expect(writes).toEqual([]);
  });
});

describe("Orbis's own region", () => {
  it('keeps an alias and a heading when it re-points a link', () => {
    const text = '%%orbis:begin%%\n[[sample.epub|the book]] [[sample.epub#Part]]\n%%orbis:end%%';
    const out = relinkOwnedRegion(text, (t) => t === 'sample.epub', 'x/sample-moved.epub');
    expect(out).toContain('[[x/sample-moved.epub|the book]]');
    expect(out).toContain('[[x/sample-moved.epub#Part]]');
  });

  it('leaves a note with no region alone', () => {
    expect(relinkOwnedRegion('[[sample.epub]]', () => true, 'x.epub')).toBe('[[sample.epub]]');
  });
});
