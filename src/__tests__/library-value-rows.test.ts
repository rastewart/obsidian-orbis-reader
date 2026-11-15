// A collection's "Value names and order" list, and Reset order.

import { describe, expect, it } from 'vitest';
import { NONE_VALUE } from '../library/arrange';
import { fieldOrderRows, hasOwnOrder, orderSource, valueRows } from '../library/value-rows';

const statuses = [{ value: 'interested' }, { value: 'reading' }, { value: 'read' }, { value: 'abandoned' }];
const held = { seen: ['abandoned', 'read', 'reading'], none: 4 };
const values = (rows: { value: string }[]) => rows.map((row) => row.value);

describe('valueRows', () => {
  it("follows the field's order, then the notes' other values, then the none row", () => {
    const rows = valueRows(statuses, statuses, { seen: ['abandoned', 'dnf', 'read'], none: 2 });
    expect(values(rows)).toEqual(['interested', 'reading', 'read', 'abandoned', 'dnf', NONE_VALUE]);
  });

  it('drops a placed value the collection cannot contain, unless the field declares it', () => {
    const own = [{ value: 'gone' }, { value: 'interested' }, { value: 'read' }];
    expect(values(valueRows(own, statuses, held))).toEqual(['interested', 'read', 'abandoned', 'reading', NONE_VALUE]);
  });
});

describe('Reset order', () => {
  // Interested moved third, as a reader did to a collection of their own.
  const moved = [
    { value: 'reading' },
    { value: 'read', label: 'Finished' },
    { value: 'interested' },
    { value: 'abandoned' },
    { value: NONE_VALUE },
  ];

  it("is offered once the order is the collection's own, and not while it is the field's", () => {
    expect(hasOwnOrder(moved, statuses, held)).toBe(true);
    expect(hasOwnOrder(valueRows(statuses, statuses, held), statuses, held)).toBe(false);
  });

  it("puts the field's order back and keeps the names given here", () => {
    const reset = fieldOrderRows(moved, statuses, held);
    expect(values(reset)).toEqual(['interested', 'reading', 'read', 'abandoned', NONE_VALUE]);
    expect(reset.find((row) => row.value === 'read')?.label).toBe('Finished');
    expect(hasOwnOrder(reset, statuses, held)).toBe(false);
  });
});

describe('orderSource', () => {
  it("is the field's while the collection keeps the field's order, renamed or not", () => {
    expect(orderSource(undefined, statuses)).toBe('field');
    expect(orderSource([...statuses.slice(0, 2), { value: 'read', label: 'Finished' }, statuses[3]], statuses)).toBe(
      'field'
    );
  });

  it("is the collection's once it has an order of its own", () => {
    expect(orderSource([statuses[1], statuses[2], statuses[0], statuses[3]], statuses)).toBe('collection');
    // A field with no list of its own, ordered here — authors, say.
    expect(orderSource([{ value: 'Tester' }, { value: 'Austen' }], [])).toBe('collection');
  });

  it("is nobody's for a field with no list anywhere", () => {
    expect(orderSource(undefined, [])).toBeNull();
  });
});
