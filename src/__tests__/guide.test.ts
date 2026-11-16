// The settings start page's last row: the version, and the button that opens the user guide.

import { ButtonComponent, type Setting, type SettingDefinitionItem } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aboutRow, GUIDE_URL } from '../guide';

type Row = Extract<SettingDefinitionItem, { render?: unknown }> & {
  desc?: string;
  aliases?: string[];
  render: (setting: Setting) => void;
};

/** Render the row into a stand-in Setting that only knows how to add a button, and return that button. */
function renderedButton(row: Row): HTMLButtonElement {
  const host = document.createElement('div');
  const setting = {
    addButton(build: (b: ButtonComponent) => unknown) {
      build(new ButtonComponent(host));
      return setting;
    },
  };
  row.render(setting as unknown as Setting);
  const button = host.querySelector('button');
  if (!button) throw new Error('the row drew no button');
  return button;
}

describe('aboutRow', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the version line under the plugin name', () => {
    const row = aboutRow('Orbis Reader', '1.2.3') as Row;
    expect(row.name).toBe('Orbis Reader');
    expect(row.desc).toBe('Version 1.2.3');
  });

  it('opens the guide in the browser from a labelled button', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const button = renderedButton(aboutRow('Orbis Reader', '1.2.3') as Row);
    expect(button.textContent).toBe('User guide');
    expect(button.getAttribute('aria-label')).toBe('Open the Orbis Reader user guide in your browser');
    button.click();
    expect(open).toHaveBeenCalledWith(GUIDE_URL, '_blank');
  });

  it('is found by what someone who is stuck searches for', () => {
    const { aliases } = aboutRow('Orbis Reader', '1.2.3') as Row;
    expect(aliases).toEqual(expect.arrayContaining(['help', 'user guide', 'manual']));
    expect(aliases?.every((word) => word === word.trim() && word.length > 0)).toBe(true);
  });

  it('points at the published guide over HTTPS', () => {
    expect(GUIDE_URL).toBe('https://guide.orbisreader.com/');
  });
});
