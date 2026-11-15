// The seeded note style: scaffolding until someone touches it.
//
// The failure being prevented is quiet and expensive — a device installed today seeds a "Default" whose version is
// newer than the one a reader has been refining for months, publishes it, and every device adopts the shipped
// article over the real one. Everything here is about telling those two apart.

import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_STYLE_CONFIG, type NoteStyle } from '../settings';
import {
  findShippedNoteStyle,
  isSeededDefault,
  isShippedNoteStyle,
  LEGACY_SEEDED_NOTE_STYLE_NAME,
  publishableNoteStyles,
  SEEDED_NOTE_STYLE_ID,
  withoutSpentScaffolding,
} from '../sync/styles';

const NAME = 'Orbis style';

const seeded = (over: Partial<NoteStyle> = {}): NoteStyle => ({
  id: SEEDED_NOTE_STYLE_ID,
  name: NAME,
  isDefault: true,
  createdAt: 1,
  config: { ...DEFAULT_NOTE_STYLE_CONFIG },
  ...over,
});

const mine = (name: string, over: Partial<NoteStyle> = {}): NoteStyle => ({
  id: `style-${name}`,
  name,
  isDefault: false,
  createdAt: 2,
  config: { ...DEFAULT_NOTE_STYLE_CONFIG, notePath: 'Notes/Books' },
  ...over,
});

describe('isSeededDefault', () => {
  it('knows the untouched shipped article', () => {
    expect(isSeededDefault(seeded(), NAME)).toBe(true);
  });

  it('is false once the config has been edited — that is a reader’s style now', () => {
    expect(
      isSeededDefault(seeded({ config: { ...DEFAULT_NOTE_STYLE_CONFIG, notePath: 'aaa-book-notes' } }), NAME)
    ).toBe(false);
  });

  it('is false once it has been renamed', () => {
    expect(isSeededDefault(seeded({ name: 'My default' }), NAME)).toBe(false);
  });

  it('is false for a style the reader promoted to default', () => {
    // Same flag, but it is theirs: it has a name they chose and a config they built.
    expect(isSeededDefault(mine('Kindle-ish', { isDefault: true }), NAME)).toBe(false);
  });

  it('does not care what order the config keys were written in', () => {
    const reordered = Object.fromEntries(Object.entries(DEFAULT_NOTE_STYLE_CONFIG).reverse()) as NoteStyle['config'];
    expect(isSeededDefault(seeded({ config: reordered }), NAME)).toBe(true);
  });
});

describe('publishableNoteStyles', () => {
  it('keeps everything a reader made', () => {
    const styles = [seeded(), mine('Kindle-ish'), mine('Folder notes')];
    expect(publishableNoteStyles(styles, NAME).map((s) => s.name)).toEqual(['Kindle-ish', 'Folder notes']);
  });

  it('publishes the seeded one once it has been edited', () => {
    const edited = seeded({ config: { ...DEFAULT_NOTE_STYLE_CONFIG, notePath: 'Notes' } });
    expect(publishableNoteStyles([edited], NAME)).toEqual([edited]);
  });
});

describe('withoutSpentScaffolding', () => {
  it('drops the placeholder once real styles have arrived', () => {
    const kept = withoutSpentScaffolding([seeded(), mine('Kindle-ish')], NAME);
    expect(kept.map((s) => s.name)).toEqual(['Kindle-ish']);
  });

  it('keeps it when there is nothing else — a vault with no styles still needs one', () => {
    // Otherwise the first thing sync does on a single-device vault is remove the style the plugin just made.
    expect(withoutSpentScaffolding([seeded()], NAME).map((s) => s.id)).toEqual([SEEDED_NOTE_STYLE_ID]);
  });

  it('leaves a list with no scaffolding in it alone', () => {
    const styles = [mine('Kindle-ish'), mine('Folder notes')];
    expect(withoutSpentScaffolding(styles, NAME)).toEqual(styles);
  });
});

/**
 * The shipped style's name, "Orbis style" (legacy: "Default").
 *
 * Two things keep a rename safe, and both are asserted here: the shipped style is recognized by its ID rather than
 * its name — otherwise a rename would turn a vault's copy into a published item, which is the exact failure this
 * module exists to prevent — and the one-time migration only fires on a copy nobody has made their own.
 */
describe('the shipped style is identified by id, not by name', () => {
  it('does not treat a look-alike with a different id as scaffolding', () => {
    // Same name, same flag, same config — but a style the reader built. It has to publish.
    const lookalike: NoteStyle = { ...seeded(), id: 'style-mine' };
    expect(isSeededDefault(lookalike, NAME)).toBe(false);
    expect(publishableNoteStyles([lookalike], NAME)).toEqual([lookalike]);
  });

  it('still treats a rename as touching it', () => {
    expect(isSeededDefault(seeded({ name: 'My own' }), NAME)).toBe(false);
  });
});

/**
 * Finding the shipped style, once, to stamp `isSystem` on it.
 *
 * Not keyed on the fixed id alone, which would reach only vaults young enough to have one.
 */
describe('findShippedNoteStyle', () => {
  it('finds the copy a device seeds today, by id', () => {
    expect(findShippedNoteStyle([seeded()], NAME)?.id).toBe(SEEDED_NOTE_STYLE_ID);
  });

  /**
   * A vault set up before `SEEDED_NOTE_STYLE_ID` existed carries a GENERATED id. Keying on the fixed id would
   * exclude exactly the installs old enough to still say "Default" — and a freshly seeded test vault always passes
   * that check, so only this case can catch it.
   */
  it('finds one from a vault that predates the fixed id, by its old name', () => {
    const old = seeded({ id: 'msz0vkqwmd88ek39b09', name: LEGACY_SEEDED_NOTE_STYLE_NAME });
    expect(findShippedNoteStyle([old], NAME)?.id).toBe('msz0vkqwmd88ek39b09');
  });

  it('finds one a vault already renamed but never flagged', () => {
    const renamed = seeded({ id: 'msz0vkqwmd88ek39b09', name: NAME });
    expect(findShippedNoteStyle([renamed], NAME)?.id).toBe('msz0vkqwmd88ek39b09');
  });

  it('finds one whose config the reader edited — they never chose the name', () => {
    const edited = seeded({ config: { ...DEFAULT_NOTE_STYLE_CONFIG, notePath: 'mine' } });
    expect(findShippedNoteStyle([edited], NAME)).toBeDefined();
  });

  it('finds one demoted from default — same reason', () => {
    expect(findShippedNoteStyle([seeded({ isDefault: false })], NAME)).toBeDefined();
  });

  it('leaves one the reader renamed', () => {
    const mine = seeded({ id: 'msz0vkqwmd88ek39b09', name: 'Kindle-ish' });
    expect(findShippedNoteStyle([mine], NAME)).toBeUndefined();
  });

  it('does not run twice — a flagged vault is already migrated', () => {
    const done = seeded({ isSystem: true });
    const legacy = seeded({ id: 'other', name: LEGACY_SEEDED_NOTE_STYLE_NAME });
    expect(findShippedNoteStyle([done, legacy], NAME)).toBeUndefined();
  });

  it('prefers the fixed id over a name match', () => {
    const byName = seeded({ id: 'other', name: LEGACY_SEEDED_NOTE_STYLE_NAME });
    expect(findShippedNoteStyle([byName, seeded()], NAME)?.id).toBe(SEEDED_NOTE_STYLE_ID);
  });

  it('claims nothing in a vault of styles the reader built', () => {
    const mine = seeded({ id: 'style-mine', name: 'Folder notes' });
    expect(findShippedNoteStyle([mine], NAME)).toBeUndefined();
  });
});

/**
 * Deleting the shipped style.
 *
 * Nothing reseeds it once other styles exist — `initializeDefaultNoteStyle` only fires on an empty list — so
 * deleting it loses the baseline the others were built from, permanently.
 */
describe('isShippedNoteStyle', () => {
  it('reads the flag and nothing else', () => {
    expect(isShippedNoteStyle({ isSystem: true })).toBe(true);
    expect(isShippedNoteStyle({ isSystem: false })).toBe(false);
  });

  /**
   * Why the flag decides, rather than a rule over name and id.
   *
   * A style can be named "Orbis style" and carry the seeded id and still be a copy the reader duplicated — and,
   * the other way round, the shipped one keeps its flag through any rename. Only the stamp knows.
   */
  it('does not claim a look-alike that was never stamped', () => {
    expect(isShippedNoteStyle({})).toBe(false);
  });

  it('still claims it after the reader renames it', () => {
    expect(isShippedNoteStyle({ isSystem: true })).toBe(true);
  });
});
