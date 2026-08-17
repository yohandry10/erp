import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const usesEphemeralLocalDatabase = process.env.E2E_EPHEMERAL_LOCAL_DB === "1";
const usesIsolatedBrowserMocks = process.env.E2E_ISOLATED_BROWSER === "1";

if (!usesEphemeralLocalDatabase && !usesIsolatedBrowserMocks) {
  throw new Error(
    "Playwright E2E está bloqueado. Use una base local efímera o el perfil de navegador aislado; PROD y el antiguo DEV están prohibidos.",
  );
}

if (
  usesIsolatedBrowserMocks &&
  process.env.PLAYWRIGHT_SKIP_GLOBAL_AUTH !== "1"
) {
  throw new Error(
    "E2E_ISOLATED_BROWSER=1 exige PLAYWRIGHT_SKIP_GLOBAL_AUTH=1 para no intentar autenticarse contra un backend externo.",
  );
}

if (
  usesIsolatedBrowserMocks &&
  process.env.npm_lifecycle_event !== "test:e2e:isolated"
) {
  throw new Error(
    "El perfil E2E aislado sólo puede ejecutarse mediante pnpm --filter @erp-suite/web test:e2e:isolated; la suite completa requiere una base efímera real.",
  );
}

const configuredLocalUrls = [
  process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.E2E_API_ORIGIN,
  process.env.NEXT_PUBLIC_API_URL,
  process.env.BASE_URL,
];
const environmentFiles = usesEphemeralLocalDatabase
  ? [
      path.resolve(process.cwd(), "../../.env.local"),
      path.resolve(process.cwd(), "../../.env"),
      path.resolve(process.cwd(), ".env.local"),
      path.resolve(process.cwd(), "../erp-api/.env"),
    ]
  : [];
for (const candidate of environmentFiles) {
  if (!fs.existsSync(candidate)) continue;
  let contents = "";
  try {
    contents = fs.readFileSync(candidate, "utf8");
  } catch {
    // Algunos runners montan archivos de secretos sin permiso de lectura. La
    // preflight sigue validando las URLs suministradas explícitamente.
    continue;
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL)\s*=\s*(.+)\s*$/,
    );
    if (match) configuredLocalUrls.push(match[1].replace(/^['"]|['"]$/g, ""));
  }
}
for (const url of configuredLocalUrls.filter(Boolean) as string[]) {
  const hostname = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(
      `Playwright E2E rechazado: se configuró un origen no local (${hostname}).`,
    );
  }
}

const baseURL = process.env.BASE_URL || "http://localhost:3001";
const webPort = new URL(baseURL).port || "3001";
const skipGlobalAuth = process.env.PLAYWRIGHT_SKIP_GLOBAL_AUTH === "1";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: skipGlobalAuth ? undefined : "./tests/e2e/global-setup.ts",
  timeout: 90 * 1000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL,
    storageState: skipGlobalAuth
      ? { cookies: [], origins: [] }
      : "./tests/e2e/.auth/admin.json",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_SYSTEM_CHROME === "1"
          ? { channel: "chrome" }
          : {}),
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
