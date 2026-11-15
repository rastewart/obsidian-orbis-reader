import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavSuppressor } from '../reader/NavSuppressor';

describe('NavSuppressor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts not suppressing', () => {
    expect(new NavSuppressor().isSuppressing).toBe(false);
  });

  it('beginTargetNav suppresses and records a target consumed once', () => {
    const s = new NavSuppressor();
    s.beginTargetNav('cfi-A');
    expect(s.isSuppressing).toBe(true);
    expect(s.takePendingTarget()).toEqual({ cfiRange: 'cfi-A' });
    expect(s.takePendingTarget()).toBeNull(); // consumed
  });

  it('beginTargetNav stays suppressed until explicitly cleared (no auto-timer)', () => {
    const s = new NavSuppressor();
    s.beginTargetNav('cfi-A');
    vi.runAllTimers();
    expect(s.isSuppressing).toBe(true);
  });

  it('suppressThenClearSoon clears on the next macrotask', () => {
    const s = new NavSuppressor();
    s.suppressThenClearSoon();
    expect(s.isSuppressing).toBe(true);
    vi.runAllTimers();
    expect(s.isSuppressing).toBe(false);
  });

  it('beginTargetNav cancels a pending auto-clear so the new nav is not cut short', () => {
    const s = new NavSuppressor();
    s.suppressThenClearSoon(); // schedules a clear
    s.beginTargetNav('cfi-B'); // should cancel that clear
    vi.runAllTimers();
    expect(s.isSuppressing).toBe(true);
    expect(s.takePendingTarget()).toEqual({ cfiRange: 'cfi-B' });
  });

  it('scheduleClear clears on the next macrotask and runs the callback after clearing', () => {
    const s = new NavSuppressor();
    s.beginTargetNav('cfi-A');
    let seen: boolean | null = null;
    s.scheduleClear(() => {
      seen = s.isSuppressing;
    });
    expect(s.isSuppressing).toBe(true); // still suppressed until the macrotask
    vi.runAllTimers();
    expect(s.isSuppressing).toBe(false);
    expect(seen).toBe(false); // callback observed the cleared state
  });

  it('markPostNav / takePostNav is a one-shot flag', () => {
    const s = new NavSuppressor();
    expect(s.takePostNav()).toBe(false);
    s.markPostNav();
    expect(s.takePostNav()).toBe(true);
    expect(s.takePostNav()).toBe(false);
  });

  it('reset clears suppression and target but leaves postNav for the pending relocate', () => {
    const s = new NavSuppressor();
    s.beginTargetNav('cfi-A');
    s.markPostNav();
    s.reset();
    expect(s.isSuppressing).toBe(false);
    expect(s.takePendingTarget()).toBeNull();
    expect(s.takePostNav()).toBe(true); // reset does not touch the post-nav flag
  });

  it('reset cancels a pending auto-clear timer', () => {
    const s = new NavSuppressor();
    s.suppressThenClearSoon();
    s.reset();
    // no dangling timer should flip state later
    vi.runAllTimers();
    expect(s.isSuppressing).toBe(false);
  });

  it('dispose clears everything including the post-nav flag', () => {
    const s = new NavSuppressor();
    s.beginTargetNav('cfi-A');
    s.markPostNav();
    s.dispose();
    expect(s.isSuppressing).toBe(false);
    expect(s.takePendingTarget()).toBeNull();
    expect(s.takePostNav()).toBe(false);
  });
});
