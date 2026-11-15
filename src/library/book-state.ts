// What Orbis already knows about a book file, derived from the vault's file list alone.
//
// The Library shows this per row — has it been opened, when, does it have a recording, does it have a data view —
// for thousands of records, so none of it may cost a file read. It does not have to: every sidecar Orbis writes
// is itself a vault file, so `vault.getFiles()` hands over their paths and mtimes already in memory.
//
// ```text
// Books/sample.epub
// Books/!orbis-data/sample.epub.orbis                    → has a data view
// Books/!orbis-data/sample.epub.location.abc123.json     → started; its mtime is when
// Books/!orbis-data/audio/sample.epub.audio/<edition>/…  → has a recording
// ```
//
// Every sidecar is named from the book's whole file name (`sidecarStem`), so `sample.azw3` beside it has a state
// of its own.
//
// **`lastOpened` is the location file's mtime, not the `lastOpened` inside it.** Reading the field would mean
// opening every location file in the vault — a read per book per device, too slow to paint with. The file is
// written when the position moves, so its mtime answers the same question — with one honest caveat: a sync that
// rewrites the file moves the mtime without anyone having read anything. For ordering
// "continue reading" that is close enough; anything needing the true value should read the file.

import { sidecarStem } from '../sidecar-names';

/** A vault file, reduced to what per-book state needs. */
export interface VaultEntry {
  path: string;
  mtime: number;
}

export interface BookState {
  /** Has a location file — the book has been opened at least once, on some device. */
  started: boolean;
  /** Newest location-file mtime, or 0. */
  lastOpened: number;
  /** Has generated audio. */
  recorded: boolean;
  /** Has a `.orbis` sidecar, so the data view has something to show. */
  hasData: boolean;
}

const EMPTY: BookState = { started: false, lastOpened: 0, recorded: false, hasData: false };

/**
 * Separator inside a state key.
 *
 * NUL, written as an escape rather than typed, because it is the one character a path cannot contain — so
 * `Books/x` and a folder literally named `Books` holding `/x` can never collide. Any printable separator could
 * appear in a folder name and quietly merge two books' state.
 */
const KEY_SEP = '\u0000';

/** The folder Orbis keeps a book's sidecars in. Mirrors `progressFolderPath`, without needing a `TFile`. */
export function sidecarFolderOf(bookPath: string): string {
  const parent = bookPath.split('/').slice(0, -1).join('/');
  return parent ? `${parent}/!orbis-data` : '!orbis-data';
}

/**
 * Key a book by folder and file name — what every sidecar path can be reduced to (`sidecarStem`).
 *
 * **The whole file name, extension included**, as the sidecars are named. Two formats of one book sharing a key
 * would report the same state, and `capabilitiesOf` — "the edition you have been reading wins" — could not tell
 * them apart: the tie would always go to whichever file the title note lists first.
 */
export function bookStateKey(bookPath: string): string {
  const parent = bookPath.split('/').slice(0, -1).join('/');
  return `${parent}${KEY_SEP}${sidecarStem(bookPath)}`;
}

/**
 * Which book a sidecar belongs to, and what it says about it.
 *
 * Returns null for anything that is not a sidecar, which is most of the vault. The basename patterns are greedy
 * on purpose: `My Book v1.2.location.abc.json` is one book with dots in its name, not a book called `My Book v1`.
 */
export function readSidecar(path: string): { key: string; kind: 'data' | 'location' | 'audio' } | null {
  const marker = path.lastIndexOf('/!orbis-data/');
  const atRoot = path.startsWith('!orbis-data/');
  if (marker === -1 && !atRoot) return null;
  const parent = atRoot ? '' : path.slice(0, marker);
  const rest = atRoot ? path.slice('!orbis-data/'.length) : path.slice(marker + '/!orbis-data/'.length);

  // The folder is the book's file name and `.audio` (`audioFolderName`); the key is the file name alone.
  const audio = rest.match(/^audio\/([^/]+?)(?:\.audio)?\//);
  if (audio) return { key: `${parent}${KEY_SEP}${audio[1]}`, kind: 'audio' };
  if (rest.includes('/')) return null; // some other nesting under !orbis-data

  const location = rest.match(/^(.+)\.location\.[^.]+\.json$/);
  if (location) return { key: `${parent}${KEY_SEP}${location[1]}`, kind: 'location' };
  const data = rest.match(/^(.+)\.orbis$/);
  if (data) return { key: `${parent}${KEY_SEP}${data[1]}`, kind: 'data' };
  return null;
}

/**
 * One pass over the vault's files, producing a state per book.
 *
 * Keyed rather than joined against a book list, so this stays O(n) in the number of files rather than O(books ×
 * files) — the difference between instant and noticeable on a large catalog.
 */
export function buildBookStates(entries: VaultEntry[]): Map<string, BookState> {
  const states = new Map<string, BookState>();
  for (const entry of entries) {
    const sidecar = readSidecar(entry.path);
    if (!sidecar) continue;
    const state = states.get(sidecar.key) ?? { ...EMPTY };
    if (sidecar.kind === 'location') {
      state.started = true;
      state.lastOpened = Math.max(state.lastOpened, entry.mtime);
    } else if (sidecar.kind === 'audio') {
      state.recorded = true;
    } else {
      state.hasData = true;
    }
    states.set(sidecar.key, state);
  }
  return states;
}

/** State for a book, or the empty state — so callers never branch on undefined. */
export function bookStateFor(states: Map<string, BookState>, bookPath: string): BookState {
  return states.get(bookStateKey(bookPath)) ?? EMPTY;
}
