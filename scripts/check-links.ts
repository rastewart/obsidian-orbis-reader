// Markdown links that point at nothing: a file that is not there, or a heading that is not there any more.
//
// Usage:
//   pnpm lint:links
//
// **`lint:md` cannot do this.** markdownlint's MD051 validates a fragment against the headings of the file it is
// written in, and nothing else — so `other.md#old-anchor` rots in silence, and so does a link to a file somebody
// renamed.
//
// **The slug rule is GitHub's**, because that is where these files are read: lowercase, drop everything that is not a
// word character, a space or a hyphen, then spaces to hyphens. A heading keeps its punctuation in the text and loses it
// in the anchor, which is why "Open questions — closed" becomes `open-questions--closed` with two hyphens — the em dash
// vanishes and the spaces on both sides do not.
//
// **Code is stripped asymmetrically, and both halves matter.** When scanning for LINKS, inline spans go:
// `docs/design/markdown-to-epub.md` explains link resolution by writing `` `](roadmap.md#anchor)` `` in backticks,
// which is prose about a link rather than a link. When collecting HEADINGS they stay, because GitHub slugs a heading
// from its rendered text, and stripping them would report live headings as missing. Either fault is a gate that cries
// wolf, and that invites a reader to edit the documentation until the gate is quiet.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');

/** Every Markdown file the repo publishes: `docs/` and the three at the root. */
function markdownFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
    }
  };
  walk(path.join(ROOT, 'docs'));
  for (const name of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md']) {
    const full = path.join(ROOT, name);
    if (fs.existsSync(full)) out.push(full);
  }
  return out;
}

/** Fenced blocks removed — a `# comment` inside a shell example is not a heading. */
function withoutFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '');
}

/**
 * Inline spans removed too, for scanning LINKS only.
 *
 * **Never for headings.** GitHub slugs a heading from its rendered text, so `` `.setting-item` `` contributes
 * `setting-item` to the anchor. Stripping the span first would report live headings as missing — and the fix a reader
 * would reach for is editing the links to match the gate.
 */
function withoutCode(text: string): string {
  return withoutFences(text).replace(/`[^`\n]*`/g, '');
}

/** GitHub's heading slug. */
function slugOf(heading: string): string {
  const plain = heading
    .replace(/[`*_]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '');
  return plain
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Every anchor a file offers. Duplicated headings get GitHub's `-1`, `-2` suffixes. */
function anchorsOf(file: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const line of withoutFences(fs.readFileSync(file, 'utf8')).split('\n')) {
    const heading = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (!heading) continue;
    const base = slugOf(heading[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

const problems: string[] = [];
const anchorCache = new Map<string, Set<string>>();

for (const file of markdownFiles()) {
  const rel = path.relative(ROOT, file);
  const text = withoutCode(fs.readFileSync(file, 'utf8'));
  // Relative Markdown targets only: `http:`, `mailto:` and `obsidian://` are somebody else's to resolve, and a
  // bare `#fragment` is same-file, which MD051 already checks.
  for (const m of text.matchAll(/\]\(([^)\s#]*\.md)(?:#([^)\s]+))?\)/g)) {
    const [, target, fragment] = m;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      problems.push(`${rel}\n    → ${target} — no such file`);
      continue;
    }
    if (!fragment) continue;
    if (!anchorCache.has(resolved)) anchorCache.set(resolved, anchorsOf(resolved));
    if (!anchorCache.get(resolved)?.has(fragment)) {
      problems.push(`${rel}\n    → ${target}#${fragment} — the file has no heading with that anchor`);
    }
  }
}

if (problems.length > 0) {
  console.error('Broken Markdown links:\n');
  for (const p of problems) console.error(`  ${p}\n`);
  console.error(`${problems.length} broken link(s).

Point the link at what the thing is called now. If a heading was renamed, this is the only check that sees it —
MD051 validates same-file fragments only.`);
  process.exit(1);
}

console.log(`Links clean — every relative Markdown link and cross-file anchor resolves.`);
