import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'

// Listas de clientes y almacenes con la UI real: una carga fallida avisa y no
// se muestra como «No hay…». Sólo hosts locales.
test('Listas: clientes y almacenes con la lectura caída avisan y no se muestran vacías', async ({ page, context }) => {
  test.setTimeout(300000)
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGDATABASE, 'erp_e2e')
  const fixture = JSON.parse(fs.readFileSync(path.join(output, 'le-first-fixture.json'), 'utf8'))
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax')
  const checks: Array<{ operation: string; passed: boolean }> = []
  const proof = { success: false, remoteWrites: false, complete_acceptance: false, scope: 'UI real de listas con API/PostgreSQL locales', checks }
  const save = () => fs.writeFileSync(path.join(output, 'list-errors-browser.json'), JSON.stringify(proof, null, 2))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  const withoutRead = async (table: string, action: () => Promise<void>) => {
    assert.equal(sql(`SELECT has_table_privilege('service_role','public.${table}','SELECT');`), 't')
    sql(`REVOKE SELECT ON public.${table} FROM service_role;`)
    try { await action() } finally { sql(`GRANT SELECT ON public.${table} TO service_role;`) }
  }
  const step = async (operation: string, action: () => Promise<void>) => {
    const before = test.info().errors.length
    await action()
    checks.push({ operation, passed: test.info().errors.length === before })
  }
  page.on('dialog', dialog => void dialog.dismiss())
  try {
    await loginPeruLocal(page, fixture.email, 'Cliente-Local-2026-Only!')
    await step('Clientes con la lectura caída avisa y no invita a crear el primero', () => withoutRead('clientes', async () => {
      // La primera visita compila la página en Next dev: plazo propio para no confundirlo con un fallo.
      await page.goto('/dashboard/ventas/clientes/', { timeout: 120000 })
      await expect(page.getByRole('alert').filter({hasText:'No se pudieron cargar los clientes.'})).toBeVisible()
      await expect.soft(page.getByText('No hay clientes', { exact: true })).toHaveCount(0)
    }))
    await page.getByRole('button',{name:'Reintentar',exact:true}).click()
    await expect(page.getByRole('alert').filter({hasText:'No se pudieron cargar los clientes.'})).toHaveCount(0)
    await step('Almacenes con la lectura caída avisa y no dice que no hay almacenes', () => withoutRead('almacenes', async () => {
      await page.goto('/dashboard/inventario/almacenes/', { timeout: 120000 })
      await expect.soft(page.getByText('No se pudieron cargar los almacenes', { exact: false })).toBeVisible({ timeout: 60000 })
      await expect.soft(page.getByText('No hay almacenes registrados.', { exact: true })).toHaveCount(0)
    }))
    proof.success = checks.every(check => check.passed)
  } finally {
    save()
  }
})
