import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'

// Estados financieros con la UI real: «Refrescar vistas» envía el periodo que el
// API espera y no termina en un error de validación. Sólo hosts locales.
test('Estados financieros: refrescar vistas no termina en error de validación', async ({ page, context }) => {
  test.setTimeout(240000)
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGDATABASE, 'erp_e2e')
  const fixture = JSON.parse(fs.readFileSync(path.join(output, 'est-first-fixture.json'), 'utf8'))
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax')
  const checks: Array<{ operation: string; passed: boolean }> = []
  const proof = { success: false, remoteWrites: false, complete_acceptance: false, scope: 'UI real de estados financieros con API/PostgreSQL locales', checks }
  const save = () => fs.writeFileSync(path.join(output, 'statements-refresh-browser.json'), JSON.stringify(proof, null, 2))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  try {
    await loginPeruLocal(page, fixture.email, 'Cliente-Local-2026-Only!')
    // La primera visita compila la página en Next dev: plazo propio para no confundirlo con un fallo.
    await page.goto('/dashboard/contabilidad/estados/', { timeout: 120000 })
    const button = page.getByRole('button', { name: 'Refrescar vistas' })
    await expect(button).toBeVisible({ timeout: 60000 })
    const before = test.info().errors.length
    const [response] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'POST' && /\/contabilidad\/estados\/refrescar\/?/.test(new URL(r.url()).pathname)),
      button.click(),
    ])
    expect.soft(response.status(), 'Refrescar respondió').toBeLessThan(300)
    await expect.soft(page.getByText('Error de API', { exact: false })).toHaveCount(0)
    checks.push({ operation: 'Refrescar vistas envía el periodo en el cuerpo y responde 2xx', passed: test.info().errors.length === before })
    proof.success = checks.every(check => check.passed)
  } finally {
    save()
  }
})
