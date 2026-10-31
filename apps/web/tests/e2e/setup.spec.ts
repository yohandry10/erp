import { test, expect } from '@playwright/test';

/**
 * Setup verification test
 * This test verifies that Playwright is configured correctly
 */

test.describe('Setup Verification', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');
    
    // Verify the page loads
    await expect(page).toHaveTitle(/ERP/i);
  });

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/login');

    // Verify login page elements exist
    await expect(page.getByLabel('Correo Electrónico')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar Sesión' })).toBeVisible();
  });

  test('login waits for hydration and submits the values entered after readiness', async ({ page, context }) => {
    let releaseScripts!: () => void;
    const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
    let heldScripts = 0;
    const email = 'hydration-probe@example.test';
    const password = 'UAT-PROBE-NOT-A-SECRET';
    const submissions: unknown[] = [];
    await context.route('**/*', async route => {
      if (route.request().resourceType() === 'script') {
        heldScripts++;
        await scriptsReady;
        return route.continue();
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
        expect(new URL(route.request().url()).pathname).toMatch(/\/auth\/login\/?$/);
        submissions.push(route.request().postDataJSON());
        return route.fulfill({ status: 401, json: { message: 'Prueba de formulario sin autenticación real' } });
      }
      return route.continue();
    });
    try {
      await page.goto('/login/', { waitUntil: 'commit' });
      await expect(page.getByLabel('Correo Electrónico')).toBeDisabled();
      await expect(page.getByLabel('Contraseña')).toBeDisabled();
      await expect(page.getByLabel('País operativo')).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Iniciar Sesión', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Acceso Demo', exact: true })).toBeDisabled();
      await expect.poll(() => heldScripts).toBeGreaterThan(0);
      releaseScripts();
      await expect(page.getByLabel('Correo Electrónico')).toBeEnabled();
      await page.getByLabel('Correo Electrónico').fill(email);
      await page.getByLabel('Contraseña').fill(password);
      await page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click();
      await expect.poll(() => submissions.length).toBe(1);
      expect(submissions[0]).toMatchObject({ email, password });
      await expect(page.getByLabel('Correo Electrónico')).toHaveValue(email);
      await expect(page.getByLabel('Contraseña')).toHaveValue(password);
    } finally {
      releaseScripts();
      await context.unrouteAll({ behavior: 'wait' });
    }
  });
});
