// What's new: the release notes a reader sees, read from CHANGELOG.md.
//
// **The changelog itself, built into main.js.** Only `main.js`, `manifest.json` and `styles.css` reach a vault, so
// `esbuild.config.mjs` puts the file's text in the bundle (`__ORBIS_CHANGELOG__`). The notes then always describe
// the build that is installed, they work offline, and showing them sends nothing anywhere. The changelog is written
// for readers, so it is the notes, not a source for a second list written by hand.
//
// **`### Maintenance` is left out.** Lines a reader has no use for — changes made for the Community directory's
// review, the test fixtures, a check of the guide — go under that heading. The changelog and the GitHub release keep
// them; the dialog drops them, and a release with nothing else says nothing after an update.
//
// **A beta shows its version's section.** A beta has no section of its own: every beta of 0.2.0 writes into
// `## [0.2.0] — Unreleased`, which `pnpm bump` dates at the release. So a beta shows that section, labeled with the
// beta, above the releases before it; a stable version shows releases only. See docs/design/first-run.md.
//
// Kept free of Obsidian, so the rules can be tested.

declare const __ORBIS_CHANGELOG__: string;

/** CHANGELOG.md as it was when this build was made, or '' in a test, where nothing defines it. */
export const CHANGELOG: string = typeof __ORBIS_CHANGELOG__ !== 'undefined' ? __ORBIS_CHANGELOG__ : '';

/** One release's notes. */
export interface Release {
  /** `0.1.8`. Null only for a bare `## [Unreleased]` heading before `releasesFor` gives it the beta's version. */
  version: string | null;
  /** `2026-11-24`, or null while the section is not released. */
  date: string | null;
  /** The beta this section was shown for — `2` for `0.2.0-beta.2`. Set by `releasesFor` only. */
  beta?: number;
  /** The section's Markdown without its heading, HTML comments, `### Maintenance` or empty subsections. */
  body: string;
}

/** The subsection a reader never sees. */
const MAINTENANCE = 'maintenance';

/** `## [0.1.8] — 2026-11-24`, `## [0.2.0] — Unreleased` or `## [Unreleased]`. */
const RELEASE_HEADING = /^## \[([^\]]+)\](?:\s+[—–-]\s+(.+?))?\s*$/;

/** Every section of the changelog, newest first, as the file has them. */
export function parseChangelog(md: string): Release[] {
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const releases: Release[] = [];
  let open: { label: string; when: string | undefined; lines: string[] } | null = null;
  const close = () => {
    if (!open) return;
    const unreleased = open.label === 'Unreleased' || open.when === 'Unreleased';
    releases.push({
      version: open.label === 'Unreleased' ? null : open.label,
      date: unreleased ? null : (open.when ?? null),
      body: readerBody(open.lines),
    });
    open = null;
  };
  for (const line of lines) {
    const m = RELEASE_HEADING.exec(line);
    if (m) {
      close();
      open = { label: m[1].trim(), when: m[2]?.trim(), lines: [] };
    } else if (line.startsWith('## ')) {
      close();
    } else {
      open?.lines.push(line);
    }
  }
  close();
  return releases;
}

/** A section's lines with `### Maintenance` and any subsection left empty taken out. */
function readerBody(lines: readonly string[]): string {
  const parts: { heading: string | null; lines: string[] }[] = [{ heading: null, lines: [] }];
  for (const line of lines) {
    if (line.startsWith('### ')) parts.push({ heading: line, lines: [] });
    else parts[parts.length - 1].lines.push(line);
  }
  const kept = parts.filter((part) => {
    const text = part.lines.join('\n').trim();
    if (!part.heading) return text !== '';
    return text !== '' && part.heading.slice(4).trim().toLowerCase() !== MAINTENANCE;
  });
  return kept
    .map((part) => [part.heading, part.lines.join('\n').trim()].filter((s) => s).join('\n\n'))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A version as it is installed: `0.2.0`, or `0.2.0-beta.3`. Null when it is neither. */
interface Installed {
  base: string;
  beta: number | null;
}

function parseInstalled(version: string): Installed | null {
  const m = /^(\d+\.\d+\.\d+)(?:-beta\.(\d+))?$/.exec(version);
  return m ? { base: m[1], beta: m[2] === undefined ? null : Number(m[2]) } : null;
}

/** Negative, zero or positive, as `a` is lower than, equal to or higher than `b` — both `x.y.z`. */
function compare(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/**
 * The releases a reader of `current` can see, newest first, without those left empty by Maintenance.
 *
 * - **A stable version** gets every dated release up to and including itself. An `Unreleased` section is work for
 *   the next version, not part of this one.
 * - **A beta** gets its version's unreleased section, labeled with the beta, and then every release before its
 *   version. The section is `## [0.2.0] — Unreleased`, or a bare `## [Unreleased]` when no version is written yet.
 */
export function releasesFor(all: readonly Release[], current: string): Release[] {
  const installed = parseInstalled(current);
  const dated = all.filter((r) => r.version !== null && r.date !== null && parseInstalled(r.version) !== null);
  if (!installed) return dated.filter((r) => r.body);
  const { base, beta } = installed;
  const earlier = dated.filter((r) => {
    const order = compare(r.version as string, base);
    return beta === null ? order <= 0 : order < 0;
  });
  if (beta === null) return earlier.filter((r) => r.body);
  const unreleased =
    all.find((r) => r.date === null && r.version === base) ?? all.find((r) => r.date === null && r.version === null);
  const own: Release[] = unreleased ? [{ ...unreleased, version: base, beta }] : [];
  return [...own, ...earlier].filter((r) => r.body);
}

/**
 * Of `releases` (from `releasesFor`), the ones a device that last saw `seen` has not been told about.
 *
 * Newer than `seen`'s version, or its own version when `seen` was a beta of it: from one beta to the next, or from
 * the last beta to the release, the section has grown since it was read. Empty for a device that has seen nothing —
 * that one is welcomed instead — and for a downgrade.
 */
export function owedReleases(releases: readonly Release[], seen: string | null): Release[] {
  const last = seen === null ? null : parseInstalled(seen);
  if (!last) return [];
  return releases.filter((r) => {
    const order = compare(r.version as string, last.base);
    return order > 0 || (order === 0 && last.beta !== null);
  });
}

/**
 * The dialog's pages, each one or more releases.
 *
 * After an update, the first page holds everything the reader has not seen, so nothing new is a button away; the
 * releases before it follow one to a page. Opened from settings, every page is one release.
 */
export function whatsNewPages(releases: readonly Release[], owed: readonly Release[] = []): Release[][] {
  if (owed.length === 0) return releases.map((r) => [r]);
  return [[...owed], ...releases.filter((r) => !owed.includes(r)).map((r) => [r])];
}
