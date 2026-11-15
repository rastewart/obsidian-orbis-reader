// Which species a collection gathers, and what that means for a list holding both. See docs/design/library.md
// §Reading records on dashboards.
//
// **Two visible lists, and neither is ordered by hand.** The settings page shows title collections and reading
// record collections separately, each alphabetical — see `collectionsOfSpecies` for why the hand-ordering went when
// each collection became a file of its own. A widget offered "every collection" would be offered collections it
// cannot draw, which is the other half of what this module is for.

import { byName } from '../by-name';
import type { LibraryCollection, NoteSpecies } from '../settings';

/**
 * What a collection gathers. A collection with nothing to say gathers titles.
 *
 * **Absent means titles, and nothing migrates.** Every collection that existed before reading records did is a
 * title collection, so the field is written only when it is not the default — which means an old `data.json` is
 * already correct and a downgrade loses nothing but the record collections themselves.
 */
export function speciesOf(collection: LibraryCollection): NoteSpecies {
  return collection.species ?? 'title';
}

/**
 * The collections that gather one species, by name — one of the two lists, or what a widget of that species may draw.
 *
 * **Sorted rather than ordered by hand.** Collections were a hand-ordered array until each became a file of its own,
 * and a file per collection has nowhere to keep an array's order: it would have to live inside every file (so moving
 * one rewrites every file below it) or per device (so the order does not travel). Neither earns its place for a list
 * nothing but the settings page displays — a widget picks a collection by id, and the Library never shows the list
 * at all. Alphabetical is the order nobody has to maintain and everybody can predict.
 */
export function collectionsOfSpecies(
  collections: readonly LibraryCollection[],
  species: NoteSpecies
): LibraryCollection[] {
  return byName(collections.filter((collection) => speciesOf(collection) === species));
}
