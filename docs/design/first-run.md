# First run

← [Design Docs](README.md)

What a reader meets the first time Orbis loads, and what they meet the first time it loads after an update. One
dialog, one stored value, and the rule that decides which of two unprompted dialogs gets the moment.

**Its own document, not part of [Settings](settings.md).** The Setup *page* is a settings surface and belongs
there. This is a lifecycle concern: it fires from `onload`, it competes with the multi-device offer for the same
moment, and it carries release notes — three subjects that reach into three documents and belong to none of
them. The Setup section of `settings.md` describes the page and links here.

---

## The value stored

One key in the per-device store: **`orbis-seen-version`**, the plugin version this device was last told about.

**A version, not a boolean.** A boolean answers "has this device been welcomed" and nothing else; the same moment is
where release notes belong, and a plugin that greets you once and then never speaks again has no way to say what
changed. A version answers both. This is the part of the design that is expensive to change later.

**Per device, not in `data.json`.** A synced value fails in a way that is hard to see: device A updates and writes
`0.2.0`; device B, still on 0.1.0, finds a version *ahead* of its own and says nothing; when B finally updates the
two agree, so B never sees the notes at all. Same rule as every other consent in this plugin — see
[Multi-device sync](multi-device-sync.md), where "consent does not travel" is the governing rule.

---

## What gets shown

`greetingFor` takes three facts and returns one of three words.

| `seen` | `hasNotes` | Result | Who this is |
|---|---|---|---|
| `null` | — | **welcome** | A device never told what Orbis is |
| ≠ current | yes | **notes** | An update |
| ≠ current | no | none | A release with nothing to say |
| = current | — | none | Already spoken about |

**Nothing seen is a welcome, whether or not `data.json` exists.** A device the plugin reached inside a synced
`.obsidian` folder has settings from its first load and has still never been told what Orbis is; so has a device
whose seen version a dev reset just forgot. Whether the file exists could only matter to a reader updating from a
release older than this flag, and every release has kept it.

**Inequality, not "is it newer".** `greetingFor` asks only whether the version moved; whether anything is new is
`hasNotes`, which `owedReleases` answers. A downgrade owes nothing, so it is stamped and says nothing.

**The version is stamped whatever was decided, including `none`.** Otherwise a release with nothing to say would
re-ask the same question on every launch, and the answer — derived from a version that has not moved — cannot
change.

**Stamped when shown, not when answered.** A flag set by "Open setup" would bring the greeting back on every launch
until the reader gave in. Being shown is the event; the Setup entry and its count are the standing reminder, which
is quieter than anything that returns.

---

## When it fires

`app.workspace.onLayoutReady`, from `onload`.

**At load, not at a book open.** At a book open the reader's intent is explicit and specific — *read this book* —
and any dialog interrupts the one thing they came to do. At load, which on an install is a moment after they press
Enable, their attention is already on Orbis. They also have no book yet, which is what makes the first item on the
Setup page — where to get one — worth reading.

**`onLayoutReady`, not bare `onload`**, for the same reason the first sync scan waits for it: `onload` runs while
Obsidian is still assembling itself, and on a phone that is before there is anywhere for a dialog to be.

**Still called from the book-open path, as a fallback.** One guarded call in two places, covering what load misses:
a plugin arriving inside a synced `.obsidian` folder and never being "enabled" on this device, or a greeting that
failed to draw.

**On an install it opens over the Community plugins window.** That is why it is a real `Modal` — the only surface
that works over Obsidian's own settings, which traps keyboard input for anything outside its DOM tree. See
[Dialog System](dialog-system.md). Modal-over-Modal is the case to device-test rather than assume.

**It waits for any other dialog, but not for Settings.** `untilNoDialog(true)` polls every 2.5 seconds for up to two
minutes and lets Obsidian's Settings through — its own window on desktop, the `.mod-settings` modal on mobile — so
the install case above still works. A wait that gives up stamps nothing, and the book-open fallback asks again.

---

## Two dialogs, one moment

The multi-device offer also arrives unprompted, when the vault holds location files from another device. Both
want the same moment.

**Whichever is owed goes now; the other takes the next book open.**

Neither is skipped, **because the evidence cannot tell a joining device from a reset one.** Location files from
another device mean a second device joining a synced vault — or a device whose identity was reset, which the
factory-reset dev command does, or a vault restored from a backup. A reset generates a new device id, so this
device's own old location files read as a stranger's. Skipping the welcome on that evidence would mean those
readers are never welcomed at all.

The two never stack, and each is one tap. With the welcome at load time it is usually done by the first book open;
the rule matters for the fallback path.

**At a book open, both wait for a clear screen**, as the device-locations and reading-records prompts do: Settings
counts there, since the reader is somewhere else. One wait at a time, because two views ask on every open. A book
open that waited behind the welcome itself — shown at load, with a book restored — counts as that open's one
dialog, so the offer takes the next one.

---

## What the welcome says

Two sentences and two buttons. Not a checklist: a list of seven controls in a modal is a second implementation of a
page that is already better at being that list, and it arrives when the reader's intent is to read rather than to
configure.

What a modal is *for* here is the sentence nobody would go looking for: **none of this is required.** That is the
whole posture of the plugin, and it is why the Setup page can be seven items long without being seven chores.

`Got it` / `Open setup`. "Open setup" lands on the Setup page through `openPagePath`, which is internal — the public
API has no way to ask for a page (see `settings.md`, §No public deep links). Where the method is missing it opens
Orbis's settings instead, which costs one selection: Setup is the first entry, carrying the count.

**`Got it`, not `Not now`.** *Not now* is an answer about timing — it carries an implicit *ask me again*, which is
exactly what it means on the multi-device offer, where the dialog does return next session. This one is shown once
per device and never comes back, so those words would be a promise the plugin does not keep.

Not "No thanks" either: this dialog is mostly something a reader is TOLD, and "got it" is exactly true of what
happened. Declining reads as refusing the plugin rather than the trip to Setup — which they have not refused, since
the sentence above just told them where it lives.

So the way out of a dialog has three words, and which one is right depends on what the dialog *is*: `Cancel`
abandons something started, `Not now` declines an offer that will return, `Got it` acknowledges something said.
Recorded on `ConfirmSpec.cancelText`, where the next dialog will look.

---

## Release notes

After an update, a notice says that Orbis was updated, with a link that opens **What's new**. The same dialog opens
from the **What's new** button on the version row in settings (`aboutRow`). The rules are in `src/release-notes.ts`,
the drawing in `src/WhatsNewModal.ts`.

- **`CHANGELOG.md` is the notes, built into `main.js`.** Only `main.js`, `manifest.json` and `styles.css` reach a
  vault, so `esbuild.config.mjs` puts the file's text in the bundle as `__ORBIS_CHANGELOG__`, the way the build ID
  gets there, and lists it among the build ID's inputs. Not fetched from GitHub: that would be a network request to
  declare, would fail offline, would tell GitHub the reader's address after every update, and could show notes for
  a build other than the one installed. Not a second, curated table: the changelog is written for readers, and two
  lists drift apart.
- **`### Maintenance` is left out.** Lines for maintainers and reviewers — changes for the Community directory's
  review, the test fixtures, a check of the guide — go under that heading. The changelog and the GitHub release keep
  them; the dialog drops them. A release with nothing else is left out of the dialog, and owes no notice: a release
  with nothing to say for readers does not interrupt them.
- **What a version shows.** A stable version shows every dated release up to itself. A beta has no section of its
  own — every beta of 0.2.0 writes into `## [0.2.0] — Unreleased` — so a beta shows that section, headed with the
  beta (*0.2.0 beta 3*, *Not released yet*), above the releases before it. A bare `## [Unreleased]` stands in when no
  version is written yet. Each beta separately is not wanted: betas are for testers, and the whole section is what
  they test.
- **What is owed.** The releases newer than the version last seen, and also its own version when the version last
  seen was a beta of it: from one beta to the next, or from the last beta to the release, the section has grown.
  These go together on the dialog's first page; the releases before them follow one to a page, behind **Older**.
- **A notice, not a dialog.** It asks nothing, so it blocks nothing, and the welcome and the multi-device offer keep
  the one dialog a launch is allowed. It stays until it is clicked: Obsidian's few seconds go by unread on a phone.
- **The switch is per device and on by default** — *Show what's new after an update*, at the foot of the dialog,
  which is the only place it means anything. `showWhatsNew` in the device settings. Off, the version is still
  stamped, so turning it back on does not bring back every release missed meanwhile.

---

## Testing it

Three dev commands. The first two are not the same tool.

- **`Reset the welcome (dev)`** forgets `orbis-seen-version`, and nothing else.
  Nothing else: no downloads to fetch again, no destinations to answer, no reload. This is the one to use.
- **`Factory reset — back to a new install (dev)`** deletes `data.json`, forgets every stored value for this
  device, deletes the three per-device caches (~90 MB to fetch again), **trashes every device's reading-position
  file**, and reloads. Books, notes, record notes, `.orbis` files and published sync folders are left exactly as
  they are.

- **`Show what's new notice (dev)`** shows the notice an update shows, offering the newest release this build can
  show, whatever the switch says. Nothing is stored. Its link opens the dialog as an update would.

**The reading positions are the one vault reach, and they have to be.** They are the evidence
`vaultUsedElsewhere` reads, so leaving them behind would produce a vault that is fresh in every respect except the
one being tested: a device told it is brand new, then offered multi-device setup on its first book — because its own
pre-reset position files now carry a stranger's id. Every device's, not just this one's, since after a reset this
device cannot tell its own from anyone else's. Trashed rather than deleted, through `fileManager` so Obsidian's own
trash preference decides where they go: a reading position is real work.

**The factory reset DELETES `data.json` rather than writing defaults into it.** A file full of defaults is not what
a new install looks like: a new install has no file, and every value written would be pinned at today's default
rather than following the code's.

---

## Decisions

| Decision | Chosen | Why |
|---|---|---|
| Stored value | The version last seen | One value answers "welcome?" and "what's new?"; the expensive thing to change later |
| Scope | Per device | A synced version hides the notes on the device that has not updated |
| Trigger | `onLayoutReady` at load | Attention is on the plugin, and no book is being interrupted |
| Book-open call | Kept as a fallback | Covers a plugin that arrives synced and is never "enabled" here |
| Stamp timing | When shown | Set on answer, it returns until the reader gives in |
| Two unprompted dialogs | Whichever is owed; other next open | Evidence cannot tell a reset device from a joining one |
| The welcome's content | Two sentences, two buttons | A checklist in a modal duplicates the page and interrupts reading |
| Release notes | `CHANGELOG.md`, built in | Written for readers already; works offline; matches the build |
| Maintainer lines | `### Maintenance`, left out | The changelog keeps them; readers are not interrupted by them |
| After an update | A notice with a link | Asks nothing, so it takes no dialog's place |
| A beta's notes | Its version's Unreleased section | Every beta writes into one section |
