// Where this book is being read on the reader's other devices.

import { t } from './i18n';
import { DeviceLocationRecord } from './progress';
import { createOrbisPopup, type OrbisPopupHost } from './ui-utils';

export class DeviceLocationsModal {
  constructor(
    private host: OrbisPopupHost,
    private devices: DeviceLocationRecord[],
    private locResolver: (cfi: string) => number | null,
    private onSelect: (cfi: string) => void,
    private ownDeviceId?: string,
    private onCloseCallback?: () => void
  ) {}

  open(): void {
    const { popupEl, close } = createOrbisPopup(this.host, {
      title: t('device_locations_modal.device_locations'),
      dismissOnOutsideClick: true,
      desktopWidth: '420px',
      mobileFillHeight: true,
      onClose: () => this.onCloseCallback?.(),
    });
    popupEl.createEl('p', {
      text: t('device_locations_modal.prompt'),
      cls: 'setting-item-description',
    });
    // A list on its own ground, like every other list in Orbis. Rows drawn straight onto the popup leave hairlines
    // between them that read as rules someone had left in rather than as one list — see `.orbis-list-box`.
    const listEl = popupEl.createDiv({ cls: 'orbis-list-box' });
    this.devices.forEach((d) => {
      const isOwn = !!this.ownDeviceId && d.deviceId === this.ownDeviceId;
      const row = listEl.createDiv({ cls: 'orbis-dev-loc-row' });
      const info = row.createDiv();
      const nameEl = info.createDiv({ cls: 'orbis-dev-loc-name' });
      nameEl.createSpan({ text: d.deviceName || d.deviceId });
      if (isOwn) nameEl.createSpan({ text: t('device_locations_modal.this_device'), cls: 'orbis-dev-loc-own' });
      const loc = this.locResolver(d.location);
      const meta =
        new Date(d.lastOpened).toLocaleString() + (loc != null ? ` · ${t('annotations_tab.loc_n', { n: loc })}` : '');
      info.createEl('small', { text: meta, cls: 'orbis-dev-loc-meta' });
      /**
       * **A plain button, not `mod-cta`.** Obsidian decides what a button looks like; the class this carries keeps
       * only the row layout.
       *
       * And not the accent, for the reason `ActionSpec.cta` states: `mod-cta` is *the* primary action, one per
       * dialog or none. There is one of these per row, so four devices would mean four buttons all claiming to be
       * the most important thing — and this dialog has no primary action at all, being a picker. Repeated row
       * actions are plain here, as they are in the presets manager.
       */
      const btn = row.createEl('button', {
        text: t('go_to.go'),
        cls: 'orbis-dev-loc-btn',
      });
      // Distinguishes otherwise-identical "Go" buttons across rows for screen readers.
      const fullLabel = `${t('device_locations_modal.go_to_this_location')} — ${d.deviceName || d.deviceId}`;
      btn.setAttribute('aria-label', fullLabel);
      btn.addEventListener('click', () => {
        this.onSelect(d.location);
        close();
      });
    });
  }
}
