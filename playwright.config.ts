import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://gea-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-public-key', VITE_REGISTRATION_ENABLED: 'true' },
  },
});
