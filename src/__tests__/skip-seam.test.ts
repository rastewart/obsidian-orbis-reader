import { describe, expect, it } from 'vitest';
import { seamOffsetSec, skipLanding } from '../reader/tts/recorded-audio';

/** "CHAPTER III 2 of 4" — a 30-minute slice out of a divided chapter. */
const TRACK = 1800;

describe('skipLanding', () => {
  it('stays inside the track for an ordinary skip', () => {
    expect(skipLanding(600, -15, TRACK)).toEqual({ kind: 'within', seconds: 585 });
    expect(skipLanding(600, 15, TRACK)).toEqual({ kind: 'within', seconds: 615 });
  });

  /**
   * At the top of a mid-chapter track, clamping to segment 0 would make ⟲15 do nothing at all, because that is as
   * far back as the current MP3 goes. The seam is crossed instead, carrying the leftover seconds.
   */
  it('crosses backward off the start of a track, carrying the remainder', () => {
    expect(skipLanding(0, -15, TRACK)).toEqual({ kind: 'cross', dir: -1, overshootSec: 15 });
    // Five seconds in, fifteen back is ten seconds before this track began.
    expect(skipLanding(5, -15, TRACK)).toEqual({ kind: 'cross', dir: -1, overshootSec: 10 });
  });

  it('crosses forward off the end of a track, carrying the remainder', () => {
    expect(skipLanding(TRACK, 15, TRACK)).toEqual({ kind: 'cross', dir: 1, overshootSec: 15 });
    expect(skipLanding(TRACK - 5, 15, TRACK)).toEqual({ kind: 'cross', dir: 1, overshootSec: 10 });
  });

  it('treats the exact edges as inside — a skip landing on 0:00 or the final second has not run off', () => {
    expect(skipLanding(15, -15, TRACK)).toEqual({ kind: 'within', seconds: 0 });
    expect(skipLanding(TRACK - 15, 15, TRACK)).toEqual({ kind: 'within', seconds: TRACK });
  });

  it('never crosses on an unknown duration — audio metadata that has not arrived yet', () => {
    expect(skipLanding(600, 15, 0)).toEqual({ kind: 'within', seconds: 615 });
    expect(skipLanding(600, 15, Number.NaN)).toEqual({ kind: 'within', seconds: 615 });
    // Backward past the start with no known end is still a clamp, not a crossing.
    expect(skipLanding(5, -15, 0)).toEqual({ kind: 'within', seconds: 0 });
  });
});

describe('seamOffsetSec', () => {
  it('measures a backward crossing from the destination end', () => {
    expect(seamOffsetSec({ dir: -1, overshootSec: 10 }, 1200)).toBe(1190);
  });

  it('measures a forward crossing from the destination start', () => {
    expect(seamOffsetSec({ dir: 1, overshootSec: 10 }, 1200)).toBe(10);
  });

  /** One press must not run off a second seam: a destination shorter than the overshoot clamps to its edge. */
  it('clamps to a destination shorter than the overshoot', () => {
    expect(seamOffsetSec({ dir: -1, overshootSec: 30 }, 12)).toBe(0);
    expect(seamOffsetSec({ dir: 1, overshootSec: 30 }, 12)).toBe(12);
  });

  it('survives a destination of unknown length', () => {
    expect(seamOffsetSec({ dir: -1, overshootSec: 10 }, 0)).toBe(0);
    expect(seamOffsetSec({ dir: 1, overshootSec: 10 }, 0)).toBe(0);
  });
});

/** The round trip the buttons actually make: 15 seconds back from 5s into track 2 is 10s before track 1's end. */
describe('a 15-second skip across a seam', () => {
  it('lands fifteen seconds earlier in wall-clock terms', () => {
    const prevDuration = 1200;
    const landing = skipLanding(5, -15, TRACK);
    expect(landing.kind).toBe('cross');
    if (landing.kind !== 'cross') return;
    const at = seamOffsetSec(landing, prevDuration);
    // 10s before the end of the previous track = 5s (where we were) + 10s (into the previous) back = 15s.
    expect(prevDuration - at + 5).toBe(15);
  });
});
