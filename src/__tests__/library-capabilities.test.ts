import { describe, expect, it } from 'vitest';
import type { BookState } from '../library/book-state';
import { capabilitiesOf, hasAnyAction } from '../library/capabilities';
import { parseRecord } from '../library/record';

const record = (fm: Record<string, unknown>) => {
  const r = parseRecord('Library/Titles/x.md', { orbis_note: 'title', title: 'T', ...fm });
  if (!r) throw new Error('fixture is not a record');
  return r;
};

const state = (over: Partial<BookState> = {}): BookState => ({
  started: false,
  lastOpened: 0,
  recorded: false,
  hasData: false,
  ...over,
});

const noState = () => state();

describe('capabilitiesOf', () => {
  it('is readable when a linked file is a book Orbis opens', () => {
    const caps = capabilitiesOf(record({}), [{ path: 'Books/T.epub', readable: true }], noState);
    expect(caps.readPath).toBe('Books/T.epub');
    expect(caps.canListen).toBe(true);
  });

  // The catalog's whole point: a record with no local copy is still a record.
  it('is not readable when nothing is attached', () => {
    const caps = capabilitiesOf(record({ source_url: 'https://example.com/x' }), [], noState);
    expect(caps.readPath).toBeNull();
    expect(caps.canListen).toBe(false);
    expect(caps.sourceUrl).toBe('https://example.com/x');
    expect(hasAnyAction(caps)).toBe(true);
  });

  it('ignores attached files Orbis cannot open', () => {
    const caps = capabilitiesOf(record({}), [{ path: 'Books/T.pdf', readable: false }], noState);
    expect(caps.readPath).toBeNull();
  });

  // One title, two editions, and the second is the one being read: a record that reported the FIRST file's state
  // was a title you had just read missing from Continue, and a Read button that reopened the wrong edition.
  it('acts on the edition that has been opened, not the first one listed', () => {
    const files = [
      { path: 'Books/Crime-and-Punishment.azw3', readable: true },
      { path: 'Books/Crime-and-Punishment.epub', readable: true },
    ];
    const caps = capabilitiesOf(record({}), files, (path) =>
      path.endsWith('.epub') ? state({ started: true, lastOpened: 500, hasData: true }) : noState()
    );
    expect(caps.readPath).toBe('Books/Crime-and-Punishment.epub');
    expect(caps.started).toBe(true);
    expect(caps.lastOpened).toBe(500);
    expect(caps.hasData).toBe(true);
  });

  // Two editions both read: Continue is ordered by recency, so the newer one is what the row is about.
  it('takes the most recently opened when several have been', () => {
    const files = [
      { path: 'Books/a.epub', readable: true },
      { path: 'Books/b.epub', readable: true },
    ];
    const caps = capabilitiesOf(record({}), files, (path) =>
      state({ started: true, lastOpened: path === 'Books/b.epub' ? 900 : 100 })
    );
    expect(caps.readPath).toBe('Books/b.epub');
    expect(caps.lastOpened).toBe(900);
  });

  // One title, two formats, neither opened. The reader's own order is the preference; imposing ours would
  // override it.
  it('takes the first readable file the record lists when none has been opened', () => {
    const caps = capabilitiesOf(
      record({}),
      [
        { path: 'Books/T.pdf', readable: false },
        { path: 'Books/T.azw3', readable: true },
        { path: 'Books/T.epub', readable: true },
      ],
      noState
    );
    expect(caps.readPath).toBe('Books/T.azw3');
  });

  // A live voice reads anything Orbis can open, so gating Listen on a recording would hide it on almost every
  // title. Whether a recording exists is information the row shows, not permission it needs.
  it('offers listening without a recording, and reports when there is one', () => {
    const plain = capabilitiesOf(record({}), [{ path: 'B/T.epub', readable: true }], noState);
    expect(plain.canListen).toBe(true);
    expect(plain.recorded).toBe(false);

    const withAudio = capabilitiesOf(record({}), [{ path: 'B/T.epub', readable: true }], () =>
      state({ recorded: true })
    );
    expect(withAudio.canListen).toBe(true);
    expect(withAudio.recorded).toBe(true);
  });

  it('carries reading state through from the attached file', () => {
    const caps = capabilitiesOf(record({}), [{ path: 'B/T.epub', readable: true }], () =>
      state({ started: true, lastOpened: 900, hasData: true })
    );
    expect(caps.started).toBe(true);
    expect(caps.lastOpened).toBe(900);
    expect(caps.hasData).toBe(true);
  });

  it('reports no state for a record with no file, rather than inventing one', () => {
    const caps = capabilitiesOf(record({}), [], () => state({ started: true, lastOpened: 900 }));
    expect(caps.started).toBe(false);
    expect(caps.lastOpened).toBe(0);
    expect(caps.hasData).toBe(false);
  });
});

describe('hasAnyAction', () => {
  it('is false for a record that is purely a catalog entry', () => {
    expect(hasAnyAction(capabilitiesOf(record({}), [], noState))).toBe(false);
  });
});
