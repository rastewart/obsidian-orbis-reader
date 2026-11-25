// Sorting chosen files into families: loose font files, zips of them with their licences, macOS's zip leftovers,
// a variable copy beside static files, and the reasons anything is left out.

import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { faceNames } from '../FontImportModal';
import { gatherImport } from '../font-import';
import { fontBytes } from './font-bytes';

const face = (family: string, weight: number, italic: boolean, wght?: [number, number]) =>
  fontBytes({ names: { 1: family, 2: 'Face' }, weight, fsSelection: italic ? 1 : 0x40, wght });

const four = (family: string) => ({
  [`${family}-Regular.ttf`]: face(family, 400, false),
  [`${family}-Italic.ttf`]: face(family, 400, true),
  [`${family}-Bold.ttf`]: face(family, 700, false),
  [`${family}-BoldItalic.ttf`]: face(family, 700, true),
});

describe('gatherImport', () => {
  it('sorts loose files into families by what the files say', () => {
    const { families, refused } = gatherImport(
      Object.entries(four('Test Serif')).map(([name, data]) => ({ name, data }))
    );
    expect(refused).toEqual([]);
    expect(families.map((f) => [f.family, f.files.length, [...f.covered].sort()])).toEqual([
      ['Test Serif', 4, ['bold', 'boldItalic', 'italic', 'regular']],
    ]);
  });

  it('opens a zip, keeps the folders out of the names, and brings its licence to every family in it', () => {
    const licence = new TextEncoder().encode('SIL Open Font License');
    const zip = zipSync({
      'Test-Serif/OFL.txt': licence,
      'Test-Serif/fonts/ttf': {},
      ...Object.fromEntries(Object.entries(four('Test Serif')).map(([n, d]) => [`Test-Serif/fonts/ttf/${n}`, d])),
      'Test-Serif/fonts/webfonts/TestSerif-Regular.woff2': new Uint8Array([0x77, 0x4f, 0x46, 0x32]),
      '__MACOSX/Test-Serif/._OFL.txt': new Uint8Array([1, 2, 3]),
      'Test-Serif/readme.md': new TextEncoder().encode('# Test Serif'),
    });
    const { families, refused } = gatherImport([{ name: 'Test_Serif.zip', data: zip }]);
    expect(refused).toEqual([]);
    expect(families).toHaveLength(1);
    expect(families[0].files.map((f) => f.name).sort()).toEqual([
      'Test Serif-Bold.ttf',
      'Test Serif-BoldItalic.ttf',
      'Test Serif-Italic.ttf',
      'Test Serif-Regular.ttf',
    ]);
    expect(families[0].licences.map((l) => [l.name, new TextDecoder().decode(l.data)])).toEqual([
      ['OFL.txt', 'SIL Open Font License'],
    ]);
  });

  it('keeps a family’s static files and leaves out its variable copy', () => {
    const zip = zipSync({
      'Test-Serif[wght].ttf': face('Test Serif', 400, false, [100, 900]),
      'static/Test-Serif-Regular.ttf': face('Test Serif', 400, false),
      'static/Test-Serif-Bold.ttf': face('Test Serif', 700, false),
    });
    const [family] = gatherImport([{ name: 'Test_Serif.zip', data: zip }]).families;
    expect(family.files.map((f) => f.name).sort()).toEqual(['Test-Serif-Bold.ttf', 'Test-Serif-Regular.ttf']);
  });

  it('keeps a variable font when it is all the family has', () => {
    const [family] = gatherImport([
      { name: 'Test-Serif[wght].ttf', data: face('Test Serif', 400, false, [100, 900]) },
    ]).families;
    expect(family.files).toHaveLength(1);
    expect([...family.covered].sort()).toEqual(['bold', 'regular']);
  });

  it('says why a file or zip is left out', () => {
    const { families, refused } = gatherImport([
      { name: 'notes.txt', data: new TextEncoder().encode('not a font') },
      { name: 'broken.zip', data: new TextEncoder().encode('not a zip') },
      { name: 'empty.zip', data: zipSync({ 'readme.md': new TextEncoder().encode('hi') }) },
    ]);
    expect(families).toEqual([]);
    expect(refused).toEqual([
      { name: 'notes.txt', problem: 'not-a-font' },
      { name: 'broken.zip', problem: 'bad-zip' },
      { name: 'empty.zip', problem: 'empty-zip' },
    ]);
  });
});

describe('faceNames', () => {
  it('lists faces in the order a reader expects, and what is missing as alternatives', () => {
    expect(faceNames(['bold', 'regular'])).toBe('Regular, Bold');
    expect(faceNames(['boldItalic', 'italic'], true)).toBe('Italic or Bold Italic');
    expect(faceNames(['italic', 'bold', 'boldItalic'], true)).toBe('Italic, Bold or Bold Italic');
    expect(faceNames(['italic'], true)).toBe('Italic');
  });
});
