import { describe, expect, it } from 'vitest';
import { placeNoteIcon } from '../reader/note-icon-place';

// A 1000px page of two 440px columns with a 60px gap: 30 + 440 + 60 + 440 + 30.
const twoColumns = { pageEnd: 3000, pageSize: 1000, columnWidth: 440, columnGap: 60 };
const pageLeft = twoColumns.pageEnd - twoColumns.pageSize;

describe('placeNoteIcon', () => {
  it('puts a note in the left column in the gap between the columns, at the middle of the page', () => {
    expect(placeNoteIcon({ ...twoColumns, lineCenterX: pageLeft + 250 })).toEqual({ where: 'page', x: 500 });
  });

  // Centred on the page edge, which is half a gap from the text — the same distance as an icon in the gap.
  it('puts a note in the right column on the page edge, as close to its text as one in the gap', () => {
    expect(placeNoteIcon({ ...twoColumns, lineCenterX: pageLeft + 750 })).toEqual({ where: 'page', x: 1000 });
  });

  it('puts a note on a one-column page on the page edge', () => {
    const one = { pageEnd: 1000, pageSize: 1000, columnWidth: 960, columnGap: 40 };
    expect(placeNoteIcon({ ...one, lineCenterX: 300 })).toEqual({ where: 'page', x: 1000 });
  });

  it('reads the column count off the page, not the setting — a narrow page is one column', () => {
    // Two columns asked for, but foliate laid out one: a column plus a gap spans the whole page.
    const narrow = { pageEnd: 400, pageSize: 400, columnWidth: 360, columnGap: 40 };
    expect(placeNoteIcon({ ...narrow, lineCenterX: 100 })).toEqual({ where: 'page', x: 400 });
  });

  it('falls back to the strip beside the book when the gap is too narrow for the icon', () => {
    const tight = { pageEnd: 1000, pageSize: 1000, columnWidth: 480, columnGap: 20 };
    expect(placeNoteIcon({ ...tight, lineCenterX: 200 })).toEqual({ where: 'margin' });
  });

  it('fits the icon in the narrowest gap foliate allows', () => {
    const floor = { pageEnd: 1000, pageSize: 1000, columnWidth: 460, columnGap: 40 };
    expect(placeNoteIcon({ ...floor, lineCenterX: 200 })).toEqual({ where: 'page', x: 500 });
  });

  it('places the icon after each column on a three-column page', () => {
    const three = { pageEnd: 1500, pageSize: 1500, columnWidth: 440, columnGap: 60 };
    expect(placeNoteIcon({ ...three, lineCenterX: 200 })).toEqual({ where: 'page', x: 500 });
    expect(placeNoteIcon({ ...three, lineCenterX: 700 })).toEqual({ where: 'page', x: 1000 });
    expect(placeNoteIcon({ ...three, lineCenterX: 1250 })).toEqual({ where: 'page', x: 1500 });
  });
});
