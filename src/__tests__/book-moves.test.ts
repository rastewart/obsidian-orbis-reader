// A book moved outside Obsidian arrives as a deletion and a creation. These are the pairings that make it a move.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookMoveMatcher } from '../book-moves';

const WINDOW = 5000;
const book = (path: string, size = 1000) => ({ path, name: path.split('/').pop() ?? '', size });

describe('BookMoveMatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pairs a deletion with the creation that follows it', async () => {
    const m = new BookMoveMatcher(WINDOW);
    const where = m.deleted(book('books/A.epub'));
    vi.advanceTimersByTime(100);
    m.created(book('elsewhere/A.epub'));
    await expect(where).resolves.toBe('elsewhere/A.epub');
  });

  // The file watcher reports the two paths in no fixed order.
  it('pairs a deletion with a creation that came just before it', async () => {
    const m = new BookMoveMatcher(WINDOW);
    m.created(book('elsewhere/A.epub'));
    vi.advanceTimersByTime(100);
    await expect(m.deleted(book('books/A.epub'))).resolves.toBe('elsewhere/A.epub');
  });

  it('calls it a deletion when nothing appears in time', async () => {
    const m = new BookMoveMatcher(WINDOW);
    const where = m.deleted(book('books/A.epub'));
    vi.advanceTimersByTime(WINDOW);
    m.created(book('elsewhere/A.epub'));
    await expect(where).resolves.toBeNull();
  });

  it('does not pair with a creation older than the window', async () => {
    const m = new BookMoveMatcher(WINDOW);
    m.created(book('elsewhere/A.epub'));
    vi.advanceTimersByTime(WINDOW + 1);
    const where = m.deleted(book('books/A.epub'));
    vi.advanceTimersByTime(WINDOW);
    await expect(where).resolves.toBeNull();
  });

  // A renamed file, or a different book that happens to share a name, is not where this one went.
  it.each([
    ['another name', book('elsewhere/B.epub')],
    ['another size', book('elsewhere/A.epub', 2000)],
  ])('does not pair with a book of %s', async (_why, other) => {
    const m = new BookMoveMatcher(WINDOW);
    const where = m.deleted(book('books/A.epub'));
    m.created(other);
    vi.advanceTimersByTime(WINDOW);
    await expect(where).resolves.toBeNull();
  });

  it('pairs each creation with one deletion only', async () => {
    const m = new BookMoveMatcher(WINDOW);
    m.created(book('elsewhere/A.epub'));
    await expect(m.deleted(book('books/A.epub'))).resolves.toBe('elsewhere/A.epub');
    const second = m.deleted(book('other/A.epub'));
    vi.advanceTimersByTime(WINDOW);
    await expect(second).resolves.toBeNull();
  });
});
