import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // MathJax (the LaTeX typesetter) is one large chunk, loaded only when the equation sheet opens.
  build: { chunkSizeWarningLimit: 1400 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
