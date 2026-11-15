// The folder-and-name pair every export dialog shows, and the extension drawn beside the name.
//
// Save as Markdown switches format without rebuilding (a rebuild would lose its chapter ticks), so the extension
// has to follow the switch. Drawn once, for the format the dialog opened with, a folder export opened on Book folder
// would show no `.md` after switching to a single note, and the reverse would keep one beside a folder.
//
// And an emptied name: every dialog answers it with the name it opened with, shown in the field as a hint. They used
// to answer it three different ways, one of which pointed separate EPUBs at the folder of notes they came from.

import { type App, TFolder } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { destinationGrid, type FilingState } from '../folder-picker';
import { augmentDom } from './dom-augment';

augmentDom();

const root = Object.assign(new TFolder(), { path: '/' });
const app = { vault: { getRoot: () => root } } as unknown as App;

function grid(ext: string, opts: { held?: FilingState; name?: () => string; onName?: (name: string) => void } = {}) {
  const parent = document.createElement('div');
  const g = destinationGrid(parent, {
    app,
    folder: () => '/',
    onFolder: () => undefined,
    name: opts.name ?? (() => 'book'),
    onName: opts.onName ?? (() => undefined),
    nameKey: 'test-name',
    fallback: () => 'Default Name',
    held: opts.held ?? { open: false },
    ext,
  });
  const extEl = () => parent.querySelector<HTMLElement>('.orbis-epub-ext');
  return { ...g, shown: () => !!extEl() && extEl()?.style.display !== 'none' && extEl()?.textContent };
}

describe('the extension beside the file name', () => {
  it('is shown for a file and not for a folder', () => {
    expect(grid('.md').shown()).toBe('.md');
    expect(grid('').shown()).toBeFalsy();
  });

  it('follows a format switch made without rebuilding the dialog', () => {
    const opensOnFolder = grid('');
    opensOnFolder.setExt('.md');
    expect(opensOnFolder.shown()).toBe('.md');

    const opensOnFile = grid('.md');
    opensOnFile.setExt('');
    expect(opensOnFile.shown()).toBeFalsy();
  });
});

describe('an emptied name', () => {
  /** A dialog's side of the field: the name in play, and the fold state it keeps across a redraw. */
  function dialog(start = 'Typed Name') {
    const held: FilingState = { open: true };
    let name = start;
    const draw = () =>
      grid('.md', {
        held,
        name: () => name,
        onName: (v) => {
          name = v;
        },
      });
    return { held, name: () => name, draw };
  }
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('shows the default as a hint, and opens on the name in play', () => {
    const { input } = dialog().draw();
    expect(input.placeholder).toBe('Default Name');
    expect(input.value).toBe('Typed Name');
  });

  it('hands the dialog the default rather than nothing', () => {
    const d = dialog();
    const { input } = d.draw();
    type(input, '');
    expect(d.name()).toBe('Default Name');
    type(input, 'Another');
    expect(d.name()).toBe('Another');
  });

  it('counts spaces, and characters no file name can hold, as nothing', () => {
    const d = dialog();
    const { input } = d.draw();
    type(input, '   ');
    expect(d.name()).toBe('Default Name');
    type(input, ':::');
    expect(d.name()).toBe('Default Name');
  });

  it('stays empty through a redraw, so the hint does not turn into typed text', () => {
    const d = dialog();
    type(d.draw().input, '');
    const again = d.draw().input;
    expect(again.value).toBe('');
    expect(again.placeholder).toBe('Default Name');
    expect(d.name()).toBe('Default Name');

    type(again, 'Typed again');
    expect(d.held.nameCleared).toBe(false);
    expect(d.draw().input.value).toBe('Typed again');
  });
});
