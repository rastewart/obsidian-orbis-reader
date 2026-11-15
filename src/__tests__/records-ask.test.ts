// "Ask for each book" asks only when the save is something the book would record.
//
// Found on the test page: with Bookmarks off, adding a bookmark asked "record this book?", and answering On then wrote
// nothing for the bookmark — the passage saved before it was the whole record.

import { describe, expect, it, vi } from 'vitest';
import { RecordsController } from '../reader/RecordsController';
import type { RecordsResolution } from '../record-config';

function asking(kinds: RecordsResolution['kinds']) {
  const ctrl = new RecordsController({ debug: () => {} } as never, {} as never);
  vi.spyOn(ctrl, 'records').mockReturnValue({ active: false, ask: true, kinds, location: { mode: 'global' } });
  const prompt = vi.fn();
  (ctrl as unknown as { scheduleRecordsPrompt: () => void }).scheduleRecordsPrompt = prompt;
  return { ctrl, prompt };
}

describe('asking whether to record a book', () => {
  const noBookmarks = { passages: true, notes: true, bookmarks: false };

  it('does not ask on a bookmark while bookmarks are not recorded', () => {
    const { ctrl, prompt } = asking(noBookmarks);
    ctrl.recordsChanged(undefined, 'bookmarks');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('asks on a passage or a note, which are', () => {
    const { ctrl, prompt } = asking(noBookmarks);
    ctrl.recordsChanged(undefined, 'passages');
    ctrl.recordsChanged(undefined, 'notes');
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('asks on a bookmark once bookmarks are recorded', () => {
    const { ctrl, prompt } = asking({ ...noBookmarks, bookmarks: true });
    ctrl.recordsChanged(undefined, 'bookmarks');
    expect(prompt).toHaveBeenCalledOnce();
  });
});

// "Follow the vault setting" stores a decision with no yes or no in it. The dialog then says "you'll be asked on your
// next selection or note" — and the asking never came, because any stored decision counted as an answer.
describe('a book that follows the vault, in ask mode', () => {
  function book(stored: { enabled?: boolean }) {
    vi.useFakeTimers();
    const ctrl = new RecordsController(
      { debug: () => {}, currentFile: { path: 'fixtures/b.mobi' } } as never,
      { plugin: { recordsAsked: new Set<string>() } } as never
    );
    (ctrl as unknown as { bookRecords: unknown }).bookRecords = stored;
    vi.spyOn(ctrl, 'records').mockReturnValue({
      active: stored.enabled === true,
      ask: stored.enabled === undefined,
      kinds: { passages: true, notes: true, bookmarks: false },
      location: { mode: 'global' },
    });
    (ctrl as unknown as { busyForPrompt: () => boolean }).busyForPrompt = () => false;
    const open = vi.fn();
    (ctrl as unknown as { openBookRecordsSettings: () => void }).openBookRecordsSettings = open;
    return { ctrl, open };
  }

  it('is asked on its next passage', () => {
    const { ctrl, open } = book({});
    ctrl.recordsChanged(undefined, 'passages');
    vi.advanceTimersByTime(10_000);
    expect(open).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('is not asked once it has said no', () => {
    const { ctrl, open } = book({ enabled: false });
    ctrl.recordsChanged(undefined, 'passages');
    vi.advanceTimersByTime(10_000);
    expect(open).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
