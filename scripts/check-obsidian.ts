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
//
// **Then the vendored libraries, against the Community directory's rules.** `eslint.config.mjs` leaves `src/vendor`
// out: each library is written to its own project's standards and breaks dozens of general rules (`no-empty`,
// `no-redeclare`) that say nothing about running in Obsidian. The directory's review scans every file in the
// repository, though, and reports an error from Obsidian's own rules (`obsidianmd/*`), the HTML-injection rules
// (`no-unsanitized/*`) and the directive-comment rules (`eslint-comments/*`) wherever it is. So the vendored
// JavaScript is linted with the same recommended set, only errors from those three are kept, and any one fails this.
// foliate-js is linted the same way. It comes from Orbis's fork, so it is not in the repository for the review to
// scan, but it is built into main.js, and its patches 31 to 36 were written to pass these rules.
//
// **Last, any literal assigned to a style, the way the directory's review reads `no-static-styles-assignment`.** From
// eslint-plugin-obsidianmd 0.5, the rule lets an assignment of `''` or `null` through, since it clears a style. The
// review of 0.1.1 reported `el.style.padding = ''` all the same: it runs the rule as it was up to 0.4, which flags
// every literal. So the code that ships and the vendored code are checked for that too. To clear a style, use
// `style.removeProperty('padding')`, which no version flags. `prefer-create-el` is read the same way: from 0.5 it
// reports `createElement` only on the global `document`, and the review of 0.1.9's main branch still reported
// `doc.createElement('canvas')`. So the code that ships is checked for `createElement` on any document.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Rule } from 'eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');

/** Tests and the Obsidian mock they run against — everything else under `src` is in `main.js`. */
const NOT_SHIPPED = /^src\/(__tests__|__mocks__)\//;

/**
 * The files of Orbis's foliate-js fork that are built into main.js: those `view.js` reaches. The fork keeps upstream's
 * other files for merging, but Orbis never loads them.
 */
const FOLIATE_FILES = [
  'comic-book',
  'epub',
  'epubcfi',
  'fb2',
  'fixed-layout',
  'mobi',
  'overlayer',
  'paginator',
  'progress',
  'search',
  'text-walker',
  'tts',
  'view',
  'vendor/fflate',
  'vendor/zip',
].map((name) => `node_modules/foliate-js/${name}.js`);

/**
 * The third-party JavaScript Orbis builds in: the vendored libraries, and the foliate-js fork, which is installed as a
 * package but is Orbis's to keep clean. `tsconfig.vendor.json` gives the type-aware rules a program.
 */
const VENDOR_FILES = ['src/vendor/**/*.js', ...FOLIATE_FILES];

/** The rules whose errors the Community directory's review reports in vendored code. */
const DIRECTORY_RULES = /^(obsidianmd|no-unsanitized|eslint-comments)\//;

/**
 * Files whose `console` calls the directory's review of 0.1.0 did not report, though the same rules find them: lamejs's
 * `System.out` shim, and the default `print` in piper's Emscripten build. Both libraries are kept as upstream ships
 * them, so these are left as they are. Any other error in either file still counts.
 */
const CONSOLE_NOT_REPORTED = new Set(['src/vendor/lamejs/common.js', 'src/vendor/piper-phonemize.js']);

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

  const vendorErrors = await lintVendor(rel);
  const literalStyles = await lintLiteralStyles(rel);

  process.exitCode = results.some((r) => r.errorCount > 0) || vendorErrors > 0 || literalStyles > 0 ? 1 : 0;
}

/** `el.style.x = <any literal>` or `el.style[x] = <any literal>`, `''` and `null` included: the rule as it was to 0.4. */
const literalStyleRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      literal:
        "A literal assigned to a style, which the directory's review reports even when it is '' — clear a style with " +
        "style.removeProperty('…'), or give the fixed value a CSS class",
    },
  },
  create: (context) => ({
    AssignmentExpression(node) {
      const { left, right } = node;
      if (right.type !== 'Literal' || left.type !== 'MemberExpression') return;
      const owner = left.object;
      if (
        owner.type === 'MemberExpression' &&
        !owner.computed &&
        owner.property.type === 'Identifier' &&
        owner.property.name === 'style'
      )
        context.report({ node, messageId: 'literal' });
    },
  }),
};

/**
 * `x.createElement(…)` on any document: `prefer-create-el` as it was to 0.4. From 0.5 the rule reports it only on the
 * global `document`, so `doc.createElement('canvas')` passes `eslint src` and the directory's review still reports it.
 * Use Obsidian's `createEl`, or, in a document that has none, `createElementNS(HTML_NS, …)` (see `book-element.ts`).
 */
const createElementRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      createElement:
        "createElement, which the directory's review reports on any document — use createEl, or " +
        'createElementNS(HTML_NS, …) in a document Obsidian does not own',
    },
  },
  create: (context) => ({
    CallExpression(node) {
      const { callee } = node;
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'createElement'
      )
        context.report({ node, messageId: 'createElement' });
    },
  }),
};

/**
 * Checks the code that ships and the vendored code for literal style assignments, and the code that ships for
 * `createElement`: the two rules the directory's review runs as they were to 0.4. Returns how many there are. The
 * foliate fork is checked for styles only, since the review does not scan it and its frames have no `createEl`.
 */
async function lintLiteralStyles(rel: (r: ESLint.LintResult) => string): Promise<number> {
  const eslint = new ESLint({
    cwd: ROOT,
    // ESLint skips node_modules unless told not to, and the foliate fork is installed there.
    ignore: false,
    overrideConfigFile: true,
    overrideConfig: [
      { ignores: ['src/__tests__/**', 'src/__mocks__/**'] },
      { files: ['src/**/*.ts'], languageOptions: { parser: tseslint.parser } },
      {
        files: ['src/**/*.{ts,js}', ...FOLIATE_FILES],
        linterOptions: { reportUnusedDisableDirectives: 'off' },
        plugins: { orbis: { rules: { 'literal-style': literalStyleRule, 'create-element': createElementRule } } },
        rules: { 'orbis/literal-style': 'error' },
      },
      { files: ['src/**/*.{ts,js}'], rules: { 'orbis/create-element': 'error' } },
    ],
  });
  const kept = (await eslint.lintFiles(['src', ...FOLIATE_FILES]))
    // `ignore: false` turns off the `ignores` above as well, so the tests and mocks are left out here.
    .filter((r) => !NOT_SHIPPED.test(rel(r)))
    .map((r) => {
      const messages = r.messages.filter((m) => m.ruleId?.startsWith('orbis/') || m.fatal);
      return {
        ...r,
        messages,
        errorCount: messages.length,
        fatalErrorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
      };
    })
    .filter((r) => r.messages.length > 0);
  const errors = kept.reduce((n, r) => n + r.errorCount, 0);

  console.log(
    "\nLiteral style assignments and createElement, as the directory's review reads them (shipping and vendored code):"
  );
  if (errors === 0) {
    console.log('  0 errors');
    return 0;
  }
  console.log(await (await eslint.loadFormatter('stylish')).format(kept));
  for (const r of kept) console.log(`  ${rel(r)}: ${r.errorCount}`);
  return errors;
}

/** Lints the vendored JavaScript and prints the errors the directory would report. Returns how many there are. */
async function lintVendor(rel: (r: ESLint.LintResult) => string): Promise<number> {
  const eslint = new ESLint({
    cwd: ROOT,
    // ESLint skips node_modules unless told not to, and the foliate fork is installed there.
    ignore: false,
    overrideConfigFile: true,
    overrideConfig: [
      ...obsidianmd.configs.recommended,
      {
        files: VENDOR_FILES,
        languageOptions: { parserOptions: { project: './tsconfig.vendor.json', tsconfigRootDir: ROOT } },
      },
    ],
  });
  const kept = (await eslint.lintFiles(VENDOR_FILES))
    .map((r) => {
      const consoleAllowed = CONSOLE_NOT_REPORTED.has(rel(r));
      const messages = r.messages.filter(
        (m) =>
          m.severity === 2 &&
          // A message with no rule is a file that did not parse, which the directory could not scan either.
          (m.ruleId === null || DIRECTORY_RULES.test(m.ruleId)) &&
          !(consoleAllowed && m.message.startsWith('[no-console]'))
      );
      return {
        ...r,
        messages,
        errorCount: messages.length,
        fatalErrorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
      };
    })
    .filter((r) => r.messages.length > 0);
  const errors = kept.reduce((n, r) => n + r.errorCount, 0);

  console.log("\nVendored libraries and the foliate-js fork, the directory's rules only:");
  if (errors === 0) {
    console.log('  0 errors');
    return 0;
  }
  console.log(await (await eslint.loadFormatter('stylish')).format(kept));
  for (const r of kept) console.log(`  ${rel(r)}: ${r.errorCount}`);
  return errors;
}

void main();
