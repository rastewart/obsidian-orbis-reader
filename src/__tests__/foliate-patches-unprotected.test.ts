// When the srcdoc patch cannot hold the frame's `src` setter — the one road every chapter takes into the reader — no
// book opens. Its own file, because the setter is made unwrappable for every test here.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeOpenFailure } from '../book-open-error';
import { installFoliateSrcdocPatch, removeFoliatePatches, UnprotectedReaderError } from '../foliate-patches';
import { t } from '../i18n';

vi.mock('../runtime-patch', async (load) => ({
  ...(await load<object>()),
  // What a setter that cannot be wrapped returns: no unpatch.
  wrapSetter: () => null,
}));

afterEach(() => removeFoliatePatches());

describe('installFoliateSrcdocPatch, when the src setter cannot be wrapped', () => {
  it('refuses, and refuses again on the next book', () => {
    expect(() => installFoliateSrcdocPatch()).toThrow(UnprotectedReaderError);
    expect(() => installFoliateSrcdocPatch()).toThrow(UnprotectedReaderError);
  });

  it('still comes off cleanly', () => {
    expect(() => installFoliateSrcdocPatch()).toThrow(UnprotectedReaderError);
    removeFoliatePatches();
    expect(Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'setAttribute')).toBeUndefined();
  });

  it('is told as the reader’s failure, not the book’s', () => {
    expect(describeOpenFailure(new UnprotectedReaderError(), 'epub')).toBe(t('book_open.protection_not_in_place'));
  });
});
