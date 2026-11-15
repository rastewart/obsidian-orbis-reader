// The one thing that makes styles different from every other synced type: **a device seeds one before it has ever
// seen the vault.**
//
// `initializeDefaultNoteStyle` gives a device with no note styles a "Default" — sensible on its own, and a duplicate
// factory once styles travel. Three devices set up before sync each seed their own, and each is a different item,
// because nothing about them says otherwise. Worse, a device installed LATER seeds a fresh one whose version is newer
// than the reader's real default, so publishing it would overwrite everyone's with the shipped one. A placeholder
// beating the thing it stands in for is the wrong way round.
//
// So a seeded default that nobody has touched is treated as what it is — scaffolding:
//
// - it is not published, because it carries nothing and could only do harm by arriving somewhere;
// - it is removed once the vault provides real styles, because by then it is standing in for something that exists.
//
// The moment a reader edits it, it stops being scaffolding and travels like anything else.
//
// See docs/design/multi-device-sync.md §What participates.

import { DEFAULT_NOTE_STYLE_CONFIG, type NoteStyle } from '../settings';

/** The id a seeded default carries, so that two devices seeding one produce the same item rather than two. */
export const SEEDED_NOTE_STYLE_ID = 'note-style-default';

/**
 * The name the shipped style carried before it was "Orbis style".
 *
 * Kept because a stored style still called this is one nobody has renamed — which is what `findShippedNoteStyle`
 * needs to know, and the only thing this literal is for. It is not localized: it was written by an install that
 * only ever had English strings.
 */
export const LEGACY_SEEDED_NOTE_STYLE_NAME = 'Default';

/**
 * Which stored style is the one Orbis shipped, for the single migration that stamps `isSystem` on it.
 *
 * **This is the rule, not the flag — and it runs once.** After the stamp, `isShippedNoteStyle` reads the field and
 * none of this is consulted again. It lives here rather than in `main.ts` so a test can reach it: a rule requiring
 * `SEEDED_NOTE_STYLE_ID` alone misses a vault set up before that id existed, which carries a generated one — and a
 * freshly seeded test vault is the only kind that would pass such a rule.
 *
 * Three lookups, in falling order of confidence:
 *
 * 1. the fixed id — a device seeding one today;
 * 2. the legacy name — an older vault with a generated id, still saying "Default";
 * 3. the current name — a vault that already took the rename but has no flag yet.
 *
 * Order matters between 2 and 3 only in the vault that holds both, where the one still called "Default" is the
 * older article and the better answer. A reader who renamed it matches none of them, which is the point: renaming
 * it is how you say it is yours.
 *
 * Returns `undefined` when a style already carries the flag — the migration has run — or when nothing matches.
 */
export function findShippedNoteStyle(styles: readonly NoteStyle[], shippedName: string): NoteStyle | undefined {
  if (styles.some((style) => style.isSystem)) return undefined;
  return (
    styles.find((style) => style.id === SEEDED_NOTE_STYLE_ID) ??
    styles.find((style) => style.name === LEGACY_SEEDED_NOTE_STYLE_NAME) ??
    styles.find((style) => style.name === shippedName)
  );
}

/** Whether `config` is still the shipped one, untouched. */
function isDefaultConfig(config: NoteStyle['config']): boolean {
  return sameConfig(config, DEFAULT_NOTE_STYLE_CONFIG);
}

/**
 * Whether this is the style Orbis ships, rather than one the reader made.
 *
 * One field, read as written — see `NoteStyle.isSystem` for why it is a flag and not a rule about ids and names.
 */
export function isShippedNoteStyle(style: Pick<NoteStyle, 'isSystem'>): boolean {
  return style.isSystem === true;
}

/**
 * Whether this is a seeded default nobody has touched.
 *
 * All four conditions, because any one alone is wrong: a reader may name a style "Orbis style" and mean it, may
 * promote a style they built to be the default, and may have edited the seeded one until it is theirs. Only the
 * untouched shipped article is scaffolding.
 *
 * **The id is checked first.** Identifying the shipped style by its display NAME alone means renaming it — from
 * "Default" to "Orbis style" — stops every existing install's copy from being recognized as scaffolding, and starts
 * publishing one per device into a sync that exists to keep exactly that from happening. A name is presentation;
 * the id is identity.
 *
 * The name check stays anyway, against the CURRENT shipped name: renaming a style is a way of meaning to keep it,
 * so a renamed one should travel like any other.
 */
export function isSeededDefault(style: NoteStyle, defaultName: string): boolean {
  if (style.id !== SEEDED_NOTE_STYLE_ID) return false;
  if (!style.isDefault || style.name !== defaultName) return false;
  return isDefaultConfig(style.config);
}

function sameConfig(a: NoteStyle['config'], b: NoteStyle['config']): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, held: unknown) =>
    held && typeof held === 'object' && !Array.isArray(held)
      ? Object.fromEntries(Object.entries(held as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : held
  );
}

/** What this device publishes: everything but the scaffolding. */
export function publishableNoteStyles(styles: readonly NoteStyle[], defaultName: string): NoteStyle[] {
  return styles.filter((style) => !isSeededDefault(style, defaultName));
}

/**
 * The list to keep after styles have arrived from elsewhere.
 *
 * **The placeholder goes only when something real replaces it.** A device whose vault holds no note styles at all
 * keeps its seeded one — otherwise the first thing sync would do on a single-device vault is take away the style the
 * plugin just made, and there would be nothing to generate notes with.
 */
export function withoutSpentScaffolding(styles: readonly NoteStyle[], defaultName: string): NoteStyle[] {
  const real = styles.filter((style) => !isSeededDefault(style, defaultName));
  return real.length > 0 ? real : [...styles];
}
