// Playwright (D98): Chromium only in ENG-12. ENG-25 adds WebKit, Firefox and axe.
// `npm run test:e2e` needs `npm run build` first. tests/e2e/server.mjs serves dist/payments,
// dist/consumer and the component fixture, and stops with exit code 1 when a build is missing.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: 'http://127.0.0.1:4331/',
    reuseExistingServer: false,
    timeout: 240_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
