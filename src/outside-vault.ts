// Getting a file out of the vault: the system save dialog on a computer, the share sheet on a phone or tablet.
//
// **Measured on all four devices before it was built** (`share-probe.ts`, roadmap §8.13). On a computer, Electron's
// `dialog.showSaveDialog` and Node's `fs` write wherever the reader picks. On a phone or tablet the route is the one
// Obsidian's own Share item takes: its "Open in default app" core plugin calls the vault adapter's `open(path)`,
// which the mobile app implements natively — a chooser by file type with Android Share inside it on Android, the
// share sheet on iOS. `navigator.share` exists on iOS only, so it is not used.
//
// **Neither route is in `obsidian.d.ts`.** Each is looked up when asked for, and a device that lacks it gets no
// button at all rather than one that fails — see `outsideRoute`.
//
// **Decide by `isDesktopApp`, never `isMacOS`**: the probe found `Platform.isMacOS` true on the iPhone and the iPad.

import { type App, normalizePath, Platform } from 'obsidian';
import { actionButton } from './controls';
import { t } from './i18n';

/** What this device can do with a file instead of saving it to the vault, if anything. */
export type OutsideRoute = 'export' | 'share';

type SaveDialog = (
  window: unknown,
  options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }
) => Promise<{ canceled: boolean; filePath?: string }>;

export interface DesktopModules {
  dialog?: { showSaveDialog?: SaveDialog };
  currentWindow?: unknown;
  writeFile?: (path: string, data: Uint8Array) => Promise<void>;
}

/** Electron's dialog and Node's `fs`, when this is the desktop app and Obsidian still loads `electron.remote`. */
export function desktopModules(): DesktopModules {
  if (!Platform.isDesktopApp) return {};
  try {
    const load = (window as unknown as { require?: (id: string) => unknown }).require;
    const remote = (
      load?.('electron') as
        | { remote?: { dialog?: { showSaveDialog?: SaveDialog }; getCurrentWindow?: () => unknown } }
        | undefined
    )?.remote;
    const fs = load?.('fs') as { promises?: { writeFile?: (path: string, data: Uint8Array) => Promise<void> } };
    return { dialog: remote?.dialog, currentWindow: remote?.getCurrentWindow?.(), writeFile: fs?.promises?.writeFile };
  } catch {
    return {};
  }
}

type AdapterOpen = (path: string) => Promise<unknown>;

function adapterOpen(app: App): AdapterOpen | null {
  const open = (app.vault.adapter as unknown as { open?: AdapterOpen }).open;
  return Platform.isMobileApp && typeof open === 'function' ? open.bind(app.vault.adapter) : null;
}

export function outsideRoute(app: App): OutsideRoute | null {
  if (Platform.isDesktopApp) {
    const { dialog, writeFile } = desktopModules();
    return typeof dialog?.showSaveDialog === 'function' && typeof writeFile === 'function' ? 'export' : null;
  }
  return adapterOpen(app) ? 'share' : null;
}

/**
 * Ask where to save `name`, before anything is built: a whole book takes a while, and the reader should not wait for
 * it only to cancel the dialog. Null when they cancel. The system dialog asks before replacing a file itself.
 */
export async function chooseExportPath(
  name: string,
  filter: { name: string; extension: string }
): Promise<string | null> {
  const { dialog, currentWindow } = desktopModules();
  if (!dialog?.showSaveDialog) return null;
  const answer = await dialog.showSaveDialog(currentWindow, {
    defaultPath: name,
    filters: [{ name: filter.name, extensions: [filter.extension] }],
  });
  return answer.canceled || !answer.filePath ? null : answer.filePath;
}

export async function writeExport(path: string, bytes: Uint8Array): Promise<void> {
  const { writeFile } = desktopModules();
  if (!writeFile) throw new Error(t('outside_vault.cannot_export'));
  await writeFile(path, bytes);
}

/**
 * Where a shared file waits for the app it is shared to.
 *
 * **In the plugin's folder, not the vault**: a PDF made to send to someone does not belong among the reader's notes,
 * and the probe showed `open` reaches a file here on Android and iOS alike.
 */
function shareFolder(app: App): string {
  return normalizePath(`${app.vault.configDir}/plugins/orbis-reader/share`);
}

/**
 * Empty the share folder.
 *
 * **Not right after sharing**: `open` returns as soon as the sheet is up, and the app the reader picks reads the file
 * after that. So the folder is emptied before the next share, and when the plugin loads.
 */
export async function clearShareFolder(app: App): Promise<void> {
  const adapter = app.vault.adapter;
  const dir = shareFolder(app);
  try {
    if (!(await adapter.exists(dir))) return;
    for (const file of (await adapter.list(dir)).files) await adapter.remove(file);
  } catch {
    /* a file still held open by the last share is removed next time */
  }
}

/** Hand `bytes` to the share sheet as `name`. */
export async function shareFile(app: App, name: string, bytes: Uint8Array): Promise<void> {
  const open = adapterOpen(app);
  if (!open) throw new Error(t('outside_vault.cannot_share'));
  await clearShareFolder(app);
  const adapter = app.vault.adapter;
  const dir = shareFolder(app);
  if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
  const path = `${dir}/${name}`;
  await adapter.writeBinary(
    path,
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  );
  await open(path);
}

/**
 * Where an export goes when it does not go to the vault: a path the save dialog already answered, or the share
 * sheet. Asked for before the export's own dialog closes, so cancelling the save dialog keeps the reader's choices.
 */
export type OutsideTarget = { route: 'export'; path: string } | { route: 'share' };

/** Send a built file out of the vault as `name`. The path written for an export, or null for a share. */
export async function sendOutside(
  app: App,
  target: OutsideTarget,
  name: string,
  bytes: Uint8Array
): Promise<string | null> {
  if (target.route === 'export') {
    await writeExport(target.path, bytes);
    return target.path;
  }
  await shareFile(app, name, bytes);
  return null;
}

/**
 * The second footer button for a dialog that hands its answer back and closes, as the EPUB exports do.
 *
 * **Export asks where before the dialog closes**: canceling the system save dialog leaves the reader in the export
 * dialog with every choice kept, as it does in the PDF dialogs. Share has nothing to ask, so it closes at once.
 */
export async function askOutsideTarget(
  route: OutsideRoute,
  name: string,
  filter: { name: string; extension: string }
): Promise<OutsideTarget | null> {
  if (route === 'share') return { route: 'share' };
  const path = await chooseExportPath(name, filter);
  return path ? { route: 'export', path } : null;
}

/**
 * **Export… or Share…, set apart at the start of an export dialog's footer** — the place `orbis-action-aside` gives an
 * alternative, so Cancel and the dialog's own save button stay the pair every dialog ends with. Nothing is added where
 * the device has neither route.
 *
 * For a dialog that hands its answer back and closes. `onTarget` runs once the destination is known; a cancelled save
 * dialog runs nothing, and the export dialog stays as the reader left it. Add it before the row's other buttons.
 */
export function outsideButton(
  actions: HTMLElement,
  route: OutsideRoute | null,
  spec: {
    disabled: boolean;
    /** The file name to suggest, asked for on the press, since the dialog's name field can change until then. */
    name: () => string;
    filter: { name: string; extension: string };
    onTarget: (target: OutsideTarget) => void;
  }
): void {
  if (!route) return;
  const button = actionButton(actions, {
    label: t(route === 'export' ? 'action.export' : 'action.share'),
    disabled: spec.disabled,
    onClick: () => {
      void askOutsideTarget(route, spec.name(), spec.filter).then((target) => {
        if (target) spec.onTarget(target);
      });
    },
  });
  button.addClass('orbis-action-aside');
}
