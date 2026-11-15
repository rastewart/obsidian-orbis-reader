import type { DataAdapter } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFonts, FONT_ASSETS, fontsInstalled, loadFonts, removeFonts } from '../pdf-fonts';

const requestUrl = vi.hoisted(() => vi.fn());
vi.mock('obsidian', () => ({ requestUrl }));

/** An in-memory stand-in for the vault adapter — enough of it for a cache that reads, writes and deletes. */
function fakeAdapter(): DataAdapter & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    exists: async (p: string) => files.has(p) || p === 'dir',
    mkdir: async () => undefined,
    writeBinary: async (p: string, b: ArrayBuffer) => void files.set(p, new Uint8Array(b)),
    readBinary: async (p: string) => {
      const found = files.get(p);
      if (!found) throw new Error(`missing ${p}`);
      return found.buffer as ArrayBuffer;
    },
    remove: async (p: string) => void files.delete(p),
  } as unknown as DataAdapter & { files: Map<string, Uint8Array> };
}

describe('the font cache', () => {
  beforeEach(() => {
    requestUrl.mockReset();
  });

  it('reports the set as missing until every face is there', async () => {
    const adapter = fakeAdapter();
    expect(await fontsInstalled(adapter, 'dir')).toBe(false);
    for (const asset of FONT_ASSETS.slice(0, -1)) adapter.files.set(`dir/${asset.file}`, new Uint8Array([1]));
    // Six of seven is not "installed": a partial set would embed some faces and fall back for others, mid-page.
    expect(await fontsInstalled(adapter, 'dir')).toBe(false);
    adapter.files.set(`dir/${FONT_ASSETS.at(-1)?.file}`, new Uint8Array([1]));
    expect(await fontsInstalled(adapter, 'dir')).toBe(true);
  });

  it('REFUSES bytes whose hash is not the one it asked for, and caches nothing', async () => {
    // These bytes are fetched from a CDN and then embedded in a document someone sends to another person.
    // Pinning the version says which file we asked for; the hash is what says we got it.
    const adapter = fakeAdapter();
    requestUrl.mockResolvedValue({ arrayBuffer: new TextEncoder().encode('not a font').buffer });
    await expect(downloadFonts(adapter, 'dir')).rejects.toThrow(/unexpected contents/);
    expect(adapter.files.size).toBe(0);
  });

  it('fetches only the faces that are missing', async () => {
    // 3.1 MB is not something to download again because six of seven files are already here.
    const adapter = fakeAdapter();
    for (const asset of FONT_ASSETS.slice(1)) adapter.files.set(`dir/${asset.file}`, new Uint8Array([1]));
    requestUrl.mockResolvedValue({ arrayBuffer: new TextEncoder().encode('not a font').buffer });
    await expect(downloadFonts(adapter, 'dir')).rejects.toThrow();
    expect(requestUrl).toHaveBeenCalledTimes(1);
    expect(String((requestUrl.mock.calls[0][0] as { url: string }).url)).toContain(FONT_ASSETS[0].file);
  });

  it('reports progress per face, so a slow connection has something to show', async () => {
    const adapter = fakeAdapter();
    for (const asset of FONT_ASSETS) adapter.files.set(`dir/${asset.file}`, new Uint8Array([1]));
    const seen: number[] = [];
    await downloadFonts(adapter, 'dir', (done) => seen.push(done));
    expect(seen).toEqual(FONT_ASSETS.map((_, i) => i + 1));
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it('loads nothing at all when one face is missing', async () => {
    // The signal to fall back to the built-in fonts. Half an alphabet is not a usable state.
    const adapter = fakeAdapter();
    for (const asset of FONT_ASSETS.slice(1)) adapter.files.set(`dir/${asset.file}`, new Uint8Array([1]));
    expect(await loadFonts(adapter, 'dir')).toBeUndefined();
  });

  it('loads every face, keyed by the slot that draws it', async () => {
    const adapter = fakeAdapter();
    for (const asset of FONT_ASSETS) adapter.files.set(`dir/${asset.file}`, new Uint8Array([7]));
    const loaded = await loadFonts(adapter, 'dir');
    expect(Object.keys(loaded ?? {}).sort()).toEqual(FONT_ASSETS.map((a) => a.slot).sort());
  });

  it('gives the space back', async () => {
    const adapter = fakeAdapter();
    for (const asset of FONT_ASSETS) adapter.files.set(`dir/${asset.file}`, new Uint8Array([1]));
    await removeFonts(adapter, 'dir');
    expect(adapter.files.size).toBe(0);
  });
});
