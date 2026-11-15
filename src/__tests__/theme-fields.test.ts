// What a copied theme starts from: the colors of the one it copies, links included.

import { describe, expect, it } from 'vitest';
import { BOOK_LINK } from '../reader-themes';
import { fieldsFrom } from '../ThemeModal';

describe('fieldsFrom — a copy’s starting fields', () => {
  it('keeps the link color a theme names', () => {
    const sepia = { bg: '#f4ecd8', fg: '#5b4636', link: '#8a4b20' };
    expect(fieldsFrom('Sepia copy', sepia)).toEqual({ name: 'Sepia copy', ...sepia });
  });

  // Light leaves links to the book, which most books show in the browser's blue — the color its sample shows.
  it('gives a copy of Light the blue its links show in most books', () => {
    expect(fieldsFrom('Light copy', { bg: '#ffffff', fg: '#000000' }).link).toBe(BOOK_LINK);
  });

  it('gives a dark page with no link color a light blue, since the browser’s blue would not show on it', () => {
    expect(fieldsFrom('Night', { bg: '#101010', fg: '#e0e0e0' }).link).toBe('#8fb8f2');
  });
});
