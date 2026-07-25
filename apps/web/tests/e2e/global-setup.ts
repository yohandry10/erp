import { request, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const authFile = path.join(__dirname, '.auth', 'admin.json');
const authLockFile = path.join(__dirname, '.auth', 'admin.lock');

type StorageState = {
  cookies: unknown[];
  origins: Array<{
    origin: string;
    localStorage?: Array<{ name: string; value: string }>;
  }>;
};

for (const envPath of [
  path.resolve(process.cwd(), '../../.env.local'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '../erp-api/.env'),
]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getApiOrigin() {
  return process.env.E2E_API_ORIGIN || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
}

function getOperationalPassword() {
  if (process.env.DATABASE_URL) {
    return decodeURIComponent(new URL(process.env.DATABASE_URL).password);
  }
  if (process.env.TEST_USER_PASSWORD) {
    return process.env.TEST_USER_PASSWORD;
  }
  throw new Error('TEST_USER_PASSWORD o DATABASE_URL es requerido para E2E');
}

function hasAuthState(storageState: StorageState | null) {
  return Boolean(storageState?.cookies.length);
}

function readStorageState(): StorageState | null {
  try {
    const contents = fs.readFileSync(authFile, 'utf8');
    const parsed = JSON.parse(contents) as StorageState;
    return Array.isArray(parsed.cookies) && Array.isArray(parsed.origins) ? parsed : null;
  } catch {
    return null;
  }
}

function addOnboardingState(storageState: StorageState, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const existingOrigin = storageState.origins.find((item) => item.origin === origin);
  const onboardingState = {
    name: 'erp_onboarding_completed',
    value: JSON.stringify(['admin', 'superadmin', 'cajero', 'vendedor', 'user']),
  };

  if (existingOrigin) {
    existingOrigin.localStorage = [
      ...(existingOrigin.localStorage || []).filter((item) => item.name !== onboardingState.name),
      onboardingState,
    ];
  } else {
    storageState.origins.push({ origin, localStorage: [onboardingState] });
  }

  return storageState;
}

function writeStorageState(storageState: StorageState) {
  const tempFile = `${authFile}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(storageState, null, 2)}\n`);
  fs.renameSync(tempFile, authFile);
}

async function existingSessionIsValid(baseURL: string) {
  if (!fs.existsSync(authFile)) {
    return false;
  }

  const context = await request.newContext({
    baseURL: getApiOrigin(),
    storageState: authFile,
  });
  try {
    const response = await context.get('/api/auth/profile');
    return response.ok();
  } catch {
    return false;
  } finally {
    await context.dispose();
  }
}

async function acquireAuthLock() {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(authLockFile, 'wx');
      fs.closeSync(fd);
      return true;
    } catch {
      if (hasAuthState(readStorageState())) {
        return false;
      }
      await sleep(250);
    }
  }

  throw new Error('E2E auth setup lock timed out');
}

async function globalSetup(config: FullConfig) {
  const project = config.projects[0];
  const baseURL = String(project.use.baseURL || process.env.BASE_URL || 'http://localhost:3001');
  const email = process.env.TEST_USER_EMAIL || 'admin@erp.local';
  const password = getOperationalPassword();
  const forceAuthRefresh = process.env.E2E_FORCE_AUTH_REFRESH === '1';

  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  if (forceAuthRefresh && fs.existsSync(authFile)) {
    fs.rmSync(authFile, { force: true });
  }

  const existingState = readStorageState();
  if (existingState && hasAuthState(existingState)) {
    if (await existingSessionIsValid(baseURL)) {
      writeStorageState(addOnboardingState(existingState, baseURL));
      return;
    }
    fs.rmSync(authFile, { force: true });
  }

  const ownsLock = await acquireAuthLock();
  if (!ownsLock) {
    const stateFromOtherSetup = readStorageState();
    if (stateFromOtherSetup && hasAuthState(stateFromOtherSetup)) {
      if (await existingSessionIsValid(baseURL)) {
        writeStorageState(addOnboardingState(stateFromOtherSetup, baseURL));
        return;
      }
      fs.rmSync(authFile, { force: true });
    }
  }

  const requestContext = await request.newContext({ baseURL: getApiOrigin() });

  try {
    const currentState = readStorageState();
    if (currentState && hasAuthState(currentState)) {
      if (await existingSessionIsValid(baseURL)) {
        writeStorageState(addOnboardingState(currentState, baseURL));
        return;
      }
      fs.rmSync(authFile, { force: true });
    }

    let response = await requestContext.post('/api/auth/login', {
      data: { email, password },
    });
    if (response.status() === 429) {
      await sleep(61000);
      response = await requestContext.post('/api/auth/login', {
        data: { email, password },
      });
    }

    if (!response.ok()) {
      throw new Error(`E2E auth setup failed with HTTP ${response.status()}: ${await response.text()}`);
    }

    await response.body();
    const storageState = await requestContext.storageState();
    writeStorageState(addOnboardingState(storageState, baseURL));
  } finally {
    if (ownsLock) {
      fs.rmSync(authLockFile, { force: true });
    }
    await requestContext.dispose();
  }
}

export default globalSetup;
