import { describe, expect, it } from 'vitest';
import {
  BOOK_LOCATION,
  type BookRecordConfig,
  GLOBAL_LOCATION,
  parseBookRecordConfig,
  type RecordDefaults,
  type RecordLocation,
  resolveRecords,
  seedBookConfig,
} from '../record-config';

const KINDS = { passages: true, notes: true, bookmarks: false };
const defaults = (mode: RecordDefaults['mode'], location: RecordLocation = GLOBAL_LOCATION): RecordDefaults => ({
  mode,
  kinds: KINDS,
  location,
});

describe('resolveRecords — the vault setting can always veto', () => {
  const yes: BookRecordConfig = { enabled: true, location: GLOBAL_LOCATION };
  const no: BookRecordConfig = { enabled: false, location: GLOBAL_LOCATION };

  it('writes nothing at all when the vault is off — whatever a book says', () => {
    // The property this replaced a "book wins" model to get: a feature that writes hundreds of notes into a
    // vault must have a switch that stops it. A book still writing after Off would also be invisible — no
    // list, no indication, just files appearing.
    expect(resolveRecords(null, defaults('off')).active).toBe(false);
    expect(resolveRecords(yes, defaults('off')).active).toBe(false);
    expect(resolveRecords(no, defaults('off')).active).toBe(false);
  });

  it('does not prompt while the vault is off either', () => {
    // "Should this book track?" is moot when nothing tracks.
    expect(resolveRecords(null, defaults('off')).ask).toBe(false);
  });
});

describe('resolveRecords — the book can always veto', () => {
  const no: BookRecordConfig = { enabled: false, location: { mode: 'book' } };

  it('stays off for a book set to no, even with the vault on for every book', () => {
    // The other half of the AND. Someone who deliberately excluded a book would be surprised to find it
    // tracked again because of a vault-wide setting.
    expect(resolveRecords(no, defaults('on')).active).toBe(false);
    expect(resolveRecords(no, defaults('ask')).active).toBe(false);
  });

  it('never re-asks a book that has answered', () => {
    for (const mode of ['off', 'ask', 'on'] as const) {
      expect(resolveRecords(no, defaults(mode)).ask).toBe(false);
      expect(resolveRecords({ enabled: true, location: GLOBAL_LOCATION }, defaults(mode)).ask).toBe(false);
    }
  });
});

describe('resolveRecords — a book that has never been asked', () => {
  it('writes when the vault is on for every book', () => {
    const r = resolveRecords(null, defaults('on'));
    expect(r.active).toBe(true);
    expect(r.ask).toBe(false);
    expect(r.location).toEqual(GLOBAL_LOCATION);
  });

  it('is asked, and writes nothing yet, when the vault asks per book', () => {
    const r = resolveRecords(null, defaults('ask'));
    expect(r.active).toBe(false);
    expect(r.ask).toBe(true);
  });

  it('never asks and writes at the same time', () => {
    for (const mode of ['off', 'ask', 'on'] as const) {
      const r = resolveRecords(null, defaults(mode));
      expect(r.active && r.ask).toBe(false);
    }
  });

  it('is asked whether it has never been asked or has chosen to follow the vault', () => {
    // The two are deliberately indistinguishable in behavior — "follow the vault" in ask mode means "ask me",
    // which is what never-asked means. They differ only to the stamp, which must not overwrite a real choice.
    expect(resolveRecords(null, defaults('ask')).ask).toBe(true);
    expect(resolveRecords({}, defaults('ask')).ask).toBe(true);
    expect(resolveRecords({ enabled: true }, defaults('ask')).ask).toBe(false);
    expect(resolveRecords({ enabled: false }, defaults('ask')).ask).toBe(false);
  });

  it('lets a book follow the vault after it has answered — a decision is never a one-way door', () => {
    // Pinning a book with no way back is the trap the kinds switch and the location dropdown both avoid, so the
    // on/off control must not be the one section that refuses.
    expect(resolveRecords({}, defaults('on')).active).toBe(true);
    expect(resolveRecords({}, defaults('off')).active).toBe(false);
  });

  it('follows the vault kinds', () => {
    expect(resolveRecords(null, defaults('on')).kinds).toEqual(KINDS);
  });
});

describe('resolveRecords — kinds follow the vault unless overridden', () => {
  it('uses the vault kinds when the book stored none', () => {
    // Absent means "follow", so a vault-level change reaches every book that has not overridden them —
    // which is what keeps Settings → "What gets written" a live control.
    const r = resolveRecords({ enabled: true, location: GLOBAL_LOCATION }, defaults('on'));
    expect(r.kinds).toEqual(KINDS);
  });

  it('uses the book kinds when it has them', () => {
    const own = { passages: false, notes: true, bookmarks: true };
    const r = resolveRecords({ enabled: true, kinds: own, location: GLOBAL_LOCATION }, defaults('on'));
    expect(r.kinds).toEqual(own);
  });
});

describe('seedBookConfig', () => {
  it('opens on the truth for an undecided book: following the vault, nothing stored', () => {
    // Not `enabled: true`. That was right while the control was a toggle and became a lie once it could say
    // "follow the vault" — the dialog would display a decision the book had never made. The ask-mode prompt
    // overrides this at its own call site, because a prompt offers an answer rather than reporting a state.
    expect(seedBookConfig(null)).toEqual({});
  });

  it('opens on what the book already chose', () => {
    const book: BookRecordConfig = { enabled: false, kinds: KINDS, location: { mode: 'custom', path: 'Work/R' } };
    expect(seedBookConfig(book)).toEqual(book);
  });

  it('copies an override rather than aliasing it, so editing the dialog cannot mutate what was stored', () => {
    const own = { passages: true, notes: true, bookmarks: false };
    const book: BookRecordConfig = { enabled: true, kinds: own, location: GLOBAL_LOCATION };
    const seeded = seedBookConfig(book);
    if (seeded.kinds) seeded.kinds.bookmarks = true;
    expect(own.bookmarks).toBe(false);
  });
});

describe('resolveRecords — location follows the vault default', () => {
  it('uses the vault default when the book has no location of its own', () => {
    expect(resolveRecords(null, defaults('on', BOOK_LOCATION)).location).toEqual(BOOK_LOCATION);
    expect(resolveRecords({ enabled: true }, defaults('on', BOOK_LOCATION)).location).toEqual(BOOK_LOCATION);
  });

  it('lets a book pin its own, whatever the vault default becomes', () => {
    const pinned: BookRecordConfig = { enabled: true, location: { mode: 'custom', path: 'Work/Reading' } };
    expect(resolveRecords(pinned, defaults('on', BOOK_LOCATION)).location).toEqual({
      mode: 'custom',
      path: 'Work/Reading',
    });
  });
});

describe('parseBookRecordConfig', () => {
  it('reads a full decision', () => {
    expect(parseBookRecordConfig({ enabled: true, kinds: KINDS, location: { mode: 'book' } })).toEqual({
      enabled: true,
      kinds: KINDS,
      location: { mode: 'book' },
    });
  });

  it('reads "asked, said no" as a decision — distinct from never having been asked', () => {
    expect(parseBookRecordConfig({ enabled: false, location: { mode: 'global' } })?.enabled).toBe(false);
  });

  it('treats a missing payload as never asked', () => {
    // Deliberately not as "off": a corrupt file reading as off looks exactly like the feature having quietly
    // stopped working, and there would be no way to tell the difference. Never-asked can be asked again.
    expect(parseBookRecordConfig(undefined)).toBeNull();
    expect(parseBookRecordConfig(null)).toBeNull();
    expect(parseBookRecordConfig('yes')).toBeNull();
    expect(parseBookRecordConfig(42)).toBeNull();
  });

  it('reads a payload with no `enabled` as "follows the vault", not as never asked', () => {
    // The distinction the every-book stamp needs: an empty object means the reader said "follow", so stamping
    // `enabled: true` over it on the next write would make that choice a lie.
    const followed = parseBookRecordConfig({});
    expect(followed).not.toBeNull();
    expect(followed?.enabled).toBeUndefined();
  });

  it('reads an unreadable `enabled` as "follows the vault" too, keeping the rest of the payload', () => {
    // Returning null would discard a custom location stored alongside it — a garbled on/off flag should not cost
    // a book the folder it was pointed at.
    const parsed = parseBookRecordConfig({ enabled: 'true', location: { mode: 'book' } });
    expect(parsed?.enabled).toBeUndefined();
    expect(parsed?.location).toEqual(BOOK_LOCATION);
  });

  it('inherits the kinds when they are absent or half-written', () => {
    expect(parseBookRecordConfig({ enabled: true })?.kinds).toBeUndefined();
    expect(parseBookRecordConfig({ enabled: true, kinds: { passages: true } })?.kinds).toBeUndefined();
    expect(parseBookRecordConfig({ enabled: true, kinds: 'all' })?.kinds).toBeUndefined();
  });

  it('keeps a custom path', () => {
    expect(
      parseBookRecordConfig({ enabled: true, location: { mode: 'custom', path: 'Work/Reading' } })?.location
    ).toEqual({ mode: 'custom', path: 'Work/Reading' });
  });

  it('leaves an ABSENT location absent, so the book follows the vault default', () => {
    // Absent and unusable are different answers: falling back on an absent one would pin every stamped book to
    // the shared folder and make the vault-level default unreachable.
    expect(parseBookRecordConfig({ enabled: true })?.location).toBeUndefined();
    expect(parseBookRecordConfig({ enabled: true, location: null })?.location).toBeUndefined();
  });

  it('falls back to the shared folder for a location it cannot use', () => {
    // Writing somewhere findable beats writing nothing, and beats inventing a folder name. Inheriting a garbled
    // value would let a typo silently redirect where notes are written.
    const bad = [
      { enabled: true, location: 'beside' },
      { enabled: true, location: {} },
      { enabled: true, location: { mode: 'elsewhere' } },
      { enabled: true, location: { mode: 'custom' } },
      { enabled: true, location: { mode: 'custom', path: '   ' } },
    ];
    for (const raw of bad) expect(parseBookRecordConfig(raw)?.location).toEqual(GLOBAL_LOCATION);
  });
});
