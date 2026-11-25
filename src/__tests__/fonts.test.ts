// The fonts library's rules: where the folder is, how a vault font is named in a display style, what the Font list
// offers, and when the folder may not move.

import { type App, TFile, TFolder } from 'obsidian';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FONTS_FOLDER,
  familyOfValue,
  fontChoices,
  fontsFolderOf,
  moveFontsFolder,
  moveProblem,
  SYSTEM_FONTS,
  slotsOf,
  systemFontStatus,
  vaultFontValue,
} from '../fonts';

describe('fontsFolderOf', () => {
  it('uses the default for an empty or root setting, and trims a trailing slash', () => {
    expect(fontsFolderOf('')).toBe(DEFAULT_FONTS_FOLDER);
    expect(fontsFolderOf(undefined)).toBe(DEFAULT_FONTS_FOLDER);
    expect(fontsFolderOf('/')).toBe(DEFAULT_FONTS_FOLDER);
    expect(fontsFolderOf('Assets/Fonts/')).toBe('Assets/Fonts');
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
          { path: 'a.ttf', weight: 400, italic: false, weightRange: null, fsType: 0, subfamily: 'Regular' },
          { path: 'b.ttf', weight: 700, italic: false, weightRange: null, fsType: 0, subfamily: 'Bold' },
        ],
      })
    ).toEqual({ regular: true, italic: false, bold: true, boldItalic: false });
  });
});

describe('moveFontsFolder', () => {
  /** A vault of paths, with Obsidian's folder tree built from them, and a file manager that renames. */
  function fakeVault(paths: string[]) {
    const items = new Map<string, TFile | TFolder>();
    const folder = (path: string): TFolder => {
      const known = items.get(path);
      if (known instanceof TFolder) return known;
      const f = Object.assign(new TFolder(), { path, name: path.split('/').pop() ?? path });
      items.set(path, f);
      const at = path.lastIndexOf('/');
      if (at > 0) folder(path.slice(0, at)).children.push(f);
      return f;
    };
    for (const path of paths) {
      const at = path.lastIndexOf('/');
      const parent = folder(path.slice(0, at));
      const name = path.slice(at + 1);
      const file = Object.assign(new TFile(), { path, name, extension: name.split('.').pop() ?? '', parent });
      parent.children.push(file);
      items.set(path, file);
    }
    const moved: [string, string][] = [];
    const trashed: string[] = [];
    const detach = (entry: TFile | TFolder) => {
      for (const f of items.values()) if (f instanceof TFolder) f.children = f.children.filter((c) => c !== entry);
    };
    const app = {
      vault: {
        getAbstractFileByPath: (p: string) => items.get(p) ?? null,
        createFolder: async (p: string) => folder(p),
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
    return { app, moved, trashed, has: (p: string) => items.has(p) };
  }

  it('renames the whole folder when the new one does not exist', async () => {
    const v = fakeVault([
      'old/Literata/Literata-Regular.ttf',
      'old/Literata/Literata-Bold.ttf',
      'old/Literata/OFL.txt',
    ]);
    expect(await moveFontsFolder(v.app, 'old', 'Assets/Fonts')).toEqual({ moved: 2, skipped: 0 });
    expect(v.moved).toEqual([['old', 'Assets/Fonts']]);
  });

  it('moves each family into a folder that exists, leaves one whose name is taken, and keeps the old folder', async () => {
    const v = fakeVault([
      'old/Literata/Literata-Regular.ttf',
      'old/Lexend/Lexend-Regular.ttf',
      'new/Lexend/Lexend-Regular.ttf',
    ]);
    expect(await moveFontsFolder(v.app, 'old', 'new')).toEqual({ moved: 1, skipped: 1 });
    expect(v.moved).toEqual([['old/Literata', 'new/Literata']]);
    expect(v.trashed).toEqual([]);
    expect(v.has('old/Lexend/Lexend-Regular.ttf')).toBe(true);
  });

  it('removes the old folder once everything has moved out of it', async () => {
    const v = fakeVault(['old/Literata/Literata-Regular.ttf', 'new/readme.md']);
    expect(await moveFontsFolder(v.app, 'old', 'new')).toEqual({ moved: 1, skipped: 0 });
    expect(v.trashed).toEqual(['old']);
  });

  it('does nothing when there is no folder to move, or the move is into itself', async () => {
    const v = fakeVault(['Fonts/Literata/Literata-Regular.ttf']);
    expect(await moveFontsFolder(v.app, 'missing', 'new')).toEqual({ moved: 0, skipped: 0 });
    expect(await moveFontsFolder(v.app, 'Fonts', 'Fonts/inside')).toEqual({ moved: 0, skipped: 0 });
    expect(v.moved).toEqual([]);
  });
});
