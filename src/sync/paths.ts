// What a published copy is called, and how to read a file name back apart.
//
// **The name is the identity; the folder is a preference.** A device that has never been configured cannot be told
// where to look — the folder is a setting, and a setting arrives by the very mechanism that has to find these files
// first. So every fact the merge needs is in the name: which kind of thing this is, which item, and which device
// published it. Move the folder, move one file into a subfolder by hand, sync it to a device that keeps its vault
// laid out differently: it is still found, because finding it never depended on where it was.
//
// That is the same rule the library's configuration files arrived at (`library/config-store.ts`), for the same
// reason, and it is why the parse below is strict about its prefix: the vault is full of other people's `.json`.

/** Where copies are put when nothing says otherwise. A folder, not a home: they are found by name wherever they are. */
export const DEFAULT_SYNC_FOLDER = '!orbis-data/sync';

/**
 * What marks a file as one of ours.
 *
 * Reading-location files are `<book>.location.<deviceId>.json` and the library's are `orbis-collection-<id>.json`;
 * a vault will hold plenty more `.json` besides. A prefix nothing else uses is what makes "is this mine?" a question
 * about the name rather than about the folder it happened to be in.
 */
const SYNC_PREFIX = 'orbis-sync.';

/** The folder to write into: what the reader set, or the default. Trailing slashes go, so the join stays clean. */
export function syncFolderOf(setting: string | undefined): string {
  const trimmed = (setting ?? '').trim().replace(/\/+$/, '');
  return trimmed || DEFAULT_SYNC_FOLDER;
}

/**
 * `orbis-sync.<type>.<itemId>.<deviceId>.json`
 *
 * Dots separate the three, and the device id is last so the parse can find it without knowing what an item id may
 * contain. The type comes first because it is the one part that is ours alone — a type never contains a dot, so the
 * name can be taken apart from both ends and whatever is left in the middle is the item, however it is spelt.
 */
export function syncFileName(type: string, itemId: string, deviceId: string): string {
  return `${SYNC_PREFIX}${type}.${itemId}.${deviceId}.json`;
}

/**
 * Whether `id` can sit in the middle of a file name: not empty, and no separator of either kind (Windows reads `\` as
 * one). Every id Orbis mints passes; one read from a file someone else wrote may not, and it would become a path.
 */
export function isSyncItemId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && !/[/\\]/.test(id);
}

/** Where a copy goes when there is not one already: the configured folder, under its own name. */
export function syncFilePath(folder: string, type: string, itemId: string, deviceId: string): string {
  const at = syncFolderOf(folder);
  return `${at}/${syncFileName(type, itemId, deviceId)}`;
}

/**
 * Read a file name apart, or null if it is not one of ours.
 *
 * **Both ends first, the middle last.** The type is the first segment and the device the last; an item id containing
 * a dot — a settings item named for what it holds, a glossary entry named for a word — then keeps its dots instead of
 * having the parse silently take the tail of it for a device.
 */
export function parseSyncFileName(name: string): { type: string; itemId: string; deviceId: string } | null {
  if (!name.startsWith(SYNC_PREFIX) || !name.endsWith('.json')) return null;
  const stem = name.slice(SYNC_PREFIX.length, -'.json'.length);
  const firstDot = stem.indexOf('.');
  const lastDot = stem.lastIndexOf('.');
  // Three parts at minimum, and none of them empty: `type.item.device`.
  if (firstDot <= 0 || lastDot <= firstDot || lastDot === stem.length - 1) return null;
  return {
    type: stem.slice(0, firstDot),
    itemId: stem.slice(firstDot + 1, lastDot),
    deviceId: stem.slice(lastDot + 1),
  };
}
