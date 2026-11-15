// What the four source audits — i18n, a11y, keyboard, orphans — all do the same way.
//
// **They were four copies.** Each grew from the one before it, so the file walk, the prose heuristic, the baseline
// read/write and the whole fresh-versus-grandfathered report were pasted forward and then drifted in small ways:
// `check-orphans` collected directory entries without an `isFile()` guard, and each script wrote its own subtly
// different baseline JSON. fallow's clone detector found 34 duplicated lines across three of them.
//
// What stays in each script is what makes it that audit: what it scans for, what a violation IS, and the sentence
// that tells a reader how to fix one. What moves here is the scaffolding around that.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Every `.ts` file under `dir`, recursively. */
export function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** True if `file` matches any of `patterns`, compared with forward slashes so the patterns read the same on Windows. */
export function matchesAny(file: string, patterns: readonly RegExp[]): boolean {
  const rel = file.split(path.sep).join('/');
  return patterns.some((p) => p.test(rel));
}

/**
 * "Looks like prose" — has a letter, and is not a bare lowercase identifier or CSS-class-shaped token.
 *
 * That second clause is what keeps tag names, class names and single symbols like `×` or `+` out of the reports.
 */
export function looksLikeProse(text: string): boolean {
  if (!/[a-zA-Z]/.test(text)) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (/^[a-z][a-z0-9-]*$/.test(trimmed) && !trimmed.includes(' ')) return false;
  return true;
}

/** The one thing every audit's finding must have: something stable to grandfather it by. */
export interface Finding {
  /** Stable across line shifts — never a line number. */
  signature: string;
}

function loadBaseline(baselinePath: string): Set<string> {
  if (!fs.existsSync(baselinePath)) return new Set();
  const data = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as {
    signatures: string[];
  };
  return new Set(data.signatures);
}

/**
 * Write the baseline: the signatures the audit compares against, and — when the audit can produce them — the same
 * findings spelled out for a person reading the file in a diff.
 *
 * `_entries_for_humans` is deliberately not read back. It exists so that grandfathering something is a visible act
 * in review rather than a line of hashes.
 */
function saveBaseline(baselinePath: string, findings: readonly Finding[], entriesForHumans?: string[]): void {
  const signatures = [...new Set(findings.map((f) => f.signature))].sort();
  const body = entriesForHumans ? { signatures, _entries_for_humans: entriesForHumans } : { signatures };
  fs.writeFileSync(baselinePath, `${JSON.stringify(body, null, 2)}\n`);
}

export interface AuditReport<T extends Finding> {
  /** Everything the scan found, grandfathered or not. */
  findings: readonly T[];
  baselinePath: string;
  /** `--update-baseline` was passed: write the file and say so, instead of judging. */
  updateBaseline: boolean;
  /** Repo root, for printing the baseline path the way a reader would type it. */
  root: string;
  /** For `--update-baseline`, the human-readable lines to store beside the signatures. */
  entriesForHumans?: (findings: readonly T[]) => string[];
  /**
   * Print the fresh findings. A callback rather than a heading-and-formatter, because the keyboard audit reports
   * two kinds in two groups with different advice under each, and flattening that into one list would lose the
   * only thing that tells a reader which fix applies.
   */
  renderFresh: (fresh: T[]) => void;
  /** How to fix one, or grandfather it. Printed after the count. */
  advice: string;
  /** The all-clear, e.g. "i18n audit". Completed as "… clean — 0 new violations, N grandfathered in the baseline." */
  cleanLabel: string;
  /**
   * What this audit calls a finding, singular. Default "violation"; the orphan audit says "orphan".
   *
   * Kept per audit rather than flattened to one word, because the word is what the report is ABOUT — an orphan is
   * a declaration nothing references, which is not a violation of anything.
   */
  noun?: string;
}

/**
 * The half of every audit that comes after the scanning: split what is new from what is grandfathered, print it,
 * and exit non-zero if anything is new.
 *
 * **`process.exit(1)` lives here, and that is the point.** Four copies of an exit code is four chances for a gate
 * to stop gating without anyone noticing — the failure mode of a lint script is that it silently passes.
 */
export function reportAudit<T extends Finding>(opts: AuditReport<T>): void {
  const { findings, baselinePath, root } = opts;
  const noun = opts.noun ?? 'violation';
  if (opts.updateBaseline) {
    saveBaseline(baselinePath, findings, opts.entriesForHumans?.(findings));
    console.log(`Wrote ${findings.length} ${noun}(s) to ${path.relative(root, baselinePath)}.`);
    return;
  }

  const baseline = loadBaseline(baselinePath);
  const fresh = findings.filter((f) => !baseline.has(f.signature));
  const grandfathered = findings.length - fresh.length;

  if (fresh.length > 0) {
    opts.renderFresh(fresh);
    console.error(`\n${fresh.length} new ${noun}(s), ${grandfathered} grandfathered in the baseline.\n${opts.advice}`);
    process.exit(1);
  }

  console.log(`${opts.cleanLabel} clean — 0 new ${noun}s, ${grandfathered} grandfathered in the baseline.`);
}
