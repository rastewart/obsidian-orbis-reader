// pnpm e2e [--update] [--keep] [name filter]
//
// Runs the end-to-end tests against the built plugin in a separate Obsidian (see `launch.ts`), one test after another
// in one window, and exits non-zero if any fails. `pnpm e2e` builds first, so the tests always run the code as it is.
//
//   --update   rewrite the golden files from this run's output, after checking the change is right
//   --keep     keep the run's vault and user data afterwards, to look at what a test left
//   <text>     run only the tests whose name contains it
//
// A failed test leaves a screenshot of the window in e2e/.out/, beside any output that differed from its golden file.
// See docs/design/end-to-end-tests.md.

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { launchObsidian, ROOT } from './launch';
import { dismissDialogs, type E2eTest, goldenCheck, TestFailure } from './runner';
import { bookTests } from './tests/books';
import { notesTests } from './tests/notes';

const ALL: E2eTest[] = [...bookTests, ...notesTests];
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Errors Orbis is known to report that are not yet fixed, by a part of their text. One of these is printed as seen,
 * not counted as a failure, so the run stays a reliable yes or no while the bug stays in view. Each names where it is
 * tracked; remove it with the fix.
 */
const KNOWN_ISSUES: { text: string; issue: string }[] = [];

const args = process.argv.slice(2);
const update = args.includes('--update');
const keep = args.includes('--keep');
const filter = args.find((a) => !a.startsWith('--'));
const selected = filter ? ALL.filter((t) => t.name.includes(filter)) : ALL;

const OUT = join(ROOT, 'e2e', '.out');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const slug = (name: string) => name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TestFailure(`did not finish within ${ms / 1000} s`)), ms);
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e))
    );
  });
}

async function main(): Promise<number> {
  if (!selected.length) {
    console.error(`No test name contains "${filter}".`);
    return 1;
  }
  console.log(`Starting Obsidian for ${selected.length} test(s)…`);
  const obsidian = await launchObsidian({ keep });
  const failures: string[] = [];
  try {
    for (const test of selected) {
      const started = Date.now();
      await dismissDialogs(obsidian.page);
      obsidian.page.takeErrors();
      let problem: string | null = null;
      try {
        await withTimeout(
          test.run({ page: obsidian.page, vault: obsidian.vault, golden: goldenCheck(update, OUT) }),
          test.timeoutMs ?? DEFAULT_TIMEOUT_MS
        );
        const errors = obsidian.page
          .takeErrors()
          .filter((e) => !(test.allowErrors ?? []).some((allowed) => e.text.includes(allowed)));
        const known = KNOWN_ISSUES.filter((k) => errors.some((e) => e.text.includes(k.text)));
        const unknown = errors.filter((e) => !KNOWN_ISSUES.some((k) => e.text.includes(k.text)));
        for (const k of known) console.log(`    known issue seen: ${k.issue}`);
        if (unknown.length) {
          problem = `the page reported ${unknown.length} error(s)\n  ${unknown.map((e) => e.text).join('\n  ')}`;
        }
      } catch (e) {
        problem = e instanceof TestFailure ? e.message : e instanceof Error ? (e.stack ?? e.message) : String(e);
      }
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (problem) {
        failures.push(test.name);
        await obsidian.page.screenshot(join(OUT, `${slug(test.name)}.png`)).catch(() => undefined);
        console.log(`  ✗ ${test.name} (${seconds} s)\n    ${problem.replace(/\n/g, '\n    ')}`);
      } else {
        console.log(`  ✓ ${test.name} (${seconds} s)`);
      }
    }
  } finally {
    await obsidian.close();
  }
  console.log(
    failures.length
      ? `\n${failures.length} of ${selected.length} failed. Screenshots and output are in e2e/.out/.`
      : `\nAll ${selected.length} passed.`
  );
  return failures.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : e);
    process.exit(1);
  }
);
