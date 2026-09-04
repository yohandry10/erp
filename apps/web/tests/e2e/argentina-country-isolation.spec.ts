import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { SignJWT } from 'jose'
import fs from 'node:fs'
import path from 'node:path'
import { createSpreadsheetXml, formatCurrencyForExcel, formatPercentageForExcel } from '../../lib/excel-export'

const baseURL = process.env.BASE_URL || 'http://localhost:3001'

const user = {
  id: 'argentina-isolation-user',
  email: 'argentina-isolation@erp.local',
  nombre: 'Administradora',
  apellido: 'Argentina',
  roles: ['ADMIN'],
  tenant_id: 'argentina-isolation-tenant',
  is_super_admin: false,
}

const receiver = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  documento_tipo: 'DNI',
  documento_numero: '30111222',
  razon_social: 'Consumidor Final Argentina',
  direccion: 'Av. Corrientes 1234, CABA',
  arca_condicion_iva: 'CONSUMIDOR_FINAL',
}

const argentinaModuleRoutes = [
  ['Dashboard', '/dashboard/'],
  ['POS', '/dashboard/pos/'],
  ['Documentos', '/dashboard/documentos/'],
  ['Contabilidad', '/dashboard/contabilidad/'],
  ['Analytics', '/dashboard/analytics/'],
  ['Productos', '/dashboard/inventario/'],
  ['Categorías', '/dashboard/inventario/categorias/'],
  ['Almacenes', '/dashboard/inventario/almacenes/'],
  ['Recepciones', '/dashboard/inventario/recepciones/'],
  ['Kardex', '/dashboard/inventario/kardex/'],
  ['Ajustes y transferencias', '/dashboard/inventario/operaciones/'],
  ['Órdenes de preparación', '/dashboard/inventario/logistica/ordenes-pendientes/'],
  ['Listo para despacho', '/dashboard/inventario/logistica/listo-despacho/'],
  ['Comprobantes ARCA', '/dashboard/cpe/'],
  ['Compras', '/dashboard/compras/'],
  ['Clientes', '/dashboard/ventas/clientes/'],
  ['Cotizaciones', '/dashboard/ventas/cotizaciones/'],
  ['Pedidos', '/dashboard/ventas/pedidos/'],
  ['Aprobaciones', '/dashboard/ventas/aprobaciones/'],
  ['RMA', '/dashboard/ventas/rma/'],
  ['Cuentas por cobrar', '/dashboard/finanzas/cxc/'],
  ['Cuentas por pagar', '/dashboard/finanzas/cxp/'],
  ['Bancos', '/dashboard/finanzas/bancos/'],
  ['Tesorería', '/dashboard/finanzas/tesoreria/'],
  ['Conciliación', '/dashboard/finanzas/conciliacion/'],
  ['Reportes financieros', '/dashboard/finanzas/reportes/'],
  ['Usuarios', '/dashboard/usuarios/'],
  ['Recursos Humanos', '/dashboard/rrhh/'],
  ['Liquidaciones finales', '/dashboard/rrhh/liquidaciones/'],
  ['Configuración', '/dashboard/configuracion/'],
  ['Modo offline', '/dashboard/offline/'],
  ['Auditoría', '/dashboard/audit-logs/'],
  ['Ayuda', '/dashboard/ayuda/'],
] as const

const foreignJurisdictionTerms = [
  /\bSUNAT\b/iu,
  /\bDIAN\b/iu,
  /\bPLAME\b/iu,
  /\bT-Registro\b/iu,
  /\bCTS\b/iu,
  /\bSIRE\b/iu,
  /Guía de Remisión/iu,
  /\bBoleta\b/iu,
  /\bIGV\b/iu,
  /\bRUC\b/iu,
  /\bSoles\b/iu,
  /\bPEN\b/iu,
  /Perú/iu,
  /Colombia/iu,
] as const

function readJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  for (const envPath of [path.resolve(process.cwd(), '.env.local'), path.resolve(process.cwd(), '../../.env'), path.resolve(process.cwd(), '../erp-api/.env')]) {
    if (!fs.existsSync(envPath)) continue
    const line = fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((entry) => /^\s*JWT_SECRET=/.test(entry))
    if (line)
      return line
        .replace(/^\s*JWT_SECRET=/, '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
  }
  throw new Error('JWT_SECRET no está disponible para el E2E aislado de Argentina')
}

async function authenticate(context: BrowserContext, page: Page) {
  const token = await new SignJWT({
    tenant_id: user.tenant_id,
    email: user.email,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(readJwtSecret()))

  await context.addCookies([
    {
      name: 'access_token',
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser })
    window.localStorage.setItem('erp.auth.session.snapshot', session)
    window.sessionStorage.setItem('erp.auth.session.snapshot', session)
    window.localStorage.setItem('user', JSON.stringify(sessionUser))
    window.localStorage.setItem('selectedCountry', '5')
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']))
  }, user)
}

async function routeArgentinaApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })

    if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(user)
    if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
      return json({
        data: {
          pais_id: 5,
          pais: 'AR',
          paisCodigo: 'AR',
          monedaDefecto: 'ARS',
          igvPorcentaje: 21,
          isDemo: true,
          arcaPuntoVenta: 12,
          arcaCondicionIva: 'RESPONSABLE_INSCRIPTO',
        },
      })
    }
    if (/\/api\/configuration\/context\/status\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          isComplete: true,
          isDemo: true,
          completionPercentage: 100,
          missingItems: [],
          certificate: { exists: false, isValid: true },
          ruc: { isConfigured: true, missingFields: [] },
          fiscal: { isEnabled: false, isReady: true, missingItems: [] },
        },
      })
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) {
      return json({ is_demo: true, is_expired: false, dias_restantes: 10 })
    }
    if (/\/api\/cpe\/receptores\/?$/.test(pathname)) {
      return json({ success: true, data: [receiver] })
    }
    if (/\/api\/cpe\/comprobantes\/?$/.test(pathname) && request.method() === 'POST') {
      return json({ success: true, data: { id: 'cpe-argentina-created' } })
    }
    if (/\/api\/cpe\/comprobantes\/?$/.test(pathname)) {
      return json({ success: true, data: [] })
    }
    if (/\/api\/cpe\/stats\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          cpeEmitidosHoy: 0,
          cpeDelMes: 0,
          montoFacturado: 0,
          rechazados: 0,
        },
      })
    }
    if (/\/api\/rrhh\/dashboard\/?$/.test(pathname)) {
      return json({ success: true, data: {} })
    }
    return json({ success: true, data: [] })
  })
}

test.describe('Argentina · aislamiento jurisdiccional y factura ARCA', () => {
  test.beforeEach(async ({ context, page }) => {
    await authenticate(context, page)
    await routeArgentinaApi(page)
  })

  for (const [moduleName, route] of argentinaModuleRoutes) {
    test(`módulo ${moduleName} no expone otra jurisdicción`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      const body = page.locator('body')
      await expect(body).toContainText('Cerrar Sesión')
      await expect(body).not.toContainText('Preparando configuración fiscal')
      await expect(body).not.toContainText('Application error')
      for (const term of foreignJurisdictionTerms) {
        await expect(body).not.toContainText(term)
      }
    })
  }

  test('Documentos conserva clase y procedencia ARCA sin acciones fiscales heredadas', async ({ page }) => {
    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST') writes.push(request.url())
    })
    await page.route(/\/api\/documentos\/lista\/?(?:\?|$)/, (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [
        { id: 'demo', tipo_documento: 'FACTURA', serie: '00001', numero: '2', fecha_emision: '2026-09-04', receptor_razon_social: 'Muestra argentina', receptor_numero_doc: '30123456', total: 1210, moneda: 'ARS', estado: 'EMITIDO', arca: { cpe_id: 'cpe-demo', codigo: 6, estado: 'FIRMADO', is_demo: true } },
        { id: 'real', tipo_documento: 'FACTURA', serie: '00001', numero: '3', fecha_emision: '2026-09-04', receptor_razon_social: 'Factura autorizada', total: 1000, moneda: 'ARS', estado: 'EMITIDO', arca: { cpe_id: 'cpe-real', codigo: 11, estado: 'ACEPTADO', is_demo: false } },
        { id: 'legacy', tipo_documento: 'FACTURA', serie: '00001', numero: '4', fecha_emision: '2026-09-04', receptor_razon_social: 'Registro incompleto', total: 1000, moneda: 'ARS', estado: 'BORRADOR' },
      ] }),
    }))
    await page.goto('/dashboard/documentos/')
    const demo = page.getByRole('row').filter({ hasText: 'Muestra argentina' })
    await expect(demo).toContainText('Factura B')
    await expect(demo).toContainText('MUESTRA LOCAL · SIN VALIDEZ ARCA')
    const real = page.getByRole('row').filter({ hasText: 'Factura autorizada' })
    await expect(real).toContainText('Factura C')
    await expect(real).toContainText('Aceptado')
    const legacy = page.getByRole('row').filter({ hasText: 'Registro incompleto' })
    await expect(legacy).not.toContainText('Factura A')
    await expect(legacy).toContainText('Consultar en Centro ARCA')
    await expect(page.getByRole('button', { name: /^(Enviar|XML|Editar|Anular)$/ })).toHaveCount(0)
    await expect(page.getByRole('option', { name: 'Facturas B', exact: true })).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('Por enviar a ARCA')
    await demo.getByRole('button', { name: 'Ver en Centro ARCA' }).click()
    await expect(page).toHaveURL(/\/dashboard\/cpe\//)
    expect(writes.filter((url) => /\/api\/documentos\//.test(url))).toEqual([])
  })

  test('Compras guarda desde el modal con moneda y clave estable; conserva errores y no duplica líneas al reabrir', async ({ page }) => {
    const submissions: Record<string, any>[] = []
    let accept = false
    const supplier = { id: '11111111-1111-4111-8111-111111111111', nombre: 'Proveedor Argentina', razon_social: 'Proveedor Argentina', ruc: '30999888778' }
    const product = { id: '22222222-2222-4222-8222-222222222222', nombre: 'Café QA', precio: 100, afectacion_igv: '10' }
    await page.route(/\/api\/compras\/proveedores\/?(?:\?|$)/, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [supplier] }) }))
    await page.route(/\/api\/compras\/productos\/?(?:\?|$)/, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [product] }) }))
    await page.route(/\/api\/compras\/next-number\/?(?:\?|$)/, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { numero: 'OC-2026-001' } }) }))
    await page.route(/\/api\/compras\/ordenes\/?(?:\?|$)/, route => {
      if (route.request().method() !== 'POST') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
      submissions.push(route.request().postDataJSON())
      return route.fulfill({ status: accept ? 201 : 400, contentType: 'application/json', body: JSON.stringify(accept
        ? { success: true, data: { id: '33333333-3333-4333-8333-333333333333' } }
        : { message: 'Compra rechazada en QA: revise los datos y reintente.' }) })
    })
    await page.goto('/dashboard/compras/')
    await page.getByRole('button', { name: 'Nueva orden', exact: true }).first().click()
    await page.locator('#orden-compra-modal-proveedor-id').selectOption(supplier.id)
    await page.getByRole('combobox', { name: 'Producto', exact: true }).selectOption(product.id)
    // Seleccionar producto debe recalcular incluso sin editar precio/cantidad.
    await expect(page.getByText('Total: $ 121.00', { exact: true })).toBeVisible()
    await page.getByRole('spinbutton', { name: 'Cantidad', exact: true }).fill('10')
    await page.locator('#orden-compra-modal-fecha-entrega').fill('2026-09-07')
    await page.locator('#orden-compra-modal-observaciones').fill('QA compra con recepción parcial')
    await page.locator('#orden-compra-modal-moneda').selectOption('USD')
    await page.getByRole('button', { name: 'Crear Orden', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Compra rechazada en QA' })).toBeInViewport()
    await expect(page.getByRole('spinbutton', { name: 'Cantidad', exact: true })).toHaveValue('10')
    await expect(page.locator('#orden-compra-modal-observaciones')).toHaveValue('QA compra con recepción parcial')
    expect(submissions).toHaveLength(1)
    expect(submissions[0]).toMatchObject({ moneda: 'USD', idempotency_key: expect.stringMatching(/^[a-f0-9-]{36}$/), detalles: [{ producto_id: product.id, cantidad: 10, precio_unitario: 100 }] })
    expect(submissions[0]).not.toHaveProperty('items')
    expect(submissions[0]).not.toHaveProperty('total')
    accept = true
    await page.getByRole('button', { name: 'Crear Orden', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Nueva Orden de Compra', exact: true })).toHaveCount(0)
    expect(submissions).toHaveLength(2)
    expect(submissions[1]).toEqual(submissions[0])
    await page.getByRole('button', { name: 'Nueva orden', exact: true }).first().click()
    await expect(page.getByRole('combobox', { name: 'Producto', exact: true })).toHaveCount(1)
    await expect(page.locator('#orden-compra-modal-moneda')).toHaveValue('ARS')
    await expect(page.locator('#orden-compra-modal-observaciones')).toHaveValue('')
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await page.getByRole('button', { name: 'Nueva orden', exact: true }).first().click()
    await expect(page.getByRole('combobox', { name: 'Producto', exact: true })).toHaveCount(1)
    await page.locator('#orden-compra-modal-proveedor-id').selectOption(supplier.id)
    await page.locator('#orden-compra-modal-fecha-entrega').fill('2026-09-07')
    await page.getByRole('combobox', { name: 'Producto', exact: true }).selectOption(product.id)
    await page.getByRole('spinbutton', { name: 'Cantidad', exact: true }).fill('0')
    await page.getByRole('button', { name: 'Crear Orden', exact: true }).click()
    expect(submissions).toHaveLength(2)
    await page.getByRole('spinbutton', { name: 'Cantidad', exact: true }).fill('0.5')
    await page.getByRole('button', { name: 'Crear Orden', exact: true }).click()
    await expect.poll(() => submissions.length).toBe(3)
    expect(submissions[2].idempotency_key).not.toBe(submissions[0].idempotency_key)
    expect(submissions[2]).toMatchObject({ moneda: 'ARS', detalles: [{ cantidad: 0.5 }] })
  })

  test('el asiento conserva el borrador y explica el período faltante para corregir y reintentar', async ({ page }) => {
    const periodError = 'El período contable 2026-09 no existe. Debe crearse explícitamente antes de registrar movimientos.'
    const submissions: Record<string, unknown>[] = []
    let periodOpen = false
    await page.route(/\/api\/contabilidad\/plan-cuentas\/?(?:\?|$)/, (route) => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ success: true, data: [
        { id: '11111111-1111-4111-8111-111111111111', codigo: '101', nombre: 'Caja' },
        { id: '22222222-2222-4222-8222-222222222222', codigo: '50', nombre: 'Capital' },
      ] }),
    }))
    await page.route(/\/api\/contabilidad\/asiento-contable\/?$/, (route) => {
      submissions.push(route.request().postDataJSON())
      return route.fulfill({ status: periodOpen ? 200 : 400, contentType: 'application/json', body: JSON.stringify(periodOpen
        ? { success: true, data: { id: '33333333-3333-4333-8333-333333333333' } }
        : { message: periodError }) })
    })
    await page.goto('/dashboard/contabilidad/asientos/nuevo/')
    await page.locator('#asiento-form-fecha').fill('2026-09-04')
    await page.locator('#asiento-form-referencia').fill('QA-AR-CONT-001')
    await page.locator('#asiento-form-concepto').fill('Aporte de capital de prueba')
    await page.locator('select').nth(0).selectOption({ label: '101 - Caja' })
    await page.locator('select').nth(2).selectOption({ label: '50 - Capital' })
    await page.getByPlaceholder('Descripcion del movimiento').nth(0).fill('Ingreso de capital')
    await page.getByPlaceholder('Descripcion del movimiento').nth(1).fill('Contrapartida capital')
    await page.locator('input[type="number"]').nth(0).fill('1000')
    await page.locator('input[type="number"]').nth(3).fill('900')
    await expect(page.getByRole('button', { name: 'Guardar asiento', exact: true })).toBeDisabled()
    await page.locator('input[type="number"]').nth(3).fill('1000')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Guardar asiento', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: periodError })).toBeVisible()
    await expect(page.locator('#asiento-form-referencia')).toHaveValue('QA-AR-CONT-001')
    await expect(page.locator('input[type="number"]').nth(0)).toHaveValue('1000')
    await expect(page.getByRole('link', { name: 'Revisar períodos contables en otra pestaña' })).toHaveAttribute('target', '_blank')
    expect(submissions).toHaveLength(1)
    expect(submissions[0]).toMatchObject({ estado: 'BORRADOR', referencia: 'QA-AR-CONT-001' })
    periodOpen = true
    await page.getByRole('button', { name: 'Guardar asiento', exact: true }).click()
    await expect.poll(() => submissions.length).toBe(2)
    // El detalle se compila bajo demanda en el servidor local de esta suite.
    await expect(page).toHaveURL(/\/asientos\/33333333-3333-4333-8333-333333333333/, { timeout: 20000 })
    expect(submissions[1]).toEqual(submissions[0])
  })

  for (const superadmin of [false, true]) {
    test(`reapertura de período: ${superadmin ? 'superadmin conserva el rechazo del servidor' : 'usuario de tenant no recibe una acción reservada'}`, async ({ page }) => {
      if (superadmin) await page.route(/\/api\/auth\/profile\/?$/, (route) => route.fulfill({
        contentType: 'application/json', body: JSON.stringify({ ...user, is_super_admin: true }),
      }))
      await page.route(/\/api\/contabilidad\/periodos\/44444444-4444-4444-8444-444444444444\/?$/, (route) => route.fulfill({
        contentType: 'application/json', body: JSON.stringify({ success: true, data: {
          id: '44444444-4444-4444-8444-444444444444', anio: 2026, mes: 8, estado: 'CERRADO',
          fecha_cierre: '2026-09-04', created_at: '2026-09-04', updated_at: '2026-09-04',
        } }),
      }))
      let writes = 0
      await page.route(/\/api\/contabilidad\/periodos\/44444444-4444-4444-8444-444444444444\/reabrir\/?$/, (route) => {
        writes++
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Reapertura denegada por el servidor' }) })
      })
      await page.goto('/dashboard/contabilidad/periodos/44444444-4444-4444-8444-444444444444/')
      await expect(page.getByRole('heading', { name: 'Período Cerrado', exact: true })).toBeVisible({ timeout: 20000 })
      const reopen = page.getByRole('button', { name: 'Reabrir Período (Superadmin)', exact: true })
      if (!superadmin) {
        await expect(reopen).toHaveCount(0)
        expect(writes).toBe(0)
      } else {
        await reopen.click()
        await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
        await expect(page.getByRole('alert').filter({ hasText: 'Reapertura denegada por el servidor' })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Período Cerrado', exact: true })).toBeVisible()
        expect(writes).toBe(1)
      }
      await expect(page.locator('body')).not.toContainText('setiembre')
    })
  }

  test('la exportación conserva importes numéricos e identificadores de texto', () => {
    const xml = createSpreadsheetXml([{ name: 'Contabilidad AR', columns: [
      { header: 'Cuenta', key: 'cuenta' }, { header: 'Importe (ARS)', key: 'importe' },
      { header: 'Proporción', key: 'porcentaje' },
    ], data: [
      { cuenta: '00101', importe: formatCurrencyForExcel(1200.25), porcentaje: formatPercentageForExcel(21) },
      { cuenta: '=1+1 & <texto>', importe: formatCurrencyForExcel(-1200.25), porcentaje: formatPercentageForExcel(Number.NaN) },
    ] }])
    expect(xml).toContain('<Data ss:Type="Number">1200.25</Data>')
    expect(xml).toContain('<Data ss:Type="Number">-1200.25</Data>')
    expect(xml).toContain('<Data ss:Type="Number">0.21</Data>')
    expect(xml).toContain('<Data ss:Type="String">00101</Data>')
    expect(xml).toContain('<Data ss:Type="String">=1+1 &amp; &lt;texto&gt;</Data>')
    expect(xml).not.toMatch(/ss:Formula|NaN|Infinity/)
    expect(() => createSpreadsheetXml([{ name: 'Error', columns: [{ header: 'Monto', key: 'monto' }], data: [{ monto: formatCurrencyForExcel(Infinity) }] }])).toThrow('importe no válido')
  })

  test('los estados descargan moneda e importes utilizables y no dividen entre cero', async ({ page }, testInfo) => {
    await page.route(/\/api\/contabilidad\/estados\/estado-resultados\/?(?:\?|$)/, (route) => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ success: true, data: {
        ingresos: { ventas: 0, otros_ingresos: 0, total_ingresos: 0 },
        costos: { costo_ventas: 0, utilidad_bruta: 0 },
        gastos: { gastos_administrativos: 0, gastos_ventas: 0, gastos_financieros: 0, total_gastos: 0 }, utilidad_neta: 0,
      } }),
    }))
    await page.route(/\/api\/contabilidad\/estados\/balance-general\/?(?:\?|$)/, (route) => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ success: true, data: {
        activos: { corrientes: { efectivo: 1200, cuentas_por_cobrar: 0, inventarios: 0, otros_activos: 0, total_corrientes: 1200 },
          no_corrientes: { activos_fijos: 100, depreciacion_acumulada: 10, activos_fijos_neto: 90, otros_activos: 0, total_no_corrientes: 90 }, total_activos: 1290 },
        pasivos: { corrientes: { cuentas_por_pagar: 90, tributos_por_pagar: 0, remuneraciones_por_pagar: 0, otros_pasivos: 0, total_corrientes: 90 },
          no_corrientes: { deudas_largo_plazo: 0, otros_pasivos: 0, total_no_corrientes: 0 }, total_pasivos: 90 },
        patrimonio: { capital: 1200, resultados_acumulados: 0, resultado_ejercicio: 0, total_patrimonio: 1200 },
      } }),
    }))
    await page.goto('/dashboard/contabilidad/estados/')
    await page.getByRole('tab', { name: 'Balance General', exact: true }).click()
    await expect(page.getByText('Total activos', { exact: true }).first()).toBeVisible()
    const excelPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar Excel', exact: true }).click()
    const excel = await excelPromise
    await excel.saveAs(testInfo.outputPath('balance-general.xls'))
    const xml = fs.readFileSync((await excel.path())!, 'utf8')
    expect(xml).toContain('Monto (ARS)')
    expect(xml).toContain('<Data ss:Type="Number">1200</Data>')
    expect(xml).toContain('<Data ss:Type="Number">-10</Data>')
    expect(xml).not.toMatch(/\[object Object\]|ss:Type="String">1,200/)
    const pdfPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
    const pdf = await pdfPromise
    await pdf.saveAs(testInfo.outputPath('balance-general.pdf'))
    const pdfBytes = fs.readFileSync((await pdf.path())!)
    expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdfBytes.toString('latin1')).toContain('1.200,00')
    await page.getByRole('tab', { name: 'Estado de Resultados', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Estado de Resultados (P&L)', exact: true })).toBeVisible()
    const resultsPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
    const results = await resultsPromise
    await results.saveAs(testInfo.outputPath('estado-resultados-sin-ingresos.pdf'))
    const resultText = fs.readFileSync((await results.path())!).toString('latin1')
    expect(resultText).not.toMatch(/NaN|Infinity|100\.00%/)
    expect(resultText).toContain('No aplica')
  })

  test('el centro de ayuda sólo ofrece fichas y contenido argentinos', async ({ page }) => {
    await page.goto('/dashboard/ayuda/', { waitUntil: 'domcontentloaded' })
    const body = page.locator('body')
    await expect(body).toContainText('Cerrar Sesión')
    await expect(body).toContainText('Comprobantes ARCA')
    await expect(body).toContainText('Liquidaciones finales')

    const fichas = page.getByTestId('module-guide-entry')
    const total = await fichas.count()
    expect(total).toBeGreaterThan(0)

    await fichas.filter({ hasText: 'Comprobantes ARCA' }).click()
    await expect(body).toContainText('Facturas A, B o C')
    await fichas.filter({ hasText: 'Clientes' }).click()
    await expect(body).toContainText('CUIT, CUIL, CDI o DNI')

    for (let index = 0; index < total; index += 1) {
      await fichas.nth(index).click()
      for (const term of foreignJurisdictionTerms) {
        await expect(body).not.toContainText(term)
      }
    }
  })

  test('el menú y las rutas directas no pintan módulos de Perú o Colombia', async ({ page }) => {
    await page.goto('/dashboard/cpe/', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Comprobantes electrónicos' })).toBeVisible()
    await expect(page.getByText('Comprobantes ARCA', { exact: true })).toBeVisible()

    const body = page.locator('body')
    await expect(body).not.toContainText('SUNAT')
    await expect(body).not.toContainText('DIAN')
    await expect(body).not.toContainText('PLAME')
    await expect(body).not.toContainText('T-Registro')
    await expect(body).not.toContainText('CTS')
    await expect(page.getByRole('link', { name: 'GRE', exact: true })).toHaveCount(0)
    await expect(page.getByText('Reportes SIRE', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Liquidaciones finales', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Nueva NC / ND ARCA' }).click()
    await expect(page.getByRole('heading', { name: 'Nueva nota ARCA referenciada' })).toBeVisible()
    await expect(page.getByTestId('referenced-note-empty-state')).toContainText('factura electrónica autorizada con CAE')
    await expect(page.locator('body')).not.toContainText('SUNAT')
    await expect(page.locator('body')).not.toContainText('boleta')
    await expect(page.locator('body')).not.toContainText('IVAP')
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

    await page.goto('/dashboard/rrhh/planilla-electronica/', {
      waitUntil: 'networkidle',
    })
    await expect(page).toHaveURL(/\/dashboard\/rrhh\/?$/)
    await expect(page.getByRole('heading', { name: 'Recursos Humanos' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('PLAME')
    await expect(page.locator('body')).not.toContainText('T-Registro')
    await expect(page.locator('body')).not.toContainText('CTS')
  })

  test('la pantalla envía concepto, fechas y tributos, pero no punto ni identidad manipulables', async ({ page }) => {
    await page.goto('/dashboard/cpe/', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Nuevo comprobante' }).click()

    await expect(page.getByLabel('Punto de venta ARCA')).toHaveValue('00012')
    await expect(page.getByLabel('Punto de venta ARCA')).toHaveAttribute('readonly', '')
    await expect(page.getByLabel('Concepto ARCA *')).toBeVisible()
    await expect(page.getByLabel('Moneda').locator('option[value="USD"]')).toBeDisabled()
    await expect(page.getByText('La demo trabaja en ARS y no consulta servicios externos de ARCA.')).toBeVisible()

    await page.getByLabel('Buscar').focus()
    await page.getByRole('button', { name: /Consumidor Final Argentina/ }).click()
    await expect(page.getByText(/Clase resultante: B/)).toBeVisible()

    await page.getByLabel('Concepto ARCA *').selectOption('2')
    await page.getByLabel('Servicio desde *').fill('2026-09-01')
    await page.getByLabel('Servicio hasta *').fill('2026-09-30')
    await page.getByLabel('Vencimiento de pago *').fill('2026-10-10')
    await page.getByRole('button', { name: '+ Agregar tributo' }).click()
    await page.getByLabel('Base').fill('100')
    await page.getByLabel('Alícuota %').fill('3')
    await expect(page.getByLabel('Importe')).toHaveValue('3.00')

    await page.getByLabel('Descripción *').fill('Servicio profesional')
    await page.getByLabel('Valor Unitario *').fill('100')

    const requestPromise = page.waitForRequest((request) => request.method() === 'POST' && /\/api\/cpe\/comprobantes\/?$/.test(new URL(request.url()).pathname))
    await page.getByRole('button', { name: 'Crear Comprobante' }).click()
    const payload = (await requestPromise).postDataJSON()

    expect(payload).toMatchObject({
      cliente_id: receiver.id,
      arca_concepto: 2,
      arca_fecha_servicio_desde: '2026-09-01',
      arca_fecha_servicio_hasta: '2026-09-30',
      arca_fecha_vencimiento_pago: '2026-10-10',
      arca_tributos: [
        {
          id: 1,
          descripcion: 'Impuestos nacionales',
          base_imponible: 100,
          alicuota: 3,
          importe: 3,
        },
      ],
      totalIgv: 21,
      total: 124,
    })
    expect(payload).not.toHaveProperty('serie')
    expect(payload).not.toHaveProperty('clienteRuc')
    expect(payload).not.toHaveProperty('clienteTipoDocumento')
  })
})
