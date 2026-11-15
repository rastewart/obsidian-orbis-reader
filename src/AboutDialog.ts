import { Notice } from 'obsidian';
import { BUILD_COMMIT, BUILD_TIME } from './build-info';
import { t } from './i18n';
import { createOrbisPopup, type OrbisPopupHost } from './ui-utils';

/**
 * Small "About" popup showing the plugin version and the build stamp (time +
 * commit), so there's no ambiguity about which build is being tested. Built on
 * the shared `createOrbisPopup` scaffolding like the other Orbis dialogs —
 * tap-outside / Escape to dismiss, plus explicit Copy and Close buttons.
 */
export function openAboutDialog(host: OrbisPopupHost, version: string): void {
  const { popupEl, close } = createOrbisPopup(host, {
    title: t('about.title'),
    desktopWidth: '340px',
    mobileMaxWidth: 340,
    lockMobileHeights: false, // no text field → no keyboard → no reader height-lock needed
  });

  const rows: Array<[string, string]> = [
    [t('about.version'), version],
    [t('about.build'), BUILD_TIME],
    [t('about.commit'), BUILD_COMMIT],
  ];

  const body = popupEl.createDiv({ cls: 'orbis-about-body' });
  for (const [label, value] of rows) {
    const row = body.createDiv({ cls: 'orbis-about-row' });
    row.createSpan({ cls: 'orbis-about-label', text: label });
    row.createSpan({ cls: 'orbis-about-value', text: value });
  }

  const clipboardText = rows.map(([label, value]) => `${label}: ${value}`).join('\n');

  const buttons = popupEl.createDiv({ cls: 'orbis-about-buttons' });
  // Dialog actions take Obsidian's own button styling; `orbis-ctrl-btn` is the flat toolbar control.
  const copyBtn = buttons.createEl('button', { text: t('about.copy') });
  copyBtn.addEventListener('click', () => {
    void navigator.clipboard.writeText(clipboardText).then(() => new Notice(t('about.copied')));
  });
  const okBtn = buttons.createEl('button', { text: t('action.close') });
  okBtn.addEventListener('click', () => close());
}
