import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const apiOrigin = process.env.E2E_API_ORIGIN || 'http://localhost:3002';
const baseUrl = process.env.BASE_URL || 'http://localhost:3001';

function assertLocalQaTarget(url, label) {
  const parsed = new URL(url);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!localHosts.has(parsed.hostname) && process.env.E2E_ALLOW_REMOTE_DEV !== '1') {
    throw new Error(
      `${label} debe apuntar a localhost. Para un DEV remoto verificado use E2E_ALLOW_REMOTE_DEV=1.`,
    );
  }
}

async function provisionDemoTenant() {
  const response = await fetch(`${apiOrigin}/api/demo/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nombre: `QA E2E ${new Date().toISOString()}`,
      dias_duracion: 7,
    }),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`La provisión demo devolvió una respuesta inválida (HTTP ${response.status}).`);
  }

  if (!response.ok || body?.success !== true) {
    throw new Error(
      `No se pudo provisionar el tenant QA (HTTP ${response.status}): ${body?.message || 'sin detalle'}`,
    );
  }

  const required = [
    'tenant_id',
    'email',
    'password',
    'aprobador_email',
    'aprobador_password',
  ];
  const missing = required.filter((key) => !body?.[key]);
  if (missing.length > 0) {
    throw new Error(`La provisión demo no devolvió: ${missing.join(', ')}.`);
  }

  return body;
}

async function main() {
  assertLocalQaTarget(apiOrigin, 'E2E_API_ORIGIN');
  assertLocalQaTarget(baseUrl, 'BASE_URL');

  const demo = await provisionDemoTenant();
  const forwardedArgs = process.argv.slice(2).filter((arg, index) => arg !== '--' || index > 0);
  const pnpmExecutable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

  console.log(`Tenant QA efímero provisionado en DEV: ${demo.tenant_id}`);

  const child = spawn(
    pnpmExecutable,
    ['exec', 'playwright', 'test', ...forwardedArgs],
    {
      cwd: webRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        E2E_API_ORIGIN: apiOrigin,
        E2E_FORCE_AUTH_REFRESH: '1',
        PLAYWRIGHT_SKIP_WEBSERVER: process.env.PLAYWRIGHT_SKIP_WEBSERVER || '1',
        TEST_USER_EMAIL: demo.email,
        TEST_USER_PASSWORD: demo.password,
        TEST_APROBADOR_EMAIL: demo.aprobador_email,
        TEST_APROBADOR_PASSWORD: demo.aprobador_password,
      },
    },
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`Playwright terminó por señal ${signal}.`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
