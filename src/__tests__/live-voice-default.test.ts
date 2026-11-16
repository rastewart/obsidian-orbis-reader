// Which voice speaks when nobody has chosen one.
//
// `resolveDeviceLiveVoice` is the pure statement of a rule that three places implement — it, the engine's
// `TtsController.resolveSource`, and the picker's `activeSource`. They have to agree: a picker showing one source
// while the engine speaks with the other is the failure the picker's own comment warns about. The reader's one-shot
// speech (`OrbisReaderView.resolvedLiveVoice`, behind look-up's Speak) calls it rather than restating it — see the
// last test for why that is checked.

import { describe, expect, it } from 'vitest';
import { resolveDeviceLiveVoice } from '../reader/tts/speak-once';

/** A source file's text — through `getBuiltinModule`, for the reason `asset-integrity.test.ts` gives. */
declare const process: { getBuiltinModule(id: 'node:fs'): { readFileSync(p: string, enc: 'utf8'): string } };

describe('the live voice with no preference stored', () => {
  /**
   * **Orbis, even where the OS has voices.** This defaulted to system wherever Web Speech existed, which made the
   * OS the product's narrator on desktop and iPad by omission — and hid `FirstVoiceModal`, the prompt written to
   * offer the recommended voice on a first listen, which could never fire there.
   */
  it('is an Orbis voice, whether or not the system has any', () => {
    expect(resolveDeviceLiveVoice(undefined, true).source).toBe('orbis');
    expect(resolveDeviceLiveVoice(undefined, false).source).toBe('orbis');
  });

  it('carries the recommended voice, so something can actually speak', () => {
    const resolved = resolveDeviceLiveVoice(undefined, true);
    expect(resolved.source === 'orbis' && resolved.path).toBeTruthy();
  });
});

describe('the live voice with a preference stored', () => {
  it('honours a chosen system voice where the system has them', () => {
    const pref = { deviceId: 'd', source: 'system' as const, systemVoiceURI: 'urn:alex' };
    expect(resolveDeviceLiveVoice(pref, true)).toEqual({ source: 'system', uri: 'urn:alex' });
  });

  /**
   * A preference can arrive from a device that had Web Speech, on one that does not — the same guard the engine
   * and the picker make. Reporting "system" on a device with no system voices would name an engine that cannot be
   * built.
   */
  it('falls through to Orbis when a stored system choice cannot be honoured', () => {
    const pref = { deviceId: 'd', source: 'system' as const, systemVoiceURI: 'urn:alex' };
    expect(resolveDeviceLiveVoice(pref, false).source).toBe('orbis');
  });

  it('honours a chosen Orbis voice, and its speaker on a multi-speaker model', () => {
    const pref = { deviceId: 'd', source: 'orbis' as const, orbisVoiceId: 'en_US-amy-medium' };
    const resolved = resolveDeviceLiveVoice(pref, true);
    expect(resolved.source).toBe('orbis');
    expect(resolved.source === 'orbis' && resolved.sid).toBe(0);
  });
});

/**
 * **One rule, not a copy.** The reader view once restated the precedence for look-up's Speak button and kept the old
 * one — no preference meant a system voice — after this rule changed. Keeping the suggested voice in setup stores no
 * preference, so on Windows the Listening page said Amy while Speak used a Windows voice. The view is too large to
 * build here, so this checks that its resolver hands the decision to the shared function.
 */
describe("the reader's one-shot speech", () => {
  it('resolves its voice with the shared rule', () => {
    const view = process.getBuiltinModule('node:fs').readFileSync('src/OrbisReaderView.ts', 'utf8');
    const body = /\n {2}resolvedLiveVoice\(\): ResolvedLiveVoice \{\n([\s\S]*?)\n {2}\}/.exec(view)?.[1] ?? '';
    expect(body).toContain('resolveDeviceLiveVoice(');
    expect(body).not.toMatch(/source\s*!==\s*'orbis'/);
  });
});
