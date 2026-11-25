// ESLint flat config. Rules here catch likely bugs; formatting is left to Prettier (.prettierrc.json).
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', 'coverage/'] },
  js.configs.recommended,
  // The library: ES modules in TypeScript, for Node and the browser alike, so neither's globals.
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { sourceType: 'module' },
    // The spaces that group digits (no-break, narrow no-break, thin) are written as they are inside a regex.
    rules: { 'no-irregular-whitespace': ['error', { skipRegExps: true }] }
  },
  // Its tests and scripts run in Node.
  {
    files: ['test/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { sourceType: 'module', globals: globals.node }
  }
);
