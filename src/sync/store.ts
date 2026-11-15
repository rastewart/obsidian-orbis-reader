// Reading and writing the published copies — the only part of sync that touches a vault.
//
// Behind an interface so the engine above it can be tested without one. That is not ceremony: the engine's job is to
// decide what to write, and a test that has to build a vault to ask "did it write twice?" is a test nobody writes.
//
// **Found by name, written to a folder.** Discovery walks the vault for names that parse (see `paths.ts`), so a copy
// is found wherever it is — moved by hand, arriving from a device that keeps its vault laid out differently, or left
// behind by a change to the folder setting. New copies go where the setting says.
//
// See docs/design/multi-device-sync.md.

import { type App, normalizePath } from 'obsidian';
import { isSyncItemId, parseSyncFileName, syncFileName, syncFilePath, syncFolderOf } from './paths';
import type { SyncRecord } from './records';

/**
 * The folder this vault already publishes into, or null when nothing has been published yet.
 *
 * **For turning publishing on, and only for that** — the setup dialog's prefill, and `folderToJoin`. On a second
 * device the folder is a question that has already been answered — asking it as though it were open invites a
 * different answer, and then two devices write into two folders until the setting itself travels. Nothing else needs
 * this: the scan finds copies by name wherever they are.
 *
 * The commonest folder wins, so one file moved by hand does not redirect a device.
 */
export function publishedFolder(app: App): string | null {
  const counts = new Map<string, number>();
  for (const file of app.vault.getFiles()) {
    if (!parseSyncFileName(file.name)) continue;
    const folder = file.path.slice(0, file.path.lastIndexOf('/'));
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  let best: string | null = null;
  let most = 0;
  for (const [folder, count] of counts) {
    if (count > most) {
      best = folder;
      most = count;
    }
  }
  return best;
}

/**
 * The folder a device turning publishing on should write into — or undefined to keep the setting it has.
 *
 * An answer from the setup dialog wins. Otherwise a device that has **no folder of its own** joins the one the vault
 * already publishes into, as the dialog would have offered: the switch on the Devices page asks nothing, and a
 * device set up with configuration left off never answered the question. Without this it wrote to the default
 * folder beside the others' until the setting travelled.
 *
 * A folder this device already holds is kept, even when most files sit elsewhere: that is a choice someone made on
 * the Devices page, and old copies left behind by changing it would otherwise outvote it.
 */
export function folderToJoin(
  answered: string | undefined,
  own: string | undefined,
  published: string | null
): string | undefined {
  if (answered !== undefined) return answered;
  if ((own ?? '').trim()) return undefined;
  return published ?? undefined;
}

/** One published copy, as the store found it. */
export interface StoredCopy<T = unknown> {
  itemId: string;
  /** The device whose file this is — from the NAME. The record inside names its author, which can differ. */
  deviceId: string;
  record: SyncRecord<T>;
}

export interface SyncStore {
  /** Every readable copy of every item of one type. Unreadable files are skipped, not thrown. */
  list<T>(type: string): Promise<StoredCopy<T>[]>;
  write<T>(type: string, itemId: string, deviceId: string, record: SyncRecord<T>): Promise<void>;
  /**
   * Item ids whose copy of ours is not where the folder setting says it should be.
   *
   * **Because "up to date" and "in the right place" are different questions.** Changing the folder makes every one of
   * this device's copies misplaced at once, and none of them has changed — so the merge says "nothing to do" and the
   * files sit in the old folder until something happens to edit them, which for most items is never. Answered from
   * what the last `list` saw, so it costs no extra reading.
   */
  misplaced?(type: string, deviceId: string): Promise<string[]>;
  /** Lines describing what discovery can see, for the dev status command. Writes nothing. */
  describe?(): Promise<string[]>;
  /** Where the time went since the last call — walking, listing, reading — for the scan's log line. Resets. */
  takeTimings?(): string;
  /**
   * Bracket one scan, so finding our files happens once for every type in it rather than once per type. Outside a
   * scan — the dev status command — every `list` looks afresh.
   */
  beginScan?(): void;
  endScan?(): void;
}

/** How many record files a scan reads at once — see `VaultSyncStore.list`. */
const READ_BATCH = 32;

/**
 * The vault-backed store.
 *
 * **A file that will not parse is skipped, never thrown.** These files arrive from other devices through a sync tool,
 * which means half-written ones are a normal event rather than an exception: a scan that dies on one would stop
 * adopting everything else, and the next scan finds the file complete anyway.
 */
export class VaultSyncStore implements SyncStore {
  /** `folder()` is read on every write, so changing the setting takes effect on the next publish. */
  constructor(
    private readonly app: App,
    private readonly folder: () => string
  ) {}

  /**
   * Where each of our file names was last found, name → paths.
   *
   * Filled by `list`, read by `write`, and that order is not an accident: a scan reads before it writes, so this is
   * simply what the scan just saw. The alternative — walking the vault again inside every write — is one walk per
   * file published, to answer a question the read already answered.
   */
  private seen = new Map<string, string[]>();

  /**
   * Time spent since the last `takeTimings`, by kind. A scan lists every type, and each list walks the vault, lists the
   * folder and reads that type's files — so which of the three a scan's time goes to decides what would make it cheaper.
   */
  private spent = { walks: 0, walkMs: 0, lists: 0, listMs: 0, reads: 0, readMs: 0 };

  /**
   * What finding our files turned up, shared by every type in the scan under way — null outside one.
   *
   * **Once per scan, measured.** Each type used to walk the vault and list the folder for itself: nine listings of one
   * folder per scan, at 7–10 ms apiece on a Mac, and a scan runs on every return to the window. Nothing in the folder
   * changes between one type and the next — a type writes only its own files, and has finished with them before the
   * next is listed — so one look answers all of them.
   */
  private discovered: Promise<Map<string, { type: string; itemId: string; deviceId: string }>> | null = null;
  private scanning = false;

  beginScan(): void {
    this.scanning = true;
    this.discovered = null;
  }

  endScan(): void {
    this.scanning = false;
    this.discovered = null;
  }

  takeTimings(): string {
    const s = this.spent;
    const ms = (n: number) => Math.round(n);
    this.spent = { walks: 0, walkMs: 0, lists: 0, listMs: 0, reads: 0, readMs: 0 };
    return `vault walked ${s.walks}× in ${ms(s.walkMs)} ms, folder listed ${s.lists}× in ${ms(s.listMs)} ms, ${s.reads} files read in ${ms(s.readMs)} ms`;
  }

  async list<T>(type: string): Promise<StoredCopy<T>[]> {
    // **Rebuilt, not added to.** A path that has gone — moved by this device, deleted by a reader, tidied by a sync
    // tool — must leave this map with it, or the next write tries to remove a file that is not there.
    this.seen = new Map();
    const mine: Array<{ path: string; parsed: { itemId: string; deviceId: string } }> = [];
    for (const [path, parsed] of await this.ours()) {
      const name = path.slice(path.lastIndexOf('/') + 1);
      this.seen.set(name, [...(this.seen.get(name) ?? []), path]);
      if (parsed.type === type) mine.push({ path, parsed });
    }
    /**
     * **Read in batches, not one after another.** Measured on Android: about 3 ms a file, end to end, and almost all of
     * it waiting — a scan of 289 files spent a second reading, on every return to the window. Every file is still read
     * on every scan, so nothing a cache could miss is ever skipped; the reads simply overlap. Batched rather than all at
     * once, so a vault with many devices does not ask the phone for hundreds of files in one breath.
     */
    const readStarted = performance.now();
    const out: StoredCopy<T>[] = [];
    for (let i = 0; i < mine.length; i += READ_BATCH) {
      const batch = await Promise.all(
        mine.slice(i, i + READ_BATCH).map(async ({ path, parsed }) => {
          try {
            const record = JSON.parse(await this.app.vault.adapter.read(path)) as SyncRecord<T>;
            if (!record || typeof record.id !== 'string' || !record.version) return null;
            // **The record must be the item its name says.** An adopted record is published again under its own
            // `id`, so a file naming one item and carrying another would choose where this device writes — and an
            // id with `../` in it, a folder outside the vault. Compared in one Unicode form, because a sync tool may
            // hand a name back in another.
            if (!isSyncItemId(record.id) || record.id.normalize('NFC') !== parsed.itemId.normalize('NFC')) return null;
            return { itemId: parsed.itemId, deviceId: parsed.deviceId, record };
          } catch {
            // Mid-sync, truncated, or hand-edited: the next scan will find it whole.
            return null;
          }
        })
      );
      for (const copy of batch) if (copy) out.push(copy);
    }
    this.spent.reads += mine.length;
    this.spent.readMs += performance.now() - readStarted;
    return out;
  }

  /**
   * Every file in the vault whose name is one of ours, by path.
   *
   * **Two ways of looking, because each covers the other's blind spot.** `getFiles()` answers with what Obsidian has
   * INDEXED, which at load on a phone can be nothing at all — the library learned that the hard way, and a device
   * that adopted nothing because the index was cold looked exactly like a device with nothing to adopt. Listing the
   * configured folder needs no index and covers the common case; the index covers everywhere else.
   */
  private ours(): Promise<Map<string, { type: string; itemId: string; deviceId: string }>> {
    if (!this.scanning) return this.discover();
    // A failed look is not kept: the next type in the scan tries again, as it did when each type looked for itself.
    this.discovered ??= this.discover().catch((err: unknown) => {
      this.discovered = null;
      throw err;
    });
    return this.discovered;
  }

  private async discover(): Promise<Map<string, { type: string; itemId: string; deviceId: string }>> {
    const found = new Map<string, { type: string; itemId: string; deviceId: string }>();
    const walkStarted = performance.now();
    for (const file of this.app.vault.getFiles()) {
      const parsed = parseSyncFileName(file.name);
      if (parsed) found.set(file.path, parsed);
    }
    this.spent.walks++;
    this.spent.walkMs += performance.now() - walkStarted;
    const listStarted = performance.now();
    const folder = normalizePath(syncFolderOf(this.folder()));
    if (await this.app.vault.adapter.exists(folder)) {
      const listed = await this.app.vault.adapter.list(folder);
      for (const path of listed.files) {
        const parsed = parseSyncFileName(path.slice(path.lastIndexOf('/') + 1));
        if (parsed) found.set(path, parsed);
      }
    }
    this.spent.lists++;
    this.spent.listMs += performance.now() - listStarted;
    return found;
  }

  /** Ours, and not where the setting says — see `SyncStore.misplaced`. Read from what `list` just saw. */
  misplaced(type: string, deviceId: string): Promise<string[]> {
    const out: string[] = [];
    for (const [name, paths] of this.seen) {
      const parsed = parseSyncFileName(name);
      if (!parsed || parsed.type !== type || parsed.deviceId !== deviceId) continue;
      const wanted = normalizePath(syncFilePath(this.folder(), type, parsed.itemId, deviceId));
      if (!paths.includes(wanted)) out.push(parsed.itemId);
    }
    return Promise.resolve(out);
  }

  /**
   * What each way of looking can see — **counted separately, because the difference is the diagnosis.**
   *
   * A device that has adopted nothing looks the same from the outside whether the files never arrived, arrived
   * somewhere the index has not caught up with, or arrived and were unreadable. One number covering both paths would
   * hide exactly the distinction worth having.
   */
  async describe(): Promise<string[]> {
    const folder = normalizePath(syncFolderOf(this.folder()));
    const indexed = this.app.vault.getFiles().filter((file) => parseSyncFileName(file.name));
    const exists = await this.app.vault.adapter.exists(folder);
    let inFolder: string[] = [];
    if (exists) {
      const listed = await this.app.vault.adapter.list(folder);
      inFolder = listed.files.filter((path) => parseSyncFileName(path.slice(path.lastIndexOf('/') + 1)));
    }
    const lines = [
      `files of ours in Obsidian's index: ${indexed.length}`,
      `files of ours in ${folder}: ${exists ? inFolder.length : 'the folder does not exist'}`,
    ];
    // A few paths, because "7 files" and "7 files, all in a folder you forgot about" are different answers.
    const paths = [...new Set([...indexed.map((f) => f.path), ...inFolder])].sort();
    for (const path of paths.slice(0, 5)) lines.push(`  ${path}`);
    if (paths.length > 5) lines.push(`  …and ${paths.length - 5} more`);
    return lines;
  }

  /**
   * Publish one copy.
   *
   * **Written where the setting says, and a copy of ours found elsewhere is moved rather than left.** Otherwise the
   * setting would have no effect after the first publish — every write would go over the file it found, wherever that
   * was — and the reader who changed it would watch nothing happen. Only our own copies move: another device's file
   * is its business, and it will move its own when it next publishes.
   */
  async write<T>(type: string, itemId: string, deviceId: string, record: SyncRecord<T>): Promise<void> {
    // `list` drops such ids already; reaching here with one is a bug, and the file name must not become a path.
    if (!isSyncItemId(itemId)) throw new Error(`Not a sync item id: ${JSON.stringify(itemId)}`);
    const wanted = normalizePath(syncFilePath(this.folder(), type, itemId, deviceId));
    const name = syncFileName(type, itemId, deviceId);
    const strays = (this.seen.get(name) ?? []).filter((path) => path !== wanted);
    await this.ensureFolder(wanted.slice(0, wanted.lastIndexOf('/')));
    // Indented, because a reader looking into this folder to understand what a device thinks should be able to read
    // it. These files are small and there are not many per device.
    await this.app.vault.adapter.write(wanted, `${JSON.stringify(record, null, 2)}\n`);
    // After the write, never before: a crash between the two leaves two copies of one version, which the next scan
    // tidies, where the other order can leave none.
    //
    // **And a stray that will not go is not a failed write.** The copy that matters is already on disk; a file the OS
    // holds open, or one a sync tool removed a moment ago, must not make the item look unpublished and stop the items
    // behind it. It is a leftover, and the next scan tries again.
    //
    // **To the trash, as the reader's Deleted files setting says, not deleted outright.** A stray is found by name
    // anywhere in the vault, so it can be a copy the reader keeps on purpose — a backup of the sync folder inside the
    // vault — and that was deleted beyond recovery. Every other file Orbis removes goes
    // through `trashFile`. One Obsidian has not indexed yet is left for a later scan rather than removed unseen.
    for (const stray of strays) {
      try {
        const file = this.app.vault.getFileByPath(stray);
        if (file) await this.app.fileManager.trashFile(file);
      } catch {
        /* left behind, deliberately */
      }
    }
    this.seen.set(name, [wanted]);
  }

  /**
   * Make a folder and every folder above it.
   *
   * **One segment at a time**, rather than trusting `mkdir` with a nested path: the desktop adapter creates parents
   * and the mobile one has not always, and the failure mode is a device that publishes nothing while looking like it
   * has. Walking the path costs two `exists` calls once per session.
   */
  private async ensureFolder(path: string): Promise<void> {
    const parts = normalizePath(path).split('/').filter(Boolean);
    let sofar = '';
    for (const part of parts) {
      sofar = sofar ? `${sofar}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(sofar))) await this.app.vault.adapter.mkdir(sofar);
    }
  }
}
