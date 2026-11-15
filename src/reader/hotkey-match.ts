// Matching a keystroke inside the book against the hotkeys the reader has bound.
//
// **Why this exists.** The book is an iframe, so its keystrokes never reach the document Obsidian listens on.
// Re-dispatching a copy of the event out there does not work: Obsidian ignores a synthetic keyboard event, so a
// bound key would do nothing the moment focus is inside the text. (A check with focus on the host passes anyway,
// because there the event is native.)
//
// So the plugin matches the keystroke itself and runs the command. Pure, and separated from the app for the usual
// reason: which binding a keystroke corresponds to is the part worth testing, and testing it should not need
// Obsidian running.
//
// See docs/design/keyboard.md.

/** A binding, in the shape Obsidian stores. `Mod` is Cmd on macOS and Ctrl everywhere else. */
export interface Hotkey {
  modifiers: string[];
  key: string;
}

/** Just the parts of a keystroke a binding can be about. */
export interface Keystroke {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * The names a keystroke could be bound under.
 *
 * **`e.key` alone is not enough.** On macOS, Option+S produces `ß` — the character the layout makes — while the
 * binding was stored as `S`. `e.code` carries the physical key (`KeyS`), which is what survives the modifier, so
 * both are offered and either may match.
 */
export function keyNames(stroke: Keystroke): string[] {
  const names = [stroke.key.toUpperCase()];
  const letter = /^Key([A-Z])$/.exec(stroke.code)?.[1];
  const digit = /^Digit(\d)$/.exec(stroke.code)?.[1];
  const numpad = /^Numpad(\d)$/.exec(stroke.code)?.[1];
  for (const alt of [letter, digit, numpad, stroke.code.toUpperCase()]) if (alt) names.push(alt);
  return names;
}

/** The modifiers actually held, as Obsidian names them. `Mod` is resolved rather than reported, so both sides of
 *  the comparison speak in real keys. */
function heldModifiers(stroke: Keystroke): Set<string> {
  const held = new Set<string>();
  if (stroke.ctrlKey) held.add('Ctrl');
  if (stroke.metaKey) held.add('Meta');
  if (stroke.altKey) held.add('Alt');
  if (stroke.shiftKey) held.add('Shift');
  return held;
}

/** `Mod` means Cmd on macOS and Ctrl elsewhere; everything else is already a real key. */
function resolveModifiers(modifiers: readonly string[], isMac: boolean): Set<string> {
  return new Set(modifiers.map((m) => (m === 'Mod' ? (isMac ? 'Meta' : 'Ctrl') : m)));
}

/** Does this keystroke match this binding — same key, and exactly the same modifiers? */
export function matches(stroke: Keystroke, hotkey: Hotkey, isMac: boolean): boolean {
  const wanted = resolveModifiers(hotkey.modifiers ?? [], isMac);
  const held = heldModifiers(stroke);
  // Exactly, not merely: Ctrl+S must not fire on Ctrl+Shift+S, which is a different binding somebody else has.
  if (wanted.size !== held.size) return false;
  for (const m of wanted) if (!held.has(m)) return false;
  return keyNames(stroke).includes((hotkey.key ?? '').toUpperCase());
}

/**
 * The command bound to this keystroke, or `undefined`.
 *
 * Custom bindings win over defaults for the same command — that is what Obsidian's own settings mean by
 * customizing one — and a command whose custom binding is an empty list has been deliberately unbound.
 */
export function commandFor(
  stroke: Keystroke,
  defaults: Record<string, Hotkey[]>,
  custom: Record<string, Hotkey[]>,
  isMac: boolean
): string | undefined {
  for (const [id, keys] of Object.entries(custom)) {
    if (keys?.some((hk) => matches(stroke, hk, isMac))) return id;
  }
  for (const [id, keys] of Object.entries(defaults)) {
    if (id in custom) continue;
    if (keys?.some((hk) => matches(stroke, hk, isMac))) return id;
  }
  return undefined;
}
