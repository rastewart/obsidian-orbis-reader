import { describe, expect, it } from 'vitest';
import type { BookPreset } from '../annotation-presets';
import type { Highlight } from '../progress';
import {
  addedSamples,
  type BookState,
  clearRecord,
  type DeviceMarksFile,
  listChanges,
  ownSamples,
  presetChange,
  rebuildBook,
  samplesRecord,
  usableRecord,
  withChanges,
} from '../sync/book-marks';
import type { SyncRecord, SyncVersion } from '../sync/records';

const at = (minute: number, clock = 0): SyncVersion => ({
  at: `2026-09-30T10:${String(minute).padStart(2, '0')}:00.000Z`,
  clock,
});
const hl = (id: string, createdAt: number, extra: Partial<Highlight> = {}): Highlight => ({
  id,
  cfiRange: `epubcfi(/6/4!/4/${createdAt})`,
  text: id,
  color: '#FFEB3B',
  createdAt,
  ...extra,
});
const put = <T>(type: string, id: string, item: T, device: string, version: SyncVersion): SyncRecord<T> => ({
  id,
  type,
  device,
  version,
  deleted: false,
  item,
});
const drop = (type: string, id: string, device: string, version: SyncVersion): SyncRecord => ({
  id,
  type,
  device,
  version,
  deleted: true,
});
const file = (device: string, records: SyncRecord[]): DeviceMarksFile => ({ version: 1, device, records });
const empty = (): BookState => ({
  highlights: [],
  notes: [],
  bookmarks: [],
  preset: null,
  readingStats: null,
  notesFiles: [],
  records: null,
});
const ids = (s: BookState) => s.highlights.map((h) => h.id);

const preset = (id: string, marks: [string, string][]): BookPreset => ({
  id,
  name: id,
  revision: 1,
  marks: marks.map(([mid, color]) => ({ id: mid, name: mid, enabled: true, highlightColor: color })),
});

describe('rebuildBook', () => {
  // Generate notes on both devices while apart: Open notes offers both sets once they meet.
  it('keeps the notes sets written on two devices while they were apart', () => {
    const set = (id: string, createdAt: number) => ({
      id,
      styleName: 'S',
      styleId: 's',
      createdAt,
      mode: 'single' as const,
      path: `${id}.md`,
    });
    const phone = file('phone', [put('notesSet', 'p', set('p', 1), 'phone', at(1))]);
    const mac = file('mac', [put('notesSet', 'm', set('m', 2), 'mac', at(2))]);
    expect(rebuildBook(empty(), [phone, mac]).notesFiles.map((s) => s.id)).toEqual(['p', 'm']);
  });

  it('lets the newest reading-records decision win, and clearing the book take it away', () => {
    const on = file('mac', [put('records', 'records', { enabled: true }, 'mac', at(2))]);
    const off = file('phone', [put('records', 'records', { enabled: false }, 'phone', at(3))]);
    expect(rebuildBook(empty(), [on, off]).records).toEqual({ enabled: false });
    const cleared = file('ipad', [clearRecord('ipad', at(4))]);
    expect(rebuildBook({ ...empty(), records: { enabled: true } }, [on, cleared]).records).toBeNull();
  });

  // The case the design exists for: the phone off the network, changes on both, then reconnected.
  it('keeps every mark made on two devices while they were apart', () => {
    const phone = file('phone', [
      put('highlight', 'p1', hl('p1', 1), 'phone', at(1)),
      put('highlight', 'p2', hl('p2', 2), 'phone', at(2)),
      put('highlight', 'p3', hl('p3', 3), 'phone', at(3)),
    ]);
    const mac = file('mac', [put('highlight', 'm1', hl('m1', 4), 'mac', at(2))]);
    expect(ids(rebuildBook(empty(), [phone, mac]))).toEqual(['p1', 'p2', 'p3', 'm1']);
  });

  it('lets the later of a deletion and an edit win, whichever it is', () => {
    const base = { ...empty(), highlights: [hl('h', 1)] };
    const edit = file('mac', [put('highlight', 'h', hl('h', 1, { color: '#A5D6A7' }), 'mac', at(5))]);
    const deleteLater = file('phone', [drop('highlight', 'h', 'phone', at(6))]);
    const deleteEarlier = file('phone', [drop('highlight', 'h', 'phone', at(4))]);
    expect(ids(rebuildBook(base, [edit, deleteLater]))).toEqual([]);
    expect(rebuildBook(base, [edit, deleteEarlier]).highlights[0].color).toBe('#A5D6A7');
  });

  it('keeps an item that has no record anywhere, so an existing .orbis needs no conversion', () => {
    const base = { ...empty(), highlights: [hl('old', 1)], preset: preset('p', [['k', '#FFEB3B']]) };
    expect(rebuildBook(base, [])).toEqual(base);
  });

  // A device that had not yet seen a change can still write the .orbis; the records put it right.
  it('cannot be undone by a stale .orbis', () => {
    const stale = { ...empty(), highlights: [hl('deleted-elsewhere', 1)] };
    const files = [
      file('phone', [drop('highlight', 'deleted-elsewhere', 'phone', at(2))]),
      file('mac', [put('highlight', 'added-elsewhere', hl('added-elsewhere', 2), 'mac', at(3))]),
    ];
    expect(ids(rebuildBook(stale, files))).toEqual(['added-elsewhere']);
  });

  it('gives the same result whatever order the files arrive in', () => {
    const a = file('a', [put('highlight', 'x', hl('x', 2), 'a', at(1)), put('highlight', 'y', hl('y', 1), 'a', at(2))]);
    const b = file('b', [put('highlight', 'x', hl('x', 2, { color: '#90CAF9' }), 'b', at(1))]);
    expect(JSON.stringify(rebuildBook(empty(), [a, b]))).toBe(JSON.stringify(rebuildBook(empty(), [b, a])));
  });

  it('lets the newest preset win whole, and a removed preset leave the book with none', () => {
    const base = { ...empty(), preset: preset('old', [['k', '#FFEB3B']]) };
    const switched = file('phone', [put('preset', 'preset', preset('new', [['q', '#CE93D8']]), 'phone', at(3))]);
    expect(rebuildBook(base, [switched]).preset?.id).toBe('new');
    expect(rebuildBook(base, [file('mac', [drop('preset', 'preset', 'mac', at(3))])]).preset).toBeNull();
  });

  // The phone switches preset offline while the Mac marks a passage with a mark from the old one.
  it('keeps the mark of an annotation made with a preset the book no longer uses, as a mark of the book', () => {
    const oldPreset = preset('old', [['key', '#FFEB3B']]);
    const base = { ...empty(), preset: oldPreset };
    const phone = file('phone', [put('preset', 'preset', preset('new', [['quote', '#CE93D8']]), 'phone', at(5))]);
    const mac = file('mac', [put('highlight', 'h', hl('h', 1, { markId: 'key' }), 'mac', at(4))]);
    const rebuilt = rebuildBook(base, [phone, mac]);
    expect(rebuilt.preset?.id).toBe('new');
    expect(rebuilt.preset?.marks.map((m) => [m.id, m.local])).toEqual([
      ['quote', undefined],
      ['key', true],
    ]);
    expect(rebuilt.highlights[0].markId).toBe('key');
  });

  it('adds up the reading-speed samples of every device, in the order the devices last recorded', () => {
    const files = [
      file('mac', [samplesRecord([300, 310], 'mac', at(5))]),
      file('phone', [samplesRecord([250], 'phone', at(2))]),
    ];
    expect(rebuildBook(empty(), files).readingStats).toEqual({
      wpmSamples: [250, 300, 310],
      lastUpdated: at(5).at,
    });
  });

  // `.orbis` already holds the combined list; adding it to the device records would count each sample twice.
  it('ignores the old combined samples once any device has recorded its own', () => {
    const base = { ...empty(), readingStats: { wpmSamples: [250, 300, 310], lastUpdated: '' } };
    const files = [file('mac', [samplesRecord([300, 310, 320], 'mac', at(6))])];
    expect(rebuildBook(base, files).readingStats?.wpmSamples).toEqual([300, 310, 320]);
    expect(rebuildBook(base, []).readingStats).toEqual(base.readingStats);
  });

  it('keeps the newest 15 samples', () => {
    const many = Array.from({ length: 20 }, (_, i) => i);
    const stats = rebuildBook(empty(), [file('mac', [samplesRecord(many, 'mac', at(1))])]).readingStats;
    expect(stats?.wpmSamples).toEqual(many.slice(-15));
  });
});

describe('clearing a book', () => {
  const cleared = (device: string, minute: number) => file(device, [clearRecord(device, at(minute))]);

  it('drops every mark, note, bookmark and the preset recorded before the clear, on any device', () => {
    const phone = file('phone', [
      put('highlight', 'h1', hl('h1', 1), 'phone', at(1)),
      put('preset', 'preset', preset('p', [['k', '#FFEB3B']]), 'phone', at(1)),
    ]);
    const rebuilt = rebuildBook(empty(), [phone, cleared('mac', 30)]);
    expect(ids(rebuilt)).toEqual([]);
    expect(rebuilt.preset).toBeNull();
  });

  // The phone was offline when the Mac cleared the book, and had marked a passage the Mac never saw.
  it('drops a mark an offline device made before the clear, though the clearing device never saw it', () => {
    const phone = file('phone', [put('highlight', 'offline', hl('offline', 1), 'phone', at(20))]);
    expect(ids(rebuildBook(empty(), [phone, cleared('mac', 30)]))).toEqual([]);
  });

  it('keeps a mark made after the clear, on either device', () => {
    const phone = file('phone', [put('highlight', 'p', hl('p', 1), 'phone', at(40))]);
    const mac = file('mac', [clearRecord('mac', at(30)), put('highlight', 'm', hl('m', 2), 'mac', at(35))]);
    expect(ids(rebuildBook(empty(), [phone, mac]))).toEqual(['p', 'm']);
  });

  // A device may still hold a .orbis from before the clear, with marks no record mentions.
  it('drops what a stale .orbis holds from before the clear', () => {
    const stale = { ...empty(), highlights: [hl('legacy', 1)], preset: preset('p', [['k', '#FFEB3B']]) };
    const rebuilt = rebuildBook(stale, [cleared('mac', 30)]);
    expect(ids(rebuilt)).toEqual([]);
    expect(rebuilt.preset).toBeNull();
  });

  it('stops counting the samples recorded before the clear, on every device, and the old combined list', () => {
    const base = { ...empty(), readingStats: { wpmSamples: [200], lastUpdated: '' } };
    const before = file('phone', [samplesRecord([250], 'phone', at(1))]);
    expect(rebuildBook(base, [before, cleared('mac', 30)]).readingStats).toBeNull();
    const since = file('phone', [samplesRecord([250, 260], 'phone', at(59))]);
    expect(rebuildBook(base, [since, cleared('mac', 30)]).readingStats?.wpmSamples).toEqual([250, 260]);
  });

  // Kept, the own list of a device from before the clear would put the old samples back at its next save.
  it('starts the own samples of a device over after a clear made on another device', () => {
    const phone = file('phone', [samplesRecord([250], 'phone', at(1))]);
    expect(ownSamples([phone, cleared('mac', 30)], 'phone')).toEqual([]);
    expect(ownSamples([phone], 'phone')).toEqual([250]);
  });
});

describe('listChanges', () => {
  let n = 0;
  const next = (): SyncVersion => at(0, ++n);

  it('records what was added, changed and removed, and nothing for what stayed', () => {
    const before = [hl('same', 1), hl('recolored', 2), hl('removed', 3)];
    const after = [hl('same', 1), hl('recolored', 2, { color: '#A5D6A7' }), hl('added', 4)];
    const changes = listChanges('highlight', before, after, 'mac', next);
    expect(changes.map((c) => [c.id, c.deleted])).toEqual([
      ['recolored', false],
      ['added', false],
      ['removed', true],
    ]);
  });

  // Diffed against the disk instead, another device's new mark would read as a deletion made here.
  it('records nothing for an item this device never had, however the file on disk looks', () => {
    expect(listChanges('highlight', [hl('mine', 1)], [hl('mine', 1)], 'mac', next)).toEqual([]);
  });
});

describe('presetChange', () => {
  const v = (): SyncVersion => at(1);

  it('records a changed preset whole, and nothing for an unchanged one', () => {
    const p = preset('p', [['k', '#FFEB3B']]);
    expect(presetChange(p, p, 'mac', v)).toBeNull();
    expect(presetChange(p, { ...p, revision: 2 }, 'mac', v)).toMatchObject({ id: 'preset', deleted: false });
  });

  it('records a removed preset as a deletion', () => {
    expect(presetChange(preset('p', []), null, 'mac', v)).toMatchObject({ id: 'preset', deleted: true });
  });
});

describe('addedSamples', () => {
  it('finds what was appended after the samples already there', () => {
    expect(addedSamples([200, 210], [200, 210, 220])).toEqual([220]);
  });

  it('finds it after the oldest samples dropped off the front', () => {
    expect(addedSamples([1, 2, 3], [2, 3, 4, 5])).toEqual([4, 5]);
  });

  it('counts everything as new when there was nothing before', () => {
    expect(addedSamples([], [300])).toEqual([300]);
  });

  it('finds nothing new when nothing was added', () => {
    expect(addedSamples([1, 2, 3], [1, 2, 3])).toEqual([]);
  });
});

describe('withChanges', () => {
  it('replaces the record each change supersedes, by type and id, and keeps the rest', () => {
    const records = [put('highlight', 'a', hl('a', 1), 'mac', at(1)), put('note', 'a', { id: 'a' }, 'mac', at(1))];
    const out = withChanges(records, [drop('highlight', 'a', 'mac', at(2))]);
    expect(out.map((r) => [r.type, r.id, r.deleted])).toEqual([
      ['highlight', 'a', true],
      ['note', 'a', false],
    ]);
  });
});

// The records a rebuild relies on, and nothing that would throw inside it.
describe('usableRecord', () => {
  const version = { clock: 0, at: '2020-01-01T00:00:00.000Z' };
  const base = { id: 'h1', type: 'highlight', device: 'mac', version, deleted: false };

  it('keeps every record a device writes', () => {
    expect(usableRecord({ ...base, item: { id: 'h1' } })).toBe(true);
    expect(usableRecord({ ...base, deleted: true })).toBe(true);
    expect(usableRecord(clearRecord('mac', version))).toBe(true);
    expect(usableRecord(samplesRecord([1, 2], 'mac', version))).toBe(true);
    expect(usableRecord({ ...base, type: 'preset', item: { id: 'p', name: 'p', marks: [] } })).toBe(true);
    expect(usableRecord({ ...base, type: 'preset', deleted: true })).toBe(true);
  });

  it.each([
    ['null', null],
    ['a number', 5],
    ['no version', { ...base, version: undefined, item: { id: 'h1' } }],
    ['a version without a clock', { ...base, version: { at: version.at }, item: { id: 'h1' } }],
    ['no id', { ...base, id: undefined, item: { id: 'h1' } }],
    ['an item that is not an object', { ...base, item: 'h1' }],
    ['a preset without marks', { ...base, type: 'preset', item: { id: 'p', name: 'p' } }],
  ])('skips a record with %s', (_what, record) => {
    expect(usableRecord(record)).toBe(false);
  });
});
