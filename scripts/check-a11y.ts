// Audits src/**/*.ts for interactive elements whose only accessible name comes
// from `.title` (a tooltip, weakly surfaced to screen readers) with no `aria-label`
// and no visible text content to fall back on. See docs/design/accessibility.md's
// ".title -> aria-label migration" section for the pattern this mirrors and enforces
// going forward. Structurally this is check-i18n.ts's sink-scanning approach, aimed
// at accessible-name sinks instead of hardcoded-string sinks.
//
// It also fails on `cursor: pointer` in styles.css — see `ownPointerCursors`.
//
// This does NOT attempt to check keyboard navigation, focus management, ARIA live
// announcements, or color contrast — those need a running browser (see the doc's
// "Screen reader and Foliate iframe" section), not static analysis.
//
// Usage:
//   pnpm lint:a11y                 — fail if any NEW (non-baselined) violation exists
//   pnpm lint:a11y --update-baseline — regenerate scripts/a11y-audit-baseline.json
//
// Suppress a single line intentionally with a comment on the line above it:
//   // a11y-audit-disable-next-line -- <reason>
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { listSourceFiles, looksLikeProse, matchesAny, reportAudit } from './audit-lib';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const SRC_DIR = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(SCRIPT_DIR, 'a11y-audit-baseline.json');

const UPDATE_BASELINE = process.argv.includes('--update-baseline');

// ── Config ──────────────────────────────────────────────────────────────────
// A target (see targetKeyOf below) is "satisfied" if any of these are set on
// it anywhere in the file: an aria-label, or visible text content (the
// accessible name can then be computed from content, per WCAG 4.1.2 — a
// tooltip-only title is not required to also carry a redundant aria-label).
const LABEL_KEYS = new Set(['aria-label', 'ariaLabel']);
const TEXT_KEYS = new Set(['text', 'textContent', 'innerText']);
const TITLE_KEY = 'title';

const ELEMENT_FACTORY_NAMES = new Set(['createEl', 'createDiv', 'createSpan', 'createButton']);

const EXCLUDED_FILE_PATTERNS = [/\/i18n\//, /\/__tests__\//, /\.test\.ts$/];

const SUPPRESSION_COMMENT = /a11y-audit-disable-next-line/;

interface Violation {
  file: string;
  line: number;
  column: number;
  targetKey: string;
  snippet: string;
  signature: string;
}

const isExcluded = (file: string): boolean => matchesAny(file, EXCLUDED_FILE_PATTERNS);

function isProseLiteral(node: ts.Node): boolean {
  if (ts.isStringLiteralLike(node)) return looksLikeProse(node.text);
  if (ts.isTemplateExpression(node)) {
    return looksLikeProse(node.head.text) || node.templateSpans.some((s) => looksLikeProse(s.literal.text));
  }
  // active ? t('a') : t('b') — dynamic title/text values (e.g. bookmark/focus
  // toggle buttons). Either branch looking like prose is enough to count.
  if (ts.isConditionalExpression(node)) {
    return isProseLiteral(node.whenTrue) || isProseLiteral(node.whenFalse);
  }
  // t('some.key') and other call expressions (e.g. dynamic label helpers) are
  // assumed to produce prose — we can't see through them statically.
  return ts.isCallExpression(node);
}

function snippetOf(node: ts.Node): string {
  const text = node.getText().trim();
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function isSuppressed(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const lines = sourceFile.getFullText().split('\n');
  const prevLine = lines[line - 1] ?? '';
  return SUPPRESSION_COMMENT.test(prevLine);
}

function makeSignature(relFile: string, targetKey: string): string {
  return createHash('sha1').update(`${relFile}::${targetKey}`).digest('hex').slice(0, 16);
}

// `this.foo` is a class field — the same identity across every method, so its
// key is global to the file. A bare local (`btn`, `chip`, ...) is only the same
// identity within whatever block declared it; two unrelated `for` loops in the
// same file both naming their button `btn` must NOT be treated as one target,
// or an aria-label set in one satisfies a violation in the other (a real miss
// this caught: the content panel's tab buttons were named `btn`, and an
// unrelated `btn.textContent = text` two loops away masked their missing
// aria-label). Scoped by the nearest enclosing block's source position.
function isThisPropertyAccess(expr: ts.Node): boolean {
  return ts.isPropertyAccessExpression(expr) && expr.expression.kind === ts.SyntaxKind.ThisKeyword;
}

function nearestBlockScopeId(node: ts.Node): string {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isBlock(cur) || ts.isSourceFile(cur)) return String(cur.pos);
    cur = cur.parent;
  }
  return 'global';
}

// The "identity" a title/aria-label/text site is attached to, so sites set on
// the same element at different points in the file (e.g. a dynamic title that
// toggles between two strings) are recognized as the same target.
function targetKeyOfPropertyAccess(expr: ts.LeftHandSideExpression): string {
  const text = expr.getText().trim();
  if (isThisPropertyAccess(expr)) return text;
  return `${nearestBlockScopeId(expr)}::${text}`;
}

// For an element-factory call (createEl/createDiv/...) not assigned to a
// variable or field, nothing outside the call's own options object could set
// an aria-label on it — so its target key only matters within that literal.
function targetKeyOfCall(node: ts.CallExpression, sourceFile: ts.SourceFile): string {
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
    return `${nearestBlockScopeId(parent)}::${parent.name.getText()}`;
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    parent.right === node
  ) {
    const left = parent.left;
    const text = left.getText().trim();
    return isThisPropertyAccess(left) ? text : `${nearestBlockScopeId(parent)}::${text}`;
  }
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `<unassigned literal@${pos.line + 1}:${pos.character + 1}>`;
}

interface FileState {
  // targetKey -> title-setting sites (node to report on)
  titleSites: Map<string, ts.Node[]>;
  // targetKeys known to have an aria-label or visible text set somewhere in the file
  satisfiedTargets: Set<string>;
}

function recordObjectLiteralSinks(obj: ts.ObjectLiteralExpression, targetKey: string, state: FileState): void {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
    if (name === TITLE_KEY && isProseLiteral(prop.initializer)) {
      const sites = state.titleSites.get(targetKey) ?? [];
      sites.push(prop.initializer);
      state.titleSites.set(targetKey, sites);
    }
    if (name && LABEL_KEYS.has(name)) {
      state.satisfiedTargets.add(targetKey);
    }
    if (name && TEXT_KEYS.has(name) && isProseLiteral(prop.initializer)) {
      state.satisfiedTargets.add(targetKey);
    }
    if (ts.isObjectLiteralExpression(prop.initializer)) {
      recordObjectLiteralSinks(prop.initializer, targetKey, state);
    }
  }
}

function scanFile(filePath: string, violations: Violation[]): void {
  const relFile = path.relative(ROOT, filePath).split(path.sep).join('/');
  const text = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

  const state: FileState = {
    titleSites: new Map(),
    satisfiedTargets: new Set(),
  };

  const visit = (node: ts.Node): void => {
    // X.title = <text>  /  X.ariaLabel = <text>  /  X.text(Content|) = <text>  /  X.innerText = <text>
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left)
    ) {
      const propName = node.left.name.text;
      const targetKey = targetKeyOfPropertyAccess(node.left.expression);
      if (propName === TITLE_KEY && isProseLiteral(node.right)) {
        const sites = state.titleSites.get(targetKey) ?? [];
        sites.push(node.right);
        state.titleSites.set(targetKey, sites);
      }
      if (LABEL_KEYS.has(propName)) {
        state.satisfiedTargets.add(targetKey);
      }
      if (TEXT_KEYS.has(propName) && isProseLiteral(node.right)) {
        state.satisfiedTargets.add(targetKey);
      }
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;
      const targetKey = targetKeyOfPropertyAccess(node.expression.expression);

      // X.setAttribute('title' | 'aria-label', <text>)
      if (methodName === 'setAttribute' && node.arguments.length >= 2) {
        const attrNameArg = node.arguments[0];
        if (ts.isStringLiteral(attrNameArg)) {
          if (attrNameArg.text === TITLE_KEY && isProseLiteral(node.arguments[1])) {
            const sites = state.titleSites.get(targetKey) ?? [];
            sites.push(node.arguments[1]);
            state.titleSites.set(targetKey, sites);
          }
          if (LABEL_KEYS.has(attrNameArg.text)) {
            state.satisfiedTargets.add(targetKey);
          }
        }
      }

      // el.createEl(...) / .createDiv(...) / .createSpan(...) / .createButton(...) options object
      if (ELEMENT_FACTORY_NAMES.has(methodName)) {
        const lastArg = node.arguments[node.arguments.length - 1];
        if (lastArg && ts.isObjectLiteralExpression(lastArg)) {
          recordObjectLiteralSinks(lastArg, targetKeyOfCall(node, sourceFile), state);
        }
      }
    }

    // Bare createEl(...) etc. (not a property-access call) — same handling.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ELEMENT_FACTORY_NAMES.has(node.expression.text)
    ) {
      const lastArg = node.arguments[node.arguments.length - 1];
      if (lastArg && ts.isObjectLiteralExpression(lastArg)) {
        recordObjectLiteralSinks(lastArg, targetKeyOfCall(node, sourceFile), state);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  for (const [targetKey, sites] of state.titleSites) {
    if (state.satisfiedTargets.has(targetKey)) continue;
    for (const site of sites) {
      if (isSuppressed(sourceFile, site)) continue;
      const pos = sourceFile.getLineAndCharacterOfPosition(site.getStart(sourceFile));
      violations.push({
        file: relFile,
        line: pos.line + 1,
        column: pos.character + 1,
        targetKey,
        snippet: snippetOf(site),
        signature: makeSignature(relFile, targetKey),
      });
    }
  }
}

/**
 * `cursor: pointer` anywhere in `styles.css`. Obsidian gives its controls `var(--cursor)`, the arrow on desktop, and
 * its links `var(--cursor-link)`; a pointer of our own put the finger on every Orbis toolbar button, unlike every
 * button around it. See accessibility.md, "The cursor is the theme's too". No baseline: there is nothing to grandfather.
 */
function ownPointerCursors(): string[] {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  return css
    .split('\n')
    .flatMap((line, i) => (/cursor:\s*pointer/.test(line) ? [`styles.css:${i + 1}  ${line.trim()}`] : []));
}

function main(): void {
  const pointers = ownPointerCursors();
  if (pointers.length) {
    console.error("A cursor of our own, where Obsidian's variable belongs:\n");
    for (const p of pointers) console.error(`  ${p}`);
    console.error('\nUse var(--cursor) for a control, or var(--cursor-link) for text styled as a link.');
    process.exit(1);
  }
  const files = listSourceFiles(SRC_DIR).filter((f) => !isExcluded(f));
  const violations: Violation[] = [];
  for (const file of files) scanFile(file, violations);

  const byPlace = (a: Violation, b: Violation): number => a.file.localeCompare(b.file) || a.line - b.line;
  reportAudit({
    findings: violations,
    baselinePath: BASELINE_PATH,
    updateBaseline: UPDATE_BASELINE,
    root: ROOT,
    entriesForHumans: (all) => [...all].sort(byPlace).map((v) => `${v.file}:${v.line} [${v.targetKey}] ${v.snippet}`),
    renderFresh: (fresh) => {
      console.error('Icon-only elements with a title but no aria-label/visible text found (not in baseline):\n');
      for (const v of fresh.sort(byPlace)) {
        console.error(`  ${v.file}:${v.line}:${v.column}  [${v.targetKey}]  ${v.snippet}`);
      }
    },
    advice:
      'Add an aria-label (or visible text), or if intentional, add "// a11y-audit-disable-next-line -- <reason>"\n' +
      'on the line above, or run "pnpm lint:a11y --update-baseline" to grandfather it (with a good reason).',
    cleanLabel: 'a11y audit',
  });
}

main();
