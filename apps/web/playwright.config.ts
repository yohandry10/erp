import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') {
  throw new Error(
    'Playwright E2E con estado está bloqueado. Sólo se admite con E2E_EPHEMERAL_LOCAL_DB=1 y una base local efímera; PROD y el antiguo DEV están prohibidos.',
  );
}

const configuredSupabaseUrls = [
  process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_URL,
];
for (const candidate of [
  path.resolve(process.cwd(), '../../.env.local'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '../erp-api/.env'),
]) {
  if (!fs.existsSync(candidate)) continue;
  let contents = '';
  try {
    contents = fs.readFileSync(candidate, 'utf8');
  } catch {
    // Algunos runners montan archivos de secretos sin permiso de lectura. La
    // preflight sigue validando las URLs suministradas explícitamente.
    continue;
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL)\s*=\s*(.+)\s*$/);
    if (match) configuredSupabaseUrls.push(match[1].replace(/^['"]|['"]$/g, ''));
  }
}
for (const url of configuredSupabaseUrls.filter(Boolean) as string[]) {
  const hostname = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`Playwright E2E rechazado: la base configurada no es local efímera (${hostname}).`);
  }
}

const baseURL = process.env.BASE_URL || 'http://localhost:3001';
const webPort = new URL(baseURL).port || '3001';
const skipGlobalAuth = process.env.PLAYWRIGHT_SKIP_GLOBAL_AUTH === '1';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: skipGlobalAuth ? undefined : './tests/e2e/global-setup.ts',
  timeout: 90 * 1000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL,
    storageState: skipGlobalAuth
      ? { cookies: [], origins: [] }
      : './tests/e2e/.auth/admin.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PLAYWRIGHT_SYSTEM_CHROME === '1' ? { channel: 'chrome' } : {}),
      },
    },
  ],

  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: `pnpm exec next dev -p ${webPort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
