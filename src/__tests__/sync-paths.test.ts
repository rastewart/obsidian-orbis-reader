// The name IS the identity, so the parse is the part that has to be strict: a vault is full of other people's JSON,
// and one of ours can be anywhere in it.

import { describe, expect, it } from 'vitest';
import { DEFAULT_SYNC_FOLDER, parseSyncFileName, syncFileName, syncFilePath, syncFolderOf } from '../sync/paths';

describe('syncFolderOf', () => {
  it('falls back to the default', () => {
    expect(syncFolderOf(undefined)).toBe(DEFAULT_SYNC_FOLDER);
    expect(syncFolderOf('')).toBe(DEFAULT_SYNC_FOLDER);
    expect(syncFolderOf('   ')).toBe(DEFAULT_SYNC_FOLDER);
  });

  it('takes what the reader set, without their trailing slash', () => {
    expect(syncFolderOf(' Orbis/Sync/ ')).toBe('Orbis/Sync');
  });
});

describe('the file name', () => {
  it('round-trips', () => {
    const name = syncFileName('dashboards', 'dashboard-a1b2c3', 'macbook-7f3a91');
    expect(name).toBe('orbis-sync.dashboards.dashboard-a1b2c3.macbook-7f3a91.json');
    expect(parseSyncFileName(name)).toEqual({
      type: 'dashboards',
      itemId: 'dashboard-a1b2c3',
      deviceId: 'macbook-7f3a91',
    });
  });

  it('keeps an item id that has dots in it', () => {
    const name = syncFileName('glossary', 'a.b.c', 'phone-1');
    expect(parseSyncFileName(name)).toEqual({ type: 'glossary', itemId: 'a.b.c', deviceId: 'phone-1' });
  });

  it('goes in the configured folder, and in the default when there is none', () => {
    expect(syncFilePath('Orbis/Sync', 'dashboards', 'd1', 'mac')).toBe('Orbis/Sync/orbis-sync.dashboards.d1.mac.json');
    expect(syncFilePath('', 'dashboards', 'd1', 'mac')).toBe(
      `${DEFAULT_SYNC_FOLDER}/orbis-sync.dashboards.d1.mac.json`
    );
  });
});

describe('parseSyncFileName says no to', () => {
  // Each of these sits in a real vault, and the by-name scan reads every file it says yes to.
  it.each([
    ['a reading-location file', 'Sample.location.macbook-7f3a91.json'],
    ['a library collection file', 'orbis-collection-9x8y7z.json'],
    ['someone else’s JSON', 'package.json'],
    ['our prefix with nothing after it', 'orbis-sync..json'],
    ['a type but no item', 'orbis-sync.dashboards.json'],
    ['an item but no device', 'orbis-sync.dashboards.d1.json'],
    ['an empty device', 'orbis-sync.dashboards.d1..json'],
    ['an empty type', 'orbis-sync..d1.mac.json'],
    ['a note that only looks like one', 'orbis-sync.dashboards.d1.mac.md'],
  ])('%s', (_what, name) => {
    expect(parseSyncFileName(name)).toBeNull();
  });
});
