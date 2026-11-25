// Build the zips of the `fonts` release: one per font, holding its four faces and its licence.
//
// Usage:
//   pnpm build:fonts
//
// Writes `dist/fonts/<id>-<version>.zip` for each font below, and `src/font-pins.ts`, which names each zip with its
// size and SHA-256 so the plugin downloads exactly that file and refuses any other. Then upload the zips to the
// `fonts` release, never replacing a file already there: an older build still downloads the zip it pinned.
//
// **Every input is pinned.** Each file comes from a fixed commit of the font's own repository (DejaVu from a fixed npm
// version), and is checked against the SHA-256 recorded here before it is packed — see `pinned-download.ts`. The
// files are packed unchanged, so no font is a modified version under its licence.
//
// **Static faces only.** A PDF (pdf-lib) embeds a variable font at its default weight, so each zip holds the separate
// Regular, Italic, Bold and Bold Italic files the project publishes. Lexend has no italic, so it has two.
//
// **The same bytes every time**: the zip's entries are sorted and dated 1980-01-01, as the test fixtures are packed,
// so building again from the same pins gives the same zips and the same `font-pins.ts`.
//
// See docs/design/fonts.md § Downloads.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadPinned } from './pinned-download';
import { packTestFixtures as packSorted } from './release-lib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'fonts');
const PINS = path.join(ROOT, 'src', 'font-pins.ts');

interface Pinned {
  url: string;
  sha256: string;
}

interface FontSource {
  /** The zip's name, before the version, and the key the plugin knows it by. */
  id: string;
  /** The font's own version, from its files' name table. */
  version: string;
  /** The folder the zip unpacks into, inside the vault's fonts folder. */
  folder: string;
  /** The files, by the name each has in the zip. The licence is one of them. */
  files: Record<string, Pinned>;
}

const gh = (repo: string, commit: string, file: string) =>
  `https://raw.githubusercontent.com/${repo}/${commit}/${file}`;

const GOOGLE_FONTS = 'google/fonts';
const GOOGLE_FONTS_AT = '6ebe737e44fd64ee736bbc6feed6136a6dbfd222';
const OPENDYSLEXIC_AT = '1824da5c0e41dc3e13ffc7f3a636dcaf695d61b7';
const LEXEND_AT = '7894f02b2e7eabc48595f1d4eff3b17b48c6e651';
const LITERATA_AT = '0c2761b727a1b3a7cffd313c37f0f5163dfc7a63';
const SOURCE_SERIF_AT = '80d3f8894c09c937bebfa9011247d2e1c79fd6f4';
const EB_GARAMOND_AT = '106a4a6d377987459ae5e68673a4570f13b957fb';
const DEJAVU = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3';

const SOURCES: FontSource[] = [
  {
    id: 'opendyslexic',
    version: '0.990',
    folder: 'OpenDyslexic',
    files: Object.fromEntries([
      ...(
        [
          ['Regular', '32f5840fb2bf844bdabafe372591ddfb9286e98117f5b21950aaf54ea856919a'],
          ['Italic', 'dfa0185bb0d47cb76cb5d082531822d0dca03152f5b6ec6c9f6e3f8d00b71782'],
          ['Bold', '5d690ea4c87ccb0d5d5d81487826a395e9b20a6c1d606f1f262c060d2bef4f03'],
          ['BoldItalic', '95894a308f534d152ce96fb764caddded0d56a82d67d4686eb1fb900368228ee'],
        ] as const
      ).map(([face, sha256]) => [
        `OpenDyslexic-${face}.otf`,
        { url: gh('antijingoist/opendyslexic', OPENDYSLEXIC_AT, `compiled/OpenDyslexic-${face}.otf`), sha256 },
      ]),
      [
        'OFL.txt',
        {
          url: gh('antijingoist/opendyslexic', OPENDYSLEXIC_AT, 'OFL.txt'),
          sha256: 'caafcccfb70fc72458fcbda812ec8f0a06cb300cbabb87eabbb30b946124394b',
        },
      ],
    ]),
  },
  {
    id: 'atkinson-hyperlegible',
    version: '1.006',
    folder: 'Atkinson Hyperlegible',
    files: Object.fromEntries([
      ...(
        [
          ['Regular', '7fb917c89019896d0b52ee84b7cbb3304c18cb90b19a62f5e32712bd23e97669'],
          ['Italic', '021beda4d3c6edfc78872e436d74009f9a1bcb294331908fe5747c61d3dcc514'],
          ['Bold', '5a3b0c8cc8ca545155150b4512a1fa248298df121c50d6557e651e61fbdab92f'],
          ['BoldItalic', '7a46f1b0ef2f64b61065c1a6b5a11fcb9b019b44062d88ba121a083cc39e86bf'],
        ] as const
      ).map(([face, sha256]) => [
        `AtkinsonHyperlegible-${face}.ttf`,
        {
          url: gh(GOOGLE_FONTS, GOOGLE_FONTS_AT, `ofl/atkinsonhyperlegible/AtkinsonHyperlegible-${face}.ttf`),
          sha256,
        },
      ]),
      [
        'OFL.txt',
        {
          url: gh(GOOGLE_FONTS, GOOGLE_FONTS_AT, 'ofl/atkinsonhyperlegible/OFL.txt'),
          sha256: 'f32d22b3908fcad2c86a74000614ec22e6a7f66ea7e867e616026a27aebdc143',
        },
      ],
    ]),
  },
  {
    id: 'lexend',
    version: '1.008',
    folder: 'Lexend',
    files: {
      'Lexend-Regular.ttf': {
        url: gh('googlefonts/lexend', LEXEND_AT, 'fonts/lexend/ttf/Lexend-Regular.ttf'),
        sha256: 'e2082c28389e9871d5d77ae9163d5c0c1c259fe39bdac91f73d56a600b61f60f',
      },
      'Lexend-Bold.ttf': {
        url: gh('googlefonts/lexend', LEXEND_AT, 'fonts/lexend/ttf/Lexend-Bold.ttf'),
        sha256: '4509838acc21f2c066e9874c9c5eb52b9b8cdac1771a9c1fe9e7e2cda41ce082',
      },
      'OFL.txt': {
        url: gh('googlefonts/lexend', LEXEND_AT, 'OFL.txt'),
        sha256: '5da8505887d0fa7fe963445fd58852707fda34adfeb65af25c99d152bab285bd',
      },
    },
  },
  {
    id: 'literata',
    version: '3.103',
    folder: 'Literata',
    files: Object.fromEntries([
      ...(
        [
          ['Regular', '0390890de9bb9d5862a6ba4125b82c61792ccc3d66b63e73eee75c1a16fcd208'],
          ['Italic', '198f70cc9a17bab578553fa274b81984d58c440efe26bc06f1d841c194b6691a'],
          ['Bold', 'b6af95b3b443cdbce964aa06741596987f2f5c3ede46a2bc846e5addd99d061f'],
          ['BoldItalic', '1dade59381ad02f4679d7e993a7a406472e587ac332af7a6168d3ad9214a99dc'],
        ] as const
      ).map(([face, sha256]) => [
        `Literata-${face}.ttf`,
        { url: gh('googlefonts/literata', LITERATA_AT, `fonts/ttf/Literata-${face}.ttf`), sha256 },
      ]),
      [
        'OFL.txt',
        {
          url: gh('googlefonts/literata', LITERATA_AT, 'OFL.txt'),
          sha256: '8742963604cd89dc81437811a850018fc03b2bfad686d7422c8235967c87614e',
        },
      ],
    ]),
  },
  {
    id: 'source-serif-4',
    version: '4.005',
    folder: 'Source Serif 4',
    files: Object.fromEntries([
      ...(
        [
          ['Regular', 'e5a4ee6a3d87bb9024796be390c6771e2a0eb1883dae25effaf57ca01668e24b'],
          ['It', '9d2950a8f1da66e21502c35d646a1d2148e79f9ea43fd2158cf02f5232e7f430'],
          ['Bold', '7cf4f4e1ad74f45058d5bc61716b82560442fbdcd9d3654d2dea96bf6c683d86'],
          ['BoldIt', '7b215b37f8873f5579f3f8d2ded3ca7c588e2f435cd996605ebfc5befe2cd5eb'],
        ] as const
      ).map(([face, sha256]) => [
        `SourceSerif4-${face}.ttf`,
        { url: gh('adobe-fonts/source-serif', SOURCE_SERIF_AT, `TTF/SourceSerif4-${face}.ttf`), sha256 },
      ]),
      [
        'LICENSE.md',
        {
          url: gh('adobe-fonts/source-serif', SOURCE_SERIF_AT, 'LICENSE.md'),
          sha256: 'c21d7293d87b6d7ab1d0229a2f55b77f33a7613a6a4e66f6693d68d7d8d09464',
        },
      ],
    ]),
  },
  {
    id: 'eb-garamond',
    version: '1.002',
    folder: 'EB Garamond',
    files: Object.fromEntries([
      ...(
        [
          ['Regular', '2028dc06d3c130b4761693481436a32a8e35ed500bf58c25c53de004106125b8'],
          ['Italic', 'd4ad1d0a9390d26d6d3f176117a1d121441edb8c8632bfca52cfad084b9059cb'],
          ['Bold', '0cfed122e51e3fd44ccedaef7637efed6d5bdc4ad89a6117d70241510309a186'],
          ['BoldItalic', '3437cf76a720b01580218614e7f0ce9d66035a075c34a98394cec9a888cf38d6'],
        ] as const
      ).map(([face, sha256]) => [
        `EBGaramond-${face}.ttf`,
        { url: gh('octaviopardo/EBGaramond12', EB_GARAMOND_AT, `fonts/ttf/EBGaramond-${face}.ttf`), sha256 },
      ]),
      [
        'OFL.txt',
        {
          url: gh('octaviopardo/EBGaramond12', EB_GARAMOND_AT, 'OFL.txt'),
          sha256: '058611bd968817d532cedeab6acaa055e882d365a88523df00e7917ad7a0f704',
        },
      ],
    ]),
  },
  {
    // The seven faces the PDF export has always used, from the same pinned files (`pdf-fonts.ts`).
    id: 'dejavu',
    version: '2.37',
    folder: 'DejaVu',
    files: Object.fromEntries([
      ...(
        [
          ['DejaVuSerif.ttf', '42d1edeb7952f31b1f96d767ed7030b08a39e0c372b0071641518864e2bffb51'],
          ['DejaVuSerif-Italic.ttf', '2e39b1d50f90b933b00c7bb54a96afd3f86419b3d717c7cf202e36f2d4973e47'],
          ['DejaVuSerif-Bold.ttf', 'c47b5527bcdc8dcf9ea8c77054454c5a884beaca2f44851a2a823ee639cbf07f'],
          ['DejaVuSerif-BoldItalic.ttf', '8d3dd3d31350309042ed226af82b34539bd773518e6107cb352712853ba80308'],
          ['DejaVuSans.ttf', '7da195a74c55bef988d0d48f9508bd5d849425c1770dba5d7bfc6ce9ed848954'],
          ['DejaVuSans-Bold.ttf', 'e6476c1b80502924294eed40894c5b18e06c181444ca953e5334262df9c27724'],
          ['DejaVuSansMono.ttf', 'b4a6c3e4faab8773f4ff761d56451646409f29abedd68f05d38c2df667d3c582'],
        ] as const
      ).map(([file, sha256]) => [file, { url: `${DEJAVU}/ttf/${file}`, sha256 }]),
      [
        'LICENSE',
        { url: `${DEJAVU}/LICENSE`, sha256: '7a083b136e64d064794c3419751e5c7dd10d2f64c108fe5ba161eae5e5958a93' },
      ],
    ]),
  },
];

const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function main(): Promise<void> {
  const work = mkdtempSync(path.join(tmpdir(), 'orbis-fonts-'));
  mkdirSync(OUT, { recursive: true });
  const pins: { id: string; zip: string; bytes: number; sha256: string }[] = [];
  try {
    for (const font of SOURCES) {
      const files: Record<string, Uint8Array> = {};
      for (const [name, pin] of Object.entries(font.files)) {
        const to = path.join(work, `${font.id}-${name}`);
        await downloadPinned(pin.url, pin.sha256, to);
        files[`${font.folder}/${name}`] = new Uint8Array(readFileSync(to));
      }
      const zip = packSorted(files);
      const name = `${font.id}-${font.version}.zip`;
      writeFileSync(path.join(OUT, name), zip);
      pins.push({ id: font.id, zip: name, bytes: zip.length, sha256: sha256Of(zip) });
      console.log(`${name}: ${zip.length} bytes, SHA-256 ${sha256Of(zip)}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const lines = [
    "// The zips of the `fonts` release, pinned: each one's name, size and SHA-256.",
    '//',
    '// **Written by `pnpm build:fonts`, never by hand** (`scripts/build-fonts.ts`). A download is refused unless its',
    '// bytes hash to the digest here, so a build gets exactly the fonts it was made with. The release keeps every zip it',
    '// has held and never replaces one, so an older build still finds its own.',
    '',
    'export type FontPackageId =',
    ...pins.map((p, i) => `  | '${p.id}'${i === pins.length - 1 ? ';' : ''}`),
    '',
    'export interface FontPin {',
    '  zip: string;',
    '  bytes: number;',
    '  sha256: string;',
    '}',
    '',
    'export const FONT_PINS: Record<FontPackageId, FontPin> = {',
    ...pins.map((p) => `  '${p.id}': { zip: '${p.zip}', bytes: ${p.bytes}, sha256: '${p.sha256}' },`),
    '};',
    '',
  ];
  writeFileSync(PINS, lines.join('\n'));
  // Through Biome, so the file is as the checks expect it however the lines above are laid out.
  execFileSync('pnpm', ['exec', 'biome', 'format', '--write', PINS], { cwd: ROOT, stdio: 'ignore' });
  console.log(`wrote ${path.relative(ROOT, PINS)} and ${pins.length} zips in ${path.relative(ROOT, OUT)}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
