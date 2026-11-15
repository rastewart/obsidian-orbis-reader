// Which way a file leaves the vault on each device, and that a share leaves nothing behind in the vault.
//
// The routes themselves are native — the save dialog, the share sheet — and were measured on the four devices with
// the share probe. What can go wrong in code is choosing: a button for a route the device lacks, or a desktop answer
// on an iPad, which reports `isMacOS` as true.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ isDesktopApp: false, isMobileApp: true, isMacOS: true }));
vi.mock('obsidian', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  Platform: platform,
}));

import type { App } from 'obsidian';
import { clearShareFolder, outsideButton, outsideRoute, shareFile } from '../outside-vault';
import { augmentDom } from './dom-augment';

/** A vault adapter that remembers what was written, removed and opened, in order. */
function fakeApp(opts: { open?: boolean; files?: string[] } = {}) {
  const files = new Set(opts.files ?? []);
  const folders = new Set<string>();
  const log: string[] = [];
  const adapter = {
    exists: async (p: string) => folders.has(p) || files.has(p) || [...files].some((f) => f.startsWith(`${p}/`)),
    mkdir: async (p: string) => {
      folders.add(p);
      log.push(`mkdir ${p}`);
    },
    list: async (p: string) => ({ files: [...files].filter((f) => f.startsWith(`${p}/`)), folders: [] }),
    remove: async (p: string) => {
      files.delete(p);
      log.push(`remove ${p}`);
    },
    writeBinary: async (p: string) => {
      files.add(p);
      log.push(`write ${p}`);
    },
    ...(opts.open === false
      ? {}
      : {
          open: async (p: string) => {
            log.push(`open ${p}`);
          },
        }),
  };
  const app = { vault: { adapter, configDir: '.obsidian' } } as unknown as App;
  return { app, files, log };
}

const SHARE = '.obsidian/plugins/orbis-reader/share';

describe('outsideRoute', () => {
  beforeEach(() => {
    platform.isDesktopApp = false;
    platform.isMobileApp = true;
    platform.isMacOS = true;
  });

  it('is Share on a phone or tablet whose app can open a file — even one that says it is a Mac', () => {
    expect(outsideRoute(fakeApp().app)).toBe('share');
  });

  it('is nothing on a phone or tablet whose app cannot', () => {
    expect(outsideRoute(fakeApp({ open: false }).app)).toBeNull();
  });

  it('is nothing on a desktop without Electron’s dialog', () => {
    platform.isDesktopApp = true;
    platform.isMobileApp = false;
    expect(outsideRoute(fakeApp().app)).toBeNull();
  });
});

describe('shareFile', () => {
  beforeEach(() => {
    platform.isDesktopApp = false;
    platform.isMobileApp = true;
  });

  it('writes the PDF to the plugin’s share folder, not the vault, and opens it', async () => {
    const { app, log } = fakeApp();
    await shareFile(app, 'Technical Book.pdf', new Uint8Array([37, 80, 68, 70]));
    expect(log).toEqual([`mkdir ${SHARE}`, `write ${SHARE}/Technical Book.pdf`, `open ${SHARE}/Technical Book.pdf`]);
  });

  it('empties the folder of the last share first', async () => {
    const { app, files, log } = fakeApp({ files: [`${SHARE}/Older.pdf`] });
    await shareFile(app, 'New.pdf', new Uint8Array([1]));
    expect(log[0]).toBe(`remove ${SHARE}/Older.pdf`);
    expect([...files]).toEqual([`${SHARE}/New.pdf`]);
  });
});

describe('clearShareFolder', () => {
  it('removes what a share left, and nothing else', async () => {
    const { app, files } = fakeApp({ files: [`${SHARE}/Last.pdf`, 'Books/Kept.pdf'] });
    await clearShareFolder(app);
    expect([...files]).toEqual(['Books/Kept.pdf']);
  });
});

/** Electron's dialog and Node's fs, as `window.require` hands them to the desktop app. */
function fakeDesktop(answer: { canceled: boolean; filePath?: string }) {
  const writes: string[] = [];
  const showSaveDialog = vi.fn(async (_window: unknown, _options: { defaultPath: string }) => answer);
  (window as unknown as { require?: (id: string) => unknown }).require = (id: string) =>
    id === 'electron'
      ? { remote: { dialog: { showSaveDialog }, getCurrentWindow: () => ({}) } }
      : id === 'fs'
        ? { promises: { writeFile: async (path: string) => void writes.push(path) } }
        : undefined;
  return { showSaveDialog, writes };
}

describe('outsideButton', () => {
  beforeEach(() => {
    augmentDom();
    platform.isDesktopApp = true;
    platform.isMobileApp = false;
  });
  afterEach(() => {
    delete (window as unknown as { require?: unknown }).require;
  });

  const spec = (onTarget: (t: unknown) => void) => ({
    disabled: false,
    name: () => 'My Book.epub',
    filter: { name: 'EPUB', extension: 'epub' },
    onTarget,
  });

  it('is Export on a desktop with Electron’s dialog, and comes first, set apart', () => {
    fakeDesktop({ canceled: true });
    expect(outsideRoute(fakeApp().app)).toBe('export');
    const row = document.createElement('div');
    outsideButton(
      row,
      'export',
      spec(() => {})
    );
    const button = row.querySelector('button');
    expect(button?.textContent).toBe('Export…');
    expect(button?.classList.contains('orbis-action-aside')).toBe(true);
  });

  it('asks where with the suggested name, and hands back the chosen path', async () => {
    const { showSaveDialog } = fakeDesktop({ canceled: false, filePath: '/Users/me/Downloads/My Book.epub' });
    const onTarget = vi.fn();
    const row = document.createElement('div');
    outsideButton(row, 'export', spec(onTarget));
    row.querySelector('button')?.click();
    await vi.waitFor(() => expect(onTarget).toHaveBeenCalled());
    expect(showSaveDialog.mock.calls[0]?.[1]).toMatchObject({ defaultPath: 'My Book.epub' });
    expect(onTarget).toHaveBeenCalledWith({ route: 'export', path: '/Users/me/Downloads/My Book.epub' });
  });

  it('hands back nothing when the save dialog is cancelled, so the export dialog stays', async () => {
    const { showSaveDialog } = fakeDesktop({ canceled: true });
    const onTarget = vi.fn();
    const row = document.createElement('div');
    outsideButton(row, 'export', spec(onTarget));
    row.querySelector('button')?.click();
    await vi.waitFor(() => expect(showSaveDialog).toHaveBeenCalled());
    await Promise.resolve();
    expect(onTarget).not.toHaveBeenCalled();
  });

  it('is Share on a phone, with nothing to ask', async () => {
    const onTarget = vi.fn();
    const row = document.createElement('div');
    outsideButton(row, 'share', spec(onTarget));
    expect(row.querySelector('button')?.textContent).toBe('Share…');
    row.querySelector('button')?.click();
    await vi.waitFor(() => expect(onTarget).toHaveBeenCalledWith({ route: 'share' }));
  });

  it('adds nothing where the device has neither route', () => {
    const row = document.createElement('div');
    outsideButton(
      row,
      null,
      spec(() => {})
    );
    expect(row.children.length).toBe(0);
  });
});
