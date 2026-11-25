// The fonts library's rules: where the folder is, how a vault font is named in a display style, what the Font list
// offers, and when the folder may not move.

import { type App, TFile, TFolder } from 'obsidian';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FONTS_FOLDER,
  deleteFontFiles,
  familyOfValue,
  fontChoices,
  fontsFolderOf,
  initFonts,
  knownFonts,
  moveFontsFolder,
  moveProblem,
  onFontsChanged,
  SYSTEM_FONTS,
  scanFonts,
  slotsOf,
  systemFontStatus,
  useFontIn,
  vaultFontValue,
} from '../fonts';
import { fontBytes, type Spec } from './font-bytes';

/** A vault of paths, with Obsidian's folder tree built from them, and a file manager that renames. */
function fakeVault(paths: string[], files: Record<string, Uint8Array | null> = {}) {
  const items = new Map<string, TFile | TFolder>();
  const folder = (path: string): TFolder => {
    const known = items.get(path);
    if (known instanceof TFolder) return known;
    const f = Object.assign(new TFolder(), { path, name: path.split('/').pop() ?? path });
    items.set(path, f);
    const at = path.lastIndexOf('/');
    if (at > 0) {
      f.parent = folder(path.slice(0, at));
      f.parent.children.push(f);
    }
    return f;
  };
  const add = (path: string) => {
    const at = path.lastIndexOf('/');
    const parent = folder(path.slice(0, at));
    const name = path.slice(at + 1);
    const stat = { ctime: 0, mtime: 1, size: files[path]?.length ?? 0 };
    const file = Object.assign(new TFile(), { path, name, extension: name.split('.').pop() ?? '', parent, stat });
    parent.children.push(file);
    items.set(path, file);
  };
  for (const path of [...paths, ...Object.keys(files)]) add(path);
  const moved: [string, string][] = [];
  const trashed: string[] = [];
  const detach = (entry: TFile | TFolder) => {
    for (const f of items.values()) if (f instanceof TFolder) f.children = f.children.filter((c) => c !== entry);
  };
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => items.get(p) ?? null,
      createFolder: async (p: string) => folder(p),
      // A file given as null is there and cannot be read, as one still being synced.
      readBinary: async (f: TFile) => {
        const data = files[f.path];
        if (!data) throw new Error(`cannot read ${f.path}`);
        return data.slice().buffer;
      },
    },
    fileManager: {
      renameFile: async (entry: TFile | TFolder, to: string) => {
        moved.push([entry.path, to]);
        detach(entry);
        items.delete(entry.path);
        entry.path = to;
        items.set(to, entry);
        const at = to.lastIndexOf('/');
        if (at > 0) folder(to.slice(0, at)).children.push(entry);
      },
      trashFile: async (entry: TFile | TFolder) => {
        trashed.push(entry.path);
        detach(entry);
        items.delete(entry.path);
      },
    },
  } as unknown as App;
  return { app, moved, trashed, add, files, has: (p: string) => items.has(p) };
}

describe('fontsFolderOf', () => {
  it('uses the default for an empty or root setting, and trims a trailing slash', () => {
    expect(fontsFolderOf('')).toBe(DEFAULT_FONTS_FOLDER);
    expect(fontsFolderOf(undefined)).toBe(DEFAULT_FONTS_FOLDER);
    expect(fontsFolderOf('/')).toBe(DEFAULT_FONTS_FOLDER);
    expect(fontsFolderOf('Assets/Fonts/')).toBe('Assets/Fonts');
    expect(fontsFolderOf(5)).toBe(DEFAULT_FONTS_FOLDER);
  });
});

describe('vault font values', () => {
  it('quotes the family, and reads it back', () => {
    expect(vaultFontValue('Literata')).toBe('"Literata"');
    expect(familyOfValue('"Source Serif 4"')).toBe('Source Serif 4');
  });

  it('does not read a system font list as a vault font', () => {
    expect(familyOfValue('"Palatino Linotype", Palatino, serif')).toBeNull();
    expect(familyOfValue('Georgia, serif')).toBeNull();
    expect(familyOfValue('default')).toBeNull();
  });

  it('drops quotes a family name could break out with', () => {
    expect(vaultFontValue('Odd"Name')).toBe('"OddName"');
  });
});

describe('fontChoices', () => {
  // jsdom has no canvas, so no font can be measured: every system font counts as present, as on a device that
  // cannot answer. Stubbed so jsdom does not report the missing method on every call.
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  const georgia = SYSTEM_FONTS.find((f) => f.value.startsWith('Georgia'))?.value ?? '';

  it('starts with the book’s fonts and Obsidian’s, and offers every system font by default', () => {
    const values = fontChoices([], 'default', document).map((c) => c.value);
    expect(values.slice(0, 2)).toEqual(['default', 'obsidian']);
    for (const f of SYSTEM_FONTS) expect(values).toContain(f.value);
  });

  it('leaves out a font switched off, unless it is the one in use', () => {
    expect(fontChoices([georgia], 'default', document).map((c) => c.value)).not.toContain(georgia);
    expect(fontChoices([georgia], georgia, document).map((c) => c.value)).toContain(georgia);
  });

  it('offers a font in use that is not here, marked as not on this device', () => {
    const missing = fontChoices([], '"Literata"', document).find((c) => c.value === '"Literata"');
    expect(missing?.label).toBe('Literata (not on this device)');
  });

  it('lists every font after the first two in alphabetical order, whatever kind it is', () => {
    const labels = fontChoices([], '"Literata"', document)
      .slice(2)
      .map((c) => c.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(labels.indexOf('Literata (not on this device)')).toBeLessThan(labels.indexOf('Palatino'));
  });
});

describe('systemFontStatus', () => {
  /**
   * A canvas whose text is as wide as the font that would draw it: each family a device has draws at its own width,
   * a family it lacks falls through to the next in the list, and `aliases` names the families it answers with its
   * own serif or sans-serif, as Android does.
   */
  function fakeDevice(has: string[], aliases: Record<string, 'serif' | 'sans-serif'> = {}): Document {
    const widths: Record<string, number> = { monospace: 600, serif: 500, 'sans-serif': 520 };
    has.forEach((family, i) => {
      widths[family] = 700 + i;
    });
    for (const [family, generic] of Object.entries(aliases)) widths[family] = widths[generic];
    const ctx = {
      font: '',
      measureText() {
        const list = this.font
          .replace(/^72px /, '')
          .split(',')
          .map((f) => f.trim().replace(/"/g, ''));
        const drawn = list.find((f) => f in widths) ?? 'serif';
        return { width: widths[drawn] };
      },
    };
    return { createElement: () => ({ getContext: () => ctx }) } as unknown as Document;
  }

  it('says whether a device has a font', () => {
    expect(systemFontStatus('Alpha, serif', fakeDevice(['Alpha']), false)).toBe('here');
    expect(systemFontStatus('Beta, serif', fakeDevice([]), false)).toBe('missing');
  });

  it('finds a font answered with the device’s own serif or sans-serif, when asked to', () => {
    const android = fakeDevice([], { Gamma: 'serif', Delta: 'sans-serif' });
    expect(systemFontStatus('Gamma, serif', android, true)).toBe('serif');
    expect(systemFontStatus('Delta, sans-serif', android, true)).toBe('sans-serif');
  });

  it('does not call a real font a stand-in', () => {
    expect(systemFontStatus('Epsilon, serif', fakeDevice(['Epsilon']), true)).toBe('here');
  });
});

describe('moveProblem', () => {
  it('refuses a move into the folder itself or out of a folder inside the new one', () => {
    expect(moveProblem('!orbis-data/fonts', '!orbis-data/fonts/old')).toBe('inside');
    expect(moveProblem('Fonts/Mine', 'Fonts')).toBe('inside');
    expect(moveProblem('!orbis-data/fonts', 'Fonts')).toBeNull();
    expect(moveProblem('Fonts', 'Fonts')).toBeNull();
  });

  it('is not fooled by a folder whose name only starts the same', () => {
    expect(moveProblem('Fonts', 'Fonts2')).toBeNull();
  });
});

describe('slotsOf', () => {
  it('says which of the four faces a family has', () => {
    expect(
      slotsOf({
        family: 'Test',
        faces: [
          { path: 'a.ttf', weight: 400, italic: false, weightRange: null, width: 100, fsType: 0, subfamily: 'Regular' },
          { path: 'b.ttf', weight: 700, italic: false, weightRange: null, width: 100, fsType: 0, subfamily: 'Bold' },
        ],
      })
    ).toEqual({ regular: true, italic: false, bold: true, boldItalic: false });
  });
});

describe('moveFontsFolder', () => {
  it('renames the whole folder when the new one does not exist', async () => {
    const v = fakeVault([
      'old/Literata/Literata-Regular.ttf',
      'old/Literata/Literata-Bold.ttf',
      'old/Literata/OFL.txt',
    ]);
    expect(await moveFontsFolder(v.app, 'old', 'Assets/Fonts')).toEqual({ moved: 2, skipped: 0, failed: 0 });
    expect(v.moved).toEqual([['old', 'Assets/Fonts']]);
  });

  it('moves each family into a folder that exists, leaves one whose name is taken, and keeps the old folder', async () => {
    const v = fakeVault([
      'old/Literata/Literata-Regular.ttf',
      'old/Lexend/Lexend-Regular.ttf',
      'new/Lexend/Lexend-Regular.ttf',
    ]);
    expect(await moveFontsFolder(v.app, 'old', 'new')).toEqual({ moved: 1, skipped: 1, failed: 0 });
    expect(v.moved).toEqual([['old/Literata', 'new/Literata']]);
    expect(v.trashed).toEqual([]);
    expect(v.has('old/Lexend/Lexend-Regular.ttf')).toBe(true);
  });

  it('removes the old folder once everything has moved out of it', async () => {
    const v = fakeVault(['old/Literata/Literata-Regular.ttf', 'new/readme.md']);
    expect(await moveFontsFolder(v.app, 'old', 'new')).toEqual({ moved: 1, skipped: 0, failed: 0 });
    expect(v.trashed).toEqual(['old']);
  });

  it('moves only the fonts and their licenses out of a folder that holds other things, and keeps that folder', async () => {
    const paths = [
      'Books/A book.epub',
      'Books/Note.md',
      'Books/Loose.ttf',
      'Books/OFL.txt',
      'Books/Literata/Literata-Regular.ttf',
      'Books/Literata/OFL.txt',
      'Books/Mixed/Lexend.TTF',
      'Books/Mixed/Why I like it.md',
      'Books/Licenses/LICENSE.md',
    ];
    for (const there of [[], ['Fonts/readme.md']]) {
      const v = fakeVault([...paths, ...there]);
      expect(await moveFontsFolder(v.app, 'Books', 'Fonts')).toEqual({ moved: 3, skipped: 0, failed: 0 });
      expect(v.moved).toEqual([
        ['Books/Loose.ttf', 'Fonts/Loose.ttf'],
        ['Books/OFL.txt', 'Fonts/OFL.txt'],
        ['Books/Literata', 'Fonts/Literata'],
        ['Books/Mixed/Lexend.TTF', 'Fonts/Mixed/Lexend.TTF'],
      ]);
      expect(v.trashed).toEqual([]);
    }
  });

  it('counts a font that could not be moved, and moves the others', async () => {
    const v = fakeVault(['old/A/A.ttf', 'old/B/B.ttf', 'new/readme.md']);
    const rename = v.app.fileManager.renameFile.bind(v.app.fileManager);
    v.app.fileManager.renameFile = async (f, to) => {
      if (f.path === 'old/A') throw new Error('locked');
      return rename(f, to);
    };
    const said = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await moveFontsFolder(v.app, 'old', 'new')).toEqual({ moved: 1, skipped: 0, failed: 1 });
    expect(said).toHaveBeenCalledOnce();
    said.mockRestore();
  });

  it('does nothing when there is no folder to move, or the move is into itself', async () => {
    const v = fakeVault(['Fonts/Literata/Literata-Regular.ttf']);
    expect(await moveFontsFolder(v.app, 'missing', 'new')).toEqual({ moved: 0, skipped: 0, failed: 0 });
    expect(await moveFontsFolder(v.app, 'Fonts', 'Fonts/inside')).toEqual({ moved: 0, skipped: 0, failed: 0 });
    expect(v.moved).toEqual([]);
  });
});

const face = (family: string, spec: Spec = {}) => fontBytes({ names: { 1: family, 2: 'Regular' }, ...spec });

describe('deleteFontFiles', () => {
  const fontOf = (family: string, ...paths: string[]) => ({
    family,
    faces: paths.map((path) => ({
      path,
      weight: 400,
      italic: false,
      weightRange: null,
      width: 100,
      fsType: 0,
      subfamily: 'Regular',
    })),
  });

  it('trashes a folder that holds only the family and its license, whole, and the one around it', async () => {
    const v = fakeVault(['F/Lit/OFL.txt', 'F/Lit/static/Lit-Regular.ttf', 'F/Lit/static/Lit-Bold.ttf']);
    await deleteFontFiles(v.app, 'F', fontOf('Lit', 'F/Lit/static/Lit-Regular.ttf', 'F/Lit/static/Lit-Bold.ttf'));
    expect(v.trashed).toEqual(['F/Lit']);
  });

  it('trashes only the family’s files from a folder with another font or the reader’s own files in it', async () => {
    for (const other of ['F/G/Bar/Bar.ttf', 'F/G/BAR.TTF', 'F/G/My note.md', 'F/G/deep/er/A book.epub']) {
      const v = fakeVault(['F/G/Foo.ttf', 'F/G/OFL.txt', other]);
      await deleteFontFiles(v.app, 'F', fontOf('Foo', 'F/G/Foo.ttf'));
      expect(v.trashed, other).toEqual(['F/G/Foo.ttf']);
    }
  });

  it('never trashes the fonts folder itself', async () => {
    const v = fakeVault(['F/Foo.ttf', 'F/OFL.txt']);
    await deleteFontFiles(v.app, 'F', fontOf('Foo', 'F/Foo.ttf'));
    expect(v.trashed).toEqual(['F/Foo.ttf']);
  });
});

describe('scanFonts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('finds the other fonts when one file cannot be read or is cut short', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const v = fakeVault([], { 'F/a.ttf': face('Aa'), 'F/b.ttf': null, 'F/c.ttf': face('Cc').slice(0, 100) });
    initFonts({ app: v.app, folder: () => 'F' });
    await scanFonts();
    expect(knownFonts().map((f) => f.family)).toEqual(['Aa']);
    // And finds that file once it can be read.
    v.files['F/b.ttf'] = face('Bb');
    await scanFonts();
    expect(knownFonts().map((f) => f.family)).toEqual(['Aa', 'Bb']);
  });

  it('answers any number of requests during a look with one more look, and tells the listeners once', async () => {
    const v = fakeVault([], { 'G/a.ttf': face('Aa') });
    let looks = 0;
    let told = 0;
    initFonts({
      app: v.app,
      folder: () => {
        looks++;
        return 'G';
      },
    });
    const stop = onFontsChanged(() => told++);
    for (let i = 0; i < 28; i++) void scanFonts();
    await scanFonts();
    stop();
    expect(looks).toBe(2);
    expect(told).toBe(1);
    expect(knownFonts().map((f) => f.family)).toEqual(['Aa']);
  });

  it('looks again when a listener asks while it is told', async () => {
    const v = fakeVault([], { 'H/a.ttf': face('Aa') });
    initFonts({ app: v.app, folder: () => 'H' });
    const stop = onFontsChanged(() => {
      if (knownFonts().length !== 1) return;
      v.files['H/b.ttf'] = face('Bb');
      v.add('H/b.ttf');
      void scanFonts();
    });
    await scanFonts();
    stop();
    expect(knownFonts().map((f) => f.family)).toEqual(['Aa', 'Bb']);
  });

  it('looks through the fonts folder only', async () => {
    const v = fakeVault([], { 'K/a.ttf': face('Aa'), 'Elsewhere/b.ttf': face('Bb') });
    initFonts({ app: v.app, folder: () => 'K' });
    expect((await scanFonts()).map((f) => f.family)).toEqual(['Aa']);
  });
});

describe('useFontIn', () => {
  afterEach(() => vi.restoreAllMocks());

  /** A document that keeps the faces it is given, and one whose faces can be made to fail. */
  function fakeDocument() {
    const faces = new Set<{ weight: string; stretch: string }>();
    const state = { fail: false };
    class FakeFace {
      weight: string;
      stretch: string;
      constructor(_family: string, _data: ArrayBuffer, d: { weight: string; stretch: string }) {
        this.weight = d.weight;
        this.stretch = d.stretch;
      }
      async load() {
        if (state.fail) throw new Error('bad font');
      }
    }
    const fonts = { add: (f: never) => faces.add(f), delete: (f: never) => faces.delete(f) };
    const doc = { defaultView: { FontFace: FakeFace }, fonts } as unknown as Document;
    return { doc, state, given: () => [...faces].map((f) => `${f.weight} ${f.stretch}`).sort() };
  }

  it('gives a face added to the family later, takes back one that is gone, and gives none twice', async () => {
    const v = fakeVault([], { 'M/r.ttf': face('Mm') });
    initFonts({ app: v.app, folder: () => 'M' });
    const d = fakeDocument();
    await Promise.all([useFontIn(d.doc, '"Mm"'), useFontIn(d.doc, '"Mm"')]);
    expect(d.given()).toEqual(['400 100%']);
    v.files['M/b.ttf'] = face('Mm', { weight: 700 });
    v.add('M/b.ttf');
    await scanFonts();
    await useFontIn(d.doc, '"Mm"');
    expect(d.given()).toEqual(['400 100%', '700 100%']);
    await v.app.fileManager.trashFile(v.app.vault.getAbstractFileByPath('M/b.ttf') as TFile);
    await scanFonts();
    await useFontIn(d.doc, '"Mm"');
    expect(d.given()).toEqual(['400 100%']);
  });

  it('tells a Condensed face from the normal one of its family', async () => {
    const v = fakeVault([], { 'N/r.ttf': face('Nn'), 'N/c.ttf': face('Nn', { widthClass: 3 }) });
    initFonts({ app: v.app, folder: () => 'N' });
    const d = fakeDocument();
    await useFontIn(d.doc, '"Nn"');
    expect(d.given()).toEqual(['400 100%', '400 75%']);
  });

  it('tries a face that failed to load again', async () => {
    const v = fakeVault([], { 'P/r.ttf': face('Pp') });
    initFonts({ app: v.app, folder: () => 'P' });
    const d = fakeDocument();
    d.state.fail = true;
    await useFontIn(d.doc, '"Pp"');
    expect(d.given()).toEqual([]);
    d.state.fail = false;
    await useFontIn(d.doc, '"Pp"');
    expect(d.given()).toEqual(['400 100%']);
  });

  it('keeps in memory the files of the fonts being read in, and no others', async () => {
    const v = fakeVault([], { 'Q/a.ttf': face('Qa'), 'Q/b.ttf': face('Qb'), 'Q/c.ttf': face('Qc') });
    initFonts({ app: v.app, folder: () => 'Q' });
    await scanFonts();
    const read = vi.spyOn(v.app.vault, 'readBinary');
    const readsFor = async (value: string, reading: boolean) => {
      read.mockClear();
      await useFontIn(fakeDocument().doc, value, reading);
      return read.mock.calls.length;
    };
    expect(await readsFor('"Qa"', true)).toBe(1);
    expect(await readsFor('"Qa"', true)).toBe(0); // the next chapter
    expect(await readsFor('"Qb"', false)).toBe(1); // a sample in settings
    expect(await readsFor('"Qb"', false)).toBe(1);
    await readsFor('"Qb"', true);
    await readsFor('"Qc"', true);
    expect(await readsFor('"Qa"', true)).toBe(1); // two fonts ago
  });
});
