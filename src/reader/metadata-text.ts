// One EPUB metadata value, as text.
//
// **A book's author is not reliably a string.** EPUB 3 lets a creator carry an alternate script and a sort form, and
// foliate hands the whole shape over — `'Jane Doe'`, `{ name: 'Jane Doe', sortAs: 'Doe, Jane' }`, a list of either,
// or `{ name: { en: 'Aiko Tanaka', ja: '田中愛子' } }` for a name written two ways. `String()` on the last
// of those writes `[object Object]`, and because the author travels from here into the reading records and into the
// notes exported from them, that string outlives the book it came from.
//
// The rule is: unwrap `name`, join a list, and when a value is a map of languages take the first readable entry —
// one spelling of the right name beats no name at all, and beats the shape of the object every time.

/** An EPUB metadata value flattened to text, or `''` when there is nothing readable in it. */
export function metadataText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(metadataText).filter(Boolean).join(', ');
  if (typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  // `sortAs` is filing order, never a display name — reading it would shelve the book under "Doe, Jane".
  if ('name' in record) return metadataText(record.name);
  for (const entry of Object.values(record)) {
    const text = metadataText(entry);
    if (text) return text;
  }
  return '';
}
