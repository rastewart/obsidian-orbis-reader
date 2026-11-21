// The Community directory's CSS lint, run here the way its review runs it.
//
// Usage:
//   pnpm lint:css
//
// **The same check, not a lookalike.** The directory's review bot is obsidianmd/obsidian-workflows; its CSS check is
// `SCANNER_STYLELINT_CONFIG` in `src/lint.ts` (read 2026-11-21, last pushed 2026-11-17). It runs stylelint 17.6.0
// with stylelint-no-unsupported-browser-features 8.1.1 and that config alone, no shared base config, against every
// `.css` file outside its ignore list, and it targets the Electron of the oldest Obsidian the manifest allows. The
// rules below are copied from it unchanged, and package.json pins the same two versions. Every finding is a warning
// to the directory, and each one is counted in the listing's Review section, so any finding fails this.
//
// The theme-only URL rules (`function-url-scheme-*`) are kept: they are in the bot's config for plugins too.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The CSS the directory lints in this repository: its ignore list leaves out `docs/`, `test-vault/` and the rest. */
const CSS_FILES = ['styles.css'];

/** The bot's table of Obsidian versions by the Electron they ship, and its default when there is no floor. */
const ELECTRON_VERSIONS: Record<number, string> = {
  25: '1.4.5',
  28: '1.5.8',
  30: '1.6.5',
  31: '1.7.4',
  37: '1.9.12',
  39: '1.11.4',
};
const DEFAULT_ELECTRON = 39;

const versionNumber = (v: string): number => {
  const [major = 0, minor = 0, patch = 0] = v.split('.').map(Number);
  return major * 100_000 + minor * 1_000 + patch;
};

/** The newest Electron whose Obsidian is no later than `minAppVersion`, as the bot works it out. */
function minElectron(minAppVersion: string | undefined): number {
  if (!minAppVersion) return DEFAULT_ELECTRON;
  const floor = versionNumber(minAppVersion);
  let result = Math.min(...Object.keys(ELECTRON_VERSIONS).map(Number));
  for (const [electron, obsidian] of Object.entries(ELECTRON_VERSIONS)) {
    if (versionNumber(obsidian) <= floor) result = Math.max(result, Number(electron));
  }
  return result;
}

function scannerConfig(electron: number): stylelint.Config {
  return {
    plugins: ['stylelint-no-unsupported-browser-features'],
    ignoreDisables: true,
    rules: {
      'function-url-scheme-disallowed-list': [['http', 'https', 'file'], { severity: 'error' }],
      'function-url-scheme-allowed-list': ['data'],
      'declaration-no-important': [
        true,
        {
          severity: 'warning',
          message:
            'Avoid !important — override styles by increasing selector specificity or using CSS variables instead.',
        },
      ],
      'color-named': ['never', { severity: 'warning' }],
      'custom-property-no-missing-var-function': null,
      'no-duplicate-selectors': null,
      'no-duplicate-at-import-rules': null,
      'declaration-block-no-duplicate-properties': [true, { severity: 'warning' }],
      'shorthand-property-no-redundant-values': null,
      'plugin/no-unsupported-browser-features': [
        true,
        { severity: 'warning', browsers: [`electron >= ${electron}`], ignore: ['css-nesting', 'css-cascade-layers'] },
      ],
      'selector-pseudo-class-disallowed-list': [
        ['has'],
        {
          severity: 'warning',
          message: 'Avoid :has() — it can cause significant performance issues due to broad selector invalidation.',
        },
      ],
      'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global', 'local'], severity: 'warning' }],
      'selector-pseudo-element-no-unknown': [true, { severity: 'warning' }],
      'selector-type-no-unknown': [true, { ignoreTypes: [], severity: 'warning' }],
      'at-rule-no-unknown': [true, { ignoreAtRules: ['layer', 'property', 'container'], severity: 'warning' }],
      'unit-no-unknown': [true, { severity: 'warning' }],
      'property-disallowed-list': [['all'], { severity: 'warning' }],
    },
  };
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')) as { minAppVersion?: string };
  const electron = minElectron(manifest.minAppVersion);
  const { results } = await stylelint.lint({
    files: CSS_FILES.map((f) => path.join(ROOT, f)),
    config: scannerConfig(electron),
  });

  const byRule = new Map<string, string[]>();
  for (const r of results) {
    const file = path
      .relative(ROOT, r.source ?? '')
      .split(path.sep)
      .join('/');
    for (const w of r.warnings) {
      const key = `${w.rule}: ${w.text.replace(/\s*\([^)]*\)$/, '')}`;
      byRule.set(key, [...(byRule.get(key) ?? []), `${file}:${w.line}`]);
    }
  }
  const total = [...byRule.values()].reduce((n, at) => n + at.length, 0);
  console.log(`The directory's CSS lint (stylelint 17.6.0, electron >= ${electron}): ${total} finding(s)`);
  for (const [rule, at] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${String(at.length).padStart(4)}  ${rule}`);
    console.log(`        ${at.slice(0, 12).join('  ')}${at.length > 12 ? '  …' : ''}`);
  }
  process.exitCode = total > 0 ? 1 : 0;
}

void main();
