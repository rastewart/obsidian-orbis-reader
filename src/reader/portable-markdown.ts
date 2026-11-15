// A generated note written to leave the vault — Export on a computer, Share on a phone or tablet.
//
// **What changes, and why.** Inside Obsidian a note links into the book (`obsidian://orbis-nav`), to the book's file
// (`[[…]]`), and to its own headings (`[[#…]]`); none of those means anything once the file is somewhere else. So a
// link into the book keeps its label as text and the "Open in book" line goes, the `book` property names the file in
// plain text, and the note's own Contents links to GitHub-style anchors (`contents-links.ts`). What the reader typed in
// a note keeps its words, but a link to another vault note is its text.

/** A link into the book, as the label it would have had: `loc. 42`, or nothing when there is no location. */
export function bookLinkLabel(loc: number | undefined): string {
  return loc != null ? `loc. ${loc}` : '';
}

/** What Obsidian shows for `[[Folder/Note#Heading]]`: the note's name, and the heading after a `>`. */
function wikiDisplay(target: string): string {
  const [path, ...sub] = target.split('#');
  const name = (path.split('/').pop() ?? path).replace(/\.md$/i, '');
  const parts = [name, ...sub.filter((s) => s && !s.startsWith('^'))].filter(Boolean);
  return parts.join(' > ');
}

/**
 * Text the reader typed, with every link into the vault turned into its words.
 *
 * An embed — `![[image.png]]` or a local `![](…)` — has no words to keep and goes, as images do from every exported
 * copy. Web and mail links stay links: they work anywhere.
 */
export function plainVaultLinks(md: string): string {
  return md
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\((?!https?:)[^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_m, target: string) => wikiDisplay(target))
    .replace(/\[([^\]]+)\]\((?!https?:|mailto:)[^)]*\)/g, '$1');
}
