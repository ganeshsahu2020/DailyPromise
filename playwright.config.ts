import {defineConfig, devices} from '@playwright/test';

const PORT = Number(process.env.VITE_DEV_PORT) || 5151;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  reporter: 'list',
  webServer: {
    // Build first, then preview (ensures fresh artifacts)
    command: 'npm run build && npm run preview',
    port: PORT,
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile',   use: { ...devices['Pixel 7'] } }
  ]
});
