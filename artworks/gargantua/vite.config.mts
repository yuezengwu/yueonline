import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const artworkRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  root: artworkRoot,
  build: {
    emptyOutDir: true,
    outDir: '../../public/visuals/gargantua',
  },
  server: {
    host: '127.0.0.1',
  },
  preview: {
    host: '127.0.0.1',
  },
});
