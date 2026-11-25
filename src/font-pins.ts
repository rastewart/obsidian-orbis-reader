// The zips of the `fonts` release, pinned: each one's name, size and SHA-256.
//
// **Written by `pnpm build:fonts`, never by hand** (`scripts/build-fonts.ts`). A download is refused unless its
// bytes hash to the digest here, so a build gets exactly the fonts it was made with. The release keeps every zip it
// has held and never replaces one, so an older build still finds its own.

export type FontPackageId =
  | 'opendyslexic'
  | 'atkinson-hyperlegible'
  | 'lexend'
  | 'literata'
  | 'source-serif-4'
  | 'eb-garamond'
  | 'dejavu';

export interface FontPin {
  zip: string;
  bytes: number;
  sha256: string;
}

export const FONT_PINS: Record<FontPackageId, FontPin> = {
  opendyslexic: {
    zip: 'opendyslexic-0.990.zip',
    bytes: 531266,
    sha256: 'e00f86e018ffba7c80d1ee2d782db330fbb1bf1664d53cdb11e2a6bf4524f3ee',
  },
  'atkinson-hyperlegible': {
    zip: 'atkinson-hyperlegible-1.006.zip',
    bytes: 128627,
    sha256: 'c3658846bbfb4addfdba9e868dcf1e8665e48b3d9a1dbaf4e7ebc2aba6ea8c85',
  },
  lexend: {
    zip: 'lexend-1.008.zip',
    bytes: 106835,
    sha256: 'd3790ac97c975c03e7e412a79b4b7ed65d659d24168baa705e15eaf9bc14efb8',
  },
  literata: {
    zip: 'literata-3.103.zip',
    bytes: 594400,
    sha256: 'af0567d09ffe3bc62992c06300cbacc0e883f992667d881a04212736f7c29450',
  },
  'source-serif-4': {
    zip: 'source-serif-4-4.005.zip',
    bytes: 412783,
    sha256: 'ff1213a31b8545e871f187e82c3bd62f0b7be3495965d311d1ec7ac453e028ed',
  },
  'eb-garamond': {
    zip: 'eb-garamond-1.002.zip',
    bytes: 1275164,
    sha256: 'fa56baebb9ffefbafa7250bbb439db6e8bf7468af839cf93d422c5753d677893',
  },
  dejavu: {
    zip: 'dejavu-2.37.zip',
    bytes: 1774485,
    sha256: '6982df75622c061a598c2ff06b58e8bafbfd2481ee6fced604e945afb58de369',
  },
};
