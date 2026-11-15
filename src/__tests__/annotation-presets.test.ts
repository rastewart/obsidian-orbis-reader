import { describe, expect, it } from 'vitest';
import {
  type AnnotationMark,
  type AnnotationPreset,
  activePresets,
  adoptFreedPresetMarks,
  applyMarkDeletion,
  applyRemap,
  audioMark,
  BADGE_MAX,
  type BookMark,
  type BookPreset,
  BUILTIN_PRESET_ID,
  BUILTIN_PRESET_REVISION,
  badgeOf,
  blockedPresetMarks,
  bookPresetFrom,
  builtinMarkId,
  colorEntry,
  copyMarkLocally,
  defaultBadge,
  defaultMarks,
  detachBookPreset,
  duplicatePreset,
  emojiForColor,
  firstFreeAppearance,
  HIGHLIGHT_COLORS,
  INK,
  installBuiltinPreset,
  isBuiltinPreset,
  isCustomized,
  isInk,
  isMarkAppearanceFree,
  isMarkNameFree,
  MARK_PALETTE,
  marksAnything,
  marksFreedByDeleting,
  mergeBookPreset,
  migrateMark,
  migrateMarks,
  moveMark,
  normalizeColor,
  noteMark,
  offeredMarks,
  presetFromBookCopy,
  presetSwitchClashes,
  presetSwitchNameTwins,
  principalColor,
  promoteBookToPreset,
  quickMarks,
  resolveInk,
  resolveMark,
  seedBuiltinPreset,
  switchBookPreset,
  TREATMENTS,
  type Treatment,
} from '../annotation-presets';

/** A wash-only mark, which is what most of these tests care about. Pass a treatment for a line-only one. */
function mark(id: string, color: string, treatment?: Treatment, enabled = true): AnnotationMark {
  return treatment
    ? { id, name: id, treatment, treatmentColor: color, enabled }
    : { id, name: id, highlightColor: color, enabled };
}

function preset(marks: AnnotationMark[]): AnnotationPreset {
  return { id: 'p1', name: 'P', isDefault: true, createdAt: 0, revision: 1, marks };
}

describe('normalizeColor', () => {
  it('makes hex comparison case- and whitespace-insensitive', () => {
    expect(normalizeColor(' #ffeb3b ')).toBe('#FFEB3B');
  });
});

describe('isMarkAppearanceFree', () => {
  const marks = [mark('a', '#FFEB3B'), mark('b', '#A5D6A7', 'underline')];

  it('rejects an exact repeat of the whole appearance', () => {
    expect(isMarkAppearanceFree(marks, { highlightColor: '#FFEB3B' })).toBe(false);
  });

  it('allows the same colour in the OTHER channel', () => {
    // A yellow wash and a yellow underline look nothing alike, so they are different marks.
    expect(isMarkAppearanceFree(marks, { treatment: 'underline', treatmentColor: '#FFEB3B' })).toBe(true);
  });

  it('allows the same wash once a line is added to it', () => {
    // The point of splitting the channels: "yellow wash" and "yellow wash + green underline" coexist.
    expect(
      isMarkAppearanceFree(marks, { highlightColor: '#FFEB3B', treatment: 'underline', treatmentColor: '#A5D6A7' })
    ).toBe(true);
  });

  it('allows the same line kind in a different colour', () => {
    expect(isMarkAppearanceFree(marks, { treatment: 'underline', treatmentColor: '#90CAF9' })).toBe(true);
  });

  it('compares colours case-insensitively', () => {
    expect(isMarkAppearanceFree(marks, { highlightColor: '#ffeb3b' })).toBe(false);
  });

  it('ignores the mark being edited, so saving it unchanged is not a clash with itself', () => {
    expect(isMarkAppearanceFree(marks, { highlightColor: '#FFEB3B' }, 'a')).toBe(true);
  });
});

describe('marksAnything', () => {
  it('is false for a mark with neither channel — it would draw nothing at all', () => {
    expect(marksAnything({})).toBe(false);
  });

  it('is true with either channel alone', () => {
    expect(marksAnything({ highlightColor: '#FFEB3B' })).toBe(true);
    expect(marksAnything({ treatment: 'box', treatmentColor: '#FFEB3B' })).toBe(true);
  });
});

describe('firstFreeAppearance', () => {
  it('returns the first palette colour as a plain wash for an empty preset', () => {
    expect(firstFreeAppearance([])).toEqual({ highlightColor: HIGHLIGHT_COLORS[0] });
  });

  it('exhausts the washes before offering any line', () => {
    // A new mark almost always wants a wash; lines are the less obvious axis and read as a mistake if
    // offered while a plain color is still free.
    const taken = [mark('a', HIGHLIGHT_COLORS[0])];
    expect(firstFreeAppearance(taken)).toEqual({ highlightColor: HIGHLIGHT_COLORS[1] });
  });

  it('moves to lines once every wash colour is used', () => {
    const taken = HIGHLIGHT_COLORS.map((c, i) => mark(`f${i}`, c));
    expect(firstFreeAppearance(taken)).toEqual({ treatment: 'underline', treatmentColor: HIGHLIGHT_COLORS[0] });
  });

  it('walks colours within a line kind before changing kind', () => {
    const taken = [...HIGHLIGHT_COLORS.map((c, i) => mark(`f${i}`, c)), mark('u0', HIGHLIGHT_COLORS[0], 'underline')];
    expect(firstFreeAppearance(taken)).toEqual({ treatment: 'underline', treatmentColor: HIGHLIGHT_COLORS[1] });
  });

  it('falls back to the first wash when every combination is taken', () => {
    const taken = [
      ...HIGHLIGHT_COLORS.map((c, i) => mark(`f${i}`, c)),
      ...TREATMENTS.flatMap((tr) => HIGHLIGHT_COLORS.map((c, i) => mark(`${tr}${i}`, c, tr))),
    ];
    expect(firstFreeAppearance(taken)).toEqual({ highlightColor: HIGHLIGHT_COLORS[0] });
  });
});

describe('migrateMark', () => {
  it('turns a legacy fill into the wash channel', () => {
    expect(migrateMark({ id: 'a', name: 'Yellow', color: '#FFEB3B', treatment: 'fill', enabled: true })).toEqual({
      id: 'a',
      name: 'Yellow',
      badge: undefined,
      enabled: true,
      highlightColor: '#FFEB3B',
    });
  });

  it('turns a legacy line treatment into the line channel, in the same colour', () => {
    const m = migrateMark({ id: 'b', name: 'Green', color: '#A5D6A7', treatment: 'squiggle', enabled: true });
    expect(m).toMatchObject({ treatment: 'squiggle', treatmentColor: '#A5D6A7' });
    expect(m?.highlightColor).toBeUndefined();
  });

  it('passes a mark already in the new shape through unchanged, so it is idempotent', () => {
    const now = { id: 'c', name: 'Both', highlightColor: '#FFEB3B', treatment: 'box', treatmentColor: '#90CAF9' };
    expect(migrateMark(now)).toMatchObject(now);
    expect(migrateMark(migrateMark(now))).toMatchObject(now);
  });

  it('keeps the badge and the disabled flag', () => {
    expect(
      migrateMark({ id: 'd', name: 'X', color: '#FFEB3B', treatment: 'fill', badge: 'URG', enabled: false })
    ).toMatchObject({ badge: 'URG', enabled: false });
  });

  it('gives a line with no colour one, rather than leaving it undrawable', () => {
    expect(migrateMark({ id: 'e', name: 'X', treatment: 'underline' })?.treatmentColor).toBe(INK);
  });

  it('drops anything that cannot draw or has no identity', () => {
    expect(migrateMark({ id: 'f', name: 'X' })).toBeNull();
    expect(migrateMark({ name: 'no id' })).toBeNull();
    expect(migrateMark(null)).toBeNull();
  });

  it('filters a whole list, keeping order', () => {
    const out = migrateMarks([
      { id: 'a', name: 'A', color: '#FFEB3B', treatment: 'fill' },
      { id: 'bad', name: 'B' },
      { id: 'c', name: 'C', color: '#A5D6A7', treatment: 'underline' },
    ]);
    expect(out.map((m) => m.id)).toEqual(['a', 'c']);
  });
});

describe('moveMark', () => {
  const marks = [mark('a', '#1'), mark('b', '#2'), mark('c', '#3')];

  it('moves a mark down', () => {
    expect(moveMark(marks, 0, 1).map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('moves a mark up', () => {
    expect(moveMark(marks, 2, -1).map((m) => m.id)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op past either end, so up/down buttons need no bounds check', () => {
    expect(moveMark(marks, 0, -1).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(moveMark(marks, 2, 1).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('never mutates the input — array position is the stored order', () => {
    moveMark(marks, 0, 2);
    expect(marks.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('quickMarks', () => {
  it('takes the first N in preset order', () => {
    const p = preset([mark('a', '#1'), mark('b', '#2'), mark('c', '#3')]);
    expect(quickMarks(p, 2).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('skips disabled marks instead of counting them', () => {
    // Disabling the 2nd must promote the 3rd into the row, not leave a hole in it.
    const p = preset([mark('a', '#1'), mark('b', '#2', undefined, false), mark('c', '#3')]);
    expect(quickMarks(p, 2).map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('returns everything when the preset is shorter than the count', () => {
    expect(quickMarks(preset([mark('a', '#1')]), 5)).toHaveLength(1);
  });
});

describe('resolveMark', () => {
  const p = preset([mark('a', '#FFEB3B'), mark('b', '#A5D6A7', 'underline')]);

  it('prefers markId', () => {
    expect(resolveMark(p, { markId: 'b', color: '#FFEB3B' })?.id).toBe('b');
  });

  it('returns undefined for a markId no longer in the preset', () => {
    // A deleted mark's id is never reused, so this stays unresolvable rather than resolving to
    // whatever now occupies that slot.
    expect(resolveMark(p, { markId: 'gone' })).toBeUndefined();
  });

  it('falls back to a unique color match, which is what makes old annotations resolve', () => {
    expect(resolveMark(p, { color: '#ffeb3b' })?.id).toBe('a');
  });

  it('refuses an ambiguous color match', () => {
    // Two marks whose WASH is the same color: which one a color-only annotation meant is unknowable.
    const dup = preset([
      mark('a', '#FFEB3B'),
      {
        id: 'b',
        name: 'b',
        highlightColor: '#FFEB3B',
        treatment: 'squiggle',
        treatmentColor: '#000000',
        enabled: true,
      },
    ]);
    expect(resolveMark(dup, { color: '#FFEB3B' })).toBeUndefined();
  });

  it('is not confused by a LINE in the same colour', () => {
    // A color-only annotation's stored hex is always a wash — so a line-only mark in that color is never
    // what it meant, and does not make the match ambiguous.
    const p2 = preset([mark('a', '#FFEB3B'), mark('b', '#FFEB3B', 'underline')]);
    expect(resolveMark(p2, { color: '#FFEB3B' })?.id).toBe('a');
  });

  it('returns undefined with no preset, no color and no markId', () => {
    expect(resolveMark(null, { color: '#FFEB3B' })).toBeUndefined();
    expect(resolveMark(p, {})).toBeUndefined();
  });
});

describe('seedBuiltinPreset', () => {
  const built = seedBuiltinPreset((k) => `name:${k}`, 'Colors', 1234);

  /**
   * The SET, not the order. This is the property the back catalog rests on — every pre-presets annotation carries
   * one of these five hexes, and `resolveMark` labels it by matching them — so the five must never change. The order
   * is a presentation choice (see `BUILTIN_MARKS`), and asserting it here as a list would tie the palette's order
   * to the preset's: a seed reading its color out of the palette BY INDEX would hand each mark its neighbor's
   * color on a reorder.
   */
  it('covers exactly the five highlight colors', () => {
    expect(built.marks.map((m) => principalColor(m)).sort()).toEqual([...HIGHLIGHT_COLORS].sort());
  });

  it('keeps each mark on its own colour, whatever order they are listed in', () => {
    const byName = new Map(built.marks.map((m) => [m.name, principalColor(m)]));
    expect(byName.get('name:yellow')).toBe('#FFEB3B');
    expect(byName.get('name:green')).toBe('#A5D6A7');
    expect(byName.get('name:blue')).toBe('#90CAF9');
    expect(byName.get('name:orange')).toBe('#FFAB91');
    expect(byName.get('name:purple')).toBe('#CE93D8');
  });

  it('makes every mark a plain wash, so colour alone identifies a mark', () => {
    expect(built.marks.every((m) => !!m.highlightColor && !m.treatment)).toBe(true);
  });

  it('leaves every appearance unique — the property old annotations rely on', () => {
    // This is what lets resolveMark() label the whole back catalog by hex with no data rewrite.
    for (const m of built.marks) expect(isMarkAppearanceFree(built.marks, m, m.id)).toBe(true);
  });

  it('resolves a pre-presets annotation by its stored color', () => {
    expect(resolveMark(built, { color: HIGHLIGHT_COLORS[2] })?.name).toBe('name:blue');
  });

  it('is the default, enabled, and stamped with the supplied time', () => {
    expect(built.isDefault).toBe(true);
    expect(built.createdAt).toBe(1234);
    expect(built.marks.every((m) => m.enabled)).toBe(true);
  });

  /**
   * **The revision is the version of the CONTENTS, not a constant.** A preset nobody can edit still changes when
   * Orbis changes what it ships: renaming the five marks without a bump would leave one device holding "Key point"
   * and another "Yellow" under one locked id — the divergence the lock exists to prevent — and every
   * already-annotated book would keep the old names in its own copy, since `mergeBookPreset` is forward-only and
   * reads equal revisions as nothing to merge.
   */
  it('carries the current contents revision, so a rename can travel', () => {
    expect(built.revision).toBe(BUILTIN_PRESET_REVISION);
    expect(BUILTIN_PRESET_REVISION).toBeGreaterThan(1);
  });

  it('is newer than a book copied from an earlier revision of the preset', () => {
    // The condition `mergeBookPreset` needs to run forward rather than shrug: template ahead of the book's copy.
    const book = { ...bookPresetFrom(built), revision: 1 };
    expect(built.revision).toBeGreaterThan(book.revision);
    const merged = mergeBookPreset(book, built, () => false);
    expect(merged.revision).toBe(BUILTIN_PRESET_REVISION);
    expect(merged.marks.map((m) => m.name)).toEqual(built.marks.map((m) => m.name));
  });

  /**
   * The order the reader sees, which the seed decides and nothing else may reorder. Yellow leads because both roles
   * are pinned to it and the listening highlight is the one a tap in the player applies.
   */
  it('lists the marks in the order the shipped preset defines', () => {
    expect(built.marks.map((m) => m.name)).toEqual([
      'name:yellow',
      'name:purple',
      'name:green',
      'name:blue',
      'name:orange',
    ]);
  });

  /**
   * Stated rather than derived, which is what makes it survive a recolour: `changeAppearance` only re-derives a
   * badge the reader never chose, so a stored badge is a badge kept. A derived one would read "🟡" in an exported
   * note where the mark means "key point".
   */
  it('gives every mark a badge of its own, not one derived from its colour', () => {
    expect(built.marks.map((m) => m.badge)).toEqual(['🔑', '💬', '❓', '📘', '⚠️']);
    for (const m of built.marks) expect(m.badge).not.toBe(defaultBadge(m));
  });

  /**
   * Both roles on the leading mark, pinned rather than reached by the fallback landing on whatever comes first —
   * which is a claim about position, not a choice. The note role has no fallback at all.
   */
  it('pins the note and listening roles to the leading mark', () => {
    expect(built.noteMarkId).toBe(built.marks[0].id);
    expect(built.audioMarkId).toBe(built.marks[0].id);
    expect(noteMark(built)?.name).toBe('name:yellow');
    expect(audioMark(built)?.name).toBe('name:yellow');
  });

  /** Pinned by ID, so the roles do not follow a position. */
  it('keeps both roles on the same mark when the list is reordered', () => {
    const moved = { ...built, marks: [...built.marks.slice(1), built.marks[0]] };
    expect(noteMark(moved)?.name).toBe('name:yellow');
    expect(audioMark(moved)?.name).toBe('name:yellow');
  });

  it('gives every mark a distinct id', () => {
    expect(new Set(built.marks.map((m) => m.id)).size).toBe(built.marks.length);
  });
});

describe('MARK_PALETTE', () => {
  it('contains every legacy color, so existing annotations sit on curated colors', () => {
    // Also required by resolveMark's color fallback — changing a legacy hex would strand it.
    for (const legacy of HIGHLIGHT_COLORS) expect(MARK_PALETTE.some((p) => p.hex === legacy)).toBe(true);
  });

  it('has no duplicate colors', () => {
    expect(new Set(MARK_PALETTE.map((p) => p.hex)).size).toBe(MARK_PALETTE.length);
  });

  it('gives every color a distinct emoji, so a derived emoji identifies its color', () => {
    expect(new Set(MARK_PALETTE.map((p) => p.emoji)).size).toBe(MARK_PALETTE.length);
  });
});

describe('emojiForColor', () => {
  it('matches the emoji export-format.ts uses for the five legacy colors', () => {
    // These five appear in already-exported notes, so the derived emoji must equal
    // the hand-written colorEmoji map rather than being re-derived by arithmetic.
    expect(emojiForColor('#FFEB3B')).toBe('🟡');
    expect(emojiForColor('#A5D6A7')).toBe('🟢');
    expect(emojiForColor('#90CAF9')).toBe('🔵');
    expect(emojiForColor('#FFAB91')).toBe('🟠');
    expect(emojiForColor('#CE93D8')).toBe('🟣');
  });

  it('matches palette colors exactly, whatever the case', () => {
    expect(emojiForColor('#80cbc4')).toBe('🟦');
  });

  it('buckets a custom color to the nearest hue', () => {
    expect(emojiForColor('#B71C1C')).toBe('🔴'); // dark red
    expect(emojiForColor('#0D47A1')).toBe('🔵'); // dark blue
    expect(emojiForColor('#1B5E20')).toBe('🟢'); // dark green
  });

  it('handles shorthand hex and returns something for garbage rather than throwing', () => {
    expect(emojiForColor('#f00')).toBe('🔴');
    expect(typeof emojiForColor('nonsense')).toBe('string');
  });
});

describe('defaultMarks', () => {
  const marks = defaultMarks((k) => k);

  it('is the five-colour wash structure both the seed and a new preset start from', () => {
    expect(marks.map((m) => principalColor(m)).sort()).toEqual([...HIGHLIGHT_COLORS].sort());
    expect(marks.every((m) => !!m.highlightColor && !m.treatment && m.enabled)).toBe(true);
  });

  it('mints fresh ids per call, so two presets never share a mark id', () => {
    const a = defaultMarks((k) => k);
    const b = defaultMarks((k) => k);
    expect(a.map((m) => m.id)).not.toEqual(b.map((m) => m.id));
  });
});

describe('defaultBadge', () => {
  it('leaves a fill bare, so legacy exports are unchanged', () => {
    // The five legacy colors are all fill, and their emoji already appear in exported notes.
    expect(defaultBadge({ highlightColor: '#FFEB3B' })).toBe('🟡');
    expect(defaultBadge({ highlightColor: '#A5D6A7' })).toBe('🟢');
    expect(defaultBadge({ highlightColor: '#90CAF9' })).toBe('🔵');
    expect(defaultBadge({ highlightColor: '#FFAB91' })).toBe('🟠');
    expect(defaultBadge({ highlightColor: '#CE93D8' })).toBe('🟣');
  });

  it('distinguishes two marks that share a color but not a treatment', () => {
    // The hole this exists to close: (color, treatment) is unique, so a color-only emoji would export
    // both of these identically and lose the distinction in Markdown, which has no color at all.
    const a = defaultBadge({ highlightColor: '#FFEB3B' });
    const b = defaultBadge({ treatment: 'underline', treatmentColor: '#FFEB3B' });
    expect(a).not.toBe(b);
  });

  it('gives every treatment a distinct emoji for one color', () => {
    const seen = TREATMENTS.map((tr) => defaultBadge({ treatment: tr, treatmentColor: '#FFEB3B' }));
    expect(new Set(seen).size).toBe(TREATMENTS.length);
  });

  it('keeps the color glyph, so the color is still readable', () => {
    for (const tr of TREATMENTS)
      expect(defaultBadge({ treatment: tr, treatmentColor: '#90CAF9' }).startsWith('🔵')).toBe(true);
  });
});

describe('badgeOf', () => {
  it('uses the derived default when the user set nothing', () => {
    expect(badgeOf({ treatment: 'underline', treatmentColor: '#FFEB3B' })).toBe('🟡➖');
  });

  it('prefers whatever the user typed, emoji or not', () => {
    // The field is a badge, not an emoji picker — "#1" and "URG" are as valid as a glyph.
    expect(badgeOf({ highlightColor: '#FFEB3B', badge: 'URG' })).toBe('URG');
    expect(badgeOf({ highlightColor: '#FFEB3B', badge: '#1' })).toBe('#1');
  });

  it('keeps the default short enough to be a badge, not a second name', () => {
    // The manager caps input at BADGE_MAX; the derived value must fit that bound too.
    for (const tr of TREATMENTS)
      expect(defaultBadge({ treatment: tr, treatmentColor: '#FFEB3B' }).length).toBeLessThanOrEqual(BADGE_MAX);
  });
});

describe('bookPresetFrom', () => {
  const global = preset([mark('a', '#FFEB3B'), mark('b', '#A5D6A7', 'underline'), mark('c', '#90CAF9')]);
  global.revision = 7;

  it('carries the id and the revision it was copied at', () => {
    const copy = bookPresetFrom(global);
    expect(copy.id).toBe('p1');
    expect(copy.revision).toBe(7);
  });

  it("starts fully tracked — no mark is the book's own yet", () => {
    const copy = bookPresetFrom(global);
    expect(copy.marks.some((m) => m.local)).toBe(false);
    expect(isCustomized(copy)).toBe(false);
  });

  it('preserves mark order — the copy must not re-derive it', () => {
    expect(bookPresetFrom(global).marks.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('deep-copies the marks, so editing the book cannot rewrite the global preset', () => {
    const copy = bookPresetFrom(global);
    copy.marks[0].highlightColor = '#000000';
    copy.marks.push(mark('d', '#CE93D8'));
    expect(global.marks[0].highlightColor).toBe('#FFEB3B');
    expect(global.marks).toHaveLength(3);
  });

  it('resolves annotations against the copy exactly as against the template', () => {
    // The book's copy is what the reader renders from, so the resolution rules have to hold on it too.
    const copy = bookPresetFrom(global);
    expect(resolveMark(copy, { markId: 'b' })?.treatment).toBe('underline');
    expect(resolveMark(copy, { color: '#90caf9' })?.id).toBe('c');
  });
});

describe('built-in ids', () => {
  const built = seedBuiltinPreset((k) => `name:${k}`, 'Colors', 1);

  it('are fixed strings, so every device seeds the SAME preset identity', () => {
    // The reason this matters: data.json is per device unless synced, while a book's .orbis copy always
    // travels. Generated ids would make two identical libraries mutually unresolvable.
    expect(built.id).toBe(BUILTIN_PRESET_ID);
    expect(seedBuiltinPreset((k) => `x:${k}`, 'Other', 2).id).toBe(BUILTIN_PRESET_ID);
    expect(built.marks.map((m) => m.id)).toEqual(seedBuiltinPreset((k) => `x:${k}`, 'O', 9).marks.map((m) => m.id));
  });

  it('keeps generated ids for a NEW preset, which must not share the built-in identity', () => {
    const a = defaultMarks((k) => k);
    const b = defaultMarks((k) => k);
    expect(a.map((m) => m.id)).not.toEqual(b.map((m) => m.id));
    expect(a.some((m) => m.id === builtinMarkId('yellow'))).toBe(false);
  });
});

describe('isBuiltinPreset', () => {
  it('derives the lock from the id, not a stored flag', () => {
    expect(isBuiltinPreset(seedBuiltinPreset((k) => k, 'Colors', 1))).toBe(true);
    expect(isBuiltinPreset(preset([mark('a', '#FFEB3B')]))).toBe(false);
  });
});

/**
 * Absent, stale, current — the three states a vault can be in when Orbis has changed what it ships.
 *
 * The stale case is the whole point: install-if-absent would leave a vault with whatever contents it was first
 * given, so a rename could only be seen by factory-resetting a device. That is no answer for a vault synced across
 * devices, and it would never reach the books at all.
 */
describe('installBuiltinPreset', () => {
  const seed = (): AnnotationPreset => seedBuiltinPreset((k) => `name:${k}`, 'Orbis marks', 5000);
  const stale = (): AnnotationPreset => ({
    ...seedBuiltinPreset((k) => `old:${k}`, 'Built-in', 100),
    revision: 1,
  });

  it('seeds into a vault that has never had it', () => {
    const presets: AnnotationPreset[] = [];
    expect(installBuiltinPreset(presets, seed())).toBe(true);
    expect(presets[0].id).toBe(BUILTIN_PRESET_ID);
    expect(presets[0].isDefault).toBe(true);
  });

  it('leaves an existing default alone when it arrives alongside other presets', () => {
    const mine: AnnotationPreset = { ...stale(), id: 'ap_mine', isDefault: true, revision: 9 };
    const presets = [mine];
    installBuiltinPreset(presets, seed());
    expect(presets.find((p) => p.id === BUILTIN_PRESET_ID)?.isDefault).toBe(false);
    expect(mine.isDefault).toBe(true);
  });

  it('replaces a stale copy with the current contents', () => {
    const presets = [stale()];
    expect(installBuiltinPreset(presets, seed())).toBe(true);
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('Orbis marks');
    expect(presets[0].marks[0].name).toBe('name:yellow');
    expect(presets[0].revision).toBe(BUILTIN_PRESET_REVISION);
  });

  /** The vault's decisions ABOUT the preset, which are not part of what the preset is. */
  it('keeps the position, the default flag, the inactive flag and the original date', () => {
    const other: AnnotationPreset = { ...stale(), id: 'ap_other', revision: 3 };
    const presets = [other, { ...stale(), isDefault: false, inactive: true, createdAt: 100 }];
    installBuiltinPreset(presets, seed());
    expect(presets[1].id).toBe(BUILTIN_PRESET_ID); // still second
    expect(presets[1].isDefault).toBe(false);
    expect(presets[1].inactive).toBe(true);
    expect(presets[1].createdAt).toBe(100); // not re-dated to the seed's 5000
  });

  it('does nothing at all when the vault is already current', () => {
    const presets = [seed()];
    const before = JSON.stringify(presets);
    expect(installBuiltinPreset(presets, seed())).toBe(false);
    expect(JSON.stringify(presets)).toBe(before);
  });

  /** Forward only, like everything else here: a vault ahead of this build is not dragged backwards. */
  it('does nothing when the vault is ahead of this build', () => {
    const presets = [{ ...seed(), revision: BUILTIN_PRESET_REVISION + 1, name: 'From the future' }];
    expect(installBuiltinPreset(presets, seed())).toBe(false);
    expect(presets[0].name).toBe('From the future');
  });
});

describe('duplicatePreset', () => {
  const source = seedBuiltinPreset((k) => `name:${k}`, 'Colors', 1);

  it('gives every mark a FRESH id, so no id is ever in two presets', () => {
    // Two library presets sharing mark ids would make a mark id ambiguous across the library, so a future
    // remap-on-switch would think every id already resolves and skip the mapping.
    const copy = duplicatePreset(source, 'Mine', 2);
    expect(copy.marks.map((m) => m.id)).not.toEqual(source.marks.map((m) => m.id));
    expect(new Set(copy.marks.map((m) => m.id)).size).toBe(copy.marks.length);
  });

  it('is never the built-in and never the default', () => {
    const copy = duplicatePreset(source, 'Mine', 2);
    expect(isBuiltinPreset(copy)).toBe(false);
    expect(copy.isDefault).toBe(false);
    expect(copy.revision).toBe(1);
  });

  it('copies everything else about each mark, in order', () => {
    const copy = duplicatePreset(source, 'Mine', 2);
    expect(copy.marks.map((m) => [m.name, m.highlightColor, m.treatment])).toEqual(
      source.marks.map((m) => [m.name, m.highlightColor, m.treatment])
    );
  });

  it('does not alias the source marks', () => {
    const copy = duplicatePreset(source, 'Mine', 2);
    copy.marks[0].name = 'changed';
    expect(source.marks[0].name).toBe('name:yellow');
  });

  /**
   * Duplicating is the documented way past the built-in's lock, so the copy is what a reader customizes. Dropping
   * the roles would leave that copy with no note mark and its listening mark demoted to a fallback — a choice lost
   * with nothing on screen to say it had been.
   */
  it('carries the roles onto the copies of the marks that held them', () => {
    const copy = duplicatePreset(source, 'Mine', 2);
    expect(copy.noteMarkId).toBe(copy.marks[0].id);
    expect(copy.audioMarkId).toBe(copy.marks[0].id);
    // The NEW id, never the source's — a role pointing at the source's id would name a mark this copy lacks.
    expect(copy.noteMarkId).not.toBe(source.noteMarkId);
    expect(noteMark(copy)?.name).toBe('name:yellow');
  });

  it('leaves a role unset when the source had none', () => {
    const plain = { ...source, noteMarkId: undefined, audioMarkId: undefined };
    const copy = duplicatePreset(plain, 'Mine', 2);
    expect(copy.noteMarkId).toBeUndefined();
    expect(copy.audioMarkId).toBeUndefined();
  });
});

describe('bookPresetFrom name', () => {
  it("carries the template's name, so an unknown preset can still be named", () => {
    const p = preset([mark('a', '#FFEB3B')]);
    p.name = 'Reading marks';
    expect(bookPresetFrom(p).name).toBe('Reading marks');
  });
});

describe('noteMark / audioMark', () => {
  const marks = [mark('a', '#FFEB3B'), mark('b', '#A5D6A7'), mark('c', '#90CAF9')];

  it('gives a new note NO mark by default', () => {
    // Unmarked is a supported permanent state for a note, so the default must not put a color on the page.
    expect(noteMark({ marks })).toBeUndefined();
  });

  it('uses the pinned note mark once one is set', () => {
    expect(noteMark({ marks, noteMarkId: 'b' })?.id).toBe('b');
  });

  it('defaults read-aloud to the first enabled mark', () => {
    expect(audioMark({ marks })?.id).toBe('a');
  });

  it('skips a disabled first mark, matching the picker', () => {
    const withOff = [mark('a', '#FFEB3B', undefined, false), mark('b', '#A5D6A7')];
    expect(audioMark({ marks: withOff })?.id).toBe('b');
  });

  it('pins read-aloud by id, so reordering no longer moves it', () => {
    const reordered = moveMark([...marks], 2, -2);
    expect(reordered[0].id).toBe('c');
    // Unpinned would now follow position one to 'c'; pinned stays where the reader put it.
    expect(audioMark({ marks: reordered })?.id).toBe('c');
    expect(audioMark({ marks: reordered, audioMarkId: 'a' })?.id).toBe('a');
  });

  it('treats a pointer at a deleted mark as unset', () => {
    expect(noteMark({ marks, noteMarkId: 'gone' })).toBeUndefined();
    // Read-aloud still has somewhere to fall back to, so it lands on the first enabled mark.
    expect(audioMark({ marks, audioMarkId: 'gone' })?.id).toBe('a');
  });

  it('treats a pointer at a DISABLED mark as unset', () => {
    // Retiring a mark must not leave a role pointing at something the picker no longer offers.
    const withOff = [mark('a', '#FFEB3B'), mark('b', '#A5D6A7', undefined, false)];
    expect(noteMark({ marks: withOff, noteMarkId: 'b' })).toBeUndefined();
    expect(audioMark({ marks: withOff, audioMarkId: 'b' })?.id).toBe('a');
  });

  it('has nothing to offer for an empty preset', () => {
    expect(audioMark({ marks: [] })).toBeUndefined();
  });

  it('carries both roles into the book copy', () => {
    const p = preset(marks);
    p.noteMarkId = 'b';
    p.audioMarkId = 'c';
    const copy = bookPresetFrom(p);
    expect(copy.noteMarkId).toBe('b');
    expect(copy.audioMarkId).toBe('c');
    expect(noteMark(copy)?.id).toBe('b');
    expect(audioMark(copy)?.id).toBe('c');
  });
});

describe('the swatch palette', () => {
  it('is one list for both channels', () => {
    // The line palette has neither ink nor black: ink is a checkbox, and "Match the text color" already covers
    // the pages black works on. Nothing is left to diverge over.
    expect(MARK_PALETTE.some((c) => c.hex === INK)).toBe(false);
    expect(MARK_PALETTE.some((c) => c.hex === '#000000')).toBe(false);
  });

  it('still names a colour that has no swatch, so an old black mark is not "Custom"', () => {
    expect(colorEntry('#000000')?.nameKey).toBe('presets.color_black');
    expect(colorEntry(INK)?.nameKey).toBe('presets.color_ink');
    expect(colorEntry('#123456')).toBeUndefined();
  });

  it('gives black its own glyph rather than falling through to the nearest hue', () => {
    // Matched exactly against every KNOWN entry, not the displayed ones, or a black line would export as ⚪.
    expect(emojiForColor('#000000')).toBe('⚫');
    expect(emojiForColor('#111111')).toBe('⚫'); // a near-black custom color buckets the same way
  });
});

describe('ink', () => {
  it('is a sentinel, not a colour', () => {
    expect(isInk(INK)).toBe(true);
    expect(isInk('INK')).toBe(true); // stored uppercase by normalizeColor on the way in
    expect(isInk('#000000')).toBe(false);
    expect(isInk(undefined)).toBe(false);
  });

  it('resolves to the page text colour, and leaves a real colour alone', () => {
    expect(resolveInk(INK, '#3B2F2F')).toBe('#3B2F2F');
    expect(resolveInk('#FFEB3B', '#3B2F2F')).toBe('#FFEB3B');
    // No color at all also falls back to the text color rather than drawing nothing.
    expect(resolveInk(undefined, '#3B2F2F')).toBe('#3B2F2F');
  });

  it('is offered as a checkbox, not a swatch — it is a rule, not a colour', () => {
    // As a swatch it would have to paint itself in something, which means the dialog's own text color: white
    // in a dark theme, and indistinguishable from Black in a light one.
    expect(MARK_PALETTE.some((c) => c.hex === INK)).toBe(false);
  });

  it('has its own badge glyph, so ink and black marks do not export identically', () => {
    expect(emojiForColor(INK)).toBe('✒️');
    expect(emojiForColor('#000000')).toBe('⚫');
  });

  it('counts as its own appearance for uniqueness', () => {
    // An ink underline and a black underline can coexist: on a light page they look alike, but on a dark
    // one they do not, so they are genuinely different marks.
    const marks = [
      mark('a', '#FFEB3B'),
      { id: 'b', name: 'b', treatment: 'underline' as const, treatmentColor: INK, enabled: true },
    ];
    expect(isMarkAppearanceFree(marks, { treatment: 'underline', treatmentColor: '#000000' })).toBe(true);
    expect(isMarkAppearanceFree(marks, { treatment: 'underline', treatmentColor: INK })).toBe(false);
  });
});

describe('inferLocalMarks', () => {
  const tpl = (revision: number, ids: string[]): AnnotationPreset => ({
    id: 'ap_1',
    name: 'Colors',
    revision,
    isDefault: false,
    createdAt: 1,
    marks: ids.map((id) => ({ id, name: id, highlightColor: '#FFEB3B', enabled: true })),
  });
  const bookWith = (revision: number, marks: BookMark[]): BookPreset => ({
    id: 'ap_1',
    name: 'Colors',
    revision,
    customized: false,
    marks,
  });

  it('marks a mark the template does not have as local', () => {
    // A tracked mark comes from the template by definition, so one the template has never heard of can only
    // be the book's own — which restores a `local` flag a read has stripped.
    const book = bookWith(3, [
      { id: 'mk_a', name: 'Yellow', highlightColor: '#FFEB3B', enabled: true },
      { id: 'mk_mine', name: 'Mine', highlightColor: '#A5D6A7', enabled: true },
    ]);
    const out = mergeBookPreset(book, tpl(3, ['mk_a']), () => false);
    expect(out.marks.map((m) => [m.id, m.local])).toEqual([
      ['mk_a', undefined],
      ['mk_mine', true],
    ]);
  });

  it('clears local on a mark the template does have', () => {
    // Impossible by design — every path that makes a mark local mints a fresh id — so it can only be a bug,
    // such as a role toggle treated as a definition edit, detaching the mark it was given a job on.
    const book = bookWith(3, [
      { id: 'mk_a', name: 'Yellow', highlightColor: '#FFEB3B', enabled: true, local: true },
      { id: 'mk_mine', name: 'Mine', highlightColor: '#A5D6A7', enabled: true, local: true },
    ]);
    const out = mergeBookPreset(book, tpl(3, ['mk_a']), () => false);
    expect(out.marks.map((m) => [m.id, m.local])).toEqual([
      ['mk_a', undefined],
      ['mk_mine', true],
    ]);
  });

  it('leaves a legacy customized copy alone, which is read as all-local on purpose', () => {
    // Those files carry no per-mark provenance, so the book stops tracking rather than guess. Clearing would
    // silently resume tracking and overwrite the reader's edits at the next template bump.
    const book = {
      ...bookWith(3, [{ id: 'mk_a', name: 'Y', highlightColor: '#FFEB3B', enabled: true, local: true as const }]),
      customized: true,
    };
    expect(mergeBookPreset(book, tpl(3, ['mk_a']), () => false)).toBe(book);
  });

  it('returns the same object when there is nothing to repair', () => {
    const book = bookWith(3, [{ id: 'mk_a', name: 'Yellow', highlightColor: '#FFEB3B', enabled: true }]);
    expect(mergeBookPreset(book, tpl(3, ['mk_a']), () => false)).toBe(book);
  });

  it('does not pre-empt the survivor rule when the template has moved on', () => {
    // Behind the template, a mark absent from it is merge's decision to make: keep it if something uses it,
    // drop it otherwise. Inferring `local` first would stop a dropped preset mark ever propagating.
    const book = bookWith(3, [
      { id: 'mk_a', name: 'Yellow', highlightColor: '#FFEB3B', enabled: true },
      { id: 'mk_gone', name: 'Dropped', highlightColor: '#90CAF9', enabled: true },
    ]);
    const out = mergeBookPreset(book, tpl(4, ['mk_a']), () => false);
    expect(out.marks.map((m) => m.id)).toEqual(['mk_a']);
  });

  it('leaves a book ahead of a stale template alone', () => {
    // A rolled-back library: a mark absent from the older template may be one a later revision added and
    // this book already merged, so it could be genuinely tracked. Only equal revisions are unambiguous.
    const book = bookWith(5, [
      { id: 'mk_a', name: 'Yellow', highlightColor: '#FFEB3B', enabled: true },
      { id: 'mk_new', name: 'Added later', highlightColor: '#A5D6A7', enabled: true },
    ]);
    const out = mergeBookPreset(book, tpl(4, ['mk_a']), () => false);
    expect(out).toBe(book);
  });
});

describe('presetFromBookCopy', () => {
  const copy = (marks: BookMark[]): BookPreset => ({
    id: 'ap_remote',
    name: 'Fiction',
    revision: 7,
    customized: false,
    marks,
    hiddenMarkIds: ['mk_b'],
    noteMarkId: 'mk_a',
    audioMarkId: 'mk_b',
  });

  it('reconstructs the library entry from what the book carries', () => {
    // The book's `.orbis` has everything, so nothing has to be asked — and importing is what makes the
    // book's copy mergeable again. Without a template there is nothing to merge against and the book drifts.
    const out = presetFromBookCopy(
      copy([
        { id: 'mk_a', name: 'Yellow', highlightColor: '#FFEB3B', enabled: true },
        { id: 'mk_b', name: 'Green', highlightColor: '#A5D6A7', enabled: true },
      ]),
      99
    );
    expect(out?.id).toBe('ap_remote');
    expect(out?.name).toBe('Fiction');
    // In step with the copy, or the next open would "merge" the book forward onto what is really itself.
    expect(out?.revision).toBe(7);
    expect(out?.marks.map((m) => m.id)).toEqual(['mk_a', 'mk_b']);
    expect(out?.isDefault).toBe(false);
  });

  it('leaves the marks a book added itself out of the shared entry', () => {
    const out = presetFromBookCopy(
      copy([
        { id: 'mk_a', name: 'Yellow', highlightColor: '#FFEB3B', enabled: true },
        { id: 'mk_mine', name: 'Mine', highlightColor: '#90CAF9', enabled: true, local: true },
      ]),
      99
    );
    expect(out?.marks.map((m) => m.id)).toEqual(['mk_a']);
  });

  it('does not carry hiddenMarkIds, which mean nothing in a library entry', () => {
    const out = presetFromBookCopy(copy([{ id: 'mk_a', name: 'Y', highlightColor: '#FFEB3B', enabled: true }]), 99);
    expect('hiddenMarkIds' in (out ?? {})).toBe(false);
  });

  it('always arrives inactive', () => {
    // Not a setting: an import answers "this book needs a template it can track", never "add this to the
    // presets I choose between" — and since the library travels, what it fires for is somebody else's
    // vocabulary arriving inside a book from another vault.
    const out = presetFromBookCopy(copy([{ id: 'mk_a', name: 'Y', highlightColor: '#FFEB3B', enabled: true }]), 99);
    expect(out?.inactive).toBe(true);
  });

  it('imports nothing from an all-local copy', () => {
    // A legacy customized book: no information about what the preset was, an empty preset is worse than
    // none, and every mark being its own already makes the book fully editable.
    const out = presetFromBookCopy(
      copy([{ id: 'mk_mine', name: 'Mine', highlightColor: '#FFEB3B', enabled: true, local: true }]),
      99
    );
    expect(out).toBeNull();
  });
});

describe('activePresets', () => {
  const lib = [
    { id: 'a', name: 'A', isDefault: true, createdAt: 1, revision: 1, marks: [] },
    { id: 'b', name: 'B', isDefault: false, createdAt: 1, revision: 1, marks: [], inactive: true },
  ];

  it('filters inactive presets out of the lists that offer one to assign', () => {
    expect(activePresets(lib).map((p) => p.id)).toEqual(['a']);
  });

  it('does not touch the array it is given, which is the live library', () => {
    // Callers hold `settings.annotationPresets` and push to it; a filter that aliased it would be a trap.
    const out = activePresets(lib);
    expect(out).not.toBe(lib);
  });
});

describe('promoteBookToPreset', () => {
  const book = (): BookPreset => ({
    id: 'ap_old',
    name: 'Colors',
    revision: 4,
    customized: false,
    marks: [
      { id: 'mk_tracked', name: 'Yellow', highlightColor: '#FFEB3B', enabled: true },
      { id: 'mk_mine', name: 'Mine', highlightColor: '#A5D6A7', enabled: true, local: true },
      { id: 'mk_hidden', name: 'Hidden', highlightColor: '#90CAF9', enabled: true },
    ],
    hiddenMarkIds: ['mk_hidden'],
    noteMarkId: 'mk_mine',
    audioMarkId: 'mk_tracked',
  });
  // Only the tracked mark's id is spoken for by the library.
  const taken = (id: string): boolean => id === 'mk_tracked' || id === 'mk_hidden';

  it('re-mints ids the library already owns and keeps the ones only this book has', () => {
    const { preset, idMap } = promoteBookToPreset(book(), 'Fiction', 10, taken);
    expect(idMap.has('mk_tracked')).toBe(true);
    expect(idMap.has('mk_hidden')).toBe(true);
    // A mark of the book's own is in no other preset, so its id is unambiguous and worth preserving: the
    // annotations carrying it need no rewriting at all.
    expect(idMap.has('mk_mine')).toBe(false);
    expect(preset.marks.map((m) => m.name)).toEqual(['Yellow', 'Mine', 'Hidden']);
    expect(preset.marks[0].id).toBe(idMap.get('mk_tracked'));
    expect(preset.marks[1].id).toBe('mk_mine');
  });

  it('clears local, so nothing is exempt from the preset it just created', () => {
    const { preset, book: next } = promoteBookToPreset(book(), 'Fiction', 10, taken);
    expect(preset.marks.some((m) => 'local' in m)).toBe(false);
    expect(next.marks.some((m) => m.local)).toBe(false);
  });

  it('follows the id map for the role pointers and the hidden set', () => {
    const { book: next, idMap } = promoteBookToPreset(book(), 'Fiction', 10, taken);
    // Either of these would silently detach if the map were applied to the marks alone.
    expect(next.audioMarkId).toBe(idMap.get('mk_tracked'));
    expect(next.hiddenMarkIds).toEqual([idMap.get('mk_hidden')]);
    // Unmoved ids stay put.
    expect(next.noteMarkId).toBe('mk_mine');
  });

  it('includes hidden marks', () => {
    // Dropping them would orphan any annotation using one: hiding is about the reader's mark bar, not about
    // what the book depends on.
    const { preset } = promoteBookToPreset(book(), 'Fiction', 10, taken);
    expect(preset.marks).toHaveLength(3);
  });

  it('starts the new preset and the book at revision 1, in step', () => {
    const { preset, book: next } = promoteBookToPreset(book(), 'Fiction', 10, taken);
    expect(preset.revision).toBe(1);
    expect(next.revision).toBe(1);
    expect(next.id).toBe(preset.id);
    expect(next.name).toBe('Fiction');
  });
});

describe('mergeBookPreset', () => {
  const template = (marks: AnnotationMark[], revision = 2): AnnotationPreset => ({
    id: 'p1',
    name: 'P',
    isDefault: false,
    createdAt: 0,
    revision,
    marks,
  });
  const book = (marks: BookMark[], revision = 1): BookPreset => ({
    id: 'p1',
    name: 'P',
    revision,
    customized: false,
    marks,
  });
  const never = () => false;
  const always = () => true;

  it('replaces a tracked definition and keeps its position', () => {
    const b = book([mark('a', '#FFEB3B'), mark('b', '#A5D6A7')]);
    const t = template([mark('b', '#000000', 'underline'), mark('a', '#FFEB3B')]);
    const out = mergeBookPreset(b, t, never);
    // Order is the BOOK's — the template listing b first does not reorder the book.
    expect(out.marks.map((m) => m.id)).toEqual(['a', 'b']);
    expect(out.marks[1]).toMatchObject({ treatment: 'underline', treatmentColor: '#000000' });
  });

  it('never touches a local mark', () => {
    const b = book([mark('a', '#FFEB3B'), { ...mark('mine', '#CE93D8'), local: true }]);
    const t = template([mark('a', '#000000')]);
    const out = mergeBookPreset(b, t, never);
    expect(out.marks.find((m) => m.id === 'mine')).toMatchObject({ highlightColor: '#CE93D8', local: true });
  });

  it('drops a tracked mark the template deleted, when nothing uses it', () => {
    const out = mergeBookPreset(
      book([mark('a', '#FFEB3B'), mark('gone', '#A5D6A7')]),
      template([mark('a', '#FFEB3B')]),
      never
    );
    expect(out.marks.map((m) => m.id)).toEqual(['a']);
  });

  it('keeps it as LOCAL when annotations still use it', () => {
    // Otherwise those annotations lose their name and fall back to a stored snapshot.
    const out = mergeBookPreset(
      book([mark('a', '#FFEB3B'), mark('gone', '#A5D6A7')]),
      template([mark('a', '#FFEB3B')]),
      (id) => id === 'gone'
    );
    expect(out.marks.find((m) => m.id === 'gone')).toMatchObject({ local: true });
  });

  it('inserts a new template mark where it sits upstream, not at the end', () => {
    // Order decides the quick row: appending would bury a mark the preset author made primary.
    const b = book([mark('a', '#FFEB3B'), mark('c', '#90CAF9')]);
    const t = template([mark('a', '#FFEB3B'), mark('b', '#A5D6A7'), mark('c', '#90CAF9')]);
    expect(mergeBookPreset(b, t, never).marks.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps several new marks in their upstream order', () => {
    const b = book([mark('z', '#CE93D8')]);
    const t = template([mark('a', '#FFEB3B'), mark('b', '#A5D6A7'), mark('z', '#CE93D8')]);
    expect(mergeBookPreset(b, t, never).marks.map((m) => m.id)).toEqual(['a', 'b', 'z']);
  });

  it('inserts around a local mark without moving it', () => {
    const b = book([{ ...mark('mine', '#CE93D8'), local: true }, mark('a', '#FFEB3B')]);
    const t = template([mark('a', '#FFEB3B'), mark('b', '#A5D6A7')]);
    expect(mergeBookPreset(b, t, never).marks.map((m) => m.id)).toEqual(['mine', 'a', 'b']);
  });

  it('is FORWARD ONLY — a stale template cannot drag the book backwards', () => {
    // Device B holds revision 1 while the book's copy came from device A at revision 5.
    const b = book([mark('a', '#000000', 'underline')], 5);
    const t = template([mark('a', '#FFEB3B')], 1);
    expect(mergeBookPreset(b, t, never)).toBe(b);
  });

  it('does nothing at an equal revision, or for a different preset', () => {
    const b = book([mark('a', '#FFEB3B')], 2);
    expect(mergeBookPreset(b, template([mark('a', '#000000')], 2), never)).toBe(b);
    expect(mergeBookPreset(b, { ...template([mark('a', '#000000')], 9), id: 'other' }, never)).toBe(b);
  });

  it('takes the template revision and name forward', () => {
    const out = mergeBookPreset(
      book([mark('a', '#FFEB3B')]),
      { ...template([mark('a', '#FFEB3B')], 7), name: 'Renamed' },
      always
    );
    expect(out.revision).toBe(7);
    expect(out.name).toBe('Renamed');
  });

  it('prunes hidden ids for marks that no longer exist', () => {
    const b = { ...book([mark('a', '#FFEB3B'), mark('gone', '#A5D6A7')]), hiddenMarkIds: ['gone', 'a'] };
    const out = mergeBookPreset(b, template([mark('a', '#FFEB3B')]), never);
    expect(out.hiddenMarkIds).toEqual(['a']);
  });
});

describe('switchBookPreset', () => {
  const from: BookPreset = {
    id: 'p1',
    name: 'Old',
    revision: 3,
    customized: false,
    marks: [mark('t1', '#FFEB3B'), mark('t2', '#A5D6A7'), { ...mark('mine', '#CE93D8'), local: true }],
    hiddenMarkIds: ['t2'],
    noteMarkId: 'mine',
  };
  const to: AnnotationPreset = {
    id: 'p2',
    name: 'New',
    isDefault: false,
    createdAt: 0,
    revision: 1,
    marks: [mark('n1', '#90CAF9'), mark('n2', '#FFAB91')],
  };

  it('takes the new preset wholesale, in its order', () => {
    const { book: out } = switchBookPreset(from, to, () => false);
    expect(out.id).toBe('p2');
    expect(out.revision).toBe(1);
    expect(out.marks.slice(0, 2).map((m) => m.id)).toEqual(['n1', 'n2']);
  });

  it('keeps local marks even when unused — they are work, not inheritance', () => {
    const { book: out } = switchBookPreset(from, to, () => false);
    expect(out.marks.find((m) => m.id === 'mine')).toMatchObject({ local: true });
  });

  it('drops inherited marks nothing points at, and carries over the ones in use', () => {
    const { book: out } = switchBookPreset(from, to, (id) => id === 't1');
    expect(out.marks.map((m) => m.id)).toEqual(['n1', 'n2', 't1', 'mine']);
    expect(out.marks.find((m) => m.id === 't1')).toMatchObject({ local: true });
    expect(out.marks.find((m) => m.id === 't2')).toBeUndefined();
  });

  it('collapses a local mark the incoming preset already expresses, and says where it went', () => {
    // `(color, treatment, treatmentColor)` is this model's identity for a mark, so two wearing one appearance
    // cannot both stand — the editor refuses it, and so must the switch.
    //
    // Detach-then-reattach multiplies it: detaching re-mints every mark as the book's own, so the same preset
    // arriving again would bring its originals back BESIDE the copies, once per round trip. But it does not
    // need detach — duplicate a preset (new mark ids, identical appearances), copy a mark into
    // the book, switch to the duplicate, and the same two marks arrive. This test is that general case: a local
    // mark and an incoming one that look alike.
    const copy: BookMark = { ...mark('copy-of-n1', '#90CAF9'), local: true };
    const { book: out, idMap } = switchBookPreset({ ...from, marks: [copy] }, to, () => false);
    expect(out.marks.map((m) => m.id)).toEqual(['n1', 'n2']);
    expect(idMap.get('copy-of-n1')).toBe('n1');
  });

  it("leaves a local mark alone when its appearance is the book's own", () => {
    const copy: BookMark = { ...mark('mine2', '#CE93D8'), local: true };
    const { book: out, idMap } = switchBookPreset({ ...from, marks: [copy] }, to, () => false);
    expect(out.marks.map((m) => m.id)).toContain('mine2');
    expect(idMap.size).toBe(0);
  });

  it('moves a role off a collapsed mark onto the one that replaced it', () => {
    const copy: BookMark = { ...mark('copy-of-n1', '#90CAF9'), local: true };
    const { book: out } = switchBookPreset({ ...from, marks: [copy], noteMarkId: 'copy-of-n1' }, to, () => false);
    expect(out.noteMarkId).toBe('n1');
  });

  it('collapses every match, and reports only the ones a reader could notice', () => {
    // Deliberately different sets. The switch has to collapse both — two marks cannot share an appearance —
    // but a pair identical in name, badge and enabled state changes nothing anyone can see, and a warning that
    // is usually nothing is one people learn to click past.
    const twin: BookMark = { ...mark('twin', '#90CAF9'), name: 'n1', local: true };
    const renamed: BookMark = { ...mark('renamed', '#FFAB91'), name: 'Stuff I hate', local: true };
    const book = { ...from, marks: [twin, renamed] };
    const { idMap } = switchBookPreset(book, to, () => false);
    const all = presetSwitchClashes(book, to, () => false);
    expect([...idMap.keys()].sort()).toEqual(['renamed', 'twin']);
    expect(all.map((c) => c.differs)).toEqual([null, 'name']);
  });

  it('names both marks when the names differ, because appearance is not meaning', () => {
    // "Stuff I hate" and "Stuff I love" can be the same yellow underline. A count would not let anyone spot
    // that; the two names are the whole reason the warning exists.
    const hate: BookMark = { ...mark('hate', '#90CAF9'), name: 'Stuff I hate', local: true };
    const [only] = presetSwitchClashes({ ...from, marks: [hate] }, to, () => false);
    expect(only.differs).toBe('name');
    expect(only.from.name).toBe('Stuff I hate');
  });

  it('reports a badge difference, which is what shows where colour cannot', () => {
    // `badgeOf` resolves the default from the appearance, so identical appearances give identical defaults —
    // only a badge somebody typed can differ, and it is what lands in generated notes and PDFs.
    const badged: BookMark = { ...mark('badged', '#90CAF9'), name: 'n1', badge: 'WIP', local: true };
    expect(presetSwitchClashes({ ...from, marks: [badged] }, to, () => false)[0].differs).toBe('badge');
  });

  it('reports a mark the incoming preset has retired, which the bar will stop offering', () => {
    const off: AnnotationPreset = { ...to, marks: [{ ...to.marks[0], enabled: false }, to.marks[1]] };
    const mine: BookMark = { ...mark('mine3', '#90CAF9'), name: 'n1', local: true };
    expect(presetSwitchClashes({ ...from, marks: [mine] }, off, () => false)[0].differs).toBe('enabled');
  });

  describe('a mark named like an incoming one', () => {
    // A teal-box "Question" of the book's own beside the incoming preset's green "Question": different looks, so no
    // look clash collapses them, and without the name pass the book would have two marks called Question.
    const question: AnnotationMark = { ...mark('q-preset', '#A5D6A7'), name: 'Question', badge: '❓' };
    const next: AnnotationPreset = { ...to, marks: [...to.marks, question] };
    const teal: BookMark = { ...mark('q-book', '#80CBC4', 'box'), name: ' question ', badge: '❓', local: true };

    it('drops the book mark when nothing uses it, and its role goes to the namesake', () => {
      const { book: out, idMap } = switchBookPreset(
        { ...from, marks: [teal], noteMarkId: 'q-book' },
        next,
        () => false
      );
      expect(out.marks.map((m) => m.id)).toEqual(['n1', 'n2', 'q-preset']);
      expect(idMap.get('q-book')).toBe('q-preset');
      expect(out.noteMarkId).toBe('q-preset');
    });

    it('renames the book mark when it is in use, and drops a typed badge the namesake has too', () => {
      const { book: out, idMap } = switchBookPreset(
        { ...from, marks: [teal] },
        next,
        (id) => id === 'q-book',
        (name) => `${name} [kept]`
      );
      const kept = out.marks.find((m) => m.id === 'q-book');
      expect(kept).toMatchObject({ name: 'question [kept]', local: true });
      expect(kept?.badge).toBeUndefined();
      expect(idMap.has('q-book')).toBe(false);
    });

    // The old preset's Question, used, meeting the new preset's Question: the same meaning defined again in another
    // look. Its passages follow, as they would to an identical twin — nothing the reader made is being replaced.
    it('moves the passages of an inherited mark in use to the namesake, without renaming anything', () => {
      const inherited: BookMark = { ...teal, id: 'q-old', local: undefined };
      const { book: out, idMap } = switchBookPreset({ ...from, marks: [inherited] }, next, () => true);
      expect(out.marks.map((m) => m.id)).toEqual(['n1', 'n2', 'q-preset']);
      expect(idMap.get('q-old')).toBe('q-preset');
    });

    it('keeps a typed badge that already differs', () => {
      const own: BookMark = { ...teal, badge: '🧐' };
      const { book: out } = switchBookPreset({ ...from, marks: [own] }, next, () => true);
      expect(out.marks.find((m) => m.id === 'q-book')?.badge).toBe('🧐');
    });

    it('leaves differently named and unnamed marks alone', () => {
      const other: BookMark = { ...teal, name: 'Questions' };
      const unnamed: BookMark = { ...mark('blank', '#CE93D8'), name: '', local: true };
      const blankIncoming: AnnotationPreset = {
        ...next,
        marks: [...next.marks, { ...mark('b2', '#FFCC80'), name: '' }],
      };
      const { book: out } = switchBookPreset({ ...from, marks: [other, unnamed] }, blankIncoming, () => false);
      expect(out.marks.map((m) => m.id)).toEqual(['n1', 'n2', 'q-preset', 'b2', 'q-book', 'blank']);
    });

    it('is reported to the dialog only for a mark the switch carries, and not for a look clash', () => {
      const unusedInherited: BookMark = { ...teal, id: 'q-old', local: undefined };
      const sameLook: BookMark = { ...question, id: 'q-same', local: true };
      expect([...presetSwitchNameTwins({ ...from, marks: [teal] }, next, () => false)]).toEqual([
        ['q-book', { to: question, silent: false }],
      ]);
      const inherited: BookMark = { ...teal, id: 'q-old', local: undefined };
      expect(presetSwitchNameTwins({ ...from, marks: [inherited] }, next, () => true).get('q-old')?.silent).toBe(true);
      expect(presetSwitchNameTwins({ ...from, marks: [unusedInherited] }, next, () => false).size).toBe(0);
      expect(presetSwitchNameTwins({ ...from, marks: [sameLook] }, next, () => false).size).toBe(0);
    });
  });

  it('keeps the book-level roles and prunes hidden ids that no longer resolve', () => {
    const { book: out } = switchBookPreset(from, to, () => false);
    expect(out.noteMarkId).toBe('mine'); // usage is the book's, and survives a change of preset
    expect(out.hiddenMarkIds).toBeUndefined(); // 't2' went with the old preset
  });
});

describe('a name held by a mark of the book', () => {
  // The book kept its own green Question because a passage uses it; the preset's teal Question could not come in
  // while the teal look was taken. Freeing the look must not bring in a second Question.
  const tpl = (marks: AnnotationMark[]): AnnotationPreset => ({
    id: 'p',
    name: 'P',
    isDefault: false,
    createdAt: 0,
    revision: 1,
    marks,
  });
  const book: BookPreset = {
    id: 'p',
    name: 'P',
    revision: 1,
    customized: false,
    marks: [mark('a', '#FFEB3B'), { ...mark('mine', '#A5D6A7'), name: 'Question', local: true }],
  };
  const template = tpl([mark('a', '#FFEB3B'), { ...mark('q', '#80CBC4', 'box'), name: 'question' }]);

  it('keeps the preset mark of that name out, and says which mark is the reason', () => {
    expect(adoptFreedPresetMarks(book, template)).toBe(book);
    expect([...blockedPresetMarks(book, template)]).toEqual(['mine']);
  });

  // Deleting the book's Question makes room for the preset's, so that is where its passages can go.
  it('offers, for the delete, the preset mark it was holding out — and nothing it was not', () => {
    expect(marksFreedByDeleting(book, template, 'mine').map((m) => m.id)).toEqual(['q']);
    expect(marksFreedByDeleting(book, template, 'a')).toEqual([]);
    expect(marksFreedByDeleting(book, undefined, 'mine')).toEqual([]);
  });

  it('lets it in once the book mark is renamed', () => {
    const renamed = { ...book, marks: [book.marks[0], { ...book.marks[1], name: 'Open question' }] };
    expect(adoptFreedPresetMarks(renamed, template).marks.map((m) => m.id)).toEqual(['a', 'q', 'mine']);
  });
});

describe('isMarkNameFree', () => {
  const marks = [
    { ...mark('a', '#FFEB3B'), name: 'Question' },
    { ...mark('b', '#A5D6A7'), name: '' },
  ];

  it('refuses a name another mark has, ignoring case and spaces', () => {
    expect(isMarkNameFree(marks, ' question ')).toBe(false);
    expect(isMarkNameFree(marks, 'Questions')).toBe(true);
  });

  it('lets the mark being edited keep its own name, and never refuses an empty one', () => {
    expect(isMarkNameFree(marks, 'Question', 'a')).toBe(true);
    expect(isMarkNameFree(marks, '')).toBe(true);
    expect(isMarkNameFree(marks, '  ', 'a')).toBe(true);
  });
});

describe('offeredMarks', () => {
  const book = (marks: BookMark[], hiddenMarkIds?: string[]): BookPreset => ({
    id: 'p',
    name: 'P',
    revision: 1,
    customized: false,
    marks,
    hiddenMarkIds,
  });

  /**
   * **Both reasons a mark can be unavailable, in one answer.**
   *
   * Filtering the bar on `enabled` alone would let turning a mark off for one book gray its row in the manager and
   * change nothing a reader could see. Order is preset order in both cases — an unavailable mark is skipped, not
   * left as a gap.
   */
  it('drops what the preset retired and what this book turned off', () => {
    const marks = [mark('a', '#FFEB3B'), mark('b', '#A5D6A7'), mark('c', '#90CAF9', undefined, false)];
    expect(offeredMarks(book(marks, ['b'])).map((m) => m.id)).toEqual(['a']);
    expect(offeredMarks(book(marks)).map((m) => m.id)).toEqual(['a', 'b']);
    expect(offeredMarks(book(marks, ['a', 'b'])).map((m) => m.id)).toEqual([]);
  });

  // The chips and the `…` list both come off this list, so the quick row has to shorten by one rather than showing a
  // mark the reader has turned off in this novel.
  it('keeps a mark that is off out of the quick row', () => {
    const marks = [mark('a', '#FFEB3B'), mark('b', '#A5D6A7'), mark('c', '#90CAF9')];
    expect(quickMarks({ marks: offeredMarks(book(marks, ['b'])) }, 2).map((m) => m.id)).toEqual(['a', 'c']);
  });

  /**
   * The roles fall back through the list, which is the one place "still offered" becomes "applied without being
   * asked for": a pinned mark that is off resolves to the first mark that is on, and a note whose role mark is off
   * arrives with no mark rather than with that one.
   */
  it('keeps a mark that is off out of the two roles', () => {
    const offered = offeredMarks(book([mark('a', '#FFEB3B'), mark('b', '#A5D6A7')], ['b']));
    expect(audioMark({ marks: offered, audioMarkId: 'b' })?.id).toBe('a');
    expect(noteMark({ marks: offered, noteMarkId: 'b' })).toBeUndefined();
  });
});

describe('a mark the book owns holds its appearance', () => {
  const tpl = (marks: AnnotationMark[], revision = 2): AnnotationPreset => ({
    id: 'p1',
    name: 'P',
    isDefault: false,
    createdAt: 0,
    revision,
    marks,
  });
  const dupes = (b: BookPreset) => {
    const seen = new Set<string>();
    return b.marks.filter((m) => {
      const k = `${m.highlightColor}|${m.treatment ?? '-'}`;
      const had = seen.has(k);
      seen.add(k);
      return had;
    }).length;
  };

  // ── merge: three shapes, each of which produces a duplicate without this rule ──────────────────────

  it('a survivor in use blocks a new template mark reusing its appearance', () => {
    const book: BookPreset = { id: 'p1', name: 'P', revision: 1, marks: [mark('x', '#FFEB3B')] };
    const out = mergeBookPreset(book, tpl([{ ...mark('y', '#FFEB3B'), name: 'Fresh' }]), (id) => id === 'x');
    expect(dupes(out)).toBe(0);
    expect(out.marks.map((m) => m.id)).toEqual(['x']);
  });

  it("a book's own mark in use blocks a new template mark that matches it", () => {
    // The likeliest shape, and it needs nothing unusual: you add a mark, the preset author later adds one
    // that happens to look the same.
    const mine: BookMark = { ...mark('l', '#A5D6A7'), name: 'Stuff I hate', local: true };
    const book: BookPreset = { id: 'p1', name: 'P', revision: 1, marks: [mine] };
    const out = mergeBookPreset(book, tpl([{ ...mark('n', '#A5D6A7'), name: 'Stuff I love' }]), () => true);
    expect(dupes(out)).toBe(0);
    expect(out.marks.map((m) => m.name)).toEqual(['Stuff I hate']);
  });

  it('an UNUSED book mark gives way, losing only the name it was given', () => {
    const mine: BookMark = { ...mark('l', '#A5D6A7'), name: 'Question', local: true };
    const book: BookPreset = { id: 'p1', name: 'P', revision: 1, marks: [mine] };
    const out = mergeBookPreset(book, tpl([{ ...mark('n', '#A5D6A7'), name: 'Good point' }]), () => false);
    expect(out.marks.map((m) => m.name)).toEqual(['Good point']);
  });

  it('a template EDIT onto an appearance the book holds is refused, keeping the old definition', () => {
    const mine: BookMark = { ...mark('l', '#CE93D8'), name: 'Mine', local: true };
    const book: BookPreset = { id: 'p1', name: 'P', revision: 1, marks: [mark('t', '#90CAF9'), mine] };
    const out = mergeBookPreset(book, tpl([{ ...mark('t', '#CE93D8'), name: 'Tracked' }]), () => true);
    expect(dupes(out)).toBe(0);
    expect(out.marks.find((m) => m.id === 't')?.highlightColor).toBe('#90CAF9');
  });

  // ── switch: the reader's plan decides, with no second channel ────────────────────────────────────────

  it('keeps the book mark and leaves the colliding preset mark out, when it is still in use', () => {
    const mine: BookMark = { ...mark('l', '#90CAF9'), name: 'Question', local: true };
    const book: BookPreset = { id: 'p0', name: 'Old', revision: 1, marks: [mine] };
    const { book: out } = switchBookPreset(book, tpl([{ ...mark('n1', '#90CAF9'), name: 'Hidden Mark' }]), () => true);
    expect(out.marks.map((m) => m.name)).toEqual(['Question']);
  });

  it('lets the preset mark in once the annotations have moved off the book mark', () => {
    // What choosing another target does: `applyRemap` runs first, so the book mark is unused by the time the
    // switch asks — no `keep` set to carry the choice, because the choice is already in the usage.
    const mine: BookMark = { ...mark('l', '#90CAF9'), name: 'Question', local: true };
    const book: BookPreset = { id: 'p0', name: 'Old', revision: 1, marks: [mine] };
    const { book: out, idMap } = switchBookPreset(
      book,
      tpl([{ ...mark('n1', '#90CAF9'), name: 'Hidden Mark' }]),
      () => false
    );
    expect(out.marks.map((m) => m.name)).toEqual(['Hidden Mark']);
    expect(idMap.get('l')).toBe('n1');
  });

  // ── adopting a mark once the appearance is freed ─────────────────────────────────────────────────────

  it('brings a blocked preset mark in when the appearance is freed, in the template order', () => {
    const book: BookPreset = { id: 'p1', name: 'P', revision: 2, marks: [mark('a', '#FFEB3B')] };
    const template = tpl([mark('a', '#FFEB3B'), mark('b', '#A5D6A7')]);
    expect(adoptFreedPresetMarks(book, template).marks.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('adopts nothing while the appearance is still claimed, and answers the same object', () => {
    const mine: BookMark = { ...mark('l', '#A5D6A7'), local: true };
    const book: BookPreset = { id: 'p1', name: 'P', revision: 2, marks: [mine] };
    expect(adoptFreedPresetMarks(book, tpl([mark('b', '#A5D6A7')]))).toBe(book);
  });

  it('adopts nothing for a detached book, which follows no template at all', () => {
    const book: BookPreset = { id: '', name: '', revision: 0, detached: true, marks: [] };
    expect(adoptFreedPresetMarks(book, tpl([mark('b', '#A5D6A7')]))).toBe(book);
  });

  it('names the book mark that is blocking, so the row can say why', () => {
    const mine: BookMark = { ...mark('l', '#A5D6A7'), local: true };
    const book: BookPreset = { id: 'p1', name: 'P', revision: 2, marks: [mine] };
    expect([...blockedPresetMarks(book, tpl([mark('b', '#A5D6A7')]))]).toEqual(['l']);
  });
});

describe('detachBookPreset', () => {
  const book = (): BookPreset => ({
    id: 'p1',
    name: 'Test',
    revision: 4,
    marks: [mark('tracked', '#FFEB3B'), { ...mark('mine', '#90CAF9'), local: true as const }],
    noteMarkId: 'tracked',
    audioMarkId: 'mine',
  });
  const owned = (id: string) => id === 'tracked';

  it("makes every mark the book's own", () => {
    expect(detachBookPreset(book(), owned).book.marks.every((m) => m.local)).toBe(true);
  });

  it('re-mints only the ids the library still owns, so one id never names two definitions', () => {
    // A tracked mark's id belongs to the preset the book is walking away from; a local one belongs to nobody
    // else, so it keeps its id and its annotations never move.
    const { book: out, idMap } = detachBookPreset(book(), owned);
    expect([...idMap.keys()]).toEqual(['tracked']);
    expect(out.marks.find((m) => m.name === 'mine')?.id).toBe('mine');
    expect(out.marks.find((m) => m.name === 'tracked')?.id).not.toBe('tracked');
  });

  it('carries the roles onto the re-minted ids', () => {
    const { book: out, idMap } = detachBookPreset(book(), owned);
    expect(out.noteMarkId).toBe(idMap.get('tracked'));
    expect(out.audioMarkId).toBe('mine');
  });

  it('flags the book detached and points it at no template', () => {
    // `detached` is what tells this apart from "never assigned" — without it `ensureBookAnnotationPreset`
    // reads the empty id as a book that has never had a preset and assigns the default on the next open.
    const { book: out } = detachBookPreset(book(), owned);
    expect(out).toMatchObject({ detached: true, id: '', revision: 0 });
  });

  it('a detached book is never merged, whatever the template says', () => {
    const { book: out } = detachBookPreset(book(), owned);
    const tpl: AnnotationPreset = {
      id: 'p1',
      name: 'Test',
      isDefault: false,
      createdAt: 0,
      revision: 99,
      marks: [mark('tracked', '#FFEB3B')],
    };
    // Same id AND a far newer revision — every condition a merge normally runs on. `detached` is checked first,
    // so the book comes back by identity rather than rebuilt.
    const pointedAtIt: BookPreset = { ...out, id: tpl.id };
    expect(mergeBookPreset(pointedAtIt, tpl, () => true)).toBe(pointedAtIt);
  });
});

describe('applyMarkDeletion', () => {
  const marks = [mark('keep', '#90CAF9')];
  const hl = (markId: string) => ({
    markId,
    color: '#FFEB3B',
    treatment: 'box' as const,
    treatmentColor: INK,
    cfiRange: 'epubcfi(/6/2!/a)',
  });
  const note = (markId: string) => ({ markId, color: '#FFEB3B', treatment: 'box' as const, text: 'mine' });

  it("'remove' deletes the passage selections that carried the mark", () => {
    const out = applyMarkDeletion('gone', 'remove', marks, {
      highlights: [hl('gone'), hl('keep')],
      notes: [],
    });
    expect(out.highlights.map((h) => h.markId)).toEqual(['keep']);
  });

  it("'remove' KEEPS the notes and only unmarks them — the words are the reader's", () => {
    // A passage selection is a mark on some words; a note is words. An unmarked note is a supported state,
    // so a decision about marks must not destroy one.
    const out = applyMarkDeletion('gone', 'remove', marks, { highlights: [], notes: [note('gone')] });
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toMatchObject({ text: 'mine', markId: undefined });
  });

  it("'remove' clears the appearance snapshot with the id, or it would draw the deleted mark", () => {
    // `color` and `treatment` are read ONLY when `markId` fails to resolve — so leaving them behind is
    // exactly how a mark outlives its own deletion.
    const out = applyMarkDeletion('gone', 'remove', marks, { highlights: [], notes: [note('gone')] });
    expect(out.notes[0].color).toBeUndefined();
    expect(out.notes[0].treatment).toBeUndefined();
  });

  it('a target moves both kinds onto it, appearance included', () => {
    const out = applyMarkDeletion('gone', { markId: 'keep' }, marks, {
      highlights: [hl('gone')],
      notes: [note('gone')],
    });
    expect(out.highlights[0]).toMatchObject({ markId: 'keep', color: '#90CAF9' });
    expect(out.notes[0]).toMatchObject({ markId: 'keep', color: '#90CAF9', text: 'mine' });
  });

  it('hands back the removed highlights, so the caller can take their drawings off the page', () => {
    // The failure this guards against: `redrawAnnotations` re-adds SURVIVORS only, so an annotation dropped
    // here is never visited again and its overlay stays on screen until the book is reopened.
    const out = applyMarkDeletion('gone', 'remove', marks, {
      highlights: [{ ...hl('gone'), cfiRange: 'epubcfi(/6/4!/x)' }, hl('keep')],
      notes: [],
    });
    expect(out.removed).toHaveLength(1);
    expect(out.removed[0].cfiRange).toBe('epubcfi(/6/4!/x)');
  });

  it('a remap removes nothing — foliate clears the old drawing when the annotation is re-added', () => {
    const out = applyMarkDeletion('gone', { markId: 'keep' }, marks, { highlights: [hl('gone')], notes: [] });
    expect(out.removed).toEqual([]);
  });

  it('leaves annotations on other marks alone either way', () => {
    const content = { highlights: [hl('keep')], notes: [note('keep')] };
    expect(applyMarkDeletion('gone', 'remove', marks, content).highlights[0].markId).toBe('keep');
    expect(applyMarkDeletion('gone', { markId: 'keep' }, marks, content).notes[0]).toMatchObject({ markId: 'keep' });
  });
});

describe('applyRemap', () => {
  const marks = [
    mark('new1', '#90CAF9'),
    { id: 'new2', name: 'Boxed', treatment: 'box' as const, treatmentColor: INK, enabled: true },
  ];
  const hl = { markId: 'old', color: '#FFEB3B', treatment: undefined, treatmentColor: undefined };

  it('moves the annotation onto the target AND takes its appearance', () => {
    // The snapshot is what shows if that mark is ever deleted, so leaving the old one would resurrect a
    // look the reader had already moved away from.
    const out = applyRemap(hl, new Map([['old', { markId: 'new2' }]]), marks);
    expect(out).toMatchObject({ markId: 'new2', color: 'transparent', treatment: 'box', treatmentColor: INK });
  });

  it("stores 'transparent' when the target has no wash, so the sentinel stays consistent", () => {
    expect(applyRemap(hl, new Map([['old', { markId: 'new2' }]]), marks).color).toBe('transparent');
  });

  // There are only two choices, and the type enforces it: no "leave unmarked", which would be the one path that
  // could leave a passage selection markless in a current file — the state eager preset assignment exists to
  // retire. Keeping a mark in the book costs a row in its list; leaving it unmarked would cost a hole in the model.
  it("'local' changes nothing — the mark is coming along", () => {
    const plan = new Map([['old', 'local' as const]]);
    expect(applyRemap(hl, plan, marks)).toBe(hl);
  });

  it('leaves annotations the plan says nothing about, and markless ones', () => {
    expect(applyRemap(hl, new Map(), marks)).toBe(hl);
    // No markId, so no plan entry can apply to it.
    const markless = { color: '#FFEB3B' };
    expect(applyRemap(markless, new Map([['old', 'local' as const]]), marks)).toBe(markless);
  });

  it('leaves it alone rather than orphaning it when the target does not exist', () => {
    expect(applyRemap(hl, new Map([['old', { markId: 'gone' }]]), marks)).toBe(hl);
  });
});

describe('copyMarkLocally', () => {
  const book = (): BookPreset => ({
    id: 'p1',
    name: 'P',
    revision: 3,
    marks: [mark('a', '#FFEB3B'), mark('b', '#A5D6A7'), mark('c', '#90CAF9')],
  });
  const template = (revision: number, marks: AnnotationMark[]): AnnotationPreset => ({
    id: 'p1',
    name: 'P',
    isDefault: false,
    createdAt: 0,
    revision,
    marks,
  });
  const copied = (): BookPreset => copyMarkLocally(book(), 'b', 'copy1') as BookPreset;

  it('replaces the original: the copy takes its place, with a new id and the same look', () => {
    const out = copied();
    expect(out.marks.map((m) => m.id)).toEqual(['a', 'copy1', 'c']);
    expect(out.marks[1]).toMatchObject({ id: 'copy1', local: true, copyOf: 'b', highlightColor: '#A5D6A7' });
    expect(out.hiddenMarkIds).toBeUndefined();
  });

  // The original used to stay on as a hidden mark, and held its look: a copy recolored and then set back was
  // refused as a clash with a mark the reader could no longer see.
  it('leaves the original look free for the copy to go back to', () => {
    const out = copied();
    const recolored = out.marks.map((m) => (m.id === 'copy1' ? { ...m, highlightColor: '#CE93D8' } : m));
    expect(isMarkAppearanceFree(recolored, { highlightColor: '#A5D6A7' }, 'copy1')).toBe(true);
  });

  it('moves the roles and the Active state onto the copy', () => {
    const b: BookPreset = { ...book(), noteMarkId: 'b', audioMarkId: 'b', hiddenMarkIds: ['b', 'c'] };
    const out = copyMarkLocally(b, 'b', 'copy1');
    expect(out?.noteMarkId).toBe('copy1');
    expect(out?.audioMarkId).toBe('copy1');
    expect(out?.hiddenMarkIds).toEqual(['copy1', 'c']);
  });

  it('leaves the preset itself alone — this is the book making its own copy', () => {
    const b = book();
    copyMarkLocally(b, 'b', 'copy1');
    expect(b.marks.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(b.hiddenMarkIds).toBeUndefined();
  });

  it('refuses a mark the book already owns, or one that is not there', () => {
    const b = { ...book(), marks: [{ ...mark('mine', '#CE93D8'), local: true as const }] };
    expect(copyMarkLocally(b, 'mine', 'x')).toBeNull();
    expect(copyMarkLocally(book(), 'nope', 'x')).toBeNull();
  });

  // Identical to its original, the copy would otherwise lose to it under the silent-clash rule on the next
  // preset update, and the reader's copy would quietly turn back into the preset's mark.
  it('keeps the copy through a preset update, and never brings the original back', () => {
    const merged = mergeBookPreset(
      copied(),
      template(4, [mark('a', '#FFEB3B'), mark('b', '#A5D6A7', 'box'), mark('c', '#90CAF9')]),
      () => false
    );
    expect(merged.marks.map((m) => m.id)).toEqual(['a', 'copy1', 'c']);
    expect(merged.marks[1]).toMatchObject({ highlightColor: '#A5D6A7', local: true });
    expect(merged.marks[1].treatment).toBeUndefined();
  });

  it('has nothing to prune when the preset drops the original', () => {
    const merged = mergeBookPreset(copied(), template(4, [mark('a', '#FFEB3B'), mark('c', '#90CAF9')]), () => false);
    expect(merged.marks.map((m) => m.id)).toEqual(['a', 'copy1', 'c']);
  });

  it('does not bring the original back when the copy frees its look', () => {
    const out = copied();
    const recolored = {
      ...out,
      marks: out.marks.map((m) => (m.id === 'copy1' ? { ...m, highlightColor: '#CE93D8' } : m)),
    };
    const t = template(3, [mark('a', '#FFEB3B'), mark('b', '#A5D6A7'), mark('c', '#90CAF9')]);
    expect(adoptFreedPresetMarks(recolored, t).marks.map((m) => m.id)).toEqual(['a', 'copy1', 'c']);
  });

  it('does not flag the copy as holding the look of the mark it replaced', () => {
    const t = template(3, [mark('a', '#FFEB3B'), mark('b', '#A5D6A7'), mark('c', '#90CAF9')]);
    expect(blockedPresetMarks(copied(), t).size).toBe(0);
  });

  it('leaves one mark of that look when the book stops using its preset', () => {
    const { book: detached } = detachBookPreset(copied(), () => false);
    expect(detached.marks.filter((m) => m.highlightColor === '#A5D6A7')).toHaveLength(1);
    expect(detached.marks.map((m) => m.copyOf)).toEqual([undefined, undefined, undefined]);
  });
});
