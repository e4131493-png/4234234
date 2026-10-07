import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/ui',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1250, height: 900 }, headless: true, launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} },
  webServer: { command: 'node scripts/preview.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  reporter: 'list'
});
