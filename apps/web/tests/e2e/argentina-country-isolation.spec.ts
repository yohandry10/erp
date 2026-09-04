import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { SignJWT } from 'jose'
import fs from 'node:fs'
import path from 'node:path'

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
