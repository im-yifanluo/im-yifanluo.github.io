// @ts-check
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/', '.astro/', 'public/', 'src/generated/', 'playwright-report/', 'test-results/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  astro.configs['jsx-a11y-recommended'],
  {
    // the build, media and font scripts and the config files run in Node
    files: ['scripts/**/*.mjs', '*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**'],
    rules: {
      // the site's own code never logs
      'no-console': 'error',
      // role="list" keeps a list a list in Safari, which drops the role from lists styled with list-style: none
      'astro/jsx-a11y/no-redundant-roles': ['error', { ol: ['list'] }],
    },
  },
);
