const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  retries: 1,
  timeout: 60000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4200',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm start',
      cwd: 'server',
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: false,
      env: {
        ENABLE_TEST_ROUTES: 'true',
        E2E_TEST: 'true',
        NODE_ENV: 'development',
        PORT: '3000',
      },
      timeout: 120000,
    },
    {
      command: 'npx ng serve --host 127.0.0.1 --port 4200',
      cwd: '.',
      url: 'http://127.0.0.1:4200',
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'development',
      },
      timeout: 180000,
    },
  ],
});
