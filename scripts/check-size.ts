// A ratchet on file size, because a design doc asking for small files does not keep them small.
//
// **Why a gate.** Big files grow by accretion — a few lines per commit, with no bad commit to catch. A rule that
// asks a person to notice is a rule that loses to fifty small conveniences.
//
// So the mechanism is a committed number, and a gate that fails. The four source audits work the same way.
//
// **The ratchet turns both ways, and the second direction is the point.** Over budget fails, obviously. But a file
// that has shrunk well below its budget ALSO fails, asking for the budget to be tightened — because otherwise an
// extraction leaves slack behind and the slack gets silently re-spent.
//
// Run: `pnpm lint:size`, or `pnpm lint:size --update-budget` to record the current sizes.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSourceFiles, matchesAny } from './audit-lib';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const SRC_DIR = path.join(ROOT, 'src');
const BUDGET_PATH = path.join(SCRIPT_DIR, 'size-budget.json');
const UPDATE = process.argv.includes('--update-budget');

/**
 * Only files big enough for accretion to be the risk are budgeted. Below this, a file is small enough that
 * growth is ordinary work rather than a slope, and 200 entries nobody reads is its own kind of unenforced rule.
 *
 * A file crossing the threshold for the first time is a real event — that is a module becoming one of the places
 * things get wired — so it fails until someone records it deliberately.
 */
const THRESHOLD = 900;

/**
 * How far under budget a file may sit before the budget must be tightened.
 *
 * Not zero, or deleting a comment would fail the build. Small, because this is the only slack the ratchet leaks:
 * at most 20 lines per file can be re-spent without anyone deciding to.
 */
const SLACK = 20;

/**
 * Exempt, and each for a reason that is about the file rather than about its size.
 *
 * - `i18n/` is a string table. Every user-facing string is *supposed* to land there, and a gate that fires on
 *   writing one is a gate that teaches people to skip `t()`.
 * - `__tests__/` should grow. The whole point of extracting logic out of the big files is to make more of it
 *   testable; punishing the tests that result would be backwards.
 * - `vendor/` is not ours.
 */
const EXEMPT = [/\/i18n\//, /\/__tests__\//, /\/vendor\//];

type Budget = Record<string, number>;

function loadBudget(): Budget {
  if (!fs.existsSync(BUDGET_PATH)) return {};
  return JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8')) as Budget;
}

function relKey(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function lineCount(file: string): number {
  return fs.readFileSync(file, 'utf8').split('\n').length;
}

function main(): void {
  const files = listSourceFiles(SRC_DIR).filter((f) => !matchesAny(f, EXEMPT));
  const sizes = new Map<string, number>();
  for (const f of files) {
    const n = lineCount(f);
    if (n >= THRESHOLD) sizes.set(relKey(f), n);
  }

  if (UPDATE) {
    const next: Budget = {};
    for (const key of [...sizes.keys()].sort()) next[key] = sizes.get(key) as number;
    fs.writeFileSync(BUDGET_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Recorded ${Object.keys(next).length} file budget(s) in ${path.relative(ROOT, BUDGET_PATH)}.`);
    return;
  }

  const budget = loadBudget();
  const over: string[] = [];
  const slack: string[] = [];
  const fresh: string[] = [];

  for (const [key, n] of [...sizes].sort()) {
    const cap = budget[key];
    if (cap === undefined) {
      fresh.push(`  ${key}  ${n} lines — crossed ${THRESHOLD} and has no budget`);
    } else if (n > cap) {
      over.push(`  ${key}  ${n} lines, budget ${cap}  (+${n - cap})`);
    } else if (n < cap - SLACK) {
      slack.push(`  ${key}  ${n} lines, budget ${cap}  (${cap - n} of slack to give back)`);
    }
  }

  // A budgeted file that dropped below the threshold, or was deleted: its entry is dead weight.
  const gone = Object.keys(budget).filter((k) => !sizes.has(k));

  if (over.length || fresh.length || slack.length || gone.length) {
    if (over.length) {
      console.error('Over budget:\n');
      console.error(over.join('\n'));
      console.error(
        '\nMove the new code to a file that owns it rather than to the file that happened to be open. If the\n' +
          'growth is genuinely where it belongs, raise the budget with "pnpm lint:size --update-budget" — which is\n' +
          'a visible line in the diff, and that is the whole point.'
      );
    }
    if (slack.length) {
      console.error(`${over.length ? '\n' : ''}Shrunk — tighten the budget:\n`);
      console.error(slack.join('\n'));
      console.error(
        '\nRun "pnpm lint:size --update-budget". Left alone, the slack an extraction earned gets spent again by\n' +
          'the next feature, which is exactly how the reader view went from 2,843 back to 4,553 in nineteen days.'
      );
    }
    if (fresh.length) {
      console.error(`${over.length || slack.length ? '\n' : ''}New file over the threshold:\n`);
      console.error(fresh.join('\n'));
      console.error('\nRecord it with "pnpm lint:size --update-budget" if this file really is one of the big ones.');
    }
    if (gone.length) {
      console.error(`${over.length || slack.length || fresh.length ? '\n' : ''}Budgeted but no longer large:\n`);
      console.error(gone.map((k) => `  ${k}`).join('\n'));
      console.error('\nRun "pnpm lint:size --update-budget" to drop the entry.');
    }
    process.exit(1);
  }

  const total = [...sizes.values()].reduce((a, b) => a + b, 0);
  console.log(`Size ratchet clean — ${sizes.size} file(s) at or under budget, ${total.toLocaleString()} lines.`);
}

main();
