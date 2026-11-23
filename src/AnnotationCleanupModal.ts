import { App } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { t } from './i18n';
import type { TranslationKey } from './i18n/en';
import { OrbisModal } from './OrbisModal';
import type { AnnotationProblem } from './reader/annotation-repair';

const TYPE_LABEL: Record<AnnotationProblem['type'], TranslationKey> = {
  highlight: 'cleanup.type_highlight',
  note: 'cleanup.type_note',
};
const REASON_LABEL: Record<AnnotationProblem['reason'], TranslationKey> = {
  'malformed-range': 'cleanup.reason_malformed',
  duplicate: 'cleanup.reason_duplicate',
};

/** How many passage selections and notes, each in its own phrase, singular or plural, and a count of zero left out. */
function counted(selections: number, notes: number): string {
  const s = t(selections === 1 ? 'cleanup.removed_selections_one' : 'cleanup.removed_selections', { n: selections });
  const n = t(notes === 1 ? 'cleanup.removed_notes_one' : 'cleanup.removed_notes', { n: notes });
  return selections && notes ? t('cleanup.removed_both', { selections: s, notes: n }) : selections ? s : n;
}

/** The notice after a cleanup. */
export function removedMessage(selections: number, notes: number): string {
  return t('cleanup.removed', { what: counted(selections, notes) });
}

/** The notice after a repair. */
export function repairedMessage(selections: number, notes: number): string {
  return t('cleanup.repaired', { what: counted(selections, notes) });
}

/** What the dialog can do with the problems it lists. */
export interface CleanupActions {
  /** The problems that can be put back on their passage (`collapsedElementPath`). */
  repairable: ReadonlySet<string>;
  onRepair: (ids: Set<string>) => void;
  onRemove: (ids: Set<string>) => void;
}

/**
 * Preview + confirm dialog for the annotation-data cleanup command. Lists each problem (type,
 * reason, text snippet), saying which can be repaired, and on confirm hands the ids back to be repaired or removed.
 * Nothing changes until the user presses Repair or Remove.
 *
 * **Repair is offered first, and only for what it can put back.** A passage selection or note stored empty on the
 * paragraph it was made on still says which paragraph that was, and the paragraph's text is still the text it
 * stored, so it can go back exactly where it was. Removing it would throw away a mark and a note that are only
 * misfiled. What cannot be repaired is still offered for removal, as before.
 */
export class AnnotationCleanupModal extends OrbisModal {
  constructor(
    app: App,
    private readonly problems: AnnotationProblem[],
    private readonly actions: CleanupActions
  ) {
    super(app);
  }

  protected dialogTitle(): string {
    return t('cleanup.title');
  }

  protected renderDialog(): void {
    const { contentEl } = this;

    if (this.problems.length === 0) {
      contentEl.createEl('p', { text: t('cleanup.none_found') });
      actionButton(actionRow(this.footer()), {
        label: t('action.close'),
        cta: true,
        onClick: () => this.close(),
      });
      return;
    }

    const n = this.problems.length;
    const repairable = this.problems.filter((p) => this.actions.repairable.has(p.id));
    contentEl.createEl('p', { text: t(n === 1 ? 'cleanup.summary_one' : 'cleanup.summary', { n: String(n) }) });
    if (repairable.length)
      contentEl.createEl('p', {
        text: t(repairable.length === 1 ? 'cleanup.repairable_summary_one' : 'cleanup.repairable_summary', {
          n: String(repairable.length),
        }),
      });
    const list = contentEl.createDiv({ cls: 'orbis-cleanup-list orbis-list-box' });
    for (const p of this.problems) {
      const row = list.createDiv({ cls: 'orbis-cleanup-row' });
      row.createDiv({
        cls: 'orbis-cleanup-meta',
        text: [
          t(TYPE_LABEL[p.type]),
          t(REASON_LABEL[p.reason]),
          ...(this.actions.repairable.has(p.id) ? [t('cleanup.can_repair')] : []),
        ].join(' · '),
      });
      row.createDiv({
        cls: 'orbis-cleanup-text',
        text: p.text ? `“${p.text.slice(0, 80)}${p.text.length > 80 ? '…' : ''}”` : t('cleanup.no_text'),
      });
    }

    // The footer, so the buttons keep their place while a long list of problems scrolls past them.
    const row = actionRow(this.footer());
    actionButton(row, { label: t('action.cancel'), onClick: () => this.close() });
    actionButton(row, {
      label: t('cleanup.remove', { n: String(this.problems.length) }),
      cta: !repairable.length,
      destructive: true,
      onClick: () => {
        this.actions.onRemove(new Set(this.problems.map((p) => p.id)));
        this.close();
      },
    });
    if (repairable.length)
      actionButton(row, {
        label: t('cleanup.repair', { n: String(repairable.length) }),
        cta: true,
        onClick: () => {
          this.actions.onRepair(new Set(repairable.map((p) => p.id)));
          this.close();
        },
      });
  }
}
