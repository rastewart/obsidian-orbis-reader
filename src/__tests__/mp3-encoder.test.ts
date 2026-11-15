// The MP3 encoder is vendored (src/vendor/lamejs), and this pins what it produces.
//
// **Why a digest.** These digests are what `@breezystack/lamejs@1.2.7` produces for the signal below, and the
// vendored `zhuker/lamejs` source produces the same bytes. Any change to the encoder — a merge from upstream, an
// edit, a bundler that treats CommonJS differently — shows up here as a changed digest rather than as a recording
// nobody listens to.
//
// The settings are the ones recordings use: mono, 48 kbps, fed in 1152-sample frames (`createMp3Stream` in
// `recording.ts`), at the two sample rates Piper voices come in.

import { Mp3Encoder } from 'lamejs';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../reader/tts/asset-integrity';

/**
 * Two seconds of tones and deterministic noise, 16-bit mono.
 *
 * **What this is known to catch.** Changing one MDCT window coefficient, a path every frame takes, fails both cases.
 * What it is not known to catch: LAME's attack detection. Disabling it (`NSATTACKTHRE` in `PsyModel.js`) changes no
 * output at these settings, even for a sudden burst after silence, so the signal carries no burst and claims no
 * coverage of that path.
 */
function signal(rate: number): Int16Array {
  const n = rate * 2;
  const out = new Int16Array(n);
  let seed = 12345;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const noise = (seed / 0xffffffff - 0.5) * 0.05;
    const t = i / rate;
    const v =
      0.4 * Math.sin(2 * Math.PI * 220 * t) +
      0.2 * Math.sin(2 * Math.PI * 660 * t) * Math.sin(2 * Math.PI * 3 * t) +
      noise;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return out;
}

function encode(rate: number): Uint8Array {
  const enc = new Mp3Encoder(1, rate, 48);
  const pcm = signal(rate);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) parts.push(Uint8Array.from(enc.encodeBuffer(pcm.subarray(i, i + 1152))));
  parts.push(Uint8Array.from(enc.flush()));
  const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    all.set(p, offset);
    offset += p.length;
  }
  return all;
}

describe('the vendored MP3 encoder', () => {
  it.each([
    [22050, 12382, '861cb23827569854c6c6c2bd8fa7d424d35cb6c1b2c2c39ea067bb90415ae4f6'],
    [24000, 12384, 'e0fbbc51f8481fa16d8fcb2ed698207b3edf28c4a1431503c801b12d808a5093'],
  ])('encodes %i Hz exactly as @breezystack/lamejs did', async (rate, length, digest) => {
    const mp3 = encode(rate);
    expect(mp3.length).toBe(length);
    expect(await sha256Hex(mp3.buffer as ArrayBuffer)).toBe(digest);
  });
});
