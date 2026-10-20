import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'

// Catálogo de productos con la UI real: sin lectura de productos la pantalla
// avisa en vez de decir «No se encontraron productos». Sólo hosts locales.
test('Lecturas: el catálogo con la lectura caída avisa y no se muestra vacío', async ({ page, context }) => {
  test.setTimeout(240000)
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGDATABASE, 'erp_e2e')
  const fixture = JSON.parse(fs.readFileSync(path.join(output, 'rf-first-fixture.json'), 'utf8'))
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax')
  const checks: Array<{ operation: string; passed: boolean }> = []
  const proof = { success: false, remoteWrites: false, complete_acceptance: false, scope: 'UI real del catálogo de productos con API/PostgreSQL locales', checks }
  const save = () => fs.writeFileSync(path.join(output, 'read-faults-browser.json'), JSON.stringify(proof, null, 2))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  try {
    await loginPeruLocal(page, fixture.email, 'Cliente-Local-2026-Only!')
    assert.equal(sql("SELECT has_table_privilege('service_role','public.productos','SELECT');"), 't')
    sql('REVOKE SELECT ON public.productos FROM service_role;')
    const before = test.info().errors.length
    try {
      // La primera visita compila la página en Next dev: plazo propio para no confundirlo con un fallo.
      await page.goto('/dashboard/inventario/productos/', { timeout: 120000 })
      await expect.soft(page.locator('#productos-load-error')).toBeVisible({ timeout: 60000 })
      await expect.soft(page.getByText('No se encontraron productos')).toHaveCount(0)
    } finally {
      sql('GRANT SELECT ON public.productos TO service_role;')
    }
    checks.push({ operation: 'Sin lectura de productos el catálogo avisa en vez de mostrarse vacío', passed: test.info().errors.length === before })
    proof.success = checks.every(check => check.passed)
  } finally {
    save()
  }
})
