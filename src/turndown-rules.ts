import TurndownService from 'turndown';
import { encodePath, LINK_ATTR, linkPlaceholder } from './export-links';
import { escapeTagOpeners } from './markdown-line';

/**
 * An image as the export writes it, by **Link format** — for a body image and the cover alike.
 *
 * **The Markdown form encodes its path**, as a link to a chapter does (`encodePath`): an export is named after its
 * book, so its assets folder has spaces in it, and a destination ends at the first one. Brackets in the alt text are
 * escaped for the same reason — a `]` would end it. The wiki form takes the path as it is.
 */
export function imageEmbed(path: string, format: 'wiki' | 'markdown', alt = ''): string {
  if (format === 'markdown') return `![${alt.replace(/[[\]\\]/g, '\\$&')}](${encodePath(path)})`;
  return `![[${path}]]`;
}

/** Languages a book's code block keeps: ones for reading, which no plugin runs as a query or a script on sight. */
const CODE_LANGUAGES = new Set(
  (
    'bash c clojure cpp cs csharp css dart diff dockerfile elixir erlang fsharp go graphql groovy haskell html http ' +
    'ini java javascript js json julia kotlin latex lua makefile markdown matlab objectivec pascal perl php ' +
    'plaintext powershell python py r ruby rust scala sh shell sql swift tex text toml ts typescript vb xml yaml zsh'
  ).split(' ')
);

/** The language a book's code block is written with: from its `language-…` class, or none. */
export function codeBlockLanguage(className: string): string {
  const language = (/(?:^|\s)language-(\S+)/.exec(className)?.[1] ?? '').toLowerCase();
  return CODE_LANGUAGES.has(language) ? language : '';
}

export function createTurndownService(
  includeImages = false,
  imageFormat: 'wiki' | 'markdown' = 'wiki'
): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });

  // Drop non-content elements
  td.remove(['style', 'script', 'title', 'nav', 'aside']);

  /**
   * **A `<` that could open a tag is escaped, so text that looks like HTML stays text.**
   *
   * Turndown escapes Markdown's own syntax and never `<`, so a book's words are written raw — and a technical book
   * prints a diff of a web page as styled paragraphs rather than a code block. Its `<script type="text/javascript">`
   * line opened an HTML block that, with no `</script>` after it, ran to the end of the note: Obsidian saw no heading
   * from that line on, and every link to chapters 8 to 13 said "Unable to find". A `\<` renders as the `<` the book
   * shows. Code blocks never pass through here, so code keeps its angle brackets exactly.
   */
  // `<%` too: Templater's tag, which it runs in a note it is set to process as the note is created.
  const escapeMarkdown = td.escape.bind(td);
  td.escape = (text: string): string => escapeTagOpeners(escapeMarkdown(text));

  /**
   * **A code block keeps its language only when the language names a programming language.** Turndown's own rule
   * writes whatever follows `language-` in the book's class, and the language is what tells another plugin to run a
   * block: ` ```dataviewjs ` is a script Dataview runs when the note is shown. A book's code block becomes code to
   * read, highlighted where the language is one Obsidian knows, and never a query or a script.
   */
  td.addRule('fencedCodeBlock', {
    filter: (node) => node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE',
    replacement: (_content, node) => {
      const codeEl = node.firstChild as Element;
      const language = codeBlockLanguage(codeEl.getAttribute('class') ?? '');
      const code = codeEl.textContent ?? '';
      let size = 3;
      // A fence may be indented up to three spaces, so a run indented that far would close this one too.
      for (const m of code.matchAll(/^ {0,3}(`{3,})/gm)) size = Math.max(size, m[1].length + 1);
      const fence = '`'.repeat(size);
      return `\n\n${fence}${language}\n${code.replace(/\n$/, '')}\n${fence}\n\n`;
    },
  });

  // collectImages mutates img srcs to vault paths before serialization;
  // we just embed whatever src is present when images are enabled.
  td.addRule('images', {
    filter: 'img',
    replacement: (_content, node) => {
      if (!includeImages) return '';
      const el = node as HTMLImageElement;
      const src = el.getAttribute('src') ?? '';
      if (!src) return '';
      return imageEmbed(src, imageFormat, el.getAttribute('alt') ?? '');
    },
  });

  td.addRule('tables', {
    filter: (node) => node.nodeName.toLowerCase() === 'table',
    replacement: (_content, node) => `\n\n${tableMarkdown(node, td)}\n\n`,
  });

  // Superscript → ^text^
  td.addRule('superscript', {
    filter: ['sup'],
    replacement: (content) => `^${content}^`,
  });

  // Strikethrough → ~~text~~
  td.addRule('strikethrough', {
    filter: ['s', 'del'],
    replacement: (content) => `~~${content}~~`,
  });

  /**
   * A link the export marked becomes a placeholder around its text; any other link, its text alone.
   *
   * Which links come over, and as what, is decided in `export-links.ts` once every note exists — a link can point
   * at a chapter that has not been converted yet. This only fences the text so that pass can find it. An unmarked
   * link is one Obsidian has no way to express (another scheme, a target outside the book) or one inside a heading.
   */
  td.addRule('links', {
    filter: 'a',
    replacement: (content, node) => {
      const id = (node as Element).getAttribute?.(LINK_ATTR);
      return id ? linkPlaceholder(id, content) : content;
    },
  });

  return td;
}

/**
 * A table cell's Markdown as one line: a Markdown cell cannot hold a line break, and a `|` would end it.
 *
 * **Block markers go, since a cell shows them as text.** A book that indents a cell with a `<blockquote>` or titles
 * it with a heading would put a literal `>` or `####` at the start of it; the quotation keeps its words, and the
 * heading is kept in bold. A code fence has nothing to fence in one line.
 */
function oneLine(md: string): string {
  return (
    md
      .split('\n')
      .map((l) =>
        l
          .replace(/^(?:\s*>)+\s?/, '')
          .replace(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/, '**$1**')
          .replace(/^\s*(```|~~~).*$/, '')
      )
      .join('\n')
      .trim()
      .replace(/\s*\n+\s*/g, '<br>')
      // A `|` not already escaped. Matched with its backslash, not looked behind for: iOS before 16.4 cannot parse a
      // lookbehind, and an `\|` matched whole is left as it is.
      .replace(/\\?\|/g, (pipe) => (pipe === '|' ? '\\|' : pipe))
  );
}

/**
 * A book's `<table>` as a Markdown table — or, where it is not a grid, as what it is.
 *
 * **The shapes the PDF's reader keeps apart** (`tableBlocks`, book-blocks.ts): a caption is a paragraph above the
 * table, a table with one column is its cells as paragraphs (books use those to center a poem or a title), and a table
 * inside a cell is that cell's text, a row to a line — a Markdown cell holds one line.
 *
 * **Every row as wide as the widest**, and a merged cell (`colspan`, `rowspan`) as itself with empty cells where it
 * spread, so the cells after it stay under their own columns.
 *
 * **The header row is the book's own, or empty.** A Markdown table must have one, and most books mark none — no row
 * of `th`, no `thead`. Without one the header is left blank rather than the first row
 * promoted into a header the book never said it was.
 *
 * Built from the table's own rows rather than from what Turndown made of its children, which has lost which cell
 * was which: each cell is converted on its own, so its links, emphasis and images come out as anywhere else.
 */
function tableMarkdown(table: Element, td: TurndownService): string {
  const name = (el: Element) => el.nodeName.toLowerCase();
  const rows = Array.from(table.querySelectorAll('tr')).filter((tr) => tr.closest('table') === table);
  const cellsOf = (tr: Element) => Array.from(tr.children).filter((c) => name(c) === 'td' || name(c) === 'th');
  const md = (el: Element) => td.turndown(el as HTMLElement).trim();

  if (table.parentElement?.closest('td, th')) {
    return rows
      .map((tr) => cellsOf(tr).map(md).filter(Boolean).join(' '))
      .filter(Boolean)
      .join('\n');
  }

  const caption = Array.from(table.children).find((c) => name(c) === 'caption');
  const out: string[] = caption && md(caption) ? [md(caption)] : [];

  const grid: string[][] = [];
  rows.forEach((tr, r) => {
    const row = (grid[r] ??= []);
    let c = 0;
    for (const cell of cellsOf(tr)) {
      while (row[c] !== undefined) c++;
      const span = (attr: string) => Math.min(Math.max(Number.parseInt(cell.getAttribute(attr) ?? '', 10) || 1, 1), 50);
      const cols = span('colspan');
      const down = Math.min(span('rowspan'), rows.length - r);
      for (let dr = 0; dr < down; dr++) {
        for (let dc = 0; dc < cols; dc++) (grid[r + dr] ??= [])[c + dc] = dr || dc ? '' : md(cell);
      }
      c += cols;
    }
  });
  const width = Math.max(0, ...grid.map((row) => row.length));
  if (!width) return out.join('\n\n');
  if (width === 1) return [...out, ...grid.map((row) => row[0] ?? '').filter(Boolean)].join('\n\n');

  const line = (row: readonly string[]) =>
    `| ${Array.from({ length: width }, (_, i) => oneLine(row[i] ?? '')).join(' | ')} |`;
  const first = rows[0];
  const bookHeader =
    !!first &&
    (first.parentElement?.nodeName.toLowerCase() === 'thead' || cellsOf(first).every((c) => name(c) === 'th'));
  const header = bookHeader ? grid[0] : [];
  const body = bookHeader ? grid.slice(1) : grid;
  const lines = [line(header), `|${' --- |'.repeat(width)}`, ...body.map(line)];
  return [...out, lines.join('\n')].join('\n\n');
}
