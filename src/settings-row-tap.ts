// Making a settings row openable by tapping its text, not only its pencil.
//
// Its own module because what it guards is not visible from the outside: registration has to be idempotent,
// and nothing about a row on screen says whether it was registered once or four times. Here a test can say so.

/**
 * Open a row's editor when its text is tapped, as well as from its pencil.
 *
 * **The pencil is the affordance; this is the shortcut.** A settings row is a wide target with a small button at
 * the end of it, and on a phone the obvious thing to do with a row is tap it — which alone does nothing, because
 * these are Obsidian `Setting` rows and Obsidian's own are not clickable. Our hand-drawn list rows (widgets, rules,
 * marks) are, so without this the two halves of the plugin would disagree about what a row is.
 *
 * Clicks inside the control area are left alone: that is where the toggles, arrows and the drag handle live, and
 * a tap meant for one of those must not also open a dialog behind it.
 */
export function openOnRowTap(setting: { settingEl: HTMLElement }, open: () => void): void {
  const el = setting.settingEl;
  el.classList.add('orbis-openable-row');
  // Every path into an editor goes through `openOnce` — see there. The per-element guard below stops one row
  // registering twice; that one stops one GESTURE opening two editors, whatever put the second listener there.
  // **Once per element, however many times the row is rendered.** Obsidian's declarative settings re-run a row's
  // `render` callback against the SAME `settingEl` when the page refreshes, so registering on every render would add
  // another listener per refresh: a tap would open editors stacked, and saving the stale one underneath would write
  // its old rules back over the change. The handler is looked up at click time rather than
  // captured, so the newest render's closure is the one that runs and no stale collection is edited.
  const first = !rowOpeners.has(el);
  rowOpeners.set(el, open);
  if (!first) return;
  el.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.setting-item-control')) return;
    /**
     * **A tap belongs to the innermost row that claims it.** A row can hold a list of its own — a dashboard's
     * widgets, expanded under it — and every click in there bubbles up to this listener too: without this, opening a
     * widget would also collapse the dashboard it sits in, and clicking the whitespace beside the name field would
     * collapse it for nothing. `.orbis-row-body` is in the selector as well as the row class, so the body's own prose
     * and labels are covered and not only the rows inside it. (The one-gesture gate below would swallow the second
     * open, but that is not a thing to rely on for correctness.)
     */
    if (target?.closest('.orbis-openable-row, .orbis-row-body') !== el) return;
    const handler = rowOpeners.get(el);
    if (handler) openOnce(handler);
  });
}

/**
 * Open one editor per gesture, however many things ask.
 *
 * **A backstop, not the fix.** Two copies of one editor open at once is always wrong — the stale one underneath
 * saves its old state over the change, which can lose a collection's rules — and no cause is worth trusting not to
 * come back: a duplicate listener, a row rendered twice into a page that was not cleared, a
 * pencil and a row tap both firing. All of them dispatch inside the same click, so one tick is the whole window,
 * and a person cannot tap twice inside it.
 *
 * Deliberately NOT a longer window: a second, deliberate tap a moment later is a reader asking for the dialog
 * again, and swallowing that would be a new bug wearing this one's clothes.
 *
 * **A timestamp rather than a flag cleared by a timer.** A flag whose timer does not fire — a throttled background
 * tab, a thrown handler, a phone suspending mid-gesture — is a plugin whose settings never open again, which is a
 * far worse failure than the one being guarded against. Nothing here can get stuck.
 */
export function openOnce(open: () => void): void {
  const now = Date.now();
  if (now - lastOpenedAt < GESTURE_MS) return;
  lastOpenedAt = now;
  open();
}

/**
 * How close together two opens have to be to count as one gesture.
 *
 * Duplicate listeners fire inside a single click dispatch — microseconds apart — so this only has to be longer
 * than that and shorter than a person. Fifty milliseconds is both by a wide margin.
 */
const GESTURE_MS = 50;

let lastOpenedAt = 0;

/** The current opener for each row element — see `openOnRowTap`. Weak, so a discarded row is collectable. */
const rowOpeners = new WeakMap<HTMLElement, () => void>();
