// The rows of a collection's "Value names and order" list, and the way back to the field's own order.

import { type FieldValue, foldValue, NONE_VALUE } from './arrange';

/** What the notes a collection admits hold for one field. */
export interface HeldValues {
  /** Distinct values, alphabetical. */
  seen: readonly string[];
  /** How many notes hold nothing for it. */
  none: number;
}

/**
 * The rows in the order shown: a list's placed values first, in its order, then whatever the notes hold that nobody
 * placed, alphabetically, then the row for the notes holding nothing — unless the list placed that row itself.
 *
 * A placed value the collection can no longer contain is dropped unless the field declares it: a status with nothing
 * in it today is still one of the statuses, and its place in the order is worth keeping.
 */
export function valueRows(
  order: readonly FieldValue[],
  declared: readonly FieldValue[],
  held: HeldValues
): FieldValue[] {
  const placed = order.filter(
    (entry) =>
      entry.value === NONE_VALUE ||
      declared.some((d) => d.value === entry.value) ||
      held.seen.some((value) => foldValue(value) === foldValue(entry.value))
  );
  // Folded, like grouping itself: `Read` and `read` are one value, so a note holding one spelling must not add a
  // second row beside the placed other.
  const rest = held.seen.filter((value) => !placed.some((entry) => foldValue(entry.value) === foldValue(value)));
  const none = held.none > 0 && !placed.some((entry) => entry.value === NONE_VALUE);
  return [...placed, ...rest.map((value) => ({ value })), ...(none ? [{ value: NONE_VALUE }] : [])];
}

/**
 * The same rows in the field's own order, keeping the names this collection gave them — what **Reset order** puts
 * back. Only the order: a value renamed for this collection is a separate decision, and resetting the order must not
 * quietly throw it away.
 */
export function fieldOrderRows(
  rows: readonly FieldValue[],
  declared: readonly FieldValue[],
  held: HeldValues
): FieldValue[] {
  return valueRows(declared, declared, held).map((entry) => ({
    value: entry.value,
    label: rows.find((row) => row.value === entry.value)?.label,
  }));
}

/** Whether the rows run in an order of their own rather than the field's — when **Reset order** is offered. */
export function hasOwnOrder(rows: readonly FieldValue[], declared: readonly FieldValue[], held: HeldValues): boolean {
  const field = valueRows(declared, declared, held);
  return rows.length !== field.length || rows.some((row, i) => row.value !== field[i].value);
}

/**
 * Where a field's value order comes from here: the field's own list, a list this collection made its own, or none at
 * all. What Group order and Sort by's direction name the order with — "In the field's order" or "In this
 * collection's order" — and the same question **Reset order** answers.
 *
 * A collection that only renamed values keeps the field's order and says so; it is the ORDER that has to differ.
 * `held` adds the values the notes hold to the comparison where the caller has counted them.
 */
export function orderSource(
  stored: readonly FieldValue[] | undefined,
  declared: readonly FieldValue[],
  held: HeldValues = { seen: [], none: 0 }
): 'field' | 'collection' | null {
  const named = (list: readonly FieldValue[]) => list.some((entry) => entry.value !== NONE_VALUE);
  if (!stored) return named(declared) ? 'field' : null;
  if (!named(stored)) return named(declared) ? 'field' : null;
  if (!named(declared)) return 'collection';
  return hasOwnOrder(valueRows(stored, declared, held), declared, held) ? 'collection' : 'field';
}
