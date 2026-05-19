import { expect, Page, test } from '@playwright/test'
import { gotoAuthenticated, login } from './helpers/auth'

async function collectCriticalBrowserFailures(page: Page) {
  const failures: string[] = []

  page.on('pageerror', error => {
    failures.push(`pageerror: ${error.message}`)
  })

  page.on('console', message => {
    if (message.type() === 'error') {
      failures.push(`console: ${message.text()}`)
    }
  })

  page.on('response', response => {
    const status = response.status()
    const url = response.url()
    if (status >= 500 || (status === 404 && /\/(_next|dashboard|backend\/api|api)\//.test(url))) {
      failures.push(`network: ${status} ${url}`)
    }
  })

  return failures
}

test.describe('Configuración operativa', () => {
  test('admin abre configuración, empresa y ventas sin pantalla blanca ni 404 críticos', async ({ page }) => {
    const failures = await collectCriticalBrowserFailures(page)

    await login(page)
    await gotoAuthenticated(page, '/dashboard/configuracion/')

    await expect(page).toHaveURL(/\/dashboard\/configuracion\/?$/)
    await expect(page.getByRole('heading', { name: 'Configuración operativa' })).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('This page could not be found')).toHaveCount(0)
    await expect(page.getByText('Configuración no disponible')).toHaveCount(0)
    await expect(page.getByText('Certificado digital')).toBeVisible()
    await expect(page.getByText('SUNAT/OSE')).toBeVisible()

    await page.getByRole('link', { name: 'Empresa' }).click()
    await expect(page).toHaveURL(/\/dashboard\/configuracion\/empresa\/?$/)
    await expect(page.getByRole('heading', { name: 'Empresa' })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('heading', { name: 'Fiscal y certificado' })).toBeVisible()

    await page.getByRole('link', { name: 'Ventas' }).click()
    await expect(page).toHaveURL(/\/dashboard\/configuracion\/ventas\/?$/)
    await expect(page.getByRole('heading', { name: 'Ventas y documentos' })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('heading', { name: 'Logística y GRE' })).toBeVisible()

    expect(failures, `fallos críticos en navegador: ${failures.join('\n')}`).toEqual([])
  })
})
