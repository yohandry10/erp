import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { SignJWT } from 'jose'
import fs from 'node:fs/promises'

const user = {
  id: '53300000-0000-4000-8000-000000000090',
  tenant_id: '53300000-0000-4000-8000-000000000091',
  nombre: 'Revisión', apellido: 'Perú', email: 'peru-readiness@erp.local',
  roles: ['ADMIN'], is_super_admin: true,
}

async function installSession(context: BrowserContext, page: Page) {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('El navegador aislado necesita JWT_SECRET local inyectado')
    const token = await new SignJWT({ tenant_id: user.tenant_id, roles: user.roles, email: user.email })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime('10m')
      .sign(new TextEncoder().encode(secret))
    await context.addCookies([{ name: 'access_token', value: token, httpOnly: true,
      sameSite: 'Lax', url: process.env.BASE_URL || 'http://localhost:3001' }])
    await page.addInitScript((sessionUser) => {
      const snapshot = JSON.stringify({ user: sessionUser })
      localStorage.setItem('erp.auth.session.snapshot', snapshot)
      sessionStorage.setItem('erp.auth.session.snapshot', snapshot)
      localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin', 'superadmin']))
      localStorage.setItem('selectedCountry', '1')
    }, user)
}

test('Reportes Perú mantienen separados los totales PEN y USD', async ({ context, page }, testInfo) => {
  await installSession(context, page)
  const rows = ['PEN', 'USD'].map(moneda => ({
    moneda, total: moneda === 'PEN' ? 100 : 20, estado: 'FACTURADO', cantidad: 1, porcentaje: 50,
    cliente_id: 'same-client', cliente_nombre: 'Cliente multimoneda', cliente_documento: '20123456786',
    cantidad_pedidos: 1, cantidad_facturas: 1, periodo: '2026-09',
    producto_id: 'same-product', producto_nombre: 'Producto', producto_codigo: 'SKU-01', unidades_vendidas: 1,
    importe_total: moneda === 'PEN' ? 100 : 20, precio_promedio: moneda === 'PEN' ? 100 : 20,
    total_facturacion: moneda === 'PEN' ? 100 : 20, ticket_promedio: moneda === 'PEN' ? 100 : 20, porcentaje_total: 100,
    id: `quote-${moneda}`, numero: `COT-${moneda}`, fecha: '2026-09-01', fecha_vencimiento: '2026-09-30', dias_vigencia: 10,
  }))
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return route.abort()
    if (!url.pathname.includes('/api/')) return route.continue()
    const endpoint = url.pathname.replace(/^.*\/api\//, '/').replace(/\/$/, '')
    const payloads: Record<string, unknown> = {
      '/auth/profile': user,
      '/tenants/me': { data: { id: user.tenant_id, nombre: 'Empresa Perú', pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' } },
      '/demo/status': { is_demo: false, is_expired: false },
      '/notifications/unread': { data: [], count: 0 },
      '/usuarios-sistema/me/permissions': { data: [] },
      '/configuration/context/country': { data: { pais_id: 1, pais: 'PE', paisCodigo: 'PE', moneda: 'PEN', monedaDefecto: 'PEN', locale: 'es-PE', timezone: 'America/Lima' } },
      '/configuration/empresa': { success: true, data: { pais: 'PE', paisCodigo: 'PE', razonSocial: 'Empresa Perú', monedaDefecto: 'PEN' } },
      '/configuration/status': { success: true, data: { isComplete: true, isDemo: false, completionPercentage: 100 } },
    }
    const report = /\/(ventas-por-cliente|pedidos-por-estado|productos-mas-vendidos|top-clientes|cotizaciones-pendientes)$/.test(endpoint)
    const reportRows = endpoint.endsWith('/cotizaciones-pendientes')
      ? rows.map(row => ({ ...row, estado: 'BORRADOR' })) : rows
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report ? { success: true, data: reportRows } : payloads[endpoint] || { success: true, data: [] }) })
  })
  await page.goto('/dashboard/ventas/reportes/')
  for (const name of ['Ventas por Cliente', 'Pedidos', 'Productos', 'Top Clientes', 'Cotizaciones']) {
    await page.getByRole('tab', { name, exact: true }).click()
    const totals = page.getByRole('tabpanel').getByTestId('report-currency-totals')
    await expect(totals).toContainText('PEN 100.00')
    await expect(totals).toContainText('USD 20.00')
    await expect(totals).not.toContainText('120.00')
  }
  const quote = page.getByRole('row').filter({ hasText: 'COT-PEN' })
  await expect(quote).toContainText('01/09/2026')
  await expect(quote).toContainText('30/09/2026')
  await expect(quote).toContainText('Borrador')
  await page.screenshot({ path: testInfo.outputPath('report-currencies.png'), fullPage: true })
})

for (const laborReady of [false, true]) {
  test(`Configuración Perú muestra normativa ${laborReady ? 'vigente' : 'pendiente'} y SUNAT bloqueado con certificado inválido`, async ({ context, page }, testInfo) => {
    await installSession(context, page)

    const failures: string[] = []
    page.on('pageerror', error => failures.push(error.message))
    const empresa = {
      ruc: '20123456786', razonSocial: 'Empresa de prueba local', direccion: 'Av. Prueba 123',
      pais: 'PE', paisCodigo: 'PE', pais_id: 1, monedaDefecto: 'PEN',
      serieFactura: 'F001', serieBoleta: 'B001', emisionCpeModo: 'SUNAT_DIRECTO',
    }
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
        failures.push(`Petición fuera del entorno local: ${url.origin}`)
        return route.abort()
      }
      if (!url.pathname.includes('/api/')) return route.continue()
      const endpoint = url.pathname.replace(/^.*\/api\//, '/').replace(/\/$/, '')
      const payloads: Record<string, unknown> = {
        '/auth/profile': user,
        '/tenants/me': { data: { id: user.tenant_id, nombre: empresa.razonSocial, pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' } },
        '/demo/status': { is_demo: false, is_expired: false },
        '/notifications/unread': { data: [], count: 0 },
        '/usuarios-sistema/me/permissions': { data: [] },
        '/configuration/context/country': { data: { pais_id: 1, pais: 'PE', paisCodigo: 'PE', paisNombre: 'Perú', moneda: 'PEN', monedaDefecto: 'PEN', locale: 'es-PE', timezone: 'America/Lima' } },
        '/configuration/empresa': { success: true, data: empresa },
        '/configuration/status': { success: true, data: {
          isComplete: true, isDemo: false, completionPercentage: 100,
          ruc: { isConfigured: true }, certificate: { exists: true, isValid: false, rucMatches: true },
          fiscal: { isEnabled: true, isReady: false, missingItems: ['Certificado digital del cliente'] },
        } },
        '/configuracion/ose': { success: true, data: {
          verificacion: { valid: true },
          configuracion: { certificateExists: true, environment: 'produccion', connectivityStatus: 'NO_PROBADO' },
        } },
        '/rrhh/configuracion-laboral': { success: true, data: {
          pais: 'PE', moneda: 'PEN', readiness: { ready: laborReady, periodo: '2026-09', missing: laborReady ? [] : ['normativa peruana vigente por período'] },
        } },
      }
      if (!(endpoint in payloads)) {
        failures.push(`API sin contrato en esta prueba: ${endpoint}`)
        return route.fulfill({ status: 404, json: { message: 'API no prevista en prueba local' } })
      }
      return route.fulfill({ status: 200, json: payloads[endpoint] })
    })

    await page.goto('/dashboard/configuracion', { waitUntil: 'networkidle' })
    const labor = page.locator('section').filter({ has: page.getByRole('heading', { name: /RRHH/ }) })
    await expect(labor).toContainText(laborReady ? 'Correcto' : 'Requiere atención')
    await expect(labor).toContainText('2026-09')
    await expect(labor.getByRole('link', { name: 'Revisar RRHH Perú' })).toHaveAttribute('href', /\/dashboard\/configuracion\/rrhh\/?$/)
    const sunat = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Fiscal y certificado' }) })
    await expect(sunat).toContainText('Requiere atención')
    await expect(page.getByText(laborReady ? '100%' : '75%', { exact: true })).toBeVisible()
    expect(failures).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('configuracion-peru.png'), fullPage: true })
  })
}

for (const entity of ['clientes', 'proveedores'] as const) {
  test(`${entity}: exporta CSV y valida la importación antes de guardar; informa resultado parcial`, async ({ context, page }, testInfo) => {
    await installSession(context, page)
    const failures: string[] = []
    page.on('pageerror', error => failures.push(error.message))
    const imports: unknown[] = []
    let previews = 0
    let lists = 0
    const record = { id: '53300000-0000-4000-8000-000000000001', tenant_id: user.tenant_id,
      ruc: '20123456786', documento_numero: '20123456786', documento_tipo: 'RUC', tipo: 'EMPRESA',
      razon_social: '=Empresa, "local"', direccion: 'Av. Lima, 123', email: 'local@example.invalid', activo: true }
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) { failures.push(`Origen no local: ${url.origin}`); return route.abort() }
      if (!url.pathname.includes('/api/')) return route.continue()
      const endpoint = url.pathname.replace(/^.*\/api\//, '/').replace(/\/$/, '')
      const json = (body: unknown) => route.fulfill({ status: 200, json: body })
      if (endpoint === '/auth/profile') return json(user)
      if (endpoint === '/tenants/me') return json({ data: { id: user.tenant_id, nombre: 'Empresa local', pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' } })
      if (endpoint === '/demo/status') return json({ is_demo: false, is_expired: false })
      if (endpoint === '/notifications/unread') return json({ data: [], count: 0 })
      if (endpoint === '/usuarios-sistema/me/permissions') return json({ data: [] })
      if (endpoint === '/configuration/context/country') return json({ data: { pais_id: 1, pais: 'PE', monedaDefecto: 'PEN' } })
      if (endpoint === `/ventas/${entity}` || endpoint === `/compras/${entity}`) {
        lists++
        return json({ success: true, data: [record], count: 1, pagination: { total: 1, totalPages: 1 } })
      }
      if (endpoint === '/migration/preview') {
        previews++
        expect(route.request().postDataJSON().runType).toBe(entity)
        return json({ success: previews > 1, totalRows: 2,
          errors: previews > 1 ? [] : [{ rowIndex: 2, field: 'numero_documento', message: 'RUC inválido' }],
          headers: ['external_id', 'razon_social'], sample: [{ external_id: 'LOCAL-1', razon_social: 'Empresa local' }] })
      }
      if (endpoint === `/migration/${entity}/import`) {
        imports.push(route.request().postDataJSON())
        return json({ runId: 'local-run-1', status: 'partial', result: {
          created: 1, updated: 0, skippedRows: 0, errorRows: 1,
          errors: [{ rowIndex: 3, message: 'Documento ya registrado' }],
        } })
      }
      failures.push(`API no prevista: ${endpoint}`)
      return route.fulfill({ status: 404, json: { message: 'API no prevista' } })
    })
    await page.goto(`/dashboard/${entity === 'clientes' ? 'ventas' : 'compras'}/${entity}`, { waitUntil: 'networkidle' })
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar página (CSV)' }).click()
    const download = await downloaded
    expect(download.suggestedFilename()).toBe(`${entity}-pagina-1.csv`)
    const csv = await fs.readFile((await download.path())!, 'utf8')
    expect(csv).toContain('"\'=Empresa, ""local"""')
    expect(csv).toContain('"Av. Lima, 123"')
    await page.getByRole('button', { name: 'Importar', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const input = dialog.getByLabel('Archivo CSV UTF-8 (máximo 5 MiB)')
    await input.setInputFiles({ name: 'invalido.csv', mimeType: 'text/csv', buffer: Buffer.from('external_id,razon_social\nLOCAL-1,Empresa local') })
    await expect(dialog).toContainText('RUC inválido')
    await expect(dialog.getByRole('button', { name: `Confirmar importación de ${entity}` })).toBeDisabled()
    expect(imports).toHaveLength(0)
    await input.setInputFiles({ name: 'corregido.csv', mimeType: 'text/csv', buffer: Buffer.from('external_id,razon_social\nLOCAL-1,Empresa local\nLOCAL-2,Otra empresa') })
    await expect(dialog).toContainText('La vista previa no guarda registros')
    await expect(dialog.getByRole('button', { name: `Confirmar importación de ${entity}` })).toBeEnabled()
    expect(imports).toHaveLength(0)
    await dialog.getByRole('button', { name: `Confirmar importación de ${entity}` }).click()
    await expect(dialog).toContainText('Importación parcial')
    await expect(dialog).toContainText('1 creados, 0 actualizados, 0 omitidos y 1 con error')
    await expect(dialog).toContainText('Documento ya registrado')
    await expect(dialog.getByRole('button', { name: `Confirmar importación de ${entity}` })).toBeDisabled()
    expect(imports).toEqual([{ filename: 'corregido.csv', fileBase64: expect.any(String), dryRun: false }])
    expect(lists).toBeGreaterThan(1)
    await page.screenshot({ path: testInfo.outputPath(`importacion-${entity}.png`), fullPage: true })
    expect(failures).toEqual([])
  })
}

for (const view of ['reportes', 'orden'] as const) {
  test(`${view}: imprime contenido sin menú lateral ni controles`, async ({ context, page }, testInfo) => {
    await installSession(context, page)
    const failures: string[] = []
    page.on('pageerror', error => failures.push(error.message))
    const orderId = '53300000-0000-4000-8000-000000000001'
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) { failures.push(`Origen no local: ${url.origin}`); return route.abort() }
      if (!url.pathname.includes('/api/')) return route.continue()
      const endpoint = url.pathname.replace(/^.*\/api\//, '/').replace(/\/$/, '')
      const payloads: Record<string, unknown> = {
        '/auth/profile': user,
        '/tenants/me': { data: { id: user.tenant_id, nombre: 'Empresa local', pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' } },
        '/demo/status': { is_demo: false, is_expired: false },
        '/notifications/unread': { data: [], count: 0 },
        '/usuarios-sistema/me/permissions': { data: [] },
        '/configuration/context/country': { data: { pais_id: 1, pais: 'PE', monedaDefecto: 'PEN' } },
        '/configuracion-fiscal': { success: true, data: { tasa_igv: 0.18, moneda_principal: 'PEN', pais_id: 1, impuesto_principal_nombre: 'IGV', impuesto_principal_porcentaje: 0.18 } },
        '/reports/ventas': { data: [{ id: 'local-sale', fecha: '2026-09-05', estado: 'ACEPTADO', numero_documento: 'F001-1', tipo_documento: 'FACTURA', subtotal: 100, igv: 18, total: 118, moneda: 'PEN', clientes: { nombre: 'Cliente local', numero_documento: '20123456786' } }], resumen: { subtotal: 100, igv: 18, total: 118 } },
        [`/compras/ordenes/${orderId}`]: { success: true, data: { id: orderId, numero: 'OC-LOCAL-1', fecha_orden: '2026-09-05', created_at: '2026-09-05T10:00:00Z', updated_at: '2026-09-05T10:00:00Z', estado: 'RECIBIDA', subtotal: 100, igv: 18, total: 118, moneda: 'PEN', proveedor: { razon_social: 'Proveedor local', ruc: '20123456786' }, detalles: [{ id: 'line-1', producto_id: 'local-product', descripcion: 'Producto local', cantidad: 2, cantidad_recibida: 2, precio_unitario: 50, subtotal: 100 }] } },
        [`/compras/ordenes/${orderId}/aprobaciones`]: { success: true, data: [] },
        [`/compras/ordenes/${orderId}/recepciones`]: { success: true, data: [] },
      }
      if (!(endpoint in payloads)) { failures.push(`API no prevista: ${endpoint}`); return route.fulfill({ status: 404, json: {} }) }
      return route.fulfill({ status: 200, json: payloads[endpoint] })
    })
    await page.goto(view === 'reportes' ? '/dashboard/ventas/reportes' : `/dashboard/compras/ordenes/${orderId}`, { waitUntil: 'networkidle' })
    const content = page.locator('[data-print-page]')
    await expect(content).toContainText(view === 'reportes' ? 'F001-1' : 'OC-LOCAL-1')
    await page.evaluate(() => { (window as any).__printCalls = 0; window.print = () => { (window as any).__printCalls++ } })
    await page.getByRole('button', { name: 'Imprimir / PDF', exact: true }).click()
    expect(await page.evaluate(() => (window as any).__printCalls)).toBe(1)
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByTestId('dashboard-utility-bar')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Imprimir / PDF', exact: true })).toBeHidden()
    const main = page.locator('[data-dashboard-content]')
    await expect(main).toHaveCSS('margin-left', '0px')
    await expect(content).toContainText('118')
    await page.screenshot({ path: testInfo.outputPath(`impresion-${view}.png`), fullPage: true })
    expect(failures).toEqual([])
  })
}
