// A speech server that refuses a request is reported as refusing it — not as a server that cannot be reached.
//
// Written from a log: an on-device voice name sent to a Kokoro server came back 400 on every sentence, and the
// report said "Could not reach the recording server". `requestUrl` throws for any status of 400 or more unless told
// not to, so the refusal arrived as an exception and was filed with the connection failures.

import { beforeAll, describe, expect, it, vi } from 'vitest';

/** Obsidian's behaviour: a status of 400 or more throws, unless the request says `throw: false`. */
const requestUrl = vi.hoisted(() =>
  vi.fn(async (req: { throw?: boolean }) => {
    if (req.throw !== false) throw new Error('Request failed, status 400');
    return { status: 400, text: 'voice not found', arrayBuffer: new ArrayBuffer(0) };
  })
);
vi.mock('obsidian', async (original) => ({ ...(await original<Record<string, unknown>>()), requestUrl }));

const { createServerSynth } = await import('../reader/tts/recording');

// Obsidian's global for the focused window's document, which the recording watches for the app going away.
beforeAll(() => {
  (globalThis as { activeDocument?: Document }).activeDocument = document;
});

describe('a server that refuses the voice', () => {
  it('is reported as refusing the voice, once, with no retries', async () => {
    requestUrl.mockClear();
    const synth = createServerSynth('https://tts.example', 'en_US-ryan-medium', 'kokoro', 1);
    expect(await synth.synth('Chapter Three: Morning')).toBeNull();
    expect(synth.failure).toBe('voice-rejected');
    // A 400 is an answer: asking again gets the same one.
    expect(requestUrl).toHaveBeenCalledOnce();
  });
});
