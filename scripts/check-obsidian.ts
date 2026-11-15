// The Obsidian plugin lint (eslint-plugin-obsidianmd's recommended set), with a count of where its findings are.
//
// Usage:
//   pnpm lint:obsidian
//
// **The same lint as `eslint src`**, same output, same exit code — an error fails it, a warning does not. What it adds
// is a last block that splits the findings between the code that ships and the tests and mocks, rule by rule.
//
// **Why split them.** The rules stay on for tests, but most of what they find there is a jsdom fixture doing what only
// a real Obsidian window should not — `document.createElement`, a bare `setTimeout`. Those are well over a hundred, and
// the handful in shipping code that crept in since a sweep could not be seen among them in one total.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');

/** Tests and the Obsidian mock they run against — everything else under `src` is in `main.js`. */
const NOT_SHIPPED = /^src\/(__tests__|__mocks__)\//;

interface Tally {
  errors: number;
  warnings: number;
  rules: Map<string, number>;
}

function tally(results: ESLint.LintResult[]): Tally {
  const t: Tally = { errors: 0, warnings: 0, rules: new Map() };
  for (const r of results) {
    t.errors += r.errorCount;
    t.warnings += r.warningCount;
    for (const m of r.messages) {
      const rule = m.ruleId ?? '(parse)';
      t.rules.set(rule, (t.rules.get(rule) ?? 0) + 1);
    }
  }
  return t;
}

function report(label: string, t: Tally): void {
  console.log(
    `  ${label.padEnd(16)} ${t.errors} error${t.errors === 1 ? '' : 's'}, ${t.warnings} warning${t.warnings === 1 ? '' : 's'}`
  );
  for (const [rule, n] of [...t.rules].sort((a, b) => b[1] - a[1]))
    console.log(`    ${String(n).padStart(4)}  ${rule}`);
}

async function main(): Promise<void> {
  const eslint = new ESLint({ cwd: ROOT });
  const results = await eslint.lintFiles(['src']);
  const text = await (await eslint.loadFormatter('stylish')).format(results);
  if (text) console.log(text);

  const rel = (r: ESLint.LintResult): string => path.relative(ROOT, r.filePath).split(path.sep).join('/');
  console.log('Where the findings are:');
  report('Shipping code', tally(results.filter((r) => !NOT_SHIPPED.test(rel(r)))));
  report('Tests and mocks', tally(results.filter((r) => NOT_SHIPPED.test(rel(r)))));

  process.exitCode = results.some((r) => r.errorCount > 0) ? 1 : 0;
}

void main();
