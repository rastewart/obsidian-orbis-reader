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
//
// The test plans' files are not among them: they have a release of their own, `test-fixtures`
// (`scripts/test-fixtures-zip.ts`).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withVersion } from './release-lib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
