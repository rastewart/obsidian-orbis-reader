// The player's live time estimates — words ÷ the narration rate — and the progress bar's keys.
//
// Until these were split out of the listening controller, "~1h 22m left" could only be checked by playing a book on a
// device and reading the screen. NARRATION_WPM is 155, so 155 words is one minute at 1×.

import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildDurationModel,
  formatDuration,
  livePreview,
  liveReadout,
  narrationSeconds,
  sectionPosition,
  wordCount,
} from '../reader/tts/listen-duration';
import { NARRATION_WPM } from '../reader/tts/pacing';
import { SCRUB_STEP_LARGE_SEC, SCRUB_STEP_SEC, scrubMoveFor, wireProgressScrub } from '../reader/tts/progress-scrub';
import { augmentDom } from './dom-augment';

/** A unit of `n` words. */
const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('the duration model', () => {
  it('counts words per unit, cumulatively, and in every later section', () => {
    const m = buildDurationModel([{ text: words(10) }, { text: words(20) }], [999, 30, 100, 50], 1);
    expect(m.unitWords).toEqual([10, 20]);
    expect(m.sectionCumWords).toEqual([0, 10, 30]);
    expect(m.laterSectionWords).toBe(150);
  });

  it('lists each sentence of a chunk, where it starts in the chunk', () => {
    const chunk = { text: 'One two. Three four.', sentences: [{ text: 'One two.' }, { text: 'Three four.' }] };
    const m = buildDurationModel([chunk], [4], 0);
    expect(m.sectionSentences).toEqual([
      { unitIdx: 0, startFraction: 0 },
      { unitIdx: 0, startFraction: 9 / 20 },
    ]);
    expect(m.sentenceCumWordsFlat).toEqual([0, 2, 4]);
  });
});

describe('the live readouts', () => {
  it('assumes 155 words a minute at normal speed', () => {
    expect(NARRATION_WPM).toBe(155);
  });

  // Two tracks in one file: units 0–1 are the first, 2–3 the second. 155 words a unit — a minute each at 1×.
  const model = buildDurationModel(
    [0, 1, 2, 3].map(() => ({ text: words(155) })),
    [620, 1550],
    0
  );
  const secondTrack = { start: 2, end: 4, href: 'one.xhtml#two', partIndex: 1 };

  it('measures the track being read, not the whole file', () => {
    const r = liveReadout(model, secondTrack, { unitIdx: 3, unitFrac: 0.5 }, 1);
    expect(r.trackSec).toBe(120);
    expect(r.elapsedSec).toBe(90);
    expect(r.remainingSec).toBe(30);
    expect(r.fraction).toBe(0.75);
  });

  it('counts the whole rest of the book for time left', () => {
    // From the start of unit 3: one unit of this file, then the 1,550 words after it — 11 minutes.
    const r = liveReadout(model, secondTrack, { unitIdx: 3, unitFrac: 0 }, 1);
    expect(r.bookLeftSec).toBe(660);
  });

  it('halves every time at double speed', () => {
    const r = liveReadout(model, secondTrack, { unitIdx: 3, unitFrac: 0.5 }, 2);
    expect(r.trackSec).toBe(60);
    expect(r.elapsedSec).toBe(45);
  });

  it('previews a drag over the same track the readouts measure', () => {
    expect(livePreview(model.sectionCumWords, secondTrack, 0.25, 1)).toEqual({ elapsedSec: 30, remainingSec: 90 });
  });

  it('gives the OS scrubber the whole file', () => {
    expect(sectionPosition(model, { unitIdx: 1, unitFrac: 0.5 }, 1)).toEqual({ durationSec: 240, positionSec: 90 });
  });

  it('reads nothing at a speed of zero, rather than dividing by it', () => {
    expect(narrationSeconds(155, 0)).toBe(0);
  });
});

describe('formatting', () => {
  it('says hours and minutes, minutes, or seconds', () => {
    expect(formatDuration(4980)).toBe('1h 23m');
    expect(formatDuration(720)).toBe('12m');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(-5)).toBe('0s');
  });

  it('counts words by whitespace', () => {
    expect(wordCount('  one  two\tthree\n')).toBe(3);
    expect(wordCount('   ')).toBe(0);
  });
});

describe('the progress bar from the keyboard', () => {
  beforeAll(() => augmentDom());

  it('skips by seconds on the arrows, further with Shift, and goes to the ends on Home and End', () => {
    expect(scrubMoveFor('ArrowRight', false)).toBe(SCRUB_STEP_SEC);
    expect(scrubMoveFor('ArrowDown', false)).toBe(-SCRUB_STEP_SEC);
    expect(scrubMoveFor('ArrowLeft', true)).toBe(-SCRUB_STEP_LARGE_SEC);
    expect(scrubMoveFor('Home', false)).toBe('start');
    expect(scrubMoveFor('End', false)).toBe('end');
    expect(scrubMoveFor('a', false)).toBeNull();
  });

  it('is a slider a keyboard can reach, and keeps its arrows from turning the page', () => {
    const track = document.createElement('div');
    const nudge = vi.fn();
    wireProgressScrub(track, {
      canScrub: () => true,
      setScrubbing: () => {},
      preview: () => {},
      seek: () => {},
      nudge,
    });
    expect(track.tabIndex).toBe(0);
    expect(track.getAttribute('role')).toBe('slider');
    const key = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true, bubbles: true });
    track.dispatchEvent(key);
    expect(nudge).toHaveBeenCalledWith(SCRUB_STEP_SEC, 'ArrowRight');
    expect(key.defaultPrevented).toBe(true);
  });
});
