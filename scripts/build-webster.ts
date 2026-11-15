// Build the offline Webster's 1913 asset the Look-up panel downloads.
//
// **The source is pinned twice: by commit, and by digest.** It is the "compact" build in matthewreagan's
// WebstersEnglishDictionary repository (see `assets/README.md` for why that one), at the commit the hosted asset was
// made from. A commit in a URL says which file was meant; only the digest says that file is the one that arrived.
//
// **The transform stays in Python** (`assets/build-dictionary.py`), the script the hosted asset was built with. It
// reproduces that file byte for byte, and a port would have to match it exactly: see assets/README.md, "Why this one
// step is Python".
//
// Run: `pnpm build:webster` — writes `dist-assets/orbis-webster-1913.json`. The Dictionaries workflow calls the same
// script, so the hosted file and a local build cannot differ.

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadPinned } from './pinned-download';

const COMMIT = '6fb9c92420c3a323e74ffb9d577409f4431cc42a';
const SOURCE_URL = `https://raw.githubusercontent.com/matthewreagan/WebstersEnglishDictionary/${COMMIT}/dictionary_compact.json`;
const SOURCE_SHA256 = '16b12847a47cc1202e5e40a3a44b9ed2f749d23c0a5f0ad11fcbd4e8c6c3e33d';
const OUT = 'dist-assets/orbis-webster-1913.json';

async function main(): Promise<void> {
  const work = await mkdtemp(join(tmpdir(), 'orbis-webster-'));
  try {
    const source = join(work, 'dictionary_compact.json');
    await downloadPinned(SOURCE_URL, SOURCE_SHA256, source);
    await mkdir('dist-assets', { recursive: true });
    // `-I`: isolated mode, so nothing in the working folder or the environment can stand in for the standard library.
    execFileSync('python3', ['-I', 'assets/build-dictionary.py', source, OUT], { stdio: 'inherit' });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

void main();
