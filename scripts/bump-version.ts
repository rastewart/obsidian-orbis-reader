// Bump the plugin's version in every file that states it, and open a changelog section for it.
//
// Usage:
//   pnpm bump 0.2.0
//
// Changes four files: the `version` in `manifest.json` and `package.json`, a new `versions.json` entry at the
// manifest's `minAppVersion`, and a dated `CHANGELOG.md` section holding a placeholder. Fill in that section before
// tagging — the release workflow refuses a placeholder — and see the release checklist in
// `docs/design/feature-development-guide.md` for the rest. When the betas already wrote the section, headed
// `## [0.2.0] — Unreleased`, it is dated instead, its text kept.
//
// **One command, because the four drift apart by hand.** `release-metadata.test.ts` catches the first three
// disagreeing, but only after the fact; this makes them agree in the first place.
import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions, isVersion, withChangelogSection, withVersion, withVersionEntry } from './release-lib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = (name: string) => path.join(ROOT, name);
const read = (name: string) => readFileSync(file(name), 'utf8');

const next = process.argv[2] ?? '';
const manifestText = read('manifest.json');
const manifest = JSON.parse(manifestText) as { version: string; minAppVersion: string };
const current = manifest.version;

if (!isVersion(next)) {
  console.error(
    `Usage: pnpm bump <version>, such as 0.2.0 — three numbers, no "v". The current version is ${current}.`
  );
  process.exit(1);
}
if (compareVersions(next, current) <= 0) {
  console.error(`${next} is not higher than the current version, ${current}.`);
  process.exit(1);
}

// The date the bump is made. Change it in CHANGELOG.md if the release goes out on another day.
const now = new Date();
const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-');

// Every change is worked out before any file is written, so a refusal leaves all four as they were.
const changes: [string, string][] = [
  ['manifest.json', withVersion(manifestText, current, next)],
  ['package.json', withVersion(read('package.json'), current, next)],
  ['versions.json', withVersionEntry(read('versions.json'), next, manifest.minAppVersion)],
  ['CHANGELOG.md', withChangelogSection(read('CHANGELOG.md'), next, today)],
];
for (const [name, text] of changes) writeFileSync(file(name), text);

console.log(`${current} → ${next}
  manifest.json   version ${next}
  package.json    version ${next}
  versions.json   "${next}": "${manifest.minAppVersion}"
  CHANGELOG.md    ## [${next}] — ${today}, with a placeholder to replace

Next: describe the release in CHANGELOG.md, run the gate, and commit. Then push and tag it — see
"Publishing" in docs/design/feature-development-guide.md.`);
