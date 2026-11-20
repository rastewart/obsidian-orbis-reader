import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: resolve(__dirname, 'src/__mocks__/obsidian.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.ts'],
    // foliate-js, Orbis's fork, is a package, and Vitest leaves packages to Node unless told otherwise. Its patched
    // overlayer.js imports `obsidian`, which only the alias above can supply, so it is run through Vitest like Orbis's
    // own code.
    server: { deps: { inline: ['foliate-js'] } },
  },
});
