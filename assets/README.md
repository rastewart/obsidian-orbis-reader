# Dictionary asset

The offline dictionary used by the reader's **Look-up** feature (Settings → Lookup → *Offline
dictionary*) is a single JSON file mapping lowercase headwords to definitions:

```json
{ "book": "1. A collection of sheets of paper …", "grace": "…", … }
```

It is **Webster's 1913 Unabridged Dictionary** (public domain), sourced from the
[matthewreagan/WebstersEnglishDictionary](https://github.com/matthewreagan/WebstersEnglishDictionary)
"compact" build (~102k entries, clean prose — no GCIDE markup). The larger StarDict/GCIDE dumps
were rejected: ~265 MB and full of raw typesetting markup.

## Building the asset

From the repository root:

```sh
pnpm build:webster
```

`scripts/build-webster.ts` downloads `dictionary_compact.json` at commit `6fb9c92` (2022-09-10), the one the hosted
asset was built from, refuses it unless its SHA-256 is `16b12847a47cc1202e5e40a3a44b9ed2f749d23c0a5f0ad11fcbd4e8c6c3e33d`,
and runs `build-dictionary.py` on it, writing `dist-assets/orbis-webster-1913.json`.

The output is 22,458,875 bytes with SHA-256 `61ed147697ffeb8ae07e3139356ac47c8c009772607939b4ea58c64640784435`, the
digest pinned on `WEBSTER` in `src/reader/lookup/dictionary-sources.ts`. A rebuild that does not match is a different
file: find out why before changing the digest.

`build-dictionary.py` normalizes keys (lowercase + trim), trims definitions, drops empties, keeps
the longer definition on a key collision, and minifies. Output is ~21 MB UTF-8. The definition
text (numbered senses, inline quotes) is preserved as-is; the plugin formats it at render time.

### Why this one step is Python

Every other script here is TypeScript. This one stays Python because the hosted file was built with it, and the
plugin pins that file's digest, so a rebuild has to produce the same bytes, not the same dictionary. A TypeScript
version would differ in small ways unless written to match:

- **Key order.** Python writes the keys in the order it read them. A JavaScript object puts number-like keys (`"1"`,
  `"1000"`) first, so `JSON.stringify` would reorder them; a port would have to write the JSON itself.
- **Trimming and lowercasing.** `str.strip()` and `str.lower()` treat a few characters differently from `trim()` and
  `toLowerCase()`: some control characters count as whitespace in one and not the other, and JavaScript lowercases a
  Greek capital sigma at the end of a word to a final sigma where Python does not.
- **Length.** "Keep the longer definition" compares lengths, and Python counts characters where JavaScript counts
  UTF-16 units, so a definition holding a character outside the Basic Multilingual Plane is longer in one than the
  other.

A port is not unsafe — the pinned digest would refuse a file that differs, and the hosted one would stay as it is —
but it gains little. The step runs once per edition, a file in the `dictionaries` release is never rebuilt, and
GitHub's runners have Python. If it is ever ported, the test is that `pnpm build:webster` writes a file with the
digest above.

## Hosting

The plugin downloads this file on demand from the `HOST` in `src/reader/lookup/dictionary-sources.ts` and caches it
under `<vault>/.obsidian/plugins/orbis-reader/dictionary/`. The built file is **not** committed to this repo: it is a
large generated blob.

The **Dictionaries** workflow (`.github/workflows/dictionaries.yml`, run by hand from main) builds whichever of this
file and the WordNet asset its `dictionaries` release does not have yet, with `pnpm build:webster` and
`pnpm build:wordnet`, checks each against its pinned digest, and uploads it. A file already in the release is checked,
never rebuilt or replaced, so once both are uploaded neither source repository is needed again. `HOST` names that
release, which is why the repository must be public: a private repository's release files need a sign-in.
