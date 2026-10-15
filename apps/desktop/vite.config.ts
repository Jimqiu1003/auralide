import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Renderer bundle for the Electron shell.
 *
 * `base: './'` keeps asset URLs relative so the built files load over `file://`.
 */
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    sourcemap: true,
  },
});
