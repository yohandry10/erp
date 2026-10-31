import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'

// Presupuesto editado desde el formulario real: volver a un monto ya usado
// (A→B→A) se aplica, no reproduce la primera edición. Sólo hosts locales.
test('Presupuestos: editar y volver al monto anterior lo guarda de verdad', async ({ page, context, request }) => {
  test.setTimeout(300000)
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGDATABASE, 'erp_e2e')
  const fixture = JSON.parse(fs.readFileSync(path.join(output, 'pres-browser-fixture.json'), 'utf8'))
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax')
  const q = (id: string) => { assert.match(id, /^[0-9a-f-]{36}$/i); return `'${id}'::uuid` }
  const checks: Array<{ operation: string; passed: boolean }> = []
  const proof = { success: false, remoteWrites: false, complete_acceptance: false, scope: 'UI real de edición de presupuesto con API/PostgreSQL locales', checks }
  const save = () => fs.writeFileSync(path.join(output, 'budgets-browser.json'), JSON.stringify(proof, null, 2))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  const api = process.env.LOCAL_API_URL!
  try {
    const login = await (await request.post(`${api}/api/auth/login/`, { data: { email: fixture.email, password: 'Cliente-Local-2026-Only!' } })).json()
    const headers = { authorization: `Bearer ${login.data?.access_token ?? login.access_token}` }
    const [anio, mes] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date()).split('-').map(Number)
    const existing = sql(`SELECT count(*) FROM periodos_contables WHERE tenant_id=${q(fixture.tenant)} AND anio=${anio} AND mes=${mes};`)
    if (existing === '0') expect((await request.post(`${api}/api/contabilidad/periodos/`, { data: { anio, mes }, headers })).status()).toBe(201)
    const periodo = sql(`SELECT id FROM periodos_contables WHERE tenant_id=${q(fixture.tenant)} AND anio=${anio} AND mes=${mes} LIMIT 1;`)
    const cuenta = sql(`SELECT id FROM plan_cuentas WHERE tenant_id=${q(fixture.tenant)} AND activo AND codigo LIKE '6%' ORDER BY codigo LIMIT 1;`)
    const cc = await (await request.post(`${api}/api/contabilidad/centros-costo/`, { data: { codigo: 'CC-UI', nombre: 'Centro UI', descripcion: 'Centro navegador' }, headers })).json()
    const centro = cc.data?.id ?? cc.data?.centro?.id ?? cc.id
    const created = await (await request.post(`${api}/api/contabilidad/presupuestos/`, { data: { centro_costo_id: centro, cuenta_id: cuenta, periodo_contable_id: periodo, monto_presupuestado: 1000, notas: 'Presupuesto UI' }, headers })).json()
    const id = created.data?.id ?? created.id
    const monto = () => Number(sql(`SELECT monto_presupuestado FROM presupuestos WHERE id=${q(id)};`))

    await loginPeruLocal(page, fixture.email, 'Cliente-Local-2026-Only!')
    const editar = async (valor: number) => {
      // La primera visita compila la página en Next dev: plazo propio para no confundirlo con un fallo.
      await page.goto(`/dashboard/contabilidad/presupuestos/${id}/`, { timeout: 120000 })
      const field = page.locator('#presupuesto-form-monto-presupuestado')
      await expect(field).toBeVisible({ timeout: 60000 })
      await field.fill(String(valor))
      const [response] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'PUT' && /\/contabilidad\/presupuestos\/[0-9a-f-]{36}\/?$/.test(new URL(r.url()).pathname)),
        page.getByRole('button', { name: 'Actualizar Presupuesto' }).click(),
      ])
      expect(response.status()).toBeLessThan(300)
      await expect.poll(() => monto(), { timeout: 10000 }).toBeGreaterThan(0)
      return monto()
    }
    const before = test.info().errors.length
    const valores = [await editar(2000), await editar(3000), await editar(2000)]
    expect.soft(valores, 'Monto guardado tras cada edición').toEqual([2000, 3000, 2000])
    checks.push({ operation: 'Editar 2000→3000→2000 desde el formulario guarda cada monto', passed: test.info().errors.length === before })
    proof.success = checks.every(check => check.passed)
  } finally {
    save()
  }
})
