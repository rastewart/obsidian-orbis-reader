// A note opened beside the book goes below it instead when side by side would leave each pane too narrow.

import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { splitLeaf } from '../panes';

/** A workspace whose current pane is `width` pixels wide, recording the direction it is asked to split in. */
function workspaceWithPane(width: number | null) {
  const asked: (string | undefined)[] = [];
  const app = {
    workspace: {
      getMostRecentLeaf: () => (width === null ? null : { view: { containerEl: { clientWidth: width } } }),
      getLeaf: (_kind: string, direction?: string) => {
        asked.push(direction);
        return {};
      },
    },
  } as unknown as App;
  return { app, asked };
}

describe('splitLeaf', () => {
  it.each([
    [1180, 'vertical'], // a Mac window
    [800, 'vertical'], // two 400 px halves: the narrowest side by side
    [744, 'horizontal'], // an iPad mini in portrait
    [500, 'horizontal'],
  ])('splits a %i px pane %s', (width, direction) => {
    const { app, asked } = workspaceWithPane(width);
    splitLeaf(app);
    expect(asked).toEqual([direction]);
  });

  // Nothing to measure — no pane yet, or one not laid out — is not a reason to differ from Obsidian.
  it.each([[null], [0]])('splits side by side when the width cannot be read (%s)', (width) => {
    const { app, asked } = workspaceWithPane(width);
    splitLeaf(app);
    expect(asked).toEqual(['vertical']);
  });
});
