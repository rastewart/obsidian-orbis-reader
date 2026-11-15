// The three Orbis view types, in a module that imports nothing.
//
// Each view re-exports its own, so callers import them from the view as before. They live here so code that only
// needs the NAME — the tooltip gap's surface selector — can have it without importing the view, which is how
// `OrbisModal` → `tooltip-gap` → `LibraryView` → `ConfirmModal extends OrbisModal` became a cycle that left the base
// class undefined.

export const VIEW_TYPE_ORBIS = 'orbis-reader';
export const VIEW_TYPE_ORBIS_LIBRARY = 'orbis-library';
export const VIEW_TYPE_ORBIS_DATA = 'orbis-data-view';
