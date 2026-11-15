// The books nothing describes yet, and how the dashboard mentions them. See docs/design/library.md.
//
// Pure: paths in, a signature out. The interesting decision is what "dismissed" means, and it is a decision worth
// a test rather than a flag someone has to trust.

/**
 * A fingerprint of the set of uncataloged files.
 *
 * **Dismissing is about a set, not about the feature.** A flag that hid the notice forever would quietly turn it
 * off: drop a book into the vault a month later and nothing would ever mention it. So what gets remembered is
 * WHICH books were waved away, and a set that has changed raises the notice again.
 *
 * A hash rather than the list itself, because the list can be hundreds of paths and this is stored in settings on
 * every device. Order-independent: the vault's file order is not something the reader chose, and a reshuffle is
 * not a new book.
 */
export function uncatalogedSignature(paths: string[]): string {
  if (paths.length === 0) return '';
  let hash = 0x811c9dc5;
  for (const path of [...paths].sort()) {
    for (let i = 0; i < path.length; i++) {
      hash ^= path.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x2f; // a separator, so ["ab","c"] and ["a","bc"] are different sets
    hash = Math.imul(hash, 0x01000193);
  }
  return `${paths.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * Whether the dashboard should mention them.
 *
 * Nothing to say when there is nothing waiting, and nothing to say when this exact set was already dismissed —
 * anything else is a notice that reappears on every repaint and teaches you to ignore it.
 */
export function shouldAlert(paths: string[], dismissed: string, enabled: boolean): boolean {
  if (!enabled || paths.length === 0) return false;
  return uncatalogedSignature(paths) !== dismissed;
}
