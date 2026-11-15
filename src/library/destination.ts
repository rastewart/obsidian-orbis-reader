// Where a file of ours should be created, when nothing already says.
//
// Two features ask this — a downloaded book and a converted title note — and both want the same answer: the folder the
// reader configured, or failing that the folder most of their title notes are already in. It was part of the library's
// configuration-file module, which multi-device sync replaced; the question outlived the files.

/** The configured folder, or the folder holding most of the title notes. Empty means the vault root. */
export function destinationFolder(preferredFolder: string, titleNoteFolders: readonly string[]): string {
  if (preferredFolder.trim()) return preferredFolder.trim().replace(/\/+$/, '');
  return commonest(titleNoteFolders);
}

/**
 * The folder holding most of a list of notes.
 *
 * Ties go to whichever came first, which for a `metadataCache` walk is stable within a session and arbitrary across
 * them — acceptable, because this only decides where a file is created once, and after that the file itself says.
 */
function commonest(folders: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const folder of folders) counts.set(folder, (counts.get(folder) ?? 0) + 1);
  let best = '';
  let most = 0;
  for (const [folder, count] of counts) {
    if (count > most) {
      best = folder;
      most = count;
    }
  }
  return best;
}
