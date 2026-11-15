// The one alphabetical order, for every list a reader cannot reorder: the same on every device.
//
// **A list the reader can reorder keeps their order** — reader themes, the Library's dashboards, look-up web
// destinations, book sources, the marks in a preset. A list they cannot is shown sorted by name, here.
//
// **Not the order it is stored in.** A device appends what it makes and what reaches it through sync, so two devices
// hold the same items in different orders; sorting where a list is drawn is what makes it read the same everywhere,
// and nothing about the stored order or the sync has to change.
//
// **Not `localeCompare` with the device's own locale.** Windows, Android and iOS each sort by their own language
// settings and can disagree on accents, case and digits. One collator, fixed to English, case- and accent-blind, with
// numbers compared as numbers: "Style 2" before "Style 10" on every device.

const COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Compare two names in the shared alphabetical order. */
export function compareNames(a: string, b: string): number {
  return COLLATOR.compare(a, b);
}

/** A sorted copy of `items`, by `name` unless another key is given. The list itself is left as it was. */
export function byName<T>(
  items: readonly T[],
  nameOf: (item: T) => string = (item) => (item as { name: string }).name
): T[] {
  return [...items].sort((a, b) => compareNames(nameOf(a), nameOf(b)));
}
