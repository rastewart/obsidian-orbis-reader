// Print the dictionaries' pinned digests in `sha256sum -c` format, one `<digest>  <file>` line per book.
//
// Usage:
//   pnpm exec tsx scripts/dictionary-pins.ts > pins.txt && (cd dist-assets && sha256sum -c ../pins.txt)
//
// **The pins come from the plugin, not from the workflow.** `.github/workflows/dictionaries.yml` checks what it built
// against this list before uploading anything, so a digest typed into the workflow as well would be a second answer
// to one question — and the two would disagree the first time an edition moved.
import { DICTIONARY_SOURCES } from '../src/reader/lookup/dictionary-sources';

for (const source of DICTIONARY_SOURCES) console.log(`${source.sha256}  ${source.file}`);
