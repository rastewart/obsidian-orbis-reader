// Whether a book writes reading records, which kinds, and where they land — the per-book half of the
// feature whose global half lives in settings (`recordsMode`, `recordsFolder`, `recordKinds`).
//
// **The whole model in one line: nothing writes unless the vault setting AND the book both allow it.** Either
// side can veto. Off means off — for every book, whatever its own file says — because a feature that writes
// hundreds of notes into someone's vault has to have a switch that actually stops it, and a book still writing
// after you turned the feature off would be invisible: no list, no indication, just files appearing.
//
// The other direction matters just as much: a book you have turned off stays off when the vault is set to every
// book. So the veto is symmetric, and the setting reads as "which books: none, the ones I choose, or all of
// them" — no precedence to remember.
//
// Why per book at all: a reader may want records for the books they study and none for the ones they read on a
// train, and a book whose records sit beside it can be archived and restored as one folder. See
// docs/design/reading-records.md.
//
// Pure by design — no App, no vault, no settings object. The `.orbis` payload is parsed here (as
// `annotation-presets.ts` does for the preset copy) so the shape and its defensive reading are testable
// without a vault, and `progress.ts` only has to know which key it lives under.

/** What to do about a book that has never been asked. `ask` prompts on the first saved item. */
export type RecordsMode = 'off' | 'ask' | 'on';

/** Which kinds of saved content get a record. See `recordKinds` in settings for why bookmarks default off. */
export interface RecordKinds {
  passages: boolean;
  notes: boolean;
  bookmarks: boolean;
}

/**
 * Where one book's records go.
 *
 * `global` and `custom` are both *roots* — laid out `<root>/<book>.base` + `<root>/content/<book>/` +
 * `<root>/content/!covers/`, so several books can share one. `book` is a folder beside the book holding one
 * book's worth, which is what makes a book plus its records a single thing to archive.
 *
 * A mode plus an optional path, never a resolved absolute path: renaming the global records folder in
 * settings then moves every `global` book's records with it, and moving a book moves its `book`-mode folder,
 * because both are derived at use time rather than remembered.
 */
export type RecordLocation = { mode: 'global' } | { mode: 'book' } | { mode: 'custom'; path: string };

export const GLOBAL_LOCATION: RecordLocation = { mode: 'global' };
export const BOOK_LOCATION: RecordLocation = { mode: 'book' };

/**
 * A book's stored decision. Absent from the `.orbis` file entirely = **never asked**.
 *
 * Three states, not two, which is why `enabled` is optional: a book can be on, off, or explicitly following the
 * vault. The last one behaves exactly like never-asked — and is stored anyway, so the every-book stamp can tell
 * "you have not spoken" from "you said follow the vault". Without that distinction the stamp would overwrite the
 * choice on the book's next write, making "Follow the vault setting" a lie.
 */
export interface BookRecordConfig {
  /** Absent = follow the vault setting, whatever it is now and whatever it becomes. */
  enabled?: boolean;
  /**
   * Absent = **follow the vault's kinds**, which is the normal state: the dialog stores them only when you
   * deliberately override them for this book, so a vault-level change still reaches every book that has not.
   *
   * Store the exception, not the rule. Writing them into every book would make Settings → "What gets written"
   * a dead control the moment each book had been opened once — a vault-wide setting silently overridden by
   * decisions nobody remembers making, which is the same trap as a global switch that does not switch.
   */
  kinds?: RecordKinds;
  /** Absent = **follow the vault's default location**, for the same reason kinds are: settings holds the
   *  default, a book stores only its exception. Present pins this book, so a later change to the vault default
   *  leaves it where it is. */
  location?: RecordLocation;
}

/** What the vault says, for a book that has not overridden it. */
export interface RecordDefaults {
  mode: RecordsMode;
  kinds: RecordKinds;
  /** Where records go by default — the shared folder, or beside each book. Only `global` and `book` are
   *  reachable from settings: a chosen folder AT THE VAULT LEVEL is the shared folder, so offering it twice
   *  would be two names for one answer. `custom` exists per book, where it means "a different root". */
  location: RecordLocation;
}

export interface RecordsResolution {
  /** Write records for this book now. */
  active: boolean;
  /** Ask what to do with this book before writing anything. Never true at the same time as `active`. */
  ask: boolean;
  kinds: RecordKinds;
  location: RecordLocation;
}

/**
 * What to do for one book, from its stored decision and the vault setting. **An AND: both have to allow it.**
 *
 * The single place precedence is expressed — callers ask this rather than reading `recordsMode` and a book's
 * config and combining them themselves, which is how the two would drift apart.
 */
export function resolveRecords(book: BookRecordConfig | null, defaults: RecordDefaults): RecordsResolution {
  const shared = { kinds: book?.kinds ?? defaults.kinds, location: book?.location ?? defaults.location };
  // Off is absolute. A book whose file says `enabled: true` still writes nothing, and is not prompted either:
  // the answer to "should this book track" is moot while nothing tracks at all.
  if (defaults.mode === 'off') return { active: false, ask: false, ...shared };
  // Ask: only an explicit yes writes. Following the vault means "ask me", which is what never-asked means too —
  // the two are deliberately indistinguishable here, and differ only to the stamp.
  if (defaults.mode === 'ask') {
    return { active: book?.enabled === true, ask: book?.enabled === undefined, ...shared };
  }
  // Every book — except one that has explicitly said no, which the vault setting must not override.
  return { active: book?.enabled !== false, ask: false, ...shared };
}

/**
 * What the per-book dialog opens with: **the book's actual state**, nothing invented.
 *
 * A book that has never been asked seeds to `{}` — following the vault — because that is what it is doing. It used
 * to seed `enabled: true`, which made sense while the control was a toggle ("open it switched on") and became a
 * lie the moment the control could say "follow the vault": the dialog displayed a value the book had not stored,
 * so the row read as decided when nothing had been decided.
 *
 * The ask-mode prompt is the one caller that wants a *default* rather than the current state — it is offering an
 * answer, so Save must mean yes rather than mean nothing. That override lives at that call site.
 *
 * `kinds` and `location` are likewise left ABSENT rather than copied out of the vault settings: that is the
 * difference between "follows the vault" and "happens to match it today".
 */
export function seedBookConfig(book: BookRecordConfig | null): BookRecordConfig {
  if (!book) return {};
  return {
    ...(book.enabled === undefined ? {} : { enabled: book.enabled }),
    ...(book.kinds ? { kinds: { ...book.kinds } } : {}),
    ...(book.location ? { location: book.location } : {}),
  };
}

function parseKinds(raw: unknown): RecordKinds | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const k = raw as Record<string, unknown>;
  // All three or none: a half-written object would silently switch a kind off, and inheriting the global
  // is both recoverable and visible.
  if (typeof k.passages !== 'boolean' || typeof k.notes !== 'boolean' || typeof k.bookmarks !== 'boolean') {
    return undefined;
  }
  return { passages: k.passages, notes: k.notes, bookmarks: k.bookmarks };
}

/**
 * Absent and unusable are DIFFERENT answers, and the split matters now that absent means "follow the vault":
 * a payload with no `location` inherits, while one carrying something unreadable falls back to the shared
 * folder. Inheriting a garbled value would let a typo silently redirect where notes are written; falling back
 * on an absent one would pin every book to the shared folder the moment it was stamped.
 */
function parseLocation(raw: unknown): RecordLocation | undefined {
  if (raw === undefined || raw === null) return undefined; // never stored → follow the vault default
  if (typeof raw !== 'object') return GLOBAL_LOCATION;
  const l = raw as Record<string, unknown>;
  if (l.mode === 'book') return BOOK_LOCATION;
  if (l.mode === 'global') return GLOBAL_LOCATION;
  // A custom location with no path is meaningless. Falling back to the shared folder keeps the records being
  // written somewhere findable, which beats both writing nothing and inventing a folder name.
  if (l.mode === 'custom' && typeof l.path === 'string' && l.path.trim()) return { mode: 'custom', path: l.path };
  return GLOBAL_LOCATION;
}

/**
 * Read the `records` payload out of a `.orbis` file's parsed JSON.
 *
 * Defensive per docs/design/data-migration.md: anything that isn't recognisably a decision reads as **no
 * decision**, so the book falls back to the global default and can be asked again. That is the only safe
 * direction — the alternative is a corrupt file reading as "records off for this book", which looks exactly
 * like the feature having quietly stopped working.
 */
export function parseBookRecordConfig(raw: unknown): BookRecordConfig | null {
  if (!raw || typeof raw !== 'object') return null; // no payload at all → never asked
  const r = raw as Record<string, unknown>;
  return {
    // Absent means "follow the vault". So does an unreadable value: the object exists, so something was decided
    // here, and returning null would throw away the kinds and location stored alongside it — a garbled on/off
    // flag should not cost a book its custom location.
    ...(typeof r.enabled === 'boolean' ? { enabled: r.enabled } : {}),
    kinds: parseKinds(r.kinds),
    location: parseLocation(r.location),
  };
}
