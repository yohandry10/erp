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

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

  const context = await request.newContext({ baseURL, storageState: authFile });
  try {
    const response = await context.get('/backend/api/auth/profile');
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
      if (readStorageState()?.cookies.length) {
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
  const password = process.env.TEST_USER_PASSWORD || 'AdminProd2026!';

  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  const existingState = readStorageState();
  if (existingState?.cookies.length) {
    if (await existingSessionIsValid(baseURL)) {
      writeStorageState(addOnboardingState(existingState, baseURL));
      return;
    }
    fs.rmSync(authFile, { force: true });
  }

  const ownsLock = await acquireAuthLock();
  if (!ownsLock) {
    const stateFromOtherSetup = readStorageState();
    if (stateFromOtherSetup?.cookies.length) {
      if (await existingSessionIsValid(baseURL)) {
        writeStorageState(addOnboardingState(stateFromOtherSetup, baseURL));
        return;
      }
      fs.rmSync(authFile, { force: true });
    }
  }

  const requestContext = await request.newContext({ baseURL });

  try {
    const currentState = readStorageState();
    if (currentState?.cookies.length) {
      if (await existingSessionIsValid(baseURL)) {
        writeStorageState(addOnboardingState(currentState, baseURL));
        return;
      }
      fs.rmSync(authFile, { force: true });
    }

    const response = await requestContext.post('/backend/api/auth/login', {
      data: { email, password },
    });

    if (!response.ok()) {
      throw new Error(`E2E auth setup failed with HTTP ${response.status()}: ${await response.text()}`);
    }

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
