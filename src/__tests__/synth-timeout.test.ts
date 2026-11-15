// A recording run that hangs forever, and the two rules that stop it.
//
// Written from a log: recording on Android reached 6% and stopped, with no error, no notice and nothing further
// written. The last line was a `→ POST` with no matching `←`. `requestUrl` takes no timeout and cannot be aborted,
// so the pipeline was awaiting a promise nothing would ever settle.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  isCompleteChapter,
  type RecordingChapter,
  serverStatusOutcome,
  synthTimeoutMs,
  whenAppVisible,
} from '../reader/tts/recording';
import { withTimeout } from '../reader/tts/request-timeout';

/** A promise that never settles — the request that caused this. */
const forever = () => new Promise<string>(() => {});
const settleAfter = (ms: number, value: string) =>
  new Promise<string>((resolve) => setTimeout(() => resolve(value), ms));

describe('withTimeout', () => {
  it('gives up on work that never settles', async () => {
    expect(await withTimeout(forever(), 10)).toBeNull();
  });

  it('passes a value through when the work wins', async () => {
    expect(await withTimeout(settleAfter(1, 'wav'), 200)).toBe('wav');
  });

  it('passes a falsy value through — null means TIMED OUT, and only that', async () => {
    // `0` and `''` are legitimate results; the caller distinguishes a timeout by identity, so they must not read
    // as one. Guards the shape of the contract rather than any current caller.
    expect(await withTimeout(Promise.resolve(0), 200)).toBe(0);
    expect(await withTimeout(Promise.resolve(''), 200)).toBe('');
  });

  it('still reports a failure the work rejects with', async () => {
    // A refused connection or a bad certificate must reach the caller's catch, not be swallowed into a timeout.
    await expect(withTimeout(Promise.reject(new Error('ECONNREFUSED')), 200)).rejects.toThrow('ECONNREFUSED');
  });

  it('does not leave a timer running after the work wins', async () => {
    // The timer is cleared in a `finally`, so a run of hundreds of sentences does not accumulate one pending
    // 120-second callback per sentence. A leaked timer would keep the process awake here.
    const before = await withTimeout(settleAfter(1, 'a'), 60_000);
    expect(before).toBe('a');
  });
});

describe('serverStatusOutcome', () => {
  it('does not ask twice about a request the server rejected', () => {
    // A voice or model this server does not have: the same bytes get the same answer, and retrying only doubles
    // the wait before the reader is told which.
    expect(serverStatusOutcome(400)).toEqual({ failure: 'voice-rejected', retry: false });
    expect(serverStatusOutcome(404)).toEqual({ failure: 'voice-rejected', retry: false });
    expect(serverStatusOutcome(422)).toEqual({ failure: 'voice-rejected', retry: false });
  });

  it('names permission separately — it needs a different thing done about it', () => {
    expect(serverStatusOutcome(401)).toEqual({ failure: 'unauthorized', retry: false });
    expect(serverStatusOutcome(403)).toEqual({ failure: 'unauthorized', retry: false });
  });

  it('asks again when the trouble is the server’s own', () => {
    expect(serverStatusOutcome(500)).toEqual({ failure: 'server-error', retry: true });
    expect(serverStatusOutcome(502)).toEqual({ failure: 'server-error', retry: true });
    expect(serverStatusOutcome(503)).toEqual({ failure: 'server-error', retry: true });
  });
});

describe('isCompleteChapter', () => {
  const entry = (over: Partial<RecordingChapter> = {}): RecordingChapter => ({
    index: 3,
    audioFile: 'ch0003.mp3',
    duration: 1800,
    segments: [{ cfi: '', start: 0, dur: 2, text: 'A sentence.' }],
    complete: true,
    ...over,
  });

  it('accepts a track that says it finished', () => {
    expect(isCompleteChapter(entry())).toBe(true);
  });

  /**
   * The half-recording guard. A file on disk is not evidence that its run finished — the audio and the manifest
   * entry are two writes, and a crash between them leaves a track that stops part-way with nothing saying so.
   */
  it('refuses a track with no completion flag', () => {
    expect(isCompleteChapter(entry({ complete: undefined }))).toBe(false);
    expect(isCompleteChapter(entry({ complete: false }))).toBe(false);
  });

  it('refuses a track with no segments — there is nothing to sync or play', () => {
    expect(isCompleteChapter(entry({ segments: [] }))).toBe(false);
  });

  it('refuses a missing entry, so a caller can hand it a lookup result directly', () => {
    expect(isCompleteChapter(undefined)).toBe(false);
    expect(isCompleteChapter(null)).toBe(false);
  });
});

/**
 * The app-switch gate.
 *
 * Android suspends the WebView: in-flight requests die and nothing can reach the network. Switching away to copy
 * a log out of the debug panel and coming back spent every retry on one sentence, and — under the rule that a
 * missing sentence fails the whole track — threw away a four-track run for a fifteen-second detour.
 *
 * The risk in the fix is the opposite failure: a run parked here forever. These cover the ways out.
 */
describe('whenAppVisible', () => {
  // Obsidian's global for the focused window's document, whose visibility is the app's.
  beforeAll(() => {
    (globalThis as { activeDocument?: Document }).activeDocument = document;
  });
  const setVisibility = (state: 'visible' | 'hidden'): void => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  };
  afterEach(() => setVisibility('visible'));

  /** Rejects if `whenAppVisible` has not resolved by the time the guard fires. */
  const within = async (ms: number, work: Promise<void>): Promise<'resolved'> => {
    const guard = new Promise<'stuck'>((r) => setTimeout(() => r('stuck'), ms));
    expect(await Promise.race([work.then(() => 'resolved' as const), guard])).toBe('resolved');
    return 'resolved';
  };

  it('does not wait at all when the app is in the foreground', async () => {
    setVisibility('visible');
    await within(50, whenAppVisible());
  });

  it('waits while the app is hidden, and carries on when it comes back', async () => {
    setVisibility('hidden');
    const waiting = whenAppVisible();
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    // Still parked: nothing has brought the app back yet.
    await new Promise((r) => setTimeout(r, 30));
    expect(settled).toBe(false);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await within(200, waiting);
  });

  /** Stop has to reach a run parked here, or the only way out is to quit Obsidian. */
  it('gives up waiting when the run is cancelled, even while still hidden', async () => {
    setVisibility('hidden');
    const signal = { cancelled: false };
    const waiting = whenAppVisible(signal);
    signal.cancelled = true;
    document.dispatchEvent(new Event('visibilitychange')); // the poll would also catch it, a second later
    await within(200, waiting);
  });

  it('returns immediately for a run that was already cancelled', async () => {
    setVisibility('hidden');
    await within(50, whenAppVisible({ cancelled: true }));
  });
});

/**
 * Calibrated against a 174-sentence chapter on a 4th-gen i7, CPU-only, Kokoro af_heart:
 * `req avg 3701ms min 518ms max 17863ms`, the max being the chapter's longest sentence at 637 characters.
 * Synthesis ran 28–35 ms/char with a ~600ms floor.
 */
describe('synthTimeoutMs', () => {
  it('gives a short sentence a floor rather than a proportional pittance', () => {
    // 8 chars × 100ms would be 0.8s — less than the observed ~600ms floor plus any jitter.
    expect(synthTimeoutMs(8)).toBe(30_800);
    expect(synthTimeoutMs(0)).toBe(30_000);
  });

  it('leaves real headroom over measured synthesis time', () => {
    // The worst measured sentence: 637 chars in 17.9s.
    expect(synthTimeoutMs(637)).toBeGreaterThan(17_863 * 3);
    // The one that stalled on Android was 185 chars — recovered in 48s rather than 120s.
    expect(synthTimeoutMs(185)).toBe(48_500);
  });

  it('caps, so one enormous sentence cannot park a run for the afternoon', () => {
    expect(synthTimeoutMs(5_000)).toBe(180_000);
    expect(synthTimeoutMs(100_000)).toBe(180_000);
  });

  it('never returns less than the floor, whatever it is handed', () => {
    // A caller passing a bad length must not produce a timeout that fails everything instantly.
    expect(synthTimeoutMs(-50)).toBe(30_000);
    expect(synthTimeoutMs(Number.NaN)).toBeGreaterThanOrEqual(30_000);
  });

  it('rises with length, so the room goes where the work is', () => {
    const lengths = [10, 100, 300, 637, 1200];
    const times = lengths.map(synthTimeoutMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
