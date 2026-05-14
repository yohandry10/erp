import { expect, Page } from '@playwright/test';

/**
 * Authentication helper for E2E tests
 */

/**
 * Login to the application
 * @param page - Playwright page object
 * @param email - User email (defaults to TEST_USER_EMAIL env var)
 * @param password - User password (defaults to TEST_USER_PASSWORD env var)
 */
export async function login(page: Page, email?: string, password?: string) {
  const userEmail = email || process.env.TEST_USER_EMAIL || 'admin@erp.local';
  const userPassword = password || process.env.TEST_USER_PASSWORD || 'AdminProd2026!';

  await page.addInitScript(() => {
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin', 'cajero', 'vendedor']));
  });

  if (email || password) {
    await page.context().clearCookies();
  }

  // Navigate to login page
  await page.goto('/login/', { waitUntil: 'commit', timeout: 30000 });

  if (await page.getByRole('button', { name: 'Cerrar Sesión' }).isVisible({ timeout: 5000 }).catch(() => false)) {
    if (email || password) {
      throw new Error('La página conserva una sesión previa pese a solicitar credenciales explícitas');
    }
    await expect(page.getByText('Verificando autenticación...')).toBeHidden({ timeout: 30000 });
    return;
  }

  // Wait for login form to be visible
  await page.getByLabel('Correo Electrónico').waitFor({ timeout: 15000 });
  await expect(page.getByText('Cargando países...')).toBeHidden({ timeout: 60000 });

  // Fill in credentials
  await page.getByLabel('Correo Electrónico').fill(userEmail);
  await page.getByLabel('Contraseña').fill(userPassword);

  const submitButton = page.getByRole('button', { name: 'Iniciar Sesión' });
  await expect(submitButton).toBeEnabled({ timeout: 60000 });
  await submitButton.click();

  // Wait for navigation to dashboard
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
