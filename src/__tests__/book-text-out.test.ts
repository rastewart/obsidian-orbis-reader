// A book's own text reaching Obsidian's window, a note, a PDF or a playlist arrives as text: it does not fetch
// anything, become markup, run as another plugin's script, or add structure of its own. Each test answers one finding
// of the November security scan; see docs/design/security.md.

import { describe, expect, it } from 'vitest';
import { linkDestination } from '../export-links';
import { bookTextLine } from '../markdown-line';
import { pdfUriHex } from '../pdf-uri';
import { RECORD_MARKER, withoutMarker } from '../reader/annotation-records';
import { isBookImage } from '../reader/image-copy';
import { MANIFEST_VERSION, writeEditionPlaylist } from '../reader/tts/recording';
import { codeBlockLanguage, createTurndownService } from '../turndown-rules';

describe('the image viewer takes only the book’s own pictures', () => {
  it('accepts a blob: copy and an inline data: picture', () => {
    expect(isBookImage('blob:app://obsidian.md/0ab9')).toBe(true);
    expect(isBookImage('data:image/png;base64,iVBOR')).toBe(true);
  });

  it('refuses a remote or local address the chapter would not have loaded', () => {
    for (const src of ['https://example.com/pixel.png', 'http://192.168.1.1/x', 'app://obsidian.md/x.png', ''])
      expect(isBookImage(src)).toBe(false);
  });
});

describe('a book’s code block in Save as Markdown', () => {
  const md = (html: string) => createTurndownService().turndown(html);

  it('keeps a programming language, for highlighting', () => {
    expect(md('<pre><code class="language-python">print(1)</code></pre>')).toBe('```python\nprint(1)\n```');
  });

  it('drops a language another plugin would run: a Dataview script or query', () => {
    expect(md('<pre><code class="language-dataviewjs">dv.paragraph(1)</code></pre>')).toBe('```\ndv.paragraph(1)\n```');
    expect(codeBlockLanguage('language-dataview')).toBe('');
    expect(codeBlockLanguage('hljs language-query')).toBe('');
  });

  it('still fences a block that holds a fence of its own', () => {
    expect(md('<pre><code>```\nx\n```</code></pre>')).toBe('````\n```\nx\n```\n````');
  });

  it('counts a fence indented up to three spaces, which would close the block and open a script', () => {
    expect(md('<pre><code>x\n ```\n   ```dataviewjs\ndv.paragraph(1)</code></pre>')).toBe(
      '````\nx\n ```\n   ```dataviewjs\ndv.paragraph(1)\n````'
    );
  });

  it('escapes Templater’s tag in running text, so it shows rather than runs', () => {
    expect(md('<p>Run <% tp.file.title %> now</p>')).toBe('Run \\<% tp.file.title %> now');
  });
});

describe('a book’s web address in a Markdown link', () => {
  it('cannot end the link: a > inside it is encoded, so nothing after it is HTML', () => {
    const dest = linkDestination('https://example.com/a b><iframe src=x>');
    expect(dest).toBe('https://example.com/a%20b%3E%3Ciframe%20src=x%3E');
  });

  it('cannot end the link with a trailing backslash, a parenthesis or a space before a picture', () => {
    const dest = linkDestination('https://a.example/ ![](https://evil.example/t.png)\\');
    expect(dest).toBe('https://a.example/%20![]%28https://evil.example/t.png%29%5C');
    expect(dest).not.toMatch(/[\s()<>\\`]/);
  });

  it('encodes a space beyond ASCII as its UTF-8 bytes', () => {
    expect(linkDestination('https://example.com/a\u3000b')).toBe('https://example.com/a%E3%80%80b');
  });

  it('keeps an ordinary address as the book wrote it, its parentheses encoded', () => {
    expect(linkDestination('https://example.com')).toBe('https://example.com');
    expect(linkDestination('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe(
      'https://en.wikipedia.org/wiki/Foo_%28bar%29'
    );
  });

  it('turns a line break into its code rather than a new line in the note', () => {
    expect(linkDestination('https://example.com/a\nb')).toBe('https://example.com/a%0Ab');
  });

  it('gives nothing for text that is not an address', () => {
    expect(linkDestination('not an address')).toBeNull();
  });
});

describe('a book’s title or contents label as a line of a note', () => {
  it('shows a tag as text, so a heading fetches no picture', () => {
    expect(bookTextLine('Chapter <img src="https://example.com/p.png">')).toBe(
      'Chapter \\<img src="https://example.com/p.png">'
    );
  });

  it('stays on one line, so a line break cannot start a block of its own', () => {
    expect(bookTextLine('Part One\n\n# Not a heading')).toBe('Part One # Not a heading');
  });

  it('escapes a backslash before the tag, so the book’s own cannot cancel the escape', () => {
    expect(bookTextLine('\\<img src="https://example.com/p.png">')).toBe('\\\\\\<img src="https://example.com/p.png">');
  });

  it('shows a picture or a link as text, so a heading fetches nothing', () => {
    expect(bookTextLine('Chapter ![x](https://example.com/p.png)')).toBe('Chapter !\\[x\\](https://example.com/p.png)');
  });

  it('leaves an ordinary title alone, angle brackets that open nothing included', () => {
    expect(bookTextLine('Sample Book: 3 < 4')).toBe('Sample Book: 3 < 4');
  });
});

describe('a book’s web address as a PDF link', () => {
  const ascii = (hex: string | null) =>
    hex ? hex.replace(/../g, (h) => String.fromCharCode(Number.parseInt(h, 16))) : null;

  it('is written in hex, so a ) in it cannot end the string and add keys to the link', () => {
    const hex = pdfUriHex('https://example.com/a)/S/JavaScript/JS(app.alert(1)');
    expect(hex).toMatch(/^[0-9a-f]+$/);
    expect(ascii(hex)).toBe('https://example.com/a)/S/JavaScript/JS(app.alert(1)');
  });

  it('percent-encodes what is not printable ASCII', () => {
    expect(ascii(pdfUriHex('https://example.com/café a'))).toBe('https://example.com/caf%C3%A9%20a');
  });

  it('gives no link to a script, a file or an Obsidian action', () => {
    for (const href of ['javascript:alert(1)', 'file:///etc/passwd', 'obsidian://open?vault=x'])
      expect(pdfUriHex(href)).toBeNull();
  });
});

describe('the reading-record marker in text from a book', () => {
  it('is removed until none is left, when one is nested inside another', () => {
    const half = Math.floor(RECORD_MARKER.length / 2);
    const nested = RECORD_MARKER.slice(0, half) + RECORD_MARKER + RECORD_MARKER.slice(half);
    expect(withoutMarker(`before ${nested} after`)).not.toContain(RECORD_MARKER);
  });
});

describe('a recording’s playlist', () => {
  it('writes a contents label with a line break as one #EXTINF line', async () => {
    const files = new Map<string, string>([
      [
        'audio/manifest.json',
        JSON.stringify({
          version: MANIFEST_VERSION,
          chapters: [{ index: 0, title: 'One\nhttps://example.com/x.mp3', duration: 10, audioFile: 'ch0000.mp3' }],
        }),
      ],
    ]);
    const app = {
      vault: {
        adapter: {
          exists: async (p: string) => files.has(p),
          read: async (p: string) => files.get(p) ?? '',
          write: async (p: string, s: string) => void files.set(p, s),
        },
      },
    };
    await writeEditionPlaylist(app as never, 'audio', 'Book');
    expect(files.get('audio/Book.m3u')).toBe('#EXTM3U\n#EXTINF:10,One https://example.com/x.mp3\nch0000.mp3\n');
  });
});
