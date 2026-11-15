// The System voices list: one entry per voice, at the best quality the device has — see `bestOfEachVoice`.

import { afterEach, describe, expect, it } from 'vitest';
import { bestOfEachVoice, findSystemVoice } from '../reader/tts/WebSpeechEngine';

const v = (name: string, lang: string, voiceURI: string) => ({ name, lang, voiceURI });

describe('the system voices offered', () => {
  // What an iPhone reported: each voice once per installed quality, under one name.
  it('lists a voice iOS reports twice once, at its better quality', () => {
    const listed = bestOfEachVoice([
      v('Daniel', 'en-GB', 'com.apple.voice.super-compact.en-GB.Daniel'),
      v('Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel'),
      v('Karen', 'en-AU', 'com.apple.voice.super-compact.en-AU.Karen'),
    ]);
    expect(listed.map((x) => x.voiceURI)).toEqual([
      'com.apple.voice.compact.en-GB.Daniel',
      'com.apple.voice.super-compact.en-AU.Karen',
    ]);
  });

  it('prefers premium over enhanced over compact', () => {
    const listed = bestOfEachVoice([
      v('Ava', 'en-US', 'com.apple.voice.compact.en-US.Ava'),
      v('Ava', 'en-US', 'com.apple.voice.premium.en-US.Ava'),
      v('Ava', 'en-US', 'com.apple.voice.enhanced.en-US.Ava'),
    ]);
    expect(listed.map((x) => x.voiceURI)).toEqual(['com.apple.voice.premium.en-US.Ava']);
  });

  // The Mac reports bare names as identifiers, and never the same voice twice.
  it('leaves voices with different names or languages alone', () => {
    const listed = bestOfEachVoice([v('Samantha', 'en-US', 'Samantha'), v('Daniel', 'en-GB', 'Daniel')]);
    expect(listed).toHaveLength(2);
  });
});

describe('a saved system voice', () => {
  afterEach(() => {
    delete (window as { speechSynthesis?: unknown }).speechSynthesis;
  });

  /** A device reporting these voices to `speechSynthesis.getVoices()`. */
  const device = (...voices: ReturnType<typeof v>[]) => {
    (window as { speechSynthesis?: unknown }).speechSynthesis = { getVoices: () => voices };
  };

  // What the iPad mini showed: the chip read `com.apple.voice.super-compact…`, a choice saved before the list hid that copy.
  it('that names a copy the list hides means the copy the list shows', () => {
    device(
      v('Daniel', 'en-GB', 'com.apple.voice.super-compact.en-GB.Daniel'),
      v('Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel')
    );
    const found = findSystemVoice('com.apple.voice.super-compact.en-GB.Daniel');
    expect(found?.name).toBe('Daniel');
    expect(found?.voiceURI).toBe('com.apple.voice.compact.en-GB.Daniel');
  });

  it('that is listed is itself', () => {
    device(v('Samantha', 'en-US', 'Samantha'));
    expect(findSystemVoice('Samantha')?.voiceURI).toBe('Samantha');
  });

  it('that the device no longer has is nothing', () => {
    device(v('Samantha', 'en-US', 'Samantha'));
    expect(findSystemVoice('Victoria')).toBeUndefined();
  });
});
