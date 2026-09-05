import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * SharedArrayBuffer stdin support and browser WASM runtimes require a
 * cross-origin-isolated context in development and preview.
 */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],

  /**
   * Worker constructors using new URL(..., import.meta.url) are bundled as
   * native ES modules by Vite.
   */
  worker: {
    format: 'es',
  },

  server: {
    headers: isolationHeaders,
  },

  preview: {
    headers: isolationHeaders,
  },

  build: {
    target: 'es2022',
    sourcemap: true,
  },
});