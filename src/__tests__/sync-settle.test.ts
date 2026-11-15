// "The default" is a role: one per vault, for note styles and for annotation presets alike.
//
// Each device keeps its own list to one, so each list is fine on its own — and merging two of them produces two
// claimants, which is not untidiness. `find((i) => i.isDefault)` then answers by array order, and two devices can
// order their merges differently, so they would silently disagree about which style notes are generated with, or
// which preset a book gets without being assigned one. Two devices that each edit their own seeded default note
// style produce exactly this.

import { describe, expect, it } from 'vitest';
import type { AnnotationPreset } from '../annotation-presets';
import { settleDefault } from '../sync/settle';
import type { VersionMap } from '../sync/stamp';

const versions = (at: Record<string, [string, string]>): VersionMap =>
  Object.fromEntries(Object.entries(at).map(([id, [when, device]]) => [id, { clock: 0, at: when, device, hash: 'x' }]));

const T1 = '2026-08-27T10:00:00.000Z';
const T2 = '2026-08-27T10:05:00.000Z';

/** The shape is all this needs — it is generic over `{ id, isDefault }` on purpose. */
const item = (id: string, isDefault = true) => ({ id, isDefault });

describe('settleDefault', () => {
  it('leaves a list with one default alone', () => {
    const items = [item('a'), item('b', false)];
    expect(settleDefault(items, versions({ a: [T1, 'mac'] }))).toEqual(items);
  });

  it('keeps the flag on the later of two claimants', () => {
    const kept = settleDefault([item('a'), item('b')], versions({ a: [T1, 'mac'], b: [T2, 'phone'] }));
    expect(kept.map((i) => [i.id, i.isDefault])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('reaches the same answer whichever order the two arrived in', () => {
    const v = versions({ a: [T1, 'mac'], b: [T2, 'phone'] });
    expect(settleDefault([item('a'), item('b')], v).find((i) => i.isDefault)?.id).toBe('b');
    expect(settleDefault([item('b'), item('a')], v).find((i) => i.isDefault)?.id).toBe('b');
  });

  it('breaks a dead heat the same way on both devices', () => {
    const v = versions({ a: [T1, 'aaa'], b: [T1, 'bbb'] });
    expect(settleDefault([item('a'), item('b')], v).find((i) => i.isDefault)?.id).toBe('b');
    expect(settleDefault([item('b'), item('a')], v).find((i) => i.isDefault)?.id).toBe('b');
  });

  it('prefers an item with no version — the one just made here', () => {
    const kept = settleDefault([item('fresh'), item('old')], versions({ old: [T2, 'phone'] }));
    expect(kept.find((i) => i.isDefault)?.id).toBe('fresh');
  });

  it('settles three claimants to one', () => {
    const v = versions({ a: [T1, 'mac'], b: [T2, 'phone'], c: [T1, 'pad'] });
    const kept = settleDefault([item('a'), item('b'), item('c')], v);
    expect(kept.filter((i) => i.isDefault).map((i) => i.id)).toEqual(['b']);
  });

  it('does not edit the list it was given, which is the live library', () => {
    const items = [item('a'), item('b')];
    settleDefault(items, versions({ a: [T1, 'mac'], b: [T2, 'phone'] }));
    expect(items.every((i) => i.isDefault)).toBe(true);
  });

  /**
   * The second type it serves. A preset carries more than the role, and settling must not disturb any of it —
   * `marks` in particular, since the whole library would otherwise be rewritten on a scan that changed nothing.
   */
  describe('over annotation presets', () => {
    const preset = (id: string, isDefault: boolean): AnnotationPreset => ({
      id,
      name: id,
      isDefault,
      createdAt: 1,
      revision: 3,
      marks: [{ id: `mk_${id}`, name: 'Yellow', highlightColor: '#FFEB3B', enabled: true }],
    });

    it('clears the loser and touches nothing else about it', () => {
      const kept = settleDefault(
        [preset('a', true), preset('b', true)],
        versions({ a: [T1, 'mac'], b: [T2, 'phone'] })
      );
      expect(kept.map((p) => p.isDefault)).toEqual([false, true]);
      expect(kept[0].marks).toEqual(preset('a', true).marks);
      expect(kept[0].revision).toBe(3);
    });

    it('returns the same objects when there is nothing to settle', () => {
      // Which is what keeps a quiet scan quiet: `stampType` compares payloads, so a rebuilt-but-identical preset
      // would hash the same — but returning the originals makes it obvious nothing moved.
      const items = [preset('a', true), preset('b', false)];
      const kept = settleDefault(items, versions({ a: [T1, 'mac'] }));
      expect(kept[0]).toBe(items[0]);
      expect(kept[1]).toBe(items[1]);
    });

    /**
     * **The built-in seeds as the default and has to be settled like anything else**, which is why it publishes
     * rather than being held back as "a copy every vault already has".
     *
     * Held back, it would carry no version — and "no version" means "made here just now", which is right for a
     * preset the reader has this second created and exactly wrong for scaffolding every device seeds on first
     * run. It would beat the reader's real default on any device that happened to seed it later, and the two
     * devices would then disagree about which preset a book gets without being assigned one.
     */
    it('lets a real default beat the seeded built-in', () => {
      const kept = settleDefault(
        [{ ...preset('ap_builtin', true) }, preset('fiction', true)],
        versions({ ap_builtin: [T1, 'phone'], fiction: [T2, 'mac'] })
      );
      expect(kept.find((p) => p.isDefault)?.id).toBe('fiction');
    });

    it('leaves the built-in as the default when nothing else claims it', () => {
      const items = [preset('ap_builtin', true), preset('fiction', false)];
      expect(settleDefault(items, versions({ ap_builtin: [T1, 'phone'] }))).toEqual(items);
    });
  });
});
