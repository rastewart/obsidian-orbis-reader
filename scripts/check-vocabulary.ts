// Words the product has retired, checked against the strings a reader actually sees.
//
// Renaming a command is easy; keeping it renamed is not. Nothing else stops the next person reaching for a retired
// name like "Export to vault", or writing a key called `generate_notes_file` behind a string that says something
// else. This is the gate that notices.
//
// Usage:
//   pnpm lint:vocab
//
// **It reads KEYS AND VALUES ONLY, never comments, and that is the whole design.** A comment in `en.ts` may name a
// retired term on purpose, to explain why a string says what it says. A check that read comments would fire on exactly
// the prose worth keeping, and the fix would be to delete the explanations. So the parser strips comments first, and a
// comment is the right place to name a retired word.
//
// **Zero tolerance with an ALLOW-LIST, not a baseline.** The other four audits here grandfather what existed when
// they were written, which is right for a cleanup you are working through. It would be exactly wrong here: the
// retired words are all in the past, so a baseline generated today would capture every one of them and enforce
// nothing afterwards. An allow-list entry names one key and says why that key keeps the word — a decision someone
// made, not a backlog.
//
// **What it cannot do.** It finds a retired word, not a misleading one. A key called `export_tab.book_export`
// behind a string that says "Save as Markdown" has no retired word in it and is still wrong; catching that needs a
// person reading the table. Adding terms here as they retire is how the
// gate stays worth running.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const EN_PATH = path.join(ROOT, 'src', 'i18n', 'en.ts');

/**
 * The guides.
 *
 * **`docs/design/` is excluded permanently** — a design doc's job is to say what something used to be called and
 * why it changed, so retired words belong in it for the same reason they belong in a comment. A sweep over all of
 * `docs/` would rewrite an old→new table into "Save as Markdown… | Save as Markdown…" and erase the record of the
 * decision.
 */
const DOC_GLOBS: readonly string[] = fs
  .readdirSync(path.join(ROOT, 'docs', 'guide'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => path.posix.join('docs', 'guide', f));

interface Retired {
  /** What not to say, matched case-insensitively on a word boundary. */
  readonly term: string;
  /** What to say instead — printed in the failure, so it has to be the actual replacement. */
  readonly use: string;
  /** Translation keys or doc paths allowed to keep the word, each with the decision that put it there. */
  readonly allow?: ReadonlyArray<{ where: string; because: string }>;
  /**
   * The word is fine when the surrounding text matches this.
   *
   * One rule needs it: the gesture ruling is *name both devices or name neither*, not *never say click*. A guide
   * teaching a physical gesture — "right-click, or long-press on a touch screen" — is obeying the rule, and a
   * check that fired on it would push the docs toward "select" in the one place the gesture itself is the point.
   */
  readonly okWhen?: RegExp;
}

/**
 * The retired vocabulary.
 *
 * Two kinds, and both belong here. The first is renamed terms — names that were correct until the day they were
 * not. The second is the standing rulings on how the product speaks, which are as easy to break as a rename.
 */
const RETIRED: readonly Retired[] = [
  // ── Renamed ─────────────────────────────────────────────────────────────────
  { term: 'Export to vault', use: 'Save as Markdown' },
  { term: 'Export book to vault', use: 'Save as Markdown' },
  { term: 'Generate notes file', use: 'Generate notes' },
  { term: 'Open or create notes file', use: 'Open notes' },
  { term: 'Save marks as PDF', use: 'Save annotations as PDF' },
  { term: 'note export style', use: 'notes style' },
  { term: 'annotation export style', use: 'notes style' },
  // The terminology review of the user guide (docs/design/terminology.md, 2026-10): the UI labels it renamed.
  { term: 'content panel', use: 'Navigator' },
  { term: 'contents panel', use: 'Contents tab' },
  { term: 'Contents, search and saved', use: 'Navigator' },
  { term: 'saved panel', use: 'Annotations tab' },
  { term: 'Saved tab', use: 'Annotations tab' },
  { term: 'linked vault notes panel', use: 'Linked vault notes tab' },
  { term: 'stats panel', use: 'Stats tab' },
  { term: 'listen toolbar', use: 'listening bar' },
  { term: 'scrolled view', use: 'Scrolled mode' },
  { term: 'Continuous scroll', use: 'Scrolled mode' },
  // "Reader theme manager" contains the old name, so a line that says the new one is fine.
  { term: 'Theme manager', use: 'Reader theme manager', okWhen: /\breader theme manager\b/i },
  { term: 'Marks dialog', use: 'Marks manager' },
  { term: 'look-up popup', use: 'Look-up dialog' },
  { term: 'Switched off', use: 'Disabled' },
  { term: 'Turn on book sources', use: 'Enable book sources' },
  { term: 'Show the library', use: 'Enable the library' },
  { term: 'Reading pace', use: 'Reading speed' },
  { term: 'Estimated pace', use: 'Estimated reading speed' },
  { term: 'Default location for', use: 'Default folder for' },
  { term: 'Vault location for config files', use: 'Vault folder for configuration files' },
  { term: 'wiki link', use: 'wikilink' },
  { term: 'Orbis data sharing', use: 'Orbis Reader configuration sharing' },
  { term: 'master switch', use: 'Use this vault on more than one device' },
  { term: 'highlight bar', use: 'marks bar' },
  { term: 'reading position', use: 'reading location' },
  { term: 'passage mark', use: 'passage selection' },
  { term: 'passage marks', use: 'passage selections' },
  // The Setup task is "Expanded PDF character set", which contains the retired name.
  { term: 'PDF character set', use: 'Expanded character set', okWhen: /\bexpanded pdf character set\b/i },
  { term: 'Notes & Export', use: 'Conversions' },
  // Terminology allows "frontmatter" only where the raw YAML block is shown; the two-word spelling is never used.
  {
    term: 'front matter',
    use: 'properties',
    allow: [
      {
        where: 'recordings_modal.front_matter',
        because: "the publishing term for a book's untitled opening sections, not a note's properties",
      },
    ],
  },
  // ── Standing rulings ────────────────────────────────────────────────────────
  //
  // "audiobook" is the one this product must never invite — see `settings_pages.listening_desc`. A recorded book read
  // by text-to-speech is not a narrated audiobook, and the word promises the thing Orbis cannot do.
  {
    term: 'audiobook',
    use: 'recorded book, or "read aloud with text-to-speech"',
    allow: [
      {
        where: 'docs/guide/format-support.md',
        because: 'names a FILE FORMAT Orbis cannot open, which is the one place the word is load-bearing',
      },
    ],
  },
  // A gesture named for one device tells the other half of the readers nothing.
  // Each is allowed when the OTHER device's gesture is named alongside it, which is the rule being kept.
  { term: 'tap', use: 'select', okWhen: /\b(click|right-click)\b/i },
  { term: 'tapping', use: 'selecting', okWhen: /\b(click|clicking|right-click)\b/i },
  { term: 'click', use: 'select', okWhen: /\b(tap|touch|long[- ]press|press and hold)\b/i },
  { term: 'clicking', use: 'selecting', okWhen: /\b(tap|tapping|touch|long[- ]press|press and hold)\b/i },
  // Obsidian renamed this in 1.0.
  { term: 'Safe mode', use: 'Restricted mode' },
  // "Hold" for "has" or "contains" reads oddly: a folder, a note or a track does not hold anything. The gesture
  // is fine — "touch and hold", "press and hold".
  { term: 'hold', use: 'have, or contain', okWhen: /\b(touch|press) and hold\b/i },
  { term: 'holds', use: 'has, or contains' },
  { term: 'held', use: 'had, or contained' },
  // US spelling in everything a reader sees.
  { term: 'colour', use: 'color' },
  { term: 'colours', use: 'colors' },
  { term: 'labelled', use: 'labeled' },
];

/** One place a retired word survives. */
interface Hit {
  readonly where: string;
  readonly term: string;
  readonly use: string;
  readonly text: string;
}

/**
 * Every `'key': 'value'` in the table, with comments removed first.
 *
 * Values are matched as one or more adjacent string literals, because a long line is broken with `+` and a word
 * can straddle the join — which is precisely where a retired term would hide from a naive line scan.
 */
function entries(source: string): Array<{ key: string; value: string }> {
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const pattern = /^\s*'([a-z0-9_.]+)':\s*((?:'[^']*'|"[^"]*")(?:\s*\+\s*(?:'[^']*'|"[^"]*"))*)/gm;
  const out: Array<{ key: string; value: string }> = [];
  for (const m of noComments.matchAll(pattern)) out.push({ key: m[1], value: m[2] });
  return out;
}

/** Word-boundary match, so "tap" does not fire on "tape" and "click" does not fire on "clicked into place". */
function says(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function scanTable(): Hit[] {
  const hits: Hit[] = [];
  const table = entries(fs.readFileSync(EN_PATH, 'utf8'));
  if (table.length < 500) {
    console.error(`Parsed only ${table.length} entries from en.ts — the pattern has stopped matching. Fix this
script rather than trusting a pass it did not earn.`);
    process.exit(1);
  }
  for (const { key, value } of table) {
    for (const rule of RETIRED) {
      if (rule.allow?.some((a) => a.where === key)) continue;
      // The KEY is checked as well as the value: a key naming a retired concept sends the next reader to the
      // wrong place.
      const inKey = says(key.replace(/[._]/g, ' '), rule.term);
      const inValue = says(value, rule.term) && !rule.okWhen?.test(value);
      if (inKey || inValue) hits.push({ where: key, term: rule.term, use: rule.use, text: inKey ? key : value });
    }
  }
  return hits;
}

function scanDocs(): Hit[] {
  const hits: Hit[] = [];
  for (const rel of DOC_GLOBS) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const [i, line] of text.split('\n').entries()) {
      for (const rule of RETIRED) {
        if (rule.allow?.some((a) => a.where === rel)) continue;
        if (rule.okWhen?.test(line)) continue;
        if (says(line, rule.term))
          hits.push({ where: `${rel}:${i + 1}`, term: rule.term, use: rule.use, text: line.trim() });
      }
    }
  }
  return hits;
}

const hits = [...scanTable(), ...scanDocs()];

if (hits.length > 0) {
  console.error('Retired vocabulary:\n');
  for (const h of hits) {
    console.error(`  ${h.where}`);
    console.error(`    says "${h.term}" — use "${h.use}"`);
    console.error(`    ${h.text.length > 110 ? `${h.text.slice(0, 110)}…` : h.text}\n`);
  }
  console.error(`${hits.length} place(s) using a retired word.

Change the string, and change its key with it if the key names the word too. If the word is deliberate — a
decision someone made for that one string — add it to that term's \`allow\` list with the reason, which is a
visible line in the diff and the whole point. Comments are not checked: naming the old word while explaining
the change is what a comment is for.`);
  process.exit(1);
}

console.log(`Vocabulary clean — ${RETIRED.length} retired term(s) checked against the translation table.`);
