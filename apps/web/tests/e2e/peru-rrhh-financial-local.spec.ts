import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { consumeLocalAccounting, readLocalSql } from './helpers/peru-local-accounting'

async function loginLocal(page: Page, email: string, password: string) {
  await page.goto('/login/')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  for (let attempt = 0; attempt < 2; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/auth/login')
        && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click(),
    ])
    if (response.status() === 429 && attempt === 0) {
      const seconds = Number(await response.headerValue('retry-after') || 60)
      expect(seconds).toBeGreaterThan(0)
      expect(seconds).toBeLessThanOrEqual(60)
      await new Promise(resolve => setTimeout(resolve, seconds * 1000))
      continue
    }
    expect(response.status()).toBe(201)
    await page.waitForURL('**/dashboard/**', { timeout: 25000 })
    return
  }
}

async function localOnly(context: BrowserContext) {
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
}

test('Perú: PLAME recupera paquete perdido, crea una nueva intención y descarga el ZIP real', async ({ page, context }) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(25000)
  await localOnly(context)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  const fixture = JSON.parse(await fs.readFile(path.join(output, 'payroll-plame-fixture.json'), 'utf8'))
  expect(fixture.payroll_id).toMatch(/^[0-9a-f-]{36}$/i)
  const payroll = `'${fixture.payroll_id}'::uuid`
  const count = () => Number(readLocalSql(`SELECT count(*) FROM rrhh_peru_presentaciones_planilla WHERE planilla_id=${payroll};`))
  const before = count()
  const keys: (string | undefined)[] = []
  const scriptErrors: string[] = []
  let loseResponse = true
  let success = false
  page.on('pageerror', error => scriptErrors.push(error.message))
  await page.route(new RegExp(`/api/rrhh/peru/planilla-electronica/${fixture.payroll_id}/paquetes/?$`), async route => {
    if (route.request().method() !== 'POST') return route.continue()
    keys.push(route.request().headers()['idempotency-key'])
    const response = await route.fetch()
    expect(response.status(), await response.text()).toBe(201)
    if (loseResponse) return route.fulfill({ status: 503, json: { message: 'Respuesta perdida local del paquete' } })
    return route.fulfill({ response })
  })
  try {
    await loginLocal(page, fixture.email, 'Cliente-Local-2026-Only!')
    await page.goto('/dashboard/rrhh/planilla-electronica/')
    const freeze = page.getByRole('button', { name: 'Congelar nueva versión', exact: true })
    await expect(freeze).toBeEnabled()
    await freeze.click()
    await expect(freeze).toBeEnabled()
    expect(count()).toBe(before + 1)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every(key => key && key === keys[0])).toBe(true)
    loseResponse = false
    await freeze.click()
    await expect(page.getByText('Versión congelada con huellas SHA-256.', { exact: false })).toBeVisible()
    await expect(freeze).toBeEnabled()
    expect(count()).toBe(before + 1)
    expect(keys.every(key => key === keys[0])).toBe(true)
    await freeze.click()
    await expect.poll(count).toBe(before + 2)
    expect(keys.at(-1)).not.toBe(keys[0])
    await page.reload()
    await expect(page.getByText(`${fixture.period} · v${before + 2}`, { exact: true })).toBeVisible()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Descargar', exact: true }).first().click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`PLANILLA_ELECTRONICA_${fixture.period}_v${before + 2}.zip`)
    const file = await download.path()
    expect(file).not.toBeNull()
    const bytes = await fs.readFile(file!)
    expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK')
    expect(bytes.length).toBeGreaterThan(100)
    expect(readLocalSql(`SELECT count(*) FROM rrhh_peru_presentaciones_planilla WHERE planilla_id=${payroll} AND vigente;`)).toBe('1')
    expect(readLocalSql(`SELECT count(*) FROM rrhh_peru_presentaciones_planilla WHERE planilla_id=${payroll} AND estado='PRESENTADA';`)).toBe('0')
    expect(scriptErrors).toEqual([])
    success = true
  } finally {
    await fs.writeFile(path.join(output, 'browser-payroll-plame.json'), JSON.stringify({ success, remoteWrites: false,
      scope: 'Paquete local: commit con respuesta perdida, replay, intención nueva, recarga y descarga ZIP; sin PVS/SOL',
      same_retry_intent: keys.length > 1 && keys.slice(0, -1).every(key => key === keys[0]),
      versions_before: before, versions_after: count(), scriptErrors }, null, 2))
  }
})

test('Perú: liquidación recupera pago perdido y un actor distinto reversa banco y contabilidad', async ({ page, context, browser }) => {
  test.setTimeout(240000)
  page.setDefaultTimeout(25000)
  await localOnly(context)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  const fixture = JSON.parse(await fs.readFile(path.join(output, 'hr-financial-fixture.json'), 'utf8'))
  expect(fixture.liquidation_id).toMatch(/^[0-9a-f-]{36}$/i)
  expect(fixture.bank_id).toMatch(/^[0-9a-f-]{36}$/i)
  const liquidation = `'${fixture.liquidation_id}'::uuid`
  const bank = `'${fixture.bank_id}'::uuid`
  const tenant = `'${fixture.tenant}'::uuid`
  const balance = () => Number(readLocalSql(`SELECT round(saldo*100)::bigint FROM cuentas_bancarias WHERE id=${bank};`))
  const initialBalance = balance()
  const keys: string[] = []
  const scriptErrors: string[] = []
  let loseResponse = true
  let success = false
  let checkerContext: BrowserContext | undefined
  page.on('pageerror', error => scriptErrors.push(error.message))
  await page.route(new RegExp(`/api/rrhh/liquidaciones/${fixture.liquidation_id}/pagar/?$`), async route => {
    keys.push(route.request().postDataJSON().idempotency_key)
    const response = await route.fetch()
    expect(response.status(), await response.text()).toBe(201)
    if (loseResponse) return route.fulfill({ status: 503, json: { message: 'Respuesta perdida local del pago' } })
    return route.fulfill({ response })
  })
  try {
    await loginLocal(page, fixture.email, 'Cliente-Local-2026-Only!')
    await page.goto('/dashboard/rrhh/liquidaciones/')
    await page.getByRole('button', { name: 'Preparar pago', exact: true }).click()
    await page.getByRole('combobox', { name: 'Cuenta bancaria', exact: true }).click()
    await page.getByRole('option', { name: 'BANCO LOCAL · PEN', exact: true }).click()
    await page.locator('#payment-reference').fill('LIQ-UI-RECOVERY')
    const pay = page.getByRole('button', { name: 'Registrar pago', exact: true })
    await pay.click()
    await expect(pay).toBeEnabled()
    await expect(page.locator('#payment-reference')).toHaveValue('LIQ-UI-RECOVERY')
    expect(balance()).toBe(initialBalance - fixture.total_cents)
    expect(readLocalSql(`SELECT count(*) FROM pagos_liquidaciones WHERE liquidacion_id=${liquidation} AND estado='APLICADO';`)).toBe('1')
    loseResponse = false
    await pay.click()
    await expect(page.getByRole('button', { name: 'Revisar / revertir', exact: true })).toBeVisible()
    expect(keys.length).toBeGreaterThan(1)
    expect(keys.every(key => key && key === keys[0])).toBe(true)
    await page.reload()
    await page.getByRole('button', { name: 'Revisar / revertir', exact: true }).click()
    await page.locator('#reversal-reason').fill('Reversa del mismo pagador rechazada')
    const deniedResponse = page.waitForResponse(response => response.url().includes(`/liquidaciones/${fixture.liquidation_id}/pago/revertir`))
    await page.getByRole('button', { name: 'Revertir pago', exact: true }).click()
    expect((await deniedResponse).status()).toBe(403)
    expect(balance()).toBe(initialBalance - fixture.total_cents)
    checkerContext = await browser.newContext()
    await localOnly(checkerContext)
    const checker = await checkerContext.newPage()
    checker.setDefaultTimeout(25000)
    checker.on('pageerror', error => scriptErrors.push(error.message))
    await loginLocal(checker, fixture.checker_email, 'Aprobador-RRHH-2026!')
    await checker.goto('/dashboard/rrhh/liquidaciones/')
    await checker.getByRole('button', { name: 'Revisar / revertir', exact: true }).click()
    await checker.locator('#reversal-reason').fill('Reversa bancaria local por aprobador distinto')
    const reverseResponse = checker.waitForResponse(response => response.url().includes(`/liquidaciones/${fixture.liquidation_id}/pago/revertir`))
    await checker.getByRole('button', { name: 'Revertir pago', exact: true }).click()
    expect((await reverseResponse).status()).toBe(201)
    await expect(checker.getByRole('button', { name: 'Preparar pago', exact: true })).toBeVisible()
    expect(balance()).toBe(initialBalance)
    expect(readLocalSql(`SELECT count(*) FROM pagos_liquidaciones WHERE liquidacion_id=${liquidation} AND estado='APLICADO';`)).toBe('0')
    expect(readLocalSql(`SELECT count(*) FROM pagos_liquidaciones WHERE liquidacion_id=${liquidation} AND estado='REVERTIDO';`)).toBe('2')
    await consumeLocalAccounting('accounting-hr-financial-browser')
    const postings = JSON.parse(readLocalSql(`SELECT coalesce(jsonb_agg(jsonb_build_object('status',e.status,
      'entries',(SELECT count(*) FROM asientos_contables a WHERE a.source_event_id=e.event_id),
      'balanced',(SELECT bool_and(a.total_debe=a.total_haber AND a.estado='CONFIRMADO') FROM asientos_contables a WHERE a.source_event_id=e.event_id))),'[]')
      FROM outbox_events e WHERE tenant_id=${tenant} AND event_type IN ('banco.movimiento.registrado','cts.depositado','liquidacion.aprobada','liquidacion.pagada','liquidacion.pago.revertido');`))
    expect(postings.length).toBe(7)
    expect(postings.every((row: any) => row.status === 'completed' && row.entries === 1 && row.balanced)).toBe(true)
    expect(scriptErrors).toEqual([])
    success = true
  } finally {
    await checkerContext?.close()
    await fs.writeFile(path.join(output, 'browser-hr-financial.json'), JSON.stringify({ success, remoteWrites: false,
      scope: 'Transferencia perdida y replay, reversa por actor distinto, banco y asientos; sin pago efectivo',
      same_retry_intent: keys.length > 1 && keys.every(key => key === keys[0]),
      original_balance_cents: initialBalance, final_balance_cents: balance(), scriptErrors }, null, 2))
  }
})
