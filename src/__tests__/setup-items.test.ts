// The Setup page's registry, exercised as data.
//
// The whole point of the probe is that this file can ask "what does the page say when the dictionary is missing and
// Listening has been declined?" without an Obsidian, a filesystem or a rendered row.

import { describe, expect, it } from 'vitest';
import { resolveSetupItems, SETUP_ITEMS, type SetupItemId, type SetupProbe, setupProgress } from '../setup-items';

/** Nothing set up, nothing declined, nothing downloaded. */
function probe(over: Partial<SetupProbe> = {}): SetupProbe {
  return {
    bookSourcesOn: false,
    librarySetUp: false,
    recordsSetUp: false,
    devicesSetUp: false,
    dictionaryDownloaded: () => Promise.resolve(false),
    voiceReady: () => Promise.resolve(false),
    pdfFontsInstalled: () => Promise.resolve(false),
    ...over,
  };
}

const stateOf = async (p: SetupProbe, id: SetupItemId) => (await resolveSetupItems(p)).find((i) => i.id === id)?.state;

describe('the Setup registry', () => {
  /**
   * The number in "4 of 7" is not a constant anyone types — it is however many tasks there are. If a capability is
   * added without deciding whether it is a task, this is where it shows up.
   */
  it('has seven tasks, and one item that is not a task', () => {
    expect(SETUP_ITEMS.filter((i) => i.counted)).toHaveLength(7);
    expect(SETUP_ITEMS.filter((i) => !i.counted).map((i) => i.id)).toEqual(['appearance']);
  });

  // Every task has to be answerable, or the count can never be reached.
  it('gives every task a way to be answered, and no invitation one', () => {
    for (const spec of SETUP_ITEMS) expect(!!spec.done).toBe(spec.counted);
  });

  /** Appearance leads, and Devices is last — the order is the page. */
  it('draws Appearance first and Devices last of the tasks', async () => {
    const items = await resolveSetupItems(probe());
    expect(items[0]?.id).toBe('appearance');
    expect(items.filter((i) => i.counted).at(-1)?.id).toBe('devices');
  });

  it('reports an item with nothing to answer as open, never as outstanding', async () => {
    expect(await stateOf(probe(), 'appearance')).toBe('open');
    const progress = setupProgress(await resolveSetupItems(probe()));
    expect(progress.total).toBe(7);
  });

  it('reads each stored answer from its own field', async () => {
    expect(await stateOf(probe({ librarySetUp: true }), 'library')).toBe('done');
    expect(await stateOf(probe({ recordsSetUp: true }), 'records')).toBe('done');
    expect(await stateOf(probe({ devicesSetUp: true }), 'devices')).toBe('done');
    expect(await stateOf(probe({ bookSourcesOn: true }), 'book')).toBe('done');
  });

  it('waits for the answers that come off the disk', async () => {
    expect(await stateOf(probe(), 'lookup')).toBe('todo');
    expect(await stateOf(probe({ dictionaryDownloaded: () => Promise.resolve(true) }), 'lookup')).toBe('done');
    expect(await stateOf(probe({ voiceReady: () => Promise.resolve(true) }), 'listening')).toBe('done');
    expect(await stateOf(probe({ pdfFontsInstalled: () => Promise.resolve(true) }), 'pdf-fonts')).toBe('done');
  });

  it('counts only what is set up, over every task there is', async () => {
    const items = await resolveSetupItems(probe({ librarySetUp: true, recordsSetUp: true }));
    expect(setupProgress(items)).toEqual({ done: 2, total: 7 });
  });

  it('reaches the total when every task is set up', async () => {
    const items = await resolveSetupItems(
      probe({
        bookSourcesOn: true,
        librarySetUp: true,
        recordsSetUp: true,
        devicesSetUp: true,
        dictionaryDownloaded: () => Promise.resolve(true),
        voiceReady: () => Promise.resolve(true),
        pdfFontsInstalled: () => Promise.resolve(true),
      })
    );
    expect(setupProgress(items)).toEqual({ done: 7, total: 7 });
  });
});
