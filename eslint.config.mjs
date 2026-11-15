import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
  {
    ignores: [
      'node_modules/**',
      'main.js',
      'test-vault/**',
      'eslint.config.mjs',
      'esbuild.config.mjs',
      'src/vendor/**',
    ],
  },
  // Spread the full recommended config (includes TS parser, globals, all rules).
  ...obsidianmd.configs.recommended,
  // Add tsconfig project reference so type-aware rules can run.
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
