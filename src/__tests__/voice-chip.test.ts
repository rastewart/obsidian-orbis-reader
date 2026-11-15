// What the Listen bar's voice chip says, for every state a book's audio can be in.
//
// The chip answers four questions at once — which voice, recorded or live, which recording/mix is selected, and
// whether this chapter's voice actually came from it — and two of them are decided by the rules below. Both were
// wrong at some point during the week these were written: a renamed recording didn't show its name, and a
// coverage gap showed a name that implied the wrong thing. The six states are asserted here as a table because
// they are a table, and because the two that come apart are the ones a reader notices.

import { beforeAll, describe, expect, it } from 'vitest';
import { ChipSpeeds, chipSourceName, chipSourceText } from '../reader/tts/voice-chip';
import { augmentDom } from './dom-augment';

describe('chipSourceName', () => {
  it('names the mix beside the voice reading this chapter', () => {
    expect(chipSourceName('Heart', 'Mix 1')).toBe('Mix 1');
  });

  it('names a renamed recording', () => {
    expect(chipSourceName('Heart', 'Banana')).toBe('Banana');
  });

  /**
   * The collapse, and the reason renaming a recording earns its place.
   *
   * An unnamed recording IS its voice — `mixSourceEditions` relies on the same fact — so a book with one recording
   * and no name for it has nothing to put in the second half.
   */
  it('says nothing when the selection is just the voice again', () => {
    expect(chipSourceName('Heart', 'Heart')).toBeUndefined();
  });

  it('says nothing when there is no selection', () => {
    expect(chipSourceName('Amy', undefined)).toBeUndefined();
  });

  /** A recording named after a DIFFERENT voice is still a name worth showing — the rule is about repetition on
   *  screen, not about what a name means. */
  it('keeps a name that happens to be another voice', () => {
    expect(chipSourceName('Amy', 'Heart')).toBe('Heart');
  });
});

describe('chipSourceText', () => {
  it('joins the selection with a middot when the voice came from it', () => {
    expect(chipSourceText('Mix 1', true)).toBe('· Mix 1');
  });

  /**
   * **The parentheses are the fourth fact.**
   *
   * A recording selected but not covering this chapter, or always-live standing over a real selection: the voice
   * is the device's own, and `· Mix 1` unparenthesised would attribute it to the mix.
   */
  it('parenthesises a selection that is not what you are hearing', () => {
    expect(chipSourceText('Mix 1', false)).toBe('· (Mix 1)');
  });

  it('paints nothing at all with no selection, whichever way the flag falls', () => {
    expect(chipSourceText(undefined, true)).toBe('');
    expect(chipSourceText(undefined, false)).toBe('');
  });
});

/**
 * The six states end to end, as the design doc tabulates them — `⟨glyph⟩` stands for the mic or the arcs, which
 * `voiceOriginSvg` picks from the same `recorded` flag.
 *
 * Row 4 is the one that makes `fromSelection` more than the inverse of `recorded`: a mix that names a live voice
 * for a chapter is live AND deliberate.
 */
describe('the six chip states', () => {
  const chip = (voice: string, selection: string | undefined, fromSelection: boolean): string =>
    `${voice}${chipSourceText(chipSourceName(voice, selection), fromSelection)}`.trim();

  it('renders each state the way the design doc says', () => {
    // Recorded track, recording renamed.
    expect(chip('Heart', 'Night reads', true)).toBe('Heart· Night reads');
    // Recorded track, recording unnamed — its name is its voice, so the half collapses.
    expect(chip('Heart', 'Heart', true)).toBe('Heart');
    // Mix chapter pointing at a recorded source.
    expect(chip('Heart', 'Mix 1', true)).toBe('Heart· Mix 1');
    // Mix chapter pinned to a live voice: live, but chosen — no parentheses.
    expect(chip('Amy', 'Mix 1', true)).toBe('Amy· Mix 1');
    // Coverage gap, and always-live over a selection: both say the same thing.
    expect(chip('Amy', 'Mix 1', false)).toBe('Amy· (Mix 1)');
    // "None — use the live voice", or a book with no recordings.
    expect(chip('Amy', undefined, false)).toBe('Amy');
  });
});

// The speed moved onto the chip. On the bar it must never cost the names room: the voice and the recording or mix
// are what say which audio this is.
describe('ChipSpeeds', () => {
  beforeAll(() => {
    augmentDom();
  });

  /** A name whose text is `width` wide in a box `room` wide — jsdom lays nothing out, so the widths are given. */
  function name(width: number, room: number): HTMLElement {
    const el = document.createElement('span');
    Object.defineProperty(el, 'scrollWidth', { value: width });
    Object.defineProperty(el, 'clientWidth', { value: room });
    return el;
  }

  it('shows the speed on the bar while the names fit whole', () => {
    const speeds = new ChipSpeeds();
    const speed = document.createElement('span');
    speeds.add(speed, true, [name(60, 60), name(40, 40)]);
    speeds.paint('1.5×');
    expect(speed.isShown()).toBe(true);
    expect(speed.textContent).toBe('1.5×');
  });

  it('hides the bar’s speed when either name would be cut short', () => {
    const speeds = new ChipSpeeds();
    const speed = document.createElement('span');
    speeds.add(speed, true, [name(60, 60), name(90, 40)]);
    speeds.fit();
    expect(speed.isShown()).toBe(false);
  });

  it('ignores a name that is not shown, such as no recording or mix', () => {
    const speeds = new ChipSpeeds();
    const speed = document.createElement('span');
    const source = name(90, 40);
    source.hide();
    speeds.add(speed, true, [name(60, 60), source]);
    speeds.fit();
    expect(speed.isShown()).toBe(true);
  });

  it('always shows the full player’s speed, however tight', () => {
    const speeds = new ChipSpeeds();
    const speed = document.createElement('span');
    speeds.add(speed, false, [name(200, 40)]);
    speeds.fit();
    expect(speed.isShown()).toBe(true);
  });
});
