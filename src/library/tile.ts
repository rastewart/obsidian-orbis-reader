// What a title does when you tap it, and what it looks like when it has no cover. See docs/design/library.md.
//
// Pure, because both are decisions rather than drawing: one says which of a record's several possible destinations
// is THE one, the other turns a title into a color. Both are things a test can pin and neither needs a vault.

import type { Capabilities } from './capabilities';

/**
 * What tapping a title does.
 *
 * **Open the book.** That is what tapping a cover does on a shelf, on a Kindle, in every reading application
 * anyone has used — it opens the thing rather than telling you about the thing. Rows and tiles use the same rule
 * so that switching a widget's view never changes what a tap means.
 *
 * The fallbacks are not a footnote: a catalog is mostly titles you do not have a file for. A record whose only
 * link is to another application still has somewhere to go, and one with neither still has the note that describes
 * it. Each step is the most direct thing that record can offer, so the tap is never dead.
 */
export type PrimaryAction = 'read' | 'listen' | 'source' | 'note';

/**
 * `prefer` is how a widget says its titles are ABOUT something else: a shelf of recorded audio is there to be
 * listened to, so a tap that opened the text would be answering a question nobody asked. It is a preference, not
 * an override — a record with nothing to play still falls through the same chain.
 */
export function primaryActionFor(caps: Capabilities, prefer?: PrimaryAction): PrimaryAction {
  if (prefer === 'listen' && caps.canListen) return 'listen';
  if (caps.readPath) return 'read';
  if (caps.sourceUrl) return 'source';
  return 'note';
}

/**
 * The hue of a generated tile, derived from the title.
 *
 * Derived rather than random or stored: the same book is the same color on every device and after every reload,
 * which is what makes a grid of coverless titles learnable — you start recognizing a book by its patch of color
 * long before you read its name. A stored color would be a field to migrate and a thing to keep in sync; a random
 * one would move every time the view repainted.
 *
 * FNV-1a, because it is eight lines and spreads short strings well. Nothing here is a hash in the security sense.
 */
export function tileHue(title: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < title.length; i++) {
    hash ^= title.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % 360;
}
