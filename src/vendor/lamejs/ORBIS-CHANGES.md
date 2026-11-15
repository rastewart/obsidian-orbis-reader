# lamejs in Orbis Reader

This folder is [lamejs](https://github.com/zhuker/lamejs) by Alex Zhukov, a JavaScript port of the
[LAME](https://lame.sourceforge.io/) MP3 encoder, vendored into Orbis Reader on 2026-09-25. Orbis uses it for one
thing: encoding a recording's audio to MP3 (`src/reader/tts/recording.ts`). It is imported as `lamejs` through
`"lamejs": "link:./src/vendor/lamejs"` in the root `package.json`.

## License

lamejs is licensed under the **GNU Lesser General Public License, version 2 or (at your option) any later version**,
as its source file headers state, and Orbis distributes it under **version 3**, as `NOTICES` has always said. It stays
under that license inside this repository; it is not covered by Orbis Reader's MIT license.

- The license texts are in the repository's `licenses/` folder: `LGPL-3.0.txt`, and `GPL-3.0.txt`, which the LGPL
  builds on. Upstream's repository ships no license text: its `LICENSE` is LAME's "Can I use LAME in my commercial
  program?" note, kept here unchanged as `LICENSE` (and as `licenses/lamejs-LICENSE.txt`).
- The copyright notices in the source files are unchanged.
- Orbis's own source is public, and `pnpm build` bundles this folder into `main.js`, so anyone can rebuild the plugin
  with a modified lamejs. That is what the LGPL asks of a program that includes the library.

## Where it came from

The files here are upstream's `src/js/` at [`582bbba`](https://github.com/zhuker/lamejs/commit/582bbba), the last
commit (2022-01-25), **byte for byte and unmodified**. They are CommonJS, and esbuild bundles them as they are.

Kept: the 35 files `index.js` reaches. Left out: `Tests.js` (upstream's test harness, which needs Node's `fs` and
`path`) and `ID3TagSpec.js`, which nothing requires.

Until 2026-09-25 Orbis installed `@breezystack/lamejs@1.2.7` from npm. That package is a republication by a third
party of [`shijinyu/lamejs`](https://github.com/shijinyu/lamejs), which is upstream's last commit plus twelve commits
that change **no encoder source**: they delete upstream's build scripts and prebuilt files and add a Vite config that
bundles the same `src/js/` into an ES module. So the code Orbis ran was upstream's all along, in a bundle with mangled
names. Vendoring the original instead removes the republisher, and keeps the form of the code that is meant to be
read and changed.

Verified before the switch: the same audio encoded through `@breezystack/lamejs` and through this folder, bundled by
esbuild, gave byte-identical MP3s at 22,050 Hz and 24,000 Hz. `src/__tests__/mp3-encoder.test.ts` keeps that as a
test: it encodes a fixed signal and compares the digest `@breezystack/lamejs` produced.

## Orbis's changes

None. `package.json` and `index.d.ts` (types for the one class Orbis uses) are Orbis's; every `.js` file is
upstream's. If that ever changes, the change must be marked in the file, stay under the LGPL, and be listed here.
