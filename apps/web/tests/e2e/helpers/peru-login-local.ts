import { expect, type Page } from '@playwright/test'

// Las pruebas sucesivas comparten IP. Respeta el límite real de login y su
// Retry-After, sin desactivar el guard ni reintentar operaciones de negocio.
export async function loginPeruLocal(page: Page, email: string, password: string) {
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Sólo login local efímero')
  await page.goto('/login/')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  for (let attempt = 0; attempt < 2; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/auth/login') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click(),
    ])
    if (response.status() === 429 && attempt === 0) {
      const seconds = Number(await response.headerValue('retry-after') || 60)
      expect(seconds).toBeGreaterThan(0)
      expect(seconds).toBeLessThanOrEqual(60)
      console.log(`[peru-local-login] 429; espera indicada: ${seconds}s`)
      await new Promise(resolve => setTimeout(resolve, seconds * 1000))
      continue
    }
    expect(response.status()).toBe(201)
    await expect(page).toHaveURL(/\/dashboard\//, { timeout: 25000 })
    return
  }
  throw new Error('Login local no confirmado después del Retry-After')
}
