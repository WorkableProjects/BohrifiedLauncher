import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // pdf.js is loaded only when a PDF is imported.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
