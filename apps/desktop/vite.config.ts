import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/**
 * Renderer bundle for the Electron shell.
 *
 * `base: './'` keeps asset URLs relative so the built files load over `file://`.
 *
 * The Content Security Policy is injected here rather than hard-coded in `index.html`, so the
 * development and production policies come from **one** source and neither can drift into the other
 * (ADR-0002 §1). The production policy is strict; development additionally allows the Vite dev
 * server's inline React Refresh preamble and its websocket, because Electron in development loads
 * the dev server itself.
 */

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const DEVELOPMENT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:5173 ws://localhost:5173",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const CSP_PLACEHOLDER = '<!--csp-->';

/**
 * Replaces the placeholder with the policy for the mode being served. The placeholder is required:
 * silently emitting no policy would be a security regression that no build output would show.
 */
const cspPlugin = (): Plugin => ({
  name: 'auralide-csp',
  transformIndexHtml: {
    order: 'pre',
    handler(html, context) {
      if (!html.includes(CSP_PLACEHOLDER)) {
        throw new Error(
          `renderer index.html is missing the ${CSP_PLACEHOLDER} placeholder; refusing to build without a CSP`,
        );
      }
      const policy = context.server === undefined ? PRODUCTION_CSP : DEVELOPMENT_CSP;
      return html.replace(
        CSP_PLACEHOLDER,
        `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  },
});

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), cspPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    sourcemap: true,
  },
});
