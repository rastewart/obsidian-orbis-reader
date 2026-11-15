import { describe, expect, it } from 'vitest';
import { startFolder } from '../BookExportModal';

// Save as Markdown asks where to save the way Save as PDF does — beside the book, or one named folder — and the
// dialog's Save to opens on that answer. It used to know only the folder, so every book landed at the vault root.
const settings = (same: boolean, folder = '') => ({
  markdownSameFolderAsBook: same,
  bookExport: { defaultExportFolder: folder },
});

describe('startFolder', () => {
  it("opens beside the book, in the book's own folder", () => {
    expect(startFolder(settings(true, 'Exports'), 'Books/Fiction/A Tale.epub')).toBe('Books/Fiction');
  });

  it('opens at the vault root for a book at the root', () => {
    expect(startFolder(settings(true), 'A Tale.epub')).toBe('/');
  });

  it('opens in the named folder when the setting says so, wherever the book is', () => {
    expect(startFolder(settings(false, 'Exports'), 'Books/Fiction/A Tale.epub')).toBe('Exports');
  });

  it('opens at the vault root when no folder has been named', () => {
    expect(startFolder(settings(false), 'Books/A Tale.epub')).toBe('/');
  });
});
