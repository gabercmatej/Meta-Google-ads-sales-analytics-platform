import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The demo consumes analytics-core from source, so there is one implementation and no
// pre-build step. Vite resolves the library's `./x.js` specifiers to the `.ts` sources.
const coreSrc = fileURLToPath(new URL('../../packages/analytics-core/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@sedem-ads/analytics-core': coreSrc },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
