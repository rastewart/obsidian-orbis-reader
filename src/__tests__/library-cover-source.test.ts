import { describe, expect, it } from 'vitest';
import {
  cbzCoverEntry,
  coverExtension,
  coverHrefFromOpf,
  extensionForMime,
  fb2CoverBinary,
  sniffImageExtension,
  zipEntryForHref,
} from '../library/cover-source';

const opf = (body: string) => `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf">${body}</package>`;

describe('coverHrefFromOpf', () => {
  it('follows EPUB 2s meta name="cover" to the manifest item it names', () => {
    const xml = opf(`
      <metadata><meta name="cover" content="cover-img"/></metadata>
      <manifest>
        <item id="chap1" href="text/1.xhtml" media-type="application/xhtml+xml"/>
        <item id="cover-img" href="images/front.jpeg" media-type="image/jpeg"/>
      </manifest>`);
    expect(coverHrefFromOpf(xml)).toBe('images/front.jpeg');
  });

  it("reads EPUB 3's cover-image property", () => {
    const xml = opf(`<manifest>
        <item id="c" href="Images/cover.png" media-type="image/png" properties="cover-image"/>
      </manifest>`);
    expect(coverHrefFromOpf(xml)).toBe('Images/cover.png');
  });

  // A property list is space-separated, so a substring match would find "cover-image" inside other words too.
  it('does not mistake a different property for the cover', () => {
    const xml = opf(`<manifest>
        <item id="c" href="a.png" media-type="image/png" properties="svg scripted"/>
      </manifest>`);
    expect(coverHrefFromOpf(xml)).toBeNull();
  });

  // Plenty of books declare nothing and still ship cover.jpeg. Refusing to look means a generated tile for a book
  // with perfectly good artwork.
  it('falls back to an image that calls itself a cover', () => {
    const xml = opf(`<manifest>
        <item id="i1" href="images/logo.png" media-type="image/png"/>
        <item id="i2" href="images/Cover.jpg" media-type="image/jpeg"/>
      </manifest>`);
    expect(coverHrefFromOpf(xml)).toBe('images/Cover.jpg');
  });

  it('is null for an OPF with no images, and for nonsense', () => {
    expect(coverHrefFromOpf(opf('<manifest/>'))).toBeNull();
    expect(coverHrefFromOpf('not xml at all <<<')).toBeNull();
  });
});

describe('zipEntryForHref', () => {
  it('resolves against the folder the OPF is in', () => {
    expect(zipEntryForHref('OEBPS/content.opf', 'images/front.jpeg')).toBe('OEBPS/images/front.jpeg');
    expect(zipEntryForHref('content.opf', 'cover.jpg')).toBe('cover.jpg');
  });

  // A zip has no notion of `..`, so an unresolved segment matches nothing at all.
  it('resolves dot segments', () => {
    expect(zipEntryForHref('OEBPS/xml/content.opf', '../images/c.jpg')).toBe('OEBPS/images/c.jpg');
    expect(zipEntryForHref('OEBPS/content.opf', './c.jpg')).toBe('OEBPS/c.jpg');
  });

  it('decodes escapes, and drops a fragment', () => {
    expect(zipEntryForHref('OEBPS/content.opf', 'Images/cover%20a.jpg')).toBe('OEBPS/Images/cover a.jpg');
    expect(zipEntryForHref('OEBPS/content.opf', 'c.jpg#page')).toBe('OEBPS/c.jpg');
    // A stray percent is a character here, not a broken escape.
    expect(zipEntryForHref('', '100%25 cover.jpg')).toBe('100% cover.jpg');
  });

  it('treats a leading slash as the root of the archive', () => {
    expect(zipEntryForHref('OEBPS/content.opf', '/images/c.jpg')).toBe('images/c.jpg');
  });
});

describe('cbzCoverEntry', () => {
  // Page one, and page one is whichever name sorts first the way a person sorts: page10 comes after page2.
  it('takes the first page in reading order', () => {
    expect(cbzCoverEntry(['page10.jpg', 'page2.jpg', 'page1.jpg'])).toBe('page1.jpg');
  });

  it('ignores non-images and macOS metadata', () => {
    expect(cbzCoverEntry(['__MACOSX/._p1.jpg', 'ComicInfo.xml', 'p1.png'])).toBe('p1.png');
    expect(cbzCoverEntry(['ComicInfo.xml'])).toBeNull();
    expect(cbzCoverEntry([])).toBeNull();
  });
});

describe('fb2CoverBinary', () => {
  const fb2 = (cover: string, binaries: string) =>
    `<?xml version="1.0"?><FictionBook><description><title-info>${cover}</title-info></description>${binaries}</FictionBook>`;

  it('follows the coverpage to the binary it names', () => {
    const xml = fb2(
      '<coverpage><image l:href="#cover.jpg"/></coverpage>',
      '<binary id="other.png" content-type="image/png">AAAA</binary>' +
        '<binary id="cover.jpg" content-type="image/jpeg">Zm9v</binary>'
    );
    expect(fb2CoverBinary(xml)).toEqual({ base64: 'Zm9v', mime: 'image/jpeg' });
  });

  // The href prefix is whatever the producer felt like: l:, xlink:, or none at all.
  it('copes with any namespace prefix, and with none', () => {
    for (const attr of ['l:href', 'xlink:href', 'href']) {
      const xml = fb2(`<coverpage><image ${attr}="#c"/></coverpage>`, '<binary id="c">Zm9v</binary>');
      expect(fb2CoverBinary(xml)?.base64).toBe('Zm9v');
    }
  });

  // Base64 in these files is wrapped across lines, which is not part of the payload.
  it('strips the line breaks the payload is wrapped in', () => {
    const xml = fb2('<coverpage><image href="#c"/></coverpage>', '<binary id="c">Zm9\n  v\n</binary>');
    expect(fb2CoverBinary(xml)?.base64).toBe('Zm9v');
  });

  it('falls back to a binary that calls itself a cover', () => {
    const xml = fb2('', '<binary id="cover-image.jpg" content-type="image/png">Zm9v</binary>');
    expect(fb2CoverBinary(xml)).toEqual({ base64: 'Zm9v', mime: 'image/png' });
  });

  it('is null when there is nothing to find', () => {
    expect(fb2CoverBinary(fb2('', '<binary id="logo.png">AA</binary>'))).toBeNull();
    expect(fb2CoverBinary('')).toBeNull();
    // Named but absent, and present but empty: both are "no cover" rather than a broken one.
    expect(fb2CoverBinary(fb2('<coverpage><image href="#gone"/></coverpage>', ''))).toBeNull();
    expect(fb2CoverBinary(fb2('<coverpage><image href="#c"/></coverpage>', '<binary id="c"></binary>'))).toBeNull();
  });
});

describe('sniffImageExtension', () => {
  // A MOBI hands its cover over with no media type at all, so the bytes are the only thing to go on.
  it('recognises the formats a cover is stored in', () => {
    expect(sniffImageExtension(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe('png');
    expect(sniffImageExtension(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffImageExtension(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe('gif');
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffImageExtension(webp)).toBe('webp');
  });

  it('is null for anything else, and for nothing at all', () => {
    expect(sniffImageExtension(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(sniffImageExtension(new Uint8Array())).toBeNull();
  });
});

describe('extensionForMime', () => {
  it('keeps what is worth keeping', () => {
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('')).toBe('jpg');
  });
});

describe('coverExtension', () => {
  it('keeps a format worth keeping and calls everything else jpg', () => {
    expect(coverExtension('a/b/cover.PNG')).toBe('png');
    expect(coverExtension('cover.webp')).toBe('webp');
    expect(coverExtension('cover.jpeg')).toBe('jpg');
    expect(coverExtension('cover')).toBe('jpg');
  });
});
