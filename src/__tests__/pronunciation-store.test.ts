// The glossary store tells its caller about every change — Settings' "N respellings" row counts the glossary, and
// read "15 respellings" after all fifteen were deleted and one added, because nothing redrew it.

import { describe, expect, it, vi } from 'vitest';
import { createPronunciationStore } from '../reader/tts/pronunciation-service';
import type { IOrbisReaderPlugin } from '../settings';

function plugin(): IOrbisReaderPlugin {
  return {
    settings: { pronunciations: [] },
    saveSettings: async () => {},
    refreshViews: () => {},
  } as unknown as IOrbisReaderPlugin;
}

describe('the glossary store', () => {
  it('reports adding, switching off and deleting', async () => {
    const onChanged = vi.fn();
    const store = createPronunciationStore(plugin(), onChanged);
    await store.upsert('Esker', 'ESS ker');
    await store.setEnabled('Esker', false);
    await store.remove('Esker');
    expect(onChanged).toHaveBeenCalledTimes(3);
  });
});
