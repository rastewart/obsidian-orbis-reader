import type { AnnotationPreset } from '../annotation-presets';
/**
 * The narrow host contract the annotation collaborators (`BookmarkController`, and
 * later `AnnotationController` for highlights/notes) need from `OrbisReaderView` —
 * the view-side callbacks they trigger, kept off the shared `ReaderContext` because
 * they're annotation-specific (the OrbisPopupHost / FocusModeHost pattern). It grows
 * when highlights/notes land (they'll add e.g. copyLocationLink / applyHostBg).
 * See docs/design/reader-architecture.md (Phase 5).
 */
export interface AnnotationHost {
  /** Re-render the Saved panel's lists if it's currently open (after a create/delete). */
  refreshSavedPanelIfOpen(): void;
  /** The library's copy of a preset by id, or undefined when this device does not have it. Lets the controller
   *  reconcile a book against the template it tracks — see `adoptFreedPresetMarks`. */
  presetFor(id: string): AnnotationPreset | undefined;
  /** Copy an `obsidian://orbis-nav` link to the given CFI (or notice `errorMsg` if unavailable). */
  copyLocationLink(cfi: string | undefined | null, errorMsg: string): Promise<void>;
  /** Re-apply the reader host background/brightness (notes column visibility affects layout). */
  applyHostBg(): void;
  /** Bounce the flow attribute to force Foliate to reflow adjacent sections at the new width. */
  reloadAdjacentSections(): void;
  /** Look up the selected text (dictionary/vault/web) — opens the lookup popup. */
  lookUp(text: string): void;
  /** Open the annotation-preset manager on This book — the reader's own marks. Routed through the host
   *  rather than imported here so the controller keeps its one-way dependency on the view's surface.
   *  `onClosed` runs when the manager closes: the mark list uses it to come back. */
  openAnnotationPresets(onClosed?: () => void): void;
}
