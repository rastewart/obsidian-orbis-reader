// One entry per word, decided by version rather than by array order.
//
// The case these are written for: the same word added on two devices while one is offline. They are different items —
// each minted its own id — so the merge correctly keeps both, and this is what turns "both" back into "one".

import { describe, expect, it } from 'vitest';
import { dedupeByWord, type GlossaryItem, legacyPronunciationId } from '../sync/glossary';
import type { VersionMap } from '../sync/stamp';

const entry = (id: string, word: string, say = 'said'): GlossaryItem => ({ id, word, say, enabled: true });

const versions = (at: Record<string, [string, string]>): VersionMap =>
  Object.fromEntries(Object.entries(at).map(([id, [when, device]]) => [id, { clock: 0, at: when, device, hash: 'x' }]));

const T1 = '2026-08-26T10:00:00.000Z';
const T2 = '2026-08-26T10:05:00.000Z';

describe('dedupeByWord', () => {
  it('leaves a glossary with no repeats alone', () => {
    const entries = [entry('a', 'Vantry'), entry('b', 'Oakhallow')];
    const result = dedupeByWord(entries, versions({ a: [T1, 'mac'], b: [T1, 'mac'] }));
    expect(result.entries).toEqual(entries);
    expect(result.dropped).toEqual([]);
  });

  it('keeps the later entry when two devices added the same word', () => {
    // The phone was offline and added it first; the Mac added it afterwards.
    const phone = entry('pron-phone', 'Vantry', 'VAN tree');
    const mac = entry('pron-mac', 'Vantry', 'van TRY');
    const result = dedupeByWord([phone, mac], versions({ 'pron-phone': [T1, 'phone'], 'pron-mac': [T2, 'mac'] }));
    expect(result.entries).toEqual([mac]);
    expect(result.dropped).toEqual(['pron-phone']);
  });

  it('reaches the same answer whichever order the entries arrived in', () => {
    // Which is the point: the two devices append adopted items in whatever order their scan found them.
    const phone = entry('pron-phone', 'Vantry');
    const mac = entry('pron-mac', 'Vantry');
    const v = versions({ 'pron-phone': [T1, 'phone'], 'pron-mac': [T2, 'mac'] });
    expect(dedupeByWord([phone, mac], v).entries.map((e) => e.id)).toEqual(['pron-mac']);
    expect(dedupeByWord([mac, phone], v).entries.map((e) => e.id)).toEqual(['pron-mac']);
  });

  it('matches words the way the editor does — trimmed and case-insensitive', () => {
    const a = entry('a', 'Vantry');
    const b = entry('b', ' vantry ');
    const result = dedupeByWord([a, b], versions({ a: [T1, 'mac'], b: [T2, 'phone'] }));
    expect(result.entries.map((e) => e.id)).toEqual(['b']);
  });

  it('breaks a dead heat the same way on both devices', () => {
    // Same instant, same counter: the device id decides, and both devices compute the same winner.
    const a = entry('a', 'Vantry');
    const b = entry('b', 'Vantry');
    const v = versions({ a: [T1, 'aaa'], b: [T1, 'bbb'] });
    expect(dedupeByWord([a, b], v).entries.map((e) => e.id)).toEqual(['b']);
    expect(dedupeByWord([b, a], v).entries.map((e) => e.id)).toEqual(['b']);
  });

  it('prefers an entry with no version — the one just typed here', () => {
    const typed = entry('fresh', 'Vantry');
    const arrived = entry('old', 'Vantry');
    const result = dedupeByWord([arrived, typed], versions({ old: [T2, 'phone'] }));
    expect(result.entries.map((e) => e.id)).toEqual(['fresh']);
    expect(result.dropped).toEqual(['old']);
  });

  it('handles three copies of one word, keeping exactly one', () => {
    const v = versions({ a: [T1, 'mac'], b: [T2, 'phone'], c: [T1, 'pad'] });
    const result = dedupeByWord([entry('a', 'x'), entry('b', 'x'), entry('c', 'x')], v);
    expect(result.entries.map((e) => e.id)).toEqual(['b']);
    expect(result.dropped.sort()).toEqual(['a', 'c']);
  });
});

/**
 * The migration. If each device minted its own id for one word, the merge would have to churn through adoptions and
 * tombstones to put a glossary nobody had touched back to one entry per word. Every device has to reach the same id
 * without talking to the others, and the word is the only thing they all have.
 */
describe('legacyPronunciationId', () => {
  it('gives the same id on every device, because it depends only on the word', () => {
    expect(legacyPronunciationId('Oakhallow')).toBe(legacyPronunciationId('Oakhallow'));
  });

  it('ignores case and surrounding space, as the uniqueness rule does', () => {
    expect(legacyPronunciationId(' oakhallow ')).toBe(legacyPronunciationId('Oakhallow'));
  });

  it('gives different words different ids', () => {
    const ids = new Set(['Chicken', 'Rooster', 'AWS', 'Banana', 'Apple'].map(legacyPronunciationId));
    expect(ids.size).toBe(5);
  });

  it('is long enough that two words colliding is not worth thinking about', () => {
    // 64 bits of hash, so a few hundred words carry no meaningful chance of two sharing an id — and a collision
    // would mean two words treated as one entry, which is a respelling silently lost.
    expect(legacyPronunciationId('x')).toMatch(/^pron-[0-9a-f]{16}$/);
  });
});
