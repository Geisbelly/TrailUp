import { defineConfig } from '@playwright/test';
if (!process.env.TRAILUP_TEST_COMPOSE_PROJECT) throw new Error('Execute npm run test:cadastro-integrado.');
export default defineConfig({
  testDir:'./e2e',testMatch:'**/*.integrado.ts',workers:1,fullyParallel:false,
  timeout:90_000,
  // Traces podem conter tokens de teste; não são necessários para o relatório.
  use:{baseURL:'http://127.0.0.1:4188',headless:true,trace:'off'},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4188 --strictPort',
    url:'http://127.0.0.1:4188',reuseExistingServer:false,
    env:{VITE_SUPABASE_URL:'http://127.0.0.1:57441',VITE_SUPABASE_PUBLISHABLE_KEY:process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,VITE_ALUNO_APP_URL:''}},
});
