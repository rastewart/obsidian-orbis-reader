// The only question *Read in Orbis Reader* ever asks.
//
// The note has changed since its book was made, and that book has annotations in it. Every other path through the
// feature is silent — a book that still matches opens, a book with nothing in it is replaced — and this one is
// asked because the alternative is to strand work someone did. See docs/design/read-in-orbis-reader.md.
//
// **One question, answered from a list.** The dialog lists the annotated books — and a picker is acceptable here
// and nowhere else: by the time a second version exists the reader chose to keep one, so they are the only
// one who knows which reading they want to continue. Guessing for them — newest, or most-annotated — would be
// picking in the one situation where the whole point is that they had a preference.
//
// **The dialog does not name Orbis Reader.** The menu item does, because a file context menu fills with items
// from every plugin and one has to identify itself; in our own dialog the reader is already here, and an app
// referring to itself in the third person reads like a system notification rather than the thing in front of them.

import type { App } from 'obsidian';
import type { NoteBook } from './book-origin';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import { openOrbisDialog } from './OrbisModal';

/** Open this book, or make a new one from the note as it is now. */
export type ChangedNoteChoice = { kind: 'open'; path: string } | { kind: 'create' };

/** How many annotations a book carries, in words — a real plural form, never `annotation(s)`. */
export function annotationCount(n: number): string {
  return n === 1 ? t('read_in_orbis.annotations_one') : t('read_in_orbis.annotations', { count: String(n) });
}

/**
 * Which words this dialog says, given what it found.
 *
 * **Almost nothing varies, and that is the point.** The sentence does not carry the annotation count; the list
 * does — per book, where it is accurate rather than summarized — so the body is one string and *these* covers any
 * number. The only plural is the title's, where "the book" would be wrong with three of them.
 */
export function changedNoteText(annotated: readonly NoteBook[]): { title: string; body: string; kept: string } {
  return {
    title: annotated.length > 1 ? t('read_in_orbis.changed_title_many') : t('read_in_orbis.changed_title'),
    body: t('read_in_orbis.changed_body'),
    kept: t('read_in_orbis.kept'),
  };
}

/**
 * Ask, and resolve with the answer — or `null` if the reader dismissed it.
 *
 * `annotated` is newest first, which `resolveNoteBooks` guarantees.
 */
export function askAboutChangedNote(app: App, annotated: readonly NoteBook[]): Promise<ChangedNoteChoice | null> {
  return new Promise((resolve) => {
    let answer: ChangedNoteChoice | null = null;
    const words = changedNoteText(annotated);
    openOrbisDialog(
      app,
      {
        // **The title names the reference point.** "This note has changed" alone does not say *changed relative
        // to what*, which is the whole reason there is a decision to make. And **created** here matches
        // **Create** in the button below: the same verb for the same act, so the second button reads as doing
        // again what the title says already happened.
        title: words.title,
        onClose: () => resolve(answer),
      },
      (body, close, _modalEl, footer) => {
        /**
         * **Every lead-in sits with the thing it introduces.** The sentence about OPENING sits above the list of
         * versions to open, and the one about CREATING above the button that creates, so the dialog reads in
         * order: here is what you already have, here is what a new one would be, nothing is lost either way, or
         * leave.
         */
        body.createEl('p', { text: t('read_in_orbis.open_intro') });

        /**
         * **The list is the dialog, at any number — including one.**
         *
         * A single annotated book gets a row too, not a button reading *Open the annotated book*, because a row
         * says what a button can only describe. You learn which version you are returning to, when it was made
         * and how much work is in it, rather than being told there is one. And one shape for every count means
         * nothing surprises a reader who has seen another.
         *
         * A list on its own ground, like every other list in Orbis — see `.orbis-list-box`.
         */
        const list = body.createDiv({ cls: 'orbis-list-box' });
        for (const book of annotated) {
          const row = list.createDiv({ cls: 'orbis-dev-loc-row' });
          const info = row.createDiv();
          info.createDiv({ cls: 'orbis-dev-loc-name', text: versionLabel(book) });
          info.createEl('small', {
            cls: 'orbis-dev-loc-meta',
            text: `${madeOn(book)} · ${annotationCount(book.annotations)}`,
          });
          // Plain, not `mod-cta`: one per row means several buttons all claiming to be the most important thing,
          // and a picker has no primary action. Same reasoning as the device-locations list.
          const btn = row.createEl('button', { text: t('read_in_orbis.open'), cls: 'orbis-dev-loc-btn' });
          // Otherwise-identical "Open" buttons need telling apart by anything reading the row aloud.
          btn.setAttribute(
            'aria-label',
            `${t('read_in_orbis.open')} — ${versionLabel(book)}, ${madeOn(book)}, ${annotationCount(book.annotations)}`
          );
          btn.addEventListener('click', () => {
            answer = { kind: 'open', path: book.path };
            close();
          });
        }

        // What a new version would be, directly above the button that makes one.
        body.createEl('p', { text: words.body });

        /**
         * **Create lives in the BODY, not the footer, and that is a deliberate break from every other dialog.**
         *
         * This one has N+1 choices where N of them are rows: *Create a new version* is the last choice, not a
         * footer action, and putting it with the rows is what makes the shape honest. The footer then holds
         * Cancel alone, so the rule reads "above: what you can do; below: leave" — which is the same call as
         * giving Cancel its own row rather than the full-width treatment.
         *
         * Full width, matching the rows above it: stacked so nothing wraps, and no `mod-cta`. Opening an
         * existing version and making a new one are both legitimate and nothing is lost either way, so styling
         * this as *the* answer would nudge a decision the reader is better placed to make — and the rows cannot
         * be marked primary, so a call to action here would be the dialog quietly recommending the one outcome
         * that adds a file.
         */
        actionButton(actionRow(body, { stack: true }), {
          label: t('read_in_orbis.create_new'),
          onClick: () => {
            answer = { kind: 'create' };
            close();
          },
        });

        /**
         * **Last line before the reader commits.** Nothing is destroyed on either path, and this is where the
         * hesitation would otherwise sit — the difference between a question answered in a second and one
         * somebody stops to think about. It comes after BOTH choices because it is a statement about both.
         */
        body.createEl('p', { cls: 'setting-item-description', text: words.kept });

        // Its own row, ordinary width, below the rule: the way out is not a third choice, and Cancel styled like
        // the controls above would make leaving look like one of the things you came here to do.
        actionButton(actionRow(footer()), { label: t('action.cancel'), onClick: () => close() });
      }
    );
  });
}

/**
 * Which version this book is, said the way the file list says it.
 *
 * **The row leads with what is on disk.** The books are `Sample Book review.epub` and `Sample Book review - v002.epub`,
 * so a row headed by a date would leave the reader matching a dialog against a folder by arithmetic. The date is
 * on the line beneath, where it belongs with the annotation count as the pair that tells two readings apart.
 */
export function versionLabel(book: NoteBook): string {
  return t('read_in_orbis.version', { n: String(book.version) });
}

/** The day a book was made, from its origin file — with the count, the pair that tells two readings apart. */
function madeOn(book: NoteBook): string {
  const when = new Date(book.origin.created);
  return Number.isNaN(when.getTime()) ? book.path : when.toLocaleDateString();
}
