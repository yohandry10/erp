import { Page } from '@playwright/test';

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
  const userEmail = email || process.env.TEST_USER_EMAIL || 'admin@test.com';
  const userPassword = password || process.env.TEST_USER_PASSWORD || 'password123';

  // Navigate to login page
  await page.goto('/login', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait for login form to be visible
  await page.waitForSelector('input[name="email"]', { timeout: 15000 });
  
  // Fill in credentials
  await page.fill('input[name="email"]', userEmail);
  await page.fill('input[name="password"]', userPassword);
  
  // Submit login form
  await page.click('button[type="submit"]');
  
  // Wait for navigation to dashboard
  await page.waitForURL('**/dashboard**', { timeout: 30000 });
}

/**
 * Logout from the application
 * @param page - Playwright page object
 */
export async function logout(page: Page) {
  // Click on user menu or logout button (adjust selector based on your UI)
  await page.click('[data-testid="user-menu"]');
  await page.click('button:has-text("Cerrar Sesión")');
  
  // Wait for navigation to login page
  await page.waitForURL('**/login');
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
