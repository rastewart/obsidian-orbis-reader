# Look-up

← [Design Docs](README.md)

Select text while reading and find out what it means, without leaving the book. Three sections in one popup: a
definition from an offline dictionary, what your own vault has to say, and a way out to the web.

`src/reader/lookup/` — `LookupController.ts` builds the popup, `DictionaryService.ts` owns the assets. Reached
from the selection picker and the mobile drawer through `AnnotationHost.lookUp`. Look-up is **select-only**: it
never appears on a tap, because a tap means "edit this annotation" — see
[Annotations](annotations.md#selection--tap-interaction-model).

---

## Three sections, reorderable, any of them hideable

`settings.lookupSections` is an ordered list of `{ id, visible }` — `definition`, `vault`, `web`. The order is the
order they render in, and at least one must stay visible. The last section on, and the last web destination on, is
locked — its switch disabled and the reason in its row (settings.md, §The last one that must stay on is locked)
— rather than letting the popup come up empty.

- **Definition** — the offline dictionaries, below.
- **Vault** — a matching note if there is one, and "Search vault for X" otherwise, through Obsidian's own global
  search.
- **Web** — one button per enabled destination from `settings.lookupWebDestinations`. Twelve are built in
  (Wikipedia, Google, Wiktionary and Merriam-Webster on by default); a reader can add their own with a
  `{{query}}` placeholder, reorder them, and switch any off. Built-ins cannot be edited or deleted, because their
  addresses are Orbis's to keep correct. Tapping one opens the search and **leaves the popup open** — you are
  usually about to try a second one.

Both lists are reordered from the Look-up settings page, which is one of the pages that stays imperative for
exactly that reason — see [Settings](settings.md).

---

## Two dictionaries, because they fail in opposite directions

**Webster's Revised Unabridged (1913)** is the right book for the nineteenth-century texts that fill a Gutenberg
library: etymologies, archaic senses, and no idea what a smartphone is. **Open English WordNet (2025)** is modern
and terse, with a part of speech and example sentences per sense, and no etymology at all.

Which one answers a word is **a property of the word, not a preference to set once**. So both can be present, and
the panel offers whichever actually has an entry — with a tab strip when both do.

**Downloading is enabling.** There is no toggle beside the download button, in settings or in the panel: a book on
the disk is a book the panel offers, and removing it is how you stop being offered it. Two controls for one
question could only disagree.

### Naming the source

The source is named at the top either way — in the tab strip when there is a choice, in the `DEFINITION` header
(`DEFINITION · WORDNET 2025`) when there is not.

There is no one-tab strip: a reader who downloaded a single book would see an accent-filled pill above every
definition that looks pressable and does nothing.

A miss says where it looked — *Not in Webster's 1913.* or *Not in either dictionary.* — because "No dictionary
entry for X" reads as a fact about dictionaries at large, when for someone holding only the 1913 book it is usually
a fact about 1913.

### Phrases are looked up too

A selection with a space in it is looked up like a word. WordNet keys a large share of its headwords as phrases —
*point of view*, *red herring*, *sea change*, *de facto*, *ice cream*, *United States* — while Webster's multi-word
entries are mostly botanical Latin. Two rules keep phrase look-up cheap and quiet:

- **A bound, measured per book.** `maxWords` is the longest headword each asset has — 5 for Webster's (*empire
  state of the west*), 11 for WordNet (*congregation of the sisters of st catherine the virgin and martyr*). A
  term longer than that cannot match, so the book is not opened, and selecting three paragraphs for the vault
  section never spends a 21 MB parse to answer nothing.
- **Silence on a miss.** A multi-word term that finds nothing paints no section at all — and paints nothing while
  it is looking, because a header and a "Looking up…" box that appear and then vanish are worse than the wait they
  cover. A single word shows a placeholder, then senses or the line saying which books were asked.

**Known limit, asserted in a test so it stays a decision:** the stemmer works on the *end* of a term, so *red
herrings* resolves and *points of view* does not — the plural is on the first word. End-inflecting compounds are
the common English shape; widening it means stemming each word in turn, which is a lot of candidate strings for
the "X of Y" minority.

---

## The assets

Each is a JSON file downloaded on request into `.obsidian/plugins/orbis-reader/dictionary/`, ~21 MB, never
bundled. `DictionarySource` describes one:

```ts
{ id, edition, url, file, sizeMb, maxWords, credit }
```

**The edition is stated once.** It names the file (`orbis-wordnet-2025.json`), the URL and the book on screen; a
year typed into three places is a year that will eventually disagree with itself.

**`sizeMb` and `maxWords` are measured, and carry an obligation: regenerate an asset, update its numbers.** Neither
can be read before the download — the only honest source for size is a HEAD request, and a settings page should not
go to the network to draw a sentence. `pnpm build:wordnet` prints both.

### Building WordNet, from a source that still moves

`scripts/build-wordnet.ts` builds the asset from the Open English WordNet release itself, not from someone's
extract. Princeton's WordNet is no longer updated, so every copy of it is a fixed snapshot; OEWN is the maintained
successor and is re-released annually.

The `EDITION` is **pinned, not "latest"** — a build that silently changes its input is a build nobody can
reproduce, and the asset a reader downloaded has to be the one the script makes today. The work is a join: the
`entries-*.json` files map headwords to synsets, the 46 lexicographer files hold the definitions and examples, and
neither is usable alone.

Two shapes in the data constrain the code:

- **Some examples are `{ source, text }` objects**, not strings. The transform accepts both and drops the
  provenance; a reader wants the sentence.
- **`constructor` is an English word and both books have it.** Keyed into a plain object, `entries[word] ??= []`
  finds the inherited `Object` constructor, and a lookup of a book *without* that headword answers with `Object`
  itself. **The build and the reader both use a `Map`.**

### Where attribution goes, and where it does not

WordNet is CC BY 4.0. The obligation attaches on **Sharing**, and the place Orbis shares it is the asset — so the
notice travels *inside* the file, written there by the build script, for whoever holds it. Drawing a definition to
the reader who downloaded it is not sharing, and §3(a)(2) explicitly allows a link rather than a full notice.

So it follows the DejaVu fonts, another downloaded-on-request asset: NOTICES, the
README, `licenses/CC-BY-4.0.txt`, and **one short link beside the download button** — which is where a reader is
deciding whether to take it, and which has to be legible before anything has been parsed. That is why the credit
is static on `DictionarySource` rather than read from the file.

There is no attribution block under each definition: it would outweigh the one-line definition it sits under.
§3(a)(1)(B) also asks a derivative to say it is one: the build script writes what it did — senses flattened,
headwords lowercased and merged, corpus provenance dropped — into the asset and into NOTICES.

Webster's 1913 is public domain and owes none of this. It gets a matching provenance line anyway: a row that says
where one book came from and nothing about the other reads as an oversight.

Each asset's SHA-256 is pinned on its `DictionarySource` (`dictionary-sources.ts`), and a download that does not match
is refused — see [Security](security.md). Regenerating an asset means updating its digest with its size. Moving the
files to another host does not: the bytes are what is pinned, not the address.

**Built by a workflow of their own, run by hand.** `.github/workflows/dictionaries.yml` builds whichever file its
`dictionaries` release does not have yet (`pnpm build:webster`, `pnpm build:wordnet`, each refusing a source whose
digest is not the pinned one), checks it against the pins and uploads it. `scripts/dictionary-pins.ts` prints the pins
from `dictionary-sources.ts`, which imports nothing from Obsidian so that a script can load it. Not the plugin's
release workflow: the books change when an edition does, not when the plugin does. A file already in the release is
checked, never rebuilt or replaced, since a plugin version already out pins its digest; a new edition is a new file
name beside the old one. So once a book is uploaded, its source is never needed again. The release is created as
not-latest, so the README's latest-release link keeps pointing at the plugin. `HOST` in `dictionary-sources.ts`
names this release.

---

## Setup, and the empty state

The **Look-up** task in Setup downloads both, sequentially, skipping whatever is already there — two 21 MB
downloads contending on a phone connection is slower than one after the other. It reports Ready on *any* book,
not both: someone who deliberately removed one should not watch a finished task revert forever.

The panel's own empty state uses **the setup task's string, not a copy of it**, and one button, not one per book:
choosing between books belongs on the settings page, where each row says what its book is for.

---

## Speak and Pronunciation

The popup's action row carries two buttons that belong to Listening rather than to look-up, wired through two
small interfaces so this module never sees the TTS stack:

- `LookupSpeaker` — speak the selection the way narration would, through the pronunciation dictionary, or speak
  text **verbatim** for auditioning a respelling, where running it through the dictionary again would be circular.
- `PronunciationAccess` — read the current respelling for this word and hand editing to the glossary.

See [Listening](text-to-speech.md) for the pronunciation model itself.
