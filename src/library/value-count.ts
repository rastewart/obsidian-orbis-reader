// How many notes hold a value, as a value row says it: "In 2,000 titles", "In 1 reading record".

import { t } from '../i18n';
import type { NoteSpecies } from '../settings';

/**
 * The count beside a value, named for the notes it was counted over.
 *
 * **Its own singular, and its own noun.** One string said "In 1 titles", and said "titles" for a reading record's
 * field too. A field with no species — a custom one — is counted over the whole vault, so its notes are notes.
 */
export function valueUsedText(count: number, over: NoteSpecies | null): string {
  if (count === 1) {
    if (over === 'reading_record') return t('properties_page.value_used_record_one');
    return t(over === null ? 'properties_page.value_used_note_one' : 'properties_page.value_used_one');
  }
  const n = { count: count.toLocaleString() };
  if (over === 'reading_record') return t('properties_page.value_used_records', n);
  return t(over === null ? 'properties_page.value_used_notes' : 'properties_page.value_used', n);
}
