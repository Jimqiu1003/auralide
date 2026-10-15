// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import { builtinModules } from 'node:module';

const CORE_FORBIDDEN = [
  'electron',
  'react',
  'react-dom',
  '@auralide/canvas',
  '@auralide/editor-ui',
  '@auralide/exporters',
  '@auralide/html-bridge',
  '@auralide/renderer',
];

const RENDERER_FORBIDDEN = [
  'node:*',
  'fs',
  'fs/promises',
  'path',
  'child_process',
  'os',
  'worker_threads',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/test-artifacts/**',
      '**/.turbo/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // Architecture boundary: the core layer must stay independent of Electron,
    // UI frameworks and the layers that depend on it (see ADR-0001).
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [...CORE_FORBIDDEN, ...builtinModules, 'node:*'],
              message:
                '@auralide/core must not depend on UI, Electron or higher layers (ADR-0001).',
            },
          ],
        },
      ],
    },
  },
  {
    // Architecture boundary: packages that run inside the renderer surface must not
    // reach for Node.js APIs. Imported HTML/JS is untrusted (see security baseline).
    files: [
      'packages/renderer/**/*.ts',
      'packages/canvas/**/*.ts',
      'packages/editor-ui/**/*.ts',
      'packages/html-bridge/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: RENDERER_FORBIDDEN,
              message:
                'Renderer-side packages must not use Node.js APIs; use the main-process boundary instead.',
            },
          ],
        },
      ],
    },
  },
);
