// Write the files a release attaches into one folder, from a finished build.
//
// Usage:
//   pnpm exec tsx scripts/release-files.ts 0.2.0 release
//
// Run by the release workflow's build job, after `release-check.ts` has passed the tag. It writes:
//
// - `main.js` and `styles.css`, as built.
// - `manifest.json`, with the tag as its version. For a stable tag that is the file as it is; for a beta it is the only
//   place the beta's version is written, since main keeps the last stable version (see `isBetaTag`).
// - `orbis-test-fixtures.zip`: every file git tracks under `test-vault/fixtures`, at its path below that folder, for
//   the plugin's *Download test fixtures (dev)* command. Sorted, and every entry dated midnight on 1980-01-01
//   wherever it runs, so the same commit packs the same bytes. Obsidian and BRAT install only the other three files.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { TEST_FIXTURES_ZIP, withVersion } from './release-lib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = 'test-vault/fixtures';

const [tag, outArg] = process.argv.slice(2);
if (!tag || !outArg) {
  console.error('Usage: tsx scripts/release-files.ts <tag> <folder>');
  process.exit(2);
}
const out = path.resolve(outArg);
mkdirSync(out, { recursive: true });

for (const name of ['main.js', 'styles.css']) copyFileSync(path.join(ROOT, name), path.join(out, name));

const manifest = readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
const { version } = JSON.parse(manifest) as { version: string };
writeFileSync(path.join(out, 'manifest.json'), tag === version ? manifest : withVersion(manifest, version, tag));

const tracked = execFileSync('git', ['ls-files', '-z', '--', FIXTURES], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .sort();
const files: Record<string, Uint8Array> = {};
for (const file of tracked) files[file.slice(FIXTURES.length + 1)] = readFileSync(path.join(ROOT, file));
writeFileSync(path.join(out, TEST_FIXTURES_ZIP), zipSync(files, { mtime: new Date(1980, 0, 1) }));
console.log(`${tracked.length} test fixtures in ${TEST_FIXTURES_ZIP}`);
