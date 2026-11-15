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
  },
});
