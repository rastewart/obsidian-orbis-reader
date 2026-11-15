import TurndownService from 'turndown';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTurndownService, imageEmbed } from '../turndown-rules';

// Strip surrounding whitespace/newlines to make assertions robust
const convert = (td: TurndownService, html: string) => td.turndown(html).trim();

describe('createTurndownService — images disabled', () => {
  let td: TurndownService;
  beforeAll(() => {
    td = createTurndownService(false);
  });

  it('drops img elements entirely', () => {
    expect(convert(td, '<p>before</p><img src="foo.png" alt="x"><p>after</p>')).toBe('before\n\nafter');
  });
  it('uses ATX heading style for h1', () => {
    expect(convert(td, '<h1>Title</h1>')).toBe('# Title');
  });
  it('uses ATX heading style for h2', () => {
    expect(convert(td, '<h2>Sub</h2>')).toBe('## Sub');
  });
  it('renders hr as ---', () => {
    expect(convert(td, '<hr>')).toBe('---');
  });
  it('uses - as bullet list marker', () => {
    const md = convert(td, '<ul><li>A</li><li>B</li></ul>');
    expect(md).toMatch(/^-\s+A$/m);
    expect(md).toMatch(/^-\s+B$/m);
  });
  it('uses fenced code blocks', () => {
    expect(convert(td, '<pre><code>const x = 1;</code></pre>')).toMatch(/```\nconst x = 1;\n```/);
  });
});

describe('createTurndownService — images wiki format', () => {
  let td: TurndownService;
  beforeAll(() => {
    td = createTurndownService(true, 'wiki');
  });

  it('converts img src to ![[path]] wiki link', () => {
    expect(convert(td, '<img src="assets/cover.jpg">')).toBe('![[assets/cover.jpg]]');
  });
  it('returns empty string for img with no src', () => {
    expect(convert(td, '<img src="">')).toBe('');
  });
});

describe('createTurndownService — images markdown format', () => {
  let td: TurndownService;
  beforeAll(() => {
    td = createTurndownService(true, 'markdown');
  });

  it('converts img to ![alt](src) markdown syntax', () => {
    expect(convert(td, '<img src="cover.jpg" alt="Cover">')).toBe('![Cover](cover.jpg)');
  });
  it('uses empty alt when alt attribute is absent', () => {
    expect(convert(td, '<img src="cover.jpg">')).toBe('![](cover.jpg)');
  });
  // An export named after its book has spaces in its assets folder, and a Markdown destination ends at the first
  // space: Obsidian looked for `test-conversions/Parts` and offered to create it.
  it('encodes a path with spaces or parentheses, which would end the destination', () => {
    expect(convert(td, '<img src="Books/Parts and Chapters (2)-assets/img-001.jpg">')).toBe(
      '![](Books/Parts%20and%20Chapters%20%282%29-assets/img-001.jpg)'
    );
  });
  it('escapes brackets in the alt text, which would end it', () => {
    expect(convert(td, '<img src="a.jpg" alt="Figure [1]">')).toBe('![Figure \\[1\\]](a.jpg)');
  });
});

describe('createTurndownService — tables', () => {
  let td: TurndownService;
  beforeAll(() => {
    td = createTurndownService(false);
  });

  // Every cell used to come out as a paragraph of its own: `Field`, `Meaning`, `name`, … down the page.
  it('writes a table as a Markdown table, under the header row the book marks', () => {
    const html =
      '<table><thead><tr><th>Field</th><th>Meaning</th></tr></thead>' +
      '<tbody><tr><td><em>name</em></td><td>What it is called</td></tr></tbody></table>';
    expect(convert(td, html)).toBe('| Field | Meaning |\n| --- | --- |\n| _name_ | What it is called |');
  });

  // Most books mark no header row; promoting the first row would call it one.
  it('leaves the header row empty when the book marks none', () => {
    expect(convert(td, '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>')).toBe(
      '|  |  |\n| --- | --- |\n| a | b |\n| c | d |'
    );
  });

  it('pads a merged cell, so the cells after it stay in their columns', () => {
    const html =
      '<table><tr><th>A</th><th>B</th><th>C</th></tr>' +
      '<tr><td colspan="2">wide</td><td>c1</td></tr>' +
      '<tr><td rowspan="2">tall</td><td>b2</td><td>c2</td></tr>' +
      '<tr><td>b3</td><td>c3</td></tr></table>';
    expect(convert(td, html)).toBe(
      '| A | B | C |\n| --- | --- | --- |\n| wide |  | c1 |\n| tall | b2 | c2 |\n|  | b3 | c3 |'
    );
  });

  it('keeps a cell to one line, and a pipe in it from ending the cell', () => {
    const html = '<table><tr><td><p>one</p><p>two</p></td><td>a | b</td></tr></table>';
    expect(convert(td, html)).toBe('|  |  |\n| --- | --- |\n| one<br>two | a \\| b |');
  });

  // A cell shows block markers as text: a book indenting a cell with a quotation printed `| > **Q:** |`.
  it('drops a quotation or heading marker from a cell, keeping its words', () => {
    const html = '<table><tr><td><blockquote><b>Q:</b></blockquote></td><td><h4>Note</h4><p>text</p></td></tr></table>';
    expect(convert(td, html)).toBe('|  |  |\n| --- | --- |\n| **Q:** | **Note**<br>text |');
  });

  it('writes a one-column table as paragraphs, and a caption above the table', () => {
    expect(convert(td, '<table><tr><td>A line of verse</td></tr><tr><td>And another</td></tr></table>')).toBe(
      'A line of verse\n\nAnd another'
    );
    expect(convert(td, '<table><caption>Table 1</caption><tr><td>a</td><td>b</td></tr></table>')).toBe(
      'Table 1\n\n|  |  |\n| --- | --- |\n| a | b |'
    );
  });

  it('writes a table inside a cell as that cell’s text', () => {
    const html = '<table><tr><td>outer</td><td><table><tr><td>x</td><td>y</td></tr></table></td></tr></table>';
    expect(convert(td, html)).toBe('|  |  |\n| --- | --- |\n| outer | x y |');
  });
});

describe('imageEmbed', () => {
  // The cover line is written outside Turndown, and was the other place that left the spaces in.
  it('writes the same embed for the cover as for a body image', () => {
    expect(imageEmbed('test-conversions/Parts and Chapters-assets/cover.png', 'markdown')).toBe(
      '![](test-conversions/Parts%20and%20Chapters-assets/cover.png)'
    );
    expect(imageEmbed('test-conversions/Parts and Chapters-assets/cover.png', 'wiki')).toBe(
      '![[test-conversions/Parts and Chapters-assets/cover.png]]'
    );
  });
});

describe('createTurndownService — custom inline rules', () => {
  let td: TurndownService;
  beforeAll(() => {
    td = createTurndownService(false);
  });

  it('converts <sup> to ^content^', () => {
    expect(convert(td, '<p>H<sup>2</sup>O</p>')).toBe('H^2^O');
  });
  it('converts <s> to ~~content~~', () => {
    expect(convert(td, '<p><s>deleted</s></p>')).toBe('~~deleted~~');
  });
  it('converts <del> to ~~content~~', () => {
    expect(convert(td, '<p><del>removed</del></p>')).toBe('~~removed~~');
  });
});

describe('createTurndownService — removed elements', () => {
  let td: TurndownService;
  beforeAll(() => {
    td = createTurndownService(false);
  });

  it('drops <nav>', () => {
    expect(convert(td, '<nav>toc</nav><p>body</p>')).toBe('body');
  });
  it('drops <aside>', () => {
    expect(convert(td, '<aside>sidebar</aside><p>body</p>')).toBe('body');
  });
  it('drops <style>', () => {
    expect(convert(td, '<style>body{}</style><p>body</p>')).toBe('body');
  });
  it('drops <script>', () => {
    expect(convert(td, '<script>alert(1)</script><p>body</p>')).toBe('body');
  });
  it('drops <title>', () => {
    expect(convert(td, '<title>Page Title</title><p>body</p>')).toBe('body');
  });
});

/**
 * **Text that looks like HTML stays text.** A technical book prints a diff of a web page as styled paragraphs;
 * written raw, its `<script type="text/javascript">` line opened an HTML block that ran to the end of the note, so
 * Obsidian saw no heading after it and every link to chapters 8 to 13 said "Unable to find".
 */
describe('createTurndownService — tag-like text', () => {
  const td = createTurndownService(false, 'wiki');

  it("escapes a '<' that could open a tag, so Obsidian shows it rather than parsing it", () => {
    expect(td.turndown('<p>&lt;script type="text/javascript"&gt;</p>')).toBe('\\<script type="text/javascript">');
    expect(td.turndown('<p>+&lt;div id="footer"&gt;contact&lt;/div&gt;</p>')).toBe(
      '+\\<div id="footer">contact\\</div>'
    );
  });

  it("leaves a '<' that opens nothing alone", () => {
    expect(td.turndown('<p>if a &lt; b then</p>')).toBe('if a < b then');
  });

  it('never touches code, which keeps its angle brackets exactly', () => {
    expect(td.turndown('<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>')).toBe(
      '```\n<script>alert(1)</script>\n```'
    );
  });
});
