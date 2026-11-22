// What a test file sees: the test shape, `expect`, and golden files.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Page } from './cdp';
import { ROOT } from './launch';

const GOLDEN_DIR = join(ROOT, 'e2e', 'golden');

export interface TestContext {
  page: Page;
  /** The vault folder on disk. */
  vault: string;
  /**
   * Compares `actual` with the golden file `name`. With `--update`, writes it instead. A golden file is the output a
   * person checked once and the tests hold Orbis to after.
   */
  golden(name: string, actual: string): void;
}

export interface E2eTest {
  name: string;
  run(ctx: TestContext): Promise<void>;
  /** Console errors this test expects, by a part of their text. Anything else the page reports fails the test. */
  allowErrors?: string[];
  timeoutMs?: number;
}

export class TestFailure extends Error {}

/**
 * Closes whatever dialogs are open, with Escape, as a person would. Orbis raises some on its own: the welcome on a
 * first run, and the device-locations and reading-records prompts at a book open.
 */
export async function dismissDialogs(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const open = await page.run(() => document.querySelectorAll('.modal-container').length > 0);
    if (!open) return;
    await page.press('Escape');
    await new Promise((r) => setTimeout(r, 300));
  }
}

export function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new TestFailure(message);
}

/** The first line that differs, for a failure message short enough to read. */
function firstDifference(expected: string, actual: string): string {
  const [e, a] = [expected.split('\n'), actual.split('\n')];
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if (e[i] !== a[i])
      return `line ${i + 1}\n  expected: ${e[i] ?? '(end of file)'}\n  actual:   ${a[i] ?? '(end of file)'}`;
  }
  return 'no difference';
}

export function goldenCheck(update: boolean, outDir: string): (name: string, actual: string) => void {
  return (name, actual) => {
    const path = join(GOLDEN_DIR, name);
    if (update || !existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, actual);
      if (!update) console.log(`    wrote the new golden file e2e/golden/${name}. Check it, then commit it.`);
      return;
    }
    const expected = readFileSync(path, 'utf8');
    if (expected !== actual) {
      writeFileSync(join(outDir, name), actual);
      throw new TestFailure(
        `${name} differs from its golden file, at ${firstDifference(expected, actual)}\n` +
          `  The new output is in e2e/.out/${name}. If the change is right, run pnpm e2e --update.`
      );
    }
  };
}
