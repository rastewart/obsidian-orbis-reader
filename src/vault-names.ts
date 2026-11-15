// Turning a book's own words into a name a vault can hold.
//
// **One set of rules for every name.** `sanitizeName` (chapter files, export folders) and `sanitizeNoteName` (title
// notes, downloaded books) share the character class, the replacement with a space and the leading-dot strip. The
// leading-dot strip matters: a book titled `..` would otherwise be a path segment meaning "the parent folder", in a
// string that goes on to name an export folder.
//
// The rules live here once. The two names remain, as thin wrappers, because a chapter file and a title note are
// genuinely different things: they differ in the length cap (80 and 120), and a title note falls back to
// "Untitled", since it must exist even when a book's metadata gives nothing usable.

/**
 * Characters Obsidian and the common filesystems reject, plus the ones that mean something in a wikilink.
 *
 * **Replaced with a space, never deleted.** `Sample Book: A Subtitle` should read as `Sample Book A Subtitle`, not
 * `Sample BookA Subtitle` — deletion silently welds words together wherever the punctuation was not already beside a
 * space.
 */
const ILLEGAL = /[\\/:*?"<>|#^[\]]/g;

/**
 * A name safe to write into a vault.
 *
 * **The leading-dot strip is the security-relevant line.** `.` and `..` are not names, they are directions; a
 * leading dot also hides a file on every Unix-alike. Removing separators alone is not enough, because a segment of
 * exactly `..` still climbs a level when it is used as a folder.
 */
export function sanitizeVaultName(name: string, opts: { max: number; fallback?: string }): string {
  /**
   * **The leading strip takes dots and spaces together, and that is not fussiness.** Separators become spaces
   * here, so `../../../.obsidian/plugins/evil` arrives at this step as `.. .. .. .obsidian plugins evil` — and a
   * `^\.+` strip removes only the first run, leaving a name that still begins `.. ..`. It can no longer traverse,
   * having no separators left, but it is still a hidden file with a nonsense name. `^[\s.]+` takes the whole
   * run and leaves `obsidian plugins evil`, which is what that title deserves to be called.
   */
  const cleaned = withoutInvisible(name)
    .replace(ILLEGAL, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+/, '')
    .trim();
  const capped = cleaned.length > opts.max ? cleaned.slice(0, opts.max).trim() : cleaned;
  // After the cut, since the cut can end a name on a dot.
  const ended = capped.replace(/[\s.]+$/, '');
  if (!ended) return opts.fallback ?? '';
  return WINDOWS_RESERVED.test(ended) ? `_${ended}` : ended;
}

/**
 * Characters no name should hold, each one shown as nothing or as something it is not: controls (C0, DEL, C1), every
 * format character (`\p{Cf}` — bidi overrides, isolates and marks such as U+061C, zero-width characters, the soft
 * hyphen, the byte-order mark, the tag characters), and the Hangul fillers, which are letters drawn blank. Matched by
 * category rather than listed: a list missed the ones it did not name.
 */
const INVISIBLE = /[\p{Cc}\p{Cf}\u115F\u1160\u3164\uFFA0]/gu;

/** `name` with each invisible character a space. */
function withoutInvisible(name: string): string {
  return name.replace(INVISIBLE, ' ');
}

/**
 * Names Windows keeps for devices, with or without an extension after them: `NUL` or `con.notes` cannot be a file
 * there, and a vault synced to Windows has to hold every name its other devices write. A trailing dot or space is
 * dropped for the same reason — Windows removes it, so the file is written under a different name than it was asked
 * for. See `sanitizeVaultName`.
 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i;

/**
 * The name an export writes, whether its dialog proposed it or the reader typed over it.
 *
 * **Every export dialog calls this where the name becomes a path.** A book's title proposed as it is
 * (`Sample Book: The Remarkable Life…`) would be refused by Obsidian for its colon only when Save is selected,
 * after everything else has been chosen; one rule here, for proposed and typed names alike, keeps the dialogs from
 * cleaning names each their own way. Cleaning at the path means the Location line above the field shows, as you
 * type, the name that will actually be written. 120 characters, like a title note: an export is named for a whole
 * book.
 */
export function exportFileName(name: string, fallback: string): string {
  return sanitizeVaultName(name, { max: 120, fallback });
}
