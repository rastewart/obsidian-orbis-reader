// The per-book reading-records dialog: whether this book writes records, which kinds, and where they land.
//
// Three questions on one screen, seeded so the common answer is one tap. A book that has never been asked
// opens with records on, kinds following the vault, and the shared folder — which is what someone opening this
// dialog almost always wants; a book that has answered opens on its own answer.
//
// **Every section says who owns it.** A toggle showing "on" is ambiguous between "this book decided" and "the
// vault does this to every book", and three toggles showing the vault's kinds are indistinguishable from three
// this book chose. Values without provenance are how a settings page becomes untrustworthy — so the enable row
// carries a line naming its authority, the kinds section is behind an explicit "follow the vault" switch, and
// the location's shared option is named for the vault.
//
// The dialog never touches the vault itself. Where a location resolves to, and how many records already live
// there, arrive through the `resolve` callback, so the reader view keeps the vault access and the arithmetic
// stays where it is tested (`record-paths.ts`).
//
// See docs/design/reading-records.md §Per book, not only global.

import { type App, Setting } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { folderPickerRow } from './folder-picker';
import { t } from './i18n';
import type { TranslationKey } from './i18n/en';
import { openOrbisDialog } from './OrbisModal';
import type { BookRecordConfig, RecordKinds, RecordLocation, RecordsMode } from './record-config';
import { annotationsSvg } from './system-glyphs';
import { captureFocus, scrollParent, setSettingDisabled } from './ui-utils';

/** What a location choice means in the vault: the folder, and what is already in it. */
export interface LocationPreview {
  folder: string;
  count: number;
}

export interface BookRecordsDialogInput {
  /** The book's name, for the dialog's own copy. */
  bookName: string;
  /** Seeded config — `seedBookConfig`. Mutated as the reader answers, and handed back on save. */
  config: BookRecordConfig;
  /** What the vault says: the mode (for the off warning and the authority line), its kinds (what the disabled
   *  toggles display while this book follows them) and its default location (named in the inherit option). */
  vault: { mode: RecordsMode; kinds: RecordKinds; location: RecordLocation };
  /** Where this book's records live right now, whatever it is about to be changed to. */
  current: LocationPreview;
  resolve: (location: RecordLocation) => LocationPreview;
  onSave: (config: BookRecordConfig) => void;
}

const KIND_LABELS: { key: keyof RecordKinds; label: TranslationKey }[] = [
  { key: 'passages', label: 'reading_records_page.kind_passages' },
  { key: 'notes', label: 'reading_records_page.kind_notes' },
  { key: 'bookmarks', label: 'reading_records_page.kind_bookmarks' },
];

// The location dropdown's first entry is `follow`, meaning the absence of a stored location — inheritance as a
// VALUE in the same control rather than as a second switch beside it. A single-choice control can say
// "Default (…)" the way a set of independent toggles cannot, which is why kinds get a switch and this does not.
const LOCATION_LABELS: { mode: RecordLocation['mode']; label: TranslationKey }[] = [
  { mode: 'book', label: 'book_records.loc_beside' },
  { mode: 'global', label: 'book_records.loc_global' },
  { mode: 'custom', label: 'book_records.loc_custom' },
];

/** A location of `mode`, keeping any folder already picked so switching away and back does not lose it. */
function locationOf(mode: RecordLocation['mode'], previous: RecordLocation): RecordLocation {
  if (mode === 'book') return { mode: 'book' };
  if (mode === 'custom') return { mode: 'custom', path: previous.mode === 'custom' ? previous.path : '' };
  return { mode: 'global' };
}

/** The three answers a book can give. `follow` is the ABSENCE of a stored `enabled`, so it stays available after
 *  a decision has been made — pinning a book with no way back is the trap the kinds switch and the location
 *  dropdown both exist to avoid, and this control should not be the one section that refuses. */
type BookChoice = 'follow' | 'on' | 'off';

const CHOICE_LABELS: { choice: BookChoice; label: TranslationKey }[] = [
  { choice: 'follow', label: 'book_records.opt_follow' },
  { choice: 'on', label: 'book_records.opt_on' },
  { choice: 'off', label: 'book_records.opt_off' },
];

const VAULT_STATE: Record<RecordsMode, TranslationKey> = {
  off: 'book_records.vault_state_off',
  ask: 'book_records.vault_state_ask',
  on: 'book_records.vault_state_on',
};

const choiceOf = (enabled: boolean | undefined): BookChoice =>
  enabled === undefined ? 'follow' : enabled ? 'on' : 'off';

/**
 * What this book will actually do, and why not when it will not.
 *
 * Three vault states times three book answers is nine outcomes, which no control label can carry — so the dialog
 * states the resolved one outright. Deliberately worded Active/Inactive rather than On/Off: the controls above
 * are On/Off, and a fourth thing saying "Off" would read as another switch rather than as the consequence of the
 * ones above it. There are only three reasons for inactive, and the third — waiting to be asked — is a state
 * no control above can show on its own.
 */
function resolvedLine(mode: RecordsMode, choice: BookChoice): TranslationKey {
  if (choice === 'off') return 'book_records.resolved_off_book';
  if (mode === 'off') return 'book_records.resolved_off_vault';
  if (choice === 'on' || mode === 'on') return 'book_records.resolved_active';
  return 'book_records.resolved_waiting'; // ask + follow: nothing written until the question is answered
}

export function openBookRecordsDialog(app: App, input: BookRecordsDialogInput): void {
  openOrbisDialog(
    app,
    { title: t('book_records.title'), icon: annotationsSvg(16) },
    (body, close, _modalEl, footer) => {
      const { config, vault } = input;
      // Absent kinds mean "follow the vault", so the switch reflects that and `custom` holds what the editable
      // toggles show. Seeded from the vault when this book has no override — so turning the switch off starts
      // from what is happening now rather than from something arbitrary.
      let follow = config.kinds === undefined;
      const custom: RecordKinds = { ...(config.kinds ?? vault.kinds) };

      const render = (): void => {
        // Every control here changes what is below it — switching records off hides two whole sections — and
        // rebuilding resets the scroll. Same treatment, for the same reason, as the EPUB dialog.
        // **And the keyboard, through `rebuildKeepingFocus`: a control that redraws its dialog must leave the reader on
        // the control they just used.** Restored by DOM path here rather than by key, which is enough while the shape
        // above the changed control stays put.
        const scroller = scrollParent(body);
        const scrollTop = scroller?.scrollTop ?? 0;
        const restore = captureFocus(body);
        body.empty();

        // The vault's own answer, first and always. A warning shown only when the vault is off would leave the
        // reader to infer the setting in the other two cases. One line, colored only when it has consequences.
        const choice = choiceOf(config.enabled);
        body.createDiv({
          cls: vault.mode === 'off' ? 'orbis-records-note' : 'orbis-records-authority',
          text: t(VAULT_STATE[vault.mode]),
        });

        // A picker, not a toggle. The stored state has three values and a toggle has two, so a toggle would need an
        // explanatory line underneath for each state it cannot express. The picker says it.
        const choiceRow = new Setting(body)
          .setName(t('book_records.choice'))
          .setDesc(t('book_records.choice_desc'))
          .addDropdown((d) => {
            for (const c of CHOICE_LABELS) d.addOption(c.choice, t(c.label));
            d.setValue(choice).onChange((v) => {
              // `follow` is the absence of the key, not a third value stored in it.
              config.enabled = v === 'follow' ? undefined : v === 'on';
              render();
            });
          });
        choiceRow.settingEl.addClass('orbis-setting-stacked');

        // Cause and effect, adjacent: what the vault says, what this book says, what that adds up to.
        body.createDiv({ cls: 'orbis-records-resolved', text: t(resolvedLine(vault.mode, choice)) });

        // Shown even when nothing is being written: these are this book's configuration either way, and hiding
        // them would mean the only way to set up a book was to switch it on first.
        if (choice !== 'off') {
          new Setting(body).setName(t('book_records.kinds_heading')).setHeading();
          new Setting(body)
            .setName(t('book_records.follow_vault'))
            .setDesc(t(follow ? 'book_records.follow_vault_on' : 'book_records.follow_vault_off'))
            .addToggle((tg) =>
              tg.setValue(follow).onChange((v) => {
                follow = v;
                render();
              })
            );
          // The last kind standing cannot be switched off, same as in settings: all three off would mean "keep a
          // reading record for this book, but nothing counts as content for it", which is what turning the record
          // off says properly.
          const onCount = KIND_LABELS.filter(({ key }) => custom[key]).length;
          for (const { key, label } of KIND_LABELS) {
            const isLastOn = !follow && onCount === 1 && custom[key];
            const row = new Setting(body).setName(t(label)).addToggle((tg) =>
              tg
                // While following, these SHOW the vault's answer and cannot be edited — the switch above is how
                // you take control of them, and it is also the only way back to following, which a bare set of
                // editable toggles could not offer at all.
                .setValue(follow ? vault.kinds[key] : custom[key])
                .onChange((v) => {
                  custom[key] = v;
                  render(); // so the last-one-standing lock follows the change
                })
            );
            // The whole row, not just the toggle: a full-brightness label beside a dead switch reads as broken
            // rather than as inherited. See setSettingDisabled.
            setSettingDisabled(row, follow || isLastOn);
            if (isLastOn) row.setTooltip(t('reading_records_page.kinds_last'));
          }

          new Setting(body).setName(t('book_records.where_heading')).setHeading();
          // What this book will actually use: its own answer, or the vault's default when it has none.
          const effective = config.location ?? vault.location;
          const locationRow = new Setting(body).setName(t('book_records.save_to')).addDropdown((d) => {
            // Inheritance first, and it NAMES the value it resolves to — "Follow vault default" alone would tell
            // you who decides without telling you what was decided, which is half an answer.
            d.addOption(
              'follow',
              t(vault.location.mode === 'book' ? 'book_records.loc_follow_beside' : 'book_records.loc_follow_folder')
            );
            for (const { mode, label } of LOCATION_LABELS) d.addOption(mode, t(label));
            d.setValue(config.location ? config.location.mode : 'follow').onChange((v) => {
              // Picking inheritance DELETES the stored location, so a later change to the vault default reaches
              // this book. Storing the resolved value instead would look identical today and diverge later —
              // the same delete-not-copy rule the kinds switch follows.
              if (v === 'follow') delete config.location;
              else config.location = locationOf(v as RecordLocation['mode'], effective);
              render();
            });
          });
          // A wide <select> beside the label squeezes the name into a sliver and overflows in portrait — the
          // same reason every other folder row in the plugin is stacked.
          locationRow.settingEl.addClass('orbis-setting-stacked');

          if (config.location?.mode === 'custom') {
            const stored = config.location;
            const folderRow = new Setting(body).setName(t('book_records.folder'));
            folderPickerRow(folderRow, {
              app,
              focusKey: 'book-records-folder',
              current: () => stored.path || '/',
              onPick: (v) => {
                config.location = { mode: 'custom', path: v };
                render();
              },
            });
            folderRow.settingEl.addClass('orbis-setting-stacked');
          }

          // The resolved path, always. A location you cannot see the consequence of is a guess, and this is
          // where an accidental collision with a folder that already exists becomes visible, before anything
          // is written into it.
          const target = input.resolve(effective);
          body.createDiv({ cls: 'orbis-records-path', text: target.folder });

          // Changing location MOVES what is already there, and the count is the part worth seeing before
          // saving. The alternative — write a second set, leave the first — shows every annotation twice in
          // the every-book base with nothing on screen to explain why.
          if (target.folder !== input.current.folder && input.current.count > 0) {
            body.createDiv({
              cls: 'orbis-records-note',
              text: t('book_records.moves', { n: String(input.current.count) }),
            });
          }
        }
        if (choice === 'off' && input.current.count > 0) {
          // Only worth saying when there is something to keep. Turning records off never deletes a note: the
          // body below the marker may be the reader's own writing, and this dialog is a preference rather
          // than a cleanup tool — that is what the cleanup command is for.
          body.createDiv({
            cls: 'orbis-records-note',
            text: t('book_records.keeps_existing', { n: String(input.current.count) }),
          });
        }

        // In the footer, which owns the padding, the separator and the phone's safe-area inset — see
        // `InlineOrbisModal.renderDialog`. Emptied first: this screen redraws on every change.
        const bar = footer();
        bar.empty();
        const actions = actionRow(bar);
        actionButton(actions, { label: t('action.cancel'), onClick: () => close() });
        actionButton(actions, {
          label: t('action.save'),
          cta: true,
          onClick: () => {
            // DELETED rather than copied when following: writing today's vault kinds into the book would look
            // identical now and diverge the moment the vault setting next changes — which is exactly the
            // silent-override trap this switch exists to avoid.
            if (follow) delete config.kinds;
            else config.kinds = { ...custom };
            input.onSave(config);
            close();
          },
        });

        if (scroller && scrollTop) scroller.scrollTop = scrollTop;
        restore();
      };

      render();
    }
  );
}
