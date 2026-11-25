// pnpm e2e [--update] [--keep] [name filter]
//
// Runs the end-to-end tests against the built plugin in a separate Obsidian (see `launch.ts`), one test after another
// in one window, and exits non-zero if any fails. `pnpm e2e` builds first, so the tests always run the code as it is.
//
//   --update   rewrite the golden files from this run's output, after checking the change is right
//   --keep     keep the run's vault and user data afterwards, to look at what a test left
//   <text>...  run only the tests whose name contains one of these
//
// A failed test leaves a screenshot of the window in e2e/.out/, beside any output that differed from its golden file.
// See docs/design/end-to-end-tests.md.

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { within } from './cdp';
import { closeEveryTab, restoreSettings, settingsSnapshot } from './in-page';
import { launchObsidian, ROOT } from './launch';
import { dismissDialogs, type E2eTest, goldenCheck, TestFailure } from './runner';
import { bookTests } from './tests/books';
import { checkTests } from './tests/checks';
import { commandTests } from './tests/commands';
import { conversionTests } from './tests/conversions';
import { displayTests } from './tests/display';
import { epubTests } from './tests/epubs';
import { existsTests } from './tests/exists';
import { libraryTests } from './tests/library';
import { linkTests } from './tests/links';
import { marksTests } from './tests/marks';
import { navigationTests } from './tests/navigation';
import { notesTests } from './tests/notes';
import { placeTests } from './tests/place';
import { recordsTests } from './tests/records';
import { resilienceTests } from './tests/resilience';
import { searchTests } from './tests/search';
import { syncTests } from './tests/sync';
import { whatsNewTests } from './tests/whats-new';

// The commands run last: a command can change a setting, and the other tests start from the defaults.
const ALL: E2eTest[] = [
  ...bookTests,
  ...placeTests,
  ...navigationTests,
  ...notesTests,
  ...marksTests,
  ...conversionTests,
  ...epubTests,
  ...existsTests,
  ...searchTests,
  ...checkTests,
  ...linkTests,
  ...displayTests,
  ...resilienceTests,
  ...recordsTests,
  ...libraryTests,
  ...syncTests,
  ...whatsNewTests,
  ...commandTests,
];
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Settings Orbis changes by itself, which the runner leaves as they are after a test: the version it last greeted
 * this device with, the clock its sync keeps (which only ever moves forward), and the shipped preset it installs
 * again whenever it loads. Putting them back would only make Orbis write them again.
 */
const OWN_BOOKKEEPING = ['orbis-seen-version', 'orbis-sync-clock', 'annotationPresets'];

/**
 * Errors Orbis is known to report that are not yet fixed, by a part of their text. One of these is printed as seen,
 * not counted as a failure, so the run stays a reliable yes or no while the bug stays in view. Each names where it is
 * tracked; remove it with the fix.
 */
const KNOWN_ISSUES: { text: string; issue: string }[] = [];

const args = process.argv.slice(2);
const update = args.includes('--update');
const keep = args.includes('--keep');
const filters = args.filter((a) => !a.startsWith('--'));
const selected = filters.length ? ALL.filter((t) => filters.some((f) => t.name.includes(f))) : ALL;

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
    console.error(`No test name contains ${filters.map((f) => `"${f}"`).join(' or ')}.`);
    return 1;
  }
  console.log(`Starting Obsidian for ${selected.length} test(s)…`);
  const obsidian = await launchObsidian({ keep });
  const failures: string[] = [];
  try {
    for (const test of selected) {
      const started = Date.now();
      await dismissDialogs(obsidian.page);
      await obsidian.page.run(closeEveryTab);
      obsidian.page.takeErrors();
      const settings = await obsidian.page.run(settingsSnapshot);
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
        const frozen = !(await obsidian.page.responsive(5_000));
        if (frozen)
          problem += '\n  Obsidian stopped responding: its window runs no script, as when a layout never ends';
        else {
          await within(
            obsidian.page.screenshot(join(OUT, `${slug(test.name)}.png`)).catch(() => undefined),
            5_000,
            undefined
          );
        }
        console.log(`  ✗ ${test.name} (${seconds} s)\n    ${problem.replace(/\n/g, '\n    ')}`);
        if (frozen) {
          const notRun = selected.slice(selected.indexOf(test) + 1);
          if (notRun.length) console.log(`  Not run, because Obsidian froze: ${notRun.map((t) => t.name).join(', ')}`);
          break;
        }
      } else {
        console.log(`  ✓ ${test.name} (${seconds} s)`);
      }
      // Whatever settings the test changed go back, so the next test starts from the same ones. After the screenshot,
      // which shows the window as the test left it, and never after a freeze, which ended the run above.
      const restored = await obsidian.page
        .run(restoreSettings, settings, OWN_BOOKKEEPING)
        .catch((e: Error) => [`(could not put them back: ${e.message})`]);
      if (process.env.ORBIS_E2E_SHOW_RESTORED && restored.length)
        console.log(`    settings put back: ${restored.join(', ')}`);
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
