import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: '**/*.e2e.ts', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4187', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187', reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://cadastro-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-only', VITE_ALUNO_APP_URL: 'https://app.example.test/' } },
});
