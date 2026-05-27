import { request, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const authFile = path.join(__dirname, '.auth', 'admin.json');
const authLockFile = path.join(__dirname, '.auth', 'admin.lock');
const AUTH_SESSION_STORAGE_KEY = 'erp.auth.session.snapshot';

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

function getApiOrigin() {
  return process.env.E2E_API_ORIGIN || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
}

function getStoredToken(storageState: StorageState | null): string | null {
  for (const origin of storageState?.origins || []) {
    const raw = origin.localStorage?.find((item) => item.name === AUTH_SESSION_STORAGE_KEY)?.value;
    if (!raw) continue;
    try {
      return JSON.parse(raw)?.access_token || null;
    } catch {
      return null;
    }
  }
  return null;
}

function hasAuthState(storageState: StorageState | null) {
  return Boolean(storageState?.cookies.length || getStoredToken(storageState));
}

function normalizeLoginSession(loginData: any) {
  const rawUser = loginData?.user || loginData?.data?.user;
  const accessToken = loginData?.access_token || loginData?.token || loginData?.data?.access_token || loginData?.data?.token;
  const roles = Array.isArray(rawUser?.roles)
    ? rawUser.roles
        .map((role: any) => (typeof role === 'string' ? role : role?.nombre))
        .filter((role: any): role is string => typeof role === 'string' && role.length > 0)
    : [];

  if (!rawUser?.id || !rawUser?.email || !accessToken) {
    throw new Error(`E2E auth setup recibió login incompleto: ${JSON.stringify(loginData).slice(0, 300)}`);
  }

  return {
    user: {
      id: rawUser.id,
      email: rawUser.email,
      nombre: rawUser.nombre || rawUser.username || rawUser.email.split('@')[0],
      apellido: rawUser.apellido || '',
      nombre_usuario: rawUser.nombre_usuario || rawUser.username,
      roles,
      tenant_id: rawUser.tenant_id,
      is_super_admin: rawUser.is_super_admin === true || rawUser.isSuperAdmin === true || rawUser.super_admin === true,
    },
    access_token: accessToken,
  };
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

function addSessionSnapshot(storageState: StorageState, baseURL: string, session: unknown) {
  const origin = new URL(baseURL).origin;
  const existingOrigin = storageState.origins.find((item) => item.origin === origin);
  const sessionState = {
    name: AUTH_SESSION_STORAGE_KEY,
    value: JSON.stringify(session),
  };

  if (existingOrigin) {
    existingOrigin.localStorage = [
      ...(existingOrigin.localStorage || []).filter((item) => item.name !== AUTH_SESSION_STORAGE_KEY),
      sessionState,
    ];
  } else {
    storageState.origins.push({ origin, localStorage: [sessionState] });
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

  const token = getStoredToken(readStorageState());
  const context = await request.newContext({
    baseURL: getApiOrigin(),
    storageState: authFile,
    extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
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
  const password = process.env.TEST_USER_PASSWORD || 'AdminProd2026!';

  fs.mkdirSync(path.dirname(authFile), { recursive: true });

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

    const response = await requestContext.post('/api/auth/login', {
      data: { email, password },
    });

    if (!response.ok()) {
      throw new Error(`E2E auth setup failed with HTTP ${response.status()}: ${await response.text()}`);
    }

    const session = normalizeLoginSession(await response.json());
    const storageState = addSessionSnapshot(await requestContext.storageState(), baseURL, session);
    writeStorageState(addOnboardingState(storageState, baseURL));
  } finally {
    if (ownsLock) {
      fs.rmSync(authLockFile, { force: true });
    }
    await requestContext.dispose();
  }
}

export default globalSetup;
