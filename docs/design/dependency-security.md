# Dependency Security

← [Design Docs](README.md)

Supply chain only. What Orbis trusts and does not trust more broadly — a book, a catalog feed, a downloaded
asset — and where each boundary is enforced is in [Security model](security.md).

## Runtime dependencies

Ten libraries ship in the built plugin. One, lamejs, is vendored in `src/vendor/`, and foliate-js comes from Orbis's own fork. Their licenses and notices are in
[NOTICES](../../NOTICES) and [`licenses/`](../../licenses); this table is about supply-chain risk.

**`NOTICES` covers what is actually bundled, not what `package.json` lists.** The list comes from esbuild's
metafile for `main.js` and for the Piper worker, since a library's own dependencies land in the bundle too:
`pdf-lib` brings `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako` and `tslib`. Two prebuilt libraries carry more
inside them than they declare. `onnxruntime-web` embeds long.js, FlatBuffers, protobuf.js and guid-typescript, and
`@pdf-lib/fontkit` embeds fifteen, taken from its repository's build configuration. Going the other way,
`@mixmark-io/domino` is not bundled, since turndown's browser build never imports it. Re-derive the list the same way
whenever a runtime dependency changes.

| Package | Pinning | What it does | Risk note |
|---|---|---|---|
| `foliate-js` | **Orbis's fork** ([`rastewart/foliate-js`](https://github.com/rastewart/foliate-js), pinned to a commit) | The reader engine | Upstream plus Orbis's changes, all listed in the fork's `ORBIS-CHANGES.md`, which also records the upstream commit it is merged through. See below — the one that needs a procedure |
| `onnxruntime-web` | Exact (`1.18.0`) | Piper TTS inference (`PiperEngine`, `piper-worker`) | Exact-pinned: it ships WASM, and the model/runtime pairing is version-sensitive. **Held**: 1.19+ can't start on iPadOS — see below |
| `pdf-lib` | Exact (`1.17.1`) | Writes the PDF exports | Pure computation, no network |
| `@pdf-lib/fontkit` | Exact (`1.1.1`) | Subsets the DejaVu fonts pdf-lib embeds | Pure computation |
| `turndown` | Exact (`7.2.5`) | HTML → Markdown for book export | Stable |
| `diff` | Exact (`9.0.0`) | The notes merge/diff flow | Pure computation |
| `fflate` | Exact (`0.8.3`) | Zip, for writing EPUBs and reading OPF metadata | Also vendored inside foliate-js — see below |
| `lamejs` | **Vendored** (`src/vendor/lamejs`) | MP3 encoding for recorded audio | LGPL; upstream `zhuker/lamejs` at `582bbba6a12f981b984d8fb9e1874499fed85675`, unmodified. `mp3-encoder.test.ts` pins its output. See NOTICES |
| `construct-style-sheets-polyfill` | Exact (`3.1.0`), through foliate-js | Imported by foliate-js's `fixed-layout.js` | A dependency of the foliate-js fork, which pins it. Orbis does not list it itself, so it changes only with the fork's pin |
| `browser-id3-writer` | Exact (`6.4.0`) | ID3 tags on the MP3s it writes | Pure computation |

One more piece of vendored code is not a package: `src/vendor/piper-phonemize.js`, the Emscripten loader for the
phonemizer, copied from `@diffusionstudio/vits-web`'s build (see NOTICES). The engine it loads, `piper_phonemize.wasm`
and `.data`, is downloaded on first use and checked against a SHA-256 pinned in `reader/tts/asset-integrity.ts`.

**Everything that touches the network is Orbis's own code**, not a dependency: book sources go through
`sources/client.ts`, and the downloaded assets (voices, PDF fonts, dictionaries) through `requestUrl`. No runtime
dependency fetches anything.

---

## foliate-js — special considerations

`foliate-js` comes from Orbis's fork, [`rastewart/foliate-js`](https://github.com/rastewart/foliate-js), whose
`orbis` branch is upstream plus Orbis's changes. `package.json` pins it to a commit, and `pnpm-lock.yaml` records
the integrity hash of that commit's tarball, so it changes only when the pin does. It comes from Orbis's own
account, not a third party's npm account. The fork's `ORBIS-CHANGES.md` lists every difference from upstream,
marks which ones Orbis relies on, records the upstream commit it is merged through, and gives the merge steps.
Until 0.1.3 the same files were vendored in `src/vendor/foliate-js`.

**Vendored bundles.** foliate-js carries pre-built copies of `fflate` and `@zip.js/zip.js` under `vendor/`. These
are not visible to `pnpm audit`, and a merge from upstream can change them without any version moving — which is why
the checklist below compares them.

**Orbis is built on changes upstream does not have.** The fork keeps the changes of the npm publisher whose
package it replaced: its `Overlayer` takes `constructor(doc)` where upstream takes none, corrects client rects for
Safari zoom, and adds `#splitRangeByParagraph` — which `tts-blocks.ts` reasons about explicitly and
`tts-units.test.ts` reproduces to guard against blank highlights. Upstream has no such method, so a merge must keep
them; `ORBIS-CHANGES.md` marks each "Relies on it".

**Iframe sandbox model — and why it is not enough.** foliate-js renders book content in iframes with
`sandbox="allow-scripts allow-same-origin"`, a pair that amounts to no sandbox at all. On the desktop and Android
`foliate-patches.ts` strips `allow-scripts` and book scripts cannot run. **On iPhone and iPad that patch is
deliberately skipped** — WebKit then stops the iframe dispatching DOM events to our listeners (WebKit bug 218086),
which annotations and selection depend on — so there the sandbox alone would let book scripts run, in a document our
own srcdoc patch makes same-origin with the host page.

**What holds it: `reader/book-html-guard.ts`.** Every chapter, on every platform, passes through
`hardenBookHtml` on its way to `srcdoc` — both `paginator.js` and `fixed-layout.js` load by assigning `iframe.src`,
so the single interception point covers every format. Two layers: a CSP meta inserted first in the head —
`default-src 'none'` with scripts, objects, frames, `<base>` and form targets each refused by name, and images,
media, fonts and styles allowed only from `blob:` and `data:`, so a book loads nothing from outside itself — and the
removal of `<script>`, nested frames (`iframe`, `frame`, `embed`; an `object` gives way to its fallback content),
`<meta http-equiv="refresh">`, connection hints such as `dns-prefetch`, `on*` attributes and `javascript:` URLs.
They cover each other — a meta policy governs only what is parsed after it, and stripping cannot anticipate every
spelling of a handler. [Security model](security.md) has the reasons for each. A chapter that cannot
be read gets an empty document rather than its own unhardened one, and if the patch cannot be installed no book opens.

**The cost, and the trade accepted.** The stripping parses and re-serializes each document, so its cost grows with
the document: a book whose whole text is one large HTML file pays many times what a normal chapter does. Opening a
book is unaffected; changing a display setting on such a book is slightly laggy, because `reinjectAllDocs` re-loads
the document. Accepted: display settings are set-and-forget, and one tested code path is worth more than the
optimization below.

**A possible optimization.** A cheap token pre-scan (`<script`, `javascript`, `<object`, `<embed`, `<iframe`,
`<base`, `srcdoc`, `<svg`, and an `on...=` pattern) would let a document with nothing executable skip the parse. If
it is ever built, two things are non-negotiable: **the CSP stays unconditional**, so a false negative costs defense
in depth rather than defense; and **nothing is cached** — no per-book verdict, which would be invalidated by the
file changing under sync, by foliate handing us a processed blob rather than the file's bytes, and by MOBI/AZW3/FB2
HTML being synthesized at load time and not existing in the archive at all.

## `requestUrl` and the reader's own network

`requestUrl` is not subject to CORS, which is why Book sources uses it: a catalog server has no reason to have
opted this plugin in, so a plain `fetch` fails on exactly the hosts the feature exists to serve. The cost is that
Orbis can reach `localhost`, `192.168.x.x` and `169.254.169.254` — and can READ the response, where a browser's
cross-origin fetch would return something opaque.

Every browse target and acquisition URL comes from `resolveOpdsHref(feedHref, base)`, so the catalog writes them.
A hostile feed could publish `http://192.168.1.10:8080/opds`, have Orbis fetch it, and see the result rendered in
the dialog — enumerating a network one link at a time.

**The rule is conditional, because the obvious rule breaks the main use case.** A Calibre content server on a LAN
is the canonical self-hosted OPDS setup, so refusing private addresses outright would break it:

> A public catalog may not send you into your own network. A private one may talk to itself.

`sources/private-hosts.ts` decides what counts as private — the RFC 1918 ranges, all of `127/8`, link-local
(including the cloud metadata address), RFC 6598 shared space where Tailscale lives, IPv6 loopback / ULA /
link-local, IPv4-mapped and IPv4-compatible IPv6 read as the IPv4 address they carry (in the hex spelling too, which
is how the URL parser writes `::ffff:192.168.1.10`), and names as well as numbers: `localhost`, `.local`,
`.internal`, `.home.arpa`, and **a bare single-label hostname**, which resolves through a LAN search domain.
`mayReach(target, home)` then asks one question, in `fetchFollowing`, on every hop including the first — the same
anchor-on-the-source insight as the credential check beside it.

**A refusal reports itself.** `private-address` is its own `SourceFailure` with its own sentence, which names the
self-hosted case explicitly so a reader who hits it knows which situation they are in. `fetchFollowing` tells a
refusal from a timeout, so a refused address is never shown as "could not reach the source" or logged as timed out:
a control that lies about why it fired sends whoever meets it to debug the wrong thing.

**Known limit: DNS rebinding defeats this.** A public hostname that resolves to `192.168.1.10` passes a name-based
check, and a renderer cannot resolve DNS to find out. Closing it needs a check at the socket, which a plugin does
not have. This stops the honest form of the attack, not a determined one.

**Not applied to the markdown-to-EPUB image fetch.** A note's `![](http://192.168.1.5/photo.jpg)` is unusual but
legitimate, and the reader asked for that conversion — the URL is theirs, not a catalog's.

---

### Before taking changes from upstream foliate-js

Orbis's patches are ordinary edits in the fork's files, each marked `// ORBIS patch N`. The merge steps are in
the fork's `ORBIS-CHANGES.md`; these are the checks around them.

1. Read the upstream changelog for iframe, sandbox, or CSP changes.
2. Check whether upstream's `vendor/fflate.js` and `vendor/zip.js` changed (compare file hashes or inspect the diff).
3. Verify that `foliate-patches.ts` still correctly intercepts the sandbox attribute after the merge.
4. **Keep every `// ORBIS patch` edit and every change `ORBIS-CHANGES.md` marks "Relies on it"**, and read what each
   patch now sits in, since a merged line can keep its text and change its meaning. Nothing checks this
   automatically: a patch is an edit, not a string replacement that fails when its target moves.
5. **Run both fixtures on desktop, Android, iPhone and iPad**, every line PASS in each:
   - `pnpm build:hostile-epub` → `hostile-scripts.epub`. Desktop passing proves least, because desktop is
     protected twice; mobile is where this matters.
   - `pnpm build:stylesheet-epub` → `stylesheet-checks.epub` (the book's own CSS arrives, and so do its own
     fonts: both sample lines in **Embedded fonts** are in a brush script, one of them obfuscated) and
     `stylesheet-hazards.epub` (**opening it at all** is the test — each hazard in it makes a chapter unloadable
     without patches 4 and 5, or freezes the reader without patches 25 and 26).
6. Test in the Obsidian desktop app: open an epub, confirm highlights and navigation still work.

---

## Update policy

### Exact pins

Every package whose bytes run in the plugin or build it is pinned to one version — `package.json` says `9.0.0`, not
`^9.0.0` — so a version changes only when it is edited by hand, and never because a fresh install found a newer
one. The lockfile already holds CI to the versions in it (`--frozen-lockfile`); the exact pins hold a local install
and `pnpm update` too. Only development tools that never touch the shipped file keep ranges.

**Updating one** is an edit and a check:

```
pnpm add diff@<version>        # or turndown, pdf-lib, @pdf-lib/fontkit, fflate, browser-id3-writer
pnpm audit
```

`turndown`, `diff`, `pdf-lib`, `@pdf-lib/fontkit`, `fflate` and `browser-id3-writer` are pure computation with no
network. The one thing to check after updating `fflate` is that a generated EPUB still opens in Orbis and in one
other reader, since it writes the container. **`pnpm`, not `npm`** — npm crashes on this repo's symlink layout.

`lamejs` is vendored, so there is no bump: it changes only when its folder does, and `mp3-encoder.test.ts` fails on
any change to what it encodes. Upstream is dormant.

### TypeScript

Two packages, side by side, the way the TypeScript 7 release notes recommend:

```json
"@typescript/native": "npm:typescript@^7.0.2",
"typescript": "npm:@typescript/typescript6@^6.0.2",
```

`tsc` is TypeScript 7 — the compiler that type-checks the project in the gate and in `pnpm build`. The name
`typescript` is a TypeScript 6 compatibility package (its compiler is `tsc6`), kept because TypeScript 7 ships no
JavaScript API and two things need one: typescript-eslint, which the Obsidian review rules run on and which accepts
TypeScript below 6.1 only; and `check-i18n`, `check-a11y` and `check-keyboard`, which parse each file with
`ts.createSourceFile`. Neither package reaches `main.js` — esbuild strips types itself.

**Keep `-skipLibCheck`.** `obsidian.d.ts` fails a library check under both versions, so the flag hides errors in
Obsidian's own typings, not in ours.

**Retiring the 6 package** takes two things: a typescript-eslint release that supports TypeScript 7
([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)), and the three
scripts ported to the API TypeScript 7.1 is expected to ship. Then `typescript` points at 7 again and
`@typescript/native` goes.

### onnxruntime-web

Exact-pinned, and bumped only deliberately. It ships WASM that must match the Piper voice models, and a mismatch
does not fail loudly — it degrades synthesis. After a bump: generate a recording end to end on desktop and on
Android, not just a live preview, **and play live on the iPad** — see below for why that is the device that decides.

**Three things move together:** the version in `package.json`, the CDN address in `PiperEngine.ts`, and the
engine's digest in `asset-integrity.ts`, taken from the npm tarball and matched against the CDN's bytes.
`asset-integrity.test.ts` fails if either of the last two is left behind, because the installed package ships the
very file the CDN mirrors.

#### Held at 1.18.0: later versions fail to start on iPadOS

**The symptom.** From 1.19 on, every Piper voice fails to start on an iPad, live and preview alike, while Mac and
Android work. The debug log reads:

```text
no available backend found. ERR: [wasm] RangeError: Out of memory, [cpu] Error: previous call to 'initWasm()' failed.
```

**Why.** From 1.19, ORT ships only a *threaded* engine (`ort-wasm-simd-threaded.wasm`); 1.18.0 is the last release
with the plain `ort-wasm-simd.wasm`. A threaded build's memory is *shared*, and even on one thread its loader creates
it as `new WebAssembly.Memory({ initial: 256, maximum: 65536, shared: true })` — a **4 GB** maximum. Ordinary wasm
memory grows as it is used; shared memory cannot be moved, so the browser reserves the whole maximum up front.
iPadOS's WebKit refuses to, and throws `RangeError: Out of memory` before anything runs, though the voice needs a
small fraction of that. Shared memory itself is allowed on the iPad: the loader's first, zero-size shared memory
succeeds, so the failure is the size, not the kind. It is a known WebKit/Emscripten problem, not ORT's alone or ours:
[emscripten#19374](https://github.com/emscripten-core/emscripten/issues/19374) (Safari also never releases shared
memory on reload), and `dotnet/runtime` cut its default maximum to 256 MB for it
([#84638](https://github.com/dotnet/runtime/issues/84638)). ORT's open iOS reports:
[#22086](https://github.com/microsoft/onnxruntime/issues/22086), [#22776](https://github.com/microsoft/onnxruntime/issues/22776).

**Capping the maximum ourselves is not an answer.** The worker could intercept `WebAssembly.Memory` and lower the
maximum to ~1 GB, which the engine's import would accept. It patches a browser built-in around ORT's internals, would
break silently on a later ORT, and Safari's reload leak could exhaust even 1 GB after enough worker restarts.

**How to recheck** (with the quarterly audit, or when a release note mentions iOS or `MAXIMUM_MEMORY`). No device is
needed to rule a version out:

1. In that version's `dist/ort.wasm.bundle.min.mjs`, find `shared:!0` next to a `maximum:` — `65536` is 4 GB and
   still fails. Or look for a non-threaded `ort-wasm-simd.wasm` in the dist listing.
2. If either changed, do the bump: the engine file becomes `ort-wasm-simd-threaded.wasm`, the worker must import
   `onnxruntime-web/wasm` (the default entry point expects the WebGPU/WebNN engine, `…jsep.wasm`), and since 1.19
   the bytes go in through `env.wasm.wasmBinary`, which replaces the Blob URL. New digest from the npm tarball.
3. Then an iPad decides: live listening and a voice preview. Mac and Android start later versions fine and tell you
   nothing.

### foliate-js

There is no version to bump: changes arrive only by merging upstream into the fork's `orbis` branch, following
its `ORBIS-CHANGES.md` and the checklist [above](#before-taking-changes-from-upstream-foliate-js). Then move the
pinned commit in `package.json` to the merge, run `pnpm install`, `pnpm audit` and a smoke test in Obsidian
desktop.

---

## Quarterly audit checklist

Run each quarter (tracked in [Roadmap → Ongoing](roadmap.md)):

- [ ] **`pnpm audit --prod`** — this is the number that matters. It covers what ships.
- [ ] `pnpm audit` — the full tree, including build tooling. Advisories here are worth knowing about and are not
      a release blocker; say which they are rather than carrying a bare count.
- [ ] `pnpm outdated` — review the drift; update the exact pins by hand if minor or patch versions are available
      (see *Exact pins*)
- [ ] Check upstream foliate-js for changes worth merging, and follow the procedure above if so
- [ ] Verify `construct-style-sheets-polyfill` (foliate-js's only runtime transitive dep) has no new advisories
- [ ] Record the result below

---

## Audit history

| Date | Result | Actions taken |
|---|---|---|
| 2026-06-13 | 0 vulnerabilities (175 deps) | Initial audit; foliate-js, turndown, diff all at latest; exact-pin policy established |
| 2026-09-06 | **Production: 0.** Full tree: 32 (22 high, 8 moderate, 2 low) | Every advisory is in **devDependencies** — `markdown-it` / `linkify-it` / `js-yaml` (markdownlint's parser chain), `undici`, `brace-expansion`, `fast-uri`. None ships. The runtime table was brought up to date. |
| 2026-11-16 | **Production: 0.** Full tree: 0, after two overrides | Dependabot's first scan of the public repository raised two dev-tool alerts, each fixed only in a new major: `katex` <0.18.2 (GHSA-238p-pmpm-9mq7, low; markdownlint's math syntax, never rendered) and `minimatch` >=7 <11.0.1 (GHSA-g3hv-75wg-m249, moderate; ESLint, on our own globs). Both forced to the fixed versions in `pnpm-workspace.yaml`; the whole gate passes on them, and markdownlint and ESLint were checked to still report problems. |
