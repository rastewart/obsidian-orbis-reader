// Which of the vault's notes are named for the selected text.
//
// **Its own module because the answer can be several files.** `metadataCache.getFirstLinkpathDest` returns the
// BEST match, the way `[[crime]]` resolves to exactly one note. With two notes called `crime` in different folders
// it picks one — deterministically, by a rule about proximity to the source path, which for a look-up is the vault
// root and therefore ranks neither — so offering its answer would present an arbitrary winner as the only match.
//
// There is no public API for *all* the matches — `getFirstLinkpathDest` is the only one in the typings — so this
// asks the question directly, which is also the rule the guide can state: a note whose FILE NAME is the
// selected text, ignoring case.

/** The part of `TFile` this needs, so the rule can be tested without a vault. */
export interface NamedFile {
  basename: string;
}

/**
 * Every note whose name is `term`, case-insensitively.
 *
 * Order is the vault's own, which is stable within a session; nothing here ranks them, because ranking is what
 * picks an arbitrary winner. **The caller opens a note only when there is exactly one** — with two there is no
 * obvious destination, and offering one of them is an arbitrary pick. Everything else is the title search below.
 */
export function notesNamed<T extends NamedFile>(files: readonly T[], term: string): T[] {
  const want = term.trim().toLowerCase();
  if (!want) return [];
  return files.filter((file) => file.basename.toLowerCase() === want);
}

/**
 * Obsidian's search query for "files whose title contains this".
 *
 * **There is no count beside this, because no count here can match the search's.** `vault.getFiles()` returns
 * files Obsidian's search does not index — Orbis's own `.location.*.json` and `.pages.json` sidecars among them —
 * while `.orbis` and `.base` DO appear there, because this plugin registers those extensions and Obsidian therefore
 * knows them. A count of notes named exactly `term` is a different question from every title containing it.
 *
 * **Matching the number means replicating which extensions Obsidian indexes** — undocumented, different between
 * releases, and extended by whatever other plugins are installed. A count that is wrong is worse than no count,
 * and this one could only ever be right by accident. So the button names the search and the search reports its
 * own total, which is the one number that cannot disagree with itself.
 *
 * Quoted so a multi-word selection stays one term.
 */
export function titleSearchQuery(term: string): string {
  return `file:"${term}"`;
}
