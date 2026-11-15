// Audits src/**/*.ts for hardcoded user-facing strings that should go through
// the t() i18n helper (src/i18n/index.ts) instead. See docs/design/localization.md
// for the "What is localized" / "What stays hardcoded" scope this mirrors.
//
// Usage:
//   pnpm lint:i18n                 — fail if any NEW (non-baselined) violation exists
//   pnpm lint:i18n --update-baseline — regenerate scripts/i18n-audit-baseline.json
//
// Suppress a single line intentionally with a comment on the line above it:
//   // i18n-audit-disable-next-line -- <reason>
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { listSourceFiles, looksLikeProse, matchesAny, reportAudit } from './audit-lib';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const SRC_DIR = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(SCRIPT_DIR, 'i18n-audit-baseline.json');

const UPDATE_BASELINE = process.argv.includes('--update-baseline');

// ── Config: sinks this script treats as "surfaces user-facing text" ────────────
// Keep this list mapped to the "What is localized" table in docs/design/localization.md.

// obj.setX(<text>) — Obsidian Setting/Modal/Menu builder methods.
//
// `onProgress` is ours rather than Obsidian's, and it earns its place: `BookExportModal` assigns what it receives
// straight to `progressEl.textContent`, so a sentence handed to it is on screen. Hardcoded progress lines passed as
// arguments to that callback are invisible to any amount of looking at sinks while the callback is not one.
//
// It costs nothing where progress is reported properly: the PDF and font paths declare `(done, total)` and pass
// numbers, which are not prose, and `BookSourcesModal` passes a book title through a variable.
const SINK_METHODS = new Set([
  'setName',
  'setDesc',
  'setTitle',
  'setPlaceholder',
  'setTooltip',
  'setButtonText',
  'onProgress',
]);

// Property names (object-literal keys, or assignment targets) that hold user-facing text.
const SINK_PROPS = new Set(['title', 'placeholder', 'text', 'textContent', 'innerText', 'ariaLabel', 'aria-label']);

// Same idea, but the value is an HTML string (raw markup, usually an SVG icon with interpolated
// pieces) rather than plain text — checked with HTML tags stripped first, so a hardcoded icon
// string like '<svg width="18"...' doesn't read as "prose" and flood the audit. See stripHtmlTags.
const MARKUP_SINK_PROPS = new Set(['innerHTML']);

// createEl/createDiv/createSpan/createButton's last (options) argument is scanned
// for SINK_PROPS, including nested under an `attr: {...}` object (Obsidian's DomElementInfo shape).
const ELEMENT_FACTORY_NAMES = new Set(['createEl', 'createDiv', 'createSpan', 'createButton']);

// Attribute names, when passed as the first argument to .setAttribute(name, <text>).
const SINK_ATTRIBUTE_NAMES = new Set(['aria-label', 'title']);

const EXCLUDED_FILE_PATTERNS = [/\/i18n\//, /\/__tests__\//, /\.test\.ts$/];

const SUPPRESSION_COMMENT = /i18n-audit-disable-next-line/;

interface Violation {
  file: string; // relative to repo root, forward-slash separated
  line: number; // 1-based
  column: number; // 1-based
  sink: string;
  snippet: string;
  signature: string; // stable across line shifts — (file, sink, normalized text)
}

const isExcluded = (file: string): boolean => matchesAny(file, EXCLUDED_FILE_PATTERNS);

/**
 * Every piece of literal text a node can contribute, following the shapes that still add up to one string.
 *
 * **The two descents are not decoration.** `setTitle(x ? 'Hide debug log' : 'Show debug log')` is a sink holding
 * two hardcoded sentences, and stopping at the node would see a `ConditionalExpression` and report nothing — the
 * branches would never be looked at. Concatenation has the same shape and the same answer.
 * Anything already wrapped in `t()` contributes no literals, so a `cond ? t('a') : t('b')` stays silent while a
 * half-localized `cond ? t('a') : 'Literal'` does not.
 */
function literalTextSegments(node: ts.Node): string[] {
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    const segments = [node.head.text];
    for (const span of node.templateSpans) segments.push(span.literal.text);
    return segments;
  }
  if (ts.isConditionalExpression(node)) {
    return [...literalTextSegments(node.whenTrue), ...literalTextSegments(node.whenFalse)];
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...literalTextSegments(node.left), ...literalTextSegments(node.right)];
  }
  if (ts.isParenthesizedExpression(node)) return literalTextSegments(node.expression);
  return [];
}

// Removes HTML tags (including attributes) so markup-sink checks judge only the text that would
// actually render between tags, not attribute soup like `width="18" viewBox="0 0 24 24"`.
function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, ' ');
}

function isProseLiteral(node: ts.Node, opts: { stripMarkup?: boolean } = {}): boolean {
  const segments = literalTextSegments(node);
  return opts.stripMarkup ? segments.some((s) => looksLikeProse(stripHtmlTags(s))) : segments.some(looksLikeProse);
}

// Argument is itself a call to t(...) — already localized.
function isAlreadyLocalized(node: ts.Node): boolean {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't';
}

/**
 * Every key in en.ts whose value carries a `{{placeholder}}`, so the calls to them can be checked for vars.
 *
 * Read with a regex rather than by importing the module: this script runs before any build step, and the table is
 * a flat object literal whose shape is enforced by `i18n-strings.test.ts` anyway.
 */
function keysNeedingVars(): Set<string> {
  const table = fs.readFileSync(path.join(SRC_DIR, 'i18n', 'en.ts'), 'utf8');
  const out = new Set<string>();
  for (const m of table.matchAll(/^ {2}'([^']+)':\s*\n?\s*((?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))/gm)) {
    if (/\{\{\w+\}\}/.test(m[2])) out.add(m[1]);
  }
  return out;
}

/**
 * `t('key')` with no second argument, where that key's text contains `{{something}}`.
 *
 * `t()` substitutes only when vars are passed, so the placeholder prints verbatim — "Saves images to a
 * {{name}}-assets/ folder". A malformed placeholder such as `{size}` is caught by `i18n-strings.test.ts`, but it
 * can only see the table: a WELL-FORMED placeholder that is simply never substituted is invisible from there,
 * because the fault is at the call site.
 *
 * The reverse — passing vars a string does not use — is harmless and not checked; the extra values are ignored.
 */
function checkPlaceholderCalls(
  sourceFile: ts.SourceFile,
  relFile: string,
  needVars: Set<string>,
  violations: Violation[]
): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 't' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      needVars.has(node.arguments[0].text)
    ) {
      const key = node.arguments[0].text;
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      violations.push({
        file: relFile,
        line: line + 1,
        column: character + 1,
        sink: 'placeholder-no-vars',
        snippet: `t('${key}') — the string has a {{placeholder}} but no vars were passed`,
        signature: `${relFile}|placeholder-no-vars|${key}`,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

/**
 * `` `${n} chapter${n !== 1 ? 's' : ''}` `` — a count pluralized in code rather than by the string table.
 *
 * **Its own rule, because no prose test can see it.** `looksLikeProse` rejects a bare lowercase word with no
 * space, which is what keeps identifiers, class names and CSS values out of the audit — and every segment of this
 * idiom (`' chapter'`, `'s'`, `''`) is exactly that shape. Relaxing the word rule to catch it would flood the
 * audit; recognizing the idiom costs nothing and produces no other match.
 *
 * Reported wherever it appears, not only at a sink: text shaped this way is user-facing by construction, and it
 * can reach the screen through a callback the sink walk does not follow.
 *
 * The fix is always the same — two keys, `foo` with `{{count}}` and `foo_one` with the literal — which is the
 * house pattern (`library.count_records` / `library.count_records_one`) and the only one a locale can restate.
 */
const PLURAL_SUFFIX = /^(s|es|ies)?$/;

function isHardcodedPlural(node: ts.Node): boolean {
  if (!ts.isTemplateExpression(node)) return false;
  const hasWord = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].some((t) => /[a-zA-Z]/.test(t));
  if (!hasWord) return false;
  return node.templateSpans.some((span) => {
    const e = span.expression;
    if (!ts.isConditionalExpression(e)) return false;
    if (!ts.isStringLiteralLike(e.whenTrue) || !ts.isStringLiteralLike(e.whenFalse)) return false;
    // One branch empty, the other a plural ending — `? 's' : ''` and `? '' : 's'` alike.
    const [a, b] = [e.whenTrue.text, e.whenFalse.text];
    return (a === '' || b === '') && PLURAL_SUFFIX.test(a) && PLURAL_SUFFIX.test(b) && a !== b;
  });
}

function checkHardcodedPlurals(sourceFile: ts.SourceFile, relFile: string, violations: Violation[]): void {
  const visit = (node: ts.Node): void => {
    if (isHardcodedPlural(node) && !isSuppressed(sourceFile, node)) {
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({
        file: relFile,
        line: pos.line + 1,
        column: pos.character + 1,
        sink: 'hardcoded-plural',
        snippet: snippetOf(node),
        signature: makeSignature(relFile, 'hardcoded-plural', node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function snippetOf(node: ts.Node): string {
  const text = node.getText().trim();
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function makeSignature(relFile: string, sink: string, node: ts.Node): string {
  const normalized = literalTextSegments(node).join('|').trim().toLowerCase();
  return createHash('sha1').update(`${relFile}::${sink}::${normalized}`).digest('hex').slice(0, 16);
}

function isSuppressed(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const lines = sourceFile.getFullText().split('\n');
  const prevLine = lines[line - 1] ?? ''; // 0-based index of the line above (line is 0-based here)
  return SUPPRESSION_COMMENT.test(prevLine);
}

type SinkTextCallback = (node: ts.Node, sink: string, opts?: { stripMarkup?: boolean }) => void;

// Recursively scans an object literal for SINK_PROPS/MARKUP_SINK_PROPS keys (handles nesting,
// e.g. `attr: {...}`), invoking `onSinkText` for each one found.
function forEachSinkPropInObjectLiteral(
  obj: ts.ObjectLiteralExpression,
  sinkLabel: string,
  onSinkText: SinkTextCallback
): void {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
    if (name && SINK_PROPS.has(name)) {
      onSinkText(prop.initializer, `${sinkLabel}.${name}`);
    }
    if (name && MARKUP_SINK_PROPS.has(name)) {
      onSinkText(prop.initializer, `${sinkLabel}.${name}`, {
        stripMarkup: true,
      });
    }
    if (ts.isObjectLiteralExpression(prop.initializer)) {
      forEachSinkPropInObjectLiteral(prop.initializer, sinkLabel, onSinkText);
    }
  }
}

// Walks `root` and invokes `onSinkText(node, sinkLabel)` for every AST node sitting in a
// recognized "sink" text position — the same shapes `scanFile` checks for literal
// violations. Shared with `findRelayFunctions` below, which reuses this walk to ask a different
// question of the same node: "is this a parameter reference instead of a literal?"
function forEachSinkTextNode(root: ts.Node, onSinkText: SinkTextCallback): void {
  const visit = (node: ts.Node): void => {
    // new Notice(<text>, ...)
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Notice') {
      const arg = node.arguments?.[0];
      if (arg) onSinkText(arg, 'Notice');
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;

      // obj.setName(<text>) / .setDesc(...) / .setTitle(...) / .setPlaceholder(...) / .setTooltip(...) / .setButtonText(...)
      if (SINK_METHODS.has(methodName) && node.arguments[0]) {
        onSinkText(node.arguments[0], methodName);
      }

      // obj.setAttribute('aria-label' | 'title', <text>)
      if (methodName === 'setAttribute' && node.arguments.length >= 2) {
        const attrNameArg = node.arguments[0];
        if (ts.isStringLiteral(attrNameArg) && SINK_ATTRIBUTE_NAMES.has(attrNameArg.text)) {
          onSinkText(node.arguments[1], `setAttribute(${attrNameArg.text})`);
        }
      }

      // el.createEl(...) / .createDiv(...) / .createSpan(...) / .createButton(...) options object
      if (ELEMENT_FACTORY_NAMES.has(methodName)) {
        const lastArg = node.arguments[node.arguments.length - 1];
        if (lastArg && ts.isObjectLiteralExpression(lastArg)) {
          forEachSinkPropInObjectLiteral(lastArg, methodName, onSinkText);
        }
      }

      // this.addCommand({ id, name: <text>, ... }) — command-palette entries.
      if (methodName === 'addCommand') {
        const arg = node.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          scanForNamedProp(arg, 'name', 'addCommand.name', onSinkText);
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
        forEachSinkPropInObjectLiteral(lastArg, node.expression.text, onSinkText);
      }
    }

    // x.title = <text>  /  x.placeholder = <text>  /  x.textContent = <text>  /  x.innerText = <text>
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      SINK_PROPS.has(node.left.name.text)
    ) {
      onSinkText(node.right, `.${node.left.name.text} =`);
    }

    // x.innerHTML = <markup> — checked with tags stripped, see MARKUP_SINK_PROPS.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      MARKUP_SINK_PROPS.has(node.left.name.text)
    ) {
      onSinkText(node.right, `.${node.left.name.text} =`, {
        stripMarkup: true,
      });
    }

    ts.forEachChild(node, visit);
  };
  visit(root);
}

// Scans a (non-recursive, top-level) object literal for a single named property and reports it.
function scanForNamedProp(
  obj: ts.ObjectLiteralExpression,
  propName: string,
  sinkLabel: string,
  onSinkText: SinkTextCallback
): void {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === propName) {
      onSinkText(prop.initializer, sinkLabel);
    }
  }
}

interface RelaySink {
  paramIndex: number;
  sinkLabel: string;
}

// Finds local functions/arrow functions (module- or method-scoped, called by bare identifier —
// e.g. a `const addRow = (label: string, ...) => { ... createSpan({ text: label }) ... }` helper
// defined inside a render method) whose parameter is itself forwarded into a real sink somewhere
// in the function body. Returns a map of function name -> which parameter indices are "relayed"
// sinks and what they feed, so `scanFile` can then check string-literal arguments at call sites
// of that function the same way it checks arguments at a direct sink call.
//
// This only recognizes one exact shape (a bare-identifier-callable
// local helper forwarding a parameter straight into a sink node) — not arbitrary data flow. A
// parameter that's concatenated, template-interpolated, or passed through another helper before
// reaching a sink won't be detected. See "Automated audit" in docs/design/localization.md.
function findRelayFunctions(sourceFile: ts.SourceFile): Map<string, RelaySink[]> {
  const relays = new Map<string, RelaySink[]>();

  const visit = (node: ts.Node): void => {
    let name: string | undefined;
    let params: ts.NodeArray<ts.ParameterDeclaration> | undefined;
    let body: ts.ConciseBody | ts.Block | undefined;

    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      name = node.name.text;
      params = node.parameters;
      body = node.body;
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      name = node.name.text;
      params = node.initializer.parameters;
      body = node.initializer.body;
    }

    if (name && params && body) {
      const paramNames = params.map((p) => (ts.isIdentifier(p.name) ? p.name.text : null));
      const sinks: RelaySink[] = [];
      const seenIndices = new Set<number>();
      forEachSinkTextNode(body, (textNode, sinkLabel) => {
        if (!ts.isIdentifier(textNode)) return;
        const paramIndex = paramNames.indexOf(textNode.text);
        if (paramIndex === -1 || seenIndices.has(paramIndex)) return;
        seenIndices.add(paramIndex);
        sinks.push({ paramIndex, sinkLabel });
      });
      if (sinks.length > 0) relays.set(name, sinks);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return relays;
}

function checkTextNode(
  sourceFile: ts.SourceFile,
  relFile: string,
  node: ts.Node,
  sink: string,
  violations: Violation[],
  opts: { stripMarkup?: boolean } = {}
): void {
  if (isAlreadyLocalized(node)) return;
  if (!isProseLiteral(node, opts)) return;
  if (isSuppressed(sourceFile, node)) return;
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  violations.push({
    file: relFile,
    line: pos.line + 1,
    column: pos.character + 1,
    sink,
    snippet: snippetOf(node),
    signature: makeSignature(relFile, sink, node),
  });
}

function scanFile(filePath: string, violations: Violation[], needVars: Set<string>): void {
  const relFile = path.relative(ROOT, filePath).split(path.sep).join('/');
  const text = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

  // A t() call that will print its own placeholder — see checkPlaceholderCalls.
  checkPlaceholderCalls(sourceFile, relFile, needVars, violations);

  // Counts pluralized in code — anywhere in the file, not only at a sink. See checkHardcodedPlurals.
  checkHardcodedPlurals(sourceFile, relFile, violations);

  // Direct violations: string literals passed straight into a recognized sink.
  forEachSinkTextNode(sourceFile, (node, sink, opts) =>
    checkTextNode(sourceFile, relFile, node, sink, violations, opts)
  );

  // Relay violations: string literals passed as an argument to a local helper function (called
  // by bare identifier) whose corresponding parameter is itself forwarded into a sink somewhere
  // in that function's body — e.g. a `addRow('Page', ...)` call where `addRow` internally does
  // `createSpan({ text: label })`. See findRelayFunctions() for the exact shape recognized.
  const relays = findRelayFunctions(sourceFile);
  if (relays.size > 0) {
    const visitCalls = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const relaySinks = relays.get(node.expression.text);
        if (relaySinks) {
          for (const relaySink of relaySinks) {
            const arg = node.arguments[relaySink.paramIndex];
            if (arg) {
              checkTextNode(sourceFile, relFile, arg, `${node.expression.text}() → ${relaySink.sinkLabel}`, violations);
            }
          }
        }
      }
      ts.forEachChild(node, visitCalls);
    };
    visitCalls(sourceFile);
  }
}

function main(): void {
  const files = listSourceFiles(SRC_DIR).filter((f) => !isExcluded(f));
  const violations: Violation[] = [];
  const needVars = keysNeedingVars();
  for (const file of files) scanFile(file, violations, needVars);

  const byPlace = (a: Violation, b: Violation): number => a.file.localeCompare(b.file) || a.line - b.line;
  reportAudit({
    findings: violations,
    baselinePath: BASELINE_PATH,
    updateBaseline: UPDATE_BASELINE,
    root: ROOT,
    entriesForHumans: (all) => [...all].sort(byPlace).map((v) => `${v.file}:${v.line} [${v.sink}] ${v.snippet}`),
    renderFresh: (fresh) => {
      console.error('Hardcoded user-facing strings found (not in baseline) — use t() instead:\n');
      for (const v of fresh.sort(byPlace)) {
        console.error(`  ${v.file}:${v.line}:${v.column}  [${v.sink}]  ${v.snippet}`);
      }
    },
    advice:
      'Fix these, or if intentional, add "// i18n-audit-disable-next-line -- <reason>" on the line above,\n' +
      'or run "pnpm lint:i18n --update-baseline" to grandfather it (with a good reason).',
    cleanLabel: 'i18n audit',
  });
}

main();
