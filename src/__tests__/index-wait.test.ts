import { describe, expect, it } from 'vitest';
import { type IndexProbe, waitForIndex } from '../reader/index-wait';

const OPTS = { graceMs: 1_000, maxMs: 10_000, stepMs: 100 };

/**
 * A pretend index whose state follows a clock the wait's own sleeps advance — `at(ms)` says what it is at that time —
 * so no test waits in real time.
 */
function clocked(at: (ms: number) => { ready: boolean; building: boolean }) {
  let now = 0;
  const probe: IndexProbe = { ready: () => at(now).ready, building: () => at(now).building };
  const sleep = async (ms: number) => {
    now += ms;
  };
  return { probe, sleep, elapsed: () => now };
}

describe('waitForIndex', () => {
  it('does not wait for an index that is ready', async () => {
    const { probe, sleep, elapsed } = clocked(() => ({ ready: true, building: false }));
    expect(await waitForIndex(probe, OPTS, sleep)).toBe(true);
    expect(elapsed()).toBe(0);
  });

  it('waits for a build longer than the grace, as long as it is building', async () => {
    const { probe, sleep, elapsed } = clocked((ms) => ({ ready: ms >= 7_000, building: ms < 7_000 }));
    expect(await waitForIndex(probe, OPTS, sleep)).toBe(true);
    expect(elapsed()).toBe(7_000);
  });

  it('waits for a build that starts within the grace', async () => {
    const { probe, sleep } = clocked((ms) => ({ ready: ms >= 3_000, building: ms >= 600 && ms < 3_000 }));
    expect(await waitForIndex(probe, OPTS, sleep)).toBe(true);
  });

  it('goes ahead after the grace when nothing is building', async () => {
    const { probe, sleep, elapsed } = clocked(() => ({ ready: false, building: false }));
    expect(await waitForIndex(probe, OPTS, sleep)).toBe(false);
    expect(elapsed()).toBe(1_000);
  });

  it('goes ahead after the grace when a build stops without finishing', async () => {
    const { probe, sleep, elapsed } = clocked((ms) => ({ ready: false, building: ms < 4_000 }));
    expect(await waitForIndex(probe, OPTS, sleep)).toBe(false);
    // Stopped at 4 s, seen as stopped from the step that ends there, so the grace is over a step before 5 s.
    expect(elapsed()).toBe(4_900);
  });

  it('gives up on a build that never ends', async () => {
    const { probe, sleep, elapsed } = clocked(() => ({ ready: false, building: true }));
    expect(await waitForIndex(probe, OPTS, sleep)).toBe(false);
    expect(elapsed()).toBe(10_000);
  });
});
