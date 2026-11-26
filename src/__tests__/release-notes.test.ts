// Which release notes a reader sees: the changelog split into releases, Maintenance left out, a beta's own section
// shown above the releases before it, and after an update everything not yet seen on the first page.

import { describe, expect, it } from 'vitest';
import { owedReleases, parseChangelog, type Release, releasesFor, whatsNewPages } from '../release-notes';

const CHANGELOG = `# Changelog

Intro text that is not a release.

<!-- A comment the reader never sees. -->

---

## [Unreleased]

### Added

- Something in the next beta.

### Maintenance

- Test fixtures moved.

## [0.3.0] — 2026-12-01

### Fixed

- A fix.

## [0.2.0] — 2026-11-20

### Maintenance

- Changes for the directory's review.

## [0.1.0] — 2026-11-01

The first release.

### Added

- Everything.
`;

/** CHANGELOG.md as text — Vite's glob, because the plugin's tsconfig has no Node types (see dialog-contract.test.ts). */
const REAL_CHANGELOG = Object.values(
  (import.meta as unknown as { glob: (pattern: string, opts: unknown) => Record<string, string> }).glob(
    '../../CHANGELOG.md',
    { query: '?raw', import: 'default', eager: true }
  )
)[0];

const versions = (rs: readonly Release[]) => rs.map((r) => (r.beta ? `${r.version}-beta.${r.beta}` : r.version));

describe('parseChangelog', () => {
  const all = parseChangelog(CHANGELOG);

  it('reads each section, newest first, with its version and date', () => {
    expect(all.map((r) => [r.version, r.date])).toEqual([
      [null, null],
      ['0.3.0', '2026-12-01'],
      ['0.2.0', '2026-11-20'],
      ['0.1.0', '2026-11-01'],
    ]);
  });

  it('leaves out Maintenance and HTML comments, and keeps the text before the first subsection', () => {
    expect(all[0].body).toBe('### Added\n\n- Something in the next beta.');
    expect(all[2].body).toBe('');
    expect(all[3].body).toBe('The first release.\n\n### Added\n\n- Everything.');
    expect(all.map((r) => r.body).join('')).not.toContain('<!--');
  });

  it('reads a section headed with its version and Unreleased as not released', () => {
    const [r] = parseChangelog('## [0.4.0] — Unreleased\n\n### Fixed\n\n- A fix.\n');
    expect(r).toMatchObject({ version: '0.4.0', date: null });
  });

  it('reads the real changelog, every released section with a date', () => {
    const real = parseChangelog(REAL_CHANGELOG);
    const released = real.filter((r) => r.version !== null && r.date !== null);
    expect(released.length).toBeGreaterThan(5);
    for (const r of released) expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('releasesFor', () => {
  const all = parseChangelog(CHANGELOG);

  it('gives a stable version its releases and those before it, without the unreleased section', () => {
    expect(versions(releasesFor(all, '0.3.0'))).toEqual(['0.3.0', '0.1.0']);
    expect(versions(releasesFor(all, '0.1.0'))).toEqual(['0.1.0']);
  });

  it('leaves out a release that only had Maintenance', () => {
    expect(versions(releasesFor(all, '0.2.0'))).toEqual(['0.1.0']);
  });

  it("gives a beta its version's unreleased section, labeled with the beta, above the releases before it", () => {
    const rs = releasesFor(all, '0.4.0-beta.2');
    expect(versions(rs)).toEqual(['0.4.0-beta.2', '0.3.0', '0.1.0']);
    expect(rs[0].date).toBeNull();
  });

  it('prefers a section headed with the beta’s version over a bare Unreleased', () => {
    const md = `## [0.4.0] — Unreleased\n\n### Added\n\n- Named.\n\n## [Unreleased]\n\n### Added\n\n- Bare.\n`;
    expect(releasesFor(parseChangelog(md), '0.4.0-beta.1')[0].body).toContain('Named.');
  });
});

describe('owedReleases', () => {
  const all = parseChangelog(CHANGELOG);

  it('owes a stable update the releases since the one last seen', () => {
    expect(versions(owedReleases(releasesFor(all, '0.3.0'), '0.0.9'))).toEqual(['0.3.0', '0.1.0']);
    expect(versions(owedReleases(releasesFor(all, '0.3.0'), '0.2.0'))).toEqual(['0.3.0']);
  });

  it('owes nothing after an update whose releases only had Maintenance', () => {
    expect(owedReleases(releasesFor(all, '0.2.0'), '0.1.0')).toEqual([]);
  });

  it('owes a beta its section again after an earlier beta of the same version, and the release after the last beta', () => {
    expect(versions(owedReleases(releasesFor(all, '0.4.0-beta.2'), '0.4.0-beta.1'))).toEqual(['0.4.0-beta.2']);
    expect(versions(owedReleases(releasesFor(all, '0.3.0'), '0.3.0-beta.4'))).toEqual(['0.3.0']);
  });

  it('owes a first beta its section and any release since the stable version last seen', () => {
    expect(versions(owedReleases(releasesFor(all, '0.4.0-beta.1'), '0.1.0'))).toEqual(['0.4.0-beta.1', '0.3.0']);
  });

  it('owes nothing to a new device or after a downgrade', () => {
    expect(owedReleases(releasesFor(all, '0.3.0'), null)).toEqual([]);
    expect(owedReleases(releasesFor(all, '0.1.0'), '0.3.0')).toEqual([]);
  });
});

describe('whatsNewPages', () => {
  const rs = releasesFor(parseChangelog(CHANGELOG), '0.4.0-beta.1');

  it('gives every release its own page when nothing is owed', () => {
    expect(whatsNewPages(rs).map(versions)).toEqual([['0.4.0-beta.1'], ['0.3.0'], ['0.1.0']]);
  });

  it('puts everything owed on the first page, and the releases before it one to a page', () => {
    const owed = owedReleases(rs, '0.1.0');
    expect(whatsNewPages(rs, owed).map(versions)).toEqual([['0.4.0-beta.1', '0.3.0'], ['0.1.0']]);
  });

  it('leaves out what is owed when it comes from another reading of the changelog, as the notice gives it', () => {
    const owed = owedReleases(releasesFor(parseChangelog(CHANGELOG), '0.4.0-beta.1'), '0.3.0');
    expect(whatsNewPages(rs, owed).map(versions)).toEqual([['0.4.0-beta.1'], ['0.3.0'], ['0.1.0']]);
  });
});
