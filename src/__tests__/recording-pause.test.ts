// Pausing a recording run, and the ways it must be able to end.
//
// A pause is a promise the synth awaits between sentences, so the failure mode to guard against is a run that can
// never continue: paused with nobody to resume it, or stopped while parked and never noticing.
//
// Driven through the real `RecordingGenerator` rather than a copy of its logic — the gate is three interacting
// pieces (the signal, the waiter list, the release) and testing a reimplementation of them would prove nothing.

import { describe, expect, it } from 'vitest';
import type { ChapterSynth } from '../reader/tts/recording';
import { type GenProgress, RecordingGenerator, type RecordingGeneratorHost } from '../reader/tts/recording-generator';

/** A synth that records what the generator wired onto it and never actually synthesizes. */
function stubSynth(): ChapterSynth {
  return {
    concurrency: 1,
    failure: null,
    signal: null,
    waitWhilePaused: null,
    onStuck: null,
    synth: async () => null,
    dispose: () => {},
  };
}

function harness(): { gen: RecordingGenerator; synth: ChapterSynth; progress: GenProgress[] } {
  const synth = stubSynth();
  const progress: GenProgress[] = [];
  const host = {
    app: {} as RecordingGeneratorHost['app'],
    sections: [],
    chapters: [],
    audioDir: 'audio',
    bookBasename: 'book',
    synth,
    engineKind: 'openai-compatible',
    voice: 'af_heart',
    model: 'kokoro',
    bookTitle: 'A Book',
    bookAuthor: '',
    voiceLabel: 'Heart',
    coverData: null,
    trackTotal: 0,
    chapterTitle: () => '',
    log: () => {},
    onProgress: (p: GenProgress) => progress.push(p),
  } satisfies RecordingGeneratorHost;
  return { gen: new RecordingGenerator(host), synth, progress };
}

/** A harness whose one chapter never opens, so a started run stays running with a chapter outstanding. */
function holdingHarness(): { gen: RecordingGenerator; progress: GenProgress[]; synth: ChapterSynth } {
  const progress: GenProgress[] = [];
  const synth = stubSynth();
  const part = {
    index: 0,
    chapterHref: 'section:0',
    hrefs: ['section:0'],
    part: 1,
    partCount: 1,
    sectionIndex: 0,
    anchor: null,
    baseLabel: 'Chapter I',
    label: 'Chapter I',
  };
  const host = {
    app: {} as RecordingGeneratorHost['app'],
    sections: [{ createDocument: () => new Promise<Document>(() => {}) }],
    chapters: [part],
    audioDir: 'audio',
    bookBasename: 'book',
    synth,
    engineKind: 'openai-compatible',
    voice: 'af_heart',
    model: 'kokoro',
    bookTitle: 'A Book',
    bookAuthor: '',
    voiceLabel: 'Heart',
    coverData: null,
    trackTotal: 1,
    chapterTitle: () => 'Chapter I',
    log: () => {},
    onProgress: (p: GenProgress) => progress.push(p),
  } satisfies RecordingGeneratorHost;
  return { gen: new RecordingGenerator(host), progress, synth };
}

/** Rejects if `work` has not settled by the deadline — a parked gate would otherwise hang the suite. */
async function within(ms: number, work: Promise<unknown>): Promise<void> {
  const guard = new Promise<'stuck'>((r) => setTimeout(() => r('stuck'), ms));
  expect(await Promise.race([work.then(() => 'settled' as const), guard])).toBe('settled');
}

describe('RecordingGenerator pause', () => {
  it('does nothing when there is no run to pause', () => {
    const { gen, progress } = harness();
    gen.pause();
    expect(gen.isPaused()).toBe(false);
    expect(progress).toEqual([]);
  });

  it('wires the gate, the signal and the stuck callback onto the synth when a run starts', async () => {
    const { gen, synth } = harness();
    await gen.run([]); // an empty run still sets the synth up on its way through
    expect(synth.signal).toBeTruthy();
    expect(typeof synth.waitWhilePaused).toBe('function');
    expect(typeof synth.onStuck).toBe('function');
  });

  /**
   * The gate, driven the way the app drives it.
   *
   * Through `pause()` / `resume()` on a RUNNING run rather than by poking the signal and the waiter list: those
   * two methods have to release the parked synth themselves, and an earlier version of this test reached for the
   * private release helper — which passed happily when `resume` stopped calling it.
   */
  it('holds the synth while paused and releases it on resume', async () => {
    const held = holdingHarness();
    void held.gen.run([0]);
    await new Promise((r) => setTimeout(r, 10));
    const gate = held.synth.waitWhilePaused as () => Promise<void>;

    // Not paused: the gate is transparent, or every sentence would pay for it.
    await within(50, gate());

    held.gen.pause();
    const parked = gate();
    let released = false;
    void parked.then(() => {
      released = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(released).toBe(false);

    held.gen.resume();
    await within(200, parked);
    held.gen.cancel();
  });

  /** Stop while parked: the pipeline has to get control back to discard the open track and finish the run. */
  it('releases a parked synth when the run is cancelled', async () => {
    const held = holdingHarness();
    void held.gen.run([0]);
    await new Promise((r) => setTimeout(r, 10));
    const gate = held.synth.waitWhilePaused as () => Promise<void>;

    held.gen.pause();
    const parked = gate();
    let released = false;
    void parked.then(() => {
      released = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(released).toBe(false);

    held.gen.cancel();
    await within(200, parked);
  });

  /**
   * A run held mid-chapter, which is the only state a pause can happen in.
   *
   * The chapter never opens — `createDocument` never resolves — so the run stays running and the generator is in
   * exactly the condition a pause has to work in: a chapter open, work outstanding, nothing finished.
   */
  it('reports a pause and a resume, and says when it paused itself', async () => {
    const held = holdingHarness();
    void held.gen.run([0]);
    await new Promise((r) => setTimeout(r, 10)); // let the run reach the chapter

    expect(held.gen.isRunning()).toBe(true);
    held.gen.pause('background');
    expect(held.gen.isPaused()).toBe(true);
    const paused = held.progress.filter((p) => p.phase === 'paused');
    expect(paused).toHaveLength(1);
    expect(paused[0].pausedReason).toBe('background');

    held.gen.resume();
    expect(held.gen.isPaused()).toBe(false);
    const resumed = held.progress.filter((p) => p.phase === 'resumed');
    expect(resumed).toHaveLength(1);
    // A resume must not inherit the reason for the pause it just ended.
    expect(resumed[0].pausedReason).toBeUndefined();
    held.gen.cancel();
  });

  it('pauses once, however many times it is asked', async () => {
    const held = holdingHarness();
    void held.gen.run([0]);
    await new Promise((r) => setTimeout(r, 10));
    held.gen.pause();
    held.gen.pause();
    held.gen.pause('background');
    expect(held.progress.filter((p) => p.phase === 'paused')).toHaveLength(1);
    held.gen.cancel();
  });

  /** A pause carries the run's counters, or the readout would blank mid-chapter and then reappear on resume. */
  it('keeps the run counters on the pause event', async () => {
    const held = holdingHarness();
    void held.gen.run([0]);
    await new Promise((r) => setTimeout(r, 10));
    const start = held.progress.find((p) => p.phase === 'chapter-start');
    held.gen.pause();
    const paused = held.progress.find((p) => p.phase === 'paused');
    expect(paused?.chaptersTotal).toBe(start?.chaptersTotal);
    expect(paused?.chapterIndex).toBe(start?.chapterIndex);
    held.gen.cancel();
  });

  it('never reports a pause phase for a run that is not going', () => {
    const { gen, progress } = harness();
    gen.pause('background');
    gen.resume();
    expect(progress.filter((p) => p.phase === 'paused' || p.phase === 'resumed')).toEqual([]);
  });
});

describe('the pause gate is optional', () => {
  /**
   * A synth used outside a run has no gate, and the server synth calls it unconditionally — `await undefined?.()`
   * is a no-op. Pinned because making the field required would break every caller that builds a synth for a
   * one-off (a voice preview), and the breakage would be a type error far from here.
   */
  it('is a no-op when no run wired one up', async () => {
    const synth = stubSynth();
    expect(synth.waitWhilePaused).toBeNull();
    await within(50, Promise.resolve(synth.waitWhilePaused?.()));
  });
});

/**
 * Three pauses that look identical from outside and must not behave alike.
 *
 * The reader's own stays until they lift it. The app's absence lifts itself the moment the app is back — a detour
 * to copy a log out of the debug panel should not need a tap. One the loss rule made stick stays, because the app
 * being visible again is no evidence that anything can reach the network.
 *
 * The failure to guard against is the middle one leaking into the other two: a pause that lifts itself when the
 * reader asked for it, or when the network is still down, is a run that cannot be stopped by any means but Stop.
 */
describe('the three kinds of pause', () => {
  const start = async (): Promise<ReturnType<typeof holdingHarness>> => {
    const held = holdingHarness();
    void held.gen.run([0]);
    await new Promise((r) => setTimeout(r, 10));
    return held;
  };
  const reasons = (held: { progress: GenProgress[] }): (string | undefined)[] =>
    held.progress.filter((p) => p.phase === 'paused').map((p) => p.pausedReason);

  it('lifts a background wait when the app comes back', async () => {
    const held = await start();
    held.synth.onHidden?.();
    expect(held.gen.isPaused()).toBe(true);
    expect(reasons(held)).toEqual(['background']);

    held.synth.onVisible?.();
    expect(held.gen.isPaused()).toBe(false);
    held.gen.cancel();
  });

  it('does NOT lift the reader’s own pause when the app comes back', async () => {
    const held = await start();
    held.gen.pause();
    expect(reasons(held)).toEqual([undefined]); // no reason: the reader asked

    held.synth.onVisible?.();
    expect(held.gen.isPaused()).toBe(true);
    held.gen.cancel();
  });

  /** The reader pausing during a background wait takes ownership of it — coming back must not undo their choice. */
  it('does NOT lift a wait the reader took over', async () => {
    const held = await start();
    held.synth.onHidden?.();
    held.gen.resume(); // by hand
    held.gen.pause(); // and then paused deliberately
    held.synth.onVisible?.();
    expect(held.gen.isPaused()).toBe(true);
    held.gen.cancel();
  });

  it('does NOT lift a pause the loss rule made stick', async () => {
    const held = await start();
    held.synth.onStuck?.();
    expect(held.gen.isPaused()).toBe(true);
    expect(reasons(held)).toEqual(['unreachable']);

    held.synth.onVisible?.();
    expect(held.gen.isPaused()).toBe(true);
    held.gen.cancel();
  });

  /** A wait that turns out to be unreachable must stop promising it will lift itself. */
  it('promotes a background wait to unreachable when the loss rule trips', async () => {
    const held = await start();
    held.synth.onHidden?.();
    held.synth.onStuck?.();
    expect(reasons(held)).toEqual(['background', 'unreachable']);

    held.synth.onVisible?.();
    expect(held.gen.isPaused()).toBe(true);
    held.gen.cancel();
  });

  it('reports a background wait once, however many concurrency slots notice it', async () => {
    // With `concurrency: 2` every slot watches visibility and calls in — the run is one thing, and says so once.
    const held = await start();
    held.synth.onHidden?.();
    held.synth.onHidden?.();
    held.synth.onHidden?.();
    expect(reasons(held)).toEqual(['background']);
    held.gen.cancel();
  });
});
