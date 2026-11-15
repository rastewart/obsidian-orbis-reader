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

/** The notice after a cleanup: each count in its own phrase, singular or plural, and a count of zero left out. */
export function removedMessage(selections: number, notes: number): string {
  const s = t(selections === 1 ? 'cleanup.removed_selections_one' : 'cleanup.removed_selections', { n: selections });
  const n = t(notes === 1 ? 'cleanup.removed_notes_one' : 'cleanup.removed_notes', { n: notes });
  const what = selections && notes ? t('cleanup.removed_both', { selections: s, notes: n }) : selections ? s : n;
  return t('cleanup.removed', { what });
}

/**
 * Preview + confirm dialog for the annotation-data cleanup command. Lists each problem (type,
 * reason, text snippet) and, on confirm, hands the ids back to be removed. Nothing is deleted
 * without the user pressing Remove.
 */
export class AnnotationCleanupModal extends OrbisModal {
  constructor(
    app: App,
    private readonly problems: AnnotationProblem[],
    private readonly onRemove: (ids: Set<string>) => void
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
    contentEl.createEl('p', { text: t(n === 1 ? 'cleanup.summary_one' : 'cleanup.summary', { n: String(n) }) });
    const list = contentEl.createDiv({ cls: 'orbis-cleanup-list orbis-list-box' });
    for (const p of this.problems) {
      const row = list.createDiv({ cls: 'orbis-cleanup-row' });
      row.createDiv({
        cls: 'orbis-cleanup-meta',
        text: `${t(TYPE_LABEL[p.type])} · ${t(REASON_LABEL[p.reason])}`,
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
      cta: true,
      destructive: true,
      onClick: () => {
        this.onRemove(new Set(this.problems.map((p) => p.id)));
        this.close();
      },
    });
  }
}
