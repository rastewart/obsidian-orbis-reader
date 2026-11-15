// Digests for the code Orbis downloads and then executes.
//
// **The WASM is the part that matters.** Piper's engine is not shipped in `main.js`: the ONNX Runtime module and
// the espeak phonemizer are fetched from CDNs at first use, cached in the plugin folder, and handed to a Worker
// which instantiates them. That is arbitrary code arriving over the network into a privileged context. TLS proves
// the bytes came from the host we asked; it proves nothing about a compromised CDN account, a poisoned edge, or a
// cache file rewritten on disk afterwards.
//
// **Checked on download AND on cache read.** The download check is the supply-chain one. The read check is the
// interesting one: the cache lives under the plugin folder, which on some setups syncs between devices, and a
// cached file is loaded on every session while a download happens once. Verifying only at download would protect
// the moment that is already the safest.
//
// **Where these digests come from:** each URL is fetched and hashed, and then compared against the npm tarball of
// the package the CDN mirrors — `onnxruntime-web@1.18.0` and `@diffusionstudio/piper-wasm@1.0.0` — which must match
// byte for byte. That cross-check is the point: a digest taken from the CDN alone only pins whatever the CDN served
// that day. Re-do it when a URL's version changes, and NEVER take a new digest from a
// failing download — a mismatch is the mechanism working.
//
// **Voice models are deliberately not here.** A `.onnx` is data fed to the runtime rather than code, the catalog
// holds fourteen of them plus per-speaker variants, and pinning them means a table nobody can regenerate without
// downloading gigabytes. If ORT is ever found to be exploitable through a malicious model, this is the file that
// grows. See docs/design/dependency-security.md.

import { t } from '../../i18n';

/** Digest per cache filename. A file listed here cannot be used unless its bytes hash to this. */
const DIGESTS: Readonly<Record<string, string>> = {
  'ort-wasm-simd.wasm': 'f533b5f21790563d7556c611c3835ac65848ee326da2689aac54ed7d9cc8c6a4',
  'piper_phonemize.wasm': 'b777cd107a91d2bcc6a1ea46f2c26a662a7407394fe84589198aeaa83dd7a9d6',
  'piper_phonemize.data': '29f1025eb23a5b5c192cd14a6efbce4509402ff265405072ee6f7d1a09b78f8c',
};

/** Whether `name` is one of the assets we hold a digest for. Everything else passes through unchecked. */
export function isVerifiedAsset(name: string): boolean {
  return name in DIGESTS;
}

/**
 * A download whose bytes are not the file its pinned digest names.
 *
 * **Its own type, because the reader's advice is different.** A failed connection is worth trying again; this is
 * not — the same address serves the same wrong file — so "check your connection and try again" sends them to fix
 * something that was never broken. Thrown by the downloads pinned on download (dictionaries, PDF fonts), and told
 * apart where a failure becomes a notice.
 */
export class WrongFileError extends Error {
  constructor(file: string) {
    super(`${file}: unexpected contents`);
    this.name = 'WrongFileError';
  }
}

/** What to tell the reader when a download failed — a wrong file in its own words, anything else as a failed fetch. */
export function downloadFailedMessage(err: unknown): string {
  return t(err instanceof WrongFileError ? 'lookup_page.download_wrong_file' : 'lookup_page.download_failed');
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Whether these bytes are what `name` is supposed to be.
 *
 * Unknown names return true — this is a check on the assets we pin, not an allowlist of downloads. `isVerifiedAsset`
 * is how a caller tells the two apart when it needs to.
 */
export async function verifyAsset(name: string, buf: ArrayBuffer): Promise<boolean> {
  const expected = DIGESTS[name];
  if (!expected) return true;
  return (await sha256Hex(buf)) === expected;
}
