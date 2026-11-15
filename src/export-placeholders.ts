// The fences Save as Markdown leaves in converted text, for a later pass to find: a link's (`export-links.ts`) and a
// footnote's (`export-footnotes.ts`).
//
// Private-use characters: no text a book contains, and not letters or digits, so the text normalizers that run
// between conversion and render (`stripLeadingDuplicateTitle`, which compares a first line by its alphanumerics)
// never see a placeholder as content. The id is spelled in private-use characters too, for the same reason. Built
// from code points, not written as escapes: a formatter turns `` into the invisible character itself.

const DIGIT0 = 0xe010;
/** One digit of an id, as a character class. */
const ID_DIGIT = `[${String.fromCharCode(DIGIT0)}-${String.fromCharCode(DIGIT0 + 15)}]`;

/** A fence kind: its three delimiters, and the pattern that finds one (id in group 1, content in group 2). */
export function fence(first: number): { open: string; mid: string; close: string; token: RegExp; chars: string } {
  const [open, mid, close] = [first, first + 1, first + 2].map((c) => String.fromCharCode(c));
  return {
    open,
    mid,
    close,
    token: new RegExp(`${open}(${ID_DIGIT}+)${mid}([\\s\\S]*?)${close}`, 'g'),
    // Every character a fence of this kind is written with — for a test that text is ONLY fence.
    chars: `${open}${mid}${close}${String.fromCharCode(DIGIT0)}-${String.fromCharCode(DIGIT0 + 15)}`,
  };
}

export const encodeId = (n: number): string =>
  n
    .toString(16)
    .split('')
    .map((c) => String.fromCharCode(DIGIT0 + Number.parseInt(c, 16)))
    .join('');

export const decodeId = (s: string): number =>
  Number.parseInt(
    Array.from(s)
      .map((c) => (c.charCodeAt(0) - DIGIT0).toString(16))
      .join(''),
    16
  );
