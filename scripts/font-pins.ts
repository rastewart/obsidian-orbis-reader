// Print the fonts release's pinned digests in `sha256sum -c` format, one `<digest>  <zip>` line per font.
//
// Usage:
//   pnpm exec tsx scripts/font-pins.ts > pins.txt && (cd dist/fonts && sha256sum -c ../../pins.txt)
//
// **The pins come from the plugin, not from the workflow**, as `dictionary-pins.ts` explains for the dictionaries:
// `.github/workflows/fonts.yml` checks what it built against this list, and a digest typed into the workflow as well
// would be a second answer to one question.
import { FONT_PINS } from '../src/font-pins';

for (const pin of Object.values(FONT_PINS)) console.log(`${pin.sha256}  ${pin.zip}`);
