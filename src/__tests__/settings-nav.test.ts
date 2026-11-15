// Opening settings at a page, and what happens where Obsidian cannot be asked for one.

import type { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { openSettingsPage } from '../settings-nav';

function fakeApp(withPagePath: boolean) {
  const setting = {
    open: vi.fn(),
    openTabById: vi.fn(),
    ...(withPagePath ? { openPagePath: vi.fn() } : {}),
  };
  return { app: { setting } as unknown as App, setting };
}

describe('openSettingsPage', () => {
  it('opens the page the path names', () => {
    const { app, setting } = fakeApp(true);
    openSettingsPage(app, 'orbis-reader', ['Listening']);
    expect(setting.open).toHaveBeenCalled();
    expect(setting.openPagePath).toHaveBeenCalledWith('orbis-reader', ['Listening']);
    expect(setting.openTabById).not.toHaveBeenCalled();
  });

  // The method is internal. Without it the reader lands one or two selections short, not nowhere.
  it('opens the start page where Obsidian cannot be asked for a page', () => {
    const { app, setting } = fakeApp(false);
    openSettingsPage(app, 'orbis-reader', ['Listening']);
    expect(setting.openTabById).toHaveBeenCalledWith('orbis-reader');
  });

  it('opens the start page for an empty path', () => {
    const { app, setting } = fakeApp(true);
    openSettingsPage(app, 'orbis-reader');
    expect(setting.openPagePath).not.toHaveBeenCalled();
    expect(setting.openTabById).toHaveBeenCalledWith('orbis-reader');
  });
});
