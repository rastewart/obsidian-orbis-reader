// "Can this device speak?" changed — one announcement, for every surface that shows the answer.
//
// A voice arriving or being deleted is not a setting: it writes no preference, so nothing goes through
// `saveSettings` or `refreshViews`, and the surfaces that display it would never hear. Nor is this device's choice of
// voice, which is kept per device outside settings — so a change of choice is announced here too. Four of them ask the
// question — the Listen chip, the Voice and source panel, the Listening page's entry and its preview button — and
// wiring the open picker to whichever surfaces are nearby leaves the others stale.
//
// So the picker does not know who is listening. It says the fact happened; whoever is showing it asks the
// filesystem again. One cached boolean somewhere central would be a copy of a fact, and copies go stale: every
// reader here already has its own way of asking, and asking is cheap.
//
// Deliberately not the workspace event bus, which needs an `App` and would put a plugin-scoped string in a global
// namespace; and deliberately not an EventTarget, so a listener that throws cannot silence the rest. Shaped like
// `onVoicesChanged` next door, which is the same idea for a list the OS owns.

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * The answer to "can this device speak?" may have moved: a voice's files arrived or were removed, or this device's
 * choice of voice changed.
 *
 * Called by the picker, wherever a download resolves, a preview finishes (it downloads what it needs) or a model is
 * deleted — and by `setDeviceVoicePref`. **The voice choice is not a setting**: it is kept per device, outside
 * `saveSettings`, so it travels by no other way. Choosing *Use a system voice* in the reader once left the Listening
 * page saying *No voice* over a device that was speaking, because nothing told it the choice had changed.
 */
export function voiceReadinessChanged(): void {
  // Iterated over a copy: a listener may unsubscribe itself while being told, and that is exactly what a surface
  // does when it repaints.
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // One surface failing to repaint must not stop the others hearing. There is nothing useful to say here —
      // whatever threw is a repaint, and its own code owns the diagnosis.
    }
  }
}

/** Hear about it. Returns the unsubscribe function — call it when the surface goes away. */
export function onVoiceReadinessChanged(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
