import { describe, expect, it } from 'vitest';
import { metadataFromFb2 } from '../library/fb2';

const fb2 = (titleInfo: string, rest = '') =>
  `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>${titleInfo}</title-info>
    ${rest}
  </description>
  <body><p>text</p></body>
</FictionBook>`;

describe('metadataFromFb2', () => {
  it('reads the title and reassembles the author', () => {
    const meta = metadataFromFb2(
      fb2(
        '<author><first-name>Orbis</first-name><middle-name>James</middle-name><last-name>Tester</last-name></author>' +
          '<book-title>Sample Book</book-title><lang>en</lang>'
      )
    );
    expect(meta.title).toBe('Sample Book');
    expect(meta.authors).toEqual(['Orbis James Tester']);
    expect(meta.language).toBe('en');
  });

  // `document-info` names whoever made the FILE. Reading authors from there credits the novel to whoever ran
  // Calibre.
  it('ignores the author of the document, taking only the author of the book', () => {
    const meta = metadataFromFb2(
      fb2(
        '<author><first-name>Jane</first-name><last-name>Doe</last-name></author><book-title>S&amp;B</book-title>',
        '<document-info><author><nickname>bookscanner99</nickname></author></document-info>'
      )
    );
    expect(meta.authors).toEqual(['Jane Doe']);
  });

  it('takes every author a book credits', () => {
    const meta = metadataFromFb2(
      fb2(
        '<author><last-name>Doe</last-name></author><author><last-name>Doe</last-name></author>' +
          '<book-title>Another Book</book-title>'
      )
    );
    expect(meta.authors).toEqual(['Doe', 'Doe']);
  });

  it('falls back to a nickname when that is all a person has', () => {
    const meta = metadataFromFb2(fb2('<author><nickname>Anon</nickname></author><book-title>T</book-title>'));
    expect(meta.authors).toEqual(['Anon']);
  });

  it('reads the series from the sequence element', () => {
    const meta = metadataFromFb2(fb2('<book-title>T</book-title><sequence name="Sample Series" number="2"/>'));
    expect(meta.series).toBe('Sample Series');
    expect(meta.seriesIndex).toBe('2');
  });

  // The printed edition's publisher and year, not the day someone converted the file.
  it('reads publisher, year and isbn from publish-info', () => {
    const meta = metadataFromFb2(
      fb2(
        '<book-title>T</book-title>',
        '<publish-info><publisher>Sample Press</publisher><year>1868</year><isbn>123</isbn></publish-info>'
      )
    );
    expect(meta.publisher).toBe('Sample Press');
    expect(meta.published).toBe('1868');
    expect(meta.isbn).toBe('123');
  });

  it('is empty for something that is not an FB2', () => {
    expect(metadataFromFb2('not xml <<<').title).toBe('');
    expect(metadataFromFb2('').authors).toEqual([]);
  });
});
