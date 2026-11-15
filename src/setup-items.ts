// What the Setup page lists, what counts as answered, and what "4 of 7" is counting.
//
// **Data, not a page.** The page is the easy half; the hard half is that this plugin answers "is this set up?" four
// unrelated ways — `librarySetupDone` and `recordsSetupDone` are fields in `data.json` and therefore SYNC; sync's
// own `setupDone` lives in `device-store` and therefore does not; book sources has no flag at all and is inferred
// from "a download folder is set"; and three items are downloads that can only be answered by asking the
// filesystem. A checklist over four mechanisms is a checklist that disagrees with itself, so the mechanisms are
// gathered here behind one shape and the page reads a list.
//
// **The impure readings are a probe, injected.** Every state above is a field, a device value, or an `await` on the
// vault adapter — nothing a test can construct. So the specs name a QUESTION and the caller supplies the answers,
// which is what lets the whole registry be exercised as data with no Obsidian in the room. See
// `__tests__/setup-items.test.ts`.
//
// See docs/design/settings.md §Setup — the first page.

/** Stable ids. They key the i18n strings, so they outlive any renaming on screen. */
export type SetupItemId =
  | 'appearance'
  | 'book'
  | 'lookup'
  | 'library'
  | 'records'
  | 'listening'
  | 'pdf-fonts'
  | 'devices';

/**
 * Where an item sits.
 *
 * `appearance` is a group of one, above the tasks, and never counted — adjusting the text is what a reader is most
 * likely to want from settings and it is not a task. Being outside the count is exactly what lets it hold the top
 * slot honestly.
 *
 * **There is no "make it yours" group** for marks or the toolbar: choosing the colors you highlight with is not
 * setup. It is something you do once you have started marking, on a page that exists for it, and a
 * checklist that includes preferences teaches a reader that this page is where preferences live. In an eight-page
 * tree that is the opposite of what they need to learn.
 */
export type SetupGroup = 'appearance' | 'setup';

/**
 * Answered, not yet — or nothing to answer.
 *
 * `open` is not a lesser `todo`: an uncounted item has no work in it at all. Modeled as a state rather than an
 * absence so a caller cannot forget the distinction.
 *
 * **There is no `dismissed` state.** The Setup entry carries no warning badge — `status: 'warning'` is for things
 * that are broken, and an optional list at 0 of 7 is not — so there is nothing for a per-row "not for me" × to
 * clear. And × means close or delete: on a row named "Book sources" it would read as an offer to delete the
 * feature. The count says how much of Orbis you are using, which needs no per-row escape hatch — only the sentence
 * at the top of the page saying none of it is required.
 */
export type SetupState = 'done' | 'todo' | 'open';

/**
 * The impure half, supplied by the caller.
 *
 * Three async members because three items are answered by the filesystem, and one shape for all of them because a
 * mixed sync/async registry pushes the join into every caller.
 */
export interface SetupProbe {
  /**
   * Book sources is on on THIS device, with a download folder chosen — which only happens by answering
   * `BookSourcesSetupModal`. The folder alone travels between devices; the switch does not.
   */
  bookSourcesOn: boolean;
  /** `settings.librarySetupDone` — stored, because declining a library is a real answer. */
  librarySetUp: boolean;
  /** `settings.recordsSetupDone` — stored, for the same reason. */
  recordsSetUp: boolean;
  /** `syncSetupDone()` — per device, because consent does not travel. */
  devicesSetUp: boolean;
  /** Has this device any look-up dictionary on its disk? Either book counts — one is enough to look a word up. */
  dictionaryDownloaded: () => Promise<boolean>;
  /** Has this device a usable voice — a system one chosen, or an Orbis one downloaded? */
  voiceReady: () => Promise<boolean>;
  /** Are the PDF fonts on this device's disk? */
  pdfFontsInstalled: () => Promise<boolean>;
}

export interface SetupItemSpec {
  id: SetupItemId;
  group: SetupGroup;
  /**
   * Whether this item is a task: counted towards "N of 7".
   *
   * Uncounted items are invitations. Appearance is the plugin's most-wanted control and a preference: it can never
   * be "not done", and counting it would make a page nobody can finish.
   */
  counted: boolean;
  /** Answered? Absent on an uncounted item, which has nothing to answer. */
  done?: (probe: SetupProbe) => boolean | Promise<boolean>;
}

/**
 * The list, in the order the page draws it.
 *
 * **Ordered by what a new reader needs in order to read a book**, not by feature age. Get a book first, because an
 * empty vault is where a new reader actually stands. Devices LAST: it is the least relevant item to someone opening
 * their first book, and the only one that needs a second tool Orbis does not provide.
 */
export const SETUP_ITEMS: readonly SetupItemSpec[] = [
  { id: 'appearance', group: 'appearance', counted: false },
  { id: 'book', group: 'setup', counted: true, done: (p) => p.bookSourcesOn },
  { id: 'lookup', group: 'setup', counted: true, done: (p) => p.dictionaryDownloaded() },
  { id: 'library', group: 'setup', counted: true, done: (p) => p.librarySetUp },
  { id: 'records', group: 'setup', counted: true, done: (p) => p.recordsSetUp },
  { id: 'listening', group: 'setup', counted: true, done: (p) => p.voiceReady() },
  { id: 'pdf-fonts', group: 'setup', counted: true, done: (p) => p.pdfFontsInstalled() },
  { id: 'devices', group: 'setup', counted: true, done: (p) => p.devicesSetUp },
];

export interface SetupItemStatus {
  id: SetupItemId;
  group: SetupGroup;
  counted: boolean;
  state: SetupState;
}

/** Every item's state, in page order. */
export async function resolveSetupItems(probe: SetupProbe): Promise<SetupItemStatus[]> {
  return Promise.all(
    SETUP_ITEMS.map(async (spec): Promise<SetupItemStatus> => {
      const base = { id: spec.id, group: spec.group, counted: spec.counted };
      if (!spec.counted || !spec.done) return { ...base, state: 'open' };
      return { ...base, state: (await spec.done(probe)) ? 'done' : 'todo' };
    })
  );
}

export interface SetupProgress {
  /** How many tasks are set up. */
  done: number;
  /** Every counted item. */
  total: number;
}

/**
 * What the entry's `displayValue` says.
 *
 * **"2 of 7" is a description, not a score.** It says how much of Orbis this device is using, which is why the
 * entry carries no warning: there is nothing to finish.
 */
export function setupProgress(items: readonly SetupItemStatus[]): SetupProgress {
  const counted = items.filter((i) => i.counted);
  return { done: counted.filter((i) => i.state === 'done').length, total: counted.length };
}
