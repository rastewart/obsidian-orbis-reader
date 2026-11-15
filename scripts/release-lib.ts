// The rules a release follows, as plain string functions: what a version looks like, how the three version files
// change in a bump, and where a release's notes are in CHANGELOG.md.
//
// **Shared by the two ends of a release.** `pnpm bump` (`bump-version.ts`) writes the files; the release workflow
// (`release-check.ts`) reads them back and refuses a tag they do not agree with. Kept free of Node so the tests in
// `src/__tests__` can import it — the plugin's tsconfig carries no Node types on purpose.

/** The release file the plugin's *Download test fixtures (dev)* command fetches. `src/test-fixtures.ts` names it too. */
export const TEST_FIXTURES_ZIP = 'orbis-test-fixtures.zip';

/** Obsidian's form: three numbers, no `v`. The release workflow's tag filter and `versions.json` both expect it. */
export function isVersion(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v);
}

/**
 * A beta's tag: a version and `-beta.N`, as `0.2.0-beta.1`.
 *
 * **Never in a file on main.** Obsidian's store reads `manifest.json` from main and offers the release whose tag is
 * that version, in `x.y.z` form only, so main keeps the last stable version while a beta is out. The beta's version
 * is written into the released copy of `manifest.json` alone, where BRAT reads it, and BRAT orders `0.2.0-beta.1`
 * below `0.2.0`, so a tester moves up to the stable release when it comes.
 */
export function isBetaTag(tag: string): boolean {
  return /^\d+\.\d+\.\d+-beta\.\d+$/.test(tag);
}

/** The stable version a beta leads up to: `0.2.0` for `0.2.0-beta.1`. */
export function betaBase(tag: string): string {
  return tag.slice(0, tag.indexOf('-'));
}

/**
 * Why a beta tag cannot be released, or null when it can.
 *
 * Its version must be at least main's, or a tester would be moved backwards, and must not be released already: a beta
 * of `0.1.0` once `0.1.0` is out would sort below the release it claims to come before. Equal to main's is allowed,
 * so the first release can have betas: main says `0.1.0` before `0.1.0` is ever tagged.
 */
export function betaProblem(tag: string, manifestVersion: string, tags: readonly string[]): string | null {
  const base = betaBase(tag);
  if (compareVersions(base, manifestVersion) < 0) {
    return `${tag} leads up to ${base}, which is lower than manifest.json's ${manifestVersion}.`;
  }
  if (tags.includes(base)) return `${base} is already tagged, so a beta of it would come after it.`;
  return null;
}

/** The notes a beta's draft starts with. Edited on GitHub before it is published, if there is more to say. */
export function betaNotes(tag: string): string {
  return `A beta of ${betaBase(tag)}, for testing before it is released. BRAT installs it; the community plugin store does not offer it.`;
}

/** Negative, zero or positive, as `a` is lower than, equal to or higher than `b`. Both must pass `isVersion`. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * `manifest.json` or `package.json` with its `"version"` changed, and nothing else touched.
 *
 * **Edited as text, not re-serialized**, so the file keeps its own formatting and key order — `package.json` in
 * particular, whose layout is pnpm's and Biome's, not `JSON.stringify`'s. Exactly one match, or it refuses: two would
 * mean a nested `version` this would wrongly change too.
 */
export function withVersion(json: string, from: string, to: string): string {
  const field = `"version": "${from}"`;
  const at = json.indexOf(field);
  if (at < 0 || json.indexOf(field, at + 1) >= 0) {
    throw new Error(`Expected exactly one ${field}.`);
  }
  return json.replace(field, `"version": "${to}"`);
}

/**
 * `versions.json` with the new version added at the manifest's `minAppVersion`.
 *
 * **Every bump adds one**, not only those that move the floor: Obsidian reads this file from the repository to tell
 * an older app which release it may install, and a version missing from it is one no older app is offered.
 */
export function withVersionEntry(json: string, version: string, minAppVersion: string): string {
  const floors = JSON.parse(json) as Record<string, string>;
  if (version in floors) throw new Error(`versions.json already lists ${version}.`);
  return `${JSON.stringify({ ...floors, [version]: minAppVersion }, null, 2)}\n`;
}

/** What `pnpm bump` leaves under a new heading, and what the release workflow refuses to publish. */
export const NOTES_PLACEHOLDER = '<!-- Describe this release under Added, Changed, Fixed or Removed. -->';

/** `## [0.2.0] — 2026-11-14`, the heading form the changelog already uses. */
function heading(version: string, date: string): string {
  return `## [${version}] — ${date}`;
}

/** CHANGELOG.md with a section for `version` added above the newest one. */
export function withChangelogSection(md: string, version: string, date: string): string {
  if (changelogSection(md, version) !== null) throw new Error(`CHANGELOG.md already has a section for ${version}.`);
  const first = md.search(/^## \[/m);
  if (first < 0) throw new Error('CHANGELOG.md has no version section to add this one above.');
  return `${md.slice(0, first)}${heading(version, date)}\n\n${NOTES_PLACEHOLDER}\n\n${md.slice(first)}`;
}

/** The text of `version`'s section, without its heading, or null when there is none. */
export function changelogSection(md: string, version: string): string | null {
  const lines = md.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

/** Why a section's text cannot be a release's notes, or null when it can. */
export function notesProblem(section: string | null, version: string): string | null {
  if (section === null) return `CHANGELOG.md has no section for ${version}.`;
  if (section.includes(NOTES_PLACEHOLDER)) return `CHANGELOG.md's section for ${version} still has its placeholder.`;
  if (!section) return `CHANGELOG.md's section for ${version} is empty.`;
  return null;
}
