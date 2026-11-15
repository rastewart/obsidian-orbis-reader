// Check that a release tag agrees with the files it releases, and print the release's notes.
//
// Usage:
//   pnpm exec tsx scripts/release-check.ts 0.2.0 > notes.md
//   pnpm exec tsx scripts/release-check.ts 0.2.0-beta.1 > notes.md
//
// Run by the release workflow (`.github/workflows/release.yml`) before anything is built. A stable tag must be
// `manifest.json`'s version, listed in `versions.json` at the manifest's floor, with a CHANGELOG.md section that is
// present, filled in and free of `pnpm bump`'s placeholder; that section goes to stdout as the notes.
//
// A beta tag (`0.2.0-beta.1`) asks none of that, since main keeps the last stable version while a beta is out (see
// `isBetaTag`). It must lead up to a version at least main's that is not tagged yet, and its notes are one fixed line.
// The tags are read from git: the workflow's check job has the whole history, while the build job, which calls this
// only for the notes, has just the one tag it is building.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { betaNotes, betaProblem, changelogSection, isBetaTag, isVersion, notesProblem } from './release-lib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name: string) => readFileSync(path.join(ROOT, name), 'utf8');

const tag = process.argv[2] ?? '';
const manifest = JSON.parse(read('manifest.json')) as { version: string; minAppVersion: string };

function stableProblems(): [string[], string] {
  const floors = JSON.parse(read('versions.json')) as Record<string, string>;
  const section = changelogSection(read('CHANGELOG.md'), tag);
  const problems = [
    tag !== manifest.version && `The tag is ${tag}, but manifest.json says ${manifest.version}.`,
    floors[tag] !== manifest.minAppVersion &&
      `versions.json should list "${tag}": "${manifest.minAppVersion}", and has ${floors[tag] ? `"${floors[tag]}"` : 'no entry'}.`,
    notesProblem(section, tag),
  ].filter((p): p is string => !!p);
  return [problems, section ?? ''];
}

function betaProblems(): [string[], string] {
  const tags = execFileSync('git', ['tag', '--list'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const problem = betaProblem(tag, manifest.version, tags);
  return [problem ? [problem] : [], betaNotes(tag)];
}

const [problems, notes] = isBetaTag(tag)
  ? betaProblems()
  : isVersion(tag)
    ? stableProblems()
    : [[`The tag "${tag}" is not a version: three numbers, no "v", and "-beta.N" for a beta.`], ''];

if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  process.exit(1);
}
console.log(notes);
