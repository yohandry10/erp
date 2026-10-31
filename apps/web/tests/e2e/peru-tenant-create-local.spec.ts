import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'

// Alta de empresa desde el panel del superadministrador con la UI real: si la
// respuesta se pierde (el servidor sí creó la empresa), reintentar debe mostrar
// credenciales con las que el administrador entra. Sólo hosts locales.
test('Alta de empresa: perder la respuesta y reintentar confirma la empresa y sus credenciales', async ({ page, context, request }) => {
  test.setTimeout(300000)
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGDATABASE, 'erp_e2e')
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax')
  const checks: Array<{ operation: string; passed: boolean }> = []
  const proof = { success: false, remoteWrites: false, complete_acceptance: false, scope: 'UI real del alta de empresa con API/PostgreSQL locales', checks }
  const save = () => fs.writeFileSync(path.join(output, 'tenant-create-browser.json'), JSON.stringify(proof, null, 2))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  const step = async (operation: string, action: () => Promise<void>) => {
    const before = test.info().errors.length
    await action()
    checks.push({ operation, passed: test.info().errors.length === before })
  }
  // Privilegio de plataforma sólo en la base local, siempre retirado al terminar.
  const actorEmail = 'peru-integrated-restricted-1@example.test'
  const actor = sql(`SELECT id FROM usuarios_sistema WHERE email='${actorEmail}' AND NOT is_super_admin;`)
  assert.match(actor, /^[0-9a-f-]{36}$/i)
  const base = '2098765492', weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const digit = 11 - weights.reduce((sum, weight, index) => sum + Number(base[index]) * weight, 0) % 11
  const ruc = base + String(digit === 10 ? 0 : digit === 11 ? 1 : digit)
  const adminEmail = `alta.ui.${Date.now()}@example.test`
  try {
    sql(`UPDATE usuarios_sistema SET is_super_admin=true WHERE id='${actor}'::uuid;`)
    await loginPeruLocal(page, actorEmail, 'Local-Peru-2026-Only!')
    // La primera visita compila la página en Next dev: plazo propio para no confundirlo con un fallo.
    await page.goto('/superadmin/dashboard/', { timeout: 120000 })
    await page.getByRole('button', { name: 'Crear tenant' }).click({ timeout: 60000 })
    const form = page.locator('form').filter({ has: page.locator('[name="ruc"]') })
    await form.locator('[name="ruc"]').fill(ruc)
    await form.locator('[name="razon_social"]').fill('Empresa alta navegador SAC')
    await form.locator('[name="direccion"]').fill('Av. Alta navegador 321')
    await form.locator('[name="email"]').fill(adminEmail)
    await form.locator('[name="telefono"]').fill('014445555')
    await form.locator('[name="admin_nombre"]').fill('Administradora')
    const adminPassword = 'Alta-Navegador-2026!'
    await form.locator('[name="admin_password"]').fill(adminPassword)

    // La respuesta del alta se pierde después de que el servidor la confirmó.
    let served = 0
    const tenantsUrl = (url: URL) => /\/api\/tenants\/?$/.test(url.pathname)
    await page.route(tenantsUrl, async route => {
      if (route.request().method() !== 'POST') return route.continue()
      const response = await route.fetch()
      served = response.status()
      await route.abort('failed')
    })
    await form.getByRole('button', { name: 'Crear Empresa' }).click()
    await expect.poll(() => served, { timeout: 90000 }).toBeGreaterThan(0)
    await page.unroute(tenantsUrl)
    expect(served).toBe(201)
    expect(sql(`SELECT count(*) FROM empresa_config WHERE ruc='${ruc}';`)).toBe('1')

    await step('Reintentar el alta confirma la empresa con sus credenciales, sin duplicarla', async () => {
      await expect(form.getByRole('button', { name: 'Crear Empresa' })).toBeEnabled({ timeout: 30000 })
      const [retry] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'POST' && /\/api\/tenants\/?$/.test(new URL(r.url()).pathname), { timeout: 90000 }),
        form.getByRole('button', { name: 'Crear Empresa' }).click(),
      ])
      expect(retry.status()).toBe(201)
      await expect.soft(page.getByText('¡Empresa Creada!')).toBeVisible({ timeout: 15000 })
      await page.getByTitle('Mostrar').click({ timeout: 10000 }).catch(() => undefined)
      await expect.soft(page.getByText(adminPassword, { exact: true })).toBeVisible({ timeout: 5000 })
      const login = await request.post(`${process.env.LOCAL_API_URL}/api/auth/login/`, { data: { email: adminEmail, password: adminPassword } })
      expect(login.status(), 'El administrador entra con la contraseña inicial').toBe(201)
      expect(sql(`SELECT count(*) FROM empresa_config WHERE ruc='${ruc}';`)).toBe('1')
    })
    proof.success = checks.every(check => check.passed)
  } finally {
    sql(`UPDATE usuarios_sistema SET is_super_admin=false WHERE id='${actor}'::uuid;`)
    save()
  }
})
