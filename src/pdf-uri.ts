// A link out of the book, as a PDF export writes it.

/**
 * A book's address as a PDF link's `/URI`, in hex, or null when it gets no link.
 *
 * **Only the addresses the Markdown export links** (`https`, `http`, `mailto`, `ftp`): a `javascript:`, `file:` or
 * `obsidian:` address from a book is not a link worth handing whoever opens the PDF, and its text stays as text.
 * **Hex, of ASCII.** A literal string was written as the book had it, and a `)` in it ended the string, so the rest
 * of the address could add keys to the link's action. Anything outside printable ASCII is percent-encoded first, as
 * the PDF format asks of a URI.
 */
export function pdfUriHex(href: string): string | null {
  const address = href.trim();
  if (!/^(https?|mailto|ftp):/i.test(address)) return null;
  let ascii: string;
  try {
    ascii = address.replace(/[^\x21-\x7e]/gu, (c) => encodeURIComponent(c));
  } catch {
    return null; // a lone surrogate: not an address
  }
  return Array.from(ascii, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}
