// @ts-check
import root from '../../eslint.config.js';

/**
 * The desktop package is the only place in the repository with Node-side build and verification
 * scripts that are plain ESM, so they need the Node globals the root config does not declare.
 */
export default [
  ...root,
  {
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', '*.config.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AbortController: 'readonly',
        // `page.evaluate` callbacks run in the renderer, so the browser globals are real there.
        window: 'readonly',
        document: 'readonly',
      },
    },
  },
];
