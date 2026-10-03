import { test, expect, type BrowserContext, type Dialog, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { consumeLocalAccounting, readLocalSql } from './helpers/peru-local-accounting'

async function submitLocalLogin(page: Page) {
  // Todos los usuarios del ensayo comparten la IP local. Conservar el límite
  // real de autenticación y respetar Retry-After cuando se agota su ventana.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/auth/login')
        && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click(),
    ])
    if (response.status() === 429 && attempt === 0) {
      const retryAfter = Number(await response.headerValue('retry-after') || 60)
      expect(retryAfter).toBeGreaterThan(0)
      expect(retryAfter).toBeLessThanOrEqual(60)
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
      continue
    }
    expect(response.status(), 'El login real debe responder 201').toBe(201)
    return
  }
}

function isHandledHttpResponse(row: { path: string; status: number }) {
  const pathname = row.path.replace(/\/$/, '')
  return (row.status === 403 && pathname.endsWith('/demo/status'))
    // submitLocalLogin sólo permite continuar si el retry termina en 201.
    || (row.status === 429 && pathname.endsWith('/api/auth/login'))
}

test('Perú: primer administrador completa wizard, recupera progreso y respuestas perdidas sin duplicar', async ({ page, context }) => {
  test.setTimeout(300000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  const fixture = JSON.parse(await fs.readFile(path.join(output, 'wizard-fixture.json'), 'utf8'))
  expect(fixture.tenant).toMatch(/^[0-9a-f-]{36}$/i)
  const tenant = `'${fixture.tenant}'::uuid`
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  const requests: { method: string; path: string; status: number }[] = []
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.pathname.includes('/api/configuration/')) requests.push({ method: response.request().method(), path: url.pathname, status: response.status() })
  })
  const stepKeys: (string | undefined)[] = []
  const completionKeys: (string | undefined)[] = []
  let lostStep = false
  let lostCompletion = false
  await page.route(/\/api\/configuration\/wizard\/step\/?(?:\?.*)?$/, async route => {
    if (route.request().method() !== 'POST') return route.continue()
    stepKeys.push(route.request().headers()['idempotency-key'])
    const response = await route.fetch()
    expect(response.status()).toBe(201)
    if (!lostStep) {
      lostStep = true
      return route.fulfill({ status: 503, json: { message: 'Respuesta perdida local del paso' } })
    }
    return route.fulfill({ response })
  })
  await page.route(/\/api\/configuration\/complete\/?(?:\?.*)?$/, async route => {
    if (route.request().method() !== 'POST') return route.continue()
    completionKeys.push(route.request().headers()['idempotency-key'])
    const response = await route.fetch()
    expect(response.status()).toBe(201)
    if (!lostCompletion) {
      lostCompletion = true
      return route.fulfill({ status: 503, json: { message: 'Respuesta perdida local del cierre' } })
    }
    return route.fulfill({ response })
  })
  await page.goto('/login/')
  await page.locator('#email').fill(fixture.email)
  await page.locator('#password').fill('Cliente-Local-2026-Only!')
  await submitLocalLogin(page)
  await page.waitForURL('**/dashboard/**')
  const core = await (await page.request.get('/backend/api/configuration/status')).json()
  expect(core.data.isComplete).toBe(true)
  expect(readLocalSql(`SELECT coalesce(bool_or(completado),false) FROM wizard_progress WHERE tenant_id=${tenant};`)).toBe('f')
  const status = await page.request.get('/backend/api/demo/status')
  expect(status.status()).toBe(200)
  expect((await status.json()).is_demo).toBe(false)
  // DEMO_API_ENABLED=false en este harness. Sólo la consulta autenticada está disponible.
  expect((await page.request.get('/backend/api/demo/planes')).status()).toBe(403)
  await page.goto('/dashboard/wizard/')
  await expect(page.getByRole('heading', { name: 'Bienvenido', exact: true })).toBeVisible({ timeout: 30000 })
  const next = page.getByRole('button', { name: 'Siguiente', exact: true })
  await next.click()
  await expect(page.getByText('Error al guardar el progreso', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bienvenido', exact: true })).toBeVisible()
  await next.click()
  await expect(page.getByRole('heading', { name: 'Tipo de Empresa', exact: true })).toBeVisible()
  expect(stepKeys[0]).toBeTruthy()
  expect(stepKeys[1]).toBe(stepKeys[0])
  await page.getByRole('button', { name: /Microempresa/ }).click()
  await next.click()
  await page.locator('#ruc').fill('123')
  await page.locator('#razonSocial').fill('Primera empresa del navegador local')
  await page.locator('#direccion').fill('Av. QA local 456')
  await expect(next).toBeDisabled()
  await page.locator('#ruc').fill(fixture.ruc)
  await page.locator('#ubigeo').fill('150101')
  await next.click()
  await expect(page.locator('#certificatePassword')).toBeVisible()
  const progress = /\/api\/configuration\/wizard\/progress\/?(?:\?.*)?$/
  await page.route(progress, route => route.fulfill({ status: 503, json: { message: 'Consulta local fallida' } }))
  await page.reload()
  await expect(page.getByText('No se pudo recuperar la configuración guardada. Reintenta la consulta.', { exact: true })).toBeVisible()
  await expect(next).toHaveCount(0)
  await page.unroute(progress)
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.locator('#ruc')).toHaveValue(fixture.ruc)
  await expect(page.locator('#razonSocial')).toHaveValue('Primera empresa del navegador local')
  await next.click()
  await page.locator('input[type=file]').setInputFiles(path.join(output, 'wizard-local.pfx'))
  await page.locator('#certificatePassword').fill('Clave-incorrecta-local')
  await next.click()
  await page.locator('#regimen_tributario').selectOption('GENERAL')
  await page.locator('#serie_factura').fill('F001')
  await page.locator('#serie_boleta').fill('B001')
  await page.locator('#serie_guia_remision').fill('T001')
  await next.click()
  await page.locator('#sunat_username').fill('SOL_SECUNDARIO_LOCAL')
  await page.locator('#sunat_password').fill('Clave-SOL-ensayo-local')
  await next.click()
  await expect(page.getByRole('heading', { name: 'Se encontraron problemas' })).toBeVisible()
  await expect(next).toBeDisabled()
  expect(readLocalSql(`SELECT coalesce(bool_or(completado),false) FROM wizard_progress WHERE tenant_id=${tenant};`)).toBe('f')
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Anterior', exact: true }).click()
  await page.locator('#certificatePassword').fill('Clave-PFX-local')
  await next.click()
  await expect(page.locator('#regimen_tributario')).toBeVisible()
  await next.click()
  await expect(page.locator('#sunat_username')).toHaveValue('SOL_SECUNDARIO_LOCAL')
  await next.click()
  await expect(page.getByText('Respuesta perdida local del cierre', { exact: true })).toBeVisible()
  expect(lostCompletion).toBe(true)
  expect(readLocalSql(`SELECT completado FROM wizard_progress WHERE tenant_id=${tenant};`)).toBe('t')
  await next.click()
  await page.getByRole('button', { name: 'Ir al Dashboard', exact: true }).click()
  await page.waitForURL(/\/dashboard\/$/)
  expect(completionKeys).toHaveLength(2)
  expect(completionKeys[0]).toBeTruthy()
  expect(completionKeys[1]).toBe(completionKeys[0])
  expect(readLocalSql(`SELECT count(*) FROM outbox_events WHERE tenant_id=${tenant} AND event_type='configuracion.wizard.completado';`)).toBe('1')
  await page.goto('/dashboard/wizard/')
  await expect(page.getByRole('heading', { name: 'Resumen de Configuración', exact: true })).toBeVisible()
  const company = (await (await page.request.get('/backend/api/configuration/empresa')).json()).data
  expect(company.ruc).toBe(fixture.ruc)
  expect(company.certificateConfigured).toBe(true)
  expect(company.sunatUsernameConfigured).toBe(true)
  for (const secret of ['Clave-PFX-local', 'Clave-SOL-ensayo-local', 'Clave-incorrecta-local']) expect(JSON.stringify(company)).not.toContain(secret)
  await page.screenshot({ path: path.join(output, 'wizard-completed.png'), fullPage: true })
  await fs.writeFile(path.join(output, 'browser-first-client-wizard.json'), JSON.stringify({ success: true, remoteWrites: false,
    scope: 'Primer ADMIN no demo, configuración fiscal local sin transmisión', requests,
    coreReadyBeforeWizard: true, progressRecovered: true, invalidRucRejected: true, invalidPfxRejected: true,
    stepReplyLostSameIntent: true, completionReplyLostSameIntent: true, singleCompletion: true, publicSecretsAbsent: true }, null, 2))
})

test('Perú: primer administrador edita banco, descarga CSV filtrado y consulta conciliación cerrada', async ({ browser }) => {
  test.setTimeout(180000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  const fixture = JSON.parse(await fs.readFile(path.join(output, 'finance-fixture.json'), 'utf8'))
  expect(fixture.tenant).toMatch(/^[0-9a-f-]{36}$/i)
  const tenant = `'${fixture.tenant}'::uuid`
  const bank = readLocalSql(`SELECT id FROM cuentas_bancarias WHERE tenant_id=${tenant} AND nombre='Banco A editado';`)
  const reconciliation = readLocalSql(`SELECT id FROM conciliaciones_bancarias WHERE tenant_id=${tenant} AND cuenta_bancaria_id='${bank}'::uuid AND estado='CERRADA';`)
  expect(bank).toMatch(/^[0-9a-f-]{36}$/i)
  expect(reconciliation).toMatch(/^[0-9a-f-]{36}$/i)
  const context = await browser.newContext({ baseURL: process.env.LOCAL_WEB_URL, timezoneId: 'America/Lima' })
  try {
    await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort('blockedbyclient'))
    const page = await context.newPage()
    await page.goto('/login/')
    await page.locator('#email').fill(fixture.email)
    await page.locator('#password').fill('Cliente-Local-2026-Only!')
    await submitLocalLogin(page)
    await page.waitForURL('**/dashboard/**')
    await page.goto(`/dashboard/finanzas/bancos/${bank}/editar/`)
    await expect(page.locator('#editar-nombre-de-la-cuenta')).toHaveValue('Banco A editado', { timeout: 30000 })
    await page.locator('#editar-nombre-de-la-cuenta').fill('Banco A editado en navegador')
    const endpoint = new RegExp('/api/finanzas/bancos/cuentas/' + bank + '/?$')
    const [saved] = await Promise.all([
      page.waitForResponse(response => endpoint.test(new URL(response.url()).pathname) && response.request().method() === 'PUT'),
      page.getByRole('button', { name: 'Guardar Cambios', exact: true }).click(),
    ])
    expect(saved.status()).toBe(200)
    await page.waitForURL(/\/dashboard\/finanzas\/bancos\/$/)
    await page.goto(`/dashboard/finanzas/bancos/${bank}/editar/`)
    await expect(page.locator('#editar-nombre-de-la-cuenta')).toHaveValue('Banco A editado en navegador')
    await page.goto(`/dashboard/finanzas/bancos/${bank}/`)
    await page.getByRole('button', { name: 'Filtros', exact: true }).click()
    await expect(page.locator('#id-conciliado')).toBeVisible()
    await page.locator('#id-conciliado').selectOption('true')
    await expect(page.locator('tbody tr')).not.toHaveCount(0)
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar', exact: true }).click(),
    ])
    const filename = path.join(output, 'bank-filtered-ui.csv')
    await download.saveAs(filename)
    const csv = await fs.readFile(filename, 'utf8')
    const date = readLocalSql(`SELECT app.hoy_tenant(${tenant});`).split('-').reverse().join('/')
    expect(csv).toContain('"' + date + '"')
    expect(csv).toContain('"\'=1+1"')
    for (const reference of ['FUND-LOCAL', 'FEE-LOCAL', 'TRANSFER-LOCAL', 'PAY-PARTIAL', 'PAY-FINAL', 'ADJUST-LOCAL']) expect(csv).toContain(reference)
    expect(csv).toContain('"Sí"')
    await page.goto(`/dashboard/finanzas/conciliacion/${reconciliation}/`)
    await expect(page.getByRole('heading', { name: 'Conciliación Bancaria', exact: true })).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('CERRADA', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Modo Wizard/ })).toBeDisabled()
    expect(readLocalSql(`SELECT saldo FROM cuentas_bancarias WHERE id='${bank}'::uuid;`)).toBe('68.30')
    await page.screenshot({ path: path.join(output, 'bank-reconciliation-closed.png'), fullPage: true })
    await fs.writeFile(path.join(output, 'browser-bank-finance.json'), JSON.stringify({ success: true, remoteWrites: false,
      scope: 'Banco editado/recargado, CSV filtrado descargado y conciliación cerrada consultada; no acepta sus mutaciones por UI',
      browserTimeZone: 'America/Lima', editPersisted: true, filteredCsvDownloaded: true, fiscalDatePreserved: true,
      formulaNeutralized: true, reconciliationReadOnly: true, balancePreserved: true }, null, 2))
  } finally {
    await context.close()
  }
})

test('Perú: reportes muestran tendencia, código del producto y filtro de cliente real', async ({ page, context }) => {
  test.setTimeout(180000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/login/')
  await page.locator('#email').fill('peru-integrated-1@example.test')
  await page.locator('#password').fill('Local-Peru-2026-Only!')
  await submitLocalLogin(page)
  await page.waitForURL('**/dashboard/**')
  await page.goto('/dashboard/ventas/reportes/')
  await page.getByRole('tab', { name: 'Lead Time', exact: true }).click()
  await expect(page.getByText('Tendencia Temporal', { exact: true })).toBeVisible()
  await expect(page.locator('#report-panel-lead-time tbody tr')).not.toHaveCount(0)
  await page.screenshot({ path: path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'commercial-lead-time.png'), fullPage: true })
  await page.getByRole('tab', { name: 'Productos', exact: true }).click()
  const panel = page.locator('#report-panel-productos')
  await expect(panel.getByText('DEMO-003', { exact: true })).toBeVisible()
  await page.locator('#reportes-cliente-opcional').fill('cliente-inexistente-local')
  await expect(panel.getByText('No hay datos disponibles', { exact: true })).toBeVisible()
  await page.locator('#reportes-cliente-opcional').fill('')
  await expect(panel.getByText('DEMO-003', { exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'commercial-product-report.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('Perú: CxC cobrada se busca, muestra dos pagos y se exporta desde la interfaz real', async ({ page, context }) => {
  test.setTimeout(180000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  const evidence = JSON.parse(await fs.readFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'http.json'), 'utf8'))
  const collection = evidence.results.find((row: { scenario: string; cxc_id?: string }) =>
    row.cxc_id && row.scenario.startsWith('pedido despachado genera CPE/CxC;'))
  expect(collection?.cxc_id).toBeTruthy()
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/login/')
  await page.locator('#email').fill('peru-integrated-1@example.test')
  await page.locator('#password').fill('Local-Peru-2026-Only!')
  const [login] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/auth/login') && response.status() === 201),
    submitLocalLogin(page),
  ])
  const auth = await login.json()
  const token = auth.access_token ?? auth.data?.access_token
  expect(token).toBeTruthy()
  const detailResponse = await page.request.get(`${process.env.LOCAL_API_URL}/api/finanzas/cxc/${collection.cxc_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(detailResponse.ok(), await detailResponse.text()).toBeTruthy()
  const rawDetail = await detailResponse.json()
  const detail = rawDetail.data ?? rawDetail
  expect(detail.pagos).toHaveLength(2)
  await page.goto('/dashboard/finanzas/cxc/')
  await page.getByPlaceholder('Serie, numero, cliente, moneda').fill(String(detail.numero))
  const row = page.getByRole('row').filter({ hasText: String(detail.numero) })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Cancelado')
  await row.getByRole('button', { name: 'Historial' }).click()
  const dialog = page.getByRole('dialog', { name: 'Historial de cobranza' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Cobros registrados: 2')
  await expect(dialog).toContainText('COBRO-PARCIAL-LOCAL')
  await expect(dialog).toContainText('COBRO-FINAL-EFECTIVO-LOCAL')
  await page.keyboard.press('Escape')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar' }).click()])
  const csv = await fs.readFile(await download.path(), 'utf8')
  expect(csv).toContain(String(detail.numero))
  expect(csv).toContain('CANCELADO')
  const cxcListRoute = /\/finanzas\/cxc\/?(?:\?.*)?$/
  await context.route(cxcListRoute, route => route.fulfill({ status: 503, json: { message: 'Fallo temporal local' } }))
  await page.getByRole('button', { name: 'Actualizar' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudieron cargar las cuentas por cobrar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exportar' })).toBeDisabled()
  await context.unroute(cxcListRoute)
  await page.getByRole('button', { name: 'Reintentar consulta' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudieron cargar las cuentas por cobrar' })).toBeHidden()
  await expect(page.getByRole('row').filter({ hasText: String(detail.numero) })).toBeVisible()
})

test('Perú: primer administrador importa, edita y desactiva maestros con recuperación de error', async ({ page, context }) => {
  test.setTimeout(240000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  const evidence = JSON.parse(await fs.readFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'http.json'), 'utf8'))
  const onboarding = evidence.results.find((row: { scenario: string }) => row.scenario.startsWith('alta no demo y primer administrador'))
  expect(onboarding?.client_email).toBeTruthy()
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/login/')
  await page.locator('#email').fill(onboarding.client_email)
  await page.locator('#password').fill('Cliente-Local-2026-Only!')
  const [login] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/auth/login') && response.status() === 201),
    submitLocalLogin(page),
  ])
  const auth = await login.json()
  const token = auth.access_token ?? auth.data?.access_token
  expect(token).toBeTruthy()
  const headers = { Authorization: `Bearer ${token}` }
  await page.waitForURL('**/dashboard/**')
  const importSuffix = randomUUID().slice(0, 8)
  const numericSuffix = String(Number.parseInt(importSuffix, 16) % 100_000_000).padStart(8, '0')
  const rucBase = `20${numericSuffix}`
  const rucFactors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const rucRemainder = 11 - rucFactors.reduce((sum, factor, index) => sum + factor * Number(rucBase[index]), 0) % 11
  const uniqueRuc = `${rucBase}${rucRemainder === 10 ? 0 : rucRemainder === 11 ? 1 : rucRemainder}`
  for (const item of [
    { entity: 'clientes', route: '/dashboard/ventas/clientes/', document: numericSuffix, documentType: 'DNI', kind: 'PERSONA' },
    { entity: 'proveedores', route: '/dashboard/compras/proveedores/', document: uniqueRuc, documentType: 'RUC', kind: 'EMPRESA' },
  ]) {
    const name = `IMPORT UI LOCAL ${item.entity.toUpperCase()} ${importSuffix}`
    await page.goto(item.route)
    await page.getByRole('button', { name: 'Importar', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Importar ${item.entity} desde CSV` })
    await expect(dialog).toBeVisible()
    const [template] = await Promise.all([
      page.waitForEvent('download'), dialog.getByRole('button', { name: 'Descargar plantilla CSV' }).click(),
    ])
    expect(await fs.readFile(await template.path(), 'utf8')).toContain('external_id,tipo,tipo_documento')
    const input = dialog.locator('input[type="file"]')
    const header = 'external_id,tipo,tipo_documento,numero_documento,razon_social,email'
    const valid = `UI-${item.entity}-${importSuffix},${item.kind},${item.documentType},${item.document},${name},ui-local@example.test`
    await input.setInputFiles({ name: `${item.entity}-error.csv`, mimeType: 'text/csv',
      buffer: Buffer.from(`${header}\n${valid.replace('ui-local@example.test', 'correo-invalido')}\n`) })
    await expect(dialog.getByRole('alert')).toContainText('email')
    await expect(dialog.getByRole('button', { name: `Confirmar importación de ${item.entity}` })).toBeDisabled()
    if (item.entity === 'clientes') {
      const previewRoute = /\/api\/migration\/preview\/?$/
      await context.route(previewRoute, route => route.fulfill({ status: 503, json: { message: 'Interrupción local' } }))
      await input.setInputFiles({ name: 'clientes-interrumpido.csv', mimeType: 'text/csv',
        buffer: Buffer.from(`${header}\n${valid}\n`) })
      await expect(dialog.getByRole('alert')).toContainText('Interrupción local')
      await expect(dialog.getByRole('button', { name: `Confirmar importación de ${item.entity}` })).toBeDisabled()
      await context.unroute(previewRoute)
    }
    await input.setInputFiles({ name: `${item.entity}-ok.csv`, mimeType: 'text/csv',
      buffer: Buffer.from(`${header}\n${valid}\n`) })
    await expect(dialog.getByText('1 filas encontradas')).toBeVisible()
    await expect(dialog.getByRole('button', { name: `Confirmar importación de ${item.entity}` })).toBeEnabled()
    const [importResponse] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith(`/api/migration/${item.entity}/import`)
        && response.request().method() === 'POST'),
      dialog.getByRole('button', { name: `Confirmar importación de ${item.entity}` }).click(),
    ])
    expect(importResponse.status(), await importResponse.text()).toBe(201)
    await expect(dialog.getByRole('status').filter({ hasText: 'Importación completada' })).toContainText('1 creados')
    await dialog.getByRole('button', { name: 'Cerrar' }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('textbox', { name: 'Buscar' }).fill(name)
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible()
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar página (CSV)' }).click(),
    ])
    expect(await fs.readFile(await download.path(), 'utf8')).toContain(name)
    await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Editar' }).click()
    await expect(page).toHaveURL(/\/editar\/?$/, { timeout: 20000 })
    const masterId = new URL(page.url()).pathname.split('/').filter(Boolean).at(-2)!
    expect(masterId).toMatch(/^[0-9a-f-]{36}$/i)
    const editedName = `${name} EDITADO`
    await page.locator(item.entity === 'clientes' ? '#razon_social' : '#proveedorform-razon-social').fill(editedName)
    if (item.entity === 'clientes') page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: item.entity === 'clientes' ? 'Actualizar Cliente' : 'Actualizar Proveedor' }).click()
    await expect(page).not.toHaveURL(/\/editar\/?$/)
    await page.goto(item.route)
    await page.getByRole('textbox', { name: 'Buscar' }).fill(editedName)
    await expect(page.getByRole('row').filter({ hasText: editedName })).toBeVisible()
    const masterPath = item.entity === 'clientes' ? 'ventas/clientes' : 'compras/proveedores'
    const deleteRoute = new RegExp(`/api/${masterPath}/${masterId}/?$`)
    const nativeMessages: string[] = []
    const acceptNativeDialog = async (nativeDialog: Dialog) => {
      nativeMessages.push(nativeDialog.message())
      await nativeDialog.accept()
    }
    page.on('dialog', acceptNativeDialog)
    await page.route(deleteRoute, route => route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ message: 'Interrupción local de desactivación' }) }), { times: 1 })
    const editedRow = page.getByRole('row').filter({ hasText: editedName })
    const [failedDelete] = await Promise.all([
      page.waitForResponse(response => deleteRoute.test(new URL(response.url()).pathname) && response.request().method() === 'DELETE'),
      editedRow.getByRole('button', { name: 'Desactivar' }).click(),
    ])
    expect(failedDelete.status()).toBe(503)
    if (item.entity === 'clientes') {
      await expect.poll(() => nativeMessages.join('\n')).toContain('Interrupción local de desactivación')
      expect(nativeMessages.some(message => message.includes('desactivado correctamente'))).toBe(false)
    } else {
      await expect(page.getByText('Interrupción local de desactivación', { exact: false }).first()).toBeVisible()
      await expect(page.getByText('✅ Proveedor desactivado correctamente')).toHaveCount(0)
    }
    await expect(editedRow.getByRole('cell', { name: 'ACTIVO', exact: true })).toBeVisible()
    const activeResponse = await page.request.get(`${process.env.LOCAL_API_URL}/api/${masterPath}/${masterId}`, { headers })
    expect(activeResponse.ok(), await activeResponse.text()).toBeTruthy()
    const activeRaw = await activeResponse.json()
    expect((activeRaw.data ?? activeRaw).activo).toBe(true)
    const [deleted] = await Promise.all([
      page.waitForResponse(response => deleteRoute.test(new URL(response.url()).pathname) && response.request().method() === 'DELETE'),
      editedRow.getByRole('button', { name: 'Desactivar' }).click(),
    ])
    expect(deleted.status()).toBe(item.entity === 'clientes' ? 204 : 200)
    await expect(editedRow).toContainText('INACTIVO')
    await expect(editedRow.getByRole('button', { name: 'Desactivar' })).toHaveCount(0)
    await page.goto(item.route)
    await page.getByRole('textbox', { name: 'Buscar' }).fill(editedName)
    await expect(page.getByRole('row').filter({ hasText: editedName })).toContainText('INACTIVO')
    const inactiveResponse = await page.request.get(`${process.env.LOCAL_API_URL}/api/${masterPath}/${masterId}`, { headers })
    const inactiveRaw = await inactiveResponse.json()
    expect((inactiveRaw.data ?? inactiveRaw).activo).toBe(false)
    const [inactiveExport] = await Promise.all([
      page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar página (CSV)' }).click(),
    ])
    const inactiveCsv = await fs.readFile(await inactiveExport.path(), 'utf8')
    expect(inactiveCsv).toContain(editedName)
    expect(inactiveCsv).toContain(item.entity === 'clientes' ? 'INACTIVO' : 'false')
    page.off('dialog', acceptNativeDialog)
  }
})

test('Perú: primer administrador filtra usuarios por rol y estado con API real', async ({ page, context }) => {
  test.setTimeout(180000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  const evidence = JSON.parse(await fs.readFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'http.json'), 'utf8'))
  const onboarding = evidence.results.find((row: { scenario: string }) => row.scenario.startsWith('alta no demo y primer administrador'))
  const reader = evidence.results.find((row: { scenario: string }) => row.scenario.startsWith('primer ADMIN crea, reintenta, edita y busca usuario/rol'))
  expect(onboarding?.client_email && reader?.reader_email).toBeTruthy()
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/login/')
  await page.locator('#email').fill(onboarding.client_email)
  await page.locator('#password').fill('Cliente-Local-2026-Only!')
  await submitLocalLogin(page)
  await page.waitForURL('**/dashboard/**')
  await page.goto('/dashboard/usuarios/')
  await expect(page.getByRole('row').filter({ hasText: onboarding.client_email })).toBeVisible()
  const roleFilter = page.getByRole('combobox', { name: 'Filtro rol' })
  const adminRoleId = await roleFilter.locator('option').filter({ hasText: /^ADMIN$/ }).getAttribute('value')
  expect(adminRoleId).toMatch(/^[0-9a-f-]{36}$/i)
  const [roleResponse] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/usuarios-sistema')
      && new URL(response.url()).searchParams.get('rol') === adminRoleId),
    roleFilter.selectOption(adminRoleId!),
  ])
  expect(roleResponse.status()).toBe(200)
  await expect(page.getByRole('row').filter({ hasText: onboarding.client_email })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: reader.reader_email })).toHaveCount(0)
  await roleFilter.selectOption('todos')
  const [stateResponse] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/usuarios-sistema')
      && new URL(response.url()).searchParams.get('estado') === 'INACTIVO'),
    page.getByRole('combobox', { name: 'Filtro estado' }).selectOption('INACTIVO'),
  ])
  expect(stateResponse.status()).toBe(200)
  await expect(page.getByRole('row').filter({ hasText: reader.reader_email })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: onboarding.client_email })).toHaveCount(0)
  await page.reload()
  await page.getByRole('combobox', { name: 'Filtro estado' }).selectOption('INACTIVO')
  await expect(page.getByRole('row').filter({ hasText: reader.reader_email })).toBeVisible()
})

test('Perú: primer administrador reintenta cobro CxC con respuesta perdida sin duplicar y cierra caja', async ({ page, context }) => {
  test.setTimeout(180000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  const evidence = JSON.parse(await fs.readFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'http.json'), 'utf8'))
  const onboarding = evidence.results.find((row: { scenario: string }) => row.scenario.startsWith('alta no demo y primer administrador'))
  const opening = evidence.results.find((row: { scenario: string; cuenta_id?: string }) => row.scenario.startsWith('cxc_abiertas:'))
  const cashBox = evidence.results.find((row: { scenario: string; caja_id?: string }) => row.scenario.startsWith('primer cliente crea caja'))
  expect(onboarding?.client_email && opening?.cuenta_id && cashBox?.caja_id).toBeTruthy()
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/login/')
  await page.locator('#email').fill(onboarding.client_email)
  await page.locator('#password').fill('Cliente-Local-2026-Only!')
  const [login] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/auth/login') && response.status() === 201),
    submitLocalLogin(page),
  ])
  const auth = await login.json()
  const token = auth.access_token ?? auth.data?.access_token
  expect(token).toBeTruthy()
  const headers = { Authorization: `Bearer ${token}` }
  const detailResponse = await page.request.get(`${process.env.LOCAL_API_URL}/api/finanzas/cxc/${opening.cuenta_id}`, { headers })
  expect(detailResponse.ok(), await detailResponse.text()).toBeTruthy()
  const rawDetail = await detailResponse.json()
  const detail = rawDetail.data ?? rawDetail
  const due = Number(detail.saldo)
  expect(due).toBeGreaterThan(0)
  const openResponse = await page.request.post(`${process.env.LOCAL_API_URL}/api/pos/caja/abrir`, {
    headers, data: { monto_inicial: 100, caja_id: cashBox.caja_id, moneda: 'PEN', dispositivo: 'integrated-cxc-browser' },
  })
  expect(openResponse.status(), await openResponse.text()).toBe(201)
  const opened = await openResponse.json()
  expect(opened.data?.id).toBeTruthy()
  await page.goto('/dashboard/finanzas/cxc/')
  await page.getByPlaceholder('Serie, numero, cliente, moneda').fill(String(detail.numero))
  const row = page.getByRole('row').filter({ hasText: String(detail.numero) })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Cobro' }).click()
  const dialog = page.getByRole('dialog', { name: 'Registrar cobro' })
  await expect(dialog).toBeVisible()
  await dialog.locator('#metodo_pago').selectOption('EFECTIVO')
  await dialog.locator('#referencia').fill(`COBRO-UI-LOCAL-${randomUUID().slice(0, 8)}`)
  // El servidor local confirma el pago; sólo se pierde su respuesta al navegador.
  // La prueba usa PostgreSQL real y conserva la misma intención al reintentar.
  const paymentUrl = new RegExp(`/api/finanzas/cxc/${opening.cuenta_id}/pagos/?$`)
  let committedPayment: any
  let firstIntent: string | undefined
  await page.route(paymentUrl, async route => {
    firstIntent = route.request().postDataJSON().idempotency_key
    const committed = await route.fetch()
    expect(committed.status(), await committed.text()).toBe(201)
    committedPayment = await committed.json()
    await route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ success: false, message: 'Respuesta de cobro interrumpida; reintente la misma operación' }) })
  }, { times: 1 })
  const [lostResponse] = await Promise.all([
    page.waitForResponse(response => paymentUrl.test(new URL(response.url()).pathname) && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'Registrar cobro' }).click(),
  ])
  expect(lostResponse.status()).toBe(503)
  expect(firstIntent).toMatch(/^cxc-cobro:/)
  expect(committedPayment.data?.pago?.id).toBeTruthy()
  expect(committedPayment.data?.movimiento_caja?.id).toBeTruthy()
  await expect(dialog.getByRole('alert')).toContainText('Respuesta de cobro interrumpida')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('#monto')).toHaveValue(String(due))
  const uncertainResponse = await page.request.get(`${process.env.LOCAL_API_URL}/api/finanzas/cxc/${opening.cuenta_id}`, { headers })
  const uncertainRaw = await uncertainResponse.json()
  expect(Number((uncertainRaw.data ?? uncertainRaw).saldo)).toBe(0)
  expect((uncertainRaw.data ?? uncertainRaw).pagos).toHaveLength(1)
  const [paymentResponse] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith(`/api/finanzas/cxc/${opening.cuenta_id}/pagos`)
      && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'Registrar cobro' }).click(),
  ])
  expect(paymentResponse.status(), await paymentResponse.text()).toBe(201)
  const payment = await paymentResponse.json()
  expect(paymentResponse.request().postDataJSON().idempotency_key).toBe(firstIntent)
  expect(payment.data?.idempotent_replay).toBe(true)
  expect(payment.data?.pago?.id).toBe(committedPayment.data?.pago?.id)
  expect(payment.data?.movimiento_caja?.id).toBe(committedPayment.data?.movimiento_caja?.id)
  expect(payment.data?.movimiento_caja?.sesion_caja_id).toBe(opened.data.id)
  await expect(dialog).toBeHidden()
  await expect(row).toContainText('Cancelado')
  const paidResponse = await page.request.get(`${process.env.LOCAL_API_URL}/api/finanzas/cxc/${opening.cuenta_id}`, { headers })
  const paidRaw = await paidResponse.json()
  expect(Number((paidRaw.data ?? paidRaw).saldo)).toBe(0)
  expect((paidRaw.data ?? paidRaw).pagos).toHaveLength(1)
  const balanceResponse = await page.request.get(`${process.env.LOCAL_API_URL}/api/cajas/saldo-esperado/${opened.data.id}`, { headers })
  expect(balanceResponse.ok(), await balanceResponse.text()).toBeTruthy()
  const balance = await balanceResponse.json()
  expect(Number(balance.data.saldo)).toBeCloseTo(100 + due, 2)
  const closeResponse = await page.request.post(`${process.env.LOCAL_API_URL}/api/pos/caja/cerrar`, {
    headers, data: { sesion_id: opened.data.id, caja_id: cashBox.caja_id, monto_contado: balance.data.saldo,
      notas: 'Arqueo local tras cobro visual de CxC inicial' },
  })
  expect(closeResponse.status(), await closeResponse.text()).toBe(201)
  await fs.writeFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'browser-cxc-collection.json'), JSON.stringify({
    scenario: 'primer ADMIN no demo cobra saldo inicial, pierde respuesta y reintenta sin duplicar',
    first_response_status: 503, committed_payment_id: committedPayment.data.pago.id,
    replay_status: paymentResponse.status(), idempotent_replay: payment.data.idempotent_replay,
    payment_id: payment.data.pago.id, cash_movement_id: payment.data.movimiento_caja.id,
    payment_count: (paidRaw.data ?? paidRaw).pagos.length, final_balance: Number((paidRaw.data ?? paidRaw).saldo),
    cash_balance: Number(balance.data.saldo), expected_cash_balance: 100 + due, close_status: closeResponse.status(),
    external_browser_requests_blocked: true, local_only: true,
  }, null, 2))
})

test('Perú: ajuste con respuesta perdida, transferencia y kardex conservan existencias reales', async ({ page, context }) => {
  test.setTimeout(180000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  const evidence = JSON.parse(await fs.readFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'http.json'), 'utf8'))
  const owner = evidence.results.find((row: { scenario: string }) => row.scenario.startsWith('alta no demo y primer administrador'))
  const inventory = evidence.results.find((row: { scenario: string }) => row.scenario.startsWith('inventario: altas repetidas'))
  expect(owner?.client_email && inventory?.producto_id).toBeTruthy()
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/login/')
  await page.locator('#email').fill(owner.client_email)
  await page.locator('#password').fill('Cliente-Local-2026-Only!')
  const [login] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/auth/login') && response.status() === 201),
    submitLocalLogin(page),
  ])
  const auth = await login.json()
  const token = auth.access_token ?? auth.data?.access_token
  expect(token).toBeTruthy()
  const headers = { Authorization: `Bearer ${token}` }
  const getReal = async (endpoint: string) => {
    const response = await page.request.get(`${process.env.LOCAL_API_URL}/api/inventario/${endpoint}`, { headers })
    expect(response.ok()).toBeTruthy()
    return response.json()
  }
  const productBefore = (await getReal(`productos/${inventory.producto_id}`)).data
  const movementsBefore = (await getReal('movimientos?limit=500')).data.filter((row: { producto_id: string }) => row.producto_id === inventory.producto_id)
  const stockBefore = Number(productBefore.stock_actual)
  expect(stockBefore).toBe(12.25)
  await page.goto('/dashboard/inventario/operaciones/')
  await page.getByLabel('Producto del ajuste', { exact: true }).selectOption(inventory.producto_id)
  await page.getByLabel('Almacén del ajuste', { exact: true }).selectOption(inventory.almacen_origen_id)
  await page.getByLabel('Diferencia del ajuste', { exact: true }).fill('1.5')
  await page.getByLabel('Motivo del ajuste', { exact: true }).fill('Conteo desde navegador local')
  const adjustmentRoute = /\/api\/inventario\/movimientos\/?$/
  let originalIntent: { idempotency_key: string } | undefined
  await page.route(adjustmentRoute, async route => {
    originalIntent = route.request().postDataJSON()
    const committed = await route.fetch()
    expect(committed.status()).toBe(201)
    await route.fulfill({ status: 503, json: { message: 'Respuesta de ajuste perdida después del commit local' } })
  }, { times: 1 })
  await page.getByRole('button', { name: 'Registrar ajuste y asiento', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Respuesta de ajuste perdida' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'registrado' })).toHaveCount(0)
  await expect(page.getByLabel('Diferencia del ajuste', { exact: true })).toHaveValue('1.5')
  expect(Number((await getReal(`productos/${inventory.producto_id}`)).data.stock_actual)).toBe(stockBefore + 1.5)
  const [retried] = await Promise.all([
    page.waitForResponse(response => adjustmentRoute.test(new URL(response.url()).pathname) && response.request().method() === 'POST' && response.status() === 201),
    page.getByRole('button', { name: 'Registrar ajuste y asiento', exact: true }).click(),
  ])
  expect(retried.request().postDataJSON().idempotency_key).toBe(originalIntent!.idempotency_key)
  await expect(page.getByRole('status').filter({ hasText: 'registrado' })).toBeVisible()
  expect(Number((await getReal(`productos/${inventory.producto_id}`)).data.stock_actual)).toBe(stockBefore + 1.5)
  expect((await getReal('movimientos?limit=500')).data.filter((row: { producto_id: string }) => row.producto_id === inventory.producto_id)).toHaveLength(movementsBefore.length + 1)
  await page.getByRole('tab', { name: 'Transferencia entre almacenes' }).click()
  await page.getByLabel('Producto de la transferencia', { exact: true }).selectOption(inventory.producto_id)
  await page.getByLabel('Almacén de origen', { exact: true }).selectOption(inventory.almacen_origen_id)
  await page.getByLabel('Almacén de destino', { exact: true }).selectOption(inventory.almacen_destino_id)
  await page.getByLabel('Cantidad a transferir', { exact: true }).fill('2')
  await page.getByLabel('Motivo de la transferencia', { exact: true }).fill('Traslado desde navegador local')
  const [transferred] = await Promise.all([
    page.waitForResponse(response => /\/api\/inventario\/transferencias\/?$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Confirmar transferencia', exact: true }).click(),
  ])
  expect(transferred.status()).toBe(201)
  await expect(page.getByRole('status').filter({ hasText: 'Transferencia confirmada' })).toBeVisible()
  expect(Number((await getReal(`productos/${inventory.producto_id}`)).data.stock_actual)).toBe(stockBefore + 1.5)
  expect((await getReal('movimientos?limit=500')).data.filter((row: { producto_id: string }) => row.producto_id === inventory.producto_id)).toHaveLength(movementsBefore.length + 3)
  await page.reload()
  await page.goto('/dashboard/inventario/kardex/')
  await page.getByLabel('Producto', { exact: true }).selectOption(inventory.producto_id)
  await page.getByLabel('Almacén', { exact: true }).selectOption(inventory.almacen_destino_id)
  const [kardex] = await Promise.all([
    page.waitForResponse(response => /\/api\/inventario\/kardex\/?$/.test(new URL(response.url()).pathname)
      && new URL(response.url()).searchParams.get('productoId') === inventory.producto_id
      && new URL(response.url()).searchParams.get('almacenId') === inventory.almacen_destino_id),
    page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click(),
  ])
  expect(kardex.status()).toBe(200)
  const ledger = await kardex.json()
  expect(Number(ledger.resumen.saldoCantidad)).toBe(6.5)
  await expect(page.getByRole('row').filter({ hasText: productBefore.nombre }).first()).toBeVisible()
  const navigation = page.locator('aside nav')
  for (const name of ['Productos', 'Ventas', 'Finanzas']) {
    const button = navigation.getByRole('button', { name, exact: true })
    if (await button.count() && await button.locator('..').locator('a').count() === 0) await button.click()
  }
  const links = await navigation.locator('a').evaluateAll(anchors => anchors.map(anchor => ({
    label: anchor.textContent?.trim(), href: anchor.getAttribute('href')?.replace(/\/$/, ''),
  })).filter(row => row.href && !row.href.startsWith('/dashboard/analytics')))
  for (const href of ['/dashboard/gre', '/dashboard/sire', '/dashboard/cpe', '/dashboard/inventario/operaciones']) {
    expect(links.some(row => row.href === href)).toBeTruthy()
  }
  await fs.writeFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'peru-navigation-admin.json'), JSON.stringify({
    country: 'PE', role: 'ADMIN', tenant_kind: 'first_client_non_demo', excluded: ['Analytics'], links,
    limits: 'Enlaces realmente renderizados con las banderas del ensayo; las acciones internas requieren la matriz por operación.',
  }, null, 2))
  await fs.writeFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'browser-inventory.json'), JSON.stringify({
    producto_id: inventory.producto_id, initial_stock: stockBefore, final_stock: stockBefore + 1.5,
    destination_stock: 6.5, added_ledger_rows: 3, response_lost_after_local_commit: true, same_intent_replayed: true,
  }, null, 2))
})

test('Perú: reembolso RMA recupera catálogos, respuesta perdida y asiento sin duplicar', async ({ page, context }) => {
  test.setTimeout(180000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  const evidence = JSON.parse(await fs.readFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'http.json'), 'utf8'))
  const paid = evidence.results.find((row: { scenario: string }) => row.scenario.startsWith('RMA pagada: saldo se aplica'))
  expect(paid?.saldo_favor_id && paid?.banco_id && paid?.rma_number).toBeTruthy()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/login/')
  await page.locator('#email').fill('peru-integrated-1@example.test')
  await page.locator('#password').fill('Local-Peru-2026-Only!')
  const [login] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/auth/login') && response.status() === 201),
    submitLocalLogin(page),
  ])
  const auth = await login.json()
  const headers = { Authorization: `Bearer ${auth.access_token ?? auth.data?.access_token}` }
  const getReal = async (endpoint: string) => {
    const response = await page.request.get(`${process.env.LOCAL_API_URL}/api/${endpoint}`, { headers })
    expect(response.status()).toBe(200)
    const value = await response.json()
    return value.data ?? value
  }
  const saldoBefore = await getReal(`ventas/rma/saldos-favor/${paid.saldo_favor_id}`)
  const bankBefore = await getReal(`finanzas/bancos/cuentas/${paid.banco_id}`)
  expect(Number(saldoBefore.monto_disponible)).toBeCloseTo(paid.saldo_disponible, 2)
  await page.goto('/dashboard/ventas/rma/')
  await page.getByRole('button', { name: 'Saldos a favor', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: paid.rma_number })
  await expect(row).toBeVisible()
  const resourcesUrl = /\/api\/ventas\/rma\/medios-reembolso\/?$/
  let interruptCatalog = true
  let catalogFailures = 0
  await page.route(resourcesUrl, route => {
    if (!interruptCatalog) return route.continue()
    catalogFailures++
    return route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ message: 'Medios de reembolso temporalmente interrumpidos' }) })
  })
  await row.getByRole('button', { name: 'Reembolsar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Reembolsar saldo a favor', exact: true })
  await expect(dialog.getByRole('alert')).toContainText('No se pudieron cargar las opciones')
  await expect(dialog.getByRole('button', { name: 'Confirmar', exact: true })).toBeDisabled()
  await expect(dialog.getByLabel('Medio', { exact: true }).locator('option')).toHaveCount(1)
  expect(catalogFailures).toBeGreaterThan(0)
  interruptCatalog = false
  const [resources] = await Promise.all([
    page.waitForResponse(response => resourcesUrl.test(new URL(response.url()).pathname) && response.status() === 200),
    dialog.getByRole('button', { name: 'Reintentar carga', exact: true }).click(),
  ])
  expect(resources.status()).toBe(200)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByLabel('Monto', { exact: true }).fill('4')
  await dialog.getByLabel('Medio', { exact: true }).selectOption(paid.banco_id)
  await dialog.getByLabel('Operación o transferencia', { exact: true }).fill('RMA-UI-REEMBOLSO-LOCAL')
  const refundUrl = new RegExp(`/api/ventas/rma/saldos-favor/${paid.saldo_favor_id}/reembolsar/?$`)
  let committed: any
  let firstIntent: string | undefined
  await page.route(refundUrl, async route => {
    firstIntent = route.request().headers()['idempotency-key']
    const response = await route.fetch()
    expect(response.status(), await response.text()).toBe(201)
    const value = await response.json()
    committed = value.data ?? value
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
      message: 'Respuesta de reembolso interrumpida; reintente la misma operación',
    }) })
  }, { times: 1 })
  const [lost] = await Promise.all([
    page.waitForResponse(response => refundUrl.test(new URL(response.url()).pathname) && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'Confirmar', exact: true }).click(),
  ])
  expect(lost.status()).toBe(503)
  expect(firstIntent).toMatch(/^rma-ui:saldo-reembolsar:/)
  await expect(page.getByText('Respuesta de reembolso interrumpida; reintente la misma operación', { exact: true })).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Monto', { exact: true })).toHaveValue('4')
  expect(Number((await getReal(`ventas/rma/saldos-favor/${paid.saldo_favor_id}`)).monto_disponible)).toBeCloseTo(paid.saldo_disponible - 4, 2)
  expect(Number((await getReal(`finanzas/bancos/cuentas/${paid.banco_id}`)).saldo)).toBeCloseTo(Number(bankBefore.saldo) - 4, 2)
  const [replayResponse] = await Promise.all([
    page.waitForResponse(response => refundUrl.test(new URL(response.url()).pathname) && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'Confirmar', exact: true }).click(),
  ])
  expect(replayResponse.status()).toBe(201)
  expect(replayResponse.request().headers()['idempotency-key']).toBe(firstIntent)
  const replayRaw = await replayResponse.json()
  const replay = replayRaw.data ?? replayRaw
  expect(replay.idempotent).toBe(true)
  expect(replay.movimiento_id).toBe(committed.movimiento_id)
  await expect(dialog).toBeHidden()
  await page.reload()
  await page.getByRole('button', { name: 'Saldos a favor', exact: true }).click()
  await expect(row).toContainText(/12[.,]60/)
  const saldoAfter = await getReal(`ventas/rma/saldos-favor/${paid.saldo_favor_id}`)
  expect(Number(saldoAfter.monto_disponible)).toBeCloseTo(paid.saldo_disponible - 4, 2)
  expect(saldoAfter.movimientos.filter((movement: { id: string }) => movement.id === committed.movimiento_id)).toHaveLength(1)
  expect(Number((await getReal(`finanzas/bancos/cuentas/${paid.banco_id}`)).saldo)).toBeCloseTo(Number(bankBefore.saldo) - 4, 2)
  expect(committed.event_id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
  await consumeLocalAccounting('browser-rma-accounting')
  const entryQuery = `SELECT count(*) FROM asientos_contables WHERE source_event_id='${committed.event_id}'::uuid
    AND estado='CONFIRMADO' AND total_debe=4 AND total_haber=4;`
  expect(readLocalSql(entryQuery)).toBe('1')
  await consumeLocalAccounting('browser-rma-accounting-replay')
  expect(readLocalSql(entryQuery)).toBe('1')
  expect(errors).toEqual([])
  await fs.writeFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'browser-rma-refund.json'), JSON.stringify({
    rma_id: paid.rma_id, saldo_favor_id: paid.saldo_favor_id, amount: 4, first_response_status: 503,
    same_intent_replayed: true, movement_id: committed.movimiento_id, event_id: committed.event_id,
    final_available: Number(saldoAfter.monto_disponible), accounting_entry_count: 1,
    catalog_failure_recovered: true, catalog_failed_requests: catalogFailures,
    external_browser_requests_blocked: true, local_only: true,
  }, null, 2))
})

test('Perú: primer administrador recupera asiento manual perdido, edita, confirma y reversa sin duplicar', async ({ page, context }) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(20000)
  const evidence = JSON.parse(await fs.readFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'http.json'), 'utf8'))
  const onboarding = evidence.results.find((row: { scenario: string }) => row.scenario.startsWith('alta no demo y primer administrador'))
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/login/')
  await page.locator('#email').fill(onboarding.client_email)
  await page.locator('#password').fill('Cliente-Local-2026-Only!')
  const [login] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/auth/login') && response.status() === 201),
    submitLocalLogin(page),
  ])
  const auth = await login.json()
  const headers = { Authorization: `Bearer ${auth.access_token ?? auth.data?.access_token}` }
  const api = process.env.LOCAL_API_URL!
  const accountsResponse = await page.request.get(`${api}/api/contabilidad/plan-cuentas`, { headers })
  expect(accountsResponse.status()).toBe(200)
  const accounts = (await accountsResponse.json()).data
  const expense = accounts.find((account: { codigo: string }) => account.codigo === '63')
  const bank = accounts.find((account: { codigo: string }) => account.codigo === '1041')
  expect(expense?.id && bank?.id).toBeTruthy()
  await page.goto('/dashboard/contabilidad/asientos/nuevo/')
  await expect(page.getByRole('heading', { name: 'Nuevo asiento contable manual', exact: true })).toBeVisible({ timeout: 30000 })
  const tenantId = auth.user?.tenant_id ?? auth.data?.user?.tenant_id
  expect(tenantId).toMatch(/^[0-9a-f-]{36}$/i)
  const calendarDate = readLocalSql(`SELECT app.hoy_tenant('${tenantId}'::uuid)::text;`)
  await expect(page.locator('#asiento-form-fecha')).toHaveValue(calendarDate)
  await page.getByRole('checkbox', { name: /Guardar como borrador/ }).check()
  await page.locator('#asiento-form-concepto').fill('Asiento UI con respuesta perdida')
  const accountSelects = page.getByRole('combobox', { name: /^Cuenta/ })
  await accountSelects.nth(0).selectOption(expense.id)
  await accountSelects.nth(1).selectOption(bank.id)
  await page.getByLabel('Debe', { exact: true }).nth(0).fill('17')
  await page.getByLabel('Haber', { exact: true }).nth(1).fill('17')
  await page.getByPlaceholder('Descripcion del movimiento', { exact: true }).nth(0).fill('Gasto UI')
  await page.getByPlaceholder('Descripcion del movimiento', { exact: true }).nth(1).fill('Banco UI')
  const endpoint = /\/api\/contabilidad\/asiento-contable\/?$/
  let committed: any
  let intent: string | undefined
  await page.route(endpoint, async route => {
    intent = route.request().headers()['idempotency-key']
    const response = await route.fetch()
    expect(response.status(), await response.text()).toBe(201)
    committed = (await response.json()).data
    await route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ message: 'Respuesta del asiento interrumpida; reintente la misma operación' }) })
  }, { times: 1 })
  const submit = page.getByRole('button', { name: 'Guardar asiento', exact: true })
  const [lost] = await Promise.all([
    page.waitForResponse(response => endpoint.test(new URL(response.url()).pathname) && response.request().method() === 'POST'), submit.click(),
  ])
  expect(lost.status()).toBe(503)
  expect(intent).toMatch(/^asiento-ui:[0-9a-f-]{36}$/)
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Respuesta del asiento interrumpida')
  await expect(page.getByLabel('Debe', { exact: true }).nth(0)).toHaveValue('17')
  const [replay] = await Promise.all([
    page.waitForResponse(response => endpoint.test(new URL(response.url()).pathname) && response.request().method() === 'POST'), submit.click(),
  ])
  expect(replay.status()).toBe(201)
  expect(replay.request().headers()['idempotency-key']).toBe(intent)
  expect((await replay.json()).data.id).toBe(committed.id)
  await page.waitForURL(`**/contabilidad/asientos/${committed.id}/`)
  await page.reload()
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await expect(page.locator('#asiento-form-concepto')).toHaveValue('Asiento UI con respuesta perdida')
  await page.getByLabel('Debe', { exact: true }).nth(0).fill('20')
  await page.getByLabel('Haber', { exact: true }).nth(1).fill('20')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await page.waitForURL(`**/contabilidad/asientos/${committed.id}/`)
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar PDF', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^asiento-.*\.pdf$/)
  const pdfPath = path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'manual-asiento-ui.pdf')
  await download.saveAs(pdfPath)
  const pdf = await fs.readFile(pdfPath)
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdf.length).toBeGreaterThan(1500)
  expect(pdf.toString('latin1')).toContain('20.00')
  await page.getByRole('button', { name: 'Reversar', exact: true }).click()
  await page.locator('#id-motivo').fill('Reversión UI local')
  const [reversed] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith(`/api/contabilidad/asientos/${committed.id}/reversar`)
      && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Crear reversión', exact: true }).click(),
  ])
  expect(reversed.status()).toBe(201)
  const detail = await page.request.get(`${api}/api/contabilidad/asientos/${committed.id}`, { headers })
  expect(detail.status()).toBe(200)
  const original = (await detail.json()).data
  expect(Number(original.total_debe)).toBe(20)
  expect(original.estado).toBe('CONFIRMADO')
  expect(original.reversado_por_asiento_id).toBeTruthy()
  expect(readLocalSql(`SELECT count(*) FROM financial_master_operations WHERE operation_type='ACCOUNTING_MANUAL_CREATE'
    AND idempotency_key='${intent}' AND record_id='${committed.id}'::uuid;`)).toBe('1')
  expect(errors).toEqual([])
  await fs.writeFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'browser-manual-accounting.json'), JSON.stringify({
    asiento_id: committed.id, reversa_id: original.reversado_por_asiento_id, first_response_status: 503,
    same_intent_replayed: true, initial_amount: 17, corrected_amount: 20,
    confirmed_original_preserved: true, pdf_downloaded: true, pdf_amount_verified: 20,
    default_date_matches_tenant_calendar: calendarDate,
    local_only: true, external_browser_requests_blocked: true,
  }, null, 2))
})

test('Perú: crea centro de costo y conserva un presupuesto al editar y recargar', async ({ page, context }) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(20000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/login/')
  await page.locator('#email').fill('peru-integrated-2@example.test')
  await page.locator('#password').fill('Local-Peru-2026-Only!')
  await submitLocalLogin(page)
  await page.waitForURL('**/dashboard/**')
  await page.goto('/dashboard/contabilidad/centros-costo/nuevo/')
  const centerCode = `LOCAL-${Date.now()}-${test.info().retry}`
  const centerName = `Centro presupuesto ${centerCode}`
  await page.locator('#nuevo-codigo').fill(centerCode)
  await page.locator('#nuevo-nombre').fill(centerName)
  const [createdCenter] = await Promise.all([
    page.waitForResponse(r => /\/contabilidad\/centros-costo\/?$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Crear Centro de Costo', exact: true }).click(),
  ])
  expect(createdCenter.ok(), await createdCenter.text()).toBeTruthy()
  const center = (await createdCenter.json()).data
  await page.waitForURL('**/contabilidad/centros-costo/')
  await expect(page.getByText(centerName, { exact: true }).first()).toBeVisible()
  await page.goto('/dashboard/contabilidad/presupuestos/nuevo/')
  await page.locator('#presupuesto-form-centro-costo-id').selectOption(center.id)
  for (const selector of ['#presupuesto-form-cuenta-id', '#presupuesto-form-periodo-contable-id']) {
    const options = page.locator(`${selector} option:not([value=""])`)
    await expect.poll(() => options.count()).toBeGreaterThan(0)
    await page.locator(selector).selectOption((await options.first().getAttribute('value'))!)
  }
  await page.locator('#presupuesto-form-monto-presupuestado').fill('1250.50')
  await page.locator('#presupuesto-form-notas').fill('Presupuesto local verificable')
  const [createdBudget] = await Promise.all([
    page.waitForResponse(r => /\/contabilidad\/presupuestos\/?$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Crear Presupuesto', exact: true }).click(),
  ])
  expect(createdBudget.ok(), await createdBudget.text()).toBeTruthy()
  const budget = (await createdBudget.json()).data
  expect(Number(budget.monto_presupuestado)).toBe(1250.5)
  await page.waitForURL('**/presupuestos/lista/')
  const row = page.getByRole('row').filter({ hasText: centerName })
  await expect(row).toBeVisible()
  await row.getByTitle('Editar', { exact: true }).click()
  await page.waitForURL(`**/presupuestos/${budget.id}/`)
  await expect(page.locator('#presupuesto-form-monto-presupuestado')).toHaveValue('1250.5', { timeout: 20000 })
  await page.locator('#presupuesto-form-monto-presupuestado').fill('1500.75')
  const [updated] = await Promise.all([
    page.waitForResponse(r => r.url().includes(`/contabilidad/presupuestos/${budget.id}`) && r.request().method() === 'PUT'),
    page.getByRole('button', { name: 'Actualizar Presupuesto', exact: true }).click(),
  ])
  expect(updated.ok(), await updated.text()).toBeTruthy()
  await page.waitForURL('**/presupuestos/lista/')
  await row.getByTitle('Editar', { exact: true }).click()
  await page.waitForURL(`**/presupuestos/${budget.id}/`)
  await page.reload()
  await expect(page.locator('#presupuesto-form-monto-presupuestado')).toHaveValue('1500.75')
  await page.goto(`/dashboard/contabilidad/centros-costo/${center.id}/`)
  const accountRow = page.getByRole('row').filter({ hasText: 'Compras' })
  await expect(accountRow).toBeVisible()
  await expect(accountRow).toContainText('60')
  await expect(accountRow).toContainText('1,500.75')
  await page.screenshot({ path: path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'budget-account-detail.png'), fullPage: true })
  await page.goto(`/dashboard/contabilidad/presupuestos/${budget.id}/`)
  await expect(page.locator('#presupuesto-form-monto-presupuestado')).toHaveValue('1500.75')
  await expect(page.locator('#presupuesto-form-centro-costo-id')).toHaveValue(center.id)
  await page.screenshot({ path: path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'budget-persistence.png'), fullPage: true })
  const accountsUrl = /\/api\/contabilidad\/plan-cuentas\/?(\?.*)?$/
  await context.route(accountsUrl, route => route.fulfill({ status: 503, json: { message: 'Fallo local de catálogo' } }))
  await page.reload()
  await expect(page.getByRole('alert').filter({ hasText: 'catálogos del presupuesto' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Actualizar Presupuesto', exact: true })).toBeDisabled()
  await context.unroute(accountsUrl)
  const [recoveredAccounts] = await Promise.all([
    page.waitForResponse(r => accountsUrl.test(r.url()) && r.request().method() === 'GET' && r.status() === 200),
    page.getByRole('button', { name: 'Reintentar catálogos', exact: true }).click(),
  ])
  expect((await recoveredAccounts.json()).success).toBe(true)
  await expect(page.getByRole('alert').filter({ hasText: 'catálogos del presupuesto' })).toBeHidden({ timeout: 20000 })
  await expect(page.getByRole('button', { name: 'Actualizar Presupuesto', exact: true })).toBeEnabled({ timeout: 20000 })
  await expect(page.locator('#presupuesto-form-monto-presupuestado')).toHaveValue('1500.75')
  expect(failures).toEqual([])
})

test('Perú: candidato conserva perfil y vacante después de crear, editar y recargar', async ({ page, context }) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(20000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  await page.goto('/login/')
  await page.locator('#email').fill('peru-integrated-2@example.test')
  await page.locator('#password').fill('Local-Peru-2026-Only!')
  const [login] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/auth/login') && r.status() === 201), submitLocalLogin(page),
  ])
  const auth = await login.json()
  const token = auth.access_token ?? auth.data?.access_token
  expect(token).toBeTruthy()
  // Preparación local por API. El recorrido de candidato sí se hace desde UI.
  const vacancyResponse = await page.request.post(`${process.env.LOCAL_API_URL}/api/rrhh/vacantes`, {
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': 'browser-candidate-vacancy-543' },
    data: { titulo: 'Vacante local 543', puesto_solicitado: 'Analista', estado: 'activa' },
  })
  expect(vacancyResponse.ok(), await vacancyResponse.text()).toBeTruthy()
  const vacancy = (await vacancyResponse.json()).data
  await page.waitForURL('**/dashboard/**')
  await page.goto('/dashboard/rrhh/candidatos/')
  await page.getByRole('button', { name: 'Nuevo Candidato', exact: true }).click()
  await page.locator('#candidatos-nombres').fill('AnaPerfil543')
  await page.locator('#candidatos-apellidos').fill('Prueba Local')
  await page.locator('#candidatos-email').fill('perfil543@example.test')
  await page.locator('#candidatos-id-vacante').selectOption(vacancy.id)
  await page.locator('#candidatos-experiencia-anos').fill('5')
  await page.locator('#candidatos-estado-civil').selectOption('casado')
  const [created] = await Promise.all([
    page.waitForResponse(r => /\/rrhh\/candidatos\/?$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Registrar Candidato', exact: true }).click(),
  ])
  expect(created.ok(), await created.text()).toBeTruthy()
  const row = page.getByRole('row').filter({ hasText: 'AnaPerfil543' })
  await expect(row).toContainText('Vacante local 543')
  await row.getByRole('button', { name: 'Editar candidato', exact: true }).click()
  await expect(page.locator('#candidatos-experiencia-anos')).toHaveValue('5')
  await expect(page.locator('#candidatos-estado-civil')).toHaveValue('casado')
  await page.locator('#candidatos-experiencia-anos').fill('6')
  await page.locator('#candidatos-estado-civil').selectOption('divorciado')
  const [updated] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/rrhh/candidatos/') && r.request().method() === 'PUT'),
    page.getByRole('button', { name: 'Actualizar Candidato', exact: true }).click(),
  ])
  expect(updated.ok(), await updated.text()).toBeTruthy()
  await expect(page.locator('#candidatos-nombres')).toHaveCount(0)
  await page.reload()
  await row.getByRole('button', { name: 'Editar candidato', exact: true }).click()
  await expect(page.locator('#candidatos-experiencia-anos')).toHaveValue('6')
  await expect(page.locator('#candidatos-estado-civil')).toHaveValue('divorciado')
  await expect(page.locator('#candidatos-id-vacante')).toHaveValue(vacancy.id)
  await page.screenshot({ path: path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'candidate-profile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await page.getByRole('combobox', { name: 'Filtrar candidatos por vacante' }).click()
  await page.getByRole('option', { name: 'Vacante local 543', exact: true }).click()
  await expect(row).toBeVisible()
  // Fallo de lectura inyectado sólo después de verificar la persistencia real.
  const candidateList = /\/api\/rrhh\/candidatos\/?$/
  await context.route(candidateList, route => route.fulfill({ status: 503, json: { message: 'Fallo local de prueba' } }))
  await page.reload()
  await expect(page.getByRole('alert').filter({ hasText: 'información puede estar incompleta' })).toBeVisible()
  await context.unroute(candidateList)
  await page.getByRole('button', { name: 'Reintentar carga', exact: true }).click()
  await expect(row).toBeVisible()
  await expect(page.getByText('La información puede estar incompleta.', { exact: false })).toHaveCount(0)
  expect(failures).toEqual([])
})

test('Perú: superadministrador cambia de empresa y conserva la sesión al recargar', async ({ page, context }) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(20000)
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname
    if (pathname.includes('/api/') && response.status() >= 400 && !isHandledHttpResponse({ path: pathname, status: response.status() })) {
      failures.push(`${response.status()} ${pathname}`)
    }
  })
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1' || process.env.E2E_ISOLATED_BROWSER === '1') {
    throw new Error('Esta prueba exige API y PostgreSQL locales reales')
  }
  await context.route('**/*', route => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost', '[::1]'].includes(host) ? route.continue() : route.abort('blockedbyclient')
  })
  await page.goto('/login/')
  await page.locator('#email').fill('peru-integrated-support-1@example.test')
  await page.locator('#password').fill('Local-Peru-2026-Only!')
  await submitLocalLogin(page)
  await page.waitForURL('**/superadmin/**')
  await page.goto('/superadmin/dashboard/')
  await page.getByRole('combobox', { name: 'Empresa activa', exact: true }).click()
  const [switched] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/auth/switch-tenant') && response.request().method() === 'POST'),
    page.getByRole('option', { name: 'Integración local Perú 2', exact: true }).click(),
  ])
  expect(switched.status()).toBe(201)
  await expect(page.getByRole('combobox', { name: 'Empresa activa', exact: true })).toContainText('Integración local Perú 2')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Empresa activa', exact: true })).toContainText('Integración local Perú 2')
  await expect(page.getByText('Cargando tenants...', { exact: true })).toHaveCount(0)
  await expect(page.getByText('...', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Integración local Perú 1', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('En prueba', { exact: true }).filter({ visible: true })).toHaveCount(2)
  const output = path.resolve(process.env.LOCAL_INTEGRATED_OUTPUT_DIR || '../../artifacts/peru-integrated-local')
  await page.screenshot({ path: path.join(output, 'auth-tenant-switch.png'), fullPage: true })
  expect(failures).toEqual([])
})

test('Perú: consulta y filtra la auditoría de recepciones con la API real', async ({ page, context }) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(20000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1' || process.env.E2E_ISOLATED_BROWSER === '1') {
    throw new Error('Esta prueba exige API y PostgreSQL locales reales')
  }
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? route.continue() : route.abort('blockedbyclient')
  })
  await page.goto('/login/')
  await page.locator('#email').fill('peru-integrated-auditor-1@example.test')
  await page.locator('#password').fill('Local-Peru-2026-Only!')
  await submitLocalLogin(page)
  await page.waitForURL('**/dashboard/**')
  await page.goto('/dashboard/audit-logs/')
  await expect(page.getByRole('heading', { name: 'Logs de Auditoría', exact: true })).toBeVisible({ timeout: 30000 })
  const [loaded] = await Promise.all([
    page.waitForResponse(response => response.url().includes('/api/audit-logs') && response.url().includes('table_name=recepciones')),
    page.getByRole('combobox', { name: 'Tabla', exact: true }).selectOption('recepciones'),
  ])
  expect(loaded.status()).toBe(200)
  const actorSelector = page.getByRole('combobox', { name: 'Usuario', exact: true })
  const primaryActor = actorSelector.locator('option').filter({ hasText: 'peru-integrated-1@example.test' })
  await expect(primaryActor).toHaveCount(1)
  const actorId = await primaryActor.getAttribute('value')
  expect(actorId).toBeTruthy()
  const [filtered] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/audit-logs') && new URL(response.url()).searchParams.get('user_id') === actorId),
    actorSelector.selectOption(actorId!),
  ])
  expect(filtered.status()).toBe(200)
  await expect(page.getByText('recepciones', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/Auditoría incompleta|Error al cargar logs/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Ver detalles', exact: true }).first().click()
  await expect(page.getByText('Valores nuevos', { exact: true }).first()).toBeVisible()
  await expect(page.locator('pre').filter({ hasText: 'backend_audit_542' }).first()).toBeVisible()
  const output = path.resolve(process.env.LOCAL_INTEGRATED_OUTPUT_DIR || '../../artifacts/peru-integrated-local')
  await page.screenshot({ path: path.join(output, 'audit-receipt.png'), fullPage: true })
  // Inyección explícita de un fallo parcial de lectura, después del recorrido
  // real. Comprueba que la UI avisa y se recupera; no acredita un fallo real DB.
  const auditUrl = /\/api\/audit-logs\/?\?/
  await context.route(auditUrl, async route => {
    const response = await route.fetch()
    const body = await response.json()
    const payload = body.pagination ? body : body.data
    payload.fuentes_fallidas = ['auth_login_attempts']
    await route.fulfill({ response, json: body })
  })
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Auditoría incompleta' })).toBeVisible()
  await context.unroute(auditUrl)
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect(page.getByText(/Auditoría incompleta/)).toHaveCount(0)
  expect(failures).toEqual([])
})

test('Perú: login y POS usan la API y base efímera reales', async ({ page, context }, testInfo) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(20000)
  page.setDefaultNavigationTimeout(30000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1' || process.env.E2E_ISOLATED_BROWSER === '1') {
    throw new Error('Esta prueba exige API y PostgreSQL locales reales')
  }
  const failures: string[] = []
  const outputDir = path.resolve(process.env.LOCAL_INTEGRATED_OUTPUT_DIR || '../../artifacts/peru-integrated-local')
  await fs.mkdir(outputDir, { recursive: true })
  const responses: Array<{ path: string; status: number; body?: string }> = []
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.abort('blockedbyclient')
    return route.continue()
  })
  page.on('pageerror', error => failures.push(error.message))
  page.on('response', async response => {
    const url = new URL(response.url())
    if (!url.pathname.includes('/api/') && !url.pathname.startsWith('/backend/')) return
    const entry: { path: string; status: number; body?: string } = { path: url.pathname, status: response.status() }
    if (response.status() >= 400) entry.body = (await response.text().catch(() => '')).slice(0, 1500)
    responses.push(entry)
  })
  await page.goto('/login/')
  await page.locator('#email').fill('peru-integrated-1@example.test')
  await page.locator('#password').fill('Local-Peru-2026-Only!')
  await submitLocalLogin(page)
  await page.screenshot({ path: testInfo.outputPath('login-submitted.png') })
  await page.waitForURL('**/dashboard/**', { timeout: 30000 })
  await page.waitForLoadState('networkidle')
  await page.goto('/dashboard/pos/')
  await page.waitForLoadState('networkidle')
  // El recorrido HTTP deja la caja cerrada. Esperar la pantalla hidratada:
  // networkidle por sí solo puede terminar antes de que React muestre el botón.
  const openCash = page.getByRole('button', { name: 'Abrir Caja Registradora', exact: true })
  await expect(openCash).toBeVisible({ timeout: 30000 })
  await openCash.click()
  await page.locator('#monto-inicial-caja').fill('100')
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await page.screenshot({ path: path.join(outputDir, 'pos.png'), fullPage: true })
  await testInfo.attach('HTTP real', { body: JSON.stringify(responses, null, 2), contentType: 'application/json' })
  await expect(page.getByText('Cuaderno A4 96 hojas', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Cliente de la venta' }).selectOption({ label: 'Juan Perez Demo · 12345678' })
  await page.getByLabel('Buscar productos').fill('Cuaderno A4')
  await page.getByRole('button', { name: 'Agregar Cuaderno A4 96 hojas', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('pos-cart.png'), fullPage: true })
  await page.getByRole('button', { name: /^Cobrar/ }).click()
  await page.getByRole('button', { name: 'Efectivo', exact: true }).click()
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('10.50')
  const saleResponse = page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/pos/venta') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click()
  const response = await saleResponse
  expect(response.status()).toBe(201)
  const sale = await response.json()
  expect(sale.success).toBe(true)
  expect(sale.tipo_emision).toBe('TICKET')
  expect(sale.total).toBe(10.5)
  expect(sale.cpe_id).toBeNull()
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Ticket interno listo para canje', { exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(outputDir, 'ticket.png'), fullPage: true })
  await fs.writeFile(path.join(outputDir, 'browser-sale.json'), JSON.stringify({ venta_id: sale.venta_id, numero_ticket: sale.numero_ticket, total: sale.total, accounting_event_id: sale.accounting_event_id, responses, failures, text: await page.locator('body').innerText() }, null, 2))
  expect(failures).toEqual([])
  expect(responses.filter(row => row.status >= 400 && !isHandledHttpResponse(row))).toEqual([])
})

test('Perú: crea, aprueba y recibe una compra desde la interfaz real', async ({ page, context, browser }) => {
  test.setTimeout(240000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1' || process.env.E2E_ISOLATED_BROWSER === '1') {
    throw new Error('Esta prueba exige API y PostgreSQL locales reales')
  }
  const outputDir = path.resolve(process.env.LOCAL_INTEGRATED_OUTPUT_DIR || '../../artifacts/peru-integrated-local')
  const responses: Array<{ path: string; status: number }> = []
  const failures: string[] = []
  const prepare = async (targetContext: BrowserContext, targetPage: Page, email: string) => {
    targetPage.setDefaultTimeout(20000)
    targetPage.setDefaultNavigationTimeout(30000)
    await targetContext.route('**/*', route => {
      const url = new URL(route.request().url())
      return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? route.continue() : route.abort('blockedbyclient')
    })
    targetPage.on('pageerror', error => failures.push(error.message))
    targetPage.on('response', response => {
      const url = new URL(response.url())
      if (url.pathname.includes('/api/') || url.pathname.startsWith('/backend/')) responses.push({ path: url.pathname, status: response.status() })
    })
    await targetPage.goto('/login/')
    await targetPage.locator('#email').fill(email)
    await targetPage.locator('#password').fill('Local-Peru-2026-Only!')
    await submitLocalLogin(targetPage)
    await targetPage.waitForURL('**/dashboard/**', { timeout: 30000 })
    await targetPage.waitForLoadState('networkidle')
  }
  const waitPost = (target: Page, suffix: string) => target.waitForResponse(response =>
    new URL(response.url()).pathname.replace(/\/$/, '').endsWith(suffix) && response.request().method() === 'POST')
  const approverContext = await browser.newContext({ baseURL: process.env.BASE_URL })
  try {
    await prepare(context, page, 'peru-integrated-1@example.test')
    await page.goto('/dashboard/compras/ordenes/nueva/')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Número de Orden').fill(`OC-UI-${Date.now()}`)
    await page.getByLabel('Proveedor', { exact: false }).selectOption({ label: 'Proveedor integración local SAC - 20123456786' })
    const warehouse = await page.locator('#ocwizard-almacen-destino option').nth(1).getAttribute('value')
    expect(warehouse).toBeTruthy()
    await page.getByLabel('Almacén Destino').selectOption(warehouse!)
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await page.getByLabel('Producto', { exact: true }).selectOption({ label: 'Cuaderno A4 96 hojas' })
    await page.getByLabel('Cantidad', { exact: true }).fill('2')
    await page.getByLabel('Precio Unit.', { exact: true }).fill('5')
    await page.getByRole('button', { name: 'Agregar producto', exact: true }).click()
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await page.screenshot({ path: path.join(outputDir, 'purchase-review.png'), fullPage: true })
    const createdResponse = waitPost(page, '/api/compras/ordenes')
    await page.getByRole('button', { name: 'Crear Orden de Compra', exact: true }).click()
    const response = await createdResponse
    expect(response.status()).toBe(201)
    const order = (await response.json()).data
    expect(Number(order.total)).toBe(11.8)
    await page.waitForURL('**/dashboard/compras/ordenes/')

    const approverPage = await approverContext.newPage()
    await prepare(approverContext, approverPage, 'peru-integrated-approver-1@example.test')
    await approverPage.goto(`/dashboard/compras/ordenes/${order.id}/`)
    await approverPage.getByRole('button', { name: 'Aprobar Orden', exact: true }).click()
    await approverPage.getByLabel('Comentarios (opcional)').fill('Aprobación desde segunda sesión de usuario local')
    const approvalResponse = waitPost(approverPage, `/api/compras/ordenes/${order.id}/aprobar`)
    await approverPage.getByRole('dialog').getByRole('button', { name: 'Aprobar orden', exact: true }).click()
    expect((await approvalResponse).status()).toBe(200)
    await expect(approverPage.getByRole('button', { name: 'Crear Recepción', exact: true })).toBeVisible()
    await approverPage.screenshot({ path: path.join(outputDir, 'purchase-approved.png'), fullPage: true })

    await page.goto(`/dashboard/compras/ordenes/${order.id}/`)
    await page.getByRole('button', { name: 'Crear Recepción', exact: true }).click()
    await page.getByLabel('Cantidad recibir', { exact: true }).fill('2')
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await page.locator('#recepcionwizard-almacen').selectOption(warehouse!)
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
    await page.screenshot({ path: path.join(outputDir, 'receipt-review.png'), fullPage: true })
    const closeResponse = page.waitForResponse(response => /\/api\/compras\/recepciones\/[^/]+\/cerrar\/?$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Completar Recepción', exact: true }).click()
    const receiptResponse = await closeResponse
    expect(receiptResponse.status()).toBe(200)
    const receipt = await receiptResponse.json()
    expect(receipt.estado).toBe('CERRADA')
    await page.waitForURL('**/dashboard/compras/recepciones/')
    await page.goto(`/dashboard/compras/ordenes/${order.id}/`)
    await expect(page.getByText('Recibida', { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: path.join(outputDir, 'purchase-received.png'), fullPage: true })
    await fs.writeFile(path.join(outputDir, 'browser-purchase.json'), JSON.stringify({ order_id: order.id, receipt_id: receipt.id, total: order.total }, null, 2))
    expect(failures).toEqual([])
    expect(responses.filter(row => row.status >= 400 && !isHandledHttpResponse(row))).toEqual([])
  } finally {
    await fs.writeFile(path.join(outputDir, 'browser-purchase-http.json'), JSON.stringify({ responses, failures }, null, 2))
    await approverContext.close()
  }
})


test('Perú: retoma preparación logística tras fallo de packing y recarga', async ({ page, context }) => {
  test.setTimeout(180000)
  page.setDefaultTimeout(20000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  const origin = new URL(process.env.LOCAL_API_URL!)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('API local requerida')
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  await page.goto('/login/')
  await page.locator('#email').fill('peru-integrated-2@example.test')
  await page.locator('#password').fill('Local-Peru-2026-Only!')
  const authResponse = page.waitForResponse(r => r.url().includes('/api/auth/login') && r.status() === 201)
  await submitLocalLogin(page)
  const token = (await (await authResponse).json()).access_token
  await page.waitForURL('**/dashboard/**')
  const headers = { authorization: `Bearer ${token}` }
  const api = async (endpoint: string, body?: unknown) => {
    const response = body === undefined
      ? await page.request.get(new URL(`/api/${endpoint}`, origin).href, { headers })
      : await page.request.post(new URL(`/api/${endpoint}`, origin).href, { headers, data: body })
    expect(response.ok(), await response.text()).toBeTruthy()
    return response.json()
  }
  const products = (await api('pos/productos')).data
  const clients = (await api('pos/clientes')).data
  const product = products.find((row: any) => row.codigo === 'DEMO-003')
  const order = (await api('ventas/pedidos', { cliente_id: clients[0].id,
    detalle: [{ producto_id: product.id, descripcion: product.nombre, cantidad: 1, precio_unitario: 20 }] })).data
  await api(`ventas/pedidos/${order.id}/confirmar`, {})
  const pendingRoute = /\/api\/inventario\/logistica\/ordenes-pendientes\/?$/
  await context.route(pendingRoute, route => route.fulfill({ status: 503, json: { message: 'Fallo local de consulta logística' } }))
  await page.goto('/dashboard/inventario/logistica/ordenes-pendientes/')
  await expect(page.getByRole('alert').filter({ hasText: 'Reintenta la consulta' })).toBeVisible()
  await expect(page.getByText('Todas las órdenes han sido procesadas')).toHaveCount(0)
  await context.unroute(pendingRoute)
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  let row = page.getByRole('row').filter({ hasText: order.numero })
  await row.getByRole('button', { name: 'Preparar', exact: true }).click()
  await page.locator(`[id="item-${order.detalle[0].id}"]`).check()
  const packingRoute = new RegExp(`/inventario/logistica/${order.id}/marcar-listo/?$`)
  await context.route(packingRoute, route => route.fulfill({ status: 503, json: { message: 'Fallo local de packing' } }))
  await page.getByRole('button', { name: 'Marcar como Listo', exact: true }).click()
  await expect(page.getByText('No se pudo marcar el pedido como listo', { exact: true }).first()).toBeVisible()
  await context.unroute(packingRoute)
  await page.reload()
  row = page.getByRole('row').filter({ hasText: order.numero })
  await row.getByRole('button', { name: 'Continuar preparación', exact: true }).click()
  await page.locator(`[id="item-${order.detalle[0].id}"]`).check()
  await page.screenshot({ path: path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'logistics-preparation-dialog.png'), fullPage: true })
  const [packed] = await Promise.all([
    page.waitForResponse(r => packingRoute.test(new URL(r.url()).pathname) && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Marcar como Listo', exact: true }).click(),
  ])
  expect(packed.ok(), await packed.text()).toBeTruthy()
  await expect(row).toHaveCount(0)
  const ready = await api('inventario/logistica/listo-despacho')
  expect((ready.data ?? ready).some((value: any) => value.id === order.id && value.estado === 'LISTO_DESPACHO')).toBeTruthy()
  const events = await api(`inventario/logistica/${order.id}/eventos`)
  expect((events.data ?? events).filter((event: any) => event.tipo === 'PICKING')).toHaveLength(1)
  expect((events.data ?? events).filter((event: any) => event.tipo === 'PACKING')).toHaveLength(1)
  const backorders = await api(`inventario/logistica/${order.id}/backorders`)
  expect(backorders.data ?? backorders).toEqual([])
  await page.screenshot({ path: path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'logistics-recovered.png'), fullPage: true })
  expect(failures).toEqual([])
})
