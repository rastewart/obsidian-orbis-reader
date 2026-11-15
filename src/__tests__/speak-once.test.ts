import { describe, expect, it } from 'vitest';
import {
  asCompleteUtterance,
  clampSpeechText,
  prepareSpeechText,
  SPEAK_ONCE_MAX_CHARS,
} from '../reader/tts/speak-once';

describe('clampSpeechText', () => {
  it('leaves a short string alone', () => {
    expect(clampSpeechText('Tester')).toBe('Tester');
  });

  it('collapses whitespace runs and trims', () => {
    expect(clampSpeechText('  the   quick\n  brown fox  ')).toBe('the quick brown fox');
  });

  it('returns empty for whitespace-only input', () => {
    expect(clampSpeechText('   \n\t ')).toBe('');
  });

  it('does not exceed the cap', () => {
    const long = 'word '.repeat(1000);
    expect(clampSpeechText(long).length).toBeLessThanOrEqual(SPEAK_ONCE_MAX_CHARS);
  });

  it('breaks at a word boundary rather than mid-word', () => {
    const long = 'alpha '.repeat(1000);
    const out = clampSpeechText(long);
    // Every retained token is the whole word, never a fragment of it.
    for (const tok of out.split(' ')) expect(tok).toBe('alpha');
  });

  it('honours a custom cap', () => {
    expect(clampSpeechText('one two three four five', 12)).toBe('one two');
  });

  it('hard-cuts a single unbroken token that exceeds the cap', () => {
    // No space to break at, so the only options are truncate or refuse; truncate.
    const out = clampSpeechText('x'.repeat(50), 10);
    expect(out).toBe('x'.repeat(10));
  });

  it('prefers a short correct fragment over a mangled token', () => {
    // Breaking at the only space keeps very little, but a truncated 40-char token would be read
    // as gibberish — correct-but-short wins.
    expect(clampSpeechText(`ab ${'c'.repeat(40)}`, 20)).toBe('ab');
  });

  it('is idempotent', () => {
    const once = clampSpeechText('  hello   world  ');
    expect(clampSpeechText(once)).toBe(once);
  });
});

describe('asCompleteUtterance', () => {
  it('adds a full stop to a bare word', () => {
    // The Libritts truncation case: a one-word selection must reach Piper sentence-shaped.
    expect(asCompleteUtterance('doctor')).toBe('doctor.');
  });

  it('leaves existing sentence-final punctuation alone', () => {
    expect(asCompleteUtterance('Who is there?')).toBe('Who is there?');
    expect(asCompleteUtterance('Stop!')).toBe('Stop!');
    expect(asCompleteUtterance('He paused…')).toBe('He paused…');
    expect(asCompleteUtterance('It ended.')).toBe('It ended.');
  });

  it('accepts a closing quote or bracket after the terminator', () => {
    expect(asCompleteUtterance('"Go away."')).toBe('"Go away."');
    expect(asCompleteUtterance('“Go away.”')).toBe('“Go away.”');
    expect(asCompleteUtterance('(so it seemed.)')).toBe('(so it seemed.)');
  });

  it('replaces dangling non-terminal punctuation rather than stacking it', () => {
    // ",." would read as a pause, not an ending.
    expect(asCompleteUtterance('he said,')).toBe('he said.');
    expect(asCompleteUtterance('as follows:')).toBe('as follows.');
    expect(asCompleteUtterance('a pause —')).toBe('a pause.');
    expect(asCompleteUtterance('and then;')).toBe('and then.');
  });

  it('returns empty for empty or whitespace input', () => {
    expect(asCompleteUtterance('')).toBe('');
    expect(asCompleteUtterance('   ')).toBe('');
  });

  it('is idempotent', () => {
    const once = asCompleteUtterance('doctor');
    expect(asCompleteUtterance(once)).toBe(once);
  });
});

describe('prepareSpeechText', () => {
  it('normalizes like the narration path, then closes the sentence', () => {
    // Same Roman-numeral rule the reading loop applies, so Speak matches narration.
    expect(prepareSpeechText('Chapter I')).toBe('Chapter 1.');
  });

  it('title-cases long all-caps words so espeak does not spell them out', () => {
    expect(prepareSpeechText('PROLOGUE')).toBe('Prologue.');
  });

  it('collapses whitespace and adds terminal punctuation in one pass', () => {
    expect(prepareSpeechText('  the   doctor  ')).toBe('the doctor.');
  });

  it('keeps a full sentence unchanged', () => {
    expect(prepareSpeechText('The ferry would not wait.')).toBe('The ferry would not wait.');
  });

  it('still respects the length cap', () => {
    const out = prepareSpeechText('word '.repeat(1000));
    expect(out.length).toBeLessThanOrEqual(SPEAK_ONCE_MAX_CHARS + 1); // +1 for the added stop
    expect(out.endsWith('.')).toBe(true);
  });
});
