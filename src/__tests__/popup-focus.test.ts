// The one rule that decides whether a closing popup gives the keyboard back.
//
// The failure it guards against: pressing "Generate" in the recordings dialog opens a confirm, and closing the
// confirm leaves focus on nothing — `focusout BUTTON.mod-cta → none` — so the next Tab restarts at the top of the app
// and walks the reader's toolbar, and the dialog looks untabbable until it is clicked.

import { describe, expect, it } from 'vitest';
import { popupHandedOver } from '../ui-utils';

describe('popupHandedOver', () => {
  it('is not a handover when this was the only popup', () => {
    expect(popupHandedOver(0, 0)).toBe(false);
  });

  it('is a handover when a popup opened over this one and this one closed behind it', () => {
    // The listen panel (index 0) opens the recordings dialog (index 1) and closes itself: the survivor sits at the
    // index the panel occupied, so restoring focus would pull it out of the dialog now on screen.
    expect(popupHandedOver(0, 1)).toBe(true);
  });

  it('is NOT a handover when a child closes over the parent that opened it', () => {
    // The recordings dialog (index 0) raised a confirm (index 1); the confirm closing owes focus back to Generate.
    expect(popupHandedOver(1, 1)).toBe(false);
  });

  it('is not a handover for a child two deep', () => {
    expect(popupHandedOver(2, 2)).toBe(false);
  });

  it('is a handover when the popup below closes while two remain above it', () => {
    expect(popupHandedOver(0, 2)).toBe(true);
  });

  it('is nothing at all for a popup already off the stack', () => {
    expect(popupHandedOver(-1, 3)).toBe(false);
  });
});
