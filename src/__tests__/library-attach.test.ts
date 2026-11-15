// Attaching a book file to a title note that already exists — the review's Attach.

import { type App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { attachFileToRecord } from '../library/cataloging';

const file = (path: string, extension: string): TFile =>
  Object.assign(new TFile(), {
    path,
    extension,
    basename:
      path
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') ?? '',
  });

describe('attachFileToRecord', () => {
  // Written as Obsidian's shortest link, `[[volumes 1.epub]]`: right today, a different file the day a second
  // `volumes 1.epub` lands in another folder. A new note names its file by full path; so must an attached one.
  it('names the attached file by its full vault path, beside the files already there', async () => {
    const note = file('ebooks/library/Volumes.md', 'md');
    const fm: Record<string, unknown> = { orbis_note: 'title', title: 'Volumes', files: ['[[fixtures/volumes.epub]]'] };
    const app = {
      vault: { getAbstractFileByPath: (path: string) => (path === note.path ? note : null) },
      metadataCache: { getFileCache: () => ({ frontmatter: fm }), fileToLinktext: () => 'volumes 1.epub' },
      fileManager: {
        processFrontMatter: async (_note: TFile, change: (fm: Record<string, unknown>) => void) => change(fm),
      },
    } as unknown as App;
    await attachFileToRecord(app, note.path, file('fixtures/volumes 1.epub', 'epub'), null);
    expect(fm.files).toEqual(['[[fixtures/volumes.epub]]', '[[fixtures/volumes 1.epub]]']);
  });
});
