// Sample Markdown notes for the notes-to-EPUB converter: Save note as EPUB, the two folder modes, and Read in Orbis.
//
// Written to test-vault/fixtures/notes-to-epub/ by `pnpm build:fixtures`. Every case the converter handles or treats
// specially appears in at least one note, and each note says in its own text what it is for, so a manual check can
// read the note beside the book it became. The books those commands write (`*.epub`, `*-EPUB/`, `!orbis-data/`) are
// gitignored: they are outputs, and the checks make them fresh.
//
// **Titles that differ from the file name say so** — `Kitchen Sink (frontmatter title)` — because "the title comes from
// frontmatter, not the file name" is one of the cases, and a book called that cannot be mistaken for either.

import { png } from './png';
import { proseFrom } from './prose';

export interface NoteFile {
  /** Relative to test-vault/fixtures/notes-to-epub/. */
  path: string;
  content: string | Uint8Array;
}

const p = proseFrom(1401);
/** A few paragraphs of invented prose, blank-line separated. */
const prose = (chars: number) => p.paragraphsOf(chars).join('\n\n');

/** One note exercising everything a single note can hold. Save note as EPUB, split at H2. */
const KITCHEN_SINK = `---
title: Kitchen Sink (frontmatter title)
author:
  - "[[Orbis Tester|O. Tester]]"
publisher: Orbis Reader Fixtures
publication_date: 2026-04-02
language: en
---
This paragraph comes before the first heading, so it becomes a section of its own, titled with the book's title. The book's author should read "O. Tester": a wikilink's alias wins over its target.

${prose(600)}

## Text and emphasis

Plain, *italic*, **bold**, ==highlighted==, ~~struck~~, \`inline code\`, <kbd>Ctrl</kbd> and <span style="color: red">a span whose style is stripped</span>. %%This comment must not appear in the book.%%

Emoji, which a PDF draws as color pictures: 😀 👍🏽 👨‍👩‍👧 🇯🇵 1️⃣ ©️ — and a plain ♥, which a font draws as text.

This paragraph is hard-wrapped
in the note, one clause per line,
and each line should end with a line break in the book.

A two-space break ends this line
and this line follows it.

\`\`\`js
// [[Not a link]] — a wikilink inside a code fence stays text
const lanterns = ['north', 'south'];
\`\`\`

### A heading with punctuation: commas, "quotes" & ampersands?

${prose(400)}

#### A fourth-level heading

${prose(300)}

## Notes

The first of two headings called Notes; the second gets an id ending in -2. A footnote reference[^1] and an inline footnote^[This one is defined where it is used.].

> A blockquote, with **bold** inside it.

---

The rule above is a horizontal rule in the middle of the note, not frontmatter.

## Lists, tasks and callouts

- [ ] An open task (☐)
- [x] A done task (☑)
- [/] A task with a custom status

3. An ordered list
4. that starts at three

> [!note] A titled callout
> Its body keeps the callout box.

> [!tip]- A folded callout
> Its body is collapsed in the note.

> [!warning] An outer callout
> > [!info] A nested callout
> > Inside the outer one.

## Tables

| Case | Cell |
| --- | --- |
| A link with an alias in a table | [[#Tables\\|this table]] |
| An empty cell | |

## Links

- To a heading in this note: [[#Tables]], [to Tables](#Tables), [[Kitchen Sink#Notes]]
- To a block in this note: [[#^blk]]
- To a heading that does not exist: [[#No Such Heading]]
- To another note: [[Clipped Article]] — plain text in a single-note book
- To a note that does not exist: [[Missing Note]]
- To the web, with a query string and a fragment: https://example.com/search?q=orbis&page=2#results
- Autolinked: <https://example.org>
- Mail: [write](mailto:someone@example.com)
- Another scheme, which becomes plain text: [open a vault](obsidian://open?vault=x)
- A tag: #sample/tag

This paragraph is the target of the block link above. ^blk

## Images and embeds

![[attachments/a/diagram.png]]

![[attachments/b/diagram.png|200]]

The same image as the first, a second time — stored once in the book:

![](attachments/a/diagram.png)

An image that does not exist: ![[missing.png]]

A remote image, left out unless remote images are turned on: ![](https://example.com/nope.png)

<img src="https://example.com/raw.png" alt="a raw remote image">

An embedded note and an embedded heading:

![[Clipped Article]]

![[Clipped Article#Section Two]]

## Left out or empty

Inline math $x^2$ and a block:

$$
e = mc^2
$$

\`\`\`mermaid
graph TD; A-->B;
\`\`\`

\`\`\`dataview
LIST FROM #sample
\`\`\`

<details><summary>A details element</summary>Its text should survive.</details>

<iframe src="https://example.com"></iframe>

## Notes

The second heading called Notes.

[^1]: The footnote's text, defined at the end of the note and linked back from its reference.
`;

/** Shaped like an Obsidian Web Clipper note — Read in Orbis's usual input. */
const CLIPPED_ARTICLE = `---
title: "Clipped Article (frontmatter title)"
source: https://example.com/articles/clipped?utm_source=clipper&ref=rss
author:
  - "[[Orbis Tester]]"
published: 2026-05-14
created: 2026-05-15
description: A sample shaped like a web clip, for Read in Orbis Reader.
tags:
  - clippings
---
Clipped notes arrive without a first-level heading and with one paragraph per line, as this one does. Its source is a URL, so the book's title note offers Open source.
${p.paragraphsOf(900).join('\n')}
[
![avatar](https://example.com/a.jpg)
]
An embedded post leaves a bracketed image like the one above; the book shows what survives of it.
![a CDN image whose type is read from its bytes](https://cdn.example.com/fetch/f_webp,w_800/photo.png)

## Section One

${prose(600)}

## Section Two

${prose(600)}

> A quotation from the article.

## Section Three

A link that keeps its query string: [the source](https://example.com/articles/clipped?page=2&view=full).

${prose(400)}
`;

/** The folder modes: Save folder as EPUB, and Save folder notes as EPUBs. */
const FIELD_GUIDE: Record<string, string> = {
  '001-README.md': `---
title: Field Guide (frontmatter title)
author: Orbis Tester
language: en
---
# Field Guide

The index note. Its links set the chapter order: Tools, Getting Started, then Trails — not file-name order — and Tools is linked twice but appears once. The Appendix and the long-named note are not linked, so they come last, in number order.

1. [[004-Tools]]
2. [[002-Getting Started]]
3. [[003-Trails]]
4. [[004-Tools]] again

| Chapter | Link |
| --- | --- |
| Trails, from a table | [[003-Trails\\|Trails]] |

Links that lead out of the book, and stay plain text: [[Kitchen Sink]] (outside the folder), [[Archive/Old Draft]] (a subfolder), [[attachments/a/diagram.png]] (an attachment).
`,
  '002-Getting Started.md': `---
title: Getting Started (frontmatter title)
---
This note has no first-level heading, so its chapter is named from its frontmatter title. The number prefix is dropped from the chapter's name.

## Overview

${prose(500)}

- To a heading in another note: [[003-Trails#Overview]] — lands on Trails' own Overview, not this one
- To a heading that does not exist there: [[003-Trails#No Such Heading]] — lands at the top of Trails
- To a block there: [[003-Trails#^trail-marker]]
- A Markdown link: [Trails' overview](003-Trails.md#Overview) and [Trails](<003-Trails.md>)
- To this note's own heading: [[002-Getting Started#Overview]]
- To the index: [[001-README]]
- To a note that does not exist: [[Missing Chapter]]
`,
  '003-Trails.md': `---
author: "[[Orbis Tester|O. Tester (Trails)]]"
---
# *Trails* and [[001-README|the guide]]

The heading above has emphasis and a link; the chapter's name should be its plain text. This note has only third-level headings below it, and its own author, which a book of its own uses.

### Overview

${prose(500)}

This paragraph is the block Getting Started links to. ^trail-marker

![[attachments/a/diagram.png]]

### Marked trails

${prose(500)}
`,
  '004-Tools.md': `This note has no headings and no frontmatter. Its chapter is named from its file name, without the number.

${prose(700)}

![a remote image](https://example.com/tools.png)
`,
  '005-Part  Two – a deliberately long note name with en dashes – well past eighty characters.md': `This note's name has two spaces in a row, en dashes, and more than eighty characters: Read in Orbis mirrors it to eighty characters, and a book of its own tests whether the links to it still arrive.

Back to [[002-Getting Started]].

${prose(400)}
`,
  '010-Appendix.md': `Not linked from the index, so it comes after the linked notes, in number order.

## Overview

A third heading called Overview, in a third note.

${prose(400)}
`,
  'Archive/Old Draft.md': `In a subfolder, so neither folder mode includes it. Links to [[003-Trails]].
`,
};

/** Two different images with the same file name, in two folders, and a missing one referred to above. */
const diagram = (color: readonly [number, number, number]) =>
  png(240, 160, [245, 243, 238], [{ from: 0.3, to: 0.7, color }], 4);

export function sampleNotes(): NoteFile[] {
  return [
    { path: 'Kitchen Sink.md', content: KITCHEN_SINK },
    { path: 'Clipped Article.md', content: CLIPPED_ARTICLE },
    ...Object.entries(FIELD_GUIDE).map(([name, content]) => ({ path: `Field Guide/${name}`, content })),
    { path: 'attachments/a/diagram.png', content: diagram([70, 110, 150]) },
    { path: 'attachments/b/diagram.png', content: diagram([150, 80, 60]) },
  ];
}
