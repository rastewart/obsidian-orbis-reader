import type { App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { BOOK_CHANGED_EVENT, clearBook, rebuildBookFromDevices } from '../book-marks-store';
import { isOwnOrbisWrite } from '../orbis-io';
import {
  ensureOrbisFileExists,
  progressFilePath,
  progressFolderPath,
  readBookmarks,
  readBookPreset,
  readBookRecords,
  readHighlights,
  readLocsCache,
  readNotes,
  readNotesFiles,
  readReadingStats,
  recordNotesFileSet,
  saveBookInfo,
  saveBookmarks,
  saveBookPreset,
  saveBookRecords,
  saveHighlights,
  saveLocation,
  saveLocsCache,
  saveNotes,
  saveReadingStats,
  updateDeviceNameInVault,
  writeLocationOnOpen,
} from '../progress';

// Alias used only for the structural test mocks below. The real TFile cannot be
// constructed in a unit test, and an `instanceof TFile` narrowing is impossible on a
// hand-built object, so we assert through this alias rather than casting to TFile
// directly (which obsidianmd/no-tfile-tfolder-cast forbids).
type MockTFile = TFile;

// `path` is explicit for the case that matters most: a file the vault has already detached, which keeps its path
// and loses its parent. That is what a `delete` event hands over.
function mockFile(basename: string, parentPath: string | null, path?: string): TFile {
  return {
    basename,
    path: path ?? (parentPath && parentPath !== '/' ? `${parentPath}/${basename}.epub` : `${basename}.epub`),
    parent: parentPath !== null ? { path: parentPath } : null,
  } as unknown as MockTFile;
}

// `ext` matters: the vault-wide scans — `updateDeviceNameInVault` among them — filter by extension and must accept
// every book format, so a non-epub book has to be constructible here.
function mockBookFile(basename: string, parentPath: string | null, ext = 'epub'): TFile {
  const path = parentPath && parentPath !== '/' ? `${parentPath}/${basename}.${ext}` : `${basename}.${ext}`;
  return {
    basename,
    path,
    extension: ext,
    parent: parentPath !== null ? { path: parentPath } : null,
  } as unknown as MockTFile;
}

// A minimal in-memory stand-in for the small slice of the Obsidian API progress.ts
// actually touches: vault.adapter's exists/read/write/list/mkdir, vault.getFiles(),
// and App#loadLocalStorage/saveLocalStorage. `files` is exposed directly so tests
// can assert on raw written JSON without going through another read function.
function createMockApp(bookFiles: TFile[] = []) {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const localStorage = new Map<string, string>();

  const adapter = {
    exists: async (path: string) => files.has(path) || dirs.has(path),
    read: async (path: string) => {
      const v = files.get(path);
      if (v === undefined) throw new Error(`not found: ${path}`);
      return v;
    },
    write: async (path: string, data: string) => {
      files.set(path, data);
    },
    mkdir: async (path: string) => {
      dirs.add(path);
    },
    list: async (path: string) => {
      const prefix = `${path}/`;
      const matches = [...files.keys()].filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'));
      return { files: matches, folders: [] };
    },
  };

  // Every event the code announces, so a test can see that a save told the open views.
  const events: unknown[][] = [];
  const app = {
    vault: {
      adapter,
      getFiles: () => bookFiles,
    },
    workspace: { trigger: (...args: unknown[]) => events.push(args) },
    loadLocalStorage: (key: string) => localStorage.get(key) ?? null,
    saveLocalStorage: (key: string, value: string) => {
      localStorage.set(key, value);
    },
  } as unknown as App;

  return { app, files, events, localStorage };
}

// Typed read-back of a raw written file, for asserting on JSON shape without
// littering every test with `as Record<string, unknown>` casts.
function readJsonFile(files: Map<string, string>, path: string): Record<string, unknown> {
  const raw = files.get(path);
  if (raw === undefined) throw new Error(`not found: ${path}`);
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('progressFolderPath', () => {
  it('places !orbis-data alongside the epub when it has a parent folder', () => {
    expect(progressFolderPath(mockFile('Sample Book', 'Books'))).toBe('Books/!orbis-data');
  });

  it('uses root !orbis-data when epub is at the vault root (parent path "/")', () => {
    expect(progressFolderPath(mockFile('Sample Book', '/'))).toBe('!orbis-data');
  });

  it('uses root !orbis-data when parent is null', () => {
    expect(progressFolderPath(mockFile('Sample Book', null))).toBe('!orbis-data');
  });

  // The vault detaches a file before firing `delete`, so `parent` is null while the path is still right. Falling back
  // to the vault root would send the cleanup to a folder the book was never in — matching nothing, removing nothing,
  // and reporting success anyway.
  it('reads the folder out of the path when the file has been detached', () => {
    expect(progressFolderPath(mockFile('Sample Book', null, 'notes/Sample Book.epub'))).toBe('notes/!orbis-data');
    expect(progressFolderPath(mockFile('Sample Book', null, 'a/b/c/Sample Book.epub'))).toBe('a/b/c/!orbis-data');
  });

  it('handles deeply nested parent paths', () => {
    expect(progressFolderPath(mockFile('mybook', 'Library/Fiction/SciFi'))).toBe('Library/Fiction/SciFi/!orbis-data');
  });
});

describe('progressFilePath', () => {
  it('builds <file name>.orbis inside the !orbis-data folder', () => {
    expect(progressFilePath(mockFile('Sample Book', 'Books'))).toBe('Books/!orbis-data/Sample Book.epub.orbis');
  });

  it('works for epub at vault root', () => {
    expect(progressFilePath(mockFile('Sample Book', null))).toBe('!orbis-data/Sample Book.epub.orbis');
  });

  it('keeps the extension in the name, so two formats of one book keep two files', () => {
    // Named from the basename, `sample.epub` and `sample.azw3` would share one `.orbis`, so reading either would move
    // the other's place and show the other's highlights.
    const epub = progressFilePath(mockBookFile('sample', 'Library', 'epub'));
    const azw3 = progressFilePath(mockBookFile('sample', 'Library', 'azw3'));
    expect(epub).toBe('Library/!orbis-data/sample.epub.orbis');
    expect(azw3).toBe('Library/!orbis-data/sample.azw3.orbis');
  });
});

// Each device records its own changes to a book in a file of its own, and the .orbis is rebuilt from all of them. See
// docs/design/book-annotation-sync.md; the rules are tested in book-marks.test.ts, and these test the files.
describe('device files for marks', () => {
  const hl = (id: string, createdAt: number) => ({ id, cfiRange: `c${createdAt}`, text: id, color: '#fff', createdAt });
  const other = (files: Map<string, string>, file: TFile, device: string, records: unknown[]) =>
    files.set(
      `Books/!orbis-data/${file.basename}.epub.marks.${device}.json`,
      JSON.stringify({ version: 1, device, records })
    );
  const at = (minute: number) => ({ at: `2020-01-01T00:${String(minute).padStart(2, '0')}:00.000Z`, clock: 0 });

  it('records a save in the file of this device, beside the book', async () => {
    const { app, files, localStorage } = createMockApp();
    localStorage.set('orbis-device-id', 'mac');
    const file = mockFile('Device Files One', 'Books');
    await readHighlights(app, file);
    await saveHighlights(app, file, [hl('h1', 1)]);
    const mine = readJsonFile(files, 'Books/!orbis-data/Device Files One.epub.marks.mac.json');
    expect(mine.device).toBe('mac');
    expect((mine.records as { id: string; type: string }[]).map((r) => [r.type, r.id])).toEqual([['highlight', 'h1']]);
  });

  // The phone was off the network; its file arrives, and the Mac's next save rebuilds the book with both.
  it('writes the .orbis as the changes of every device together', async () => {
    const { app, files, localStorage } = createMockApp();
    localStorage.set('orbis-device-id', 'mac');
    const file = mockFile('Device Files Two', 'Books');
    await readHighlights(app, file);
    other(files, file, 'phone', [
      { id: 'p1', type: 'highlight', device: 'phone', version: at(1), deleted: false, item: hl('p1', 1) },
    ]);
    await saveHighlights(app, file, [hl('m1', 2)]);
    const orbis = readJsonFile(files, progressFilePath(file));
    expect((orbis.highlights as { id: string }[]).map((h) => h.id)).toEqual(['p1', 'm1']);
  });

  // The safety rule: this device never had the phone's mark, so its save must not record that mark as deleted.
  it('never records a mark from another device as deleted here because the open book had not loaded it', async () => {
    const { app, files, localStorage } = createMockApp();
    localStorage.set('orbis-device-id', 'mac');
    const file = mockFile('Device Files Three', 'Books');
    await readHighlights(app, file);
    other(files, file, 'phone', [
      { id: 'p1', type: 'highlight', device: 'phone', version: at(1), deleted: false, item: hl('p1', 1) },
    ]);
    files.set(progressFilePath(file), JSON.stringify({ highlights: [hl('p1', 1)] }));
    await saveHighlights(app, file, [hl('m1', 2)]);
    const mine = readJsonFile(files, 'Books/!orbis-data/Device Files Three.epub.marks.mac.json');
    expect((mine.records as { id: string; deleted: boolean }[]).map((r) => [r.id, r.deleted])).toEqual([['m1', false]]);
    expect((readJsonFile(files, progressFilePath(file)).highlights as { id: string }[]).map((h) => h.id)).toEqual([
      'p1',
      'm1',
    ]);
  });

  // A factory reset, or a .orbis deleted from outside, can leave the record of what the book had out of date. The
  // save has to stand anyway: it is what the reader just did.
  it('keeps what is being saved even when the record of what the book had is stale', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Device Files Stale', 'Books');
    files.set(progressFilePath(file), JSON.stringify({ highlights: [hl('h1', 1)] }));
    await readHighlights(app, file);
    files.delete(progressFilePath(file));
    await saveHighlights(app, file, [hl('h1', 1)]);
    expect((readJsonFile(files, progressFilePath(file)).highlights as { id: string }[]).map((h) => h.id)).toEqual([
      'h1',
    ]);
  });

  // One damaged record in any device's file threw inside every save of the book.
  it('saves past records of the wrong shape in another device’s file, and keeps the good ones', async () => {
    const { app, files, localStorage } = createMockApp();
    localStorage.set('orbis-device-id', 'mac');
    const file = mockFile('Device Files Damaged', 'Books');
    await readHighlights(app, file);
    other(files, file, 'phone', [
      null,
      { id: 'x', type: 'highlight', device: 'phone', deleted: false, item: hl('x', 1) },
      { id: 'pre', type: 'preset', device: 'phone', version: at(1), deleted: false, item: { id: 'pre', name: 'p' } },
      { id: 'p1', type: 'highlight', device: 'phone', version: at(1), deleted: false, item: hl('p1', 1) },
    ]);
    await saveHighlights(app, file, [hl('m1', 2)]);
    const orbis = readJsonFile(files, progressFilePath(file));
    expect((orbis.highlights as { id: string }[]).map((h) => h.id)).toEqual(['p1', 'm1']);
  });

  // Deleting a book's .orbis cleared it before device files existed, and has to still: see `clearBook`.
  it('clears a book, so its next save holds only what was made after', async () => {
    const { app, files, localStorage } = createMockApp();
    localStorage.set('orbis-device-id', 'mac');
    const file = mockFile('Device Files Clear', 'Books');
    await readHighlights(app, file);
    await saveHighlights(app, file, [hl('old', 1)]);
    files.delete(progressFilePath(file));
    await clearBook(app, file);
    await readHighlights(app, file);
    await saveHighlights(app, file, [hl('new', 2)]);
    expect((readJsonFile(files, progressFilePath(file)).highlights as { id: string }[]).map((h) => h.id)).toEqual([
      'new',
    ]);
  });

  // The reader adds to the list it read rather than building a new one. If what the book had WAS that list, the add
  // would already be in it, no change would be recorded, and after a clear the rebuild would take the new mark away.
  it('records a mark added to the very list that was read, as the reader adds one', async () => {
    const { app, files, localStorage } = createMockApp();
    localStorage.set('orbis-device-id', 'mac');
    const file = mockFile('Device Files Same List', 'Books');
    await readHighlights(app, file);
    await saveHighlights(app, file, [hl('old', 1)]);
    files.delete(progressFilePath(file));
    await clearBook(app, file);
    const highlights = await readHighlights(app, file);
    highlights.push(hl('new', 2));
    await saveHighlights(app, file, highlights);
    const notes = await readNotes(app, file);
    notes.push({ ...hl('note', 3), note: 'n' } as never);
    await saveNotes(app, file, notes);
    const bookmarks = await readBookmarks(app, file);
    bookmarks.push({ id: 'bm', cfi: 'c', label: 'b', createdAt: 4 });
    await saveBookmarks(app, file, bookmarks);
    const orbis = readJsonFile(files, progressFilePath(file));
    expect((orbis.highlights as { id: string }[]).map((h) => h.id)).toEqual(['new']);
    expect((orbis.notes as { id: string }[]).map((n) => n.id)).toEqual(['note']);
    expect((orbis.bookmarks as { id: string }[]).map((b) => b.id)).toEqual(['bm']);
  });

  // Generating notes recorded its set, and a reading-speed save 23ms later — having read the file before the record
  // landed — wrote it back without it. Two writes that overlap must both survive.
  it('keeps both of two writes that overlap', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Device Files Overlap', 'Books');
    await Promise.all([
      recordNotesFileSet(app, file, {
        id: 'n1',
        styleName: 'S',
        styleId: 's',
        createdAt: 1,
        mode: 'single',
        path: 'N.md',
      }),
      saveReadingStats(app, file, { wpmSamples: [200], lastUpdated: '2026-10-02' }),
    ]);
    const orbis = readJsonFile(files, progressFilePath(file));
    expect((orbis.notesFiles as unknown[]).length).toBe(1);
    expect(orbis.readingStats).toBeDefined();
  });

  it('tells the open views that the book changed', async () => {
    const { app, events } = createMockApp();
    const file = mockFile('Device Files Four', 'Books');
    await saveBookmarks(app, file, []);
    expect(events).toContainEqual([BOOK_CHANGED_EVENT, file.path]);
  });

  it('leaves a save of anything else as it always was, with no device file', async () => {
    const { app, files, events } = createMockApp();
    const file = mockFile('Device Files Five', 'Books');
    await saveBookInfo(app, file, { title: 'Title' });
    expect([...files.keys()].some((p) => p.includes('.marks.'))).toBe(false);
    expect(events).toEqual([]);
  });

  // The reader saves its whole rolling list; only what it appended is this device's.
  it('records only the reading-speed samples this device added', async () => {
    const { app, files, localStorage } = createMockApp();
    localStorage.set('orbis-device-id', 'mac');
    const file = mockFile('Device Files Six', 'Books');
    files.set(progressFilePath(file), JSON.stringify({ readingStats: { wpmSamples: [100, 110], lastUpdated: '' } }));
    await readReadingStats(app, file);
    await saveReadingStats(app, file, { wpmSamples: [100, 110, 250], lastUpdated: '' });
    const mine = readJsonFile(files, 'Books/!orbis-data/Device Files Six.epub.marks.mac.json');
    expect((mine.records as { type: string; item: number[] }[]).find((r) => r.type === 'readingStats')?.item).toEqual([
      250,
    ]);
  });

  const notesSet = (id: string, path: string, createdAt: number) => ({
    id,
    styleName: 'S',
    styleId: 's',
    createdAt,
    mode: 'single' as const,
    path,
  });
  const setIds = (files: Map<string, string>, file: TFile) =>
    ((readJsonFile(files, progressFilePath(file)).notesFiles as { id: string }[] | undefined) ?? []).map((s) => s.id);

  // The phone, before the Mac's notes set reached it, saved the book and its copy of the .orbis won the sync.
  it('puts back a notes set another device wrote when its .orbis is overwritten without it', async () => {
    const { app, files, localStorage } = createMockApp();
    localStorage.set('orbis-device-id', 'mac');
    const file = mockFile('Device Files Sets', 'Books');
    await recordNotesFileSet(app, file, notesSet('m1', 'Mac Notes.md', 1));
    other(files, file, 'phone', [
      { id: 'p1', type: 'notesSet', device: 'phone', version: at(1), deleted: false, item: notesSet('p1', 'P.md', 2) },
    ]);
    files.set(progressFilePath(file), JSON.stringify({ readingStats: { wpmSamples: [200], lastUpdated: '' } }));
    expect(await rebuildBookFromDevices(app, file)).toBe(true);
    expect(setIds(files, file)).toEqual(['m1', 'p1']);
  });

  it('replaces the notes set recorded at the same file, and keeps one at another', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Device Files Replace', 'Books');
    await recordNotesFileSet(app, file, notesSet('a', 'N.md', 1));
    await recordNotesFileSet(app, file, notesSet('b', 'Other.md', 2));
    await recordNotesFileSet(app, file, notesSet('c', 'N.md', 3));
    expect(setIds(files, file)).toEqual(['b', 'c']);
  });

  it("keeps the book's reading-records decision when its .orbis is overwritten without it", async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Device Files Records', 'Books');
    await saveBookRecords(app, file, { enabled: true });
    files.set(progressFilePath(file), JSON.stringify({}));
    await rebuildBookFromDevices(app, file);
    expect(await readBookRecords(app, file)).toEqual({ enabled: true });
    await saveBookRecords(app, file, null);
    expect(await readBookRecords(app, file)).toBeNull();
  });
});

// An open book watches its Orbis file and reloads when another device's version arrives by sync, so it has to be able
// to tell that version from the echo of its own save.
describe('isOwnOrbisWrite', () => {
  const save = (app: App, file: TFile, id: string) =>
    saveHighlights(app, file, [{ id, cfiRange: 'x', text: id, color: '#fff', createdAt: 1 }]);

  it('recognizes what this device wrote, by its content', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Own Write One', 'Books');
    await save(app, file, 'h1');
    const path = progressFilePath(file);
    expect(isOwnOrbisWrite(path, files.get(path) as string)).toBe(true);
  });

  it('does not recognize the same file as another device wrote it', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Own Write Two', 'Books');
    await save(app, file, 'h1');
    const path = progressFilePath(file);
    const elsewhere = (files.get(path) as string).replace('"h1"', '"h2"');
    expect(isOwnOrbisWrite(path, elsewhere)).toBe(false);
  });

  // Two saves in quick succession can be reported out of order, and reading the first back as news would drop the second.
  it('still recognizes an earlier save of its own after a newer one', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Own Write Three', 'Books');
    const path = progressFilePath(file);
    await save(app, file, 'h1');
    const first = files.get(path) as string;
    await save(app, file, 'h2');
    expect(isOwnOrbisWrite(path, first)).toBe(true);
  });

  it('keeps only the last few versions', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Own Write Four', 'Books');
    const path = progressFilePath(file);
    await save(app, file, 'h0');
    const oldest = files.get(path) as string;
    for (let i = 1; i <= 8; i++) await save(app, file, `h${i}`);
    expect(isOwnOrbisWrite(path, oldest)).toBe(false);
  });
});

describe('saveHighlights / writeOrbisFile', () => {
  it('creates the .orbis file stamped with the current version', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveHighlights(app, file, [
      { id: 'h1', cfiRange: 'epubcfi(...)', text: 'quote', color: '#fff', createdAt: 1 },
    ]);
    const written = readJsonFile(files, progressFilePath(file));
    expect(written.version).toBe(1);
    expect(written.highlights).toHaveLength(1);
  });

  it('merges into existing content instead of clobbering unrelated fields', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(progressFilePath(file), JSON.stringify({ title: 'Sample Book', bookmarks: [{ id: 'b1' }] }));
    await saveHighlights(app, file, [{ id: 'h1', cfiRange: 'x', text: 'y', color: '#fff', createdAt: 1 }]);
    const written = readJsonFile(files, progressFilePath(file));
    expect(written.title).toBe('Sample Book');
    expect(written.bookmarks).toEqual([{ id: 'b1' }]);
    expect(written.highlights).toHaveLength(1);
    expect(written.version).toBe(1);
  });

  it('reads back what it wrote via readHighlights', async () => {
    const { app } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveHighlights(app, file, [{ id: 'h1', cfiRange: 'x', text: 'y', color: '#fff', createdAt: 1 }]);
    expect(await readHighlights(app, file)).toHaveLength(1);
  });
});

describe('readBookPreset / saveBookPreset', () => {
  const marks = [
    // One of each channel, so the round trip covers both.
    { id: 'mk_a', name: 'Follow up', treatment: 'underline' as const, treatmentColor: '#A5D6A7', enabled: true },
    { id: 'mk_b', name: 'Key fact', highlightColor: '#FFEB3B', enabled: true },
  ];

  it('round-trips the book copy, order included', async () => {
    const { app } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveBookPreset(app, file, { id: 'ap_1', name: 'Reading marks', revision: 3, customized: false, marks });
    const read = await readBookPreset(app, file);
    expect(read?.id).toBe('ap_1');
    // The template's name travels too, so a book whose preset is missing here can still name it.
    expect(read?.name).toBe('Reading marks');
    expect(read?.revision).toBe(3);
    expect(read?.customized).toBe(false);
    expect(read?.marks.map((m) => m.id)).toEqual(['mk_a', 'mk_b']);
  });

  it('keeps a detached book detached across a round trip', async () => {
    // `detached` must survive the read: dropped on the way back in, the book would come back looking like one that had
    // never been assigned a preset, and `ensureBookAnnotationPreset` would hand it the default. The flag exists to tell
    // those two apart, so losing it at the read is the one place that defeats it entirely.
    const { app } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveBookPreset(app, file, { id: '', name: '', revision: 0, detached: true, marks });
    expect((await readBookPreset(app, file))?.detached).toBe(true);
  });

  it('reads a book that simply has no preset as NOT detached', async () => {
    // The other half of the same distinction: absent is not detached, or every unassigned book would stop
    // being given one.
    const { app } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveBookPreset(app, file, { id: 'ap_1', name: 'Reading marks', revision: 3, marks });
    expect((await readBookPreset(app, file))?.detached).toBeUndefined();
  });

  it('keeps a mark local across a round trip', async () => {
    // `migrateMark` rebuilds each mark field by field and does not carry `local`, so the read has to take provenance
    // from the RAW marks. Reading it off the migrated ones would see undefined every time, and a mark created in the
    // book would come back tracked: read-only in the editor, and eligible for deletion by the survivor rule, since the
    // template it appeared to track has no such mark.
    const { app } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveBookPreset(app, file, {
      id: 'ap_1',
      name: 'Reading marks',
      revision: 3,
      customized: false,
      marks: [{ ...marks[0] }, { ...marks[1], local: true as const }],
    });
    const read = await readBookPreset(app, file);
    expect(read?.marks.map((m) => m.local)).toEqual([undefined, true]);
  });

  // Read off the raw marks for the same reason as `local`: without it, a reloaded copy no longer says which preset
  // mark it replaced, and the next preset update adds the original back beside it.
  it('keeps the preset mark a copy replaced across a round trip', async () => {
    const { app } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveBookPreset(app, file, {
      id: 'ap_1',
      name: 'Reading marks',
      revision: 3,
      customized: false,
      marks: [{ ...marks[0] }, { ...marks[1], id: 'mk_copy', local: true as const, copyOf: marks[1].id }],
    });
    const read = await readBookPreset(app, file);
    expect(read?.marks.map((m) => m.copyOf)).toEqual([undefined, marks[1].id]);
  });

  it('takes provenance by id, so a mark dropped in migration cannot shift it', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveBookPreset(app, file, { id: 'ap_1', name: 'N', revision: 1, customized: false, marks });
    // A mark that cannot draw sits FIRST and is dropped on read; by index the flag would land on the wrong
    // survivor.
    const json = readJsonFile(files, progressFilePath(file)) as { preset: { marks: unknown[] } };
    json.preset.marks = [
      { id: 'mk_dead', name: 'Undrawable', enabled: true },
      { id: 'mk_a', name: 'Follow up', highlightColor: '#FFEB3B', enabled: true },
      { id: 'mk_b', name: 'Key fact', highlightColor: '#90CAF9', enabled: true, local: true },
    ];
    await app.vault.adapter.write(progressFilePath(file), JSON.stringify(json));
    const read = await readBookPreset(app, file);
    expect(read?.marks.map((m) => [m.id, m.local])).toEqual([
      ['mk_a', undefined],
      ['mk_b', true],
    ]);
  });

  it('returns null for a book that was never assigned one', async () => {
    const { app } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveHighlights(app, file, [{ id: 'h1', cfiRange: 'x', text: 'y', color: '#fff', createdAt: 1 }]);
    expect(await readBookPreset(app, file)).toBeNull();
  });

  it('drops the key entirely when unassigned, rather than leaving a tombstone', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveBookPreset(app, file, { id: 'ap_1', name: 'Reading marks', revision: 1, customized: false, marks });
    await saveBookPreset(app, file, null);
    expect('preset' in readJsonFile(files, progressFilePath(file))).toBe(false);
    expect(await readBookPreset(app, file)).toBeNull();
  });

  it('reads a pre-tracking customized copy as all-local', async () => {
    // There is no way to know WHICH marks were edited, so none of them may be overwritten by a merge.
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(
      progressFilePath(file),
      // The deprecated flag on purpose: this is the shape being migrated FROM.
      JSON.stringify({ preset: { id: 'ap_1', customized: true, marks, hiddenMarkIds: ['mk_a'] } })
    );
    const read = await readBookPreset(app, file);
    expect(read?.marks.every((m) => m.local)).toBe(true);
    expect(read?.hiddenMarkIds).toEqual(['mk_a']);
  });

  it('reads an uncustomized copy as all-tracked, which is exactly true', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(progressFilePath(file), JSON.stringify({ preset: { id: 'ap_1', customized: false, marks } }));
    const read = await readBookPreset(app, file);
    expect(read?.marks.some((m) => m.local)).toBe(false);
    expect(read?.hiddenMarkIds).toBeUndefined();
  });

  it('treats a malformed preset as absent instead of trusting it', async () => {
    // data-migration.md: read defensively. A `preset` that is not the expected shape must not reach the
    // draw path, where a mark with no treatment would throw rather than degrade.
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(progressFilePath(file), JSON.stringify({ preset: { revision: 2 } }));
    expect(await readBookPreset(app, file)).toBeNull();
  });

  it('keeps only the marks that can actually draw', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(
      progressFilePath(file),
      JSON.stringify({
        // No color in either channel — nothing to draw, so it is dropped. (A legacy `color` with no
        // treatment is NOT undrawable: it migrates to a wash.)
        preset: { id: 'ap_1', marks: [marks[0], { id: 'mk_bad', name: 'Draws nothing' }] },
      })
    );
    const read = await readBookPreset(app, file);
    expect(read?.marks.map((m) => m.id)).toEqual(['mk_a']);
    // Missing revision falls back to 1 rather than NaN, so a comparison against the template still works, and a copy
    // with no `name` reads as unknown rather than undefined.
    expect(read?.revision).toBe(1);
    expect(read?.name).toBe('');
  });
});

describe('ensureOrbisFileExists', () => {
  it('creates an empty, versioned .orbis file when none exists', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await ensureOrbisFileExists(app, file);
    const written = readJsonFile(files, progressFilePath(file));
    expect(written).toEqual({ version: 1 });
  });

  it('never overwrites a file that already exists', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    const existingRealData = JSON.stringify({ highlights: [{ id: 'h1' }] });
    files.set(progressFilePath(file), existingRealData);
    await ensureOrbisFileExists(app, file);
    expect(files.get(progressFilePath(file))).toBe(existingRealData);
  });
});

describe('saveBookInfo', () => {
  it('fills in missing fields', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveBookInfo(app, file, { title: 'Sample Book', author: 'Tester' });
    const written = readJsonFile(files, progressFilePath(file));
    expect(written.title).toBe('Sample Book');
    expect(written.author).toBe('Tester');
  });

  it('does not overwrite an existing non-empty value', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(progressFilePath(file), JSON.stringify({ version: 1, title: 'Original Title' }));
    await saveBookInfo(app, file, { title: 'New Title' });
    const written = readJsonFile(files, progressFilePath(file));
    expect(written.title).toBe('Original Title');
  });

  it('writes nothing when there is nothing new to add', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveBookInfo(app, file, {});
    expect(files.has(progressFilePath(file))).toBe(false);
  });
});

describe('LocationsCache round trip', () => {
  it('round-trips through saveLocsCache / readLocsCache', async () => {
    const { app } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveLocsCache(app, file, {
      sectionLocInfo: [{ startLoc: 0, locCount: 100 }],
      locNavCache: new Map([[1, 'epubcfi(a)']]),
      totalLocs: 100,
      sectionWordCounts: [50],
      sectionCharCounts: [200],
      sectionHeadings: ['CHAPTER I'],
      anchorCharOffsets: new Map([['text.xhtml#day2', 400]]),
    });
    const cache = await readLocsCache(app, file);
    expect(cache).not.toBeNull();
    expect(cache!.version).toBe(8);
    expect(cache!.totalLocs).toBe(100);
    expect(cache!.locNavCache).toEqual({ '1': 'epubcfi(a)' });
    expect(cache!.sectionWordCounts).toEqual([50]);
    expect(cache!.sectionHeadings).toEqual(['CHAPTER I']);
    // Where each chapter starts inside its file — what sizes the chapters of a book that keeps many in one.
    expect(cache!.anchorCharOffsets).toEqual({ 'text.xhtml#day2': 400 });
  });

  // A section with no heading of its own stores '', and the array survives the round trip full-length — the
  // reader tells "measured, found nothing" from "never measured" by whether the array is there at all.
  it('keeps empty headings rather than dropping them', async () => {
    const { app } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveLocsCache(app, file, {
      sectionLocInfo: [{ startLoc: 0, locCount: 100 }],
      locNavCache: new Map(),
      totalLocs: 100,
      sectionWordCounts: [50, 60],
      sectionHeadings: ['', 'CHAPTER II'],
    });
    const cache = await readLocsCache(app, file);
    expect(cache!.sectionHeadings).toEqual(['', 'CHAPTER II']);
  });

  it('rejects a cache written with a different version', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(
      progressFilePath(file).replace('.orbis', '.pages.json'),
      JSON.stringify({ version: 999, totalLocs: 1, sectionLocInfo: [], locNavCache: {}, sectionWordCounts: [] })
    );
    expect(await readLocsCache(app, file)).toBeNull();
  });

  it('rejects a cache missing required fields even with the right version', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(progressFilePath(file).replace('.orbis', '.pages.json'), JSON.stringify({ version: 1 }));
    expect(await readLocsCache(app, file)).toBeNull();
  });
});

/** The one location file a test wrote — beside the folder's `!readme.md`, which making the folder writes too. */
function locationFileOf(files: Map<string, string>): string {
  const path = [...files.keys()].find((p) => p.includes('.location.'));
  if (!path) throw new Error('no location file written');
  return path;
}

describe('device location files', () => {
  it('stamps the version and returns 0 for previousLastOpened on first open', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    const previous = await writeLocationOnOpen(app, file);
    expect(previous).toBe(0);
    const path = locationFileOf(files);
    const written = readJsonFile(files, path);
    expect(written.version).toBe(1);
    expect(written.location).toBe('');
  });

  it('preserves the saved location and returns the prior lastOpened on a later open', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveLocation(app, file, 'epubcfi(/6/4)');
    const path = locationFileOf(files);
    const afterSave = readJsonFile(files, path);

    const previous = await writeLocationOnOpen(app, file);
    expect(previous).toBe(afterSave.lastOpened);
    const afterOpen = readJsonFile(files, path);
    expect(afterOpen.location).toBe('epubcfi(/6/4)');
    expect(afterOpen.version).toBe(1);
  });

  it('updateDeviceNameInVault renames the device and re-stamps the version', async () => {
    const epub = mockBookFile('Sample Book', 'Books');
    const { app, files } = createMockApp([epub]);
    await saveLocation(app, epub, 'epubcfi(/6/4)');
    const path = locationFileOf(files);
    const deviceId = readJsonFile(files, path).deviceId as string;

    await updateDeviceNameInVault(app, deviceId, 'My iPad');
    const updated = readJsonFile(files, path);
    expect(updated.deviceName).toBe('My iPad');
    expect(updated.version).toBe(1);
  });

  it('updateDeviceNameInVault reaches non-epub books too', async () => {
    // Every book format, not only epub: renaming a device must not leave the old name stranded in a mobi/azw3/cbz/fb2
    // book's location file, with nothing to ever correct it.
    const mobi = mockBookFile('Sample Book', 'Books', 'mobi');
    const { app, files } = createMockApp([mobi]);
    await saveLocation(app, mobi, 'epubcfi(/6/4)');
    const path = locationFileOf(files);
    const deviceId = readJsonFile(files, path).deviceId as string;

    await updateDeviceNameInVault(app, deviceId, 'Pixel');
    expect(readJsonFile(files, path).deviceName).toBe('Pixel');
  });
});

describe('readNotes', () => {
  it('normalizes legacy highlightColor into color', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(
      progressFilePath(file),
      JSON.stringify({ notes: [{ id: 'n1', cfiRange: 'x', text: 'y', createdAt: 1, highlightColor: '#abc' }] })
    );
    const notes = await readNotes(app, file);
    expect(notes[0].color).toBe('#abc');
  });

  it('prefers an explicit color over highlightColor', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(
      progressFilePath(file),
      JSON.stringify({
        notes: [{ id: 'n1', cfiRange: 'x', text: 'y', createdAt: 1, color: '#new', highlightColor: '#old' }],
      })
    );
    const notes = await readNotes(app, file);
    expect(notes[0].color).toBe('#new');
  });
});

describe('readNotesFiles', () => {
  it('upgrades a legacy record with no mode field to single-file mode', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(
      progressFilePath(file),
      JSON.stringify({ notesFiles: [{ id: 'ns1', styleName: 'Default', path: 'Sample Book Notes.md' }] })
    );
    const sets = await readNotesFiles(app, file);
    expect(sets[0].mode).toBe('single');
    expect(sets[0].path).toBe('Sample Book Notes.md');
  });

  it('leaves a modern record with a mode field untouched', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    const record = {
      id: 'ns1',
      styleName: 'Default',
      styleId: 's1',
      createdAt: 1,
      mode: 'per-chapter',
      folder: 'Sample Book Notes',
    };
    files.set(progressFilePath(file), JSON.stringify({ notesFiles: [record] }));
    const sets = await readNotesFiles(app, file);
    expect(sets[0]).toEqual(record);
  });
});

describe('annotation appearance fallback fields', () => {
  it('round-trips markId and treatment on a highlight', async () => {
    // Both are read only when markId fails to resolve, so they have to survive the file untouched.
    const { app } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    await saveHighlights(app, file, [
      {
        id: 'h1',
        cfiRange: 'x',
        text: 'y',
        color: '#A5D6A7',
        markId: 'mk_builtin_green',
        treatment: 'squiggle',
        createdAt: 1,
      },
    ]);
    const [h] = await readHighlights(app, file);
    expect(h.markId).toBe('mk_builtin_green');
    expect(h.treatment).toBe('squiggle');
  });

  it('reads a highlight written before the fields existed', async () => {
    const { app, files } = createMockApp();
    const file = mockFile('Sample Book', 'Books');
    files.set(
      progressFilePath(file),
      JSON.stringify({ highlights: [{ id: 'h1', cfiRange: 'x', text: 'y', color: '#FFEB3B', createdAt: 1 }] })
    );
    const [h] = await readHighlights(app, file);
    expect(h.markId).toBeUndefined();
    expect(h.treatment).toBeUndefined();
  });
});
