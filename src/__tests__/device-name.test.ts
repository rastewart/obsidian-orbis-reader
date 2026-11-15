// Naming a device: the suggestion has to be usable as it stands, and it must not hand two devices one name.

import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { freeDeviceName, takenDeviceNames } from '../device-name';

describe('freeDeviceName', () => {
  it('uses the plain name when nobody has it', () => {
    expect(freeDeviceName('Mac', [])).toBe('Mac');
    expect(freeDeviceName('Mac', ['iPad', 'Android phone'])).toBe('Mac');
  });

  it('numbers from 2, so the first device never has to be renamed', () => {
    expect(freeDeviceName('Mac', ['Mac'])).toBe('Mac 2');
    expect(freeDeviceName('Mac', ['Mac', 'Mac 2'])).toBe('Mac 3');
  });

  it('does not care about case or stray space — one name to the person reading the list', () => {
    expect(freeDeviceName('Mac', ['  mac '])).toBe('Mac 2');
  });

  it('skips a number already in use, rather than counting past it', () => {
    expect(freeDeviceName('Mac', ['Mac', 'Mac 3'])).toBe('Mac 2');
  });

  it('ignores blank names', () => {
    expect(freeDeviceName('Mac', ['', '   '])).toBe('Mac');
  });
});

function fakeVault(files: Record<string, string>): App {
  return {
    vault: {
      getFiles: () => Object.keys(files).map((path) => ({ path, name: path.slice(path.lastIndexOf('/') + 1) })),
      adapter: { read: (path: string) => Promise.resolve(files[path] ?? '') },
    },
  } as unknown as App;
}

describe('takenDeviceNames', () => {
  it('reads one file per device, not one per book', async () => {
    const reads: string[] = [];
    const files = {
      'p/Sample.location.mac1.json': JSON.stringify({ deviceName: 'Mac' }),
      'p/Emma.location.mac1.json': JSON.stringify({ deviceName: 'Mac' }),
      'p/Sample.location.phone2.json': JSON.stringify({ deviceName: 'iPhone' }),
    };
    const app = fakeVault(files);
    const spied = {
      ...app,
      vault: {
        ...app.vault,
        adapter: {
          read: (path: string) => {
            reads.push(path);
            return Promise.resolve(files[path as keyof typeof files] ?? '');
          },
        },
      },
    } as unknown as App;
    expect((await takenDeviceNames(spied)).sort()).toEqual(['Mac', 'iPhone']);
    expect(reads).toHaveLength(2); // two devices, three files
  });

  it('ignores files that are not location files, and names it cannot read', async () => {
    const app = fakeVault({
      'p/Sample.location.mac1.json': 'not json',
      'p/notes.md': '# hello',
      'p/orbis-sync.dashboards.d1.mac1.json': JSON.stringify({ id: 'd1' }),
      'p/Emma.location.pad3.json': JSON.stringify({ deviceName: 'iPad' }),
      'p/Kim.location.pad4.json': JSON.stringify({ deviceName: '   ' }),
    });
    expect(await takenDeviceNames(app)).toEqual(['iPad']);
  });
});
