import { describe, expect, it } from 'vitest';
import { nextStatus, OFFERED_STATUSES, offeredStatuses } from '../library/status';

describe('nextStatus', () => {
  // One flat menu with no "none of the above": choosing what a book already is takes the flag off.
  it('sets a status a record does not have', () => {
    expect(nextStatus(null, 'interested')).toBe('interested');
    expect(nextStatus('reading', 'read')).toBe('read');
  });

  it('clears the one it already has', () => {
    expect(nextStatus('interested', 'interested')).toBeNull();
    expect(nextStatus('read', 'read')).toBeNull();
  });
});

describe('OFFERED_STATUSES', () => {
  // `unread` is the written form of nothing, so it is cleared rather than chosen — offering it would be a second
  // way to say what clearing already says.
  it('offers the four a reader would set, in the order a book moves through them', () => {
    expect([...OFFERED_STATUSES]).toEqual(['interested', 'reading', 'read', 'abandoned']);
  });
});

describe('offeredStatuses', () => {
  it('follows the order the field table gives', () => {
    const listed = [{ value: 'reading' }, { value: 'interested' }, { value: 'read' }, { value: 'abandoned' }];
    expect([...offeredStatuses(listed)]).toEqual(['reading', 'interested', 'read', 'abandoned']);
  });

  /**
   * **A status the reader added is offered like any other.** Filtering this list back to the four Orbis ships would
   * leave a value someone added on the Fields page with a group, a name and a place in the order, and no tick in the
   * menu that sets it.
   */
  it('offers a status the reader declared', () => {
    expect([...offeredStatuses([{ value: 'lending' }, { value: 'read' }])]).toEqual(['lending', 'read']);
    expect([...offeredStatuses([{ value: 'Archived' }])]).toEqual(['Archived']);
  });

  // The one value that stays out. A collection grouping by status needs somewhere to put the books nobody has
  // flagged, so the Fields page can name and place that row — but an empty item in this menu would mean "clear",
  // which the modals spell out with a row of their own.
  it('never offers the empty value', () => {
    expect([...offeredStatuses([{ value: '' }, { value: 'reading' }])]).toEqual(['reading']);
    expect([...offeredStatuses([{ value: '   ' }, { value: 'reading' }])]).toEqual(['reading']);
  });

  it('falls back to all four when the field says nothing', () => {
    expect([...offeredStatuses(undefined)]).toEqual([...OFFERED_STATUSES]);
    expect([...offeredStatuses([])]).toEqual([...OFFERED_STATUSES]);
  });

  // Switching one off on the Fields page takes it out of `values`, which is what has to reach the menu.
  it('drops one the reader has switched off', () => {
    const listed = [{ value: 'interested' }, { value: 'reading' }, { value: 'read' }];
    expect([...offeredStatuses(listed)]).toEqual(['interested', 'reading', 'read']);
  });
});
