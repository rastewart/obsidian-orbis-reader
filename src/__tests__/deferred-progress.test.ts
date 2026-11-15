import type { App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The dialog that appears only if the work outlasts it being worth showing one.
 *
 * **Tested with fake timers because the threshold is the whole feature**, and because the case that matters is
 * the one nobody can produce on demand: a conversion that finishes at 399ms must show nothing, and the same
 * conversion at 401ms must show something. A 1.26 MB note converted on a Mac and on an Android phone never brought
 * up the dialog, which is the right behavior and indistinguishable from the dialog being broken — so the
 * distinguishing is done here.
 *
 * `openOrbisDialog` is mocked rather than rendered: what is being checked is when it is called and whether it is
 * closed, which is the logic. What the dialog looks like is a question for a screen.
 */
const opened: { closed: boolean }[] = [];
vi.mock('../OrbisModal', () => ({
  openOrbisDialog: (
    _app: unknown,
    _opts: unknown,
    build: (body: { createEl: () => void }, close: () => void) => void
  ) => {
    const entry = { closed: false };
    opened.push(entry);
    build({ createEl: () => {} }, () => {
      entry.closed = true;
    });
  },
}));

const { withDeferredProgress } = await import('../deferred-progress');

const app = {} as App;

beforeEach(() => {
  opened.length = 0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

/** Work that settles only when the test says so, so the clock and the work move independently. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const opts = { title: 'Making the book', message: 'Converting…' };

describe('withDeferredProgress', () => {
  it('shows nothing when the work beats the threshold', async () => {
    const work = deferred<string>();
    const run = withDeferredProgress(app, opts, () => work.promise);
    await vi.advanceTimersByTimeAsync(399);
    work.resolve('done');
    await expect(run).resolves.toBe('done');
    await vi.advanceTimersByTimeAsync(100); // the timer's callback is queued; it must still decline to open
    expect(opened).toHaveLength(0);
  });

  it('shows the dialog when the work outlasts it, and closes it after', async () => {
    const work = deferred<string>();
    const run = withDeferredProgress(app, opts, () => work.promise);
    await vi.advanceTimersByTimeAsync(400);
    expect(opened).toHaveLength(1);
    expect(opened[0].closed).toBe(false);
    work.resolve('done');
    await expect(run).resolves.toBe('done');
    expect(opened[0].closed).toBe(true);
  });

  /**
   * **The race the flash is made of.** `clearTimeout` cannot un-fire a callback that is already queued, so work
   * finishing in the same tick the timer fires would open a dialog and close it immediately — which is exactly
   * the 200ms glitch the threshold exists to prevent. The guard is a flag the callback re-reads.
   */
  it('does not open a dialog for work that finished as the timer fired', async () => {
    const work = deferred<string>();
    const run = withDeferredProgress(app, opts, () => work.promise);
    work.resolve('done');
    await run;
    await vi.advanceTimersByTimeAsync(1000);
    expect(opened).toHaveLength(0);
  });

  /** A progress dialog outliving its job is the one failure here a reader cannot get out of. */
  it('closes the dialog when the work throws', async () => {
    const work = deferred<string>();
    const run = withDeferredProgress(app, opts, () => work.promise);
    await vi.advanceTimersByTimeAsync(400);
    work.reject(new Error('no'));
    await expect(run).rejects.toThrow('no');
    expect(opened[0].closed).toBe(true);
  });

  it('honours a caller that wants a different threshold', async () => {
    const work = deferred<string>();
    const run = withDeferredProgress(app, { ...opts, delayMs: 50 }, () => work.promise);
    await vi.advanceTimersByTimeAsync(50);
    expect(opened).toHaveLength(1);
    work.resolve('done');
    await run;
  });
});
