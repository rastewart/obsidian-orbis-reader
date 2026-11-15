# User Guide Writing Standard

← [Design Docs](README.md)

This standard tells you how to write the pages in `docs/guide/`. Use it for every new page and for every change to an existing page.

The standard is based on ASD-STE100 Simplified Technical English (STE). It does not require the full STE dictionary. The approved terms are in [Terminology](terminology.md), and the decisions behind them are in the [Glossary](glossary.md).

---

## The reader

The reader is an Obsidian user who wants to do a task or understand a feature. The reader is not a developer.

Write for that reader:

- Tell the reader what the product does and what to do.
- Put information about how a feature is built in a design doc, not in the user guide.

---

## Content

1. Describe what the product does and what the user does.
2. Do not describe how a feature was built, why it was designed that way, or how it changed over time. Exception: include this information when the user needs it to complete a task.
3. Give a reason ("because …") only when it helps the user choose an option or prevent an error.
4. Do not describe internal mechanisms, matching logic, heuristics, performance figures or internal names. Exceptions:
   - File and folder locations that the user can see.
   - Limits that the user can reach, such as a maximum file size.
   - Data that leaves the device.
5. Do not describe what the product does not do. Exception: a gap that a user would reasonably expect to be filled, and that causes errors when it is not.
6. Do not write design justifications. Remove words such as "deliberate", "on purpose", "that is the point" and "not an omission".

---

## Voice and tone

1. Use active voice.
2. Use the imperative for instructions: "Select **Save**." Do not write "You will want to select **Save**."
3. Write to the reader as "you". Use the present tense.
4. Do not give the software human traits. Do not use "says", "tells", "asks", "knows", "decides", "waits", "refuses", "remembers", "offers" or "keeps to itself" for the software. Use "shows", "displays", "prompts" or "stores", or name the UI element that appears.
5. Do not use rhetorical contrasts such as "X only does Y". Do not use "rather than" to compare the product with an alternative that does not exist.
6. Do not write asides, commentary, slogans or closing lines such as "That is the whole loop."
7. Do not use idioms or colloquial phrases, such as "your mileage may vary" or "the usual culprit".
8. Use American English spelling.

---

## Sentences and paragraphs

1. Write one topic in each sentence.
2. Keep instructions to 20 words or fewer. Keep descriptive sentences to 25 words or fewer.
3. Keep paragraphs to 6 sentences or fewer.
4. Use no more than one pair of em dashes in a sentence. If a sentence needs more, split it.
5. Do not use a noun cluster of more than three words. For example, write "the button that starts recording", not "the recording start button setting".
6. Do not introduce a list with a count, such as "Two things worth knowing:". Use a heading or a plain lead-in sentence.

---

## Procedures

1. Write a task that has two or more actions as a numbered procedure.
2. Put one instruction in each step. Exception: two actions that the user does at the same time.
3. Start each step with a verb.
4. Put a condition before the instruction: "If the voice is not downloaded, select **Download**."
5. Mark an optional step with "Optional:" at the start.
6. Give the result of a step only when the user needs it to continue.
7. Write a warning or caution as an instruction first, then the reason: "Do not delete the `!orbis-data` folder. It contains your annotations."
8. Start a task section with one sentence that says why or when you do it, before the procedure: "Deactivate a mark when the book's preset has a mark that you do not plan to use in this book." Leave it out only when the heading already says it.

---

## Terms and UI references

1. Use the terms in [Terminology](terminology.md). Use each term with one meaning only.
2. Follow the [writing rules in Terminology](terminology.md#writing-rules). They cover capitalization, feature names, settings paths, buttons and icons, UI element types, the product name, ellipses, format names, hyphens and keyboard shortcuts.
3. Write UI labels in bold, exactly as they appear in the product. The labels are in `src/i18n/en.ts`.
4. Use "select" for all clicks and taps. Use "press" for keyboard keys only.
5. Do not use the words that `scripts/check-vocabulary.ts` retires. Run `pnpm lint:vocab` to check.
6. When a link names another guide page, use the page's title as the link text, exactly as its first heading writes it: `[Reading a Book](reading-a-book.md)`. A link to a section can use the section's heading instead.

---

## Page structure

1. Start each page with its title in Title Case, then the breadcrumb `← [User Guide](README.md)`, then a horizontal rule.
2. Use sentence case for all headings below the title.
3. Put the sections in this order:
   1. **Overview**: what the feature is and when to use it, in one to three sentences.
   2. **Tasks**: one section for each task, with a numbered procedure.
   3. **Options and settings**: a table of the settings that change the feature.
   4. **Troubleshooting**: problems and their fixes, if the feature has known problems. Give each problem a level-3 heading that names the symptom, then the fix. A list of error messages can be a table with the columns **Message** and **What it means**.
   5. **See also**: links to related pages.
4. Do not mix a procedure and a description in one section. Split the section.
5. Put the descriptions in the same order as the tasks they describe. When a task's description is not the next section, end the task with a link to it: `For the player's controls, see [The full-screen audio player](#the-full-screen-audio-player).` Group several descriptions of one subject under one heading.
   A description that defines what the next tasks work with can come before them. For example, the Library Dashboards page explains the reading status and the rating before the tasks that set them.
   When a page has tasks that use a feature and tasks that set it up, put the description of what you use after the first group of tasks, then the setup tasks. For example, the Look-up page explains the Look-up dialog after the tasks that open and use it, and before the tasks in settings.
6. When you add a page, add it to `docs/guide/README.md` and `docs/README.md`.

---

## Tables

1. Start every cell in a description column with the same grammatical form. For example, start each with a present-tense verb: "Opens the note editor".
2. In a settings table, use the columns **Setting** and **What it does**.
3. In a command table, write each command name exactly as the palette shows it, including a final "…".
4. Do not put the pipe character (`|`) in a cell.

---

## Examples

These examples come from the guide before the rewrite.

**The software has human traits**

> Before: It opens as a bar under the toolbar, which says it plainly: *locations do not match standard page numbers*, and navigation is approximate.
>
> After: The Go to bar opens under the toolbar. It shows this message: *Locations do not match standard page numbers. Navigation is approximate.*

**A design justification**

> Before: This is not configurable, and that is deliberate rather than an omission. Every other conversion writes a file and forgets it; this one has to *find the same book again* every time you run the command…
>
> After: Orbis Reader saves the book in the same folder as the note, with the same name. You cannot change this location.

**A slogan**

> Before: **Orbis does not sync the data. It makes its data syncable.**
>
> After: Orbis Reader writes its data to files in your vault. To copy these files to your other devices, use a sync tool, such as Obsidian Sync.

**A procedure written as prose**

> Before: Selecting **Manage recordings and mixes…** — from the reader's **⋯** menu, or the command palette — opens **Recordings and mixes** for the book you are reading. **Add recording** starts with your default recording voice… Pick a different voice if you want one — **Preview** plays it… — clear the tracks you don't want, then select **Generate (N)**.
>
> After:
>
> 1. In the **⋯** menu, select **Manage recordings and mixes**.
> 2. Select **Add recording**.
> 3. Optional: Select a different voice. To hear the voice, select **Preview**.
> 4. Uncheck the tracks that you do not want to record.
> 5. Select **Generate (N)**.

---

## Rewriting an existing page

1. Use the UI labels as they are in `src/i18n/en.ts`. When a UI label changes, change the guide in the same commit.
2. Keep every fact, UI label, setting name and limit. If a sentence is ambiguous, keep it and flag it. Do not guess.
3. Keep the existing headings and structure, unless a section mixes a procedure and a description.
4. After the rewrite, list every sentence that you removed. The reviewer uses the list to confirm that no necessary information was lost.
5. Rewrite one page first and review it. Then rewrite the other pages.

---

## Review checklist

Use this checklist for each new or changed page.

- [ ] The page tells the reader what the product does and what to do. It does not explain how a feature was built.
- [ ] Every "because" helps the reader choose an option or prevent an error.
- [ ] The software has no human traits.
- [ ] There are no slogans, asides, idioms or rhetorical contrasts.
- [ ] Each task with two or more actions is a numbered procedure.
- [ ] Sentences and paragraphs are within the length limits.
- [ ] Every term is in [Terminology](terminology.md), with its approved meaning.
- [ ] Every UI label is in bold and matches `src/i18n/en.ts`.
- [ ] Settings paths follow the writing rules in Terminology.
- [ ] The page follows the page structure, and it ends with **See also**.
- [ ] `pnpm lint:vocab`, `pnpm lint:md` and `pnpm lint:links` pass.

---

## Maintaining this standard

1. Change this file when a writing rule changes.
2. When you approve a new term, add it to [Terminology](terminology.md). Record the decision in the [Glossary](glossary.md).
3. When you retire a word, add it to `RETIRED` in `scripts/check-vocabulary.ts`.
