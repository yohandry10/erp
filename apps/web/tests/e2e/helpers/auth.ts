import { expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Authentication helper for E2E tests
 */

const waitForAuthRateLimitWindow = () => new Promise((resolve) => setTimeout(resolve, 61000));

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

function getDefaultPassword(): string {
  if (process.env.DATABASE_URL) {
    return decodeURIComponent(new URL(process.env.DATABASE_URL).password);
  }
  return process.env.TEST_USER_PASSWORD || 'AdminProd2026!';
}

/**
 * Login to the application
 * @param page - Playwright page object
 * @param email - User email (defaults to TEST_USER_EMAIL env var)
 * @param password - User password (defaults to TEST_USER_PASSWORD env var)
 */
export async function login(page: Page, email?: string, password?: string, forceRefresh = false) {
  const userEmail = email || process.env.TEST_USER_EMAIL || 'admin@erp.local';
  const userPassword = password || getDefaultPassword();

  await page.addInitScript((countryId) => {
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin', 'cajero', 'vendedor']));
    window.localStorage.setItem('selectedCountry', countryId);
  }, process.env.TEST_COUNTRY_ID || '1');

  const existingProfileResponse = forceRefresh ? null : await page.request.get('/backend/api/auth/profile/');
  if (existingProfileResponse?.ok()) {
    await page.goto('/dashboard/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await expect(page).toHaveURL(/\/dashboard\/?$/, { timeout: 30000 });
    await expect(page.getByText('Verificando autenticación...')).toBeHidden({ timeout: 30000 });
    return;
  }

  await page.context().clearCookies();

  // Navigate to login page
  await page.goto('/login/', { waitUntil: 'commit', timeout: 30000 });

  if (await page.getByRole('button', { name: 'Cerrar Sesión' }).isVisible({ timeout: 5000 }).catch(() => false)) {
    throw new Error('La página conserva una sesión previa pese a limpiar cookies antes del login E2E');
  }

  // Wait for login form to be visible
  await page.getByLabel('Correo Electrónico').waitFor({ timeout: 15000 });
  await expect(page.getByText('Cargando países...')).toBeHidden({ timeout: 60000 });

  let loginResponse = await page.request.post('/backend/api/auth/login/', {
    data: {
      email: userEmail,
      password: userPassword,
    },
  });
  if (loginResponse.status() === 429) {
    await waitForAuthRateLimitWindow();
    loginResponse = await page.request.post('/backend/api/auth/login/', {
      data: {
        email: userEmail,
        password: userPassword,
      },
    });
  }
  expect(loginResponse.ok(), `El login backend debe responder 2xx, status=${loginResponse.status()}`).toBe(true);

  const profileResponse = await page.request.get('/backend/api/auth/profile/');
  expect(profileResponse.ok(), `La cookie de sesión debe autenticar profile, status=${profileResponse.status()}`).toBe(true);

  await page.goto('/dashboard/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page).toHaveURL(/\/dashboard\/?$/, { timeout: 30000 });
  await expect(page.getByText('Verificando autenticación...')).toBeHidden({ timeout: 30000 });

  const skipTourButton = page.getByRole('button', { name: 'Saltar' });
  if (await skipTourButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipTourButton.click();
  }
}

export async function gotoAuthenticated(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const verifier = page.getByText('Verificando autenticación...');
  const resolved = await verifier.isHidden({ timeout: 30000 }).catch(() => false);

  if (!resolved) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  await expect(verifier).toBeHidden({ timeout: 60000 });
}

/**
 * Logout from the application
 * @param page - Playwright page object
 */
export async function logout(page: Page) {
  const logoutButton = page.getByRole('button', { name: 'Cerrar Sesión' });
  await expect(logoutButton).toBeVisible({ timeout: 15000 });
  await logoutButton.click();
  
  // Wait for navigation to login page
  await page.waitForURL('**/login/**', { timeout: 30000 });
}

/**
 * Check if user is logged in
 * @param page - Playwright page object
 * @returns true if logged in, false otherwise
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.waitForURL('**/dashboard**', { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
