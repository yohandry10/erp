import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'

// Inicio del dashboard con la UI real: sin lectura de comprobantes la pantalla
// avisa en vez de mostrar ventas en cero. Sólo hosts locales.
test('Dashboard: una lectura caída se informa y no se muestra como ventas en cero', async ({ page, context, request }) => {
  test.setTimeout(240000)
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGDATABASE, 'erp_e2e')
  const fixture = JSON.parse(fs.readFileSync(path.join(output, 'dash-first-fixture.json'), 'utf8'))
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax')
  const checks: Array<{ operation: string; passed: boolean }> = []
  const proof = { success: false, remoteWrites: false, complete_acceptance: false, scope: 'UI real del inicio del dashboard con API/PostgreSQL locales', checks }
  const save = () => fs.writeFileSync(path.join(output, 'dashboard-browser.json'), JSON.stringify(proof, null, 2))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  try {
    await loginPeruLocal(page, fixture.email, 'Cliente-Local-2026-Only!')
    assert.equal(sql("SELECT has_table_privilege('service_role','public.cpe','SELECT');"), 't')
    sql('REVOKE SELECT ON public.cpe FROM service_role;')
    const before = test.info().errors.length
    try {
      // El snapshot de métricas se invalida para que la lectura llegue a la base.
      const api = process.env.LOCAL_API_URL!
      const login = await request.post(`${api}/api/auth/login/`, { data: { email: fixture.email, password: 'Cliente-Local-2026-Only!' } })
      const token = (await login.json()).data?.access_token ?? (await login.json()).access_token
      const invalidated = await request.post(`${api}/api/dashboard/cache/invalidate/`, { headers: { authorization: `Bearer ${token}` } })
      expect(invalidated.status()).toBeLessThan(300)
      await page.goto('/dashboard/', { timeout: 120000 })
      await expect.soft(page.getByText('No se pudieron actualizar las métricas', { exact: false })).toBeVisible({ timeout: 60000 })
    } finally {
      sql('GRANT SELECT ON public.cpe TO service_role;')
    }
    checks.push({ operation: 'Sin lectura de comprobantes el inicio avisa en vez de mostrar ventas en cero', passed: test.info().errors.length === before })
    proof.success = checks.every(check => check.passed)
  } finally {
    save()
  }
})
