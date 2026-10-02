import { defineConfig } from 'vite';

/**
 * The export player: the same renderer, animation engine and transitions as
 * the editor, bundled as one IIFE. "Export → Animated presentation" inlines it
 * into a single self-contained HTML file. Built into public/player/ so both
 * the dev server and the production build can serve it.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public/player',
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    lib: { entry: 'src/player/main.ts', formats: ['iife'], name: 'FramesPlayer', fileName: () => 'frames-player.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
