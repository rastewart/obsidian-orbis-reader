import { afterEach, describe, expect, it } from 'vitest';
import { ratingPicks, statusChoices, statusPicks } from '../library/choices';
import { setLibraryFields } from '../library/fields';

afterEach(() => setLibraryFields([]));

describe('statusChoices', () => {
  /**
   * **The value itself, until the reader names it.** Translating the four in the menus alone would give one value
   * two names, since the Fields page, the collection editor's Value dropdown and every dashboard group heading use
   * the stored values. The four are offered on exactly the same terms as a status the reader adds.
   */
  it('calls the four what the notes call them', () => {
    expect(statusChoices().map((choice) => choice.label)).toEqual(['interested', 'reading', 'read', 'abandoned']);
  });

  // The Fields page is where a value is named, and this is what shows it — a status renamed there and still called
  // something else here would mean the setting described a list nobody saw. The reader's order comes first and
  // Orbis's own values follow, which is `mergeValues`: a value is switched off rather than dropped by omission.
  it('uses the reader’s names and the reader’s order', () => {
    setLibraryFields([{ key: 'reading_status', values: [{ value: 'read', label: 'Done' }, { value: 'reading' }] }]);
    expect(statusChoices()).toEqual([
      { status: 'read', label: 'Done' },
      { status: 'reading', label: 'reading' },
      { status: 'interested', label: 'interested' },
      { status: 'abandoned', label: 'abandoned' },
    ]);
  });

  // A value of the reader's own, under its own name — falling back to the value itself when they have not given it
  // one, which is the same chain every other field's values follow.
  it('offers a status the reader added', () => {
    setLibraryFields([{ key: 'reading_status', values: [{ value: 'Archived' }] }]);
    expect(statusChoices()[0]).toEqual({ status: 'Archived', label: 'Archived' });
    // Beside the four rather than instead of them: adding a value on the Fields page is an addition, and taking
    // one away is what the switch beside it does.
    expect(statusChoices().map((choice) => choice.status)).toEqual([
      'Archived',
      'interested',
      'reading',
      'read',
      'abandoned',
    ]);
  });
});

describe('statusPicks', () => {
  /**
   * **The values, and nothing else.** No "No status" row: choosing the value a note already has is what clears it,
   * exactly as it does in the library's row menu, so a row for clearing would be a second way to say what the tick
   * already says — and one tap meaning two different things depending on the surface.
   */
  it('offers the values and no way out of its own', () => {
    const picks = statusPicks(null);
    expect(picks.map((pick) => pick.value)).toEqual(['interested', 'reading', 'read', 'abandoned']);
    expect(picks.some((pick) => pick.current)).toBe(false);
  });

  it('marks what the note says, which is also what clears it', () => {
    expect(
      statusPicks('read')
        .filter((pick) => pick.current)
        .map((pick) => pick.value)
    ).toEqual(['read']);
    expect(statusPicks('read')).toHaveLength(4);
  });

  // A status the note carries that the field table no longer offers — retired on the Fields page, or written by
  // hand. The list is what can be set now; nothing in it is ticked, and choosing one is what puts the note right.
  it('ticks nothing when the note says something no longer offered', () => {
    expect(statusPicks('lending').some((pick) => pick.current)).toBe(false);
  });
});

describe('ratingPicks', () => {
  it('offers half steps from nothing-at-all to five', () => {
    expect(ratingPicks(null).map((pick) => pick.value)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  });

  /**
   * **Zero is a rating, and this is where that has to hold.** A book rated zero says "I really did not like it",
   * which is a different fact from one nobody has rated — so the zero row is ticked, which a falsy test for "has a
   * rating" would get wrong, and tapping it again is what clears it.
   */
  it('tells a book rated zero from one nobody has rated', () => {
    expect(
      ratingPicks(0)
        .filter((pick) => pick.current)
        .map((pick) => pick.value)
    ).toEqual([0]);
    expect(ratingPicks(null).some((pick) => pick.current)).toBe(false);
  });

  it('marks the half it is rated', () => {
    expect(
      ratingPicks(3.5)
        .filter((pick) => pick.current)
        .map((pick) => pick.label)
    ).toEqual(['3.5']);
  });
});
