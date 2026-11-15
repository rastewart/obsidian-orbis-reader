// Download a build input whose bytes are pinned, and refuse it if they are not the ones expected.
//
// **For the two dictionary builds** (`build-wordnet.ts`, `build-webster.ts`), whose inputs live in other people's
// GitHub repositories. Both sources are fixed editions, so a file that hashes differently is not a newer one: it is a
// moved, replaced or truncated one, and the build should stop there, saying so, rather than produce an asset that
// then fails its own pin further down for a reason the log no longer shows.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function downloadPinned(url: string, sha256: string, to: string): Promise<void> {
  console.log(`fetching ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(to));
  const got = createHash('sha256')
    .update(await readFile(to))
    .digest('hex');
  if (got !== sha256) {
    throw new Error(
      `The source changed: ${url}\n  expected SHA-256 ${sha256}\n  got      ${got}\n` +
        'This build is pinned to one edition. Find out what happened upstream before changing the pin.'
    );
  }
  console.log(`  SHA-256 ${got} (as pinned)`);
}
