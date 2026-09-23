import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/visuals/first-thousand/',
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: { emptyOutDir: true, outDir: '../../public/visuals/first-thousand' },
  server: { host: '127.0.0.1' },
});
