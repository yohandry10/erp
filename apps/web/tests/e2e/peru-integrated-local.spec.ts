import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

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
  await page.locator('#nuevo-codigo').fill('LOCAL-COSTO-544')
  await page.locator('#nuevo-nombre').fill('Centro local de presupuesto')
  const [createdCenter] = await Promise.all([
    page.waitForResponse(r => /\/contabilidad\/centros-costo\/?$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Crear Centro de Costo', exact: true }).click(),
  ])
  expect(createdCenter.ok(), await createdCenter.text()).toBeTruthy()
  const center = (await createdCenter.json()).data
  await page.waitForURL('**/contabilidad/centros-costo/')
  await expect(page.getByText('Centro local de presupuesto', { exact: true }).first()).toBeVisible()
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
  const row = page.getByRole('row').filter({ hasText: 'Centro local de presupuesto' })
  await expect(row).toBeVisible()
  await row.getByTitle('Editar', { exact: true }).click()
  await expect(page.locator('#presupuesto-form-monto-presupuestado')).toHaveValue('1250.5')
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
  await page.getByRole('button', { name: 'Reintentar catálogos', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Actualizar Presupuesto', exact: true })).toBeEnabled()
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
  await expect(page.getByRole('heading', { name: 'Logs de Auditoría', exact: true })).toBeVisible()
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
  await expect(openCash).toBeVisible()
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
