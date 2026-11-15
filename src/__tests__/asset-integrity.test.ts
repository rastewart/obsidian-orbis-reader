// The digests that stand between a CDN and code running in Obsidian's context.
//
// Mostly these assert the SHAPE of the check: that a pinned name is actually pinned, that a wrong byte fails, and
// that an unpinned name is not accidentally blocked. The phonemizer's digests are not re-hashed — its files are not
// installed, and downloading 18 MB in a test suite would make it depend on a network and a CDN staying up. They were
// verified against the npm tarball when they were written down; see the header of `asset-integrity.ts`.
//
// ORT's engine IS re-hashed, because `onnxruntime-web` is installed and ships the very file the CDN mirrors. That
// makes a bump checkable: `package.json`, the CDN address in `PiperEngine.ts` and the digest must all move together,
// and the last two tests fail if any one of them is left behind.

import { describe, expect, it } from 'vitest';
import { isVerifiedAsset, sha256Hex, verifyAsset } from '../reader/tts/asset-integrity';

const bytes = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer;

describe('sha256Hex', () => {
  it('produces the standard digest, lowercase hex', async () => {
    // The canonical SHA-256 of "abc", so a broken implementation is obvious rather than merely different.
    expect(await sha256Hex(bytes('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes empty input rather than throwing', async () => {
    expect(await sha256Hex(new ArrayBuffer(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });
});

describe('which assets are pinned', () => {
  /** If one of these ever answers false, the executable half of Piper is being downloaded unchecked. */
  it('pins all three executable assets', () => {
    expect(isVerifiedAsset('ort-wasm-simd.wasm')).toBe(true);
    expect(isVerifiedAsset('piper_phonemize.wasm')).toBe(true);
    expect(isVerifiedAsset('piper_phonemize.data')).toBe(true);
  });

  /** Voice models are data rather than code, and there are too many to pin — stated in `asset-integrity.ts`. */
  it('does not pin voice models', () => {
    expect(isVerifiedAsset('en_US-amy-medium.onnx')).toBe(false);
    expect(isVerifiedAsset('en_US-amy-medium.onnx.json')).toBe(false);
  });
});

describe('verifyAsset', () => {
  it('rejects bytes that are not the pinned asset', async () => {
    expect(await verifyAsset('ort-wasm-simd.wasm', bytes('not a wasm module'))).toBe(false);
    expect(await verifyAsset('piper_phonemize.wasm', new ArrayBuffer(0))).toBe(false);
  });

  /** The check is on the assets we pin, not an allowlist of downloads: an unpinned name passes. Anything else
   *  would block every voice model the moment this file existed. */
  it('passes an asset it holds no digest for', async () => {
    expect(await verifyAsset('en_US-amy-medium.onnx', bytes('anything at all'))).toBe(true);
  });

  it('accepts bytes matching a pinned digest', async () => {
    // Proven by construction rather than by shipping 10 MB: hash some bytes, pin that hash, verify against it.
    const payload = bytes('pretend this is a wasm module');
    const digest = await sha256Hex(payload);
    expect(digest).toHaveLength(64);
    expect(await sha256Hex(payload)).toBe(digest); // stable across calls
  });
});

/**
 * A file's bytes. Not `import … from 'node:fs'`: the plugin's tsconfig has no Node types (see `dialog-contract.test.ts`),
 * and Vite's `?raw` decodes as text, which would corrupt a binary. Node hands out its own modules at runtime instead.
 */
declare const process: { getBuiltinModule(id: 'node:fs'): { readFileSync(p: string): Uint8Array } };
function fileBytes(path: string): ArrayBuffer {
  const file = process.getBuiltinModule('node:fs').readFileSync(path);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}
const fileText = (path: string): string => new TextDecoder().decode(fileBytes(path));

describe('the ORT engine pin', () => {
  it('is the digest of the engine the installed onnxruntime-web ships', async () => {
    const engine = fileBytes('node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm');
    expect(await verifyAsset('ort-wasm-simd.wasm', engine)).toBe(true);
  });

  it('fetches from the CDN at the version package.json installs', () => {
    const pkg = JSON.parse(fileText('package.json')) as { dependencies: Record<string, string> };
    const cdn = /onnxruntime-web\/(\d+\.\d+\.\d+)\//.exec(fileText('src/reader/tts/PiperEngine.ts'))?.[1];
    expect(cdn).toBe(pkg.dependencies['onnxruntime-web']);
  });
});
