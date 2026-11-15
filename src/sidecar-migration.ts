// One-time rename of sidecars named the old way — from a book's basename — to the new way, from its whole file name.
//
// See `sidecarStem` for why: `book.epub` and `book.azw3` shared one `.orbis`, one location, one page cache and one
// audio folder. This moves each old sidecar to the book it belongs to. Remove before 1.0, with the other one-time
// migrations (docs/design/roadmap.md → Ongoing).
//
// **Who gets an old sidecar.** When exactly one book in the folder has that basename, it does — the usual case, and
// lossless. When several formats share it there is no telling which format wrote the positions inside, so the EPUB
// gets it if there is one (the likeliest to have been read and annotated), else the first by name; the other formats
// start fresh. Nothing is overwritten: a sidecar whose new name already exists is left where it is.

import { type App, normalizePath } from 'obsidian';
import { isBookExtension } from './book-formats';

/** A rename to carry out: a file, or the one sidecar that is a folder (a book's recordings). */
export interface SidecarRename {
  from: string;
  to: string;
  folder: boolean;
}

/** An old-style sidecar file's name: `<basename><suffix>`, the basename greedy so `My Book v1.2.orbis` keeps its dots. */
const OLD_SIDECAR = /^(.+)(\.orbis|\.pages\.json|\.origin\.json|\.location\.[a-z0-9]+\.json)$/;

const parentOf = (p: string) => p.split('/').slice(0, -1).join('/');
const nameOf = (p: string) => p.split('/').pop() ?? '';
const extOf = (name: string) => /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
const withoutExt = (name: string) => name.replace(/\.[^.]+$/, '');

/**
 * The renames that bring a vault's sidecars to the new names. Pure: `paths` is every file in the vault, as
 * `vault.getFiles()` lists them, and the audio folders are read off the paths of the recordings inside them.
 */
export function planSidecarMigration(paths: readonly string[]): SidecarRename[] {
  const all = new Set(paths);
  // Books by folder, then by basename: which formats sit together.
  const books = new Map<string, Map<string, string[]>>();
  for (const p of paths) {
    const name = nameOf(p);
    if (p.includes('/!orbis-data/') || p.startsWith('!orbis-data/') || !isBookExtension(extOf(name))) continue;
    const byBase = books.get(parentOf(p)) ?? new Map<string, string[]>();
    byBase.set(withoutExt(name), [...(byBase.get(withoutExt(name)) ?? []), name]);
    books.set(parentOf(p), byBase);
  }
  /** The book file an old basename belongs to, or null when none does or it is already a new-style name. */
  const owner = (bookFolder: string, base: string): string | null => {
    const inFolder = books.get(bookFolder);
    if (!inFolder) return null;
    if ([...inFolder.values()].some((names) => names.includes(base))) return null; // already named from a file name
    const formats = [...(inFolder.get(base) ?? [])].sort();
    if (formats.length === 0) return null;
    return formats.find((n) => extOf(n) === 'epub') ?? formats[0];
  };

  const renames: SidecarRename[] = [];
  const seenAudio = new Set<string>();
  for (const p of paths) {
    const marker = p.startsWith('!orbis-data/') ? 0 : p.lastIndexOf('/!orbis-data/') + 1;
    if (marker === 0 && !p.startsWith('!orbis-data/')) continue;
    const dataFolder = `${p.slice(0, marker)}!orbis-data`;
    const bookFolder = marker === 0 ? '' : p.slice(0, marker - 1);
    const rest = p.slice(dataFolder.length + 1);
    const audio = /^audio\/([^/]+)\//.exec(rest);
    if (audio) {
      const from = `${dataFolder}/audio/${audio[1]}`;
      if (seenAudio.has(from)) continue;
      seenAudio.add(from);
      const book = owner(bookFolder, audio[1]);
      const to = book ? `${dataFolder}/audio/${book}.audio` : null; // straight to today's name — see `audioFolderName`
      if (to && ![...all].some((q) => q.startsWith(`${to}/`))) renames.push({ from, to, folder: true });
      continue;
    }
    if (rest.includes('/')) continue;
    const m = OLD_SIDECAR.exec(rest);
    if (!m) continue;
    const book = owner(bookFolder, m[1]);
    if (!book) continue;
    const to = `${dataFolder}/${book}${m[2]}`;
    if (!all.has(to)) renames.push({ from: p, to, folder: false });
  }
  return renames;
}

/**
 * The renames that give each recordings folder its `.audio` suffix: `audio/<book file>/` → `audio/<book file>.audio/`.
 * See `audioFolderName` for why. Only a folder named like a book file is moved — one already suffixed, and anything
 * else under `audio/`, is left alone — and never onto a folder that already exists.
 */
export function planAudioFolderSuffix(paths: readonly string[]): SidecarRename[] {
  const renames: SidecarRename[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    const m = /^(.*?!orbis-data)\/audio\/([^/]+)\//.exec(p);
    if (!m || !isBookExtension(extOf(m[2]))) continue;
    const from = `${m[1]}/audio/${m[2]}`;
    if (seen.has(from)) continue;
    seen.add(from);
    const to = `${from}.audio`;
    if (!paths.some((q) => q.startsWith(`${to}/`))) renames.push({ from, to, folder: true });
  }
  return renames;
}

/**
 * Carry out both one-time plans, each only once per vault (`done` says which already ran). Both are planned from ONE
 * listing taken before anything moves: the vault's file list lags a rename, and a second plan read after the first had
 * moved folders would miss them.
 */
export async function migrateSidecarNames(
  app: App,
  log: (msg: string) => void,
  done: { namedByFile: boolean; audioSuffixed: boolean } = { namedByFile: false, audioSuffixed: false }
): Promise<number> {
  const paths = app.vault.getFiles().map((f) => f.path);
  const plan = [
    ...(done.namedByFile ? [] : planSidecarMigration(paths)),
    ...(done.audioSuffixed ? [] : planAudioFolderSuffix(paths)),
  ];
  let moved = 0;
  for (const r of plan) {
    try {
      await app.vault.adapter.rename(normalizePath(r.from), normalizePath(r.to));
      moved++;
    } catch (e) {
      log(`sidecar migration: could not move ${r.from} → ${r.to}: ${String(e)}`);
    }
  }
  log(`sidecar migration: ${moved} of ${plan.length} renamed`);
  return moved;
}
