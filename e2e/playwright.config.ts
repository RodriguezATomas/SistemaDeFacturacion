import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas end-to-end de los flujos principales contra el stack levantado localmente:
 * PostgreSQL (docker compose), API (puerto 3000) y web (puerto 5173).
 * Si los servidores no están corriendo, Playwright los inicia (reuseExistingServer).
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-AR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start -w apps/api',
      cwd: '..',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w apps/web',
      cwd: '..',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
