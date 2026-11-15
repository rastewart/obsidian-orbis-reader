// A copied image pasted into a note on Android: the WebView reads its own copy back as an empty PNG, so Orbis puts in
// the PNG it copied. Only that exact paste is taken over — a real image from another app is left to Obsidian.

import type { Plugin } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PNG_BYTES = [137, 80, 78, 71];

type PasteHandler = (evt: unknown, editor: unknown, info: unknown) => void;

/** A plugin whose vault records what is written, and whose paste handler the test calls directly. */
function fakePlugin() {
  let onPaste: PasteHandler = () => {};
  const written = new Map<string, number[]>();
  const plugin = {
    registerEvent: () => {},
    app: {
      loadLocalStorage: () => null,
      workspace: { on: (_name: string, cb: PasteHandler) => ((onPaste = cb), {}) },
      fileManager: {
        getAvailablePathForAttachment: async (name: string) => `attachments/${name}`,
        generateMarkdownLink: (file: { path: string }) => `[[${file.path}]]`,
      },
      vault: {
        createBinary: async (path: string, data: ArrayBuffer) => {
          written.set(path, [...new Uint8Array(data)]);
          return { path };
        },
      },
    },
  };
  return {
    plugin: plugin as unknown as Plugin,
    written,
    paste: (evt: unknown, editor: unknown) => onPaste(evt, editor, { file: { path: 'Note.md' } }),
  };
}

/** A paste carrying `files`, recording whether anything took it over. */
function pasteOf(...files: File[]) {
  return {
    clipboardData: { files },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

const emptyPng = () => new File([], 'image.png', { type: 'image/png' });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('pasting an image Orbis copied', () => {
  let mod: typeof import('../reader/image-copy');
  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../reader/image-copy');
    // A browser enough to copy: an image that decodes, a canvas that encodes, a clipboard that accepts.
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        naturalWidth = 4;
        naturalHeight = 2;
        decode = async () => {};
      }
    );
    vi.stubGlobal('createEl', () => ({
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (resolve: (b: Blob) => void) => resolve(new Blob([new Uint8Array(PNG_BYTES)], { type: 'image/png' })),
    }));
    vi.stubGlobal('ClipboardItem', class {});
    Object.defineProperty(navigator, 'clipboard', { value: { write: async () => {} }, configurable: true });
  });

  it('puts the copy in when the paste carries only an empty PNG', async () => {
    const { plugin, written, paste } = fakePlugin();
    mod.registerCopiedImagePaste(plugin);
    await mod.copyImage('blob:book-image', () => {});
    const editor = { replaceSelection: vi.fn() };
    const evt = pasteOf(emptyPng());
    paste(evt, editor);
    await settle();
    expect(evt.defaultPrevented).toBe(true);
    const [[path, bytes]] = [...written];
    expect(path).toMatch(/^attachments\/Pasted image \d{14}\.png$/);
    expect(bytes).toEqual(PNG_BYTES);
    expect(editor.replaceSelection).toHaveBeenCalledWith(`![[${path}]]`);
  });

  it('leaves a real image from another app to Obsidian', async () => {
    const { plugin, written, paste } = fakePlugin();
    mod.registerCopiedImagePaste(plugin);
    await mod.copyImage('blob:book-image', () => {});
    const evt = pasteOf(new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' }));
    paste(evt, { replaceSelection: vi.fn() });
    await settle();
    expect(evt.defaultPrevented).toBe(false);
    expect(written.size).toBe(0);
  });

  it('leaves an empty PNG alone when Orbis has copied nothing', async () => {
    const { plugin, written, paste } = fakePlugin();
    mod.registerCopiedImagePaste(plugin);
    const evt = pasteOf(emptyPng());
    paste(evt, { replaceSelection: vi.fn() });
    await settle();
    expect(evt.defaultPrevented).toBe(false);
    expect(written.size).toBe(0);
  });
});
