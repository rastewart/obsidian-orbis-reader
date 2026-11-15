import { describe, expect, it } from 'vitest';
import { commandFor, type Keystroke, keyNames, matches } from '../reader/hotkey-match';

const stroke = (over: Partial<Keystroke> = {}): Keystroke => ({
  key: 's',
  code: 'KeyS',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
});

describe('naming the key that was pressed', () => {
  it('offers the physical key as well as the character', () => {
    // The bug this exists for: on macOS, Option+S produces `ß`, and the binding was stored as `S`. Matching on
    // the character alone meant a bound key did nothing inside the book.
    expect(keyNames(stroke({ key: 'ß', code: 'KeyS', altKey: true }))).toContain('S');
    expect(keyNames(stroke({ key: '±', code: 'Digit1', altKey: true }))).toContain('1');
  });

  it('keeps named keys as themselves', () => {
    expect(keyNames(stroke({ key: 'ArrowRight', code: 'ArrowRight' }))).toContain('ARROWRIGHT');
  });
});

describe('matching a binding', () => {
  it('resolves Mod to the platform key', () => {
    const hk = { modifiers: ['Mod'], key: 'S' };
    expect(matches(stroke({ metaKey: true }), hk, true)).toBe(true);
    expect(matches(stroke({ ctrlKey: true }), hk, true)).toBe(false);
    expect(matches(stroke({ ctrlKey: true }), hk, false)).toBe(true);
  });

  it('requires exactly the modifiers bound, not merely them', () => {
    // Ctrl+S must not fire on Ctrl+Shift+S, which is a different binding somebody else has.
    const hk = { modifiers: ['Ctrl'], key: 'S' };
    expect(matches(stroke({ ctrlKey: true }), hk, false)).toBe(true);
    expect(matches(stroke({ ctrlKey: true, shiftKey: true }), hk, false)).toBe(false);
  });

  it('matches Alt+S on macOS, where the character is not the key', () => {
    expect(matches(stroke({ key: 'ß', code: 'KeyS', altKey: true }), { modifiers: ['Alt'], key: 'S' }, true)).toBe(
      true
    );
  });

  it('does not match a bare key against a bound chord', () => {
    expect(matches(stroke(), { modifiers: ['Mod'], key: 'S' }, true)).toBe(false);
  });
});

describe('finding the command', () => {
  const defaults = { 'app:go-back': [{ modifiers: ['Mod'], key: 'S' }] };

  it('prefers a custom binding over a default', () => {
    const custom = { 'orbis-reader:orbis-select-sentence': [{ modifiers: ['Mod'], key: 'S' }] };
    expect(commandFor(stroke({ metaKey: true }), defaults, custom, true)).toBe('orbis-reader:orbis-select-sentence');
  });

  it('treats an emptied custom binding as unbound, default and all', () => {
    // Clearing a hotkey in Obsidian's settings leaves the command with an empty list; honoring the default then
    // would resurrect the very binding the reader removed.
    expect(commandFor(stroke({ metaKey: true }), defaults, { 'app:go-back': [] }, true)).toBeUndefined();
  });

  it('answers with nothing when the key is bound to nothing', () => {
    expect(commandFor(stroke({ altKey: true }), defaults, {}, true)).toBeUndefined();
  });
});
