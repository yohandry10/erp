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
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
