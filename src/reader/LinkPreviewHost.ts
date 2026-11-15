/**
 * The narrow host contract `LinkPreview` needs from `OrbisReaderView` — the few
 * view-owned bits it can't reach through `ReaderContext`: the enable setting, the
 * href→section map + doc→section lookup (owned by the location-index/href resolution
 * that stays in the view), and the native-nav-bar toggle (shared with FocusMode).
 * Single-consumer, kept off the shared `ReaderContext`. See
 * docs/design/reader-architecture.md.
 */
export interface LinkPreviewHost {
  /** Whether the link-preview feature is enabled (plugin setting). */
  readonly linkPreviewEnabled: boolean;
  /** Resolved section path → spine index (built by the location index). */
  readonly sectionHrefMap: ReadonlyMap<string, number>;
  /** The spine index of the section rendered in `doc`, or undefined. */
  sectionForDoc(doc: Document): number | undefined;
  /** The section a bare `#id` lands in when ids are book-wide (FB2), else undefined — see the reader view's. */
  fragmentSectionIndex(id: string): number | undefined;
}
