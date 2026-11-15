// The ebook formats Orbis opens.
//
// Single-sourced deliberately: this list is what gets registered with Obsidian, what gates the
// "open with Orbis" command, and what scopes every vault-wide scan for books. Separate copies drift,
// and a format missing from one of them makes its books invisible to that feature. Anything that asks
// "is this a book Orbis handles?" belongs here.

export const BOOK_EXTENSIONS = ['epub', 'mobi', 'azw3', 'cbz', 'fb2'] as const;

/** True when `extension` — a `TFile.extension`, i.e. no leading dot — is a format Orbis can open. */
export function isBookExtension(extension: string): boolean {
  return (BOOK_EXTENSIONS as readonly string[]).includes(extension);
}
