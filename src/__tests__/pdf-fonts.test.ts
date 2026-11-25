// Where the PDF export finds DejaVu: the vault's fonts folder first, the old per-device cache until then, and the old
// cache let go once the vault has all seven faces. And the download that puts them there: pinned, and refused whole.

import { zipSync } from 'fflate';
import { type App, TFile, TFolder } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FONT_PACKAGES, installFontZip, packageInstalled } from '../font-downloads';
import { gatherImport } from '../font-import';
import { FONT_PINS } from '../font-pins';
import type { VaultFont } from '../fonts';
import { downloadPdfFonts, FONT_ASSETS, forgetLegacyPdfFonts, loadPdfFonts, pdfFontsReady } from '../pdf-fonts';
import { fontBytes } from './font-bytes';

const requestUrl = vi.hoisted(() => vi.fn());
vi.mock('obsidian', async (original) => ({ ...(await original<typeof import('obsidian')>()), requestUrl }));

// Node's own modules at run time, since the plugin's tsconfig has no Node types (see `asset-integrity.test.ts`).
declare const process: {
  getBuiltinModule(id: 'node:fs'): { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array };
};
const fs = process.getBuiltinModule('node:fs');

const LEGACY = '.obsidian/plugins/orbis-reader/font-cache';

/** A vault of files, and the device's own plugin folder beside it — enough of both for these. */
function fakeApp() {
  const vault = new Map<string, Uint8Array>();
  const device = new Map<string, Uint8Array>();
  const folders = new Set<string>();
  const fileOf = (path: string) => {
    const name = path.slice(path.lastIndexOf('/') + 1);
    const data = vault.get(path) as Uint8Array;
    // Dated by what is in it, so a file that changes is a newer one.
    const stat = { ctime: 0, mtime: data.reduce((n, b) => n + b, 0), size: data.length };
    return Object.assign(new TFile(), { path, name, extension: name.split('.').pop() ?? '', stat });
  };
  /** A folder of every file under it: deep enough for a look through it. */
  const folderOf = (path: string) =>
    Object.assign(new TFolder(), {
      path,
      children: [...vault.keys()].filter((k) => k.startsWith(`${path}/`)).map(fileOf),
    });
  const app = {
    vault: {
      configDir: '.obsidian',
      getAbstractFileByPath: (p: string) =>
        vault.has(p)
          ? fileOf(p)
          : folders.has(p) || [...vault.keys()].some((k) => k.startsWith(`${p}/`))
            ? folderOf(p)
            : null,
      createFolder: async (p: string) => void folders.add(p),
      createBinary: async (p: string, d: ArrayBuffer) => void vault.set(p, new Uint8Array(d)),
      modifyBinary: async (f: TFile, d: ArrayBuffer) => void vault.set(f.path, new Uint8Array(d)),
      readBinary: async (f: TFile) => (vault.get(f.path) as Uint8Array).slice().buffer,
      adapter: {
        exists: async (p: string) => device.has(p) || [...device.keys()].some((k) => k.startsWith(`${p}/`)),
        readBinary: async (p: string) => {
          const found = device.get(p);
          if (!found) throw new Error(`missing ${p}`);
          return found.slice().buffer;
        },
        rmdir: async (p: string) => {
          for (const k of [...device.keys()]) if (k.startsWith(`${p}/`)) device.delete(k);
        },
      },
    },
  } as unknown as App;
  return { app, vault, device };
}

/** A whole font, told from another by its weight. */
const font = (weight: number) => fontBytes({ weight });

const allSeven = (into: Map<string, Uint8Array>, dir: string, weight: number) => {
  for (const a of FONT_ASSETS) into.set(`${dir}/${a.file}`, font(weight));
};

describe('where the PDF export finds DejaVu', () => {
  beforeEach(() => requestUrl.mockReset());

  it('is ready only with all seven faces, anywhere in the fonts folder', async () => {
    const { app, vault } = fakeApp();
    expect(await pdfFontsReady(app, '')).toBe(false);
    for (const a of FONT_ASSETS.slice(0, -1)) vault.set(`!orbis-data/fonts/DejaVu/${a.file}`, font(1));
    // Six of seven is not ready: a partial set would embed some faces and fall back for others, mid-page.
    expect(await pdfFontsReady(app, '')).toBe(false);
    vault.set(`!orbis-data/fonts/Moved by hand/${FONT_ASSETS.at(-1)?.file}`, font(1));
    expect(await pdfFontsReady(app, '')).toBe(true);
  });

  it('follows the fonts folder setting', async () => {
    const { app, vault } = fakeApp();
    allSeven(vault, 'Assets/Fonts/DejaVu', 1);
    expect(await pdfFontsReady(app, '')).toBe(false);
    expect(await pdfFontsReady(app, 'Assets/Fonts')).toBe(true);
  });

  it('uses the old cache until the vault has them, and the vault once it does', async () => {
    const { app, vault, device } = fakeApp();
    allSeven(device, LEGACY, 2);
    expect(await pdfFontsReady(app, '')).toBe(true);
    expect((await loadPdfFonts(app, ''))?.body).toEqual(font(2));
    allSeven(vault, '!orbis-data/fonts/DejaVu', 3);
    expect((await loadPdfFonts(app, ''))?.body).toEqual(font(3));
  });

  it('does not count a set with a file cut short, and keeps using the old cache until it is whole', async () => {
    const { app, vault, device } = fakeApp();
    allSeven(device, LEGACY, 2);
    allSeven(vault, '!orbis-data/fonts/DejaVu', 3);
    vault.set('!orbis-data/fonts/DejaVu/DejaVuSans.ttf', font(3).slice(0, 90));
    expect((await loadPdfFonts(app, ''))?.body).toEqual(font(2));
    await forgetLegacyPdfFonts(app, '');
    expect(device.size).toBe(7);
    device.clear();
    expect(await pdfFontsReady(app, '')).toBe(false);
    expect(await loadPdfFonts(app, '')).toBeUndefined();
  });

  it('loads nothing when no complete set is anywhere — the signal to use the built-in fonts', async () => {
    const { app, device } = fakeApp();
    for (const a of FONT_ASSETS.slice(1)) device.set(`${LEGACY}/${a.file}`, new Uint8Array([1]));
    expect(await loadPdfFonts(app, '')).toBeUndefined();
  });

  it('lets the old cache go only once the vault has every face', async () => {
    const { app, vault, device } = fakeApp();
    allSeven(device, LEGACY, 2);
    await forgetLegacyPdfFonts(app, '');
    expect(device.size).toBe(7);
    allSeven(vault, '!orbis-data/fonts/DejaVu', 3);
    await forgetLegacyPdfFonts(app, '');
    expect(device.size).toBe(0);
  });

  it('refuses a download that is not the pinned zip, and writes nothing', async () => {
    const { app, vault, device } = fakeApp();
    allSeven(device, LEGACY, 2);
    requestUrl.mockResolvedValue({ arrayBuffer: new TextEncoder().encode('not the zip').buffer });
    await expect(downloadPdfFonts(app, '')).rejects.toThrow(/unexpected contents/);
    expect(vault.size).toBe(0);
    expect(device.size).toBe(7);
    expect(String((requestUrl.mock.calls[0][0] as { url: string }).url)).toMatch(/releases\/download\/fonts\/dejavu-/);
  });
});

describe('the downloads', () => {
  it('offers every pinned zip, and pins every one it offers', () => {
    expect(FONT_PACKAGES.map((p) => p.id).sort()).toEqual(Object.keys(FONT_PINS).sort());
  });

  it('unpacks a zip into the fonts folder, keeping its folders', async () => {
    const { app, vault } = fakeApp();
    const zip = zipSync({
      'Literata/Literata-Regular.ttf': new Uint8Array([1]),
      'Literata/OFL.txt': new TextEncoder().encode('license'),
    });
    const written = await installFontZip(app, zip, 'Assets/Fonts');
    expect(written.sort()).toEqual(['Assets/Fonts/Literata/Literata-Regular.ttf', 'Assets/Fonts/Literata/OFL.txt']);
    expect(vault.get('Assets/Fonts/Literata/Literata-Regular.ttf')).toEqual(new Uint8Array([1]));
  });

  /**
   * A package as the vault has it, whole. Each face's file is named as DejaVu names its own — the family without
   * spaces, then the face: `DejaVuSerif-BoldItalic.ttf` — so DejaVu's are the files the PDF export looks for.
   */
  const whole = (id: string): VaultFont[] => {
    const pkg = FONT_PACKAGES.find((p) => p.id === id);
    if (!pkg) throw new Error(`no ${id}`);
    const fileOf = (family: string, slot: string) =>
      `${family.replace(/ /g, '')}${slot === 'regular' ? '' : `-${slot[0].toUpperCase()}${slot.slice(1)}`}.ttf`;
    return Object.entries(pkg.families).map(([family, slots]) => ({
      family,
      faces: slots.map((slot) => ({
        path: `F/${fileOf(family, slot)}`,
        weight: slot.startsWith('bold') ? 700 : 400,
        italic: /italic/i.test(slot),
        weightRange: null,
        width: 100,
        fsType: 0,
        subfamily: slot,
      })),
    }));
  };
  const installed = (id: string, fonts: VaultFont[]) => {
    const pkg = FONT_PACKAGES.find((p) => p.id === id);
    return !!pkg && packageInstalled(pkg, fonts);
  };

  it('counts a package as downloaded when every face of every one of its families is in the vault', () => {
    for (const { id } of FONT_PACKAGES) {
      const fonts = whole(id);
      expect(installed(id, fonts), id).toBe(true);
      expect(installed(id, fonts.slice(1)), `${id} without a family`).toBe(false);
      fonts.forEach((font, f) => {
        font.faces.forEach((face, i) => {
          const less = fonts.map((x, n) => (n === f ? { ...x, faces: x.faces.filter((_face, j) => j !== i) } : x));
          expect(installed(id, less), `${id} without ${font.family} ${face.subfamily}`).toBe(false);
        });
      });
    }
  });

  it('counts a family however it got there, in any case and as variable files', () => {
    const [literata] = whole('literata');
    const variable = [false, true].map((italic) => ({
      ...literata.faces[0],
      path: `F/Literata${italic ? '-Italic' : ''}[opsz,wght].ttf`,
      italic,
      weightRange: [200, 900] as [number, number],
    }));
    expect(installed('literata', [{ family: 'LITERATA', faces: variable }])).toBe(true);
  });

  // The zips are built by `pnpm build:fonts`, and git ignores them: where they are, as before an end-to-end run.
  it.skipIf(!fs.existsSync('dist/fonts'))('counts each zip of the fonts release, once unpacked, as downloaded', () => {
    for (const { id } of FONT_PACKAGES) {
      const zip = { name: 'font.zip', data: new Uint8Array(fs.readFileSync(`dist/fonts/${FONT_PINS[id].zip}`)) };
      const fonts = gatherImport([zip]).families.map(({ family, files }) => ({
        family,
        faces: files.map((f) => ({ path: `F/${f.name}`, ...f.info })),
      }));
      expect(installed(id, fonts), id).toBe(true);
    }
  });

  it('counts DejaVu only with the files the PDF export finds by name', () => {
    const fonts = whole('dejavu');
    const names = fonts.flatMap((f) => f.faces.map((face) => face.path.slice(2)));
    expect(names.sort()).toEqual([...(FONT_PACKAGES.find((p) => p.id === 'dejavu')?.files ?? [])].sort());
    fonts[0].faces[0].path = 'F/Renamed.ttf';
    expect(installed('dejavu', fonts)).toBe(false);
  });
});
