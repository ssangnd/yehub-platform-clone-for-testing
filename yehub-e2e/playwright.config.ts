import { defineConfig, devices } from '@playwright/test';

const withServer = process.env.E2E_WITH_SERVER === '1';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(withServer
    ? {
        globalTeardown: './global-teardown.ts',
        webServer: {
          command: 'docker compose up --build --wait',
          url: 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }
    : {}),
});
