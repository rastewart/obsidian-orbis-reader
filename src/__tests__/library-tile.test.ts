import { describe, expect, it } from 'vitest';
import type { Capabilities } from '../library/capabilities';
import { primaryActionFor, tileHue } from '../library/tile';

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  readPath: null,
  canListen: false,
  recorded: false,
  hasData: false,
  sourceUrl: '',
  started: false,
  lastOpened: 0,
  ...over,
});

describe('primaryActionFor', () => {
  it('opens the book when there is one', () => {
    expect(primaryActionFor(caps({ readPath: 'books/sample.epub' }))).toBe('read');
  });

  // A catalog often holds titles with no local file — the tap has to lead somewhere for those too.
  it('falls back to where the title lives, then to its note', () => {
    expect(primaryActionFor(caps({ sourceUrl: 'logos4:///books/123' }))).toBe('source');
    expect(primaryActionFor(caps())).toBe('note');
  });

  // A record can have both; the file is the more direct of the two.
  it('prefers the file over the elsewhere-link', () => {
    expect(primaryActionFor(caps({ readPath: 'books/sample.epub', sourceUrl: 'logos4:///books/123' }))).toBe('read');
  });

  // A shelf of recorded audio is there to be listened to — but the preference cannot invent a capability.
  it('honors a widget that asks for listening, and falls through when it cannot', () => {
    expect(primaryActionFor(caps({ readPath: 'books/sample.epub', canListen: true }), 'listen')).toBe('listen');
    expect(primaryActionFor(caps({ sourceUrl: 'logos4:///books/123' }), 'listen')).toBe('source');
    expect(primaryActionFor(caps(), 'listen')).toBe('note');
  });
});

describe('tileHue', () => {
  // The point of deriving it: the same book is the same color on every device and after every repaint.
  it('is stable for a title and in range', () => {
    expect(tileHue('Sample Book')).toBe(tileHue('Sample Book'));
    for (const title of ['', 'A', 'Sample Book; Or, The Subtitle', '1 & 2 Samples']) {
      const hue = tileHue(title);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('separates titles that start alike', () => {
    expect(tileHue('1 & 2 Sample Books')).not.toBe(tileHue('1 & 2 Sample Stories'));
  });
});
