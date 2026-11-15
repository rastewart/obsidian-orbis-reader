// Opening Orbis's settings at one of its pages, from outside them.
//
// See docs/design/settings.md, §No public deep links.

import type { App } from 'obsidian';

/** The settings window, as far as Orbis reaches into it. None of it is in the public typings. */
interface SettingWindow {
  open(): void;
  openTabById(id: string): void;
  openPagePath?(tabId: string, path: string[]): unknown;
}

/**
 * Open Orbis's settings at the page `path` names — each step the entry's own name, as its `t()` string, since a page
 * without an `id` is found by its name. An empty path opens the start page.
 *
 * **`openPagePath` is internal**, but Obsidian's own *Configure toolbar* command opens a settings page the same way.
 * Where it is missing, the start page opens instead: a reader one or two selections short of the page, never a
 * broken link.
 */
export function openSettingsPage(app: App, pluginId: string, path: string[] = []): void {
  const setting = (app as unknown as { setting?: SettingWindow }).setting;
  if (!setting) return;
  setting.open();
  if (path.length > 0 && setting.openPagePath) setting.openPagePath(pluginId, path);
  else setting.openTabById(pluginId);
}
