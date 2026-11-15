// Audits for declarations nothing references: translation keys in src/i18n/en.ts, and `orbis-*` CSS classes in
// styles.css. Neither is covered by anything else — `fallow` reads TypeScript exports, not stylesheets or
// translation tables, so both drift silently and both had accumulated by the time anyone looked (163 keys and 118
// classes, most of them false positives, which is the whole reason this needs a whitelist rather than a grep).
//
// Usage:
//   pnpm lint:orphans                    — fail if any NEW (non-baselined) orphan exists
//   pnpm lint:orphans --update-baseline  — regenerate scripts/orphan-audit-baseline.json
//
// It checks BOTH directions, and the second is the more dangerous one: an unused rule is dead weight, a class the
// code applies with no rule behind it is an element that silently renders unstyled. A typo in a `cls:` string has
// no compiler and no visible failure — it just quietly does nothing.
//
// **A name built at runtime is not an orphan.** `t(`presets.builtin_mark_${key}`)` and
// `` `orbis-search-kind--${kind}` `` are real uses that no literal search can see, so DYNAMIC_PREFIXES lists the
// stems those templates produce. Adding a prefix there is the correct fix when the audit is wrong; deleting a
// live key because the audit said so is not.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSourceFiles, reportAudit } from './audit-lib';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const SRC_DIR = path.join(ROOT, 'src');
const EN_PATH = path.join(SRC_DIR, 'i18n', 'en.ts');
const CSS_PATH = path.join(ROOT, 'styles.css');
const BASELINE_PATH = path.join(SCRIPT_DIR, 'orphan-audit-baseline.json');

const UPDATE_BASELINE = process.argv.includes('--update-baseline');

/**
 * Stems whose full names are assembled at runtime, so no literal reference exists.
 *
 * Each entry has to be justifiable by pointing at the template that builds it — that is what stops this list
 * becoming a place to hide genuine orphans.
 */
const DYNAMIC_PREFIXES = [
  // t(`presets.builtin_mark_${key}`) — AnnotationPresetsModal, main.ts
  'presets.builtin_mark_',
];

/**
 * Suffixes a helper appends to a key that IS referenced literally.
 *
 * `plural()` in EpubExportModal does `` t(`${key}_one` as TranslationKey) ``, so ANY `<key>_one` may be reached
 * that way — which is why this is a suffix rule and not a list of the twelve that happen to exist today. Note the
 * cast: it is what lets an assembled key past the `TranslationKey` union, and therefore what makes this rule
 * necessary rather than paranoid. (Some `_one` keys are also written literally, e.g. `presets.delete_body_one`;
 * those never reach this check.)
 *
 * **Only when the key it is appended to is used.** A blanket suffix rule excused every `_one` key whatever became of
 * its stem, and `pron_discover.body_one` sat unused behind it with no `pron_discover.body` anywhere. The helper is
 * handed the stem, so the stem's literal use is the evidence the suffixed key can be reached.
 */
const DYNAMIC_SUFFIXES = ['_one'];

/**
 * Namespaces that exist to be READ BY TRANSLATORS, not by code.
 *
 * `docs/design/localization.md` puts every template token under `tokens.*` and every frontmatter key under
 * `frontmatter.*` "for documentation purposes", so a contributor writing a locale file can see the canonical
 * names and populate `tokenAliases` / `frontmatterAliases` — which is what the resolvers actually read. Nothing
 * in `src/` references these, and nothing should.
 *
 * A different justification from the two lists above, and kept separate on purpose: one says "the name is
 * assembled", this says "the name is documentation". Merging them would let either excuse cover the other.
 */
const DOCUMENTATION_PREFIXES = ['tokens.', 'frontmatter.'];

/**
 * CSS class stems composed per value, so the full name never appears as a literal.
 *
 * `orbis-search-kind--${hit.kind}` in SearchController, `orbis-diff-row-${kind}` in NotesDiffModal. The second
 * was found the hard way: its rules stayed off the unused list only because a COMMENT happened to name them, so
 * tidying that comment would have made two live rules look dead. A text match is evidence of a mention, not of a
 * use — which is the whole reason this list has to be maintained deliberately.
 */
const DYNAMIC_CLASS_PREFIXES = ['orbis-search-kind--', 'orbis-diff-row-'];

interface Orphan {
  kind: 'i18n' | 'css' | 'missing';
  name: string;
  /** Stable across line moves — the name alone, since that is what identifies it. */
  signature: string;
}

/** Every .ts file except the translation table itself, concatenated — the haystack a literal use must appear in. */
function sourceBlob(): string {
  return listSourceFiles(SRC_DIR)
    .filter((f) => f !== EN_PATH)
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
}

function isExemptKey(key: string, used: (key: string) => boolean): boolean {
  if (DYNAMIC_PREFIXES.some((p) => key.startsWith(p))) return true;
  if (DOCUMENTATION_PREFIXES.some((p) => key.startsWith(p))) return true;
  return DYNAMIC_SUFFIXES.some((suffix) => key.endsWith(suffix) && used(key.slice(0, -suffix.length)));
}

function findI18nOrphans(blob: string): Orphan[] {
  const keys = [...fs.readFileSync(EN_PATH, 'utf8').matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1]);
  const used = (k: string) => blob.includes(`'${k}'`) || blob.includes(`"${k}"`);
  return keys
    .filter((k) => !isExemptKey(k, used) && !used(k))
    .map((name) => ({
      kind: 'i18n' as const,
      name,
      signature: `i18n:${name}`,
    }));
}

/**
 * Classes the code applies that the stylesheet never defines — the OPPOSITE direction, and the more dangerous one:
 * an unused rule is dead weight, a missing rule is an element that silently renders unstyled. A typo in a `cls:`
 * string has no compiler and no visible error; it just quietly does nothing.
 *
 * Only `orbis-*` names are considered. Obsidian's own classes (`mod-cta`, `setting-item`, `dropdown`, `is-mobile`)
 * are applied by us and defined in app.css, which this cannot see and should not try to.
 *
 * **A class with no rule is not automatically a bug.** Some exist purely as query hooks — `.orbis-popup-close-btn`
 * is how the reading keys tell "a dialog is open" — and carry no appearance at all. Those belong in the baseline,
 * not in a whitelist: they are individually justified, not a pattern.
 */
function findMissingCssRules(blob: string, css: string): Orphan[] {
  const defined = definedClasses(css);
  // Only strings in a CLASS POSITION. `orbis-` is the plugin's whole namespace — command ids
  // (`orbis-clear-selection`), localStorage keys (`orbis-columns`), view types (`orbis-data`) all share it — so
  // scanning for the prefix alone reported 185 "missing classes", nearly none of which were classes. What
  // identifies a class is where the string is used, not what it looks like.
  const CLASS_SITES = [
    /\bcls:\s*'([^']*)'/g, // createEl / createDiv options
    /\bcls:\s*`([^`]*)`/g,
    /\b(?:addClass|removeClass|toggleClass)\(\s*'([^']*)'/g, // Obsidian's HTMLElement helpers
    /\bclassList\.(?:add|remove|toggle|contains)\(\s*'([^']*)'/g,
    /\bclassName\s*=\s*'([^']*)'/g,
    /\b(?:querySelector|querySelectorAll|closest|matches)\(\s*'\.([^']*)'/g, // a selector names classes too
  ];
  const applied = new Set<string>();
  for (const re of CLASS_SITES) {
    for (const m of blob.matchAll(re)) {
      // One attribute can hold several classes, and a selector can chain them.
      for (const token of m[1].split(/[\s.,>+~]+/)) {
        if (/^orbis-[a-z0-9-]+$/.test(token)) applied.add(token);
      }
    }
  }
  return [...applied]
    .filter((c) => !defined.has(c) && !DYNAMIC_CLASS_PREFIXES.some((p) => c.startsWith(p)))
    .sort()
    .map((name) => ({
      kind: 'missing' as const,
      name,
      signature: `missing:${name}`,
    }));
}

/**
 * The class names the stylesheet actually DEFINES.
 *
 * Comments are stripped first, because this file is heavily commented and those comments name classes in prose.
 * Reading them as declarations breaks the gate in both directions: a class mentioned only in a comment is reported
 * as an orphan (noise), and — worse — a comment that happens to name a class the code applies with no rule behind
 * it SUPPRESSES the missing-rule report, which is the case that renders an element unstyled with no error.
 *
 * A comment becomes a space, never nothing: closing a gap between two selectors welds them into one, which is the
 * exact failure `styles.css` has already had twice from a comment inserted mid-selector.
 */
function definedClasses(css: string): Set<string> {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return new Set([...code.matchAll(/\.(orbis-[a-z0-9-]+)/g)].map((m) => m[1]));
}

function findCssOrphans(blob: string, css: string): Orphan[] {
  const classes = [...definedClasses(css)];
  return classes
    .filter((c) => !DYNAMIC_CLASS_PREFIXES.some((p) => c.startsWith(p)) && !blob.includes(c))
    .map((name) => ({ kind: 'css' as const, name, signature: `css:${name}` }));
}

function main(): void {
  const blob = sourceBlob();
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const orphans = [...findI18nOrphans(blob), ...findCssOrphans(blob, css), ...findMissingCssRules(blob, css)];

  reportAudit({
    findings: orphans,
    baselinePath: BASELINE_PATH,
    updateBaseline: UPDATE_BASELINE,
    root: ROOT,
    // No `entriesForHumans`: an orphan's signature IS its name, so a second human-readable copy would say the
    // same thing twice. The other three audits key on a file position that a hash cannot be read back from.
    renderFresh: (fresh) => {
      console.error('Declarations nothing references (not in baseline):\n');
      for (const o of fresh.sort((a, b) => a.signature.localeCompare(b.signature))) {
        console.error(`  [${o.kind}]  ${o.name}`);
      }
    },
    advice:
      'Delete them, or — if the name is assembled at runtime — add its stem to DYNAMIC_PREFIXES /\n' +
      'DYNAMIC_CLASS_PREFIXES in this script, or run "pnpm lint:orphans --update-baseline".',
    cleanLabel: 'Orphan audit',
    noun: 'orphan',
  });
}

main();
