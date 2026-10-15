import { defineConfig } from 'vite';

/**
 * Preload bundle.
 *
 * A window with `sandbox: true` loads its preload as CommonJS, so this build emits `preload.cjs`
 * next to `main.js`. `electron` stays external because the sandbox provides it.
 */
export default defineConfig({
  build: {
    outDir: 'dist/main',
    emptyOutDir: false,
    minify: false,
    sourcemap: true,
    lib: {
      entry: 'src/main/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.cjs',
    },
    rollupOptions: {
      external: ['electron'],
    },
  },
});
