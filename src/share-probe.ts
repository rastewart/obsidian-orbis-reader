// DEV: what this device offers for getting a file out of the vault — the measurement roadmap §8.13 asks for before
// Save as PDF and Save annotations as PDF get a save dialog (desktop) or a share sheet (phone and tablet).
//
// Obsidian's own Share item on a phone is the "Open in default app" core plugin: on the mobile app
// `app.openWithDefaultApp(path)` calls the vault adapter's `open(path)`, which the app implements natively. Neither is
// in `obsidian.d.ts`, so both are probed here rather than assumed. The test file goes in the plugin's own folder, not
// the visible vault, because a PDF made to send to someone should not be left behind among the reader's notes; the
// probe says whether `open` reaches a file there. On a desktop the route is Electron's save dialog, reached the way
// `sources/hop-request.ts` reaches `net`.
//
// Everything goes to the debug log under `export`. Nothing here is user-facing.

import { type App, Notice, Platform, type Plugin } from 'obsidian';
import { deviceSetting } from './device-settings';
import { desktopModules } from './outside-vault';
import type { DebugCategory } from './settings';

const TEST_NAME = 'Orbis share test.pdf';

/** A one-page PDF saying what it is, with a correct cross-reference table so a strict viewer opens it too. */
export function tinyPdf(): Uint8Array {
  const text = 'BT /F1 18 Tf 24 72 Td (Orbis Reader share test) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) out += `${String(at).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

async function probeDesktop(bytes: Uint8Array, say: (what: string, value: string) => void): Promise<void> {
  const { dialog, currentWindow, writeFile } = desktopModules();
  say('electron.remote.dialog.showSaveDialog', typeof dialog?.showSaveDialog);
  say('fs.promises.writeFile', typeof writeFile);
  if (!dialog?.showSaveDialog || !writeFile) return;
  const answer = await dialog.showSaveDialog(currentWindow, {
    defaultPath: TEST_NAME,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  say('save dialog', answer.canceled ? 'canceled' : (answer.filePath ?? '(no path)'));
  if (answer.canceled || !answer.filePath) return;
  try {
    await writeFile(answer.filePath, bytes);
    say('wrote', answer.filePath);
  } catch (e) {
    say('write failed', String(e));
  }
}

async function probeMobile(app: App, bytes: Uint8Array, say: (what: string, value: string) => void): Promise<void> {
  const adapter = app.vault.adapter;
  const open = (adapter as unknown as { open?: (path: string) => Promise<unknown> }).open;
  const dir = `${app.vault.configDir}/plugins/orbis-reader/share-test`;
  const path = `${dir}/${TEST_NAME}`;
  try {
    if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
    await adapter.writeBinary(path, bytes.buffer as ArrayBuffer);
    say('wrote', path);
  } catch (e) {
    say('write failed', String(e));
    return;
  }
  if (typeof open !== 'function') return;
  try {
    await open.call(adapter, path);
    say('adapter.open(plugin folder)', 'returned without an error');
  } catch (e) {
    say('adapter.open(plugin folder) threw', String(e));
  }
}

/** Log what this device can do, then try its route with a one-page test PDF. */
async function runShareProbe(app: App, log: (msg: string) => void): Promise<void> {
  const say = (what: string, value: string) => log(`share probe — ${what}: ${value}`);
  say(
    'platform',
    JSON.stringify({
      desktopApp: Platform.isDesktopApp,
      mobileApp: Platform.isMobileApp,
      ios: Platform.isIosApp,
      android: Platform.isAndroidApp,
      macOS: Platform.isMacOS,
    })
  );
  say('adapter.open', typeof (app.vault.adapter as unknown as { open?: unknown }).open);
  say('app.openWithDefaultApp', typeof (app as unknown as { openWithDefaultApp?: unknown }).openWithDefaultApp);
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  say('Capacitor.Plugins', plugins ? Object.keys(plugins).join(', ') || '(none)' : '(no Capacitor)');
  say('navigator.share', typeof navigator.share);

  const bytes = tinyPdf();
  let canShare: string;
  try {
    const file = new File([bytes.buffer as ArrayBuffer], TEST_NAME, { type: 'application/pdf' });
    canShare = typeof navigator.canShare === 'function' ? String(navigator.canShare({ files: [file] })) : 'no canShare';
  } catch (e) {
    canShare = `threw ${String(e)}`;
  }
  say('navigator.canShare(a PDF)', canShare);

  if (Platform.isDesktopApp) await probeDesktop(bytes, say);
  else await probeMobile(app, bytes, say);
  say('done', 'see the lines above');
}

/** The developer command that runs the probe, shown only with the developer options on. */
export function registerShareProbe(
  plugin: Plugin & { debug(msg: string, extra?: unknown, category?: DebugCategory): void }
): void {
  plugin.addCommand({
    id: 'orbis-probe-file-sharing',
    // i18n-audit-disable-next-line -- dev-only diagnostic command
    name: 'Probe file sharing (dev)',
    checkCallback: (checking) => {
      if (!deviceSetting('showDevOptions')) return false;
      if (!checking) {
        void runShareProbe(plugin.app, (m) => plugin.debug(m, undefined, 'export')).then(() => {
          // i18n-audit-disable-next-line -- dev-only diagnostic notice
          new Notice('Share probe done. See the debug log (export).');
        });
      }
      return true;
    },
  });
}
