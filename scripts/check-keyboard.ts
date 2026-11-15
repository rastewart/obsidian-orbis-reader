// Audits src/**/*.ts for things you can click but cannot reach from a keyboard.
//
// A `<button>` is operable by Enter and Space because the browser makes it so. A `div` with a click listener is not: it
// takes no focus, answers no key, and is invisible to anyone driving Obsidian without a pointer — which includes
// keyboard users, screen-reader users, and anyone whose hands are unreliable that day. The fix is small and always the
// same three lines: `role="button"`, `tabIndex = 0`, and a `keydown` handler for Enter and Space.
//
// Structurally this is check-a11y.ts's sink-scanning approach aimed at a different question: that one asks whether an
// element has a NAME, this one asks whether it has a WAY IN. Same TypeScript AST walk, same per-file target keys, same
// baseline file so an existing debt is grandfathered while new debt fails the gate.
//
// What it cannot see, and what still needs eyes: tab ORDER (DOM order, which a reader has to walk), whether the focus
// ring is visible against the surface it lands on, and whether Escape and Enter do what a dialog implies. Those are in
// docs/design/accessibility.md's manual checklist.
//
// Usage:
//   pnpm lint:keyboard                     — fail if any NEW (non-baselined) violation exists
//   pnpm lint:keyboard --update-baseline    — regenerate scripts/keyboard-audit-baseline.json
//
// Suppress a single line intentionally with a comment on the line above it:
//   // keyboard-audit-disable-next-line -- <reason>
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { listSourceFiles, matchesAny, reportAudit } from './audit-lib';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const SRC_DIR = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(SCRIPT_DIR, 'keyboard-audit-baseline.json');

const UPDATE_BASELINE = process.argv.includes('--update-baseline');

// ── Config ──────────────────────────────────────────────────────────────────

/**
 * Element factories whose product is NOT keyboard-operable on its own.
 *
 * `createEl('button')` and `createButton` are absent deliberately: a real button already answers Enter and Space, and
 * flagging those would bury the fifteen elements that matter under a hundred that do not.
 */
const PASSIVE_FACTORIES = new Set(['createDiv', 'createSpan']);

/** Tags that are passive when created through `createEl('…')`. `a[href]` is focusable; a bare `a` is not. */
// `code`, `label`, `strong` and `em` are here too: a `createEl('code')` with a click listener has no tab stop and no
// Enter, and would otherwise be invisible to this checker. Anything that is not a control by nature belongs here.
const PASSIVE_TAGS = new Set([
  'div',
  'span',
  'li',
  'td',
  'tr',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'img',
  'code',
  'label',
  'strong',
  'em',
]);

/**
 * Whether an element-factory call gives its anchor an `href`, which makes it focusable and Enter-activatable by the
 * browser — `createEl('a', { href: '#' })` or `createEl('a', { attr: { href: '#' } })`.
 *
 * Without this the checker would report real links as unreachable, which is the shape of false positive that teaches
 * people to ignore a linter.
 */
function hasHref(node: ts.CallExpression): boolean {
  const named = (obj: ts.ObjectLiteralExpression): boolean =>
    obj.properties.some((prop) => {
      if (!ts.isPropertyAssignment(prop)) return false;
      const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : '';
      if (name === 'href') return true;
      return name === 'attr' && ts.isObjectLiteralExpression(prop.initializer) && named(prop.initializer);
    });
  const last = node.arguments[node.arguments.length - 1];
  return !!last && ts.isObjectLiteralExpression(last) && named(last);
}

/** What makes a passive element reachable: any one of these is enough to satisfy it. */
const KEYBOARD_SINKS = new Set(['tabIndex', 'tabindex']);

const EXCLUDED_FILE_PATTERNS = [/\/i18n\//, /\/__tests__\//, /\.test\.ts$/, /\/scripts\//];

const SUPPRESSION_COMMENT = /keyboard-audit-disable-next-line/;

interface Violation {
  file: string;
  line: number;
  column: number;
  targetKey: string;
  snippet: string;
  signature: string;
  /** Which rule found it — the advice printed at the end differs per rule. */
  kind: 'unreachable' | 'dropped-focus';
}

const isExcluded = (file: string): boolean => matchesAny(file, EXCLUDED_FILE_PATTERNS);

function snippetOf(node: ts.Node): string {
  const text = node.getText().trim().replace(/\s+/g, ' ');
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function isSuppressed(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const lines = sourceFile.getFullText().split('\n');
  return SUPPRESSION_COMMENT.test(lines[line - 1] ?? '');
}

function makeSignature(relFile: string, targetKey: string): string {
  return createHash('sha1').update(`${relFile}::${targetKey}`).digest('hex').slice(0, 16);
}

/**
 * The identity a click listener and a `tabIndex` are attached to.
 *
 * The same scoping rule as check-a11y.ts, for the same reason: `this.btn` is one element across a whole class, while a
 * local `row` inside two unrelated loops is two elements — and treating those as one would let a `tabIndex` in the
 * first satisfy the missing one in the second, which is precisely the bug this exists to find.
 */
function nearestBlockScopeId(node: ts.Node): string {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isBlock(cur) || ts.isSourceFile(cur)) return String(cur.pos);
    cur = cur.parent;
  }
  return 'global';
}

function isThisPropertyAccess(expr: ts.Node): boolean {
  return ts.isPropertyAccessExpression(expr) && expr.expression.kind === ts.SyntaxKind.ThisKeyword;
}

function targetKeyOf(expr: ts.Node): string {
  const text = expr.getText().trim();
  return isThisPropertyAccess(expr) ? text : `${nearestBlockScopeId(expr)}::${text}`;
}

/**
 * Every key the same local could have been declared under, nearest scope first.
 *
 * **A key built from the NEAREST block silently misses the ordinary shape.** `const row = parent.createDiv()` sits in a
 * loop's block; `row.addEventListener('click', …)` two lines later usually sits inside an `if` — a different block, so
 * a different key, so the lookup would fail and the checker would skip it as "an element we cannot see the creation
 * of". The miss is silent by construction, which is the worst property a gate can have.
 *
 * Walking outwards is precise rather than merely permissive: a shadowing declaration in a nearer block still wins,
 * because its key comes first.
 */
function scopeKeysOf(expr: ts.Node): string[] {
  const text = expr.getText().trim();
  if (isThisPropertyAccess(expr)) return [text];
  const keys: string[] = [];
  let cur: ts.Node | undefined = expr.parent;
  while (cur) {
    if (ts.isBlock(cur) || ts.isSourceFile(cur)) keys.push(`${cur.pos}::${text}`);
    cur = cur.parent;
  }
  return keys.length > 0 ? keys : [`global::${text}`];
}

/** The element a `x.addEventListener(…)` call listens on, for re-keying it against its declaration. */
function listenerTarget(listener: ts.CallExpression): ts.Node | null {
  return ts.isPropertyAccessExpression(listener.expression) ? listener.expression.expression : null;
}

/** Whether this factory call produces an element that takes no focus of its own. */
function isPassiveFactory(node: ts.CallExpression): boolean {
  const name = ts.isPropertyAccessExpression(node.expression)
    ? node.expression.name.text
    : ts.isIdentifier(node.expression)
      ? node.expression.text
      : '';
  if (PASSIVE_FACTORIES.has(name)) return true;
  if (name !== 'createEl') return false;
  const tag = node.arguments[0];
  if (!tag || !ts.isStringLiteral(tag) || !PASSIVE_TAGS.has(tag.text)) return false;
  // An anchor with an href is the browser's own keyboard control; one without is a div wearing a hat.
  return tag.text !== 'a' || !hasHref(node);
}

/**
 * `captureFocus(root)` hands back a restore function, and a repaint that never calls it is WORSE than one that never
 * captured: the capture blurs the focused control before the DOM is thrown away (an iOS fix — see `captureFocus`), so
 * a missing call does not leave the keyboard where it was, it drops it on the floor.
 *
 * `no-unused-vars` reports it only as a warning among others, which is not a gate. This is.
 *
 * Scoped to the enclosing function, and satisfied by any reference to the name (called, passed on, or returned) so a
 * helper that hands the restore somewhere else is not reported.
 */
function checkCapturedFocusIsRestored(sourceFile: ts.SourceFile, relFile: string, violations: Violation[]): void {
  const enclosingFunction = (node: ts.Node): ts.Node | undefined => {
    let cur: ts.Node | undefined = node.parent;
    while (cur && !ts.isFunctionLike(cur) && !ts.isSourceFile(cur)) cur = cur.parent;
    return cur;
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'captureFocus'
    ) {
      const name = node.name.text;
      const scope = enclosingFunction(node);
      let used = false;
      const look = (n: ts.Node): void => {
        if (used) return;
        if (n !== node.name && ts.isIdentifier(n) && n.text === name) used = true;
        else ts.forEachChild(n, look);
      };
      if (scope) look(scope);
      if (!used && !isSuppressed(sourceFile, node)) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({
          file: relFile,
          line: pos.line + 1,
          column: pos.character + 1,
          targetKey: name,
          snippet: snippetOf(node),
          signature: makeSignature(relFile, `captureFocus::${name}::${pos.line + 1}`),
          kind: 'dropped-focus',
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

interface FileState {
  /** targetKey → the element-creating call, for reporting where the element was made. */
  passive: Map<string, ts.Node>;
  /** targetKey → the click listener to report on. */
  clicked: Map<string, ts.Node>;
  /** targetKeys that can be focused or answer a key. */
  reachable: Set<string>;
}

function scanFile(filePath: string, violations: Violation[]): void {
  const relFile = path.relative(ROOT, filePath).split(path.sep).join('/');
  const text = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  const state: FileState = {
    passive: new Map(),
    clicked: new Map(),
    reachable: new Set(),
  };

  const visit = (node: ts.Node): void => {
    // const row = parent.createDiv(...)  /  this.btn = createEl('span', ...)
    if (ts.isCallExpression(node) && isPassiveFactory(node)) {
      const parent = node.parent;
      if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
        state.passive.set(`${nearestBlockScopeId(parent)}::${parent.name.getText()}`, node);
      } else if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === node
      ) {
        state.passive.set(targetKeyOf(parent.left), node);
      }
    }

    // X.tabIndex = 0 — the element can be focused, so its own keydown (or a delegated one) is the author's business.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      KEYBOARD_SINKS.has(node.left.name.text)
    ) {
      state.reachable.add(targetKeyOf(node.left.expression));
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const key = targetKeyOf(node.expression.expression);
      const first = node.arguments[0];
      const eventName = first && ts.isStringLiteral(first) ? first.text : '';

      if (method === 'addEventListener' && eventName === 'click') state.clicked.set(key, node);
      // A keydown or keypress listener is a way in, whatever it does with the key.
      if (method === 'addEventListener' && (eventName === 'keydown' || eventName === 'keypress')) {
        state.reachable.add(key);
      }
      // setAttribute('tabindex', …) — the attribute spelling of the same thing.
      if (method === 'setAttribute' && eventName === 'tabindex') state.reachable.add(key);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  checkCapturedFocusIsRestored(sourceFile, relFile, violations);

  for (const [key, listener] of state.clicked) {
    const target = listenerTarget(listener);
    // Outwards from the listener, so a declaration in an enclosing block is still found — see `scopeKeysOf`.
    const keys = target ? scopeKeysOf(target) : [key];
    if (!keys.some((k) => state.passive.has(k))) continue; // a real button, or a creation we cannot see
    // The same widening for the ways OUT: `row.tabIndex = 0` is written inside an `if` as often as the listener is.
    if (keys.some((k) => state.reachable.has(k))) continue;
    if (isSuppressed(sourceFile, listener)) continue;
    const pos = sourceFile.getLineAndCharacterOfPosition(listener.getStart(sourceFile));
    violations.push({
      file: relFile,
      line: pos.line + 1,
      column: pos.character + 1,
      targetKey: key.split('::').pop() ?? key,
      snippet: snippetOf(listener),
      signature: makeSignature(relFile, key),
      kind: 'unreachable',
    });
  }
}

function main(): void {
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
    /** Two rules, two groups: the advice under each is the whole reason they are not one list. */
    renderFresh: (fresh) => {
      const unreachable = fresh.filter((v) => v.kind === 'unreachable');
      const dropped = fresh.filter((v) => v.kind === 'dropped-focus');
      const list = (vs: Violation[]): void => {
        for (const v of vs.sort(byPlace)) {
          console.error(`  ${v.file}:${v.line}:${v.column}  [${v.targetKey}]  ${v.snippet}`);
        }
      };
      if (unreachable.length > 0) {
        console.error('Clickable elements with no keyboard path found (not in baseline):\n');
        list(unreachable);
        console.error(
          '\nGive it `role="button"`, `tabIndex = 0` and a keydown handler for Enter and Space — or use a real\n' +
            '<button>, which needs none of that.'
        );
      }
      if (dropped.length > 0) {
        console.error(`${unreachable.length > 0 ? '\n' : ''}Focus captured and never restored:\n`);
        list(dropped);
        console.error(
          '\nCall the function `captureFocus` returned, at the end of the repaint. It blurs the focused control before\n' +
            'the DOM goes, so not calling it drops the keyboard rather than leaving it where it was.'
        );
      }
    },
    advice:
      'If a line genuinely is not a fault, add "// keyboard-audit-disable-next-line -- <reason>" above it, or run\n' +
      '"pnpm lint:keyboard --update-baseline" to grandfather it (with a good reason).',
    cleanLabel: 'Keyboard audit',
  });
}

main();
