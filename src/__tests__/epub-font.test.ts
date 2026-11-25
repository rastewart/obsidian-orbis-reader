// The Font list for a converted EPUB: none first, then every vault font a book can embed.

import { describe, expect, it } from 'vitest';
import { epubFontOptions } from '../epub-font';

describe('the EPUB Font list', () => {
  it('offers none first, leaving the font to the reading app, then each font', () => {
    expect(epubFontOptions('', ['DejaVu Serif', 'Literata'])).toEqual({
      '': 'None (the reading app chooses)',
      'DejaVu Serif': 'DejaVu Serif',
      Literata: 'Literata',
    });
  });

  it('keeps a chosen font that is not in the vault, marked', () => {
    expect(epubFontOptions('Gone', ['Literata']).Gone).toBe('Gone (not in the vault)');
  });
});
