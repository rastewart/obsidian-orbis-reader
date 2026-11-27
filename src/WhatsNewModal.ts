// What's new: the dialog that shows the release notes, and the notice that offers it after an update.
//
// Which releases, and which of them are new to this device, is decided in `release-notes.ts`; this file only draws.
// See docs/design/first-run.md § Release notes.

import { type App, Component, MarkdownRenderer, Notice } from 'obsidian';
import { actionButton, actionRow } from './controls';
import { deviceSetting, setDeviceSetting } from './device-settings';
import { updatedFrom } from './first-run';
import { t } from './i18n';
import { OrbisModal } from './OrbisModal';
import { CHANGELOG, parseChangelog, type Release, releasesFor, whatsNewPages } from './release-notes';

/** The releases this build can show, newest first. */
export function installedReleases(current: string): Release[] {
  return releasesFor(parseChangelog(CHANGELOG), current);
}

/** `0.2.0`, or `0.2.0 Beta 3` for a beta's section. */
function releaseName(r: Release): string {
  return r.beta ? t('whats_new.beta', { version: r.version ?? '', n: String(r.beta) }) : (r.version ?? '');
}

/** A manifest version as the headings write it: `0.2.0-beta.3` is `0.2.0 Beta 3`. */
function versionName(version: string): string {
  const m = /^(.+)-beta\.(\d+)$/.exec(version);
  return m ? t('whats_new.beta', { version: m[1], n: m[2] }) : version;
}

/** `24 November 2026` in the reader's language — read as a calendar date, so no time zone moves it a day. */
function releaseDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

/**
 * The release notes, a page at a time: **Newer** and **Older** move between pages, newest first.
 *
 * **The switch for the notice is here**, at the foot of the dialog it offers, and not on a settings page: it means
 * something only beside what it controls, and the What's new button in settings is the way back to it.
 */
class WhatsNewModal extends OrbisModal {
  private page = 0;
  /** Owns the rendered Markdown of the page on screen; replaced on every page. */
  private rendered: Component | null = null;

  constructor(
    app: App,
    private readonly pages: Release[][],
    /** Above the first page, when it holds every release since an update: from that release to this one. */
    private readonly updateLine: string | null
  ) {
    super(app);
  }

  protected dialogTitle(): string {
    return t('whats_new.title');
  }

  protected renderDialog(): void {
    // One size for every page, so Older and Newer stay where they are and the notes scroll — see styles.css.
    this.modalEl.addClass('orbis-whats-new');
    const footer = this.footer();
    const switchRow = footer.createEl('label', { cls: 'orbis-whats-new-switch' });
    const box = switchRow.createEl('input', { type: 'checkbox' });
    box.checked = deviceSetting('showWhatsNew');
    box.addEventListener('change', () => setDeviceSetting('showWhatsNew', box.checked));
    switchRow.createSpan({ text: t('whats_new.show_after_update') });

    const row = actionRow(footer);
    // Older on the left and Newer on the right, as ‹ and › turn pages: the dialog opens on the newest release, and
    // paging back in time is paging left.
    this.olderBtn = actionButton(row, { label: t('whats_new.older'), onClick: () => this.turn(1) });
    this.newerBtn = actionButton(row, { label: t('whats_new.newer'), onClick: () => this.turn(-1) });
    const close = actionButton(row, { label: t('whats_new.close'), cta: true, onClick: () => this.close() });
    // The keyboard starts on Close, not on the switch that comes first: Enter or Space should finish reading, not
    // turn off the notice by accident. See `OrbisModal.onOpen`.
    close.dataset.orbisStart = '';
    this.drawPage();
  }

  private newerBtn: HTMLButtonElement | null = null;
  private olderBtn: HTMLButtonElement | null = null;

  private turn(by: number): void {
    const next = this.page + by;
    if (next < 0 || next >= this.pages.length) return;
    this.page = next;
    this.drawPage();
  }

  private drawPage(): void {
    this.rendered?.unload();
    this.rendered = new Component();
    this.rendered.load();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.scrollTop = 0;
    const releases = this.pages[this.page] ?? [];
    if (releases.length === 0) contentEl.createEl('p', { text: t('whats_new.none') });
    // On the first page only: it says what that page holds, and the pages after it are older releases.
    if (this.page === 0 && this.updateLine)
      contentEl.createEl('p', { cls: 'orbis-whats-new-from', text: this.updateLine });
    for (const r of releases) {
      const section = contentEl.createDiv({ cls: 'orbis-whats-new-release' });
      section.createEl('h2', { cls: 'orbis-whats-new-version', text: releaseName(r) });
      section.createDiv({
        cls: 'orbis-whats-new-date',
        text: r.date ? releaseDate(r.date) : t('whats_new.not_released'),
      });
      const body = section.createDiv({ cls: 'orbis-whats-new-body markdown-rendered' });
      void MarkdownRenderer.render(this.app, r.body, body, '', this.rendered);
    }
    if (this.newerBtn) this.newerBtn.disabled = this.page === 0;
    if (this.olderBtn) this.olderBtn.disabled = this.page >= this.pages.length - 1;
  }

  protected onDialogClose(): void {
    this.rendered?.unload();
    this.rendered = null;
  }
}

/**
 * Open What's new. After an update its first page holds every release since the one this device was updated from,
 * under a line that names both — see `whatsNewPages`. The same from the notice, the settings button and the command
 * palette, until the next update.
 */
export function openWhatsNew(app: App, current: string): void {
  const { pages, from } = whatsNewPages(installedReleases(current), updatedFrom());
  // A second sentence when the first page holds more than one release, so the reader scrolls past the first.
  const count = pages[0]?.length ?? 0;
  const line =
    from === null
      ? null
      : t(count > 1 ? 'whats_new.updated_from_many' : 'whats_new.updated_from', {
          from: versionName(from),
          to: versionName(current),
          count: String(count),
        });
  new WhatsNewModal(app, pages, line).open();
}

/**
 * Say that Orbis was updated, with a link to what changed.
 *
 * **A notice, not a dialog.** It asks nothing, so it blocks nothing: the welcome and the multi-device offer keep the
 * one dialog a launch is allowed. It stays until it is clicked — Obsidian's few seconds go by unread on a phone, and
 * a click anywhere on it closes it, as on any notice.
 */
export function showUpdateNotice(app: App, current: string): void {
  const message = createFragment((frag) => {
    frag.appendText(t('whats_new.updated', { version: current }));
    frag.appendText(' ');
    const link = frag.createEl('a', { text: t('whats_new.see'), href: '#' });
    link.addEventListener('click', (ev) => {
      ev.preventDefault();
      openWhatsNew(app, current);
    });
  });
  new Notice(message, 0);
}
