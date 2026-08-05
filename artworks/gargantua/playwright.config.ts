import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: false,
  reporter: 'line',
  retries: 0,
  testDir: './tests',
  timeout: 180_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    colorScheme: 'dark',
    deviceScaleFactor: 1,
    locale: 'en-US',
    reducedMotion: 'reduce',
    screenshot: 'off',
    trace: 'off',
    viewport: {
      height: 1000,
      width: 1600,
    },
  },
  webServer: {
    command: 'pnpm exec vite --config artworks/gargantua/vite.config.mts --host 127.0.0.1 --port 4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: 'http://127.0.0.1:4173',
  },
  workers: 1,
});
