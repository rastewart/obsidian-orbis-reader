// Wrapping a built-in so the wrap can be taken off again.
//
// Orbis changes three things in Obsidian's window to load books (see `foliate-patches.ts`), and a plugin that changes
// the window has to put it back when it unloads — otherwise every reload adds another layer and keeps the previous
// version's code alive until Obsidian restarts.
//
// **Taking a wrap off must not take anyone else's with it.** Another plugin can wrap the same method after Orbis did.
// Putting back what Orbis found would then remove theirs too, so the undo checks first: if Orbis's wrapper is still
// the one installed, the original goes back; if something sits on top of it, Orbis's layer stays in place but passes
// every call straight through. This is the approach of `monkey-around`, the small library many Obsidian plugins use —
// written here because it is this short, and a dependency would be more to vet than code to read.

/** Takes a wrap off. Safe to call twice. */
export type Unpatch = () => void;

type Method = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Replace `target[key]` with `wrap(original)`. The returned function puts it back — or, when something has wrapped
 * on top since, leaves the layer in place as a pass-through.
 *
 * A method `target` only inherited (`HTMLIFrameElement.prototype.setAttribute` is `Element`'s) is deleted on undo
 * rather than assigned, so the prototype goes back to inheriting it.
 */
export function wrapMethod(target: object, key: string, wrap: (original: Method) => Method): Unpatch {
  const slot = target as Record<string, unknown>;
  const own = Object.hasOwn(target, key);
  const original = slot[key] as Method;
  const inner = wrap(original);
  let active = true;
  const wrapper: Method = function (this: unknown, ...args: unknown[]) {
    return Reflect.apply(active ? inner : original, this, args);
  };
  slot[key] = wrapper;
  return () => {
    if (!active) return;
    active = false;
    if (slot[key] !== wrapper) return; // wrapped on top since: stay, as a pass-through
    if (own) slot[key] = original;
    else delete slot[key];
  };
}

/**
 * Replace the setter of the accessor `target[key]` with `wrap(originalSetter)`, keeping its getter. Null when the
 * property is not a configurable accessor with both halves, and nothing is changed.
 */
export function wrapSetter(
  target: object,
  key: string,
  wrap: (original: (this: unknown, value: unknown) => void) => (this: unknown, value: unknown) => void
): Unpatch | null {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor?.get || !descriptor.set || !descriptor.configurable) return null;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- taken from the descriptor; Reflect.apply passes `this` explicitly
  const original = descriptor.set as (this: unknown, value: unknown) => void;
  const inner = wrap(original);
  let active = true;
  const set = function (this: unknown, value: unknown): void {
    Reflect.apply(active ? inner : original, this, [value]);
  };
  Object.defineProperty(target, key, { ...descriptor, set });
  return () => {
    if (!active) return;
    active = false;
    if (Object.getOwnPropertyDescriptor(target, key)?.set !== set) return; // redefined on top since: pass through
    Object.defineProperty(target, key, descriptor);
  };
}
