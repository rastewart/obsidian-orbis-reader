// The release rules `pnpm bump` writes by and the release workflow checks by — see scripts/release-lib.ts.
//
// Tested here because they decide what is published: a bump that edits the wrong `version` or files a changelog
// section where the check cannot find it would surface only as a refused tag, or worse, a release with no notes.

import { describe, expect, it } from 'vitest';
import {
  betaBase,
  betaProblem,
  changelogSection,
  compareVersions,
  isBetaTag,
  isVersion,
  NOTES_PLACEHOLDER,
  notesProblem,
  UNRELEASED,
  withChangelogSection,
  withVersion,
  withVersionEntry,
} from '../../scripts/release-lib';

const CHANGELOG = `# Changelog

Intro.

---

## [0.1.0] — 2026-11-01

Initial release.
`;

describe('versions', () => {
  it("takes Obsidian's form only: three numbers, no v", () => {
    expect(isVersion('0.2.0')).toBe(true);
    expect(isVersion('10.0.12')).toBe(true);
    expect(isVersion('v0.2.0')).toBe(false);
    expect(isVersion('0.2')).toBe(false);
    expect(isVersion('0.2.0-beta')).toBe(false);
  });

  it('compares by number, not by text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.1.9', '0.2.0')).toBeLessThan(0);
  });
});

describe('the version files', () => {
  it('changes the one version field and leaves the formatting alone', () => {
    const json = '{\n  "name": "x",\n  "version": "0.1.0",\n  "devDependencies": { "a": "1.0.0" }\n}\n';
    expect(withVersion(json, '0.1.0', '0.2.0')).toBe(json.replace('"0.1.0"', '"0.2.0"'));
  });

  it('refuses a file whose version is not the one expected, or appears twice', () => {
    expect(() => withVersion('{ "version": "0.3.0" }', '0.1.0', '0.2.0')).toThrow();
    expect(() => withVersion('{ "version": "0.1.0", "x": { "version": "0.1.0" } }', '0.1.0', '0.2.0')).toThrow();
  });

  it('adds every version to versions.json at the floor given, and never one twice', () => {
    const next = withVersionEntry('{\n  "0.1.0": "1.14.4"\n}\n', '0.2.0', '1.14.4');
    expect(next).toBe('{\n  "0.1.0": "1.14.4",\n  "0.2.0": "1.14.4"\n}\n');
    expect(() => withVersionEntry(next, '0.2.0', '1.14.4')).toThrow();
  });
});

describe('the changelog', () => {
  it('opens a section above the newest, which the check then refuses until it is written', () => {
    const md = withChangelogSection(CHANGELOG, '0.2.0', '2026-11-14');
    expect(md.indexOf('## [0.2.0] — 2026-11-14')).toBeLessThan(md.indexOf('## [0.1.0]'));
    expect(changelogSection(md, '0.2.0')).toBe(NOTES_PLACEHOLDER);
    expect(notesProblem(changelogSection(md, '0.2.0'), '0.2.0')).toMatch(/placeholder/);
    expect(() => withChangelogSection(md, '0.2.0', '2026-11-14')).toThrow();
  });

  it("reads a section's text up to the next version, and the last one to the end", () => {
    const md = withChangelogSection(CHANGELOG, '0.2.0', '2026-11-14').replace(
      NOTES_PLACEHOLDER,
      '### Fixed\n\n- A fix.'
    );
    expect(changelogSection(md, '0.2.0')).toBe('### Fixed\n\n- A fix.');
    expect(changelogSection(md, '0.1.0')).toBe('Initial release.');
    expect(notesProblem(changelogSection(md, '0.2.0'), '0.2.0')).toBeNull();
  });

  it('names a missing or empty section as the reason', () => {
    expect(notesProblem(changelogSection(CHANGELOG, '0.3.0'), '0.3.0')).toMatch(/no section/);
    expect(notesProblem(changelogSection('## [0.3.0] — 2026-12-01\n\n## [0.1.0]\n', '0.3.0'), '0.3.0')).toMatch(
      /empty/
    );
  });
});

describe('betas', () => {
  it('takes a version and -beta.N, and nothing looser', () => {
    expect(isBetaTag('0.2.0-beta.1')).toBe(true);
    expect(isBetaTag('1.10.0-beta.12')).toBe(true);
    expect(isBetaTag('0.2.0')).toBe(false);
    expect(isBetaTag('v0.2.0-beta.1')).toBe(false);
    expect(isBetaTag('0.2.0-beta')).toBe(false);
    expect(isBetaTag('0.2.0-rc.1')).toBe(false);
    expect(isBetaTag('0.2.0-beta.1.1')).toBe(false);
    expect(betaBase('0.2.0-beta.3')).toBe('0.2.0');
  });

  it("allows a beta of a version above main's, or equal to it before it is tagged — the first release's case", () => {
    expect(betaProblem('0.2.0-beta.1', '0.1.0', ['0.1.0'])).toBeNull();
    expect(betaProblem('0.1.0-beta.1', '0.1.0', [])).toBeNull();
    expect(betaProblem('0.1.0-beta.2', '0.1.0', ['0.1.0-beta.1', 'dictionaries'])).toBeNull();
  });

  it("refuses a beta below main's version, or of a version already released", () => {
    expect(betaProblem('0.1.0-beta.1', '0.2.0', [])).toMatch(/lower than manifest.json's 0.2.0/);
    expect(betaProblem('0.1.0-beta.1', '0.1.0', ['0.1.0'])).toMatch(/already tagged/);
  });

  it("reads what is in it from its version's Unreleased section, which the bump then dates, text kept", () => {
    const md = CHANGELOG.replace('## [0.1.0]', `## [0.2.0] — ${UNRELEASED}\n\n### Added\n\n- A swipe.\n\n## [0.1.0]`);
    expect(changelogSection(md, '0.2.0')).toBe('### Added\n\n- A swipe.');
    const bumped = withChangelogSection(md, '0.2.0', '2026-12-01');
    expect(bumped).toContain('## [0.2.0] — 2026-12-01\n');
    expect(bumped).not.toContain(UNRELEASED);
    expect(changelogSection(bumped, '0.2.0')).toBe('### Added\n\n- A swipe.');
    expect(bumped.match(/## \[0\.2\.0\]/g)).toHaveLength(1);
  });
});
