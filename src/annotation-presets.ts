// Annotation presets: user-defined marks (a name and an appearance) that give a highlight or note a
// MEANING instead of an arbitrary color. See docs/design/annotation-presets.md — the vocabulary there
// is load-bearing, in particular:
//
//   preset    a named set of marks, authored globally, assigned per book
//   mark      one entry: name, appearance (`MarkAppearance`), optional emoji
//   wash      the background color behind the text (`highlightColor`) — its own channel
//   treatment HOW a mark's LINE is drawn (underline / squiggle / …) — NOT the color; the two are independent
//
// The wash is not called a highlight on purpose: `Highlight` is the annotation KIND (a record in the .orbis
// file, what a user means by "12 highlights"), and once a mark can be an underline those two senses diverge —
// "a highlight drawn as an underline" is a sentence no one should have to parse. The UI calls the wash
// "Highlighter".
//
// Types + pure helpers only, so the rules (uniqueness, ordering, seeding) are unit-testable without
// Obsidian. Settings owns persistence of the library; `progress.ts` reads and writes the per-book .orbis copy.

/** The five base highlight colors. Lives here rather than in AnnotationController because
 *  it is annotation-appearance DATA, and a pure module must not import a 1700-line controller (nor
 *  its Obsidian dependencies) to read a constant. Every one is also a MARK_PALETTE entry, so existing
 *  annotations sit on curated colors rather than being second-class. */
export const HIGHLIGHT_COLORS = ['#FFEB3B', '#A5D6A7', '#90CAF9', '#FFAB91', '#CE93D8'] as const;

/** One curated color: the hex, an i18n key for its name, and the emoji note export falls back to. */
export interface PaletteColor {
  hex: string;
  nameKey: string;
  emoji: string;
}

/**
 * The "easy button" palette — mutually distinguishable colors, each with its own emoji.
 *
 * Curated rather than a raw color picker because `<input type="color">` invites picking two
 * near-identical colors, which defeats the distinguishability the whole feature rests on. A custom
 * picker stays available behind it for anyone who needs an exact hex; this is the default path, not a
 * cage.
 *
 * All Material 200/300-weight, so each one works as a ~30%-opacity wash AND as a solid stroke. The
 * five legacy colors come first and keep their exact hexes — changing them would strand every
 * existing annotation's color match (see `resolveMark`).
 */
/**
 * Ink black — offered for LINES only, never for the wash.
 *
 * A black highlighter would be a gray smear: the wash renders at ~30% opacity with a blend mode, so a dark
 * color there subtracts light from the text rather than sitting behind it. A line strokes at full opacity
 * on top, where black is the highest-contrast option there is and the one a pen actually uses — which is
 * what makes "yellow highlighter, black underline" worth having.
 */
const INK_BLACK: PaletteColor = { hex: '#000000', nameKey: 'presets.color_black', emoji: '⚫' };

/**
 * A line color that follows the page's own text color instead of naming one.
 *
 * Black is the right ink on a light or sepia page and invisible on a dark one — and a mark is stored per
 * BOOK while the theme is per device, so a color that is perfect where you set it can vanish where you
 * read it. `INK` resolves at draw time, so it is legible on every theme by construction.
 *
 * A sentinel rather than a hex: any fixed value would be wrong on some page. Everything that renders a
 * color has to ask `isInk` first — see `resolveInk`.
 */
export const INK = 'ink';

/** Is this the ink sentinel rather than a real color? */
export function isInk(color: string | undefined): boolean {
  return !!color && normalizeColor(color) === normalizeColor(INK);
}

/** A line color as something that can actually be painted: ink becomes the page's text color. */
export function resolveInk(color: string | undefined, textColor: string): string {
  return isInk(color) ? textColor : (color ?? textColor);
}

const INK_ENTRY: PaletteColor = { hex: INK, nameKey: 'presets.color_ink', emoji: '✒️' };

/** The wash palette: colors that work at ~30% opacity behind text. */
export const MARK_PALETTE: readonly PaletteColor[] = [
  { hex: '#FFEB3B', nameKey: 'presets.color_yellow', emoji: '🟡' },
  { hex: '#A5D6A7', nameKey: 'presets.color_green', emoji: '🟢' },
  { hex: '#90CAF9', nameKey: 'presets.color_blue', emoji: '🔵' },
  { hex: '#FFAB91', nameKey: 'presets.color_orange', emoji: '🟠' },
  { hex: '#CE93D8', nameKey: 'presets.color_purple', emoji: '🟣' },
  { hex: '#EF9A9A', nameKey: 'presets.color_red', emoji: '🔴' },
  { hex: '#80CBC4', nameKey: 'presets.color_teal', emoji: '🟦' },
  { hex: '#BCAAA4', nameKey: 'presets.color_brown', emoji: '🟤' },
  { hex: '#B0BEC5', nameKey: 'presets.color_grey', emoji: '⚪' },
] as const;

/**
 * Every entry a stored color could match, whether or not it is on display.
 *
 * Both channels show the same swatches (`MARK_PALETTE`), but two colors can still be *stored* on a
 * line without appearing there — `INK`, which is a checkbox, and black, which is not in the line palette
 * (see below) but can be carried by an older mark or typed into the hex field. A name and a
 * badge glyph have to keep resolving for both, or a black line exports as a white circle and an ink line
 * gets no glyph at all.
 *
 * Black is not offered as a swatch because "Match the text color" makes it redundant where it works and
 * misleading where it does not: on a light or sepia page ink already resolves to near-black, and the one
 * case where black is visibly its own choice is a dark page — where it draws an invisible line. A swatch
 * whose only distinguishing scenario is the one it fails in should not be the first thing offered. The hex
 * field still accepts `#000000`, so nothing is taken away; it is simply not promoted.
 */
const COLOR_LOOKUP: readonly PaletteColor[] = [INK_ENTRY, INK_BLACK, ...MARK_PALETTE] as const;

/** The palette entry a stored color came from, if any — for naming it in the picker. */
export function colorEntry(hex: string): PaletteColor | undefined {
  const c = normalizeColor(hex);
  return COLOR_LOOKUP.find((p) => normalizeColor(p.hex) === c);
}

/** Hue buckets for a CUSTOM color, which by definition has no palette entry. Reference points are
 *  saturated primaries so bucketing is stable; palette colors never reach this path. */
const EMOJI_BUCKETS: readonly { hex: string; emoji: string }[] = [
  // Pure black as the reference, not a dark gray: at #1C1C1C the bucket sits close enough to pull dark but
  // clearly colored tones (a #1B5E20 forest green) away from their own hue.
  { hex: '#000000', emoji: '⚫' },
  { hex: '#E53935', emoji: '🔴' },
  { hex: '#FB8C00', emoji: '🟠' },
  { hex: '#FDD835', emoji: '🟡' },
  { hex: '#43A047', emoji: '🟢' },
  { hex: '#1E88E5', emoji: '🔵' },
  { hex: '#8E24AA', emoji: '🟣' },
  { hex: '#6D4C41', emoji: '🟤' },
  { hex: '#9E9E9E', emoji: '⚪' },
] as const;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [
    Number.parseInt(full.slice(0, 2), 16) || 0,
    Number.parseInt(full.slice(2, 4), 16) || 0,
    Number.parseInt(full.slice(4, 6), 16) || 0,
  ];
}

/**
 * Shape suffix that distinguishes marks sharing a color.
 *
 * `(color, treatment)` is unique, so two marks CAN share a color — and a color glyph alone would then
 * export both as the same emoji, losing the distinction precisely where it travels furthest (into a
 * Markdown note, which has no color at all). Emoji offer only two color families (circles and
 * squares), nowhere near six, so the treatment rides along as a separate glyph instead.
 *
 * `fill` is deliberately bare: it is the common case, and it keeps the five legacy colors exporting as
 * exact single glyphs.
 *
 * All universally-supported codepoints (Unicode 6.0 or older) — a newer glyph like 🟰 would render as
 * tofu on older Android.
 */
const TREATMENT_SUFFIX: Record<Treatment, string> = {
  underline: '➖',
  'double-underline': '➖➖',
  squiggle: '〰️',
  strikethrough: '✖️',
  box: '🔲',
};

/**
 * The emoji a mark exports with, unless the user overrode it.
 *
 * Palette colors match EXACTLY — no arithmetic — so the five legacy colors are guaranteed to keep
 * the emoji `export-format.ts` uses for them. Nearest-bucket is only for custom colors,
 * where an approximate answer is the only kind available.
 */
export function emojiForColor(hex: string): string {
  const c = normalizeColor(hex);
  // Every known entry, not just the displayed palette — see COLOR_LOOKUP.
  const exact = colorEntry(c);
  if (exact) return exact.emoji;
  const [r, g, b] = rgb(c);
  let best = EMOJI_BUCKETS[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const bucket of EMOJI_BUCKETS) {
    const [br, bg, bb] = rgb(bucket.hex);
    const d = (r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = bucket;
    }
  }
  return best.emoji;
}

/**
 * Longest badge accepted.
 *
 * Generous enough for a few characters or a couple of emoji, tight enough that it stays a badge rather
 * than a second name — it has to fit a narrow column here AND lead a line in an exported note without
 * pushing the quote off the edge. Counted in UTF-16 units, so an emoji costs two.
 */
export const BADGE_MAX = 12;

/**
 * The default badge for a mark: its color glyph plus a treatment suffix.
 *
 * Only a DEFAULT — the field is free text (see `AnnotationMark.badge`). Derived rather than stored so
 * it keeps tracking the color and treatment until the user types something of their own.
 */
export function defaultBadge(a: MarkAppearance): string {
  // The wash names the color when there is one — it is the larger, more memorable part of the appearance;
  // otherwise the line's color does. A mark with neither cannot be created, so the fallback is unreachable
  // in practice and exists only so the function is total.
  const color = a.highlightColor ?? a.treatmentColor ?? HIGHLIGHT_COLORS[0];
  return emojiForColor(color) + (a.treatment ? TREATMENT_SUFFIX[a.treatment] : '');
}

/** The badge a mark actually shows: the user's, else the derived default. */
export function badgeOf(m: Pick<AnnotationMark, 'badge' | 'highlightColor' | 'treatment' | 'treatmentColor'>): string {
  return m.badge ?? defaultBadge(m);
}

/**
 * How a mark draws its LINE. `fill` is deliberately absent: a background wash is not a peer of an
 * underline — one paints behind the text and the others draw on it — and making them alternatives would force a
 * choice between two things that never compete. The wash is its own channel (`highlightColor`), so a mark
 * can have either, or both, in different colors.
 */
export type Treatment = 'underline' | 'double-underline' | 'squiggle' | 'strikethrough' | 'box';

export const TREATMENTS: readonly Treatment[] = [
  'underline',
  'double-underline',
  'squiggle',
  'strikethrough',
  'box',
] as const;

/** What a mark looks like: up to two independent channels. At least one must be present, or the mark draws
 *  nothing at all — enforced where marks are edited, since the type cannot say "one of these two". */
export interface MarkAppearance {
  /** Hex `#RRGGBB` for the highlighter wash. Absent = no wash. */
  highlightColor?: string;
  /** The line drawn over the text. Absent = no line. */
  treatment?: Treatment;
  /** Hex for the line. Only meaningful with `treatment`. */
  treatmentColor?: string;
}

export interface AnnotationMark extends MarkAppearance {
  /** Stable within the preset. Never reused after deletion, so a stale `markId` stays unresolvable
   *  rather than silently resolving to a different mark. */
  id: string;
  name: string;
  /** Optional badge that leads this mark in exported notes — Markdown has no color, so something has
   *  to stand in for it. Defaults to an emoji derived from (color, treatment), but it is just a few
   *  characters: "#1", "URG", "Q" and "!!" are all valid. Absent means "use the default", which is why
   *  nothing ever stores the derived value. Bounded by BADGE_MAX. */
  badge?: string;
  /** Retire a mark without breaking the annotations already using it. */
  enabled: boolean;
}

export interface AnnotationPreset {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: number;
  /** Bumped on every edit. The merge uses it to spot a book whose copy is older than the template. */
  revision: number;
  /** ORDERED — array position IS the order; there is no `order` field, deliberately. Matches
   *  `sectionOrder` / `lookupSections` / `progressModes`. Anything that rebuilds this
   *  array must preserve position. */
  marks: AnnotationMark[];
  /** Which mark a NEW NOTE gets. Absent = none, which is the default and a permanent valid state. */
  noteMarkId?: string;
  /** Which mark the listening Highlight button applies. Absent = the first enabled mark (see `audioMark`). */
  audioMarkId?: string;
  /**
   * Keep this out of the lists that offer a preset to assign.
   *
   * **Curation, not a view filter** — which is why it is `inactive` rather than `hidden`. It decides what an
   * import ARRIVES as (every import does, since the library travels), it is shown in the manager's own list,
   * and it travels with the preset like `isDefault` does.
   *
   * **It never degrades a book.** An inactive preset still resolves, still merges, and a book using one is
   * in no way worse off — a flag that DISABLED a preset would recreate the "this book uses something that
   * does not work here" state the import exists to remove. Assignment is the only thing it governs.
   *
   * It travels because the library does: the whole library is shared, so a preset kept out of the way on one
   * device is kept out of the way on all of them. See docs/design/annotation-presets.md §Presets travel.
   */
  inactive?: boolean;
}

/**
 * The library entry a book's own copy implies — for a preset this device has never seen.
 *
 * A book carries a full resolved copy in its `.orbis`, so nothing has to be asked: the id, name, revision
 * and marks are all there. Importing it is what makes the book's copy MERGEABLE again. Without a template
 * there is nothing to merge against, so the book would quietly drift — edit its marks on one device and the
 * other keeps updating a preset that book no longer follows, with no common ancestor and no way to notice.
 * That is worse than a read-only copy, because it is invisible.
 *
 * **Local marks are excluded.** They are the book's own additions, not the preset's, and pushing them into
 * a shared library entry would be the one direction this design never allows (`promoteBookToPreset` is the
 * only sanctioned promotion, and it is explicit). `hiddenMarkIds` is not carried either — which marks a
 * book chose not to show has no meaning in a library entry. Nor is a preset mark the book replaced with its own
 * copy: the original is no longer in the book, so the rebuilt preset has no definition of it to carry.
 *
 * Returns null when the copy has NO tracked marks — a legacy all-local book. There is no information about
 * what the preset was, an empty preset is worse than none, and such a book is already fully editable
 * because every mark is its own.
 */
export function presetFromBookCopy(book: BookPreset, now: number): AnnotationPreset | null {
  const marks = book.marks.filter((m) => !m.local);
  if (!marks.length) return null;
  return {
    id: book.id,
    name: book.name,
    isDefault: false,
    createdAt: now,
    // The copy's own revision, not 1: the two must start in step or the next open would "merge" the book
    // forward onto a template that is really the same thing.
    revision: book.revision,
    marks: marks.map((m) => {
      const { local: _local, ...mark } = m;
      return mark;
    }),
    noteMarkId: book.noteMarkId,
    audioMarkId: book.audioMarkId,
    // **Always inactive.** An import is the answer to "this book needs a template it can track", not to "add
    // this to the presets I choose between": it works for the book that brought it from the moment it lands,
    // and joins the assignment lists only if the reader says so. Since the library travels, the case this
    // fires for is a book from ANOTHER vault — somebody else's vocabulary, which nobody asked to be offered.
    inactive: true,
  };
}

/**
 * The presets a list should offer for ASSIGNMENT. An inactive one still resolves — see `inactive`.
 *
 * Assignment only. The manager's own selector chooses what to EDIT and is deliberately unfiltered: a preset
 * you cannot select is a preset you cannot reactivate, and "keep it out of my way when assigning" says
 * nothing about editing it. That is also why there is no reveal toggle — nothing to reveal.
 */
export function activePresets(all: readonly AnnotationPreset[]): AnnotationPreset[] {
  return all.filter((p) => !p.inactive);
}

/**
 * A book's own copy of a preset, stored in its `.orbis` file under `preset`.
 *
 * The copy is the truth for that book — it renders and exports from this, never from the global
 * library — which is what lets a shared book keep its marks on a device that has never seen the
 * template, and what makes deleting the global preset harmless.
 *
 * Lives in this pure module rather than in `progress.ts` (which owns the other `.orbis` records) so the
 * copy rules stay unit-testable without Obsidian; `progress.ts` imports the type for read/write.
 */
/**
 * A mark in a book's copy, with its provenance.
 *
 * `local` means the book owns this definition: either it was added here, or a tracked mark was explicitly
 * overridden (which keeps the mark's id — see the design doc, §Per-mark tracking). Absent means the book is
 * still tracking the template, and the merge is free to replace it.
 *
 * "Added here" and "overridden here" need no separate flag: a local mark whose id exists in the template is
 * an override, one whose id does not is book-only.
 *
 * `copyOf` is the id of the preset mark a local mark replaced — see `copyMarkLocally`. The preset mark itself is
 * no longer in the book, so this is what tells the merge that the book already has it, in the reader's version.
 */
export type BookMark = AnnotationMark & { local?: true; copyOf?: string };

/**
 * The preset mark ids this book already has: its own marks' ids, and the id each copy replaced.
 *
 * Every rule that asks "does the book lack this preset mark?" asks it here. A copy is the book's version of the
 * mark it replaced, so the merge must not add the original back, a freed look must not bring it in, and the copy
 * is not holding anything the preset wants.
 */
function heldMarkIds(book: BookPreset): Set<string> {
  const held = new Set<string>();
  for (const m of book.marks) {
    held.add(m.id);
    if (m.copyOf) held.add(m.copyOf);
  }
  return held;
}

export interface BookPreset {
  /** Which global preset this came from. May no longer exist in the library — that is fine. */
  id: string;
  /** The template's name when it was copied, so a book whose preset is not in this library can still say
   *  what it was called. Display fallback only, the same idea as `Highlight.treatment`: the library's name
   *  wins whenever the id resolves, since that is the one the user can still rename. May be empty on an
   *  older copy. */
  name: string;
  /** The template's `revision` at the moment it was copied. The merge compares it to spot a stale copy. */
  revision: number;
  /**
   * LEGACY, read-only. Superseded by per-mark `local` provenance and never written — but a `true`
   * here in an older copy is the only signal that the reader edited something, with no way to tell WHICH
   * mark, so the read path turns it into "all marks local". Ask `isCustomized()` for the live answer.
   *
   * Deliberately not `@deprecated`: reading it IS the migration, and the tag would put a warning on the one
   * call site that is correct.
   */
  customized?: boolean;
  /** ORDERED, and the order is the BOOK's — seeded at assign and never re-derived from the template. Order
   *  decides the quick row, and a template reorder silently reshuffling every book's bar would be worse
   *  than not propagating. */
  marks: BookMark[];
  /** Marks hidden in THIS book. Separate from `enabled` deliberately: hiding as an edit would force an
   *  override and fork the definition, which is far too heavy for "I don't use Follow up in this novel". */
  hiddenMarkIds?: string[];
  /** Per-book role assignments, copied from the template and overridable in the book. See the two
   *  identically-named fields on `AnnotationPreset`. */
  noteMarkId?: string;
  audioMarkId?: string;
  /**
   * This book follows no preset: its marks are its own, and nothing propagates into it.
   *
   * **A stored flag, because "detached" and "never assigned" look identical from `id` alone.** Both would be
   * an empty string, and `ensureBookAnnotationPreset` reads a falsy id as "this book has never had one" and
   * assigns the default — so without something to tell them apart, detaching would silently undo itself on the
   * next open. The same reasoning as `recordsSetupDone`: two states that look the same need something to say
   * which is which, and a flag is the honest thing rather than the lazy one.
   *
   * Every path that reads a template has to check this FIRST: the merge returns the book untouched, and the
   * import must not reconstruct a library entry from a book that has deliberately stopped tracking one.
   */
  detached?: true;
}

/** Anything that carries marks — a global preset or a book's copy. `resolveMark` and `quickMarks` work
 *  on either, since resolution never needs the name or revision. */
export type MarkSet = { marks: readonly AnnotationMark[] };

/**
 * Copy a global preset into the shape a book stores.
 *
 * A deep copy on purpose: the book's marks must not alias the template's, or editing one in-book would
 * silently rewrite the global preset (and vice versa). Array position is preserved by copying the array
 * rather than rebuilding it from a map — see §Mark order.
 */
export function bookPresetFrom(preset: AnnotationPreset): BookPreset {
  return {
    id: preset.id,
    name: preset.name,
    revision: preset.revision,
    marks: preset.marks.map((m) => ({ ...m })),
    noteMarkId: preset.noteMarkId,
    audioMarkId: preset.audioMarkId,
  };
}

/**
 * An editable copy of a preset — the way past a locked built-in.
 *
 * **Fresh mark ids**, which is the library-wide invariant: a mark id lives in at most one preset. Two
 * presets sharing one would make it ambiguous, so a remap-on-switch would see the id "already resolving"
 * in the incoming preset, skip the mapping, and silently adopt the other preset's definition for
 * annotations that meant something else — see `promoteBookToPreset`, which obeys the same rule from the
 * other direction.
 */
export function duplicatePreset(source: AnnotationPreset, name: string, now: number): AnnotationPreset {
  /**
   * **The roles follow their marks through the re-id.**
   *
   * Dropping them would be wrong: duplicating is the documented way past the built-in's lock, so the copy
   * someone makes in order to customize the shipped preset would arrive with its note mark unset and its
   * listening mark demoted to a fallback — losing a choice they had not made and could not see was gone.
   */
  const remap = new Map(source.marks.map((m) => [m.id, generateMarkId()]));
  return {
    id: generatePresetId(),
    name,
    isDefault: false,
    createdAt: now,
    revision: 1,
    marks: source.marks.map((m) => ({ ...m, id: remap.get(m.id) ?? generateMarkId() })),
    noteMarkId: source.noteMarkId ? remap.get(source.noteMarkId) : undefined,
    audioMarkId: source.audioMarkId ? remap.get(source.audioMarkId) : undefined,
  };
}

/**
 * Read a mark that may predate the wash/line split.
 *
 * The old shape was one `color` and one `treatment` where `fill` meant the wash, so the conversion is
 * mechanical and lossless: `fill` becomes the wash channel, any other treatment becomes the line channel in
 * that same color. Converted on read rather than by a one-off rewrite, because the same old shape lives in
 * two places — the settings library and every book's `.orbis` copy — and a book's copy may arrive from
 * another device long after the library was updated.
 *
 * Returns null for anything that cannot draw, which the callers drop.
 */
export function migrateMark(raw: unknown): AnnotationMark | null {
  const m = raw as Partial<AnnotationMark> & { color?: string; treatment?: string };
  if (typeof m?.id !== 'string' || typeof m.name !== 'string') return null;
  const base = { id: m.id, name: m.name, badge: m.badge, enabled: m.enabled !== false };
  const legacyColor = typeof m.color === 'string' ? m.color : undefined;
  if (legacyColor) {
    const kind = m.treatment as string | undefined;
    return kind && kind !== 'fill'
      ? { ...base, treatment: kind as Treatment, treatmentColor: legacyColor }
      : { ...base, highlightColor: legacyColor };
  }
  const next: AnnotationMark = {
    ...base,
    highlightColor: typeof m.highlightColor === 'string' ? m.highlightColor : undefined,
    // CHECKED against the real list, not cast: a value from disk can be anything, and `fill` in particular
    // is a real string in the old shape — left unchecked it would reach the draw path as a line kind that
    // does not exist.
    treatment: m.treatment && TREATMENTS.includes(m.treatment) ? m.treatment : undefined,
    treatmentColor: typeof m.treatmentColor === 'string' ? m.treatmentColor : undefined,
  };
  // A line with no color, or a mark with neither channel, would draw nothing or throw at the draw site.
  if (next.treatment && !next.treatmentColor) next.treatmentColor = INK;
  return marksAnything(next) ? next : null;
}

/** Read a whole preset's marks through `migrateMark`, dropping any that cannot draw. */
export function migrateMarks(raw: unknown): AnnotationMark[] {
  return Array.isArray(raw) ? raw.map(migrateMark).filter((m): m is AnnotationMark => m !== null) : [];
}

export function generatePresetId(): string {
  return `ap_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function generateMarkId(): string {
  return `mk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalize a hex color for comparison — `#ffeb3b` and `#FFEB3B` are the same color. */
export function normalizeColor(hex: string): string {
  return hex.trim().toUpperCase();
}

/** The appearance of `m`, as the comparable triple. */
function appearanceKey(a: MarkAppearance): string {
  return [
    a.highlightColor ? normalizeColor(a.highlightColor) : '-',
    a.treatment ?? '-',
    a.treatment && a.treatmentColor ? normalizeColor(a.treatmentColor) : '-',
  ].join('|');
}

/**
 * Is this appearance free, ignoring `exceptId` (the mark being edited)?
 *
 * Uniqueness is on the whole appearance — wash color, line kind, line color — not on any one of them.
 * Two marks that render identically are indistinguishable to a reader, and a preset that cannot show the
 * difference between two of its own marks is lying about what it can express. Comparing the triple is what
 * lets "yellow wash" and "yellow wash + green underline" coexist, which is the point of splitting them.
 */
export function isMarkAppearanceFree(
  marks: readonly AnnotationMark[],
  appearance: MarkAppearance,
  exceptId?: string
): boolean {
  const key = appearanceKey(appearance);
  return !marks.some((m) => m.id !== exceptId && appearanceKey(m) === key);
}

/** A mark's name as compared for sameness: trimmed, case ignored. Empty for an unnamed mark, which matches nothing. */
function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * Is this name free, ignoring `exceptId` (the mark being edited)? An empty name always is.
 *
 * **The name is what a mark means, and the exports print it.** A generated note says "❓ Question:" and nothing
 * about color, so two marks called Question read as one there, and as two identical rows in the mark bar. The look
 * is the mark's identity for matching annotations (`isMarkAppearanceFree`); the name has to be unique for the
 * reader's sake.
 */
export function isMarkNameFree(marks: readonly AnnotationMark[], name: string, exceptId?: string): boolean {
  const key = nameKey(name);
  return !key || !marks.some((m) => m.id !== exceptId && nameKey(m.name) === key);
}

/** A mark's one representative color, for places that can only show one: the wash if it has one, else the
 *  line. Undefined for no mark at all. */
export function principalColor(a: MarkAppearance | undefined): string | undefined {
  return a?.highlightColor ?? a?.treatmentColor;
}

/** Does this mark draw anything at all? A mark with neither channel is invisible. */
export function marksAnything(a: MarkAppearance): boolean {
  return !!a.highlightColor || !!a.treatment;
}

/**
 * First unused appearance for a new mark, so "Add" never opens on a clash.
 *
 * Plain washes first, in palette order — that is what a new mark usually wants, and it keeps the simplest
 * appearance available for the longest. Only once every wash is taken does it start offering lines, walking
 * colors within a kind before changing kind.
 */
export function firstFreeAppearance(
  marks: readonly AnnotationMark[],
  palette: readonly string[] = HIGHLIGHT_COLORS
): MarkAppearance {
  for (const highlightColor of palette) if (isMarkAppearanceFree(marks, { highlightColor })) return { highlightColor };
  for (const treatment of TREATMENTS)
    for (const treatmentColor of palette)
      if (isMarkAppearanceFree(marks, { treatment, treatmentColor })) return { treatment, treatmentColor };
  // Everything taken — fall back to the first wash; the editor flags the clash.
  return { highlightColor: palette[0] };
}

/**
 * Move the mark at `from` by `delta`, returning a NEW array. Out-of-range moves return the array
 * unchanged so callers can wire up / down buttons without bounds-checking at every call site.
 *
 * Splice, never sort: array position is the order, so re-deriving it would lose it.
 */
export function moveMark(marks: readonly AnnotationMark[], from: number, delta: number): AnnotationMark[] {
  const to = from + delta;
  if (from < 0 || from >= marks.length || to < 0 || to >= marks.length) return [...marks];
  const next = [...marks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The marks the in-reader picker offers directly, in preset order.
 *
 * Disabled marks are skipped rather than counted, so disabling the third mark promotes the sixth into
 * the row instead of leaving a gap. Order is preset order and never most-recently-used: an MRU row
 * rearranges itself under the reader's finger, and this control gets hit dozens of times per session.
 */
export function quickMarks(preset: MarkSet, count = 5): AnnotationMark[] {
  return preset.marks.filter((m) => m.enabled).slice(0, count);
}

/**
 * The mark a new NOTE should get, or undefined for none.
 *
 * Absent means **none**, deliberately: an unmarked note is a supported permanent state (a note with no
 * highlight is a normal thing to want), and defaulting to a mark would put a color on the page for every
 * note whether or not the reader meant one.
 */
export function noteMark(preset: MarkSet & { noteMarkId?: string }): AnnotationMark | undefined {
  if (!preset.noteMarkId) return undefined;
  // A pointer at a deleted mark reads as unset rather than as an error.
  return preset.marks.find((m) => m.id === preset.noteMarkId && m.enabled);
}

/**
 * The mark the listening Highlight button applies.
 *
 * Absent falls back to the FIRST ENABLED mark, resolved here rather than stamped when the preset was made:
 * "position one" as a stored index would go stale the moment the reader reordered their marks, and as a
 * stored id it would stop being position one. Once the reader picks a mark explicitly it is pinned by id,
 * so reordering does not move it.
 */
export function audioMark(preset: MarkSet & { audioMarkId?: string }): AnnotationMark | undefined {
  const pinned = preset.audioMarkId ? preset.marks.find((m) => m.id === preset.audioMarkId && m.enabled) : undefined;
  return pinned ?? preset.marks.find((m) => m.enabled);
}

// ── Per-mark tracking: the merge (design doc, §Per-mark tracking) ────────────────────────────────────
//
// Two sentences govern all of this:
//   The preset owns what a mark IS. The book owns how it's USED.
//   A mark survives a change only if annotations depend on it — unless you made it here.

/**
 * What happens to the annotations carrying one mark when a book changes preset.
 *
 * A sentinel and an object rather than `string | 'local'`, which collapses to
 * `string` and would let a typo pass as a mark id.
 */
export type RemapChoice = 'local' | { markId: string };

/** Has the reader made any of this book's marks their own? Derived, not stored — the fact lives on the
 *  marks, and a book-level copy of it could only ever fall out of step with them. */
export function isCustomized(book: BookPreset): boolean {
  return book.marks.some((m) => m.local);
}

/**
 * The marks a book OFFERS: active in the preset, and not turned off in this book.
 *
 * **Both conditions, in one function, because the reader's question is one question.** `enabled` is the preset's
 * ("retired everywhere") and `hiddenMarkIds` is the book's ("I don't mark with this in this novel"), and the reason
 * they are separate fields is an implementation one: turning a mark off for one book must not fork its definition.
 * Nothing downstream cares which of the two says no — the chips, the `…` list and the two role marks all want the same
 * answer, and filtering on `enabled` alone would make turning a mark off in a book do nothing at all.
 *
 * **Drawing does not go through here.** An annotation made with a mark that is now off keeps its appearance and its
 * name: this decides what a reader is offered next, not what the page already says.
 */
export function offeredMarks(book: BookPreset): BookMark[] {
  const off = new Set(book.hiddenMarkIds ?? []);
  return book.marks.filter((m) => m.enabled && !off.has(m.id));
}

/**
 * Bring a book's copy up to a newer revision of the SAME preset.
 *
 * | in the book | in the template | result |
 * |---|---|---|
 * | tracked | present | definition replaced, position kept |
 * | tracked | dropped | kept as local if annotations use it, else removed |
 * | local | — | never touched |
 * | — | present | inserted after the tracked mark it follows upstream |
 *
 * **Forward only.** Another device may hold the template at an older revision than the book's copy came
 * from; without the guard, opening that book there would treat the stale template as truth and quietly
 * revert the marks. When the book is ahead, this returns it untouched — that case belongs to the
 * "this book carries newer marks" prompt, not to a silent merge.
 *
 * Insertion position rather than append, because order decides the quick row: a mark the preset author put
 * second would otherwise arrive buried below the fold in every existing book and stay invisible there.
 */
/**
 * Restore `local` on marks that can only be the book's own, by comparing against the template.
 *
 * A tracked mark came from the template BY DEFINITION, so a mark in the book's copy whose id the template
 * does not have cannot be tracked. `local` is therefore a record of provenance, not the only source of it —
 * and provenance that can be re-derived should be, because a flag can be lost, and a file that has lost it
 * cannot be repaired from the file alone.
 *
 * Only when the revisions are EQUAL, which is what makes the inference sound. Behind the template, a mark
 * absent from it is exactly the case `mergeBookPreset` decides (keep as local if in use, else drop) and
 * pre-empting that would stop a dropped preset mark from ever propagating. Ahead of it — a rolled-back
 * library — a mark absent from the stale template may well be one a later revision added and this book
 * already merged, so it could be genuinely tracked. Equal revisions leave only one explanation.
 *
 * Returns the same object when there is nothing to repair, so callers can short-circuit on identity.
 */
// Exported for its own tests, not for callers — the only caller is `mergeBookPreset` below. Its rules are
// subtle enough (equal revisions only, wrong in both directions) that they are worth testing directly.
// fallow-ignore-next-line unused-export
export function inferLocalMarks(book: BookPreset, template: AnnotationPreset): BookPreset {
  const upstream = new Set(template.marks.map((m) => m.id));
  // The flag can be wrong in BOTH directions.
  //
  // Missing on a mark the template does not have: it can only be the book's own.
  //
  // Present on a mark the template DOES have: impossible by design, because every path that makes a mark
  // local gives it a fresh id — `copyMarkIntoBook`, Add mark, the survivor rule, promotion. Only a bug puts
  // one there.
  //
  // The exception is a legacy `customized: true` copy, which is read as all-local ON PURPOSE — there is no
  // per-mark provenance in those files, so the book stops tracking rather than guess. Clearing there would
  // silently resume tracking and overwrite the reader's edits at the next template bump.
  const clearable = !book.customized;
  const wrong = (m: BookMark): boolean => (m.local ? clearable && upstream.has(m.id) : !upstream.has(m.id));
  if (!book.marks.some(wrong)) return book;
  return {
    ...book,
    marks: book.marks.map((m) => {
      if (!wrong(m)) return m;
      if (m.local) {
        const { local: _local, ...tracked } = m;
        return tracked;
      }
      return { ...m, local: true as const };
    }),
  };
}

/**
 * Insert a template mark into `marks` where the template's order says it belongs.
 *
 * After the nearest preceding template mark the book already has; front of the list if there is none. Shared by
 * the merge and by `adoptFreedPresetMarks`, so a mark that arrives late lands where one that arrived on time
 * would have — order decides the quick row, and a mark appearing at the end of the bar because of when it
 * happened to become unblocked would be the book disagreeing with the preset for no reason.
 */
function insertInTemplateOrder(marks: BookMark[], template: AnnotationPreset, index: number): void {
  let at = 0;
  for (let j = index - 1; j >= 0; j--) {
    const k = marks.findIndex((m) => m.id === template.marks[j].id);
    if (k >= 0) {
      at = k + 1;
      break;
    }
  }
  marks.splice(at, 0, { ...template.marks[index] });
}

/**
 * **The one rule for what happens when a mark the book owns and a mark from the preset wear one appearance.**
 *
 * `(color, treatment, treatmentColor)` is a mark's identity here, so the two cannot both stand — and which of
 * them goes is not a coin toss. Three branches, in this order:
 *
 * 1. **Nothing a reader could tell apart** (`clashDifference` is null — same name, same badge, same active
 *    state): the preset's mark wins, silently. Keeping the book's would look identical and quietly stop that
 *    mark following the preset, which is a consequence nobody asked for and nobody could see.
 * 2. **The book's mark has never been used**: the preset's mark wins, silently. An unused mark is a definition,
 *    not meaning attached to passages; nothing moves, and the only loss is the name it was given.
 * 3. **Otherwise**: the book's mark holds its appearance and the preset's mark is NOT added. Annotations depend
 *    on it, and replacing it would relabel them — "Stuff I hate" becoming "Stuff I love" because both are a
 *    yellow underline. A switch offers this as a choice and defaults to it; a merge, which has no dialog, takes
 *    it automatically.
 *
 * The outcome is the whole record: "is this appearance claimed by a mark the book owns?" is re-asked every time,
 * so nothing has to be remembered and nothing can fall out of step.
 */
type ClashOutcome = 'preset-wins' | 'book-wins';

function clashOutcome(from: BookMark, to: AnnotationMark, isInUse: (markId: string) => boolean): ClashOutcome {
  if (clashDifference(from, to) === null) return 'preset-wins';
  return isInUse(from.id) ? 'book-wins' : 'preset-wins';
}

/**
 * Marks from `template` this book does not have because one of its own marks is wearing that appearance.
 *
 * Drives the `*` in the This book list: the reader's question is "why is the preset's mark not here?", and the
 * answer belongs on the mark that is the reason. Returns the BOOK's mark, since that is the row being marked.
 */
export function blockedPresetMarks(book: BookPreset, template: AnnotationPreset | undefined): Set<string> {
  const out = new Set<string>();
  if (!template || book.detached) return out;
  const have = heldMarkIds(book);
  const byAppearance = new Map(book.marks.map((m) => [appearanceKey(m), m.id]));
  const byName = new Map(book.marks.filter((m) => nameKey(m.name)).map((m) => [nameKey(m.name), m.id]));
  for (const t of template.marks) {
    if (have.has(t.id)) continue;
    // A name blocks as a look does — two marks may share neither (§Names are unique too).
    const blocker = byAppearance.get(appearanceKey(t)) ?? byName.get(nameKey(t.name));
    if (blocker !== undefined) out.add(blocker);
  }
  return out;
}

/**
 * Add any mark from the template this book lacks and whose appearance is now free.
 *
 * **Run after any book-scope change, not on a specific trigger.** Editing a mark's appearance frees one;
 * so does deleting a mark. Enumerating the triggers means forgetting one, and this is idempotent, so calling it
 * on every commit costs a comparison and cannot go wrong.
 *
 * It cannot over-reach. The only way a book lacks a template mark is by blocking its appearance: hiding leaves
 * the mark in the book, a mark the survivor rule dropped is no longer in the template, and adding a mark to a
 * preset bumps its revision, which the ordinary merge already handles. Returns the same object when there is
 * nothing to add, so callers can short-circuit on identity.
 */
export function adoptFreedPresetMarks(book: BookPreset, template: AnnotationPreset | undefined): BookPreset {
  if (!template || book.detached || template.id !== book.id) return book;
  const have = heldMarkIds(book);
  const missing = template.marks
    .map((t, i) => ({ t, i }))
    .filter(
      ({ t }) =>
        !have.has(t.id) &&
        !book.marks.some((m) => appearanceKey(m) === appearanceKey(t)) &&
        isMarkNameFree(book.marks, t.name)
    );
  if (!missing.length) return book;
  const marks = book.marks.map((m) => ({ ...m }));
  for (const { i } of missing) insertInTemplateOrder(marks, template, i);
  return { ...book, marks };
}

/**
 * The preset marks that deleting `markId` from the book would bring in: the ones it was holding out by its look or
 * its name — see `blockedPresetMarks`.
 *
 * **They are what the delete dialog offers first.** Deleting a book's Question that keeps the preset's Question out
 * is making room for exactly that mark, so it is the obvious place for the passages to go, though it is not in the
 * book yet. The delete adopts it in the same write (`deleteLocalMark`), so an annotation moved onto it never points
 * at a mark that is not there.
 */
export function marksFreedByDeleting(
  book: BookPreset,
  template: AnnotationPreset | undefined,
  markId: string
): AnnotationMark[] {
  const had = new Set(book.marks.map((m) => m.id));
  const after = adoptFreedPresetMarks({ ...book, marks: book.marks.filter((m) => m.id !== markId) }, template);
  return after.marks.filter((m) => !had.has(m.id));
}

export function mergeBookPreset(
  book: BookPreset,
  template: AnnotationPreset,
  isInUse: (markId: string) => boolean
): BookPreset {
  // A detached book follows nothing, and its marks are all its own — there is no template half to merge, and
  // an id match could only be a coincidence, since detaching clears the id. See `BookPreset.detached`.
  if (book.detached) return book;
  if (template.id !== book.id || template.revision < book.revision) return book;
  // Nothing to merge, but there may be something to repair — see `inferLocalMarks`.
  if (template.revision === book.revision) return inferLocalMarks(book, template);

  const had = heldMarkIds(book);
  const marks: BookMark[] = [];
  for (const m of book.marks) {
    if (m.local) {
      marks.push(m);
      continue;
    }
    const upstream = template.marks.find((t) => t.id === m.id);
    if (upstream) marks.push({ ...upstream });
    // Dropped upstream: it becomes the book's own if anything still points at it, so those annotations keep
    // their name rather than falling back to a stored snapshot.
    else if (isInUse(m.id)) marks.push({ ...m, local: true });
  }

  /**
   * **A merge must not hand the book two marks wearing one appearance**, and it could three ways: a survivor
   * meeting a new template mark that reuses the freed appearance, a mark of the book's own meeting a new
   * template mark that happens to match it, and a template EDIT moving a tracked mark onto an appearance the
   * book's own mark holds. All three are reachable; the third needs nothing unusual at all.
   *
   * There is no dialog here — a merge runs at book open, which is the worst moment to ask anything — so
   * `clashOutcome` decides, and the branch it takes is the same one the switch dialog would default to. Where
   * the book's mark wins, the template's mark simply is not added: `blockedPresetMarks` marks the row that is
   * the reason, and `adoptFreedPresetMarks` brings it in the moment the appearance is freed.
   */
  const keptByAppearance = new Map<string, BookMark>();
  for (const m of marks) keptByAppearance.set(appearanceKey(m), m);

  template.marks.forEach((t, i) => {
    if (had.has(t.id)) return;
    const blocker = keptByAppearance.get(appearanceKey(t));
    if (blocker && clashOutcome(blocker, t, isInUse) === 'book-wins') return;
    if (blocker) {
      // The preset's mark wins: the book's loses its place rather than its annotations — there are none, or
      // nothing about it a reader could tell apart. See `clashOutcome` for which of those it was.
      const at = marks.indexOf(blocker);
      if (at >= 0) marks.splice(at, 1);
      keptByAppearance.delete(appearanceKey(t));
    }
    insertInTemplateOrder(marks, template, i);
    keptByAppearance.set(appearanceKey(t), { ...t });
  });

  /**
   * An upstream EDIT can collide too, and it is decided the same way — but the book's mark keeps its OLD
   * definition rather than being dropped, since it is the template's change that cannot land. The edit is
   * retried on the next revision, and `adoptFreedPresetMarks` cannot help here because the mark is already in
   * the book; only the template moving again, or the blocker changing, clears it.
   */
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const other = marks.find((x, j) => j !== i && appearanceKey(x) === appearanceKey(m));
    if (!other) continue;
    const original = book.marks.find((b) => b.id === m.id);
    // Only an edited tracked mark can be here; restore what the book had.
    if (original && appearanceKey(original) !== appearanceKey(m)) marks[i] = { ...original };
  }

  return {
    ...book,
    name: template.name,
    revision: template.revision,
    marks,
    hiddenMarkIds: pruneHidden(book.hiddenMarkIds, marks),
  };
}

/**
 * The result of promoting a book's marks into a new library preset — see `promoteBookToPreset`.
 */
export interface PromotedPreset {
  /** The new library entry. */
  preset: AnnotationPreset;
  /** The book's copy, rebuilt to track it. */
  book: BookPreset;
  /** Old mark id → new, for the ids that had to be re-minted. The book's annotations must be rewritten
   *  through this in the same write that stores `book`. */
  idMap: Map<string, string>;
}

/**
 * Promote a book's marks into a new library preset, and rebuild the book's copy to track it.
 *
 * Governed by one invariant, which is the whole reason this is not a copy:
 *
 * > **A mark id lives in at most one library preset.**
 *
 * So the two kinds of mark in a book's copy are treated differently, and it is not a special case — it
 * falls out of the invariant:
 *
 * - A mark whose id is **not** in any library preset (the book's own) keeps it. Nothing else can claim that
 *   id, and preserving it means the book's annotations need no rewriting at all.
 * - A mark whose id **is** already in a library preset (one it tracks) is re-minted, and the annotations
 *   carrying it are re-pointed. Keeping it would put one id in two presets, and `duplicatePreset` documents
 *   what that costs: a later remap-on-switch sees the id "already resolving" in the incoming preset, skips
 *   the mapping, and those annotations silently adopt the OTHER preset's definition the moment the two
 *   diverge. Invisible at the moment of the mistake, which is the worst kind.
 *
 * Everything id-shaped travels through the same map: the role pointers and `hiddenMarkIds`, either of which
 * would silently detach otherwise. `local` is cleared on every mark — the point of the operation is that
 * this book's vocabulary IS the preset now, so nothing is exempt from its updates.
 *
 * Hidden marks are INCLUDED. Building the preset from the offered marks only would orphan any annotation
 * using a hidden mark: hiding is a statement about the reader's mark bar, not about what the book depends on.
 */
/**
 * Stop this book following its preset: every mark becomes the book's own, and nothing propagates in again.
 *
 * **Not a state you fall into — one you can ask for.** A book can end up with all-local marks by copying each
 * one in, while the line above the list still names a preset it no longer follows in any way that matters. An
 * un-assign would undo itself at the next open; `BookPreset.detached` is what makes the intent survive.
 *
 * **The ids are re-minted, for the same reason `promoteBookToPreset` re-mints.** The preset keeps its own copy
 * of every mark this book is walking away with, so leaving the ids alone would let one id name two definitions
 * the moment either side is edited — and cross-book search, export grouping and a received book all assume an id
 * names one thing. Only ids the library still holds are minted; a mark that was already the book's own keeps
 * its id and its annotations never move.
 *
 * The caller must write `book` and rewrite the annotations through `idMap` in ONE write, exactly as a promotion
 * does — a failure between them would leave annotations pointing at marks that no longer exist.
 */
export function detachBookPreset(
  book: BookPreset,
  isTakenId: (markId: string) => boolean
): { book: BookPreset; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  // `copyOf` goes: it names a preset mark, and a detached book follows no preset.
  const marks: BookMark[] = book.marks.map(({ copyOf: _copyOf, ...m }) => {
    if (!isTakenId(m.id)) return { ...m, local: true as const };
    const id = generateMarkId();
    idMap.set(m.id, id);
    return { ...m, id, local: true as const };
  });
  const moved = (id: string | undefined): string | undefined => (id ? (idMap.get(id) ?? id) : undefined);
  return {
    book: {
      ...book,
      // No template to point at, and `detached` is what keeps that from reading as "never assigned".
      id: '',
      name: '',
      revision: 0,
      detached: true,
      marks,
      hiddenMarkIds: book.hiddenMarkIds?.map((id) => idMap.get(id) ?? id),
      noteMarkId: moved(book.noteMarkId),
      audioMarkId: moved(book.audioMarkId),
    },
    idMap,
  };
}

export function promoteBookToPreset(
  book: BookPreset,
  name: string,
  now: number,
  isTakenId: (markId: string) => boolean
): PromotedPreset {
  const idMap = new Map<string, string>();
  const marks: AnnotationMark[] = book.marks.map((m) => {
    // `copyOf` goes with `local`: in the new preset every mark is the preset's own.
    const { local: _local, copyOf: _copyOf, ...mark } = m;
    if (!isTakenId(m.id)) return mark;
    const id = generateMarkId();
    idMap.set(m.id, id);
    return { ...mark, id };
  });
  const preset: AnnotationPreset = {
    id: generatePresetId(),
    name,
    isDefault: false,
    createdAt: now,
    revision: 1,
    marks: marks.map((m) => ({ ...m })),
  };
  const moved = (id: string | undefined): string | undefined => (id ? (idMap.get(id) ?? id) : undefined);
  return {
    preset,
    book: {
      id: preset.id,
      name,
      // The copy is taken AT revision 1, which is what it is: a preset that has never moved.
      revision: 1,
      marks: marks.map((m) => ({ ...m })),
      hiddenMarkIds: book.hiddenMarkIds?.map((id) => idMap.get(id) ?? id),
      noteMarkId: moved(book.noteMarkId),
      audioMarkId: moved(book.audioMarkId),
    },
    idMap,
  };
}

/**
 * Point a book at a DIFFERENT preset.
 *
 * The incoming preset supersedes the inherited marks, so they survive only where annotations depend on them
 * — carried over as local, since they no longer have a template. Marks the reader made here survive
 * unconditionally: an unused local mark is not leftover inheritance, it is something they named, colored
 * and gave a treatment, and dropping it on a technicality destroys work.
 *
 * The remap dialog runs BEFORE this, so anything it re-pointed is no longer "in use" by the time the
 * survivor rule is applied, and whatever is left can be dropped without asking.
 */
/**
 * What tells two identically-dressed marks apart, from a reader's side — or `null` when nothing does.
 *
 * **The question the warning has to answer is "would I notice?", not "is anything different?"** Every collapse
 * changes the mark's id, and none of them changes what is on the page, so a warning that fired on all of them
 * would be six rows of ceremony for a no-op — and a warning that is usually nothing is one people learn to click
 * past, including the time it says *Stuff I hate* → *Stuff I love*.
 *
 * Three things survive that test, in the order they matter:
 *
 * - **name** — the meaning, and the reason this warning exists at all.
 * - **badge** — compared RESOLVED, because `badgeOf` falls back to one derived from the appearance: identical
 *   appearances give identical defaults, so only a badge somebody typed can differ here. It is what stands in for
 *   the mark in generated notes and PDFs, where color cannot reach.
 * - **enabled** — a mark retired in the incoming preset takes the annotations somewhere the bar will not offer.
 */
export type ClashDifference = 'name' | 'badge' | 'enabled';

function clashDifference(from: AnnotationMark, to: AnnotationMark): ClashDifference | null {
  if (from.name !== to.name) return 'name';
  if (badgeOf(from) !== badgeOf(to)) return 'badge';
  if (from.enabled !== to.enabled) return 'enabled';
  return null;
}

/**
 * The marks this book would LOSE to an identically-dressed mark in `next`, and what replaces each.
 *
 * **Exported so the dialog can say it before it happens.** `switchBookPreset` collapses these — it has to,
 * since `(color, treatment, treatmentColor)` is a mark's identity here and two cannot share one — but
 * appearance is not meaning. A book mark called "Stuff I hate" and an incoming one called "Stuff I love" can
 * wear the same yellow underline, and collapsing them silently would relabel every annotation that used the
 * first. The switch is right; doing it without saying so is not.
 *
 * Same predicate as the switch for WHICH marks collapse, so the two cannot disagree about that. Each entry
 * carries `differs`, and the dialog shows only the entries where that is not null — see `clashDifference`. The
 * switch still collapses every match; under-reporting a difference nobody could perceive is the point.
 */
export function presetSwitchClashes(
  book: BookPreset,
  next: AnnotationPreset,
  isInUse: (markId: string) => boolean
): { from: BookMark; to: AnnotationMark; differs: ClashDifference | null }[] {
  const incoming = new Set(next.marks.map((m) => m.id));
  const byAppearance = new Map(next.marks.map((m) => [appearanceKey(m), m]));
  const out: { from: BookMark; to: AnnotationMark; differs: ClashDifference | null }[] = [];
  for (const m of book.marks) {
    if (incoming.has(m.id) || !(m.local || isInUse(m.id))) continue;
    const to = byAppearance.get(appearanceKey(m));
    if (to) out.push({ from: m, to, differs: clashDifference(m, to) });
  }
  return out;
}

/**
 * The marks this book carries that `next` has a mark of the same NAME for, wearing a different look — and that mark.
 *
 * The dialog's other half to `presetSwitchClashes`: a same-named pair is not a clash of looks, so nothing collapses
 * it, and the switch would otherwise hand the book two marks called Question. `silent` is a mark inherited from the
 * old preset, whose passages move to the namesake without a row; the book's own mark gets a row, defaulted to the
 * namesake, and is renamed if kept (`switchBookPreset`). A look clash takes precedence, since the switch decides
 * that first.
 */
export function presetSwitchNameTwins(
  book: BookPreset,
  next: AnnotationPreset,
  isInUse: (markId: string) => boolean
): Map<string, { to: AnnotationMark; silent: boolean }> {
  const incoming = new Set(next.marks.map((m) => m.id));
  const looks = new Set(next.marks.map(appearanceKey));
  const byName = new Map(next.marks.filter((m) => nameKey(m.name)).map((m) => [nameKey(m.name), m]));
  const out = new Map<string, { to: AnnotationMark; silent: boolean }>();
  for (const m of book.marks) {
    if (incoming.has(m.id) || !(m.local || isInUse(m.id)) || looks.has(appearanceKey(m))) continue;
    const to = byName.get(nameKey(m.name));
    if (to) out.set(m.id, { to, silent: !m.local });
  }
  return out;
}

/** `m`, renamed so it no longer reads as `twin`: a new name, and a typed badge dropped if it is `twin`'s too. */
function renamedBeside(m: BookMark, twin: AnnotationMark, keptName: (name: string) => string): BookMark {
  const out: BookMark = { ...m, name: keptName(m.name.trim()) };
  if (out.badge !== undefined && badgeOf(out) === badgeOf(twin)) delete out.badge;
  return out;
}

export function switchBookPreset(
  book: BookPreset,
  next: AnnotationPreset,
  /**
   * Asked AFTER the reader's plan has moved annotations — which is what makes "Keep in this book" mean what it
   * says, with no second channel to carry the choice.
   *
   * Pick an incoming mark for a clashing row and its annotations move there first, leaving the book's mark
   * unused, so `clashOutcome` lets the preset's mark in and the empty one goes. Choose to keep it and it is
   * still in use, so it holds its appearance and the colliding mark is left out. The dropdown IS the mechanism.
   */
  isInUse: (markId: string) => boolean,
  /** The name a kept mark takes when an arriving mark has its name — see the name pass below. */
  keptName: (name: string) => string = (name) => `${name} (this book)`
): { book: BookPreset; idMap: Map<string, string> } {
  const incoming = new Set(next.marks.map((m) => m.id));
  /**
   * **A survivor the incoming preset already expresses is the same mark, not a second one.**
   *
   * `(color, treatment, treatmentColor)` is this model's identity for a mark — the editor refuses to save a
   * second one wearing an appearance already taken, because two marks that render identically are
   * indistinguishable to a reader. Without the same check here, a switch could hand a book two.
   *
   * Detach-then-reattach makes that easy to hit: detaching re-mints every mark as the book's own, so the same
   * preset arriving again would bring its originals back alongside the copies, and each round trip would add
   * another set.
   *
   * It is not cosmetic. `resolveMark` falls back to matching a color-only annotation — everything made before
   * marks existed — and takes a hit only when exactly one mark matches. Duplicates make it ambiguous, so it
   * returns nothing and the whole back catalog in that book stops resolving.
   *
   * The incoming mark wins and the local copy's annotations are re-pointed to it: the passage keeps its
   * appearance, and the mark it now names is the one the preset will keep updating.
   */
  const byAppearance = new Map(next.marks.map((m) => [appearanceKey(m), m]));
  const idMap = new Map<string, string>();
  // Appearances the reader's kept marks claim — the incoming mark wearing one of these is left out.
  const claimed = new Set<string>();
  const lookKept = book.marks.filter((m) => {
    if (incoming.has(m.id) || !(m.local || isInUse(m.id))) return false;
    const same = byAppearance.get(appearanceKey(m));
    if (same === undefined) return true;
    if (clashOutcome(m, same, isInUse) === 'book-wins') {
      claimed.add(appearanceKey(m));
      return true;
    }
    idMap.set(m.id, same.id);
    return false;
  });
  const arriving = next.marks.filter((m) => !claimed.has(appearanceKey(m)));
  /**
   * **Then by name: a survivor called what an arriving mark is called would be a second one.** Two marks named
   * Question, one teal and one green, show as two identical rows in the mark bar and read as one in every export.
   *
   * Unused, the book's mark goes: nothing points at it, and the preset brings the meaning. Inherited from the old
   * preset, its passages move to the namesake too, without asking: the preset that defined the mark has been
   * replaced by one that defines it again, in another look. Only the book's OWN mark in use stays — the reader made
   * that look, was offered the preset's mark (the dialog defaults to it), and kept theirs — and it is renamed so the
   * two can be told apart. A typed badge that matches goes too, back to the default its own look gives it, which
   * differs because the looks do.
   */
  const byName = new Map(arriving.filter((m) => nameKey(m.name)).map((m) => [nameKey(m.name), m]));
  const carried: BookMark[] = [];
  for (const m of lookKept) {
    const twin = byName.get(nameKey(m.name));
    if (!twin) carried.push(m);
    else if (m.local && isInUse(m.id)) carried.push(renamedBeside(m, twin, keptName));
    else idMap.set(m.id, twin.id);
  }
  // A switch re-seeds the tracked set, so the new preset's order leads and the survivors follow in the
  // relative order the book had them.
  const marks: BookMark[] = [
    ...arriving.map((m) => ({ ...m })),
    ...carried.map((m) => ({ ...m, local: true as const })),
  ];
  const moved = (id: string | undefined): string | undefined => (id ? (idMap.get(id) ?? id) : undefined);
  return {
    book: {
      id: next.id,
      name: next.name,
      revision: next.revision,
      marks,
      hiddenMarkIds: pruneHidden(
        book.hiddenMarkIds?.map((id) => idMap.get(id) ?? id),
        marks
      ),
      noteMarkId: moved(book.noteMarkId),
      audioMarkId: moved(book.audioMarkId),
    },
    idMap,
  };
}

/** The appearance fields an annotation carries. Structural, so `Highlight` and `Note` both satisfy it
 *  without this module importing either. */
type AnnotationLike = { markId?: string; color?: string; treatment?: Treatment; treatmentColor?: string };

/**
 * Apply a remap plan to one annotation.
 *
 * A retargeted annotation takes the new mark's APPEARANCE into its snapshot as well as its id: the snapshot
 * is what shows if that mark is ever deleted, so leaving the old one there would resurrect a look the reader
 * had already moved away from. There is deliberately no "leave unmarked" choice: it would strip the `markId`
 * while keeping the color and treatment on the page, which is the one way a passage selection can end up
 * markless in a current file — a state eager preset assignment exists to retire. Keeping a mark in the book costs
 * a row in its list; the alternative would cost a permanent hole in the model, for a case nobody asked for. The
 * passage stays exactly as it looks today — just nameless. `'local'` changes nothing; the mark is coming
 * along.
 */
export function applyRemap<T extends AnnotationLike>(
  annotation: T,
  plan: ReadonlyMap<string, RemapChoice>,
  marks: readonly AnnotationMark[]
): T {
  const choice = annotation.markId ? plan.get(annotation.markId) : undefined;
  if (!choice || choice === 'local') return annotation;
  const to = marks.find((m) => m.id === choice.markId);
  if (!to) return annotation;
  return {
    ...annotation,
    markId: to.id,
    color: to.highlightColor ?? 'transparent',
    treatment: to.treatment,
    treatmentColor: to.treatmentColor,
  };
}

/**
 * What becomes of a book's annotations when one of its OWN marks is deleted.
 *
 * Pure, and separate from the write, because the rule is the interesting part: **a passage selection cannot
 * outlive its mark, and a note can.** A selection is a mark on some words — with no mark it is an appearance
 * with no meaning, which is the markless state `applyRemap` refuses to create and which `markKeyOf` cannot even
 * file under `NO_MARK`, since the id is still there. A note is words the reader wrote, and an unmarked note is a
 * supported permanent state, so it stays and gives up its mark.
 *
 * The snapshot goes with the id on that path: `color` and `treatment` are only read when `markId` fails to
 * resolve, so leaving them would draw the mark that was just deleted.
 *
 * `marks` is the list AFTER the deletion, which is what a remap target must be found in.
 */
export function applyMarkDeletion<H extends AnnotationLike, N extends AnnotationLike>(
  markId: string,
  choice: RemapChoice | 'remove',
  marks: readonly AnnotationMark[],
  content: { highlights: readonly H[]; notes: readonly N[] }
): { highlights: H[]; notes: N[]; removed: H[] } {
  if (choice === 'remove') {
    return {
      highlights: content.highlights.filter((h) => h.markId !== markId),
      notes: content.notes.map((n) =>
        n.markId === markId ? { ...n, markId: undefined, color: undefined, treatment: undefined } : n
      ),
      // **Handed back, not left for the caller to work out.** A drawn annotation is taken off the page by
      // `deleteAnnotation`, and `redrawAnnotations` only re-adds what SURVIVES — so anything dropped here is
      // never visited again and its overlay stays on screen until the book is reopened. This list makes that
      // impossible to write: the function that decides what goes also says what to erase.
      removed: content.highlights.filter((h) => h.markId === markId),
    };
  }
  const plan = new Map<string, RemapChoice>([[markId, choice]]);
  return {
    highlights: content.highlights.map((h) => applyRemap(h, plan, marks)),
    notes: content.notes.map((n) => applyRemap(n, plan, marks)),
    // A remap deletes nothing: `redrawAnnotations` re-adds each one, and foliate clears the old drawing first.
    removed: [],
  };
}

/**
 * Make a book's own copy of one tracked mark. **The copy replaces the original**: it takes the original's place
 * in the order, its roles and whether it is active here, and the original leaves the book.
 *
 * The copy records the original's id in `copyOf`, which is how the preset rules know the book already has that
 * mark — see `heldMarkIds`. Nothing of the original stays behind to be listed, switched back on, or hold the look
 * the copy may want to return to. The caller moves the annotations onto the copy in the same write.
 *
 * Returns null when there is nothing to copy: no such mark, or one the book already owns.
 */
export function copyMarkLocally(book: BookPreset, markId: string, newId: string): BookPreset | null {
  const source = book.marks.find((m) => m.id === markId);
  if (!source || source.local) return null;
  const copy: BookMark = { ...source, id: newId, local: true, copyOf: markId };
  const moved = (id: string | undefined): string | undefined => (id === markId ? newId : id);
  return {
    ...book,
    marks: book.marks.map((m) => (m.id === markId ? copy : m)),
    hiddenMarkIds: book.hiddenMarkIds?.map((id) => (id === markId ? newId : id)),
    noteMarkId: moved(book.noteMarkId),
    audioMarkId: moved(book.audioMarkId),
  };
}

/** Drop hidden ids for marks that no longer exist, so the list cannot grow without bound. */
function pruneHidden(hidden: string[] | undefined, marks: readonly BookMark[]): string[] | undefined {
  if (!hidden?.length) return undefined;
  const ids = new Set(marks.map((m) => m.id));
  const kept = hidden.filter((id) => ids.has(id));
  return kept.length ? kept : undefined;
}

/** Resolve an annotation's mark. `markId` first; falls back to a UNIQUE color match so annotations
 *  predating presets still resolve (see `seedBuiltinPreset`). Ambiguous color → undefined, which
 *  renders from the stored hex with no name. */
export function resolveMark(
  preset: MarkSet | null | undefined,
  annotation: { markId?: string; color?: string }
): AnnotationMark | undefined {
  if (!preset) return undefined;
  if (annotation.markId) return preset.marks.find((m) => m.id === annotation.markId);
  if (!annotation.color) return undefined;
  // Matched against the WASH: a color-only annotation predates the split, so its hex is always a
  // highlighter color. A line-only mark could never have been what it meant.
  const c = normalizeColor(annotation.color);
  const hits = preset.marks.filter((m) => m.highlightColor && normalizeColor(m.highlightColor) === c);
  return hits.length === 1 ? hits[0] : undefined;
}

/**
 * The five marks the shipped preset is made of: an identity, a color, and a badge — in the order they appear.
 *
 * **They are named for what they MEAN, not for their color.** A color name is a fact you can already see, so a
 * list of them would say nothing five times over — and it is the FIRST thing anyone opens, so it would also teach
 * that a mark is a color rather than a meaning. The names are a starting vocabulary; anyone who disagrees
 * duplicates the preset and renames, which is one tap and the documented way past the lock.
 *
 * **The color is stated per mark rather than taken from `HIGHLIGHT_COLORS[i]`.** An index into the same list in
 * the same order would tie the palette's order to this one, so reordering these five would silently hand each mark
 * its neighbor's color — and a mark's color is what resolves the whole back catalog (see `resolveMark`). The
 * set must stay unchanged for that reason; only the order is ours to choose.
 *
 * **The badge is stated too, so it survives a recolour.** A derived badge tracks the appearance, which is right
 * for a mark whose badge nobody has thought about and wrong for these: `🔑` says "key point" in an exported note
 * where `🟡` says "yellow", and a reader who recolours their copy of this mark means to keep the meaning. Stating
 * it is what makes it stick — see `changeAppearance`, which only re-derives a badge the reader never chose. Empty
 * the field in the editor and derivation comes back.
 *
 * Order: the listening highlight leads, because that is the one a tap in the player applies.
 */
const BUILTIN_MARKS = [
  { key: 'yellow', color: '#FFEB3B', badge: '🔑' },
  { key: 'purple', color: '#CE93D8', badge: '💬' },
  { key: 'green', color: '#A5D6A7', badge: '❓' },
  { key: 'blue', color: '#90CAF9', badge: '📘' },
  { key: 'orange', color: '#FFAB91', badge: '⚠️' },
] as const;

export type BuiltinMarkKey = (typeof BUILTIN_MARKS)[number]['key'];

/**
 * The built-in preset's id, and its marks', are FIXED STRINGS rather than generated.
 *
 * Every device seeds its own library — `data.json` is plugin settings, which sync only if the user syncs
 * settings, while a book's `.orbis` copy always travels with the vault. With generated ids, the built-in
 * preset on a phone and the identical one on a tablet would be different presets with different marks, so a
 * book annotated on either would resolve nothing on the other: same names, same colors, no shared identity.
 *
 * Fixed ids give the one preset every vault starts with a shared identity across devices, which is what
 * makes an annotation made anywhere resolve everywhere. `ap_`/`mk_` prefixed like generated ids so
 * nothing has to special-case them, and `_builtin_` cannot collide with a base36 timestamp.
 */
export const BUILTIN_PRESET_ID = 'ap_builtin';

/**
 * **The shipped preset's revision, and it MOVES when its contents move.**
 *
 * A fixed id only means "the same preset everywhere" if what is under it is the same everywhere too: a change to
 * the five marks shipped without a bump would leave one vault holding "Key point" and another holding "Yellow"
 * under one locked identity, which is the divergence the lock exists to prevent.
 *
 * So the rule is: **Orbis changes the contents, Orbis bumps this.** That does three things at once. It makes the
 * change travel, because a preset whose hash moved is a preset the sync stamps and publishes. It makes it arrive in
 * BOOKS, because `mergeBookPreset` is forward-only and treats equal revisions as nothing to merge — so without a
 * bump, every already-annotated book would keep the old names in its own copy for ever. And it removes the need for
 * anybody to factory-reset a device to see a rename, which is the only alternative and does not survive contact
 * with several synced devices.
 *
 * A book's own copy is still the truth for what it renders, and a mark the reader made their own is still never
 * touched — see the survivor rule. What a bump changes is the tracked marks, which are the preset's to change.
 */
export const BUILTIN_PRESET_REVISION = 2;

export function builtinMarkId(key: BuiltinMarkKey): string {
  return `mk_builtin_${key}`;
}

/**
 * The built-in preset is READ-ONLY, and lock is derived from the id rather than stored as a flag.
 *
 * A fixed id only means "the same preset everywhere" if its contents are the same everywhere too. Left
 * editable, two devices could hold different marks under one identity — divergence hiding behind sameness,
 * which is worse than two unrelated ids. Locked, nobody can move it out of step with anybody else.
 *
 * **What the lock does NOT mean is that its revision never moves.** The same argument that makes the lock worth
 * having applies to Orbis changing the contents: a rename shipped without a bump leaves one device
 * holding "Key point" and another holding "Yellow" under one identity, which is exactly the divergence being
 * prevented. Orbis bumps it, nobody else can — see `BUILTIN_PRESET_REVISION`.
 *
 * The cost is small because the escape hatches are good: **This book** edits a single book's copy without
 * touching any template, and Duplicate gives an editable copy for everything else. Locking it also makes
 * "Reset to preset" meaningful, since there is always a pristine thing to reset TO.
 */
export function isBuiltinPreset(preset: Pick<AnnotationPreset, 'id'>): boolean {
  return preset.id === BUILTIN_PRESET_ID;
}

/**
 * The five-mark starting structure.
 *
 * Shared by the first-run seed AND by "new preset", because a new preset is almost always "the
 * default, with my meanings" rather than "start from nothing" — an empty or one-mark preset is a dead
 * end until the user finds Add mark.
 *
 * `ids` exists for exactly one caller: the built-in seed, which needs the fixed ids above. A NEW preset
 * must get generated ids — canonical ones there would collide with the built-in and with every other new
 * preset, silently merging three different marks into one identity.
 *
 * `name` is resolved by the caller (i18n lives in the UI layer) so this module stays pure.
 */
export function defaultMarks(
  markName: (key: BuiltinMarkKey) => string,
  ids: (key: BuiltinMarkKey) => string = () => generateMarkId()
): AnnotationMark[] {
  return BUILTIN_MARKS.map(({ key, color, badge }) => ({
    id: ids(key),
    name: markName(key),
    badge,
    // Wash only, no line — the five base colors.
    highlightColor: color,
    enabled: true,
  }));
}

/** The mark that leads the shipped preset, by id — the one both roles are pinned to. */
function leadBuiltinMarkId(): string {
  return builtinMarkId(BUILTIN_MARKS[0].key);
}

/**
 * The preset every vault starts with: the five base colors, all washes.
 *
 * This is what makes the feature retroactive. Those five hexes are exactly what every color-only
 * annotation carries, and because `(color, treatment)` is unique here, `resolveMark` can resolve the
 * whole back catalog by color with no rewrite of stored data.
 */
/**
 * Put the shipped preset into a library: seeded if it has never been there, REPLACED if what is there is older than
 * this version's. Mutates `presets`; answers whether anything changed, so the caller knows whether to save.
 *
 * **Replacing is what lets Orbis rename its own marks.** Installing only when absent would mean a vault keeps
 * whatever contents it was first given for ever, so a change to the shipped marks could only be seen by
 * factory-resetting a device — no answer at all for a vault synced across several of them. It is safe precisely
 * because the preset is read-only: there is no user edit under that id to overwrite. See `BUILTIN_PRESET_REVISION`.
 *
 * Its POSITION and its two usage flags survive. `isDefault` and `inactive` are the vault's decisions ABOUT the
 * preset rather than part of what the preset is, and a re-seed that reset them would be Orbis quietly answering a
 * question the reader had already answered. `createdAt` too: it is the same preset, and re-dating it would make an
 * upgrade look like a new arrival wherever the list is ordered or described by age.
 *
 * Pure, and a function rather than a method, because the interesting behavior is the three-way decision — absent,
 * stale, current — and a private method on the plugin is a decision no test can reach.
 */
export function installBuiltinPreset(presets: AnnotationPreset[], seed: AnnotationPreset): boolean {
  const at = presets.findIndex((p) => p.id === BUILTIN_PRESET_ID);
  const held = at >= 0 ? presets[at] : undefined;
  if (held && held.revision >= seed.revision) return false;
  if (held) {
    presets[at] = { ...seed, isDefault: held.isDefault, inactive: held.inactive, createdAt: held.createdAt };
    return true;
  }
  // A vault that already has a default keeps it: this is arriving alongside presets somebody chose between.
  presets.unshift({ ...seed, isDefault: !presets.some((p) => p.isDefault) });
  return true;
}

export function seedBuiltinPreset(
  markName: (key: BuiltinMarkKey) => string,
  presetName: string,
  now: number
): AnnotationPreset {
  return {
    id: BUILTIN_PRESET_ID,
    name: presetName,
    isDefault: true,
    createdAt: now,
    revision: BUILTIN_PRESET_REVISION,
    marks: defaultMarks(markName, builtinMarkId),
    /**
     * **Both roles pinned to the leading mark, rather than left to the fallbacks.**
     *
     * The audio role would resolve to it anyway — absent falls back to the first enabled mark — but only by accident
     * of position, and the glyph in the list would then claim a choice nobody had made. The note role has no
     * fallback at all, so unpinned, the preset every vault starts with would have no default mark for a new note.
     *
     * One mark holding both is deliberate: what you highlight while listening and what you write a note about are
     * the same act at different lengths, and a reader who wants them apart has one mark to repoint rather than two
     * to discover. Pinned by ID, so reordering the list never moves either role.
     */
    noteMarkId: leadBuiltinMarkId(),
    audioMarkId: leadBuiltinMarkId(),
  };
}
