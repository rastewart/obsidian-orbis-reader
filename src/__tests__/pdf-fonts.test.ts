// Where the PDF export finds DejaVu: the vault's fonts folder first, the old per-device cache until then, and the old
// cache let go once the vault has all seven faces. And the download that puts them there: pinned, and refused whole.

import { zipSync } from 'fflate';
import { type App, TFile } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FONT_PACKAGES, installFontZip, packageInstalled } from '../font-downloads';
import { FONT_PINS } from '../font-pins';
import { downloadPdfFonts, FONT_ASSETS, forgetLegacyPdfFonts, loadPdfFonts, pdfFontsReady } from '../pdf-fonts';

const requestUrl = vi.hoisted(() => vi.fn());
vi.mock('obsidian', async (original) => ({ ...(await original<typeof import('obsidian')>()), requestUrl }));

const LEGACY = '.obsidian/plugins/orbis-reader/font-cache';

/** A vault of files, and the device's own plugin folder beside it — enough of both for these. */
function fakeApp() {
  const vault = new Map<string, Uint8Array>();
  const device = new Map<string, Uint8Array>();
  const folders = new Set<string>();
  const fileOf = (path: string) => {
    const name = path.slice(path.lastIndexOf('/') + 1);
    return Object.assign(new TFile(), { path, name, extension: name.split('.').pop() ?? '' });
  };
  const app = {
    vault: {
      configDir: '.obsidian',
      getFiles: () => [...vault.keys()].map(fileOf),
      getAbstractFileByPath: (p: string) => (vault.has(p) ? fileOf(p) : folders.has(p) ? {} : null),
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

const allSeven = (into: Map<string, Uint8Array>, dir: string, byte: number) => {
  for (const a of FONT_ASSETS) into.set(`${dir}/${a.file}`, new Uint8Array([byte]));
};

describe('where the PDF export finds DejaVu', () => {
  beforeEach(() => requestUrl.mockReset());

  it('is ready only with all seven faces, anywhere in the fonts folder', async () => {
    const { app, vault } = fakeApp();
    expect(await pdfFontsReady(app, '')).toBe(false);
    for (const a of FONT_ASSETS.slice(0, -1)) vault.set(`!orbis-data/fonts/DejaVu/${a.file}`, new Uint8Array([1]));
    // Six of seven is not ready: a partial set would embed some faces and fall back for others, mid-page.
    expect(await pdfFontsReady(app, '')).toBe(false);
    vault.set(`!orbis-data/fonts/Moved by hand/${FONT_ASSETS.at(-1)?.file}`, new Uint8Array([1]));
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
    expect((await loadPdfFonts(app, ''))?.body).toEqual(new Uint8Array([2]));
    allSeven(vault, '!orbis-data/fonts/DejaVu', 3);
    expect((await loadPdfFonts(app, ''))?.body).toEqual(new Uint8Array([3]));
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
      'Literata/OFL.txt': new TextEncoder().encode('licence'),
    });
    const written = await installFontZip(app, zip, 'Assets/Fonts');
    expect(written.sort()).toEqual(['Assets/Fonts/Literata/Literata-Regular.ttf', 'Assets/Fonts/Literata/OFL.txt']);
    expect(vault.get('Assets/Fonts/Literata/Literata-Regular.ttf')).toEqual(new Uint8Array([1]));
  });

  it('counts a package as downloaded when every one of its families is in the vault', () => {
    const dejavu = FONT_PACKAGES.find((p) => p.id === 'dejavu');
    if (!dejavu) throw new Error('no DejaVu');
    const font = (family: string) => ({ family, faces: [] });
    expect(packageInstalled(dejavu, [font('DejaVu Serif'), font('DejaVu Sans')])).toBe(false);
    expect(packageInstalled(dejavu, [font('DejaVu Serif'), font('DejaVu Sans'), font('dejavu sans mono')])).toBe(true);
  });
});
