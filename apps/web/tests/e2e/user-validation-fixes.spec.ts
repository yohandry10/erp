import { fiscalCountryFixture } from './fixtures/fiscal-country'
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test'
import { SignJWT } from 'jose'

const user = {
  id: '59400000-0000-4000-8000-000000000001',
  tenant_id: '59400000-0000-4000-8000-000000000002',
  nombre: 'Validación', apellido: 'Usuario', email: 'validacion-usuario@erp.local',
  roles: ['ADMIN'], is_super_admin: true,
}
const producto = '59400000-0000-4000-8000-000000000003'
const almacen = '59400000-0000-4000-8000-000000000004'

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

const catalog = (data: unknown[], extra: Record<string, unknown> = {}) =>
  ({ success: true, complete: true, tenant_id: user.tenant_id, total: data.length, data, ...extra })

async function mockApi(page: Page, payloads: Record<string, unknown>, onRoute?: (endpoint: string, route: Route) => Promise<boolean>) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return route.abort()
    if (!url.pathname.includes('/api/')) return route.continue()
    const endpoint = url.pathname.replace(/^.*\/api\//, '/').replace(/\/$/, '')
    if (onRoute && await onRoute(endpoint, route)) return
    const base: Record<string, unknown> = {
      '/auth/profile': user,
      '/tenants/me': { data: { id: user.tenant_id, nombre: 'Empresa Perú', pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' } },
      '/demo/status': { is_demo: false, is_expired: false },
      '/notifications/unread': { data: [], count: 0 },
      '/usuarios-sistema/me/permissions': { data: [] },
      '/configuration/context/country': fiscalCountryFixture(user.tenant_id, { pais_id: 1, pais: 'PE', paisCodigo: 'PE', moneda: 'PEN', monedaDefecto: 'PEN', locale: 'es-PE', timezone: 'America/Lima' }),
      '/configuration/empresa': { success: true, data: { pais: 'PE', paisCodigo: 'PE', razonSocial: 'Empresa Perú', monedaDefecto: 'PEN' } },
      '/configuration/status': { success: true, data: { isComplete: true, isDemo: false, completionPercentage: 100 } },
    }
    const body = endpoint in payloads ? payloads[endpoint] : base[endpoint] ?? { success: true, data: [] }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

test('un ajuste rechazado por la base libera el formulario y explica el motivo', async ({ context, page }, testInfo) => {
  await installSession(context, page)
  let posts = 0
  await mockApi(page, {
    '/inventario/productos': catalog([{ id: producto, tenant_id: user.tenant_id, nombre: 'Audífonos', activo: true, es_servicio: false, controla_stock: true }], { include_sucursal: false }),
    '/inventario/almacenes': catalog([{ id: almacen, tenant_id: user.tenant_id, nombre: 'Principal', activo: true }]),
    '/gre/guias/catalogo-traslados': catalog([]),
  }, async (endpoint, route) => {
    if (endpoint !== '/inventario/movimientos' || route.request().method() !== 'POST') return false
    posts++
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({
      statusCode: 400, error: 'INVENTORY_NOT_APPLIED',
      message: 'No se pudo registrar el ajuste de inventario: el stock disponible es 19 y se solicitó retirar 100',
    }) })
    return true
  })
  await page.goto('/dashboard/inventario/operaciones/')
  await page.getByLabel('Producto del ajuste', { exact: true }).selectOption(producto)
  await page.getByLabel('Almacén del ajuste', { exact: true }).selectOption(almacen)
  await page.getByLabel('Diferencia del ajuste', { exact: true }).fill('-100')
  await page.getByLabel('Motivo del ajuste', { exact: true }).fill('Faltante de conteo')
  await page.getByRole('button', { name: 'Registrar ajuste y asiento', exact: true }).click()

  await expect(page.getByText('el stock disponible es 19 y se solicitó retirar 100')).toBeVisible()
  await expect(page.getByText('No se aplicó ningún cambio; corrige los datos y vuelve a enviar.')).toBeVisible()
  await expect(page.getByText('pendiente de confirmación')).toHaveCount(0)
  await expect(page.getByText('No se pudo confirmar el resultado original completo.')).toHaveCount(0)
  const delta = page.getByLabel('Diferencia del ajuste', { exact: true })
  await expect(delta).toBeEnabled()
  await delta.fill('-1')
  await expect(delta).toHaveValue('-1')
  expect(posts).toBe(1)
  expect(await page.evaluate((scope) => Object.keys(localStorage).filter(k => k.startsWith('erp.inventory-operation-intent.') && k.includes(scope)), user.tenant_id)).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('ajuste-no-aplicado.png'), fullPage: true })
})

test('el filtro de compras ofrece los estados reales de una orden', async ({ context, page }) => {
  await installSession(context, page)
  await mockApi(page, {
    '/compras/stats': { success: true, data: { version: 2, base: 'IMPORTES_ORIGINALES_SIN_CONVERSION', porMoneda: [{ moneda: 'PEN', totalCompras: '489.70', montoTotalMes: '371.70', comprasDelMes: 2 }], comprasDelMes: 2, ordenesActivas: 2, proveedoresActivos: 1, ordenesVencidas: 0 } },
  })
  await page.goto('/dashboard/compras/')
  const estado = page.getByRole('combobox', { name: 'Estado', exact: true })
  await expect(estado.locator('option')).toHaveText(['Todos los estados', 'Borrador', 'Pendiente', 'En aprobación', 'Aprobada', 'Parcial', 'Recibida', 'Rechazada', 'Anulada'])
  await expect(page.getByText(/PEN\s371\.70/, { exact: true })).toBeVisible()
})

test('Compras conserva los importes originales PEN/USD en el resumen y la lista', async ({ context, page }) => {
  await installSession(context, page)
  await mockApi(page, {
    '/compras/stats': { success: true, data: { version: 2, base: 'IMPORTES_ORIGINALES_SIN_CONVERSION', porMoneda: [
      { moneda: 'PEN', totalCompras: '472.00', montoTotalMes: '354.00', comprasDelMes: 1 },
      { moneda: 'USD', totalCompras: '73.11', montoTotalMes: '73.11', comprasDelMes: 3 },
    ], comprasDelMes: 4, ordenesActivas: 2, proveedoresActivos: 1, ordenesVencidas: 0 } },
    '/compras/ordenes': { success: true, data: [{ id: 'd57-order', numero: 'OC-USD-D57', moneda: 'USD', total: '24.37', estado: 'APROBADA', fecha_orden: '2026-11-04', proveedor: { razon_social: 'Proveedor D57' } }] },
  })
  await page.goto('/dashboard/compras/')
  await expect(page.getByText(/PEN\s354\.00/, { exact: true })).toBeVisible()
  await expect(page.getByText(/USD\s73\.11/, { exact: true })).toBeVisible()
  await expect(page.getByText('Importes originales por moneda', { exact: true })).toBeVisible()
  await expect(page.getByText(/427\.11/)).toHaveCount(0)
  const row = page.getByRole('row').filter({ hasText: 'OC-USD-D57' })
  await expect(row).toContainText(/(?:USD|US\$)\s*24\.37/)
  await expect(row).not.toContainText('S/ 24.37')
})

test('Compras muestra resumen no disponible y permite recuperar una lectura verificada', async ({ context, page }) => {
  await installSession(context, page)
  let unavailable = true
  const response = { success: true, data: { version: 2, base: 'IMPORTES_ORIGINALES_SIN_CONVERSION', porMoneda: [{ moneda: 'USD', totalCompras: '73.11', montoTotalMes: '73.11', comprasDelMes: 3 }], comprasDelMes: 3, ordenesActivas: 2, proveedoresActivos: 1, ordenesVencidas: 0 } }
  await mockApi(page, {}, async (endpoint, route) => {
    if (endpoint !== '/compras/stats') return false
    await route.fulfill({ status: unavailable ? 503 : 200, contentType: 'application/json', body: JSON.stringify(unavailable ? { message: 'Consulta no disponible' } : response) })
    return true
  })
  await page.goto('/dashboard/compras/')
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo verificar el resumen de compras' })).toBeVisible()
  await expect(page.getByText(/PEN\s0\.00|USD\s0\.00/, { exact: true })).toHaveCount(0)
  unavailable = false
  await page.getByRole('button', { name: 'Reintentar resumen', exact: true }).click()
  await expect(page.getByText(/USD\s73\.11/, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reintentar resumen', exact: true })).toHaveCount(0)
})

test('RRHH Perú no se declara lista sin el tope AFP del período', async ({ context, page }, testInfo) => {
  await installSession(context, page)
  await mockApi(page, {
    '/rrhh/configuracion-laboral': { success: true, data: {
      pais: 'PE', moneda: 'PEN',
      normativa: { periodo: '2026-11', uit: 5350, rmv: 1130, afp_remuneracion_max_asegurable: null },
      readiness: { ready: false, periodo: '2026-11', missing: ['remuneración máxima asegurable AFP de 2026-11'] },
      ready: false,
    } },
    '/rrhh/configuracion-laboral/peru/normativa': { success: true, data: {
      periodo: '2026-11', origen: 'GLOBAL', bloqueada: false, versiones: [],
      normativa: { periodo: '2026-11', uit: 5350, rmv: 1130, afp_remuneracion_max_asegurable: null },
    } },
  })
  await page.goto('/dashboard/configuracion/rrhh/')
  await expect(page.getByText('Falta: remuneración máxima asegurable AFP de 2026-11')).toBeVisible()
  await expect(page.getByText('Lista para operar')).toHaveCount(0)
  await expect(page.getByText('Normativa general disponible')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('rrhh-falta-tope-afp.png'), fullPage: true })
})

for (const caso of ['cruce', 'incierto'] as const) {
  test(`solicitud RRHH: un ${caso === 'cruce' ? 'cruce rechazado libera el formulario' : 'resultado incierto conserva el pendiente'}`, async ({ context, page }) => {
    await installSession(context, page)
    const empleado = '59400000-0000-4000-8000-000000000005'
    const persona = { id: empleado, tenant_id: user.tenant_id, nombres: 'María', apellidos: 'Demo', numero_documento: '45678912', estado: 'activo', activo: true }
    const aprobada = { id: '59400000-0000-4000-8000-000000000006', tenant_id: user.tenant_id, id_empleado: empleado, tipo: 'vacaciones',
      fecha_inicio: '2026-12-14', fecha_fin: '2026-12-16', dias: 3, estado: 'aprobada', motivo: 'Vacaciones de fin de año',
      aprobado_por: user.id, fecha_aprobacion: '2026-11-04T15:00:00.000Z', observaciones_aprobacion: null }
    let posts = 0
    await mockApi(page, {
      '/rrhh/empleados': { success: true, data: [persona] },
      '/rrhh/solicitudes': { success: true, data: [aprobada] },
    }, async (endpoint, route) => {
      if (endpoint !== '/rrhh/solicitudes' || route.request().method() !== 'POST') return false
      posts++
      await route.fulfill(caso === 'cruce'
        ? { status: 409, contentType: 'application/json', body: JSON.stringify({ statusCode: 409, error: 'RRHH_REQUEST_OVERLAP',
            message: 'El colaborador ya tiene una solicitud aprobada de vacaciones del 14/12/2026 al 16/12/2026 que se cruza con estas fechas' }) }
        : { status: 503, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, message: 'Servicio no disponible' }) })
      return true
    })
    await page.goto('/dashboard/rrhh/solicitudes/')
    await page.getByLabel('Empleado', { exact: true }).selectOption(empleado)
    await page.getByLabel('Tipo de solicitud', { exact: true }).selectOption('vacaciones')
    await page.getByLabel('Fecha inicial', { exact: true }).fill('2026-12-15')
    await page.getByLabel('Fecha final', { exact: true }).fill('2026-12-17')
    await page.getByLabel('Motivo', { exact: true }).fill('Segundo bloque')
    await page.getByRole('button', { name: 'Registrar solicitud', exact: true }).click()
    await expect.poll(() => posts).toBe(1)
    const pendiente = page.getByRole('button', { name: 'Reintentar operación pendiente', exact: true })
    const clave = `erp.rrhh-request.pending.v1.${user.tenant_id}:${user.id}`
    if (caso === 'cruce') {
      await expect(page.getByRole('alert').filter({ hasText: 'del 14/12/2026 al 16/12/2026' })).toContainText('No se registró nada')
      await expect(pendiente).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Registrar solicitud', exact: true })).toBeEnabled()
      await expect(page.getByLabel('Motivo', { exact: true })).toHaveValue('Segundo bloque')
      expect(await page.evaluate(k => localStorage.getItem(k), clave)).toBeNull()
    } else {
      await expect(pendiente).toBeVisible()
      expect(await page.evaluate(k => localStorage.getItem(k), clave)).not.toBeNull()
    }
  })
}
