import { describe, expect, it } from 'vitest';

/**
 * Every source file, as text.
 *
 * Vite's own glob rather than `node:fs`: the plugin's `tsconfig` has no Node types — it compiles for Obsidian — so a
 * test that imports `readFileSync` passes under vitest and breaks the build.
 */
const sources = (import.meta as unknown as { glob: (pattern: string, opts: unknown) => Record<string, string> }).glob(
  '../**/*.ts',
  { query: '?raw', import: 'default', eager: true }
);

/**
 * `OrbisModal.onClose()` is the base class's, and no subclass may override it.
 *
 * **A source scan rather than a runtime check, because the failure is silent.** That method keeps the register of
 * open dialogs and runs everything waiting on the last one closing — a deferred page redraw, above all, since these
 * editors save as they go and a settings page must not repaint behind an open dialog. An override that forgets
 * `super` closes the dialog without flushing the queue: the edit saves, the redraw waits, and the list goes on
 * showing the old rows until you navigate away and back. Nothing about the override says it broke anything, and
 * nothing at runtime complains.
 *
 * A subclass's own cleanup goes in `onDialogClose()`, which the base calls. `contentEl` is emptied for it.
 */
/** Members declared as `onClose(` at class-member indentation — a declaration, not a call or an option. */
const declarations = (src: string): number => src.match(/^\s{2}(?:public\s+|protected\s+)?onClose\s*\(/gm)?.length ?? 0;

/**
 * **Every dialog is an `OrbisModal`, never Obsidian's own `Modal`.**
 *
 * The base class is where a dialog gets its place on screen — pinned near the top of the window, at one height
 * per device, the same as every popup — and a dialog that skips it opens where Obsidian puts one: centered, beside
 * the others pinned at the top. Nothing complains at runtime; it just looks wrong.
 *
 * `FuzzySuggestModal` and `SuggestModal` are not dialogs in this sense: they are Obsidian's picker, drawn where it
 * draws the command palette, and "Switch display style" is one on purpose.
 */
describe('every Orbis dialog', () => {
  it('extends OrbisModal rather than Obsidian’s Modal', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.includes('__tests__') && !path.endsWith('OrbisModal.ts'))
      .filter(([, src]) => /\bextends Modal\b|\bnew Modal\(/.test(src))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

describe('OrbisModal subclasses', () => {
  it('never override onClose', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.includes('__tests__') && !path.endsWith('OrbisModal.ts'))
      .filter(([, src]) => src.includes('extends OrbisModal') && declarations(src) > 0)
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  /**
   * **Including the subclass that lives in the base class's own file.** The scan above skips `OrbisModal.ts`
   * wholesale, and `InlineOrbisModal` — the class behind every `openOrbisDialog` — lives there. One declaration in
   * that file is the base class's own; a second is a subclass taking it back.
   */
  it('leaves the base class the only onClose in its own file', () => {
    const base = Object.entries(sources).find(([path]) => path.endsWith('OrbisModal.ts'))?.[1] ?? '';
    expect(declarations(base)).toBe(1);
  });
});

/**
 * **A dialog's buttons live in its footer, never in its scrolling body.**
 *
 * A source scan for the same reason as the rule above: the failure is quiet. Buttons built into the body look
 * almost right — Obsidian right-aligns them either way — so the difference only shows when the content is long
 * enough to scroll them off, or on a phone, where a dialog WITH a footer takes a different keyboard reserve
 * (`ui-utils`, `applyKeyboardReserve`). The dialogs most prone to this are the ones with text fields, which is
 * exactly the case that reserve exists for.
 *
 * The scan counts call sites rather than files, since one file can build several dialogs.
 *
 * The two spellings of "put them in the footer", either of which satisfies this:
 *   - a real `Modal`: `actionRow(footer())` — the footer element draws the line and owns the spacing
 *   - a popup, which has no footer element: `actionRow(x, { placement: 'footer' })`
 */
describe('dialog action rows', () => {
  /** Files that build dialogs — everything except the tests and the control that defines `actionRow` itself. */
  const dialogSources = Object.entries(sources).filter(
    ([path]) => !path.includes('__tests__') && !path.endsWith('controls.ts')
  );

  /**
   * The containers whose NAME says "this is the dialog's body". A row appended to one of these with no options is a
   * row in the content — the shape being banned. Anything with an options object has said what it is: `placement:
   * 'footer'` for a popup's footer, `'inline'` for a row inside a box that brings its own padding, `align: 'center'`
   * for a choice between two ways forward. Only the bare call is ambiguous, and only the bare call is wrong.
   */
  const BODY_ROW = /actionRow\((?:body|contentEl|this\.contentEl|this\.body|stage|popupEl)\)/g;

  it('never append a bare action row to a dialog body', () => {
    const offenders = dialogSources
      .flatMap(([path, src]) => (src.match(BODY_ROW) ?? []).map((hit) => `${path}: ${hit}`))
      .sort();
    expect(offenders).toEqual([]);
  });

  /**
   * **And never build one out of `Setting.addButton` at all.**
   *
   * That shape — `new Setting(contentEl).addButton(cancel).addButton(save)` — cannot reach a footer, because a
   * `Setting` renders where it is constructed. Matched by its Cancel: a dialog's Cancel is the one button that only
   * ever belongs to a terminal row, so it identifies the pattern without flagging the single-purpose `addButton`
   * calls that settings PAGES legitimately use.
   */
  const SETTING_CANCEL = /setButtonText\(t\('action\.cancel'\)\)/g;

  it('never build a dialog Cancel out of Setting.addButton', () => {
    const offenders = dialogSources.flatMap(([path, src]) => (src.match(SETTING_CANCEL) ?? []).map(() => path)).sort();
    expect(offenders).toEqual([]);
  });
});
