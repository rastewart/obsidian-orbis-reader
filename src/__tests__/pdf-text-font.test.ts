// The font a PDF draws the book's text in: which of a family's files it uses, which families it offers, and the
// writer drawing with it — what the chosen face lacks from the face beneath it.

import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { epubFontOptions, epubFontValue } from '../epub-font';
import type { VaultFace, VaultFont } from '../fonts';
import {
  embeddable,
  pdfFacesOf,
  pdfFontChoices,
  pdfFontOptions,
  pdfFontValue,
  subsetAllowed,
  type TextFaces,
  textFacesOf,
} from '../pdf-text-font';
import { createPdfWriter } from '../pdf-writer';

// Node's own modules at run time, since the plugin's tsconfig has no Node types (see `asset-integrity.test.ts`).
declare const process: {
  getBuiltinModule(id: 'node:fs'): {
    existsSync(p: string): boolean;
    readdirSync(p: string): string[];
    readFileSync(p: string): Uint8Array;
  };
};
const fs = process.getBuiltinModule('node:fs');

const face = (over: Partial<VaultFace>): VaultFace => ({
  path: 'F/x.ttf',
  weight: 400,
  italic: false,
  weightRange: null,
  width: 100,
  fsType: 0,
  subfamily: 'Regular',
  ...over,
});

describe('which files a PDF uses', () => {
  it('takes the static faces nearest each weight, at normal width', () => {
    const font: VaultFont = {
      family: 'Test',
      faces: [
        face({ path: 'light', weight: 300 }),
        face({ path: 'regular', weight: 400 }),
        face({ path: 'condensed', weight: 400, width: 75 }),
        face({ path: 'semibold', weight: 600 }),
        face({ path: 'bold', weight: 700 }),
        face({ path: 'italic', italic: true }),
      ],
    };
    const faces = pdfFacesOf(font);
    expect(faces.regular?.path).toBe('regular');
    expect(faces.bold?.path).toBe('bold');
    expect(faces.italic?.path).toBe('italic');
    expect(faces.boldItalic).toBeUndefined();
  });

  it('takes no variable file, since a PDF draws one at its default weight', () => {
    const font: VaultFont = { family: 'V', faces: [face({ weightRange: [100, 900] })] };
    expect(pdfFacesOf(font)).toEqual({});
    expect(pdfFontChoices([font, { family: 'S', faces: [face({})] }])).toEqual(['S']);
  });

  it('takes no file whose license bits refuse embedding', () => {
    expect([0, 4, 8, 2 | 4, 0x100].map(embeddable)).toEqual([true, true, true, true, true]);
    expect([2, 0x200, 8 | 0x200].map(embeddable)).toEqual([false, false, false]);
    expect(pdfFontChoices([{ family: 'R', faces: [face({ fsType: 2 })] }])).toEqual([]);
  });
});

describe('the Font list', () => {
  const fonts: VaultFont[] = [
    { family: 'DejaVu Serif', faces: [face({})] },
    { family: 'Literata', faces: [face({})] },
  ];

  it('names the default for what it is, and does not list DejaVu Serif twice', () => {
    expect(pdfFontOptions('', true, fonts)).toEqual({ '': 'Default (DejaVu Serif)', Literata: 'Literata' });
    expect(pdfFontOptions('', false, fonts)).toEqual({
      '': 'Default (Times)',
      'DejaVu Serif': 'DejaVu Serif',
      Literata: 'Literata',
    });
  });

  it('keeps a chosen font that is not in the vault, marked', () => {
    expect(pdfFontOptions('Gone', true, fonts).Gone).toBe('Gone (not in the vault)');
  });

  it('takes DejaVu Serif, chosen before DejaVu was whole, as the default once it is', () => {
    expect(pdfFontValue('DejaVu Serif', true, fonts)).toBe('');
    expect(pdfFontOptions('DejaVu Serif', true, fonts)).toEqual({ '': 'Default (DejaVu Serif)', Literata: 'Literata' });
    expect(pdfFontValue('DejaVu Serif', false, fonts)).toBe('DejaVu Serif');
  });

  it('matches a chosen font in any case, as the list names it', () => {
    expect(pdfFontValue('LITERATA', true, fonts)).toBe('Literata');
    expect(Object.keys(pdfFontOptions('LITERATA', true, fonts))).toEqual(['', 'Literata']);
    expect(epubFontValue('literata', ['Literata'])).toBe('Literata');
    expect(Object.keys(epubFontOptions('literata', ['Literata']))).toEqual(['', 'Literata']);
    expect(epubFontValue('', ['Literata'])).toBe('');
  });
});

describe('subsetting', () => {
  const read = (format: 'ttf' | 'otf', fsType: number) => ({ format, face: face({ fsType }) });

  it('subsets TrueType outlines, unless the license bits say No subsetting', () => {
    expect(subsetAllowed(read('ttf', 0))).toBe(true);
    expect(subsetAllowed(read('ttf', 8))).toBe(true);
    expect(subsetAllowed(read('ttf', 0x0100))).toBe(false);
    expect(subsetAllowed(read('ttf', 0x0104))).toBe(false);
  });

  it('embeds CFF outlines whole', () => {
    expect(subsetAllowed(read('otf', 0))).toBe(false);
  });

  it('carries the answer to the writer, face by face', () => {
    const data = new Uint8Array([1]);
    const faces = textFacesOf([
      { slot: 'regular', face: face({}), name: 'R.ttf', data, format: 'ttf' },
      { slot: 'bold', face: face({ fsType: 0x0100 }), name: 'B.ttf', data, format: 'ttf' },
    ]);
    expect(faces).toEqual({ body: { data, subset: true }, bodyBold: { data, subset: false } });
  });
});

// KaTeX's fonts come with the documentation site's packages: four static faces under the MIT license. KaTeX_Main has
// no `é`, `©` or `•`, which the built-in Times beneath it does.
const katex = (() => {
  const store = 'node_modules/.pnpm';
  const pkg = fs.existsSync(store) ? fs.readdirSync(store).find((n) => n.startsWith('katex@')) : undefined;
  return pkg ? `${store}/${pkg}/node_modules/katex/dist/fonts` : null;
})();

/**
 * The base names of the fonts a saved PDF's pages draw with, without the tag pdf-lib gives a subset. A page lists a font among its
 * resources only once text is drawn in it; the document holds every built-in face either way.
 */
async function fontsIn(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const names = new Set<string>();
  for (const page of doc.getPages()) {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    for (const ref of fonts?.values() ?? []) {
      const base = doc.context.lookup(ref, PDFDict).get(PDFName.of('BaseFont'));
      if (base instanceof PDFName) names.add(base.decodeText().replace(/^[A-Z]{6}\+|-\d+$/g, ''));
    }
  }
  return [...names].sort();
}

describe.skipIf(!katex)('drawing with a chosen font', () => {
  const read = (file: string) => ({ data: new Uint8Array(fs.readFileSync(`${katex}/${file}`)), subset: true });

  it("draws the book's text in it, and what it lacks in the face beneath", async () => {
    const text: TextFaces = { body: read('KaTeX_Main-Regular.ttf') };
    const w = await createPdfWriter(undefined, undefined, text);
    w.text('Plain words', { font: 'body', size: 11 });
    expect(await fontsIn(await w.save())).toEqual(['KaTeX_Main-Regular']);

    const accented = await createPdfWriter(undefined, undefined, text);
    accented.text('A café © 2026', { font: 'body', size: 11, prefix: '•' });
    expect(await fontsIn(await accented.save())).toEqual(['KaTeX_Main-Regular', 'Times-Roman']);
  });

  it('draws emphasis in its own faces', async () => {
    const text: TextFaces = {
      body: read('KaTeX_Main-Regular.ttf'),
      italic: read('KaTeX_Main-Italic.ttf'),
      bodyBold: read('KaTeX_Main-Bold.ttf'),
      bodyBoldItalic: read('KaTeX_Main-BoldItalic.ttf'),
    };
    const w = await createPdfWriter(undefined, undefined, text);
    const line = 'plain slanted heavy both';
    w.text(line, {
      font: 'body',
      size: 11,
      emphasis: [
        { start: 6, end: 13, kind: 'italic' },
        { start: 14, end: 19, kind: 'bold' },
        { start: 20, end: 24, kind: 'bold-italic' },
      ],
    });
    expect(await fontsIn(await w.save())).toEqual([
      'KaTeX_Main-Bold',
      'KaTeX_Main-BoldItalic',
      'KaTeX_Main-Italic',
      'KaTeX_Main-Regular',
    ]);
  });

  it('leaves the faces it does not have, and the sans, as they were', async () => {
    const w = await createPdfWriter(undefined, undefined, { body: read('KaTeX_Main-Regular.ttf') });
    w.text('Slanted', { font: 'italic', size: 11 });
    w.text('A heading', { font: 'bold', size: 13 });
    expect(await fontsIn(await w.save())).toEqual(['Helvetica-Bold', 'Times-Italic']);
  });

  it('draws in the default face when a chosen file cannot be read, rather than failing', async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => {});
    const w = await createPdfWriter(undefined, undefined, {
      body: { data: new Uint8Array([0, 1, 0, 0]), subset: true },
    });
    w.text('Still a page', { font: 'body', size: 11 });
    expect(await fontsIn(await w.save())).toEqual(['Times-Roman']);
    expect(said).toHaveBeenCalledOnce();
    said.mockRestore();
  });

  it('measures a line by the faces that draw it', async () => {
    // `é` is drawn in Times: a width taken from KaTeX_Main alone would be its missing-glyph box instead.
    const w = await createPdfWriter(undefined, undefined, { body: read('KaTeX_Main-Regular.ttf') });
    expect(w.width('body', 11, 'é')).toBeCloseTo(w.width('italic', 11, 'e'), 0);
  });
});
